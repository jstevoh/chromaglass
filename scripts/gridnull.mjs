#!/usr/bin/env node
/**
 * The thin gap's flow has no mode the pressure cannot see (PLAN 18a-8).
 *
 *   npm run gridnull      (the lab: any adapter that computes; lab2)
 *
 * What was wrong: the thin solve kept its velocity at the cells. Its faces
 * carried the mean of two cells' M·u*, and hsGradient gave each cell back
 * its own M·u* less the mean of its two faces' corrections, so a
 * checkerboard in the cells' velocities (+u, −u, +u along a row) was
 * nothing at every face: the pressure never saw it, only the drag took it
 * out, and the next step began from it again. A floored dent's rim, where
 * the corrections on a cell's two faces are the most unlike, laid a new one
 * every step. Since 18a-8 the faces are the flow's state (wgsl/thinFlow.ts):
 * each face is predicted from its own last velocity, and a cell's velocity
 * is the mean of its faces, so there is no such mode left to keep.
 *
 * The plate: 128², Thin Gap on, the water's gap (Thickness 0, where the
 * drag is least and a mode lasts longest) and the default oil's (0.45),
 * the glass held (no spring).
 *
 * Asked:
 *   1. a checkerboard laid in the flow is gone after one step: u_x as
 *      (−1)^i and u_y as (−1)^(i+j), read back as their share of what was
 *      laid, inside 0.3 of the plate's middle, under CHECKER on both
 *      liquids (main kept 0.93 of it in water and 0.46 in the oil, the
 *      drag's one step and nothing else; 4e-8 and 2e-8 now);
 *   2. it did not become a flow somewhere else: ten steps later the plate's
 *      whole rms flow is under STRAY of what was laid (what the faces at the
 *      grid's wall and the open rim, where the checkerboard's halves do not
 *      cancel, leave: 6.8e-4 in water now; main kept the checkerboard itself,
 *      0.51 in water);
 *   3. a wave eight cells long keeps its inertia: a shear u_y = sin(2πi/8),
 *      which no pressure turns, keeps over ten steps of water at least KEEP
 *      of what a wave sixty-four cells long keeps (the drag takes both
 *      alike; a scheme that took the checkerboard out by filtering the flow
 *      [1 2 1], the first try at 18a-8, damped this one 0.85 a step; main
 *      0.981, now 0.983);
 *   4. a floored dent's rim under a steady push is smooth: the cells' flow
 *      in the band 0.04 either side of the dent's edge, less its own
 *      [1 2 1]² blur, as a share of its energy, under RIM in the oil (main
 *      0.0303, now 0.0108) and in water (main 0.0115, now 0.0083).
 *
 * Measured 2026-11-27 on SwiftShader, about 80 s.
 */
import { openLab } from './lab.mjs';

