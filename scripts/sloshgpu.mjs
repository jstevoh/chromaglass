#!/usr/bin/env node
/**
 * `npm run sloshgpu`: the slosh dish's GPU kernels are the reference scheme.
 *
 *   npm run sloshgpu      (the lab: any adapter that computes; PW_WEBGPU=1 in a cloud session)
 *
 * The dish the plate is handed runs on the GPU (src/gpu/slosh.ts, kernels in
 * src/gpu/wgsl/slosh.ts), and `npm run slosh` holds the scheme to its physics in
 * node, on the TypeScript reference (src/lib/slosh.ts SloshDish). That is only
 * worth something if the two are the same scheme. So this steps both, frame by
 * frame, through the forcings the dish is for, and holds the GPU's water and oil
 * to the reference's, cell by cell:
 *
 *   1. a tilt held and turned round on water (the slosh the dial makes), at the
 *      default Thickness and at water's;
 *   2. an oil lens floating on the water while the dish is rocked (the second
 *      layer: the lens's weight in the water's floor, the raft's own push and
 *      the two-layer drag);
 *   3. a glass pressed on the liquid and let go (Beat Squeeze's ring);
 *   4. a hard tip that steepens into a bore (the Riemann flux and the
 *      hydrostatic reconstruction through a jump);
 *   5. laid level with oil on it: the rest kernel floats the lens as the
 *      reference does, to the float's rounding, and nothing moves.
 *
 * The bar is a ten-thousandth of the rest depth for depths and of the wave speed
 * for velocities, after one to three seconds of stepping. The GPU computes in
 * float32 and the reference in float64 between float32 stores, so a few units in
 * the seventh place a step are expected; a wrong sign, a wrong face, a missed
 * term or a stage out of order shows as a difference of order one within a frame
 * or two, which is what the bar is set to catch. Each case also prints that the
 * dish moved (its fastest speed), so a pair of dishes that both stood still
 * cannot pass by agreeing.
 */
import { openLab } from './lab.mjs';
import { SloshDish, SLOSH_N, SLOSH_PRESSES, SLOSH_C, SLOSH_REST_DEPTH, SLOSH_LENS, sloshAccel, sloshDrag, sloshNu, rockRise } from '../src/lib/slosh.ts';
import { thicknessViscosity } from '../src/lib/turntable.ts';

let bad = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) bad++;
}
const N = SLOSH_N;
const DT = 1 / 60;
const [AX] = sloshAccel(1, 1, 1, 0);
const DEF_R = sloshDrag(thicknessViscosity(0.45)), WATER_R = sloshDrag(thicknessViscosity(0));

const { page, close } = await openLab({ entry: 'scripts/sloshgpu-entry.ts' });
const adapter = await page.evaluate(() => window.slosh.create());
console.log(`  adapter: ${adapter || 'unnamed'}`);

