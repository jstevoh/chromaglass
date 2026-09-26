#!/usr/bin/env node
/**
 * Render this song, in the app itself: the whole path a person takes, on a
 * real GPU.
 *
 *   npm run render-app
 *
 * Needs a GPU that presents WebGPU and reads frames back (a Mac): the app on
 * software WebGPU reads back nothing, so in a cloud session this stops at
 * its first check and says why. CI runs it on the macOS show shard, after
 * the build (checks.yml, "A song rendered in the app"). `npm run render-lab`
 * is the version that runs anywhere, on the lab's plate.
 *
 * What `npm run render` and `npm run render-lab` cannot reach is the app's
 * own plate under the render: the visualizer's frame loop driven by frame
 * number instead of the browser, the solver's steps counted rather than
 * measured, readbacks awaited frame by frame, Evolve's intervals on the
 * film's clock, the song's readings handed to every part of the app that
 * hears, and the app put back afterwards. So this renders a synthetic song
 * (a kick on every beat, a tone, hats; built here, so the check owns it)
 * through `window.chromaglassRender` (App.tsx, `?debug` only), which is
 * `useSongRender` with the file kept in memory and every frame hashed, and
 * asks, every gate a comparison within the run:
 *
 *   1. the file is what was asked for: the strict reader
 *      (scripts/media-read.mjs) finds every frame at i/fps and a song, the
 *      file lasts the song to a frame, and an MP4's audio has an edit list
 *      that skips exactly the priming the render measured;
 *   2. the same seed twice draws the same frames, hash for hash; the bytes
 *      are compared and printed too, but not gated, because whether the
 *      Mac's H.264 encoder is byte-deterministic is the encoder's business
 *      (`npm run render-lab` gates the encoder where it can). Beside it,
 *      not gated, where two renders part: the first frame whose pixels
 *      differ and the first whose plate state differs (the visualizer's
 *      per-frame digest, `digest` in LiquidVisualizer.tsx), with the fields
 *      that differ, so a red run names its cause in the log;
 *   3. another seed draws another plate;
 *   4. the song is what drives it: the same seed with a silent song of the
 *      same length draws other frames;
 *   5. Evolve plays in a render (other frames than without it), and an
 *      Evolve render twice is still the same film;
 *   6. 60 fps renders twice the frames for the same song, at i/60;
 *   7. the app is given back as it was: the settings, the seed, the canvas's
 *      size, and the live loop drawing again; no fade or glide left running
 *      on the film's clock (one is started in the last half second of a
 *      render on purpose, a blackout, to be sure there is one to leave);
 *      the beat clock not holding the render's lock; and a song that was
 *      playing before the render playing again after it.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, isGpuEngine } from './frame.mjs';
import { readWebm, readMp4 } from './media-read.mjs';
import { createHash } from 'node:crypto';

const PORT = 4351;
const SEED = 7, OTHER_SEED = 8;
const W = 320, H = 180, FPS = 30, SONG_S = 8;
let passed = 0, failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

/**
 * A 16-bit stereo WAV, 48 kHz: a kick on every beat at 120 bpm (a 55 Hz
 * sine falling in pitch, a fast decay), a 660 Hz tone that swells over each
 * bar, and hats off the beat from a seeded noise. The tone sits well above
 * the bass bands so the kicks are what the bass hears (see `npm run render`
 * on why a pad under the kicks makes a beat check pass by accident).
 */
