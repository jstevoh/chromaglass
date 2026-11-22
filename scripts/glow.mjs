#!/usr/bin/env node
/**
 * Bioluminescent trails (PLAN 48c): `npm run glow`.
 *
 * What was asked: the dark plate glows where the liquid is sheared, the way
 * a wake glows in a bay full of dinoflagellates, and the glow tires: each
 * cell lights where the shear passes a threshold and spends a charge that
 * refills over Glow Recharge's seconds (gpu/glow.ts, wgsl/glow.ts). The plan
 * named the check: no glow on a still plate; glow along a stroke and only
 * there; a second stroke down the same path within the recharge glows less
 * than the first. This holds those, and the two things that make them mean
 * something:
 *
 *   1. A still plate is dark. Two hundred steps of a plate nobody touches,
 *      Glow up: not one cell lights (the brightest under 1e-4), and every
 *      cell keeps its charge (the lowest over 0.999). A glow that lit by
 *      itself, a noise or a floor, would fail here.
 *
 *   2. A stroke lights its own path, and only it. A finger dragged left to
 *      right across the lower half of the plate (uv y 0.35, x 0.2 to 0.6):
 *      the charge it spends, summed over the band it crossed, is many times
 *      what is spent anywhere far from it, and many times what is spent in
 *      the band's mirror across the middle (uv y 0.65), so a flow read upside
 *      down fails. The spent charge is the record of where the cells fired,
 *      and does not fade a tenth of a second later as the light does.
 *
 *   3. The threshold is a threshold. The same stroke at a twentieth of its
 *      speed (a drift, the plate's slow flow) spends nothing to speak of:
 *      under a twentieth of what the full stroke spent. A glow that grew
 *      with speed but had no threshold (light proportional to shear) would
 *      spend a twentieth here and fail.
 *
 *   4. A second stroke too soon glows less. The stroke again down the same
 *      path half a second after the first (Recharge 8 s): its brightest
 *      moment, over the band, under 0.97 of the first's, and three more
 *      strokes each half a second after the last each dimmer than the one
 *      before, the fifth under 0.85 of the first. Why a tenth and not half:
 *      a passing finger fires a cell for the few hundredths of a second its
 *      shear lasts, and a cell spends a share of its store in a flash
 *      (Lingulodinium gives several flashes from one store before it is
 *      spent; GLOW_SPEND is that), so one pass dims the next a little and a
 *      sea stirred again and again tires, as a wake does. Control, on a fresh
 *      plate: the same two strokes with Recharge 0.5 s and three seconds
 *      between them glow alike (within 2%), so it is the spent charge that
 *      dims the second, not the flow the first left behind (measured, the
 *      control's two match to the third decimal).
 *
 *   5. Off is off, and the plate draws it. Stepped at Glow 0 there is no
 *      glow solver at all. Drawn mid-stroke at Glow 1, the plate's picture is
 *      bluer than the same moment drawn at 0 (the mean of blue minus red up
 *      by over 2 of 255 inside the band, and under a tenth of that far from
 *      it), and drawn at 0 twice it is the same bytes (the comparison sees
 *      the glow, not a plate that never draws the same twice).
 */
import { openLab } from './lab.mjs';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) passed++; else failed++;
};

