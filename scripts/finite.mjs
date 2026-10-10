#!/usr/bin/env node
/**
 * Finite guards on carried fields and uniform sanitisation (PLAN 1.3 / S18).
 *
 *   npm run finite
 *
 * The dye and velocity fields carry finite4 and safeVel guards, but the
 * carried fields (cur, spress, squeeze, psi, phase, mix) did not. When a
 * non-finite uniform reached the GPU (e.g., S.rock = NaN), the unprojected
 * current force c became NaN. Because NaN comparisons evaluate to false, NaN
 * was stored in the cur texture. On every subsequent step, cur remained NaN,
 * causing safeVel in addCurrent to zero the forced velocity across all cells,
 * permanently freezing the simulation until a rung change.
 *
 * S18 guarantees:
 *   1. writeSim sanitises all GpuStepParams inputs to valid finite defaults.
 *   2. Carried field texture stores are guarded with finite select guards,
 *      allowing the plate to recover motion two steps after any uniform
 *      corruption.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const result = await page.evaluate(async () => {
    // ── Check 1: writeSim sanitisation ─────────────────────────────────────
    await lab.create(128, 128);
    const solver = lab.solver();

    // Step with non-finite parameters
    const badParams = {
      dt: NaN,
      time: NaN,
      visc: NaN,
      turbScale: NaN,
      spin: NaN,
      immiscibility: NaN,
      vibIntensity: NaN,
      vibFrequency: NaN,
      drip: NaN,
      air: NaN,
      smearX: NaN,
      smearY: NaN,
      damping: NaN,
      heatDecay: NaN,
      evapFactor: NaN,
      sharpness: NaN,
      turbDetail: NaN,
      currentDamp: NaN,
      currentBuoy: NaN,
      currentGrav: NaN,
      meanDensity: NaN,
      maxCurrent: NaN,
      rockX: NaN,
      rockY: Infinity,
      plateCurve: NaN,
      gapSpring: NaN,
      gapMemory: -Infinity,
      gravityX: NaN,
      gravityY: NaN,
      magnetStrength: NaN,
      magnetHeight: NaN,
      magnetRadius: NaN,
    };

    solver.step(badParams, false);

    const simF = Array.from(solver['simF']);
    const simI = Array.from(solver['simI']);

    let nonFiniteF = 0;
    for (let k = 0; k < simF.length; k++) {
      if (!Number.isFinite(simF[k])) nonFiniteF++;
    }
    let nonFiniteI = 0;
    for (let k = 0; k < simI.length; k++) {
      if (!Number.isFinite(simI[k])) nonFiniteI++;
    }

    const writeSimClean = nonFiniteF === 0 && nonFiniteI === 0;
    const dtFallback = Math.abs(simF[2] - 1 / 60) < 1e-6;
    const viscFallback = simF[5] === 1;

    // ── Check 2: Carried field recovery from uniform corruption ────────────
    // Create a fresh plate, add off-centre dye, and rock the plate
    await lab.create(128, 128);
    const s2 = lab.solver();
    lab.dye(0.4, 0.4, 0.2, [1, 0.2, 0.2], 1.0);
    lab.flush();

    // Step 5 times with steady rock to establish flow
    for (let i = 0; i < 5; i++) {
      await lab.step(1, { rockX: 0.8, maxCurrent: 0.05 });
    }

    const velBefore = await lab.field('vel');
    let maxSpeedBefore = 0;
    for (let k = 0; k < velBefore.length; k += 4) {
      const spd = Math.hypot(velBefore[k], velBefore[k + 1]);
      if (spd > maxSpeedBefore) maxSpeedBefore = spd;
    }

    // Corrupt rock uniform directly in sim buffer for one step via rawSim
    s2.step({
      dt: 1 / 60,
      advection: 1,
      rockX: 0.8,
      maxCurrent: 0.05,
      rawSim: (f) => {
        f[28] = NaN; // rockX
        f[29] = NaN; // rockY
      },
    }, false);

    // Step 1 step after corruption with normal parameters
    await lab.step(1, { rockX: 0.8, maxCurrent: 0.05 });

    // Step 2 steps after corruption with normal parameters
    await lab.step(1, { rockX: 0.8, maxCurrent: 0.05 });

    const velTwoStepsLater = await lab.field('vel');
    let maxSpeedAfter = 0;
    let nonFiniteVel = 0;
    for (let k = 0; k < velTwoStepsLater.length; k += 4) {
      const vx = velTwoStepsLater[k];
      const vy = velTwoStepsLater[k + 1];
      if (!Number.isFinite(vx) || !Number.isFinite(vy)) nonFiniteVel++;
      const spd = Math.hypot(vx, vy);
      if (spd > maxSpeedAfter) maxSpeedAfter = spd;
    }

    return {
      writeSimClean,
      nonFiniteF,
      nonFiniteI,
      dtFallback,
      viscFallback,
      maxSpeedBefore,
      maxSpeedAfter,
      nonFiniteVel,
    };
  });

  check('writeSim sanitises non-finite uniforms to finite numbers',
    result.writeSimClean,
    `simF non-finite: ${result.nonFiniteF}, simI non-finite: ${result.nonFiniteI}`);

  check('writeSim applies valid default fallbacks on non-finite inputs',
    result.dtFallback && result.viscFallback,
    `dt: ${result.dtFallback ? '1/60' : 'invalid'}, visc: ${result.viscFallback ? '1' : 'invalid'}`);

  check('flow is established before corruption',
    result.maxSpeedBefore > 0.0005,
    `max speed before: ${result.maxSpeedBefore.toFixed(5)}`);

  check('all velocities are finite after corrupted step',
    result.nonFiniteVel === 0,
    `non-finite velocity count: ${result.nonFiniteVel}`);

  check('plate recovers motion two steps after uniform corruption',
    result.maxSpeedAfter > 0.0005,
    `max speed 2 steps later: ${result.maxSpeedAfter.toFixed(5)}`);

} finally {
  await close();
}

const failed = checks.filter(c => !c.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`\nAll ${checks.length} checks passed.`);
}
