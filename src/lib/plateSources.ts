/**
 * What a projector's plate source is drawn from (PLAN.md §16b).
 *
 * A surface can show the front plate alone, the back plate alone or the film
 * alone (`SurfaceSource` in lib/outputConfig.ts). Each is the plate's own
 * display pass drawn again, and what makes it "alone" is only this: the same
 * settings with the Mixer's other rows at nothing. So a source is graded,
 * blended and dimmed exactly as its row is on the wall, a blackout blacks it,
 * and the flash guard's gain (in the dimmer) reaches it, with nothing written
 * twice.
 *
 * - The **front plate alone** keeps what it is lit by and what sits over it
 *   on its own projector (the lamp rows, the logo), and loses the back plate
 *   and the film, which are other projectors' now.
 * - The **back plate alone** is the front plate's row at nothing, which the
 *   shader draws as the bare lamp, with the back plate over it: a second
 *   projector with only the back dish in its gate. With one plate on the
 *   stage there is no back plate, and it is the lamp alone. No logo: the
 *   logo goes out on one projector, the front plate's, or two projectors
 *   side by side would carry two, and two overlapping beams (16c) one twice
 *   as bright.
 * - The **film alone** takes out both plates and every lamp row and the logo,
 *   so it is the film over the bare background. A film row on Multiply is
 *   drawn Add here: multiply lays the film over what is under it, and under
 *   the film alone is black, so Multiply would be a dark projector. Over
 *   black, Add is the frame itself, which is what a film projector shows.
 *
 * Pure and small so `npm run map` can hold it without a GPU.
 */

import type { VisualizerSettings } from '../types';
import type { SurfaceSource } from './outputConfig';

/** The Mixer rows each source leaves out, by their level settings (lib/mixer.ts MIX_SOURCE_INFO). */
export const SOURCE_OFF: Record<Exclude<SurfaceSource, 'wall'>, readonly (keyof VisualizerSettings)[]> = {
  front: ['backLevel', 'filmMix'],
  back: ['frontLevel', 'filmMix', 'markMix'],
  film: ['frontLevel', 'backLevel', 'ledLevel', 'gelWheel', 'lumia', 'markMix'],
};

export function sourceSettings(kind: Exclude<SurfaceSource, 'wall'>, s: VisualizerSettings): VisualizerSettings {
  const out = { ...s } as Record<string, unknown>;
  for (const key of SOURCE_OFF[kind]) out[key] = 0;
  if (kind === 'film' && out.filmBlend === 'multiply') out.filmBlend = 'add';
  return out as unknown as VisualizerSettings;
}
