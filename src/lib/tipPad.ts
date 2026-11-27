/**
 * The Tip pad: a hand on the dish's rim, as the plate's own settings (PLAN 18a-13j).
 *
 * What was reported. The owner, 2026-10-31: "I still haven't been able to try
 * the plate sloshing. I never saw the control to do that." The slosh had been
 * built since 18a-13 (a shallow-water dish under the thin gap, two layers since
 * 18a-13a), but nothing on the desk played it. Its dial, Slosh, sat in the Tilt
 * & Rock section, which no shipped tab puts out, at 0 on every look; and with
 * it turned up, a tip was two more faders, Gravity raised and then Tilt
 * Direction dragged one way and back. Only a phone with its Tilt on could tip
 * the dish by hand, and only on the phone.
 *
 * So the pad is the dish seen from above, with a dot on it: drag the dot
 * toward an edge and that edge goes down; let go and the dish lies back as it
 * was, so the liquid that piled on the low side runs back past the middle and
 * rings (or creeps, on a thick liquid: the dish's drag is the look's own,
 * `sloshDrag` in lib/slosh.ts). The pad moves nothing itself. It writes the
 * two settings the phone's Tilt writes (lib/phone.ts `tiltReading`), Gravity
 * (`plateUpright`) and Tilt Direction (`tiltDirection`), so what a tip does to
 * the liquid is the solver's, exactly as the faders and the phone do it, and a
 * desk stays a thing that changes settings (docs/architecture.md).
 *
 * Why settings and not the remote's held-phone path (`setExternalTilt`). That
 * one reaches the dish in the plate's own axes, unturned, so on the twenty-nine
 * looks whose dish turns (a Rotation Speed above 0) a tip toward the top of the screen would slop toward
 * wherever the dish had turned to (PLAN 18a-13e). Tilt Direction is the
 * stage's, turned into the dish by its angle each step (`downhill` in
 * sim/fluidSimulation.ts), so the edge the dot is pulled toward is the edge the
 * liquid runs to on a spinning look too.
 *
 * Why the dial is raised on a grab. Slosh at 0 is the plate as it was before
 * the dish (the setting-auditor's rule: a default keeps today's look), and at
 * 0 a tip only lets the heavier colour sink downhill through the thin gap,
 * slowly. A pad that seems to do nothing the first time it is touched is the
 * report all over again, so a grab with the dial below TIP_SLOSH_FLOOR puts it
 * at TIP_SLOSH, where `docs/judging.md` §58 asks the owner to judge the pace;
 * the dial beside the pad shows it moved, and it stays where it was put.
 */

/** Of the pad's radius: inside this a resting thumb tips nothing. */
export const TIP_DEAD = 0.06;
/** The Slosh a grab raises the dial to, when it is below TIP_SLOSH_FLOOR. */
export const TIP_SLOSH = 0.5;
export const TIP_SLOSH_FLOOR = 0.05;
/** How far an arrow key tips the dish, of the pad's radius: well over, short of the rim. */
export const TIP_KEY = 0.8;

/** What the dish was before the hand took it: put back when the hand lets go. */
export interface TipHold { plateUpright: number; tiltDirection: number }

type TipSettings = { plateUpright?: number; tiltDirection?: number; slosh?: number };

const fin = (v: number | undefined, d: number) => (Number.isFinite(v) ? (v as number) : d);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Where the dot is, as Gravity and Tilt Direction. `dx` right and `dy` down
 * from the pad's middle in CSS pixels (as a pointer reads them), `r` its
 * radius. The direction is the compass the plate's is (0 the top, 90 the
 * right): the edge the dot is pulled toward is the edge that goes down.
 *
 * Gravity goes as the square of the reach past the dead zone, so the middle of
 * the pad is fine: a tenth of the way out leans the dish by a hundredth, which
 * on a thin liquid is still a visible slop, and the rim is the plate stood
 * fully up (the owner's rule, 2026-10-31: every control runs from very gentle
 * to very extreme). The Slosh dial scales the whole of it again.
 */
export function padTilt(dx: number, dy: number, r: number): { upright: number; direction: number } {
  const x = fin(dx, 0), y = fin(dy, 0);
  const reach = Math.hypot(x, y) / Math.max(1, fin(r, 1));
  const t = clamp01((reach - TIP_DEAD) / (1 - TIP_DEAD));
  const direction = Math.round(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360) % 360;
  return { upright: Math.round(t * t * 100) / 100, direction };
}

/** Where the dot sits for a plate tipped `upright` toward `direction`: `padTilt` backwards, kept inside the pad. */
export function padDot(upright: number, direction: number, r: number): { x: number; y: number } {
  const u = clamp01(fin(upright, 0));
  if (u <= 0) return { x: 0, y: 0 };
  const reach = TIP_DEAD + Math.sqrt(u) * (1 - TIP_DEAD);
  const a = (fin(direction, 180) * Math.PI) / 180;
  return { x: Math.sin(a) * reach * r, y: -Math.cos(a) * reach * r };
}

/** A pointer at (`dx`, `dy`) held to the pad's rim. */
export function onPad(dx: number, dy: number, r: number): { x: number; y: number } {
  const d = Math.hypot(dx, dy);
  return d <= r || d === 0 ? { x: dx, y: dy } : { x: (dx / d) * r, y: (dy / d) * r };
}

/** What the hand takes hold of, and the dial raised if it was too low to slosh (above). */
export function tipGrab(s: TipSettings): { hold: TipHold; patch: { slosh: number } | null } {
  return {
    hold: { plateUpright: clamp01(fin(s.plateUpright, 0)), tiltDirection: fin(s.tiltDirection, 180) },
    patch: fin(s.slosh, 0) < TIP_SLOSH_FLOOR ? { slosh: TIP_SLOSH } : null,
  };
}

/** The dish put back as it was when the hand took it. */
export function tipLetGo(hold: TipHold): TipHold {
  return { plateUpright: hold.plateUpright, tiltDirection: hold.tiltDirection };
}

/**
 * Whether a new reading is worth a settings write: the phone's Tilt rule
 * (hooks/useDeviceTilt.ts), two hundredths of Gravity or three degrees of
 * turn. Each write re-renders the desk, and a pointer moves at sixty a second.
 */
export function tipMoved(was: { upright: number; direction: number }, now: { upright: number; direction: number }): boolean {
  const turned = Math.abs((((now.direction - was.direction) % 360) + 540) % 360 - 180);
  if (Math.abs(now.upright - was.upright) >= 0.02) return true;
  return now.upright > 0 && turned >= 3;
}

/** The arrow keys held, as a tip: each pulls toward its edge, two at once toward the corner between. */
export function keysTilt(keys: ReadonlySet<string>, r: number): { x: number; y: number } | null {
  const x = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
  if (x === 0 && y === 0) return null;
  const d = Math.hypot(x, y);
  return { x: (x / d) * TIP_KEY * r, y: (y / d) * TIP_KEY * r };
}
