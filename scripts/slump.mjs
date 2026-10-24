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
 *
 * Not covered here: the oil's share (a cell of oil holds no current) and a
 * step other than 1/60 s.
 *
 * The grid's checkerboard filter (dampGrid, GRID_DAMP a step on every look
 * with no Diffusion Rate) is off in every run here. Left on, it moved the
 * glycerine drop's front 0.72 mm in 20 s and added 3.2% to its dye on its
 * own (measured by skipping each stage of the step in turn: only it changed
 * the total, +0.93% in 2 s), because it clamps its high-pass to the 3×3
 * neighbourhood's range and a drop's rim is where that clamp bites. That is
 * its own fault, written into PLAN 18m-5, and not what this measures.
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
      if (n > 0) await lab.step(n, { diff: 0, gridDamp: 0, thinGap: 1, ...over });
      const f = await lab.field('dye');
      let total = 0, pk = 0;
      for (let k = 3; k < f.length; k += 4) { total += f[k]; pk = Math.max(pk, f[k]); }
      const radius = (share) => {
        let c = 0;
        for (let k = 3; k < f.length; k += 4) if (f[k] > share * pk) c++;
        return Math.sqrt(c / Math.PI) * cell * 1000;
      };
      rows.push({ T, total, peak: pk, front: radius(0.02), r05: radius(0.05), r50: radius(0.5), volume: total * cell * cell * lab.dyeLayer });
    }
    return rows;
  }, { N, times, over, white });
}

const nu = (thickness) => page.evaluate((x) => lab.thinGapViscosity(x), thickness);
const huppert = (gPrime, V, nuv, t) => 0.894 * Math.pow(gPrime * V ** 3 / (3 * nuv), 1 / 8) * Math.pow(t, 1 / 8) * 1000;
const at = (rows, T) => rows.find((r) => r.T === T);
const mm = (x) => `${x.toFixed(2)} mm`;
// lib/turntable.ts's dyeDensityContrast, as it says: food colouring in water 2%, coloured water in oil 15%.
const g0 = 9.81 * 0.02, g1 = 9.81 * 0.15;

const water = await drop([0, 5, 20, 30], { gapThickness: 0, solutalBuoyancy: 0 });
const heavy = await drop([0, 20], { gapThickness: 0, solutalBuoyancy: 1 });
const syrup = await drop([0, 20], { gapThickness: 1, solutalBuoyancy: 0 });
const clear = await drop([0, 10], { gapThickness: 0, solutalBuoyancy: 0 }, true);
// 18h calibrated diff: 0.0002 to physical molecular diffusion (Dm ≈ 4e-10 m²/s),
// which in 30 s barely moves a drop. The blur control tests unphysical rapid diffusion
// (the old Jacobi blur's D ≈ 1.7e-5 m²/s, 42,500× Dm, diff: 8.5) with the slump
// suppressed by glycerine viscosity, confirming checks 4 and 5 distinguish slump
// physics from Gaussian blurring.
const blur = await drop([0, 5, 30], { gapThickness: 1, solutalBuoyancy: 0, diff: 8.5 });
const fine = await drop([0, 20], { gapThickness: 0, solutalBuoyancy: 0 }, false, 512);
const nuWater = await nu(0), nuSyrup = await nu(1);
const dyeLayer = await page.evaluate(() => lab.dyeLayer);
await close();

for (const [name, rows] of [['water', water], ['heavy', heavy], ['glycerine', syrup], ['clear', clear], ['blur', blur], ['water 512²', fine]]) {
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

console.log(failed.length ? `\n${failed.length} failed` : '\nall passed');
process.exit(failed.length ? 1 : 0);
