/**
 * Recording's options and the kept Takes, for the remote link to report and
 * the owner's assistant to set (PLAN 44k-11): what the one Record button
 * makes (lib/recordChoice.ts: the Plate video, a Take, or both), the video's
 * quality, frame rate, container and sound (hooks/useRecorder.ts), and the
 * Takes the Record panel lists, replayed, stopped or deleted.
 *
 * Why a holder here rather than props, as app/earNow.ts: the choice and the
 * recorder are useRecording's, the Takes are useMusicIntelligence's (which
 * useRecording is already handed), and the remote link is useRemote's, all
 * called from App(), which is over its size ceiling and may not grow (`npm
 * run sizes`). The state stays theirs: this holds a copy for reading and the
 * door, set while useRecording is mounted, whose every call is the very
 * callback the Record panel's own controls call (`setRecordChoice`,
 * `recorder.setOptions`, Replay, Stop Replay, the bin), so an option the
 * assistant set is the same as one chosen by hand, saved where the panel's
 * is, and shown lit in the panel.
 *
 * The copy changes only when an option, the kept Takes, a replay or the
 * last video change, never with the recording's clock (that is `recording`
 * in the remote state already, a second at a time), so a phone is not sent
 * the list again every second a video runs.
 */
import { useSyncExternalStore } from 'react';
import type { VideoFormat, VideoQuality, RecorderOptions } from '../hooks/useRecorder';
import type { RecordChoice } from '../lib/recordChoice';

export type RecordMakes = 'video' | 'take' | 'both';

export interface TakeNow {
  /** Its number in the list, 1 the newest, as the assistant names it. */
  n: number;
  id: string;
  title: string | null;
  artist: string | null;
  seconds: number;
  gestures: number;
  /** 'song': it replays in time with its song; 'wall': on its own clock. */
  clock: 'song' | 'wall';
  date: string;
}

export interface RecordNow {
  makes: RecordMakes;
  quality: VideoQuality;
  fps: number;
  format: VideoFormat;
  /** The sound the show hears goes into the Plate video. */
  sound: boolean;
  /** The containers this browser's encoder can write, with the sound as chosen. */
  formats: Exclude<VideoFormat, 'auto'>[];
  /** This browser can record a Plate video at all (else Record makes a Take alone). */
  videoSupported: boolean;
  /** The last Plate video written this session (it is saved to Downloads as it stops). */
  lastVideo: { filename: string; seconds: number; sizeBytes: number } | null;
  /** The newest TAKES_LISTED kept Takes, newest first. */
  takes: TakeNow[];
  takeCount: number;
  /** The number of the Take replaying, or null. */
  replaying: number | null;
}

export interface RecordDoor {
  choose(c: RecordChoice): void;
  options(o: Partial<RecorderOptions>): void;
  /** Each false when no Take has that id (deleted since the list was read). */
  replay(id: string): boolean;
  stopReplay(): void;
  remove(id: string): boolean;
}

/** As many Takes as a phone is sent; the assistant names one by its number in these. */
export const TAKES_LISTED = 30;

const EMPTY: RecordNow = {
  makes: 'video', quality: 'standard', fps: 60, format: 'auto', sound: true, formats: [], videoSupported: false,
  lastVideo: null, takes: [], takeCount: 0, replaying: null,
};
let now: RecordNow = EMPTY;
let nowKey = '';
let door: RecordDoor | null = null;
const listeners = new Set<() => void>();

export function setRecordDoor(d: RecordDoor | null): void { door = d; }

/** useRecording's, on each change of what it is made from; the same copy is kept when nothing in it moved. */
export function publishRecord(next: RecordNow): void {
  const key = JSON.stringify(next);
  if (key === nowKey) return;
  nowKey = key;
  now = next;
  for (const l of listeners) l();
}

/** The copy as it stands (`npm run assistant` reads it). */
export function readRecord(): RecordNow { return now; }

export function useRecordNow(): RecordNow {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => now,
  );
}

const MAKES: RecordMakes[] = ['video', 'take', 'both'];
const QUALITIES: VideoQuality[] = ['master', 'standard', 'compact'];
const FPS = [60, 30];
const FORMATS: VideoFormat[] = ['auto', 'webm', 'mp4'];

/** The Take a message names: its id when the guard resolved one, else its number in the copy. */
function takeId(m: { take?: unknown; id?: unknown }): string | null {
  if (typeof m.id === 'string' && m.id) return m.id;
  const n = m.take === undefined ? 1 : m.take;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 ? now.takes[n - 1]?.id ?? null : null;
}

/**
 * One call from the owner's assistant, already let through by the relay's
 * guard (server/assistantRecord.js): null when done, else why not. Judged
 * again here on the page's own state, since the guard's copy of it runs a
 * throttled snapshot behind, and an older guard's not at all.
 */
export function askRecord(m: { do?: unknown; makes?: unknown; quality?: unknown; fps?: unknown; format?: unknown; sound?: unknown; take?: unknown; id?: unknown }): string | null {
  if (!door) return 'the recorder is not running';
  switch (m.do) {
    case 'options': {
      const o: Partial<RecorderOptions> = {};
      if (m.makes !== undefined && !MAKES.includes(m.makes as RecordMakes)) return `makes: ${MAKES.join(', ')}`;
      if (m.quality !== undefined) {
        if (!QUALITIES.includes(m.quality as VideoQuality)) return `quality: ${QUALITIES.join(', ')}`;
        o.quality = m.quality as VideoQuality;
      }
      if (m.fps !== undefined) {
        if (!FPS.includes(m.fps as number)) return 'fps: 60 or 30';
        o.fps = m.fps as number;
      }
      if (m.format !== undefined) {
        if (!FORMATS.includes(m.format as VideoFormat)) return `format: ${FORMATS.join(', ')}`;
        // What useRecorder's pickMime would otherwise do quietly: write the other container.
        if (m.format !== 'auto' && !now.formats.includes(m.format as Exclude<VideoFormat, 'auto'>)) {
          return `this browser's encoder cannot write ${String(m.format)} (it writes ${now.formats.join(', ') || 'no video at all'})`;
        }
        o.format = m.format as VideoFormat;
      }
      if (m.sound !== undefined) {
        if (typeof m.sound !== 'boolean') return 'sound: true or false';
        o.includeAudio = m.sound;
      }
      if (m.makes === undefined && Object.keys(o).length === 0) return 'record_options: nothing to set';
      if (m.makes !== undefined) door.choose({ video: m.makes !== 'take', take: m.makes !== 'video' });
      if (Object.keys(o).length > 0) door.options(o);
      return null;
    }
    case 'take-replay': {
      const id = takeId(m);
      if (!id) return now.takeCount === 0 ? 'no Takes are kept yet' : 'no such Take in the list';
      return door.replay(id) ? null : 'that Take is gone (deleted since the list was read): read show_state again';
    }
    case 'take-stop':
      if (now.replaying === null) return 'no Take is replaying';
      door.stopReplay();
      return null;
    case 'take-delete': {
      const id = takeId(m);
      if (!id) return now.takeCount === 0 ? 'no Takes are kept yet' : 'no such Take in the list';
      return door.remove(id) ? null : 'that Take is gone (deleted since the list was read): read show_state again';
    }
    default:
      return `not one of recording's calls: ${String(m.do)}`;
  }
}
