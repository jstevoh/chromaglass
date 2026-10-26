// The manifest of checks (`scripts/checks.json`, PLAN.md 19k): what it holds,
// how CI runs a shard from it, and which shards a pull request's diff selects.
//
//   node scripts/checks.mjs --ci <shard>   run one shard's checks, in order (checks.yml)
//   npm run checks                         hold the manifest, the workflow and the rules below
//   npm run quick                          what a diff reaches, in parallel, here (quick.mjs)
//
// Why a manifest. Every check used to be a step in `checks.yml` with its npm
// script in `package.json`: 13 and 14 of the 30 merges before 2026-10-04 edited
// them, which is where three of the merge conflicts then were. And a PR that
// changed one Mac check's script queued all five Mac shards: replayed over the
// 60 PRs merged up to #497 (2026-10-26), six changed only check scripts (#429,
// #449, #456, #462, #465, #472) and spent 1,325 Mac runner-minutes, of which
// the shards their scripts are in were 275. The rest proved nothing their
// change could move, in a queue that is five runners for every PR and deploy.
//
// Why one step a shard, not a step a check. GitHub cannot make steps at run
// time, so a manifest that the workflow reads has to be run by something; the
// other way, a workflow written out from the manifest, would leave every new
// check editing `checks.yml` still, which is the shared file this removes.
// What a step gave that the runner here keeps: each check's log opens with a
// `Run <command>` group exactly as a step's does, which is the line
// `flakes.mjs` files each FAIL under (it reads the raw log's `##[group]Run`);
// a red check is an error annotation with its name and its FAIL lines, which
// the run's page lists as a red step was; its own timeout; and every check
// runs whatever failed before it, as `!cancelled()` steps did. And one thing
// a step did not: the job's summary is a table of every check's time, the
// number 19w's shard balancing had to take from the API step by step.
//
// Which shards a diff selects (`selectShards`, called by `reach.mjs --diff`
// for the files that reach a Mac shard at all). Measure always runs in full;
// this is only about the Mac. Anything it cannot show is every shard:
//   - a script under `scripts/` selects the shards of the checks that run it
//     or import it (traced below), and nothing if they are all in Measure;
//     one that no check traces (a fixture read by a name built at run time,
//     a new helper) selects every shard, as do the helpers every app or lab
//     check shares (`SHARED`) and this file;
//   - `scripts/checks.json` selects the shards of the entries it adds,
//     removes or changes, both the old and the new shard of one that moves,
//     and none for an entry whose `why` alone changed; a change to anything
//     but the entries selects every shard;
//   - `package.json` whose change is only in `scripts` selects the shards of
//     the checks that run the scripts it changes (`npm run <name>`), and
//     every shard if one of them is run by no check;
//   - anything else that reaches the Mac (`src/`, `public/`, a workflow, the
//     docs' JSON, `server/`) selects every shard.
// What that leaves unmeasured: a script one check traces and another reads at
// run time by a path built from parts, which the trace cannot see; the second
// check's shard does not run. The trace reads every string in a script that
// names a file under the repository, so the path has to be assembled for this
// to happen, and the deploy of a merge with any site file in it runs every
// shard on main either way (`deploygate.sh`).

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = process.env.CHECKS_MANIFEST || path.join(ROOT, 'scripts/checks.json');

// The helpers that every app or lab check leans on: a change in one is a
// change to how every picture is read, whatever the trace says (19k's own
// list), and `checks.mjs` runs every shard.
export const SHARED = [
  'scripts/chromium.mjs', 'scripts/frame.mjs', 'scripts/lab.mjs', 'scripts/lab-entry.ts',
  'scripts/checks.mjs',
];

