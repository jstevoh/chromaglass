#!/usr/bin/env node
/**
 * Each projector's focus (PLAN 51b): a projector racked out of focus spreads
 * every point of its picture into the lamp's image, a filled bar, by the thin
 * lens's law, in linear light, keeping the light; the other projector stays
 * as sharp as it was.
 *
 *   npm run focus      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked. The owner watched Liquid Light Lab's films (2026-11-27);
 * in "Epic Rig" one projector's layer racks soft while the other stays sharp,
 * and players ride focus by hand. The plate drew every picture sharp.
 *
 * Asked first of the law on its own (lib/projectorFocus.ts), from numbers
 * typed here and not read from that file, then of the real plate shader on
 * lab plates:
 *
 *   0. the law: a stage Δz from the plane in focus blurs Δz × pupil / 0.36 m
 *      on the stage, the pupil the lamp's image (32 by 16 mm), as a share of
 *      a 0.285 m stage: 10 mm is 0.31% along the bar; the rack's end, the
 *      knob's half, 75 mm and 2.3% (a real show's soft edges are 1.2 to 2.4%
 *      of the frame); the knob's end a melt of about a tenth; either way the
 *      same; and the focus is the rig's, never wandered nor ridden by a cord;
 *   1. at the default the pass does nothing: the keys written at 0, left out,
 *      or racked by less than half a pixel are the same plate to the byte; a
 *      rack a pixel wide moves it (the positive control);
 *   2. racked, the picture is the sharp one convolved with the law's box in
 *      linear light: every pixel within a few levels of the box worked out
 *      here from the sharp picture, at three settings (a quarter, the rack's
 *      end, the knob's end); the 10–90% width of the pool's edge along x and
 *      along y within 10% of that box's, the bar twice as long along x as
 *      down y; the bar turned a quarter (the control) misses by far more;
 *   3. the light is kept: the frame's mean linear light within 1% of the
 *      sharp frame's at every setting (a blur in display values, the
 *      control, darkens it);
 *   4. two projectors, B racked out and A not: B alone is the sharp B
 *      convolved with B's box; A alone stays the sharp A within the finish's
 *      dither; and with the crossfade at the middle the wall is half of A
 *      sharp plus half of B soft, in linear light, within 1% of the lamp.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';
import { BLUE, TEAL } from './lampcontrol.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3);

const out = 'node_modules/.cache/projector-focus.mjs';
await build({
  stdin: { contents: "export * from './src/lib/projectorFocus.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { DRIFTABLE } from './src/lib/drift.ts'; export { RIG_KEYS } from './src/lib/lookFade.ts'; export { PATCH_TARGETS } from './src/lib/sceneMap.ts'; export { PIN_RANGE } from './src/lib/deskPins.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const lens = await import(`../${out}`);
const { focusDz, focusBlur, focusBoxPx, DEFAULT_SETTINGS, DRIFTABLE, RIG_KEYS, PATCH_TARGETS, PIN_RANGE } = lens;
const KEYS = ['projFocusA', 'projFocusB'];

// ── 0. The law, from outside its file ────────────────────────────────
{
  const blurOf = (dz) => [dz * 0.032 / 0.36 / 0.285, dz * 0.016 / 0.36 / 0.285];
  const tenMm = blurOf(0.010);
  // The knob that racks 10 mm: the rack is 75 mm over its first half.
  const k10 = 0.010 / 0.075 / 2;
  const at10 = focusBlur(k10), atRack = focusBlur(0.5), atEnd = focusBlur(1);
  const law = Math.abs(at10[0] - tenMm[0]) < 1e-6 && Math.abs(at10[1] - tenMm[1]) < 1e-6
    && Math.abs(focusDz(0.5) - 0.075) < 1e-9 && Math.abs(focusDz(1) - 0.32) < 1e-9 && focusDz(0) === 0;
  const real = atRack[0] >= 0.012 && atRack[0] <= 0.024;
  const melt = atEnd[0] > 0.08 && atEnd[0] < 0.12;
  const sym = [0.1, 0.4, 0.7, 1].every(k => focusDz(k) === focusDz(-k));
  const monotone = [0, 0.1, 0.3, 0.5, 0.6, 0.8, 1].every((k, i, a) => i === 0 || focusDz(k) > focusDz(a[i - 1]));
  const box = new Float32Array(4); focusBoxPx(box, { projFocusA: 0.5, projFocusB: 0.5 }, false, 1000, 1);
  const halves = Math.abs(box[0] - 0.5 * 1000 * atRack[0]) < 1e-3 && box[2] === 0 && box[3] === 0;
  const rig = KEYS.every(k => RIG_KEYS.has(k) && !DRIFTABLE.includes(k) && !PATCH_TARGETS.some(t => t.key === k) && PIN_RANGE.get(k)?.min === -1 && PIN_RANGE.get(k)?.max === 1 && DEFAULT_SETTINGS[k] === 0);
  check('the law, from outside its file: 10 mm blurs 0.31% along the bar, the rack\'s end 2.3% (a real show\'s soft edges), the knob\'s end a melt of a tenth, either way the same; the focus is the rig\'s, learnable −1 to 1, sharp by default',
    law && real && melt && sym && monotone && halves && rig,
    `10 mm ${(100 * at10[0]).toFixed(3)}%/${(100 * at10[1]).toFixed(3)}% (typed here ${(100 * tenMm[0]).toFixed(3)}%); rack ${(100 * atRack[0]).toFixed(2)}%; end ${(100 * atEnd[0]).toFixed(2)}%; box at 1000 px ${f2(box[0])}/${f2(box[1])}, B with one projector ${box[2]}; rig ${rig ? 'yes' : 'no'}`);
}

// ── The plates ───────────────────────────────────────────────────────
const S = 256;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0,
  microDroplets: 0, thinFilm: 0, lampWarmth: 0, dishVignette: 0, lampHotspot: 0, lampGround: 1 };
const TWO = { layerCount: 2, twoProjectors: 1 };
const BACK = { backPlate: true, backRotation: Math.PI };
const SET = [0.25, 0.5, 1];

const lab = await openLab();
let shots;
try {
  shots = await lab.page.evaluate(async ([S, N, TWO, BACK, BLUE, TEAL, SET]) => {
    /*
      A step edge as sharp as the frame's pixels: the dye's own edges are a
      grid cell's falloff wide (23 pixels at 256 from a 128 grid), wider than
      a real rack's blur, so a slide in the lamp (the video under the dish, in
      projector A's own beam) carries a dark square on clear glass, and the
      pools of dye lie over it.
    */
    const slide = new OffscreenCanvas(S, S);
    // A blue square, not a black one: the film's key passes nothing under its 0.18 (lib/mixer.ts), and black would key out.
    { const g = slide.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); g.fillStyle = 'hsl(220, 85%, 45%)'; g.fillRect(S * 0.3, S * 0.3, S * 0.4, S * 0.4); }
    const r = (over, cam = {}) => lab.render(S, { ...N, filmMix: 1, markMix: 0, ...over }, { film: slide, ...cam });
    const o = {};
    await lab.create(128); lab.dye(0.75, 0.25, 0.08, BLUE, 0.9); lab.dye(0.25, 0.75, 0.08, TEAL, 0.9); lab.flush(); await lab.step(1);
    o.sharp = await r({});
    o.zeros = await r({ projFocusA: 0, projFocusB: 0 });
    o.unset = await r({ projFocusA: undefined, projFocusB: undefined });
    // Under half a pixel of half-width at 256: sharp, the pass sits out. A rack 1.4 pixels wide: the positive control.
    o.hair = await r({ projFocusA: 0.02 });
    o.nudge = await r({ projFocusA: 0.12 });
    o.down = await r({ projFocusA: -0.5 });
    for (const k of SET) o[`soft${k}`] = await r({ projFocusA: k });
    // Two projectors on two plates of dye and no slide: the blue pool and the teal, the back plate turned half round.
    await lab.create(128); lab.dye(0.38, 0.5, 0.17, BLUE, 0.6); lab.dye(0.62, 0.36, 0.1, TEAL, 0.8); lab.flush(); await lab.step(1);
    const r2 = (over, cam) => lab.render(S, { ...N, ...over }, cam);
    o.twoA = await r2({ ...TWO, projCross: 0 }, BACK);
    o.twoB = await r2({ ...TWO, projCross: 1 }, BACK);
    o.twoAsoftB = await r2({ ...TWO, projCross: 0, projFocusB: 0.75 }, BACK);
    o.twoBsoft = await r2({ ...TWO, projCross: 1, projFocusB: 0.75 }, BACK);
    o.twoMid = await r2({ ...TWO, projCross: 0.5, projFocusB: 0.75 }, BACK);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.from(v)]));
  }, [S, NEUTRAL, TWO, BACK, BLUE, TEAL, SET]);
} finally { await lab.close(); }

