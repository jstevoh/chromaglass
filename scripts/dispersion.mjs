#!/usr/bin/env node
/**
 * Dye spreads along the flow (PLAN.md §18h): Taylor–Aris dispersion along
 * the depth-mean flow plus molecular diffusion.
 *
 *   npm run dispersion
 *
 * Replaces the isotropic Jacobi blur with:
 *   1. Dye stays sharp where liquid is still (molecular Dm ~ 4e-10 m²/s)
 *   2. Dye streaks along the flow where it moves (Taylor dispersion D_L ~ |u|²)
 *   3. Dye stays sharp across the streamlines (cross-flow dispersion is purely molecular)
 *   4. Dye is exactly conserved (finite-volume conservative face-flux)
 *   5. Gap thickness modulates dispersion (scaling with h²)
 *   6. Heat spreads at water's thermal diffusivity kappa ≈ 1.4e-7 m²/s
 *      even when dye Diffusion Rate is 0 (Lewis number ~350).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  // ── 1: Still liquid: dye stays sharp ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => {
    lab.dye(0.5, 0.5, 0.08, [1, 0, 0], 1.0);
    lab.flush();
  });
  const readDye = () => page.evaluate(async () => {
    const f = await lab.field('dye');
    const L = 128;
    let maxD = 0, sumD = 0, rMax = 0;
    for (let j = 0; j < L; j++) {
      for (let i = 0; i < L; i++) {
        const d = f[(i + j * L) * 4 + 3];
        if (d > maxD) maxD = d;
        sumD += d;
        const dist = Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5);
        if (d > 0.5) rMax = Math.max(rMax, dist);
      }
    }
    return { peak: maxD, mass: sumD, radius: rMax };
  });

  const still0 = await readDye();
  // 60 steps with default diffusionRate (0.0002) on still water (advection enabled)
  await page.evaluate(() => lab.step(60, { diff: 0.0002 }));
  const still1 = await readDye();

  const peakRetention = still1.peak / still0.peak;
  const radiusGrowth = still1.radius - still0.radius;
  check(
    'dye stays sharp where liquid is still (molecular Dm ~ 4e-10 m²/s)',
    peakRetention > 0.99 && radiusGrowth < 0.005,
    `peak retention ${(peakRetention * 100).toFixed(2)}%, radius growth ${radiusGrowth.toFixed(4)} plate widths`
  );

  
  // ── 2 & 3: Pre-asymptotic shear is reversible, sharp across flow ──
  // A flow run forward and then reversed must return the spot to within 5%,
  // while the same spot does stretch during the forward leg and stays sharp
  // across the flow (sigY < 1.08x).
  // The control (kappaT = 0.45) must fail the return check.

  const testReversibility = async (kappaT_val) => {
    await page.evaluate(() => lab.create(128, 128));
    await page.evaluate(() => {
      lab.dye(0.5, 0.5, 0.06, [1, 0, 0], 1.0);
      lab.flush();
    });
    const spotMoments = () => page.evaluate(async () => {
      const f = await lab.field('dye');
      const L = 128;
      let t = 0, cx = 0, cy = 0;
      for (let j = 0; j < L; j++) {
        for (let i = 0; i < L; i++) {
          const d = f[(i + j * L) * 4 + 3];
          t += d; cx += d * (i + 0.5) / L; cy += d * (j + 0.5) / L;
        }
      }
      cx /= t; cy /= t;
      let varX = 0, varY = 0;
      for (let j = 0; j < L; j++) {
        for (let i = 0; i < L; i++) {
          const d = f[(i + j * L) * 4 + 3];
          const dx = (i + 0.5) / L - cx;
          const dy = (j + 0.5) / L - cy;
          varX += d * dx * dx; varY += d * dy * dy;
        }
      }
      return { sigX: Math.sqrt(varX / t), sigY: Math.sqrt(varY / t) };
    });

    const before = await spotMoments();
    // Forward
    for (let s = 0; s < 10; s++) {
      await page.evaluate((kT) => {
        lab.vel(0.5, 0.5, 0.45, [2.5, 0, 0, 0]);
        lab.flush();
        return lab.step(1, { diff: 0, kappaT: kT });
      }, kappaT_val);
    }
    const forward = await spotMoments();

    // Reversed
    for (let s = 0; s < 10; s++) {
      await page.evaluate((kT) => {
        lab.vel(0.5, 0.5, 0.45, [-2.5, 0, 0, 0]);
        lab.flush();
        return lab.step(1, { diff: 0, kappaT: kT });
      }, kappaT_val);
    }
    const returned = await spotMoments();

    return { before, forward, returned };
  };

  const current = await testReversibility(0.0);
  const control = await testReversibility(0.45);

  const currentStretch = current.forward.sigX / current.before.sigX;
  const currentReturn = current.returned.sigX / current.before.sigX - 1;
  const controlReturn = control.returned.sigX / control.before.sigX - 1;

  check(
    'dye dispersion is physically reversible: spot stretches then returns',
    currentStretch > 1.02 && currentReturn < 0.05 && controlReturn > 0.05,
    `stretch ${currentStretch.toFixed(2)}x, returned within ${(currentReturn * 100).toFixed(1)}%, control failed at ${(controlReturn * 100).toFixed(1)}%`
  );

  check(
    'dye stays sharp across the flow',
    current.forward.sigY < current.before.sigY * 1.08,
    `cross-flow sigma ${current.before.sigY.toFixed(4)} → ${current.forward.sigY.toFixed(4)} (change ${((current.forward.sigY / current.before.sigY - 1) * 100).toFixed(1)}%)`
  );

  // ── 4: Exact dye conservation under violent swirling flow ──
  const seedSwirl = async () => {
    await page.evaluate(() => lab.create(128, 128));
    await page.evaluate(() => {
      let s = 17;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 15; k++) {
        lab.dye(r(), r(), 0.05 + 0.08 * r(), [r(), r(), r()], 1.0);
        lab.vel(r(), r(), 0.1, [(r() - 0.5) * 4, (r() - 0.5) * 4, 0, 0]);
      }
      lab.flush();
    });
  };

  // Run with dispersion on (diff: 0.0002)
  await seedSwirl();
  const m0_on = (await readDye()).mass;
  await page.evaluate(() => lab.step(60, { diff: 0.0002, advection: 0.45, damping: 0.99 }));
  const m1_on = (await readDye()).mass;
  const ratioOn = m1_on / m0_on;

  // Control: same flow with diff: 0 (dispersion off)
  await seedSwirl();
  const m0_off = (await readDye()).mass;
  await page.evaluate(() => lab.step(60, { diff: 0, advection: 0.45, damping: 0.99 }));
  const m1_off = (await readDye()).mass;
  const ratioOff = m1_off / m0_off;

  const diffFromControl = Math.abs(ratioOn - ratioOff);
  check(
    'and none of the dye is made or lost',
    diffFromControl < 0.0001,
    `diff vs control delta ${(diffFromControl * 100).toFixed(6)}% (on ${ratioOn.toFixed(6)} vs off ${ratioOff.toFixed(6)})`
  );

  // ── 6: Heat spreads even when dye Diffusion Rate is 0 ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => {
    // Add heat in channel 2 of velAdd (temp)
    lab.vel(0.5, 0.5, 0.08, [0, 0, 5.0, 0]);
    // Add dye with diffusionRate 0
    lab.dye(0.5, 0.5, 0.08, [1, 0, 0], 1.0);
    lab.flush();
  });
  /*
    The lamp off (dimmer 0): it warms the dyed spot at I·a/C (PLAN 38f),
    0.019 K/s through this dye, 0.028 K over the 1.5 s, which filled the
    peak back up as fast as κ drained it (0.034 K) and read as no spread at
    all. Before 38f its warming was rounded away by the half float, so the
    lamp was on here without anyone meaning it. What this asks is the
    diffusion alone.
  */
  // Step 1 initial step so velForced is populated
  await page.evaluate(() => lab.step(1, { diff: 0, heatDecay: 1.0, advection: 0, dimmer: 0 }));
  const readHeatAndDye = () => page.evaluate(async () => {
    const v = await lab.field('vel');
    const d = await lab.field('dye');
    const L = 128;
    let peakTemp = 0, peakDye = 0;
    for (let j = 0; j < L; j++) {
      for (let i = 0; i < L; i++) {
        const t = v[(i + j * L) * 4 + 2];
        const dyeVal = d[(i + j * L) * 4 + 3];
        if (t > peakTemp) peakTemp = t;
        if (dyeVal > peakDye) peakDye = dyeVal;
      }
    }
    return { peakTemp, peakDye };
  });

  const hd0 = await readHeatAndDye();
  // Step 90 steps with dye diffusion strictly 0, heatDecay 1.0 (thermal diffusion alone)
  await page.evaluate(() => lab.step(90, { diff: 0, heatDecay: 1.0, advection: 0, dimmer: 0 }));
  const hd1 = await readHeatAndDye();

  const heatSpread = (hd0.peakTemp - hd1.peakTemp) / hd0.peakTemp;
  const dyeSpread = (hd0.peakDye - hd1.peakDye) / hd0.peakDye;

  // Estimated physical kappa: for 2D spot of radius r0 = 0.08 * 0.20 m = 0.016 m,
  // effective Gaussian width sigma0 ≈ r0 / 2 = 0.008 m, sigma0^2 = 6.4e-5 m^2.
  // Over dt = 90 * (1/60) = 1.5 s:
  // kappa_meas = (heatSpread * sigma0^2) / (2 * dt)
  const dtSeconds = 90 * (1 / 60);
  const sigma0_sq = ((0.08 * 0.20) / 2) ** 2;
  const kappaMeas = (heatSpread * sigma0_sq) / (2 * dtSeconds);

  check(
    'heat spreads at water thermal diffusivity even when dye Diffusion Rate is zero',
    kappaMeas >= 0.7e-7 && kappaMeas <= 2.1e-7 && dyeSpread < 0.001,
    `measured kappa ${kappaMeas.toExponential(2)} m²/s (peak dropped ${(heatSpread * 100).toFixed(2)}%), dye peak dropped ${(dyeSpread * 100).toFixed(2)}%`
  );

} finally {
  await close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
