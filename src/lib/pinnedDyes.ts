import { PALETTE_RGB, pickHarmony } from '../constants';
import { PRESET_CONTRACTS } from '../presetPlate';

/**
 * The dyes a look's opening picture is laid in (FluidSimulation.seedPreset).
 * `dyes`, when given, is the palette the performer has pinned (a palette
 * lock, or a picture's four dyes, PLAN 43d): the look's composition is laid
 * with those bottles instead of its own.
 *
 * The seed took the look's own contract always, and every re-lay of a look
 * went through it: the opening, a pressed Go's handover, a rebuild after a
 * lost device. So with the picture palette set, a Go laid the incoming look in
 * its own magenta and violet and only the drips after it were the picture's
 * (43d-6). The few dyes a composition names by colour rather than by its
 * palette (Galaxy's and Solar Flare's cores) take the pinned palette's too,
 * through `named`: they are dye in a bottle like the rest. The milk ground is
 * not; it stays.
 */
export function seedDyes(look: string, dyes: readonly number[] | null) {
  const pinned = dyes && dyes.length ? [...dyes] : null;
  const harmony = pinned ?? (PRESET_CONTRACTS[look] || pickHarmony());
  const col = (i: number) => PALETTE_RGB[harmony[i % harmony.length]];
  /** A dye the composition names by colour: the pinned palette's `i`th when one is pinned. */
  const named = (r: number, g: number, b: number, i: number): [number, number, number] => {
    const c = pinned ? col(i) : { r, g, b };
    return [c.r, c.g, c.b];
  };
  return { harmony, col, named };
}
