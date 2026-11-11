/**
 * Film, pours, the room camera and the mark, for the remote link to report
 * and the owner's assistant to drive (PLAN 44k-13): what drives the plate as
 * the film (a file, a cartoon, a camera, a window), what pours into the dish
 * (a picture laid as dye, a film poured frame by frame), the room camera
 * that stirs it, and the mark (the logo card) over it.
 *
 * Why a holder here rather than props, as app/recordNow.ts: the film is
 * useFilm's, the pour usePour's, the room useSceneSource's, the mark
 * useCastFeed's, and the remote link useRemote's, all called from App(),
 * which is over its size ceiling and may not grow (`npm run sizes`). Their
 * state stays theirs: each publishes its piece of the copy here and sets its
 * own door, whose every call is the one the panel's own controls make
 * (useFilm's `startFilmCamera`, usePour's `pourVideoFrom`, useSceneSource's
 * `toggleScene`, useCastFeed's `loadMark`), so a film the assistant put on is
 * the film the Film panel and the phone's cartoon shelf show lit.
 *
 * A file by its path never reaches the page: the show server checks the
 * path (a media folder, the kind the call takes, a real file and not a link
 * out of the folder: server/assistantMedia.js) and serves it under a one-off
 * address on the page's own origin, `/assistant-media/<token>`, so a film is
 * the page's to read into a texture (a cross-origin one could not be). The
 * door takes that address and no other, so a relay fault cannot have the
 * page fetch an address somebody chose.
 *
 * A camera by its name, as the pickers show it (lib/cameras.ts
 * `cameraChoices`), judged here again on the page's own list, since the
 * guard's copy runs behind (a camera unplugged between the read and the call
 * is refused here with the list as it is).
 */
import { useSyncExternalStore } from 'react';
import type { MediaNow } from '../lib/remoteProtocol';
import { CARTOONS, CARTOON_BY_ID } from '../lib/cartoons';
import type { CameraChoice } from '../lib/cameras';

/** The address the show server serves an admitted film or picture under (server/assistantMusic.js `MEDIA_PATH`). */
export const ASSISTANT_MEDIA_PATH = '/assistant-media/';

export interface MediaDoors {
  film: {
    file(url: string, name: string): Promise<string | null>;
    cartoon(id: string): Promise<string | null>;
    /** A camera by id, or the Film panel's own with none. */
    camera(id?: string): Promise<string | null>;
    window(): Promise<string | null>;
    clear(): void;
  };
  pour: {
    image(url: string): Promise<string | null>;
    video(url: string, name: string): Promise<string | null>;
    cartoon(id: string): void;
    stop(): void;
  };
  /** Settles once the camera has opened or failed (off: at once). */
  room: { set(on: boolean, id?: string): Promise<string | null> | null | void };
  mark: { load(url: string, name: string): Promise<string | null>; clear(): void };
}

const SHELF = CARTOONS.map(c => ({ id: c.id, title: c.title, seconds: c.seconds }));
let now: MediaNow = {
  film: { source: 'none', name: null, cartoon: null, camera: null, cameraLost: false },
  pour: { playing: false, name: null, cartoon: null },
  room: { on: false, camera: null, resume: false },
  mark: false, cameras: [], cartoons: SHELF,
};
let nowKey = JSON.stringify(now);
let cams: CameraChoice[] = [];
const doors: { [K in keyof MediaDoors]: MediaDoors[K] | null } = { film: null, pour: null, room: null, mark: null };
const listeners = new Set<() => void>();

function take(next: MediaNow): void {
  const key = JSON.stringify(next);
  if (key === nowKey) return;
  nowKey = key;
  now = next;
  for (const l of listeners) l();
}

/** One hook's piece of the copy; the same copy is kept when nothing in it moved. */
export function publishMedia(part: Partial<Pick<MediaNow, 'film' | 'pour' | 'room' | 'mark'>>): void { take({ ...now, ...part }); }
/** The cameras, by the pickers' names (useFilm, which holds the one list of them). */
export function publishCameras(list: CameraChoice[]): void {
  cams = list.map(c => ({ id: c.id, label: c.label }));
  take({ ...now, cameras: cams.map(c => c.label) });
}
/** A camera's name by its id, for a hook's piece ('' or unplugged: null). */
export const cameraName = (id: string): string | null => (id ? cams.find(c => c.id === id)?.label ?? null : null);
export function setMediaDoor<K extends keyof MediaDoors>(k: K, d: MediaDoors[K] | null): void { doors[k] = d as never; }
/** The copy as it stands (`npm run assistant` reads it). */
export const readMedia = (): MediaNow => now;
export const useMediaNow = () => useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => now, () => now);