/** Run frames f(t) → {ax, ay, r, presses} on both dishes from rest with the oil share given, and compare. */
async function both(name, seconds, f, share = null) {
  const ref = new SloshDish();
  ref.setOil(share ? Float32Array.from(share) : null);
  ref.rest();
  ref['resting'] = false;
  await page.evaluate((s) => window.slosh.oil(s), share);
  const frames = [];
  let peak = 0;
  for (let k = 0; k < Math.round(seconds * 60); k++) {
    const t = k * DT;
    const { ax = 0, ay = 0, r = DEF_R, presses = [], bx = 0, by = 0 } = f(t);
    for (let s = 0; s < SLOSH_PRESSES; s++) ref.press(s, presses[s] ?? null);
    ref.step(DT, ax, ay, r, bx, by);
    // The reference rests itself once still; so that the two step the same frames, keep it awake.
    ref['resting'] = false;
    peak = Math.max(peak, ref.maxSpeed());
    frames.push({ seconds: DT, ax, ay, nu: sloshNu(r), presses, level: k === 0, bx, by });
  }
  const gpu = await page.evaluate((fr) => window.slosh.run(fr), frames);
  let dh = 0, du = 0, dOil = 0, dFlow = 0, dDepth = 0;
  for (let c = 0; c < N * N; c++) {
    const o = c * 4;
    // The GPU stores the depth's departure from rest, as the reference's hd: compared as stored, and as a depth.
    const gh = gpuDepth(gpu.water, c, ref);
    dh = Math.max(dh, Math.abs(gpu.water[o] - ref.hd[c]) / SLOSH_REST_DEPTH, Math.abs(gh - ref.h[c]) / SLOSH_REST_DEPTH);
    const h = ref.h[c];
    if (h > 1e-4) {
      du = Math.max(du, Math.abs(gpu.water[o + 1] / Math.max(gh, 1e-9) - ref.qx[c] / h) / SLOSH_C,
        Math.abs(gpu.water[o + 2] / Math.max(gh, 1e-9) - ref.qy[c] / h) / SLOSH_C);
    }
    dOil = Math.max(dOil, Math.abs(gpu.oil[o + 2] - ref.h1[c]) / SLOSH_REST_DEPTH);
    if (ref.wet[c] && ref.h1[c] > 0) dOil = Math.max(dOil, Math.abs(gpu.oil[o] - ref.ox[c]) / SLOSH_C, Math.abs(gpu.oil[o + 1] - ref.oy[c]) / SLOSH_C);
    // What the plate is handed (sloshOut), every channel it reads: the water's velocity (xy), the oil's (zw, the
    // water's where there is no oil), the depth of both layers over rest and the oil's share of the lens.
    // Reading only the first of each let a flipped flow.y, the water's speed in the oil's place and a halved share
    // all pass (the check's own review, 2026-10-22).
    if (ref.wet[c] && h > 1e-4) {
      const ux = ref.qx[c] / h, uy = ref.qy[c] / h;
      const oil = ref.h1[c] > 0;
      dFlow = Math.max(dFlow,
        Math.abs(gpu.flow[o] - ux) / SLOSH_C, Math.abs(gpu.flow[o + 1] - uy) / SLOSH_C,
        Math.abs(gpu.flow[o + 2] - (oil ? ref.ox[c] : ux)) / SLOSH_C, Math.abs(gpu.flow[o + 3] - (oil ? ref.oy[c] : uy)) / SLOSH_C);
      dDepth = Math.max(dDepth, Math.abs(gpu.depth[o] - (h + ref.h1[c]) / SLOSH_REST_DEPTH),
        Math.abs(gpu.depth[o + 1] - ref.h1[c] / SLOSH_LENS));
    }
  }
  const worst = Math.max(dh, du, dOil, dFlow, dDepth);
  check(`${name}: the GPU's dish is the reference's, cell for cell`, worst < 1e-4 && gpu.errors.length === 0 && peak > 1e-3,
    `depth ${dh.toExponential(1)}, water ${du.toExponential(1)}, oil ${dOil.toExponential(1)}, handed flow ${dFlow.toExponential(1)}, handed depth ${dDepth.toExponential(1)}; the dish ran at up to ${peak.toFixed(3)} plate widths/s${gpu.errors.length ? `; GPU errors: ${gpu.errors[0]}` : ''}`);
  return { ref, gpu };
}

/** The GPU's water depth at cell c, from its stored departure from rest (wgsl/slosh.ts depth): 0 outside the dish. */
function gpuDepth(water, c, ref) {
  return ref.wet[c] ? Math.max(0, Math.fround(Math.fround(SLOSH_REST_DEPTH) + water[c * 4])) : 0;
}

/** A round lens of oil (share 1 inside), centred at (x, y) plate units, radius r. */
function lens(x, y, r) {
  const s = new Array(N * N).fill(0);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = Math.hypot((i + 0.5) / N - x, (j + 0.5) / N - y);
    s[j * N + i] = d < r ? 1 : d < r + 1.5 / N ? 1 - (d - r) / (1.5 / N) : 0;
  }
  return s;
}

