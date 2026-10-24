#!/usr/bin/env node
/**
 * Slow Evolve: does Evolve change the look slowly, a move at a time, steered
 * by the song over minutes (and by a slow clock when nothing plays)?
 *
 *   npm run slowevolve
 *
 * The owner, 2026-10-11: Evolve should "focus on more slowly changing
 * settings (as opposed to directly reacting to frequency and bouncing
 * around)", "consider the music in longer changing ways", and with no music
 * "slowly change across time". `src/lib/slowEvolve.ts` plans the moves and
 * App glides them; this drives the same planner through ten-minute songs and
 * ten minutes of silence in node, half a second a step as App does, glides
 * each move exactly as App's glide does, and asserts:
 *
 *   - one move at a time, each glided over 30 to 90 seconds with a rest of at
 *     least six after it (a move, then the dish left alone), and about one
 *     move a minute at the default Evolve Speed, with music and without (it
 *     was ten a minute, each over four seconds);
 *   - the look changes slowly: no dial faster than 0.5 % of its travel a
 *     second (it was 0.78 % at the default speed, in four-second glides),
 *     the closeup camera's aim no faster than four thousandths of the plate a
 *     second (it was 45 at the top of its four-second glide), and the change
 *     over ten minutes at least twice the change over one, so it keeps
 *     wandering rather than settling into a jitter. The amount of change in
 *     a minute is a little under what it was (0.31 % of the dials' travel,
 *     RMS, against 0.37 %) and over ten a little over (1.37 % against 1.21):
 *     about the same change, made as one slow move instead of twenty
 *     twitches;
 *   - the music steers it: the lean is livelier through builds and the half
 *     minute after a drop than through breakdowns, the moves that start
 *     in a rest start on a section change, and the palette turns only at a
 *     drop or a breakdown, never twice within 75 seconds; with no music it
 *     turns every three to five minutes;
 *   - it does not bounce with the moment: the same song with its level shaken
 *     by ±0.3 every half second (a frame's treble and energy, which the old
 *     hands followed) leans within a few hundredths of the steady song;
 *   - and it never touches what it must not: a dial the look switched off,
 *     where the magnet sits, or anything that moves the whole picture
 *     (lib/drift.ts FRAME_MOTION);
 *   - the pieces are connected: App drives this planner, and the plate's own
 *     hands (LiquidVisualizer) read the song's level over half a minute and
 *     its sections, not the frame's energy, treble or spectral centroid.
 *
 * What it cannot say is how it looks. That is the owner's eye on the Mac
 * (docs/judging.md).
 */
import { readFileSync } from 'node:fs';
import { SlowEvolve, GLIDE_MIN, GLIDE_MAX, MIN_REST, REST_FLOOR, AIM_STEP, evolvePace } from '../src/lib/slowEvolve.ts';
import { DRIFTABLE, FRAME_MOTION, THEMES } from '../src/lib/drift.ts';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';
import { PRESETS } from '../src/presets.ts';
import { makeRng } from '../src/lib/rng.ts';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
};

const DT = 0.5;
const look = (id) => ({ ...DEFAULT_SETTINGS, ...(PRESETS.find(p => p.id === id)?.settings ?? {}) });
const LOOKS = ['classic', 'ferro-paint', 'lava-lamp', 'clock-glass'].map(id => [id, look(id)]);
const span = (k) => { const s = PIN_RANGE.get(k); return s ? s.max - s.min : 1; };

