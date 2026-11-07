/**
 * What every fluid pass is built from: the Sim and Args buffers, noise, the
 * bilinear and packed reads, a thin gap's faces, the workgroup line, and the
 * magnet's energy. Moved from `wgsl/fluid.ts` as they were (PLAN 19ai-6).
 */

import { SPIKES_WGSL } from '../spikes';

/**
 * What every pass gets: the grid, the step, and the forces. One buffer,
 * written once a step (the fields that change between passes of one step
 * travel in `Args`).
 */
export const SIM_STRUCT = /* wgsl */ `
struct Sim {
  n: f32,              // physical grid
  l: f32,              // logical grid the CPU works in (192)
  dt: f32,
  time: f32,
  disp: f32,           // velocity → uv displacement for advection
  visc: f32,
  turbScale: f32,
  spin: f32,
  tension: f32,
  thinGap: f32,        // 1 on a thin gap (PLAN 18a), 0 on legacy plate
  vibI: f32,
  vibF: f32,
  drip: f32,
  air: f32,
  smear: vec2f,
  damping: f32,
  heatDecay: f32,
  maxSpeed: f32,
  evap: f32,
  sharp: f32,
  turbDetail: i32,
  // The lasting current.
  curDamp: f32,
  curBuoy: f32,
  curGrav: f32,
  cometX: f32,        // explicit constant flow force for comet effects
  meanD: f32,
  maxCur: f32,
  rock: vec2f,
  /*
    The two glasses, and how they sit together.

    plateCurve is the shape of the gap they leave at rest. Zero is two flats,
    perfectly parallel, which is what this modelled before and which no real
    pair of clock glasses is: negative makes them touch in the middle and
    open toward the rim, positive makes the rim the tight part and the liquid
    pool in the centre. It decides where dye gathers and which way a press
    throws it.

    gapSpring is how fast they come back apart, and gapMemory how long the
    squeeze that a press made outlives the press.
  */
  plateCurve: f32,
  gapSpring: f32,
  gapMemory: f32,
  cometY: f32,
  // Up the screen, in the plate: the dish is drawn turned, the room is not.
  up: vec2f,
  /*
    The other magnets: one per finger past the first on a touch screen, each
    at the first one's height and strength (x, y, height, strength; strength
    0 is none). The first stays in Args with the pass that uses it; these
    ride the Sim because every magnet pass reads them the same way.
  */
  mags: array<vec4f, 3>,
  // The magnet's radius, every one of them (magnetDisc.ts): Magnet Size's.
  magRadius: f32,
  // 1 where decayDye clears thin mist first (sparse dark looks only; lib/dyeTarget.ts).
  surfaceClear: f32,
  // Lamp intensity scaled by heating rate (PLAN 18f).
  lampHeat: f32,
};
@group(0) @binding(0) var<uniform> S: Sim;

/** What changes between the passes of one step: iteration constants and signs. */
struct Args {
  a: vec4f,            // jacobi's a, or another pass's four numbers
  b: vec4f,            // jacobi's 1/(1+4a), or four more
};
@group(0) @binding(1) var<uniform> A: Args;

fn uvOf(id: vec3u) -> vec2f { return (vec2f(id.xy) + 0.5) / S.n; }
fn inGrid(id: vec3u) -> bool { return id.x < u32(S.n) && id.y < u32(S.n); }
fn clampP(p: vec2i, n: f32) -> vec2i { return clamp(p, vec2i(0), vec2i(i32(n) - 1)); }
/*
  Whether all four numbers are finite, read off the exponent bits.

  The guards this replaces were x == x, which a compiler that assumes no NaN
  (fast math, as Metal's often does) folds to true and deletes, and which
  let an infinity through to the clamp after it, where inf * 0 made the NaN.
  A plate that went non-finite in one cell then stayed non-finite in every
  cell for good: Acid Trip, Solar Flare, Jellyfish Bloom, Boiling Point and
  Lacing Run were 36864 of 36864 cells NaN by their eighth second. The bits
  cannot be optimised away.
*/
fn finite1(x: f32) -> bool {
  return (bitcast<u32>(x) & 0x7f800000u) != 0x7f800000u;
}
fn finite2(v: vec2f) -> bool {
  let e = bitcast<vec2u>(v) & vec2u(0x7f800000u);
  return all(e != vec2u(0x7f800000u));
}
fn finite4(v: vec4f) -> bool {
  let e = bitcast<vec4u>(v) & vec4u(0x7f800000u);
  return all(e != vec4u(0x7f800000u));
}
/*
  Where things enter a step, not only where it ends.

  A seed that piles thirty splats into a cell arrives at many times the dye
  cap, and the tension force scales with that density and the square of the
  colour step beside it: on the first step, before decay had capped
  anything, the force could run the velocity past what its half-float
  texture holds, and an infinity there was the NaN that took the plate.

  The dye gets decay's own cap. The velocity does not get decay's speed
  limit: that is in the units of the end of the step, and applied at every
  write it froze the plate (the fastest cell fell from about 1 to 0.0028 on
  every preset). What a velocity write needs is only to stay finite and
  inside what rgba16float can hold, so the bound is an overflow guard,
  hundreds of times any real speed and far under 65504.
*/
const VEL_BOUND = 1000.0;
fn safeVel(v: vec4f) -> vec4f {
  if (!finite4(vec4f(v.xyz, 0.0))) { return vec4f(0.0); }
  let sp = length(v.xy);
  var o = v;
  if (sp > VEL_BOUND) { o = vec4f(v.xy * (VEL_BOUND / sp), v.z, v.w); }
  o.z = clamp(o.z, -VEL_BOUND, VEL_BOUND);
  return o;
}
fn capDye(d: vec4f) -> vec4f {
  if (!finite4(d)) { return vec4f(0.0); }
  var c = max(d, vec4f(0.0));
  if (c.a > 6.0) { c *= 6.0 / c.a; }
  return c;
}
`;

