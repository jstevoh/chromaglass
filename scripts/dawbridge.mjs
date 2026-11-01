#!/usr/bin/env node
/**
 * Does the DAW bridge carry a DAW's automation, transport and audio to the plate?
 *
 *   npm run dawbridge -- --owed=app            as CI runs it until 13.7a ships
 *   npm run dawbridge -- --node                the server and the page's libs, no browser
 *   npm run dawbridge -- --plugin              on a Mac with the plugin built: its
 *                                              self-test's packets, and auval
 *
 * PLAN 13.7 (docs/plan/13-vj-software.md, step 7) and its contract, docs/dawbridge.md.
 * The plugin and the app's half of the bridge are built apart, by different hands, so
 * this is written first, from the contract alone, and is red on main: each half turns
 * its own lines green and takes its id out of --owed.
 *
 * It stands in for the plugin. It starts the real show server with a Pro licence, as
 * a Pro buyer's Mac app does, and sends what the plugin sends (OSC over UDP to
 * 127.0.0.1), with its own OSC encoder written here from the spec rather than borrowed
 * from the server, so the two cannot agree on a mistake. Where the page would be, a
 * WebSocket with the display key; then the built app itself. Five parts:
 *
 *   1. The server's wires (`app`): the hello, a slot, the transport and the audio
 *      reach the display as the contract's messages, in time, every sample as sent;
 *      the page's slot names reach the plugin; one plugin at a time; bye and quiet
 *      let go; the phones never get the audio; nothing from the network.
 *   2. A show that is not Pro (`app`): the bridge takes nothing and says locked.
 *   3. The page's libs (`app`): the CGPC frame decoded, a slot through MIDI learn's
 *      binding map at full resolution, transport as a tempo source ranked under Link
 *      and over a tap, each beat where it is heard.
 *   4. The built app (`app`, not with --node): a slot moves the setting it is learned
 *      to, the DAW's tempo becomes the show's, and the ear hears the DAW's audio.
 *   5. The plugin (`plugin`, only with --plugin, on a Mac with it built): its
 *      protocol header says what the contract says, its self-test's packets pass the
 *      same wires, and auval passes.
 *
 * What no fake can say is that Live and Logic load the plugin, automate a slot and play
 * the plate on the bar. That is the owner's sitting on the Mac (docs/judging.md).
 *
 * --owed: a line is excused only in main's state (no server/dawBridge.js and no
 * src/lib/dawBridge.ts for `app`; no plugin/dawbridge/ for `plugin`) and printed as
 * owed. An owed line that passes is red until its id is taken out, and any line is red
 * once its half exists and it fails.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import WebSocket from 'ws';
import { signLicenseKey } from '../server/license-key.js';
import { TempoSource } from '../src/lib/tempo.ts';
import { curveOf, valueAt } from '../src/lib/midi.ts';

const NODE_ONLY = process.argv.includes('--node');
const PLUGIN = process.argv.includes('--plugin');
const PORT = Number(process.env.DAWBRIDGE_PORT ?? 5311);
// Not 9024: a real plugin and app on this machine keep theirs.
const BRIDGE = PORT + 3713;
const FREE_PORT = PORT + 1;
const FREE_BRIDGE = BRIDGE + 1;
// The contract's numbers (docs/dawbridge.md), written here, not read from either half.
const SLOTS = 32, CONTRACT_PORT = 9024, PROTOCOL = 1;
const A = (s) => `/chromaglass/bridge/${s}`;
const ADDRESSES = ['hello', 'slot', 'transport', 'pcm', 'bye', 'names'].map(A);

const OWED_IDS = ['app', 'plugin'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const MAINS = {
  app: !existsSync('server/dawBridge.js') && !existsSync('src/lib/dawBridge.ts'),
  plugin: !existsSync('plugin/dawbridge'),
};

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
/** A line of one half, excused only while it is owed and that half is main's. */
function line(id, name, ok, detail = '') {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!MAINS[id]) return check(name, false, `${detail}; owed only while the ${id} half is main's, and it is not`);
  owedLines++;
  console.log(`owed  ${name}${detail ? ` — ${detail}` : ''}`);
}
let owedLines = 0;
const unknown = [...owed].filter((id) => !OWED_IDS.includes(id));
if (unknown.length) check('every id in --owed is a part of this check', false, `unknown: ${unknown.join(', ')}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => performance.now();

// ── OSC, from the OSC 1.0 spec ───────────────────────────────────────
//
// Strings NUL-terminated and padded to four bytes, numbers big-endian, a blob as its
// int32 size then its bytes padded to four. Arguments are tagged here by hand ({i},
// {f}, {s}, {b}) because the contract's types are exact: a bpm sent as an int would
// be a different message.
const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
const oscString = (s) => pad4(Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(1)]));
function osc(address, ...args) {
  let tags = ',';
  const parts = [];
  for (const a of args) {
    if ('s' in a) { tags += 's'; parts.push(oscString(a.s)); }
    else if ('b' in a) { tags += 'b'; const n = Buffer.alloc(4); n.writeInt32BE(a.b.length); parts.push(n, pad4(Buffer.from(a.b))); }
    else if ('i' in a) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a.i); parts.push(b); }
    else { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(a.f); parts.push(b); }
  }
  return Buffer.concat([oscString(address), oscString(tags), ...parts]);
}
const i = (v) => ({ i: v }), f = (v) => ({ f: v }), s = (v) => ({ s: v }), b = (v) => ({ b: v });
/** An OSC message of strings and numbers, for what the server sends the plugin. */
function readOsc(buf) {
  let at = 0;
  const str = () => { const end = buf.indexOf(0, at); const v = buf.toString('utf8', at, end); at = (end + 4) & ~3; return v; };
  const address = str();
  const tags = str();
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 's') args.push(str());
    else if (t === 'i') { args.push(buf.readInt32BE(at)); at += 4; }
    else if (t === 'f') { args.push(buf.readFloatBE(at)); at += 4; }
    else return { address, tags, args: null };
  }
  return { address, tags, args };
}

/**
 * A plugin instance: its own UDP socket, as each instance in a DAW has, so the server
 * can tell two apart by where their datagrams come from (the slots, the transport and
 * the audio carry no instance id). What it sends is the contract's table.
 */
async function makePlugin(bindTo = '127.0.0.1') {
  const sock = createSocket('udp4');
  const heard = [];
  sock.on('message', (m) => heard.push({ at: now(), ...readOsc(m) }));
  await new Promise((r) => sock.bind(0, bindTo, r));
  const send = (buf, port = BRIDGE, host = '127.0.0.1') => new Promise((r) => sock.send(buf, port, host, () => r()));
  return {
    sock, heard, send,
    hello: (instance, port = BRIDGE, host = '127.0.0.1') => send(osc(A('hello'), i(PROTOCOL), s(instance), s('Ableton Live 12'), f(48000), i(256)), port, host),
    slot: (n, v, port = BRIDGE) => send(osc(A('slot'), i(n), f(v)), port),
    bye: (instance, port = BRIDGE) => send(osc(A('bye'), s(instance)), port),
    transport({ playing = 1, bpm = 120, beat = 0, barBeat = ((beat % 4) + 4) % 4, num = 4, den = 4, ahead = 0 }, port = BRIDGE) {
      const whole = Math.floor(beat);
      return send(osc(A('transport'), i(playing), f(bpm), i(whole), f(beat - whole), f(barBeat), i(num), i(den), f(ahead)), port);
    },
    pcm: (channels, seq, samples, port = BRIDGE) => send(osc(A('pcm'), i(channels), i(48000), i(seq), b(pcmBlob(samples))), port),
  };
}
/** Interleaved float32 little-endian, as the contract's blob is. */
function pcmBlob(samples) {
  const out = Buffer.alloc(samples.length * 4);
  for (let k = 0; k < samples.length; k++) out.writeFloatLE(samples[k], k * 4);
  return out;
}
const pa = await makePlugin();
const pb = await makePlugin();
const pl = await makePlugin('0.0.0.0');

// ── The servers ──────────────────────────────────────────────────────

const temp = mkdtempSync(join(tmpdir(), 'cg-dawbridge-'));
let dist = resolve(process.env.DAWBRIDGE_DIST ?? 'dist');
if (NODE_ONLY) {
  // The server refuses to start with no build; its wires need none.
  dist = join(temp, 'dist');
  mkdirSync(dist);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>dawbridge</title>');
} else if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build at ${dist}: run "npm run build" first, or pass --node for the server and the libs alone.`);
  process.exit(1);
}

