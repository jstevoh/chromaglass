#!/usr/bin/env node
/**
 * The live stream, end to end, against a local RTMP server (PLAN.md 37x-4b,
 * several destinations and a portrait encode 37x-4c).
 *
 *   npm run live                 # 30 seconds of the lab's plate and a tone, streamed and measured
 *   npm run live -- --seconds 60 # the plan's minute
 *   npm run live -- --codec aac  # the Mac shard: AAC or red, never the Opus stand-in
 *
 * What the owner asked for (2026-10-29) is a Mac app that streams the show to
 * YouTube and the rest. What this asks is whether the stream the app would
 * send is one those servers can take and a player can show, without a channel
 * or a key: the page's encoder (src/lib/liveStream.ts) streams the lab's plate
 * and a tone through the same RTMP client the Mac app's main process runs
 * (desktop/live.js, here in plain node, the page's packets crossing a
 * Playwright bridge where the app's cross IPC), to the check's own server
 * (scripts/rtmpListener.mjs), which records what arrives. The plan's words:
 * "a 60-second stream to a local RTMP server arrives with every second of
 * audio, frames at the stream's rate within a bound, and audio and plate in
 * sync to a frame".
 *
 * Each line is one thing the stream promises:
 *
 *   taken        the server saw connect, createStream and publish with the
 *                key, answered Publish.Start, and got onMetaData saying the
 *                size, rate and codecs of what followed
 *   headers      the AVC and audio sequence headers arrived before any frame
 *                or packet, since a player joining reads them first
 *   every second of audio
 *                the audio's packets cover the stream's length with no hole
 *                over a tenth of a second between two (a hole is heard as a
 *                dropout), measured on the timestamps the stream carries and
 *                again on the decoded samples
 *   frame rate   the frames arrived at the stream's rate: within a fifth of
 *                it over the whole stream (a software encoder on a shared CI
 *                box may not hold every frame of thirty; the encoder skips a
 *                frame it has no room for and says how many), none repeated,
 *                the median gap a frame, 19 in 20 gaps within two frames, no
 *                gap over a second, and the clock kept through a stall (the
 *                frame after a long gap is a frame after it, not another
 *                long gap: the first Mac run read one 768 ms gap in 30 s
 *                while a neighbouring job loaded the runner, and a check
 *                that failed on it measured the runner, not the stream), a
 *                keyframe within two frames after every two-second mark
 *   decodable    Chromium's own decoders, given the headers the stream sent,
 *                decode every frame and every packet: the stream is a valid
 *                H.264 and AAC (or Opus) stream, not just tags of bytes
 *   in sync      five times during the stream the page flashes the canvas
 *                white and sounds a click at the same instant (the audio
 *                clock and the frame clock paired through getOutputTimestamp);
 *                in what arrived, the white frame is the first frame taken
 *                after the flash was drawn (not a later one), and the sound
 *                goes loud where the page made it, once the codec's priming
 *                is set back (measured, see live-entry.ts), within an audio
 *                block and one codec frame (10 ms + 21 ms for AAC, 20 for
 *                Opus): the two clocks agree, whatever the machine's stalls
 *                did to the frame rate around a flash
 *   bookkeeping  the client answered the server's ping and acknowledged its
 *                bytes when asked, and its own counts match the server's
 *   a bad key    a stream whose key the server refuses fails with the
 *                server's words, the key cut from them
 *
 * Several destinations (37x-4c): the stream goes to three at once, as the
 * Mac app's session sends it (desktop/liveSession.js): the lines above are
 * the first landscape one's, and
 *
 *   the second   the other landscape destination got the same tags, byte for
 *                byte: one encode, written twice
 *   portrait     the third, on the portrait encode, arrived at its own size
 *                (onMetaData and the decoded frames 360x640), at the
 *                stream's rate, every frame decoded, the flash in the first
 *                frame after it was drawn; and what it shows is the plate's
 *                middle: between flashes it is brighter than the landscape
 *                stream, whose sides are the lab canvas's black margins (a
 *                stretched or letterboxed picture would carry the same
 *                share of black, a cover crop of the middle none)
 *
 * What a slow or lost destination does is `npm run livedrop`'s, in node.
 *   the keychain store (node)
 *                a key set is listed by name and not by value, read back,
 *                removed; the file holds no plaintext of it; a machine with
 *                no encryption refuses to keep one
 *
 * Audio codec: AAC where the machine encodes it (a Mac), Opus otherwise
 * (Linux Chromium has no AAC encoder); the line says which. The Mac app's
 * stream is AAC; Opus here is the same path with another codec in the tag.
 */
