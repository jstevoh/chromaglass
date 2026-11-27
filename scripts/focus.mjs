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
 *
 * And of the two things PLAN 51c added (lib/focusDissolve.ts, the melt's
 * smaller pictures in gpu/focus.ts):
 *
 *   6. a melt taken down to a quarter (and, forced, a half) of a 1024 frame, and a dissolve's glow to an eighth, is
 *      still the sharp picture through the law's box: within 2 levels where
 *      it moves anything, edges within 10%, the light within 1%, and within
 *      a few levels of the same melt drawn at full size (the control, which
 *      also says the pass really drew small: its scale read back); a sharp A
 *      beside a melted B stays sharp to the dither, B's melt drawn small;
 *   7. the dissolve's timing, from outside its file: the rack is still at
 *      both ends and widest once, at the middle; the look change runs inside
 *      the rack's wider half, and the look fade's switch (lookFade's
 *      blendLooks, where what cannot be halfway flips) lands on the widest
 *      blur; a second Go mid-rack carries on from the blur it has reached;
 *   8. a dissolve drawn through the real pass, the dish's detail (a slide of
 *      dots) swapped at once at the rack's middle (the worst case: the app's
 *      change is spread over the middle half): the frame's sharpness falls to
 *      one minimum at the swap and climbs back, and the swap changes the
 *      frame by under a third of what the same swap does sharp (a hard
 *      cut). PLAN 51c asked a quarter, before anything was measured: a blur
 *      hides edges, not where the light lies, so dots 2 to 5% of the frame
 *      across swapped in one frame are 57% of a cut under the focus knob's
 *      melt (a tenth of the frame) and 29% under the dissolve's glow (a
 *      quarter), which is why the dial ramps on to a glow. The app never
 *      swaps a whole dish in one frame (its handover runs over the middle
 *      half); what flips at once is what cannot be halfway. A change of
 *      palette over the whole plate is broader than any blur and is not
 *      claimed at all (the first build's two pools against four: 93%).
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
  stdin: { contents: "export * from './src/lib/projectorFocus.ts'; export * from './src/lib/focusDissolve.ts'; export { blendLooks } from './src/lib/lookFade.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { DRIFTABLE } from './src/lib/drift.ts'; export { RIG_KEYS } from './src/lib/lookFade.ts'; export { PATCH_TARGETS } from './src/lib/sceneMap.ts'; export { PIN_RANGE } from './src/lib/deskPins.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const lens = await import(`../${out}`);
const { focusDz, focusBlur, focusBoxPx, focusScale, focusDraws, dissolveDz, rackShare, rackClock, walkRack, startRack, LOOK_FROM, LOOK_TO, blendLooks, DEFAULT_SETTINGS, DRIFTABLE, RIG_KEYS, PATCH_TARGETS, PIN_RANGE } = lens;
const KEYS = ['projFocusA', 'projFocusB'];
const RACK = 'projRack';

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

// ── 7. The dissolve's timing (PLAN 51c), from outside its file ───────
{
  const N = 400;
  const at = (p) => rackShare(p);
  // Still at both ends (a hand starts and stops the knob), widest once, at the middle.
  const ends = at(0) === 0 && at(1) === 0 && at(0.01) < 0.002 && at(0.99) < 0.002 && Math.abs(at(0.5) - 1) < 1e-9;
  let peaks = 0;
  for (let i = 1; i < N; i++) { const a = at((i - 1) / N), b = at(i / N), c = at((i + 1) / N); if (b > a && b >= c) peaks++; }
  // The look change inside the wider half: the share past a half throughout.
  let least = 1;
  for (let i = 0; i <= N; i++) least = Math.min(least, at(LOOK_FROM + (LOOK_TO - LOOK_FROM) * i / N));
  // Where the look fade flips what cannot be halfway (a blend mode), from the real blendLooks, mapped onto the rack.
  const from = { ...DEFAULT_SETTINGS, backBlend: 'screen' }, to = { ...DEFAULT_SETTINGS, backBlend: 'multiply' };
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (blendLooks(from, to, m).backBlend === 'multiply') hi = m; else lo = m; }
  const flipAt = LOOK_FROM + (LOOK_TO - LOOK_FROM) * hi;
  // A Go of 4 s from rest: the rack the whole 4 s, the change a second in, over 2 s.
  const c = rackClock();
  const plan = startRack(c, 1000, 4, true, false);
  walkRack(c, 3000);
  const mid = c.share[0], restB = c.share[1];
  walkRack(c, 5000);
  const done = c.share[0] === 0 && c.ms[0] === 0;
  // A second Go 1.5 s into a 4 s rack (share about 0.85, on the way out): no snap, and its change waits only what is left of its quarter.
  const c2 = rackClock();
  startRack(c2, 0, 4, true, false);
  walkRack(c2, 1500);
  const before = c2.share[0];
  const plan2 = startRack(c2, 1500, 4, true, false);
  walkRack(c2, 1500);
  const after = c2.share[0];
  // And one on its way back in, 2.8 s into a 4 s rack (p 0.7): it folds onto the way out at the same share, its change at once and over what is left to 0.75.
  const c3 = rackClock();
  startRack(c3, 0, 4, true, false);
  walkRack(c3, 2800);
  const back0 = c3.share[0];
  const plan3 = startRack(c3, 2800, 4, true, false);
  walkRack(c3, 2800);
  const back1 = c3.share[0];
  walkRack(c3, 2800 + 200);
  const rising = c3.share[0] > back1;
  const p3 = Math.asin(Math.sqrt(back0)) / Math.PI;
  const backOk = Math.abs(back1 - back0) < 1e-6 && plan3.delayMs === 0 && Math.abs(plan3.seconds - (LOOK_TO - p3) * 4) < 1e-9 && rising;
  const rig = RIG_KEYS.has(RACK) && !DRIFTABLE.includes(RACK) && !PATCH_TARGETS.some(t => t.key === RACK) && PIN_RANGE.get(RACK)?.min === 0 && PIN_RANGE.get(RACK)?.max === 1 && DEFAULT_SETTINGS[RACK] === 0;
  // The dial's half is the head's real rack, as the focus knob's is; its end a glow a quarter of the frame along the bar (0.8 m, typed here); the rack never sharpens a head already softer.
  const box = new Float32Array(4), box2 = new Float32Array(4), box3 = new Float32Array(4), box4 = new Float32Array(4);
  focusBoxPx(box, { projRack: 0.5 }, true, 1000, 1, [1, 0]);
  focusBoxPx(box2, { projFocusA: 0.5 }, true, 1000, 1);
  focusBoxPx(box3, { projFocusA: 1, projRack: 0.25 }, true, 1000, 1, [1, 1]);
  focusBoxPx(box4, { projRack: 1 }, true, 1000, 1, [1, 0]);
  const knobEnd = new Float32Array(4); focusBoxPx(knobEnd, { projFocusA: 1 }, true, 1000, 1);
  const glow = 2 * box4[0] / 1000, glowTyped = 0.8 * 0.032 / 0.36 / 0.285;
  const scaleLaw = Math.abs(box[0] - box2[0]) < 1e-4 && box[2] === 0 && Math.abs(box3[0] - knobEnd[0]) < 1e-4 && Math.abs(glow - glowTyped) < 1e-6 && glow > 0.2 && glow < 0.3 && dissolveDz(0) === 0;
  check('the dissolve\'s timing, from outside its file: the rack is still at both ends and widest once, at the middle; the look change inside its wider half; the look fade\'s switch on the widest blur; a second Go mid-rack, on the way out or back, goes on from its blur; the dial the rig\'s, 0 to 1, off by default, its half the head\'s real rack as on the focus knob and its end a glow a quarter of the frame',
    ends && peaks === 1 && least >= 0.5 - 1e-9 && at(flipAt) > 0.99 && Math.abs(plan.delayMs - 1000) < 1e-6 && Math.abs(plan.seconds - 2) < 1e-9
      && Math.abs(mid - 1) < 1e-9 && restB === 0 && done && Math.abs(after - before) < 1e-6 && plan2.delayMs === 0 && plan2.seconds > 0 && backOk && rig && scaleLaw,
    `peaks ${peaks}; least share in the change ${f3(least)}; the switch at ${f3(flipAt)} of the rack, share ${f3(at(flipAt))}; 4 s: change ${plan.delayMs} ms in over ${plan.seconds} s, middle ${f3(mid)}; again at 1.5 s: ${f3(before)} → ${f3(after)}, change in ${plan2.delayMs} ms over ${f3(plan2.seconds)} s; again at 2.8 s, on the way back: ${f3(back0)} → ${f3(back1)}, out again ${rising ? 'yes' : 'no'}, change in ${plan3.delayMs} ms over ${f3(plan3.seconds)} s; rig ${rig ? 'yes' : 'no'}; the dial's end ${(100 * glow).toFixed(1)}% of the frame (typed here ${(100 * glowTyped).toFixed(1)}%)`);
}

// ── The plates ───────────────────────────────────────────────────────
const S = 256;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0,
  microDroplets: 0, thinFilm: 0, lampWarmth: 0, dishVignette: 0, lampHotspot: 0, lampGround: 1 };
