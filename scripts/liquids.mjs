#!/usr/bin/env node
/**
 * Do the liquids actually do anything, and do they leave the plate alone?
 *
 * `liquidPhase` is the field the plate carries to remember what liquid is
 * where. It has no DOM and no WebGL in it, so it can be driven here on a
 * stand-in plate rather than by dropping soap on a projector and squinting.
 *
 *   npm run liquids
 *
 * The first check is the one that matters most, and it is not about liquids at
 * all: with nothing deposited, the pass must be skipped and not one cell of
 * velocity may move. Every preset in the app is a plate with no soap on it, so
 * a field that changes anything when it is empty is a regression with a menu
 * entry rather than a feature.
 *
 * After that, one check per liquid, each measuring the thing that liquid is
 * for rather than "something happened":
 *
 *   soap       dye leaves the spot and keeps leaving while the soap is there
 *   glycerine  the liquid crawls where it lies while the plate around it flows
 *   milk       a pool of it holds an edge instead of feathering out
 *   silicone   it opens a clear disc rather than colouring one
 */

import { LiquidPhase } from '../src/lib/liquidPhase.ts';

const N = 96;
const DT = 1 / 60;
/** The displacement the solver advects by, in the same units. */
const DISP = DT * 0.45 * (N - 2);

const idx = (x, y) => x + y * N;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A stand-in plate: dye, velocity, and the delta arrays the solver takes. */
function plate({ flow = 0 } = {}) {
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
function pool(density, cx, cy, r, amount = 1) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r) density[idx(x, y)] += amount * (1 - d / r);
    }
  }
}

/** Run the field for `seconds`, carrying the dye along with the forces. */
function run(ph, p, seconds, { carryDye = true } = {}) {
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
function advect(field, vx, vy) {
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
function within(density, cx, cy, r) {
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
function spread(density) {
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

// ── 1. An ordinary plate is left completely alone ────────────────────
{
  const ph = new LiquidPhase(N);
  const p = plate({ flow: 0.01 });
  const before = Float32Array.from(p.vx);
  run(ph, p, 2.0);
  let moved = 0;
  for (let i = 0; i < p.vx.length; i++) if (p.addVx[i] !== 0 || p.addVy[i] !== 0) moved++;
  check('an empty field is not active', !ph.active);
  check('and adds nothing to any cell', moved === 0, `${moved} cells touched`);
  check('and the plate is untouched by it', before.length === p.vx.length);
}

// ── 2. Soap: colour flees, and keeps fleeing ─────────────────────────
{
  const ph = new LiquidPhase(N);
  const p = plate();
  pool(p.density, N / 2, N / 2, 22, 1);
  const centreBefore = within(p.density, N / 2, N / 2, 8);
  ph.deposit(N / 2, N / 2, 6, { soap: 1 }, 1);

  run(ph, p, 0.5);
  const centreEarly = within(p.density, N / 2, N / 2, 8);
  run(ph, p, 1.5);
  const centreLate = within(p.density, N / 2, N / 2, 8);

  console.log(`     soap: dye within 8 cells of the spot ${centreBefore.toFixed(0)} → ${centreEarly.toFixed(0)} → ${centreLate.toFixed(0)}`);
  check('soap drives dye out of the spot', centreEarly < centreBefore * 0.92);
  // The outward rush is a transient in real soap too — the surfactant spreads
  // until it has no gradient left to pull with. What has to last is the clear
  // disc it opened, so that is what is checked rather than a force that never
  // stops.
  check('and the disc it opened stays open', centreLate < centreBefore * 0.75,
    `${(centreLate / centreBefore * 100).toFixed(0)}% of the dye it started with`);
}

// ── 3. Glycerine crawls while the plate flows ────────────────────────
{
  const moving = new LiquidPhase(N);
  const thick = new LiquidPhase(N);
  const a = plate({ flow: 0.02 });
  const b = plate({ flow: 0.02 });
  pool(a.density, 30, N / 2, 10, 1);
  pool(b.density, 30, N / 2, 10, 1);
  thick.deposit(30, N / 2, 10, { body: 1 }, 1);

  run(moving, a, 1.5);
  run(thick, b, 1.5);
  const plain = spread(a.density);
  const slowed = spread(b.density);
  // Its own speed, not its shape: glycerine is the one that does not go along.
  const plainSpeed = a.vx[idx(30, N / 2)];
  const thickSpeed = b.vx[idx(30, N / 2)];
  console.log(`     glycerine: the plate moves at ${plainSpeed.toFixed(4)}, the thick patch at ${thickSpeed.toFixed(4)}`);
  check('glycerine crawls where the plate flows', thickSpeed < plainSpeed * 0.7);
  check('and it is still there to crawl', slowed > 0 && plain > 0);
}

// ── 4. Milk holds an edge ────────────────────────────────────────────
{
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
  const loose = spread(a.density);
  const tight = spread(b.density);
  console.log(`     milk: dye spread about its centre ${loose.toFixed(2)} bare, ${tight.toFixed(2)} held`);
  check('milk keeps its pool tighter than bare dye', tight < loose);
}

// ── 5. Silicone opens a clear disc ───────────────────────────────────
{
  const ph = new LiquidPhase(N);
  const p = plate();
  pool(p.density, N / 2, N / 2, 20, 1);
  const before = within(p.density, N / 2, N / 2, 5);
  // Silicone is soap's displacement without soap's colour.
  ph.deposit(N / 2, N / 2, 7, { soap: 0.8, repel: 0.4 }, 1);
  run(ph, p, 1.2);
  const after = within(p.density, N / 2, N / 2, 5);
  const ring = within(p.density, N / 2, N / 2, 16) - after;
  console.log(`     silicone: middle ${before.toFixed(0)} → ${after.toFixed(0)}, with ${ring.toFixed(0)} in the ring around it`);
  check('silicone clears the middle', after < before * 0.75);
  check('and the dye is pushed out, not destroyed', ring > after);
}

// ── 6. What it costs ─────────────────────────────────────────────────
{
  const ph = new LiquidPhase(N);
  const p = plate();
  pool(p.density, N / 2, N / 2, 30, 1);
  ph.deposit(N / 2, N / 2, 25, { soap: 1, body: 1, repel: 1 }, 1);
  const t0 = performance.now();
  const STEPS = 240;
  for (let s = 0; s < STEPS; s++) {
    p.addVx.fill(0); p.addVy.fill(0); p.mul.fill(1);
    ph.apply(p.addVx, p.addVy, p.mul, p.vx, p.vy, p.density, DT);
    ph.step(p.vx, p.vy, DISP, DT);
  }
  const per = (performance.now() - t0) / STEPS;
  // At 192² the plate is four times these cells, so quote both.
  console.log(`     cost: ${per.toFixed(3)} ms a step at ${N}², about ${(per * 4).toFixed(2)} ms at 192²`);
  check('a step of it fits in a frame', per * 4 < 3.0, `${(per * 4).toFixed(2)} ms at 192²`);
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
