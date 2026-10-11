#!/usr/bin/env node
/**
 * Bubbles and beads live by physics, not timers (PLAN.md §18i).
 *
 *   node scripts/bubblephysics.mjs
 *
 * Checks:
 *   1. Bubble drift speedup follows Bretherton lubrication law U_b / U = 2 / (1 + c Ca^(2/3)),
 *      running ahead of depth-mean liquid velocity (~1.8-2.0x vs old constant 1.32x).
 *   2. Unagitated bubbles have no artificial Brownian wander.
 *   3. Straw finger count follows Saffman-Taylor wavelength scaling lambda ≈ pi * b / sqrt(Ca).
 *   4. Two bubbles in contact drain their thin liquid lubricating film over time t_drain ∝ R_e,
 *      merging deterministically after film drainage rather than on a random dice roll.
 *   5. Physical pancake bubbles (timedPops = false) do not pop on a timer, while timedPops = true
 *      preserves show pacing via lifeScale as called for by the owner.
 *   6. Beads drift at 2U / (1 + lambda) for viscosity ratio lambda.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const outBubbles = 'node_modules/.cache/bubblephysics-bubbles.mjs';
const outBeads = 'node_modules/.cache/bubblephysics-beads.mjs';
await build({ entryPoints: ['src/lib/bubbles.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBubbles, logLevel: 'warning' });
await build({ entryPoints: ['src/lib/beads.ts'], bundle: true, format: 'esm', platform: 'node', outfile: outBeads, logLevel: 'warning' });
const { BubbleField } = await import(`../${outBubbles}`);
const { BeadField } = await import(`../${outBeads}`);

const N = 192, dt = 1 / 60;

// ── 1. Bretherton lubrication speedup ─────────────────────────────────
{
  const f = new BubbleField(N);
  // Spawn single bubble at center
  f.spawn(96, 96, 4, 1, 0);
  const b = f.bubbles[0];
  const uFlow = 0.01; // solver velocity units
  const flow = (x, y) => [uFlow, 0];
  
  const x0 = b.x;
  // Step 60 frames (1 second) with no agitation, no tilt
  for (let t = 0; t < 60; t++) f.step(dt, flow, 0, 0, 1, 0);
  const cellsMoved = b.x - x0;
  // Base mean flow in cells per second: uFlow * CELLS_PER_UNIT = 0.01 * (0.05 * 190 * 60) = 5.7 cells/s
  const baseFlowCells = uFlow * (0.05 * 190 * 60);
  const speedRatio = cellsMoved / baseFlowCells;
  
  check('bubble runs ahead of flow via Bretherton lubrication (speed ratio > 1.7x)',
    speedRatio >= 1.7 && speedRatio <= 2.05,
    `speed ratio ${speedRatio.toFixed(3)}x (was fixed 1.32x)`);
}

// ── 2. Zero artificial Brownian wander when unagitated ────────────────
{
  const f = new BubbleField(N);
  f.spawn(96, 96, 4, 1, 0);
  const b = f.bubbles[0];
  const still = () => [0, 0];
  const x0 = b.x, y0 = b.y;
  for (let t = 0; t < 120; t++) f.step(dt, still, 0, 0, 1, 0);
  const drift = Math.hypot(b.x - x0, b.y - y0);
  check('unagitated millimeter bubble in still liquid has no random wander',
    drift < 1e-4,
    `drift ${drift.toFixed(5)} cells over 2 seconds`);
}

// ── 3. Saffman-Taylor finger wavelength scaling on Straw ─────────────
{
  const fGentle = new BubbleField(N);
  const fFast = new BubbleField(N);
  const still = () => [0, 0];

  // Gentle blowing (strength 0.15)
  for (let t = 0; t < 60; t++) {
    fGentle.blow(96, 96, dt, 0.15);
    fGentle.step(dt, still, 0, 0, 1, 0);
  }
  const bGentle = fGentle.bubbles.find((q) => q.straw);

  // Fast blowing (strength 2.0)
  for (let t = 0; t < 60; t++) {
    fFast.blow(96, 96, dt, 2.0);
    fFast.step(dt, still, 0, 0, 1, 0);
  }
  const bFast = fFast.bubbles.find((q) => q.straw);

  check('fast blowing destabilizes into more Saffman-Taylor lobes than gentle blowing',
    bFast && bGentle && bFast.lobes > bGentle.lobes,
    `fast ${bFast?.lobes} lobes vs gentle ${bGentle?.lobes} lobes`);
}

// ── 4. Film drainage merge ───────────────────────────────────────────
{
  const f = new BubbleField(N);
  const still = () => [0, 0];
  f.timedPops = false;
  
  f.spawn(80, 80, 3, 1, 0);
  f.spawn(85, 80, 3, 1, 0);
  const [b1, b2] = f.bubbles;
  // Position b2 in physical contact with b1
  b2.x = b1.x + (b1.r + b2.r) * 0.95;
  b2.y = b1.y;

  check('two bubbles touching start as two separate pancakes', f.bubbles.length === 2);
  
  // Step for 10 frames (~0.16s), less than t_drain (~0.7s)
  for (let t = 0; t < 10; t++) f.step(dt, still, 0, 0, 1, 0);
  check('bubbles touching briefly do not merge before thin film drains', f.bubbles.length === 2);
  
  // Step until film drainage completes (> 0.8s)
  const merges = [];
  for (let t = 0; t < 60; t++) {
    f.step(dt, still, 0, 0, 1, 0);
    merges.push(...f.events.filter((e) => e.kind === 'merge'));
  }
  check('bubbles merge into one area-conserving pancake once film drains',
    f.bubbles.length === 1 && merges.length > 0,
    `bubbles left: ${f.bubbles.length}, radius: ${f.bubbles[0]?.r.toFixed(2)}, merges: ${merges.length}`);
}

// ── 5. Physical pancake bubbles vs timed pops ────────────────────────
{
  // Physical pancake bubbles do not pop on a timer
  const fPhys = new BubbleField(N);
  fPhys.timedPops = false;
  fPhys.spawn(96, 96, 3, 1, 0);
  const bPhys = fPhys.bubbles[0];
  bPhys.life = 0.5; // 0.5s lifetime
  const still = () => [0, 0];
  for (let t = 0; t < 60; t++) fPhys.step(dt, still, 0, 0, 1, 0); // 1 second
  check('physical pancake bubbles (timedPops = false) do not pop on a timer',
    fPhys.bubbles.length === 1 && fPhys.bubbles[0].age > fPhys.bubbles[0].life,
    `age ${fPhys.bubbles[0]?.age.toFixed(2)}s past life ${fPhys.bubbles[0]?.life}s`);

  // Timed pops available for show pacing (the owner's call)
  const fTimed = new BubbleField(N);
  fTimed.timedPops = true;
  fTimed.spawn(96, 96, 3, 1, 0);
  fTimed.bubbles[0].life = 0.5;
  const timedPops = [];
  for (let t = 0; t < 60; t++) {
    fTimed.step(dt, still, 0, 0, 1, 0);
    timedPops.push(...fTimed.events.filter((e) => e.kind === 'pop'));
  }
  check('timed pops remain active when timedPops = true to pace a show',
    timedPops.length > 0,
    `timed pop fired at t=0.5s (${timedPops.length} pop events)`);
}

// ── 6. Beads speed 2U / (1 + lambda) ──────────────────────────────────
{
  const uFlow = 0.05;
  const flow = () => [uFlow, 0];
  const frames = 180;

  const fDefault = new BeadField(N);
  fDefault.drops = 0;
  fDefault.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const b0 = fDefault.beads[0];
  const x0 = b0.x;
  for (let t = 0; t < frames; t++) fDefault.step(dt, flow, 0, 0);
  const movedDefault = b0.x - x0;
  
  // Custom viscosity ratio lambda = 3.0 -> speed factor 2 / (1 + 3) = 0.5
  const fViscous = new BeadField(N);
  fViscous.viscosityRatio = 3.0;
  fViscous.drops = 0;
  fViscous.beads.push({ x: 96, y: 96, r: 3, age: 0, seed: 1 });
  const bV = fViscous.beads[0];
  const xV0 = bV.x;
  for (let t = 0; t < frames; t++) fViscous.step(dt, flow, 0, 0);
  const movedViscous = bV.x - xV0;

  const ratio = movedViscous / movedDefault;
  // Expected ratio: (2 / (1 + 3)) / (2 / (1 + 1.5)) = 0.5 / 0.8 = 0.625
  check('beads drift at 2U / (1 + lambda) based on viscosity ratio',
    Math.abs(ratio - 0.625) < 0.03,
    `ratio ${ratio.toFixed(3)} matches physical ratio 0.625 (moved ${movedViscous.toFixed(1)} vs ${movedDefault.toFixed(1)} cells)`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
