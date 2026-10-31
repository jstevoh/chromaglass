/**
 * The plate as a Hele-Shaw cell (PLAN §18a): the flow between two glasses.
 *
 * What was there, and why it had to go. The solver's velocity was damped by a
 * per-step factor and then clamped to `MAX_SPEED` in `decayVel`, and 99.7% of
 * the dyed cells sat at that clamp (docs/evaluation-2026-09.md). So nothing the
 * liquid was pushed by lasted past the step it was pushed in: the colour rode
 * the noise added after the pressure solve and a half-resolution current kept
 * beside the field to get some memory back, and every tool moved the colour by
 * a hand-written carry because the flow could not.
 *
 * What a plate of liquid between two glasses actually is. When the gap h is
 * small against the plate, the flow across the gap is a parabola (Poiseuille),
 * and averaged over the gap the in-plane velocity obeys
 *
 *     ρ ∂u/∂t = −∇p + f − (12μ / h²) u,        ∇·(h u) = −∂h/∂t,
 *
 * the second being only that liquid is conserved: where the glasses close, the
 * liquid between them has to leave sideways. The drag term is the glass itself,
 * the shear across the gap, and its time ρh²/12μ is the plate's memory: about
 * three seconds for water in a 6 mm gap, a tenth of a second for a light oil,
 * nothing at all for glycerine. That is what decides how long a push lasts, and
 * the clamp was standing in for it.
 *
 * The step, as these kernels take it:
 *
 *   1. `hsPrep`: every force of the step (the magnet, the mix, the stirring)
 *      was written by kernels that were tuned as one step's velocity, because
 *      one step was all a velocity lasted. Here each is read as the speed that
 *      force drives the liquid to against the glass at the plate's rest gap
 *      (its terminal velocity there), which is the same number with the drag
 *      time put back: the force is k₀·(that speed), with k₀ = 12ν/h₀², and a
 *      step adds k₀·Δt of it. So a look's forces keep their size on an open
 *      plate, take the drag time to get there and to fade, and, being forces
 *      and not speeds, move the liquid less where the gap is tight (as h²,
 *      the Darcy mobility of a body force). Since 18a-2 the body forces (the
 *      magnet, the mix, Rain Drip's heavy colour and Updraft's shear, which
 *      `hsBody` adds) are read against the default liquid's k₀ rather than
 *      this one's, so a thick liquid answers them slowly; the look's stirring
 *      keeps this liquid's k₀, a dial; and a sliding glass (Glass Smear) is a
 *      drag toward its speed, not a force (hsPrep says each). Then the drag, implicitly, cell by
 *      cell: c = 1/(1 + kΔt) with k = 12ν/h², so a thick liquid in a tight gap
 *      stops at once and a thin one in a deep gap coasts.
 *   2. `hsDivergence`: what the flux h·c·u* would pile up or drain, and what
 *      the gap closing pushes out (−∂h/∂t, the press).
 *   3. The pressure that makes the flux conserve liquid, ∇·(M∇p) = ∇·(M u*) +
 *      ∂h/∂t, with the mobility M = h·c: h³/12μ once the drag dominates, the
 *      Reynolds equation for a squeeze film. A variable-coefficient multigrid
 *      (`hsSmooth0`, `hsRestrict0`, `hsCoarsen`, `hsSmooth`, `hsRestrict`,
 *      `hsProlong`, `hsProlong0`), face coefficients as harmonic means, which
 *      is the mean that gets a flux through two cells in series right.
 *   4. `hsGradient`: u = c u* − M∇p / h, the correction taken face by face so
 *      a step in the gap moves the flux the way a step in a pipe would.
 *
 * What the step no longer does. The old solver projected, carried the velocity
 * along itself (semi-Lagrangian), and projected again to take out what the carry
 * put back. The second projection was only there for the carry, and the carry is
 * the inertial term ρ(u·∇)u, which in a gap is weighed against the drag, not
 * against viscosity across the plate: their ratio is the reduced Reynolds number
 * Re·h/L. For the oils and anything thicker it is under a tenth at the plate's
 * speeds, so the drag has taken a push long before the push has carried itself
 * anywhere, and dropping the carry costs nothing a person can see. For water in
 * the 6 mm middle of the plate it is near 2, so a deep-gapped water look keeps
 * less inertia than real water would. That is a shortcut kept for the step's
 * time (an advection and a projection, the largest part of it), and PLAN §18a
 * has it as its own item to measure on the Water looks.
 * The ferrofluid's share of the carry is taken (phaseMomentum, wgsl/fluid.ts):
 * its drag time in the rest gap is 0.6 s, so a drop dragged at the hand's speed
 * outran its own momentum and fell behind the magnet (PLAN 29c).
 *
 * And the rim is open. The old projection was a closed box, so every source
 * had to be balanced by a uniform sink over the whole plate, and a press pushed
 * nothing anywhere in particular (and a variable mobility could not show:
 * docs/physics-plan.md, "What is not here"). The dish is the plate's inscribed
 * circle (the picture never shows its corners), so past it the liquid is at the
 * air's pressure, p = 0, and what a press squeezes out leaves across the rim
 * and comes back when the glass lifts, as it does between two real glasses.
 *
 * Level 0's mobility is one buffer, row-major, one number a cell, negative on
 * the open cells past the rim: the sign is the boundary and the size is still
 * the cell's mobility, which the face beside it needs. The coarse levels keep
 * a coefficient a face instead (hsCoarsen says why) and a sign a cell.
 */

import { HAND_GRIP } from '../../lib/handSolid';
import { DISH_METRES, OPEN_RIM } from '../../lib/turntable';
import { WATER_NU } from '../../lib/liquidProps';
import { HEAT_ROOM, UPDRAFT_MEAN } from '../fluid/constants';
import { waterDensity } from '../../lib/lampBoil';

// Water's density at the room's temperature (Kell 1975), the heat's lightness's reference (HEAT_LIGHT).
const HEAT_ROOM_RHO = waterDensity(HEAT_ROOM);

/**
 * The kernels, built on the solver's own head (the Sim and Args structs) and
 * its packed-plane reader, which are passed in rather than imported so this
 * file does not import the module that spreads it into its kernel table.
 */
