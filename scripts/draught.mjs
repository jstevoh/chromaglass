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
 *     mean) within a quarter of the old ones (OLD_GUST, from the old code),
 *     and the dye's picture changes against the same plate with Air off.
 *  3. It does not slide the dish: the mean flow over the dish under a tenth of
 *     its rms (the old shear's mean was most of it).
 *  0. The lab ran the thin gap, and laid the disc it says (its soft disc's
 *     mass, π·0.44²/2 of the 128² plate), so a lab on the deep plate, which
 *     has no open rim, or an empty plate cannot pass 1.
 *  4. The control: the same lab with the old draught's uniform shear put back
 *     on top of the gusts (a build-time edit of wgsl/thinGap.ts, as
 *     lampcontrol.mjs edits the plate) loses the dish and slides it, so 1 and
 *     3 can fail.
 *
 * And the colour's own weight with no oil (PLAN 18a-17). Rain Drip on a
 * standing plate and Plate Rock's tilt laid the heavy colour's weight
 * straight into the same open-rim solve, and the colour left over the downhill
 * rim (Rain Drip 0.5 kept 1.8% of the dish in 600 steps). hsBody now lays both
 * as the closed dish's circulation, as the oil's lift is (hsLiftRelax):
 *  5. Rain Drip 0.5 on a standing plate keeps the dish's dye (at least 97%).
 *  6. And it still falls: the colour's middle moves down the plate (S.up is
 *     +y, gravity −y), at least DROP of the plate further than with it off.
 *  7. Plate Rock tipped with no oil (rockX ROCK_SIN, about the phone's full
 *     tip) keeps the dish's dye, and its colour moves downhill (+x) too.
 *  8. The control: the same lab with the weight laid straight into the open
 *     rim again (fluid.ts's `closing` made false at build time) loses Rain
 *     Drip's dish, so 5 can fail.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

/** The control's build: hsBody's gusts with the old draught's uniform −y shear (S.air × 8 a step) laid back on them. */
const OLD_SHEAR = {
  name: 'old-shear',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]thinGap\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const at = /(let g = vec2f\(cy, -cx\)[^;]*);/g;
      const found = s.match(at)?.length ?? 0;
      if (found !== 1) throw new Error(`draught: the old-shear control found ${found} of 1 gust lines in wgsl/thinGap.ts`);
      return { contents: s.replace(at, '$1 + vec2f(0.0, -S.air * 8.0 * S.dt);'), loader: 'ts' };
    });
  },
};

/** The control's build for 5 to 8: the colour's weight with no oil laid straight into the open-rim solve, as before 18a-17. */
const OPEN_WEIGHT = {
  name: 'open-weight',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]fluid\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const at = /const closing = thin && !lifting && \(rockOn \|\| dripWeightOf\(p\) > 0\);/g;
      const found = s.match(at)?.length ?? 0;
      if (found !== 1) throw new Error(`draught: the open-weight control found ${found} of 1 closing lines in fluid.ts`);
      return { contents: s.replace(at, 'const closing = false;'), loader: 'ts' };
    });
  },
};

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
const DISC = Math.PI * 0.44 * 0.44 / 2 * 128 * 128;
/** The tip for 7: sinθ about the phone's full tip (lib/handTilt.ts). */
const ROCK_SIN = 0.27;
/** How far, in plate widths, Rain Drip's colour must fall further than the still plate's in 600 steps. */
const DROP = 0.05;

const run = (page, over) => page.evaluate(async ({ over, steps }) => {
    await lab.create(128, 128);
    await lab.step(1, { thinGap: 1 });
    lab.dye(0.5, 0.5, 0.44, [1.0, 0.6, 0.2], 1.0);
    lab.flush();
    const inDish = (i, j, n) => { const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5; return u * u + v * v < 0.25; };
    const dye = async () => { const f = await lab.field('dye'); const n = Math.sqrt(f.length / 4); let s = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inDish(i, j, n)) s += f[(i + j * n) * 4 + 3];
      let cx = 0, cy = 0;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (inDish(i, j, n)) { const a = f[(i + j * n) * 4 + 3]; cx += a * (i + 0.5) / n; cy += a * (j + 0.5) / n; }
      return { s, cx: cx / s, cy: cy / s, f: f.filter((_, k) => k % 4 === 3) }; };
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
    return { before: before.s, kept: after.s / before.s, dx: after.cx - before.cx, dy: after.cy - before.cy, thin: lab.thinLive(), ...sp, field: Array.from(after.f) };
  }, { over, steps: STEPS });

