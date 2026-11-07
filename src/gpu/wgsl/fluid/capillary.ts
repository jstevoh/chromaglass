/**
 * The oil's capillary physics: its chemical potential, the rim's pressure round
 * the ring, the capillary force σ κ ∇c̃, and the film between drops that keeps
 * two drops two.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { OPEN_RIM } from '../../../lib/turntable';
import { HEAD, W } from './shared';

/*
  How far inside the rim the rim's pressure is laid in (CAPILLARY, below), in
  cells. A gradient moves nothing wherever it is laid, so the width is only
  how gently Φ comes up: over a band this wide its radial part is about the
  capillary force's own size at an edge four cells wide, and the band is
  still a twentieth of a 192 plate's radius.
*/
const RIM_BAND = 8;
/** The most samples rimLaplace takes round the ring (its workgroup arrays' length; fluid.ts sizes the ring). */
export const RIM_SAMPLES = 1024;
/*
  The oil's capillary force, σ κ ∇c̃, at one cell (mixForce has the physics),
  shared by mixForce and rimLaplace so the rim reads the very force the flow
  is given. Both bind the oil's blur as \`soft\`; A.a.x is σ and A.a.y the most
  it may add, both mixForce's.

  And the rim's share of it (PLAN 18g-6). The thin gap's rim is open: past
  it the liquid is the reservoir round the cover glass, held at the air's
  pressure, p = 0 (wgsl/thinGap.ts). That is the water's pressure there, and
  a cell of water at the rim is right to have it. A cell of oil is not: the
  oil's interface makes the oil σκ above the water round it (Young–Laplace),
  and a body cut by the rim still has its interface past it, in the water
  of the reservoir, so the oil at the rim is at σκ, not at zero. Held at
  zero, the oil just inside the rim was at its body's Laplace pressure and
  the rim's own cells at none, and the difference drained the body out
  through the rim by its own surface tension, with the plate level and
  nothing stirring: in the lab a lens of radius 0.06 laid against the rim at
  Clock Glass's Oil Tension kept 9.6% of its oil after six seconds (\`npm
  run rimhold\`), and the same lens at a hundredth of the tension, or in the
  middle of the dish, kept all of it.

  So the rim holds each cell at the oil's own pressure there, φ: the line
  integral of the capillary force along the rim, ∮ f·dl from a cell of water
  (rimLaplace), which across an interface is the jump σκ the force makes and
  across water or the inside of a body is nothing. Not laid into the
  pressure solve's held cells (which every carry's faces read too,
  THIN_FACE), but as the same thing said in the force: the gradient of
  Φ = w(r)·φ(θ), a ramp w from nothing to one over the last RIM_BAND cells
  inside the rim, taken off the capillary force. A gradient moves nothing
  between two glasses (the pressure takes it, whatever the drag in each
  cell: u = c(f − ∇p)), so inside the band the flow is the flow it was; and
  the solve's p' = p − Φ held at zero on the rim is p held at φ there.
  Everywhere short of the band the force is untouched, to the bit.
*/
const CAPILLARY = /* wgsl */ `
fn cs(p: vec2i, n: f32) -> f32 { return textureLoad(soft, clampP(p, n), 0).r; }
fn grad(p: vec2i, n: f32) -> vec2f {
  return 0.5 * vec2f(cs(p + vec2i(1, 0), n) - cs(p - vec2i(1, 0), n), cs(p + vec2i(0, 1), n) - cs(p - vec2i(0, 1), n));
}
// The edge's unit normal, fading to nothing where there is no edge to have one.
fn nrm(p: vec2i, n: f32) -> vec2f { let g = grad(p, n); return g / sqrt(dot(g, g) + 0.0004); }
// σ κ ∇c̃. The normal's divergence by central differences of the normals
// themselves, not a second derivative of c: that is the step that keeps the
// grid out of it.
fn capillaryAt(p: vec2i, n: f32) -> vec2f {
  let g = grad(p, n);
  let kappa = -0.5 * ((nrm(p + vec2i(1, 0), n).x - nrm(p - vec2i(1, 0), n).x) + (nrm(p + vec2i(0, 1), n).y - nrm(p - vec2i(0, 1), n).y));
  var f = A.a.x * kappa * g;
  let l = length(f);
  if (l > A.a.y) { f *= A.a.y / l; }
  return f;
}
// The ring rimLaplace integrates along: two cells inside the rim, inside
// every cell the solve holds (the rim's and the grid's edge, hsPrep).
fn rimRing(n: f32) -> f32 { return ${OPEN_RIM.toFixed(2)} - 2.0 / n; }
// w(r): nothing short of the band, one from a cell and a half inside the rim outward.
fn rimRamp(r: f32, n: f32) -> f32 { return smoothstep(${OPEN_RIM.toFixed(2)} - (1.5 + ${RIM_BAND.toFixed(1)}) / n, ${OPEN_RIM.toFixed(2)} - 1.5 / n, r); }
`;
/*
  Film Hold: the water film between two drops of oil, and why it holds.

  Asked from a photograph of a splodascope (the owner, 2026-10-25): a
  crowd of round cells of yellow, red, pink and green oil packed edge to
  edge in blue water, some inside others, none merging. On this plate two
  bodies of oil merged the moment their edges met, because a single
  Cahn–Hilliard field charges for boundary and nothing else, and two
  boundaries a few cells apart are cheaper as none, and the capillary force
  pulls them shut besides (mixFilm says why). In the lab (192², the look's
  crowd of 35 drops, six seconds) the plate as it was left 3 bodies; with
  the hold, 31 (npm run filmhold).

  Real drops do not merge on touching. Two drops pressed together first
  have to squeeze out the water between them, and a light show's water
  carries soap or the dyes' own wetting agents, whose molecules sit on both
  faces of the film. When the faces come within a few tens of nanometres
  they repel (the double layers' charge and the surfactant's tails: the
  disjoining pressure Π(h), Derjaguin's), and the film stops thinning at
  the thickness where Π balances the drops' Laplace pressure. That is why a
  soapy emulsion, or foam, is a crowd of cells with walls between them, and
  why the walls between unequal drops curve into the bigger one. The film
  breaks only if something presses harder than Π can hold: a hand on the
  glass, a hard current, the top glass pushed down.

  Simulated as the disjoining pressure is in a diffuse-interface model:
  an energy for the water in a film, added to the oil's chemical potential
  there, so oil flows out of a thinning film and back into its own drop
  (the push back), and nothing anywhere else changes. A cell is in a film
  when it has oil on both sides of it along a line: along the two axes and
  the two diagonals, the most oil within FILM_REACH cells ahead and the
  most behind, the lesser of the two, the greatest of the four lines. Each
  is weighted by how far off it is, falling by e every FILM_DECAY cells,
  so a thinner film pushes harder, as Π does (an exponential, the double
  layer's own form). A cell beside one drop has oil on one side only and
  reads nothing, so a lone drop rounds as before, and Film Hold at 0 adds
  nothing at all. Only oil well past a half counts (0.55 to 0.9): the
  field's edge is a few cells of part-oil, and read as oil, a cell in
  that band saw it on both sides along the edge's own tangent and the
  hold reshaped a lone drop's edge (the filmhold check, 0.081 of a cell's
  oil at worst, against the bar of 0.01); and only a cell that is water
  itself is in a film, for the same reason on the oil's side (0.026).

  Shortcuts, named (PLAN 28k-2): a real film is tens of nanometres; on the
  grid it is the narrowest the field can draw, two or three cells, so the
  wall between two cells is drawn as thick as the field's own edge. And the
  film breaks when it is pressed past what Π holds, which is the threshold
  of the real rupture but not its timing: a real film also breaks by chance
  as it drains, sooner when it is dirty or hot.
*/
export const FILM_REACH = 6;
export const FILM_DECAY = 2.5;
const FILM_WGSL = /* wgsl */ `
fn filmReach(p: vec2i, e: vec2i, n: f32) -> f32 {
  let len = length(vec2f(e));
  var m = 0.0;
  for (var k = 1; k <= ${FILM_REACH}; k++) {
    let d = f32(k) * len;
    m = max(m, smoothstep(0.55, 0.9, cc(p + e * k, n)) * exp(-(d - 1.0) / ${FILM_DECAY.toFixed(2)}));
  }
  return m;
}
fn filmSqueeze(p: vec2i, n: f32) -> f32 {
  var s = min(filmReach(p, vec2i(1, 0), n), filmReach(p, vec2i(-1, 0), n));
  s = max(s, min(filmReach(p, vec2i(0, 1), n), filmReach(p, vec2i(0, -1), n)));
  s = max(s, min(filmReach(p, vec2i(1, 1), n), filmReach(p, vec2i(-1, -1), n)));
  s = max(s, min(filmReach(p, vec2i(1, -1), n), filmReach(p, vec2i(-1, 1), n)));
  return s;
}
`;

