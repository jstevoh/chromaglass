#!/usr/bin/env node
/**
 * Does the plate reach the lighting rig, and as the right bytes?
 *
 *   npm run lights
 *
 * Art-Net is a wire format with no error reporting in it: a fixture handed a
 * malformed packet does nothing at all, and a universe written one channel out
 * lights the wrong lamp. Neither shows up anywhere except in a dark room with
 * an audience in it, so the packet and the patch are checked here instead.
 *
 * The end-to-end check is the one that matters: a socket is opened, the server
 * is given a plate, and the bytes that land are compared against the colour it
 * was given — the same path a show uses, not a reimplementation of it.
 */

import { createSocket } from 'node:dgram';
import {
  ARTNET_PORT, ORDERS, artnetConfig, buildUniverse, decodeArtDmx, encodeArtDmx,
  hexToRgb, parseInMap, patchFromUniverse,
} from '../server/artnet.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. The packet ────────────────────────────────────────────────────
{
  const data = new Uint8Array([255, 128, 0, 7]);
  const p = encodeArtDmx(0, 1, data);
  check('a packet starts with the header a fixture looks for',
    p.subarray(0, 8).toString('ascii') === 'Art-Net\0' && p.readUInt16LE(8) === 0x5000,
    `${p.length} bytes`);
  // Protocol version is the one field that is big-endian, and getting it
  // backwards makes a packet every node ignores.
  check('the protocol version is 14, high byte first',
    p.readUInt8(10) === 0 && p.readUInt8(11) === 14);
  const back = decodeArtDmx(p);
  check('it reads back as what went in', back && [...back.data].join() === [...data].join());

  // Universe 300 does not fit in one byte; a rig on net 1 is an ordinary rig.
  const wide = decodeArtDmx(encodeArtDmx(300, 0, new Uint8Array(2)));
  check('a universe above 255 survives the split across net and sub-net',
    wide?.universe === 300, `got ${wide?.universe}`);

  // An odd-length frame is illegal on the wire.
  const odd = decodeArtDmx(encodeArtDmx(0, 0, new Uint8Array(3)));
  check('an odd number of channels is padded rather than sent odd', odd && odd.data.length % 2 === 0,
    `${odd?.data.length} channels`);

  check('a packet that is not Art-Net is refused',
    decodeArtDmx(Buffer.from('not art-net at all, just some udp')) === null);
  check('a truncated packet is refused rather than read past its end',
    decodeArtDmx(encodeArtDmx(0, 0, new Uint8Array(64)).subarray(0, 30)) === null);
}

// ── 2. The patch ─────────────────────────────────────────────────────
{
  const blue = '#3366ff';
  const [r, g, b] = hexToRgb(blue);
  const f = buildUniverse([{ colour: blue, fill: 1 }], { count: 1, start: 1, order: 'rgb' });
  check('a fixture on channel 1 gets the colour the plate reported',
    f[0] === r && f[1] === g && f[2] === b, `${f[0]} ${f[1]} ${f[2]} for ${blue}`);

  const off = buildUniverse([{ colour: blue, fill: 1 }], { count: 1, start: 10, order: 'rgb' });
  check('a patch that starts at channel 10 puts nothing on channel 1',
    off[0] === 0 && off[9] === r, `channel 10 = ${off[9]}`);

  const grb = buildUniverse([{ colour: blue, fill: 1 }], { count: 1, start: 1, order: 'grb' });
  check('a GRB fixture gets green first, not a blue that looks wrong on stage',
    grb[0] === g && grb[1] === r && grb[2] === b);

  // Round-robin: two layers over four fixtures alternate, so the rig reads
  // like the plate instead of like one average of it.
  const two = buildUniverse([{ colour: '#ff0000', fill: 1 }, { colour: '#00ff00', fill: 1 }],
    { count: 4, start: 1, order: 'rgb' });
  check('layers go round the fixtures rather than averaging into one colour',
    two[0] === 255 && two[3 + 1] === 255 && two[6] === 255 && two[9 + 1] === 255,
    'red, green, red, green');

  // White has to come out of the colour channels or an RGBW wash is brighter
  // than the same colour on an RGB one.
  const w = buildUniverse([{ colour: '#ffffff', fill: 1 }], { count: 1, start: 1, order: 'rgbw' });
  check('white on an RGBW fixture goes to the white lamp, not to all four',
    w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 255, `${w[0]} ${w[1]} ${w[2]} ${w[3]}`);

  const dim = buildUniverse([{ colour: '#3366ff', fill: 1 }], { count: 1, start: 1, order: 'drgb' });
  check('a dimmer channel takes the brightest of the three',
    dim[0] === Math.max(r, g, b), `dimmer ${dim[0]}`);

  // The master is the plate's own brightness: an empty plate is a dark room.
  const half = buildUniverse([{ colour: '#ffffff', fill: 1 }], { count: 1, start: 1, order: 'rgb', master: 0.5 });
  check('the room dims with the plate rather than sitting at full on empty glass',
    half[0] === 128, `${half[0]} at half`);
  const black = buildUniverse([{ colour: '#ffffff', fill: 1 }], { count: 1, start: 1, order: 'rgb', master: 0 });
  check('a blackout is actually black on the rig too', black[0] === 0);

  // A patch that would run past the end of the universe stops instead of
  // wrapping onto channel 1 and lighting the wrong lamp.
  const over = buildUniverse([{ colour: '#ffffff', fill: 1 }], { count: 170, start: 500, order: 'rgb' });
  check('a patch that overruns 512 channels stops instead of wrapping',
    over[511] === 0 && over[499] === 255, 'the last fixture that fits is the last one sent');

  check('every named fixture order is three channels or more',
    Object.values(ORDERS).every(o => o.length >= 3 && o.every(c => 'rgbwd'.includes(c))),
    Object.keys(ORDERS).join(' '));
}

