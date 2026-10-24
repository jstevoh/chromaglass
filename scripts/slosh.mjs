#!/usr/bin/env node
/**
 * `npm run slosh`: tip the plate one way and then the other and the liquid
 * sloshes (PLAN.md 18a-13), in node, on the CPU half (src/lib/slosh.ts) that the
 * GPU's `addSlosh` pass lays over the thin gap's flow.
 *
 * What was found: there was no slosh. The thin gap (PLAN 18a) is a Hele-Shaw
 * solve, a drag and a pressure and no inertia, with an open rim, so tipping the
 * plate (Gravity, Tilt Direction) changed the liquid's weight and nothing else:
 * a uniform tilt is a uniform body force, the pressure takes it up whole, and
 * the dye sat exactly where it was. The owner asked for the thing a glass dish
 * does in the hand: tip it one way, tip it back, and the liquid piles to the low
 * side, comes back past the middle, runs up the other rim and mixes.
 *
 * So this holds the shallow-water dish to the physics it claims, one number at
 * a time, and each check is of a thing the dish is for:
 *
 *   1. the lowest mode's period, 2π/(c k) with c = √(g h) and k = 1.841/R
 *      (the first zero of J1' on a round dish), 1.41 s at the plate's 6 mm gap;
 *   2. a held tilt settles to the slope a/g, piled on the downhill side;
 *   3. the dish sloshes: reverse a held tilt and the liquid's centre goes past
 *      the new level, the way a held glass does, on water and on the default
 *      Thickness where it is only just under-damped; and the Thickness at
 *      which it stops sloshing is printed, not assumed;
 *   4. the drag takes it down: the ring's amplitude falls by the drag's own
 *      rate, e^(-r t / 2);
 *   5. mass is conserved to the float's rounding through a resonant forcing;
 *   6. the liquid never dries: the depth stays at or above the floor;
 *   7. it stays stable: at water's drag, one to two minutes of tilting each
 *      half-period (the worst forcing a dish can be given) never puts a non-finite
 *      number or a face past the speed wall, and the energy stays finite and is printed;
 *   8. the dial: half the lean is half the response, and a dial taken to 0
 *      mid-wave lets the ring run down by itself, to exact rest;
 *   9. nothing where nothing tilts: no tilt, no flow, bit for bit, however long;
 *  10. the axes are the plate's: a tilt toward +y is the +x run turned a
 *      quarter, a tilt toward +x piles the depth on +x, and the velocity the
 *      field hands the GPU points the way the liquid runs (the GPU's own half,
 *      `addSlosh`, is only checked on the Mac);
 *  11. the mixing, which is what the owner asked for and not just the wave: dye
 *      carried through a reversal and a ring-down does not come back to where
 *      it started when the drag is low and the tilt turns round (a rotating
 *      tilt makes the dish swirl), and does not move at all with no tilt.
 */
import { readFileSync } from 'node:fs';
import { SloshDish, sloshAccel, sloshDrag, SLOSH_C, SLOSH_G, SLOSH_FLOOR, SLOSH_LEAN, SLOSH_FROUDE_MAX, SLOSH_N } from '../src/lib/slosh.ts';
import { thicknessViscosity } from '../src/lib/turntable.ts';

let bad = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!pass) bad++;
}
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.abs(b);
const DT = 1 / 60;
// The default Thickness the plate ships with, read from the solver's source so a change to it moves this check with
// it (src/gpu/fluid.ts imports shaders and cannot be loaded in node).
const DEFAULT_THICKNESS = Number(/export const THIN_GAP_THICKNESS = ([0-9.]+);/.exec(readFileSync(new URL('../src/gpu/fluid.ts', import.meta.url), 'utf8'))?.[1]);

