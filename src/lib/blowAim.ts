/**
 * Which way a hand's Blow blows, and whether it is the straw (PLAN.md §15c,
 * 15g-11): the hold a press must keep to be a straw, and the direction a
 * moving hand's breath takes and keeps. Plain numbers and one small record a
 * hand, changed in place; the frame loop calls it once a solver step for each
 * hand that blows, the desk's pointer and the phone's fingers alike.
 *
 * The hold's constants and their story moved here from `sim/tools.ts`
 * unchanged; the direction is new.
 */

/*
  A moving Blow on the ferrofluid (PLAN.md §9n) pushes along the way the hand
  last went, for this long after it last moved. Long enough to cover a
  frame's later sim steps (the stroke is nothing on those) and a frame or two
  at 20 fps where the pointer reported no move; short enough that a hand that
  stops and holds is a puff, opening a hole, within a tenth of a second or so
  of stopping, which reads as at once.
*/
export const BLOW_DIR_HOLD_MS = 150;

/*
  And the Blow is a straw only once the hand has been held for that long and
  for this many frames in which the pointer reported no move, counting the
  press itself as a move (PLAN.md §15c).

  The straw used to be "not going": no move within BLOW_DIR_HOLD_MS. Two holes
  in that, and the deploy after #230 fell into one: a Blow drawn across a pool
  lost 54 of its 229 of dye (main's deploy, run 37177982848), the old eraser's
  size of loss, though the wind had run 49 steps and carried 156.5. The
  stroke had also run 5 straw steps, and a straw step blows a real bubble,
  whose air takes the dye under it off the plate (airExclude) for as long as
  the bubble sits there.
  - A press has no move before it, so every step between the press and the
    first move the pointer reports was a straw step: a drag began by blowing
    a bubble in the middle of whatever it was drawn through. At 10 to 30
    frames a second, as the Mac runner draws, that is a frame or two of steps
    before the first move arrives (2, 3, 5 and 7 straw steps on its runs).
  - On a slow frame rate a hand that never stops reports its moves a frame
    apart, and 150 ms is a frame and a half at 10 fps: a drag on a struggling
    machine was a straw every time a move came a frame late.
  So the press starts the hold's clock as a move does, and the hold is both
  the time (a hand on a fast machine still reads as held within a sixth of a
  second) and a few frames with no move in them (a hand on a slow one that is
  moving reports a move every frame, and is not held).
*/
export const BLOW_STRAW_FRAMES = 3;

/**
 * A hand's Blow while it is down: the way it blows (`x`, `y`, a unit vector
 * once it has moved), when it last moved (`at`, the press counting as a
 * move), the frames since with no move (`still`), whether it has moved at
 * all (`moved`), and the point its direction is read from (`ax`, `ay`, below).
 */
export type BlowDir = { x: number; y: number; at: number; still: number; moved: boolean; ax: number; ay: number };

/*
  Which way a Blow blows (PLAN.md 15g-11).

  What was reported (the owner, 2026-11-13): the Blow "doesn't seem to have a
  direction in mind". Two things made it so.
  - The direction was the pointer's last step, one move's worth: three
    quarters of a cell of travel set it afresh, so along a slow stroke it
    swung with every pixel of the hand's wobble, and a stroke at a slant
    read as a staircase of rights and ups.
  - And it lasted only while the hand moved. A hand that slowed to a stop
    mid-stroke became the straw within three frames and blew a bubble where
    it stood (or, off the lead plate, a puff out in every direction), so the
    one thing a person does to blow harder at a spot, hold the breath on it,
    turned the wind off.
  A person blowing has their mouth somewhere and the breath goes from it:
  moving the place it lands does not turn the head at every wobble, and
  stopping the sweep does not stop the air. So the direction is read from a
  point that trails the hand on a leash a footprint long, as a trailer
  follows a car: it is where the hand has come from over its last few
  millimetres, it turns as the stroke turns and not as the pixel does, and
  it stays when the hand stops. On a thin gap the breath then goes on that
  way for as long as the hand is down (`blowAim`); the straw is a press that
  never moved (`blowHeld`), which is how a straw is used, put down and blown.
*/
/** Cells the direction's anchor trails the hand by, on the 128-cell grid the tools were tuned at: the Blow's footprint. */
export const BLOW_LEASH = 4;

/**
 * One solver step of a hand's Blow at (x, y), having moved (dx, dy) cells
 * this step: its BlowDir, made at the press and changed in place after.
 * `firstStep` is the frame's first solver step, which is the one that
 * counts a frame with no move. `leash` is BLOW_LEASH in the plate's cells.
 */
export function blowStep(dir: BlowDir | undefined, x: number, y: number, dx: number, dy: number, now: number, firstStep: boolean, leash: number): BlowDir {
  const still = Math.hypot(dx, dy) < 0.75;
  // The press counts as a move, with no direction; its step starts the frame count at 0 rather than counting itself.
  if (!dir) return { x: 0, y: 0, at: now, still: 0, moved: !still, ax: x - dx, ay: y - dy };
  if (still) { if (firstStep) dir.still++; }
  else { dir.at = now; dir.still = 0; dir.moved = true; }
  if (!dir.moved) return dir;
  const lx = x - dir.ax, ly = y - dir.ay, len = Math.hypot(lx, ly);
  if (len > 1e-6) { dir.x = lx / len; dir.y = ly / len; }
  if (len > leash) { dir.ax = x - dir.x * leash; dir.ay = y - dir.y * leash; }
  return dir;
}

/** The hand moved, or was pressed, within BLOW_DIR_HOLD_MS: the ferrofluid's clock (PLAN.md §9n). */
export const blowGoing = (dir: BlowDir, now: number): boolean => now - dir.at < BLOW_DIR_HOLD_MS;

/** A press held and never moved, for the hold's time and frames: the straw. */
export const blowHeld = (dir: BlowDir, now: number): boolean => !dir.moved && !blowGoing(dir, now) && dir.still >= BLOW_STRAW_FRAMES;

/**
 * Whether the wind has a way to blow: a hand that has moved, for as long as
 * it is down on a thin gap (the breath's air on the film goes on while the
 * breath does); off one, where the wind is still the carries, only until it
 * has stopped for the hold, as it was (a carry repeated on a spot empties it).
 */
export const blowAim = (dir: BlowDir, now: number, thinGap: boolean): boolean =>
  dir.moved && (thinGap || blowGoing(dir, now) || dir.still < BLOW_STRAW_FRAMES);