const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const publicJwk = JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
const proKey = await signLicenseKey({ tier: 'pro', email: 'dawbridge@example.com', id: 'lic-dawbridge-check' }, await crypto.subtle.exportKey('jwk', pair.privateKey));

const servers = [];
function startServer(port, bridge, env, name) {
  const server = spawn(process.execPath, ['server/remote-server.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      REMOTE_DIST: dist,
      SHOW_KEY_FILE: join(temp, `${name}-show-key`),
      CHROMAGLASS_LICENSE_FILE: join(temp, `${name}-license.json`),
      LICENSE_PUBLIC_KEY: publicJwk,
      OSC_PORT: '0',
      DAW_BRIDGE_PORT: String(bridge),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));
  servers.push(server);
  return { server, log };
}
let browser = null;
const finish = async (code) => {
  await browser?.close().catch(() => {});
  for (const sv of servers) { try { sv.kill('SIGTERM'); } catch { /* gone */ } }
  for (const p of [pa, pb, pl]) { try { p.sock.close(); } catch { /* closed */ } }
  rmSync(temp, { recursive: true, force: true });
  process.exit(code);
};
async function infoOf(port, log) {
  for (let end = Date.now() + 15_000; Date.now() < end;) {
    try { const r = await fetch(`http://127.0.0.1:${port}/remote-info.json`); if (r.ok) return await r.json(); } catch { /* not yet */ }
    await sleep(150);
  }
  console.error(`The show server did not start:\n${log.join('').slice(-1500)}`);
  return finish(1);
}
/** A socket on /remote-ws in a role, keeping every JSON message and every binary frame with when it came. */
async function join_(port, role, key) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/remote-ws`);
  const inbox = [], frames = [];
  ws.on('message', (d, isBinary) => {
    if (isBinary) frames.push({ at: now(), data: Buffer.from(d) });
    else { try { inbox.push({ at: now(), ...JSON.parse(String(d)) }); } catch { /* not ours */ } }
  });
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  ws.send(JSON.stringify({ type: 'hello', role, key }));
  await sleep(200);
  return { ws, inbox, frames };
}
async function waitFor(list, pred, ms, from = 0) {
  for (let end = now() + ms; ;) {
    const hit = list.slice(from).find(pred);
    if (hit || now() > end) return hit ?? null;
    await sleep(2);
  }
}

const pro = startServer(PORT, BRIDGE, { CHROMAGLASS_LICENSE_KEY: proKey }, 'pro');
const info = await infoOf(PORT, pro.log);
const licence = await fetch(`http://127.0.0.1:${PORT}/license-info.json`).then((r) => r.json()).catch(() => null);
check('the show server runs as Pro, as a Pro buyer\'s does', licence?.tier === 'pro', `tier ${licence?.tier}`);
line('app', 'its banner says the DAW bridge listens on 127.0.0.1 alone',
  new RegExp(`DAW bridge:\\s+udp 127\\.0\\.0\\.1:${BRIDGE}`).test(pro.log.join('')));

