/**
 * The sealed bottle: the weight of what is in a standing plate, laid as the
 * flow a closed cell lets it make (PLAN 27f-9).
 *
 * What was reported (the preset retune, 2026-11-11): Lava Lamp, filmed on
 * the Mac, showed a flat tan lamp. The wax poured in and ran out over the
 * edge of the plate. Measured in the lab (128², thin gap, Plate Upright 1,
 * Dye Weight 0.7, a row of wax drops): the plate kept 75% of its dye after
 * four seconds and was still losing it, where the same plate lying flat kept
 * 99.97%.
 *
 * Why. Since PLAN 18a the plate is a Hele-Shaw cell whose rim is open: past
 * the inscribed circle the liquid is at the air's pressure, p = 0, so what a
 * press squeezes out leaves and comes back when the glass lifts, as between
 * two real glasses lying on a projector (wgsl/thinGap.ts, "And the rim is
 * open"). The dye's weight (Dye Weight, the lamp's heat lift, the oil's
 * lightness: mixForce) was laid as a body force F = G·w(x) into that solve,
 * u = M(F − ∇p). With p = 0 all round the rim, nothing holds a column of
 * heavy wax up: it falls through the bottom of the dish, clear liquid comes
 * in at the top, and what the heat lifts goes out at the top. That is two
 * glasses stood on edge with nothing round them, which would not hold a
 * standing liquid at all; the Boussinesq split the force already makes (the
 * mean's weight held "by the dish's own bottom") assumed a bottom the solve
 * did not have.
 *
 * A lava lamp is a sealed bottle. Its wall carries no flux, u·n = 0, so a
 * weight that is the same everywhere moves nothing (it is a pressure), and
 * a weight that varies moves the liquid round in closed loops: the wax down,
 * the clear liquid up past it, and nothing through the glass. Between two
 * glasses at an even gap that flow is exactly the closed dish's Darcy
 * circulation, u = ∇⊥ψ with −∇²ψ = curl F inside the wall and ψ = 0 on it,
 * which is what the oil's lift up a rocked plate already lays (PLAN 27f-5,
 * hsLiftSource and hsLiftRelax, whose relaxation this reuses unchanged on
 * buffers of its own). For F = G·w, curl F = G_y ∂w/∂x − G_x ∂w/∂y, so ψ =
 * G_y Ψ_x − G_x Ψ_y with −∇²Ψ_a = ∂w/∂a: the same two Ψ, one weight.
 *
 * The Buoyancy dial's heat lift went the same way out: on a thin gap the
 * lasting current is laid into the gap's solve as a speed the liquid is
 * driven to (fluid.ts, "And the lasting current with them"), and its
 * S.up·curBuoy·T is a weight too. With the seal on, writeSim takes it out of
 * the current and sealSource lays it here, capped as the current capped it.
 * Measured in the lab with the lamp on (128², 20 s, wax pooled at the
 * bottom): the dye's weight alone sealed, the plate kept 92% (the current's
 * heat lift carried the warmed wax out of the top); with the current's
 * sealed too, 98.7%, the rest leaving where the wax lies against the bottom
 * rim, through what the gap's own solve corrects (below).
 *
 * A standing plate (Plate Upright above nothing) takes its weight this way
 * and nothing else changes: a press still squeezes liquid out through the
 * rim's p = 0 (the gap's solve, unchanged), so a press on a standing plate is
 * still the shortcut PLAN 27f-7 names for the oil, a wall for the weight and
 * an open edge for the glass. And where the gap or the liquid is not even (a
 * press, glycerine beside water) the mobility M varies, M·∇⊥ψ is no longer
 * free of divergence, and the gap's solve takes what is left through its open
 * rim: exact on an even gap, as the oil's lift is.
 *
 * Ψ is held at zero within three cells of the rim (LIFT_GRID says why), so
 * the wax stops a meniscus short of the glass, and a mean added to w changes
 * nothing (its gradient is zero): the dish's mean density, which mixForce
 * had to take off, drops out by itself.
 */

import { HEAD, W } from './shared';
import { LIFT_GRID } from '../thinGap';

