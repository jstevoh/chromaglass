#!/usr/bin/env node
/**
 * Does a sound cord fire once per hit in the band it was dragged across, and
 * rise and fall in the times it was given? (PLAN.md 30a.)
 *
 *   npm run soundcords                 (everything; red until 30a is built)
 *   npm run soundcords -- --controls   (only the lines that hold on main today)
 *
 * What 30a asks for. A cord whose source is `sound` or `bands` carries a depth
 * and nothing else, so a kick cord that fires on every boom of a live room, or
 * a swell too slow for a ballad, can only be made to go less far, never to go
 * at a different moment. 30a gives such a cord a mode (follow, as today, or a
 * gate that a crossing fires), a threshold, a gain, an attack and a release,
 * and lets a `bands` cord take its edges from a drag across the spectrum
 * instead of the eight fixed bands. Its measure, which this is: synthetic tone
 * bursts in and out of a dragged band, the crossings counted against the
 * threshold (equal, none doubled, none from outside the band), and the
 * cord's rise and fall timed within 10% of its attack and release.
 *
 * Written before the build, so it is the contract the build is held to. The
 * fields it sets on a cord (`SceneMapping`, src/types.ts):
 *
 *   mode       'follow' | 'gate'; absent reads as follow, even with a
 *              threshold, attack or release set (a whole-plate cord ignores
 *              them today; an area cord's own rule is unchanged)
 *   threshold  0..1 of the reading, as on an area cord today
 *   gain       what the reading is multiplied by before the threshold;
 *              absent reads as 1
 *   attack     seconds from shut to the hit's height
 *   release    seconds from the height back to nothing
 *   band       [loHz, hiHz], the dragged edges; on a `bands` cord it wins
 *              over `feature`, which the panel still writes (the named band
 *              holding the drag's middle) so an app from before 30a falls back
 *              to the nearest fixed band rather than to nothing
 *
 * Everything is read through the path a song takes in the app: the samples
 * through the analyser's emulation and the ear (`songAudioTrack`, which a
 * render uses and whose readings are `analysePcm`'s to the bit), each frame's
 * `AudioData` handed to the patch bay's `fold` with the frame's time as `now`,
 * and the cord's setting read off the folded settings. Nothing is asked of the
 * gate's insides: a fire is a rise of the setting, so a build may keep its
 * state wherever it likes, and the same counter reads today's area-cord gate
 * (`CordGate`, lib/areaCords.ts) as a control.
 *
 * The tape. 44.1 kHz, a -80 dBFS noise floor under everything (the analyser
 * treats digital silence specially, SILENCE_DB in audioFeatures.ts, and a tape
 * of zeros between bursts would be measuring that rule), a 3.5 s lead, and
 * fourteen one-second sine bursts 1.6 s apart, each faded in and out over 5 ms
 * so a burst's edges do not splash across the spectrum. The lead holds one
 * loud in-band tone that nothing counts: a band's range is seeded by the first
 * frames it hears, so on noise alone it reads near 1 until something loud sets
 * its ceiling, and a gate in those seconds is measuring the seeding, not the
 * cord. The bursts:
 *
 *   in      1200 Hz, at 0.5   inside the drag [1000, 1400] Hz, reads 1.0
 *   dip     the same, with a 6 dB dip of 150 ms in its middle: one hit, so
 *           one fire, whatever the reading does inside it
 *   quiet   1200 Hz, 24 dB down: in the band, under the threshold at gain 1
 *           and over it at gain 2. A band reads against its own recent range
 *           (a 30 dB window under a ceiling that falls between loud moments),
 *           so where a quiet burst reads depends on how long since a loud one;
 *           every quiet burst comes straight after an `in`, and reads 0.3 to
 *           0.35 there (18 dB down read 0.53 to 0.75, too near 0.5 to hold)
 *   twin    1650 Hz, at 0.5   outside the drag, but inside the same fixed band
 *           (band5, 800 to 1692 Hz) as the drag: a build that snapped the drag
 *           to its nearest fixed band would fire on it
 *   low     300 Hz, at 0.5    far below the drag (band4)
 *   high    4000 Hz, at 0.5   far above it (band7)
 *
 * The drag is 400 Hz wide (nine bins at 43 Hz), and the twin sits 250 Hz past
 * its top edge, six bins: the analyser's Blackman window puts a sine's
 * sidelobes at -58 dB from three bins out, so the twin reaches the drag's bins
 * only as leakage, which `the tape` below measures rather than assumes.
 *
 * Lines, and what each would mean red:
 *
 *   the tape        (control) The drag's own bins, read straight off the
 *                   analyser, hear every in-band burst at least 30 dB over
 *                   every out-of-band one; fixed band5 hears the twin as
 *                   loud as the in-band tone; the quiet bursts read on band5
 *                   at least 0.1 under the threshold, and twice them at least
 *                   0.1 over it; and the dip's trough stays 0.15 over it. Red:
 *                   the tape does not hold what it claims to, and nothing
 *                   below means anything.
 *   the counter     (control) Today's area-cord gate (`CordGate`) on fixed
 *                   band5, fed the same frames: fires once on each burst band5
 *                   holds over the threshold (in, dip and twin), never on the
 *                   rest, and rises and falls within 10% of its attack and
 *                   release, at both pairs below; and on the `sound` source's
 *                   `energy` at 0.35, once on each of the eleven loud bursts.
 *                   Red: the counter, the burst windows or the timing is
 *                   wrong, since that gate is linear and exact.
 *   the judge rejects …  (control) The same judge on three gates known to be
 *                   wrong must read at least one line red: CordGate with its
 *                   attack 25% long, one that restarts its rise whenever the
 *                   reading climbs, and the right gate half a second late.
 *                   Without these, CI's controls would prove only that the
 *                   judge says yes (a copy with FIRE_STEP 0.9 and a 500%
 *                   tolerance passed every other control).
 *   follow unchanged (control) A `bands` cord with none of 30a's fields folds
 *                   to `base + reading · depth · travel` on every frame, to the
 *                   bit. Saved looks and presets carry such cords; 30a must not
 *                   move them.
 *   a drag on band5's edges reads as band5   (30a) In follow mode, a drag set
 *                   to exactly band5's edges reads what band5 reads, within
 *                   0.02, every frame after the lead: a dragged band is heard
 *                   against its own recent range as the named bands are.
 *   gain 2 in follow mode                    (30a) The same drag at gain 2 reads
 *                   twice band5, to Bloom's top, within 0.02.
 *   no mode reads as follow                  (30a) The same drag with no mode but
 *                   a threshold, attack and release set, at depth 0.5, reads
 *                   half of band5 within 0.02.
 *   (every drag gate line)                   (30a) Each fire's peak within 0.05
 *                   of the burst's band5 peak × gain (to Bloom's top) × depth:
 *                   the timing is relative to each fire's own peak, so a gate
 *                   rising to half the hit passed everything before this.
 *   gate at threshold 0.26 and 0.42          (30a) Counted: all eight in-drag
 *                   bursts at 0.26, only the five loud ones at 0.42 (at depth
 *                   0.5), so a threshold read 0.1 off either way, or held
 *                   fixed, fires on the wrong set at one of the three.
 *   gate, attack 0.3 s, release 0.6 s        (30a) Threshold 0.5, gain 1, the
 *                   drag [1000, 1400]: one fire on each `in` and the `dip`
 *                   (five), each in the first 0.2 s of its burst; none on
 *                   `quiet`, none on the twin, low or high, none between
 *                   bursts; and each fire's rise within 10% of 0.3 s and fall
 *                   within 10% of 0.6 s.
 *   gate, attack 0.6 s, release 1.2 s        (30a) The same at another pair, so
 *                   a gate with one timing baked in cannot pass.
 *   gate at 120 fps                          (30a) The first pair again, the
 *                   tape heard at 120 frames a second: a gate that counts
 *                   frames instead of reading `now` runs twice as fast here.
 *   gain 2 opens the quiet ones              (30a) At gain 2 the quiet bursts
 *                   cross too: eight fires, still none outside the band. So the
 *                   gain is applied before the threshold, as Beat Reactor's is:
 *                   it decides what crosses, not only how far the cord goes
 *                   (which the depth already does).
 *   a gate on a sound cord                   (30a) A `sound` cord on `energy`,
 *                   threshold 0.35: one fire on each loud burst, none on the
 *                   quiet ones. Counted, not timed (see the line).
 *
 * What the gate's times mean. Attack is the time from shut to 98% of the
 * hit's height, from 2% of it; release is the time from 98% back to 2%. A
 * linear envelope (today's CordGate) reads its own times that way to within a
 * frame; a curved one passes if its 2%-to-98% time is the attack, and not if
 * it takes the attack to settle within 1% (11 to 14% off, the skeptic found).
 * The height is the most the reading (times the gain) reached while the gate
 * was open, as on an area cord; a one-shot pulse that rises and falls on each
 * crossing whatever the burst does also passes, and fits "a crossing fires a
 * shaped pulse". A noise gate (the reading times an envelope) does not: the
 * dip counts as a second hit and its fall is the reading's tail.
 *
 * Measured 2026-10-26. On main: every control passes, and the 30a lines are
 * red (the bay ignores `mode`, `gain`, `band` and the gate, so the drag cords
 * follow band8's empty range and the sound cord follows energy). On a sketch
 * of the build (the drag read by the ear's own arithmetic, `CordGate` in the
 * bay, its clock from `now`; kept in the project's shared files, not in the
 * repo): every line passes, rises and falls within 2.8%. Each of these on that
 * sketch turns lines red: the gate's input half a second late (11 lines), the
 * gate only on `bands` cords (1), the gain only in gate mode (1), the drag
 * snapped to band5 (4), the gain after the gate (1), dt fixed at 1/60 (2), a
 * gate that shuts on any fall (6), one that restarts on a rise (8), the gate
 * ignored (10), the drag on a fixed -60..0 dB scale (3), release ×1.25 (3),
 * attack ×1.15 (3); and from the review, a threshold read 0.12 high (1), 0.1
 * low (1), fixed at 0.4 (1) or 0.5 (2), a gate rising to half the hit (7), one
 * that skips the depth (1), and no mode read as a gate (1). A drag one bin
 * wider each side passes, as it should: that build is near enough to right.
 *
 * How a fire is counted. The cord aims at Bloom (0..1, no steps, read once
 * for the picture) from 0 at depth 1, so the folded Bloom is the cord's
 * envelope. A fire is a rise of at least 0.1 from the lowest point since the
 * last counted peak, after a fall of at least 0.1 from that peak: a gate that
 * shut and reopened inside one burst shows as two, and one that fired on every
 * frame over the threshold (no latch) shows as one long rise, which is fine,
 * since that is what it looks like on the plate. It belongs to the burst whose
 * first 0.2 s it cleared 0.1 in (`burstOf`), and to none otherwise.
 *
 * How a rise and fall are timed. For each fire, its height H is the most the
 * envelope reaches before it falls back: the rise is from the last frame under
 * 2% of H to the first at 98% of it, the fall from the last frame at 98% to the
 * first under 2%. 10% of the shortest time measured, 0.3 s, is 1.8 frames.
 *
 * Exits non-zero if any line fails. `--controls` runs the controls only,
 * which is what CI runs until 30a lands: they hold on main, and they keep the
 * tape and the counter honest while the rest waits for the build. The build's
 * PR drops `--controls` from checks.yml in the same change.
 */