/** The depth's centre of mass from the middle, plate widths: where the liquid is piled. */
function com(d) {
  let sx = 0, sy = 0, m = 0;
  for (let j = 0; j < d.n; j++) for (let i = 0; i < d.n; i++) {
    const c = j * d.n + i;
    sx += d.h[c] * ((i + 0.5) / d.n - 0.5);
    sy += d.h[c] * ((j + 0.5) / d.n - 0.5);
    m += d.h[c];
  }
  return [sx / m, sy / m];
}
function minDepth(d) {
  let m = Infinity;
  for (let k = 0; k < d.h.length; k++) if (d.wet[k]) m = Math.min(m, d.h[k] / d.restDepth);
  return m;
}
/** Run `seconds` at 60 Hz with the acceleration a(t) and the drag r, calling each(t, d) after every frame. */
function run(d, seconds, a, r, each) {
  let t = 0;
  for (let k = 0; k < Math.round(seconds * 60); k++) {
    const [ax, ay] = a(t);
    d.step(DT, ax, ay, r);
    t += DT;
    if (each) each(t, d);
  }
  return d;
}
const [AX] = sloshAccel(1, 1, 1, 0);
const nuOf = (thickness) => thicknessViscosity(thickness);
const dragOf = (thickness) => sloshDrag(nuOf(thickness));

// 1. the period.
{
  // A small, brief tip at almost no drag, then let go and time the ring by the centre's zero crossings.
  const d = new SloshDish();
  const small = sloshAccel(0.1, 1, 1, 0)[0];
  run(d, 0.25, () => [small, 0], 0.02);
  const cross = [];
  let prev = com(d)[0];
  run(d, 12, () => [0, 0], 0.02, (t) => {
    const x = com(d)[0];
    if (prev > 0 !== x > 0 && prev !== 0) cross.push(t);
    prev = x;
  });
  const gaps = cross.slice(1).map((t, i) => t - cross[i]);
  const half = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const k = 1.8412 / 0.5;
  const theory = (2 * Math.PI) / (SLOSH_C * k);
  check('the lowest mode rings at 2π/(c k), 1.41 s at the plate\'s 6 mm gap', near(2 * half, theory, 0.06),
    `${(2 * half).toFixed(3)} s measured over ${gaps.length} half-swings, ${theory.toFixed(3)} s by theory`);
}

// 2. a held tilt settles to the slope a/g, piled on the downhill side.
{
  const d = new SloshDish();
  const r = dragOf(DEFAULT_THICKNESS);
  run(d, 12, () => [AX, 0], r);
  // The slope along the middle row, away from the rim's own curve.
  const row = d.n >> 1;
  const iHi = Math.round(0.3 * d.n + d.n / 2 - 0.5), iLo = Math.round(-0.3 * d.n + d.n / 2 - 0.5);
  const at = (i) => d.h[row * d.n + i];
  // The cells are not exactly 0.6 apart; divide by the distance between the two centres actually read.
  const slope = (at(iHi) - at(iLo)) / (((iHi - iLo) / d.n) * d.restDepth);
  const [cx, cy] = com(d);
  check('a held tilt settles to the slope a/g, deeper on the side it is tipped toward', near(slope, AX / SLOSH_G / d.restDepth, 0.02) && at(iHi) > at(iLo),
    `slope ${slope.toFixed(4)} of the rest depth per plate width, a/g/h₀ = ${(AX / SLOSH_G / d.restDepth).toFixed(4)}; the pile's centre at ${cx.toFixed(4)}, ${cy.toExponential(1)}`);
  check('and the held liquid has come to rest on it: no flow', d.maxSpeed() < 2e-3, `fastest ${d.maxSpeed().toExponential(1)} plate widths/s`);
}

