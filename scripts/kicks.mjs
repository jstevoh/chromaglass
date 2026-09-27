#!/usr/bin/env node
/**
 * `npm run kicks`: of the kicks the show's own band plays, how many does the
 * show hear, and when?
 *
 * What was found: on the Mac, with the simulated band playing four on the
 * floor at 122 bpm, the show counted 6 kicks in 12 s on one run and 3 in 45
 * s on another, where the band played 24 and 90 (`npm run squeeze`, PLAN
 * batch 10). Every beat ride reads those kicks: Beat Squeeze, Plate Rock,
 * the kick triggers, the clock that runs ahead of the room. So a show
 * hearing one kick in four is a quarter of a show.
 *
 * The cause, measured here: the beat clock called a kick where the smoothed
 * bass level (the analyser's time constant, then the hook's own smoothing)
 * crossed 0.45 from under it. The band's chorus has a sawtooth bassline
 * under every kick, open to 900 Hz, and it holds that level over the line
 * from one kick to the next, so there is no crossing to find; and the
 * fewer frames a second the show draws, the more each frame's reading is
 * smoothed across the gap, so the Mac's 20 frames a second found fewest.
 * The analyser already computes the kick's own onset, a new arrival of
 * energy at 30–120 Hz (spectral flux, `audioFeatures.ts`), which a held
 * bass note does not make; sound learn and the song's shape use it. The
 * clock now does too (PLAN 14d). And that onset would not call a kick that
 * came with its bass note, reading the note's harmonics as a snare's body:
 * a sixth of the chorus's kicks at 44.1 kHz (KICK_TILT_DB, now 3 dB).
 *
 * How: the band's own score (`bandStep` in `lib/simulatedMusic.ts`, the
 * notes the running band schedules) rendered to samples the way Web Audio
 * plays them (the same oscillators, envelopes and filters, the same seeded
 * noise), then heard through the live ear, frame by frame: the analyser
 * (`AnalyserEmulator`, its smoothing applied once a read, as the node does
 * on each call), the named sources, the room's levels and the hook's
 * smoothing, then the beat clock as the frame loop drives it (Beat
 * Prediction and Beat Lead at the show's defaults). At 60, 30 and 20 frames
 * a second, and at 20 with each frame up to 15 ms late, as a busy Mac draws.
 * A kick is heard if the clock kicked within 150 ms of it (a predicted kick
 * fires the lead, 80 ms, ahead; a heard one a frame or two behind).
 *
 * The control is the old ear, the smoothed bass crossing its line, run on
 * the same frames: it must miss what the Mac missed, or the band rendered
 * here is not the band the Mac heard.
 *
 * Then the ear and the loop apart, as they run live: the ear reading at
 * 60 Hz, the plate's loop at 20 or 30 handed only the latest reading, so a
 * kick has to be read from the onset's time rather than from the one
 * reading it landed on (the last section, with the song's shape on the
 * same frames).
 * What it cannot see: the Mac's own frames, and the running band's
 * scheduler, whose 25 ms timer a busy page might run late (it did not, on
 * the cloud's page: 0 of 62 kicks scheduled late, `window.__band()`).
 */
import { bandStep, BAND_STEP_S } from '../src/lib/simulatedMusic.ts';
import { AnalyserEmulator, AudioFeatures } from '../src/lib/audioFeatures.ts';
import { SoundLevels, bytesFromDb, smoothLevels, waveBytes } from '../src/lib/soundLevels.ts';
import { BeatClock, LevelOnsets } from '../src/lib/beatClock.ts';
import { SongShape } from '../src/lib/songShape.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { stream, setShowSeed } from '../src/lib/rng.ts';

/*
  The sample rate the band is rendered and heard at, set for each run below:
  48 kHz and 44.1 kHz, the two a Mac's audio runs at. The analyser's bins
  are 47 Hz wide at one and 43 at the other, so a kick's sweep and a bass
  note's harmonics land in different bins, and the kick's own onset was
  measured hearing 134 of the chorus's 160 kicks at 48 kHz and 124 at 44.1
  (before KICK_TILT_DB went from 6 to 3). One rate alone passed a show the
  other would have missed.
*/
let SR = 48000;

