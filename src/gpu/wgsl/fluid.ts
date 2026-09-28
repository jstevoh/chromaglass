/**
 * The solver, as WGSL compute (docs/webgpu-plan.md, P2).
 *
 * Every kernel here is the twin of a fragment program in `lib/gpuFluid.ts`,
 * pass for pass and line for line, because the two have to agree: the parity
 * harness runs one step through both and compares the fields. Read the GLSL
 * for why a pass does what it does; the comments here cover only what the
 * port changes.
 *
 * What the port changes, everywhere:
 * - A pass is a compute dispatch over the grid, not a full-screen draw. Its
 *   pixel is `id.xy`; where the GLSL had `v_uv`, this has `uvOf(id)`, the
 *   centre of that texel.
 * - Reading a neighbour is `textureLoad` at a clamped integer offset rather
 *   than `texture()` at a uv offset: the same texel, without the sampler.
 * - Where the GLSL relied on bilinear filtering (advection, the half-
 *   resolution current), the WGSL samples with a linear sampler through
 *   `textureSampleLevel(…, 0)`; where it read one logical cell away, the
 *   WGSL does the same arithmetic by hand (`bilerpN`), which asks nothing of
 *   the format.
 * - The deltas arrive at full resolution (`wgsl/splat.ts`), not at 192², so
 *   the three delta passes read them texel for texel.
 * - Ping-pong everywhere, so no pass reads the texture it writes.
 */

import { SPIKES_WGSL } from './spikes';

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
  free9: f32,          // was the fingering push's strength (forcesB)
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
  twist: f32,
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
  // Up the screen, in the plate: the dish is drawn turned, the room is not.
  up: vec2f,
  /*
    The other magnets: one per finger past the first on a touch screen, each
    at the first one's height and strength (x, y, height, strength; strength
    0 is none). The first stays in Args with the pass that uses it; these
    ride the Sim because every magnet pass reads them the same way.
  */
  mags: array<vec4f, 3>,
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
const BILERP_N = /* wgsl */ `
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
const PACKED = /* wgsl */ `
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

/** The same, sampled between cells, matching `bilerpN` exactly. */
const PACKED_BILERP = /* wgsl */ `
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

const HEAD = SIM_STRUCT;
const W = '@compute @workgroup_size(8, 8)';

/*
  What a magnet under the glass does to the ferrofluid, as a drift velocity in
  plate widths a second. m = (x, y, height, strength), vmax the terminal speed.

  The force on a magnetisable liquid is not the field, it is the field's
  *gradient*: a soft magnetic fluid is pulled toward where the field is
  stronger, with a force density that goes as ∇|B|² (the linear, unsaturated
  case, which is where a hand-held magnet at a few centimetres sits). The
  magnet is a dipole a height h below the plate, pointing up, so in the plate
  |B|² ∝ (r² + 4h²) / (r² + h²)⁴, and its radial gradient is

      F(r) ∝ r (r² + 5h²) / (r² + h²)⁵

  toward the magnet. Three things follow, and all three are how a real one
  behaves: the pull is zero directly over the magnet (the liquid pools there
  rather than being yanked through a point), it peaks just off-axis, and it
  falls away as the seventh power of distance, so lifting the magnet weakens
  it everywhere and fast.

  And it does not care which way up the magnet is. A ferrofluid is
  magnetised *by* the field, so its moment always lines up with it and both
  poles attract. (The old model pushed the liquid away with the magnet
  flipped, which no ferrofluid does.)

  The force density is φ ∇ψ, with ψ this energy (times the liquid's
  susceptibility), and it acts on the liquid: the ferrofluid can only go
  where the water it displaces goes. See phaseForce.
*/
const MAGNET_WGSL = /* wgsl */ `
// The magnetic energy density a magnet under the glass sets up in the plate,
// up to its constant. The field is a dipole's a height h below, pointing up:
// |B|² ∝ (r² + 4h²) / (r² + h²)⁴. m = (x, y, height, strength).
//
// And the liquid saturates. A ferrofluid's magnetisation follows a Langevin
// curve: in a weak field it grows with the field, so the energy goes as B²;
// in a strong one every particle is already aligned and it stops growing, so
// the energy goes as B. A hand magnet a few centimetres off is well into the
// second, which is why ψ = B² / (1 + B/Bs): quadratic far away, linear close
// in. Without it the pull right over the magnet was a spike hundreds of times
// the pull a little way off, which no real ferrofluid feels.
const MAGNET_BSAT = 150.0;
/*
  The spikes in the solver (spikeWell, spikesClose below; phaseMu).

  SPIKE_WELL: how deep the spikes' wells are, against the double well's
  barrier of about 0.19: deep enough to empty the valleys of a pool. At 0.8
  the domes only dimpled the pool; at 3 they packed further past full than
  at 2 (1.27 against 1.17, before the relax passes that now hold 2 to 1.01)
  and parted the pool no more.

  SPIKE_REPEL: how many times more the dipoles repel among the spikes
  (where spikeWell's share is), with a magnet that close: it is what parts
  a small pool between its domes ("npm run spikes": the outline 2.62 times
  a disc's at 1, 2.85 at 5). Only among them (PLAN.md §9i): across the whole
  reach of the magnet it drove the pool's edge out as a grey haze past the
  spikes, the fingers' liquid spread to a tenth or a fifth full, which the
  plate (drawing the half-full line) does not draw at all.

  FINGER_REPEL: the same past the spikes, where the fingers grow. Rendered
  in the lab (a pool poured past the spikes' reach, 384², six seconds, on
  Classic's settings while the hand's push still ran there too; it runs
  only under a Labyrinth now, fluid.ts HAND_SCREEN): at 1 the fingers are
  black with round tips; at 0 they stopped as stubs a finger's width long,
  and at 5 went out as haze.

  STRIPE_CURVE: see phaseMu, where the double well is steepened for the
  push.

  SPIKE_SHARP: the double well steepened by up to 1 + this under the
  spikes, so a dome's side is a line and not a slope of grey: the wells set
  the liquid anywhere between empty and full, and with the double well as
  it is more than half the cells round the magnet sat between 0.2 and 0.6.
  Its stiffness is explicit: with M dt at Phase Edge's most (0.018), the
  update's largest factor is (64 + 16 (1 + 1.5)) × 0.018 = 1.87, under the
  2 it must stay below; 2 would be 2.02.
*/
const SPIKE_WELL = 2.0;
const SPIKE_REPEL = 5.0;
const SPIKE_SHARP = 1.5;
const STRIPE_CURVE = 0.52;
const FINGER_REPEL = 1.0;
fn magnetEnergy(uv: vec2f, m: vec4f) -> f32 {
  let toM = m.xy - uv;
  let r2 = dot(toM, toM);
  let h = max(m.z, 0.02);
  let h2 = h * h;
  let q = r2 + h2;
  let q2 = q * q;
  let b2 = (r2 + 4.0 * h2) / (q2 * q2);
  return m.w * b2 / (1.0 + sqrt(b2) / MAGNET_BSAT);
}
// All the magnets: the one in Args and the fingers' (S.mags). Their energies
// add, which is only exact for magnets far enough apart that each one's field
// is small under the others; two fingers close together pull a little less
// than one magnet twice as strong would, which a hand does not notice.
fn magnetsEnergy(uv: vec2f, m: vec4f) -> f32 {
  var e = magnetEnergy(uv, m);
  for (var k = 0; k < 3; k++) {
    if (S.mags[k].w > 0.0) { e += magnetEnergy(uv, S.mags[k]); }
  }
  return e;
}
${SPIKES_WGSL}
/*
  The spikes' hold on the liquid, as a chemical potential: lowest on each
  spike (spikes.ts) and highest in the valleys between them, as deep as the
  field there is into spikes; where two magnets' spikes overlap, the stronger
  field's. What it stands in for is the peak's own height, which a plan view
  of the gap does not have: a peak's surface is pulled up along the field,
  and in a thin layer the liquid under it comes from the valleys round it,
  so the valleys run dry and the pool, seen from above, parts into a field of
  domes. Zero at 0.45 of the way to the valley, so about a third of each
  spike's patch stays in liquid: the domes the references show, a little
  less than half a pitch across, with water between them.
*/
fn spikeWell(uv: vec2f, m: vec4f) -> vec2f {
  let a = spikeAmp(uv, m);
  if (a <= 0.001) { return vec2f(0.0); }
  let s = clamp(spikeTip(uv, m).z / (0.5 * SPIKE_PITCH), 0.0, 1.0);
  return vec2f(a * (2.0 * smoothstep(0.2, 0.7, s) - 1.0), a);
}
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
// (the well, the field's share of full spikes), of whichever magnet is strongest here.
fn spikesWell(uv: vec2f, m: vec4f) -> vec2f {
  var best = spikeWell(uv, m);
  for (var k = 0; k < 3; k++) {
    let w = spikeWell(uv, S.mags[k]);
    if (w.y > best.y) { best = w; }
  }
  return best;
}
`;

/**
 * The kernels. Bindings are always: 0 the Sim, 1 the Args, then the textures
 * a pass reads, then the one it writes, then a sampler if it needs one.
 */
export const KERNELS: Record<string, string> = {
  // dye = max(dye * mul + add, 0), from the full-resolution delta fields.
  deltaDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var mulT: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let d = textureLoad(dye, p, 0);
  textureStore(dst, p, capDye(d * textureLoad(mulT, p, 0).r + textureLoad(addT, p, 0)));
}`,

  // vel.xy += add.xy ; temp (vel.z) += add.z
  deltaVel: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let a = textureLoad(addT, p, 0);
  textureStore(dst, p, safeVel(vec4f(v.xy + a.xy, v.z + a.z, 0.0)));
}`,

  // The plate gap and its rate of change. A.a.x is 1 when there is a delta to fold in.
  /*
    The gap between the two glasses, and how a press changes it.

    Three things were wrong here and all three were felt as "pressing does
    not do enough".

    **The plates were flats.** The gap was a constant, so the two glasses sat
    perfectly parallel — which no real pair of clock glasses does. The rest
    gap is a dome now: `plateCurve` below zero makes them touch in the middle
    and open toward the rim, above zero makes the rim the tight part. That is
    what decides where dye gathers and which way a press throws it, and with
    a flat gap a press could only ever push radially outward from wherever
    the finger was.

    **The press was over in a twelfth of a second.** The gap sprang back a
    fixed 0.005 a step across a range of 0.025, so it fully recovered in five
    steps, and `dhdt` — the squeeze that actually moves liquid — halved every
    step, a seventeen-millisecond half-life. Both are rates now, from
    `gapSpring` and `gapMemory`.

    **And the release did nothing.** `dhdt` was only ever written from the
    press delta, so the plates coming back apart contributed nothing: liquid
    was pushed out and never drawn back. The spring's own motion goes into
    `dhdt` here, so a press now pushes and its release pulls — which is what
    a squeeze between two wet glasses does, and why it redistributes dye
    instead of simply shoving it.
  */
  /*
    The gap at rest, laid down directly.

    The plate used to be filled with a flat 0.03 and then *spring* toward the
    dome, and the two disagreeing is a pump: at the middle the gap grows,
    which draws liquid in, and at the rim it shrinks, which pushes liquid off
    the edge. With the spring turned into a slow rate that is several seconds
    of the plate sucking toward its middle on every start, clear and look
    change — reported from the front as "all of the liquid is getting pulled
    toward a drain in the center", and measured as 10-20% more inward flow
    than a flat plate.

    So the fill knows the shape. A plate that starts at rest has nothing to
    settle toward and pumps nothing.
  */
  /*
    The glasses change shape, and the liquid between them keeps its dents (F).

    Re-laying the gap outright was the first version and it is a trap: the
    plate shape is a per-plate patch target, so the room camera or a sound
    mapping can drive it every frame — and re-laying writes the rest shape
    *and zeroes the rate*, which would wipe a live press sixty times a second
    for as long as the modulation ran.

    So a change of shape is a shift rather than a reset: every cell moves by
    the difference between the old rest and the new one, which leaves whatever
    a press had pushed it away from rest exactly where it was. The rate is not
    touched, because changing which glasses are on the desk is not a squeeze
    and should not pump the liquid.

    A.a.x is the shape it was laid at, A.a.y the shape it is going to.
  */
  gapReshape: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  let k = (r2 - 0.5) * 2.0;
  let was = clamp(0.03 * (1.0 - A.a.x * k), 0.004, 0.06);
  let now = clamp(0.03 * (1.0 - A.a.y * k), 0.004, 0.06);
  let s = textureLoad(src, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), vec4f(clamp(s.r + (now - was), 0.004, 0.06), s.g, 0.0, 0.0));
}`,

  gapRest: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  // Negated, because the sign was the other way round to every description
  // of it. types.ts and the two notes above all say the same thing — below
  // zero the glasses touch in the middle and open toward the rim, above zero
  // the rim is the tight part and the liquid pools in the centre — and the
  // formula did the opposite at both ends. Nothing could tell: the dome fed
  // the squeeze film and no look sets it, and depth did not reach the flow
  // until depth became a mobility on the transport, so the shape has
  // never been visible.
  let rest = clamp(0.03 * (1.0 - S.plateCurve * (r2 - 0.5) * 2.0), 0.004, 0.06);
  textureStore(dst, vec2i(id.xy), vec4f(rest, 0.0, 0.0, 0.0));
}`,

  /*
    The second phase: a heavy, immiscible liquid a magnet can pull (H7,
    docs/bubbles-plan.md B).

    It is one number a cell, how much of the dark phase is there, advected by
    the same flow as everything else — and then two things that are not
    advection, because a phase that only advects is a phase that blurs away.

    ── The magnet, and what it moves ──

    The magnet pulls the ferrofluid, and the pull is the gradient of the field
    squared (magnetEnergy, above, which says why), in real seconds: a slow
    look keeps the flow's own step tiny, and a magnet scaled by it crept, so a
    hand dragging it left the liquid behind.

    It moves the ferrofluid by moving the liquid (phaseForce). The note that
    used to sit here said a magnetic force on the velocity would be deleted by
    the projection, because a radial force is curl-free. That holds for a
    liquid that is magnetic everywhere, and this one is magnetic only where
    the ferrofluid is: the force density is φ ∇ψ, its curl is ∇φ × ∇ψ on the
    drop's edge, and the projection keeps exactly that part, which carries
    the drop toward the magnet and the water around it. The flow carries the
    ferrofluid in flux form (phaseAdvect), and its own pressure keeps it from
    packing past full (phaseRelax).

    A.a = (magnet x, magnet y, height, strength), A.b.y the displacement the
    flow advects by.
  */
  /** A soft disc of the second phase, poured onto the plate. A.a = (x, y, r, amount). */
  phaseSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let add = select(0.0, (1.0 - d * d) * A.a.w, d < 1.0);
  textureStore(dst, vec2i(id.xy), vec4f(clamp(textureLoad(src, vec2i(id.xy), 0).r + add, 0.0, 1.0), 0.0, 0.0, 0.0));
}`,

  /*
    The flow carries the ferrofluid, in flux form.

    Not a backtrace, as the dye's is: a backtrace through any divergence the
    projection leaves behind makes liquid or loses it, and with the magnet
    pulling hard that was the whole story (see phaseForce). A finite-volume
    step moves liquid across faces instead, each face's flux computed the
    same way from both sides, so what leaves a cell arrives next door and the
    plate's total is exact whatever the flow is doing. Second order (a
    minmod-limited slope, MUSCL), so the edges stay sharp, and no flux
    through the walls.

    A.b.y is the flow's displacement per unit velocity (uv), as advect's.
  */
  phaseAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}
