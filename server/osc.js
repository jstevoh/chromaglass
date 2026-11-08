/**
 * OSC, both ways: the reader and the address space the show takes in, and the
 * writer and the feed it sends out (PLAN.md 13.5-osc).
 *
 * The reader moved here whole from `remote-server.js` when OSC out arrived, so
 * that the two halves share one file and `npm run oscout` can read what the
 * writer wrote with the reader the show itself uses, as well as against bytes
 * written out by hand from the OSC 1.0 layout (a mistake made in both halves
 * of one codec would otherwise pass). Plain functions over buffers; the
 * sockets stay in the server.
 */

import { createSocket } from 'node:dgram';

// ── In ─────────────────────────────────────────────────────────────────
// A small OSC 1.0 reader: address, type tags, int/float/string/blob/bool
// arguments, and bundles. Addresses (all under /chromaglass):
//   /setting/<key> <number>          a setting, e.g. /chromaglass/setting/audioImpact 0.8
//   /action/<name>                   seed clear drain lucky play pause automate-on|off
//                                    overlays-on|off seq-play|pause|next|prev|stop
//                                    preset-next|prev blackout-toggle record-toggle
//   /preset <id>  or  /preset/<id>   cue a preset by id
//   /blow x y [amount] [dx dy]       air at a point (0..1, y up)
//   /drop x y [amount]               dye at a point
//   /press x y [amount]              press the glass at a point
//   /tilt x y                        rock the plate (-1..1)
//   /dye <#rrggbb>                   the dropper's colour
export const readOsc = (buf) => {
  let off = 0;
  const str = () => {
    const end = buf.indexOf(0, off);
    const s = buf.toString('utf8', off, end < 0 ? buf.length : end);
    off = ((end < 0 ? buf.length : end) + 4) & ~3;
    return s;
  };
  if (buf.length >= 8 && buf.toString('utf8', 0, 7) === '#bundle') {
    off = 16;   // skip "#bundle\0" and the time tag
    const out = [];
    while (off + 4 <= buf.length) {
      const size = buf.readInt32BE(off); off += 4;
      if (size <= 0 || off + size > buf.length) break;
      out.push(...readOsc(buf.subarray(off, off + size))); off += size;
    }
    return out;
  }
  const address = str();
  if (!address.startsWith('/')) return [];
  const tags = off < buf.length && buf[off] === 44 ? str().slice(1) : '';
  const args = [];
  for (const t of tags) {
    if (t === 'f') { args.push(buf.readFloatBE(off)); off += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(off)); off += 4; }
    else if (t === 'd') { args.push(buf.readDoubleBE(off)); off += 8; }
    else if (t === 'h') { args.push(Number(buf.readBigInt64BE(off))); off += 8; }
    else if (t === 's' || t === 'S') args.push(str());
    else if (t === 'b') { const n = buf.readInt32BE(off); off += 4; args.push(buf.subarray(off, off + n)); off = (off + n + 3) & ~3; }
    else if (t === 'T') args.push(true);
    else if (t === 'F') args.push(false);
    else if (t === 'N') args.push(null);
    else if (t === 'I') args.push(Infinity);
    else if (t === 'c' || t === 'r' || t === 'm') { args.push(buf.readUInt32BE(off)); off += 4; }
    else if (t === 't') { off += 8; }
  }
  return [{ address, args }];
};

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? (v ? 1 : 0) : d);
export const oscToMessage = ({ address, args }) => {
  const parts = address.split('/').filter(Boolean);
  if (parts[0] !== 'chromaglass' || parts.length < 2) return null;
  const [, what, ...rest] = parts;
  switch (what) {
    case 'setting': {
      const key = rest[0];
      if (!key || !/^[a-zA-Z0-9_]+$/.test(key) || args.length === 0) return null;
      const v = typeof args[0] === 'string' ? (args[0] === 'true' ? true : args[0] === 'false' ? false : Number(args[0])) : typeof args[0] === 'boolean' ? args[0] : num(args[0]);
      if (typeof v === 'number' && !Number.isFinite(v)) return null;
      return { type: 'patch', settings: { [key]: v } };
    }
    case 'action': {
      const name = rest[0] ?? (typeof args[0] === 'string' ? args[0] : null);
      return name && /^[a-z-]+$/.test(name) && num(args[0], 1) !== 0 ? { type: 'action', action: name } : null;
    }
    case 'preset': {
      // A button bound to /chromaglass/preset/<id> sends 1 on its press and 0
      // on its release (Resolume, TouchOSC), as it does to an action; the
      // release cued the preset a second time, clearing and reseeding a plate
      // that had just been seeded (found writing docs/osc.md, PLAN 13.4).
      const id = rest[0] ?? (typeof args[0] === 'string' ? args[0] : null);
      return id && /^[a-zA-Z0-9_-]+$/.test(id) && (rest[0] === undefined || num(args[0], 1) !== 0) ? { type: 'preset', presetId: id } : null;
    }
    case 'blow': return { type: 'blow', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5), ...(args.length >= 5 ? { dx: num(args[3]), dy: num(args[4]) } : {}) };
    case 'drop': return { type: 'drop', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5) };
    case 'press': return { type: 'press', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5) };
    case 'tilt': return { type: 'tilt', x: Math.max(-1, Math.min(1, num(args[0]))), y: Math.max(-1, Math.min(1, num(args[1]))) };
    case 'dye': return typeof args[0] === 'string' && /^#?[0-9a-fA-F]{6}$/.test(args[0]) ? { type: 'dye', color: args[0].startsWith('#') ? args[0] : `#${args[0]}` } : null;
    default: return null;
  }
};

