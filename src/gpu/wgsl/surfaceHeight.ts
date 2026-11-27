/**
 * Surface height kernels (PLAN 31s-1): conservative advection of the free-surface
 * and oil-layer height h (in metres), seeding from poured oil (mix.r), and a
 * semi-implicit coupled Red-Black multigrid solver + flux-divergence update for
 * the thin-film lubrication equation:
 *
 *   dh/dt = div( M(h) grad(p) ),   M(h) = h^3 / (3 mu),   p = -sigma lap(h) + rho g h
 */

import { DISH_REST_GAP } from '../../lib/turntable';

const PARAMS_STRUCT = /* wgsl */ `
struct SurfaceParams {
  n: u32,
  halfN: u32,
  coarseN: u32,
  parity: u32,
  dx: f32,
  dt: f32,
  oilMu: f32,
  oilSigma: f32,
  oilRho: f32,
  waterMu: f32,
  waterSigma: f32,
  waterRho: f32,
  disp: f32,
  seedH: f32,
  levelOn: f32,
  g: f32,
};
@group(0) @binding(0) var<uniform> U: SurfaceParams;

fn faceM(ma: f32, mb: f32) -> f32 {
  let s = ma + mb;
  return select(0.0, (2.0 * ma * mb) / s, s > 1e-36);
}
`;

export const SURFACE_KERNELS = {
  surfaceClear: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(2) var hTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  state[j * n + i] = vec4f(0.0);
  textureStore(hTex, vec2i(i, j), vec4f(0.0));
}
`,

  surfaceSeedMix: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var prevMix: texture_2d<f32>;
@group(0) @binding(2) var nextMix: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(4) var hTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let c = j * n + i;
  let nextOil = clamp(textureLoad(nextMix, vec2i(i, j), 0).r, 0.0, 1.0);
  var hNew: f32;
  if (U.parity == 0u) {
    let prevOil = clamp(textureLoad(prevMix, vec2i(i, j), 0).r, 0.0, 1.0);
    let dOil = max(0.0, nextOil - prevOil);
    hNew = min(U.seedH * 4.0, max(0.0, state[c].x) + U.seedH * dOil);
  } else {
    hNew = U.seedH * nextOil;
  }
  state[c].x = hNew;
  state[c].z = hNew;
  textureStore(hTex, vec2i(i, j), vec4f(hNew, 0.0, 0.0, 0.0));
}
`,

  surfaceSetBuf: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read> src: array<f32>;
