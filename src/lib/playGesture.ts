/**
 * Play's hands: what a finger does, read from how it touches.
 *
 * The full phone layout has ten tools and a finger does whatever tool is
 * picked: to blow, pick Blow, then touch. That is an instrument's way, and
 * right for the performer. Play (the owner's Desk v2 design, screen 3a) is
 * for someone listening at home, and its plate is read the way a hand reads
 * a dish of oil: "tap drops · drag streaks · two fingers blow · pinch squeezes ·
 * hold presses", printed over the tray on the first visits. So with Drop on
 * the tray (where Play opens) the touch itself picks the hand:
 *
 *   a tap          a drop of dye where it lands (the dropper)
 *   a drag         a streak: dye smeared along the finger's path and
 *                  carried with it, the bottle's liquid laid under it
 *   two fingers    a breath on the surface under each (Blow, the real breath
 *                  of PLAN 15g), or a pinch (Pinch) once the pair's span
 *                  crosses `PINCH_SPAN` either way: together presses the cover
 *                  glass (`+`), apart lifts (`-`) via `pinchHand(scale)`
 *   a still hold   the cover glass pressed down under the finger (Press)
 *
 * Each is one of the tools the plate already has (with `pinch` driving
 * `FluidSimulation.coverHand` rather than laying dye or wind). It only says
 * which hand the touch is, so the same touch on the full layout with that
 * tool picked does the same thing.
 *
 * Once a touch has become a streak, a press, a blow or a pinch it stays that
 * until every finger is off: a press that drifts a few pixels is still a press
 * and not a streak, lifting one of two blowing fingers does not turn the
 * other into a dropper halfway through a breath, and once a pair has become a
 * pinch it stays a pinch even if the span returns near 1 or one finger lifts.
 * A second finger landing is the exception, turning anything into a blow (or
 * pinch once its span changes past `PINCH_SPAN`).
 *
 * Blow or Press picked on the tray is that hand for every touch, as on the
 * full layout: the reading is only Drop's.
 *
 * On the closeup two fingers are the camera instead (`pinches`): the plate
 * reads a pair there as a pinch, zoom and aim, and lets go of both hands, so
 * a breath handed to it then blows nothing. The hint says "pinch zooms"
 * there, as the design's notes have it.
 *
 * Pure, so `npm run phone` holds it to the hint without a plate.
 */

export type PlayTool = 'dropper' | 'blow' | 'press';
export type PlayHand = PlayTool | 'streak' | 'pinch';

/**
 * Factor by which a two-finger pair's span must widen or narrow from its
 * landing span before the pair stops blowing and becomes a pinch on the
 * cover glass (either `>= PINCH_SPAN` or `<= 1 / PINCH_SPAN`).
 */
export const PINCH_SPAN = 1.2;

/**
 * Map a pinch's span ratio (`now / start`, or trackpad ctrl-wheel scale) to
 * `FluidSimulation.coverHand` in `[-1, 1]`: fingers together (`scale < 1`)
 * presses (`+`), apart (`scale > 1`) lifts (`-`), zero at `1`, odd in
 * `log2(scale)`, square-law gentle near `1` (`<= 0.1` at `1 / PINCH_SPAN`),
 * and saturated to `±1` at `0.5` and `2` (and past them).
 */
export function pinchHand(scale: number): number {
  if (!(scale > 0) || !Number.isFinite(scale) || scale === 1) return 0;
  const u = Math.log2(scale);
  if (u === 0) return 0;
  return -Math.sign(u) * Math.min(1, u * u);
}

/**
 * How far a finger travels, in CSS pixels, before a tap is a drag. A
 * fingertip on glass wanders two or three pixels while it rests and a
 * thumb more; 14 is past the wander and well short of any stroke drawn on
 * purpose (a streak a hand means is a centimetre or more, 40 px and up).
 */
export const DRAG_PX = 14;

/**
 * How long a still finger rests before it is a press: past a tap (a tap is
 * down and up in about 100–200 ms) and under the half second at which a
 * held touch reads as "I am holding this" on every phone's own UI
 * (iOS's long press is 500 ms).
 */
export const HOLD_MS = 450;

export interface Finger {
  /** How far it has gone from where it landed, at most, in CSS pixels. */
  travel: number;
  /** How long it has been down, in milliseconds. */
  ms: number;
}

/**
 * The hand for the fingers now down, given the hand the touch already is
 * (`was`, 'dropper' when a touch begins), what the tray has picked, whether the
 * plate is in closeup zoom (`pinches`), and for a pair, the current span
 * over the landing span (`span`, defaulting to 1).
 */
export function playHand(
  picked: PlayTool,
  was: PlayHand,
  fingers: readonly Finger[],
  pinches = false,
  span = 1,
): PlayHand {
  if (picked !== 'dropper') return picked;
  if (fingers.length === 0) return 'dropper';
  // On the closeup two fingers are the camera, and the plate lets go of both hands for it.
  if (fingers.length >= 2) {
    if (pinches) return was;
    if (was === 'pinch' || (span > 0 && (span >= PINCH_SPAN || span <= 1 / PINCH_SPAN))) return 'pinch';
    return 'blow';
  }
  if (was !== 'dropper') return was;
  const [f] = fingers;
  if (f.travel >= DRAG_PX) return 'streak';
  if (f.ms >= HOLD_MS) return 'press';
  return 'dropper';
}