// ── Out ────────────────────────────────────────────────────────────────
//
// What a VJ app's effects can follow: the plate's colour, what the ear hears
// and the beat, so a Resolume layer's hue can sit on the dye and a strobe can
// land on the kick the plate itself pressed on. Every address is under
// /chromaglass/out/, which the reader above refuses (its switch has no "out"),
// so an app that echoes everything it is sent back to the show's own OSC port
// cannot drive the show with its own feed.
//
// One float per address, not a list: Resolume's shortcuts, VDMX's data sources
// and TouchOSC each map one address to one value, and a list of three reaches
// them as its first number only. TouchDesigner and Max take singles as well.
//
//   /chromaglass/out/colour/red|green|blue    0..1, the plate's mean colour, each layer weighted by how full it is
//   /chromaglass/out/colour/hue               0..1, the same colour's hue (0 red, 1/3 green, 2/3 blue)
//   /chromaglass/out/colour/brightness        0..1, its brightest channel
//   /chromaglass/out/layer/<n>/red|green|blue|fill   each layer, n from 1
//   /chromaglass/out/master                   0..1, the room's dimmer the rig gets (0 in a blackout)
//   /chromaglass/out/sound/<name>             0..1, level kick bass snare hats note: the ear's fast readings
//   /chromaglass/out/band/<n>                 0..1, the ear's bands low to high, n from 1
//   /chromaglass/out/bpm                      the beat clock's tempo, bpm (0 before it has one)
//   /chromaglass/out/beat                     1 on each beat the plate presses on, 0 the next feed: a button press and release

const pad4 = (n) => (n + 4) & ~3;   // a string's bytes plus its NUL, to a multiple of four

/**
 * One OSC message: an address and its arguments, each a float (`f`) unless it
 * is a whole number marked `{ i: n }` or a string. Floats are 32-bit, the type
 * every receiver reads; a double ('d') is one Resolume drops.
 */
export function encodeOsc(address, args = []) {
  const str = (t) => { const bytes = Buffer.from(t, 'utf8'); const b = Buffer.alloc(pad4(bytes.length)); bytes.copy(b); return b; };
  const int = (a) => typeof a === 'object' && a !== null && 'i' in a;
  const parts = [str(address), str(`,${args.map((a) => (typeof a === 'string' ? 's' : int(a) ? 'i' : 'f')).join('')}`)];
  for (const a of args) {
    if (typeof a === 'string') { parts.push(str(a)); continue; }
    const b = Buffer.alloc(4);
    if (int(a)) b.writeInt32BE(a.i | 0);
    else b.writeFloatBE(Number.isFinite(a) ? a : 0);
    parts.push(b);
  }
  return Buffer.concat(parts);
}