@group(0) @binding(2) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(3) var hTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let c = j * n + i;
  let h = max(0.0, src[c]);
  state[c] = vec4f(h, 0.0, h, 0.0);
  textureStore(hTex, vec2i(i, j), vec4f(h, 0.0, 0.0, 0.0));
}
`,

  surfaceAdvect: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var<storage, read> pr: array<f32>;
@group(0) @binding(5) var sq: texture_2d<f32>;
@group(0) @binding(6) var<storage, read> mob: array<f32>;
@group(0) @binding(7) var<storage, read> sub: array<f32>;

const SURFACE_REST_GAP: f32 = ${DISH_REST_GAP};

fn hAt(p: vec2i, n: i32) -> f32 {
  let q = clamp(p, vec2i(0), vec2i(n - 1));
  return src[q.y * n + q.x].x;
}

fn mm(a: f32, b: f32) -> f32 {
  return select(0.0, select(max(a, b), min(a, b), a > 0.0), a * b > 0.0);
}

fn tfP(q: vec2i, n: i32) -> f32 {
  if (mob[q.x + q.y * n] < 0.0) { return 0.0; }
  let half = n / 2;
  return pr[((q.x + q.y) & 1) * n * half + q.y * half + (q.x >> 1)];
}

fn tfFace(q: vec2i, e: vec2i, n: i32) -> f32 {
  let b = q + e;
  if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n || b.x < 0 || b.y < 0 || b.x >= n || b.y >= n) { return 0.0; }
  let ma = abs(mob[q.x + q.y * n]);
  let mb = abs(mob[b.x + b.y * n]);
  return 2.0 * ma * mb / max(ma + mb, 1e-20) * (tfP(b, n) - tfP(q, n));
}

fn tfGap(q: vec2i) -> f32 {
  return max(textureLoad(sq, q, 0).r, 0.004) / SURFACE_REST_GAP;
}

fn faceCourant(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  var ve: f32;
  if (U.parity > 0u) {
    if (mob[a.x + a.y * n] == 0.0 || mob[b.x + b.y * n] == 0.0) { return 0.0; }
    let ha = tfGap(a);
    let hb = tfGap(b);
    let face = 0.5 * (dot(textureLoad(vel, a, 0).xy, vec2f(e)) * ha + dot(textureLoad(vel, b, 0).xy, vec2f(e)) * hb)
             + 0.25 * f32(n) * (tfFace(a - e, e, n) - 2.0 * tfFace(a, e, n) + tfFace(b, e, n));
    ve = face / (0.5 * (ha + hb));
  } else {
    let t = vec2i(e.y, e.x);
    let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy
           + 2.0 * textureLoad(vel, a, 0).xy
           + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
    let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy
           + 2.0 * textureLoad(vel, b, 0).xy
           + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
    ve = dot(va + vb, vec2f(e)) * 0.125;
  }
  return clamp(ve * U.disp * f32(n) * sub[0], -0.45, 0.45);
}

fn flux(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (a.x < 0 || a.y < 0 || a.x >= n || a.y >= n || b.x < 0 || b.y < 0 || b.x >= n || b.y >= n) { return 0.0; }
  let c = faceCourant(a, e, n);
  let ha = hAt(a, n);
  let hb = hAt(b, n);
  if (c >= 0.0) {
    let s = mm(ha - hAt(a - e, n), hb - ha);
    return c * (ha + 0.5 * (1.0 - c) * s);
  }
  let s = mm(hb - ha, hAt(b + e, n) - hb);
  return c * (hb - 0.5 * (1.0 + c) * s);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let p = vec2i(i, j);
  let idx = j * n + i;
  let cur = src[idx];
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  let hOut = max(0.0, cur.x - d);
  let finiteH = select(0.0, hOut, hOut >= 0.0 && hOut < 1e6);
  dst[idx] = vec4f(finiteH, cur.y, finiteH, 0.0);
}
`,

  surfacePrepLevel: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var mixTex: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> srcState: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> prop: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let c = j * n + i;
  let oil = clamp(textureLoad(mixTex, vec2i(i, j), 0).r, 0.0, 1.0);
  let w = smoothstep(0.0, 0.25, oil);
  let mu = mix(U.waterMu, U.oilMu, w);
  let sigma = mix(U.waterSigma, U.oilSigma, w);
  let rho = mix(U.waterRho, U.oilRho, w);
  let s = srcState[c];
  let h = max(0.0, s.x);
  let mob = (h * h * h) / max(3.0 * mu, 1e-12);
  let pWarm = select(0.0, s.y, abs(s.y) < 1e9);
  state[c] = vec4f(h, pWarm, h, 0.0);
  prop[c] = vec4f(mob, sigma, rho * U.g, w);
}
`,

  surfaceCoarsenProp: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read> fineProp: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> coarseProp: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let nc = i32(U.coarseN);
  let nf = i32(U.n);
  let ic = i32(id.x);
  let jc = i32(id.y);
  if (ic >= nc || jc >= nc) { return; }
  let i0 = 2 * ic;
  let j0 = 2 * jc;
  let i1 = min(i0 + 1, nf - 1);
  let j1 = min(j0 + 1, nf - 1);
  let sum = fineProp[j0 * nf + i0] + fineProp[j0 * nf + i1]
          + fineProp[j1 * nf + i0] + fineProp[j1 * nf + i1];
  coarseProp[jc * nc + ic] = 0.25 * sum;
}
`,

  surfaceSmooth: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(2) var<storage, read> prop: array<vec4f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let k = i32(id.x);
  let n = i32(U.n);
  let halfN = i32(U.halfN);
  if (k >= n * halfN) { return; }
  let j = k / halfN;
  let i = (k % halfN) * 2 + ((j + i32(U.parity)) & 1);
  let c = j * n + i;
  let prC = prop[c];
  let Mc = prC.x;
  let dx2 = U.dx * U.dx;
  let sx = prC.y / dx2;
  let rhoG = prC.z;
  let sc = U.dt / dx2;

  var mE = 0.0; var pE = 0.0;
  var mW = 0.0; var pW = 0.0;
  var mN = 0.0; var pN = 0.0;
  var mS = 0.0; var pS = 0.0;
  if (i + 1 < n) { mE = sc * faceM(Mc, prop[c + 1].x); pE = state[c + 1].y; }
  if (i - 1 >= 0) { mW = sc * faceM(Mc, prop[c - 1].x); pW = state[c - 1].y; }
  if (j + 1 < n) { mN = sc * faceM(Mc, prop[c + n].x); pN = state[c + n].y; }
  if (j - 1 >= 0) { mS = sc * faceM(Mc, prop[c - n].x); pS = state[c - n].y; }

  let hE = state[j * n + min(i + 1, n - 1)].x;
  let hW = state[j * n + max(i - 1, 0)].x;
  let hN = state[min(j + 1, n - 1) * n + i].x;
  let hS = state[max(j - 1, 0) * n + i].x;

  let rhs = state[c];
  let sumM = mE + mW + mN + mS;
  let b1 = rhs.z + mE * pE + mW * pW + mN * pN + mS * pS;
  let b2 = rhs.w + sx * (hE + hW + hN + hS);
  let a21 = 4.0 * sx + rhoG;
  let det = 1.0 + sumM * a21;
  state[c].x = (b1 + sumM * b2) / det;
  state[c].y = (a21 * b1 - b2) / det;
}
`,

  surfaceRestrict: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read> fineState: array<vec4f>;
@group(0) @binding(2) var<storage, read> fineProp: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> coarseState: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let nc = i32(U.coarseN);
  let nf = i32(U.n);
  let ic = i32(id.x);
  let jc = i32(id.y);
  if (ic >= nc || jc >= nc) { return; }
  let dx2 = U.dx * U.dx;
  let sc = U.dt / dx2;

  var sumRh = 0.0;
  var sumRp = 0.0;
  for (var dy = 0; dy < 2; dy++) {
    for (var dx = 0; dx < 2; dx++) {
      let i = 2 * ic + dx;
      let j = 2 * jc + dy;
      if (i < nf && j < nf) {
        let c = j * nf + i;
        let sf = fineState[c];
        let pf = fineProp[c];
        let Mc = pf.x;
        let sx = pf.y / dx2;
        let rhoG = pf.z;
        var divMp = 0.0;
        if (i + 1 < nf) { divMp += sc * faceM(Mc, fineProp[c + 1].x) * (fineState[c + 1].y - sf.y); }
        if (i - 1 >= 0) { divMp += sc * faceM(Mc, fineProp[c - 1].x) * (fineState[c - 1].y - sf.y); }
        if (j + 1 < nf) { divMp += sc * faceM(Mc, fineProp[c + nf].x) * (fineState[c + nf].y - sf.y); }
        if (j - 1 >= 0) { divMp += sc * faceM(Mc, fineProp[c - nf].x) * (fineState[c - nf].y - sf.y); }
        let hE = fineState[j * nf + min(i + 1, nf - 1)].x;
        let hW = fineState[j * nf + max(i - 1, 0)].x;
        let hN = fineState[min(j + 1, nf - 1) * nf + i].x;
        let hS = fineState[max(j - 1, 0) * nf + i].x;
        sumRh += sf.z - (sf.x - divMp);
        sumRp += sf.w - ((4.0 * sx + rhoG) * sf.x - sx * (hE + hW + hN + hS) - sf.y);
      }
    }
  }
  coarseState[jc * nc + ic] = vec4f(0.0, 0.0, 0.25 * sumRh, 0.25 * sumRp);
}
`,

  surfaceProlong: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read_write> fineState: array<vec4f>;
