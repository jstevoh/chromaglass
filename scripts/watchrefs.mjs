/**
 * The reference library, for the watch tool (scripts/watch.mjs, PLAN 47v-2).
 *
 * Each reference watched leaves a design.json (the design and physics reads)
 * beside its sheets and timeline, in whatever scratch folder the thread used,
 * and the thread ends. The next thread that wants "the look we want" had to
 * fetch the film again, on the owner's Mac when it is on YouTube, and watch
 * it again for ten minutes, before `--vs` could rank a single gap. So the
 * references the owner likes are kept, once, in one library:
 *
 *   <library>/<name>/design.json   the reads, what `--vs <name>` compares with
 *                    summary.md    the account the tool printed
 *                    timeline.png, sheet-1.png, palette.png
 *                    ref.json      where it came from: title, link, crop, the
 *                                  span watched, when, and a line on why it
 *                                  was kept
 *
 * The library is private to the owner (the repository is public; a film's
 * frames and the owner's notes are not for it), so it lives outside the repo:
 * $CHROMAGLASS_REFERENCES if set, else the project's shared folder
 * (/mnt/project-files/references, which every cloud thread sees), else
 * ~/chromaglass-films/references on the owner's Mac.
 *
 *   npm run watch -- <film> --out … --keep jls-liquid-loops --note "the 1969 look"
 *   npm run watch -- our-take.webm --out … --vs jls-liquid-loops
 *   npm run watch -- --refs        # what is in the library, with its numbers
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const KEEP = ['design.json', 'summary.md', 'timeline.png', 'sheet-1.png', 'palette.png'];

/** The library folders that exist, first the one `--keep` writes to. */
export function libraryDirs(env = process.env) {
  const tries = [env.CHROMAGLASS_REFERENCES, '/mnt/project-files/references', path.join(os.homedir(), 'chromaglass-films', 'references')];
  return [...new Set(tries.filter(Boolean))].filter(d => fs.existsSync(d));
}

/** Where `--keep` writes: the first library that exists, or the first that can be made. */
export function libraryForKeep(env = process.env) {
  const have = libraryDirs(env);
  if (have.length) return have[0];
  if (env.CHROMAGLASS_REFERENCES) return env.CHROMAGLASS_REFERENCES;
  return fs.existsSync('/mnt/project-files') ? '/mnt/project-files/references' : path.join(os.homedir(), 'chromaglass-films', 'references');
}

/** A reference's name as a folder: lower case, words joined by dashes. */
export const refName = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * What `--vs` was given, as a design.json path: a path to one, a folder
 * holding one, or the name of a kept reference. Null if none of those.
 */
export function resolveRef(arg, env = process.env) {
  if (!arg) return null;
  if (fs.existsSync(arg)) {
    const inDir = path.join(arg, 'design.json');
    return fs.statSync(arg).isDirectory() ? (fs.existsSync(inDir) ? inDir : null) : arg;
  }
  for (const lib of libraryDirs(env)) {
    const f = path.join(lib, refName(arg), 'design.json');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/**
 * Keep a watched clip's out folder as a reference. `meta` is what ref.json
 * records beside the files (title, url, crop, from, to, note). Returns the
 * folder it wrote.
 */
export function keepRef(out, name, meta = {}, env = process.env) {
  const n = refName(name);
  if (!n) throw new Error('--keep wants a name');
  if (!fs.existsSync(path.join(out, 'design.json'))) throw new Error(`--keep: no design.json in ${out}`);
  const dir = path.join(libraryForKeep(env), n);
  fs.mkdirSync(dir, { recursive: true });
  const kept = [];
  for (const f of KEEP) if (fs.existsSync(path.join(out, f))) { fs.copyFileSync(path.join(out, f), path.join(dir, f)); kept.push(f); }
  fs.writeFileSync(path.join(dir, 'ref.json'), JSON.stringify({ name: n, ...meta, kept: new Date().toISOString().slice(0, 10), files: kept }, null, 1) + '\n');
  return dir;
}

const f = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(d));

/** The library as lines: each reference, why it was kept, and its headline numbers. */
export function listRefs(env = process.env) {
  const libs = libraryDirs(env);
  if (!libs.length) return [`No reference library yet (looked in ${[env.CHROMAGLASS_REFERENCES, '/mnt/project-files/references', '~/chromaglass-films/references'].filter(Boolean).join(', ')}). Keep one with --keep <name>.`];
  const lines = [];
  for (const lib of libs) {
    const names = fs.readdirSync(lib).filter(d => fs.existsSync(path.join(lib, d, 'design.json'))).sort();
    lines.push(`${lib}: ${names.length} reference${names.length === 1 ? '' : 's'}`);
    for (const n of names) {
      let ref = {}, d = {};
      try { ref = JSON.parse(fs.readFileSync(path.join(lib, n, 'ref.json'), 'utf8')); } catch { /* kept by hand: the design.json alone still serves --vs */ }
      try { d = JSON.parse(fs.readFileSync(path.join(lib, n, 'design.json'), 'utf8')); } catch { continue; }
      const p = d.physics ?? {};
      lines.push(`- ${n}: ${ref.title ?? d.title ?? ''}${ref.note ? ` (${ref.note})` : ''}`);
      lines.push(`    flow ${f(p.own?.med)}%/s, carried ${f(p.carried?.med, 2)}, turnover ${f(p.turnover)} s, lifetime ${f(p.lifetime)} s, spectrum ${f(p.spectrum?.med, 2)}; colourfulness ${f(d.colourfulness?.med, 0)}, ${d.palette?.length ?? 0} colours${ref.url ? `; ${ref.url}` : ''}`);
    }
  }
  return lines;
}
