/**
 * The slosh dish on the GPU: two-layer shallow water, oil riding on water
 * (PLAN 18a-13a, 18a-13d). The physics, the scheme and why this scheme are in
 * `src/lib/slosh.ts`, whose `SloshDish` is the same arithmetic in TypeScript;
 * `npm run sloshgpu` steps the two side by side and holds these kernels to it
 * value for value. Read that file first: this one follows its order, kernel by
 * kernel, and says only what is particular to running it here.
 *
 * The state is two 64² rgba32float textures, the water (h − h₀, qx, qy, 0) and
 * the oil (ox, oy, h₁, 0), each in three copies: the step's start U⁰, the first
 * stage's U¹, and the stage being written. One kernel computes a cell's whole
 * update (the four faces' Riemann fluxes and the raft's push) and writes both
 * halves, so a step is two dispatches (Heun's two stages); a face shared by two
 * cells is solved once in each, which on 4096 cells is cheaper than a pass and a
 * texture of faces between them.
 *
 * Why the GPU at all, when the dish is 64² and the plate 384² and up: the oil's
 * share is the plate's mix (`sloshOil` reads it every frame, which on the CPU
 * would be a readback every frame), the plate draws the depth from `D` (18a-13c),
 * and two Riemann solves a face, two stages and seven steps a frame is about ten
 * million flops a frame, nothing here and several milliseconds of the frame
 * loop's thread there.
 *
 * The water's depth is stored as its departure from the rest depth h₀ (`depth`
 * turns it back), for the reason `SloshDish.hd` gives: a float32 depth rounds
 * away the dish's water, a hundred-thousandth of it in ten seconds of a slow
 * creep, and its departure from rest rounds many times finer.
 *
 * Which cells are in the dish is decided in integers, (2i + 1 − n)² + (2j + 1 −
 * n)² ≤ n², the same test the TypeScript makes, so the rim is the same cells in
 * both and not two roundings of a square root.
 */

const HEAD = /* wgsl */ `
struct Slosh {
  // dt, ax, ay, stage (1 or 2)
  a: vec4f,
  // g, r (the oil's density over the water's), the water's ν, the oil's μ (r ν₁)
  b: vec4f,
  // n, rest depth, lens thickness, the oil share's grid (0 for no oil)
  c: vec4f,
  // the presses (lib/slosh.ts SLOSH_PRESSES): x, y, radius, depth (plate units, 0..1 across; plate widths of head)
  p: array<vec4f, 6>,
  // the oil's own body force (lib/slosh.ts rockRise), x and y, plate widths a second squared; 0, 0
  e: vec4f,
};
@group(0) @binding(0) var<uniform> S: Slosh;

const DRY: f32 = 5e-6;
const THIN: f32 = 1e-5;

fn nOf() -> i32 { return i32(S.c.x); }
// The water's depth from what is stored, its departure from rest (lib/slosh.ts SloshDish.syncDepth).
fn depth(w: vec4f) -> f32 { return max(0.0, S.c.y + w.x); }
fn inDish(i: i32, j: i32) -> bool {
  let n = nOf();
  if (i < 0 || j < 0 || i >= n || j >= n) { return false; }
  let a = 2 * i + 1 - n;
  let b = 2 * j + 1 - n;
  return a * a + b * b <= n * n;
}
fn pressHead(p: vec4f, x: f32, y: f32) -> f32 {
  if (!(p.w > 0.0) || !(p.z > 0.0)) { return 0.0; }
  let d = length(vec2f(x - p.x, y - p.y)) / p.z;
  if (d >= 1.0) { return 0.0; }
  if (d <= 0.75) { return p.w; }
  let c = cos(0.5 * 3.14159265358979 * (d - 0.75) / 0.25);
  return p.w * c * c;
}
fn pressAt(x: f32, y: f32) -> f32 {
  var s = 0.0;
  for (var k = 0; k < 6; k++) { s += pressHead(S.p[k], x, y); }
  return s;
}
`;

