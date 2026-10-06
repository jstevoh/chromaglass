#!/usr/bin/env node
/**
 * A Blow's wind on a thin gap is air on the film: the breath's stress on the
 * surface is a force the solve takes in for as long as the breath goes on,
 * and the flow it drives carries the colour, the oil and the ferrofluid,
 * with no hand-written carry (PLAN.md §15g, lib/breath.ts). Measured on the
 * GPU solver (scripts/lab.mjs) on the lab's plate at Classic's step,
 * advection and Thickness (the app's grids, 384² under 192), with the breath
 * laid as the app's blowWind lays it.
 *
 *   npm run airblow
 *
 * What was there. A moving Blow added a disc of velocity along the stroke
 * and moved the colour, the oil and the ferrofluid by a take from under the
 * hand and a put a hop ahead (blowDye, blowOil, blowCarry), once a reading
 * of the dye. On a thin gap the disc is mostly the divergent part of a flow,
 * which the solve takes back out: measured here as the before, the push
 * blowDirected laid, swirl and all, drawn through the same pool.
 *
 * The stroke is drawn as the pointer draws one in `npm run tools`: thirty
 * moves in a second and a half, 0.16 of the plate, the breath laid on every
 * step along the way the hand last went (the app holds it 150 ms, longer
 * than the step between moves). The checks:
 *
 *   1. Under a breath held in one place the liquid goes the breath's way at
 *      the speed the physics gives it, τh/2μ (lib/breath.ts) times the
 *      share of a disc of force a rigid film lets through, which is a half
 *      for a uniform disc in an unbounded layer (the rest is the divergent
 *      part, the pressure's to take), less for the breath's softer edge
 *      and a footprint six cells across: read between 0.28 and 0.47 of
 *      τh₀/2μ (0.37 measured in software).
 *      And on a liquid ten times as thick (Thickness 0.45 → 0.783), a
 *      tenth as fast, within a fifth, and under a held Press that has
 *      closed the gap, slower as the gap is: the stress is the air's and
 *      the speed is the liquid's answer to it, τh/2μ, where the old push
 *      moved every liquid alike.
 *   2. And it stops when the breath stops: half a second on, the liquid
 *      under it goes at under twice what the gap's drag time leaves,
 *      e^(−0.5/τ) of what it went at.
 *   3. A pool of colour the wind is drawn across goes the wind's way, out
 *      to the right and out to the left, its centre of mass at least 0.5% of
 *      the plate, where left alone it moves under 0.1%. Measured in software
 *      +2.72% and +2.82% at the breath's 8 m/s (+1.04% and +1.11% at the
 *      6 m/s it was first set to, as far as the carries moved a pool: 1.06%
 *      in `npm run wind`), and the old push alone +0.02%: the bar is under a
 *      fifth of what the air does and twenty-five times what the push did.
 *   4. And keeps its colour to 0.5% (the carries kept 99.4% of a puff's;
 *      the old eraser lost 21%), the pool left alone to 0.1%.
 *   5. A pool of ferrofluid and a drop of oil under the same wind are
 *      carried along by the flow alone, each at least half as far as the
 *      colour, none of either made or lost (0.5%).
 *
 * The old push is run and printed as the before, as `npm run fingerflow`
 * prints the Finger's.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else (PW_WEBGPU=1).
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
    A stroke on a fresh plate. `wind` is 'air' (the breath as it is now),
    'push' (blowDirected's velocity, the before) or 'none'; `sign` the way
    it goes along x; `liquid` what is in the pool besides the colour.
  */
  const stroke = (wind, sign, liquid) => page.evaluate(async ({ wind, sign, liquid }) => {
    const N = 384, L = 192;
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, oilTension: liquid === 'oil' ? 0.5 : 0 };
    await lab.create(N, L);
    const s = lab.solver();
    const POOL = { x: 0.5, y: 0.5, r: 0.06 };
    lab.dye(POOL.x, POOL.y, POOL.r, [0.2, 0.5, 0.9], 1);
    lab.flush(DT);
    if (liquid === 'ferro') lab.addPhase(POOL.x, POOL.y, POOL.r, 0.9);
    if (liquid === 'oil') s.addMix(POOL.x, POOL.y, POOL.r, { oil: 1 });
    await lab.step(30, over);
    const read = async () => {
      const d = await lab.field('dye');
      let t = 0, mx = 0;
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const v = d[(i + j * L) * 4 + 3]; t += v; mx += v * (i + 0.5) / L; }
      let m = 0, fx = 0;
      if (liquid !== 'none') {
        const f = liquid === 'oil' ? await s.readChemistry('mix') : await lab.phase();
        const n = f.n, stride = liquid === 'oil' ? 4 : 1;
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = f.data[(x + y * n) * stride]; m += v; fx += v * (x + 0.5) / n; }
        if (!(m > 0)) throw new Error(`no ${liquid} on the plate to measure`);
      }
      return { dye: t, cx: mx / t, mass: m, fx: m > 0 ? fx / m : 0 };
    };
    const t0 = await read();
    const R = lab.BLOW_RADIUS * L / 128;
    let hx = POOL.x * L;
    const hy = POOL.y * L;
    let laid = 0;
    for (let k = 0; k < 90; k++) {
      if (k % 3 === 0) hx += sign * 0.16 * L / 30;
      if (wind === 'air') { if (lab.breath(hx, hy, R, sign, 0) > 0) laid++; }
      else if (wind === 'push') {
        // blowDirected's velocity, as it laid it (the mouse's strength, its swirl).
        const v = new Array(L * L * 4).fill(0), r = Math.round(R), st = lab.BLOW_STRENGTH;
        for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          const d2 = i * i + j * j; if (d2 >= r * r) continue;
          const idx = (Math.round(hx) + i) + (Math.round(hy) + j) * L, w = 1 - Math.sqrt(d2) / r, rr = Math.sqrt(d2) || 1;
          const sgn = (j * sign) >= 0 ? 1 : -1;
          v[idx * 4] += (sign + (-j / rr) * sgn * 0.5) * st * w;
          v[idx * 4 + 1] += ((i / rr) * sgn * 0.5) * st * w;
        }
        lab.addVel(v);
      }
      lab.flush(DT);
      await lab.step(1, over, true);
    }
    await lab.step(30, over);
    const t1 = await read();
    return { t0, t1, laid };
  }, { wind, sign, liquid });

  /*
    A breath held in one place, blowing along +x, on a fresh plate of clear
    liquid at `thickness`: the liquid's mean speed along x under the
    breath's middle (within half its radius) once it has blown a second,
    and half a second after it stops, in m/s; and τh₀/2μ for the breath's
    middle on this liquid.
  */
  const held = (thickness, press = false) => page.evaluate(async ({ thickness, press }) => {
    const N = 384, L = 192;
    const look = lab.look('classic').settings;
    const DT = look.globalSpeed * 0.2;
    const over = { thinGap: 1, gapThickness: thickness, dt: DT, advection: look.advection };
    await lab.create(N, L);
    await lab.step(2, over);
    const R = lab.BLOW_RADIUS * L / 128, cx = L / 2, cy = L / 2;
    /*
      Pressed: a palm four times the breath's size held down on the middle
      of the plate as the app's Press lays it (lib/squish.ts), until the
      gap has stopped closing, and held on while the breath blows, so what
      flows under it is the breath's and not the press squeezing out.
    */
    const pressDown = () => { if (press) lab.squish(cx, cy, 4 * R, 0.004, 0, 'press', 0, true); };
    if (press) for (let k = 0; k < 120; k++) { pressDown(); lab.flush(DT); await lab.step(1, over, true); }
    const disp = DT * look.advection * (N - 2) / N;
    // Metres a second from the flow's units: plate widths a step over disp, 0.2 m plates, 60 steps a second.
    const mps = (v) => v * disp * 0.2 / lab.stepSeconds;
    const mean = (vel) => { let a = 0, n = 0; const rr = Math.floor(R / 2);
      for (let j = -rr; j <= rr; j++) for (let i = -rr; i <= rr; i++) { if (i * i + j * j > rr * rr) continue; a += vel[((cx + i) + (cy + j) * L) * 4]; n++; }
      return mps(a / n); };
    // The press alone, as long as the breath will blow: what the gap's own settling moves under it.
    let still = 0;
    if (press) { for (let k = 0; k < 60; k++) { pressDown(); lab.flush(DT); await lab.step(1, over, true); } still = mean(await lab.field('vel')); }
    for (let k = 0; k < 60; k++) { pressDown(); lab.breath(cx, cy, R, 1, 0); lab.flush(DT); await lab.step(1, over, true); }
    const blowing = mean(await lab.field('vel'));
    // The gap under the breath's middle, in metres (0.03 of a 0.2 m plate at rest).
    const sq = await lab.squeeze();
    let hs = 0, hn = 0;
    for (let j = 0; j < sq.n; j++) for (let i = 0; i < sq.n; i++) if (Math.hypot((i + 0.5) / sq.n - 0.5, (j + 0.5) / sq.n - 0.5) < 0.5 * R / L) { hs += sq.gap[i + j * sq.n]; hn++; }
    const h = (hs / hn) * 0.2;
    await lab.step(30, over);
    const after = mean(await lab.field('vel'));
    const nu = lab.thinGapViscosity(thickness);
    return { blowing, after, still, h, theory: lab.breathStress * h / (2 * 1000 * nu), tau: h * h / (12 * nu), half: 30 * lab.stepSeconds };
  }, { thickness, press });

  const only = process.env.AB_RUNS ? process.env.AB_RUNS.split(',') : null;
  const want = (k) => !only || only.includes(k);
  const got = {};
  const pc = (v) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
  for (const [name, th, press] of [['held', 0.45, false], ['held thick', 0.783, false], ['held pressed', 0.45, true]]) {
    if (!want(name)) continue;
    const t = Date.now();
    const m = got[name] = await held(th, press);
    console.log(`  ${name} (Thickness ${th}, gap ${(m.h * 1000).toFixed(2)} mm${press ? `, the press alone ${(m.still * 1000).toFixed(3)} mm/s` : ''}): ${(m.blowing * 1000).toFixed(2)} mm/s under the breath against τh/2μ ${(m.theory * 1000).toFixed(2)} (${(m.blowing / m.theory).toFixed(2)} of it); ${(m.after * 1000).toFixed(3)} mm/s half a second after it stopped, drag time ${m.tau.toFixed(3)} s (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
  for (const [name, wind, sign, liquid] of [['right', 'air', 1, 'none'], ['left', 'air', -1, 'none'], ['alone', 'none', 1, 'none'], ['push', 'push', 1, 'none'], ['ferro', 'air', 1, 'ferro'], ['oil', 'air', 1, 'oil']]) {
    if (!want(name)) continue;
    const t = Date.now();
    const m = got[name] = await stroke(wind, sign, liquid);
    console.log(`  ${name}: colour ${m.t0.dye.toFixed(1)} → ${m.t1.dye.toFixed(1)} (${pc(m.t1.dye / m.t0.dye - 1)}), its middle ${pc((m.t1.cx - m.t0.cx) * sign)} of the plate the wind's way${liquid !== 'none' ? `; the ${liquid} ${pc((m.t1.fx - m.t0.fx) * sign)}, ${pc(m.t1.mass / m.t0.mass - 1)} of it made or lost` : ''}${wind === 'air' ? `; breath laid on ${m.laid} of 90 steps` : ''} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
  console.log('');
  const need = (...ks) => ks.every((k) => got[k]);
  const along = (k) => (got[k].t1.cx - got[k].t0.cx) * (k === 'left' ? -1 : 1);
  // 1.
  {
    const a = got.held, b = got['held thick'], c = got['held pressed'];
    /*
      The share is held to a quarter either side of what software measured
      (0.37), not to the 0.3 to 0.8 a first version took: `theory` repeats
      the breath's own formula, so this band is the only guard on the
      constant that turns pascals into the flow's speed, and a breath twice
      as strong (a 2 dropped from 2μ) read 0.74 inside the wide one.
      Pressed: the speed under the breath, less what the held press moves
      there on its own, against the unpressed speed, as the gap against the
      rest gap, within a fifth; the press has to have closed the gap to
      under three quarters of its rest for it to say anything.
    */
    const share = a ? a.blowing / a.theory : 0;
    const gapRatio = a && c ? c.h / a.h : 1, speedRatio = a && c ? (c.blowing - c.still) / a.blowing : 0;
    check('under a held breath the liquid goes its way at the speed the air\'s stress gives it, τh/2μ: a tenth as fast in a liquid ten times as thick, slower where the gap is pressed',
      need('held', 'held thick', 'held pressed') && share > 0.28 && share < 0.47 && Math.abs((b.blowing / a.blowing) / (b.theory / a.theory) - 1) < 0.2 &&
        gapRatio < 0.75 && Math.abs(speedRatio / gapRatio - 1) < 0.2,
      need('held', 'held thick', 'held pressed') ? `${share.toFixed(2)} of τh₀/2μ; the thick liquid ${(b.blowing / a.blowing).toFixed(3)} as fast, against ${(b.theory / a.theory).toFixed(3)} from its viscosity; pressed to ${gapRatio.toFixed(2)} of the gap, ${speedRatio.toFixed(2)} as fast` : 'not run');
  }
  // 2.
  {
    const a = got.held;
    const decay = a ? Math.exp(-a.half / a.tau) : 0;
    check('and it stops when the breath stops, as the gap\'s drag says',
      !!a && Math.abs(a.after) < 2 * decay * Math.abs(a.blowing) + 1e-5,
      a ? `${(a.after * 1000).toFixed(3)} mm/s half a second on, against e^(−0.5/τ) of ${(a.blowing * 1000).toFixed(2)}, ${(decay * a.blowing * 1000).toFixed(3)}` : 'not run');
  }
  console.log(`  before (blowDirected's push on a thin gap, no carry): the pool's middle ${need('push') ? pc(along('push')) : 'not run'} the wind's way`);
  // 3.
  check('a pool of colour the wind is drawn across goes the wind\'s way, whichever way it blows, where left alone it stays',
    need('right', 'left', 'alone') && got.right.laid === 90 && got.left.laid === 90 && along('right') >= 0.005 && along('left') >= 0.005 && Math.abs(along('alone')) < 0.001,
    need('right', 'left', 'alone') ? `out to the right ${pc(along('right'))}, out to the left ${pc(along('left'))}; left alone ${pc(along('alone'))}` : 'not run');
  // 4.
  {
    const off = (k) => got[k].t1.dye / got[k].t0.dye - 1;
    check('and keeps all its colour',
      need('right', 'left', 'alone') && Math.abs(off('right')) < 0.005 && Math.abs(off('left')) < 0.005 && Math.abs(off('alone')) < 0.001,
      need('right', 'left', 'alone') ? `out to the right ${pc(off('right'))}, to the left ${pc(off('left'))}; left alone ${pc(off('alone'))}` : 'not run');
  }
  // 5.
  {
    const moved = (k) => got[k].t1.fx - got[k].t0.fx;
    const kept = (k) => Math.abs(got[k].t1.mass / got[k].t0.mass - 1) < 0.005;
    check('a pool of ferrofluid and a drop of oil under the same wind are carried along by the flow, none made or lost',
      need('ferro', 'oil', 'right') && moved('ferro') >= 0.5 * along('right') && moved('oil') >= 0.5 * along('right') && kept('ferro') && kept('oil'),
      need('ferro', 'oil', 'right') ? `the ferrofluid ${pc(moved('ferro'))} (${pc(got.ferro.t1.mass / got.ferro.t0.mass - 1)} made or lost), the oil ${pc(moved('oil'))} (${pc(got.oil.t1.mass / got.oil.t0.mass - 1)}), against the colour's ${pc(along('right'))}` : 'not run');
  }
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
