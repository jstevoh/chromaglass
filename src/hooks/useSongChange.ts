import { useEffect, useRef, useState } from 'react';
import type { AudioData } from './useAudioAnalyzer';
import { SongBoundary } from '../lib/songBoundary';

/**
 * Fires a counter when a new song starts: on the first sound after a gap
 * long enough to be the end of the last one (see `SongBoundary`), or when
 * track identification names a different song than it did. The first
 * identification of a listen is not a change — that is the same song,
 * finally named — and a gap and an identification close together count once.
 */
export interface SongChange {
  seq: number;
  reason: 'gap' | 'track';
}

export function useSongChange(audioData: AudioData | null, trackKey: string | null, enabled: boolean): SongChange | null {
  const [change, setChange] = useState<SongChange | null>(null);
  const boundary = useRef(new SongBoundary());
  const lastFiredAt = useRef(-Infinity);
  // A slow running peak of the energy, so "quiet" means quiet against this
  // music in this room — a noisy microphone's floor is not a song ending.
  const envelope = useRef({ peak: 0, at: 0 });
  const lastTrackKey = useRef<string | null>(null);

  const fire = (reason: 'gap' | 'track') => {
    const now = performance.now();
    if (now - lastFiredAt.current < 10_000) return;   // one change per song start, whichever signal came first
    lastFiredAt.current = now;
    setChange((c) => ({ seq: (c?.seq ?? 0) + 1, reason }));
  };

  useEffect(() => {
    if (!enabled) { boundary.current.reset(); return; }
    if (!audioData) { boundary.current.reset(); return; }
    const cal = audioData.calibration;
    const now = performance.now();
    const env = envelope.current;
    const dt = env.at ? (now - env.at) / 1000 : 0;
    env.at = now;
    env.peak = Math.max(audioData.energy, env.peak * Math.exp(-dt / 20));
    // With calibration the analyser already knows the room's floor; without it
    // a gap is the energy falling to a fraction of what the music has been.
    const quiet = cal ? !cal.signal : audioData.energy < Math.max(0.012, env.peak * 0.2);
    if (boundary.current.update(quiet, now)) fire('gap');
  });

  useEffect(() => {
    const prev = lastTrackKey.current;
    lastTrackKey.current = trackKey;
    if (!enabled) return;
    if (prev !== null && trackKey !== null && trackKey !== prev) fire('track');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey, enabled]);

  return change;
}
