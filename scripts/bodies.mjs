#!/usr/bin/env node
/**
 * Oil Bodies: oil and water on the plate as two bodies, each keeping its own
 * colour, measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run bodies
 *
 * Roadmap §I, PLAN.md batch 10 step 5. The plate had one dye field and the
 * oil was a second field beside it that the dye knew nothing about, so
 * "amber oil on teal water" was amber and teal blending wherever the two
 * met, and an oil drop that moved (by the flow, or by Cahn–Hilliard, which
 * moves the oil with no liquid moving) left its colour behind. With Oil
 * Bodies the oil carries its own share of the dye (bodyPartition and
 * bodyAdvect in src/gpu/wgsl/fluid.ts). This asks whether the colours stay
 * in their liquids while the liquids move, not whether a pass ran:
 *
 *   1. after a stir with the bodies rounding and merging, the oil's colour
 *      left in the open water, and the water's colour inside the bodies,
 *      against the same plate with the setting off (the control)
 *   2. the plate makes and loses no dye doing it
 *   3. at 0 the oil's share is never made: a look that does not ask for it
 *      runs the plate it always did, and pays nothing
 *   4. dye poured over a body becomes the body's colour, and dye poured on
 *      open water stays the water's (bodyLand)
 *   5. a hand dragging the oil moves the oil and keeps all of it (carryMix)
 *   6. and the oil's own surface tension no longer eats the colour inside a
 *      drop: a settled drop keeps its dye with the setting off too. It kept
 *      41% in 120 steps before the tension was rebuilt (mixForce), which on
 *      the plate was an oil drop gone black in a second.
 *
 * The plate: 192² (the lab's display size, so the dye is read back cell for
 * cell), seven oil drops and a strip of nine overlapping ones, amber inside
 * the oil and teal in the water, laid from the oil actually on the plate so
 * the colour starts exactly where its liquid is. Then 360 steps with the top
 * glass turning (twist) and Oil Tension 0.9: the strip rounds, drops that
 * touch merge, and the whole plate turns. Amber and teal are told apart by
 * their absorbances (teal takes red, amber blue), solved per cell from the
 * red and blue channels; "open water" is a cell under 0.05 oil and "inside a
 * body" over 0.95, the band between is the edge and belongs to neither.
 *
 * Measured while writing this, on software WebGPU (the bounds below are set
 * well short of these, and well clear of the control or the old solver):
 *
 *   ① amber in open water after the stir   0.14%   (off 7.76%)    < 0.5%, off > 10×
 *     teal inside the bodies               0.01%   (off 0.30%)    < 0.1%, off > 3×
 *   ② dye 30702.2 → 30702.2, oil 3026.8 → 3026.8 (off lost 11.5% of its dye)
 *   ④ a dab over a body: 100.0% the oil's, 100.0% after 30 steps; on water 0.00%
 *   ⑤ the oil's middle moved 0.0103 of the plate; 100.00% of it kept
 *   ⑥ a settled drop keeps 88.1% of its dye (41% with the old force)   > 80%
 *
 * And what it took to get ① there, each found by this check: the colour laid
 * as dye landed a tenth of the amber as the water's (so the check now lays
 * each liquid's colour as its own); the evening-out's regulariser let open
 * water hold a fiftieth of the oil's colour by right, which the hand-over
 * then gave to the water; the dye's diffusion spread the oil's colour past
 * the rim; and the flow's transport smeared it out a cell or two a second,
 * which only a drift back toward the oil undoes. 10.3% → 6.5% → 2.0% → 0.14%.
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

const N = 192;
const STEPS = 360;
const TEAL = [1.1, 0.25, 0.35];
const AMBER = [0.1, 0.5, 1.5];
const { page, close } = await openLab();
try {
  // Seven drops and a strip; the oil first, one step so the setting is known
  // to the solver, then the colour laid from where the oil is.
  const lay = (bodies) => page.evaluate(async ({ N, bodies, TEAL, AMBER }) => {
    await lab.create(N, N);
    const s = lab.solver();
    let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 7; k++) s.addMix(0.18 + 0.64 * rnd(), 0.18 + 0.64 * rnd(), 0.035 + 0.04 * rnd(), { oil: 1 });
    for (let k = 0; k < 9; k++) s.addMix(0.3 + k * 0.05, 0.5, 0.03, { oil: 1 });
    await lab.step(1, { oilTension: 0.9, oilBodies: bodies });
    const m = await s.readChemistry('mix');
    const d = new Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const c = Math.max(0, Math.min(1, m.data[i * 4]));
      for (let ch = 0; ch < 3; ch++) d[i * 4 + ch] = 0.8 * (1 - c) * TEAL[ch] + 1.2 * c * AMBER[ch];
      d[i * 4 + 3] = 0.8 * (1 - c) + 1.2 * c;
    }
    lab.addDye(d);
    lab.flush();
    // With the bodies on, the amber is the oil's from the start. Laid as dye
    // alone it lands split by the oil under it, and on a rim four cells wide
    // that gave the water a tenth of the amber before the stir began (2.6%
    // of it in open water after 30 steps, 9.6% after 360, all as the water's
    // share): a check of the landing, which ④ makes, not of the bodies.
    if (bodies > 0) {
      const o = new Array(N * N * 4);
      for (let i = 0; i < N * N; i++) {
        const c = Math.max(0, Math.min(1, m.data[i * 4]));
        for (let ch = 0; ch < 3; ch++) o[i * 4 + ch] = 1.2 * c * AMBER[ch];
        o[i * 4 + 3] = 1.2 * c;
      }
      lab.share(o);
    }
  }, { N, bodies, TEAL, AMBER });

  // Amber and teal per cell from the red and blue absorbances, and the oil.
  const read = () => page.evaluate(async ({ N, TEAL, AMBER }) => {
    const d = await lab.field('dye'); const m = await lab.solver().readChemistry('mix');
    const det = TEAL[0] * AMBER[2] - AMBER[0] * TEAL[2];
    let amber = 0, teal = 0, amberOut = 0, tealIn = 0, mass = 0, oil = 0;
    for (let i = 0; i < N * N; i++) {
      const R = d[i * 4], B = d[i * 4 + 2];
      const t = (R * AMBER[2] - AMBER[0] * B) / det, a = (TEAL[0] * B - TEAL[2] * R) / det;
      const c = m.data[i * 4];
      amber += a; teal += t; mass += d[i * 4 + 3]; oil += c;
      if (c < 0.05) amberOut += a;
      if (c > 0.95) tealIn += t;
    }
    return { amber, teal, amberOut: amberOut / amber, tealIn: tealIn / teal, mass, oil };
  }, { N, TEAL, AMBER });

  const stir = { oilTension: 0.9, twist: 0.02, maxCurrent: 0.01, currentDamp: 0.97 };
  const arm = async (bodies) => {
    await lay(bodies);
    const start = await read();
    await page.evaluate(([n, o]) => lab.step(n, o), [STEPS, { ...stir, oilBodies: bodies }]);
    const end = await read();
    return { start, end };
  };
  const off = await arm(0);
  const on = await arm(1);
  for (const [name, r] of [['off', off], ['on ', on]]) {
    console.log(`  ${name}: amber in open water ${(r.start.amberOut * 100).toFixed(2)}% → ${(r.end.amberOut * 100).toFixed(2)}%, `
      + `teal inside the bodies ${(r.start.tealIn * 100).toFixed(2)}% → ${(r.end.tealIn * 100).toFixed(2)}%, `
      + `dye ${r.start.mass.toFixed(1)} → ${r.end.mass.toFixed(1)}, oil ${r.start.oil.toFixed(1)} → ${r.end.oil.toFixed(1)}`);
  }

  // ── 1 ──
  check('the oil\'s colour stays out of the open water',
    on.end.amberOut < 0.005 && off.end.amberOut > 10 * on.end.amberOut,
    `${(on.end.amberOut * 100).toFixed(2)}% of the amber in open water after the stir, against ${(off.end.amberOut * 100).toFixed(2)}% with it off`);
  check('and the water\'s colour out of the bodies',
    on.end.tealIn < 0.001 && off.end.tealIn > 3 * on.end.tealIn,
    `${(on.end.tealIn * 100).toFixed(2)}% of the teal inside a body, against ${(off.end.tealIn * 100).toFixed(2)}% with it off`);
  // ── 2 ──
  check('no dye is made or lost', Math.abs(on.end.mass / on.start.mass - 1) < 0.01,
    `${on.start.mass.toFixed(1)} → ${on.end.mass.toFixed(1)}`);
  check('and no oil', Math.abs(on.end.oil / on.start.oil - 1) < 0.01,
    `${on.start.oil.toFixed(1)} → ${on.end.oil.toFixed(1)}`);

  // ── 3 ──
  const zero = await page.evaluate(async () => {
    await lab.create(128);
    lab.solver().addMix(0.5, 0.5, 0.2, { oil: 1 });
    lab.dye(0.5, 0.5, 0.3, [0.5, 0.5, 0.5], 1); lab.flush();
    await lab.step(20, { oilTension: 0.9, oilBodies: 0 });
    try { await lab.field('oilDye'); return 'made'; } catch { return 'never made'; }
  });
  check('at 0 the oil\'s share is never made', zero === 'never made', zero);

  // ── 4 ──
  const land = await page.evaluate(async () => {
    await lab.create(128, 128);
    const s = lab.solver();
    s.addMix(0.3, 0.5, 0.15, { oil: 1 });
    await lab.step(30, { oilTension: 0.9, oilBodies: 1 });
    const share = async () => { const o = await lab.field('oilDye'); let t = 0; for (let k = 3; k < o.length; k += 4) t += o[k]; return t; };
    const before = await share();
    lab.dye(0.3, 0.5, 0.06, [0.5, 0.5, 0.5], 1); lab.flush();
    const afterOil = await share();
    lab.dye(0.75, 0.5, 0.06, [0.5, 0.5, 0.5], 1); lab.flush();
    const afterWater = await share();
    await lab.step(30, { oilTension: 0.9, oilBodies: 1 });
    const settled = await share();
    const dab = (() => { let t = 0; for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
      const dx = (i + 0.5) / 128 - 0.3, dy = (j + 0.5) / 128 - 0.5; t += Math.max(0, 1 - (dx * dx + dy * dy) / 0.0036); } return t; })();
    return { onOil: (afterOil - before) / dab, onWater: (afterWater - afterOil) / dab, kept: (settled - before) / dab };
  });
  check('dye poured over a body becomes its colour', land.onOil > 0.95 && land.kept > 0.9,
    `${(land.onOil * 100).toFixed(1)}% of a dab over the body went to the oil, ${(land.kept * 100).toFixed(1)}% still the oil's 30 steps on`);
  check('and dye poured on open water stays the water\'s', Math.abs(land.onWater) < 0.01,
    `${(land.onWater * 100).toFixed(2)}% of a dab on the water went to the oil`);

  // ── 5 ──
  const carry = await page.evaluate(async () => {
    await lab.create(128, 128);
    const s = lab.solver();
    s.addMix(0.4, 0.5, 0.1, { oil: 1 });
    await lab.step(1, { oilTension: 0.9, oilBodies: 1 });
    const cm = async () => { const m = await s.readChemistry('mix'); let t = 0, x = 0;
      for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) { const c = m.data[(i + j * 128) * 4]; t += c; x += c * (i + 0.5) / 128; } return { t, x: x / t }; };
    const a = await cm();
    // Ten drags to the right through the drop's middle, as fingerDrag hands them over.
    for (let k = 0; k < 10; k++) s.carryMix(0.4 + k * 0.01, 0.5, 0.06, 1, 0, 0.5, 2 / 128);
    const b = await cm();
    return { moved: b.x - a.x, kept: b.t / a.t };
  });
  check('a hand drags the oil the way it went', carry.moved > 0.005,
    `the oil's middle moved ${carry.moved.toFixed(4)} of the plate to the right`);
  check('and keeps all of it', Math.abs(carry.kept - 1) < 0.005, `${(carry.kept * 100).toFixed(2)}% of the oil`);

  // ── 6 ──
  // The plate the 41% was measured on, so the two numbers are one
  // comparison: a 128 grid read at the lab's 192, a flat disc of oil a fifth
  // of the plate across with dye laid on it as a disc of the same size.
  const drop = await page.evaluate(async () => {
    await lab.create(128);
    const s = lab.solver(); const L = 192;
    const d = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L - 0.5, y = (j + 0.5) / L - 0.5;
      const q = Math.min(1, Math.max(0, (0.2 - Math.hypot(x, y)) * 128 / 1.5 + 0.5));
      const k = (i + j * L) * 4; d[k] = 0.1 * q; d[k + 1] = 0.5 * q; d[k + 2] = 1.5 * q; d[k + 3] = q;
    }
    lab.addDye(d);
    s.addMix(0.5, 0.5, 0.2, { oil: 1 });
    lab.flush();
    const tot = async () => { const f = await lab.field('dye'); let t = 0; for (let k = 3; k < f.length; k += 4) t += f[k]; return t; };
    const a = await tot();
    await lab.step(120, { oilTension: 0.9, oilBodies: 0 });
    return (await tot()) / a;
  });
  check('a settled drop keeps its colour with the setting off', drop > 0.8,
    `${(drop * 100).toFixed(1)}% of its dye after 120 steps (41% before the tension was rebuilt)`);
} finally {
  await close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
