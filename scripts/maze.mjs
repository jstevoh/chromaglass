#!/usr/bin/env node
/**
 * Maze Detail: the ferrofluid's labyrinth made finer, measured on the GPU
 * solver alone (scripts/lab.mjs).
 *
 *   npm run maze
 *
 * Steve's references (Chemical Bouillon's ferrofluid films) run fingers
 * about a sixtieth of the frame wide, and the maze as it was drew them two
 * to three times wider. Maze Detail divides the maze's period (MAZE_PERIOD,
 * in src/gpu/fluid.ts) by up to three. What this asks is whether the
 * fingers the solver actually grows are finer, not whether a constant
 * changed:
 *
 *   1. at Detail 0.5 the fingers are narrower after four seconds than at
 *      Detail 0 after eight, so finer is not younger
 *   2. with the ferrofluid all still there (the maze is Cahn–Hilliard, which
 *      conserves), in both
 *   3. and no grid printed through the black (the finer maze has the sharper
 *      forces, which is what printed one before; see physics.mjs)
 *   4. on a grid too coarse for it Detail changes nothing, because the
 *      period's twelve-cell floor holds
 *
 * The finger width is area over half the edge length (2A/P), both counted at
 * half full: for a stripe of width w and length ℓ, A = wℓ and P = 2ℓ. The
 * edge is counted as crossings between side-by-side cells, which overcounts
 * a slanted edge (by up to 4/π), so the widths below are low in absolute
 * terms; only ratios between runs are judged, and those it treats alike.
 *
 * Why 1 compares against a maze twice as old. A finer maze also forms
 * faster (its growth rate goes as the wavenumber to the fourth), and the
 * width at Detail 0 is still falling at four seconds. Measured while writing
 * this (lab, 512², the eighteen drops below):
 *
 *   Detail   width at 240 steps   at 480   plate past half full at 480
 *   0        0.059                0.043    18.3%
 *   0.35     0.038                0.022    17.8%
 *   0.6      0.025                0.014    16.4%
 *
 * Detail 0 at 480 against itself at 240 is 0.73, so "narrower at the same
 * age" would pass on age alone. Detail 0.5 at 240 (0.030 when this check was
 * first run) against Detail 0 at 480 is about 0.69: finer than the default
 * maze gets in twice the time. The bound is 0.85, under which age cannot
 * account for it.
 *
 * Not asserted: whether the maze reaches the period asked for. The power
 * spectrum's peak (compensated by k³ for the edges' own tail) sat at 39 then
 * 32 cells for Detail 0 at 240 and 480 steps, where 23 were asked, and at
 * 32 with a second bump at 18–21 cells for Detail 0.5, where 13.3 were: the
 * maze is still coarsening towards its period at eight seconds, and a claim
 * about where it ends up would be a claim about a moment. Nor the grey:
 * printed, not judged. At 240 steps the plate past half full reads 18.7%
 * and 18.3% at Detail 0 and 0.5, and the grey share of the ferrofluid
 * (cells a sixth to five-sixths full) 47% and 56%; the grey wash the floor
 * stops only showed at the floor, after 480 steps, and 4 is what holds the
 * floor.
 *
 * Why 512². On 256² the default period is already under the floor
 * (0.045 × 256 = 11.5 cells), so Detail does nothing there, which is what 4
 * uses. At 512² Detail 0 is 23 cells and 0.5 is 13.3, both above it.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else (about seventeen minutes
 * there, most of it the 480 steps at 512²).
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const { page, close } = await openLab();
try {
  // The whole phase field at a checkpoint: width, mass, cover, grey share,
  // and the grid-scale part inside the black (physics.mjs's measure).
  const read = () => page.evaluate(async () => {
    const f = await lab.phase(); const n = f.n, d = f.data;
    let mass = 0, area = 0, edge = 0, grey = 0, hf = 0, inner = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = d[x + y * n]; mass += v; if (v > 0.5) area++; if (v > 0.15 && v < 0.85) grey += v;
      if (x + 1 < n && (v > 0.5) !== (d[x + 1 + y * n] > 0.5)) edge++;
      if (y + 1 < n && (v > 0.5) !== (d[x + (y + 1) * n] > 0.5)) edge++;
      if (x > 0 && y > 0 && x < n - 1 && y < n - 1 && v > 0.9 && Math.min(d[x + 1 + y * n], d[x - 1 + y * n], d[x + (y + 1) * n], d[x + (y - 1) * n]) > 0.6) {
        const b = (4 * v + 2 * (d[x + 1 + y * n] + d[x - 1 + y * n] + d[x + (y + 1) * n] + d[x + (y - 1) * n])
          + d[x + 1 + (y + 1) * n] + d[x - 1 + (y + 1) * n] + d[x + 1 + (y - 1) * n] + d[x - 1 + (y - 1) * n]) / 16;
        hf += Math.abs(v - b); inner++;
      }
    }
    if (edge === 0 || area === 0) throw new Error(`nothing on the plate: area ${area}, edge ${edge}`);
    return { n, mass, width: 2 * area / edge / n, cover: area / (n * n), grey: grey / mass, grid: hf / Math.max(1, inner), sum: Array.from(d).reduce((s, v, i) => s + v * ((i % 97) + 1), 0) };
  });
  // The eighteen drops of `npm run physics`'s maze, at golden-angle places,
  // so every run starts from the same plate; read at each checkpoint.
  const grow = async (n, detail, checkpoints) => {
    await page.evaluate((n) => lab.create(n), n);
    await page.evaluate(() => { for (let k = 0; k < 18; k++) { const a = k * 2.399963229728653, rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
      lab.addPhase(0.5 + Math.cos(a) * rad, 0.5 + Math.sin(a) * rad, 0.088, 0.9); } });
    const out = { poured: await read() };
    let done = 0;
    for (const s of checkpoints) {
      await page.evaluate(([k, detail]) => lab.step(k, { magnetStrength: 0, ferroLabyrinth: 1, phaseSharp: 0.75, mazeDetail: detail }), [s - done, detail]);
      done = s;
      out[s] = await read();
    }
    return out;
  };

  const coarse = await grow(512, 0, [240, 480]);
  const fine = await grow(512, 0.5, [240]);
  console.log(`  Detail 0: width ${coarse[240].width.toFixed(4)} at 240 steps, ${coarse[480].width.toFixed(4)} at 480; Detail 0.5: ${fine[240].width.toFixed(4)} at 240`);
  console.log(`  measured, not judged: past half full ${(coarse[240].cover * 100).toFixed(1)}% and ${(fine[240].cover * 100).toFixed(1)}% at 240 steps; `
    + `grey share of the ferrofluid ${(coarse[240].grey * 100).toFixed(0)}% and ${(fine[240].grey * 100).toFixed(0)}%\n`);

  check('Maze Detail makes the fingers finer than the default maze gets in twice the time',
    fine[240].width < coarse[480].width * 0.85,
    `${fine[240].width.toFixed(4)} of the plate at Detail 0.5 after 240 steps against ${coarse[480].width.toFixed(4)} at 0 after 480 (ratio ${(fine[240].width / coarse[480].width).toFixed(2)})`);
  const drift = (r) => Math.abs(r.mass / r.poured.mass - 1);
  check('and keeps all the ferrofluid', drift({ ...fine[240], poured: fine.poured }) < 0.001 && drift({ ...coarse[480], poured: coarse.poured }) < 0.001,
    `Detail 0.5 ${fine.poured.mass.toFixed(1)} → ${fine[240].mass.toFixed(1)}, Detail 0 ${coarse.poured.mass.toFixed(1)} → ${coarse[480].mass.toFixed(1)}`);
  check('with the black solid, no grid through it', fine[240].grid < 0.01,
    `grid-scale part inside it ${fine[240].grid.toFixed(4)} at Detail 0.5 (${coarse[480].grid.toFixed(4)} at 0)`);

  // The floor. The same plate, sixty steps, Detail 0 and 1 on 256²: the
  // period is clamped to twelve cells either way, so the fields must agree
  // to the last bit. A weighted sum of every cell stands for the field.
  const low0 = await grow(256, 0, [60]), low1 = await grow(256, 1, [60]);
  check('on a grid too coarse for it, Detail changes nothing (the twelve-cell floor)',
    low0[60].sum === low1[60].sum && low0[60].mass === low1[60].mass,
    `256², 60 steps: field sums ${low0[60].sum.toFixed(3)} at Detail 0 and ${low1[60].sum.toFixed(3)} at 1`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
