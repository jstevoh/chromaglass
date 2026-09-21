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
import { RoomStir, ROOM_STALE_MS } from '../src/lib/roomStir.ts';
import { PatchBay } from '../src/lib/sceneMap.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

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

// ── A hand on the glass ─────────────────────────────────────────────
//
// Someone walks in, stops, and stands there. The hands path reads "moving"
// from the track's own speed and "still" from how long it has been below it,
// so what matters is that one id survives the stop: a track lost when a person
// stands still would hand them a new dye every time they paused.
function stopper() {
  const sense = new SceneSense();
  const frames = Math.round(8 / DT);
  let ids = new Set(), movingFrames = 0, stillFrames = 0, lastId = null, idChanges = 0;
  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    const px = room(f * 7919 + 13);
    // In from outside the frame over two seconds, then standing at 0.55 for
    // six. Starting outside matters: anyone already there on the first frame
    // is baked into the background and leaves a hole behind them.
    const x = t < 2 ? -0.15 + (t / 2) * 0.7 : 0.55;
    box(px, x, 0.3, 0.12, 0.42, 200);
    const r = sense.push(px, N, N, DT, t * 1000, OPTS);
    if (!r.ready || t < 0.6) continue;
    for (const p of r.people) {
      ids.add(p.id);
      if (lastId !== null && p.id !== lastId) idChanges++;
      lastId = p.id;
      if (p.still > 0.35) stillFrames++;
      else if (Math.hypot(p.vx, p.vy) > 0.06) movingFrames++;
    }
  }
  return { ids: ids.size, idChanges, movingFrames, stillFrames };
}
const stop = stopper();
console.log('');
console.log(`walk then stand        ids ${stop.ids}, changes ${stop.idChanges}, blowing ${stop.movingFrames} readings, pressing ${stop.stillFrames}`);
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
  ['someone walking in blows', stop.movingFrames > 8],
  ['and presses once they stand still', stop.stillFrames > 8],
  ['keeping the id, and the dye, across the stop', stop.ids === 1 && stop.idChanges === 0],
];

/*
  ── The patch bay ───────────────────────────────────────────────────

  Three sources — room, film, sound — and any numeric setting to land on, per
  patch, per plate. Every one of those axes is a way to be quietly wrong: a
  source that should not count counting, two that should both count adding up
  wrong, a patch aimed at one plate reaching the others, a patch aimed at a
  plate that is not on stage tonight throwing, or a result walking past the end
  of a setting's travel. None of them would look like a bug on a plate. They
  would look like "that's a bit much".

  So the arithmetic is driven with readings made up here. `PatchBay.fold` takes
  its clock as an argument for exactly this: staleness is a rule about time and
  a test should not have to wait for it.
*/
const reading = (energy, at) => ({
  lattice: 1,
  flowX: new Float32Array(1), flowY: new Float32Array(1), motion: new Float32Array(1),
  energy, raw: energy,
  centroidX: 0.5, centroidY: 0.5, dirX: 0, dirY: 0, spread: 0,
  brightness: 0.5, hue: 0, chroma: 0,
  people: [], crowd: 0,
  at, ms: 0, ready: true,
});
/** What the analyser hands over. `bass` is 0..100 there and 0..1 by the time a patch sees it. */
const heard = (bass) => ({ volume: 0, bass, mid: 0, treble: 0, energy: 0, timbre: 0, complexity: 0 });

const T = 1000;                                   // the clock every case is read at
const ctx = (over = {}) => ({
  room: null, film: null, sound: null,
  roomImpact: 1, filmImpact: 1, soundImpact: 1,
  ...over,
});

/** Fold one patch list and read `turbulenceScale` off the picture and each plate. */
function fold(patches, c, layers = 2) {
  const base = { ...DEFAULT_SETTINGS, turbulenceScale: 0, layerCount: layers, sceneMappings: patches };
  const bay = new PatchBay(base);
  bay.fold(base, c, layers, T);
  return {
    global: bay.global.turbulenceScale,
    layer: (i) => bay.layer(i).turbulenceScale,
    /** Whether a fold happened at all: an untouched plate is `base` itself. */
    copied: bay.global !== base,
  };
}

const P = (over) => ({ source: 'room', feature: 'motion', setting: 'turbulenceScale', depth: 1, layer: 'all', ...over });

