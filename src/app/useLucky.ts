import { useState, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { luckyLook } from '../lib/lucky';
import { isNatural, isClearLiquid } from '../lib/liquidColour';
import { stream } from '../lib/rng';
import type { VisualizerSettings, LiquidType } from '../types';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * Lucky: a whole new look from the bottles on the shelf. It replaces every
 * setting from one click beside controls used mid-show, so the look it
 * replaced is kept for Revert, and in Perform it asks once before it fires.
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
  /**
   * Lucky replaces all eighty settings at once, from one click, sitting next
   * to controls that are used mid-show. That is fine while you are hunting for
   * a look and alarming during a set, so two things guard it: the look it
   * replaced is kept, so Revert brings it straight back, and in Perform the
   * button asks once before it fires.
   */
  const [luckyArmed, setLuckyArmed] = useState(false);
  useEffect(() => {
    if (!luckyArmed) return;
    const id = setTimeout(() => setLuckyArmed(false), 3000);
    return () => clearTimeout(id);
  }, [luckyArmed]);

  const triggerLucky = () => {
    // The room's light from the bottles' colours, but not a clear bottle's white (lib/liquidColour.ts): seven of them would make most rolls white.
    const next = luckyLook(settings, liquidTypes.filter(t => !(isNatural(t) && isClearLiquid(t))).map(t => t.color));
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
    luckyArmed, setLuckyArmed, triggerLucky,
  };
}
