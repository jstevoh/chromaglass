/**
 * What a poured liquid is, as the GPU's species field carries it (PLAN 18d).
 *
 * The plate's clear liquid is one liquid, the look's Thickness. A bottle that
 * is a different liquid and mixes with it (glycerine, syrup, milk, alcohol)
 * replaces a share of the column where it lands, and that share keeps its own
 * viscosity as the flow carries it about: four numbers a cell, each a sum over
 * the poured liquids weighted by their share of the column, so the flux-form
 * carry that moves them conserves every one.
 *
 *   r  the share of the column that is poured liquid, 0 to 1
 *   g  Σ share · ln(ν / ν_water), the kinematic viscosity's log
 *   b  Σ share · ρ, g/cm³
 *   a  Σ share · n, the refractive index
 *
 * The log, because that is how two miscible liquids' viscosities mix: the
 * Arrhenius (Grunberg–Nissan) rule, ln μ = Σ xᵢ ln μᵢ, so glycerine half
 * mixed into water is about the geometric mean of the two, about 38 times
 * water, where the arithmetic mean would say 700. It is the rule PLAN 18d
 * names (μ = μ_w^(1−c) μ_g^c) and the one the ferrofluid's share already
 * takes against the clear liquid in hsPrep. And it is linear in the shares,
 * which is what lets a carry that only conserves move it.
 *
 * With the clear liquid ν_p making up the rest of the column, a cell's
 * viscosity against the plate's is exp(g − r·ln(ν_p/ν_w)) (hsPrep in
 * src/gpu/wgsl/thinGap.ts).
 *
 * Kinematic, ν = μ/ρ, because the thin gap's drag is 12ν/h² per unit of the
 * liquid's own inertia: alcohol at 1.2 mPa·s and 0.79 g/cm³ answers a push
 * a little faster than water, not a little slower.
 */
import type { LiquidBehaviour } from '../types';
import { DISH_METRES, DISH_GAP_METRES } from './turntable.ts';

/** What speciesOf reads of a bottle: its behaviour, or the deposit made from it (lib/liquidPhase.ts). */
type Poured = Pick<LiquidBehaviour, 'magnetic' | 'polarity' | 'body' | 'weight' | 'viscosity' | 'density' | 'index' | 'scatter' | 'tension' | 'interfacial'>;

/** Water's kinematic viscosity, m²/s: Thickness 0 (thinGapViscosity). */
export const WATER_NU = 1e-6;

/*
  How long the CPU's body lasts, in seconds to a third of itself
  (lib/liquidPhase.ts): only where the GPU does not hold the liquid itself,
  the old plate and a plate with no thin gap. On a thin gap nothing fades
  the poured liquid any more: it stays until clear liquid poured after it
  has pushed it out over the rim, as a real dish is flushed (PLAN 18d-2),
  and the automation's headroom reads the GPU's share instead.
*/
export const SPECIES_SECONDS = 22;

/*
  A bottle the owner made in the Liquid Designer has `body` (thicker than
  water, 0 to 1) and no viscosity. Glycerine is body 1 on the shelf, so a
  body is read as that share of glycerine's log viscosity: body 0.5 is about
  33 times water by the kinematic measure, the geometric mean, the same
  order as the shelf's own syrup (body 0.5, 111 times water by its real
  numbers).
*/
const GLYCERINE_LN_NU = Math.log((1412 / 1.261) * 1e-6 / WATER_NU);

/** What a bottle puts into the species field, or null when it is not a liquid of its own that mixes with the plate's. */
export interface Species {
  /** ln(ν / ν_water). */
  lnNu: number;
  /** g/cm³. */
  density: number;
  /** Refractive index. */
  index: number;
  /** Reduced scattering coefficient μs′, 1/mm. */
  scatter: number;
}

/**
 * The species a pour lays, from its behaviour.
 *
 * None for the immiscible bottles: the ferrofluid has its own phase (whose
 * viscosity hsPrep already takes, FERRO_NU), and oil and silicone go into
 * the oil's phase (Oil Tension) or the clear film; 18d's next piece gives
 * that phase its own viscosity (PLAN 18d-3). None for a solution either
 * (no viscosity and no body): it is the plate's own liquid.
 */
