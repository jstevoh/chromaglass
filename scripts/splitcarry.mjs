#!/usr/bin/env node
/**
 * The dye's two liquids' shares carried in one pass (PLAN 38w-33).
 *
 *   npm run splitcarry      (any adapter that computes: scripts/lab.mjs)
 *
 * With Oil Bodies on, the plate's dye is carried as its two liquids' shares
 * (PLAN 38w-29, 38w-32): the water's (the dye less the oil's) with van
 * Leer's MC and the corner, the oil's with superbee and none, so the oil's
 * colour goes where the oil goes. As 38w-29 shipped it that was four passes
 * round every step's carry: bodyWater split the dye, the water's share was
 * carried through the faces, the oil's share was carried through the same
 * faces again, and bodyJoin added them back. 38w-33 does it in one
 * (wgsl/fluid/split.ts): both shares through each face once, split and
 * joined in every substep. This asks that it is the same carry and that it
 * costs less, on each of the three plates the split runs on.
 *
 * The plate: Classic's liquid at 128², oil drops with amber in them and teal
 * in the water (oilride's lay, smaller), thirty steps of Beat Squeeze's kick
 * and Plate Rock (and Glass Smear, so the glass drifts the film and the
 * drift of both shares, driftShiftSplit, runs too; with --plate=air in
 * oilride's words, a bubble standing on the oil). Carried twice from the
 * same start, the software adapter being deterministic: once in one pass
 * all the way, once in one pass for twenty-nine steps and the last apart
 * (`fuseSplit` off: 38w-29's four passes). Asked, on each plate:
 *
 *   1. the two runs were the same plate before the last step (to the bit),
 *      so whatever differs after is the last step's carry and nothing else
 *   2. each run carried the way it was asked (lastShareCarry), and on the
 *      thin plate the glass's drift moved both shares together, and with
 *      air the shares went through the air's room (the counters)
 *   3. the oil's share after the last step the same both ways, within
 *      OIL_SAME of its largest cell (SAME, by the dye's format)
 *   4. the whole dye the same both ways within DYE_SAME of its largest
 *      cell: the split, the carries and the join are the same sums on the
 *      same floats, so only the glass's drift, which splits the joined dye
 *      again, can round differently. And under MOVED_SHARE of what the last
 *      step itself changed, which must be over 0.01 of a cell, so a carry
 *      that did nothing could not pass 3 and 4
 *   5. every amount kept: the dye's and the oil's share's sums the same
 *      both ways within SUM_SAME
 *   6. and cheaper: the last step's share carry repeated on the GPU's queue
 *      (benchShares, the slope between two counts), one pass under
 *      CHEAPER of the time apart, on the thin plate (the one every look
 *      with Oil Bodies plays on)
 *
 * Measured while writing this (software WebGPU, 128², 30 steps, the dye in
 * rgba32float):
 *
 *   split in every substep, the water's share read as the dye less the
 *   oil's at every neighbour: the same fields to 2e-7, but 104 to 110 ms a
 *   step's share carry against 86 to 90 ms apart (1.16 to 1.28: FAIL)
 *   this (split in the first substep, joined in each): thin 76.1 ms
 *   against 92.1 (0.83; 70.2 against 89.9 without the drift), the dye 3e-7
 *   of its largest cell apart (the drift's rounding; 0 without it), air
 *   1e-7 and the shed through the air's room, the old plate to the bit.
 *   Before airShed was split per share, air's dye was 0.27% apart.
 */
import { openLab } from './lab.mjs';

