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
  scales the stress (how hard one blows).

  Why 14 m/s and not the 8 this was tuned at (PLAN 38r). The column goes at
  τh/2μ, as the gap: the 6 mm plate the Blow was tuned on took 8 m/s
  (0.38 Pa) to 5 cm/s, and the 2 mm sandwich the plate is now takes the
  same breath to 1.7 cm/s, a third of the push, which is the "tool getting
  weaker" of the paragraph below over again. The breath is the same kind
  of number it was, a firm breath set by how far it moves a pool and not a
  measurement (15g-6), so it is set where it moves the 2 mm film as it
  moved the 6 mm one: the stress three times over, the speed √3 of it,
  14 m/s, 1.18 Pa, 5.3 cm/s on the default liquid. That is a firm breath
  from closer, a couple of centimetres rather than a few, inside what lips
  blow at. The straw's volume is a share of a firm breath's and does not
  move with it (the wind's bubbles, which did, are gone: below).

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
export const BREATH_SPEED = 14;
export const WALL_JET_FRICTION = 0.01;
export const BREATH_STRESS = 0.5 * AIR_DENSITY * WALL_JET_FRICTION * BREATH_SPEED * BREATH_SPEED;

/*
  Where the breath's stress lands: a jet along the surface, not a disc under
  the pointer (PLAN.md 15g-11).

  What was reported (the owner, 2026-11-13, on Foam Cells at the desk): the
  Blow "doesn't blow across the surface like I would expect (unless you're
  blowing hard), it doesn't seem to have a direction in mind". What was
  there: the stress above laid on a disc the tool's radius across (6 mm on
  the 0.2 m dish) under the pointer, for the steps the pointer was over it.
  A hand crossing the plate in a second is over any one cell for a fortieth
  of a second, in which a film going at 5 cm/s goes a millimetre; and the
  moment the hand paused the breath stopped (it became the straw). So the
  air touched only what was under the pointer and nothing ahead of it,
  which is a finger's footprint and not a breath's.

  What a breath on a dish is. Air from the lips or a straw meets the liquid
  at a slant and turns along it: a wall jet, which runs on over the surface
  long after the place it landed, spreading sideways and slowing as it
  goes. Measured wall jets from a round nozzle (Launder and Rodi, "The
  turbulent wall jet: measurements and modeling", Annu. Rev. Fluid Mech. 15,
  1983, and the three-dimensional jets they collect) keep the nozzle's speed
  for the jet's first few diameters (its core), then lose it as one over the
  distance, U_m ∝ 1/s, while the half-width across the flow grows as about
  0.21 of the distance, five times faster than the jet thickens off the
  wall. The stress on the liquid goes as the speed squared, so it holds for
  the core and then falls as 1/s², and its half-width (the speed's over √2)
  grows as 0.15 s.

  So the stress is laid as that plume: full over the place the breath lands
  (the tool's footprint, as it was: a half-width of 0.54 of the radius is
  the old disc's), full for a core five radii long (3 cm: the lips a couple
  of centimetres back and the jet's six diameters), then τ₀/(1 + (s/s_c)²)
  along the way it blows with a Gaussian across it whose half-width is
  0.54 r + 0.15 s. Behind the landing it falls off as the footprint does. It
  is laid down to a twentieth of the middle's stress, 22 radii out (13 cm),
  brought smoothly to nothing there, since a force with a hard edge is a
  sheet of vorticity no breath has. What it leaves out is still 15g-2's
  (the jet's pressure and its dimple) and 15g-3's (the free surface).

  Measured in the lab (`npm run airblow`, software WebGPU), the disc
  against the jet: under a held breath the liquid ran 19.62 and runs 31.84
  mm/s (0.37 and 0.61 of τh/2μ: a patch of stress drives the liquid under
  it against the pressure that sends it back round, and a long patch has a
  longer way round); a palm on (ten footprints) 0.12 and 8.82 mm/s; as far
  behind 0.12 and 0.86.
*/
/** The jet's core, in footprint radii: how far along the surface it keeps the speed it landed with. */
export const JET_CORE = 5;
/** How fast the stress's half-width grows along the jet: a wall jet's 0.21 for the speed, over √2. */
export const JET_SPREAD = 0.15;
/** The stress's half-width where the breath lands, in footprint radii: the old disc's, (1 − q²)² = ½. */
export const JET_LANDING = 0.54;
/** The share of the middle's stress under which the plume is not laid. */
export const JET_FLOOR = 0.05;
/** How far along the surface the plume is laid, in footprint radii: where its axis falls to JET_FLOOR. */
export const JET_REACH = JET_CORE * Math.sqrt(1 / JET_FLOOR - 1);

/**
 * How much of the middle's stress a breath landing at the origin and blowing
 * along +s lays at (s, t), in footprint radii: the plume above, 1 at the
 * landing, 0 past its edge. `npm run airblow` holds layBreath to it.
 */
export function jetShare(s: number, t: number): number {
  let a: number, w: number;
  if (s <= 0) { a = Math.exp(-Math.LN2 * (s * s) / (JET_LANDING * JET_LANDING)); w = JET_LANDING; }
  else { const q = s / JET_CORE; a = 1 / (1 + q * q); w = JET_LANDING + JET_SPREAD * s; }
  const v = a * Math.exp(-Math.LN2 * (t * t) / (w * w));
  return v <= JET_FLOOR ? 0 : (v - JET_FLOOR) / (1 - JET_FLOOR);
}

/**
 * A breath landing at (x, y) on an L-cell plate with a footprint `r` cells in
 * radius, blowing along (dx, dy) at `share` of a default breath's stress,
 * added into `out` (L × L × 4, τx and τy in pascals) as the jet's plume
 * (jetShare). Cells at the plate's border are left alone, as every tool
 * leaves them. `rows`, when given, is told the rows it wrote (lib/deltaRows.ts).
 * Returns how many cells it touched.
 */
export function layBreath(out: Float32Array, L: number, x: number, y: number, r: number, dx: number, dy: number, share = 1,
  rows?: { add(y0: number, y1: number): void }): number {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-6) || !(r > 0) || !(share > 0)) return 0;
  const ux = dx / len, uy = dy / len;
  const tau = BREATH_STRESS * share;
  // The plume's box: a footprint behind the landing, its reach ahead, and as wide as its far end is.
  const back = 2.1 * JET_LANDING * r, ahead = JET_REACH * r;
  const side = 2.1 * (JET_LANDING + JET_SPREAD * JET_REACH) * r;
  const ax = x - ux * back, ay = y - uy * back, bx = x + ux * ahead, by = y + uy * ahead;
  const ex = Math.abs(uy) * side, ey = Math.abs(ux) * side;
  const x0 = Math.max(1, Math.floor(Math.min(ax, bx) - ex)), x1 = Math.min(L - 2, Math.ceil(Math.max(ax, bx) + ex));
  const y0 = Math.max(1, Math.floor(Math.min(ay, by) - ey)), y1 = Math.min(L - 2, Math.ceil(Math.max(ay, by) + ey));
  let cells = 0, lo = L, hi = -1;
  for (let ny = y0; ny <= y1; ny++) {
    for (let nx = x0; nx <= x1; nx++) {
      const px = (nx - x) / r, py = (ny - y) / r;
      const w = jetShare(px * ux + py * uy, py * ux - px * uy);
      if (w <= 0) continue;
      const k = (nx + ny * L) * 4;
      out[k] += tau * w * ux;
      out[k + 1] += tau * w * uy;
      cells++;
      if (ny < lo) lo = ny;
      if (ny > hi) hi = ny;
    }
  }
  if (cells > 0) rows?.add(lo, hi);
  return cells;
}

