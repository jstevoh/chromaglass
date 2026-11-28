/**
 * Bioluminescent trails (PLAN 48c): the dinoflagellates in the plate's water,
 * stepped beside the plate's solver and driven by `src/gpu/glow.ts`.
 *
 * The phenomenon. Dinoflagellates (Lingulodinium, Pyrocystis, Noctiluca) flash
 * blue when the water round them is deformed past a stress threshold: the shear
 * stress bends the cell wall, a stretch-activated channel fires an action
 * potential across the vacuole membrane, protons flood the scintillons and
 * luciferase lights for about a tenth of a second (Latz, Case and Gran 1994;
 * Maldonado and Latz 2007). The light comes from a store the cell spends and
 * then has to rebuild, over seconds, so a wake that is stirred again at once
 * glows less, and a still sea is dark however full of organisms it is. Each
 * cell of this grid holds:
 *
 *   c, the charge per organism, 1 full:
 *     dc/dt = −g c / τs + (1 − c) / τr, stepped exactly for a step's g:
 *     c' = c∞ + (c − c∞) e^(−k dt), with k = 1/τr + g/τs and c∞ = (1/τr) / k.
 *   L, the flash per organism: max(g c', L e^(−dt/τf)).
 *   p, the plankton concentration (PLAN 48c-1), 1.0 in nominal seawater:
 *     carried conservatively and diffused with the water (glowCarry), poured
 *     from the Plankton bottle (glowPour), thinned where clear water flushes
 *     it and emptied over the open rim. Both charge and light scale by p.
 *
 * The shear stress (PLAN 48c-2). Cells answer shear stress τ = μ·S (in Pa),
 * not strain rate alone: Glow Shear sets the threshold in millipascals (30 mPa
 * = 0.03 Pa, which in seawater at 1 mPa·s is 30 s⁻¹). Where thick liquid
 * (syrup, glycerine, or a thicker plate carrier) sits in the species field,
 * μ rises and the local threshold rate drops as τ_th / μ, so stroking through
 * syrup or glycerine lights much brighter than water at the same speed.
 *
 * The shear geometry (PLAN 48c-6, 48c-7):
 *   - No shaker: the water sits between two glasses 2 mm apart (squeeze gap h),
 *     carrying a Poiseuille parabola with wall shear γw = 6 U / h plus in-plane
 *     strain S, giving exact firing share g = 1 − √(γth² − S²) / γw.
 *   - Shaker on, still plate: the linear Faraday wave in the 3 mm open dish
 *     gives exact bulk + floor Stokes-layer firing share (`waveShare`).
 *   - Shaker on, moving plate (PLAN 48c-7): both the plate's flow (open-layer
 *     half-Poiseuille profile 3 U / d · (1 − z/d) plus in-plane strain) and
 *     the wave (bulk + Stokes layer) combine as ONE 3D strain-rate tensor
 *     E(z) = E_flow(z) ± E_wave(z) integrated across height z ∈ [0, d].
 *
 * Standing-wave streaming (PLAN 48c-8): a standing Faraday wave drives steady
 * boundary-layer / upper-layer return streaming (Longuet-Higgins 1953),
 *   U_stream = (0.5 ω / (k² sinh²(kd))) · (1/8 ∇|∇u|² + 1/2 (∇²u) ∇u),
 * carrying floating/upper-layer plankton away from antinodes and herding the
 * bloom into the lattice's nodes over seconds.
 */
import { PLATE_METRES, GAP_METRES, REST_GAP_METRES } from '../fluid/constants';
import { DISH_GAP_RANGE, DISH_REST_GAP, OPEN_RIM } from '../../lib/turntable';

/** Micro-diffusion of drifting plankton patches, m²/s (gentle smoothing of herded filaments and poured rims). */
export const GLOW_DIFFUSION = 5e-7;
/** Plankton concentration poured by the Plankton bottle relative to nominal seawater. */
export const GLOW_PLANKTON_POUR = 2.0;

