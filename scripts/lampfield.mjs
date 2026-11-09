#!/usr/bin/env node
/**
 * The projector lights the stage the way its optics do (PLAN 38a).
 *
 *   npm run lampfield      (the lab: any adapter that computes, so a cloud session too)
 *
 * What was found: the hot-spot was a Gaussian painted over the finished
 * picture, lifting the middle to 1.25 of the lamp, a second lamp multiplied
 * another on top, and both wandered by noise with Lamp Motion and the plate's
 * rock, so the whole frame's light slid about while the liquid stood still.
 * Now the Hot-Spot is the lamp lever of an overhead projector: off its mark,
 * the bulb's image misses the lens's aperture and the aperture clips the
 * bundles from the stage's edges (src/gpu/wgsl/lampField.ts has the optics).
 *
 * Asked here of the real plate shader, on a lab plate with no liquid on the
 * lamp ground (Lamp Ground 1), so every pixel is the lamp's light and nothing
 * the liquid does:
 *
 *   1. at Hot-Spot 0 the stage is lit evenly, and the Second Lamp does
 *      nothing there (on its mark, both bulbs' images are in the lens);
 *   2. it is the law: at Hot-Spot 0.5 and 1, each pixel over the even
 *      stage's, channel by channel, is lampField at that pixel's place on the
 *      stage in metres, the CPU twin of the shader's (the same file);
 *   3. nothing in it moves: the light the app's Lamp Motion and the plate's
 *      rock move, and the clock, changed, and the bare stage is the same to
 *      the byte;
 *   4. nothing is brighter than the lamp: no pixel of the stage at Hot-Spot 1
 *      above the even stage, and the axis at the lamp's full light, where the
 *      old Gaussian lifted it by a quarter;
 *   5. the condenser's colour: at Hot-Spot 1 the edge of the lit middle is
 *      coloured, blue against red by the law's amount, and not where the
 *      stage is fully lit or fully dark;
 *   (0. first, the law itself from outside its file: the overlap at known
 *      values, the bundle by ray trace, the dispersion from acrylic's
 *      indices, and the plan's corner number; and 2 also asks a zoomed,
 *      panned frame, which the closeup does)
 *   6. a second bulb adds light: white at the axis, and its side of the
 *      stage lit as the law says, which the same law with the bulb on the
 *      other side does not fit (so 2's match is not a radial profile that any
 *      second lamp would pass).
 *
 * The heat's half (the liquid lit evenly, so a dark pool heats the same at
 * the edge as in the middle) is a line in `npm run heat`.
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/lamp-field.mjs';
await build({
  stdin: { contents: "export * from './src/gpu/wgsl/lampField.ts';", resolveDir: '.', loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
const { lampField, pupilPass, STAGE_METRES, SECOND_BULB, CONDENSER_DISPERSION, LAMP_APERTURE, BULB_FILL, HOTSPOT_MISFOCUS } = await import(`../${out}`);
const f2 = (v) => v.toFixed(2), f3 = (v) => v.toFixed(3);

// ── 0. The law itself, from outside its file ─────────────────────────
/*
  The shader is read against lampField (2, 5, 6), and lampField and the
  shader share its constants and its form. So the law is pinned here first,
  from numbers that do not come from that file: the overlap of two circles
  at values found by a 2-million-sample Monte Carlo and in closed form (two
  unit circles a radius apart overlap 2/3 − √3/(2π) of one), the bundle's
  centre and radius by tracing rays, the dispersion from acrylic's indices,
  and the corner of a 16:9 frame at Hot-Spot 0.4 that the plan names.
*/
{
  const known = [[0.6, 0.5, 0.9314], [1, 0.9, 0.4019], [1, 1, 2 / 3 - Math.sqrt(3) / (2 * Math.PI)], [0.3, 0.6, 1], [2, 0.5, 0], [0.2, 1.5, 1 / 2.25]];
  const worst = Math.max(...known.map(([d, r, want]) => Math.abs(pupilPass(d, r) - want)));
  // Rays from a stage point x to two edges of the bulb's image (radius a at height z), crossed at the lens's height H.
  const H = 0.355, z = 0.45, a = 0.03, x = 0.05;
  const cross = (y) => x + (y - x) * H / z;
  const centre = (cross(a) + cross(-a)) / 2, radius = (cross(a) - cross(-a)) / 2, mu = 1 - H / z;
  const traced = Math.abs(centre - x * mu) + Math.abs(radius - a * (1 - mu));
  const nd = 1.4914, glass = [1.4892, 1.4935, 1.4978].map(n => -1.2 * (n - nd) / (nd - 1));
  const disp = Math.max(...glass.map((g, c) => Math.abs(g - CONDENSER_DISPERSION[c])));
  const corner = lampField(0.5 * 0.2 / 1.5 * (16 / 9) * 0.5625, 0.5 * 0.2 / 1.5 * 0.5625, 0.4, 0);
  check('the law, from outside its file: the aperture overlap at known values, the bundle by ray trace, the dispersion from acrylic, a wide corner at Hot-Spot 0.4',
    worst < 0.002 && traced < 1e-12 && disp < 1e-9 && corner.every(v => v > 0.89 && v < 0.94) && corner[2] > corner[0],
    `overlap worst ${worst.toFixed(4)} off; ray trace ${traced.toExponential(1)}; dispersion ${disp.toExponential(1)}; corner ${corner.map(f3).join('/')} (P ${LAMP_APERTURE} m, k ${BULB_FILL}, μ ${HOTSPOT_MISFOCUS} at 1)`);
}

