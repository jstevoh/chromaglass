import type { LookPhase } from '../sim/frameTypes';

/*
  A look handing over to the next (a pressed Go or Back): LiquidVisualizer's
  handoffRef.

  `adoptPreset` changes the palette at once but leaves the plate alone, and
  at the default evaporation the old dye's half-life is minutes — so after
  a two-second fade the settings were the new look's and the colours were
  still the old one's, with the new palette's drops landing in them: for a
  long while the wall read as neither look. Over the fade now, the old dye
  thins to a little under half and six pours of the new palette arrive
  through the second half, so the colours change hands with the settings.

  `dyeOnly` is a recolour (below): the handover's first frame clears the old
  look's chemistry and liquids only for a Go (dosed 0), so neither a recolour
  nor a Go's seed taken again mid-handover clears them. `paletteRgb` on the
  debug hook is the palette's RGB, which `npm run pictureplate` classes the
  plate's hues against.
*/
export type Handoff = {
  start: number; dur: number; last: number; poured: number; dosed: number;
  seeds: (Float32Array[] | null)[] | null; plates?: number; phase?: LookPhase; dyeOnly?: boolean;
};

/**
 * A palette chosen by hand recolours the plate, not only the dye still to
 * come (PLAN 43d-6). Measured with The Starry Night as the cover on Classic:
 * the harmony switched to the picture's four dyes at once, but 60 s later 94%
 * of the lit plate was still nearer the look's own dyes than the picture's,
 * and 95% at 90 s. The dye already laid is hardly evaporating (its half-life
 * at the default evaporation is minutes) and a plate held full by the
 * regulator leaves the pours little room, so a lock that only steers new
 * pours reads as nothing happening.
 *
 * So a chosen palette hands the plate over the way a Go does: what is on it
 * thins and the look's own seed rises into it, now laid in the locked dyes
 * (lib/pinnedDyes), with the palette poured through the second half. Dye
 * only: the liquids, the second phase, the heat and the chemistry stay where
 * they are, since only the colours were asked to change. The thinning is
 * Go's shortcut, not a rinse a real plate could do (43d-7). A lock
 * re-asserted (a reload, the wall or a cast display catching up) passes no
 * seconds and leaves the plate alone. If a Go is already handing over, its
 * seed is taken again in the new dyes (seeds to null) rather than a second
 * handover started over it.
 *
 * Returns the handover to run, which is `running` itself when a Go is on.
 */
export function recolourHandoff(running: Handoff | null, now: number, seconds: number): Handoff | null {
  if (!(seconds > 0)) return running;
  if (running && !running.dyeOnly) { running.seeds = null; return running; }
  return { start: now, dur: seconds * 1000, last: now, poured: 0, dosed: 2, seeds: null, dyeOnly: true };
}