/** The cells' reads, the reconstruction and the HLL flux: shared by the step. */
const SCHEME = /* wgsl */ `
@group(0) @binding(1) var Wc: texture_2d<f32>;
@group(0) @binding(2) var Oc: texture_2d<f32>;
@group(0) @binding(3) var Wb: texture_2d<f32>;
@group(0) @binding(4) var Ob: texture_2d<f32>;
@group(0) @binding(5) var Wo: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var Oo: texture_storage_2d<rgba32float, write>;

// A cell's reconstruction inputs: depth, head (h + z), u, v. Zero outside the dish.
fn base(i: i32, j: i32) -> vec4f {
  if (!inDish(i, j)) { return vec4f(0.0); }
  let w = textureLoad(Wc, vec2i(i, j), 0);
  let h1 = textureLoad(Oc, vec2i(i, j), 0).z;
  let n = f32(nOf());
  let x = (f32(i) + 0.5) / n - 0.5;
  let y = (f32(j) + 0.5) / n - 0.5;
  let px = (f32(i) + 0.5) / n;
  let py = (f32(j) + 0.5) / n;
  let p = pressAt(px, py);
  let z = -(S.a.y * x + S.a.z * y) / S.b.x + S.b.y * h1 + p;
  let h = depth(w);
  var u = 0.0;
  var v = 0.0;
  if (h > DRY) { u = w.y / h; v = w.z / h; }
  return vec4f(h, h + z, u, v);
}
// The MC limiter (lib/slosh.ts limit).
fn limit(a: vec4f, b: vec4f) -> vec4f {
  let m = min(min(2.0 * abs(a), 2.0 * abs(b)), 0.5 * abs(a + b));
  return select(vec4f(0.0), sign(a) * m, a * b > vec4f(0.0));
}
// The slope along x (dir 0) or y (dir 1) at a cell: limited, and none beside the rim.
fn slope(i: i32, j: i32, dir: i32) -> vec4f {
  let o = select(vec2i(0, 1), vec2i(1, 0), dir == 0);
  let b = vec2i(i, j) - o;
  let f = vec2i(i, j) + o;
  if (!inDish(i, j) || !inDish(b.x, b.y) || !inDish(f.x, f.y)) { return vec4f(0.0); }
  let c = base(i, j);
  return limit(c - base(b.x, b.y), base(f.x, f.y) - c);
}

// The face's fluxes as the cell on one side sees them: mass, normal momentum (with the hydrostatic correction for that side), tangential momentum.
struct Face { mass: f32, momL: f32, momR: f32, tang: f32, speed: f32 };

// HLL with the hydrostatic reconstruction, between left (hL, eL, uL, vL) and right; u normal.
fn face(L: vec4f, R: vec4f, g: f32) -> Face {
  let hL = L.x; let eL = L.y; let uL = L.z; let vL = L.w;
  let hR = R.x; let eR = R.y; let uR = R.z; let vR = R.w;
  let zs = max(eL - hL, eR - hR);
  let a = max(0.0, eL - zs);
  let b = max(0.0, eR - zs);
  var f0 = 0.0;
  var f1 = 0.0;
  var out: Face;
  if (a > 0.0 || b > 0.0) {
    let cL = sqrt(g * a);
    let cR = sqrt(g * b);
    var sL = min(uL - cL, uR - cR);
    var sR = max(uL + cL, uR + cR);
    if (a <= 0.0) { sL = uR - 2.0 * cR; sR = uR + cR; }
    if (b <= 0.0) { sL = uL - cL; sR = uL + 2.0 * cL; }
    let fL0 = a * uL; let fL1 = a * uL * uL + 0.5 * g * a * a;
    let fR0 = b * uR; let fR1 = b * uR * uR + 0.5 * g * b * b;
    if (sL >= 0.0) { f0 = fL0; f1 = fL1; }
    else if (sR <= 0.0) { f0 = fR0; f1 = fR1; }
    else {
      let k = 1.0 / (sR - sL);
      f0 = (sR * fL0 - sL * fR0 + sL * sR * (b - a)) * k;
      f1 = (sR * fL1 - sL * fR1 + sL * sR * (b * uR - a * uL)) * k;
    }
    out.speed = max(abs(uL) + cL, abs(uR) + cR);
  }
  out.mass = f0;
  out.momL = f1 + 0.5 * g * (hL * hL - a * a);
  out.momR = f1 + 0.5 * g * (hR * hR - b * b);
  out.tang = select(f0 * vR, f0 * vL, f0 >= 0.0);
  return out;
}

// The face between cell (i, j) and the next along dir, from the two cells' reconstructions, the rim a mirror.
fn faceAt(i: i32, j: i32, dir: i32, g: f32) -> Face {
  let o = select(vec2i(0, 1), vec2i(1, 0), dir == 0);
  let q = vec2i(i, j) + o;
  let wL = inDish(i, j);
  let wR = inDish(q.x, q.y);
  // The reconstruction is (h, head, normal, tangential): swap u and v for a y face.
  var L = vec4f(0.0);
  var R = vec4f(0.0);
  if (wL) { let c = base(i, j) + 0.5 * slope(i, j, dir); L = select(c.xywz, c, dir == 0); }
  if (wR) { let c = base(q.x, q.y) - 0.5 * slope(q.x, q.y, dir); R = select(c.xywz, c, dir == 0); }
  if (!wR) { R = vec4f(L.x, L.y, -L.z, L.w); }
  if (!wL) { L = vec4f(R.x, R.y, -R.z, R.w); }
  return face(L, R, g);
}

// The steady two-layer laminar drag (lib/slosh.ts twoLayerDrag): [M11, M12, M21, M22].
fn twoLayerDrag(h1: f32, h: f32, mu1: f32, mu2: f32) -> vec4f {
  let a = max(h1, THIN);
  let b = max(h, THIN);
  let det = b * mu1 + a * mu2;
  var R1 = -(a * a) / (2.0 * mu1);
  var R2 = a;
  var A2 = (R1 * mu1 + a * R2) / det;
  var A1 = (b * R2 - mu2 * R1) / det;
  let K11 = -(a * a) / (6.0 * mu1) + A1 * a / 2.0;
  let K21 = A2 * b / 2.0;
  R1 = (b * b) / (2.0 * mu2);
  R2 = b;
  A2 = (R1 * mu1 + a * R2) / det;
  A1 = (b * R2 - mu2 * R1) / det;
  let K12 = A1 * a / 2.0;
  let K22 = -(b * b) / (6.0 * mu2) + A2 * b / 2.0;
  let kd = K11 * K22 - K12 * K21;
  return vec4f(a * K22 / kd, -a * K12 / kd, -b * K21 / kd, b * K11 / kd);
}
`;

