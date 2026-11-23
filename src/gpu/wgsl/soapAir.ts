/**
 * The air over the frame's soap film (PLAN 32d-1): its own fluid, with its own
 * inertia, that the plate's stir and the film's own plumes spin up and that
 * drags the film. Driven by `src/gpu/soapAir.ts`, which says what was measured
 * and why this is the physics.
 *
 * The air is a slab a few millimetres deep on the film's face (the boundary
 * layer a motion of a second or two drags along, δ ≈ √(ν t)), taken as a
 * two-dimensional incompressible fluid on a grid of its own, half the film's
 * (AIR cells of 2 mm: its eddies are centimetres). Each step, in film seconds:
 *
 * 1. `soapAirForce`: the air carries its own momentum (semi-Lagrangian
 *    advection of its velocity by itself, which is what lets a swirl roll up
 *    and keep turning after whatever spun it has stopped), and three things
 *    act on it, taken implicitly so any step is stable:
 *      - the film drags it, at the air-friction rate kFilm = 2 μ_air / (ρ_air δ²)
 *        toward the film's own velocity (the two faces' shear, on the slab's
 *        mass): the buoyant plumes, thin film rising and thick film sinking,
 *        hand their motion to the air, and the air keeps it;
 *      - the stir: the plate's flow (the hands, the tools and the music)
 *        pushes it, at kStir times the plate's velocity (named shortcut 32d-1:
 *        the stir is the plate's own flow, not a breath or a hand of its own).
 *        A push, not a drag toward the plate's velocity: where the plate is
 *        still the air keeps turning;
 *      - the still room behind the slab takes its momentum back at λ = ν / δ².
 * 2. `soapAirDiv`, `soapAirJacobi`, `soapAirProject`: the slab is
 *    incompressible (air at these speeds is), so its velocity is projected onto
 *    ∇·a = 0 with walls at the frame. A stir comes out as eddies.
 * 3. `soapAirExt`: the air's velocity on the film's faces, the film's `ext`
 *    (wgsl/soapFilm.ts): the overdamped film moves with the air over it, less
 *    what its own tension takes back (wgsl/soapFilmPlate.ts says why that is
 *    the law).
 */

import { SOAP_FRAME_LO, SOAP_FRAME_SPAN } from '../soapFrame';

const ARGS = /* wgsl */ `
struct AirArgs {
  // the air's cells a side, the film's cells a side, 0, 0
  grid: vec4u,
  // dt (film seconds), the air cell (m), m/s per unit of the plate's velocity, kFilm (1/s)
  a: vec4f,
  // kStir (1/s), lambda (1/s), alpha = (ℓ / air cell)², rho g 1e-9 / zeta_air (m/s per nm)
  b: vec4f,
  // rho g 1e-9 / zeta (the solver's own Darcy part, m/s per nm), 0, 0, 0
  c: vec4f,
};
@group(0) @binding(0) var<uniform> A: AirArgs;
const SOAP_FRAME_LO: f32 = ${SOAP_FRAME_LO};
const SOAP_FRAME_SPAN: f32 = ${SOAP_FRAME_SPAN};

fn cellOf(i: i32, j: i32) -> u32 {
  let g = i32(A.grid.x);
  return u32(clamp(j, 0, g - 1) * g + clamp(i, 0, g - 1));
}
`;

// Bilinear read of the air's velocity (the kernel's air array) at a point
// in the air's cells (centres at k + 0.5), clamped to the frame.
const SAMPLE = /* wgsl */ `
fn sampleAir(x: vec2f) -> vec2f {
  let g = f32(A.grid.x);
  let p = clamp(x - 0.5, vec2f(0.0), vec2f(g - 1.0));
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let a = air[cellOf(i.x, i.y)];
  let b = air[cellOf(i.x + 1, i.y)];
  let c = air[cellOf(i.x, i.y + 1)];
  let d = air[cellOf(i.x + 1, i.y + 1)];
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const FORCE = /* wgsl */ `${ARGS}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> uf: array<f32>;
@group(0) @binding(3) var<storage, read> vf: array<f32>;
@group(0) @binding(4) var<storage, read> air: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> next: array<vec2f>;
${SAMPLE}