fn ph(p: vec2i, n: i32) -> f32 { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).r; }
fn minmod(a: f32, b: f32) -> f32 { return select(0.0, select(max(a, b), min(a, b), a > 0.0), a * b > 0.0); }
// The flux across the face between cell a and cell a + e, in the +e direction.
fn flux(a: vec2i, e: vec2i, n: i32) -> f32 {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return 0.0; }
  // The face's velocity, filtered [1 2 1] along the face: the collocated
  // projection leaves the flow a mode that alternates cell to cell, which the
  // two cells' plain mean passes across the other axis, and where the magnet
  // crowds the ferrofluid it printed a grid into the pool. The filter is
  // linear, so the flux field is as divergence-free as the flow it came from.
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  /*
    And corrected by the last projection's pressure (Rhie–Chow). That
    projection subtracted the wide gradient, (p[j+1] − p[j−1]) / 2, from
    each cell, but solved the compact Laplacian, so the flow it left has a
    divergence of (L_compact − L_wide) p on the stencil this flux uses, all
    of it at the finest scale: where a force is sharp (every finger of the
    maze, the rim of a pool on the magnet) the flux step printed a grid of
    lines through the black. Swapping the two cells' wide gradients for the
    face's compact one makes the face flux divergence-free on this stencil.
  */
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  if (c >= 0.0) {
    let s = minmod(ph(a, n) - ph(a - e, n), ph(b, n) - ph(a, n));
    return c * (ph(a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = minmod(ph(b, n) - ph(a, n), ph(b + e, n) - ph(b, n));
  return c * (ph(b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let dx = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n);
  let dy = flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  // Not clamped at zero: that made ferrofluid wherever the limiter
  // undershot. phaseRelax fills a dip below empty from its neighbours instead.
  textureStore(dst, p, vec4f(ph(p, n) - dx - dy, 0.0, 0.0, 0.0));
}`,

  /*
    The magnet as a force on the liquid, where the ferrofluid is.

    φ ∇ψ, applied as it is: on a smoothed φ, with ∇ψ from the magnet's own
    smooth energy. For a while it was −ψ ∇φ instead (equal up to a gradient
    the projection removes), on the argument that a force on a one-cell
    edge is all finest scale; but over the magnet ψ is hundreds, so every
    ripple in a gathered pool became a large fine-scale force, which a
    collocated projection cannot remove, and the pool on the magnet printed
    a grid of holes (and the flux step, asked to carry it, lost liquid).
    This form puts the gradient on ψ, which is smooth everywhere, and has
    the same curl, which is all that survives the projection.

    A.a = the magnet, A.b.x = gain, A.b.y = the most one step may add.
  */
  phaseForce: `${HEAD}${MAGNET_WGSL}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
fn ph(p: vec2i, n: f32) -> f32 { return clamp(textureLoad(phase, clampP(p, n), 0).r, 0.0, 1.0); }
fn phs(p: vec2i, n: f32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) { t += ph(p + vec2i(i, j), n); } }
  return t / 9.0;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let v = textureLoad(vel, p, 0);
  let uv = uvOf(id);
  let h = 1.0 / n;
  let gpsi = vec2f(magnetsEnergy(uv + vec2f(h, 0.0), A.a) - magnetsEnergy(uv - vec2f(h, 0.0), A.a),
                   magnetsEnergy(uv + vec2f(0.0, h), A.a) - magnetsEnergy(uv - vec2f(0.0, h), A.a)) * (0.5 * n);
  var f = phs(p, n) * gpsi * A.b.x;
  let fl = length(f);
  if (fl > A.b.y) { f = f * (A.b.y / fl); }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  /*
    And never past full: the pressure inside the ferrofluid.

    The flux step conserves the liquid exactly, but the flow it rides is only
    as incompressible as the projection makes it, and where the magnet pulls
    hardest what is left over converges: measured, the pool on the magnet
    packed to three times full. A real one cannot, because it is
    incompressible and its own pressure pushes the excess outward. That is
    this: whatever a cell holds above full diffuses to its neighbours, each
    pair's exchange computed the same way from both sides, so it conserves;
    and a full neighbour passes it on in the next iteration until it reaches
    one with room. A dip below empty (the flux step's limiter undershooting)
    is filled from the neighbours the same way.
  */
  phaseRelax: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
// What a cell holds outside 0..1: above full (positive) or below empty
// (negative), and whether the neighbour exists at all.
fn bad(p: vec2i, n: i32) -> vec2f {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) { return vec2f(0.0, 0.0); }
  let c = textureLoad(src, p, 0).r;
  return vec2f(max(c - 1.0, 0.0) + min(c, 0.0), 1.0);
}
fn pair(a: f32, b: vec2f) -> f32 { return select(0.0, 0.24 * (a - b.x), b.y > 0.5); }
fn over(p: vec2i, n: i32) -> vec2f { return bad(p, n); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let c = textureLoad(src, p, 0).r;
  let e = max(c - 1.0, 0.0) + min(c, 0.0);
  let out = pair(e, over(p + vec2i(1, 0), n)) + pair(e, over(p - vec2i(1, 0), n))
          + pair(e, over(p + vec2i(0, 1), n)) + pair(e, over(p - vec2i(0, 1), n));
  textureStore(dst, p, vec4f(c - out, 0.0, 0.0, 0.0));
}`,

  phaseSeparate: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
/*
  Tension smooths the edge by its curvature; sharpening pushes back against
  what the advection blurred; the balance sets the edge. Both are written as
  exchanges between neighbours, each computed the same from both sides, so
  nothing is made or lost.

  They were not, before. The first version pulled each cell toward 0 or 1
  with a pointwise cubic, and the phase evaporated in six seconds. The
  second was diffusion plus anti-diffusion clamped to the neighbourhood's
  range, and the clamp was a leak: on a machine drawing ten frames a second
  the magnet's drag lost an eighth of the ferrofluid (CI: 86% kept, and
  113% on another run). Now sharpening moves liquid from the emptier cell
  of a pair to the fuller one, at most in proportion to what the emptier
  has and the room the fuller has left, which keeps every cell inside 0..1
  without a clamp (a quarter of that each way, over four neighbours).
*/
fn raw(p: vec2i) -> f32 { return textureLoad(src, p, 0).r; }
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
fn exchange(p: vec2i, q: vec2i, sp: f32, n: i32) -> f32 {
  // What flows into p from its neighbour q.
  let a = raw(p);
  let b = raw(q);
  let sq = mean3(q, n);
  let lo = min(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0));
  let hi = max(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0));
  let sharpen = 0.25 * clamp(A.a.x, 0.0, 1.0) * min(1.0, 3.0 * abs(sp - sq)) * min(lo, 1.0 - hi);
  let toFuller = select(-sharpen, sharpen, sp > sq);
  // And the grid-scale part alone diffused away: the raw difference less
  // the blurred one. The collocated projection cannot see a checkerboard
  // pressure, so where the magnet crowds the ferrofluid the flow carries a
  // checkerboard into it, which the old clamp hid and this removes: at an
  // eighth a pair, exactly one step's worth of a checkerboard.
  let grid = 0.125 * ((b - a) - (sq - sp));
  return toFuller + 0.125 * clamp(A.a.y, 0.0, 1.0) * (b - a) + grid;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let c = raw(p);
  let sp = mean3(p, n);
  var d = 0.0;
  if (p.x > 0) { d += exchange(p, p - vec2i(1, 0), sp, n); }
  if (p.x < n - 1) { d += exchange(p, p + vec2i(1, 0), sp, n); }
  if (p.y > 0) { d += exchange(p, p - vec2i(0, 1), sp, n); }
  if (p.y < n - 1) { d += exchange(p, p + vec2i(0, 1), sp, n); }
  textureStore(dst, p, vec4f(c + d, 0.0, 0.0, 0.0));
}`,

  squeezeUpdate: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let s = textureLoad(sq, vec2i(id.xy), 0);
  // Where this cell sits on the plate: 0 in the middle, 1 at the rim.
  let d = uvOf(id) - vec2f(0.5);
  let r2 = clamp(dot(d, d) * 4.0, 0.0, 1.0);
  // The dome the two glasses leave when nothing is pressing on them.
  let rest = clamp(0.03 * (1.0 - S.plateCurve * (r2 - 0.5) * 2.0), 0.004, 0.06);
  var gap = s.r;
  var dhdt = s.g * S.gapMemory;
  if (A.a.x > 0.5) {
    let dg = textureLoad(addT, vec2i(id.xy), 0).a;
    if (dg != 0.0) {
      // A press closes the gap (down to the floor); the one thing that
      // opens it is a press's lift (lib/squish.ts), and that brings the
      // glass back up to where it rests, never past it. Uncapped, at the
      // default look's spring (half back to rest in about 1,450 steps, 24 s)
      // the lift opened the film to 0.081 against a rest of 0.030 and held
      // it for tens of seconds, and to 0.053 even on the lab's spring, forty
      // times the app's (check-skeptic, pre-push review). A gap already past
      // rest is left where it is, not pulled down.
      var g2 = max(0.004, gap + dg);
      if (dg > 0.0) { g2 = min(g2, max(gap, rest)); }
      dhdt += (g2 - gap) / max(S.dt, 0.0001);
      gap = g2;
    }
  }
  // The spring back toward the dome, and its motion counts.
  let g3 = gap + (rest - gap) * S.gapSpring;
  dhdt += (g3 - gap) / max(S.dt, 0.0001);
  textureStore(dst, vec2i(id.xy), vec4f(g3, dhdt, 0.0, 0.0));
}`,

  /*
    The squeeze film's pressure, as red-black Gauss-Seidel on packed planes.

    Hele-Shaw is the same Poisson operator as the projection, in the same
    Neumann box — only the source differs — so it gets the same treatment,
    and for the same reasons. Ten Jacobi passes ping-ponging two textures
    become five sweeps updating one buffer in place: half the arithmetic for
    about the same convergence, and the buffer's two colour planes keep each
    sweep's writes contiguous rather than spread across every other word.

    It warm-starts. The Jacobi did too — it never cleared between steps, it
    ping-ponged onward from wherever the last step left off — and in-place
    sweeps carry that on for free with no swap.

    The source is negated where the projection's is added, which is the only
    line here that is not the projection.
  */
  squeezeRedBlack: `${HEAD}
@group(0) @binding(2) var sq: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
${PACKED}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let half = n / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let parity = i32(A.a.x);
  let y = i / half;
  let x = 2 * (i % half) + ((y + parity) & 1);
  let sv = textureLoad(sq, vec2i(x, y), 0);
  let h = sv.r;
  let src = clamp(12.0 * S.visc * sv.g / (h * h * h), -100.0, 100.0);
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  pr[parity * n * half + i] = (s - src) * 0.25;
}`,

  /** `squeezeVel`, reading the pressure from the buffer the sweeps wrote. */
  squeezeVelBuf: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}${PACKED_BILERP}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  let v = textureLoad(vel, p, 0);
  let e = vec2f(1.0 / S.l, 0.0);
  let gx = (packedBilerp(uv + e, S.n) - packedBilerp(uv - e, S.n)) * 0.5;
  let gy = (packedBilerp(uv + e.yx, S.n) - packedBilerp(uv - e.yx, S.n)) * 0.5;
  let h = textureLoad(sq, p, 0).r;
  let coeff = -(h * h) / (12.0 * S.visc);
  textureStore(dst, p, safeVel(vec4f(v.xy + coeff * vec2f(gx, gy), v.z, v.w)));
}`,

  /*
    Where air is, dye is not — and it went somewhere (H6 · A).

    A bubble is a hole, so the liquid under it has to leave. The first
    version of this scaled the dye down: dye *= 1 - air. That empties a
    bubble perfectly and it is wrong, because the dye does not go anywhere —
    it is destroyed. A bubble that drifts on leaves a scar of clear plate
    behind it, and a plate with bubbles on it slowly loses all its colour.

    Measured, which is how it was caught: with the bubbles cleared away, the
    cells they had been standing on read 0.002 against 0.792 around them. The
    dye never came back because there was none left to come back.

    So this moves the dye instead. Between each pair of neighbouring cells,
    liquid flows from the one with more air in it to the one with less, in
    proportion to the difference — the same exchange in both directions, so
    what one cell loses another gains and the total is unchanged. Run every
    step, it walks the dye out of a bubble and piles it against the rim,
    which is where the plan wants it: the bright ring around a bubble is
    real dye that was pushed there, and it moves with the liquid.

    A.a.x is bubbleClear, the rate. The four flows are each at most a
    quarter of the cell, so nothing can push a cell below zero.
  */
  /*
    Where air is, dye is not (H6 · A).

    A multiply, and it was a multiply before, and the round trip is the
    lesson. `dye *= 1 - air` empties a bubble perfectly — measured 0.000
    against 1.492 — and destroys what it removes, so a bubble that drifts on
    leaves a scar of clear plate and a plate with bubbles slowly loses its
    colour. The check caught that, so the multiply was replaced by a
    conserving exchange between neighbours, from more air to less.

    That exchange conserves and **cannot empty a bubble**, for a reason that
    is structural rather than a matter of tuning: it is driven by the
    *difference* in air between neighbouring cells, and the inside of a
    bubble is uniformly air, so there is no difference to flow down. The
    radial profile says it exactly. With the air at 1.00 in the middle of a
    bubble, the dye there measured **0.990** of what the same plate had with
    no bubble on it — untouched — while the rim, where the gradient is, sat
    at 0.85. A hole with its middle intact is not a hole.

    Three things were tried before believing that. A velocity down the air
    gradient does nothing at all, because a gradient field is precisely what
    the pressure projection removes. A source in the divergence the
    projection solves does reach the flow and still leaves the middle: the
    velocity of a radially symmetric source is zero at its centre, and the
    dye's advection is semi-Lagrangian, which transports a value along a
    characteristic and has no term to dilute it — so the centre cell
    backtraces onto itself and keeps its dye for ever. Blurring the air
    field to manufacture a slope made it worse.

    So: the multiply, which needs no transport and therefore reaches the
    middle, and the dye it displaces is kept by the plate's own budget
    servo rather than here — see `evapFactor` in `LiquidVisualizer`. The
    conservation is global rather than at the rim; a rim ring of real
    displaced dye is written up in `bubbles-plan.md` as what is left.

    `A.a.x` is `bubbleClear`: 1 is the physical answer, and lower keeps some
    of the old shading for a look that wants it.
  */
  airExclude: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var air: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let a = clamp(textureLoad(air, p, 0).r, 0.0, 1.0);
  let here = textureLoad(dye, p, 0);
  let keep = 1.0 - clamp(A.a.x, 0.0, 1.0) * a;
  textureStore(dst, p, max(here * keep, vec4f(0.0)));
}`,

  /*
    Where the ferrofluid is, dye is not: it is pushed aside (Ferro Pushes Dye).

    Steve's reference for Ferro Paint is Chemical Bouillon's "Colored I" and
    "II": black ferrofluid worked through coloured water, and the black
    carries the colour. It pushes it into cells between its channels and
    packs it bright along its edges. On the plate as it was, the ferrofluid
    and the dye were two fields that never met. Measured in the lab (a plate
    of even dye, eighteen drops, a magnet walking a circle, 360 steps): dye
    under the black sat at 0.81–1.01 of its share of the area, and the water
    within two cells of the black held 0.84–1.01 of the dye of the water far
    from it. The black was a picture laid over still colour.

    Most of the ferrofluid's motion is not flow, which is why the shared
    velocity did not carry the dye with it. The maze's fingers grow and the
    drops round by Cahn–Hilliard, an exchange of phase between neighbouring
    cells down a chemical potential, and no liquid moves to do it. So the dye
    has to be told directly where the ferrofluid went.

    Two conserving exchanges between neighbours, per channel, so no dye is
    made or lost here:

    - Down the slope of open water (A.a.x). Each cell gives each neighbour
      with more water than it has k·(its dye)·(the difference), and takes
      the same from each neighbour with less. Where a finger grows into
      coloured water, the water there falls below the water ahead of it and
      the dye goes ahead and aside. Where the black retreats, the cell it
      leaves has more water than its neighbours and the dye comes back in.
      Across open water there is no slope and nothing moves, so the colour
      piles up in the first cells past the edge: the packed bright rim.
      The sum of what one cell gives is at most 4k, so k stays at or under
      a quarter.

    - Along the inside of the black (A.a.y). The exchange above cannot empty
      the middle of a pool, because a pool is uniformly full and there is no
      slope inside it: this is the lesson airExclude records, where a
      conserving exchange left the middle of a bubble at 0.99 of its dye.
      The bubbles gave up on conserving and multiply. Here the middle is
      drawn black all through, so it does not have to empty at once, only
      eventually: a plain diffusion of the dye, weighted by the smaller of
      the two cells' phase so it runs only inside the ferrofluid, walks the
      dye out to the edge, where the first exchange puts it in the water.
      Dye poured under a pool comes out over some seconds; the dye a growing
      finger meets never gets in, because the finger's tip is all slope.
  */
  phaseDisplace: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;

fn fe(q: vec2i) -> f32 { return smoothstep(0.3, 0.6, textureLoad(phase, clampP(q, S.n), 0).r); }

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let here = textureLoad(dye, p, 0);
  let fh = fe(p);
  let k = A.a.x;
  let d = A.a.y;
  var keep = 1.0;
  var got = vec4f(0.0);
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let q = clampP(p + offs[i], S.n);
    let fq = fe(q);
    let there = textureLoad(dye, q, 0);
    // Open water is 1 - phase, so more water there is less phase there.
    keep -= k * max(fh - fq, 0.0) + d * min(fh, fq);
    got += there * (k * max(fq - fh, 0.0) + d * min(fh, fq));
  }
  textureStore(dst, p, max(here * keep + got, vec4f(0.0)));
}`,

  // x = (x0 + a Σ neighbours) / (1 + 4a), per channel. A.a is a, A.b is 1/(1+4a).
  jacobi: `${HEAD}
@group(0) @binding(2) var x: texture_2d<f32>;
@group(0) @binding(3) var x0: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(x, clampP(p - vec2i(1, 0), S.n), 0) + textureLoad(x, clampP(p + vec2i(1, 0), S.n), 0)
        + textureLoad(x, clampP(p - vec2i(0, 1), S.n), 0) + textureLoad(x, clampP(p + vec2i(0, 1), S.n), 0);
  textureStore(dst, p, (textureLoad(x0, p, 0) + A.a * s) * A.b);
}`,

  // The velocity's divergence, with the wall's ghost cells (velG in the GLSL).
  /*
    The divergence the projection solves, with the air pushing on it (H6 · A).

    A bubble displaces liquid. In the liquid's own terms that is a **source**
    where the air is arriving and a sink where it is leaving, and the right
    place to say so is here: the projection solves for the pressure whose
    gradient produces exactly that flow, so the liquid is pushed aside and
    then goes round.

    Three other ways were tried first and all are written up in
    `bubbles-plan.md`. The one worth repeating here is adding a velocity down
    the air gradient, which does nothing whatever — a gradient field is
    precisely what this projection exists to remove, so the next one cancels
    it. A source has to go in before the solve, not a velocity after it.

    `A.a.x` is the strength and `A.a.y` the reciprocal timestep; the rate is
    how much air arrived since the last frame. With no bubbles the two fields
    are identical and the term is zero, so this costs two samples and changes
    nothing.
  */
  divergence: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var air: texture_2d<f32>;
