#!/usr/bin/env node
/**
 * Film Hold: drops of oil crowd without merging, as a splodascope's do.
 *
 *   npm run filmhold      (any adapter that computes: scripts/lab.mjs)
 *
 * Asked by the owner from a photograph of a splodascope (2026-10-25): round
 * cells of yellow, green, red and pink oil packed edge to edge in a blue
 * water, some inside others, none merging. Laid on the plate as it was, a
 * crowd like that ran together: 90 drops were 25 bodies after two seconds
 * and 11 after ten, and every merge mixed its colours toward brown. Real
 * drops hold apart because the water film between two of them pushes back
 * as it thins (the disjoining pressure; FILM_WGSL in src/gpu/wgsl/fluid.ts).
 *
 * What this asks is the feature, a crowd that stays a crowd, against a
 * control that shows the plate would have merged it. Plates, 192², laid as
 * the app lays the Splodascope (src/lib/oilLay.ts, seedPreset), stepped
 * SECONDS with the look's own plate settings (its oil, its glass, its diffusion
 * of 0 rather than the lab's 1e-4) and Thin Gap:
 *
 *   hold      the look as it is
 *   control   the same plate with Film Hold at 0
 *
 * A body is a 4-connected region of the oil over a half.
 * A body is counted only from SPECK cells up, so a speck left by the field
 * is not a drop kept. Asked:
 *
 *   1. the crowd is laid: at least LAID bodies on both plates at the start
 *   2. the control merges: at most half its bodies are left at the end, so
 *      that 3 is measuring a hold and not a plate that never merged
 *   3. with the hold at least KEPT of the bodies are still bodies
 *   4. the hold makes and loses no oil: the plate's oil within 1 % of what
 *      it was laid with
 *   5. nor drives the films below empty to do it: 4 sums with its sign, so
 *      oil pushed under zero in the films would balance drops swollen past
 *      full; the oil over zero alone moves no more than the control's does,
 *      and the emptiest cell is within 0.05 of the control's
 *   6. and a lone drop is untouched by it: one drop with nothing near it,
 *      stepped two seconds with the hold and without, differs by under a
 *      hundredth of its oil in any cell (the hold acts only across a film).
 *      Twice it did not: 0.081 while part-oil cells counted as oil, 0.026
 *      while oil cells counted as film (FILM_WGSL says how both were fixed).
 *      Not asked of a body with a notch in it: the water deep in a notch is
 *      thin between oil, and the hold acts there as a real film's would.
 *
 * Measured (SwiftShader, 2026-10-25): held 35 → 31 bodies, the control
 * 35 → 3; oil 9377.6 → 9377.6; over zero 9422.0 → 9378.5 against the
 * control's 9417.9 → 9378.0, emptiest cell −0.014 against −0.000; the lone
 * drop 0 in every cell. At the app's own grids the hold keeps more: 35 of
 * 35 at 384² for four seconds, 33 of 35 at 256² for ten (the lab, not a
 * check). The bars sit between the plates rather than on either.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
const SECONDS = 6;
const LAID = 30;
const KEPT = 0.8;
const SPECK = 6;

const { page, close } = await openLab();
try {
  const crowd = (hold) => page.evaluate(async ({ N, SECONDS, SPECK, hold }) => {
    await lab.create(N, N);
    const { settings: s, dyes } = lab.look('splodascope');
    const over = { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag,
      platePressure: s.platePressure, oilTension: s.oilTension, oilBodies: s.oilBodies, diff: s.diffusionRate,
      filmHold: hold === 'look' ? s.filmHold : 0 };
    const discs = lab.splodascopeDiscs(11, dyes.length);
    const sv = lab.solver();
    for (const b of discs) sv.addMix(b.x, b.y, b.r, { oil: b.oil });
    const ab = (c) => [c.r, c.g, c.b].map((v) => -Math.log(Math.max(0.002, v)));
    const d = new Array(N * N * 4).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cell = lab.splodascopeCell((i + 0.5) / N, (j + 0.5) / N, N, discs), k = (i + j * N) * 4;
      const put = (amt, a) => { for (let ch = 0; ch < 3; ch++) d[k + ch] += amt * a[ch]; d[k + 3] += amt; };
      if (cell.water > 0) put(cell.water, ab(dyes[0]));
      if (cell.dye > 0) put(cell.dye, ab(dyes[discs[cell.disc].dye]));
    }
    lab.addDye(d); lab.flush();
    const count = async () => {
      const m = await lab.chemistry('mix'), n = m.n, f = m.data;
      const seen = new Uint8Array(n * n);
      let bodies = 0, oil = 0, pos = 0, least = 0;
      for (let q = 0; q < n * n; q++) { const c = f[q * 4]; oil += c; pos += Math.max(0, c); least = Math.min(least, c); }
      for (let q = 0; q < n * n; q++) {
        if (seen[q] || f[q * 4] < 0.5) continue;
        const st = [q]; seen[q] = 1;
        let size = 0;
        while (st.length) {
          const v = st.pop(), x = v % n, y = (v - x) / n;
          size++;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= n || yy >= n) continue;
            const r = xx + yy * n;
            if (!seen[r] && f[r * 4] >= 0.5) { seen[r] = 1; st.push(r); }
          }
        }
        // A speck is not a drop: the smallest laid is about ten cells.
        if (size >= SPECK) bodies++;
      }
      return { bodies, oil, pos, least };
    };
    await lab.step(1, over, true);
    const start = await count();
    await lab.step(SECONDS * 60 - 1, over);
    return { start, end: await count() };
  }, { N, SECONDS, SPECK, hold });

  const lone = () => page.evaluate(async () => {
    const n = 128, out = [];
    for (const hold of [0, 1]) {
      await lab.create(n, n);
      lab.solver().addMix(0.5, 0.5, 14 / n, { oil: 1 });
      const s = lab.look('splodascope').settings;
      await lab.step(120, { thinGap: 1, advection: s.advection, oilTension: s.oilTension, oilBodies: 0, diff: s.diffusionRate, filmHold: hold }, true);
      out.push((await lab.chemistry('mix')).data.filter((_, i) => i % 4 === 0));
    }
    let worst = 0, oil = 0;
    for (let i = 0; i < out[0].length; i++) { worst = Math.max(worst, Math.abs(out[0][i] - out[1][i])); oil += out[0][i]; }
    return { worst, oil };
  });

  const held = await crowd('look');
  const control = await crowd('off');
  const one = await lone();
  const fmt = (r) => `${r.start.bodies} → ${r.end.bodies}`;
  console.log(`  bodies in ${SECONDS} s: held ${fmt(held)}, control ${fmt(control)}`);

  check('the crowd is laid', Math.min(held.start.bodies, control.start.bodies) >= LAID,
    `${held.start.bodies} and ${control.start.bodies} bodies at the start (at least ${LAID})`);
  check('without the hold the plate merges the crowd', control.end.bodies <= 0.5 * control.start.bodies,
    `${fmt(control)} (at most half left)`);
  check('with the hold the crowd stays a crowd', held.end.bodies >= KEPT * held.start.bodies,
    `${fmt(held)} (at least ${Math.round(KEPT * 100)}% left)`);
  check('the hold makes and loses no oil', Math.abs(held.end.oil / held.start.oil - 1) < 0.01,
    `${held.start.oil.toFixed(1)} → ${held.end.oil.toFixed(1)}`);
  // The sum above has a sign, so oil driven below empty in the films would
  // balance drops swollen past full and pass it: so the oil over zero alone,
  // and the emptiest cell, held to the control's own.
  check('nor drives the films below empty to do it', held.end.pos / held.start.pos - 1 < 0.01 + Math.max(0, control.end.pos / control.start.pos - 1)
    && held.end.least > control.end.least - 0.05,
    `oil over zero ${held.start.pos.toFixed(1)} → ${held.end.pos.toFixed(1)} (control ${control.start.pos.toFixed(1)} → ${control.end.pos.toFixed(1)}), emptiest cell ${held.end.least.toFixed(3)} (control ${control.end.least.toFixed(3)})`);
  check('a lone drop is untouched by the hold', one.worst < 0.01,
    `worst cell ${one.worst.toExponential(2)} of a drop of ${one.oil.toFixed(0)}`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
