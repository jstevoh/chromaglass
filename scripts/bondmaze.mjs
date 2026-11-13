#!/usr/bin/env node
/**
 * The ferrofluid labyrinth's period from the magnetic Bond number (PLAN 38d-1),
 * src/gpu/fluid/mazeBond.ts.
 *
 *   npm run bondmaze
 *
 * What was reported: Ferro Paint's and Magnet Garden's fingers five to seven
 * times finer than the owner's ferrofluid photos, because the maze's period
 * was one constant (0.045 of the plate) at every field. It now follows the
 * coil's field (Labyrinth) through the Bond number N = μ0M²h/σ, and the
 * closed form the solver uses is λ/h = 1.906·exp(4π/N) − 0.5. What this asks:
 *
 *   1. the closed form is the stripe energy's minimum: an independent
 *      minimisation of the full sum (two interfaces σh a period against the
 *      Fourier magnetisation's demagnetising saving, f(q) = (1 − e^−q)/q, a
 *      thousand harmonics past the cutoff) agrees within 5% for N from 2 to
 *      20. A check of the formula against itself would pass on a typo in the
 *      constants; this one is worked from the energy, not from the fit
 *   2. the layer's magnetisation is the Langevin curve of the inner field:
 *      χ/(1 + χ) of the applied field when it is weak, under the liquid's
 *      saturation when it is strong, and solving its own equation to a part
 *      in a thousand
 *   3. the period falls as the field rises (a stronger coil, a finer maze, as
 *      the frame loop's kick already promises) at every step of Labyrinth
 *      from 0.45 to 1, and under the critical field the pool is left a pool:
 *      the period is the plate (MAZE_WIDEST) at Labyrinth 0.3
 *   4. the looks: Magnet Garden and Ferro Paint at their own Labyrinth (the
 *      frame loop plays the coil about the setting, and the period is read
 *      from its mean square, mazeFelt) ask for periods at least three times
 *      the old constant, where the owner's photos are; and the top of the
 *      dial is the old constant's maze within a tenth, so `npm run maze`
 *      still measures the maze it was written for
 *   5. the felt field: steady in, steady out; a kick held for a beat moves
 *      it by under a tenth of the way; held for MAZE_SETTLE, by 1 − 1/e of
 *      the squares
 *
 * Node only (esbuild bundles the module), under a second.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outfile = path.join(root, 'node_modules/.cache/bondmaze.mjs');
mkdirSync(path.dirname(outfile), { recursive: true });
await build({
  stdin: {
    contents: `export * from './src/gpu/fluid/mazeBond.ts'; export { DISH_METRES, DISH_GAP_METRES } from './src/lib/turntable.ts';
export { FERRO_MS_TESLA, FERRO_CHI } from './src/gpu/wgsl/spikes.ts'; export { PRESETS } from './src/presets.ts';`,
    resolveDir: root, loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
});
const M = await import(pathToFileURL(outfile).href);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. The stripe energy, per area, in units h = σ = 1, μ0M² = N; half full.
const energy = (lam, N) => {
  const nmax = Math.ceil(lam / (2 * Math.PI)) * 1000 + 2000;
  let s = 0;
  for (let n = 1; n < nmax; n += 2) {   // a half-full square wave has odd harmonics only
    const c2 = 1 / (n * Math.PI) ** 2;
    const q = 2 * Math.PI * n / lam;
    s += 2 * c2 * (1 - (1 - Math.exp(-q)) / q);
  }
  return 2 / lam - 0.5 * N * s;
};
const minimum = (N) => {
  let lo = Math.log(1), hi = Math.log(1e5);
  for (let i = 0; i < 80; i++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (energy(Math.exp(a), N) < energy(Math.exp(b), N)) hi = b; else lo = a;
  }
  return Math.exp((lo + hi) / 2);
};
{
  let worst = 0, at = 0;
  const rows = [];
  for (const N of [2, 3, 4, 6, 8, 12, 20]) {
    const exact = minimum(N), closed = 1.906 * Math.exp(4 * Math.PI / N) - 0.5;
    const err = Math.abs(closed / exact - 1);
    if (err > worst) { worst = err; at = N; }
    rows.push(`N ${N}: ${exact.toFixed(2)}h vs ${closed.toFixed(2)}h`);
  }
  console.log(`    ${rows.join(', ')}`);
  check('1. the closed form is the stripe energy\'s minimum, N 2 to 20', worst < 0.05, `worst ${(worst * 100).toFixed(1)}% at N ${at}`);
}

// 2. The layer's magnetisation.
{
  const mu0 = 4e-7 * Math.PI, ms = M.FERRO_MS_TESLA / mu0, chi = M.FERRO_CHI;
  const weak = M.layerMagnetisation(1e-5), linear = chi / (1 + chi) * 1e-5 / mu0;
  const strong = M.layerMagnetisation(5);
  const b0 = 0.006, m = M.layerMagnetisation(b0), h = b0 / mu0 - m, x = 3 * chi * h / ms;
  const resid = Math.abs(ms * (1 / Math.tanh(x) - 1 / x) / m - 1);
  check('2. M is the Langevin curve of the inner field', Math.abs(weak / linear - 1) < 0.01 && strong < ms && strong > 0.97 * ms && resid < 1e-3,
    `weak ${(weak / linear).toFixed(4)} of χ/(1+χ)·H0, 5 T ${(strong / ms).toFixed(3)} of Ms, residual at 6 mT ${resid.toExponential(1)}`);
}

// 3. Finer with field; a pool under the critical field.
{
  let falls = true, last = Infinity; const row = [];
  for (let f = 0.45; f <= 1.0001; f += 0.05) {
    const p = M.mazePeriodOf(f);
    if (!(p <= last) || (p === last && p < M.MAZE_WIDEST)) falls = false;
    last = p; row.push(`${f.toFixed(2)}:${p.toFixed(3)}`);
  }
  console.log(`    Labyrinth:period ${row.join(' ')}`);
  check('3. a stronger coil draws a finer maze, and under the onset a pool', falls && M.mazePeriodOf(0.3) === M.MAZE_WIDEST,
    `period at 0.3 ${M.mazePeriodOf(0.3)}, N there ${M.mazeBond(0.3).toFixed(2)}`);
}

// 4. The looks.
{
  const OLD = 0.045;
  const look = (id) => M.PRESETS.find((p) => p.id === id).settings;
  const at = (id) => { const s = look(id); return M.mazePeriodOf(s.ferroLabyrinth) / Math.pow(3, s.mazeDetail ?? 0); };
  const mg = at('magnet-garden'), fp = at('ferro-paint'), top = M.mazePeriodOf(1);
  check('4. the looks ask for the photos\' wide cells, and the top of the dial is the old maze',
    mg >= 3 * OLD && fp >= 3 * OLD && Math.abs(top / OLD - 1) < 0.1,
    `Magnet Garden ${mg.toFixed(3)}, Ferro Paint ${fp.toFixed(3)} of the plate (were ${OLD} and ${(OLD / Math.sqrt(3)).toFixed(3)}); Labyrinth 1 ${top.toFixed(3)}`);
}

// 5. The felt field.
{
  let f = 0.6; for (let i = 0; i < 600; i++) f = M.mazeFelt(f, 0.6, 1 / 60);
  let beat = 0.6; for (let i = 0; i < 15; i++) beat = M.mazeFelt(beat, 1, 1 / 60);
  let held = 0.6; const n = Math.round(M.MAZE_SETTLE * 60); for (let i = 0; i < n; i++) held = M.mazeFelt(held, 1, 1 / 60);
  const share = (held * held - 0.36) / (1 - 0.36);
  check('5. the maze feels the coil\'s mean square over MAZE_SETTLE', Math.abs(f - 0.6) < 1e-9 && (beat - 0.6) / 0.4 < 0.1 && Math.abs(share - (1 - Math.exp(-1))) < 0.01 && M.mazeFelt(0, 0.7, 1 / 60) === 0.7,
    `steady ${f.toFixed(4)}, a quarter-second kick ${beat.toFixed(3)}, ${M.MAZE_SETTLE} s held ${share.toFixed(3)} of the squares`);
}

const bad = results.filter((r) => !r).length;
console.log(bad ? `\n${bad} of ${results.length} failed` : `\nall ${results.length} passed`);
process.exit(bad ? 1 : 0);
