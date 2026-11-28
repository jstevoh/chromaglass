#!/usr/bin/env node
/**
 * Does a held press close the glass over its own time, whatever the step rate?
 *
 *   npm run pressclock
 *
 * PLAN 18a-5. What was wrong: the Press tool's hand (LiquidVisualizer, a hand
 * held on the glass) and a bubble's standing squeeze laid the same dent on
 * every solver step, and a step is not a fixed time. The governor lowers the
 * step rate before it gives up a rung (QualityGovernor.stepRate) and doubles
 * each step's dtSeconds; `?steps=` sets it by hand. So at thirty steps a
 * second the glass came down half as fast in the show's seconds as at sixty,
 * and twice as fast at a hundred and twenty, while everything round the
 * press (the glass's spring, the lift after it, a kick's hold and release,
 * the clock glass) already counted seconds. A hand is a load, and the film
 * under it closes at Stefan's rate, dh/dt = −a(h/h₀)³, in seconds. The press
 * is now laid as each step's share of that rate (pressOverStep in
 * src/sim/pressLay.ts), which squeezeUpdate integrates exactly over the step.
 *
 * What this measures, in the lab on a thin gap at 192² (the app's plate):
 * the app's Press (three bowls, radii 30, 18 and 8 of the 128 grid, pressed
 * at 1×, at the solver's cells as pressBowl lays them) held for 0.4 s of
 * show at 60, 30 and 120 steps a second, on the app's glass at each rate
 * (glassSpring of the default Press Lift over dtSeconds, as deriveStep gives
 * a thin gap, and Classic's step scaled by dtSeconds as deriveStep scales
 * it). The volume the glass has closed, Σ(rest − gap) over the plate, read
 * at 0.1, 0.2 and 0.4 s:
 *
 *   - as main laid it (0.004 a step, whatever the step): the control, which
 *     must show the fault, 30 steps a second closing well short of 60;
 *   - as the plate lays it now: 30 and 120 within 3% of 60 at every reading.
 *
 * And once the hand is off, on a thin gap the squeeze field's rate is the
 * gap's own change (the memory, gapMemory, is not run there: a Stokes film
 * has no inertia to carry a press past its hand, and the thin solve reads
 * the gap's change, never this rate). Read for 0.25 s after the release at
 * 60 steps a second: rms(rate − Δgap/dt) over rms(Δgap/dt), under the press.
 * The old plate, which keeps its memory, is the control and must read far
 * from it (its rate there is the remembered push).
 */
import { build } from 'esbuild';
import { openLab } from './lab.mjs';

