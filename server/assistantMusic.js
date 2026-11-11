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
 */
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, delimiter, extname, isAbsolute, sep } from 'node:path';

export const MUSIC_PATH = '/assistant-music/';
/** What the player opens, and the type it is served as. */
export const MUSIC_TYPES = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.aac', 'audio/aac'], ['.wav', 'audio/wav'],
  ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'], ['.flac', 'audio/flac'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/ogg'],
]);
const MUSIC_DO = ['track', 'file', 'play', 'pause', 'seek', 'loop', 'close'];
const KEEP = 8;

/** The music folders: `CHROMAGLASS_MUSIC_DIR` (several joined by the path delimiter), else ~/Music. */
export const musicFolders = (env = process.env) => (env.CHROMAGLASS_MUSIC_DIR ? env.CHROMAGLASS_MUSIC_DIR.split(delimiter).filter(Boolean) : [`${homedir()}${sep}Music`]);

const served = new Map();   // token -> { path, type }

/** A path the assistant named: its address and name, or why not. */
export function admitMusicFile(raw, folders = musicFolders()) {
  if (typeof raw !== 'string' || !raw.trim()) return { reason: 'a file by its full path on this Mac' };
  const asked = raw.trim().replace(/^~(?=$|\/)/, homedir());
  if (!isAbsolute(asked)) return { reason: `a full path (beginning / or ~/), not ${raw}` };
  let real;
  try { real = realpathSync(asked); } catch { return { reason: `no file at ${raw}` }; }
  const roots = folders.map((f) => { try { return realpathSync(f); } catch { return null; } }).filter(Boolean);
  if (!roots.some((r) => real.startsWith(r.endsWith(sep) ? r : r + sep))) return { reason: `the assistant plays files from the music folder only (${folders.join(', ')}), and ${raw} is outside it` };
  const type = MUSIC_TYPES.get(extname(real).toLowerCase());
  if (!type) return { reason: `not a sound file the player opens (${[...MUSIC_TYPES.keys()].join(' ')}): ${basename(real)}` };
  let file = false;
  try { file = statSync(real).isFile(); } catch { /* gone since */ }
  if (!file) return { reason: `${raw} is not a file` };
  const token = randomBytes(16).toString('hex');
  served.set(token, { path: real, type });
  while (served.size > KEEP) served.delete(served.keys().next().value);
  return { url: `${MUSIC_PATH}${token}`, name: basename(real, extname(real)) };
}

/** The show server's route: true when the request was this one's (answered, refused or not found). */
export function serveMusicFile(req, res, url, laptop) {
  if (!url.pathname.startsWith(MUSIC_PATH)) return false;
  if (!laptop) { res.writeHead(403); res.end(); return true; }
  const f = served.get(url.pathname.slice(MUSIC_PATH.length));
  let size = -1;
  try { if (f) size = statSync(f.path).size; } catch { /* gone since */ }
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
  createReadStream(f.path, { start, end }).on('error', () => res.destroy()).pipe(res);
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
