/**
 * The air edge in the thin-gap solve (PLAN 38r-16): the wet fraction `w`
 * per cell (1 liquid, 0 air), its smoothed shape and curvature κ = ∇·n̂,
 * the Laplace capillary boundary jump p_Γ = −2σ cosθ/h + σ κ (and the
 * ground rim's seeded white roughness), the Courant-substepped volume carry,
 * conservative relaxation and isotropic sharpening, dye shedding, and export
 * into the air field for the plate to draw.
 */

import { HEAD, W } from './shared';
import { AIR_LOOK_BOIL } from '../air';
import { DISH_GAP_FIELD_METRES, OPEN_RIM } from '../../../lib/turntable';
import { PLATE_METRES } from '../../fluid/constants';

export const AIR_EDGE_WGSL_KERNELS: Record<string, string> = {
  /** Initialise wet fraction: 1 inside the open rim when starting full, or sub-cell disc for a partial puddle. */
  wetInit: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = length(uvOf(id) - vec2f(0.5));
  if (A.a.x >= ${OPEN_RIM.toFixed(2)} - 1e-4) {
    textureStore(dst, vec2i(id.xy), vec4f(select(0.0, 1.0, d < A.a.x), 0.0, 0.0, 0.0));
    return;
  }
  let dCells = length((vec2f(id.xy) + 0.5) - 0.5 * S.n);
  let rCells = A.a.x * S.n;
  textureStore(dst, vec2i(id.xy), vec4f(clamp(0.5 + rCells - dCells, 0.0, 1.0), 0.0, 0.0, 0.0));
}`,

  /** Snapshot the gap field before hsDivergence updates hsGap. A.a.x > 0.5 copies squeeze instead of prevGap. */
  wetGapInit: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> prevGap: array<f32>;
@group(0) @binding(4) var<storage, read_write> gapSeen: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let k = q.x + q.y * i32(S.n);
  gapSeen[k] = select(prevGap[k], textureLoad(sq, q, 0).r, A.a.x > 0.5);
}`,

  /** Update wetGapSeen after advection completes. */
  wetGapSeen: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> gapSeen: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  gapSeen[q.x + q.y * i32(S.n)] = textureLoad(sq, q, 0).r;
}`,

  /**
   * 5×5 binomial blur [1 4 6 4 1]^2 / 256 of the wet field for smooth
   * interface normals and curvature κ. Outside the open rim is read as
   * 0 when air may enter (A.a.x > 0.5) and 1 while the bead floods it.
   */
  wetSmooth: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn onRim(q: vec2i) -> bool { return length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn wAt(q: vec2i, n: i32) -> f32 {
  if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n || onRim(q)) {
    return select(1.0, 0.0, A.a.x > 0.5);
  }
  return clamp(textureLoad(src, q, 0).r, 0.0, 1.0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let bw = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);
  var sum = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      sum += bw[i + 2] * bw[j + 2] * wAt(p + vec2i(i, j), n);
    }
  }
  textureStore(dst, p, vec4f(sum / 256.0, 0.0, 0.0, 0.0));
}`,

  /**
   * Mark air cells in hsMob (negative mobility, Saffman-Taylor 1/55 air
   * viscosity ratio -> 55x higher mobility magnitude so harmonic face
   * conductance ~2*M_liq sits at the half-cell interface), zero u* in air
   * cells, and compute the liquid-side interface jump:
   *   p_Γ = −2σ cosθ / h + σ κ,   κ = ∇·n̂,   n̂ pointing OUT of the liquid,
   * plus zero-mean white per-cell roughness seeded by airSeed at the ground rim.
   *
   * A.a = [sigma, cosTheta, paToSol, rimIsAir]
   * A.b = [airSeed, roughPa, 0, 0]
   */
  wetPrep: `${HEAD}
@group(0) @binding(2) var wet: texture_2d<f32>;
@group(0) @binding(3) var wetSoft: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var vel: texture_2d<f32>;
@group(0) @binding(6) var dstVel: texture_storage_2d<rgba16float, write>;
@group(0) @binding(7) var<storage, read_write> mob: array<f32>;
@group(0) @binding(8) var<storage, read_write> wetJump: array<f32>;
fn wsAt(p: vec2i, n: i32) -> f32 {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) {
    return select(1.0, 0.0, A.a.w > 0.5);
  }
  return textureLoad(wetSoft, p, 0).r;
}
// Outward unit normal n̂ = -∇w / |∇w| pointing from liquid into air.
fn outNrm(p: vec2i, n: i32) -> vec2f {
  let g = 0.5 * vec2f(wsAt(p + vec2i(1, 0), n) - wsAt(p - vec2i(1, 0), n),
                      wsAt(p + vec2i(0, 1), n) - wsAt(p - vec2i(0, 1), n));
  return -g / sqrt(dot(g, g) + 0.0004);
}
// Deterministic per-cell white noise in [-0.5, 0.5) with no spatial wavelength.
fn whiteRim(q: vec2i, seed: u32) -> f32 {
  var h = u32(q.x) * 374761393u + u32(q.y) * 668265263u + seed * 1442695041u + 1013904223u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return f32(h & 0xffffffu) / 16777216.0 - 0.5;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let n = i32(S.n);
  let idx = q.x + q.y * n;
  let w = textureLoad(wet, q, 0).r;
  let v = textureLoad(vel, q, 0);
  let isRim = length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)};
  let rimAir = A.a.w > 0.5;
  let isAir = (rimAir && isRim) || (!isRim && w < 0.5);
  let m0 = mob[idx];
  if (isAir) {
    textureStore(dstVel, q, vec4f(0.0, 0.0, v.z, v.w));
    if (m0 != 0.0) {
      mob[idx] = -55.0 * max(abs(m0), 1e-6);
    }
    if (isRim && rimAir) {
      let seed = u32(max(A.b.x, 0.0));
      wetJump[idx] = 1.20 * A.b.y * A.a.z * whiteRim(q, seed);
    } else {
      wetJump[idx] = 0.0;
    }
    return;
  }
  textureStore(dstVel, q, v);
  if (isRim) {
    wetJump[idx] = 0.0;
    return;
  }
  if (m0 != 0.0) { mob[idx] = abs(m0); }
  let kappaCell = 0.5 * ((outNrm(q + vec2i(1, 0), n).x - outNrm(q - vec2i(1, 0), n).x)
                       + (outNrm(q + vec2i(0, 1), n).y - outNrm(q - vec2i(0, 1), n).y));
  let kappaPhys = kappaCell * S.n / ${PLATE_METRES};
  let hM = max(textureLoad(sq, q, 0).r, 0.004) * ${DISH_GAP_FIELD_METRES};
  let pGammaPa = -2.0 * A.a.x * A.a.y / hM + A.a.x * kappaPhys;
  var rimOffNoise = 0.0;
  if (rimAir && (length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)} - 1.5 / S.n || q.x == 0 || q.y == 0 || q.x == n - 1 || q.y == n - 1)) {
    let seed = u32(max(A.b.x, 0.0));
    rimOffNoise = 1.20 * A.b.y * whiteRim(q, seed + 17u);
  }
  wetJump[idx] = (pGammaPa + rimOffNoise) * A.a.z;
}`,

  /** Peak Courant number across interior & rim air-liquid faces for wet advection substeps. */
  wetCourant: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read_write> most: array<atomic<u32>>;
