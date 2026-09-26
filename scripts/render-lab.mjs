#!/usr/bin/env node
/**
 * A song render, end to end, on the lab's plate.
 *
 *   npm run render-lab          (PW_WEBGPU=1 on a machine with no GPU)
 *
 * The app cannot be rendered in a cloud session: on software WebGPU it reads
 * back no frames at all. The lab can (scripts/lab.mjs): the real solver and
 * the real plate shader on a plate laid from a seed. So this lays a plate
 * from seed 5, steps it, draws each frame through the plate shader, and hands
 * the frames to the real render path (src/lib/render.ts): WebCodecs'
 * VideoEncoder and AudioEncoder, a seeded stereo song for the sound, and the
 * muxers written for it. Then it asks three independent judges about the
 * file:
 *
 *   1. the strict reader (scripts/media-read.mjs): every frame is there, at
 *      i/fps, with its keyframes, and there is an audio track;
 *   2. Chromium's own `<video>`: it opens the file, says it lasts what was
 *      rendered, and plays it to the end, decoding every frame;
 *   3. a second render of the same seed: the same bytes. If the encoder
 *      turns out not to be byte-deterministic for identical input, that is
 *      printed as it is, and the gate falls back to what the film *is*: the
 *      frames that went in are the same, and the frames that come out of a
 *      decoder are the same.
 *
 * And that the seed is what decides it: seed 6 gives different frames.
 *
 * Both containers are rendered: WebM, which is what this Chromium would
 * choose, and MP4 with the same VP9 and Opus in it, which no one would choose
 * but which puts the MP4 writer in front of a real demuxer here, where the
 * H.264 it is for cannot be encoded. Where the browser can encode H.264 and
 * AAC (Chrome on the Mac runner), the MP4 a Mac actually writes is rendered
 * and judged the same way as a third kind. What this machine can and cannot
 * encode is printed first.
 *
 * Every gate is a comparison within the run (this file against what was
 * rendered, one render against another); nothing pins a picture.
 */
import { openLab } from './lab.mjs';
import { readWebm, readMp4 } from './media-read.mjs';
import { createHash } from 'node:crypto';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

const FPS = 30, FRAMES = 60, SIZE = 192, GRID = 128;