import { AnalyserEmulator, BAND_EDGES_HZ } from '../src/lib/audioFeatures.ts';
import { songAudioTrack } from '../src/lib/songTrack.ts';
import { PatchBay } from '../src/lib/sceneMap.ts';
import { CordGate } from '../src/lib/areaCords.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { getAudioValue } from '../src/constants.ts';

const CONTROLS_ONLY = process.argv.includes('--controls');
const SR = 44100;
/** The live analyser's rate, and a ProMotion display's: a gate timed by frames rather than by the clock is caught by the second. */
const FPS = 60;
const FAST_FPS = 120;
const DRAG = [1000, 1400];
const BAND5 = [BAND_EDGES_HZ[4], BAND_EDGES_HZ[5]];
const LOUD = 0.5;
const QUIET = LOUD * Math.pow(10, -24 / 20);
const BURST_S = 1.0;
const GAP_S = 1.6;
const LEAD_S = 3.5;
/** A loud in-band tone in the lead, before anything is counted (see the tape). */
const WARM = { start: 0.5, length: 1 };
const FADE_S = 0.005;
const THRESHOLD = 0.5;
const TOLERANCE = 0.1;
const FIRE_STEP = 0.1;
const ONSET_S = 0.2;
const HEIGHT_TOLERANCE = 0.05;
/**
 * Two more thresholds on the drag, counted: one under the quiet bursts and one
 * over them, so a gate that reads its threshold wrong by 0.1 either way, or
 * holds a fixed one, fires on the wrong set at one of the three.
 */
