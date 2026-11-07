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
import { chmodSync, createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createSocket } from 'node:dgram';
import { startLink } from './abletonLink.js';
import { encodeBundle, encodeOsc, feedMessages, oscOutTarget, oscToMessage, readOsc } from './osc.js';
import { ARTNET_PORT, artnetConfig, artnetInUniverse, buildUniverse, decodeArtDmx, encodeArtDmx, parseInMap, patchFromUniverse } from './artnet.js';
import { ACCOUNT_SHOWS_PATH, createAccountShowsHandler } from './account-shows.js';
import { createServerLicenseManager, LICENSE_ACTIVATE_PATH, LICENSE_DEACTIVATE_PATH, LICENSE_INFO_PATH } from './server-license.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(process.env.REMOTE_DIST ?? join(HERE, '..', 'dist'));
const PORT = Number(process.env.PORT ?? 3000);
// The show key: a phone or a network display must present it to join. It
// matters once the server is reachable beyond the room (through a tunnel,
// across buildings) where anyone with the address could otherwise drive the
// show, and it matters on a venue's Wi-Fi, which is a room full of strangers.
//
// It used to be four digits, new at every launch: ten thousand guesses, with
// nothing to stop a script making all of them in a few seconds (PLAN 14m). Now
// it is eight, so a guess is one in ninety million, and three wrong ones lock
// that address out for five minutes (`wrongKey` below). An address is not a
// person, though: one IPv6 customer is handed a /48, sixty-five thousand of the
// /64s counted below as one address each, so the lock is backed by a budget for
// the whole server, thirty wrong keys a minute from everyone but the laptop
// (`WRONG_BUDGET`). Past that the server takes no keys from anyone new for a
// minute, so a script with any number of addresses makes about twenty thousand
// guesses a day and needs years to find the key. It is also kept, in
// `server/.show-key` (readable by the owner's account alone, and ignored by
// git), because a key that changes at
// every launch means every phone at the gig has to be re-scanned after a
// restart in the middle of a set. SHOW_KEY in the environment still wins, for
// a key the owner chooses; SHOW_KEY_FILE moves the file (the `showkey` check
// keeps its own). If the file cannot be written the key lasts this launch.
const KEY_FILE = process.env.SHOW_KEY_FILE ?? join(HERE, '.show-key');
const keptKey = () => {
  try {
    const k = readFileSync(KEY_FILE, 'utf8').trim();
    // A shorter key from an older build is exactly what this replaces.
    return /^\d{8,}$/.test(k) ? k : null;
  } catch { return null; }
};
const newKey = () => {
  const k = String(randomInt(10_000_000, 100_000_000));
  try {
    writeFileSync(KEY_FILE, `${k}\n`, { mode: 0o600 });
    // `mode` only applies when the file is created; one left by an older
    // build keeps whatever it had, so it is set again.
    chmodSync(KEY_FILE, 0o600);
  } catch { /* read-only checkout: the key is for this launch only */ }
  return k;
};
const SHOW_KEY = String(process.env.SHOW_KEY ?? keptKey() ?? newKey());
// The display's key. The display is the one role that can do anything with a
// phone's say-so (it is what phones talk to), so a phone's key must not open
// it: a guest with the show key could otherwise sign in as the display and be
// sent every phone's touches, or answer them. It is given only to the laptop
// itself (`isLaptop`), is long because nobody ever types it, and is new at
// every launch because nothing outside this machine ever holds it: the laptop's
// page asks for it again when a restart turns its old one away.
const DISPLAY_KEY = randomBytes(16).toString('hex');
const digest = (s) => createHash('sha256').update(String(s)).digest();
/** Compared by digest so the time taken says nothing about how much of a guess was right. */
const keyIs = (given, key) => timingSafeEqual(digest(given ?? ''), digest(key));

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
/**
 * The laptop itself: a request from this machine, not forwarded by the tunnel
 * or a proxy, and addressed to this machine by a local name. The last part is
 * what stops DNS rebinding: a web page anywhere can point its own name at
 * 127.0.0.1 and have the laptop's browser fetch `/remote-info.json` from it,
 * and that request comes from loopback with no forwarding headers. Its Host is
 * the page's name, though, which is how it is told apart. The Mac app loads
 * `http://localhost:<port>` and asks `127.0.0.1` for the key, so both pass.
 */
