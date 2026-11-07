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
import { GRID_SCALE, GRID_SIZE } from './constants';
import { DICE } from './dice';
import { fluidSink, type AreaSink } from '../lib/areaCords';

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

/**
 * Where the area cords (lib/areaCords.ts) lay on a plate: the Finger's paddle,
 * the heat and the dye through the plate's own methods, and an area of a
 * reagent's drop poured as that bottle (PLAN 25i).
 */
export const areaSink = (fluid: FluidSimulation): AreaSink => fluidSink(fluid, GRID_SCALE, pourLiquid);

/**
 * The pointer's press and stir along a move with the button down, for the
 * tools that still take them: a press of the glass under the pointer and a
 * shove five times the move. Moved out of `components/LiquidVisualizer.tsx`
 * (handleMouseMove) unchanged. `x, y` the pointer's cell on the plate,
 * `dx, dy` the move in cells with the plate's uv counting up. Which tools
 * do not take them, and why, is below; the Magnet and the Spin return before
 * the button is read, and a button that is up never reaches here.
 */
export function stirAlongMove(fluid: Pick<FluidSimulation, 'applySquish' | 'addVelocity'>, tool: string, x: number, y: number, dx: number, dy: number): void {
  if (!(x > 0 && x < GRID_SIZE - 1 && y > 0 && y < GRID_SIZE - 1)) return;
  /*
    Not under the Finger either: it carries the dye it touches
    (carryDye) and does not press the glass. A press here is a squeeze-
    film source, a flow that spreads out from under it, and dye
    advected through a spreading flow is copied over more plate than it
    came from: a stroke is thirty of these, and npm run tools measured
    the Finger adding dye (512 -> 1484 against +216 left alone) after
    its own carry had been made to conserve.
  */
  /*
    Nor under the Drop: it puts paint down and that is all. Reported
    twice as a "press or blow" going off with every drop; whatever else
    is found, a drop that also squeezes the film and shoves it along the
    stroke is not a drop.
  */
  if (tool === 'dropper') return;
  /*
    And the Finger neither presses nor stirs: its carry moves the dye.
    With the stir's vertical sign put right it pushed along the stroke,
    and a push through the film spreads the dye it carries over more
    plate than it came from, the same copying the press did (npm run
    tools: 310 -> 459 against +57 left alone).
  */
  if (tool === 'finger') return;
  /*
    Nor under the Blow. On a thin gap the moving Blow is the breath's stress
    on the film, laid once a solver step for as long as the stroke goes on
    (fluidSimulation.ts blowWind, PLAN 15g); this press came besides, once a
    pointer event, a bowl 24 cells across (about 440 cells a press) pressed into the glass at the
    pointer, and the stir with it. The pointer leads the pool it blows
    across, so each press squeezed the pool's liquid back the way the stroke
    came, against the breath, and the gap it closed along the stroke opened
    again over the gap's memory for seconds after, drawing the liquid toward
    the stroke's end. The presses came thirty a stroke whatever the pace and
    the breath's steps with the runner's: the CI Macs step 12 to 23 times a
    second, so `npm run tools`' stroke of fixed wall time got 38 to 71 steps
    of breath against the owner's machine's 180, and its "pushes the colour
    along, whichever way it blows" read -0.07% to +1.6% of the plate against
    +0.15% to beat, red on 13 of 187 Mac runs in the week to 2026-10-24
    (PLAN 15g-7, QA-20b; #465 then doubled the stroke's time, and the line
    went red once in 354), with the drift in the two windows after the
    stroke +0.2% to +0.35% toward it on every run, the ones that pushed
    nothing included, where the breath's own flow is spent within half a
    second. The lab at the app's own step, parameters, geometry and pool
    (the owner's handoff folder, blowlab5.mjs), thirty moves over 45 solver
    steps: the breath alone moved the pool's middle +1.74% of the plate and
    sat still after 0.4 s; with this press on each move it read -0.32%
    during the stroke and crept +0.75% in the 2.5 s after; the press alone
    -0.80% then +1.1%; the stir with the press the same as the press
    (-0.32%). Over 88 steps, the 3000 ms stroke's on those Macs, the press
    left +0.72% of the breath's own, then +0.9% of creep. The straw's bubble
    (a Blow held still) presses the plate as every bubble does, counted as
    the bubble's (lib/squish.ts Presser), and the Press tool keeps its own
    squish; `npm run tools` counts the glass the hand presses in a Blow
    stroke and asks for none.
  */
  if (tool === 'blow') return;
  fluid.applySquish(x, y, 8, 0.005);
  // A touch passes no move (its handler never stirred): no stir, and no row marked for nothing.
  if (dx || dy) fluid.addVelocity(x, y, dx * 5, dy * 5);
}