export function thinGapKernels(HEAD: string, W: string, NOISE: string): Record<string, string> {
  /*
    Shared by every kernel below: where a cell sits in the packed level-0
    pressure (the two colour planes pressureRedBlack uses, see PACKED in
    wgsl/fluid.ts), and the harmonic mean.

    Harmonic, not arithmetic, because two cells side by side are two
    resistances in series: a tight cell next to an open one lets through
    about what the tight one lets through, and an arithmetic mean would let
    the open one leak liquid through a gap that is nearly closed.
  */
  const COMMON = /* wgsl */ `
fn hsPacked(x: i32, y: i32, n: i32) -> i32 { let half = n / 2; return ((x + y) & 1) * n * half + y * half + (x >> 1); }
fn hsHarm(a: f32, b: f32) -> f32 { return 2.0 * a * b / max(a + b, 1e-20); }
fn hsIn(x: i32, y: i32, n: i32) -> bool { return x >= 0 && y >= 0 && x < n && y < n; }
/*
  The gap in units of the rest gap at the plate's middle, floored where the
  squeeze floors it (0.004 of the plate). hsPrep and hsGradient both take it
  from here: the mobility is h·c and the gradient divides by h again to get
  c back, so the two must agree to the bit.
*/
fn hsGap(g: f32, h0: f32) -> f32 { return max(g, 0.004) / h0; }
`;

  /*
    The neighbour sum of one coarse level, for the smoother and the residual
    alike: Σ K_f over the cell's faces, and Σ K_f p over the neighbours that
    are not held at the rim's pressure. A coarse level keeps its faces' own
    coefficients (\`fc\`: every cell's east face, then every cell's north
    face; see hsCoarsen for why a face and not a cell), and a face off the
    edge of the grid is stored as zero, a wall with no flux through it (the
    old projection's Neumann wall, now only in the plate's corners, which are
    past the rim anyway). \`cell\` is negative on a cell held at p = 0.
  */
  const ROWS = /* wgsl */ `
fn hsRowSums(x: i32, y: i32, n: i32) -> vec2f {
  let nn = n * n;
  let i = x + y * n;
  var f = array<f32, 4>(fc[i], 0.0, fc[nn + i], 0.0);
  var q = array<i32, 4>(i + 1, i - 1, i + n, i - n);
  if (x > 0) { f[1] = fc[i - 1]; }
  if (y > 0) { f[3] = fc[nn + i - n]; }
  var den = 0.0;
  var num = 0.0;
  for (var k = 0; k < 4; k++) {
    if (f[k] <= 0.0) { continue; }
    den += f[k];
    if (cell[q[k]] >= 0.0) { num += f[k] * p[q[k]]; }
  }
  return vec2f(den, num);
}
`;

  /*
    Whether a cell of the oil lift's grid (m on a side) is where Ψ is solved:
    inside the rim by three of its cells. The flow is ∇⊥ψ by central
    differences, and the flux through a face between two cells is the
    difference of ψ across the face's two ends, the cells either side of
    it; with ψ = 0 on every cell near the rim no face of it carries any of
    the lift. Held at the rim's own cells, the cells just inside it still had
    ψ, and a lens rocked into the rim lost 7% of its oil through it in three
    seconds at 6° (lab, at a hundredth of the looks' Oil Tension, so the
    surface tension's own drain, PLAN 18g-6 then, was out of it); two cells in, it
    lost 2.3% in six; three, 0.9%, of which the same lens left level there
    loses 0.2%. The lens stops three cells short of the rim, 3 mm on a 192
    plate, a meniscus's width.
  */
  const LIFT_GRID = /* wgsl */ `
fn liftIn(q: vec2i, m: i32) -> bool {
  return q.x >= 0 && q.y >= 0 && q.x < m && q.y < m && length((vec2f(q) + 0.5) / f32(m) - vec2f(0.5)) < ${OPEN_RIM.toFixed(2)} - 3.0 / f32(m);
}
`;

  /*
    The water's share of a cell's colour, for the colour's weight on a
    tipped plate with oil on it (hsBody). With Oil Bodies the oil carries its
    own share (\`oilDye\`, bodyPartition) and the water's is what is left;
    without, the colour is not kept to either liquid and the water's share
    is taken as the water's share of the column, d(1 − c). \`oilDye\` is
    1×1 and empty without Oil Bodies; \`mixT\` is bound beside it.
  */
  const WATER_DYE = /* wgsl */ `
fn waterDye(q: vec2i, d: f32) -> f32 {
  if (textureDimensions(oilDye).x > 1u) { return max(d - textureLoad(oilDye, q, 0).a, 0.0); }
  return d * (1.0 - clamp(textureLoad(mixT, min(q, vec2i(textureDimensions(mixT)) - 1), 0).r, 0.0, 1.0));
}
`;

  /*
    The heat's lightness (PLAN 38f): B = 1 − ρ(T_room + ΔT)/ρ(T_room), water's
    real density (Kell 1975, as src/lib/lampBoil.ts's waterDensity), with
    ΔT the field's temperature over the room (vel.z). Held to 0–100 °C,
    the range the curve is written for and liquid water keeps.
  */
  const HEAT_LIGHT = /* wgsl */ `
fn heatLight(dT: f32) -> f32 {
  let t = clamp(${HEAT_ROOM.toFixed(1)} + dT, 0.0, 100.0);
  let rho = (999.83952 + t * (16.945176 + t * (-7.9870401e-3 + t * (-46.170461e-6 + t * (105.56302e-9 - t * 280.54253e-12))))) / (1.0 + 16.879850e-3 * t);
  return 1.0 - rho / ${HEAT_ROOM_RHO.toFixed(4)};
}
`;

  /*
    Updraft's stress over the dish (PLAN 38t), per unit of its value a
    plate's width in: √(W/x), x from the rim the air comes over, along −v.
    Past the rim, the dish's mean, so it adds nothing there.
  */
  const UPDRAFT_AT = /* wgsl */ `
fn updraftAt(uv: vec2f, n: f32) -> f32 {
  let d = uv - vec2f(0.5);
  if (dot(d, d) >= 0.25) { return ${UPDRAFT_MEAN.toFixed(5)}; }
  return inverseSqrt(max(sqrt(0.25 - d.x * d.x) - d.y, 1.0 / n));
}
`;

  /* The same on level 0, whose pressure is packed and whose mobility is `mob`. */
  const ROWS0 = /* wgsl */ `
fn hsSums0(x: i32, y: i32, n: i32, mi: f32) -> vec2f {
  var den = 0.0;
  var num = 0.0;
  var o = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));
  for (var k = 0; k < 4; k++) {
    let q = vec2i(x, y) + o[k];
    if (!hsIn(q.x, q.y, n)) { continue; }
    let mn = mob[q.x + q.y * n];
    let f = hsHarm(mi, abs(mn));
    den += f;
    if (mn >= 0.0) { num += f * pr[hsPacked(q.x, q.y, n)]; }
  }
  return vec2f(den, num);
}
`;

  return {
    /*
      Two of the look's own forces as the forces they are, on a thin gap
      only (PLAN 18a-2). The old plate keeps forcesB's versions, and every
      look's step on it is what it was.

      **Rain Drip is heavy dye on a plate stood up.** What it drew was
      streaks of the plate sliding downhill (a noise's streaks pushed down,
      and a second, made-up friction between them). What runs down a glass
      is the coloured liquid being denser than the clear round it, and
      between two glasses that is a Hele-Shaw cell with a heavy liquid over
      a light one, which is unstable (Rayleigh–Taylor in a gap: growth
      k·Δρ·g·h²/12μ, the drag's mobility times the weight): the colour
      falls in fingers and the clear liquid rises between them, and nobody
      draws the streaks. So the force is the dye's excess weight over the
      plate's mean, down the plate (Boussinesq: the mean's weight is the
      still liquid's pressure, held by the dish's own bottom), A.a.x the
      weight of a unit of dye in the reference liquid's speeds at the rest
      gap. It moves no liquid on balance, it is fastest where the colour is
      thickest, and a thick liquid drips slowly (it is a body force, read
      as one in hsPrep).

      **Updraft is a draught's shear on the liquid.** Air moving over a
      liquid drags its surface with a stress τ, which in a layer this thin
      drives a shear across it: its mean goes at τh/2μ, in proportion to
      the depth (the same model 15g gives Blow). So the force is the old
      push over the gap in rest gaps: through the gap's Darcy mobility (h²)
      it moves the liquid as h, half as fast where the glass is pressed to
      half the gap, and as 1/μ, slower in a thick liquid. And it moves all
      the liquid, not only the colour: the old push was only where there
      was dye, and air does not know what colour it is blowing on.

      **Plate Rock is the same weight down a tipped plate.** A hand
      rocking the glass tips it a few degrees, which puts g·sinθ in the
      plate, and the colour where it is thicker than the mean slides
      downhill as Rain Drip's does, the clear liquid rising past it (PLAN
      27a). A.b.xy is that tilt's in-plane gravity times the weight of a
      unit of dye (fluid.ts, ROCK_FALL), signed downhill.

      **A Blow's breath is the same physics where the hand blows** (PLAN
      15g, lib/breath.ts): the air's stress τ on the surface, laid in
      pascals, drives the column's mean at τh/2μ. A.a.w turns τ into
      τh₀/2μ_ref in the flow's units, the speed it drives the reference
      liquid to at the rest gap, which is how hsPrep reads a body force;
      over the gap in rest gaps, as Updraft's, the liquid then answers as h
      and as its own viscosity. \`breath\` is 1×1 and empty with no Blow.

      **And the oil rises up the same tipped plate** (PLAN 27f-5). A body of
      oil is lighter than the water round it, ρ₁/ρ = 0.88, so under the
      cover glass it goes the other way from the heavy colour: a bubble under
      a tipped glass. Its force is the oil's share c times Δρ g sinθ, uphill
      (L, A.b.zw, from fluid.ts OIL_LIFT), and between two glasses what that
      force does is a circulation: the oil goes up, the water comes down
      round it, and nothing else moves. An even sheet of oil moves nothing,
      and the dish's rim holds what reaches it.

      The force is laid as that circulation and no more, the closed dish's
      Darcy flow at an even gap: u = ∇⊥ψ, ψ = L_y Ψ_x − L_x Ψ_y, with
      −∇²Ψ_a = ∂c/∂a inside the rim and Ψ = 0 on it (hsLiftSource,
      hsLiftRelax). That is the force with its gradient part taken off, which
      between two glasses is a pressure and moves nothing (the curl of c L is
      the curl of the flow, and ψ = 0 on the rim is no flux through it). Laid
      as c L itself, as the colour's weight is, the gap's own solve takes the
      rim as open (the plate's free edge, past which a press's liquid goes,
      p = 0), and a lens that reached it went out through it: in the lab 88%
      of a lens was gone over the uphill rim in three seconds of a 6° tilt,
      the oil of Clock Glass's bodies draining from the picture a lean at a
      time. The clock glass's rim is its wall, and a circulation closed inside
      it is what a tipped dish does. ψ vanishing on the rim also makes the
      flow's mean over the dish zero, so the oil cannot slide the frame: the
      first try, on the two-layer dish's rafts alone, slid an oil sheet and
      the whole picture with it at 4 mm/s every lean (PLAN 27f-5 has it).
      Where the gap is not even (a press, a domed plate) the gap's solve then
      takes what is left, with its own mobility: exact on an even gap, the
      shortcut PLAN 27f-7 names.

      With the oil there, the colour's weight is the water's colour alone
      (WATER_DYE), over that colour's own mean on the dish (hsOilMean). ROCK_FALL weighs a unit of dye as dyed water against clear
      water; the oil's colour is an oil-soluble dye whose weight is inside the
      oil's own density, and laid as the water's it sent the oil's coloured
      bodies downhill against their buoyancy (Clock Glass lays its bodies at
      twice the water's wash, oilLay.ts's BODY_DYE, and a unit of dye weighs
      about four times a full cell of oil's lift). The mean is taken on the
      GPU this step: one late by a readback would leave every cell a residue
      that slides the whole plate. Rain Drip's weight and the comet's pull
      keep the colour's whole weight over the app's mean, as they were: a
      standing plate's oil is PLAN 27f-6.

      The heat's lift (PLAN 38f): water's lightness B where it is warm
      (HEAT_LIGHT, Kell's density), over the dish's mean of it (hsHeatMean,
      for the same reason as the colour's: a lift the same everywhere is a
      pressure in a closed sandwich, and through the solver's open rim it
      would slide the picture), times S.heatLift, the plate's up as far as it
      stands or is tipped in the flow's speed per unit B (fluid.ts writeSim).
      It went through the current, eased and capped at 0.75 of a cell a
      step, so every plume rose at the cap; here it rises at Darcy's
      B g h²/12μ, as fast as the heat says (`npm run plume`).

      Updraft (PLAN 38t): a boundary layer's stress τ ∝ x^-½ from the rim
      the air comes over (toward −v), less the dish's mean of it
      (UPDRAFT_MEAN), read as the breath's stress is. It was a noise,
      snoise(p·0.05 − t), plus a uniform push up the plate.

      A.a = (Rain Drip's weight, Updraft's stress a plate's width in from its
      edge in the flow's speed (fluid.ts), the rest gap h0, the breath's
      pascals to the flow's speed);
      A.b = (Plate Rock's pull on the colour, x and y; the oil's lift L, x
      and y, zero with no oil). \`oilMean\` is the water's colour's mean on
      the dish (hsOilMean), \`psi\` hsLiftRelax's (Ψ_x, Ψ_y), on its own
      square grid (its side the buffer's length's square root).
    */
    hsBody: `${HEAD}${NOISE}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var sq: texture_2d<f32>;
@group(0) @binding(5) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var breath: texture_2d<f32>;
@group(0) @binding(7) var mixT: texture_2d<f32>;
@group(0) @binding(8) var<storage, read> oilMean: array<f32, 4>;
@group(0) @binding(9) var<storage, read> psi: array<vec2f>;
@group(0) @binding(10) var oilDye: texture_2d<f32>;
${LIFT_GRID}
${WATER_DYE}
${HEAT_LIGHT}
${UPDRAFT_AT}
// Ψ at a point of the plate, bilinear between its cell middles, zero past the rim.
fn psiAt(uv: vec2f, m: i32) -> vec2f {
  let g = uv * f32(m) - 0.5;
  let c0 = vec2i(floor(g));
  let f = g - vec2f(c0);
  return mix(mix(liftAt(c0, m), liftAt(c0 + vec2i(1, 0), m), f.x),
             mix(liftAt(c0 + vec2i(0, 1), m), liftAt(c0 + vec2i(1, 1), m), f.x), f.y);
}
fn liftAt(q: vec2i, m: i32) -> vec2f {
  if (!liftIn(q, m)) { return vec2f(0.0); }
  return psi[q.x + q.y * m];
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  var v = textureLoad(vel, q, 0);
  // Rain Drip's heavy colour down a standing plate, and Plate Rock's tilt (A.b.xy, fluid.ts ROCK_FALL):
  // both the dye's weight over the plate's mean, the second down whichever way the hand tips the glass.
  // Comet flow adds an explicit, constant pull to the dye (S.cometX, S.cometY).
  // The oil's lift (A.b.zw) up the same tilt, the water's colour then weighed alone (above).
  if (A.a.x > 0.0 || any(A.b != vec4f(0.0)) || S.cometX != 0.0 || S.cometY != 0.0) {
    let dRim = uvOf(id) - vec2f(0.5);
    let rRim = length(dRim);
    let rMax = ${OPEN_RIM.toFixed(2)} - 1.0 / S.n;
    let qDish = select(q, clampP(vec2i((vec2f(0.5) + dRim * (rMax / max(rRim, 1e-6))) * S.n), S.n), rRim >= ${OPEN_RIM.toFixed(2)});
    let dq = textureLoad(dye, qDish, 0).a;
    let w = dq - S.meanD;
    var rock = A.b.xy * w;
    if (any(A.b.zw != vec2f(0.0))) {
      rock = A.b.xy * (waterDye(qDish, dq) - oilMean[0]);
      // u = ∇⊥ψ = (∂ψ/∂y, −∂ψ/∂x), ψ = L_y Ψ_x − L_x Ψ_y, by differences a cell of Ψ's grid apart:
      // on every cell, the rim's and past it too, so its divergence is zero on all of them (LIFT_GRID).
      let m = i32(round(sqrt(f32(arrayLength(&psi)))));
      let e = 1.0 / f32(m);
      let uv = uvOf(id);
      let dx = (psiAt(uv + vec2f(e, 0.0), m) - psiAt(uv - vec2f(e, 0.0), m)) * (0.5 * f32(m));
      let dy = (psiAt(uv + vec2f(0.0, e), m) - psiAt(uv - vec2f(0.0, e), m)) * (0.5 * f32(m));
      rock += vec2f(A.b.w * dy.x - A.b.z * dy.y, -A.b.w * dx.x + A.b.z * dx.y);
    }
    v = vec4f(v.xy - S.up * (A.a.x * w) + vec2f(S.cometX, S.cometY) * w + rock, v.z, v.w);
  }
  if (any(S.heatLift != vec2f(0.0))) {
    v = vec4f(v.xy + S.heatLift * (heatLight(v.z) - oilMean[1]), v.z, v.w);
  }
  if (S.air > 0.1) {
    let tau = A.a.y * (updraftAt(uvOf(id), S.n) - ${UPDRAFT_MEAN.toFixed(5)});
    v = vec4f(v.xy - vec2f(0.0, tau) / hsGap(textureLoad(sq, q, 0).r, A.a.z), v.z, v.w);
  }
  if (A.a.w > 0.0) {
    let tau = textureLoad(breath, min(q, vec2i(textureDimensions(breath)) - 1), 0).xy;
    v = vec4f(v.xy + tau * A.a.w / hsGap(textureLoad(sq, q, 0).r, A.a.z), v.z, v.w);
  }
  textureStore(dst, q, safeVel(v));
}`,

    /*
      The mean hsBody weighs the water's colour against on a tipped plate
      with oil on it: dye × (1 − c) over the dish (inside the open rim, where
      the picture is). One workgroup, each thread a stride of the grid, then
      a tree (ferroDrop's MEAN), so the mean is this step's, not a
      readback's from frames ago.
    */
    /*
      The dish's mean of the heat's lightness, B(ΔT) (hsBody, PLAN 38f), into
      the oil's mean buffer's second slot, this step: one late by a readback
      would leave a residue that slides the plate standing up. One workgroup.
    */
    hsHeatMean: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> oilMean: array<f32, 4>;
${HEAT_LIGHT}
var<workgroup> sums: array<vec2f, 256>;
@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let n = u32(S.n);
  var s = vec2f(0.0);
  for (var i = t; i < n * n; i += 256u) {
    let q = vec2i(i32(i % n), i32(i / n));
    if (length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) { continue; }
    s += vec2f(1.0, heatLight(textureLoad(vel, q, 0).z));
  }
  sums[t] = s;
  workgroupBarrier();
  for (var k = 128u; k > 0u; k >>= 1u) {
    if (t < k) { sums[t] += sums[t + k]; }
    workgroupBarrier();
  }
  if (t == 0u) { oilMean[1] = sums[0].y / max(sums[0].x, 1.0); }
}`,

    hsOilMean: `${HEAD}
@group(0) @binding(2) var mixT: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var<storage, read_write> oilMean: array<f32, 4>;
@group(0) @binding(5) var oilDye: texture_2d<f32>;
${WATER_DYE}
var<workgroup> sums: array<vec2f, 256>;
@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let n = u32(S.n);
  var s = vec2f(0.0);
  for (var i = t; i < n * n; i += 256u) {
    let q = vec2i(i32(i % n), i32(i / n));
    if (length((vec2f(q) + 0.5) / S.n - vec2f(0.5)) >= ${OPEN_RIM.toFixed(2)}) { continue; }
    s += vec2f(1.0, waterDye(q, textureLoad(dye, q, 0).a));
  }
  sums[t] = s;
  workgroupBarrier();
  for (var k = 128u; k > 0u; k >>= 1u) {
    if (t < k) { sums[t] += sums[t + k]; }
    workgroupBarrier();
  }
  if (t == 0u) { oilMean[0] = sums[0].y / max(sums[0].x, 1.0); }
}`,

    /*
      The oil's lift as the closed dish's circulation (hsBody says why): the
      right-hand side of −∇²Ψ_a = ∂c/∂a, on a grid of its own, m on a side
      (the solver's, coarser past LIFT_MOST in fluid.ts, which says why),
      each cell's c the mean of the solver's cells under it. Written as
      h²·∂c/∂a, h = 1/m, by central differences: h·(c₊ − c₋)/2, the term
      the relaxation adds.
      A.a = (m, 0, 0, 0).
    */
    hsLiftSource: `${HEAD}
