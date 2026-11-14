/**
 * The ear's three presses, for the remote link to report and the owner's
 * assistant to make (PLAN 44k-10): the room's calibration (the Sound panel's
 * Recalibrate room), the song detector (Song Detection, on or off) and Listen
 * (the Songs panel's, with its Name it for a song the song ID could not
 * name).
 *
 * Why a holder here rather than props, as app/musicNow.ts: the calibration's
 * press is useBench's (`calibrateNonce`, which restarts the analyser and the
 * room tracker with it), the calibration's reading is the ear's (read by
 * useCastFeed, the hook App() already hands the ear to), the detector and
 * Listen are useListen's, and the remote link is useRemote's. All four are
 * called from App(), which is over its size ceiling and may not grow (`npm
 * run sizes`). The state stays theirs: this holds a copy for reading and the
 * doors, each set while its hook is mounted, and each door is the very
 * callback the panel's own button calls, so a calibration, a detector switch
 * or a Listen the assistant asked for is the same as one pressed by hand.
 *
 * The room, without a re-send a frame. The calibration's reading moves on
 * every analyser frame (its floor and peak in dB, its progress), and a remote
 * state re-sent at that rate goes to every phone for numbers only the
 * assistant reads. So the copy is taken when the calibration starts or ends
 * (`calibrating` changes) and when the ear starts or stops hearing (the
 * reading appears or goes): what the assistant wants from it is "listening
 * to the room" and then where the room's floor and the music's peak were
 * found, which are both those moments. Not `signal`, which flips at every
 * pause in the music and would re-send the state each time.
 */
import { useSyncExternalStore } from 'react';
import type { RoomCalibration } from '../lib/audioCalibration';
import type { ListenPhase } from '../lib/songDesign';

export interface EarNow {
  /** The song detector (Song Detection): on, songs are identified and their changes heard. */
  detector: boolean;
  /**
   * The room's calibration, as it was when it last started or ended: null when
   * Auto Calibrate is off or the show hears nothing. The dB are dBFS, rounded.
   */
  room: { calibrating: boolean; floorDb: number; peakDb: number } | null;
  /** Listen: where it is, the song it named, and the panel's own line for it. */
  listen: { phase: ListenPhase; song: { title: string; artist: string } | null; line: string };
}

export interface ListenDoor {
  start(): void;
  cancel(): void;
  tag(title: string, artist: string): void;
}

let now: EarNow = { detector: false, room: null, listen: { phase: 'idle', song: null, line: '' } };
let calibrateDoor: (() => void) | null = null;
let detectorDoor: ((on: boolean) => void) | null = null;
let listenDoor: ListenDoor | null = null;
const listeners = new Set<() => void>();

function publish(next: EarNow): void {
  now = next;
  for (const l of listeners) l();
}
export function setCalibrateDoor(d: (() => void) | null): void { calibrateDoor = d; }
export function setDetectorDoor(d: ((on: boolean) => void) | null): void { detectorDoor = d; }
export function setListenDoor(d: ListenDoor | null): void { listenDoor = d; }

/** The ear's reading, taken only at the moments named above (useCastFeed calls it on each reading React is shown). */
export function publishRoom(c: RoomCalibration | null | undefined): void {
  const was = now.room;
  if (!c) { if (was) publish({ ...now, room: null }); return; }
  if (was && was.calibrating === c.calibrating) return;
  publish({ ...now, room: { calibrating: c.calibrating, floorDb: Math.round(c.floorDb), peakDb: Math.round(c.peakDb) } });
}

/** The detector and Listen, from useListen on each change of either. */
export function publishListen(detector: boolean, phase: ListenPhase, song: { title: string; artist: string } | null, line: string): void {
  const l = now.listen;
  if (now.detector === detector && l.phase === phase && l.line === line && l.song?.title === song?.title && l.song?.artist === song?.artist) return;
  publish({ ...now, detector, listen: { phase, song: song ? { title: song.title, artist: song.artist } : null, line } });
}

/** The copy as it stands (`npm run assistant` counts its publishes by it). */
export function readEar(): EarNow { return now; }

export function useEarNow(): EarNow {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => now,
  );
}

/** Longest title or artist Name it takes, as the Songs panel's boxes are read. */
export const LISTEN_NAME_MAX = 120;

/**
 * One of the presses from the owner's assistant, already let through by the
 * relay's guard (server/assistantEar.js): null when done, else why not.
 * Judged again here on the page's own state, since the guard's copy of it
 * runs a throttled snapshot behind.
 */
export function askEar(m: { do?: unknown; on?: unknown; title?: unknown; artist?: unknown }): string | null {
  switch (m.do) {
    case 'calibrate':
      if (!calibrateDoor) return 'the ear is not running';
      // Null both when Auto Calibrate is off and when nothing is heard; the
      // guard refuses the first with its own reason, so this is the second.
      if (!now.room) return 'the show hears nothing to calibrate to: choose a sound source first (set_sound_source), or Auto Calibrate is off';
      calibrateDoor();
      return null;
    case 'detector':
      if (!detectorDoor) return 'the song detector is not running';
      if (typeof m.on !== 'boolean') return 'song_detection: on, as true or false';
      detectorDoor(m.on);
      return null;
    case 'listen-start':
      if (!listenDoor) return 'Listen is not running';
      listenDoor.start();
      return null;
    case 'listen-cancel':
      if (!listenDoor) return 'Listen is not running';
      if (now.listen.phase === 'idle') return 'Listen is not listening';
      listenDoor.cancel();
      return null;
    case 'listen-name': {
      if (!listenDoor) return 'Listen is not running';
      const title = typeof m.title === 'string' ? m.title.trim() : '';
      const artist = typeof m.artist === 'string' ? m.artist.trim() : '';
      if (!title || !artist) return 'name: the song\'s title and its artist, both';
      listenDoor.tag(title.slice(0, LISTEN_NAME_MAX), artist.slice(0, LISTEN_NAME_MAX));
      return null;
    }
    default:
      return `not one of the ear's presses: ${String(m.do)}`;
  }
}
