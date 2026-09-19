import { useCallback, useEffect, useRef, useState } from 'react';
import type { SongMap, SongSection, TrackIdentity } from '../lib/musicTypes';
import { songRefFromTrack, songLabel } from '../lib/songRef';
import { dueActions, describeWhat, describeWhen, showFor, type FiredState, type SongAction, type SongClock, type SongShow } from '../lib/songShows';

/**
 * Runs a song's show while the song plays (see lib/songShows.ts).
 *
 * A show starts one of three ways: on its own when its song is identified and
 * "Follow songs" is on; by hand, from the Songs sheet, which starts its clock
 * now; or from the clip tool, which starts it on the first note. Either way the
 * song's look arrives first, whole, and then its actions fire as the clock,
 * the song map's sections and the kicks reach them.
 *
 * The hook owns no settings: it asks the app to do each thing (`perform`), so
 * a burst from a show is the same burst a pad fires.
 */

export interface SongShowStatus {
  showId: string | null;
  song: string | null;
  /** Seconds into the song, as the show counts them. */
  t: number;
  /** Started by hand (its own clock) rather than by the song being identified. */
  manual: boolean;
  /** The last thing that fired, for the sheet to show. */
  last: string | null;
}

export interface SongShowRuntime {
  status: SongShowStatus;
  /**
   * Start a show now: its look, then its actions from a clock that starts at
   * zero. `skip` leaves some kinds of action out (the clip tool pours its own
   * title and sign-off around its hold, so it skips the show's).
   */
  start: (showId: string, opts?: { skip?: string[]; duration?: number }) => void;
  stop: () => void;
}

interface Args {
  shows: SongShow[];
  follow: boolean;
  track: TrackIdentity | null;
  positionSec: number;
  songMap: SongMap | null;
  isActive: boolean;
  /** Kicks since the plate started. */
  kicks: () => number;
  /** Put a song's look on the plate, faded over `fade` seconds. */
  applyLook: (show: SongShow, fade: number) => void;
  /** Do one action. */
  perform: (action: SongAction, show: SongShow) => void;
}

const IDLE: SongShowStatus = { showId: null, song: null, t: 0, manual: false, last: null };

/** Which section the song is in, and how many of each kind have begun, from the song map. */
function sectionsAt(sections: SongSection[] | undefined, t: number): Pick<SongClock, 'section' | 'sectionCounts'> {
  if (!sections?.length) return { section: null, sectionCounts: {} };
  const index = sections.findIndex((s) => t >= s.start && t < s.end);
  if (index < 0) return { section: null, sectionCounts: {} };
  const counts: Record<string, number> = {};
  for (let i = 0; i <= index; i++) {
    const kind = sections[i].label.toLowerCase().replace(/[^a-z].*$/, '');
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return { section: { label: sections[index].label, index }, sectionCounts: counts };
}

export function useSongShows(a: Args): SongShowRuntime {
  const argsRef = useRef(a);
  argsRef.current = a;
  const [status, setStatus] = useState<SongShowStatus>(IDLE);
  const runRef = useRef<{
    show: SongShow;
    manual: boolean;
    startedAt: number;         // performance.now() at t = 0, for a manual clock
    kicksAtStart: number;
    fired: FiredState;
    trackIsrc: string | null;
    last: string | null;
  } | null>(null);

  const begin = useCallback((show: SongShow, manual: boolean, fromSec: number) => {
    const x = argsRef.current;
    runRef.current = {
      show, manual,
      startedAt: performance.now() - fromSec * 1000,
      kicksAtStart: x.kicks(),
      fired: new Map(),
      trackIsrc: x.track?.isrc ?? null,
      last: null,
    };
    x.applyLook(show, manual ? 0 : 2);
    setStatus({ showId: show.id, song: songLabel(show.song), t: fromSec, manual, last: null });
  }, []);

  const skipRef = useRef<Set<string>>(new Set());
  /** How long the song is, when whoever started the show knows better than the song map (the clip tool does). */
  const durationRef = useRef<number | null>(null);
  const start = useCallback((showId: string, opts?: { skip?: string[]; duration?: number }) => {
    const show = argsRef.current.shows.find((s) => s.id === showId);
    skipRef.current = new Set(opts?.skip ?? []);
    durationRef.current = opts?.duration && opts.duration > 0 ? opts.duration : null;
    if (show) begin(show, true, 0);
  }, [begin]);

  const stop = useCallback(() => { runRef.current = null; setStatus(IDLE); }, []);

  // Follow: the identified song has a show, and it is not the one running.
  useEffect(() => {
    if (!a.follow || !a.track) return;
    const show = showFor(a.shows, songRefFromTrack(a.track));
    const run = runRef.current;
    if (!show) return;
    if (run && run.show.id === show.id && run.trackIsrc === a.track.isrc) return;
    skipRef.current = new Set();
    durationRef.current = null;
    begin(show, false, Math.max(0, a.positionSec));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.follow, a.track?.isrc, a.shows]);

  // A followed song that changes or goes away takes its show with it.
  useEffect(() => {
    const run = runRef.current;
    if (run && !run.manual && run.trackIsrc !== (a.track?.isrc ?? null)) stop();
  }, [a.track?.isrc, stop]);

  // The clock: ten times a second is finer than any action needs.
  useEffect(() => {
    const timer = setInterval(() => {
      const run = runRef.current;
      const x = argsRef.current;
      if (!run || !x.isActive) return;
      // Keep the show in step with edits made while it runs.
      const found = x.shows.find((s) => s.id === run.show.id);
      if (!found) { stop(); return; }
      const current = skipRef.current.size ? { ...found, actions: found.actions.filter((act) => !skipRef.current.has(act.what.do)) } : found;
      run.show = current;
      const t = run.manual ? (performance.now() - run.startedAt) / 1000 : Math.max(0, x.positionSec);
      const duration = durationRef.current ?? x.track?.durationSec ?? current.song.durationSec ?? null;
      const clock: SongClock = {
        t, duration,
        ...sectionsAt(run.manual ? undefined : x.songMap?.sections, t),
        kicks: Math.max(0, x.kicks() - run.kicksAtStart),
      };
      for (const action of dueActions(current, clock, run.fired)) {
        x.perform(action, current);
        run.last = `${describeWhen(action.when)}: ${describeWhat(action.what)}`;
      }
      // A manual run ends a little after its song would have.
      if (run.manual && duration !== null && t > duration + 2) { stop(); return; }
      setStatus((s) => (s.showId === current.id && Math.floor(s.t) === Math.floor(t) && s.last === run.last ? s
        : { showId: current.id, song: songLabel(current.song), t, manual: run.manual, last: run.last }));
    }, 100);
    return () => clearInterval(timer);
  }, [stop]);

  return { status, start, stop };
}
