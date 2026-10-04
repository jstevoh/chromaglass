import { MAGNET_RADIUS } from '../gpu/wgsl/magnetDisc';

/**
 * How big the magnet in the hand is (Magnet Size).
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
 * The solver's magnet is a cylinder (gpu/wgsl/magnetDisc.ts, PLAN.md 9v),
 * held with its face a gap under the liquid, and Size sets its radius: k
 * times the tool's own 0.05 of the plate (a 20 mm by 40 mm rod on the 20 cm
 * dish), its length with it, the gap and the strength where they were. That
 * is what a bigger magnet in the same hand is: the glass between it and the
 * liquid does not get thicker. So a bigger one reaches further and is
 * stronger at the glass too (on its axis, the share of the hand's field the
 * spikes are measured on, spikes.ts: 0.27, 0.95 and 2.22 at k 0.5, 1 and 2,
 * held to the glass at Ferrofluid Scale 0.35), not the same field reaching
 * further. Its spikes' patch, where the field is past the onset, reaches
 * 0.050, 0.157 and 0.339 of the plate out (the deepened dipole's: 0.078,
 * 0.156 and 0.312), so a small magnet's spikes are a cluster over the
 * fingertip and a big one's a hedgehog (npm run disc prints these).
 *
 * Until 9v it was a dipole, made bigger by sinking it k times deeper with k³
 * the strength: a magnet scaled gap and all, the same field over it reaching
 * k times as far. That held the axis field the same at every Size, and,
 * with the liquid's saturation a number in the dipole's own units, the
 * deeper dipole sat lower on that curve and pulled less at the edge of its
 * reach than the magnet it stood for (at Size 0.9, 0.47 of a scaled magnet's
 * pull one height out). The saturation is a field now (spikes.ts, MAGNET_BS),
 * so a bigger magnet's pull is the real one's, wherever it reaches.
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
 * How deep the solver holds a magnet set at Magnet Height h on a look of
 * Ferrofluid Scale `scale`: further off for a bigger look, which is what
 * spreads the pull. The depth the old dipole stood at; the magnet's face is
 * MAGNET_FACE above it (gpu/wgsl/magnetDisc.ts).
 */
export function magnetDepth(height: number | undefined, scale: number | undefined): number {
  return Math.max(0.02, (height ?? 0.25) * (0.5 + (scale ?? 0.4)));
}

/**
 * The magnet's radius as the solver gets it, at this size (above), in plate
 * widths: k times the tool's own.
 */
export function magnetRadiusAt(size: number | undefined): number {
  return MAGNET_RADIUS * magnetReach(size);
}

/*
  There is no pool here any more. From 9x a magnet touching a plate with no
  ferrofluid laid a pool under the hand, sized by this setting. The owner,
  2026-10-04: "Why does the magnet add ferrofluid? It should only work on
  ferrofluid that is already there." Magnet Size is the magnet's own size and
  reach and nothing else; the ferrofluid it works on is poured from the
  bottle or laid by the look.
*/
