#!/usr/bin/env node
/**
 * The parts of a song render that are arithmetic: the clock, the ear and the
 * file.
 *
 *   npm run render
 *
 * PLAN.md §6's gate is "the same song rendered twice is byte-identical". A
 * render is three things wrapped around the plate, and each has to be exact
 * on its own before the whole can be:
 *
 *   1. The show clock (src/lib/showClock.ts). Rendering, the clock is the
 *      frame number and nothing else: two renders read the same times on the
 *      same frames, and the show's intervals fire on the same frames in the
 *      same order, whatever order they were made in. Live, it is the
 *      browser's clock, number for number, and its intervals are the
 *      browser's intervals: what the show did before a render existed, it
 *      still does.
 *
 *   2. The song, heard in advance (src/lib/songTrack.ts). One reading per
 *      frame from the file: the same song twice is the same bytes; the named
 *      readings are exactly `analysePcm`'s; and a render at 30 fps and one at
 *      60 hear the kicks at the same moments. That last one is checked on
 *      the thing the plate reacts to, not only on the analyser: the beat
 *      clock (src/lib/beatClock.ts) is run over both tracks exactly as the
 *      visualizer runs it, bass over 70, and its kicks have to land together.
 *
 *   3. The file (src/lib/muxWebm.ts, src/lib/muxMp4.ts). Synthetic encoded
 *      frames and packets, with known sizes, times and keyframes, through
 *      each writer and back through a strict reader written separately from
 *      the specifications (scripts/media-read.mjs): every sample comes back,
 *      byte for byte, at its time, with its duration, and the file's
 *      duration is what was asked for. Twice, the same bytes.
 *
 * What is *not* here, because it needs a browser: the real encoders and a
 * player's opinion of the file (`npm run render-lab`), and the plate itself
 * (`npm run render-app`, the app itself, on a real GPU).
 *
 * Nothing here pins a level, a dye total or a frame's content: every gate is
 * a comparison within the run (the same input twice, 30 against 60, what
 * went in against what came out), so it holds whatever the solver or the
 * analyser's tuning becomes.
 */