const LOW_THRESHOLD = 0.26;
const HIGH_THRESHOLD = 0.42;

const KINDS = {
  in: { hz: 1200, amp: LOUD, inDrag: true, inBand5: true },
  dip: { hz: 1200, amp: LOUD, inDrag: true, inBand5: true, dip: true },
  quiet: { hz: 1200, amp: QUIET, inDrag: true, inBand5: true },
  twin: { hz: 1650, amp: LOUD, inDrag: false, inBand5: true },
  low: { hz: 300, amp: LOUD, inDrag: false, inBand5: false },
  high: { hz: 4000, amp: LOUD, inDrag: false, inBand5: false },
};
// A loud in-band burst first and every few bursts after, so the band's range
// (its ceiling falls over about twelve seconds) is set by the loud tone
// throughout and the quiet ones read where the threshold expects them.
const ORDER = ['in', 'quiet', 'twin', 'low', 'in', 'quiet', 'dip', 'twin', 'high', 'in', 'quiet', 'twin', 'low', 'in'];

let failed = 0;
function line(ok, name, detail) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

// ── The tape ──────────────────────────────────────────────────────────────

function tape() {
  const bursts = ORDER.map((kind, i) => ({ kind, ...KINDS[kind], start: LEAD_S + i * (BURST_S + GAP_S) }));
  const seconds = LEAD_S + ORDER.length * (BURST_S + GAP_S);
  const pcm = new Float32Array(Math.ceil(seconds * SR));
  // Seeded, so every run is the same tape to the bit.
  let s = 0x30a;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const floor = Math.pow(10, -80 / 20);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (rnd() * 2 - 1) * floor;
  for (const b of [{ ...KINDS.in, start: WARM.start }, ...bursts]) {
    const a = Math.round(b.start * SR), n = Math.round(BURST_S * SR), f = Math.round(FADE_S * SR);
    for (let j = 0; j < n; j++) {
      const edge = Math.min(1, j / f, (n - 1 - j) / f);
      const t = j / SR;
      const dip = b.dip && Math.abs(t - BURST_S / 2) < 0.075 ? Math.pow(10, -6 / 20) : 1;
      pcm[a + j] += b.amp * dip * edge * Math.sin(2 * Math.PI * b.hz * t);
    }
  }
  return { pcm, bursts, seconds };
}