@group(0) @binding(5) var sq: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> mob: array<f32>;
@group(0) @binding(7) var<storage, read> wetJump: array<f32>;
fn tfIn(q: vec2i, n: i32) -> bool { return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n; }
fn tfP(q: vec2i, n: i32) -> f32 {
  if (mob[q.x + q.y * n] < 0.0) { return 0.0; }
  let half = n / 2;
  return pr[((q.x + q.y) & 1) * n * half + q.y * half + (q.x >> 1)];
}
fn tfFace(q: vec2i, e: vec2i, n: i32) -> f32 {
  let b = q + e;
  let qIn = tfIn(q, n);
  let bIn = tfIn(b, n);
  if (!qIn && !bIn) { return 0.0; }
  if (!qIn || !bIn) {
    if (arrayLength(&wetJump) < u32(n * n)) { return 0.0; }
    let inC = select(b, q, qIn);
    let mIn = mob[inC.x + inC.y * n];
    if (mIn < 0.0) { return 0.0; }
    let f = 2.0 * mIn * (55.0 * mIn) / max(56.0 * mIn, 1e-20);
    let signOut = select(-1.0, 1.0, qIn);
    return f * signOut * (wetJump[inC.x + inC.y * n] - tfP(inC, n));
  }
  let ma = mob[q.x + q.y * n];
  let mb = mob[b.x + b.y * n];
  let m = 2.0 * abs(ma) * abs(mb) / max(abs(ma) + abs(mb), 1e-20);
  var jump = 0.0;
  if (arrayLength(&wetJump) >= u32(n * n) && (ma < 0.0) != (mb < 0.0)) {
    jump = select(-1.0, 1.0, ma >= 0.0) * (wetJump[q.x + q.y * n] + wetJump[b.x + b.y * n]);
  }
  return m * (tfP(b, n) - tfP(q, n) + jump);
}
fn tfGap(q: vec2i) -> f32 { return max(textureLoad(sq, q, 0).r, 0.004) / A.b.w; }
fn thinFaceVel(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  let aIn = tfIn(a, n);
  let bIn = tfIn(b, n);
  if (!aIn && !bIn) { return 0.0; }
  if (aIn && mob[a.x + a.y * n] == 0.0) { return 0.0; }
  if (bIn && mob[b.x + b.y * n] == 0.0) { return 0.0; }
  let ha = tfGap(clamp(a, vec2i(0), vec2i(n - 1)));
  let hb = tfGap(clamp(b, vec2i(0), vec2i(n - 1)));
  let ua = select(0.0, dot(textureLoad(vel, a, 0).xy, vec2f(e)) * ha, aIn);
  let ub = select(0.0, dot(textureLoad(vel, b, 0).xy, vec2f(e)) * hb, bIn);
  var face = 0.5 * (ua + ub)
           + 0.25 * f32(n) * (tfFace(a - e, e, n) - 2.0 * tfFace(a, e, n) + tfFace(b, e, n));
  if (!aIn || !bIn) { face -= 0.25 * f32(n) * tfFace(a, e, n); }
  return face / (0.5 * (ha + hb));
}
var<workgroup> wgMost: atomic<u32>;
fn onRim(q: vec2i, n: i32) -> bool { return length((vec2f(q) + 0.5) / f32(n) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn faceCourant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (onRim(a, n) && onRim(b, n)) { return 0.0; }
  return abs(thinFaceVel(a, e, n) * A.b.y * f32(n));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&wgMost, 0u); }
  workgroupBarrier();
  if (inGrid(id)) {
    let p = vec2i(id.xy);
    let n = i32(S.n);
    var c = 0.0;
    if (p.x + 1 < n) { c = max(c, faceCourant(p, vec2i(1, 0), n)); }
    if (p.y + 1 < n) { c = max(c, faceCourant(p, vec2i(0, 1), n)); }
    if (c > 0.0) { atomicMax(&wgMost, bitcast<u32>(min(c, 1e30))); }
  }
  workgroupBarrier();
  if (li == 0u) { atomicMax(&most[0], atomicLoad(&wgMost)); }
}`,

  /** Plan substep count (1 per pair) so split wetAdvect keeps every face under CARRY_COURANT cells/substep. */
  wetPlan: `${HEAD}
