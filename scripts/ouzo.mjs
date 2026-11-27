#!/usr/bin/env node
/**
 * The ouzo effect and its look (PLAN 48s-1, 48s-6; `npm run ouzo`, the lab,
 * a few minutes on SwiftShader).
 *
 * What it holds. The Ouzo bottle (src/bottles.ts) carries anise oil in
 * alcohol; the solver carries its ethanol and its oil in a field of their own
 * (`solvent`: ethanol, oil dissolved, oil as droplets) and once a step puts
 * each cell on the measured binodal (`ouzoCloud`, src/gpu/wgsl/fluid/ouzo.ts):
 * the oil the cell's water and alcohol cannot hold is droplets, the rest is
 * dissolved, and the two always sum to the oil carried there. The plate is
 * handed the droplets' scattering on milk's channel (`ouzoView`). The PR that
 * built it (#1007) measured all of this with scratch scripts; this is those
 * measurements made a check, on the real solver at 128², Louche's own step
 * (the app's deriveStep for the look, read on node from
 * sim/fluidSimulation.ts):
 *
 *  1. A laid layer of Ouzo, then water poured into it: every cell's droplets
 *     are `ouzoDrops` of its own ethanol, oil and gap (lib/ouzo.ts, the same
 *     curve written in TypeScript), to float precision, before and after the
 *     water; the cloud is not vacuous (hundreds of cells hold droplets) and
 *     the water made more of it.
 *  2. None where it cannot be: no droplets in a cell with no oil, and none
 *     in a cell still at the bottle's own strength (clear in the bottle).
 *  3. Nothing is made or lost: the dish's oil, dissolved and droplets
 *     together, is the same through the water's pours and an Alcohol pour,
 *     while none of it has reached the open rim.
 *  4. Alcohol poured on the cloud dissolves it: the droplets under the pour
 *     fall by at least a third, and the oil that stays there goes back into
 *     solution.
 *  5. The plate is handed the species with 209 × the droplets added in b
 *     (OUZO_SCATTER, milk's channel) and nothing else changed.
 *  6. A plate with milk and glycerine and no Ouzo makes no solvent field,
 *     and its plate is handed the species itself, float for float.
 *  7. Across a governor's move (`lab.regrid`, 192 → 128) the oil and the
 *     cloud come along as the species does (PLAN 18d-10); 8 is that line's
 *     control: without the hand-over the new solver holds no oil.
 *  9. Control for 1: a build whose curve holds half as much oil again (the
 *     measured cloud points' own scatter) fails it, its oil still kept.
 *     9b, control for 3: a build that makes 2% more droplets than the oil it
 *     had fails it. (A kernel making droplets out of nothing still agrees with
 *     ouzoDrops cell for cell, the oil it reads being the oil it made, so 1
 *     alone could not catch it, and 3 alone could not catch a wrong curve.)
 *
 * And the look's retune (PLAN 48s-6: the Mac's first film of Louche showed
 * dye over half the dish and the cloud late, a tenth of the frame, flat
 * white):
 * 10. Louche's seed colours at most a third of the dish the five pools every
 *     unseeded look opens on do (Night Sea's), with at most a quarter of
 *     their dye, at the app's own grid and lay.
 * 11. Half or more of Louche's drops are Ouzo.
 * 12. The white is translucent: on Louche's own render a drop of the
 *     automation's middle dose reads between TRANSLUCENT[0] and
 *     TRANSLUCENT[1] of 255 at its middle, against a black ground;
 *     13 is its control: the same drop at the old 3% reads over the top of
 *     that band (the band tells the two apart).
 */
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLab } from './lab.mjs';

