#!/usr/bin/env node
/**
 * Does every preset actually say what is on its plate — and is any of it real?
 *
 *   npm run plate
 *
 * Three maps in `src/presetPlate.ts` decide what a preset looks like before a
 * single frame is drawn: which dyes it may use, how the automation puts them
 * on the glass, and what liquid they are. All three are keyed by preset id as
 * a plain string, which is a design that works right up until someone writes
 * `'sillicone'` — and then that preset quietly has no liquid in it, forever,
 * with no error anywhere and nothing on screen that looks broken. It just
 * never does the thing it was supposed to do.
 *
 * That is the failure this catches. The rest is an audit: every preset in the
 * app is listed with what is in its dish, and the four liquids that carry
 * behaviour each have to be used by something, because a liquid nothing pours
 * is a menu entry rather than a feature.
 *
 * Unlike the other harnesses this one is bundled by esbuild before it runs,
 * because it reaches into app modules that import each other and Node's own
 * type-stripping cannot tell a type-only import from a value one.
 */

import { PRESETS } from '../src/presets.ts';
import { PRESET_CONTRACTS, PRESET_INJECT_STYLES, PRESET_LIQUIDS } from '../src/presetPlate.ts';
import { DEFAULT_LIQUID_TYPES, DEFAULT_SETTINGS } from '../src/types.ts';
import { PALETTE } from '../src/constants.ts';
import fs from 'node:fs';

const STYLES = ['drop', 'pour', 'spray', 'splatter', 'streak'];
/** Keys that are a plate but not a preset in the menu. */
const NOT_A_PRESET = new Set(['fillmore-wash']);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const ids = PRESETS.map(p => p.id);
const liquidIds = new Set(DEFAULT_LIQUID_TYPES.map(l => l.id));
const behaviourOf = new Map(DEFAULT_LIQUID_TYPES.map(l => [l.id, l.behaviour]));

// ── 1. Nothing names a preset that isn't there ───────────────────────
{
  const stray = [];
  for (const [map, name] of [[PRESET_CONTRACTS, 'contracts'], [PRESET_INJECT_STYLES, 'styles'], [PRESET_LIQUIDS, 'liquids']]) {
    for (const key of Object.keys(map)) {
      if (!ids.includes(key) && !NOT_A_PRESET.has(key)) stray.push(`${name}:${key}`);
    }
  }
  check('every key is a preset that exists', stray.length === 0, stray.join(', '));
}

// ── 2. Every preset is fully described ───────────────────────────────
{
  const missing = { contract: [], styles: [], liquids: [] };
  for (const id of ids) {
    if (!PRESET_CONTRACTS[id]) missing.contract.push(id);
    if (!PRESET_INJECT_STYLES[id]) missing.styles.push(id);
    if (!PRESET_LIQUIDS[id]) missing.liquids.push(id);
  }
  check('every preset names its dyes', missing.contract.length === 0, missing.contract.join(', '));
  check('every preset names its injection styles', missing.styles.length === 0, missing.styles.join(', '));
  check('every preset names what is in the dish', missing.liquids.length === 0, missing.liquids.join(', '));
}

// ── 3. And names things that exist ───────────────────────────────────
{
  const badDye = [], badStyle = [], badLiquid = [];
  for (const [id, c] of Object.entries(PRESET_CONTRACTS))
    for (const i of c) if (!Number.isInteger(i) || i < 0 || i >= PALETTE.length) badDye.push(`${id}:${i}`);
  for (const [id, ss] of Object.entries(PRESET_INJECT_STYLES))
    for (const st of ss) if (!STYLES.includes(st)) badStyle.push(`${id}:${st}`);
  for (const [id, ls] of Object.entries(PRESET_LIQUIDS))
    for (const l of ls) if (!liquidIds.has(l)) badLiquid.push(`${id}:${l}`);
  check('every dye index is in the palette', badDye.length === 0, badDye.join(', '));
  check('every injection style is one the solver knows', badStyle.length === 0, badStyle.join(', '));
  // The one that matters: a typo here is silent at runtime.
  check('every liquid named is a liquid that exists', badLiquid.length === 0, badLiquid.join(', '));
}

// ── 4. Each liquid that does something is actually poured ────────────
{
  const behavioural = DEFAULT_LIQUID_TYPES.filter(l => l.behaviour).map(l => l.id);
  const used = new Set(Object.values(PRESET_LIQUIDS).flat());
  const unused = behavioural.filter(id => !used.has(id));
  check('every liquid with physics in it is used by some preset', unused.length === 0, unused.join(', '));
}

