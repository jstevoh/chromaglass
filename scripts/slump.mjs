#!/usr/bin/env node
/**
 * A drop of ink slumps under its own weight on a level plate (PLAN 18m).
 * Measured on the GPU solver (scripts/lab.mjs).
 *
 *   npm run slump
 *
 * Reported by the owner: "I don't feel like we have dye and other diffusion
 * through clear water." Measured before this (the audit, 2026-10-11): on a
 * still plate a drop either sat where it landed (Diffusion Rate 0, as twelve
 * looks have it: 4.69 mm rms radius at 0 s, 4.70 at 20 s) or spread into a
 * Gaussian blur forty thousand times faster than dye diffuses. What a real
 * drop of food colouring does in a dish is sink and run out along the lower
 * glass as a viscous gravity current, a flat pool with a sharp front whose
 * radius grows as the eighth root of time (Huppert 1982):
 *
 *     r_N(t) = 0.894 (g′ V³ / 3ν)^(1/8) t^(1/8)
 *
 * (0.894 checked against a fine radial solve of the same equation, to 0.3%).
 * Each run lays one drop of 0.05 mL, 4 mm in radius, of a full-strength dye
 * (one band at the dye's floor, lib/dye.ts), on a still thin-gap plate with
 * Diffusion Rate at 0, so the slump is the only thing that moves it:
 *
 *   1. the drop laid is the drop asked for: 0.05 mL to within 2%, 4 mm
 *   2. in water, the front at 30 s is where Huppert's law puts it, within
 *      8% (the radius at 2% of the pool's peak, from the area over that,
 *      which is within a hair of r_N for his profile (1 − r²/r_N²)^⅓)
 *   3. and the pool is as deep as the law says, within 8%: its middle
 *      H = 4V/(3π r_N²). The front goes as K^(1/8), so check 2 alone passes
 *      a rate half what it should be; the depth goes as K^(−1/4), and a copy
 *      of the kernels at ×0.7 and ×1.4 reads +12% and −6.3% (×1: +2.2%)
 *   4. it got there along the law: the radius grows as t^0.10 to t^0.15
 *      between 5 and 30 s (a blur's goes as t^½, a drop that sits as t^0)
 *   5. its edge is a front, not a blur: the radius at half the peak is at
 *      least 0.8 of the radius at a twentieth of it (Huppert's profile 0.94)
 *   6. a heavier dye (Dye Weight 1, coloured water in oil's 15% against food
 *      colouring's 2%) runs further, by (0.15/0.02)^(1/8) to within 6%; the
 *      contrasts are the ones lib/turntable.ts says, written here, not read
 *      from the function the solver uses
 *   7. the same drop in glycerine (Thickness 1, a thousand times water's
 *      viscosity) slumps as slowly as the same equation says: its middle at
 *      20 s within 5% of a radial solve of ∂η/∂t = ∇·((g′/3ν) η³(1 − η/b)³ ∇η)
 *      from the same paraboloid in a 6 mm gap, worked out here on the CPU
 *      (3.94 units of 5.6; water's is down to 0.68 by then), and still all
 *      there. Not its front: at 256² a front that moves under a cell reads up
 *      to a cell wide (4.50 mm on Metal against the solve's 4.04), and
 *      Huppert's law from t = 0 does not hold yet for a drop that starts
 *      wider than the law's own radius
 *   8. a drop of clear liquid (white, which is not a dye) does not slump: it
 *      is the water's own density
 *   9. the measure sees a blur: the glycerine drop under unphysical diffusion
 *      instead (D ≈ 1.7e-5 m²/s, diff: 8.5, about 42,500× food dye's real molecular
 *      rate Dm ≈ 4e-10 m²/s, matching the old Jacobi blur 18h replaced) reads an
 *      exponent over 0.3 and an edge under 0.6, where 4 and 5 want 0.125 and 0.8
 *  10. the plate's resolution does not set the answer: the water drop on a
 *      512² plate is within 4% of the 256² plate's front at 20 s (the rate
 *      and the cap are both worked out from the cell's size in metres)
 *  11. the slump makes and loses no dye: the water drop's total over 30 s
 *      is what it was to within 0.1%
 *  12. a deep heavy pool on a fine plate stays a pool: the dye's cap (6) laid
 *      3% of the plate across, coloured water in oil's density (Dye Weight
 *      1), on a 768² plate for 2 s. Its total holds to 0.1%, its peak never
 *      rises over what was laid, no cell goes below zero, and no checkerboard
 *      grows (the share of the dye on the plate's finest alternating pattern,
 *      |Σ(−1)^(x+y) a| / Σ a, stays under 0.1%; a round pool laid on the grid
 *      reads about 1e-9 there, so only a checkerboard moves it)
 *  13. and the same on a 1024² plate
 *  14. the grid's checkerboard filter (dampGrid) makes no dye at a drop's
 *      rim and does not move its front: the glycerine drop of 7, run once
 *      with the filter on (as every look has it) and once with it off, has
 *      the bare run's total to within 0.01% at 2 s and 20 s, and its front
 *      (the radius at 2% of the peak) within 0.05 mm of the bare run's (a
 *      cell here is 0.78 mm, and one cell more over the contour moves the
 *      radius 0.02 mm). Measured against the bare run, not against what was
 *      laid, so the step's own drift (11's 0.1%) neither eats the bar nor
 *      hides a gain. The filter as it was before 18m-5 read +0.93% and
 *      +0.19 mm at 2 s, and +3.20% and +0.17 mm (its front 0.72 mm out from
 *      where it was laid, against the bare run's 0.55) at 20 s, on Metal and
 *      on software WebGPU alike (#485's runs on main 7d77141, and this
 *      check's measure on a lab built from 7d77141's fluid sources). And the
 *      filter ran: the field with it is not the bare run's, its Σa² at 20 s
 *      at least FILTER_MOVED away (0.50% on Metal, 0.48% on software WebGPU;
 *      two runs of one program on one plate agree to the bit, so a filter
 *      that never ran reads 0). Not which way: at Grid Damp 0.05 the filter
 *      takes 0.5% out, at 0.5 the clamp's return puts 3.3% in.
 *      The radius at 5% of the peak is printed, not held: the filter moves
 *      it out 0.18 mm in 20 s (before 18m-5, 0.35), the same at 0.05 and 0.5
 *      (PLAN 18m-5c)
 *
 * 12 and 13 are here because the drop in 1 to 11 is too shallow and too
 * coarse to find what the review of #371 (2026-10-24) found: the slump is
 * an explicit step, stable only while each face moves at most about a
 * quarter of the difference across it, and a cell's rate goes as the pool's
 * depth cubed and as one over the cell's width squared. With that bound
 * taken off the face and the substeps still capped, this pool at 768² went
 * from a total of 5003 to 25174 in 36 frames, every cell at the cap in a
 * checkerboard; on main it holds 5003.56 to the last digit and its peak falls
 * 6.0 → 1.9 in 2 s. A finer plate is the harder case (narrower cells), so
 * 1024², which Pro offers (PLAN 23.17), is measured as well as 768².
 * `npm run slump -- --deep` runs 12 and 13 alone (about ten minutes on
 * software WebGPU, seconds on Metal).
 *
 * Not covered here: the oil's share (a cell of oil holds no current) and a
 * step other than 1/60 s.
 *
 * The grid's checkerboard filter (dampGrid, GRID_DAMP a step on every look
 * with no Diffusion Rate) is on in 1 to 11, as the app has it (PLAN 18m-5a).
 * Until 18m-5 it was off here: it clamped its high-pass to the 3×3
 * neighbourhood's range, a drop's rim is where that clamp bites, and it
 * moved the glycerine drop's front 0.72 mm in 20 s and added 3.2% to its dye
 * on its own (the front at 20 s, from where it was laid). Now it hands the clamp's excess back to the neighbours, and 14
 * holds it to that. It stays off in 12 and 13: they watch the slump's own
 * step for a checkerboard, and the filter takes 5% of one out a step, enough
 * to hide a step going slowly unstable.
 *
 * Checks 6 to 9 are the controls on 2 to 5: the same measure, with the
 * physics the law says should change it changed, and once with the slump off
 * and a blur on. On software WebGPU (a cloud session, `PW_WEBGPU=1`) it takes
 * the best part of an hour; on Metal under a minute.
 */
