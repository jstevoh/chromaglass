import { type RefObject, type Dispatch, type SetStateAction } from 'react';
import { luckyLook } from '../lib/lucky';
import { isNatural, isClearLiquid } from '../lib/liquidColour';
import { stream } from '../lib/rng';
import { canUseMoirePack } from '../lib/tierGates';
import type { VisualizerSettings, LiquidType } from '../types';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * Lucky: a whole new look from the bottles on the shelf. It replaces every
 * setting from one click; the 8 s Undo toast puts the plate and settings back
 * if it was pressed by mistake (PLAN 49a).
 */
interface LuckyDeps {
  settings: VisualizerSettings;
  liquidTypes: LiquidType[];
  previousLook: RefObject<{ id: string | null; settings: VisualizerSettings; } | null>;
  pinnedPresetId: string | null;
  settingsRef: RefObject<VisualizerSettings>;
  lookTakesLevels: () => void;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  setPinnedPresetId: Dispatch<SetStateAction<string | null>>;
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  setSeedCount: Dispatch<SetStateAction<number>>;
}

export function useLucky({
  settings, liquidTypes, previousLook, pinnedPresetId, settingsRef, lookTakesLevels, setSettings,
  setPinnedPresetId, visualizerRef, setSeedCount,
}: LuckyDeps) {
  const triggerLucky = () => {
    // The room's light from the bottles' colours, but not a clear bottle's white (lib/liquidColour.ts): seven of them would make most rolls white.
    const next = luckyLook(settings, liquidTypes.filter(t => !(isNatural(t) && isClearLiquid(t))).map(t => t.color), undefined, canUseMoirePack());
    previousLook.current = { id: pinnedPresetId, settings: settingsRef.current };
    // A look coming in, like a Go's: a take on the gel or the lumia stops.
    lookTakesLevels();
    setSettings(next);
    setPinnedPresetId(null);
    // Randomize inject style for the evolve: Lucky's own stream, like its roll.
    const allStyles = ['drop', 'spray', 'splatter', 'pour', 'streak'];
    const s1 = stream('show.lucky').pick(allStyles);
    const s2 = stream('show.lucky').pick(allStyles);
    visualizerRef.current?.setInjectStyle([s1, s2]);
    setSeedCount(prev => prev + 1);
  };

  return {
    triggerLucky,
  };
}