const S = 96;
// Only the lamp's light: the plate's painted texture, grade and dish at their neutral values.
const NEUTRAL = { saturationBoost: 1, granulation: 0, boundaryContrast: 0, edgeRelief: 0, beads: 0, lacing: 0, cells: 0, glossiness: 0,
  microDroplets: 0, thinFilm: 0, lampWarmth: 0, dishVignette: 0, lampGround: 1 };

const lab = await openLab();
let shots;
try {
  shots = await lab.page.evaluate(async ([S, N]) => {
    const r = (over, cam = {}) => lab.render(S, { ...N, ...over }, cam);
    await lab.create(128); lab.flush(); await lab.step(1);
    const o = {};
    o.even = await r({ lampHotspot: 0 });
    o.evenSecond = await r({ lampHotspot: 0, secondLamp: 1 });
    o.half = await r({ lampHotspot: 0.5 });
    o.full = await r({ lampHotspot: 1 });
    o.fullSecond = await r({ lampHotspot: 0.7, secondLamp: 1 });
    o.nudge = await r({ lampHotspot: 0.01, secondLamp: 1 });
    o.both = await r({ lampHotspot: 1, secondLamp: 1 });
    o.zoomEven = await r({ lampHotspot: 0 }, { zoom: 1.5, cx: 0.6, cy: 0.45, macroAmount: 0 });
    o.zoom = await r({ lampHotspot: 0.8 }, { zoom: 1.5, cx: 0.6, cy: 0.45, macroAmount: 0 });
    o.even11 = await r({ lampHotspot: 0 }, { time: 11.3 });
    o.moved11 = await r({ lampHotspot: 0.7, secondLamp: 1, lampMotion: 1 }, { lamp: { x: 0.2, y: 0.8, x2: 0.85, y2: 0.15 }, time: 11.3 });
    o.movedLamp = await r({ lampHotspot: 0.7, secondLamp: 1, lampMotion: 1 }, { lamp: { x: 0.2, y: 0.8, x2: 0.85, y2: 0.15 } });
    o.even37 = await r({ lampHotspot: 0 }, { time: 37 });
    o.moved37 = await r({ lampHotspot: 0.7, secondLamp: 1, lampMotion: 1 }, { lamp: { x: 0.2, y: 0.8, x2: 0.85, y2: 0.15 }, time: 37 });
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.from(v)]));
  }, [S, NEUTRAL]);
} finally { await lab.close(); }

// ── Reading ───────────────────────────────────────────────────────────
/** A pixel's place on the stage in metres from the axis, y up: the shader's own step, on a square frame at zoom 1. */
const stageOf = (i, j, zoom = 1, cx = 0.5, cy = 0.5) =>
  [(((i + 0.5) / S - 0.5) / (1.5 * zoom) + cx - 0.5) * STAGE_METRES, ((0.5 - (j + 0.5) / S) / (1.5 * zoom) + cy - 0.5) * STAGE_METRES];
const px = (img, i, j) => { const k = (j * S + i) * 4; return [img[k], img[k + 1], img[k + 2]]; };
const all = []; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) all.push([i, j]);

/** How far the picture over the even stage is from the law, channel by channel, where the stage is lit. */
const fit = (img, hot, second, mirror = false, base = shots.even, cam = []) => {
  let worst = 0, sum = 0, n = 0;
  for (const [i, j] of all) {
    const ref = px(base, i, j), got = px(img, i, j);
    let [x, y] = stageOf(i, j, ...cam);
    if (mirror) { x = -x; y = -y; }
    const want = lampField(x, y, hot, second);
    for (let c = 0; c < 3; c++) {
      if (ref[c] < 60) continue;
      const e = Math.abs(got[c] / ref[c] - want[c]);
      worst = Math.max(worst, e); sum += e; n++;
    }
  }
  return { worst, mean: sum / Math.max(1, n) };
};

