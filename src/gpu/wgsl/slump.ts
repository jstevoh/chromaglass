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
 * The step. K is worked out once a step (slumpRate) and the amount moved
 * explicitly in a few substeps (slump), face by face, in flux form: what
 * leaves one cell is exactly what enters the next, so no dye is made or lost.
 * The colour goes with the liquid at the composition of the cell it leaves
 * (upwind), so two colours meeting do not blur into each other faster than
 * their layers run. The face's K is the mean of its two cells' (the
 * arithmetic mean, not the harmonic one a flux in series wants: a front cell
 * has K = 0, and the harmonic mean would hold the front still forever).
 *
 * The shortcuts (PLAN 18m-1, 18m-1a). A pool poured to the dye's cap of six
 * units (2.13 mm deep, the whole of the 2 mm gap: PLAN 38r) is past where the viscous Poiseuille law
 * holds (its Reynolds number in water is near 30): in that slumping regime a
 * gravity current's front runs at its Froude speed Fr √(g′η(1 − η/b)) with
 * Fr = 1.19 (Huppert and Simpson 1980, J. Fluid Mech. 99). Each cell in
 * slumpRate takes the slower of its viscous rate and its inertial Froude rate
 * (written as K_inert Δt/Δx² = Fr (Δt/Δx) √(g′η(1 − η/b)), which assumes the
 * front drops across one cell Δx). The step is still explicit forward Euler on
 * a 5-point stencil, stable only while each face moves at most a quarter of
 * the difference across it (K Δt/Δx² ≤ ¼). slumpPlan plans up to
 * SLUMP_SUBSTEPS = 20 substeps against SLUMP_FACE = 0.24 at DYE_CAP (enough
 * for 1024² at Dye Weight 1 and 60 Hz, where the inertial bound reaches 4.57
 * a frame; 15 substeps at 768²; 6 at 768² with Dye Weight 0; 2 on the default
 * light-oil Thickness), and each face in slump keeps min(mean K, SLUMP_FACE)
 * as a stability guard that binds only if a longer frame dt or a locally
 * deeper gap pushes ceil(most / SLUMP_FACE) past SLUMP_SUBSTEPS. The lagged-K
 * backward-Euler multigrid step and Δx-independent inertial front flux are in
 * PLAN 18m-1a.
 */
import { OPEN_RIM } from '../../lib/turntable';

export function slumpKernels(HEAD: string, W: string): Record<string, string> {
  return {
    /*
      K Δt/Δx² for each cell, one substep's: A.a.x is g′Δt/(3νΔx²) in 1/m³,
      A.a.y DYE_LAYER (metres per unit), A.a.z the metres in a unit of the
      gap field (GAP_METRES: the field is in gap units, 0.03 at rest), A.a.w 1/(−ln DYE_FLOOR). The mix's
      oil share is read where the look has a mix (a 1×1 blank, all water,
      where it has not).
    */
    slumpRate: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var mixT: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  if (length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) {
    textureStore(dst, p, vec4f(0.0));
    return;
  }
  let d = max(textureLoad(dye, p, 0), vec4f(0.0));
  let eta = d.a * A.a.y;
  let gap = max(textureLoad(sq, p, 0).r, 0.004) * A.a.z;
  let open = 1.0 - min(eta / gap, 1.0);
  let strength = clamp(max(max(d.r, d.g), d.b) / max(d.a, 1e-6) * A.a.w, 0.0, 1.0);
  let md = vec2i(textureDimensions(mixT));
  let mq = clamp(vec2i((vec2f(p) + 0.5) / S.n * vec2f(md)), vec2i(0), md - 1);
  let water = 1.0 - clamp(textureLoad(mixT, mq, 0).r, 0.0, 1.0);
  let sw = strength * water;
  var k = A.a.x * sw * eta * eta * eta * open * open * open;
  let kInert = A.b.x * sqrt(max(0.0, sw * eta * open));
  k = min(k, kInert);
  if (!(k >= 0.0 && k < 1e30)) { k = 0.0; }
  textureStore(dst, p, vec4f(k, 0.0, 0.0, 0.0));
}`,
    /*
      One substep: each face moves the amount's difference across it at the
      mean of its two cells' rates (lagged K), held to A.a.x (SLUMP_FACE) as a
      stability guard if the substep ceiling is ever reached, carrying the
      colour of the cell it leaves. At the plate's edge the neighbour is the
      cell itself, so nothing crosses.
    */
    slump: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var rate: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let c = textureLoad(dye, p, 0);
  if (length(uvOf(id) - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) {
    textureStore(dst, p, c);
    return;
  }
  let k = textureLoad(rate, p, 0).r;
  var out = c;
  for (var f = 0; f < 4; f++) {
    let o = select(select(vec2i(0, -1), vec2i(0, 1), f == 2), select(vec2i(-1, 0), vec2i(1, 0), f == 0), f < 2);
    let q = clampP(p + o, S.n);
    if (length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) { continue; }
    let cq = textureLoad(dye, q, 0);
    let a = min(0.5 * (k + textureLoad(rate, q, 0).r), A.a.x);
    let flux = a * (cq.a - c.a);
    let up = select(c, cq, flux > 0.0);
    if (up.a > 1e-6) { out += flux * up / up.a; }
  }
  textureStore(dst, p, select(c, max(out, vec4f(0.0)), finite4(out)));
}`,
  };
}
