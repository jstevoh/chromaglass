/**
 * Art-Net, both directions.
 *
 * The interesting one is out. Every lighting box on the market takes Art-Net
 * *in* — a desk drives the visuals. Nothing sends it the other way, and a
 * liquid light show is the one thing that obviously should: the plate already
 * knows what colour it is, layer by layer, so the par cans washing the room
 * can be the same blue the dye just went. The projection and the lighting rig
 * stop being two things somebody has to match by hand.
 *
 * The browser cannot open a UDP socket, so the display sends its colours over
 * the WebSocket it already has to the show server, and the show server — which
 * is on the same network as the rig and already speaks UDP for OSC — does the
 * patching. That also puts the fixture configuration on the machine that is
 * plugged into the lighting network rather than in a look that travels.
 *
 * ArtDmx is a fixed 18-byte header and up to 512 bytes of channel data.
 * Universe is split across two bytes: the low 8 bits (sub-net and universe)
 * and the high 7 (net).
 */

export const ARTNET_PORT = 6454;
/** "Art-Net" and its terminator: the first eight bytes of every packet. */
const ID = Buffer.from('Art-Net\0', 'ascii');
const OP_DMX = 0x5000;
/** Protocol 14, the current revision, high byte first — the one field that is not little-endian. */
const PROTOCOL = 14;
/** A universe is 512 channels and a packet must carry an even number of them. */
export const UNIVERSE_SIZE = 512;

/** Pack one ArtDmx packet. `data` is channel 1 upward; short frames are sent short. */
export function encodeArtDmx(universe, sequence, data) {
  const len = Math.min(UNIVERSE_SIZE, data.length) + (data.length % 2);
  const out = Buffer.alloc(18 + len);
  ID.copy(out, 0);
  out.writeUInt16LE(OP_DMX, 8);
  out.writeUInt8(PROTOCOL >> 8, 10);
  out.writeUInt8(PROTOCOL & 0xff, 11);
  // 0 means "do not track order"; otherwise it wraps 1..255 so a receiver can
  // drop a packet that overtook its predecessor on the way.
  out.writeUInt8(sequence & 0xff, 12);
  out.writeUInt8(0, 13);                        // physical input, informational only
  out.writeUInt8(universe & 0xff, 14);          // sub-net and universe
  out.writeUInt8((universe >> 8) & 0x7f, 15);   // net
  out.writeUInt16BE(len, 16);
  for (let i = 0; i < Math.min(len, data.length); i++) out.writeUInt8(data[i] & 0xff, 18 + i);
  return out;
}

/** Read an ArtDmx packet, or null for anything else on the port. */
export function decodeArtDmx(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 18) return null;
  if (!buf.subarray(0, 8).equals(ID)) return null;
  if (buf.readUInt16LE(8) !== OP_DMX) return null;
  const len = buf.readUInt16BE(16);
  if (len < 2 || len > UNIVERSE_SIZE || buf.length < 18 + len) return null;
  return {
    universe: (buf.readUInt8(14) & 0xff) | ((buf.readUInt8(15) & 0x7f) << 8),
    sequence: buf.readUInt8(12),
    data: buf.subarray(18, 18 + len),
  };
}

/**
 * Where each colour goes on the wire.
 *
 * A fixture here is one contiguous run of channels in a named order, repeated
 * `count` times from `start`. That covers the LED pars and bars a small rig is
 * actually made of; anything with a personality file beyond this belongs in a
 * lighting desk, which can have the plate's colour over Art-Net in from here
 * and do its own patching.
 *
 * `d` is a dimmer that takes the brightest of the three channels, `w` a white
 * that takes the colour's own white content, so an RGBW fixture does not read
 * as a duller RGB one.
 */
export const ORDERS = {
  rgb: ['r', 'g', 'b'],
  grb: ['g', 'r', 'b'],
  brg: ['b', 'r', 'g'],
  rgbw: ['r', 'g', 'b', 'w'],
  drgb: ['d', 'r', 'g', 'b'],
  drgbw: ['d', 'r', 'g', 'b', 'w'],
};

