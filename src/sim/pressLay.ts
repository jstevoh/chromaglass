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

/** The step the hand's press was set on (s): the show's own, sixty a second (SIM_STEP in sim/stepping.ts). */
export const PRESS_STEP_S = 1 / 60;

/**
 * A press held over one step of `dtSeconds`: `amount` is what it lays in a
 * sixtieth of a second, the step it was set on (PLAN 18a-5).
 *
 * What was wrong. A hand held on the glass laid the same dent every solver
 * step, and the step is not a fixed time: the governor lowers the step rate
 * before it gives up a rung (QualityGovernor.stepRate) and doubles each
 * step's `dtSeconds`, and `?steps=` sets it by hand. At thirty steps a
 * second the Press closed the film half as fast in the show's seconds as at
 * sixty, and at a hundred and twenty twice as fast: the glass went down over
 * the steps it was given, not over the press's own time. Everything round it
 * was already counted in seconds: the glass's spring (glassSpring, on a thin
 * gap the show's seconds), the lift that follows the press (PressLift, its
 * amount times dtSeconds · 60), the kick's hold and release (KickRelease),
 * the clock glass (GlassPress).
 *
 * The physics. A hand is a load on the glass, and the film under it closes
 * at Stefan's rate, dh/dt = −a(h/h₀)³, a rate in seconds, whatever the
 * solver's step. The shader integrates that exactly over the step it is
 * handed (squeezeUpdate: 1/h² grows by 2a/h₀³, which is linear in a), so a
 * rate laid as its share of the step closes the glass to the same depth in
 * the same time at any step rate: two steps of half the rate are one step of
 * the whole, up to the spring taken between them. `npm run pressclock`.
 *
 * At sixty steps a second the share is exactly 1 and the plate presses bit
 * for bit as it did. Only a held press goes through this (the Press tool's
 * hands each step, a bubble's standing squeeze each step): a dent laid once,
 * a drop's impact or a pad's hit, is a dent, not a rate.
 */
export function pressOverStep(amount: number, dtSeconds: number): number {
  return Number.isFinite(dtSeconds) && dtSeconds > 0 ? amount * (dtSeconds / PRESS_STEP_S) : amount;
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
