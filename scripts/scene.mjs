#!/usr/bin/env node
/**
 * Does the room sensor read the room, and what does it cost?
 *
 * `sceneSense` is deliberately free of the DOM, so it can be driven by frames
 * this script paints rather than by a camera and a venue. Judged by numbers
 * here, the same way `detail.mjs` judges the plate, because "it seemed to
 * react" is not a gate anyone can hold a change to.
 *
 *   node scripts/scene.mjs
 *
 * Five rooms, each 40 frames at 20 Hz:
 *
 *   still     nobody there, sensor noise only        → energy near 0, no flow
 *   sweep     a bar crossing left to right           → flow points right
 *   rise      a bar crossing bottom to top           → flow points up
 *   walker    one figure crossing the frame          → one id, held throughout
 *   strobe    the whole frame flashing, nobody there → not mistaken for motion
 *
 * Then the coupling, on a plate that is just the velocity field the solver would
 * have been handed, damped the way a viscous solver damps:
 *
 *   a camera on itself   a closed loop — the bar on screen is carried by the
 *                        plate's own velocity — run for forty seconds to show
 *                        whether it finds a ceiling or keeps climbing
 *   a fan in the corner  motion that repeats but is nobody's doing
 *   one wave             a single gesture: how fast it arrives, how far it gets
 *
 * Exits non-zero if any of them fails, so it can stand in a check.
 */

import { SceneSense } from '../src/lib/sceneSense.ts';
import { RoomStir } from '../src/lib/roomStir.ts';

const N = 96;
const FRAMES = 40;
const DT = 1 / 20;
const OPTS = { deadzone: 0.25, smooth: 0.2, people: true };

/** A frame of flat grey with a little sensor noise, as RGBA. */
function room(seed) {
  const px = new Uint8ClampedArray(N * N * 4);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < N * N; i++) {
    const v = 72 + rnd() * 4;
    px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
  }
  return px;
}

/** Paint a filled rectangle in frame coordinates (0..1). */
function box(px, x0, y0, w, h, value) {
  const a = Math.max(0, Math.round(x0 * N)), b = Math.min(N, Math.round((x0 + w) * N));
  const c = Math.max(0, Math.round(y0 * N)), d = Math.min(N, Math.round((y0 + h) * N));
  for (let y = c; y < d; y++) {
    for (let x = a; x < b; x++) {
      const i = (y * N + x) * 4;
      px[i] = value; px[i + 1] = value; px[i + 2] = value;
    }
  }
}

/** Mean flow over the cells actually carrying motion. */
function meanFlow(r) {
  let fx = 0, fy = 0, w = 0;
  for (let c = 0; c < r.lattice * r.lattice; c++) {
    const m = r.motion[c];
    if (m <= 0) continue;
    fx += r.flowX[c] * m; fy += r.flowY[c] * m; w += m;
  }
  return w > 0 ? { x: fx / w, y: fy / w } : { x: 0, y: 0 };
}

function run(name, paint) {
  const sense = new SceneSense();
  let energy = 0, flow = { x: 0, y: 0 }, ms = 0, samples = 0;
  const ids = new Map();
  let people = 0;

  for (let f = 0; f < FRAMES; f++) {
    const px = room(f * 7919 + 13);
    paint(px, f / (FRAMES - 1), f);
    const r = sense.push(px, N, N, DT, f * DT * 1000, OPTS);
    if (!r.ready) continue;
    // The first frames are the background model settling; judge the rest.
    if (f < FRAMES * 0.25) continue;
    energy += r.energy;
    const mf = meanFlow(r);
    flow.x += mf.x; flow.y += mf.y;
    ms += r.ms;
    samples++;
    people = Math.max(people, r.people.length);
    for (const p of r.people) ids.set(p.id, (ids.get(p.id) ?? 0) + 1);
  }

  const held = Math.max(0, ...ids.values());
  return {
    name,
    energy: energy / samples,
    fx: flow.x / samples,
    fy: flow.y / samples,
    ms: ms / samples,
    people,
    ids: ids.size,
    /** The longest run of frames one id survived, as a share of the frames judged. */
    hold: held / samples,
  };
}

const BAR = 0.16;
const results = [
  run('still', () => {}),
  run('sweep', (px, t) => box(px, -BAR + t * (1 + BAR), 0.2, BAR, 0.6, 210)),
  run('rise', (px, t) => box(px, 0.2, 1 - t * (1 + BAR), 0.6, BAR, 210)),
  run('walker', (px, t) => box(px, -0.12 + t * 1.1, 0.35, 0.12, 0.42, 200)),
  run('strobe', (px, _t, f) => { if (f % 2 === 0) box(px, 0, 0, 1, 1, 150); }),
];

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 2) => (v >= 0 ? ' ' : '') + v.toFixed(n);
console.log(`${pad('room', 8)} ${pad('energy', 7)} ${pad('flow x', 7)} ${pad('flow y', 7)} ${pad('people', 7)} ${pad('ids', 4)} ${pad('hold', 6)} ms`);
for (const r of results) {
  console.log(
    `${pad(r.name, 8)} ${pad(num(r.energy), 7)} ${pad(num(r.fx), 7)} ${pad(num(r.fy), 7)} ` +
    `${pad(r.people, 7)} ${pad(r.ids, 4)} ${pad(num(r.hold), 6)} ${r.ms.toFixed(2)}`,
  );
}

// ── The coupling ────────────────────────────────────────────────────
//
// What reaches the liquid, and whether a camera pointed at the screen can
// build on itself. The plate here is the velocity field the solver would have
// been handed, at 48² rather than 192², damped each step the way a viscous
// solver damps: what is being measured is the coupling, not the solve.
const PLATE = 48;
const SIM_STEP = 1 / 60;
const STEPS = 3;
/** How much of its speed the plate keeps from one solver step to the next. */
const DAMPING = 0.985;

