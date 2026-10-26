// The checks a change reaches, run here, side by side (PLAN.md 19k).
//
//   npm run quick                   what the diff from origin/main reaches (commits and the working tree)
//   npm run quick -- --base <ref>   from another base
//   npm run quick -- --measure      every Measure check (what `npm run check` runs)
//   npm run quick -- --all          every check that can run here
//   npm run quick -- --only <text>  the checks whose name or command has <text>
//   npm run quick -- --dry          say which, and why, and run none
//   npm run quick -- -j <n>         at most n at once (default: the cores)
//
// CLAUDE.md's "Which checks for which files" is a table a session reads and
// then runs by hand, one check after another; `npm run check` ran the 35
// Measure scripts one after another, some fifteen minutes. This reads the same
// manifest CI does (scripts/checks.json) and asks each check what it reads:
//   - its scripts, traced as `reach.mjs` traces them (checks.mjs `trace`);
//   - the src/ files they import, from esbuild's metafile, and those of every
//     entry a script bundles at run time (a `src/...` it names, the lab's
//     `scripts/*-entry.ts`), which is how most harnesses reach the code;
//   - and, for a check that serves the app (it starts vite), every file the
//     site is built from.
// A changed file selects the checks that read it; an entry of the manifest
// that changed selects itself; package.json beyond its scripts selects all.
//
// What runs here: Measure's four parts, and the Mac shards' lab checks under
// `PW_WEBGPU=1` (software WebGPU, CLAUDE.md "What can be verified where").
// A Mac check that serves the app is listed as Mac-only and not run: on
// software WebGPU the app's frames read back empty (PLAN 19l), so its green
// here would be vacuous.
//
// Side by side, a check that measures time can go red because the others
// took the cores (in a cloud session `npm run check` in parallel turned
// `layout` and `liquids` red once each, green alone). So every red is run
// again alone at the end, and the summary says which were red alone and which
// only in the crowd; the second is not a pass, it is a check to read.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, loadManifest, parseManifest, entryFiles, npmScriptsOf, trace, reads, runOne, metafilesOf } from './checks.mjs';
import { shipsToSite } from './reach.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(name);
const jobs = Number(opt('-j') ?? os.cpus().length);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();

const man = loadManifest();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const scripts = pkg.scripts ?? {};

