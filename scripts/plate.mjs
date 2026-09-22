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
import { DEFAULT_LIQUID_TYPES } from '../src/types.ts';
import { PALETTE } from '../src/constants.ts';
import { BeadField } from '../src/lib/beads.ts';
import { PIN_RANGE } from '../src/lib/deskPins.ts';
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
  // The plate's shader is WGSL since the cutover (docs/webgpu-plan.md, P7);
  // the GLSL it was read from is gone with the engine that ran it.
  const src = fs.readFileSync(process.cwd() + '/src/gpu/wgsl/plate.ts', 'utf8');
  // The weights live in bicubicSigned, which the derive pass's signed fields are
  // read through; textureBicubic is the same reconstruction clamped at zero.
  check('the dye is still read through the one reconstruction',
    /fn textureBicubic\(t: texture_2d<f32>, uv: vec2f\) -> vec4f \{\s*return max\(bicubicSigned\(t, uv\), vec4f\(0\.0\)\);/.test(src));
  const body = src.slice(src.indexOf('fn bicubicSigned'));
  const weights = [...body.slice(0, body.indexOf('let w12')).matchAll(/let w[0-3] = ([^;]+);/g)].map(m => m[1]);
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
  const shader = fs.readFileSync(process.cwd() + '/src/gpu/wgsl/fluid.ts', 'utf8');
  const gpuGate = /fn gate\(a: vec4f, b: vec4f\) -> f32 \{ return min\(a\.a, b\.a\)/.test(shader);
  check('the GPU solver reads its gate from the thickness, not from the channel',
    gpuGate, gpuGate ? '' : 'gate() in gpu/wgsl/fluid.ts is back to per-channel');
  const cpu = fs.readFileSync(process.cwd() + '/src/components/LiquidVisualizer.tsx', 'utf8');
  const cpuBody = cpu.slice(cpu.indexOf('private sharpenDye'), cpu.indexOf('private advectMacCormack'));
  const cpuGate = cpuBody.includes('this.shpA.set(this.density)') && /gate\(a, ga\[/.test(cpuBody);
  check('the CPU solver reads its gate from the thickness too',
    cpuGate, cpuGate ? '' : 'sharpenDye in LiquidVisualizer.tsx is back to per-channel');
}

// ── 5.7. The closeup is a travel, not a switch ─────────────────
//
// The macro zoom used to reach the renderer only through a boolean, so the
// closeup arrived in one frame: a different exposure, a different depth of
// field, a different silhouette, all at once. It ramps now, and how far along
// the ramp a given zoom sits is a pure function of two constants in the
// component — so this reads them out and runs it.
//
// It is here rather than in `npm run qa` because qa tried to check this from
// the pixels, by asking whether a frame at 1.4x sits nearer the plate-wide
// frame than one at 9x does. Image distance is not monotonic in zoom, and on a
// slower machine the magnified bead landed *closer* to the plate frame than
// the mid-zoom did, failing a check on a plate that was behaving correctly.
{
  const src = fs.readFileSync(process.cwd() + '/src/components/LiquidVisualizer.tsx', 'utf8');
  const full = Number(/const MACRO_FULL_ZOOM = ([\d.]+)/.exec(src)?.[1]);
  const ramp = (zoom) => Math.max(0, Math.min(1, (zoom - 1) / (full - 1)));
  check('the closeup has a ramp to travel along at all',
    Number.isFinite(full) && full > 1, `fully in at ${full}x`);
  if (Number.isFinite(full) && full > 1) {
    check('the whole plate is none of the closeup', ramp(1) === 0);
    const middle = ramp(1 + (full - 1) * 0.5);
    check('half way in is half of it, not all and not none',
      middle > 0.4 && middle < 0.6, `${middle.toFixed(2)} at ${(1 + (full - 1) * 0.5).toFixed(2)}x`);
    check('and it is in all the way before the zoom runs out',
      ramp(full) === 1 && ramp(16) === 1);
    // No step along the way may carry most of the change: that is a cut with
    // a ramp drawn around it.
    let biggest = 0, prev = ramp(1);
    for (let z = 1; z <= full; z += (full - 1) / 40) {
      const now = ramp(z);
      biggest = Math.max(biggest, now - prev);
      prev = now;
    }
    check('and no one step along it is a cut', biggest < 0.1,
      `the largest fortieth of the travel moves it ${biggest.toFixed(3)}`);
  }
}

// ── 5.8. Every look says how much it breathes ──────────────────
//
// `surge` decides whether a plate drifts at one rate or surges and rests, and
// it is the difference between Lumia and Acid Trip far more than any single
// colour is. A preset that does not name it inherits whatever the default
// happens to be, which means the two of them breathe identically — and the
// whole point of a library of looks is that they do not.
{
  const missing = PRESETS.filter(p => typeof p.settings.surge !== 'number');
  check('every look chooses how much it breathes',
    missing.length === 0, missing.map(p => p.id).join(', ') || `all ${PRESETS.length}`);

  const surges = PRESETS.map(p => p.settings.surge ?? 0);
  const lo = Math.min(...surges), hi = Math.max(...surges);
  check('and the library uses the range rather than clustering on one value',
    lo < 0.25 && hi > 0.8, `${lo} to ${hi}`);

  // The looks whose whole character is stillness must not be the loud ones.
  const still = ['lumia', 'velvet-underground', 'aurora-borealis'];
  const loud = ['acid-trip', 'microscopic-chaos', 'bass-drop'];
  const surgeOf = (id) => PRESETS.find(p => p.id === id)?.settings.surge ?? -1;
  check('the quiet looks are quieter than the loud ones',
    Math.max(...still.map(surgeOf)) < Math.min(...loud.map(surgeOf)),
    `${still.map(surgeOf).join('/')} against ${loud.map(surgeOf).join('/')}`);
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

// ── No look carries a value its own control cannot reach ────────────
//
// A preset is a set of numbers and a control is a range, and nothing held
// them together. `lace-run` carried Speed 0.45 where the control stops at
// 0.3: the desk could not show that look's own speed, and touching the
// slider at all snapped it to a different show. Diffusion had nine presets
// above its ceiling for the same reason.
//
// A look outside its control's range is a look you cannot play, which is a
// strange thing for a light show to ship.
{
  const outside = [];
  for (const preset of PRESETS) {
    for (const [key, value] of Object.entries(preset.settings ?? {})) {
      if (typeof value !== 'number') continue;
      const spec = PIN_RANGE.get(key);
      if (!spec) continue;
      if (value < spec.min || value > spec.max) {
        outside.push(`${preset.id}.${key} = ${value} (the control is ${spec.min}..${spec.max})`);
      }
    }
  }
  check('no look sets a value its own control cannot reach', outside.length === 0,
    outside.slice(0, 4).join('; ') || `${PRESETS.length} looks checked`);
}

// ── A bead that goes non-finite loses a bead, not the show ───────────
//
// Reported as "the UI works, just the visuals are frozen", with one line in
// the console saying why:
//
//   Uncaught TypeError: Failed to execute 'createRadialGradient' on
//   'OffscreenCanvasRenderingContext2D': The provided double value is
//   non-finite.
//
// `BeadField.render` asks for a radial gradient at a bead's centre, and that
// throws on NaN. It runs inside the frame loop, so the throw did not lose a
// bead — it stopped the canvas while React carried on, leaving a fully
// working desk over a frozen picture.
//
// Nothing could bring the bead back either. The sampler clamped with
// `Math.max(0, Math.min(N - 1, Math.round(x)))`, which looks defensive and is
// NaN-transparent: `Math.round(NaN)` is NaN, min and max pass it through, an
// array indexed by NaN is `undefined`, and `undefined * k` is NaN again.
{
  /*
    A bead field with beads in it, whatever the dice say.

    `populate` is rejection sampling: a candidate is thrown away where the
    patch field is zero and kept only with probability `p` where it is not,
    and it gives up after `count * 6` tries. So `populate(2)` can legitimately
    place **nothing**, and three checks below were written as though it
    always places something — one indexed `beads[0]` and crashed, one failed,
    and one compared a count to itself and passed while proving nothing.

    It came due on `main` rather than on a branch: the Measure job died with
    "Cannot set properties of undefined (setting 'x')", the deploy that
    depended on it was skipped, and the same commit passed three times in a
    row locally. A gate that fails for reasons nobody can name teaches people
    to press the button again.

    Asking repeatedly is the fix and not a fudge — the thing under test is
    what `render` and `step` do to a bead that has gone non-finite, and
    getting a bead to test them with is setup, not the measurement.
  */
  /*
    A setting that is not a number must not poison the plate for good.

    Reported from a plate twice: "a big giant box spins onto the screen", once
    with a freeze and once without. The freeze was a non-finite bead reaching
    `createRadialGradient`, and it was fixed. The box outlived it.

    Three places turned a missing setting into a broken picture, and two of
    them could not recover:

      globalSpeed        undefined / 0.05 is NaN, and it multiplies through
                         into the timestep
      the timestep       `Math.min(Math.max(NaN, lo), hi)` is NaN — a clamp
                         carries a NaN rather than catching one, which is the
                         same trap as the bead sampler's
      the plate's angle  `angle += NaN` is NaN *for the rest of the session*:
                         the angle turns the dish, so every frame after is
                         sampled through a broken transform, and putting the
                         setting back does not undo it

    The third is the one that matches "and it stays". This checks the
    arithmetic of all three, which is where the fault was — the plate itself
    is out of reach of a harness with no GPU.
  */
  {
    const clampNaN = (v) => Math.min(Math.max(v, 0.0000001), 0.05);
    check('a clamp carries a NaN rather than catching one',
      Number.isNaN(clampNaN(NaN)),
      'which is why every one of these needs Number.isFinite first');

    const speedOf = (g) => (Number.isFinite(g) ? g : 0.05) / 0.05;
    // Near six, not six: 0.3 / 0.05 is 5.999999999999999 and an exact
    // comparison here fails on the arithmetic rather than on the guard.
    check('a missing speed does not become a NaN multiplier',
      Number.isFinite(speedOf(undefined)) && Number.isFinite(speedOf(NaN)) && Math.abs(speedOf(0.3) - 6) < 1e-9,
      `undefined gives ${speedOf(undefined)}, 0.3 still gives ${speedOf(0.3).toFixed(3)}`);

    const dtOf = (want) => (Number.isFinite(want) ? clampNaN(want) : 0.0000001);
    check('and a non-finite timestep never reaches the solver',
      Number.isFinite(dtOf(NaN)) && Number.isFinite(dtOf(undefined)) && dtOf(0.01) === 0.01,
      `NaN gives ${dtOf(NaN)}, 0.01 still gives ${dtOf(0.01)}`);

    // The one that cannot recover: an angle is a running total.
    let angle = 0;
    const turn = (t) => { if (Number.isFinite(t)) angle += t; };
    turn(0.5); turn(NaN); turn(undefined); turn(0.25);
    check('a bad frame cannot poison the plate angle for the session',
      angle === 0.75, `${angle} after a good turn, a NaN, an undefined and another good one`);
  }

  const beaded = (count = 2) => {
    const f = new BeadField(192);
    for (let t = 0; t < 40 && f.beads.length === 0; t++) f.populate(count);
    return f;
  };

  const field = beaded();
  check('a plate with beads on it has beads', field.beads.length > 0, `${field.beads.length}`);

  // A solver that has gone unstable hands back NaN. That is the way in.
  const had = field.beads.length;
  field.step(1 / 60, () => [NaN, NaN], 0, 0);
  check('a bead fed NaN is dropped rather than kept for ever',
    field.beads.length === 0, `${field.beads.length} left of ${had}`);

  /*
    And one that arrives another way must never reach the gradient.

    Node has no canvas, so this stands one up — with a
    `createRadialGradient` that refuses a non-finite argument exactly as
    Chrome's does, because that refusal *is* the bug. A stub that quietly
    accepted NaN would make this check pass over the very thing it is here
    to catch.
  */
  const ctxStub = () => ({
    createRadialGradient: (...args) => {
      if (args.some((v) => !Number.isFinite(v))) {
        throw new TypeError("Failed to execute 'createRadialGradient': The provided double value is non-finite.");
      }
      return { addColorStop() {} };
    },
    arc: (...args) => {
      if (args.some((v) => !Number.isFinite(v))) throw new TypeError('arc: non-finite');
    },
    clearRect() {}, beginPath() {}, fill() {}, stroke() {},
    // Stored as well as checked. Written as setters alone they read back
    // `undefined`, and `rr - undefined * 0.5` is NaN — the stub would then
    // fail the very code it is testing, which it did.
    _alpha: 1,
    set globalAlpha(v) { if (!Number.isFinite(v)) throw new TypeError('globalAlpha: non-finite'); this._alpha = v; },
    get globalAlpha() { return this._alpha; },
    _lw: 1,
    set lineWidth(v) { if (!Number.isFinite(v)) throw new TypeError('lineWidth: non-finite'); this._lw = v; },
    get lineWidth() { return this._lw; },
    lineJoin: '', strokeStyle: '', fillStyle: null,
  });
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctxStub(); } };

  const sneaky = beaded();
  check('and one to push over', sneaky.beads.length > 0, `${sneaky.beads.length} beads to work with`);
  sneaky.beads[0].x = NaN;
  let threw = null;
  try { sneaky.render(); } catch (e) { threw = String(e).slice(0, 140); }
  check('and drawing one never throws', threw === null, threw ?? '');

  // The stub has to be able to fail, or the check above proves nothing.
  let stubBites = null;
  try { ctxStub().createRadialGradient(NaN, 0, 0, 0, 0, 1); } catch (e) { stubBites = String(e).slice(0, 60); }
  check('and the stub would have caught it', stubBites !== null, stubBites ?? 'the stub accepts NaN — this check is measuring nothing');

  // A good bead is untouched by any of this.
  const fine = beaded();
  const kept = fine.beads.length;
  fine.step(1 / 60, () => [0.01, 0.01], 0, 0);
  // `kept > 0` as well as the equality: with no beads at all this reads
  // 0 === 0 and passes without having looked at anything.
  check('a bead in a healthy field survives', kept > 0 && fine.beads.length === kept, `${fine.beads.length} of ${kept}`);

  // The clamp that did not work, kept so the reason stays visible.
  check('the obvious clamp really is NaN-transparent',
    Number.isNaN(Math.max(0, Math.min(191, Math.round(NaN)))),
    'which is why the sampler tests Number.isFinite first');
}

console.log('');
const failed = checks.filter(c => !c.ok);
console.log(`${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