// ── 1. Even at 0 ─────────────────────────────────────────────────────
/*
  Read as means over a disc round the axis and the frame's four corners, not
  pixel by pixel: the plate lays film grain over everything every frame when
  no camera is on (up to 4 levels, clipped at white), which is not the lamp's
  and is 38h's to take off.
*/
{
  const r = (i, j) => Math.hypot((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5);
  const mean = (img, pts) => pts.reduce((a, [i, j]) => a + px(img, i, j).reduce((x, y) => x + y, 0) / 3, 0) / pts.length;
  const mid = all.filter(([i, j]) => r(i, j) < 0.1), corners = all.filter(([i, j]) => r(i, j) > 0.62);
  let diff = 0;
  for (let k = 0; k < shots.even.length; k++) diff = Math.max(diff, Math.abs(shots.even[k] - shots.evenSecond[k]));
  const [m, c] = [mean(shots.even, mid), mean(shots.even, corners)];
  // The control: the same reading sees the hot-spot when there is one.
  const [mh, ch] = [mean(shots.half, mid), mean(shots.half, corners)];
  /*
    Just past the shader's switch (Hot-Spot over 0.001), with both bulbs: no
    step where the law comes in, beyond the law's own there. That is not
    nothing: on its mark the lamp is in focus for yellow, and the condenser
    still puts blue's image 1.6% off, which moves the second bulb's share by
    a level or three across the frame. Hot-Spot 0 is the ideal projector.
  */
  let step = 0, lawStep = 0;
  for (const [i, j] of all) {
    const p = px(shots.even, i, j), q = px(shots.nudge, i, j), w = lampField(...stageOf(i, j), 0.001, 1);
    for (let c = 0; c < 3; c++) { step = Math.max(step, Math.abs(p[c] - q[c])); lawStep = Math.max(lawStep, Math.abs(1 - w[c]) * p[c]); }
  }
  check('at Hot-Spot 0 the bare stage is lit evenly, the Second Lamp does nothing there, and the law comes in without a step',
    m > 245 && Math.abs(m - c) <= 1 && diff === 0 && step <= lawStep + 1.5 && mh - ch > 10,
    `the middle ${f2(m)}, the corners ${f2(c)}; with the second lamp, at most ${diff} off; at Hot-Spot 0.01 with both bulbs ${step} levels, the law's own step ${f2(lawStep)}; at Hot-Spot 0.5 (the control) ${f2(mh)} and ${f2(ch)}`);
}

// ── 2. The law ───────────────────────────────────────────────────────
for (const [name, hot] of [['half', 0.5], ['full', 1]]) {
  const f = fit(shots[name], hot, 0);
  // The control: the law at a different lever, which a picture that only "falls toward the corners" might also be near.
  const g = fit(shots[name], hot * 0.7, 0);
  check(`at Hot-Spot ${hot} each pixel over the even stage is the lamp lever's aperture law there, channel by channel`,
    f.worst <= 0.03 && f.mean <= 0.006 && g.mean > 3 * f.mean,
    `worst ${f3(f.worst)}, mean ${f3(f.mean)}; the law at Hot-Spot ${f2(hot * 0.7)} (the control) mean ${f3(g.mean)}`);
}
/*
  The camera's zoom and pan: the closeup pans over the plate, and the light
  is the stage's, so a frame at 1.5x centred at (0.6, 0.45) is the law at the
  stage points it shows. The control: the same frame read as if it were not
  zoomed or panned. The lab draws square frames only, so the frame's aspect
  (the shader's max of the two sides) is not asked here. The closeup is held
  off (macroAmount 0): at 1.5x the app eases the closeup half in, and with it
  the dark side of a bare stage read up to 0.07 of the lamp brighter than the
  law (every off pixel brighter, none darker), the closeup's own drawing over
  the lamp's light. What in it does that is not traced here.
*/
{
  const cam = [1.5, 0.6, 0.45];
  const f = fit(shots.zoom, 0.8, 0, false, shots.zoomEven, cam), g = fit(shots.zoom, 0.8, 0, false, shots.zoomEven);
  check('zoomed 1.5x and panned, each pixel is the law at the stage point it shows, not at the plate point',
    f.worst <= 0.03 && f.mean <= 0.006 && g.mean > 3 * f.mean,
    `worst ${f3(f.worst)}, mean ${f3(f.mean)}; read as unzoomed (the control) mean ${f3(g.mean)}`);
}

// ── 3. Still ─────────────────────────────────────────────────────────
/*
  The light the gloss is lit from moved, at the same clock: the same to the
  byte. Then the clock moved 11.3 s and 37 s as well: the film grain is
  redrawn (1), so each frame is read against its own even stage, and must
  still be the law. In the lab the light is moved by hand (cam.lamp): Lamp
  Motion's drift is the app's frame loop, which the lab does not run; with
  Glossiness 0 nothing else on a bare stage reads that light.
*/
{
  let diff = 0;
  for (let k = 0; k < shots.movedLamp.length; k++) diff = Math.max(diff, Math.abs(shots.movedLamp[k] - shots.fullSecond[k]));
  const [a, b] = [fit(shots.moved37, 0.7, 1, false, shots.even37), fit(shots.moved11, 0.7, 1, false, shots.even11)];
  const t = { worst: Math.max(a.worst, b.worst), mean: Math.max(a.mean, b.mean) };
  // The control: the hot-spot is there to move at all.
  let spread = 0;
  for (const [i, j] of all) spread = Math.max(spread, px(shots.even, i, j)[1] - px(shots.fullSecond, i, j)[1]);
  check('nothing in the light moves: the gloss light moved by Lamp Motion leaves the bare stage the same to the byte, and 11.3 s and 37 s later it is still the law where it was',
    diff === 0 && t.worst <= 0.03 && t.mean <= 0.006 && spread > 40,
    `at most ${diff} levels apart; 11.3 and 37 s on, worst ${f3(t.worst)}, mean ${f3(t.mean)} off the law; the hot-spot takes up to ${spread} levels from the stage (the control)`);
}

// ── 4. Never above the lamp ──────────────────────────────────────────
{
  // With one bulb, and with two (whose sum is set to white at the axis, which nothing else holds under the lamp).
  let over = 0;
  for (const img of [shots.full, shots.fullSecond, shots.both])
    for (const [i, j] of all) { const p = px(img, i, j), q = px(shots.even, i, j); for (let c = 0; c < 3; c++) over = Math.max(over, p[c] - q[c]); }
  const m = S / 2 - 1;
  const axis = Math.max(...[0, 1, 2].map(c => Math.abs(px(shots.full, m, m)[c] - px(shots.even, m, m)[c])));
  check('no pixel of the stage at Hot-Spot 1, or with the second bulb, is above the lamp, and the axis is the lamp\'s full light',
    over <= 1 && axis <= 1, `at most ${over} levels above the even stage; the axis ${axis} levels off it`);
}

// ── 5. The condenser's colour ────────────────────────────────────────
{
  let fringe = 0, at = null;
  for (const [i, j] of all) {
    const p = px(shots.full, i, j), q = px(shots.even, i, j);
    if (q[0] < 60 || q[2] < 60) continue;
    const d = p[2] / q[2] - p[0] / q[0];
    if (Math.abs(d) > Math.abs(fringe)) { fringe = d; at = [i, j]; }
  }
  const want = at ? (() => { const w = lampField(...stageOf(...at), 1, 0); return w[2] - w[0]; })() : 0;
  /*
    Blue above red, as acrylic's dispersion puts it (line 0 pins that from
    the indices): blue's image is nearer the condenser, so blue's bundles are
    less off the axis and less of blue is clipped. And no colour where the
    stage is fully lit (the middle fifth of the frame) or fully dark (where
    the law lets no channel through): the colour is the knee's.
  */
  let flat = 0, dark = 0;
  for (const [i, j] of all) {
    const p = px(shots.full, i, j), q = px(shots.even, i, j), w = lampField(...stageOf(i, j), 1, 0);
    if (Math.hypot((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5) < 0.1) flat = Math.max(flat, Math.abs(p[2] / q[2] - p[0] / q[0]));
    if (Math.max(...w) < 0.002) dark = Math.max(dark, Math.abs(p[2] - p[0]));
  }
  check('at Hot-Spot 1 the edge of the lit middle is coloured, blue above red by the law\'s amount, and neither the lit middle nor the dark sides are',
    fringe > 0.02 && Math.abs(fringe - want) <= 0.012 && flat <= 0.004 && dark <= 1,
    `blue − red ${f3(fringe)} of the lamp at (${at}), the law ${f3(want)}; in the middle at most ${f3(flat)}, in the dark ${dark} levels`);
}

// ── 6. A second bulb adds light ──────────────────────────────────────
{
  const f = fit(shots.fullSecond, 0.7, 1), g = fit(shots.fullSecond, 0.7, 1, true), h = fit(shots.fullSecond, 0.7, 0);
  const m = S / 2 - 1;
  const axis = Math.max(...[0, 1, 2].map(c => Math.abs(px(shots.fullSecond, m, m)[c] - px(shots.even, m, m)[c])));
  check('a second bulb adds its light: white at the axis, and its side of the stage as the law says, which neither the bulb on the other side nor no second bulb fits',
    f.worst <= 0.03 && f.mean <= 0.006 && g.mean > 3 * f.mean && h.mean > 3 * f.mean && axis <= 2,
    `worst ${f3(f.worst)}, mean ${f3(f.mean)}; mirrored ${f3(g.mean)}, one bulb ${f3(h.mean)}; the axis ${axis} levels off the lamp (bulb at ${SECOND_BULB})`);
}

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} lampfield checks passed`);
process.exit(failed ? 1 : 0);
