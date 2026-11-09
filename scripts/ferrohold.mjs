/**
 * The dragged ferrofluid drop, while it is being dragged (PLAN 29c-8's
 * neighbour): the two passes that keep a drop together under a moving
 * magnet, each held on its own, over the whole drag.
 *
 *   npm run ferrohold
 *
 * Why this exists. `ferrodrag` reads the drop after three seconds, by which
 * time, before 29c-8, the trailing rim had gone into the oil's return flow
 * whatever the passes did, so it was red with them and red without them, and
 * nothing in CI noticed when `phaseMomentum` (the ferrofluid carried along
 * itself) or `phaseCompress` (what the flux limiter withheld at the moving
 * edge, paid back) was switched off: the review of #373 at 0580eaa found both
 * could go and every Mac check stay green. The drop was whole in the first
 * second and a half, so this read it there, over a window and not at one step: the
 * `ferrodrag` scene (384², R 0.022 from (0.36, 0.5), 20 settling steps, then
 * the 0.4 magnet at depth 0.2 moved 0.3 of the plate in 180 steps) read every
 * 10 steps from step 60 to step 120, and the mean of the seven readings.
 *
 * Since 29c-8 (#495) the trailing rim holds to the end of the drag
 * (`phaseVelocity`; `ferrodrag`'s drag lines in CI since 29c-10), and the window
 * runs to step 180, the mean of thirteen readings. Read over the old window
 * after #495, the passes were worth less there: the compression pass's
 * margin fell from 25.7 cells to 15.0 on Metal and 13.4 on software WebGPU,
 * against a bar of 13, and both absolute bars were passed by the runs they
 * were there to fail (lead 1.93R with phaseMomentum off, bar 2.15R; 92.6
 * half-full cells with phaseCompress off, bar 47). Over the whole drag each
 * pass is worth more, because without it the drop goes on losing ground
 * through the second half of the drag where with it the drop holds (the
 * second table below): so the window is the drag, the absolute bars sit
 * between the runs again, and the differentials are kept or raised, never
 * lowered.
 *
 *  1. The drop keeps up with the hand: the magnet's lead over the drop's
 *     centroid, in drop radii, mean over the window, at most LAG_BAR. The
 *     momentum pass is what lets the ferrofluid in a rim cell travel at its
 *     own speed, not the oil's; without it the drop trails further.
 *  2. The drop keeps its body: the mean count of cells over half-full is at
 *     least HALF_BAR. The deficit pass pays back the share the limiter
 *     withheld at the moving edge; without it the edge thins and the body
 *     goes sooner.
 *  3. Each pass is shown to be the reason, in the same run. The scene is run
 *     three times in one page, as given, with phaseMomentum off and with
 *     phaseCompress off, and the pass must be worth something: the lead with
 *     phaseMomentum off exceeds the lead as given by at least DLAG_BAR, and the
 *     half-full count as given exceeds the count with phaseCompress off by at
 *     least DHALF_BAR. The absolute bars alone are one-sided (the review of
 *     this check ran the scene with the pull 10% stronger and phaseMomentum
 *     off, and the lead read 2.01R, green: anything that speeds the drop up
 *     stands in for the pass); the differential says the pass itself is on.
 *  4. The control is a dragged drop: it was whole when the window opened (at
 *     least 60 half-full cells at step 60, so neither bar is passed by a
 *     drop that was never there), and its centroid, read from the solver's
 *     phase field and not from the magnet's path, had moved over 0.40 from
 *     the 0.36 it settled at (0.42 measured on software WebGPU; 84 half-full
 *     cells and 0.422 on Metal), so the lag is of a dragged drop.
 *
 * Controls, measured on the scene before #495 and over steps 60 to 120
 * (software WebGPU, and Metal on the Mac
 * CI runner in `WebGPU (macOS) · fifth`, `main` runs 40154167142, 40140795675
 * and 40123398910 and #373's run 39280236231, identical across all four), mean
 * over the seven readings:
 *
 *                       lead of the magnet          half-full cells
 *                       software  Metal             software  Metal
 *   both passes on      2.01R     2.02R             60.3      61.4
 *   phaseMomentum off   2.28R     2.29R  (bar 2.15) 63.7      62.9
 *   phaseCompress off   2.05R     2.06R             34.4      35.7  (bar 47)
 *
 * (On Metal, steps 60..120 every 10 read: as given, lag 1.71 1.81 1.91 2.01
 * 2.12 2.23 2.35R, half-full 84 74 68 64 52 48 40, peak 0.96..0.65;
 * phaseMomentum off, lag 1.85 2.00 2.14 2.29 2.43 2.58 2.74R, half-full 82 80
 * 76 66 56 46 34, peak 0.90..0.56; phaseCompress off, lag 1.71 1.82 1.93 2.05
 * 2.17 2.31 2.45R, half-full 76 64 54 40 16 0 0, peak 0.84..0.43.)
 *
 * so each absolute bar sits between the run it is for and the run it must
 * pass, and the two off-runs are the script's own, read by lines 4 and 5 of
 * the five checks as differentials of half the gap measured (0.13R of 0.27R on
 * both; 13 of 25.9 cells on software, 25.7 on Metal). The margins are a
 * tenth of a radius and a dozen cells; the lag is the thin one, since the
 * momentum pass is a small share of what keeps the drop up. `phaseCompress`
 * is a lab-only switch in the solver's step options (1 on, the default, so no
 * look changes).
 *
 * The same, after #495, over steps 60 to 180 every 10 (software WebGPU, the
 * cloud lab, 2026-10-27; the mean of the thirteen, and in brackets the mean
 * of the first seven, the old window):
 *
 *                       lead of the magnet       half-full cells
 *   both passes on      1.73R  (1.67R)           105.8  (106.9)
 *   phaseMomentum off   2.06R  (1.92R)            97.8  (103.4)
 *   phaseCompress off   1.73R  (1.65R)            82.0   (93.4)
 *
 * (as given, lag 1.54 1.61 1.66 1.69 1.72 1.74 1.76 1.77 1.78 1.78 1.79 1.79
 * 1.79R, half-full 106 108 110 106 104 106 108 103 106 106 104 104 104;
 * phaseMomentum off, lag 1.67 1.77 1.86 1.94 2.00 2.06 2.11 2.15 2.18 2.22
 * 2.24 2.27 2.29R; phaseCompress off, half-full 96 102 94 94 96 88 84 80 74
 * 72 68 62 56.) The lead's bar is 1.89R, midway between 1.73R and 2.06R; the
 * body's is 94, midway between 105.8 and 82.0. The momentum pass's
 * differential is 0.16R, half its gap of 0.33R (it was 0.13R, half of 0.27R);
 * the compression pass's stays 13 cells, more than half its gap of 23.8.
 * On Metal (#521's fifth shard, run 40592589582) the same: lead 1.74R on and
 * 2.07R with phaseMomentum off, half-full 105.8 on and 82.2 with
 * phaseCompress off.
 *
 * At the real 2 mm gap (PLAN 38r part 2, #641) the same scene stopped
 * telling the passes apart, and on the physics, not the check: the
 * ferrofluid's drag time in the gap goes as h², 0.6 s at 6 mm and 0.07 s
 * (four steps) at 2 mm, so a drop pulled at the old hand's pace (0.3 of
 * the plate in three seconds) is held to the oil by the glass and keeps up
 * on the drag alone. Measured on software WebGPU (which reads the Mac's
 * fifth shard to the digit, 4ecf2f6: 0.98R on and 1.00R without the momentum
 * pass, 99.6 and 97.2 half-full cells), the means over steps 60 to 180:
 *
 *                       lead      half-full  peak (last)
 *   both passes on      0.98R     99.2       0.95
 *   phaseMomentum off   1.00R     103.6      0.92
 *   phaseCompress off   0.98R     97.1       0.77
 *
 * Each pass still does its work, but where the 6 mm scene read it no
 * longer shows. The momentum pass is what lets a rim cell travel at the
 * ferrofluid's own speed rather than the oil's, which matters only when
 * the magnet pulls the drop faster than the oil round it follows, so in a
 * thin gap it shows only at a quicker hand: the drag in two speeds, scene
 * for scene (dragged DIST of the plate over DRAG steps, read every EVERY
 * from DRAG/3 to the end):
 *
 *   0.3 in 120 steps (0.15/s)  lead 1.58R on, 1.66R off (0.07R)
 *   0.3 in 60 steps  (0.3/s)   lead 4.01R on, 4.18R off (0.16R, over steps 20 to 60)
 *   0.45 in 90 steps (0.3/s)   lead 5.73R on, 6.20R off (0.47R)
 *
 * And the compression pass pays back what the limiter withheld at the
 * moving edge, which at 2 mm no longer empties the edge below half (the
 * half-full count is blind to it, 102.3 on and 101.2 off in the 120-step
 * drag) but thins the body's core: its peak falls 0.97 → 0.77 and the cells
 * over three quarters 42.0 → 23.8 on the mean (in the quick drag 34.8 →
 * 23.3: the drop strung out behind the magnet thins either way).
 *
 * So the check runs two scenes, four runs in one page and no more steps
 * than the three 180-step runs it had (2·120 + 2·90): the drop dragged at
 * 0.15 of the plate a second for the body and the old lag bar, and at 0.3 a
 * second for the momentum pass's differential. Every bar is kept or raised:
 * the lead in the slow drag is still at most 1.89R (1.58R; the drop keeps up
 * with the hand better in a thin gap, not worse); the half-full body still at
 * least 94 (102.3); the momentum pass's differential still 0.16R, now read
 * where its gap is 0.47R; and the compression pass's differential still 13
 * cells, now of cells over three quarters (their gap 18.2), with an
 * absolute bar of its own midway between the runs, 33 (42.0 on, 23.8 off).
 * The quick drag's absolute lead is printed and not a bar: the magnet
 * outruns a drop held by a 2 mm gap at that speed, as a real one does.
 *
 * Lab only (software WebGPU in headless Chrome, or Metal on the Mac).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

if (process.argv.length > 2) throw new Error(`ferrohold takes no arguments (got ${process.argv.slice(2).join(' ')}); its controls run inside it`);

const N = 384;
const R = 0.022;
// The two drags (the header's 2 mm table): the slow one for the body and the
// lead, the quick one for the momentum pass's differential.
const SLOW = { DRAG: 120, DIST: 0.3 };
const QUICK = { DRAG: 90, DIST: 0.45 };
const windowOf = ({ DRAG }) => ({ FROM: Math.round(DRAG / 3), TO: DRAG, EVERY: Math.round(DRAG / 18) });
// The lead's bar as it was after #495 (1.73R on, 2.06R off at 6 mm), kept: at
// 2 mm the slow drag's drop reads 1.58R. The half-full body's, kept: 102.3.
const LAG_BAR = 1.89;
const HALF_BAR = 94;
// Cells over three quarters, midway between 42.0 on and 23.8 with
// phaseCompress off in the slow drag (software WebGPU, 2 mm).
const CORE_BAR = 33;
// The differentials kept from #495: 0.16R (the quick drag's gap is 0.47R)
// and 13 cells (the slow drag's core gap is 18.2).
const DLAG_BAR = 0.16;
const DHALF_BAR = 13;

const { page, close } = await openLab();
try {
  const runs = await page.evaluate(async ({ N, R, SLOW, QUICK, slowW, quickW }) => {
    const stats = async () => {
      const p = await lab.phase();
      if (!p || p.n !== N) throw new Error(`phase: ${p ? `${p.n}² read for ${N}²` : 'no phase field'}`);
      let half = 0, core = 0, sp = 0, sx = 0, peak = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = p.data[j * N + i];
        if (v > peak) peak = v;
        if (v > 0.5) half++;
        if (v > 0.75) core++;
        if (v > 0.05) { sp += v; sx += (i + 0.5) / N * v; }
      }
      return { half, core, cx: sp ? sx / sp : 0, peak };
    };
    const scene = async ({ DRAG, DIST }, { FROM, TO, EVERY }, extra) => {
      await lab.create(N, N);
      lab.addPhase(0.36, 0.5, R, 1);
      for (let k = 0; k < 20; k++) await lab.step(1, { phaseSharp: 0.75, phaseDisplace: 0, thinGap: 1, magnetStrength: 0, ...extra });
      const out = [];
      for (let k = 1; k <= TO; k++) {
        const magX = 0.36 + DIST * (k / DRAG);
        await lab.step(1, { phaseSharp: 0.75, phaseDisplace: 0, thinGap: 1, magnetX: magX, magnetY: 0.5, magnetHeight: 0.2, magnetStrength: 0.4, magnetSeconds: 1 / 60, ...extra });
        if (k >= FROM && (k - FROM) % EVERY === 0) out.push({ k, magX, ...(await stats()) });
      }
      return out;
    };
    return {
      on: await scene(SLOW, slowW, {}),
      noCompress: await scene(SLOW, slowW, { phaseCompress: 0 }),
      quickOn: await scene(QUICK, quickW, {}),
      noMomentum: await scene(QUICK, quickW, { phaseMomentum: 0 }),
    };
  }, { N, R, SLOW, QUICK, slowW: windowOf(SLOW), quickW: windowOf(QUICK) });

  const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const read = (rows) => ({ rows, lags: rows.map((r) => (r.magX - r.cx) / R), lag: mean(rows.map((r) => (r.magX - r.cx) / R)), half: mean(rows.map((r) => r.half)), core: mean(rows.map((r) => r.core)) });
  const on = read(runs.on), noC = read(runs.noCompress), qOn = read(runs.quickOn), noM = read(runs.noMomentum);
  const sw = windowOf(SLOW), qw = windowOf(QUICK);
  for (const [name, r, d, w] of [['on', on, SLOW, sw], ['phaseCompress off', noC, SLOW, sw], ['quick, on', qOn, QUICK, qw], ['quick, phaseMomentum off', noM, QUICK, qw]]) {
    console.log(`  ${name} (${d.DIST} of the plate in ${d.DRAG} steps); steps ${w.FROM} to ${w.TO} every ${w.EVERY}: lag in R ${r.lags.map((x) => x.toFixed(2)).join(' ')}, half-full ${r.rows.map((x) => x.half).join(' ')}, over three quarters ${r.rows.map((x) => x.core).join(' ')}, peak ${r.rows.map((x) => x.peak.toFixed(2)).join(' ')}`);
  }
  const slow = `over steps ${sw.FROM} to ${sw.TO} of the slow drag (${SLOW.DIST} of the plate in ${SLOW.DRAG} steps)`;

  check('the drop was whole and had been carried when the window opened',
    on.rows[0].half >= 60 && on.rows[0].cx > 0.40,
    `${on.rows[0].half} half-full cells at step ${sw.FROM} (bar >= 60), centroid at ${on.rows[0].cx.toFixed(3)} from 0.360 (bar > 0.400, 15 cells)`);
  check(`the drop keeps up with the hand: the magnet leads its centroid by at most ${LAG_BAR} drop radii ${slow}`,
    on.lag <= LAG_BAR,
    `mean lead ${on.lag.toFixed(2)}R (bar <= ${LAG_BAR}R); in the quick drag ${qOn.lag.toFixed(2)}R, printed: the magnet outruns a drop a 2 mm gap holds`);
  check(`the drop keeps its body: at least ${HALF_BAR} half-full cells, and at least ${CORE_BAR} over three quarters, on average ${slow}`,
    on.half >= HALF_BAR && on.core >= CORE_BAR,
    `mean ${on.half.toFixed(1)} half-full (bar >= ${HALF_BAR}; the step-0 drop has 100), ${on.core.toFixed(1)} over three quarters (bar >= ${CORE_BAR})`);
  check(`and it is the momentum pass: with phaseMomentum off in the quick drag (${QUICK.DIST} of the plate in ${QUICK.DRAG} steps) the lead is at least ${DLAG_BAR} drop radii longer`,
    noM.lag - qOn.lag >= DLAG_BAR,
    `lead ${qOn.lag.toFixed(2)}R on, ${noM.lag.toFixed(2)}R with phaseMomentum off over steps ${qw.FROM} to ${qw.TO} (difference ${(noM.lag - qOn.lag).toFixed(2)}R, bar >= ${DLAG_BAR}R)`);
  check(`and it is the compression pass: with phaseCompress off in the same slow drag the body's core is at least ${DHALF_BAR} cells over three quarters fewer`,
    on.core - noC.core >= DHALF_BAR,
    `${on.core.toFixed(1)} cells over three quarters on, ${noC.core.toFixed(1)} with phaseCompress off (difference ${(on.core - noC.core).toFixed(1)}, bar >= ${DHALF_BAR}); half-full ${on.half.toFixed(1)} and ${noC.half.toFixed(1)}, printed`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
