

import { SPLAT_KERNELS } from './fluid/splats';
import { GAP_KERNELS } from './fluid/gap';
import { PHASE_KERNELS } from './fluid/phase';
import { PHASE_FORCE_KERNELS } from './fluid/phaseForces';
import { LABYRINTH_KERNELS } from './fluid/labyrinth';
import { PRESSURE_KERNELS } from './fluid/pressure';
import { CARRY_KERNELS } from './fluid/carry';
import { FORCE_KERNELS } from './fluid/forces';
import { OIL_KERNELS } from './fluid/oil';
import { CAPILLARY_KERNELS } from './fluid/capillary';
import { DYE_KERNELS } from './fluid/dye';
import { GRID_FILTER_KERNELS } from './fluid/gridFilter';
import { REACTION_KERNELS } from './fluid/reactions';
import { FIELD_KERNELS } from './fluid/fields';
import { HEAD, NOISE_WGSL, THIN_FACE, W } from './fluid/shared';
import { thinGapKernels } from './thinGap';
import { filmKernels } from './film';
import { slumpKernels } from './slump';
export { SIM_STRUCT, NOISE_WGSL } from './fluid/shared';
export { RIM_SAMPLES, FILM_REACH, FILM_DECAY } from './fluid/capillary';

/**
 * The kernels. Bindings are always: 0 the Sim, 1 the Args, then the textures
 * a pass reads, then the one it writes, then a sampler if it needs one.
 */
export const KERNELS: Record<string, string> = {
  ...SPLAT_KERNELS,
  ...GAP_KERNELS,
  ...PHASE_KERNELS,
  ...PHASE_FORCE_KERNELS,
  ...LABYRINTH_KERNELS,
  ...PRESSURE_KERNELS,
  ...CARRY_KERNELS,
  ...FORCE_KERNELS,
  ...OIL_KERNELS,
  ...CAPILLARY_KERNELS,
  ...DYE_KERNELS,
  ...GRID_FILTER_KERNELS,
  ...REACTION_KERNELS,
  ...FIELD_KERNELS,
  // The plate as a Hele-Shaw cell (PLAN §18a): see wgsl/thinGap.ts.
  ...thinGapKernels(HEAD, W, NOISE_WGSL),
  // A clear film that tears (PLAN §20b): see wgsl/film.ts.
  ...filmKernels(HEAD, W),
  // A drop of ink slumps under its own weight (PLAN 18m): see wgsl/slump.ts.
  ...slumpKernels(HEAD, W),
};

/*
  The carries that run in substeps on a thin gap (carryPlan): the same
  kernels, reading what share of the step each substep is from the plan's
  buffer, bound after everything they already take.
*/
function substepped(name: string): string {
  const src = KERNELS[name];
  const bound = '@group(0) @binding(5) var<storage, read> pr: array<f32>;';
  const moved = 'A.b.y * f32(n)';
  if (!src.includes(bound) || src.split(moved).length !== 2) throw new Error(`${name} cannot be substepped: its pressure binding or its one displacement moved`);
  return src
    .replace(bound, `${bound}\n@group(0) @binding(6) var<storage, read> sub: array<f32>;`)
    .replace(moved, 'A.b.y * sub[0] * f32(n)');
}

