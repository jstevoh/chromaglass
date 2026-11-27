#!/usr/bin/env node
/**
 * The projector bank (PLAN 51a): each projector's lamp dims like a real lamp,
 * its shutter dims the whole picture evenly, and two projectors add in
 * linear light through an A/B crossfade that keeps the wall's light flat.
 *
 *   npm run projectors      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was asked. The owner watched Liquid Light Lab's films (2026-11-27):
 * "a lot of the show dynamics comes from blending the surfaces dynamically".
 * A show is two to four projectors on one wall, each with a variac on its
 * lamp and a shutter, mixed by hand. The plate had two plates whose light
 * could add, each lamp halved, added in display values, with nothing to ride.
 *
 * Asked first of the laws on their own (lib/projectorBank.ts), from numbers
 * that do not come from that file, then of the real plate shader on lab
 * plates:
 *
 *   0. the laws: a lamp at 75% of its voltage gives 0.75^3.4 = 0.376 of its
 *      light and 3200 × 0.75^0.42 = 2836 K; the lamp's colour keeps the flux
 *      law's luminance and is warmer (red over blue up) as it dims, cooler
 *      past 100%; the share of a round pupil a straight vane leaves open is
 *      the circular segment (read against a Monte Carlo count of the disc);
 *      the crossfade's two weights sum to one everywhere; a vane walks a
 *      full travel in 80 ms and no faster, on the stage's clocks;
 *   1. at the default the bank multiplies nothing: a plate with the bank's
 *      settings written at their defaults is the plate with them left out,
 *      to the byte (one projector and two);
 *   2. a lamp dimmed to 0.6 on one projector: every clear-glass pixel is the
 *      default's times the lamp's colour at 0.6 to 1/2.2 (display values),
 *      channel by channel, so the white point moved warm by the law's amount,
 *      and blue fell more than red;
 *   3. a shutter half across dims the whole picture evenly: the ratio to the
 *      open picture is 0.5^(1/2.2) everywhere lit, and the same at the frame's
 *      edge as at its middle (no wipe, the vane is at the pupil);
 *   4. two projectors add in linear light: the wall at the crossfade's centre
 *      is half of A alone plus half of B alone, in linear light, within 1%
 *      of the lamp; the same sum in display values (the old way) is the
 *      control, and misses;
 *   5. the crossfade is linear in light: across its travel the wall's mean
 *      light is (1 − x) of A's plus x of B's within 2%, and on a bare lamp
 *      it is flat within 2% (an equal-power curve, the control, brightens
 *      the middle by 41%).
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';
import { BLUE, TEAL } from './lampcontrol.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const f3 = (v) => v.toFixed(3), f2 = (v) => v.toFixed(2);

const out = 'node_modules/.cache/projector-bank.mjs';
await build({
  stdin: { contents: "export * from './src/lib/projectorBank.ts'; export { stageClocks, turnClocks } from './src/lib/stageClocks.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { DRIFTABLE } from './src/lib/drift.ts'; export { RIG_KEYS } from './src/lib/lookFade.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const bank = await import(`../${out}`);
const { lampFlux, lampKelvinAt, lampColour, vaneOpen, crossfadeWeights, walkShutters, SHUTTER_SECONDS, stageClocks, turnClocks, projectorGains, bankHasTwo, DEFAULT_SETTINGS, DRIFTABLE, RIG_KEYS } = bank;
const BANK_KEYS = ['projLampA', 'projLampB', 'projShutterA', 'projShutterB', 'projCross'];
const lumOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// ── 0. The laws, from outside their file ─────────────────────────────
{
  const flux = [Math.abs(lampFlux(0.75) - 0.3762), Math.abs(lampFlux(0.5) - 0.0947), Math.abs(lampFlux(4 / 3) - 2.6595)];
  const kelvin = Math.abs(lampKelvinAt(0.75) - 2836) + Math.abs(lampKelvinAt(0.5) - 2391);
  const dim = lampColour(0.6), over = lampColour(1.25);
  const keepsFlux = Math.abs(lumOf(dim) - lampFlux(0.6)) / lampFlux(0.6);
  const warmer = dim[0] / dim[2] > 1.2, cooler = over[0] / over[2] < 0.95;
  // The segment by Monte Carlo: points in the unit disc right of an edge at e = 2t − 1.
  let worstVane = 0;
  for (const t of [0.1, 0.25, 0.5, 0.8]) {
    let inside = 0, open = 0, seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 400000; k++) {
      const x = 2 * rnd() - 1, y = 2 * rnd() - 1;
      if (x * x + y * y > 1) continue;
      inside++; if (x > 2 * t - 1) open++;
    }
    worstVane = Math.max(worstVane, Math.abs(open / inside - vaneOpen(t)));
  }
  const ends = vaneOpen(0) === 1 && vaneOpen(1) === 0;
  const sums = [0, 0.13, 0.5, 0.77, 1].every(x => { const [a, b] = crossfadeWeights(x); return Math.abs(a + b - 1) < 1e-12; });
  // The vane's walk: shut from open in 80 ms, and halfway at 40 ms.
  const travel = new Float32Array(2);
  walkShutters(travel, { projShutterA: 1 }, SHUTTER_SECONDS / 2);
  const half = travel[0];
  walkShutters(travel, { projShutterA: 1 }, SHUTTER_SECONDS / 2 + 1e-6);
  const shut = travel[0];
  const clocks = stageClocks(); turnClocks(clocks, 0.02, { projShutterB: 1 });
  check('the laws, from outside their file: flux v^3.4, temperature v^0.42, the colour at the flux, the vane\'s segment, the crossfade sums to one, 80 ms a travel',
    flux.every(e => e < 0.001) && kelvin < 2 && keepsFlux < 1e-6 && warmer && cooler && worstVane < 0.004 && ends && sums
      && Math.abs(half - 0.5) < 1e-6 && shut === 1 && Math.abs(clocks.shutters[1] - 0.25) < 1e-6,
    `flux off ${flux.map(f3).join('/')}; kelvin off ${f2(kelvin)}; at 0.6 r/b ${f2(dim[0] / dim[2])}, at 1.25 ${f2(over[0] / over[2])}; vane worst ${worstVane.toFixed(4)}; walk ${f3(half)} at 40 ms, ${shut} at 80, the stage clock's B ${f3(clocks.shutters[1])} at 20 ms`);
}

// ── 1a. The defaults, in numbers, and the bank is the rig's ──────────
/*
  Why one projector at the defaults is today's plate: the gains it hands the
  shader are exactly 1, 1, 1 (and B's 1, unused), so the display's multiply
  by projA changes no bit. With two projectors each is 0.5 to 1/2.2, the
  crossfade's centre. And the bank is the operator's: a look change leaves it
  (RIG_KEYS) and Evolve never wanders it (a wandered lamp is the wall amber or
  overdriven: the pre-push review found it driftable).
*/
{
  const one = new Float32Array(8), two = new Float32Array(8);
  projectorGains(one, DEFAULT_SETTINGS, false);
  projectorGains(two, DEFAULT_SETTINGS, true);
  const exact = [1, 1, 1, 0, 1, 1, 1, 0].every((v, i) => one[i] === v);
  const half = Math.pow(0.5, 1 / 2.2);
  const centre = [0, 1, 2, 4, 5, 6].every(i => Math.abs(two[i] - half) < 1e-6) && two[3] === 1;
  const wandered = BANK_KEYS.filter(k => DRIFTABLE.includes(k));
  const rig = BANK_KEYS.filter(k => !RIG_KEYS.has(k));
  const asks = bankHasTwo({ twoProjectors: 1, backBlend: 'own' }, 2, 1) && !bankHasTwo({ twoProjectors: 1, backBlend: 'screen' }, 2, 1)
    && !bankHasTwo({ twoProjectors: 1 }, 1, 1) && !bankHasTwo({ twoProjectors: 1 }, 2, 0) && !bankHasTwo({ twoProjectors: 0 }, 2, 1);
  check('at the defaults one projector\'s gains are exactly 1, two are each at half; the bank is the rig\'s, never wandered; two only where the shader adds them',
    exact && centre && wandered.length === 0 && rig.length === 0 && asks,
    `one ${Array.from(one).join(',')}; two ${Array.from(two).map(f3).join(',')}; driftable ${wandered.join(',') || 'none'}; not rig ${rig.join(',') || 'none'}; bankHasTwo ${asks ? 'as the shader' : 'wrong'}`);
}

