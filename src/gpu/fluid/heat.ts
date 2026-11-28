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
import { KAPPA_WATER, PLATE_METRES, lampCoolOf } from './constants';

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

/*
  The heat's budget for one step, in watts and seconds (PLAN 38f-3).

  Reported (PLAN 38f, read 2026-10-30, and again against main 2026-11-27 for
  the October build of #614, which was not landed): the plate's heat had no
  thermal mass and no clock of its own. The lamp warmed dark dye at
  LAMP_HEATING, 0.24 K/s, worked out for a millimetre of water, while the
  rest gap is 2 mm between two glasses; and the heat faded as
  heatDecay^(4·dt), on the look's clock. A look's clock runs at
  dt = 0.2 × its speed a sixtieth of a second, which is 0.0005 to 0.0045 from
  the slowest look to the fastest, so one Heat Decay cooled a plate in 52 s
  on one look and in 7 minutes on another, and warmed it as much slower.

  What a real plate does. The liquid and the two glasses it lies between are
  one temperature through their depth (across 2 mm water conducts
  k/(h/2) = 600 W/m²K, ten times what the air takes from the glass: a Biot
  number of 0.1, lib/lampBoil.ts point 2), so they warm and cool as one
  sheet whose heat capacity per square metre is
      C = ρc_w·h + 2·ρc_g·t = 4.18e6 × 0.002 + 2 × 2500 × 840 × 0.002
        = 8360 + 8400 = 16760 J/m²K at the rest gap,
  half of it the glass. The lamp puts I·a into it, I the stage's
  irradiance (1000 W/m², 18f's) and a the share the dye takes (Beer–Lambert,
  the decay kernel's lampThrough), and it loses heat from both faces, to the
  air at h_air and by radiation, 2εσ(T⁴ − T₀⁴):
      C dΔT/dt = I·a − 2·(h_air + h_rad)·ΔT.
  So the lamp warms dark dye at I/C = 0.060 K/s, a quarter of 18f's 0.24,
  and the step is solved exactly (the decay kernel), whatever its length.

  Heat Decay is h_air. The old fade was a millimetre of water cooled on both
  faces at h = 2·ρc_w·(1 mm)·(−ln v) W/m²K a face (its time constant,
  1/(4·(−ln v)), is ρc_w·(1 mm)/(2h)), and that h is kept: HEAT_DECAY_AIR =
  8360 W/m²K for each unit of −ln v. Kept because it keeps what every look
  was tuned on, its warmest: a lamp held on dark dye settles where the lamp's
  watts and the air's balance, I·a/(2·h_air), the old LAMP_HEATING·a/(4·(−ln v))
  to the kelvin, so every heated look's plumes stand as tall as they did.
  What moves is how fast it gets there: C/(2h) on the clock's real seconds,
  1.0/(−ln v) s at the rest gap, 48 s at the default 0.98, the same on every
  look; and that is what the old fade gave a look running at dt = 0.0042, the
  lab's 0.004 and most house looks. The dial's real range is its top: a
  projector's fan over the stage is h ≈ 15 to 40 W/m²K, Heat Decay 0.998 to
  0.995; below that it ramps past what a fan does, as dials here may.

  Radiation. ε = 0.9 for both glass faces (soda-lime in the infrared), and
  4εσT₀³ = 5.1 W/m²K a face at a room of 20 °C: an eighth of the air at Heat
  Decay 0.995, and all the cooling there is at Heat Decay 1, where the old
  fade kept every kelvin the lamp put in, for ever, until the heat's clamp.
  A shortcut, named (PLAN 27f-9g): the radiation is linearised about the
  room, folded into S.heatLoss, rather than worked out from each cell's own
  T⁴ (a fourth number in the Sim, left for when the glass has a
  temperature of its own); the real 2εσ(T⁴ − T₀⁴) is 28% more than
  that at 50 K up, where the heat is clamped, under 1% of the loss at the
  default.

  The gap. C is the cover's gap's (the same gap lampCoolOf conducts across),
  not each cell's own under a press; a press squeezes a thinner sheet of
  water over the same two glasses, at most a quarter of C less.

  It is written into the Sim's three heat slots: 17 (S.heatLoss, the
  step's 2·(h_air + h_rad)·s/C), 50 (S.lampHeat, the step's I·s/C at the
  Dimmer, the kelvin a fully dark cell takes in a step with no loss) and 54
  (S.lampCool, a standing lamp's conduction to its glass, PLAN 27f-9e).
*/
export const LAMP_IRRADIANCE = 1000;      // W/m² at the stage: 18f's
export const WATER_RHO_C = 4.18e6;        // J/m³K
export const GLASS_RHO_C = 2500 * 840;    // soda-lime, J/m³K
export const GLASS_METRES = 0.002;        // each of the two glasses
export const HEAT_DECAY_AIR = 2 * WATER_RHO_C * 0.001; // W/m²K a face for each unit of −ln(Heat Decay)
export const GLASS_GLOW = 4 * 0.9 * 5.670e-8 * 293.15 ** 3; // W/m²K a face: radiation, ε 0.9, linearised at 20 °C

/** The heat capacity of a square metre of plate, J/m²K: the liquid at the gap (metres) and its two glasses. */
export function heatMassOf(gapMetres: number): number {
  const h = Number.isFinite(gapMetres) ? Math.max(1e-5, gapMetres) : 0.002;
  return WATER_RHO_C * h + 2 * GLASS_RHO_C * GLASS_METRES;
}

/** Heat Decay's air, W/m²K a face: 0 at 1, HEAT_DECAY_AIR·(−ln v) below. */
export function heatAirOf(heatDecay: number | undefined): number {
  const v = Number.isFinite(heatDecay) ? Math.max(0.001, Math.min(1, heatDecay as number)) : 0.98;
  return -HEAT_DECAY_AIR * Math.log(v);
}

/**
 * The step's heat slots into the Sim (`f`, the writeSim floats): 17 the loss
 * over the step, 50 the lamp's kelvin over the step at the Dimmer, 54 a
 * standing lamp's glass conduction. `seconds` is the step's real seconds.
 */
export function heatSlots(f: Float32Array, heatDecay: number | undefined, dimmer: number | undefined, gapMetres: number, seconds: number | undefined): void {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.min(0.1, seconds as number)) : 1 / 60;
  const perC = s / heatMassOf(gapMetres);
  f[17] = 2 * (heatAirOf(heatDecay) + GLASS_GLOW) * perC;
  f[50] = (Number.isFinite(dimmer) ? (dimmer as number) : 1) * LAMP_IRRADIANCE * perC;
  f[54] = lampCoolOf(gapMetres, s);
}