/**
 * One of Heun's two stages for a cell (S.a.w is which): the faces, the cell's
 * source, the raft; at the second stage the average with U⁰ and the drag.
 */
const STEP = /* wgsl */ `${HEAD}${SCHEME}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  if (!inDish(i, j)) {
    textureStore(Wo, vec2i(i, j), vec4f(0.0));
    textureStore(Oo, vec2i(i, j), vec4f(0.0));
    return;
  }
  let g = S.b.x;
  let dx = 1.0 / f32(n);
  let dt = S.a.x;
  let w = textureLoad(Wc, vec2i(i, j), 0);
  let o = textureLoad(Oc, vec2i(i, j), 0);
  // The water: the faces east, west, north, south, each as this cell sees it.
  let fe = faceAt(i, j, 0, g);
  let fw = faceAt(i - 1, j, 0, g);
  let fN = faceAt(i, j, 1, g);
  let fs = faceAt(i, j - 1, 1, g);
  let sx = slope(i, j, 0);
  let sy = slope(i, j, 1);
  var dh = -(fe.mass - fw.mass + fN.mass - fs.mass) / dx;
  var dqx = -(fe.momL - fw.momR) / dx - (fN.tang - fs.tang) / dx;
  var dqy = -(fN.momL - fs.momR) / dx - (fe.tang - fw.tang) / dx;
  // The cell's own source: −g h (slope of the head − slope of the depth)/dx.
  let hc = depth(w);
  dqx -= g * hc * (sx.y - sx.x) / dx;
  dqy -= g * hc * (sy.y - sy.x) / dx;
  // The raft: down the head's slope (central where both sides are in the dish), its momentum upwind.
  var dox = 0.0;
  var doy = 0.0;
  if (o.z > 0.0) {
    let wl = inDish(i - 1, j);
    let wr = inDish(i + 1, j);
    let wd = inDish(i, j - 1);
    let wu = inDish(i, j + 1);
    let ec = base(i, j).y;
    var gx = 0.0;
    var gy = 0.0;
    if (wl && wr) { gx = (base(i + 1, j).y - base(i - 1, j).y) / (2.0 * dx); }
    else if (wr) { gx = (base(i + 1, j).y - ec) / dx; }
    else if (wl) { gx = (ec - base(i - 1, j).y) / dx; }
    if (wd && wu) { gy = (base(i, j + 1).y - base(i, j - 1).y) / (2.0 * dx); }
    else if (wu) { gy = (base(i, j + 1).y - ec) / dx; }
    else if (wd) { gy = (ec - base(i, j - 1).y) / dx; }
    let ol = textureLoad(Oc, vec2i(max(i - 1, 0), j), 0).xy;
    let oR = textureLoad(Oc, vec2i(min(i + 1, n - 1), j), 0).xy;
    let od = textureLoad(Oc, vec2i(i, max(j - 1, 0)), 0).xy;
    let ou = textureLoad(Oc, vec2i(i, min(j + 1, n - 1)), 0).xy;
    var adv = vec2f(0.0);
    if (o.x > 0.0) { if (wl) { adv += o.x * (o.xy - ol); } } else { if (wr) { adv += o.x * (oR - o.xy); } }
    if (o.y > 0.0) { if (wd) { adv += o.y * (o.xy - od); } } else { if (wu) { adv += o.y * (ou - o.xy); } }
    // The oil's own force (rockRise), less its outward part against the rim: the wall's reaction (lib/slosh.ts shortcut k).
    let bx = select(select(0.0, S.e.x, wl), select(0.0, S.e.x, wr), S.e.x > 0.0);
    let by = select(select(0.0, S.e.y, wd), select(0.0, S.e.y, wu), S.e.y > 0.0);
    dox = -g * gx - adv.x / dx + bx;
    doy = -g * gy - adv.y / dx + by;
  }
  var W = vec4f(w.x + dt * dh, w.y + dt * dqx, w.z + dt * dqy, 0.0);
  var O = vec4f(o.x + dt * dox, o.y + dt * doy, o.z, 0.0);
  if (S.a.w > 1.5) {
    let wb = textureLoad(Wb, vec2i(i, j), 0);
    let ob = textureLoad(Ob, vec2i(i, j), 0);
    W = vec4f(0.5 * wb.xyz + 0.5 * W.xyz, 0.0);
    O = vec4f(0.5 * ob.xy + 0.5 * O.xy, o.z, 0.0);
  }
  if (S.c.y + W.x < 0.0) { W.x = -S.c.y; }
  let h = depth(W);
  if (h <= DRY) { W.y = 0.0; W.z = 0.0; }
  if (S.a.w > 1.5 && h > DRY) {
    // The drag, implicit: (mass + dt M) U = mass U*, a 2×2 solve on each axis.
    let r = S.b.y;
    let M = twoLayerDrag(o.z, h, S.b.w, max(1e-12, S.b.z));
    let m1 = r * o.z;
    let m2 = h;
    let a = m1 + dt * M.x;
    let b = dt * M.y;
    let c = dt * M.z;
    let d = m2 + dt * M.w;
    let det = a * d - b * c;
    let u2 = W.yz / h;
    let u1 = select(vec2f(0.0), O.xy, o.z > 0.0);
    let r1 = m1 * u1;
    let r2 = m2 * u2;
    let n1 = (d * r1 - b * r2) / det;
    let n2 = (a * r2 - c * r1) / det;
    W = vec4f(W.x, n2 * h, 0.0);
    O = vec4f(n1, o.z, 0.0);
  }
  textureStore(Wo, vec2i(i, j), W);
  textureStore(Oo, vec2i(i, j), O);
}`;

