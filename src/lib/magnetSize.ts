/**
 * How big the magnet in the hand is (Magnet Size), and the pool it brings.
 *
 * Asked for by the owner, after picking the Magnet still put "a giant black
 * hole" on the plate: "I just want a magnet that I can control the size of
 * that I can interact with."
 *
 * ## What a bigger magnet is
 *
 * Magnetostatics has no length of its own: scale a magnet by k in every
 * direction and its field at k times the distance is the field the small one
 * had at the original distance, unchanged in strength. So two magnets of the
 * same grade and shape differ only in reach. Held against the glass, a
 * button magnet's field is as strong at its face as a palm-sized block's, but
 * falls away within its own width, and the block's carries k times as far
 * across the plate before it does.
 *
 * The solver's magnet is a dipole a height h under the plate (fluid.ts,
 * magnetEnergy), whose field at the glass spreads over about h and is, on
 * its axis, the strength over h³. A magnet k times the size is that dipole k
 * times deeper with k³ the strength: the field over it is the same, and its
 * footprint, the spikes' patch with it (spikes.ts: the onset is a share of
 * the field, strength over height cubed, so k³ over k³ leaves it where it
 * was), is k times as wide. The step's other inputs see a magnet: the pull
 * is the field's gradient, so a big magnet pulls more gently over more of
 * the plate, which is what a big magnet under a dish does.
 *
 * The shortcut, named: a real disc held at a fixed gap is not exactly a
 * deeper dipole. Near its face the field is flatter than a dipole's (a disc's
 * own width spreads it) and a bigger disc at the same gap is somewhat
 * stronger at the glass, not equal. The dipole was already the magnet's
 * model, and its saturation (MAGNET_BSAT) flattens the peak much as a disc's
 * face does; replacing it with a finite disc's field is PLAN.md 9v.
 *
 * ## The range
 *
 * 0 to 1 on the control, a factor of 2 either way about the magnet the tool
 * always was: from about a coin, whose spikes are a cluster of a few over the
 * fingertip, to about a palm, whose hedgehog covers a fifth of the plate.
 * Exponential, so each step of the control is the same proportion bigger.
 */

/** The factor on the magnet's size: 0.5 at 0, 1 at 0.5 (the tool as it was), 2 at 1. */
export function magnetReach(size: number | undefined): number {
  const s = Number.isFinite(size) ? Math.max(0, Math.min(1, size as number)) : 0.5;
  return 2 ** (2 * s - 1);
}

/**
 * The magnet as the solver gets it, at this size: k times deeper and k³
 * the strength (above).
 */
export function sizedMagnet(strength: number, height: number, size: number | undefined): { strength: number; height: number } {
  const k = magnetReach(size);
  return { strength: strength * k * k * k, height: height * k };
}

/*
  The pool a magnet brings to a plate that has no ferrofluid on it: one drop,
  laid under the hand, of this radius at the tool's own size and k times it
  at another.

  Why a pool under the hand and not the ring: picking the Magnet used to pour
  the look's ring of ferrofluid (phasePour) over the whole plate the moment it
  was picked, about a fifth of the plate in black drops round the middle, and
  at a large Ferrofluid Scale those drops ran together across the middle. That
  is the "giant black hole as soon as you pick it" the owner reported after
  the magnet under the middle (PLAN 9s) had been taken away. A performer with
  a magnet and a bottle puts the ferrofluid where they are about to work, and
  a magnet over a bare plate does nothing at all (the reason the pour was
  added), so the liquid comes with the hand: where it first touches, as much
  as the magnet will stand up.

  0.09 at the tool's own size: the spikes' patch over the hand's magnet
  reaches about 1.1 of its height out (spikes.ts: the field off the axis
  falls to the onset's share there), 0.15 of the plate at Ferrofluid Scale
  0.4, so the pool sits inside it and the whole of it stands into domes,
  about a dozen at the spikes' pitch. 0.9 full, as the ring's drops are (a
  half-full drop would not separate from the water at all): one drop holds
  0.9 πr²/2, a little under 1% of the plate, against the ring's 22%.
*/
export const MAGNET_POOL_RADIUS = 0.09;
export const MAGNET_POOL_FILL = 0.9;
