#!/usr/bin/env node
/**
 * Local show server: serves the built app on the LAN and relays control
 * messages between the laptop (display) and any phones (controllers).
 *
 *   npm run build && npm run remote
 *
 * Then open the printed URL on the laptop, and the /?remote=1 URL on the
 * phone. Both must be on the same network.
 *
 * Why local rather than a cloud relay: a control surface wants its slider to
 * move the visuals immediately, and a LAN round-trip is a couple of
 * milliseconds against a hundred or more through a datacentre. It also means
 * the show keeps working when the internet doesn't. The tradeoff is that this
 * serves the app over plain http on the LAN — a page loaded from
 * https://chromaglass.web.app cannot open a ws:// socket to your laptop
 * (mixed content), so for remote control you run the show from here.
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createSocket } from 'node:dgram';
import { ARTNET_PORT, artnetConfig, buildUniverse, decodeArtDmx, encodeArtDmx, parseInMap, patchFromUniverse } from './artnet.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const PORT = Number(process.env.PORT ?? 3000);
// The show key: a phone or a network display must present it to join. Four
// digits by default, or SHOW_KEY in the environment for one that lasts. It
// matters once the server is reachable beyond the room — through a tunnel,
// across buildings — where anyone with the address could otherwise drive
// the show.
const SHOW_KEY = String(process.env.SHOW_KEY ?? String(Math.floor(1000 + Math.random() * 9000)));
/** A request that came through a tunnel or a proxy carries forwarding headers; the key is not for those. */
const isLocalRequest = (req) => !req.headers['x-forwarded-for'] && !req.headers['cf-connecting-ip'];
const WS_PATH = '/remote-ws';
/**
 * OSC: Resolume, TouchDesigner, Max, Ableton (via Connection Kit) and the
 * phone OSC apps all speak it over UDP. Messages arrive here and drive the
 * display like a phone would; see oscToMessage for the address space.
 * OSC_PORT=0 turns it off. UDP has no show key, so only the LAN is heard.
 */
const OSC_PORT = Number(process.env.OSC_PORT ?? 9000);
const INFO_PATH = '/remote-info.json';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

if (!existsSync(DIST)) {
  console.error(`No build found at ${DIST}\nRun "npm run build" first.`);
  process.exit(1);
}

const lanAddresses = () =>
  Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);

// ── Static files, with SPA fallback ────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  // The display asks for this before opening a socket, so a page served from
  // anywhere else knows not to try. Static hosts answer with index.html.
  if (url.pathname === INFO_PATH) {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    // The LAN addresses let the show print the URL a network display opens.
    res.end(JSON.stringify({ chromaglass: 'relay', path: WS_PATH, port: PORT, hosts: lanAddresses(), key: isLocalRequest(req) ? SHOW_KEY : null }));
    return;
  }
  // normalize() collapses any ../ before it can escape dist
  let decoded;
  try { decoded = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('Bad path'); return; }
  const requested = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(DIST, requested);

  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, 'index.html');   // SPA fallback, same as Firebase
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(res);
});

// ── Control relay ──────────────────────────────────────────────────────
// Displays and controllers each broadcast to the other side. There is no
// state here at all: the display is authoritative and re-sends a snapshot
// whenever a controller joins, which keeps this process restartable
// mid-show without anything getting out of sync.
const wss = new WebSocketServer({ server, path: WS_PATH });
const roles = new WeakMap();

const broadcastTo = (role, raw, except) => {
  for (const client of wss.clients) {
    if (client !== except && client.readyState === 1 && roles.get(client) === role) {
      // A network display that has stopped reading (Wi-Fi gone, TCP not yet
      // noticed) must not pile up thirty frames a second in memory: drop
      // the show frames for it until it drains, keep the small messages.
      if (client.bufferedAmount > 1_000_000 && raw.length > 512) continue;
      client.send(raw);
    }
  }
};

// Ping every client twice a minute; one that never pongs is gone.
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) { client.terminate(); continue; }
    client.isAlive = false;
    try { client.ping(); } catch { /* closing */ }
  }
}, 30_000);
heartbeat.unref();

/** Messages only the relay itself may send; a client sending one is ignored. */
const RELAY_ONLY = new Set(['denied', 'request-state', 'request-cast', 'mirrors', 'hello']);

