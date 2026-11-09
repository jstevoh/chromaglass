import { useState, useCallback, useEffect, type RefObject } from 'react';
import { COLOR_HARMONIES } from '../constants';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * The palette lock: a colour harmony held across looks and the sequencer, so
 * the music can move everything but the colours. Kept in the browser and
 * re-asserted on the engines once they are up.
 */
interface PaletteLockDeps {
  bothEngines: () => LiquidVisualizerHandle[];
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
}

export function usePaletteLock({
  bothEngines, visualizerRef,
}: PaletteLockDeps) {
  // ── User palette lock ───────────────────────────────────────────
  const [paletteLock, setPaletteLock] = useState<number | null>(() => {
    const raw = localStorage.getItem('chromaglass-palette-lock');
    const n = raw == null ? NaN : parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 && n < COLOR_HARMONIES.length ? n : null;
  });
  const selectPalette = useCallback((index: number | null) => {
    setPaletteLock(index);
    try {
      if (index == null) localStorage.removeItem('chromaglass-palette-lock');
      else localStorage.setItem('chromaglass-palette-lock', String(index));
    } catch { /* private mode */ }
    // The lock is the room's, like the mark: the wall's engine and, in Preview, the desk's copy (PLAN.md 8b).
    for (const v of bothEngines()) v.setHarmonyLock(index == null ? null : COLOR_HARMONIES[index]);
  }, []);
  useEffect(() => {
    // Re-assert a persisted lock once the visualizer is mounted
    if (paletteLock != null) visualizerRef.current?.setHarmonyLock(COLOR_HARMONIES[paletteLock]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    paletteLock, selectPalette,
  };
}
