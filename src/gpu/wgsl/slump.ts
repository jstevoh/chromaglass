/**
 * A drop of ink slumps under its own weight (PLAN 18m).
 *
 * What was reported: dye did not spread through clear water. Measured on a
 * still plate (the audit, 2026-10-11): with Diffusion Rate at 0, as twelve
 * looks have it, a drop sat where it landed for twenty seconds (rms radius
 * 4.69 mm to 4.70); at 0.0002 it went to a soft Gaussian blur at an
 * effective D of 1.7e-5 m²/s, forty thousand times food dye's 4e-10. Neither
 * is what ink in a dish does, and the second is not even the right kind of
 * wrong: molecular diffusion would move the drop less than a hundredth of a
 * millimetre in those twenty seconds. What spreads a drop of food colouring is
 * its weight. The colour comes in glycerine or propylene glycol, a percent or
 * two denser than the water, so the drop sinks to the lower glass and runs out
 * along it under the clear water as a viscous gravity current: a flat pool
 * with a sharp, slightly lobed front, which keeps spreading ever more slowly
 * as it thins (r ∝ t^(1/8), Huppert 1982, J. Fluid Mech. 121).
 *
 * The model. The dyed liquid is a layer of depth η on the lower glass, under
 * clear liquid that fills the rest of the gap b. With the drag across a gap a
 * few millimetres deep there is no inertia to speak of (the layer's Reynolds
 * number is under one once it is a few seconds old), so each layer's flow is
 * a Poiseuille profile: no slip on both glasses, the velocity and the shear
 * continuous at the interface, the hydrostatic pressure of the dense layer's
 * slope (Δρ g ∇η) driving it, and no net flux through the gap (the solver's
 * depth-mean flow is the liquid as a whole; this is the exchange inside it,
 * dense out along the bottom, clear back over the top). Solved for the dense
 * layer's flux (scratchpad derivation in the PR; the textbook form is Zheng,
 * Rongy and Stone 2015, Phys. Fluids 27, for equal viscosities):
 *
 *     q = −(g′ / 3ν) η³ (1 − η/b)³ ∇η,        g′ = g Δρ/ρ
 *
 * In a layer thin against the gap the bracket is 1 and this is exactly
 * Huppert's current; as the layer fills the gap it chokes, since the clear
 * liquid has nowhere left to come back through, and a gap full of dye does not
 * move at all. The plate stores the dye as an amount per cell, not a depth,
 * so the depth is the amount times DYE_LAYER (src/gpu/fluid.ts has where
 * that number comes from), and the amount, carried with the layer at the
 * composition it has, obeys
 *
 *     ∂A/∂t = ∇·(K ∇A),        K = (g′ / 3ν) η³ (1 − η/b)³
 *
 * a nonlinear diffusion whose rate goes to zero with the layer. That is the
 * whole difference from a blur. A blur's rate is the same everywhere, so it
 * spreads a drop into a Gaussian with no edge; this one is zero where there
 * is no dye, so the pool has a front, and the front stays sharp because the
 * thin rim moves slowest (the profile at the front goes as (1 − r²/r_N²)^⅓).
 *
 * Δρ is the dye's own: the look's Dye Weight says what the liquid is
 * (dyeDensityContrast, lib/turntable.ts: food colouring in water at 0, two
 * percent), and it is scaled by how concentrated the colour in the cell is,
 * its strongest band's absorbance per unit over a full-strength dye's
 * (−ln DYE_FLOOR, the most a dye absorbs at one unit). A pale tint is a dilute
 * dye and nearly as light as the water; clear liquid poured (white, which is
 * not a dye: lib/dye.ts) weighs nothing over the water and does not slump.
 * Where oil fills the cell there is no water for the current to run in, so it
 * runs in the water's share. Flat on the projector gravity is all through the
 * glass; stood up by θ (Gravity) only cos θ of it is, and the in-plane part is
 * hsBody's.
 *
 * The step: backward Euler (PLAN 18m-1a). K is worked out from the plate as
 * it is (lagged K) and the amount moved implicitly, (I − Δt∇·K∇)A = Aⁿ,
 * face by face in flux form: what leaves one cell is exactly what enters the
 * next, so no dye is made or lost. The colour goes with the liquid at the
 * composition of the cell it leaves (upwind), so two colours meeting do not
 * blur into each other faster than their layers run. The face's K is the mean
 * of its two cells' (the arithmetic mean, not the harmonic one a flux in
 * series wants: a front cell has K = 0, and the harmonic mean would hold the
 * front still forever).
 *
 * Until 18m-1a the amount was moved explicitly, in substeps, and an explicit
 * step on a 5-point stencil is stable only while each face moves at most a
 * quarter of the difference across it (K Δt/Δx² ≤ ¼). A cell's K Δt/Δx² goes
 * as the layer's depth cubed over the cell's width squared, so a deep heavy
 * pool on a fine plate asked for more substeps than the twenty it was given,
 * and a per-face guard (min(a, 0.24)) held it stable by slowing it. The
 * implicit step is stable at any K: the system is diagonally dominant with
 * positive off-diagonals, so its solution is a weighted mean of its
 * neighbours and the cell's own amount, never below zero or over the most
 * there was. It is solved by red-black Gauss-Seidel sweeps from Aⁿ (slumpSmooth),
 * and then the fluxes are taken from what the sweeps reached (slumpApply), so
 * a solve left short of converging still moves the dye in pairs, as much into
 * one cell as out of the next (slumpApply's clamp at zero, which would make
 * dye, does not bite: slumpSmooth says why); what it leaves is a residual, which slumpPlan keeps under 1e-4 of the amount
 * (sweeps from the largest face rate; in the CPU model of these kernels at
 * 1024² with Dye Weight 1, eight sweeps leave 1.2e-4 of the pool's L2, and
 * the 768² and 1024² pools agree to 0.3% in their front at 2 s). Not the
 * thin gap's multigrid: the solve's reach is a few cells a step (the most
 * K Δt/Δx² there is, about nine a substep at 1024²; the change from Aⁿ sits at
 * the pool's edge, a few cells wide), which is the short wavelengths sweeps
 * take out at once; a multigrid's coarse levels are for the long ones, which
 * this solve never has to move. Measured against a two-cycle V-cycle on the
 * same CPU model: the same front to 0.01 mm at 512².
 *
 * The inertial current (PLAN 18m-1, 18m-1a). A pool poured to the dye's cap of
 * six units (2.13 mm deep, the whole of the 2 mm gap: PLAN 38r) is past where
 * the viscous Poiseuille law holds (its Reynolds number in water is near 30):
 * in that slumping regime a gravity current runs at its Froude speed
 * u_f = Fr √(g′η(1 − η/b)) with Fr = 1.19 (Huppert and Simpson 1980, J. Fluid
 * Mech. 99), and no faster. That is a cap on the layer's velocity, |q|/η ≤
 * u_f, so on the amount's flux, |K∇A| ≤ u_f A: a face carries at most
 * (u_f Δt/Δx) of the amount on its upstream side a step, whatever the
 * gradient. Written that way it has no Δx in it but the one every flux has.
 * #371 wrote it as a diffusive rate instead, K_inert = u_f Δx (the front taken
 * to drop across one cell), which gives the right flux only where the front is
 * one cell wide; inside a pool whose depth falls over many cells the current
 * was slowed by Δx over that length, so on a finer plate it ran slower: in the
 * CPU model the 2 s pool's middle stood at 1.07 units on 256², 1.32 on 512²,
 * 1.65 on 768² and 1.96 on 1024², where with the flux cap it is 1.048 on all
 * four. A face's rates are its cells' or the layer's at the face's own depth,
 * whichever is faster (face, below): a column from glass to glass has none
 * of its own, and is a lock exchange at its edge.
 *
 * And the substeps. With lagged K a choked column drains a cell a substep
 * from its edge in (its inner faces have no rate until the cell beside them
 * has thinned), so slumpPlan takes as many substeps as keep the fastest
 * front under a cell each (SLUMP_COURANT), up to SLUMP_SUBSTEPS: three at
 * 1024² with Dye Weight 1 at 60 Hz, one at 256². That is a signal speed of
 * the Froude speed itself, near the real one (a lock exchange's
 * rarefaction runs back into the column at about ½√(g′b), 0.027 m/s here,
 * against the plan's u_f of 0.032), and the same on every plate.
 */
