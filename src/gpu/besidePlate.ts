/**
 * The settings a step hands the solvers that run beside the plate's own
 * (`fluid/passes.ts` stepBeside): the frame's soap film (PLAN 32d,
 * gpu/soapFilmPlate.ts), the tank's side view (PLAN 47n, gpu/tankPlate.ts)
 * and the water's glow (PLAN 48c, gpu/glow.ts).
 * One spread in the sim's step params (`sim/fluidSimulation.ts`) for both, so
 * a solver added beside the plate is added here and not in that file.
 */
import { soapFilmStep } from './soapFilmPlate';
import { tankStep, type TankStepParams } from './tankPlate';
import { glowStep, type GlowStepParams } from './glow';

type BesideSettings = { soapFilm?: number; soapFilmRate?: number } & TankStepParams & GlowStepParams;

export function besideStep(s: BesideSettings, layer: number): ReturnType<typeof soapFilmStep> & TankStepParams & GlowStepParams {
  // With the tank and the glow off, the soap film's own object as it was before them: no second object a step.
  const tank = tankStep(s, layer);
  const glow = glowStep(s, layer);
  if (tank.tank === undefined && glow.glow === undefined) return soapFilmStep(s, layer);
  return { ...soapFilmStep(s, layer), ...tank, ...glow };
}
