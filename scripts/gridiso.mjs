#!/usr/bin/env node
/**
 * The colour's carry spreads it the same whichever way the flow crosses the
 * grid (PLAN 18a-8, 18c-8).
 *
 *   npm run gridiso      (the lab: any adapter that computes; lab2)
 *
 * What was reported: a ring of colour pushed out under a fast radial flow
 * came out squared off (the pressed rings in the owner's picture), and a
 * small window piled the dye it pushed on its four diagonals. Real dye in
 * water spreads the same in every direction: the glass has no axes. Only
 * the solver's square cells do, so any fourfold pattern in how a carried
 * shape spreads is the grid printed on the liquid.
 *
 * The ring: Galaxy's step and gap on a 128² grid, a thin ring of colour
 * (radius 0.25, 0.05 wide) round the middle, turned two hundred steps by a
 * solid swirl laid every step (six times dyeedge's, so the carry has work to
 * do). The swirl runs along the ring everywhere, so in a carry with no grid
 * the ring would never widen at all, and whatever it widens by is the
 * scheme's own diffusion. Its width is read in 32 angular bins (the radial
 * spread of its colour in each), and the fourfold Fourier part of the
 * variance each bin gained, over its mean, says how much more the ring
 * widened where its tangent crosses the grid at 45° than where it runs along
 * an axis. Measured 2026-11-27 on SwiftShader: 0.331 with the faces carrying
 * the donor's colour unsplit (main), 0.218 with the corner's transverse share
 * (ACROSS in src/gpu/wgsl/fluid/carry.ts, Colella's corner transport).
 *
 * The window: a clear drop of amount 10 (the size 18c-8 saw lobes at) in a
 * cyan pool on a 192² grid, the lab's drop queue (the app's). The window's
 * radius read along 64 rays (where the pool's red first passes half of what
 * it is three windows out) and the pushed colour in the collar (half a radius
 * to two and a half): their fourfold parts over their means. Main reads
 * 0.013 and 0.0066 (round already, since the drop became a pour through the
 * solve, 18c-2); the corner share reads 0.009 and 0.003.
 *
 * Asked:
 *   1. the ring turned and kept its colour: total within KEPT (a flux makes
 *      and loses nothing; the floor for a half float's rounding is all that
 *      can add), and it gained over GAIN_LEAST cells² of variance (about half
 *      of the 1.08 the corner leaves; main 1.43), so a swirl that barely
 *      turned it, which would widen it evenly by doing nothing, fails here;
 *   2. the ring widened evenly: the fourfold part of its gained variance
 *      under RING4 (between main's 0.331 and the corner's 0.218);
 *   3. the ring stayed sharp: its mean width grew by under WIDEN cells (main
 *      0.35, the corner 0.27: the corner share must not buy roundness with
 *      blur);
 *   4. the window is round and its collar even: both fourfold parts under
 *      ROUND (a guard on 18c-8: a carry that squares a source shows here).
 *      A guard, not a fix's proof: main reads under it too, and it has not
 *      been seen red; the ring is what the corner transport moved.
 */
import { openLab } from './lab.mjs';