const N = 128;
/** Float precision for a cell's droplets against ouzoDrops: the GPU's f32 against node's f64. */
const CELL_TOL = 1e-7;
/** The dish's oil through pours: float sums over 16k cells. */
const SUM_TOL = 2e-4;
/** A middle-dose drop's middle on Louche's render, of 255: dark enough to show what is under it, bright enough to be the picture. */
const TRANSLUCENT = [90, 185];
/** Dye a viewer sees as colour in the dark dish (density per cell; the pools' Gaussian tails are under it). */
const SEEN = 0.2;
/*
  A solvent this much ethanol holds 2.1% of its volume of the oil (ln s at
  f 0.6 on OUZO_BINODAL), twice what the bottle carries: a cell there is on
  the clear side whatever its share of the pour, as the bottle itself is.
  The bottle's own 75% is not reached on the plate (the pour's volume and the
  gap's spring dilute even its middle a little), so the line takes the cells
  past this instead.
*/
const NEAT = 0.6;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'ouzo', 'app.mjs');
mkdirSync(dirname(out), { recursive: true });
await build({
  stdin: {
    contents: [
      "export { FluidSimulation } from './src/sim/fluidSimulation.ts';",
      "export { PRESETS } from './src/presets.ts';",
      "export { DEFAULT_SETTINGS } from './src/types.ts';",
      "export { setShowSeed } from './src/lib/rng.ts';",
      "export { ouzoDrops, OUZO_SCATTER } from './src/lib/ouzo.ts';",
      "export { DISH_GAP_RANGE, DISH_REST_GAP } from './src/lib/turntable.ts';",
      "export { PRESET_LIQUIDS, AUTO_DOSE } from './src/presetPlate.ts';",
      "export { DEFAULT_LIQUID_TYPES } from './src/bottles.ts';",
      "export { GRID_SIZE } from './src/sim/constants.ts';",
    ].join('\n'),
    resolveDir: root, loader: 'ts',
  },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const app = await import(pathToFileURL(out).href);

/*
  Louche's step as the app makes it: the plate on node stepped a few seconds
  with nothing playing, then the step it asked the solver for, as rimdye.mjs
  reads Lava Pop's.
*/
const look = app.PRESETS.find((p) => p.id === 'louche');
if (!look) throw new Error('ouzo: no look louche');
const settings = { ...app.DEFAULT_SETTINGS, ...look.settings };
app.setShowSeed(1);
const P = (() => {
  const sim = new app.FluidSimulation(96, 0, 0, 0.1);
  let t = 0;
  for (let k = 0; k < 200; k++) { t += 1 / 60; sim.step(settings, t, () => 0); }
  const p = {};
  for (const [k, v] of Object.entries(sim.lastStep)) if (typeof v !== 'object' || Array.isArray(v)) p[k] = v;
  return p;
})();
if (P.thinGap !== 1) throw new Error(`ouzo: Louche's step is not a thin gap (thinGap ${P.thinGap})`);

/*
  10. The look's dye as the app lays it: seedPreset on the plate with no
  solver, the dye read from the plate's own arrays, for Louche and for Night
  Sea (an unseeded look's five pools, which Louche opened on before 48s-6).
*/
const dyed = (id) => {
  app.setShowSeed(1);
  const sim = new app.FluidSimulation(app.GRID_SIZE, 0, 0, 0.1);
  sim.seedPreset(id, () => 0);
  const S = sim.size, d = sim.density;
  let cells = 0, dish = 0, sum = 0;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    if (Math.hypot((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5) >= 0.5) continue;
    dish++;
    sum += d[i + j * S];
    if (d[i + j * S] > SEEN) cells++;
  }
  if (!(dish > 0)) throw new Error(`ouzo: ${id}'s plate has no dish`);
  return { cover: cells / dish, mean: sum / dish };
};
const loucheDye = dyed('louche'), poolsDye = dyed('night-sea');

const ouzoBottle = app.DEFAULT_LIQUID_TYPES.find((l) => l.id === 'ouzo');
const consts = {
  scatter: app.OUZO_SCATTER, range0: app.DISH_GAP_RANGE[0], rest: app.DISH_REST_GAP,
  r: Math.max(2, ouzoBottle.injectRadius) / 128, anise: ouzoBottle.behaviour.anise,
  // The automation's middle dose (LiquidVisualizer's Evolve: 0.25 + energy × 0.25, at energy 0.5).
  evolveTake: app.AUTO_DOSE * 0.375,
};

/** Each cell's droplets against ouzoDrops of its own ethanol, oil and gap. */
const agree = (solvent, gap) => {
  let worst = 0, cloudy = 0, oilFree = 0, oilFreeDrops = 0, neat = 0, neatDrops = 0, sum = 0, drops = 0, maxF = 0;
  for (let c = 0; c < N * N; c++) {
    const g = solvent[c * 4 + 1], b = solvent[c * 4 + 2], a = solvent[c * 4 + 3];
    const oil = b + a;
    sum += oil; drops += a;
    const tall = Math.max(gap[c], consts.range0) / consts.rest;
    worst = Math.max(worst, Math.abs(a - app.ouzoDrops(g, oil, tall)));
    if (a > 1e-7) cloudy++;
    if (oil <= 0) { oilFree++; if (a > 0) oilFreeDrops++; }
    // Near the bottle's own strength: alcohol enough (NEAT of the solvent) to hold all of the bottle's oil, so clear as it is in the bottle.
    else {
      const f = g / Math.max(tall - oil, 1e-6);
      maxF = Math.max(maxF, f);
      if (f >= NEAT) { neat++; if (a > 0) neatDrops++; }
    }
  }
  return { worst, cloudy, oilFree, oilFreeDrops, neat, neatDrops, sum, drops, maxF };
};

/** The laid layer, the water, the Alcohol, the plate's view: parts 1 to 5, on whatever build the page holds. */
const ouzoRun = (page) => page.evaluate(async ({ P, N, consts }) => {
  await lab.create(N, N);
  await lab.step(1, { ...P, dt: 1e-6 });
  const sv = lab.solver();
  const read = async () => ({ solvent: Array.from(await sv.readField('solvent')), gap: Array.from((await sv.readSqueeze()).gap) });
  /*
    A layer of Ouzo: one pool laid as though poured long ago (no volume, so
    its middle is the bottle itself, clear), and pours with their volume
    watered to every strength between at their edges.
  */
  lab.addSpecies(0.5, 0.5, 0.12, 1.0, 'ouzo', false);
  const pours = [[0.32, 0.36, 0.08, 0.6], [0.66, 0.34, 0.08, 0.35], [0.36, 0.66, 0.07, 0.2], [0.66, 0.66, 0.09, 0.8]];
  for (const [x, y, r, take] of pours) lab.addSpecies(x, y, r, take, 'ouzo', true);
  await lab.step(3, P);
  const laid = await read();
  // Water poured across the layer's edges.
  for (const [x, y] of [[0.42, 0.42], [0.58, 0.58], [0.6, 0.4], [0.4, 0.6], [0.5, 0.36]]) lab.addSpecies(x, y, 0.06, 0.5, 'water', true);
  await lab.step(20, P);
  const watered = await read();
  // Alcohol on the cloud's thickest place.
  let at = 0, most = -1;
  for (let c = 0; c < N * N; c++) {
    const i = c % N, j = Math.floor(c / N);
    if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) > 0.3) continue;
    if (watered.solvent[c * 4 + 3] > most) { most = watered.solvent[c * 4 + 3]; at = c; }
  }
  const ax = (at % N + 0.5) / N, ay = (Math.floor(at / N) + 0.5) / N;
  const inDisc = (s, k) => { let v = 0; for (let c = 0; c < N * N; c++) if (Math.hypot((c % N + 0.5) / N - ax, (Math.floor(c / N) + 0.5) / N - ay) < 0.03) v += s[c * 4 + k]; return v; };
  lab.addSpecies(ax, ay, 0.05, 0.45, 'alcohol', true);
  await lab.step(3, P);
  const alcohol = await read();
  const disc = {
    dropsBefore: inDisc(watered.solvent, 3), dropsAfter: inDisc(alcohol.solvent, 3),
    oilBefore: inDisc(watered.solvent, 2) + inDisc(watered.solvent, 3), oilAfter: inDisc(alcohol.solvent, 2) + inDisc(alcohol.solvent, 3),
  };
  // What the plate is handed, against the species and the droplets.
  const species = Array.from(await sv.readField('species'));
  const cloud = Array.from(await sv.readField('cloud'));
  let viewWorst = 0, viewMax = 0;
  for (let c = 0; c < N * N; c++) {
    const want = [species[c * 4], species[c * 4 + 1], species[c * 4 + 2] + consts.scatter * alcohol.solvent[c * 4 + 3], species[c * 4 + 3]];
    for (let k = 0; k < 4; k++) viewWorst = Math.max(viewWorst, Math.abs(cloud[c * 4 + k] - want[k]) / Math.max(1, Math.abs(want[k])));
    viewMax = Math.max(viewMax, consts.scatter * alcohol.solvent[c * 4 + 3]);
  }
  // Oil near the open rim: the sums in 3 hold only while none has reached it.
  let rimOil = 0;
  for (let c = 0; c < N * N; c++) if (Math.hypot((c % N + 0.5) / N - 0.5, (Math.floor(c / N) + 0.5) / N - 0.5) > 0.44) rimOil += alcohol.solvent[c * 4 + 2] + alcohol.solvent[c * 4 + 3];
  return { laid, watered, alcohol, disc, viewWorst, viewMax, rimOil };
}, { P, N, consts });

