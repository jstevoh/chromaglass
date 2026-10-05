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

/** What speciesOf reads of a bottle: its behaviour, or the deposit made from it (lib/liquidPhase.ts). */
type Poured = Pick<LiquidBehaviour, 'magnetic' | 'polarity' | 'body' | 'weight' | 'viscosity' | 'density' | 'index'>;

/** Water's kinematic viscosity, m²/s: Thickness 0 (thinGapViscosity). */
export const WATER_NU = 1e-6;

/*
  How long a poured liquid lasts on the plate, in seconds to a third of
  itself: the CPU's body fades on it (lib/liquidPhase.ts) and the GPU's
  species on the same, so the automation's headroom, which reads the CPU's,
  agrees with what the flow feels. A liquid does not evaporate as a
  property: this stands in for the dish being flushed, as the colour's
  fade does, until 18g makes both leave by flushing (PLAN 18d-2).
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
  if (!(what.viscosity && what.viscosity > 0) && !(body > 0)) return null;
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
  return { lnNu: Math.max(0, lnNu), density, index: what.index && what.index > 0 ? what.index : 1.333 };
}
