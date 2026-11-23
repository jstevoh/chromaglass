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
 *   2. the cells stay apart: of the oil bodies laid (discs that overlap
 *      count as one body, since the poured lay joins a pour's touching
 *      drops, PLAN 38w-22), at least KEPT are still cells (4-connected
 *      regions of the oil over a half, SPECK cells up) after five seconds,
 *      at least CELLS_MIN of them (complexity: the round-three lay packed
 *      75) and no more than CELLS_MAX
 *   2b. the oil lies unevenly, poured, not packed: the oil's cover of 6 by 4
 *      boxes of the frame varies by at least SPREAD of its mean (the owner,
 *      2026-11-22: "too symmetric"; PLAN 38w-22)
 *   3. of many sizes: the median cell's diameter between 5% and 15% of the
 *      frame's height (FRAME: the wall shows the middle of the plate,
 *      uvToFluid), the biggest at least three times the smallest's and no
 *      more than BIGGEST_MAX of the frame.
 *      Until PLAN 38w-8 this was 5–15% of the dish. It moved because the
 *      owner judged the dish-sized cells short of the references' detail
 *      ("complexity and clarity", 2026-11-21), and on the like-for-like
 *      measure the app's forms were still the bigger: the watch tool's form
 *      scale (a correlation length, as a share of the width, not a diameter)
 *      read 9.0% on the round-two film against 5.1% on the stills. This bar
 *      is a diameter, so it is a proxy for that; PLAN 38w-11 replaces it
 *      with the watch tool's own measure run on the lab's render
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
 *   7. the rims are crisp (Crisp Edges): drawn on a RIM_PX wall, the median
 *      10-90 rise across a rim is at most RIM_SHARP pixels at the look's
 *      Crisp Edges and at least RIM_SOFT with it off
 *   8. and no dark halo rings the cells: the water 2-8 px outside a rim is at
 *      least HALO as bright as the open water 16 px or more from any oil, in
 *      the same picture, where the old Edge Relief 0.6 was not
 *   9. and the lines read the liquid, not the lay: the bare dish (the same
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

/*
  The plate is stepped at 384², the solver's grid, with the CPU's own 192²
  beside it. Since PLAN 38w-8 the app lays Classic's dye at the solver's
  grid (FluidInputs.layDye), and only there: a lay that fell back to the
  192² and its bilinear is the softer dish the owner judged short of the
  references ("complexity and clarity", 2026-11-21), and the line "laid at
  the solver's grid" fails it. The app's solver is 768² on the Mac; 384² is
  the finest the lab steps in a CI minute, and the lay's floors are the
  solver's cells (classicFloors), so this is the app's dish one grid coarser.
*/
const N = Number(process.env.CLASSICDISH_N) || 384;
const GRID = 192;
const STEPS = 300;
const SEEDS = [1, 2];  // two dishes the app could lay: a look that only works on one seed is not the look
const DISH = 0.45;     // the dish's radius in plate units, as clockglass.mjs measures it
const SPECK = 6;       // cells, for a region of oil to be a cell (filmhold.mjs)
const DROP = 3;        // cells, for a region of water inside oil to be a drop
const DYED = 0.85, WET = 0.3;
const WALL = 10 / 16;  // the wall's height over its width: the film's 1280x800
// The frame's height on the wall, as a share of the dish's diameter: uvToFluid
// (plate.ts) shows H / (1.5·max(W, H)) of the plate high, 0.42 at 16:10.
const FRAME = WALL / 1.5 / (2 * DISH);
const KEPT = 0.9;      // of the cells laid, still apart after five seconds
const CELLS_MAX = 300;  // the lay draws 900 (CLASSIC_DROPS) and keeps what fits: about 140 bodies of about 210 discs at 384² since the pours (38w-22); more than that cannot be the lay
/*
  Complexity, the owner's first word (2026-11-21). The two stills the owner
  pointed at (refsheet.jpg's first two, Liquid Loops 1969) each hold eighty
  to a hundred round forms, most of them a few percent of the frame across
  and the biggest about a fifth of it. The round-three lay packed 75 and 74
  cells into the whole dish, the biggest 44% of the frame's height, so the
  frame held thirty-odd forms dominated by four or five. The bar asks for
  more cells than that lay could pack, and no cell big enough to fill a
  quarter of the frame's height.
*/
const CELLS_MIN = 120;
const BIGGEST_MAX = 0.25;
const RIM_PX = 1024;   // the rim check's render: a 1280-pixel wall shows about this much of the plate
const RIM_SHARP = 1.5;  // px, the rim's median 10-90 rise with Crisp Edges: one antialiased pixel
const RIM_SOFT = 4;     // px, and without it: the solver's band, 8 px when measured
const RIM_RISES = 500;  // crossings to take a median of (2173 off, 2330 on when measured, seed 1)
const RIM_GATE = 3;     // px either side of a crossing where the oil fraction must cross one half for it to be a rim
/*
  Where a render pixel sits on the plate: the plate shader's uvToFluid at
  camZoom 1, no turn and the centre at the middle, p = 0.5 + (uv - 0.5) / 1.5,
  with the render's rows running down where the plate's v runs up. A first
  version read the oil one to one (pixel x/n is plate x/n) and found as many
  rims with the oil read upside down as right way up, 245 against 216: it
  was reading the oil a third of the frame away, at chance. With this map it
  reads the oil under the pixel.
*/
const RIM_VIEW = 1.5;
const RIM_AA = 0.3;     // the share of the on arm's rim rises with a pixel between 10% and 90%: antialiased, not a staircase
const RIM_KEEP = 0.9;   // the on arm keeps at least this much of the off arm's share of rims (not dropped from the median)
const RIM_SPAN = 60;    // levels of green between the 10th and 90th percentiles
/*
  The water's light beside a cell, against the open water's in the same
  picture. Measured on Metal, seeds 1 and 2: 94.9% and 94.6% at Classic's
  Edge Relief 0, 86.2% and 87.8% drawn at the old 0.6. The bar sits between,
  nearer the clean dish. The 5% the ring is darker at Edge Relief 0 is not a
  drawn halo (nothing at 0 shades by slope); it has not been traced yet, and
  is noted in 38w-25 with the meniscus that will change it anyway.
*/
const HALO = 0.92;
const HALO_OLD = 0.6;   // the Edge Relief Classic had before 38w-23, whose halo the instrument must see
/*
  The spread of the oil's cover over the frame's boxes (PLAN 38w-22). The bar
  was chosen on the laid discs, before any step: the round-three packing read
  5 to 9% on three seeds, the poured lay 30 to 43%. The line reads the plate
  after five seconds, where the poured lay read 24.9% and 24.2% on the two
  seeds, so its margin there is about 6 points, not the 12 the discs gave.
  A packed lay has not been measured on the plate after five seconds; the
  stepping smooths the cover, so it reads at or under its 5 to 9% laid.
*/
const SPREAD = 0.18;
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
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation.ts'; export { dyeAbsorbances } from './src/lib/dye.ts'; export { setShowSeed } from './src/lib/rng.ts'; export { stirOf } from './src/lib/stir.ts';", resolveDir: root, loader: 'ts' },
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
  const sim = new app.FluidSimulation(GRID, 0, 0, 0.1);
  const mixes = [];
  let water = null, oil = null, shares = 0, onCpu = 0;
  // The solver's side of the lay: the oil (addMix), and the dye at its own grid (layDye), added whole (layShare 1).
  sim.gpu = new Proxy({
    N,
    addMix: (x, y, r, o) => { mixes.push({ x, y, r, oil: o.oil }); },
    layDye: (dye, o) => {
      // As the real one (FluidInputs.layDye) does: a lay at any other size is refused, and falls back.
      if (dye.length !== N * N * 4 || o.length !== N * N * 4) return false;
      oil = Array.from(o);
      water = Array.from(dye, (v, i) => v - oil[i]);
      return true;
    },
    layShare: (k) => { shares += k; },
  }, { get: (t, k) => t[k] });
  // Anything the look still lays on the CPU's grid, which for Classic should be nothing.
  sim.addDensity = (x, y, d) => { onCpu += d; };
  sim.addOilDensity = (x, y, d) => { onCpu += d; };
  sim.seedPreset('classic', () => 0);
  if (!water) throw new Error('Classic did not lay its dye at the solver\'s grid (layDye): the lay fell back to the CPU\'s 192²');
  return { mixes, water, oil, shares, onCpu };
};

