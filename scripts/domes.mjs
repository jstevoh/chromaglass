#!/usr/bin/env node
/**
 * Colour between the domes (PLAN.md §9f): where the Magnet parts a pool of
 * ferrofluid, the water between the domes keeps its dye and the plate draws
 * it bright. Measured on the GPU solver and the plate shader (scripts/lab.mjs).
 *
 *   npm run domes
 *
 * What the references show (Chemical Bouillon's, in
 * /mnt/project-files/ferrofluid-look/references) is black domes standing in
 * bright coloured water: the colour runs right up between them. Ours showed
 * the domes in a dark amber film. Two things made it: the domes stand
 * shoulder to shoulder, so there is little between them to see (PLAN.md
 * §9t: our ferrofluid is a layer that cannot stand taller than full, so a
 * packed pool can only spread sideways, where a real peak stands up and
 * takes the liquid from between the peaks), and what there was had lost
 * its dye. That second is what this measures. Magnet Garden does not push
 * the dye out of the ferrofluid (Pushes Dye is off), so the dye under the
 * pool should still be there when the pool parts; it was being lost to the
 * maze's flow, which the dye's backtrace cannot carry without thinning
 * (fluid.ts, the advect dye stage). So, on Magnet Garden, a pool poured
 * over dyed water and the Magnet held under it:
 *
 *   1. the pool parts into domes, so that there are gaps to measure: within
 *      0.08 of the magnet at least a quarter of the plate 0.8 full and up,
 *      the domes, and at least a hundred cells under half full, the gaps,
 *      five points more of them than the same pool with no hand, where
 *      Magnet Garden's Labyrinth still runs the maze on it (a pool spread
 *      thin or gone would have no domes, and a maze of stripes gaps of its
 *      own; the check-skeptic's controls)
 *   2. that water keeps its dye: as much over the gaps, on average, as was
 *      there before the pool was poured (at least three quarters of it)
 *   3. the plate draws the gaps bright and the domes dark: over the gaps
 *      the picture is at least half as bright as the same pixels on the
 *      same plate never given the pool, so the colour is the dye's and not
 *      a dark film's; over the domes, at most half as bright, so a picture
 *      that did not draw the ferrofluid, or drew it somewhere else
 *      (mirrored, turned), fails. At least a hundred cells of each
 *   4. and none of the plate's dye is made or lost by the magnet: the whole
 *      plate's dye within 1% of the plate never given the pool
 *
 * Before this (the backtrace), on 384²: the dye over the gaps 0.07 of 2.46
 * before the pour; the gaps drawn at 0.06 of full white; 6% of the plate's
 * dye gone. After: see the PR that made it (the magnet's pull, and so how
 * many gaps there are, is unchanged).
 *
 * The dye: sixteen patches in three colours, as fingers.mjs lays them, so
 * wherever the domes stand there is colour under them. Magnet Garden's
 * phase settings as the app runs them (fingers.mjs, GARDEN). The Magnet
 * tool held as spikes.mjs holds it, off the plate's middle in both axes.
 *
 * On 384², the grid the app runs on most machines: on 256² a dome is four
 * or five cells across and much of it edge (PLAN.md §9g). About fifteen
 * minutes in a cloud session.
 */
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const HAND = { magnetStrength: 0.9, magnetHeight: 0.15 * 0.9, magnetSeconds: 1 / 60 };
const GARDEN = { ferroLabyrinth: 0.8, phaseSharp: 0.75, phaseTension: 0.3 * 0.45, phaseDisplace: 0 };
const M = { x: 0.36, y: 0.65 };
const NEAR = 0.08;
const STEPS = 240;
const S = 640;

