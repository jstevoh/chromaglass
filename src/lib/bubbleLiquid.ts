/**
 * The liquid under a bubble, read from the GPU's species field (PLAN 33f).
 *
 * Since PLAN 38n a bubble's motion has followed the look's carrier liquid
 * (`BubbleField.liquid(settings)` in `src/lib/bubbles.ts`): one viscosity from
 * the Thickness dial and one surface tension and density from whether the dish
 * is water or oil. A bottle poured into the dish (glycerine, syrup, milk,
 * alcohol) replaces a share of the column where it lands and rides the flow in
 * the solver's species field (`src/lib/liquidProps.ts`, PLAN 18d), so the
 * fluid solver drags on it cell by cell, while a bubble pocket in a pool of
 * poured glycerine still ran ahead of the flow, climbed a tilt, drained its
 * contact film and rounded off as though it sat in the clear oil beside it.
 *
 * `liquidAtCell` reconstructs the column's dynamic viscosity μ, surface
 * tension σ and density ρ at `(x, y)` in the bubbles' grid from the
 * downsampled species snapshot `{L, data}` read back once a second alongside
 * `speciesShare`:
 *   - Kinematic viscosity mixes by the Arrhenius (Grunberg–Nissan) log rule,
 *     the same rule `hsPrep` in `src/gpu/wgsl/thinGap.ts` uses for the plate's
 *     drag: `ln(ν / ν_water) = (1 − r) · ln(ν_plate / ν_water) + g`, where `r`
 *     is the poured share in channel 0 and `g = Σ share · ln(ν / ν_water)` is
 *     channel 1.
 *   - Density and surface tension mix by the column's volume share `r`, and
 *     dynamic viscosity is `μ = ρ · ν`, matching `BubbleField.liquid()`.
 *   - Shortcut: the four-channel species texture carries `(r, g, scatter, r·n)`
 *     and holds neither surface tension nor density (channel 2 was traded from
 *     density to scatter until PLAN 18d-4a), so `poured` supplies the `{sigma,
 *     rho}` of the bottle that last laid a species (`pouredOf`). That is exact
 *     when one miscible bottle is poured on the carrier, and approximate where
 *     two different miscible bottles overlap.
 *   - When there is no snapshot, no poured bottle, or no poured share at the
 *     cell (`!(r > 0)`), `out` receives the plate's own `{mu, sigma, rho}` to
 *     the bit, and `out` is mutated in place so stepping the bubbles allocates
 *     nothing on the frame loop.
 */
import { WATER_NU } from './liquidProps';

/** Dynamic viscosity (Pa·s), surface tension against air (N/m) and density (kg/m³). */
export interface BubbleLiquid {
  mu: number;
  sigma: number;
  rho: number;
}

/** Downsampled species readback: `L × L` RGBA cells (`r` share, `g` `Σ r·ln(ν/ν_w)`, `b` scatter, `a` `Σ r·n`), row 0 first. */
export interface SpeciesSnapshot {
  L: number;
  data: Float32Array;
}

/** Surface tension (N/m) and density (kg/m³) of the bottle that last laid a species. */
export interface PouredLiquid {
  sigma: number;
  rho: number;
}

/**
 * Fill `out` with the liquid at `(x, y)` in the bubbles' `0..grid` coordinates
 * and return `out`. Allocates nothing; with no snapshot or zero poured share at
 * the cell, `out` is `plate` to the bit.
 */
export function liquidAtCell(
  plate: BubbleLiquid,
  snap: SpeciesSnapshot | null | undefined,
  x: number,
  y: number,
  grid: number,
  poured: PouredLiquid | null | undefined,
  out: BubbleLiquid,
): BubbleLiquid {
  out.mu = plate.mu;
  out.sigma = plate.sigma;
  out.rho = plate.rho;
  if (!snap || !poured) return out;
  const L = snap.L;
  if (!(L > 0) || !(grid > 0)) return out;
  const ix = Math.max(0, Math.min(L - 1, Math.floor((x / grid) * L)));
  const iy = Math.max(0, Math.min(L - 1, Math.floor((y / grid) * L)));
  const at = (ix + iy * L) * 4;
  const r = Math.max(0, Math.min(1, snap.data[at]));
  if (!(r > 0)) return out;
  const lnPlate = Math.log(plate.mu / plate.rho / WATER_NU);
  const nu = WATER_NU * Math.exp((1 - r) * lnPlate + snap.data[at + 1]);
  const rho = (1 - r) * plate.rho + r * poured.rho;
  out.rho = rho;
  out.mu = rho * nu;
  out.sigma = (1 - r) * plate.sigma + r * poured.sigma;
  return out;
}

/**
 * A bottle's `{sigma, rho}` in SI (`N/m` and `kg/m³`) from its shelf behaviour
 * (`tension` in mN/m, `density` in g/cm³ in `src/bottles.ts`). A custom bottle
 * with no `tension` keeps the plate's `plateSigma`, and its density falls back
 * to `1 + weight` g/cm³ just as `speciesOf` in `src/lib/liquidProps.ts` does.
 */
export function pouredOf(
  behaviour: { tension?: number; density?: number; weight?: number } | null | undefined,
  plateSigma: number,
): PouredLiquid {
  const d = behaviour?.density && behaviour.density > 0 ? behaviour.density : 1 + (behaviour?.weight ?? 0);
  const sigma = behaviour?.tension && behaviour.tension > 0 ? behaviour.tension / 1000 : plateSigma;
  return { sigma, rho: d * 1000 };
}
