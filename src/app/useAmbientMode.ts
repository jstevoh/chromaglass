import { useState, useCallback, useRef, useEffect } from 'react';
import { isGlobalAmbientMode, setGlobalAmbientMode, onAmbientModeChange } from '../lib/ambient';

/**
 * Ambient TV mode's switch (PLAN 23.8, 14j): the governor's quieter rungs for
 * a show left playing on a television, kept in step with the governor's own
 * changes and, in the Mac app, with its menu.
 */
export function useAmbientMode() {
  // ── Ambient TV mode (PLAN.md 23.8 / 14j): cool & quiet (60 Hz draw, 30 Hz physics) ──
  const [ambientMode, setAmbientModeState] = useState<boolean>(() => isGlobalAmbientMode());
  const setAmbientMode = useCallback((on: boolean) => {
    setGlobalAmbientMode(on);
    setAmbientModeState(on);
    const native = (window as unknown as { __CHROMAGLASS_NATIVE__?: { setAmbient?: (on: boolean) => void } }).__CHROMAGLASS_NATIVE__;
    native?.setAmbient?.(on);
  }, []);
  const setAmbientModeRef = useRef(setAmbientMode);
  setAmbientModeRef.current = setAmbientMode;
  useEffect(() => {
    const unsubGov = onAmbientModeChange((on) => setAmbientModeState(on));
    const native = (window as unknown as { __CHROMAGLASS_NATIVE__?: { onAmbientChange?: (fn: (on: boolean) => void) => () => void } }).__CHROMAGLASS_NATIVE__;
    const unsubNative = native?.onAmbientChange?.((on) => {
      setGlobalAmbientMode(on);
      setAmbientModeState(on);
    });
    return () => {
      unsubGov();
      unsubNative?.();
    };
  }, []);

  return {
    ambientMode, setAmbientMode, setAmbientModeRef,
  };
}
