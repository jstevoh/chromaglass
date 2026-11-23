/**
 * Film, pours, the room camera and the mark for the owner's assistant (PLAN
 * 44k-13): the guard's rules for `assistant-media`.
 *
 * Why beside `assistant.js` and not in it: that file is past the 40 KB line
 * `npm run sizes` warns at, so each new piece of the guard goes in a module
 * of its own (as assistantRecord.js and assistantSound.js did).
 *
 * What was missing: everything that puts a picture on the plate from outside
 * it. The film that drives the plate (a file, a camera, a window), a picture or a film poured into the dish, the room
 * camera that stirs it, and the mark (the logo card) all live in `App()`'s
 * hooks, not in the settings, so `set` could not reach them and the owner
 * had to walk to the desk to change a film mid-show.
 *
 * A file by its path, the same door as the music player's: the path is the
 * assistant's words, so the show server opens it, held to a media folder
 * (`~/Movies` and `~/Pictures`, or `CHROMAGLASS_MEDIA_DIR`), with every link
 * and `..` resolved, and serves it to the laptop alone under a one-off
 * address (assistantMusic.js `admitFile`, `MEDIA_PATH`). Each call says what
 * kind it takes: a film takes a video, the mark a picture, a pour either (a
 * picture is laid as dye once, a video pours frame by frame), so a film
 * named for the mark is refused here, with the kinds, rather than failing to
 * decode on the wall. No SVG: a picture served on the page's own origin
 * that can carry a script is not one to hand an assistant.
 *
 * A camera by name, as the Sound panel's inputs are (assistantSound.js): the
 * display lists its cameras by the pickers' own names (`media.cameras`), and
 * a camera not listed is refused with the list. Null from a display one
 * build older: the page's own check is then the only one.
 *
 * The video loaded (PLAN 14ag) is `film-loaded` and `pour-loaded`: the one a
 * file call or the person's own Video file or Pour a video… last brought in,
 * played or poured again with no path, so the assistant can pour the film
 * the person put on by hand. The display says when there is none. The
 * cartoon shelf these replaced is gone, with the demo loops.
 */
import { homedir } from 'node:os';
import { delimiter, sep } from 'node:path';
import { admitFile, MEDIA_PATH } from './assistantMusic.js';

export { MEDIA_PATH };
export const VIDEO_TYPES = new Map([['.mp4', 'video/mp4'], ['.m4v', 'video/mp4'], ['.mov', 'video/quicktime'], ['.webm', 'video/webm']]);
export const IMAGE_TYPES = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.gif', 'image/gif'], ['.webp', 'image/webp']]);
const BOTH_TYPES = new Map([...IMAGE_TYPES, ...VIDEO_TYPES]);
const MEDIA_DO = ['film-file', 'film-loaded', 'film-camera', 'film-window', 'film-clear', 'pour-file', 'pour-loaded', 'pour-stop', 'room', 'mark', 'mark-clear'];

/** The media folders: `CHROMAGLASS_MEDIA_DIR` (several joined by the path delimiter), else ~/Movies and ~/Pictures. */
export const mediaFolders = (env = process.env) => (env.CHROMAGLASS_MEDIA_DIR
  ? env.CHROMAGLASS_MEDIA_DIR.split(delimiter).filter(Boolean)
  : [`${homedir()}${sep}Movies`, `${homedir()}${sep}Pictures`]);

/*
  Never the Photos library: ~/Pictures holds "Photos Library.photoslibrary",
  every personal photo the owner has, and an assistant steered by somebody's
  words could put one up as the mark, which goes to every cast and relay
  receiver too (found in review). A path through any .photoslibrary is
  refused before it is looked at, and judged again where the file really is
  (the security review of 2026-11-13: the test read only the typed path, so a
  link or alias in ~/Pictures pointing into the library passed, and Photo
  Booth's library, also in ~/Pictures and every bit as personal, was never
  named).
*/
const PRIVATE_LIBRARY = /(\.photoslibrary|Photo Booth Library)(\/|$)/i;
const NO_LIBRARY = 'the assistant never opens the Photos or Photo Booth library: export the picture to ~/Pictures or ~/Movies first';
const admit = (raw, types, what) => (typeof raw === 'string' && PRIVATE_LIBRARY.test(raw)
  ? { reason: NO_LIBRARY }
  : admitFile(raw, { folders: mediaFolders(), types, at: MEDIA_PATH, what, only: 'the assistant opens films and pictures from the media folders only', refuse: { test: PRIVATE_LIBRARY, reason: NO_LIBRARY } }));

/** The guard's copy of the display's `media`: the cameras' names. */
export function mediaOf(m) {
  if (!m || typeof m !== 'object') return null;
  return { cameras: Array.isArray(m.cameras) ? m.cameras.map(String) : null };
}

/** A camera by name, as the display lists it, or why not. */
function camera(name, cameras) {
  const want = typeof name === 'string' ? name.trim().toLowerCase() : '';
  if (!want) return { reason: 'camera: a name from show_state\'s media.cameras' };
  if (!cameras) return { camera: name.trim() };
  const hit = cameras.find((n) => n === name) ?? cameras.find((n) => n.trim().toLowerCase() === want);
  if (hit === undefined) return { reason: `no camera "${name}" (there are: ${cameras.join(', ') || 'none plugged in'})` };
  return { camera: hit };
}

/** The guard's answer for one `assistant-media`: what to send the display, or why not. */
export function mediaCall(message, media) {
  const d = message.do;
  if (!MEDIA_DO.includes(d)) return { reason: `media: ${MEDIA_DO.join(', ')}, not ${String(d)}` };
  if (d === 'film-window' || d === 'film-clear' || d === 'pour-stop' || d === 'mark-clear' || d === 'film-loaded' || d === 'pour-loaded') return { out: { do: d } };
  if (d === 'film-file' || d === 'pour-file' || d === 'mark') {
    const f = d === 'film-file' ? admit(message.path, VIDEO_TYPES, 'a film (a video file)')
      : d === 'mark' ? admit(message.path, IMAGE_TYPES, 'a picture for the mark')
        : admit(message.path, BOTH_TYPES, 'a picture or a film to pour');
    if (f.reason) return f;
    return { out: { do: d, url: f.url, name: f.name, ...(d === 'pour-file' ? { kind: f.type.startsWith('image/') ? 'image' : 'video' } : {}) } };
  }
  if (d === 'film-camera') {
    if (message.camera === undefined) return { out: { do: d } };
    const c = camera(message.camera, media?.cameras ?? null);
    return c.reason ? c : { out: { do: d, camera: c.camera } };
  }
  // The room camera.
  if (typeof message.on !== 'boolean') return { reason: 'room_camera: on, as true or false' };
  if (message.camera === undefined) return { out: { do: d, on: message.on } };
  const c = camera(message.camera, media?.cameras ?? null);
  return c.reason ? c : { out: { do: d, on: message.on, camera: c.camera } };
}
