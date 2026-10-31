/*
  The heat's numbers for a step, in watts and real seconds (PLAN 38f, 38t):
  what `WebGPUFluid.writeSim` puts in the Sim for decayVel and hsBody. Moved beside fluid.ts so it stays under its size (19ai-10).
  The physics and every constant's reason are in constants.ts's note on
  LAMP_IRRADIANCE; `npm run plume` measures them.
*/
import type { GpuStepParams } from '../solverTypes';
import { AIR_DENSITY, AIR_K, AIR_NU, AIR_PR, HEAT_AIR, HEAT_BUOY_REAL, HEAT_RISE, LAMP_IRRADIANCE, LIQUID_DENSITY, NU_REF, PLATE_METRES, REST_GAP, UPDRAFT_SPEED } from './constants';

const fin = (x: number | undefined, fallback = 0): number => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);

/**
 * The heat's slots of the Sim: Heat Decay's air on both faces (17), the
 * lamp's flux (50), the step's real seconds (51), the lift (52, 53) and
 * Updraft's forced air (54). `up` is the plate's up already in f[34], f[35].
 * The lift is a thin gap's alone (the old plate's current carries its
 * own).
 */
export function writeHeatSim(f: Float32Array, p: GpuStepParams, thin: boolean, upright: number, disp: number): void {
  const seconds = Math.max(0, Math.min(0.1, fin(p.magnetSeconds, 1 / 60)));
  f[17] = 2 * HEAT_AIR * -Math.log(Math.max(0.001, Math.min(1, fin(p.heatDecay, 0.98))));
  f[50] = fin(p.dimmer, 1) * LAMP_IRRADIANCE;
  f[51] = seconds;
  /*
    Up the plate as far as it stands (upright, along S.up) and as far as a
    hand tips it (the rock, sinθ, down which the colour's weight goes), at
    Buoyancy's multiple of water's own expansion, in the flow's per-step
    speed per unit of lightness as hsBody reads every body force.
  */
  const lift = thin ? Math.max(0, fin(p.buoyancy, 0)) / HEAT_BUOY_REAL * HEAT_RISE * seconds / (PLATE_METRES * Math.max(disp, 1e-9)) : 0;
  f[52] = lift * (upright * f[34] - fin(p.rockX, 0));
  f[53] = lift * (upright * f[35] - fin(p.rockY, 0));
  const air = fin(p.air, 0);
  f[54] = air > 0.1 ? 0.332 * AIR_K * AIR_PR ** (1 / 3) * Math.sqrt(UPDRAFT_SPEED * air / (AIR_NU * PLATE_METRES)) : 0;
  f[55] = 0;
}

/**
 * Updraft's stress a plate's width in from the edge the air comes over
 * (0.332 ρ U^1.5 √(ν_air/x), PLAN 38t), turned into the flow's per-step
 * speed as the breath's is (τh₀/2μ_ref): hsBody's A.a.y. Zero under 0.1.
 */
export function updraftStress(air: number, disp: number, seconds: number): number {
  if (!(air > 0.1)) return 0;
  const h0 = REST_GAP * PLATE_METRES;
  return 0.332 * AIR_DENSITY * (UPDRAFT_SPEED * air) ** 1.5 * Math.sqrt(AIR_NU / PLATE_METRES)
    * (h0 / (2 * LIQUID_DENSITY * NU_REF)) * seconds / (PLATE_METRES * Math.max(disp, 1e-9));
}