@group(0) @binding(2) var<storage, read> coarseState: array<vec4f>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let nf = i32(U.n);
  let nc = i32(U.coarseN);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= nf || j >= nf) { return; }
  let ic = min(i >> 1, nc - 1);
  let jc = min(j >> 1, nc - 1);
  let cor = coarseState[jc * nc + ic];
  let c = j * nf + i;
  fineState[c].x += cor.x;
  fineState[c].y += cor.y;
}
`,

  surfaceFluxFinish: /* wgsl */ `
${PARAMS_STRUCT}
@group(0) @binding(1) var<storage, read_write> state: array<vec4f>;
@group(0) @binding(2) var<storage, read> prop: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> scratchState: array<vec4f>;
@group(0) @binding(4) var hTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(U.n);
  let i = i32(id.x);
  let j = i32(id.y);
  if (i >= n || j >= n) { return; }
  let c = j * n + i;
  let sc0 = state[c];
  var hNew = max(0.0, sc0.z);
  if (U.levelOn > 0.5) {
    let Mc = prop[c].x;
    let pc = sc0.y;
    let dx2 = U.dx * U.dx;
    let sc = U.dt / dx2;
    var divMp = 0.0;
    if (i + 1 < n) { divMp += sc * faceM(Mc, prop[c + 1].x) * (state[c + 1].y - pc); }
    if (i - 1 >= 0) { divMp += sc * faceM(Mc, prop[c - 1].x) * (state[c - 1].y - pc); }
    if (j + 1 < n) { divMp += sc * faceM(Mc, prop[c + n].x) * (state[c + n].y - pc); }
    if (j - 1 >= 0) { divMp += sc * faceM(Mc, prop[c - n].x) * (state[c - n].y - pc); }
    hNew = max(0.0, hNew + divMp);
  }
  state[c].x = hNew;
  scratchState[c] = vec4f(hNew, sc0.y, hNew, 0.0);
  textureStore(hTex, vec2i(i, j), vec4f(hNew, 0.0, 0.0, 0.0));
}
`,
} as const;

export type SurfaceKernel = keyof typeof SURFACE_KERNELS;
