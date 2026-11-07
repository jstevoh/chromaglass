// Ableton Link in, for the show server (PLAN.md 13.5-link).
//
// Link is the shared clock of the music apps on a local network: Live,
// Bitwig, Traktor, Resolume, VDMX, TouchDesigner, and on an iPad AUM, Loopy
// Pro and Drambo. Every app in a session agrees on one tempo and on where the
// bar is, without a cable or a master. A page cannot join it (Link is UDP
// multicast, which no browser can open), so it lives here, beside OSC and
// Art-Net, and the display is told the tempo and the beat over the socket it
// already has.
//
// Why a peer written here and not Ableton's library. The library is C++; from
// Node it is a native addon, rebuilt against every Electron the Mac app moves
// to, signed and notarised with it, and licensed GPLv2 or under a separate
// agreement with Ableton. The wire protocol under it is small: a UDP multicast
// announcement of each peer's state, and a unicast ping and pong that measures
// the offset between two machines' clocks. This file speaks that protocol, read
// from the protocol's layout in the open source tree and nothing copied from it.
// What it has not had is a real Live on the other end: `npm run link` plays
// both sides with this file's own codec, so the first real session is the
// owner's (docs/judging.md).
//
// How the protocol fits together, as far as this peer needs it:
//
//   - Every peer multicasts an *Alive* to 224.76.78.75:20808 on each of its
//     interfaces four times a second: its id, its session's id, the session's
//     timeline (tempo, a beat and the time it fell), the transport's start and
//     stop, and the address it answers pings on. A peer that hears an Alive
//     answers the sender with a *Response* carrying its own state, so a new
//     peer learns the room in one round trip. A peer that leaves says *ByeBye*;
//     one that says nothing for five seconds (its ttl) is gone.
//   - Times in a session are *ghost time*: each peer's own clock plus an offset
//     it measured. To join a session a peer pings one of its members a hundred
//     times; each pong carries the member's ghost time, and the median of the
//     differences is the offset. Then the session's timeline means the same
//     moment on both machines.
//   - Two sessions that meet merge: the one whose ghost clock has run longer
//     wins (half a second's grace, then the lower id), so the session that was
//     there first keeps its tempo.
//   - Within a session the timeline with the larger beat origin wins, which is
//     how a tempo change from any peer reaches all of them.
//
// One departure, on purpose: this peer listens first. Ableton's library starts
// a session of its own the moment it is enabled, and a session that is older
// than Live's wins the merge, so a show server started before Live would hand
// Live its own 120 bpm when Live opened. The show is a follower of the music,
// never the other way round, so this peer says nothing until it has measured
// and joined a session someone else made, and goes quiet again when the last
// of them leaves. It still answers pings, which costs nothing.

import { createSocket } from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';

export const LINK_GROUP = '224.76.78.75';
export const LINK_PORT = 20808;
/** How often the interfaces are read again: Ableton's library's own thirty seconds. */
export const RESCAN_MS = 30_000;

const DISCOVERY = Buffer.from('_asdp_v\x01', 'latin1');
const MEASURE = Buffer.from('_link_v\x01', 'latin1');
const ALIVE = 1, RESPONSE = 2, BYEBYE = 3;
const PING = 1, PONG = 2;
const TTL_S = 5;
/** The library's nominal broadcast period: the ttl over a ratio of twenty. */
const BROADCAST_MS = 250;
/** Pings a measurement takes before it settles, as the library does. */
const MEASURE_POINTS = 100;
/** A ping with no pong after this is sent again, at most MEASURE_TRIES times. */
const PING_TIMEOUT_MS = 50;
const MEASURE_TRIES = 5;
/** The current session is measured again this often, so two clocks that drift stay one. */
const REMEASURE_MS = 30_000;
const SESSION_EPS_US = 500_000;
const MAX_MESSAGE = 512;

const key = (s) => s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3);
const TMLN = key('tmln'), SESS = key('sess'), STST = key('stst'), MEP4 = key('mep4');
const GT = key('__gt'), PGT = key('_pgt'), HT = key('__ht');

// ── The codec: the bytes on the wire, with no sockets, so the check can play both sides ──

/** Payload entries are a four-character key, a byte count, then the value, all big-endian. */
export function encodeEntries(entries) {
  const parts = [];
  for (const [k, v] of entries) {
    const head = Buffer.alloc(8);
    head.writeInt32BE(k, 0);
    head.writeUInt32BE(v.length, 4);
    parts.push(head, v);
  }
  return Buffer.concat(parts);
}