@group(0) @binding(4) var airPrev: texture_2d<f32>;
/*
  The squeeze film (the press), because a gradient added to the velocity is
  not a press — it is a thing the next projection deletes.

  The plates closing pushes liquid out from between them, which in the plane
  is a source, exactly as a growing bubble is. It used to be applied as
  v += -(h squared/12mu) grad p, in squeezeVelBuf, one stage before the
  first projection — a pure
  gradient field handed straight to the operator whose whole job is to remove
  curl-free flow. Measured: pressing seventy-five times harder moved the same
  1% of the dye, because the strength was never what was being thrown away.
*/
@group(0) @binding(5) var sq: texture_2d<f32>;
// Last, because the convention here is every texture a pass reads and then
// the one it writes — and run() binds them in exactly that order. Leaving
// this at 3 put a sampled texture on a storage slot, which fails as
// "usage doesn't include TextureUsage::StorageBinding" and leaves the field
// empty with nothing else to show for it.
@group(0) @binding(6) var dst: texture_storage_2d<r32float, write>;
// Past the edge: the edge value with the wall-normal component negated, so the
// velocity interpolated at the wall is zero.
fn velG(p: vec2i, n: f32) -> vec2f {
  var v = textureLoad(vel, clampP(p, n), 0).xy;
  if (p.x < 0 || p.x > i32(n) - 1) { v.x = -v.x; }
  if (p.y < 0 || p.y > i32(n) - 1) { v.y = -v.y; }
  return v;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let dx = velG(p + vec2i(1, 0), S.n).x - velG(p - vec2i(1, 0), S.n).x;
  let dy = velG(p + vec2i(0, 1), S.n).y - velG(p - vec2i(0, 1), S.n).y;
  /*
    This stores -div(v)·h², so a source q enters as +q·h². Positive where the
    air is growing: liquid appearing, which is liquid being pushed out.
  */
  let now = clamp(textureLoad(air, p, 0).r, 0.0, 1.0);
  let was = clamp(textureLoad(airPrev, p, 0).r, 0.0, 1.0);
  /*
    Two terms, and the second is the one that empties a bubble.

    The rate — how much air arrived since last frame — is the physical one: a
    growing bubble displaces liquid, a popping one lets it back. It is also
    only there while the bubble is *changing*, and a bubble that has arrived
    and sits still has no rate at all. Measured on its own it moved the
    interior from 0.70 to 0.67, which is nothing.

    So there is a standing term as well: a source everywhere the air is, a
    sink everywhere it is not, which keeps liquid flowing out of a bubble and
    around it for as long as it is there. A.a.z is the fraction of the
    plate that is air, subtracted so the two balance — a source that does not
    average to zero has no solution for the projection to find, which is the
    Neumann condition pressureSelfTest exists to protect.
  */
  /*
    Zero-mean, as the standing term below already is.

    A source the projection solves has to average to zero over the plate or
    there is no solution to find, which is the Neumann condition
    pressureSelfTest protects. The standing term has the air fraction taken
    off for exactly that reason and this one never did: while a bubble grows
    it is a net source over the whole plate with nothing to balance it, and
    the solve spends itself on the imbalance rather than on the shape.

    A.b.x is that mean, which is how fast the plate's air fraction is
    changing, and the CPU has it from the bubble list for nothing.
  */
  let rate = clamp((now - was) * A.a.y - A.b.x, -40.0, 40.0);
  let standing = (now - A.a.z) * 30.0;
  /*
    And the press, as mass conservation says it is: closing a gap of height h
    at a rate dh/dt pushes out −(1/h)(dh/dt) per unit area.

    A.b.y is the plate's mean of that, subtracted for the same reason the air's
    is — a Neumann problem whose source does not average to zero has no
    solution for the projection to find, and a press is a net source over the
    whole plate with nothing to balance it.
  */
  let sqv = textureLoad(sq, p, 0);
  let squeeze = clamp(-sqv.g / max(sqv.r, 0.004) - A.b.y, -60.0, 60.0) * A.b.z;
  let q = (rate + standing) * A.a.x + squeeze;
  textureStore(dst, p, vec4f(-0.5 * (dx + dy) / S.n + q / (S.n * S.n), 0.0, 0.0, 0.0));
}`,

  pressureJacobi: `${HEAD}
@group(0) @binding(2) var pr: texture_2d<f32>;
@group(0) @binding(3) var dv: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(pr, clampP(p - vec2i(1, 0), S.n), 0).r + textureLoad(pr, clampP(p + vec2i(1, 0), S.n), 0).r
        + textureLoad(pr, clampP(p - vec2i(0, 1), S.n), 0).r + textureLoad(pr, clampP(p + vec2i(0, 1), S.n), 0).r;
  textureStore(dst, p, vec4f((textureLoad(dv, p, 0).r + s) * 0.25, 0.0, 0.0, 0.0));
}`,

  /*
    The pressure solve, as red-black Gauss-Seidel (H2, docs/roadmap.md).

    Twenty-four Jacobi passes were 48 of a step's hundred-odd dispatches and
    28.8% of its time, which H0 measured and which makes this the largest
    single block of work in the frame. Jacobi reads the whole field from last
    iteration and writes a new one; Gauss-Seidel reads neighbours that have
    already been updated this sweep, which converges about twice as fast for
    the same arithmetic. The catch is that it has to write in place, and a
    cell cannot read a texture it is writing.

    So the pressure lives in a storage buffer here rather than a texture.
    Red-black is what makes that safe: colour the grid like a chessboard and
    no two cells of the same colour are neighbours, so a sweep over the red
    cells reads only black ones and can write itself without a hazard. Two
    dispatches an iteration, each over half the grid — the same total work as
    one Jacobi pass, for twice the convergence.

    `A.a.x` is the parity: 0 sweeps red, 1 sweeps black. The thread index is
    mapped onto its own colour rather than dispatched over the whole grid and
    turned away at the door, which would spend half the threads doing
    nothing and give back the factor this exists to win.

    ── Why the two colours are stored apart ──

    That still left a red-black sweep costing **1.64x** a Jacobi pass for the
    same number of cell updates, which is most of the reason the projection
    came down 18% where the arithmetic promised 50%. It was never the maths.
    With the grid stored in row order, a sweep touches every other word:
    sixty-four consecutive threads wrote sixty-four floats spread across a
    hundred and twenty-eight, so every cache line and every coalesced write
    carried half a line of the other colour along with it and threw it away.

    So the buffer holds the colours as two contiguous planes instead — all
    the red cells in row order, then all the black. The mapping is a
    relabelling and nothing else: the same cells, the same neighbours, the
    same arithmetic in the same order, so the field it produces is identical
    word for word, which is what `pressureSelfTest` checks rather than taking
    on faith. What changes is the address arithmetic, and with it thread `i`
    writes word `i` of its plane. Reads follow: the vertical neighbours of a
    run of threads are themselves a run, and the horizontal ones are the same
    run offset by one.
  */
  pressureRedBlack: `${HEAD}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
${PACKED}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let half = n / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let parity = i32(A.a.x);
  let y = i / half;
  // The row's own colour decides which column this thread owns, so the two
  // sweeps together cover every cell exactly once.
  let x = 2 * (i % half) + ((y + parity) & 1);
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  // y * half + (x >> 1) is i again, which is the whole point: thread i
  // writes word i of its plane, so a workgroup's 64 writes are 64 adjacent
  // words rather than 64 words spread across 128.
  pr[parity * n * half + i] = (textureLoad(dv, vec2i(x, y), 0).r + s) * 0.25;
}`,

  /*
    Multigrid for the pressure (H2, docs/roadmap.md).

    Twelve red-black sweeps from a cold start smooth the error a few cells
    across and leave anything larger almost untouched, because a sweep only
    moves information one cell. So the projection was only ever
    incompressible at the finest scales, and a strong local force showed it:
    the magnet's force made twenty times the dye the plate was given in two
    seconds, and forty-eight sweeps only slowed that. Multigrid does the
    large scales on coarse grids, where they are fine scales, and brings the
    correction back: the same operator, the same walls (Neumann: outside is
    the edge value), for about the same arithmetic as the sweeps.

    Level 0 is the packed red-black buffer the rest of the solver reads
    (pressureRedBlack smooths it, gradientSubtractBuf reads it). Coarser
    levels are plain row-major buffers. The operator is 4p − Σ neighbours =
    b with b already in h² units, so a coarse grid's right-hand side is the
    *sum* of the four fine residuals under it: (2h)² is 4h², and the average
    times four is the sum.
  */
  mgRestrict0: `${HEAD}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read_write> bc: array<f32>;
${PACKED}
fn res0(x: i32, y: i32, n: i32) -> f32 {
  let s = packedAt(x - 1, y, n) + packedAt(x + 1, y, n) + packedAt(x, y - 1, n) + packedAt(x, y + 1, n);
  return textureLoad(dv, vec2i(x, y), 0).r - (4.0 * packedAt(x, y, n) - s);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res0(x, y, n) + res0(x + 1, y, n) + res0(x, y + 1, n) + res0(x + 1, y + 1, n);
}`,

  mgRestrict: `${HEAD}
@group(0) @binding(2) var<storage, read> p: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read_write> bc: array<f32>;
fn at(x: i32, y: i32, n: i32) -> f32 { return p[clamp(x, 0, n - 1) + clamp(y, 0, n - 1) * n]; }
fn res(x: i32, y: i32, n: i32) -> f32 {
  let s = at(x - 1, y, n) + at(x + 1, y, n) + at(x, y - 1, n) + at(x, y + 1, n);
  return b[x + y * n] - (4.0 * at(x, y, n) - s);
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  bc[i] = res(x, y, n) + res(x + 1, y, n) + res(x, y + 1, n) + res(x + 1, y + 1, n);
}`,

  // Red-black Gauss-Seidel on a row-major level. A.a = (n, parity).
  mgSmooth: `${HEAD}
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
fn at(x: i32, y: i32, n: i32) -> f32 { return p[clamp(x, 0, n - 1) + clamp(y, 0, n - 1) * n]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let half = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let y = i / half;
  let x = 2 * (i % half) + ((y + i32(A.a.y)) & 1);
  if (x >= n) { return; }
  let s = at(x - 1, y, n) + at(x + 1, y, n) + at(x, y - 1, n) + at(x, y + 1, n);
  p[x + y * n] = (b[x + y * n] + s) * 0.25;
}`,

  // A.a.x = cells to zero.
  mgZero: `${HEAD}
@group(0) @binding(2) var<storage, read_write> p: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.a.x)) { return; }
  p[id.x] = 0.0;
}`,

  // Add the coarse correction, bilinear between cell centres. A.a.x = fine n.
  mgProlong: `${HEAD}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
fn ec(x: i32, y: i32, m: i32) -> f32 { return e[clamp(x, 0, m - 1) + clamp(y, 0, m - 1) * m]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let m = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  let v = mix(mix(ec(c0.x, c0.y, m), ec(c0.x + 1, c0.y, m), f.x),
              mix(ec(c0.x, c0.y + 1, m), ec(c0.x + 1, c0.y + 1, m), f.x), f.y);
  p[i] = p[i] + v;
}`,

  // The same into level 0's packed buffer.
  mgProlong0: `${HEAD}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
