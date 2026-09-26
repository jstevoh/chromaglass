/**
 * What the look a show opens on turns on, as far as its pipelines go.
 *
 * The show builds its pipelines before it opens (`gpu/prepare.ts`), and
 * building all eighty-seven one at a time on a cold Mac took 19.7 s, against
 * the 9.8 s the old way stopped for (`npm run startup`, run 36255595521): the
 * plate sat on its starting frame for twenty-three seconds. Most of that was
 * for looks it was not opening on. Every one of the thirty-eight looks opens
 * on the same forty-three, and each adds at most ten of its own; the
 * union of all their openings is seventy-three, so waiting for every look's
 * opening would have saved almost nothing. The opening waits for the
 * forty-three and for what its own look adds, and the rest is built behind
 * the show once it is up.
 *
 * What a look adds follows from a handful of settings, each of which switches
 * on a part of the solver or the picture that has pipelines of its own. They
 * are read here, next to nothing else, so each owner's list can say which of
 * its pipelines wait on which part (`WebGPUFluid.prepare` and its
 * neighbours). The thresholds are looser than the ones the show switches on
 * at, so a dial just above zero still counts: a pipeline built ahead that the
 * look never asks for costs a fifth of a second; one it asks for that was not
 * built costs the same, on the frame, as a stop.
 *
 * `npm run startup` opens every look and fails if any asks, in its first
 * steps, for a pipeline that was left for later.
 */

import type { VisualizerSettings } from '../types';

export interface Opening {
  /** Vorticity confinement (galaxy): the curl and the push it gives. */
  vorticity: boolean;
  /** The mix and its surface tension (soap-film, milk-marble). */
  mix: boolean;
  /** The reaction (chemical-clock). */
  reaction: boolean;
  /** The gel (agate). */
  gel: boolean;
  /** The second phase (the ferrofluid). */
  phase: boolean;
  /** The magnet's maze on the second phase (magnet-garden). */
  maze: boolean;
  /** The particles (stardust-collapse). */
  particles: boolean;
  /** The plate filmed by a camera (oil-on-water and its kind). */
  camera: boolean;
  /** The film stock (home-movie). */
  stock: boolean;
}

export function openingOf(s: Partial<VisualizerSettings>): Opening {
  const on = (v: number | undefined) => (v ?? 0) > 0;
  return {
    vorticity: on(s.vorticityConfinement),
    mix: on(s.surfactantFlow),
    reaction: on(s.bzReaction),
    gel: on(s.liesegang),
    phase: on(s.phaseAmount),
    maze: on(s.phaseAmount) && on(s.magnetStrength),
    particles: on(s.particles),
    camera: on(s.camera),
    stock: on(s.stock),
  };
}