@group(0) @binding(2) var mixT: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> src: array<vec2f>;
${LIFT_GRID}
fn coarse(q: vec2i, m: i32) -> f32 {
  let n = vec2i(textureDimensions(mixT));
  let r = clamp(q, vec2i(0), vec2i(m - 1));
  let lo = r * n / m;
  let hi = max((r + 1) * n / m, lo + 1);
  var s = 0.0;
  for (var j = lo.y; j < hi.y; j++) { for (var i = lo.x; i < hi.x; i++) {
    s += clamp(textureLoad(mixT, vec2i(i, j), 0).r, 0.0, 1.0);
  } }
  return s / f32((hi.x - lo.x) * (hi.y - lo.y));
}
/*
  A neighbour past the rim is read as this cell: the force is the oil inside
  the dish, and its curl is the interior's. The rim's own jump, oil against
  the wall, is the wall's to hold, which Ψ = 0 there does.
*/
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
      One red-black sweep of over-relaxed Gauss–Seidel on −∇²Ψ = s, both Ψ
      at once, Ψ = 0 past the rim (a cell there counts as zero). Warm: Ψ is
      kept from step to step, because it is the oil's shape and not the
      tilt's (the tilt multiplies it in hsBody), and the oil changes shape
      slowly; a few sweeps a step keep up with it. And Ψ anywhere short of
      converged is still a circulation with nothing through the rim, so a
      lag is a lens a little slow, never the frame moving.
      A.a = (m, the colour, the over-relaxation ω, 0).
    */
    hsLiftRelax: `${HEAD}
@group(0) @binding(2) var<storage, read> src: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> psi: array<vec2f>;
${LIFT_GRID}
fn at(q: vec2i, m: i32) -> vec2f {
  if (!liftIn(q, m)) { return vec2f(0.0); }
  return psi[q.x + q.y * m];
}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) {
  let m = i32(A.a.x);
  let half = m / 2;
  let k = i32(id.x);
  if (k >= m * half) { return; }
  let y = k / half;
  let x = 2 * (k % half) + ((y + i32(A.a.y)) & 1);
  let q = vec2i(x, y);
  let i = x + y * m;
  if (!liftIn(q, m)) { psi[i] = vec2f(0.0); return; }
  let gs = 0.25 * (at(q + vec2i(1, 0), m) + at(q - vec2i(1, 0), m) + at(q + vec2i(0, 1), m) + at(q - vec2i(0, 1), m) + src[i]);
  psi[i] = psi[i] + A.a.z * (gs - psi[i]);
}`,

    /*
      The step's forces, the drag, and the mobility.

      A.a = (k scale, real seconds this step, the rest gap h0, the rim's
      radius), A.b = (the ferrofluid's viscosity over the clear liquid's,
      the reference liquid's viscosity over this one's, the glass's own
      velocity halved).
      k = A.a.x / h², with h in plate widths: A.a.x is 12ν/W², the
      liquid's kinematic viscosity over the plate's width squared, so the
      drag is in real seconds whatever grid or look clock the plate runs at.

      Three snapshots of the velocity: \`prev\` before any of this step's
      forces, \`mid\` after the body forces, \`vel\` after the rest. Each
      difference is what its forces asked for as one step's velocity, the
      number they were tuned as, and the two are taken differently, because
      they are different things (PLAN 18a-2):

      - **Body forces** (mid − prev): the magnet's pull on the ferrofluid,
        the maze's, the oil's surface tension, the soap's Marangoni stress,
        the dye's weight, the heavy dye of Rain Drip and the draught of
        Updraft (thinBody). These are forces on the liquid, and a force
        does not know how thick the liquid it pushes is: what it moves the
        liquid at is f·h²/12μ, Darcy's, so the same pull moves glycerine a
        thousandth as fast as water. Each is read as the speed it drives the
        *reference* liquid to at the rest gap (the default Thickness, whose
        looks every one of them was tuned on), so the force is k_ref·(that
        speed), A.b.y = ν_ref/ν times this liquid's k₀. On the default
        Thickness that is exactly what it was; on any other the liquid
        answers as its own viscosity says. Before, each was read against
        this liquid's own k₀, which made the force itself scale with the
        liquid's viscosity: the magnet pulled the ferrofluid 45 times harder
        through glycerine than through the default oil, and the oil's
        surface tension moved water no faster than glycerine.
      - **The look's stirring** (vel − mid): Turbulence and the music's swirl
        (the hand stir), Polarity's hold between colours, vorticity
        confinement, and the lasting current (18a-4). These are dials, not
        a phenomenon: a hand or a stick through the layer imposes its own
        motion, which the liquid takes whatever its thickness, so each is
        still read as the speed it drives *this* liquid to at the rest gap,
        k₀·(that speed). Kept as named dials (PLAN §18, "Kept, named as
        dials"); Polarity's becomes a capillary jump and a viscosity
        contrast in 0-fingering.

      And **the glass itself moving** (A.b.zw, Glass Smear): a glass slid
      over the liquid at U drags the column with a shear, linear across the
      gap with nothing pressing, so the column's mean goes at U/2, and the
      gap's drag is then toward U/2, not toward rest:
      ρ∂u/∂t = −∇p + f − (12μ/h²)(u − U/2). Taken with the drag, kΔt·U/2
      into u*, so the liquid reaches half the glass's speed in its drag time
      and holds it at any thickness and any gap, and where the gap changes
      (a press, a domed plate) the flux h·U/2 does not conserve and the
      pressure turns it. It is uniform: a glass is rigid.

      z and w (the heat, and nothing) are taken from after the forces, which
      the lamp warms.
    */
    hsPrep: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var prev: texture_2d<f32>;
