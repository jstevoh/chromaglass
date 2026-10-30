/**
 * The oil (the mix field) and Oil Bodies: a hand's carry, what lands in a body
 * and how it partitions, the cap at full, Marangoni, and the oil's update and
 * smoothing. Its capillary force and the rim are in `capillary.ts`.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';

export const OIL_KERNELS: Record<string, string> = {
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
    the outer edge of the ring squeezeOut lands the dye on (R to 1.7R), and
    A.b.x, when above zero, the share a ring cell receives, counted on the
    CPU as the colour's is (a small palm's ring, a puff's, does not tile:
    the formula's 1 / K lost 3.3% of the oil it moved, PLAN 15c). The
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
      // What a ring cell gets of the palm cell it reads: counted on the CPU
      // (A.b.x, pressShare), as the colour's is, or 1 / K from the formula.
      keep = select(1.0 / stretch(), A.b.x, A.b.x > 0.0);
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
    host's 'dye disperse' stage). In: the whole dye and the oil's share, both
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
  let outVal = vec4f(m.r - out, m.gba);
  textureStore(dst, p, select(vec4f(0.0), outVal, finite4(outVal)));
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
  let outVal = textureLoad(src, p, 0) - d;
  textureStore(dst, p, select(vec4f(0.0), outVal, finite4(outVal)));
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
  let outVal = vec4f(c, s, a, m.a);
  textureStore(dst, p, select(vec4f(0.0), outVal, finite4(outVal)));
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
};
