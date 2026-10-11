import { useEffect, useRef } from 'react';

/**
 * Esc calls `onClose`, from anywhere in the window, for as long as the
 * component that asks is mounted.
 *
 * Listened for once and read through a ref, which is not the obvious way to
 * write it. The obvious way, an effect keyed on `onClose`, was what every
 * sheet did, and a sheet's `onClose` is an arrow App writes afresh on every
 * render (`() => setShowStage(false)`). App re-renders whenever the sound
 * does, so the Stage sheet took its key listener off the window and put it
 * back 11 times a second (measured in a cloud session's Chromium by counting
 * `addEventListener('keydown')`: 22 a second with the sheet up against 11
 * with it shut, the other 11 being the show keys in App).
 *
 * That churn can lose the key. A browser hands an event to the listeners a
 * window had when the event reached it, and skips any of those taken off
 * before their turn. App's own Esc listener runs ahead of a sheet's and sets
 * state; when React has another update pending it renders that in a
 * microtask straight after App's listener returns, and a render begins by
 * flushing the effects the last commit left waiting. If the sheet's effect
 * was one of them, its old listener comes off (skipped for this event) and
 * its new one goes on (too late for it): Esc closes nothing. That is the
 * Desk v2 layout check's "the Stage sheet never closed" (`npm run layout`,
 * once, on the ubuntu runner deploying #343; it was the click after, landing
 * on the sheet's backdrop, that finally closed it). Inferred from
 * the churn and the DOM's dispatch rule, not caught in the act: forty
 * open-and-Esc rounds in a cloud session all closed.
 *
 * The Desk's own keys were written this way for the same churn
 * (`desk/Desk.tsx`, "Read through a ref and listened for once").
 */
export function useEscape(onClose: () => void): void {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') latest.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
