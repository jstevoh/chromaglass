#!/usr/bin/env node
/**
 * Foam Cells: a packed emulsion whose junctions turn to 120° on their own.
 *
 *   npm run foam      (any adapter that computes: scripts/lab.mjs)
 *
 * PLAN 47z-5. The owner asked for the cellular networks of the Microlab films
 * and a macro film of a packed foam (2026-11-13), from real physics: drawn
 * cells were retired at his word (2026-10-29). A 2D emulsion with under a
 * sixth of its area water cannot round its drops up, so they press flat
 * against each other, and their tension pulls every meeting of films to
 * three at 120° (Plateau's laws, in the plane of the gap). Foam Cells lays
 * that crowd pressed together at random angles (src/lib/oilLay.ts, a power
 * diagram cut by four-cell films); the polygons' angles are then the oil's
 * work, which is what this asks.
 *
 * One plate, 384² (the app's own grid, where the cells are about a seventh
 * of the plate), laid as the app lays the look (foamSeeds, foamCell,
 * layOil, and its dye as seedPreset's 'foam-cells'), stepped SECONDS with the
 * look's own plate settings. Junctions read by scripts/foamjunctions.mjs,
 * whose floor on an exact hexagonal foam is a median 4° off and 98% within
 * 10° (the grid's, not the foam's). Asked:
 *
 *   1. a foam is laid: at least CELLS cells and the oil at least FILL of the
 *      dish (inside the open rim, where it is laid), past the 0.84 where discs in the plane jam (under it the cells
 *      round up into a wet crowd, which the lab showed at cells twenty grid
 *      cells across: fill 0.69, 68 cells to 33 in twelve seconds)
 *   2. the lay is not already Plateau's: under LAID_WITHIN of its junctions
 *      within 10° of 120°, so 4 cannot pass on the lay alone
 *   3. the cells hold: at least KEPT of them still separate cells, so a foam
 *      that merged into a few bodies (fewer junctions, each easy to read) is
 *      not a pass
 *   4. the junctions are three-way: at least THREE_WAY of them, from at
 *      least MEASURED read
 *   5. and at 120°: the median junction under MEDIAN off and at most half
 *      the lay's, and at least WITHIN of them within 10°, more than the lay's.
 *      Not the nine in ten 47z-5 proposed: a junction is read to the grid's
 *      floor only where its three films run straight for seven cells, and
 *      the ones beside the rim and the short films between small cells do
 *      not (PLAN 47z-8)
 *   6. the rust stays in the water: the dye per cell in the borders is more
 *      than in the films (the water is thicker there), and the cells' middles
 *      hold under CELL_RUST of the water's dye per cell (Oil Bodies keeps the
 *      cells pale)
 *   7. no oil made or lost: the plate's oil within 1 % of what it was laid
 *
 * Measured (SwiftShader, 2026-11-13): laid 39 cells, 39 junctions, median
 * 13.3° off 120° and 32% within 10°; after four seconds 35 cells, 37
 * junctions all three-way, median 6.1° and 70% within 10° (80% at two
 * seconds); no oil made or lost (97814.9 → 97815.0). Four films popped in
 * the four seconds (PLAN 47z-7). At Splodascope's tension, 0.45, the same
 * plate kept 20 of 39 and read 57%. The bars sit between the lay and the
 * stepped plate, as filmhold's do.
 */
import { openLab } from './lab.mjs';
import { junctions, summary } from './foamjunctions.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 384;
const SECONDS = 4;
const SEED = 7;
const CELLS = 20;
const FILL = 0.8;
const LAID_WITHIN = 0.5;
const KEPT = 0.85;
const THREE_WAY = 0.9;
const MEASURED = 12;
const WITHIN = 0.6;
const MEDIAN = 8;
const CELL_RUST = 0.15;