export const CAPILLARY_KERNELS: Record<string, string> = {
  /*
    Oil and water: the Cahn–Hilliard chemical potential.

    μ = f′(c) − κ∇²c, with f(c) = c²(1 − c)², the double well whose two floors
    are pure water and pure oil. The first term drives a mixed cell toward
    one or the other; the second charges for every bit of boundary, which is
    what surface tension *is*: a blob rounds up because a circle is the
    shortest boundary for its area, and a thin thread breaks into drops for
    the same reason (Rayleigh–Plateau). Neither is drawn; both fall out.
    Stored in the mix's alpha for the update and the force to read.

    And, with Film Hold (A.a.x), the water film between two bodies of oil
    pushes back as it thins: FILM_WGSL says what that is and why.
  */
  mixMu: `${HEAD}${FILM_WGSL}
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
  var mu = 2.0 * c * (1.0 - c) * (1.0 - 2.0 * c) - lap;
  // In the water only: an edge cell on the oil's side sees its own oil
  // both ways along the edge's tangent, and is not in a film.
  if (A.a.x > 0.0) { mu += A.a.x * filmSqueeze(p, n) * (1.0 - smoothstep(0.15, 0.5, c)); }
  let outVal = vec4f(m.rgb, mu);
  textureStore(dst, p, select(vec4f(0.0), outVal, finite4(outVal)));
}`,

  /*
    The oil's pressure along the rim, φ(θ), for mixForce to hold the open rim
    at (CAPILLARY has the physics). One workgroup: the ring two cells inside
    the rim sampled K times (the texture's width, a cell or so apart), at
    each sample the capillary force mixForce lays, bilinear between its
    cells, and its component along the ring times the arc, which summed
    round the ring is ∮ f·dl.

    From a cell of water: the sample with the least oil on it is zero, as
    the reservoir's water is. Across an interface the sum rises by the jump
    σκ and inside a body it is flat, so a body cut by the rim reads its own
    Laplace pressure from end to end. The sum round the whole ring is zero
    only for a force that is a gradient; a body that is not round has a
    different curvature where it enters the ring and where it leaves, and
    the two jumps do not cancel. What is left over is laid along the ring by
    the oil it crosses (the share of the ring's oil passed so far), so the
    water's samples stay at the water's zero and a body's pressure runs
    from one end's jump to the other's across it, as the pressure inside a
    body that is still rounding does.

    A.a = mixForce's (σ, the most a cell may add).
  */
  rimLaplace: `${HEAD}${CAPILLARY}
@group(0) @binding(2) var soft: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
var<workgroup> ring: array<f32, ${RIM_SAMPLES}>;
var<workgroup> oilOn: array<f32, ${RIM_SAMPLES}>;
var<workgroup> part: array<vec2f, 64>;
var<workgroup> least: array<vec2f, 64>;
var<workgroup> total: vec3f;
// A cell's (capillary force, oil) between the four cells round g.
fn sampleAt(g: vec2f, n: f32) -> vec3f {
  let c0 = vec2i(floor(g));
  let f = g - floor(g);
  let a = vec3f(capillaryAt(c0, n), cs(c0, n));
  let b = vec3f(capillaryAt(c0 + vec2i(1, 0), n), cs(c0 + vec2i(1, 0), n));
  let c = vec3f(capillaryAt(c0 + vec2i(0, 1), n), cs(c0 + vec2i(0, 1), n));
  let d = vec3f(capillaryAt(c0 + vec2i(1, 1), n), cs(c0 + vec2i(1, 1), n));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
@compute @workgroup_size(64) fn main(@builtin(local_invocation_index) t: u32) {
  let n = S.n;
  let k = i32(textureDimensions(dst).x);
  let per = k / 64;
  let first = i32(t) * per;
  let rs = rimRing(n);
  let step = 6.2831853 / f32(k);
  let arc = step * rs * n;
  var mine = vec2f(0.0);
  for (var j = 0; j < per; j++) {
    let i = first + j;
    let th = (f32(i) + 0.5) * step;
    let dir = vec2f(cos(th), sin(th));
    let s = sampleAt((vec2f(0.5) + rs * dir) * n - 0.5, n);
    ring[i] = dot(s.xy, vec2f(-dir.y, dir.x)) * arc;
    oilOn[i] = clamp(s.z, 0.0, 1.0);
    mine += vec2f(ring[i], oilOn[i]);
  }
  part[t] = mine;
  workgroupBarrier();
  if (t == 0u) {
    var run = vec2f(0.0);
    for (var i = 0; i < 64; i++) { let here = part[i]; part[i] = run; run += here; }
    total = vec3f(run, 0.0);
  }
  workgroupBarrier();
  let sums = total.xy;
  var run = part[t];
  var low = vec2f(2.0, 0.0);
  for (var j = 0; j < per; j++) {
    let i = first + j;
    let here = vec2f(ring[i], oilOn[i]);
    let mid = run + 0.5 * here;
    let share = select(mid.y / sums.y, (f32(i) + 0.5) / f32(k), sums.y < 1e-6);
    run += here;
    ring[i] = mid.x - sums.x * share;
    if (here.y < low.x) { low = vec2f(here.y, f32(i)); }
  }
  least[t] = low;
  workgroupBarrier();
  if (t == 0u) {
    var best = least[0];
    for (var i = 1; i < 64; i++) { if (least[i].x < best.x) { best = least[i]; } }
    total.z = best.y;
  }
  workgroupBarrier();
  let zero = ring[i32(total.z)];
  for (var j = 0; j < per; j++) {
    let i = first + j;
    textureStore(dst, vec2i(i, 0), vec4f(ring[i] - zero, 0.0, 0.0, 0.0));
  }
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
  mixForce: `${HEAD}${CAPILLARY}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var dye: texture_2d<f32>;
@group(0) @binding(5) var soft: texture_2d<f32>;
@group(0) @binding(6) var rimPhi: texture_2d<f32>;
@group(0) @binding(7) var dst: texture_storage_2d<rgba16float, write>;
// Φ = w(r)·φ(θ) at a cell (CAPILLARY): φ read round the ring, between its samples.
fn rimHeld(q: vec2i, n: f32) -> f32 {
  let d = (vec2f(q) + 0.5) / n - vec2f(0.5);
  let w = rimRamp(length(d), n);
  if (w <= 0.0) { return 0.0; }
  let k = i32(textureDimensions(rimPhi).x);
  let s = fract(atan2(d.y, d.x) / 6.2831853 + 1.0) * f32(k) - 0.5;
  let i0 = i32(floor(s));
  let a = textureLoad(rimPhi, vec2i((i0 + k) % k, 0), 0).r;
  let b = textureLoad(rimPhi, vec2i((i0 + 1 + k) % k, 0), 0).r;
  // (Not mix(): the oil's texture has that name in this kernel.)
  return w * (a + (b - a) * (s - floor(s)));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  var capillary = capillaryAt(p, n);
  // On a thin gap, the rim held at the oil's own pressure (CAPILLARY says why).
  if (S.thinGap > 0.5) {
    capillary -= 0.5 * vec2f(rimHeld(p + vec2i(1, 0), n) - rimHeld(p - vec2i(1, 0), n), rimHeld(p + vec2i(0, 1), n) - rimHeld(p - vec2i(0, 1), n));
  }
  let wax = textureLoad(dye, p, 0).a;
  let oil = textureLoad(mix, p, 0).r;
  // Oil has density below water (PLAN §18f): floats upward when plate is upright/tilted.
  let rho = wax - S.meanD - 0.15 * oil;
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
    Film Hold's push on the flow: the near-contact force (FILM_WGSL has the
    physics). The disjoining pressure is a pressure, so the film pushes on
    the liquid as well as costing the oil: without this, two drops a few
    cells apart were pulled together by the capillary force itself, which is
    taken from the oil blurred five cells wide (mixSmooth) and so reads two
    drops that close as one body with a waist, whose curvature pulls the
    waist shut. That is the numerical coalescence every smoothed-interface
    solver has, and it is cured the way Montessori, Lauricella, Tirelli and
    Succi cure it in their lattice Boltzmann emulsions (J. Fluid Mech. 872,
    2019): a force on each interface, along its normal into its own drop,
    wherever another interface faces it across the water within
    FILM_REACH cells, stronger the thinner the film. The two faces of a film
    are pushed apart alike, so it makes no momentum.

    Each edge cell looks out along its own normal through the water: past
    the edge it is on (the oil falling under a half) to where oil rises over
    a half again, and the distance h there sets the push,
    exp(−h / FILM_DECAY), times how much edge the cell holds (|∇c̃|).

    A.a.x = the push at h = 0 per unit of edge (σ's own scale times Film
    Hold), A.a.y = the most a cell may add, as mixForce's.
  */
  mixFilm: `${HEAD}${CAPILLARY}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var mix: texture_2d<f32>;
@group(0) @binding(4) var soft: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
fn oilAt(q: vec2f, n: f32) -> f32 { return textureLoad(mix, clampP(vec2i(floor(q)), n), 0).r; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var v = textureLoad(vel, p, 0);
  let g = grad(p, n);
  let edge = length(g);
  if (edge > 0.01) {
    let into = g / edge;           // toward this cell's own oil
    let here = vec2f(p) + 0.5;
    var out = false;
    var h = -1.0;
    for (var k = 1; k <= ${FILM_REACH * 2}; k++) {
      let d = 0.5 * f32(k);
      let c = oilAt(here - into * d, n);
      if (!out) { out = c < 0.5; }
      else if (c > 0.5) { h = d; break; }
    }
    if (h > 0.0) {
      var f = A.a.x * exp(-h / ${FILM_DECAY.toFixed(2)}) * g;
      let l = length(f);
      if (l > A.a.y) { f *= A.a.y / l; }
      v = vec4f(v.xy + f, v.zw);
    }
  }
  textureStore(dst, p, safeVel(v));
}`,
};