// ── 1. The server's wires ────────────────────────────────────────────

const display = await join_(PORT, 'display', info.displayKey);
const phone = await join_(PORT, 'controller', info.showKey ?? info.key);
check('a display with the display key is let in', display.ws.readyState === WebSocket.OPEN && !display.inbox.some((m) => m.type === 'denied'));
// The phone is there to show the audio is kept from phones; a phone the server turned
// away would show that of nothing.
check('a phone with the show key is let in', phone.ws.readyState === WebSocket.OPEN && !phone.inbox.some((m) => m.type === 'denied'));
// The followed plugin's hello once a second, as the plugin sends it, until its bye: a
// server that counts "quiet" by hellos must not drop it mid-part (docs/dawbridge.md).
const heartA = setInterval(() => { pa.hello('inst-a'); }, 1000);
{
  const sent = now();
  await pa.hello('inst-a');
  const m = await waitFor(display.inbox, (x) => x.type === 'daw' && x.on === true, 500);
  line('app', 'a hello reaches the display as the plugin it is: instance, host, rate, latency',
    m && m.instance === 'inst-a' && m.host === 'Ableton Live 12' && m.sampleRate === 48000 && m.latency === 256,
    m ? `${JSON.stringify({ instance: m.instance, host: m.host, sampleRate: m.sampleRate, latency: m.latency })} in ${(m.at - sent).toFixed(1)} ms` : 'no daw message');

  // The page's names for the slots go back to where the hello came from.
  const names = Array.from({ length: SLOTS }, (_, k) => (k === 3 ? 'Sound Drive' : k === 7 ? 'Go: Fillmore' : ''));
  const at = pa.heard.length;
  display.ws.send(JSON.stringify({ type: 'daw-names', names }));
  const n = await waitFor(pa.heard, (x) => x.address === A('names') && x.args?.[7] === 'Go: Fillmore', 500, at);
  line('app', 'the page\'s names for the slots reach the plugin as 32 strings',
    n && n.tags === ',' + 's'.repeat(SLOTS) && n.args?.every((v, k) => v === names[k]),
    n ? `${n.tags.length - 1} args, slot 4 "${n.args?.[3]}"` : 'nothing came back');
}
{
  // Twenty slot moves, each timed from the send to the display's arrival: a lane in
  // the DAW moving a setting must land in the frame it was written in.
  const delays = [];
  let exact = true;
  for (let k = 0; k < 20; k++) {
    const v = 0.123457 + k * 0.01;
    const at = display.inbox.length, t0 = now();
    await pa.slot(3, v);
    const m = await waitFor(display.inbox, (x) => x.type === 'daw-slot' && x.slot === 3, 200, at);
    if (!m) { delays.push(Infinity); exact = false; continue; }
    delays.push(m.at - t0);
    if (m.value !== Math.fround(v)) exact = false;
  }
  const worst = Math.max(...delays);
  line('app', 'a slot move reaches the display within a frame, at the float the plugin sent',
    worst < 16 && exact, `worst ${worst.toFixed(1)} ms of 20, ${exact ? 'every value exact' : 'a value changed on the way'}`);
}
{
  const at = display.inbox.length;
  // 2000.3 is not a float32: a server that rebuilds the position in single precision
  // is 0.03 beats out (15 ms at 128 bpm), which this sees.
  await pa.transport({ playing: 1, bpm: 128, beat: 2000.3, barBeat: 0.3, num: 4, den: 4, ahead: 0.0125 });
  const m = await waitFor(display.inbox, (x) => x.type === 'daw-transport', 200, at);
  line('app', 'the transport reaches the display with the song position whole again',
    m && m.playing === true && m.bpm === 128 && Math.abs(m.beat - (2000 + Math.fround(2000.3 - 2000))) < 1e-9 && m.barBeat === Math.fround(0.3) && m.num === 4 && m.den === 4 && m.ahead === Math.fround(0.0125),
    m ? JSON.stringify({ playing: m.playing, bpm: m.bpm, beat: m.beat, barBeat: m.barBeat, num: m.num, den: m.den, ahead: m.ahead }) : 'no daw-transport');
}
{
  // Two seconds of stereo at 48 kHz in 512-frame packets, paced as a DAW plays them:
  // a 60 Hz kick on each beat at 120 bpm, so the samples are not all the same number.
  const frames = 512, total = 48000 * 2;
  const sent = [];
  const t0 = now();
  for (let seq = 0; seq < total; seq += frames) {
    const samples = new Float32Array(frames * 2);
    for (let k = 0; k < frames; k++) {
      const t = (seq + k) / 48000, inBeat = t % 0.5;
      const v = inBeat < 0.12 ? Math.sin(2 * Math.PI * 60 * inBeat) * Math.exp(-inBeat * 25) : 0;
      samples[2 * k] = v; samples[2 * k + 1] = -v;
    }
    while (now() < t0 + (seq / 48000) * 1000) await sleep(1);
    sent.push({ seq, samples, at: now() });
    await pa.pcm(2, seq, samples);
  }
  await sleep(200);
  const got = display.frames.filter((fr) => fr.data.length >= 16 && fr.data.toString('ascii', 0, 4) === 'CGPC');
  let exact = got.length === sent.length, delays = [];
  for (let k = 0; k < Math.min(got.length, sent.length); k++) {
    const d = got[k].data;
    const head = d[4] === 2 && d.readUInt32LE(8) === 48000 && d.readUInt32LE(12) === sent[k].seq && d.length === 16 + sent[k].samples.length * 4;
    let same = head;
    for (let j = 0; same && j < sent[k].samples.length; j++) same = d.readFloatLE(16 + j * 4) === sent[k].samples[j];
    if (!same) exact = false;
    delays.push(got[k].at - sent[k].at);
  }
  delays.sort((x, y) => x - y);
  const p95 = delays.length ? delays[Math.floor(delays.length * 0.95)] : Infinity;
  line('app', 'the audio reaches the display as CGPC frames: none lost, every sample as sent',
    exact, `${got.length} of ${sent.length} packets${exact ? ', bit for bit' : ''}`);
  line('app', 'each audio packet within 5 ms (95th percentile)', p95 < 5, `p95 ${p95.toFixed(2)} ms`);
  line('app', 'the phones get none of the audio or the bridge\'s messages, which the display got',
    got.length > 0 && phone.frames.length === 0 && !phone.inbox.some((m) => String(m.type).startsWith('daw')),
    `display ${got.length} frames, phone ${phone.frames.length} frames and ${phone.inbox.filter((m) => String(m.type).startsWith('daw')).length} daw messages`);
}
{
  // A second instance (the plugin on two tracks) is ignored while the first lives.
  const at = display.inbox.length;
  await pb.hello('inst-b');
  await pb.slot(7, 0.5);
  await sleep(150);
  await pa.slot(5, 0.25);
  const ours = await waitFor(display.inbox, (x) => x.type === 'daw-slot' && x.slot === 5, 300, at);
  const theirs = display.inbox.slice(at).filter((x) => (x.type === 'daw-slot' && x.slot === 7) || (x.type === 'daw' && x.instance === 'inst-b'));
  line('app', 'a second plugin is ignored, its hello and its slot, while the first is followed',
    !!ours && theirs.length === 0, `followed still moves: ${!!ours}; from the second: ${theirs.map((x) => x.type).join(', ') || 'nothing'}`);
}
{
  const late = await join_(PORT, 'display', info.displayKey);
  const m = await waitFor(late.inbox, (x) => x.type === 'daw', 500);
  line('app', 'a display that joins late is told which plugin is there', m?.on === true && m.instance === 'inst-a', m ? JSON.stringify(m) : 'nothing');
  late.ws.close();
}
{
  let at = display.inbox.length, t0 = now();
  clearInterval(heartA);
  await pa.bye('inst-a');
  const off = await waitFor(display.inbox, (x) => x.type === 'daw' && x.on === false, 300, at);
  at = display.inbox.length;
  await pb.hello('inst-b');
  const next = await waitFor(display.inbox, (x) => x.type === 'daw' && x.on === true, 300, at);
  line('app', 'a bye lets go at once, and the next hello is followed',
    !!off && next?.instance === 'inst-b', `${off ? `off in ${(off.at - t0).toFixed(0)} ms` : 'never off'}; next ${next?.instance ?? 'none'}`);

  // inst-b now goes quiet: no bye, as when a DAW crashes.
  at = display.inbox.length; t0 = now();
  const quiet = await waitFor(display.inbox, (x) => x.type === 'daw' && x.on === false, 4500, at);
  const after = quiet ? quiet.at - t0 : Infinity;
  line('app', 'a plugin quiet for 3 s is let go', quiet && after > 2500 && after < 4000, quiet ? `after ${(after / 1000).toFixed(2)} s` : 'never');
}
{
  // Nothing from the network: the same hello to this machine's LAN address reaches
  // no socket, while to 127.0.0.1 it does.
  const lan = Object.values(networkInterfaces()).flat().find((n) => n && n.family === 'IPv4' && !n.internal)?.address;
  if (!lan) console.log('skip  a hello to the LAN address moves nothing — this machine has no LAN address');
  else {
    let at = display.inbox.length;
    await pl.send(osc(A('hello'), i(PROTOCOL), s('inst-lan'), s('LAN'), f(48000), i(0)), BRIDGE, lan);
    await sleep(300);
    const fromLan = display.inbox.slice(at).some((x) => x.type === 'daw' && x.instance === 'inst-lan');
    at = display.inbox.length;
    await pa.hello('inst-lan');
    const fromLoop = await waitFor(display.inbox, (x) => x.type === 'daw' && x.instance === 'inst-lan', 300, at);
    // And bound, not filtered: a server on 0.0.0.0 that drops what is not from loopback
    // passes the two above, but holds the port on the LAN address too, so a socket of
    // our own cannot take it there.
    const probe = createSocket('udp4');
    const bindErr = await new Promise((r) => { probe.once('error', (e) => r(e.code)); probe.bind(BRIDGE, lan, () => r(null)); });
    try { probe.close(); } catch { /* never bound */ }
    line('app', 'a hello to the LAN address moves nothing; the same to 127.0.0.1 does; the port is bound to loopback alone',
      !fromLan && !!fromLoop && bindErr === null, `LAN ${fromLan}, loopback ${!!fromLoop}, ${lan}:${BRIDGE} ${bindErr ?? 'free'}`);
    await pa.bye('inst-lan');
  }
}

