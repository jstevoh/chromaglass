/**
 * A Blow's breath on the liquid as air, not a carry (PLAN.md §15g): what the
 * wind lays for the thin gap's body forces to take (hsBody, in
 * src/gpu/wgsl/thinGap.ts).
 *
 * What was there. A moving Blow added a disc of velocity along the stroke,
 * with a pair of counter-rotations at its flanks, and moved the colour, the
 * oil and the ferrofluid by hand-written carries: a take from under the hand
 * and a put a hop ahead (blowDye, blowOil, blowCarry in lib/handCarry.ts),
 * once a reading of the dye. It kept the colour and moved it the right way,
 * and it is not what air on a liquid does. On a thin gap the disc of velocity
 * was also the Finger's old push (lib/handSolid.ts): mostly the divergent
 * part of a flow, which the solve that makes the flow conserve liquid takes
 * straight back out, so it moved the liquid no further than the plate moves
 * it alone, and the carries were all that moved anything.
 *
 * What air blown over a thin layer is. The air moving over the surface drags
 * it with a tangential stress, τ = ½ ρ_air C_f U² along the way the air goes.
 * In a layer this thin the liquid's flow is viscous, so that stress drives a
 * shear across the depth (Couette): the surface goes at τh/μ and the column's
 * mean at τh/2μ, in proportion to the depth and against the liquid's
 * thickness. A deep pool moves more than a thin film under the same breath, a
 * pressed glass's tight gap barely at all, and glycerine a thousandth as fast
 * as water. It is a force, so it lasts as long as the breath does and the
 * liquid answers it over its drag time, and it is on all the liquid, the clear
 * as much as the coloured: air does not know what colour it is blowing on.
 * The colour, the oil and the ferrofluid then go with the flow, carried by
 * the same advection that moves them under the Finger (THIN_FACE), and none
 * of the carries runs.
 *
 * The force is laid here as the stress itself, in pascals, (τx, τy) a cell
 * on the CPU's grid; hsBody turns it into the speed it drives the reference
 * liquid to at the rest gap, τh₀/2μ_ref, which is how every body force on a
 * thin gap is read (hsPrep): the gap's own h then comes in as h/h₀, and this
 * liquid's viscosity against the reference's as hsPrep weighs every body
 * force. Updraft is the same physics spread over the plate (hsBody), a
 * draught where this is a breath.
 *
 * What it leaves out, each a plan item (PLAN.md §15g): the jet's own
 * pressure, ½ρ_air U² where it meets the surface, which presses a dimple and
 * pushes liquid out from under the nozzle (a held puff's ring: it belongs in
 * the gap field the Press squeezes); and the film's surface itself, whose
 * height the solve holds as the gap (a rigid lid), so the liquid a breath
 * pushes ahead piles into no bow wave and the thinning where it hits is not
 * there. A held puff is all pressure and an outward shear, which under a
 * rigid lid is all divergence and moves nothing, so it keeps the carries
 * until the dimple is built.
 */

/*
  The breath, at the surface. Air leaves pursed lips at 10 to 30 m/s when
  one blows to push something, and slows as it spreads; a firm Blow from a
  few centimetres over the dish reaches the liquid at about 8 m/s across
  the tool's footprint (BLOW_RADIUS, 6 mm at the app's 192 cells on a 0.2 m
  dish). C_f is the skin friction of a wall jet at a breath's Reynolds
  numbers (U·r/ν_air about 3×10³), about 0.01. So τ = ½ · 1.2 · 0.01 · 8²
  ≈ 0.38 Pa at the jet's middle, at the tool's default Amount; the Amount
  scales the stress (how hard one blows). On the default liquid in the 6 mm
  middle of the plate that drives the column at τh/2μ ≈ 5 cm/s.

  Why 8 and not the gentler 6 m/s this was first written with: at 6 the
  Mac's `npm run tools` read a stroke moving its pool 0.13% to 0.51% of the
  plate out to the right and 1.15% out to the left (#300), against the
  carries' 1.77% and 1.95% on main: the same Blow at a third of the push it
  had, which a person feels as the tool getting weaker. A breath is not a
  measured number either way (PLAN 15g-6 asks for a recording of one); a
  firm one is the Blow the tool was tuned as, so the air is set to move a
  pool about as far as the carries did, which is how 18a-2 set every look's
  forces when they became forces. In the lab (`npm run airblow`, its pool
  and stroke) 6 m/s moved the pool 1.04%, 8 m/s 2.72% and 10 m/s 5.25%,
  steeper than the stress's U² because a faster film keeps up with the hand;
  the app's slower runner gave the 6 m/s Blow about 0.6 of the lab's.
*/
export const AIR_DENSITY = 1.2;
export const BREATH_SPEED = 8;
export const WALL_JET_FRICTION = 0.01;
export const BREATH_STRESS = 0.5 * AIR_DENSITY * WALL_JET_FRICTION * BREATH_SPEED * BREATH_SPEED;

/**
 * A breath at (x, y) on an L-cell plate, `r` cells in radius, blowing along
 * (dx, dy) at `share` of a default breath's stress, added into `out`
 * (L × L × 4, τx and τy in pascals). The jet's stress falls off from its
 * middle as its speed squared does, (1 − (d/r)²)², smooth to nothing at its
 * edge: a disc of force with a hard rim is a sheet of vorticity at the rim,
 * which no breath has. Cells at the plate's border are left alone, as every
 * tool leaves them. Returns how many cells it touched.
 */
export function layBreath(out: Float32Array, L: number, x: number, y: number, r: number, dx: number, dy: number, share = 1): number {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6) || !(r > 0) || !(share > 0)) return 0;
  const ux = dx / len, uy = dy / len;
  const tau = BREATH_STRESS * share;
  let cells = 0;
  const reach = Math.ceil(r);
  const cx = Math.round(x), cy = Math.round(y);
  for (let j = -reach; j <= reach; j++) {
    for (let i = -reach; i <= reach; i++) {
      const nx = cx + i, ny = cy + j;
      if (nx <= 0 || nx >= L - 1 || ny <= 0 || ny >= L - 1) continue;
      const s = 1 - Math.hypot(nx - x, ny - y) ** 2 / (r * r);
      if (s <= 0) continue;
      const k = (nx + ny * L) * 4;
      out[k] += tau * s * s * ux;
      out[k + 1] += tau * s * s * uy;
      cells++;
    }
  }
  return cells;
}