/**
 * The oil's thickness, read from the plate: the mix's oil share (its red)
 * averaged over the cell's footprint, sixteen reads of the plate's grid
 * (`S.c.w` is its size; 0 for none), times the lens. The velocities are kept,
 * and the water is copied alongside so the step starts from one copy of both.
 */
const OIL = /* wgsl */ `${HEAD}
@group(0) @binding(1) var Wc: texture_2d<f32>;
@group(0) @binding(2) var Oc: texture_2d<f32>;
@group(0) @binding(3) var mixT: texture_2d<f32>;
@group(0) @binding(4) var Wo: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var Oo: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let o = textureLoad(Oc, vec2i(i, j), 0);
  let N = i32(S.c.w);
  var s = 0.0;
  if (N > 0 && inDish(i, j)) {
    let k = f32(N) / f32(n);
    for (var b = 0; b < 4; b++) {
      for (var a = 0; a < 4; a++) {
        let px = clamp(i32(floor((f32(i) + (f32(a) + 0.5) / 4.0) * k)), 0, N - 1);
        let py = clamp(i32(floor((f32(j) + (f32(b) + 0.5) / 4.0) * k)), 0, N - 1);
        s += clamp(textureLoad(mixT, vec2i(px, py), 0).r, 0.0, 1.0);
      }
    }
    s = s / 16.0;
  }
  let h1 = select(0.0, S.c.z * s, s > THIN);
  textureStore(Wo, vec2i(i, j), textureLoad(Wc, vec2i(i, j), 0));
  textureStore(Oo, vec2i(i, j), vec4f(o.xy, h1, 0.0));
}`;

