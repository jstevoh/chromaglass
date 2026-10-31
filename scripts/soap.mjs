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
 *   2. with Soap Bursts at 0 the soap stays where it was put: its spread is
 *      a surfactant's molecular diffusion, and the same minute moves it by
 *      what 4·D·t says
 *   3. a drop on a plate already soaped all over does next to nothing,
 *      where the same drop on clean water blows the dye out: the surface
 *      is full and its tension is level (the plate remembers)
 *   4. a burst's spread is the same on two grids, and is the spread its
 *      metres-and-seconds cap says (4·D_cap·t on the soap's second moment)
 *   5. on a thin gap the open rim takes what is carried past it, as it
 *      takes the dye, and nothing inside it
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The caps' and the diffusivity's numbers, as the solver has them.
const PLATE = 0.2, D_SOAP = 5e-10, D_CAP = 0.24 * (PLATE / 384) ** 2 * 60;
const SECONDS = 0.05; // a step's time: 20 Hz, so a minute is 1200 steps on SwiftShader

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
  check('and it spread while it was kept', kept1.r2 > kept0.r2 * 1.05,
    `second moment ${kept0.r2.toFixed(4)} → ${kept1.r2.toFixed(4)}`);

  // ── 2: molecular diffusion alone ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.08, { soap: 1 }));
  const still0 = await soapStats();
  await page.evaluate((s) => lab.step(1200, { surfactantFlow: 0, magnetSeconds: s }), SECONDS);
  const still1 = await soapStats();
  const want2 = 4 * D_SOAP * 60 / (PLATE * PLATE);
  check('with Soap Bursts at 0 the soap stays where it was put', Math.abs(still1.r2 - still0.r2) < Math.max(2 * want2, 0.002 * still0.r2) && Math.abs(still1.total / still0.total - 1) < 0.01,
    `second moment ${still0.r2.toFixed(6)} → ${still1.r2.toFixed(6)} (4·D·t is ${want2.toExponential(2)}; the old 0.08 cells² a step, ${(0.08 * 1200 / 128 ** 2 * 2).toFixed(4)})`);

  // ── 3: the plate remembers ──
  const burst = async (soaped) => {
    await page.evaluate(() => lab.create(128, 128));
    if (soaped) {
      await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.4, { soap: 3 }));
      await page.evaluate((s) => lab.step(200, { surfactantFlow: 1, magnetSeconds: s }), SECONDS);
    }
    await page.evaluate(() => { lab.dye(0.5, 0.5, 0.3, [1, 1, 1], 1); lab.flush(); lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }); });
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
  check('a drop on clean water blows the dye out from where it lands', clean > 0.2, `${(clean * 100).toFixed(1)}% of the dye within the drop's own radius gone in 2 s`);
  check('and the same drop on a plate soaped ten seconds before does next to nothing', soapy < 0.2 * clean,
    `${(soapy * 100).toFixed(1)}% against ${(clean * 100).toFixed(1)}%`);

  // ── 4: two grids, one spread ──
  const spread = async (n) => {
    await page.evaluate((n) => lab.create(n, 128), n);
    await page.evaluate(() => lab.solver().addMix(0.5, 0.5, 0.06, { soap: 1 }));
    const a = await soapStats();
    await page.evaluate((s) => lab.step(80, { surfactantFlow: 1, magnetSeconds: s }), SECONDS);
    const b = await soapStats();
    return { grow: b.r2 - a.r2, kept: b.total / a.total };
  };
  const coarse = await spread(128), fine = await spread(256);
  const want4 = 4 * D_CAP * 80 * SECONDS / (PLATE * PLATE);
  check('a burst spreads the same on a grid twice as fine', Math.abs(fine.grow / coarse.grow - 1) < 0.1,
    `second moment grows ${coarse.grow.toExponential(3)} at 128², ${fine.grow.toExponential(3)} at 256²`);
  check('and by what its cap in metres and seconds says', Math.abs(coarse.grow / want4 - 1) < 0.2 && Math.abs(fine.grow / want4 - 1) < 0.2,
    `4·D_cap·t is ${want4.toExponential(3)}`);

  // ── 5: the open rim ──
  await page.evaluate(() => lab.create(128, 128));
  await page.evaluate(() => { lab.solver().addMix(0.5, 0.5, 0.1, { soap: 1 }); lab.solver().addMix(0.88, 0.88, 0.08, { soap: 1 }); });
  const rim0 = await soapStats();
  await page.evaluate((s) => lab.step(20, { thinGap: 1, surfactantFlow: 1, magnetSeconds: s }), SECONDS);
  const rim1 = await soapStats();
  const inside0 = rim0.total - rim0.out, inside1 = rim1.total - rim1.out;
  check('on a thin gap the open rim takes the soap carried past it', rim0.out > 0.0005 && rim1.out < 1e-6,
    `outside the rim ${rim0.out.toExponential(2)} → ${rim1.out.toExponential(2)}`);
  check('and keeps what is inside it', Math.abs(inside1 / inside0 - 1) < 0.05,
    `inside ${inside0.toFixed(5)} → ${inside1.toFixed(5)}`);
} finally {
  await close();
}
const bad = checks.filter((c) => !c.ok);
console.log(bad.length ? `\n${bad.length} of ${checks.length} soap checks failed` : `\nall ${checks.length} soap checks pass`);
process.exit(bad.length ? 1 : 0);