/** Ashima/McEwan simplex noise, as the GLSL has it (`NOISE` in gpuFluid.ts). */
export const NOISE_WGSL = /* wgsl */ `
fn mod289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v2(x: vec2f) -> vec2f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute3(x: vec3f) -> vec3f { return mod289v3(((x * 34.0) + 1.0) * x); }
fn snoise(v: vec2f) -> f32 {
  let C = vec4f(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  var i1 = vec2f(0.0, 1.0);
  if (x0.x > x0.y) { i1 = vec2f(1.0, 0.0); }
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);
  i = mod289v2(i);
  let p = permute3(permute3(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));
  var m = max(0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m; m = m * m;
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  var g: vec3f;
  g.x = a0.x * x0.x + h.x * x0.y;
  let gyz = a0.yz * vec2f(x12.x, x12.z) + h.yz * vec2f(x12.y, x12.w);
  g = vec3f(g.x, gyz.x, gyz.y);
  return 130.0 * dot(m, g);
}
`;

/**
 * Bilinear from a grid of size n, by uv, with textureLoad. The passes that
 * read a neighbour "one logical cell away" use this rather than a sampler:
 * the same arithmetic, and it asks nothing of the format (a 32-bit field can
 * only be filtered where `float32-filterable` exists).
 */
export const BILERP_N = /* wgsl */ `
fn bilerpN(t: texture_2d<f32>, uv: vec2f, n: f32) -> vec4f {
  let p = uv * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(n - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(n - 1.0)));
  let a = textureLoad(t, vec2i(lo.x, lo.y), 0);
  let b = textureLoad(t, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(t, vec2i(lo.x, hi.y), 0);
  let d = textureLoad(t, vec2i(hi.x, hi.y), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/**
 * Reading a scalar field that is stored as two contiguous colour planes.
 *
 * Every kernel that touches one names its buffer `pr`, so this is a snippet
 * rather than a function taking a pointer — a pointer parameter would have to
 * pick an access mode, and the writers hold theirs `read_write` while the
 * readers hold theirs `read`.
 *
 * There is one copy because there is one chance to get it wrong. The layout is
 * checked once, on the GPU, by `pressureSelfTest` running a packed sweep beside
 * a row-major one and requiring the same field cell for cell — and anything
 * using this snippet inherits that proof. A second hand-written copy would not.
 */
export const PACKED = /* wgsl */ `
fn packedAt(x: i32, y: i32, n: i32) -> f32 {
  // Neumann at the wall: the value outside is the value at the edge, so the
  // gradient across it is zero. The clamp comes first and the colour after
  // it — a neighbour that clamps back into the grid can land on the reader's
  // own colour, which is what happens at x = 0 reading its left.
  let cx = clamp(x, 0, n - 1);
  let cy = clamp(y, 0, n - 1);
  let half = n / 2;
  return pr[((cx + cy) & 1) * n * half + cy * half + (cx >> 1)];
}
`;

/*
  A face's velocity on a thin gap, as the thin solve made it conserve liquid
  (wgsl/thinGap.ts), for the carries that move what the liquid holds across
  faces: the colour, the oil, and the step's count of substeps (carryCourant).
  The ferrofluid's volume carry has used it since PLAN 15d (phaseAdvect, which
  has the derivation): the solve's face flux is the mean of the two cells'
  M·u* less n·M_f·ΔP, and hsGradient left each cell's h·u as the mean of its
  two faces' M_f·ΔP, so the face is the mean of the two cells' h·u plus n/4
  times the second difference of M_f·ΔP along the axis, over the face's gap.

  What the carries had instead: the two cells' velocities filtered [1 2 1]
  along the face, swapped back to the compact gradient with c·P (Rhie–Chow
  on the old solve's pressure). That is exact where the drag c is even, and
  a Finger is a solid in the solve, c forty times smaller inside the hand
  than outside it (hsPrep): across its rim those faces gathered liquid that
  was not there to gather. Measured in the lab on the app's Classic step,
  a pool near the plate's cap (5.5 at its middle) and a Finger drawn through
  it as the pointer drags one, a cell every third step: the colour
  piled past the plate's cap of 6 a cell at the hand's rim, the cap cut it
  (capDye), and the pool lost 43% of itself in a stroke 0.16 of the plate
  long (40.5% on the lab's longer Classic step, `npm run fingerflow`'s
  check 7; Mac CI's `tools` check: 222 → 161). The same flow through these
  faces gathers nothing a converged solve did not.

  Needs `vel` (the flow the carries ride, hsGradient's), `pr` bound to the
  solve's own P, `sq` (the gap), `mob` (the mobility, negative past the
  open rim, where P is held at zero) and the rest gap in A.b.w.
*/
export const THIN_FACE = /* wgsl */ `
fn tfIn(q: vec2i, n: i32) -> bool { return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n; }
fn tfP(q: vec2i, n: i32) -> f32 {
  if (mob[q.x + q.y * n] < 0.0) { return 0.0; }
  let half = n / 2;
  return pr[((q.x + q.y) & 1) * n * half + q.y * half + (q.x >> 1)];
}
// The solve's M_f·ΔP through the face q → q + e; nothing through the grid's wall.
fn tfFace(q: vec2i, e: vec2i, n: i32) -> f32 {
  let b = q + e;
  if (!tfIn(q, n) || !tfIn(b, n)) { return 0.0; }
  let ma = abs(mob[q.x + q.y * n]);
  let mb = abs(mob[b.x + b.y * n]);
  return 2.0 * ma * mb / max(ma + mb, 1e-20) * (tfP(b, n) - tfP(q, n));
}
fn tfGap(q: vec2i) -> f32 { return max(textureLoad(sq, q, 0).r, 0.004) / A.b.w; }
// The velocity through the face a → a + e, both cells inside the grid.
fn thinFaceVel(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  // Nothing through a bubble's core, which the solve shut (hsPrep's standingLiquid, PLAN 15g-8d).
  if (mob[a.x + a.y * n] == 0.0 || mob[b.x + b.y * n] == 0.0) { return 0.0; }
  let ha = tfGap(a);
  let hb = tfGap(b);
  let face = 0.5 * (dot(textureLoad(vel, a, 0).xy, vec2f(e)) * ha + dot(textureLoad(vel, b, 0).xy, vec2f(e)) * hb)
           + 0.25 * f32(n) * (tfFace(a - e, e, n) - 2.0 * tfFace(a, e, n) + tfFace(b, e, n));
  return face / (0.5 * (ha + hb));
}
`;

/** The same, sampled between cells, matching `bilerpN` exactly. */
export const PACKED_BILERP = /* wgsl */ `
fn packedBilerp(uv: vec2f, n: f32) -> f32 {
  let p = uv * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(n - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(n - 1.0)));
  let ni = i32(n);
  let a = packedAt(lo.x, lo.y, ni);
  let b = packedAt(hi.x, lo.y, ni);
  let c = packedAt(lo.x, hi.y, ni);
  let d = packedAt(hi.x, hi.y, ni);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

