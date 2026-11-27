/**
 * The flat plate tipped by a hand: the remote phone's tilt and the two Tilt
 * knobs (`plateTiltX`, `plateTiltY`, PLAN 18a-13m), as one tilt the frame
 * loop hands the solver.
 *
 * What was asked (the owner, 2026-11-15): to tilt the plate from the MIDI
 * controller, on two knobs. The plate already had two tilts, and they are
 * not the same thing:
 *
 *  - Gravity and Tilt Direction (`plateUpright`, `tiltDirection`) stand the
 *    plate up. Past a thousandth of the way up the solver treats it as a
 *    sealed bottle with a lamp under its floor (gpu/fluid.ts, PLAN 27f-9):
 *    what is heavy goes round inside the wall and the floor warms the wax.
 *    That is Lava Lamp's whole picture, and the Tip pad and the phone's own
 *    Tilt write those two.
 *  - The hand's tip of the flat dish on the projector: the remote phone's
 *    tilt (`setExternalTilt`), and the music's Plate Rock beside it. On a
 *    thin gap that is the colour's weight down the tipped plate, Darcy's
 *    g·sinθ·Δρ·h²/12μ (hsBody, ROCK_FALL, gpu/fluid/constants.ts), so heavy
 *    dye slides to the low edge and light oil rises the other way (oil
 *    lift, PLAN 27f-5); the cover glass slides on its film as far as Frame
 *    Sway lets it, and the dish sloshes as far as Slosh lets it (lib/slosh.ts
 *    takes it as the held phone's).
 *
 * A knob on a controller is the second: a hand on the projector's glass,
 * nudging it one way and back while the plate stays flat. So the two knobs
 * are that tilt, in the phone's units (1 being the phone's full tip on an
 * axis), added to the phone's (`tipPlate`). A full turn reaches past the
 * phone's, to Plate Rock's strong swing (`KNOB_ROCK`, `knobTip`, PLAN 18a-13n).
 * Nothing new in the solver, which is the rule: the knob moves the plate the
 * way a hand on it would, and the physics does the rest.
 *
 * Signs as the screen's (+x its right, +y its top, as Tilt Direction's
 * compass is): turn Tilt Left/Right up and the right edge dips and the colour
 * runs right; turn Tilt Up/Down up and the top edge dips and it runs up.
 *
 * And turned into the dish. The rock reaches the solver in the dish's own
 * axes, and on many looks the dish turns (Rotation, Auto Spin, a flick;
 * twenty-nine when the Tip pad was built), so a tip handed over as it stands would run the colour toward
 * wherever the dish's right had turned to: the reason the Tip pad writes
 * Gravity and not this path (PLAN 18a-13j, 18a-13e). The hand is on the
 * projector's glass, the stage's and not the dish's, so the knobs' tip is
 * turned back by the dish's angle exactly as `downhill()` turns Tilt
 * Direction (sim/fluidSimulation.ts), each layer by its own. The remote phone's is left as it was
 * (18a-13e, 18a-13k: its sign is not yet checked on a phone).
 */
import { HOLD_TILT } from './plateRock';

/**
 * A knob left at its middle is not exactly level. A 7-bit CC's middle is 64
 * of 0–127, which over −1..1 reads 0.008, and a detent-less knob put back
 * by hand lands a step or three either side: held there for a song, a
 * 0.02 tip slides a pool of heavy dye a few cells a minute toward one edge,
 * and the plate drains to it by the end of the set. So the middle twenty-
 * fifth of the travel is level, and the rest is stretched to keep the ends
 * where they were. The phone's own Tilt has the same idea in degrees
 * (TILT_DEAD_DEG, lib/phone.ts).
 */
export const TILT_DEAD = 0.04;

/**
 * How fast the plate follows the knob, rad/s: a critically damped hold, so
 * a step of the knob is the plate eased there, not jerked.
 *
 * A CC arrives in steps of 1/127 of the travel, and a knob turned quickly
 * sends one every few milliseconds, then nothing. Taken raw, each step is a
 * step in the plate's sinθ; on the thin gap that is only a step in the body
 * force, which the liquid's own drag rounds off, but the slosh dish and the
 * cover glass are tipped by it too, and a twist of the wrist read as a dozen
 * small knocks. A real plate under a hand is a mass that the hand speeds up
 * and slows down, which is what a critically damped follower is: the tilt
 * and its rate both continuous, no overshoot past where the knob stopped.
 * 12 rad/s puts the plate two thirds of the way in 0.18 s and nine tenths
 * in 0.33 s, about a hand's own reach (Plate Rock's lean takes 0.2 s,
 * lib/plateRock.ts), so the knob still feels like it is in the hand.
 */
