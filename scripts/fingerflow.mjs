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
 *   2. The colour on the stroke's path goes the stroke's way: the bands'
 *      centre of mass within 0.02 of the path moves at least 2% of the
 *      plate along it (2.8% measured in software), where left alone it
 *      moves under 0.5%.
 *   3. A pool of ferrofluid on the path is carried along it by the flow
 *      alone, at least 6% of the plate (13.8% measured; the Finger's
 *      hand-written carry was held to 2% in `npm run ferrohands`), and
 *      under a fast stroke and on a Labyrinth (where the colour too is
 *      carried in the maze's fixed substeps) at least four fifths as far.
 *      Those carries take substeps of under half a cell, six of them, and a
 *      hand faster than they allow left the pool behind it: 8.6% against
 *      13.1% before they followed the hand, 12.6% against 13.8% after.
 *   4. A drop of oil on the path is carried along it, at least 6% of the
 *      plate (12.2% measured).
 *   5. Nothing is made or lost: the colour and the ferrofluid each to
 *      0.5%, the oil to 1% (check 5 says why the oil's is wider), and the
 *      plate left alone keeps its colour to 0.1%.
 *   6. And it stops when the hand stops: half a second on, the liquid
 *      where the hand stopped goes at under twice what the gap's drag time
 *      leaves of the hand's speed, e^(−0.5/τ).
 *
 * The old push (the velocity fingerDrag laid before) is run and printed as
 * the before: on a thin gap it moved the bands 0.13% and the pool 0.04%, as
 * the plate moves them alone.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1). About twenty
 * minutes in a cloud session.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  /*
    One stroke on a fresh plate. `hand` is 'solid' (the Finger as it is
    now) or 'push' (the velocity fingerDrag laid before, as the control);
    `liquid` is what sits on the path besides the colour; `speed` is the
    hand's cells a step on the app's 192-cell plate.
  */
  const run = (hand, liquid, speed) => page.evaluate(async ({ hand, liquid, speed }) => {
    const N = 384, L = 192;
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, oilTension: liquid === 'oil' ? 0.5 : 0, ferroLabyrinth: liquid === 'maze' ? 0.6 : 0 };
    await lab.create(N, L);
    const s = lab.solver();
    // Bands of colour across the stroke, a twentieth of the plate apart, in the dish.
    const lay = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const x = (i + 0.5) / L, y = (j + 0.5) / L;
      if (Math.hypot(x - 0.5, y - 0.5) > 0.45 || Math.floor(x * 20) % 2) continue;
      const k = (i + j * L) * 4; lay[k] = 1; lay[k + 3] = 1;
    }
    lab.addDye(lay); lab.flush(DT);
    const POOL = { x: 0.42, y: 0.5, r: 0.06 };
    if (liquid === 'ferro' || liquid === 'maze') lab.addPhase(POOL.x, POOL.y, POOL.r, 0.9);
    if (liquid === 'oil') s.addMix(POOL.x, POOL.y, POOL.r, { oil: 1 });
    await lab.step(30, over);
    const read = async () => {
      const d = await lab.field('dye');
      let bs = 0, bw = 0, dye = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = (i + j * L) * 4, x = (i + 0.5) / L, y = (j + 0.5) / L;
        dye += d[k];
        if (Math.abs(y - 0.5) < 0.02 && x > 0.2 && x < 0.8) { bs += d[k] * x; bw += d[k]; }
      }
      let m = 0, mx = 0;
      if (liquid !== 'none') {
        const f = liquid === 'oil' ? await s.readChemistry('mix') : await lab.phase();
        const n = f.n, stride = liquid === 'oil' ? 4 : 1;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = f.data[(x + y * n) * stride]; m += v; mx += v * (x + 0.5) / n; }
      }
      // A pool or a drop that was poured and is not there is a broken plate, not a pool that did not move.
      if (liquid !== 'none' && !(m > 0)) throw new Error(`no ${liquid} on the plate to measure`);
      return { band: bs / bw, dye, mass: m, cx: m > 0 ? mx / m : 0 };
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
    const h = 0.03 * 0.2;
    const tau = h * h / (12 * lab.thinGapViscosity(over.gapThickness));
    return { t0, t1, t2, under, beside, still, speed, a: r - lab.handEdge(L) / 2, d: L / 6, tau, half: 30 / 60 };
  }, { hand, liquid, speed });

  const got = {};
  const only = process.env.FF_RUNS ? process.env.FF_RUNS.split(',') : null;
  for (const [name, hand, liquid, speed] of [['solid', 'solid', 'none', 2], ['solid fast', 'solid', 'none', 5], ['solid ferro', 'solid', 'ferro', 2], ['solid ferro fast', 'solid', 'ferro', 5], ['solid oil', 'solid', 'oil', 2], ['solid maze fast', 'solid', 'maze', 5], ['push ferro', 'push', 'ferro', 2], ['alone', 'none', 'ferro', 2]]) {
    if (only && !only.includes(name)) continue;
    const t = Date.now();
    const m = got[name] = await run(hand, liquid, speed);
    console.log(`  ${name}: bands ${((m.t1.band - m.t0.band) * 100).toFixed(2)}%, ${liquid} ${((m.t1.cx - m.t0.cx) * 100).toFixed(2)}% then ${((m.t2.cx - m.t1.cx) * 100).toFixed(2)}% in the second after; under the hand ${m.under.toFixed(2)} cells a step, beside ${m.beside.toFixed(2)}, half a second after it stopped ${m.still.toFixed(3)}, for ${speed}; colour kept ${(m.t2.dye / m.t0.dye * 100).toFixed(2)}%, ${liquid} ${(m.t2.mass / Math.max(m.t0.mass, 1e-9) * 100).toFixed(2)}% (${((Date.now() - t) / 1000).toFixed(0)} s)`);
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
  check('the colour on the stroke\'s path goes the stroke\'s way, where left alone it barely moves',
    need('solid', 'alone') && band(got.solid) >= 0.02 && Math.abs(band(got.alone)) < 0.005,
    need('solid', 'alone') ? `the bands within 0.02 of the path ${pc(band(got.solid))} of the plate along it; left alone ${pc(band(got.alone))}` : 'not run');
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
      The colour and the ferrofluid to 0.5%, the oil to 1%. The oil is the
      one field clamped to [0, 1] after its carry, so where the carry's face
      velocities, rebuilt from the cells' (PLAN 18a-8), squeeze it at the
      hand's soft edge it is cut and not kept: 0.44% of a drop drawn 0.4 of
      the plate, measured in software, and 1.2% with a hand edge of a cell
      and a half (lib/handSolid.ts, handEdge). And the plate left alone keeps
      its colour to 0.1%, so the hand's share is not the plate's own.
    */
    const ks = ['solid', 'solid fast', 'solid ferro', 'solid ferro fast', 'solid oil', 'solid maze fast', 'alone'];
    const off = (m, key) => Math.abs(m.t2[key] / m.t0[key] - 1);
    const bar = (k) => k === 'solid oil' ? 0.01 : 0.005;
    check('none of the colour, the ferrofluid or the oil is made or lost',
      need(...ks) && ks.every((k) => off(got[k], 'dye') < (k === 'alone' ? 0.001 : 0.005) && (got[k].t0.mass === 0 || off(got[k], 'mass') < bar(k))),
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
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
