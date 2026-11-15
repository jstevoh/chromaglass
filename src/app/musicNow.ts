/**
 * The music player, for the remote link to report and the owner's assistant
 * to drive (PLAN 44k-2): what is loaded, where it is, its length, playing or
 * not, the loop; and the one door that opens a track, plays, pauses, seeks,
 * loops and closes it.
 *
 * Why a holder here rather than props, as app/soundNow.ts: the player's
 * state is useSoundState's, its verbs are useSoundSource's, the remote link
 * is useRemote's, and all three are called from App(), which is over its
 * size ceiling and may not grow (`npm run sizes`). The state stays theirs:
 * this holds a copy for reading and the door, both set while they are
 * mounted. The door is the same set of callbacks the player's own buttons
 * call (useSoundSource's `playTrack`, `toggleMusic`, `closeMusicFile`, and
 * the element's own seek), so nothing about a track the assistant opened
 * differs from one opened by hand: it becomes what the show hears, the song
 * detector hears it, a song show follows it, Loop hands a shelf track on.
 *
 * Where it is, without a re-send a second. The element's clock moves four
 * times a second (`timeupdate`), and a remote state re-sent at that rate goes
 * to every phone for a number only the assistant reads. So the copy holds
 * where the track was (`at`) and when that was read (`atTime`, the epoch
 * clock), taken again only when something other than time moves it: a play,
 * a pause, a seek, a new file, the end. The reader (`mcp/chromaglass-mcp.js`,
 * on this same Mac and this same clock) carries it forward while it plays.
 *
 * A file by its path. The page cannot open a path on the Mac, and must not be
 * handed one to try: the show server checks the path (inside the music
 * folder, a sound file, a real file and not a link out of the folder:
 * server/assistantMusic.js) and serves it under a one-off address of its own,
 * `/assistant-music/<token>`, on the page's own origin, so its stream is the
 * page's to analyse. The door takes that address and no other, so a relay
 * fault cannot have the page fetch an address somebody chose.
 */
import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { LIBRARY, type Track } from '../lib/musicLibrary';

/** The address the show server serves an admitted file under (server/assistantMusic.js `MUSIC_PATH`). */
export const ASSISTANT_MUSIC_PATH = '/assistant-music/';

export interface PlayerNow {
  /** What is loaded: a shelf track's title or a file's name; null when nothing is. */
  name: string | null;
  kind: 'track' | 'file' | null;
  artist: string | null;
  /** Seconds; 0 until the file's length is read. */
  length: number;
  /** Where it was, seconds, at `atTime` (epoch ms); carried forward by the reader while it plays. */
  at: number;
  atTime: number;
  playing: boolean;
  /** On: a shelf track rolls on to the next when it ends, a file repeats. */
  loop: boolean;
  /** The shelf, so the assistant names a track that is on it. */
  library: { title: string; artist: string; seconds: number }[];
}

export interface MusicDoor {
  track(t: Track): void;
  file(url: string, name: string): void;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  close(): void;
}

const SHELF = LIBRARY.map(t => ({ title: t.title, artist: t.artist, seconds: t.seconds }));
let now: PlayerNow = { name: null, kind: null, artist: null, length: 0, at: 0, atTime: 0, playing: false, loop: true, library: SHELF };
let door: MusicDoor | null = null;
let loopDoor: ((on: boolean) => void) | null = null;
const listeners = new Set<() => void>();

export function publishPlayer(next: PlayerNow): void {
  now = next;
  for (const l of listeners) l();
}
export function setMusicDoor(d: MusicDoor | null): void { door = d; }
export function setLoopDoor(d: ((on: boolean) => void) | null): void { loopDoor = d; }

/** A shelf track by its title: the exact title (any case), else the one title that holds the words. */
export function shelfTrack(name: string): Track | null {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  const exact = LIBRARY.find(t => t.title.toLowerCase() === want);
  if (exact) return exact;
  const some = LIBRARY.filter(t => t.title.toLowerCase().includes(want));
  return some.length === 1 ? some[0] : null;
}

/** The relay's `assistant-music`: done, or why not. */
export function askMusic(m: { do?: unknown; track?: unknown; url?: unknown; name?: unknown; seconds?: unknown; on?: unknown }): string | null {
  if (!door) return 'the music player is not running';
  switch (m.do) {
    case 'track': {
      const t = typeof m.track === 'string' ? shelfTrack(m.track) : null;
      if (!t) return `no track "${String(m.track)}" on the shelf (there are: ${LIBRARY.map(x => x.title).join('; ')})`;
      door.track(t);
      return null;
    }
    case 'file': {
      if (typeof m.url !== 'string' || !m.url.startsWith(ASSISTANT_MUSIC_PATH) || !/^[0-9a-f]{32}$/.test(m.url.slice(ASSISTANT_MUSIC_PATH.length))) return 'a file reaches the player only through the show server';
      door.file(m.url, (typeof m.name === 'string' && m.name.trim() ? m.name.trim() : 'Music file').slice(0, 120));
      return null;
    }
    case 'loop':
      if (typeof m.on !== 'boolean') return 'loop: on, as true or false';
      loopDoor?.(m.on);
      return loopDoor ? null : 'the music player is not running';
  }
  if (!now.name) return 'nothing is loaded in the player: play_track first';
  switch (m.do) {
    case 'play': door.play(); return null;
    case 'pause': door.pause(); return null;
    case 'close': door.close(); return null;
    case 'seek': {
      const s = typeof m.seconds === 'number' && Number.isFinite(m.seconds) ? m.seconds : NaN;
      if (!(s >= 0)) return 'seek: seconds from the start, 0 or more';
      if (now.length > 0 && s > now.length) return `seek: the track is ${Math.round(now.length)} s long, not ${s}`;
      door.seek(s);
      return null;
    }
  }
  return `music: play, pause, seek, loop or close, not ${String(m.do)}`;
}

/**
 * The player's copy, taken from useSoundState's own state: again on a play,
 * a pause, a new file, the loop, its length read, and on the element's
 * `seeked` and `ended`, which move where it is without a state of their own.
 */
export function usePlayerReport(o: {
  el: RefObject<HTMLAudioElement | null>;
  file: { name: string; track?: Track } | null;
  playing: boolean;
  loop: boolean;
  length: number;
  setLoop: (on: boolean) => void;
}): void {
  const { el, file, playing, loop, length, setLoop } = o;
  useEffect(() => {
    const take = () => publishPlayer({
      name: file ? file.track?.title ?? file.name : null,
      kind: file ? (file.track ? 'track' : 'file') : null,
      artist: file?.track?.artist ?? null,
      length: file ? length : 0,
      at: file ? el.current?.currentTime ?? 0 : 0,
      atTime: Date.now(),
      playing: !!file && playing,
      loop,
      library: SHELF,
    });
    take();
    const a = el.current;
    a?.addEventListener('seeked', take);
    a?.addEventListener('ended', take);
    return () => { a?.removeEventListener('seeked', take); a?.removeEventListener('ended', take); };
  }, [el, file, playing, loop, length]);
  useEffect(() => { setLoopDoor(setLoop); return () => setLoopDoor(null); }, [setLoop]);
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const usePlayerNow = () => useSyncExternalStore(subscribe, () => now, () => now);