const lin = (v) => Math.pow(Math.max(0, v) / 255, 2.2);
const disp = (l) => 255 * Math.pow(Math.max(0, l), 1 / 2.2);
const maxDiff = (a, b) => { let m = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3) m = Math.max(m, Math.abs(a[k] - b[k])); return m; };
const meanLin = (img) => { let s = 0, n = 0; for (let k = 0; k < img.length; k++) if (k % 4 !== 3) { s += lin(img[k]); n++; } return s / n; };

/* The law's box over a picture, in linear light: half-widths hx, hy pixels, each pixel weighed by how much of it the box covers, the frame's edge held (as the sampler clamps). */
function boxed(img, hx, hy) {
  const L = new Float64Array(S * S * 3);
  for (let p = 0; p < S * S; p++) for (let c = 0; c < 3; c++) L[p * 3 + c] = lin(img[p * 4 + c]);
  const weights = (h) => {
    const w = [];
    if (h < 0.5) return [[0, 1]];
    const R = Math.ceil(h + 0.5);
    let sum = 0;
    for (let j = -R; j <= R; j++) { const v = Math.max(0, Math.min(j + 0.5, h) - Math.max(j - 0.5, -h)); if (v > 0) { w.push([j, v]); sum += v; } }
    return w.map(([j, v]) => [j, v / sum]);
  };
  const pass = (src, w, dx, dy) => {
    const dst = new Float64Array(src.length);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) for (const [j, v] of w) {
      const xx = Math.min(S - 1, Math.max(0, x + j * dx)), yy = Math.min(S - 1, Math.max(0, y + j * dy));
      for (let c = 0; c < 3; c++) dst[(y * S + x) * 3 + c] += v * src[(yy * S + xx) * 3 + c];
    }
    return dst;
  };
  const both = pass(pass(L, weights(hx), 1, 0), weights(hy), 0, 1);
  const outImg = new Float64Array(S * S * 4);
  for (let p = 0; p < S * S; p++) { for (let c = 0; c < 3; c++) outImg[p * 4 + c] = disp(both[p * 3 + c]); outImg[p * 4 + 3] = 255; }
  return outImg;
}
/* Off by how much, on average, where the blur does anything: the pixels where the law's box moves the sharp picture by more than 2 levels. */
const edgeAbs = (a, b, sharp, want) => { let s = 0, n = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3 && Math.abs(want[k] - sharp[k]) > 2) { s += Math.abs(a[k] - b[k]); n++; } return n ? s / n : NaN; };
const meanAbs = (a, b) => { let s = 0, n = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3) { s += Math.abs(a[k] - b[k]); n++; } return s / n; };
/* The pool's 10–90% edge width on its row (axis x) or column (axis y) through the middle, its left or top edge: where the blue's red channel climbs from the pool's to the glass's. */
function edgeWidth(img, axis) {
  const at = (i) => { const x = axis === 'x' ? i : S / 2, y = axis === 'x' ? S / 2 : i; return img[(y * S + x) * 4]; };
  const lo = at(S / 2), hi = at(Math.round(S * 0.18));
  const cross = (t) => { const v = hi + (lo - hi) * t; for (let i = Math.round(S * 0.18); i < S / 2; i++) { const a = at(i), b = at(i + 1); if ((a - v) * (b - v) <= 0 && a !== b) return i + (v - a) / (b - a); } return NaN; };
  return cross(0.9) - cross(0.1);
}
const boxOf = (k, hb = false) => { const b = new Float32Array(4); focusBoxPx(b, hb ? { projFocusB: k } : { projFocusA: k }, hb, S, 1); return hb ? [b[2], b[3]] : [b[0], b[1]]; };

