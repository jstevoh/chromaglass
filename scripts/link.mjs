#!/usr/bin/env node
/**
 * Does Ableton Link's tempo and bar reach the show's beat clock, on the beat?
 *
 *   npm run link
 *
 * PLAN.md 13.5-link: "a node Link peer at a tempo and a phase the clock reaches
 * within a beat, and follows when it changes." Within a beat is the plan's
 * floor; what is held here is much tighter, because a kick a beat late is no
 * use and one twenty milliseconds late is already visible on a wall.
 *
 * Five parts, from the bytes up to real sockets:
 *
 *   1. The bytes. An Alive and a ping written out by hand from the protocol's
 *      layout (header, type, ttl, group, id; then key, size, value entries, all
 *      big-endian) and compared with what `abletonLink.js` encodes. The stand-in
 *      for Live below shares that codec, so without this a mistake in it would
 *      be made on both sides and pass.
 *   2. The protocol, on a simulated network with simulated time: two machines
 *      whose clocks differ by minutes, a millisecond or three on the wire each
 *      way, and a stand-in for Live that announces a session at 128 bpm,
 *      answers pings, changes to 140, then leaves. The show's peer must say
 *      nothing until it has joined (it follows, and must never hand Live its
 *      own tempo), then read Live's beat at the same instant to within a few
 *      milliseconds, the bar too, follow the change, and let go when Live goes.
 *   3. The page's half (`TempoSource.linkReading`): readings twenty times a
 *      second, each arriving up to a frame late, must still put the beat where
 *      it fell, once per beat, with the bar.
 *   4. The beat clock fed from that, a frame at a time as the render loop does:
 *      one kick per beat, each in the frame the beat falls in.
 *   5. Real sockets: the show server's `startLink()` and a stand-in Live on
 *      this machine's loopback, which is how Live and the Mac app meet with the
 *      Wi-Fi off.
 *
 * What none of it can say is that Live itself agrees: the stand-in is written
 * from the same reading of the protocol as the peer. That is the owner's test
 * with Live on the Mac (docs/judging.md).
 */

import {
  LINK_GROUP, LINK_PORT, createLinkPeer, decodeDiscovery, decodeMeasure, encodeDiscovery,
  encodeEndpoint, encodeEntries, encodeMeasure, encodeStartStop, encodeTimeline, startLink,
} from '../server/abletonLink.js';
import { createSocket } from 'node:dgram';
import { TempoSource } from '../src/lib/tempo.ts';
import { BeatClock } from '../src/lib/beatClock.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const key = (s) => s.charCodeAt(0) << 24 | s.charCodeAt(1) << 16 | s.charCodeAt(2) << 8 | s.charCodeAt(3);
// Link carries a tempo as whole microseconds a beat, so 140 bpm comes back as
// 140.00002: tempos are compared to a thousandth of a bpm, not exactly.
const usPerBeat = (bpm) => Math.round(60e6 / bpm);
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64BE(BigInt(Math.round(n))); return b; };

// ── 1. The bytes ──────────────────────────────────────────────────────