const ARGS = /* wgsl */ `
struct GlowArgs {
  // the grid's side, carry substeps, thinGap (1 or 0), 0
  grid: vec4u,
  // travel (uv a unit of velocity moves the dye this step), dt (s), threshold (mPa = 1/s in seawater), recharge τr (s)
  a: vec4f,
  // spend τs (s), fade τf (s), step's seconds unclamped (for the flow's speed), ln(nu_clear / WATER_NU)
  b: vec4f,
  // the shaken dish's wave (48c-6): wavenumber k (1/m, 0 with no shaker), ω half the drive (rad/s), depth d (m), ν (m²/s)
  c: vec4f,
};
@group(0) @binding(0) var<uniform> A: GlowArgs;
const PLATE_METRES: f32 = ${PLATE_METRES};
const GAP_METRES: f32 = ${GAP_METRES};
const REST_GAP_METRES: f32 = ${REST_GAP_METRES};
const OPEN_RIM: f32 = ${OPEN_RIM.toFixed(2)};
const GLOW_DIFFUSION: f32 = ${GLOW_DIFFUSION};
`;

const WAVE_AND_VEL = /* wgsl */ `
fn waveAt(i: i32, j: i32, n: i32) -> f32 {
  // Periodic, as the wave's own grid is (wgsl/faraday.ts).
  return wave[u32(((j % n) + n) % n) * u32(n) + u32(((i % n) + n) % n)];
}

fn waveGrad(i: i32, j: i32, n: i32, dx: f32) -> vec2f {
  return vec2f(waveAt(i + 1, j, n) - waveAt(i - 1, j, n), waveAt(i, j + 1, n) - waveAt(i, j - 1, n)) / (2.0 * dx);
}

/*
  Steady streaming velocity of the standing wave (PLAN 48c-8, Longuet-Higgins
  1953 upper-layer return flow), m/s: drives floating/suspended plankton away
  from antinodes and into the lattice's nodes.
*/
fn waveStream(uv: vec2f) -> vec2f {
  let kc = A.c.x;
  let n = i32(round(sqrt(f32(arrayLength(&wave)))));
  if (!(kc > 0.0) || n < 4) { return vec2f(0.0); }
  let om = A.c.y;
  let d = A.c.z;
  let sh = sinh(min(kc * d, 40.0));
  let dx = PLATE_METRES / f32(n);
  let i = i32(floor(uv.x * f32(n)));
  let j = i32(floor(uv.y * f32(n)));
  let u = waveAt(i, j, n);
  let lap = (waveAt(i + 1, j, n) + waveAt(i - 1, j, n) + waveAt(i, j + 1, n) + waveAt(i, j - 1, n) - 4.0 * u) / (dx * dx);
  let g = waveGrad(i, j, n, dx);
  let ge = waveGrad(i + 1, j, n, dx); let gw = waveGrad(i - 1, j, n, dx);
  let gs = waveGrad(i, j + 1, n, dx); let gn = waveGrad(i, j - 1, n, dx);
  let gg2 = vec2f(dot(ge, ge) - dot(gw, gw), dot(gs, gs) - dot(gn, gn)) / (2.0 * dx);
  return (0.5 * om / (kc * kc * sh * sh)) * (0.125 * gg2 + 0.5 * lap * g);
}

// The plate's velocity at a uv, between texels: the dye's own sampling.
fn velAt(uv: vec2f) -> vec2f {
  let size = vec2f(textureDimensions(vel));
  let p = clamp(uv * size - 0.5, vec2f(0.0), size - 1.0);
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let hi = min(i + 1, vec2i(size) - 1);
  let a = textureLoad(vel, i, 0).xy;
  let b = textureLoad(vel, vec2i(hi.x, i.y), 0).xy;
  let c = textureLoad(vel, vec2i(i.x, hi.y), 0).xy;
  let d = textureLoad(vel, hi, 0).xy;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const CARRY = /* wgsl */ `${ARGS}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> src: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(4) var<storage, read> wave: array<f32>;
${WAVE_AND_VEL}

fn pastRim(q: vec2i, n: i32) -> bool {
  let uv = (vec2f(q) + 0.5) / f32(n);
  return length(uv - vec2f(0.5)) >= OPEN_RIM || q.x == 0 || q.y == 0 || q.x == n - 1 || q.y == n - 1;
}