/**
 * Messages, `[address, args]` each, as one bundle with the time tag
 * "immediately" (1): a receiver acts on them as they arrive, as on loose
 * messages, but the network carries one datagram.
 */
export function encodeBundle(messages) {
  const parts = [Buffer.from('#bundle\0', 'latin1'), Buffer.from([0, 0, 0, 0, 0, 0, 0, 1])];
  for (const [address, args] of messages) {
    const m = encodeOsc(address, args);
    const size = Buffer.alloc(4);
    size.writeInt32BE(m.length);
    parts.push(size, m);
  }
  return Buffer.concat(parts);
}

/** Resolume's default OSC input port, and this Mac: where OSC out goes until the operator names somewhere else. */
export const OSC_OUT_DEFAULT = '127.0.0.1:7000';

/**
 * Where OSC out goes, from "host:port": an IPv4 address (a broadcast one too,
 * 192.168.1.255, for every VJ machine on the network) or `localhost`, and a
 * port from 1 to 65535. Anything else is null, so a typo in Settings is
 * refused and said, never a stream of packets to port NaN. Names other than
 * localhost are refused rather than looked up: a lookup that hangs at a venue
 * with no DNS would hold the feed, and VJ apps are found by address.
 */
export function oscOutTarget(text) {
  const m = /^\s*(localhost|\d{1,3}(?:\.\d{1,3}){3})\s*:\s*(\d{1,5})\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  const host = m[1] === 'localhost' ? '127.0.0.1' : m[1];
  if (host.split('.').some((o) => Number(o) > 255)) return null;
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 ? { host, port } : null;
}

const unit = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const rgbOf = (hex) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex ?? ''));
  return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0, 0, 0];
};
const hueOf = (r, g, b) => {
  const hi = Math.max(r, g, b);
  const d = hi - Math.min(r, g, b);
  if (d <= 0) return 0;
  const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h / 6) + 1) % 1;
};
export const SOUND_OUT = ['level', 'kick', 'bass', 'snare', 'hats', 'note'];

/**
 * The feed's messages for one report from the page: `{ layers, master, sound,
 * bands, bpm }` as the page's `lights` message carries them. Pure, so the
 * check reads exactly what the socket would send. The plate's colour is each
 * layer's mean weighted by its fill: an empty layer's colour is whatever it
 * last held, and the room should not take on a colour the glass no longer has.
 */
export function feedMessages(feed) {
  const out = [];
  const layers = Array.isArray(feed?.layers) ? feed.layers.slice(0, 8) : [];
  let r = 0, g = 0, b = 0, w = 0;
  layers.forEach((l, i) => {
    const [lr, lg, lb] = rgbOf(l?.colour);
    const fill = unit(l?.fill);
    const n = i + 1;
    out.push([`/chromaglass/out/layer/${n}/red`, [lr]], [`/chromaglass/out/layer/${n}/green`, [lg]],
      [`/chromaglass/out/layer/${n}/blue`, [lb]], [`/chromaglass/out/layer/${n}/fill`, [fill]]);
    r += lr * fill; g += lg * fill; b += lb * fill; w += fill;
  });
  if (layers.length) {
    if (w > 0) { r /= w; g /= w; b /= w; }
    out.push(['/chromaglass/out/colour/red', [r]], ['/chromaglass/out/colour/green', [g]], ['/chromaglass/out/colour/blue', [b]],
      ['/chromaglass/out/colour/hue', [hueOf(r, g, b)]], ['/chromaglass/out/colour/brightness', [Math.max(r, g, b)]]);
  }
  out.push(['/chromaglass/out/master', [unit(feed?.master)]]);
  const sound = feed?.sound && typeof feed.sound === 'object' ? feed.sound : null;
  if (sound) for (const name of SOUND_OUT) out.push([`/chromaglass/out/sound/${name}`, [unit(sound[name])]]);
  if (Array.isArray(feed?.bands)) feed.bands.slice(0, 32).forEach((v, i) => out.push([`/chromaglass/out/band/${i + 1}`, [unit(v)]]));
  const bpm = typeof feed?.bpm === 'number' && Number.isFinite(feed.bpm) ? Math.max(0, Math.min(400, feed.bpm)) : 0;
  out.push(['/chromaglass/out/bpm', [bpm]]);
  return out;
}

