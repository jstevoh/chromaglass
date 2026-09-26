#!/usr/bin/env node
/**
 * Do the closeup's cells ride the paint, and hold still while they do it?
 *
 *   npm run cellride
 *
 * Reported: in macro zoom at about 6x everything starts to jitter, and past
 * it the frame practically vibrates. 6x is where the closeup's drawn detail
 * is big enough to see (the coarse cells resolve from 2.5x, the fine cells
 * from 6x, the lacing from 4x and whole by 9x), and that detail moves by a rule no still can
 * show: `cellField` in the plate shader slides its pattern by
 *
 *     flow × u_flowRate × fract(clock / period) × period
 *
 * the local flow times everything the current generation has lived. The
 * clock used to be the plate's (`U.time`) and `u_flowRate` was worked out
 * from each frame's measured time, so every uneven frame moved every cell by
 * that share of its whole slide. Now the clock is the lead plate's own dye
 * travel, advanced once a solver step (`advanceCellClock`), and `u_flowRate`
 * is the constant that turns it back into distance (lib/detailFlow.ts).
 *
 * What is checked, with the real functions the solver and the plate use:
 *
 *   1. Frame to frame, each generation of cells moves exactly as far as the
 *      paint under it did that frame, whatever the frames and the loop did:
 *      frame-time noise, dropped frames, 120 and 144 Hz, 20 and 30 fps with
 *      the loop's catch-up cap biting, the governor's lower step rate, the
 *      music's tempo slewing, the phrase's lean wandering, and a Speed
 *      fader pulled to nothing and back. This is the vibration, in pixels
 *      on a 1440 px frame at 6x.
 *   2. The clock runs straight through its wrap, and keeps its precision as
 *      a 32-bit uniform however long the show runs.
 *   3. At the default Advection the cells breathe at the pace they did, and
 *      faster in proportion to a faster pour.
 *   4. Packing the flow for the plate adds no rounding to the solver's own,
 *      and does not turn the lacing (drawn along the flow's direction) where
 *      the paint is nearly still.
 *
 * The show loop itself lives in a component that needs a GPU, so the loop
 * around those functions is a copy of its arithmetic, named by where it
 * lives in LiquidVisualizer.tsx: the Speed to `dynamicSpeed`, and the
 * tempo's slew, in the frame; the fixed-step accumulator and its catch-up
 * cap ("How many solver steps this frame owes"); and the step's `dt`, with
 * the lean and the clamp (FluidSimulation.step). The paint's travel is the
 * step's displacement times the velocity, summed; the cells' is read off the
 * shader's formula in 32 bits. What the owner sees at 60 fps is still for
 * the Mac.
 */
import { CELL_TRAVEL, CELL_CLOCK_WRAP, DT_FLOOR, advanceCellClock, stepDisplacement } from '../src/lib/detailFlow.ts';
import { PACKED_VEL_FORMAT, SOLVER_VEL_FORMAT } from '../src/gpu/wgsl/pack.ts';
import { readFileSync } from 'node:fs';

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const PLATE_WGSL = source('src/gpu/wgsl/plate.ts');
const PACK_WGSL = source('src/gpu/wgsl/pack.ts');
const SHOW = source('src/components/LiquidVisualizer.tsx');

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const note = (text) => console.log(`      ${text}`);

// ── The frame ─────────────────────────────────────────────────────────
// `uvToFluid` in the plate shader: one plate-uv is 1.5 × the long side ×
// the zoom in pixels.
const WIDTH = 1440;
const ZOOM = 6;
const PX_PER_UV = 1.5 * WIDTH * ZOOM;
const GRID = 192;                 // GRID_SIZE in LiquidVisualizer
/**
 * Every `cellField(...)` call in the shader, period, phase and the clock it
 * is timed on, read off the source: a period changed there is a period
 * checked here. The closeup's generations are the ones on the cell clock;
 * the plate's own cells keep the plate's clock (they breathe at 1x as they
 * did, and only slide once the closeup is on).
 */
