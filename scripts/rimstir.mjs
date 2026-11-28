#!/usr/bin/env node
/**
 * Turbulence and the comet's pull stir the dish without emptying it (PLAN
 * 18a-25; `npm run rimstir`, the lab, about twelve minutes on SwiftShader,
 * seconds on Metal).
 *
 * What was reported (the looks' re-tune, 28i-8, 2026-11-27): Lacing Run
 * stayed dim whatever its dials did. Measured on the owner's Mac, on
 * Classical Vibe's pours, each stir alone: the still dish held a mean dye of
 * 0.59, Turbulence 0.25 took it to 0.17 in 30 s and the comet's pull at 0.75
 * to 0.05 in 10 s; Lacing Run read 0.06 at 60 s with the regulator pouring.
 * On a thin gap dye leaves only over the open rim (decayDye), and both stirs
 * were laid straight into the gap's solve, which holds p = 0 past the rim:
 * the Turbulence as a curl noise whose stream function is not constant along
 * the rim (its lowest octave is the dish), the comet as a constant pull on
 * the heavy colour, a tilt with nowhere to stop. Both were through-flows.
 * wgsl/fluid/stir.ts and wgsl/thinGap.ts (hsBody) say what replaced them:
 * the closed dish's circulation, Φ = 0 at the wall.
 *
 * This holds, on the real solver at 128² (dt 0.05, 600 steps, a disc of dye
 * to r 0.44, the dish's own rim at 0.5):
 *  0. The lab ran the thin gap and laid the disc it says (π·0.44²/2 of the
 *     plate), so a lab on the deep plate, which has no open rim, or an empty
 *     plate cannot pass 1.
 *  1. Turbulence 0.5 (Detail 4, the dial through stirOf) keeps the dish's dye
 *     (at least 97%; 7% before).
 *  2. And still stirs: the flow's rms in the middle of the dish (r < 0.3)
 *     within a quarter of the open curl's there (the control's, below), and
 *     the dye's picture moved against the still plate's.
 *  3. With no ring at the rim: the rms between r 0.38 and 0.49 over the
 *     middle's no more than 1.5 times the open curl's same ratio (a window
 *     on ψ, the obvious fix, would make a jet there).
 *  4. The comet's pull 1.5 (cometX 2.25, with the draught on so the old
 *     code laid it too) keeps the dish's dye (at least 97%; 0.04% before),
 *     and moves its colour along +x against the draught alone.
 *  5. And the comet alone still pulls: the colour's middle moves along +x,
 *     at least PULL of the plate further than the still plate's.
 *  6. The control: the same lab with both laid open again (forcesB's curl on
 *     the thin gap and the closed stir off; the comet straight into the open
 *     solve: build-time edits, as draught.mjs's controls are) loses both
 *     dishes, so 1 and 4 can fail.
 */
import { readFileSync } from 'node:fs';
import { openLab } from './lab.mjs';

/** One build-time edit of a file: `at` must match once. */
const edit = (b, file, edits) => b.onLoad({ filter: new RegExp(`src[\\\\/]gpu[\\\\/]${file.split('/').map((p) => p.replace('.', '\\.')).join('[\\\\/]')}$`) }, (a) => {
  let s = readFileSync(a.path, 'utf8');
  for (const [at, to] of edits) {
    const found = s.split(at).length - 1;
    if (found !== 1) throw new Error(`rimstir: the open control found ${found} of 1 "${at}" in ${file}`);
    s = s.replace(at, to);
  }
  return { contents: s, loader: 'ts' };
});
/** The control's build: Turbulence's curl laid open on the thin gap, and the comet laid straight into the open solve, as before 18a-25. */
const OPEN = {
  name: 'open-stir',
  setup(b) {
    edit(b, 'wgsl/fluid/forces.ts', [['S.turbScale > 0.005 && A.a.x < 0.5', 'S.turbScale > 0.005']]);
    edit(b, 'fluid/passes.ts', [['if (!((p.turbScale ?? 0) > 0.005) || !this.stirReady()) return;', 'return;']]);
    edit(b, 'wgsl/thinGap.ts', [['let pull = A.b.xy + comet -', 'let pull = A.b.xy -'], ['select(comet * w, vec2f(0.0), A.b.w > 0.0)', 'comet * w']]);
  },
};

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const STEPS = 600;
const DISC = Math.PI * 0.44 * 0.44 / 2 * 128 * 128;
/** Turbulence 0.5 through lib/stir.ts stirOf, t(1 + 3t³) (copied: this script runs on plain node; musicstir holds stirOf's own value). */
const TURB = 0.5 * (1 + 3 * 0.5 ** 3);
/** Comet Flow 1.5 at angle 0, as fluidSimulation hands it (× 1.5). */
const COMET = 1.5 * 1.5;
/** How far, in plate widths, the comet's colour must move along its pull further than the still plate's. */
const PULL = 0.02;