/*
  The same carries on a thin gap, through the faces the thin solve made
  conserve liquid (THIN_FACE) in place of faces rebuilt from the cells'
  velocities: `pr` is bound to the solve's own P, and the gap and the
  mobility follow everything the kernel already takes. A.b.w is the rest gap.
*/
function thinFaced(src: string, name: string): string {
  const block = /  let t = vec2i\(e\.y, e\.x\);\n[^]*?  let ve = [^\n]*\n/;
  const last = Math.max(...[...src.matchAll(/@binding\((\d+)\)/g)].map((m) => Number(m[1])));
  const at = src.indexOf('fn flux(');
  if (!block.test(src) || at < 0 || !src.includes('var vel: texture_2d<f32>;') || !src.includes('var<storage, read> pr: array<f32>;')) {
    throw new Error(`${name} cannot take the thin solve's faces: its face velocity, its flux or its bindings moved`);
  }
  const bindings = `@group(0) @binding(${last + 1}) var sq: texture_2d<f32>;\n@group(0) @binding(${last + 2}) var<storage, read> mob: array<f32>;\n`;
  const withFace = src.slice(0, at) + `${THIN_FACE}\n` + src.slice(at);
  return withFace
    .replace(block, '  let ve = thinFaceVel(a, e, n);\n')
    .replace(new RegExp(`(@group\\(0\\) @binding\\(${last}\\)[^\\n]*\\n)`), `$1${bindings}`);
}
/*
  The carries of what the liquid holds, with the air in the cell taking room
  from the liquid (PLAN 15g-8b): each face carries the donor cell's amount per
  unit of *liquid* in it, not per unit of cell.

  What the colour is: an amount per unit of plate, h·C, with C what a unit of
  liquid holds. Where a bubble stands, part of the cell's depth is air, so
  the liquid in it is h·(1 − a) and the amount h·(1 − a)·C, and what a face
  carries out of it is C times the liquid crossing, the amount over the
  cell's liquid. The thin solve's flow is that liquid: the air arriving is a
  source in it (hsDivergence), so the liquid a bubble stands on leaves its
  cells across their faces, and the liquid round the bubble, which the
  source pushes outward and which has no air in it, moves on as one
  incompressible sheet, every amount kept, no ring piled at the rim.

  Divided by the cell rather than the liquid, a cell the air was filling
  kept the share it had left a step, then that share of what was left, and
  so on: a cell covered in four steps kept a third of its colour, and one
  covered in one step of K substeps e⁻¹ of it. What the multiply after it
  (airExclude) then deleted was that third, and what the CPU painted back
  round the rim (depositBubbleRims) was its copy in a mirror frames old.
  Divided by the liquid, a cell the air fills empties exactly as it fills.

  The air is the step's own, the field before it and after it (air.prev and
  air.field), at the share of the step done before this substep: the plan's
  share times the substep's index for the planned carries, or the fraction
  itself in the maze's sixths. A.a.y is how much of the cell the air takes
  (bubbleClear, which scales the air's source in hsDivergence too), 0 for a
  carry the air does not touch, which reads a liquid of exactly 1 and takes
  the plain carry. Where either cell of a face has air the face is first
  order: a near-empty cell's slope points out to the full liquid past the
  rim, and the bound below needs to know exactly what a face brings.

  A donor with air in it hands on its liquid mixed with what comes in. The
  solve gives the air the liquid's mobility (PLAN 18i), so liquid runs
  through a bubble: a whole bubble's middle leaves through the cells round
  it, which are emptying too, and a moving bubble's front (a source) drains
  through it to its back (a sink). In a substep more liquid then crosses a
  cell than it holds, and the plain donor, all it holds over its liquid,
  either hands on more than it has (the floor made 18% more colour than a
  pool had, under a bubble drifting across it, the lab) or, capped at what
  it holds, keeps what came in (a whole bubble kept 10% of its colour under
  it). So a cell hands on C = (its amount + what comes in) / room, room its
  liquid and all the liquid coming in, or all going out where that is more:
  never more than it holds and receives, so nothing is made and nothing
  floored, every amount kept.

  What comes in it counts at the least it can be, so a cell never hands on
  colour it has not received. The neighbour's own C needs its neighbours',
  and theirs, as far as the liquid runs through the air in a substep, which
  is the bubble's width: so a neighbour with air is counted at what it holds
  mixed with what its own neighbours hold over their room (airGive, a pass
  before each substep, writes each cell's 1/room and the shares its faces
  bring in), which is never more than it hands on, since each further ring
  only adds. Two rings deep: the lab's whole bubble keeps 3.3% of the pool's
  colour under it, a moving one 4.8% and a growing one 1.0% (one ring kept
  6.5% and 7.4%), every total to the hundredth of a percent, where main
  deleted 2.6–6.4% of the colour and painted a ring. The rest is the flow
  through the air itself, which a two-phase solve takes away (PLAN 18i).
  Counting what comes in at all it holds over its liquid instead kept 0.3%
  under a whole bubble but made 17% under a moving one, where the floor
  cells' concentrations run high. LIQUID_LEAST, the liquid a cell all air
  still holds (the film wetting the glass), only keeps a room from nothing
  now: nothing divides by it. At 0.02 the two rings kept 3.5% and 5.7%.
*/
const LIQUID_LEAST = 0.005;
/** How much liquid a cell holds at this substep, for the air's carries and airGive. */
function airLiquidAt(frac: string): string {
  return `fn liquidAt(q: vec2i, n: i32) -> f32 {
  if (A.a.y <= 0.0) { return 1.0; }
  let c = clamp(q, vec2i(0), vec2i(n - 1));
  let was = clamp(textureLoad(airWas, c, 0).r, 0.0, 1.0);
  let now = clamp(textureLoad(airNow, c, 0).r, 0.0, 1.0);
  return max(1.0 - A.a.y * mix(was, now, clamp(${frac}, 0.0, 1.0)), ${LIQUID_LEAST.toFixed(4)});
}
`;
}
/** The shares of a cell crossing its faces this substep, for airGive. */
function airFaceShares(share: string): string {
  return `fn airFaceC(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  return clamp(thinFaceVel(a, e, n) * A.b.y * ${share} * f32(n), -0.45, 0.45);
}
// The share of a cell crossing each of a's faces this substep, outward
// positive: east, west, north, south.
fn airFaces(a: vec2i, n: i32) -> vec4f {
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  return vec4f(airFaceC(a, x, n), -airFaceC(a - x, x, n), airFaceC(a, y, n), -airFaceC(a - y, y, n));
}
`;
}
function airLiquid(src: string, name: string, frac: string): string {
  const last = Math.max(...[...src.matchAll(/@binding\((\d+)\)/g)].map((m) => Number(m[1])));
  const outA = /return c \* \((mx\(((?:t, )?)a, n\)) \+ 0\.5 \* \(1\.0 - c\) \* s\);/;
  const outB = /return c \* \((mx\((?:t, )?b, n\)) - 0\.5 \* \(1\.0 \+ c\) \* s\);/;
  const at = src.indexOf('fn flux(');
  if (!outA.test(src) || !outB.test(src) || at < 0 || src.split('fn flux(').length !== 2) {
    throw new Error(`${name} cannot take the air's room: its upwind values or its flux moved`);
  }
  // The pair carry reads either of its two textures through one mx(t, …).
  const t = src.match(outA)![2];
  const tParam = t ? 't: texture_2d<f32>, ' : '';
  const liquid = `@group(0) @binding(${last + 1}) var airWas: texture_2d<f32>;
@group(0) @binding(${last + 2}) var airNow: texture_2d<f32>;
@group(0) @binding(${last + 3}) var airGive: texture_2d<f32>;
@group(0) @binding(${last + 4}) var airIn: texture_2d<f32>;
${airLiquidAt(frac)}
fn giveAt(q: vec2i, n: i32) -> f32 { return textureLoad(airGive, clamp(q, vec2i(0), vec2i(n - 1)), 0).r; }
fn inAt(q: vec2i, n: i32) -> vec4f { return textureLoad(airIn, clamp(q, vec2i(0), vec2i(n - 1)), 0); }
// What q holds mixed with what its neighbours hand it at their least (all
// they hold over their room, airGive), per unit of liquid: the least a
// neighbour q with air hands on this substep. All it holds, first order,
// where it has no air.
fn airLeast(${tParam}q: vec2i, n: i32) -> vec4f {
  if (liquidAt(q, n) >= 1.0) { return mx(${t}q, n); }
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  let i = inAt(q, n);
  return (mx(${t}q, n)
    + i.x * mx(${t}q + x, n) * giveAt(q + x, n) + i.y * mx(${t}q - x, n) * giveAt(q - x, n)
    + i.z * mx(${t}q + y, n) * giveAt(q + y, n) + i.w * mx(${t}q - y, n) * giveAt(q - y, n)) * giveAt(q, n);
}
// What a donor a with air in it hands on per unit of liquid: its own liquid
// mixed with the least that comes in this substep (the comment above).
fn airDonor(${tParam}a: vec2i, n: i32) -> vec4f {
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  let i = inAt(a, n);
  return (mx(${t}a, n)
    + i.x * airLeast(${t}a + x, n) + i.y * airLeast(${t}a - x, n)
    + i.z * airLeast(${t}a + y, n) + i.w * airLeast(${t}a - y, n)) * giveAt(a, n);
}
`;
  return (src.slice(0, at) + liquid + src.slice(at))
    .replace(outA, `let la = liquidAt(a, n);
    let lb = liquidAt(b, n);
    if (la >= 1.0 && lb >= 1.0) { return c * ($1 + 0.5 * (1.0 - c) * s); }
    if (la >= 1.0) { return c * $1; }
    return c * airDonor(${t}a, n);`)
    .replace(outB, `let la = liquidAt(a, n);
  let lb = liquidAt(b, n);
  if (la >= 1.0 && lb >= 1.0) { return c * ($1 - 0.5 * (1.0 + c) * s); }
  if (lb >= 1.0) { return c * $1; }
  return c * airDonor(${t}b, n);`);
}
/*
  airGive: one over what a cell with air in it divides its liquid's amount
  among this substep, its liquid and all that comes in, or all that goes out
  where that is more (the comment above airLiquid). 1 where the cell has no
  air. Run before each substep of an amount's carry while there is air on
  the plate, so a carry reads its neighbours' without rebuilding their faces.
*/
function airGiveKernel(planned: boolean): string {
  const sub = planned ? '@group(0) @binding(5) var<storage, read> sub: array<f32>;\n' : '';
  const b = planned ? 6 : 5;
  return `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var give: texture_storage_2d<r32float, write>;
@group(0) @binding(4) var<storage, read> pr: array<f32>;
${sub}@group(0) @binding(${b}) var sq: texture_2d<f32>;
@group(0) @binding(${b + 1}) var<storage, read> mob: array<f32>;
@group(0) @binding(${b + 2}) var airWas: texture_2d<f32>;
@group(0) @binding(${b + 3}) var airNow: texture_2d<f32>;
@group(0) @binding(${b + 4}) var inflow: texture_storage_2d<rgba32float, write>;
${THIN_FACE}
${airLiquidAt(planned ? 'A.a.x * sub[0]' : 'A.a.x')}
${airFaceShares(planned ? 'sub[0]' : '1.0')}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let l = liquidAt(p, n);
  let o = airFaces(p, n);
  let room = max(l + dot(max(-o, vec4f(0.0)), vec4f(1.0)), dot(max(o, vec4f(0.0)), vec4f(1.0)));
  textureStore(give, p, vec4f(select(1.0 / room, 1.0, l >= 1.0), 0.0, 0.0, 1.0));
  textureStore(inflow, p, max(-o, vec4f(0.0)));
}`;
}
KERNELS.airGiveSub = airGiveKernel(true);
KERNELS.airGiveThin = airGiveKernel(false);
KERNELS.bodyAdvectSub = airLiquid(thinFaced(substepped('bodyAdvect'), 'bodyAdvectSub'), 'bodyAdvectSub', 'A.a.x * sub[0]');