import { openLab } from './lab.mjs';

const { page, close } = await openLab();
const failed = [];
function report(name, ok, detail) {
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed.push(name);
}

/** One drop, stepped to each of `times` (seconds): front radii in mm, the peak and the total. */
async function drop(times, over, white = false, N = 256) {
  return page.evaluate(async ({ N, times, over, white }) => {
    await lab.create(N, N);
    // Full strength: the red band at the dye's floor, so its strength (wgsl/slump.ts) is 1.
    const rgb = white ? [0, 0, 0] : lab.dyeOf([0, 0.3, 0.9]);
    const r = 0.02, rm = r * 0.2;
    const peak = 5e-8 / (lab.dyeLayer * Math.PI * rm * rm / 2);
    lab.dye(0.5, 0.5, r, rgb, peak);
    lab.flush();
    const cell = 0.2 / N;
    const rows = [];
    let t = 0;
    for (const T of times) {
      const n = Math.round((T - t) / lab.stepSeconds); t = T;
      if (n > 0) await lab.step(n, { diff: 0, thinGap: 1, ...over });
      const f = await lab.field('dye');
      let total = 0, pk = 0, square = 0;
      for (let k = 3; k < f.length; k += 4) { total += f[k]; pk = Math.max(pk, f[k]); square += f[k] * f[k]; }
      const radius = (share) => {
        let c = 0;
        for (let k = 3; k < f.length; k += 4) if (f[k] > share * pk) c++;
        return Math.sqrt(c / Math.PI) * cell * 1000;
      };
      rows.push({ T, total, peak: pk, front: radius(0.02), r05: radius(0.05), r50: radius(0.5), volume: total * cell * cell * lab.dyeLayer, square });
    }
    return rows;
  }, { N, times, over, white });
}