function wav(seconds, silent = false) {
  const rate = 48000, n = Math.round(seconds * rate);
  const data = Buffer.alloc(44 + n * 4);
  let s = 0x9e3779b9;
  const noise = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const beat = t % 0.5, off = (t + 0.25) % 0.5, bar = (t % 2) / 2;
    const kick = Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 9);
    const tone = 0.25 * Math.sin(2 * Math.PI * 660 * t) * (0.3 + 0.7 * bar);
    const hat = off < 0.03 ? 0.3 * noise() * (1 - off / 0.03) : 0;
    const v = silent ? 0 : Math.max(-1, Math.min(1, 0.8 * kick + tone + hat));
    const q = Math.round(v * 32767);
    data.writeInt16LE(q, 44 + i * 4);
    data.writeInt16LE(q, 46 + i * 4);
  }
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  return data.toString('base64');
}

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 300)); });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&seed=${SEED}${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(9000);

  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  check('the GPU solver is the one being measured', isGpuEngine(engine), engine ?? 'no debug hook');
  if (!isGpuEngine(engine)) {
    console.log('\nThis needs a GPU that reads the app\'s frames back (a Mac); see the header.');
    process.exit(1);
  }

  const song = wav(SONG_S), silence = wav(SONG_S, true);
  /**
   * One render, with the app's state read either side of it in the same task,
   * so nothing live (Evolve's six-second drift, above all) can land between
   * the reading and the render.
   */
  const render = (o) => page.evaluate(async ({ o, b64 }) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const canvas = document.getElementById('liquid-canvas');
    const audio = () => document.querySelector('audio');
    const state = () => ({
      settings: JSON.stringify(window.chromaglassCastState().settings), seed: window.__cgSeed, w: canvas?.width, h: canvas?.height,
      playing: !!audio() && !audio().paused, pending: window.chromaglassRenderPending(), beat: window.chromaglassDebug().beat,
    });
    if (o.evolve) window.chromaglassAction('automate-toggle');
    if (o.music) {
      // A track from the shelf, playing, so the render has a song to pause and give back.
      window.chromaglassMusic();
      for (let k = 0; k < 100 && !(audio() && !audio().paused); k++) await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 50));
    const before = state();
    const t0 = performance.now();
    const framesAtStart = window.chromaglassDebug().frames;
    const job = window.chromaglassRender({ song: bytes.buffer, width: o.w, height: o.h, fps: o.fps, seed: o.seed, maxFrames: o.maxFrames });
    if (o.blackoutNearEnd) {
      // A dimmer fade begun in the render's last half second (it lasts 1.1 s,
      // 33 frames at 30 fps), so it is still running on the film's clock when
      // the render hands back: the case where it used to carry over.
      const at = framesAtStart + o.frames - 15;
      while (window.chromaglassDebug().frames < at) await new Promise(r => setTimeout(r, 5));
      window.chromaglassAction('blackout-toggle');
    }
    if (o.loseAt) {
      // The GPU taken away a second into the render, as a driver would.
      const at = framesAtStart + o.loseAt;
      while (window.chromaglassDebug().frames < at) await new Promise(r => setTimeout(r, 5));
      window.chromaglassDebug().loseDevice();
    }
    const r = await job;
    const ms = performance.now() - t0;
    const after = state();
    if (o.evolve) window.chromaglassAction('automate-toggle');
    // The live loop draws again: the frame counter moves in the next half second.
    const f0 = window.chromaglassDebug().frames ?? null;
    // A lost device first has to come back (a new device, a new stage) before it can draw.
    if (o.loseAt) await new Promise(res => setTimeout(res, 4000));
    await new Promise(res => setTimeout(res, 500));
    const f1 = window.chromaglassDebug().frames ?? null;
    return { ...r, ms, before, after, liveFrames: f0 === null || f1 === null ? null : f1 - f0 };
  }, { o, b64: o.silent ? silence : song });

  const runs = {};
  const say = (name, r) => console.log(`   ${name}: ${r.phase}; ${r.format}; ${r.summary ? `${r.summary.videoFrames} frames, ${r.summary.audioPackets} audio packets, ${r.summary.durationMs.toFixed(1)} ms, ${r.summary.bytes} bytes${r.summary.priming ? `, audio priming ${r.summary.priming.samples} samples (${r.summary.priming.source}${r.summary.priming.measured !== null && r.summary.priming.measured !== undefined ? `, measured ${r.summary.priming.measured}` : ''}), ${r.summary.priming.dropped} packets past the song dropped` : ''}` : r.message}; ${(r.ms / 1000).toFixed(1)} s`);
  for (const [name, o] of [
    ['A: seed 7', { seed: SEED, w: W, h: H, fps: FPS }],
    ['B: seed 7 again', { seed: SEED, w: W, h: H, fps: FPS }],
    ['C: seed 8', { seed: OTHER_SEED, w: W, h: H, fps: FPS }],
    ['S: seed 7, silence', { seed: SEED, w: W, h: H, fps: FPS, silent: true }],
    ['E1: seed 7, Evolve', { seed: SEED, w: W, h: H, fps: FPS, evolve: true }],
    ['E2: seed 7, Evolve again', { seed: SEED, w: W, h: H, fps: FPS, evolve: true }],
    ['F: seed 7 at 60 fps', { seed: SEED, w: W, h: H, fps: 60 }],
    // Last, because a playing track and a blackout change the live show between renders.
    ['L: seed 7, the GPU lost a second in', { seed: SEED, w: W, h: H, fps: FPS, loseAt: FPS }],
    ['R: seed 7 again, after the loss, two seconds', { seed: SEED, w: W, h: H, fps: FPS, maxFrames: 2 * FPS }],
    ['M: seed 7, music playing, blackout near the end', { seed: SEED, w: W, h: H, fps: FPS, music: true, blackoutNearEnd: true, frames: SONG_S * FPS }],
  ]) {
    runs[name[0] + (name[1] === '1' || name[1] === '2' ? name[1] : '')] = await render(o).then((r) => { say(name, r); return r; });
  }
  const { A, B, C, S, E1, E2, F, L, R, M } = runs;
  const frames = SONG_S * FPS;

  // 1. The file.
  check('every render finished (but L, whose GPU was taken away)', Object.entries(runs).every(([n, r]) => n === 'L' || r.phase === 'done'), Object.entries(runs).map(([n, r]) => `${n} ${r.phase}`).join(', '));
  check('a GPU lost mid-render fails the render and says why', L.phase === 'failed' && /GPU was lost|plate was rebuilt/.test(L.message), `${L.phase}: ${L.message}`);
  check('after the loss, the next render runs to the end', R.phase === 'done' && R.summary?.videoFrames === 2 * FPS, `${R.phase}, ${R.summary?.videoFrames ?? 0} frames`);
  // Printed, not gated: a rebuilt stage may sit on another rung of the
  // quality ladder, and a render on another grid is another film.
  console.log(`   after the loss, ${(R.frameHashes ?? []).filter((h, i) => h !== A.frameHashes?.[i]).length} of ${2 * FPS} frames differ from A's first ${2 * FPS}`);
  const bytesA = A.bytes ? Buffer.from(A.bytes, 'base64') : Buffer.alloc(0);
  const reader = /MP4/.test(A.format ?? '') ? readMp4 : readWebm;
  let parsed = null, err = null;
  try { parsed = reader(new Uint8Array(bytesA)); } catch (e) { err = e.message; }
  check('the strict reader accepts the file', !!parsed, err ?? `${A.format}, ${bytesA.length} bytes`);
  if (parsed) {
    const [v, au] = parsed.tracks;
    const res = parsed.kind === 'webm' ? 1000 : 1e6 / 90000;
    const off = v.samples.map((s, i) => Math.abs(s.timeUs - Math.round((i * 1e6) / FPS)));
    check(`${frames} frames, each at i/${FPS} s`, v.samples.length === frames && off.every((d) => d <= res / 2 + 1e-6), `${v.samples.length} frames, worst ${Math.max(0, ...off).toFixed(1)} µs off`);
    check('an audio track with the song in it', !!au && au.samples.length > 0, au ? `${au.samples.length} packets` : 'none');
    check('the file lasts the song', Math.abs(parsed.durationMs - SONG_S * 1000) <= 1000 / FPS, `${parsed.durationMs.toFixed(1)} ms of ${SONG_S * 1000}`);
    /*
      Where the song starts in the audio. An MP4's audio carries the
      encoder's priming in its first packets, and the edit list is what
      tells a player to skip it: without one the sound plays some 44 ms late
      against the picture (2112 samples of Apple's AAC), and the track runs
      past the song. So: an edit, skipping exactly what the render says the
      encoder primed with (more than nothing: every AAC encoder primes), for
      the song's length. WebM says the same with its Opus CodecDelay, which
      the WebM writer takes from the OpusHead's pre-skip (lib/muxWebm.ts).
    */
    if (parsed.kind === 'mp4') {
      const p = A.summary?.priming;
      check('the audio skips the encoder\'s priming (an MP4 edit list)', !!au?.edit && !!p && p.samples > 0 && au.edit.mediaTime === p.samples && Math.abs(au.presentationMs - SONG_S * 1000) <= 1,
        au?.edit ? `edit from ${au.edit.mediaTime} samples for ${au.presentationMs.toFixed(1)} ms; render says ${p ? `${p.samples} (${p.source})` : 'nothing'}` : 'no edit list');
      /*
        And the measurement itself, where the film is AAC: the render
        measures its encoder's priming (`measurePriming` in lib/render.ts)
        rather than assume it, and on the Mac, whose encoder is Apple's, it
        has to find Apple's 2112 (TN2258), by measuring: 'assumed' would mean
        the measurement no longer answers there, and 'rejected' that it
        answered wrong, and either would leave the edit list resting on an
        assumption this check exists to stop resting on. (The Mac run that
        added it printed "audio priming 2112 samples (measured)".)
      */
      if (/AAC/.test(A.format ?? '')) {
        check('the AAC encoder\'s priming is measured, and is Apple\'s 2112', !!p && p.source === 'measured' && p.samples === 2112,
          p ? `${p.samples} samples (${p.source}), measured ${p.measured}` : 'no priming reported');
      }
    }
  }

  // 2 to 5. Frames against frames.
  const differ = (x, y) => (x.frameHashes ?? []).filter((h, i) => h !== y.frameHashes?.[i]).length;
  /*
    Where two renders that should be one film part, printed beside the gates
    that compare them (not a gate itself: the gates above and below are what
    pass or fail).

    This can only run on a real GPU, so when it goes red on CI the log is all
    there is to go on, and "240 of 240 frames differ" says the films are
    different and nothing about why. So two things are printed: the first
    frame whose pixels differ, and the first frame on which anything the
    plate drew it *from* differs (the render's per-frame digest, taken as
    each frame is handed to the renderer; see `FrameDigest` in
    LiquidVisualizer.tsx), with every field that differs there. The digest's
    fields run from the inputs (the clock, the canvas, the grid, the
    settings, the sound) to the outputs (the readback), so the first named
    is usually the cause and the rest its consequences. A state that parts
    before the pixels do is something carried in from before the render; a
    state that never parts while the pixels do is the GPU's own (or a pass
    the digest does not see), which is where to look next.
  */
  const parting = (x, y) => {
    const hx = x.frameHashes ?? [], hy = y.frameHashes ?? [];
    let pixels = -1;
    for (let i = 0; i < Math.min(hx.length, hy.length); i++) if (hx[i] !== hy[i]) { pixels = i; break; }
    const dx = x.frameDigests ?? [], dy = y.frameDigests ?? [];
    let state = null;
    for (let i = 0; i < Math.min(dx.length, dy.length) && !state; i++) {
      const fields = [...new Set([...Object.keys(dx[i] ?? {}), ...Object.keys(dy[i] ?? {})])].filter((k) => dx[i]?.[k] !== dy[i]?.[k]);
      if (fields.length) state = { frame: i, fields: fields.map((k) => `${k} ${JSON.stringify(dx[i]?.[k])} / ${JSON.stringify(dy[i]?.[k])}`) };
    }
    const px = pixels < 0 ? `no frame's pixels differ (of ${Math.min(hx.length, hy.length)})` : `the pixels first differ at frame ${pixels}`;
    const st = !dx.length || !dy.length ? 'no digests came back'
      : state ? `what the plate drew from first differs at frame ${state.frame}: ${state.fields.slice(0, 10).join('; ')}${state.fields.length > 10 ? `; and ${state.fields.length - 10} more` : ''}`
        : `what the plate drew from is the same on all ${Math.min(dx.length, dy.length)} frames`;
    return `${px}; ${st}`;
  };
  console.log(`   A against B (seed 7 twice): ${parting(A, B)}`);
  console.log(`   E1 against E2 (Evolve twice): ${parting(E1, E2)}`);
  check('the plate moves: the frames are not one picture', new Set(A.frameHashes ?? []).size > frames * 0.9, `${new Set(A.frameHashes ?? []).size} distinct of ${frames}`);
  check('the same seed twice draws the same frames', (A.frameHashes?.length ?? 0) === frames && differ(A, B) === 0, `${differ(A, B)} of ${frames} frames differ`);
  const bytesB = B.bytes ? Buffer.from(B.bytes, 'base64') : Buffer.alloc(0);
  console.log(`   the same seed twice: ${bytesA.equals(bytesB) ? 'byte-identical files' : 'the files differ (the encoder, not the plate: the frames that went in are compared above)'} (${sha(bytesA)} / ${sha(bytesB)})`);
  check('another seed draws another plate', differ(A, C) > frames / 2, `${differ(A, C)} of ${frames} frames differ`);
  check('the song drives it: silence draws other frames', differ(A, S) > frames / 2, `${differ(A, S)} of ${frames} frames differ`);
  check('Evolve plays in a render', differ(A, E1) > frames / 4, `${differ(A, E1)} of ${frames} frames differ from the render without it`);
  check('an Evolve render twice is the same film', (E1.frameHashes?.length ?? 0) === frames && differ(E1, E2) === 0, `${differ(E1, E2)} of ${frames} frames differ`);

  // 6. 60 fps.
  check('60 fps renders twice the frames for the same song', F.summary?.videoFrames === SONG_S * 60, `${F.summary?.videoFrames} frames`);

  // 7. The app given back.
  for (const [name, r] of Object.entries(runs)) {
    // M's settings are left out of this one: starting a track can roll a new
    // look live (On new song), between the reading and the render's own
    // snapshot, which is the show doing its job and not the render failing to
    // give anything back. Its seed and canvas are held to it all the same.
    const sameSettings = name === 'M' || r.before.settings === r.after.settings;
    const same = sameSettings && r.before.seed === r.after.seed && r.before.w === r.after.w && r.before.h === r.after.h;
    if (!same || name === 'A' || name === 'E1' || name === 'M') {
      check(`after ${name}, the app is as it was: settings, seed ${r.after.seed}, canvas ${r.after.w}x${r.after.h}`, same,
        same ? '' : `settings ${sameSettings ? 'same' : 'CHANGED'}, seed ${r.before.seed}→${r.after.seed}, canvas ${r.before.w}x${r.before.h}→${r.after.w}x${r.after.h}`);
    }
  }
  // After every render, including one that failed halfway (a GPU lost mid-render
  // used to leave the live show with no frame loop at all).
  const stalled = Object.entries(runs).filter(([, r]) => !((r.liveFrames ?? 0) > 5));
  check('the live loop draws again after every render', stalled.length === 0,
    stalled.length ? stalled.map(([n, r]) => `${n}: ${r.liveFrames ?? 'no counter'}`).join('; ') : Object.entries(runs).map(([n, r]) => `${n} ${r.liveFrames}`).join(', ') + ' frames in half a second');
  /*
    What a render used to leave running in the live show: a fade stamped on
    the film's clock, which a young page read as not yet begun and ran over
    the settings just put back; and the beat clock's lock, stamped in film
    milliseconds, held in the future. Read in the same task the render
    resolved in.
  */
  const pendingAfter = Object.entries(runs).filter(([, r]) => r.after.pending.lookFade || r.after.pending.dimmerFade || r.after.pending.glides > 0);
  check('no fade or glide is left running after any render', pendingAfter.length === 0,
    pendingAfter.map(([n, r]) => `${n}: ${JSON.stringify(r.after.pending)}`).join('; '));
  const lockedAfter = Object.entries(runs).filter(([, r]) => r.after.beat.period > 0 && r.after.beat.confidence >= 0.5);
  check('the beat clock is not locked on the render\'s beat right after', lockedAfter.length === 0,
    lockedAfter.map(([n, r]) => `${n}: period ${r.after.beat.period} ms, confidence ${r.after.beat.confidence}`).join('; '));
  check('the music was playing before render M (so the next gate means something)', M.before.playing);
  check('the music plays on after a render that paused it', M.before.playing && M.after.playing, `playing before ${M.before.playing}, after ${M.after.playing}`);
} finally {
  await browser.close();
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