/** Entries by key; null for a payload that runs past its own end, which is dropped whole. */
export function decodeEntries(buf, at) {
  const out = new Map();
  while (at < buf.length) {
    if (at + 8 > buf.length) return null;
    const k = buf.readInt32BE(at);
    const n = buf.readUInt32BE(at + 4);
    if (at + 8 + n > buf.length) return null;
    out.set(k, buf.subarray(at + 8, at + 8 + n));
    at += 8 + n;
  }
  return out;
}

const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(Math.round(n))); return b; };
const readI64 = (b, at = 0) => Number(b.readBigInt64BE(at));

/** A timeline: microseconds a beat, then the beat origin in millionths of a beat, then the time origin in microseconds. */
export const encodeTimeline = (t) => Buffer.concat([i64(t.microsPerBeat), i64(t.beatOrigin * 1e6), i64(t.timeOrigin)]);
export function decodeTimeline(b) {
  if (!b || b.length !== 24) return null;
  const microsPerBeat = readI64(b, 0);
  if (!(microsPerBeat > 0)) return null;
  return { microsPerBeat, beatOrigin: readI64(b, 8) / 1e6, timeOrigin: readI64(b, 16) };
}
/** Start and stop: playing, the beat it happened on, and when the change was made (the newest wins). */
export const encodeStartStop = (s) => Buffer.concat([Buffer.from([s.playing ? 1 : 0]), i64(s.beats * 1e6), i64(s.timestamp)]);
export const decodeStartStop = (b) => (b && b.length === 17 ? { playing: b[0] !== 0, beats: readI64(b, 1) / 1e6, timestamp: readI64(b, 9) } : null);
export function encodeEndpoint(address, port) {
  const b = Buffer.alloc(6);
  address.split('.').forEach((p, i) => { b[i] = Number(p); });
  b.writeUInt16BE(port, 4);
  return b;
}
export const decodeEndpoint = (b) => (b && b.length === 6 ? { address: `${b[0]}.${b[1]}.${b[2]}.${b[3]}`, port: b.readUInt16BE(4) } : null);

/** A discovery message: the protocol header, then type, ttl, group and the sender's 8-byte id, then entries. */
export function encodeDiscovery(type, ident, entries, ttl = TTL_S) {
  const head = Buffer.alloc(12);
  head[0] = type; head[1] = ttl; head.writeUInt16BE(0, 2); ident.copy(head, 4);
  return Buffer.concat([DISCOVERY, head, encodeEntries(entries)]);
}
export function decodeDiscovery(buf) {
  if (buf.length < 20 || buf.length > MAX_MESSAGE || !buf.subarray(0, 8).equals(DISCOVERY)) return null;
  const entries = decodeEntries(buf, 20);
  if (!entries) return null;
  return { type: buf[8], ttl: buf[9], group: buf.readUInt16BE(10), ident: buf.subarray(12, 20), entries };
}
/** A measurement message: its own header, then one byte of type, then entries kept as bytes (a pong echoes the ping's). */
export const encodeMeasure = (type, payload) => Buffer.concat([MEASURE, Buffer.from([type]), payload]);
export function decodeMeasure(buf) {
  if (buf.length < 9 || buf.length > MAX_MESSAGE || !buf.subarray(0, 8).equals(MEASURE)) return null;
  const entries = decodeEntries(buf, 9);
  return entries ? { type: buf[8], payload: buf.subarray(9), entries } : null;
}

/**
 * The session's beat at a ghost time. Beat zero of the session timeline is the
 * origin of every peer's bar grid, so this modulo four is where the bar is for
 * every app in the room; a tempo change re-anchors the timeline so the beat
 * runs on without a jump.
 */
export const beatsAt = (t, ghostUs) => t.beatOrigin + (ghostUs - t.timeOrigin) / t.microsPerBeat;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ── The peer: the protocol's state, still with no sockets ──

/**
 * One Link peer that follows.
 *
 * `clock()` is this machine's monotonic time in microseconds; `send(buf, port,
 * address, via)` puts a datagram on the wire from the interface `via` names.
 * Both are handed in so the check can run two of these, or one of these and a
 * stand-in for Live, on one simulated network with no sockets and no waiting.
 */