fn ec(x: i32, y: i32, m: i32) -> f32 { return e[clamp(x, 0, m - 1) + clamp(y, 0, m - 1) * m]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let m = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  let v = mix(mix(ec(c0.x, c0.y, m), ec(c0.x + 1, c0.y, m), f.x),
              mix(ec(c0.x, c0.y + 1, m), ec(c0.x + 1, c0.y + 1, m), f.x), f.y);
  let half = n / 2;
  let k = ((x + y) & 1) * n * half + y * half + (x >> 1);
  pr[k] = pr[k] + v;
}`,

  /** Zero the pressure buffer between projections, as the Jacobi's fill did. */
  pressureClear: `${HEAD}
@group(0) @binding(2) var<storage, read_write> pr: array<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(S.n);
  if (id.x >= n * n) { return; }
  pr[id.x] = 0.0;
}`,

  /** `gradientSubtract`, reading the pressure from the buffer the sweeps wrote. */
  gradientSubtractBuf: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var<storage, read> pr: array<f32>;
${PACKED}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let v = textureLoad(vel, p, 0);
  let gx = packedAt(p.x + 1, p.y, n) - packedAt(p.x - 1, p.y, n);
  let gy = packedAt(p.x, p.y + 1, n) - packedAt(p.x, p.y - 1, n);
  textureStore(dst, p, safeVel(vec4f(v.xy - 0.5 * vec2f(gx, gy) * S.n, v.z, v.w)));
}`,

  gradientSubtract: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var pr: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let gx = textureLoad(pr, clampP(p + vec2i(1, 0), S.n), 0).r - textureLoad(pr, clampP(p - vec2i(1, 0), S.n), 0).r;
  let gy = textureLoad(pr, clampP(p + vec2i(0, 1), S.n), 0).r - textureLoad(pr, clampP(p - vec2i(0, 1), S.n), 0).r;
  textureStore(dst, p, safeVel(vec4f(v.xy - 0.5 * vec2f(gx, gy) * S.n, v.z, v.w)));
}`,

  // Semi-Lagrangian advection. A.a.x is the displacement's sign and scale.
  advect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let v = textureSampleLevel(vel, lin, uv, 0.0).xy;
  let pos = clamp(uv - v * A.a.x, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  // Finite only: this carries the velocity too, whose signs must survive.
  let o = textureSampleLevel(src, lin, pos, 0.0);
  textureStore(dst, vec2i(id.xy), select(vec4f(0.0), o, finite4(o)));
}`,

  // MacCormack: phi1 + ½(phi0 − phi0b), clamped to the four cells the forward step sampled.
  macCormack: `${HEAD}
@group(0) @binding(2) var phi0: texture_2d<f32>;
@group(0) @binding(3) var phi1: texture_2d<f32>;
@group(0) @binding(4) var phi0b: texture_2d<f32>;
@group(0) @binding(5) var vel: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(7) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let uv = uvOf(id);
  let v = textureSampleLevel(vel, lin, uv, 0.0).xy;
  let pos = clamp(uv - v * A.a.x, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  let f = floor(pos * S.n - 0.5);
  let hiN = vec2f(S.n - 1.0);
  let lo = vec2i(clamp(f, vec2f(0.0), hiN));
  let hi = vec2i(clamp(f + 1.0, vec2f(0.0), hiN));
  let a = textureLoad(phi0, vec2i(lo.x, lo.y), 0);
  let b = textureLoad(phi0, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(phi0, vec2i(lo.x, hi.y), 0);
  let d = textureLoad(phi0, vec2i(hi.x, hi.y), 0);
  let mn = min(min(a, b), min(c, d));
  let mx = max(max(a, b), max(c, d));
  let r = textureSampleLevel(phi1, lin, uv, 0.0) + 0.5 * (textureSampleLevel(phi0, lin, uv, 0.0) - textureSampleLevel(phi0b, lin, uv, 0.0));
  var o = clamp(r, mn, mx);
  /*
    A.a.y is 1 for the dye: what is carried is an amount on the plate, and
    where the flow spreads it has to thin.

    A backtrace copies the value at the foot of the path, which is right for
    a flow that neither spreads nor gathers and wrong for one that does:
    the cell's dye came from a patch of plate smaller than the cell where
    the flow diverges (larger where it converges), and a copy spreads it
    over more plate than it came from. The flow the dye rides diverges in
    several places on purpose — a press and the beat squeeze are sources
    in the projection, a bubble's air is another, and the forces added
    after the projection (fingering, tension, the drip) are not projected
    at all — so the plate made dye wherever they spread it, and destroyed
    it wherever they gathered it. The Finger showed it worst: its carry
    makes steep edges, the fingering push (taken out since; see forcesB)
    ran along the dye's own gradient, and where the push ran outward the
    plate gained forty to sixty per cent of what it held (npm run tools, 592 -> 899; in the lab,
    the Finger's own path under the fingering push, 636 -> 756 against 687
    left alone). The patch's size is the Jacobian of the backtrace,
    1 - disp * div(v) to first order, taken here as its exponential so it
    cannot go negative, and held to a factor of about 1.6 either way in a
    single step so one bad texel of velocity cannot empty or flood a cell.

    And a gathering flow may thicken a cell only up to the most dye the
    cells it came from held. The fingering push was a push up the gradient
    where its noise was negative, and carried conservatively that is
    diffusion run backwards: in the lab a plate whose densest cell was 1.0
    grew a speck at the ceiling (6.0) inside five seconds. Held to its
    neighbourhood it could not make a new peak, and what the hold kept out
    was lost, as the ceiling's own cap loses it: 3 per cent in that window,
    where the backtrace alone lost 5. Over ten seconds of forty pools that
    loss came to more than half the plate, which is why the push was taken
    out rather than carried (forcesB). The hold stays for what is left
    that gathers: tension, the drip, a press.
  */
  if (A.a.y > 0.5) {
    let vR = textureLoad(vel, clampP(q + vec2i(1, 0), S.n), 0).x;
    let vL = textureLoad(vel, clampP(q - vec2i(1, 0), S.n), 0).x;
    let vU = textureLoad(vel, clampP(q + vec2i(0, 1), S.n), 0).y;
    let vD = textureLoad(vel, clampP(q - vec2i(0, 1), S.n), 0).y;
    let div = ((vR - vL) + (vU - vD)) * 0.5 * S.n;
    let j = exp(clamp(-A.a.x * div, -0.5, 0.5));
    o = select(o * j, min(o * j, max(mx, o)), j > 1.0);
  }
  textureStore(dst, q, select(vec4f(0.0), o, finite4(o)));
}`,

  // Everything the CPU applies after the projection.
  forcesB: `${HEAD}${NOISE_WGSL}${BILERP_N}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let uv = uvOf(id);
  var v = textureLoad(vel, q, 0);
  let dyeC = textureLoad(dye, q, 0);
  let d = dyeC.a;
  let p = uv * S.l;
  let eL = vec2f(1.0 / S.l, 0.0);

  if (S.turbScale > 0.005) {
    var cur = vec2f(0.0);
    for (var o = 0; o < 4; o++) {
      if (o >= S.turbDetail) { break; }
      let freq = (0.012 / (S.l / 128.0)) * f32(1 << u32(o));
      let tOff = S.time * (0.06 + f32(o) * 0.05) + f32(o) * 37.7;
      let eps = 0.75;
      let dn_dx = snoise(vec2f((p.x + eps) * freq, p.y * freq + tOff)) - snoise(vec2f((p.x - eps) * freq, p.y * freq + tOff));
      let dn_dy = snoise(vec2f(p.x * freq, (p.y + eps) * freq + tOff)) - snoise(vec2f(p.x * freq, (p.y - eps) * freq + tOff));
      cur += vec2f(dn_dy, -dn_dx) * (pow(0.55, f32(o)) / (2.0 * eps * freq));
    }
    v = vec4f(v.xy + cur * (S.turbScale * (0.5 / 3.0)), v.z, v.w);
  }

  if (S.spin > 0.0 && d > 0.05) {
    let qn = p * 0.025 + vec2f(0.0, S.time * 0.08);
    let n = snoise(qn);
    let dn_dx = (snoise(qn + vec2f(0.01, 0.0)) - n) * 100.0;
    let dn_dy = (snoise(qn + vec2f(0.0, 0.01)) - n) * 100.0;
    v = vec4f(v.xy + vec2f(dn_dy, -dn_dx) * (S.spin / 0.03) * (0.4 / 3.0) * min(1.0, d), v.z, v.w);
  }

  if (S.tension > 0.0 && d >= 0.01) {
    let col = dyeC.rgb / d;
    let cR = bilerpN(dye, uv + eL, S.n);
    let cL = bilerpN(dye, uv - eL, S.n);
    let cT = bilerpN(dye, uv + eL.yx, S.n);
    let cB = bilerpN(dye, uv - eL.yx, S.n);
    var cdx = 0.0;
    var cdy = 0.0;
    if (cR.a > 0.01 && cL.a > 0.01) {
      let dr = length(cR.rgb / cR.a - col);
      let dl = length(cL.rgb / cL.a - col);
      cdx = dr * dr - dl * dl;
    }
    if (cT.a > 0.01 && cB.a > 0.01) {
      let dt_ = length(cT.rgb / cT.a - col);
      let db = length(cB.rgb / cB.a - col);
      cdy = dt_ * dt_ - db * db;
    }
    let n = snoise(p * 0.03 + vec2f(0.0, S.time * 0.05));
    v = vec4f(v.xy - vec2f(cdx, cdy) * (S.tension * 0.8) * d * (1.0 + n * 2.0), v.z, v.w);
  }

  /*
    There was a fingering push here, and it is gone on purpose.

    It pushed the dye along its own gradient by a slow noise, out where the
    noise was positive and back where it was negative, everywhere there was
    dye and a slope: a look's Polarity set how hard. Reported (Classic,
    2026-09-27): a grating over the dye, stripes three to eight cells across
    at every angle, and a quarter of an hour in, red dots in a lattice ten
    cells apart with labyrinths between them. Where the noise was negative
    the push was diffusion run backwards, which grows the shortest waves it
    can see fastest (the gradient was taken a logical cell either side, so
    waves of about four of those): a spinodal pattern in every pool, not
    fingers. \`npm run grating\` §5, Classic's own step on forty pools for ten
    seconds, the worst channel's share of variance in waves 2.6 to 16 texels
    across (the 512 grid the dye is drawn on), in parts of 10,000: 52 as
    laid, 107 without the push and 2518 with it; and the plate kept 97% of
    its dye without it and 41% with it (the advection's hold and cap threw
    away what the push piled up: the
    Finger's "adds none" reds, where the plate alone lost dye, so a stroke
    that stopped the loss read as adding it).

    Tried before taking it out, on the same plate in a first look (alpha
    only, waves 2.6 to 8 texels, where the push read 1895 against 32 without
    it): carried as a flux
    (keeps the dye, grows the pattern three times as fast), pushing only
    outward (still rippled: the push is kept in the velocity the next step
    carries on, so up a ripple's side and back is a wave), along the contours
    instead of across them (worse), and only at a pool's edge (clean at ten
    seconds; at thirty, a comb of teeth two to four cells across along every
    edge and holes drawn into pools, texture there five times the plate's own).

    None of those is the thing itself. Viscous fingering (Saffman-Taylor) is
    a thinner liquid driven into a thicker one through the thin gap between
    two glasses, whose drag is 12 mu / b^2: unstable where it displaces,
    steadied at short waves by the surface tension across the edge, which
    sets the fingers' width. Its fingers come from something driving the
    flow, a lift, a press, a pour, and a still plate grows none. This push
    had no driver but a noise and no width but the gradient's reach. PLAN §0
    has the model that does it properly: a viscosity per liquid, the gap's
    drag, and a pressure solve weighted by both. Until then the only fingers
    are the ones a lift draws (lib/squish.ts), which is a shortcut of its own
    and in the same plan item.
  */

  if (S.vibI > 0.0005 && d > 0.05) {
    let f = S.vibF * 0.5;
    let s = S.time * 20.0;
    v = vec4f(v.x + sin(p.x * f + s) * cos(p.y * f) * S.vibI,
              v.y + cos(p.x * f) * sin(p.y * f + s) * S.vibI, v.z, v.w);
  }

  if (S.drip > 0.01) {
    let streak = (snoise(vec2f(p.x * 0.15, p.y * 0.02 - S.time * 0.2)) + 1.0) * 0.5;
    v.y -= 0.5 * S.drip * (0.1 + streak * streak * 0.9);
    let s1 = 1.0 - max(0.0, streak);
    let friction = (0.5 + s1 * s1 * s1 * 20.0) * S.drip;
    v = vec4f(v.xy * exp(-friction * S.dt), v.z, v.w);
  }

  if ((S.smear.x != 0.0 || S.smear.y != 0.0) && d > 0.01) {
    v = vec4f(v.xy + S.smear * (snoise(p * 0.1) * 0.5 + 0.5), v.z, v.w);
  }

  if (S.air > 0.1 && d > 0.01) {
    let gx = snoise(vec2f(p.x * 0.05, p.y * 0.05 - S.time)) * S.air * 4.0 * S.dt;
    let gy = -S.air * 8.0 * S.dt + snoise(vec2f(p.y * 0.05, p.x * 0.05 + S.time)) * S.air * 4.0 * S.dt;
    v = vec4f(v.x + gx, v.y + gy, v.z, v.w);
  }

  textureStore(dst, q, safeVel(v));
}`,

  // The lasting current, at half resolution: A.a.x is 1/M for its own grid.
  currentForces: `${HEAD}${BILERP_N}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;                                  // this pass runs on the M grid
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let q = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / m;
  var c = textureLoad(cur, q, 0).xy;
  let temp = bilerpN(vel, uv, S.n).z;
  /*
    tanh with its argument held in range: some GPUs take tanh as a ratio of
    exponentials, and past about 88 the exponential is infinite and the
    ratio is NaN. A plate anywhere hotter than 4.4 (the lamp under a standing
    plate reaches that) turned the whole current NaN, and the flow was
    wiped every step after it. tanh is ±1 to float precision well before 10.
  */
  let dd = tanh(clamp(bilerpN(dye, uv, S.n).a - S.meanD, -10.0, 10.0));
  var f = S.up * (S.curBuoy * tanh(min(max(temp, 0.0) * 20.0, 10.0)));
  f += S.rock * dd;
  let toC = vec2f(0.5) - uv;
  let r = length(toC);
  if (r > 1e-4) { f += (toC / r) * (S.curGrav * dd); }
  let w = 1.0 - smoothstep(0.0, 0.5, r);
  f += S.twist * w * w * vec2f(toC.y, -toC.x);
  c = c * S.curDamp + f * (1.0 - S.curDamp);
  let s = length(c);
  if (s > S.maxCur) { c *= S.maxCur / s; }
  textureStore(dst, q, vec4f(c, 0.0, 0.0));
}`,

  // The flow the dye rides: the main field plus the current, sampled up from M.
  /*
    The flow the dye rides — and the plate's depth, which scales it (F).

    This builds velForced, the field the dye, the second phase, the grain and
    the particles are all carried through. The depth belongs here and nowhere
    else, and the two places it was tried first say why.

    A drag on the stored velocity in decayVel does nothing at all. Measured:
    halving every velocity every single step changed the plate's mean speed by
    less than a percent. The forcing re-saturates the speed clamp each step —
    MAX_SPEED is 0.002 and the field sits near it — so the magnitude is set by
    the clamp rather than by any balance of forces, and a pointwise multiply
    in front of that clamp is erased before anything reads it.

    Adding a velocity down the depth gradient was never tried, and it is not
    being claimed here that it fails — only that §H spent seven findings
    establishing that a smooth localised field is mostly a gradient and the
    projection exists to remove gradients, which is reason enough not to spend
    an eighth.

    What is left is the transport itself. Darcy in a thin film is
    u = -(h^2/12mu) grad p, so the depth is a mobility on the flow, and a
    mobility is a multiply on the displacement a cell is carried by. Nothing
    downstream can take it back, because there is no downstream: this *is*
    what carries the liquid.

    A.a.z is the exponent, so zero is exactly one — off, bit for bit, and the
    plate is the plate it was. One is the physical h^2. Above one exaggerates
    it, which is what a dial on a light-show desk is for.
  */
  addCurrent: `${HEAD}${BILERP_N}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var cur: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let v = textureLoad(vel, vec2i(id.xy), 0);
  let c = bilerpN(cur, uvOf(id), A.a.y).xy;   // the current is on the M grid
  var flow = v.xy + c;
  if (A.a.z > 0.0) {
    let h = max(textureLoad(sq, vec2i(id.xy), 0).r, 0.0005);
    let nominal = 0.03;
    /*
      Capped at one, so this is a drag and never a pump.

      Left free to rise above one it reached four at the dome's deep centre,
      and the plate did not run four times faster there — it ran fifty-three
      times faster and was plainly diverging, because the dye this carries
      feeds the forces that make the velocity it is built from. A mobility
      above one is physically fine and numerically a loop.

      So a gap deeper than nominal is not accelerated, it is simply not
      slowed, and the difference across the plate is the same difference. The
      floor keeps the tightest gap the plate allows from stopping the liquid
      dead.
    */
    let ratio = clamp((h * h) / (nominal * nominal), 0.04, 1.0);
    flow = flow * pow(ratio, A.a.z);
  }
  textureStore(dst, vec2i(id.xy), safeVel(vec4f(flow, v.z, v.w)));
}`,

  // The current's own divergence and projection, on the M grid.
  curDivergence: `${HEAD}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn velGM(p: vec2i, m: f32) -> vec2f {
  var v = textureLoad(cur, clampP(p, m), 0).xy;
  if (p.x < 0 || p.x > i32(m) - 1) { v.x = -v.x; }
  if (p.y < 0 || p.y > i32(m) - 1) { v.y = -v.y; }
  return v;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let dx = velGM(p + vec2i(1, 0), m).x - velGM(p - vec2i(1, 0), m).x;
  let dy = velGM(p + vec2i(0, 1), m).y - velGM(p - vec2i(0, 1), m).y;
  textureStore(dst, p, vec4f(-0.5 * (dx + dy) / m, 0.0, 0.0, 0.0));
}`,

  curPressure: `${HEAD}
@group(0) @binding(2) var pr: texture_2d<f32>;
@group(0) @binding(3) var dv: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let s = textureLoad(pr, clampP(p - vec2i(1, 0), m), 0).r + textureLoad(pr, clampP(p + vec2i(1, 0), m), 0).r
        + textureLoad(pr, clampP(p - vec2i(0, 1), m), 0).r + textureLoad(pr, clampP(p + vec2i(0, 1), m), 0).r;
  textureStore(dst, p, vec4f((textureLoad(dv, p, 0).r + s) * 0.25, 0.0, 0.0, 0.0));
}`,

  curGradient: `${HEAD}
@group(0) @binding(2) var cur: texture_2d<f32>;
@group(0) @binding(3) var pr: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = A.a.y;
  if (id.x >= u32(m) || id.y >= u32(m)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(cur, p, 0);
  let gx = textureLoad(pr, clampP(p + vec2i(1, 0), m), 0).r - textureLoad(pr, clampP(p - vec2i(1, 0), m), 0).r;
  let gy = textureLoad(pr, clampP(p + vec2i(0, 1), m), 0).r - textureLoad(pr, clampP(p - vec2i(0, 1), m), 0).r;
  textureStore(dst, p, vec4f(v.xy - 0.5 * vec2f(gx, gy) * m, v.z, v.w));
}`,

  // Pigment coordinates: A.a.xy says which phase to keep and which to reseed.
  seedGrain: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let g = textureLoad(src, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), vec4f(mix(uv, g.rg, A.a.x), mix(uv, vec2f(g.b, g.a), A.a.y)));
}`,

  // Interface sharpening: anti-diffusion with a clamp (see the GLSL for why).
  // ─── The liquids' own physics and chemistry (docs/physics-plan.md) ───
  /*
    Vorticity confinement (Fedkiw, Stam & Jensen 2001), as a look option.

    Every grid solver loses small swirls to its own numerical smoothing, and
    this puts back a force along ∇|ω| × ω that spins up what is left of each
    eddy. It is not physics a thin film has: a liquid between two glasses is
    heavily damped. It is the swirl a projected show is loved for, so it is a
    dial, off by default. Two passes: the curl, then the push.
  */
  curl: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let w = (textureLoad(vel, clampP(p + vec2i(1, 0), n), 0).y - textureLoad(vel, clampP(p - vec2i(1, 0), n), 0).y)
        - (textureLoad(vel, clampP(p + vec2i(0, 1), n), 0).x - textureLoad(vel, clampP(p - vec2i(0, 1), n), 0).x);
  textureStore(dst, p, vec4f(0.5 * w, 0.0, 0.0, 0.0));
}`,

  // A.a.x = how hard, per step.
  confine: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var cw: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