const N = 128;
const STEPS = 30;
/*
  The carries are the same sums in the same order, so the fields agree to
  the last bit but for the glass's drift, which splits the joined dye again
  (driftShiftSplit): to a float's rounding, which depends on the dye's
  format (rgba32float where the adapter filters it, else half floats).
*/
const SAME = { rgba32float: 1e-6, rgba16float: 2e-3 };
const MOVED_SHARE = 0.1;
const SUM_SAME = 1e-5;
/*
  Measured under SwiftShader at 128², five runs: 0.78, 0.80, 0.83, 0.88,
  0.89 of the time apart. The bar says cheaper with room for that spread.
*/
const CHEAPER = 0.95;
const KICK = 0.6;
const ROCK = 0.2;
const TEAL = [1.1, 0.25, 0.35];
const AMBER = [0.1, 0.5, 1.5];
// `-- --plate=air` (or thin, old) runs one plate alone.
const ONLY = process.argv.find((a) => a.startsWith('--plate='))?.slice(8);
const PLATES = ONLY ? [ONLY] : ['thin', 'air', 'old'];
if (!PLATES.every((p) => ['thin', 'air', 'old'].includes(p))) throw new Error(`--plate=${ONLY}: thin, air or old`);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => gpuErrors.push(String(e).slice(0, 200)));
try {
  const base = await page.evaluate(() => {
    const s = lab.look('classic').settings;
    return { thinGap: 1, bubbleClear: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag, platePressure: s.platePressure,
      oilTension: s.oilTension, oilBodies: s.oilBodies, filmHold: s.filmHold, diff: s.diffusionRate, turbScale: 0 };
  });
  if (!(base.oilBodies > 0)) throw new Error('Classic no longer turns Oil Bodies on: this check carries the oil\'s share, which only Oil Bodies keeps');

  /** One run on `plate` from the same start: STEPS − 1 steps in one pass, the last as `last` says; the fields before and after it. */
  const run = (plate, last, bench) => page.evaluate(async ({ N, STEPS, over, plate, last, bench, TEAL, AMBER, KICK, ROCK, mac }) => {
    await lab.create(N, N);
    const s = lab.solver();
    s.fuseSplit = true;
    let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
    for (let k = 0; k < 10; k++) s.addMix(0.2 + 0.6 * rnd(), 0.2 + 0.6 * rnd(), 0.04 + 0.04 * rnd(), { oil: 1 });
    await lab.step(1, over);
    const m = await s.readChemistry('mix');
    const d = new Array(N * N * 4), o = new Array(N * N * 4);
    for (let i = 0; i < N * N; i++) {
      const c = Math.max(0, Math.min(1, m.data[i * 4]));
      for (let ch = 0; ch < 3; ch++) { d[i * 4 + ch] = 0.8 * (1 - c) * TEAL[ch] + 1.2 * c * AMBER[ch]; o[i * 4 + ch] = 1.2 * c * AMBER[ch]; }
      d[i * 4 + 3] = 0.8 * (1 - c) + 1.2 * c; o[i * 4 + 3] = 1.2 * c;
    }
    lab.addDye(d);
    lab.flush();
    lab.share(o);
    let seedA = 3; const rndA = () => (seedA = seedA * 16807 % 2147483647) / 2147483647;
    const fields = async () => ({ dye: Array.from(await lab.field('dye')), oil: Array.from(await lab.field('oilDye')) });
    let prior = null, air0 = 0, drift0 = 0;
    for (let k = 0; k < STEPS; k++) {
      if (k % 10 === 0) lab.sheetPress(0.3 + 0.4 * rndA(), 0.3 + 0.4 * rndA(), KICK, 1e-6);
      // A bubble on the plate's middle, over the drops, and drifting a little.
      if (plate === 'air') s.setBubbles(new Float32Array([0.4 + 0.2 * k / STEPS, 0.5, 0.06, 1]), 1, 0.25, new Float32Array(4));
      lab.sheetStep();
      lab.flush();
      if (k === STEPS - 1) {
        prior = await fields();
        air0 = s.sharpAirCarries;
        drift0 = s.sharesDrifted;
        s.fuseSplit = last === 'one pass';
      }
      const t = k / 60;
      await lab.step(1, { ...over, smearX: 8, rockX: ROCK * Math.sin(2 * Math.PI * t / 3), rockY: ROCK * Math.cos(2 * Math.PI * t / 3) }, true);
    }
    const out = { format: s.dyeFormat, prior, after: await fields(), how: s.lastShareCarry, air: s.sharpAirCarries - air0, drifted: s.sharesDrifted - drift0, thin: s.thinGapLive };
    s.fuseSplit = true;
    if (bench) {
      // Each way once first, so both ways' pipelines are in before the clock.
      await s.benchShares(1, true); await s.benchShares(1, false);
      // A Mac's GPU does a 128² carry in microseconds: many more repeats there, so the queue's own cost is not what is timed (thick's way).
      const [few, many] = mac ? [20, 420] : [2, 22];
      const slope = async (fused) => {
        const all = [];
        // Five slopes each way, interleaved and the least of each taken: a software adapter shares its cores with the page.
        for (let k = 0; k < 5; k++) {
          const a = await s.benchShares(few, fused), b = await s.benchShares(many, fused);
          all.push((b - a) / (many - few));
        }
        return Math.min(...all);
      };
      out.cost = { fused: await slope(true), apart: await slope(false) };
    }
    return out;
  }, { N, STEPS, over: { ...base, thinGap: plate === 'old' ? 0 : 1 }, plate, last, bench, TEAL, AMBER, KICK, ROCK, mac: process.platform === 'darwin' });

  const diff = (a, b) => {
    let d = 0, m = 0, at = -1;
    for (let i = 0; i < a.length; i++) { if (Math.abs(a[i] - b[i]) > d) { d = Math.abs(a[i] - b[i]); at = i; } m = Math.max(m, Math.abs(b[i])); }
    return { d, m, at };
  };
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const g = (v) => v.toPrecision(3);

  for (const plate of PLATES) {
    console.log(`\n${plate} plate`);
    const t0 = Date.now();
    const A = await run(plate, 'one pass', plate === 'thin');
    const B = await run(plate, 'apart', false);
    console.log(`  two runs of ${STEPS} steps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    const prior = Math.max(diff(A.prior.dye, B.prior.dye).d, diff(A.prior.oil, B.prior.oil).d);
    const oil = diff(A.after.oil, B.after.oil), dye = diff(A.after.dye, B.after.dye);
    const moved = Math.max(diff(A.prior.dye, A.after.dye).d, diff(A.prior.oil, A.after.oil).d);
    const OIL_SAME = SAME[A.format] ?? 2e-3, DYE_SAME = OIL_SAME;
    console.log(`  the dye in ${A.format}: the same within ${OIL_SAME} of the largest cell`);
    check(`${plate}: the same plate before the last step`, prior === 0, `largest difference ${g(prior)}`);
    check(`${plate}: on the plate this run asks`, A.thin === (plate !== 'old') && B.thin === A.thin, `thinGapLive ${A.thin}, ${B.thin}`);
    check(`${plate}: each run carried as asked`, A.how === 'one pass' && B.how === 'apart', `last step ${A.how}, then ${B.how}`);
    if (plate === 'thin') check('thin: the glass\'s drift moved both shares together', A.drifted === 1, `${A.drifted} drifts of both shares in the last step (bar 1)`);
    if (plate === 'air') check('air: both shares went through the air\'s room', A.air === 1 && B.air === 1, `in one pass ${A.air}, apart ${B.air} (bar 1 each)`);
    check(`${plate}: the oil's share the same both ways`, oil.d <= OIL_SAME * oil.m, `largest difference ${g(oil.d)} of its largest cell ${g(oil.m)} (${g(oil.d / oil.m)}, bar ${OIL_SAME})`);
    check(`${plate}: the whole dye the same both ways`, moved > 0.01 && dye.d <= DYE_SAME * dye.m && dye.d <= MOVED_SHARE * moved,
      `largest difference ${g(dye.d)} of its largest cell ${g(dye.m)} (${g(dye.d / dye.m)}, bar ${DYE_SAME}), against ${g(moved)} the last step moved (bar a tenth, and it moved over 0.01)`);
    if (dye.at >= 0) {
      const i = dye.at, c = i >> 2;
      console.log(`  the dye's largest difference at cell (${c % N}, ${Math.floor(c / N)}) channel ${i & 3}: one pass ${g(A.after.dye[i])}, apart ${g(B.after.dye[i])}; the oil's share there ${g(A.after.oil[i])}, ${g(B.after.oil[i])}; before ${g(A.prior.dye[i])}, ${g(A.prior.oil[i])}`);
    }
    const sd = Math.abs(sum(A.after.dye) / sum(B.after.dye) - 1), so = Math.abs(sum(A.after.oil) / sum(B.after.oil) - 1);
    check(`${plate}: every amount kept the same`, sd <= SUM_SAME && so <= SUM_SAME, `dye's sum ${g(sd)} apart, the oil's share's ${g(so)} (bar ${SUM_SAME})`);
    if (A.cost) {
      const { fused, apart } = A.cost;
      check('thin: and cheaper', fused > 0 && apart > 0 && fused < CHEAPER * apart,
        `${fused.toFixed(3)} ms a step's share carry in one pass, ${apart.toFixed(3)} ms apart (${(fused / apart).toFixed(2)}, bar ${CHEAPER}) at ${N}²`);
    }
  }
  check('no GPU errors', gpuErrors.length === 0, gpuErrors[0] ?? '');
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} of ${checks.length} FAILED` : `\nall ${checks.length} ok`);
process.exit(failed ? 1 : 0);
