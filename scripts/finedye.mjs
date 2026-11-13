#!/usr/bin/env node
/**
 * The closeup's fine dye draws what is finer than a grid cell, from the flow.
 *
 *   npm run finedye      (the lab: any adapter that computes)
 *   npm run finedye -- --out <dir>   also writes the 6x frames, Fine Detail 0 and 1
 *
 * What was reported (2026-11-11, measured 2026-11-13, PLAN 47a): at 6x a
 * solver cell covers tens of screen pixels, so the closeup was a magnified
 * blur, 1.08 to 1.2 on the "fine over coarse" measure (the mean luminance
 * gradient at half the frame's pixels over the same at an eighth, divided by
 * four) where a macro artist's films of real dye read 2.2 to 3.1.
 * `gpu/fineDye.ts` carries the dye over the closeup's window at two screen
 * pixels a texel through the solver's own velocity, never blurring it, each
 * field born with the grid's numerical diffusion undone; the plate draws it,
 * scaled to the grid's thickness round each cell.
 *
 * Asked here, on three dyes side by side under the camera at 6x, 256², the
 * window told where the camera looks by a frame before the steps (as the
 * app's frames tell the solver):
 *
 *   1. stirred by a steady vortex for 600 steps, the frame with Fine Detail
 *      at 1 reads at least RISE more fine over coarse than the same frame
 *      with it at 0 (the same plate, the same moment: only the detail
 *      differs)
 *   2. that rise is the flow's, not grain: the signed luminance difference
 *      between the two frames holds GRAIN_CORR or more of its variance
 *      between neighbouring pixels (lag-one autocorrelation). Poisson
 *      grain, which the dye's particles drew when they were tried for this
 *      (the handoff of 2026-11-13), reads about 0; the control is white
 *      noise of the difference's own spread, which must read under it
 *   3. the detail moves no dye: over the window, the grid's thickness times
 *      the detail sums to within KEEP of the grid's own. Not the frame's
 *      light: in the closeup the decode drops density under the film level,
 *      so a crisper edge loses the soft glow the grid's blur spread round it
 *      (6% of the stirred frame's light, measured), which is the point
 *   4. still liquid gets no texture: on the same dyes never stirred, inside
 *      the pools (where the 0 frame's own luminance gradient is under
 *      FLAT), the two frames differ by under STILL of full scale on average.
 *      The edges may sharpen (the seed undoes the grid's blur); the inside of
 *      a still pool must not grow threads
 *   5. at 1x there is no window and nothing runs: after a step at 1x the
 *      solver holds no fine detail, and the frames at 0 and 1 are the same
 *      bytes
 *
 * Shortcuts, named: the vortex is forced every other step because the thin
 * gap's drag stops a free one in a few steps (measured: 0.12 to 0.0018 in
 * nine), and it is one steady swirl rather than a show's stir; line 1 asks
 * the stirred frame only for a rise, not for the films' 2.2, because the
 * lab's plate is slow and smooth where a show's is not.
 */
import { openLab } from './lab.mjs';
import fs from 'node:fs';
import path from 'node:path';

const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 256, STEPS = 600, SIZE = 768, OMEGA = 5;
const RISE = 0.02, GRAIN_CORR = 0.6, KEEP = 0.03, FLAT = 0.004, STILL = 0.004;

const run = (stirred) => page.evaluate(async ({ N, STEPS, SIZE, OMEGA, stirred }) => {
  await lab.create(N);
  lab.dye(0.47, 0.5, 0.035, [1.4, 0.2, 0.6], 1.2);
  lab.dye(0.53, 0.5, 0.035, [0.2, 1.0, 1.4], 1.2);
  lab.dye(0.5, 0.44, 0.03, [1.2, 1.2, 0.1], 1.0);
  lab.flush();
  const L = 192, R = 0.05;
  const kick = () => { const v = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const dx = (i + 0.5) / L - 0.5, dy = (j + 0.5) / L - 0.5, e = Math.exp(-(dx * dx + dy * dy) / (R * R)) * OMEGA;
      v[(j * L + i) * 4] = -dy * e; v[(j * L + i) * 4 + 1] = dx * e; } lab.addVel(v); };
  const cam = { zoom: 6, macroAmount: 1, cx: 0.5, cy: 0.5 };
  await lab.render(SIZE, { macroMode: true, macroFine: 1 }, cam);
  for (let k = 0; k < STEPS / 2; k++) { if (stirred) kick(); lab.flush(); await lab.step(2); }
  // Line 3: the grid's thickness times the detail's, summed over the window, against the grid's own.
  const f = await lab.fine();
  const held = !!f;
  let keep = null;
  if (f) {
    const dye = await lab.field('dye'), w = f.window;
    let a = 0, b = 0;
    for (let y = 0; y < w.texY; y++) for (let x = 0; x < w.texX; x++) {
      const qx = (x + 0.5) / w.texX - 0.5, qy = (y + 0.5) / w.texY - 0.5;
      const dx = qx * 2 * w.hx, dy = qy * 2 * w.hy;
      const px = w.cx + w.c * dx - w.s * dy, py = w.cy + w.s * dx + w.c * dy;
      const gx = Math.max(0, Math.min(L - 1, Math.floor(px * L))), gy = Math.max(0, Math.min(L - 1, Math.floor(py * L)));
      const c = dye[(gy * L + gx) * 4 + 3];
      a += c * f.data[(y * w.texX + x) * 4 + 3]; b += c;
    }
    keep = b > 0 ? a / b : null;
  }
  const frames = [];
  for (const fine of [0, 1]) frames.push(Array.from(new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: fine }, cam))));
  // Line 5: at 1x the next step has no window.
  const one = { zoom: 1, macroAmount: 0, cx: 0.5, cy: 0.5 };
  await lab.render(SIZE, { macroMode: true, macroFine: 1 }, one);
  await lab.step(1);
  const after = await lab.fine();
  const a = new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: 0 }, one));
  const b = new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: 1 }, one));
  let differ = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differ++;
  return { held, keep, frames, oneHeld: !!after, oneDiffer: differ };
}, { N, STEPS, SIZE, OMEGA, stirred });