/**
 * Checks 12 and 13: the dye's cap laid in a pool on an N² plate, stepped to
 * frames 1, 6, 36 and 120 with Dye Weight 1. Each reading is the pool's
 * least and greatest cell, its total and its share on the checkerboard.
 */
async function deepPool(N) {
  return page.evaluate(async ({ N }) => {
    await lab.create(N, N);
    lab.dye(0.5, 0.5, 0.03, lab.dyeOf([0, 0.3, 0.9]), 6);
    lab.flush();
    const read = async (frame) => {
      const f = await lab.field('dye');
      let least = Infinity, most = -Infinity, total = 0, alternating = 0;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = f[(y * N + x) * 4 + 3];
        least = Math.min(least, a); most = Math.max(most, a); total += a;
        alternating += (x + y) & 1 ? -a : a;
      }
      return { frame, least, most, total, checker: Math.abs(alternating) / total };
    };
    const rows = [await read(0)];
    let frame = 0;
    for (const n of [1, 5, 30, 84]) {
      await lab.step(n, { diff: 0, gridDamp: 0, thinGap: 1, gapThickness: 0, solutalBuoyancy: 1 });
      frame += n;
      rows.push(await read(frame));
    }
    return rows;
  }, { N });
}

function reportDeep(label, N, rows) {
  const [laid] = rows;
  // A stable step cannot raise a peak; the 0.005 is one rounding step of a
  // half-float dye at 6 (0.004), where a pool going unstable rises by units.
  const kept = rows.every((r) => Math.abs(r.total / laid.total - 1) <= 0.001);
  const fell = rows.every((r) => r.most <= laid.most + 0.005);
  const above = rows.every((r) => r.least >= 0);
  const smooth = rows.every((r) => r.checker < 0.001);
  console.log(`  deep pool ${N}²: ${rows.map((r) => `frame ${r.frame} peak ${r.most.toFixed(3)} least ${r.least.toFixed(4)} total ${r.total.toFixed(2)} checker ${r.checker.toExponential(1)}`).join(' | ')}`);
  const last = rows[rows.length - 1];
  report(`${label}. a deep heavy pool on a ${N}² plate stays a pool: no dye made, no peak rising, no checkerboard`,
    kept && fell && above && smooth,
    `total ${laid.total.toFixed(2)} → ${last.total.toFixed(2)} (worst ×${Math.max(...rows.map((r) => r.total / laid.total)).toFixed(4)}), `
      + `peak ${laid.most.toFixed(3)} → ${last.most.toFixed(3)} (highest ${Math.max(...rows.map((r) => r.most)).toFixed(3)}), `
      + `least ${Math.min(...rows.map((r) => r.least)).toFixed(4)}, checker at most ${Math.max(...rows.map((r) => r.checker)).toExponential(1)}`);
}

