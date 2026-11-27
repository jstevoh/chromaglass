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
 *     within 15% of the same drop's held still under the same magnet (the
 *     field stands it up as a cone past the onset: PLAN 38k-7, below).
 *  3. With no magnet, the drop does not move: its centroid stays within half
 *     a cell of rest over the same 180 steps, and the drop is still there.
 *  4. (`npm run ferrodrag -- --thinoff`, as CI runs it) With Thin
 *     Gap switched off after the drag, and the magnet gone, the dragged drop
 *     stays where it was put down and stays a drop: over 120 steps on the
 *     deep plate its centroid moves less than one drop radius and it keeps
 *     at least half its half-full cells, and all 120 steps ran deep.
 *  5. (the same) And the control in the run: on a lab whose deep plate rides
 *     the thin gap's last velocity, all 120 steps deep too, line 4 is red,
 *     by half a radius more, or by keeping a quarter of its half-full cells
 *     or fewer.
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
 * Why "all 120 steps ran deep" (PLAN 29c-11). On Metal (the show shard,
 * #521's runs 40592589582 and 40595560209) the real plate and the control
 * first read the same movement, 0.70R (cx 0.6201 → 0.6341 0.6350 0.6352
 * 0.6354, both), and the half-full count followed the order the labs were
 * opened in. A solver that ran thin and is asked for the old plate stays
 * thin while the old plate's pipelines build off the frame (thinGapOn), and
 * on Metal that build lasted dozens of steps: counted in #528's run
 * 40628207753, the real plate ran 57 of its 120 steps deep and the control,
 * the first lab of the process with Metal's shader cache cold, none. Those
 * thin steps carried the drop on a freshly written phaseVelT while it
 * coasted to rest, so by the time the deep plate took over the stale
 * velocity had nothing left in it to carry. The lab now builds the old
 * plate before such a step (`lab.step`, as it builds the thin gap's), and
 * both lines require every step deep, so a lab that slips back to thin is
 * red by name rather than green or red for the wrong plate.
 *
 * Lab only: software WebGPU in headless Chrome, or Metal on the Mac CI
 * runner (`WebGPU (macOS) · show`, `scripts/checks.json`).
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const THIN_OFF = process.argv.includes('--thinoff');
const N = 384;
const R = 0.022; // drop radius, ~4.4 mm on 20 cm dish

/*
  The fourth line's control, in the run (as ferrohold keeps its own): the lab
  built again with runPhaseAdvect keyed off hsP alone, as #495's head was
  before its review, so the deep plate rides the thin gap's last phaseVelT.
  The edit is asserted, so a rename in fluid.ts fails here loudly rather than
  leaving the control the same program as the real one.
*/
const RIDES_STALE = {
  name: 'rides-stale-phasevel',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]fluid[\\/]passes\.ts$/ }, (args) => {
      const src = readFileSync(args.path, 'utf8');
      const key = 'this.phaseVel(thin && this.thinLive)';
      if (!src.includes(key)) throw new Error('ferrodrag: the control could not find runPhaseAdvect\'s phaseVel(thin && this.thinLive) in fluid/passes.ts');
      return { contents: src.replace(key, 'this.phaseVel(thin)'), loader: 'ts' };
    });
  },
};

const scene = async ({ N, R, dragOnly, thinOff }) => {
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

  // 4. Thin Gap off, magnet gone: 120 steps of the deep plate, read every 30.
  // And how many of them the plate ran thin all the same (thinGapOn).
  const tail = [];
  let thinSteps = 0;
  for (let k = 1; k <= (thinOff ? 120 : 0); k++) {
    await lab.step(1, {
      phaseSharp: 0.75,
      phaseDisplace: 0,
      thinGap: 0,
      magnetStrength: 0,
    });
    if (lab.thinLive()) thinSteps++;
    if (k % 30 === 0) tail.push(await getStats());
  }
  const s2 = tail[tail.length - 1];
  if (dragOnly) return { s0, s1, s2, tail, thinSteps };

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

  // 2's reference: the same drop under the same magnet held still over it,
  // for the same 180 steps (why: the second line's comment below).
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
  const held0 = await getStats();
  for (let k = 1; k <= steps; k++) {
    await lab.step(1, {
      phaseSharp: 0.75,
      phaseDisplace: 0,
      thinGap: 1,
      magnetX: 0.36,
      magnetY: 0.5,
      magnetHeight: 0.2,
      magnetStrength: 0.4,
      magnetSeconds: 1 / 60,
    });
  }
  const held1 = await getStats();

  return { s0, s1, s2, tail, thinSteps, noMag0, noMag1, held0, held1 };
};

let control;
if (THIN_OFF) {
  const { page, close } = await openLab({ plugins: [RIDES_STALE], tag: 'ferrodrag-stale' });
  try { control = await page.evaluate(scene, { N, R, dragOnly: true, thinOff: true }); } finally { await close(); }
}