fn pAt(q: vec2i, n: i32) -> f32 {
  let c = clamp(q, vec2i(0), vec2i(n - 1));
  return max(0.0, src[u32(c.y) * u32(n) + u32(c.x)].z);
}

fn mm1(a: f32, b: f32) -> f32 {
  if (a * b <= 0.0) { return 0.0; }
  let l = min(min(2.0 * abs(a), 2.0 * abs(b)), 0.5 * abs(a + b));
  return sign(a) * l;
}

fn faceUvVel(q: vec2i, n: i32, subTravel: f32, subDt: f32) -> vec2f {
  let uv = (vec2f(q) + 0.5) / f32(n);
  return velAt(uv) * subTravel + waveStream(uv) * (subDt / PLATE_METRES);
}

fn fluxP(a: vec2i, e: vec2i, n: i32, subTravel: f32, subDt: f32, diffAlpha: f32, thin: bool) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  let va = faceUvVel(a, n, subTravel, subDt);
  let vb = faceUvVel(b, n, subTravel, subDt);
  let c = clamp(dot(0.5 * (va + vb), vec2f(e)) * f32(n), -0.45, 0.45);
  let pa = pAt(a, n);
  let pb = pAt(b, n);
  var adv = 0.0;
  if (c >= 0.0) {
    let s = mm1(pa - pAt(a - e, n), pb - pa);
    adv = c * (pa + 0.5 * (1.0 - c) * s);
  } else {
    let s = mm1(pb - pa, pAt(b + e, n) - pb);
    adv = c * (pb - 0.5 * (1.0 + c) * s);
  }
  var diff = 0.0;
  if (!thin || (!pastRim(a, n) && !pastRim(b, n))) {
    diff = diffAlpha * (pa - pb);
  }
  return adv + diff;
}

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.grid.x);
  if (i32(id.x) >= n || i32(id.y) >= n) { return; }
  let q = vec2i(id.xy);
  let k = id.y * u32(n) + id.x;
  let was = src[k];
  let thin = A.grid.z > 0u;
  if (thin && pastRim(q, n)) {
    dst[k] = vec4f(was.xy, 0.0, was.w);
    return;
  }
  let subs = f32(max(1u, A.grid.y));
  let subTravel = A.a.x / subs;
  let subDt = A.a.y / subs;
  let dx = PLATE_METRES / f32(n);
  let diffAlpha = min(0.15, GLOW_DIFFUSION * subDt / (dx * dx));
  let d = fluxP(q, vec2i(1, 0), n, subTravel, subDt, diffAlpha, thin) - fluxP(q - vec2i(1, 0), vec2i(1, 0), n, subTravel, subDt, diffAlpha, thin)
        + fluxP(q, vec2i(0, 1), n, subTravel, subDt, diffAlpha, thin) - fluxP(q - vec2i(0, 1), vec2i(0, 1), n, subTravel, subDt, diffAlpha, thin);
  let p = clamp(max(0.0, was.z - d), 0.0, 16.0);
  dst[k] = vec4f(was.xy, p, was.w);
}
`;

const POUR = /* wgsl */ `
struct PourArgs {
  grid: vec4u,
  // x, y, radius, take
  a: vec4f,
  // pPour, push (1 or 0), 0, 0
  b: vec4f,
};
@group(0) @binding(0) var<uniform> P: PourArgs;
@group(0) @binding(1) var gap: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> src: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> dst: array<vec4f>;

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(P.grid.x);
  if (i32(id.x) >= n || i32(id.y) >= n) { return; }
  let k = id.y * u32(n) + id.x;
  let was = src[k];
  let uv = (vec2f(id.xy) + 0.5) / f32(n);
  let d = length(uv - P.a.xy) / max(P.a.z, 1e-4);
  if (d >= 1.0) {
    dst[k] = was;
    return;
  }
  let w = 1.0 - d * d;
  let f = clamp(P.a.w * w, 0.0, 1.0);
  let gd = textureDimensions(gap);
  let sq = textureLoad(gap, clamp(vec2i(uv * vec2f(gd)), vec2i(0), vec2i(gd) - 1), 0).r;
  let tall = max(sq, ${DISH_GAP_RANGE[0]}) / ${DISH_REST_GAP};
  let pPour = P.b.x;
  let push = P.b.y > 0.5;
  var pNew = was.z;
  var cNew = was.x;
  if (push) {
    let addP = f * tall * pPour;
    pNew = clamp(was.z + addP, 0.0, 16.0);
    cNew = select(was.x, (was.z * was.x + addP) / max(pNew, 1e-6), pNew > 1e-6);
  } else {
    pNew = clamp(mix(was.z, pPour, f), 0.0, 16.0);
    let kept = was.z * (1.0 - f);
    let added = f * pPour;
    cNew = select(was.x, (kept * was.x + added) / max(kept + added, 1e-6), kept + added > 1e-6);
  }
  dst[k] = vec4f(clamp(cNew, 0.0, 1.0), was.y, pNew, was.w);
}
`;

const STEP = /* wgsl */ `${ARGS}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var gap: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> src: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> dst: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> light: array<f32>;
// The Faraday wave's amplitude, metres, n × n over the plate (gpu/faraday.ts); a 4-float stand-in with no shaker.
@group(0) @binding(6) var<storage, read> wave: array<f32>;
// The poured liquids' species (PLAN 18d, 48c-2): r share, g Σ share·ln(ν/ν_water); 1×1 blank with none poured.
@group(0) @binding(7) var species: texture_2d<f32>;
${WAVE_AND_VEL}