/*
  The air the wind puts into the liquid: none (PLAN.md 15g-12).

  What was there (PLAN.md QA-20). A moving Blow laid bubbles as it went: two
  on every sixth step at first, whatever the Amount, then at a rate that
  began past the speed at which a gas jet tears a liquid's surface (the
  blowing number N_B = ρ_air U² / (2 √(ρ g σ)) past 1, about 5.4 m/s on the
  plate's oil; Subagyo, Brooks, Coley and Irons, ISIJ International 43,
  2003), ten spawns of two a second at the default Amount. What it did on
  the plate (the owner, 2026-11-13: "the bubble spawning is weird at best";
  filmed on a Mac on Foam Cells): three strokes and two held breaths, nine
  seconds of blowing, left about a hundred bubbles over the plate, each a
  hole in the colour, and nothing a person watching a breath cross a dish
  has seen.

  Why none. The blowing number's threshold is where a jet on a deep bath
  starts to throw droplets up off the surface: splashing, which is liquid
  going into the air and not air into the liquid. Air gets under a surface
  when the surface folds over it, a wave that breaks or a jet that plunges,
  and both need depth to fold into. The plate's film is 2 mm, about the
  liquid's own capillary length (√(σ/ρg), 1.9 mm for the oil), and a firm
  breath's dynamic pressure where it lands, ½ρ_air U² = 118 Pa at 14 m/s,
  is six times the weight of the whole film under it (ρ g h = 17 to 20 Pa):
  the film is pressed aside down toward the glass (the dimple, 15g-2) long
  before a wave on it could break. So a breath over the film drags it and
  dents it and folds no air in, at any Amount. Bubbles come from air let
  out under the liquid, which is what the straw does (a press held still:
  bubbles.ts, blow), and from the looks and the kicks that lay their own.

  The Amount is the breath's speed against a firm breath's (the stress goes
  as its square, which is why the hands pass share = Amount²): so a straw's
  breath, a volume a second through the straw, goes as the speed, √share.
*/

