/**
 * The song shows, for the remote link to report and the owner's assistant to
 * read and drive (PLAN 44k-5).
 *
 * Why a holder here rather than props, as `songCue.ts` is for the song
 * actions it adds. The shows and Follow songs are `useShowLibrary`'s, the
 * runtime, the pinned cues and the nudges `useSongScore`'s, the remote link
 * `useRemote`'s, and all three are called from App(), which is over its size
 * ceiling and may not grow (`npm run sizes`). So `useSongScore` publishes a
 * summary here and sets the door, `useShowLibrary` sets Follow's, and
 * `useRemote` reads the one and asks the other. The state stays theirs.
 *
 * Why a summary in the state and a show read whole only when asked. The
 * state goes to every phone on every change; a show's actions are up to a few
 * dozen each, and a library has dozens of shows. So the state lists the shows
 * by id and song with a count, and `song_show` asks the display for one,
 * whose answer goes to the assistant alone (`assistant-answer`).
 *
 * Why an action's id is in the read. Taking an action out is by its id
 * (`remove_song_action`), and the assistant's own carry `asst-` (useSongScore
 * names them so), which is how a Play assistant is held to its own: the
 * guard refuses any other id there, and this door says which are whose.
 */
import { useSyncExternalStore } from 'react';
import { describeWhat, describeWhen, type SongShow } from '../lib/songShows';
import { songLabel } from '../lib/songRef';
import type { NudgeKind } from '../lib/songScore';

/** What the state reads: Follow songs, the show running, the show of the song playing, and every show in brief. */
export interface SongsNow {
  follow: boolean;
  running: { showId: string; song: string | null; manual: boolean } | null;
  current: string | null;
  /** `song` is the label (title — artist); `title` the song's own title, as the phone lists it. */
  shows: { id: string; song: string; title: string; actions: number }[];
}

/** `useSongScore`'s half. Each says why not, or null when done. */
export interface SongsDoor {
  shows: () => SongShow[];
  current: () => string | null;
  remove: (actionId: string) => void;
  start: (showId: string) => void;
  stop: () => void;
  running: () => boolean;
  nudge: (kind: NudgeKind) => string | null;
  nudgeBy: (seconds: number) => string | null;
  resetNudge: () => string | null;
}

/** What `song_show` answers with: one show whole, its actions in words and with their ids. */
export interface SongShowRead {
  id: string;
  song: string;
  look: { kind: string; id: string; name: string | null };
  notes: string | null;
  playing: boolean;
  running: boolean;
  actions: { id: string; mine: boolean; says: string; when: unknown; what: unknown }[];
}

/** The id prefix of an action the assistant added (useSongScore's ASSISTANT pin). */
export const ASSISTANT_ACTION_PREFIX = 'asst-';
/** A nudge in seconds, at most this far either way: a section is the way to go further. */
export const SONG_NUDGE_MAX_S = 30;

let now: SongsNow = { follow: true, running: null, current: null, shows: [] };
let door: SongsDoor | null = null;
let followDoor: ((on: boolean) => void) | null = null;
const listeners = new Set<() => void>();

const sameNow = (a: SongsNow, b: SongsNow) => a.follow === b.follow && a.current === b.current
  && a.running?.showId === b.running?.showId && a.running?.song === b.running?.song && a.running?.manual === b.running?.manual
  && a.shows.length === b.shows.length && a.shows.every((s, i) => s.id === b.shows[i].id && s.song === b.shows[i].song && s.actions === b.shows[i].actions);

export function publishSongs(s: SongsNow): void {
  if (sameNow(now, s)) return;
  now = s;
  for (const l of listeners) l();
}
export function setSongsDoor(d: SongsDoor | null): void { door = d; }
export function setFollowDoor(d: ((on: boolean) => void) | null): void { followDoor = d; }

