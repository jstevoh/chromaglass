/**
 * The settings a step hands the solvers that run beside the plate's own
 * (`fluid/passes.ts` stepBeside): the frame's soap film (PLAN 32d,
 * gpu/soapFilmPlate.ts), the tank's side view (PLAN 47n, gpu/tankPlate.ts) and
 * the dish on a shaker (PLAN 48f, gpu/faraday.ts).
 * One spread in the sim's step params (`sim/fluidSimulation.ts`) for both, so
 * a solver added beside the plate is added here and not in that file.
 */
import { soapFilmStep } from './soapFilmPlate';
import { tankStep, type TankStepParams } from './tankPlate';
import { faradayStep, type FaradayStepParams } from './faraday';

type BesideSettings = { soapFilm?: number; soapFilmRate?: number } & TankStepParams & FaradayStepParams;

export function besideStep(s: BesideSettings, layer: number): ReturnType<typeof soapFilmStep> & TankStepParams & FaradayStepParams {
  // With the tank and the shaker off, the soap film's own object as it was before either: no second object a step.
  const tank = tankStep(s, layer);
  const shake = faradayStep(s, layer);
  return tank.tank === undefined && shake.faradayHz === undefined ? soapFilmStep(s, layer) : { ...soapFilmStep(s, layer), ...tank, ...shake };
}