fn wa(p: vec2i, n: f32) -> f32 { return abs(textureLoad(cw, clampP(p, n), 0).r); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let v = textureLoad(vel, p, 0);
  let g = vec2f(wa(p + vec2i(1, 0), n) - wa(p - vec2i(1, 0), n), wa(p + vec2i(0, 1), n) - wa(p - vec2i(0, 1), n));
  let gl = length(g);
  var f = vec2f(0.0);
  if (gl > 1e-6) {
    let nn = g / gl;
    let w = textureLoad(cw, p, 0).r;
    f = vec2f(nn.y * w, -nn.x * w) * A.a.x;
  }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  /*
    The mix: three things a cell of liquid carries besides its dye.

      r  oil: how much of the cell is oil rather than water, 0..1
      g  surfactant (soap), 0..1
      b  acidity: + acid, − base, −1..1 (they neutralise by cancelling)
      a  the oil's chemical potential μ, recomputed every step (mixMu)

    A pour: A.a = (x, y, radius, amount), A.b = how much of the amount goes to
    each channel.
  */
  mixSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let d = length(uvOf(id) - A.a.xy) / max(A.a.z, 1e-4);
  let f = select(0.0, (1.0 - d * d) * A.a.w, d < 1.0);
  /*
    The oil lands flat, full to its edge and sharp at it (a cell and a half
    on any grid), where the soap and the acid land as a dome. A dome of oil
    is half full across most of its width, and half full is inside
    Cahn–Hilliard's spinodal: the pour broke up at the grid's finest scale
    before it could round, and the capillary force followed the break-up
    (see mixForce). A body of oil is what a pour of oil is.
  */
  let fo = clamp((1.0 - d) * A.a.z * S.n / 1.5 + 0.5, 0.0, 1.0) * A.a.w;
  let m = textureLoad(src, p, 0) + A.b * vec4f(fo, f, f, f);
  textureStore(dst, p, vec4f(clamp(m.r, 0.0, 1.0), clamp(m.g, 0.0, 1.0), clamp(m.b, -1.0, 1.0), m.a));
}`,

  /*
    The mix rides the flow in flux form, as the ferrofluid does (see
    phaseAdvect): each face's flux computed the same way from both sides, so
    none of it is made or lost. μ (a) is derived and is not carried.
  */
  mixAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
// The face velocity is built as phaseAdvect's is, for the same reasons: the
// oil's capillary force is as sharp at a drop's rim as the maze's.
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}
fn mx(p: vec2i, n: i32) -> vec3f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).rgb; }
fn mm(a: vec3f, b: vec3f) -> vec3f {
  return select(vec3f(0.0), select(max(a, b), min(a, b), a > vec3f(0.0)), a * b > vec3f(0.0));
}
fn flux(a: vec2i, e: vec2i, n: i32) -> vec3f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec3f(0.0); }
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  if (c >= 0.0) {
    let s = mm(mx(a, n) - mx(a - e, n), mx(b, n) - mx(a, n));
    return c * (mx(a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(mx(b, n) - mx(a, n), mx(b + e, n) - mx(b, n));
  return c * (mx(b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let here = textureLoad(src, p, 0);
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  let m = here.rgb - d;
  textureStore(dst, p, vec4f(m.r, max(m.g, 0.0), m.b, here.a));
}`,

  /*
    Oil Bodies: the dye rides the flow the way the oil does (oilBodies).

    The dye is otherwise carried by a backtrace (macCormack), and the oil by
    the fluxes across each cell's faces (mixAdvect). Those are two different
    answers to where the liquid went, and over a stir they part: the oil's
    edge is in one place and its colour's edge a cell or two from it, and
    the colour is on the wrong side. So with Oil Bodies on, both shares of
    the dye (the plate's whole dye, and the oil's part of it, see
    bodyPartition) go through the same faces with the same fluxes as the oil,
    and a body's colour and its edge move as one.

    It is also the only way the dye survives the oil's own flow. The backtrace
    thins or thickens a cell by how much the flow spreads or gathers there
    (the Jacobian in macCormack), and the capillary flow's leftovers at the
    grid scale, which a collocated projection cannot see, spread and gather
    from one cell to the next; a thickening is held to the neighbourhood's
    most, a thinning is not, so every step lost a little. Measured in the lab
    (128², one oil drop with its colour, Oil Tension 0.5, 120 steps): 61% of
    the dye kept with the backtrace. Fluxes across faces are conservative
    whatever the flow does, and these are Rhie–Chow faces, which see the
    grid-scale part the projection cannot.

    A copy of mixAdvect over four channels, into the dye's own format.
  */
  bodyAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
${PACKED}
fn mx(p: vec2i, n: i32) -> vec4f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0); }
fn mm(a: vec4f, b: vec4f) -> vec4f {
  return select(vec4f(0.0), select(max(a, b), min(a, b), a > vec4f(0.0)), a * b > vec4f(0.0));
}
fn flux(a: vec2i, e: vec2i, n: i32) -> vec4f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec4f(0.0); }
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let pa = packedAt(a.x, a.y, n);
  let pb = packedAt(b.x, b.y, n);
  let wide = 0.25 * ((pb - packedAt(a.x - e.x, a.y - e.y, n)) + (packedAt(b.x + e.x, b.y + e.y, n) - pa));
  let ve = dot(va + vb, vec2f(e)) * 0.125 + (wide - (pb - pa)) * f32(n) * A.b.z;
  let c = clamp(ve * A.b.y * f32(n), -0.45, 0.45);
  if (c >= 0.0) {
    let s = mm(mx(a, n) - mx(a - e, n), mx(b, n) - mx(a, n));
    return c * (mx(a, n) + 0.5 * (1.0 - c) * s);
  }
  let s = mm(mx(b, n) - mx(a, n), mx(b + e, n) - mx(b, n));
  return c * (mx(b, n) - 0.5 * (1.0 + c) * s);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let d = flux(p, vec2i(1, 0), n) - flux(p - vec2i(1, 0), vec2i(1, 0), n)
        + flux(p, vec2i(0, 1), n) - flux(p - vec2i(0, 1), vec2i(0, 1), n);
  // Upwind and limited, so it never takes more than a cell holds; the floor
  // is only for the rounding in a half-float dye.
  textureStore(dst, p, max(textureLoad(src, p, 0) - d, vec4f(0.0)));
}`,

  /*
    The ferrofluid carried by a hand (carryPhase): the Finger drags it along
    its stroke and Blow pushes it away, as they carry the dye (carryDye in
    the app) and the oil (mixCarry). Asked by the owner: "Shouldn't blowing
    and finger also move around the ferrofluid?" Barely. Both tools add
    velocity, and the ferrofluid rides the flow as the dye does, but the
    push is small (a Finger's moves the liquid about a tenth of a cell a
    step) and it lasts one step: the speed clamp (MAX_SPEED in fluid.ts,
    which the plate's flow already sits at) cuts it back to an idle plate's
    speed at the end of the step it was added in. Measured by the thread
    that went over every tool on every liquid: a Finger dragged 30 cells
    across a pool moved its middle 0.2 of a cell, dye and ferrofluid alike.
    So the dye has been moved by hand, a take and a put, since the Finger
    was built (carryDye), and the oil with it; the ferrofluid never was.

    Each cell under the hand gives up its share (more near the middle) and
    that share lands a hop away: along the stroke for the Finger and a
    directed blow, straight out from the middle for a puff (A.b.w), which
    opens a hole in a pool as air blown down on a thin layer does. The
    landing cell is found by gathering: every cell asks which of its
    neighbours within a hop send to it, each sender to exactly one whole
    cell, so what leaves one cell arrives in one other and nothing is made
    or lost. A cell that would send off the plate keeps its share.

    A.a = (x, y, radius, take), A.b = (the direction, the hop, radial), all
    in plate units.
  */
  phaseCarry: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn took(q: vec2i) -> f32 { return A.a.w * max(0.0, 1.0 - length((vec2f(q) + 0.5) / S.n - A.a.xy) / A.a.z); }
fn inPlate(q: vec2i) -> bool { return q.x >= 0 && q.y >= 0 && q.x < i32(S.n) && q.y < i32(S.n); }
// Where cell q's share lands, in whole cells, so each sender has one.
fn dest(q: vec2i) -> vec2i {
  var d = A.b.xy;
  if (A.b.w > 0.5) {
    let o = (vec2f(q) + 0.5) / S.n - A.a.xy;
    d = select(vec2f(0.0), o / max(length(o), 1e-6), length(o) > 0.5 / S.n);
  }
  let to = q + vec2i(round(d * A.b.z * S.n));
  return select(q, to, inPlate(to));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = textureLoad(src, p, 0).r;
  // Nothing reaches a cell further than a hop past the hand's rim.
  if (length(uvOf(id) - A.a.xy) > A.a.z + A.b.z + 2.0 / S.n) {
    textureStore(dst, p, vec4f(c, 0.0, 0.0, 0.0));
    return;
  }
  var v = c * (1.0 - took(p));
  let R = i32(ceil(A.b.z * S.n)) + 1;
  for (var j = -R; j <= R; j++) { for (var i = -R; i <= R; i++) {
    let q = p + vec2i(i, j);
    if (inPlate(q) && all(dest(q) == p)) { v += textureLoad(src, q, 0).r * took(q); }
  } }
  textureStore(dst, p, vec4f(v, 0.0, 0.0, 0.0));
}`,

  /*
    Oil Bodies: the oil dragged by a hand, as the dye is (carryMix, and
    carryDye in the app). The dye's carry is a take and a put, on the CPU,
    through the deltas; the oil lives only here, so its carry is here, the
    same geometry as a gather: each cell keeps what the hand did not take
    from it and receives what was taken a hop behind it. Run as the gesture
    happens, before the frame's deltas fold in, so the colour the same drag
    carries lands in oil that has already arrived (bodyLand) and stays the
    oil's. Without it a finger drew a body's colour out across the water and
    left the oil where it was, colourless.

    A.a = (x, y, radius, take), A.b.xy = the hop, all in plate units.

    A.b.w = 1 is the Press's carry instead (PLAN 15d, pressMix): A.b.z is
    the outer edge of the ring squeezeOut lands the dye on (R to 1.7R). The
    Press moved the colour and left the oil, so with Oil Bodies a press drew
    a body's colour out into the water and the body stayed where it was,
    colourless: the Finger's fault before this kernel, on the other tool.

    The oil and the dye go the same way, cell for cell. The dye's take is
    flat across the palm (the same share of every cell), so the oil's is
    too, not the Finger's cone: a cone took a third of the dye's share
    averaged over the palm, and two thirds of the colour a press moved still
    left without its oil. And both are laid on the ring R to 1.7R area for
    area: a point s from the middle lands at sqrt(R^2 + s^2 K),
    K = (O^2 - R^2) / R^2, which carries the disc onto the ring with a
    constant stretch of K, so every ring cell receives 1 / K of the cell it
    maps back to. The dye's half (pressDye, src/lib/pressRing.ts) is the same
    map on the CPU; it used to spread what it took evenly round the whole
    ring, so a palm half over a body put half the body's colour in the water
    on the far side while the oil went out on its own. A first cut here that
    hopped each point straight out by 0.7R landed a fifth of the oil back
    under the palm, where no dye goes.

    Only what has somewhere to go is taken. The app's palm is big (a
    quarter of the plate across, R = 45 cells of 192), so from most places a
    person presses, part of its ring is off the plate, and a gather cannot
    receive at a cell that is not there: the oil taken for it was lost, 5%
    of what a press moved at (0.3, 0.4), 27% at (0.15, 0.5). So a cell whose
    landing point is off the plate keeps its oil (and its colour, in
    pressDye), which the receiving side sees the same way because it asks
    the same took() of the cell it gathers from.
  */
  mixCarry: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