export function parseManifest(text, where = 'scripts/checks.json') {
  const m = JSON.parse(text);
  const bad = (why) => { throw new Error(`${where}: ${why}`); };
  const measure = m.shards?.measure, mac = m.shards?.mac;
  if (!Array.isArray(measure) || !Array.isArray(mac) || !measure.length || !mac.length) bad('needs shards.measure and shards.mac, each a list');
  const all = [...measure, ...mac];
  if (new Set(all).size !== all.length) bad('a shard is named twice');
  if (!Array.isArray(m.checks) || !m.checks.length) bad('has no checks');
  const seen = new Set();
  for (const [i, c] of m.checks.entries()) {
    const at = `check ${i + 1} (${c?.name ?? 'no name'})`;
    if (typeof c.name !== 'string' || !c.name.trim()) bad(`${at} has no name`);
    if (!all.includes(c.shard)) bad(`${at} is on shard ${c.shard}, which is not one of ${all.join(', ')}`);
    if (typeof c.run !== 'string' || !c.run.trim()) bad(`${at} has no command`);
    if (c.env != null && (typeof c.env !== 'object' || Object.values(c.env).some((v) => typeof v !== 'string'))) bad(`${at}'s env is not names to strings`);
    if (c.timeout != null && !(c.timeout > 0)) bad(`${at}'s timeout is not a number of minutes`);
    if (c.why != null && !(Array.isArray(c.why) && c.why.every((l) => typeof l === 'string'))) bad(`${at}'s why is not a list of lines`);
    const extra = Object.keys(c).filter((k) => !['name', 'shard', 'run', 'env', 'timeout', 'why'].includes(k));
    if (extra.length) bad(`${at} has keys the runner does not read: ${extra.join(', ')}`);
    const key = `${c.shard}\u0000${c.name}`;
    if (seen.has(key)) bad(`${at} is named twice on ${c.shard}`);
    seen.add(key);
  }
  for (const s of all) if (!m.checks.some((c) => c.shard === s)) bad(`shard ${s} has no checks`);
  return { shards: { measure, mac }, checks: m.checks };
}

export const loadManifest = () => parseManifest(fs.readFileSync(MANIFEST, 'utf8'), path.relative(ROOT, MANIFEST));
const pkgScripts = (root = ROOT) => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts ?? {};

// The npm scripts a command runs, and the ones those run in turn.
export function npmScriptsOf(run, scripts, seen = new Set()) {
  for (const m of run.matchAll(/\bnpm run (?:-s |--silent )?([\w:.-]+)/g)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    if (scripts[m[1]]) npmScriptsOf(scripts[m[1]], scripts, seen);
  }
  return seen;
}

