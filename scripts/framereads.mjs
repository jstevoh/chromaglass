#!/usr/bin/env node
/**
 * What the frame reads back from the solver, and when (PLAN.md 14ab-3, 14ab-9).
 *
 *   npm run framereads      (the lab: any adapter that computes, PW_WEBGPU=1 off a Mac)
 *
 * Read in the code on 2026-10-24 (14ab, and 14j before it): `syncFromGpu`
 * runs every frame for every layer, at the display's rate, and the solver's
 * `readbackAsync` under it asked the GPU for both fields every time, two
 * downsample dispatches, two 590 KB copies and two mappings, whether or not
 * the solver had stepped. A 120 Hz display stepping at sixty, or the governor
 * at thirty, read the same fields back on every other frame; a frozen plate
 * read the same plate back sixty times a second. And it handed back "fresh"
 * whenever its ring held anything, so the caller's loop over every cell (the
 * mirror, the means) ran on every frame on numbers it already had.
 *
 * Thick liquid's share (`speciesShare`, about once a second) went through
 * `readField`, which made a MAP_READ buffer and two 590 KB arrays a read.
 *
 * So this runs the real solver in the lab and plays the frame's side of it:
 * one `readbackAsync` a frame, the GPU let finish between frames as a
 * refresh would. The feature is "the fields are read back when the solver
 * has written them, and only then, and the mirror is the field":
 *   - thirty frames of a still plate ask for nothing and take nothing;
 *   - a plate stepping every other frame asks once for each step, no more;
 *   - what is taken is never the same readback twice;
 *   - a pour handed across on a still plate, with no step after it, is read
 *     back and the mirror holds it (`applyDeltas` writes the dye in its own
 *     submit; the review of 14ab-3 found it going round the count);
 *   - once settled, the mirror is the field read straight out (`readField`),
 *     number for number;
 *   - thick liquid's share is the share `readField` and the rim's square root
 *     gave, to the bit, and a read after the first makes no buffer;
 * and two controls that say the measure can see what it is looking for:
 *   - a clear on a still plate, with no step, is read back, and the mirror
 *     holds the empty plate (the counting sees a write that is not a step);
 *   - the counting sees a readback asked for (the first frame asks: twice,
 *     since until a ring has landed something it is asked again).
 */
import { openLab } from './lab.mjs';

