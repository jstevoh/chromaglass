/*
  Keep full (PLAN 18a-22): a dish left running is topped up with the dropper.

  What was reported. The owner left the player running for an evening on Lava
  Pop with Evolve off, and the plate emptied. Two things take colour off a dish
  over hours. The Mac app that night was 1.3.1751 (built 9:18 AM PST 11-26),
  before the draught's uniform shear stopped sliding the thin gap's liquid out
  over its open rim (PLAN 18a-16, #968) and before Rain Drip and the no-oil
  rock went through the closed circulation (18a-17, #979): Lava Pop's Air of
  0.02 was that shear. And every look's Evaporation still takes a share of the
  dye each step (fluidSimulation.ts `perStep`, the named regulator shortcut of
  PLAN 18g that dye.ts's decay applies): small, but over a night it is most of
  the dish. Nothing put any back, because the only thing that pours on its own
  is Evolve, and Evolve also blows, strokes, thins and changes the look.

  What a person does. Someone minding a real dish under a lamp does not stir it
  or change it when it runs thin; they pick up the dropper, take a drop of what
  is already on the bench and let it fall where the dish has gone pale, then
  another a few seconds later, until it reads full again, and then leave it
  alone. That is all this is: the hand's own Drop (`dropBottle`, the same call
  the remote's Drop makes), a real drop of the look's own bottle in one of the
  look's own colours, falling with its volume onto the thin gap (so what is
  over spills at the rim, PLAN 18c-1), aimed at the palest of a few places it
  could land. No fade-in, no regulator reaching into the field: the dye arrives
  as drops do and spreads as the liquid carries it.

  When. It watches the dish's own measure (`meanDensity`, inside the rim on a
  thin gap) against the amount the look is made with (`lookTarget`, the same
  target Evolve's drops and the regulator use). It starts below KEEP_FULL_LOW
  of it and keeps going until KEEP_FULL_HIGH, the gap between them being why a
  person does not fuss over a dish that is nearly right: without it, each drop
  that took the dish over the line and each pale minute after it would
  alternate at the line, a drip every few seconds for ever. The emptier the
  dish, the sooner the next drop (KEEP_FULL_SLOW_S just under the line to
  KEEP_FULL_FAST_S on an empty one), and the bigger, up to a hand's full drop.
  The interval is in seconds of the wall, not steps: a person's hand keeps the
  room's time, and the measure it reads comes back from the GPU every few
  frames, so a drop never goes in before the last one has been seen.

  What it leaves alone. A look whose dye is meant to be clear (a clear-phase
  look, as Evolve's `clearPhase` reads it) has nothing here to top up. A plate
  that is draining (the Drain button) or stopped is not topped up. It never
  touches the look's settings, so it runs beside Evolve, a sequence or the
  music without moving any of them; it is the room's switch (lookFade.ts
  RIG_KEYS), so a look change leaves it as it was.
*/
import type { FluidSimulation } from './fluidSimulation';
import type { LiquidType } from '../types';
import { lookTarget } from '../lib/dyeTarget';
import { GRID_SCALE } from './constants';
import { dropBottle } from './dropSplash';
import { bottleDye } from './tools';

/** Below this share of the look's own amount the dish is topped up. */
export const KEEP_FULL_LOW = 0.8;
/** And it is topped up until it is back to this share of it. */
export const KEEP_FULL_HIGH = 0.95;
/** Seconds between drops on a dish just under the line, and on an empty one. */
export const KEEP_FULL_SLOW_S = 6;
export const KEEP_FULL_FAST_S = 1.2;
/** A drop's amount at full, the hand's own Drop with the pen pressed all the way (LiquidVisualizer's remote `drop`, 5 × amount). */
export const KEEP_FULL_DROP = 5;
/** How far from the middle a drop lands on a look with no areas, as a share of the plate (the thin gap's rim is at 0.5). */
export const KEEP_FULL_REACH = 0.4;
/** Places a drop could land, of which it takes the palest. */
export const KEEP_FULL_TRIES = 4;
/** Layers watched (the plate and its back plates). */
const LAYERS = 8;

export interface KeepFullState {
  /** Wall-clock seconds of each layer's last drop. */
  lastAt: Float64Array;
  /** 1 while a layer is being topped up (between LOW and HIGH). */
  topping: Uint8Array;
  /** Drops laid since the show opened, for the harness. */
  drops: number;
}

