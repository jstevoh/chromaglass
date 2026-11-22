/**
 * The closeup's ferrofluid drop at rest on the thin gap (PLAN §29c):
 * degenerate mobility in phaseCHVolume holds the drop's half-full core and
 * its halo against Ostwald ripening into the clear oil, keeps Σc·h, and
 * leaves the drop still when no magnet is on the plate.
 *
 *   npm run ferrorest
 *
 * Found while diagnosing `npm run ferrodrag` (PLAN §29c): on the thin gap,
 * `phaseCHVolume` used a constant mobility at Cahn number ≈ 0.5 (an
 * eight-cell drop on 384², R = 0.022, Phase Edge 0.75), so the curved
 * interface's Gibbs–Thomson shift (c_eq ≈ 0.021) drove ferrofluid out
 * through the bulk oil at 2·M·dt per substep. With no magnet and nothing
 * moving, a resting drop went from 100 half-full cells at the 20th step
 * (116 as poured) to 84 at the 200th, its peak fell 0.996 → 0.946, and its
 * halo of cells over 0.01 grew by +248 (352 → 600, from 222 as poured),
 * step for step as on main with thinGap 1.
 *
 * `phaseCHVolume` now multiplies each face's flux by the degenerate mobility
 * mob(cp, cq) = 4m(1 − m) at the face's mean share m = ½(cp + cq), with no
 * floor (Elliott & Garcke 1996): symmetric across each face so Σc·h is kept,
 * at most 1 so the explicit stability limit (≤ M₀) is unchanged, and zero
 * between cells of pure oil or pure ferrofluid.
 *
 * What this holds, on `ferrodrag`'s resting scene (384², R = 0.022 at
 * (0.36, 0.5), 20 settling steps then 180 resting steps):
 *
 *  1. The drop holds its half-full core and peak at rest: at least 88 of the
 *     100 settled half-full cells remain after 180 steps (90 measured, vs 84
 *     with constant mobility), and its peak stays at least 0.96 (0.975
 *     measured, vs 0.946 with constant mobility).
 *  2. The halo does not leak into the bulk oil: cells over 0.01 grow by at
 *     most 120 over the 180 resting steps (+94 measured, 324 → 418, vs +248,
 *     352 → 600, with constant mobility).
 *  3. The antisymmetric face mobility conserves volume: Σc·h stays within
 *     0.1% across the 20-step settle and the 180 resting steps.
 *  4. A symmetry guard (it holds that the step pushes nothing sideways, not
 *     that the drop holds): with no magnet the centroid stays within half a
 *     cell of its settled position and within a cell of (0.36, 0.5).
 *  5. The loss slows: a second window, steps 200 to 380, loses at most half
 *     the half-full cells the first (20 to 200) did, or at most 3.
 *  6. A stretched body rounds in seconds, not in steps (PLAN 9ae, owed):
 *     the same stretched ferrofluid body on the thin gap, rounded for 2 s at
 *     60 steps a second and at 30 (the governor's two rates), and at 256²
 *     and 384², ends with the same aspect ratio within 5%, and its rounding
 *     time is the Hele-Shaw law's for the liquids' own data, within a factor
 *     of 1.5. See the line's comment for the law.
 *
 *   npm run ferrorest -- --owed=9ae
 *
 * Each line under an id in `--owed` is printed as owed while what it asks
 * for is absent (the convention of `npm run gap`): the PR that builds the
 * item takes its id out of `--owed` in scripts/checks.json and never edits
 * a line or a bar. A build that is there and misses is red, owed or not,
 * and an owed line that passes is red until its id is taken out.
 *
 * Lab only (software WebGPU in headless Chrome, or Metal on the Mac).
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const IDS = ['9ae'];
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

/*
  The liquids' data for line 6, from the solver's own constants (bundled, as
  `npm run gap` does, since the solver's files import without extensions).
*/
const libOut = 'node_modules/.cache/ferrorest-lib.mjs';
await build({
  stdin: {
    contents: [
      "export { DISH_METRES, DISH_GAP_METRES, thicknessViscosity } from './src/lib/turntable.ts';",
      "export { FERRO_NU, THIN_GAP_THICKNESS, LIQUID_DENSITY } from './src/gpu/fluid/constants.ts';",
      "export { FERRO_DENSITY, WATER_DENSITY, SPIKE_PITCH } from './src/gpu/wgsl/spikes.ts';",
    ].join('\n'),
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: libOut, logLevel: 'error',
});
const LIB = await import(`${process.cwd()}/${libOut}`);

const N = 384;
const R = 0.022; // drop radius, ~4.4 mm on 20 cm dish

const { page, close } = await openLab();
try {
  const result = await page.evaluate(async ({ N, R }) => {
    const getStats = async () => {
      const p = await lab.phase();
      const sq = await lab.squeeze();
      if (!p || p.n !== N) throw new Error(`phase: ${p ? `${p.n}² read for ${N}²` : 'no phase field'}`);
      if (!sq || sq.n !== N) throw new Error(`squeeze: ${sq ? `${sq.n}² read for ${N}²` : 'no squeeze field'}`);
      let halfCount = 0, n01 = 0;
      let sumPhase = 0, sumVol = 0, peak = 0;
      let weightPhase = 0, sumX = 0, sumY = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          const val = p.data[k];
          const h = sq.gap[k];
          sumPhase += val;
          sumVol += val * h;
          if (val > peak) peak = val;
          if (val > 0.5) halfCount++;
          if (val > 0.01) n01++;
          if (val > 0.05) {
            weightPhase += val;
            sumX += ((i + 0.5) / N) * val;
            sumY += ((j + 0.5) / N) * val;
          }
        }
      }
      return {
        halfCount,
        n01,
        sumPhase,
        vol: sumVol,
        peak,
        cx: weightPhase > 0 ? sumX / weightPhase : 0,
        cy: weightPhase > 0 ? sumY / weightPhase : 0,
      };
    };

    const opts = {
      phaseSharp: 0.75,
      phaseDisplace: 0,
      thinGap: 1,
      magnetStrength: 0,
    };

    await lab.create(N, N);
    lab.addPhase(0.36, 0.5, R, 1);
    const sInit = await getStats();

    for (let k = 0; k < 20; k++) {
      await lab.step(1, opts);
    }
    const s0 = await getStats();

    const steps = 180;
    for (let k = 0; k < steps; k++) {
      await lab.step(1, opts);
    }
    const s1 = await getStats();

    // A second window, steps 200 to 380, same length as the first: a drop
    // that is still shedding cells at the same rate in the second window is
    // dissolving slowly, not resting, and 88 of 100 at step 200 does not
    // see it.
    for (let k = 0; k < steps; k++) {
      await lab.step(1, opts);
    }
    const s2 = await getStats();

    /*
      6. Rounding in seconds (PLAN 9ae). A stadium of ferrofluid (discs of
      radius RS along x from -S to +S, each saturated, so their union is
      full inside and the edge is the solver's own after the settle) on the
      thin gap, rounded for TWO seconds of the app's clock in three arms:
      256² at 60 steps a second (120 steps of dt 0.004, magnetSeconds 1/60,
      the lab's own step), 256² at 30 (60 steps of twice the dt and
      magnetSeconds 1/30: what the governor hands the solver at 30 steps a
      second, fluidSimulation.ts's wantDt and magnetSeconds both ∝ the
      step's seconds), and 384² at 60. The aspect ratio is the square root
      of the ratio of the body's second moments (exact for an ellipse).
    */
    const aspectOf = async (n) => {
      const p = await lab.phase();
      if (!p || p.n !== n) throw new Error(`phase: ${p ? `${p.n}² read for ${n}²` : 'no phase field'}`);
      let w = 0, mx = 0, my = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = p.data[j * n + i]; if (c < 0.05) continue;
        w += c; mx += c * (i + 0.5) / n; my += c * (j + 0.5) / n;
      }
      mx /= w; my /= w;
      let xx = 0, yy = 0, xy = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const c = p.data[j * n + i]; if (c < 0.05) continue;
        const dx = (i + 0.5) / n - mx, dy = (j + 0.5) / n - my;
        xx += c * dx * dx; yy += c * dy * dy; xy += c * dx * dy;
      }
      const tr = xx + yy, det = xx * yy - xy * xy, root = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const l1 = tr / 2 + root, l2 = Math.max(1e-12, tr / 2 - root);
      // The area of the body (Σc, plate widths²) for its equivalent radius.
      let sum = 0; for (const c of p.data) sum += c;
      return { aspect: Math.sqrt(l1 / l2), area: sum / (n * n) };
    };
    const RS = 0.03, S = 0.015;
    const arm = async (n, rate) => {
      await lab.create(n, n);
      for (let x = -S; x <= S + 1e-9; x += 0.0025) lab.addPhase(0.5 + x, 0.5, RS, 20);
      const per = { ...opts, dt: 0.004 * 60 / rate, magnetSeconds: 1 / rate };
      // Settle the edge first: 10 of the lab's steps, the same in every arm, so 0 s is the same body.
      for (let k = 0; k < 10; k++) await lab.step(1, opts);
      const a0 = await aspectOf(n);
      for (let k = 0; k < 2 * rate; k++) await lab.step(1, per);
      const a2 = await aspectOf(n);
      return { a0, a2 };
    };
    const r60 = await arm(256, 60);
    const r30 = await arm(256, 30);
    const r384 = await arm(384, 60);

    return { sInit, s0, s1, s2, r60, r30, r384 };
  }, { N, R });

  const { sInit, s0, s1, s2 } = result;
  const keptRatio = s1.halfCount / s0.halfCount;
  const haloGrowth = s1.n01 - s0.n01;
  const volDrift = Math.abs(s1.vol - s0.vol) / s0.vol;
  const volDriftAll = Math.abs(s1.vol - sInit.vol) / sInit.vol;
  const volDrift2 = Math.abs(s2.vol - sInit.vol) / sInit.vol;
  const moved = Math.hypot(s1.cx - s0.cx, s1.cy - s0.cy);
  const lost1 = s0.halfCount - s1.halfCount, lost2 = s1.halfCount - s2.halfCount;

  // 1. Holds its half-full core and peak share at rest (90 of 100 and 0.975,
  // against 84 of 100 and 0.946 with constant mobility in phaseCHVolume).
  check(
    'the resting drop holds its half-full core (>= 88 of 100 cells) and peak share (>= 0.96) over 180 steps',
    s0.halfCount >= 95 && s1.halfCount >= 88 && keptRatio >= 0.88 && s1.peak >= 0.96 && s1.peak <= 1.01,
    `half-full ${sInit.halfCount} as poured → ${s0.halfCount} at step 20 → ${s1.halfCount} at step 200 (${(keptRatio * 100).toFixed(1)}% kept, bar >= 88%); peak ${sInit.peak.toFixed(3)} → ${s0.peak.toFixed(3)} → ${s1.peak.toFixed(3)} (bar >= 0.96; constant mobility 84 cells, peak 0.946)`,
  );

  // 2. Degenerate mobility stops bulk diffusion into the oil: halo growth
  // over the 180 steps is +94 (324 → 418), against +248 (352 → 600) with
  // constant mobility.
  check(
    'degenerate mobility in phaseCHVolume holds the halo of cells over 0.01 to at most +120 over 180 resting steps',
    s0.n01 >= 250 && haloGrowth >= 0 && haloGrowth <= 120 && s1.n01 <= 450,
    `cells over 0.01: ${sInit.n01} as poured → ${s0.n01} at step 20 → ${s1.n01} at step 200 (+${haloGrowth}, bar <= +120 and <= 450 in all; constant mobility +248, 352 → 600)`,
  );

  // 3. Face-symmetric mob(cp, cq) = 4m(1 - m) keeps Σc·h across every face.
  check(
    'the antisymmetric face mobility conserves the ferrofluid volume Σc·h within 0.1%',
    s0.vol > 3.0 && volDrift <= 1e-3 && volDriftAll <= 1e-3 && volDrift2 <= 1e-3,
    `Σc·h ${sInit.vol.toFixed(5)} → ${s0.vol.toFixed(5)} → ${s1.vol.toFixed(5)} → ${s2.vol.toFixed(5)} at step 380 (${(volDrift2 * 100).toFixed(3)}% from pour; drift ${(volDrift * 100).toFixed(3)}% over 180 steps, ${(volDriftAll * 100).toFixed(3)}% from pour, bar <= 0.1%); Σc ${sInit.sumPhase.toFixed(2)} → ${s1.sumPhase.toFixed(2)}`,
  );

  // 5. The second window: the loss slows. With constant mobility the drop
  // shed cells at the same pace to the end; with the degenerate mobility the
  // step-20-to-200 loss is the settling of the pour and the next 180 steps
  // lose at most half as many (or at most 3 cells). The loss is signed: a
  // second window that gained more than 3 cells is not a drop at rest either.
  check(
    'the resting drop\'s loss slows: steps 200 to 380 lose at most half the cells steps 20 to 200 did (or at most 3)',
    lost2 >= -3 && (lost2 <= 3 || lost2 <= lost1 / 2),
    `half-full ${s0.halfCount} → ${s1.halfCount} (−${lost1}) → ${s2.halfCount} at step 380 (−${lost2}, bar <= max(${(lost1 / 2).toFixed(1)}, 3)); peak ${s2.peak.toFixed(3)}, cells over 0.01 ${s2.n01}`,
  );

  // 4. A symmetry guard, not a drop-holding check: with no magnet nothing
  // pulls the drop anywhere, so this is red only if the step itself pushes
  // the drop (an asymmetric stencil, a force with no magnet).
  check(
    'symmetry guard: with no magnet, the resting drop stays within half a cell of where it settled',
    moved < 0.5 / N && Math.abs(s0.cx - 0.36) < 1 / N && Math.abs(s1.cx - 0.36) < 1 / N && Math.abs(s1.cy - 0.5) < 1 / N && s1.halfCount > 0,
    `moved ${(moved * N).toFixed(3)} cells (${moved.toFixed(6)} plate widths, bar < 0.5 cells) at (${s1.cx.toFixed(4)}, ${s1.cy.toFixed(4)})`,
  );

  /*
    6. Rounding in seconds (PLAN 9ae).

    The law. A drop between two glasses a gap b apart moves as Darcy flow,
    u = −(b²/12μ)∇p, in itself and in the liquid around it, and the jump in
    pressure across its edge is σ times the edge's curvature in the plane.
    For a drop of radius R with an edge r = R(1 + ε cos nθ), solving the two
    Laplace problems for the pressure and matching the edge's speed to the
    flow on both sides (Paterson 1981, a drop with no injection) gives
      dε/dt = −n(n² − 1) b²σ ε / (12 R³ (μ_in + μ_out)),
    so the stretch, mode 2, decays as exp(−t/τ₂) with
      τ₂ = 2 (μ_in + μ_out) R³ / (b² σ),
    the item's scale 12μR³/(b²σ) over n(n² − 1) = 6. The data are the
    solver's own: b the 2 mm gap (DISH_GAP_METRES), μ_in the ferrofluid's
    FERRO_NU at FERRO_DENSITY (6 mPa·s), μ_out the clear liquid's at the
    thin gap's default Thickness (thicknessViscosity at THIN_GAP_THICKNESS,
    22 mm²/s, at LIQUID_DENSITY), and σ from the spike pitch the solver
    draws: Rosensweig's spikes stand 2π l_c apart with l_c = √(σ/(Δρ g)),
    so σ = (FERRO_DENSITY − WATER_DENSITY) g l_c², about 3.3 mN/m, the
    tension the spikes already assume. R is the body's equivalent radius,
    √(area/π) in metres, as the solver laid it.

    The measure. With A the aspect ratio, ε = (A − 1)/(A + 1) for a small
    ellipse-like stretch, and over the two seconds τ = 2 s / ln(ε₀/ε₂).

    The bars. The item's own: the aspect after 2 s is the same within 5% at
    60 and at 30 steps a second, and at 256² and at 384². And the rounding
    time at 256² and 60 steps a second is τ₂ within a factor of 1.5 either
    way (the stadium is not a small stretch, and the solver's edge is a few
    cells wide). Without that last bar a body that never rounds, or rounds
    at once, ends with the same aspect in every arm and would pass; with it
    only a rounding paced by seconds and by the plate's metres, at the
    liquids' rate, passes. A build that makes the 30-step arm take twice the
    substeps matches the steps but not the law's time; one that tunes a
    constant at 256² misses at 384²; neither looks wrong in a picture.

    Why the arms are compared by their rounding time and not their end
    aspect: the 384² body settles to a different start (an aspect of 1.48
    against 256²'s 1.36 after the same ten steps, measured on main
    2026-11-21: the finer grid's interface sharpens to a different width), so
    end aspects 5% apart would be red on a perfect build. τ, from each arm's
    own start, is what the item means by the same rounding.

    mainState: the rounding is per step or per cell, which is main's. The
    decay ln(ε₀/ε₂) over the 2 s at 60 steps a second at 256² is more than
    1.25 times the one at 30, or the one at 384². Main measured 1.46 against
    30 steps and 2.4 against 384² (the flow's own capillary rounding is in
    seconds, so the per-step mobility's share does not show as the full 2x).
    A build that paces the steps and the cells but misses the law is not
    excused.
  */
  {
    const { r60, r30, r384 } = result;
    const g = 9.81;
    const lc = (LIB.SPIKE_PITCH * LIB.DISH_METRES) / (2 * Math.PI);
    const sigma = (LIB.FERRO_DENSITY - LIB.WATER_DENSITY) * g * lc * lc;
    const muIn = LIB.FERRO_NU * LIB.FERRO_DENSITY;
    const muOut = LIB.thicknessViscosity(LIB.THIN_GAP_THICKNESS) * LIB.LIQUID_DENSITY;
    const b = LIB.DISH_GAP_METRES;
    const Req = Math.sqrt(r60.a0.area / Math.PI) * LIB.DISH_METRES;
    const tauLaw = (2 * (muIn + muOut) * Req ** 3) / (b * b * sigma);
    const eps = (A) => (A - 1) / (A + 1);
    const decay = (r) => Math.log(eps(r.a0.aspect) / Math.max(1e-6, eps(r.a2.aspect)));
    const tau = (r) => (decay(r) > 0 ? 2 / decay(r) : Infinity);
    const rate = Math.abs(r30.a2.aspect / r60.a2.aspect - 1);
    const lawRatio = tau(r60) / tauLaw;
    const same0 = Math.abs(r30.a0.aspect / r60.a0.aspect - 1) < 0.02;
    const gridTau = Math.abs(tau(r384) / tau(r60) - 1);
    line('9ae', 'a stretched ferrofluid body rounds in seconds: its aspect after 2 s is the same within 5% at 60 and 30 steps a second, its rounding time the same within 10% at 256² and 384², on the Hele-Shaw time 2(μ_in+μ_out)R³/(b²σ) within ×1.5',
      same0 && rate < 0.05 && gridTau < 0.1 && lawRatio > 1 / 1.5 && lawRatio < 1.5,
      `aspect ${r60.a0.aspect.toFixed(3)} → ${r60.a2.aspect.toFixed(3)} at 256²/60, ${r30.a0.aspect.toFixed(3)} → ${r30.a2.aspect.toFixed(3)} at 256²/30 (${(rate * 100).toFixed(1)}% apart), ${r384.a0.aspect.toFixed(3)} → ${r384.a2.aspect.toFixed(3)} at 384²/60 (τ ${(gridTau * 100).toFixed(1)}% apart); τ ${tau(r60).toFixed(2)} s at 256²/60, ${tau(r30).toFixed(2)} s at 30, ${tau(r384).toFixed(2)} s at 384², the law's ${tauLaw.toFixed(2)} s (R ${(Req * 1000).toFixed(1)} mm, σ ${(sigma * 1000).toFixed(2)} mN/m, μ ${(muIn * 1000).toFixed(1)} + ${(muOut * 1000).toFixed(1)} mPa·s, b ${(b * 1000).toFixed(1)} mm)`,
      decay(r30) > 0 && decay(r384) > 0 && (decay(r60) > 1.25 * decay(r30) || decay(r60) > 1.25 * decay(r384)));
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
