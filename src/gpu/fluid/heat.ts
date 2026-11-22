/**
 * The lamp's heat diffusion on the older solver path (`heatVisc`), beside
 * `soap.ts` so `../fluid.ts` stays under its 100 KB limit (PLAN 36e-6).
 *
 * Heat diffuses through water with thermal diffusivity `KAPPA_WATER` ≈ 1.4e-7 m²/s,
 * about 350 times faster than a dye or salt does (Lewis number Le ≈ 350).
 * Heat previously shared the dye's `diffusionRate`, leaving the 12 presets
 * with `diffusionRate` at 0 with no heat spreading at all. Now heat has its
 * own physical diffusivity term; `doubleDiffusion` raises the heat's alone
 * to simulate double-diffusive convection (salt fingers).
 *
 * Precision: in `rgba16float` (FP16), heat's per-step change at real κ is below
 * half-float precision (~0.0009 cells²/step, truncating to 0.0% on SwiftShader).
 * The step's duration in physical seconds is `seconds` (from `magnetSeconds`).
 * We accumulate `heatSeconds` until the accumulated heat diffusion coefficient
 * reaches ≥ 0.02, where half-float changes survive quantization without loss,
 * or whenever `doubleDiffusion` is elevated.
 *
 * While the plate's boil runs (`boilLive`), `stepPlateBoil` already conducts
 * heat sideways across the water-and-glass sandwich (`PLATE_BOIL_WGSL` `q_cond`,
 * at water and glass together) and keeps the float32 temperature in
 * `boilAlpha.g`. Running `heatVisc` on top of it diffused the heat twice
 * (1.53× `4κt` at Double Diffusion 0, and 27.6× more at Double Diffusion 1).
 * Skipping `heatVisc` and clearing `heatSeconds` while `boilLive` is true keeps
 * one diffusion at the sandwich's own κ and leaves nothing accumulated for
 * the first step after the boil ends.
 */
import { KAPPA_WATER, PLATE_METRES } from './constants';

/**
 * Compute `[nextHeatSeconds, heatVisc]` into `out` with zero per-frame allocations.
 */
export function heatViscPlan(
  boilLive: boolean,
  n2: number,
  doubleDiff: number,
  magnetSeconds: number | undefined,
  heatSeconds: number,
  out: Float64Array,
): Float64Array {
  if (boilLive) {
    out[0] = 0;
    out[1] = 0;
    return out;
  }
  const seconds = Math.max(0, Math.min(0.1, magnetSeconds ?? 1 / 60));
  let nextSeconds = heatSeconds + seconds;
  const heatRate = (KAPPA_WATER / (PLATE_METRES * PLATE_METRES)) * (1 + 99 * doubleDiff) * n2;
  const heatA = nextSeconds * heatRate;
  let heatVisc = 0;
  if (heatA >= 0.02 || doubleDiff > 0) {
    heatVisc = heatA;
    nextSeconds = 0;
  }
  out[0] = nextSeconds;
  out[1] = heatVisc;
  return out;
}
