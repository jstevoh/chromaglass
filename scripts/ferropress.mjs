#!/usr/bin/env node
/**
 * The Press on the ferrofluid (PLAN 15d): with Thin Gap on, does a pool of
 * ferrofluid under the glass behave as a liquid does when two glasses are
 * pressed together over it? Measured on the GPU solver alone (scripts/lab.mjs).
 *
 *   npm run ferropress
 *
 * What was there: the flow carried the ferrofluid by area (phaseAdvect's
 * flux form), which is right while the gap stands still. Under a press the
 * flow's divergence (the glass pushing the liquid out) took a share of every
 * cell, so a pool stayed the size it was and went grey: pressed to a sixth of
 * the gap over ten steps, its fullest cell fell from 0.96 to 0.48 with Thin
 * Gap on (0.67 on the old solver). A real pool keeps its volume: thinner,
 * wider, still full. So under Thin Gap it now moves as a volume, c·h, on the
 * thin solve's own face fluxes, and the drag in the gap takes the
 * ferrofluid's own viscosity (FERRO_NU in src/gpu/fluid.ts).
 *
 * Each check asks for a consequence of that physics with a number the physics
 * gives. The control is the same plate with the volume form off (the lab's
 * phaseVolume: 0, Thin Gap still on), which checks 1 and 2 require to fail;
 * the old solver's readings are printed beside them. First, that every pool
 * was laid (Σc is the splat's π·0.1²/2) and every press landed (the middle's
 * gap under a third of rest), so a plate that never moved cannot pass.
 *
 *   1. A pressed pool stays a liquid. A pool is pressed by a palm wider than
 *      it to a sixth of the gap, over twenty steps. Its middle is a
 *      stagnation point, so the share there cannot change (Dc/Dt = 0): it
 *      stays within 3% of where it began. Carried by area it falls under 0.8.
 *   2. And it spreads by the volume the glass pushed out: Σc·h kept to 1%,
 *      the cells it fills past half up at least 1.5 times, and nothing piled
 *      past full (the fullest cell 0.9 to 1.05; dividing by the gap with no
 *      flow to carry it piles the volume up instead of spreading it).
 *   3. When the glass lifts, the pool comes back. Flow this slow is
 *      reversible: once the gap is back at rest, the pool's radial profile
 *      matches a pool the glass never touched, stepped as long, to 0.03 in
 *      every ring. This holds a cut that grew the pool a little every press
 *      (7% in one tried), not the greying: the area form, whose volume is
 *      exact at rest, comes back too, and its reading is printed.
 *   4. A front where the thinner liquid pushes the thicker one fingers. A
 *      pool with nine bumps on its edge is pressed: on the default plate
 *      (Thickness 0.45, a light oil of 22 mm²/s) the ferrofluid (5 mm²/s) is
 *      the thinner, and pushing outward into the oil is Saffman–Taylor's
 *      unstable direction, so its outline's spread over its radius grows (or
 *      falls less) at least 1.2 times as much as with a ferrofluid as thick
 *      as the oil. In water the ferrofluid is the thicker, the press is the
 *      stable way, and it must grow no more than 1.05 times an even pair's.
 *   5. The old solver's ferrofluid is carried as it was. With Thin Gap off
 *      the area is kept to 1e-4 through a press (dividing by the gap there,
 *      where the flow cannot carry a press, piled twelve times the pool's
 *      volume under the palm in a first cut).
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI, a
 * Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
// A kernel that fails validation drops the whole step's encoder, and a plate
// that never moves keeps its middle where it was (check 1) and its area
// (check 5). The lab only prints GPU errors, so they are counted and fail the run.
const gpuErrors = [];
page.on('console', (m) => { if (/gpu error|device lost/i.test(m.text())) gpuErrors.push(m.text().slice(0, 200)); });
try {
  const r = await page.evaluate(async () => {
    const N = 128;
    const H0 = 0.03;
    const BINS = 16;
    const mid0 = N / 2 + (N / 2) * N;
    // The pool's middle, its volume, its share summed and the cells it covers past half, its fullest cell, the gap, its profile by ring.
    const read = async () => {
      const d = (await lab.phase()).data;
      const sq = await lab.squeeze();
      let mid = 0, midN = 0, vol = 0, area = 0, cover = 0, max = 0, off = 0;
      const ring = new Array(BINS).fill(0), ringN = new Array(BINS).fill(0);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = i + j * N, c = d[k];
        const rr = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5);
        if (rr < 0.02) { mid += c; midN++; }
        vol += c * Math.max(sq.gap[k], 0.004) / H0;
        area += c;
        if (c > 0.5) cover++;
        max = Math.max(max, c);
        off += Math.abs(sq.gap[k] - H0);
        const b = Math.floor(rr / 0.01);
        if (b < BINS) { ring[b] += c; ringN[b]++; }
      }
      const n2 = N * N;
      return { mid: mid / midN, midGap: sq.gap[mid0], vol: vol / n2, area: area / n2, cover: cover / n2, max, off: off / n2, ring: ring.map((s, b) => s / ringN[b]) };
    };
    // The pool's outline: the outermost point along each of 180 rays where the share crosses a half, between cells.
    const outline = async () => {
      const d = (await lab.phase()).data;
      const at = (x, y) => {
        const fx = x * N - 0.5, fy = y * N - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
        const g = (a, b) => d[Math.min(N - 1, Math.max(0, a)) + Math.min(N - 1, Math.max(0, b)) * N];
        return (g(i, j) * (1 - u) + g(i + 1, j) * u) * (1 - v) + (g(i, j + 1) * (1 - u) + g(i + 1, j + 1) * u) * v;
      };
      const rs = [];
      const ds = 0.25 / N;
      for (let a = 0; a < 180; a++) {
        const th = a / 180 * 2 * Math.PI, cx = Math.cos(th), cy = Math.sin(th);
        let last = 0, prev = at(0.5, 0.5);
        for (let s = ds; s < 0.45; s += ds) {
          const c = at(0.5 + s * cx, 0.5 + s * cy);
          if (prev > 0.5 && c <= 0.5) last = s - ds + ds * (prev - 0.5) / (prev - c);
          prev = c;
        }
        rs.push(last);
      }
      const m = rs.reduce((a, b) => a + b) / rs.length;
      return { r: m, spread: Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length) / m };
    };
    // A palm 0.15 of the plate in radius, pressing the middle to a sixth of the gap over twenty steps, as a hand lays a Press a step at a time.
    // On a thin gap the glass closes as a squeeze film under a load (Stefan's law, squeezeUpdate in src/gpu/wgsl/fluid.ts): what the
    // hand lays is its rate a at the rest gap h₀, and each step 1/h² grows by 2a/h₀³. Laid as the old solver's straight steps of
    // h₀·(5/6)/20, twenty of them took the middle only to 0.61 of rest, and the check's "every press landed" failed on a press that
    // never got there. So on a thin gap the hand presses at the rate that reaches a sixth in the same twenty steps: 1/h² from 1/h₀²
    // to 36/h₀² is 35/h₀² = 20·2a/h₀³, a = 35·h₀/40. The old solver keeps its straight steps, which land at a sixth as before.
    const press = async (over) => {
      const a = over.thinGap ? 35 * H0 / 40 : H0 * 5 / 6 / 20;
      for (let k = 0; k < 20; k++) { lab.vel(0.5, 0.5, 0.15, [0, 0, 0, -a]); lab.flush(); await lab.step(1, over); }
    };
    const thin = { thinGap: 1, gapThickness: 0.45, gapSpring: 0, gapMemory: 0.85 };
    const out = { laid: Math.PI * 0.1 * 0.1 / 2 };

    // 1–3 and 5: a pool pressed and let go; the same carried by area (what was there);
    // one never pressed; and the old solver.
    for (const [name, over, pressed] of [
      ['thin', thin, true],
      ['area', { ...thin, phaseVolume: 0 }, true],
      ['still', thin, false],
      ['old', { gapSpring: 0, gapMemory: 0.85 }, true],
    ]) {
      await lab.create(N, N);
      lab.addPhase(0.5, 0.5, 0.1, 1);
      await lab.step(30, over);
      const before = await read();
      if (pressed) await press(over); else await lab.step(20, over);
      await lab.step(10, over);
      const held = await read();
      await lab.step(300, { ...over, gapSpring: 0.05 });
      const after = await read();
      out[name] = { before, held, after };
    }

    // 4: a pool with nine bumps on its edge pressed, with the ferrofluid's own viscosity and with the clear liquid's.
    // The pool is laid as a paraboloid, so its edge (half full) is at 0.15/√2; the bumps sit on it.
    out.fronts = {};
    const edge = 0.15 / Math.SQRT2;
    for (const t of [0.45, 0]) {
      const nu = lab.thinGapViscosity(t);
      out.fronts[`${t}:ratio`] = lab.ferroViscosity / nu;
      for (const [name, fv] of [['own', undefined], ['even', nu]]) {
        const over = { thinGap: 1, gapThickness: t, gapSpring: 0, gapMemory: 0.85, ferroViscosity: fv };
        await lab.create(N, N);
        lab.addPhase(0.5, 0.5, 0.15, 1);
        for (let b = 0; b < 9; b++) {
          const th = b / 9 * 2 * Math.PI + 0.3;
          lab.addPhase(0.5 + edge * Math.cos(th), 0.5 + edge * Math.sin(th), 0.025, 1);
        }
        await lab.step(30, over);
        const start = await outline();
        await press(over);
        await lab.step(10, over);
        out.fronts[`${t}:${name}`] = { start, held: await outline() };
      }
    }
    return out;
  });

  const f = (x, d = 3) => x.toFixed(d);
  const { thin, area, still, old } = r;
  const pressedTo = (a) => a.held.midGap / 0.03;

  // The pool is there, and the press landed, in every arm.
  check('every pool is laid as the splat lays it (Σc = π·0.1²/2, to 2%) and every press takes the middle under a third of the gap',
    [thin, area, still, old].every((a) => Math.abs(a.before.area / r.laid - 1) < 0.02) && [thin, area, old].every((a) => pressedTo(a) < 0.3) && pressedTo(still) > 0.99,
    `Σc ${[thin, area, still, old].map((a) => f(a.before.area, 5)).join(', ')} against ${f(r.laid, 5)}; the middle's gap ${[thin, area, still, old].map((a) => f(pressedTo(a), 2)).join(', ')} of rest (pressed, by area, never, old)`);

  // 1.
  check('a pressed pool stays full in the middle (a stagnation point keeps its share), to 3%; carried by area it does not (under 0.8)',
    Math.abs(thin.held.mid / thin.before.mid - 1) < 0.03 && area.held.mid / area.before.mid < 0.8,
    `middle ${f(thin.before.mid)} → ${f(thin.held.mid)} with the glass down; by area ${f(area.before.mid)} → ${f(area.held.mid)}; the old solver ${f(old.before.mid)} → ${f(old.held.mid)}`);

  // 2.
  check('and spreads: its volume Σc·h kept to 1%, the cells it fills past half up at least 1.5 times, nothing past full (fullest 0.9 to 1.05); by area, not',
    Math.abs(thin.held.vol / thin.before.vol - 1) < 0.01 && thin.held.cover / thin.before.cover > 1.5 && thin.held.max > 0.9 && thin.held.max < 1.05
      && !(area.held.cover / area.before.cover > 1.5 && area.held.max > 0.9),
    `volume ${f(thin.before.vol, 5)} → ${f(thin.held.vol, 5)}, cover ×${f(thin.held.cover / thin.before.cover, 2)}, fullest ${f(thin.held.max)}; by area cover ×${f(area.held.cover / area.before.cover, 2)}, fullest ${f(area.held.max)}, volume ${f(area.before.vol, 5)} → ${f(area.held.vol, 5)}; the old solver cover ×${f(old.held.cover / old.before.cover, 2)}, fullest ${f(old.held.max)}`);

  // 3.
  {
    const worst = (a) => Math.max(...a.after.ring.map((v, b) => Math.abs(v - still.after.ring[b])));
    check('when the glass lifts the pool comes back to the one never pressed, to 0.03 in every ring',
      thin.after.off < 0.05 * thin.held.off && worst(thin) < 0.03,
      `worst ring ${f(worst(thin))} (by area ${f(worst(area))}, the old solver ${f(worst(old))}); Σ|h − h₀| ${thin.held.off.toExponential(2)} → ${thin.after.off.toExponential(2)}; pressed ${thin.after.ring.slice(0, 10).map((v) => f(v, 2)).join(' ')}, never ${still.after.ring.slice(0, 10).map((v) => f(v, 2)).join(' ')}`);
  }

  // 4.
  {
    const grow = (k) => r.fronts[k].held.spread / r.fronts[k].start.spread;
    const show = (k) => `${f(r.fronts[k].start.spread)} → ${f(r.fronts[k].held.spread)}`;
    check(`pressed into a thicker oil, the thinner ferrofluid's bumps hold out (Saffman–Taylor): at least 1.2 times an even pair's; in water, where it is the thicker, no more than 1.05 times`,
      grow('0.45:own') > 1.2 * grow('0.45:even') && grow('0:own') <= 1.05 * grow('0:even'),
      `outline spread over radius, ferrofluid ${f(r.fronts['0.45:ratio'], 2)} of the oil's viscosity ${show('0.45:own')}, as thick as it ${show('0.45:even')}; ${f(r.fronts['0:ratio'], 1)} of water's ${show('0:own')}, as thick as it ${show('0:even')}`);
  }

  // 5.
  check('with Thin Gap off the ferrofluid is carried by area, as it was: Σc kept to 1e-4 through a press',
    Math.abs(old.held.area - old.before.area) < 1e-4,
    `Σc ${f(old.before.area, 5)} → ${f(old.held.area, 5)}`);

  check('no GPU errors', gpuErrors.length === 0, gpuErrors.slice(0, 3).join(' | '));
} finally {
  await close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
