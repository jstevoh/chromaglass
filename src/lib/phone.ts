/**
 * The phone: when the app lays itself out for a thumb, and what tilting the
 * phone does to the plate.
 *
 * Pure, with the browser's readings passed in, so `npm run phone` can hold
 * both to their numbers without a phone.
 */

/**
 * The phone layout, or the one it replaces?
 *
 * A phone used to get the laptop's floating overlay squeezed to 390 pixels:
 * two columns pinned to opposite edges covering the whole plate, the tools
 * scrolled out of sight under the bottles, and nothing on screen a thumb
 * could hit at 48 pixels. The show was underneath it somewhere.
 *
 * So a touch screen whose short side is a phone's gets the phone layout: the
 * plate edge to edge, the tools in a dock under the thumb, everything else a
 * sheet away. Two things are required, not one. The pointer must be coarse,
 * because a narrow *laptop* window is still worked with a mouse and keeps the
 * layout the laptop checks measure (`npm run layout` runs at 390 wide with a
 * mouse). And the short side must be a phone's, under 600 CSS pixels, because
 * an iPad is a touch screen with room for the full layout, and in landscape
 * the desks.
 *
 * `?phone` forces it anywhere (a laptop, to try it; the harness), `?phone=0`
 * turns it off, and "Full layout" in the phone's More sheet turns it off for
 * the rest of the visit (`sessionOff`), not for good: a phone that cannot get
 * back to its own layout without typing a URL has lost it.
 */
export const PHONE_SHORT_SIDE = 600;

export function wantsPhoneLayout(env: {
  query: string;
  coarse: boolean;
  width: number;
  height: number;
  sessionOff?: boolean;
  /** The page's path: `/play` is the Play screen on whatever opened it. */
  path?: string;
}): boolean {
  const q = new URLSearchParams(env.query);
  if (q.has('phone')) return q.get('phone') !== '0' && q.get('phone') !== 'false';
  if (env.path && isPlayPath(env.path)) return true;
  if (env.sessionOff) return false;
  return env.coarse && Math.min(env.width, env.height) < PHONE_SHORT_SIDE;
}

/** The session flag "Full layout" sets. */
export const PHONE_OFF_KEY = 'chromaglass-phone-off';

/**
 * Which of the phone's two screens: Play, or every control.
 *
 * The phone layout (PhoneStage) was built so "you can use all modes": ten
 * tools, six sheets, the mixer, the sequencer, the bottles. That is a
 * performer's phone. The owner wants people who are not performers too,
 * someone with a stereo who wants the plate going while they listen, and to
 * them the first screen was a wall of sixteen buttons in jargon (Splat,
 * Streak, Magnet, Mix). Desk v2's design (the owner's, 2026-10-10, screens
 * 3a and 3b) answers that with Play: the plate edge to edge, eight dyes and
 * three hands under the thumb, six sliders, the looks and a clip to share a
 * swipe up, and nothing else.
 *
 * So a phone opens on Play, and "All controls" on its tray opens the full
 * phone layout, remembered on this phone (not for the visit only, as Full
 * layout is: someone who went for every control will want them next time,
 * and Play's own button in the More sheet brings Play back the same way).
 * `/play` is Play on anything, a laptop or an iPad included, which is how a
 * tablet gets it: an iPad keeps the full layout it is laid out for, and
 * someone who wants the listening screen there opens `/play`. `?play=0`
 * and `?play` force the choice (the harness: the checks written against the
 * full phone layout open it with `play=0`).
 */
export type PhoneScreen = 'play' | 'stage';

/** Where the phone's choice of screen is kept, on this phone. */
export const PHONE_SCREEN_KEY = 'chromaglass-phone-screen';

/** `/play`, with or without a trailing slash, under whatever base the site is served from. */
export function isPlayPath(path: string): boolean {
  return /(^|\/)play\/?$/.test(path);
}

export function phoneScreen(env: { query: string; path: string; stored?: string | null }): PhoneScreen {
  const q = new URLSearchParams(env.query);
  if (q.has('play')) return q.get('play') === '0' || q.get('play') === 'false' ? 'stage' : 'play';
  if (isPlayPath(env.path)) return 'play';
  if (env.stored === 'stage' || env.stored === 'play') return env.stored;
  return 'play';
}

/** Below this lean from level the plate lies flat: a hand is never still. */
export const TILT_DEAD_DEG = 5;
/** At this lean from level the plate is fully upright. */
export const TILT_FULL_DEG = 35;

/**
 * Tilt: the phone as the dish. Tip it and the liquid runs downhill.
 *
 * The plate already has the physics: Gravity (`plateUpright`, how far the
 * plate stands up) and Tilt Direction (`tiltDirection`, which edge is down,
 * as a compass on the screen, 0 the top and 90 the right). This only reads
 * the phone into those two, so a tilt is exactly what the Gravity fader does
 * and nothing new in the solver.
 *
 * Measured from `level`, where the phone was held when Tilt was turned on,
 * not from lying flat on a table. Nobody plays a phone flat: held at the
 * usual forty-five degrees, a reading against the table is already half
 * upright toward the bottom edge, and the plate would pour to the bottom the
 * moment Tilt came on and stay there. From the hand's own rest, the plate is
 * flat until the hand moves.
 *
 * And in degrees of the hand's own turn (DeviceOrientationEvent's beta, the
 * top edge coming up, and gamma, the right edge going down), not in how much
 * of gravity lies along the glass. The first draft used gravity's share, and
 * from a forty-five degree rest that is lopsided: tipping the top up by 25°
 * moved the share by 0.23 and tipping it down by 25° by 0.54, so the same
 * turn of the wrist poured twice as hard one way as the other. A turn of so
 * many degrees now tips the plate the same whichever way it goes.
 *
 * `screenAngle` is `screen.orientation.angle`: turned to landscape the
 * device's top is the screen's left or right, so the lean is turned with it
 * into the screen's own axes, the ones the plate is drawn in.
 */
export function tiltReading(
  now: { beta: number; gamma: number },
  level: { beta: number; gamma: number },
  screenAngle = 0,
): { upright: number; direction: number } {
  const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
  const up = wrap(now.beta - level.beta);      // top edge raised: downhill is the bottom
  const right = now.gamma - level.gamma;       // right edge dipped: downhill is the right
  // Downhill in the device's axes (x right, y toward its top), then the screen's.
  const dx = right, dy = -up;
  const a = (screenAngle * Math.PI) / 180;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  const lean = Math.hypot(x, y);
  if (lean < TILT_DEAD_DEG) return { upright: 0, direction: 180 };
  const upright = Math.min(1, (lean - TILT_DEAD_DEG) / (TILT_FULL_DEG - TILT_DEAD_DEG));
  // Screen y counts up here, as the compass does: 0 toward the top.
  const direction = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { upright: Math.round(upright * 100) / 100, direction: Math.round(direction) % 360 };
}