const run = (page, over) => page.evaluate(async ({ over, steps }) => {
  await lab.create(128, 128);
  await lab.step(1, { thinGap: 1 });
  lab.dye(0.5, 0.5, 0.44, [1.0, 0.6, 0.2], 1.0);
  lab.flush();
  const r2 = (i, j, n) => { const u = (i + 0.5) / n - 0.5, v = (j + 0.5) / n - 0.5; return u * u + v * v; };
  const dye = async () => { const f = await lab.field('dye'); const n = Math.sqrt(f.length / 4); let s = 0, cx = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (r2(i, j, n) < 0.25) { const a = f[(i + j * n) * 4 + 3]; s += a; cx += a * (i + 0.5) / n; }
    return { s, cx: cx / s, f: f.filter((_, k) => k % 4 === 3) }; };
  const speed = async () => { const v = await lab.field('vel'); const n = Math.sqrt(v.length / 4); const q = [0, 0], c = [0, 0];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const r = Math.sqrt(r2(i, j, n)), o = (i + j * n) * 4, k = r < 0.3 ? 0 : r > 0.38 && r < 0.49 ? 1 : -1;
      if (k >= 0) { q[k] += v[o] ** 2 + v[o + 1] ** 2; c[k]++; }
    }
    return { mid: Math.sqrt(q[0] / c[0]), ring: Math.sqrt(q[1] / c[1]) }; };
  const base = { thinGap: 1, dt: 0.05, advection: 0.7, ...over };
  const before = await dye();
  // The flow read halfway, when Φ has long relaxed from still (it is warm from step to step, wgsl/fluid/stir.ts).
  await lab.step(steps / 2, base);
  const sp = await speed();
  await lab.step(steps / 2, base);
  const after = await dye();
  return { before: before.s, kept: after.s / before.s, dx: after.cx - before.cx, thin: lab.thinLive(), ...sp, field: Array.from(after.f) };
}, { over, steps: STEPS });

let still, turb, draught, comet, pull, openTurb, openComet;
{
  const { page, close } = await openLab();
  try {
    still = await run(page, {});
    turb = await run(page, { turbScale: TURB, turbDetail: 4 });
    draught = await run(page, { air: 0.35 });
    comet = await run(page, { air: 0.35, cometX: COMET });
    pull = await run(page, { cometX: COMET });
  } finally { await close(); }
}
{
  const { page, close } = await openLab({ plugins: [OPEN], tag: 'open-stir' });
  try {
    openTurb = await run(page, { turbScale: TURB, turbDetail: 4 });
    openComet = await run(page, { air: 0.35, cometX: COMET });
  } finally { await close(); }
}
{
  const pct = (x) => `${(100 * x).toFixed(2)}%`;
  const all = [still, turb, draught, comet, pull, openTurb, openComet];
  check('0. every run ran the thin gap and laid the disc', all.every((r) => r.thin && Math.abs(r.before / DISC - 1) < 0.01),
    `thin ${all.map((r) => r.thin).join('/')}; laid ${all.map((r) => r.before.toFixed(1)).join('/')} against the disc's ${DISC.toFixed(1)}`);
  check('1. Turbulence 0.5 keeps the dish\'s dye', turb.kept >= 0.97,
    `${pct(turb.kept)} left after ${STEPS} steps (bar 97%; laid open ${pct(openTurb.kept)}; still ${pct(still.kept)})`);
  let moved = 0, total = 0;
  for (let k = 0; k < turb.field.length; k++) { moved += Math.abs(turb.field[k] - still.field[k]); total += still.field[k]; }
  check('2a. and still stirs the middle as hard as the open curl did', Math.abs(turb.mid / openTurb.mid - 1) <= 0.25 && turb.mid > 10 * still.mid,
    `rms ${turb.mid.toExponential(2)} at r < 0.3 against the open curl's ${openTurb.mid.toExponential(2)} (still plate ${still.mid.toExponential(2)})`);
  check('2b. and the dye\'s picture moves with it', moved / total > 0.05,
    `${(100 * moved / total).toFixed(1)}% of the dye in a different place than on the still plate (bar 5%)`);
  const ringOf = (r) => r.ring / r.mid;
  check('3. with no ring at the rim: its wall flow against the middle\'s no more than half again the open curl\'s', ringOf(turb) < 1.5 * ringOf(openTurb),
    `rms between r 0.38 and 0.49 over the middle's: ${ringOf(turb).toFixed(2)}, the open curl's ${ringOf(openTurb).toFixed(2)} (bar 1.5x it)`);
  check('4. the comet\'s pull 1.5 keeps the dish\'s dye, and pulls it', comet.kept >= 0.97 && comet.dx - draught.dx >= PULL,
    `${pct(comet.kept)} left (bar 97%; laid open ${pct(openComet.kept)}); its middle moved ${comet.dx.toFixed(4)} in x against the draught alone's ${draught.dx.toFixed(4)}`);
  check('5. and the comet alone still pulls the colour along +x', pull.kept >= 0.97 && pull.dx - still.dx >= PULL,
    `${pct(pull.kept)} left; its middle moved ${pull.dx.toFixed(4)} in x against the still plate's ${still.dx.toFixed(4)} (bar ${PULL} further)`);
  check('6. control: both laid open again lose their dishes', openTurb.kept < 0.5 && openComet.kept < 0.5,
    `Turbulence ${pct(openTurb.kept)}, comet ${pct(openComet.kept)} left`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