export const TILT_FOLLOW = 12;

/**
 * How far a full knob tips the plate, as the rock it hands the solver: 2,
 * the swing of Plate Rock's strong kick at the top of its dial (a lean of
 * ROCK_LEAN 0.55 × the dial's 3, and the sway on it, lib/plateRock.ts).
 *
 * What was asked (PLAN 18a-13n; the owner, 2026-11-26, "Keep going" on the
 * knobs): the knobs shipped (18a-13m) reaching only the remote phone's full
 * tip, rock 1.1, sinθ about 0.27 with the hold beside it, while Plate Rock
 * at the top of its dial tips it further than that on every strong beat. Two knobs on a controller
 * are the hand that should reach furthest, not least. A phone held flat on
 * a table is tipped by a wrist through its whole range at about fifteen
 * degrees; the projectionist's hand on the clock glass can lift one side
 * as far as the liquid stays between the glasses, which is where Plate
 * Rock's strong kick already takes it on a show.
 *
 * Same law, further along it: the thin gap's Darcy slide g·sinθ·Δρ·h²/12μ
 * (hsBody, ROCK_FALL) is linear in sinθ, so a full knob slides a pool of
 * heavy dye 2/1.1 as fast as the phone's full tip, and the oil lifts and the
 * cover glass slides in step (to the rim's room, COVER_ROOM, where it stops
 * as it always has). The plate's sinθ at a full knob is 0.48 (plateSin, the
 * rock × CUR_ROCK and the hold × 10), Plate Rock's own at that swing, about
 * 29 degrees: steep for a dish, which is what the top of a knob is for
 * (every dial gentle to extreme, PLAN 27h), and no further than the solver
 * already takes from the music every strong beat.
 */
export const KNOB_ROCK = 2;
/** The phone's rock for its full tip on an axis (× 1.1 since PLAN 27a), which `tipPlate` multiplies every hand's tip by. */
export const PHONE_ROCK = 1.1;
/** A full knob's tip, in the phone's units: the reach that makes its rock KNOB_ROCK. */
export const KNOB_REACH = KNOB_ROCK / PHONE_ROCK;

/**
 * A knob's reading (−1..1) as a tip in the phone's units, with the middle
 * level (TILT_DEAD) and the ends at ±KNOB_REACH.
 *
 * Bent, not stretched. Stretching the travel straight to 1.82 would make
 * every CC step near the middle 1.82 times as big, and the middle is where
 * a performer lays a slow drain across a song: a tip of 0.02 already slides
 * heavy dye a few cells a minute. So the tip is u(1 + (R − 1)u) over the
 * travel u past the dead band: its slope at level is 1, the same fine steps
 * the knob had (and the phone has), and it bends up to R at the end. Half
 * way from its middle to its end the knob is two thirds of the phone's full
 * tip, at 0.65 of the way it is the phone's full tip, and the rest is past it. Monotone all the way
 * (its slope 1 + 2(R − 1)u never goes below 1), so no step of the knob
 * tips the plate back.
 */
export function knobTip(v: number | undefined): number {
  const x = Number.isFinite(v) ? Math.max(-1, Math.min(1, v as number)) : 0;
  const a = Math.abs(x);
  if (a <= TILT_DEAD) return 0;
  const u = (a - TILT_DEAD) / (1 - TILT_DEAD);
  return Math.sign(x) * u * (1 + (KNOB_REACH - 1) * u);
}

/**
 * The hand's state, kept by the frame loop and handed back every step: the
 * knobs' eased tip and its rate on each axis (the screen's), then the remote
 * phone's tilt as faded this step. Plain numbers, no per-step objects.
 */
export const PHONE_X = 4, PHONE_Y = 5;
export function makeHandTilt(): Float64Array { return new Float64Array(6); }

