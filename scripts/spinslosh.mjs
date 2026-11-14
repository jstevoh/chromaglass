#!/usr/bin/env node
/**
 * `npm run spinslosh`: a spun dish of liquid does what a spun dish does (PLAN 22n).
 *
 * What was reported (the owner, 2026-11-13): "if I'm spinning the plate,
 * shouldn't the liquid follow the physics? and get spread out and if stopped
 * suddenly, overshoot?" Until 22n the liquid between the plate's two glasses
 * followed the dish within its drag time h²/12ν, a third of a second for water
 * in the 2 mm gap and a sixtieth for the thick liquid (lib/turntable.ts), so a
 * spin was all but a rigid turn of the picture: nothing spread, and a dish
 * stopped dead stopped its liquid with it. The open dish (lib/slosh.ts, the
 * dish that sloshes under a tilt) is now solved in the frame that turns with the
 * glass, with that frame's three forces: centrifugal (a paraboloid floor),
 * Euler (−Ω̇ ẑ×r) and Coriolis (−2Ω ẑ×u).
 *
 * This holds that dish, the TypeScript reference the GPU's kernels are held to
 * cell by cell (`npm run sloshgpu`, case 6), to the physics, each check a thing
 * the owner asked for or a way it could be wrong:
 *
 *   1. spun steadily, the liquid settles into the paraboloid h(r) = h_c +
 *      Ω²r²/2g, the rise from the middle to r = 0.4 within 5% of the formula,
 *      and then stands still in the turning frame (a dish turning steadily is a
 *      solid body: nothing flows in it);
 *   2. spread out: dye on a ring is carried outward as the liquid heaps toward
 *      the rim, to the radius that keeps the water inside it (volume inside a
 *      ring is conserved), within 15%;
 *   3. spun up quickly, water is left behind: just after the glass reaches Ω
 *      the liquid turns at less than a fifth of it, and once the heap has formed
 *      it comes up to the glass at the floor's drag on its own depth, the mean of
 *      12ν/h² over its turning (k_eff), within 10%;
 *   4. stopped suddenly, it overshoots: water carries on past the stopped glass,
 *      through the angle Ω/k, and the thick liquid (the default Thickness) a
 *      little, in proportion to its drag time; between 0.6 and 1.05 of Ω/k,
 *      because the dish's staircase rim brakes a turning flow (shortcut 22o:
 *      with no drag at all a lag loses 12% of itself in its first 0.4 s), and
 *      the printed share says how much;
 *   5. and the heap is the liquid's, not the glass's: just after the glass
 *      stops the middle is still thinned (the liquid still turns, and holds it),
 *      and it fills back to level as the liquid's own turn runs down, which on
 *      water takes seconds, not the stop's twentieth of one;
 *   6. the way round: a positive spin leaves the liquid turning the negative way
 *      relative to the glass while it starts, and carries it the positive way
 *      when the glass stops (ẑ×r = (−y, x), the solver's own sense);
 *   7. nothing it did not do before: a spin of 0 and no change of speed leaves
 *      a resting dish asleep (no step taken); the looks' own slow motors
 *      (0.31 rad/s at most) do not wake it and a hand's spin does; and below
 *      1.2 rad/s the step count is the resting dish's, so nothing else moves;
 *   8. it holds at the hand's top speed: a turn and a half a second taken on in
 *      0.04 s and stopped as fast, the middle running dry, no non-finite number,
 *      every stage under the scheme's Courant limit and the water's mass kept.
 */
import { SloshDish, sloshDrag, sloshSteps, spinWakes, SLOSH_G, SLOSH_REST_DEPTH, SLOSH_N, SLOSH_COURANT_MAX, SLOSH_SPIN_MIN, SLOSH_DT } from '../src/lib/slosh.ts';
import { thicknessViscosity } from '../src/lib/turntable.ts';

let bad = 0;
function check(name, pass, detail = '') {
  if (!pass) bad++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
}

const N = SLOSH_N, DT = 1 / 60;
const WATER_R = sloshDrag(thicknessViscosity(0)), DEF_R = sloshDrag(thicknessViscosity(0.45));

/** A dish laid level, one liquid (no oil), awake. */
function fresh() {
  const d = new SloshDish();
  d.setOil(null);
  d.rest();
  return d;
}

/**
 * Step `seconds` of frames with the dish's speed omega(t) at each frame's end,
 * handed as the visualizer hands it (fluidSimulation stepSlosh): Ω this frame
 * and Ω̇ as its change since the last frame. `each` sees the dish after a frame.
 */