const { page, close } = await openLab();
let o;
try {
  o = await page.evaluate(async () => {
    const N = 128, R = 192, n = 256;
    const cam = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5, bubbles: 0 };
    const dark = { ledColor: '#000000', ledPlatform: false };
    const glowOf = () => lab.solver().glowPlate;
    const P = (over = {}) => ({ glow: 1, glowShear: 30, glowRecharge: 8, ...over });
    // Sums over a box of the glow grid, uv x0..x1, y0..y1 (row 0 at uv y 0).
    const box = (a, x0, x1, y0, y1) => {
      let s = 0, c = 0;
      for (let j = Math.floor(y0 * n); j < Math.ceil(y1 * n); j++)
        for (let i = Math.floor(x0 * n); i < Math.ceil(x1 * n); i++) { s += a[j * n + i]; c++; }
      return s / c;
    };
    const band = (a) => box(a, 0.15, 0.65, 0.28, 0.42);
    const mirror = (a) => box(a, 0.15, 0.65, 0.58, 0.72);
    const far = (a) => (box(a, 0.05, 0.95, 0.85, 0.95) + box(a, 0.8, 0.95, 0.05, 0.95)) / 2;
    const fresh = async () => { await lab.create(N); lab.dye(0.5, 0.5, 0.35, [0.6, 0.2, 0.1], 0.6); lab.flush(); };
    // A finger dragged across, a step at a time: returns the brightest band light of any step.
    const stroke = async (speed, over = {}, picture = null) => {
      let peak = 0;
      for (let k = 0; k < 12; k++) {
        lab.vel(0.2 + (0.4 * k) / 11, 0.35, 0.05, [speed, 0, 0, 0]);
        lab.flush();
        await lab.step(1, P(over));
        const g = await glowOf().read();
        peak = Math.max(peak, band(g.light));
        if (picture && k === 6) await picture();
      }
      return peak;
    };
    const rest = async (steps, over = {}) => { await lab.step(steps, P(over)); };
    const spent = (g) => g.charge.map((c) => 1 - c);
    const r = {};

    // 1. A still plate.
    await fresh();
    await rest(200);
    let g = await glowOf().read();
    r.stillMax = Math.max(...g.light);
    r.stillMinCharge = Math.min(...g.charge);

    // 2 and 5. A stroke, the plate drawn in the middle of it.
    const pics = {};
    r.peak1 = await stroke(1.5, {}, async () => {
      pics.on = Array.from(await lab.render(R, { ...dark, glow: 1 }, cam));
      pics.off = Array.from(await lab.render(R, { ...dark, glow: 0 }, cam));
      pics.off2 = Array.from(await lab.render(R, { ...dark, glow: 0 }, cam));
    });
    g = await glowOf().read();
    const s = spent(g);
    r.spentBand = band(s); r.spentMirror = mirror(s); r.spentFar = far(s);
    r.lightMax = Math.max(...g.light);

    // 4. Again, half a second later.
    r.peaks = [r.peak1];
    for (let k = 0; k < 4; k++) { await rest(30); r.peaks.push(await stroke(1.5)); }
    r.peak2 = r.peaks[1];

    // 3. The same stroke as a drift.
    await fresh();
    await rest(5);
    await stroke(1.5 / 20);
    r.spentDrift = band(spent(await glowOf().read()));
    // Its positive control: the same drift with the threshold twenty times lower must spend,
    // so the 0 above is the threshold's and not a drift that made no flow at all.
    await fresh();
    await rest(5, { glowShear: 1.5 });
    await stroke(1.5 / 20, { glowShear: 1.5 });
    r.spentDriftLow = band(spent(await glowOf().read()));

    // 4's control: the same half-second rest, but Recharge at its floor (0.05 s refills to
    // e^-10 in that rest). Only the store changes, so the first stroke's leftover flow is still
    // there: if the second stroke still dimmed, the dimming would be that flow's, not the charge's.
    await fresh();
    await rest(5, { glowRecharge: 0.05 });
    r.ctl1 = await stroke(1.5, { glowRecharge: 0.05 });
    await rest(30, { glowRecharge: 0.05 });
    r.ctl2 = await stroke(1.5, { glowRecharge: 0.05 });

    // 5. Off.
    await lab.step(1, P({ glow: 0 }));
    r.keptOff = lab.solver().glowPlate !== null && lab.solver().glowPlate !== undefined;
    await fresh();
    await lab.step(20, P({ glow: 0 }));
    r.madeOff = lab.solver().glowPlate !== null && lab.solver().glowPlate !== undefined;

    // The pictures: blue minus red, in the band and far, picture row 0 at the top (uv y 1).
    const bmr = (px, x0, x1, y0, y1) => {
      let t = 0, c = 0;
      for (let y = Math.floor((1 - y1) * R); y < Math.ceil((1 - y0) * R); y++)
        for (let x = Math.floor(x0 * R); x < Math.ceil(x1 * R); x++) { const k = (y * R + x) * 4; t += px[k + 2] - px[k]; c++; }
      return t / c;
    };
    // The band itself, never the larger of it and its mirror: the plate's uv runs up the picture
    // (plateThinFilm.ts), so a glow read upside down lands in the mirror and must fail here.
    r.picBand = bmr(pics.on, 0.15, 0.65, 0.28, 0.42) - bmr(pics.off, 0.15, 0.65, 0.28, 0.42);
    r.picMirror = bmr(pics.on, 0.15, 0.65, 0.58, 0.72) - bmr(pics.off, 0.15, 0.65, 0.58, 0.72);
    r.picFar = bmr(pics.on, 0.05, 0.95, 0.85, 0.95) - bmr(pics.off, 0.05, 0.95, 0.85, 0.95);
    r.picSame = pics.off.every((v, k) => v === pics.off2[k]);
    return r;
  });
} finally {
  await close();
}