// The plate's velocity at a point of the frame (0..1 both ways, row 0 at the
// top as the film's), in the film's axes: the plate's rows run up the picture
// and the film's down it, so y and its velocity are mirrored.
fn plateVel(film: vec2f) -> vec2f {
  let uv = SOAP_FRAME_LO + vec2f(film.x, 1.0 - film.y) * SOAP_FRAME_SPAN;
  let size = vec2f(textureDimensions(vel));
  let p = clamp(uv * size - 0.5, vec2f(0.0), size - 1.0);
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let hi = min(i + 1, vec2i(size) - 1);
  let a = textureLoad(vel, i, 0).xy;
  let b = textureLoad(vel, vec2i(hi.x, i.y), 0).xy;
  let c = textureLoad(vel, vec2i(i.x, hi.y), 0).xy;
  let d = textureLoad(vel, hi, 0).xy;
  let v = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  return vec2f(v.x, -v.y);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let I = c % g;
  let J = c / g;
  let x = vec2f(f32(I) + 0.5, f32(J) + 0.5);
  let dt = A.a.x;
  // The air carries itself: where this parcel was a step ago, and what it carried.
  let here = air[c];
  let carried = sampleAir(x - here * dt / A.a.y);
  // The film under this cell, from its MAC faces (two film cells to an air cell).
  let n = A.grid.y;
  let fi = 2u * I;
  let fj = 2u * J;
  let filmU = 0.5 * (uf[fj * (n + 1u) + fi + 1u] + uf[(fj + 1u) * (n + 1u) + fi + 1u]);
  let filmV = 0.5 * (vf[(fj + 1u) * n + fi] + vf[(fj + 1u) * n + fi + 1u]);
  let stir = plateVel(x / f32(g)) * A.a.z;
  let kF = A.a.w;
  let kS = A.b.x;
  let lam = A.b.y;
  var a = (carried + dt * (kF * vec2f(filmU, filmV) + kS * stir)) / (1.0 + dt * (kF + lam));
  // The frame is a wall: no air through it.
  if (I == 0u || I == g - 1u) { a.x = 0.0; }
  if (J == 0u || J == g - 1u) { a.y = 0.0; }
  next[c] = a;
}
`;

const DIV = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> next: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> div: array<f32>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let i = i32(c % g);
  let j = i32(c / g);
  let gi = i32(g);
  // Past the frame the air does not cross it: the wall's normal velocity is 0.
  let r = select(0.0, next[cellOf(i + 1, j)].x, i + 1 < gi);
  let l = select(0.0, next[cellOf(i - 1, j)].x, i > 0);
  let d = select(0.0, next[cellOf(i, j + 1)].y, j + 1 < gi);
  let u = select(0.0, next[cellOf(i, j - 1)].y, j > 0);
  div[c] = ((r - l) + (d - u)) / (2.0 * A.a.y);
}
`;

const JACOBI = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> pIn: array<f32>;
@group(0) @binding(2) var<storage, read> div: array<f32>;
@group(0) @binding(3) var<storage, read_write> pOut: array<f32>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let i = i32(c % g);
  let j = i32(c / g);
  // Neumann at the walls (cellOf clamps: the cell outside is this one).
  let s = pIn[cellOf(i + 1, j)] + pIn[cellOf(i - 1, j)] + pIn[cellOf(i, j + 1)] + pIn[cellOf(i, j - 1)];
  pOut[c] = (s - A.a.y * A.a.y * div[c]) * 0.25;
}
`;

const PROJECT = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> next: array<vec2f>;
@group(0) @binding(2) var<storage, read> p: array<f32>;
@group(0) @binding(3) var<storage, read_write> air: array<vec2f>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let i = i32(c % g);
  let j = i32(c / g);
  let grad = vec2f(p[cellOf(i + 1, j)] - p[cellOf(i - 1, j)], p[cellOf(i, j + 1)] - p[cellOf(i, j - 1)]) / (2.0 * A.a.y);
  var a = next[c] - grad;
  if (i == 0 || i == i32(g) - 1) { a.x = 0.0; }
  if (j == 0 || j == i32(g) - 1) { a.y = 0.0; }
  air[c] = a;
}
`;