let main, control, plain, moved, unmoved, louche;
{
  const { page, close } = await openLab({ tag: 'ouzo' });
  try {
    main = await ouzoRun(page);
    // 6. Milk and glycerine, no Ouzo.
    plain = await page.evaluate(async ({ P, N }) => {
      await lab.create(N, N);
      await lab.step(1, { ...P, dt: 1e-6 });
      lab.addSpecies(0.4, 0.45, 0.1, 0.6, 'milk', true);
      lab.addSpecies(0.6, 0.55, 0.1, 0.6, 'glycerine', true);
      lab.addSpecies(0.5, 0.5, 0.05, 0.4, 'alcohol', true);
      await lab.step(5, P);
      const sv = lab.solver();
      const species = await sv.readField('species'), cloud = await sv.readField('cloud'), solvent = await sv.readField('solvent');
      let same = true, scatter = 0, field = 0;
      for (let k = 0; k < species.length; k++) { if (species[k] !== cloud[k]) same = false; if (k % 4 === 2) scatter += species[k]; field += Math.abs(solvent[k]); }
      return { live: sv.solventLive === true, same, scatter, field };
    }, { P, N });
    // 7, 8. A governor's move, with and without the hand-over.
    const regridRun = (carry) => page.evaluate(async ({ P, carry }) => {
      await lab.create(192, 128);
      await lab.step(1, { ...P, dt: 1e-6 });
      for (const [x, y, r, take] of [[0.45, 0.45, 0.1, 0.5], [0.58, 0.56, 0.08, 0.3]]) lab.addSpecies(x, y, r, take, 'ouzo', true);
      lab.addSpecies(0.5, 0.5, 0.05, 0.4, 'water', true);
      await lab.step(4, P);
      const sums = async () => { const s = await lab.solver().readField('solvent'); let oil = 0, drops = 0; for (let c = 0; c < s.length / 4; c++) { oil += s[c * 4 + 2] + s[c * 4 + 3]; drops += s[c * 4 + 3]; } return { oil, drops }; };
      const before = await sums();
      const { taken } = await lab.regrid(128, carry);
      await lab.step(1, P);
      const after = await sums();
      return { before, after, taken };
    }, { P, carry });
    moved = await regridRun(true);
    unmoved = await regridRun(false);
    // 12, 13. One drop at the automation's middle dose on Louche's own render, at the bottle's strength and at the old 3%.
    louche = await page.evaluate(async ({ P, N, settings, consts }) => {
      const bloom = async (anise) => {
        await lab.create(N, N);
        await lab.step(1, { ...P, dt: 1e-6 });
        const sp = lab.addSpecies(0.5, 0.5, 0.001, 1e-9, 'ouzo', false);
        lab.solver().pour(0.5, 0.5, consts.r, consts.evolveTake, { ...sp, anise }, true);
        await lab.step(2, P);
        const S = 256;
        const px = await lab.render(S, settings, { zoom: 1 });
        let v = 0, n = 0, edge = 0;
        for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
          const k = ((S / 2 + j) * S + S / 2 + i) * 4;
          v += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]; n++;
        }
        // The ground well clear of the drop.
        const g = (8 * S + 8) * 4;
        edge = 0.2126 * px[g] + 0.7152 * px[g + 1] + 0.0722 * px[g + 2];
        return { middle: v / n, ground: edge };
      };
      return { now: await bloom(consts.anise), old: await bloom(0.03) };
    }, { P, N, settings, consts });
  } finally { await close(); }
}

