/**
 * What holds the ferrofluid together and pulls it: the magnet's force, its
 * momentum on the flow, the cap at full, the separation's sharpening and its
 * blur.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, MAGNET_WGSL, PHASE_MEAN3, STAND_ASIDE, W } from './shared';
import { FILM_TOP } from '../standing';

export const PHASE_FORCE_KERNELS: Record<string, string> = {
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

    And read against the ferrofluid's own drag where a cell holds both
    liquids (PLAN 29c, the drop's rim). Under Thin Gap a body force is
    the speed it drives the reference liquid to, and hsPrep's drag on the
    cell is the two liquids' geometric mean by share (wgsl/thinGap.ts),
    which is right for the pressure's flow across a mixed cell and wrong
    for a force on one of the liquids alone: the two lie side by side in
    the gap, each its own column, and the Kelvin force moves the
    ferrofluid's column at the ferrofluid's own Darcy mobility whatever
    share of the cell it fills, while the clear liquid beside it is moved
    only by the pressure (two-phase Darcy flow, each liquid at its own
    mobility). So a cell's force-driven speed is φ·f·h²/12μ_ff, where the
    mixed drag gave φ·f·h²/12μ_mix: a half-full rim cell was driven at a
    quarter of the full cells' speed per unit of ferrofluid (ν_clear/ν_ff
    4.5, so 0.5·4.5^0.5 against 4.5), and the rim held the drop back and
    fell behind it. Measured (handoff, dropdiag): a drop 8 cells across
    went at 0.42 of the sharp drop's Darcy speed under a weak magnet and
    0.29 under a strong one, its back rim drawn into a crescent, the
    smear the owner saw. The factor (ν_clear/ν_ff)^(1−φ) on the force,
    A.b.z the ratio, is the mixed drag over the ferrofluid's, so what
    hsPrep's drag leaves is the ferrofluid's own speed, in proportion to
    its share. 1 off Thin Gap, where there is no drag to read against.
    The share is then carried at the cell's velocity, the mixture's, which
    the raised force and the projection make: the two columns lie side by
    side in the gap and the edge between them goes where the liquid goes,
    so a rim cell's ferrofluid has no velocity of its own for the carry to
    read (a carry at the column's, or at the drop's fitted over its body,
    tried and dropped: PLAN 29c-4, docs/plan-shipped.md §29c).

    A.a = the magnet, A.b.x = gain, A.b.y = the most one step may add,
    A.b.z = the clear liquid's viscosity over the ferrofluid's.
  */
  phaseForce: `${HEAD}${MAGNET_WGSL}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var stand: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
fn ph(p: vec2i, n: f32) -> f32 { return clamp(textureLoad(phase, clampP(p, n), 0).r, 0.0, 1.0); }
fn phs(p: vec2i, n: f32) -> f32 {
  var t = 0.0;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) { t += ph(p + vec2i(i, j), n); } }
  return t / 9.0;
}
/*
  Under a standing layer (STAND_ASIDE), the pull acts on the layer as a
  whole: its share is the layer's mean over a seven-cell box round the cell
  (a dome's spacing, the box the advection takes the flow's mean over
  there: phase.ts, boxVel), counting a dome's cells past full at what they hold,
  and at most full. PLAN 9t-2.

  What was wrong. The pull stepped aside under the film's window, for the
  film to pull the layer in its own pressure (wgsl/standing.ts, kelvin),
  and the film's share of it was nought (standing.ts, PULL_SHARE): under
  the window nothing pulled the ferrofluid toward the magnet at all. While
  the onset was the lab's 22 mT only the hand's magnet ran the film, and it
  was held still over a pool. At the liquid's own onset, 4 mT (PLAN 38k),
  every look's own magnet runs it, and on the Mac a drop dragged by a
  magnet of 14 mT (ferrodrag) was left 7.4 radii behind once the film
  took it.

  Why here and not in the film's pressure. The pull is μ0 M ∇H, and H
  changes over the magnet's width, five to ten capillary lengths, where
  the domes stand one apart: over a dome it is a tilt, and a tilt moves the
  layer as a whole, which is the mean the flow carries under the window,
  not the domes' shape, which the film makes. Outside the window that
  motion is this force through the gap's own drag (Darcy, MAGNET_GAIN, 0.93
  of a real rod's pull: npm run magnetgain); the film's flux would move
  the same liquid by a second law, a 0.4 mm layer's lubrication flow, and
  at the film's held lift (G 2.8, wgsl/standing.ts LIFT) its pull is a
  ninth of the real one at that 14 mT, so a drop would change speed where
  it crossed into the window, at a line nobody can see. One law across the
  plate: the force that carries a drop to the window's edge carries it on
  under the window, and the film stands the domes up on what it brings.

  What it brings is a mound. Pulled inward faster than the layer's own
  weight spreads it, the pool piles under the magnet, past full, up to the
  top glass (phaseRelax's ceiling, FILM_TOP), as a real layer does under a
  magnet a few times past its onset (its pull there is 60 times the
  pressure of a capillary length of it, and the gap is four). The mean,
  not the cell's own share: on the cell's own the force would differ dome
  to dome and its curl, which the projection keeps, would stir the domes
  apart at their own scale.
*/
fn layerMean(p: vec2i, n: f32) -> f32 {
  var t = 0.0;
  for (var j = -3; j <= 3; j++) { for (var i = -3; i <= 3; i++) { t += max(textureLoad(phase, clampP(p + vec2i(i, j), n), 0).r, 0.0); } }
  return min(t / 49.0, 1.0);
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
  // The pull is the three-by-three mean's share, so the force fades over
  // the rim instead of stepping at the flux's edge; the factor's exponent
  // is the cell's own share, the one hsPrep's drag is raised to
  // (thinGap.ts, kdt), so the two cancel to the ferrofluid's own mobility
  // cell by cell. With the mean in the exponent they did not cancel where
  // the mean and the cell's own share differ: the rim's inner cells were
  // driven past the ferrofluid's own mobility and its outer ones short of
  // it. And no floor at 1: in water the ferrofluid is the thicker liquid
  // and the ratio is under 1, and the factor is still the mixed drag over
  // the ferrofluid's (1e-6 is the drag's own floor).
  // Under a standing layer, the layer's mean round the cell instead: see layerMean.
  var share = phs(p, n);
  let st = textureLoad(stand, p, 0).r;
  if (st > 0.0) { share = mix(share, layerMean(p, n), st); }
  var f = share * pow(max(A.b.z, 1e-6), 1.0 - ph(p, n)) * gpsi * A.b.x;
  let fl = length(f);
  if (fl > A.b.y) { f = f * (A.b.y / fl); }
  textureStore(dst, p, safeVel(vec4f(v.xy + f, v.z, v.w)));
}`,

  /*
    The ferrofluid keeps its momentum (29c, the dragged drop). A thin gap does
    not carry the velocity along itself (wgsl/thinGap.ts, "What the step no
    longer does"): for the oils the drag takes a push in a few steps, so where
    the liquid is by then is where the push was. The ferrofluid is thinner
    (FERRO_NU, 5 cSt against the default oil's 22) and its drag time in the
    rest gap is 0.6 s, 36 steps, while a drop dragged at the hand's speed,
    0.1 of the plate a second, crosses its own width in 30. So every cell the
    drop entered held the oil's velocity, part of the drop's, and the
    magnet's pull brought it up at 2.8% of the shortfall a step. Measured in
    the lab (ferrodrag's scene, 384²): the drop topped out at 0.09 of the
    plate a second under a pull whose Darcy speed was 0.19 and its lag grew
    without end, 2.78R at 3 s and 5.8R at 6 s, where under a weak magnet,
    slow enough to keep up with its own momentum, it went at 0.95 of Darcy's.
    Real ferrofluid carries its momentum: the term the gap's step drops is
    ρ(u·∇)u, and weighed against the drag it is Uτ/R, 2.5 for this drop
    against the oils' tenth.

    So the velocity is carried along itself here by the ferrofluid's share of
    the cell: the cell's momentum is φ of the ferrofluid's and 1 − φ of the
    oil's, and only the ferrofluid's part travels (one backtrace; the oil's
    part reads as it was). Before the step's forces, so hsPrep's snapshots
    still read each force apart, and before the projection, which takes the
    divergence the carry leaves out as the old plate's second projection did.
    Only with ferrofluid on the plate: every other look's step is as it was.
  */
  phaseMomentum: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var phase: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let share = clamp(textureLoad(phase, p, 0).r, 0.0, 1.0);
  if (share <= 0.001) { textureStore(dst, p, v); return; }
  // Where this cell's liquid was a step ago, and the ferrofluid's own velocity
  // there: its momentum φu over its share φ across the four cells round the
  // point. Momentum arrives with ferrofluid, so where the trace lands on next
  // to none the cell keeps the velocity it has, blended in by how far short
  // of a quarter of a cell the four hold: a cell's carried velocity then
  // changes by nothing as its trace crosses that line, where a switch at it
  // jumped between the mixture's velocity and the ferrofluid's. (The first
  // form read the mixture's velocity wherever the trace landed, and the
  // drop's shedding into its wake was the same either way, cells over 0.01
  // of ferrofluid 352 to 972 in 3 s: the wake was not the trace's reading
  // but the share's advection: what the flux step's limiter spreads of the
  // drop's trailing edge, phaseCompress below, and the carry's own velocity
  // since dropped, PLAN 29c-4.)
  let uv = uvOf(id);
  let pos = clamp(uv - v.xy * A.a.x, vec2f(1.0 / S.n), vec2f(1.0 - 1.0 / S.n));
  let f = pos * S.n - 0.5;
  let fl = floor(f);
  let t = f - fl;
  let hiN = vec2f(S.n - 1.0);
  let lo = vec2i(clamp(fl, vec2f(0.0), hiN));
  let hi = vec2i(clamp(fl + 1.0, vec2f(0.0), hiN));
  let w = vec4f((1.0 - t.x) * (1.0 - t.y), t.x * (1.0 - t.y), (1.0 - t.x) * t.y, t.x * t.y);
  let q = array<vec2i, 4>(vec2i(lo.x, lo.y), vec2i(hi.x, lo.y), vec2i(lo.x, hi.y), vec2i(hi.x, hi.y));
  var mom = vec2f(0.0);
  var sh = 0.0;
  for (var k = 0; k < 4; k++) {
    let s = clamp(textureLoad(phase, q[k], 0).r, 0.0, 1.0);
    let u = textureLoad(vel, q[k], 0).xy;
    mom += w[k] * s * u;
    sh += w[k] * s;
  }
  let back = (mom + max(0.25 - sh, 0.0) * v.xy) / max(sh, 0.25);
  textureStore(dst, p, safeVel(vec4f(mix(v.xy, back, share), v.z, v.w)));
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
@group(0) @binding(3) var stand: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
/*
  Under a standing layer (STAND_ASIDE) a cell past full is a dome, so the
  ceiling there is the top glass (standing.ts, FILM_TOP), where the film's
  window is full. Not the pair weight the other passes step aside by:
  with the relax set aside, nothing refilled the dips the flux step's
  limiter digs below empty round a dome, nor stopped the plate's flow
  piling the layer where it converges, and the plate went to NaN in 140
  steps under the Magnet. Each cell's excess is its own, and each pair's
  exchange still the same from both sides, so it conserves as before.
*/
/*
  Raised only where the film acts fully, not blended in over the window's
  edge: there the plate's own flows still run in part, and the magnet's
  pull piled the pool against the full window into a ring of black arcs
  past full, each cut sharp along a circle where the plate's flows stop
  (rendered under the hand's Magnet, the spikes check's pool). Capped at
  full there, the plate's flows pack the edge no deeper than they ever
  did, and the arcs go.
*/
fn top(p: vec2i) -> f32 { return select(1.0, ${FILM_TOP.toFixed(3)}, textureLoad(stand, p, 0).r > 0.99); }
// What a cell holds outside 0..its ceiling: above it (positive) or below
// empty (negative), and whether the neighbour exists at all.
fn bad(p: vec2i, n: i32) -> vec2f {
  if (p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) { return vec2f(0.0, 0.0); }
  let c = textureLoad(src, p, 0).r;
  return vec2f(max(c - top(p), 0.0) + min(c, 0.0), 1.0);
}
fn pair(a: f32, b: vec2f) -> f32 { return select(0.0, 0.24 * (a - b.x), b.y > 0.5); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let e = bad(p, n).x;
  let out = pair(e, bad(p + vec2i(1, 0), n)) + pair(e, bad(p - vec2i(1, 0), n))
          + pair(e, bad(p + vec2i(0, 1), n)) + pair(e, bad(p - vec2i(0, 1), n));
  let outVal = textureLoad(src, p, 0).r - out;
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,

  phaseSeparate: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var stand: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<r32float, write>;
${STAND_ASIDE}
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
${PHASE_MEAN3}fn exchange(p: vec2i, q: vec2i, sp: f32, n: i32) -> f32 {
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
  return aside(p, q, S.n) * (toFuller + 0.125 * clamp(A.a.y, 0.0, 1.0) * (b - a) + grid);
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
  let outVal = c + d;
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,

  /*
    The edge of a moving drop, kept as sharp as the grid holds it
    (PLAN 29c-1: a named shortcut, standing in for an interface the grid
    cannot draw).

    Ferrofluid and the clear liquid do not mix: a real drop's edge is a
    molecule thick wherever the flow takes it, and the drop is carried as
    a body. On the grid the edge is three cells of grey, and the flux step
    that carries it (phaseAdvect: MUSCL with a minmod slope, the most
    diffusive of the limiters, which falls back to upwind at every
    extremum, and a drop a few cells across is all extremum) spreads it by
    about half a cell times the cells it moves: a numerical diffusion of
    ½|u|Δx. Cahn–Hilliard's own pull back toward 0 and 1 is M·W|f''|, a
    fifth of that at Phase Edge 0.75, so a drop dragged 0.3 of the plate
    in three seconds (\`npm run ferrodrag\`) came out a grey smear with no
    cell past half full, and even steepening the double well 2.9 times
    did not hold it (lab: 100 cells past half → 0, either way).

    So what the flux step spreads is given back where it spread it, face
    by face: the part of its own second-order flux the limiter withheld.
    MUSCL carries a face at its upwind cell plus ½(1 − |c|) of a limited
    slope, c the face's Courant number this substep; Lax–Wendroff's face is
    the same with the face's own slope Δ_f unlimited, and the two differ by
    the flux ½|c|(1 − |c|)·(1 − ψ)·Δ_f, with 1 − ψ = 1 − minmod(Δ_up,
    Δ_f)/Δ_f the share of the face's slope the limiter withheld (withheld,
    below: the same minmod of the same two slopes phaseAdvect's upwind()
    limits, Δ_up the slope behind the face on the side the flow comes
    from). That flux is the anti-diffusion the limiter dropped to stay
    monotone, and dropping it is what spreads the edge: given back, the
    step is second-order where the limiter cut it to first, and the
    spreading is gone. The step runs the carry in m substeps of c/m each
    (phasePlan's \`psub\`, read here; never fewer than PHASE_SUBSTEPS on a
    thin gap), so the step's deficit is m·½(c/m)(1 − c/m) = ½c(1 − c/m) of
    each face's withheld slope, read once after them on the field they
    left, not after each (the profile moves a fraction of a cell a
    substep, and one blur and compression a step is what the Mac's frame
    affords: below). It is exactly nothing on a pool at rest (c = 0: a
    look's resting ferrofluid is as it was, to the bit), nothing where the
    profile is smooth (Δ_up ≈ Δ_f, nothing withheld: the paraboloid pool
    pressed under the glass in \`npm run ferropress\` comes back to the
    one never pressed, worst ring 0.002 against the 0.03 bar), and no
    more than the step withheld (C_α = 1). Each face's exchange is one
    number read alike from both sides, moved toward the fuller side of the
    edge, and at most a quarter of min(lo, 1 − hi), the emptier cell's
    share and the fuller one's room, so it keeps the plate's total and
    every cell inside 0..1, as phaseSeparate's sharpening did; the bound is
    what stops the return at a sharp step's foot, where the unlimited flux
    would draw on a cell that is empty. Unlike that sharpening (which set
    a plate of drops at rest into blocky squares, and was replaced by
    Cahn–Hilliard for it: docs/physics-plan.md) it moves nothing the flow
    did not spread this step.

    Why this and not the two forms before it. The first compressed every
    moving face alike (Weller's interface compression, as volume-of-fluid
    solvers carry an immiscible edge: a flux c(1−c) along the edge's normal
    at the flow's own speed), as if the step spread ½|u|Δx everywhere, and
    so sharpened a pool the step had not spread: minmod withholds nothing
    on a smooth profile, so the pressed pool came back fuller than the one
    never pressed, its worst ring 0.049 against the 0.03 bar (main's
    0.012; 0.008 with the compression off), and run on the deep plate too
    it broke three looks on the Mac (spikes 2 of 6, maze 3 of 4, fingers
    3 of 4). The second scaled that flux by the share withheld: the pool
    came back (worst ring 0.003), but the dragged drop still dissolved,
    its half-full area 100 → 32 cells against a resting drop's 84 over
    the same steps (PLAN 29c-7), and no carry of the share fixed it,
    neither the mixture's velocity nor the drop's own fitted over its
    body (tried and dropped: docs/plan-shipped.md §29c). The cause is
    where the limiter withholds. On the edge a drop pushes ahead the slope
    behind each face is the steeper, so minmod keeps the face's own slope
    down the whole toe and withholds only at the shoulder (a quarter of
    it, and all of the top face against a cell already full, where the
    bound gives nothing): that edge is carried at second order. On the
    edge it drags behind the slope behind each face is the gentler, so
    every face of the tail is withheld by half or more and smeared at
    first order, step after step: the tail is the wake, and it is the
    limiter's. The second form returned it in proportion to the smaller
    share at the face, min(lo, 1 − hi), where the limiter's deficit is in
    proportion to the face's own difference |Δ_f|, which on a tail that
    falls by two thirds a cell is more than twice the smaller share; and
    its ¼|c| for the step's ½|c|(1 − |c|) read the deficit short again at
    a slow face, by near half. So it gave back a quarter to a half of what
    the limiter took, and the drop lost the rest. This form gives back what
    the limiter took, with the flux step's own numbers in it (\`npm run
    ferropress\` 7/7, worst ring 0.002). Two other losses remained on
    \`ferrodrag\`'s scene: Cahn–Hilliard's bulk diffusion through the oil
    (fixed in phaseCHVolume below by degenerate mobility, \`npm run
    ferrorest\`: 100 → 90 half-full cells at rest against 84 with constant
    mobility, cells over 0.01 +94 against +248, and on the dragged drop
    324 → 1238 against 352 → 1602), and the trailing rim carried at the
    cell's mixture velocity in the oil's return flow (PLAN 29c-8;
    \`ferrodrag\` 1/3, lag 3.24R, half-full 100 → 0).

    The direction and the normal are the edge's, read from the field
    blurred by [1 2 1]² once a step (phaseBlur, the \`blur\` texture), not
    the face's own: a checkerboard is withheld at every face (minmod of
    two slopes of opposite sign is 0), and the deficit returned by each
    face's own sign would grow it, where the blurred field reads a
    checkerboard as flat, so the return is nothing there (the normal, and
    so the exchange, is 0 across a flat blur) and a cell-scale wiggle on a
    slope is moved toward the slope's fuller side, which smooths it. Read
    from the texture, not blurred face by face: each face needs the blur
    at six cells, and blurring them in place read 54 cells a face, 216 a
    cell, which on the Mac cost every ferrofluid look a fifth of its step
    (#373's review: 29.2 → 35.7 ms a step at 768²). The four faces' six
    cells each are the nine cells round p, so the step reads the blur once
    (9 cells) and the compression 9 more, with the phase, velocity, gap
    and layer at p and its four neighbours. The face's Courant number is
    read from the mean of its two cells' velocity (phaseAdvect filters its
    own along the face and corrects it by the pressure, Rhie–Chow: a few
    per cent apart) and clamped at 0.45 a substep as the flux step's is.

    Under Thin Gap the field is a share of the gap (phaseAdvect), so what
    crosses a face is a volume, the exchange times the thinner gap, and
    each cell divides by its own (as phaseGrid). Stepped aside under a
    standing layer (STAND_ASIDE), whose film shapes the layer there.

    A.a = (C_α, the flow's displacement per unit velocity this step,
    volume form on, the substeps the step ran when not in volume form: in
    volume form their count is the plan's, psub[1]).
  */
  phaseCompress: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var blur: texture_2d<f32>;
@group(0) @binding(4) var vel: texture_2d<f32>;
@group(0) @binding(5) var sq: texture_2d<f32>;
@group(0) @binding(6) var stand: texture_2d<f32>;
@group(0) @binding(7) var dst: texture_storage_2d<r32float, write>;
// The phase's substeps this step (phasePlan): 1/m and m.
@group(0) @binding(8) var<storage, read> psub: array<f32>;
${STAND_ASIDE}
fn raw(p: vec2i) -> f32 { return textureLoad(src, p, 0).r; }
// The [1 2 1]²-blurred field (phaseBlur), read at the grid's edge as its edge cell.
fn sm(p: vec2i, n: i32) -> f32 { return textureLoad(blur, clamp(p, vec2i(0), vec2i(n - 1)), 0).r; }
fn gapOf(q: vec2i) -> f32 { return select(1.0, max(textureLoad(sq, q, 0).r, 0.004), A.a.z > 0.5); }
// The field along a face's axis, read at the grid's edge as its edge cell (as phaseAdvect's ph).
fn rawc(p: vec2i, n: i32) -> f32 { return textureLoad(src, clamp(p, vec2i(0), vec2i(n - 1)), 0).r; }
fn minmod(a: f32, b: f32) -> f32 { return select(0.0, select(max(a, b), min(a, b), a > 0.0), a * b > 0.0); }
// The share of the face's slope the flux step's limiter withheld, 1 − ψ: how much
// of the face's own slope phaseAdvect carried as plain upwind, and so spread. The
// same minmod of the same two slopes, the face's and the one behind it on the
// side the flow comes from, so a smooth pool (r ≈ 1, nothing withheld) is not
// sharpened and a drop's trailing edge (the slope behind each face the gentler,
// half or more withheld) is.
fn withheld(p: vec2i, q: vec2i, e: vec2i, u: vec2f, n: i32) -> f32 {
  let df = rawc(q, n) - rawc(p, n);
  if (abs(df) < 1e-6) { return 0.0; }
  let up = select(rawc(q + e, n) - rawc(q, n), rawc(p, n) - rawc(p - e, n), dot(u, vec2f(e)) >= 0.0);
  return 1.0 - minmod(up, df) / df;
}
// What flows into p from its neighbour q = p + e this step.
fn compress(p: vec2i, e: vec2i, n: i32) -> f32 {
  let q = p + e;
  let a = raw(p);
  let b = raw(q);
  // The edge's normal, from the blurred field, across the face and along it.
  let t = vec2i(e.y, e.x);
  let sp = sm(p, n);
  let sq2 = sm(q, n);
  let across = sq2 - sp;
  let along = 0.25 * ((sm(p + t, n) - sm(p - t, n)) + (sm(q + t, n) - sm(q - t, n)));
  let normal = abs(across) / sqrt(across * across + along * along + 1e-8);
  // The face's Courant number a substep, as the flux step reads it (clamped at
  // 0.45 there too), over the m substeps the step's carry ran.
  let u = 0.5 * (textureLoad(vel, p, 0).xy + textureLoad(vel, q, 0).xy);
  let m = select(max(A.a.w, 1.0), max(psub[1], 1.0), A.a.z > 0.5);
  let cs = min(abs(dot(u, vec2f(e))) * A.a.y * f32(n) / m, 0.45);
  // What the limiter withheld of the face's second-order flux over the step:
  // m times ½c(1 − c) of the face's own difference, by the share withheld (above).
  let deficit = m * 0.5 * cs * (1.0 - cs) * withheld(p, q, e, u, n) * abs(b - a);
  let lo = min(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0));
  let hi = max(clamp(a, 0.0, 1.0), clamp(b, 0.0, 1.0));
  let amount = min(A.a.x * deficit * normal, 0.25 * min(lo, 1.0 - hi));
  let toFuller = select(-amount, amount, sp > sq2);
  return aside(p, q, S.n) * toFuller * min(gapOf(p), gapOf(q));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  var d = 0.0;
  if (p.x > 0) { d += compress(p, vec2i(-1, 0), n); }
  if (p.x < n - 1) { d += compress(p, vec2i(1, 0), n); }
  if (p.y > 0) { d += compress(p, vec2i(0, -1), n); }
  if (p.y < n - 1) { d += compress(p, vec2i(0, 1), n); }
  let outVal = raw(p) + d / gapOf(p);
  textureStore(dst, p, select(vec4f(0.0), vec4f(outVal, 0.0, 0.0, 0.0), finite1(outVal)));
}`,

  // The ferrofluid blurred by [1 2 1]² (PHASE_MEAN3), once a step, for
  // phaseCompress to read its edge's normal from (and why: above).
  phaseBlur: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<r32float, write>;
fn raw(p: vec2i) -> f32 { return textureLoad(src, p, 0).r; }
${PHASE_MEAN3}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  textureStore(dst, p, vec4f(mean3(p, i32(S.n)), 0.0, 0.0, 0.0));
}`,
};
