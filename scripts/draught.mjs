#!/usr/bin/env node
/**
 * The draught keeps the dish's liquid in the dish (PLAN 18a-16; `npm run
 * draught`, the lab, about four minutes on SwiftShader, seconds on Metal).
 *
 * What was reported: Solar Flare, filmed to Hymn to the Dawn on main, faded to
 * an empty dish by about 2:40. Measured on the owner's Mac with no music, every
 * build since 11-21 drained the dish to 5 to 7% of its dye in 150 s; the
 * treble's white sparks (gone with PLAN 38v-1) had been pouring it back. On a
 * thin gap dye leaves only over the open rim (decayDye), and the draught (Air,
 * Solar Flare's 0.35) laid a uniform shear straight into the gap's solve, which
 * holds p = 0 past the rim: a through-flow that slid the whole dish out. A
 * closed dish answers a uniform stress with its own pressure and does not move;
 * what a draught moves is its curl, gyres that close inside the rim. hsBody
 * now lays the gusts as ∇⊥χ, χ = 0 at the rim (wgsl/thinGap.ts says why).
 *
 * This holds, on the real solver at 128² (dt 0.05, 600 steps, a disc of dye
 * to r 0.44, the dish's own rim at 0.5):
 *  1. With Air 0.35 the dish keeps its dye (at least 97%; it kept 0% before).
 *  2. The draught still moves the liquid: its gusts (the flow's rms about its
 *     mean) between half and twice the old ones (OLD_GUST, from the old code),
 *     and the dye's picture changes against the same plate with Air off.
 *  3. It does not slide the dish: the mean flow over the dish under a tenth of
 *     its rms (the old shear's mean was most of it).
 *  4. The control: a push that still goes through the open rim (Rain Drip on a
 *     standing plate, PLAN 18a-17) loses dye here, so line 1 can fail.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
/*
  The old hsBody's gusts: the rms of its flow about its mean over the dish
  after 30 steps of Air 0.35 on a still plate (the same run as \`speed\`
  below, on the code before 18a-16, printed by \`--rms\`): rms 7.117e-2 with a
  mean of 6.903e-2, so the gusts were sqrt(rms² − mean²) = 1.73e-2 and the
  rest was the slide out of the dish.
*/
const OLD_GUST = 1.73e-2;
const STEPS = 600;

const { page, close } = await openLab();
try {
  const run = (over) => page.evaluate(async ({ over, steps }) => {
    await lab.create(128, 128);
    await lab.step(1, { thinGap: 1 });
    lab.dye(0.5, 0.5, 0.44, [1.0, 0.6, 0.2], 1.0);
    lab.flush();
    const inDish = (i, j, n) => { const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5; return u * u + v * v < 0.25; };
    const dye = async () => { const f = await lab.field('dye'); const n = Math.sqrt(f.length / 4); let s = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inDish(i, j, n)) s += f[(i + j * n) * 4 + 3];
      return { s, f: f.filter((_, k) => k % 4 === 3) }; };
    const speed = async () => { const v = await lab.field('vel'); const n = Math.sqrt(v.length / 4); let q = 0, mx = 0, my = 0, c = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inDish(i, j, n)) { const o = (i + j * n) * 4; q += v[o] ** 2 + v[o + 1] ** 2; mx += v[o]; my += v[o + 1]; c++; }
      const rms = Math.sqrt(q / c), mean = Math.hypot(mx / c, my / c);
      return { rms, mean, gust: Math.sqrt(Math.max(0, rms * rms - mean * mean)) }; };
    const base = { thinGap: 1, dt: 0.05, advection: 0.7, ...over };
    const before = await dye();
    await lab.step(30, base);
    const sp = await speed();
    await lab.step(steps - 30, base);
    const after = await dye();
    return { kept: after.s / before.s, ...sp, field: Array.from(after.f) };
  }, { over, steps: STEPS });

  const still = await run({ air: 0 });
  const air = await run({ air: 0.35 });
  const drip = await run({ air: 0, drip: 0.5, plateUpright: 1 });
  if (process.argv.includes('--rms')) console.log(`      rms ${air.rms.toExponential(3)} mean ${air.mean.toExponential(3)} gust ${air.gust.toExponential(3)} kept ${air.kept.toFixed(3)}`);

  check('1. with Air 0.35 the dish keeps its dye', air.kept >= 0.97,
    `${(100 * air.kept).toFixed(1)}% left after ${STEPS} steps (bar 97%; Air off ${(100 * still.kept).toFixed(1)}%)`);
  let moved = 0, total = 0;
  for (let k = 0; k < air.field.length; k++) { moved += Math.abs(air.field[k] - still.field[k]); total += still.field[k]; }
  check('2a. the draught still moves the liquid: its gusts between half and twice the old ones', air.gust >= 0.5 * OLD_GUST && air.gust <= 2 * OLD_GUST,
    `${air.gust.toExponential(2)} against the old ${OLD_GUST.toExponential(2)}`);
  check('2b. and the dye\'s picture moves with it', moved / total > 0.05,
    `${(100 * moved / total).toFixed(1)}% of the dye in a different place than with Air off (bar 5%)`);
  check('3. it does not slide the dish: mean flow under a tenth of its rms', air.mean < 0.1 * air.rms,
    `mean ${air.mean.toExponential(2)}, rms ${air.rms.toExponential(2)}`);
  check('4. control: a push through the open rim (Rain Drip, standing plate) loses dye here', drip.kept < 0.9,
    `${(100 * drip.kept).toFixed(1)}% left`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
