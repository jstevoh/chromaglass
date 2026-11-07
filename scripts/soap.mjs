#!/usr/bin/env node
/**
 * The soap is kept, and spreads in metres and seconds (PLAN 38c).
 *
 *   npm run soap
 *
 * On the GPU solver alone (scripts/lab.mjs), so it runs on SwiftShader as
 * well as Metal. What was there before, and what each line would have read
 * on it: the mix's soap faded to a tenth every ten seconds (so a minute
 * left a millionth, line 1), was clamped at a monolayer and forgotten (a
 * drop on a plate soaped ten seconds before burst as on a clean one, line
 * 3), spread by a diffusion of 0.08 cells² a step (a fifth of the plate's
 * width in a minute with nothing pushing it, against a real surfactant's
 * hundredth of a millimetre, line 2), and pulled per cell of difference in
 * two substeps whatever the grid (the same burst spread four times as fast
 * on a grid half as fine, line 4).
 *
 *   1. a closed plate keeps its soap for a minute, stirred and bursting
 *   2. with Soap Bursts at 0 the soap stays where it was put (its spread is
 *      a surfactant's molecular diffusion, a few ulps of f32 in a minute, so
 *      the rate itself is asserted on soapPlan's numbers, in node)
 *   3. a drop on a plate already soaped all over does next to nothing,
 *      where the same drop on clean water blows the dye out: the surface
 *      is full and its tension is level (the plate remembers)
 *   4. a burst's spread is the same on two grids and at two step lengths,
 *      the soap's and the dye's it carries, and the soap's is what its
 *      metres-and-seconds cap says (4·D_cap·t on its second moment)
 *   5. on a thin gap the open rim takes what the liquid carries past it, as
 *      it takes the dye, and no surface flow crosses it
 */
import { openLab } from './lab.mjs';
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The caps' and the diffusivity's numbers, as the solver has them.
const PLATE = 0.2, D_SOAP = 5e-10, D_CAP = 0.24 * (PLATE / 384) ** 2 * 60;
const SECONDS = 0.05; // a step's time: 20 Hz, so a minute is 1200 steps on SwiftShader

// soapPlan itself, bundled from the source the solver imports.
const plan = await (async () => {
  const out = await build({ entryPoints: ['src/gpu/fluid/soap.ts'], bundle: true, format: 'esm', write: false, logLevel: 'warning' });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
})();

