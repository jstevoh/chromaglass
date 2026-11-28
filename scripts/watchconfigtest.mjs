#!/usr/bin/env node
/**
 * The watch tool knows this project's places only through its config (PLAN 47p-1).
 *
 *   npm run watchconfig
 *
 * The owner chose (2026-11-28) to package the watch tool for anyone. Its
 * modules used to name the project's shared folder, a folder on the owner's
 * Mac, Homebrew's bin folder and the app's settings map in their code, so a
 * copy run anywhere else looked in folders that are not there and suggested
 * dials of an app it was not watching. `watchconfig.mjs` moved those into
 * `scripts/reelreader.config.json`. This holds that move, with no ffmpeg (the
 * end-to-end "no settings map, no Settings to try" line is (h2) in
 * `npm run watchcard`, which has one):
 *
 *   (a) no watch module names one of the places, or imports the settings map,
 *       outside the config; the scan is shown to catch the old lines, and to
 *       have read the modules (not an empty glob);
 *   (b) the places are in the config (moved, not lost);
 *   (c) with an empty config: the general library folder, a fetch line with
 *       no project folder and ffmpeg by full path, no settings map, the
 *       general scratch name;
 *   (d) with this repository's config: the project's library (an
 *       environment variable entry included), Homebrew's tools by full path,
 *       and a settings map whose lines say "Settings to try";
 *   (e) a config named but missing, or a settings map that will not load, is
 *       an error, not a quiet fall back to the general places;
 *   (f) `--keep` with no library yet writes where an environment variable
 *       says, and otherwise not into a folder whose parent is not there.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, referenceTries, settingsMapFor } from './watchconfig.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

// The project's places, as they stood in the code before 47p-1, matched as
// words in any case so a path built in pieces (path.join('/opt/homebrew',
// 'bin')) or respelled still shows. Comments may say "Homebrew"; code may not.
const PLACES = [/project-files/i, /chromaglass-films/i, /homebrew/i];
// The settings map is ChromaGlass's own; only its own test may import it,
// however the import is spelled (static, dynamic, quoted either way, a URL).
const MAP_IMPORT = /watchsettings(\.m?js)?['"`]/;
const isComment = line => /^\s*(\*|\/\/|\/\*)/.test(line);
const MAP_TESTS = new Set(['watchcardtest.mjs']);

function scan(name, src) {
  const hits = [];
  src.split('\n').forEach((line, i) => {
    if (isComment(line)) return;
    for (const re of PLACES) if (re.test(line)) hits.push(`${name}:${i + 1} ${re.source}`);
    if (!MAP_TESTS.has(name) && name !== 'watchsettings.mjs' && MAP_IMPORT.test(line)) hits.push(`${name}:${i + 1} imports the settings map`);
  });
  return hits;
}

// (a)
const mods = fs.readdirSync(HERE).filter(f => /^watch.*\.mjs$/.test(f) && f !== 'watchconfigtest.mjs');
const hits = mods.flatMap(f => scan(f, fs.readFileSync(path.join(HERE, f), 'utf8')));
check('(a) no watch module names a project place or imports the settings map', hits.length === 0, hits.slice(0, 6).join('; '));
check('(a) the scan read the tool: watch.mjs, watchrefs.mjs, watchconfig.mjs among 10+ modules',
  mods.length >= 10 && ['watch.mjs', 'watchrefs.mjs', 'watchconfig.mjs', 'watchpair.mjs'].every(f => mods.includes(f)), `${mods.length} modules`);
const old = [
  "  const tries = [env.CHROMAGLASS_REFERENCES, '/mnt/project-files/references', path.join(os.homedir(), 'chromaglass-films', 'references')];",
  '    `export PATH=/opt/homebrew/bin:$PATH; d=~/chromaglass-films/watch/${name}; mkdir -p "$d" && cd "$d" &&`,',
  "import { gapSettings } from './watchsettings.mjs';",
  'const { gapSettings } = await import("./watchsettings.mjs");',
  "const map = new URL(`./watchsettings.mjs`, import.meta.url);",
  "const bin = path.join('/opt/Homebrew', 'bin');",
];
check('(a) the scan catches each old line and each respelling', old.every(l => scan('watch.mjs', l).length > 0), old.map(l => scan('watch.mjs', l).length).join(','));
check('(a) the scan passes a comment that names Homebrew', scan('watch.mjs', ' * Homebrew\'s bin folder (/opt/homebrew/bin)').length === 0);

// (b)
const repoFile = path.join(HERE, 'reelreader.config.json');
const repoText = fs.readFileSync(repoFile, 'utf8');
check('(b) the config holds every place the code gave up',
  ['/mnt/project-files/references', '~/chromaglass-films/references', '~/chromaglass-films/watch', '/opt/homebrew/bin', 'watchsettings.mjs'].every(p => repoText.includes(p)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchconfigtest-'));
const env0 = { HOME: os.homedir() }; // no REELREADER_REFERENCES, no CHROMAGLASS_REFERENCES
try {
  // (c)
  const empty = path.join(tmp, 'empty.json');
  fs.writeFileSync(empty, '{}');
  const ce = loadConfig({ file: empty, env: env0, fresh: true });
  const watch = await import('./watch.mjs');
  const line = watch.macFetch('https://www.youtube.com/watch?v=abc', ce);
  const msg = watch.fetchElsewhere('https://www.youtube.com/watch?v=abc', ce).join('\n');
  const tries0 = referenceTries(env0, ce);
  check('(c) empty config: only the general library folder', tries0.length === 1 && tries0[0] === path.join(os.homedir(), 'reelreader-references'), tries0.join(', '));
  check('(c) empty config: the fetch line names no project folder and hands yt-dlp ffmpeg by full path',
    !PLACES.some(re => re.test(line)) && line.includes('d=~/reelreader/') && line.includes('--ffmpeg-location "$(command -v ffmpeg)"') && !/--ffmpeg-location ffmpeg\b/.test(line), line.slice(0, 120));
  check('(c) empty config: the message names no Mac and no project tool', !/Mac|Desktop Commander|device_stage_files|npm run/.test(msg) && /home connection/.test(msg));
  check('(c) empty config: no settings map, general scratch name', (await settingsMapFor(ce)) === null && ce.scratch === 'reelreader');

  // (d)
  const lib = path.join(tmp, 'lib');
  const envR = { ...env0, CHROMAGLASS_REFERENCES: lib };
  const cr = loadConfig({ file: repoFile, env: envR, fresh: true });
  const triesR = referenceTries(envR, cr);
  check('(d) repo config: the environment entry, then the shared folder, then the Mac folder',
    triesR[0] === lib && triesR.includes('/mnt/project-files/references') && triesR.some(d => d.endsWith(path.join('chromaglass-films', 'references'))), triesR.join(', '));
  check('(d) repo config: without the variable its entry is dropped, not left as "$CHROMAGLASS_REFERENCES"',
    referenceTries(env0, cr).every(d => !d.includes('$')), referenceTries(env0, cr).join(', '));
  const lineR = watch.macFetch('https://youtu.be/abc', cr);
  check('(d) repo config: the Mac line keeps Homebrew\'s tools by full path, into the stage folder',
    lineR.includes('--ffmpeg-location /opt/homebrew/bin/ffmpeg') && lineR.includes('d=~/chromaglass-films/watch/'), lineR.slice(0, 120));
  const gapSettings = await settingsMapFor(cr);
  const lines = gapSettings ? gapSettings([{ key: 'colourfulness', label: 'colourfulness', size: 2, direction: 'raise' }], { dyeBudget: 0.4 }) : [];
  check('(d) repo config: the settings map loads and says "Settings to try"', lines[0] === '## Settings to try' && lines.some(l => l.includes('dyeBudget')), lines[2]?.slice(0, 90));

  // (e)
  let missingErr = '';
  try { loadConfig({ file: path.join(tmp, 'nope.json'), env: env0, fresh: true }); } catch (e) { missingErr = e.message; }
  check('(e) a named config that is not there is an error', /no such file/.test(missingErr), missingErr);
  const badMap = path.join(tmp, 'badmap.json');
  fs.writeFileSync(badMap, JSON.stringify({ settingsMap: 'no-such-map.mjs' }));
  let mapErr = '';
  try { await settingsMapFor(loadConfig({ file: badMap, env: env0, fresh: true })); } catch (e) { mapErr = e.message; }
  check('(e) a settings map that will not load is an error', /did not load/.test(mapErr), mapErr.slice(0, 90));

  // (f)
  const refs = await import('./watchrefs.mjs');
  const deep = path.join(tmp, 'a', 'b', 'lib');
  // Folders that exist on no machine but this run's, so a real ~/reelreader-references does not answer first.
  const lone = path.join(tmp, 'lone.json');
  fs.writeFileSync(lone, JSON.stringify({ references: [path.join(tmp, 'gone', 'refs'), path.join(tmp, 'here-refs')] }));
  const cl = loadConfig({ file: lone, env: env0, fresh: true });
  const keepEnv = refs.libraryForKeep({ ...env0, REELREADER_REFERENCES: deep }, cl);
  const keepParent = refs.libraryForKeep(env0, cl);
  check('(f) --keep with no library: an environment variable is taken as asked, else the first folder whose parent exists',
    keepEnv === deep && keepParent === path.join(tmp, 'here-refs'), `${keepEnv} | ${keepParent}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nwatchconfig: ${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
