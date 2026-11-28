#!/usr/bin/env node
/**
 * Build reelreader's public repository from this one (PLAN 47p-6).
 *
 *   node scripts/reelreaderpack.mjs --out DIR [--zip] [--test] [--demo]
 *
 * The watch tool ships to anyone as reelreader, under the MIT licence: its own
 * public repository (jstevoh/reelreader), an npm package (`npx reelreader
 * <link>`), a Claude Code plugin that is also its own marketplace, and a skill
 * zip for claude.ai (the owner's go, 2026-11-27, PLAN 47p). Its code stays
 * here, in scripts/, where this repository's checks run it every day; the
 * plugin plan (docs/watch-plugin-plan.md, "One source") asked that the shipped
 * copy be built from main and never edited by hand. This is that build. Run it
 * on a fresh checkout of main, then push DIR to the public repository: the
 * public history is a series of these builds, one commit a release.
 *
 * What it writes, and why each move:
 *
 * - `scripts/`: every watch module except `watchsettings.mjs` (ChromaGlass's
 *   own settings map: a gap in edge width means a dial only in our app), the
 *   tests that run with nothing but ffmpeg, and no `reelreader.config.json`, so
 *   a copy finds only the general places (watchconfig.mjs). The layout stays
 *   `scripts/`, so every "scripts/watch.mjs" the skill and the words guide
 *   name is true in the copy too. Two rewrites: "npm run watch -- " becomes
 *   "reelreader " (the help a user prints), and the skill's folder
 *   `reelreader/skill` becomes `skills/reelreader`, where a Claude Code plugin
 *   looks for it.
 * - `skills/reelreader/`: reelreader/skill as it stands (held by `npm run
 *   reelset`), and its helper again as `agents/video-watcher.md`, where a
 *   plugin looks for agents.
 * - From reelreader/release/: the README, package.json (its `files` list
 *   written here from the modules actually copied, so no test ships to npm and
 *   no module is left out), the licence, the plugin and marketplace files
 *   (kept here as `claude-plugin/`, named `.claude-plugin/` in the copy, so
 *   nothing in this repository mistakes them for its own), the `/reelreader`
 *   command, `.gitignore` and the copy's CI.
 * - `--demo`: watches the test set's animated short (Big Buck Bunny, CC BY)
 *   into `docs/demo/`, so the README shows a real run, not a mock-up.
 * - `--zip`: `dist/reelreader-skill.zip`, the skill folder with the scripts
 *   inside it, for claude.ai's skill upload, where there is no npm and the
 *   skill must carry its own code (`node scripts/watch.mjs` from the skill's
 *   folder).
 * - `--test`: runs the copy's own `npm test` in DIR.
 *
 * Then it scans every text file it wrote for what a public copy must not
 * carry: a person's home folder, an address, a model's name. The code's
 * comments do name ChromaGlass, its plan items and "the owner's Mac": that is
 * where each measure was calibrated and why, the same text as in this public
 * repository, and the comments are the reasons the code is the way it is.
 * `npm run reelpack` builds a copy into a temp folder and holds all of this.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const RELEASE = path.join(ROOT, 'reelreader', 'release');
const SKILL = path.join(ROOT, 'reelreader', 'skill');

// The modules a copy needs: every watch*.mjs that is not a test, minus the app's
// settings map, and every file those import (watch.mjs takes its read self-test
// from watchreadtest.mjs, kept apart only for the size bar). A new module is
// picked up by name, so it cannot be left out.
export const LEFT_OUT = ['watchsettings.mjs'];
export const modules = () => {
  const got = new Set(fs.readdirSync(HERE).filter(f => /^watch[a-z]*\.mjs$/.test(f) && !/test\.mjs$/.test(f) && !LEFT_OUT.includes(f)));
  for (const f of got) {
    for (const m of fs.readFileSync(path.join(HERE, f), 'utf8').matchAll(/(?:from|import\()\s*['"`]\.\/([a-z]+\.mjs)['"`]/g)) {
      if (!LEFT_OUT.includes(m[1]) && fs.existsSync(path.join(HERE, m[1]))) got.add(m[1]);
    }
  }
  return [...got].sort();
};
export const TESTS = [
  // The tests that make their own clips or use the test set, with nothing but
  // node and ffmpeg. Four stay here, where they run every day: watchcardtest
  // (it reads the app's settings types in src/), watchconfigtest (it holds this
  // repository's own config), watchmodetest (it proves "Settings to try" goes
  // with the liquid read, which needs the app's settings map) and ratepagetest
  // (it drives Chromium).
  'watchwordstest.mjs', 'watchreporttest.mjs',
  'watchshotstest.mjs', 'watchbatchtest.mjs', 'reelsettest.mjs',
];

// What no shipped text may hold: a person's home folder, an address, a model's
// name. The tests are scanned for the first two only: reelsettest holds the
// model names as the patterns its own scan looks for.
export const BANNED = [
  [/\/Users\/[a-z]|\/home\/(?!user\b)[a-z]/i, "a person's home folder"],
  [/[A-Za-z0-9._%+-]+@(?!anthropic\.com)[A-Za-z0-9.-]+\.[a-z]{2,}/, 'an address'],
  [/\b(opus|sonnet|haiku|fable|gpt-?\d|gemini|hydrogen|carbon)(?![a-z])/i, 'a model'],
];
// "libopus" and "the Opus ones" are the sound codec, not a model.
const CODEC = /libopus|Opus ones/g;
export const scanText = (name, src, { test = false } = {}) => {
  const hits = [];
  src.split('\n').forEach((line, i) => {
    const l = line.replace(CODEC, '');
    for (const [re, what] of BANNED) if ((!test || what !== 'a model') && re.test(l)) hits.push(`${name}:${i + 1} ${what}`);
  });
  return hits;
};

// `npm run <check>` in a reason names this repository's script; where that
// script is a test the copy ships, the copy says how to run it there.
const RUNS = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts)
  .map(([k, v]) => [k, /^node (scripts\/[a-z]+\.mjs)$/.exec(v)?.[1]]).filter(([, v]) => v && TESTS.includes(path.basename(v))));

const rewrite = (src, { code }) => {
  let s = src.replaceAll("'reelreader', 'skill'", "'skills', 'reelreader'").replaceAll('reelreader/skill', 'skills/reelreader');
  if (code) s = s.replaceAll('npm run watch -- ', 'reelreader ').replace(/npm run watch\b(?![a-z])/g, 'reelreader');
  return s.replace(/npm run ([a-z0-9]+)/g, (m, k) => (RUNS[k] ? `node ${RUNS[k]}` : m));
};

const copyTree = (from, to) => {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyTree(a, b);
    else if (/\.(md|json)$/.test(e.name)) fs.writeFileSync(b, rewrite(fs.readFileSync(a, 'utf8'), { code: false }));
    else fs.copyFileSync(a, b);
  }
};

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.name === 'node_modules' || e.name === '.git' ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const TEXT = /\.(md|json|mjs|js|yml|txt|html)$|(^|\/)(LICENSE|\.gitignore)$/;

export function build(out) {
  for (const keep of fs.existsSync(out) ? fs.readdirSync(out) : []) if (keep !== '.git') fs.rmSync(path.join(out, keep), { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'scripts'), { recursive: true });
  const mods = modules();
  for (const f of mods) fs.writeFileSync(path.join(out, 'scripts', f), rewrite(fs.readFileSync(path.join(HERE, f), 'utf8'), { code: true }));
  for (const f of TESTS) fs.writeFileSync(path.join(out, 'scripts', f), rewrite(fs.readFileSync(path.join(HERE, f), 'utf8'), { code: false }));
  copyTree(SKILL, path.join(out, 'skills', 'reelreader'));
  // The test set's clips (2.5 MB) come with the repository, the plugin and the
  // zip, where the skill is used; npm users run the command, so its package
  // leaves them out. npm ignores a root .npmignore under a `files` list, but not
  // one in a subfolder. It sits in skills/, beside the skill's folder, not in
  // it: reelsettest holds that folder to pages and clips, in the copy too.
  fs.writeFileSync(path.join(out, 'skills', '.npmignore'), 'reelreader/testset/*.mp4\n');
  fs.mkdirSync(path.join(out, 'agents'), { recursive: true });
  fs.copyFileSync(path.join(SKILL, 'agents', 'video-watcher.md'), path.join(out, 'agents', 'video-watcher.md'));
  const NAMES = { 'claude-plugin': '.claude-plugin', gitignore: '.gitignore', 'github-workflows': path.join('.github', 'workflows'), 'package.json': null };
  for (const e of fs.readdirSync(RELEASE, { withFileTypes: true })) {
    if (e.name === 'package.json') continue;
    const dest = path.join(out, NAMES[e.name] ?? e.name);
    if (e.isDirectory()) copyTree(path.join(RELEASE, e.name), dest);
    else fs.copyFileSync(path.join(RELEASE, e.name), dest);
  }
  fs.chmodSync(path.join(out, 'bin', 'reelreader.mjs'), 0o755);
  const pkg = JSON.parse(fs.readFileSync(path.join(RELEASE, 'package.json'), 'utf8'));
  pkg.files = ['bin/', ...mods.map(f => `scripts/${f}`), 'skills/', 'agents/', 'commands/', '.claude-plugin/', 'CHANGELOG.md'];
  pkg.scripts = { test: ['node scripts/watch.mjs --selftest', ...TESTS.map(f => `node scripts/${f}`)].join(' && ') };
  fs.writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  // One version everywhere: the plugin and the marketplace say the package's.
  for (const f of ['plugin.json', 'marketplace.json']) {
    const p = path.join(out, '.claude-plugin', f);
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    j.version &&= pkg.version;
    if (j.metadata) j.metadata.version = pkg.version;
    for (const pl of j.plugins ?? []) pl.version = pkg.version;
    fs.writeFileSync(p, `${JSON.stringify(j, null, 2)}\n`);
  }
  return { mods, pkg };
}

export function scan(out) {
  const files = walk(out).filter(f => TEXT.test(f) && !f.includes(`${path.sep}docs${path.sep}demo${path.sep}`));
  return files.flatMap(f => scanText(path.relative(out, f), fs.readFileSync(f, 'utf8'), { test: TESTS.includes(path.basename(f)) }));
}

const sh = (cmd, args, cwd, extra = {}) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, ...extra });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

export function demo(out) {
  const dir = path.join(out, 'docs', 'demo');
  fs.rmSync(dir, { recursive: true, force: true });
  const r = sh(process.execPath, [path.join(out, 'bin', 'reelreader.mjs'), path.join(out, 'skills', 'reelreader', 'testset', 'general-film.mp4'), '--out', dir], out);
  if (!r.ok) throw new Error(`demo run failed:\n${r.out.slice(-2000)}`);
  // The demo is read on GitHub: the page and best.mp4 (the page plays it from
  // beside itself), the timeline, the first sheet (as a JPEG: the PNG is 2.7 MB),
  // the best frame, the palette, the summary and the shot list. The run's other
  // files (stats.tsv, the other sheets) are made again by anyone who runs it. The summary names the folders it ran in; the
  // copy names them from the repository's root.
  const keep = new Set(['report.html', 'timeline.png', 'summary.md', 'shots.csv', 'best.png', 'best.mp4', 'palette.png', 'design.json']);
  const jpg = sh(findTool('ffmpeg'), ['-v', 'error', '-y', '-i', path.join(dir, 'sheet-1.png'), '-vf', 'scale=1104:-1', '-q:v', '4', path.join(dir, 'sheet-1.jpg')], dir);
  if (!jpg.ok) throw new Error(`demo sheet: ${jpg.out}`);
  keep.add('sheet-1.jpg');
  for (const f of fs.readdirSync(dir)) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
  for (const f of ['summary.md', 'design.json']) {
    const p = path.join(dir, f);
    fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll(`${dir}${path.sep}`, '').replaceAll(`${out}${path.sep}`, ''));
  }
  const left = fs.readdirSync(dir).filter(f => /\.(md|json|csv|html)$/.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').includes(out));
  if (left.length) throw new Error(`demo files still name the folder they were made in: ${left.join(', ')}`);
  return fs.readdirSync(dir);
}

const findTool = name => process.env[name.toUpperCase()] || name;

export function zip(out) {
  // The skill folder with the code inside it: claude.ai runs a skill from its own
  // folder, with no npm, so `node scripts/watch.mjs` there must find the scripts.
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'reelzip-'));
  const top = path.join(stage, 'reelreader');
  copyTree(path.join(out, 'skills', 'reelreader'), top);
  fs.mkdirSync(path.join(top, 'scripts'));
  for (const f of modules()) fs.copyFileSync(path.join(out, 'scripts', f), path.join(top, 'scripts', f));
  fs.copyFileSync(path.join(out, 'LICENSE'), path.join(top, 'LICENSE'));
  fs.mkdirSync(path.join(out, 'dist'), { recursive: true });
  const file = path.join(out, 'dist', 'reelreader-skill.zip');
  fs.rmSync(file, { force: true });
  const r = sh('zip', ['-qr', '-X', file, 'reelreader'], stage);
  if (!r.ok) {
    const py = sh('python3', ['-c', 'import shutil,sys; shutil.make_archive(sys.argv[1][:-4], "zip", sys.argv[2], "reelreader")', file, stage], stage);
    if (!py.ok) throw new Error(`no zip and no python3 to make ${file}: ${r.out} ${py.out}`);
  }
  fs.rmSync(stage, { recursive: true, force: true });
  return file;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--out');
  const out = path.resolve(at >= 0 ? argv[at + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'reelreader-')));
  const { mods, pkg } = build(out);
  console.log(`reelreader ${pkg.version}: ${mods.length} modules into ${out}`);
  if (argv.includes('--demo')) console.log(`demo: docs/demo/ ${demo(out).join(', ')}`);
  const hits = scan(out);
  if (hits.length) { console.log(`FAIL the copy holds what a public copy must not:\n  ${hits.join('\n  ')}`); process.exit(1); }
  console.log('scan: nothing of this project\'s places, no address, no model name');
  if (argv.includes('--zip')) console.log(`zip: ${zip(out)}`);
  if (argv.includes('--test')) {
    const r = sh('npm', ['test'], out, { stdio: 'inherit' });
    if (!r.ok) { console.log('FAIL npm test in the copy'); process.exit(1); }
  }
}
