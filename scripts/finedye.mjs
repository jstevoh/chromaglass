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
 * pixels a texel through the solver's own velocity, never blurring it; the
 * plate draws it, scaled to the grid's thickness round each cell.
 *
 * Asked here, on three dyes under the camera at 6x, 256², the camera off the
 * swirl's centre and turned (cx 0.52, cy 0.47, a turn of 0.6 rad, so a window
 * placed, signed or turned wrong lands its detail off the dye's own edges),
 * the window told where the camera looks by a frame before the steps, as the
 * app's frames tell the solver. The same dyes are run twice: stirred by a
 * steady vortex for 600 steps, and never stirred.
 *
 *   1. the flow makes the detail: Fine Detail at 1 raises fine over coarse
 *      over the same frame at 0 by at least RISE more on the stirred plate
 *      than on the still one. The still plate's rise is what the detail
 *      does with the advection doing nothing (a seed sharpened, say, which
 *      drew teeth on a still edge on the owner's Mac and was taken out)
 *   2. it is structure where the dye is, not grain: the signed luminance
 *      difference between the two stirred frames keeps GRAIN_CORR of its
 *      variance at a lag of four pixels (two texels), where grain drawn at
 *      the detail's own texel and read bilinearly, the control, falls under
 *      it; and at least WHERE of the difference's magnitude sits on the
 *      fifth of the pixels where the 0 frame's own gradient is steepest (a
 *      fifth would be no preference at all; a shifted or mirrored window
 *      draws its edges beside the dye's)
 *   3. the detail moves no dye and is alive: the detail's thickness ratio has
 *      a spread of at least SPREAD over the dye, and cell by cell of the
 *      grid's dye, the grid's thickness times it averages within KEEP of the
 *      grid's own in the median cell and within KEEP90 in nine cells of ten
 *      (cells, not one sum whose errors could cancel). Not every cell: the
 *      readback is 192 cells across, the detail is scaled over blocks of the
 *      solver's 256 turned with the camera, so a cell on a steep edge reads
 *      off by the geometry alone (a third, measured, in the worst). Not the frame's light: in the closeup the decode drops
 *      density under the film level, so a crisper edge loses the soft glow
 *      the grid's blur spread round it (6% of the stirred frame's light,
 *      measured), which is the point
 *   4. still liquid grows no texture inside its pools: on the still plate,
 *      over the pixels that are dye (luminance over DYE) and flat in the 0
 *      frame (gradient under FLAT), the 99th percentile of the difference is
 *      under STILL: a pool that is not stirred must not grow threads
 *   5. at 1x there is no window: with the closeup's amount at 1 but the zoom
 *      at 1, after a step the solver holds no fine detail, having held it at
 *      6x, and the frames at 0 and 1 are the same bytes
 *
 * Shortcuts, named: the vortex is forced every other step because the thin
 * gap's drag stops a free one in a few steps (measured: 0.12 to 0.0018 in
 * nine), and it is one steady swirl rather than a show's stir; line 1 asks
 * only for a rise, not for the films' 2.2, because the lab's plate is slow
 * and smooth where a show's is not.
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
const CAM = { zoom: 6, macroAmount: 1, cx: 0.52, cy: 0.47, rotation: 0.6 };
const RISE = 0.01, GRAIN_CORR = 0.5, WHERE = 0.35, SPREAD = 0.05, KEEP = 0.05, KEEP90 = 0.25, DYE = 0.15, FLAT = 0.004, STILL = 0.02;