/** The brief a show is listed by. */
export const showBrief = (s: SongShow) => ({ id: s.id, song: songLabel(s.song), title: s.song.title, actions: s.actions.length });

/** A show by its id, or by its song as the state lists it (any case); with none named, the show of the song playing. */
function findShow(shows: SongShow[], named: unknown, current: string | null): SongShow | string {
  if (named === undefined || named === null || named === '') {
    const hit = current ? shows.find(s => s.id === current) : undefined;
    return hit ?? 'the song playing has no show: name one, as show_state\'s songs.shows lists them';
  }
  if (typeof named !== 'string') return 'a show by its id or its song';
  const want = named.trim().toLowerCase();
  return shows.find(s => s.id === named) ?? shows.find(s => songLabel(s.song).trim().toLowerCase() === want)
    ?? `no song show "${named}"`;
}

/** One show, read whole: its look, its notes, and each action in words, with its id and whose it is. */
export function readShow(s: SongShow, current: string | null, running: string | null): SongShowRead {
  return {
    id: s.id, song: songLabel(s.song), look: { kind: s.look.kind, id: s.look.id, name: s.look.name ?? null }, notes: s.notes ?? null,
    playing: s.id === current, running: s.id === running,
    actions: s.actions.map(a => ({ id: a.id, mine: a.id.startsWith(ASSISTANT_ACTION_PREFIX), says: `${describeWhen(a.when)}: ${describeWhat(a.what)}`, when: a.when, what: a.what })),
  };
}

export type SongsAnswer = { ok: true; data?: SongShowRead } | { ok: false; reason: string };
const no = (reason: string): SongsAnswer => ({ ok: false, reason });
const done = (why: string | null): SongsAnswer => (why ? no(why) : { ok: true });

/**
 * The relay's `assistant-songs`: done (with what a read found), or why not.
 * Read as untrusted: the guard checked it against the shows the display last
 * reported, and they may have changed since, so each is found again here.
 */
export function askSongs(m: { do?: unknown; show?: unknown; actionId?: unknown; to?: unknown; seconds?: unknown; on?: unknown }): SongsAnswer {
  if (m.do === 'follow') {
    if (!followDoor) return no('the song shows are not running');
    if (typeof m.on !== 'boolean') return no('follow: on, as true or false');
    followDoor(m.on);
    return { ok: true };
  }
  if (!door) return no('the song shows are not running');
  const shows = door.shows();
  const current = door.current();
  switch (m.do) {
    case 'read': {
      const s = findShow(shows, m.show, current);
      return typeof s === 'string' ? no(s) : { ok: true, data: readShow(s, current, now.running?.showId ?? null) };
    }
    case 'remove': {
      const id = m.actionId;
      if (typeof id !== 'string' || !id) return no('an action by its id, as song_show lists them');
      if (!shows.some(s => s.actions.some(a => a.id === id))) return no(`no action ${id} in any song show (taken out already?)`);
      door.remove(id);
      return { ok: true };
    }
    case 'start': {
      const s = findShow(shows, m.show, current);
      if (typeof s === 'string') return no(s);
      door.start(s.id);
      return { ok: true };
    }
    case 'stop':
      if (!door.running()) return no('no song show is running');
      door.stop();
      return { ok: true };
    case 'nudge':
      if (m.to === 'next-section' || m.to === 'section-start') return done(door.nudge(m.to));
      if (m.to === 'reset') return done(door.resetNudge());
      if (typeof m.seconds === 'number' && Number.isFinite(m.seconds) && m.seconds !== 0 && Math.abs(m.seconds) <= SONG_NUDGE_MAX_S) return done(door.nudgeBy(m.seconds));
      return no(`nudge: to next-section, section-start or reset, or seconds up to ${SONG_NUDGE_MAX_S} either way`);
    default: return no(`not a song show call this build knows: ${String(m.do)}`);
  }
}
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const useSongsNow = () => useSyncExternalStore(subscribe, () => now, () => now);
