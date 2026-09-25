#!/usr/bin/env node
/**
 * The solver's physics, measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run physics
 *
 * Each question with the control that makes it mean something:
 *
 *   1. the projection makes the flow incompressible: multigrid against the
 *      red-black sweeps alone, on the same violent, messy forcing
 *   2. the magnet draws ferrofluid toward it, as a force on the liquid
 *   3. and neither makes nor loses any, nor packs a cell past full
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  // ── 1: incompressible ──
  const divergence = async (solver) => {
    await page.evaluate(() => lab.create(192, 192));
    await page.evaluate((s) => { lab.solver().pressureSolver = s; }, solver);
    await page.evaluate(() => {
      let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 40; k++) lab.vel(r(), r(), 0.03 + 0.08 * r(), [(r() - 0.5) * 8, (r() - 0.5) * 8, 0, 0]);
      lab.flush();
    });
    await page.evaluate(() => lab.step(30));
    return page.evaluate(async () => {
      const v = await lab.field('vel'); const L = 192; let d = 0, m = 0;
      const at = (i, j, c) => v[(i + j * L) * 4 + c];
      for (let j = 1; j < L - 1; j++) for (let i = 1; i < L - 1; i++) {
        d += Math.abs((at(i + 1, j, 0) - at(i - 1, j, 0)) + (at(i, j + 1, 1) - at(i, j - 1, 1))) * 0.5;
        m += Math.hypot(at(i, j, 0), at(i, j, 1));
      }
      return d / m;
    });
  };
  const sweeps = await divergence('sweeps');
  const multigrid = await divergence('multigrid');
  check('multigrid makes the flow far more incompressible than the sweeps alone',
    multigrid * 3 < sweeps, `divergence per unit speed ${multigrid.toFixed(4)} against ${sweeps.toFixed(4)}`);

  // ── 2, 3: the magnet ──
  const blob = async (strength) => {
    await page.evaluate(() => lab.create(128));
    await page.evaluate(() => { lab.solver().clearPhase(); lab.addPhase(0.55, 0.5, 0.08, 0.9); });
    const read = () => page.evaluate(async () => {
      const f = await lab.phase(); const n = f.n; let t = 0, cx = 0, peak = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const q = f.data[x + y * n]; t += q; cx += q * x / n; peak = Math.max(peak, q); }
      return { mass: t, x: cx / t, peak };
    });
    const before = await read();
    // The edge sharpening is off here: it is not conservative (it clamps),
    // and this asks about the transport, not about it.
    await page.evaluate((s) => lab.step(120, { magnetStrength: s, magnetX: 0.75, magnetY: 0.5, magnetHeight: 0.12, dt: 0.002, advection: 0.35, phaseSharp: 0, phaseTension: 0 }), strength);
    return { before, after: await read() };
  };
  const off = await blob(0);
  const on = await blob(0.9);
  const moved = on.after.x - on.before.x, drift = off.after.x - off.before.x;
  check('the magnet draws the ferrofluid toward it', moved > drift + 0.05,
    `centre of mass ${on.before.x.toFixed(3)} → ${on.after.x.toFixed(3)} toward a magnet at 0.75, against ${drift.toFixed(3)} with it off`);
  check('and none is made or lost', Math.abs(on.after.mass / on.before.mass - 1) < 0.01,
    `${on.before.mass.toFixed(1)} → ${on.after.mass.toFixed(1)}`);
  check('and no cell is packed past full', on.after.peak < 1.02, `peak ${on.after.peak.toFixed(3)}`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