// 3 & 4. reversal on several Thicknesses: overshoot, crossings, damping.
const rows = [];
for (const [name, thickness] of [['water', 0], ['0.1', 0.1], ['0.2', 0.2], ['0.3', 0.3], [`${DEFAULT_THICKNESS} (default)`, DEFAULT_THICKNESS], ['0.6', 0.6], ['1 (glycerine)', 1]]) {
  const r = dragOf(thickness);
  const d = new SloshDish();
  // Settled on the held tilt first. The level a held tilt comes to does not depend on the drag, so it is reached
  // under a heavy one (a first tip at water's drag is still ringing after 14 s), then the drag under test is
  // put back and the tilt is reversed: the centre goes from +c0 toward -c0.
  run(d, 14, () => [AX, 0], 30);
  const c0 = com(d)[0];
  let low = c0, crossings = 0, prev = c0;
  const m0 = d.mass();
  run(d, 10, () => [-AX, 0], r, (t) => {
    const x = com(d)[0];
    low = Math.min(low, x);
    if (prev > -c0 !== x > -c0) crossings++;
    prev = x;
  });
  // The equilibrium after the reversal is −c0. Overshoot past it as a share of the swing between the two levels.
  const over = (-c0 - low) / (2 * c0);
  rows.push({ name, thickness, r, c0, low, over, crossings, massErr: Math.abs(d.mass() - m0) / m0 });
}
console.log('\n  Thickness      drag 1/s   rim-to-rim swing past the new level   passes through the new level');
for (const w of rows) console.log(`  ${w.name.padEnd(14)} ${w.r.toFixed(2).padStart(8)}   ${(w.over * 100).toFixed(1).padStart(8)} % of the swing         ${w.crossings}`);
console.log('');
{
  const water = rows[0], def = rows.find((w) => w.thickness === DEFAULT_THICKNESS), gly = rows[rows.length - 1];
  check('reverse a held tilt on water and the liquid runs past the new level and back, six passes through it or more, a ring',
    water.over > 0.5 && water.crossings >= 6, `${(water.over * 100).toFixed(0)}% past, ${water.crossings} crossings`);
  // The default Thickness's drag, 12ν/h₀², sits just under critical damping (2ω ≈ 8.9 /s against 7.5 /s): the liquid
  // flows to the new level in about a second and barely overshoots. That is the thin gap's physics, not a miss.
  // The lower bound is the other half of the claim: a dish that never moved would have an overshoot of -100%, and
  // "under 5%" alone would call that a success. It must get all the way to the new level (within 2% of the swing).
  check('and on the default Thickness it flows to the new level without ringing: within 2% short of it, under 5% past', def.over > -0.02 && def.over < 0.05,
    `${(def.over * 100).toFixed(1)}% past, ${def.crossings} crossing(s)`);
  check('glycerine does not slosh: it creeps toward the new level (most of the way to level in ten seconds, its drag\'s time of r/ω² ≈ 17 s) and never past it', gly.over < 0.005 && gly.crossings <= 1 && gly.low < 0.25 * gly.c0,
    `${(gly.over * 100).toFixed(2)}% past, ${gly.crossings} crossing(s), centre ${gly.low.toFixed(4)} from ${gly.c0.toFixed(4)}`);
  check('mass is conserved through every reversal', rows.every((w) => w.massErr < 1e-5), `worst ${Math.max(...rows.map((w) => w.massErr)).toExponential(1)}`);
  let mono = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].over > rows[i - 1].over + 1e-6) mono = false;
  check('the thicker the liquid, the less it sloshes: overshoot never rises with Thickness', mono,
    rows.map((w) => `${w.thickness}:${(w.over * 100).toFixed(0)}%`).join(' '));
  const sloshing = rows.filter((w) => w.over > 0.05).map((w) => w.thickness);
  console.log(`  note: it sloshes visibly (past the new level by over 5% of the swing) up to Thickness ${Math.max(...sloshing)}\n`);
}

// 4. the ring decays at the drag's own rate.
{
  const r = 0.6;
  const d = new SloshDish();
  const small = sloshAccel(0.05, 1, 1, 0)[0];
  run(d, 0.3, () => [small, 0], r);
  // Peaks of the centre's swing after the tilt is let go.
  const peaks = [];
  let prev = 0, prev2 = 0;
  run(d, 14, () => [0, 0], r, (t) => {
    const x = com(d)[0];
    if (prev > prev2 && prev > x && prev > 0) peaks.push([t - DT, prev]);
    prev2 = prev;
    prev = x;
  });
  // Successive same-sign peaks are one period apart: amplitude falls by e^(-r T / 2).
  const a = peaks.slice(0, 5);
  const rate = a.length > 2 ? Math.log(a[0][1] / a[a.length - 1][1]) / (a[a.length - 1][0] - a[0][0]) : NaN;
  check('the ring dies away at the drag\'s own rate, e^(-r t / 2)', near(rate, r / 2, 0.15),
    `${rate.toFixed(3)} /s measured over ${a.length} peaks, r/2 = ${(r / 2).toFixed(3)} /s`);
}

