#!/usr/bin/env node
/**
 * Several destinations, a slow one and a lost one (PLAN.md 37x-4c).
 *
 *   npm run livedrop
 *
 * The Mac app's live show writes the same packets to every platform it
 * streams to (desktop/liveSession.js), one RTMPS connection each
 * (desktop/live.js). What a show meets that the lab's `npm run live` never
 * does: an upload that cannot keep up with one destination, a connection
 * that drops mid-show, a key a platform refuses. This drives a session in
 * plain node, no browser, with a made-up stream of the real shape (thirty
 * frames a second, a keyframe every two seconds, about 5 Mbps; fifty audio
 * packets a second), each packet numbered in its first bytes so what
 * arrived can be told apart from what was sent, to local listeners
 * (scripts/rtmpListener.mjs) that read slowly, hang up, or refuse on cue.
 *
 * Five destinations on one session:
 *
 *   slow     landscape; its listener is throttled to 150 KB/s (a quarter of
 *            the stream) for ten seconds, then let go
 *   steady   landscape, beside it on the same encode: never throttled
 *   tall     the vertical output; its connection is dropped at 6 s
 *   refused  landscape, with a key its listener refuses
 *   quiet    landscape, on a listener that never acknowledges
 *
 * Each line is one thing the session promises:
 *
 *   started       the show went live with the refused one refused, not the
 *                 whole start failed
 *   steady        the destination beside a slow one got every frame and every
 *                 audio packet, none dropped: one socket's trouble is its own
 *   slow, falls behind
 *                 the slow one's readout said it was more than the bound
 *                 behind (on the server's acknowledgements, not the socket's
 *                 guess), and it dropped video
 *   slow, honest  the readout's seconds behind against the truth (the
 *                 newest timestamp written against the newest the listener
 *                 has read), sampled through the throttle: within an
 *                 acknowledgement's window of the stream, never under
 *   slow, kbps    the readout's kilobits a second while throttled against
 *                 the throttle's own rate
 *   slow, drops to a keyframe
 *                 every frame that arrived after a gap is a keyframe (a
 *                 delta frame without the ones before it is garbage on
 *                 screen), and the frames arrived in order
 *   slow, no sound lost
 *                 every audio packet arrived, in order, through the throttle
 *   slow, recovers
 *                 once the throttle lifts, it is back under the bound and
 *                 sending every frame again: the stream's last three seconds
 *                 complete, the readout under half the bound
 *   tall, reconnects
 *                 the dropped connection was made again, with the same key,
 *                 joining at a keyframe with its clock from zero, its
 *                 sequence headers sent again, and counted
 *   refused       asked once, never again, while the others streamed
 *   quiet         a server that never acknowledges is judged on the socket,
 *                 and says so, and drops nothing when it keeps up. Not that
 *                 the socket's word can see a slow server: it cannot, until
 *                 the kernel's buffers are full (the check-skeptic throttled
 *                 this one: 1.29 s read while 7 s were queued; PLAN 37x-4c's
 *                 found item), so this line claims only the fallback
 *   resume        the drop resumes at the first keyframe once the readout is
 *                 under half the bound, not at the bound: a client fed a
 *                 scripted readout
 *   none reachable
 *                 a start where no destination can be reached fails, with
 *                 each one's reason, and tries nothing again
 */
import { startRtmpListener, summarize } from './rtmpListener.mjs';
import { LiveSession } from '../desktop/liveSession.js';
import { BEHIND_LIMIT_SECONDS, WINDOW_ACK, LiveClient } from '../desktop/live.js';
import { describeTag } from '../desktop/rtmp.js';

const FPS = 30;
const KEY_EVERY = 60;
const KEY_BYTES = 60000, DELTA_BYTES = 20000, AUDIO_BYTES = 300;
const STREAM_BPS = ((KEY_BYTES + (KEY_EVERY - 1) * DELTA_BYTES) / KEY_EVERY) * FPS + 50 * AUDIO_BYTES;
const THROTTLE = 150000;
const THROTTLE_FROM = 3000, THROTTLE_UNTIL = 13000, KILL_AT = 6000, END_AT = 19000;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fmt = (n, d = 1) => Number(n).toFixed(d);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A packet that says what it is: kind, its number, the output, then filler to its size. */
function packet(kind, n, size) {
  const b = Buffer.alloc(size, 0x55);
  b.write(kind, 0, 'ascii');
  b.writeUInt32BE(n, 4);
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}
const numberOf = (payload) => payload.readUInt32BE(4);