// The film's own flow at the frame's scales (PLAN 32k). The solver moves the
// film by Darcy's law with one friction ζ for every size of motion. A real
// film resists a motion by the air's drag on its faces, ζ_air = 2 μ_air / δ,
// whatever the motion's size, and by its own surface viscosity η, which grows
// as the motion gets smaller (η k²): the film is a two-dimensional Brinkman
// fluid, (ζ_air − η ∇²) u = F + ζ_air a − ∇p. So small patches crawl and big
// swirls run. This solves the big swirls' part on the air's grid:
//   (1 − ℓ² ∇²) W = F / ζ_air,   ℓ² = η / ζ_air,
// with the frame no-slip. F is the film's buoyancy (thick film sinks, thin
// rises), averaged over the air cell from the film's thickness. The air's
// own push (ζ_air a) is left out of the solve and handed to the film whole,
// the law the film had before (wgsl/soapFilmPlate.ts: ζ_air = ζ for a film
// carried whole), so the stir reaches the film at its full speed (named:
// the film's viscosity should resist a small gust as it resists a small
// plume, 32k-1).
const BRINK_SOURCE = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> h: array<f32>;
@group(0) @binding(2) var<storage, read_write> src: array<vec4f>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let n = A.grid.y;
  let fi = 2u * (c % g);
  let fj = 2u * (c / g);
  let hc = 0.25 * (h[fj * n + fi] + h[fj * n + fi + 1u] + h[(fj + 1u) * n + fi] + h[(fj + 1u) * n + fi + 1u]);
  // Against its row's mean, not the frame's. A film thick at the bottom and
  // thin at the top, the same all the way across, pushes straight down with a
  // force that is a gradient, and the frame holds it: the film's tension takes
  // all of it and nothing moves. Only the part that differs along a row turns
  // the film (its curl is the whole of the curl), so that part alone is solved
  // for, and the big swirls' solve never has to cancel the drainage's weight.
  var row = 0.0;
  for (var i = 0u; i < n; i++) { row += h[fj * n + i] + h[(fj + 1u) * n + i]; }
  let dh = hc - row / f32(2u * n);
  // xy: what the Brinkman solve is given (m/s); w: the solver's own Darcy
  // velocity here from the same part, which the solver already gives the film,
  // so it is taken back out of the push (the solver keeps the film's fine
  // scales, the Brinkman solve gives the frame's).
  src[c] = vec4f(0.0, dh * A.b.w, 0.0, dh * A.c.x);
}
`;

const BRINK_JACOBI = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> src: array<vec4f>;
@group(0) @binding(2) var<storage, read> wIn: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> wOut: array<vec2f>;

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.grid.x;
  let c = id.x;
  if (c >= g * g) { return; }
  let i = i32(c % g);
  let j = i32(c / g);
  let gi = i32(g);
  // No slip at the frame: the film is held there (the cell past the wall is 0).
  var s = vec2f(0.0);
  if (i + 1 < gi) { s += wIn[cellOf(i + 1, j)]; }
  if (i > 0) { s += wIn[cellOf(i - 1, j)]; }
  if (j + 1 < gi) { s += wIn[cellOf(i, j + 1)]; }
  if (j > 0) { s += wIn[cellOf(i, j - 1)]; }
  let al = A.b.z;
  wOut[c] = (src[c].xy + al * s) / (1.0 + 4.0 * al);
}
`;

const EXT = /* wgsl */ `${ARGS}
@group(0) @binding(1) var<storage, read> air: array<vec2f>;
// The film's flow at the frame's scales (the Brinkman solve, projected), and
// the source that holds the Darcy part the solver already gives.
@group(0) @binding(2) var<storage, read> brink: array<vec2f>;
@group(0) @binding(3) var<storage, read> src: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> ext: array<f32>;
${SAMPLE}

// The Brinkman flow, less the solver's own Darcy part (vertical), at a point.
fn bigSwirl(x: vec2f) -> vec2f {
  let g = f32(A.grid.x);
  let p = clamp(x - 0.5, vec2f(0.0), vec2f(g - 1.0));
  let i = vec2i(floor(p));
  let f = p - floor(p);
  let k00 = cellOf(i.x, i.y);
  let k10 = cellOf(i.x + 1, i.y);
  let k01 = cellOf(i.x, i.y + 1);
  let k11 = cellOf(i.x + 1, i.y + 1);
  let w = mix(mix(brink[k00], brink[k10], f.x), mix(brink[k01], brink[k11], f.x), f.y);
  let d = mix(mix(src[k00].w, src[k10].w, f.x), mix(src[k01].w, src[k11].w, f.x), f.y);
  return w - vec2f(0.0, d);
}

@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = A.grid.y;
  let nUf = (n + 1u) * n;
  let nVf = n * (n + 1u);
  let k = id.x;
  if (k >= nUf + nVf) { return; }
  // A film cell is half an air cell.
  let r = f32(A.grid.x) / f32(n);
  if (k < nUf) {
    let j = k / (n + 1u);
    let i = k % (n + 1u);
    let x = vec2f(f32(i), f32(j) + 0.5) * r;
    ext[k] = sampleAir(x).x + bigSwirl(x).x;
  } else {
    let q = k - nUf;
    let j = q / n;
    let i = q % n;
    let x = vec2f(f32(i) + 0.5, f32(j)) * r;
    ext[k] = sampleAir(x).y + bigSwirl(x).y;
  }
}
`;

export const SOAP_AIR_KERNELS = {
  soapAirForce: FORCE,
  soapAirDiv: DIV,
  soapAirJacobi: JACOBI,
  soapAirProject: PROJECT,
  soapAirBrinkSource: BRINK_SOURCE,
  soapAirBrinkJacobi: BRINK_JACOBI,
  soapAirExt: EXT,
} as const;

export type SoapAirKernel = keyof typeof SOAP_AIR_KERNELS;
