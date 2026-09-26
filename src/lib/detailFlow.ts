/**
 * The clock the closeup's drawn cells ride the paint on.
 *
 * The macro cells and the lacing are drawn, not simulated: `cellField` in the
 * plate shader lays a pattern down, slides it by the local flow for the
 * length of one generation (`flow × fract(clock / period) × period`), and
 * crossfades two generations half a period apart so neither slides for long.
 * That is the usual flow-map trick, and the pattern's offset is the flow
 * times everything the generation has lived so far, so whatever turns the
 * one into the other is multiplied by the generation's whole life (3.2 s of
 * the plate's clock, which at the Speeds most looks use is fifteen seconds of
 * wall time or more) and lands on the frame all at once.
 *
 * Reported on the owner's Mac: at about 6x the closeup starts to jitter and
 * past it "practically vibrates". 6x is where the cells are big enough to
 * see (`resolved` in the shader: the coarse cells from 2.5x, the fine ones
 * from 6x, the lacing from 4x and whole by 9x). The flow was the packed velocity times
 *
 *     u_flowRate = velRange × (dt × (N − 2) / N) / realDt
 *
 * one solver step's travel over one *frame's* measured time, with the
 * generation's life counted on `U.time`. A browser's frame times are never
 * equal (a millisecond either way at sixty is six percent, a dropped frame
 * is half), and each wobble moved every cell by that share of its whole
 * slide. Through the loop `npm run cellride` models, with that formula in
 * place of the clock (the numbers are in the commit), at the default Speed
 * the cells
 * went 30 times as far in a frame as the paint under them at 60 fps with a
 * millisecond of noise, 133 times at 120 Hz, 600 times at 120 Hz with a
 * dropped frame a second. It was also the wrong speed: the solver steps at a
 * fixed rate in wall time, so on 120 Hz it was twice what it was at 60, and
 * it left out Advection and the plate clock's own rate, so at the default
 * Speed the cells slid at a quarter of the paint's speed.
 *
 * Working the rate out per step instead fixes the frame times but not the
 * shape of the problem. Any rate that is divided by a clock is exposed to
 * the two clocks disagreeing for a frame, and they do: the solver's step
 * carries the music's tempo and the phrase's lean from the frame it was
 * taken, the plate's clock carries this frame's, and on a screen faster than
 * the step rate half the frames take no step. And a rate is applied to the
 * whole of a generation's life at once, so when the lean changes how fast
 * the dye goes, every cell jumps by the change times its age. Through the
 * same loop with the tempo slewing and the lean wandering, that version
 * still shook the cells by 28 times the paint's travel a frame at 60 fps and
 * 55 times at 120 Hz (found in review, before it was pushed).
 *
 * So the generations are counted on the paint's own travel. Each solver step
 * advances `cellClock` by the distance that step moved the dye
 * (`stepDisplacement`, the same number `advect` moves it by), and the shader
 * slides the pattern by the flow times CELL_TRAVEL per unit of that clock.
 * The cells then go exactly as far as the paint went, step for step, whatever
 * the frame times, the step rate, the catch-up cap, the tempo, the lean or
 * Speed did; `u_flowRate` is a constant; and a faster pour cycles its cells
 * faster, which is what a pour does. At the default Advection, with the
 * phrase's lean at one, the clock runs with `U.time` (to within the grid's
 * edge), so the cells breathe as they did; the lean speeds the dye and not
 * the plate's clock, so it now speeds the cells' breathing with the dye. It is wrapped at CELL_CLOCK_WRAP, a common multiple of every period
 * the shader uses, so it keeps its precision in a 32-bit uniform however
 * long the show has run.
 *
 * The clock is the lead plate's. The second plate's cells ride it too, and
 * its `dt` is slowed by Background Loop, so they can run ahead of its paint;
 * that was so before this, and is left for a clock per layer if it shows.
 */

/**
 * The solver's floor on `dt` (FluidSimulation.step clamps to it). Here so
 * the clamp and anything that models it are one number.
 */
export const DT_FLOOR = 1e-7;

/**
 * How far one solver step moves the dye, in plate-uv per unit of velocity:
 * the displacement the solver's `advect` uses (FluidGpu.step), so the cells'
 * clock is the dye's own travel.
 */
export function stepDisplacement(dt: number, advection: number, grid: number): number {
  return dt * advection * ((grid - 2) / grid);
}

/**
 * Plate-uv a unit of velocity carries the dye per unit of `cellClock`:
 * `u_flowRate` while the closeup is on. It is the displacement a second of
 * the plate's clock stands for at the default Advection (0.45), where
 * `dt = 0.6 × plate-seconds` (the loop's `dt = dynamicSpeed × 0.2 × steps`
 * against `timeMultiplier = dynamicSpeed × 20`), so at that Advection the
 * cells keep the breathing pace they had on `U.time`.
 */
export const CELL_TRAVEL = 0.6 * 0.45;

/**
 * Where `cellClock` wraps. The shader's cell periods are 3.2 (the coarse
 * cells and the plate's) and 2.1 (the fine ones), and 67.2 is 21 of the one
 * and 32 of the other, so `fract(clock / period + phase)` runs straight
 * through the wrap. `U.time` left to grow for a four-hour show is thousands
 * of plate-seconds in a 32-bit float, where one step of the float is enough
 * for a generation on fast paint to hop at 6x.
 */
export const CELL_CLOCK_WRAP = 67.2;

/** The cell clock after a solver step that moved the dye `disp` (stepDisplacement). */
export function advanceCellClock(clock: number, disp: number): number {
  if (!Number.isFinite(clock)) clock = 0;
  if (!(disp > 0) || !Number.isFinite(disp)) return clock;
  const next = clock + disp / CELL_TRAVEL;
  return next >= CELL_CLOCK_WRAP ? next % CELL_CLOCK_WRAP : next;
}
