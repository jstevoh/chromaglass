#!/usr/bin/env node
/**
 * A drop of oil between the glasses rounds, and a shear stretches it, as
 * Darcy and Young–Laplace say, at every size the app's grid draws (PLAN
 * 47z-2, 38e-2). Measured on the GPU solver alone (scripts/lab.mjs) at 512²,
 * the app's grid on a Mac, where the 2 mm gap is 5.1 cells: a thin gap, Oil
 * Tension 0.9, the plate level.
 *
 *   npm run droplaw
 *
 * What was there. 47z-2 asks a stirred pool to break into a crowd of many
 * sizes, and its plan said to measure that first. Stirred in the lab
 * (Turbulence 0.5, five seconds), a pool a quarter of the dish across stayed
 * one body; under a laid shear, drops from 8 to 48 cells across stretched
 * into ribbons whatever their size. The reason was the cap. Every cell's
 * capillary force was clipped to half a cell a step (OIL_CELLS), and the
 * force sits in an edge two or three cells wide, so its size there is about
 * σ/(R·w): at 512² the clip bound on every drop under about forty-five
 * cells' radius (18 mm, most of a crowd), where past it the force keeps only
 * its sign and a drop's rounding loses the 1/R³ that sets it. A slightly
 * oval drop rounded at 2% of the law at R 10 cells, 4% at 20, 21% at 40;
 * a stirred one had nothing to resist its stretching but the diffuse
 * edge's own smoothing. The cap is half a cell whatever the grid, so the
 * finer the grid the more it bit (at 256², 0.21 of the law at R 5 and 0.8
 * from R 10 up), which is why the checks on 192² never saw it.
 *
 * The law. Between two glasses u = M(f − ∇p), M = h²/12μ, the oil m times
 * as mobile as the water (oilBodyLn: m = 0.51), and across the drop's edge
 * the pressure jumps by σκ (Young–Laplace; the 2/h across the gap is the
 * same all round and moves nothing). An edge r = R(1 + ε sin 2θ) has
 * κ = (1 + 3ε sin 2θ)/R; the pressure is harmonic on both sides, the flow
 * across the edge is continuous, and
 *
 *   dε/dt = (2m/(1+m)) (E − 3Mσε/R³)
 *
 * in a strain E (a simple shear γ̇ is a strain γ̇/2 and a turning, which
 * rotates a round drop and does not deform it). So at rest the oval decays
 * at λ = (2m/(1+m)) 3Mσ/R³, and in a shear the drop holds at
 * ε = γ̇R³/(6Mσ), the plate's own capillary number (Ca, the 4μγ̇R³/h²σ the
 * confined drop's literature writes, not the free drop's μγ̇R/σ: confined,
 * the critical size goes as γ̇^(−1/3), not γ̇^(−1)). Mσ is read here from
 * the solver's own constants (oilMobility, OIL_TENSION_SIGMA, oilBodyLn),
 * in the flow's units, as the solver lays it.
 *
 *   1. At rest, three ovals (ε 0.15) of radius 10, 20 and 40 cells, far
 *      apart: each one's oval part decays at 0.5 to 1.3 of the law's λ, and
 *      the rates fall as R⁻³ (their slope from R 10 to R 40 within 0.5 of
 *      3, not one size right by luck). With the old cap, R 10 at 0.01 of
 *      the law and a slope of about 0.8.
 *   2. The control: the same five with the cap put back on the thin gap
 *      (OIL_WIDE_CELLS at OIL_CELLS', a build-time edit, as the other checks'
 *      controls are) fail 1, so 1 measures the cap and not the lab.
 *   3. In a steady shear (a Kolmogorov flow, u = A sin 4πy, laid as a
 *      push every step; γ̇ read off the flow itself beside the drops, at
 *      y = 0.5 where u is zero and the shear largest), three drops on that
 *      line. R 12 and R 16, under the confined critical size, hold a steady
 *      shape (the last reads within 15% of each other), the bigger the more
 *      stretched, within a factor of four of ε = γ̇R³/(6Mσ) (they read
 *      about three and two times it: 47z-2b). R 32, past it (the law's ε
 *      0.7, where the linear answer has no steady shape), keeps stretching:
 *      its length over its breadth up a fifth or more over the run's second
 *      half, past two. The same run with the old cap must fail 3a: there
 *      every drop, R 8 too, kept stretching, since the clip had taken the
 *      1/R³ the shape is held by. Each drop's shape is its second moments
 *      weighted by its oil over a half, so a faint halo is not read as a
 *      stretch or a rounding.
 *   0. The cover glass sits at the rest gap the law's M is written for.
 *   4. The dish makes and loses no oil (its total within 0.1%), and any GPU
 *      validation error fails the run.
 *
 * About forty minutes on software WebGPU (PW_WEBGPU=1), most of it the
 * shears' hundred steps each, laid from the page; seconds on Metal; no
 * canvas.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The law's numbers from the solver's own constants.
const out = 'node_modules/.cache/droplaw-constants.mjs';
await build({
  stdin: {
    contents: "export { oilMobility, OIL_TENSION_SIGMA, oilBodyLn, NU_REF, REST_GAP_METRES, PLATE_METRES } from './src/gpu/fluid/constants';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { oilMobility, OIL_TENSION_SIGMA, oilBodyLn, NU_REF, REST_GAP_METRES, PLATE_METRES } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);

const N = 512, TENSION = 0.9;
// The reads at rest: every 2 steps to 40 (R 10 halves its oval in about five), then every 10 to 150 (R 40 loses a quarter of its in that).
const AT = [...Array.from({ length: 21 }, (_, i) => 2 * i), ...Array.from({ length: 11 }, (_, i) => 50 + 10 * i)];
// Three drops far apart (a neighbour's flow slows an oval's rounding: R 40 read 0.64 of the law 14 cells from an R 28, 0.76 alone).
const RESTING = [{ R: 10, x: 0.3, y: 0.72 }, { R: 20, x: 0.7, y: 0.72 }, { R: 40, x: 0.5, y: 0.3 }];
const RADII = RESTING.map((d) => d.R);
// The lab's own step, as the lab reports it (lab.stepDisplacement, lab.stepSeconds): a unit of flow carries disp plate widths in stepSeconds.
const { disp, stepSeconds } = await (async () => {
  const { page, close } = await openLab();
  try { return await page.evaluate((N) => ({ disp: lab.stepDisplacement(N), stepSeconds: lab.stepSeconds }), N); } finally { await close(); }
})();
const perSecond = stepSeconds / disp;
const m = Math.exp(-oilBodyLn(NU_REF));
// Mσ in the flow's units (plate widths³ a unit of the flow's time), then in cells³ a step.
const K = TENSION * oilMobility(OIL_TENSION_SIGMA) * perSecond;
const sigmaCells = K * disp * N ** 3;
const lawRest = (R) => (2 * m / (1 + m)) * 3 * sigmaCells / R ** 3;

const capped = {
  name: 'capped', setup(b) {
    b.onLoad({ filter: /fluid[\\/]constants\.ts$/ }, (a) => {
      const src = readFileSync(a.path, 'utf8');
      if (!src.includes('export const OIL_WIDE_CELLS = 3;')) throw new Error('droplaw control: OIL_WIDE_CELLS is not where the control expects it');
      return { contents: src.replace('export const OIL_WIDE_CELLS = 3;', 'export const OIL_WIDE_CELLS = 0.5;'), loader: 'ts' };
    });
  },
};

async function rest(opts) {
  const { page, close } = await openLab(opts);
  const errors = [];
  page.on('console', (q) => { if (/gpu error|device lost|validation/i.test(q.text())) errors.push(q.text().slice(0, 200)); });
  try {
    const r = await page.evaluate(async ({ N, RESTING, AT, TENSION }) => {
      const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilTension: TENSION, oilBodies: 0, diff: 0 };
      await lab.create(N, N);
      await lab.step(1, T);
      const drops = RESTING, E = 0.15;
      lab.solver().layOil(() => 0);
      lab.solver().layOil((x, y, n) => {
        let c = 0;
        for (const d of drops) {
          const r = Math.hypot((x - d.x) * n / (1 + E), (y - d.y) * n / (1 - E));
          c = Math.max(c, Math.max(0, Math.min(1, 0.5 + (d.R - r) / 2)));
        }
        return c;
      });
      // Each drop's oval part from its second moments in a square of its own, weighted by its oil over a half so a faint halo is not read as shape: (L − B)/(L + B).
      const read = async () => {
        const mx = await lab.chemistry('mix'), n = mx.n, d = mx.data;
        let total = 0;
        for (let q = 0; q < n * n; q++) total += d[q * 4];
        const shapes = drops.map((dr) => {
          const half = Math.round(1.6 * dr.R), yc = Math.round(dr.y * n), xc = Math.round(dr.x * n);
          let w = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
          for (let j = yc - half; j < yc + half; j++) for (let i = xc - half; i < xc + half; i++) {
            const c = Math.max(0, Math.min(0.5, d[(i + j * n) * 4] - 0.5));
            w += c; cx += c * i; cy += c * j; xx += c * i * i; yy += c * j * j; xy += c * i * j;
          }
          cx /= w; cy /= w; xx = xx / w - cx * cx; yy = yy / w - cy * cy; xy = xy / w - cx * cy;
          const s = Math.sqrt(Math.max(0, (xx - yy) ** 2 / 4 + xy * xy)), L = Math.sqrt((xx + yy) / 2 + s), B = Math.sqrt(Math.max(0, (xx + yy) / 2 - s));
          return (L - B) / (L + B);
        });
        return { total, shapes };
      };
      const reads = [await read()];
      for (let k = 1; k < AT.length; k++) { await lab.step(AT[k] - AT[k - 1], T); reads.push(await read()); }
      return { gap: lab.coverMetres() / 0.2 * N, reads };
    }, { N, RESTING, AT, TENSION });
    return { ...r, errors };
  } finally {
    await close();
  }
}

/*
  Each drop's rate as the slope of ln ε over the reads while ε is over a
  tenth of where it started and over 0.02 (under that the diffuse edge's own
  few thousandths of roughness, the laid disc's grid, is most of what is
  read), a least-squares line through at least three reads.
*/
const rateOf = (eps) => {
  const pts = [];
  for (let i = 0; i < eps.length; i++) { if ((eps[i] < eps[0] / 10 || eps[i] < 0.02) && pts.length >= 3) break; pts.push([AT[i], Math.log(Math.max(eps[i], 1e-6))]); }
  const n = pts.length, sx = pts.reduce((a, p) => a + p[0], 0), sy = pts.reduce((a, p) => a + p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0), sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  return -(n * sxy - sx * sy) / (n * sxx - sx * sx);
};