/*
  A ten-minute song in sections, as the song shape tracker would report it:
  verses, builds that wind up their tension, drops (lastDrop set the moment
  each is heard), breakdowns with the low end gone. Intensity is the
  tracker's own, already slow; `shake` adds a fresh ±shake every step on top,
  the frame-by-frame bounce the old hands followed.
*/
const SONG = [
  ['steady', 50, 0.55], ['build', 20, 0.5], ['drop', 0, 0.85], ['steady', 70, 0.82],
  ['breakdown', 35, 0.35], ['build', 16, 0.45], ['drop', 0, 0.9], ['steady', 90, 0.85],
  ['breakdown', 45, 0.3], ['steady', 60, 0.6], ['build', 24, 0.55], ['drop', 0, 0.9],
  ['steady', 80, 0.88], ['breakdown', 30, 0.35], ['steady', 80, 0.5],
];
const songLength = SONG.reduce((s, [, d]) => s + d, 0);
function songEar(t, shake, rand, bpm = 124) {
  let at = 0, lastDrop = null;
  for (const [section, d, level] of SONG) {
    if (section === 'drop') { if (t >= at) lastDrop = at; continue; }
    if (t < at + d) {
      const tension = section === 'build' ? (t - at) / d : 0;
      const intensity = Math.max(0, Math.min(1, level + (rand() * 2 - 1) * shake));
      return { playing: true, section, intensity, tension, lastDrop, time: t, bpm };
    }
    at += d;
  }
  return { playing: true, section: 'steady', intensity: 0.5, tension: 0, lastDrop, time: t, bpm };
}
const silence = (t) => ({ playing: false, section: 'quiet', intensity: 0, tension: 0, lastDrop: null, time: t, bpm: 0 });

/** The look's distance from another, RMS over every dial Evolve may move, in % of each one's travel. */
const dist = (a, b) => {
  let s = 0, n = 0;
  for (const k of DRIFTABLE) {
    const x = a[k], y = b[k];
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    s += ((x - y) / span(k)) ** 2; n++;
  }
  return Math.sqrt(s / n) * 100;
};

/** One run: the planner stepped as App steps it, every move glided as App glides it. */
/*
  At the look's own Evolve Speed unless told otherwise, measured from that,
  as App runs it: since the dial sets the pace (8d), a look run at any other
  rate than its own is not the look the owner sees.
*/
function run(anchor, earAt, seconds, { rate = anchor.automateRate || DEFAULT_SETTINGS.automateRate, own = anchor.automateRate, seed = 20261011, extra = {} } = {}) {
  const rand = makeRng(seed, 'slowevolve').float;
  const shakeRand = makeRng(seed, 'shake').float;
  const ev = new SlowEvolve(rand);
  let cur = { ...anchor, ...extra };
  const base = { ...cur };
  let glide = null;
  const moves = [], palettes = [], hist = [], leans = [];
  let overlap = 0, peak = 0, aimPeak = 0, touched = new Set();
  const rests = [];
  let endedAt = null;
  for (let t = 0; t < seconds; t += DT) {
    const ear = earAt(t, shakeRand);
    const out = ev.step(DT, ear, cur, base, rate, own);
    if (out.palette) palettes.push({ t, section: ear.section, sinceDrop: ear.lastDrop !== null ? t - ear.lastDrop : Infinity });
    if (out.move) {
      if (glide && glide.at < 1) overlap++;
      if (endedAt !== null) rests.push(t - endedAt);
      const from = {};
      for (const k of Object.keys(out.move.to)) { from[k] = cur[k]; touched.add(k); }
      if (out.move.aim) { from.macroAimX = cur.macroAimX ?? 0.5; from.macroAimY = cur.macroAimY ?? 0.5; }
      glide = { move: out.move, from, at: 0, wasResting: !glide || glide.at >= 1 };
      moves.push({ t, ...out.move, section: ear.section, resting: glide.wasResting,
        aimStep: out.move.aim ? Math.max(Math.abs(out.move.aim.x - from.macroAimX), Math.abs(out.move.aim.y - from.macroAimY)) : 0,
        sinceDrop: ear.lastDrop !== null ? t - ear.lastDrop : Infinity });
    }
    if (glide && glide.at < 1) {
      const e = (a) => a * a * (3 - 2 * a);
      const a0 = glide.at;
      glide.at = Math.min(1, glide.at + DT / glide.move.seconds);
      const next = { ...cur };
      for (const [k, to] of Object.entries(glide.move.to)) {
        next[k] = glide.from[k] + (to - glide.from[k]) * e(glide.at);
        peak = Math.max(peak, Math.abs(next[k] - cur[k]) / span(k) / DT);
      }
      if (glide.move.aim) {
        for (const [k, to] of [['macroAimX', glide.move.aim.x], ['macroAimY', glide.move.aim.y]]) {
          next[k] = glide.from[k] + (to - glide.from[k]) * e(glide.at);
          aimPeak = Math.max(aimPeak, Math.abs(next[k] - cur[k]) / DT);
        }
      }
      void a0;
      cur = next;
      if (glide.at >= 1) endedAt = t + DT;
    }
    leans.push({ t, lean: ev.lean, section: ear.section, sinceDrop: ear.lastDrop !== null ? t - ear.lastDrop : Infinity });
    if (Math.abs(t - Math.round(t)) < 1e-9) hist.push({ ...cur });
  }
  const change = (lag) => {
    let s = 0, n = 0;
    for (let i = lag; i < hist.length; i += 10) { s += dist(hist[i], hist[i - lag]); n++; }
    return n ? s / n : 0;
  };
  return { moves, palettes, hist, leans, overlap, peak, aimPeak, touched, change, base, end: cur, rests };
}