{
  const ident = Buffer.from('ABCDEFGH', 'latin1');
  const alive = encodeDiscovery(1, ident, [
    [key('tmln'), encodeTimeline({ microsPerBeat: 468750, beatOrigin: 2.5, timeOrigin: 1_000_000 })],
    [key('mep4'), encodeEndpoint('192.168.1.20', 20809)],
  ]);
  const want = [
    '5f 61 73 64 70 5f 76 01',             // "_asdp_v" and version 1
    '01 05 00 00',                         // Alive, ttl 5 s, group 0
    '41 42 43 44 45 46 47 48',             // the peer's id
    '74 6d 6c 6e 00 00 00 18',             // 'tmln', 24 bytes
    '00 00 00 00 00 07 27 0e',             // 468750 us a beat (128 bpm)
    '00 00 00 00 00 26 25 a0',             // beat origin 2.5, in millionths
    '00 00 00 00 00 0f 42 40',             // time origin 1 s, in microseconds
    '6d 65 70 34 00 00 00 06',             // 'mep4', 6 bytes
    'c0 a8 01 14 51 49',                   // 192.168.1.20 port 20809
  ].join(' ');
  const got = [...alive].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  check('an Alive is laid out as the protocol lays it out', got === want, got === want ? `${alive.length} bytes` : `got ${got}`);

  const ping = encodeMeasure(1, encodeEntries([[key('__ht'), Buffer.from('0000000000000064', 'hex')]]));
  const wantPing = '5f 6c 69 6e 6b 5f 76 01 01 5f 5f 68 74 00 00 00 08 00 00 00 00 00 00 00 64';
  const gotPing = [...ping].map((b) => b.toString(16).padStart(2, '0')).join(' ');
  check('a ping is "_link_v", type 1, then a host time entry', gotPing === wantPing, gotPing === wantPing ? '' : `got ${gotPing}`);

  const stst = encodeStartStop({ playing: true, beats: 4, timestamp: 7 });
  check('start and stop is a byte, then a beat and a time', stst.toString('hex') === '01' + '00000000003d0900' + '0000000000000007', stst.toString('hex'));

  const cut = alive.subarray(0, alive.length - 3);
  check('a message cut short is dropped whole, not half read', decodeDiscovery(cut) === null);
  check('anything that is not Link is ignored', decodeDiscovery(Buffer.from('/chromaglass/setting\0')) === null && decodeMeasure(Buffer.alloc(40)) === null);
}

// ── 2. The protocol, on a simulated network ───────────────────────────

/**
 * A stand-in for Live: a session of its own, announced four times a second,
 * pings answered, a tempo it can change the way Link's library changes one
 * (the beat runs on; the beat origin moves past the old one so peers adopt it).
 */
function makeLive({ clock, ghostOffset, send, address, port, bpm }) {
  const ident = Buffer.from('LIVEsess', 'latin1');
  const ghost = () => clock() + ghostOffset;
  // Written out here rather than taken from `beatsAt`, so the peer's reading
  // of a timeline is checked against the protocol's and not against itself.
  // A session some way in: beat 16 fell 21.25 beats ago.
  const beatOf = (tl, g) => tl.beatOrigin + (g - tl.timeOrigin) / tl.microsPerBeat;
  let timeline = { microsPerBeat: usPerBeat(bpm), beatOrigin: 16, timeOrigin: ghost() - 21.25 * usPerBeat(bpm) };
  const state = () => [
    [key('tmln'), encodeTimeline(timeline)],
    [key('sess'), ident],
    [key('stst'), encodeStartStop({ playing: true, beats: 0, timestamp: 1 })],
    [key('mep4'), encodeEndpoint(address, port)],
  ];
  return {
    ident,
    beat: () => beatOf(timeline, ghost()),
    bpm: () => 60e6 / timeline.microsPerBeat,
    alive: () => send(encodeDiscovery(1, ident, state()), LINK_PORT, LINK_GROUP),
    bye: () => send(encodeDiscovery(3, ident, []), LINK_PORT, LINK_GROUP),
    setTempo(next) {
      const g = ghost();
      const b = beatOf(timeline, g);
      const beatOrigin = Math.max(b, timeline.beatOrigin + 1);
      const microsPerBeat = usPerBeat(next);
      timeline = { microsPerBeat, beatOrigin, timeOrigin: g + (beatOrigin - b) * microsPerBeat };
    },
    receive(buf, from) {
      const m = decodeMeasure(buf);
      if (m?.type === 1) {
        const pong = encodeEntries([[key('sess'), ident], [key('__gt'), i64(ghost())]]);
        send(encodeMeasure(2, Buffer.concat([pong, m.payload])), from.port, from.address);
      }
    },
  };
}