const CHECKER = 0.01;
const STRAY = 0.01;
const KEEP = 0.95;
const RIM = { oil: 0.02, water: 0.0105 };

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
let failed = false;
try {
  const r = await page.evaluate(async () => {
    const N = 128, out = {};
    const dish = (i, j) => Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
    // The part of the flow less its own [1 2 1]² blur, as a share of its energy, over the cells keep() takes.
    const sharp = (v, keep) => {
      let e = 0, t = 0;
      for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
        if (!keep(i, j)) continue;
        for (let c = 0; c < 2; c++) {
          let s = 0;
          for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += (2 - Math.abs(a)) * (2 - Math.abs(b)) * v[((i + a) + (j + b) * N) * 4 + c];
          const u = v[(i + j * N) * 4 + c]; e += (u - s / 16) ** 2; t += u * u;
        }
      }
      if (!(t > 0)) throw new Error('no flow to measure');
      return e / t;
    };
    const rms = (v, keep) => {
      let s = 0, n = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (keep(i, j)) { const k = (i + j * N) * 4; s += v[k] * v[k] + v[k + 1] * v[k + 1]; n++; }
      return Math.sqrt(s / n);
    };
    const all = () => true;
    const A = 0.1;
    for (const [name, over] of [['water', { thinGap: 1, gapThickness: 0, gapSpring: 0 }], ['oil', { thinGap: 1, gapThickness: 0.45, gapSpring: 0 }]]) {
      const o = {};
      // 1, 2. The checkerboard.
      await lab.create(N, N); await lab.step(1, over);
      const cb = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) cb.push(A * ((i & 1) ? 1 : -1), A * (((i + j) & 1) ? 1 : -1), 0, 0);
      lab.addVel(cb); lab.flush(); await lab.step(1, over);
      const v1 = await lab.field('vel');
      let dot = 0, laid = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        if (dish(i, j) >= 0.3) continue;
        const k = (i + j * N) * 4;
        dot += v1[k] * cb[k] + v1[k + 1] * cb[k + 1]; laid += cb[k] * cb[k] + cb[k + 1] * cb[k + 1];
      }
      o.checker = dot / laid;
      await lab.step(9, over);
      o.stray = rms(await lab.field('vel'), all) / (A * Math.SQRT2);
      // 3. Two shear waves, eight and sixty-four cells long, each on its own plate.
      const wave = async (len) => {
        await lab.create(N, N); await lab.step(1, over);
        const w = [];
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) w.push(0, A * Math.sin((2 * Math.PI * (i + 0.5)) / len), 0, 0);
        lab.addVel(w); lab.flush(); await lab.step(1, over);
        const inner = (i, j) => dish(i, j) < 0.3;
        const a = rms(await lab.field('vel'), inner);
        await lab.step(10, over);
        return rms(await lab.field('vel'), inner) / a;
      };
      o.short = await wave(8); o.long = await wave(64);
      // 4. The dent's rim, pressed to the floor and pushed steadily.
      await lab.create(N, N); await lab.step(1, over);
      for (let k = 0; k < 20; k++) { lab.vel(0.5, 0.5, 0.16, [0, 0, 0, -0.2]); lab.flush(); await lab.step(1, over); }
      await lab.step(40, over);
      for (let k = 0; k < 20; k++) { lab.vel(0.5, 0.5, 5, [0.2, 0, 0, 0]); lab.flush(); await lab.step(1, over); }
      o.rim = sharp(await lab.field('vel'), (i, j) => Math.abs(dish(i, j) - 0.16) < 0.04);
      out[name] = o;
    }
    return out;
  });
  const f = (v, d = 4) => (Math.abs(v) < 1e-3 && v !== 0 ? v.toExponential(2) : v.toFixed(d));
  for (const name of ['water', 'oil']) {
    const o = r[name];
    console.log(`   ${name}: checkerboard kept ${f(o.checker)} after a step, stray flow ${f(o.stray)} after ten; the 8-cell wave kept ${f(o.short)}, the 64-cell ${f(o.long)}; the dent's rim ${f(o.rim)}`);
  }
  check(`1. a laid checkerboard is gone after one step: under ${CHECKER} of it in water and in the oil`, r.water.checker < CHECKER && r.oil.checker < CHECKER, `${f(r.water.checker)}, ${f(r.oil.checker)}`);
  check(`2. and it became no flow elsewhere: the plate's rms flow ten steps on under ${STRAY} of it`, r.water.stray < STRAY && r.oil.stray < STRAY, `${f(r.water.stray)}, ${f(r.oil.stray)}`);
  check(`3. an 8-cell wave of water keeps at least ${KEEP} of what a 64-cell one keeps over ten steps`, r.water.short > KEEP * r.water.long && r.water.long > 0.2, `${f(r.water.short / r.water.long)}`);
  check(`4. a floored dent's rim is smooth: its sharp part under ${RIM.oil} in the oil and ${RIM.water} in water`, r.oil.rim < RIM.oil && r.water.rim < RIM.water, `${f(r.oil.rim)}, ${f(r.water.rim)}`);
} catch (e) {
  console.log(` FAIL the lab ran — ${e.message.slice(0, 300)}`);
  failed = true;
} finally {
  await close();
}
failed ||= checks.some((c) => !c.ok);
console.log(failed ? `\n${checks.filter((c) => !c.ok).length} of ${checks.length} failed${checks.length < 4 ? ', and the lab stopped before the rest' : ''}` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
