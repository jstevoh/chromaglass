/*
  The two reels on the Record button (PLAN 35f). Tape runs past the heads at
  one speed, so a reel's turn rate is that speed over the radius of tape on it
  (omega = v / r): the supply reel, full at the start, turns slowly and speeds
  up as it empties; the take-up reel starts as a bare hub, turns fast and
  slows as it fills. The numbers are a compact cassette's: 4.76 cm/s past the
  head, a hub 0.9 cm in radius, a full pack 2.1 cm.

  The tape on a reel is a roll of constant thickness, so the pack's area (not
  its radius) grows with the length wound on: r^2 = hub^2 + (full^2 - hub^2) f,
  where f is the fraction of the tape that is on the reel. Wound at one speed
  that fraction is linear in time, so the radius is a square root of time and
  the angle a reel has turned through, the integral of v / r, has a closed
  form. That is what makes the button stateless: the angle at `seconds` is a
  function of `seconds`, drawn with a one-second linear transition, with no
  rAF loop and nothing to drift.

  A take is not a tape with an end. A recording longer than TAPE_SECONDS
  leaves the take-up reel full and still turning at v / full (the supply is
  bare and the tape would have run out; the picture keeps turning rather than
  stopping a recording that has not stopped).
*/

/** Tape speed past the head, cm/s (a compact cassette). */
export const TAPE_CM_PER_S = 4.76;
/** The bare hub's radius and a full pack's, cm. */
export const HUB_CM = 0.9;
export const FULL_CM = 2.1;
/** A tape's worth of take: a C60 side is 30 minutes, the picture's reel fills in ten, so a long take visibly fills it. */
export const TAPE_SECONDS = 600;

/** Radius of tape on a reel holding fraction `f` (0 bare, 1 full) of the tape, cm. */
export function packRadius(f: number): number {
  const c = Math.max(0, Math.min(1, f));
  return Math.sqrt(HUB_CM * HUB_CM + (FULL_CM * FULL_CM - HUB_CM * HUB_CM) * c);
}

/** How much of the tape has been wound onto the take-up reel after `seconds`. */
export const woundFraction = (seconds: number): number => Math.max(0, Math.min(1, seconds / TAPE_SECONDS));

export interface Reels {
  /** Pack radius of the supply (left) and take-up (right) reels, cm. */
  supplyR: number;
  takeupR: number;
  /** Turn rates now, rad/s: v / r. */
  supplyOmega: number;
  takeupOmega: number;
  /** Angle each reel has turned through since the start, degrees. */
  supplyDeg: number;
  takeupDeg: number;
}

/**
 * Both reels after `seconds` of recording. The angle is the integral of v / r
 * over the winding, exact while the tape lasts and linear at the last radius
 * after it (see the note above).
 */
export function reelsAt(seconds: number): Reels {
  const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const f = woundFraction(s);
  const supplyR = packRadius(1 - f);
  const takeupR = packRadius(f);
  const v = TAPE_CM_PER_S;
  const span = FULL_CM * FULL_CM - HUB_CM * HUB_CM;
  const b = span / TAPE_SECONDS;               // d(r^2)/dt on the take-up, cm^2/s
  const t = Math.min(s, TAPE_SECONDS);
  // integral of v / sqrt(a + b t) dt = (2 v / b) (sqrt(a + b t) - sqrt(a))
  const take = (2 * v / b) * (takeupR - HUB_CM);
  const sup = (2 * v / b) * (FULL_CM - supplyR);
  const extra = s - t;                          // past the end of the tape
  const toDeg = 180 / Math.PI;
  return {
    supplyR, takeupR,
    supplyOmega: v / supplyR,
    takeupOmega: v / takeupR,
    supplyDeg: (sup + extra * v / supplyR) * toDeg,
    takeupDeg: (take + extra * v / takeupR) * toDeg,
  };
}