const TWO = { layerCount: 2, twoProjectors: 1 };
const BACK = { backPlate: true, backRotation: Math.PI };
const SET = [0.25, 0.5, 1];
const BIG = 1024, FRAMES = 16;
// The dissolve's dial where its depth is the focus knob's melt, 0.32 m (typed here: the dial's second half runs 0.075 to 0.8 m).
const MELT_DIAL = 0.5 + (0.32 - 0.075) / (0.8 - 0.075) / 2;

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
    // Into a texture (the camera's, the film stock's, a projector's): the flipped columns pass, turned upright by the lab.
    o.flipSharp = await r({}, { flip: true });
    o.flipSoft = await r({ projFocusA: 0.5 }, { flip: true });
    for (const k of SET) o[`soft${k}`] = await r({ projFocusA: k });
    // Two projectors on two plates of dye and no slide: the blue pool and the teal, the back plate turned half round.
    await lab.create(128); lab.dye(0.38, 0.5, 0.17, BLUE, 0.6); lab.dye(0.62, 0.36, 0.1, TEAL, 0.8); lab.flush(); await lab.step(1);
    const r2 = (over, cam) => lab.render(S, { ...N, ...over }, cam);
    o.twoA = await r2({ ...TWO, projCross: 0 }, BACK);
    o.twoB = await r2({ ...TWO, projCross: 1 }, BACK);
    o.twoAsoftB = await r2({ ...TWO, projCross: 0, projFocusB: 0.75 }, BACK);
    o.twoBsoft = await r2({ ...TWO, projCross: 1, projFocusB: 0.75 }, BACK);
    o.twoMid = await r2({ ...TWO, projCross: 0.5, projFocusB: 0.75 }, BACK);
    /*
      The same on a wall dimmed after the two lights are added (the lamp's
      hot-spot, the dish's rims): those multiply both lights, so B's share
      must not move with them. Taken against the finished wall (the first
      build), a corner at 0.6 of the hot-spot read B's share 3.1 times too
      big and blurred a sharp A with B's lens (the pre-push review).
    */
    const LIT = { lampHotspot: 0.8, dishSpread: 0.7 };
    o.litA = await r2({ ...TWO, ...LIT, projCross: 0 }, BACK);
    o.litBsoft = await r2({ ...TWO, ...LIT, projCross: 1, projFocusB: 0.75 }, BACK);
    o.litMid = await r2({ ...TWO, ...LIT, projCross: 0.5, projFocusB: 0.75 }, BACK);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.from(v)]));
  }, [S, NEUTRAL, TWO, BACK, BLUE, TEAL, SET]);
  /*
    A melt taken down (PLAN 51b-3): at 1024 the knob's end is a box 204 by
    102 pixels, 51 by 26 at a quarter, so the pass draws it at a quarter; the
    same melt forced to a half, and to full size, where its 32 taps a row lie
    six pixels apart; with the scale each drew at. One picture a call, as
    bytes: a frame this size as a list of numbers is more than the page holds.
  */
  const big = async (name, plate, over, cam = {}) => {
    const [b64, scale] = await lab.page.evaluate(async ([BIG, N, BLUE, TEAL, TWO, BACK, plate, over, cam]) => {
      if (plate === 'slide') {
        await lab.create(128); lab.dye(0.75, 0.25, 0.08, BLUE, 0.9); lab.dye(0.25, 0.75, 0.08, TEAL, 0.9); lab.flush(); await lab.step(1);
      } else if (plate === 'two') {
        await lab.create(128); lab.dye(0.38, 0.5, 0.17, BLUE, 0.6); lab.dye(0.62, 0.36, 0.1, TEAL, 0.8); lab.flush(); await lab.step(1);
      }
      const slide = new OffscreenCanvas(BIG, BIG);
      { const g = slide.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, BIG, BIG); g.fillStyle = 'hsl(220, 85%, 45%)'; g.fillRect(BIG * 0.3, BIG * 0.3, BIG * 0.4, BIG * 0.4); }
      const px = await lab.render(BIG, plate === 'two' || plate === 'twoKeep' ? { ...N, ...TWO, ...over } : { ...N, filmMix: 1, markMix: 0, ...over },
        plate === 'two' || plate === 'twoKeep' ? { ...BACK, ...cam } : { film: slide, ...cam });
      const bytes = new Uint8Array(px);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return [btoa(bin), lab.focusScale()];
    }, [BIG, NEUTRAL, BLUE, TEAL, TWO, BACK, plate, over, cam]);
    shots[name] = Buffer.from(b64, 'base64');
    shots.scales[name] = scale;
  };
  /*
    A dissolve (PLAN 51c) through the real pass at 256, the rack's share as
    the stage clocks hand it to the frame. What the swap changes at once is
    the dish's detail, finer than the melt: a slide of 160 dots, blue and
    amber on clear glass, until the middle, then another slide of as many
    dots of the same colours laid elsewhere, swapped at once. (A change of
    the palette over the whole plate is broader than any blur, and is not
    what a rack hides: the look fade carries it over the middle half.)
  */
  await lab.page.evaluate(async () => { await lab.create(128); lab.flush(); await lab.step(1); });
  /* `sh` the rack's share as the module's clock walks it (null: no rack and no dial at all, the plain plate). */
  const rack = async (name, sh, slide, depth = 1) => {
    const b64 = await lab.page.evaluate(async ([S, N, sh, slide, depth]) => {
      const c = new OffscreenCanvas(S, S), g = c.getContext('2d');
      let x = slide ? 1234567 : 7;
      const rnd = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
      g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = i % 2 ? 'hsl(220, 85%, 45%)' : 'hsl(35, 90%, 50%)';
        g.beginPath(); g.arc(rnd() * S, rnd() * S, 3 + 4 * rnd(), 0, 2 * Math.PI); g.fill();
      }
      const bytes = new Uint8Array(await lab.render(S, sh === null ? { ...N, filmMix: 1, markMix: 0 } : { ...N, filmMix: 1, markMix: 0, projRack: depth }, sh === null ? { film: c } : { film: c, rack: [sh, 0] }));
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [S, NEUTRAL, sh, slide, depth]);
    shots[name] = Buffer.from(b64, 'base64');
  };
  // A rack of one second on the module's own clock (lib/focusDissolve.ts), a frame each sixteenth of it.
  const clock = rackClock();
  startRack(clock, 0, 1, true, false);
  const shares = [];
  for (let i = 0; i <= FRAMES; i++) { walkRack(clock, (1000 * i) / FRAMES); shares.push(clock.share[0]); }
  for (let i = 0; i <= FRAMES; i++) await rack(`dis${i}`, shares[i], i < FRAMES / 2 ? 0 : 1);
  // The controls: the same swap on the plain plate (no rack, no dial: a cut), and racked only to the focus knob's melt, a tenth of the frame (the dial at MELT_DIAL).
  await rack('cutX', null, 0);
  await rack('cutY', null, 1);
  await rack('meltX', shares[FRAMES / 2 - 1], 0, MELT_DIAL);
  await rack('meltY', shares[FRAMES / 2], 1, MELT_DIAL);
  shots.scales = {};
  await big('bigSharp', 'slide', {});
  await big('bigMelt', 'keep', { projFocusA: 1 });
  await big('bigHalf', 'keep', { projFocusA: 1 }, { focusMax: 2 });
  await big('bigFull', 'keep', { projFocusA: 1 }, { focusMax: 1 });
  // A dissolve's glow at its widest: a box a quarter of the frame along the bar, drawn at an eighth.
  await big('bigGlow', 'keep', { projRack: 1 }, { rack: [1, 0] });
  // Two projectors, B melted beside a sharp A.
  await big('bigTwoA', 'two', { projCross: 0 });
  await big('bigTwoB', 'twoKeep', { projCross: 1 });
  await big('bigTwoAmeltB', 'twoKeep', { projCross: 0, projFocusB: 1 });
  await big('bigTwoBmelt', 'twoKeep', { projCross: 1, projFocusB: 1 });
  await big('bigTwoMid', 'twoKeep', { projCross: 0.5, projFocusB: 1 });
} finally { await lab.close(); }