// ── Pace: one move at a time, 30–90 s, about one a minute ──────────
console.log('\nThe pace of it, each look at its own Evolve Speed');
for (const [id, anchor] of LOOKS) {
  for (const [label, earAt] of [['a song', (t, r) => songEar(t, 0, r)], ['no music', silence]]) {
    const r = run(anchor, earAt, 600);
    const g = r.moves.map(m => m.seconds);
    const perMin = r.moves.length / 10;
    const gMin = Math.min(...g), gMax = Math.max(...g), gMean = g.reduce((a, b) => a + b, 0) / g.length;
    const restMin = Math.min(...r.rests);
    check(`${id}, ${label}: one move at a time, each glided ${GLIDE_MIN}–${GLIDE_MAX} s, a rest after it, about one a minute`,
      r.overlap === 0 && gMin >= GLIDE_MIN && gMax <= GLIDE_MAX && perMin >= 0.4 && perMin <= 1.5 && restMin >= MIN_REST - DT,
      `${perMin.toFixed(1)} moves/min, glides ${gMin.toFixed(0)}–${gMax.toFixed(0)} s (mean ${gMean.toFixed(0)}), shortest rest ${restMin.toFixed(1)} s, ${r.overlap} overlapping`);
    const c1 = r.change(60), c10 = r.change(600 - 1);
    check(`${id}, ${label}: slow, and still wandering after ten minutes`,
      r.peak <= 0.005 && c10 >= c1 * 2,
      `fastest dial ${(r.peak * 100).toFixed(2)} %/s of travel, change over 1 min ${c1.toFixed(2)} %, over 10 min ${c10.toFixed(2)} %`);
  }
}

