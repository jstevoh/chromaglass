/**
 * Where the watch tool keeps things, read from a small config file (PLAN 47p-1).
 *
 * The watch tool (`watch.mjs` and its modules) is being packaged for anyone
 * who wants to read how a video looks and moves (PLAN 47p, the owner's pick,
 * 2026-11-28). Until this file it named this project's own places in its code:
 * the shared folder every cloud thread sees (for the reference library), a
 * folder on the owner's Mac (for references and for fetching YouTube links),
 * Homebrew's bin folder, and the app's own settings map (`watchsettings.mjs`,
 * which turns a gap against a reference into ChromaGlass dials). A copy run
 * anywhere else would have looked in folders that are not there, printed a
 * fetch line for a machine it does not have, and suggested dials of an app it
 * is not watching. So the places are data now, and the code holds only
 * general defaults:
 *
 *   {
 *     "references":  ["$SOME_ENV", "/a/shared/folder", "~/films/references"],
 *     "fetch": { "dir": "~/films/watch", "bin": "/usr/local/bin",
 *                "where": "...", "then": "..." },
 *     "settingsMap": "watchsettings.mjs",
 *     "scratch":     "my-watch"
 *   }
 *
 * - `references`: the reference library's folders, in order; the first that
 *   exists is where `--keep` writes. `~` is the home folder, and an entry
 *   `$NAME` is that environment variable's value (skipped when unset).
 *   `$REELREADER_REFERENCES` always comes first, config or not. No config: only
 *   `~/reelreader-references`.
 * - `fetch`: how the "YouTube refused this machine" message tells you to fetch
 *   a link elsewhere (a computer on a home connection): the folder it fetches
 *   into, the folder yt-dlp and ffmpeg live in when that shell's PATH lacks
 *   them, which machine, and what to do with the file after. No config: plain
 *   `yt-dlp` and `ffmpeg` from the PATH, into `~/reelreader/<name>`.
 * - `settingsMap`: a module (path relative to the config file) exporting
 *   `gapSettings(gaps, settings)`, which turns `--vs` gaps into "Settings to
 *   try" lines for the app being watched. No config, no map: the section is
 *   left out, because a gap in edge width means nothing as a dial without an
 *   app to turn it in.
 * - `scratch`: the folder name under the system's temp folder that a watch
 *   writes to when `--out` is not given. No config: `reelreader`.
 * - `mode`: `auto` (the footage decides, scripts/watchmode.mjs), `liquid` or
 *   `general`: which read a film gets when no `--liquid` or `--general` is
 *   given (PLAN 47p-3). No config: `auto`.
 *
 * Which file. `--config <file>` (watch.mjs), else `$REELREADER_CONFIG`, else
 * `reelreader.config.json` in the folder the command runs in, else
 * `reelreader.config.json` beside these scripts. This repository's is
 * `scripts/reelreader.config.json`, beside them, so `npm run watch` here finds the
 * project's places as before and a packaged copy, shipped without that file,
 * finds none of them. `npm run watchconfig` holds that no watch module names
 * one of the project's places outside that file.
 *
 * Why JSON and not a module. A config that can run code is a second place to
 * hide a path; a JSON file can only say where things are. The settings map is
 * code, so the config names it and does not hold it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_NAME = 'reelreader.config.json';

/** What a copy with no config file uses: general places, no settings map. */
export const GENERAL = Object.freeze({
  references: ['~/reelreader-references'],
  fetch: { dir: '~/reelreader', bin: null, where: 'a computer on a home connection', then: null },
  settingsMap: null,
  scratch: 'reelreader',
  mode: 'auto',
});

