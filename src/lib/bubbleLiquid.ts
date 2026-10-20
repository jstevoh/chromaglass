/**
 * The liquid a bubble is in (PLAN 33f).
 *
 * A bubble on the plate is an air pancake between the glasses, and what it
 * does is the liquid's doing: how fast it runs ahead of the flow (Bretherton's
 * film, set by the capillary number μU/σ), how long two bubbles can touch
 * before the film between them drains (Stefan–Reynolds, ∝ μ/σ), how slowly it
 * climbs a tilted plate (the gap's Darcy law, ∝ Δρ/μ), how far it stretches
 * under drag and how long it rings after a knock (both ∝ μ against σ). Until
 * now every one of those read one liquid, a light mineral oil, whatever the
 * Thickness dial said or whatever had been poured. This module says what the
 * liquid is, in SI units, where a bubble is:
 *
 *   plateLiquid(thickness)      the clear liquid the Thickness dial stands for
 *   liquidAtCell(...)           the clear liquid with the poured liquid at a
 *                               cell mixed in, from the GPU's species field
 *
 * Pure, so the check (`npm run bubblephysics`) and the show read the same
 * numbers. Nothing here touches the GPU: the visualizer reads the species
 * field back about once a second (it already does, for the automation's
 * headroom) and hands the snapshot in.
 *
 * Anchored so that nothing moves at the default. The numbers bubbles.ts has
 * always used (μ 17 mPa·s, σ 30 mN/m, ρ 850 kg/m³, a light mineral oil) are
 * this module's values at Thickness 0.45, the dial's default, exactly, and
 * every other quantity here is a ratio to them, so a plate left at its
 * default with nothing poured draws and moves every bubble as it did.
 */
import { thicknessViscosity } from './turntable.ts';
import { WATER_NU } from './liquidProps.ts';

/** What a bubble sees of the liquid round it, SI. */
export interface BubbleLiquid {
  /** Dynamic viscosity, Pa·s. */
  mu: number;
  /** Surface tension against air, N/m. */
  sigma: number;
  /** Density, kg/m³ (the buoyancy a bubble climbs a tilted plate on, air being nothing against it). */
  rho: number;
  /** Kinematic viscosity, m²/s. */
  nu: number;
}

/**
 * The Thickness the bubbles' reference numbers are the liquid of: the dial's
 * default (src/types.ts gapThickness, fluid.ts THIN_GAP_THICKNESS), a light
 * mineral oil. `npm run bubblephysics` reads types.ts and says so if the two
 * ever part.
 */
export const REF_THICKNESS = 0.45;
export const REF_MU = 0.017;
export const REF_SIGMA = 0.030;
export const REF_RHO = 850;

/*
  What the dial's liquid is, as the properties it does not set. Thickness is a
  viscosity (water at 0, glycerine at 1, on a log scale, fluid.ts), and the
  viscosity alone says nothing about the tension or the weight: water is 72
  mN/m, a light mineral oil 30, glycerine 63. These three knots take the
  real liquid at each end and at the default, and read straight lines
  between them in Thickness. Shortcut, named in PLAN 33f: along the dial the
  liquid is really a family (water, then oils, then syrups) that no one line
  describes, and the piecewise line only keeps the ends and the middle right.
*/
const KNOTS: ReadonlyArray<readonly [thickness: number, sigma: number, rho: number]> = [
  [0, 0.072, 1000],
  [REF_THICKNESS, REF_SIGMA, REF_RHO],
  [1, 0.0634, 1261],
];

function knotted(t: number): { sigma: number; rho: number } {
  const x = Math.max(0, Math.min(1, Number.isFinite(t) ? t : REF_THICKNESS));
  const i = x < KNOTS[1][0] ? 0 : 1;
  const [t0, s0, r0] = KNOTS[i];
  const [t1, s1, r1] = KNOTS[i + 1];
  const f = (x - t0) / (t1 - t0);
  return { sigma: s0 * (1 - f) + s1 * f, rho: r0 * (1 - f) + r1 * f };
}

/** The clear liquid the Thickness dial (0 to 1) stands for. Exactly the bubbles' old numbers at the default. */
export function plateLiquid(thickness: number): BubbleLiquid {
  const nu = thicknessViscosity(Number.isFinite(thickness) ? thickness : REF_THICKNESS);
  const { sigma, rho } = knotted(thickness);
  /*
    μ = ρν is what a liquid's viscosity is, and would put water at 1.0 mPa·s
    and glycerine at 1.3 Pa·s (real: 1.0 and 1.4), but the default at 19
    mPa·s, where the bubbles' reference has always been 17 (a light mineral
    oil is 17 to 19 by its grade). So it is anchored: the reference times the
    ratios of density and of kinematic viscosity, which is ρν scaled by the
    one factor (0.89) that makes the default exact. Water comes out at 0.89
    mPa·s (11% under the real 1.0) and glycerine at 1.13 Pa·s (20% under the
    real 1.41, since the dial's glycerine is a kinematic 1.0 St against the
    real 1.12), which the check (`npm run bubblephysics`) holds it to.
  */
  const mu = REF_MU * (rho / REF_RHO) * (nu / thicknessViscosity(REF_THICKNESS));
  return { mu, sigma, rho, nu };
}