// ── The dial sets the pace: low creeps, high moves quickly ──────────
/*
  The owner, 2026-10-11, once the slow Evolve was live: "I want evolve to go
  really slowly if the settings control is low - but if I ramp it up, I want
  it to evolve quickly." Before this the Evolve Speed dial barely touched the
  pace: every glide was held to 30–90 s whatever the dial, and the dial only
  shortened the rest and the glide by a fifth or so, so the whole travel of
  the dial was about one and a half times in moves a minute.

  Measured on Classic with a song, over half an hour at each setting, so the
  slowest still makes several moves. The dial is measured from the look's own
  Evolve Speed (Classic's is 0.15): there the pace is the one the checks
  above hold every look to.
*/
console.log('\nThe dial sets the pace');
{
  const RATES = [0.02, 0.05, 0.15, 0.3, 0.6, 1];
  const rows = RATES.map((rate) => {
    const r = run(look('classic'), (t, rr) => songEar(t, 0, rr), 1800, { rate });
    const g = r.moves.map(m => m.seconds);
    return {
      rate, r, perMin: r.moves.length / 30,
      gMean: g.reduce((a, b) => a + b, 0) / Math.max(1, g.length), gMin: Math.min(...g),
      restMin: r.rests.length ? Math.min(...r.rests) : Infinity,
      restMean: r.rests.length ? r.rests.reduce((a, b) => a + b, 0) / r.rests.length : Infinity,
    };
  });
  for (const w of rows) console.log(`   Evolve Speed ${String(Math.round(w.rate * 100)).padStart(3)}%: ${w.perMin.toFixed(2)} moves/min, glides ${w.gMin.toFixed(0)}–${Math.max(...w.r.moves.map(m => m.seconds)).toFixed(0)} s (mean ${w.gMean.toFixed(0)}), rests mean ${w.restMean.toFixed(0)} s, fastest dial ${(w.r.peak * 100).toFixed(2)} %/s`);
  const at = (rate) => rows.find(w => w.rate === rate);
  const lo = at(0.02), def = at(0.15), hi = at(1);
  const rising = rows.every((w, i) => i === 0 || w.perMin > rows[i - 1].perMin);
  check('every step up the dial makes more moves a minute',
    rising, rows.map(w => `${Math.round(w.rate * 100)}% ${w.perMin.toFixed(2)}`).join(', '));
  check('low on the dial it creeps: under half the moves of the default, each glide at least twice as long',
    lo.perMin * 2 <= def.perMin && lo.gMean >= 2 * def.gMean,
    `2%: ${lo.perMin.toFixed(2)} moves/min, glides ${lo.gMean.toFixed(0)} s; default: ${def.perMin.toFixed(2)}, ${def.gMean.toFixed(0)} s`);
  check('at full it evolves quickly: five times the moves of the default or more, glides a sixth as long or less',
    hi.perMin >= 5 * def.perMin && hi.gMean * 6 <= def.gMean,
    `full: ${hi.perMin.toFixed(2)} moves/min, glides ${hi.gMean.toFixed(0)} s; default: ${def.perMin.toFixed(2)}, ${def.gMean.toFixed(0)} s`);
  /*
    Each row held to its own pace's floors, not a floor for all: a rest of a
    single step at full speed would pass "a rest after each" and is not a
    rest (the check-skeptic's mutant did exactly that and passed).
  */
  const own = look('classic').automateRate;
  check(`and still one move at a time, each glide and rest at least its pace's shortest (rest never under ${REST_FLOOR} s)`,
    rows.every(w => {
      const p = evolvePace(w.rate, own);
      return w.r.moves.length >= 2 && w.r.overlap === 0 && w.gMin >= GLIDE_MIN * p - DT
        && w.restMin >= Math.max(REST_FLOOR, MIN_REST * p) - DT;
    }),
    rows.map(w => `${Math.round(w.rate * 100)}%: ${w.r.moves.length} moves, shortest glide ${w.gMin.toFixed(1)} s (floor ${(GLIDE_MIN * evolvePace(w.rate, own)).toFixed(1)}), rest ${w.restMin.toFixed(1)} s (floor ${Math.max(REST_FLOOR, MIN_REST * evolvePace(w.rate, own)).toFixed(1)}), ${w.r.overlap} overlapping`).join('; '));
  const palGap = (r) => r.palettes.reduce((m, p, i, a) => i ? Math.min(m, p.t - a[i - 1].t) : m, Infinity);
  /*
    App writes a glide twice a second, so at full speed a dial moves a
    couple of percent of its travel a write (PLAN 10-8d-2). Held to what it
    measured when the owner first saw it, so a change that makes it jumpier
    is seen here before it is seen on the wall.
  */
  check('at full, no dial moves faster than 5 % of its travel a second (2.5 % a write)',
    hi.r.peak <= 0.05, `fastest ${(hi.r.peak * 100).toFixed(2)} %/s`);
  /*
    The song above never drops closer than 51 s, so it cannot test a 20 s
    floor (the check-skeptic removed the floor and that version still
    passed). A drop every six seconds for four minutes can: the turns must
    come, and come no closer than 20 s, and the floor must be what holds
    them (the closest pair within 25 s of it).
  */
  const drops = (t) => ({ playing: true, section: 'steady', intensity: 0.8, tension: 0, lastDrop: Math.floor(t / 6) * 6, time: t, bpm: 124 });
  const flood = run(look('classic'), drops, 240, { rate: 1 });
  const gap = flood.palettes.reduce((m, p, i, a) => i ? Math.min(m, p.t - a[i - 1].t) : m, Infinity);
  check('the palette never turns twice in 20 s, even at full with a drop every six seconds',
    flood.palettes.length >= 4 && gap >= 20 - DT && gap <= 25,
    `${flood.palettes.length} turns in four minutes, closest two ${gap.toFixed(1)} s apart`);
}
{
  // Ramped up in the middle of a long rest, the next move comes at once, not
  // after the rest the low setting had planned. The control is the same run
  // left at 2%: its next move after the same moment must be the slow one, or
  // the turn is not what made the difference.
  const after = (turnTo) => {
    const ev = new SlowEvolve(makeRng(5, 'slowevolve').float);
    const base = look('classic');
    let first = null, low = 0;
    for (let t = 0; t < 1500; t += DT) {
      const out = ev.step(DT, silence(t), base, base, t < 600 ? 0.02 : turnTo);
      if (out.move && t < 600) low++;
      if (out.move && t >= 600 && first === null) first = t - 600;
    }
    return { first, low };
  };
  const { first: firstAfter, low: movedLow } = after(1);
  const { first: leftAlone } = after(0.02);
  check('turned up from low, it answers within half a minute, not when the slow rest would have ended',
    firstAfter !== null && firstAfter <= 30 && movedLow > 0 && (leftAlone === null || firstAfter * 8 <= leftAlone),
    `${movedLow} moves in ten minutes at 2%, then the first move ${firstAfter === null ? 'never' : firstAfter.toFixed(1) + ' s'} after the turn; left at 2%, ${leftAlone === null ? 'none in 15 min' : leftAlone.toFixed(1) + ' s'}`);
}