const checks = [];
const check = (n, ok, d = '') => { checks.push({ n, ok: !!ok }); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

const out = 'node_modules/.cache/pressclock-lib.mjs';
await build({ stdin: { contents: "export { pressOverStep, PRESS_STEP_S, handPress, bubbleSqueeze } from './src/sim/pressLay.ts'; export { glassSpring } from './src/lib/squish.ts'; export { GRID_SCALE } from './src/sim/constants.ts';", resolveDir: '.', loader: 'ts' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { pressOverStep, PRESS_STEP_S, handPress, bubbleSqueeze, glassSpring, GRID_SCALE } = await import(`../${out}`);

const N = 192, L = 192, C = 96;
// The app's Press at 1× (LiquidVisualizer: applySquish at 30, 18 and 8, 0.004 a step at 60), on the solver's cells.
const RADII = [30, 18, 8].map((r) => r * GRID_SCALE), AMOUNT = 0.004;
const HOLD = 0.4, READS = [0.1, 0.2, 0.4], RELEASE = 0.25;
const CLASSIC_DT = 0.0018;   // Classic's step at sixty a second (Speed 0.009 × 0.2)
// The glass as FluidSimulation.deriveStep gives it (its gapSpring, gapMemory and dt lines): glassSpring is the app's own; the other two are copied, and must follow it.

const glass = (rate, thin) => {
  const s = 1 / rate, dt = CLASSIC_DT * (s / PRESS_STEP_S);
  return { thinGap: thin ? 1 : 0, gapThickness: 0.45, dt, gapSpring: glassSpring(0.35, thin ? s : dt), gapMemory: Math.pow(0.5, dt / 0.22) };
};

/*
  What the hand lays, by the app's own lay (handPress, the very call
  LiquidVisualizer's Press makes each step), recorded here and pressed in the
  lab as FluidSimulation.applySquish presses on a thin gap: pressBowl at
  radius × GRID_SCALE (the old plate, the control, squishDisc at the same).
  'main' is the same hand with a step of 1/60 whatever the rate: main's dent.
*/
const handLay = (dtSeconds) => {
  const out = [];
  handPress({ applySquish: (x, y, r, a) => out.push([r * GRID_SCALE, a]), squeezeOut() {} }, C, C, 1, 0, dtSeconds, GRID_SCALE);
  return out;
};
check('the hand lays its three bowls, 30, 18 and 8 of the 128 grid', handLay(1 / 60).map(([r]) => r).join() === RADII.join(), handLay(1 / 60).map(([r, a]) => `${r}@${a}`).join(', '));
check('a bubble\'s squeeze is a rate too: a step of 1/30 lays twice what 1/60 does', bubbleSqueeze(1 / 30) === 2 * bubbleSqueeze(1 / 60) && bubbleSqueeze(1 / 60) === 0.0035, `${bubbleSqueeze(1 / 60)}, ${bubbleSqueeze(1 / 30)}`);

// The step's share is exact at the show's own rate: the default plate presses bit for bit as it did.
check('at sixty steps a second the press lays what it always did', pressOverStep(AMOUNT, 1 / 60) === AMOUNT && pressOverStep(AMOUNT, NaN) === AMOUNT,
  `${pressOverStep(AMOUNT, 1 / 60)} at 1/60, ${pressOverStep(AMOUNT, 1 / 30)} at 1/30`);

const { page, close } = await openLab();
let failed = false;
try {
  const run = (o) => page.evaluate(async ({ N, L, C, RADII, o }) => {
    await lab.create(N, L);
    await lab.step(2, o.p);
    const rest = (await lab.squeeze()).gap;
    const closed = (g) => { let v = 0; for (let i = 0; i < g.length; i++) v += rest[i] - g[i]; return v * (L / N) ** 2; };
    const vols = [];
    const steps = Math.round(o.hold * o.rate);
    for (let k = 1; k <= steps; k++) {
      for (const [r, a] of o.lay) {
        if (o.thin) lab.gridLay('press', C, C, r, a, true);
        else lab.squish(C, C, r, a, 0, 'press', 0, false);
      }
      lab.flush(o.p.dt);
      await lab.step(1, o.p, true);
      if (o.reads.some((t) => Math.round(t * o.rate) === k)) vols.push(closed((await lab.squeeze()).gap));
    }
    // Let go: the rate the squeeze field reports against the gap's own change, under the press.
    let e2 = 0, d2 = 0;
    if (o.release > 0) {
      let was = (await lab.squeeze()).gap;
      const under = (i) => Math.hypot(i % N + 0.5 - C, Math.floor(i / N) + 0.5 - C) < RADII[0];
      for (let k = 0; k < Math.round(o.release * o.rate); k++) {
        await lab.step(1, o.p);
        const sq = await lab.squeeze();
        for (let i = 0; i < sq.gap.length; i++) {
          if (!under(i)) continue;
          const d = (sq.gap[i] - was[i]) / o.p.dt;
          e2 += (sq.rate[i] - d) ** 2; d2 += d * d;
        }
        was = sq.gap;
      }
    }
    return { vols, rel: d2 > 0 ? Math.sqrt(e2 / d2) : NaN };
  }, { N, L, C, RADII, o });

  const res = {};
  for (const how of ['main', 'now']) for (const rate of [60, 30, 120]) {
    // Main's press at sixty is this one (pressOverStep is exactly 1 there, checked above).
    if (how === 'main' && rate !== 30) continue;
    const lay = handLay(how === 'main' ? 1 / 60 : 1 / rate);
    res[`${how} ${rate}`] = await run({ p: glass(rate, true), thin: true, rate, lay, hold: HOLD, reads: READS, release: how === 'now' && rate === 60 ? RELEASE : 0 });
    console.log(`  ${how.padEnd(4)} ${String(rate).padStart(3)}/s: closed ${res[`${how} ${rate}`].vols.map((v) => v.toFixed(3)).join(', ')} at ${READS.join(', ')} s`);
  }
  check('every run read the glass at every time', Object.values(res).every((r) => r.vols.length === READS.length), Object.entries(res).map(([k, r]) => `${k}: ${r.vols.length}`).join(', '));
  const ratio = (a, b) => a.vols.map((v, i) => v / b.vols[i]);
  const fmt = (r) => r.map((v) => v.toFixed(3)).join(', ');
  const m30 = ratio(res['main 30'], res['now 60']);
  check('the control: as main laid it, at thirty steps a second the glass closes well short of sixty', m30.every((r) => r < 0.85), `30/60 ${fmt(m30)}`);
  const n30 = ratio(res['now 30'], res['now 60']), n120 = ratio(res['now 120'], res['now 60']);
  check('now, at thirty steps a second the glass closes as at sixty, within 3%', n30.every((r) => Math.abs(r - 1) < 0.03), `30/60 ${fmt(n30)}`);
  check('and at a hundred and twenty, within 3%', n120.every((r) => Math.abs(r - 1) < 0.03), `120/60 ${fmt(n120)}`);
  // One step's lay at the rest gap is Σ amount·πR² (a bowl keeps the flat disc's volume): the press must go on closing past it, slower as the film thins.
  const oneStep = handLay(1 / 60).reduce((v, [r, a]) => v + a * Math.PI * r * r, 0);
  const v60 = res['now 60'].vols;
  check('the press goes on closing past its first step, and slows as the film thins (Stefan)', v60[0] > oneStep && v60[1] > v60[0] && v60[2] > v60[1] && v60[2] - v60[1] < 2 * (v60[1] - v60[0]),
    `${fmt(v60)} against one step's ${oneStep.toFixed(3)}`);

  const old = await run({ p: glass(60, false), thin: false, rate: 60, lay: handLay(1 / 60), hold: HOLD, reads: [HOLD], release: RELEASE });
  const thinRel = res['now 60'].rel;
  check('let go on a thin gap, the squeeze field\'s rate is the gap\'s own change (no memory)', thinRel < 1e-3, `rms off ${thinRel.toExponential(2)} of the gap's rate`);
  check('the control: the old plate keeps its memory, its rate far from its gap\'s change', old.rel > 0.5, `rms off ${old.rel.toFixed(2)}`);
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  await close();
}
const bad = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - bad}/${checks.length} pressclock checks passed`);
process.exit(failed || bad ? 1 : 0);