@group(0) @binding(4) var mid: texture_2d<f32>;
@group(0) @binding(5) var sq: texture_2d<f32>;
@group(0) @binding(6) var phase: texture_2d<f32>;
@group(0) @binding(7) var hand: texture_2d<f32>;
@group(0) @binding(8) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(9) var<storage, read_write> mob: array<f32>;
@group(0) @binding(10) var species: texture_2d<f32>;
@group(0) @binding(11) var film: texture_2d<f32>;

${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let n = i32(S.n);
  let uf = textureLoad(vel, q, 0);
  let u0 = textureLoad(prev, q, 0).xy;
  let um = textureLoad(mid, q, 0).xy;
  let g = textureLoad(sq, q, 0).r;
  let hw = max(g, 0.004);
  /*
    The ferrofluid's own viscosity (A.b.x, its ratio to the clear liquid's;
    1 with none on the plate). A cell part ferrofluid has the two in its
    column side by side, and the column's drag is their geometric mean by
    share, which takes the ratio smoothly from one liquid to the other
    across the edge. This is what makes a front between them unstable the
    way a real one is (Saffman–Taylor): where the thinner liquid pushes
    the thicker, a bump that runs ahead has less drag in front of it and
    runs further. \`phase\` is 1×1 and empty with none poured.
  */
  let share = clamp(textureLoad(phase, min(q, vec2i(textureDimensions(phase)) - 1), 0).r, 0.0, 1.0);
  /*
    And a poured liquid's own (PLAN 18d, src/lib/liquidProps.ts): the
    species field carries, for the share r of the column that is glycerine,
    syrup, milk or alcohol, Σ share·ln(ν/ν_water) in g. The rest of the
    column is the clear liquid, whose ν is in A.a.x (12ν/W², W the plate's
    width), so the column's viscosity against the clear liquid's is
    exp(g − r·ln(ν_clear/ν_water)), the same geometric mixing by share as
    the ferrofluid's above. Glycerine in the default clear liquid is fifty
    times its drag, so where it lies the flow has to go round it (the
    mobility below carries it into the pressure) and it crawls; alcohol in
    a thick look is a thin patch that the clear liquid's push runs into.
    \`species\` is 1×1 and empty with nothing poured.
  */
  let sp = textureLoad(species, min(q, vec2i(textureDimensions(species)) - 1), 0);
  let filmDims = vec2i(textureDimensions(film));
  let fm = clamp(textureLoad(film, min(q * filmDims / n, filmDims - 1), 0).r, 0.0, 1.0);
  let lnClear = log(max(A.a.x * ${(DISH_METRES * DISH_METRES / 12 / WATER_NU).toFixed(4)}, 1e-6));
  let poured = exp(clamp(sp.g - clamp(sp.r, 0.0, 1.0) * lnClear, -9.0, 9.0));
  // Clear light mineral oil (Drakeol / baby oil / light paraffin, ~50 cSt at 20°C, 50x water):
  // Two layers stacked across a pressure-driven Poiseuille gap (oil thickness fm against one
  // wall, water depth a = 1 - fm against the other, continuous velocity and shear stress at interface).
  const OIL_REL_NU: f32 = 50.0;
  let a_w = 1.0 - fm;
  let B_poiseuille = (1.0 + (OIL_REL_NU - 1.0) * a_w * a_w) / (2.0 * OIL_REL_NU * (1.0 + (OIL_REL_NU - 1.0) * a_w));
  let C_poiseuille = 1.0 / (2.0 * OIL_REL_NU) - B_poiseuille;
  let Q_poiseuille = -a_w * a_w * a_w / 6.0 + OIL_REL_NU * B_poiseuille * a_w * a_w * 0.5
    - (1.0 - a_w * a_w * a_w) / (6.0 * OIL_REL_NU) + B_poiseuille * (1.0 - a_w * a_w) * 0.5
    + C_poiseuille * (1.0 - a_w);
  let filmDrag = 1.0 / max(12.0 * Q_poiseuille, 1e-4);
  /*
    Water's viscosity falls about 2% per K (PLAN §18f).
    Warm liquid is less viscous, reducing drag and increasing mobility M.
  */
  let tempVisc = exp(-0.02 * clamp(uf.z, 0.0, 50.0));
  let kdt = A.a.x / (hw * hw) * A.a.y * pow(max(A.b.x, 1e-6), share) * poured * filmDrag * tempVisc;
  var ustar = u0 + ((um - u0) * A.b.y + (uf.xy - um)) * (A.a.x / (A.a.z * A.a.z) * A.a.y) + A.b.zw * kdt;
  /*
    A hand in the liquid (PLAN 15b, 18a-3): a solid moving through the
    layer, and the liquid it touches moves with it. Brinkman's penalised
    solid: inside the hand the liquid feels a second drag, toward the hand's
    own velocity rather than toward rest, so this cell's implicit update is
    u = (u* + K·Δt·U) / (1 + k·Δt + K·Δt). It is in the solve and not laid
    over the velocity beforehand, because the mobility h·c carries it into
    the pressure: where the hand grips, c is small, so the pressure that
    makes the flow conserve liquid barely moves the liquid there, and the
    liquid round the hand is what gives way (the flow past a moving
    obstacle). Laid over beforehand, as the deltas did, the solve took the
    divergent half of a disc moving through still liquid straight back out,
    and with it nearly all of the push.

    \`hand\` is (Σ χ·U, Σ χ), U in the hands' cells a step (CPU grid), χ how
    much of the cell the hand fills; a cell two hands share takes their mean
    velocity. 1/(S.l·S.disp) turns cells a step into the solver's velocity,
    and the grip K·Δt where χ is 1 is HAND_GRIP over the cell's own drag
    (lib/handSolid.ts). 1×1 and empty with no hand down.
  */
  let hs = textureLoad(hand, min(q, vec2i(textureDimensions(hand)) - 1), 0);
  let chi = clamp(hs.z, 0.0, 1.0);
  // In units of the cell's own drag, so the hand wins over a thick liquid
  // (the ferrofluid's, glycerine's) as surely as over water: a solid's speed
  // does not depend on what it moves through.
  let grip = chi * ${HAND_GRIP.toFixed(1)} * (1.0 + kdt);
  if (grip > 0.0) { ustar += grip * hs.xy / max(hs.z, 1e-6) / max(S.l * S.disp, 1e-9); }
  let c = 1.0 / (1.0 + kdt + grip);
  var mo = hsGap(g, A.a.z) * c;
  /*
    Past the rim the liquid is open to the air: p is held at zero there.
    And on the grid's own edge, which the rim touches at the middle of
    each side: the inscribed circle leaves a strip of cells there, about
    ten either side of the middle on a 192² solver, that were inside the
    rim and walled by the grid. The dish has no wall there, only its open
    rim, and walled, those cells turned every flow across the plate
    sideways: under Plate Rock's cover glass, whose drag moves the whole
    film together, the liquid against the wall went 3.4 times as fast as
    the plate's middle (lab, full rock), the fastest faces on the plate,
    so they and not the film's drift set the carries' substeps (fluid.ts,
    driftCells; PLAN 27a-1).
  */
  let d = uvOf(id) - vec2f(0.5);
  if (length(d) >= A.a.w || q.x == 0 || q.y == 0 || q.x == n - 1 || q.y == n - 1) { mo = -mo; }
  mob[q.x + q.y * n] = mo;
  /*
    Under a hand what is stored is u* + K·Δt·U, which the gradient takes
    back down by c, and at a brisk hand's speed it is past VEL_BOUND: the
    bound cut a hand at five cells a step to 2.8 (\`npm run fingerflow\`).
    So the hand's cells are bounded at what the half float holds instead;
    elsewhere the speed stays held to VEL_BOUND as it was.
  */
  if (grip > 0.0) {
    var o = vec4f(ustar, uf.z, uf.w);
    if (!finite4(vec4f(o.xyz, 0.0))) { o = vec4f(0.0); }
    let sp = length(o.xy);
    if (sp > 60000.0) { o = vec4f(o.xy * (60000.0 / sp), o.z, o.w); }
    o.z = clamp(o.z, -VEL_BOUND, VEL_BOUND);
    textureStore(dst, q, o);
    return;
  }
  textureStore(dst, q, safeVel(vec4f(ustar, uf.z, uf.w)));
}`,

    /*
      The right-hand side, in the units the old projection's divergence used
      (its 4p − Σp = b became Σ M_f (p − p_nb) = b), so the air's terms come
      across unchanged.

      The flux through each face is the mean of the two cells' M·u*, and a
      wall's ghost cell mirrors the normal component so that mean is zero on
      the wall (the old \`velG\`).

      The press is the flux form of the old −(1/h)∂h/∂t: −∂h/∂t itself, since
      the h is in the mobility now, in the rest gap's units and in the flow's
      clock. And it is the gap's own change since the last step, kept here a
      cell at a time in \`gapBefore\`, not the squeeze field's rate. That rate is a
      press's push drawn out over a quarter of a second by \`gapMemory\`
      while the dent itself lands at once, so the liquid it moved was not the
      liquid the glass displaced: integrated, it moved what the memory said,
      whatever the gap did. Read off the gap, what leaves is exactly what the
      glass pushed out, and what the spring lets back in comes back. No plate
      mean is taken off it, because the rim is open: that uniform sink is
      what made a press push nothing in particular.

      The bubbles are the old kernel's two terms, word for word, each already
      averaging to zero; making them physical is §18i.

      A.a = (air push, 1/dt, air cover, h0),
      A.b = (air rate mean, 1/disp, 1 to take the gap as it is without a rate).
    */
    pourVolume: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read_write> poured: array<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let d = length(uvOf(id) - A.a.xy) / max(A.a.z, 1e-6);
  if (d >= 1.0) { return; }
  let k = i32(id.x) + i32(id.y) * i32(S.n);
  poured[k] = poured[k] + clamp((1.0 - d * d) * A.a.w, 0.0, 1.0);
}`,

    hsDivergence: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var air: texture_2d<f32>;