const { pcm, bursts } = tape();
/** The tape as the app hears it at `fps` frames a second. */
function track(fps) {
  const frames = songAudioTrack(pcm, SR, fps);
  return { fps, dt: 1 / fps, frames, band5: frames.map(f => f.features.bands[4]) };
}
const tr60 = track(FPS);

// The drag's own level per frame, straight off the analyser: the power mean of
// its bins, the same as the ear's regions take, in dB. Only for the tape line;
// the cord's reading is the build's to make.
function bandDb(tr, lo, hi) {
  const analyser = new AnalyserEmulator(SR);
  const hz = SR / analyser.fftSize;
  const out = [];
  for (let i = 0; i < tr.frames.length; i++) {
    const { bins } = analyser.frame(pcm, Math.round(i * SR / tr.fps), tr.dt);
    let p = 0, n = 0;
    for (let k = 1; k < bins.length; k++) {
      const f = k * hz;
      if (f < lo || f >= hi) continue;
      p += Math.pow(10, bins[k] / 10); n++;
    }
    out.push(10 * Math.log10(p / n));
  }
  return out;
}

/** The frames that hear the middle of each burst (its edges' smear left out). */
function middleOf(tr, b) {
  const a = Math.ceil((b.start + 0.2) * tr.fps), z = Math.floor((b.start + BURST_S - 0.1) * tr.fps);
  const out = [];
  for (let i = a; i <= z; i++) out.push(i);
  return out;
}

// ── Reading a trace ───────────────────────────────────────────────────────

/** Each rise of a 0..1 envelope: where it started, peaked and fell back. */
function fires(trace) {
  const out = [];
  let lo = trace[0], loAt = 0, hi = -Infinity, rising = false, cur = null;
  for (let i = 0; i < trace.length; i++) {
    const y = trace[i];
    if (!rising) {
      if (y < lo) { lo = y; loAt = i; }
      if (y - lo >= FIRE_STEP) { rising = true; hi = y; cur = { from: loAt, at: i, peakAt: i }; }
    } else {
      if (y > hi) { hi = y; cur.peakAt = i; }
      if (hi - y >= FIRE_STEP) { out.push({ ...cur, height: hi }); rising = false; lo = y; loAt = i; cur = null; }
    }
  }
  if (cur) out.push({ ...cur, height: hi });
  return out;
}

/**
 * Which burst a fire belongs to: the one whose first ONSET_S the rise cleared
 * FIRE_STEP in, or none. On the sketch that is 17 to 117 ms after the burst
 * begins (the analyser's window and smoothing, then the attack's first 0.1).
 * The window is where, not whether: a gate half a second late, or one that
 * fires as the burst ends, clears it outside every burst and counts as a fire
 * between bursts (the skeptic's mutants; a window of the whole burst passed
 * both).
 */