const { page, close } = await openLab();
try {
  // The soap's total, and its second moment about the plate's middle, in plate units².
  const soapStats = () => page.evaluate(async () => {
    const m = await lab.solver().readField('mix'); const L = Math.round(Math.sqrt(m.length / 4));
    let t = 0, r2 = 0, out = 0;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const g = m[(i + j * L) * 4 + 1], x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5;
      t += g; r2 += g * (x * x + y * y); if (Math.hypot(x, y) >= 0.5) out += g;
    }
    return { total: t / (L * L), r2: r2 / Math.max(t, 1e-12), out: out / (L * L) };
  });

  // ── 1: kept ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => {
    lab.dye(0.5, 0.5, 0.35, [1, 1, 1], 1);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 12; k++) lab.vel(0.2 + 0.6 * r(), 0.2 + 0.6 * r(), 0.08, [(r() - 0.5) * 3, (r() - 0.5) * 3, 0, 0]);
    lab.flush();
    for (let k = 0; k < 5; k++) lab.solver().addMix(0.3 + 0.1 * k, 0.35 + 0.07 * k, 0.06, { soap: 1 });
  });
  const kept0 = await soapStats();
  await page.evaluate((s) => lab.step(1200, { surfactantFlow: 1, magnetSeconds: s }), SECONDS);
  const kept1 = await soapStats();
  check('a closed plate keeps its soap for a minute, stirred and bursting', Math.abs(kept1.total / kept0.total - 1) < 0.01,
    `${kept0.total.toFixed(5)} → ${kept1.total.toFixed(5)} of a monolayer over the plate (${((kept1.total / kept0.total - 1) * 100).toFixed(2)}%)`);

  // ── 2: molecular diffusion alone ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.08, { soap: 1 }));
  const still0 = await soapStats();
  await page.evaluate((s) => lab.step(1200, { surfactantFlow: 0, magnetSeconds: s }), SECONDS);
  const still1 = await soapStats();
  check('with Soap Bursts at 0 the soap stays where it was put', Math.abs(still1.r2 - still0.r2) < 0.002 * still0.r2 && Math.abs(still1.total / still0.total - 1) < 0.01,
    `second moment ${still0.r2.toFixed(6)} → ${still1.r2.toFixed(6)} (the old 0.08 cells² a step would have added ${(4 * 0.08 * 1200 / 128 ** 2).toFixed(4)})`);
  // The molecular rate, on the numbers the solver is handed: D·t/dx² at two grids and two steps.
  const molecular = [[128, 0.05], [384, 1 / 60], [512, 1 / 30]].map(([n, t]) => plan.soapPlan(0, t, n, new Float64Array(5))[4] / (D_SOAP * t / (PLATE / n) ** 2));
  check('and the soap diffuses at a surfactant\'s own 5e-10 m²/s on every grid and step', plan.SOAP_D === D_SOAP && molecular.every((r) => Math.abs(r - 1) < 1e-9),
    `soapPlan's diffusion over D·t/dx²: ${molecular.map((r) => r.toFixed(6)).join(', ')}`);

  // ── 3: the plate remembers ──
  let added = 0;
  const burst = async (soaped) => {
    await page.evaluate(() => lab.create(128, 128));
    if (soaped) {
      await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.4, { soap: 3 }));
      await page.evaluate((s) => lab.step(200, { surfactantFlow: 1, magnetSeconds: s }), SECONDS);
    }
    const pre = (await soapStats()).total;
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.3, [1, 1, 1], 1); lab.flush(); lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }); });
    added = (await soapStats()).total - pre;
    const inner = () => page.evaluate(async () => {
      const d = await lab.field('dye'); const L = 128; let a = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5) < 0.05) a += d[(i + j * L) * 4 + 3];
      return a;
    });
    const before = await inner();
    await page.evaluate((s) => lab.step(40, { surfactantFlow: 1, magnetSeconds: s }), SECONDS);
    return 1 - (await inner()) / before;
  };
  const clean = await burst(false), soapy = await burst(true);
  // A drop's dome, 1 − d²/r² at its middle, holds πr²/2 of a monolayer.
  const dome = Math.PI * 0.06 ** 2 / 2;
  check('a drop on soap is more soap in the water, not lost at a full surface', Math.abs(added / dome - 1) < 0.05,
    `the drop on the soaped plate added ${added.toFixed(5)} of a monolayer over the plate, its dome ${dome.toFixed(5)}`);
  check('a drop on clean water blows the dye out from where it lands', clean > 0.2, `${(clean * 100).toFixed(1)}% of the dye within the drop's own radius gone in 2 s`);
  check('and the same drop on a plate soaped ten seconds before does next to nothing', soapy < 0.2 * clean,
    `${(soapy * 100).toFixed(1)}% against ${(clean * 100).toFixed(1)}%`);

  // ── 4: two grids, two steps, one spread ──
  const dyeR2 = () => page.evaluate(async () => {
    const d = await lab.field('dye'); const L = 128; let t = 0, r2 = 0;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const a = d[(i + j * L) * 4 + 3], x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5; t += a; r2 += a * (x * x + y * y); }
    return r2 / t;
  });
  const spread = async (n, seconds, steps) => {
    await page.evaluate((n) => lab.create(n, 128), n);
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.15, [1, 1, 1], 1); lab.flush(); lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }); });
    const a = await soapStats(), da = await dyeR2();
    await page.evaluate(([s, k]) => lab.step(k, { surfactantFlow: 1, magnetSeconds: s }), [seconds, steps]);
    const b = await soapStats(), db = await dyeR2();
    return { grow: b.r2 - a.r2, dye: db - da, kept: b.total / a.total };
  };
  const coarse = await spread(128, SECONDS, 80), fine = await spread(256, SECONDS, 80), quick = await spread(128, 1 / 60, 240);
  const want4 = 4 * D_CAP * 80 * SECONDS / (PLATE * PLATE);
  const near = (a, b) => Math.abs(a / b - 1) < 0.1;
  check('a burst spreads the same on a grid twice as fine, the soap and the dye it carries', near(fine.grow, coarse.grow) && near(fine.dye, coarse.dye),
    `soap's second moment grows ${coarse.grow.toExponential(3)} at 128², ${fine.grow.toExponential(3)} at 256²; the dye's ${coarse.dye.toExponential(3)}, ${fine.dye.toExponential(3)}`);
  check('and the same in steps a third as long', near(quick.grow, coarse.grow) && near(quick.dye, coarse.dye),
    `soap ${quick.grow.toExponential(3)}, dye ${quick.dye.toExponential(3)} at 60 Hz against 20 Hz`);
  check('and the soap\'s by what its cap in metres and seconds says, all of it kept', [coarse, fine, quick].every((r) => Math.abs(r.grow / want4 - 1) < 0.2 && Math.abs(r.kept - 1) < 0.01),
    `4·D_cap·t is ${want4.toExponential(3)}; kept ${[coarse, fine, quick].map((r) => r.kept.toFixed(4)).join(', ')}`);

  // ── 5: the open rim ──
  // Soap well inside, pushed outward every step (a thin gap's drag stops a
  // single stir within a second): what the liquid carries past the rim leaves.
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => lab.solver().addMix(0.8, 0.8, 0.06, { soap: 1 }));
  const out0 = await soapStats();
  for (let k = 0; k < 40; k++) {
    await page.evaluate((s) => { lab.vel(0.8, 0.8, 0.12, [3, 3, 0, 0]); lab.flush(); return lab.step(1, { thinGap: 1, surfactantFlow: 1, magnetSeconds: s }); }, SECONDS);
  }
  const out1 = await soapStats();
  check('on a thin gap the open rim takes the soap the liquid carries past it', out0.out === 0 && out1.out < 1e-6 && out1.total < out0.total * 0.5,
    `${out0.total.toFixed(5)} → ${out1.total.toExponential(2)} on the plate, ${out1.out.toExponential(2)} left past the rim`);
  // A pool against the rim with nothing stirring it: the surface flow does not cross.
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => lab.solver().addMix(0.92, 0.5, 0.06, { soap: 1 }));
  const rim0 = await soapStats();
  await page.evaluate((s) => lab.step(20, { thinGap: 1, surfactantFlow: 1, magnetSeconds: s }), SECONDS);
  const rim1 = await soapStats();
  check('and a pool against the rim keeps its soap: no surface flow crosses it', rim0.out === 0 && Math.abs(rim1.total / rim0.total - 1) < 0.02,
    `${rim0.total.toFixed(5)} → ${rim1.total.toFixed(5)}`);
} finally {
  await close();
}
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `\n${bad.length} of ${checks.length} soap checks failed` : `\nall ${checks.length} soap checks pass`);
process.exit(bad.length ? 1 : 0);