function plateRun(paint, seconds, { drive = 1 } = {}) {
  const sense = new SceneSense();
  const stir = new RoomStir(24);
  const vx = new Float32Array(PLATE * PLATE), vy = new Float32Array(PLATE * PLATE);
  const add = [new Float32Array(PLATE * PLATE), new Float32Array(PLATE * PLATE)];
  const frames = Math.round(seconds / DT);
  const trace = [];
  let state = { meanVx: 0 };

  for (let f = 0; f < frames; f++) {
    const px = room(f * 7919 + 13);
    paint(px, f / (frames - 1), f, state);
    const r = sense.push(px, N, N, DT, f * DT * 1000, OPTS);
    if (!r.ready) continue;

    for (let k = 0; k < STEPS; k++) {
      add[0].fill(0); add[1].fill(0);
      stir.apply(add[0], add[1], PLATE, r, drive, SIM_STEP);
      for (let i = 0; i < vx.length; i++) {
        vx[i] = vx[i] * DAMPING + add[0][i];
        vy[i] = vy[i] * DAMPING + add[1][i];
      }
    }

    let sum = 0, sx = 0;
    for (let i = 0; i < vx.length; i++) { sum += Math.hypot(vx[i], vy[i]); sx += vx[i]; }
    state = { meanVx: sx / vx.length };
    trace.push({ t: f * DT, speed: sum / vx.length });
  }
  return trace;
}

/**
 * The camera pointed at the projection. The bar on screen is not on a clock:
 * it is carried by the plate's own velocity, which is what makes this a loop
 * rather than a moving picture.
 */
const mirrorBar = () => {
  let x = 0.1;
  return (px, _t, f, state) => {
    // A loop needs something to have happened first. For the opening half
    // second the bar moves on its own — someone walked past — and after that
    // it is carried only by the plate.
    const t = f * DT;
    x += t < 0.6 ? 0.9 * DT : (state?.meanVx ?? 0) * 900 * DT;
    if (x > 1) x -= 1 + BAR;
    if (x < -BAR) x += 1 + BAR;
    box(px, x, 0.3, BAR, 0.4, 210);
  };
};

/** A bar going round on its own clock — a fan, an escalator, a passing car. */
const carousel = (px, _t, f) => box(px, ((f * DT) % 1.0) * 0.85, 0.3, BAR, 0.4, 210);
/** One wave of an arm, then nothing. */
const wave = (px, _t, f) => {
  const t = f * DT;
  if (t < 0.4) box(px, 0.1 + (t / 0.4) * 0.7, 0.3, BAR, 0.4, 210);
};

// Forty seconds of closed loop: long enough to tell a ceiling from a climb.
const LOOP_SECONDS = 40;
const loopTrace = plateRun(mirrorBar(), LOOP_SECONDS);
const carouselTrace = plateRun(carousel, 16);
const waveTrace = plateRun(wave, 1.2);

const mean = (a) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const slice = (tr, from, to, key = 'speed') => mean(tr.filter(p => p.t >= from && p.t < to).map(p => p[key]));
const loopEarly = slice(loopTrace, 1, 4);
const loopMid = slice(loopTrace, 18, 26);
const loopLate = slice(loopTrace, 32, 40);
const carEarly = slice(carouselTrace, 1, 4), carLate = slice(carouselTrace, 12, 16);
const waveOnset = waveTrace.find(p => p.speed > 0.01);
const wavePeak = Math.max(...waveTrace.map(p => p.speed));

console.log('');
console.log(`${pad('the plate, driven by', 24)} ${pad('opening', 10)} ${pad('middle', 10)} ${pad('end', 10)} still climbing?`);
const row = (name, a, b, c) =>
  console.log(`${pad(name, 24)} ${pad(a.toFixed(4), 10)} ${pad(b.toFixed(4), 10)} ${pad(c.toFixed(4), 10)} ${(c / b).toFixed(2)}x`);
row('a camera on itself', loopEarly, loopMid, loopLate);
row('a fan in the corner', carEarly, (carEarly + carLate) / 2, carLate);
console.log(`one wave               reaches the plate after ${waveOnset ? `${(waveOnset.t * 1000).toFixed(0)} ms` : 'never'}, peak ${wavePeak.toFixed(4)}`);

const by = Object.fromEntries(results.map(r => [r.name, r]));
const checks = [
  ['a still room reads as still', by.still.energy < 0.25],
  ['a still room has no flow', Math.abs(by.still.fx) < 0.05 && Math.abs(by.still.fy) < 0.05],
  ['a sweep reads as motion', by.sweep.energy > 0.4],
  ['a sweep points right', by.sweep.fx > 0.08 && by.sweep.fx > Math.abs(by.sweep.fy) * 2],
  ['a rise points up', by.rise.fy < -0.08 && Math.abs(by.rise.fy) > Math.abs(by.rise.fx) * 2],
  ['a walker is one person', by.walker.people === 1],
  ['a walker keeps one id', by.walker.ids <= 2 && by.walker.hold > 0.7],
  ['a strobe is not a crowd', by.strobe.people <= 1],
  ['analysis costs under 2 ms', Math.max(...results.map(r => r.ms)) < 2],
  ['a camera on itself finds a ceiling', loopLate < loopMid * 1.25],
  ['and the ceiling is a plate, not a wall', loopLate < 20],
  ['a fan in the corner still drives the plate', carLate > carEarly * 0.5],
  ['a wave reaches the plate inside 200 ms', !!waveOnset && waveOnset.t < 0.2],
  ['a wave moves the plate', wavePeak > 0.02],
];

console.log('');
let failed = 0;
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
}
process.exit(failed === 0 ? 0 : 1);
