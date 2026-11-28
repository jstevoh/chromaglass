/**
 * Where the YouTube server keeps its files, what it reads from the
 * environment, and the few choices a person sets once (PLAN 44i-2a).
 *
 * Why. Written for one channel, the server kept its keys in
 * `~/.chromaglass/youtube`, read `CHROMAGLASS_YOUTUBE_*` variables, filed
 * every upload under Music (category 10) and told every time in Pacific. All
 * four were right for the owner and wrong for anyone else, so each has one
 * home here:
 *
 *  - The folder is the person's own config folder (`~/.config/sendreel/youtube`
 *    on macOS and Linux, `%APPDATA%\sendreel\youtube` on Windows), or the variable's.
 *    The owner's machines already hold keys, a queue and a manifest in the
 *    old folder, so while it exists and no variable says otherwise it is the
 *    one used: nobody signs in again, and no queued job is stranded.
 *  - Variables are `<PREFIX>_<KEY>`, and the old `CHROMAGLASS_YOUTUBE_<KEY>`
 *    is still read, so the owner's assistant configs and the check keep
 *    working unchanged.
 *  - `settings.json` in that folder holds the choices: `timeZone` (the clock
 *    release times are read in; the computer's own by default) and
 *    `categoryId` (the category a new upload gets when the call names none;
 *    YouTube's own default, 22 People & Blogs, unless set). A key this file
 *    does not know is refused by name, so a typo is an error at start, not a
 *    setting silently ignored for months.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { systemZone, validZone } from './zone.js';

/* The public name, the owner's choice 2026-11-28 (44i-2). */
export const NAME = 'sendreel';
export const PREFIX = 'SENDREEL';
const LEGACY = 'CHROMAGLASS_YOUTUBE';

export function env(key) {
  return process.env[`${PREFIX}_${key}`] ?? process.env[`${LEGACY}_${key}`];
}

/** The owner's folder from before 44i-2a. */
export const legacyDir = (home = homedir()) => join(home, '.chromaglass', 'youtube');

export function configDir(home = homedir(), platform = process.platform) {
  const named = env('DIR');
  if (named) return named;
  const legacy = legacyDir(home);
  if (existsSync(legacy)) return legacy;
  /* One folder per site under the name's own, so Vimeo and TikTok (44i-2g, 44i-2h) sit beside it. */
  if (platform === 'win32') return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), NAME, 'youtube');
  return join(process.env.XDG_CONFIG_HOME || join(home, '.config'), NAME, 'youtube');
}

const KNOWN = ['timeZone', 'categoryId'];
export const DEFAULT_CATEGORY = '22';
/* The owner's uploads have always gone up as Music. In the owner's old folder, with no
   settings.json yet, that stays the default, so lifting the server out changes nothing
   on the owner's machines until a settings file says otherwise. */
const LEGACY_CATEGORY = '10';

/** The settings, with defaults filled in. Throws an Error that says which line to fix. */
export function readSettings(dir, home = homedir()) {
  const file = join(dir, 'settings.json');
  let s = {};
  if (existsSync(file)) {
    try { s = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON (${e.message}).`); }
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`${file} must be a JSON object like {"timeZone": "Europe/London"}.`);
    const unknown = Object.keys(s).filter((k) => !KNOWN.includes(k));
    if (unknown.length) throw new Error(`${file} has keys this version does not know: ${unknown.join(', ')}. Known: ${KNOWN.join(', ')}.`);
  }
  const timeZone = s.timeZone ?? systemZone();
  if (typeof timeZone !== 'string' || !validZone(timeZone)) throw new Error(`${file}: timeZone "${timeZone}" is not a time zone name like "America/New_York".`);
  const categoryId = s.categoryId === undefined ? (dir === legacyDir(home) ? LEGACY_CATEGORY : DEFAULT_CATEGORY) : String(s.categoryId);
  if (!/^\d{1,3}$/.test(categoryId)) throw new Error(`${file}: categoryId must be a YouTube category number like "10" (Music) or "22" (People & Blogs).`);
  return { file, timeZone, categoryId };
}
