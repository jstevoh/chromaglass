/**
 * The settings a step hands the solvers that run beside the plate's own
 * (`fluid/passes.ts` stepBeside): the frame's soap film (PLAN 32d,
 * gpu/soapFilmPlate.ts) and the tank's side view (PLAN 47n, gpu/tankPlate.ts).
 * One spread in the sim's step params (`sim/fluidSimulation.ts`) for both, so
 * a solver added beside the plate is added here and not in that file.
 */
import { soapFilmStep } from './soapFilmPlate';
import { tankStep, type TankStepParams } from './tankPlate';

type BesideSettings = { soapFilm?: number; soapFilmRate?: number } & TankStepParams;

export function besideStep(s: BesideSettings, layer: number): ReturnType<typeof soapFilmStep> & TankStepParams {
  // With the tank off, the soap film's own object as it was before the tank: no second object a step.
  const tank = tankStep(s, layer);
  return tank.tank === undefined ? soapFilmStep(s, layer) : { ...soapFilmStep(s, layer), ...tank };
}