@group(0) @binding(2) var<storage, read_write> most: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> ind: array<u32>;
@group(0) @binding(4) var<storage, read_write> sub: array<f32>;
@compute @workgroup_size(1)
fn main() {
  let c = bitcast<f32>(atomicLoad(&most[0]));
  atomicStore(&most[0], 0u);
  let n = u32(clamp(max(ceil(c / A.a.x), A.b.x), 1.0, A.a.w));
  let w = u32(A.a.z);
  for (var k = 0u; k < u32(A.a.w); k++) {
    let on = k < n;
    ind[3u * k] = select(0u, w, on);
    ind[3u * k + 1u] = select(0u, w, on);
    ind[3u * k + 2u] = 1u;
  }
  sub[0] = 1.0 / f32(n);
  sub[1] = f32(n);
  sub[2] = c;
}`,

  /**
   * Volume-conserving directionally split (alternating X/Y, Y/X) transport of the wet fraction:
   *   w_new = (w_old * h_tA − Δ_axis volumeFlux) / h_tB
   * using MC limiting so diagonal and axial fingers see symmetric advection.
   * A.a = [substep k, disp, REST_GAP, rimIsAir], A.b = [rimBeadShare, axisOrder (0 or 1), tFracStart, tFracEnd]
   */
  wetAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
@group(0) @binding(6) var sq: texture_2d<f32>;
@group(0) @binding(7) var<storage, read> gapSeen: array<f32>;
@group(0) @binding(8) var<storage, read> mob: array<f32>;
@group(0) @binding(9) var<storage, read> wetJump: array<f32>;
@group(0) @binding(10) var<storage, read> sub: array<f32>;
fn inside(q: vec2i, n: i32) -> bool { return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n; }
fn onRimC(q: vec2i) -> bool { return length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn rimBoundary(t0: f32, share: f32) -> f32 {
  if (A.a.w <= 0.5) { return 1.0; }
  if (A.b.x <= 0.0) { return 0.0; }
  return clamp((A.b.x - t0) / share, 0.0, 1.0);
}
fn wAt(q: vec2i, n: i32, t0: f32, share: f32) -> f32 {
  if (!inside(q, n)) { return rimBoundary(t0, share); }
  if (onRimC(q)) { return rimBoundary(t0, share); }
  return textureLoad(src, q, 0).r;
}
fn mc(a: f32, b: f32) -> f32 {
  let l = min(min(2.0 * abs(a), 2.0 * abs(b)), 0.5 * abs(a + b));
  return select(0.0, sign(a) * l, a * b > 0.0);
}
fn gapAt(p: vec2i, n: i32, t: f32) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  return mix(max(gapSeen[q.x + q.y * n], 0.004), max(textureLoad(sq, q, 0).r, 0.004), t) / A.a.z;
}
fn thinPAt(q: vec2i, n: i32) -> f32 {
  if (mob[q.x + q.y * n] < 0.0) { return 0.0; }
  let half = n / 2;
  return pr[((q.x + q.y) & 1) * n * half + q.y * half + (q.x >> 1)];
}
fn thinFace(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  let aIn = inside(a, n);
  let bIn = inside(b, n);
  if (!aIn && !bIn) { return 0.0; }
  if (!aIn || !bIn) {
    let inC = select(b, a, aIn);
    let mIn = mob[inC.x + inC.y * n];
    if (mIn < 0.0) { return 0.0; }
    let f = 2.0 * mIn * (55.0 * mIn) / max(56.0 * mIn, 1e-20);
    let signOut = select(-1.0, 1.0, aIn);
    return f * signOut * (wetJump[inC.x + inC.y * n] - thinPAt(inC, n));
  }
  let ma = mob[a.x + a.y * n];
  let mb = mob[b.x + b.y * n];
  let m = 2.0 * abs(ma) * abs(mb) / max(abs(ma) + abs(mb), 1e-20);
  var jump = 0.0;
  if (arrayLength(&wetJump) >= u32(n * n) && (ma < 0.0) != (mb < 0.0)) {
    jump = select(-1.0, 1.0, ma >= 0.0) * (wetJump[a.x + a.y * n] + wetJump[b.x + b.y * n]);
  }
  return m * (thinPAt(b, n) - thinPAt(a, n) + jump);
}
fn cellFlux(a: vec2i, e: vec2i, n: i32) -> f32 {
  if (!inside(a, n)) { return 0.0; }
  return dot(textureLoad(vel, a, 0).xy, vec2f(e)) * max(textureLoad(sq, a, 0).r, 0.004) / A.a.z;
}
fn volumeFlux(a: vec2i, e: vec2i, n: i32, t0: f32, tH: f32, share: f32) -> f32 {
  let b = a + e;
  let aIn = inside(a, n);
  let bIn = inside(b, n);
  if (!aIn && !bIn) { return 0.0; }
  if ((!aIn || !bIn) && A.a.w <= 0.5) { return 0.0; }
  if (aIn && mob[a.x + a.y * n] == 0.0) { return 0.0; }
  if (bIn && mob[b.x + b.y * n] == 0.0) { return 0.0; }
  var face = 0.5 * (cellFlux(a, e, n) + cellFlux(b, e, n))
           + 0.25 * f32(n) * (thinFace(a - e, e, n) - 2.0 * thinFace(a, e, n) + thinFace(b, e, n));
  if (!aIn || !bIn) { face -= 0.25 * f32(n) * thinFace(a, e, n); }
  let h = 0.5 * (gapAt(a, n, tH) + gapAt(b, n, tH));
  let c = clamp(face * A.a.y * share * f32(n) / h, -0.45, 0.45);
  var val = 0.0;
  if (c >= 0.0) {
    val = wAt(a, n, t0, share) + 0.5 * (1.0 - c) * mc(wAt(a, n, t0, share) - wAt(a - e, n, t0, share), wAt(b, n, t0, share) - wAt(a, n, t0, share));
  } else {
    val = wAt(b, n, t0, share) - 0.5 * (1.0 + c) * mc(wAt(b, n, t0, share) - wAt(a, n, t0, share), wAt(b + e, n, t0, share) - wAt(b, n, t0, share));
  }
  return h * c * val;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let share = sub[0];
  let t0 = A.a.x * share;
  let tA = (A.a.x + A.b.z) * share;
  let tB = (A.a.x + A.b.w) * share;
  if (onRimC(p)) {
    textureStore(dst, p, vec4f(rimBoundary(t0, share), 0.0, 0.0, 0.0));
    return;
  }
  let e = select(vec2i(0, 1), vec2i(1, 0), A.b.y < 0.5);
  let d = volumeFlux(p, e, n, t0, tA, share) - volumeFlux(p - e, e, n, t0, tA, share);
  let val = (wAt(p, n, t0, share) * gapAt(p, n, tA) - d) / gapAt(p, n, tB);
  textureStore(dst, p, select(vec4f(0.0), vec4f(val, 0.0, 0.0, 0.0), finite1(val)));
}`,

  /** Conservative relaxation of overshoots past [0, 1] inside the open rim. */
  wetRelax: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