// 1. the dial's slosh, held and turned round.
await both('a tilt held and turned round, default Thickness', 2, (t) => ({ ax: (t < 1 ? 1 : -1) * AX }));
await both('the same on water', 2, (t) => ({ ax: (t < 1 ? 1 : -1) * AX, ay: 0.5 * AX, r: WATER_R }));
// 2. oil on it.
await both('an oil lens on the water while the dish is rocked', 2, (t) => ({ ax: Math.sin(2 * Math.PI * t / 1.4) * AX, r: WATER_R }), lens(0.62, 0.45, 0.14));
// And Plate Rock's lean on the oil alone (rockRise, PLAN 27f-5): two lenses, one against the rim, rocked a lean a
// second along a turning axis at full Plate Rock (sinθ 0.3), so the rim's reaction and both axes are in it.
await both('Plate Rock\'s lean raising two lenses under the cover, one against the rim', 2.5, (t) => {
  const s = 0.3 * Math.sin(Math.PI * t), a = 0.4 * t;
  const [bx, by] = rockRise(s * Math.cos(a), s * Math.sin(a), true);
  return { bx, by };
}, lens(0.5, 0.5, 0.12).map((v, k) => Math.max(v, lens(0.07, 0.5, 0.07)[k])));
// 3. a press and its release.
await both('a glass pressed on the liquid and let go', 1.5, (t) => ({
  r: WATER_R,
  presses: t < 0.25 ? [{ x: 0.58, y: 0.5, radius: 0.12, depth: 0.3 * SLOSH_REST_DEPTH * Math.min(1, t / 0.08) }] : [],
}));
// And Beat Squeeze's own: the glass over three nested discs (lib/squish.ts KICK_RADII), every slot in use.
await both('a kick\'s press over three nested discs, and the next kick\'s while it lets go', 1.5, (t) => {
  const dome = (x, y, a) => [64, 44, 24].map((r) => ({ x, y, radius: r / 128, depth: a }));
  const f = (t0) => (t < t0 ? 0 : t < t0 + 0.15 ? 1 : t < t0 + 0.48 ? 0.5 * (1 + Math.cos(Math.PI * (t - t0 - 0.15) / 0.33)) : 0);
  return { r: WATER_R, presses: [...dome(0.55, 0.5, 0.004 * f(0.1)), ...dome(0.45, 0.42, 0.004 * f(0.45))] };
});
// 4. a hard tip: three times the dial's top, held, steepens the first wave into a bore against the rim.
await both('a hard tip that runs into a bore', 1.5, () => ({ ax: 3 * AX, r: WATER_R }));
// 5. level with oil on it, and still.
{
  const share = lens(0.4, 0.55, 0.2);
  const ref = new SloshDish();
  ref.setOil(Float32Array.from(share));
  ref.rest();
  await page.evaluate((s) => window.slosh.oil(s), share);
  const gpu = await page.evaluate((fr) => window.slosh.run(fr), [{ seconds: DT, ax: 0, ay: 0, nu: sloshNu(DEF_R), presses: [], level: true }]);
  let dh = 0, moved = 0;
  for (let c = 0; c < N * N; c++) {
    // The reference laid level: the step it would take from here (it is resting and does none) is checked by `npm run slosh`.
    dh = Math.max(dh, Math.abs(gpuDepth(gpu.water, c, ref) - ref.h[c]) / SLOSH_REST_DEPTH);
    moved = Math.max(moved, Math.abs(gpu.water[c * 4 + 1]), Math.abs(gpu.water[c * 4 + 2]), Math.abs(gpu.oil[c * 4]), Math.abs(gpu.oil[c * 4 + 1]));
  }
  check('laid level with a lens on it, the GPU floats it as the reference does and one frame later nothing has moved', dh < 1e-6 && moved < 1e-6,
    `depth ${dh.toExponential(1)}, fastest ${moved.toExponential(1)} plate widths/s`);
}

await close();
console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
