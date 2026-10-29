#!/usr/bin/env node
/**
 * The live stream, end to end, against a local RTMP server (PLAN.md 37x-4b).
 *
 *   npm run live                 # 30 seconds of the lab's plate and a tone, streamed and measured
 *   npm run live -- --seconds 60 # the plan's minute
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
 *                a keyframe every two seconds within half a second
 *   decodable    Chromium's own decoders, given the headers the stream sent,
 *                decode every frame and every packet: the stream is a valid
 *                H.264 and AAC (or Opus) stream, not just tags of bytes
 *   in sync      five times during the stream the page flashes the canvas
 *                white and sounds a click at the same instant (the audio
 *                clock and the frame clock paired through getOutputTimestamp);
 *                in what arrived, the frame that went white and the audio
 *                that went loud are within one frame and one audio block
 *                (1000/fps + 10 ms) of each other, every time
 *   bookkeeping  the client answered the server's ping and acknowledged its
 *                bytes when asked, and its own counts match the server's
 *   a bad key    a stream whose key the server refuses fails with the
 *                server's words, the key cut from them
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
import { makeKeyStore } from '../desktop/keys.js';
import { describeTag } from '../desktop/rtmp.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, d) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : d; };
const SECONDS = Number(arg('--seconds', 30));
const FPS = 30;
const EVENTS = 5;
const KEY = 'check-stream-key-7f3a';

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
  const safe = { isEncryptionAvailable: () => true, encryptString: (s) => xor(s), decryptString: (b) => xor(b.toString('utf8')).toString('utf8') };
  const store = makeKeyStore({ file, safeStorage: safe });
  store.set('youtube', 'yt-secret-1234');
  store.set('twitch', 'tw-secret-5678');
  const listed = store.list();
  const text = readFileSync(file, 'utf8');
  check('a key set is listed by name, and the list carries no key', listed.map((k) => k.name).join(',') === 'twitch,youtube' && !JSON.stringify(listed).includes('secret'), JSON.stringify(listed.map((k) => k.name)));
  check('the file holds no plaintext of a key', !text.includes('yt-secret') && !text.includes('tw-secret'), `${text.length} bytes`);
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
let published = null;
listener.on('publish', (s) => { published = s; });

const { page, close } = await openLab({ entry: 'scripts/live-entry.ts' });
let client = null;
const clients = [];
try {
  // The bridge: what the Mac app's preload does over IPC, done here over Playwright.
  await page.exposeFunction('__liveStart', async (req) => {
    client = new LiveClient({ url: req.url, key: req.key, meta: req.meta });
    clients.push(client);
    try { await client.connect(); return { ok: true, state: client.state() }; } catch (e) { return { ok: false, error: client.error ?? e.message, state: client.state() }; }
  });
  await page.exposeFunction('__liveConfig', (cfg) => {
    if (cfg.video) client?.videoConfig(Uint8Array.from(cfg.video));
    if (cfg.audio) client?.audioConfig(cfg.audio.codec, Uint8Array.from(cfg.audio.description));
    return true;
  });
  await page.exposeFunction('__livePacket', (p) => {
    const data = Buffer.from(p.data, 'base64');
    if (p.kind === 'video') client?.video(p.timestampMs, !!p.key, data);
    else client?.audio(p.timestampMs, data);
    return true;
  });
  await page.exposeFunction('__liveStop', () => { client?.close(); return client?.state() ?? null; });
  await page.exposeFunction('__liveState', () => client?.state() ?? null);

  const setup = await page.evaluate(() => window.liveLab.setup(96));
  console.log(`the lab's plate on a 640x360 canvas, a tone at ${setup.sampleRate} Hz; streaming ${SECONDS} s at ${FPS} fps to ${listener.url}`);
  const started = await page.evaluate(([url, key, fps]) => window.liveLab.start(url, key, fps), [listener.url, KEY, FPS]);
  check('the server took the stream', started.phase === 'live' && published !== null && published.key === KEY, `page ${started.phase}, audio ${started.audioCodec ?? 'none'} on the ${started.audioClock ?? '?'} clock`);
  const codec = started.audioCodec;

  // Flash and click, five times, spread over the stream, none in its first two seconds.
  const gap = (SECONDS - 4) / EVENTS;
  for (let i = 0; i < EVENTS; i++) {
    await page.evaluate((ms) => window.liveLab.event(ms), 1000);
    await page.waitForTimeout(gap * 1000);
  }
  await page.waitForTimeout(Math.max(0, SECONDS * 1000 - EVENTS * gap * 1000));
  const live = await page.evaluate(() => window.liveLab.state());
  const events = await page.evaluate(() => window.liveLab.events());
  const stopped = await page.evaluate(() => window.liveLab.stop());
  await new Promise((r) => setTimeout(r, 500));
  const s = summarize(published);
  const seconds = (Date.now() - published.started) / 1000;
  console.log(`  page: ${live.frames} frames taken, ${live.skipped} skipped, ${live.keyframes} keyframes, ${live.audioPackets} audio packets in ${fmt(live.seconds)} s; encoder queue ${live.encodeQueue}`);
  console.log(`  client: ${stopped?.transport?.bytesSent ?? 0} bytes, ${stopped?.transport?.videoFrames ?? 0} frames, ${stopped?.transport?.videoDropped ?? 0} dropped, ${stopped?.transport?.acks ?? 0} acks, ${stopped?.transport?.pings ?? 0} pings; status ${JSON.stringify(stopped?.transport?.status ?? [])}`);
  console.log(`  server: ${s.video.frames} frames (${s.video.keyframes} key, ${s.video.codec}) ${s.video.firstMs}..${s.video.lastMs} ms, ${s.audio.packets} ${s.audio.codec} packets ${s.audio.firstMs}..${s.audio.lastMs} ms, ${s.acks} acks, ${s.pongs} pongs`);

  const m = s.meta ?? {};
  check('onMetaData says what followed', m.width === 640 && m.height === 360 && m.framerate === FPS && m.videocodecid === 7 && (codec === 'aac' ? m.audiocodecid === 10 : m.audiocodecid === 'Opus') && m.audiosamplerate === setup.sampleRate, JSON.stringify(m));

  // Headers first.
  const tags = published.tags.map((t) => ({ ...t, d: describeTag(t.type, t.body) }));
  const firstVideo = tags.findIndex((t) => t.d.kind === 'video');
  const firstAudio = tags.findIndex((t) => t.d.kind === 'audio');
  check('the AVC sequence header is the first video tag', firstVideo >= 0 && tags[firstVideo].d.header && tags[firstVideo].d.codec === 'avc', firstVideo >= 0 ? `${tags[firstVideo].d.payload.length} bytes of AVCDecoderConfigurationRecord` : 'no video');
  check('the audio sequence header is the first audio tag', firstAudio >= 0 && tags[firstAudio].d.header, firstAudio >= 0 ? `${tags[firstAudio].d.codec}, ${tags[firstAudio].d.payload.length} bytes` : 'no audio');

  // Every second of audio, on the timestamps.
  const audioTags = tags.filter((t) => t.d.kind === 'audio' && !t.d.header);
  const audioGaps = audioTags.slice(1).map((t, i) => t.timestamp - audioTags[i].timestamp);
  const worstAudioGap = Math.max(...audioGaps);
  const audioSpan = (s.audio.lastMs - s.audio.firstMs) / 1000;
  check('the audio covers the stream', audioSpan >= seconds - 0.6 && audioSpan <= seconds + 0.3, `${fmt(audioSpan, 2)} s of packets against ${fmt(seconds, 2)} s streamed`);
  check('no hole in the audio over a tenth of a second', worstAudioGap <= 100, `worst gap between packets ${fmt(worstAudioGap)} ms, median ${fmt(median(audioGaps))} ms`);
  check('the audio starts within half a second of the stream', s.audio.firstMs <= 500, `first packet at ${s.audio.firstMs} ms`);

  // Frame rate.
  const videoTags = tags.filter((t) => t.d.kind === 'video' && !t.d.header);
  const videoSpan = (s.video.lastMs - s.video.firstMs) / 1000;
  const rate = (s.video.frames - 1) / videoSpan;
  const vGaps = videoTags.slice(1).map((t, i) => t.timestamp - videoTags[i].timestamp);
  check('frames at the stream\'s rate', rate >= FPS * 0.8 && rate <= FPS * 1.05, `${fmt(rate)} fps over ${fmt(videoSpan)} s (${s.video.frames} frames; the page skipped ${live.skipped})`);
  check('every frame later than the one before', vGaps.every((g) => g > 0), `smallest gap ${fmt(Math.min(...vGaps))} ms`);
  check('frames fill the stream, none more than three frames apart', Math.max(...vGaps) <= 3 * 1000 / FPS, `largest gap ${fmt(Math.max(...vGaps))} ms`);
  const keyTimes = videoTags.filter((t) => t.d.key).map((t) => t.timestamp);
  const keyGaps = keyTimes.slice(1).map((t, i) => t - keyTimes[i]);
  // The page asks for a keyframe every two seconds; an encoder may add its
  // own (OpenH264 starts a new group when the picture changes a lot, as it
  // does each time the lab's plate is redrawn), which costs bits and harms
  // nothing. What a player joining needs is that one is never far away.
  check('a keyframe first, and never more than two and a half seconds to the next', keyTimes[0] === videoTags[0].timestamp && Math.max(...keyGaps) <= 2500 && keyTimes.length >= Math.floor(videoSpan / 2), `${keyTimes.length} keyframes in ${fmt(videoSpan)} s (${Math.floor(videoSpan / 2) + 1} asked for), gaps ${fmt(Math.min(...keyGaps), 0)}..${fmt(Math.max(...keyGaps), 0)} ms`);
  check('the client sent what the server got', (stopped?.transport?.videoFrames ?? -1) === s.video.frames && (stopped?.transport?.audioPackets ?? -1) === s.audio.packets && (stopped?.transport?.videoDropped ?? -1) === 0, `${stopped?.transport?.videoFrames} / ${s.video.frames} frames, ${stopped?.transport?.audioPackets} / ${s.audio.packets} packets`);

  // Decodable, and in sync.
  const vdesc = tags[firstVideo].d.payload;
  const adesc = tags[firstAudio].d.payload;
  const decoded = await page.evaluate(([v, a]) => window.liveLab.decode(v, a), [
    { description: vdesc.toString('base64'), frames: videoTags.map((t) => ({ ts: t.timestamp, key: t.d.key, data: t.d.payload.toString('base64') })) },
    { codec, description: adesc.toString('base64'), sampleRate: setup.sampleRate, channels: m.stereo ? 2 : 1, packets: audioTags.map((t) => ({ ts: t.timestamp, data: t.d.payload.toString('base64') })) },
  ]);
  check('Chromium decodes every frame', !decoded.videoError && decoded.frames.length === videoTags.length, decoded.videoError ?? `${decoded.frames.length} of ${videoTags.length}`);
  check('Chromium decodes every audio packet, to the seconds streamed', !decoded.audioError && Math.abs(decoded.audioSeconds - audioSpan) <= 0.25, decoded.audioError ?? `${fmt(decoded.audioSeconds, 2)} s decoded, ${fmt(audioSpan, 2)} s of packets`);

  const frames = decoded.frames.slice().sort((a, b) => a.ts - b.ts);
  const dark = median(frames.map((f) => f.mean));
  const levels = decoded.levels.slice().sort((a, b) => a.ts - b.ts);
  const quiet = median(levels.map((l) => l.rms));
  const bound = 1000 / FPS + 10;
  const sync = [];
  for (const ev of events) {
    const flashAt = frames.find((f) => f.ts >= ev.flashMs - bound && f.ts <= ev.flashMs + 400 && f.mean > dark + 0.5 * (255 - dark));
    const clickAt = levels.find((l) => l.ts >= ev.clickMs - bound && l.ts <= ev.clickMs + 400 && l.rms > quiet * 4 + 0.05);
    sync.push({ flash: flashAt?.ts ?? null, click: clickAt?.ts ?? null, delta: flashAt && clickAt ? flashAt.ts - clickAt.ts : null, drawn: ev.flashMs, sounded: ev.clickMs });
  }
  console.log(`  sync: ${sync.map((x) => x.delta === null ? `(flash ${x.flash === null ? 'missing' : fmt(x.flash, 0)}, click ${x.click === null ? 'missing' : fmt(x.click, 0)})` : `${x.delta >= 0 ? '+' : ''}${fmt(x.delta, 0)} ms`).join(', ')} (video minus audio; a flash is seen at the next frame taken, so up to +${fmt(1000 / FPS, 0)} is the frame clock, not a lag); drawn vs frame: ${sync.map((x) => x.flash === null ? '?' : fmt(x.flash - x.drawn, 0)).join(', ')} ms`);
  check(`${EVENTS} flashes and clicks all seen in what arrived`, sync.every((x) => x.delta !== null), `plate ${fmt(dark, 0)} of 255 between flashes, tone ${fmt(quiet, 3)} rms between clicks`);
  // The picture may read after the sound by up to a frame (the flash waits
  // for the next frame taken) and an audio block (the click is found to 5
  // ms, in 10 ms chunks); it may never read before it.
  check(`picture within a frame and an audio block after the sound (0..${fmt(bound, 0)} ms), every time`, sync.every((x) => x.delta !== null && x.delta >= -5 && x.delta <= bound), sync.map((x) => x.delta === null ? '?' : fmt(x.delta, 0)).join(', ') + ' ms');

  // Bookkeeping.
  check('the client answered the server\'s ping', (stopped?.transport?.pings ?? 0) >= 1 && s.pongs >= 1, `${stopped?.transport?.pings} answered, ${s.pongs} heard`);
  check('the client acknowledged the server\'s bytes when asked', (stopped?.transport?.acks ?? 0) >= 1 && s.acks === stopped?.transport?.acks, `${stopped?.transport?.acks} sent, ${s.acks} heard, window ${256} bytes`);

  // A bad key.
  const bad = new LiveClient({ url: listener.url, key: 'wrong-key', meta: {} });
  let badErr = null;
  try { await bad.connect(); } catch (e) { badErr = e.message; }
  check('a refused key fails with the server\'s words and without the key', badErr !== null && /BadName/.test(badErr) && !badErr.includes('wrong-key') && bad.state().phase === 'failed', badErr ?? 'connected');
} finally {
  for (const c of clients) c.close();
  await close();
  await listener.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

function median(xs) { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