function biquad(type, f0, Q) {
  const w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w), alpha = sn / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
  else if (type === 'highpass') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
  else { b0 = alpha; b1 = 0; b2 = -alpha; }
  a0 = 1 + alpha; a1 = -2 * cs; a2 = 1 - alpha;
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
const expAt = (v0, v1, t0, t1, t) => v0 * Math.pow(v1 / v0, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));

function renderBand(seconds, fromStep = 0) {
  const out = new Float32Array(Math.ceil(seconds * SR));
  const noise = new Float32Array(Math.floor(SR * 0.4));
  { const r = stream('audio.sim'); for (let i = 0; i < noise.length; i++) noise[i] = r.signed(); }
  const offs = stream('audio.sim');
  const kicks = [];
  const steps = Math.ceil(seconds / BAND_STEP_S);
  for (let s = 0; s < steps; s++) {
    const at = s * BAND_STEP_S;
    const { part, notes } = bandStep(s + fromStep);
    for (const n of notes) {
      const t0 = at + n.after;
      if (n.kind === 'tone') {
        if (n.type === 'sine' && n.freq === 120) kicks.push({ t: t0, part });
        const lp = n.cutoff !== undefined ? biquad('lowpass', n.cutoff, Math.pow(10, 1 / 20)) : null;
        let ph = 0;
        const i0 = Math.floor(t0 * SR), i1 = Math.min(out.length, Math.ceil((t0 + n.dur + 0.02) * SR));
        for (let i = i0; i < i1; i++) {
          const t = i / SR;
          const f = n.sweepTo !== undefined ? expAt(n.freq, Math.max(20, n.sweepTo), t0, t0 + n.dur, t) : n.freq;
          ph += f / SR; ph -= Math.floor(ph);
          const osc = n.type === 'sine' ? Math.sin(2 * Math.PI * ph) : n.type === 'sawtooth' ? 2 * ph - 1 : 1 - 4 * Math.abs(ph - 0.5);
          const g = t < t0 + 0.006 ? expAt(0.0001, n.gain, t0, t0 + 0.006, t) : expAt(n.gain, 0.0001, t0 + 0.006, t0 + n.dur, t);
          const v = osc * g;
          out[i] += 0.5 * (lp ? lp(v) : v);
        }
      } else {
        const f = biquad(n.filter, n.cutoff, n.filter === 'bandpass' ? 1 : Math.pow(10, 1 / 20));
        const start = Math.floor(offs.float() * 0.2 * SR);
        const i0 = Math.floor(t0 * SR), i1 = Math.min(out.length, Math.ceil((t0 + n.dur + 0.02) * SR));
        for (let i = i0; i < i1; i++) {
          const j = start + (i - i0); if (j >= noise.length) break;
          const g = expAt(n.gain, 0.0001, t0, t0 + n.dur, i / SR);
          out[i] += 0.5 * g * f(noise[j]);
        }
      }
    }
  }
  return { pcm: out, kicks };
}


/**
 * The live ear, frame by frame, at `fps` (and `jitterMs` of lateness on each
 * frame, from a seeded stream), handing each frame's reading to `feed`.
 */
function listen(pcm, fps, feed, jitterMs = 0, seed = 0x9e3779b9) {
  const an = new AnalyserEmulator(SR);
  const bins = an.fftSize / 2;
  const levels = new SoundLevels(SR, bins);
  const features = new AudioFeatures();
  const freq = new Uint8Array(bins), wave = new Uint8Array(bins);
  // Its own generator each run, so the old ear and the new hear the same frames.
  let a = seed >>> 0;
  const late = { float: () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; } };
  let prev = null, last = 0;
  const clock = new BeatClock();
  const ticks = [];
  let lockedAt = null;
  const frames = Math.floor((pcm.length / SR) * fps);
  for (let i = 1; i < frames; i++) {
    const t = i / fps + (jitterMs ? (late.float() * jitterMs) / 1000 : 0);
    const end = Math.round(t * SR);
    // The node smooths once a read, whatever the gap between reads.
    const db = an.frame(pcm, end, 1 / 60);
    const reading = features.update({ bins: db, scale: 'db', sampleRate: SR, fftSize: an.fftSize }, t);
    const dt = t - last; last = t;
    const win = levels.calibrate(db, dt, true);
    bytesFromDb(db, win.minDb, win.maxDb, freq);
    waveBytes(pcm, end, an.fftSize, wave);
    const raw = levels.levels(freq, wave, dt, { sensitivity: 0.4, bassBoost: 1, autoCalibrate: true });
    prev = smoothLevels(prev, raw);             // the hook smooths once a frame, as live
    const now = t * 1000;
    const tick = clock.update(now, feed(now, prev, reading), TRUST, LEAD);
    if (tick.kick) ticks.push({ t, predicted: tick.predicted });
    if (lockedAt === null && clock.isLocked(now, TRUST)) lockedAt = t;
  }
  return { ticks, lockedAt };
}