function run(d, seconds, omega, r, state, each) {
  const frames = Math.round(seconds / DT);
  for (let k = 0; k < frames; k++) {
    state.t += DT;
    const w = omega(state.t);
    d.spin = w;
    d.spinRate = (w - state.was) / DT;
    state.was = w;
    d.step(DT, 0, 0, r);
    if (each) each(d, state.t);
  }
}

const centreOf = (i) => (i + 0.5) / N - 0.5;

/** The water's depth averaged over the cells whose centre is within [r0, r1) of the middle. */
function ringDepth(d, r0, r1) {
  let s = 0, c = 0, rr = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!d.wet[k]) continue;
    const r = Math.hypot(centreOf(i), centreOf(j));
    if (r >= r0 && r < r1) { s += d.h[k]; rr += r * r; c++; }
  }
  return { h: s / c, r2: rr / c };
}

/**
 * The liquid's turn relative to the glass, rad/s: its angular momentum over its
 * moment of inertia, Σ h (x v − y u) / Σ h r², over the wet cells.
 */
function relSpin(d) {
  let L = 0, I = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!d.wet[k] || d.h[k] <= 1e-6) continue;
    const x = centreOf(i), y = centreOf(j);
    L += x * d.qy[k] - y * d.qx[k];
    I += d.h[k] * (x * x + y * y);
  }
  return I > 0 ? L / I : 0;
}

/** The floor's drag on a relative turn of the liquid as it is: Σ (12ν/h²) h r² / Σ h r², ν from the dish's drag r at the rest depth. */
function kEff(d, r) {
  let K = 0, I = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    if (!d.wet[k] || d.h[k] <= 1e-6) continue;
    const r2 = centreOf(i) ** 2 + centreOf(j) ** 2;
    K += r * (SLOSH_REST_DEPTH / d.h[k]) ** 2 * d.h[k] * r2;
    I += d.h[k] * r2;
  }
  return K / I;
}

function mass(d) {
  let s = 0;
  for (let k = 0; k < d.h.length; k++) if (d.wet[k]) s += d.h[k];
  return s;
}