// The Press's K: the ring's area over the palm's.
fn stretch() -> f32 { return (A.b.z * A.b.z - A.a.z * A.a.z) / (A.a.z * A.a.z); }
fn took(uv: vec2f) -> f32 {
  let rel = uv - A.a.xy;
  let d = length(rel);
  if (A.b.w < 0.5) { return A.a.w * max(0.0, 1.0 - d / A.a.z); }
  if (d >= A.a.z) { return 0.0; }
  let to = A.a.xy + rel * sqrt(A.a.z * A.a.z + d * d * stretch()) / max(d, 1e-6);
  if (any(to < vec2f(0.0)) || any(to >= vec2f(1.0))) { return 0.0; }
  return A.a.w;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  let m = textureLoad(src, p, 0);
  var back = uv - A.b.xy;
  var keep = 1.0;
  if (A.b.w > 0.5) {
    // Only the ring receives, from the point of the palm that maps onto it
    // (pressDye in src/lib/pressRing.ts lands the colour by the same map). At
    // r = R a fused multiply-add can leave r*r - R*R a hair below zero: max().
    let rel = uv - A.a.xy;
    let r = length(rel);
    let R = A.a.z;
    keep = 0.0;
    if (r >= R && r < A.b.z) {
      back = A.a.xy + rel * sqrt(max(0.0, r * r - R * R) / stretch()) / r;
      keep = 1.0 / stretch();
    }
  }
  let q = vec2i(floor(back * S.n));
  var got = 0.0;
  if (keep > 0.0 && q.x >= 0 && q.y >= 0 && q.x < i32(S.n) && q.y < i32(S.n)) {
    got = textureLoad(src, q, 0).r * took((vec2f(q) + 0.5) / S.n) * keep;
  }
  textureStore(dst, p, vec4f(m.r * (1.0 - took(uv)) + got, m.gba));
}`,

  /*
    Oil Bodies: what lands in a body becomes its colour.

    The frame's dye (the deltas, pours and splats alike) is shared at the
    moment it lands, by how much of the cell is oil: all of it the oil's deep
    in a body, none of it in open water, and in between at the edge. So a
    drop of dyed oil poured with its colour keeps it, edge and all, and
    painting over a body colours the oil. The first version handed dye to a
    body only where the whole neighbourhood was oil (it still does that for
    anything else that reaches the dye), and a fresh drop's own colour at
    its edge counted as the water's, was levelled out into the water, and
    ringed the drop with its own colour. The oil's share takes the same
    multiplier as the dye (a fade, a drain), so the two stay one plate.
  */
  bodyLand: `${HEAD}
@group(0) @binding(2) var oil: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var mulT: texture_2d<f32>;
@group(0) @binding(5) var mixT: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = clamp(textureLoad(mixT, p, 0).r, 0.0, 1.0);
  let o = textureLoad(oil, p, 0) * textureLoad(mulT, p, 0).r + max(textureLoad(addT, p, 0), vec4f(0.0)) * c;
  textureStore(dst, p, select(vec4f(0.0), max(o, vec4f(0.0)), finite4(o)));
}`,

  /*
    Oil Bodies: the dye's diffusion, for the water's colour only (see the
    host's 'dye diffuse' stage). In: the whole dye and the oil's share, both
    diffused, and the oil's share before. Out: the water's colour diffused
    with the oil's put back as it was (A.a.w = 0), or the oil's share as it
    was (A.a.w = 1).
  */
  bodyUnspread: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var spread: texture_2d<f32>;
@group(0) @binding(4) var kept: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let o = max(textureLoad(kept, p, 0), vec4f(0.0));
  let w = max(textureLoad(dye, p, 0) - textureLoad(spread, p, 0), vec4f(0.0));
  let out = select(w + o, o, A.a.w > 0.5);
  textureStore(dst, p, select(vec4f(0.0), out, finite4(out)));
}`,

  /*
    Oil Bodies: each liquid keeps its own colour.

    The plate's dye is one field, and everything that reads or moves it
    (the picture, the regulator, the drain, the bubbles) goes on doing so.
    Beside it the oil carries its own share of that dye, so the water's share
    is what is left: w = dye − o, both per channel. Two things keep each
    share in its own liquid, both exchanges between neighbouring cells,
    computed the same way from both sides, so no dye is made or lost.

    **Each colour evened out through its own liquid, across the edge.**
    What is levelled is the colour per unit of its liquid, w/(1 − c) for the
    water's and o/c for the oil's, so at rest a cell half oil holds half the
    water colour the open water beside it does, and none is pushed past the
    edge into the wrong liquid. That one rule does all four jobs the ferrofluid
    needed two passes for (phaseDisplace): where the oil advances into a
    cell, the water there thins in water, its colour's concentration rises
    and it leaves ahead of the edge; the oil's colour, thin in the new oil,
    is drawn in behind it; where the oil retreats, the reverse. It moves
    only across the edge (the band where either cell is between about a
    tenth and nine tenths oil): run everywhere it would blur the water's
    swirls, which is the picture. Inside a body a little more of the oil's
    own evening-out (A.a.z) blends two drops that have merged, slowly, as
    two dyed oils do.

    Cahn–Hilliard is why this has to be told rather than carried: the oil's
    edge mostly moves by an exchange of oil between cells with no liquid
    moving, as the ferrofluid's does, so no flow could have taken the
    colour along.

    **What lands in a body becomes its colour.** Dye poured deep inside
    the oil (or, the other way, into open water with no oil within two
    cells) has no edge to be levelled across, so it is handed to the liquid
    it landed in (A.a.y a pass). Painting over an oil body colours the oil; a drop of
    dyed oil poured with its colour keeps it. That is the performer's
    dropper: the colour and the oil go in together.

    A.a = (evening-out rate, hand-over rate, inside rate, 1 to write the
    oil's share, 0 the whole dye). Run twice a pass, once for each output,
    from the same inputs.
  */
  bodyPartition: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var oil: texture_2d<f32>;
@group(0) @binding(4) var mixT: texture_2d<f32>;
@group(0) @binding(5) var reachT: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn reach(p: vec2i) -> f32 { return textureLoad(reachT, clampP(p, S.n), 0).r; }
struct Share { w: vec4f, o: vec4f, f: f32 };
fn share(p: vec2i) -> Share {
  let t = max(textureLoad(dye, p, 0), vec4f(0.0));
  let o = clamp(textureLoad(oil, p, 0), vec4f(0.0), t);
  return Share(t - o, o, clamp(textureLoad(mixT, p, 0).r, 0.0, 1.0));
}
// How much of an edge a cell is: 1 from about a sixth to five sixths oil,
// falling to 0 in open water and deep in a body.
fn band(f: f32) -> f32 { return clamp(6.0 * f * (1.0 - f), 0.0, 1.0); }
// How far a colour is from its own liquid: 1 in a cell with almost none of
// it (f its liquid's fraction), 0 from a tenth up.
fn astray(f: f32) -> f32 { return 1.0 - smoothstep(0.02, 0.1, f); }
/*
  Keeps the concentrations finite where a cell has none of a liquid. It was
  0.02, and that is not small here: levelled to equal o/(f + E), a cell with
  no oil at all holds a fiftieth of the oil's colour concentration, so every
  cell of open water along a body's rim kept some of the body's colour by
  right, and the hand-over below then made it the water's. That was a steady
  leak (the oil's colour in the water went up about 1.6% of it every hundred
  steps in \`npm run bodies\`, worse than with the setting off). At a
  thousandth the colour in a cell with no oil is at a concentration so high
  that the evening-out carries it to the nearest cell that has some.
*/
const E = 0.001;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let h = share(p);
  let rh = reach(p);
  var w = h.w;
  var o = h.o;
  let offs = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
  for (var i = 0; i < 4; i++) {
    let q = p + offs[i];
    if (q.x < 0 || q.y < 0 || q.x >= n || q.y >= n) { continue; }
    let s = share(q);
    let edge = max(band(h.f), band(s.f));
    // A fifth of what the giver holds, at most, to each of four: never more
    // than it has, whatever the concentrations say.
    let gw = edge * (2.0 - h.f - s.f) * 0.5;
    w += clamp(A.a.x * gw * (s.w / (1.0 - s.f + E) - h.w / (1.0 - h.f + E)), -0.2 * h.w, 0.2 * s.w);
    let go = edge * (h.f + s.f) * 0.5 + A.a.z * min(h.f, s.f);
    o += clamp(A.a.x * go * (s.o / (s.f + E) - h.o / (h.f + E)), -0.2 * h.o, 0.2 * s.o);
    /*
      Colour astray from its liquid drifts back to it, up (the oil's) or
      down (the water's) a wide blur of the oil, a fifth of a cell's colour
      a face at most. Nothing else could bring it back: the flow's transport
      smears the oil's edge and its colour alike every step, Cahn–Hilliard
      sharpens the oil back and not its colour, and a cell with no oil in
      it has no concentration to level. So a faint halo of each body's
      colour spread into the water, a cell or two a second, and at 360
      steps of the bodies check held 2% of the oil's colour; riding the
      oil's own Cahn–Hilliard flux instead made it worse (1.2% against 0.9%
      at 90 steps). Only a cell with almost none of the liquid (astray) is
      moved, so the colour a rim's tail rightly holds stays. Each face's
      exchange is the giver's, computed the same from both sides.
    */
    let up = clamp(A.b.x * (reach(q) - rh), -0.2, 0.2);
    o += max(-up, 0.0) * s.o * astray(s.f) - max(up, 0.0) * h.o * astray(h.f);
    w += max(up, 0.0) * s.w * astray(1.0 - s.f) - max(-up, 0.0) * h.w * astray(1.0 - h.f);
  }
  /*
    Handed over only where the whole neighbourhood is the one liquid: next to
    an edge the evening-out above is what puts a colour back where it
    belongs, and a hand-over there turned the oil's colour that a stir had
    left a cell outside its body into the water's, for good. The lab showed
    it as a green haze (amber in teal) along the trailing side of a body.

    And only where there is truly none of the liquid, under a hundredth in
    all 25 cells: a body's edge is a smooth profile with a tail several
    cells long at a few hundredths of oil, and that tail holds the oil's
    colour rightly. Handed over below a tenth, as it first was, it drained
    the body's colour into the water through its own rim every step.
  */
  var lo = 1.0;
  var hi = 0.0;
  for (var j = -2; j <= 2; j++) { for (var i = -2; i <= 2; i++) {
    let c = clamp(textureLoad(mixT, clampP(p + vec2i(i, j), S.n), 0).r, 0.0, 1.0);
    lo = min(lo, c);
    hi = max(hi, c);
  } }
  let toOil = A.a.y * smoothstep(0.99, 0.998, lo) * h.w;
  let toWater = A.a.y * (1.0 - smoothstep(0.002, 0.01, hi)) * h.o;
  w += toWater - toOil;
  o += toOil - toWater;
  let out = select(w + o, o, A.a.w > 0.5);
  textureStore(dst, p, select(vec4f(0.0), max(out, vec4f(0.0)), finite4(out)));
}`,

  /*
    The oil cannot be packed past full, nor go below empty: the same pressure
    as phaseRelax. Whatever a cell holds above 1 (or below 0) is shared with
    its neighbours, each pair's exchange computed the same way from both
    sides, so it conserves. Measured without it: the flow's leftover
    compression piled the oil past full and the guard clamp lost a third of
    it in a second.
  */
  mixRelax: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn bad(p: vec2i, n: i32) -> vec2f {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) { return vec2f(0.0, 0.0); }
  let c = textureLoad(src, p, 0).r;
  return vec2f(max(c - 1.0, 0.0) + min(c, 0.0), 1.0);
}
fn pair(a: f32, b: vec2f) -> f32 { return select(0.0, 0.24 * (a - b.x), b.y > 0.5); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let m = textureLoad(src, p, 0);
  let e = max(m.r - 1.0, 0.0) + min(m.r, 0.0);
  let out = pair(e, bad(p + vec2i(1, 0), n)) + pair(e, bad(p - vec2i(1, 0), n))
          + pair(e, bad(p + vec2i(0, 1), n)) + pair(e, bad(p - vec2i(0, 1), n));
  textureStore(dst, p, vec4f(m.r - out, m.gba));
}`,

  /*
    Marangoni flow: what rides the surface is carried away from soap.

    Soap lowers the surface tension, and a surface pulls toward where its
    tension is higher, so it streams away from the soap at a speed that goes
    with the tension's gradient: u = −k ∇Γ. It is a surface flow, and a
    spreading one. Added to the velocity it did not work either way it was
    tried: before the projection it is a pure gradient and was deleted whole
    (a soap drop moved no dye), and after it the dye's backtrace, which has
    no term for a spreading flow, made twice the dye there had been.

    So what rides the surface (the dye, the soap itself, the oil) is moved
    along that flow directly, in flux form: each face's flux the same from
    both sides, so the surface thins where it spreads and piles up at the
    front and nothing is made or lost. The milk-and-soap burst, and the
    fronts a drop of detergent sends across a plate.

    A.a.x = k (face speed per unit of Γ across it, in cells a step);
    A.a.y = 1 when what is moved is the mix itself (the soap's own spread).
  */
  marangoniFlux: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn gm(p: vec2i, n: i32) -> f32 { return textureLoad(mix, clamp(p, vec2i(0), vec2i(n - 1)), 0).g; }
