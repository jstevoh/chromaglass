/**
 * A press's disc laid and counted (moved out of `FluidSimulation.applySquish`
 * to keep that file under its size budget; the logic is unchanged but for
 * `fine`).
 */
import { squishDisc, type Presser, type SquishCell, type Stroke } from '../lib/squish';

/**
 * Lay one press's disc through `cell`, and count what it laid by who pressed.
 *
 * Counted by who pressed, whole cells that close the gap only (a fractional
 * one is dropped by the arrays, and a cell pressed by nothing is no press),
 * with the depth laid there, so `npm run squeeze` can ask whether a kick's
 * press reached the plate at all, and whether the kick's release gave back
 * what it took.
 *
 * `fine`: the solver has the bowl already, at its own cells and unrounded
 * (`pressBowl`, PLAN 18a-14), so the disc here is only counted, never laid:
 * laying it on the 192² grid as well is what drew the facets a light press
 * showed through the bilinear upsample.
 */
export function layPress(
  size: number, x: number, y: number, radius: number, amount: number, fingering: number,
  stroke: Exclude<Stroke, 'lift'>, pile: number, thinGap: boolean, fine: boolean, who: Presser,
  cell: SquishCell, cells: Record<Presser, number>, depths: Record<Presser, number>,
): void {
  let laid = 0, depth = 0;
  // On a thin gap a press lays only the glass, as a bowl, and the flow moves the liquid (squishDisc).
  squishDisc(size, x, y, radius, amount, fingering, stroke, pile, (idx, g, vx, vy, m) => {
    if (Number.isInteger(idx) && g < 0) { laid++; depth -= g; }
    if (!fine) cell(idx, g, vx, vy, m);
  }, thinGap);
  cells[who] += laid;
  depths[who] += depth;
}