// 5, 6, 7. resonance: mass, floor, stability.
{
  console.log('  resonant tilting at water\'s drag, a tilt rocked each half-period, the worst case a dish can be given:');
  for (const half of [0.35, 0.5, 0.7, 1]) {
    const d = new SloshDish();
    const r = dragOf(0);
    const m0 = d.mass();
    let peakSpeed = 0, lowest = 9, peakE = 0, Emid = 0;
    const secs = half === 0.7 ? 120 : 60;
    run(d, secs, (t) => [(Math.floor(t / half) % 2 ? -1 : 1) * AX, 0], r, (t) => {
      peakSpeed = Math.max(peakSpeed, d.maxSpeed());
      lowest = Math.min(lowest, minDepth(d));
      const e = d.energy();
      peakE = Math.max(peakE, e);
      if (Math.abs(t - secs / 2) < DT / 2) Emid = e;
    });
    const massErr = Math.abs(d.mass() - m0) / m0;
    const fr = peakSpeed / SLOSH_C;
    console.log(`  half-period ${String(half).padEnd(4)} ${String(secs).padStart(3)} s: fastest ${peakSpeed.toFixed(3)} plate widths/s (Froude ${fr.toFixed(2)}), shallowest ${lowest.toFixed(2)} of rest, peak energy ${peakE.toExponential(1)}, mass off by ${massErr.toExponential(1)}, ${d.blowups} resets`);
    check(`half-period ${half} s: mass conserved, no dry cell, finite, below the speed wall`,
      massErr < 1e-5 && lowest >= SLOSH_FLOOR - 1e-6 && d.blowups === 0 && fr < SLOSH_FROUDE_MAX - 1e-6 && peakE < 1e-2,
      `mass ${massErr.toExponential(1)}, depth ≥ ${lowest.toFixed(2)}, Froude ${fr.toFixed(2)} < ${SLOSH_FROUDE_MAX}`);
  }
}

// 8. the dial.
{
  const resp = (dial) => {
    const d = new SloshDish();
    const a = sloshAccel(dial, 1, 1, 0)[0];
    let peak = 0;
    run(d, 3, () => [a, 0], dragOf(0.3), () => { peak = Math.max(peak, d.maxSpeed()); });
    return peak;
  };
  const full = resp(1), half = resp(0.5);
  check('half the dial is half the response: the fastest flow after three seconds of a held tilt scales with the dial', near(half, full / 2, 0.15),
    `${half.toFixed(4)} against ${(full / 2).toFixed(4)} plate widths/s`);
  check('the dial reaches SLOSH_LEAN of g at the top and Gravity scales it', near(sloshAccel(1, 1, 1, 0)[0], SLOSH_G * SLOSH_LEAN, 1e-9)
    && near(sloshAccel(1, 0.5, 1, 0)[0], SLOSH_G * SLOSH_LEAN / 2, 1e-9) && sloshAccel(0, 1, 1, 0)[0] === 0 && sloshAccel(1, 0, 1, 0)[0] === 0,
    `${sloshAccel(1, 1, 1, 0)[0].toFixed(4)} plate widths/s² at the top`);
  const d = new SloshDish();
  const r = dragOf(0.3);
  run(d, 2, () => [AX, 0], r);
  const live = d.maxSpeed() > 1e-3 || d.maxRise() > 1e-3;
  let t = 0, dormant = -1;
  for (let k = 0; k < 60 * 120; k++) {
    if (!d.step(DT, 0, 0, r)) { dormant = k * DT; break; }
    t += DT;
  }
  const exact = d.h.every((x, k) => x === (d.wet[k] ? Math.fround(d.restDepth) : 0)) && d.u.every((x) => x === 0) && d.v.every((x) => x === 0);
  check('a dial taken to 0 mid-wave lets the ring run down by itself, to exact rest', live && dormant > 0 && dormant < 90 && exact,
    `moving at the hand-off, dormant after ${dormant.toFixed(1)} s, flat and still: ${exact}`);
}