wss.on('connection', (socket) => {
  roles.set(socket, 'unknown');
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  // A protocol violation from a client is that client's problem, not the show's.
  socket.on('error', (err) => { console.log(`  socket error: ${err.message}`); });

  socket.on('message', (data) => {
    const raw = data.toString();
    if (raw.length > 512 * 1024) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

    if (message.type === 'hello') {
      if (String(message.key ?? '') !== SHOW_KEY) {
        console.log(`  ${message.role ?? 'unknown'} refused: wrong show key`);
        socket.send(JSON.stringify({ type: 'denied', reason: 'key' }));
        socket.close();
        return;
      }
      const role = message.role === 'display' ? 'display' : message.role === 'mirror' ? 'mirror' : 'controller';
      roles.set(socket, role);
      const count = [...wss.clients].filter(c => roles.get(c) === role).length;
      console.log(`  ${role} connected (${count} now)`);
      // A joining phone needs the current state before it can show anything;
      // a joining network display needs the show itself.
      if (role === 'controller') broadcastTo('display', JSON.stringify({ type: 'request-state' }));
      if (role === 'mirror') {
        broadcastTo('display', JSON.stringify({ type: 'request-cast' }));
        broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
      }
      return;
    }

    const from = roles.get(socket);
    // Nothing is relayed for a socket that never said hello with the key.
    if (from === 'unknown' || RELAY_ONLY.has(message.type)) return;
    // The show itself — settings and audio bands, thirty times a second —
    // goes only to the network displays; phones never see it.
    if (from === 'display' && message.type === 'cast') {
      broadcastTo('mirror', raw, socket);
      return;
    }
    // What colour the plate is. It goes to the lighting rig, not to phones —
    // twenty of these a second is noise on a control surface.
    if (from === 'display' && message.type === 'lights') {
      plate = {
        layers: Array.isArray(message.layers) ? message.layers.slice(0, 64) : [],
        master: typeof message.master === 'number' ? message.master : 1,
      };
      return;
    }
    if (from === 'mirror') return;   // a display only listens
    // Displays talk to phones; phones talk to displays.
    broadcastTo(from === 'display' ? 'controller' : 'display', raw, socket);
  });

  socket.on('close', () => {
    const role = roles.get(socket);
    if (role && role !== 'unknown') console.log(`  ${role} disconnected`);
    if (role === 'mirror') {
      const count = [...wss.clients].filter(c => c !== socket && roles.get(c) === 'mirror').length;
      broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
    }
  });
});

// ── OSC in ─────────────────────────────────────────────────────────────
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
const readOsc = (buf) => {
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
const oscToMessage = ({ address, args }) => {
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
      const id = rest[0] ?? (typeof args[0] === 'string' ? args[0] : null);
      return id && /^[a-zA-Z0-9_-]+$/.test(id) ? { type: 'preset', presetId: id } : null;
    }
    case 'blow': return { type: 'blow', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5), ...(args.length >= 5 ? { dx: num(args[3]), dy: num(args[4]) } : {}) };
    case 'drop': return { type: 'drop', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5) };
    case 'press': return { type: 'press', x: num(args[0], 0.5), y: num(args[1], 0.5), layer: 0, amount: num(args[2], 0.5) };
    case 'tilt': return { type: 'tilt', x: Math.max(-1, Math.min(1, num(args[0]))), y: Math.max(-1, Math.min(1, num(args[1]))) };
    case 'dye': return typeof args[0] === 'string' && /^#?[0-9a-fA-F]{6}$/.test(args[0]) ? { type: 'dye', color: args[0].startsWith('#') ? args[0] : `#${args[0]}` } : null;
    default: return null;
  }
};
const isPrivateAddress = (a) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/.test(a) || a === '::ffff:127.0.0.1' || /^::ffff:(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);

let oscStatus = 'off';
if (OSC_PORT > 0) {
  const udp = createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('error', (err) => { oscStatus = `off (${err.code ?? err.message})`; try { udp.close(); } catch { /* already */ } });
  udp.on('message', (buf, rinfo) => {
    if (!isPrivateAddress(rinfo.address)) return;
    let msgs;
    try { msgs = readOsc(buf); } catch { return; }
    for (const m of msgs) {
      const out = oscToMessage(m);
      if (out) broadcastTo('display', JSON.stringify(out));
    }
  });
  udp.bind(OSC_PORT, '0.0.0.0', () => { oscStatus = `udp ${OSC_PORT}`; });
}

// ── Art-Net ─────────────────────────────────────────────
//
// Out: the display tells us what colour each layer of the plate is, twenty
// times a second, and that becomes a universe of DMX. The par cans wash the
// room in whatever the dye is doing rather than in whatever somebody set
// before the doors opened. See `artnet.js` for why this lives here and not in
// the browser.
//
// In: a lighting desk drives settings, the same way OSC does, for a show
// where the desk is the thing with the running order in it.
const artnet = artnetConfig();
const ARTNET_IN = parseInMap(process.env.ARTNET_IN);
let artnetStatus = artnet ? `${artnet.host}:${artnet.port} universe ${artnet.universe}` : 'off';
/** The last thing the display said about the plate, resent at the frame rate. */
let plate = { layers: [], master: 0 };
let artSeq = 0;

