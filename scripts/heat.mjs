#!/usr/bin/env node
/**
 * Heat and lamp physics audit (PLAN 18f):
 *
 *   npm run heat
 *
 * Checks:
 *   1. Beer-Lambert absorption: dark dye heats up under the lamp, clear water stays cold
 *   2. Lamp dimmer: dimmer at 0 produces no heat even with dark dye
 *   3. Newton cooling: decay is per-second (dt-independent), so 60 steps at dt=1/60
 *      and 120 steps at dt=1/120 cool to the same temperature (within 5%, vs 336% per-step)
 *   4. Thermal buoyancy: on a level plate in-plane buoyancy is zero; on an upright
 *      plate warm liquid forms an upward plume along S.up
 *   5. Linear Boussinesq: thermal buoyancy is linear in temperature (tanh removed),
 *      doubling temperature doubles the plume acceleration
 *   6. Temperature-dependent viscosity: water viscosity drops ~2%/K, so thin-gap
 *      terminal speed under gravity rises with heat (~1.5x at 30°C)
 *   7. Oil density: mix layer (oil, rho ~ 0.85) is lighter than water, so oil experiences
 *      upward buoyancy on an upright plate while heavy wax sinks, and level plate has zero
 *   8. Packed velocity export: channel z preserves fluid temperature
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => {
  if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200));
});

try {
  // ── 1, 2: Beer-Lambert absorption & lamp dimmer ──
  const heating = await page.evaluate(async () => {
    const N = 128;
    // Test A: Lamp on (dimmer: 1), pool of dark dye in center
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.25, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 1.0, dt: 1 / 60 });
    const vA = await lab.field('vel');
    const midIdx = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;
    const cornerIdx = (Math.floor(N * 0.1) + Math.floor(N * 0.1) * N) * 4;
    const tempCenterA = vA[midIdx + 2];
    const tempCornerA = vA[cornerIdx + 2];

    // Test B: Lamp off (dimmer: 0), pool of dark dye in center
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.25, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 0.0, dt: 1 / 60 });
    const vB = await lab.field('vel');
    const tempCenterB = vB[midIdx + 2];

    return { tempCenterA, tempCornerA, tempCenterB };
  });

  check(
    'Beer-Lambert absorption: dark dye heats under lamp while clear water stays cold',
    heating.tempCenterA > 0.2 && heating.tempCornerA < 0.001,
    `dark dye ${heating.tempCenterA.toFixed(4)}, clear water ${heating.tempCornerA.toFixed(4)}`
  );

  check(
    'lamp dimmer at zero produces no heat',
    heating.tempCenterB === 0,
    `center temperature ${heating.tempCenterB.toFixed(4)} with dimmer 0`
  );

  // ── 3: Newton cooling is per-second, not per-step ──
  const cooling = await page.evaluate(async () => {
    const N = 128;
    const mid = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;

    // Run A: 60 steps at dt = 1/60 (total time = 1.0s)
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.15, [0, 0, 10.0, 0]);
    lab.flush();
    await lab.step(60, { dimmer: 0.0, heatDecay: 0.98, dt: 1 / 60, diff: 0, nu: 0, advection: 0 });
    const vA = await lab.field('vel');
    const tempA = vA[mid + 2];

    // Run B: 120 steps at dt = 1/120 (total time = 1.0s)
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.15, [0, 0, 10.0, 0]);
    lab.flush();
    await lab.step(120, { dimmer: 0.0, heatDecay: 0.98, dt: 1 / 120, diff: 0, nu: 0, advection: 0 });
    const vB = await lab.field('vel');
    const tempB = vB[mid + 2];

    const theory = 9.9765625 * Math.pow(0.98, 60);
    return { tempA, tempB, theory, ratio: tempA / Math.max(tempB, 1e-6) };
  });

  check(
    'Newton cooling is per second (dt-independent)',
    Math.abs(cooling.ratio - 1.0) < 0.05,
    `60 steps at 1/60s: ${cooling.tempA.toFixed(4)}, 120 steps at 1/120s: ${cooling.tempB.toFixed(4)}, theory ${cooling.theory.toFixed(4)}, ratio ${cooling.ratio.toFixed(4)} (per-step would be 3.36x)`
  );

  // ── 4: Thermal buoyancy is zero on level plate, active on upright plate ──
  const buoyancy = await page.evaluate(async () => {
    const N = 128;
    const probe = (Math.floor(N * 0.5) + Math.floor(N * 0.4) * N) * 4;

    // Case Level: plateUpright = 0
    await lab.create(N, N);
    lab.vel(0.5, 0.35, 0.12, [0, 0, 8.0, 0]);
    lab.flush();
    await lab.step(20, { plateUpright: 0, currentBuoy: 0.3, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const vLevel = await lab.field('vel');
    const vyLevel = vLevel[probe + 1];

    // Case Upright: plateUpright = 1
    await lab.create(N, N);
    lab.vel(0.5, 0.35, 0.12, [0, 0, 8.0, 0]);
    lab.flush();
    await lab.step(20, { plateUpright: 1, currentBuoy: 0.3, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const vUpright = await lab.field('vel');
    const vyUpright = vUpright[probe + 1];

    return { vyLevel, vyUpright };
  });

  check(
    'in-plane thermal buoyancy is zero on a level plate, active when upright',
    Math.abs(buoyancy.vyLevel) < 1e-6 && buoyancy.vyUpright > 0.0003,
    `level vy ${buoyancy.vyLevel.toFixed(6)}, upright vy ${buoyancy.vyUpright.toFixed(6)}`
  );

  // ── 5: Linear Boussinesq (tanh removed) ──
  const linearity = await page.evaluate(async () => {
    const N = 128;
    const probe = (Math.floor(N * 0.5) + Math.floor(N * 0.4) * N) * 4;

    // Moderate heat T = 15
    await lab.create(N, N);
    lab.vel(0.5, 0.35, 0.12, [0, 0, 15.0, 0]);
    lab.flush();
    await lab.step(15, { plateUpright: 1, currentBuoy: 0.3, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const v1 = await lab.field('vel');
    const vy1 = v1[probe + 1];

    // Double heat T = 30
    await lab.create(N, N);
    lab.vel(0.5, 0.35, 0.12, [0, 0, 30.0, 0]);
    lab.flush();
    await lab.step(15, { plateUpright: 1, currentBuoy: 0.3, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const v2 = await lab.field('vel');
    const vy2 = v2[probe + 1];

    return { vy1, vy2, ratio: vy2 / Math.max(vy1, 1e-6) };
  });

  check(
    'thermal buoyancy is linear with temperature (tanh removed)',
    Math.abs(linearity.ratio - 2.0) < 0.25,
    `T=15 vy ${linearity.vy1.toFixed(5)}, T=30 vy ${linearity.vy2.toFixed(5)}, ratio ${linearity.ratio.toFixed(3)} (tanh would be 1.10)`
  );

  // ── 6: Water viscosity drops ~2%/K (thin-gap mobility rises with heat) ──
  const tempVisc = await page.evaluate(async () => {
    const N = 128;
    const probe = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;

    // Cold plate (T = 0)
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.15, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { thinGap: 1, gapThickness: 0.45, drip: 0.5, plateUpright: 0, dt: 1 / 60 });
    const vCold = await lab.field('vel');
    const speedCold = Math.abs(vCold[probe + 1]);

    // Warm plate (T = 30°C across plate)
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.15, [1, 1, 1], 1.0);
    lab.vel(0.5, 0.5, 2.0, [0, 0, 30.0, 0]);
    lab.flush();
    await lab.step(30, { thinGap: 1, gapThickness: 0.45, drip: 0.5, plateUpright: 0, dt: 1 / 60, heatDecay: 1.0 });
    const vWarm = await lab.field('vel');
    const speedWarm = Math.abs(vWarm[probe + 1]);

    return { speedCold, speedWarm, ratio: speedWarm / Math.max(speedCold, 1e-6) };
  });

  check(
    'thin-gap mobility rises with heat as water viscosity drops ~2%/K',
    tempVisc.ratio > 1.4 && tempVisc.ratio < 1.8,
    `cold speed ${tempVisc.speedCold.toFixed(5)}, warm speed (30°C) ${tempVisc.speedWarm.toFixed(5)}, ratio ${tempVisc.ratio.toFixed(3)}`
  );

  // ── 7: Oil density (rho_oil ~ 0.85 < rho_water = 1.0) ──
  const oilForces = await page.evaluate(async () => {
    const N = 128;
    const midIdx = (Math.floor(N * 0.5) + Math.floor(N * 0.4) * N) * 4;

    // 1. Oil droplet on upright plate: floats upward (+y)
    await lab.create(N, N);
    lab.solver().addMix(0.5, 0.4, 0.12, { oil: 1 });
    lab.flush();
    await lab.step(20, { plateUpright: 1, solutalBuoyancy: 0.5, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const vyOil = (await lab.field('vel'))[midIdx + 1];

    // 2. Heavy wax droplet on upright plate: sinks downward (-y)
    await lab.create(N, N);
    lab.dye(0.5, 0.4, 0.12, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(20, { plateUpright: 1, solutalBuoyancy: 0.5, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const vyWax = (await lab.field('vel'))[midIdx + 1];

    // 3. Oil droplet on level plate: in-plane buoyancy is zero
    await lab.create(N, N);
    lab.solver().addMix(0.5, 0.4, 0.12, { oil: 1 });
    lab.flush();
    await lab.step(20, { plateUpright: 0, solutalBuoyancy: 0.5, dt: 1 / 60, gravityX: 0, gravityY: -1 });
    const vyLevel = (await lab.field('vel'))[midIdx + 1];

    return { vyOil, vyWax, vyLevel };
  });

  check(
    'oil is less dense than water (rho_oil ~ 0.85): oil rises on upright plate while wax sinks',
    oilForces.vyOil > 0.005 && oilForces.vyWax < -0.02 && Math.abs(oilForces.vyLevel) < 1e-6,
    `oil vy +${oilForces.vyOil.toFixed(5)}, wax vy ${oilForces.vyWax.toFixed(5)}, level vy ${oilForces.vyLevel.toFixed(6)}`
  );

  // ── 8: Packed velocity export preserves temperature in channel z ──
  const packTemp = await page.evaluate(async () => {
    const N = 128;
    const midIdx = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.2, [0.001, -0.002, 24.5, 0]);
    lab.flush();
    await lab.step(1, { dt: 1 / 60, heatDecay: 1.0 });
    const v = await lab.field('vel');
    return v[midIdx + 2];
  });

  check(
    'packed-texture export preserves temperature in channel z',
    Math.abs(packTemp - 24.5) < 0.2,
    `temperature in channel z: ${packTemp.toFixed(2)} (expected 24.5)`
  );

  check('no GPU pass failed validation', gpuErrors.length === 0, gpuErrors.join(', '));
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length) process.exit(1);