// ── DAW bridge (PLAN.md 13.7a, docs/dawbridge.md) ──────────────────────
//
// Sits here so the packed Mac app (desktop/electron-builder.config.cjs), which
// lists `osc.js`, carries the bridge without touching `desktop/`; `dawBridge.js`
// re-exports these symbols for callers and checks that read it directly.

export const DAW_BRIDGE_PORT = 9024;
export const DAW_PROTOCOL = 1;
export const DAW_SLOTS = 32;
const DAW_QUIET_MS = 3000;

function readBridgeString(buf, offset) {
  const end = buf.indexOf(0, offset);
  if (end < 0) return null;
  return { value: buf.toString('utf8', offset, end), next: ((end + 4) & ~3) };
}

function readBridgeMessage(buf) {
  if (buf.length < 4 || buf[0] !== 0x2f) return null;
  const addr = readBridgeString(buf, 0);
  if (!addr) return null;
  const tags = readBridgeString(buf, addr.next);
  if (!tags || tags.value[0] !== ',') return null;
  let at = tags.next;
  const args = [];
  for (let i = 1; i < tags.value.length; i++) {
    const t = tags.value[i];
    if (t === 'i') {
      if (at + 4 > buf.length) return null;
      args.push(buf.readInt32BE(at));
      at += 4;
    } else if (t === 'f') {
      if (at + 4 > buf.length) return null;
      args.push(buf.readFloatBE(at));
      at += 4;
    } else if (t === 's') {
      const s = readBridgeString(buf, at);
      if (!s) return null;
      args.push(s.value);
      at = s.next;
    } else if (t === 'b') {
      if (at + 4 > buf.length) return null;
      const len = buf.readInt32BE(at);
      at += 4;
      if (len < 0 || at + len > buf.length) return null;
      args.push(buf.subarray(at, at + len));
      at += (len + 3) & ~3;
    } else {
      return null;
    }
  }
  return { address: addr.value, args };
}

function readBridgePacket(buf) {
  if (buf.length >= 16 && buf.toString('ascii', 0, 8) === '#bundle\0') {
    const out = [];
    let at = 16;
    while (at + 4 <= buf.length) {
      const size = buf.readInt32BE(at);
      at += 4;
      if (size <= 0 || at + size > buf.length) break;
      out.push(...readBridgePacket(buf.subarray(at, at + size)));
      at += size;
    }
    return out;
  }
  const msg = readBridgeMessage(buf);
  return msg ? [msg] : [];
}

export function encodeDawNames(names) {
  return encodeOsc('/chromaglass/bridge/names', Array.from({ length: DAW_SLOTS }, (_, i) => String(names?.[i] ?? '')));
}

