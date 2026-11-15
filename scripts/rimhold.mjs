#!/usr/bin/env node
/**
 * The open rim holds a body of oil that touches it (PLAN 18g-6): its oil
 * stays in the dish with the plate level and nothing stirring, and the rim
 * is still open to what flow pushes across it. Measured on the GPU solver
 * alone (scripts/lab.mjs), on a thin gap at Clock Glass's and Oil & Water's
 * own liquid (Oil Tension 0.9, Oil Bodies on, no diffusion).
 *
 *   npm run rimhold
 *
 * What was there: the thin gap's rim held the pressure at zero, the water's
 * pressure in the reservoir past the cover glass, also in a cell of oil, so
 * the oil just inside the rim was at its body's Laplace pressure σκ and the
 * rim's own cells at none, and the body drained out through the rim by its
 * own surface tension. A lens laid against the rim kept 9.6% of its oil after
 * six seconds on a level plate (66% where it only grazed it, in `npm run
 * oillift`'s run). Now the rim holds each cell at the oil's own pressure
 * there, read off the capillary force round the rim (CAPILLARY and
 * rimLaplace in src/gpu/wgsl/fluid.ts), as a body whose interface goes on
 * past the rim into the reservoir's water has.
 *
 *   1. A lens of radius 0.06 laid against the rim, at the middle of the
 *      grid's edge (−x, where the rim is the grid's last column) and on the
 *      diagonal (where it is the circle's own cells), keeps over 92% of its
 *      oil in the dish over six seconds, and in the last three loses under
 *      half a percent more than the same lens at a hundredth of the tension
 *      does: the tension drains nothing once it has settled, where on main
 *      it drained the lens at the edge to 9.6% and on the diagonal to
 *      21.1%. (The weak lens is the control and not zero: on the diagonal
 *      a lens loses about a seventh of a percent a second whatever its
 *      tension, PLAN 18g-7.)
 *   2. The drain was the surface tension and nothing else, and the fix
 *      reaches only the rim: the same lens at a hundredth of the tension
 *      keeps over 99%, and the lens in the middle of the dish, where the
 *      force is untouched to the bit, keeps over 99% and does not move.
 *   3. The rim is still open: water poured at the middle (a volume source,
 *      PLAN 18c) pushes the liquid out across the rim evenly round it, so a
 *      lens laid across the rim loses what crosses the rim where it lies,
 *      each pour's volume times the oil's share of the rim's cells then,
 *      less what the same lens loses over those steps unpoured. With the
 *      tension weak that is the meter's own check: within 0.6 and 1.5 (0.81
 *      on SwiftShader). At the looks' tension the lens has drawn itself in
 *      off the rim and its interface pushes back on the pour, so it loses
 *      less (0.44 on SwiftShader), and the bar is a quarter: a rim closed to
 *      the oil, the other way to hold it, would lose none.
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as a held lens.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';
import { DISH_GAP_METRES, thicknessViscosity } from '../src/lib/turntable.ts';
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const R = 0.06;   // the lens's radius, in plates (oillift's)
/*
  Check 1 reads a lens against the rim settling there: six readings, the
  last three after it has. Every speed the surface tension gives the oil
  between two glasses goes as h² (Darcy: h²/12μ times σ∇κ, OIL_TENSION_GAP),
  so on the 2 mm gap (PLAN 38r) the lens settles nine times slower than on
  the 6 mm one it was written on, and six seconds caught it settling: the
  lens at the middle of the grid's edge lost 2.9% of its oil over the rim in
  the first nine seconds and then nothing, but read a second apart that
  first loss fell across the window's last three (1.2% against 0.1%, red).
  The readings are a second times (6 mm / h)² apart, 9 s at 2 mm, as
  \`npm run oillift\`'s rim (4) is; "a second" below is one of them.
*/
const SECOND = Math.round(60 * (0.006 / DISH_GAP_METRES) ** 2);

