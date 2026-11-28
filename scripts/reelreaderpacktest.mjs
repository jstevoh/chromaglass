#!/usr/bin/env node
/**
 * `npm run reelpack`: the public copy reelreaderpack.mjs builds is whole and
 * runs (PLAN 47p-6).
 *
 * reelreader's public repository and its npm package are builds of this
 * repository (scripts/reelreaderpack.mjs). The ways such a build goes wrong
 * quietly are a module left out (the package installs, then the first watch
 * dies on an import), a test shipped to npm, a version that differs between the
 * package and the plugin, a skill the plugin cannot find, a command that does
 * nothing under npx because watch.mjs does not think it was the file node was
 * handed, and a line of this project's that should never be public. Each has a
 * check below, and each check is shown to fail on a build made wrong on
 * purpose, so none of them passes by measuring nothing.
 *
 *   (a) every relative import of every shipped module resolves inside the copy,
 *       and package.json's `files` names every module and no test;
 *   (b) one version in package.json, plugin.json and marketplace.json; the
 *       plugin finds its skill (skills/<name>/SKILL.md named reelreader) and
 *       its agent;
 *   (c) the scan finds nothing, and catches a planted home folder, address
 *       and model name;
 *   (d) `npm pack --dry-run` packs the bin, every module and the skill, and no
 *       test, no clip of the test set and no demo;
 *   (e) the command runs as npx runs it, through a link in a bin folder: a
 *       watch of the test set's animated short, with --no-report for time,
 *       finds its seven cuts and reads it as general footage;
 *   (f) the skill zip holds SKILL.md and the scripts beside it, and a watch run
 *       from the unzipped skill folder starts (--help).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build, scan, scanText, zip, modules, TESTS } from './reelreaderpack.mjs';

let total = 0, failed = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
const run = (cmd, args, cwd) => { const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 }); return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reelpack-'));
const out = path.join(tmp, 'reelreader');
try {
  const { mods, pkg } = build(out);

  // (a) imports and files.
  const unresolved = mod => [...fs.readFileSync(path.join(out, 'scripts', mod), 'utf8').matchAll(/(?:from|import\()\s*['"`](\.\.?\/[^'"`]+)['"`]/g)]
    .map(m => m[1]).filter(rel => !fs.existsSync(path.join(out, 'scripts', rel)));
  const broken = mods.flatMap(m => unresolved(m).map(r => `${m} -> ${r}`));
  check('(a) every relative import of every shipped module resolves in the copy', mods.length >= 15 && !broken.length, `${mods.length} modules; ${broken.join(', ')}`);
  const listed = new Set(pkg.files);
  check('(a) package.json files names every module and no test',
    mods.every(m => listed.has(`scripts/${m}`)) && !TESTS.some(t => listed.has(`scripts/${t}`)) && !mods.includes('watchsettings.mjs'),
    `${pkg.files.length} entries`);
  // Shown to fail: the copy with watchreadtest.mjs (imported by watch.mjs) taken out.
  const gone = path.join(out, 'scripts', 'watchreadtest.mjs');
  const keep = fs.readFileSync(gone);
  fs.rmSync(gone);
  check('(a) a copy missing a module watch.mjs imports is caught', unresolved('watch.mjs').includes('./watchreadtest.mjs'));
  fs.writeFileSync(gone, keep);

  // (b) one version; the plugin's parts where a plugin looks.
  const plugin = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(out, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const versions = [pkg.version, plugin.version, market.metadata?.version, ...market.plugins.map(p => p.version)];
  check('(b) one version in package.json, plugin.json and marketplace.json', /^\d+\.\d+\.\d+$/.test(pkg.version) && new Set(versions).size === 1, versions.join(', '));
  const skillMd = fs.readFileSync(path.join(out, 'skills', 'reelreader', 'SKILL.md'), 'utf8');
  check('(b) the plugin finds its skill named reelreader, led by "Analyse any video link or file", its agent and its command',
    /^---\nname: reelreader\ndescription: Analyse any video link or file/.test(skillMd)
      && fs.existsSync(path.join(out, 'agents', 'video-watcher.md')) && fs.existsSync(path.join(out, 'commands', 'reelreader.md'))
      && plugin.name === 'reelreader' && market.plugins[0]?.source === './');

  // (c) the scan.
  const hits = scan(out);
  check('(c) the copy holds no home folder, address or model name', !hits.length, hits.slice(0, 6).join('; '));
  const planted = ['see /Users/someone/films', 'mail someone@example.org', 'written with Sonnet 4'];
  check('(c) the scan catches each planted line', planted.every(l => scanText('planted', l).length === 1), planted.map(l => scanText('planted', l).length).join(','));
  check('(c) the codec is not a model', !scanText('codec', "['-c:a', 'libopus'] and the Opus ones").length);

  // (d) what npm would pack.
  const packed = run('npm', ['pack', '--dry-run', '--json'], out);
  let names = [];
  try { names = JSON.parse(packed.out.slice(packed.out.indexOf('['))).at(0).files.map(f => f.path); } catch { /* checked below */ }
  check('(d) npm packs the bin, every module, the skill, the plugin files and the licence',
    names.includes('bin/reelreader.mjs') && mods.every(m => names.includes(`scripts/${m}`)) && names.includes('skills/reelreader/SKILL.md')
      && names.includes('.claude-plugin/plugin.json') && names.includes('LICENSE') && names.includes('README.md'),
    `${names.length} files`);
  check('(d) and no test, no test clip and no demo', names.length > 0 && !names.some(n => TESTS.some(t => n.endsWith(t)) || n.endsWith('.mp4') || n.startsWith('docs/')),
    names.filter(n => n.endsWith('.mp4') || n.startsWith('docs/')).slice(0, 4).join(', '));

  // (e) the command, through a link, the way npx and a global install run it.
  const binDir = path.join(tmp, 'bin');
  fs.mkdirSync(binDir);
  fs.symlinkSync(path.join(out, 'bin', 'reelreader.mjs'), path.join(binDir, 'reelreader'));
  const clip = path.join(out, 'skills', 'reelreader', 'testset', 'general-film.mp4');
  const w = run(path.join(binDir, 'reelreader'), [clip, '--out', path.join(tmp, 'w'), '--no-report', '--quiet'], tmp);
  const sum = fs.existsSync(path.join(tmp, 'w', 'summary.md')) ? fs.readFileSync(path.join(tmp, 'w', 'summary.md'), 'utf8') : '';
  check('(e) `reelreader <clip>` through a bin link watches it: seven cuts, read as general footage',
    w.code === 0 && /cuts: 0:00\.7, 0:03\.8, 0:09\.5, 0:11\.3, 0:13\.5, 0:15\.6, 0:20\.0/.test(sum) && /Read as general footage/.test(sum),
    w.code === 0 ? sum.split('\n').find(l => l.startsWith('- cuts')) : w.out.slice(-300));
  const help = run(path.join(binDir, 'reelreader'), [], tmp);
  check('(e) with nothing to watch it prints help naming the command, not this repository\'s run script',
    help.code === 2 && /reelreader <file or URL>/.test(help.out) && !/npm run/.test(help.out), help.out.split('\n')[2]);

  // (f) the zip.
  const file = zip(out);
  const unz = path.join(tmp, 'unz');
  const u = run('unzip', ['-q', file, '-d', unz], tmp);
  const top = path.join(unz, 'reelreader');
  check('(f) the skill zip holds SKILL.md, the words guide, the test set and every module beside it',
    u.code === 0 && fs.existsSync(path.join(top, 'SKILL.md')) && fs.existsSync(path.join(top, 'watch-words.md'))
      && fs.existsSync(path.join(top, 'testset', 'answers.json')) && modules().every(m => fs.existsSync(path.join(top, 'scripts', m))),
    u.code === 0 ? `${(fs.statSync(file).size / 1e6).toFixed(1)} MB` : u.out);
  const zh = run(process.execPath, [path.join('scripts', 'watch.mjs')], top);
  check('(f) node scripts/watch.mjs runs from the unzipped skill folder', zh.code === 2 && /reelreader <file or URL>/.test(zh.out), zh.out.slice(0, 120));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${total - failed}/${total} reelpack checks passed`);
process.exit(failed ? 1 : 0);