const f = (x, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : String(x));
console.log(`glow: still max ${f(o.stillMax, 6)} min charge ${f(o.stillMinCharge)}; stroke peak ${f(o.peak1)} brightest ${f(o.lightMax)}; spent band ${f(o.spentBand)} mirror ${f(o.spentMirror, 5)} far ${f(o.spentFar, 5)} drift ${f(o.spentDrift, 5)} (low threshold ${f(o.spentDriftLow)}); second ${f(o.peak2)} (${f(o.peak2 / o.peak1, 2)}×); control ${f(o.ctl1)} then ${f(o.ctl2)} (${f(o.ctl2 / o.ctl1, 2)}×); picture band ${f(o.picBand, 2)} mirror ${f(o.picMirror, 2)} far ${f(o.picFar, 2)}`);
check('a still plate is dark and keeps its charge', o.stillMax < 1e-4 && o.stillMinCharge > 0.999, `brightest ${f(o.stillMax, 6)}, lowest charge ${f(o.stillMinCharge)}`);
check('a stroke lights (its band glows)', o.peak1 > 0.02, `band peak ${f(o.peak1)}`);
check('the stroke spends charge along its path, not far from it', o.spentBand > 0.01 && o.spentBand > 10 * o.spentFar, `band ${f(o.spentBand)} far ${f(o.spentFar, 5)}`);
check('and not in its mirror (a flow read upside down)', o.spentBand > 10 * o.spentMirror, `band ${f(o.spentBand)} mirror ${f(o.spentMirror, 5)}`);
check('a drift under the threshold spends almost nothing', o.spentDrift < o.spentBand / 20, `drift ${f(o.spentDrift, 5)} vs stroke ${f(o.spentBand)}`);
check('control: that drift under a threshold twenty times lower does spend', o.spentDriftLow > o.spentBand / 2, `drift ${f(o.spentDriftLow)} vs stroke ${f(o.spentBand)}`);
check('a second stroke within the recharge glows less', o.peak2 < 0.97 * o.peak1, `${f(o.peak2)} vs ${f(o.peak1)}`);
check('stroked again and again, the sea tires (each pass dimmer, the fifth under 0.85)', o.peaks.every((v, k) => k === 0 || v < o.peaks[k - 1]) && o.peaks[4] < 0.85 * o.peaks[0], o.peaks.map((v) => f(v, 3)).join(' → '));
check('control: rested past a short recharge, the second glows as the first', Math.abs(o.ctl2 / o.ctl1 - 1) < 0.02, `${f(o.ctl2)} vs ${f(o.ctl1)}`);
check('turned off, the glow goes', !o.keptOff, '');
check('off from the start, no glow is made', !o.madeOff, '');
check('the plate draws the glow blue in the band', o.picBand > 2, `blue−red up ${f(o.picBand, 2)} of 255`);
check('and not in its mirror (a picture drawn upside down)', Math.abs(o.picMirror) < o.picBand / 10, `mirror ${f(o.picMirror, 2)}`);
check('and not far from it', Math.abs(o.picFar) < Math.max(0.2, o.picBand / 10), `far ${f(o.picFar, 2)}`);
check('control: the plate drawn twice at 0 is the same bytes', o.picSame, '');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