/** The water's velocity at (x, y) (centred coordinates), bilinear over the cell centres. */
function velAt(d, x, y) {
  const fx = (x + 0.5) * N - 0.5, fy = (y + 0.5) * N - 0.5;
  const i0 = Math.max(0, Math.min(N - 2, Math.floor(fx))), j0 = Math.max(0, Math.min(N - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
  let u = 0, v = 0;
  for (const [di, dj, w] of [[0, 0, (1 - tx) * (1 - ty)], [1, 0, tx * (1 - ty)], [0, 1, (1 - tx) * ty], [1, 1, tx * ty]]) {
    const k = (j0 + dj) * N + i0 + di;
    if (d.wet[k] && d.h[k] > 1e-6) { u += w * d.qx[k] / d.h[k]; v += w * d.qy[k] / d.h[k]; }
  }
  return [u, v];
}

// 1 and 2: spun steadily on the default Thickness, tracers on a ring at r = 0.2.
{
  const W = 2;
  const d = fresh();
  const m0 = mass(d);
  const st = { t: 0, was: 0 };
  const R0 = 0.2;
  const dots = Array.from({ length: 48 }, (_, k) => [R0 * Math.cos(2 * Math.PI * k / 48), R0 * Math.sin(2 * Math.PI * k / 48)]);
  // Carried by the water's own flow in the turning frame, midpoint rule per frame.
  const carry = (dd) => {
    for (const p of dots) {
      const [u0, v0] = velAt(dd, p[0], p[1]);
      const [u1, v1] = velAt(dd, p[0] + 0.5 * DT * u0, p[1] + 0.5 * DT * v0);
      p[0] += DT * u1; p[1] += DT * v1;
    }
  };
  run(d, 6, (t) => W * Math.min(1, t / 0.3), DEF_R, st, carry);
  const mid = ringDepth(d, 0, 0.06), out = ringDepth(d, 0.37, 0.43);
  const rise = out.h - mid.h, want = W * W * (out.r2 - mid.r2) / (2 * SLOSH_G);
  check('1. spun steadily, the liquid settles into the paraboloid Ω²r²/2g', Math.abs(rise / want - 1) < 0.05,
    `rise from the middle to r = 0.4: ${(rise * 200).toFixed(3)} mm against the formula's ${(want * 200).toFixed(3)} mm at ${W} rad/s, ${((rise / want - 1) * 100).toFixed(1)}%`);
  const still = d.maxSpeed();
  check('1. ...and stands still in the turning frame once settled', still < 1e-3,
    `fastest water ${still.toExponential(2)} plate widths/s after 6 s; the relative turn ${relSpin(d).toExponential(2)} rad/s`);
  // Where the ring should be: the water inside it is what it was, ∫ h 2πr dr up to r' = h₀ π R0².
  const inside0 = SLOSH_REST_DEPTH * Math.PI * R0 * R0;
  const hc = mid.h - W * W * mid.r2 / (2 * SLOSH_G);
  // ∫₀^r' (hc + W² r²/2g) 2πr dr = π hc r'² + π W² r'⁴ / 4g, solved for r'².
  const a = Math.PI * W * W / (4 * SLOSH_G), b = Math.PI * hc;
  const rWant = Math.sqrt((-b + Math.sqrt(b * b + 4 * a * inside0)) / (2 * a));
  const rGot = dots.reduce((s, p) => s + Math.hypot(p[0], p[1]), 0) / dots.length;
  const moved = rGot - R0, movedWant = rWant - R0;
  check('2. spread out: dye on a ring is carried outward to the radius that keeps the water inside it', moved > 0 && Math.abs(moved / movedWant - 1) < 0.15,
    `ring at r = ${R0} moved out to ${rGot.toFixed(4)}, ${((moved / movedWant) * 100).toFixed(0)}% of the ${movedWant.toFixed(4)} the paraboloid's volume asks (${(movedWant * 200).toFixed(1)} mm)`);
  check('1. the water\'s mass is kept', Math.abs(mass(d) / m0 - 1) < 1e-5, `${((mass(d) / m0 - 1)).toExponential(2)} of it`);
}

// 3, 4, 5, 6: water spun up quickly, held until it has come up to the glass, then stopped dead.
const W = 2;
{
  const d = fresh();
  const st = { t: 0, was: 0 };
  const omega = (t) => (t < 0.1 ? W * t / 0.1 : t < 16 ? W : t < 16.05 ? W * (1 - (t - 16) / 0.05) : 0);
  run(d, 0.1, omega, WATER_R, st);
  const atTop = relSpin(d);
  check('3. spun up quickly, water is left behind by the glass', atTop < -0.8 * W,
    `0.1 s after starting, the liquid turns ${(W + atTop).toFixed(3)} rad/s with the glass at ${W}: ${(-atTop / W * 100).toFixed(0)}% behind`);
  check('6. the way round: a positive spin leaves the liquid turning back against it', atTop < 0, `relative turn ${atTop.toFixed(3)} rad/s`);
  // The lag's rate once the heap has formed (4 s to 12 s), against the floor's drag over the liquid as it is then.
  let s4 = 0, s12 = 0, kSum = 0, kN = 0;
  run(d, 15.9, omega, WATER_R, st, (dd, t) => {
    if (Math.abs(t - 4) < DT / 2) s4 = relSpin(dd);
    if (Math.abs(t - 12) < DT / 2) s12 = relSpin(dd);
    if (t >= 4 && t <= 12) { kSum += kEff(dd, WATER_R); kN++; }
  });
  const kGot = Math.log(s4 / s12) / 8, kWant = kSum / kN;
  check('3. ...and comes up to it at the floor\'s drag on its own depth', s4 < 0 && s12 < 0 && Math.abs(kGot / kWant - 1) < 0.1,
    `from 4 s to 12 s the lag fell at ${kGot.toFixed(3)}/s against k_eff ${kWant.toFixed(3)}/s (12ν/h₀² is ${WATER_R.toFixed(3)}/s)`);
  const before = relSpin(d);
  const rim0 = ringDepth(d, 0, 0.06).h;
  // Stopped dead (0.05 s): how far the liquid goes on past the glass, and the middle's depth after.
  let angle = 0, firstAfter = null, midSoon = null, midLate = 0;
  run(d, 16, omega, WATER_R, st, (dd, t) => {
    if (t <= 16.05) return;
    const s = relSpin(dd);
    if (firstAfter === null) firstAfter = s;
    angle += s * DT;
    if (midSoon === null && t >= 16.25) midSoon = ringDepth(dd, 0, 0.06).h;
    midLate = ringDepth(dd, 0, 0.06).h;
  });
  const angleWant = W / WATER_R;
  check('4. stopped suddenly, water overshoots: it carries on past the stopped glass', firstAfter > 0.8 * W && angle / angleWant > 0.6 && angle / angleWant < 1.05,
    `just after the stop it turns ${firstAfter.toFixed(3)} rad/s (it was ${(W + before).toFixed(3)} with the glass); it went on ${angle.toFixed(2)} rad (${(angle * 180 / Math.PI).toFixed(0)}°) past the glass, ${(angle / angleWant * 100).toFixed(0)}% of Ω/k = ${angleWant.toFixed(2)} rad`);
  check('6. ...the positive way, the way it was going', firstAfter > 0 && angle > 0);
  const dip = SLOSH_REST_DEPTH - rim0;
  check('5. the heap is the liquid\'s: the middle stays thinned just after the stop, and fills back as the liquid\'s turn runs down',
    dip > 0.1 * SLOSH_REST_DEPTH && SLOSH_REST_DEPTH - midSoon > 0.8 * dip && Math.abs(midLate - SLOSH_REST_DEPTH) < 0.1 * dip,
    `the middle ${(rim0 * 200).toFixed(2)} mm deep spinning (rest ${(SLOSH_REST_DEPTH * 200).toFixed(1)} mm), ${(midSoon * 200).toFixed(2)} mm 0.2 s after the stop, ${(midLate * 200).toFixed(2)} mm 16 s after`);
}
// 4, the default Thickness: it overshoots too, by its own (short) drag time.
{
  const d = fresh();
  const st = { t: 0, was: 0 };
  const omega = (t) => (t < 0.1 ? W * t / 0.1 : t < 3 ? W : t < 3.05 ? W * (1 - (t - 3) / 0.05) : 0);
  run(d, 3.05, omega, DEF_R, st);
  let angle = 0;
  run(d, 3, omega, DEF_R, st, (dd) => { angle += relSpin(dd) * DT; });
  const want = W / DEF_R;
  check('4. on the default Thickness it overshoots by its own drag time', angle / want > 0.6 && angle / want < 1.05,
    `${angle.toFixed(3)} rad (${(angle * 180 / Math.PI).toFixed(1)}°) past the glass, ${(angle / want * 100).toFixed(0)}% of Ω/k = ${want.toFixed(3)} rad`);
}

// 7. nothing it did not do before.
{
  const d = fresh();
  d.spin = 0; d.spinRate = 0;
  const moved = d.step(DT, 0, 0, DEF_R);
  check('7. a dish nobody spins, tilts or presses stays asleep', moved === false && d.maxSpeed() === 0);
  check('7. the looks\' own motors do not wake the dish, a hand\'s spin does', !spinWakes(0.31, 0) && spinWakes(0.4, 0) && spinWakes(0, 1) && !spinWakes(0.2, 0.1),
    `the spin that wakes it: ${SLOSH_SPIN_MIN.toFixed(3)} rad/s, a heap of a hundredth of the depth`);
  check('7. below 1.2 rad/s the step count is the resting dish\'s', sloshSteps(DT, 1.2) === sloshSteps(DT) && sloshSteps(DT, 0) === sloshSteps(DT) && sloshSteps(DT, 9.4) > sloshSteps(DT),
    `${sloshSteps(DT)} a frame resting, ${sloshSteps(DT, 1.2)} at 1.2 rad/s, ${sloshSteps(DT, 9.4)} at 9.4`);
}

// 8. the hand's top speed, on water and on the default.
for (const [name, r] of [['water', WATER_R], ['the default Thickness', DEF_R]]) {
  const d = fresh();
  const m0 = mass(d);
  const st = { t: 0, was: 0 };
  const top = 1.5 * 2 * Math.PI;
  let finite = true, dry = false;
  const omega = (t) => (t < 0.04 ? top * t / 0.04 : t < 2 ? top : t < 2.04 ? top * (1 - (t - 2) / 0.04) : 0);
  d.courant = 0;
  run(d, 4, omega, r, st, (dd) => {
    for (let k = 0; k < dd.h.length; k++) if (!Number.isFinite(dd.h[k]) || !Number.isFinite(dd.qx[k]) || !Number.isFinite(dd.qy[k])) finite = false;
    if (ringDepth(dd, 0, 0.06).h < 1e-4) dry = true;
  });
  check(`8. at the hand's top speed on ${name}, the dish holds`, finite && d.blowups === 0 && d.courant <= SLOSH_COURANT_MAX && Math.abs(mass(d) / m0 - 1) < 1e-4,
    `largest Courant ${d.courant.toFixed(3)} (limit ${SLOSH_COURANT_MAX}), ${d.blowups} blow-ups, mass ${(mass(d) / m0 - 1).toExponential(2)}, the middle ran dry: ${dry}; step ${SLOSH_DT.toFixed(5)} s at rest`);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
