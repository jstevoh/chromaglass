#!/usr/bin/env node
/**
 * Ferro Pushes Dye: the ferrofluid moves the colour it moves through,
 * measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run ferrodye
 *
 * The owner's references for Ferro Paint, Chemical Bouillon's "Colored I" and
 * "II", are black ferrofluid worked through coloured water: the black pushes
 * the colour into cells between its channels and packs it bright along its
 * edges. Watching our Ferro Paint (the watch tool, lab clips) the colours sat
 * still and the black moved through them as if drawn on top, and the lab
 * said the same in numbers: the dye under the black was as thick as the dye
 * in open water. The pass that fixes it is phaseDisplace in
 * src/gpu/wgsl/fluid.ts. This asks whether the dye moved, not whether a
 * pass ran:
 *
 *   1. where the black grew into coloured water, the colour left, and with
 *      the setting off it stayed (the control, so the measure is not low by
 *      itself)
 *   2. the colour it pushed out sits along its edge: the water beside the
 *      black holds more dye than the water far from it, by more than it does
 *      with the setting off
 *   3. dye poured under a pool comes out of its middle, which the push
 *      alone cannot reach (asked of the pass directly, on one settled pool)
 *   4. the pass makes and loses no dye: twenty passes on their own, judged
 *      against how much they moved
 *   5. at 0 nothing changes, to the bit, and 0.01 does: every look that does
 *      not ask for it runs the plate it always did
 *
 * The plate: even dye everywhere, eighteen drops of ferrofluid (the drops of
 * `npm run maze`), the Labyrinth at 0.9 and a magnet walking a circle, 360
 * steps at 256². Even dye, so any structure in the dye at the end is made by
 * the ferrofluid. The dye is read back at the lab's display size and the
 * phase is averaged onto it; "black" is a cell past 0.6 full, "water" under
 * 0.3, the band between is the edge and belongs to neither.
 *
 * Measured while writing this, on software WebGPU:
 *
 *                                              off     on
 *   dye left in the 680 cells the black grew    71%     8%
 *   water beside the black / far water          0.84    1.49
 *   dye under the black / its share of area     0.80    0.13
 *   a pool's middle after 600 passes            100%    57%   (inside exchange off / on)
 *   twenty passes alone: 1316 units moved, the total 36001.5 → 36005.0
 *   60 steps at 0, absent and 0.01: equal, equal, different
 *
 * The same 680 cells in both arms: the push moves the dye and never the
 * ferrofluid, so the black grows the same way on or off and the two arms
 * compare the same cells. The control for 1 is 71%, not 100%, because the
 * magnet's flow carries some dye out of those cells too; the bound on it
 * (over 60%) says only that the measure does not read low by itself, and
 * the bound on the setting (under 30%) is well past what flow alone does.
 * Why the edge is judged against the off arm and not against 1: with the
 * setting off the water beside the black is poorer than far water (0.84),
 * because the flow round a pool thins the dye there, so "over 1" would ask
 * the push first to undo that.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else (a few minutes there).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const STEPS = 360;
const { page, close } = await openLab();
try {
  // The dye's density channel and the phase averaged onto the same cells.
  const read = () => page.evaluate(async () => {
    const d = await lab.field('dye'); const f = await lab.phase();
    const L = Math.round(Math.sqrt(d.length / 4)), n = f.n, s = n / L;
    const ph = new Array(L * L).fill(0), cnt = new Array(L * L).fill(0);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = Math.min(L - 1, Math.floor(x / s)) + Math.min(L - 1, Math.floor(y / s)) * L;
      ph[i] += f.data[x + y * n]; cnt[i]++;
    }
    const dye = new Array(L * L);
    for (let i = 0; i < L * L; i++) { ph[i] /= cnt[i]; dye[i] = d[i * 4 + 3]; }
    return { L, ph, dye };
  });
  const lay = (N) => page.evaluate(async (N) => {
    await lab.create(N);
    lab.dye(0.5, 0.5, 3, [0.3, 0.5, 0.7], 1);
    lab.flush();
    for (let k = 0; k < 18; k++) { const a = k * 2.399963229728653, rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
      lab.addPhase(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad, 0.07, 0.9); }
  }, N);
  // The magnet walks a circle a quarter of the plate out, twenty steps at a time.
  const play = async (steps, over) => {
    for (let k = 0; k < steps; k += 20) {
      const a = k / 60;
      await page.evaluate(([n, o]) => lab.step(n, o), [Math.min(20, steps - k), {
        magnetStrength: 0.5, magnetX: 0.5 + 0.25 * Math.cos(a), magnetY: 0.5 + 0.25 * Math.sin(a), magnetHeight: 0.3,
        ferroLabyrinth: 0.9, phaseSharp: 0.75, ...over }]);
    }
  };
  const BLACK = 0.6, WATER = 0.3;
  const measure = (start, end) => {
    const { L, ph, dye } = end;
    let grownStart = 0, grownEnd = 0, grown = 0, mass = 0, under = 0, area = 0;
    for (let i = 0; i < L * L; i++) {
      mass += dye[i];
      if (ph[i] > BLACK) { under += dye[i]; area++; }
      if (start.ph[i] < WATER && ph[i] > BLACK) { grownStart += start.dye[i]; grownEnd += dye[i]; grown++; }
    }
    // Water within two cells of the black, against water five or more away.
    const dist = new Int32Array(L * L).fill(99);
    for (let i = 0; i < L * L; i++) if (ph[i] > BLACK) dist[i] = 0;
    for (let it = 1; it <= 5; it++) for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const i = x + y * L; if (dist[i] < 99) continue;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < L && Y < L && dist[X + Y * L] === it - 1) { dist[i] = it; }
      }
    }
    let rim = 0, kr = 0, far = 0, kf = 0;
    for (let i = 0; i < L * L; i++) {
      if (ph[i] >= WATER) continue;
      if (dist[i] <= 2) { rim += dye[i]; kr++; } else if (dist[i] >= 5) { far += dye[i]; kf++; }
    }
    return { mass, grown, left: grownEnd / Math.max(1e-9, grownStart), rim: (rim / kr) / (far / kf), under: (under / mass) / (area / (L * L)) };
  };

  const arm = async (displace) => {
    await lay(256);
    const start = await read();
    await play(STEPS, { phaseDisplace: displace });
    return measure(start, await read());
  };
  const off = await arm(0);
  const on = await arm(1);
  for (const [name, r] of [['off', off], ['on ', on]]) {
    console.log(`  ${name}: ${r.grown} cells grown into, ${(r.left * 100).toFixed(0)}% of their dye left in them; `
      + `water beside the black ${r.rim.toFixed(2)} of far water; dye under the black ${r.under.toFixed(2)} of its area; dye ${r.mass.toFixed(0)}`);
  }
  console.log('');

  check('where the black grows into colour, the colour leaves',
    on.left < 0.3 && off.left > 0.6 && on.grown > 50 && off.grown > 50,
    `${(on.left * 100).toFixed(0)}% of the dye left in the ${on.grown} cells the black grew into, against ${(off.left * 100).toFixed(0)}% in ${off.grown} with it off`);
  check('and packs along its edge',
    on.rim > off.rim * 1.1,
    `water beside the black holds ${on.rim.toFixed(2)} of the far water's dye, ${off.rim.toFixed(2)} with it off`);
  /*
    3. The inside exchange, on its own terms. The arms above cannot show it:
    with it switched off the push alone drains the maze's thin fingers and
    they read almost as low (the check-skeptic measured 0.36 against 0.13),
    so a pool's middle is asked directly. One pool, a fifth of the plate
    across, poured on even dye and left to settle with no magnet and no
    maze; then the pass alone, 600 times (300 steps' worth), once with the
    inside exchange at its real strength and once with it at 0. The dye
    left in the middle half of the pool must fall well below what the push
    alone leaves there, which is all of it, since the middle has no slope.
    Measured: 57% against 100%. It is slow on purpose (a diffusion, and the
    middle is drawn black), so the bound is 75%, which the push alone
    cannot reach and a working inside exchange passes with room.
  */
  const middle = async (inside) => {
    await page.evaluate(async () => {
      await lab.create(256);
      lab.dye(0.5, 0.5, 3, [0.3, 0.5, 0.7], 1);
      lab.flush();
      lab.addPhase(0.5, 0.5, 0.1, 0.95);
      await lab.step(30);
    });
    const before = await read();
    await page.evaluate(async (inside) => { await lab.displacePasses(600, lab.displace.push, inside ? lab.displace.inside : 0); }, inside);
    const after = await read();
    const { L } = after;
    let b = 0, a = 0;
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      if (Math.hypot((x + 0.5) / L - 0.5, (y + 0.5) / L - 0.5) > 0.05) continue;
      b += before.dye[x + y * L]; a += after.dye[x + y * L];
    }
    return a / b;
  };
  const withInside = await middle(true), pushOnly = await middle(false);
  check('dye poured under a pool comes out of its middle',
    withInside < 0.75 && pushOnly > 0.9,
    `the middle of a pool keeps ${(withInside * 100).toFixed(0)}% of its dye after 600 passes, ${(pushOnly * 100).toFixed(0)}% with the inside exchange off`);

  /*
    4. The pass makes and loses no dye. Judged against what it moves, not
    against the whole plate: twenty passes on a plate like the arms' shift
    about a thousand units of dye between cells out of some 36000, so a
    tolerance on the total could hide a pass that destroyed a tenth of what
    it moved (the check-skeptic's finding). A freshly laid plate, settled,
    then twenty passes at the engine's own strengths.
  */
  await lay(256);
  await play(40, { phaseDisplace: 0 });
  const b4 = await read();
  await page.evaluate(async () => { await lab.displacePasses(20, lab.displace.push, lab.displace.inside); });
  const a4 = await read();
  let moved = 0, before4 = 0, after4 = 0;
  for (let i = 0; i < a4.dye.length; i++) { moved += Math.abs(a4.dye[i] - b4.dye[i]); before4 += b4.dye[i]; after4 += a4.dye[i]; }
  check('and makes and loses no dye',
    moved > 200 && Math.abs(after4 - before4) / moved < 0.01,
    `twenty passes alone move ${moved.toFixed(0)} units of dye between cells; the total goes ${before4.toFixed(1)} → ${after4.toFixed(1)}, ${(Math.abs(after4 - before4) / moved * 100).toFixed(2)}% of what moved`);

  /*
    5. At 0 the stage is not run. The solver reads a missing setting as 0
    (`p.phaseDisplace ?? 0`), so "0 against absent" alone proves only that
    the run is deterministic. The third arm, 0.01, is what shows the measure
    can see the pass at all: it must differ.
  */
  const sumAfter = async (over) => {
    await lay(256);
    await play(60, over);
    return page.evaluate(async () => { const d = await lab.field('dye'); let m = 0; for (let i = 0; i < d.length; i++) m += d[i] * ((i % 97) + 1); return m; });
  };
  const zero = await sumAfter({ phaseDisplace: 0 }), absent = await sumAfter({}), faint = await sumAfter({ phaseDisplace: 0.01 });
  check('at 0 the plate is the plate it was', zero === absent && faint !== zero,
    `60 steps: dye field sums ${zero.toFixed(3)} at 0, ${absent.toFixed(3)} without it, ${faint.toFixed(3)} at 0.01`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