export function createLinkPeer({ clock, send, interfaces, ident = randomBytes(8), setTimer = setTimeout, clearTimer = clearTimeout }) {
  const own = ident.toString('hex');
  /** ghost = host + offset; our own session's ghost clock starts at zero now. */
  let offset = -clock();
  let session = own;
  let joined = false;
  let timeline = { microsPerBeat: 500_000, beatOrigin: 0, timeOrigin: 0 };
  let startStop = null;
  /** Peers by id: their session, timeline, transport, where they answer pings, and when they lapse. */
  const peers = new Map();
  /** Sessions measured, so one is not pinged again on every Alive: id -> { offset, at } or { failedAt }. */
  const measured = new Map();
  let measuring = null;
  let lastMeasuredAt = 0;

  const ghost = () => clock() + offset;
  const viaFor = (address) => interfaces().find((i) => sameNet(i, address)) ?? interfaces()[0];

  const stateEntries = (via) => {
    const e = [[TMLN, encodeTimeline(timeline)], [SESS, Buffer.from(session, 'hex')]];
    if (startStop) e.push([STST, encodeStartStop(startStop)]);
    if (via?.port) e.push([MEP4, encodeEndpoint(via.address, via.port)]);
    return e;
  };

  const adopt = (t) => {
    // The library's rule within a session: the larger beat origin wins.
    if (t && t.beatOrigin > timeline.beatOrigin) timeline = t;
  };
  const adoptStartStop = (s) => {
    if (s && (!startStop || s.timestamp > startStop.timestamp)) startStop = s;
  };

  const join = (id, measuredOffset) => {
    session = id;
    offset = measuredOffset;
    joined = true;
    lastMeasuredAt = clock();
    // The session's timeline is the one its peers carry; start from the lowest
    // so `adopt` takes the winner.
    timeline = { microsPerBeat: 500_000, beatOrigin: -Infinity, timeOrigin: 0 };
    startStop = null;
    for (const p of peers.values()) if (p.session === id) { adopt(p.timeline); adoptStartStop(p.startStop); }
    if (!Number.isFinite(timeline.beatOrigin)) timeline = { microsPerBeat: 500_000, beatOrigin: 0, timeOrigin: 0 };
  };

  const leave = () => {
    // Back to a session of our own that nobody hears: the ghost clock restarts
    // so a later join measures from scratch.
    if (joined) for (const i of interfaces()) send(encodeDiscovery(BYEBYE, ident, []), LINK_PORT, LINK_GROUP, i);
    joined = false;
    session = own;
    offset = -clock();
    timeline = { microsPerBeat: 500_000, beatOrigin: 0, timeOrigin: 0 };
    startStop = null;
    measured.clear();
  };

  const finishMeasure = (m) => {
    clearTimer(m.timer);
    measuring = null;
    if (m.data.length === 0) { measured.set(m.session, { failedAt: clock() }); return; }
    const o = median(m.data);   // ghost minus host, in microseconds
    measured.set(m.session, { offset: o, at: clock() });
    if (m.session === session) { offset = o; lastMeasuredAt = clock(); return; }
    // Alone, any session someone else made is the one to be in (listen first,
    // above). Already in one, the library's merge rule, so a room with two
    // sessions settles the way every other peer settles it.
    if (!joined) { join(m.session, o); return; }
    const host = clock();
    const diff = (host + o) - (host + offset);
    if (diff > SESSION_EPS_US || (Math.abs(diff) < SESSION_EPS_US && m.session < session)) join(m.session, o);
  };

  const ping = (m, payload) => {
    send(encodeMeasure(PING, payload), m.endpoint.port, m.endpoint.address, m.via);
    clearTimer(m.timer);
    m.timer = setTimer(() => {
      if (measuring !== m) return;
      if (++m.tries >= MEASURE_TRIES) { finishMeasure(m); return; }
      ping(m, encodeEntries([[HT, i64(clock())]]));
    }, PING_TIMEOUT_MS);
  };

  const measure = (id, peer) => {
    if (measuring || !peer.endpoint) return;
    measuring = { session: id, endpoint: peer.endpoint, via: viaFor(peer.endpoint.address), data: [], tries: 0, timer: null };
    ping(measuring, encodeEntries([[HT, i64(clock())]]));
  };

  const onPong = (msg) => {
    const m = measuring;
    if (!m) return;
    const sess = msg.entries.get(SESS);
    if (!sess || sess.toString('hex') !== m.session) return;
    const gt = msg.entries.get(GT), pgt = msg.entries.get(PGT), ht = msg.entries.get(HT);
    const now = clock();
    const g = gt?.length === 8 ? readI64(gt) : 0;
    const h = ht?.length === 8 ? readI64(ht) : 0;
    const pg = pgt?.length === 8 ? readI64(pgt) : 0;
    // Two estimates of ghost minus host from each round trip, as the library
    // takes them: the member's ghost time against the middle of our send and
    // receive, and the middle of its last two ghost times against our send.
    if (g !== 0 && h !== 0) {
      m.data.push(g - (now + h) / 2);
      if (pg !== 0) m.data.push((g + pg) / 2 - h);
    }
    if (m.data.length > MEASURE_POINTS) { finishMeasure(m); return; }
    m.tries = 0;
    ping(m, encodeEntries([[HT, i64(now)], [PGT, i64(g)]]));
  };

  const onPing = (msg, rinfo, via) => {
    // Answered whether or not we have joined: a peer measuring us is deciding
    // which session wins, and an unanswered ping only slows that down.
    if (msg.payload.length > 32) return;
    const pong = encodeEntries([[SESS, Buffer.from(session, 'hex')], [GT, i64(ghost())]]);
    send(encodeMeasure(PONG, Buffer.concat([pong, msg.payload])), rinfo.port, rinfo.address, via);
  };

  const onDiscovery = (msg, rinfo, via) => {
    if (msg.group !== 0) return;
    const id = msg.ident.toString('hex');
    if (id === own) return;                     // our own multicast, looped back
    if (msg.type === BYEBYE) { peers.delete(id); return; }
    if (msg.type !== ALIVE && msg.type !== RESPONSE) return;
    const sess = msg.entries.get(SESS);
    const t = decodeTimeline(msg.entries.get(TMLN));
    if (!sess || sess.length !== 8 || !t) return;
    const peer = {
      session: sess.toString('hex'),
      timeline: t,
      startStop: decodeStartStop(msg.entries.get(STST)),
      endpoint: decodeEndpoint(msg.entries.get(MEP4)),
      until: clock() + (msg.ttl || TTL_S) * 1e6,
    };
    peers.set(id, peer);
    if (msg.type === ALIVE && joined) send(encodeDiscovery(RESPONSE, ident, stateEntries(via)), rinfo.port, rinfo.address, via);
    if (peer.session === session && joined) {
      adopt(t);
      adoptStartStop(peer.startStop);
    } else if (peer.session !== session) {
      const known = measured.get(peer.session);
      // A session measured and not joined is not pinged again on every Alive;
      // one that failed is tried again after a while (a peer still starting).
      if (!known || (known.failedAt && clock() - known.failedAt > 5e6)) measure(peer.session, peer);
    }
  };

  return {
    /** A datagram arrived on interface `via`. Anything that is not Link, or is malformed, is dropped. */
    receive(buf, rinfo, via) {
      const d = decodeDiscovery(buf);
      if (d) { onDiscovery(d, rinfo, via); return; }
      const m = decodeMeasure(buf);
      if (m?.type === PING) onPing(m, rinfo, via);
      else if (m?.type === PONG) onPong(m);
    },
    /** Called every BROADCAST_MS: lapse the silent, announce ourselves, re-measure now and then. */
    tick() {
      const now = clock();
      for (const [id, p] of peers) if (p.until < now) peers.delete(id);
      const members = [...peers.values()].filter((p) => p.session === session);
      if (joined && members.length === 0) leave();
      if (joined) {
        for (const i of interfaces()) send(encodeDiscovery(ALIVE, ident, stateEntries(i)), LINK_PORT, LINK_GROUP, i);
        if (now - lastMeasuredAt > REMEASURE_MS * 1e3 && !measuring && members[0]) {
          lastMeasuredAt = now;
          measure(session, members[0]);
        }
      }
    },
    /** What the display is told: whether we are in a session, its tempo, and the beat now. */
    reading() {
      const members = [...peers.values()].filter((p) => p.session === session).length;
      if (!joined) return { peers: 0, bpm: 0, beat: null, playing: false };
      return {
        peers: members,
        bpm: 60e6 / timeline.microsPerBeat,
        beat: beatsAt(timeline, ghost()),
        playing: startStop?.playing ?? false,
      };
    },
    stop() {
      if (measuring) clearTimer(measuring.timer);
      measuring = null;
      leave();
      peers.clear();
    },
    get ident() { return ident; },
    get session() { return session; },
    get offset() { return offset; },
  };
}