/** 9b. A control build: ouzoCloud makes 2% more droplets than the curve says, out of nothing. */
const MORE = {
  name: 'more-drops',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]ouzo\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const at = 'vec4f(was.r, was.g, oil - drops, drops)';
      const found = s.split(at).length - 1;
      if (found !== 1) throw new Error(`ouzo: the control found ${found} of 1 store lines in wgsl/fluid/ouzo.ts`);
      return { contents: s.replace(at, 'vec4f(was.r, was.g, oil - drops, drops * 1.02)'), loader: 'ts' };
    });
  },
};
{
  const { page, close } = await openLab({ plugins: [MORE], tag: 'ouzo-more' });
  try { control = await ouzoRun(page); } finally { await close(); }
}
/** 9. A control build: ouzoCloud's solvent holds half as much oil again as the measured curve says (the oil kept, only split wrong). */
const WIDE = {
  name: 'wide-curve',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]ouzo\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const at = 'let holds = solvent * exp(';
      const found = s.split(at).length - 1;
      if (found !== 1) throw new Error(`ouzo: the control found ${found} of 1 holds lines in wgsl/fluid/ouzo.ts`);
      return { contents: s.replace(at, 'let holds = 1.5 * solvent * exp('), loader: 'ts' };
    });
  },
};
let wide;
{
  const { page, close } = await openLab({ plugins: [WIDE], tag: 'ouzo-wide' });
  try { wide = await ouzoRun(page); } finally { await close(); }
}