/** Level and still with the oil floating on it (lib/slosh.ts rest): the water under a lens shallower by r h₁ (stored as that departure from rest). */
const REST = /* wgsl */ `${HEAD}
@group(0) @binding(1) var Oc: texture_2d<f32>;
@group(0) @binding(2) var Wo: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var Oo: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let h1 = select(0.0, textureLoad(Oc, vec2i(i, j), 0).z, inDish(i, j));
  let d = select(0.0, -S.b.y * h1, inDish(i, j));
  textureStore(Wo, vec2i(i, j), vec4f(d, 0.0, 0.0, 0.0));
  textureStore(Oo, vec2i(i, j), vec4f(0.0, 0.0, h1, 0.0));
}`;

/**
 * What the plate is handed: F the two layers' velocities (water xy, oil zw;
 * the oil's is the water's where there is none), D the depth of both layers
 * over the rest depth (red) and the oil's share (green). Zero outside the dish.
 */
const OUT = /* wgsl */ `${HEAD}
@group(0) @binding(1) var Wc: texture_2d<f32>;
@group(0) @binding(2) var Oc: texture_2d<f32>;
@group(0) @binding(3) var F: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var D: texture_storage_2d<rgba32float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = nOf();
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  if (!inDish(i, j)) {
    textureStore(F, vec2i(i, j), vec4f(0.0));
    textureStore(D, vec2i(i, j), vec4f(0.0));
    return;
  }
  let w = textureLoad(Wc, vec2i(i, j), 0);
  let o = textureLoad(Oc, vec2i(i, j), 0);
  let h = depth(w);
  let u2 = select(vec2f(0.0), w.yz / h, h > DRY);
  let u1 = select(u2, o.xy, o.z > 0.0);
  textureStore(F, vec2i(i, j), vec4f(u2, u1));
  textureStore(D, vec2i(i, j), vec4f((h + o.z) / S.c.y, o.z / S.c.z, 0.0, 0.0));
}`;

export const SLOSH_KERNELS = { sloshStep: STEP, sloshOil: OIL, sloshRest: REST, sloshOut: OUT } as const;
export type SloshKernel = keyof typeof SLOSH_KERNELS;