const isLaptop = (req) => {
  if (!LOOPBACK.test(req.socket.remoteAddress ?? '')) return false;
  if (req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip']) return false;
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127\.\d+\.\d+\.\d+$/.test(host);
};
/**
 * Who a request is, for counting wrong keys and sockets. Through the tunnel
 * every request arrives from loopback and the caller is in cf-connecting-ip
 * (or x-forwarded-for, behind another proxy); those headers are believed only
 * from loopback, where nothing but our own tunnel can be. Anyone else could
 * write them to pose as a fresh address at every guess. An IPv6 caller can
 * hold a whole /64, so it is counted by its /64.
 */
const clientAddress = (req) => {
  const direct = req.socket.remoteAddress ?? '';
  const forwarded = LOOPBACK.test(direct)
    ? req.headers['cf-connecting-ip'] ?? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]
    : '';
  const a = String(forwarded || direct).trim().replace(/^::ffff:/, '').replace(/%.*$/, '').toLowerCase();
  if (!a.includes(':')) return a;
  const [head, tail = ''] = a.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = a.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
};
const WS_PATH = '/remote-ws';
/**
 * OSC: Resolume, TouchDesigner, Max, Ableton (via Connection Kit) and the
 * phone OSC apps all speak it over UDP. Messages arrive here and drive the
 * display like a phone would; see oscToMessage for the address space.
 * OSC_PORT=0 turns it off. UDP has no show key, so anyone on the same network
 * who can send a packet drives the show (the security audit of 2026-10-28,
 * finding 4): the terminal server keeps hearing the LAN, as it always has, and
 * OSC_BIND=127.0.0.1 narrows it to this machine. The Mac app starts with it
 * off and turns it on from its Show menu, on this Mac or on the network, by
 * `setOsc` below (desktop/main.js).
 */
const OSC_PORT = Number(process.env.OSC_PORT ?? 9000);
const OSC_BIND = process.env.OSC_BIND ?? '0.0.0.0';
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

const handleAccountShows = createAccountShowsHandler();
const licenseManager = createServerLicenseManager();

/*
  OSC and Art-Net are Pro (PLAN.md §23's table, the Pro page, the Settings
  tiles), and until PLAN.md 34a-7a nothing here asked: a Home key, or no key
  at all in the Mac app, drove the show over OSC and fed a lighting rig. The
  gate is here rather than in the Mac app's menu because this is where the
  packets arrive and leave, so a Home key that sets OSC_PORT or ARTNET_HOST by
  hand meets it too, and the menu cannot drift from it.

  The tier is the page's own rule (`getEffectiveTier` in src/lib/tierGates.ts):
  a verified key gives its tier; with no key, an enforced launch (the packed
  Mac app, `CHROMAGLASS_REQUIRE_SIGNIN` or `CHROMAGLASS_ENFORCE_TIERS`) is free,
  and a bare `npm run show` on a developer's machine is Pro, as every local
  build of the page is, so working on the server and its checks needs no key.

  It is asked per packet, against a copy kept fresh: `currentStatus` reads the
  licence file and verifies the key's signature, which is too much for every
  OSC message at a controller's rate and too slow for the Art-Net tick. The
  copy is renewed as soon as this server files or removes a key, and every two
  seconds besides, because the Mac app's main process files keys through its
  own manager on the same file (desktop/main.js). Until the first answer
  arrives nothing passes: a refusal for a few milliseconds at start is cheaper
  than a free launch that drives the rig before its tier is known.
*/
let showTier = null;
const refreshTier = async () => {
  try {
    const s = await licenseManager.currentStatus();
    showTier = s.valid ? s.tier : s.enforced ? 'free' : 'pro';
  } catch { /* keep the last answer */ }
  return showTier;
};
const proLinks = () => showTier === 'pro';
/** For the Mac app's menu and Show Server Details: the tier the server last read, and whether OSC and Art-Net are open to it. */
export const linkTier = () => ({ tier: showTier, pro: proLinks() });
void licenseManager.initFromEnv().then(refreshTier);
setInterval(refreshTier, 2000).unref?.();