const run = (stirred) => page.evaluate(async ({ N, STEPS, SIZE, OMEGA, CAM, stirred }) => {
  await lab.create(N);
  lab.dye(0.47, 0.5, 0.035, [1.4, 0.2, 0.6], 1.2);
  lab.dye(0.53, 0.5, 0.035, [0.2, 1.0, 1.4], 1.2);
  lab.dye(0.5, 0.44, 0.03, [1.2, 1.2, 0.1], 1.0);
  lab.flush();
  const L = 192, R = 0.05;
  const kick = () => { const v = new Array(L * L * 4).fill(0);
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) { const dx = (i + 0.5) / L - 0.5, dy = (j + 0.5) / L - 0.5, e = Math.exp(-(dx * dx + dy * dy) / (R * R)) * OMEGA;
      v[(j * L + i) * 4] = -dy * e; v[(j * L + i) * 4 + 1] = dx * e; } lab.addVel(v); };
  await lab.render(SIZE, { macroMode: true, macroFine: 1 }, CAM);
  for (let k = 0; k < STEPS / 2; k++) { if (stirred) kick(); lab.flush(); await lab.step(2); }
  // Line 3: the detail's thickness ratio, cell by cell of the grid's dye (read at L²).
  const f = await lab.fine();
  const held = !!f;
  let spread = 0, worst = 0, p50 = 1, p90 = 1, cellsWithDye = 0;
  if (f) {
    const dye = await lab.field('dye'), w = f.window;
    const a = new Float64Array(L * L), b = new Float64Array(L * L), hits = new Float64Array(L * L);
    let n = 0, m = 0, m2 = 0;
    for (let y = 0; y < w.texY; y++) for (let x = 0; x < w.texX; x++) {
      const dx = ((x + 0.5) / w.texX - 0.5) * 2 * w.hx, dy = ((y + 0.5) / w.texY - 0.5) * 2 * w.hy;
      const px = w.cx + w.c * dx - w.s * dy, py = w.cy + w.s * dx + w.c * dy;
      if (px < 0 || px >= 1 || py < 0 || py >= 1) continue;
      const g = Math.floor(py * L) * L + Math.floor(px * L);
      const c = dye[g * 4 + 3], r = f.data[(y * w.texX + x) * 4 + 3];
      a[g] += c * r; b[g] += c; hits[g]++;
      if (c > 0.05) { n++; m += r; m2 += r * r; }
    }
    spread = n ? Math.sqrt(Math.max(0, m2 / n - (m / n) ** 2)) : 0;
    // A cell counts when the window covers it whole (its edge cells are
    // partial): at least 0.8 of the texels a cell spans land in it.
    const perCell = (2 * w.hx / w.texX) ** -2 / (L * L);
    const errs = [];
    for (let g = 0; g < L * L; g++) {
      if (dye[g * 4 + 3] > 0.05 && hits[g] > 0.8 * perCell) errs.push(Math.abs(a[g] / b[g] - 1));
    }
    errs.sort((x, y) => x - y);
    cellsWithDye = errs.length;
    worst = errs.length ? errs[errs.length - 1] : 1;
    p50 = errs.length ? errs[Math.floor(errs.length / 2)] : 1;
    p90 = errs.length ? errs[Math.floor(errs.length * 0.9)] : 1;
  }
  const frames = [];
  for (const fine of [0, 1]) frames.push(Array.from(new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: fine }, CAM))));
  // Line 5: the closeup's amount at 1, the zoom at 1: no window, so the next step has none.
  const one = { zoom: 1, macroAmount: 1, cx: 0.5, cy: 0.5 };
  await lab.render(SIZE, { macroMode: true, macroFine: 1 }, one);
  await lab.step(1);
  const after = await lab.fine();
  const x0 = new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: 0 }, one));
  const x1 = new Uint8Array(await lab.render(SIZE, { macroMode: true, macroFine: 1 }, one));
  let differ = 0; for (let i = 0; i < x0.length; i++) if (x0[i] !== x1[i]) differ++;
  return { held, spread, worst, p50, p90, cellsWithDye, frames, oneHeld: !!after, oneDiffer: differ };
}, { N, STEPS, SIZE, OMEGA, CAM, stirred });

