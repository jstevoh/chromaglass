/**
 * The plate's dice and the palette helpers that draw from them.
 *
 * Moved out of `components/LiquidVisualizer.tsx` (PLAN 19ai-3) unchanged. The
 * streams are module constants by design (see the comment on `DICE`): a
 * reseed re-keys each in place, so whoever imports them holds the same
 * stream the loop does.
 */
import { WORKING_DYES } from '../presetPlate';
import { PALETTE_RGB } from '../constants';
import { stream } from '../lib/rng';

export const PALETTE_COUNT = PALETTE_RGB.length;

/*
  The show's dice, one stream per purpose (lib/rng.ts).

  Every `Math.random` in this file that could change what reaches the plate
  now draws from one of these, or from the plate's own `rng` (FluidSimulation,
  one stream a layer), so the same seed plays the same show. They are split by
  what they decide rather than pooled, so that adding a draw to one — a new
  tool, a new automation event — cannot move the numbers another one draws:

    lay      what laying a look adds besides its dye: the plates' starting
             angles, the liquids poured with it, the handoff's pours, the Seed
             button's drops.
    hands    what a hand does beyond where it points: the spray's mist, the
             splatter's flung drops, a theme button's placement, a blow's
             bubble.
    evolve   the automation: when a drop lands and where, a thinned patch, a
             finger stroke, a palette re-pick.
    music    what the music pours: a style for each band's drop, a dose on the
             beat's ring, treble sparks, the squeeze, a bubble on the kick, a
             soap burst.
    liquids  which bottle a dose comes from (`doseLiquid`).
    palette  which of a look's dyes are the working set (`harmonyWithin`;
             `harmonyColor` and `pickHarmony` draw from the same stream).
    chem     where a reaction is seeded: the BZ waves and Boyle's chemistry.
    pour     where a paced scene's flood lands (`pour` on the handle), so a
             sequence's pours cannot move the automation's own draws.

  All of them are `plate.` streams, so laying a look restarts them from
  (seed, name, look) — see "Restarting, rather than continuing" in rng.ts.
  Module constants are safe to hold: a reseed re-keys a stream in place.
*/
export const DICE = {
  lay: stream('plate.lay'),
  hands: stream('plate.hands'),
  evolve: stream('plate.evolve'),
  music: stream('plate.music'),
  liquids: stream('plate.liquids'),
  palette: stream('plate.palette'),
  chem: stream('plate.chemistry'),
  pour: stream('plate.pour'),
};

/** A working harmony drawn from inside a contract: the whole set when small, else WORKING_DYES of it. */
export const harmonyWithin = (contract: number[]): number[] => {
  if (contract.length <= WORKING_DYES) return contract;
  const pool = [...contract];
  const out: number[] = [];
  while (out.length < WORKING_DYES) out.push(pool.splice(DICE.palette.int(pool.length), 1)[0]);
  return out;
};

/**
 * A window onto the contract: `size` dyes starting at `lead`, wrapping. This
 * is how a show walks its hues — the window slides one dye at a time, so the
 * plate keeps most of its colours while one drains and a new one arrives —
 * and how a monochrome opening is done: a window of one.
 */
export const windowOf = (contract: number[], size: number | null, lead: number): number[] => {
  const n = contract.length;
  if (n === 0) return contract;
  const w = Math.max(1, Math.min(n, size ?? Math.min(n, WORKING_DYES)));
  const out: number[] = [];
  const start = ((Math.round(lead) % n) + n) % n;
  for (let i = 0; i < w; i++) out.push(contract[(start + i) % n]);
  return out;
};
