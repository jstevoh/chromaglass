import type { VisualizerSettings } from '../types';

/**
 * The plate's speed, matched to the music.
 *
 * Reported: "the presets are more often than not too fast (and sometimes too
 * slow). Matching them with the music would be helpful to get the speed
 * right." Measured, the thirty-five presets run the liquid at speeds 180
 * times apart (Lumia 0.0005, Lace Run 0.089, the median 0.0037), and none of
 * that had anything to do with what was playing: a ballad and a 174 bpm
 * track got the same plate.
 *
 * So each look now has a target speed that comes from the music, and its own
 * speed is blended toward it: geometrically, so a slow look stays slower than
 * a fast one, and by `tempoSync` (0 is the look as written, 1 is the music
 * alone). Random Evolve leans harder on the music. Everything here is
 * slewed on seconds by the caller, so the plate never lurches with the beat
 * (see the clock's own note on why that matters).
 */

/*
  The on-screen speed a moderate track (110 bpm, half volume) asks for, in
  the units `lookSpeed` returns. Below the presets' median (0.0017), on the
  report that they are more often too fast than too slow: at a typical track
  about three in five of them are slowed.
*/
export const TEMPO_REF = 0.0011;

/**
 * How fast a look moves the liquid on the screen: the solver's clock (the
 * same arithmetic as `FluidSimulation.step`), times how far the flow carries
 * the dye per unit of it (advection), times the camera's zoom (a closeup
 * magnifies every motion by its zoom).
 */
export function lookSpeed(s: Pick<VisualizerSettings, 'globalSpeed' | 'platePressure' | 'airVelocity' | 'automateRate' | 'advection' | 'macroMode' | 'macroZoom'>): number {
  let d = 0.05 + (s.platePressure ?? 0) * 0.02 + (s.airVelocity ?? 0) * 0.01 + (s.automateRate ?? 0) * 0.01;
  let m = (Number.isFinite(s.globalSpeed) ? s.globalSpeed : 0.05) / 0.05;
  if (m < 1) m *= m;
  d *= m;
  const zoom = s.macroMode ? Math.max(1, s.macroZoom ?? 1) : 1;
  return Math.max(1e-6, d * Math.max(0.05, s.advection ?? 0.5) * zoom);
}

/**
 * How fast the music asks the plate to go, as a multiple of `TEMPO_REF`.
 *
 * The tempo sets it (a sublinear power: 70 bpm is 0.70, 128 is 1.13, 174 is
 * 1.44), and how loud the music has been over the last several seconds
 * scales it (0.7 in a quiet passage to 1.3 at full). With no beat to go on
 * it is the loudness alone, and in silence, calm.
 */
export function musicPace(bpm: number, loudness: number, playing: boolean): number {
  if (!playing) return 0.5;
  const tempo = bpm >= 40 && bpm <= 240 ? Math.pow(bpm / 110, 0.8) : 1;
  const level = 0.7 + 0.6 * Math.max(0, Math.min(1, loudness));
  return tempo * level;
}

/**
 * The multiplier on the look's own clock that brings it toward the music:
 * (target / look)^k, bounded. `evolving` widens the bounds as well as
 * raising k, because Random Evolve is the user saying the show may go
 * further from what the look was written as.
 */
export function tempoMultiplier(look: number, pace: number, tempoSync: number, evolving: boolean): number {
  const k = Math.max(Math.max(0, Math.min(1, tempoSync)), evolving ? 0.85 : 0);
  if (k <= 0) return 1;
  const want = Math.pow((TEMPO_REF * pace) / Math.max(1e-6, look), k);
  const [lo, hi] = evolving ? [0.05, 6] : [0.1, 4];
  return Math.max(lo, Math.min(hi, want));
}