/**
 * The live ear and the live loop apart: the ear reads the analyser at the
 * display's 60 Hz (useAudioAnalyzer's animation frame), and the plate's loop,
 * at `fps` and up to `jitterMs` late, is handed whichever reading is the
 * latest when it runs, as React hands it `currentAudioData`. Readings in
 * between are never seen by the loop. `feed(now, reading)` is the loop's
 * choice of what a kick is; the song's shape is run on the same frames, and
 * `kicksFor(reading)` is what it is handed (the reading as it is, or with the
 * onset's time hidden except on the reading it landed on, which is what
 * reading `hit` amounted to).
 */
function listenApart(pcm, fps, feed, jitterMs, seed, kicksFor) {
  const an = new AnalyserEmulator(SR);
  const bins = an.fftSize / 2;
  const features = new AudioFeatures();
  let a = seed >>> 0;
  const late = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clock = new BeatClock();
  const shape = new SongShape();
  const ticks = [];
  const onsets = [];
  const window = [];
  let lockedAt = null, latest = null;
  let frame = 1 / fps + (jitterMs ? (late() * jitterMs) / 1000 : 0), n = 1;
  const reads = Math.floor((pcm.length / SR) * 60);
  for (let i = 1; i < reads; i++) {
    const t = i / 60;
    const db = an.frame(pcm, Math.round(t * SR), 1 / 60);
    latest = features.update({ bins: db, scale: 'db', sampleRate: SR, fftSize: an.fftSize }, t);
    // The ear's own kick onsets, every reading, before any loop reads them.
    if (latest.onsets.kick.hit) onsets.push({ t, predicted: false });
    while (frame <= t) {
      const now = frame * 1000;
      const tick = clock.update(now, feed(now, latest), TRUST, LEAD);
      if (tick.kick) ticks.push({ t: frame, predicted: tick.predicted });
      if (lockedAt === null && clock.isLocked(now, TRUST)) lockedAt = frame;
      shape.update(kicksFor(latest), latest.time);
      // What the song's shape counts in its own window (BEAT_S, the last
      // 4 s), read where the band has been in one section for all of it, to
      // be set against the kicks the band played in the same 4 s.
      const part = bandStep(Math.floor(latest.time / BAND_STEP_S)).part;
      if ((part === 'verse' || part === 'chorus') && bandStep(Math.floor((latest.time - 4) / BAND_STEP_S)).part === part) window.push({ t: latest.time, part, n: shape.kicks.length });
      n++;
      frame = n / fps + (jitterMs ? (late() * jitterMs) / 1000 : 0);
    }
  }
  return { ticks, lockedAt, onsets, window };
}

const TRUST = DEFAULT_SETTINGS.beatPrediction;
const LEAD = DEFAULT_SETTINGS.beatLead;
const WINDOW = 0.15;

