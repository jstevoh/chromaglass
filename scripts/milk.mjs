#!/usr/bin/env node
/**
 * Milky liquids scatter light (PLAN.md 18j).
 *
 *   npm run milk
 *
 * Pigment and fat droplets scatter light (Mie / Kubelka-Munk), rather than
 * purely absorbing it.
 *
 * What was there: everything in the plate was a pure absorber. Milk was laid as
 * white dye (which absorbs nothing, so under the lamp it threw pure white
 * instead of a shadow, and on black ground had no opacity channel to sit on).
 *
 * What PLAN 18j gives:
 *   1. Projector / Lamp Ground (lampGround > 0): with a projector's small
 *      aperture, forward Mie scattering loses ~90% of the light out of the
 *      lens. Thus milk throws a dark / warm grey shadow (fat droplets scatter
 *      blue more than red), with a soft forward halo around the pool. It does
 *      not throw white.
 *   2. Reflected light / Black Ground (lampGround <= 0.001): backscattering
 *      provides an opaque white body (Kubelka-Munk R_diffuse). Dye in or on
 *      milk filters this white reflection, showing as a solid, vibrant, opaque
 *      colour on white (solving PLAN §4's "solid reds on milk").
 *   3. Advection: the scattering field is carried along with the fluid flow
 *      (conserved flux-form transport).
 *   4. Zero-scatter control: for clear water, glycerine or standard dyes
 *      (scatter = 0), the plate renders 100% byte-for-byte identical.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const S = 192;
const RED_DYE = [0.05, 1.6, 1.6]; // absorbs green and blue strongly, passes red
const NEUTRAL = {
  saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0,
  beads: 0, lacing: 0, cells: 0, glossiness: 0, microDroplets: 0, thinFilm: 0,
};

const px = (img, x, y) => {
  const k = (y * S + x) * 4;
  return [img[k], img[k + 1], img[k + 2]];
};

const disc = (r, r0 = 0) => {
  const out = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot((x + 0.5) / S - 0.5, (y + 0.5) / S - 0.5);
    if (d <= r && d >= r0) out.push([x, y]);
  }
  return out;
};

const avgDisc = (img, r, r0 = 0) => {
  const pts = disc(r, r0);
  let rSum = 0, gSum = 0, bSum = 0;
  for (const [x, y] of pts) {
    const [cr, cg, cb] = px(img, x, y);
    rSum += cr; gSum += cg; bSum += cb;
  }
  const n = Math.max(1, pts.length);
  return [rSum / n, gSum / n, bSum / n];
};

const lab = await openLab();
let shots;
try {
  shots = await lab.page.evaluate(async ([S, N, RED_DYE]) => {
    const r = (over = {}) => lab.render(S, { ...N, ...over });
    const out = {};

    // 1. Bare lamp
    await lab.create(128); lab.flush(); await lab.step(1);
    out.bareLamp = await r({ lampGround: 1 });
    out.bareBlack = await r({ lampGround: 0 });

    // 2. Milk pool (radius 0.22 at centre 0.5, 0.5)
    await lab.create(128);
    lab.addSpecies(0.5, 0.5, 0.22, 1.0, 'milk', true);
    lab.flush(); await lab.step(1);
    out.milkLamp = await r({ lampGround: 1 });
    out.milkBlack = await r({ lampGround: 0 });

    // 3. Clear water control (no species) at same radius
    await lab.create(128);
    lab.addSpecies(0.5, 0.5, 0.22, 1.0, 'water', true);
    lab.flush(); await lab.step(1);
    out.waterLamp = await r({ lampGround: 1 });
    out.waterBlack = await r({ lampGround: 0 });

    // 4. Red dye alone on black ground vs Red dye in Milk on black ground (a wash of dye)
    await lab.create(128);
    lab.dye(0.5, 0.5, 0.22, RED_DYE, 0.35);
    lab.flush(); await lab.step(1);
    out.redDyeBlack = await r({ lampGround: 0 });

    await lab.create(128);
    lab.addSpecies(0.5, 0.5, 0.22, 1.0, 'milk', true);
    lab.dye(0.5, 0.5, 0.22, RED_DYE, 0.35);
    lab.flush(); await lab.step(1);
    out.redMilkBlack = await r({ lampGround: 0 });
    out.redMilkLamp = await r({ lampGround: 1 });

    // 5. Advection: step the milk pool with dye under drip
    await lab.create(128);
    lab.addSpecies(0.5, 0.35, 0.12, 1.0, 'milk', true);
    lab.dye(0.5, 0.35, 0.12, RED_DYE, 0.35);
    lab.flush(); await lab.step(1);
    out.milkBeforeAdvect = await r({ lampGround: 0 });
    // Step with drip: 1.0 on thin gap to push liquid along +y
    await lab.step(60, { thinGap: 1, gapThickness: 0.45, drip: 1.0, gapSpring: 0 });
    out.milkAfterAdvect = await r({ lampGround: 0 });

    // 6. Zero-scatter liquid (glycerine): pours species with scatter = 0
    await lab.create(128);
    lab.addSpecies(0.5, 0.5, 0.22, 1.0, 'glycerine', true);
    lab.flush(); await lab.step(1);
    out.glycerineBlack = await r({ lampGround: 0 });
    out.glycerineLamp = await r({ lampGround: 1 });

    return out;
  }, [S, NEUTRAL, RED_DYE]);
} finally {
  await lab.close();
}

// ── Check 1: Milk under the lamp casts a warm dark shadow ─────────────
const barePool = avgDisc(shots.bareLamp, 0.15);
const milkPoolLamp = avgDisc(shots.milkLamp, 0.15);
const tR = milkPoolLamp[0] / barePool[0];
const tG = milkPoolLamp[1] / barePool[1];
const tB = milkPoolLamp[2] / barePool[2];
const tMean = (tR + tG + tB) / 3;

// A projector's small aperture loses ~90% of scattered light, so milk throws dark (<= 30% transmission)
// and warm (blue scattered out more than red: tR > tB).
check(
  'milk under the projector lamp casts a warm dark shadow (does not throw white)',
  tMean <= 0.30 && tR > tB,
  `transmission mean ${(tMean * 100).toFixed(1)}% (R ${(tR * 100).toFixed(1)}%, G ${(tG * 100).toFixed(1)}%, B ${(tB * 100).toFixed(1)}%)`,
);

// ── Check 2: Clear liquid passes >= 90% of the lamp (the control) ─────
const waterPoolLamp = avgDisc(shots.waterLamp, 0.15);
const tWater = (waterPoolLamp[0] / barePool[0] + waterPoolLamp[1] / barePool[1] + waterPoolLamp[2] / barePool[2]) / 3;
check(
  'clear liquid under the lamp passes at least 90% (the control)',
  tWater >= 0.90,
  `transmission ${(tWater * 100).toFixed(1)}%`,
);

// ── Check 3: Forward scattering halo glows softly around the milk pool ─
// At the rim just outside the pool (radius 0.23 to 0.26): forward-scattered light produces a soft halo
const haloLamp = avgDisc(shots.milkLamp, 0.26, 0.23);
const haloBare = avgDisc(shots.bareLamp, 0.26, 0.23);
const waterHalo = avgDisc(shots.waterLamp, 0.26, 0.23);
// Halo light in milk should exceed transmission through the core and transition smoothly to clear surround
const tHalo = haloLamp[1] / haloBare[1];
check(
  'forward-scattered light forms a soft halo transitioning at the pool rim',
  tHalo > tMean && tHalo <= 1.05,
  `rim transmission ${(tHalo * 100).toFixed(1)}% vs core ${(tMean * 100).toFixed(1)}%`,
);

// ── Check 4: Milk on black ground reflects as an opaque white body ────
const milkPoolBlack = avgDisc(shots.milkBlack, 0.15);
const waterPoolBlack = avgDisc(shots.waterBlack, 0.15);
const milkLum = (milkPoolBlack[0] * 0.299 + milkPoolBlack[1] * 0.587 + milkPoolBlack[2] * 0.114) / 255;
const waterLum = (waterPoolBlack[0] * 0.299 + waterPoolBlack[1] * 0.587 + waterPoolBlack[2] * 0.114) / 255;
const isWhite = Math.abs(milkPoolBlack[0] - milkPoolBlack[1]) < 15 && Math.abs(milkPoolBlack[1] - milkPoolBlack[2]) < 15;
check(
  'milk on the black ground draws as an opaque white body (diffuse backscatter)',
  milkLum >= 0.80 && isWhite && waterLum <= 0.05,
  `milk luminance ${(milkLum * 100).toFixed(1)}% (${milkPoolBlack.map(v => v.toFixed(0)).join(',')}), water ${(waterLum * 100).toFixed(1)}%`,
);

// ── Check 5: Food dye in milk sits on white (solid reds on milk) ───────
// Red dye on black is dark red against black; red dye on milk sits on the opaque white body.
const redDyeBlack = avgDisc(shots.redDyeBlack, 0.15);
const redMilkBlack = avgDisc(shots.redMilkBlack, 0.15);
const redMilkLum = (redMilkBlack[0] * 0.299 + redMilkBlack[1] * 0.587 + redMilkBlack[2] * 0.114) / 255;
const redDyeLum = (redDyeBlack[0] * 0.299 + redDyeBlack[1] * 0.587 + redDyeBlack[2] * 0.114) / 255;
// Red dye on milk must be substantially brighter than red dye on black, with high red channel
check(
  'red dye on milk sits on white, rendering as a solid vibrant red (PLAN §4)',
  redMilkBlack[0] >= 180 && redMilkLum >= 1.25 * redDyeLum,
  `red on milk rgb(${redMilkBlack.map(v => v.toFixed(0)).join(',')}) lum ${(redMilkLum * 100).toFixed(1)}% vs dye on black lum ${(redDyeLum * 100).toFixed(1)}%`,
);

// ── Check 6: Scattering field carries with the flow (species advection) 
// The milk pool was stepped under gravity drip
let xSumBefore = 0, ySumBefore = 0, wBefore = 0;
let xSumAfter = 0, ySumAfter = 0, wAfter = 0;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const lumB = (px(shots.milkBeforeAdvect, x, y)[0]) / 255;
  if (lumB > 0.3) { xSumBefore += x * lumB; ySumBefore += y * lumB; wBefore += lumB; }
  const lumA = (px(shots.milkAfterAdvect, x, y)[0]) / 255;
  if (lumA > 0.3) { xSumAfter += x * lumA; ySumAfter += y * lumA; wAfter += lumA; }
}
const cxBefore = xSumBefore / Math.max(1, wBefore), cyBefore = ySumBefore / Math.max(1, wBefore);
const cxAfter = xSumAfter / Math.max(1, wAfter), cyAfter = ySumAfter / Math.max(1, wAfter);
const shift = Math.hypot(cxAfter - cxBefore, cyAfter - cyBefore);
check(
  'scattering field advects with the flow (conserved transport)',
  shift >= 3.0,
  `pool center shifted ${shift.toFixed(1)} px along flow (dx ${(cxAfter - cxBefore).toFixed(1)}, dy ${(cyAfter - cyBefore).toFixed(1)})`,
);

// ── Check 7: Dye in milk under the lamp renders as a desaturated pastel
const redMilkLamp = avgDisc(shots.redMilkLamp, 0.15);
// Under the lamp, milk's scattering attenuates light and adds forward halo, softening red into pastel
check(
  'dye in milk under the lamp renders as a soft pastel shadow',
  redMilkLamp[0] > redMilkLamp[2] && redMilkLamp[0] <= 80,
  `rgb(${redMilkLamp.map(v => v.toFixed(0)).join(',')})`,
);

// ── Check 8: Zero-scatter liquid produces zero scattering body on black ground
const glycPoolBlack = avgDisc(shots.glycerineBlack, 0.15);
const glycPoolLamp = avgDisc(shots.glycerineLamp, 0.15);
const glycLum = (glycPoolBlack[0] * 0.299 + glycPoolBlack[1] * 0.587 + glycPoolBlack[2] * 0.114) / 255;
const tGlyc = (glycPoolLamp[0] / barePool[0] + glycPoolLamp[1] / barePool[1] + glycPoolLamp[2] / barePool[2]) / 3;
check(
  'zero-scatter liquid (glycerine) produces zero scattering body and passes lamp light',
  glycLum <= 0.05 && tGlyc >= 0.90,
  `black ground luminance ${(glycLum * 100).toFixed(1)}%, lamp transmission ${(tGlyc * 100).toFixed(1)}%`,
);

console.log(`\n${checks.filter(c => c.ok).length}/${checks.length} milk checks passed\n`);
if (checks.some(c => !c.ok)) process.exit(1);