// The shear: its push, the steps, and the three drops on the line y = 0.5, x and radius in cells.
const SHEAR = 0.5, SHEAR_STEPS = 100, SHEAR_EVERY = 10;
const SHEARED = [{ x: 0.25, R: 12 }, { x: 0.5, R: 32 }, { x: 0.75, R: 16 }];
async function sheared(opts) {
  const { page, close } = await openLab(opts);
  const errors = [];
  page.on('console', (q) => { if (/gpu error|device lost|validation/i.test(q.text())) errors.push(q.text().slice(0, 200)); });
  try {
    const r = await page.evaluate(async ({ N, SHEARED, SHEAR, SHEAR_STEPS, SHEAR_EVERY, TENSION }) => {
      const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilTension: TENSION, oilBodies: 0, diff: 0 };
      await lab.create(N, N);
      await lab.step(1, T);
      lab.solver().layOil(() => 0);
      lab.solver().layOil((x, y, n) => {
        let c = 0;
        for (const d of SHEARED) c = Math.max(c, Math.max(0, Math.min(1, 0.5 + (d.R - Math.hypot(x - d.x, y - 0.5) * n) / 2)));
        return c;
      });
      // A Kolmogorov flow, u = SHEAR sin 4πy, laid as a push every step: on the line y = 0.5 u is zero and the shear largest.
      const push = new Array(N * N * 4).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) push[(i + j * N) * 4] = SHEAR * Math.sin(4 * Math.PI * (j + 0.5) / N);
      const read = async () => {
        const mx = await lab.chemistry('mix'), n = mx.n, d = mx.data;
        let total = 0;
        for (let q = 0; q < n * n; q++) total += d[q * 4];
        const shapes = SHEARED.map((dr) => {
          const xc = Math.round(dr.x * n), yc = Math.round(0.5 * n), hx = Math.round((dr.R > 20 ? 0.16 : 0.08) * n), hy = Math.round(0.12 * n);
          let w = 0, cx = 0, cy = 0, xx = 0, yy = 0, xy = 0;
          for (let j = yc - hy; j < yc + hy; j++) for (let i = xc - hx; i < xc + hx; i++) {
            const c = Math.max(0, Math.min(0.5, d[(i + j * n) * 4] - 0.5));
            w += c; cx += c * i; cy += c * j; xx += c * i * i; yy += c * j * j; xy += c * i * j;
          }
          cx /= w; cy /= w; xx = xx / w - cx * cx; yy = yy / w - cy * cy; xy = xy / w - cx * cy;
          const s = Math.sqrt(Math.max(0, (xx - yy) ** 2 / 4 + xy * xy)), L = Math.sqrt((xx + yy) / 2 + s), B = Math.sqrt(Math.max(0, (xx + yy) / 2 - s));
          return { eps: (L - B) / (L + B), aspect: L / B };
        });
        // γ̇ = ∂u/∂y on the line, per plate width, read only where no oil is within three rows.
        const v = await lab.field('vel'), j0 = Math.round(0.5 * n - 0.5);
        const g = [];
        for (let i = Math.round(0.1 * n); i < Math.round(0.9 * n); i++) {
          let clear = true;
          for (let jj = j0 - 3; jj <= j0 + 4; jj++) if (d[(i + jj * n) * 4] > 0.01) clear = false;
          if (clear) g.push((v[(i + (j0 + 1) * n) * 4] - v[(i + (j0 - 1) * n) * 4]) / 2 * n);
        }
        g.sort((p, q) => p - q);
        return { total, shapes, shear: g.length ? g[g.length >> 1] : NaN, clear: g.length };
      };
      const reads = [await read()];
      for (let s = 1; s <= SHEAR_STEPS; s++) {
        lab.addVel(push);
        lab.flush();
        await lab.step(1, T, true);
        if (s % SHEAR_EVERY === 0) reads.push(await read());
      }
      return { reads };
    }, { N, SHEARED, SHEAR, SHEAR_STEPS, SHEAR_EVERY, TENSION });
    return { ...r, errors };
  } finally {
    await close();
  }
}

