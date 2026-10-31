#!/usr/bin/env node
/**
 * A popped bubble closes back into the liquid, not into blocks.
 *
 *   npm run pops      (node only: src/lib/bubbleDye.ts on its own)
 *
 * Reported: "popping bubbles ends up with really pixelated areas that aren't
 * realistic at all." The ring a bubble pushes its dye into, and the fill
 * that closes its hole when it pops, were laid on hard-edged sets of grid
 * cells, each given the same amount: a small bubble came back as a flat,
 * stepped plug in a drained, stepped ring. Here a bubble sits in a plate of
 * gently varying dye, taking what is under it as the GPU does (a soft disc,
 * multiplied out), its dye goes to the ring, it pops, and the fill runs as
 * the app runs it. Then: how far the spot is from round (see below), and
 * how much dye there is.
 * The old hard-edged way is run alongside, for the record.
 */
import { build } from 'esbuild';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const out = 'node_modules/.cache/pops-bubbleDye.mjs';
await build({ entryPoints: ['src/lib/bubbleDye.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning' });
const { depositRim, fillHole } = await import(`../${out}`);

// The old way, as it was: every cell inside R, every cell of the annulus, the same amount each.
const old = {
  depositRim(t, N, x, y, R, mass, aR, aG, aB) {
    const rIn = R * 1.02, rOut = R * 1.38, cells = [];
    for (let j = Math.floor(y - rOut); j <= Math.ceil(y + rOut); j++) for (let i = Math.floor(x - rOut); i <= Math.ceil(x + rOut); i++) {
      const d = Math.hypot(i - x, j - y); if (d >= rIn && d <= rOut) cells.push(i + j * N);
    }
    for (const k of cells) { t.density[k] += mass / cells.length; t.densityR[k] += aR / cells.length; t.densityG[k] += aG / cells.length; t.densityB[k] += aB / cells.length; }
  },
  fillHole(t, dye, N, x, y, R) {
    const rOut = R * 1.45, disc = [], ring = [];
    for (let j = Math.floor(y - rOut); j <= Math.ceil(y + rOut); j++) for (let i = Math.floor(x - rOut); i <= Math.ceil(x + rOut); i++) {
      const d = Math.hypot(i - x, j - y); if (d <= R) disc.push(i + j * N); else if (d <= rOut) ring.push(i + j * N);
    }
    let dm = 0, rm = 0; for (const k of disc) dm += dye[k * 4 + 3]; for (const k of ring) rm += dye[k * 4 + 3];
    const per = (rm / ring.length - dm / disc.length) * 0.35;
    if (!(per > 1e-4)) return 0;
    const moved = Math.min(per * disc.length, rm * 0.5);
    for (const k of disc) t.density[k] += moved / disc.length;
    for (const k of ring) t.mul[k] *= 1 - moved / rm;
    return moved;
  },
};

const N = 192;
const run = (impl, R) => {
  const x = 100.37, y = 80.61;
  // The plate: RGBA per cell (absorptions, density), gently varying.
  const dye = new Float32Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const m = 1 + 0.3 * Math.sin(i * 0.05) * Math.cos(j * 0.04);
    const k = (i + j * N) * 4; dye[k] = 0.5 * m; dye[k + 1] = 0.8 * m; dye[k + 2] = 0.2 * m; dye[k + 3] = m;
  }
  const total = () => { let s = 0; for (let k = 3; k < dye.length; k += 4) s += dye[k]; return s; };
  const before = total();
  const fresh = () => ({ density: new Float32Array(N * N), densityR: new Float32Array(N * N), densityG: new Float32Array(N * N),
    densityB: new Float32Array(N * N), mul: new Float32Array(N * N).fill(1) });
  const apply = (t) => {
    for (let k = 0; k < N * N; k++) {
      for (let c = 0; c < 4; c++) dye[k * 4 + c] *= t.mul[k];
      dye[k * 4 + 3] += t.density[k]; dye[k * 4] += t.densityR[k]; dye[k * 4 + 1] += t.densityG[k]; dye[k * 4 + 2] += t.densityB[k];
    }
  };
  // The air takes what is under it (a soft disc, as the air splat is), and the rim gets it.
  let mass = 0, aR = 0, aG = 0, aB = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d = Math.hypot(i - x, j - y); const a = 1 - Math.max(0, Math.min(1, (d - (R - 0.75)) / 1.5));
    if (a <= 0) continue;
    const k = (i + j * N) * 4;
    mass += dye[k + 3] * a; aR += dye[k] * a; aG += dye[k + 1] * a; aB += dye[k + 2] * a;
    for (let c = 0; c < 4; c++) dye[k + c] *= 1 - a;
  }
  const t0 = fresh(); impl.depositRim(t0, N, x, y, R, mass, aR, aG, aB); apply(t0);
  // It pops: the fill, a pass per mirror, as long as the app keeps it on the books.
  for (let p = 0; p < 45; p++) { const t = fresh(); if (!(impl.fillHole(t, dye, N, x, y, R) > 0)) break; apply(t); }
  /*
    Blocks, measured as what is not round: a bubble and its ring are round,
    so everything left at the spot should depend on the distance from its
    centre alone. Each cell against the spot's own radial profile (the mean
    at that distance, in quarter-cell bins, interpolated), in the plate's own
    level (1): stair-steps and square corners are what is left. And the scar:
    the profile's range, how far the spot still is from the plate.
  */
  const W = R * 1.8 + 3, bin = 0.25, nb = Math.ceil(W / bin) + 2;
  const sum = new Float64Array(nb), cnt = new Float64Array(nb);
  const cellsAt = [];
  for (let j = Math.floor(y - W); j <= y + W; j++) for (let i = Math.floor(x - W); i <= x + W; i++) {
    const d = Math.hypot(i - x, j - y); if (d > W) continue;
    const v = dye[(i + j * N) * 4 + 3] - (1 + 0.3 * Math.sin(i * 0.05) * Math.cos(j * 0.04));
    const b = Math.floor(d / bin); sum[b] += v; cnt[b]++; cellsAt.push([d, v]);
  }
  const prof = Array.from(sum, (s, b) => (cnt[b] ? s / cnt[b] : NaN));
  const at = (d) => {
    const b = d / bin; let lo = Math.floor(b), hi = lo + 1;
    while (lo > 0 && Number.isNaN(prof[lo])) lo--; while (hi < nb - 1 && Number.isNaN(prof[hi])) hi++;
    const a0 = prof[lo], a1 = Number.isNaN(prof[hi]) ? a0 : prof[hi];
    return Number.isNaN(a0) ? a1 : a0 + (a1 - a0) * Math.max(0, Math.min(1, (b - lo) / Math.max(1, hi - lo)));
  };
  let dev = 0, lo = Infinity, hi = -Infinity;
  for (const [d, v] of cellsAt) { dev += Math.abs(v - at(d)); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return { blocks: dev / cellsAt.length, range: hi - lo, kept: total() / before };
};

for (const R of [2.5, 4, 8]) {
  const was = run(old, R), now = run({ depositRim, fillHole }, R);
  console.log(`     a bubble of radius ${R} cells, popped: out of round by ${now.blocks.toFixed(4)} (${was.blocks.toFixed(4)} the old way), `
    + `scar ${now.range.toFixed(2)} deep (${was.range.toFixed(2)}), in the plate's own level`);
  check(`radius ${R}: the spot it popped from is round, not blocks`, now.blocks < 0.4 * was.blocks && now.blocks < 0.012,
    `${now.blocks.toFixed(4)} against ${was.blocks.toFixed(4)}`);
  check(`radius ${R}: and closes back toward the plate`, now.range < 0.3 * was.range,
    `a scar ${now.range.toFixed(2)} deep against ${was.range.toFixed(2)}`);
  check(`radius ${R}: no dye made or lost`, Math.abs(now.kept - 1) < 1e-4, `${(now.kept * 100).toFixed(3)}%`);
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