import { chromium } from 'playwright';
import { openLab } from './lab.mjs';
import { startRtmpListener, summarize } from './rtmpListener.mjs';
import { LiveClient } from '../desktop/live.js';
import { LiveSession } from '../desktop/liveSession.js';
import { makeKeyStore } from '../desktop/keys.js';
import { describeTag } from '../desktop/rtmp.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('--seconds', 30));
/** `--codec aac` (the Mac shard): the stream must use that codec, not whatever the machine has. */
const CODEC = arg('--codec', null);
const FPS = 30;
const EVENTS = 5;
const KEY = 'check-stream-key-7f3a';
const KEY2 = 'check-stream-key-second';
const KEY_TALL = 'check-stream-key-tall';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const fmt = (n, d = 1) => Number(n).toFixed(d);

// --- 1. The keychain store, in node, with a stand-in for safeStorage --------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'live-keys-'));
  const file = join(dir, 'live-keys.json');
  const xor = (s) => Buffer.from(Buffer.from(s, 'utf8').map((b) => b ^ 0x5a));
  let encrypted = 0;
  const safe = { isEncryptionAvailable: () => true, encryptString: (s) => { encrypted++; return xor(s); }, decryptString: (b) => xor(b.toString('utf8')).toString('utf8') };
  const store = makeKeyStore({ file, safeStorage: safe });
  store.set('youtube', 'yt-secret-1234');
  store.set('twitch', 'tw-secret-5678');
  const listed = store.list();
  const text = readFileSync(file, 'utf8');
  check('a key set is listed by name, and the list carries no key', listed.map((k) => k.name).join(',') === 'twitch,youtube' && !JSON.stringify(listed).includes('secret'), JSON.stringify(listed.map((k) => k.name)));
  // The ciphers decoded from base64 as well: a store that skipped encryption
  // would hold the key as base64, which the text alone would not show.
  const decoded = Object.values(JSON.parse(text)).map((e) => Buffer.from(e.cipher, 'base64').toString('utf8')).join('\n');
  check('the file holds no plaintext of a key, and every key went through the cipher', encrypted === 2 && !/secret/.test(text) && !/secret/.test(decoded), `${text.length} bytes, ${encrypted} encryptions`);
  check('the key reads back for the client', (await store.read('youtube')) === 'yt-secret-1234');
  check('a key can be removed, and a missing one reads as none', store.remove('youtube') && (await store.read('youtube')) === null && store.list().length === 1);
  const none = makeKeyStore({ file: join(dir, 'other.json'), safeStorage: { ...safe, isEncryptionAvailable: () => false } });
  let refused = null;
  try { none.set('x', 'y'); } catch (e) { refused = e.message; }
  check('with no encryption available the store refuses to keep a key', refused !== null && !none.list().length, refused ?? 'kept it');
  rmSync(dir, { recursive: true, force: true });
}

// --- 2. The stream ---------------------------------------------------------------------
const listener = await startRtmpListener({ refuse: 'wrong-key', pingAfterMs: 1500 });
const byKey = new Map();
listener.on('publish', (s) => { byKey.set(s.key, s); });