/**
 * One step of the hand: eases the knobs' tip toward where the knobs are, and
 * fades the phone's.
 *
 * `ext` is the remote phone's last reading and `nowS` the show clock in
 * seconds: the phone's tilt fades out a couple of seconds after its last
 * reading, so a dropped link leaves the plate level, not tipped for good.
 */
export function stepHandTilt(
  h: Float64Array, ext: { x: number; y: number; at: number }, nowS: number,
  knobX: number | undefined, knobY: number | undefined, dt: number,
): void {
  const age = nowS - ext.at;
  const k = age < 2.5 ? 1 - Math.max(0, age - 1.5) : 0;
  const t = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
  // The exact step of x'' = −2ωx' − ω²(x − target), so no step is too long for it.
  const w = TILT_FOLLOW, e = Math.exp(-w * t);
  for (let a = 0; a < 2; a++) {
    const d = h[a * 2] - knobTip(a === 0 ? knobX : knobY), v = h[a * 2 + 1];
    const c = v + w * d;
    h[a * 2] -= d - (d + c * t) * e;
    h[a * 2 + 1] = (v - w * c * t) * e;
  }
  h[PHONE_X] = ext.x * k;
  h[PHONE_Y] = ext.y * k;
}

/** What `tipPlate` sets on a plate's solver (FluidSimulation's fields of the same names). */
export interface TippedPlate {
  plateAngle: number;
  tiltX: number; tiltY: number; rockX: number; rockY: number; extTiltX: number; extTiltY: number;
}

/**
 * Hands one plate its tip for the step: the hand's (the phone's and the
 * knobs', the knobs' turned into this plate's own dish by its `plateAngle`,
 * as `downhill()` turns Tilt Direction) joined to Plate Rock's swing. The
 * hold's tilt, the rock (× 1.1, the phone's reach since PLAN 27a) and the
 * slosh's held tilt are what the frame loop gave each plate before; each
 * layer turns on its own (Rotation is per layer), so each is turned apart.
 *
 * Limited by length, not axis by axis. The knobs reach ±KNOB_REACH on
 * each axis, so at most KNOB_REACH·√2 corner to corner, and the phone and
 * the knobs together are held to that, the knobs' own corner (the phone
 * alone, clamped to ±1 an axis by `setExternalTilt`, is √2 at most and
 * never meets it). Clamping each dish axis after the turn would cut a
 * corner tip by up to 29% four times a turn on a spinning dish, and swing
 * its direction by six degrees, so right would stop being the screen's
 * right; a limit on the length is the same at every angle. With the knobs
 * at 0 nothing here reaches the limit, so the phone's tip is what it was.
 *
 * The slosh's held tilt (`extTiltX`, lib/slosh.ts sloshAccel) stays within
 * the phone's reach, √2: the dish's slop is a named shortcut that holds its
 * Courant limit only up to the Slosh dial's own lean, a unit an axis
 * (sloshAccel clamps there), so past the phone's tip the dish slops no
 * further and the thin gap's slide, the oil and the cover take the rest.
 * Scaled by length for the same reason as above.
 */
const KNOB_CORNER = KNOB_REACH * Math.SQRT2;
export function tipPlate(p: TippedPlate, h: Float64Array, swingX: number, swingY: number): void {
  const a = p.plateAngle;
  const c = Number.isFinite(a) ? Math.cos(a) : 1, s = Number.isFinite(a) ? Math.sin(a) : 0;
  let x = h[PHONE_X] + h[0] * c + h[2] * s, y = h[PHONE_Y] - h[0] * s + h[2] * c;
  let l = Math.hypot(x, y);
  if (l > KNOB_CORNER) { x *= KNOB_CORNER / l; y *= KNOB_CORNER / l; l = KNOB_CORNER; }
  p.tiltX = swingX * HOLD_TILT + x * 0.0045; p.tiltY = swingY * HOLD_TILT + y * 0.0045;
  p.rockX = swingX + x * PHONE_ROCK; p.rockY = swingY + y * PHONE_ROCK;
  const e = l > Math.SQRT2 ? Math.SQRT2 / l : 1;
  p.extTiltX = x * e; p.extTiltY = y * e;
}

/** Back to level at once (a new show, a look loaded cold): the knobs' ease forgets where it was. */
export function levelHandTilt(h: Float64Array): void { h.fill(0); }
