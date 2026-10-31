#!/usr/bin/env node
/**
 * The glass comes back up against the liquid's suction (PLAN 38l).
 *
 *   npm run stefan
 *
 * What the audit found (PLAN 38l): the gap springs back toward rest at the
 * same fraction of what is left whatever the gap, `gap += (rest − gap)·k`,
 * so a glass pressed nearly flat came away from the liquid as easily as one
 * barely dented. Two wet glasses do not part like that. To open the gap the
 * liquid has to flow in through the gap that is opening, whose resistance
 * goes as 1/h³ (Reynolds' lubrication; for two discs Stefan's law,
 * F = 3πμR⁴ḣ / 2h³), so under the glass's own restoring force F = K(h₀ − h)
 *
 *   dh/dt = 2h³K(h₀ − h) / 3πμR⁴ = k (h₀ − h) (h / h_s)³,
 *
 * slow while the film is thin and quicker as it opens: the glass peels, then
 * lets go. The press already closes by the same law (squeezeUpdate's
 * `inverseSqrt`): this is its other half.
 *
 * And by the second, not the frame (the audit's other half): on a thin gap
 * the app hands the solver `glassSpring(Press Lift, the frame's seconds)`,
 * so the glass at 120 frames a second takes twice the steps of a sixtieth
 * to come up the same way. That already held; it stays held here, with the
 * suction in it.
 *
 * The checks, on the GPU solver (scripts/lab.mjs) with the press the app
 * lays (lib/squish.ts) held until the film is a fifth of the rest gap:
 *   1. Let go, the glass opens at k(h₀ − h)(h/h₀)³: the rate over what is
 *      left, read at two depths on the way up (a quarter and two thirds of
 *      the rest gap), comes in their ratio cubed, to 15%. A spring with no
 *      suction gives a ratio of one.
 *   2. And at each depth the rate is Stefan's itself, to 15%: k(h/h_s)³,
 *      k the lab's spring a step at the film a full press leaves
 *      (STEFAN_FILM of the rest gap, where Press Lift is read).
 *   3. The same lift at 60 and 120 frames a second, each with its own
 *      spring from the same Press Lift (glassSpring): the gap at 0.5, 1 and
 *      2 s agrees to 3% of the press's depth.
 *   4. A dent of a hundredth of the gap comes back by the same law at its
 *      own depth: stiff glass on a thick film, quicker than a full press.
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
    const N = 128, L = 128, out = {};
    // The middle of the press: the gap's mean over its innermost cells.
    const middle = async () => {
      const s = await lab.squeeze();
      let g = 0, n = 0;
      for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) {
        if (Math.hypot((i + 0.5) / s.n - 0.5, (j + 0.5) / s.n - 0.5) > 0.02) continue;
        g += s.gap[i + j * s.n]; n++;
      }
      return g / n;
    };
    /*
      A press held in the middle until the film is down to `floor` of the
      rest gap, then let go and stepped `seconds`, the gap read every step.
      `perSecond` frames a second; the spring a step from Press Lift 0.35
      at that frame's length, as the app's (glassSpring), unless `spring`.
      Pressed at sixty frames a second whatever `perSecond`, and switched
      only at let go: where the glass is still thin, the time to the snap
      goes steeply with the depth it starts from (a start at 0.19 of rest
      instead of 0.20 moves the gap at 1 s by 15% of the press, check-skeptic
      on 38l-4), so two presses stopped a step apart would measure where
      they stopped, not the frame rate.
    */
    const lift = async ({ perSecond = 60, floor = 0.2, seconds = 2, spring = null, amount = 0.03 }) => {
      await lab.create(N, L);
      const at = (fps) => ({ thinGap: 1, gapThickness: 0.45, gapMemory: 0, plateCurve: 0, magnetSeconds: 1 / fps,
        gapSpring: spring ?? lab.glassSpring(0.35, 1 / fps) });
      const press = at(60), over = at(perSecond);
      await lab.step(2, press);
      const rest = await middle();
      for (let k = 0; k < 400 && (await middle()) > floor * rest; k++) {
        lab.squish(L / 2, L / 2, 20, amount, 0, 'press', 0);
        lab.flush();
        await lab.step(1, press, true);
      }
      const trace = [await middle()];
      for (let k = 0; k < Math.round(seconds * perSecond); k++) { await lab.step(1, over); trace.push(await middle()); }
      return { rest, trace, spring: over.gapSpring };
    };
    out.deep = await lift({ spring: 0.02, seconds: 3 });
    out.at60 = await lift({ perSecond: 60 });
    out.at120 = await lift({ perSecond: 120 });
    out.shallow = await lift({ spring: 0.02, floor: 0.99, seconds: 0.5, amount: 0.0003 });
    out.film = lab.STEFAN_FILM;
    return out;
  });
} finally {
  await close();
}