const now = await rest({});
const ctl = await rest({ plugins: [capped], tag: 'droplaw-capped' });
const sh = await sheared({});
const shCtl = await sheared({ plugins: [capped], tag: 'droplaw-capped' });

check('no GPU pass failed validation (a force that never ran would read as a drop that keeps its shape)', now.errors.length + ctl.errors.length + sh.errors.length + shCtl.errors.length === 0, [...now.errors, ...ctl.errors, ...sh.errors, ...shCtl.errors].slice(0, 3).join(' | '));
const restCells = REST_GAP_METRES / PLATE_METRES * N;
check('0. the cover glass sits at the rest gap the law is written for (within 2%), so a gap drift cannot move both bars', Math.abs(now.gap / restCells - 1) < 0.02, `${now.gap.toFixed(2)} cells against ${restCells.toFixed(2)}`);
console.log(`   the gap ${now.gap.toFixed(1)} cells; m = ${m.toFixed(2)}; σ ${sigmaCells.toFixed(1)} cells³ a step (Mσ in the flow's units ${K.toExponential(3)})`);
const ratios = (r) => RADII.map((R, i) => rateOf(r.reads.map((x) => x.shapes[i])) / lawRest(R));
const a = ratios(now), b = ratios(ctl);
RADII.forEach((R, i) => console.log(`   R ${R} cells: the law ${lawRest(R).toFixed(4)} a step; now ${a[i].toFixed(2)} of it, with the old cap ${b[i].toFixed(2)}`));
/*
  The bar, 0.5 to 1.3 of the law. Measured 0.93, 0.79 and 0.60 for R 10, 20
  and 40 (512², the gap 5.1 cells): the biggest drop's rounding slows as it
  goes (0.76 over its first fifteen steps, 0.67 fitted over forty, 0.60
  over the hundred and fifty it now runs, so its fit is not on noise), and
  in a shear the small drops hold at about twice the law's ε (3a), both
  the diffuse edge's spurious current that OIL_WIDE_CELLS clips (PLAN
  38e-2b, 47z-2b; when balanced force lands this tightens to 30%). The old
  cap read 0.01 at R 10 and 0.18 at R 40, so the bar is far from the fault
  it guards at every size.
*/
const LO = 0.5, HI = 1.3;
check('1. at rest an oval drop rounds at the Hele-Shaw rate λ = (2m/(1+m))·3Mσ/R³, between 0.5 and 1.3 of it, at radius 10, 20 and 40 cells',
  a.every((x) => x >= LO && x <= HI), a.map((x, i) => `R ${RADII[i]} ${x.toFixed(2)}`).join(', '));
