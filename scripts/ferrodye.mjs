#!/usr/bin/env node
/**
 * Ferro Pushes Dye: the ferrofluid moves the colour it moves through,
 * measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run ferrodye
 *
 * Steve's references for Ferro Paint, Chemical Bouillon's "Colored I" and
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
 *   3. dye poured under a pool comes out over time
 *   4. the pass makes and loses no dye: twenty passes on their own
 *   5. at 0 nothing changes, to the bit: every look that does not ask for it
 *      runs the plate it always did
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
 *   twenty passes alone                         35221.3 → 35221.5
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
  check('dye poured under a pool comes out',
    on.under < 0.5 && off.under > 0.7,
    `dye under the black ${on.under.toFixed(2)} of its share of the area after ${STEPS} steps, ${off.under.toFixed(2)} with it off`);

  // 4. The pass alone, on the plate the "on" arm left: twenty passes at full,
  // nothing else run, the dye summed before and after.
  const drift = await page.evaluate(async () => {
    const s = lab.solver();
    const sum = async () => { const d = await lab.field('dye'); let m = 0; for (let i = 3; i < d.length; i += 4) m += d[i]; return m; };
    const before = await sum();
    const enc = s.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    const args = s.arg('ferrodye check', [0.18, 0.06, 0, 0]);
    for (let k = 0; k < 20; k++) { s.run(pass, 'phaseDisplace', s.dye.write, [s.dye.read, s.phase.read], args); s.dye.swap(); }
    pass.end(); s.device.queue.submit([enc.finish()]);
    await s.device.queue.onSubmittedWorkDone();
    return { before, after: await sum() };
  });
  check('and makes and loses no dye',
    Math.abs(drift.after / drift.before - 1) < 0.001,
    `twenty passes alone: ${drift.before.toFixed(1)} → ${drift.after.toFixed(1)}`);

  // 5. At 0 the stage is not run: the same plate, sixty steps, with the
  // setting at 0 and with it absent, must agree to the last bit.
  const sumAfter = async (over) => {
    await lay(256);
    await play(60, over);
    return page.evaluate(async () => { const d = await lab.field('dye'); let m = 0; for (let i = 0; i < d.length; i++) m += d[i] * ((i % 97) + 1); return m; });
  };
  const zero = await sumAfter({ phaseDisplace: 0 }), absent = await sumAfter({});
  check('at 0 the plate is the plate it was', zero === absent,
    `60 steps: dye field sums ${zero.toFixed(3)} at 0 and ${absent.toFixed(3)} without it`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