/*
  The lay owed to the solver (PLAN 38w-21). The app seeds its opening look
  before the GPU device is up, so Classic is laid first on the CPU's grid with
  no solver, and laid again on the solver at the attach; appLay above lays on
  a solver it already has, so it never sees that path. Here the plate is
  seeded with no solver, then handed a stand-in at attachGpu, which must take
  Classic's CPU dye back out and lay its oil (addMix) there. And a Go before
  the attach supersedes it: the next look laid through captureSeed, as the
  handoff lays it, leaves nothing owed, so the attach lays no Classic oil
  into the new look's glide (found in review: the owed lay survived it).
*/
const owedAttach = (go) => {
  app.setShowSeed(1);
  const sim = new app.FluidSimulation(GRID, 0, 0, 0.1);
  const mass = () => sim.dye().reduce((t, a) => { for (let i = 0; i < a.length; i++) t += a[i]; return t; }, 0);
  sim.seedPreset('classic', () => 0);
  const laid = mass();
  if (go) sim.captureSeed(() => { sim.seedPreset(go, () => 0); });
  let mixes = 0;
  const stub = { N, addMix: () => { mixes++; }, layDye: (dye, o) => dye.length === N * N * 4 && o.length === N * N * 4, layShare: () => {}, clear: () => {} };
  // Anything else the attach asks of a solver is a no-op here: only the lay is under test.
  sim.attachGpu(new Proxy(stub, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k !== 'then' && k !== 'takeOver' ? () => undefined : undefined) }));
  return { laid, left: mass(), mixes };
};
const owed = owedAttach(null), superseded = owedAttach('comet');
console.log(`owed: CPU dye ${owed.laid.toFixed(0)} laid, ${owed.left.toFixed(0)} left after attach, ${owed.mixes} oil drops on the solver; after a Go to comet ${superseded.mixes}`);

