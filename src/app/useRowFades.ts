import { useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type ShowIntervalHandle, clearShowInterval, showNow, showInterval } from '../lib/showClock';
import { fadeTempo, barsToMs, fadeBarsOf, type RowFades, type FadeWay } from '../lib/mixFade';
import { type MixSource, MIX_SOURCE_INFO } from '../lib/mixer';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { TempoSource } from '../lib/tempo';
import type { VisualizerSettings } from '../types';

/**
 * A mixer row's take button (`lib/mixFade.ts`): out over its fade, or back in
 * to where it was, counted in bars at the tempo the desk sends or taps, else the
 * one the bar grid hears, else 120. `npm run rowfade` reads it.
 */
interface RowFadesDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  tempoRef: RefObject<TempoSource | null>;
  settingsRef: RefObject<VisualizerSettings>;
  glidesRef: RefObject<Map<string, ShowIntervalHandle>>;
  rowFades: RowFades;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  setDocDirty: Dispatch<SetStateAction<boolean>>;
  setRowFading: Dispatch<SetStateAction<Partial<Record<MixSource, FadeWay>>>>;
  rowFading: Partial<Record<MixSource, FadeWay>>;
}

export function useRowFades({
  wallRef, tempoRef, settingsRef, glidesRef, rowFades, setSettings, setDocDirty, setRowFading,
  rowFading,
}: RowFadesDeps) {
  /*
    A row's take button (lib/mixFade.ts): out over its fade time, or back in
    to where it was. The bars are counted at the tempo the desk sends or taps,
    else the one the bar grid hears in the music, else 120.

    On the show timer, not requestAnimationFrame, for the dimmer's reason: the
    laptop's window spends a show behind the projector's, and a film taken
    out from a pad while the operator watches the wall must still go.
  */
  const rowFadeTimer = useRef<ShowIntervalHandle | null>(null);
  const fadeBpm = (): number => {
    const bar = wallRef.current?.songShape().bar;
    return fadeTempo(tempoRef.current?.bpm ?? 0, bar?.period ?? 0, bar?.beatConfidence ?? 0);
  };
  /*
    The check's window on the takes (`npm run phone`): when the page has put an
    array at `window.__cgFadeLog`, every level a take writes is pushed there
    with the moment it was worked out, on the page's own clock. The check used
    to judge the fade's steps from the level slider, but a slider shows what
    React last rendered, and on a loaded page a render lands late and the next
    one catches up: a fade moving at the curve's own speed read as a jump (the
    numbers are in scripts/phone.mjs). The moment each level is worked out is
    the time its step can fairly be held to, and the gap between them is
    where a slowed timer shows. It is `performance.now()`, not the `now` the
    fade was handed, so a fade handed the wrong time still shows as the jump
    it is. Nothing is kept when no array is there, as in every show.
  */
  const traceFade = (levels: Partial<Record<MixSource, number>>) => {
    const log = window.__cgFadeLog;
    if (!Array.isArray(log)) return;
    const at = performance.now();
    for (const [row, v] of Object.entries(levels)) log.push([at, row, v]);
  };
  const fadeRow = (id: MixSource) => {
    const cur = settingsRef.current as unknown as Record<string, unknown>;
    const levelKey = String(MIX_SOURCE_INFO[id].level);
    const level = typeof cur[levelKey] === 'number' ? cur[levelKey] as number : 1;
    // A song's glide of this level stops: the button is the later hand.
    const glide = glidesRef.current.get(levelKey);
    if (glide) { clearShowInterval(glide); glidesRef.current.delete(levelKey); }
    const first = rowFades.press(id, level, barsToMs(fadeBarsOf(settingsRef.current, id), fadeBpm()), showNow());
    traceFade({ [id]: first });
    if (first !== level) setSettings(prev => ({ ...prev, [levelKey]: first }));
    setDocDirty(true);
    setRowFading(rowFades.running());
    if (rowFadeTimer.current || !rowFades.isFading(id)) return;
    rowFadeTimer.current = showInterval(() => {
      const levels = rowFades.step(showNow());
      traceFade(levels);
      const patch = Object.fromEntries(Object.entries(levels).map(([row, v]) => [String(MIX_SOURCE_INFO[row as MixSource].level), v]));
      if (Object.keys(patch).length) setSettings(prev => ({ ...prev, ...patch }));
      const running = rowFades.running();
      setRowFading(prev => Object.keys(prev).join() === Object.keys(running).join() && Object.values(prev).join() === Object.values(running).join() ? prev : running);
      if (!Object.keys(running).length && rowFadeTimer.current) { clearShowInterval(rowFadeTimer.current); rowFadeTimer.current = null; }
    }, 16, 'row-fade');
  };
  useEffect(() => () => { if (rowFadeTimer.current) clearShowInterval(rowFadeTimer.current); }, []);
  const mixTakes = { onFade: fadeRow, fading: rowFading };

  return {
    rowFadeTimer, fadeRow, mixTakes,
  };
}
