/**
 * The closeup's ferrofluid drop under a dragged magnet (PLAN §29c):
 * the drop follows the hand and holds together under the Kelvin body force
 * (M·∇B) and surface tension against the gap's viscous drag.
 *
 *   npm run ferrodrag
 *
 * Reported in PLAN §29 / drag-today.png: a magnet walked across the plate
 * turned the drop into a crescent, then smeared it to brown with no cell
 * over half full within two seconds (halfCount dropped to zero).
 *
 * What this holds, each against the real physics of a 6 mm ferrofluid drop:
 *
 *  1. The drop follows the hand: dragged 0.3 plate in 3 s (180 steps), its
 *     centroid follows the magnet within 2 drop radii (2R = 0.044 plate).
 *  2. The drop holds together: surface tension keeps its boundary sharp
 *     against shear, and its half-full area (cells with phase > 0.5) stays
 *     within 15% of its start.
 *  3. With no magnet, the drop does not move: its centroid stays within half
 *     a cell of rest over the same 180 steps, and the drop is still there.
 *  4. With Thin Gap switched off after the drag, and the magnet gone, the
 *     dragged drop stays where it was put down and stays a drop: over 120
 *     steps on the deep plate its centroid moves less than one drop radius
 *     and it keeps at least half its half-full cells.
 *
 * Why the fourth (PLAN 29c-8's review, 29c-10). The trailing rim is carried
 * on the ferrofluid's own velocity (`phaseVelocity`, written to phaseVelT)
 * only on a step that ran the thin gap. The review of #495 found
 * runPhaseAdvect choosing phaseVelT whenever the thin solve's buffers existed,
 * and those outlive Thin Gap: switched off after a drag, the deep plate went
 * on carrying the ferrofluid on the last thin step's velocity, frozen, and
 * the drop slid on with no force on it and smeared. Measured on this scene
 * (software WebGPU, the cloud lab), 120 deep steps after the drag:
 *
 *                                  moved            half-full cells
 *   keyed off the step's thinLive  0.0035 (0.16R)   104 → 94
 *   keyed off hsP alone (#495's    0.0425 (1.93R)   104 → 0
 *   head before the review)
 *
 * (read every 30 steps: keyed off thinLive, cx 0.6235 0.6237 0.6239 0.6241,
 * half-full 102 96 96 94; off hsP alone, cx 0.6491 0.6556 0.6594 0.6631,
 * half-full 100 78 8 0), so the bar of one radius sits between them with
 * room on both sides, and the half-full line catches the smear even where a
 * drop that spread evenly would keep its centroid. Physically the deep
 * plate, with no magnet, only coasts the drop on what is left of the oil's
 * motion from the drag, and viscosity takes that away: 0.0029 of the 0.0035
 * moved in the first 30 steps (half a second), 0.0002 in the last 30.
 *
 * Lab only: software WebGPU in headless Chrome, or Metal on the Mac CI
 * runner (`WebGPU (macOS) · show`, `scripts/checks.json`).
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
      // A plate with no phase field, or one read at another size, is not a drop at rest.
      if (!p || p.n !== N) throw new Error(`phase: ${p ? `${p.n}² read for ${N}²` : 'no phase field'}`);
      let halfCount = 0, n01 = 0;
      let sumPhase = 0, sumX = 0, sumY = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = p.data[j * N + i];
          if (val > 0.5) halfCount++;
          if (val > 0.01) n01++;
          if (val > 0.05) {
            sumPhase += val;
            sumX += (i + 0.5) / N * val;
            sumY += (j + 0.5) / N * val;
          }
        }
      }
      return {
        halfCount,
        n01,
        cx: sumPhase > 0 ? sumX / sumPhase : 0,
        cy: sumPhase > 0 ? sumY / sumPhase : 0,
      };
    };

    // 1. Drag test: settle 20 steps, then drag magnet 0.3 plate in 180 steps
    await lab.create(N, N);
    lab.addPhase(0.36, 0.5, R, 1);
    for (let k = 0; k < 20; k++) {
      await lab.step(1, {
        phaseSharp: 0.75,
        phaseDisplace: 0,
        thinGap: 1,
        magnetStrength: 0,
      });
    }

    const s0 = await getStats();

    const steps = 180;
    for (let k = 1; k <= steps; k++) {
      const magX = 0.36 + 0.3 * (k / steps);
      await lab.step(1, {
        phaseSharp: 0.75,
        phaseDisplace: 0,
        thinGap: 1,
        magnetX: magX,
        magnetY: 0.5,
        magnetHeight: 0.2,
        magnetStrength: 0.4,
        magnetSeconds: 1 / 60,
      });
    }

    const s1 = await getStats();

    // 4. Thin Gap off, magnet gone: 120 steps of the deep plate.
    for (let k = 1; k <= 120; k++) {
      await lab.step(1, {
        phaseSharp: 0.75,
        phaseDisplace: 0,
        thinGap: 0,
        magnetStrength: 0,
      });
    }
    const s2 = await getStats();

    // 2. Stationary control: settle 20 steps, then 180 steps with no magnet
    await lab.create(N, N);
    lab.addPhase(0.36, 0.5, R, 1);
    for (let k = 0; k < 20; k++) {
      await lab.step(1, {
        phaseSharp: 0.75,
        phaseDisplace: 0,
        thinGap: 1,
        magnetStrength: 0,
      });
    }

    const noMag0 = await getStats();
    for (let k = 1; k <= steps; k++) {
      await lab.step(1, {
        phaseSharp: 0.75,
        phaseDisplace: 0,
        thinGap: 1,
        magnetStrength: 0,
      });
    }
    const noMag1 = await getStats();

    return { s0, s1, s2, noMag0, noMag1 };
  }, { N, R });

  const { s0, s1, s2, noMag0, noMag1 } = result;
  const lag = Math.abs(s1.cx - 0.66);
  const twoR = 2 * R;
  const areaRatio = s1.halfCount / s0.halfCount;
  const areaChange = Math.abs(areaRatio - 1);
  const noMagMoved = Math.hypot(noMag1.cx - noMag0.cx, noMag1.cy - noMag0.cy);

  // 1. Follows the magnet: from where it was put (a cell of 0.36, or the lag
  // is read off another drop), and the way the magnet went.
  check(
    'the drop centroid follows the magnet within 2 drop radii across 0.3 plate drag',
    lag < twoR && Math.abs(s0.cx - 0.36) < 1 / N && s1.cx - s0.cx >= 0.3 - twoR,
    `lag ${(lag / R).toFixed(2)}R (cx ${(s1.cx).toFixed(4)} from ${(s0.cx).toFixed(4)} vs magnet 0.6600, limit ${(twoR / R).toFixed(1)}R); ${s0.n01} → ${s1.n01} cells over 0.01`,
  );

  // 2. Holds together (half-full area stays within 15% of start)
  check(
    'the drop holds together and keeps its half-full area within 15% of start',
    areaChange <= 0.15,
    `area ${s0.halfCount} → ${s1.halfCount} cells (${(areaRatio * 100).toFixed(1)}% kept, limit ±15%)`,
  );

  // 3. With no magnet, does not move: half a cell over 180 steps, and the drop
  // has to be there to be read (an empty readback puts both centroids at 0, 0,
  // a cell apart from nothing).
  check(
    'with no magnet, the drop does not move',
    noMagMoved < 0.5 / N && noMag0.halfCount > 0 && noMag1.halfCount > 0,
    `moved ${(noMagMoved * N).toFixed(3)} cells (${(noMagMoved).toFixed(6)} plate widths, limit half a cell); ${noMag0.halfCount} → ${noMag1.halfCount} cells half full`,
  );

  // 4. Thin Gap off after the drag: the deep plate does not carry the drop on
  // the thin gap's last velocity. Read from where the drag left it (s1), so
  // the drop has to have been dragged and be there (line 1) to be read.
  const offMoved = Math.hypot(s2.cx - s1.cx, s2.cy - s1.cy);
  check(
    'with Thin Gap off after the drag and no magnet, the drop stays put and stays a drop',
    offMoved < R && s1.cx > 0.55 && s1.halfCount > 0 && s2.halfCount >= 0.5 * s1.halfCount,
    `moved ${(offMoved / R).toFixed(2)}R in 120 deep steps (cx ${s1.cx.toFixed(4)} → ${s2.cx.toFixed(4)}, limit 1R); ${s1.halfCount} → ${s2.halfCount} cells half full (limit half kept); ${s1.n01} → ${s2.n01} cells over 0.01`,
  );

} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
