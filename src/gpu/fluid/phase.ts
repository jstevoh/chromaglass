/**
 * Ferrofluid rounding and Cahn-Hilliard pacing in real seconds and metres (PLAN 9ae).
 *
 * What was wrong before:
 * - Cahn-Hilliard (`phaseMu`, `phaseCH`, `phaseCHVolume` in `fluid.ts`) ran a
 *   fixed `CH_SUBSTEPS` (4) per solver step with per-substep mobility
 *   `0.006 + 0.012 * phaseSharp`, carrying neither the step's real seconds
 *   (`magnetSeconds`) nor the grid spacing `dx = PLATE_METRES / N`. At 30 steps
 *   a second it ran half as fast per second as at 60, and at 384^2 slower than
 *   at 256^2.
 * - Moreover, on a thin gap `phaseCHVolume` uses degenerate interface-only
 *   mobility `4m(1 - m)` (to prevent Ostwald ripening, `ferrorest.mjs`), which
 *   transports along the interface (surface diffusion, relaxing on `R^4 / (8 M dx^4)`
 *   at hundreds of seconds) rather than by bulk Hele-Shaw Darcy flow. Between
 *   two plates separated by `b`, a drop of radius `R` relaxes by two-phase
 *   Darcy flow driven by the Laplace pressure jump `sigma * kappa` on Paterson's
 *   (1981) timescale `tau_2 = 2 (mu_in + mu_out) R^3 / (b^2 sigma)` (the
 *   `12 mu R^3 / (b^2 sigma)` scale over `n(n^2 - 1) = 6` for mode 2).
 *
 * What this module provides:
 * - `phaseCHPlan`: scales the Cahn-Hilliard mobility by `seconds / dx^2` from
 *   the tuned `384^2` / 60 Hz baseline and substeps when needed to stay under
 *   the explicit stability ceiling (`1.9 / 80 = 0.02375` in `phaseMu`).
 * - `FERRO_SIGMA`, `FERRO_TENSION_GAP`, `phaseCapillaryPull`: the ferrofluid's
 *   physical interfacial tension `sigma = (rho_ff - rho_w) g l_c^2` from the
 *   Rosensweig capillary length `l_c = SPIKE_PITCH * PLATE_METRES / (2 pi)`
 *   (`wgsl/spikes.ts`), converted to a Hele-Shaw body force in `hsPrep` units
 *   (terminal Darcy speed of the reference liquid `NU_REF` at `REST_GAP_METRES`,
 *   scaled by `coverH2` when the cover glass moves), so `thinProject` solves
 *   the true two-phase Darcy rounding flow at any grid and step rate.
 */

import {
  CH_SUBSTEPS,
  LIQUID_DENSITY,
  NU_REF,
  PLATE_METRES,
  REST_GAP_METRES,
} from './constants';
import { FERRO_DENSITY, SPIKE_PITCH, WATER_DENSITY } from '../wgsl/spikes';

/** Reference grid where the baseline Cahn-Hilliard mobility (`0.006 + 0.012 * sharp` x 4 at 60 Hz) was tuned. */
export const PHASE_CH_GRID = 384;
/** Maximum per-substep `M * dt` aimed for when choosing substeps, matching the `phaseSharp = 1` baseline (`0.018`). */
export const PHASE_CH_MAX_M = 0.018;
/** Hard explicit stability cap under `1.9 / 80 = 0.02375` (`phaseMu` double-well headroom). */
export const PHASE_CH_STABLE = 0.022;
/** Cap on Cahn-Hilliard substeps per solver step. */
export const PHASE_CH_SUBSTEPS = 16;

/** Rosensweig capillary length `l_c` in metres, from `SPIKE_PITCH = 2 pi l_c / PLATE_METRES`. */
const FERRO_LC = (SPIKE_PITCH * PLATE_METRES) / (2 * Math.PI);

/** Ferrofluid interfacial tension `sigma = (rho_ff - rho_w) g l_c^2` in N/m (~3.34 mN/m). */
export const FERRO_SIGMA = (FERRO_DENSITY - WATER_DENSITY) * 9.81 * FERRO_LC * FERRO_LC;

/**
 * Ferrofluid capillary pull coefficient in `hsPrep` body-force units (`1/s` at
 * rest gap, before `perSecond * N^2`), equal to `b_0^2 sigma / (12 mu_ref L^3)`.
 * Multiplied by `coverH2 * perSecond * N^2` and `kappa_cell * grad_cell(c)`,
 * `hsPrep` and `thinProject` yield the exact two-phase Darcy velocity
 * `-(b^2 / 12 mu(c)) (grad p - sigma kappa grad c)`.
 */
export const FERRO_TENSION_GAP =
  (REST_GAP_METRES * REST_GAP_METRES * FERRO_SIGMA) /
  (12 * LIQUID_DENSITY * NU_REF * PLATE_METRES * PLATE_METRES * PLATE_METRES);

/**
 * Compute Cahn-Hilliard substeps `[0]` and per-substep dimensionless `M * dt` `[1]`
 * into `out` (zero per-frame allocations), scaled by real `seconds` and `1 / dx^2`.
 */
export function phaseCHPlan(
  sharp: number,
  seconds: number | undefined,
  n: number,
  out: Float64Array,
): Float64Array {
  const s = Math.max(0, Number.isFinite(seconds) ? (seconds as number) : 1 / 60);
  const sh = Math.max(0, Math.min(1, Number.isFinite(sharp) ? sharp : 0.35));
  const mStepRef = CH_SUBSTEPS * (0.006 + 0.012 * sh);
  const dxRef = PLATE_METRES / PHASE_CH_GRID;
  const dx = PLATE_METRES / Math.max(1, n);
  const mStep = mStepRef * (s * 60) * ((dxRef * dxRef) / (dx * dx));
  const subs = mStep > 0
    ? Math.max(1, Math.min(PHASE_CH_SUBSTEPS, Math.ceil(mStep / PHASE_CH_MAX_M - 1e-9)))
    : 0;
  const mSub = subs > 0 ? Math.min(PHASE_CH_STABLE, mStep / subs) : 0;
  out[0] = subs;
  out[1] = mSub;
  return out;
}

/** Pull scalar `A.a.x` passed to `phaseCapillary` on a thin gap. */
export function phaseCapillaryPull(coverH2: number, perSecond: number, n: number): number {
  return FERRO_TENSION_GAP * coverH2 * perSecond * n * n;
}
