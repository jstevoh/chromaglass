/**
 * Turbulence on the thin gap, laid as the stir a closed dish lets it make
 * (PLAN 18a-25).
 *
 * What was reported (the looks' re-tune after the real dye mixing, 28i-8,
 * 2026-11-27): Lacing Run stayed dim whatever its dials did, and Classical
 * Vibe's dish emptied while the dye regulator poured into it. Measured on
 * the owner's Mac, each stir alone on Classical Vibe's pours: with nothing
 * stirring the dish held a mean dye of 0.59; Turbulence 0.25 took it to 0.17
 * in 30 s, the music's stir cord on Turbulence alone to 0.08, and Lacing Run
 * read 0.06 at 60 s while the regulator laid 330 000 of dye into it. In the
 * lab (128², dt 0.05, a disc of dye to r 0.44, 600 steps, nothing else on)
 * Turbulence 0.5 kept 7.1% of the dish and 0.7 kept 6.3%, where the still
 * plate kept 100%.
 *
 * Why. The stir was a curl noise, u = ∇⊥ψ with ψ a sum of up to four
 * octaves of simplex noise, laid into the velocity in forcesB. A curl has no
 * divergence, so on the old plate, whose walls the projection holds, it was
 * a fair stir. On the thin gap the rim is open (wgsl/thinGap.ts, "And the
 * rim is open": p = 0 past the inscribed circle, so a press can squeeze
 * liquid out and draw it back), and a flow with no divergence asks nothing
 * of the pressure there, so the solve passes it through as it is. ψ is not
 * constant along the rim, and the flux through the rim is ∂ψ/∂s along it:
 * the lowest octave is the size of the dish, so whole lobes of the dish ran
 * out over one side while clear liquid came in at another, and decayDye
 * clears what is past the rim every step. The regulator cannot put back
 * what has left as fast as it leaves.
 *
 * A dish does not do that. Stir the liquid between two glasses with a
 * finger, a breath or a draught and it turns in gyres that close inside
 * the meniscus: the liquid's edge stays where it is, so nothing crosses it,
 * u·n = 0. Between two glasses at an even gap the flow a stirring force F
 * drives is Darcy's, u = M(F − ∇p) with ∇·u = 0, and with no flux at the
 * wall that is the closed dish's projection of F: u = ∇⊥Φ with −∇²Φ = curl F
 * inside and Φ = 0 on the wall, the same circulation the oil's lift up a
 * rocked plate (PLAN 27f-5) and a standing plate's weight (27f-9, seal.ts)
 * already lay. For the stir F = ∇⊥ψ, so curl F = −∇²ψ, and Φ = ψ − H, H the
 * harmonic function equal to ψ on the rim: the noise's own eddies in the
 * middle, unchanged, and near the rim the part of them that would have run
 * out turned to run along it. Laid that way the dish keeps its dye and the
 * stir is as strong where the rim is far.
 *
 * Not the obvious thing, ψ multiplied by a window that falls to zero over
 * the outer tenth of the dish, as the draught's gusts are (hsBody, airChi,
 * PLAN 18a-16). That works for the draught because its noise is fine (a
 * period of twenty cells): its ψ is small, so ψ∇(window) is small. The
 * stir's lowest octave is the dish, its ψ about a hundred cells·speed, and
 * the window's gradient across twelve cells would turn it into a jet round
 * the rim several times the stir in the middle (worked out on paper, ψ over
 * the window's width, and not tried), a ring the dish does not have. Φ by
 * the relaxation has none (`npm run rimstir` 3), and costs the source here and
 * hsLiftRelax's sweeps on buffers of its own, as the seal's does.
 *
 * Φ is relaxed LIFT_SWEEPS red-black sweeps a step from where the last step
 * left it, warm: the noise drifts slowly (its octaves move 0.06 to 0.21 of a
 * period a second), so a few sweeps keep up, and Φ anywhere short of
 * converged is still zero on the wall, so a lag is a stir a little slow,
 * never liquid leaving. Ψ's grid holds Φ at zero within three cells of the
 * rim (LIFT_GRID says why), a meniscus's width.
 *
 * Where the gap or the liquid is not even (a press, an oil thicker than
 * the water) M varies and M·∇⊥Φ is not quite free of divergence; the gap's
 * solve takes that remainder, through its open rim, as it does for the
 * oil's lift and the seal: exact on an even gap.
 */

import { HEAD, NOISE_WGSL, W } from './shared';
import { LIFT_GRID } from '../thinGap';

