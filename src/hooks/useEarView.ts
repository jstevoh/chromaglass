import { useCallback, useSyncExternalStore } from 'react';
import type { AudioData } from './useAudioAnalyzer';

/*
  What the ear shows, for what renders, without rendering the App (PLAN.md 46f).

  The ear's readings stopped being React state per reading under §14f: the
  plate reads every one through a ref, and React was told at most ten a
  second. That tenth-of-a-second reading was still state on the App itself,
  so each one rendered the whole shell: every desk panel, every knob, both
  plates' components. Measured on the owner's Mac, 2026-11-13 (main c778019,
  Classic, the Perform desk, the simulated band, a CPU profile over 34 s):
  328 renders, 14.3 ms each at the median and 22.2 at the ninetieth
  percentile, 5.4 s of the 34 on the page's one thread, and more than half
  of each in the commit (React updates every DOM element under a component
  that rendered, whether or not anything on it changed). A frame is 16.7 ms
  at sixty a second and 8.3 at a hundred and twenty, so ten times a second
  the plate's next frame waited behind a render nobody could see: the
  readers of that state are a percentage in the desk's status line, three
  small meters over the plate and the Sound section's calibration readout.

  So the tenth-of-a-second reading is a store, not state, and each of those
  readers is a leaf that subscribes to it. `useEarView` takes a selector and
  renders its component only when what it selects changes: the status line
  selects the level rounded to a percent, so a steady room renders nothing
  at all. The App holds the store (a stable object) and never the reading.

  The store is told on the ear's own schedule (`EAR_VIEW_MS` in
  useAudioAnalyzer.ts), not on every reading: a meter does not need sixty a
  second, and a leaf that rendered per reading would be the per-frame cost
  §14f took out, in a smaller box.
*/

export interface EarView {
  /** The reading last published (at most ten a second), or null while the ear is off. */
  get: () => AudioData | null;
  /** Called after each publish, and when the ear stops. Returns the unsubscribe. */
  subscribe: (fn: () => void) => () => void;
}

/** A store and the one function that fills it. The ear makes one and keeps it for its life. */
export function createEarView(): { view: EarView; publish: (a: AudioData | null) => void } {
  let now: AudioData | null = null;
  const subs = new Set<() => void>();
  return {
    view: {
      get: () => now,
      subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
    },
    publish: (a) => {
      if (a === now) return;
      now = a;
      // A subscriber is React's own (useSyncExternalStore), or a leaf's; one
      // that throws must not stop the ear's frame it is called from.
      for (const fn of subs) {
        try { fn(); } catch (err) { console.error('ChromaGlass: a reader of the ear\'s view threw', err); }
      }
    },
  };
}

/**
 * The part of the ear's view a component shows. It renders again only when
 * `select`'s result changes (compared with `Object.is`), so select the number
 * or the object as it is shown: a level rounded to what the readout prints,
 * the calibration object itself (the ear hands the same one until it moves).
 * `select` must be pure and must return the same value for the same reading.
 */
export function useEarView<T>(view: EarView, select: (a: AudioData | null) => T): T {
  const snapshot = useCallback(() => select(view.get()), [view, select]);
  return useSyncExternalStore(view.subscribe, snapshot);
}