const { page, close } = await openLab({ entry: 'scripts/live-entry.ts' });
let session = null;
const clients = [];
try {
  // The bridge: what the Mac app's preload and wireLive do over IPC, done here over Playwright.
  await page.exposeFunction('__liveStart', async (req) => {
    session = new LiveSession({ outputs: req.outputs, destinations: req.destinations.map((d) => ({ name: d.name, url: d.url, key: d.key, output: d.output })) });
    const r = await session.start();
    return { ...r, state: session.state() };
  });
  await page.exposeFunction('__liveConfig', (cfg) => {
    if (cfg.video) session?.videoConfig(cfg.output, Uint8Array.from(cfg.video));
    if (cfg.audio) session?.audioConfig(cfg.audio.codec, Uint8Array.from(cfg.audio.description));
    return true;
  });
  await page.exposeFunction('__livePacket', (p) => {
    const data = Buffer.from(p.data, 'base64');
    if (p.kind === 'video') session?.video(p.output, p.timestampMs, !!p.key, data);
    else session?.audio(p.timestampMs, data);
    return true;
  });
  await page.exposeFunction('__liveStop', () => { session?.close(); return session?.state() ?? null; });
  await page.exposeFunction('__liveState', () => session?.state() ?? null);
  /** The first landscape destination's health, which the single-stream lines below read as 37x-4b's client state. */
  const first = (st) => st?.destinations?.find((d) => d.name === KEY) ?? null;

  const setup = await page.evaluate(() => window.liveLab.setup(96));
  console.log(`the lab's plate on a 640x360 canvas, a tone at ${setup.sampleRate} Hz; streaming ${SECONDS} s at ${FPS} fps to ${listener.url}`);
  const keys = [{ key: KEY }, { key: KEY2 }, { key: KEY_TALL, orientation: 'portrait' }];
  const started = await page.evaluate(([url, keys, fps, codec]) => window.liveLab.start(url, keys, fps, codec ?? undefined), [listener.url, keys, FPS, CODEC]);
  const published = byKey.get(KEY) ?? null;
  check('the server took the stream, on all three destinations', started.phase === 'live' && published !== null && byKey.has(KEY2) && byKey.has(KEY_TALL), `page ${started.phase}, audio ${started.audioCodec ?? 'none'} on the ${started.audioClock ?? '?'} clock`);
  const codec = started.audioCodec;
  if (CODEC) check(`the stream's audio is ${CODEC}, as this machine was asked`, codec === CODEC, `${codec ?? 'none'}`);

  // Flash and click, five times, spread over the stream, none in its first two seconds.
  const gap = (SECONDS - 4) / EVENTS;
  for (let i = 0; i < EVENTS; i++) {
    await page.evaluate((ms) => window.liveLab.event(ms), 1000);
    await page.waitForTimeout(gap * 1000);
  }
  await page.waitForTimeout(Math.max(0, SECONDS * 1000 - EVENTS * gap * 1000));
  const live = await page.evaluate(() => window.liveLab.state());
  const events = await page.evaluate(() => window.liveLab.events());
  const plateDrawn = await page.evaluate(() => window.liveLab.plate());
  const stopped = await page.evaluate(() => window.liveLab.stop());
  await new Promise((r) => setTimeout(r, 500));
  const s = summarize(published);
  const seconds = (Date.now() - published.started) / 1000;
  console.log(`  page: ${live.frames} frames taken, ${live.skipped} skipped, ${live.keyframes} keyframes, ${live.audioPackets} audio packets in ${fmt(live.seconds)} s; encoder queue ${live.encodeQueue}; the plate redrawn ${plateDrawn.redraws} times${plateDrawn.errors.length ? `, errors: ${plateDrawn.errors.join(' | ')}` : ''}`);
  check(`the plate kept redrawing under the stream, and ${EVENTS} flashes were made`, plateDrawn.redraws >= SECONDS / 2 && plateDrawn.errors.length === 0 && events.length === EVENTS, `${plateDrawn.redraws} redraws, ${events.length} flashes`);
  console.log(`  client: ${first(stopped?.transport)?.bytesSent ?? 0} bytes, ${first(stopped?.transport)?.videoFrames ?? 0} frames, ${first(stopped?.transport)?.videoDropped ?? 0} dropped, ${first(stopped?.transport)?.acks ?? 0} acks, ${first(stopped?.transport)?.pings ?? 0} pings; status ${JSON.stringify(first(stopped?.transport)?.status ?? [])}`);
  console.log(`  server: ${s.video.frames} frames (${s.video.keyframes} key, ${s.video.codec}) ${s.video.firstMs}..${s.video.lastMs} ms, ${s.audio.packets} ${s.audio.codec} packets ${s.audio.firstMs}..${s.audio.lastMs} ms, ${s.acks} acks, ${s.pongs} pongs`);

  const m = s.meta ?? {};
  check('onMetaData says what followed', m.width === 640 && m.height === 360 && m.framerate === FPS && m.videocodecid === 7 && (codec === 'aac' ? m.audiocodecid === 10 : m.audiocodecid === 'Opus') && m.audiosamplerate === setup.sampleRate, JSON.stringify(m));

  // Headers first.
  const tags = published.tags.map((t) => ({ ...t, d: describeTag(t.type, t.body) }));
  const firstVideo = tags.findIndex((t) => t.d.kind === 'video');
  const firstAudio = tags.findIndex((t) => t.d.kind === 'audio');
  const vHeader = firstVideo >= 0 && tags[firstVideo].d.header && tags[firstVideo].d.codec === 'avc';
  const aHeader = firstAudio >= 0 && tags[firstAudio].d.header;
  check('the AVC sequence header is the first video tag', vHeader, firstVideo >= 0 ? `${tags[firstVideo].d.payload.length} bytes of AVCDecoderConfigurationRecord` : 'no video');
  check('the audio sequence header is the first audio tag', aHeader, firstAudio >= 0 ? `${tags[firstAudio].d.codec}, ${tags[firstAudio].d.payload.length} bytes` : 'no audio');

  // Every second of audio, on the timestamps.
  const audioTags = tags.filter((t) => t.d.kind === 'audio' && !t.d.header);
  const audioGaps = audioTags.slice(1).map((t, i) => t.timestamp - audioTags[i].timestamp);
  // Each line below asks for packets first: Math.max of nothing is -Infinity,
  // [].every is true and null <= 500 is true, and a stream with no audio at
  // all would otherwise pass three audio lines (the check-skeptic's reading).
  const enoughAudio = audioTags.length >= SECONDS * 20 && s.audio.firstMs !== null;
  const worstAudioGap = enoughAudio ? Math.max(...audioGaps) : NaN;
  const audioSpan = enoughAudio ? (s.audio.lastMs - s.audio.firstMs) / 1000 : 0;
  check('the audio covers the stream', enoughAudio && audioSpan >= seconds - 0.6 && audioSpan <= seconds + 0.3, `${audioTags.length} packets, ${fmt(audioSpan, 2)} s of them against ${fmt(seconds, 2)} s streamed`);
  check('no hole in the audio over a tenth of a second', enoughAudio && worstAudioGap <= 100, `worst gap between packets ${fmt(worstAudioGap)} ms, median ${fmt(median(audioGaps))} ms`);
  check('the audio starts within half a second of the stream', enoughAudio && s.audio.firstMs <= 500, `first packet at ${s.audio.firstMs} ms`);

  // Frame rate.
  const videoTags = tags.filter((t) => t.d.kind === 'video' && !t.d.header);
  const enoughVideo = videoTags.length >= SECONDS * FPS * 0.5 && s.video.firstMs !== null;
  const videoSpan = enoughVideo ? (s.video.lastMs - s.video.firstMs) / 1000 : 0;
  const rate = enoughVideo ? (s.video.frames - 1) / videoSpan : 0;
  const vGaps = videoTags.slice(1).map((t, i) => t.timestamp - videoTags[i].timestamp);
  check('frames at the stream\'s rate', enoughVideo && rate >= FPS * 0.8 && rate <= FPS * 1.05, `${fmt(rate)} fps over ${fmt(videoSpan)} s (${s.video.frames} frames; the page skipped ${live.skipped})`);
  check('every frame later than the one before', enoughVideo && vGaps.every((g) => g > 0), `smallest gap ${fmt(Math.min(...vGaps))} ms`);
  // The distribution, not the worst moment: the stream is on its clock when
  // the typical gap is a frame and nearly every gap is within two; a shared
  // runner's stall (768 ms once in 30 s on CI's Mac) shows in the largest gap,
  // bounded at a second, and in whether the clock was kept through it: the
  // gap after a long one must be an ordinary one (the timer skips to the
  // frame due now, it does not queue the missed ones).
  const sortedGaps = vGaps.slice().sort((a, b) => a - b);
  const p95 = sortedGaps[Math.floor(sortedGaps.length * 0.95)] ?? NaN;
  const afterStall = vGaps.filter((g, i) => i > 0 && vGaps[i - 1] > 3 * 1000 / FPS);
  check('frames on the clock: the median gap a frame, 19 in 20 within two, none over a second', enoughVideo && Math.abs(median(vGaps) - 1000 / FPS) <= 1.5 && p95 <= 2 * 1000 / FPS && Math.max(...vGaps) <= 1000, `median ${fmt(median(vGaps))} ms, 95th ${fmt(p95)} ms, largest ${fmt(Math.max(...vGaps))} ms; ${vGaps.filter((g) => g > 3 * 1000 / FPS).length} gaps over three frames`);
  check('the clock is kept through a stall: the gap after a long one is within two frames', enoughVideo && afterStall.every((g) => g <= 2 * 1000 / FPS), afterStall.length ? `after ${afterStall.length} stall(s): ${afterStall.map((g) => fmt(g, 0)).join(', ')} ms` : 'no stall over three frames');
  const keyTimes = videoTags.filter((t) => t.d.key).map((t) => t.timestamp);
  const keyGaps = keyTimes.slice(1).map((t, i) => t - keyTimes[i]);
  // The page asks for a keyframe every two seconds, at the first frame taken
  // on or after each 2 s mark, so one must sit within two frames after every
  // mark. Asked where, not how many: an encoder may add its own (OpenH264
  // starts a new group when the picture changes a lot, as it does at each
  // flash and plate redraw), and a count alone was seen to pass with the
  // page asking for one keyframe in the whole stream (the check-skeptic's
  // control), on the encoder's scene changes alone.
  const marks = Array.from({ length: Math.floor(videoSpan / 2) + 1 }, (_, k) => 2000 * k);
  const missed = marks.filter((m) => !keyTimes.some((t) => t >= m - 5 && t <= m + 2 * 1000 / FPS));
  check('a keyframe within two frames after every two-second mark', enoughVideo && missed.length === 0 && keyTimes[0] === videoTags[0].timestamp, `${keyTimes.length} keyframes for ${marks.length} marks (the encoder's own included), gaps ${fmt(Math.min(...keyGaps), 0)}..${fmt(Math.max(...keyGaps), 0)} ms${missed.length ? `; no keyframe after ${missed.join(', ')} ms` : ''}`);
  // ... and sent nearly every frame the page took: equal counts of zero would read as agreement.
  check('the client sent what the page took and the server got', enoughVideo && (first(stopped?.transport)?.videoFrames ?? -1) === s.video.frames && (first(stopped?.transport)?.videoFrames ?? 0) >= 0.95 * live.frames && (first(stopped?.transport)?.audioPackets ?? -1) === s.audio.packets && (first(stopped?.transport)?.videoDropped ?? -1) === 0, `${live.frames} taken, ${first(stopped?.transport)?.videoFrames} sent, ${s.video.frames} received, ${first(stopped?.transport)?.videoDropped} dropped; ${first(stopped?.transport)?.audioPackets} / ${s.audio.packets} packets`);

  // Decodable, and in sync.
  if (!vHeader || !aHeader) throw new Error('no sequence headers to decode with: the lines above say which');
  const vdesc = tags[firstVideo].d.payload;
  const adesc = tags[firstAudio].d.payload;
  // The portrait encode's crop of the canvas, so the landscape's frames can be read over the same columns.
  const crop = await page.evaluate(() => window.liveLab.crop(640, 360, 360, 640, 'cover'));
  const decoded = await page.evaluate(([v, a]) => window.liveLab.decode(v, a), [
    { band: { x0: crop.sx, x1: crop.sx + crop.sw }, description: vdesc.toString('base64'), frames: videoTags.map((t) => ({ ts: t.timestamp, key: t.d.key, data: t.d.payload.toString('base64') })) },
    { codec, description: adesc.toString('base64'), sampleRate: setup.sampleRate, channels: m.stereo ? 2 : 1, packets: audioTags.map((t) => ({ ts: t.timestamp, data: t.d.payload.toString('base64') })) },
  ]);
  check('Chromium decodes every frame', !decoded.videoError && decoded.frames.length === videoTags.length, decoded.videoError ?? `${decoded.frames.length} of ${videoTags.length}`);
  // Within a tenth of a second (the hole bar above, now on the samples; a quarter would have let a 200 ms hole through), and no gap in the decoded levels either.
  const levelTimes = decoded.levels.map((l) => l.ts).sort((a, b) => a - b);
  const levelGap = levelTimes.length > 1 ? Math.max(...levelTimes.slice(1).map((t, i) => t - levelTimes[i])) : NaN;
  check('Chromium decodes every audio packet, to the seconds streamed, with no hole', !decoded.audioError && Math.abs(decoded.audioSeconds - audioSpan) <= 0.1 && levelGap <= 100, decoded.audioError ?? `${fmt(decoded.audioSeconds, 2)} s decoded, ${fmt(audioSpan, 2)} s of packets, largest gap in the decoded levels ${fmt(levelGap)} ms`);

  const frames = decoded.frames.slice().sort((a, b) => a.ts - b.ts);
  const dark = median(frames.map((f) => f.mean));
  const levels = decoded.levels.slice().sort((a, b) => a.ts - b.ts);
  const quiet = median(levels.map((l) => l.rms));
  const loud = Math.max(...levels.map((l) => l.rms));
  const codecFrameMs = codec === 'aac' ? 1024 / setup.sampleRate * 1000 : 20;
  const primingMs = decoded.primingMs ?? 0;
  const audioBound = 10 + codecFrameMs;
  console.log(`  decoded: the codec's priming ${decoded.primingMs === null ? 'could not be measured' : `${fmt(primingMs)} ms`}; the plate ${fmt(dark, 0)} of 255 between flashes; the tone ${fmt(quiet, 3)} rms, the clicks ${fmt(loud, 3)}`);
  const sync = [];
  for (const ev of events) {
    // The first frame taken after the flash was drawn, and the first white one from there.
    const firstAfter = frames.findIndex((f) => f.ts >= ev.flashMs);
    const whiteAt = frames.findIndex((f, i) => i >= Math.max(0, firstAfter - 1) && f.ts <= ev.flashMs + 1500 && f.mean > dark + 0.5 * (255 - dark));
    // The sound: where the level first reaches half the click's own peak, the codec's priming set back.
    const clickAt = levels.find((l) => l.ts - primingMs >= ev.clickMs - audioBound && l.ts - primingMs <= ev.clickMs + 1500 && l.rms > quiet + 0.5 * (loud - quiet));
    sync.push({
      white: whiteAt >= 0 ? frames[whiteAt].ts : null, firstAfter: firstAfter >= 0 ? frames[firstAfter].ts : null, late: whiteAt >= 0 && firstAfter >= 0 ? whiteAt - firstAfter : null,
      click: clickAt ? clickAt.ts - primingMs : null, audioErr: clickAt ? clickAt.ts - primingMs - ev.clickMs : null, drawn: ev.flashMs,
    });
  }
  console.log(`  sync: flash drawn → white frame ${sync.map((x) => x.white === null ? 'missing' : `+${fmt(x.white - x.drawn, 0)}`).join(', ')} ms (${sync.map((x) => x.late === null ? '?' : x.late === 0 ? 'the first frame after' : `${x.late} frame(s) late`).join(', ')}); click made → sound found ${sync.map((x) => x.audioErr === null ? 'missing' : `${x.audioErr >= 0 ? '+' : ''}${fmt(x.audioErr, 0)}`).join(', ')} ms`);
  check(`${EVENTS} flashes and clicks all seen in what arrived`, sync.length === EVENTS && sync.every((x) => x.white !== null && x.click !== null), `${sync.filter((x) => x.white !== null).length} flashes, ${sync.filter((x) => x.click !== null).length} clicks`);
  check('the flash is in the first frame taken after it was drawn, every time', sync.length === EVENTS && sync.every((x) => x.late === 0), sync.map((x) => x.late === null ? '?' : String(x.late)).join(', ') + ' frames late');
  check(`the sound is where the page made it, within an audio block and a codec frame (±${fmt(audioBound, 0)} ms) after ${fmt(primingMs, 0)} ms of priming, every time`, sync.length === EVENTS && sync.every((x) => x.audioErr !== null && Math.abs(x.audioErr) <= audioBound), sync.map((x) => x.audioErr === null ? '?' : fmt(x.audioErr, 0)).join(', ') + ' ms');

  // The second landscape destination: the same encode, so the same tags, byte for byte.
  {
    const media = (conn) => conn.tags.filter((t) => t.type === 8 || t.type === 9);
    const a1 = media(published), a2 = media(byKey.get(KEY2));
    const differ = a1.findIndex((t, i) => !a2[i] || t.type !== a2[i].type || t.timestamp !== a2[i].timestamp || !t.body.equals(a2[i].body));
    // Same bytes alone would not say one encode: a deterministic encoder run twice on the same frames may write them too. So the page's outputs are counted: one landscape, one portrait.
    const ids = (live.outputs ?? []).map((o) => o.id).join(',');
    check('the second landscape destination got the same tags, byte for byte, from the one landscape encode', ids === 'landscape,portrait' && a1.length > SECONDS * FPS * 0.5 && a1.length === a2.length && differ === -1, `the page's encodes ${ids}; ${a1.length} and ${a2.length} audio and video tags${differ >= 0 ? `; the first to differ is #${differ}` : ''}`);
  }

  // The portrait destination: its own encode, of the plate's middle.
  {
    const tall = byKey.get(KEY_TALL);
    const ts = summarize(tall);
    const ttags = tall.tags.map((t) => ({ ...t, d: describeTag(t.type, t.body) }));
    const tFirst = ttags.findIndex((t) => t.d.kind === 'video');
    const tv = ttags.filter((t) => t.d.kind === 'video' && !t.d.header);
    const tOut = live.outputs?.find((o) => o.id === 'portrait');
    const tSpan = tv.length > 1 ? (tv[tv.length - 1].timestamp - tv[0].timestamp) / 1000 : 0;
    const tRate = tSpan > 0 ? (tv.length - 1) / tSpan : 0;
    const tm = ts.meta ?? {};
    console.log(`  portrait: ${tOut?.frames ?? '?'} frames taken, ${tOut?.skipped ?? '?'} skipped, ${tOut?.keyframes ?? '?'} keyframes; ${tv.length} received at ${tm.width}x${tm.height}, ${fmt(tRate)} fps; the crop ${JSON.stringify(crop)}`);
    check('the portrait destination arrived at its own size and the stream\'s rate', tm.width === 360 && tm.height === 640 && tFirst >= 0 && ttags[tFirst].d.header && tv.length >= SECONDS * FPS * 0.5 && tRate >= FPS * 0.8 && tRate <= FPS * 1.05, `onMetaData ${tm.width}x${tm.height}; ${tv.length} frames at ${fmt(tRate)} fps over ${fmt(tSpan)} s`);
    const td = await page.evaluate((v) => window.liveLab.decode(v, null), { description: ttags[tFirst].d.payload.toString('base64'), frames: tv.map((t) => ({ ts: t.timestamp, key: t.d.key, data: t.d.payload.toString('base64') })) });
    check('Chromium decodes every portrait frame, at 360x640', !td.videoError && td.frames.length === tv.length && td.size?.width === 360 && td.size?.height === 640, td.videoError ?? `${td.frames.length} of ${tv.length}, ${td.size?.width}x${td.size?.height}`);
    const tframes = td.frames.slice().sort((a, b) => a.ts - b.ts);
    const tDark = median(tframes.map((f) => f.mean));
    const tLate = events.map((ev) => {
      const firstAfter = tframes.findIndex((f) => f.ts >= ev.flashMs);
      const whiteAt = tframes.findIndex((f, i) => i >= Math.max(0, firstAfter - 1) && f.ts <= ev.flashMs + 1500 && f.mean > tDark + 0.5 * (255 - tDark));
      return whiteAt >= 0 && firstAfter >= 0 ? whiteAt - firstAfter : null;
    });
    check('the flash is in the first portrait frame taken after it was drawn, every time', tLate.length === EVENTS && tLate.every((x) => x === 0), tLate.map((x) => (x === null ? '?' : String(x))).join(', ') + ' frames late');
    // The lab's canvas is the dish (360 of its 640 columns) with black either side: a cover crop's 202 middle columns are all dish.
    check('the portrait shows the plate\'s middle: brighter between flashes than the landscape, whose sides are black', tDark >= 1.3 * dark && dark > 2, `portrait ${fmt(tDark)} of 255, landscape ${fmt(dark)} (${fmt(tDark / dark, 2)}x; a stretch or letterbox carries the same share of black, about 1x)`);
    // And which middle: the landscape's own frames read over the crop's columns. A crop off centre by tens of columns still lies in the dish and passes the line above; it does not pass this one.
    const bandDark = median(frames.map((f) => f.band).filter((b) => b !== null));
    check('the portrait is the landscape\'s middle columns: their brightness between flashes within a tenth', Number.isFinite(bandDark) && bandDark > 2 && Math.abs(tDark - bandDark) <= 0.1 * bandDark, `portrait ${fmt(tDark)}, the landscape's columns ${fmt(crop.sx, 0)}..${fmt(crop.sx + crop.sw, 0)} ${fmt(bandDark)}`);
  }

  // Bookkeeping.
  check('the client answered the server\'s ping', (first(stopped?.transport)?.pings ?? 0) >= 1 && s.pongs >= 1, `${first(stopped?.transport)?.pings} answered, ${s.pongs} heard`);
  check('the client acknowledged the server\'s bytes when asked', (first(stopped?.transport)?.acks ?? 0) >= 1 && s.acks === first(stopped?.transport)?.acks, `${first(stopped?.transport)?.acks} sent, ${s.acks} heard, window ${256} bytes`);

  /*
    Always an audio track (37x-4f). The Mac app streamed to YouTube for
    minutes with no error and Studio showed "No data": with the sound source
    at None the encoder had no track and the stream went out as video alone,
    which YouTube's ingest is known not to start a broadcast from (ffmpeg's
    test pattern, with a tone, showed at once on the same key). Our listener and
    ffmpeg's both took the video-only stream happily, which is why no line
    here saw it. So two short streams: one with no source at all, as the app
    opens, and one whose source is switched off on air. Each must carry an
    audio track from its first frame to its last with no hole a server could
    read as the audio ending, and the track must decode: silence where there
    is no sound, the tone where there was.

    And a third (37x-4f-2): no source at Go, then a source opened on air,
    the order a set naturally runs in (the app opens at None; the owner
    presses Go, then starts the music). Before the fix the encoder took its
    sound once, at Go, and this stream was silence to the end. Now the tone
    must be heard from the moment it was handed over, at its own pitch
    (opened at 44.1 kHz against the silent track's 48, so a stream that
    forgot to resample it reads 239.5 Hz, not 220), placed on the stream's
    clock where it was opened (within 100 ms: placed late, a switched source
    would drift out of sync with the picture by however late), and the
    track still whole across the change.
  */
  for (const kind of ['no source', 'source off on air', 'source opened on air']) {
    const key = { 'no source': 'check-stream-key-silent', 'source off on air': 'check-stream-key-ended', 'source opened on air': 'check-stream-key-opened' }[kind];
    const opens = kind === 'source opened on air';
    const RUN_MS = 6000, END_MS = 2500;
    let opened = null;
    await page.evaluate(([url, k, fps, c, silent]) => window.liveLab.start(url, [{ key: k }], fps, c ?? undefined, 700, silent), [listener.url, key, FPS, CODEC, kind !== 'source off on air']);
    if (kind === 'source off on air') { await page.waitForTimeout(END_MS); await page.evaluate(() => window.liveLab.endTone()); await page.waitForTimeout(RUN_MS - END_MS); }
    else if (opens) { await page.waitForTimeout(END_MS); opened = await page.evaluate(() => window.liveLab.openTone(44100)); await page.waitForTimeout(RUN_MS - END_MS); }
    else await page.waitForTimeout(RUN_MS);
    const st = await page.evaluate(() => window.liveLab.stop());
    await new Promise((r) => setTimeout(r, 500));
    const conn = byKey.get(key);
    const tg = (conn?.tags ?? []).map((t) => ({ ...t, d: describeTag(t.type, t.body) }));
    const vt = tg.filter((t) => t.d.kind === 'video' && !t.d.header), at = tg.filter((t) => t.d.kind === 'audio' && !t.d.header);
    const aHead = tg.findIndex((t) => t.d.kind === 'audio' && t.d.header), vHead = tg.findIndex((t) => t.d.kind === 'video' && t.d.header);
    const aFirst = tg.findIndex((t) => t.d.kind === 'audio' && !t.d.header);
    const gaps = at.slice(1).map((t, i) => t.timestamp - at[i].timestamp);
    const maxGap = gaps.length ? Math.max(...gaps) : Infinity;
    const meta = conn?.meta ?? {};
    const span = vt.length > 1 ? `${vt[0].timestamp}..${vt[vt.length - 1].timestamp}` : 'none';
    const aspan = at.length > 1 ? `${at[0].timestamp}..${at[at.length - 1].timestamp}` : 'none';
    const covers = vt.length > FPS && at.length > 0 && at[0].timestamp <= vt[0].timestamp + 200 && at[at.length - 1].timestamp >= vt[vt.length - 1].timestamp - 300;
    check(`${kind}: the stream still carries an audio track, named in onMetaData, from the first frame to the last with no hole`, !!conn && meta.audiocodecid !== undefined && aHead >= 0 && aHead < aFirst && vHead >= 0 && covers && maxGap <= 100 && st?.audioCodec,
      `${st?.audioCodec ?? 'no'} audio, onMetaData audiocodecid ${meta.audiocodecid ?? 'none'}; video ${span} ms, audio ${aspan} ms in ${at.length} packets, widest gap ${Number.isFinite(maxGap) ? maxGap : '-'} ms`);
    if (!conn || vHead < 0 || aHead < 0 || !at.length) continue;
    const rate = Number(meta.audiosamplerate) || setup.sampleRate;
    const dec = await page.evaluate(([v, a]) => window.liveLab.decode(v, a), [
      { description: tg[vHead].d.payload.toString('base64'), frames: vt.map((t) => ({ ts: t.timestamp, key: t.d.key, data: t.d.payload.toString('base64') })) },
      { codec: tg[aHead].d.codec, description: tg[aHead].d.payload.toString('base64'), sampleRate: rate, channels: meta.stereo ? 2 : 1, packets: at.map((t) => ({ ts: t.timestamp, data: t.d.payload.toString('base64') })) },
    ]);
    // The tone is 0.05 of full scale (RMS 0.035); silence is zeros, which an AAC or Opus round trip leaves under a thousandth.
    const loud = (l) => l.rms > 0.01, quiet = (l) => l.rms < 0.001;
    const lv = dec.levels ?? [];
    const before = lv.filter((l) => l.ts > 300 && l.ts < END_MS - 300), after = lv.filter((l) => l.ts > END_MS + 700);
    const audioSpan = (at[at.length - 1].timestamp - at[0].timestamp) / 1000;
    const whole = !dec.audioError && Math.abs(dec.audioSeconds - audioSpan) <= 0.15;
    if (opens) {
      // Before the hand-over, silence; from 300 ms after it, the tone, at 220 Hz; and where it starts on the stream's clock, the decoder's priming set back.
      const om = opened?.openedMs ?? NaN;
      const pre = lv.filter((l) => l.ts > 300 && l.ts < om - 100), post = lv.filter((l) => l.ts > om + 300);
      const prime = dec.primingMs ?? 0;
      const onset = lv.find((l) => l.ts > om - 1000 && loud(l));
      const onsetMs = onset ? onset.ts - prime : NaN;
      const hz = median((dec.pitch ?? []).filter((p) => p.ts > om + 300).map((p) => p.hz));
      check(`${kind}: the audio track decodes, silence until the source was opened and the tone from then on, at its own pitch`,
        whole && pre.length > 0 && pre.every(quiet) && post.length > 0 && post.filter(loud).length >= 0.95 * post.length && Math.abs(hz - 220) <= 3,
        dec.audioError ?? `${fmt(dec.audioSeconds, 2)} s decoded of ${fmt(audioSpan, 2)} s; before ${pre.filter(quiet).length}/${pre.length} quiet, after ${post.filter(loud).length}/${post.length} loud; pitch ${fmt(hz, 1)} Hz (220 sent from ${opened?.rate} Hz into a ${rate} Hz track)`);
      check(`${kind}: the tone starts on the stream's clock where it was opened, within 100 ms`, Number.isFinite(onsetMs) && Math.abs(onsetMs - om) <= 100,
        `opened at ${fmt(om, 0)} ms, heard from ${fmt(onsetMs, 0)} ms (priming ${fmt(prime, 1)} ms set back)`);
      check(`${kind}: the encoder says it moved to the new source once, resampling it`, st?.audioSwitches === 1 && st?.audioResampled === (opened?.rate !== rate),
        `${st?.audioSwitches} switches, resampled ${st?.audioResampled}`);
      continue;
    }
    const heard = kind === 'no source'
      ? lv.length > 0 && lv.every(quiet)
      : before.length > 0 && after.length > 0 && before.filter(loud).length >= 0.9 * before.length && after.every(quiet);
    check(`${kind}: the audio track decodes, ${kind === 'no source' ? 'silence throughout' : 'the tone until it was switched off, silence after'}`, whole && heard,
      dec.audioError ?? `${fmt(dec.audioSeconds, 2)} s decoded of ${fmt(audioSpan, 2)} s; ${kind === 'no source' ? `loudest ${fmt(Math.max(...lv.map((l) => l.rms)), 4)}` : `before ${before.filter(loud).length}/${before.length} loud, after ${after.filter(quiet).length}/${after.length} quiet`}`);
  }

  // A bad key.
  const bad = new LiveClient({ url: listener.url, key: 'wrong-key', meta: {} });
  let badErr = null;
  try { await bad.connect(); } catch (e) { badErr = e.message; }
  check('a refused key fails with the server\'s words and without the key', badErr !== null && /BadName/.test(badErr) && !badErr.includes('wrong-key') && bad.state().phase === 'failed', badErr ?? 'connected');
} finally {
  session?.close();
  for (const c of clients) c.close();
  await close();
  await listener.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

function median(xs) { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