const A = { laid: agree(main.laid.solvent, main.laid.gap), watered: agree(main.watered.solvent, main.watered.gap), alcohol: agree(main.alcohol.solvent, main.alcohol.gap) };
const W = { laid: agree(wide.laid.solvent, wide.laid.gap), watered: agree(wide.watered.solvent, wide.watered.gap), alcohol: agree(wide.alcohol.solvent, wide.alcohol.gap) };
const C = { watered: agree(control.watered.solvent, control.watered.gap), alcohol: agree(control.alcohol.solvent, control.alcohol.gap), laid: agree(control.laid.solvent, control.laid.gap) };
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

check('1. every cell\'s droplets are ouzoDrops of its own ethanol, oil and gap, laid and after water; the water clouded more',
  A.laid.worst <= CELL_TOL && A.watered.worst <= CELL_TOL && A.alcohol.worst <= CELL_TOL && A.laid.cloudy > 200
    && A.watered.cloudy > A.laid.cloudy && A.watered.drops > A.laid.drops,
  `worst ${A.laid.worst.toExponential(1)} / ${A.watered.worst.toExponential(1)} / ${A.alcohol.worst.toExponential(1)}; cloudy cells ${A.laid.cloudy} → ${A.watered.cloudy}; droplets ${A.laid.drops.toFixed(4)} → ${A.watered.drops.toFixed(4)}`);
check('2. no droplets in a cell with no oil, nor in one at the bottle\'s own strength',
  A.laid.oilFree > 1000 && A.laid.oilFreeDrops === 0 && A.watered.oilFreeDrops === 0 && A.laid.neat > 5 && A.laid.neatDrops === 0,
  `${A.laid.oilFreeDrops} of ${A.laid.oilFree} oil-free cells and ${A.laid.neatDrops} of ${A.laid.neat} at ${NEAT} ethanol or more hold droplets (the most ${A.laid.maxF.toFixed(3)})`);
check('3. the dish\'s oil is the same through water and Alcohol, none at the rim',
  rel(A.laid.sum, A.watered.sum) <= SUM_TOL && rel(A.laid.sum, A.alcohol.sum) <= SUM_TOL && main.rimOil < 1e-6 && A.laid.sum > 1,
  `oil ${A.laid.sum.toFixed(5)} → ${A.watered.sum.toFixed(5)} → ${A.alcohol.sum.toFixed(5)}; at the rim ${main.rimOil.toExponential(1)}`);
const dissolved = { before: main.disc.oilBefore - main.disc.dropsBefore, after: main.disc.oilAfter - main.disc.dropsAfter };
/*
  The pour's volume pushes some of the oil out from under it, so the oil in
  the disc is not the same before and after; what Alcohol does to what stays
  is put it back in solution, so the dissolved share of the disc's oil is
  what is read (the dish's oil as a whole is 3's).
*/
const dissolvedShare = { before: dissolved.before / Math.max(main.disc.oilBefore, 1e-9), after: dissolved.after / Math.max(main.disc.oilAfter, 1e-9) };
check('4. Alcohol on the cloud dissolves it: the droplets under it fall by a third or more, and the dissolved share of the oil there rises by 0.3 or more',
  main.disc.dropsBefore > 0.01 && main.disc.dropsAfter <= main.disc.dropsBefore * 0.67 && dissolvedShare.after >= dissolvedShare.before + 0.3,
  `droplets ${main.disc.dropsBefore.toFixed(4)} → ${main.disc.dropsAfter.toFixed(4)}, dissolved ${(100 * dissolvedShare.before).toFixed(0)}% → ${(100 * dissolvedShare.after).toFixed(0)}% of the oil there`);
