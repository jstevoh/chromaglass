import { useRef, useCallback, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type ShowIntervalHandle, clearShowInterval, showNow, showInterval } from '../lib/showClock';
import type { VisualizerSettings } from '../types';
import type { LaterWrites } from '../lib/lookFade';

/**
 * A setting walked to a value over some seconds, the way a hand turns a knob:
 * one walk per setting, on the show timer. A song's actions use it, and a row's
 * fade stops one on the row it takes, so it comes before both.
 */
interface GlidesDeps {
  handOnLevels: (keys: Iterable<string>) => void;
  settingsRef: RefObject<VisualizerSettings>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  laterWrites: LaterWrites;
}

export function useGlides({
  handOnLevels, settingsRef, setSettings, laterWrites,
}: GlidesDeps) {
  /** A setting walked to a value over some seconds, the way a hand turns a knob. One walk per setting. */
  const glidesRef = useRef(new Map<string, ShowIntervalHandle>());
  const glideSetting = useCallback((key: keyof VisualizerSettings, to: number, seconds: number, atEnd?: Partial<VisualizerSettings>) => {
    const timers = glidesRef.current;
    const running = timers.get(String(key));
    if (running) clearShowInterval(running);
    // A song's glide of a Mixer row's level stops a take on it (lib/mixFade.ts).
    handOnLevels([String(key), ...Object.keys(atEnd ?? {})]);
    const from = Number((settingsRef.current as unknown as Record<string, unknown>)[key] ?? 0);
    if (!(seconds > 0)) { setSettings(p => ({ ...p, [key]: to, ...(atEnd ?? {}) })); return; }
    const started = showNow();
    const timer: ShowIntervalHandle = showInterval(() => {
      const k = Math.min(1, (showNow() - started) / (seconds * 1000));
      const e = k * k * (3 - 2 * k);
      setSettings(p => ({ ...p, [key]: k >= 1 ? to : from + (to - from) * e, ...(k >= 1 ? atEnd ?? {} : {}) }));
      // Every tick, not only the first: a glide still walking when a Back is
      // pressed is the later writer, and the Back leaves it be.
      laterWrites.mark([String(key), ...(k >= 1 ? Object.keys(atEnd ?? {}) : [])], showNow());
      if (k >= 1) { clearShowInterval(timer); timers.delete(String(key)); }
    }, 33, `glide:${String(key)}`);
    timers.set(String(key), timer);
  }, []);
  useEffect(() => () => { for (const t of glidesRef.current.values()) clearShowInterval(t); }, []);

  return {
    glidesRef, glideSetting,
  };
}
