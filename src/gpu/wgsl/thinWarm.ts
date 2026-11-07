/**
 * The thin gap's warm start, fitted to the step it starts (PLAN 38r-12):
 * three small kernels the solve runs between hsDivergence and its V-cycles
 * (fluid/passes.ts, thinProject).
 *
 * What was reported. The 2 mm gap (PLAN 38r) turned `npm run encode`'s
 * thin-gap residual red: the solve left 19.6% of its right-hand side
 * unsolved after a step, against 6.4% at 6 mm (the line's bar is main's,
 * taken at 6 mm). The same tree at 6 mm read main's number exactly, so the
 * gap did it.
 *
 * What was measured (scratch probes on the lab's 512² plate, the check's
 * own stir). It is not the operator. The mobility is flat across the plate
 * at both gaps (0.4718 everywhere inside the rim at 2 mm, 0.8894 at 6 mm),
 * and a V-cycle cuts the residual by about the same factor at both (2.5×
 * from the third cycle to the fourth at either gap). It is the first
 * guess. The solve starts from the last step's pressure, and with no
 * V-cycle at all that guess left 2.6 times the right-hand side at 2 mm
 * (0.8 at 6 mm): worse than starting from zero. The physics says why. The
 * flow the stir starts dies on the gap's viscous time, h²/12ν: the drag's
 * kΔt is 0.12 a step at 6 mm and 1.1 at 2 mm, nine times as much (h²), so
 * at 2 mm the flow, and the pressure that keeps it conserving liquid, falls
 * to well under half from one step to the next, and last step's pressure
 * is two to three times too big a guess. The two cycles a step then start
 * from further away than they did, and stop further away. Nearly all of
 * what is left sits in the last few cells inside the open rim, where the
 * dying flow leaves the plate.
 *
 * Why this and not the obvious things. More cycles cost the Mac its frame
 * (a cycle is about thirty dispatches on 512²) and the plan is to cut
 * them (H2c-2). Starting cold throws away the warm start that a steady
 * flow needs (PLAN 18a-12: a press's ring moved 63% of the way cold
 * against 100% warm). Scaling the guess by the drag's own decay, c =
 * 1/(1 + kΔt), would fit a flow left to die and be wrong for one held up
 * by a force (a tipped plate, a magnet, a hand), whose pressure does not
 * fall at all. So the guess is fitted to whichever the plate is doing
 * this step: a·P₁ + a′·P₂, the last two steps' pressures, with the a and
 * a′ that leave the least error in the solve's own energy, ‖x − p‖_A for
 * the answer x of A x = b (the Ritz, or Galerkin, choice: G a = h with
 * G = PᵢᵀAPⱼ and h = Pᵢᵀb, all from this step's b and the solve's own
 * operator, never needing x). A steady flow reads a ≈ 1, a′ ≈ 0 and keeps
 * its warm start; a dying one reads its decay, and the second pressure takes
 * the drift of its shape. The guesses compared are the warm start as it
 * was, the last pressure scaled and the pair, by the energy each leaves
 * (−2a·h + aᵀGa), so the start is never further from the answer, in the
 * energy, than the warm start it replaces.
 *
 * Why the energy and not the residual. The first version took the a that
 * left the least residual ‖b − A p‖. A residual barely sees a smooth error
 * (A of a smooth field is small), so that fit threw away the plate-wide
 * pressure two cycles a step had built up over many steps: `npm run flush`'s
 * glycerine dish, flushed with a quarter of its volume of water, kept 0.805
 * of its glycerine against the volume's 0.750 (0.754 before). The energy
 * weighs a smooth error as the flow does. Its G is summed over faces
 * (energy() below), not as P·(AP) over cells, whose differences nearly
 * cancel on a smooth P in f32 (both read the same here, 0.759).
 *
 * Three dispatches: each of WARM_GROUPS workgroups sums its share of the
 * six dot products, one workgroup adds those and writes the two
 * coefficients, and the pressure is fitted (and P₁ kept as the next step's
 * P₂ in the same pass). AP is taken with hsSums0, the smoother's and
 * hsRestrict0's own neighbour sums, so the operator is the solver's.
 */