const listener = await startRtmpListener({ refuse: 'refused-key', pingAfterMs: 0 });
const quietListener = await startRtmpListener({ acknowledge: false, pingAfterMs: 0 });
const byKey = new Map();
const onPublish = (s) => { if (!byKey.has(s.key)) byKey.set(s.key, []); byKey.get(s.key).push(s); };
listener.on('publish', onPublish);
quietListener.on('publish', onPublish);

const meta = (width, height) => ({ width, height, fps: FPS, videoBitrate: STREAM_BPS * 8, audio: { codec: 'aac', sampleRate: 48000, channels: 2, bitrate: 128000 } });
const session = new LiveSession({
  outputs: [{ id: 'wide', meta: meta(1920, 1080) }, { id: 'tall', meta: meta(720, 1280) }],
  destinations: [
    { name: 'slow', url: listener.url, key: 'slow-key', output: 'wide' },
    { name: 'steady', url: listener.url, key: 'steady-key', output: 'wide' },
    { name: 'tall', url: listener.url, key: 'tall-key', output: 'tall' },
    { name: 'refused', url: listener.url, key: 'refused-key', output: 'wide' },
    { name: 'quiet', url: quietListener.url, key: 'quiet-key', output: 'wide' },
  ],
  reconnectDelaysMs: [500, 1000],
});

const started = await session.start();
const health = (name) => session.state().destinations.find((d) => d.name === name);
check('the show went live with one destination refused, not the whole start failed', started.ok && health('refused').phase === 'refused' && ['slow', 'steady', 'tall', 'quiet'].every((n) => health(n).phase === 'live'), `${started.ok ? 'live' : started.error}; ${session.state().destinations.map((d) => `${d.name} ${d.phase}`).join(', ')}`);

// The sequence headers, as the page sends them with its first frame and packet.
session.videoConfig('wide', Uint8Array.from([1, 0x64, 0, 0x28, 0xff]));
session.videoConfig('tall', Uint8Array.from([1, 0x64, 0, 0x1f, 0xff]));
session.audioConfig('aac', Uint8Array.from([0x11, 0x90]));

// The stream, on the wall clock: a frame each 1/30 s on both outputs, an audio packet each 20 ms.
const t0 = Date.now();
let frames = 0, audioPackets = 0;
const sent = { wideKeys: [], tallKeys: [] };
const samples = [];
let slowConn = null, killed = false, throttled = false, released = false;
while (Date.now() - t0 < END_AT) {
  const now = Date.now() - t0;
  while (frames * 1000 / FPS <= now) {
    const ts = Math.round(frames * 1000 / FPS);
    const key = frames % KEY_EVERY === 0;
    session.video('wide', ts, key, packet('wide', frames, key ? KEY_BYTES : DELTA_BYTES));
    session.video('tall', ts, key, packet('tall', frames, key ? KEY_BYTES / 2 : DELTA_BYTES / 2));
    frames++;
  }
  while (audioPackets * 20 <= now) { session.audio(audioPackets * 20, packet('aud.', audioPackets, AUDIO_BYTES)); audioPackets++; }
  slowConn ??= byKey.get('slow-key')?.[0] ?? null;
  if (!throttled && now >= THROTTLE_FROM && slowConn) { slowConn.throttle(THROTTLE); throttled = true; }
  if (!released && now >= THROTTLE_UNTIL && slowConn) { slowConn.throttle(null); released = true; }
  if (!killed && now >= KILL_AT) { byKey.get('tall-key')?.[0]?.kill(); killed = true; }
  if (samples.length === 0 || now - samples[samples.length - 1].at >= 250) {
    const h = health('slow');
    // The truth: the newest frame or packet written to the slow socket against the newest its listener has read.
    const tags = slowConn?.tags ?? [];
    const lastRead = tags.length ? tags[tags.length - 1].timestamp : 0;
    const lastWritten = Math.round((frames - 1) * 1000 / FPS);
    samples.push({ at: now, behind: h.secondsBehind, by: h.measuredAt, kbps: h.kbps, dropping: h.dropping, truth: Math.max(0, (lastWritten - lastRead) / 1000) });
  }
  await sleep(5);
}
const endHealth = Object.fromEntries(session.state().destinations.map((d) => [d.name, d]));
session.close();
await sleep(1500);

const framesOf = (conn, kind) => conn.tags.map((t) => ({ ...t, d: describeTag(t.type, t.body) })).filter((t) => t.d.kind === kind && !t.d.header);
const nums = (tags) => tags.map((t) => numberOf(t.d.payload));
const complete = (ns, n) => ns.length === n && ns.every((x, i) => x === i);

