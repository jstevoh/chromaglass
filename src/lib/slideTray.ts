/*
  The slide tray and the slide mount (PLAN 35g). A look is a 35 mm slide and
  the stage is the projector it is dropped into; loading the next look clicks
  a round tray one slot, as a Kodak Carousel's drum does when the changer
  pushes the slide in the gate back into its slot and lifts the next one down.

  A slide mount is 2 by 2 inches, 50 mm, and the aperture a 24 x 36 mm frame
  shows through is a little smaller than the frame, 22.5 x 34 mm, so the mount
  is square and the picture in it is landscape 3:2. One corner is clipped,
  which is how a slide is told right way up in the dark. The drawing keeps
  those proportions, so the palette on the film sits in the window a real
  slide would show it in.

  A real tray has 80 slots, 4.5 degrees apart, and at 28 px that is a grey
  ring. The drawing has TRAY_SLOTS slots, so one click turns it 36 degrees.
  That is a named shortcut of the picture (PLAN 35g-2), not of any look: the
  tray holds no list, only how many slots it has been turned by.
*/

/** Slots drawn round the tray. A Kodak Carousel has 80; see above. */
export const TRAY_SLOTS = 10;
/** One click of the tray, degrees. */
export const SLOT_DEG = 360 / TRAY_SLOTS;

/** The mount and its aperture, millimetres. */
export const MOUNT_MM = 50;
export const WINDOW_W_MM = 34;
export const WINDOW_H_MM = 22.5;
/** The clipped corner, millimetres along each edge. */
export const NOTCH_MM = 6;

/** The aperture as a fraction of the mount's side. */
export const WINDOW_W = WINDOW_W_MM / MOUNT_MM;
export const WINDOW_H = WINDOW_H_MM / MOUNT_MM;

/**
 * Which way the tray turns for a look change: one slot forward when the look
 * now up stands later in the list than the one before, one back when earlier,
 * none when nothing moved or there is no place to come from or go to (the
 * first look of a session is loaded in the tray, it is not changed to). The
 * changer only ever moves one slot a push, whatever the distance in the list.
 */
export function stepOf(from: number | null, to: number | null): -1 | 0 | 1 {
  if (from === null || to === null || from === to) return 0;
  return to > from ? 1 : -1;
}

/** The angle the drum is turned to after `clicks` pushes, degrees. */
export const trayDeg = (clicks: number): number => clicks * SLOT_DEG;
