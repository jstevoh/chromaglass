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

    ── The magnet moves the phase, not the velocity ──

    This is the one decision worth stating loudly, and it is the lesson H6
    paid for three times. A magnet pulls radially, a radial field is
    curl-free, and curl-free is exactly what the pressure projection exists to
    remove — so a magnetic body force added to the fluid velocity would be
    deleted at the end of the very step that applied it. Instead the pull is
    added to the *displacement this kernel backtraces along*: the phase is
    carried toward the magnet directly, as transport, where no projection can
    reach it.

    A real magnet's pull follows the steepness of its own field and falls away
    sharply, so height is the control that matters most: close is a hard,
    narrow pull and lifting it away spreads and weakens it. That is an inverse
    power law, and the height sits inside it rather than beside it.

    A.a = (magnet x, magnet y, height, strength), A.b.x = polarity (which way
    up the magnet is held), A.b.y the displacement the flow advects by, A.b.z
    the magnet's own step in real time.
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

  phaseAdvect: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(5) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  var d = textureSampleLevel(vel, lin, uv, 0.0).xy * A.b.y;
  let m = A.a.xy;
  let toM = m - uv;
  let r = length(toM);
  if (A.a.w > 0.0001 && r > 1e-4) {
    /*
      The pull, as a magnet's is: it goes as the steepness of the field, and
      the height is what keeps it finite over the magnet itself. Held close
      (small height) this is tall and narrow; lifted away it flattens into
      something broad and weak, which is exactly how the shapes change.
    */
    let h = max(A.a.z, 0.02);
    /*
      A dipole's pull, and no normalising by height.

      It was written as fall times h cubed, which holds the pull constant over
      the magnet and makes it *broader* as the magnet is lifted — so held far
      away it gathered more of the plate than held close, which is backwards
      and was measured that way (30.6% against 23.6%). A real magnet's field
      falls as the cube of the distance, so lifting it weakens it everywhere;
      that is the whole reason height is the control that matters most, and
      the h³ was quietly cancelling it.
    */
    let fall = 1.0 / pow(r * r + h * h, 1.5);
    let pull = A.a.w * A.b.x * fall * 0.02;
    /*
      Minus, and the sign was settled by the plate rather than by argument.

      The reasoning said plus: this is a backtrace, pos is uv - d, so a
      displacement pointing at the magnet should fetch from the far side and
      carry the liquid inward. The plate disagreed flatly and repeatably — with
      the magnet on, the phase sat *further* from it than with the magnet off
      (0.329 against 0.250), it pushed harder held close than held away, and
      turning it over gathered. Three readings, one sign.
    */
    //
    // In real time (A.b.z), not the flow's displacement (A.b.y): a slow look
    // keeps the flow's step tiny, and a magnet scaled by it crept at a few
    // hundredths of the plate a second, so a hand dragging it left the
    // ferrofluid behind.
    d = d - (toM / r) * clamp(pull, -4.0, 4.0) * A.b.z;
  }
  let pos = clamp(uv - d, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  textureStore(dst, vec2i(id.xy), vec4f(textureSampleLevel(src, lin, pos, 0.0).r, 0.0, 0.0, 0.0));
}`,

  /*
    The phase separates instead of blurring.

    Semi-Lagrangian advection smears an interface a little every step, and a
    phase that blurs is a grey wash rather than two liquids. This pushes each
    cell away from the mean of its neighbours — anti-diffusion — which sharpens
    a boundary at exactly the rate advection softens it, and the clamp to the
    neighbourhood is what stops it running away into stripes.

    It is the same operator as sharpenDye above, with one difference that
    matters: the phase is also pulled toward 0 or 1 by the cubic term, so a
    cell that is nearly all phase becomes all phase and a cell that is nearly
    empty empties. That is the Cahn-Hilliard part, and it is what makes a
    domain keep an edge for minutes rather than a second.

    A.a.x is how hard, A.a.y the surface tension, which smooths the boundary's
    curvature and therefore sets how big a droplet has to be to keep its shape.
  */
  phaseSeparate: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn ph(p: vec2i, n: f32) -> f32 { return textureLoad(src, clampP(p, n), 0).r; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let c = ph(p, n);
  let l = ph(p - vec2i(1, 0), n); let r = ph(p + vec2i(1, 0), n);
  let d = ph(p - vec2i(0, 1), n); let u = ph(p + vec2i(0, 1), n);
  let mean = (l + r + d + u) * 0.25;
  /*
    Both halves conserve, and the first version did not.

    It had a pointwise cubic pulling each cell toward 0 or 1 — the tidy way to
    write "the phase separates" and a mass leak: once advection smears a cell
    below half, the cubic drives it to zero and that liquid is *gone*. Measured,
    the whole phase evaporated inside six seconds and the plate read empty.

    Diffusion and anti-diffusion both leave the total alone, because the sum of
    (neighbour mean − centre) over a symmetric stencil is zero. So the sharp
    boundary comes from the balance of the two: tension smooths it by its own
    curvature, which is what sets how big a droplet has to be to keep its
    shape, and the sharpening pushes back against what the advection blurred.
    Nothing here creates or destroys the liquid.
  */
  let smoothed = c + (mean - c) * clamp(A.a.y, 0.0, 1.0) * 0.5;
  let out = smoothed + (smoothed - mean) * clamp(A.a.x, 0.0, 1.0);
  // Never outside what the neighbourhood already holds: anti-diffusion that
  // is not fenced in makes stripes out of a smooth field.
  let lo = min(min(min(l, r), min(d, u)), c);
  let hi = max(max(max(l, r), max(d, u)), c);
  textureStore(dst, p, vec4f(clamp(out, min(lo, 0.0), max(hi, 1.0)), 0.0, 0.0, 0.0));
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
