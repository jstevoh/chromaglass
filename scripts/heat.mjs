#!/usr/bin/env node
/**
 * Heat and lamp physics audit (PLAN 18f):
 *
 *   npm run heat
 *
 * Checks:
 *   1. Beer-Lambert absorption: dark dye heats up under the lamp, clear water stays cold
 *   2. Lamp dimmer: dimmer at 0 produces no heat, scales linearly at 0.5
 *   3. Newton cooling: decay is per-second (dt-independent), so 60 steps at dt=1/60
 *      and 120 steps at dt=1/120 cool to the same temperature (within 2%, vs 336% per-step)
 *   4. Thermal buoyancy: on a level plate in-plane buoyancy is zero; on an upright
 *      plate warm liquid forms an upward plume along S.up
 *   5. Linear Boussinesq: thermal buoyancy is linear in temperature (tanh removed),
 *      doubling temperature doubles the plume acceleration
 *   6. Temperature-dependent viscosity: water viscosity drops ~2%/K, so thin-gap
 *      terminal speed under gravity rises with heat (~1.5x at 30°C)
 *   7. Oil density: mix layer (oil, rho ~ 0.85) is lighter than water, so oil experiences
 *      upward buoyancy on an upright plate while heavy wax sinks, and level plate has zero
 *   8. Per-channel spectral absorption: dark dye absorbs significantly more heat than pale dye
 *      of equal volume/density (Beer-Lambert decode via lampThrough)
 *   9. The heat rides the liquid on a thin gap (PLAN 38f): a warm heavy blob sinking down a
 *      standing plate takes its heat with its colour (carryHeat)
 *
 * Owed line (PLAN 36e-6), red until built, run as `npm run heat -- --owed=once`:
 *   once  the lamp's heat diffuses once: a 50 K spot on a level plate spreads as
 *         4·κ·t with the sandwich's κ, and the same at Double Diffusion 0 and 1
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The owed lines (the convention of scripts/gap.mjs). A line named in
  --owed=<ids> is excused while the code is in main's state, and only then:
  if it passes it is no longer owed and the run says to take its id out; if
  it misses while the code has left main's state (half built, or built and
  wrong) it is a FAIL, so a build cannot hide behind the excuse.
*/
const IDS = ['once'];
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const unknown = [...owed].filter((id) => !IDS.includes(id));
if (unknown.length) check('every id in --owed is a line of this check', false, `unknown: ${unknown.join(', ')} (known: ${IDS.join(', ')})`);
/** `mainState`: what the line is owed for is absent, which is the only state an owed line is excused in. */
const line = (id, name, ok, detail, mainState) => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!mainState) return check(name, false, `${detail}; owed, but what it is owed for has been built and misses`);
  console.log(` owed  ${name} — ${detail}`);
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

    // Test C: Dimmer at half (dimmer: 0.5)
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.25, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 0.5, dt: 1 / 60 });
    const vC = await lab.field('vel');
    const tempCenterC = vC[midIdx + 2];

    return { tempCenterA, tempCornerA, tempCenterB, tempCenterC };
  });

  check(
    'Beer-Lambert absorption: dark dye heats under lamp while clear water stays cold',
    heating.tempCenterA > 0.03 && heating.tempCornerA < 0.0001,
    `dark dye ${heating.tempCenterA.toFixed(4)} K, clear water ${heating.tempCornerA.toFixed(4)} K`
  );

  check(
    'lamp dimmer at zero produces no heat and scales linearly at 0.5',
    heating.tempCenterB === 0 && Math.abs(heating.tempCenterC / Math.max(heating.tempCenterA, 1e-6) - 0.5) < 0.05,
    `dimmer 0: ${heating.tempCenterB.toFixed(4)} K, dimmer 0.5: ${heating.tempCenterC.toFixed(4)} K (${(heating.tempCenterC / Math.max(heating.tempCenterA, 1e-6)).toFixed(3)}x of dimmer 1)`
  );

  // ── 2b: The stage is lit evenly (PLAN 38a) ──
  /*
    The condenser lights the liquid evenly; the hot-spot is light the lens's
    aperture turns away after the liquid (src/gpu/wgsl/lampField.ts). So two
    equal dark pools, one on the axis and two off it, warm alike. The old
    1 / (1 + 2.5 r²), centred on the plate, warmed the one at (0.25, 0.25)
    to 0.77 of the middle one; the control is that they warm at all.
  */
  const even = await page.evaluate(async () => {
    const N = 128;
    const at = (x, y) => (Math.floor(N * x) + Math.floor(N * y) * N) * 4 + 2;
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.08, [1, 1, 1], 1.0);
    lab.dye(0.25, 0.25, 0.08, [1, 1, 1], 1.0);
    lab.dye(0.12, 0.5, 0.08, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 1.0, dt: 1 / 60 });
    const v = await lab.field('vel');
    return { mid: v[at(0.5, 0.5)], off: v[at(0.25, 0.25)], rim: v[at(0.12, 0.5)] };
  });
  check(
    'the lamp lights the liquid evenly: a dark pool off the axis warms as one on it does',
    even.mid > 0.03 && Math.abs(even.off / even.mid - 1) < 0.03 && Math.abs(even.rim / even.mid - 1) < 0.03,
    `on the axis ${even.mid.toFixed(4)} K, at (0.25, 0.25) ${even.off.toFixed(4)} K (${(even.off / Math.max(even.mid, 1e-6)).toFixed(3)}x), at (0.12, 0.5) near the rim ${even.rim.toFixed(4)} K (${(even.rim / Math.max(even.mid, 1e-6)).toFixed(3)}x)`
  );

  // ── 3: Newton cooling is per-second, not per-step ──
  const cooling = await page.evaluate(async () => {
    const N = 128;
    const mid = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;

    // Run A: 60 steps at dt = 1/60 (total time = 1.0s)
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.25, [0, 0, 10.0, 0]);
    lab.flush();
    await lab.step(60, { thinGap: 1, dimmer: 0.0, heatDecay: 0.98, dt: 1 / 60, diff: 0, nu: 0, advection: 0 });
    const vA = await lab.field('vel');
    const tempA = vA[mid + 2];

    // Run B: 120 steps at dt = 1/120 (total time = 1.0s)
    await lab.create(N, N);
    lab.vel(0.5, 0.5, 0.25, [0, 0, 10.0, 0]);
    lab.flush();
    await lab.step(120, { thinGap: 1, dimmer: 0.0, heatDecay: 0.98, dt: 1 / 120, diff: 0, nu: 0, advection: 0 });
    const vB = await lab.field('vel');
    const tempB = vB[mid + 2];

    const theory = 9.9765625 * Math.pow(0.98, 4.0);
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

  // ── 8: Per-channel spectral absorption (Beer-Lambert decode via lampThrough) ──
  const spectralHeating = await page.evaluate(async () => {
    const N = 128;
    const midIdx = (Math.floor(N * 0.5) + Math.floor(N * 0.5) * N) * 4;

    // Dark black dye: absorbances [1, 1, 1], density 1.0
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.25, [1, 1, 1], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 1.0, dt: 1 / 60 });
    const tempDark = (await lab.field('vel'))[midIdx + 2];

    // Pale dye: absorbances [0.05, 0.05, 0.05], same density 1.0
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.25, [0.05, 0.05, 0.05], 1.0);
    lab.flush();
    await lab.step(30, { dimmer: 1.0, dt: 1 / 60 });
    const tempPale = (await lab.field('vel'))[midIdx + 2];

    return { tempDark, tempPale, ratio: tempDark / Math.max(tempPale, 1e-6) };
  });

  check(
    'per-channel spectral absorption: dark dye absorbs significantly more heat than pale dye',
    spectralHeating.ratio > 8.0,
    `dark dye ${spectralHeating.tempDark.toFixed(4)} K, pale dye ${spectralHeating.tempPale.toFixed(4)} K, ratio ${spectralHeating.ratio.toFixed(2)} (total density alone would give 1.00x)`
  );

  // ── 9: The heat rides the liquid on a thin gap (PLAN 38f) ──
  /*
    A thin gap never self-advects the velocity, and the temperature lives in
    its z, so until 38f the lamp's heat stayed in the cell it was laid in
    while the flow moved the liquid out from under it: Lava Lamp's warmed wax
    rose out of its own heat. Here a heavy dyed blob, a little warm, sinks
    down a standing plate by its own weight, and its heat has to go down
    with it, as far: the line asks the heat's centre to follow the colour's
    to within a fifth of the distance, where without the carry the heat
    stays where it was laid (a shift of 0). No lamp and no cooling, so the
    heat in the dish is kept too: Heat Decay 1, the lamp dimmed, and the blob
    laid in the lower half (0.40, its top at 0.48), where a standing plate's
    glass rides the warm liquid, not in the upper half, whose cool glass
    takes the heat (PLAN 27f-9e: laid at 0.62 it kept 69.6% of its heat
    there, the cooling working, not the carry failing). The blob is barely warm (half a unit), so
    its heat's lift is small beside its colour's weight. Measured with the
    carry switched off: colour -2.82 cells, heat 0.00.
  */
  const rides = await page.evaluate(async () => {
    const N = 128;
    const over = { thinGap: 1, gapThickness: 0.45, plateUpright: 1, gravityX: 0, gravityY: -1, solutalBuoyancy: 0.5,
      dimmer: 0, heatDecay: 1, currentBuoy: 0, dt: 1 / 60 };
    const inDish = (i, j) => ((i + 0.5) / N - 0.5) ** 2 + ((j + 0.5) / N - 0.5) ** 2 < 0.45 * 0.45;
    const gapAt = (sq, i, j) => sq.gap[Math.floor(j * sq.n / N) * sq.n + Math.floor(i * sq.n / N)];
    const heatOf = (v, sq) => {
      let h = 0, hy = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (!inDish(i, j)) continue;
        const t = v[(j * N + i) * 4 + 2] * gapAt(sq, i, j);
        h += t; hy += t * (j + 0.5) / N;
      }
      return { h, y: hy / Math.max(h, 1e-9) };
    };
    const dyeY = (d) => {
      let a = 0, ay = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const w = d[(j * N + i) * 4 + 3]; a += w; ay += w * (j + 0.5) / N; }
      return ay / Math.max(a, 1e-9);
    };
    // The sealed bottle's kernels first, as the app builds them before a standing plate (PLAN 27f-9).
    await lab.create(N, N);
    for (let k = 0; k < 40 && !lab.solver().sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
    lab.dye(0.5, 0.40, 0.08, [1, 1, 1], 1.0);
    lab.vel(0.5, 0.40, 0.08, [0, 0, 0.5, 0]);
    lab.flush();
    await lab.step(1, over);
    const dye0 = dyeY(await lab.field('dye'));
    const heat0 = heatOf(await lab.field('vel'), await lab.squeeze());
    await lab.step(90, over);
    const dye1 = dyeY(await lab.field('dye'));
    const heat1 = heatOf(await lab.field('vel'), await lab.squeeze());
    return { dyeShift: (dye1 - dye0) * N, heatShift: (heat1.y - heat0.y) * N, kept: heat1.h / heat0.h };
  });

  check(
    'the heat rides the liquid on a thin gap: a sinking warm blob takes its heat down with its colour (PLAN 38f)',
    rides.dyeShift < -1 && rides.heatShift < 0.8 * rides.dyeShift && rides.heatShift > 1.2 * rides.dyeShift && Math.abs(rides.kept - 1) < 0.03,
    `colour moved ${rides.dyeShift.toFixed(2)} cells, heat ${rides.heatShift.toFixed(2)} (0 without the carry), heat kept ${(rides.kept * 100).toFixed(1)}%`
  );

  // ── 36e-6 (lift): not a line yet, and why ──
  /*
    The item also asks that warm water rise at the Hele-Shaw speed of its own
    lift, (ρ(20 °C) − ρ(T))·g·h²/(12·μ(T)) with water's μ at the patch's T. A
    line for it was written (an 80 °C patch, dyed, low on a standing water
    gap, its dye's rise between 2.5 and 3 s held to a Darcy solve on the
    plate's own temperature field, bar 0.85 to 1.15), and a review of it
    measured on main (2026-11-21) that building 36e-6 alone cannot pass it,
    so it is not owed here: an owed line has to be one the item's build can
    turn green. Main's numbers:

      as written                         dye rises 11.61 mm/s
      Buoyancy 0                                    9.65 mm/s
      no heat patch at all                         16.56 mm/s
      boil off                    about 143 mm/s in 0.5 s
      plate level                                   0.00 mm/s
      heat kept on the standing plate     0.20 / 0.09 (0.09 after 3 s)

    Two things the line does not own move the water. The dye climbs a
    standing plate with no heat laid at all, faster than with it: most
    likely the lamp-floor kick of the capillary pass reading the dye as wax
    (src/gpu/wgsl/fluid/capillary.ts, around line 426), a lift that has
    nothing to do with temperature. And the heat is gone too soon to lift
    anything: with the boil live on a standing plate, 9% of it is left after
    3 s, where air cooling the two faces of a 2 mm water gap between two
    1 mm glasses takes minutes: the sandwich holds ρc·d ≈ 1.26e4 J/(m²·K)
    (water 4.18e6 × 2 mm, glass 2.1e6 × 2 mm), so at h = 10 W/(m²·K) a face
    (still air and radiation) it falls to 1/e in ρc·d / 2h ≈ 630 s, and even
    a generous 50 a face leaves two minutes; main's falls to 1/e in about
    1.2 s (9% left at 3 s is e to the −2.4). So lift
    waits on two other fixes, the dye's own climb and the boil's heat loss
    on a standing plate, and comes back as a line after them, with its
    prediction (Kell's density and Vogel's viscosity for water, a Darcy
    solve with harmonic-mean face mobilities on the sealed dish) as the
    draft had it.
  */

  // ── owed 36e-6 (once): the lamp's heat diffuses once ──
  /*
    What the audit found: with the boil running, the boil's own conduction
    spreads the heat (water and glass together, lampBoil.ts), and the
    solver's older heat diffusion (fluid.ts, at water's κ, 1.4e-7 m²/s,
    times 1 + 99·Double Diffusion) runs as well, because it is gated on
    nothing; the heat carry beside it is gated off while the boil runs, the
    diffusion was not. So the heat spreads twice, and at Double Diffusion 1
    a hundred times too fast.

    The real law. Heat in a plate of water between two glasses spreads
    sideways by conduction through all three layers at once, so its
    diffusivity is the sandwich's: κ = (k_w·d + k_g·2t_g)/(ρc_w·d + ρc_g·2t_g)
    with water's k 0.6 W/(m·K) and ρc 4.18e6 J/(m³·K), glass's k 1.0 and
    ρc 2.1e6 (2500 kg/m³ times 840 J/(kg·K)), a water gap d of 2 mm and two
    1 mm glasses (the boil's GLASS_THICK of 2 mm in all): 2.6e-7 m²/s, a
    little under twice water's alone because glass conducts better and holds
    less. In two dimensions a conserved spot's second moment about its centre
    grows by exactly 4κt whatever its shape (and a uniform cooling would not
    change it), so over t = 10 s the spot's ⟨r²⟩ grows by 10.2 mm², 4.18
    cells² at the 128 grid's 1.5625 mm cells. Diffusing once at water's κ
    alone would give 2.3; diffusing once by the sandwich and again at
    water's κ gives about 6.5.

    The line lays a 50 K spot in still water on a level plate (no flow, so
    the moment is conduction alone), the boil running with the lamp dimmed,
    and steps 100 steps of 0.1 s at Double Diffusion 0 and again at 1. Bar:
    the growth at 0 within 15% of 4κt with the sandwich's κ, and the growth
    at 1 within 10% of the growth at 0, since the boil's conduction is the
    plate's one diffusion and Double Diffusion (a show's knob for the older
    diffusion) has nothing left to scale while it runs.

    Why a look cannot pass. The moment is a number with no picture in it: a
    build that blurs the heat less to look right passes only if what is left
    is one conduction at the sandwich's κ, and turning down one of the two
    diffusions until 0 matches still fails at 1 unless the gated one is the
    older one. What the build must add: the older heat diffusion (fluid.ts,
    heatVisc) skipped while the boil runs, as the heat carry already is.

    mainState: both halves in main's state, the growth at 0 over 1.3 of
    4κt (main 1.53) and the growth at 1 over three times that at 0 (main
    about 28): a build that gates the diffusion at one setting and not the
    other leaves main's state and is red.
  */
  {
    const N = 128, dx = 0.2 / N, t = 10;
    const kappa = (0.6 * 0.002 + 1.0 * 0.002) / (4.18e6 * 0.002 + 2500 * 840 * 0.002);
    const expected = (4 * kappa * t) / (dx * dx);
    const grow = await page.evaluate(async (N) => {
      const inDish = (i, j) => ((i + 0.5) / N - 0.5) ** 2 + ((j + 0.5) / N - 0.5) ** 2 < 0.45 * 0.45;
      const r2 = (v) => {
        let h = 0, x = 0, y = 0, m = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (!inDish(i, j)) continue;
          const t = Math.max(0, v[(j * N + i) * 4 + 2]);
          h += t; x += t * (i + 0.5); y += t * (j + 0.5);
        }
        x /= h; y /= h;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          if (!inDish(i, j)) continue;
          const t = Math.max(0, v[(j * N + i) * 4 + 2]);
          m += t * ((i + 0.5 - x) ** 2 + (j + 0.5 - y) ** 2);
        }
        return { h, r2: m / h };
      };
      const out = {};
      for (const dd of [0, 1]) {
        await lab.create(N, N);
        lab.vel(0.5, 0.5, 0.05, [0, 0, 50, 0]);
        lab.flush();
        const over = { thinGap: 1, plateUpright: 0, heat: 0.001, dimmer: 0, heatDecay: 1, doubleDiffusion: dd, dt: 1 / 60, magnetSeconds: 0.1 };
        await lab.step(1, over);
        const a = r2(await lab.field('vel'));
        await lab.step(100, over);
        const b = r2(await lab.field('vel'));
        out[dd] = { grow: b.r2 - a.r2, kept: b.h / a.h };
      }
      return out;
    }, N);
    const r0 = grow[0].grow / expected, r1 = grow[1].grow / grow[0].grow;
    line('once',
      'the lamp\'s heat diffuses once, at the water-and-glass sandwich\'s κ, whatever Double Diffusion says (PLAN 36e-6)',
      Math.abs(r0 - 1) < 0.15 && Math.abs(r1 - 1) < 0.1,
      `⟨r²⟩ grew ${grow[0].grow.toFixed(2)} cells² in 10 s at Double Diffusion 0, 4κt is ${expected.toFixed(2)} (κ ${kappa.toExponential(2)} m²/s), ratio ${r0.toFixed(2)}, bar 0.85–1.15; at 1 it grew ${grow[1].grow.toFixed(1)}, ${r1.toFixed(2)} times, bar 0.9–1.1; heat kept ${grow[0].kept.toFixed(2)}`,
      r0 > 1.3 && r1 > 3);
  }

  check('no GPU pass failed validation', gpuErrors.length === 0, gpuErrors.join(', '));
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length) process.exit(1);