export const HEAD = SIM_STRUCT;
// phaseSeparate's and phaseGrid's blur of the ferrofluid (each defines raw()).
export const PHASE_MEAN3 = /* wgsl */ `
// The field blurred by the binomial [1 2 1]² kernel, which both cells of a
// pair read alike. The sharpening follows it: the kernel's response to a
// checkerboard is exactly zero, so one is never fed (a plain 3×3 mean passes
// a ninth of it, and the plate grew a checkerboard over the magnet).
fn mean3(p: vec2i, n: i32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let w = f32((2 - abs(i)) * (2 - abs(j)));
    t += w * clamp(raw(clamp(p + vec2i(i, j), vec2i(0), vec2i(n - 1))), 0.0, 1.0);
  } }
  return t / 16.0;
}
`;
export const W = '@compute @workgroup_size(8, 8)';

/*
  What a magnet under the glass does to the ferrofluid, as a drift velocity in
  plate widths a second. m = (x, y, height, strength), vmax the terminal speed.

  The force on a magnetisable liquid is not the field, it is the field's
  *gradient*: a soft magnetic fluid is pulled toward where the field is
  stronger, with a force density that goes as ∇|B|² (the linear, unsaturated
  case, which is where a hand-held magnet at a few centimetres sits). The
  magnet is a cylinder under the plate, pointing up (magnetDisc.ts, PLAN.md 9v;
  until then a dipole a height h below). Seen from a few of its widths off
  it is a dipole, so there |B|² ∝ (r² + 4h²) / (r² + h²)⁴, and its radial
  gradient is

      F(r) ∝ r (r² + 5h²) / (r² + h²)⁵

  toward the magnet. Three things follow, and all three are how a real one
  behaves: the pull is zero directly over the magnet (the liquid pools there
  rather than being yanked through a point), it peaks off-axis, and it
  falls away as the seventh power of distance, so lifting the magnet weakens
  it everywhere and fast. Closer in, within a few of its own widths, the
  field is the magnet's own shape, worked out exactly, not a point's.

  And it does not care which way up the magnet is. A ferrofluid is
  magnetised *by* the field, so its moment always lines up with it and both
  poles attract. (The old model pushed the liquid away with the magnet
  flipped, which no ferrofluid does.)

  The force density is φ ∇ψ, with ψ this energy (times the liquid's
  susceptibility), and it acts on the liquid: the ferrofluid can only go
  where the water it displaces goes. See phaseForce.
*/
/*
  Where a magnet stands the ferrofluid up into domes (wgsl/standing.ts, PLAN
  §9t), the layer's own film moves it there: tension, gravity, the field's
  lift and the glass's wetting, on its thickness, with a cell past full a
  dome. The plate's own keeping of the ferrofluid (the separation's
  sharpening and grid filter, Cahn–Hilliard, the maze's flow, the magnet's
  pull and the advection) would pull every dome back down to full and pack
  the pool, which is the area-keeping layer the film replaces. So each
  exchange between two cells is weighted by how far neither is under the
  film (stand, its window): the same weight read from both sides, so what
  moves is still conserved. The cap at full is raised under it instead
  (phaseRelax). The advection is the one exception: it still carries the
  layer's mean there, which the film does not move (phaseAdvect, carried).
  stand is 0 wherever no film runs and the weight exactly 1, so every
  other look is as it was, to the bit.
*/
export const STAND_ASIDE = /* wgsl */ `
fn aside(p: vec2i, q: vec2i, n: f32) -> f32 {
  return 1.0 - max(textureLoad(stand, clampP(p, n), 0).r, textureLoad(stand, clampP(q, n), 0).r);
}`;
export const MAGNET_WGSL = /* wgsl */ `
// The magnetic energy density a magnet under the glass sets up in the plate,
// up to its constant. m = (x, y, height, strength); its field B is the
// magnet's (magnetDisc.ts) times the strength, on the scale where the hand's
// magnet pressed to the glass is 0.9 (magnetShare, spikes.ts).
//
// And the liquid saturates. A ferrofluid's magnetisation follows a Langevin
// curve: in a weak field it grows with the field, so the energy goes as B²;
// in a strong one every particle is already aligned and it stops growing, so
// the energy goes as B. A hand magnet a few centimetres off is well into the
// second, which is why ψ = B² / (1 + B/Bs): quadratic far away, linear close
// in. Without it the pull right over the magnet was a spike hundreds of times
// the pull a little way off, which no real ferrofluid feels.
//
// Bs is a field, on the same scale as B (PLAN.md 9v): see magnetFieldEnergy
// in spikes.ts, which the solver and npm run disc share.
/*
  The hand's magnet in the solver (spikesClose below; phaseMu). Under it the
  layer stands up into domes, which the film does (wgsl/standing.ts, PLAN
  §9t); this is what the hand's field does past them, where its fingers grow.

  FINGER_REPEL: how many times more the dipoles repel under a magnet close
  enough to raise domes. Rendered in the lab (a pool poured past the domes'
  reach, 384², six seconds, on Classic's settings while the hand's push
  still ran there too; it runs only under a Labyrinth now, fluid.ts
  HAND_SCREEN): at 1 the fingers are black with round tips; at 0 they
  stopped as stubs a finger's width long, and at 5 went out as haze.

  STRIPE_CURVE: see phaseMu, where the double well is steepened for the
  push.

  What was here before the film: wells in μ on spikes.ts's ring lattice
  (SPIKE_WELL 2), the dipoles' repulsion five times over among them
  (SPIKE_REPEL) and the double well steepened 2.5 times (SPIKE_SHARP), so a
  plan view that cannot stand up would pack the pool into domes where the
  lattice put them. The film raises them where the layer does instead.
*/
const STRIPE_CURVE = 0.52;
const FINGER_REPEL = 1.0;
fn magnetRadius() -> f32 { return S.magRadius; }
fn magnetEnergy(uv: vec2f, m: vec4f) -> f32 {
  return magnetFieldEnergy(magnetShare(uv, m));
}
/*
  All the magnets: the one in Args and the fingers' (S.mags). Their fields
  add as vectors and the energy is the sum's (PLAN 38k). Until 38k each
  magnet's energy was added, |B₁|² + |B₂|², which drops the cross term
  2 B₁·B₂: between two like-poled fingers their B_z add, so the field there
  is up to twice either's and the liquid is pulled in between them, where
  the sum of energies drew no such ridge; beside a magnet another's B_ρ
  can cancel its own. The magnets are all poled the same way, as a hand's
  would be. One magnet reads exactly as it did (magnetDiscFieldVec).
*/
fn magnetsEnergy(uv: vec2f, m: vec4f) -> f32 {
  return magnetFieldEnergy(magnetsShare(uv, m, S.mags));
}
${SPIKES_WGSL}
/*
  How far into spikes the closest magnet is on its own axis: 0 for every
  look's own magnet, 1 for the Magnet tool pressed up under the glass. What
  turns the magnet's own push on (phaseMu), and how much of it moves the
  liquid only by flow.
*/
fn spikesClose(m: vec4f) -> f32 {
  var a = spikeAmp(m.xy, m);
  for (var k = 0; k < 3; k++) { a = max(a, spikeAmp(S.mags[k].xy, S.mags[k])); }
  return a;
}
`;