// CLASSICDISH_DUMP=<dir> writes each plate there as a PNG, to look at.
const DUMP = process.env.CLASSICDISH_DUMP;
const { page, close } = await openLab();
try {
  /*
    The look's stirring, as the app stirs it. The lab steps with no curl noise
    unless it is asked for, and the first version of this check never asked:
    it passed on round cells while the app, stirring at the look's Turbulence
    of 0.5 (stirOf 0.69), tore them to ribbons inside a second (filmed
    2026-11-21, no sound, seed 1). The dial is read from the look the lab
    reads, and turned into a speed by the app's own stirOf, so a Classic that
    stirs again fails here, not on the wall: put back at 0.5 it fails five
    of the seven lines (19 of 26 cells apart, 0 of 8 drops held).
  */
  const [dial, detail] = await page.evaluate(() => { const s = lab.look('classic').settings; return [s.turbulenceScale ?? 0, s.turbulenceDetail ?? 3]; });
  const TURB = { turbScale: app.stirOf(dial), turbDetail: Math.max(1, Math.min(4, Math.round(detail))) };
  console.log(`classic stirs at ${TURB.turbScale.toFixed(3)} (dial ${dial}, detail ${TURB.turbDetail})`);
  const run = (which, lay, off = {}) => page.evaluate(async ({ which, lay, off, abs, N, STEPS, DISH, SPECK, DROP, WET, OLD, DUMP, TURB, WALL, RIM_VIEW }) => {
    await lab.create(N, N);
    const { settings: s, dyes: now } = lab.look('classic');
    const dyes = which === 'before' ? OLD : now;
    // The look's own liquid, read from the look: a look that lost its oil would fail here.
    const over = which === 'before'
      ? { thinGap: 1, advection: 0.35, platePressure: 0.25, oilTension: 0, oilBodies: 0, filmHold: 0 }
      : { thinGap: 1, advection: s.advection, plateCurve: s.plateCurve, depthDrag: s.depthDrag, platePressure: s.platePressure,
        oilTension: s.oilTension, oilBodies: s.oilBodies, filmHold: s.filmHold, diff: s.diffusionRate, ...TURB, ...off };
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
    /*
      The cells laid are the bodies of oil the lay leaves, not its discs:
      since PLAN 38w-22 drops of one pour that land touching run into one
      body (classicDiscs), laid as overlapping discs, and the solver sees one
      cell. Counting discs would ask the plate to keep apart drops that the
      lay itself joined. Discs of different pours never touch (the film gap).
    */
    const oilDiscs = which === 'before' ? [] : lay.mixes.filter((d) => d.oil > 0);
    const root = oilDiscs.map((_, i) => i);
    const find = (i) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
    for (let i = 0; i < oilDiscs.length; i++) for (let j = 0; j < i; j++) {
      const a = oilDiscs[i], b = oilDiscs[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) root[find(i)] = find(j);
    }
    const laidCells = oilDiscs.filter((_, i) => find(i) === i).length;
    /*
      Irregularity (PLAN 38w-22): the owner judged round three "too
      symmetric". Its lay packed the dish to saturation, so every part of the
      wall held the same share of oil. A poured dish does not: the oil lies
      in trails and clumps along the hand's path, with open water between.
      This reads the share of each of 6 by 4 boxes of the frame the oil
      covers after five seconds, and their spread (standard deviation over
      the mean). Clark-Evans' nearest-neighbour ratio was tried first and
      read "regular" on lays that plainly clump, since drops in a clump are
      still kept a film apart; the cover of a box sees the clump and the gap.
    */
    const FX = 0.5 / RIM_VIEW, FY = WALL / 2 / RIM_VIEW, BX = 6, BY = 4, boxes = [];
    for (let j = 0; j < BY; j++) for (let i = 0; i < BX; i++) {
      let c = 0, k = 0;
      for (let y = Math.floor((0.5 - FY + (2 * FY * j) / BY) * n); y < (0.5 - FY + (2 * FY * (j + 1)) / BY) * n; y++)
        for (let x = Math.floor((0.5 - FX + (2 * FX * i) / BX) * n); x < (0.5 - FX + (2 * FX * (i + 1)) / BX) * n; x++) { c += oilAt(x + y * n) ? 1 : 0; k++; }
      boxes.push(c / k);
    }
    const coverMean = boxes.reduce((p, q) => p + q, 0) / boxes.length;
    const spread = coverMean > 0 ? Math.sqrt(boxes.reduce((p, q) => p + (q - coverMean) ** 2, 0) / (boxes.length - 1)) / coverMean : 0;
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
      warm: oilDye > 0 ? warm / oilDye : 0, carried: laidInOil > 0 ? carried / laidInOil : 0, png, cover: coverMean, spread,
    };
  }, { which, lay, off, abs, N, STEPS, DISH, SPECK, DROP, WET, OLD, DUMP: !!DUMP, TURB, WALL, RIM_VIEW });

  const pc = (v) => `${(v * 100).toFixed(1)}%`;
  const fmt = (r) => `dyed ${pc(r.dyed)}, ${r.cells} cells of ${r.laidCells} laid (median ${pc(r.median)}, ${pc(r.smallest)}–${pc(r.biggest)} of the dish), `
    + `${r.held} of ${r.laidDrops} drops held, ${r.colours} oil colours, warm ${pc(r.warm)}, carried ${pc(r.carried)}`;
  const lays = SEEDS.map(appLay);
  const abs = (await page.evaluate(() => lab.look('classic').dyes)).map((c) => Array.from(app.dyeAbsorbances(c.r, c.g, c.b)));
  /*
    Clarity, the owner's second word: the rims between the water and the oil
    cells crisp, not a smear (Crisp Edges, plateInterface.ts, PLAN 38w-15).
    After each seed's dish is stepped, it is drawn at RIM_PX, the size a wall
    shows it at, at the look's own Crisp Edges and with it off, both with
    Edge Relief 0 so the width read is the step between the two liquids'
    colours and not the meniscus line drawn over it. Every second row is
    walked for the places the green channel (normalised to its 10th and 90th
    percentiles, which every dye here changes) crosses its middle, and each
    crossing's rise is the run of pixels strictly between 10% and 90% about it.

    Only a rim counts: a crossing is a rim when the oil fraction (the
    solver's own mix field, read at the crossing's plate point) is on
    opposite sides of one half RIM_GATE pixels either side of it. The soft
    dye inside the cells (38w-16), the mottle in the water and the like are
    crossings too, printed as "other", and would pad the off arm's width if
    they counted. The same gate read with the rows upside down must find
    far fewer rims, or it is not reading where the oil is. A rim whose walk
    does not reach 10% and 90% within 40 pixels (a low-contrast pair, a
    grazing row) is dropped, and the drops are counted: the on arm must keep
    at least RIM_KEEP of the off arm's share, so a halo or an overshoot that
    never reaches 90% cannot leave the median by dropping out of it. A
    median of 0 is a hard step with no antialiasing, a staircase, so at
    least RIM_AA of the on arm's rises must have a pixel between. And the
    plate's green must span RIM_SPAN levels, so a flat frame's one-level
    noise is not read as rims.

    No halo (38w-23). This line used to ask that Edge Relief's meniscus
    survive Crisp Edges. But Edge Relief reads the slope of the dye, not
    the oil's edge (shortcut notes 1, 6 and 7 in wgsl/plate.ts), and in the
    owner's round four it was what drew a wide dark ring, squared to the
    grid, round every dye-heavy warm cell: the lattice the owner called too
    symmetric, and the soft red rims of round three. Classic now has it at
    0, and the claim is the one the owner can see: the water just outside
    each cell is as bright as the water is. The ring is the water pixels
    (oil fraction under one half) with oil within 8 px but none within 2,
    on the solver's own mix field as above; the open water is the water
    pixels with no oil within 16 px. In the look's own picture the ring's
    mean light (Rec. 709 luminance) must be at least HALO of the open
    water's. The first version divided by the same ring drawn at Edge
    Relief 0, which with Classic at 0 was the same draw: it read 1.000
    whatever the picture held, and a dark ring from anything but Edge
    Relief (the meniscus 38w-25 will draw included) sat in both and never
    showed (found in review). Against the open water any darkening at the
    rims counts, whatever draws it. And the instrument must see a halo when
    there is one: drawn with the old HALO_OLD the same ratio must fall under
    HALO, or the ring is not where the halo was and the line proves nothing.
  */
  await page.evaluate(({ RIM_PX, RIM_GATE, RIM_VIEW, HALO_OLD }) => {
    window.rimMeasure = async () => {
      const s = lab.look('classic').settings, n = RIM_PX, ce = s.crispEdges ?? 0;
      const m = await lab.chemistry('mix');
      if (!m) return null;
      const fn = m.n, M = m.data;
      const at = (i, j) => M[(Math.min(fn - 1, Math.max(0, j)) * fn + Math.min(fn - 1, Math.max(0, i))) * 4];
      const oil = (u, v) => {
        const x = u * fn - 0.5, y = v * fn - 0.5, i = Math.floor(x), j = Math.floor(y), a = x - i, b = y - j;
        return (at(i, j) * (1 - a) + at(i + 1, j) * a) * (1 - b) + (at(i, j + 1) * (1 - a) + at(i + 1, j + 1) * a) * b;
      };
      const draw = (c, relief) => lab.render(n, { ...s, crispEdges: c, edgeRelief: relief }, { zoom: 1, macroAmount: 0 });
      const green = (px) => { const G = new Float32Array(n * n); for (let q = 0; q < n * n; q++) G[q] = px[q * 4 + 1]; return G; };
      const stats = (ws) => {
        ws.sort((p, q) => p - q);
        return { rises: ws.length, p25: ws[ws.length >> 2] ?? 0, median: ws[ws.length >> 1] ?? 0, p75: ws[(ws.length * 3) >> 2] ?? 0, aa: ws.length ? ws.filter((w) => w >= 1).length / ws.length : 0 };
      };
      const widths = (G, flip) => {
        const so = Array.from(G).sort((p, q) => p - q), lo = so[Math.floor(so.length * 0.1)], hi = so[Math.floor(so.length * 0.9)];
        const g = (q) => (G[q] - lo) / Math.max(1, hi - lo);
        const rim = [], other = []; let dropped = 0;
        for (let y = 2; y < n - 2; y += 2) {
          const r = y * n, v = 0.5 + (flip ? 1 : -1) * ((y + 0.5) / n - 0.5) / RIM_VIEW, pu = (x) => 0.5 + (x / n - 0.5) / RIM_VIEW;
          for (let x = 2; x < n - 3; x++) {
            const a = g(r + x), b = g(r + x + 1);
            if ((a - 0.5) * (b - 0.5) >= 0 || Math.abs(a - b) < 0.02) continue;
            const isRim = (oil(pu(x + 1 - RIM_GATE), v) - 0.5) * (oil(pu(x + 1 + RIM_GATE), v) - 0.5) < 0;
            const up = b > a; let i = x, j = x + 1;
            while (i > 0 && (up ? g(r + i) > 0.1 : g(r + i) < 0.9) && x - i < 40) i--;
            while (j < n - 1 && (up ? g(r + j) < 0.9 : g(r + j) > 0.1) && j - x < 40) j++;
            if (x - i < 40 && j - x < 40) (isRim ? rim : other).push(j - i - 1);
            else if (isRim) dropped++;
          }
        }
        const st = stats(rim);
        return { span: hi - lo, ...st, kept: st.rises / Math.max(1, st.rises + dropped), dropped, other: stats(other) };
      };
      const onG = green(await draw(ce, 0)), offG = green(await draw(0, 0));
      // The ring: water pixels with oil within 8 px but none within 2, by a
      // square max filter over the oil mask at the picture's own size.
      const O = new Uint8Array(n * n);
      for (let y = 0; y < n; y++) {
        const v = 0.5 - ((y + 0.5) / n - 0.5) / RIM_VIEW;
        for (let x = 0; x < n; x++) O[y * n + x] = oil(0.5 + ((x + 0.5) / n - 0.5) / RIM_VIEW, v) >= 0.5 ? 1 : 0;
      }
      const near = (r) => {
        const h = new Uint8Array(n * n), out = new Uint8Array(n * n);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(n - 1, x + r) && !m; k++) m = O[y * n + k]; h[y * n + x] = m; }
        for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) { let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(n - 1, y + r) && !m; k++) m = h[k * n + x]; out[y * n + x] = m; }
        return out;
      };
      const in8 = near(8), in2 = near(2), in16 = near(16), ring = [], open = [];
      for (let q = 0; q < n * n; q++) {
        if (!O[q] && in8[q] && !in2[q]) ring.push(q);
        if (!in16[q]) open.push(q);
      }
      const light = async (relief) => {
        const px = await draw(ce, relief);
        const mean = (qs) => { let t = 0; for (const q of qs) t += 0.2126 * px[q * 4] + 0.7152 * px[q * 4 + 1] + 0.0722 * px[q * 4 + 2]; return t / Math.max(1, qs.length); };
        const r = mean(ring), w = mean(open);
        return { water: w, ratio: r / Math.max(1e-6, w) };
      };
      const look = await light(s.edgeRelief ?? 0), old = await light(HALO_OLD);
      return {
        ce, edgeRelief: s.edgeRelief ?? 0, on: widths(onG, false), off: widths(offG, false),
        offFlipped: widths(offG, true).rises,
        ring: ring.length, open: open.length, bare: look.water, look: look.ratio, old: old.ratio,
      };
    };
  }, { RIM_PX, RIM_GATE, RIM_VIEW, HALO_OLD });
  const nows = [], rims = [];
  for (let i = 0; i < SEEDS.length; i++) { nows.push(await run('now', lays[i])); rims.push(await page.evaluate(() => window.rimMeasure())); }
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
  const complex = (r) => kept(r) && r.cells >= CELLS_MIN;
  const heldOk = (r) => r.laidDrops > 0 && r.held >= HELD * r.laidDrops;
  const all = (p) => nows.every(p);
  const each = (g) => nows.map(g).join('; ');
  check(`a Classic seeded before the solver is up is laid on it at the attach: its CPU dye taken back and its oil laid, and none after a Go before the attach (PLAN 38w-21)`,
    owed.laid > 0 && owed.left < owed.laid * 0.01 && owed.mixes >= CELLS_MIN && superseded.mixes === 0,
    `${owed.laid.toFixed(0)} of dye laid on the CPU, ${owed.left.toFixed(0)} left after the attach, ${owed.mixes} drops of oil laid; ${superseded.mixes} after a Go to comet`);
  check(`the dye is laid at the solver's ${N}² and none on the CPU's ${GRID}² (PLAN 38w-8)`, lays.every((l) => l.shares === 1 && l.onCpu === 0),
    lays.map((l) => `${l.shares} share, ${l.onCpu.toFixed(1)} on the CPU`).join('; '));
  check('the dish is full of the water\'s dye, where the old lay left black glass', all((r) => r.dyed >= DYED && r.dyed > before.dyed),
    `${each((r) => pc(r.dyed))} of the water against ${pc(before.dyed)}`);
  check(`at least ${pc(KEPT)} of the cells laid are still apart after five seconds, and at least ${CELLS_MIN} of them`, all(complex),
    `${each((r) => `${r.cells} of ${r.laidCells}`)} (the old lay: ${before.cells})`);
  check(`the oil lies unevenly, poured, not packed: the oil's cover of 6 by 4 boxes of the frame varies by at least ${pc(SPREAD)} of its mean (PLAN 38w-22)`, all((r) => r.spread >= SPREAD),
    each((r) => `${pc(r.spread)} of a mean cover of ${pc(r.cover)}`));
  check(`of many sizes, the median 5–15% of the frame's height across and none over ${pc(BIGGEST_MAX)}`, all((r) => r.median / FRAME >= 0.05 && r.median / FRAME <= 0.15 && r.biggest >= 3 * r.smallest && r.biggest / FRAME <= BIGGEST_MAX),
    each((r) => `median ${pc(r.median / FRAME)} of the frame, ${pc(r.smallest / FRAME)} to ${pc(r.biggest / FRAME)}`));
  check(`at least ${pc(HELD)} of the drops of water laid in cells are still held there`, all(heldOk),
    `${each((r) => `${r.held} of ${r.laidDrops}`)}`);
  check(`the oil in at least three colours, at least ${pc(WARM)} of it warm`, all((r) => r.colours >= 3 && r.warm >= WARM),
    each((r) => `${r.colours} colours, warm ${pc(r.warm)}`));
  check(`and the oil holds at least ${pc(CARRIED)} of the colour laid in it as its own, inside the oil`, all((r) => r.carried >= CARRIED),
    each((r) => pc(r.carried)));
  const rimFmt = (r) => `median ${r.median} px (p25 ${r.p25}, p75 ${r.p75}, ${pc(r.aa)} antialiased, ${r.rises} rims, ${pc(r.kept)} kept, span ${r.span}; other edges median ${r.other.median} of ${r.other.rises})`;
  const rimOk = (r) => r && r.ce > 0 && r.on.span >= RIM_SPAN && r.off.span >= RIM_SPAN && r.on.rises >= RIM_RISES && r.off.rises >= RIM_RISES
    && r.on.median <= RIM_SHARP && r.on.aa >= RIM_AA && r.off.median >= RIM_SOFT && r.on.kept >= RIM_KEEP * r.off.kept && r.offFlipped < r.off.rises / 2;
  check(`the rims are crisp on a ${RIM_PX}-pixel wall: at the look's Crisp Edges the median rise across an oil rim is at most ${RIM_SHARP} px and antialiased, and at least ${RIM_SOFT} px with it off (PLAN 38w-15)`,
    rims.every(rimOk), rims.map((r, i) => r ? `seed ${SEEDS[i]}: Crisp Edges ${r.ce}: ${rimFmt(r.on)}; off: ${rimFmt(r.off)}; the gate upside down ${r.offFlipped} rims` : `seed ${SEEDS[i]}: no mix field`).join(' | '));
  check(`and no dark halo rings the cells: the water 2–8 px outside a rim is at least ${pc(HALO)} as bright as the open water, where the old Edge Relief ${HALO_OLD} was not (PLAN 38w-23)`,
    rims.every((r) => r && r.ring >= 10000 && r.open >= 10000 && r.bare > 8 && r.look >= HALO && r.old < HALO),
    rims.map((r, i) => r ? `seed ${SEEDS[i]}: ${pc(r.look)} at Edge Relief ${r.edgeRelief}, ${pc(r.old)} at ${HALO_OLD}, over ${r.ring} px of ring against ${r.open} px of open water at ${r.bare.toFixed(0)} levels` : 'none').join('; '));
  check('the lines read the liquid: with Film Hold and Oil Bodies off the same dish fails them', !kept(bare) && bare.carried < CARRIED,
    `${bare.cells} of ${bare.laidCells} cells apart, ${pc(bare.carried)} carried`);
} finally {
  await close();
}
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length}`);
process.exit(failed ? 1 : 0);