fn gapH(p: vec2i) -> f32 { return max(textureLoad(sq, p, 0).r, 0.004); }
fn onRimR(q: vec2i) -> bool { return length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn badVol(p: vec2i, n: i32) -> vec2f {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n || onRimR(p)) { return vec2f(0.0, 0.0); }
  let c = textureLoad(src, p, 0).r;
  let ex = max(c - 1.0, 0.0) + min(c, 0.0);
  return vec2f(ex * gapH(p), 1.0);
}
fn pair(a: f32, b: vec2f) -> f32 { return select(0.0, 0.24 * (a - b.x), b.y > 0.5); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  if (onRimR(p)) {
    textureStore(dst, p, textureLoad(src, p, 0));
    return;
  }
  let ep = badVol(p, n).x;
  let outV = pair(ep, badVol(p + vec2i(1, 0), n)) + pair(ep, badVol(p - vec2i(1, 0), n))
           + pair(ep, badVol(p + vec2i(0, 1), n)) + pair(ep, badVol(p - vec2i(0, 1), n));
  let val = textureLoad(src, p, 0).r - outV / gapH(p);
  textureStore(dst, p, select(vec4f(0.0), vec4f(val, 0.0, 0.0, 0.0), finite1(val)));
}`,

  /**
   * Isotropic 8-neighbour volume-conserving interface sharpening (4:1 axial
   * to diagonal weight ratio from the isotropic 9-point stencil) without
   * tangential diffusion so σ κ controls the Saffman-Taylor cutoff cleanly.
   */
  wetSharpen: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
fn raw(p: vec2i) -> f32 { return textureLoad(src, p, 0).r; }
fn gapH(p: vec2i) -> f32 { return max(textureLoad(sq, p, 0).r, 0.004); }
fn onRimS(q: vec2i) -> bool { return length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn mean3(p: vec2i, n: i32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let w = f32((2 - abs(i)) * (2 - abs(j)));
    t += w * clamp(raw(clamp(p + vec2i(i, j), vec2i(0), vec2i(n - 1))), 0.0, 1.0);
  } }
  return t / 16.0;
}
fn exVol(p: vec2i, q: vec2i, sp: f32, wt: f32, n: i32) -> f32 {
  if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n || onRimS(q)) { return 0.0; }
  let a = clamp(raw(p), 0.0, 1.0);
  let b = clamp(raw(q), 0.0, 1.0);
  let sqMean = mean3(q, n);
  let lo = min(a, b);
  let hi = max(a, b);
  let amt = wt * clamp(A.a.x, 0.0, 1.0) * min(1.0, 1.5 * abs(sp - sqMean)) * min(lo, 1.0 - hi) * min(gapH(p), gapH(q));
  return select(-amt, amt, sp > sqMean);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let c = raw(p);
  if (onRimS(p)) { textureStore(dst, p, vec4f(c, 0.0, 0.0, 0.0)); return; }
  let sp = mean3(p, n);
  var dv = 0.0;
  let offs = array<vec2i, 8>(
    vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1),
    vec2i(1, 1), vec2i(-1, 1), vec2i(1, -1), vec2i(-1, -1)
  );
  for (var k = 0; k < 8; k++) {
    let wt = select(0.05, 0.20, k < 4);
    dv += exVol(p, p + offs[k], sp, wt, n);
  }
  let outV = c + dv / gapH(p);
  textureStore(dst, p, select(vec4f(0.0), vec4f(outV, 0.0, 0.0, 0.0), finite1(outV)));
}`,

  /** Conservative shed of residual dye from dry air-edge cells (w < 0.02) into liquid neighbours. */
  wetShedDye: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var wet: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
