import { useState, useRef, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type ShowIntervalHandle, clearShowInterval, showNow, showInterval } from '../lib/showClock';
import type { VisualizerSettings } from '../types';
import type { LaterWrites } from '../lib/lookFade';

/**
 * Blackout and the dimmer's fades. Above the look fades, which read
 * `blackoutRef` so a Go during a blackout does not light the room.
 */
interface BlackoutDeps {
  settingsRef: RefObject<VisualizerSettings>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  laterWrites: LaterWrites;
}

export function useBlackout({
  settingsRef, setSettings, laterWrites,
}: BlackoutDeps) {
  // ── The house lights ──
  // Blackout fades the dimmer to nothing over a second and back to where it
  // was: the band stops, the wall goes dark, the band starts, the wall comes
  // back. The dimmer itself is a setting, so a fader can ride it by hand.
  const [blackout, setBlackout] = useState(false);
  /** For the lighting feed below, which is armed once and must not close over a stale value. */
  const blackoutRef = useRef(blackout);
  blackoutRef.current = blackout;
  const dimmerBeforeRef = useRef(1);
  const fadeRef = useRef<ShowIntervalHandle | null>(null);
  // On a timer, not requestAnimationFrame: the laptop's window is often
  // behind the projector's, and a hidden tab stops animating while the
  // fader on the desk expects the wall to go dark anyway.
  const fadeDimmer = useCallback((to: number, ms = 1100) => {
    if (fadeRef.current) clearShowInterval(fadeRef.current);
    const from = settingsRef.current.dimmer ?? 1;
    const began = showNow();
    fadeRef.current = showInterval(() => {
      const k = Math.min(1, (showNow() - began) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setSettings(prev => ({ ...prev, dimmer: from + (to - from) * e }));
      laterWrites.mark(['dimmer'], showNow());
      if (k >= 1 && fadeRef.current) { clearShowInterval(fadeRef.current); fadeRef.current = null; }
    }, 16, 'dimmer-fade');
  }, []);
  const toggleBlackout = useCallback(() => {
    setBlackout(prev => {
      if (!prev) { dimmerBeforeRef.current = Math.max(0.05, settingsRef.current.dimmer ?? 1); fadeDimmer(0); }
      else fadeDimmer(dimmerBeforeRef.current);
      return !prev;
    });
  }, [fadeDimmer]);

  return {
    blackout, blackoutRef, fadeRef, toggleBlackout,
  };
}