/** `~` to the home folder, `$NAME` to that variable (null when unset). */
export function expandPath(p, env = process.env) {
  if (typeof p !== 'string' || !p) return null;
  const m = /^\$([A-Z_][A-Z0-9_]*)$/i.exec(p);
  if (m) return env[m[1]] || null;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** The config file this run reads, or null when there is none. */
export function findConfig({ file = null, env = process.env, cwd = process.cwd(), here = HERE } = {}) {
  if (file ?? chosen) return path.resolve(file ?? chosen);
  if (env.REELREADER_CONFIG) return path.resolve(env.REELREADER_CONFIG);
  for (const dir of [cwd, here]) {
    const f = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

let cached = null;
let chosen = null; // set by useConfig: watch.mjs's --config, for the rest of the run

/**
 * The config, merged over `GENERAL`, with `file` set to where it came from
 * (null for none). A named file that is missing or not JSON is an error, not
 * a quiet fall back to the general places: a typo in `--config` would
 * otherwise watch with the wrong library and say nothing.
 */
export function loadConfig({ file = null, env = process.env, cwd = process.cwd(), here = HERE, fresh = false } = {}) {
  const f = findConfig({ file, env, cwd, here });
  if (!fresh && cached && cached.file === f) return cached;
  let raw = {};
  if (f) {
    try { raw = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { throw new Error(`watch config ${f}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`); }
  }
  const cfg = {
    file: f,
    references: Array.isArray(raw.references) ? raw.references : GENERAL.references,
    fetch: { ...GENERAL.fetch, ...(raw.fetch && typeof raw.fetch === 'object' ? raw.fetch : {}) },
    settingsMap: typeof raw.settingsMap === 'string' && raw.settingsMap ? path.resolve(path.dirname(f), raw.settingsMap) : null,
    scratch: typeof raw.scratch === 'string' && raw.scratch ? raw.scratch : GENERAL.scratch,
    mode: raw.mode == null ? GENERAL.mode : raw.mode,
  };
  if (!['auto', 'liquid', 'general'].includes(cfg.mode)) throw new Error(`watch config ${f}: mode is "${cfg.mode}", not auto, liquid or general`);
  if (!fresh) cached = cfg;
  return cfg;
}

/** Point every later `loadConfig()` at `file` (watch.mjs's `--config`). */
export function useConfig(file) { chosen = file || null; cached = null; return loadConfig(); }

/** The reference folders to try, in order, before checking which exist. */
export function referenceTries(env = process.env, cfg = loadConfig({ env })) {
  return [...new Set(['$REELREADER_REFERENCES', ...cfg.references].map(p => expandPath(p, env)).filter(Boolean))];
}

/**
 * The settings map's `gapSettings`, or null when none is configured. A map
 * that is configured but will not load is an error: the owner asked for the
 * section, and leaving it out silently would read as "no gap".
 */
export async function settingsMapFor(cfg = loadConfig()) {
  if (!cfg.settingsMap) return null;
  let mod;
  try { mod = await import(pathToFileURL(cfg.settingsMap).href); } catch (e) { throw new Error(`watch config ${cfg.file}: settingsMap ${cfg.settingsMap} did not load (${e.message})`); }
  if (typeof mod.gapSettings !== 'function') throw new Error(`watch config ${cfg.file}: settingsMap ${cfg.settingsMap} exports no gapSettings`);
  return mod.gapSettings;
}

/**
 * The one line that fetches a URL on another machine the way `download` does
 * here, for when YouTube refuses this one. Which machine, which folder it
 * fetches into and where its yt-dlp and ffmpeg are come from the watch config
 * (`fetch` in reelreader.config.json, scripts/watchconfig.mjs, PLAN 47p-1). This
 * project's names the owner's Mac, Homebrew's bin folder (a Desktop Commander
 * shell does not have Homebrew on its PATH, so the tools go by full path) and
 * a folder its threads may stage files from. With no config, plain `yt-dlp`
 * from the PATH into ~/reelreader/<name>, and ffmpeg handed over by the full path
 * `command -v` finds: given a bare `ffmpeg`, yt-dlp skipped the merge and left
 * the picture and the sound apart (PLAN.md 47w). Node on PATH is for YouTube's
 * JavaScript.
 */
export function macFetch(url, cfg = loadConfig()) {
  const name = url.replace(/^https?:\/\/(www\.)?/, '').replace(/[^\w.-]+/g, '_').slice(0, 48);
  const q = s => `'${s.replace(/'/g, `'\\''`)}'`;
  const { dir, bin } = cfg.fetch;
  // `~/x` stays for the other machine's shell to expand; only a leading `~` is left bare.
  const where = String(dir || '~/reelreader').replace(/\/+$/, '');
  const d = where.startsWith('~/') ? `~/${where.slice(2)}/${name}` : `${where}/${name}`;
  const ytdlp = bin ? `${bin}/yt-dlp` : 'yt-dlp';
  const ffmpeg = bin ? `${bin}/ffmpeg` : '"$(command -v ffmpeg)"';
  return [
    `${bin ? `export PATH=${bin}:$PATH; ` : ''}d=${d}; mkdir -p "$d" && cd "$d" &&`,
    `${ytdlp} --no-playlist --write-info-json --no-progress -f 'bv*+ba/b' -S res:1080 --merge-output-format mkv`,
    `--ffmpeg-location ${ffmpeg} --js-runtimes node -o 'source.%(ext)s' ${q(url)} && ls -la "$d"`,
  ].join(' ');
}

/** The refused-link message's first way round: fetch it elsewhere, as the config says. */
export function fetchElsewhere(url, cfg = loadConfig()) {
  const { where, then } = cfg.fetch;
  const head = `fetch it on ${where || 'a computer on a home connection'}, then bring the file here and watch that. ${then || 'Run this there:'}`;
  return [
    ...wrap(head, 72).map((l, i) => `${i ? '     ' : '  1. '}${l}`),
    '',
    `     ${macFetch(url, cfg)}`,
    '',
    ...(then ? [] : ['     then copy source.mkv (and source.info.json) here and run the watch on it;']),
  ];
}

const wrap = (text, width) => String(text).split(/\s+/).reduce((lines, w) => {
  const last = lines[lines.length - 1];
  if (last && (last + ' ' + w).length <= width) lines[lines.length - 1] = `${last} ${w}`; else lines.push(w);
  return lines;
}, []);
