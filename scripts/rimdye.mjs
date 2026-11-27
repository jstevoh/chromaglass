#!/usr/bin/env node
/**
 * Lava Pop's colour stays in its dish (PLAN 18a-23; `npm run rimdye`, the
 * lab, about ten minutes on SwiftShader).
 *
 * What was reported (the owner, 2026-11-27): left running, Lava Pop's plate
 * emptied. On the owner's Mac on main, with nothing driving it, it lost 4 to
 * 5% of its dye every two minutes; Evaporation, Air and Rock were each ruled
 * out. On a thin gap the one place dye leaves is past the open rim, where
 * decayDye clears it every step. Oil Bodies' exchanges (bodyPartition: each
 * liquid's colour evened out across the oil's edge, and colour astray drifting
 * back to its own liquid down the oil's blur) read the cells past the rim as
 * neighbours, so the water's colour at the rim levelled and drifted into
 * cells that are cleared every step. They now stop at the rim, as the dye's
 * own dispersion and the oil's relaxation do (wgsl/fluid/oil.ts says why).
 *
 * This holds, on the real solver at 128², Lava Pop's own step (the app's
 * deriveStep for the look, read on node from sim/fluidSimulation.ts) and the
 * app's own lay of its oil cells and water (seedPreset('classic')):
 *  0. The lab ran the thin gap and laid the look with its oil cells and Oil
 *     Bodies on: the colour read back is what the CPU laid, and the same in
 *     all three runs below.
 *  1. The dish keeps its colour: after STEPS steps, at least KEEP of it.
 *  2. The control: the same lab with bodyPartition's faces across the rim
 *     put back (a build-time edit of wgsl/fluid/oil.ts) loses at least LOSES
 *     times as much, so 1 can fail.
 *  3. bodyPartition ran in the fixed build (a kernel that failed to build is
 *     skipped, and that plate would pass 1 as Oil Bodies off would): the
 *     oil's share of the colour well inside the rim, where the rim's faces
 *     change nothing, is the control's to 1%.
 *  4. What the dish still loses is not Oil Bodies': at most BODIES of what
 *     the plate loses with it off (PLAN 18a-24 (a) has the rest).
 */
import { build } from 'esbuild';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openLab } from './lab.mjs';

const N = 128;
const STEPS = 600;
const KEEP = 0.999;
const LOSES = 3;
/** Oil Bodies with the rim closed may cost the dish at most this much more than the plate loses without it (PLAN 18a-24 (a): the rest is not yet traced). */
const BODIES = 1.25;

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/*
  The look's step and lay as the app makes them. The app's plate on node
  (FluidSimulation, as classicdish.mjs builds it) with a stand-in solver that
  takes the lay at the lab's grid (layDye refuses any other size), then
  stepped a few seconds with no sound, so the step is the one a running
  Lava Pop takes with nothing playing.
*/
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'node_modules', '.cache', 'rimdye', 'app.mjs');
mkdirSync(dirname(out), { recursive: true });
await build({
  stdin: { contents: "export { FluidSimulation } from './src/sim/fluidSimulation.ts'; export { PRESETS } from './src/presets.ts'; export { DEFAULT_SETTINGS } from './src/types.ts'; export { setShowSeed } from './src/lib/rng.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'warning',
});
globalThis.GPUTextureUsage ??= { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };
globalThis.GPUBufferUsage ??= { MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32, UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512 };
globalThis.GPUMapMode ??= { READ: 1, WRITE: 2 };
globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const app = await import(pathToFileURL(out).href);

const settings = { ...app.DEFAULT_SETTINGS, ...app.PRESETS.find((p) => p.id === 'classic').settings };
app.setShowSeed(1);
const sim = new app.FluidSimulation(96, 0, 0, 0.1);
const lay = { mixes: [], water: null, oil: null };
sim.gpu = new Proxy({
  N,
  addMix: (x, y, r, o) => { lay.mixes.push({ x, y, r, oil: o.oil }); },
  layDye: (dye, o) => {
    if (dye.length !== N * N * 4) return false;
    lay.oil = Array.from(o);
    lay.water = Array.from(dye, (v, i) => v - lay.oil[i]);
    return true;
  },
  layShare: () => {},
}, { get: (t, k) => t[k] });
sim.addDensity = () => {};
sim.addOilDensity = () => {};
sim.seedPreset('classic', () => 0);
if (!lay.water) throw new Error('rimdye: Lava Pop did not lay its dye at the solver\'s grid (layDye)');
sim.gpu = null;
let t = 0;
for (let k = 0; k < 300; k++) { t += 1 / 60; sim.step(settings, t, () => 0); }
const P = {};
for (const [k, v] of Object.entries(sim.lastStep)) if (typeof v !== 'object' || Array.isArray(v)) P[k] = v;
if (P.thinGap !== 1) throw new Error(`rimdye: Lava Pop's step is not a thin gap (thinGap ${P.thinGap})`);
console.log(`      Lava Pop's step: dt ${P.dt.toExponential(3)}, oil tension ${P.oilTension}, ${lay.mixes.length} oil cells laid`);

/** The control's build: bodyPartition's faces across the open rim put back, as before 18a-23. */
const ACROSS = {
  name: 'across',
  setup(b) {
    b.onLoad({ filter: /src[\\/]gpu[\\/]wgsl[\\/]fluid[\\/]oil\.ts$/ }, (a) => {
      const s = readFileSync(a.path, 'utf8');
      const at = 'if (S.thinGap > 0.5 && pastOpenRim(p) != pastOpenRim(q)) { continue; }';
      const found = s.split(at).length - 1;
      if (found !== 1) throw new Error(`rimdye: the control found ${found} of 1 rim lines in wgsl/fluid/oil.ts`);
      return { contents: s.replace(at, ''), loader: 'ts' };
    });
  },
};

const look = (page, over = {}) => page.evaluate(async ({ P, lay, N, STEPS, over }) => {
  await lab.create(N, N);
  await lab.step(1, { ...P, dt: 1e-6 });
  const sv = lab.solver();
  for (const m of lay.mixes) sv.addMix(m.x, m.y, m.r, { oil: m.oil });
  lab.addDye(lay.water);
  lab.addOilDye(lay.oil);
  lab.flush();
  const inside = (f, r) => { let s = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) < r) s += f[(i + j * N) * 4 + 3];
    return s; };
  const before = inside(await lab.field('dye'), 0.5);
  await lab.step(STEPS, { ...P, ...over });
  const after = inside(await lab.field('dye'), 0.5);
  // The oil's share well inside the rim, where the rim's faces change nothing: the same in both builds if bodyPartition ran in both.
  const oilInside = inside(await lab.field('oilDye'), 0.4);
  return { before, after, oilInside, thin: lab.thinLive() };
}, { P, lay, N, STEPS, over });

