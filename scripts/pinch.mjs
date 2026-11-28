#!/usr/bin/env node
/**
 * A thread of oil between the glasses beads at the Rayleigh–Plateau
 * wavelength of the plate's own law, and a wave too short for it smooths out
 * (PLAN 47k). Measured on the GPU solver alone (scripts/lab.mjs) at 512², the
 * app's grid on a Mac, where the 2 mm gap is 5.1 cells: a thin gap, Oil
 * Tension 0.9, the plate level, nothing stirring.
 *
 *   npm run pinch
 *
 * What was there. 38w-27 gave a thread narrower than the gap its curvature
 * across the gap (2/w − 2/h, THREAD in src/gpu/wgsl/fluid/capillary.ts), and
 * threads beaded (`npm run beads`); but every cell's capillary force was then
 * clipped to the most the oil may move in a step (OIL_CELLS). At the oil's
 * real tension that clip binds fourteen times over on a thread's edge, so
 * every edge cell pushed at the cap whatever its curvature: the neck and the
 * bulge pushed alike, the force kept only its sign, and the law that picks a
 * bead's spacing was gone. Measured with this script on main: every wave
 * from kr 0.25 to 1.5 grew, the one at 1.5 (8.4 cells), which a real thread
 * smooths in a few milliseconds, at +0.055 a step, faster than the one at
 * 0.55; and four threads from the same ±2% noise broke into 13, 20, 24 and
 * 28 beads, 4.0 to 8.6 widths apart.
 *
 * The law. Between two glasses the liquids answer a pressure gradient as
 * Darcy says, u = M(f − ∇p), M = h²/12μ, and the plate's oil is about twice
 * as viscous as its clear liquid (oilBodyLn: M inside over M outside is m =
 * 0.53 on the default Thickness). A thread of radius r = w/2 with a varicose
 * wave e cos kx is at σ(1/r − e/r² + e k²) inside (the 1/r across the gap,
 * the k² the outline's own), and outside it the pressure is harmonic. Solving
 * both sides and matching the normal flow at the edge gives the growth rate
 *
 *   s(k) = (m σ / r³) · x sinh x (1 − x²) / (cosh x + m sinh x),   x = kr,
 *
 * zero at x = 1 (Plateau's cutoff, the same as a free thread's, since the
 * curvatures are the same) and fastest at x = 0.66, a wavelength of 9.5
 * radii, 4.7 widths (a free thread in Rayleigh's inviscid case: 9.0 radii;
 * Tomotika's, viscous, 9 to 11 radii for viscosity ratios near ours). On the
 * real gap that rate is fast, σ/r³ of about a thousand a second for a thread
 * a millimetre wide, and the explicit force cannot step it at 60 Hz (its
 * stable step is a hundredth of a frame). So the capillary pass now slows a
 * thread's whole pull by one factor (THREAD_PULL: σ to at most eight caps per
 * unit curvature and edge, about four cells³ a step), which keeps the law's
 * shape and so its wavelength, and the thread pinches in about a second
 * where a real one would in a few milliseconds: the frame cannot show those,
 * and the spacing is what one sees.
 *
 *   1. Eight threads 4 cells wide, each with one wave of 5% at kr = 0.24 to
 *      1.43, side by side across the dish; their waves' growth over the first
 *      twenty steps (a third of a second), each as a rate a step:
 *      a. the shortest, at kr = 1.5, shrinks (main: +0.055 a step);
 *      b. the fastest of the eight is at kr 0.45 to 0.8 (the law: 0.67;
 *         main: 0.85, and the four past the cutoff all grew);
 *      c. the three longest, resolved by eight cells a wave or more of the
 *         grid's two-cell edge, grow within 30% of the law's s(k) with
 *         THREAD_PULL's σ and the oil's m.
 *   2. Four threads 3.5 cells wide with ±2% of white noise in their width
 *      break into beads in two seconds, each thread's beads spaced 4.7
 *      widths (the law's fastest wave) within 15%, the plan's bar (main:
 *      4.0 to 8.6 widths, thread to thread).
 *   3. The dish makes and loses no oil, within 0.1%.
 *   And any GPU validation error fails the run.
 *
 * About four minutes on software WebGPU (PW_WEBGPU=1); no canvas.
 */
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// The law's numbers from the solver's own constants: the oil's drag over the clear liquid's, the cap, the slowed pull.
const out = 'node_modules/.cache/pinch-constants.mjs';
await build({
  stdin: {
    contents: "export { oilBodyLn, NU_REF } from './src/gpu/fluid/constants';\nexport { THREAD_PULL } from './src/gpu/wgsl/fluid/capillary';\nexport { OIL_CELLS } from './src/gpu/fluid/constants';",
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
});
const { oilBodyLn, NU_REF, THREAD_PULL, OIL_CELLS } = await import(pathToFileURL(`${process.cwd()}/${out}`).href);
const m = Math.exp(-oilBodyLn(NU_REF)); // M inside over M outside
const law = (x) => m * x * Math.sinh(x) * (1 - x * x) / (Math.cosh(x) + m * Math.sinh(x));
let xBest = 0.01;
for (let x = 0.01; x < 1; x += 0.001) if (law(x) > law(xBest)) xBest = x;
const sigmaCells = THREAD_PULL * OIL_CELLS; // the slowed σ, cells³ a step
const widthsPerBead = Math.PI / xBest; // 2π r / x over 2r

const N = 512;
const MODES = [0.25, 0.4, 0.55, 0.7, 0.85, 1.0, 1.2, 1.5]; // k × (laid half-width, 2 cells)
const W_MODE = 4, EPS = 0.05, W_NOISE = 3.5, NOISY = 4;
const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (q) => { if (/gpu error|device lost|validation/i.test(q.text())) gpuErrors.push(q.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async ({ N, MODES, W_MODE, EPS, W_NOISE, NOISY }) => {
    const T = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, oilTension: 0.9, oilBodies: 0, diff: 0 };
    await lab.create(N, N);
    const count = MODES.length + NOISY;
    // Twelve threads along x, 0.12 to 0.88 of the dish, 34 cells apart: coupled by e^(−kd), 1.4% for the longest wave.
    const ys = Array.from({ length: count }, (_, j) => 0.12 + j * 0.76 / (count - 1));
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    /*
      White noise in the width, column by column, ±2%: every wave the grid
      draws is in it, the law's fastest among them. (Seeded sines, as in
      \`npm run beads\`, start no wave shorter than 18 cells, longer than the
      fastest on a 3.5-cell thread, 16.5, and the beads then come at the
      seeds' spacing, not the law's: 5.8 widths when this was tried.)
    */
    const noise = Array.from({ length: NOISY }, () => Float32Array.from({ length: N }, () => 0.04 * (rnd() - 0.5)));
    const widthAt = (j, x, n) => {
      if (j < MODES.length) return W_MODE * (1 + EPS * Math.cos(MODES[j] / (W_MODE / 2) * x * n));
      return W_NOISE * (1 + noise[j - MODES.length][Math.min(n - 1, Math.floor(x * n))]);
    };
    lab.solver().layOil(() => 0);
    lab.solver().layOil((x, y, n) => {
      if (x < 0.12 || x > 0.88) return 0;
      let c = 0;
      for (let j = 0; j < count; j++) c = Math.max(c, Math.max(0, Math.min(1, 0.5 + (widthAt(j, x, n) / 2 - Math.abs(y - ys[j]) * n) / 2)));
      return c;
    });
    const read = async () => {
      const mx = await lab.chemistry('mix'), n = mx.n, d = mx.data;
      let total = 0;
      for (let q = 0; q < n * n; q++) total += d[q * 4];
      const threads = ys.map((yj, j) => {
        const yc = Math.round(yj * n), band = 15;
        // The wave: the width (oil summed across the band) along the middle 0.3 to 0.7, fitted to 1, cos kx, sin kx.
        let amp = 0, mean = 0;
        if (j < MODES.length) {
          const k = MODES[j] / (W_MODE / 2), i0 = Math.round(0.3 * n), i1 = Math.round(0.7 * n);
          const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
          for (let i = i0; i < i1; i++) {
            let w = 0;
            for (let jj = yc - band; jj <= yc + band; jj++) w += Math.max(0, d[(i + jj * n) * 4]);
            const v = [1, Math.cos(k * i), Math.sin(k * i)];
            for (let p = 0; p < 3; p++) { b[p] += v[p] * w; for (let o = 0; o < 3; o++) A[p][o] += v[p] * v[o]; }
          }
          const M = A.map((row, p) => [...row, b[p]]);
          for (let p = 0; p < 3; p++) {
            let best = p;
            for (let o = p + 1; o < 3; o++) if (Math.abs(M[o][p]) > Math.abs(M[best][p])) best = o;
            [M[p], M[best]] = [M[best], M[p]];
            for (let o = 0; o < 3; o++) if (o !== p) { const f = M[o][p] / M[p][p]; for (let c = p; c < 4; c++) M[o][c] -= f * M[p][c]; }
          }
          mean = M[0][3] / M[0][0];
          amp = Math.hypot(M[1][3] / M[1][1], M[2][3] / M[2][2]);
        }
        // The bodies: 4-connected cells over half oil in the thread's band, and its mean width.
        const seen = new Uint8Array(n * n);
        let bodies = 0, sum = 0, cols = 0;
        for (let i = Math.round(0.12 * n); i <= Math.round(0.88 * n); i++) {
          let w = 0;
          for (let jj = yc - band; jj <= yc + band; jj++) w += Math.max(0, d[(i + jj * n) * 4]);
          sum += w; cols++;
        }
        for (let jj = yc - band; jj <= yc + band; jj++) for (let i = 0; i < n; i++) {
          const k0 = i + jj * n;
          if (seen[k0] || d[k0 * 4] <= 0.5) continue;
          bodies++;
          const stack = [k0];
          seen[k0] = 1;
          while (stack.length) {
            const q = stack.pop(), a = q % n, bb = (q - a) / n;
            for (const [u, v] of [[a + 1, bb], [a - 1, bb], [a, bb + 1], [a, bb - 1]]) {
              if (u < 0 || u >= n || v < yc - band || v > yc + band) continue;
              const qq = u + v * n;
              if (!seen[qq] && d[qq * 4] > 0.5) { seen[qq] = 1; stack.push(qq); }
            }
          }
        }
        return { amp, mean, bodies, width: sum / cols };
      });
      return { total, threads };
    };
    const gapCells = () => lab.coverMetres() / 0.2 * N;
    const r0 = await read();
    await lab.step(20, T);
    const r20 = await read();
    await lab.step(100, T);
    const r120 = await read();
    return { gap: gapCells(), r0, r20, r120, length: 0.76 * N };
  }, { N, MODES, W_MODE, EPS, W_NOISE, NOISY });
} finally {
  await close();
}