/*
  The colour and the poured liquids' species carried together (PLAN 18d-11a):
  bodyAdvectSub, the same fluxes through the same faces, for two fields in one
  pass. The species rides exactly the flow the colour rides (fluid.ts, the
  species' stage), and carried on its own it cost as much as the colour's own
  carry: read on CI's Mac at 768² in fifteen substeps, 12.36 ms a step against
  12.28 (`npm run thick`). Twice the bytes (it is rgba32f, the colour half
  floats) and the same time, so what each carry pays for is not its field but
  the face: thinFaceVel reads the velocity, the gap and the mobility on both
  sides and the solve's P across three faces, a dozen loads for every one of
  the four faces of every cell, in every substep, before a single amount
  moves. Here each face's Courant number is found once and moves both fields.

  Nothing about either carry changes: the same expression in the same order
  for the Courant number, the same limiter, the same floor, each field into
  its own format (the colour's DYE_FORMAT, the species' rgba32float). `npm
  run thick` carries a stirred plate both ways and asks for the same fields.
*/
KERNELS.bodyAdvectPairSub = airLiquid(`${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
@group(0) @binding(6) var<storage, read> sub: array<f32>;
@group(0) @binding(7) var sq: texture_2d<f32>;
@group(0) @binding(8) var<storage, read> mob: array<f32>;
@group(0) @binding(9) var src2: texture_2d<f32>;
@group(0) @binding(10) var dst2: texture_storage_2d<rgba32float, write>;
${THIN_FACE}
fn mm(a: vec4f, b: vec4f) -> vec4f {
  return select(vec4f(0.0), select(max(a, b), min(a, b), a > vec4f(0.0)), a * b > vec4f(0.0));
}
// The share of a cell crossing the face a → a + e this substep; nothing through the grid's wall.
fn courant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  let ve = thinFaceVel(a, e, n);
  return clamp(ve * A.b.y * sub[0] * f32(n), -0.45, 0.45);
}
fn mx(t: texture_2d<f32>, p: vec2i, n: i32) -> vec4f { return textureLoad(t, clamp(p, vec2i(0), vec2i(n - 1)), 0); }
// bodyAdvect's flux, upwind and limited, for a face whose Courant number is c.
fn flux(t: texture_2d<f32>, a: vec2i, e: vec2i, c: f32, n: i32) -> vec4f {
  let b = a + e;
  if (c >= 0.0) {
    let s = mm(mx(t, a, n) - mx(t, a - e, n), mx(t, b, n) - mx(t, a, n));
    return c * (mx(t, a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(mx(t, b, n) - mx(t, a, n), mx(t, b + e, n) - mx(t, b, n));
  return c * (mx(t, b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let x = vec2i(1, 0);
  let y = vec2i(0, 1);
  let ce = courant(p, x, n);
  let cw = courant(p - x, x, n);
  let cn = courant(p, y, n);
  let cs = courant(p - y, y, n);
  let d = flux(src, p, x, ce, n) - flux(src, p - x, x, cw, n) + flux(src, p, y, cn, n) - flux(src, p - y, y, cs, n);
  textureStore(dst, p, max(textureLoad(src, p, 0) - d, vec4f(0.0)));
  let d2 = flux(src2, p, x, ce, n) - flux(src2, p - x, x, cw, n) + flux(src2, p, y, cn, n) - flux(src2, p - y, y, cs, n);
  textureStore(dst2, p, max(textureLoad(src2, p, 0) - d2, vec4f(0.0)));
}`, 'bodyAdvectPairSub', 'A.a.x * sub[0]');
KERNELS.mixAdvectSub = thinFaced(substepped('mixAdvect'), 'mixAdvectSub');
KERNELS.bodyAdvectThin = airLiquid(thinFaced(KERNELS.bodyAdvect, 'bodyAdvectThin'), 'bodyAdvectThin', 'A.a.x');

