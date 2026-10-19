/**
 * The dragged ferrofluid drop, while it is being dragged (PLAN 29c-8's
 * neighbour): the two passes that keep a drop together under a moving
 * magnet, each held on its own, in a window `npm run ferrodrag` is too late
 * for.
 *
 *   npm run ferrohold
 *   npm run ferrohold -- --control momentum    (phaseMomentum off, by hand)
 *   npm run ferrohold -- --control compress    (phaseCompress off, by hand)
 *
 * Why this exists. `ferrodrag` reads the drop after three seconds, by which
 * time the trailing rim has gone into the oil's return flow (29c-8) whatever
 * the passes do, so it is red with them and red without them, and nothing in
 * CI noticed when `phaseMomentum` (the ferrofluid carried along itself) or
 * `phaseCompress` (what the flux limiter withheld at the moving edge, paid
 * back) was switched off: the review of #373 at 0580eaa found both could go
 * and every Mac check stay green. The drop is whole in the first second and a
 * half, so this reads it there, over a window and not at one step: the
 * `ferrodrag` scene (384², R 0.022 from (0.36, 0.5), 20 settling steps, then
 * the 0.4 magnet at depth 0.2 moved 0.3 of the plate in 180 steps) read every
 * 10 steps from step 60 to step 120, and the mean of the seven readings.
 *
 *  1. The drop keeps up with the hand: the magnet's lead over the drop's
 *     centroid, in drop radii, mean over the window, at most LAG_BAR. The
 *     momentum pass is what lets the ferrofluid in a rim cell travel at its
 *     own speed, not the oil's; without it the drop trails further.
 *  2. The drop keeps its body: the mean count of cells over half-full is at
 *     least HALF_BAR. The deficit pass pays back the share the limiter
 *     withheld at the moving edge; without it the edge thins and the body
 *     goes sooner.
 *  3. The control is a dragged drop: it was whole when the window opened (at
 *     least 60 half-full cells at step 60, so neither bar is passed by a
 *     drop that was never there), and the magnet had moved.
 *
 * Controls, measured on the same scene (software WebGPU; the numbers for
 * Metal are in the PR body), mean over the seven readings:
 *
 *                       lead of the magnet    half-full cells
 *   both passes on      2.01R                 60.3
 *   phaseMomentum off   2.28R  (bar 2.15)     63.7
 *   phaseCompress off   2.05R                 34.4  (bar 47)
 *
 * so each bar sits between the run it is for and the run it must pass, each
 * control turns red only the line named for the pass it switches off, and
 * the other line stays green with it. The margins are a tenth of a radius
 * and a dozen cells; the lag is the thin one, since the momentum pass is a
 * small share of what keeps the drop up. `phaseCompress` is a lab-only
 * switch in the solver's step options (1 on, the default, so no look
 * changes).
 *
 * Lab only (software WebGPU in headless Chrome, or Metal on the Mac).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const control = process.argv.includes('--control') ? process.argv[process.argv.indexOf('--control') + 1] : '';
const extra = control === 'momentum' ? { phaseMomentum: 0 } : control === 'compress' ? { phaseCompress: 0 } : {};
if (control && !Object.keys(extra).length) throw new Error(`--control ${control}: momentum or compress`);

const N = 384;
const R = 0.022;
const FROM = 60, TO = 120, EVERY = 10;
// Midway between the on run and the off run that each bar is for (software
// WebGPU, see the header): lag 2.01R on, 2.28R with phaseMomentum off; half-full
// 60.3 on, 34.4 with phaseCompress off.
const LAG_BAR = 2.15;
const HALF_BAR = 47;

const { page, close } = await openLab();
try {
  const rows = await page.evaluate(async ({ N, R, FROM, TO, EVERY, extra }) => {
    const stats = async () => {
      const p = await lab.phase();
      if (!p || p.n !== N) throw new Error(`phase: ${p ? `${p.n}² read for ${N}²` : 'no phase field'}`);
      let half = 0, sp = 0, sx = 0, peak = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = p.data[j * N + i];
        if (v > peak) peak = v;
        if (v > 0.5) half++;
        if (v > 0.05) { sp += v; sx += (i + 0.5) / N * v; }
      }
      return { half, cx: sp ? sx / sp : 0, peak };
    };
    await lab.create(N, N);
    lab.addPhase(0.36, 0.5, R, 1);
    for (let k = 0; k < 20; k++) await lab.step(1, { phaseSharp: 0.75, phaseDisplace: 0, thinGap: 1, magnetStrength: 0, ...extra });
    const out = [];
    for (let k = 1; k <= TO; k++) {
      const magX = 0.36 + 0.3 * (k / 180);
      await lab.step(1, { phaseSharp: 0.75, phaseDisplace: 0, thinGap: 1, magnetX: magX, magnetY: 0.5, magnetHeight: 0.2, magnetStrength: 0.4, magnetSeconds: 1 / 60, ...extra });
      if (k >= FROM && (k - FROM) % EVERY === 0) out.push({ k, magX, ...(await stats()) });
    }
    return out;
  }, { N, R, FROM, TO, EVERY, extra });

  const lags = rows.map((r) => (r.magX - r.cx) / R);
  const mean = (a) => a.reduce((t, x) => t + x, 0) / a.length;
  const lag = mean(lags), half = mean(rows.map((r) => r.half));
  console.log(`  ${control ? `control: ${control} off` : 'on'}; steps ${FROM} to ${TO} every ${EVERY}: lag in R ${lags.map((x) => x.toFixed(2)).join(' ')}, half-full ${rows.map((r) => r.half).join(' ')}, peak ${rows.map((r) => r.peak.toFixed(2)).join(' ')}`);

  check('the drop was whole and the magnet had moved when the window opened',
    rows[0].half >= 60 && rows[0].magX > 0.43,
    `${rows[0].half} half-full cells at step ${FROM} (bar >= 60), magnet at ${rows[0].magX.toFixed(3)} from 0.360`);
  check('the momentum pass keeps the drop up with the hand: the magnet leads its centroid by at most 2.15 drop radii over steps 60 to 120',
    lag <= LAG_BAR,
    `mean lead ${lag.toFixed(2)}R (bar <= ${LAG_BAR}R)`);
  check('the compression pass keeps the drop its body: at least 47 half-full cells on average over steps 60 to 120',
    half >= HALF_BAR,
    `mean ${half.toFixed(1)} half-full cells (bar >= ${HALF_BAR}; the step-0 drop has 100)`);
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