/** The species field read back: L×L cells of share, Σ share·ln(ν/ν_water), Σ share·μs′ (scatter), Σ share·index. The density is not in it. */
export interface SpeciesSnapshot {
  L: number;
  data: Float32Array;
}

/**
 * The liquid at a plate position (x, y in the bubbles' grid, 0..grid): the
 * clear liquid and what has been poured into it, as the species field holds
 * them (lib/liquidProps.ts). `out` is filled and returned so a frame's worth
 * of bubbles allocates nothing.
 *
 * The mix is the one the thin gap's drag takes (hsPrep): with r the poured
 * share of the column, ln(ν/ν_w) = (1−r)·ln(ν_plate/ν_w) + Σ share·ln(ν_i/ν_w),
 * the Arrhenius rule for miscible liquids, with the same ±9 bound on the poured
 * part's log ratio the solver puts on it (an additive pour can briefly hold more
 * than one column, and the field's log channel is not normalised). The field
 * holds no density and no tension (the solver needs neither), so the poured
 * part takes `pouredRho` (kg/m³) and `pouredSigma` (N/m), those of the liquid
 * last poured: a shortcut, named in PLAN 33f, that is exact for a plate with
 * one poured liquid on it and approximate for a mix of two.
 */
export function liquidAtCell(
  plate: BubbleLiquid, snap: SpeciesSnapshot | null, x: number, y: number, grid: number, pouredSigma: number, pouredRho: number,
  out: BubbleLiquid,
): BubbleLiquid {
  out.mu = plate.mu; out.sigma = plate.sigma; out.rho = plate.rho; out.nu = plate.nu;
  if (!snap) return out;
  const L = snap.L;
  const ix = Math.max(0, Math.min(L - 1, Math.floor((x / grid) * L)));
  const iy = Math.max(0, Math.min(L - 1, Math.floor((y / grid) * L)));
  const at = (ix + iy * L) * 4;
  const r = Math.max(0, Math.min(1, snap.data[at]));
  if (!(r > 1e-4)) return out;
  const lnPlate = Math.log(plate.nu / WATER_NU);
  const lnNu = lnPlate + Math.max(-9, Math.min(9, snap.data[at + 1] - r * lnPlate));
  const nu = WATER_NU * Math.exp(lnNu);
  const rho = (1 - r) * plate.rho + r * pouredRho;
  if (!(nu > 0) || !(rho > 0)) return out;
  out.nu = nu;
  out.rho = rho;
  // Viscosity scales with the kinematic one and the density together (μ = ρν).
  out.mu = plate.mu * (nu / plate.nu) * (rho / plate.rho);
  out.sigma = (1 - r) * plate.sigma + r * pouredSigma;
  return out;
}

/*
  The scalings below turn those into how much faster or slower a bubble does
  each thing than the reference liquid, 1 at the reference exactly. Each is
  clamped, and each clamp is a named shortcut in PLAN 33f.
*/

/** The climb of a bubble up a tilted plate against the reference: Darcy in the gap, ∝ Δρ/μ, with the inertial ceiling (the clamp) a real gap meets in water. */
export function riseScale(l: BubbleLiquid): number {
  return Math.max(0.02, Math.min(4, (l.rho / REF_RHO) * (REF_MU / l.mu)));
}

/** Viscous-capillary ratio μ/σ against the reference: how far a bubble stretches under drag, and how slowly a film drains. */
export function viscocapillary(l: BubbleLiquid): number {
  return (l.mu / l.sigma) / (REF_MU / REF_SIGMA);
}

/** The stretch a drag gives a bubble against the reference (Ca-proportional deformation), clamped so honey does not smear one and water keeps its round. */
export function stretchScale(l: BubbleLiquid): number {
  return Math.max(0.3, Math.min(3, viscocapillary(l)));
}

/** How fast a wobble runs down against the reference (shape oscillations damp ∝ μ/ρR²), clamped. */
export function dampScale(l: BubbleLiquid): number {
  return Math.max(0.3, Math.min(3, (l.mu / REF_MU) * (REF_RHO / l.rho)));
}

/** How fast gas crosses between bubbles against the reference, for a tension σ: the Laplace pressure that drives it is ∝ σ. */
export function ripenScale(sigma: number): number {
  return sigma / REF_SIGMA;
}