const { page, close } = await openLab();
let run;
try {
  run = await page.evaluate(async ({ N, SECONDS, SEED }) => {
    await lab.create(N, N);
    const { settings: s, dyes } = lab.look('foam-cells');
    const over = { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag,
      platePressure: s.platePressure, oilTension: s.oilTension, oilBodies: s.oilBodies, diff: s.diffusionRate,
      filmHold: s.filmHold };
    const seeds = lab.foamSeeds(SEED, dyes.length, N);
    const sv = lab.solver();
    sv.layOil((x, y, n) => lab.foamCell(x, y, n, seeds).oil);
    const ab = (c) => [c.r, c.g, c.b].map((v) => -Math.log(Math.max(0.002, v)));
    const d = new Array(N * N * 4).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const cell = lab.foamCell((i + 0.5) / N, (j + 0.5) / N, N, seeds), k = (i + j * N) * 4;
      const put = (amt, a) => { for (let ch = 0; ch < 3; ch++) d[k + ch] += amt * a[ch]; d[k + 3] += amt; };
      if (cell.oil < 1) put(lab.foamWash * (1 - cell.oil), ab(dyes[0]));
      if (cell.cell >= 0) put(lab.foamCellDye * cell.oil, ab(dyes[seeds[cell.cell].dye]));
    }
    lab.addDye(d); lab.flush();
    const oilOf = async () => (await lab.chemistry('mix')).data.filter((_, i) => i % 4 === 0);
    await lab.step(1, over, true);
    const start = await oilOf();
    await lab.step(SECONDS * 60 - 1, over);
    const end = await oilOf();
    const dye = await lab.field('dye'), oilDye = await lab.field('oilDye');
    // the water's own dye per cell: all of it less the oil's share
    const water = new Array(N * N);
    for (let q = 0; q < N * N; q++) water[q] = Math.max(0, dye[q * 4 + 3] - oilDye[q * 4 + 3]);
    return { start, end, water };
  }, { N, SECONDS, SEED });
} finally {
  await close();
}

const sum = (a) => a.reduce((x, y) => x + y, 0);
const laid = junctions(N, run.start), after = junctions(N, run.end);
const L = summary(laid), A = summary(after);
const fmt = (s) => `${s.drops} cells, ${s.junctions} junctions (${s.threeWay} three-way, ${s.measured} read), median ${s.medianDev.toFixed(1)}° off 120°, ${(100 * s.within10).toFixed(0)}% within 10°`;
console.log(`  laid:  ${fmt(L)}`);
console.log(`  after ${SECONDS} s: ${fmt(A)}`);

// the oil's share of the dish, inside the open rim (OPEN_RIM, lib/turntable.ts), where the foam is laid
let dishOil = 0, dishCells = 0;
for (let q = 0; q < N * N; q++) if (Math.hypot((q % N + 0.5) / N - 0.5, (Math.floor(q / N) + 0.5) / N - 0.5) < 0.5) { dishOil += run.start[q]; dishCells++; }
const fill = dishOil / dishCells;
check('a foam is laid', L.drops >= CELLS && fill >= FILL, `${L.drops} cells (at least ${CELLS}), oil ${fill.toFixed(2)} of the dish (at least ${FILL})`);
check('the lay is not already Plateau\'s', L.within10 < LAID_WITHIN, `${(100 * L.within10).toFixed(0)}% of the laid junctions within 10° of 120° (under ${100 * LAID_WITHIN}%)`);
check('the cells hold', A.drops >= KEPT * L.drops, `${L.drops} → ${A.drops} (at least ${100 * KEPT}% left)`);
check('the junctions are three-way', A.measured >= MEASURED && A.threeWay >= THREE_WAY * A.junctions,
  `${A.threeWay} of ${A.junctions} (at least ${100 * THREE_WAY}%), ${A.measured} read (at least ${MEASURED})`);
check('the junctions turn to 120°', A.within10 >= WITHIN && A.medianDev <= MEDIAN && A.within10 > L.within10 && A.medianDev < L.medianDev,
  `${(100 * L.within10).toFixed(0)}% → ${(100 * A.within10).toFixed(0)}% within 10° (at least ${100 * WITHIN}%), median ${L.medianDev.toFixed(1)}° → ${A.medianDev.toFixed(1)}° (at most ${MEDIAN}°)`);
{
  const k = after.kind, mean = (want) => { let s = 0, c = 0; for (let q = 0; q < N * N; q++) if (want(q)) { s += run.water[q]; c++; } return c ? s / c : 0; };
  const border = mean((q) => k[q] === 2), film = mean((q) => k[q] === 1), inside = mean((q) => run.end[q] > 0.95);
  check('the rust stays in the water', border > film && inside < CELL_RUST * border,
    `water's dye per cell: borders ${border.toFixed(3)}, films ${film.toFixed(3)}, the cells' middles ${inside.toFixed(3)} (under ${CELL_RUST} of the borders')`);
}
check('no oil made or lost', Math.abs(sum(run.end) / sum(run.start) - 1) < 0.01, `${sum(run.start).toFixed(1)} → ${sum(run.end).toFixed(1)}`);

const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