// 9. nothing where nothing tilts.
{
  const d = new SloshDish();
  let live = false;
  for (let k = 0; k < 60 * 600; k++) live = d.step(DT, 0, 0, dragOf(DEFAULT_THICKNESS)) || live;
  const exact = d.h.every((x, k) => x === (d.wet[k] ? Math.fround(d.restDepth) : 0)) && d.u.every((x) => x === 0) && d.v.every((x) => x === 0);
  const out = new Float32Array(SLOSH_N * SLOSH_N * 4);
  d.field(out);
  check('no tilt for ten minutes: no flow, bit for bit, never live', !live && exact && out.every((x, k) => (k % 4 === 2 ? true : x === 0)),
    `live ${live}, exact ${exact}`);
  // The dormant early return is what makes the line above hold, so it is not what is being tested: take the shortcut
  // away (`resting` is the flag that skips the step) and the stepped dish must still sit exactly at rest, so that the
  // first tilt after a long idle starts from a flat, still dish and not from drift the shortcut was hiding.
  const e = new SloshDish();
  e['resting'] = false;
  for (let k = 0; k < 60 * 30; k++) e.step(DT, 0, 0, dragOf(DEFAULT_THICKNESS));
  const flat = e.h.every((x, k) => x === (e.wet[k] ? Math.fround(e.restDepth) : 0)) && e.u.every((x) => x === 0) && e.v.every((x) => x === 0);
  check('and with the dormant shortcut taken away the stepped dish still stays exactly flat for thirty seconds', flat,
    `fastest ${e.maxSpeed().toExponential(1)}, rise ${e.maxRise().toExponential(1)}`);
}

// 10. the plate's axes.
{
  const dx = new SloshDish(), dy = new SloshDish();
  const r = dragOf(0.3);
  run(dx, 3, () => [AX, 0], r);
  run(dy, 3, () => [0, AX], r);
  const [cx, cy] = com(dx), [ex, ey] = com(dy);
  check('a tilt toward +x piles the liquid on +x and a tilt toward +y on +y, the same by a quarter turn',
    cx > 0 && ey > 0 && near(cx, ey, 1e-3) && Math.abs(cy) < 1e-6 && Math.abs(ex) < 1e-6,
    `+x: (${cx.toFixed(5)}, ${cy.toExponential(1)}); +y: (${ex.toExponential(1)}, ${ey.toFixed(5)})`);
  const out = new Float32Array(SLOSH_N * SLOSH_N * 4);
  dx.field(out);
  const row = SLOSH_N >> 1, mid = (row * SLOSH_N + (SLOSH_N >> 1)) * 4;
  let outside = 0;
  for (let j = 0; j < SLOSH_N; j++) for (let i = 0; i < SLOSH_N; i++) {
    const c = j * SLOSH_N + i;
    if (!dx.wet[c] && (out[c * 4] !== 0 || out[c * 4 + 1] !== 0 || out[c * 4 + 2] !== 0)) outside++;
  }
  // The sign and the axis the GPU is handed: R is u (the +x run), G is v. A tilt toward +x must give R > 0 and G zero,
  // and toward +y the other way round, or the pass would push the dye uphill or across.
  const outY = new Float32Array(SLOSH_N * SLOSH_N * 4);
  const dz = new SloshDish();
  run(dz, 0.2, () => [AX, 0], r);
  dz.field(out);
  const dw = new SloshDish();
  run(dw, 0.2, () => [0, AX], r);
  dw.field(outY);
  check('the field the GPU is handed runs the way the tilt points: +x gives R > 0 and G zero, +y gives G > 0 and R zero',
    out[mid] > 0 && Math.abs(out[mid + 1]) < 1e-6 && outY[mid + 1] > 0 && Math.abs(outY[mid]) < 1e-6,
    `+x: (${out[mid].toExponential(2)}, ${out[mid + 1].toExponential(1)}); +y: (${outY[mid].toExponential(1)}, ${outY[mid + 1].toExponential(2)})`);
  dx.field(out);
  check('the field is zero outside the dish and the depth ratio is above one on the downhill side', outside === 0 && out[(row * SLOSH_N + SLOSH_N - 12) * 4 + 2] > out[(row * SLOSH_N + 12) * 4 + 2],
    `${outside} cells outside; depth ratio ${out[(row * SLOSH_N + SLOSH_N - 12) * 4 + 2].toFixed(3)} against ${out[(row * SLOSH_N + 12) * 4 + 2].toFixed(3)}`);
}

