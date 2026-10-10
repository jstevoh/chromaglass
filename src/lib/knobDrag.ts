/**
 * How a hand turns a knob on the desk (Desk v2's knob, PLAN.md 8c).
 *
 * The design gives a knob two ways to be turned: "drag up/down (1px = 0.5% of
 * range) or around the ring". The two disagree about the same motion: a hand
 * on the ring's right side moving up is going anticlockwise, which on a ring
 * is down and on a vertical drag is up. So the knob decides once, where the
 * hand takes hold: on the cap (the middle) it is a vertical drag, as it always
 * was; on the ring it follows the hand round, as a real knob does. Both are
 * relative to where the drag began, so taking hold never jumps the value.
 *
 * Pure, so `npm run desk` holds the arithmetic and `npm run layout` the hand.
 */

/** The knob's sweep: 270° from seven o'clock to five o'clock, as it is drawn. */
export const KNOB_SWEEP = Math.PI * 1.5;

/** Travel per pixel of a vertical drag: 0.5% of the range, the design's figure. */
export const KNOB_PX = 0.005;

/**
 * Whether a hold at (x, y) from the knob's centre is on the ring rather than
 * the cap. The cap is drawn at 11 of the knob's 20 radius and the ring at 16,
 * so the line is between them, at 0.65 of the radius.
 */
export const onRing = (dx: number, dy: number, radius: number): boolean => Math.hypot(dx, dy) >= radius * 0.65;

/**
 * How far round the knob a hand moving from `a` to `b` (both from the centre,
 * screen axes, y down) has turned it, as travel: clockwise is up, a full
 * sweep is 1. The step is wrapped to the shorter way round, so a hand crossing
 * the gap at the bottom does not throw the knob a whole turn. Too near the
 * centre the angle is noise, so a step inside a few pixels counts for nothing.
 */
export function ringTravel(a: [number, number], b: [number, number], minRadius = 4): number {
  if (Math.hypot(a[0], a[1]) < minRadius || Math.hypot(b[0], b[1]) < minRadius) return 0;
  let d = Math.atan2(b[1], b[0]) - Math.atan2(a[1], a[0]);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  // atan2 with y down grows clockwise, which is the knob's up.
  return d / KNOB_SWEEP;
}