const W = SIZE, P = W * W;
const lum = (p) => { const L = new Float32Array(P); for (let i = 0; i < P; i++) L[i] = (0.2126 * p[4 * i] + 0.7152 * p[4 * i + 1] + 0.0722 * p[4 * i + 2]) / 255; return L; };
/** The watch's fine over coarse: mean gradient at W/2 over the same at W/8, divided by four. */
const fineCoarse = (L) => {
  const at = (n) => { const b = W / n, o = new Float32Array(n * n);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) o[Math.floor(y / b) * n + Math.floor(x / b)] += L[y * W + x] / (b * b); return o; };
  const grad = (o, n) => { let g = 0; for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) g += Math.hypot(o[y * n + x + 1] - o[y * n + x], o[(y + 1) * n + x] - o[y * n + x]); return g / (n - 1) ** 2; };
  return grad(at(W / 2), W / 2) / (grad(at(W / 8), W / 8) / 4);
};
/** Autocorrelation of a field at a lag of k pixels, across x and y. */
const lagK = (d, k) => {
  let m = 0; for (let i = 0; i < P; i++) m += d[i]; m /= P;
  let v = 0, c = 0;
  for (let y = 0; y < W - k; y++) for (let x = 0; x < W - k; x++) {
    const a = d[y * W + x] - m; v += a * a;
    c += a * (d[y * W + x + k] - m) + a * (d[(y + k) * W + x] - m);
  }
  return c / (2 * v + 1e-12);
};
/** The local gradient of a luminance frame, central differences. */
const gradOf = (L) => { const g = new Float32Array(P);
  for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; g[i] = Math.hypot(L[i + 1] - L[i - 1], L[i + W] - L[i - W]) / 2; }
  return g; };

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
  const [t0, t1] = still.frames.map(lum);
  const rs = fineCoarse(s1) - fineCoarse(s0), rt = fineCoarse(t1) - fineCoarse(t0);
  check(`1. the flow makes the detail: the stirred rise in fine over coarse beats the still one by ${RISE}`, stir.held && still.held && rs - rt >= RISE,
    `stirred ${fineCoarse(s0).toFixed(3)} to ${fineCoarse(s1).toFixed(3)} (rise ${rs.toFixed(3)}), still rise ${rt.toFixed(3)}${stir.held ? '' : '; the solver held no fine detail'}`);

  const diff = new Float32Array(P); let sd = 0; for (let i = 0; i < P; i++) { diff[i] = s1[i] - s0[i]; sd += diff[i] * diff[i]; }
  sd = Math.sqrt(sd / P);
  // The control: grain at the detail's own texel (2 px), of the difference's spread, read bilinearly.
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const T = W / 2, tex = new Float32Array(T * T); for (let i = 0; i < T * T; i++) tex[i] = (rnd() - 0.5) * sd * 3.46;
  const grain = new Float32Array(P);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const u = Math.max(0, Math.min(T - 1.001, (x + 0.5) / 2 - 0.5)), v = Math.max(0, Math.min(T - 1.001, (y + 0.5) / 2 - 0.5));
    const i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j;
    grain[y * W + x] = (tex[j * T + i] * (1 - fx) + tex[j * T + i + 1] * fx) * (1 - fy) + (tex[(j + 1) * T + i] * (1 - fx) + tex[(j + 1) * T + i + 1] * fx) * fy;
  }
  const cd = lagK(diff, 4), cg = lagK(grain, 4);
  const g0 = gradOf(s0), order = Array.from(g0).sort((a, b) => b - a), top = order[Math.floor(P / 5)];
  let onEdge = 0, all = 0; for (let i = 0; i < P; i++) { const m = Math.abs(diff[i]); all += m; if (g0[i] > top) onEdge += m; }
  const where = all > 0 ? onEdge / all : 0;
  check(`2. structure where the dye is, not grain: lag-4 correlation at least ${GRAIN_CORR} (grain under it), at least ${WHERE} on the steepest fifth`,
    cd >= GRAIN_CORR && cg < GRAIN_CORR && sd > 1e-4 && where >= WHERE,
    `difference ${cd.toFixed(3)} (spread ${sd.toFixed(4)}), texel grain ${cg.toFixed(3)}; ${(100 * where).toFixed(1)}% of it on the steepest fifth`);

  const m0 = s0.reduce((a, b) => a + b, 0) / P, m1 = s1.reduce((a, b) => a + b, 0) / P;
  check(`3. alive and moving no dye: ratio spread at least ${SPREAD}, dyed cells' median within ${KEEP * 100}% of the grid's thickness and nine in ten within ${KEEP90 * 100}%`,
    stir.held && stir.spread >= SPREAD && stir.cellsWithDye > 50 && stir.p50 <= KEEP && stir.p90 <= KEEP90,
    `spread ${stir.spread.toFixed(3)}; cells off the grid's thickness: median ${stir.p50.toFixed(3)}, nine in ten under ${stir.p90.toFixed(3)}, worst ${stir.worst.toFixed(3)}, of ${stir.cellsWithDye} (the frame's light ${m0.toFixed(4)} at 0, ${m1.toFixed(4)} at 1)`);

  const gt = gradOf(t0), inside = [];
  for (let i = 0; i < P; i++) if (t0[i] > DYE && gt[i] < FLAT) inside.push(Math.abs(t1[i] - t0[i]));
  inside.sort((a, b) => a - b);
  const p99 = inside.length ? inside[Math.floor(inside.length * 0.99)] : 1;
  check(`4. still liquid grows no texture inside its pools: 99th percentile of the difference under ${STILL}`, still.held && inside.length > P * 0.05 && p99 < STILL,
    `${p99.toFixed(4)} over ${(100 * inside.length / P).toFixed(1)}% of the frame${still.held ? '' : '; the solver held no fine detail'}`);
  check('5. at 1x there is no window: no fine detail after a step (held at 6x), and Fine Detail 0 and 1 draw the same bytes', stir.held && !stir.oneHeld && stir.oneDiffer === 0,
    `held at 6x ${stir.held}, at 1x ${stir.oneHeld}, ${stir.oneDiffer} bytes differ`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