/*
  Check 3's glass. Since PLAN 38r-5 the cover floats: a pour lifts it by
  V/A, and under the default 157 g glass the edge holds it up to 2.41 mm,
  so the twelve pours raised the glass and pushed almost nothing over the
  rim (the meter read 0.04 and the looks' tension 0.01 on the Mac). The
  meter's premise is the volume crossing the rim, so, as \`npm run flush\`
  does, the pours go under the glass the edge holds at exactly 2 mm (w = 2σ
  sinθ/h₀ · A/g at this Thickness, 189 g), and what crosses the rim is
  counted as it crosses: each interval's pours, at the gap the glass stood
  at, less what the glass rose by, times the oil's share of the rim then,
  through the Stefan settle that follows. Counted as it crosses, the reading
  need not wait for the glass to come all the way down, and it should not:
  the lens loses a slow seventh of a percent a second at the rim whatever
  is poured (18g-7), and over the whole settle (seven seconds) that loss,
  taken off as the unpoured lens's, outweighed the pour's at the looks'
  tension (the line read −0.12). So the window ends when three quarters of
  the twelve pours' lift has gone (SETTLE, from the lib's own exact
  settle): the meter read 0.92 and the looks' tension 0.55 (SwiftShader;
  0.81 and 0.44 on the rigid glass). The bars are as they were.
*/
const THICK = 0.45;
const coverLib = 'node_modules/.cache/rimhold-cover.mjs';
await build({
  stdin: { contents: "export * from './src/lib/cover.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: coverLib, logLevel: 'warning',
});
const C = await import(`../${coverLib}`);
const SIGMA = C.carrierTension(thicknessViscosity(THICK));
const HOLD_P = C.holdPressure(SIGMA, DISH_GAP_METRES);
const HOLD_G = HOLD_P * C.COVER_AREA / C.GRAVITY * 1000;
const RP = 0.05, POURS = 12;
let SETTLE = 0;
for (let h = DISH_GAP_METRES * (1 + POURS * Math.PI * RP * RP / 2 / (Math.PI / 4)); h - DISH_GAP_METRES > 0.25 * (POURS * Math.PI * RP * RP / 2 / (Math.PI / 4)) * DISH_GAP_METRES && SETTLE < 6000; SETTLE++) {
  h = C.stefanSettle(h, HOLD_P, SIGMA, 1000 * thicknessViscosity(THICK), 1 / 60);
}

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async ({ R, SECOND, THICK, HOLD_G, SETTLE, RP, POURS, H0 }) => {
    const N = 128, out = {};
    const T = { thinGap: 1, gapThickness: THICK, gapSpring: 0, oilTension: 0.9, oilBodies: 1, diff: 0 };
    /*
      The oil inside the dish, its centroid, and its share of the rim's own
      cells, the last ring inside it (what a pour's flow carries across).
    */
    const oil = async () => {
      const m = await lab.chemistry('mix');
      let s = 0, x = 0, y = 0, rim = 0, rimCells = 0;
      for (let j = 0; j < m.n; j++) for (let i = 0; i < m.n; i++) {
        const c = Math.max(0, Math.min(1, m.data[(i + j * m.n) * 4]));
        const u = (i + 0.5) / m.n, v = (j + 0.5) / m.n, d = Math.hypot(u - 0.5, v - 0.5);
        if (d >= 0.5) continue;
        s += c; x += c * u; y += c * v;
        if (d >= 0.5 - 1.5 / m.n) { rim += c; rimCells++; }
      }
      return { amount: s / (m.n * m.n), x: x / Math.max(s, 1e-9), y: y / Math.max(s, 1e-9), rim: rim / Math.max(1, rimCells), rimOil: rim };
    };
    // A lens touching the rim at angle θ (its edge on the rim), or anywhere with `at`.
    const lensAt = (th) => [0.5 + (0.5 - R) * Math.cos(th), 0.5 + (0.5 - R) * Math.sin(th)];
    const run = async (at, over, seconds = 6) => {
      await lab.create(N, N);
      lab.solver().addMix(at[0], at[1], R, { oil: 1 });
      const trace = [await oil()];
      for (let k = 0; k < seconds; k++) { await lab.step(SECOND, over); trace.push(await oil()); }
      return trace;
    };
    // 1.
    out.edge = await run(lensAt(Math.PI), T);
    out.diagonal = await run(lensAt(Math.PI / 4), T);
    // 2.
    out.weak = await run(lensAt(Math.PI), { ...T, oilTension: 0.009 });
    out.weakDiagonal = await run(lensAt(Math.PI / 4), { ...T, oilTension: 0.009 });
    out.middle = await run([0.5, 0.5], T);
    /*
      3. A lens laid across the rim on the diagonal (its middle R/2 inside
      it, so the rim's cells stay in its oil while the pour pushes it),
      settled three seconds, then water poured at the middle, a dome a step
      for POURS steps (flush.mjs's pour), the oil's share of the rim's cells
      read before each, so what crosses the rim is summed step by step; then
      the glass's settle, read every ten steps, what it pushes out weighted
      the same way. All under the glass the edge holds at 2 mm.
    */
    const pour = async (T0) => {
      const T = { ...T0, coverGrams: HOLD_G };
      const dish = Math.PI / 4;
      const at = [0.5 + (0.5 - R / 2) * Math.SQRT1_2, 0.5 + (0.5 - R / 2) * Math.SQRT1_2];
      await lab.create(N, N);
      lab.solver().addMix(at[0], at[1], R, { oil: 1 });
      await lab.step(180, T);
      const before = await oil();
      // A dome of share 1 over radius RP is π RP²/2 of the plate's area (flush.mjs's domeOf), at the gap the glass stands at.
      const dome = Math.PI * RP * RP / 2;
      let want = 0, V = 0, shares = [];
      for (let k = 0; k < POURS; k++) {
        const now = k === 0 ? before : await oil();
        const h = lab.coverMetres(), v = dome * h / H0;
        lab.addSpecies(0.5, 0.5, RP, 1, 'water', true);
        await lab.step(1, T);
        // What crossed the rim this step: the pour, less what the glass rose by over the dish.
        want += (v - dish * (lab.coverMetres() - h) / H0) * now.rim; V += v; shares.push(now.rim);
      }
      for (let k = 0; k < SETTLE; k += 10) {
        const now = await oil(), h = lab.coverMetres();
        await lab.step(Math.min(10, SETTLE - k), T);
        want += dish * (h - lab.coverMetres()) / H0 * now.rim; shares.push(now.rim);
      }
      const after = await oil();
      // The same lens left alone over the same steps, for what it loses with no pour.
      await lab.create(N, N);
      lab.solver().addMix(at[0], at[1], R, { oil: 1 });
      await lab.step(180, T);
      const still0 = await oil();
      await lab.step(POURS + SETTLE, T);
      const still1 = await oil();
      return { before, after, want, V, shares, still: still0.amount - still1.amount };
    };
    out.pour = await pour(T);
    out.pourWeak = await pour({ ...T, oilTension: 0.009 });
    return out;
  }, { R, SECOND, THICK, HOLD_G, SETTLE, RP, POURS, H0: DISH_GAP_METRES });
} finally {
  await close();
}

