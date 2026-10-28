/**
 * The stand-in plate `npm run liquids` measures the liquids on, and its four
 * liquids' scenes, shared with `npm run liquidsgpu` (PLAN 15e).
 *
 * `liquids.mjs` holds `liquidPhase` to what each liquid is for on a 96²
 * plate of plain arrays: a velocity damped by a hundredth a step, a
 * backtrace for the dye, no projection and no gap. The GPU solver carries
 * the same liquids in its own fields (`addLiquidDrop`, `liquidForces` in
 * wgsl/fluid.ts) with the same constants, and `liquidsgpu.mjs` holds it to
 * the same scenes. So the scenes live here, once: a scene changed for one
 * check is changed for both, and the GPU is never judged against a stand-in
 * that has quietly moved. Each returns its readings; the bars stay in the
 * checks.
 */
import { LiquidPhase } from '../src/lib/liquidPhase.ts';

export const N = 96;
export const DT = 1 / 60;
/** The displacement the solver advects by, in the same units. */
export const DISP = DT * 0.45 * (N - 2);

export const idx = (x, y) => x + y * N;
/** A stand-in plate: dye, velocity, and the delta arrays the solver takes. */
export function plate({ flow = 0 } = {}) {
  const n = N * N;
  return {
    density: new Float32Array(n),
    vx: new Float32Array(n).fill(flow),
    vy: new Float32Array(n),
    addVx: new Float32Array(n),
    addVy: new Float32Array(n),
    mul: new Float32Array(n).fill(1),
  };
}

/** A round pool of dye. */
export function pool(density, cx, cy, r, amount = 1) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) density[idx(x, y)] += amount * (1 - d / r);
    }
  }
}

/** Run the field for `seconds`, carrying the dye along with the forces. */
export function run(ph, p, seconds, { carryDye = true } = {}) {
  const steps = Math.round(seconds / DT);
  for (let s = 0; s < steps; s++) {
    p.addVx.fill(0); p.addVy.fill(0); p.mul.fill(1);
    ph.apply(p.addVx, p.addVy, p.mul, p.vx, p.vy, p.density, DT);
    // The stand-in solver: take the delta, damp, and move the dye by it.
    for (let i = 0; i < p.vx.length; i++) {
      p.vx[i] = (p.vx[i] + p.addVx[i]) * 0.99;
      p.vy[i] = (p.vy[i] + p.addVy[i]) * 0.99;
      p.density[i] *= p.mul[i];
    }
    if (carryDye) advect(p.density, p.vx, p.vy);
    ph.step(p.vx, p.vy, DISP, DT);
  }
}

/** Move a field along the velocity, the way the solver moves its dye. */
const scratch = new Float32Array(N * N);
export function advect(field, vx, vy) {
  scratch.set(field);
  const last = N - 2;
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const c = idx(i, j);
      let x = i - DISP * vx[c], y = j - DISP * vy[c];
      if (x < 0.5) x = 0.5; else if (x > last + 0.5) x = last + 0.5;
      if (y < 0.5) y = 0.5; else if (y > last + 0.5) y = last + 0.5;
      const i0 = Math.floor(x), j0 = Math.floor(y), sx = x - i0, sy = y - j0;
      field[c] =
        (scratch[idx(i0, j0)] * (1 - sx) + scratch[idx(i0 + 1, j0)] * sx) * (1 - sy) +
        (scratch[idx(i0, j0 + 1)] * (1 - sx) + scratch[idx(i0 + 1, j0 + 1)] * sx) * sy;
    }
  }
}

/** How much dye sits within `r` of a point. */
export function within(density, cx, cy, r) {
  let sum = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (Math.hypot(x - cx, y - cy) <= r) sum += density[idx(x, y)];
  }
  return sum;
}

/**
 * How sharp the edge of a pool is: the dye's spread about *its own* centre of
 * mass, not about where it started. Measured about a fixed point instead, a
 * plate that simply drifts reads as a pool that spread, which is how the first
 * run of this had milk looking worse than bare dye.
 */