// steady: every frame, every packet.
{
  const conn = byKey.get('steady-key')[0];
  const v = nums(framesOf(conn, 'video')), a = nums(framesOf(conn, 'audio'));
  const h = endHealth.steady;
  check('the destination beside a slow one got every frame and every packet, none dropped', complete(v, frames) && complete(a, audioPackets) && h.videoDropped === 0, `${v.length} of ${frames} frames, ${a.length} of ${audioPackets} packets; ${h.videoDropped} dropped; ${h.kbps} kbps out at the end (the stream ${fmt(STREAM_BPS * 8 / 1000, 0)})`);
}

// slow.
{
  const conn = byKey.get('slow-key')[0];
  const vt = framesOf(conn, 'video');
  const v = nums(vt), a = nums(framesOf(conn, 'audio'));
  const h = endHealth.slow;
  const during = samples.filter((s) => s.at >= THROTTLE_FROM + 1000 && s.at < THROTTLE_UNTIL);
  const maxBehind = Math.max(...during.map((s) => s.behind));
  const byServer = during.filter((s) => s.by === 'server').length;
  console.log(`  slow: ${h.videoFrames} frames sent, ${h.videoDropped} dropped in ${h.dropRuns} run(s); readout through the throttle ${during.map((s) => fmt(s.behind)).join(' ')} s behind`);
  check(`the slow one's readout passed the ${BEHIND_LIMIT_SECONDS} s bound on the server's word, and it dropped video`, maxBehind > BEHIND_LIMIT_SECONDS && byServer === during.length && h.videoDropped > 0 && h.dropRuns >= 1, `${fmt(maxBehind)} s at most, ${byServer} of ${during.length} readings from the server's acknowledgements; ${h.videoDropped} frames dropped`);
  // An acknowledgement comes every WINDOW_ACK bytes, so the readout may lag the truth by that much of the stream (and the sampling by a frame or two).
  const ackSeconds = WINDOW_ACK / STREAM_BPS;
  const errs = during.map((s) => s.behind - s.truth);
  check(`the readout's seconds behind is the truth's, to an acknowledgement's window (${fmt(ackSeconds, 2)} s of stream) and never under it`, during.length > 20 && errs.every((e) => e >= -0.15 && e <= ackSeconds + 0.15), `readout minus truth ${fmt(Math.min(...errs), 2)}..${fmt(Math.max(...errs), 2)} s over ${during.length} readings`);
  const kbpsDuring = during.filter((s) => s.at >= THROTTLE_FROM + 3000).map((s) => s.kbps);
  const meanKbps = kbpsDuring.reduce((x, y) => x + y, 0) / Math.max(1, kbpsDuring.length);
  // Every reading, not their mean: a rate taken on the bytes written swings from a tenth of the throttle to four times it and still averages near it (the check-skeptic's control).
  check(`the readout's kbps while throttled is the throttle's ${THROTTLE * 8 / 1000}, every reading within a quarter`, kbpsDuring.length > 10 && kbpsDuring.every((k) => Math.abs(k - THROTTLE * 8 / 1000) <= 0.25 * THROTTLE * 8 / 1000), `${fmt(meanKbps, 0)} kbps on average, ${fmt(Math.min(...kbpsDuring), 0)}..${fmt(Math.max(...kbpsDuring), 0)}`);
  const ordered = v.every((x, i) => i === 0 || x > v[i - 1]);
  const afterGap = vt.filter((t, i) => i > 0 && v[i] > v[i - 1] + 1);
  check('every frame that arrived after a gap is a keyframe, and the frames arrived in order', ordered && afterGap.length >= 1 && afterGap.every((t) => t.d.key), `${afterGap.length} gap(s), the frame after each ${afterGap.map((t) => (t.d.key ? 'key' : 'DELTA')).join(', ')}; ${v.length} of ${frames} frames arrived`);
  check('no audio packet was lost through the throttle', complete(a, audioPackets), `${a.length} of ${audioPackets}, in order ${a.every((x, i) => x === i)}`);
  const lastThree = v.filter((x) => x >= frames - 3 * FPS);
  check('once let go it recovered: the last three seconds complete, the readout under half the bound', complete(lastThree.map((x) => x - (frames - 3 * FPS)), 3 * FPS) && h.secondsBehind < BEHIND_LIMIT_SECONDS / 2 && !h.dropping, `${lastThree.length} of ${3 * FPS} frames, ${fmt(h.secondsBehind, 2)} s behind at the end, dropping ${h.dropping}`);
}