{
  // Simulated time, in microseconds, and a queue of what happens when.
  let now = 0;
  const queue = [];
  const at = (t, fn) => { const e = { t, fn }; queue.push(e); queue.sort((a, b) => a.t - b.t); return e; };
  const runTo = (t) => { while (queue.length && queue[0].t <= t) { const e = queue.shift(); now = e.t; e.fn(); } now = t; };
  // A few milliseconds each way, different every packet, from a fixed seed.
  let seed = 7;
  const wire = () => { seed = (seed * 16807) % 2147483647; return 300 + (seed % 2700); };

  const SHOW = { address: '10.0.0.2', port: 50001, netmask: '255.255.255.0' };
  const LIVE = { address: '10.0.0.3', port: 50002 };
  const sent = { show: [] };
  let peer, live;
  const deliver = (buf, port, address, from) => {
    const t = now + wire();
    if (address === LINK_GROUP) {
      if (from === 'show') at(t, () => live?.receive(buf, SHOW));
      else at(t, () => peer.receive(buf, LIVE, SHOW));
    } else if (address === SHOW.address && port === SHOW.port) at(t, () => peer.receive(buf, LIVE, SHOW));
    else if (address === LIVE.address && port === LIVE.port) at(t, () => live?.receive(buf, SHOW));
  };

  // Two machines minutes apart on their own clocks.
  const showClock = () => now + 311e6;
  const liveClock = () => now + 9_870e6;
  peer = createLinkPeer({
    clock: showClock,
    interfaces: () => [SHOW],
    send: (buf, port, address) => { sent.show.push({ t: now, buf }); deliver(buf, port, address, 'show'); },
    ident: Buffer.from('SHOWpeer', 'latin1'),
    setTimer: (fn, ms) => at(now + ms * 1000, fn),
    clearTimer: (e) => { const i = queue.indexOf(e); if (i >= 0) queue.splice(i, 1); },
  });
  const tick = () => { peer.tick(); at(now + 250_000, tick); };
  at(250_000, tick);

  // Alone for three seconds: nothing on the wire.
  runTo(3e6);
  check('alone, the show says nothing on the network (it follows, never leads)', sent.show.length === 0, `${sent.show.length} packets`);

  // Live arrives. Its session started a second ago, so the show's own ghost
  // clock (three seconds) is older: by Link's merge rule Live would join the
  // show and take its 120 bpm. Listening first, the show joins Live.
  live = makeLive({
    clock: liveClock, ghostOffset: -liveClock() + 1e6,
    send: (buf, port, address) => deliver(buf, port, address, 'live'),
    address: LIVE.address, port: LIVE.port, bpm: 128,
  });
  const liveTick = () => { if (!live) return; live.alive(); at(now + 250_000, liveTick); };
  at(now + 1, liveTick);

  runTo(5e6);
  let r = peer.reading();
  const lag = (a, b) => Math.abs(a - b) * 60e3 / (r.bpm || 1);      // beats apart, in ms
  check('joins Live\'s session though its own is older', r.peers === 1 && peer.session === live.ident.toString('hex'), `peers ${r.peers}`);
  check('reads Live\'s tempo', Math.abs(r.bpm - 128) < 0.001, `${r.bpm.toFixed(4)} bpm`);
  check('reads Live\'s beat at the same instant, within 2 ms', r.beat !== null && lag(r.beat, live.beat()) < 2, r.beat === null ? 'no beat' : `${lag(r.beat, live.beat()).toFixed(3)} ms apart`);
  check('and the bar: the same beat of the four', r.beat !== null && Math.floor(r.beat) % 4 === Math.floor(live.beat()) % 4, `show ${r.beat?.toFixed(3)}, Live ${live.beat().toFixed(3)}`);
  const announced = sent.show.map((s) => decodeDiscovery(s.buf)).filter((m) => m?.type === 1);
  check('once joined, it announces itself in Live\'s session (Live counts it as a peer)',
    announced.length > 0 && announced.every((m) => m.entries.get(key('sess')).equals(live.ident)), `${announced.length} Alives`);

  live.setTempo(140);
  const changedAt = now;
  let followedAt = null;
  while (now < changedAt + 2e6) {
    runTo(now + 10_000);
    r = peer.reading();
    if (followedAt === null && Math.abs(r.bpm - 140) < 0.001) followedAt = now;
  }
  check('follows a tempo change within a broadcast or two', followedAt !== null && followedAt - changedAt < 600_000, followedAt === null ? 'never' : `${((followedAt - changedAt) / 1000).toFixed(0)} ms`);
  check('and the beat runs on without a jump', r.beat !== null && lag(r.beat, live.beat()) < 2, `${lag(r.beat, live.beat()).toFixed(3)} ms apart at 140`);

  live.bye();
  live = null;
  runTo(now + 600_000);
  r = peer.reading();
  check('Live says goodbye: the show lets go at once', r.peers === 0 && r.beat === null, `peers ${r.peers}`);
  const before = sent.show.length;
  runTo(now + 2e6);
  check('and goes quiet again', sent.show.length === before, `${sent.show.length - before} packets after`);

  // A Live that vanishes without a word (a cable out, a crash) lapses on its ttl.
  live = makeLive({
    clock: liveClock, ghostOffset: 5e6, send: (buf, port, address) => deliver(buf, port, address, 'live'),
    address: LIVE.address, port: LIVE.port, bpm: 96,
  });
  at(now + 1, liveTick);
  runTo(now + 2e6);
  r = peer.reading();
  check('a second session is joined from scratch', r.peers === 1 && Math.abs(r.bpm - 96) < 0.001 && lag(r.beat, live.beat()) < 2, `${r.bpm.toFixed(2)} bpm, ${lag(r.beat, live.beat()).toFixed(3)} ms apart`);
  live = null;
  runTo(now + 4.5e6);
  const stillThere = peer.reading().peers;
  runTo(now + 1.5e6);
  check('a peer that goes silent lapses after its five seconds, not before', stillThere === 1 && peer.reading().peers === 0, `at 4.5 s ${stillThere}, at 6 s ${peer.reading().peers}`);
}