check('no GPU pass failed validation (a force that never ran would read as a held thread)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
console.log(`   the gap ${r.gap.toFixed(1)} cells; the law: m = ${m.toFixed(2)}, fastest at kr = ${xBest.toFixed(2)} (${(2 * xBest > 0 ? 2 * Math.PI / xBest : 0).toFixed(1)} radii, ${widthsPerBead.toFixed(2)} widths), σ ${sigmaCells.toFixed(1)} cells³ a step`);
// 1. The waves.
const waves = MODES.map((x0, j) => {
  const a = r.r0.threads[j], b = r.r20.threads[j];
  const rad = a.mean / 2, x = x0 / (W_MODE / 2) * rad; // the laid width's own radius (the edge's clamp leaves it under 4)
  const rate = Math.log((b.amp / b.mean) / (a.amp / a.mean)) / 20;
  return { x, rate, model: sigmaCells / rad ** 3 * law(x), lambdaCells: 2 * Math.PI / (x0 / (W_MODE / 2)) };
});
for (const w of waves) console.log(`   kr ${w.x.toFixed(2)} (a wave ${w.lambdaCells.toFixed(1)} cells): ${w.rate >= 0 ? '+' : ''}${w.rate.toFixed(4)} a step, the law ${w.model >= 0 ? '+' : ''}${w.model.toFixed(4)}`);
const short = waves[waves.length - 1];
check(`a wave at kr = ${short.x.toFixed(2)}, past Plateau's cutoff, smooths out (main: +0.055 a step)`,
  short.rate < 0, `${short.rate.toFixed(4)} a step, the law ${short.model.toFixed(4)}`);
const fastest = waves.reduce((a, b) => (b.rate > a.rate ? b : a));
check(`the fastest wave of the eight is at kr 0.45 to 0.8 (the law: ${xBest.toFixed(2)}; main: 0.85)`,
  fastest.x >= 0.45 && fastest.x <= 0.8, `kr ${fastest.x.toFixed(2)}, ${fastest.rate.toFixed(4)} a step`);
const resolved = waves.filter((w) => w.lambdaCells >= 22);
const off = resolved.map((w) => w.rate / w.model - 1);
check(`the ${resolved.length} longest waves grow at the law's rate within 30%`,
  off.every((e) => Math.abs(e) < 0.3), off.map((e, i) => `kr ${resolved[i].x.toFixed(2)} ${e >= 0 ? '+' : ''}${(100 * e).toFixed(0)}%`).join(', '));
// 2. The beads.
const noisy = r.r120.threads.slice(MODES.length);
const each = noisy.map((t, j) => r.length / t.bodies / r.r0.threads[MODES.length + j].width);
check(`four threads ${W_NOISE} cells wide each break into beads ${widthsPerBead.toFixed(1)} widths apart within 15% (main: 4.0 to 8.6)`,
  each.every((e) => Math.abs(e / widthsPerBead - 1) < 0.15),
  `${noisy.map((t) => t.bodies).join(', ')} beads, ${each.map((e) => e.toFixed(2)).join(', ')} widths a bead`);
// 3. The oil.
const drift = Math.abs(r.r120.total / r.r0.total - 1);
check('the dish makes and loses no oil (its total within 0.1%)', drift < 0.001, `${r.r0.total.toFixed(1)} → ${r.r120.total.toFixed(1)} cells' worth`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
