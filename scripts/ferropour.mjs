#!/usr/bin/env node
/**
 * Ferro Paint's ferrofluid worked through the whole plate, measured on the
 * GPU solver alone (scripts/lab.mjs).
 *
 *   npm run ferropour
 *
 * The owner called Ferro Paint underwhelming beside the looks it was made
 * after, Chemical Bouillon's Colored I and II. Put side by side, the gap was
 * where the ferrofluid is, before how it looks: in those films it is worked
 * through the colour edge to edge, black channels and beads between cells of
 * dye across the whole frame. Ferro Paint poured it as every look does, a
 * ring of big drops round the middle (phasePour's `ring`), so its maze only
 * ever formed in the ring and most of the plate stayed plain colour. It now
 * pours `scatter`: many small drops over the whole plate (src/lib/phasePour.ts,
 * PRESET_PHASE_POUR in src/presetPlate.ts). What this asks:
 *
 *   1. every other look still pours exactly the drops it poured before
 *   2. Ferro Paint, laid as the app lays it and played for a while with its
 *      own field and walking magnet, has ferrofluid worked through nearly
 *      every part of the plate: black and colour side by side in each tile
 *      of an 8 × 8 grid. The same look poured the old way is the other arm,
 *      so a check that could not tell the two would show it
 *   3. as channels through the colour, not one pool with holes in it: the
 *      black is under half the plate, and its fingers are narrower than the
 *      ring's blobs
 *   4. with all the ferrofluid still there
 *
 * Measured while writing this (256², 240 steps, SwiftShader): poured over
 * the plate, 179 drops, the black and the colour side by side in 98% of the
 * tiles, black 35% of the plate, fingers 0.0233 of the plate wide; poured as
 * the ring, 18 drops, 45%, 17% and 0.0366. The bounds (at least 90% against
 * under 70%; black a fifth to a half; fingers under 0.8 of the ring's) sit
 * between those with room for another GPU's rounding, and each is a line
 * the old pour or a gathered pool falls on the wrong side of.
 *
 * 2 and 3 are read after the look has run, not at the pour: a pour spread
 * over the plate that the magnet then gathered into a pool, or that
 * coarsened back into a few blobs, would pass a check of the pour and still
 * be the thing the owner called underwhelming.
 *
 * On 256², where Maze Detail does nothing (its twelve-cell floor, see
 * `npm run maze`): what is measured is where the ferrofluid is, which the
 * grid does not change, and 256² is what keeps this to a couple of minutes on
 * a software GPU. How fine the maze is at 512² is `npm run maze`'s question.
 *
 * No canvas, so it runs on any adapter that computes: a Mac's Metal in CI,
 * a Linux box's software WebGPU anywhere else.
 */
import { openLab } from './lab.mjs';
import { phasePour } from '../src/lib/phasePour.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── 1. The ring, as layPhase poured it before there was a choice ──────
{
  // Copied from LiquidVisualizer's layPhase as it stood before phasePour, so
  // that moving it out of the app is held to changing nothing.
  const before = (scale) => {
    const s = Math.max(0, Math.min(1, scale)), out = [];
    const count = Math.round(3 + (1 - s) * 22), r = 0.04 + s * 0.16;
    for (let k = 0; k < count; k++) {
      const a = k * 2.399963229728653, rad = 0.16 + 0.3 * ((k * 0.6180339887) % 1);
      out.push({ x: 0.5 + Math.cos(a) * rad, y: 0.5 + Math.sin(a) * rad, r, amount: 0.9 });
    }
    return out;
  };
  const bad = [];
  for (const scale of [0, 0.1, 0.3, 0.4, 0.55, 1, -1, 2]) for (const amt of [0.01, 0.5, 1]) {
    if (JSON.stringify(phasePour('ring', scale, amt)) !== JSON.stringify(before(scale))) bad.push(`scale ${scale}, amount ${amt}`);
  }
  check('every look that pours a ring pours the same drops it did', bad.length === 0, bad.join('; ') || 'eight scales, three amounts');
}