// ── 3. The page's half ────────────────────────────────────────────────

{
  const t = new TempoSource();
  const period = 60000 / 128;
  const origin = 1234.5;                 // when beat zero fell, on the page's clock
  let seed = 3;
  const late = () => { seed = (seed * 16807) % 2147483647; return (seed % 1600) / 100; };   // 0–16 ms
  // A tapped tempo first, which Link takes over from and hands back to.
  t.tap(100); t.tap(600); t.tap(1100);
  const tapped = t.read(1100);
  const beatsSeen = [];
  let lastSeq = -1, worst = 0, bars = true;
  for (let ms = 2000; ms < 12000; ms += 1000 / 60) {
    // Twenty readings a second, each stamped on arrival, up to a frame late.
    if (Math.floor(ms / 50) !== Math.floor((ms - 1000 / 60) / 50)) {
      const sentAt = Math.floor(ms / 50) * 50;
      const arrived = sentAt + late();
      t.linkReading(arrived, { on: true, peers: 1, bpm: 128, beat: (sentAt - origin) / period });
    }
    const reading = t.read(ms);
    if (!reading || reading.source !== 'link') continue;
    if (reading.seq !== lastSeq) {
      lastSeq = reading.seq;
      const truth = origin + Math.round((reading.beatAt - origin) / period) * period;
      beatsSeen.push(reading.beatAt);
      if (beatsSeen.length > 4) worst = Math.max(worst, Math.abs(reading.beatAt - truth));
      if (reading.bar !== ((Math.round((reading.beatAt - origin) / period) % 4) + 4) % 4) bars = false;
    }
  }
  const expected = Math.floor((12000 - origin) / period) - Math.floor((2000 - origin) / period);
  check('Link wins over a tapped tempo while it speaks', t.active === 'link' && tapped?.source === 'tap');
  check('one fresh beat per beat, none twice', Math.abs(beatsSeen.length - expected) <= 1, `${beatsSeen.length} beats for ${expected}`);
  check('each beat where it fell, though readings arrive up to a frame late', worst < 1.5, `worst ${worst.toFixed(2)} ms`);
  check('each beat knows its place in the bar', bars);

  // Twenty readings a second stop: a second later the tap is back.
  const after = t.read(12000 + 1100);
  check('a session that stops speaking hands back to what was tapped', after?.source === 'tap', after ? after.source : 'nothing');

  t.linkReading(20000, { on: true, peers: 0, bpm: 0, beat: null });
  check('Link on with nobody in the session is not a tempo', t.read(20000)?.source !== 'link' && t.linkStatus.on && t.linkStatus.available);
}

