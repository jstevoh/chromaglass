import { useEffect, useRef, type RefObject } from 'react';
import { inkTitleCue, inkTitleRows } from '../lib/inkTitle';
import type { TrackIdentity } from '../lib/musicTypes';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

/**
 * The identified song's title painted as ink when it changes (PLAN 37x-10):
 * the song ID's `TrackIdentity` (14z) through `inkTitleCue`, one title a
 * song, poured through the plate's title pour (`pourText`, which the
 * visualizer runs through the solver's `pourInk` and the wash,
 * lib/inkTitleRun.ts).
 *
 * The song playing when the switch is turned on is remembered and not
 * painted: the switch says what happens when a song starts, and a title
 * landing halfway through a song because a fader moved would read as a
 * mistake on a stream. The next song is painted. Feeding the cue from the
 * album show's queue, so a title lands on the song's first beat rather than
 * when the ear recognises it, is 37x-10b.
 */
export function useInkTitle(wallRef: RefObject<LiquidVisualizerHandle | null>, track: TrackIdentity | null, on: boolean): void {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const cue = inkTitleCue(last.current, track, true);
    if (!cue) return;
    last.current = cue.key;
    if (inkTitleCue(null, track, on)) wallRef.current?.pourText(inkTitleRows(cue));
  }, [track, on, wallRef]);
}