/*
  The stir's stream function ψ at a point p of the plate, in its cells (S.l
  across): Turbulence Detail's octaves of simplex noise, each a period 1/freq
  wide, 0.55 the one before and drifting at its own speed, divided by its
  frequency so that ∇⊥ψ, not ψ, is the octave's size. forcesB's curl on the
  old plate is ∇⊥ of this; the thin gap's is the closed dish's (above).
*/
export const STIR_PSI = /* wgsl */ `
fn stirPsi(p: vec2f) -> f32 {
  var s = 0.0;
  for (var o = 0; o < 4; o++) {
    if (o >= S.turbDetail) { break; }
    let freq = (0.012 / (S.l / 128.0)) * f32(1 << u32(o));
    let tOff = S.time * (0.06 + f32(o) * 0.05) + f32(o) * 37.7;
    s += snoise(vec2f(p.x * freq, p.y * freq + tOff)) * (pow(0.55, f32(o)) / freq);
  }
  return s;
}
`;

export const STIR_KERNELS: Record<string, string> = {
  /*
    The right-hand side of −∇²Φ = −∇²ψ on the lift's grid (m on a side), in
    hsLiftRelax's form (its sweep is Φ = (ΣΦ_neighbours + src)/4): src =
    4ψ − Σψ_neighbours, ψ at the cell's middle and its four neighbours'
    whether or not they are in the dish, so the relaxation's fixed point is
    ψ less the harmonic part that matches ψ at the wall. In .x; .y is 0.
    A.a = (m, 0, 0, 0).
  */
  stirSource: `${HEAD}${NOISE_WGSL}${STIR_PSI}
@group(0) @binding(2) var<storage, read_write> src: array<vec2f>;
${LIFT_GRID}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = i32(A.a.x);
  let k = i32(id.x);
  if (k >= m * m) { return; }
  let q = vec2i(k % m, k / m);
  if (!liftIn(q, m)) { src[k] = vec2f(0.0); return; }
  let h = S.l / f32(m);
  let p = (vec2f(q) + 0.5) * h;
  let lap = 4.0 * stirPsi(p) - stirPsi(p + vec2f(h, 0.0)) - stirPsi(p - vec2f(h, 0.0))
          - stirPsi(p + vec2f(0.0, h)) - stirPsi(p - vec2f(0.0, h));
  src[k] = vec2f(select(0.0, lap, finite1(lap)), 0.0);
}`,

  /*
    The closed stir added to the flow: u = ∇⊥Φ = (∂Φ/∂y, −∂Φ/∂x), by
    differences a cell of Φ's grid apart, in the plate's cells (Φ is in
    ψ's units, cells·speed), at Turbulence's strength as forcesB laid the
    open curl (S.turbScale × 0.5/3). Into the velocity the gap's solve then
    takes, as forcesB's was.
    A.a = (m, 0, 0, 0).
  */
  stirFlow: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> psi: array<vec2f>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${LIFT_GRID}
fn phiAtCell(q: vec2i, m: i32) -> f32 {
  if (!liftIn(q, m)) { return 0.0; }
  return psi[q.x + q.y * m].x;
}
// Φ at a point of the plate, bilinear between its cell middles, zero past the rim.
fn phiAt(uv: vec2f, m: i32) -> f32 {
  let g = uv * f32(m) - 0.5;
  let c0 = vec2i(floor(g));
  let f = g - vec2f(c0);
  return mix(mix(phiAtCell(c0, m), phiAtCell(c0 + vec2i(1, 0), m), f.x),
             mix(phiAtCell(c0 + vec2i(0, 1), m), phiAtCell(c0 + vec2i(1, 1), m), f.x), f.y);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  var v = textureLoad(vel, q, 0);
  let m = i32(A.a.x);
  let e = 1.0 / f32(m);
  let uv = uvOf(id);
  // ∂/∂u over the plate's width, then per cell of it (S.l across).
  let dx = (phiAt(uv + vec2f(e, 0.0), m) - phiAt(uv - vec2f(e, 0.0), m)) * (0.5 * f32(m)) / S.l;
  let dy = (phiAt(uv + vec2f(0.0, e), m) - phiAt(uv - vec2f(0.0, e), m)) * (0.5 * f32(m)) / S.l;
  v = vec4f(v.xy + vec2f(dy, -dx) * (S.turbScale * (0.5 / 3.0)), v.z, v.w);
  textureStore(dst, q, safeVel(v));
}`,
};
