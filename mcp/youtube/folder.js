/**
 * A whole folder of films queued at once (PLAN 44i-2c): which files in it are
 * films, in what order, and a title for a film that has no card.
 *
 * Why a folder and not a loop of queue_upload calls. A release is a folder:
 * the owner renders six looks, or a song's three cuts, into one place, and a
 * person sharing this tool does the same. Asked one file at a time, the
 * assistant spends a call (and the owner's attention) per film, and a typo in
 * the fourth card is found after three are already queued, so the release is
 * half in. So a folder is judged whole before anything is queued: every film,
 * its card, its title, its Short, and if any one is refused nothing is
 * queued (unless the caller asks for the good ones alone), and a dry run
 * shows the whole list first. A film already queued or up with the same
 * title is listed as such and left alone, so asking again after adding two
 * films to the folder queues exactly those two.
 *
 * What is a film here: a file directly in the folder (not in folders below
 * it: a reelreader run or a render keeps its working files a level down, and
 * walking into them would queue contact sheets' sources) with one of the
 * video kinds, not hidden, passing the server's own `uploadable` rule (the
 * same one a single upload passes, given here so there is one rule). In name
 * order, numbers counted as numbers, so `look-2` comes before `look-10`, as a
 * person reading the folder expects.
 */
import { readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';

/* YouTube's daily upload allowance; a folder past it is far more likely the wrong folder than a release. */
export const FOLDER_MAX = 100;

/** The films directly in a folder, by name, each through `uploadable(path)`. Throws on a missing, hidden or overfull folder. */
export function filmsIn(raw, { home, kinds, uploadable }) {
  const asked = String(raw ?? '').trim().replace(/^~(?=$|\/)/, home);
  if (!asked) throw new Error('folder: a full path to a folder of films on this computer.');
  let real;
  try { real = realpathSync(resolve(asked)); } catch { throw new Error(`No folder at ${resolve(asked)}.`); }
  if (!statSync(real).isDirectory()) throw new Error(`${real} is not a folder; queue_upload takes one film.`);
  const lower = real.toLowerCase(), h = home.toLowerCase();
  const under = lower === h || lower.startsWith(h.endsWith(sep) ? h : h + sep) ? real.slice(home.length) : real;
  if (/[\/\\]\.[^\/\\]/.test(under)) throw new Error(`${real} is a hidden folder; this server never sends from one.`);
  const names = readdirSync(real)
    .filter((n) => !n.startsWith('.') && kinds[extname(n).toLowerCase()])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const films = [];
  for (const n of names) {
    const p = join(real, n);
    try { if (!statSync(p).isFile()) continue; } catch { continue; }
    films.push(p);
  }
  if (films.length > FOLDER_MAX) throw new Error(`${real} holds ${films.length} films; YouTube takes ${FOLDER_MAX} uploads a day, so this is likely the wrong folder. Move a release into a folder of its own.`);
  // Each judged by the server's own rule; a refusal is the file's, reported with it, not the folder's.
  return { folder: real, films: films.map((p) => { try { return { path: uploadable(p).path }; } catch (e) { return { path: p, refused: e.message }; } }) };
}

/** "hymn-to-the-dawn_take2.mp4" -> "Hymn to the dawn take2". */
export function titleFromName(file) {
  const stem = basename(file, extname(file)).replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
  return stem ? stem[0].toUpperCase() + stem.slice(1) : '';
}