function burstOf(tr, fire) {
  const t = fire.at * tr.dt;
  return bursts.findIndex(b => t >= b.start && t <= b.start + ONSET_S);
}

/** Rise and fall of one fire, in seconds, by the 2%/98% rule above. */
function timing(tr, trace, fire) {
  const H = fire.height;
  let top = fire.peakAt;
  // The first frame at 98%, and the last frame under 2% before it.
  let up = fire.from;
  while (up < trace.length && trace[up] < 0.98 * H) up++;
  let base = up;
  while (base > 0 && trace[base] >= 0.02 * H) base--;
  // The last frame at 98% before it falls away, and the first under 2% after.
  top = up;
  while (top + 1 < trace.length && trace[top + 1] >= 0.98 * H) top++;
  let down = top;
  while (down < trace.length && trace[down] >= 0.02 * H) down++;
  return { rise: (up - base) * tr.dt, fall: (down - top) * tr.dt, closed: down < trace.length };
}

/**
 * Hold a trace to the bursts it should fire on: one fire each, none
 * elsewhere, and each timed within TOLERANCE of `attack` and `release`.
 */
function judge(tr, name, trace, shouldFire, attack, release, height) {
  const out = [];
  const say = (ok, n, detail) => out.push({ ok, name: n, detail });
  const got = fires(trace);
  const per = bursts.map(() => 0);
  let stray = 0;
  for (const f of got) {
    if (f.at * tr.dt < LEAD_S - 0.2) continue;
    const b = burstOf(tr, f);
    if (b < 0) stray++; else per[b]++;
  }
  const want = bursts.filter(shouldFire).length;
  const doubled = per.filter(n => n > 1).length;
  const missed = bursts.filter((b, i) => shouldFire(b) && per[i] === 0).map(b => b.kind);
  const wrong = bursts.filter((b, i) => !shouldFire(b) && per[i] > 0).map(b => b.kind);
  const fired = per.reduce((a, n) => a + n, 0);
  say(fired === want && doubled === 0 && stray === 0 && missed.length === 0 && wrong.length === 0,
    `${name}: one fire per burst over the threshold`,
    `${fired + stray} fires, ${want} wanted; doubled ${doubled}, between bursts ${stray}` +
    `${missed.length ? `, missed ${missed.join(' ')}` : ''}${wrong.length ? `, fired on ${wrong.join(' ')}` : ''}`);
  if (height) {
    // Each fire's peak against what the burst should lift it to: the timing
    // below is relative to each fire's own peak, so without this a gate that
    // rose to half the hit would pass every other line.
    let worst = 0, n = 0;
    for (const f of got) {
      const b = f.at * tr.dt < LEAD_S - 0.2 ? -1 : burstOf(tr, f);
      if (b < 0) continue;
      worst = Math.max(worst, Math.abs(f.height - height(tr, b)));
      n++;
    }
    say(n > 0 && worst <= HEIGHT_TOLERANCE, `${name}: each fire rises to the hit's height, within ${HEIGHT_TOLERANCE}`,
      `${n} fires, worst ${worst.toFixed(3)} off`);
  }
  if (attack === undefined) return out;
  const rises = [], falls = [];
  for (const f of got) {
    if (f.at * tr.dt < LEAD_S - 0.2 || burstOf(tr, f) < 0) continue;
    const t = timing(tr, trace, f);
    rises.push(t.rise);
    if (t.closed) falls.push(t.fall);
  }
  const worst = (xs, want) => xs.reduce((w, x) => Math.max(w, Math.abs(x - want) / want), 0);
  const fmt = xs => xs.length ? `${Math.min(...xs).toFixed(3)}–${Math.max(...xs).toFixed(3)} s` : 'none';
  const rw = worst(rises, attack), fw = worst(falls, release);
  say(rises.length > 0 && rw <= TOLERANCE, `${name}: rise within 10% of the attack, ${attack} s`,
    `${rises.length} rises, ${fmt(rises)}, worst ${(rw * 100).toFixed(1)}% off`);
  say(falls.length > 0 && fw <= TOLERANCE, `${name}: fall within 10% of the release, ${release} s`,
    `${falls.length} falls, ${fmt(falls)}, worst ${(fw * 100).toFixed(1)}% off`);
  return out;
}

/** Print a judge's lines as they stand. */
const report = results => results.forEach(r => line(r.ok, r.name, r.detail));

/**
 * A judge that must say no: `results` are a judge's lines on a gate known to
 * be wrong, and at least one of them has to be red, or the judge is passing
 * gates it cannot tell apart.
 */