// ── 1. The default does nothing ──────────────────────────────────────
{
  const worst = Math.max(maxDiff(shots.sharp, shots.zeros), maxDiff(shots.sharp, shots.unset), maxDiff(shots.sharp, shots.hair));
  const moved = maxDiff(shots.sharp, shots.nudge);
  check('at the default the pass does nothing: the focus written at 0, left out, or racked by under half a pixel is the same plate to the byte; a rack a pixel and a half wide moves it',
    worst === 0 && moved >= 3, `worst ${worst} levels; the hair's box ${f2(boxOf(0.02)[0])} px; at ${f2(boxOf(0.12)[0])} px ${moved} levels`);
}

// ── 2, 3. Racked: the sharp picture through the law's box ────────────
{
  let ok = true;
  const lines = [];
  for (const k of SET) {
    const [hx, hy] = boxOf(k);
    const want = boxed(shots.sharp, hx, hy);
    const turned = boxed(shots.sharp, hy, hx);
    const got = shots[`soft${k}`];
    const err = edgeAbs(got, want, shots.sharp, want), errTurned = edgeAbs(got, turned, shots.sharp, want), errSharp = edgeAbs(got, shots.sharp, shots.sharp, want);
    const wx = edgeWidth(got, 'x'), wy = edgeWidth(got, 'y'), wantX = edgeWidth(want, 'x'), wantY = edgeWidth(want, 'y');
    const widthOff = Math.max(Math.abs(wx - wantX) / wantX, Math.abs(wy - wantY) / wantY);
    const light = Math.abs(meanLin(got) - meanLin(shots.sharp)) / meanLin(shots.sharp);
    const pass = err < 2 && widthOff < 0.1 && errTurned > 2 * err && errSharp > 3 * err && (2 * hy < 4 || wx > wy * 1.3) && light < 0.01;
    ok = ok && pass;
    lines.push(`${k === SET[0] ? `sharp edge ${f2(edgeWidth(shots.sharp, 'x'))} px; ` : ''}${k}: box ${f2(2 * hx)}×${f2(2 * hy)} px, off the box ${f2(err)} levels (turned ${f2(errTurned)}, sharp ${f2(errSharp)}), edge ${f2(wx)}/${f2(wy)} px against ${f2(wantX)}/${f2(wantY)}, light ${(100 * light).toFixed(2)}%`);
  }
  check('racked, the picture is the sharp one through the law\'s bar in linear light, at a quarter, the rack\'s end and the knob\'s end: within 2 levels where it moves anything, its edges within 10% along x and down y, longer along x once the bar is 4 pixels across; the bar turned a quarter misses',
    ok, lines.join('; '));
  // The light, against the control: the same box in display values darkens a dark-on-light edge.
  const [hx, hy] = boxOf(1);
  const got = shots.soft1;
  const light = Math.abs(meanLin(got) - meanLin(shots.sharp)) / meanLin(shots.sharp);
  // A blur of the display values (the control): the box above over a picture lifted so its "light" is the display value, then let down again.
  const asLight = shots.sharp.map((v, k) => (k % 4 === 3 ? v : 255 * Math.pow(v / 255, 1 / 2.2)));
  const wrong = boxed(asLight, hx, hy).map((v, k) => (k % 4 === 3 ? v : 255 * Math.pow(v / 255, 2.2)));
  const wrongLight = Math.abs(meanLin(wrong) - meanLin(shots.sharp)) / meanLin(shots.sharp);
  check('the light is kept: at the knob\'s end the frame\'s mean linear light is the sharp frame\'s within 1%; a blur of display values (the control) moves it more',
    light < 0.01 && wrongLight > light * 10 && wrongLight > 0.002, `${(100 * light).toFixed(3)}% off; the display-value blur ${(100 * wrongLight).toFixed(2)}% off`);
  check('either way is the same: racked down the knob\'s half is racked up\'s, to within the finish\'s dither', maxDiff(shots.down, shots['soft0.5']) <= 1, `worst ${maxDiff(shots.down, shots['soft0.5'])} levels`);
}