const { page, close } = await openLab();
try {
  const result = await page.evaluate(scene, { N, R, dragOnly: false, thinOff: THIN_OFF });

  const { s0, s1, s2, tail, noMag0, noMag1, held0, held1 } = result;
  const lag = Math.abs(s1.cx - 0.66);
  const twoR = 2 * R;
  const areaRatio = s1.halfCount / held1.halfCount;
  const areaChange = Math.abs(areaRatio - 1);
  const noMagMoved = Math.hypot(noMag1.cx - noMag0.cx, noMag1.cy - noMag0.cy);

  // 1. Follows the magnet: from where it was put (a cell of 0.36, or the lag
  // is read off another drop), and the way the magnet went.
  check(
    'the drop centroid follows the magnet within 2 drop radii across 0.3 plate drag',
    lag < twoR && Math.abs(s0.cx - 0.36) < 1 / N && s1.cx - s0.cx >= 0.3 - twoR,
    `lag ${(lag / R).toFixed(2)}R (cx ${(s1.cx).toFixed(4)} from ${(s0.cx).toFixed(4)} vs magnet 0.6600, limit ${(twoR / R).toFixed(1)}R); ${s0.n01} → ${s1.n01} cells over 0.01`,
  );

  /*
    2. Holds together: dragged, the drop keeps the half-full area it has
    under the same magnet held still over it, within the same 15%.

    Until PLAN 38k-7 this was held to the drop as poured (100 cells past
    half full on 384²). The magnet here (0.4 at a height of 0.2, about
    14 mT on its axis) was then under the plate's onset, 22 mT, and a drop
    under it kept its poured footprint. At the liquid's own onset, 4 mT, it
    is three and a half times past it, and a real drop of EFH1 under such a
    magnet stands up: it gathers toward the axis into a cone, its top past
    the pool's depth (2.3 of it in the lab), on a smaller footprint. On the
    Mac (run 41308840631) the dragged drop came to 64 cells, one cone, the
    drop 8.8 mm across where the domes stand 8 mm apart, so the line was
    counting how the field stands a drop up, which is the physics, and not
    whether the drag tore it, which is what it is for (PLAN §29: dragged,
    the drop turned to a crescent and smeared to brown, 0 cells past half
    full in two seconds).

    So the reference is the same drop, the same 20 settling steps, under
    the same magnet held still over where it was poured, for the same 180
    steps: what the field alone does to its footprint. A drag that shears
    the drop apart still takes the dragged count to nothing against a held
    count of tens, and the held drop has to be there (at least half its
    poured cells; it keeps about two thirds, 64 of 100 in ferrohold's
    held-still run) for the line to read anything: a magnet that shredded
    the held drop too would take both counts down together. The bar is the one it
    was, 15%. The poured count is printed beside it.
  */
  check(
    'the drop holds together: dragged, it keeps the half-full area it has held still under the same magnet, within 15%',
    held1.halfCount >= held0.halfCount / 2 && areaChange <= 0.15,
    `dragged ${s0.halfCount} → ${s1.halfCount} cells, held still under the magnet ${held0.halfCount} → ${held1.halfCount} (${(areaRatio * 100).toFixed(1)}% of the held drop's, limit ±15%)`,
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
  const stays = (r) => {
    const moved = Math.hypot(r.s2.cx - r.s1.cx, r.s2.cy - r.s1.cy);
    return {
      moved,
      deep: r.thinSteps === 0,
      ok: moved < R && r.s1.cx > 0.55 && r.s1.halfCount > 0 && r.s2.halfCount >= 0.5 * r.s1.halfCount,
      s1Half: r.s1.halfCount,
      s2Half: r.s2.halfCount,
      text: `${120 - r.thinSteps} of 120 steps ran deep; moved ${(moved / R).toFixed(2)}R in 120 deep steps (cx ${r.s1.cx.toFixed(4)} → ${r.tail.map((t) => t.cx.toFixed(4)).join(' ')}, limit 1R); half-full ${r.s1.halfCount} → ${r.tail.map((t) => t.halfCount).join(' ')} (limit half kept); ${r.s1.n01} → ${r.s2.n01} cells over 0.01`,
    };
  };
  if (THIN_OFF) {
    const off = stays(result), stale = stays(control);
    check(
      'with Thin Gap off after the drag and no magnet, the drop stays put and stays a drop',
      off.ok && off.deep,
      off.text,
    );
    /*
      5. The control: the same scene on the plate that rides the stale
      velocity fails line 4, and by a margin, on either of its two halves:
      half a radius further than the real plate went, or a quarter of its
      half-full cells kept or fewer (half line 4's bar of a half) where the
      real plate kept at least the bar, from a drop as big as the real
      plate's when the deep steps began (at least half its count: Mac run
      41316296486, 76 against 61; held still 100 → 64), so a control lab that never had a drop is not read as
      one that smeared it.

      Until PLAN 38k-7 only the first margin was read. Then the dragged
      drop was flat, and the stale velocity slid it 1.93 radii (Metal, #528)
      as it smeared it. At the liquid's real onset the drag ends with the
      drop stood up as a cone (line 2), and on the Mac (run 41308840631) the
      stale velocity slid it only 0.67 R against the real plate's 0.22 R,
      0.45 R further, but smeared it from 70 cells past half full to 50 and
      then 0 by the second reading, where the real plate's went 64 → 80 83
      80 78. The bug (#495's, keyed off hsP alone) is still caught by line
      4, by its half-full half, and by as far as a count can be: the
      control's margin is read on whichever half it fails.
    */
    const staleKept = stale.s2Half / Math.max(1, stale.s1Half);
    const offKept = off.s2Half / Math.max(1, off.s1Half);
    check(
      'and it is the deep plate not riding the thin gap\'s last velocity: with it ridden, the same line is red',
      stale.deep && !stale.ok && (stale.moved - off.moved >= R / 2 || (staleKept <= 0.25 && offKept >= 0.5 && stale.s1Half >= 0.5 * off.s1Half)),
      `${stale.text}; ${((stale.moved - off.moved) / R).toFixed(2)}R further than the real plate (bar >= 0.5R), or ${(staleKept * 100).toFixed(0)}% of its half-full cells kept against the real plate's ${(offKept * 100).toFixed(0)}% (bar: at most 25% against at least 50%)`,
    );
  }

} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
