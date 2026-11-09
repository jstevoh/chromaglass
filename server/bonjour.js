/**
 * The show server's Bonjour advert (PLAN 12-tv-2): a TV app on the same
 * network finds this Mac by itself, with nothing typed on a remote.
 *
 * What it is: a small multicast DNS responder (RFC 6762, with DNS-SD's
 * records, RFC 6763) for one service, `_chromaglass._tcp`, on the show
 * server's port. The Android TV app looks for that type with Android's
 * `NsdManager`, which sends a PTR question to 224.0.0.251:5353; this answers
 * with the PTR, the SRV (the port), the TXT (which show this is, and where the
 * TV page lives) and an A record per Wi-Fi or Ethernet address. A phone app
 * can find the Mac the same way later (12-ctl-find).
 *
 * Why a responder of our own and not a package: the whole job is five record
 * types for one service, and the show server's rule is `node:*` and `ws` only
 * (server/README.md). Why not the Mac's own `dns-sd -R`: the show server also
 * runs from a terminal on Linux and Windows (`npm run remote`), and in the
 * checks, where this same code is what gets asked. On a Mac the system's
 * mDNSResponder already holds udp 5353; the socket here shares it
 * (`reuseAddr`, which libuv makes SO_REUSEPORT on macOS), as every Node
 * Bonjour library does, and both see each multicast question.
 *
 * What it never says: the show key. The TXT carries a random id for the show
 * (so a TV that paired once knows this Mac again when its address changes)
 * and nothing a stranger on the Wi-Fi could use to join; joining is the
 * 4-digit pairing the laptop allows (remote-server.js, `tv-asks`).
 *
 * The host name the SRV points at is our own (`chromaglass-<id>.local`), not
 * the Mac's: answering for the Mac's own name would be answering for
 * mDNSResponder's records, which it defends.
 */
import dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';

export const MDNS_ADDRESS = '224.0.0.251';
export const MDNS_PORT = 5353;
export const SERVICE_TYPE = '_chromaglass._tcp.local';
const SERVICES = '_services._dns-sd._udp.local';
const T = { A: 1, PTR: 12, TXT: 16, SRV: 33, ANY: 255 };
/** RFC 6762 §10: two minutes for records naming a host, 75 minutes for the rest. */
const HOST_TTL = 120;
const OTHER_TTL = 4500;
/** The cache-flush bit on the class of a record only this host answers for. */
const FLUSH = 0x8000;

/** The IPv4 addresses a TV on the same network can reach: no loopback, no link-local. */
export function lanAddresses4(list = networkInterfaces) {
  const out = [];
  for (const addrs of Object.values(list() ?? {})) {
    for (const a of addrs ?? []) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  return out;
}

// ── The wire ────────────────────────────────────────────────────────────

function encodeName(name) {
  const parts = [];
  for (const label of name.split('.').filter(Boolean)) {
    const b = Buffer.from(label, 'utf8').subarray(0, 63);
    parts.push(Buffer.from([b.length]), b);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function readName(buf, at) {
  const labels = [];
  let end = -1;
  for (let jumps = 0; jumps < 32; jumps++) {
    if (at >= buf.length) throw new Error('name runs past the packet');
    const len = buf[at];
    if (len === 0) { at += 1; break; }
    if ((len & 0xc0) === 0xc0) {
      if (end < 0) end = at + 2;
      at = ((len & 0x3f) << 8) | buf[at + 1];
      continue;
    }
    labels.push(buf.toString('utf8', at + 1, at + 1 + len));
    at += 1 + len;
  }
  return { name: labels.join('.'), end: end < 0 ? at : end };
}

function encodeRecord({ name, type, cls = 1, ttl, data }) {
  const head = Buffer.alloc(10);
  head.writeUInt16BE(type, 0);
  head.writeUInt16BE(cls, 2);
  head.writeUInt32BE(ttl, 4);
  head.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), head, data]);
}