/** Parse `#rrggbb` into 0..255 triples; anything unreadable is black. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Build one universe from what the plate reported.
 *
 * Fixtures are handed the layers round-robin, so two layers across six pars
 * alternate and the rig reads as the plate does rather than as one average.
 * `master` is the plate's own brightness: it scales everything, so the room
 * dims when the plate thins instead of sitting at full whatever is on the
 * glass.
 */
export function buildUniverse(layers, { count, start, order, master = 1 }) {
  const map = ORDERS[order] ?? ORDERS.rgb;
  const frame = new Uint8Array(UNIVERSE_SIZE);
  const colours = (Array.isArray(layers) && layers.length ? layers : [{ colour: '#000000', fill: 0 }]);
  const gain = Math.max(0, Math.min(1, master));
  for (let f = 0; f < count; f++) {
    const base = start - 1 + f * map.length;
    if (base < 0 || base + map.length > UNIVERSE_SIZE) break;
    const layer = colours[f % colours.length];
    const [r, g, b] = hexToRgb(layer?.colour).map(v => Math.round(v * gain));
    // White is what all three channels share; taking it out of the colour
    // channels keeps a wash the same brightness rather than adding a fourth
    // lamp's worth on top.
    const w = Math.min(r, g, b);
    const has = map.includes('w');
    const value = { r: has ? r - w : r, g: has ? g - w : g, b: has ? b - w : b, w, d: Math.max(r, g, b) };
    for (let c = 0; c < map.length; c++) frame[base + c] = Math.max(0, Math.min(255, value[map[c]] ?? 0));
  }
  return frame;
}

/**
 * Read the configuration off the environment.
 *
 * Off unless ARTNET_HOST is set, because a box that starts broadcasting to a
 * lighting network nobody asked it to talk to is a bad houseguest.
 */
export function artnetConfig(env = process.env) {
  const host = env.ARTNET_HOST ?? '';
  if (!host) return null;
  const order = String(env.ARTNET_ORDER ?? 'rgb').toLowerCase();
  return {
    host,
    port: Number(env.ARTNET_PORT ?? ARTNET_PORT),
    universe: Math.max(0, Math.min(32767, Number(env.ARTNET_UNIVERSE ?? 0))),
    count: Math.max(1, Math.min(170, Number(env.ARTNET_FIXTURES ?? 4))),
    start: Math.max(1, Math.min(UNIVERSE_SIZE, Number(env.ARTNET_START ?? 1))),
    order: order in ORDERS ? order : 'rgb',
    /** Frames a second. The spec's ceiling is 44; fixtures smooth anything above about 20. */
    rate: Math.max(1, Math.min(44, Number(env.ARTNET_RATE ?? 30))),
  };
}

/**
 * Channels that drive settings, for Art-Net in: `ARTNET_IN=1:audioImpact,2:gooeyEffect`.
 *
 * A channel is 0..255 and a setting is its own range, so the map carries the
 * range too when it is not 0..1: `10:globalSpeed:0:0.1`.
 */
export function parseInMap(spec) {
  const map = new Map();
  for (const part of String(spec ?? '').split(',')) {
    const bits = part.trim().split(':');
    if (bits.length < 2) continue;
    const channel = Number(bits[0]);
    const key = bits[1];
    if (!Number.isInteger(channel) || channel < 1 || channel > UNIVERSE_SIZE) continue;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) continue;
    const lo = bits.length >= 4 ? Number(bits[2]) : 0;
    const hi = bits.length >= 4 ? Number(bits[3]) : 1;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
    map.set(channel, { key, lo, hi });
  }
  return map;
}

/** Turn a received universe into a settings patch, or null when nothing mapped moved. */
export function patchFromUniverse(data, map, last) {
  let patch = null;
  for (const [channel, { key, lo, hi }] of map) {
    const raw = data[channel - 1];
    if (raw === undefined || last.get(channel) === raw) continue;
    last.set(channel, raw);
    (patch ??= {})[key] = lo + (raw / 255) * (hi - lo);
  }
  return patch;
}