// The files a command starts, through its npm scripts.
export function entryFiles(run, scripts) {
  const cmds = [run, ...[...npmScriptsOf(run, scripts)].map((n) => scripts[n] ?? '')];
  const out = new Set();
  for (const c of cmds) for (const m of c.matchAll(/(?:^|[\s"'=])((?:scripts|server)\/[\w./-]+\.(?:mjs|js|ts|sh))\b/g)) out.add(m[1]);
  return out;
}

/*
  What a check's scripts read, without installing anything: the reach job runs
  before `npm ci`, and esbuild is a package. From each file under `scripts/`,
  every relative import (static, dynamic or bare `import '...'`), and every
  string that names a path from the repository's root or from the file's own
  folder that exists, file or folder; followed through every such file under
  `scripts/` or `server/`. It over-reads (a path in a comment counts), which
  only selects more. `npm run checks` holds it to esbuild's metafile, which is
  the exact import graph: every script esbuild finds a check importing, this
  must find too.
*/
const traceCache = new Map();
export function trace(files, root = ROOT) {
  const out = new Set();
  const todo = [...files];
  while (todo.length) {
    const f = todo.pop();
    if (out.has(f)) continue;
    out.add(f);
    const abs = path.join(root, f);
    if (!/^(scripts|server)\//.test(f) || !/\.(mjs|js|ts|cjs|sh)$/.test(f) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
    let found = traceCache.get(abs);
    if (!found) {
      const text = fs.readFileSync(abs, 'utf8');
      found = new Set();
      for (const m of text.matchAll(/['"`]([^'"`\s$]{3,200})['"`]/g)) {
        const s = m[1].replace(/[?#].*$/, '');
        const cands = [];
        if (/^\.\.?\//.test(s)) cands.push(path.normalize(path.join(path.dirname(f), s)));
        if (/^(scripts|src|public|docs|server)\//.test(s)) cands.push(path.normalize(s));
        // A folder counts only below the top (scripts/fixtures, public/video):
        // a script that names `scripts/` or `../` is not reading all of it.
        for (const c of cands) {
          const p = c.replace(/\/$/, '');
          if (p.startsWith('..') || p === '.' || !fs.existsSync(path.join(root, p))) continue;
          if (fs.statSync(path.join(root, p)).isDirectory() && !p.includes('/')) continue;
          found.add(p);
        }
      }
      traceCache.set(abs, found);
    }
    for (const g of found) todo.push(g);
  }
  return out;
}

// True when `file` is one of `reads` or under a folder in it.
export const reads = (set, file) => set.has(file) || [...set].some((r) => file.startsWith(`${r}/`));

function diffEntries(before, after) {
  const key = (c) => `${c.shard}\u0000${c.name}`;
  const body = (c) => JSON.stringify({ ...c, why: undefined });
  const a = new Map(before.checks.map((c) => [key(c), c]));
  const b = new Map(after.checks.map((c) => [key(c), c]));
  const changed = [];
  for (const [k, c] of a) if (!b.has(k) || body(b.get(k)) !== body(c)) changed.push(c);
  for (const [k, c] of b) if (!a.has(k) || body(a.get(k)) !== body(c)) changed.push(c);
  return changed;
}

/*
  The Mac shards a diff selects, of the files that reach one (`reach.mjs`
  filters the rest first). `before` and `after` are { manifest, pkg } at the
  PR's base and its merge: the manifest parsed, package.json parsed, or null
  where the file is absent. Returns { shards, why }, every shard when any
  file cannot be placed.
*/
export function selectShards(files, { before, after, root = ROOT }) {
  const mac = after.manifest.shards.mac;
  const sel = new Set();
  const why = [];
  const every = (w) => ({ shards: [...mac], why: `every shard: ${w}` });
  const shardsRunning = (pred) => {
    const hit = [];
    for (const m of [before.manifest, after.manifest]) for (const c of m?.checks ?? []) if (pred(c, m)) hit.push(c);
    return hit;
  };
  const add = (cs, what) => {
    const s = [...new Set(cs.map((c) => c.shard).filter((x) => mac.includes(x)))];
    s.forEach((x) => sel.add(x));
    why.push(`${what}: ${s.length ? s.join(', ') : 'Measure only'}`);
  };
  for (const f of files) {
    if (f === 'scripts/checks.json') {
      if (!before.manifest) return every('the manifest is new');
      if (JSON.stringify(before.manifest.shards) !== JSON.stringify(after.manifest.shards)) return every('the manifest\'s shards changed');
      add(diffEntries(before.manifest, after.manifest), 'the manifest\'s changed entries');
      continue;
    }
    if (f === 'package.json') {
      if (!before.pkg || !after.pkg) return every('package.json is new or gone');
      const rest = (p) => JSON.stringify({ ...p, scripts: undefined });
      if (rest(before.pkg) !== rest(after.pkg)) return every('package.json beyond its scripts');
      const sa = before.pkg.scripts ?? {}, sb = after.pkg.scripts ?? {};
      const names = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter((n) => sa[n] !== sb[n]);
      for (const n of names) {
        const cs = shardsRunning((c, m) => npmScriptsOf(c.run, m === before.manifest ? sa : sb).has(n));
        if (!cs.length) return every(`npm script ${n} is run by no check`);
        add(cs, `npm script ${n}`);
      }
      continue;
    }
    if (SHARED.includes(f)) return every(`${f} is shared by every app or lab check`);
    if (/^scripts\//.test(f)) {
      const scripts = after.pkg?.scripts ?? {};
      const cs = after.manifest.checks.filter((c) => reads(trace(entryFiles(c.run, scripts), root), f));
      if (!cs.length) return every(`${f} is traced by no check`);
      add(cs, f);
      continue;
    }
    return every(f);
  }
  return { shards: mac.filter((s) => sel.has(s)), why: why.join('; ') || 'nothing that reaches a Mac shard' };
}

// GitHub's workflow commands take their data with %, CR and LF escaped, and a
// property (the title) with : and , as well.
const escData = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escProp = (s) => escData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

/*
  One check, as a step ran it: `bash -e -c` (GitHub's default shell for a
  `run:`), from the repository's root, with the entry's env over the job's.
  Its own process group, so a timeout or a cancel ends Chromium and the
  servers it started, not only the shell. Output streams as it comes; the
  lines with FAIL in them are kept for the annotation.
*/
let current = null;
export function runOne(c, { onOut = (b) => process.stdout.write(b), onErr = (b) => process.stderr.write(b), env = {} } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn('bash', ['-e', '-c', c.run], {
      cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env, ...(c.env ?? {}) },
    });
    current = child;
    const fails = [];
    let tail = '';
    const keep = (buf) => {
      const text = tail + buf.toString();
      const lines = text.split('\n');
      tail = lines.pop();
      for (const l of lines) if (/\bFAIL\b/.test(l) && fails.length < 20) fails.push(l.trim());
    };
    child.stdout.on('data', (b) => { onOut(b); keep(b); });
    child.stderr.on('data', (b) => { onErr(b); keep(b); });
    let timedOut = false;
    const kill = (sig) => { try { process.kill(-child.pid, sig); } catch { /* gone */ } };
    const timer = c.timeout ? setTimeout(() => { timedOut = true; kill('SIGTERM'); setTimeout(() => kill('SIGKILL'), 10_000).unref(); }, c.timeout * 60_000) : null;
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (tail && /\bFAIL\b/.test(tail)) fails.push(tail.trim());
      current = null;
      resolve({ ok: code === 0 && !timedOut, code, signal, timedOut, fails, secs: (Date.now() - t0) / 1000 });
    });
  });
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    if (current) { try { process.kill(-current.pid, 'SIGKILL'); } catch { /* gone */ } }
    process.exit(130);
  });
}

const fmtSecs = (s) => (s >= 90 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : `${Math.round(s)} s`);

export async function runShard(shard, manifest = loadManifest()) {
  const list = manifest.checks.filter((c) => c.shard === shard);
  if (!list.length) {
    console.log(`::error title=No checks::shard ${shard} has no checks in the manifest (${[...manifest.shards.measure, ...manifest.shards.mac].join(', ')})`);
    return 1;
  }
  const results = [];
  for (const c of list) {
    console.log(`::group::Run ${c.run}`);
    const r = await runOne(c);
    console.log('::endgroup::');
    results.push({ c, r });
    const how = r.timedOut ? `stopped at its ${c.timeout}-minute timeout` : r.code != null ? `exit ${r.code}` : `ended by ${r.signal}`;
    if (r.ok) console.log(`✓ ${c.name}, ${fmtSecs(r.secs)}`);
    else {
      console.log(`✗ ${c.name}, red after ${fmtSecs(r.secs)} (${how})`);
      for (const l of r.fails) console.log(`    ✗ ${l}`);
      console.log(`::error title=${escProp(c.name)}::${escData([`${c.run}: ${how}`, ...r.fails].join('\n'))}`);
    }
  }
  const red = results.filter(({ r }) => !r.ok);
  const total = results.reduce((s, { r }) => s + r.secs, 0);
  console.log(`\n${results.length - red.length} of ${results.length} checks green on ${shard} in ${fmtSecs(total)}${red.length ? `; red: ${red.map(({ c }) => c.name).join('; ')}` : ''}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = results.map(({ c, r }) => `| ${r.ok ? '✓' : '✗'} | ${c.name.replace(/\|/g, '\\|')} | \`${c.run.replace(/\|/g, '\\|').replace(/`/g, "'")}\` | ${Math.round(r.secs)} |`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### ${shard}: ${results.length - red.length} of ${results.length} green, ${fmtSecs(total)}`, '', '| | check | command | s |', '|---|---|---|---:|', ...rows, ''].join('\n') + '\n');
  }
  return red.length ? 1 : 0;
}

/*
  `npm run checks`: the manifest, the workflow that runs it, and the rules.
  Each rule has the case it is for and a control beside it.
*/
async function selftest() {
  let bad = 0;
  const say = (ok, what) => { if (!ok) bad++; console.log(`${ok ? ' ok  ' : ' FAIL'} ${what}`); };
  const man = loadManifest();
  const scripts = pkgScripts();
  const all = [...man.shards.measure, ...man.shards.mac];
  say(true, `the manifest parses: ${man.checks.length} checks on ${all.length} shards (${all.map((s) => `${s} ${man.checks.filter((c) => c.shard === s).length}`).join(', ')})`);

  // Every npm script a check runs exists, and every file it starts.
  const missing = [];
  for (const c of man.checks) {
    for (const n of npmScriptsOf(c.run, scripts)) if (!scripts[n]) missing.push(`${c.name}: npm run ${n}`);
    for (const f of entryFiles(c.run, scripts)) if (!fs.existsSync(path.join(ROOT, f))) missing.push(`${c.name}: ${f}`);
  }
  say(!missing.length, `every check's npm scripts and files exist${missing.length ? `; missing ${missing.slice(0, 5).join(', ')}` : ''}`);

  // The workflow runs the manifest and nothing beside it. A harness written
  // as its own step again would run outside the selection and the summary.
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/checks.yml'), 'utf8');
  const part = /^\s+part: \[([^\]]*)\]\s*$/m.exec(wf)?.[1]?.split(',').map((s) => s.trim());
  say(JSON.stringify(part) === JSON.stringify(man.shards.measure), `Measure's matrix is the manifest's measure shards (${part?.join(', ')})`);
  say(/^\s+shard: \$\{\{ fromJSON\(needs\.reach\.outputs\.shards\) \}\}\s*$/m.test(wf), 'the Mac matrix is the shards reach selected');
  say(/run: node scripts\/checks\.mjs --ci \$\{\{ matrix\.part \}\}/.test(wf) && /run: node scripts\/checks\.mjs --ci \$\{\{ matrix\.shard \}\}/.test(wf), 'Measure and the Mac run their shard from the manifest');
  // The workflow's own tools (which files reach, the runner, the guard on a
  // PR's bars) are also checks with a selftest; their CI uses are not.
  const TOOLS = ['scripts/reach.mjs', 'scripts/checks.mjs', 'scripts/checkguard.mjs'];
  const ran = new Set(man.checks.flatMap((c) => [...entryFiles(c.run, scripts)]).filter((f) => !TOOLS.includes(f)));
  const npmRan = new Set(man.checks.flatMap((c) => [...npmScriptsOf(c.run, {})]));
  const stray = [...wf.matchAll(/^\s+(?:- )?run: (.*)$/gm)].map((m) => m[1])
    .filter((r) => [...entryFiles(r, scripts)].some((f) => ran.has(f)) || [...npmScriptsOf(r, {})].some((n) => npmRan.has(n)));
  say(!stray.length, `no step in checks.yml runs a check's script itself${stray.length ? `: ${stray.join('; ')}` : ''}`);

  // The trace holds every script esbuild finds each check importing.
  let esbuild = null;
  try { esbuild = await import('esbuild'); } catch { /* not installed */ }
  if (!esbuild) say(false, 'esbuild is installed, to hold the trace to its metafile (npm ci)');
  else {
    const short = [];
    const files = new Set(man.checks.flatMap((c) => [...entryFiles(c.run, scripts)].filter((f) => /\.(mjs|js|ts)$/.test(f))));
    const metas = await metafilesOf(esbuild, [...files]);
    for (const f of files) {
      const meta = metas.get(f);
      if (!meta) continue;
      const t = trace([f]);
      for (const i of meta) if (/^(scripts|server)\//.test(i) && !t.has(i)) short.push(`${f} imports ${i}`);
    }
    say(!short.length, `the trace finds every script esbuild finds each of ${files.size} check scripts importing${short.length ? `; it missed ${short.slice(0, 5).join(', ')}` : ''}`);
  }

  // The selection, on the real manifest and scripts.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const now = { manifest: man, pkg };
  const pick = (files, before = now, after = now) => selectShards(files, { before, after }).shards.join(',');
  const shardOf = (script) => [...new Set(man.checks.filter((c) => entryFiles(c.run, scripts).has(script)).map((c) => c.shard))];
  const allMac = man.shards.mac.join(',');
  const tools = shardOf('scripts/tools.mjs');
  say(tools.length === 1 && man.shards.mac.includes(tools[0]) && pick(['scripts/tools.mjs']) === tools[0], `a Mac check's own script selects its shard alone (tools.mjs: ${pick(['scripts/tools.mjs'])})`);
  const deskShards = shardOf('scripts/desk.mjs');
  say(deskShards.every((s) => man.shards.measure.includes(s)) && pick(['scripts/desk.mjs']) === '', `a Measure check's script selects no Mac shard (desk.mjs: '${pick(['scripts/desk.mjs'])}')`);
  say(pick(['scripts/frame.mjs']) === allMac, 'a shared helper (frame.mjs) selects every shard');
  say(pick(['scripts/checks.mjs']) === allMac, 'this file selects every shard');
  say(pick(['scripts/nothing-reads-this.mjs']) === allMac, 'a script no check traces selects every shard');
  say(pick(['src/gpu/fluid.ts']) === allMac, 'a source file selects every shard');
  say(pick(['.github/workflows/checks.yml']) === allMac, 'the workflow selects every shard');
  say(pick(['scripts/tools.mjs', 'src/presets.ts']) === allMac, 'a check script with a source file selects every shard');
  const twoShards = man.checks.filter((c) => man.shards.mac.includes(c.shard));
  const a = twoShards[0], b = twoShards.find((c) => c.shard !== a.shard);
  const ab = [a.shard, b.shard].sort((x, y) => man.shards.mac.indexOf(x) - man.shards.mac.indexOf(y)).join(',');
  const firstFile = (c) => [...entryFiles(c.run, scripts)][0];
  say(pick([firstFile(a), firstFile(b)]) === ab, `two checks' scripts on two shards select those two (${ab})`);

  // The manifest's own diff.
  const edit = (fn) => { const m = structuredClone(man); fn(m); return { manifest: m, pkg }; };
  const iTools = man.checks.findIndex((c) => c.shard === tools[0]);
  const mac2 = man.shards.mac.find((s) => s !== tools[0]);
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks[iTools].why = ['reworded']; })) === '', 'an entry whose why alone changed selects nothing');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks[iTools].timeout = 9; })) === tools[0], 'an entry whose timeout changed selects its shard');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks[iTools].shard = mac2; })) === man.shards.mac.filter((s) => s === tools[0] || s === mac2).join(','), 'an entry that moves selects its old shard and its new one');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks.push({ name: 'A new one', shard: mac2, run: 'node scripts/tools.mjs' }); })) === mac2, 'a new entry selects its shard');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks.splice(iTools, 1); })) === tools[0], 'a removed entry selects the shard it was on');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks.push({ name: 'A new one', shard: 'logic', run: 'npm run desk' }); })) === '', 'a new Measure entry selects no Mac shard');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.shards.mac = [...m.shards.mac, 'sixth']; m.checks.push({ name: 'x', shard: 'sixth', run: 'true' }); })).split(',').length === man.shards.mac.length + 1, 'a new shard selects every shard');
  say(pick(['scripts/checks.json'], { manifest: null, pkg }, now) === allMac, 'a manifest that is new selects every shard');

  // package.json.
  const npmOf = (c) => [...npmScriptsOf(c.run, scripts)][0];
  const macNpm = man.checks.find((c) => man.shards.mac.includes(c.shard) && npmOf(c) && man.checks.filter((d) => npmScriptsOf(d.run, scripts).has(npmOf(c))).every((d) => d.shard === c.shard));
  const withScript = (name, cmd) => ({ manifest: man, pkg: { ...pkg, scripts: { ...pkg.scripts, [name]: cmd } } });
  say(pick(['package.json'], now, withScript(npmOf(macNpm), `${scripts[npmOf(macNpm)]} --again`)) === macNpm.shard, `a changed npm script a check runs selects that check's shard (${npmOf(macNpm)}: ${macNpm.shard})`);
  say(pick(['package.json'], now, withScript('by-hand-only', 'node scripts/macqueue.mjs')) === allMac, 'a new npm script no check runs selects every shard');
  say(pick(['package.json'], now, { manifest: man, pkg: { ...pkg, dependencies: { ...pkg.dependencies, 'left-pad': '1.0.0' } } }) === allMac, 'a changed dependency selects every shard');
  say(pick(['package.json', 'scripts/checks.json'], now, (() => { const m = structuredClone(man); m.checks.push({ name: 'A new one', shard: mac2, run: ['npm', 'run', 'brand-new'].join(' ') }); return { manifest: m, pkg: { ...pkg, scripts: { ...pkg.scripts, 'brand-new': 'node scripts/tools.mjs' } } }; })()) === mac2, 'a new check with its new npm script selects its shard');

  // The runner: a green check, a red one with its FAIL line kept, a timeout
  // that ends a child the shell started, and the group header flakes.mjs reads.
  const fake = parseManifest(JSON.stringify({
    shards: { measure: ['m'], mac: ['x'] },
    checks: [
      { name: 'green', shard: 'm', run: 'echo ok fine' },
      { name: 'red', shard: 'm', run: 'echo "FAIL the thing: 1 against 2"; exit 3' },
      { name: 'slow', shard: 'm', run: 'sleep 30 & wait', timeout: 0.02 },
      { name: 'env', shard: 'm', run: 'test "$CHECKS_SELFTEST" = yes', env: { CHECKS_SELFTEST: 'yes' } },
      { name: 'other', shard: 'x', run: 'true' },
    ],
  }));
  const log = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (b, ...r) => { log.push(String(b)); return true; };
  let code;
  try { code = await runShard('m', fake); } finally { process.stdout.write = write; }
  const text = log.join('');
  say(code === 1, `a shard with a red check is red (exit ${code})`);
  say(/::group::Run echo ok fine\n/.test(text) && /✓ green/.test(text), 'a check runs in a group headed "Run <command>", as a step\'s log is');
  say(/::error title=red::.*FAIL the thing%3A 1 against 2|::error title=red::[^\n]*FAIL the thing: 1 against 2/.test(text), 'a red check is an error annotation with its FAIL line');
  say(/✗ slow, red after \d+ s \(stopped at its 0.02-minute timeout\)/.test(text), 'a check past its timeout is stopped and red');
  say(/✓ env/.test(text), 'a check gets its own env');
  say(!/other/.test(text), 'only the shard asked for runs');
  say(!/^\S*\s*(ok|FAIL)\s+(green|red|slow)/m.test(text), 'the runner\'s own lines never read as a harness\'s ok or FAIL line to flakes.mjs');
  if (bad) { console.log(`\n${bad} FAIL`); process.exit(1); }
  console.log('\nall ok');
}

