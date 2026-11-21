#!/usr/bin/env node
/**
 * The Finger on a thin gap is a solid in the liquid, and the flow carries
 * what it touches: the colour, the ferrofluid and the oil alike, with no
 * hand-written carry (PLAN.md §15b, §18a-3). Measured on the GPU solver
 * (scripts/lab.mjs) on the lab's plate at Classic's step, advection and
 * Thickness (the app's grids, 384² under 192), with the finger laid as the
 * app lays it (lib/handSolid.ts, layFinger).
 *
 *   npm run fingerflow
 *
 * What was there. Every tool's push lasted one step: on the old plate the
 * speed clamp (MAX_SPEED, fluid.ts) cut it back to idle at the end of the
 * step it was added in, so the Finger moved the colour, the oil and the
 * ferrofluid by a take from behind it and a put a hop ahead (carryDye,
 * carryMix, fingerCarry). On a thin gap the clamp is gone, and the push
 * still moved nothing: a disc of velocity laid over still liquid is mostly
 * the divergent part of the flow, which the solve takes straight back out.
 * Measured here as the control, the app's own push (the velocity fingerDrag
 * laid, its swirl included) drawn 0.4 of the plate through bands of colour:
 * the bands on its path moved no further than the plate moved them alone.
 *
 * The finger is now a solid in the solve (Brinkman's penalisation, hsPrep):
 * the liquid it touches moves at the hand's own speed, and the liquid round
 * it gives way. The checks, on a stroke 0.4 of the plate long at two cells
 * a step (a brisk hand, 0.6 of the plate a second at sixty steps) and five:
 *
 *   1. The liquid under the finger moves at the hand's speed, within a
 *      tenth, and a sixth of the plate to the side of the stroke it goes
 *      back the other way at 0.7 to 1.4 times U·a²/d², the dipole of the
 *      flow past a disc in a thin layer: a solid moving through the
 *      liquid, not a push spread over the plate.
 *   2. The colour on the stroke's path goes the stroke's way, as far as
 *      the real liquid carries it: a stripe laid along the path alone moves
 *      at least three quarters and under twice the drift the potential
 *      flow round the hand gives it (darcyDrift; 0.062 of the plate), where
 *      left alone it moves under 0.5%. (Until PLAN 38r part 2, the bands'
 *      centre of mass within 0.02 of the path, held to 2%: below, at the
 *      check, why that read the window and not the colour.)
 *   3. A pool of ferrofluid on the path is carried along it by the flow
 *      alone, at least 6% of the plate (13.8% measured; the Finger's
 *      hand-written carry was held to 2% in `npm run ferrohands`), and
 *      under a fast stroke and on a Labyrinth (where the colour too is
 *      carried in the maze's fixed substeps) at least four fifths as far.
 *      Those carries take substeps of under half a cell, six of them, and a
 *      hand faster than they allow left the pool behind it: 8.6% against
 *      13.1% before they followed the hand, 12.6% against 13.8% after.
 *   4. A drop of oil on the path is carried along it, at least 6% of the
 *      plate (10.4% measured, 12.2% on the carries' old faces).
 *   5. Nothing is made or lost: the colour, the ferrofluid and the oil
 *      each to 0.5%, and the plate left alone keeps its colour to 0.1%.
 *   6. And it stops when the hand stops: half a second on, the liquid
 *      where the hand stopped goes at under twice what the gap's drag time
 *      leaves of the hand's speed, e^(−0.5/τ).
 *   7. A full pool (5.5 at its middle, the plate's cap is 6) keeps its
 *      colour to 0.5% under a hand drawn as the pointer draws one, a cell
 *      every third step, and the same pool left alone to 0.1%. Found by
 *      the Mac's `npm run tools`: 40.5% of it was cut at the cap before the
 *      carries took the thin solve's own faces.
 *
 * The old push (the velocity fingerDrag laid before) is run and printed as
 * the before: on a thin gap it moved the bands 0.13% and the pool 0.04%, as
 * the plate moves them alone.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1). About half an
 * hour in a cloud session.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  Check 2's stripe and what real liquid does to it. A stripe of colour 0.04
  of the plate wide along the stroke's path, from just ahead of where the
  hand is put down (0.3, its radius 0.054) to past where it stops (0.7).

  Between two glasses the liquid round a solid moving through it is a
  potential flow (check 1 holds the solver to it): round a disc of radius a
  moving at U, u = U·a²·(x² − y², 2xy)/r⁴ from its centre. Every particle
  of liquid it passes is pushed ahead and round it and left behind further
  on than it was (Darwin's drift), and the nearer the path, the further:
  on the path itself the front's stagnation point carries it all the way.
  darcyDrift follows the stripe's particles through that flow as the hand
  goes from 0.3 to 0.7 (fourth-order Runge–Kutta, 1600 steps; a particle
  the disc has swallowed between two steps is set back on its rim) and
  returns the mean distance they moved along the stroke, in plates: 0.062
  for this stripe and hand. The solver's colour is read the same way, as
  the stripe's whole centre of mass before and after, wherever the colour
  went, so the two are the same measure: the colour's own drift, the
  feature, not what a window across the path happens to hold.
*/
const STRIPE = { w: 0.02, x0: 0.36, x1: 0.75 };
function darcyDrift(a, from = 0.3, to = 0.7, steps = 1600, n = 600) {
  const px = [], py = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n, y = (j + 0.5) / n;
    if (Math.abs(y - 0.5) < STRIPE.w && x > STRIPE.x0 && x < STRIPE.x1) { px.push(x); py.push(y); }
  }
  const x0 = px.slice(), U = to - from, h = 1 / steps;
  const vel = (x, y, xc) => { const dx = x - xc, dy = y - 0.5, r2 = dx * dx + dy * dy, r4 = r2 * r2 + 1e-30; return [U * a * a * (dx * dx - dy * dy) / r4, U * a * a * 2 * dx * dy / r4]; };
  for (let k = 0; k < steps; k++) {
    const xc = from + U * k * h, xm = xc + U * h / 2, xe = xc + U * h;
    for (let p = 0; p < px.length; p++) {
      const x = px[p], y = py[p];
      const [u1, v1] = vel(x, y, xc), [u2, v2] = vel(x + h / 2 * u1, y + h / 2 * v1, xm);
      const [u3, v3] = vel(x + h / 2 * u2, y + h / 2 * v2, xm), [u4, v4] = vel(x + h * u3, y + h * v3, xe);
      let nx = x + h / 6 * (u1 + 2 * u2 + 2 * u3 + u4), ny = y + h / 6 * (v1 + 2 * v2 + 2 * v3 + v4);
      const dx = nx - xe, dy = ny - 0.5, r = Math.hypot(dx, dy);
      if (r < a) { nx = xe + dx / r * a; ny = 0.5 + dy / r * a; }
      px[p] = nx; py[p] = ny;
    }
  }
  let s = 0; for (let p = 0; p < px.length; p++) s += px[p] - x0[p];
  return s / px.length;
}