const NB = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
fn onRimD(q: vec2i) -> bool { return length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}; }
fn inside(q: vec2i, n: i32) -> bool { return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n && !onRimD(q); }
fn dry(q: vec2i, n: i32) -> bool { return inside(q, n) && textureLoad(wet, q, 0).r < 0.02; }
fn wetBeside(q: vec2i, n: i32) -> f32 {
  var c = 0.0;
  for (var k = 0; k < 4; k++) { let r = q + NB[k]; if (inside(r, n) && !dry(r, n)) { c += 1.0; } }
  return c;
}
fn relaysBeside(q: vec2i, n: i32) -> f32 {
  var c = 0.0;
  for (var k = 0; k < 4; k++) { let r = q + NB[k]; if (dry(r, n) && wetBeside(r, n) > 0.0) { c += 1.0; } }
  return c;
}
fn shedOf(d: vec2i, n: i32) -> vec4f {
  let w = wetBeside(d, n);
  if (w > 0.0) { return textureLoad(src, d, 0) / w; }
  let r = relaysBeside(d, n);
  return select(vec4f(0.0), textureLoad(src, d, 0) / r, r > 0.0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  var v = textureLoad(src, p, 0);
  if (dry(p, n)) {
    let w = wetBeside(p, n);
    v -= shedOf(p, n) * select(relaysBeside(p, n), w, w > 0.0);
    if (w > 0.0) {
      for (var k = 0; k < 4; k++) { let q = p + NB[k]; if (dry(q, n) && wetBeside(q, n) == 0.0) { v += shedOf(q, n); } }
    }
  } else if (inside(p, n)) {
    for (var k = 0; k < 4; k++) { let q = p + NB[k]; if (dry(q, n) && wetBeside(q, n) > 0.0) { v += shedOf(q, n); } }
  }
  textureStore(dst, p, select(vec4f(0.0), v, finite4(v)));
}`,

  /** Composite the air edge (1 - w inside OPEN_RIM) with WebGPUAir for the plate shader. */
  wetToAir: `${HEAD}
@group(0) @binding(2) var wet: texture_2d<f32>;
@group(0) @binding(3) var air: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
fn airAt(p: vec2i, n: i32) -> f32 {
  let c = clamp(p, vec2i(0), vec2i(n - 1));
  if (length((vec2f(c) + 0.5) / f32(n) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) { return 0.0; }
  return clamp(1.0 - textureLoad(wet, c, 0).r, 0.0, 1.0);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let e = select(vec4f(0.0), textureLoad(air, p, 0), A.a.x > 0.5);
  let a = airAt(p, n);
  if (a <= 1e-4 || a <= e.r) {
    textureStore(dst, p, e);
    return;
  }
  let gx = 0.5 * (airAt(p + vec2i(1, 0), n) - airAt(p - vec2i(1, 0), n));
  let gy = 0.5 * (airAt(p + vec2i(0, 1), n) - airAt(p - vec2i(0, 1), n));
  let gl = sqrt(gx * gx + gy * gy);
  let outward = select(vec2f(0.0), vec2f(-gx, -gy) / gl, gl > 1e-5);
  let q = clamp(outward * clamp(1.0 - a, 0.0, 1.0), vec2f(-1.0), vec2f(1.0));
  textureStore(dst, p, vec4f(a, a * (0.5 + 0.5 * q.x), a * (0.5 - 0.5 * q.y), f32(${AIR_LOOK_BOIL})));
}`,
};