// The share of the shaken layer's depth whose strain passes th (pure standing wave).
fn waveShare(uv: vec2f, th: f32) -> f32 {
  let kc = A.c.x;
  let n = i32(round(sqrt(f32(arrayLength(&wave)))));
  if (!(kc > 0.0) || n < 4) { return 0.0; }
  let om = A.c.y;
  let d = A.c.z;
  let i = i32(floor(uv.x * f32(n)));
  let j = i32(floor(uv.y * f32(n)));
  let dx = PLATE_METRES / f32(n);
  let u = waveAt(i, j, n);
  let e = waveAt(i + 1, j, n); let w = waveAt(i - 1, j, n);
  let s = waveAt(i, j + 1, n); let q = waveAt(i, j - 1, n);
  let uxx = (e - 2.0 * u + w) / (dx * dx);
  let uyy = (s - 2.0 * u + q) / (dx * dx);
  let uxy = (waveAt(i + 1, j + 1, n) - waveAt(i + 1, j - 1, n) - waveAt(i - 1, j + 1, n) + waveAt(i - 1, j - 1, n)) / (4.0 * dx * dx);
  let g2 = ((e - w) * (e - w) + (s - q) * (s - q)) / (4.0 * dx * dx);
  let ok = om / kc;
  let a = 2.0 * (ok * ok * (uxx * uxx + uyy * uyy + 2.0 * uxy * uxy) + (om * kc * u) * (om * kc * u));
  let b = 4.0 * om * om * g2;
  let sh = sinh(min(kc * d, 40.0));
  let ch = cosh(min(kc * d, 40.0));
  var share = 0.0;
  // The bulk: fires above ζ*, if the surface itself passes.
  if ((a + b) * ch * ch - b > th * th * sh * sh) {
    let c2 = (th * th * sh * sh + b) / max(a + b, 1e-30);
    let z = acosh(sqrt(max(1.0, c2))) / kc;
    share = 1.0 - clamp(z / d, 0.0, 1.0);
  }
  // The floor's Stokes layer.
  let nu = A.c.w;
  let wallShear = ok * sqrt(g2) / sh * sqrt(om / nu);
  if (wallShear > th) {
    share += sqrt(2.0 * nu / om) * log(wallShear / th) / d;
  }
  return clamp(share, 0.0, 1.0);
}

