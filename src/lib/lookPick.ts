import type { Preset } from '../presets';
import { MOIRE_LOOKS } from '../presetsMoire';

/**
 * Which shipped look a random pick lands on: the phone's Surprise me, a new
 * song in "New preset" mode, and the look the app opens on.
 *
 * The owner reported (2026-11-11) that the random looks came up moiré "way too
 * frequently". Each of those pickers was `pick(PRESETS.filter(not macro))`,
 * and when the moiré pack (PLAN 45a) shipped it added its seven looks to that
 * list as seven more entries: 7 of the 38 a pick could land on, so one pick in
 * 5.4 put sheets on the stage. But the seven are one idea, two printed sheets
 * over a liquid, laid over seven of the house looks; the liquid under Moiré
 * Star *is* Classic's. Counted as seven separate looks the pack took a fifth
 * of every pick for something that is, on the plate, one choice. And none of
 * the three asked whether the pack was on this copy at all, so a copy without
 * it opened on, or shuffled to, a look it could not play.
 *
 * So a pick is weighted, not counted:
 *
 *  - a house look weighs 1;
 *  - an art pack weighs `PACK_WEIGHT` looks *in all*, shared among its looks,
 *    so the moiré pack comes up about once in sixteen picks however many looks
 *    it grows to, and it is still there to be found;
 *  - a pack this copy does not have weighs nothing (`locked`, which the
 *    callers answer from `isPackLocked` in tierGates: this lib does not read
 *    the licence).
 *
 * And it does not come back to what was just on the plate. A look counts as
 * its *liquid*: a pack look is its house look's liquid with sheets on it, so
 * Moiré Star after Classic is the same dish twice. The look now on the plate
 * and the last `RECENT` picks are left out by that liquid, which is what makes
 * a run of presses read as a tour of the looks rather than a coin with seven
 * faces landing on the same one. When everything is excluded (a pool of two),
 * the memory gives way before the pick does.
 *
 * Every pick is a whole shipped look, tuned by hand, so a random pick is as
 * physically plausible as choosing one from the menu: nothing here mixes them.
 */
export const PACK_WEIGHT = 2;
export const RECENT = 6;

/** The liquid a look is: a pack look is the house look it is laid over. */
const BASE: ReadonlyMap<string, string> = new Map(MOIRE_LOOKS.map(m => [m.id, m.from]));
export const liquidOf = (id: string): string => BASE.get(id) ?? id;

/**
 * The looks a pick has landed on lately, newest last, by liquid.
 *
 * Module state, as the show's random streams are (lib/rng.ts): it is the
 * memory of one show, shared by every picker in it, so a song boundary does
 * not bring back the look the phone's Surprise me just played.
 */
const recent: string[] = [];

export function pickLook(
  pool: readonly Preset[],
  rand: () => number,
  { currentId = null, locked = () => false }: { currentId?: string | null; locked?: (pack: Preset['pack']) => boolean } = {},
): Preset | undefined {
  const playable = pool.filter(p => !p.settings.macroMode && p.id !== currentId && !locked(p.pack));
  const packSize = new Map<string, number>();
  for (const p of playable) if (p.pack) packSize.set(p.pack, (packSize.get(p.pack) ?? 0) + 1);
  const weight = (p: Preset): number => (p.pack ? PACK_WEIGHT / (packSize.get(p.pack) ?? 1) : 1);

  const away = new Set(recent);
  if (currentId) away.add(liquidOf(currentId));
  let fresh = playable.filter(p => !away.has(liquidOf(p.id)));
  if (!fresh.length && currentId) fresh = playable.filter(p => liquidOf(p.id) !== liquidOf(currentId));
  if (!fresh.length) fresh = playable;
  if (!fresh.length) return undefined;

  const total = fresh.reduce((sum, p) => sum + weight(p), 0);
  let r = rand() * total;
  let chosen = fresh[fresh.length - 1];
  for (const p of fresh) { r -= weight(p); if (r < 0) { chosen = p; break; } }

  recent.push(liquidOf(chosen.id));
  if (recent.length > RECENT) recent.shift();
  return chosen;
}

/** For the checks: start a show's memory clean. */
export function forgetPicks(): void { recent.length = 0; }