// ── The plates ───────────────────────────────────────────────────────
const S = 128;
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0,
  microDroplets: 0, thinFilm: 0, lampWarmth: 0, dishVignette: 0, lampHotspot: 0, lampGround: 1 };
const DEFAULTS = { projLampA: 1, projLampB: 1, projShutterA: 0, projShutterB: 0, projCross: 0.5 };
const TWO = { layerCount: 2, twoProjectors: 1 };
const BACK = { backPlate: true, backRotation: Math.PI };

const lab = await openLab();
let shots;
try {
  shots = await lab.page.evaluate(async ([S, N, D, TWO, BACK, BLUE, TEAL]) => {
    const r = (over, cam = {}) => lab.render(S, { ...N, ...over }, cam);
    const o = {};
    // A pool of blue off the middle and a smaller teal one: the back plate, turned half round, lays them elsewhere.
    await lab.create(128); lab.dye(0.38, 0.5, 0.17, BLUE, 0.6); lab.dye(0.62, 0.36, 0.1, TEAL, 0.8); lab.flush(); await lab.step(1);
    o.one = await r({});
    o.oneDefaults = await r({ ...D });
    // Truly left out: undefined survives the spread here, so the plate's own fallbacks (?? 1) run.
    o.oneUnset = await r(Object.fromEntries(Object.keys(D).map(k => [k, undefined])));
    // The positive control: a lamp a half percent down must move a level, or byte-equality above proves nothing.
    o.oneNudge = await r({ projLampA: 0.995 });
    o.oneDim = await r({ projLampA: 0.6 });
    o.oneShut = await r({ projShutterA: 0.5 });
    o.two = await r({ ...TWO }, BACK);
    o.twoDefaults = await r({ ...TWO, ...D }, BACK);
    for (const x of [0, 0.25, 0.5, 0.75, 1]) o[`cross${x}`] = await r({ ...TWO, projCross: x }, BACK);
    // The back plate on a blend of its own: the shader lays it by that blend and adds no second beam, so the crossfade must do nothing.
    o.screen0 = await r({ ...TWO, backBlend: 'screen', projCross: 0 }, BACK);
    o.screen1 = await r({ ...TWO, backBlend: 'screen', projCross: 1 }, BACK);
    // A bubble on the front plate, the crossfade at B: the bubble passes B's light, which never met the front plate.
    {
      const N = 128, x = 0.3, y = 0.5;
      await lab.create(N); lab.flush(); await lab.step(2);
      lab.solver().setBubbles(new Float32Array([x, y, 14 / N, 1]), 1, 0.05, new Float32Array(4));
      await lab.step(2);
      const cam = { ...BACK, bubbles: 1, cx: x, cy: y, zoom: 1, macroAmount: 0 };
      o.bubbleB = await r({ ...TWO, projCross: 1 }, cam);
      o.bubbleA = await r({ ...TWO, projCross: 0 }, cam);
      o.bubbleDark = await r({ ...TWO, projCross: 1, projShutterB: 1 }, cam);
      // The same frame with the bubble's drawing off: that the bubble is drawn at all (its rim, in the plate's own band).
      o.bubbleOff = await r({ ...TWO, projCross: 1 }, { ...cam, bubbles: 0, airField: true });
      o.bubbleOffA = await r({ ...TWO, projCross: 0 }, { ...cam, bubbles: 0, airField: true });
    }
    await lab.create(128); lab.flush(); await lab.step(1);
    for (const x of [0, 0.5, 1]) o[`bare${x}`] = await r({ ...TWO, projCross: x }, BACK);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.from(v)]));
  }, [S, NEUTRAL, DEFAULTS, TWO, BACK, BLUE, TEAL]);
} finally { await lab.close(); }