/*
  Combined wave + plate flow in the open 3 mm layer (PLAN 48c-7): one 3D
  strain-rate tensor E(z) = E_flow(z) ± E_wave(z) integrated over height z.
  The plate flow has depth-mean uMean with half-Poiseuille vertical profile
  (no-slip at floor z = 0, free surface at z = d, so ∂u/∂z = 3 uMean/d (1 − z/d))
  plus its in-plane strain tensor; the wave adds its bulk potential strain and
  floor Stokes layer.
*/
fn combinedShare(uv: vec2f, th: f32, exxF: f32, eyyF: f32, exyF: f32, uMean: vec2f) -> f32 {
  let kc = A.c.x;
  let n = i32(round(sqrt(f32(arrayLength(&wave)))));
  if (!(kc > 0.0) || n < 4) { return 0.0; }
  let om = A.c.y;
  let d = A.c.z;
  let nu = A.c.w;
  let i = i32(floor(uv.x * f32(n)));
  let j = i32(floor(uv.y * f32(n)));
  let dx = PLATE_METRES / f32(n);
  let u = waveAt(i, j, n);
  let e = waveAt(i + 1, j, n); let w = waveAt(i - 1, j, n);
  let s = waveAt(i, j + 1, n); let q = waveAt(i, j - 1, n);
  let uxx = (e - 2.0 * u + w) / (dx * dx);
  let uyy = (s - 2.0 * u + q) / (dx * dx);
  let uxy = (waveAt(i + 1, j + 1, n) - waveAt(i + 1, j - 1, n) - waveAt(i - 1, j + 1, n) + waveAt(i - 1, j - 1, n)) / (4.0 * dx * dx);
  let gx = (e - w) / (2.0 * dx);
  let gy = (s - q) / (2.0 * dx);
  let gLen = length(vec2f(gx, gy));
  let dir = select(vec2f(0.0), vec2f(gx, gy) / gLen, gLen > 1e-12);
  let ok = om / kc;
  let sh = sinh(min(kc * d, 40.0));
  let wallWave = ok * gLen / sh * sqrt(om / nu);
  let delta = sqrt(2.0 * nu / om);
  let th2 = th * th;
  const LEVELS: i32 = 64;
  var fire = 0.0;
  for (var l = 0; l < LEVELS; l++) {
    let z = ((f32(l) + 0.5) / f32(LEVELS)) * d;
    let C = cosh(min(kc * z, 40.0)) / sh;
    let S = sinh(min(kc * z, 40.0)) / sh;
    let exxW = ok * C * uxx;
    let eyyW = ok * C * uyy;
    let exyW = ok * C * uxy;
    let ezzW = om * kc * C * u;
    let stokes = 0.5 * wallWave * exp(-z / delta);
    let exzW = om * S * gx + stokes * dir.x;
    let eyzW = om * S * gy + stokes * dir.y;
    let shearF = 1.5 * (1.0 - z / d) / d;
    let exzF = uMean.x * shearF;
    let eyzF = uMean.y * shearF;
    let normF2 = 2.0 * (exxF * exxF + eyyF * eyyF + 2.0 * exyF * exyF + 2.0 * (exzF * exzF + eyzF * eyzF));
    let normW2 = 2.0 * (exxW * exxW + eyyW * eyyW + ezzW * ezzW + 2.0 * (exyW * exyW + exzW * exzW + eyzW * eyzW));
    let cross = 2.0 * (exxF * exxW + eyyF * eyyW + 2.0 * (exyF * exyW + exzF * exzW + eyzF * eyzW));
    if (normF2 + normW2 + 2.0 * abs(cross) > th2) { fire += 1.0; }
  }
  return fire / f32(LEVELS);
}

fn stateAt(i: vec2i, n: i32) -> vec2f {
  let q = clamp(i, vec2i(0), vec2i(n - 1));
  return src[u32(q.y) * u32(n) + u32(q.x)].xy;
}

