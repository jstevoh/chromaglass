import { useEffect, useRef, useState } from 'react';
import type { AudioData } from './useAudioAnalyzer';
import { SongBoundary, SongChangeGate, BEAT_WAIT_SEC } from '../lib/songBoundary';

/**
 * Fires a counter when a new song starts, landed on a beat of it.
 *
 * Two ways in (PLAN.md 14z). `gap`: the end of the last song heard as a fall
 * into quiet and the new one as sound that carries on (`SongBoundary`, which
 * has the measurements). `track`: song identification names a different song
 * than it did, which is the only way a crossfade or a gapless join is caught:
 * the music never falls away there. The first identification of a listen is
 * not a change (that is the same song, finally named), and a gap and the
 * name that follows it count once (`SongChangeGate`).
 *
 * Heard on the ear's own clock (`onReading`, every reading as it is made),
 * not on the App's renders. It used to run in an effect on `audioData`, the
 * reading React is shown ten times a second, so the gap was timed against
 * whichever readings happened to render (14u), and a hit to land the change
 * on would be missed nine times in ten.
 *
 * Why the beat: a look that changes between beats reads as a glitch, one that
 * changes on a hit reads as the show following the music. A gap is landed by
 * the boundary itself; an identification, which arrives seconds into the new
 * song on the matcher's own schedule, waits here for the next hit, up to
 * `BEAT_WAIT_SEC`.
 */
export interface SongChange {
  seq: number;
  reason: 'gap' | 'track';
  /** It landed on a hit of the new song. */
  onBeat: boolean;
}

export function useSongChange(
  onReading: (fn: (a: AudioData) => void) => () => void,
  trackKey: string | null,
  enabled: boolean,
): SongChange | null {
  const [change, setChange] = useState<SongChange | null>(null);
  const boundary = useRef(new SongBoundary());
  const gate = useRef(new SongChangeGate());
  const lastTrackKey = useRef<string | null>(null);
  /** An identification waiting for a hit to land on: until when (s, the ear's clock). */
  const trackLanding = useRef<number | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  // Both ways in, through one gate on the ear's clock (`SongChangeGate`).
  const fire = (reason: 'gap' | 'track', onBeat: boolean, t: number) => {
    if (!(reason === 'gap' ? gate.current.gap(t) : gate.current.track(t))) return;
    setChange((c) => ({ seq: (c?.seq ?? 0) + 1, reason, onBeat }));
  };

  useEffect(() => {
    if (!enabled) { boundary.current.reset(); gate.current.reset(); trackLanding.current = null; }
  }, [enabled]);

  useEffect(() => onReading((a) => {
    if (!enabledRef.current) return;
    const f = a.features;
    if (!f) return;
    const hit = f.onsets.kick.hit || f.onsets.level.hit;
    const start = boundary.current.update({ time: f.time, levelDb: f.db[0], hit });
    if (start) { trackLanding.current = null; fire('gap', start.onBeat, f.time); return; }
    const landing = trackLanding.current;
    if (landing !== null) {
      if (landing < 0) trackLanding.current = f.time + BEAT_WAIT_SEC;   // armed: start the wait on this clock
      else if (hit || f.time >= landing) { trackLanding.current = null; fire('track', hit, f.time); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [onReading]);

  useEffect(() => {
    const prev = lastTrackKey.current;
    lastTrackKey.current = trackKey;
    if (!enabled) return;
    // Armed with a negative mark: the ear's clock is not React's, so the wait
    // starts on the next reading.
    if (prev !== null && trackKey !== null && trackKey !== prev) trackLanding.current = -1;
  }, [trackKey, enabled]);

  return change;
}
