/**
 * What the TV's remote picks (PLAN 12-tv-remote): the next or previous
 * preset, a random one, or one from the list, out of the presets the laptop
 * sent the TV (`tv-looks`, server/tv-remote.js), in the laptop's order.
 *
 * Plain functions over that list, so the TV page and its check agree on what
 * a press means, and so the step wraps the way the desk's own preset step
 * does (App.tsx `stepPreset`): past the last is the first, and with nothing
 * live (a look the person made by hand) next is the first and previous the last.
 */

import { stream } from './rng.ts';

export interface TvLook { id: string; name: string }

/**
 * The fewest milliseconds between two picks, the page's half of the relay's
 * floor (server/tv-remote.js `TV_PICK_MS`, which the check holds equal): a
 * preset cuts the plate to clean glass, and a held button must not strobe it.
 */
export const TV_PICK_MS = 400;

/** The preset `dir` along from the live one, wrapping; null with an empty list. */
export function stepLook(presets: readonly TvLook[], active: string | null, dir: 1 | -1): TvLook | null {
  if (presets.length === 0) return null;
  const i = presets.findIndex(p => p.id === active);
  if (i < 0) return dir === 1 ? presets[0] : presets[presets.length - 1];
  return presets[(i + dir + presets.length) % presets.length];
}

/**
 * A random preset that is not the live one, so OK always changes what is on
 * the wall (a random pick that lands on the same look reads as a dead button).
 * `rand` is the TV page's own `tv-remote` stream (lib/rng.ts, as every draw
 * in src is, so `npm run seed` can hold that nothing draws unseeded) unless
 * a check hands it a fixed one. The page's seed is its own, not the show's:
 * which look a sofa's OK lands on is no part of the show a seed replays.
 */
export function randomLook(presets: readonly TvLook[], active: string | null, rand: () => number = stream('tv-remote').float): TvLook | null {
  const others = presets.filter(p => p.id !== active);
  if (others.length === 0) return presets[0] ?? null;
  return others[Math.min(others.length - 1, Math.floor(rand() * others.length))];
}