// ── 5. Every bottle lays enough dye to show the colour you picked ────
//
// Each liquid carries a colour swatch and a colour picker, so choosing a dye
// is a statement of intent and the drop has to show it. Soap and silicone
// were set at 0.12 and 0.05 — physically right for a surfactant, and a trap:
// on a live plate (density around 2) a drop that small is overwhelmed by
// what is already there, so picking Cherry Red with Silicone selected painted
// the plate's own colour back at you. It read as "red is broken".
{
  const ab = (v) => -Math.log(Math.max(0.002, v));
  const YELLOW = [1, 0.92, 0], RED = [1, 0, 0];
  /** Cherry Red dropped into a plate of yellow at this density: does it read red? */
  const showsUp = (amount, plate = 2.0) => {
    const d = plate + amount;
    const c = [0, 1, 2].map(i => Math.exp(-(plate * ab(YELLOW[i]) + amount * ab(RED[i])) / d));
    return c[0] > c[1] * 1.5 && c[0] > c[2] * 1.5;
  };
  const invisible = DEFAULT_LIQUID_TYPES.filter(l => !showsUp(l.injectAmount ?? 0));
  check('every bottle lays enough dye to show the colour you picked',
    invisible.length === 0,
    invisible.map(l => `${l.id} at ${l.injectAmount}`).join(', '));
}

// ── 5.5. The reconstruction filter is interpolating ─────────────
//
// Every sample the renderer takes of the dye goes through `textureBicubic`,
// and for a long time that function was the cubic B-spline basis under a
// comment that said Catmull-Rom. B-spline does not pass through its samples:
// at a texel centre its weights are (1, 4, 1)/6, so each fetch returned a
// blurred neighbourhood instead of the value that was there. Nothing failed,
// no frame was wrong, the whole plate was simply soft — which is the kind of
// bug that survives for months because it looks like a choice.
//
// This reads the four weight expressions out of the shipped shader and runs
// them, so it tests the app rather than a copy of the maths. Two properties
// tell the two families apart with no tuning in them at all: the weights at a
// texel centre, and how steeply the kernel can reconstruct a step edge.
{
  const src = fs.readFileSync(process.cwd() + '/src/components/LiquidVisualizer.tsx', 'utf8');
  const body = src.slice(src.indexOf('vec4 textureBicubic'));
  const weights = [...body.slice(0, body.indexOf('vec2 w12')).matchAll(/vec2 w[0-3] = ([^;]+);/g)].map(m => m[1]);
  check('the shader still has four reconstruction weights to read', weights.length === 4,
    `found ${weights.length}`);
  if (weights.length === 4) {
    const at = (f) => weights.map(w => Function('f', `return ${w};`)(f));
    const sum = (a) => a.reduce((x, y) => x + y, 0);
    const centre = at(0);
    check('a sample at a texel centre returns that texel, not its neighbourhood',
      Math.abs(centre[1] - 1) < 1e-6 && Math.abs(centre[0]) + Math.abs(centre[2]) + Math.abs(centre[3]) < 1e-6,
      centre.map(v => v.toFixed(3)).join(' '));
    const off = [0.25, 0.5, 0.75].map(f => sum(at(f)));
    check('the weights still sum to one everywhere between centres',
      off.every(v => Math.abs(v - 1) < 1e-6), off.map(v => v.toFixed(4)).join(' '));
    // A unit step through the kernel, sampled finely: how hard is the hardest
    // edge it can draw? The B-spline this replaced managed 0.75 per texel.
    const step = (i) => (i >= 0 ? 1 : 0);
    let steepest = 0, prev = null;
    for (let x = -3; x <= 3; x += 1 / 32) {
      const i = Math.floor(x), k = at(x - i);
      const v = k[0] * step(i - 1) + k[1] * step(i) + k[2] * step(i + 1) + k[3] * step(i + 2);
      if (prev !== null) steepest = Math.max(steepest, Math.abs(v - prev) * 32);
      prev = v;
    }
    check('a boundary comes back at least as hard as the texels that hold it',
      steepest > 1.0, `${steepest.toFixed(2)} per cell across a step (B-spline managed 0.75)`);
  }
}