// ── 2. A show that is not Pro ────────────────────────────────────────

{
  // No key, and the tiers enforced: unenforced, a show with no key runs as Pro.
  const free = startServer(FREE_PORT, FREE_BRIDGE, { CHROMAGLASS_ENFORCE_TIERS: '1', CHROMAGLASS_LICENSE_KEY: '' }, 'free');
  const freeInfo = await infoOf(FREE_PORT, free.log);
  const freeTier = (await fetch(`http://127.0.0.1:${FREE_PORT}/license-info.json`).then((r) => r.json()).catch(() => null))?.tier;
  check('the second show server runs as Free', freeTier && freeTier !== 'pro', `tier ${freeTier}`);
  const d = await join_(FREE_PORT, 'display', freeInfo.displayKey);
  await pa.hello('inst-free', FREE_BRIDGE);
  await pa.slot(3, 0.75, FREE_BRIDGE);
  const locked = await waitFor(d.inbox, (x) => x.type === 'daw' && x.locked === true, 500);
  await sleep(150);
  const leaked = d.inbox.some((x) => x.type === 'daw-slot' || (x.type === 'daw' && x.on === true));
  line('app', 'on a Free show the bridge takes nothing and tells the page it is locked',
    !!locked && !leaked, `locked ${!!locked}, slot or hello passed on ${leaked}`);
  d.ws.close();
}