function rejects(name, results) {
  const red = results.filter(r => !r.ok);
  line(red.length > 0, `the judge rejects ${name}`,
    red.length ? `${red.length} of ${results.length} red: ${red.map(r => r.name.split(': ').pop()).join('; ')}` : `all ${results.length} lines pass it`);
}

// ── Through the patch bay ─────────────────────────────────────────────────

/** Bloom from 0, one cord at depth 1, folded frame by frame as the app folds it. */
function bayTrace(tr, cord) {
  const base = { ...DEFAULT_SETTINGS, bloom: 0, sceneMappings: [{ source: 'bands', setting: 'bloom', depth: 1, layer: 'all', ...cord }] };
  const bay = new PatchBay(base, 1);
  const out = [];
  for (let i = 0; i < tr.frames.length; i++) {
    const ctx = { room: null, film: null, sound: tr.frames[i], shape: null, hits: null, roomImpact: 1, filmImpact: 1, soundImpact: 1, shapeImpact: 1 };
    bay.fold(base, ctx, 1, i * tr.dt * 1000);
    out.push(bay.global.bloom);
  }
  return out;
}

const { band5 } = tr60;

// ── Controls ──────────────────────────────────────────────────────────────

{
  const drag = bandDb(tr60, DRAG[0], DRAG[1]);
  const mean = (b, xs) => { const m = middleOf(tr60, b); return m.reduce((a, i) => a + xs[i], 0) / m.length; };
  const inside = bursts.filter(b => b.inDrag).map(b => mean(b, drag));
  const outside = bursts.filter(b => !b.inDrag).map(b => mean(b, drag));
  const margin = Math.min(...inside) - Math.max(...outside);
  const twin = bursts.filter(b => b.kind === 'twin').map(b => mean(b, band5));
  const loud = bursts.filter(b => b.kind === 'in').map(b => mean(b, band5));
  // Where the quiet bursts and the dip's trough read on band5, which holds the
  // same tone: under the threshold by 0.1 at gain 1 and over it by 0.1 at gain
  // 2, and the dip above the threshold and its 0.05 of hysteresis, or the
  // gate lines below would be measuring the tape's levels instead of the gate.
  const quiet = bursts.filter(b => b.kind === 'quiet').flatMap(b => middleOf(tr60, b).map(i => band5[i]));
  const trough = Math.min(...bursts.filter(b => b.dip).flatMap(b => middleOf(tr60, b).map(i => band5[i])));
  const qLo = Math.min(...quiet), qHi = Math.max(...quiet);
  line(margin >= 30 && Math.min(...twin) >= Math.min(...loud) - 0.05 &&
    qHi <= THRESHOLD - 0.1 && 2 * qLo >= THRESHOLD + 0.1 && trough >= THRESHOLD + 0.15 &&
    qLo >= LOW_THRESHOLD + 0.05 && qHi <= HIGH_THRESHOLD - 0.05,
    'the tape: the drag hears its bursts 30 dB over the rest, band5 hears the twin as the tone, the quiet ones sit either side of each threshold',
    `drag ${Math.min(...inside).toFixed(1)} dB at its quietest burst, ${Math.max(...outside).toFixed(1)} dB at the loudest outside (margin ${margin.toFixed(1)} dB); ` +
    `band5 reads the twin ${Math.min(...twin).toFixed(2)}, the tone ${Math.min(...loud).toFixed(2)}, quiet ${qLo.toFixed(2)}–${qHi.toFixed(2)}, the dip's trough ${trough.toFixed(2)}`);
}

const PAIRS = [[0.3, 0.6], [0.6, 1.2]];
const loudInBand5 = b => b.inBand5 && b.amp === LOUD;

/** Today's area-cord gate stepped over a reading, at 60 fps; `tweak` turns it into a wrong one. */
function cordGateTrace(reading, cord, tweak) {
  const gate = new CordGate();
  let prev = 0;
  return reading.map(x => {
    if (tweak === 'restart' && gate.open && x > prev + 0.03) gate.env = 0;
    prev = x;
    return gate.step(x, tr60.dt, tweak === 'slow' ? { ...cord, attack: cord.attack * 1.25 } : cord);
  });
}

for (const [attack, release] of PAIRS) {
  const cord = { source: 'bands', feature: 'band5', setting: 'bloom', depth: 1, threshold: THRESHOLD, attack, release };
  report(judge(tr60, `the counter (CordGate on band5, ${attack}/${release} s)`, cordGateTrace(band5, cord), loudInBand5, attack, release));
}

