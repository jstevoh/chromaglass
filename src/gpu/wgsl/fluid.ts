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
  fingering: f32,
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
  let ve = dot(va + vb, vec2f(e)) * 0.125;
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
  let gpsi = vec2f(magnetEnergy(uv + vec2f(h, 0.0), A.a) - magnetEnergy(uv - vec2f(h, 0.0), A.a),
                   magnetEnergy(uv + vec2f(0.0, h), A.a) - magnetEnergy(uv - vec2f(0.0, h), A.a)) * (0.5 * n);
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
      let g2 = max(0.004, gap + dg);
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
  let o = clamp(r, mn, mx);
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

  if (S.fingering > 0.0 && d >= 0.05) {
    let gx = (bilerpN(dye, uv + eL, S.n).a - bilerpN(dye, uv - eL, S.n).a) * 0.5;
    let gy = (bilerpN(dye, uv + eL.yx, S.n).a - bilerpN(dye, uv - eL.yx, S.n).a) * 0.5;
    let g2 = gx * gx + gy * gy;
    if (g2 > 0.005) {
      let g = sqrt(g2);
      let n = snoise(p * 0.02 + vec2f(0.0, S.time * 0.05));
      v = vec4f(v.xy - (vec2f(gx, gy) / g) * (n * S.fingering * g * 4.0), v.z, v.w);
    }
  }

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
  let dd = tanh(bilerpN(dye, uv, S.n).a - S.meanD);
  var f = vec2f(0.0, S.curBuoy * tanh(max(temp, 0.0) * 20.0));
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
  let m = textureLoad(src, p, 0) + A.b * f;
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
fn mx(p: vec2i, n: i32) -> vec3f { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).rgb; }
fn mm(a: vec3f, b: vec3f) -> vec3f {
  return select(vec3f(0.0), select(max(a, b), min(a, b), a > vec3f(0.0)), a * b > vec3f(0.0));
}
fn flux(a: vec2i, e: vec2i, n: i32) -> vec3f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec3f(0.0); }
  // The face's velocity, filtered [1 2 1] along the face: the collocated
  // projection leaves the flow a mode that alternates cell to cell, which the
  // two cells' plain mean passes across the other axis, and where the magnet
  // crowds the ferrofluid it printed a grid into the pool. The filter is
  // linear, so the flux field is as divergence-free as the flow it came from.
  let t = vec2i(e.y, e.x);
  let va = textureLoad(vel, clamp(a - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, a, 0).xy + textureLoad(vel, clamp(a + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let vb = textureLoad(vel, clamp(b - t, vec2i(0), vec2i(n - 1)), 0).xy + 2.0 * textureLoad(vel, b, 0).xy + textureLoad(vel, clamp(b + t, vec2i(0), vec2i(n - 1)), 0).xy;
  let ve = dot(va + vb, vec2f(e)) * 0.125;
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

    A.a.x = k (face speed per unit of Γ across it, in cells a step).
  */
  marangoniFlux: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
fn gm(p: vec2i, n: i32) -> f32 { return textureLoad(mix, clamp(p, vec2i(0), vec2i(n - 1)), 0).g; }
fn face(a: vec2i, e: vec2i, n: i32) -> vec4f {
  let b = a + e;
  if (b.x < 0 || b.y < 0 || b.x >= n || b.y >= n || a.x < 0 || a.y < 0 || a.x >= n || a.y >= n) { return vec4f(0.0); }
  let c = clamp(-A.a.x * (gm(b, n) - gm(a, n)), -0.24, 0.24);
  return c * select(textureLoad(src, b, 0), textureLoad(src, a, 0), c >= 0.0);
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
    What the mix does to the flow, and what gravity does to the dye.

    **Capillary (Korteweg) force**, −σ c ∇μ: the Cahn–Hilliard free energy's
    own force on the liquid, which is surface tension in a diffuse
    interface. It is what makes an oil blob in water pull itself round and
    carry the dye inside it along. A.a.x = σ.

    (Marangoni flow is not here: see marangoniFlux.)

    **Buoyancy**, g (βₛ(ρ − ρ̄) − β_T T): dye makes the liquid heavier, heat
    makes it lighter. On a plate standing up (or tilted) that is a
    Rayleigh–Taylor instability: heavy dye above light sinks in fingers. With
    heat diffusing faster than the dye (the double-diffusive case, see
    doubleDiffusion) it makes salt fingers. A.b.xy = gravity in the plate
    (with its size), A.b.z = βₛ, A.b.w = β_T.
  */
  mixForce: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
fn mm4(p: vec2i, n: f32) -> vec4f { return textureLoad(mix, clampP(p, n), 0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  let m = mm4(p, n);
  let gx = mm4(p + vec2i(1, 0), n) - mm4(p - vec2i(1, 0), n);
  let gy = mm4(p + vec2i(0, 1), n) - mm4(p - vec2i(0, 1), n);
  // In the potential form, −c ∇μ: equal to μ ∇c up to a gradient the
  // projection removes, and far smoother, because μ varies gently across a
  // drop where ∇c is a spike on its edge. The spike form left compression
  // behind that piled the oil past full and lost it at the guard.
  let capillary = -clamp(m.r, 0.0, 1.0) * vec2f(gx.a, gy.a) * 0.5 * A.a.x;
  let marangoni = -vec2f(gx.g, gy.g) * 0.5 * A.a.y;
  let rho = textureLoad(dye, p, 0).a - S.meanD;
  let buoy = A.b.xy * (A.b.z * rho - A.b.w * v.z);
  v = vec4f(v.xy + capillary + marangoni + buoy, v.z, v.w);
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
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
fn cc(p: vec2i, n: f32) -> f32 { return clamp(textureLoad(src, clampP(p, n), 0).r, 0.0, 1.0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let c = cc(p, n);
  let lap = cc(p + vec2i(1, 0), n) + cc(p - vec2i(1, 0), n) + cc(p + vec2i(0, 1), n) + cc(p - vec2i(0, 1), n) - 4.0 * c;
  let uv = uvOf(id);
  let e = magnetEnergy(uv, A.a);
  let sat = e / (e + 800.0);
  let chi = (A.b.z + (1.0 - A.b.z) * sat) * (1.0 + 0.25 * snoise(uv * 9.0 + vec2f(A.b.w * 0.05, -A.b.w * 0.03)));
  let w = textureLoad(psi, p, 0).r;
  textureStore(dst, p, vec4f(2.0 * c * (1.0 - c) * (1.0 - 2.0 * c) - lap + A.b.y * chi * w, 0.0, 0.0, 0.0));
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
fn uu(p: vec2i, n: f32) -> f32 { return textureLoad(mu, clampP(p, n), 0).r; }
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