// ── 5.6. A colour boundary is a boundary the sharpen pass can hold ────
//
// Both solvers run an anti-diffusion pass to walk back the smearing the rest
// of the step applies, and the gate that stops it carving holes used to be
// read per channel. Where red meets blue at the same thickness that gate is
// zero on both channels — full on one side, empty on the other — so the pass
// cancelled itself at exactly the boundary it exists for. On a plate with dye
// everywhere that is nearly every boundary, which is why it measured as doing
// nothing and shipped switched off for months.
//
// This runs the kernel here, on a red field meeting a blue one at equal
// thickness, and asks for the two things that tell a fixed pass from the
// broken one: a boundary a couple of cells wide has to narrow, and a smooth
// wash has to be left alone, because growing a wash is what terraces a dish.
{
  const N = 48, FLOOR = 0.08, K = 0.135;          // K is the curve's value at sharpness 1
  const at = (x, y) => x + y * N;
  const smeared = (sm) => {
    const f = { a: new Float32Array(N * N), r: new Float32Array(N * N), b: new Float32Array(N * N) };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = 1 / (1 + Math.exp(-(x - N / 2) / sm));
      f.a[at(x, y)] = 1; f.r[at(x, y)] = 1 - t; f.b[at(x, y)] = t;
    }
    return f;
  };
  const g = (p, q) => (p < q ? p / (q + 1e-4) : q / (p + 1e-4));
  const sweep = (f) => {
    const src = [f.a, f.r, f.b].map(c => Float32Array.from(c));
    const ga = src[0];                             // the gate is the thickness, for every channel
    [f.a, f.r, f.b].forEach((out, ci) => {
      const o = src[ci];
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = at(x, y);
        const nb = [i - 1, i + 1, i - N, i + N, i - N - 1, i - N + 1, i + N - 1, i + N + 1];
        const w = [0.2, 0.2, 0.2, 0.2, 0.05, 0.05, 0.05, 0.05];
        let flux = 0, lo = o[i], hi = o[i];
        for (let n = 0; n < 8; n++) {
          flux += w[n] * g(ga[i], ga[nb[n]]) * (o[i] - o[nb[n]]);
          lo = Math.min(lo, o[nb[n]]); hi = Math.max(hi, o[nb[n]]);
        }
        const q = Math.sign(flux) * Math.max(Math.abs(flux) - FLOOR * (hi - lo), 0);
        out[i] = Math.max(0, Math.min(hi, Math.max(lo, o[i] + K * q)));
      }
    });
  };
  /** The 10-90% width of the red channel across the middle row, in cells. */
  const width = (f) => {
    const row = [];
    for (let x = 0; x < N; x++) row.push(f.r[at(x, N >> 1)]);
    const lo = Math.min(...row), hi = Math.max(...row);
    const cross = (p) => {
      const tgt = lo + (hi - lo) * p;
      for (let x = 1; x < N; x++) if ((row[x - 1] - tgt) * (row[x] - tgt) <= 0)
        return x - 1 + (row[x - 1] - tgt) / (row[x - 1] - row[x] + 1e-9);
      return NaN;
    };
    return Math.abs(cross(0.1) - cross(0.9));
  };
  const run = (sm) => { const f = smeared(sm); const before = width(f);
    for (let i = 0; i < 200; i++) sweep(f); return [before, width(f)]; };

  const [edge0, edge1] = run(0.5);
  check('a smeared colour boundary narrows instead of sitting there',
    edge1 < edge0 * 0.85, `${edge0.toFixed(1)} → ${edge1.toFixed(1)} cells over 200 steps`);

  const [wash0, wash1] = run(3);
  check('a smooth wash is still left alone rather than grown into terraces',
    Math.abs(wash1 - wash0) < 0.2, `${wash0.toFixed(1)} → ${wash1.toFixed(1)} cells over 200 steps`);

  // The model above is a model. These two read the shipped solvers, so a gate
  // quietly put back the way it was fails here rather than in a show.
  const shader = fs.readFileSync(process.cwd() + '/src/lib/gpuFluid.ts', 'utf8');
  const gpuGate = /float gate\(vec4 a, vec4 b\) \{ return min\(a\.a, b\.a\)/.test(shader);
  check('the GPU solver reads its gate from the thickness, not from the channel',
    gpuGate, gpuGate ? '' : 'gate() in gpuFluid.ts is back to per-channel');
  const cpu = fs.readFileSync(process.cwd() + '/src/components/LiquidVisualizer.tsx', 'utf8');
  const cpuBody = cpu.slice(cpu.indexOf('private sharpenDye'), cpu.indexOf('private advectMacCormack'));
  const cpuGate = cpuBody.includes('this.shpA.set(this.density)') && /gate\(a, ga\[/.test(cpuBody);
  check('the CPU solver reads its gate from the thickness too',
    cpuGate, cpuGate ? '' : 'sharpenDye in LiquidVisualizer.tsx is back to per-channel');

  // And the pass has to be switched on, or none of the above reaches a plate.
  check('the sharpening that counteracts the solver\'s own diffusion is on by default',
    (DEFAULT_SETTINGS.sharpness ?? 0) > 0, `sharpness ${DEFAULT_SETTINGS.sharpness ?? 0}`);
}

// ── 6. The audit ─────────────────────────────────────────────────────
console.log('');
console.log('     what is on each plate:');
let withPhysics = 0;
for (const p of PRESETS) {
  const ls = PRESET_LIQUIDS[p.id] ?? [];
  const does = ls.filter(l => behaviourOf.get(l));
  if (does.length) withPhysics++;
  const chance = ls.length ? `${Math.round(does.length / ls.length * 100)}%` : '—';
  console.log(`       ${p.id.padEnd(20)} ${ls.join(', ').padEnd(28)} ${chance.padStart(4)} of doses do something`);
}
console.log('');
console.log(`     ${withPhysics}/${PRESETS.length} presets carry a liquid that changes the plate`);
check('most of the app takes advantage of them', withPhysics >= PRESETS.length - 2,
  `${PRESETS.length - withPhysics} plate${PRESETS.length - withPhysics === 1 ? '' : 's'} of plain dye`);

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