// The `sound` source too: 30a shapes a `sound` cord as it does a `bands` one.
// Its `energy` reads every loud burst, in band or out, at 0.84 and the quiet
// ones at 0.06, and the dip's trough at 0.44: a threshold of 0.35 sits 0.09
// under the trough (past the 0.05 of hysteresis) and 0.29 over the quiet.
const energy = tr60.frames.map(f => getAudioValue(f, 'energy'));
const ENERGY_THRESHOLD = 0.35;
const loudAny = b => b.amp === LOUD;
{
  const [attack, release] = PAIRS[0];
  const cord = { source: 'sound', feature: 'energy', setting: 'bloom', depth: 1, threshold: ENERGY_THRESHOLD, attack, release };
  report(judge(tr60, `the counter (CordGate on sound energy, ${attack}/${release} s)`, cordGateTrace(energy, cord), loudAny));
}

// And the judge has to say no to gates that are wrong, or the lines above
// prove only that it says yes: an attack a quarter long, a gate that starts
// its rise again whenever the reading climbs (the dip's recovery and every
// onset), and the right gate half a second late.
{
  const [attack, release] = PAIRS[0];
  const cord = { source: 'bands', feature: 'band5', setting: 'bloom', depth: 1, threshold: THRESHOLD, attack, release };
  rejects('an attack 25% long', judge(tr60, 'slow', cordGateTrace(band5, cord, 'slow'), loudInBand5, attack, release));
  rejects('a gate that restarts on a rise', judge(tr60, 'restart', cordGateTrace(band5, cord, 'restart'), loudInBand5, attack, release));
  const late = Math.round(0.5 * FPS);
  const right = cordGateTrace(band5, cord);
  rejects('the right gate 0.5 s late', judge(tr60, 'late', right.map((_, i) => (i >= late ? right[i - late] : 0)), loudInBand5, attack, release));
}

{
  const travel = { min: 0, max: 1 };
  const depth = 0.7;
  const base = 0.1;
  const cord = { source: 'bands', feature: 'band5', setting: 'bloom', depth, layer: 'all' };
  const settings = { ...DEFAULT_SETTINGS, bloom: base, sceneMappings: [cord] };
  const bay = new PatchBay(settings, 1);
  let off = 0, first = -1;
  for (let i = 0; i < tr60.frames.length; i++) {
    const ctx = { room: null, film: null, sound: tr60.frames[i], shape: null, hits: null, roomImpact: 1, filmImpact: 1, soundImpact: 1, shapeImpact: 1 };
    bay.fold(settings, ctx, 1, i * tr60.dt * 1000);
    const moved = base + band5[i] * depth * 1 * (travel.max - travel.min);
    const want = moved < travel.min ? travel.min : moved > travel.max ? travel.max : moved;
    if (bay.global.bloom !== want) { off++; if (first < 0) first = i; }
  }
  line(off === 0, 'follow unchanged: a cord with none of 30a\'s fields folds as it always has',
    off === 0 ? `${tr60.frames.length} frames to the bit` : `${off} of ${tr60.frames.length} frames differ, first at ${(first * tr60.dt).toFixed(2)} s`);
}

// ── 30a ───────────────────────────────────────────────────────────────────