const CALLS = [...PLATE_WGSL.matchAll(/cellField\([^;]*?,\s*([\d.]+),\s*([\d.]+),\s*[\d.]+,\s*(U\.\w+)\)\s*;/g)]
  .map(m => ({ period: Number(m[1]), phase: Number(m[2]), clock: m[3] }));
const GENERATIONS = CALLS.filter(c => c.clock === 'U.cellClock').map(c => [c.period, c.phase]);
/** How fast the fastest paint in the frame crosses it: half the frame a second. */
const PAINT_PX_PER_S = WIDTH / 2;
const ADVECTION = 0.45;   // the default Advection

/** A seeded stream, so a red run is the same run twice. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `dynamicSpeed` from the Speed slider, as the frame works it out with the
 * default Plate Pressure (0.4), Air (0) and Automate Rate (0.12): a base,
 * times Speed over 0.05, squared below it.
 */
const dynamicOf = (globalSpeed) => {
  let m = globalSpeed / 0.05;
  if (m < 1) m *= m;
  return (0.05 + 0.4 * 0.02 + 0.12 * 0.01) * m;
};
/** FluidSimulation.step's `dt`, clamped as it clamps it. */
const dtOf = (dynamicSpeed, stepSeconds) => {
  const want = dynamicSpeed * 0.2 * (stepSeconds * 60);
  return Number.isFinite(want) ? Math.min(Math.max(want, DT_FLOOR), 0.05) : DT_FLOOR;
};
/** A velocity, in solver units, whose paint crosses PAINT_PX_PER_S at this Speed. */
const velocityFor = (dynamicSpeed, stepRate) =>
  (PAINT_PX_PER_S / PX_PER_UV) / (stepDisplacement(dtOf(dynamicSpeed, 1 / stepRate), ADVECTION, GRID) * stepRate);

/** Frame times for `seconds`: timing noise either way, and a dropped frame every so many. */
function frames(hz, seconds, { noiseMs = 0, dropEvery = 0, seed = 1 } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < Math.round(hz * seconds); i++) {
    let dt = 1 / hz + (r() * 2 - 1) * noiseMs / 1000;
    if (dropEvery && i % dropEvery === dropEvery - 1) dt += 1 / hz;
    out.push(Math.max(0.001, dt));
  }
  return out;
}

/**
 * One run of the loop at one velocity, the tempo slewing and the lean
 * wandering throughout: per frame, how far the paint went and where each
 * generation of cells sits.
 */
function run(dts, { speedAt, stepRate, velocity, clock0 = 0 }) {
  const stepSeconds = 1 / stepRate;
  let acc = 0, wall = 0, paint = 0, clock = clock0, tempo = 1, lean = 1, frameMs = 1000 / 60;
  const rows = [];
  for (const realDt of dts) {
    wall += realDt;
    // The music's pace, slewed over three seconds (the frame's tempoMulRef):
    // a new song asks for half as fast again, then a slow one.
    const want = wall < 2 ? 1 : wall < 6 ? 1.5 : 0.8;
    tempo += (want - tempo) * (1 - Math.exp(-realDt / 3));
    const dynamicSpeed = dynamicOf(speedAt(wall)) * tempo;
    // The catch-up cap, from the governor's frame interval.
    frameMs += (realDt * 1000 - frameMs) * 0.1;
    const catchUp = frameMs > 40 ? 1 : frameMs > 24 ? 2 : 4;
    acc = Math.min(acc + realDt, stepSeconds * catchUp);
    const steps = Math.floor(acc / stepSeconds);
    acc -= steps * stepSeconds;
    let moved = 0;
    for (let k = 0; k < steps; k++) {
      // The phrase's lean, slewed on seconds (FluidSimulation.step): it
      // changes the dye's speed and not the plate's clock.
      const leanWant = 1 + 0.25 * Math.sin(wall / 1.3);
      lean += (leanWant - lean) * (1 - Math.exp(-stepSeconds / 2.5));
      const disp = stepDisplacement(dtOf(dynamicSpeed * lean, stepSeconds), ADVECTION, GRID);
      moved += velocity * disp;
      clock = advanceCellClock(clock, disp);
    }
    paint += moved;
    // What the shader draws from, in 32 bits.
    const c32 = Math.fround(clock);
    const flow = velocity * Math.fround(CELL_TRAVEL);
    const gens = GENERATIONS.map(([period, phase]) => {
      const a = Math.fround(Math.fround(c32 / Math.fround(period)) + phase);
      const f = a - Math.floor(a);
      return { a: f, offset: flow * f * period };
    });
    if (!Number.isFinite(paint) || !Number.isFinite(clock) || gens.some(g => !Number.isFinite(g.offset))) {
      throw new Error(`not a number at ${wall.toFixed(3)} s: paint ${paint}, clock ${clock}`);
    }
    rows.push({ wall, moved, paint, clock, gens });
  }
  return rows;
}