// What each check reads.
const esbuild = await import('esbuild');
const traced = new Map(man.checks.map((c) => [c, trace(entryFiles(c.run, scripts))]));
const bundled = new Set();
for (const t of traced.values()) for (const f of t) if (/\.(mjs|js|ts|tsx)$/.test(f) && (/^src\//.test(f) || /^scripts\/.*\.(ts|mjs|js)$/.test(f))) bundled.add(f);
const nodeMeta = await metafilesOf(esbuild, [...bundled].filter((f) => f.startsWith('scripts/') && !f.endsWith('.ts')), 'node');
const webMeta = await metafilesOf(esbuild, [...bundled].filter((f) => f.startsWith('src/') || f.endsWith('.ts')), 'browser');
const text = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };
const SERVES_APP = /node_modules\/\.bin\/vite|['"`]vite['"`]|\bvite (?:preview|dev)\b|npm run (?:dev|preview)\b/;
const info = new Map();
for (const c of man.checks) {
  const r = new Set(traced.get(c));
  for (const f of traced.get(c)) for (const i of nodeMeta.get(f) ?? webMeta.get(f) ?? []) r.add(i);
  const files = [...traced.get(c)].filter((f) => /^(scripts|server)\//.test(f));
  const app = files.some((f) => SERVES_APP.test(text(f)));
  const browser = app || files.some((f) => /from ['"](?:playwright|\.\/chromium\.mjs|\.\/lab\.mjs)['"]/.test(text(f)));
  const mac = man.shards.mac.includes(c.shard);
  info.set(c, { reads: r, app, browser, here: !(mac && app), env: mac ? { PW_WEBGPU: '1' } : {} });
}

// Which checks, and why.
const chosen = new Map();
const pick = (c, why) => { if (!chosen.has(c)) chosen.set(c, why); };
let base = null;
if (has('--all')) man.checks.forEach((c) => pick(c, 'every check'));
else if (has('--measure')) man.checks.filter((c) => man.shards.measure.includes(c.shard)).forEach((c) => pick(c, 'Measure'));
else if (opt('--only')) man.checks.filter((c) => c.name.includes(opt('--only')) || c.run.includes(opt('--only'))).forEach((c) => pick(c, `--only ${opt('--only')}`));
else {
  const ref = opt('--base') ?? 'origin/main';
  base = git('merge-base', ref, 'HEAD').trim();
  const changed = new Set([
    ...git('diff', '--name-only', '--no-renames', base).split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').split('\n'),
  ].filter(Boolean));
  const unplaced = [];
  for (const f of changed) {
    let hit = false;
    if (f === 'scripts/checks.json') {
      let old = null;
      try { old = parseManifest(git('show', `${base}:scripts/checks.json`)); } catch { /* new */ }
      const body = (c) => JSON.stringify({ ...c, why: undefined });
      for (const c of man.checks) {
        const was = old?.checks.find((o) => o.name === c.name && o.shard === c.shard);
        if (!was || body(was) !== body(c)) { pick(c, 'its entry in the manifest changed'); hit = true; }
      }
      if (!hit) hit = true; // only removals or prose: nothing left to run
      continue;
    }
    if (f === 'package.json') {
      let old = {};
      try { old = JSON.parse(git('show', `${base}:package.json`)); } catch { /* new */ }
      if (JSON.stringify({ ...old, scripts: undefined }) !== JSON.stringify({ ...pkg, scripts: undefined })) {
        man.checks.forEach((c) => pick(c, 'package.json beyond its scripts'));
        hit = true;
        continue;
      }
      const names = Object.keys({ ...old.scripts, ...scripts }).filter((n) => old.scripts?.[n] !== scripts[n]);
      for (const c of man.checks) {
        const runs = npmScriptsOf(c.run, scripts);
        const n = names.find((x) => runs.has(x));
        if (n) pick(c, `npm script ${n}`);
      }
      continue;
    }
    for (const c of man.checks) {
      const i = info.get(c);
      if (reads(i.reads, f)) { pick(c, f); hit = true; } else if (i.app && shipsToSite(f)) { pick(c, `${f} (it serves the app)`); hit = true; }
    }
    if (!hit && !/\.md$|^\.claude\//.test(f)) unplaced.push(f);
  }
  console.log(`${changed.size} files changed since ${ref} (${base.slice(0, 7)})${unplaced.length ? `; read by no check traced: ${unplaced.join(', ')}` : ''}`);
}

const here = [...chosen.keys()].filter((c) => info.get(c).here);
const macOnly = [...chosen.keys()].filter((c) => !info.get(c).here);
// One run for a command that two shards both run (the shaders compile in the
// lab part and on the show shard).
const byCmd = new Map();
for (const c of here) { const k = `${c.run}\u0000${JSON.stringify({ ...c.env, ...info.get(c).env })}`; if (!byCmd.has(k)) byCmd.set(k, []); byCmd.get(k).push(c); }
const units = [...byCmd.values()];

if (has('--dry') || !units.length) {
  for (const u of units) console.log(`  run   ${u.map((c) => `${c.name} [${c.shard}]`).join(' = ')}: ${chosen.get(u[0])}`);
  for (const c of macOnly) console.log(`  Mac   ${c.name} [${c.shard}]: ${chosen.get(c)} (serves the app: on the Mac only)`);
  console.log(`${units.length} to run here, ${macOnly.length} on the Mac only`);
  process.exit(0);
}

const started = Date.now();
const fmt = (s) => (s >= 90 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)} s`);
const results = new Map();
const quiet = { onOut: () => {}, onErr: () => {} };
const keep = (u) => (b) => { results.get(u).out += b; };
console.log(`${units.length} checks here, ${jobs} at once${macOnly.length ? `; ${macOnly.length} on the Mac only: ${macOnly.map((c) => c.name).join('; ')}` : ''}`);
let browsers = 0;
const maxBrowsers = Math.max(1, Math.floor(jobs / 2));
const queue = [...units];
const worker = async () => {
  for (;;) {
    // A browser check waits for a slot of its own: two Chromiums with
    // SwiftShader fill four cores between them.
    const i = queue.findIndex((u) => !info.get(u[0]).browser || browsers < maxBrowsers);
    if (i < 0) { if (!queue.length) return; await new Promise((r) => setTimeout(r, 200)); continue; }
    const [u] = queue.splice(i, 1);
    const b = info.get(u[0]).browser;
    if (b) browsers++;
    results.set(u, { out: '' });
    const r = await runOne(u[0], { ...quiet, onOut: keep(u), onErr: keep(u), env: info.get(u[0]).env });
    if (b) browsers--;
    Object.assign(results.get(u), r);
    console.log(`${r.ok ? '✓' : '✗'} ${u.map((c) => c.name).join(' = ')}, ${fmt(r.secs)}`);
  }
};
await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));

// Every red again, alone.
const red = units.filter((u) => !results.get(u).ok);
const alone = new Map();
if (red.length) console.log(`\n${red.length} red; each again alone:`);
for (const u of red) {
  const r = await runOne(u[0], { ...quiet, env: info.get(u[0]).env });
  alone.set(u, r);
  console.log(`${r.ok ? '✓' : '✗'} ${u.map((c) => c.name).join(' = ')} alone, ${fmt(r.secs)}`);
}
const redAlone = red.filter((u) => !alone.get(u).ok);
const crowd = red.filter((u) => alone.get(u).ok);
for (const u of redAlone) {
  const r = alone.get(u);
  console.log(`\n✗ ${u[0].name} (${u[0].run})${r.timedOut ? ', past its timeout' : ''}`);
  const lines = (r.fails.length ? r.fails : results.get(u).out.trim().split('\n').slice(-12));
  for (const l of lines.slice(0, 12)) console.log(`    ${l}`);
}
console.log(`\n${units.length - red.length} of ${units.length} green in ${fmt((Date.now() - started) / 1000)}` +
  (redAlone.length ? `; red alone: ${redAlone.map((u) => u[0].name).join('; ')}` : '') +
  (crowd.length ? `; red only beside the others (green alone, read why): ${crowd.map((u) => u[0].name).join('; ')}` : ''));
if (macOnly.length) console.log(`Not run here, the app's frames need the Mac: ${macOnly.map((c) => `${c.name} [${c.shard}]`).join('; ')}`);
process.exit(redAlone.length || crowd.length ? 1 : 0);