// ── Static files, with SPA fallback ────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === ACCOUNT_SHOWS_PATH) {
    void handleAccountShows(req, res, url);
    return;
  }
  if (
    url.pathname === LICENSE_INFO_PATH ||
    url.pathname === LICENSE_ACTIVATE_PATH ||
    url.pathname === LICENSE_DEACTIVATE_PATH
  ) {
    void licenseManager.handleRequest(req, res, url.pathname, isLaptop(req)).then(refreshTier);
    return;
  }
  // The display asks for this before opening a socket, so a page served from
  // anywhere else knows not to try. Static hosts answer with index.html.
  if (url.pathname === INFO_PATH) {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    // The LAN addresses let the show print the URL a network display opens.
    // The keys go to the laptop alone: anyone on the Wi-Fi can ask this, and
    // a key it gave them would be the key to the show.
    const laptop = isLaptop(req);
    res.end(JSON.stringify({ chromaglass: 'relay', path: WS_PATH, port: PORT, hosts: lanAddresses(), key: laptop ? SHOW_KEY : null, displayKey: laptop ? DISPLAY_KEY : null }));
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
//
// The door, before any of that (PLAN 14m). A browser lets any web page open a
// socket to any address, this machine's included, and sends the page's Origin
// with it, so a site the laptop or a phone happens to have open could reach
// the show. What is let in: no Origin (the native apps' own sockets, and the
// checks), a page this server served (its Origin names the Host it asked),
// the iPhone app (capacitor://localhost) and a page on this machine under any
// port (`npm run dev`, the Mac app). Everything else is answered 403.
//
// How many: sixteen sockets an address and two hundred in all, answered 429
// beyond. A phone holds one, the laptop's tabs a few; a venue's phones
// through the tunnel all share the venue's one public address, so sixteen is
// a limit on a busy room's guests too, which is the right side to err on for
// a show (the owner can raise it in a later item if a gig needs it). The
// laptop is counted by neither.
const MAX_PER_ADDRESS = 16;
const MAX_SOCKETS = 200;
// And four an address that have not said who they are yet. A socket that
// never says hello is closed at five seconds (HELLO_MS), but the two hundred
// count it until then, and from a few dozen /64s a script could open nothing
// but those and keep every new phone out (the review of PLAN 14m). A phone says
// hello the moment its socket opens, so four is slack for a room full of
// phones joining through one address at once; a fifth waits for its backoff.
const MAX_UNNAMED = 4;
const unnamedBy = new Map();
const MAX_FRAME = 512 * 1024;
const openBy = new Map();
let openTotal = 0;
const LOCAL_ORIGIN = /^(capacitor|ionic):\/\/localhost$|^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:\d+)?$/;
const originAllowed = (req) => {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (LOCAL_ORIGIN.test(origin)) return true;
  try { return new URL(origin).host === String(req.headers.host ?? ''); } catch { return false; }
};
const verifyClient = ({ req }, done) => {
  if (!originAllowed(req)) { done(false, 403, 'Not from this show'); return; }
  req.laptop = isLaptop(req);
  req.address = clientAddress(req);
  if (req.laptop) { done(true); return; }
  const mine = openBy.get(req.address) ?? 0;
  const unnamed = unnamedBy.get(req.address) ?? 0;
  if (mine >= MAX_PER_ADDRESS || unnamed >= MAX_UNNAMED || openTotal >= MAX_SOCKETS) { done(false, 429, 'Too many connections'); return; }
  openBy.set(req.address, mine + 1);
  unnamedBy.set(req.address, unnamed + 1);
  req.unnamed = true;
  openTotal++;
  // Counted down when the TCP socket goes, however it goes: a refused
  // upgrade, a close, a terminate, or a phone that walked out of range.
  req.socket.once('close', () => {
    named(req);
    openTotal--;
    const n = (openBy.get(req.address) ?? 1) - 1;
    if (n > 0) openBy.set(req.address, n); else openBy.delete(req.address);
  });
  done(true);
};
// `maxPayload`: a frame over half a megabyte closes its socket (1009) as it
// arrives, rather than being read whole into memory and then thrown away,
// which is what the old length check after `toString()` did. The biggest
// thing the show sends is a cast frame, well under it.
/** A socket that has said hello, or gone, no longer counts against its address's four. */
const named = (req) => {
  if (!req.unnamed) return;
  req.unnamed = false;
  const n = (unnamedBy.get(req.address) ?? 1) - 1;
  if (n > 0) unnamedBy.set(req.address, n); else unnamedBy.delete(req.address);
};
const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: MAX_FRAME, verifyClient });
const roles = new WeakMap();

