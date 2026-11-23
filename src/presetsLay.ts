import { DEFAULT_SETTINGS } from './types';
import type { Preset } from './presets';
import { layMoireLooks } from './presetsMoire';
import { layPaceLooks } from './presetsPace';
import { layStirCords } from './lib/stir';
import { layMusicCords } from './lib/musicCords';

/*
  What is laid over the built-in looks once they are written, in this order:
  the moiré pack's looks, each over the look it starts from (presetsMoire.ts),
  laid from the looks as they were so the pack's own pace is its own; then the
  lively looks worked at a real show's pace (presetsPace.ts, PLAN 48q); then
  the music's stir on every look, the pack's included (lib/stir.ts
  `layStirCords`, PLAN 38u-5); then the music's hands as cords on every look,
  from its own wiring and areas (lib/musicCords.ts, PLAN 38v-1).

  A file beside presets.ts because that one is at the 100 KB line
  (`npm run sizes`) and each of these is a pass over every look, not a look.
*/
export function layLooks(presets: Preset[]): void {
  layMoireLooks(presets);
  layPaceLooks(presets);
  layStirCords(presets, DEFAULT_SETTINGS.turbulenceScale, DEFAULT_SETTINGS.audioImpact);
  layMusicCords(presets);
}