/*
  The ferrofluid's carry on a thin gap in as many substeps as the step's flow
  needs (PLAN 27b-2), as the colour's carries take them (carryPlan, above).

  What was reported: with the deeper, dish-wide kick of PLAN 27b, the
  ferrofluid poured round Classic's middle was drawn into it while the band
  played (`npm run ferrodrift` on the Mac: its mean distance from the middle
  0.308 to 0.273 in the 2.5 s before the check holds the plate, the disc 0.12
  round the middle 0.130 to 0.278). In the lab, six kicks at Classic's
  squeeze pulled the ring from 0.307 to 0.236 of the plate out, the disc from
  0.095 to 0.47, where the old palm's kicks moved it 0.0005. It is the bug
  carryPlan's comment tells for the colour: the glass coming down moves the
  liquid up to 14 cells a step on 256² (the plan's own Courant number, read
  step by step), and the ferrofluid took a fixed six substeps of 0.45 of a
  cell, 2.7 cells a step. So it was left behind by the press and carried in
  all the way by the slower release: out short, back in full, a ratchet to
  the middle every kick. With 33 substeps every step the same six kicks left
  the ring at 0.310, the colour's own ring, carried in its plan, at 0.311.

  So the phase takes the plan's count, never fewer than the six (or a hand's)
  it took before, so a step that needs no more is carried exactly as it was.
  Each substep is phaseAdvect then phaseGrid, which is already a pair: the
  first writes the write field from the read, the second the read from the
  write, so a substep not needed is two dispatches of no workgroups and the
  phase ends where it began. phasePlan writes one indirect dispatch for each
  substep and the share 1/m; the two kernels take their substep's place in
  the step, j of m, from A.a.y and A.a.x.
*/
function sharedOut(src: string, name: string, after: string, binding: number, swap: Record<string, string>): string {
  const bound = `${after}\n@group(0) @binding(${binding}) var<storage, read> psub: array<f32>;`;
  const keys = Object.keys(swap);
  if (!src.includes(after) || keys.some((k) => !src.includes(k)) || src.includes('psub')) throw new Error(`${name} cannot take the phase's plan: its bindings or its substep moved`);
  return src.replace(after, bound).replace(new RegExp(keys.map((k) => k.replaceAll('.', '\\.')).join('|'), 'g'), (m) => swap[m]);
}
KERNELS.phaseAdvectPlan = sharedOut(KERNELS.phaseAdvect, 'phaseAdvectPlan', '@group(0) @binding(10) var stand: texture_2d<f32>;', 11, {
  'A.a.y': '(A.a.y * psub[0])', 'A.a.z': '((A.a.y + 1.0) * psub[0])', 'A.b.y': '(A.b.y * psub[0])',
});
KERNELS.phaseGridPlan = sharedOut(KERNELS.phaseGrid, 'phaseGridPlan', '@group(0) @binding(6) var stand: texture_2d<f32>;', 7, {
  'A.a.x': '((A.a.x + 1.0) * psub[0])',
});
/*
  The phase's substeps: the colour's plan (sub[1], odd), never fewer than
  A.a.x, never more than A.a.y; A.a.z the workgroups across the grid. One
  indirect dispatch a substep, the share in psub.
*/
KERNELS.phasePlan = `${HEAD}
@group(0) @binding(2) var<storage, read> sub: array<f32>;
@group(0) @binding(3) var<storage, read_write> ind: array<u32>;
@group(0) @binding(4) var<storage, read_write> psub: array<f32>;
@compute @workgroup_size(1)
fn main() {
  let m = u32(clamp(max(A.a.x, sub[1]), 1.0, A.a.y));
  let w = u32(A.a.z);
  for (var j = 0u; j < u32(A.a.y); j++) {
    let on = j < m;
    ind[3u * j] = select(0u, w, on);
    ind[3u * j + 1u] = select(0u, w, on);
    ind[3u * j + 2u] = 1u;
  }
  psub[0] = 1.0 / f32(m);
  psub[1] = f32(m);
}`;

