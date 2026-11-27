import { useEffect, useRef, type RefObject } from 'react';
import { logoMeltCue, LOGO_MELT_ASPECT, LOGO_MELT_SRC, type LogoArt, type LogoMeltEdge } from '../lib/logoMelt';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * The logo melted at the start of a film (PLAN 37x-11, lib/logoMelt.ts):
 * when the Live Show goes on air or the Record button starts a take, with the
 * Logo melt switch on, the wordmark is poured onto the wall's plate through
 * the same pour a song's title takes (`pourText`, the solver's `pourInk`, the
 * thick ink's pad and its rinse), so the first frames of the film are the
 * logo and the next few seconds are it melting into the show.
 *
 * Here beside `useInkTitle` in the remote's hook, which already holds both of
 * the film's edges (the Live Show's state and the recorder). The picture is
 * loaded on the first film, not at boot: most shows never open one, and the
 * file is the one the page's intro already showed, so it is in the cache.
 */
export function useLogoMelt(wallRef: RefObject<LiquidVisualizerHandle | null>, now: LogoMeltEdge, on: boolean): void {
  const was = useRef<LogoMeltEdge>({ live: false, recording: false });
  const art = useRef<Promise<LogoArt | null> | null>(null);
  const { live, recording } = now;
  useEffect(() => {
    const cue = logoMeltCue(was.current, { live, recording }, on);
    was.current = { live, recording };
    if (!cue) return;
    art.current ??= new Promise<LogoArt | null>((done) => {
      const img = new window.Image();
      img.onload = () => done({ source: img, aspect: LOGO_MELT_ASPECT });
      // Without the picture there is no logo to melt, and nothing else changes: the film starts as it always did.
      img.onerror = () => { art.current = null; done(null); };
      img.src = LOGO_MELT_SRC;
    });
    void art.current.then((logo) => { if (logo) wallRef.current?.pourText([], { logo }); });
  }, [live, recording, on, wallRef]);
}