// ── 4. Two projectors: B soft, A sharp ───────────────────────────────
{
  const [hx, hy] = boxOf(0.75, true);
  const wantB = boxed(shots.twoB, hx, hy);
  const errB = edgeAbs(shots.twoBsoft, wantB, shots.twoB, wantB), sharpB = edgeAbs(shots.twoBsoft, shots.twoB, shots.twoB, wantB);
  const keptA = maxDiff(shots.twoAsoftB, shots.twoA);
  let worst = 0, n = 0;
  for (let k = 0; k < shots.twoMid.length; k++) {
    if (k % 4 === 3) continue;
    const want = disp(0.5 * lin(shots.twoA[k]) + 0.5 * lin(shots.twoBsoft[k]));
    worst = Math.max(worst, Math.abs(shots.twoMid[k] - want)); n++;
  }
  check('two projectors, B racked out: B alone is the sharp B through B\'s bar, A alone stays sharp, and at the crossfade\'s middle the wall is half of A sharp plus half of B soft in linear light, within 1% of the lamp',
    errB < 2 && sharpB > 3 * errB && keptA <= 1 && worst <= 2.6,
    `B off its box ${f2(errB)} levels (sharp ${f2(sharpB)}); A ${keptA} levels from sharp; the middle's worst ${f2(worst)} levels`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} focus checks passed`);
process.exit(failed ? 1 : 0);