import { createHash } from 'node:crypto';
import {
  RENDER_ORIGIN_MS, beginFixedClock, clearShowInterval, clockIsFixed, endFixedClock, showEpochS, showInterval,
  showIntervalCount, showNow, tickFixedClock,
} from '../src/lib/showClock.ts';
import { songAudioTrack, DEFAULT_LEVEL_PARAMS } from '../src/lib/songTrack.ts';
import { analysePcm, AnalyserEmulator } from '../src/lib/audioFeatures.ts';
import { AutoRange, RoomTracker } from '../src/lib/audioCalibration.ts';
import { SoundLevels, bytesFromDb, smoothLevels, waveBytes } from '../src/lib/soundLevels.ts';
import { BeatClock } from '../src/lib/beatClock.ts';
import { makeRng } from '../src/lib/rng.ts';
import { MemorySink } from '../src/lib/muxShared.ts';
import { WebmMuxer } from '../src/lib/muxWebm.ts';
import { Mp4Muxer } from '../src/lib/muxMp4.ts';
import { readWebm, readMp4 } from './media-read.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const sha = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. The show clock ─────────────────────────────────────────────────────
console.log('\nThe show clock');
{
  // Live: the browser's own numbers. Read the clock and the browser back to
  // back; they can differ only by the time between the two reads.
  const a = performance.now(), s = showNow(), b = performance.now();
  check('live, showNow() is performance.now()', !clockIsFixed() && s >= a && s <= b, `${a.toFixed(3)} ≤ ${s.toFixed(3)} ≤ ${b.toFixed(3)}`);
  const da = Date.now() * 0.001, e = showEpochS(), db = Date.now() * 0.001;
  check('live, showEpochS() is Date.now() / 1000', e >= da && e <= db, `${da} ≤ ${e} ≤ ${db}`);

  // Live intervals are real ones: this one has to fire on its own, with no tick.
  let liveFires = 0;
  const h = showInterval(() => { liveFires++; }, 20, 'live');
  await sleep(130);
  clearShowInterval(h);
  const after = liveFires;
  await sleep(60);
  check('live, a show interval fires on the browser\'s timer, and stops when cleared', after >= 3 && liveFires === after,
    `${after} fires in 130 ms at 20 ms, ${liveFires - after} after clearing`);

  // Rendering: the same frames give the same times, and the intervals fire on
  // the same frames in the same order however they were made.
  const run = (fps, frames, makeOrder) => {
    const log = [];
    const handles = [];
    const make = {
      drift: () => handles.push(showInterval(() => log.push(`drift@${showNow()}`), 6000, 'drift')),
      glide: () => handles.push(showInterval(() => log.push(`glide@${showNow()}`), 400, 'drift-glide')),
      seq: () => handles.push(showInterval(() => log.push(`seq@${showNow()}`), 250, 'sequencer')),
      song: () => handles.push(showInterval(() => log.push(`song@${showNow()}`), 100, 'song-show')),
    };
    beginFixedClock(fps);
    for (const k of makeOrder) make[k]();
    const times = [showNow()];
    for (let i = 0; i < frames; i++) { tickFixedClock(); times.push(showNow(), showEpochS()); }
    endFixedClock();
    handles.forEach(clearShowInterval);
    return { log, times };
  };
  const r1 = run(60, 60 * 13, ['drift', 'glide', 'seq', 'song']);
  const r2 = run(60, 60 * 13, ['song', 'seq', 'glide', 'drift']);
  check('rendering, the same frames read the same times', sha(JSON.stringify(r1.times)) === sha(JSON.stringify(r2.times)),
    `frame 0 at ${r1.times[0]} ms (the origin, ${RENDER_ORIGIN_MS}), frame 780 at ${r1.times[r1.times.length - 2]} ms`);
  check('rendering, intervals fire on the same frames in the same order whatever order they were made in',
    sha(r1.log.join()) === sha(r2.log.join()), `${r1.log.length} fires, hash ${sha(r1.log.join())}`);
  const drifts = r1.log.filter((l) => l.startsWith('drift')).map((l) => Number(l.split('@')[1]) - RENDER_ORIGIN_MS);
  check('rendering, a 6 s interval fires at 6 s and 12 s of the render\'s own time', drifts.length === 2 && Math.abs(drifts[0] - 6000) < 17 && Math.abs(drifts[1] - 12000) < 17,
    drifts.map((d) => `${d.toFixed(1)} ms`).join(', '));
  const at30 = run(30, 30 * 13, ['drift', 'glide', 'seq', 'song']).log.filter((l) => l.startsWith('drift')).length;
  check('rendering at 30 fps, the same 6 s interval fires the same number of times in 13 s', at30 === drifts.length, `${at30} at 30 fps, ${drifts.length} at 60`);

  // Handed back: live again, and an interval made before the render has its real timer back.
  let back = 0;
  const hb = showInterval(() => { back++; }, 20, 'back');
  beginFixedClock(60);
  await sleep(80);
  const duringRender = back;
  tickFixedClock(); tickFixedClock();
  const ticked = back;
  endFixedClock();
  await sleep(110);
  clearShowInterval(hb);
  const a2 = performance.now(), s2 = showNow(), b2 = performance.now();
  check('while rendering, a show interval ignores the real clock and follows the ticks', duringRender === 0 && ticked === 1,
    `${duringRender} fires in 80 ms of real time, ${ticked} in two ticks of 16.7 ms at a 20 ms period`);
  check('after the render, the clock is the browser\'s again and the interval is real again',
    !clockIsFixed() && s2 >= a2 && s2 <= b2 && back - ticked >= 3, `${back - ticked} real fires in 110 ms; ${showIntervalCount()} intervals left`);
}

