#!/usr/bin/env node
/**
 * Oil's surface tension is the oil's own, in newtons a metre, and nothing
 * caps it (PLAN 38e). Measured on the GPU solver alone (scripts/lab.mjs), on
 * a thin gap at the reference liquid (Thickness 0.45), the plate level and
 * nothing stirring.
 *
 *   npm run oiltension
 *
 * What was there: the tension was a 0–1 dial times a number set in the lab
 * (OIL_TENSION, 4e-4), and the capillary force was capped at half a cell a
 * step, which on any edge a few cells wide bit long before the force did
 * anything violent, and bit harder the finer the grid: a look's rounding was
 * the cap's, not the oil's.
 *
 *   1. A slightly oval drop relaxes as Darcy says it should between two
 *      glasses: its oval part decays at λ = h²σ/(4μR³) (Young–Laplace for the
 *      pressure, Darcy for the flow, the drop and the water round it the
 *      same viscosity, PLAN 18d-3), with h the rest gap, σ the shelf's
 *      sunflower oil against water and μ the reference liquid's: from 0.84
 *      to 1.2 of the law, after what Cahn–Hilliard alone rounds the same
 *      drop at Oil Tension 0 is taken off (the control). Measured 0.89 on
 *      SwiftShader (the diffuse edge, a few cells wide, rounds a little
 *      slow); the old dial's 4e-4 at full is σ = 0.024 by the same law, so
 *      it would sit at 0.79 and fail.
 *   2. Each bottle's own tension sets it: the same drop poured as the
 *      shelf's silicone oil (37 mN/m against sunflower's 27) relaxes faster
 *      by the ratio of the two, within 12%. Both are poured as the app pours
 *      them, the bottle handed to addMix (\`of\`), and the solver reads its
 *      tension (lib/liquidProps.ts, interfacialTension); none is typed here.
 *      One oil at a time: two oils on one plate share one σ (PLAN 38e-1).
 *   3. Nothing caps it: a thread of oil 0.036 of the plate wide (the
 *      edge's terminal speed many times the old cap's) pulls in at twice the
 *      tension in half the time. In a Darcy flow the drag answers the
 *      tension at once, so the whole motion runs on the clock h²σ/μ: the
 *      thread's aspect at twice the dial at every read to 0.75 s is its
 *      aspect at the oil's own at twice that time, within 15% (the drag time
 *      ρh²/12μ, 0.13 s, and Cahn–Hilliard keep their own clocks, which is
 *      most of that). And the thread has really moved: one body, from 12.7
 *      to under 0.7 of that, and not yet round. With the cap put back on
 *      the thin gap it fails: see the numbers in PLAN 38e's story.
 *   4. And the step stays stable without the cap at the dial's top, three
 *      times real, on a finer grid (192), where the sharpest ripple the grid
 *      draws is stiffest: the thread rounds to one body (aspect under 1.25),
 *      keeps its oil to 1%, its flow in the last of eight seconds is no more
 *      than 4.5 times the same thread's at the oil's own tension, and its
 *      last read is no faster than a second before. What is left
 *      once a drop has rounded is the diffuse edge's own current, which
 *      grows as σ does (three times, at three times the tension: measured
 *      0.27 against 0.09 of the flow's unit after eight seconds, still
 *      falling); a step the cap was holding back would grow without bound.
 *      The drag time ρh²/12μ is what keeps it so (oilMobility says why).
 *
 * Any GPU validation error fails the run.
 */