/*
  And as R⁻³: the rates' slope against R on a log scale, from R 10 to R 40,
  within half of three. The cap's sign-only force goes nearer R⁻¹ (it read
  0.8 before this), so the slope tells the law from a drop rounded by
  something else at about the right speed for one size.
*/
const slope = (r) => -Math.log((r[r.length - 1] * lawRest(RADII[RADII.length - 1])) / (r[0] * lawRest(RADII[0]))) / Math.log(RADII[RADII.length - 1] / RADII[0]);
check('   and as R⁻³: the rate\'s slope against the radius from 10 to 40 cells within 0.5 of 3', Math.abs(slope(a) - 3) < 0.5,
  `${slope(a).toFixed(2)} (with the old cap ${slope(b).toFixed(2)})`);
check('2. the control: with the old cap on the thin gap the smallest drop rounds at under half the law and the slope is off (so 1 sees the cap)',
  b[0] < 0.5 && !b.every((x) => x >= LO && x <= HI) && Math.abs(slope(b) - 3) >= 0.5, b.map((x, i) => `R ${RADII[i]} ${x.toFixed(2)}`).join(', '));
// 3. The shear: γ̇ as the mean of the reads from step 50 on (the flow is laid from rest and takes some steps to reach it).
const late = sh.reads.slice(Math.round(sh.reads.length / 2));
const gamma = Math.abs(late.reduce((a2, r) => a2 + r.shear, 0) / late.length);
console.log(`   the shear: γ̇ ${gamma.toFixed(2)} per plate width in the flow's units (read on ${late.map((r) => r.clear).join('/')} clear cells of the line; the laid push ${SHEAR})`);
const epsLaw = (R) => gamma * (R / N) ** 3 / (6 * K);
const held = SHEARED.map((d, i) => ({ ...d, i })).filter((d) => epsLaw(d.R) < 0.35);
const past = SHEARED.map((d, i) => ({ ...d, i })).filter((d) => epsLaw(d.R) >= 0.35);
for (const d of SHEARED) {
  const i = SHEARED.indexOf(d);
  console.log(`   R ${d.R}: the law's ε ${epsLaw(d.R).toFixed(3)}; read ${sh.reads.map((r) => r.shapes[i].eps.toFixed(3)).join(' ')}; aspect at the end ${sh.reads[sh.reads.length - 1].shapes[i].aspect.toFixed(2)}`);
}
/*
  Held: the last three reads within 15% of their mean, the bigger drop the
  more stretched, and within a factor of four of the law's ε. Not within
  30%: at 512² a sheared R 12 holds at about twice the law's ε and an R 16
  at 1.7 times (PLAN 47z-2b says what is owed), where at rest the same
  sizes round at the law's rate. What this holds is the change the cap
  made, and the control asks it: with the old cap every drop, R 8 too, kept
  stretching (a one-off run: R 12 0.42 and rising at step 120).
*/
const heldOf = (reads, d) => {
  const e = reads.slice(-3).map((r) => r.shapes[d.i].eps), mean = e.reduce((a2, x) => a2 + x, 0) / 3;
  return { mean, spread: (Math.max(...e) - Math.min(...e)) / mean, ratio: mean / epsLaw(d.R) };
};
const holds = (reads) => held.length >= 2 && Number.isFinite(gamma) && held.every((d) => { const h = heldOf(reads, d); return h.spread < 0.15 && h.ratio > 0.25 && h.ratio < 4; })
  && held.slice().sort((p, q) => p.R - q.R).every((d, i, all) => i === 0 || heldOf(reads, d).mean > heldOf(reads, all[i - 1]).mean);
