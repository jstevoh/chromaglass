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
 * The solver's magnet is a dipole a height h under the plate (fluid.ts,
 * magnetEnergy), whose field at the glass spreads over about h and is, on
 * its axis, the strength over h³. A magnet k times the size is that dipole k
 * times deeper with k³ the strength: the field's share over it is the same
 * (but see the saturation, below), and its
 * footprint, the spikes' patch with it (spikes.ts: the onset is a share of
 * the field, strength over height cubed, so k³ over k³ leaves it where it
 * was), is k times as wide. The step's other inputs see a magnet: the pull
 * is the field's gradient, so a big magnet pulls more gently over more of
 * the plate, which is what a big magnet under a dish does.
 *
 * The shortcuts, named. A real disc held at a fixed gap is not exactly a
 * deeper dipole. Near its face the field is flatter than a dipole's (a disc's
 * own width spreads it), and a bigger disc at the same gap is somewhat
 * stronger at the glass, not equal.
 *
 * And the scaling is exact only where the liquid is far from saturation. The
 * solver's saturation (MAGNET_BSAT in fluid.ts) is a fixed number in the
 * field's geometric units, not in tesla, so a dipole k times deeper sits
 * lower on that curve than the magnet it stands for. Below the spikes the
 * field share is the same, as above, but the pull, the energy's gradient, is
 * not the 1/k a scaled magnet gives. Against an exactly scaled magnet, at
 * Size 0.9 (k 1.74) the solver's pull is 0.68 of it half a height out from
 * the axis, 0.47 at one height and 0.33 at one and a half. At Size 1 (k 2)
 * it is 0.55, 0.35 and 0.23. At Size 0 (k 0.5) it is 1.05 to 2.2, stronger.
 * So a big magnet holds its pool more weakly at the edge of its reach than a
 * real one would. In the lab it still carried the pool 90% of a drag at
 * Size 0.9 (scripts/magnet.mjs, check 3).
 *
 * Both are PLAN.md 9v: a finite disc's field, with the saturation in field
 * units, so that Size sets the disc's radius and nothing else.
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
  There is no pool here any more. From 9x a magnet touching a plate with no
  ferrofluid laid a pool under the hand, sized by this setting. The owner,
  2026-10-04: "Why does the magnet add ferrofluid? It should only work on
  ferrofluid that is already there." Magnet Size is the magnet's own size and
  reach and nothing else; the ferrofluid it works on is poured from the
  bottle or laid by the look.
*/