if (artnet) {
  const out = createSocket({ type: 'udp4', reuseAddr: true });
  out.on('error', (err) => { artnetStatus = `off (${err.code ?? err.message})`; try { out.close(); } catch { /* already */ } });
  // Broadcast needs asking for, and a lighting network is very often reached
  // that way — 2.255.255.255 and 10.255.255.255 are both conventional here.
  out.bind(() => { try { out.setBroadcast(true); } catch { /* unicast only, which is fine */ } });
  const tick = setInterval(() => {
    const frame = buildUniverse(plate.layers, { ...artnet, master: plate.master });
    const packet = encodeArtDmx(artnet.universe, (artSeq = (artSeq % 255) + 1), frame);
    out.send(packet, artnet.port, artnet.host, () => { /* a rig that is not there is not an error */ });
  }, Math.round(1000 / artnet.rate));
  tick.unref?.();
}

if (ARTNET_IN.size > 0) {
  const seen = new Map();
  const listen = createSocket({ type: 'udp4', reuseAddr: true });
  listen.on('error', () => { try { listen.close(); } catch { /* already */ } });
  listen.on('message', (buf, rinfo) => {
    if (!isPrivateAddress(rinfo.address)) return;
    const packet = decodeArtDmx(buf);
    // Our own output, if we are broadcasting into the same universe we listen
    // on: taking it back in would be a loop that slowly walks every mapped
    // setting to whatever the fixture channel happens to hold.
    if (!packet || (artnet && packet.universe === artnet.universe)) return;
    const settings = patchFromUniverse(packet.data, ARTNET_IN, seen);
    if (settings) broadcastTo('display', JSON.stringify({ type: 'patch', settings }));
  });
  listen.bind(ARTNET_PORT, '0.0.0.0');
}

// ── Startup banner ─────────────────────────────────────────────────────

/**
 * A port that is already taken is the ordinary way this fails — a show server
 * still running in another window, or a `npm run dev` on the same port — and
 * without a handler here it arrives as an unhandled 'error' event: twelve
 * lines of Node stack ending in EADDRINUSE. That is a poor thing to have to
 * read in a dark room five minutes before a set, so it says what happened and
 * what to do about it instead. The OSC socket already degrades to "off" rather
 * than taking the show down with it.
 */
const portTaken = (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\n  Port ${PORT} is already in use, so the show server did not start.\n`);
  console.error('  Something is already listening there — most likely a show server still');
  console.error('  running in another window (look for the one printing a show key), or a');
  console.error('  "npm run dev".\n');
  console.error(`  Take the port back:   lsof -ti tcp:${PORT} | xargs kill`);
  console.error(`  Or use another one:   PORT=${PORT + 1} npm run remote\n`);
  console.error('  Nothing else was changed, and anything already deployed is unaffected.\n');
  process.exit(1);
};
// Both of them: `ws` attaches to the http server and re-emits its listen error
// on itself, and it is that copy which goes unhandled and prints the stack.
// Handling only the http server looks right and changes nothing.
server.on('error', portTaken);
wss.on('error', portTaken);

server.listen(PORT, '0.0.0.0', () => {
  const hosts = lanAddresses();
  console.log('\n  ChromaGlass show server\n');
  console.log(`  Show key:           ${SHOW_KEY}`);
  console.log(`  Laptop (the show):  http://localhost:${PORT}/`);
  if (artnet) console.log(`  Art-Net out:        ${artnetStatus}  (${artnet.count} x ${artnet.order} from channel ${artnet.start}, ${artnet.rate} fps)`);
  if (ARTNET_IN.size > 0) console.log(`  Art-Net in:         udp port ${ARTNET_PORT}  (${[...ARTNET_IN].map(([c, m]) => `${c}->${m.key}`).join(', ')})`);
  if (OSC_PORT > 0) console.log(`  OSC in:             udp port ${OSC_PORT}  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye)`);
  if (hosts.length === 0) {
    console.log('  No LAN address found — is this machine on a network?');
  } else {
    for (const host of hosts) {
      console.log(`  Phone (the remote): http://${host}:${PORT}/?remote=1&key=${SHOW_KEY}`);
      console.log(`  Network display:    http://${host}:${PORT}/?cast=true&key=${SHOW_KEY}`);
    }
  }
  console.log('\n  Same Wi-Fi: use the addresses above. Across buildings, other access points');
  console.log('  or the internet: run "npm run tunnel" in another window and use the https');
  console.log(`  address it prints, with ?cast=true&key=${SHOW_KEY} or ?remote=1&key=${SHOW_KEY}.\n`);
});
