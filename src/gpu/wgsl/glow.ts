/**
 * Bioluminescent trails (PLAN 48c): the dinoflagellates in the plate's water,
 * stepped beside the plate's solver and driven by `src/gpu/glow.ts`.
 *
 * The phenomenon. Dinoflagellates (Lingulodinium, Pyrocystis, Noctiluca) flash
 * blue when the water round them is deformed past a threshold: the shear
 * bends the cell wall, a stretch-activated channel fires an action potential
 * across the vacuole membrane, protons flood the scintillons and luciferase
 * lights for about a tenth of a second (Latz, Case and Gran 1994; Maldonado
 * and Latz 2007). The light comes from a store the cell spends and then has
 * to rebuild, over seconds, so a wake that is stirred again at once glows
 * less, and a still sea is dark however full of organisms it is. That is
 * what each cell of this grid holds:
 *
 *   c, the charge, 1 full: dc/dt = −g c / τs + (1 − c) / τr, the share g of
 *     the cell's organisms that the shear has fired spending it in τs, the
 *     rest refilling in τr (Recharge, seconds). Stepped exactly for a step's
 *     g, so no step is too long for it: c' = c∞ + (c − c∞) e^(−k dt), with
 *     k = 1/τr + g/τs and c∞ = (1/τr) / k.
 *   L, the light, a share of a fully charged cell's brightest: what the
 *     firing cells give, g c', or what the last flashes still give as they
 *     fade, L e^(−dt/τf), whichever is more. A flash rises in ten or twenty
 *     milliseconds, under a frame, so only the fade needs its own clock.
 *
 * The shear. Two things deform the plate's water, and both are the solver's:
 *
 *   1. The flow across the plate: its strain rate, from the velocity's
 *      gradient, S = √(2 ux² + 2 vy² + (uy + vx)²) per second. A swirl turns
 *      the water without straining it, and S is nought there, as it is for
 *      the organisms riding it.
 *   2. The flow across the gap. The water sits between two glasses 2 mm
 *      apart (the squeeze film's own gap, per cell), and a gap that thin
 *      carries its flow as Poiseuille's parabola: still on both glasses,
 *      fastest in the middle. Its shear is γw |1 − 2z/h| at height z, γw =
 *      6 U / h at the glass, U the flow's mean speed. So the organisms near
 *      the glass are sheared hardest and those in the middle not at all, and
 *      the share of the gap that passes the threshold γth, with S added in
 *      quadrature, is g = 1 − √(γth² − S²) / γw (all of it once S passes
 *      γth, none while γw cannot reach it). A faster stroke fires more of
 *      the gap, which is why a fast wake is brighter than a slow one.
 *
 * The organisms ride the water: the state is carried back along the plate's
 * flow each step (semi-Lagrangian, as the dye is), so a lit wake drifts and
 * a spent one stays spent where the water took it.
 *
 * Named shortcuts (PLAN 48c-1, 48c-2): the organisms are spread evenly
 * through the water (a real bloom is patchy, and a dye channel could carry
 * them); the threshold is a shear rate, which for seawater's viscosity is
 * the stress the cells answer, whatever the plate's liquid is set to.
 */
import { PLATE_METRES, GAP_METRES, REST_GAP_METRES } from '../fluid/constants';

const ARGS = /* wgsl */ `
struct GlowArgs {
  // the grid's side, 0, 0, 0
  grid: vec4u,
  // travel (uv a unit of velocity moves the dye this step), dt (s), the threshold (1/s), recharge τr (s)
  a: vec4f,
  // spend τs (s), fade τf (s), the step's seconds unclamped (for the flow's speed), 0
  b: vec4f,
};
@group(0) @binding(0) var<uniform> A: GlowArgs;
const PLATE_METRES: f32 = ${PLATE_METRES};
const GAP_METRES: f32 = ${GAP_METRES};
const REST_GAP_METRES: f32 = ${REST_GAP_METRES};
`;

const STEP = /* wgsl */ `${ARGS}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var gap: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> src: array<vec2f>;
@group(0) @binding(4) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(5) var<storage, read_write> light: array<f32>;

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

fn stateAt(i: vec2i, n: i32) -> vec2f {
  let q = clamp(i, vec2i(0), vec2i(n - 1));
  return src[u32(q.y) * u32(n) + u32(q.x)];
}

// The state a uv's water carried here, between cells.
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
  let s = stateBack(uv - v * travel, n);
  // Per second: a unit of velocity moves travel of the plate's uv in dt.
  let perSecond = travel / max(A.b.z, 1e-6);
  // The strain rate across the plate, by central differences a texel apart.
  let h = 1.0 / f32(textureDimensions(vel).x);
  let dx = (velAt(uv + vec2f(h, 0.0)) - velAt(uv - vec2f(h, 0.0))) / (2.0 * h);
  let dy = (velAt(uv + vec2f(0.0, h)) - velAt(uv - vec2f(0.0, h))) / (2.0 * h);
  let strain = sqrt(2.0 * dx.x * dx.x + 2.0 * dy.y * dy.y + (dy.x + dx.y) * (dy.x + dx.y)) * perSecond;
  // The gap's Poiseuille shear at the glass: 6 U / h, U the flow's mean speed in m/s.
  let hm = max(1e-5, textureLoad(gap, vec2i(uv * vec2f(textureDimensions(gap))), 0).r * GAP_METRES);
  let wall = 6.0 * length(v) * perSecond * PLATE_METRES / hm;
  let th = A.a.z;
  var g = 0.0;
  if (strain >= th) {
    g = 1.0;
  } else if (wall > 0.0) {
    g = clamp(1.0 - sqrt(th * th - strain * strain) / wall, 0.0, 1.0);
  }
  // The charge, spent by the firing share and refilled, exactly over the step.
  let rate = 1.0 / max(A.a.w, 1e-3) + g / max(A.b.x, 1e-3);
  let full = (1.0 / max(A.a.w, 1e-3)) / rate;
  let c = clamp(full + (clamp(s.x, 0.0, 1.0) - full) * exp(-rate * dt), 0.0, 1.0);
  let fade = exp(-dt / max(A.b.y, 1e-3));
  let lit = max(g * c, max(0.0, s.y) * fade);
  dst[k] = vec2f(c, lit);
  // What the plate draws: the light of the water's whole depth here, so a
  // gap squeezed thin holds fewer organisms and gives less (at rest, 1).
  light[k] = lit * min(4.0, hm / REST_GAP_METRES);
}
`;

export const GLOW_KERNELS = { glowStep: STEP } as const;
export type GlowKernel = keyof typeof GLOW_KERNELS;