fn face(a: vec2i, e: vec2i, n: i32) -> vec4f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec4f(0.0); }
  let dg = gm(b, n) - gm(a, n);
  let c = clamp(-A.a.x * dg, -0.24, 0.24);
  var f = c * select(textureLoad(src, b, 0), textureLoad(src, a, 0), c >= 0.0);
  // The soap's own spread is a diffusion (flux kΓ∇Γ) and, explicit, it is
  // stable only below a quarter of the difference a face (a checkerboard
  // grows past it). At full k it ran near two: the soap flipped between
  // neighbouring cells every step and carried the dye into a lattice of dots.
  if (A.a.y > 0.5) { f.g = clamp(f.g, -0.12 * abs(dg), 0.12 * abs(dg)); }
  return f;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let d = face(p, vec2i(1, 0), n) - face(p - vec2i(1, 0), vec2i(1, 0), n)
        + face(p, vec2i(0, 1), n) - face(p - vec2i(0, 1), vec2i(0, 1), n);
  textureStore(dst, p, textureLoad(src, p, 0) - d);
}`,

  /*
    Oil and water: the Cahn–Hilliard chemical potential.

    μ = f′(c) − κ∇²c, with f(c) = c²(1 − c)², the double well whose two floors
    are pure water and pure oil. The first term drives a mixed cell toward
    one or the other; the second charges for every bit of boundary, which is
    what surface tension *is*: a blob rounds up because a circle is the
    shortest boundary for its area, and a thin thread breaks into drops for
    the same reason (Rayleigh–Plateau). Neither is drawn; both fall out.
    Stored in the mix's alpha for the update and the force to read.
  */
  mixMu: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn cc(p: vec2i, n: f32) -> f32 { return textureLoad(src, clampP(p, n), 0).r; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let m = textureLoad(src, p, 0);
  let c = m.r;
  let lap = cc(p + vec2i(1, 0), n) + cc(p - vec2i(1, 0), n) + cc(p + vec2i(0, 1), n) + cc(p - vec2i(0, 1), n) - 4.0 * c;
  let mu = 2.0 * c * (1.0 - c) * (1.0 - 2.0 * c) - lap;
  textureStore(dst, p, vec4f(m.rgb, mu));
}`,

  /*
    One step of the mix's own evolution.

      oil         ∂c/∂t = M ∇²μ         (Cahn–Hilliard: conserves the oil)
      surfactant  diffuses (A.a.y) and breaks down (A.a.z, a factor a step)
      acidity     diffuses (A.a.w); acid and base neutralise by cancelling

    A.a.x = M × dt in cell units, kept under the explicit limit (1/64 for
    this stencil) by the host.
  */
  mixUpdate: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn mm4(p: vec2i, n: f32) -> vec4f { return textureLoad(src, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let m = mm4(p, n);
  let lap = mm4(p + vec2i(1, 0), n) + mm4(p - vec2i(1, 0), n) + mm4(p + vec2i(0, 1), n) + mm4(p - vec2i(0, 1), n) - 4.0 * m;
  // Not clamped to 0..1: Cahn–Hilliard overshoots a little either side of an
  // interface and its own double well brings it back, where a clamp would
  // make or destroy oil every step (measured: the oil swung ±30%). The wide
  // band is only a guard against a runaway.
  let c = clamp(m.r + A.a.x * lap.a, -0.25, 1.25);
  let s = clamp((m.g + A.a.y * lap.g) * A.a.z, 0.0, 1.0);
  let a = clamp(m.b + A.a.w * lap.b, -1.0, 1.0);
  textureStore(dst, p, vec4f(c, s, a, m.a));
}`,

  /*
    The oil, blurred [1 4 6 4 1]² into a scratch texture, for mixForce to
    take the edge's direction and curvature from.
  */
  mixSmooth: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let w = array<f32, 5>(1.0, 4.0, 6.0, 4.0, 1.0);
  var t = 0.0;
  for (var j = -2; j <= 2; j++) { for (var i = -2; i <= 2; i++) {
    t += w[i + 2] * w[j + 2] * clamp(textureLoad(src, clampP(p + vec2i(i, j), S.n), 0).r, 0.0, 1.0);
  } }
  textureStore(dst, p, vec4f(t / 256.0, 0.0, 0.0, 0.0));
}`,

  /*
    What the mix does to the flow, and what gravity does to the dye.

    **Capillary force**, σ κ ∇c̃ (continuum surface force, Brackbill 1992):
    surface tension as a push along the edge's normal, as strong as the edge
    is curved, with κ = −∇·(∇c̃/|∇c̃|) and c̃ the oil blurred [1 4 6 4 1]²
    (mixSmooth). It is what makes an oil blob in water pull itself round and
    carry the dye inside it along. A.a.x = σ (in cells, so the host scales it
    by N² for the same force on every grid), A.a.y the most it may add.

    It was the Korteweg form, −σ c ∇μ, which is the same force on paper and
    is what the Cahn–Hilliard energy hands you. On a grid it is not: μ is a
    Laplacian of c, its gradient a third derivative, and a third derivative
    of an edge four cells wide is mostly the grid. The force it made pointed
    every way at once, cell to cell, a flow full of divergence at the scale
    the projection cannot see; MacCormack's conserving limiter then took the
    dye out cell by cell (it caps a thickening and not a thinning), and an
    oil drop went black in about a second. Measured in the lab: a settled
    drop kept 41% of its dye after 120 steps; in a disc that had long stopped
    rounding the fastest flow was still 0.77 (the solver's velocity), the
    "parasitic currents" every diffuse-interface code fights. The curvature
    form reads only first derivatives of a blurred field, and the normal's
    divergence is smooth wherever the edge is: 88% of the plate's dye kept, and 86% of
    it still inside the drop (`npm run bodies`), the
    settled disc's fastest flow 0.031, and a strip of oil still pulls round (the
    physics check's aspect 5.58 → 1.89). Blurring and capping the old force
    was tried first: the dye was lost more slowly and the strip no longer
    rounded, since the blur took the curvature with the noise.

    (Marangoni flow is not here: see marangoniFlux.)

    **Buoyancy**, g (βₛ(ρ − ρ̄) − β_T T): dye makes the liquid heavier, heat
    makes it lighter. On a plate standing up (or tilted) that is a
    Rayleigh–Taylor instability: heavy dye above light sinks in fingers. With
    heat diffusing faster than the dye (the double-diffusive case, see
    doubleDiffusion) it makes salt fingers. A.b.xy = gravity in the plate
    (with its size), A.b.z = βₛ, A.b.w = β_T.

    **The lamp**: heat A.a.z a step into the dye below A.a.w plate widths
    from the centre, downhill, where a standing plate goes out of view.
  */
  mixForce: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var soft: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<rgba16float, write>;
fn cs(p: vec2i, n: f32) -> f32 { return textureLoad(soft, clampP(p, n), 0).r; }
fn grad(p: vec2i, n: f32) -> vec2f {
  return 0.5 * vec2f(cs(p + vec2i(1, 0), n) - cs(p - vec2i(1, 0), n), cs(p + vec2i(0, 1), n) - cs(p - vec2i(0, 1), n));
}
// The edge's unit normal, fading to nothing where there is no edge to have one.
fn nrm(p: vec2i, n: f32) -> vec2f { let g = grad(p, n); return g / sqrt(dot(g, g) + 0.0004); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  // σ κ ∇c̃ (see above). The normal's divergence by central differences of
  // the normals themselves, not a second derivative of c: that is the step
  // that keeps the grid out of it.
  let g = grad(p, n);
  let kappa = -0.5 * ((nrm(p + vec2i(1, 0), n).x - nrm(p - vec2i(1, 0), n).x) + (nrm(p + vec2i(0, 1), n).y - nrm(p - vec2i(0, 1), n).y));
  var capillary = A.a.x * kappa * g;
  let cl = length(capillary);
  if (cl > A.a.y) { capillary *= A.a.y / cl; }
  let wax = textureLoad(dye, p, 0).a;
  let rho = wax - S.meanD;
  let buoy = A.b.xy * (A.b.z * rho - A.b.w * v.z);
  var heat = v.z;
  if (A.a.z > 0.0) {
    /*
      Into the dye, not the water round it. Warming everything in the band
      alike lifts nothing: the wax is still the heaviest thing there, and a
      force the same everywhere is a pressure. The wax is what swells with
      heat in a lava lamp, so that is where the lamp's heat goes.
    */
    let down = dot(uvOf(id) - vec2f(0.5), normalize(A.b.xy));
    heat += A.a.z * smoothstep(A.a.w - 0.08, A.a.w, down) * clamp(wax * 2.0, 0.0, 1.0);
  }
  v = vec4f(v.xy + capillary + buoy, heat, v.w);
  textureStore(dst, p, safeVel(v));
}`,

  /*
    The ferrofluid under a strong field: labyrinths (Ohta–Kawasaki).

    A thin layer of ferrofluid in a field perpendicular to it is a sheet of
    parallel magnetic dipoles, and parallel dipoles repel. Surface tension
    wants one round blob; the repulsion wants the ferrofluid spread out. They
    settle on stripes a fixed width apart, bent into a maze: the labyrinthine
    instability. The model is Cahn–Hilliard with the repulsion added to the
    chemical potential, μ + α ψ, where (−∇² + m²) ψ = c (the Ohta–Kawasaki
    long-range term, screened: see screenJacobi). Then ∇²ψ = m²ψ − c, and
    the update carries −Mα(c − m²ψ), which is the maze-making term and
    sums to zero over the plate, so it conserves. Two earlier tries did
    not: subtracting α(c − c̄) with c̄ a local average drained half the
    ferrofluid, and smearing c over a ring was a diffusion, which smooths. α is scaled by how saturated the
    field is here, so the maze appears over the magnet and fades away from
    it.

    Two passes, as the oil: μ (into a scratch texture), then the update.
    A.a = the magnet, A.b.x = M × dt, A.b.y = α.
  */
  /*
    ψ, the ferrofluid's long-range repulsion: (−∇² + m²) ψ = c, a screened
    Poisson equation, relaxed a few Jacobi sweeps a step from where it was
    (it changes slowly). A.a.x = m², in cells.
  */
  screenJacobi: `${HEAD}
@group(0) @binding(2) var psi: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
fn ps(p: vec2i, n: f32) -> f32 { return textureLoad(psi, clampP(p, n), 0).r; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let s = ps(p + vec2i(1, 0), n) + ps(p - vec2i(1, 0), n) + ps(p + vec2i(0, 1), n) + ps(p - vec2i(0, 1), n);
  let c = clamp(textureLoad(phase, p, 0).r, 0.0, 1.0);
  textureStore(dst, p, vec4f((s + c) / (4.0 + A.a.x), 0.0, 0.0, 0.0));
}`,

  /*
    μ, the ferrofluid's chemical potential under the field, kept between
    steps: it drives the maze's flow (mazeForce) as well as its Cahn–Hilliard
    sharpening (phaseCH). The double well and −∇²c are the surface tension;
    χψ is the dipoles' repulsion, where χ is how strongly the field
    magnetises the layer here. A field coil's uniform part everywhere
    (A.b.z of the full strength) and the hand magnet's saturation on top,
    so the maze covers the plate and is finest over the magnet; with a
    slow noise on it, because a real labyrinth's disorder comes from noise
    (Kent-Dobias & Bernoff 2015) and without it the pattern copies the
    magnet's symmetry into rings. A.a = the magnet, A.b = (M dt, α, uniform
    share, time).
  */
  phaseMu: `${HEAD}${MAGNET_WGSL}${NOISE_WGSL}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var psi: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rg32float, write>;
fn cc(p: vec2i, n: f32) -> f32 { return clamp(textureLoad(src, clampP(p, n), 0).r, 0.0, 1.0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let c = cc(p, n);
  let lap = cc(p + vec2i(1, 0), n) + cc(p - vec2i(1, 0), n) + cc(p + vec2i(0, 1), n) + cc(p - vec2i(0, 1), n) - 4.0 * c;
  let uv = uvOf(id);
  let e = magnetsEnergy(uv, A.a);
  let sat = e / (e + 800.0);
  let sw = spikesWell(uv, A.a);
  let chi = (A.b.z + (1.0 - A.b.z) * sat * (1.0 + max(SPIKE_REPEL * sw.y, FINGER_REPEL * spikesClose(A.a)))) * (1.0 + 0.25 * snoise(uv * 9.0 + vec2f(A.b.w * 0.05, -A.b.w * 0.03)));
  let w = textureLoad(psi, p, 0).r;
  /*
    Under the hand's magnet the push moves the liquid by flow and not by
    diffusion (PLAN.md §9i, "npm run fingers"). The push is α χ ψ, and ψ is
    c smoothed: in the Cahn–Hilliard update (phaseCH) it is a diffusion
    that relaxes c toward its own blur, which is how a labyrinth's stripes
    are set at a period, and also how a strong push spread a pool's edge
    into a grey film fainter than half full, which then cannot separate
    again (under 0.21 the double well is convex: nothing is left to
    sharpen). Between glass a real ferrofluid never thins like that; it is
    pushed about as a whole, by the Hele-Shaw flow the maze force makes
    from the gradient of μ (mazeForce), which carries it without mixing.
    So μ is written twice: .r, all of it, for that flow; .g, for the
    separation, without the push in the share the hand's magnet is in
    (spikesClose), so with no hand every look's maze is as it was. With no
    Labyrinth there is no push (α, A.b.y, is 0) and the two are the same;
    the step() on A.b.z keeps it so if the hand's push ever runs there
    again, where a magnet short of full spikes would otherwise send the
    rest of it down the diffusion that makes the grey.

    And the double well steepened as the push grows, so what the flow
    carries out stays past half full: a stripe survives the push where
    W |f''(c)| > 2 √(α χ) (the screened repulsion's least cost over all
    wavelengths, taking m² as nothing), asked of c down to 0.3, where
    |f''| is 0.52 (STRIPE_CURVE). Held under the explicit limit, 1.9 over
    M dt: at Phase Edge's most that is 2.6, on Magnet Garden 3.9. The
    steepest the limit allows everywhere under the hand drew a bead at each
    finger's tip and left the rest grey: the surface tension goes as √W,
    and pulled the fingers back in.
  */
  let close = spikesClose(A.a);
  let wellNeed = mix(1.0, 2.0 * sqrt(max(A.b.y * chi, 0.0)) / STRIPE_CURVE, close);
  let well = min(max(1.0 + SPIKE_SHARP * sw.y, wellNeed), (1.9 / max(A.b.x, 1e-4) - 64.0) / 16.0);
  let local = 2.0 * c * (1.0 - c) * (1.0 - 2.0 * c) * well - lap + SPIKE_WELL * sw.x;
  let repel = A.b.y * chi * w;
  textureStore(dst, p, vec4f(local + repel, local + repel * (1.0 - close) * step(1e-6, A.b.z), 0.0, 0.0));
}`,

  /*
    The maze's flow. Between glass plates the ferrofluid moves as the whole
    layer does (Darcy), pushed down the gradient of its own chemical
    potential: −c ∇μ, surface tension and dipole repulsion together (the
    Hele-Shaw–Cahn–Hilliard model). This is what lets a pool finger out in
    a second or two; Cahn–Hilliard's own diffusion alone takes minutes to
    carry the liquid a finger's length. Before the projection, which keeps
    the part that moves liquid and the water it displaces. A.a.x = the
    gain, A.a.y = the most a step may add.
  */
  mazeForce: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var mu: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
// Both blurred [1 2 1]²: μ carries −∇²c, which is grid-scale, and a
// grid-scale force is the part a collocated projection cannot remove (see
// phaseForce); unblurred, it printed a mesh into the black.
fn uu(p: vec2i, n: f32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    t += f32((2 - abs(i)) * (2 - abs(j))) * textureLoad(mu, clampP(p + vec2i(i, j), n), 0).r;
  } }
  return t / 16.0;
}
fn cb(p: vec2i, n: f32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    t += f32((2 - abs(i)) * (2 - abs(j))) * clamp(textureLoad(phase, clampP(p + vec2i(i, j), n), 0).r, 0.0, 1.0);
  } }
  return t / 16.0;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let v = textureLoad(vel, p, 0);
  let c = cb(p, n);
  let g = vec2f(uu(p + vec2i(1, 0), n) - uu(p - vec2i(1, 0), n), uu(p + vec2i(0, 1), n) - uu(p - vec2i(0, 1), n)) * 0.5;
  var f = -c * g * A.a.x;
  let fl = length(f);
  if (fl > A.a.y) { f = f * (A.a.y / fl); }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  phaseCH: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mu: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
fn uu(p: vec2i, n: f32) -> f32 { return textureLoad(mu, clampP(p, n), 0).g; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let lap = uu(p + vec2i(1, 0), n) + uu(p - vec2i(1, 0), n) + uu(p + vec2i(0, 1), n) + uu(p - vec2i(0, 1), n) - 4.0 * uu(p, n);
  // Not clamped: Cahn–Hilliard dips a little either side of an edge and
  // brings itself back, and a clamp there makes or loses ferrofluid.
  textureStore(dst, p, vec4f(textureLoad(src, p, 0).r + A.b.x * lap, 0.0, 0.0, 0.0));
}`,

  /*
    The reactions run in a gel, on grids of their own (256² for BZ, 128² for
    Liesegang): a gel does not flow, and reaction-diffusion patterns are
    counted in cells, so on the solver's grid they would come out a
    different size at every resolution and need hundreds of steps a frame on
    the big ones. A pour into one: A.a = (x, y, radius, grid size), A.b =
    what to add.
  */
  gridSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let g = A.a.w;
  if (id.x >= u32(g) || id.y >= u32(g)) { return; }
  let p = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / g;
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let f = select(0.0, 1.0, d < 1.0);
  // Up to 8: an outer electrolyte is poured far stronger than the inner one it meets.
  textureStore(dst, p, clamp(textureLoad(src, p, 0) + A.b * f, vec4f(0.0), vec4f(8.0)));
}`,

  /*
    One small step of the Belousov–Zhabotinsky reaction, the two-variable
    Oregonator (Tyson & Fife):
      ∂u/∂t = (u − u² − f v (u − q)/(u + q)) / ε + D ∇²u
      ∂v/∂t = u − v
    with ε = 0.05, q = 0.002, f = 1.4: an excitable medium. A disturbance
    sends out a wave that cannot pass through its own wake, so a broken wave
    front curls into a spiral, the patterns a dish of BZ is famous for.
    u is the activator (HBrO₂), v the oxidised catalyst (ferroin's blue).

    A.a.x = the step, A.a.z = the grid, A.a.w = D for u, in cells² per unit
    time.
  */
  rxnStep: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn r4(p: vec2i, n: f32) -> vec4f { return textureLoad(src, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = A.a.z;
  if (id.x >= u32(n) || id.y >= u32(n)) { return; }
  let p = vec2i(id.xy);
  let m = r4(p, n);
  let lap = r4(p + vec2i(1, 0), n) + r4(p - vec2i(1, 0), n) + r4(p + vec2i(0, 1), n) + r4(p - vec2i(0, 1), n) - 4.0 * m;
  let dt = A.a.x;
  let u = m.r;
  let v = m.g;
  let eps = 0.05;
  let q = 0.002;
  let f = 1.4;
  let du = (u - u * u - f * v * (u - q) / (u + q)) / eps + A.a.w * lap.r;
  let dv = u - v;
  textureStore(dst, p, vec4f(clamp(u + dt * du, 0.0, 1.0), clamp(v + dt * dv, 0.0, 1.0), m.b, m.a));
}`,

  /*
    Liesegang rings: the Keller–Rubinow model, with Ostwald's
    supersaturation.

      A  the outer electrolyte, poured at a spot and diffusing out
      B  the inner electrolyte, spread evenly through the plate
      C  their product, dissolved: A + B → C at rate k A B
      P  C come out of solution as a solid, which does not move

    C precipitates only once it passes a high threshold (nucleation), or a
    much lower one next to precipitate already there (growth on it). A band
    therefore forms at the front, then eats the C and, through it, the A and
    B around it, and the front has to travel on before the next nucleates:
    the bands come out spaced ever wider (the Jablczynski law), which is the
    whole signature of the thing and is not drawn anywhere.

    A.a.x = the step, A.a.z = the grid.
  */
  liesStep: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
fn l4(p: vec2i, n: f32) -> vec4f { return textureLoad(src, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = A.a.z;
  if (id.x >= u32(n) || id.y >= u32(n)) { return; }
  let p = vec2i(id.xy);
  let m = l4(p, n);
  let lap = l4(p + vec2i(1, 0), n) + l4(p - vec2i(1, 0), n) + l4(p + vec2i(0, 1), n) + l4(p - vec2i(0, 1), n) - 4.0 * m;
  let dt = A.a.x;
  let react = 4.0 * m.r * m.g;
  var a = m.r + dt * (6.0 * lap.r - react);
  var b = m.g + dt * (6.0 * lap.g - react);
  var c = m.b + dt * (0.5 * lap.b + react);
  // Growth only on precipitate already in this cell: letting it grow onto
  // a neighbour made the band creep outward a cell at a time instead of
  // starving the gap ahead of it, and one solid disc came out, not rings.
  var g = 0.0;
  if (c > 0.12) { g = 5.0 * (c - 0.02); }
  else if (m.a > 0.01 && c > 0.02) { g = 5.0 * (c - 0.02); }
  let dp = min(dt * g, max(c, 0.0));
  c = c - dp;
  textureStore(dst, p, vec4f(max(a, 0.0), max(b, 0.0), max(c, 0.0), min(m.a + dp, 4.0)));
}`,


  /*
    Everything the plate draws from the liquids' own physics, in one texel.

    The display pass already reads sixteen textures, which is WebGPU's
    default limit for one shader stage, so these ride in the one binding the
    ferrofluid used to have: eight numbers a cell, as four pairs of 16-bit
    fixed point (pack2x16unorm).

      x  ferrofluid, oil
      y  acidity (−1..1 as 0..1), soap
      z  BZ's oxidised catalyst, Liesegang's precipitate (0..4 as 0..1)
      w  the gap between the glasses (0..0.06 as 0..1), BZ's activator

    The reactions live on grids of their own and are read between their
    texels. A.a = which inputs are real (ferrofluid, mix, BZ, Liesegang);
    A.b.x, A.b.y = the BZ and Liesegang grids.
  */
  packView: `${HEAD}
@group(0) @binding(2) var phase: texture_2d<f32>;
@group(0) @binding(3) var mixT: texture_2d<f32>;
@group(0) @binding(4) var rxn: texture_2d<f32>;
@group(0) @binding(5) var lies: texture_2d<f32>;
@group(0) @binding(6) var sq: texture_2d<f32>;
@group(0) @binding(7) var dst: texture_storage_2d<rgba32uint, write>;
fn grid(t: texture_2d<f32>, uv: vec2f, g: f32) -> vec4f {
  let q = uv * g - 0.5;
  let i = vec2i(floor(q));
  let f = q - floor(q);
  let m = i32(g) - 1;
  let a = textureLoad(t, clamp(i, vec2i(0), vec2i(m)), 0);
  let b = textureLoad(t, clamp(i + vec2i(1, 0), vec2i(0), vec2i(m)), 0);
  let c = textureLoad(t, clamp(i + vec2i(0, 1), vec2i(0), vec2i(m)), 0);
  let d = textureLoad(t, clamp(i + vec2i(1, 1), vec2i(0), vec2i(m)), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  let ph = select(0.0, textureLoad(phase, p, 0).r, A.a.x > 0.5);
  let m = select(vec4f(0.0), textureLoad(mixT, p, 0), A.a.y > 0.5);
  let r = select(vec4f(0.0), grid(rxn, uv, A.b.x), A.a.z > 0.5);
  let l = select(vec4f(0.0), grid(lies, uv, A.b.y), A.a.w > 0.5);
  let gap = textureLoad(sq, p, 0).r;
  textureStore(dst, p, vec4u(
    pack2x16unorm(clamp(vec2f(ph, m.r), vec2f(0.0), vec2f(1.0))),
    pack2x16unorm(clamp(vec2f(m.b * 0.5 + 0.5, m.g), vec2f(0.0), vec2f(1.0))),
    pack2x16unorm(clamp(vec2f(r.g, l.a * 0.25), vec2f(0.0), vec2f(1.0))),
    pack2x16unorm(clamp(vec2f(gap / 0.06, r.r), vec2f(0.0), vec2f(1.0)))));
}`,

  sharpenDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
const SHARP_FLOOR = 0.08;
fn at(p: vec2i) -> vec4f { return textureLoad(dye, clampP(p, S.n), 0); }
fn gate(a: vec4f, b: vec4f) -> f32 { return min(a.a, b.a) / (max(a.a, b.a) + 1e-4); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = at(p);
  let l = at(p - vec2i(1, 0));
  let r = at(p + vec2i(1, 0));
  let d = at(p - vec2i(0, 1));
  let u = at(p + vec2i(0, 1));
  let dl = at(p + vec2i(-1, -1));
  let dr = at(p + vec2i(1, -1));
  let ul = at(p + vec2i(-1, 1));
  let ur = at(p + vec2i(1, 1));
  let f = 0.20 * (gate(c, l) * (c - l) + gate(c, r) * (c - r) + gate(c, d) * (c - d) + gate(c, u) * (c - u))
        + 0.05 * (gate(c, dl) * (c - dl) + gate(c, dr) * (c - dr) + gate(c, ul) * (c - ul) + gate(c, ur) * (c - ur));
  let lo = min(min(min(l, r), min(d, u)), min(min(dl, dr), min(ul, ur)));
  let hi = max(max(max(l, r), max(d, u)), max(max(dl, dr), max(ul, ur)));
  let scale = max(hi, c) - min(lo, c);
  let fl = sign(f) * max(abs(f) - SHARP_FLOOR * scale, vec4f(0.0));
  let s = c + S.sharp * fl;
  textureStore(dst, p, max(clamp(s, min(lo, c), max(hi, c)), vec4f(0.0)));
}`,

  decayDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  var d = textureLoad(dye, vec2i(id.xy), 0) * S.evap;
  // Before the clamp: an infinity through it is inf * 0, a NaN.
  if (!finite4(d)) { d = vec4f(0.0); }
  if (d.a > 6.0) { d *= 6.0 / d.a; }
  textureStore(dst, vec2i(id.xy), max(d, vec4f(0.0)));
}`,

  decayVel: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  var v = textureLoad(vel, vec2i(id.xy), 0);
  // Before the speed limit: an infinite speed through it is inf * 0, a NaN.
  if (!finite4(vec4f(v.xyz, 0.0))) { v = vec4f(0.0); }
  v = vec4f(v.xy * S.damping, v.z, v.w);
  let sp = length(v.xy);
  if (sp > S.maxSpeed) { v = vec4f(v.xy * (S.maxSpeed / sp), v.z, v.w); }
  v.z *= S.heatDecay;
  textureStore(dst, vec2i(id.xy), vec4f(v.xyz, 0.0));
}`,

  // The drain's inward spiral. A.a.x is the pull, A.a.y how far through it is.
  drainVel: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = (vec2f(0.5) - uvOf(id)) * S.l;
  let dist = max(length(d), 1.0);
  let dir = d / dist;
  let inward = A.a.x * (1.0 + dist / 50.0);
  let swirl = A.a.x * 0.7 * (1.0 - A.a.y * 0.5);
  textureStore(dst, vec2i(id.xy), vec4f(dir.x * inward - dir.y * swirl, dir.y * inward + dir.x * swirl, 0.0, 0.0));
}`,

  scaleDye: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  textureStore(dst, vec2i(id.xy), textureLoad(src, vec2i(id.xy), 0) * A.a.x);
}`,

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

    And the result is held to the range of its eight neighbours and itself.
    A filter this sharp rings like any other: a hard diagonal edge is a
    staircase, the staircase is a checkerboard one cell wide, and taking it
    out left a ring past the edge 12.9% of its height after five seconds
    (`npm run grating`'s disc with the clamp taken out; the Gibbs overshoot
    of any sharp cutoff). Held to its
    neighbours, a cell can soften toward them but never pass them, so the
    ring is gone (0.003% of the edge) and the checkerboard, whose every cell
    sits inside its neighbours' range, goes as fast as before. The clamp is
    the one place dye can be made: 15 parts per million in ten seconds on a
    plate of hard edges. `npm run grating` holds it to all of this.

    A.a.x is s.
  */
  dampGrid: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let k = array<f32, 5>(1.0, -4.0, 6.0, -4.0, 1.0);
  var c = vec4f(0.0);
  var lo = vec4f(1e30);
  var hi = vec4f(-1e30);
  for (var j = 0; j < 5; j++) {
    var row = vec4f(0.0);
    for (var i = 0; i < 5; i++) {
      let q = textureLoad(src, clampP(p + vec2i(i - 2, j - 2), S.n), 0);
      row += k[i] * q;
      if (abs(i - 2) <= 1 && abs(j - 2) <= 1) { lo = min(lo, q); hi = max(hi, q); }
    }
    c += k[j] * row;
  }
  let f = textureLoad(src, p, 0) - A.a.x * c * (1.0 / 256.0);
  textureStore(dst, p, clamp(f, max(lo, vec4f(0.0)), max(hi, vec4f(0.0))));
}`,

  // Box-filter a field down to the logical grid, for the CPU's readers.
  downsample: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(S.l) || id.y >= u32(S.l)) { return; }
  let k = S.n / S.l;
  let n = i32(clamp(ceil(k), 1.0, 4.0));
  var acc = vec4f(0.0);
  let base = vec2f(id.xy) * k;                    // the first physical texel of this logical cell
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let p = vec2i(clamp(base + vec2f(f32(i), f32(j)) * (k / f32(n)), vec2f(0.0), vec2f(S.n - 1.0)));
      acc += textureLoad(src, p, 0);
    }
  }
  textureStore(dst, vec2i(id.xy), acc / f32(n * n));
}`,

  /**
   * Dye laid down by the reaction (`WebGPUFluid.depositChemistry`). The activator is
   * on the logical grid, so it is read bilinearly, exactly as a CPU delta
   * would have been; above the threshold it deposits colour the way
   * `addDensity` does — absorption in rgb, density in a.
   *
   * A.a = (amount, threshold, 0, 0), A.b.rgb = −log(colour).
   */
  depositChem: `${HEAD}${BILERP_N}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var chem: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  var d = textureLoad(dye, vec2i(id.xy), 0);
  let a = bilerpN(chem, uvOf(id), S.l).g;
  if (a > A.a.y) {
    let w = A.a.x * (a - A.a.y);
    d = vec4f(d.rgb + w * A.b.rgb, d.a + w);
  }
  textureStore(dst, vec2i(id.xy), d);
}`,

  // Clear a field to a constant (A.a), used by clear() and the pressure warm start.
  fill: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.b.x) || id.y >= u32(A.b.y)) { return; }
  textureStore(dst, vec2i(id.xy), A.a);
}`,
};

/** A kernel's source with its storage format filled in (WGSL has no format generics). */
export function kernel(name: string, dstFormat: string): string {
  const src = KERNELS[name];
  if (!src) throw new Error(`no such fluid kernel: ${name}`);
  return src.replaceAll('DYE_FORMAT', dstFormat);
}
