/**
 * The hands' and the bottles' module helpers: how long a hand must hold
 * before it touches the plate, how a bottle lays its liquid, how a dose is
 * drawn from a look's dish.
 *
 * Moved out of `components/LiquidVisualizer.tsx` (PLAN 19ai-3) unchanged.
 * The frame loop calls them; they act on the CPU solver
 * (`fluidSimulation.ts`), which is why they are beside it rather than in
 * `lib/`, whose files never reach into the solver.
 */
import { LiquidType } from '../types';
import { LIQUIDS_BY_ID, AUTO_DOSE } from '../presetPlate';
import { type FluidSimulation } from './fluidSimulation';
import { GRID_SCALE } from './constants';
import { DICE } from './dice';

/** Seconds a track must survive before it is allowed to touch the plate. */
export const HAND_SETTLE = 0.25;

/** Seconds of standing still before a person becomes a palm on the glass. */
export const HAND_STILL_HOLD = 0.35;

/** Frame widths a second above which a person is blowing rather than pressing. */
export const HAND_MOVING = 0.06;

/*
  A moving Blow on the ferrofluid (PLAN.md §9n) pushes along the way the hand
  last went, for this long after it last moved. Long enough to cover a
  frame's later sim steps (the stroke is nothing on those) and a frame or two
  at 20 fps where the pointer reported no move; short enough that a hand that
  stops and holds is a puff, opening a hole, within a tenth of a second or so
  of stopping, which reads as at once.
*/
export const BLOW_DIR_HOLD_MS = 150;

/*
  And the Blow is a straw only once the hand has been held for that long and
  for this many frames in which the pointer reported no move, counting the
  press itself as a move (PLAN.md §15c).

  The straw used to be "not going": no move within BLOW_DIR_HOLD_MS. Two holes
  in that, and the deploy after #230 fell into one: a Blow drawn across a pool
  lost 54 of its 229 of dye (main's deploy, run 37177982848), the old eraser's
  size of loss, though the wind had run 49 steps and carried 156.5. The
  stroke had also run 5 straw steps, and a straw step blows a real bubble,
  whose air takes the dye under it off the plate (airExclude) for as long as
  the bubble sits there.
  - A press has no move before it, so every step between the press and the
    first move the pointer reports was a straw step: a drag began by blowing
    a bubble in the middle of whatever it was drawn through. At 10 to 30
    frames a second, as the Mac runner draws, that is a frame or two of steps
    before the first move arrives (2, 3, 5 and 7 straw steps on its runs).
  - On a slow frame rate a hand that never stops reports its moves a frame
    apart, and 150 ms is a frame and a half at 10 fps: a drag on a struggling
    machine was a straw every time a move came a frame late.
  So the press starts the hold's clock as a move does, and the hold is both
  the time (a hand on a fast machine still reads as held within a sixth of a
  second) and a few frames with no move in them (a hand on a slow one that is
  moving reports a move every frame, and is not held).
*/
export const BLOW_STRAW_FRAMES = 3;

export type BlowDir = { x: number; y: number; at: number; still: number; moved: boolean };

/** With Drop Height up, a held dropper lets go of a drop every this many solver steps (six a second). */
export const DROP_EVERY = 10;

/*
  What one hand's Drop has handed the plate since it landed: the solver steps
  it was held on the plate, the drops it let go of (Drop Height up), and the
  dye it gave, the sum of every cell's share it put into the deltas (a drop
  counts its whole amount). Each finger keeps its own, so a second finger
  that started late or was skipped on some steps shows it here, before the
  solver has touched anything; `npm run phone` holds two fingers' counts to
  each other and the plate's dye to them.
*/
export type DropLaid = { steps: number; drops: number; dye: number };

export const freshLaid = (): DropLaid => ({ steps: 0, drops: 0, dye: 0 });