export function startDawBridge({
  port = DAW_BRIDGE_PORT,
  proLinks = () => true,
  onMessage = () => {},
  onBinary = () => {},
} = {}) {
  let followed = null;
  let names = Array(DAW_SLOTS).fill('');
  let socket = null;

  const sendNames = () => {
    if (!followed || !socket) return;
    const pkt = encodeDawNames(names);
    socket.send(pkt, followed.port, followed.address, () => {});
  };

  const state = () => (followed
    ? {
        type: 'daw',
        on: true,
        instance: followed.instance,
        host: followed.host,
        sampleRate: followed.sampleRate,
        latency: followed.latency,
      }
    : { type: 'daw', on: false, ...(proLinks() ? {} : { locked: true }) });

  const setNames = (next) => {
    if (!Array.isArray(next)) return;
    names = Array.from({ length: DAW_SLOTS }, (_, i) => (typeof next[i] === 'string' ? next[i] : ''));
    sendNames();
  };

  const onTierChange = () => {
    if (!proLinks() && followed) {
      followed = null;
      onMessage({ type: 'daw', on: false, locked: true });
    }
  };

  if (!(port > 0)) {
    return { port: 0, state, setNames, onTierChange, close: () => {} };
  }

  socket = createSocket({ type: 'udp4', reuseAddr: true });
  socket.on('error', () => {
    try { socket.close(); } catch { /* already closed */ }
    socket = null;
  });

  socket.on('message', (buf, rinfo) => {
    if (rinfo.address !== '127.0.0.1') return;
    let msgs;
    try { msgs = readBridgePacket(buf); } catch { return; }
    for (const { address, args } of msgs) {
      if (!address.startsWith('/chromaglass/bridge/')) continue;
      if (!proLinks()) {
        if (followed) followed = null;
        if (address === '/chromaglass/bridge/hello') {
          onMessage({ type: 'daw', on: false, locked: true });
        }
        continue;
      }

      if (address === '/chromaglass/bridge/hello') {
        const [version, instance, host, sampleRate, latency] = args;
        if (
          version !== DAW_PROTOCOL ||
          typeof instance !== 'string' || !instance ||
          typeof host !== 'string' ||
          typeof sampleRate !== 'number' || !(sampleRate > 0) ||
          typeof latency !== 'number' || !(latency >= 0)
        ) continue;

        if (followed && (followed.address !== rinfo.address || followed.port !== rinfo.port || followed.instance !== instance)) {
          continue;
        }
        const changed = !followed ||
          followed.instance !== instance ||
          followed.host !== host ||
          followed.sampleRate !== sampleRate ||
          followed.latency !== latency;
        followed = {
          address: rinfo.address,
          port: rinfo.port,
          instance,
          host,
          sampleRate,
          latency,
          lastSeen: Date.now(),
        };
        if (changed) onMessage(state());
        sendNames();
        continue;
      }

      if (!followed || rinfo.address !== followed.address || rinfo.port !== followed.port) continue;
      followed.lastSeen = Date.now();

      if (address === '/chromaglass/bridge/bye') {
        const [instance] = args;
        if (typeof instance === 'string' && instance !== followed.instance) continue;
        followed = null;
        onMessage({ type: 'daw', on: false });
      } else if (address === '/chromaglass/bridge/slot') {
        const [slot, value] = args;
        if (!Number.isInteger(slot) || slot < 0 || slot >= DAW_SLOTS || typeof value !== 'number' || !Number.isFinite(value)) continue;
        onMessage({ type: 'daw-slot', slot, value: Math.max(0, Math.min(1, value)) });
      } else if (address === '/chromaglass/bridge/transport') {
        const [playing, bpm, whole, frac, barBeat, num, den, ahead] = args;
        if (
          typeof playing !== 'number' ||
          typeof bpm !== 'number' || !(bpm > 0) ||
          typeof whole !== 'number' ||
          typeof frac !== 'number' ||
          typeof barBeat !== 'number' ||
          typeof num !== 'number' ||
          typeof den !== 'number' ||
          typeof ahead !== 'number'
        ) continue;
        onMessage({
          type: 'daw-transport',
          playing: playing !== 0,
          bpm,
          beat: whole + frac,
          barBeat,
          num,
          den,
          ahead,
        });
      } else if (address === '/chromaglass/bridge/pcm') {
        const [channels, sampleRate, seq, blob] = args;
        if (
          (channels !== 1 && channels !== 2) ||
          typeof sampleRate !== 'number' || !(sampleRate > 0) ||
          typeof seq !== 'number' ||
          !Buffer.isBuffer(blob) || blob.length === 0 || blob.length % (4 * channels) !== 0
        ) continue;
        const frame = Buffer.allocUnsafe(16 + blob.length);
        frame[0] = 0x43;
        frame[1] = 0x47;
        frame[2] = 0x50;
        frame[3] = 0x43;
        frame[4] = channels & 0xff;
        frame[5] = 0;
        frame[6] = 0;
        frame[7] = 0;
        frame.writeUInt32LE(sampleRate >>> 0, 8);
        frame.writeUInt32LE(seq >>> 0, 12);
        blob.copy(frame, 16);
        onBinary(frame);
      }
    }
  });

  socket.bind(port, '127.0.0.1');

  const timer = setInterval(() => {
    if (followed && Date.now() - followed.lastSeen >= DAW_QUIET_MS) {
      followed = null;
      onMessage({ type: 'daw', on: false });
    }
  }, 200);
  timer.unref?.();

  return {
    port,
    state,
    setNames,
    onTierChange,
    close: () => {
      clearInterval(timer);
      followed = null;
      try { socket?.close(); } catch { /* already closed */ }
      socket = null;
    },
  };
}