// ── Sources ──
const roomOnly = fold([P({ source: 'room' })], ctx({ room: reading(0.4, T) })).global;
const filmOnly = fold([P({ source: 'film' })], ctx({ film: reading(0.4, T) })).global;
const soundOnly = fold([P({ source: 'sound', feature: 'bass' })], ctx({ sound: heard(40) })).global;
// A room patch must not read the film's reading, which is the whole point of
// naming a source: before this, every source drove every patch.
const crossed = fold([P({ source: 'room' })], ctx({ film: reading(0.9, T) })).global;
const bothUp = fold(
  [P({ source: 'room' }), P({ source: 'film' })],
  ctx({ room: reading(0.4, T), film: reading(0.4, T) }),
).global;
const masterDown = fold([P({ source: 'film' })], ctx({ film: reading(0.4, T), filmImpact: 0 })).global;
const stale = fold([P({ source: 'room' })], ctx({ room: reading(0.9, T - ROOM_STALE_MS - 1) })).global;
const halfDepth = fold([P({ depth: 0.5 })], ctx({ room: reading(0.4, T) })).global;
// Turbulence travels 0..1, so two sources at full energy stop at the top.
const clamped = fold(
  [P({ source: 'room' }), P({ source: 'film' })],
  ctx({ room: reading(1, T), film: reading(1, T) }),
).global;
const idle = fold([P()], ctx());

// ── Plates ──
// The case the whole tier is for: a reel on one layer, the bass on another.
// Deliberately different numbers on the two plates. With both at 0.4 the check
// below could not tell "each plate got its own patch" from "both plates got
// both patches", which is exactly the failure it is here to catch.
const split = fold(
  [P({ source: 'film', layer: 0 }), P({ source: 'sound', feature: 'bass', layer: 1 })],
  ctx({ film: reading(0.4, T), sound: heard(80) }),
);
const onAll = fold([P({ layer: 'all' })], ctx({ room: reading(0.4, T) }));
// A patch aimed at layer 3 on a one-layer look is not applied, and does not throw.
const offstage = fold([P({ layer: 2 })], ctx({ room: reading(0.9, T) }), 1);
// "All" and "this plate" stack: the plate starts from the picture.
const stacked = fold(
  [P({ source: 'room', layer: 'all' }), P({ source: 'film', layer: 0 })],
  ctx({ room: reading(0.4, T), film: reading(0.4, T) }),
);

// ── Steps ──
// The folds only take whole steps — the sheet offers Off, 2, 4, 6 and 8 — so a
// patch riding them lands on one. After the sum rather than per patch: two
// patches that each add most of a fold are, together, a fold, and rounding each
// on its own would lose both.
const folds = (patches, bass) => {
  const base = { ...DEFAULT_SETTINGS, kaleidoscope: 0, layerCount: 1, sceneMappings: patches };
  const bay = new PatchBay(base);
  bay.fold(base, ctx({ sound: heard(bass) }), 1, T);
  return bay.global.kaleidoscope;
};
const onFolds = (depth) => P({ source: 'sound', feature: 'bass', setting: 'kaleidoscope', depth });
const foldSweep = [0, 20, 40, 60, 80, 100].map(b => folds([onFolds(1)], b));
const mostOfOne = folds([onFolds(0.225)], 50);                  // 0.9 of a fold
const twoOfThose = folds([onFolds(0.225), onFolds(0.225)], 50); // 1.8

checks.push(
  ['a patch on the folds lands on a fold the sheet offers', foldSweep.every(v => [0, 2, 4, 6, 8].includes(v)) && foldSweep.at(-1) === 8],
  ['and most of a fold on its own is no fold', mostOfOne === 0],
  ['but two patches that each add most of one add up to one', twoOfThose === 2],
);

checks.push(
  ['a room patch reads the room', roomOnly > 0.05],
  ['a film patch reads the film', Math.abs(filmOnly - roomOnly) < 1e-6],
  ['a sound patch reads the sound', Math.abs(soundOnly - roomOnly) < 1e-6],
  ['and a patch reads only the source it names', crossed === 0],
  ['two patches add', Math.abs(bothUp - roomOnly * 2) < 1e-6],
  ['half the depth moves half as far', Math.abs(halfDepth - roomOnly / 2) < 1e-6],
  ["a source's master pulls its patches down", masterDown === 0],
  ['a reading that stopped arriving is not read', stale === 0],
  ['two patches cannot push past the travel', clamped <= 1 + 1e-9 && clamped > 0.9],
  ['nothing plugged in copies nothing', idle.global === 0 && idle.copied === false],

  ['a patch on one plate moves that plate', Math.abs(split.layer(0) - roomOnly) < 1e-6],
  ['and leaves the other alone', Math.abs(split.layer(0) - 0.4) < 1e-6 && Math.abs(split.layer(1) - 0.8) < 1e-6],
  ['and leaves the picture alone', split.global === 0],
  ['a patch on all plates reaches every one', Math.abs(onAll.layer(0) - onAll.layer(1)) < 1e-6 && onAll.layer(0) > 0.05],
  ['a patch aimed at a plate that is not there does nothing', offstage.global === 0 && offstage.layer(0) === 0],
  ['and a plate stacks its own patch on top of the picture',
    Math.abs(stacked.layer(0) - roomOnly * 2) < 1e-6 && Math.abs(stacked.layer(1) - roomOnly) < 1e-6],
);

console.log('');
let failed = 0;
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
