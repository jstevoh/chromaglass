/**
 * What a hand's Finger or Blow carries of the ferrofluid (PLAN.md §9n), as
 * the solver's carryPhase takes it: in plate units.
 *
 * One place for the numbers, because two things need them: the app, where
 * a hand calls them (LiquidVisualizer: fingerDrag, blowPhase), and
 * `npm run ferrohands`, which measures what they carry. A check that copied
 * them would go on passing on numbers the app had stopped using.
 *
 * `x`, `y` and `radius` are in cells of the app's L-cell plate, as the
 * tools are; `gridScale` is L over 128, the grid the brushes were tuned on.
 */
export type HandCarry = {
  x: number; y: number; r: number;
  /** The direction, unit length; ignored when outward. */
  ux: number; uy: number;
  /** The share taken from the cell at the hand's middle, falling to none at its rim. */
  take: number;
  /** How far what is taken is put down. */
  hop: number;
  /** Straight out from the middle (a puff held still), not along a stroke. */
  outward: boolean;
};

/**
 * The Finger: the same geometry as the dye's carry (carryDye), so the
 * ferrofluid and the colour move together. `radius` is the Finger's own (7,
 * before gridScale) and `strength` what fingerDrag was given.
 */
export function fingerCarry(x: number, y: number, radius: number, strength: number, dx: number, dy: number, L: number): HandCarry | null {
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-4)) return null;
  const r = Math.round(radius * L / 128);
  return { x: x / L, y: y / L, r: r / L, ux: dx / len, uy: dy / len,
    take: Math.min(0.75, strength * 8), hop: Math.max(1, Math.round(r * 0.45)) / L, outward: false };
}

/**
 * Blow: held still it blows straight down and opens a hole, the ferrofluid
 * going out from under it on every side; moved, or a directed blow, it
 * sweeps the ferrofluid along as a Finger does, at the Finger's share of
 * its strength (eight times it, to half at most). Held still it takes half
 * that, because it acts on the same cells every frame the breath goes on:
 * at the Finger's share a puff emptied the pool under it in a few frames.
 * Measured (`npm run ferrohands`): at four times the strength, as the puff
 * takes, a mouse's Blow drawn across a pool moved it 0.35 % of the plate,
 * a tongue too faint to read as pushed. `dx`, `dy` of zero is held still.
 */
export function blowCarry(x: number, y: number, radius: number, strength: number, dx: number, dy: number, L: number): HandCarry {
  const len = Math.hypot(dx, dy);
  const r = Math.round(radius * L / 128);
  const outward = !(len > 1e-4);
  return { x: x / L, y: y / L, r: r / L, ux: outward ? 0 : dx / len, uy: outward ? 0 : dy / len,
    take: Math.min(0.5, strength * (outward ? 4 : 8)), hop: Math.max(1, Math.round(r * 0.45)) / L, outward };
}
