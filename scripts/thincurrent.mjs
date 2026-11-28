#!/usr/bin/env node
/**
 * Does a thin gap take the lasting current's forces into its own field, or
 * run the current's own solver on the half-resolution grid beside it?
 *
 *   npm run thincurrent
 *
 * PLAN 18a-4. The lasting current is three body forces written as the speed
 * each drives the liquid at: a standing plate's warm liquid lifted (Buoyancy),
 * the dye's weight drawn to the dish's middle (Center Gravity), and the boil's
 * lift. On a thin gap the thin solve already takes every push as a speed at
 * the rest gap and makes it conserve liquid at the gap's drag, but the
 * current was still relaxed into a field of its own on the M = N/2 grid
 * (Damping, a lag of seconds where the drag's is milliseconds), projected
 * there by ten Jacobi sweeps, and laid into the flow through the bilinear,
 * thirteen dispatches a step. Now forcesB takes the drive at its own cells
 * (CURRENT_DRIVE_WGSL, src/gpu/wgsl/fluid/forces.ts). Measured in the lab at
 * 128² over a 128² plate, so the lab's deltas reach the solver cell for cell:
 *
 *   kernels  one watched step of a thin gap runs none of the current's four
 *            kernels (currentForces, curDivergence, curPressure, curGradient);
 *            the old plate, the control, runs all four
 *   lift     a warm spot on a standing thin plate rises, and its first step's
 *            speed is the same at Damping 0.8 and 0.99, within 5%: what lag is
 *            left is the gap's own drag, not Damping's relaxation (main's
 *            first step at 0.99 over its first at 0.8 read 0.37 for the lift
 *            and 0.05 for the pull, the current's (1 − d)). The drive is held under the cap, where the
 *            cap would hide a lag (a capped current is at its cap at once).
 *   pull     the same for a heavy spot drawn to the middle (Center Gravity)
 *   facets   the lift laid at the solver's cells, not as the M grid's 2×2
 *            facets. A field brought up 2× by the bilinear is linear between
 *            M samples, so its second difference along x comes in equal
 *            pairs, d²(2i) = d²(2i + 1); a smooth field's does not. The
 *            score is rms(d²(2i) − d²(2i + 1)) over rms(d²(2i + 1) − d²(2i + 2))
 *            over the plume: near 0 for facets, near 1 for a smooth field.
 *            Bar 0.8 (main's thin gap read 0.46). The control: the old
 *            plate's own current, read on its M grid and brought up by the
 *            same bilinear as bilerpN, must read under 0.1.
 *
 * The settled speeds are printed: main's thin gap settles on the same drive,
 * capped the same way, so step 40 on main and here are compared in the PR.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });

try {
  const r = await page.evaluate(async () => {
    const N = 128;
    const CURRENT = ['currentForces', 'curDivergence', 'curPressure', 'curGradient'];
    // A smooth warm spot (temperature in vel.z), Gaussian, so a facet is the grid's and not the spot's.
    const warm = (cx, cy, s, T) => {
      const v = new Array(N * N * 4).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const dx = (i + 0.5) / N - cx, dy = (j + 0.5) / N - cy;
        v[(i + j * N) * 4 + 2] = T * Math.exp(-(dx * dx + dy * dy) / (2 * s * s));
      }
      return v;
    };
    const standing = { plateUpright: 1, gravityX: 0, gravityY: -1, currentBuoy: 0.3, heatDecay: 1, dt: 1 / 60, maxCurrent: 0.05 };
    // The drive under the cap: 0.3 × 0.1 K = 0.03 at the spot's middle, and 0.03 × tanh(1) of the pull.
    const T = 0.1;
    const lay = async (thin, what) => {
      await lab.create(N, N);
      if (what === 'warm') lab.addVel(warm(0.5, 0.5, 0.08, T));
      else lab.dye(0.7, 0.5, 0.12, [0.5, 0.5, 0.5], 1);
      lab.flush();
      return thin ? { thinGap: 1 } : { thinGap: 0 };
    };
    const at = (f, x, y) => { const k = (Math.floor(x * N) + Math.floor(y * N) * N) * 4; return [f[k], f[k + 1]]; };

    // kernels: what one step runs, watched at the solver's own run.
    const kernels = async (thin) => {
      const plate = await lay(thin, 'warm');
      await lab.step(3, { ...standing, ...plate });
      const s = lab.solver();
      const seen = new Set();
      const run = s.run, run2 = s.run2;
      s.run = function (pass, name, ...rest) { seen.add(name); return run.call(this, pass, name, ...rest); };
      s.run2 = function (pass, name, ...rest) { seen.add(name); return run2.call(this, pass, name, ...rest); };
      await lab.step(1, { ...standing, ...plate });
      s.run = run; s.run2 = run2;
      return { thin: s.thinGapLive, ran: CURRENT.filter((n) => seen.has(n)), forcesB: seen.has('forcesB') };
    };

    // lift / pull: the speed at the spot after one step at Damping 0.8 and 0.99, and settled (forty at 0.8).
    const settle = async (what, over) => {
      const pick = what === 'warm' ? (f) => at(f, 0.5, 0.5)[1] : (f) => -at(f, 0.7, 0.5)[0];
      const first = async (d) => {
        const plate = await lay(true, what);
        await lab.step(1, { ...over, currentDamp: d, ...plate });
        return pick(await lab.field('vel'));
      };
      const hi = await first(0.99);
      const plate = await lay(true, what);
      await lab.step(1, { ...over, currentDamp: 0.8, ...plate });
      const one = pick(await lab.field('vel'));
      await lab.step(39, { ...over, currentDamp: 0.8, ...plate });
      const forty = pick(await lab.field('vel'));
      return { hi, one, forty, damping: hi / (Math.abs(one) > 1e-12 ? one : 1e-12), thin: lab.solver().thinGapLive };
    };

    // facets: d² along x of vy, pairs within an M cell against pairs across, over the plume.
    const score = (f, n) => {
      let peak = 0;
      for (let k = 0; k < n * n; k++) peak = Math.max(peak, Math.abs(f[k * 4 + 1]));
      let within = 0, across = 0, nw = 0, na = 0;
      for (let j = 4; j < n - 4; j++) {
        const d2 = (i) => f[(i + 1 + j * n) * 4 + 1] - 2 * f[(i + j * n) * 4 + 1] + f[(i - 1 + j * n) * 4 + 1];
        for (let i = 2; i < n - 4; i += 2) {
          if (Math.abs(f[(i + j * n) * 4 + 1]) < 0.1 * peak) continue;
          within += (d2(i) - d2(i + 1)) ** 2; nw++;
          across += (d2(i + 1) - d2(i + 2)) ** 2; na++;
        }
      }
      return { score: Math.sqrt(within / Math.max(nw, 1)) / Math.max(Math.sqrt(across / Math.max(na, 1)), 1e-30), cells: nw };
    };
    // bilerpN's own bilinear, from an m² field to n²: p = uv·m − ½, its corners clamped.
    const upBilinear = (c, m, n) => {
      const out = new Float32Array(n * n * 4);
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const px = ((i + 0.5) / n) * m - 0.5, py = ((j + 0.5) / n) * m - 0.5;
        const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
        const cl = (v) => Math.max(0, Math.min(m - 1, v));
        const g = (x, y, ch) => c[(cl(x) + cl(y) * m) * 4 + ch];
        for (let ch = 0; ch < 2; ch++) {
          out[(i + j * n) * 4 + ch] = (g(x0, y0, ch) * (1 - fx) + g(x0 + 1, y0, ch) * fx) * (1 - fy) + (g(x0, y0 + 1, ch) * (1 - fx) + g(x0 + 1, y0 + 1, ch) * fx) * fy;
        }
      }
      return out;
    };
    const facets = async () => {
      let plate = await lay(true, 'warm');
      await lab.step(40, { ...standing, currentDamp: 0.8, ...plate });
      const thin = { ...score(await lab.field('vel'), N), thin: lab.solver().thinGapLive };
      plate = await lay(false, 'warm');
      await lab.step(40, { ...standing, currentDamp: 0.8, ...plate });
      const s = lab.solver();
      const c = await s.readHalf(s.cur);
      const control = { ...score(upBilinear(c.data, c.n, N), N), thin: s.thinGapLive, m: c.n };
      return { thin, control };
    };

    const pulling = { plateUpright: 0, currentGrav: 0.03, dt: 1 / 60, maxCurrent: 0.05, meanDensity: 0 };
    return {
      N,
      kThin: await kernels(true), kOld: await kernels(false),
      lift: await settle('warm', standing), pull: await settle('heavy', pulling),
      facets: await facets(),
    };
  });

  const f = (x) => x.toExponential(3);
  check('kernels: a thin gap\'s step runs none of the current\'s four kernels',
    r.kThin.thin && r.kThin.forcesB && r.kThin.ran.length === 0, `ran [${r.kThin.ran.join(', ')}]${r.kThin.thin ? '' : ', the plate ran old'}`);
  check('kernels: the old plate, the control, runs all four', !r.kOld.thin && r.kOld.ran.length === 4, `ran [${r.kOld.ran.join(', ')}]`);
  const speeds = (x) => `step 1 at Damping 0.99 ${f(x.hi)}, at 0.8 ${f(x.one)}, ratio ${x.damping.toFixed(3)} (bar 0.95–1.05); settled (step 40) ${f(x.forty)}, step 1 over it ${(x.one / x.forty).toFixed(3)}`;
  check('lift: a warm spot on a standing thin plate rises, and Damping does not lag it',
    r.lift.thin && r.lift.forty > 0 && r.lift.one > 0 && Math.abs(r.lift.damping - 1) <= 0.05, `vy ${speeds(r.lift)}`);
  check('pull: a heavy spot on a thin gap is drawn to the middle, and Damping does not lag it',
    r.pull.thin && r.pull.forty > 0 && r.pull.one > 0 && Math.abs(r.pull.damping - 1) <= 0.05, `inward speed ${speeds(r.pull)}`);
  check('facets: the thin gap\'s lift is laid at its own cells, not as the M grid\'s 2×2 facets', r.facets.thin.thin && r.facets.thin.cells > 50 && r.facets.thin.score >= 0.8,
    `pair score ${r.facets.thin.score.toFixed(3)} over ${r.facets.thin.cells} pairs (bar 0.8; facets read 0)`);
  check('facets: the control, the old plate\'s current brought up from its M grid by the bilinear, reads as facets',
    !r.facets.control.thin && r.facets.control.m === r.N / 2 && r.facets.control.cells > 50 && r.facets.control.score < 0.1,
    `pair score ${r.facets.control.score.toFixed(3)} over ${r.facets.control.cells} pairs, from ${r.facets.control.m}² (bar under 0.1)`);
  check('no GPU pass failed validation', gpuErrors.length === 0, gpuErrors.join(', '));
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length) process.exit(1);