import { openLab } from './lab.mjs';
import { DEFAULT_LIQUID_TYPES } from '../src/bottles.ts';
import { interfacialTension } from '../src/lib/liquidProps.ts';
// The gap and the reference liquid as the solver takes them (REST_GAP, NU_REF in src/gpu/fluid/constants.ts).
import { DISH_METRES as PLATE_METRES, DISH_REST_GAP as REST_GAP, thicknessViscosity } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const bottle = (id) => DEFAULT_LIQUID_TYPES.find((b) => b.id === id).behaviour;
const SUN = interfacialTension(bottle('oil')), SIL = interfacialTension(bottle('silicone'));
const H = REST_GAP * PLATE_METRES, MU = 1000 * thicknessViscosity(0.45);

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async ({ SUN_OF, SIL_OF, TOP_SECONDS }) => {
    const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilBodies: 0, diff: 0, magnetSeconds: 1 / 60 };
    // The oil's amount, its equivalent radius (plate widths), the aspect of its second moments, its bodies, and the fastest flow.
    const read = async () => {
      const f = await lab.chemistry('mix'); const n = f.n; let t = 0, cx = 0, cy = 0;
      const g = new Uint8Array(n * n);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = f.data[(x + y * n) * 4]; t += c; cx += c * x; cy += c * y; g[x + y * n] = c > 0.5 ? 1 : 0; }
      cx /= t; cy /= t; let xx = 0, yy = 0, xy = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = f.data[(x + y * n) * 4]; xx += c * (x - cx) ** 2; yy += c * (y - cy) ** 2; xy += c * (x - cx) * (y - cy); }
      const tr = xx + yy, det = xx * yy - xy * xy, d = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      let bodies = 0; const seen = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) if (g[i] && !seen[i]) {
        let size = 0; const st = [i]; seen[i] = 1;
        while (st.length) {
          const q = st.pop(); size++; const x = q % n, y = (q / n) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
            const k = X + Y * n; if (g[k] && !seen[k]) { seen[k] = 1; st.push(k); }
          }
        }
        if (size > 3) bodies++;
      }
      const v = await lab.field('vel'); let fast = 0;
      for (let i = 0; i < v.length; i += 4) fast = Math.max(fast, Math.hypot(v[i], v[i + 1]));
      return { amount: t / (n * n), radius: Math.sqrt(t / (n * n) / Math.PI), aspect: Math.sqrt((tr / 2 + d) / Math.max(1e-9, tr / 2 - d)), bodies, fast };
    };
    const out = {};
    // 1, 2. An oval: five discs of 0.09 along x, ±0.02 (a stadium, aspect about 1.2).
    const oval = async (tension, of) => {
      await lab.create(128, 128);
      for (let k = -2; k <= 2; k++) lab.solver().addMix(0.5 + k * 0.01, 0.5, 0.09, { oil: 1, of });
      await lab.step(15, { ...T, oilTension: tension });
      const trace = [await read()];
      for (let k = 0; k < 6; k++) { await lab.step(15, { ...T, oilTension: tension }); trace.push(await read()); }
      return trace;
    };
    out.still = await oval(0, SUN_OF);
    out.sunflower = await oval(1, SUN_OF);
    out.silicone = await oval(1, SIL_OF);
    // 3. A thread: 41 discs of 0.018 along x, a slight wave in it.
    const thread = async (N, tension, seconds) => {
      await lab.create(N, N);
      for (let k = 0; k <= 40; k++) lab.solver().addMix(0.25 + k * 0.0125, 0.5 + 0.004 * Math.sin(k * 1.7), 0.018, { oil: 1, of: SUN_OF });
      const trace = [await read()];
      for (let k = 0; k < seconds * 4; k++) { await lab.step(15, { ...T, oilTension: tension }); trace.push(await read()); }
      return trace;
    };
    out.once = await thread(128, 1, 1.5);
    out.twice = await thread(128, 2, 0.75);
    // 4.
    out.top = await thread(192, 3, TOP_SECONDS);
    out.real = await thread(192, 1, TOP_SECONDS);
    return out;
  }, { SUN_OF: bottle('oil'), SIL_OF: bottle('silicone'), TOP_SECONDS: 8 });
} finally {
  await close();
}