import { OPEN_RIM } from '../../lib/turntable';

export function slumpKernels(HEAD: string, W: string): Record<string, string> {
  /*
    A cell's rates, one substep's: x is K Δt/Δx² (its viscous rate), y its
    front's Courant number u_f Δt/Δx, z its amount. A.a.x is g′Δt/(3νΔx²) in
    1/m³, A.a.y DYE_LAYER (metres per unit), A.a.z the metres in a unit of the
    gap field (GAP_METRES: the field is in gap units, 0.03 at rest), A.a.w
    1/(−ln DYE_FLOOR), A.b.x Fr (Δt/Δx) √g′. The mix's oil share is read where
    the look has a mix (a 1×1 blank, all water, where it has not). A cell past
    the open rim is w = 0: no face to it moves anything.
  */
  const RATES = `
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var mixT: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> faces: array<f32>;
@group(0) @binding(6) var<storage, read_write> x: array<f32>;
fn inside(q: vec2i) -> bool {
  let n = i32(S.n);
  return q.x >= 0 && q.y >= 0 && q.x < n && q.y < n
    && length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) < ${OPEN_RIM.toFixed(2)};
}
struct Cell { k: f32, c: f32, a: f32, eta: f32, gap: f32, sw: f32 }
// The viscous rate and the front's Courant number of a layer η deep in a gap b, its weight's share sw.
fn kOf(sw: f32, eta: f32, gap: f32) -> f32 {
  let open = 1.0 - min(eta / gap, 1.0);
  let k = A.a.x * sw * eta * eta * eta * open * open * open;
  return select(0.0, k, k >= 0.0 && k < 1e30);
}
fn cOf(sw: f32, eta: f32, gap: f32) -> f32 {
  let open = 1.0 - min(eta / gap, 1.0);
  let c = A.b.x * sqrt(max(0.0, sw * eta * open));
  return select(0.0, c, c >= 0.0 && c < 1e30);
}
fn rates(q: vec2i) -> Cell {
  let d = max(textureLoad(dye, q, 0), vec4f(0.0));
  let eta = d.a * A.a.y;
  let gap = max(textureLoad(sq, q, 0).r, 0.004) * A.a.z;
  let strength = clamp(max(max(d.r, d.g), d.b) / max(d.a, 1e-6) * A.a.w, 0.0, 1.0);
  let md = vec2i(textureDimensions(mixT));
  let mq = clamp(vec2i((vec2f(q) + 0.5) / S.n * vec2f(md)), vec2i(0), md - 1);
  let water = 1.0 - clamp(textureLoad(mixT, mq, 0).r, 0.0, 1.0);
  let sw = strength * water;
  return Cell(kOf(sw, eta, gap), cOf(sw, eta, gap), d.a, eta, gap, sw);
}
/*
  The face between p and q. Its viscous rate is the larger of its two cells'
  mean and the rate of the layer at the face's own depth (the mean of the
  two depths, in the mean of the two gaps, at the weightier side's share),
  and its front's speed the largest of the two cells' and the face's own;
  the rate is then held to the Froude flux, u_f Δt/Δx of the amount on the
  upstream side. The face's own depth is for an edge where both cells have
  no rate: a cell at the cap fills the gap (1 − η/b = 0) and the clear
  cell beside it has no dye, so a pour at the cap with a sharp edge never
  started (the CPU model of these kernels: a hard disc at six units stood at
  6.000 in its middle after 2 s, with the face's depth 1.336, its front out
  6.04 → 15.52 mm). That edge is a lock exchange, and the face at half the
  gap is the current's own head (Benjamin 1968). Where the layer is smooth
  the face's own depth is its cells' and changes nothing: the drop of
  \`npm run slump\` 2 to 6 is the same to the last digit printed in the model.
*/
fn face(rp: Cell, q: vec2i) -> f32 {
  if (!inside(q)) { return 0.0; }
  let rq = rates(q);
  let eta = 0.5 * (rp.eta + rq.eta);
  let gap = 0.5 * (rp.gap + rq.gap);
  let sw = max(rp.sw, rq.sw);
  let visc = max(0.5 * (rp.k + rq.k), kOf(sw, eta, gap));
  let jump = abs(rq.a - rp.a);
  let froude = max(max(rp.c, rq.c), cOf(sw, eta, gap)) * max(rp.a, rq.a);
  return select(visc, min(visc, froude / jump), jump > 1e-6);
}`;
  return {
    /*
      Each cell's east and north faces' rates, K Δt/Δx² held to the Froude
      flux, into \`faces\` (east at i, north at N² + i), and the solve's first
      guess, the amount as it is, into \`x\`.
    */
    slumpFaces: `${HEAD}${RATES}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let i = p.x + p.y * n;
  let a = max(textureLoad(dye, p, 0).a, 0.0);
  x[i] = a;
  if (!inside(p)) {
    faces[i] = 0.0;
    faces[n * n + i] = 0.0;
    return;
  }
  let rp = rates(p);
  faces[i] = face(rp, p + vec2i(1, 0));
  faces[n * n + i] = face(rp, p + vec2i(0, 1));
}`,
    /*
      One colour of a red-black Gauss-Seidel sweep of (1 + Σa) x_p − Σ a x_q
      = Aⁿ_p. A.a.x is the parity; the dispatch is half the grid wide. A cell
      with no faces (past the rim) keeps its amount.

      A.a.y is 1 on the substep's last half-sweep, which keeps the mean of
      the cell's value before and after it. A red-black sweep stopped short
      leaves its whole residual on the colour it did first (the second's
      residual is zero once it has run), all of one sign where the solve is
      still catching up, and the fluxes taken from it hand that residual to
      the plate: a checkerboard. In the CPU model of these kernels the deep
      pool of \`npm run slump\` 12 read 1.4% of its dye on the plate's finest
      alternating pattern after six frames at 256² with three sweeps (the
      check's bar is 0.1%); the last half-sweep's mean is the mean of the two
      half-states, whose residuals sit on opposite colours, and it reads
      0.065%, and 0.029% at the six sweeps the plan gives there.
    */
    slumpSmooth: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> faces: array<f32>;
@group(0) @binding(4) var<storage, read_write> x: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let y = i32(id.y);
  let px = 2 * i32(id.x) + ((y + i32(A.a.x)) & 1);
  if (px >= n || y >= n) { return; }
  let i = px + y * n;
  let nn = n * n;
  var d = 1.0;
  var s = 0.0;
  if (px + 1 < n) { let f = faces[i]; d += f; s += f * x[i + 1]; }
  if (px > 0) { let f = faces[i - 1]; d += f; s += f * x[i - 1]; }
  if (y + 1 < n) { let f = faces[nn + i]; d += f; s += f * x[i + n]; }
  if (y > 0) { let f = faces[nn + i - n]; d += f; s += f * x[i - n]; }
  let v = (max(textureLoad(dye, vec2i(px, y), 0).a, 0.0) + s) / d;
  if (!(v >= 0.0 && v < 1e30)) { return; }
  /*
    The mean, held so the cell keeps no less than nothing: after the fluxes
    its amount is v − t Σa (x_old − v) for a weight t of the old value, so
    where it drains (x_old > v) t is at most v / (Σa (x_old − v)). Without
    the hold the step's clamp at zero would make dye where a fast-draining
    cell with many fast faces met the mean.
  */
  var t = select(0.0, 0.5, A.a.y > 0.5);
  let old = x[i];
  if (old > v && d > 1.0) { t = min(t, v / ((d - 1.0) * (old - v))); }
  x[i] = v + t * (old - v);
}`,
    /*
      The step taken: each face moves a (x_q − x_p) of the amount, x being
      what the sweeps reached, carrying the colour of the cell it leaves
      (upwind, from the plate as it was). Flux form, so the dye is kept
      whether the sweeps converged or not.
    */
    slumpApply: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(4) var<storage, read_write> faces: array<f32>;
@group(0) @binding(5) var<storage, read_write> x: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let i = p.x + p.y * n;
  let nn = n * n;
  let c = textureLoad(dye, p, 0);
  var out = c;
  for (var f = 0; f < 4; f++) {
    var q = p;
    var a = 0.0;
    if (f == 0) { if (p.x + 1 >= n) { continue; } q = p + vec2i(1, 0); a = faces[i]; }
    if (f == 1) { if (p.x == 0) { continue; } q = p - vec2i(1, 0); a = faces[i - 1]; }
    if (f == 2) { if (p.y + 1 >= n) { continue; } q = p + vec2i(0, 1); a = faces[nn + i]; }
    if (f == 3) { if (p.y == 0) { continue; } q = p - vec2i(0, 1); a = faces[nn + i - n]; }
    if (a <= 0.0) { continue; }
    let j = q.x + q.y * n;
    let flux = a * (x[j] - x[i]);
    let cq = textureLoad(dye, q, 0);
    let up = select(c, cq, flux > 0.0);
    if (up.a > 1e-6) { out += flux * up / up.a; }
  }
  textureStore(dst, p, select(c, max(out, vec4f(0.0)), finite4(out)));
}`,
  };
}