if (process.argv.includes('--deep')) {
  const d768 = await deepPool(768);
  const d1024 = await deepPool(1024);
  await close();
  reportDeep('12', 768, d768);
  reportDeep('13', 1024, d1024);
  console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
  process.exit(failed.length ? 1 : 0);
}

const nu = (thickness) => page.evaluate((x) => lab.thinGapViscosity(x), thickness);
const huppert = (gPrime, V, nuv, t) => 0.894 * Math.pow(gPrime * V ** 3 / (3 * nuv), 1 / 8) * Math.pow(t, 1 / 8) * 1000;
const at = (rows, T) => rows.find((r) => r.T === T);
const mm = (x) => `${x.toFixed(2)} mm`;
// lib/turntable.ts's dyeDensityContrast, as it says: food colouring in water 2%, coloured water in oil 15%.
const g0 = 9.81 * 0.02, g1 = 9.81 * 0.15;

const water = await drop([0, 5, 20, 30], { gapThickness: 0, solutalBuoyancy: 0 });
const heavy = await drop([0, 20], { gapThickness: 0, solutalBuoyancy: 1 });
const syrup = await drop([0, 2, 20], { gapThickness: 1, solutalBuoyancy: 0 });
const syrupBare = await drop([0, 2, 20], { gapThickness: 1, solutalBuoyancy: 0, gridDamp: 0 });
const clear = await drop([0, 10], { gapThickness: 0, solutalBuoyancy: 0 }, true);
// 18h calibrated diff: 0.0002 to physical molecular diffusion (Dm ≈ 4e-10 m²/s),
// which in 30 s barely moves a drop. The blur control tests unphysical rapid diffusion
// (the old Jacobi blur's D ≈ 1.7e-5 m²/s, 42,500× Dm, diff: 8.5) with the slump
// suppressed by glycerine viscosity, confirming checks 4 and 5 distinguish slump
// physics from Gaussian blurring.
const blur = await drop([0, 5, 30], { gapThickness: 1, solutalBuoyancy: 0, diff: 8.5 });
const fine = await drop([0, 20], { gapThickness: 0, solutalBuoyancy: 0 }, false, 512);
const d768 = await deepPool(768);
const d1024 = await deepPool(1024);
const nuWater = await nu(0), nuSyrup = await nu(1);
const dyeLayer = await page.evaluate(() => lab.dyeLayer);
await close();

for (const [name, rows] of [['water', water], ['heavy', heavy], ['glycerine', syrup], ['glycerine, no grid filter', syrupBare], ['clear', clear], ['blur', blur], ['water 512²', fine]]) {
  console.log(`  ${name}: ${rows.map((r) => `${r.T}s front ${mm(r.front)} half ${mm(r.r50)} peak ${r.peak.toFixed(2)} total ${r.total.toFixed(1)}`).join(' | ')}`);
}

