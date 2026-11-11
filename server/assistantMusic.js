/**
 * The music player for the owner's assistant (PLAN 44k-2): the guard's rules
 * for `assistant-music`, and the show server's half of a file played by its
 * path on this Mac.
 *
 * Why beside `assistant.js` and not in it: that file is at the 40 KB line
 * `npm run sizes` warns past, and this is a piece with its own reason to
 * exist, the one place the assistant's words reach the file system.
 *
 * A file by its path. The page cannot open a path, and the browser's own
 * file picker wants a hand on it, so the show server, on the same Mac, does
 * the opening. What it opens is held tight, because the path is the
 * assistant's words and the assistant reads things (track titles, notes, web
 * pages) that are not the owner's: only a sound file (by its extension),
 * only a real file (not a folder, not a device), only inside the music
 * folder (`~/Music`, or `CHROMAGLASS_MUSIC_DIR`, several joined by the
 * platform's path delimiter), judged on the path with every link and `..`
 * resolved (`realpathSync`), so a link inside the folder that points out of
 * it, or a `~/Music/../.ssh/...`, is outside. Admitted, the file is served
 * under a one-off address, `/assistant-music/<32 hex>`, to the laptop alone
 * (`isLaptop`, the rule the show key and the assistant role already use), so
 * a phone on the Wi-Fi cannot read the owner's music, and with Range, since
 * an audio element seeks by asking for bytes. The page gets the address and
 * the file's name, never the path. The last eight addresses are kept, so a
 * track that was playing still seeks after a few more are opened.
 *
 * Films and pictures (PLAN 44k-13) come through the same door: `admitFile`
 * is the rule above for any kind of file and any folders, and an admitted
 * film, picture or logo is served under `/assistant-media/` from its own
 * eight addresses (`MEDIA_PATH`; the rules for what may be filmed, poured or
 * put up as the mark are `assistantMedia.js`'s). One door and not two, so
 * the links, the `..`, the probe and the swap are judged by one piece of
 * code that `npm run assistant`'s music mutants already hold.
 */
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, delimiter, extname, isAbsolute, resolve, sep } from 'node:path';

export const MUSIC_PATH = '/assistant-music/';
/** Where a film, a picture or a logo the assistant named is served (assistantMedia.js). */
export const MEDIA_PATH = '/assistant-media/';
/** What the player opens, and the type it is served as. */
export const MUSIC_TYPES = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'], ['.wav', 'audio/wav'],
  ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'], ['.flac', 'audio/flac'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'],
]);
const MUSIC_DO = ['track', 'file', 'play', 'pause', 'seek', 'loop', 'close'];
const KEEP = 8;

/** The music folders: `CHROMAGLASS_MUSIC_DIR` (several joined by the path delimiter), else ~/Music. */
export const musicFolders = (env = process.env) => (env.CHROMAGLASS_MUSIC_DIR ? env.CHROMAGLASS_MUSIC_DIR.split(delimiter).filter(Boolean) : [`${homedir()}${sep}Music`]);

/** Per address: token -> { path, type, folders }, the last KEEP of each kind. */
const served = new Map([[MUSIC_PATH, new Map()], [MEDIA_PATH, new Map()]]);

/*
  The folders' real paths, and whether a path is inside one. realpathSync's
  native form, because the JS one keeps the casing it is given and macOS's
  disk does not care, so ~/music/x.mp3 against /Users/…/Music was refused.
*/
const real = (p) => { try { return realpathSync.native(p); } catch { return null; } };
const inside = (p, roots) => roots.some((r) => p.startsWith(r.endsWith(sep) ? r : r + sep));

/** A path the assistant named: its address and name, or why not. */
export function admitMusicFile(raw, folders = musicFolders()) {
  return admitFile(raw, { folders, types: MUSIC_TYPES, at: MUSIC_PATH, what: 'a sound file the player opens', only: 'the assistant plays files from the music folder only' });
}

/**
 * Any file the assistant names by its path: inside `folders`, of one of
 * `types` (extension -> served type), a real file. `at` is the address it is
 * served under, `what` names the kind in a refusal, `only` says which folders.
 * Returns its address, its name (no extension) and its type, or why not.
 */