const N = Number(process.env.FRAMEREADS_GRID ?? 128);
const FRAMES = 30;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  const r = await page.evaluate(async ({ n, frames }) => {
    const p = { thinGap: 1 };
    await lab.create(n);
    lab.dye(0.4, 0.45, 0.15, [1.2, 0.5, 0.3], 3);
    lab.flush();
    await lab.step(4, p);
    const s = lab.solver();
    const settle = async () => { await s.device.queue.onSubmittedWorkDone(); await new Promise((res) => setTimeout(res, 16)); };
    const taken = [];
    const frame = async () => {
      const before = s.rbDyeIssued;
      const fresh = s.readbackAsync();
      if (fresh) taken.push(s.rbDyeLanded);
      // And asked again at once, as a frame that comes round before the
      // mapping does: nothing has landed since, so nothing is to be taken.
      if (s.readbackAsync()) taken.push(s.rbDyeLanded);
      await settle();
      return { asked: s.rbDyeIssued - before, fresh: fresh ? 1 : 0 };
    };
    const run = async (k, between) => {
      const t = { asked: 0, fresh: 0, steps: 0 };
      for (let i = 0; i < k; i++) {
        if (between) t.steps += await between(i);
        const f = await frame();
        t.asked += f.asked; t.fresh += f.fresh;
      }
      return t;
    };
    // The step's own readbacks asked for and landed.
    const first = await frame();
    await run(4);

    const still = await run(frames);
    const meanDye = () => { const v = s.rbDyeView; let a = 0; for (let i = 3; i < v.length; i += 4) a += v[i]; return a / (v.length / 4); };
    // Writes that are not a step. A pour handed across (`applyDeltas` folds
    // it into the dye in its own submit), with no step after it: the mirror
    // must show it. Then the plate cleared at once.
    const beforePour = meanDye();
    lab.dye(0.6, 0.6, 0.12, [0.3, 0.6, 1.4], 3);
    lab.flush();
    const pour = await run(6);
    const afterPour = meanDye();
    s.clear();
    const clear = await run(6);
    const afterClear = meanDye();
    lab.dye(0.4, 0.45, 0.15, [1.2, 0.5, 0.3], 3);
    lab.flush();
    await lab.step(2, p);
    const stepping = await run(frames, async (i) => { if (i % 2) return 0; await lab.step(1, p); return 1; });
    await run(4);

    // The mirror against the field read straight out.
    const diff = async (view, which) => {
      const f = await s.readField(which);
      let most = 0;
      for (let i = 0; i < f.length; i++) most = Math.max(most, Math.abs(f[i] - view[i]));
      return most;
    };
    const dyeOff = await diff(s.rbDyeView, 'dye');
    const velOff = await diff(s.rbVelView, 'vel');
    const repeats = taken.length - new Set(taken).size;

    // Thick liquid's share: the new read against the way it was read, on the same plate.
    lab.addSpecies(0.5, 0.5, 0.3, 50, 'glycerine', false);
    await lab.step(2, p);
    const sp = await s.readField('species');
    const L = Math.round(Math.sqrt(sp.length / 4));
    let sum = 0, cells = 0;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      if (Math.hypot((i + 0.5) / L - 0.5, (j + 0.5) / L - 0.5) >= 0.5) continue;
      sum += sp[(i + j * L) * 4];
      cells++;
    }
    const was = sum / Math.max(1, cells);
    const make = s.device.createBuffer.bind(s.device);
    let made = 0;
    s.device.createBuffer = (...a) => { made++; return make(...a); };
    const shares = [];
    let madeFirst = 0;
    try {
      for (let k = 0; k < 3; k++) { shares.push(await s.speciesShare()); if (k === 0) madeFirst = made; }
    } finally { s.device.createBuffer = make; }
    return { first, still, pour, clear, afterClear, stepping, beforePour, afterPour, dyeOff, velOff, repeats, taken: taken.length, was, shares, madeFirst, madeAfter: made - madeFirst };
  }, { n: N, frames: FRAMES });

  console.log(`  ${N}² grid, thin gap; one readbackAsync a frame`);
  console.log(`  still plate, ${FRAMES} frames: ${r.still.asked} asked, ${r.still.fresh} taken`);
  console.log(`  a step every other frame, ${FRAMES} frames, ${r.stepping.steps} steps: ${r.stepping.asked} asked, ${r.stepping.fresh} taken`);
  console.log(`  thick liquid's share ${r.shares[0]} (was ${r.was}); buffers made: ${r.madeFirst} on the first read, ${r.madeAfter} on the two after`);

  check('control: the counting sees a readback asked for (the first frame asks)', r.first.asked >= 1, `${r.first.asked} asked`);
  check('a pour on a still plate, with no step, is read back and the mirror holds it', r.pour.asked >= 1 && r.pour.fresh >= 1 && r.afterPour > r.beforePour * 1.05,
    `${r.pour.asked} asked, ${r.pour.fresh} taken; mean dye ${r.beforePour.toFixed(4)} → ${r.afterPour.toFixed(4)}`);
  check('control: a clear on a still plate is read back, and the mirror holds it', r.clear.asked >= 1 && r.clear.fresh >= 1 && r.afterPour > 0.01 && r.afterClear < r.afterPour * 0.01,
    `${r.clear.asked} asked, ${r.clear.fresh} taken; mean dye ${r.afterPour.toFixed(4)} → ${r.afterClear.toFixed(4)}`);
  check('a still plate asks for nothing and takes nothing', r.still.asked === 0 && r.still.fresh === 0, `${r.still.asked} asked, ${r.still.fresh} taken in ${FRAMES} frames`);
  check('a plate stepping every other frame asks once a step', r.stepping.asked === r.stepping.steps, `${r.stepping.asked} asked for ${r.stepping.steps} steps`);
  check('no readback is taken twice', r.repeats === 0 && r.taken > 0, `${r.repeats} repeats in ${r.taken} taken`);
  check('settled, the mirror is the field read straight out', r.dyeOff === 0 && r.velOff === 0, `dye off by ${r.dyeOff}, flow by ${r.velOff}`);
  check('thick liquid\'s share is the share it was, to the bit', r.shares[0] > 0 && r.shares.every((v) => v === r.was), `${r.shares.join(', ')} against ${r.was}`);
  check('a share read after the first makes no buffer', r.madeAfter === 0, `${r.madeAfter} made`);
} finally { await close(); }
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