const SPEEDS = [
  // Most presets sit between 0.008 and 0.016, where a cell generation lives
  // fifteen to sixty seconds of wall time.
  { name: 'Speed 0.008', at: () => 0.008 },
  { name: 'Speed 0.015 (default)', at: () => 0.015 },
  { name: 'Speed 0.07', at: () => 0.07 },
  // The top of the slider: dt clamps at 0.05.
  { name: 'Speed 0.3', at: () => 0.3 },
  // A MIDI fader pulled to nothing and back over ten seconds: Speed is
  // 0-0.3 on a cubic curve (lib/midi.ts), so the bottom notches put dt on
  // its floor, where a rate divided by the plate's clock swelled 63-fold.
  { name: 'Speed pulled to 0 and back', at: (t) => 0.3 * (Math.abs(((t / 10) % 1) * 2 - 1)) ** 3 },
];
const PATTERNS = [
  { name: '60 fps, steady', hz: 60 },
  { name: '60 fps, a millisecond of timing noise', hz: 60, noiseMs: 1 },
  { name: '60 fps, a dropped frame a second', hz: 60, noiseMs: 0.5, dropEvery: 60 },
  { name: '120 Hz', hz: 120, noiseMs: 0.5 },
  { name: '120 Hz, a dropped frame a second', hz: 120, noiseMs: 0.5, dropEvery: 120 },
  { name: '144 Hz', hz: 144, noiseMs: 0.5 },
  { name: '30 fps', hz: 30, noiseMs: 1 },
  { name: '20 fps, the catch-up cap biting', hz: 20, noiseMs: 3 },
  { name: '60 fps, the governor at 45 steps', hz: 60, noiseMs: 1, stepRate: 45 },
];