@group(0) @binding(5) var airPrev: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<r32float, write>;
@group(0) @binding(7) var<storage, read> mob: array<f32>;
@group(0) @binding(8) var<storage, read_write> gapBefore: array<f32>;
@group(0) @binding(9) var<storage, read_write> poured: array<f32>;
fn flux(p: vec2i, n: i32) -> vec2f {
  let c = clamp(p, vec2i(0), vec2i(n - 1));
  var w = textureLoad(vel, c, 0).xy * abs(mob[c.x + c.y * n]);
  if (p.x < 0 || p.x > n - 1) { w.x = -w.x; }
  if (p.y < 0 || p.y > n - 1) { w.y = -w.y; }
  return w;
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let n = i32(S.n);
  let div = 0.5 * (flux(p + vec2i(1, 0), n).x - flux(p - vec2i(1, 0), n).x
                 + flux(p + vec2i(0, 1), n).y - flux(p - vec2i(0, 1), n).y);
  let now = clamp(textureLoad(air, p, 0).r, 0.0, 1.0);
  let was = clamp(textureLoad(airPrev, p, 0).r, 0.0, 1.0);
  let rate = clamp((now - was) * A.a.y - A.b.x, -40.0, 40.0);
  // No standing air term: a still bubble pushes nothing (see divergence in wgsl/fluid.ts).
  let g = textureLoad(sq, p, 0).r;
  let k = p.x + p.y * n;
  let dh = select((g - gapBefore[k]) / A.a.w * A.b.y, 0.0, A.b.z > 0.5);
  gapBefore[k] = g;
  /*
    Liquid poured onto the plate since the last step (PLAN 18c, pourVolume):
    a share of the column, so h·share of liquid in rest-gap units, which
    has to go somewhere, so it is a source, as a gap opening is a sink, in
    the same units (per displacement, A.b.y). It pushes the liquid round it
    outward, u_r = Q/(2πrh), and what reaches the open rim leaves. Taken and
    emptied here, as gapBefore is kept here.
  */
  let pour = poured[k] * hsGap(g, A.a.w) * A.b.y;
  poured[k] = 0.0;
  let q = rate * A.a.x - dh + pour;
  var b = -div / S.n + q / (S.n * S.n);
  if (!(abs(b) < 1e30)) { b = 0.0; }
  textureStore(dst, p, vec4f(b, 0.0, 0.0, 0.0));
}`,

    /*
      Red-black Gauss-Seidel on level 0, packed as pressureRedBlack is, with
      the mobility's face coefficients. A.a.x is the parity. A cell past the
      rim is held at zero.
    */
    hsSmooth0: `${HEAD}${COMMON}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