/** What the clock made of the band: kicks heard by section, extra kicks, the lock and the lead. */
function score(kicks, { ticks, lockedAt }) {
  const by = {};
  const offsets = [];
  // The song's very first kick is left out of the count: out of digital
  // silence only the level may fire (audioFeatures.ts, SILENCE_DB), so that
  // one kick is never an onset, by design, on any ear.
  //
  // One tick answers one kick: the nearest not yet taken. The chorus's extra
  // kick is a quarter of a second from the next beat, and a tick between
  // them could otherwise be credited to both.
  const used = new Set();
  for (const k of kicks.slice(1)) {
    let best = -1;
    for (let i = 0; i < ticks.length; i++) {
      if (used.has(i) || Math.abs(ticks[i].t - k.t) >= WINDOW) continue;
      if (best < 0 || Math.abs(ticks[i].t - k.t) < Math.abs(ticks[best].t - k.t)) best = i;
    }
    const s = (by[k.part] ??= { played: 0, heard: 0 });
    s.played++;
    if (best >= 0) { used.add(best); s.heard++; if (ticks[best].predicted) offsets.push((ticks[best].t - k.t) * 1000); }
  }
  const extra = {};
  for (let i = 0; i < ticks.length; i++) {
    if (used.has(i)) continue;
    const x = ticks[i];
    // The song's first kick is not scored (above), so a tick on it is not extra either.
    if (Math.abs(x.t - (kicks[0]?.t ?? -1)) < WINDOW) continue;
    const part = bandStep(Math.floor(x.t / BAND_STEP_S)).part;
    extra[part] = (extra[part] ?? 0) + 1;
  }
  const first = kicks[0]?.t ?? 0;
  const toLock = lockedAt === null ? Infinity : kicks.filter((k) => k.t <= lockedAt).length;
  const mean = offsets.reduce((a, b) => a + b, 0) / Math.max(1, offsets.length);
  const sd = Math.sqrt(offsets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, offsets.length));
  return { by, extra, toLock, lockedIn: lockedAt === null ? Infinity : lockedAt - first, predicted: offsets.length, mean, sd };
}

const pct = (s) => (s ? `${s.heard}/${s.played}` : '-');
const line = (r) => `intro ${pct(r.by.intro)}, verse ${pct(r.by.verse)}, chorus ${pct(r.by.chorus)}; extra ${Object.entries(r.extra).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}; locked after ${r.toLock} kicks; ${r.predicted} ahead, lead ${r.mean.toFixed(0)} ± ${r.sd.toFixed(0)} ms`;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// The whole arrangement once round: intro, verse, chorus, verse, chorus,
// break, chorus, chorus, eight bars each at 122 bpm.
const SECONDS = 8 * 8 * 16 * BAND_STEP_S;
const RATES = [[60, 0], [30, 0], [20, 0], [20, 15], [20, 15, 11], [20, 15, 23], [30, 15, 5]];
const APART = [[20, 15, 3], [30, 15, 5]];
/*
  A section with no kicks played would count as heard in full and pass on
  nothing: if the band's kicks stopped being found in its score (they are
  its 120 Hz sine notes), every section must still have some, or this stops.
*/
const heard = (r, part) => {
  if (!r.by[part]?.played) throw new Error(`no ${part} kicks played: the band's kicks are not being found in its score`);
  return r.by[part].heard / r.by[part].played;
};
const worstSection = (r) => Math.min(heard(r, 'intro'), heard(r, 'verse'), heard(r, 'chorus'));
const onset = (now, lv, reading) => (reading.onsets.kick.hit ? reading.time * 1000 : null);
// The live loop's rule (LiquidVisualizer.tsx): a kick is the onset's time moving.
const atFeed = () => {
  let last = null;
  return (now, reading) => {
    const at = reading.onsets.kick.at;
    if (at === null || at === last) return null;
    last = at;
    return Math.min(now, at * 1000);
  };
};
const hitFeed = (now, reading) => (reading.onsets.kick.hit ? reading.time * 1000 : null);
const asIs = (r) => r;
const hitOnly = (r) => ({ ...r, onsets: { ...r.onsets, kick: { ...r.onsets.kick, at: r.onsets.kick.hit ? r.onsets.kick.at : null } } });