/**
 * Wrong keys, by address. Three, each within five minutes of the last, lock
 * the address out for five minutes, and while it is locked even the right
 * key is refused, or the lock would only slow a script down to the pace of
 * its own retries. The laptop is
 * never locked out: a stale display key after a restart is a wrong key, and
 * the show must not lock itself out of its own relay.
 */
const WRONG_KEYS = 3;
const LOCKOUT_MS = 5 * 60_000;
const wrongKeys = new Map();
/**
 * And the whole server's: past thirty wrong keys in a minute, from however
 * many addresses, nobody new is let in for a minute (the key comment at the top
 * says why). What that costs the show: a script with a dozen addresses can keep
 * new phones out, a phone that drops can't rejoin until it clears, and the
 * phones already in, the laptop and its display are never touched. A show being
 * driven by a stranger is the worse of the two.
 */
const WRONG_BUDGET = 30;
const BUDGET_MS = 60_000;
const budget = { start: 0, count: 0, until: 0 };
const lockedFor = (address, now = Date.now()) =>
  Math.max(0, (wrongKeys.get(address)?.until ?? 0) - now, budget.until - now);
const wrongKey = (address, now = Date.now()) => {
  const entry = wrongKeys.get(address) ?? { count: 0, until: 0, at: now };
  if (now - entry.at > LOCKOUT_MS) entry.count = 0;
  entry.count++;
  entry.at = now;
  if (entry.count >= WRONG_KEYS) { entry.count = 0; entry.until = now + LOCKOUT_MS; }
  wrongKeys.set(address, entry);
  if (now - budget.start > BUDGET_MS) { budget.start = now; budget.count = 0; }
  if (++budget.count > WRONG_BUDGET) {
    budget.until = now + BUDGET_MS;
    console.log(`  more than ${WRONG_BUDGET} wrong keys in a minute: taking none for a minute`);
  }
};
// A socket must say who it is within five seconds. One that never does is
// either a scanner or something that will hold a slot until the heartbeat
// notices, and sixteen of those would lock an address's phones out.
const HELLO_MS = 5_000;

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
  const now = Date.now();
  for (const [address, entry] of wrongKeys) {
    if (entry.until < now && now - entry.at > LOCKOUT_MS) wrongKeys.delete(address);
  }
}, 30_000);
heartbeat.unref();

/** Messages only the relay itself may send; a client sending one is ignored. */
const RELAY_ONLY = new Set(['denied', 'request-state', 'request-cast', 'mirrors', 'controllers', 'hello', 'link', 'osc-out']);