check(`5. the plate is handed the species with ${app.OUZO_SCATTER} × the droplets in b`,
  main.viewWorst <= 1e-4 && main.viewMax > 0.1,
  `worst ${main.viewWorst.toExponential(1)}, the droplets' term up to ${main.viewMax.toFixed(3)} per mm`);
check('6. milk and glycerine with no Ouzo make no solvent field, and the plate is handed the species itself',
  !plain.live && plain.field === 0 && plain.same && plain.scatter > 1,
  `field live ${plain.live}, |solvent| ${plain.field}, view the species ${plain.same}, milk's scatter ${plain.scatter.toFixed(2)}`);
check('7. across a governor\'s move (192 → 128) the oil and the droplets come along',
  moved.taken && rel(moved.before.oil, moved.after.oil) <= 1e-3 && rel(moved.before.drops, moved.after.drops) <= 0.01 && moved.before.drops > 1,
  `oil ${moved.before.oil.toFixed(4)} → ${moved.after.oil.toFixed(4)}, droplets ${moved.before.drops.toFixed(4)} → ${moved.after.drops.toFixed(4)}`);
check('8. control: without the hand-over the new solver holds no oil',
  unmoved.before.oil > 1 && unmoved.after.oil === 0,
  `oil ${unmoved.before.oil.toFixed(4)} → ${unmoved.after.oil}`);
const worstOf = (X) => Math.max(X.laid.worst, X.watered.worst, X.alcohol.worst);
check('9. control: a kernel whose curve holds half as much oil again (the cloud points\' own scatter) fails 1',
  worstOf(W) > CELL_TOL && rel(W.laid.sum, W.alcohol.sum) <= SUM_TOL,
  `worst ${worstOf(W).toExponential(1)} against ${CELL_TOL.toExponential(0)}, its oil kept (${W.laid.sum.toFixed(5)} → ${W.alcohol.sum.toFixed(5)})`);
check('9b. control: a kernel that makes 2% more droplets than the oil it had fails 3',
  rel(C.laid.sum, C.watered.sum) > SUM_TOL || rel(C.laid.sum, C.alcohol.sum) > SUM_TOL,
  `oil ${C.laid.sum.toFixed(5)} → ${C.watered.sum.toFixed(5)} → ${C.alcohol.sum.toFixed(5)}`);
check('10. Louche\'s seed colours at most a third of the dish an unseeded look\'s five pools do, with a quarter of their dye',
  loucheDye.cover > 0.01 && loucheDye.cover <= poolsDye.cover / 3 && loucheDye.mean <= poolsDye.mean / 4,
  `${(100 * loucheDye.cover).toFixed(1)}% of the dish over ${SEEN} against Night Sea's ${(100 * poolsDye.cover).toFixed(1)}%; dye ${loucheDye.mean.toFixed(3)} against ${poolsDye.mean.toFixed(3)} a cell`);
const dish = app.PRESET_LIQUIDS.louche ?? [];
const share = dish.filter((b) => b === 'ouzo').length / Math.max(1, dish.length);
check('11. half or more of Louche\'s drops are Ouzo', share >= 0.5, `${dish.join(', ')}`);
check(`12. the white is translucent: a drop at the automation's middle dose reads ${TRANSLUCENT[0]} to ${TRANSLUCENT[1]} of 255 on Louche`,
  louche.now.middle >= TRANSLUCENT[0] && louche.now.middle <= TRANSLUCENT[1] && louche.now.ground < 10,
  `${louche.now.middle.toFixed(0)} at ${(100 * consts.anise).toFixed(1)}% oil, a take of ${consts.evolveTake.toFixed(3)}; ground ${louche.now.ground.toFixed(0)}`);
check('13. control: the same drop at the old 3% reads over that band', louche.old.middle > TRANSLUCENT[1],
  `${louche.old.middle.toFixed(0)}`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