const told = (reads) => held.map((d) => { const h = heldOf(reads, d); return `R ${d.R} ${h.mean.toFixed(3)} against ${epsLaw(d.R).toFixed(3)} (${h.ratio.toFixed(2)}), its last three within ${(100 * h.spread).toFixed(0)}%`; }).join('; ');
check('3a. in a steady shear a drop under the confined critical size holds a steady shape, the bigger the more stretched, within a factor of four of ε = γ̇R³/(6Mσ)',
  holds(sh.reads), told(sh.reads));
check('   and with the old cap it does not (so 3a sees the cap)', !holds(shCtl.reads), told(shCtl.reads));
const mid = sh.reads[Math.round(sh.reads.length / 2)], end = sh.reads[sh.reads.length - 1];
check('3b. and a drop past it keeps stretching: its length over its breadth up a fifth or more over the run\'s second half, and past two',
  past.length >= 1 && past.every((d) => end.shapes[d.i].aspect > 1.2 * mid.shapes[d.i].aspect && end.shapes[d.i].aspect > 2),
  past.map((d) => `R ${d.R} (the law's ε ${epsLaw(d.R).toFixed(2)}) ${mid.shapes[d.i].aspect.toFixed(2)} → ${end.shapes[d.i].aspect.toFixed(2)}`).join('; '));
const drift = Math.max(Math.abs(now.reads[now.reads.length - 1].total / now.reads[0].total - 1), Math.abs(end.total / sh.reads[0].total - 1));
// (The old cap's runs are controls only; their oil is theirs.)
check('4. the dish makes and loses no oil (its total within 0.1%)', drift < 0.001, `at rest ${now.reads[0].total.toFixed(1)} → ${now.reads[now.reads.length - 1].total.toFixed(1)}, sheared ${sh.reads[0].total.toFixed(1)} → ${end.total.toFixed(1)} cells' worth`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