const { page, close } = await openLab();
try {
  const run = (pool, over, draw = true) => page.evaluate(async ({ pool, over, M, NEAR, STEPS, S, draw }) => {
    await lab.create(384);
    const cols = [[0.02, 0.36, 2.0], [2.0, 0.4, 0.48], [0.02, 0.8, 1.05]];
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) lab.dye(0.12 + i * 0.25, 0.12 + j * 0.25, 0.16, cols[(i + j) % 3], 1.3);
    lab.flush(); await lab.step(2);
    const dye0 = await lab.field('dye');
    if (pool) lab.addPhase(M.x, M.y, 0.12, 0.9);
    for (let k = 0; k < STEPS; k += 4) await lab.step(4, over);
    const f = await lab.phase();
    const dye = await lab.field('dye');
    const px = draw ? Array.from(await lab.render(S, lab.look('magnet-garden').settings, {})) : [];
    return { n: f.n, phase: Array.from(f.data), dye0: Array.from(dye0), dye: Array.from(dye), px };
  }, { pool, over, M, NEAR, STEPS, S, draw });

  const HELD = { ...GARDEN, ...HAND, magnetX: M.x, magnetY: M.y };
  const withPool = await run(true, HELD);
  const without = await run(false, HELD);
  // The same pool with no hand at all: Magnet Garden's Labyrinth still runs
  // the maze on it, and a maze of stripes has water between it too, so the
  // parting has to be the magnet's and not the maze's (the check-skeptic's
  // control). The field only; no picture.
  const noHand = await run(true, { ...GARDEN, magnetSeconds: 1 / 60 }, false);

  const Ld = Math.round(Math.sqrt(withPool.dye.length / 4));
  const dyeAt = (a, u, v) => { const i = (Math.floor(u * Ld) + Math.floor(v * Ld) * Ld) * 4; return a[i] + a[i + 1] + a[i + 2]; };
  const total = (a) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i] + a[i + 1] + a[i + 2]; return s; };
  // The plate's (u, v), y up, to the picture's pixel, rows down (the lab
  // draws the plate 1.5 times the frame across: spikes.mjs).
  const lum = (px, u, v) => {
    const x = Math.floor((0.5 + (u - 0.5) * 1.5) * S), y = Math.floor((0.5 - (v - 0.5) * 1.5) * S);
    const k = (x + y * S) * 4; return (px[k] + px[k + 1] + px[k + 2]) / 765;
  };
  const { n, phase: d } = withPool;
  const parted = (field) => {
    let all = 0, under = 0;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (Math.hypot((x + 0.5) / n - M.x, (y + 0.5) / n - M.y) >= NEAR) continue;
      all++; if (field[x + y * n] < 0.5) under++;
    }
    return under / Math.max(all, 1);
  };
  let cells = 0, gaps = 0, gapDye = 0, gapDye0 = 0, clear = 0, clearL = 0, clearL0 = 0, domes = 0, domeL = 0, domeL0 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n, v = (y + 0.5) / n;
    if (Math.hypot(u - M.x, v - M.y) >= NEAR) continue;
    cells++;
    const c = d[x + y * n];
    if (c >= 0.8) { domes++; domeL += lum(withPool.px, u, v); domeL0 += lum(without.px, u, v); }
    if (c >= 0.5) continue;
    gaps++;
    gapDye += dyeAt(withPool.dye, u, v); gapDye0 += dyeAt(withPool.dye0, u, v);
    if (c < 0.12) { clear++; clearL += lum(withPool.px, u, v); clearL0 += lum(without.px, u, v); }
  }
  const open = gaps / Math.max(cells, 1);
  const openNoHand = parted(noHand.phase);
  let gapL = 0, gapL0 = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u = (x + 0.5) / n, v = (y + 0.5) / n;
    if (Math.hypot(u - M.x, v - M.y) >= NEAR || d[x + y * n] >= 0.5) continue;
    gapL += lum(withPool.px, u, v); gapL0 += lum(without.px, u, v);
  }
  const bright = gapL / Math.max(gapL0, 1e-9);
  const dark = domeL / Math.max(domeL0, 1e-9);
  const kept = gapDye / Math.max(gapDye0, 1e-9);
  const plate = total(withPool.dye) / Math.max(total(without.dye), 1e-9);
  console.log(`  within ${NEAR} of the magnet: ${(100 * open).toFixed(0)}% under half full, ${(100 * clear / Math.max(gaps, 1)).toFixed(0)}% of that clear; ` +
    `dye over the gaps ${(gapDye / Math.max(gaps, 1)).toFixed(2)} (${(gapDye0 / Math.max(gaps, 1)).toFixed(2)} before the pour); ` +
    `the gaps drawn at ${(gapL / Math.max(gaps, 1)).toFixed(2)} (${(gapL0 / Math.max(gaps, 1)).toFixed(2)} with no pool), the clear ones at ${(clearL / Math.max(clear, 1)).toFixed(2)} (${(clearL0 / Math.max(clear, 1)).toFixed(2)}); ` +
    `the plate's dye ${total(withPool.dye).toFixed(0)} (${total(without.dye).toFixed(0)} with no pool); ` +
    `${(100 * domes / Math.max(cells, 1)).toFixed(0)}% domes (0.8 full and up), drawn at ${(domeL / Math.max(domes, 1)).toFixed(2)} (${(domeL0 / Math.max(domes, 1)).toFixed(2)} with no pool); ` +
    `with no hand ${(100 * openNoHand).toFixed(0)}% under half full\n`);

  check('held under a pool, the magnet parts it into domes with water between them',
    domes / cells >= 0.25 && gaps >= 100 && open >= openNoHand + 0.05,
    `${(100 * open).toFixed(0)}% of the plate within ${NEAR} of it under half full and ${(100 * domes / Math.max(cells, 1)).toFixed(0)}% domes; ${(100 * openNoHand).toFixed(0)}% under half full with no hand`);
  check('the water between the domes keeps its dye', gaps > 0 && kept >= 0.75,
    `${(100 * kept).toFixed(0)}% of the dye that was there before the pour`);
  check('the plate draws the gaps bright, in the dye\'s colour, and the domes dark', gaps >= 100 && bright >= 0.5 && domes >= 100 && dark <= 0.5,
    `gaps ${(100 * bright).toFixed(0)}% as bright as the same pixels with no pool, over ${gaps}; domes ${(100 * dark).toFixed(0)}%, over ${domes}`);
  check('and the magnet makes or loses none of the plate\'s dye', Math.abs(plate - 1) < 0.01,
    `${(100 * plate).toFixed(1)}% of the plate's dye with no pool`);
} finally {
  await close();
}
const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