check('no GPU pass failed validation (a stage that never ran would read as stillness)', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));

// 1, 2. The rate over what is left, k_eff = −ln(1 − Δh/(h₀ − h)) a step, where the film passes a depth.
{
  const { rest, trace, spring } = r.deep;
  const k = -Math.log(1 - spring), hs = r.film;
  const at = (x) => {
    const i = trace.findIndex((g) => g >= x * rest);
    if (i < 1 || i >= trace.length - 1) return null;
    const h = trace[i], left = rest - h, next = rest - trace[i + 1];
    return { h: h / rest, rate: -Math.log(Math.max(1e-9, next / left)) };
  };
  const lo = at(0.25), hi = at(0.67);
  const ok = !!lo && !!hi;
  const ratio = ok ? lo.rate / hi.rate : NaN, want = ok ? (lo.h / hi.h) ** 3 : NaN;
  check('let go, the thin film holds the glass: its opening rate over what is left goes as the film\'s depth cubed (Stefan)',
    ok && Math.abs(ratio / want - 1) < 0.15,
    ok ? `at h/h₀ ${lo.h.toFixed(3)} and ${hi.h.toFixed(3)}: ${ratio.toFixed(4)} against (${lo.h.toFixed(3)}/${hi.h.toFixed(3)})³ = ${want.toFixed(4)}; a spring with no suction gives 1`
      : `the lift never passed both depths (${trace.slice(0, 4).map((g) => (g / rest).toFixed(3)).join(', ')}…)`);
  const law = (h) => k * (h / hs) ** 3;
  check('and at each depth the rate is k(h/h_s)³, the spring\'s own k a step at the film a full press leaves (STEFAN_FILM)',
    ok && typeof hs === 'number' && Math.abs(lo.rate / law(lo.h) - 1) < 0.15 && Math.abs(hi.rate / law(hi.h) - 1) < 0.15,
    ok ? `${lo.rate.toExponential(3)} against ${law(lo.h).toExponential(3)}, ${hi.rate.toExponential(3)} against ${law(hi.h).toExponential(3)} (k ${k.toExponential(3)}, h_s ${hs} of rest)` : '');
  const t1 = trace.findIndex((g) => g >= 0.9 * rest);
  console.log(`      (the deep press, from ${(trace[0] / rest).toFixed(3)} of rest: nine tenths back after ${t1 < 0 ? `more than ${trace.length - 1}` : t1} steps at k ${spring})`);
}
// 3. By the second.
{
  const dev = [0.5, 1, 2].map((s) => {
    // What is left of each press, as a share of where it began: the two presses stop a step apart.
    const left = (run, i) => (run.rest - run.trace[i]) / Math.max(run.rest - run.trace[0], 1e-9);
    return Math.abs(left(r.at60, Math.round(s * 60)) - left(r.at120, Math.round(s * 120)));
  });
  check('the glass comes up by the second: at 60 and 120 frames a second, each with its own spring, the gap at 0.5, 1 and 2 s agrees to 3% of the press',
    dev.every((d) => d < 0.03) && r.at60.trace[0] < 0.3 * r.at60.rest && r.at120.trace[0] < 0.3 * r.at120.rest
      && Math.abs(r.at60.trace[0] / r.at60.rest - r.at120.trace[0] / r.at120.rest) < 0.001,
    `${dev.map((d) => `${(d * 100).toFixed(2)}%`).join(', ')}; let go from ${(r.at60.trace[0] / r.at60.rest).toFixed(4)} and ${(r.at120.trace[0] / r.at120.rest).toFixed(4)} of rest (the same within 0.001); the gap at 2 s ${(r.at60.trace[120] / r.at60.rest).toFixed(3)} and ${(r.at120.trace[240] / r.at120.rest).toFixed(3)} of rest (springs ${r.at60.spring.toExponential(3)}, ${r.at120.spring.toExponential(3)} a step)`);
}
// 4. A shallow dent: stiff glass on a thick film.
{
  const { rest, trace, spring } = r.shallow;
  const k = -Math.log(1 - spring), x = trace[0] / rest;
  const got = -Math.log((rest - trace[1]) / (rest - trace[0])), want = k * (x / r.film) ** 3;
  check('a dent of a hundredth of the gap comes back by the same law, at its own depth: (1/h_s)³ quicker than the spring a full press gets',
    rest - trace[0] > 0 && Math.abs(got / want - 1) < 0.1,
    `${got.toFixed(3)} a step against ${want.toFixed(3)} (pressed to ${x.toFixed(4)} of rest; the spring ${k.toFixed(3)})`);
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