// ── 3. The page's libs ───────────────────────────────────────────────

{
  const lib = await import('../src/lib/dawBridge.ts').catch((e) => ({ missing: e.message.split('\n')[0] }));
  const has = (k) => k in lib;
  line('app', 'src/lib/dawBridge.ts says the contract\'s numbers', lib.DAW_SLOTS === SLOTS && lib.DAW_PORT === CONTRACT_PORT && lib.DAW_PROTOCOL === PROTOCOL,
    lib.missing ?? `slots ${lib.DAW_SLOTS}, port ${lib.DAW_PORT}, protocol ${lib.DAW_PROTOCOL}`);

  let pcmOk = false, pcmDetail = 'no decodeDawPcm';
  if (has('decodeDawPcm')) {
    const samples = [0.5, -0.25, 1e-7, -1];
    const frame = Buffer.concat([Buffer.from('CGPC'), Buffer.from([2, 0, 0, 0]), Buffer.alloc(8), pcmBlob(samples)]);
    frame.writeUInt32LE(44100, 8); frame.writeUInt32LE(4096, 12);
    const r = lib.decodeDawPcm(new Uint8Array(frame));
    const bad = lib.decodeDawPcm(new Uint8Array(Buffer.from('{"type":"cast"}')));
    pcmOk = r && r.channels === 2 && r.sampleRate === 44100 && r.seq === 4096 && r.samples.length === 4 && r.samples.every((v, k) => v === Math.fround(samples[k])) && bad === null;
    pcmDetail = r ? `${r.channels} ch, ${r.sampleRate} Hz, seq ${r.seq}, ${r.samples?.length} samples; not-CGPC gives ${bad}` : 'null for a CGPC frame';
  }
  line('app', 'the page decodes a CGPC frame as the contract lays it out', pcmOk, pcmDetail);

  let slotOk = false, slotDetail = 'no dawSlotSource or dawSlotSettings';
  if (has('dawSlotSource') && has('dawSlotSettings')) {
    const src = lib.dawSlotSource(3);
    const binding = (source) => ({ id: 'b', source, target: { kind: 'setting', key: 'plateRock', min: 0.2, max: 0.7 }, mode: 'absolute' });
    const map = { format: 'chromaglass-midi', version: 1, name: 'dawbridge', bindings: [binding(src)] };
    const ccMap = { ...map, bindings: [binding({ kind: 'cc', channel: 0, number: 3 })] };
    const v = Math.fround(0.123457);
    const want = valueAt(v, 0.2, 0.7, curveOf('plateRock'));
    const got = lib.dawSlotSettings(map, 3, v)?.plateRock;
    const fromCc = lib.dawSlotSettings(ccMap, 3, v)?.plateRock;
    // Plate Rock has a curve (2) and the binding a part of its travel, so a slot
    // value written straight into the setting, or along a line, is not this.
    slotOk = curveOf('plateRock') !== 1 && src?.kind === 'slot' && src.channel === 0 && src.number === 3 && Math.abs(got - want) < 1e-12 && fromCc === undefined;
    slotDetail = `source ${JSON.stringify(src)}; Plate Rock ${got} for ${want.toFixed(6)} (a CC step would give ${valueAt(Math.round(v * 127) / 127, 0.2, 0.7, curveOf('plateRock')).toFixed(6)}); a CC 3 binding gives ${fromCc}`;
  }
  line('app', 'a slot moves its setting through MIDI learn\'s map at full resolution, and a CC binding is not a slot', slotOk, slotDetail);
}
{
  // Transport as a tempo source, like test 3 of `npm run link`: readings every 10 ms
  // as the plugin throttles them, each stamped on arrival up to a frame late, and the
  // beat at `ahead` after it. The truth is when a beat is *heard*.
  const t = new TempoSource();
  const hasDaw = typeof t.dawReading === 'function';
  let seed = 7;
  const late = () => { seed = (seed * 16807) % 2147483647; return (seed % 1600) / 100; };
  // The song: 120 bpm with beat zero heard at 1.5 s, then 132 from beat 16 (heard at
  // 9.5 s) on. A reading sent at `sentAt` carries the beat heard `ahead` later.
  const ahead = 0.02, origin = 1500, P1 = 500, P2 = 60000 / 132, C = origin + 16 * P1;
  const beatOf = (ms) => (ms < C ? (ms - origin) / P1 : 16 + (ms - C) / P2);
  const timeOf = (k) => (k <= 16 ? origin + k * P1 : C + (k - 16) * P2);
  const periodAt = (ms) => (ms < C ? P1 : P2);
  t.tap(100); t.tap(600); t.tap(1100);
  // barBeat is sent a beat ahead of the song's count (a pickup bar), so a reader that
  // counts the bar from the beat number, as Link's `whole % 4` does, is seen.
  let worst = 0, bars = true, n = 0, followedAt = null, wrong = 0;
  if (hasDaw) {
    for (let ms = 2000; ms < 14000; ms += 1000 / 60) {
      if (Math.floor(ms / 10) !== Math.floor((ms - 1000 / 60) / 10)) {
        const sentAt = Math.floor(ms / 10) * 10, heard = sentAt + ahead * 1000;
        const beat = beatOf(heard);
        t.dawReading(sentAt + late(), { type: 'daw-transport', playing: true, bpm: 60000 / periodAt(heard), beat, barBeat: (beat + 1) % 4, num: 4, den: 4, ahead });
      }
      const r = t.read(ms);
      if (r?.source !== 'daw') continue;
      // A beat that is not a number, still to come, or more than a beat ago is wrong
      // whatever else it says (a reader stuck on beat zero would otherwise be judged
      // against beat zero and pass).
      if (!Number.isFinite(r.beatAt) || r.beatAt > ms + 2 || r.beatAt <= ms - r.period - 2) { wrong++; continue; }
      // Across the change the beat is judged only once the new tempo is read, and not
      // the last 120 bpm beat as the new tempo places it (beat 15, at the old tempo, is
      // rightly put a few ms off by a reader that has just heard 132).
      if (ms >= C && followedAt === null) {
        if (Math.abs(r.period - P2) < 0.001 * P2) followedAt = ms; else continue;
      }
      if (r.period === P2 && r.beatAt < C) continue;
      // The first quarter second is the reader finding the least-late arrival.
      if (ms < 2250) continue;
      const k = Math.round(beatOf(r.beatAt));
      n++;
      worst = Math.max(worst, Math.abs(r.beatAt - timeOf(k)));
      if (r.bar !== (k + 1) % 4) bars = false;
    }
  }
  const period = P2, changedAt = C;
  line('app', 'the DAW\'s transport is the tempo, each beat where it is heard', hasDaw && n > 50 && wrong === 0 && worst < 2, hasDaw ? `worst ${worst.toFixed(2)} ms over ${n} readings, ${wrong} not the last beat` : 'no TempoSource.dawReading');
  line('app', 'each beat knows its place in the DAW\'s bar, from the DAW\'s barBeat', hasDaw && n > 50 && bars);
  line('app', 'a tempo change in the DAW is followed within a beat', hasDaw && followedAt !== null && followedAt - changedAt < period,
    followedAt !== null ? `${(followedAt - changedAt).toFixed(0)} ms` : 'never followed');
  if (hasDaw) {
    const back = t.read(14000 + 600)?.source;
    t.dawReading(15000, { type: 'daw-transport', playing: true, bpm: 120, beat: 0, barBeat: 0, num: 4, den: 4, ahead: 0 });
    t.linkReading(15000, { on: true, peers: 1, bpm: 128, beat: 0 });
    const withLink = t.read(15005)?.source;
    t.linkReading(15010, { on: false, peers: 0, bpm: 0, beat: null });
    t.dawReading(15010, { type: 'daw-transport', playing: false, bpm: 120, beat: 0.5, barBeat: 0.5, num: 4, den: 4, ahead: 0 });
    const stopped = t.read(15015)?.source;
    line('app', 'the DAW ranks under Link and over a tap; quiet or stopped, it hands back',
      back === 'tap' && withLink === 'link' && stopped === 'tap', `quiet 600 ms → ${back}; with Link → ${withLink}; stopped → ${stopped}`);
  } else line('app', 'the DAW ranks under Link and over a tap; quiet or stopped, it hands back', false, 'no TempoSource.dawReading');
  const shared = readFileSync('src/app/shared.ts', 'utf8').match(/export type AudioSource =([^;]*);/)?.[1] ?? '';
  line('app', 'the ear has a source named DAW', /'daw'/.test(shared), shared.trim());
}