// tall: reconnected.
{
  const conns = byKey.get('tall-key') ?? [];
  const second = conns[1];
  const h = endHealth.tall;
  const tags = second ? second.tags.map((t) => ({ ...t, d: describeTag(t.type, t.body) })) : [];
  const firstVideo = tags.findIndex((t) => t.d.kind === 'video');
  const firstAudio = tags.findIndex((t) => t.d.kind === 'audio');
  const firstFrame = tags.find((t) => t.d.kind === 'video' && !t.d.header);
  const firstPacket = tags.find((t) => t.d.kind === 'audio' && !t.d.header);
  const s = second ? summarize(second) : null;
  const ok = conns.length === 2 && h.reconnects === 1 && h.phase === 'live'
    && firstVideo >= 0 && tags[firstVideo].d.header && firstAudio >= 0 && tags[firstAudio].d.header
    && firstFrame?.d.key && firstFrame.timestamp === 0 && firstPacket && firstPacket.timestamp >= 0 && firstPacket.timestamp < 100
    && s?.meta?.width === 720 && s?.meta?.height === 1280;
  check('the dropped vertical connection was made again: same key, headers again, joining at a keyframe on a clock from zero', ok, second ? `${conns.length} publishes, ${h.reconnects} reconnect(s), ${h.phase}; first frame ${firstFrame?.d.key ? 'key' : 'delta'} at ${firstFrame?.timestamp} ms (frame ${firstFrame ? numberOf(firstFrame.d.payload) : '?'}), first packet at ${firstPacket?.timestamp} ms, ${s.video.frames} frames after; meta ${s.meta?.width}x${s.meta?.height}` : `${conns.length} publish(es), reconnects ${h.reconnects}, ${h.phase} ${h.error ?? ''}`);
}

// refused, quiet.
{
  const h = endHealth.refused;
  check('the refused key was asked once and never again', listener.refusals === 1 && h.reconnects === 0 && h.phase === 'refused' && /BadName/.test(h.error ?? '') && !(h.error ?? '').includes('refused-key'), `${listener.refusals} refusal(s) over ${fmt(END_AT / 1000, 0)} s; ${h.phase}: ${h.error}`);
  const q = endHealth.quiet;
  const conn = byKey.get('quiet-key')[0];
  check('a server that never acknowledges is judged on the socket, says so, and drops nothing when it keeps up (not that it sees a slow one: PLAN 37x-4c)', q.measuredAt === 'socket' && q.serverAcks === 0 && q.videoDropped === 0 && complete(nums(framesOf(conn, 'video')), frames), `measured at the ${q.measuredAt}, ${q.serverAcks} acknowledgements, ${q.videoDropped} dropped`);
}

// Resume at half the bound: a client with a scripted readout and a socket that takes everything.
{
  const c = new LiveClient({ url: 'rtmp://127.0.0.1:1/live', key: 'k', meta: {} });
  c.phase = 'live';
  c.sequenced.video = true;
  c.socket = { destroyed: false, writableLength: 0, write: (_b, cb) => { cb?.(); return true; } };
  let reading = 0;
  c.behind = () => ({ bytes: 0, seconds: reading, by: 'server' });
  // [seconds behind, keyframe?, sent?]: over the bound starts the drop; a keyframe at 1.8 and 1.2 is still dropped; a delta at 0.9 too; the keyframe at 0.9 is sent.
  const script = [[0.5, false, true], [2.5, false, false], [1.8, true, false], [1.2, true, false], [0.9, false, false], [0.9, true, true], [0.9, false, true]];
  const got = script.map(([s, key], i) => { reading = s; return c.video(i * 33, key, new Uint8Array(4)); });
  const want = script.map((x) => x[2]);
  check(`the drop resumes at the first keyframe under half the bound (${BEHIND_LIMIT_SECONDS / 2} s), not at the bound`, got.every((x, i) => x === want[i]) && c.counts.dropRuns === 1, `sent ${got.map((x) => (x ? 'y' : 'n')).join('')} against ${want.map((x) => (x ? 'y' : 'n')).join('')}, ${c.counts.dropRuns} drop run(s)`);
}

// None reachable.
{
  const nowhere = await startRtmpListener();
  const url = nowhere.url;
  await nowhere.close();
  const s = new LiveSession({ outputs: [{ id: 'wide', meta: meta(1920, 1080) }], destinations: [{ name: 'a', url, key: 'k1' }, { name: 'b', url, key: 'k2' }], reconnectDelaysMs: [100] });
  const r = await s.start();
  await sleep(400);
  const st = s.state();
  check('a start where no destination can be reached fails with each one\'s reason, and tries nothing again', !r.ok && /a: .*b: /.test(r.error ?? '') && st.phase === 'failed' && st.destinations.every((d) => d.reconnects === 0 && d.retryInMs === null), `${r.ok ? 'went live' : r.error}; ${st.phase}`);
}

await listener.close();
await quietListener.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