// ── 0. The wiring ─────────────────────────────────────────────────────
// Everything below drives the real functions through a copy of the loop,
// and a copy cannot see the app stop calling them. So first, that it does:
// read off the sources, since the show loop needs a GPU to run.
{
  const cell = /fn cellField\([^]*?\n}\n/.exec(PLATE_WGSL)?.[0] ?? '';
  check('the closeup\'s four generations of cells are timed on the cell clock, and nothing else in them is',
    GENERATIONS.length === 4 && CALLS.length >= 6 && /fract\(clock \/ period \+ phase\)/.test(cell) && !/U\.time|U\.cellClock/.test(cell),
    `${CALLS.map(c => `${c.period}/${c.phase} on ${c.clock}`).join(', ')}`);
  const flow = /fn fluidFlow\([^]*?\n}\n/.exec(PLATE_WGSL)?.[0] ?? '';
  const packVel = /packVel:[^]*?`,/.exec(PACK_WGSL)?.[0] ?? '';
  check('the flow reaches the shader in the solver\'s own units, packed raw and read back raw',
    /return tex2\(vtex, fuv\)\.rg \* U\.flowRate;/.test(flow)
      && /textureLoad\(vel, vec2i\(id\.xy\), 0\)\.xy;/.test(packVel) && !/0\.5 \+ 0\.5|velRange/.test(packVel));
  const step = /const p = this\.deriveStep\([^]*?this\.gpu\.step\(p/.exec(SHOW)?.[0] ?? '';
  check('every solver step advances the lead plate\'s cell clock by the dye\'s own travel, before it runs',
    /this\.cellClock = advanceCellClock\(this\.cellClock, stepDisplacement\(p\.dt, p\.advection, /.test(step));
  check('and the frame hands the shader that clock and a constant rate, nothing measured from a frame',
    /const flowRate = macroOn \? CELL_TRAVEL : 0;/.test(SHOW) && /const cellClock = fluidsRef\.current\[0\]\?\.cellClock \?\? 0;/.test(SHOW)
      && /pack\.set\('cellClock', view\.cellClock/.test(source('src/gpu/plateUniforms.ts')));
}

// ── 1. Riding the paint, frame by frame ────────────────────────────────
{
  let worst = 0, worstAt = '', fewest = Infinity, fewestAt = '';
  for (const speed of SPEEDS) {
    for (const p of PATTERNS) {
      const stepRate = p.stepRate ?? 60;
      // The fastest paint crossing half the frame a second at this Speed
      // (at the fader's top, where it starts).
      const velocity = velocityFor(dynamicOf(speed.at(0)), stepRate);
      // Started mid-generation, so the slow Speeds, where a generation
      // lives a minute, have frames to measure at all.
      const rows = run(frames(p.hz, 12, { noiseMs: p.noiseMs, dropEvery: p.dropEvery, seed: 7 }),
        { speedAt: speed.at, stepRate, velocity, clock0: 0.8 });
      let measured = 0;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i], q = rows[i - 1];
        for (let g = 0; g < GENERATIONS.length; g++) {
          const now = r.gens[g], was = q.gens[g];
          if (now.a < was.a) continue;                          // a new generation
          if (Math.sin(Math.PI * now.a) ** 2 < 0.5) continue;   // less than half there
          const px = Math.abs((now.offset - was.offset) - r.moved) * PX_PER_UV;
          measured++;
          if (!(px <= worst)) { worst = px; worstAt = `${speed.name}, ${p.name}`; }
        }
      }
      if (measured < fewest) { fewest = measured; fewestAt = `${speed.name}, ${p.name}`; }
    }
  }
  check('every frame rate and Speed had frames to measure, with the cells more than half there',
    fewest >= 100, `fewest ${fewest} (${fewestAt})`);
  check('on steady paint, from one frame to the next the lead plate\'s cells move exactly as far as the paint under them did',
    worst < 0.05, `worst ${worst.toFixed(3)} px a frame off the paint at ${ZOOM}x on a ${WIDTH} px frame (${worstAt || 'none'})`);
}

// ── 2. The clock's wrap and its precision ─────────────────────────────
{
  // At the top Speed the clock wraps every quarter of a minute: a minute
  // of it, with each generation's phase against the same clock unwrapped.
  const steps = 60 * 60;
  let clock = 0, whole = 0, wraps = 0, worst = 0;
  const disp = stepDisplacement(dtOf(dynamicOf(0.3), 1 / 60), ADVECTION, GRID);
  for (let i = 0; i < steps; i++) {
    const before = clock;
    clock = advanceCellClock(clock, disp);
    whole += disp / CELL_TRAVEL;
    if (clock < before) wraps++;
    for (const [period, phase] of GENERATIONS) {
      const f = (x) => { const a = x / period + phase; return a - Math.floor(a); };
      let d = Math.abs(f(clock) - f(whole));
      d = Math.min(d, 1 - d);
      if (!(d <= worst)) worst = d;
    }
  }
  const indivisible = GENERATIONS.filter(([period]) => Math.abs(CELL_CLOCK_WRAP / period - Math.round(CELL_CLOCK_WRAP / period)) > 1e-9);
  check(`every period the shader draws divides the wrap (${CELL_CLOCK_WRAP})`,
    GENERATIONS.length > 0 && indivisible.length === 0, indivisible.length ? `not ${indivisible.map(g => g[0]).join(', ')}` : '');
  check('the cell clock runs straight through its wrap for every generation',
    wraps >= 2 && worst < 1e-9, `${wraps} wraps in a minute at Speed 0.3, phases off by at most ${worst.toExponential(1)}`);

  // Its precision as a 32-bit uniform: the most a rounding of the clock can
  // move a generation, on the fastest paint at the default Speed.
  const velocity = velocityFor(dynamicOf(0.015), 60);
  const toPx = (clockError) => clockError * velocity * CELL_TRAVEL * PX_PER_UV;
  let wrapped = 0;
  for (let c = 0; c < CELL_CLOCK_WRAP; c += 0.0137) wrapped = Math.max(wrapped, toPx(Math.abs(Math.fround(c) - c)));
  // Against a clock left to run: the plate's, four hours into a show.
  const hours4 = 4 * 3600 * dynamicOf(0.015) * 20;
  const halfUlp = 2 ** (Math.floor(Math.log2(hours4)) - 24);
  check('and holds its place to a small part of a pixel however long the show has run',
    wrapped < 0.05, `at most ${wrapped.toFixed(4)} px at ${ZOOM}x; a clock left to run four hours (${hours4.toFixed(0)} plate-seconds) rounds by up to ${toPx(halfUlp).toFixed(2)} px`);
}

// ── 3. The breathing ───────────────────────────────────────────────────
{
  // At the default Advection, lean and tempo at one, the cell clock keeps
  // time with the plate's (`U.time`, advancing by realDt × timeMultiplier,
  // timeMultiplier being dynamicSpeed × 20).
  const stepSeconds = 1 / 60;
  const dynamicSpeed = dynamicOf(0.015);
  const perStep = stepDisplacement(dtOf(dynamicSpeed, stepSeconds), ADVECTION, GRID) / CELL_TRAVEL;
  const ratio = perStep / (stepSeconds * dynamicSpeed * 20);
  check('at the default Advection the cells breathe at the pace they did on the plate\'s clock',
    Math.abs(ratio - 1) < 0.02, `${ratio.toFixed(4)}× (the grid's edge is the difference)`);
  // And a faster pour cycles faster, in proportion: twice the Advection is
  // twice the dye's travel, and twice the pace.
  const twice = stepDisplacement(dtOf(dynamicSpeed, stepSeconds), 0.9, GRID) / CELL_TRAVEL / (stepSeconds * dynamicSpeed * 20);
  check('and at twice the Advection twice as fast, as the dye goes',
    Math.abs(twice / ratio - 2) < 0.01, `${(twice / ratio).toFixed(3)}×`);
}

// ── 4. Packing the flow ────────────────────────────────────────────────
const f16 = (x) => {
  if (typeof Math.f16round === 'function') return Math.f16round(x);
  // Eleven significant bits, which is what half float keeps in its range.
  if (x === 0 || !Number.isFinite(x)) return x;
  const q = 2 ** (Math.floor(Math.log2(Math.abs(x))) - 10);
  return Math.round(x / q) * q;
};
/** A velocity through a format: `range` is the peak the old packing was encoded against. */
const through = (format, v, range) => {
  switch (format) {
    case 'rg32float': case 'rgba32float': return Math.fround(v);
    case 'rgba16float': return f16(v);
    // The old packing: offset into unorm against the frame's peak.
    case 'rgba8unorm': return (Math.round(Math.max(0, Math.min(1, v / range * 0.5 + 0.5)) * 255) / 255 * 2 - 1) * range;
    default: return NaN;
  }
};
check(`the formats are ones this check knows how to round (solver ${SOLVER_VEL_FORMAT}, packed ${PACKED_VEL_FORMAT})`,
  Number.isFinite(through(SOLVER_VEL_FORMAT, 0.3, 1)) && Number.isFinite(through(PACKED_VEL_FORMAT, 0.3, 1)));
const chain = (v, range) => through(PACKED_VEL_FORMAT, through(SOLVER_VEL_FORMAT, v, range), range);
{
  // The peak of a sparse sample of a moving field wanders a few percent a
  // frame, which is what the old packing was re-rounded against.
  const r = rng(11);
  let lost = 0, lostAt = '';
  for (const share of [1, 0.5, 0.1, 0.01, 0.001]) {
    for (let k = 0; k < 400; k++) {
      const v = share * (0.5 + r()) * (r() < 0.5 ? -1 : 1);
      const range = 1 + (r() * 2 - 1) * 0.03;
      const solver = through(SOLVER_VEL_FORMAT, v, range);
      const err = Math.abs(chain(v, range) - solver) / Math.max(Math.abs(solver), 1e-12);
      if (!(err <= lost)) { lost = err; lostAt = `paint at ${share * 100}% of the peak`; }
    }
  }
  check('packing the flow for the plate adds no rounding to the solver\'s own',
    lost === 0, lost === 0 ? 'identical, value for value' : `off by up to ${(lost * 100).toFixed(1)}% of the flow (${lostAt})`);
}
{
  // The lacing is noise stretched 9:1 along the flow's direction at each
  // pixel (`normalize(flow)` in macroDetail), from 4x and whole by 9x.
  const r = rng(13);
  let worst = 0, worstAt = '';
  for (const share of [0.01, 0.001]) {
    let angle = 0.3, range = 1;
    const dirOf = (a, rg) => Math.atan2(chain(Math.sin(a) * share, rg), chain(Math.cos(a) * share, rg));
    let last = dirOf(angle, range);
    for (let step = 0; step < 600; step++) {
      angle += 0.002;   // the flow itself turning a tenth of a degree a step
      range = 1 + (r() * 2 - 1) * 0.03;
      const now = dirOf(angle, range);
      let turn = Math.abs(now - last - 0.002);
      if (turn > Math.PI) turn = 2 * Math.PI - turn;
      const deg = turn * 180 / Math.PI;
      if (!(deg <= worst)) { worst = deg; worstAt = `paint at ${share * 100}% of the peak`; }
      last = now;
    }
  }
  check('the lacing turns only as the flow turns, even where the paint is nearly still',
    worst < 0.5, `worst ${worst.toFixed(2)}° a step beyond the flow's own turn (${worstAt || 'none'})`);
}
{
  // Not asserted: what the solver's own half float still does. A changing
  // flow crosses its steps, one part in a thousand or two, and each crossing hops
  // the cells by that part of their slide.
  const velocity = velocityFor(dynamicOf(0.015), 60);
  const age = 0.75 * 3.2;   // where a generation is half faded out
  let worst = 0;
  let v = velocity, last = through(SOLVER_VEL_FORMAT, v, 1);
  for (let step = 0; step < 2000; step++) {
    const before = v;
    v *= 1 + 0.0005 * Math.sin(step / 40);
    const now = through(SOLVER_VEL_FORMAT, v, 1);
    worst = Math.max(worst, Math.abs((now - last) - (v - before)) * CELL_TRAVEL * age * PX_PER_UV);
    last = now;
  }
  note(`the solver's own ${SOLVER_VEL_FORMAT} still rounds a changing flow: on the fastest paint (${(PAINT_PX_PER_S / 60).toFixed(0)} px a frame at 60 fps) a crossing hops the cells up to ${worst.toFixed(1)} px`);
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