/** The breath's speed at the surface, m/s, at `share` of a default breath's stress (the stress goes as U²). */
export const breathSpeed = (share: number): number => BREATH_SPEED * Math.sqrt(Math.max(0, share));

/** A breath's dynamic pressure where it lands, in pascals, at `share` of a default breath's stress: ½ρ_air U². */
export const breathPressure = (share: number): number => 0.5 * AIR_DENSITY * breathSpeed(share) ** 2;

/**
 * Seconds a remote hand's breath goes on after its last message (PLAN.md
 * 15g-5).
 *
 * A remote hand's wind (the phone's pad, a game controller, the assistant)
 * kept the old carries, a take from under the hand and a put a hop ahead,
 * after the pointer's became air on the film, because its strokes arrive a
 * message at a time, a few a second, and a breath laid only on the steps a
 * message landed would push the liquid for one step in every few. So its
 * breath is held between messages: each one says where it lands and which
 * way it blows, and the solver's step lays it (FluidSimulation, breatheHeld)
 * until the next arrives or this long has gone by with none, which is the
 * hand having stopped. A phone's pad sends a stroke's moves ten to thirty a
 * second and a controller's stick sixty, so a quarter of a second is two
 * messages missed at the slowest, and short enough that a finger lifted
 * reads as the breath stopping. One breath a plate: two remotes blowing the
 * same plate at once take turns at it (PLAN.md 15g-13).
 */
export const REMOTE_BREATH_HOLD = 0.25;

/** A remote hand's breath as it is held: where it lands, its footprint, its way, its share of a full breath, and the seconds it has left. */
export type HeldBreath = { x: number; y: number; r: number; dx: number; dy: number; share: number; left: number };

/** A remote hand's message of a moving Blow: the breath it is to hold until the next one, or for REMOTE_BREATH_HOLD. */
export function holdBreath(h: HeldBreath, x: number, y: number, r: number, dx: number, dy: number, share: number): void {
  h.x = x; h.y = y; h.r = r; h.dx = dx; h.dy = dy; h.share = share; h.left = REMOTE_BREATH_HOLD;
}

/**
 * One solver step of a held breath: lays its jet (layBreath) while it has
 * time left, and returns the stress laid. `airs` is whether the plate still
 * takes a breath as air (a thin gap on the GPU); a plate that has stopped
 * doing so drops the breath rather than keep it for when it does again.
 */
export function breatheHeld(h: HeldBreath, out: Float32Array, L: number, dt: number, airs: boolean,
  rows?: { add(y0: number, y1: number): void }): number {
  if (!(h.left > 0)) return 0;
  h.left = airs ? h.left - dt : 0;
  return airs ? layBreath(out, L, h.x, h.y, h.r, h.dx, h.dy, h.share, rows) : 0;
}

/** A straw's breath, the volume a second it blows against a default breath's: the speed, √share. */
export const strawFlow = (share: number): number => Math.sqrt(Math.max(0, share));