function sameNet(iface, address) {
  const a = address.split('.').map(Number), b = iface.address.split('.').map(Number), m = (iface.netmask ?? '255.255.255.255').split('.').map(Number);
  return a.every((x, i) => (x & m[i]) === (b[i] & m[i]));
}

// ── The sockets ──

/**
 * Every running IPv4 interface, loopback included: the library joins on
 * loopback too, which is how Live and the show find each other on one Mac
 * with the Wi-Fi off.
 */
function ipv4Interfaces() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === 'IPv4' || i.family === 4) out.push({ address: i.address, netmask: i.netmask, internal: i.internal });
  }
  return out;
}

/**
 * Join the room: one socket on the multicast port that hears every Alive, and
 * one per interface that sends from it and takes the unicast replies (Responses,
 * pings and pongs) at the port it announces. `onChange` is told whenever the
 * session's tempo or membership may have moved; the reading itself is pulled.
 */
export function startLink({ onError, listInterfaces = ipv4Interfaces, rescanMs = RESCAN_MS } = {}) {
  const clock = () => Number(process.hrtime.bigint() / 1000n);
  const ifaces = [];
  const live = () => ifaces.filter((i) => i.port);
  const send = (buf, port, address, via) => {
    const s = via?.socket ?? live()[0]?.socket;
    // A socket a rescan closed under a measurement in flight throws here, and
    // synchronously: in the Mac app's main process that would be uncaught.
    try { s?.send(buf, port, address, () => { /* a peer that left is not an error */ }); } catch { /* closed by a rescan */ }
  };
  const peer = createLinkPeer({ clock, send, interfaces: live });
  const fail = (err) => onError?.(err);

  let groupBound = false;
  const group = createSocket({ type: 'udp4', reuseAddr: true });
  group.on('error', fail);
  group.on('message', (buf, rinfo) => {
    const via = live().find((i) => sameNet(i, rinfo.address)) ?? live()[0];
    peer.receive(buf, rinfo, via);
  });
  const join = (i) => { try { group.addMembership(LINK_GROUP, i.address); } catch { /* an interface without multicast */ } };
  group.bind(LINK_PORT, () => {
    groupBound = true;
    for (const i of ifaces) join(i);
  });

  const open = (found) => {
    const i = { ...found, port: 0, socket: null };
    ifaces.push(i);
    if (groupBound) join(i);
    const s = createSocket({ type: 'udp4', reuseAddr: true });
    s.on('error', () => { try { s.close(); } catch { /* already */ } i.port = 0; });
    s.on('message', (buf, rinfo) => peer.receive(buf, rinfo, i));
    s.bind(0, i.address, () => {
      // Closed by a rescan before it was bound: it never joins the list.
      if (i.closed) { try { s.close(); } catch { /* already */ } return; }
      try {
        s.setMulticastInterface(i.address);
        s.setMulticastLoopback(i.internal);
        s.setMulticastTTL(1);
      } catch { /* sends still go out by the default route */ }
      i.socket = s;
      i.port = s.address().port;
    });
  };
  const close = (i) => {
    ifaces.splice(ifaces.indexOf(i), 1);
    i.closed = true;
    i.port = 0;
    try { group.dropMembership(LINK_GROUP, i.address); } catch { /* gone with its interface */ }
    try { i.socket?.close(); } catch { /* already */ }
  };
  /*
    The interfaces again (PLAN.md 13.5-link-rescan). They were read once, when
    Link was switched on, so a Mac that joined the Wi-Fi afterwards found only
    loopback until Link was switched off and on, and one that changed network
    kept a socket on an address it no longer had. Ableton's library rescans
    every thirty seconds; so does this. An address that is new gets its
    socket and joins the group; one that is gone is closed. Ones still there
    are left alone, so a session already measured over them is not dropped.
  */
  const rescan = () => {
    let found;
    try { found = listInterfaces(); } catch { return; }
    for (const i of [...ifaces]) if (!found.some((f) => f.address === i.address)) close(i);
    for (const f of found) if (!ifaces.some((i) => i.address === f.address)) open(f);
  };
  rescan();
  const rescanTimer = setInterval(rescan, rescanMs);
  rescanTimer.unref?.();

  const timer = setInterval(() => peer.tick(), BROADCAST_MS);
  timer.unref?.();
  return {
    reading: () => peer.reading(),
    stop() {
      clearInterval(timer);
      clearInterval(rescanTimer);
      peer.stop();
      // The ByeBye goes out before the sockets close.
      setTimeout(() => {
        try { group.close(); } catch { /* already */ }
        for (const i of ifaces) { try { i.socket?.close(); } catch { /* already */ } }
      }, 50).unref?.();
    },
  };
}
