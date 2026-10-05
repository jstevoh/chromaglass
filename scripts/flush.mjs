#!/usr/bin/env node
/**
 * A pour is liquid (PLAN 18c), and a liquid leaves the dish by being pushed
 * out of it, not by fading (PLAN 18d-2). Measured on the GPU solver alone
 * (scripts/lab.mjs), on a thin gap.
 *
 *   npm run flush
 *
 * What was there: a bottle's pour changed what was in the column where it
 * landed and added nothing to it. Ten seconds of a held dropper of water
 * moved nothing on the plate, and glycerine, once poured, could not be
 * flushed out by anything: 18d-1 faded it instead, 22 s to a third, which
 * no real dish does. Now a pour is a volume source in the thin solve
 * (hsDivergence, pourVolume), the species it brings is added to the column
 * well mixed, and what the flow carries past the open rim is taken off.
 *
 * Each check is a consequence of the volume being conserved, with the
 * number it gives. Between two glasses with the gap h₀ everywhere, a pour
 * of volume V·h₀ at the middle pushes every circle of liquid round it out
 * from radius r to √(r² + V/π): the area inside it grows by exactly what
 * came in.
 *
 *   1. A ring of colour at 0.15 of the plate round a held pour of water
 *      at the middle: the ring's mean r² grows by V/π, to 5%. The mean of
 *      r², not of r, because r² is what the flow moves by a constant, so
 *      the carry's spreading of the ring's width does not move it. With
 *      no volume a pour of water lays nothing at all (the plate before
 *      18c), and the ring drifts by less than a hundredth of that.
 *   2. Glycerine poured as volume is all accounted for: the species' total
 *      is the sum of the pours' shares (f·πr²/2 a dome), to 1%, and the
 *      flow each made has carried it off its disc: no cell is fuller than
 *      a whole column (1.02), and its mean r² is a full disc of that
 *      area's, πR² = V and R²/2, within 0.9 to 1.3 for the carry's
 *      spreading of its edge. A pour whose flow never ran would keep the
 *      total and fail both. Its first version mixed
 *      the pour into the column, (was + f)/(1 + f), and then let the pour's
 *      own flow carry f of it out, counting that outflow twice: it read
 *      0.495, half of every pour gone, glycerine into glycerine adding
 *      nothing at all.
 *   3. A dish of glycerine flushed with clear liquid: a quarter of the
 *      dish's volume of water poured at the middle pushes a quarter of the
 *      glycerine over the rim and leaves the rest, 0.75 of the dish, to 1%
 *      (the front stays well inside the rim, so what left was all
 *      glycerine). 18d-1's fade over the run would read 4% low. The dish is
 *      full to the rim and no further first, to 2%: a rim that never took
 *      the corners off would read 1.27.
 *   4. And the water is where it was poured: the middle of the dish is
 *      clear liquid again, its share under 0.05.
 *   5. And the app's held stream, on the CPU: a second of a held Dropper
 *      pours 2 mL (HELD_POUR), no step of it clipped at a whole column.
 *   And any GPU validation error fails the run.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
 */
import { openLab } from './lab.mjs';
import { HELD_POUR, pourShare } from '../src/lib/liquidProps.ts';
import { DISH_METRES, DISH_REST_GAP } from '../src/lib/turntable.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  5. The held stream the app pours with (pourShare, LiquidVisualizer's
  onDeposit), which the lab's pours do not go through: a second of a held
  Dropper at its default width (3 cells of the 128 its geometry was tuned
  at), a step at a time at 60 a second, puts down 2 mL, and no step of it
  is clipped at a whole column, so the rate is the rate.
*/
{
  const r = 3 / 128, steps = 60;
  const dome = Math.PI * (r * DISH_METRES) ** 2 / 2 * DISH_REST_GAP * DISH_METRES;
  const one = pourShare(r, 1, 1 / steps);
  const mL = one * dome * steps * 1e6;
  check('a held bottle pours 2 mL a second, unclipped', Math.abs(mL - HELD_POUR * 1e6) < 1e-9 && one < 1 && pourShare(r, 0.35) === 0.35,
    `${mL.toFixed(3)} mL in a second of a Dropper ${(r * DISH_METRES * 1000).toFixed(1)} mm wide, ${one.toFixed(3)} of the column a step; a dropped dose of 0.35 is 0.35`);
}

