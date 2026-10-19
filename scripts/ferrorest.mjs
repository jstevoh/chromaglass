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
 *
 * Lab only (software WebGPU in headless Chrome, or Metal on the Mac).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

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

    return { sInit, s0, s1, s2 };
  }, { N, R });

  const { sInit, s0, s1, s2 } = result;
  const keptRatio = s1.halfCount / s0.halfCount;
  const haloGrowth = s1.n01 - s0.n01;
  const volDrift = Math.abs(s1.vol - s0.vol) / s0.vol;
  const volDriftAll = Math.abs(s1.vol - sInit.vol) / sInit.vol;
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
    s0.vol > 3.0 && volDrift <= 1e-3 && volDriftAll <= 1e-3,
    `Σc·h ${sInit.vol.toFixed(5)} → ${s0.vol.toFixed(5)} → ${s1.vol.toFixed(5)} (drift ${(volDrift * 100).toFixed(3)}% over 180 steps, ${(volDriftAll * 100).toFixed(3)}% from pour, bar <= 0.1%); Σc ${sInit.sumPhase.toFixed(2)} → ${s1.sumPhase.toFixed(2)}`,
  );

  // 5. The second window: the loss slows. With constant mobility the drop
  // shed cells at the same pace to the end; with the degenerate mobility the
  // step-20-to-200 loss is the settling of the pour and the next 180 steps
  // lose at most half as many (or at most 3 cells).
  check(
    'the resting drop\'s loss slows: steps 200 to 380 lose at most half the cells steps 20 to 200 did (or at most 3)',
    lost2 <= 3 || lost2 <= lost1 / 2,
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
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