if (!CONTROLS_ONLY) {
  // From the end of the lead: before the warm-up tone sets a range, a band's
  // reading is its seeding (see the tape), and a drag a bin wider than band5
  // differs from it there by 0.027 and by 0.012 after.
  const settled = i => i * tr60.dt >= LEAD_S - 0.2;
  const follows = (name, cord, want) => {
    const trace = bayTrace(tr60, cord);
    let worst = 0, at = 0;
    for (let i = 0; i < trace.length; i++) {
      if (!settled(i)) continue;
      const d = Math.abs(trace[i] - want(i));
      if (d > worst) { worst = d; at = i; }
    }
    line(worst <= 0.02, name, `worst ${worst.toFixed(3)} at ${(at * tr60.dt).toFixed(2)} s`);
  };
  // `feature` names band8 (7.6 to 16 kHz, where this tape has nothing), so a
  // build that ignored the drag reads band8's empty range, not band5 by luck.
  follows('a drag on band5\'s edges reads as band5, every frame after the lead, within 0.02',
    { feature: 'band8', mode: 'follow', band: BAND5 }, i => band5[i]);
  // The gain in follow mode too: twice the reading, until Bloom's travel ends.
  follows('gain 2 in follow mode reads twice band5 (to Bloom\'s top), within 0.02',
    { feature: 'band8', mode: 'follow', band: BAND5, gain: 2 }, i => Math.min(1, 2 * band5[i]));

  // `mode` left out reads as follow, even with a threshold, attack and release
  // set: a whole-plate cord has always ignored those three, and a look saved
  // with them must not start gating when 30a lands. (An area cord gates on
  // them, as it does today: that is lib/areaCords.ts's rule, not this one.)
  // At a depth of 0.5, so the depth is held too: half of band5.
  follows('no mode reads as follow (threshold and times set), at depth 0.5 half of band5, within 0.02',
    { feature: 'band8', band: BAND5, depth: 0.5, threshold: THRESHOLD, attack: 0.3, release: 0.6 }, i => 0.5 * band5[i]);

  /**
   * What a burst should lift a gate to: the most band5 (which holds the same
   * tone as the drag, and reads as the drag does by the line above) reached
   * in it, times the gain, to Bloom's top, times the depth.
   */
  const hitHeight = (gain, depth = 1) => (tr, i) => {
    const b = bursts[i];
    let peak = 0;
    for (let k = Math.floor(b.start * tr.fps); k <= Math.ceil((b.start + BURST_S + 0.1) * tr.fps); k++) peak = Math.max(peak, tr.band5[k]);
    return Math.min(1, gain * peak) * depth;
  };

  const loudInDrag = b => b.inDrag && b.amp === LOUD;
  for (const [attack, release] of PAIRS) {
    const trace = bayTrace(tr60, { feature: 'band8', mode: 'gate', band: DRAG, threshold: THRESHOLD, gain: 1, attack, release });
    report(judge(tr60, `gate on the drag, ${attack}/${release} s`, trace, loudInDrag, attack, release, hitHeight(1)));
  }

  {
    // Counted, not timed: the quiet bursts' reading is still climbing for a
    // few frames after it crosses 0.26, so a gate rising to its height takes
    // up to 0.48 s for a 0.3 s attack, the reading's doing (as the energy line).
    const [attack, release] = PAIRS[0];
    const low = bayTrace(tr60, { feature: 'band8', mode: 'gate', band: DRAG, threshold: LOW_THRESHOLD, attack, release });
    report(judge(tr60, `gate on the drag at threshold ${LOW_THRESHOLD}`, low, b => b.inDrag, undefined, undefined, hitHeight(1)));
    // And at a depth of 0.5, which the gate's height is scaled by.
    const high = bayTrace(tr60, { feature: 'band8', mode: 'gate', band: DRAG, threshold: HIGH_THRESHOLD, depth: 0.5, attack, release });
    report(judge(tr60, `gate on the drag at threshold ${HIGH_THRESHOLD}, depth 0.5`, high, loudInDrag, undefined, undefined, hitHeight(1, 0.5)));
  }

  {
    // The gate's clock is the `now` handed to `fold`, not a frame count: the
    // same cord at 120 frames a second rises and falls in the same seconds.
    const tr120 = track(FAST_FPS);
    const [attack, release] = PAIRS[0];
    const trace = bayTrace(tr120, { feature: 'band8', mode: 'gate', band: DRAG, threshold: THRESHOLD, gain: 1, attack, release });
    report(judge(tr120, `gate on the drag at ${FAST_FPS} fps, ${attack}/${release} s`, trace, loudInDrag, attack, release, hitHeight(1)));
  }

  {
    const [attack, release] = PAIRS[0];
    const trace = bayTrace(tr60, { feature: 'band8', mode: 'gate', band: DRAG, threshold: THRESHOLD, gain: 2, attack, release });
    report(judge(tr60, 'gain 2 opens the quiet ones', trace, b => b.inDrag, undefined, undefined, hitHeight(2)));
  }

  {
    const [attack, release] = PAIRS[0];
    const trace = bayTrace(tr60, { source: 'sound', feature: 'energy', mode: 'gate', threshold: ENERGY_THRESHOLD, attack, release });
    // Counted, not timed: `energy` is smoothed, so it is still climbing for a
    // few frames after it crosses, and a gate that rises to the hit's height
    // (as CordGate does) reaches it two frames after its attack, which is the
    // reading's doing; the drag's lines above time the gate on a reading that
    // arrives at once.
    report(judge(tr60, 'a gate on a sound cord (energy)', trace, loudAny));
  }
} else {
  console.log('SKIP  30a\'s own lines (--controls): they wait for the build');
}

console.log(failed ? `\n${failed} line(s) failed` : '\nall lines pass');
process.exit(failed ? 1 : 0);