/** The workgroups (64 threads each) that sum the warm start's dot products; each thread strides over the grid, so any grid fits under the 65535-workgroup limit. */
export const WARM_GROUPS = 1024;
/** Floats each group leaves in the warm buffer: a spare, ⟨b,P₁⟩, ⟨b,P₂⟩, P₁ᵀAP₁, P₁ᵀAP₂, P₂ᵀAP₂, and two spare. */
export const WARM_STRIDE = 8;
/** Where hsWarmFit leaves the two coefficients, after the groups' sums. */
export const WARM_FIT = WARM_STRIDE * WARM_GROUPS;
/** The least sin² of the angle between P₁ and P₂ in the energy the pair is fitted at; nearer parallel than that, f32 sums cannot tell them apart, and one is fitted alone. */
export const WARM_APART = 1e-3;

export function thinWarmKernels(HEAD: string, COMMON: string, ROWS0: string): Record<string, string> {
  /*
    A workgroup's 64 entries added in a tree. Every thread reaches every
    barrier: nothing above returns early.
  */
  const TREE = /* wgsl */ `
  pa[li] = va;
  pb[li] = vb;
  workgroupBarrier();
  for (var k = 32u; k > 0u; k = k >> 1u) {
    if (li < k) { pa[li] += pa[li + k]; pb[li] += pb[li + k]; }
    workgroupBarrier();
  }`;
  return {
    /*
      The sums over the cells the solve solves (inside the rim and not air:
      a cell held at p = 0, or a dry one, takes no part): b·P₁, b·P₂ and the
      energy's three by faces. Each thread steps through the grid
      WARM_GROUPS·64 cells at a time; each group writes its sums.
    */
    hsWarmDot: `${HEAD}${COMMON}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
@group(0) @binding(5) var<storage, read> p2: array<f32>;
@group(0) @binding(6) var<storage, read_write> warm: array<f32>;
/*
  The energy's sums by faces, not by cells: Pᵀ·AP summed over cells is each
  cell's P times a sum of differences that nearly cancel on a smooth P, and
  in f32 the cancellation was the sum. Over faces it is Σ M_f ΔP₁ΔP₂, every
  term of one sign for P₁ against itself. Each face between two solved
  cells once (toward +x and +y), and each face to a cell held at the rim's
  zero, whose ΔP is the cell's own P. Off the grid there is no face, as in
  hsSums0; a dry cell's face is zero (hsHarm of a zero mobility).
*/
fn energy(x: i32, y: i32, n: i32, mi: f32, p1: f32, q2: f32) -> vec3f {
  var e = vec3f(0.0);
  var o = array<vec2i, 4>(vec2i(1, 0), vec2i(0, 1), vec2i(-1, 0), vec2i(0, -1));
  for (var k = 0; k < 4; k++) {
    let q = vec2i(x, y) + o[k];
    if (!hsIn(q.x, q.y, n)) { continue; }
    let mn = mob[q.x + q.y * n];
    let f = hsHarm(mi, abs(mn));
    var d = vec2f(0.0);
    if (mn < 0.0) { d = vec2f(p1, q2); }
    else if (k < 2 && mn > 0.0) { let j = hsPacked(q.x, q.y, n); d = vec2f(p1 - pr[j], q2 - p2[j]); }
    e += f * vec3f(d.x * d.x, d.x * d.y, d.y * d.y);
  }
  return e;
}
var<workgroup> pa: array<vec4f, 64>;
var<workgroup> pb: array<vec2f, 64>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32, @builtin(workgroup_id) wg: vec3u) {
  let n = i32(S.n);
  var va = vec4f(0.0);
  var vb = vec2f(0.0);
  for (var i = i32(id.x); i < n * n; i += ${WARM_GROUPS * 64}) {
    let mi = mob[i];
    if (mi <= 0.0) { continue; }
    let x = i % n;
    let y = i / n;
    let p1 = pr[hsPacked(x, y, n)];
    let q2 = p2[hsPacked(x, y, n)];
    let e = energy(x, y, n, mi, p1, q2);
    let b = textureLoad(dv, vec2i(x, y), 0).r;
    va += vec4f(0.0, b * p1, b * q2, e.x);
    vb += e.yz;
  }
${TREE}
  if (li == 0u) {
    let o = ${WARM_STRIDE}u * wg.x;
    warm[o] = pa[0].x; warm[o + 1u] = pa[0].y; warm[o + 2u] = pa[0].z;
    warm[o + 3u] = pa[0].w; warm[o + 4u] = pb[0].x; warm[o + 5u] = pb[0].y;
  }
}`,

    /*
      The groups' sums added, and the coefficients (a, a′) of the guess
      that leaves the least error in the energy, of three: (1, 0), the warm
      start as it was; (h₁/G₁₁, 0), the last pressure scaled; and the
      pair's Ritz fit, G⁻¹h, when the two are apart enough to fit. Each is
      judged by ‖x − p‖²_A less ‖x‖²_A, −2(a h₁ + a′ h₂) + a²G₁₁ + 2aa′G₁₂
      + a′²G₂₂, from the same sums (slot 0, bb, is zero and only shifts
      them all). Nothing to fit (a first step, a cleared plate: G₁₁ is
      zero) or sums that are not numbers keep (1, 0).
    */
    hsWarmFit: `${HEAD}
@group(0) @binding(2) var<storage, read_write> warm: array<f32>;
var<workgroup> pa: array<vec4f, 64>;
var<workgroup> pb: array<vec2f, 64>;
fn left(a: vec2f, bb: f32, h: vec2f, g11: f32, g12: f32, g22: f32) -> f32 {
  return bb - 2.0 * dot(a, h) + a.x * a.x * g11 + 2.0 * a.x * a.y * g12 + a.y * a.y * g22;
}
@compute @workgroup_size(64)
fn main(@builtin(local_invocation_index) li: u32) {
  var va = vec4f(0.0);
  var vb = vec2f(0.0);
  for (var k = li; k < ${WARM_GROUPS}u; k += 64u) {
    let o = ${WARM_STRIDE}u * k;
    va += vec4f(warm[o], warm[o + 1u], warm[o + 2u], warm[o + 3u]);
    vb += vec2f(warm[o + 4u], warm[o + 5u]);
  }
${TREE}
  if (li == 0u) {
    let bb = pa[0].x;
    let h = pa[0].yz;
    let g11 = pa[0].w;
    let g12 = pb[0].x;
    let g22 = pb[0].y;
    var best = vec2f(1.0, 0.0);
    let sane = abs(bb) < 1e30 && abs(h.x) < 1e30 && abs(h.y) < 1e30 && g11 < 1e30 && abs(g12) < 1e30 && g22 < 1e30;
    if (sane && g11 > 0.0) {
      var least = left(best, bb, h, g11, g12, g22);
      let one = vec2f(h.x / g11, 0.0);
      let l1 = left(one, bb, h, g11, g12, g22);
      if (l1 < least) { best = one; least = l1; }
      let det = g11 * g22 - g12 * g12;
      if (g22 > 0.0 && det > ${WARM_APART} * g11 * g22) {
        let two = vec2f(h.x * g22 - h.y * g12, h.y * g11 - h.x * g12) / det;
        let l2 = left(two, bb, h, g11, g12, g22);
        if (abs(two.x) < 1e6 && abs(two.y) < 1e6 && l2 < least) { best = two; }
      }
    }
    warm[${WARM_FIT}u] = best.x;
    warm[${WARM_FIT}u + 1u] = best.y;
  }
}`,

    /*
      The guess laid in, both packed planes, and this step's P₁ kept as the
      next step's P₂ in the same pass. The rim's cells hold zero in both, and
      zero they stay.
    */
    hsWarmScale: `${HEAD}
@group(0) @binding(2) var<storage, read_write> pr: array<f32>;
@group(0) @binding(3) var<storage, read_write> p2: array<f32>;
@group(0) @binding(4) var<storage, read> warm: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let i = i32(id.x);
  if (i >= n * n) { return; }
  let p1 = pr[i];
  pr[i] = warm[${WARM_FIT}u] * p1 + warm[${WARM_FIT}u + 1u] * p2[i];
  p2[i] = p1;
}`,
  };
}