const lin = (v) => Math.pow(Math.max(0, v) / 255, 2.2);
const each = (img, fn) => { for (let k = 0; k < img.length; k += 4) fn(k); };
const meanLin = (img) => { let s = 0, n = 0; each(img, k => { for (let c = 0; c < 3; c++) { s += lin(img[k + c]); n++; } }); return s / n; };

// ── 1. The defaults multiply nothing ─────────────────────────────────
{
  let worst = 0;
  for (const [a, b] of [['one', 'oneDefaults'], ['one', 'oneUnset'], ['two', 'twoDefaults'], ['two', 'cross0.5']]) {
    for (let k = 0; k < shots[a].length; k++) worst = Math.max(worst, Math.abs(shots[a][k] - shots[b][k]));
  }
  let nudged = 0; for (let k = 0; k < shots.one.length; k++) nudged = Math.max(nudged, Math.abs(shots.one[k] - shots.oneNudge[k]));
  let lit = 0; each(shots.one, k => { if (shots.one[k] > 200) lit++; });
  check('at its defaults the bank multiplies nothing: written out, left out (the fallbacks) or the default, the same plate to the byte, one projector and two; a lamp at 99.5% moves it',
    worst === 0 && nudged >= 1 && lit > S * S / 4, `worst ${worst} levels; at 99.5% ${nudged} levels; ${lit} clear-glass pixels`);
}