// ── The music steers it ─────────────────────────────────────────────
console.log('\nThe music steers it, over minutes');
{
  let lively = [], calm = [], cued = 0, rested = 0, stale = 0, palOk = true, palGap = Infinity, pals = 0;
  for (const [, anchor] of LOOKS) for (const seed of [1, 2, 3]) {
    const r = run(anchor, (t, rr) => songEar(t, 0, rr), songLength, { seed });
    for (const l of r.leans) {
      if (l.sinceDrop >= 5 && l.sinceDrop < 30) lively.push(l.lean);
      else if (l.section === 'breakdown' && l.t > 0) calm.push(l.lean);
    }
    for (const m of r.moves) if (m.resting && m.t > 1) {
      rested++;
      if (m.cue === 'clock') continue;
      cued++;
      // On the section it names, as it is heard (or once the rest has had its
      // six seconds): not one kept from a glide long over.
      if (m.cue === 'drop' ? !(m.sinceDrop <= MIN_REST + DT + 1e-9) : m.section !== m.cue) stale++;
    }
    let last = -Infinity;
    for (const p of r.palettes) {
      pals++;
      if (!(p.sinceDrop < 1 || p.section === 'breakdown')) palOk = false;
      palGap = Math.min(palGap, p.t - last); last = p.t;
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  check('livelier after a drop than through a breakdown',
    mean(lively) - mean(calm) >= 0.5, `lean ${mean(lively).toFixed(2)} after drops, ${mean(calm).toFixed(2)} in breakdowns`);
  check('a section change in a rest starts the next move then, on that section',
    rested > 0 && cued / rested >= 0.25 && stale === 0,
    `${cued} of ${rested} moves were cued by the song, ${stale} of them on a section already over`);
  check('the palette turns at a drop or a breakdown, never twice in 75 s',
    pals > 0 && palOk && palGap >= 75, `${pals} palette changes, the closest ${palGap.toFixed(0)} s apart`);
}
{
  const r = run(look('classic'), silence, 1800);
  const gaps = r.palettes.slice(1).map((p, i) => p.t - r.palettes[i].t);
  check('with no music the palette turns on a slow clock, every three to five minutes',
    r.palettes.length >= 5 && gaps.every(g => g >= 179 && g <= 301),
    `${r.palettes.length} in 30 min, ${gaps.map(g => g.toFixed(0)).join(', ')} s apart`);
  const ls = r.leans.map(l => l.lean);
  const range = Math.max(...ls) - Math.min(...ls);
  let flips = 0; for (let i = 120; i < ls.length; i += 120) if (Math.sign(ls[i]) !== Math.sign(ls[i - 120])) flips++;
  check('and the lean still wanders between calmer and livelier, on minutes',
    range >= 0.5 && flips >= 2, `lean from ${Math.min(...ls).toFixed(2)} to ${Math.max(...ls).toFixed(2)}, ${flips} sign changes a minute apart`);
}

// ── It does not bounce with the moment ──────────────────────────────
{
  const anchor = look('classic');
  const steady = run(anchor, (t, rr) => songEar(t, 0, rr), songLength);
  const shaken = run(anchor, (t, rr) => songEar(t, 0.3, rr), songLength);
  let worst = 0;
  for (let i = 0; i < steady.leans.length; i++) worst = Math.max(worst, Math.abs(steady.leans[i].lean - shaken.leans[i].lean));
  check('a level shaken ±0.3 every half second leans within a few hundredths of the steady one',
    worst <= 0.06, `worst difference ${worst.toFixed(3)} in lean over ${(songLength / 60).toFixed(0)} minutes`);
}

// ── Never what it must not touch ────────────────────────────────────
console.log('\nWhat it never touches');
{
  check('nothing that moves the whole picture is in any theme',
    THEMES.every(t => Object.keys(t.keys).every(k => !FRAME_MOTION.has(k))) && DRIFTABLE.every(k => !FRAME_MOTION.has(k)),
    `${FRAME_MOTION.size} frame-moving dials held out: ${[...FRAME_MOTION].join(', ')}`);
  // A look with every frame-moving dial up, a magnet placed, and some dials off.
  const anchor = { ...look('ferro-paint'), plateRock: 0.5, beatSqueeze: 0.5, kaleidoSpin: 0.2, lampMotion: 0.6, rotationSpeed: 0.3,
    magnetX: 0.2, magnetY: 0.8, cells: 0, lacing: 0, chemistry: 0, magnetWalk: 0 };
  let fromZero = 0, frame = 0, placed = 0, walked = false;
  for (const seed of [4, 5, 6, 7]) {
    const r = run(anchor, (t, rr) => songEar(t, 0, rr), 1800, { seed, rate: 1 });
    for (const k of r.touched) {
      if (anchor[k] === 0 && k !== 'magnetWalk') fromZero++;
      if (FRAME_MOTION.has(k)) frame++;
      if (k === 'magnetX' || k === 'magnetY') placed++;
      if (k === 'magnetWalk') walked = true;
    }
    for (const k of ['plateRock', 'beatSqueeze', 'kaleidoSpin', 'lampMotion', 'rotationSpeed', 'magnetX', 'magnetY'])
      if (r.end[k] !== anchor[k]) frame++;
  }
  check('never a dial the look switched off, never where the magnet sits, never the frame',
    fromZero === 0 && frame === 0 && placed === 0,
    `${fromZero} switched on, ${frame} frame-moving moved, ${placed} magnet placements, in two hours at full speed`);
  check('but it walks the magnet on a ferrofluid look that set no walk', walked);
  // And each dial stays within a fifth of its travel of the look.
  let worst = 0;
  const r = run(look('classic'), silence, 3600, { rate: 1 });
  for (const h of r.hist) for (const k of DRIFTABLE) {
    if (typeof h[k] === 'number' && typeof r.base[k] === 'number') worst = Math.max(worst, Math.abs(h[k] - r.base[k]) / span(k));
  }
  check('every dial stays within a fifth of its travel of the look, over an hour at full speed',
    worst <= 0.2 + 1e-9, `furthest ${(worst * 100).toFixed(1)} % of its travel`);
}

// ── The closeup camera drifts slowly, if at all ─────────────────────
{
  const r = run(look('classic'), (t, rr) => songEar(t, 0, rr), 600, { rate: 1, extra: { macroMode: true, macroZoom: 3, macroCamera: 'hold' } });
  const aimed = r.moves.filter(m => m.aim).length;
  // And it does move: the furthest step of a move at least half its reach at this pace.
  const reach = AIM_STEP * Math.min(1, evolvePace(1, look('classic').automateRate));
  const furthest = Math.max(0, ...r.moves.map(m => m.aimStep));
  check('the closeup\'s aim wanders a short way over each whole move, no faster at full than the default allows',
    aimed === r.moves.length && aimed > 0 && r.aimPeak <= 0.004 && furthest >= reach / 2,
    `${aimed} of ${r.moves.length} moves aimed it, fastest ${(r.aimPeak * 1000).toFixed(2)} thousandths of the plate a second, furthest step ${(furthest * 1000).toFixed(1)} thousandths (reach ${(reach * 1000).toFixed(1)})`);
  const auto = run(look('classic'), silence, 600, { extra: { macroMode: true, macroZoom: 3, macroCamera: 'auto' } });
  check('and leaves an Auto camera to itself', auto.moves.every(m => !m.aim));
}

// ── The same seed, the same moves ───────────────────────────────────
{
  const a = run(look('classic'), (t, rr) => songEar(t, 0, rr), 600);
  const b = run(look('classic'), (t, rr) => songEar(t, 0, rr), 600);
  const c = run(look('classic'), (t, rr) => songEar(t, 0, rr), 600, { seed: 99 });
  const sig = (r) => JSON.stringify(r.moves.map(m => [m.t, m.theme, m.to]));
  check('the same seed plans the same moves, another seed others', sig(a) === sig(b) && sig(a) !== sig(c));
}

// ── The pieces are connected ────────────────────────────────────────
console.log('\nThe pieces are connected');
{
  const app = readFileSync('src/App.tsx', 'utf8');
  check('App drives the planner and glides its moves', /new SlowEvolve\(/.test(app) && /\.step\(/.test(app) && /evolvePalette/.test(app));
  // A glide lasts up to 90 s, so a look laid, opened, faded to or taken back must stop it.
  const lets = ['const applyPreset', 'const applyUserPreset', 'const fadeSettingsTo', 'const revertLook'].filter(f => {
    const at = app.indexOf(f);
    return at > 0 && app.slice(at, at + 1500).includes('evolveLetsGo();');
  });
  check('a new look stops the move in flight', lets.length === 4, `${lets.length} of 4 ways to change the look let go`);
  const viz = readFileSync('src/components/LiquidVisualizer.tsx', 'utf8');
  const start = viz.indexOf('// ── Automation logic');
  const end = viz.indexOf('The hue journey: a set drifts', start);
  const hands = (start > 0 && end > start ? viz.slice(start, end) : '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  check('the plate\'s hands do not read the frame\'s energy, treble or centroid',
    hands.length > 0 && !/currentAudioData/.test(hands) && !/spectralCentroid|treble/.test(hands),
    hands.length ? '' : 'automation block not found');
  check('they read the song\'s level over half a minute and its section', /evolveLoud/.test(hands) && /section/.test(hands));
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