export function admitFile(raw, { folders, types, at, what, only }) {
  if (typeof raw !== 'string' || !raw.trim()) return { reason: 'a file by its full path on this Mac' };
  const asked = raw.trim().replace(/^~(?=$|\/)/, homedir());
  if (!isAbsolute(asked)) return { reason: `a full path (beginning / or ~/), not ${raw}` };
  const roots = folders.map(real).filter(Boolean);
  const outside = { reason: `${only} (${folders.join(', ')}), and ${raw} is outside it` };
  // A path that is not there is "outside" unless it would be inside on its
  // face: otherwise "no file at" against "outside it" tells an assistant
  // steered by somebody's words whether any file on this Mac exists.
  const found = real(asked);
  if (!found) return inside(resolve(asked), folders.map((f) => resolve(f))) || inside(resolve(asked), roots) ? { reason: `no file at ${raw}` } : outside;
  if (!inside(found, roots)) return outside;
  const type = types.get(extname(found).toLowerCase());
  if (!type) return { reason: `not ${what} (${[...types.keys()].join(' ')}): ${basename(found)}` };
  let file = false;
  try { file = statSync(found).isFile(); } catch { /* gone since */ }
  if (!file) return { reason: `${raw} is not a file` };
  const token = randomBytes(16).toString('hex');
  const shelf = served.get(at);
  shelf.set(token, { path: found, type, folders });
  while (shelf.size > KEEP) shelf.delete(shelf.keys().next().value);
  return { url: `${at}${token}`, name: basename(found, extname(found)), type };
}

/** The show server's route: true when the request was this one's (answered, refused or not found). */
export function serveMusicFile(req, res, url, laptop) {
  // Both kinds of address: a film seeks by Range as a song does.
  const at = [MUSIC_PATH, MEDIA_PATH].find((p) => url.pathname.startsWith(p));
  if (!at) return false;
  if (!laptop) { res.writeHead(403); res.end(); return true; }
  const f = served.get(at).get(url.pathname.slice(at.length));
  // Judged again as it is served: a file swapped for a link out of the
  // folder since it was admitted is not followed.
  const now = f ? real(f.path) : null;
  let size = -1;
  try { if (now && inside(now, f.folders.map(real).filter(Boolean))) size = statSync(now).size; } catch { /* gone since */ }
  if (size < 0) { res.writeHead(404); res.end(); return true; }
  let start = 0, end = size - 1, code = 200;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
  if (m && (m[1] || m[2])) {
    if (m[1]) { start = Number(m[1]); if (m[2]) end = Math.min(Number(m[2]), size - 1); } else start = Math.max(0, size - Number(m[2]));
    if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return true; }
    code = 206;
  }
  res.writeHead(code, {
    'Content-Type': f.type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
    ...(code === 206 ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  if (req.method === 'HEAD' || size === 0) { res.end(); return true; }
  // pipeline, not pipe: an audio element drops its Range request on every
  // seek, and a piped read stream is then never closed (measured in review:
  // thirty dropped requests, thirty file descriptors held for good).
  pipeline(createReadStream(now, { start, end }), res, () => {});
  return true;
}

/** A shelf track by its title, as the page's `shelfTrack`: exact (any case), else the one title holding the words. */
const pickTrack = (library, name) => {
  const want = name.trim().toLowerCase();
  const exact = library.find((t) => t.toLowerCase() === want);
  if (exact) return exact;
  const some = library.filter((t) => t.toLowerCase().includes(want));
  return some.length === 1 ? some[0] : null;
};

/**
 * The guard's rules for `assistant-music`, after its mode and pace: what to
 * send the display, or why not. `player` is the display's last report
 * (`show.player` in assistant.js), null from a display one build older,
 * which then judges the track, the length and whether anything is loaded.
 */
export function musicCall(message, player) {
  const d = message.do;
  if (!MUSIC_DO.includes(d)) return { reason: `music: ${MUSIC_DO.join(', ')}, not ${String(d)}` };
  if (d === 'track') {
    if (typeof message.track !== 'string' || !message.track.trim()) return { reason: 'a track by its title, as show_state\'s player.library lists them' };
    if (!player?.library) return { out: { do: 'track', track: message.track.trim() } };
    const hit = pickTrack(player.library, message.track);
    if (!hit) return { reason: `no track "${message.track}" on the shelf (there are: ${player.library.join('; ') || 'none'})` };
    return { out: { do: 'track', track: hit } };
  }
  if (d === 'file') {
    const f = admitMusicFile(message.path);
    return f.reason ? f : { out: { do: 'file', url: f.url, name: f.name } };
  }
  if (d === 'loop') return typeof message.on === 'boolean' ? { out: { do: 'loop', on: message.on } } : { reason: 'loop: on, as true or false' };
  if (player && !player.loaded) return { reason: 'nothing is loaded in the player: play_track first' };
  if (d === 'seek') {
    const s = message.seconds;
    if (!(typeof s === 'number' && Number.isFinite(s) && s >= 0)) return { reason: 'seek: seconds from the start, 0 or more' };
    if (player?.length > 0 && s > player.length) return { reason: `seek: the track is ${Math.round(player.length)} s long, not ${s}` };
    return { out: { do: 'seek', seconds: s } };
  }
  return { out: { do: d } };
}

/** The display's report, as the guard keeps it. */
export const playerOf = (p) => (p && typeof p === 'object'
  ? { loaded: typeof p.name === 'string', length: Number(p.length) || 0, library: Array.isArray(p.library) ? p.library.map((t) => String(t?.title ?? '')) : null }
  : null);