const V = water[0].volume;
report('1. the drop laid is 0.05 mL, 4 mm across in radius', Math.abs(V / 5e-8 - 1) <= 0.02 && Math.abs(water[0].front - 3.96) <= 0.15,
  `${(V * 1e6).toFixed(4)} mL, front ${mm(water[0].front)}`);

const w30 = at(water, 30), w5 = at(water, 5), w20 = at(water, 20);
const law30 = huppert(g0, V, nuWater, 30);
report('2. in water the front at 30 s is where Huppert\'s law puts it',
  Math.abs(w30.front / law30 - 1) <= 0.08,
  `${mm(w30.front)} against ${mm(law30)} (${((w30.front / law30 - 1) * 100).toFixed(1)}%; g′ ${g0.toFixed(3)}, ν ${nuWater.toExponential(1)})`);

const H = 4 * V / (3 * Math.PI * (law30 / 1000) ** 2) * 1000, depth = w30.peak * dyeLayer * 1000;
report('3. and as deep in its middle as the law says', Math.abs(depth / H - 1) <= 0.08,
  `${depth.toFixed(3)} mm against ${H.toFixed(3)} mm (${((depth / H - 1) * 100).toFixed(1)}%)`);

const growth = (a, b, ta, tb) => Math.log(b.front / a.front) / Math.log(tb / ta);
const exponent = growth(w5, w30, 5, 30);
report('4. the front grows as t^(1/8)', exponent >= 0.10 && exponent <= 0.15,
  `t^${exponent.toFixed(3)} from 5 to 30 s (${mm(w5.front)} to ${mm(w30.front)})`);

const sharp = w30.r50 / w30.r05;
report('5. the pool has a front, not a blur', sharp >= 0.8,
  `radius at half the peak ${mm(w30.r50)} over at a twentieth ${mm(w30.r05)}: ${sharp.toFixed(3)} (Huppert 0.94)`);

const want = Math.pow(g1 / g0, 1 / 8), got = at(heavy, 20).front / w20.front;
report('6. a heavier dye runs further, as (g′)^(1/8)', Math.abs(got / want - 1) <= 0.06,
  `${mm(at(heavy, 20).front)} against ${mm(w20.front)} at 20 s: ×${got.toFixed(3)}, want ×${want.toFixed(3)}`);

const still = (rows, T) => Math.abs(at(rows, T).front - rows[0].front) < 0.5 && Math.abs(rows[0].front - water[0].front) < 0.2
  && Math.abs(at(rows, T).total / rows[0].total - 1) < 0.01;
/*
  The radial solve for check 7: the same equation, explicit, on 600 rings of
  0.02 mm, from the paraboloid the drop is laid as. Cheap in glycerine (K
  is a thousandth of water's, so a stable step is long); far too slow in
  water, where Huppert's law is the reference instead.
*/
function radialMiddle(gPrime, nuv, peakUnits, R, T, gap = 0.006) {
  const n = 600, dr = 2e-5, G = gPrime / (3 * nuv);
  const h = new Float64Array(n), dh = new Float64Array(n);
  for (let i = 0; i < n; i++) { const r = (i + 0.5) * dr; h[i] = Math.max(0, 1 - (r / R) ** 2) * peakUnits * dyeLayer; }
  let t = 0;
  while (t < T) {
    let most = 0;
    const flux = new Float64Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      const e = 0.5 * (h[i] + h[i + 1]), k = G * e ** 3 * Math.max(0, 1 - e / gap) ** 3;
      most = Math.max(most, k);
      flux[i] = -k * (h[i + 1] - h[i]) / dr * (i + 1) * dr;
    }
    const dt = Math.min(0.2 * dr * dr / Math.max(most, 1e-30), T - t);
    dh.fill(0);
    for (let i = 0; i < n - 1; i++) { dh[i] -= flux[i]; dh[i + 1] += flux[i]; }
    for (let i = 0; i < n; i++) h[i] += dt * dh[i] / ((i + 0.5) * dr * dr);
    t += dt;
  }
  return h[0] / dyeLayer;
}
const syrupWant = radialMiddle(g0, nuSyrup, syrup[0].peak, 0.004, 20);
const syrupGot = at(syrup, 20).peak;
report('7. in glycerine the drop slumps as slowly as the equation says',
  Math.abs(syrupGot / syrupWant - 1) <= 0.05 && Math.abs(syrup[0].front - water[0].front) < 0.2 && Math.abs(at(syrup, 20).total / syrup[0].total - 1) < 0.01,
  `its middle ${syrup[0].peak.toFixed(2)} → ${syrupGot.toFixed(2)} units in 20 s, the radial solve ${syrupWant.toFixed(2)}; front ${mm(syrup[0].front)} → ${mm(at(syrup, 20).front)}, total ×${(at(syrup, 20).total / syrup[0].total).toFixed(4)}`);

