#!/usr/bin/env node
/**
 * The Press on a thin gap, as the app lays it: does the liquid go out under
 * the palm and come back when the hand lets go? Measured on the GPU solver
 * (scripts/lab.mjs) with the app's own strokes (lib/squish.ts).
 *
 *   npm run presslift
 *
 * What was reported (the owner, 2026-09-28): "it just pushes everything out
 * instead of bringing it back when you release." On the old solver nothing
 * can bring it back (a press's source is balanced by a sink over the whole
 * plate, and the colour is moved by a one-way carry, pressDye). Thin Gap
 * (PLAN §18a) makes the flow reversible, as squeeze flow between two glasses
 * is, and `npm run thingap` holds that for a gentle press of the lab's own.
 * The app's Press is not gentle, and four things stood between it and a
 * press that comes back, each measured here on the lab's plate at the app's
 * grids (a 384² solver under the 192 the hands lay on) and Classic's clock:
 *
 *   - It closed the film to its floor in a step or two, and the liquid it
 *     squeezed out crossed up to 75 cells of the solver in a step, where the
 *     colour's carry may take 0.45. The colour was left behind: the ring went
 *     42% of the way out, and the slow lift then drew it in past where it
 *     began. Now the glass closes as a film under a load does, slowing as h³
 *     (squeezeUpdate on a thin gap): 8 cells in the fastest step.
 *   - And the carries take as many substeps as the step's flow needs
 *     (carryPlan), so even those 8 cells are carried.
 *   - It was three stacked flat discs, steps in the gap, where a palm bends
 *     the glass into a bowl (squishDisc, thin).
 *   - The glass sprang back on the look's clock (Speed × 0.2 a step), so on
 *     Classic it was half way back in about fourteen seconds. On a thin gap
 *     it springs in the show's seconds (glassSpring).
 *
 * The checks:
 *   1. The ring round the palm goes out to r² = r₀² + V/πh₀, V the volume
 *      the glass displaced (read from the gap), to 5% of the shift. And the
 *      colour under the palm's middle leaves with its liquid: the colour is
 *      an amount, h·C, and C does not change where only the liquid's own
 *      colour flows, so what is left within 0.03 of the middle is the gap
 *      there over what it was, between 0.6 and 1.2 times it (and the gap
 *      has to have closed by a fifth at least, or there is nothing to ask).
 *      Not closer: the carry's face velocities are rebuilt from the cells'
 *      (PLAN 18a-8), and across the bowl's slope they carry the colour a
 *      little ahead of its liquid, 0.75 of the gap's share left in
 *      software (×0.171 against ×0.227). A colour left behind, as the
 *      clamped carry left it, reads well over 1.
 *   2. Every drop is kept, each colour to 0.5%.
 *   3. The carries took the substeps the press needed: more than one while
 *      the glass closed, and never as many as the plan allows (carryPlan
 *      picks enough to keep every face under 0.4 of a cell a substep, so
 *      only at its ceiling can a face cross more), and one again once the
 *      press held still.
 *   4. Let go, the ring is on its way back within a second: at least a
 *      quarter of its shift back after 1 s. Control: the glass on the look's
 *      clock, as it was, which must come back less than that. And it is
 *      where the glass still pressed down puts it, check 1's law with the
 *      volume left, to a tenth of its shift at 1, 1.5 and 3 s (a ring a
 *      third behind its glass would still pass a quarter back), with every
 *      drop kept to 0.5% at 1 and 9 s: a mean radius also falls when colour
 *      is lost from the outside.
 *   5. And all the way back: once the gap is within a twentieth of its
 *      press of rest, the ring is within a tenth of its shift of where it
 *      began, and the colour under the palm within a quarter (it was drawn
 *      out into a thin ring and back, and the carry's limiter smears a thin
 *      ring: 16% measured in software, the ring 3%).
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async () => {
    // The app's grids: the hands lay on GRID_SIZE (192), the solver runs finer under it.
    const N = 384, L = 192, C = L / 2;
    // Classic's step (Speed × 0.2), its Thickness and Press Lift, from the look as the app lays it.
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const SECONDS = 1 / 60;
    const PRESS = { radii: [30, 18, 8].map((r) => r * (L / 128)), amount: 0.004, steps: 90 };
    const dist = (i, j, n) => Math.hypot((i + 0.5) / n - 0.5, (j + 0.5) / n - 0.5);
    const R0 = 0.3, DISC = 0.06, MID = 0.03;
    const run = async ({ thin = true, spring = 'seconds', liftSteps = 540, samples = [60, 90, 180, 540] }) => {
      await lab.create(N, L);
      const over = {
        thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, gapMemory: 0,
        gapSpring: lab.glassSpring(look.plateSpring ?? 0.35, spring === 'seconds' ? SECONDS : DT),
      };
      // A ring round the palm in red, a disc under it in green.
      const lay = new Array(L * L * 4).fill(0);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = (i + j * L) * 4, d = dist(i, j, L);
        if (Math.abs(d - R0) < 0.008) { lay[k] = 1; lay[k + 3] = 1; }
        if (d < DISC) { lay[k + 1] = 1; lay[k + 3] = 1; }
      }
      lab.addDye(lay); lab.flush(DT);
      await lab.step(2, over);
      const read = async () => {
        const d = await lab.field('dye'), sq = await lab.squeeze();
        const s = [0, 0], w = [0, 0];
        for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
          const k = (i + j * L) * 4;
          for (let c = 0; c < 2; c++) { s[c] += d[k + c] * dist(i, j, L); w[c] += d[k + c]; }
        }
        let v = 0, hMid = 0, nMid = 0, mid = 0;
        for (let k = 0; k < sq.gap.length; k++) {
          v += (0.03 - sq.gap[k]) / sq.gap.length;
          if (dist(k % sq.n, Math.floor(k / sq.n), sq.n) < MID) { hMid += sq.gap[k]; nMid++; }
        }
        for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) if (dist(i, j, L) < MID) mid += d[(i + j * L) * 4 + 1];
        return { ring: s[0] / w[0], disc: s[1] / w[1], red: w[0], green: w[1], V: v, mid, hMid: hMid / nMid };
      };
      const t0 = await read();
      const carries = [];
      for (let k = 0; k < PRESS.steps; k++) {
        for (const R of PRESS.radii) lab.squish(C, C, R, PRESS.amount, 0, 'press', 0, thin);
        lab.flush(DT);
        await lab.step(1, over);
        if (k < 12 || k === PRESS.steps - 1) carries.push(await lab.carry());
      }
      const t1 = await read();
      const lift = {};
      let at = 0;
      for (const s of samples.filter((x) => x <= liftSteps)) {
        await lab.step(s - at, over);
        at = s;
        lift[s] = await read();
      }
      return { t0, t1, lift, carries, expect: Math.sqrt(R0 * R0 + t1.V / (Math.PI * 0.03)) };
    };
    return {
      ceiling: lab.carrySubsteps,
      now: await run({}),
      clock: await run({ spring: 'look', liftSteps: 60, samples: [60] }),
    };
  });

  const { now, clock, ceiling } = r;
  const R0 = 0.3;
  const pct = (a, b) => `${((b / a - 1) * 100).toFixed(2)}%`;
  const shift = now.expect - now.t0.ring;
  const back = (run, s) => (run.t1.ring - run.lift[s].ring) / (run.t1.ring - run.t0.ring);

  // 1.
  check('a press pushes its ring out to r² = r₀² + V/πh₀, the volume the glass displaced',
    Math.abs((now.t1.ring - now.t0.ring) / shift - 1) < 0.05,
    `ring ${now.t0.ring.toFixed(4)} → ${now.t1.ring.toFixed(4)}, the displaced volume (${now.t1.V.toExponential(2)}) puts it at ${now.expect.toFixed(4)}: ${((now.t1.ring - now.t0.ring) / shift * 100).toFixed(0)}% of the shift`);
  {
    // The colour is an amount, h·C: where the film thins and the liquid leaves, C stays and the amount goes with the liquid.
    const want = now.t1.hMid / now.t0.hMid, got = now.t1.mid / now.t0.mid;
    check('and the colour under the palm\'s middle leaves with its liquid, as much as the film there thinned',
      want < 0.8 && got / want > 0.6 && got / want < 1.2,
      `colour within ${0.03} of the middle ${now.t0.mid.toFixed(1)} → ${now.t1.mid.toFixed(1)} (×${got.toFixed(3)}), the gap there ${now.t0.hMid.toFixed(4)} → ${now.t1.hMid.toFixed(4)} (×${want.toFixed(3)}); the disc's mean radius ${now.t0.disc.toFixed(4)} → ${now.t1.disc.toFixed(4)}`);
  }

  // 2.
  const lost = (run) => Math.max(Math.abs(run.t1.red / run.t0.red - 1), Math.abs(run.t1.green / run.t0.green - 1));
  check('every drop of the colour is kept, round the palm and under it',
    lost(now) < 0.005,
    `ring ${now.t0.red.toFixed(1)} → ${now.t1.red.toFixed(1)} (${pct(now.t0.red, now.t1.red)}), under the palm ${now.t0.green.toFixed(1)} → ${now.t1.green.toFixed(1)} (${pct(now.t0.green, now.t1.green)})`);

  // 3.
  {
    const closing = now.carries.slice(0, 12), held = now.carries[now.carries.length - 1];
    const most = closing.reduce((a, c) => (c && c.n > a.n ? c : a), { n: 0, courant: 0 });
    const underCeiling = closing.every((c) => c && c.n < ceiling && c.courant / c.n <= 0.45);
    check('the carries took the substeps the closing glass needed, never at their ceiling, and one once it held still',
      most.n > 1 && underCeiling && held && held.n === 1,
      `at most ${most.n} substeps of ${ceiling} for a Courant number of ${most.courant.toFixed(2)} (${(most.courant / Math.max(1, most.n)).toFixed(2)} a substep); held still, ${held ? held.n : '—'} (${held ? held.courant.toFixed(4) : '—'})`);
  }

  // 4.
  // Where the ring should be at each moment of the lift: check 1's law, with the volume the glass still holds down.
  const law = (t) => Math.sqrt(R0 * R0 + t.V / (Math.PI * 0.03));
  const behind = [60, 90, 180].map((s) => Math.abs(now.lift[s].ring - law(now.lift[s])) / shift);
  // The colour under the palm comes back more slowly than the ring (a thin ring drawn out is smeared by the carry's limiter): printed, for the app's check (tools.mjs), which reads the same colour.
  const discBack = [60, 90, 180].map((s) => (now.t1.disc - now.lift[s].disc) / (now.t1.disc - now.t0.disc));
  const keptLift = [60, 540].map((s) => Math.max(Math.abs(now.lift[s].red / now.t0.red - 1), Math.abs(now.lift[s].green / now.t0.green - 1)));
  check('let go, the ring is on its way back within a second, where the glass still held down puts it, and every drop kept',
    back(now, 60) >= 0.25 && back(clock, 60) < 0.25 && behind.every((b) => b < 0.1) && keptLift.every((l) => l < 0.005),
    `${(back(now, 60) * 100).toFixed(0)}% of its shift back after 1 s, ${(back(now, 90) * 100).toFixed(0)}% after 1.5 s, ${(back(now, 180) * 100).toFixed(0)}% after 3 s; with the glass on the look's clock (the control) ${(back(clock, 60) * 100).toFixed(0)}% after 1 s; off where r² = r₀² + V/πh₀ puts it by ${behind.map((b) => `${(b * 100).toFixed(0)}%`).join(', ')} of the shift at 1, 1.5 and 3 s; colour lost ${keptLift.map((l) => `${(l * 100).toFixed(2)}%`).join(' and ')} at 1 and 9 s; the colour under the palm ${discBack.map((b) => `${(b * 100).toFixed(0)}%`).join(', ')} back at 1, 1.5 and 3 s`);

  // 5.
  {
    const end = now.lift[540];
    const left = (k) => Math.abs(end[k] - now.t0[k]) / Math.abs(now.t1[k] - now.t0[k]);
    check('and all the way back once the glass is: the ring and the colour under the palm where they began',
      end.V < 0.05 * now.t1.V && left('ring') < 0.1 && left('disc') < 0.25,
      `after 9 s the gap is ${(end.V / now.t1.V * 100).toFixed(1)}% of its press from rest; ring ${now.t1.ring.toFixed(4)} → ${end.ring.toFixed(4)} against ${now.t0.ring.toFixed(4)} (${(left('ring') * 100).toFixed(0)}% of its shift left), under the palm ${now.t1.disc.toFixed(4)} → ${end.disc.toFixed(4)} against ${now.t0.disc.toFixed(4)} (${(left('disc') * 100).toFixed(0)}%)`);
  }
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