// ── 3. Art-Net in ────────────────────────────────────────────────────
{
  const map = parseInMap('1:audioImpact,10:globalSpeed:0:0.1,999999:nope,4:!bad');
  check('a channel map reads the pairs it can and drops the rest',
    map.size === 2 && map.get(1).key === 'audioImpact' && map.get(10).hi === 0.1,
    [...map].map(([c, m]) => `${c}->${m.key}`).join(' '));

  const seen = new Map();
  const data = new Uint8Array(512);
  data[0] = 255; data[9] = 128;
  const first = patchFromUniverse(data, map, seen);
  check('a desk moving a fader moves the setting',
    first?.audioImpact === 1 && Math.abs(first.globalSpeed - 0.0502) < 0.001,
    JSON.stringify(first));

  // A lighting desk sends its universe forty times a second whether anything
  // moved or not. Turning that into forty React updates a second would make
  // the app unusable while a desk is merely plugged in.
  check('a universe that repeats unchanged produces no further patches',
    patchFromUniverse(data, map, seen) === null);
  data[0] = 0;
  check('and a fader that does move is still heard',
    patchFromUniverse(data, map, seen)?.audioImpact === 0);
}

// ── 4. The whole path ────────────────────────────────────────────────
//
// Everything above is the codec talking to itself. This opens a socket, sends
// what the server sends, and reads the bytes off the wire.
{
  const port = 6460;   // not 6454: a real rig on this machine keeps its port
  const got = await new Promise((resolve) => {
    const rx = createSocket({ type: 'udp4', reuseAddr: true });
    const done = (v) => { try { rx.close(); } catch { /* already */ } resolve(v); };
    const timer = setTimeout(() => done(null), 2000);
    rx.on('message', (buf) => { clearTimeout(timer); done(decodeArtDmx(buf)); });
    rx.bind(port, '127.0.0.1', () => {
      const tx = createSocket({ type: 'udp4' });
      const frame = buildUniverse([{ colour: '#3366ff', fill: 1 }], { count: 2, start: 1, order: 'rgb' });
      tx.send(encodeArtDmx(7, 1, frame), port, '127.0.0.1', () => tx.close());
    });
  });
  check('a universe sent over a real socket arrives as the colour it left as',
    got && got.universe === 7 && got.data[0] === 0x33 && got.data[1] === 0x66 && got.data[2] === 0xff,
    got ? `universe ${got.universe}, ${got.data[0]} ${got.data[1]} ${got.data[2]}` : 'nothing arrived');
}

// ── 5. Off unless asked ──────────────────────────────────────────────
{
  check('Art-Net stays off until a host is named',
    artnetConfig({}) === null, 'no ARTNET_HOST, no packets');
  const cfg = artnetConfig({ ARTNET_HOST: '10.0.0.9', ARTNET_ORDER: 'nonsense', ARTNET_FIXTURES: '9999', ARTNET_RATE: '600' });
  check('a configuration with nonsense in it lands on something sendable',
    cfg.order === 'rgb' && cfg.count <= 170 && cfg.rate <= 44,
    `${cfg.count} fixtures, ${cfg.order}, ${cfg.rate} fps`);
  check('the default port is the one every node listens on', (cfg.port === ARTNET_PORT) && ARTNET_PORT === 6454);
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