const W = SIZE, P = W * W;
const lum = (p) => { const L = new Float32Array(P); for (let i = 0; i < P; i++) L[i] = (0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]) / 255; return L; };
/** The watch's fine over coarse: mean gradient at W/2 over the same at W/8, divided by four. */
const fineCoarse = (L) => {
  const at = (n) => { const b = W / n, o = new Float32Array(n * n);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) o[Math.floor(y / b) * n + Math.floor(x / b)] += L[y * W + x] / (b * b); return o; };
  const grad = (o, n) => { let g = 0; for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) g += Math.hypot(o[y * n + x + 1] - o[y * n + x], o[(y + 1) * n + x] - o[y * n + x]); return g / (n - 1) ** 2; };
  return grad(at(W / 2), W / 2) / (grad(at(W / 8), W / 8) / 4);
};
/** Lag-one autocorrelation of a field across x and y. */
const lagOne = (d) => {
  let m = 0; for (let i = 0; i < P; i++) m += d[i]; m /= P;
  let v = 0, c = 0;
  for (let y = 0; y < W - 1; y++) for (let x = 0; x < W - 1; x++) {
    const a = d[y * W + x] - m; v += a * a;
    c += a * (d[y * W + x + 1] - m) + a * (d[(y + 1) * W + x] - m);
  }
  return c / (2 * v + 1e-12);
};
const mean = (L) => { let s = 0; for (let i = 0; i < P; i++) s += L[i]; return s / P; };

const { page, close } = await openLab();
try {
  const stir = await run(true);
  const still = await run(false);
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    for (const [tag, r] of [['stirred', stir], ['still', still]]) {
      for (const [k, f] of r.frames.entries()) {
        const b64 = await page.evaluate(async ({ f, W }) => {
          const c = new OffscreenCanvas(W, W); c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f), W, W), 0, 0);
          const a = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s);
        }, { f, W });
        fs.writeFileSync(path.join(out, `finedye-${tag}-fine${k}.png`), Buffer.from(b64, 'base64'));
      }
    }
  }
  const [s0, s1] = stir.frames.map(lum);
  const r0 = fineCoarse(s0), r1 = fineCoarse(s1);
  check(`1. stirred at 6x, Fine Detail adds at least ${RISE} fine over coarse`, stir.held && r1 - r0 >= RISE,
    `${r0.toFixed(3)} at 0, ${r1.toFixed(3)} at 1 (rise ${(r1 - r0).toFixed(3)})${stir.held ? '' : '; the solver held no fine detail'}`);
  const diff = new Float32Array(P); let sd = 0; for (let i = 0; i < P; i++) { diff[i] = s1[i] - s0[i]; sd += diff[i] * diff[i]; }
  sd = Math.sqrt(sd / P);
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const noise = new Float32Array(P); for (let i = 0; i < P; i++) noise[i] = (rnd() - 0.5) * sd * 3.46;
  const cd = lagOne(diff), cn = lagOne(noise);
  check(`2. the rise is structure, not grain: lag-one correlation of the difference at least ${GRAIN_CORR}`, cd >= GRAIN_CORR && cn < GRAIN_CORR && sd > 1e-4,
    `difference ${cd.toFixed(3)} (spread ${sd.toFixed(4)}), white noise of its spread ${cn.toFixed(3)}`);
  const m0 = mean(s0), m1 = mean(s1);
  check(`3. the detail moves no dye: the grid's thickness times it, over the window, within ${KEEP * 100}% of the grid's own`, stir.keep != null && Math.abs(stir.keep - 1) <= KEEP,
    `${stir.keep?.toFixed(4)} (the frame's light ${m0.toFixed(4)} at 0, ${m1.toFixed(4)} at 1: crisper edges drop the blur's glow under the film level, which is the light the grid's blur made)`);
  const [t0, t1] = still.frames.map(lum);
  let inside = 0, d = 0;
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const g = Math.max(Math.abs(t0[i + 1] - t0[i - 1]), Math.abs(t0[i + W] - t0[i - W])) / 2;
    if (g < FLAT && t0[i] > 0.05) { inside++; d += Math.abs(t1[i] - t0[i]); }
  }
  const dm = inside ? d / inside : 1;
  check(`4. still liquid grows no texture inside its pools: mean difference under ${STILL}`, still.held && inside > P * 0.05 && dm < STILL,
    `${dm.toFixed(5)} over ${(100 * inside / P).toFixed(1)}% of the frame${still.held ? '' : '; the solver held no fine detail'}`);
  check('5. at 1x nothing runs: no fine detail after a step, and Fine Detail 0 and 1 draw the same bytes', !stir.oneHeld && stir.oneDiffer === 0,
    `held ${stir.oneHeld}, ${stir.oneDiffer} bytes differ`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