const { page, close } = await openLab();
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async () => {
    const N = 128, out = {};
    // Still: no spring in the gap, no stirring, nothing but the pours.
    const STILL = { thinGap: 1, gapThickness: 0.45, gapSpring: 0 };
    // A pour's volume in plate areas (times the rest gap): its dome, f·πr²/2, with f at most 1.
    const domeOf = (r, take) => Math.min(1, take) * Math.PI * r * r / 2;
    const fresh = async () => {
      await lab.create(N, N);
      // One step first: the thin gap's buffers, the pours' among them, are built on its first step.
      await lab.step(1, STILL);
    };
    const ringR2 = async () => {
      const d = await lab.field('dye');
      let w = 0, s = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = d[(i + j * N) * 4 + 3];
        const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5;
        w += a; s += a * (x * x + y * y);
      }
      return s / Math.max(w, 1e-9);
    };
    const shares = async () => {
      const s = await lab.field('species');
      let total = 0, mid = 0, midCells = 0, most = 0, r2 = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const v = s[(i + j * N) * 4];
        const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5;
        total += v; most = Math.max(most, v); r2 += v * (x * x + y * y);
        if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) < 0.04) { mid += v; midCells++; }
      }
      return { total: total / (N * N), mid: mid / Math.max(1, midCells), most, r2: r2 / Math.max(total, 1e-9) };
    };
    // 1. The ring, pushed by water poured at the middle, and the same pours with no volume.
    const RP = 0.04, TAKE = 1, POURS = 40;
    for (const volume of [true, false]) {
      await fresh();
      const R0 = 0.15, W = 0.008;
      // A thin ring: the disc to R0 + W less the disc to R0 − W.
      lab.dyeDisc(0.5, 0.5, R0 + W, [1, 0, 0], 1);
      lab.dyeDisc(0.5, 0.5, R0 - W, [1, 0, 0], -1);
      lab.flush();
      await lab.step(1, STILL);
      const before = await ringR2();
      for (let k = 0; k < POURS; k++) {
        lab.addSpecies(0.5, 0.5, RP, TAKE, 'water', volume);
        await lab.step(1, STILL);
      }
      await lab.step(5, STILL);
      out[volume ? 'ring' : 'ringFlat'] = { before, after: await ringR2(), V: POURS * domeOf(RP, TAKE) };
    }
    // 2. Glycerine poured as volume, into clear liquid, half a column a pour.
    {
      await fresh();
      const GP = 0.05, GT = 0.5, GN = 30;
      for (let k = 0; k < GN; k++) {
        lab.addSpecies(0.5, 0.5, GP, GT, 'glycerine', true);
        await lab.step(1, STILL);
      }
      await lab.step(5, STILL);
      out.poured = { ...(await shares()), want: GN * domeOf(GP, GT) };
    }
    // 3, 4. A dish of glycerine (a full column out past the rim), flushed with water.
    {
      await fresh();
      lab.addSpecies(0.5, 0.5, 0.75, 50, 'glycerine', false);
      await lab.step(1, STILL);
      const full = await shares();
      const dish = Math.PI * 0.25;
      const FP = 0.05, n = Math.round(dish / 4 / domeOf(FP, 1));
      for (let k = 0; k < n; k++) {
        lab.addSpecies(0.5, 0.5, FP, 1, 'water', true);
        await lab.step(1, STILL);
      }
      await lab.step(5, STILL);
      const after = await shares();
      out.flush = { full, after, dish, V: n * domeOf(FP, 1), pours: n };
    }
    return out;
  });

  const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
  const ring = r.ring, flat = r.ringFlat;
  const grew = ring.after - ring.before, want = ring.V / Math.PI, flatGrew = flat.after - flat.before;
  check('water poured at the middle pushes a ring of colour out by the volume poured',
    Math.abs(grew / want - 1) < 0.05 && Math.abs(flatGrew) < 0.01 * want,
    `mean r² ${f(ring.before, 5)} → ${f(ring.after, 5)}, grew ${f(grew, 5)} against V/π ${f(want, 5)} (${f(grew / want)}); with no volume a pour of water lays nothing, as before 18c, and the ring drifts ${f(flatGrew, 5)}`);
  const p = r.poured, discR2 = p.want / (2 * Math.PI);
  check('glycerine poured as volume is all accounted for, and its flow has carried it off its disc',
    Math.abs(p.total / p.want - 1) < 0.01 && p.most <= 1.02 && p.r2 > 0.9 * discR2 && p.r2 < 1.3 * discR2,
    `species ${f(p.total, 5)} of the dish against ${f(p.want, 5)} poured (${f(p.total / p.want, 4)}); fullest cell ${f(p.most)}; its mean r² ${f(p.r2, 5)} against a full disc of that area's ${f(discR2, 5)}`);
  const fl = r.flush;
  const insideFull = fl.full.total / fl.dish, left = fl.after.total / fl.full.total, wantLeft = 1 - fl.V / fl.dish;
  check('a quarter of the dish of water pushes a quarter of the glycerine over the rim',
    Math.abs(insideFull - 1) < 0.02 && Math.abs(left / wantLeft - 1) < 0.01,
    `the dish ${f(insideFull)} glycerine; ${fl.pours} pours of water, ${f(fl.V / fl.dish)} of its volume, leave ${f(left)} of it (the volume says ${f(wantLeft)}; with 18d-1's fade it would have been less, with no rim more)`);
  check('the middle of the flushed dish is clear liquid again', fl.after.mid < 0.05,
    `glycerine's share at the middle ${f(fl.after.mid)} (it was ${f(fl.full.mid)})`);
  check('no GPU pass failed validation (a stage that never ran would read as an unmoved ring)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
} catch (e) {
  check('the lab ran', false, e.message.slice(0, 300));
}
await close();
const failed = checks.filter((c) => !c.ok);
console.log(failed.length ? `\n${failed.length} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