wss.on('connection', (socket, req) => {
  roles.set(socket, 'unknown');
  socket.isAlive = true;
  const { laptop, address } = req;
  // The laptop is exempt: `npm run phonelink` holds a quiet socket open from
  // it on purpose, and the laptop's own tabs are not strangers.
  const deadline = laptop ? null : setTimeout(() => { if (roles.get(socket) === 'unknown') socket.terminate(); }, HELLO_MS);
  deadline?.unref?.();
  socket.on('pong', () => { socket.isAlive = true; });
  // A protocol violation from a client is that client's problem, not the show's.
  socket.on('error', (err) => { console.log(`  socket error: ${err.message}`); });

  socket.on('message', (data) => {
    const raw = data.toString();
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return;

    if (message.type === 'hello') {
      // One hello a socket: a second would be a free guess past the lock.
      if (roles.get(socket) !== 'unknown') return;
      const role = message.role === 'display' ? 'display' : message.role === 'mirror' ? 'mirror' : 'controller';
      const locked = laptop ? 0 : lockedFor(address);
      if (locked > 0) {
        console.log(`  ${role} refused: ${address} is locked out for ${Math.ceil(locked / 60_000)} min`);
        socket.send(JSON.stringify({ type: 'denied', reason: 'locked', retryMs: locked }));
        socket.close();
        return;
      }
      if (!keyIs(message.key, role === 'display' ? DISPLAY_KEY : SHOW_KEY)) {
        // A display with no key is not a guess: it is the laptop's own page
        // opened at an address the relay does not give the display key to
        // (its Wi-Fi address, say), which the page no longer even sends
        // (useRemoteLink). An old page that does must not lock the room out.
        const guess = !(role === 'display' && (message.key === undefined || message.key === null || message.key === ''));
        if (!laptop && guess) wrongKey(address);
        console.log(`  ${role} refused: wrong ${role === 'display' ? 'display' : 'show'} key`);
        socket.send(JSON.stringify({ type: 'denied', reason: 'key' }));
        socket.close();
        return;
      }
      // A good key does not wipe the address's wrong ones: an address can be a
      // venue's whole Wi-Fi behind one router, and a guest joining must not
      // hand the stranger beside them three fresh guesses. They lapse instead,
      // five minutes after the last (`wrongKey`).
      named(req);
      clearTimeout(deadline);
      roles.set(socket, role);
      const count = [...wss.clients].filter(c => roles.get(c) === role).length;
      console.log(`  ${role} connected (${count} now)`);
      // A joining phone needs the current state before it can show anything;
      // a joining network display needs the show itself.
      if (role === 'controller') {
        broadcastTo('display', JSON.stringify({ type: 'request-state' }));
        broadcastTo('display', JSON.stringify({ type: 'controllers', count }));
      }
      if (role === 'mirror') {
        broadcastTo('display', JSON.stringify({ type: 'request-cast' }));
        broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
      }
      if (role === 'display') {
        const phoneCount = [...wss.clients].filter(c => roles.get(c) === 'controller').length;
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'controllers', count: phoneCount }));
          // Tells the page Link is here to switch on, which a page with no
          // show server behind it never hears, so it never offers the switch.
          socket.send(linkMessage());
          // And OSC out's state, which offers its switch the same way.
          socket.send(oscOutMessage());
        }
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
      if (oscOut) sendOscOut(encodeBundle(feedMessages(message)));
      return;
    }
    // A beat the plate pressed on, out to the VJ app at once: 1 now, 0 a
    // twentieth of a second later, a button's press and release.
    if (message.type === 'beat') {
      if (from !== 'display' || !oscOut) return;
      sendOscOut(encodeOsc('/chromaglass/out/beat', [1]));
      clearTimeout(beatRelease);
      beatRelease = setTimeout(() => { beatRelease = null; sendOscOut(encodeOsc('/chromaglass/out/beat', [0])); }, 50);
      beatRelease.unref?.();
      return;
    }
    // OSC out on, off or somewhere else, from the laptop's own page only, as
    // Link is: a phone pointing the show's feed at another machine is not a
    // remote's job.
    if (message.type === 'osc-out-enable') {
      if (from === 'display') setOscOut(message.on === true ? oscOutTarget(message.target) : null);
      return;
    }
    // Link on or off, from the laptop's own page only: a phone switching the
    // room's clock source is not a remote's job.
    if (message.type === 'link-enable') {
      if (from === 'display') setLink(message.on === true);
      return;
    }
    if (from === 'mirror') return;   // a display only listens
    // Displays talk to phones; phones talk to displays.
    broadcastTo(from === 'display' ? 'controller' : 'display', raw, socket);
  });

  socket.on('close', () => {
    clearTimeout(deadline);
    const role = roles.get(socket);
    if (role && role !== 'unknown') console.log(`  ${role} disconnected`);
    if (role === 'controller') {
      const count = [...wss.clients].filter(c => c !== socket && roles.get(c) === 'controller').length;
      broadcastTo('display', JSON.stringify({ type: 'controllers', count }));
    }
    if (role === 'mirror') {
      const count = [...wss.clients].filter(c => c !== socket && roles.get(c) === 'mirror').length;
      broadcastTo('display', JSON.stringify({ type: 'mirrors', count }));
    }
  });
});