// ── 4. The built app ─────────────────────────────────────────────────

if (NODE_ONLY) console.log('skip  the built app — --node');
else {
  const { chromium } = await import('playwright');
  const { launchChromium } = await import('./chromium.mjs');
  try {
    browser = await launchChromium(chromium);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    const map = JSON.stringify({ format: 'chromaglass-midi', version: 1, name: 'dawbridge', bindings: [
      { id: 'slot3', source: { kind: 'slot', channel: 0, number: 3 }, target: { kind: 'setting', key: 'plateRock', min: 0.2, max: 0.7 }, mode: 'absolute' },
    ] });
    await page.addInitScript((m) => {
      try {
        localStorage.setItem('chromaglass-midi-map', m);
        sessionStorage.setItem('chromaglass-audio-source', 'daw');
      } catch { /* private window */ }
    }, map);
    // Part 1's display goes, so the page is the one display, as on a show.
    display.ws.close();
    phone.ws.close();
    const namesAt = pa.heard.length;
    await pa.hello('inst-app');
    await page.goto(`http://127.0.0.1:${PORT}/?debug&look=classic&play=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.chromaglassCastState === 'function' && typeof window.chromaglassTempo === 'function', null, { timeout: 60_000 });
    for (let end = Date.now() + 30_000; Date.now() < end && pro.log.join('').split('display connected').length < 4;) await sleep(100);
    // The hello once a second, as the plugin sends it, for the rest of this part.
    const beat = setInterval(() => { pa.hello('inst-app'); }, 1000);
    try {
      // Part 1 left names on the server (slot 8 "Go: Fillmore"), which it may send on this
      // hello before the page has said its own: the page's are the ones with slot 8 empty.
      const names = await waitFor(pa.heard, (x) => x.address === A('names') && x.args?.[7] === '' && x.args?.[3] !== '', 5000, namesAt);
      line('app', 'the app names slot 4 by what it is learned to, and leaves the rest empty',
        names?.args && names.args[3] !== '' && names.args.every((v, k) => k === 3 || v === ''), names ? `slot 4 "${names.args?.[3]}"` : 'no names');

      const v = Math.fround(0.123457);
      await pa.slot(3, v);
      const want = valueAt(v, 0.2, 0.7, curveOf('plateRock'));
      let got;
      for (let end = Date.now() + 5000; Date.now() < end;) {
        got = await page.evaluate(() => window.chromaglassCastState().settings.plateRock);
        if (Math.abs(got - want) < 1e-6) break;
        await sleep(100);
      }
      line('app', 'the app: a slot moves the setting it is learned to, at the slot\'s own resolution', Math.abs(got - want) < 1e-6, `Plate Rock ${got} for ${want.toFixed(6)}`);

      const t0 = now();
      let reading = null;
      while (now() < t0 + 3000) {
        const ms = now() - t0;
        await pa.transport({ playing: 1, bpm: 132, beat: ms / (60000 / 132), ahead: 0 });
        await sleep(10);
      }
      reading = await page.evaluate(() => window.chromaglassTempo());
      line('app', 'the app: the DAW\'s tempo becomes the show\'s', reading?.source === 'daw' && Math.abs(60000 / reading.period - 132) < 0.01,
        reading ? `${(60000 / reading.period).toFixed(3)} BPM from ${reading.source}` : 'no reading');

      // The ear: two seconds of silence, then three of kicks, through the bridge only.
      const energy = async (ms) => {
        const vals = [];
        for (let end = now() + ms; now() < end;) { vals.push(await page.evaluate(() => window.chromaglassCastState().audio?.energy ?? 0)); await sleep(100); }
        return vals.slice(Math.floor(vals.length / 3)).reduce((x, y) => x + y, 0) / Math.max(1, vals.length - Math.floor(vals.length / 3));
      };
      let seq = 0, playing = false;
      const feed = setInterval(() => {
        for (let k = 0; k < 2; k++) {
          const samples = new Float32Array(512);
          for (let j = 0; j < 512; j++) { const tt = ((seq + j) / 48000) % 0.5; samples[j] = playing && tt < 0.12 ? 0.8 * Math.sin(2 * Math.PI * 60 * tt) * Math.exp(-tt * 20) : 0; }
          pa.pcm(1, seq, samples); seq += 512;
        }
      }, 21);
      const quiet = await energy(2000);
      playing = true;
      const loud = await energy(3000);
      clearInterval(feed);
      line('app', 'the app: the ear hears the DAW\'s audio, with Source on DAW', loud > 0.02 && loud > 4 * quiet, `energy ${quiet.toFixed(3)} in silence, ${loud.toFixed(3)} with kicks`);
    } finally {
      clearInterval(beat);
      await pa.bye('inst-app');
    }
  } catch (e) {
    line('app', 'the built app\'s half ran to the end', false, e.message.split('\n')[0]);
  }
}

// ── 5. The plugin ────────────────────────────────────────────────────
//
// Only with --plugin: the plugin is built on a Mac, and its lines are held where it is
// built (the owner's Mac for 13.7b; the macOS runner from 13.7c, whose PR takes
// `plugin` out of --owed in that shard's entry). Its header alone, checked on every
// run, would let a header with no plugin behind it turn the part green.

if (!PLUGIN) console.log('skip  the plugin: its header, its own packets and auval — pass --plugin on a Mac with it built');
else {
  const header = 'plugin/dawbridge/Source/BridgeProtocol.h';
  const text = existsSync(header) ? readFileSync(header, 'utf8') : '';
  const num = (name) => Number(text.match(new RegExp(`\\b${name}\\s*(?:=\\s*|\\{\\s*)(\\d+)`))?.[1]);
  const missing = ADDRESSES.filter((a) => !text.includes(`"${a}"`));
  line('plugin', 'the plugin\'s protocol header says what the contract says',
    text && num('kProtocol') === PROTOCOL && num('kSlots') === SLOTS && num('kPort') === CONTRACT_PORT && missing.length === 0,
    text ? `protocol ${num('kProtocol')}, slots ${num('kSlots')}, port ${num('kPort')}${missing.length ? `; missing ${missing.join(' ')}` : ''}` : `no ${header}`);
  const bin = ['plugin/dawbridge/build/DawBridgeSelfTest_artefacts/Release/DawBridgeSelfTest', 'plugin/dawbridge/build/DawBridgeSelfTest_artefacts/DawBridgeSelfTest'].find(existsSync);
  if (!bin) line('plugin', 'the plugin\'s self-test is built', false, 'no DawBridgeSelfTest under plugin/dawbridge/build');
  else {
    // A display of its own (part 4 closed part 1's), and the self-test run without
    // blocking this process: a blocked reader would let the server's buffer for it
    // fill, and the server drops audio frames for a display that stops reading.
    const pd = await join_(PORT, 'display', info.displayKey);
    const out = [];
    const child = spawn(bin, ['--port', String(BRIDGE)], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => out.push(String(d)));
    child.stderr.on('data', (d) => out.push(String(d)));
    const killer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    const run = { status: await new Promise((r) => child.on('exit', (code) => r(code))), stdout: out.join('') };
    clearTimeout(killer);
    await sleep(300);
    const msgs = pd.inbox;
    const hi = msgs.find((m) => m.type === 'daw' && m.on === true);
    const tr = msgs.filter((m) => m.type === 'daw-transport' && m.playing);
    // The self-test plays in real time (docs/dawbridge.md): four seconds of song, so
    // eight beats at 120 and four seconds of audio by the frames' own count.
    const frames = pd.frames.filter((fr) => fr.data.toString('ascii', 0, 4) === 'CGPC');
    let gapless = frames.length > 0, next = frames[0]?.data.readUInt32LE(12), seconds = 0;
    for (const fr of frames) {
      if (fr.data.readUInt32LE(12) !== next) gapless = false;
      const n = (fr.data.length - 16) / 4 / fr.data[4];
      next = (fr.data.readUInt32LE(12) + n) >>> 0;
      seconds += n / fr.data.readUInt32LE(8);
    }
    const lastBeat = tr.at(-1)?.beat ?? 0;
    const slots = msgs.filter((m) => m.type === 'daw-slot' && m.slot === 3).map((m) => m.value);
    line('plugin', 'the self-test ran', run.status === 0, run.status === 0 ? '' : `exit ${run.status}: ${run.stdout.slice(-300)}`);
    line('plugin', 'its hello and its transport at 120 bpm in 4/4', !!hi && tr.length > 10 && tr.every((m) => m.bpm === 120 && m.num === 4) && Math.abs(lastBeat - 8) < 0.5,
      `${hi ? hi.host : 'no hello'}; ${tr.length} transports, last beat ${lastBeat.toFixed(2)} of 4 s`);
    line('plugin', 'its audio: four seconds, gap-free', gapless && Math.abs(seconds - 4) < 0.05, `${seconds.toFixed(3)} s in ${frames.length} packets${gapless ? '' : ', with a gap'}`);
    line('plugin', 'its slot 3 rises from 0 to 1', slots.length > 5 && slots[0] < 0.05 && slots.at(-1) > 0.95 && slots.every((v, k) => k === 0 || v >= slots[k - 1]),
      `${slots.length} moves, ${slots[0]?.toFixed(3)} to ${slots.at(-1)?.toFixed(3)}`);
  }
  if (process.platform !== 'darwin') console.log('skip  auval — not a Mac');
  else {
    const r = spawnSync('auval', ['-v', 'aufx', 'Cgbr', 'Pltr'], { encoding: 'utf8', timeout: 120_000 });
    line('plugin', 'auval passes the AU', r.status === 0 && /AU VALIDATION SUCCEEDED/.test(r.stdout), (r.stdout || '').split('\n').filter((l) => /VALIDATION|FAIL/.test(l)).slice(-2).join(' | '));
  }
}

const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} DAW bridge checks failed${owedLines ? `, ${owedLines} owed` : ''}` : `\nall ${checks.length} DAW bridge checks pass${owedLines ? `, and ${owedLines} lines owed (${[...owed].join(', ')})` : ''}`);
await finish(failed.length ? 1 : 0);