/**
 * Whether a served video opens in this browser: null once its first frame
 * is in, else why not. The extension was the guard's only judge, and a
 * ProRes .mov or a file gone since answered "done" (found in review), since
 * the plate's own loaders swallow a failed play().
 */
export function videoOpens(url: string, ms = 10000): Promise<string | null> {
  return new Promise((done) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    const end = (why: string | null) => { clearTimeout(timer); v.removeAttribute('src'); v.load(); done(why); };
    const timer = setTimeout(() => end('the film did not start within ten seconds'), ms);
    v.onloadeddata = () => end(null);
    v.onerror = () => end(`this browser cannot play that film${v.error?.message ? ` (${v.error.message})` : ''}`);
    v.src = url;
  });
}

const ours = (url: unknown): url is string => typeof url === 'string' && url.startsWith(ASSISTANT_MEDIA_PATH) && /^[0-9a-f]{32}$/.test(url.slice(ASSISTANT_MEDIA_PATH.length));
const nameOf = (n: unknown, or: string) => (typeof n === 'string' && n.trim() ? n.trim() : or).slice(0, 120);
function cameraId(name: unknown): { id: string } | { why: string } {
  const want = typeof name === 'string' ? name.trim().toLowerCase() : '';
  const hit = cams.find(c => c.label === name) ?? cams.find(c => c.label.trim().toLowerCase() === want);
  return want && hit ? { id: hit.id } : { why: `no camera "${String(name)}" (there are: ${cams.map(c => c.label).join(', ') || 'none plugged in'})` };
}

/**
 * One call from the owner's assistant, already let through by the relay's
 * guard (server/assistantMedia.js): null when done, else why not. Settles
 * once a camera or a window has opened or failed, so the answer is never
 * "done" for a camera that did not open.
 */
export async function askMedia(m: { do?: unknown; url?: unknown; name?: unknown; kind?: unknown; cartoon?: unknown; camera?: unknown; on?: unknown }): Promise<string | null> {
  const d = String(m.do);
  const which = d.startsWith('film-') ? 'film' : d.startsWith('pour-') ? 'pour' : d === 'room' ? 'room' : d.startsWith('mark') ? 'mark' : null;
  if (!which) return `not one of the media calls: ${d}`;
  const door = doors[which];
  if (!door) return `the ${which === 'room' ? 'room camera' : which} is not running`;
  const file = d === 'film-file' || d === 'pour-file' || d === 'mark';
  if (file && !ours(m.url)) return 'a file reaches the plate only through the show server';
  const cartoon = d === 'film-cartoon' || d === 'pour-cartoon' ? CARTOON_BY_ID.get(String(m.cartoon)) : undefined;
  if ((d === 'film-cartoon' || d === 'pour-cartoon') && !cartoon) return `no cartoon "${String(m.cartoon)}" on the shelf (there are: ${SHELF.map(c => c.title).join('; ')})`;
  const cam = m.camera === undefined ? null : cameraId(m.camera);
  if (cam && 'why' in cam) return cam.why;
  const film = doors.film, pour = doors.pour, room = doors.room, mark = doors.mark;
  switch (d) {
    case 'film-file': return film!.file(m.url as string, nameOf(m.name, 'Film'));
    case 'film-cartoon': return film!.cartoon(cartoon!.id);
    case 'film-camera': return film!.camera(cam?.id);
    case 'film-window': return film!.window();
    case 'film-clear':
      if (now.film.source === 'none') return 'no film is on the plate';
      film!.clear();
      return null;
    case 'pour-file':
      if (m.kind === 'image') return pour!.image(m.url as string);
      if (m.kind !== 'video') return 'pour: a picture or a film';
      return pour!.video(m.url as string, nameOf(m.name, 'Film'));
    case 'pour-cartoon': pour!.cartoon(cartoon!.id); return null;
    case 'pour-stop':
      if (!now.pour.name && !now.pour.playing) return 'nothing is pouring';
      pour!.stop();
      return null;
    case 'room':
      if (typeof m.on !== 'boolean') return 'room_camera: on, as true or false';
      { const why = await room!.set(m.on, cam?.id); return typeof why === 'string' ? why : null; }
    case 'mark': return mark!.load(m.url as string, nameOf(m.name, 'Mark'));
    case 'mark-clear':
      if (!now.mark) return 'no mark is up';
      mark!.clear();
      return null;
  }
  return `not one of the media calls: ${d}`;
}