export const keepFullState = (): KeepFullState => ({ lastAt: new Float64Array(LAYERS).fill(-1e9), topping: new Uint8Array(LAYERS), drops: 0 });

/**
 * The size of the next top-up drop on a layer, 0..1 of a hand's full drop, or
 * 0 for none now. Pure (no field, no clock of its own), so `npm run keepfull`
 * can hold its sums by themselves: `mean` the dish's measure, `target` the
 * look's own amount, `since` seconds since this layer's last drop. Updates
 * `topping[layer]`.
 */
export function keepFullDose(topping: Uint8Array, layer: number, mean: number, target: number, since: number): number {
  if (!(target > 0.01) || !Number.isFinite(mean)) { topping[layer] = 0; return 0; }
  const full = mean / target;
  if (full >= KEEP_FULL_HIGH) { topping[layer] = 0; return 0; }
  if (full < KEEP_FULL_LOW) topping[layer] = 1;
  if (!topping[layer]) return 0;
  // How short of the line it is, 0 just under it to 1 on an empty dish.
  const short = Math.max(0, Math.min(1, 1 - full / KEEP_FULL_HIGH));
  const every = KEEP_FULL_SLOW_S - (KEEP_FULL_SLOW_S - KEEP_FULL_FAST_S) * Math.min(1, short * 1.6);
  if (since < every) return 0;
  return 0.35 + 0.65 * Math.min(1, short * 1.6);
}

/** Where a top-up lands and what falls: the component fills it in (its look's areas, harmony and bench). */
export interface KeepFullAim {
  x: number; y: number;
  r: number; g: number; b: number;
  liquid: LiquidType | undefined;
}

export interface KeepFullHands {
  /**
   * A place for the next drop on `layer` (in one of the look's areas when it
   * has them, else anywhere in the dish), the colour that falls there and the
   * bottle it comes from, written into `out`. Called KEEP_FULL_TRIES times a
   * drop; the palest place wins and its colour and bottle go with it.
   */
  aim(layer: number, fluid: FluidSimulation, out: KeepFullAim): void;
}

const tryAim: KeepFullAim = { x: 0, y: 0, r: 0, g: 0, b: 0, liquid: undefined };
const bestAim: KeepFullAim = { x: 0, y: 0, r: 0, g: 0, b: 0, liquid: undefined };

/**
 * One frame of the hand that keeps the dish full: for each layer, a drop when
 * `keepFullDose` asks for one. `now` in seconds of the wall clock, `dyeBudget`
 * the look's Dye Budget, `phaseAmount` its Phase Amount (a layer seeded with
 * no dye and a phase on it is a clear-phase look, as Evolve reads it, whose
 * dye stays clear). Returns the drops laid this frame.
 */
export function stepKeepFull(k: KeepFullState, fluids: readonly (FluidSimulation | null | undefined)[], now: number, dyeBudget: number, phaseAmount: number, hands: KeepFullHands): number {
  let laid = 0;
  const n = Math.min(fluids.length, LAYERS);
  for (let li = 0; li < n; li++) {
    const af = fluids[li];
    if (!af) continue;
    if (af.seedMean === 0 && phaseAmount > 0.002) { k.topping[li] = 0; continue; }
    const target = lookTarget(af.seedMean, dyeBudget, af.seedBudget);
    const dose = keepFullDose(k.topping, li, af.meanDensity, target, now - k.lastAt[li]);
    if (dose <= 0) continue;
    // The palest of a few places: a person drops where the dish has gone thin.
    const field = af.readDensity, N = af.size;
    let best = Infinity;
    for (let t = 0; t < KEEP_FULL_TRIES; t++) {
      hands.aim(li, af, tryAim);
      const ix = Math.max(0, Math.min(N - 1, Math.round(tryAim.x)));
      const iy = Math.max(0, Math.min(N - 1, Math.round(tryAim.y)));
      const here = field?.[ix + iy * N] ?? 0;
      if (here < best) { best = here; Object.assign(bestAim, tryAim); }
    }
    const liq = bestAim.liquid;
    const x = Math.round(bestAim.x), y = Math.round(bestAim.y);
    dropBottle(af, x, y, KEEP_FULL_DROP * dose * bottleDye(liq), bestAim.r, bestAim.g, bestAim.b, 1,
      liq?.behaviour, Math.max(2, (liq?.injectRadius ?? 3) * GRID_SCALE), dose);
    k.lastAt[li] = now;
    k.drops++;
    laid++;
  }
  return laid;
}
