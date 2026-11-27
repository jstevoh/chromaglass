import { useEffect } from 'react';
import { grabPlateFrame } from '../lib/crashLog';
import { needsThumb, rememberThumb, thumbFromFrame, useLookThumb } from '../lib/lookThumbs';

/**
 * Photograph a saved look for its chip, once (PLAN 34b-6, lib/lookThumbs.ts).
 *
 * When a look the performer saved is on the plate and has no thumb yet, wait
 * until it has had THUMB_AFTER_MS to pour and spread (a look photographed the
 * moment it goes up is clean glass and one drop), then, when the browser is
 * idle, read one frame back and keep a 96 px square of it. Saving a new look
 * puts it on the plate, so a look is photographed a few seconds after it is
 * saved, and an older saved look the first time it is played.
 *
 * Why once and idle, and not on every change: the readback draws one extra
 * frame and copies it out of the GPU, a few milliseconds the frame loop does
 * not budget for. Paid once per look per machine it is invisible; paid live
 * it would be the jitter the owner keeps asking to be rid of. A look that
 * leaves the plate before its wait is up is not photographed: the next time
 * it stays, it will be.
 */
export const THUMB_AFTER_MS = 6000;

export function useLookThumbCapture(activeLookId: string | null | undefined): void {
  // A thumb forgotten (the look saved over) asks again without the look changing.
  const missing = useLookThumb(activeLookId) === null;
  useEffect(() => {
    const id = activeLookId;
    if (!id || !needsThumb(id)) return;
    let cancelled = false;
    let idle: number | null = null;
    const shoot = async () => {
      if (cancelled || document.hidden || !needsThumb(id)) return;
      const frame = await grabPlateFrame();
      if (cancelled || !frame || !frame.painted) return;
      const url = thumbFromFrame(frame);
      if (url && !cancelled) rememberThumb(id, url);
    };
    const wait = window.setTimeout(() => {
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) idle = ric(() => { void shoot(); }, { timeout: 3000 });
      else void shoot();
    }, THUMB_AFTER_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(wait);
      const cic = (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback;
      if (idle !== null && cic) cic(idle);
    };
  }, [activeLookId, missing]);
}