const rdata = {
  ptr: (target) => encodeName(target),
  srv: (port, target) => { const b = Buffer.alloc(6); b.writeUInt16BE(port, 4); return Buffer.concat([b, encodeName(target)]); },
  txt: (pairs) => Buffer.concat(Object.entries(pairs).map(([k, v]) => { const s = Buffer.from(`${k}=${v}`, 'utf8').subarray(0, 255); return Buffer.concat([Buffer.from([s.length]), s]); })),
  a: (ip) => Buffer.from(ip.split('.').map(Number)),
};

/** A whole DNS message: `{ id, flags, questions: [{name,type,qu}], answers, additionals }` with records as for `encodeRecord`. */
export function encodeMessage({ id = 0, flags = 0, questions = [], answers = [], additionals = [] }) {
  const head = Buffer.alloc(12);
  head.writeUInt16BE(id, 0);
  head.writeUInt16BE(flags, 2);
  head.writeUInt16BE(questions.length, 4);
  head.writeUInt16BE(answers.length, 6);
  head.writeUInt16BE(additionals.length, 10);
  const qs = questions.map((q) => { const t = Buffer.alloc(4); t.writeUInt16BE(q.type, 0); t.writeUInt16BE(1 | (q.qu ? FLUSH : 0), 2); return Buffer.concat([encodeName(q.name), t]); });
  return Buffer.concat([head, ...qs, ...answers.map(encodeRecord), ...additionals.map(encodeRecord)]);
}

/** Read a DNS message, decoding the five record types this module speaks. Throws on a malformed packet. */
export function decodeMessage(buf) {
  if (buf.length < 12) throw new Error('short packet');
  const id = buf.readUInt16BE(0);
  const flags = buf.readUInt16BE(2);
  const counts = [4, 6, 8, 10].map((o) => buf.readUInt16BE(o));
  let at = 12;
  const questions = [];
  for (let i = 0; i < counts[0]; i++) {
    const n = readName(buf, at);
    at = n.end;
    questions.push({ name: n.name, type: buf.readUInt16BE(at), qu: (buf.readUInt16BE(at + 2) & FLUSH) !== 0 });
    at += 4;
  }
  const records = [];
  for (let i = 0; i < counts[1] + counts[2] + counts[3]; i++) {
    const n = readName(buf, at);
    at = n.end;
    const type = buf.readUInt16BE(at);
    const ttl = buf.readUInt32BE(at + 4);
    const len = buf.readUInt16BE(at + 8);
    const start = at + 10;
    if (start + len > buf.length) throw new Error('record runs past the packet');
    let value = null;
    if (type === T.PTR) value = readName(buf, start).name;
    else if (type === T.A && len === 4) value = [...buf.subarray(start, start + 4)].join('.');
    else if (type === T.SRV) value = { port: buf.readUInt16BE(start + 4), target: readName(buf, start + 6).name };
    else if (type === T.TXT) {
      value = {};
      for (let p = start; p < start + len;) {
        const l = buf[p];
        const s = buf.toString('utf8', p + 1, p + 1 + l);
        const eq = s.indexOf('=');
        if (s) value[eq < 0 ? s : s.slice(0, eq)] = eq < 0 ? '' : s.slice(eq + 1);
        p += 1 + l;
      }
    }
    records.push({ name: n.name, type, ttl, value });
    at = start + len;
  }
  return { id, flags, response: (flags & 0x8000) !== 0, questions, records };
}

// ── The responder ───────────────────────────────────────────────────────