// ── 2. The song, heard in advance ─────────────────────────────────────────
console.log('\nThe song, heard in advance');
/*
  A synthetic song whose kicks are known to the sample: a 50 Hz kick with a
  fast pitch drop at 120 bpm, humanised by up to ±8 ms, with a hat on the
  off-beats and a quiet swelling tone at 660 Hz, over a -96 dBFS floor (no
  recording is digitally silent, and the analyser treats true silence
  specially). Seeded, so it is the same song every run.

  The tone sits above the hook's bass band (up to 250 Hz) on purpose. The
  first version had it at 220 Hz, inside the band, where it held the bass
  level up between kicks: the level never fell back under the beat clock's
  threshold, so there was no crossing to hear, and the clock found 1 kick of
  22 at either rate. The two rates agreed perfectly about that one kick,
  which is a check passing on nothing. So the gate below also asks that the
  kicks are actually found.
*/
const SR = 48000, SECONDS = 12;
function song() {
  const rng = makeRng(7, 'render.song');
  const pcm = new Float32Array(SR * SECONDS);
  const kicks = [];
  for (let i = 0; i < pcm.length; i++) {
    const t = i / SR;
    pcm[i] = rng.signed() * 1.6e-5 + 0.02 * Math.sin(2 * Math.PI * 660 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  for (let beat = 0.5; beat < SECONDS - 0.5; beat += 0.5) {
    const at = beat + rng.centred() * 0.016;
    kicks.push(at);
    const vel = 0.6 + 0.4 * rng.float();
    for (let k = 0; k < SR * 0.25; k++) {
      const i = Math.round(at * SR) + k;
      if (i >= pcm.length) break;
      const t = k / SR;
      const f = 50 + 70 * Math.exp(-t / 0.02);
      pcm[i] += vel * 0.8 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.12);
    }
    const hat = beat + 0.25;
    for (let k = 0; k < SR * 0.03; k++) {
      const i = Math.round(hat * SR) + k;
      if (i >= pcm.length) break;
      pcm[i] += 0.08 * rng.signed() * Math.exp(-k / SR / 0.012);
    }
  }
  return { pcm, kicks };
}
{
  const { pcm, kicks } = song();
  const hashTrack = (track) => {
    const h = createHash('sha256');
    for (const f of track) {
      h.update(f.frequencyData); h.update(f.timeDomainData);
      h.update(new Float64Array([f.volume, f.bass, f.mid, f.treble, f.energy, f.spectralCentroid, f.timbre, f.complexity]));
      h.update(JSON.stringify(f.features)); h.update(JSON.stringify(f.calibration));
    }
    return h.digest('hex').slice(0, 16);
  };
  const t60a = songAudioTrack(pcm, SR, 60), t60b = songAudioTrack(pcm, SR, 60);
  const t30 = songAudioTrack(pcm, SR, 30);
  check('the same song twice is the same track, byte for byte', hashTrack(t60a) === hashTrack(t60b), `${t60a.length} frames, ${hashTrack(t60a)}`);
  check('a frame for every 1/fps of the song', t60a.length === Math.ceil(SECONDS * 60) && t30.length === Math.ceil(SECONDS * 30), `${t60a.length} at 60, ${t30.length} at 30`);
  const direct = analysePcm(pcm, SR, 60);
  check('its named readings are exactly analysePcm\'s', JSON.stringify(direct) === JSON.stringify(t60a.map((f) => f.features)), `${direct.length} readings compared`);
  const finite = t60a.every((f) => [f.volume, f.bass, f.mid, f.treble, f.energy, f.timbre, f.complexity].every(Number.isFinite));
  check('every legacy field is a number on every frame', finite);

  // When the kicks land: the analyser's own kick onsets, and the beat clock's
  // verdict (what the plate's reactions all read), at 30 and at 60.
  const onsets = (track, name) => {
    const out = [];
    for (const f of track) if (f.features.onsets[name].hit) out.push(f.features.time);
    return out;
  };
  const beatKicks = (track, fps) => {
    const clock = new BeatClock();
    const out = [];
    track.forEach((f, i) => {
      // As the visualizer: the render's clock, bass over 70, trust 0 (the
      // onset as heard: what a render with Beat Prediction at 0 plays).
      const now = RENDER_ORIGIN_MS + (i * 1000) / fps;
      if (clock.update(now, Math.min(1, f.bass / 70), 0, 0).kick) out.push(i / fps);
    });
    return out;
  };
  const pair = (a, b, tol) => {
    // Each of `a` matched to the nearest unused of `b` within `tol`.
    const used = new Set();
    let matched = 0, worst = 0;
    for (const t of a) {
      let best = -1;
      for (let j = 0; j < b.length; j++) if (!used.has(j) && Math.abs(b[j] - t) <= tol && (best < 0 || Math.abs(b[j] - t) < Math.abs(b[best] - t))) best = j;
      if (best >= 0) { used.add(best); matched++; worst = Math.max(worst, Math.abs(b[best] - t)); }
    }
    return { matched, worst };
  };
  // One frame of the coarser rate either way: a hit shows on the first frame
  // whose window holds it, which at 30 fps can be up to 33 ms later than at 60.
  const TOL = 1 / 30 + 1e-9;
  for (const [what, a, b] of [
    ['the analyser\'s kick onsets', onsets(t30, 'kick'), onsets(t60a, 'kick')],
    ['the beat clock\'s kicks (what the plate reacts to)', beatKicks(t30, 30), beatKicks(t60a, 60)],
  ]) {
    const m = pair(a, b, TOL);
    // Found: a kick heard within 50 ms either side of where it was
    // played (the analyser's window and a frame's wait put it up to ~40 ms late).
    const recall = pair(kicks, b, 0.05).matched / kicks.length;
    check(`30 and 60 fps agree on ${what}, and find the kicks`, recall >= 0.9 && m.matched === a.length && m.matched === b.length,
      `${a.length} at 30, ${b.length} at 60, ${m.matched} paired within one 30 fps frame, worst ${(m.worst * 1000).toFixed(1)} ms; ${Math.round(recall * 100)}% of the ${kicks.length} kicks found at 60 (gate 90%)`);
  }
  // And the level the plate is driven by, at the moments both rates share.
  let diff = 0;
  for (let i = 0; i < t30.length; i++) diff += Math.abs(t30[i].bass - t60a[2 * i].bass);
  const mean = t60a.reduce((s, f) => s + f.bass, 0) / t60a.length;
  console.log(`   (the bass level at 30 fps against 60 at the same moments: mean |difference| ${(diff / t30.length).toFixed(2)} on a mean of ${mean.toFixed(1)})`);

  /*
    Live, the move changed nothing. The hook's arithmetic went from
    useAudioAnalyzer.ts into lib/soundLevels.ts so a render could run it; here
    is the hook's code as it stood before the move, verbatim apart from its
    variables becoming arguments, run side by side with the moved code on the
    same frames, under four sets of trims. Every number has to be identical,
    not close: a live show must not hear the room differently because a
    render exists.
  */
  const legacy = (sampleRate, binCount) => {
    const room = new RoomTracker();
    const ranges = {
      volume: new AutoRange({ minSpan: 3 }), bass: new AutoRange({ minSpan: 4, ceilFall: 8 }),
      mid: new AutoRange({ minSpan: 3 }), treble: new AutoRange({ minSpan: 2.5 }),
      energy: new AutoRange({ minSpan: 0.02 }), timbre: new AutoRange({ minSpan: 4, floorRise: 40, ceilFall: 25 }),
    };
    const SMOOTHING = { volume: 0.25, bass: 0.35, mid: 0.20, treble: 0.15, energy: 0.30, centroid: 0.12, timbre: 0.12, complexity: 0.10 };
    const calibratedTrim = (sensitivity) => 0.5 + sensitivity * 1.25;
    const hzPerBin = sampleRate / 2 / binCount;
    const bassEnd = Math.min(binCount, Math.ceil(250 / hzPerBin)), midEnd = Math.min(binCount, Math.ceil(4000 / hzPerBin));
    let prev = null;
    return (floatData, frequencyData, timeDomainData, dt, { sensitivity: sens, bassBoost: bBoost, autoCalibrate: autoCal }) => {
      let calibration = null;
      const win = { minDb: -100, maxDb: -30 };
      if (autoCal) {
        let peakDb = -Infinity;
        for (let i = 0; i < binCount; i++) if (floatData[i] > peakDb) peakDb = floatData[i];
        calibration = room.update(peakDb, dt);
        win.minDb = room.minDb; win.maxDb = room.maxDb;
      }
      const bytes = frequencyData(win);
      let sum = 0; for (let i = 0; i < binCount; i++) sum += bytes[i];
      const rawVolume = (sum / binCount / 255) * 100;
      let bassSum = 0; for (let i = 0; i < bassEnd; i++) bassSum += bytes[i];
      const rawBass = (bassSum / bassEnd / 255) * 100;
      let midSum = 0; for (let i = bassEnd; i < midEnd; i++) midSum += bytes[i];
      const rawMid = (midSum / (midEnd - bassEnd) / 255) * 100;
      let trebleSum = 0; for (let i = midEnd; i < binCount; i++) trebleSum += bytes[i];
      const rawTreble = (trebleSum / (binCount - midEnd) / 255) * 100;
      let energySum = 0; for (let i = 0; i < binCount; i++) { const n = (timeDomainData[i] - 128) / 128; energySum += n * n; }
      const rawEnergy = Math.sqrt(energySum / binCount);
      let volume, bass, mid, treble, energy;
      if (autoCal) {
        const trim = calibratedTrim(sens); const gate = calibration?.gate ?? 0;
        ranges.volume.update(rawVolume, dt); ranges.bass.update(rawBass, dt); ranges.mid.update(rawMid, dt);
        ranges.treble.update(rawTreble, dt); ranges.energy.update(rawEnergy, dt);
        volume = ranges.volume.normalize(rawVolume) * 85 * trim * gate;
        bass = ranges.bass.normalize(rawBass) * 85 * trim * bBoost * gate;
        mid = ranges.mid.normalize(rawMid) * 85 * trim * gate;
        treble = ranges.treble.normalize(rawTreble) * 85 * trim * gate;
        energy = ranges.energy.normalize(rawEnergy) * 0.85 * trim * gate;
      } else {
        volume = rawVolume * sens; bass = rawBass * sens * bBoost; mid = rawMid * sens; treble = rawTreble * sens; energy = rawEnergy;
      }
      let specNum = 0, specDen = 0;
      for (let i = 0; i < binCount; i++) { const mag2 = bytes[i] * bytes[i]; specNum += mag2 * i; specDen += mag2; }
      const spectralCentroid = specDen === 0 ? 0 : specNum / specDen;
      const rawTimbre = (spectralCentroid / binCount) * 100;
      let timbre;
      if (autoCal) { ranges.timbre.update(rawTimbre, dt); timbre = ranges.timbre.normalize(rawTimbre) * 85 * calibratedTrim(sens); } else timbre = rawTimbre * sens;
      let zeroCrossings = 0;
      for (let i = 1; i < binCount; i++) { const p = timeDomainData[i - 1] - 128, c = timeDomainData[i] - 128; if ((p >= 0 && c < 0) || (p < 0 && c >= 0)) zeroCrossings++; }
      const complexity = Math.min(100, ((zeroCrossings / (binCount - 1)) * 100) * 15) * (autoCal ? calibratedTrim(sens) : sens);
      const next = !prev ? { volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity } : {
        volume: prev.volume + (volume - prev.volume) * SMOOTHING.volume,
        bass: prev.bass + (bass - prev.bass) * SMOOTHING.bass,
        mid: prev.mid + (mid - prev.mid) * SMOOTHING.mid,
        treble: prev.treble + (treble - prev.treble) * SMOOTHING.treble,
        energy: prev.energy + (energy - prev.energy) * SMOOTHING.energy,
        spectralCentroid: prev.spectralCentroid + (spectralCentroid - prev.spectralCentroid) * SMOOTHING.centroid,
        timbre: prev.timbre + (timbre - prev.timbre) * SMOOTHING.timbre,
        complexity: prev.complexity + (complexity - prev.complexity) * SMOOTHING.complexity,
      };
      prev = next;
      return { ...next, calibration };
    };
  };
  for (const params of [
    DEFAULT_LEVEL_PARAMS,
    { sensitivity: 1.2, bassBoost: 1.5, autoCalibrate: true },
    { sensitivity: 0.4, bassBoost: 1, autoCalibrate: false },
    { sensitivity: 2.5, bassBoost: 0.7, autoCalibrate: false },
  ]) {
    const emu = new AnalyserEmulator(SR);
    const bins = emu.fftSize / 2;
    const moved = new SoundLevels(SR, bins);
    const old = legacy(SR, bins);
    let prev = null, frames = 0, differ = 0, firstDiff = '';
    for (let i = 0; i < 60 * SECONDS; i++, frames++) {
      const end = Math.round((i * SR) / 60);
      const db = emu.frame(pcm, end, 1 / 60);
      // Uneven frame times, as a live loop has.
      const dt = i === 0 ? 0 : Math.min(0.25, [0.0161, 0.0172, 0.0334, 0.0166][i % 4]);
      const wave = waveBytes(pcm, end, emu.fftSize, new Uint8Array(bins));
      const want = old(db, (win) => bytesFromDb(db, win.minDb, win.maxDb, new Uint8Array(bins)), wave, dt, params);
      const win = moved.calibrate(db, dt, params.autoCalibrate);
      const raw = moved.levels(bytesFromDb(db, win.minDb, win.maxDb, new Uint8Array(bins)), wave, dt, params);
      const got = { ...smoothLevels(prev, raw), calibration: raw.calibration };
      prev = got;
      if (JSON.stringify(got) !== JSON.stringify(want)) { differ++; firstDiff ||= `frame ${i}`; }
    }
    check(`live, the moved arithmetic is the hook's own (sensitivity ${params.sensitivity}, bass boost ${params.bassBoost}, calibration ${params.autoCalibrate ? 'on' : 'off'})`,
      differ === 0, differ ? `${differ} of ${frames} frames differ, first at ${firstDiff}` : `${frames} frames identical`);
  }
}

// ── 3. The file ───────────────────────────────────────────────────────────
console.log('\nThe file');
/*
  Synthetic encoded media: frame sizes that vary like a real encoder's (a
  big keyframe every second, small deltas between), audio in 20 ms Opus-like
  packets or 1024-sample AAC-like ones. The bytes are seeded noise with the
  sample's index written into the front, so a sample that came back in the
  wrong place cannot pass for the right one.
*/
function media(fps, seconds, { audioFrame = 960, audioRate = 48000, reorder = false } = {}) {
  const rng = makeRng(11, `render.media.${fps}`);
  const frames = Math.round(seconds * fps);
  const video = [];
  for (let i = 0; i < frames; i++) {
    const key = i % fps === 0;
    const data = new Uint8Array(key ? 4000 + rng.int(2000) : 200 + rng.int(800));
    for (let k = 0; k < data.length; k++) data[k] = rng.int(256);
    new DataView(data.buffer).setUint32(0, i);
    const ts = Math.round((i * 1e6) / fps);
    video.push({ data, timestampUs: ts, durationUs: Math.round(((i + 1) * 1e6) / fps) - ts, key });
  }
  if (reorder) {
    // An H.264 encoder with B-frames: frames leave in decode order, I P B B …,
    // so the presentation times are out of order in the stream.
    for (let i = 1; i + 2 < frames; i += 3) {
      if (video[i].key || video[i + 1].key || video[i + 2].key) continue;
      const [a, b, c] = [video[i], video[i + 1], video[i + 2]];
      video[i] = c; video[i + 1] = a; video[i + 2] = b;
    }
  }
  const audio = [];
  const packets = Math.floor((seconds * audioRate) / audioFrame);
  for (let i = 0; i < packets; i++) {
    const data = new Uint8Array(100 + rng.int(300));
    for (let k = 0; k < data.length; k++) data[k] = rng.int(256);
    new DataView(data.buffer).setUint32(0, 0x80000000 + i);
    const ts = Math.round((i * audioFrame * 1e6) / audioRate);
    audio.push({ data, timestampUs: ts, durationUs: Math.round(((i + 1) * audioFrame * 1e6) / audioRate) - ts, key: true });
  }
  return { video, audio, frames };
}

function mux(kind, m, fps, audioCodec) {
  const sink = new MemorySink();
  const w = 320, h = 180;
  const mx = kind === 'webm'
    ? new WebmMuxer(sink, { codec: 'vp09.00.10.08', width: w, height: h, fps }, { codec: 'opus', sampleRate: 48000, channels: 2 })
    : new Mp4Muxer(sink, { codec: audioCodec === 'aac' ? 'avc1.64001f' : 'vp09.00.10.08', width: w, height: h, fps },
      { codec: audioCodec, sampleRate: 48000, channels: 2, bitrate: 128000 });
  // Arrival as it happens in a render: all the audio first (it is encoded
  // before the first frame is drawn), then the frames one by one. The
  // interleaver has to put them back in time order regardless.
  for (const a of m.audio) mx.addAudio(a);
  mx.endAudio();
  const avcC = new Uint8Array([1, 0x64, 0, 0x1f, 0xff, 0xe0, 0]);
  m.video.forEach((v, i) => (kind === 'mp4' ? mx.addVideo(v, i === 0 ? avcC : undefined) : mx.addVideo(v)));
  const summary = mx.finish();
  return { bytes: sink.bytes(), summary, chunks: sink.chunks.length };
}

const sameSamples = (got, want, resolutionUs) => {
  if (got.length !== want.length) return `${got.length} samples, ${want.length} written`;
  // The container stores samples in decode order, as written.
  for (let i = 0; i < want.length; i++) {
    const g = got[i], w = want[i];
    if (Buffer.compare(Buffer.from(g.data), Buffer.from(w.data)) !== 0) return `sample ${i}'s bytes differ`;
    if (Math.abs(g.timeUs - w.timestampUs) > resolutionUs / 2 + 1e-6) return `sample ${i} at ${g.timeUs} µs, written at ${w.timestampUs}`;
    if (g.key !== w.key) return `sample ${i}'s keyframe flag is ${g.key}`;
  }
  return null;
};

for (const [kind, fps, audioCodec, opts] of [
  ['webm', 60, 'opus', {}],
  ['webm', 30, 'opus', {}],
  ['mp4', 60, 'opus', {}],
  ['mp4', 30, 'aac', { audioFrame: 1024 }],
  ['mp4', 24, 'aac', { audioFrame: 1024, reorder: true }],
]) {
  const seconds = 7.5;
  const m = media(fps, seconds, opts);
  const label = `${kind.toUpperCase()} ${fps} fps, ${kind === 'webm' ? 'VP9' : audioCodec === 'aac' ? 'H.264' : 'VP9'} + ${audioCodec === 'aac' ? 'AAC' : 'Opus'}${opts.reorder ? ', frames reordered as by B-frames' : ''}`;
  const one = mux(kind, m, fps, audioCodec);
  const two = mux(kind, m, fps, audioCodec);
  let parsed = null, error = null;
  try { parsed = kind === 'webm' ? readWebm(one.bytes) : readMp4(one.bytes); } catch (e) { error = e.message; }
  check(`${label}: a strict reader accepts it`, !!parsed, error ?? `${one.bytes.length} bytes in ${one.chunks} writes${parsed.boxes ? `; ${parsed.boxes}` : `; ${parsed.clusters} clusters, ${parsed.cuePoints} cues`}`);
  if (!parsed) continue;
  const [vt, at] = parsed.tracks;
  const res = kind === 'webm' ? 1000 : 1e6 / 90000;
  const vBad = sameSamples(vt.samples, m.video, res);
  check(`${label}: every frame comes back, in order, at its time`, !vBad && vt.samples.length === m.frames, vBad ?? `${vt.samples.length} frames of ${m.frames}`);
  const aBad = sameSamples(at.samples, m.audio, kind === 'webm' ? 1000 : 1e6 / 48000);
  check(`${label}: every audio packet comes back, at its time`, !aBad, aBad ?? `${at.samples.length} packets`);
  const wantMs = seconds * 1000;
  check(`${label}: the file lasts what was asked for`, Math.abs(parsed.durationMs - wantMs) <= 1, `${parsed.durationMs.toFixed(3)} ms, asked ${wantMs}`);
  if (kind === 'mp4') {
    // Frame durations: every frame exactly 1/fps in the 90 kHz clock, which is why 90 kHz.
    const d = new Set(vt.samples.map((s) => Math.round(s.durationUs * 90000 / 1e6)));
    check(`${label}: every frame is exactly 1/${fps} s`, d.size === 1 && [...d][0] === 90000 / fps, `${[...d].join(', ')} ticks at 90 kHz`);
  } else {
    const d = vt.samples.slice(0, -1).map((s) => s.durationUs);
    check(`${label}: frame durations are 1/${fps} s to the millisecond`, d.every((x) => Math.abs(x - 1e6 / fps) <= 1000), `${Math.min(...d)}–${Math.max(...d)} µs`);
  }
  check(`${label}: the same samples twice are the same bytes`, sha(one.bytes) === sha(two.bytes), sha(one.bytes));
}

// MemorySink's patch across a chunk boundary: the header fields a writer
// patches can straddle two writes.
{
  const s = new MemorySink();
  s.write(new Uint8Array([0, 1, 2])); s.write(new Uint8Array([3, 4])); s.write(new Uint8Array([5, 6, 7]));
  s.patch(2, new Uint8Array([9, 9, 9, 9]));
  check('a patch across three writes lands where it was aimed', Buffer.from(s.bytes()).equals(Buffer.from([0, 1, 9, 9, 9, 9, 6, 7])), `[${[...s.bytes()]}]`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