// ── OSC in ─────────────────────────────────────────────────────────────
// The reader and the address space are `osc.js`, beside the writer OSC out uses.
const isPrivateAddress = (a) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/.test(a) || a === '::ffff:127.0.0.1' || /^::ffff:(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);

let oscStatus = 'off';
let oscSocket = null;
/**
 * Listen for OSC on `port` at `host`, or stop listening (port 0). Closing and
 * opening the socket here, not restarting the server, is what lets the Mac
 * app's menu change who can drive the show without dropping the phones that
 * are already connected to it. Resolves to `oscState()` once the socket has bound or failed.
 */
export function setOsc(port, host = '127.0.0.1') {
  const old = oscSocket;
  oscSocket = null;
  oscStatus = 'off';
  try { old?.close(); } catch { /* already closed */ }
  if (!(port > 0)) return Promise.resolve(oscStatus);
  const udp = createSocket({ type: 'udp4', reuseAddr: true });
  oscSocket = udp;
  let bound = () => {};
  udp.on('error', (err) => {
    if (oscSocket === udp) { oscStatus = `off (${err.code ?? err.message})`; oscSocket = null; }
    try { udp.close(); } catch { /* already */ }
    bound();
  });
  udp.on('message', (buf, rinfo) => {
    if (!isPrivateAddress(rinfo.address) || !proLinks()) return;
    let msgs;
    try { msgs = readOsc(buf); } catch { return; }
    for (const m of msgs) {
      const out = oscToMessage(m);
      if (out) broadcastTo('display', JSON.stringify(out));
    }
  });
  return new Promise((done) => {
    bound = () => done(oscStatus);
    udp.bind(port, host, () => { if (oscSocket === udp) oscStatus = `udp ${host}:${port}`; bound(); });
  });
}
/** What the OSC socket is doing (`setOsc` resolves to the same words once it has bound or failed), for the Mac app's menu: `off`, `off (EADDRINUSE)` or `udp host:port`. */
export const oscState = () => oscStatus;
setOsc(OSC_PORT, OSC_BIND);

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
const ARTNET_IN_UNIVERSE = artnetInUniverse();
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
    // Not Pro, no packets: a rig left dark rather than one held on a last frame.
    if (!proLinks()) return;
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
    if (!isPrivateAddress(rinfo.address) || !proLinks()) return;
    const packet = decodeArtDmx(buf);
    // Our own output, if we are broadcasting into the same universe we listen
    // on: taking it back in would be a loop that slowly walks every mapped
    // setting to whatever the fixture channel happens to hold.
    if (!packet || (artnet && packet.universe === artnet.universe)) return;
    // A lighting network carries every universe its desk drives, and each of
    // them would otherwise be read as ours: a dimmer rack's universe on
    // channel 1 walking audioImpact to whatever the house lights are at.
    // ARTNET_IN_UNIVERSE names the one the desk sends us; unset, any universe
    // is heard, as before, for a desk that drives nothing else.
    if (ARTNET_IN_UNIVERSE !== null && packet.universe !== ARTNET_IN_UNIVERSE) return;
    const settings = patchFromUniverse(packet.data, ARTNET_IN, seen);
    if (settings) broadcastTo('display', JSON.stringify({ type: 'patch', settings }));
  });
  listen.bind(ARTNET_PORT, '0.0.0.0');
}

