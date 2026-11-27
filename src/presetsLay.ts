import { DEFAULT_SETTINGS } from './types';
import type { Preset } from './presets';
import { layMoireLooks } from './presetsMoire';
import { layPaceLooks } from './presetsPace';
import { layGlowLooks } from './presetsGlow';
import { layOuzoLooks } from './presetsOuzo';
import { layStirCords } from './lib/stir';
import { laySlideCords } from './lib/glassSlide';
import { layMusicCords } from './lib/musicCords';

/*
  What is laid over the built-in looks once they are written, in this order:
  Night Sea, the glow's look, among the house looks after Foam Cells
  (presetsGlow.ts, PLAN 48c-5), and Louche, the Ouzo bottle's look, after it
  (presetsOuzo.ts, PLAN 48s); the moiré pack's looks, each over the look it starts from (presetsMoire.ts),
  laid from the looks as they were so the pack's own pace is its own; then the
  lively looks worked at a real show's pace (presetsPace.ts, PLAN 48q); then
  the music's stir on every look, the pack's included (lib/stir.ts
  `layStirCords`, PLAN 38u-5); then the glass's slide on the looks that slid it
  (lib/glassSlide.ts `laySlideCords`, PLAN 38u-11, from the old 0.3 default);
  then the music's hands as cords on every look, from its own wiring and areas
  (lib/musicCords.ts, PLAN 38v-1).

  A file beside presets.ts because that one is at the 100 KB line
  (`npm run sizes`) and each of these is a pass over every look, not a look.
*/
export function layLooks(presets: Preset[]): void {
  layGlowLooks(presets);
  layOuzoLooks(presets);
  layMoireLooks(presets);
  layPaceLooks(presets);
  layStirCords(presets, DEFAULT_SETTINGS.turbulenceScale, DEFAULT_SETTINGS.audioImpact);
  laySlideCords(presets, 0.3);
  layMusicCords(presets);
}
