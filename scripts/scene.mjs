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
 * Exits non-zero if any of them fails, so it can stand in a check.
 */

import { SceneSense } from '../src/lib/sceneSense.ts';

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
];

console.log('');
let failed = 0;
for (const [what, ok] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`);
}
process.exit(failed === 0 ? 0 : 1);