export function speciesOf(what: Poured | undefined): Species | null {
  if (!what || (what.magnetic ?? 0) > 0 || (what.polarity ?? 0) <= -0.5) return null;
  const body = what.body ?? 0;
  const scatter = what.scatter ?? 0;
  if (!(what.viscosity && what.viscosity > 0) && !(body > 0) && !(scatter > 0)) return null;
  const density = what.density && what.density > 0 ? what.density : 1 + (what.weight ?? 0);
  const lnNu = what.viscosity && what.viscosity > 0
    ? Math.log((what.viscosity / density) * 1e-6 / WATER_NU)
    : Math.min(1, body) * GLYCERINE_LN_NU;
  /*
    Floored at water's: the carry that moves the field never lets a channel
    go below zero (bodyAdvect, built for the dye), and nothing on the shelf
    is thinner than water by more than alcohol's few percent, which on a
    plate whose clear liquid is water is no contrast at all.
  */
  return { lnNu: Math.max(0, lnNu), density, index: what.index && what.index > 0 ? what.index : 1.333, scatter };
}

/*
  How fast a held bottle pours, m³ a second: 0.5 mL/s, a dropper's bulb
  squeezed steadily, about ten drops of 0.05 mL a second. On a thin gap a
  pour is volume (PLAN 18c): it pushes the liquid already there out of its
  way, and what reaches the rim leaves. So a held tool cannot put a whole
  column of its disc down every step, as the body's dose did (a disc a
  dropper wide holds a fifth of a millilitre, which a step would fill three
  times a second at this rate); it puts down what the dropper lets go in
  the step.

  It was 2 mL/s first, a bottle tipped to a thin stream, and on the Mac
  (`node scripts/mirror.mjs`) four held drops of the Dropper on Classic's
  second plate pushed the colour of the drops before them two cells of a
  6×6 grid out from the hand (74.7 past the plate's drift, 27 allowed,
  twice). A dropper is not a stream; a Pour should let go more (PLAN 18c-5).
*/
export const HELD_POUR = 0.5e-6;

/**
 * The share of the column a pour adds at the middle of its disc: what the
 * GPU's `pour` takes (src/gpu/fluid.ts).
 *
 * `radius` is in plate widths. With `seconds`, a held bottle's stream for
 * that long: HELD_POUR·seconds over the dome the pour lands as, half the
 * disc's area times the rest gap (lib/turntable.ts DISH_GAP_METRES). Without, a one-shot dose (a drop
 * that falls, the automation's): `amount` is the share, as the body's is.
 */
export function pourShare(radius: number, amount: number, seconds?: number): number {
  if (!(amount > 0)) return 0;
  if (seconds === undefined) return Math.min(1, amount);
  const r = radius * DISH_METRES;
  const dome = (Math.PI * r * r) / 2 * DISH_GAP_METRES;
  return Math.min(1, (amount * HELD_POUR * Math.max(0, seconds)) / dome);
}

/*
  The oil's surface tension against the water it floats in, N/m (PLAN 38e):
  the σ of the capillary force that rounds a drop and pulls a thread in
  (mixForce in src/gpu/wgsl/fluid/capillary.ts, whose speed is h²σκ/12μ
  between the glasses). What matters is the tension of the oil's interface
  with water, not with air: a bottle that will not mix carries it as
  `interfacial`, measured (sunflower oil about 27 mN/m, a 50 cSt silicone
  oil about 37). A bottle made in the Liquid Designer may carry only its
  tension against air, and then the interface's is Antonow's rule, the
  difference of the two liquids' own, |γ_w − γ_o|: right for an oil with no
  polar part (paraffin, 72.8 − 30 = 43 against a measured 40 to 50) and
  high for a vegetable oil, whose polar traces sit at the interface, which
  is why the shelf's bottles carry the measured number instead. A bottle
  with neither is the shelf's Oil.
*/
/** Water's surface tension against air, N/m. */
export const WATER_SIGMA = 0.0728;
/** The shelf's Oil (sunflower) against water, N/m: what any oil without a number of its own is. */
export const OIL_SIGMA = 0.027;
/**
 * The top of Oil Tension, the dial that says how many times the oil's own
 * tension the plate's is: 1 is the oil's, and three times it is a look
 * pushed past what oil and water do (the owner, 2026-10-30: settings may go
 * past real, the physics under them may not).
 */
export const OIL_TENSION_MOST = 3;
/** σ of a bottle's interface with water, N/m (the comment above says from what). */
export function interfacialTension(what: Poured | undefined): number {
  if (what?.interfacial && what.interfacial > 0) return what.interfacial * 1e-3;
  if (what?.tension && what.tension > 0) return Math.max(0.001, Math.abs(WATER_SIGMA - what.tension * 1e-3));
  return OIL_SIGMA;
}
