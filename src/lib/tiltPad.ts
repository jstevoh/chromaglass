/**
 * The tilt pad: a joystick for Gravity and Tilt Direction.
 *
 * The plate's tilt is two numbers (PLAN 18a): Gravity (`plateUpright`, how far
 * the plate stands up, 0 to 1) and Tilt Direction (`tiltDirection`, which edge
 * is down, as a compass on the screen: 0 the top, 90 the right, 180 the
 * bottom). The phone's motion sensor reads itself into exactly those two
 * (`tiltReading` in lib/phone.ts) and a mouse had only two faders to do the
 * same with, which is not a tilt: nobody tips a dish by setting its lean, then
 * its compass bearing. A disc is the natural shape for a pair of numbers that
 * are a length and a bearing. Put the puck where the liquid should run: the
 * distance from the middle is how steeply the plate is tipped and the side it
 * is on is the low side, the way tipping a phone to the right drags the liquid
 * to the right.
 *
 * Level is the middle, not a place on the edge. Inside a small dead ring the
 * plate is flat (a hand on a trackpad is never still, as the phone's
 * `TILT_DEAD_DEG` says of a wrist), and from its edge Gravity rises linearly
 * to 1 at the rim. Beyond the rim the puck stays on it and the bearing keeps
 * following the pointer, so a drag that overshoots the disc does not stop
 * tipping the way it was going.
 *
 * Pad coordinates are the disc's own, x to the right and y UP, each from -1 to
 * 1, the rim at a radius of 1. The component turns the pointer into these.
 */

/** Inside this share of the radius the plate lies flat. */
export const PAD_DEAD = 0.06;

/** What the pad hands the plate. Gravity to a hundredth and the bearing to a degree, as the phone does. */
export interface Tilt { upright: number; direction: number }

const round2 = (v: number) => Math.round(v * 100) / 100;

/** A point on the pad to the plate's Gravity and Tilt Direction. */
export function padToTilt(x: number, y: number): Tilt {
  const r = Math.min(1, Math.hypot(x, y));
  if (r < PAD_DEAD) return { upright: 0, direction: 180 };
  const upright = round2((r - PAD_DEAD) / (1 - PAD_DEAD));
  // Compass: 0 the top, 90 the right, so atan2(x, y) with y up, as tiltReading has it.
  const direction = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { upright, direction: Math.round(direction) % 360 };
}

/**
 * The plate's Gravity and Tilt Direction to a point on the pad, the inverse of
 * `padToTilt`. At Gravity 0 the plate is level and the puck is in the middle
 * whatever the bearing says.
 */
export function tiltToPad(upright: number, direction: number): { x: number; y: number } {
  const u = Math.max(0, Math.min(1, Number.isFinite(upright) ? upright : 0));
  if (u <= 0) return { x: 0, y: 0 };
  const r = PAD_DEAD + u * (1 - PAD_DEAD);
  const a = (direction * Math.PI) / 180;
  return { x: r * Math.sin(a), y: r * Math.cos(a) };
}

/**
 * A pointer in a box to a point on the pad: the box's middle is level and the
 * rim of the inscribed circle (half the shorter side) is a radius of 1.
 */
export function pointerToPad(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const half = Math.min(box.width, box.height) / 2;
  if (!(half > 0)) return { x: 0, y: 0 };
  const x = (clientX - (box.left + box.width / 2)) / half;
  const y = -(clientY - (box.top + box.height / 2)) / half;
  const r = Math.hypot(x, y);
  return r > 1 ? { x: x / r, y: y / r } : { x, y };
}

/** A key nudges the puck this far, a share of the radius; shift takes a bigger step. */
export const PAD_KEY_STEP = 0.1;
export const PAD_KEY_STEP_BIG = 0.3;

/** Arrow keys move the puck across the pad; returns null for any other key. */
export function padKey(key: string, from: { x: number; y: number }, big = false): { x: number; y: number } | null {
  const s = big ? PAD_KEY_STEP_BIG : PAD_KEY_STEP;
  let { x, y } = from;
  if (key === 'ArrowLeft') x -= s;
  else if (key === 'ArrowRight') x += s;
  else if (key === 'ArrowUp') y += s;
  else if (key === 'ArrowDown') y -= s;
  else return null;
  const r = Math.hypot(x, y);
  return r > 1 ? { x: x / r, y: y / r } : { x, y };
}

/** The bearing as words, for a readout and a screen reader: the way the liquid runs. */
export function bearingName(direction: number): string {
  const names = ['up', 'up and right', 'right', 'down and right', 'down', 'down and left', 'left', 'up and left'];
  return names[Math.round((((direction % 360) + 360) % 360) / 45) % 8];
}

/**
 * How long the puck takes to return to where it was grabbed when Spring is on,
 * milliseconds. A real stick snaps back in a tenth of a second; the plate's
 * slosh turns a quick return into a ring and a slow one into a creep, which is
 * the point of the control, so this is quick but not a jump.
 */
export const PAD_SPRING_MS = 220;

/** Where the puck is part-way through its return: ease-out from the release point to the grab. */
export function springAt(from: { x: number; y: number }, to: { x: number; y: number }, t: number): { x: number; y: number } {
  const k = Math.max(0, Math.min(1, t));
  const e = 1 - (1 - k) * (1 - k);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
}

// ── Spring, remembered ───────────────────────────────────────────────

const SPRING_KEY = 'chromaglass.tiltSpring';

/**
 * Whether the pad springs back when let go. It is how this hand likes the
 * stick, not part of a look, so it lives in the browser and not in the
 * settings: the desk, the phone and the remote each remember their own. On by
 * default, which is what a joystick does.
 */
export function readSpring(): boolean {
  try { return localStorage.getItem(SPRING_KEY) !== '0'; } catch { return true; }
}
export function writeSpring(on: boolean): void {
  try { localStorage.setItem(SPRING_KEY, on ? '1' : '0'); } catch { /* private window: it is the default next time */ }
}