const KEPT = 0.002;
const GAIN_LEAST = 0.5;
const RING4 = 0.27;
const WIDEN = 0.33;
const ROUND = 0.02;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
let failed = false;
try {
  const r = await page.evaluate(async () => {
    // The k-fold Fourier part of v round the circle, over its mean.
    const harm = (v, k) => {
      let c = 0, s = 0, m = 0;
      for (let i = 0; i < v.length; i++) { const a = (2 * Math.PI * i) / v.length; c += v[i] * Math.cos(k * a); s += v[i] * Math.sin(k * a); m += v[i]; }
      // A part over a mean of nothing (a ring that sharpened, a channel read wrong) is no reading.
      if (!(m > 0)) throw new Error(`no mean to measure a fourfold part against (${m})`);
      return (Math.hypot(c, s) * 2) / m;
    };
    const out = {};
    {
      const N = 128, STEPS = 200, OMEGA = 6, R0 = 0.25, HALF = 0.025, B = 32;
      const look = lab.look('galaxy').settings;
      for (const key of ['globalSpeed', 'advection', 'diffusionRate']) if (typeof look[key] !== 'number') throw new Error(`Galaxy has no ${key}`);
      const DT = look.globalSpeed * 0.2;
      const over = { thinGap: 1, gapThickness: look.gapThickness ?? 0.45, dt: DT, advection: look.advection, diff: look.diffusionRate };
      await lab.create(N, N);
      const ring = new Array(N * N * 4).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const rr = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
        if (Math.abs(rr - R0) < HALF) ring.splice((i + j * N) * 4, 4, 1.8, 0.3, 0.1, 1);
      }
      lab.addDye(ring); lab.flush(DT);
      const spin = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) spin.push(-OMEGA * ((j + 0.5) / N - 0.5), OMEGA * ((i + 0.5) / N - 0.5), 0, 0);
      const widths = async () => {
        const d = await lab.field('dye'); const ch = d.length / (N * N);
        const m0 = new Array(B).fill(0), m1 = new Array(B).fill(0), m2 = new Array(B).fill(0);
        let tot = 0;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const x = (i + 0.5) / N - 0.5, y = (j + 0.5) / N - 0.5, rr = Math.hypot(x, y), v = d[(i + j * N) * ch];
          const b = Math.floor((((Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * B) % B;
          tot += v; m0[b] += v; m1[b] += v * rr; m2[b] += v * rr * rr;
        }
        return { var: m0.map((m, b) => Math.max(0, m2[b] / m - (m1[b] / m) ** 2) * N * N), tot };
      };
      const w0 = await widths();
      for (let k = 0; k < STEPS; k++) { lab.addVel(spin); lab.flush(DT); await lab.step(1, over, true); }
      const w1 = await widths();
      const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const gained = w1.var.map((v, i) => v - w0.var[i]);
      out.ring = {
        kept: w1.tot / w0.tot - 1, gain: mean(gained), four: harm(gained, 4),
        widen: Math.sqrt(mean(w1.var)) - Math.sqrt(mean(w0.var)),
      };
    }
    {
      const N = 192, AMOUNT = 10, STILL = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, coverGrams: 190 };
      await lab.create(N, N); await lab.step(1, STILL);
      lab.dye(0.5, 0.5, 0.3, [1.8, 0.3, 0.1], 1); lab.flush(); await lab.step(4, STILL);
      const s = lab.drop(0.5, 0.5, AMOUNT, [1, 1, 0.1], 0);
      await lab.step(s.steps + 12, STILL);
      const d = await lab.field('dye'); const ch = d.length / (N * N);
      // The drop's cell's middle, as lab.drop lays it (floor(0.5·N) + ½).
      const cx = Math.floor(0.5 * N) + 0.5, cy = cx, R = s.window * N;
      const at = (x, y) => {
        const i = Math.floor(x - 0.5), j = Math.floor(y - 0.5), fx = x - 0.5 - i, fy = y - 0.5 - j;
        const g = (a, b) => d[(a + b * N) * ch];
        return (g(i, j) * (1 - fx) + g(i + 1, j) * fx) * (1 - fy) + (g(i, j + 1) * (1 - fx) + g(i + 1, j + 1) * fx) * fy;
      };
      const far = at(cx + 3 * R, cy), rad = [], col = [];
      for (let b = 0; b < 64; b++) {
        const a = (2 * Math.PI * b) / 64; let rr = 0, m = 0;
        for (let t = 0.05; t < 3 * R; t += 0.05) {
          const v = at(cx + t * Math.cos(a), cy + t * Math.sin(a));
          if (!rr && v > 0.5 * far) rr = t;
          if (t > 0.5 * R && t < 2.5 * R) m += v * t;
        }
        rad.push(rr); col.push(m);
      }
      out.window = { R, opened: rad.every((v) => v > 0.5 * R), rad4: harm(rad, 4), col4: harm(col, 4) };
    }
    return out;
  });
  const { ring, window: win } = r;
  const f = (v, d = 3) => v.toFixed(d);
  console.log(`   ring: variance gained ${f(ring.gain)} cells², width +${f(ring.widen)} cells, fourfold part ${f(ring.four)}, colour ${f(100 * ring.kept, 3)}%`);
  console.log(`   window: radius ${f(win.R, 1)} cells, fourfold part of its radius ${f(win.rad4, 4)}, of its collar ${f(win.col4, 4)}`);
  check(`1. the ring turned and kept its colour to ${KEPT * 100}%, and widened`, Math.abs(ring.kept) < KEPT && ring.gain > GAIN_LEAST, `${f(100 * ring.kept, 3)}%, ${f(ring.gain)} cells²`);
  check(`2. the ring widened evenly: the fourfold part of its gain under ${RING4}`, ring.four < RING4, f(ring.four));
  check(`3. the ring stayed sharp: its width grew under ${WIDEN} cells`, ring.widen < WIDEN, f(ring.widen));
  check(`4. the window opened round, its radius's and its collar's fourfold parts under ${ROUND}`, win.opened && win.rad4 < ROUND && win.col4 < ROUND, `${f(win.rad4, 4)}, ${f(win.col4, 4)}`);
} catch (e) {
  console.log(` FAIL the lab ran — ${e.message.slice(0, 300)}`);
  failed = true;
} finally {
  await close();
}
failed ||= checks.some((c) => !c.ok);
console.log(failed ? `\n${checks.filter((c) => !c.ok).length} of ${checks.length} failed${checks.length < 4 ? ', and the lab stopped before the rest' : ''}` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