export const SEAL_KERNELS: Record<string, string> = {
  /*
    The right-hand side of −∇²Ψ_a = ∂w/∂a on the lift's grid (m on a side),
    as hsLiftSource writes it for the oil (h·(w₊ − w₋)/2, h = 1/m), w the
    weight mixForce laid on an open plate: A.a.y × (the dye over the dish's
    mean, less the oil's lightness) − A.a.z × the heat, each coarse cell the
    mean of the solver's cells under it, and less the heat lift the lasting
    current carried on an open plate (currentForces: S.up·curBuoy·T, the heat
    clamped to 0..50 and the speed capped at maxCurrent, as there), written in
    G's terms: S.up·X is G·(−X/upright). A neighbour past the rim reads as
    this cell, as the oil's does: the jump of the wax against the wall is the
    wall's to hold, which Ψ = 0 there does.
    A.a = (m, the dye's weight, the heat's lift, the current's curBuoy),
    A.b = (the current's cap, 1/upright, 0, 0).
  */
  sealSource: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var mixT: texture_2d<f32>;
@group(0) @binding(4) var vel: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> src: array<vec2f>;
${LIFT_GRID}
fn coarse(q: vec2i, m: i32) -> f32 {
  let n = vec2i(textureDimensions(dye));
  let r = clamp(q, vec2i(0), vec2i(m - 1));
  let lo = r * n / m;
  let hi = max((r + 1) * n / m, lo + 1);
  var s = 0.0;
  for (var j = lo.y; j < hi.y; j++) { for (var i = lo.x; i < hi.x; i++) {
    let c = vec2i(i, j);
    let rho = textureLoad(dye, c, 0).a - S.meanD - 0.15 * textureLoad(mixT, c, 0).r;
    let t = textureLoad(vel, c, 0).z;
    s += A.a.y * rho - A.a.z * t - A.b.y * min(A.a.w * clamp(t, 0.0, 50.0), A.b.x);
  } }
  let w = s / f32((hi.x - lo.x) * (hi.y - lo.y));
  return select(0.0, w, finite1(w));
}
fn inside(q: vec2i, here: f32, m: i32) -> f32 {
  if (!liftIn(q, m)) { return here; }
  return coarse(q, m);
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = i32(A.a.x);
  let k = i32(id.x);
  if (k >= m * m) { return; }
  let q = vec2i(k % m, k / m);
  if (!liftIn(q, m)) { src[k] = vec2f(0.0); return; }
  let c = coarse(q, m);
  src[k] = 0.5 / f32(m) * vec2f(inside(q + vec2i(1, 0), c, m) - inside(q - vec2i(1, 0), c, m),
                                inside(q + vec2i(0, 1), c, m) - inside(q - vec2i(0, 1), c, m));
}`,

  /*
    The weight's circulation added to the flow: u = ∇⊥ψ = (∂ψ/∂y, −∂ψ/∂x),
    ψ = G_y Ψ_x − G_x Ψ_y, by differences a cell of Ψ's grid apart, as hsBody
    lays the oil's lift. Into the same velocity, in the same units, that
    mixForce laid G·w in, so a standing plate's wax goes as fast as it did
    where the wall is far, and does not go through the wall.
    A.a = (m, G_x, G_y, 0): G the in-plane gravity, Plate Upright's share of it.
  */
  sealFlow: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> psi: array<vec2f>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${LIFT_GRID}
fn psiAtCell(q: vec2i, m: i32) -> vec2f {
  if (!liftIn(q, m)) { return vec2f(0.0); }
  return psi[q.x + q.y * m];
}
// Ψ at a point of the plate, bilinear between its cell middles, zero past the rim.
fn psiAt(uv: vec2f, m: i32) -> vec2f {
  let g = uv * f32(m) - 0.5;
  let c0 = vec2i(floor(g));
  let f = g - vec2f(c0);
  return mix(mix(psiAtCell(c0, m), psiAtCell(c0 + vec2i(1, 0), m), f.x),
             mix(psiAtCell(c0 + vec2i(0, 1), m), psiAtCell(c0 + vec2i(1, 1), m), f.x), f.y);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  var v = textureLoad(vel, q, 0);
  let m = i32(A.a.x);
  let e = 1.0 / f32(m);
  let uv = uvOf(id);
  let dx = (psiAt(uv + vec2f(e, 0.0), m) - psiAt(uv - vec2f(e, 0.0), m)) * (0.5 * f32(m));
  let dy = (psiAt(uv + vec2f(0.0, e), m) - psiAt(uv - vec2f(0.0, e), m)) * (0.5 * f32(m));
  let gx = A.a.y;
  let gy = A.a.z;
  v = vec4f(v.xy + vec2f(gy * dy.x - gx * dy.y, -gy * dx.x + gx * dx.y), v.z, v.w);
  textureStore(dst, q, safeVel(v));
}`,
};