for (const sr of [48000, 44100]) {
SR = sr;
const khz = `${(sr / 1000).toFixed(1)} kHz`;
// The band's noise comes from the show's seeded streams: one seed, one band.
setShowSeed(7);
const { pcm, kicks } = renderBand(SECONDS);
console.log(`\n  ${khz}. The band: ${kicks.length} kicks in ${SECONDS.toFixed(1)} s (${['intro', 'verse', 'chorus'].map((p) => `${kicks.filter((k) => k.part === p).length} ${p}`).join(', ')}; none in the break)\n`);

const results = [];
for (const [fps, jitter, seed] of RATES) {
  const level = new LevelOnsets();
  const old = score(kicks, listen(pcm, fps, (now, lv) => level.at(now, Math.min(1, lv.bass / 70)), jitter, seed));
  const now = score(kicks, listen(pcm, fps, onset, jitter, seed));
  const name = `${khz}, ${fps} fps${jitter ? `, frames up to ${jitter} ms late${seed ? ` (draw ${seed})` : ''}` : ''}`;
  console.log(`  ${name}\n    the smoothed bass crossing 0.45 (before): ${line(old)}\n    the kick's onset (now):                   ${line(now)}`);
  results.push({ name, fps, jitter, old, now });
}
console.log('');

/*
  The control: the old ear misses chorus kicks, and misses more at fewer
  frames a second, as the Mac did. If it heard them all, the band rendered
  here would not be the band the Mac played, and nothing below would mean
  anything about the show.
*/
const at20 = results.find((r) => r.fps === 20 && !r.jitter);
const at60 = results.find((r) => r.fps === 60);
check(`${khz}: the control, the smoothed bass crossing its line, misses the chorus kicks, more at 20 fps than at 60`,
  heard(at20.old, 'chorus') < 0.6 && heard(at20.old, 'chorus') < heard(at60.old, 'chorus'),
  `${pct(at20.old.by.chorus)} at 20 fps, ${pct(at60.old.by.chorus)} at 60`);
/*
  The feature: every section's kicks heard, at every rate the show draws at,
  frames late or not (three draws of the lateness at 20 fps, one at 30).
  Nine in ten, where the clock itself is scored: a frame can land where the
  kick's first sliver is too thin to call and the next frame has missed its
  rise, and a locked clock covers that kick by its prediction, which is
  scored below. The ear's own onsets are held to more (after the loops).
*/
for (const r of results) {
  check(`at ${r.name}, the clock kicks on the band's kicks in every section`, worstSection(r.now) >= 0.9, line(r.now));
}
/*
  And not on anything else: a kick the band did not play is a press on the
  plate that nothing in the music asked for. The break is left out: a
  locked clock goes on a beat or two into silence before it lets go, as it
  is meant to (a missed beat costs it confidence, and it hands back).
*/
for (const r of results) {
  const extra = Object.entries(r.now.extra).filter(([k]) => k !== 'break').reduce((a, [, v]) => a + v, 0);
  check(`at ${r.name}, no more than a couple of kicks the band did not play`, extra <= 3, `${extra} outside the break`);
}

/*
  The lock and the lead (PLAN 14d). Heard on its onsets, the clock locks
  within the first bars (four onsets that agree on a period, then its
  confidence climbing past Beat Prediction's half: eight to ten kicks, five
  seconds at most at 122 bpm) and then fires ahead of most kicks, which the
  old ear, missing the chorus, could not: each miss cost it confidence and
  it fell back to hearing late. The lead's spread is what a projectionist
  sees as the press landing early or late on the kick; a frame is 17 to 50
  ms, so within a frame at 20 fps. The old ear is printed beside it.
*/
for (const r of results) {
  check(`at ${r.name}, the clock locks within the first bars and runs ahead of most kicks, steadily`,
    r.now.toLock <= 12 && r.now.predicted > 0.6 * kicks.length && r.now.sd <= 50,
    `locked after ${r.now.toLock} kicks (before: ${r.old.toLock}); ${r.now.predicted} of ${kicks.length} ahead, lead ${r.now.mean.toFixed(0)} ± ${r.now.sd.toFixed(0)} ms (before: ${r.old.predicted}, ${r.old.mean.toFixed(0)} ± ${r.old.sd.toFixed(0)} ms)`);
}

/*
  The ear and the loop apart. Everything above reads the ear once a frame,
  which is what a page does when both slow down together. But the ear reads
  on the display's animation frame and the plate's loop is handed only the
  latest reading, so on a page that draws the plate at 20 frames a second
  the loop sees one reading in three. `hit` is true on the one reading a
  kick landed on, so a loop reading `hit` loses the kicks that landed on
  readings it never saw: two in three at 20 fps, which the cloud's app
  showed (the loop saw 1 hit in 30 s of the band while the ear fired on
  its kicks). The onset's time, `at`, stays on the last kick until the
  next, so a loop that watches it move sees every kick. The beat clock and
  the song's shape both read it that way now. The control reads `hit`:
  what the song's shape did before, and what the clock would have done had
  it only been moved from the bass level onto the onset.
*/
for (const [fps, jitter, seed] of APART) {
  const was = listenApart(pcm, fps, hitFeed, jitter, seed, hitOnly);
  const is = listenApart(pcm, fps, atFeed(), jitter, seed, asIs);
  const before = score(kicks, was), after = score(kicks, is);
  const ear = score(kicks, { ticks: is.onsets, lockedAt: null });
  // The kicks the band played in the song's shape's window at each frame it
  // was read, against what the shape counted there, by section.
  const windows = (w, part) => {
    const at = w.filter((x) => x.part === part);
    const truth = at.reduce((a, x) => a + kicks.filter((kk) => kk.t > x.t - 4 && kk.t <= x.t).length, 0) / at.length;
    return { counted: at.reduce((a, x) => a + x.n, 0) / at.length, truth };
  };
  const name = `${khz}, the ear at 60 Hz, the plate at ${fps} fps, frames up to ${jitter} ms late`;
  const shapeLine = (w) => ['verse', 'chorus'].map((p) => { const x = windows(w, p); return `${p} ${x.counted.toFixed(1)} of ${x.truth.toFixed(1)}`; }).join(', ');
  console.log(`  ${name}\n    the ear's own onsets, every reading:  ${line(ear).split(';')[0]}\n    reading \`hit\` (control): ${line(before)}; the song's shape counted ${shapeLine(was.window)} a window\n    reading \`at\` (now):      ${line(after)}; the song's shape counted ${shapeLine(is.window)}`);
  /*
    The ear itself, before any loop reads it: every section's kicks called
    as kicks, nineteen in twenty. The clock's nine in ten above could hide
    an ear that missed one in ten behind its predictions; this cannot.
  */
  check(`${name}: the ear's own kick onsets find the band's kicks in every section`, worstSection(ear) >= 0.95, line(ear).split(';')[0]);
  check(`${name}: the control, reading \`hit\`, loses kicks between frames`,
    worstSection(before) < 0.6, `${pct(before.by.verse)} verse, ${pct(before.by.chorus)} chorus`);
  check(`${name}: the clock, reading the onset's time, hears every section`, worstSection(after) >= 0.9, line(after));
  check(`${name}: the clock, reading the onset's time, locks within the first bars and runs ahead of most kicks, steadily`,
    after.toLock <= 12 && after.predicted > 0.6 * kicks.length && after.sd <= 50,
    `locked after ${after.toLock} kicks; ${after.predicted} of ${kicks.length} ahead, lead ${after.mean.toFixed(0)} ± ${after.sd.toFixed(0)} ms`);
  /*
    The song's shape counts kicks in its last 4 s to decide the beat has
    come in (BEAT_KICKS). Held per section to within 15 % of what the band
    played in the same 4 s: the chorus has an extra kick a bar, so a count
    that matched the verse's four on the floor there would be missing one
    kick in six. The control, reading `hit`, is held under 60 %.
  */
  for (const part of ['verse', 'chorus']) {
    const x = windows(is.window, part), c = windows(was.window, part);
    check(`${name}: the song's shape counts the ${part}'s kicks`,
      x.counted >= 0.85 * x.truth && x.counted <= 1.15 * x.truth && c.counted < 0.6 * c.truth,
      `${x.counted.toFixed(1)} a window of ${x.truth.toFixed(1)} played (control, reading \`hit\`: ${c.counted.toFixed(1)})`);
  }
}
}

console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed ? 1 : 0);