// 11. mixing: dye carried by the slosh.
{
  const n = SLOSH_N;
  const out = new Float32Array(n * n * 4);
  const sample = (d, x, y) => {
    const gx = (x + 0.5) * n - 0.5, gy = (y + 0.5) * n - 0.5;
    const i0 = Math.max(0, Math.min(n - 2, Math.floor(gx))), j0 = Math.max(0, Math.min(n - 2, Math.floor(gy)));
    const fx = Math.max(0, Math.min(1, gx - i0)), fy = Math.max(0, Math.min(1, gy - j0));
    const g = (i, j, c) => out[(j * n + i) * 4 + c];
    const mix = (c) => (g(i0, j0, c) * (1 - fx) + g(i0 + 1, j0, c) * fx) * (1 - fy) + (g(i0, j0 + 1, c) * (1 - fx) + g(i0 + 1, j0 + 1, c) * fx) * fy;
    return [mix(0), mix(1)];
  };
  // Tracers on a lattice inside the dish, advected by the dish's flow through the same 60 Hz frames the GPU gets.
  const lattice = () => {
    const pts = [];
    for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
      const x = (i + 0.5) / 24 - 0.5, y = (j + 0.5) / 24 - 0.5;
      if (Math.hypot(x, y) < 0.42) pts.push([x, y]);
    }
    return pts;
  };
  const carry = (a, r, seconds) => {
    const d = new SloshDish();
    const pts = lattice(), home = pts.map((p) => [...p]);
    let peak = 0;
    run(d, seconds, a, r, () => {
      d.field(out);
      for (const p of pts) {
        const [u1, v1] = sample(d, p[0], p[1]);
        const [u2, v2] = sample(d, p[0] + 0.5 * DT * u1, p[1] + 0.5 * DT * v1);
        p[0] += DT * u2;
        p[1] += DT * v2;
      }
      let rms = 0;
      for (let k = 0; k < pts.length; k++) rms += (pts[k][0] - home[k][0]) ** 2 + (pts[k][1] - home[k][1]) ** 2;
      peak = Math.max(peak, Math.sqrt(rms / pts.length));
    });
    let rms = 0;
    for (let k = 0; k < pts.length; k++) rms += (pts[k][0] - home[k][0]) ** 2 + (pts[k][1] - home[k][1]) ** 2;
    return { peak, final: Math.sqrt(rms / pts.length), speed: d.maxSpeed() };
  };
  const r = dragOf(0.3);
  const none = carry(() => [0, 0], r, 10);
  // Tilt one way, then the other, as the owner described it, and let it ring down.
  const rock = carry((t) => [(t < 1 ? 1 : t < 2.2 ? -1 : 0) * AX, 0], r, 24);
  // The same energy as a tilt turned round once a second and a half: the dish swirls.
  const turn = carry((t) => (t < 6 ? [AX * Math.cos((2 * Math.PI * t) / 1.5), AX * Math.sin((2 * Math.PI * t) / 1.5)] : [0, 0]), r, 30);
  console.log(`  dye carried by the dish: no tilt peak ${none.peak.toExponential(1)}, final ${none.final.toExponential(1)};` +
    ` rocked once peak ${rock.peak.toFixed(4)}, final ${rock.final.toFixed(4)};` +
    ` a tilt turned round peak ${turn.peak.toFixed(4)}, final ${turn.final.toFixed(4)} plate widths`);
  check('no tilt: the dye does not move at all', none.peak === 0 && none.final === 0, `${none.peak}`);
  check('rocked once, the dye is carried a visible way across the plate (a few percent of its width) and the dish comes to rest', rock.peak > 0.02 && rock.speed < 1e-3,
    `${(rock.peak * 100).toFixed(1)}% of the plate's width at most`);
  // A rocked dish is nearly reversible (the wave goes and comes back); a tilt turned round drives a net swirl that the
  // dye keeps after the ring has gone. That net displacement is the mixing, so it is what is asked for.
  check('a tilt turned round leaves the dye displaced after the ring has gone, many times more than a rock: the mixing is not only the wave going and coming back',
    turn.peak > 0.02 && turn.final > 0.003 && turn.final > 5 * rock.final,
    `turned: peak ${turn.peak.toFixed(3)}, left ${turn.final.toFixed(3)}; rocked: peak ${rock.peak.toFixed(3)}, left ${rock.final.toFixed(3)}`);
}

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);