report('8. clear liquid does not slump', still(clear, 10),
  `${mm(clear[0].front)} to ${mm(at(clear, 10).front)} in 10 s, total ×${(at(clear, 10).total / clear[0].total).toFixed(4)} (the dyed drop: ${mm(w5.front)} at 5 s)`);

const blurExp = growth(at(blur, 5), at(blur, 30), 5, 30), blurSharp = at(blur, 30).r50 / at(blur, 30).r05;
report('9. the measure sees a blur', blurExp > 0.3 && blurSharp < 0.6,
  `with the slump off and unphysical diffusion (D ≈ 1.7e-5 m²/s, diff: 8.5): t^${blurExp.toFixed(3)}, edge ${blurSharp.toFixed(3)}`);

const res = at(fine, 20).front / w20.front;
report('10. the plate\'s resolution does not set the answer', Math.abs(res - 1) <= 0.04,
  `512²: ${mm(at(fine, 20).front)}, 256²: ${mm(w20.front)} at 20 s (×${res.toFixed(3)})`);

const kept = w30.total / water[0].total;
report('11. the slump makes and loses no dye', Math.abs(kept - 1) <= 0.001,
  `the water drop's total ${water[0].total.toFixed(2)} at 0 s, ${w30.total.toFixed(2)} at 30 s (×${kept.toFixed(5)})`);

reportDeep('12', 768, d768);
reportDeep('13', 1024, d1024);

const rim = [2, 20].map((T) => {
  const on = at(syrup, T), bare = at(syrupBare, T);
  return { T, made: on.total / bare.total - 1, drift: bare.total / syrupBare[0].total - 1, moved: on.front - bare.front, moved05: on.r05 - bare.r05 };
});
// The filter changed the field: 0.50% on Metal, 0.48% on software WebGPU; a stage never run reads 0.
const FILTER_MOVED = 0.001;
const ran = Math.abs(1 - at(syrup, 20).square / at(syrupBare, 20).square);
report('14. the grid filter makes no dye at a drop\'s rim and does not move its front',
  rim.every((r) => Math.abs(r.made) <= 1e-4 && Math.abs(r.moved) <= 0.05) && ran >= FILTER_MOVED,
  rim.map((r) => `${r.T} s: dye ${r.made >= 0 ? '+' : ''}${(r.made * 100).toFixed(4)}% of the bare run's (its own drift ${(r.drift * 100).toFixed(4)}%), front ${r.moved >= 0 ? '+' : ''}${r.moved.toFixed(3)} mm (at 5% of the peak ${r.moved05 >= 0 ? '+' : ''}${r.moved05.toFixed(3)} mm, not held)`).join('; ')
    + `; Σa² ${(ran * 100).toFixed(3)}% from the bare run's at 20 s, at least ${(FILTER_MOVED * 100).toFixed(1)}% (before 18m-5: +0.93% and +0.19 mm at 2 s)`);

console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