// ── 2. A dimmed lamp ─────────────────────────────────────────────────
{
  const want = lampColour(0.6).map(v => Math.pow(v, 1 / 2.2));
  let worst = 0, n = 0;
  const ratio = [0, 0, 0];
  each(shots.one, k => {
    if (shots.one[k] < 200 || shots.one[k + 1] < 200 || shots.one[k + 2] < 200) return;   // clear glass: the lamp itself
    for (let c = 0; c < 3; c++) {
      const got = shots.oneDim[k + c] / shots.one[k + c];
      ratio[c] += got; worst = Math.max(worst, Math.abs(got - want[c]));
    }
    n++;
  });
  const r = ratio.map(v => v / Math.max(1, n));
  check('a lamp at 0.6 dims and warms by the law: the clear glass is the lamp\'s colour at 0.6, channel by channel, blue down more than red',
    n > 200 && worst < 0.012 && r[2] < r[0] - 0.05, `${n} pixels; got ${r.map(f3).join('/')}, the law ${want.map(f3).join('/')}, worst ${f3(worst)}`);
}

// ── 3. A shutter half across ─────────────────────────────────────────
{
  const want = Math.pow(0.5, 1 / 2.2);
  let worst = 0, n = 0, edge = 0, ne = 0, mid = 0, nm = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = (j * S + i) * 4;
    for (let c = 0; c < 3; c++) {
      if (shots.one[k + c] < 120) continue;
      const g = shots.oneShut[k + c] / shots.one[k + c];
      worst = Math.max(worst, Math.abs(g - want)); n++;
      if (i < 12 || i >= S - 12) { edge += g; ne++; } else if (Math.abs(i - S / 2) < 12) { mid += g; nm++; }
    }
  }
  const e = edge / Math.max(1, ne), m = mid / Math.max(1, nm);
  check('a shutter half across dims the whole picture evenly: every lit pixel at half the light, the frame\'s edge as its middle',
    n > 1000 && ne > 50 && nm > 50 && worst < 0.012 && Math.abs(e - m) < 0.005, `want ${f3(want)}; worst off ${f3(worst)}; edge ${f3(e)}, middle ${f3(m)}`);
}

// ── 4. Two projectors add in linear light ────────────────────────────
{
  let err = 0, errDisplay = 0, n = 0, differ = 0;
  for (let k = 0; k < shots.two.length; k++) {
    if (k % 4 === 3) continue;
    const a = shots['cross0'][k], b = shots['cross1'][k], got = shots['cross0.5'][k];
    const want = 255 * Math.pow(0.5 * lin(a) + 0.5 * lin(b), 1 / 2.2);
    const old = 0.5 * (a + b);
    err = Math.max(err, Math.abs(got - want)); errDisplay += Math.abs(got - old); n++;
    if (Math.abs(a - b) > 60) differ++;
  }
  check('two projectors add in linear light: the centre is half of A alone plus half of B alone, within 1% of the lamp; the old display-value sum misses',
    differ > 200 && err <= 2.6 && errDisplay / n > 3, `worst ${f2(err)} levels; the display-value sum off by ${f2(errDisplay / n)} on average; ${differ} values where A and B differ by 60+`);
}