${ROWS0}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let half = n / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let parity = i32(A.a.x);
  let y = i / half;
  let x = 2 * (i % half) + ((y + parity) & 1);
  let mi = mob[x + y * n];
  if (mi < 0.0) { pr[parity * n * half + i] = 0.0; return; }
  let s = hsSums0(x, y, n, mi);
  pr[parity * n * half + i] = select(0.0, (textureLoad(dv, vec2i(x, y), 0).r + s.y) / s.x, s.x > 0.0);
}`,

    /*
      Level 0's residual, summed four fine cells to a coarse one, as
      mgRestrict0 does and for the same reason (b is in cell units, so the
      coarse right-hand side is the sum). Nothing from a cell held at the
      rim's pressure: its equation is p = 0, and it holds.
    */
    hsRestrict0: `${HEAD}${COMMON}
@group(0) @binding(2) var dv: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
@group(0) @binding(5) var<storage, read_write> bc: array<f32>;
${ROWS0}
fn res0(x: i32, y: i32, n: i32) -> f32 {
  let mi = mob[x + y * n];
  if (mi < 0.0) { return 0.0; }
  let s = hsSums0(x, y, n, mi);
  return textureLoad(dv, vec2i(x, y), 0).r - (s.x * pr[hsPacked(x, y, n)] - s.y);
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

    /*
      A coarse level's faces, from the level above it.

      A mobility a cell, each coarse cell's the mean of the four under it,
      is wrong exactly where the physics is: a press floors the gap in a dent
      whose edge is a jump of fifty in mobility, and a coarse cell straddling
      that edge averages it to half open, so the coarse grid sees a leak the
      fine grid does not have.

      So a coarse level keeps a coefficient a face, built as a flux through
      the fine cells would go. Between two coarse centres a row crosses three
      fine faces in series (half of the one inside the first coarse cell, the
      one on the coarse face, half of the one inside the second), so its
      conductance is 1 / (½/f₁ + 1/f₂ + ½/f₃); the two rows the coarse face
      covers are side by side, so theirs add. On an even mobility that is
      the fine coefficient again, which is the old coarse operator; across a
      jump it is the series sum a pipe would give.

      A coarse cell is held at the rim's pressure when any of its four is.
      Its correction goes bilinearly onto the fine cells round it, and a
      coarse cell half past the rim that carries one lays it on the last fine
      cells inside, which the fine sweeps then have to take back off. Held at
      zero, the coarse level carries only the inside's correction and the
      fine sweeps settle the last cell. Measured on a press in a floored dent
      at 128², the flow left after the step that should remove it: 8% with a
      coarse cell held when two of its four were, 1.7% when any was (and it
      diverged when three had to be).


      One kernel for every level: A.a.y is 1 when the level above is level
      0, whose faces are the harmonic means of its cells (\`mf\` read as
      cells, \`ff\` unused), and 0 when it is a coarse level with faces of
      its own. A.a.x is the fine level's size.
    */
    hsCoarsen: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> mf: array<f32>;
@group(0) @binding(3) var<storage, read> ff: array<f32>;
@group(0) @binding(4) var<storage, read_write> mc: array<f32>;
@group(0) @binding(5) var<storage, read_write> fcOut: array<f32>;
// The fine level's face toward +x (axis 0) or +y (axis 1) from (x, y); zero off the grid.
fn fineFace(x: i32, y: i32, axis: i32, n: i32) -> f32 {
  let qx = x + select(0, 1, axis == 0);
  let qy = y + select(0, 1, axis == 1);
  if (!hsIn(qx, qy, n)) { return 0.0; }
  if (A.a.y > 0.5) { return hsHarm(abs(mf[x + y * n]), abs(mf[qx + qy * n])); }
  return ff[axis * n * n + x + y * n];
}
// One row's conductance from a coarse centre to the next: three fine faces in series.
fn series(a: f32, b: f32, c: f32) -> f32 {
  if (b <= 0.0) { return 0.0; }
  return 1.0 / (0.5 / max(a, 1e-20) + 1.0 / b + 0.5 / max(c, 1e-20));
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let nc = n / 2;
  let i = i32(id.x);
  if (i >= nc * nc) { return; }
  let x = 2 * (i % nc);
  let y = 2 * (i / nc);
  let east = series(fineFace(x, y, 0, n), fineFace(x + 1, y, 0, n), fineFace(x + 2, y, 0, n))
           + series(fineFace(x, y + 1, 0, n), fineFace(x + 1, y + 1, 0, n), fineFace(x + 2, y + 1, 0, n));
  let north = series(fineFace(x, y, 1, n), fineFace(x, y + 1, 1, n), fineFace(x, y + 2, 1, n))
            + series(fineFace(x + 1, y, 1, n), fineFace(x + 1, y + 1, 1, n), fineFace(x + 1, y + 2, 1, n));
  fcOut[i] = east;
  fcOut[nc * nc + i] = north;
  let a = mf[x + y * n];
  let b = mf[x + 1 + y * n];
  let c = mf[x + (y + 1) * n];
  let d = mf[x + 1 + (y + 1) * n];
  let nOpen = select(0, 1, a < 0.0) + select(0, 1, b < 0.0) + select(0, 1, c < 0.0) + select(0, 1, d < 0.0);
  mc[i] = select(1.0, -1.0, nOpen >= 1);
}`,

    // Red-black on a row-major coarse level. A.a = (n, parity).
    hsSmooth: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> b: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
@group(0) @binding(4) var<storage, read> cell: array<f32>;
@group(0) @binding(5) var<storage, read> fc: array<f32>;
${ROWS}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let half = (n + 1) / 2;
  let i = i32(id.x);
  if (i >= n * half) { return; }
  let y = i / half;
  let x = 2 * (i % half) + ((y + i32(A.a.y)) & 1);
  if (x >= n) { return; }
  if (cell[x + y * n] < 0.0) { p[x + y * n] = 0.0; return; }
  let s = hsRowSums(x, y, n);
  p[x + y * n] = select(0.0, (b[x + y * n] + s.y) / s.x, s.x > 0.0);
}`,

    // A coarse level's residual, summed down to the next. A.a.x = n.
    hsRestrict: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> p: array<f32>;
@group(0) @binding(3) var<storage, read> b: array<f32>;
@group(0) @binding(4) var<storage, read> cell: array<f32>;
@group(0) @binding(5) var<storage, read> fc: array<f32>;
@group(0) @binding(6) var<storage, read_write> bc: array<f32>;
${ROWS}
fn res(x: i32, y: i32, n: i32) -> f32 {
  if (cell[x + y * n] < 0.0) { return 0.0; }
  let s = hsRowSums(x, y, n);
  return b[x + y * n] - (s.x * p[x + y * n] - s.y);
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

    /*
      The coarse correction brought up, bilinear between cell centres as
      mgProlong does, and never onto a cell held at the rim's pressure. A.a.x
      is the fine level's size.
    */
    hsProlong: `${HEAD}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> p: array<f32>;
@group(0) @binding(4) var<storage, read> m: array<f32>;
fn ec(x: i32, y: i32, k: i32) -> f32 { return e[clamp(x, 0, k - 1) + clamp(y, 0, k - 1) * k]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.a.x);
  let k = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  if (m[i] < 0.0) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  p[i] = p[i] + mix(mix(ec(c0.x, c0.y, k), ec(c0.x + 1, c0.y, k), f.x),
                    mix(ec(c0.x, c0.y + 1, k), ec(c0.x + 1, c0.y + 1, k), f.x), f.y);
}`,

    // The same into level 0's packed pressure.
    hsProlong0: `${HEAD}${COMMON}
@group(0) @binding(2) var<storage, read> e: array<f32>;
@group(0) @binding(3) var<storage, read_write> pr: array<f32>;
@group(0) @binding(4) var<storage, read> mob: array<f32>;
fn ec(x: i32, y: i32, k: i32) -> f32 { return e[clamp(x, 0, k - 1) + clamp(y, 0, k - 1) * k]; }
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(S.n);
  let k = n / 2;
  let i = i32(id.x);
  if (i >= n * n) { return; }
  if (mob[i] < 0.0) { return; }
  let x = i % n;
  let y = i / n;
  let c = (vec2f(f32(x), f32(y)) + 0.5) * 0.5 - 0.5;
  let c0 = vec2i(floor(c));
  let f = c - vec2f(c0);
  let j = hsPacked(x, y, n);
  pr[j] = pr[j] + mix(mix(ec(c0.x, c0.y, k), ec(c0.x + 1, c0.y, k), f.x),
                      mix(ec(c0.x, c0.y + 1, k), ec(c0.x + 1, c0.y + 1, k), f.x), f.y);
}`,

    /*
      The velocity the step ends with: u = c u* − M∇p / h.

      Each face's correction is its own coefficient times the pressure step
      across it, and the cell takes the mean of its two faces on each axis,
      over its own gap. On a plate of one gap and one liquid that is exactly
      c u* − c∇p by central differences, the old gradientSubtract with the
      drag in it; where the gap changes, the face beside a tight cell carries
      what a tight cell can. A face on the grid's wall carries nothing, and a
      neighbour past the rim is at p = 0. A.a.x is h0.
    */
    hsGradient: `${HEAD}${COMMON}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
@group(0) @binding(5) var<storage, read> pr: array<f32>;
@group(0) @binding(6) var<storage, read> mob: array<f32>;
@group(0) @binding(7) var<storage, read_write> seen: array<f32>;
fn pAt(x: i32, y: i32, n: i32) -> f32 {
  if (mob[x + y * n] < 0.0) { return 0.0; }
  return pr[hsPacked(x, y, n)];
}
// The flux correction through the face from this cell toward (dx, dy), as M_f (p_nb − p).
fn face(x: i32, y: i32, dx: i32, dy: i32, n: i32, mi: f32, pi: f32) -> f32 {
  let qx = x + dx;
  let qy = y + dy;
  if (!hsIn(qx, qy, n)) { return 0.0; }
  return hsHarm(mi, abs(mob[qx + qy * n])) * (pAt(qx, qy, n) - pi);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let q = vec2i(id.xy);
  let n = i32(S.n);
  let v = textureLoad(vel, q, 0);
  let mi = abs(mob[q.x + q.y * n]);
  let pi = pAt(q.x, q.y, n);
  // Toward +x the face gives M(p_R − p); toward −x, M(p_L − p), which is minus the gradient's face.
  let gx = face(q.x, q.y, 1, 0, n, mi, pi) - face(q.x, q.y, -1, 0, n, mi, pi);
  let gy = face(q.x, q.y, 0, 1, n, mi, pi) - face(q.x, q.y, 0, -1, n, mi, pi);
  let h = hsGap(textureLoad(sq, q, 0).r, A.a.x);
  let u = (mi * v.xy - 0.5 * S.n * vec2f(gx, gy)) / h;
  textureStore(dst, q, safeVel(vec4f(u, v.z, v.w)));
  /*
    The pressure the rest of the step sees. bodyAdvect, phaseAdvect and
    mixAdvect correct their face velocities with the last projection's
    pressure (Rhie–Chow): the old projection took the wide gradient of p
    from every cell, so they put back the face's compact one in its place.
    This one took (M/h)·∇P, the mobility over the gap, which is the drag's
    c = 1/(1 + kΔt) where the gap is smooth: so the pressure that plays the
    old p's part here is c·P, and that is what they are given. Handing them
    P itself over-corrected by 1/c, a factor of 7 on the thickest liquid;
    c·P is exact where c is flat and never corrects more than P would where
    it is not (c ≤ 1). The solve keeps P in a buffer of its own, so the old
    solver's pressure buffer only ever holds a pressure in its own sense.

    On a thin gap the colour's and the oil's carries, carryCourant and the
    ferrofluid's volume carry no longer read it: they cross the solve's own
    faces from P and the mobility (THIN_FACE in wgsl/fluid.ts, PLAN 15b),
    which are exact where c is not flat, at a hand's rim above all. What
    still reads c·P here is phaseAdvect's area form (Phase Volume off, or
    the step before it is primed) and the old plate's carries.
  */
  seen[hsPacked(q.x, q.y, n)] = select(pi * mi / h, 0.0, mob[q.x + q.y * n] < 0.0);
}`,
  };
}