const { page, close } = await openLab({ entry: 'scripts/render-lab-entry.ts' });
try {
  const support = await page.evaluate(() => window.renderLab.support());
  console.log(`WebCodecs ${support.webcodecs ? 'present' : 'absent'}; streaming to disk ${support.streamsToDisk ? 'possible' : 'not possible'} (File System Access)`);
  for (const [w, h, fps] of [[1920, 1080, 60], [SIZE, SIZE, FPS]]) {
    const f = await page.evaluate(([w, h, fps]) => window.renderLab.formats(w, h, fps), [w, h, fps]);
    console.log(`  ${w}x${h} at ${fps}: a render would be ${f.picked ?? 'impossible'}; ${Object.entries(f.each).map(([k, v]) => `${k} ${v ? 'yes' : 'no'}`).join(', ')}`);
  }
  check('this browser can render a song at all', support.webcodecs);

  /*
    H.264 and AAC in MP4, the format a Mac will actually write, where this
    browser can encode them (Chrome on a Mac can; the open-source Chromium
    in a cloud session cannot, and says so above). Asked, never assumed.
  */
  /*
    An audio encoder's priming, measured. Chrome's encoders hide it (the
    first packet is stamped 0, the priming inside it), and for AAC nothing
    states it, so a render measures it (`measurePriming` in lib/render.ts)
    to know where the song starts, and the MP4's edit list skips that much.
    The measurement is proved here on the one priming that is stated: Opus's
    pre-skip, in its OpusHead. Decoded without the head, the burst has to
    come out exactly that late.
  */
  const pr = await page.evaluate(() => window.renderLab.priming());
  console.log(`\nPriming: the OpusHead says ${pr.stated}; measured ${pr.measured} decoded without it, ${pr.withHead ?? 'nothing (the decoder skipped it)'} with it; AAC ${pr.aac === 'unsupported' ? 'not encodable here' : `measured ${pr.aac}`}`);
  check('the measured priming is the one Opus states', pr.stated > 0 && pr.measured === pr.stated, `${pr.measured} measured, ${pr.stated} stated`);

  const small = await page.evaluate(([w, h, fps]) => window.renderLab.formats(w, h, fps), [SIZE, SIZE, FPS]);
  const avcHere = Object.entries(small.each).some(([k, v]) => k.startsWith('avc1') && v) && Object.entries(small.each).some(([k, v]) => k.startsWith('mp4a') && v);
  const kinds = [['webm', readWebm, 'video/webm'], ['mp4-vp9', readMp4, 'video/mp4'], ...(avcHere ? [['mp4-avc', readMp4, 'video/mp4']] : [])];
  if (!avcHere) console.log('\nH.264 + AAC in MP4: not rendered here, because this browser cannot encode them (the MP4 writer is still exercised with VP9 + Opus)');

  for (const [kind, reader, mime] of kinds) {
    console.log(`\n${kind === 'webm' ? 'WebM (VP9 + Opus)' : kind === 'mp4-vp9' ? 'MP4 (VP9 + Opus)' : 'MP4 (H.264 + AAC)'}, ${FRAMES} frames of the lab plate at ${FPS} fps, ${SIZE}x${SIZE}`);
    const run = (seed) => page.evaluate((o) => window.renderLab.run(o), { seed, frames: FRAMES, fps: FPS, size: SIZE, grid: GRID, kind });
    const t0 = Date.now();
    const a = await run(5);
    const ms = Date.now() - t0;
    const b = await run(5);
    const c = await run(6);
    const bytesA = Buffer.from(a.bytes, 'base64'), bytesB = Buffer.from(b.bytes, 'base64');
    console.log(`   ${bytesA.length} bytes, rendered in ${(ms / 1000).toFixed(1)} s; encoder summary ${JSON.stringify(a.summary)}; audio description ${a.audioDescription ? `${a.audioDescription.length} bytes from the encoder` : 'none from the encoder (the muxer wrote one)'}`);

    // 1. The strict reader.
    let parsed = null, err = null;
    try { parsed = reader(new Uint8Array(bytesA)); } catch (e) { err = e.message; }
    check('the strict reader accepts the file', !!parsed, err ?? (parsed.boxes ?? `${parsed.clusters} clusters, ${parsed.cuePoints} cues`));
    if (parsed) {
      const [v, au] = parsed.tracks;
      const want = Array.from({ length: FRAMES }, (_, i) => Math.round((i * 1e6) / FPS));
      // WebM keeps milliseconds; MP4 keeps 90 kHz ticks. Within half a tick of i/fps.
      const res = kind === 'webm' ? 1000 : 1e6 / 90000;
      const off = v.samples.map((s, i) => Math.abs(s.timeUs - want[i]));
      check(`${FRAMES} frames, each at i/${FPS} s`, v.samples.length === FRAMES && off.every((d) => d <= res / 2 + 1e-6),
        `${v.samples.length} frames, worst ${Math.max(...off).toFixed(1)} µs from i/fps`);
      const keys = v.samples.map((s, i) => (s.key ? i : -1)).filter((i) => i >= 0);
      check('a keyframe every second, starting on the first frame', keys[0] === 0 && keys.every((k) => k % FPS === 0) && keys.length === FRAMES / FPS, `keyframes at ${keys.join(', ')}`);
      check('an audio track with the song in it', !!au && au.samples.length > 0, au ? `${au.samples.length} packets, last at ${(au.samples[au.samples.length - 1].timeUs / 1e6).toFixed(3)} s` : 'none');
      check('the file says it lasts what was rendered', Math.abs(parsed.durationMs - (FRAMES / FPS) * 1000) <= 1000 / FPS,
        `${parsed.durationMs.toFixed(1)} ms, rendered ${(FRAMES / FPS) * 1000} ms`);
    }

    // 2. Chromium's <video>.
    const played = await page.evaluate(([b64, m]) => window.renderLab.play(b64, m), [a.bytes, mime]);
    console.log(`   <video>: canPlayType "${played.canPlay}", ${played.error ? `error: ${played.error}` : `${played.width}x${played.height}, duration ${played.duration} s, ${played.frames} frames decoded, ${played.dropped} dropped, ${played.presented} presented, ${played.events.join(' ')}`}`);
    check('Chromium opens it', !played.error && played.width === SIZE && played.height === SIZE, played.error ?? `${played.width}x${played.height}`);
    check('Chromium says it lasts what was rendered', Math.abs(played.duration - FRAMES / FPS) <= 1 / FPS + 0.03,
      `${played.duration} s, rendered ${(FRAMES / FPS).toFixed(3)} s (the audio track may run a packet past the last frame)`);
    check('Chromium plays it to the end and decodes every frame', played.ended && played.frames === FRAMES, `ended ${played.ended}, ${played.frames} of ${FRAMES} frames`);

    // 3. Twice.
    const sameIn = JSON.stringify(a.frameHashes) === JSON.stringify(b.frameHashes);
    check('the same seed draws the same frames', sameIn && a.frameHashes.length === FRAMES, `${a.frameHashes.length} frames, ${new Set(a.frameHashes).size} distinct`);
    const sameBytes = bytesA.equals(bytesB);
    console.log(`   the same seed twice: ${sameBytes ? 'byte-identical files' : 'the files DIFFER'} (${sha(bytesA)} / ${sha(bytesB)})`);
    if (sameBytes) {
      check('the same seed rendered twice is the same file, byte for byte', true, sha(bytesA));
    } else {
      // Recorded as it is, then gated on the film itself: what a decoder makes of each.
      const kindName = kind === 'webm' ? 'webm' : 'mp4';
      const da = await page.evaluate(([x, k]) => window.renderLab.decodeHashes(x, k), [a.bytes, kindName]);
      const db = await page.evaluate(([x, k]) => window.renderLab.decodeHashes(x, k), [b.bytes, kindName]);
      console.log('   NOTE: the encoder is not byte-deterministic here for identical input; gating on decoded frames instead');
      check('the same seed rendered twice decodes to the same frames', da.length === FRAMES && JSON.stringify(da) === JSON.stringify(db), `${da.length} and ${db.length} frames decoded`);
    }
    const differ = c.frameHashes.filter((h, i) => h !== a.frameHashes[i]).length;
    check('another seed draws another plate', differ > FRAMES / 2 && !Buffer.from(c.bytes, 'base64').equals(bytesA), `${differ} of ${FRAMES} frames differ from seed 5's`);
  }
} finally {
  await close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