// ── Ableton Link ───────────────────────────────────────────────────────
//
// The music's tempo and bar from Live, Bitwig, Traktor or an iPad's AUM, on
// the network the show server is already on (`abletonLink.js`, PLAN.md
// 13.5-link). Off until the laptop's page switches it on, so a show server
// never shows up in somebody's Link session uninvited.
//
// The reading goes to the displays twenty times a second: the beat as Link
// counts it at the moment of sending, which the page stamps on arrival. On
// the one machine the socket is well under a millisecond and the page keeps
// the earliest-arriving stamp (`TempoSource.linkReading`), so a late frame
// does not drag the phase. A beat at 200 bpm is 300 ms; a twentieth of a
// second between readings is only how fast a tempo change is heard.
let link = null;
let linkTimer = null;
const linkMessage = () => JSON.stringify(link ? { type: 'link', on: true, ...link.reading() } : { type: 'link', on: false, peers: 0, bpm: 0, beat: null, playing: false });
function setLink(on) {
  if (on === (link !== null)) { broadcastTo('display', linkMessage()); return; }
  if (on) {
    link = startLink({ onError: (err) => console.log(`  Ableton Link: ${err.code ?? err.message}`) });
    linkTimer = setInterval(() => broadcastTo('display', linkMessage()), 50);
    linkTimer.unref?.();
    console.log('  Ableton Link:       on (following the session on this network)');
  } else {
    clearInterval(linkTimer);
    link.stop();
    link = null;
    console.log('  Ableton Link:       off');
  }
  broadcastTo('display', linkMessage());
}

