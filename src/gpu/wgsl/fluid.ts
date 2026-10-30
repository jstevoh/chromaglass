

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
KERNELS.bodyAdvectSub = thinFaced(substepped('bodyAdvect'), 'bodyAdvectSub');

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
KERNELS.bodyAdvectPairSub = `${HEAD}
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
}`;
KERNELS.mixAdvectSub = thinFaced(substepped('mixAdvect'), 'mixAdvectSub');
KERNELS.bodyAdvectThin = thinFaced(KERNELS.bodyAdvect, 'bodyAdvectThin');

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