export function spread(density) {
  let sum = 0, mx = 0, my = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = density[idx(x, y)];
      if (d <= 0) continue;
      sum += d; mx += d * x; my += d * y;
    }
  }
  if (sum <= 0) return 0;
  const cx = mx / sum, cy = my / sum;
  let weighted = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = density[idx(x, y)];
      if (d > 0) weighted += d * Math.hypot(x - cx, y - cy);
    }
  }
  return weighted / sum;
}

/** The whole plate's dye: what soap moves stays in it, what it erases leaves it. */
export const totalDye = (density) => density.reduce((a, v) => a + v, 0);

/** Soap: dye within 8 cells of a spot of soap, before, after half a second and after two, and the plate's at each. */
export function soapScene() {
  const ph = new LiquidPhase(N);
  const p = plate();
  pool(p.density, N / 2, N / 2, 22, 1);
  const before = within(p.density, N / 2, N / 2, 8), plate0 = totalDye(p.density);
  ph.deposit(N / 2, N / 2, 6, { soap: 1 }, 1);
  run(ph, p, 0.5);
  const early = within(p.density, N / 2, N / 2, 8), plate1 = totalDye(p.density);
  run(ph, p, 1.5);
  const late = within(p.density, N / 2, N / 2, 8), plate2 = totalDye(p.density);
  return { before, early, late, plate0, plate1, plate2 };
}

/** Glycerine: a plate set flowing, and its speed where a patch of body lies against a plate with none. */
export function glycerineScene() {
  const moving = new LiquidPhase(N);
  const thick = new LiquidPhase(N);
  const a = plate({ flow: 0.02 });
  const b = plate({ flow: 0.02 });
  pool(a.density, 30, N / 2, 10, 1);
  pool(b.density, 30, N / 2, 10, 1);
  thick.deposit(30, N / 2, 10, { body: 1 }, 1);
  run(moving, a, 1.5);
  run(thick, b, 1.5);
  return {
    plain: spread(a.density), slowed: spread(b.density),
    // Its own speed, not its shape: glycerine is the one that does not go along.
    plainSpeed: a.vx[idx(30, N / 2)], thickSpeed: b.vx[idx(30, N / 2)],
  };
}

/** Milk: a pool's spread about its own centre on a drifting plate, bare and held by repel. */
export function milkScene() {
  const bare = new LiquidPhase(N);
  const held = new LiquidPhase(N);
  const a = plate();
  const b = plate();
  pool(a.density, N / 2, N / 2, 12, 1);
  pool(b.density, N / 2, N / 2, 12, 1);
  // A plate that would otherwise pull it apart.
  for (let i = 0; i < a.vx.length; i++) { a.vx[i] = 0.004; b.vx[i] = 0.004; }
  held.deposit(N / 2, N / 2, 12, { repel: 1 }, 1);
  run(bare, a, 2.0);
  run(held, b, 2.0);
  return { loose: spread(a.density), tight: spread(b.density) };
}

/**
 * Silicone: the dye within 5 cells of a spot of it, and in the ring from 5
 * to 16 cells, before and after 1.2 s. `ringBefore` is for the GPU's line
 * that the dye the middle lost reached the ring (liquidsgpu.mjs).
 */
export function siliconeScene() {
  const ph = new LiquidPhase(N);
  const p = plate();
  pool(p.density, N / 2, N / 2, 20, 1);
  const before = within(p.density, N / 2, N / 2, 5);
  const ringBefore = within(p.density, N / 2, N / 2, 16) - before, plate0 = totalDye(p.density);
  // Silicone is soap's displacement without soap's colour.
  ph.deposit(N / 2, N / 2, 7, { soap: 0.8, repel: 0.4 }, 1);
  run(ph, p, 1.2);
  const after = within(p.density, N / 2, N / 2, 5);
  const ring = within(p.density, N / 2, N / 2, 16) - after;
  return { before, after, ring, ringBefore, plate0, plate1: totalDye(p.density) };
}