// ── 5. The crossfade is linear in light ──────────────────────────────
{
  const a = meanLin(shots['cross0']), b = meanLin(shots['cross1']);
  let worst = 0;
  for (const x of [0.25, 0.5, 0.75]) worst = Math.max(worst, Math.abs(meanLin(shots[`cross${x}`]) - ((1 - x) * a + x * b)) / ((1 - x) * a + x * b));
  const bare = [0, 0.5, 1].map(x => meanLin(shots[`bare${x}`]));
  const flat = (Math.max(...bare) - Math.min(...bare)) / Math.max(...bare);
  const equalPower = 2 * Math.cos(Math.PI / 4);   // cos + sin at the centre, against 1 at an end
  check('the crossfade is linear in light: the wall\'s mean is (1 − x) of A plus x of B within 2%, and a bare lamp stays flat within 2% (equal power would lift the middle 41%)',
    worst < 0.02 && flat < 0.02 && a > 0.05 && b > 0.05, `worst ${(100 * worst).toFixed(2)}%; bare lamp ${bare.map(f3).join('/')} (${(100 * flat).toFixed(2)}% spread); equal power ${f2(equalPower)}×`);
}

// ── 6. No B, no crossfade; and a bubble passes B's light ─────────────
{
  let worst = 0; for (let k = 0; k < shots.screen0.length; k++) worst = Math.max(worst, Math.abs(shots.screen0[k] - shots.screen1[k]));
  const lit = meanLin(shots.screen1);
  check('with the back plate on a blend of its own there is no B: the crossfade moves nothing and the wall stays lit',
    worst === 0 && lit > 0.2, `worst ${worst} levels between A and B; the wall's mean ${f3(lit)}`);
}
{
  // The bubble is at the frame's centre (the camera is on it); its middle against a ring round it at twice its radius.
  const at = (img, i, j) => { const k = (j * S + i) * 4; return (lin(img[k]) + lin(img[k + 1]) + lin(img[k + 2])) / 3; };
  const mid = (img) => { let v = 0, n = 0; for (let j = S / 2 - 3; j < S / 2 + 3; j++) for (let i = S / 2 - 3; i < S / 2 + 3; i++) { v += at(img, i, j); n++; } return v / n; };
  const ring = (img) => { let v = 0, n = 0; for (let a = 0; a < 64; a++) { const t = a / 64 * 2 * Math.PI; const i = Math.round(S / 2 + Math.cos(t) * S * 0.2), j = Math.round(S / 2 + Math.sin(t) * S * 0.2); v += at(img, i, j); n++; } return v / n; };
  const b = mid(shots.bubbleB) / Math.max(1e-6, ring(shots.bubbleB)), a = mid(shots.bubbleA) / Math.max(1e-6, ring(shots.bubbleA));
  const dark = Math.max(mid(shots.bubbleDark), ring(shots.bubbleDark));
  // A bubble belongs to the front plate: with the front projector faded out it is not on the wall at all, and with it in, it is.
  const diff = (p, q) => { let m = 0, sum = 0, n = 0; for (let k = 0; k < p.length; k++) { if (k % 4 === 3) continue; const d = Math.abs(p[k] - q[k]); m = Math.max(m, d); sum += d; n++; } return { m, mean: sum / n }; };
  const atB = diff(shots.bubbleB, shots.bubbleOff), atA = diff(shots.bubbleA, shots.bubbleOffA);
  const drawn = atA.m;
  /*
    What the owner would see: no black disc where a bubble is, at either end
    of the crossfade (the pre-push review's worry, for a bubble lit by A's
    lamp alone over B's picture). On the lab's projector view the bubble is
    drawn the same at both ends, its middle as bright as the wall round it.
    This line holds that outcome; it does not single out onWall (with onWall
    returning its input the line still passes on this view, measured
    2026-11-27), which is there for the paths that do light by lampBg after
    the back plate (the closeup's pocket, camBounce).
  */
  check('a bubble on the front plate is no black disc at the crossfade\'s B end: its middle as bright as the wall round it, drawn as at A; with B shut, dark',
    b > 0.85 && a > 0.85 && dark < 0.01 && ring(shots.bubbleB) > 0.3 && drawn >= 20 && Math.abs(atB.mean - atA.mean) < 1,
    `middle over the wall ${f3(b)} at B, ${f3(a)} at A; B shut ${f3(dark)}; drawn ${drawn} levels at most against it off, mean ${f2(atA.mean)} at A and ${f2(atB.mean)} at B`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} projector checks passed`);
process.exit(failed ? 1 : 0);