// The per-organism state (c, lit) a uv's water carried here, between cells.
fn stateBack(uv: vec2f, n: i32) -> vec2f {
  let p = uv * f32(n) - 0.5;
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let a = stateAt(i, n);
  let b = stateAt(i + vec2i(1, 0), n);
  let c = stateAt(i + vec2i(0, 1), n);
  let d = stateAt(i + vec2i(1, 1), n);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.grid.x);
  if (i32(id.x) >= n || i32(id.y) >= n) { return; }
  let k = id.y * u32(n) + id.x;
  let dt = A.a.y;
  let travel = A.a.x;
  let uv = (vec2f(id.xy) + 0.5) / f32(n);
  let v = velAt(uv);
  let vStream = waveStream(uv);
  let s = stateBack(uv - (v * travel + vStream * (dt / PLATE_METRES)), n);
  // Plankton concentration already carried conservatively and diffused by glowCarry.
  let p = max(0.0, src[k].z);
  // Per second: a unit of velocity moves travel of the plate's uv in dt.
  let perSecond = travel / max(A.b.z, 1e-6);
  // In-plane strain-rate tensor across the plate, by central differences a texel apart.
  let h = 1.0 / f32(textureDimensions(vel).x);
  let dx = (velAt(uv + vec2f(h, 0.0)) - velAt(uv - vec2f(h, 0.0))) / (2.0 * h);
  let dy = (velAt(uv + vec2f(0.0, h)) - velAt(uv - vec2f(0.0, h))) / (2.0 * h);
  let exxF = dx.x * perSecond;
  let eyyF = dy.y * perSecond;
  let exyF = 0.5 * (dy.x + dx.y) * perSecond;
  let strain = sqrt(2.0 * (exxF * exxF + eyyF * eyyF + 2.0 * exyF * exyF));
  // Local viscosity relative to seawater (PLAN 48c-2): thicker liquid stresses cells harder for the same strain rate.
  let spDims = textureDimensions(species);
  let sp = select(vec4f(0.0), textureLoad(species, clamp(vec2i(uv * vec2f(spDims)), vec2i(0), vec2i(spDims) - 1), 0), spDims.x > 1u);
  let lnClear = A.b.w;
  let lnNu = lnClear + sp.g - clamp(sp.r, 0.0, 1.0) * lnClear;
  let muRatio = exp(clamp(lnNu, -9.0, 9.0));
  let th = A.a.z / muRatio;
  let hm = max(1e-5, textureLoad(gap, clamp(vec2i(uv * vec2f(textureDimensions(gap))), vec2i(0), vec2i(textureDimensions(gap)) - 1), 0).r * GAP_METRES);
  let uMean = v * (perSecond * PLATE_METRES);
  let kc = A.c.x;
  let wn = i32(round(sqrt(f32(arrayLength(&wave)))));
  let shaken = kc > 0.0 && wn >= 4;
  var g = 0.0;
  if (!shaken) {
    // The gap's Poiseuille shear at the glass: 6 U / h, U the flow's mean speed in m/s.
    let wall = 6.0 * length(uMean) / hm;
    if (strain >= th) {
      g = 1.0;
    } else if (wall > 0.0) {
      g = clamp(1.0 - sqrt(th * th - strain * strain) / wall, 0.0, 1.0);
    }
  } else if (strain <= 1e-9 && dot(uMean, uMean) <= 1e-18) {
    g = waveShare(uv, th);
  } else {
    g = combinedShare(uv, th, exxF, eyyF, exyF, uMean);
  }
  // The charge per organism, spent by the firing share and refilled, exactly over the step.
  let rate = 1.0 / max(A.a.w, 1e-3) + g / max(A.b.x, 1e-3);
  let full = (1.0 / max(A.a.w, 1e-3)) / rate;
  let c = clamp(full + (clamp(s.x, 0.0, 1.0) - full) * exp(-rate * dt), 0.0, 1.0);
  let fade = exp(-dt / max(A.b.y, 1e-3));
  let lit = max(g * c, max(0.0, s.y) * fade);
  dst[k] = vec4f(c, lit, p, 0.0);
  // What the plate draws: scaled by plankton concentration p and the water's depth (at rest, 1).
  light[k] = p * lit * min(4.0, hm / REST_GAP_METRES);
}
`;

export const GLOW_KERNELS = { glowCarry: CARRY, glowPour: POUR, glowStep: STEP } as const;
export type GlowKernel = keyof typeof GLOW_KERNELS;
