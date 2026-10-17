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
 *  3. With no magnet, the drop does not move: its centroid stays within a
 *     fraction of a cell from rest over the same 180 steps.
 *
 * Lab only (software WebGPU in headless Chrome).
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
      let halfCount = 0;
      let sumPhase = 0, sumX = 0, sumY = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const val = p.data[j * N + i];
          if (val > 0.5) halfCount++;
          if (val > 0.05) {
            sumPhase += val;
            sumX += (i + 0.5) / N * val;
            sumY += (j + 0.5) / N * val;
          }
        }
      }
      return {
        halfCount,
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

    return { s0, s1, noMag0, noMag1 };
  }, { N, R });

  const { s0, s1, noMag0, noMag1 } = result;
  const lag = Math.abs(s1.cx - 0.66);
  const twoR = 2 * R;
  const areaRatio = s1.halfCount / s0.halfCount;
  const areaChange = Math.abs(areaRatio - 1);
  const noMagMoved = Math.hypot(noMag1.cx - noMag0.cx, noMag1.cy - noMag0.cy);

  // 1. Follows the magnet
  check(
    'the drop centroid follows the magnet within 2 drop radii across 0.3 plate drag',
    lag < twoR,
    `lag ${(lag / R).toFixed(2)}R (cx ${(s1.cx).toFixed(4)} vs magnet 0.6600, limit ${(twoR / R).toFixed(1)}R)`,
  );

  // 2. Holds together (half-full area stays within 15% of start)
  check(
    'the drop holds together and keeps its half-full area within 15% of start',
    areaChange <= 0.15,
    `area ${s0.halfCount} → ${s1.halfCount} cells (${(areaRatio * 100).toFixed(1)}% kept, limit ±15%)`,
  );

  // 3. With no magnet, does not move
  check(
    'with no magnet, the drop does not move',
    noMagMoved < 0.005,
    `moved ${(noMagMoved * N).toFixed(3)} cells (${(noMagMoved).toFixed(6)} plate widths)`,
  );

} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