check('no GPU pass failed validation (a stage that never ran would read as a held lens)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
const kept = (t, k = t.length - 1) => t[k].amount / t[0].amount;
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const bySecond = (t) => t.slice(1).map((s) => pct(s.amount / t[0].amount)).join(', ');
// 1.
for (const [name, t, weak] of [['at the middle of the grid\'s edge', r.edge, r.weak], ['on the diagonal', r.diagonal, r.weakDiagonal]]) {
  const lastThree = kept(t, t.length - 4) - kept(t);
  const weakThree = kept(weak, weak.length - 4) - kept(weak);
  check(`a lens against the rim ${name}, the plate level, keeps its oil: over 92% after six seconds, and in the last three its surface tension drains none (it loses under 0.5% more than at a hundredth of the tension)`,
    kept(t) > 0.92 && lastThree - weakThree < 0.005,
    `${pct(kept(t))} kept, ${pct(lastThree)} lost in the last three seconds against ${pct(weakThree)} at a hundredth of the tension; by second ${bySecond(t)}; the oil on the rim's cells ${t[0].rimOil.toFixed(1)} cells' worth at the start, ${t[t.length - 1].rimOil.toFixed(1)} at the end (spread along the rim, or drawn off it: the grid sets the contact angle, PLAN 18g-8); main kept 9.6% at the edge and 21.1% on the diagonal`);
}
// 2.
check('the drain was the surface tension: the same lens at a hundredth of the tension keeps over 99%',
  kept(r.weak) > 0.99, `${pct(kept(r.weak))}; by second ${bySecond(r.weak)}`);
{
  const t = r.middle, moved = Math.hypot(t[t.length - 1].x - t[0].x, t[t.length - 1].y - t[0].y);
  check('and short of the rim nothing changed: the lens in the middle keeps over 99% and stays where it is (under 0.002)',
    kept(t) > 0.99 && moved < 0.002, `${pct(kept(t))} kept, its centroid moved ${moved.toFixed(4)}`);
}
// 3.
{
  const ratio = ({ before, after, want, still }) => (before.amount - after.amount - still) / Math.max(want, 1e-12);
  const show = (p) => `lost ${(p.before.amount - p.after.amount - p.still).toExponential(3)} of the plate (less ${p.still.toExponential(2)} it loses unpoured) against ${p.want.toExponential(3)}, ${ratio(p).toFixed(2)}; the oil's share of the rim's cells ${pct(Math.min(...p.shares))} to ${pct(Math.max(...p.shares))}`;
  const weak = r.pourWeak, full = r.pour;
  check('the meter: water poured at the middle pushes a lens laid across the rim out over it, with the tension weak, as much as the volume carries across where the oil lies (each pour times the oil\'s share of the rim), within 0.6 to 1.5',
    ratio(weak) > 0.6 && ratio(weak) < 1.5, `${show(weak)}; poured ${weak.V.toFixed(4)}`);
  check('and the rim is open to the oil at the looks\' tension: the same pour pushes it out over a quarter of that (a rim closed to the oil would push none; its own surface tension holds some back)',
    ratio(full) > 0.25 && ratio(full) < 1.5, show(full));
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