const DT = 0.25;   // seconds between reads
// The oval part's rate: the slope of ln(aspect − 1) over the reads, by least squares.
const rate = (tr) => {
  const pts = tr.map((q, i) => [i * DT, Math.log(Math.max(1e-4, q.aspect - 1))]);
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  return -pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
};
const lawOf = (sigma, R) => (H * H * sigma) / (4 * MU * (R * PLATE_METRES) ** 3);
const R0 = r.sunflower[0].radius;
const still = rate(r.still), sun = rate(r.sunflower) - still, sil = rate(r.silicone) - still;
const law = lawOf(SUN, R0);
console.log(`  aspects, sunflower: ${r.sunflower.map((q) => q.aspect.toFixed(3)).join(' ')}; still: ${r.still.map((q) => q.aspect.toFixed(3)).join(' ')}`);
check('1. an oval drop relaxes at the Darcy rate h²σ/4μR³', sun > law * 0.84 && sun < law * 1.2,
  `${sun.toFixed(2)}/s against the law's ${law.toFixed(2)}/s (R ${R0.toFixed(3)} of the plate, σ ${(SUN * 1e3).toFixed(0)} mN/m, h ${(H * 1e3).toFixed(1)} mm, μ ${(MU * 1e3).toFixed(1)} mPa·s; ${still.toFixed(2)}/s with no tension, taken off)`);
const want = SIL / SUN, got = sil / sun;
check("2. each bottle's own tension sets it", Math.abs(got / want - 1) < 0.12,
  `silicone over sunflower ${got.toFixed(2)}, their tensions' ratio ${want.toFixed(2)}`);
const once = r.once[r.once.length - 1].aspect, twice = r.twice[r.twice.length - 1].aspect;
// At every read of the faster run, against the slower one at twice the time.
const worst = Math.max(...r.twice.slice(1).map((q, k) => Math.abs(q.aspect / r.once[2 * (k + 1)].aspect - 1)));
console.log(`  thread, once: ${r.once.map((q) => q.aspect.toFixed(2)).join(' ')}; twice: ${r.twice.map((q) => q.aspect.toFixed(2)).join(' ')}`);
check('3. nothing caps it: twice the tension, half the time', worst < 0.15 && once < 0.7 * r.once[0].aspect && once > 2 && r.once[r.once.length - 1].bodies === 1,
  `a thread's aspect ${r.once[0].aspect.toFixed(2)} → ${once.toFixed(2)} in 1.5 s at the oil's own, ${twice.toFixed(2)} in 0.75 s at twice it; at worst ${(100 * worst).toFixed(1)}% apart read for read`);
const top = r.top, end = top[top.length - 1];
const lastSecond = (tr) => Math.max(...tr.slice(-4).map((q) => q.fast));
const settled = lastSecond(top), real = lastSecond(r.real);
console.log(`  top: ${top.map((q) => `${q.aspect.toFixed(2)}/${q.bodies}/${q.fast.toFixed(3)}`).join(' ')}`);
console.log(`  real: ${r.real.map((q) => `${q.aspect.toFixed(2)}/${q.bodies}/${q.fast.toFixed(3)}`).join(' ')}`);
const secondAgo = top[top.length - 5].fast;
check('4. stable at the dial’s top on a finer grid', end.bodies === 1 && end.aspect < 1.25 && Math.abs(end.amount / top[0].amount - 1) < 0.01 && settled < 4.5 * real && end.fast <= secondAgo,
  `${end.bodies} body, aspect ${end.aspect.toFixed(3)}, oil ${(100 * end.amount / top[0].amount).toFixed(2)}% kept, fastest flow in the last second ${settled.toFixed(3)} against ${real.toFixed(3)} at the oil's own tension (${(settled / real).toFixed(1)}×; the diffuse edge's own current grows as σ, 3×, a runaway without bound), and falling: ${end.fast.toFixed(3)} now, ${secondAgo.toFixed(3)} a second before`);
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
