#!/usr/bin/env node
/**
 * A standing plate is a sealed bottle (PLAN 27f-9): its wax falls and rises
 * inside the glass and does not leave it. Measured on the GPU solver alone
 * (scripts/lab.mjs).
 *
 *   npm run sealed
 *
 * What was there: the preset retune (2026-11-11) filmed Lava Lamp as a flat
 * tan lamp. Since PLAN 18a the plate is a Hele-Shaw cell whose rim is held at
 * the air's pressure, and the wax's weight was laid into that solve as a body
 * force, so on a standing plate a column of wax fell out of the bottom and
 * what the lamp warmed went out of the top. Now the weight is the closed
 * cell's circulation (wgsl/fluid/seal.ts), and this asks for the feature on
 * the same plate the drain was measured on: a thin gap stood upright, Dye
 * Weight 0.7, a row of seven wax drops a fifth of the way up.
 *
 *   1. The meter sees a drain: the same plate with the seal held off (the
 *      solver's sealReady answering false, which is the plate before this
 *      change: the weight on the open rim) keeps under 85% of its dye over
 *      eight seconds (68% when this was written).
 *   2. Sealed, it keeps at least 99.5% over the same eight seconds, and the
 *      seal ran (its kernels built and asked for every step).
 *   3. The wax still falls. A lone drop in the middle of the plate, where the
 *      wall is far, falls at at least 85% of its speed on the open plate (94%
 *      when this was written): a seal that froze the plate would keep its dye
 *      too, and this is what tells the two apart. Darcy's inclusion goes at
 *      the same speed in a sealed cell and an open one when the wall is far,
 *      less (a/R)² for the wall.
 *   4. The lamp's heat lift goes round too, and still lifts. With the lamp
 *      on (the solver's LAMP_HEAT where the plate leaves the view) and the
 *      Buoyancy dial's heat lift (Lava Lamp's 0.42 × CUR_BUOY, under a cap of
 *      0.3 so it can show), the plate keeps at least 99.5% of its dye over
 *      ten seconds, and the wax's centroid ends at least 0.015 of the plate
 *      higher than on the same sealed plate with the dial at 0 (0.026 when
 *      this was written). writeSim takes the lift out of the current while
 *      the seal runs, so a seal that dropped it would keep the dye and fail
 *      the second half; one that left it in the current would lose dye out of
 *      the top (98.1% at twelve seconds by hand, at the old cap of 0.01).
 *   Every sealed plate asks for the seal's kernels and waits until they are
 *   built, and each line holds only if they were (a plate still compiling
 *   them is the open plate). A flat plate never reaches the seal: the gate is
 *   `upright > 0.001` in fluid.ts, and with no gravity in the plate there is
 *   no weight to seal, so there is nothing for a line to compare.
 *   And any GPU validation error fails the run: a pass that never ran would
 *   read as a plate that keeps its dye.
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
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost|validation/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
let r;
try {
  r = await page.evaluate(async () => {
    const N = 128;
    // The standing plate: Lava Lamp's Gravity and Dye Weight on a thin gap, down the screen.
    const STAND = { thinGap: 1, gapThickness: 0.45, plateUpright: 1, solutalBuoyancy: 0.7, gravityX: 0, gravityY: -1, gravityReach: 0.4, dt: 1 / 60, heatDecay: 0.995 };
    const WAX = [1.2, 0.4, 0.3];
    // The dye on the plate, and its centroid's height (0 the bottom of the grid, 1 the top).
    const measure = async () => {
      const f = await lab.field('dye');
      const n = Math.round(Math.sqrt(f.length / 4));
      let s = 0, y = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = f[(j * n + i) * 4 + 3]; s += a; y += a * (j + 0.5) / n; }
      return { amount: s, y: y / Math.max(s, 1e-9) };
    };
    // The seal is held off by answering false where the solver asks whether it is built: the open rim, as before 27f-9.
    const plate = async (open) => {
      await lab.create(N);
      const s = lab.solver();
      if (open) s.sealReady = () => false;
      return s;
    };
    // Ask for the seal's kernels and wait until they are in, so every measured step is sealed.
    const sealIn = async (s) => {
      for (let k = 0; k < 40 && !s.sealReady(); k++) await new Promise((q) => setTimeout(q, 250));
      return s.sealReady();
    };
    const row = () => { for (let i = 0; i < 7; i++) lab.dye(0.2 + i * 0.1, 0.3, 0.07, WAX, 1.4); lab.flush(); };
    const out = {};

    // 1, 2: the row of drops, eight seconds, open and sealed.
    for (const open of [true, false]) {
      const s = await plate(open);
      const ready = open ? true : await sealIn(s);
      row();
      const a = await measure();
      await lab.step(480, STAND);
      out[open ? 'open' : 'sealed'] = { a, b: await measure(), ready: open ? false : ready && s.sealReady() };
    }

    // 3: a lone drop in the middle, how fast it falls over a second after a settling second.
    for (const open of [true, false]) {
      const s = await plate(open);
      const ready = open ? true : await sealIn(s);
      lab.dye(0.5, 0.6, 0.06, WAX, 1.4); lab.flush();
      await lab.step(60, STAND);
      const a = await measure();
      await lab.step(60, STAND);
      out[open ? 'dropOpen' : 'dropSealed'] = { a, b: await measure(), ready: ready && s.sealReady() };
    }

    // 4: the lamp on, the Buoyancy dial's heat lift at Lava Lamp's and at 0, ten seconds each, sealed.
    for (const buoy of [0.42 * 0.3, 0]) {
      const LAMP = { ...STAND, gravityReach: 0.3, currentBuoy: buoy, maxCurrent: 0.3 };
      const s = await plate(false);
      const ready = await sealIn(s);
      row();
      const a = await measure();
      await lab.step(600, LAMP);
      out[buoy > 0 ? 'lamp' : 'lampStill'] = { a, b: await measure(), ready: ready && s.sealReady() };
    }
    return out;
  });
} finally {
  await close();
}

const kept = (x) => x.b.amount / x.a.amount;
const pct = (v) => `${(100 * v).toFixed(1)}%`;
// 1.
check('the meter sees a drain: with the seal held off, the standing plate keeps under 85% of its dye over eight seconds',
  kept(r.open) < 0.85, `${pct(kept(r.open))} kept (${r.open.a.amount.toFixed(0)} → ${r.open.b.amount.toFixed(0)}); 68% when this was written`);
// 2.
check('sealed, the standing plate keeps at least 99.5% of its dye over the same eight seconds, and the seal ran',
  r.sealed.ready && kept(r.sealed) >= 0.995, `${pct(kept(r.sealed))} kept (${r.sealed.a.amount.toFixed(0)} → ${r.sealed.b.amount.toFixed(0)}), the seal ${r.sealed.ready ? 'built and on' : 'NOT built'}; its centroid ${r.sealed.a.y.toFixed(3)} → ${r.sealed.b.y.toFixed(3)} (open ${r.open.a.y.toFixed(3)} → ${r.open.b.y.toFixed(3)})`);
// 3.
{
  const fallOpen = r.dropOpen.a.y - r.dropOpen.b.y, fallSealed = r.dropSealed.a.y - r.dropSealed.b.y;
  check('the wax still falls: a lone drop where the wall is far falls at at least 85% of its open plate\'s speed',
    r.dropSealed.ready && fallOpen > 0.005 && fallSealed >= 0.85 * fallOpen,
    `${r.dropSealed.ready ? '' : 'the seal NOT built; '}${fallSealed.toFixed(4)} of the plate in a second sealed against ${fallOpen.toFixed(4)} open (${pct(fallSealed / Math.max(fallOpen, 1e-9))}); 94% when this was written`);
}
// 4.
{
  const lift = r.lamp.b.y - r.lampStill.b.y;
  check('the lamp\'s heat lift goes round too, and still lifts: the plate keeps at least 99.5% over ten seconds, the wax ending at least 0.015 higher than with the Buoyancy dial at 0',
    r.lamp.ready && r.lampStill.ready && kept(r.lamp) >= 0.995 && lift >= 0.015,
    `${r.lamp.ready && r.lampStill.ready ? '' : 'the seal NOT built; '}${pct(kept(r.lamp))} kept (${r.lamp.a.amount.toFixed(0)} → ${r.lamp.b.amount.toFixed(0)}); centroid ${r.lamp.b.y.toFixed(3)} against ${r.lampStill.b.y.toFixed(3)} with the dial at 0 (${lift >= 0 ? '+' : ''}${lift.toFixed(3)}; 0.026 when this was written)`);
}
check('no GPU validation errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