/** A DNS label from a computer's name: the part before any dot, printable, short. */
export function instanceLabel(hostname) {
  const base = String(hostname ?? '').replace(/\.local\.?$/i, '').split('.')[0].replace(/[^\p{L}\p{N} '’_-]/gu, '').trim();
  return `ChromaGlass on ${base || 'this computer'}`.slice(0, 63);
}

/**
 * Advertise the show server. `id` is the show's random id (never its key),
 * `port` the show server's, `name` the instance label a TV lists. Returns
 * `{ instance, host, stop() }`; `stop` says goodbye (the records at TTL 0) so
 * a TV's list drops this Mac at once rather than in two minutes. Never
 * throws: a network with no multicast, or a port the system will not share,
 * leaves the show server as it was, with a line in the log.
 */
export function advertise({ port, id, name, txt = {}, addresses = lanAddresses4, log = console.log }) {
  const instance = `${name}.${SERVICE_TYPE}`;
  const host = `chromaglass-${String(id).slice(0, 8)}.local`;
  const text = { v: '1', id, path: '/tv', ...txt };
  const records = (ttlScale = 1) => {
    const ttl = (t) => Math.round(t * ttlScale);
    return {
      ptr: { name: SERVICE_TYPE, type: T.PTR, ttl: ttl(OTHER_TTL), data: rdata.ptr(instance) },
      services: { name: SERVICES, type: T.PTR, ttl: ttl(OTHER_TTL), data: rdata.ptr(SERVICE_TYPE) },
      srv: { name: instance, type: T.SRV, cls: 1 | FLUSH, ttl: ttl(HOST_TTL), data: rdata.srv(port, host) },
      txt: { name: instance, type: T.TXT, cls: 1 | FLUSH, ttl: ttl(OTHER_TTL), data: rdata.txt(text) },
      a: addresses().map((ip) => ({ name: host, type: T.A, cls: 1 | FLUSH, ttl: ttl(HOST_TTL), data: rdata.a(ip) })),
    };
  };

  let socket;
  let stopped = false;
  const joined = new Set();
  const timers = [];
  const join = () => {
    for (const ip of addresses()) {
      if (joined.has(ip)) continue;
      try { socket.addMembership(MDNS_ADDRESS, ip); joined.add(ip); } catch { /* not a multicast interface */ }
    }
  };
  /** Multicast out of every interface, so a Mac on Wi-Fi and Ethernet is found on both. */
  const multicast = (packet) => {
    const ips = addresses();
    if (ips.length === 0) { socket.send(packet, MDNS_PORT, MDNS_ADDRESS, () => {}); return; }
    for (const ip of ips) {
      try { socket.setMulticastInterface(ip); } catch { continue; }
      socket.send(packet, MDNS_PORT, MDNS_ADDRESS, () => {});
    }
  };

  /** What to say to these questions: answers first, then what the asker will want next. */
  const answer = (questions, r) => {
    const answers = [];
    const extra = [];
    const add = (list, rec) => { if (!list.includes(rec)) list.push(rec); };
    for (const q of questions) {
      const qn = q.name.toLowerCase();
      const any = q.type === T.ANY;
      if (qn === SERVICE_TYPE && (q.type === T.PTR || any)) {
        add(answers, r.ptr);
        add(extra, r.srv); add(extra, r.txt); for (const a of r.a) add(extra, a);
      } else if (qn === SERVICES && (q.type === T.PTR || any)) {
        add(answers, r.services);
      } else if (qn === instance.toLowerCase()) {
        if (q.type === T.SRV || any) add(answers, r.srv);
        if (q.type === T.TXT || any) add(answers, r.txt);
        for (const a of r.a) add(extra, a);
      } else if (qn === host && (q.type === T.A || any)) {
        for (const a of r.a) add(answers, a);
      }
    }
    return { answers, additionals: extra.filter((x) => !answers.includes(x)) };
  };

  const onMessage = (buf, from) => {
    let m;
    try { m = decodeMessage(buf); } catch { return; }
    if (m.response || m.questions.length === 0) return;
    // A one-shot question from a port other than 5353 is "legacy unicast"
    // (RFC 6762 §6.7): answered to that port, with its id and question, and
    // TTLs of ten seconds. The check asks this way; NsdManager does not.
    const legacy = from.port !== MDNS_PORT;
    const r = records(legacy ? 10 / HOST_TTL : 1);
    const { answers, additionals } = answer(m.questions, r);
    if (answers.length === 0) return;
    if (legacy) {
      const fix = (rec) => ({ ...rec, cls: 1, ttl: Math.min(rec.ttl, 10) });
      socket.send(encodeMessage({ id: m.id, flags: 0x8400, questions: m.questions, answers: answers.map(fix), additionals: additionals.map(fix) }), from.port, from.address, () => {});
    } else {
      multicast(encodeMessage({ flags: 0x8400, answers, additionals }));
    }
  };

  /** Unsolicited: everything at once, so a TV already looking sees the Mac arrive (RFC 6762 §8.3). */
  const announce = (scale = 1) => {
    const r = records(scale);
    multicast(encodeMessage({ flags: 0x8400, answers: [r.ptr, r.srv, r.txt, ...r.a] }));
  };

  try {
    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', (err) => { log(`  Bonjour advert stopped: ${err.message}`); try { socket.close(); } catch { /* closed */ } stopped = true; });
    socket.on('message', onMessage);
    socket.bind(MDNS_PORT, () => {
      try { socket.setMulticastTTL(255); socket.setMulticastLoopback(true); } catch { /* defaults */ }
      join();
      announce();
      timers.push(setTimeout(() => announce(), 1000), setTimeout(() => announce(), 3000));
      // A Mac that moves to another network (or wakes on one) joins it here,
      // and says so; the A records are read fresh at every answer.
      const watch = setInterval(() => { const before = joined.size; join(); if (joined.size !== before) announce(); }, 30_000);
      timers.push(watch);
      for (const t of timers) t.unref?.();
    });
  } catch (err) {
    log(`  Bonjour advert not started: ${err.message}`);
    stopped = true;
  }

  return {
    instance,
    host,
    stop() {
      for (const t of timers) { clearTimeout(t); clearInterval(t); }
      if (stopped || !socket) return;
      stopped = true;
      try { announce(0); } catch { /* closing */ }
      setTimeout(() => { try { socket.close(); } catch { /* closed */ } }, 50).unref?.();
    },
  };
}

/**
 * Ask the network once who offers `_chromaglass._tcp`, the way a TV does, and
 * gather what comes back for `ms`. For the check (`npm run tvpair`), and for a
 * person wondering whether their Mac is visible: `node server/bonjour.js`.
 * `to` sends a legacy unicast question to one address instead of the group;
 * `ask: false` only listens, which is how the check knows that what it heard
 * after asking was an answer and not an announcement passing by.
 */
export function browse({ ms = 1500, to = null, ask = true } = {}) {
  return new Promise((done) => {
    const found = new Map();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const take = (buf) => {
      let m;
      try { m = decodeMessage(buf); } catch { return; }
      if (!m.response) return;
      const byName = (type, name) => m.records.filter((r) => r.type === type && (!name || r.name.toLowerCase() === name.toLowerCase()));
      for (const p of byName(T.PTR, SERVICE_TYPE)) {
        const srv = byName(T.SRV, p.value)[0]?.value;
        const txt = byName(T.TXT, p.value)[0]?.value ?? {};
        const addresses = srv ? byName(T.A, srv.target).map((a) => a.value) : [];
        if (p.ttl === 0) { found.delete(p.value); continue; }
        found.set(p.value, { instance: p.value, port: srv?.port ?? null, host: srv?.target ?? null, txt, addresses });
      }
    };
    sock.on('message', take);
    sock.on('error', () => {});
    const q = encodeMessage({ questions: [{ name: SERVICE_TYPE, type: T.PTR }] });
    const finish = () => { try { sock.close(); } catch { /* closed */ } done([...found.values()]); };
    if (to) {
      sock.bind(0, () => { sock.send(q, MDNS_PORT, to, () => {}); setTimeout(finish, ms); });
    } else {
      sock.bind(MDNS_PORT, () => {
        for (const ip of lanAddresses4()) { try { sock.addMembership(MDNS_ADDRESS, ip); } catch { /* skip */ } }
        if (ask) sock.send(q, MDNS_PORT, MDNS_ADDRESS, () => {});
        setTimeout(finish, ms);
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const found = await browse({ ms: 2000 });
  if (found.length === 0) console.log('No ChromaGlass show answered on this network.');
  for (const f of found) console.log(`${f.instance}  ${f.addresses.join(', ') || '(no address)'}:${f.port}  ${JSON.stringify(f.txt)}`);
}
