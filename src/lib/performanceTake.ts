import type { GestureEvent, SavedPerformance, TrackIdentity } from './musicTypes';

/**
 * A performance, started and stopped by hand.
 *
 * Reported: "the performance auto detect doesn't work well". A performance
 * used to be whatever was painted during one *listen*, and a listen began
 * when the song was identified and ended at a long enough silence or the
 * next identification: so a performance started late (identification takes
 * seconds, and needs sound), ran on through the next song when the gap
 * between them was short, and was lost when nothing was identified at all.
 *
 * Now the performer says when it starts and stops. The one thing still done
 * for them is the song: whatever was identified when it started is
 * attached, or failing that whatever had been identified by the time it
 * stopped. The gestures are timed from the start as they are painted and
 * put into the song's time when it stops, so a replay lands them at the
 * same moments in the song. With no song at all they keep their own clock.
 */

/** Where a song began, on performance.now(): identification time less the offset it matched at. */
export function songStartMs(track: Pick<TrackIdentity, 'identifiedAtMs' | 'offsetSec'> | null | undefined): number | null {
  if (!track || track.identifiedAtMs == null) return null;
  return track.identifiedAtMs - (track.offsetSec ?? 0) * 1000;
}

export interface TakeSong {
  isrc: string;
  title?: string;
  artist?: string;
  /** performance.now() at the song's start. */
  startMs: number;
}

/** The song to attach: the one running when the performance started, else the one running when it stopped. */
export function takeSong(atStart: TakeSong | null, atStop: TakeSong | null): TakeSong | null {
  return atStart ?? atStop;
}

/**
 * The finished performance. `gestures` are timed in seconds since
 * `startedAtMs`; with a song they are moved into its time.
 */
export function finishTake(
  gestures: GestureEvent[],
  startedAtMs: number,
  stoppedAtMs: number,
  song: TakeSong | null,
  id: string,
  date: string,
): SavedPerformance {
  const durationSec = Math.max(0, (stoppedAtMs - startedAtMs) / 1000);
  if (!song) return { id, date, clock: 'wall', durationSec, gestures };
  const shift = (startedAtMs - song.startMs) / 1000;
  return {
    id, date, clock: 'song', durationSec,
    isrc: song.isrc, title: song.title, artist: song.artist,
    gestures: gestures.map((g) => ({ ...g, t: g.t + shift })),
  };
}

/**
 * Where a replay is, in the performance's own time.
 *
 * A song performance follows the song when it is the one playing, so it
 * stays in step with it; otherwise (a song performance replayed without its
 * song, or one with no song) it runs from its first gesture on the clock.
 */
export function replayPosition(
  perf: Pick<SavedPerformance, 'clock' | 'isrc' | 'gestures'>,
  replayStartMs: number,
  nowMs: number,
  playing: Pick<TrackIdentity, 'isrc' | 'identifiedAtMs' | 'offsetSec'> | null,
): number {
  if (perf.clock === 'song' && playing && playing.isrc === perf.isrc) {
    const start = songStartMs(playing);
    if (start !== null) return (nowMs - start) / 1000;
  }
  const first = perf.gestures.length ? Math.min(...perf.gestures.map((g) => g.t)) : 0;
  return first - 0.25 + (nowMs - replayStartMs) / 1000;
}

/** The gestures due in (from, to], by index, skipping those already fired. */
export function dueGestures(gestures: GestureEvent[], from: number, to: number, fired: Set<number>): GestureEvent[] {
  const out: GestureEvent[] = [];
  gestures.forEach((g, i) => {
    if (g.t > from && g.t <= to && !fired.has(i)) { fired.add(i); out.push(g); }
  });
  return out;
}

/** m:ss */
export function clockText(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
