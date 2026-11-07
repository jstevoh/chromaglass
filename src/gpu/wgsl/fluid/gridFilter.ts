/**
 * The grid filter: the curvature, limit and damping passes that take the
 * grid's own pattern out of the dye.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';
import { OPEN_RIM } from '../../../lib/turntable';

export const GRID_FILTER_KERNELS: Record<string, string> = {
  /*
    Take the grid's own pattern out of the dye, and nothing else.

    What was reported: on Red Cabbage at 2.8x, a fine blue and white lattice
    over the violet. The screenshot's spectrum is periods of 10 to 15 px at
    45° and 135°, ±15°: at 2.8x on a 768 grid, a checkerboard, every other
    cell up and every other down, seen along its diagonal. The liquid makes
    patterns at any angle; only the grid makes one locked to its diagonals.

    Nothing in the dye's step removes that pattern once it is there. The
    diffusion would (Jacobi takes about 8a/(1+8a) of it a step), but a quarter of
    the looks have none. MacCormack takes 2d² of it for a step of d cells,
    and Red Cabbage moves about a two-thousandth of a cell a step. So the
    little the presses and the wide-stencil projection leave at grid scale
    stays, and slowly grows (1.3e-5 to 3.0e-5 over a thousand pressed steps
    at 768 in the lab). On the plate that is nothing. The closeup stretches
    thin dye's contrast about ten times (film level and gain, then the gooey
    contrast), and there it is.

    Not a blur. A blur would take the checkerboard and, with it, every hard
    edge Red Cabbage keeps by having no diffusion. This is

        f' = f - s · K(f),   K = k ⊗ k / 256,   k = [1 -4 6 -4 1]

    whose response to a wave (kx, ky) is s · ((1 - cos kx)/2)² ((1 - cos ky)/2)².
    That is s at the checkerboard (π, π) and falls off as the eighth power
    toward anything smoother; and it is exactly zero for anything that
    varies along one axis only, since k sums to zero across it, so a line or
    edge along the grid is not touched at all. A diagonal ripple four cells
    across loses s/16 a step, six cells across s/256. The kernel sums to
    zero, so dye is moved, not made or lost.

    And the result is held to the range of its eight neighbours and itself,
    taking the clamp's excess back across the 7×7 neighbourhood around the
    stencil so that a drop's rim does not manufacture dye (PLAN 18m-5).
    A filter this sharp rings like any other: a hard diagonal edge is a
    staircase, the staircase is a checkerboard one cell wide, and taking it
    out left a ring past the edge 12.9% of its height after five seconds
    (`npm run grating`'s disc with the clamp taken out; the Gibbs overshoot
    of any sharp cutoff). Clamping each cell after the filter removed the
    ring (0.003% of the edge) and only drifted 1.47 ppm/s on a disc sitting on
    a 0.5 base, where the positive and negative rings nearly cancelled. At a
    drop's rim on an empty plate, they do not: outside the drop the dye is
    zero, so the cell clamp cut off the negative undershoot outside the rim
    while keeping the positive lobe inside it. In the lab
    (`scripts/slump.mjs`), a glycerine drop with `dampGrid` on gained 0.93% of
    its dye in 2 s (231.13 → 233.27) and 3.20% in 20 s (231.13 → 238.53), and
    its front moved 0.72 mm in 20 s (3.94 → 4.66 mm, against 3.94 → 4.50 mm
    with the filter off, and 3.94 → 4.13 mm at 2 s before the slump itself had
    moved a cell).

    Why this takes the clamp's excess back from the neighbours around the
    stencil rather than limiting third-difference face fluxes Fx = δx³δy⁴f,
    Fy = δx⁴δy³f face by face: because K(f) = δx⁴δy⁴f / 256 is a fourth
    difference, its face fluxes are third differences, which on a smooth wave
    enter one face of a cell and leave the opposite face in nearly equal
    measure. Scaling the two faces by different Zalesak factors min(R_p, R_q)
    whenever one neighbour hits its local bound breaks the cancellation
    F_{i+½} - F_{i-½} and traps that through-flux inside the cell as grid-scale
    ripple; on `npm run grating`'s pressed plate, face-limited FCT read 68.7%
    to 69.0% (over the 68% bar, and higher than both the unclamped filter at
    67.1% and the cell clamp at 64.9%). Evaluating the fourth difference
    u = -s·K(f) first (with half-sample reflection `reflect1` across the grid
    walls so the stencil matrix is symmetric with zero column sums while
    1-cell lines and rows up to the walls stay at 0.000%) keeps that
    cancellation intact everywhere. With c = clamp(f + u, lo, hi), the clamp's
    excess at each cell is e = c - (f + u), which is zero wherever the clamp
    did not bite and whose room to absorb a neighbour's excess without leaving
    [lo, hi] is w = min(c - lo, hi - c) (mutually exclusive with e ≠ 0, since
    c = lo or hi whenever the clamp bites). `dampGridCurv` writes w (or -1
    where e ≠ 0); `dampGridLimit` exits immediately where e = 0 and at clamped
    cells divides -e across the 7×7 neighbourhood (`-3..3`) in proportion to w
    (β_q = -e_q / ∑w); and `dampGrid` adds w_p · ∑β_q over the same 7×7
    window to c_p, clamped to [lo_p, hi_p]. The excess return uses 7×7 (`-3..3`)
    rather than 5×5 (`-2..2`) because the 5×5 filter clamps a two-cell-wide
    band at a steep drop rim (`room = -1`), so a 5×5 return window leaves the
    inner rim cell short of unclamped neighbours (+0.028% at 20 s on the
    glycerine drop vs +0.000% with 7×7). Where ∑w > 0 and w_p · ∑β_q stays
    within each receptor's room w_p, the returned excess cancels e_q; the
    pressed plate reads 66.0% and the disc halo drops from 2.4% to 0.4%.

    Why `hi` is gated on the four opposite neighbour pairs (axes and diagonals)
    with `6.0 * (here - mn) > mx - here`: this is a one-sided (`hi` gated, `lo`
    not), hand-picked numerical shortcut rather than contact-line physics.
    The plain 3×3 maximum (`hi = max(hi, mx)`) blocks the distance-2 overshoot
    ring (where k_{±2} = +1 makes -s·K(f) negative outside a positive step),
    but at distance 1 from a step the kernel weight is k_{±1} = -4, so -s·K(f)
    has a positive +4s/256 weight that diffuses dye one cell outward into a
    dry toe whenever `hi` takes the wet neighbour's `mx` (with `hi = max(hi, mx)`,
    the glycerine drop's 2% front creeps to 4.13 mm at 2 s and 4.66 mm at
    20 s even though its dye total holds to -0.0003%). On each opposite pair
    (a, b) with mn = min(a, b) and mx = max(a, b), a trough (mn > here) rises
    to mx, while a monotone cell (mn ≤ here ≤ mx) only takes mx when
    `6.0 * (here - mn) > mx - here`. The literal `6.0` matches the central
    stencil weight k_0 = 6 of k = [1, -4, 6, -4, 1], requiring the foot
    `here - mn` above the low neighbour to be at least a sixth of the jump
    `mx - here` into the high neighbour. Across factors `4.0`, `6.0`, and `8.0`,
    the glycerine drop holds 231.13 (+0.000% at 2 s and 20 s) with its front at
    3.94 mm (2 s) and 4.50 mm (20 s), and `pressed` reads 65.91%, 65.96%, and
    65.95% (bar < 68.0%). The 3×3 neighbour box uses whole-cell reflection
    `mirror1` across the outer walls (`-x` and `2n - 2 - x`) rather than
    `reflect1` (`-1 - x`): on `npm run grating` §4 (`STILL`), `macCormack`
    clamps wall sample coordinates to `1/n`, smoothing the outer texel ring so
    `reflect1(-1) = 0` set `nW = here` (`here - mn = 0`), which tripped the
    one-sided `hi` gate along the wall and made `macCormack` manufacture
    +5.51 ppm/s; with `mirror1` on the 3×3 box, §4 reads +0.42 ppm/s (against
    main's +1.47 ppm/s, bar < 10 ppm/s). `npm run grating` holds it to all of
    this.

    A.a.x is s.
  */
  dampGridCurv: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn pastRim(p: vec2i) -> bool {
  return S.thinGap > 0.5 && length((vec2f(p) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)};
}
fn inDom(q: vec2i) -> bool {
  let n = i32(S.n);
  return q.x >= 0 && q.x < n && q.y >= 0 && q.y < n && !pastRim(q);
}
fn reflect1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -1 - x; }
  if (x >= n) { return 2 * n - 1 - x; }
  return x;
}
fn mirror1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -x; }
  if (x >= n) { return 2 * n - 2 - x; }
  return x;
}
fn loadDom(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(reflect1(q.x, n), reflect1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
fn loadBox(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(mirror1(q.x, n), mirror1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (pastRim(p)) {
    textureStore(dst, p, vec4f(0.0));
    return;
  }
  let here = textureLoad(src, p, 0);
  let k = array<f32, 5>(1.0, -4.0, 6.0, -4.0, 1.0);
  var acc = vec4f(0.0);
  for (var j = -2; j <= 2; j++) {
    let wy = k[j + 2];
    for (var i = -2; i <= 2; i++) {
      acc += (k[i + 2] * wy) * (loadDom(p + vec2i(i, j), here) - here);
    }
  }
  let nW  = loadBox(p + vec2i(-1,  0), here);
  let nE  = loadBox(p + vec2i( 1,  0), here);
  let nS  = loadBox(p + vec2i( 0, -1), here);
  let nN  = loadBox(p + vec2i( 0,  1), here);
  let nSW = loadBox(p + vec2i(-1, -1), here);
  let nNE = loadBox(p + vec2i( 1,  1), here);
  let nNW = loadBox(p + vec2i(-1,  1), here);
  let nSE = loadBox(p + vec2i( 1, -1), here);
  let a0 = array<vec4f, 4>(nW, nS, nSW, nNW);
  let b0 = array<vec4f, 4>(nE, nN, nNE, nSE);
  var lo = here;
  var hi = here;
  for (var m = 0; m < 4; m++) {
    let mn = min(a0[m], b0[m]);
    let mx = max(a0[m], b0[m]);
    let toe = select(here, mx, 6.0 * (here - mn) > mx - here);
    hi = max(hi, select(toe, mx, mn > here));
    lo = min(lo, mn);
  }
  lo = max(lo, vec4f(0.0));
  hi = max(hi, vec4f(0.0));

  let u = -A.a.x * (acc * (1.0 / 256.0));
  let c = clamp(here + u, lo, hi);
  let e = c - (here + u);
  let w = max(vec4f(0.0), min(c - lo, hi - c));
  textureStore(dst, p, select(w, vec4f(-1.0), abs(e) > vec4f(1e-20)));
}`,

  dampGridLimit: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var room: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn pastRim(p: vec2i) -> bool {
  return S.thinGap > 0.5 && length((vec2f(p) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)};
}
fn inDom(q: vec2i) -> bool {
  let n = i32(S.n);
  return q.x >= 0 && q.x < n && q.y >= 0 && q.y < n && !pastRim(q);
}
fn reflect1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -1 - x; }
  if (x >= n) { return 2 * n - 1 - x; }
  return x;
}
fn mirror1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -x; }
  if (x >= n) { return 2 * n - 2 - x; }
  return x;
}
fn loadDom(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(reflect1(q.x, n), reflect1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
fn loadBox(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(mirror1(q.x, n), mirror1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (pastRim(p)) {
    textureStore(dst, p, vec4f(0.0));
    return;
  }
  let r0 = textureLoad(room, p, 0);
  if (all(r0 >= vec4f(0.0))) {
    textureStore(dst, p, vec4f(0.0));
    return;
  }
  let here = textureLoad(src, p, 0);
  let k = array<f32, 5>(1.0, -4.0, 6.0, -4.0, 1.0);
  var acc = vec4f(0.0);
  var sumW = vec4f(0.0);
  for (var j = -2; j <= 2; j++) {
    let wy = k[j + 2];
    for (var i = -2; i <= 2; i++) {
      let q = p + vec2i(i, j);
      acc += (k[i + 2] * wy) * (loadDom(q, here) - here);
    }
  }
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      let q = p + vec2i(i, j);
      if (inDom(q)) {
        sumW += max(vec4f(0.0), textureLoad(room, q, 0));
      }
    }
  }
  let nW  = loadBox(p + vec2i(-1,  0), here);
  let nE  = loadBox(p + vec2i( 1,  0), here);
  let nS  = loadBox(p + vec2i( 0, -1), here);
  let nN  = loadBox(p + vec2i( 0,  1), here);
  let nSW = loadBox(p + vec2i(-1, -1), here);
  let nNE = loadBox(p + vec2i( 1,  1), here);
  let nNW = loadBox(p + vec2i(-1,  1), here);
  let nSE = loadBox(p + vec2i( 1, -1), here);
  let a0 = array<vec4f, 4>(nW, nS, nSW, nNW);
  let b0 = array<vec4f, 4>(nE, nN, nNE, nSE);
  var lo = here;
  var hi = here;
  for (var m = 0; m < 4; m++) {
    let mn = min(a0[m], b0[m]);
    let mx = max(a0[m], b0[m]);
    let toe = select(here, mx, 6.0 * (here - mn) > mx - here);
    hi = max(hi, select(toe, mx, mn > here));
    lo = min(lo, mn);
  }
  lo = max(lo, vec4f(0.0));
  hi = max(hi, vec4f(0.0));

  let u = -A.a.x * (acc * (1.0 / 256.0));
  let c = clamp(here + u, lo, hi);
  let e = c - (here + u);
  let beta = select(vec4f(0.0), -e / max(sumW, vec4f(1e-30)), sumW > vec4f(1e-30));
  textureStore(dst, p, beta);
}`,

  dampGrid: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var room: texture_2d<f32>;
@group(0) @binding(4) var lim: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn pastRim(p: vec2i) -> bool {
  return S.thinGap > 0.5 && length((vec2f(p) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)};
}
fn inDom(q: vec2i) -> bool {
  let n = i32(S.n);
  return q.x >= 0 && q.x < n && q.y >= 0 && q.y < n && !pastRim(q);
}
fn reflect1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -1 - x; }
  if (x >= n) { return 2 * n - 1 - x; }
  return x;
}
fn mirror1(x: i32, n: i32) -> i32 {
  if (x < 0) { return -x; }
  if (x >= n) { return 2 * n - 2 - x; }
  return x;
}
fn loadDom(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(reflect1(q.x, n), reflect1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
fn loadBox(q: vec2i, here: vec4f) -> vec4f {
  let n = i32(S.n);
  let qp = vec2i(mirror1(q.x, n), mirror1(q.y, n));
  if (pastRim(qp)) { return here; }
  return textureLoad(src, qp, 0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let here = textureLoad(src, p, 0);
  if (S.thinGap > 0.5 && length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) {
    textureStore(dst, p, here);
    return;
  }
  let k = array<f32, 5>(1.0, -4.0, 6.0, -4.0, 1.0);
  var acc = vec4f(0.0);
  for (var j = -2; j <= 2; j++) {
    let wy = k[j + 2];
    for (var i = -2; i <= 2; i++) {
      acc += (k[i + 2] * wy) * (loadDom(p + vec2i(i, j), here) - here);
    }
  }
  let nW  = loadBox(p + vec2i(-1,  0), here);
  let nE  = loadBox(p + vec2i( 1,  0), here);
  let nS  = loadBox(p + vec2i( 0, -1), here);
  let nN  = loadBox(p + vec2i( 0,  1), here);
  let nSW = loadBox(p + vec2i(-1, -1), here);
  let nNE = loadBox(p + vec2i( 1,  1), here);
  let nNW = loadBox(p + vec2i(-1,  1), here);
  let nSE = loadBox(p + vec2i( 1, -1), here);
  let a0 = array<vec4f, 4>(nW, nS, nSW, nNW);
  let b0 = array<vec4f, 4>(nE, nN, nNE, nSE);
  var lo = here;
  var hi = here;
  for (var m = 0; m < 4; m++) {
    let mn = min(a0[m], b0[m]);
    let mx = max(a0[m], b0[m]);
    let toe = select(here, mx, 6.0 * (here - mn) > mx - here);
    hi = max(hi, select(toe, mx, mn > here));
    lo = min(lo, mn);
  }
  lo = max(lo, vec4f(0.0));
  hi = max(hi, vec4f(0.0));

  let u = -A.a.x * (acc * (1.0 / 256.0));
  let c = clamp(here + u, lo, hi);
  let w = max(vec4f(0.0), textureLoad(room, p, 0));
  if (all(w == vec4f(0.0))) {
    textureStore(dst, p, c);
    return;
  }
  var sumB = vec4f(0.0);
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      let q = p + vec2i(i, j);
      if (inDom(q)) {
        sumB += textureLoad(lim, q, 0);
      }
    }
  }
  textureStore(dst, p, clamp(c + w * sumB, lo, hi));
}`,
};