// The files esbuild bundles for each script, as a map from the script to its
// inputs. One build for all of them, which is a second or two where one
// build each took a minute and a half; a script esbuild cannot bundle is left
// out of the map.
const ESBUILD = {
  bundle: true, write: false, metafile: true, logLevel: 'silent', format: 'esm', packages: 'external',
  absWorkingDir: ROOT, outdir: path.join(ROOT, 'scratch', 'checks-meta'), outbase: ROOT,
  loader: { '.wgsl': 'text', '.png': 'empty', '.jpg': 'empty', '.svg': 'empty', '.css': 'empty', '.wav': 'empty', '.mp3': 'empty' },
  plugins: [{
    // Most harnesses bundle their part of src/ with esbuild at run time and
    // then `import(`../${out}`)`, a path esbuild would expand by globbing the
    // whole repository, `.git/` too (87 s, then a failed build). What such a
    // script reads from src/ is the entry it names as a string, which the
    // trace and `quick.mjs` follow; the import of its own output is not.
    name: 'built-at-run-time', setup(b) {
      b.onLoad({ filter: /[\\/]scripts[\\/][^\\/]+\.m?js$/ }, (a) => ({
        contents: fs.readFileSync(a.path, 'utf8').replace(/\bimport\(`([^`]*)`\)/g, 'import(String(`$1`))'), loader: 'js',
      }));
    },
  }, {
    // Vite's `?raw` and `?url` imports: the file is read, so it counts.
    name: 'query', setup(b) {
      b.onResolve({ filter: /\?(raw|url|inline|worker)$/ }, (a) => ({ path: path.resolve(a.resolveDir, a.path.replace(/\?.*$/, '')), namespace: 'query' }));
      b.onLoad({ filter: /.*/, namespace: 'query' }, () => ({ contents: 'export default ""', loader: 'js' }));
    },
  }],
};
export async function metafilesOf(esbuild, files, platform = 'node') {
  const out = new Map();
  const norm = (i) => { const p = i.replace(/^query:/, ''); return path.isAbsolute(p) ? path.relative(ROOT, p) : p; };
  const build = async (list) => {
    const r = await esbuild.build({ ...ESBUILD, platform, entryPoints: list.map((f) => path.join(ROOT, f)) });
    for (const o of Object.values(r.metafile.outputs)) {
      if (!o.entryPoint) continue;
      out.set(norm(o.entryPoint), Object.keys(o.inputs).map(norm));
    }
  };
  // Halves until the scripts that break it are alone, and left out (a
  // dynamic import of a path built at run time makes esbuild read every file
  // that could match, `.git/` among them).
  const tryBuild = async (list) => {
    try { await build(list); } catch {
      if (list.length > 1) { const h = list.length >> 1; await tryBuild(list.slice(0, h)); await tryBuild(list.slice(h)); }
    }
  };
  await tryBuild(files);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const at = process.argv.indexOf('--ci');
  if (at >= 0) process.exit(await runShard(process.argv[at + 1]));
  else if (process.argv.includes('--list')) {
    const man = loadManifest();
    for (const s of [...man.shards.measure, ...man.shards.mac]) {
      console.log(s);
      for (const c of man.checks.filter((c) => c.shard === s)) console.log(`  ${c.name.padEnd(56)} ${c.run}`);
    }
  } else await selftest();
}