// ── 4. The beat clock, a frame at a time ──────────────────────────────

{
  const t = new TempoSource();
  const clock = new BeatClock();
  const period = 60000 / 128;
  const origin = 500;
  const kicks = [];
  for (let ms = 1000; ms < 11000; ms += 1000 / 60) {
    if (Math.floor(ms / 50) !== Math.floor((ms - 1000 / 60) / 50)) {
      const sentAt = Math.floor(ms / 50) * 50;
      t.linkReading(sentAt + 2, { on: true, peers: 1, bpm: 128, beat: (sentAt - origin) / period });
    }
    clock.setExternal(ms, t.read(ms));
    if (clock.update(ms, null, 0, 0).kick) kicks.push(ms);
  }
  const offs = kicks.slice(2).map((k) => { const b = origin + Math.round((k - origin) / period) * period; return k - b; });
  const beats = Math.floor((11000 - origin) / period) - Math.floor((1000 - origin) / period);
  check('the beat clock kicks once a beat on Link\'s tempo', Math.abs(kicks.length - beats) <= 2, `${kicks.length} kicks, ${beats} beats`);
  check('every kick in the frame its beat falls in', offs.every((o) => o >= -0.5 && o < 1000 / 60 + 0.5), `from ${Math.min(...offs).toFixed(1)} to ${Math.max(...offs).toFixed(1)} ms after the beat`);
}

// ── 5. Real sockets, on this machine's loopback ───────────────────────

{
  const clock = () => Number(process.hrtime.bigint() / 1000n);
  const sock = createSocket({ type: 'udp4', reuseAddr: true });
  await new Promise((done) => sock.bind(0, '127.0.0.1', done));
  sock.setMulticastInterface('127.0.0.1');
  sock.setMulticastLoopback(true);
  const live = makeLive({
    clock, ghostOffset: -clock() + 42e6, bpm: 123,
    send: (buf, port, address) => sock.send(buf, port, address),
    address: '127.0.0.1', port: sock.address().port,
  });
  sock.on('message', (buf, rinfo) => live.receive(buf, rinfo));
  const link = startLink({ onError: (err) => console.log(`  (link: ${err.message})`) });
  const timer = setInterval(() => live.alive(), 250);
  let r = link.reading();
  const until = Date.now() + 5000;
  while (Date.now() < until && !(r.peers > 0 && r.beat !== null)) {
    await new Promise((done) => setTimeout(done, 100));
    r = link.reading();
  }
  // A few more beats, so the measurement has settled.
  await new Promise((done) => setTimeout(done, 500));
  r = link.reading();
  const liveBeat = live.beat();
  const apart = r.beat === null ? Infinity : Math.abs(r.beat - liveBeat) * 60e3 / 123;
  check('over real sockets, the show server joins a session on this machine', r.peers >= 1, `peers ${r.peers}`);
  check('and reads its tempo and its beat within 2 ms', Math.abs(r.bpm - 123) < 0.001 && apart < 2, `${r.bpm.toFixed(3)} bpm, ${Number.isFinite(apart) ? apart.toFixed(3) : '—'} ms apart`);
  clearInterval(timer);
  link.stop();
  await new Promise((done) => setTimeout(done, 100));
  sock.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} Link checks pass`);
process.exit(failed.length ? 1 : 0);
