/**
 * A press's disc laid and counted (moved out of `FluidSimulation.applySquish`
 * to keep that file under its size budget; the logic is unchanged but for
 * `fine`).
 */
import { spokesAt, squishDisc, type Presser, type SquishCell, type Stroke } from '../lib/squish';

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

/** The solver's own lay of a lift's spokes (`liftSpokes` in gpu/solverTypes.ts). */
export type SpokesLay = (x: number, y: number, radius: number, reach: number, gap: number, count: number, phase: number, seed: number) => void;

/**
 * One step of the glass coming back up after a press (lib/squish.ts), laid
 * through `cell`, and the whole cells it lands on: an index that is not a
 * whole number is a write a typed array drops without a word (the beat
 * squeeze's fractional centre, PLAN §10 step 4), and counting those called a
 * lift that laid nothing a lift.
 *
 * `spokes` (a thin gap whose solver lays them, PLAN 18a-15): the opening is
 * the solver's, at its own cells, and the 192² disc is only counted, as a
 * press's is with `fine`. The spokes' gap is squishDisc's on a thin gap,
 * amount · ½ · fingering at a spoke's full strength, out to the same reach.
 */
export function layLift(
  size: number, lift: { x: number; y: number; radius: number; amount: number; fingering: number },
  thin: boolean, cell: SquishCell, spokes?: SpokesLay,
): number {
  let cells = 0;
  const fine = thin && !!spokes;
  if (fine) {
    const x = Math.round(lift.x), y = Math.round(lift.y), sp = spokesAt(x, y, lift.fingering);
    if (sp.count > 0) spokes!(x + 0.5, y + 0.5, lift.radius, Math.round(lift.radius * 1.15), lift.amount * 0.5 * lift.fingering, sp.count, sp.phase, sp.seed);
  }
  squishDisc(size, lift.x, lift.y, lift.radius, lift.amount, lift.fingering, 'lift', 0, (idx, gap, vx, vy, m) => {
    if (Number.isInteger(idx)) cells++;
    if (!fine) cell(idx, gap, vx, vy, m);
  }, thin);
  return cells;
}
