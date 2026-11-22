#!/usr/bin/env node
/**
 * Classic Light Show lays a 1960s dish: oil cells in a coloured water.
 *
 *   npm run classicdish      (any adapter that computes: scripts/lab.mjs)
 *
 * Reported by the owner (2026-11-21): "I really don't like the classic light
 * show preset - it looks nothing like a traditional liquid light show". The
 * references (the Joshua Light Show's Liquid Loops and Fillmore East nights,
 * Glenn McKay's and Bill Ham's footage, the period photographs) all show the
 * same thing: a dish of coloured water on the projector's lamp, filling the
 * glass, and in it round cells of oil of many sizes that will not mix with
 * it, a few small drops of the water caught inside the big ones, the cells
 * warm (orange, amber, yellow) with one cool accent. Classic laid eleven
 * soft pools of dye on black glass and nothing else: no water, no oil.
 * It now lays classicDiscs (src/lib/oilLay.ts) with Oil Bodies and Film
 * Hold on.
 *
 * What this asks is the dish, not that a lay ran. Each plate is laid by the
 * app's own seedPreset('classic') (built here on node, see appLay) and
 * stepped five seconds with the look's own liquid settings (its oil, its
 * film, its bowed glasses, Thin Gap), on two seeds:
 *
 *   now         the look as the app lays it now
 *   before      the old lay (seedPreset's eleven splatBlobs of the old dyes,
 *               no oil, rebuilt here as clockglass.mjs rebuilds its old lay)
 *   bare        the first dish again with Film Hold and Oil Bodies off
 *
 * Asked, of every seed:
 *
 *   1. the dish is full of the water's dye: of the water (where the oil is
 *      not), at least DYED is dyed WET up and nearer the water's dye than
 *      any oil's, more than the old lay's share of dye on black glass
 *   2. the cells stay apart: of the oil discs laid, at least KEPT are still
 *      cells (4-connected regions of the oil over a half, SPECK cells up)
 *      after five seconds, and no more than CELLS_MAX
 *   3. of many sizes, in the references' scale: the median cell's diameter
 *      between 5% and 15% of the dish's, and the biggest at least three
 *      times the smallest's
 *   4. drops of the water stay held inside cells: of the drops laid, at
 *      least HELD still lie in water the oil closes round (no path through
 *      water to the dish's own), where they were laid
 *   5. the oil in at least three colours (each cell named by the laid oil
 *      dye it is plainly nearest), and warm: of the oil's dye, the share in
 *      cells whose colour absorbs blue the most (orange, amber, yellow) at
 *      least WARM
 *   6. and the oil holds the colour laid in it as its own (Oil Bodies): of
 *      the colour laid in the oil, at least CARRIED is the oil's, inside the
 *      oil, after five seconds
 *   7. and the lines read the liquid, not the lay: the bare dish (the same
 *      lay with Film Hold and Oil Bodies off) fails 2 and 6.
 *
 * Measured while writing this (lab, 192², 300 steps) and printed below.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLab } from './lab.mjs';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const N = 192;
const STEPS = 300;
const SEEDS = [1, 2];  // two dishes the app could lay: a look that only works on one seed is not the look
const DISH = 0.45;     // the dish's radius in plate units, as clockglass.mjs measures it
const SPECK = 6;       // cells, for a region of oil to be a cell (filmhold.mjs)
const DROP = 3;        // cells, for a region of water inside oil to be a drop
const DYED = 0.85, WET = 0.3;
const KEPT = 0.9;      // of the cells laid, still apart after five seconds
const CELLS_MAX = 40;
const HELD = 0.75;     // of the drops laid, still held where they were laid
const WARM = 0.6;
const CARRIED = 0.9;
// The old lay's dyes (presetPlate's 'classic' before 38w-1): yellow, amber, hot pink, magenta, ultramarine, blue cheer.
const OLD = [{ r: 1.0, g: 0.92, b: 0.0 }, { r: 1.0, g: 0.70, b: 0.0 }, { r: 1.0, g: 0.0, b: 0.5 },
  { r: 0.88, g: 0.07, b: 0.62 }, { r: 0.29, g: 0.18, b: 1.0 }, { r: 0.0, g: 0.0, b: 1.0 }];

/*
  The app's own lay, not a copy of it. The CPU plate (FluidSimulation) is
  built here on node and asked to seedPreset('classic') as the app asks it,
  with a stand-in for the GPU solver that only writes down the oil it is
  given (addMix: where, how big, oil or a held drop of water). The dye the
  look lays is read back as it lands, the water's (addDensity) apart from the
  oil's own colour (addOilDensity), each as the absorbances the plate keeps.
  A copy of the lay in this file passed while the app laid something else:
  this way the plate below is laid by whatever seedPreset does today.
*/
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'classicdish', 'app.mjs');
mkdirSync(dirname(out), { recursive: true });
await build({
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation.ts'; export { dyeAbsorbances } from './src/lib/dye.ts'; export { setShowSeed } from './src/lib/rng.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
// The GPU's usage flags are named at the solver's import (kickbloom.mjs does the same).
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const app = await import(pathToFileURL(out).href);

const appLay = (seed) => {
  app.setShowSeed(seed);
  const sim = new app.FluidSimulation(N, 0, 0, 0.1);
  const mixes = [], water = new Array(N * N * 4).fill(0), oil = new Array(N * N * 4).fill(0);
  let into = water;
  sim.gpu = new Proxy({ N, addMix: (x, y, r, o) => { mixes.push({ x, y, r, oil: o.oil }); } }, { get: (t, k) => t[k] });
  sim.addDensity = (x, y, d, r = 1, g = 1, b = 1) => {
    const a = app.dyeAbsorbances(r, g, b), k = (x + y * N) * 4;
    for (let ch = 0; ch < 3; ch++) into[k + ch] += d * a[ch];
    into[k + 3] += d;
  };
  sim.addOilDensity = (x, y, d, r, g, b) => { into = oil; try { sim.addDensity(x, y, d, r, g, b); } finally { into = water; } };
  sim.seedPreset('classic', () => 0);
  return { mixes, water, oil };
};

// CLASSICDISH_DUMP=<dir> writes each plate there as a PNG, to look at.
const DUMP = process.env.CLASSICDISH_DUMP;
const { page, close } = await openLab();
try {
  const run = (which, lay, off = {}) => page.evaluate(async ({ which, lay, off, abs, N, STEPS, DISH, SPECK, DROP, WET, OLD, DUMP }) => {
    await lab.create(N, N);
    const { settings: s, dyes: now } = lab.look('classic');
    const dyes = which === 'before' ? OLD : now;
    // The look's own liquid, read from the look: a look that lost its oil would fail here.
    const over = which === 'before'
      ? { thinGap: 1, advection: 0.35, platePressure: 0.25, oilTension: 0, oilBodies: 0, filmHold: 0 }
      : { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag, platePressure: s.platePressure,
        oilTension: s.oilTension, oilBodies: s.oilBodies, filmHold: s.filmHold, diff: s.diffusionRate, ...off };
    const ab = (c) => [c.r, c.g, c.b].map((v) => -Math.log(Math.max(0.002, v)));
    // A dye's absorbances as the app lays them (dyeAbsorbances, floor and ceiling and all), so a cell is named by the dye it was laid with.
    const abOf = (i) => (which === 'before' ? ab(dyes[i]) : abs[i]);
    let laidInOil = 0;
    if (which === 'before') {
      // seedPreset's old 'classic': splatBlob radii in 128-grid units, so sigma = rad / 128 of the plate.
      const d = new Array(N * N * 4).fill(0);
      const blobs = [[0.5, 0.5, 8.5]];
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 + 0.3;
        blobs.push([0.5 + Math.cos(a) * 0.18, 0.5 + Math.sin(a) * 0.14, 7.5 + (i % 2) * 1.5]);
      }
      blobs.push([0.24, 0.24, 10], [0.76, 0.24, 10], [0.24, 0.76, 10], [0.76, 0.76, 10]);
      blobs.forEach(([x, y, rad], idx) => {
        const a = ab(dyes[idx % dyes.length]), sigma = rad / 128;
        for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
          const dx = (i + 0.5) / N - x, dy = (j + 0.5) / N - y;
          const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
          if (w < 0.01) continue;
          const k = (i + j * N) * 4;
          for (let ch = 0; ch < 3; ch++) d[k + ch] += 0.85 * w * a[ch];
          d[k + 3] += 0.85 * w;
        }
      });
      lab.addDye(d);
    } else {
      // The app's lay (appLay above), oil as the solver was handed it and dye in its two liquids.
      const sv = lab.solver();
      for (const m of lay.mixes) sv.addMix(m.x, m.y, m.r, { oil: m.oil });
      lab.addDye(lay.water); lab.addOilDye(lay.oil);
      for (let q = 3; q < lay.oil.length; q += 4) laidInOil += lay.oil[q];
    }
    lab.flush();
    await lab.step(STEPS, over, true);
    const f = await lab.field('dye');
    const inDish = (q, n) => { const x = q % n, y = (q - x) / n; return Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) <= DISH; };
    // The oil, as filmhold.mjs counts its bodies, and the water's regions.
    // A plate with no oil laid has no mix field at all (the old lay): no oil anywhere, then.
    const m = await lab.chemistry('mix'), n = m ? m.n : N, mix = m ? m.data : new Array(N * N * 4).fill(0);
    if (which !== 'before' && !m) throw new Error('the look laid oil but the solver has no mix field');
    const scale = N / n;  // the dye fields are the plate's grid; the mix field may be its own
    const oilAt = (q) => mix[q * 4] >= 0.5;
    const dyeAt = (q) => { const x = q % n, y = (q - x) / n; return (Math.floor(x * scale) + Math.floor(y * scale) * N) * 4; };
    const ang = (a, u) => Math.acos(Math.max(-1, Math.min(1, (a[0] * u[0] + a[1] * u[1] + a[2] * u[2]) / (Math.hypot(...a) * Math.hypot(...u) || 1))));
    /*
      Dyed: of the dish's water (everywhere the oil is not), the share that
      is the water's dye, standing on the lamp (alpha WET up, its colour
      nearer the water's dye than any oil's). The oil's own colour does not
      count: a dish of oil cells on black glass is not a dish of water. The
      old lay has no water's dye to be near: any dye at all counts for it.
    */
    let water = 0, dyed = 0;
    const aw = abOf(0), ao = dyes.slice(1).map((_, i) => abOf(i + 1));
    for (let q = 0; q < n * n; q++) {
      if (!inDish(q, n) || oilAt(q)) continue;
      water++;
      const k = dyeAt(q);
      if (f[k + 3] < WET) continue;
      const c = [f[k], f[k + 1], f[k + 2]];
      if (which === 'before' || ao.every((a) => ang(c, aw) < ang(c, a))) dyed++;
    }
    const fill = (start, inside, seen, visit) => {
      const st = [start]; seen[start] = 1;
      let size = 0, edge = false;
      while (st.length) {
        const v = st.pop(), x = v % n, y = (v - x) / n;
        size++; visit?.(v);
        if (!inDish(v, n)) edge = true;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n) { edge = true; continue; }
          const r = xx + yy * n;
          if (!seen[r] && inside(r)) { seen[r] = 1; st.push(r); }
        }
      }
      return { size, edge };
    };
    const seen = new Uint8Array(n * n);
    const cells = [];
    const od = which === 'before' ? null : await lab.field('oilDye');
    let carried = 0;
    for (let q = 0; q < n * n; q++) {
      if (seen[q] || !oilAt(q)) continue;
      const sum = [0, 0, 0]; let dye = 0;
      const { size } = fill(q, oilAt, seen, (v) => {
        if (!od) return;
        const k = dyeAt(v);
        for (let ch = 0; ch < 3; ch++) sum[ch] += od[k + ch];
        dye += od[k + 3];
      });
      carried += dye * scale * scale;  // the oil's own colour inside the oil, and nowhere else
      if (size >= SPECK) cells.push({ size, dir: sum, dye });
    }
    /*
      Held drops: the dish's own water is its biggest region of water; any
      other inside the dish, a few cells up, is water the oil has closed
      round. A drop counts as held only where it was laid: a region that
      covers a laid drop's centre, or lies within its radius of it. Pockets
      that open where cells merged are water closed in by oil too, and are
      not drops of the water the look laid.
    */
    const wseen = new Uint8Array(n * n), pockets = [];
    for (let q = 0; q < n * n; q++) {
      if (wseen[q] || oilAt(q) || !inDish(q, n)) continue;
      const at = [];
      const w = fill(q, (r) => !oilAt(r), wseen, (v) => at.push(v));
      pockets.push({ ...w, at });
    }
    pockets.sort((p, q) => q.size - p.size);
    const drops = which === 'before' ? [] : lay.mixes.filter((d) => d.oil < 0);
    const inner = pockets.slice(1).filter((w) => !w.edge && w.size >= DROP);
    const held = drops.filter((d) => inner.some((w) => w.at.some((v) => {
      const x = v % n, y = (v - x) / n;
      return Math.hypot((x + 0.5) / n - d.x, (y + 0.5) / n - d.y) <= d.r;
    }))).length;
    const laidCells = which === 'before' ? 0 : lay.mixes.filter((d) => d.oil > 0).length;
    const diam = cells.map((c) => 2 * Math.sqrt(c.size / Math.PI) / (2 * DISH * n)).sort((p, q) => p - q);
    /*
      Colours: each cell is named by the laid oil dye its colour is nearest
      (absorbance direction), and only when it is plainly that one, twice as
      near it as the next. Grouping cells by how far apart their colours are
      cannot work here: orange, amber and yellow all absorb blue almost alone,
      and are 0.06 radians apart in absorbance though a wall shows them as
      three colours (each passes a different share of the green). A cell that
      ran into a neighbour of another colour is named by neither. Warm: a dye
      that absorbs blue the most (it passes red and green, so it reads orange
      to yellow on the lamp).
    */
    const named = new Set();
    let warm = 0, oilDye = 0;
    for (const c of cells) {
      if (c.dye <= 0 || Math.hypot(...c.dir) < 1e-6) continue;
      oilDye += c.dye;
      const by = ao.map((a, i) => ({ i: i + 1, a: ang(c.dir, a) })).sort((p, q) => p.a - q.a);
      if (by.length > 1 && by[0].a * 2 > by[1].a) continue;
      named.add(by[0].i);
      const a = abOf(by[0].i);
      if (a[2] >= a[1] && a[2] >= a[0]) warm += c.dye;
    }
    let png = null;
    if (DUMP) {
      const px = await lab.render(512, s, { zoom: 1 });
      const c = new OffscreenCanvas(512, 512);
      c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), 512, 512), 0, 0);
      const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
      let t = ''; for (const x of buf) t += String.fromCharCode(x); png = btoa(t);
    }
    return {
      dyed: water ? dyed / water : 0, cells: cells.length, laidCells, held, laidDrops: drops.length, colours: named.size,
      median: diam.length ? diam[diam.length >> 1] : 0, smallest: diam[0] ?? 0, biggest: diam[diam.length - 1] ?? 0,
      warm: oilDye > 0 ? warm / oilDye : 0, carried: laidInOil > 0 ? carried / laidInOil : 0, png,
    };
  }, { which, lay, off, abs, N, STEPS, DISH, SPECK, DROP, WET, OLD, DUMP: !!DUMP });

  const pc = (v) => `${(v * 100).toFixed(1)}%`;
  const fmt = (r) => `dyed ${pc(r.dyed)}, ${r.cells} cells of ${r.laidCells} laid (median ${pc(r.median)}, ${pc(r.smallest)}–${pc(r.biggest)} of the dish), `
    + `${r.held} of ${r.laidDrops} drops held, ${r.colours} oil colours, warm ${pc(r.warm)}, carried ${pc(r.carried)}`;
  const lays = SEEDS.map(appLay);
  const abs = (await page.evaluate(() => lab.look('classic').dyes)).map((c) => Array.from(app.dyeAbsorbances(c.r, c.g, c.b)));
  const nows = [];
  for (let i = 0; i < SEEDS.length; i++) nows.push(await run('now', lays[i]));
  const before = await run('before', null);
  /*
    The control: the first dish again with the look's oil physics off (Film
    Hold and Oil Bodies 0). Its cells run together and its colour leaves the
    oil, so it must fail the lines that ask for what those two do. A line
    this plate passes is a line that reads the lay, not the liquid.
  */
  const bare = await run('bare', lays[0], { filmHold: 0, oilBodies: 0 });
  nows.forEach((r, i) => console.log(`  now, seed ${SEEDS[i]}: ${fmt(r)}`));
  console.log(`  before: ${fmt(before)}\n  bare (no Film Hold, no Oil Bodies): ${fmt(bare)}`);
  if (DUMP) for (const [name, r] of [['now', nows[0]], ['before', before], ['bare', bare]]) writeFileSync(`${DUMP}/classicdish-${name}.png`, Buffer.from(r.png, 'base64'));

  const kept = (r) => r.laidCells > 0 && r.cells >= KEPT * r.laidCells && r.cells <= CELLS_MAX;
  const heldOk = (r) => r.laidDrops > 0 && r.held >= HELD * r.laidDrops;
  const all = (p) => nows.every(p);
  const each = (g) => nows.map(g).join('; ');
  check('the dish is full of the water\'s dye, where the old lay left black glass', all((r) => r.dyed >= DYED && r.dyed > before.dyed),
    `${each((r) => pc(r.dyed))} of the water against ${pc(before.dyed)}`);
  check(`at least ${pc(KEPT)} of the cells laid are still apart after five seconds`, all(kept),
    `${each((r) => `${r.cells} of ${r.laidCells}`)} (the old lay: ${before.cells})`);
  check('of many sizes, the median 5–15% of the dish across', all((r) => r.median >= 0.05 && r.median <= 0.15 && r.biggest >= 3 * r.smallest),
    each((r) => `median ${pc(r.median)}, ${pc(r.smallest)} to ${pc(r.biggest)}`));
  check(`at least ${pc(HELD)} of the drops of water laid in cells are still held there`, all(heldOk),
    `${each((r) => `${r.held} of ${r.laidDrops}`)}`);
  check(`the oil in at least three colours, at least ${pc(WARM)} of it warm`, all((r) => r.colours >= 3 && r.warm >= WARM),
    each((r) => `${r.colours} colours, warm ${pc(r.warm)}`));
  check(`and the oil holds at least ${pc(CARRIED)} of the colour laid in it as its own, inside the oil`, all((r) => r.carried >= CARRIED),
    each((r) => pc(r.carried)));
  check('the lines read the liquid: with Film Hold and Oil Bodies off the same dish fails them', !kept(bare) && bare.carried < CARRIED,
    `${bare.cells} of ${bare.laidCells} cells apart, ${pc(bare.carried)} carried`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