const lin = (v) => Math.pow(Math.max(0, v) / 255, 2.2);
const disp = (l) => 255 * Math.pow(Math.max(0, l), 1 / 2.2);
const maxDiff = (a, b) => { let m = 0; for (let k = 0; k < a.length; k++) if (k % 4 !== 3) m = Math.max(m, Math.abs(a[k] - b[k])); return m; };
const meanLin = (img) => { let s = 0, n = 0; for (let k = 0; k < img.length; k++) if (k % 4 !== 3) { s += lin(img[k]); n++; } return s / n; };

/* The law's box over a picture, in linear light: half-widths hx, hy pixels, each pixel weighed by how much of it the box covers, the frame's edge held (as the sampler clamps). */
function boxed(img, hx, hy, S = img.length === 4 * BIG * BIG ? BIG : 256) {
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
function edgeWidth(img, axis, S = img.length === 4 * BIG * BIG ? BIG : 256) {
  const at = (i) => { const x = axis === 'x' ? i : S / 2, y = axis === 'x' ? S / 2 : i; return img[(y * S + x) * 4]; };
  const lo = at(S / 2), hi = at(Math.round(S * 0.18));
  const cross = (t) => { const v = hi + (lo - hi) * t; for (let i = Math.round(S * 0.18); i < S / 2; i++) { const a = at(i), b = at(i + 1); if ((a - v) * (b - v) <= 0 && a !== b) return i + (v - a) / (b - a); } return NaN; };
  return cross(0.9) - cross(0.1);
}
const boxOf = (k, hb = false, size = S) => { const b = new Float32Array(4); focusBoxPx(b, hb ? { projFocusB: k } : { projFocusA: k }, hb, size, 1); return hb ? [b[2], b[3]] : [b[0], b[1]]; };

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

// ── 5. Dimmed after the add, and into a texture ──────────────────────
{
  const mid = (A, Bs, M) => { let w = 0; for (let k = 0; k < M.length; k++) if (k % 4 !== 3) w = Math.max(w, Math.abs(M[k] - disp(0.5 * lin(A[k]) + 0.5 * lin(Bs[k])))); return w; };
  const worst = mid(shots.litA, shots.litBsoft, shots.litMid);
  // The lit wall is dimmer than the plain one somewhere (the control: else the case is the one above).
  const dimmed = meanLin(shots.litA) < meanLin(shots.twoA) * 0.97;
  check('with the lamp\'s hot-spot and the dish\'s rims up, the crossfade\'s middle is still half of A sharp plus half of B soft in linear light, within 1% of the lamp',
    worst <= 2.6 && dimmed, `worst ${f2(worst)} levels; the lit wall's light ${f3(meanLin(shots.litA))} against ${f3(meanLin(shots.twoA))}`);
  const [hx, hy] = boxOf(0.5);
  const flipErr = edgeAbs(shots.flipSoft, boxed(shots.flipSharp, hx, hy), shots.flipSharp, boxed(shots.flipSharp, hx, hy));
  const flipMoved = edgeAbs(shots.flipSoft, shots.flipSharp, shots.flipSharp, boxed(shots.flipSharp, hx, hy));
  check('drawn into a texture (flipped, as for the camera or a projector), racked is the sharp picture through the same box, the right way up',
    flipErr < 2 && flipMoved > 3 * flipErr, `off the box ${f2(flipErr)} levels, sharp ${f2(flipMoved)}`);
}

// ── 6. A melt drawn at a smaller picture (PLAN 51b-3) ────────────────
{
  const sc = shots.scales;
  const [hx, hy] = boxOf(1, false, BIG);
  const want = boxed(shots.bigSharp, hx, hy);
  const read = (name) => {
    const got = shots[name];
    const err = edgeAbs(got, want, shots.bigSharp, want), errSharp = edgeAbs(got, shots.bigSharp, shots.bigSharp, want);
    const wx = edgeWidth(got, 'x'), wy = edgeWidth(got, 'y'), wantX = edgeWidth(want, 'x'), wantY = edgeWidth(want, 'y');
    const widthOff = Math.max(Math.abs(wx - wantX) / wantX, Math.abs(wy - wantY) / wantY);
    const light = Math.abs(meanLin(got) - meanLin(shots.bigSharp)) / meanLin(shots.bigSharp);
    return { err, errSharp, widthOff, light, line: `${name.slice(3).toLowerCase()} (drew at ${sc[name]}): off the box ${f2(err)} levels (sharp ${f2(errSharp)}), edge ${f2(wx)}/${f2(wy)} px against ${f2(wantX)}/${f2(wantY)}, light ${(100 * light).toFixed(3)}%` };
  };
  const q = read('bigMelt'), h = read('bigHalf'), full = read('bigFull');
  const good = (r) => r.err < 2 && r.errSharp > 3 * r.err && r.widthOff < 0.1 && r.light < 0.01;
  const vsFull = Math.max(meanAbs(shots.bigMelt, shots.bigFull), meanAbs(shots.bigHalf, shots.bigFull));
  check(`a melt on a ${BIG} frame (a box ${f2(2 * hx)} by ${f2(2 * hy)} pixels) drawn at a quarter and, forced, at a half is the sharp picture through the law's bar: within 2 levels where it moves anything, edges within 10%, the light within 1%, and within a level on average of the same melt drawn at full size; the pass says the scale it drew at`,
    sc.bigMelt === 4 && sc.bigHalf === 2 && sc.bigFull === 1 && good(q) && good(h) && vsFull < 1,
    `${[q.line, h.line, full.line].join('; ')}; against the full-size melt ${f2(vsFull)} levels on average`);
  {
    const g = new Float32Array(4); focusBoxPx(g, { projRack: 1 }, false, BIG, 1, [1, 0]);
    const wantG = boxed(shots.bigSharp, g[0], g[1]);
    const errG = edgeAbs(shots.bigGlow, wantG, shots.bigSharp, wantG), sharpG = edgeAbs(shots.bigGlow, shots.bigSharp, shots.bigSharp, wantG);
    const lightG = Math.abs(meanLin(shots.bigGlow) - meanLin(shots.bigSharp)) / meanLin(shots.bigSharp);
    check(`a dissolve's glow on a ${BIG} frame (a box ${f2(2 * g[0])} by ${f2(2 * g[1])} pixels) drawn at an eighth is the sharp picture through the law's bar within 2 levels where it moves anything, the light within 1%`,
      sc.bigGlow === 8 && errG < 2 && sharpG > 3 * errG && lightG < 0.01, `drew at ${sc.bigGlow}; off the box ${f2(errG)} levels (sharp ${f2(sharpG)}); light ${(100 * lightG).toFixed(3)}%`);
  }
  // B melted beside a sharp A: A untouched (it is not taken down), B's melt drawn small and boxed.
  const [bx, by] = boxOf(1, true, BIG);
  const wantB = boxed(shots.bigTwoB, bx, by);
  const errB = edgeAbs(shots.bigTwoBmelt, wantB, shots.bigTwoB, wantB), sharpB = edgeAbs(shots.bigTwoBmelt, shots.bigTwoB, shots.bigTwoB, wantB);
  const keptA = maxDiff(shots.bigTwoAmeltB, shots.bigTwoA);
  let worst = 0;
  for (let k = 0; k < shots.bigTwoMid.length; k++) if (k % 4 !== 3) worst = Math.max(worst, Math.abs(shots.bigTwoMid[k] - disp(0.5 * lin(shots.bigTwoA[k]) + 0.5 * lin(shots.bigTwoBmelt[k]))));
  check(`two projectors on a ${BIG} frame, B melted beside a sharp A: drawn at a quarter, A stays sharp to the dither, B is its box, and the crossfade's middle is half of each in linear light within 1% of the lamp`,
    sc.bigTwoAmeltB === 4 && sc.bigTwoBmelt === 4 && keptA <= 1 && errB < 2 && sharpB > 3 * errB && worst <= 2.6,
    `scales ${sc.bigTwoAmeltB}/${sc.bigTwoBmelt}; A ${keptA} levels from sharp; B off its box ${f2(errB)} (sharp ${f2(sharpB)}); the middle's worst ${f2(worst)} levels`);
  // The law's choice of scale, at the sizes that matter (a 1600 frame, the Air's).
  const at = (k, two = false, kb = 0) => { const b = new Float32Array(4); focusBoxPx(b, { projFocusA: k, projFocusB: kb }, two, 1600, 1); return focusScale(b, two); };
  const glowAt = (two) => { const b = new Float32Array(4); focusBoxPx(b, { projRack: 1 }, two, 1600, 1, [1, 1]); return focusScale(b, two); };
  const choice = [at(0), at(0.25), at(0.5), at(1), at(1, true, 1), at(1, true, 0), at(1, true, 0.25), glowAt(false), glowAt(true)];
  // And a 2560 frame's glow, where at an eighth its 32 taps a row would lie 2.5 small pixels apart: a sixteenth, 20 small pixels.
  const wide = new Float32Array(4); focusBoxPx(wide, { projRack: 1 }, false, 2560, 1, [1, 0]);
  const wideScale = focusScale(wide, false);
  // Where the focus pass draws at all: not under the lens pass (Glitter, the side lamp) or the tank, where a dissolve would be a plain fade.
  const draws = [focusDraws({}), focusDraws({ glitter: 0.3 }), focusDraws({ sideLight: 0.5 }), focusDraws({ tank: 0.6 })];
  check('the scale for a 1600 frame: sharp, a quarter rack and the rack\'s end at full size; a melt at a quarter, two melts at a quarter, a melt beside a sharp one at a quarter, a melt beside a soft one at full size; a dissolve\'s glow, one or two, at a sixteenth (an eighth on the lab\'s 1024), and on a 2560 frame too, its taps under two small pixels apart; the pass draws but under Glitter, the side lamp and the tank',
    choice.join() === [1, 1, 1, 4, 4, 4, 1, 16, 16].join() && wideScale === 16 && wide[0] / 16 <= 31 && draws.join() === 'true,false,false,false',
    `${choice.join(', ')}; 2560's glow at ${wideScale} (half-width ${f2(wide[0] / wideScale)} small pixels); draws ${draws.join(', ')}`);
}

// ── 8. A dissolve through the real pass (PLAN 51c) ───────────────────
{
  const lum = (img, k) => 0.2126 * img[k] + 0.7152 * img[k + 1] + 0.0722 * img[k + 2];
  /* The Laplacian's variance (the watch skill's sharpness), on 4 by 4 pixel means: one pixel's own is the finish's dither once the picture is soft, a floor with no minimum to find. */
  const B = 4, M = S / B;
  const sharpness = (img) => {
    const m = new Float64Array(M * M);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) m[((y / B) | 0) * M + ((x / B) | 0)] += lum(img, (y * S + x) * 4) / (B * B);
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < M - 1; y++) for (let x = 1; x < M - 1; x++) {
      const k = y * M + x;
      const v = 4 * m[k] - m[k - 1] - m[k + 1] - m[k - M] - m[k + M];
      s += v; s2 += v * v; n++;
    }
    return s2 / n - (s / n) ** 2;
  };
  const sh = [];
  for (let i = 0; i <= FRAMES; i++) sh.push(sharpness(shots[`dis${i}`]));
  const swap = FRAMES / 2;
  const eps = 1e-6 * Math.max(...sh);
  let down = true, up = true;
  for (let i = 0; i < swap - 1; i++) down = down && sh[i + 1] <= sh[i] + eps;
  for (let i = swap; i < FRAMES; i++) up = up && sh[i + 1] >= sh[i] - eps;
  const min = sh.indexOf(Math.min(...sh));
  const atSwap = meanAbs(shots[`dis${swap - 1}`], shots[`dis${swap}`]);
  const cut = meanAbs(shots.cutX, shots.cutY);
  const ends = maxDiff(shots.dis0, shots.cutX) === 0 && maxDiff(shots[`dis${FRAMES}`], shots.cutY) === 0;
  const atMelt = meanAbs(shots.meltX, shots.meltY);
  check('a dissolve through the real pass, the dish\'s detail swapped at once at the rack\'s middle: the frame\'s sharpness falls to one minimum at the swap and climbs back, the swap moves the frame by under a third of the same swap sharp (a cut), where racked only to the focus knob\'s melt it does not; before and after the rack, as its clock walks it, the plate is the plain plate with no dissolve to the byte',
    down && up && (min === swap - 1 || min === swap) && atSwap < cut / 3 && atMelt > cut / 3 && ends,
    `sharpness ${sh.map(v => v.toFixed(2)).join(' ')}; least at frame ${min} of ${FRAMES}; the swap ${f2(atSwap)} levels on average against a cut's ${f2(cut)} (${(100 * atSwap / cut).toFixed(0)}%); racked only to the knob's melt (the control) ${f2(atMelt)} (${(100 * atMelt / cut).toFixed(0)}%)`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} focus checks passed`);
process.exit(failed ? 1 : 0);