/**
 * `kernel`'s answers, kept, with the source each was made from.
 *
 * `kernel` is asked on every dispatch, about five hundred a step a layer, for
 * the source its pipeline is cached by. It made a new string each time, a
 * `replaceAll` over 2 to 10 KB, which the pipeline cache's map then had to
 * flatten and hash again to find a pipeline it already had: half a megabyte of
 * garbage a step at 512², most of what the step allocated (`npm run encode`),
 * and the page's collector stopping it to sweep that up is a hitch on the
 * plate with the GPU idle. The same string every time is hashed once and
 * compared by identity after. The source is kept beside the answer so a
 * kernel whose text changed (a harness that swaps one) is made again rather
 * than served stale.
 */
const formatted = new Map<string, Map<string, { src: string; out: string }>>();

/** A kernel's source with its storage format filled in (WGSL has no format generics). */
export function kernel(name: string, dstFormat: string): string {
  const src = KERNELS[name];
  if (!src) throw new Error(`no such fluid kernel: ${name}`);
  let byFormat = formatted.get(name);
  if (!byFormat) { byFormat = new Map(); formatted.set(name, byFormat); }
  const hit = byFormat.get(dstFormat);
  if (hit && hit.src === src) return hit.out;
  const out = src.replaceAll('DYE_FORMAT', dstFormat);
  byFormat.set(dstFormat, { src, out });
  return out;
}