const { page, close } = await openLab();
try {
  /*
    One stroke on a fresh plate. `hand` is 'solid' (the Finger as it is
    now) or 'push' (the velocity fingerDrag laid before, as the control);
    `liquid` is what sits on the path besides the colour; `speed` is the
    hand's cells a step on the app's 192-cell plate.
  */
  const run = (hand, liquid, speed) => page.evaluate(async ({ hand, liquid, speed, STRIPE }) => {
    const N = 384, L = 192;
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, oilTension: liquid === 'oil' ? 0.5 : 0, ferroLabyrinth: liquid === 'maze' ? 0.6 : 0 };
    await lab.create(N, L);
    const s = lab.solver();
    // Bands of colour across the stroke, a twentieth of the plate apart, in the
    // dish; or, for check 2, one stripe of colour along the stroke's path alone
    // (STRIPE), ahead of where the hand is put down.
    const lay = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L, y = (j + 0.5) / L;
      if (liquid === 'stripe' ? !(Math.abs(y - 0.5) < STRIPE.w && x > STRIPE.x0 && x < STRIPE.x1) : (Math.hypot(x - 0.5, y - 0.5) > 0.45 || Math.floor(x * 20) % 2)) continue;
      const k = (i + j * L) * 4; lay[k] = 1; lay[k + 3] = 1;
    }
    lab.addDye(lay); lab.flush(DT);
    const POOL = { x: 0.42, y: 0.5, r: 0.06 };
    if (liquid === 'ferro' || liquid === 'maze') lab.addPhase(POOL.x, POOL.y, POOL.r, 0.9);
    if (liquid === 'oil') s.addMix(POOL.x, POOL.y, POOL.r, { oil: 1 });
    await lab.step(30, over);
    const read = async () => {
      const d = await lab.field('dye');
      let bs = 0, bw = 0, dye = 0, dx = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = (i + j * L) * 4, x = (i + 0.5) / L, y = (j + 0.5) / L;
        dye += d[k]; dx += d[k] * x;
        if (Math.abs(y - 0.5) < 0.02 && x > 0.2 && x < 0.8) { bs += d[k] * x; bw += d[k]; }
      }
      let m = 0, mx = 0;
      const solo = liquid === 'none' || liquid === 'stripe';
      if (!solo) {
        const f = liquid === 'oil' ? await s.readChemistry('mix') : await lab.phase();
        const n = f.n, stride = liquid === 'oil' ? 4 : 1;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = f.data[(x + y * n) * stride]; m += v; mx += v * (x + 0.5) / n; }
      }
      // A pool or a drop that was poured and is not there is a broken plate, not a pool that did not move.
      if (!solo && !(m > 0)) throw new Error(`no ${liquid} on the plate to measure`);
      return { band: bw > 0 ? bs / bw : 0, dye, dyeX: dye > 0 ? dx / dye : 0, mass: m, cx: m > 0 ? mx / m : 0 };
    };
    const t0 = await read();
    const r = Math.round(7 * (L / 128));
    const hy = 0.5 * L;
    let hx = 0.3 * L;
    const steps = Math.round(0.4 * L / speed);
    let under = 0, beside = 0, still = 0;
    const disp = DT * look.advection * (N - 2) / N;
    // The liquid's mean speed along x round (cx, cy), in the hand's cells a step.
    const mean = (vel, cx, cy, rad) => { let a = 0, n = 0;
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) { if (i * i + j * j > rad * rad) continue; a += vel[((Math.round(cx) + i) + (Math.round(cy) + j) * L) * 4]; n++; }
      return a / n * disp * L; };
    for (let k = 0; k < steps; k++) {
      hx += speed;
      if (hand === 'solid') lab.finger(hx, hy, r, speed, 0);
      else if (hand === 'push') {
        // fingerDrag's velocity, as it laid it before (the mouse's strength, its swirl).
        const v = new Array(L * L * 4).fill(0);
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          const d2 = i * i + j * j; if (d2 >= r * r) continue;
          const idx = (Math.round(hx) + i) + (hy + j) * L, w = 1 - Math.sqrt(d2) / r, sgn = j >= 0 ? 1 : -1, rr = Math.sqrt(d2) || 1;
          v[idx * 4] += (1 + (-j / rr) * sgn * 0.8) * 0.09 * w;
          v[idx * 4 + 1] += ((i / rr) * sgn * 0.8) * 0.09 * w;
        }
        lab.addVel(v);
      }
      lab.flush(DT);
      await lab.step(1, over, true);
      if (k === steps - 1) {
        // The liquid's speed under the hand and a sixth of the plate beside its track, in the hand's cells a step.
        const vel = await lab.field('vel');
        under = mean(vel, hx, hy, Math.floor(r / 2));
        beside = mean(vel, hx, hy + L / 6, Math.floor(r / 2));
      }
    }
    const t1 = await read();
    await lab.step(30, over);
    still = mean(await lab.field('vel'), hx, hy, Math.floor(r / 2));
    await lab.step(30, over);
    const t2 = await read();
    // The drag time ρh²/12μ at the rest gap, in seconds, and the seconds half a second of the lab's steps stands for.
    const h = lab.REST_GAP_METRES;
    const tau = h * h / (12 * lab.thinGapViscosity(over.gapThickness));
    return { t0, t1, t2, under, beside, still, speed, a: r - lab.handEdge(L) / 2, d: L / 6, tau, half: 30 / 60 };
  }, { hand, liquid, speed, STRIPE });

  /*
    A full pool drawn as the pointer draws it, for check 7. The pool is as
    full as the plate lets a pool be (5.5 across its flat middle; the plate cuts any
    cell past 6, capDye), and the hand goes from its middle 0.16 of the
    plate as tools.mjs's stroke goes: thirty moves in a second and a half,
    so at sixty steps a second the hand jumps a cell on one step in three
    and is still on the other two. Returns the colour before, after the
    stroke and a second on, the pool's fullest cell and its middle (x)
    before and after, and how many of the moves laid no hand; with `hand`
    false, the same pool left alone as long.
  */
  const poolRun = (hand) => page.evaluate(async (hand) => {
    const N = 384, L = 192;
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection };
    await lab.create(N, L);
    const lay = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const d = Math.hypot((i + 0.5) / L - 0.42, (j + 0.5) / L - 0.5);
      if (d > 0.05) continue;
      // Flat-topped (a quartic, not a paraboloid): since PLAN 18m a pool
      // this deep slumps under its own weight, and the paraboloid's middle
      // ran down from 5.5 to 5.00 in the second before the stroke (Metal,
      // #364), the edge of the "fullest cell 5 or more" this asks for. A
      // flat top is as full and slumps from its rim, not its middle.
      const k = (i + j * L) * 4, v = 5.5 * (1 - (d / 0.05) ** 4);
      lay[k] = v; lay[k + 3] = v;
    }
    lab.addDye(lay); lab.flush(DT);
    await lab.step(60, over);
    const colour = async () => {
      const d = await lab.field('dye');
      let t = 0, top = 0, mx = 0;
      for (let k = 3; k < d.length; k += 4) { t += d[k]; top = Math.max(top, d[k]); mx += d[k] * ((((k - 3) / 4) % L) + 0.5) / L; }
      return { t, top, cx: t > 0 ? mx / t : 0 };
    };
    const c0 = await colour();
    const r = Math.round(7 * (L / 128)), hy = 0.5 * L;
    let hx = 0.42 * L, missed = 0;
    for (let k = 0; k < 90; k++) {
      if (hand && k % 3 === 0) { hx += 0.16 * L / 30; if (lab.finger(hx, hy, r, 0.16 * L / 30, 0) === 0) missed++; }
      lab.flush(DT);
      await lab.step(1, over, true);
    }
    const c1 = await colour();
    await lab.step(60, over);
    const c2 = await colour();
    return { t0: c0.t, t1: c1.t, t2: c2.t, top: c0.top, cx0: c0.cx, cx1: c1.cx, missed };
  }, hand);

  const got = {};
  const only = process.env.FF_RUNS ? process.env.FF_RUNS.split(',') : null;
  for (const [name, hand, liquid, speed] of [['solid', 'solid', 'none', 2], ['solid fast', 'solid', 'none', 5], ['solid ferro', 'solid', 'ferro', 2], ['solid ferro fast', 'solid', 'ferro', 5], ['solid oil', 'solid', 'oil', 2], ['solid maze fast', 'solid', 'maze', 5], ['push ferro', 'push', 'ferro', 2], ['alone', 'none', 'ferro', 2], ['stripe', 'solid', 'stripe', 2], ['stripe alone', 'none', 'stripe', 2]]) {
    if (only && !only.includes(name)) continue;
    const t = Date.now();
    const m = got[name] = await run(hand, liquid, speed);
    console.log(`  ${name}: bands ${((m.t1.band - m.t0.band) * 100).toFixed(2)}%, ${liquid} ${((m.t1.cx - m.t0.cx) * 100).toFixed(2)}% then ${((m.t2.cx - m.t1.cx) * 100).toFixed(2)}% in the second after; under the hand ${m.under.toFixed(2)} cells a step, beside ${m.beside.toFixed(2)}, half a second after it stopped ${m.still.toFixed(3)}, for ${speed}; colour kept ${(m.t2.dye / m.t0.dye * 100).toFixed(2)}%, ${liquid} ${(m.t2.mass / Math.max(m.t0.mass, 1e-9) * 100).toFixed(2)}% (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
  if (!only || only.includes('pool')) {
    for (const [name, hand] of [['pool', true], ['pool alone', false]]) {
      const t = Date.now();
      const m = got[name] = await poolRun(hand);
      console.log(`  ${name}: colour ${m.t0.toFixed(1)} → ${m.t1.toFixed(1)} after the stroke → ${m.t2.toFixed(1)} a second on; fullest cell ${m.top.toFixed(2)}, its middle moved ${((m.cx1 - m.cx0) * 100).toFixed(2)}% of the plate${hand ? `, ${m.missed} of 30 moves laid no hand` : ''} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
    }
  }
  console.log('');
  const band = (m) => m.t1.band - m.t0.band;
  const moved = (m) => m.t1.cx - m.t0.cx;
  const pc = (v) => `${(v * 100).toFixed(2)}%`;
  const need = (...ks) => ks.every((k) => got[k]);

  // 1.
  {
    /*
      Beside the stroke, the flow past a moving solid in a thin layer: a
      Hele-Shaw cell's flow outside the hand is a potential flow, so round a
      disc of radius a moving at U it is a dipole, and straight to the side
      at a distance d the liquid goes back the other way at U·a²/d². It falls
      as the square of the distance, not as a push spread over the plate,
      and it is not nothing (it is the liquid getting out of the hand's way).
      a is the finger's radius less half its soft rim (handEdge), where χ is
      a half.
    */
    const ks = ['solid', 'solid fast', 'solid ferro', 'solid oil'];
    const dipole = (m) => -m.speed * (m.a / m.d) ** 2;
    check('the liquid under the finger moves at the hand\'s speed, and beside it gives way as the flow past a solid does',
      need(...ks) && ks.every((k) => { const m = got[k]; return Math.abs(m.under / m.speed - 1) < 0.1 && m.beside / dipole(m) > 0.7 && m.beside / dipole(m) < 1.4; }),
      ks.filter((k) => got[k]).map((k) => { const m = got[k]; return `${k}: ${m.under.toFixed(2)} cells a step under a hand at ${m.speed}, ${m.beside.toFixed(2)} a sixth of the plate beside it (a dipole's ${dipole(m).toFixed(2)})`; }).join('; '));
  }
  /*
    2 to 4 are judged against the plate left alone, not against the old
    push: the push (printed, as the before) is what this replaces, and a
    push that had stopped reaching the liquid would pass "moved nothing"
    on nothing.
  */
  console.log(`  before (the old push on a thin gap): the bands ${pc(band(got['push ferro'] ?? { t0: {}, t1: {} }))}, the pool ${pc(moved(got['push ferro'] ?? { t0: {}, t1: {} }))}; under the hand ${(got['push ferro']?.under ?? NaN).toFixed(2)} cells a step`);
  // 2.
  /*
    The colour's own drift, against the real liquid's (STRIPE, darcyDrift).
    This read the bands' centre of mass inside a window 0.02 either side of
    the path, and held it to 2% of the plate: 2.2% on the 6 mm gap, 1.17%
    on the 2 mm one (PLAN 38r part 2), though the stripe's colour itself
    went further there (10.1%, software WebGPU). A window across the path is
    not the colour on the path: the hand pushes what was in it out to the
    sides, the bands beside the path flow in behind it, and what the window
    holds is that exchange, which at 6 mm the liquid's own momentum after
    the hand tipped forward (its drag time 0.14 s, 0.015 s at 2 mm). Laid
    on the path alone and read wherever it goes, the colour is measured as
    the real liquid would carry it: at least three quarters of Darcy's
    drift and under twice it (a hand that swept the colour ahead of it as
    a broom would carry the whole stripe to its end, over three times),
    where left alone it moves under 0.5%.
  */
  {
    const m = got.stripe, still = got['stripe alone'];
    const darcy = m ? darcyDrift(m.a / 192) : NaN;
    const drift = (r) => r.t2.dyeX - r.t0.dyeX;
    check('the colour on the stroke\'s path goes the stroke\'s way, as far as a solid drawn through the liquid carries it, where left alone it barely moves',
      need('stripe', 'stripe alone') && drift(m) >= 0.75 * darcy && drift(m) < 2 * darcy && Math.abs(drift(still)) < 0.005,
      need('stripe', 'stripe alone') ? `a stripe along the path ${pc(drift(m))} of the plate along it, against ${pc(darcy)} in the potential flow round a disc of the hand's radius (${(drift(m) / darcy).toFixed(2)}×, bar 0.75 to 2); left alone ${pc(drift(still))}; the bands within 0.02 of the path, the old window, ${pc(band(got.solid ?? { t0: {}, t1: {} }))}` : 'not run');
  }
  // 3.
  check('a pool of ferrofluid on the path is carried along it by the flow, as far under a fast stroke, and on a Labyrinth',
    need('solid ferro', 'solid ferro fast', 'solid maze fast', 'alone') && moved(got['solid ferro']) >= 0.06 && moved(got['solid ferro']) < 0.4 &&
      moved(got['solid ferro fast']) >= 0.8 * moved(got['solid ferro']) && moved(got['solid maze fast']) >= 0.8 * moved(got['solid ferro']) && Math.abs(moved(got.alone)) < 0.005,
    need('solid ferro', 'solid ferro fast', 'solid maze fast', 'alone') ? `${pc(moved(got['solid ferro']))} of the plate, ${pc(moved(got['solid ferro fast']))} at five cells a step, ${pc(moved(got['solid maze fast']))} at five on a Labyrinth; left alone ${pc(moved(got.alone))}` : 'not run');
  // 4.
  check('a drop of oil on the path is carried along it by the flow',
    need('solid oil') && moved(got['solid oil']) >= 0.06 && moved(got['solid oil']) < 0.4,
    need('solid oil') ? `${pc(moved(got['solid oil']))} of the plate` : 'not run');
  // 5.
  {
    /*
      The colour, the ferrofluid and the oil each to 0.5%. The oil had 1%:
      it is the one field clamped to [0, 1] after its carry, and while the
      carries crossed faces rebuilt from the cells' velocities (PLAN 18a-8)
      they squeezed it at the hand's soft edge and the clamp cut it, 0.44%
      of a drop drawn 0.4 of the plate (1.2% with a hand edge of a cell and
      a half). On the thin solve's own faces (THIN_FACE) it keeps 100.00%,
      as the colour does, so it is held to the colour's bar. And the plate
      left alone keeps its colour to 0.1%, so the hand's share is not the
      plate's own.
    */
    const ks = ['solid', 'solid fast', 'solid ferro', 'solid ferro fast', 'solid oil', 'solid maze fast', 'alone'];
    const off = (m, key) => Math.abs(m.t2[key] / m.t0[key] - 1);
    check('none of the colour, the ferrofluid or the oil is made or lost',
      need(...ks) && ks.every((k) => off(got[k], 'dye') < (k === 'alone' ? 0.001 : 0.005) && (got[k].t0.mass === 0 || off(got[k], 'mass') < 0.005)),
      ks.filter((k) => got[k]).map((k) => `${k}: colour ${pc(got[k].t2.dye / got[k].t0.dye - 1)}${got[k].t0.mass > 0 ? `, the ${k.includes('oil') ? 'oil' : 'ferrofluid'} ${pc(got[k].t2.mass / got[k].t0.mass - 1)}` : ''}`).join('; '));
  }
  // 6.
  {
    /*
      Asked of the flow in clear liquid, not of where the pool, the drop or
      the bands are afterwards. A pool drawn out into a tongue pulls itself
      back into a round drop by its own surface tension once the hand has
      gone, which moves liquid with no hand at all; and the bands' chevrons
      blur across the path as the colour diffuses, which moves the centre
      of mass of the colour within 0.02 of the path back toward where it
      was (−1.9% of the plate in the second after a slow stroke, measured).
      What a liquid in a gap does when the push stops is slow down over its
      drag time τ = ρh²/12μ, about 0.13 s on Classic: so half a second on it
      goes at e^(−0.5/τ) of the hand's speed, about 2%. Held to twice that.
      A hand still laid after it was lifted would read the hand's speed.
    */
    const ks = ['solid', 'solid fast'];
    const decay = (m) => Math.exp(-m.half / m.tau);
    check('and it stops when the hand stops: half a second later the liquid where it stopped has slowed as the gap\'s drag says',
      need(...ks) && ks.every((k) => Math.abs(got[k].still) < 2 * decay(got[k]) * got[k].speed),
      ks.filter((k) => got[k]).map((k) => `${got[k].still.toFixed(3)} cells a step half a second after a hand at ${got[k].speed}, against e^(−0.5/τ) of it, ${(decay(got[k]) * got[k].speed).toFixed(3)} (τ ${got[k].tau.toFixed(3)} s)`).join('; '));
  }
  // 7.
  {
    /*
      And a full pool keeps its colour under a hand drawn as the pointer
      draws one. Found by the Mac's \`npm run tools\`: its Finger, drawn
      through a pool the Drop had laid, took 222 of the plate's colour to 161
      where the plate left alone gained 17. The carries crossed faces rebuilt
      from the cells' velocities with the pressure as if the drag were even
      (PLAN 18a-8), and a solid is where it is not: at the hand's rim those
      faces gathered liquid, a full pool's cells went past the plate's cap
      of 6, and the cap cut them. Here, before the carries took the solve's
      own faces (THIN_FACE in wgsl/fluid.ts), this stroke took the pool's
      795.9 to 473.8 on this check's step, 40% of it gone (lab, software);
      bands at 1 never came near the cap, which is why checks 1 to 6 passed.

      Kept colour is only a reading if the hand moved the pool and the pool
      was near the cap (check-skeptic): a hand that laid nothing keeps it
      too. So every move has to lay a hand, the pool's middle has to go at
      least a quarter of the stroke (0.04 of the plate), and its fullest
      cell has to start at 5 or more. And the same pool left alone keeps
      its colour to 0.1%, so a loss is the hand's and not the plate's.
    */
    const m = got.pool, a = got['pool alone'];
    check('a full pool keeps its colour under a hand drawn as the pointer draws one',
      !!m && !!a && m.missed === 0 && m.top >= 5 && m.cx1 - m.cx0 >= 0.04 && Math.abs(m.t2 / m.t0 - 1) < 0.005 && Math.abs(a.t2 / a.t0 - 1) < 0.001,
      m && a ? `${m.t0.toFixed(1)} → ${m.t2.toFixed(1)}, ${pc(m.t2 / m.t0 - 1)}, the pool's middle carried ${pc(m.cx1 - m.cx0)} of the plate from a fullest cell of ${m.top.toFixed(2)}; left alone ${pc(a.t2 / a.t0 - 1)}` : 'not run');
  }
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
