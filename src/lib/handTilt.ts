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
 * are that tilt, in the phone's units (−1 to 1 on each axis, full being the
 * phone's full tip), added to the phone's and held within the phone's own reach (`tipPlate`).
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

/** A knob's reading as a tip, −1..1, with the middle level (TILT_DEAD). */
export function knobTip(v: number | undefined): number {
  const x = Number.isFinite(v) ? Math.max(-1, Math.min(1, v as number)) : 0;
  const a = Math.abs(x);
  return a <= TILT_DEAD ? 0 : Math.sign(x) * (a - TILT_DEAD) / (1 - TILT_DEAD);
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
 * Limited by length, not axis by axis. The phone is clamped to ±1 on each
 * axis (`setExternalTilt`), so at most √2 corner to corner; the knobs' share
 * is the same square turned. Clamping each dish axis after the turn would
 * cut a corner tip by up to 29% four times a turn on a spinning dish, and
 * swing its direction by six degrees, so right would stop being the
 * screen's right; a limit on the length is the same at every angle. With
 * the knobs at 0 nothing here reaches the limit, so the phone's tip is what
 * it was.
 */
export function tipPlate(p: TippedPlate, h: Float64Array, swingX: number, swingY: number): void {
  const a = p.plateAngle;
  const c = Number.isFinite(a) ? Math.cos(a) : 1, s = Number.isFinite(a) ? Math.sin(a) : 0;
  let x = h[PHONE_X] + h[0] * c + h[2] * s, y = h[PHONE_Y] - h[0] * s + h[2] * c;
  const l = Math.hypot(x, y);
  if (l > Math.SQRT2) { x *= Math.SQRT2 / l; y *= Math.SQRT2 / l; }
  p.tiltX = swingX * HOLD_TILT + x * 0.0045; p.tiltY = swingY * HOLD_TILT + y * 0.0045;
  p.rockX = swingX + x * 1.1; p.rockY = swingY + y * 1.1;
  p.extTiltX = x; p.extTiltY = y;
}

/** Back to level at once (a new show, a look loaded cold): the knobs' ease forgets where it was. */
export function levelHandTilt(h: Float64Array): void { h.fill(0); }