let still, air, drip, rock, shear, openDrip, openRock;
{
  const { page, close } = await openLab();
  try {
    still = await run(page, { air: 0 });
    air = await run(page, { air: 0.35 });
    drip = await run(page, { air: 0, drip: 0.5, plateUpright: 1 });
    rock = await run(page, { air: 0, rockX: ROCK_SIN });
  } finally { await close(); }
}
{
  const { page, close } = await openLab({ plugins: [OLD_SHEAR], tag: 'old-shear' });
  try { shear = await run(page, { air: 0.35 }); } finally { await close(); }
}
{
  const { page, close } = await openLab({ plugins: [OPEN_WEIGHT], tag: 'open-weight' });
  try {
    openDrip = await run(page, { air: 0, drip: 0.5, plateUpright: 1 });
    openRock = await run(page, { air: 0, rockX: ROCK_SIN });
  } finally { await close(); }
}
{
  if (process.argv.includes('--rms')) console.log(`      rms ${air.rms.toExponential(3)} mean ${air.mean.toExponential(3)} gust ${air.gust.toExponential(3)} kept ${air.kept.toFixed(3)}`);

  check('0. the lab ran the thin gap and laid the disc', air.thin && still.thin && shear.thin && Math.abs(air.before / DISC - 1) < 0.01,
    `thin ${air.thin}/${still.thin}/${shear.thin}; laid ${air.before.toFixed(1)} against the disc's ${DISC.toFixed(1)}`);
  check('1. with Air 0.35 the dish keeps its dye', air.kept >= 0.97,
    `${(100 * air.kept).toFixed(1)}% left after ${STEPS} steps (bar 97%; Air off ${(100 * still.kept).toFixed(1)}%)`);
  let moved = 0, total = 0;
  for (let k = 0; k < air.field.length; k++) { moved += Math.abs(air.field[k] - still.field[k]); total += still.field[k]; }
  check('2a. the draught still moves the liquid: its gusts within a quarter of the old ones', Math.abs(air.gust / OLD_GUST - 1) <= 0.25,
    `${air.gust.toExponential(2)} against the old ${OLD_GUST.toExponential(2)}`);
  check('2b. and the dye\'s picture moves with it', moved / total > 0.05,
    `${(100 * moved / total).toFixed(1)}% of the dye in a different place than with Air off (bar 5%)`);
  check('3. it does not slide the dish: mean flow under a tenth of its rms', air.mean < 0.1 * air.rms,
    `mean ${air.mean.toExponential(2)}, rms ${air.rms.toExponential(2)}`);
  check('4. control: the old uniform shear put back loses the dish and slides it', shear.kept < 0.5 && shear.mean > 0.5 * shear.rms,
    `${(100 * shear.kept).toFixed(1)}% left, mean flow ${shear.mean.toExponential(2)} of rms ${shear.rms.toExponential(2)}`);
  check('5. Rain Drip 0.5 on a standing plate keeps the dish\'s dye', drip.thin && drip.kept >= 0.97,
    `${(100 * drip.kept).toFixed(1)}% left after ${STEPS} steps (bar 97%; laid into the open rim, 1.8% before 18a-17)`);
  check('6. and its colour still falls down the plate', still.dy - drip.dy >= DROP,
    `its middle moved ${drip.dy.toFixed(4)} in y against the still plate's ${still.dy.toFixed(4)} (bar ${DROP} further down)`);
  check('7. Plate Rock tipped with no oil keeps the dish\'s dye, and its colour moves downhill', rock.kept >= 0.97 && rock.dx - still.dx >= DROP,
    `${(100 * rock.kept).toFixed(1)}% left; its middle moved ${rock.dx.toFixed(4)} in x against ${still.dx.toFixed(4)} (rockX ${ROCK_SIN})`);
  check('8. control: the weight laid straight into the open rim loses Rain Drip\'s dish', openDrip.kept < 0.5,
    `${(100 * openDrip.kept).toFixed(1)}% left (Plate Rock that way: ${(100 * openRock.kept).toFixed(1)}%)`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