// ── OSC out (PLAN.md 13.5-osc) ─────────────────────────────────────────
//
// The plate's colour, the ear's readings and the beat, out to a VJ app, the
// way Art-Net sends the colour to the rig: the page reports them in its
// `lights` message twenty times a second and each beat as it lands (`beat`),
// and they leave here as OSC because a page cannot send UDP. Off until the
// laptop's own page switches it on (Settings, Sound: OSC out) or OSC_OUT names
// a target at launch; Pro, like OSC in, and asked per packet the same way.
//
// One bundle per report, not thirty packets: thirty-odd addresses twenty
// times a second is six hundred datagrams a second on a venue's Wi-Fi if sent
// apart, and every receiver we name (Resolume, VDMX, TouchDesigner, Max,
// TouchOSC) unpacks a bundle. The beat goes alone and at once, so it is not
// held for the next report: a strobe on the kick that lands up to 50 ms late
// is a strobe off the kick.
let oscOut = null;   // { host, port, socket }
let oscOutSays = 'off';
// Switched off on purpose (by the page or the Mac app), as against off because
// this server has just started: the page re-asks only in the second case, so a
// relaunched server comes back on and an operator's "off" stays off.
let oscOutStopped = false;
let beatRelease = null;
const oscOutMessage = () => JSON.stringify({
  type: 'osc-out', on: oscOut !== null, target: oscOut ? `${oscOut.host}:${oscOut.port}` : null,
  pro: proLinks(), says: oscOutSays, stopped: oscOutStopped,
});
const sendOscOut = (packet, o = oscOut) => {
  if (!o || !proLinks()) return;
  // A send's own failure (EHOSTUNREACH, ENETUNREACH: the VJ machine's Wi-Fi
  // gone) comes to this callback and not to 'error', so it is treated here as
  // the socket's error is, and said, rather than streaming on into nothing.
  // ECONNREFUSED, a port with nobody listening yet, is not one: Resolume opened
  // after the show is the ordinary order.
  o.socket.send(packet, o.port, o.host, (err) => { if (err && err.code !== 'ECONNREFUSED') o.fail(err); });
};
/** Send OSC out to `{ host, port }`, or stop (null). Exported for the Mac app, beside `setOsc`. */
export function setOscOut(target) {
  const old = oscOut;
  // A beat's 1 already sent is released on the target that got it, or a VJ
  // app's button switched off inside those 50 ms stays pressed.
  // The socket closes once that 0 has left: closed straight after a send, the
  // datagram is dropped (the first run of `npm run oscout` caught a lone 1).
  const close = () => { try { old?.socket.close(); } catch { /* already */ } };
  if (beatRelease && old && proLinks()) {
    clearTimeout(beatRelease); beatRelease = null;
    old.socket.send(encodeOsc('/chromaglass/out/beat', [0]), old.port, old.host, close);
  } else close();
  oscOut = null;
  oscOutSays = 'off';
  oscOutStopped = !target;
  if (target) {
    const socket = createSocket({ type: 'udp4' });
    const mine = { ...target, socket };
    mine.fail = (err) => {
      if (oscOut === mine) { oscOut = null; oscOutSays = `off (${err.code ?? err.message})`; broadcastTo('display', oscOutMessage()); }
      try { socket.close(); } catch { /* already */ }
    };
    socket.on('error', mine.fail);
    // A target like 192.168.1.255 reaches every VJ machine on the network,
    // which a socket has to ask for.
    socket.bind(() => { try { socket.setBroadcast(true); } catch { /* unicast only */ } });
    oscOut = mine;
    oscOutSays = `udp ${target.host}:${target.port}`;
  }
  broadcastTo('display', oscOutMessage());
  return oscOutSays;
}
/** What OSC out is doing: `off`, `off (EHOSTUNREACH)` or `udp host:port`. */
export const oscOutState = () => oscOutSays;
const OSC_OUT_AT_LAUNCH = oscOutTarget(process.env.OSC_OUT);
if (OSC_OUT_AT_LAUNCH) setOscOut(OSC_OUT_AT_LAUNCH);

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
  console.log(`  Show key:           ${SHOW_KEY}${process.env.SHOW_KEY ? '' : '  (kept between launches; delete server/.show-key for a new one)'}`);
  console.log(`  Laptop (the show):  http://localhost:${PORT}/`);
  if (oscOut) console.log(`  OSC out:            ${oscOutSays}  (/chromaglass/out/colour, /sound, /band, /bpm, /beat; docs/osc.md)`);
  if (artnet) console.log(`  Art-Net out:        ${artnetStatus}  (${artnet.count} x ${artnet.order} from channel ${artnet.start}, ${artnet.rate} fps)`);
  if (ARTNET_IN.size > 0) console.log(`  Art-Net in:         udp port ${ARTNET_PORT}${ARTNET_IN_UNIVERSE === null ? '' : ` universe ${ARTNET_IN_UNIVERSE}`}  (${[...ARTNET_IN].map(([c, m]) => `${c}->${m.key}`).join(', ')})`);
  if (OSC_PORT > 0) console.log(`  OSC in:             udp port ${OSC_PORT}${OSC_BIND === '0.0.0.0' ? '' : ` on ${OSC_BIND}`}  (/chromaglass/setting/<key> <n>, /chromaglass/action/<name>, /chromaglass/preset <id>, /blow /drop /press /tilt /dye; every address: docs/osc.md)`);
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