/*
  The bottle, from every tool that lays liquid.

  Only the Dropper put the selected bottle's liquid on the plate. Pour,
  Spray, Splat and Streak laid its colour and nothing else, so with the
  Ferrofluid bottle picked a Pour laid a pool of near-black dye that the
  Magnet could not move, and Oil laid orange water that never became an
  oil body; soap, milk, silicone and glycerine were only colours. That is
  the first row of the tool-by-liquid audit (PLAN §15), and the one a
  performer meets first: you pick a liquid and a way of putting it down,
  and you get the liquid.

  Each laying tool now calls this on the disc it lays, at the dose it lays
  with (1 is the Dropper's at the default Amount). A deposit is a pass on
  the GPU when the liquid reaches one of its fields (addPhase, addMix: a
  whole-plate dispatch and a submit each, two for Silicone with Oil
  Bodies), so every tool makes one a step per hand, as a held Dropper
  always has: the many-point tools (Spray, Splat) at one of their points,
  which wanders over the mist as the hand goes, not at all twelve.
*/
export function layBottle(af: FluidSimulation, x: number, y: number, r: number, liq: LiquidType | undefined, dose: number): void {
  if (!liq?.behaviour || !(dose > 0)) return;
  af.liquid.deposit(x, y, Math.max(1, r), liq.behaviour, dose, af.dtSeconds);
}

/** The tools that lay the bottle: every hand but the Blow, the Press, the Finger, the Magnet and the Spin. */
export const LAYING_TOOLS: ReadonlySet<string> = new Set(['dropper', 'drop', 'pour', 'spray', 'splatter', 'streak']);

export function bottleReach(liq: LiquidType | undefined, r: number): number {
  return Math.min(r, Math.max(2, (liq?.injectRadius ?? 3) * GRID_SCALE));
}

/*
  How much of a tool's usual dye a bottle lays with it.

  One, except for a liquid the plate draws itself. The ferrofluid's black is
  the second phase, drawn by the plate from where the phase is; its bottle's
  dye is a whisper (injectAmount 0.05, against 0.6 for Water) that the
  Dropper already honours by laying injectAmount. The other tools lay a
  fixed amount of whatever colour is picked, which for the Ferrofluid
  bottle was a heavy stain of near-black dye under the pool: the Magnet
  drew the ferrofluid off it and the stain stayed where it had been poured.
  So a magnetic bottle scales their dye by its own dose against the
  Dropper's default; every other bottle lays what it always did.
*/
export function bottleDye(liq: LiquidType | undefined): number {
  if (!((liq?.behaviour?.magnetic ?? 0) > 0)) return 1;
  return Math.min(1, (liq?.injectAmount ?? 0.8) / 0.8);
}

/**
 * Pour one dose of whatever the preset keeps in the dish.
 *
 * Picks uniformly from the list, so the inert entries are the dilution: most
 * of the time this lands on `water`, which carries no property, which is what
 * makes `['water', 'water', 'soap']` a different plate from `['soap']`. On a
 * thin gap the water is still liquid (PLAN 18c): its volume pushes what is
 * there aside, and is what flushes the glycerine these looks pour (18d-2).
 *
 * The dose is scaled by the plate's remaining headroom for that liquid, so a
 * show left running overnight cannot end as a dish of solid glycerine. See
 * `CEILING` in `liquidPhase.ts` for why that matters and `npm run liquids`
 * for the measurement — unchecked, an hour of this leaves 92% of the plate
 * too thick to move.
 */
export function doseLiquid(fluid: FluidSimulation, ids: string[], x: number, y: number, strength = 1): void {
  if ((window as any).__bottleTest) return;
  if (ids.length === 0) return;
  pourLiquid(fluid, DICE.liquids.pick(ids), x, y, strength);
}

/**
 * One dose of one named liquid: what `doseLiquid` pours once it has picked the
 * bottle, and what an area of the dish (lib/plateAreas.ts) pours, whose bottle
 * is its own and is not drawn for.
 */
export function pourLiquid(fluid: FluidSimulation, id: string, x: number, y: number, strength = 1): void {
  const liq = LIQUIDS_BY_ID.get(id);
  if (!liq?.behaviour) return;
  const room = fluid.liquid.headroom(liq.behaviour);
  if (room <= 0.02) return;
  const r = Math.max(2, Math.round((liq.injectRadius ?? 3) * GRID_SCALE));
  // Emulsion scattering (milk/oil cloudiness) needs a host body to sit in:
  // a colourless bottle dose landing on empty black water (`!hasDye`) otherwise
  // lays a grey-white scattering cloud across the dark ground (PLAN 28d-A).
  const ix = Math.max(0, Math.min(fluid.size - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(fluid.size - 1, Math.round(y)));
  const idx = ix + iy * fluid.size;
  const hasDye = (fluid.density[idx] ?? 0) + (fluid.readDensity?.[idx] ?? 0) >= 0.05;
  const b = liq.behaviour.scatter && !hasDye ? { ...liq.behaviour, scatter: 0 } : liq.behaviour;
  fluid.liquid.deposit(x, y, r, b, AUTO_DOSE * strength * room);
}