let fixed, across, noBodies;
{
  const { page, close } = await openLab();
  try { fixed = await look(page); } finally { await close(); }
}
{
  const { page, close } = await openLab({ plugins: [ACROSS], tag: 'rimdye-across' });
  try { across = await look(page); noBodies = await look(page, { oilBodies: 0 }); } finally { await close(); }
}

// What the CPU laid inside the rim, the water's and the oil's, against what the solver read back.
let laid = 0;
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  if (Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) >= 0.5) continue;
  const o = (i + j * N) * 4 + 3;
  laid += lay.water[o] + lay.oil[o];
}
const same = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
const kept = fixed.after / fixed.before, lost = fixed.before - fixed.after;
const keptOld = across.after / across.before, lostOld = across.before - across.after;
const lostPlain = noBodies.before - noBodies.after;
check('0. the lab ran the thin gap and laid the look, the same plate three times, with its oil and Oil Bodies on',
  fixed.thin && across.thin && noBodies.thin && same(fixed.before, laid, 0.01) && same(fixed.before, across.before, 1e-4) && same(fixed.before, noBodies.before, 1e-4)
    && lay.mixes.length > 10 && P.oilBodies > 0.001,
  `thin ${fixed.thin}/${across.thin}/${noBodies.thin}; read back ${fixed.before.toFixed(1)}, ${across.before.toFixed(1)}, ${noBodies.before.toFixed(1)} of the ${laid.toFixed(1)} laid; ${lay.mixes.length} oil cells; Oil Bodies ${P.oilBodies}`);
check(`1. Lava Pop's dish keeps its colour: at least ${100 * KEEP}% after ${STEPS} steps`, kept >= KEEP,
  `${(100 * kept).toFixed(3)}% (${lost.toFixed(2)} of ${fixed.before.toFixed(0)} gone from the dish)`);
check(`2. control: bodyPartition across the rim again loses at least ${LOSES}x as much`, lostOld >= LOSES * Math.max(lost, 0) && lostOld > 1,
  `${(100 * keptOld).toFixed(3)}% kept, ${lostOld.toFixed(2)} gone (${(lostOld / Math.max(lost, 1e-6)).toFixed(1)}x)`);
check('3. and bodyPartition ran with the rim closed: the oil\'s colour inside r 0.4 as the control\'s, within 1%', fixed.oilInside > 100 && same(fixed.oilInside, across.oilInside, 0.01),
  `${fixed.oilInside.toFixed(1)} against ${across.oilInside.toFixed(1)}`);
check(`4. what is left is not Oil Bodies': with the rim closed it loses at most ${BODIES} of what the plate loses with it off`, lost <= BODIES * lostPlain + 0.1,
  `${lost.toFixed(2)} gone with Oil Bodies on, ${lostPlain.toFixed(2)} with it off (PLAN 18a-24 (a))`);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