const STEPS = 240, GRID = 256, TILES = 8;
const { page, close } = await openLab();
try {
  /*
    The look laid and played. Its dye is left off: nothing here reads it, and
    the phase does not depend on it. The field is the look's Labyrinth at
    0.725 of full, where the app holds it between kicks at middling
    loudness; the magnet walks the app's path at the app's speed for middling
    loudness (magnetWalk in LiquidVisualizer), at the look's strength and
    height. Stepped three at a time, as the app's frames are.
  */
  const play = (pour) => page.evaluate(async ({ pour, STEPS, GRID }) => {
    const { settings: L } = lab.look('ferro-paint');
    await lab.create(GRID);
    const drops = lab.pour(pour, L.phaseScale, L.phaseAmount);
    const read = async () => {
      const f = await lab.phase(); let mass = 0; for (const v of f.data) mass += v; return { f, mass };
    };
    const poured = (await read()).mass;
    const scale = L.phaseScale, walk = L.magnetWalk ?? 0;
    let walkT = 0;
    for (let s = 0; s < STEPS; s += 3) {
      const mx = 0.5 + 0.34 * walk * Math.sin(walkT * 0.9), my = 0.5 + 0.28 * walk * Math.sin(walkT * 1.3 + 1.1);
      await lab.step(3, {
        ferroLabyrinth: Math.min(1, L.ferroLabyrinth * 0.725), phaseSharp: L.phaseSharp, phaseTension: scale * 0.45,
        magnetStrength: L.magnetStrength ?? 0, magnetX: mx, magnetY: my, magnetHeight: (L.magnetHeight ?? 0.25) * (0.5 + scale),
        mazeDetail: L.mazeDetail ?? 0, phaseDisplace: L.phaseDisplace ?? 0,
      });
      walkT += (1 / 30) * (0.35 + 1.1 * 0.5) * (0.6 + 0.6 * walk);
    }
    const { f, mass } = await read();
    const n = f.n, d = f.data, T = n / 8;
    let area = 0, edge = 0, worked = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = d[x + y * n]; if (v > 0.5) area++;
      if (x + 1 < n && (v > 0.5) !== (d[x + 1 + y * n] > 0.5)) edge++;
      if (y + 1 < n && (v > 0.5) !== (d[x + (y + 1) * n] > 0.5)) edge++;
    }
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
      let b = 0;
      for (let y = ty * T; y < (ty + 1) * T; y++) for (let x = tx * T; x < (tx + 1) * T; x++) if (d[x + y * n] > 0.5) b++;
      const share = b / (T * T);
      if (share >= 0.1 && share <= 0.9) worked++;
    }
    return { drops, poured, mass, cover: area / (n * n), width: edge ? 2 * area / edge / n : Infinity, worked: worked / 64 };
  }, { pour, STEPS, GRID });

  const look = await page.evaluate(() => lab.look('ferro-paint').pour);
  const now = await play(look);
  const old = await play('ring');
  const pct = (v) => `${(v * 100).toFixed(0)}%`;
  console.log(`  ${GRID}², ${STEPS} steps. Ferro Paint poured '${look}' (${now.drops} drops): tiles worked ${pct(now.worked)}, black ${pct(now.cover)} of the plate, fingers ${now.width.toFixed(4)} wide`);
  console.log(`  the same look poured 'ring' (${old.drops} drops): tiles worked ${pct(old.worked)}, black ${pct(old.cover)}, fingers ${old.width.toFixed(4)} wide\n`);

  check('Ferro Paint pours its own shape, not the ring', look === 'scatter', `PRESET_PHASE_POUR gives '${look}'`);
  check('its ferrofluid is worked through nearly the whole plate',
    now.worked >= 0.9 && old.worked < 0.7,
    `black and colour side by side in ${pct(now.worked)} of an 8 × 8 grid's tiles, against ${pct(old.worked)} poured the old way`);
  check('as channels through the colour, not a pool',
    now.cover > 0.2 && now.cover < 0.5 && now.width < old.width * 0.8,
    `black ${pct(now.cover)} of the plate; fingers ${now.width.toFixed(4)} of the plate wide against the ring's ${old.width.toFixed(4)}`);
  const drift = (r) => Math.abs(r.mass / r.poured - 1);
  check('and keeps all the ferrofluid', drift(now) < 0.001 && drift(old) < 0.001,
    `${now.poured.toFixed(1)} → ${now.mass.toFixed(1)} poured over the plate, ${old.poured.toFixed(1)} → ${old.mass.toFixed(1)} in the ring`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
