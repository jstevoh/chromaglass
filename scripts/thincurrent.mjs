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
 *   kernels  one watched step of a thin gap dispatches none of the current's
 *            four kernels (currentForces, curDivergence, curPressure,
 *            curGradient), watched at `pipeline`, which every dispatcher asks
 *            and which dispatches nothing when it returns none; the old
 *            plate, the control, dispatches all four
 *   lift     the current's share of one thin step's flow at a warm spot on a
 *            standing plate (Buoyancy up less Buoyancy 0: the thin gap lifts
 *            warm water by another path too, the dye's weight with its heat)
 *            is 5× what that other path gives, halves at half the dial, and is
 *            the same at Damping 0.99 and 0.8, within 5%: what lag is left is
 *            the gap's own drag, not Damping's relaxation (main read 0.050,
 *            the current's 1 − d). The drive is held under the cap, where a
 *            cap would hide a lag (a capped current is at its cap at once).
 *   pull     the same for a heavy spot drawn to the middle (Center Gravity)
 *   boil     with Heat up the lift is water's real density deficit (Kell),
 *            1.6× the linear lift at 30 K; a boiling plate that took the
 *            linear path would read 1.0
 *   facets   the lift's share laid at the solver's cells, not as the M grid's
 *            2×2 facets or blocks. A field brought up 2× by the bilinear is
 *            linear between M samples, so its second difference along x comes
 *            in equal pairs, d²(2i) = d²(2i + 1), and a block field's values
 *            do; a smooth field's do not. Pairs: rms(d²(2i) − d²(2i + 1)) over
 *            rms(d²(2i + 1) − d²(2i + 2)); blocks: the same on the values;
 *            both near 1 for a smooth field. Bars 0.8 (main read 0.538 on
 *            pairs). The controls: the old plate's own current, read on its M
 *            grid and brought up by bilerpN's bilinear and as blocks, must
 *            read under 0.1 on each.
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
    const standing = { plateUpright: 1, gravityX: 0, gravityY: -1, heatDecay: 1, dt: 1 / 60, maxCurrent: 0.05, currentDamp: 0.8 };
    const pulling = { plateUpright: 0, dt: 1 / 60, maxCurrent: 0.05, meanDensity: 0, currentDamp: 0.8 };
    const lay = async (thin, what, T = 0.1) => {
      await lab.create(N, N);
      if (what === 'warm') lab.addVel(warm(0.5, 0.5, 0.08, T));
      else lab.dye(0.7, 0.5, 0.12, [0.5, 0.5, 0.5], 1);
      lab.flush();
      return thin ? { thinGap: 1 } : { thinGap: 0 };
    };
    const at = (f, x, y) => { const k = (Math.floor(x * N) + Math.floor(y * N) * N) * 4; return [f[k], f[k + 1]]; };

    // kernels: what one step dispatches, watched where every dispatcher gets its pipeline (a null one dispatches nothing).
    const kernels = async (thin) => {
      const plate = await lay(thin, 'warm');
      await lab.step(3, { ...standing, currentBuoy: 0.3, ...plate });
      const s = lab.solver();
      const seen = new Set();
      const pipeline = s.pipeline;
      s.pipeline = function (name, ...rest) { const got = pipeline.call(this, name, ...rest); if (got) seen.add(name); return got; };
      await lab.step(1, { ...standing, currentBuoy: 0.3, ...plate });
      s.pipeline = pipeline;
      return { thin: s.thinGapLive, ran: CURRENT.filter((n) => seen.has(n)), forcesB: seen.has('forcesB'), seen: seen.size };
    };

    // One thin step's flow (velForced), from a fresh plate, with the current's dial at `over`.
    const first = async (what, over, T) => {
      const plate = await lay(true, what, T);
      await lab.step(1, { ...(what === 'warm' ? standing : pulling), ...over, ...plate });
      return { f: await lab.field('vel'), thin: lab.solver().thinGapLive };
    };
    // The current's own share: the flow with the dial up less the flow with it at 0 (the thin gap
    // lifts warm water by another path too, the dye's weight with its heat, hsBody).
    const share = (on, off) => on.map((x, k) => x - off[k]);

    const lift = async () => {
      const off = await first('warm', { currentBuoy: 0 });
      const on = await first('warm', { currentBuoy: 0.3 });
      const half = await first('warm', { currentBuoy: 0.15 });
      const hi = await first('warm', { currentBuoy: 0.3, currentDamp: 0.99 });
      const v = (x) => at(x.f, 0.5, 0.5)[1];
      return { thin: off.thin && on.thin && half.thin && hi.thin, off: v(off), on: v(on), half: v(half), hi: v(hi), shareF: share(on.f, off.f) };
    };
    const pull = async () => {
      const off = await first('heavy', { currentGrav: 0 });
      const on = await first('heavy', { currentGrav: 0.03 });
      const half = await first('heavy', { currentGrav: 0.015 });
      const hi = await first('heavy', { currentGrav: 0.03, currentDamp: 0.99 });
      const v = (x) => -at(x.f, 0.7, 0.5)[0];
      return { thin: off.thin && on.thin && half.thin && hi.thin, off: v(off), on: v(on), half: v(half), hi: v(hi) };
    };
    /*
      The boil (Heat up): its lift is water's real density deficit (Kell),
      not the linear one, and at 30 K that is 1.6 times the linear lift
      (Δρ 10.2 kg/m³ against 30 × 0.207). A boiling plate that took the
      linear path would read 1.0. Buoyancy small and the cap high, so
      neither is capped.
    */
    const boil = async () => {
      const over = { currentDamp: 0.8, maxCurrent: 1, dimmer: 0 };
      const lin = share((await first('warm', { ...over, currentBuoy: 0.003 }, 30)).f, (await first('warm', { ...over, currentBuoy: 0 }, 30)).f);
      const hot = await first('warm', { ...over, heat: 1, currentBuoy: 0.003 }, 30);
      const cold = await first('warm', { ...over, heat: 1, currentBuoy: 0 }, 30);
      const boiled = share(hot.f, cold.f);
      const live = lab.solver().boilLive;
      const v = (x) => at(x, 0.5, 0.5)[1];
      return { live, thin: hot.thin, lin: v(lin), boiled: v(boiled), ratio: v(boiled) / (Math.abs(v(lin)) > 1e-12 ? v(lin) : 1e-12) };
    };

    /*
      facets, on the current's own share of one step's flow (vy), along x,
      over the cells where it is over a tenth of its peak:
        pairs   rms(d²(2i) − d²(2i + 1)) over rms(d²(2i + 1) − d²(2i + 2)):
                a 2× bilinear is linear between M samples, so its d² comes
                in equal pairs and this reads 0; a smooth field reads ~1
        blocks  rms(f(2i + 1) − f(2i)) over rms(f(2i + 2) − f(2i + 1)):
                a 2×2 block field is equal in pairs and reads 0
    */
    const score = (f, n) => {
      let peak = 0;
      for (let k = 0; k < n * n; k++) peak = Math.max(peak, Math.abs(f[k * 4 + 1]));
      const g = (i, j) => f[(i + j * n) * 4 + 1];
      let pw = 0, pa = 0, bw = 0, ba = 0, cells = 0;
      for (let j = 4; j < n - 4; j++) {
        const d2 = (i) => g(i + 1, j) - 2 * g(i, j) + g(i - 1, j);
        for (let i = 2; i < n - 4; i += 2) {
          if (Math.abs(g(i, j)) < 0.1 * peak) continue;
          pw += (d2(i) - d2(i + 1)) ** 2; pa += (d2(i + 1) - d2(i + 2)) ** 2;
          bw += (g(i + 1, j) - g(i, j)) ** 2; ba += (g(i + 2, j) - g(i + 1, j)) ** 2;
          cells++;
        }
      }
      return { pairs: Math.sqrt(pw) / Math.max(Math.sqrt(pa), 1e-30), blocks: Math.sqrt(bw) / Math.max(Math.sqrt(ba), 1e-30), cells, peak };
    };
    // bilerpN's own bilinear, from an m² field to n²: p = uv·m − ½, its corners clamped; and the 2×2 block (nearest).
    const up = (c, m, n, block) => {
      const out = new Float32Array(n * n * 4);
      const cl = (v) => Math.max(0, Math.min(m - 1, v));
      const g = (x, y, ch) => c[(cl(x) + cl(y) * m) * 4 + ch];
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const px = ((i + 0.5) / n) * m - 0.5, py = ((j + 0.5) / n) * m - 0.5;
        const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
        for (let ch = 0; ch < 2; ch++) {
          out[(i + j * n) * 4 + ch] = block ? g(Math.floor((i * m) / n), Math.floor((j * m) / n), ch)
            : (g(x0, y0, ch) * (1 - fx) + g(x0 + 1, y0, ch) * fx) * (1 - fy) + (g(x0, y0 + 1, ch) * (1 - fx) + g(x0 + 1, y0 + 1, ch) * fx) * fy;
        }
      }
      return out;
    };
    const controls = async () => {
      const plate = await lay(false, 'warm');
      await lab.step(40, { ...standing, currentBuoy: 0.3, ...plate });
      const s = lab.solver();
      const c = await s.readHalf(s.cur);
      return { thin: s.thinGapLive, m: c.n, bilinear: score(up(c.data, c.n, N, false), N), block: score(up(c.data, c.n, N, true), N) };
    };

    const L = await lift();
    return {
      N,
      kThin: await kernels(true), kOld: await kernels(false),
      lift: { ...L, shareF: undefined }, facets: score(L.shareF, N), pull: await pull(), boil: await boil(),
      controls: await controls(),
    };
  });

  const f = (x) => x.toExponential(3);
  check('kernels: a thin gap\'s step dispatches none of the current\'s four kernels',
    r.kThin.thin && r.kThin.forcesB && r.kThin.seen >= 8 && r.kThin.ran.length === 0, `ran [${r.kThin.ran.join(', ')}] of ${r.kThin.seen} kernels${r.kThin.thin ? '' : ', the plate ran old'}`);
  check('kernels: the old plate, the control, dispatches all four', !r.kOld.thin && r.kOld.ran.length === 4, `ran [${r.kOld.ran.join(', ')}]`);
  for (const [name, x, what] of [['lift', r.lift, 'a warm spot on a standing thin plate rises'], ['pull', r.pull, 'a heavy spot on a thin gap is drawn to the middle']]) {
    const s1 = x.on - x.off, s2 = x.half - x.off, sh = x.hi - x.off;
    check(`${name}: ${what} by the current, in its first step, as much again at half the dial and half as much`,
      x.thin && s1 > 1e-4 && s1 >= 5 * Math.abs(x.off) && Math.abs(s1 / s2 - 2) <= 0.1,
      `first step ${f(x.on)} with the dial, ${f(x.off)} without (share ${f(s1)}, bar 5× and over 1e-4); at half the dial ${f(s2)}, ratio ${(s1 / s2).toFixed(3)} (bar 1.9–2.1)`);
    check(`${name}: Damping does not lag it (its share in the first step the same at Damping 0.99 and 0.8)`,
      x.thin && Math.abs(sh / s1 - 1) <= 0.05, `${f(sh)} against ${f(s1)}, ratio ${(sh / s1).toFixed(3)} (bar 0.95–1.05; main read 0.050 for both)`);
  }
  check('boil: with Heat up, a thin gap\'s lift is water\'s real density deficit, not the linear one',
    r.boil.live && r.boil.thin && r.boil.lin > 1e-4 && r.boil.ratio >= 1.3,
    `share at 30 K boiling ${f(r.boil.boiled)} against linear ${f(r.boil.lin)}, ratio ${r.boil.ratio.toFixed(3)} (bar 1.3; Kell at the middle 1.6, linear 1.0)${r.boil.live ? '' : ', the boil never ran'}`);
  const fs = r.facets;
  check('facets: the current\'s share of a thin step is laid at the solver\'s cells, neither as 2×2 facets nor 2×2 blocks',
    r.lift.thin && fs.cells > 50 && fs.peak > 1e-4 && fs.pairs >= 0.8 && fs.blocks >= 0.8,
    `pair score ${fs.pairs.toFixed(3)}, block score ${fs.blocks.toFixed(3)} over ${fs.cells} cells, peak ${f(fs.peak)} (bars 0.8; main read 0.538 on pairs)`);
  const c = r.controls;
  check('facets: the controls, the old plate\'s current brought up from its M grid by the bilinear and as blocks, read as facets and as blocks',
    !c.thin && c.m === r.N / 2 && c.bilinear.cells > 50 && c.bilinear.pairs < 0.1 && c.block.blocks < 0.1,
    `bilinear pair score ${c.bilinear.pairs.toFixed(3)}, block score ${c.block.blocks.toFixed(3)}, from ${c.m}² (bars under 0.1)`);
  check('no GPU pass failed validation', gpuErrors.length === 0, gpuErrors.join(', '));
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed\n`);
if (failed.length) process.exit(1);
