/**
 * The ferrofluid under a strong field: the labyrinth's screened solve, its
 * chemical potential, the maze's flow and the Cahn–Hilliard step.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, MAGNET_WGSL, NOISE_WGSL, STAND_ASIDE, W } from './shared';

export const LABYRINTH_KERNELS: Record<string, string> = {
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
  let outVal = (s + c) / (4.0 + A.a.x);
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
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
  let chi = (A.b.z + (1.0 - A.b.z) * sat * (1.0 + FINGER_REPEL * spikesClose(A.a))) * (1.0 + 0.25 * snoise(uv * 9.0 + vec2f(A.b.w * 0.05, -A.b.w * 0.03)));
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
  let well = min(max(1.0, wellNeed), (1.9 / max(A.b.x, 1e-4) - 64.0) / 16.0);
  let local = 2.0 * c * (1.0 - c) * (1.0 - 2.0 * c) * well - lap;
  let repel = A.b.y * chi * w;
  let outVal = vec4f(local + repel, local + repel * (1.0 - close) * step(1e-6, A.b.z), 0.0, 0.0);
  textureStore(dst, p, select(vec4f(0.0), outVal, finite2(outVal.xy)));
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
@group(0) @binding(5) var stand: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<rgba16float, write>;
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
  // None under a standing layer: the film moves the liquid there (STAND_ASIDE).
  var f = -c * g * A.a.x * (1.0 - textureLoad(stand, p, 0).r);
  let fl = length(f);
  if (fl > A.a.y) { f = f * (A.a.y / fl); }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  phaseCH: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mu: texture_2d<f32>;
@group(0) @binding(4) var stand: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<r32float, write>;
fn uu(p: vec2i, n: f32) -> f32 { return textureLoad(mu, clampP(p, n), 0).g; }
${STAND_ASIDE}
// The flux from q into p, less where a standing layer's film steps it (see STAND_ASIDE).
fn face(p: vec2i, q: vec2i, n: f32) -> f32 { return aside(p, q, n) * (uu(q, n) - uu(p, n)); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  var lap = uu(p + vec2i(1, 0), n) + uu(p - vec2i(1, 0), n) + uu(p + vec2i(0, 1), n) + uu(p - vec2i(0, 1), n) - 4.0 * uu(p, n);
  // Face by face only near a film, so everywhere else sums as it always did.
  let st = max(max(textureLoad(stand, clampP(p + vec2i(1, 0), n), 0).r, textureLoad(stand, clampP(p - vec2i(1, 0), n), 0).r),
               max(max(textureLoad(stand, clampP(p + vec2i(0, 1), n), 0).r, textureLoad(stand, clampP(p - vec2i(0, 1), n), 0).r), textureLoad(stand, p, 0).r));
  if (st > 0.0) {
    lap = face(p, p + vec2i(1, 0), n) + face(p, p - vec2i(1, 0), n) + face(p, p + vec2i(0, 1), n) + face(p, p - vec2i(0, 1), n);
  }
  // Not clamped: Cahn–Hilliard dips a little either side of an edge and
  let outVal = textureLoad(src, p, 0).r + A.b.x * lap;
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,

  /*
    phaseCH for the ferrofluid carried as a volume under Thin Gap
    (phaseAdvect's A.a.x). The plain step moves share down μ's gradient,
    which keeps Σc; in a gap the glass is pressing, what crosses a face is
    liquid, as much as the thinner of the two gaps lets through, and each
    cell divides by its own gap, so Σc·h is kept, as phaseGrid's filter is.
    Measured on the Press × ferrofluid check's pool (npm run ferropress)
    after phaseGrid, held ten steps under a palm that had pressed the
    middle to a sixth of the gap: the volume went 0.01567 → 0.01556 (0.7%)
    with the plain step and stayed at 0.01570 with none. Every face's share
    of the difference is at most the plain step's, so its stability limit
    is unchanged. The gap is the one the phase has now moved into.

    And the mobility is degenerate, 4m(1 − m) at each face's mean share
    m = ½(c_p + c_q), with no floor (Elliott & Garcke 1996; PLAN 29c).
    With a constant mobility at Cahn number ≈ 0.5 (an eight-cell drop on
    384², R = 0.022, Phase Edge 0.75), a curved edge's Gibbs–Thomson
    chemical potential shifts the bulk equilibrium to c_eq ≈ 0.021 and
    drives ferrofluid out through the clear oil at 2·M·dt a substep: at
    rest (\`npm run ferrorest\`) the drop's half-full cells fell 100 → 84
    over 180 steps (116 → 84 from pour), its peak fell 0.996 → 0.946, and
    its halo of cells over 0.01 grew by +248 (352 → 600), the same as on
    main with Thin Gap on; a dragged drop left that halo behind in fresh
    oil and re-made it as it moved (352 → 1602 cells over 0.01). Immiscible
    liquids do not diffuse through each other's bulk; transport in a thin
    gap is along the interface only. Evaluating 4m(1 − m) at the face's
    mean share m is symmetric in (p, q), so each face's flux stays
    antisymmetric and Σc·h is kept (to 0.01% over 200 steps, against a
    9.8% loss when evaluated at c_p alone); it reaches 1 at m = 0.5, stays
    at most 1 so the explicit stability limit (≤ M₀) is unchanged, and
    vanishes in pure oil and pure ferrofluid. Measured on \`ferrorest\`: the
    resting drop holds 90 of 100 half-full cells, its peak holds 0.975,
    and its halo grows by +94 (324 → 418); on the dragged drop the cells
    over 0.01 fall from 1602 to 1238 (the remaining trailing-rim loss to
    the oil's return flow is PLAN 29c-8). The deep plate's \`phaseCH\` stays
    as on main (PLAN 29c-1).
  */
  phaseCHVolume: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mu: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var stand: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<r32float, write>;
${STAND_ASIDE}
fn uu(p: vec2i, n: f32) -> f32 { return textureLoad(mu, clampP(p, n), 0).g; }
fn hh(p: vec2i, n: f32) -> f32 { return max(textureLoad(sq, clampP(p, n), 0).r, 0.004); }
fn cc(p: vec2i, n: f32) -> f32 { return clamp(textureLoad(src, clampP(p, n), 0).r, 0.0, 1.0); }
// A face's mobility, 0..1 of A.b.x: 4c(1 - c) at the two cells' mean share, 1 at
// an edge and nothing between two cells of one liquid (the comment above).
fn mob(cp: f32, cq: f32) -> f32 { let m = 0.5 * (cp + cq); return 4.0 * m * (1.0 - m); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = S.n;
  let hp = hh(p, n);
  let up = uu(p, n);
  let cp = cc(p, n);
  var flow = 0.0;
  for (var k = 0; k < 4; k++) {
    let q = p + select(vec2i(0, 1 - 2 * (k & 1)), vec2i(1 - 2 * (k & 1), 0), k < 2);
    flow += aside(p, q, n) * mob(cp, cc(q, n)) * (uu(q, n) - up) * min(hp, hh(q, n));
  }
  let outVal = textureLoad(src, p, 0).r + A.b.x * flow / hp;
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,
};
