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
// for the files that reach a Mac shard at all). Measure's own selection
// (`selectMeasure`, below) is separate: in full, unless the diff is only check
// scripts, entries, npm scripts and documents. Anything this cannot show is
// every shard:
//   - a script under `scripts/` selects the shards of the checks that run it
//     or import it (traced below), and nothing if they are all in Measure;
//     one that no check traces (a fixture read by a name built at run time,
//     a new helper) selects every shard, as do the helpers every app or lab
//     check shares (`SHARED`) and this file;
//   - `scripts/checks.json` selects the shards of the entries it adds,
//     removes or changes, both the old and the new shard of one that moves,
//     and none for an entry whose `why` alone changed; the order the entries
//     run in within one shard is part of an entry (a build before the check
//     that reads it), so a shard whose entries were reordered is selected; a
//     change to the shard lists selects every shard, and one to the manifest's
//     prose (`about`) selects none;
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

import { spawn, spawnSync, execFileSync } from 'node:child_process';
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
    if (c.always != null && c.always !== true) bad(`${at}'s always is not true`);
    if (c.always && !measure.includes(c.shard)) bad(`${at} is always but not on a Measure shard`);
    if (c.why != null && !(Array.isArray(c.why) && c.why.every((l) => typeof l === 'string'))) bad(`${at}'s why is not a list of lines`);
    const extra = Object.keys(c).filter((k) => !['name', 'shard', 'run', 'env', 'timeout', 'why', 'always'].includes(k));
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
        if (/^(scripts|src|public|docs|server|\.claude)\//.test(s) || /^[A-Z]+\.md$/.test(s)) cands.push(path.normalize(s));
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

// The entries that differ between two manifests: added, removed or changed in
// anything but `why`, and, for a shard whose surviving entries run in another
// order, those entries (a reorder is not a prose edit: a check that builds
// what the next one reads, or holds a port the next one wants, moved).
export function diffEntries(before, after) {
  const key = (c) => `${c.shard}\u0000${c.name}`;
  const body = (c) => JSON.stringify({ ...c, why: undefined });
  const a = new Map(before.checks.map((c) => [key(c), c]));
  const b = new Map(after.checks.map((c) => [key(c), c]));
  const changed = [];
  for (const [k, c] of a) if (!b.has(k) || body(b.get(k)) !== body(c)) changed.push(c);
  for (const [k, c] of b) if (!a.has(k) || body(a.get(k)) !== body(c)) changed.push(c);
  const order = (m, shard, keep) => m.checks.filter((c) => c.shard === shard && keep.has(key(c))).map(key);
  for (const shard of new Set(after.checks.map((c) => c.shard))) {
    const keep = new Set([...b.keys()].filter((k) => a.has(k)));
    if (order(before, shard, keep).join('\n') !== order(after, shard, keep).join('\n')) changed.push(...after.checks.filter((c) => c.shard === shard && keep.has(key(c))));
  }
  return changed;
}

/*
  The checks a diff selects. `before` and `after` are { manifest, pkg } at the
  PR's base and its merge: the manifest parsed, package.json parsed, or null
  where the file is absent. Returns { all, hit, why }: `all` when any file
  cannot be placed (then `hit` is not read), else `hit`, the entries of either
  manifest the files reach (a removed or moved entry is in it by its old
  shard). `docs` is for the files Measure is asked about that the Mac never
  is (`reach.mjs` filters those out of the Mac's list first): a Markdown file,
  the sessions' `.claude/`, a file under docs/ select the checks that read
  them, found by the trace as a script's are, and none if no check does.
*/
// Not a Markdown file anywhere: one under src/ or public/ is the site's.
const DOC = /^[^/]+\.md$|^docs\/|^\.claude\/|^LICENSE[^/]*$/;
function selectCore(files, { before, after, root = ROOT, docs = false }) {
  const hit = [];
  const why = [];
  const every = (w) => ({ all: true, hit: [], why: `every check: ${w}` });
  const running = (pred) => {
    const out = [];
    for (const m of [before.manifest, after.manifest]) for (const c of m?.checks ?? []) if (pred(c, m)) out.push(c);
    return out;
  };
  const add = (cs, what) => {
    hit.push(...cs);
    const s = [...new Set(cs.map((c) => c.shard))];
    why.push(`${what}: ${s.length ? s.join(', ') : 'no check'}`);
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
        const cs = running((c, m) => npmScriptsOf(c.run, m === before.manifest ? sa : sb).has(n));
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
    if (docs && DOC.test(f)) {
      const scripts = after.pkg?.scripts ?? {};
      add(after.manifest.checks.filter((c) => reads(trace(entryFiles(c.run, scripts), root), f)), f);
      continue;
    }
    return every(f);
  }
  return { all: false, hit, why: why.join('; ') || 'nothing that reaches a check' };
}

// The Mac shards a diff selects, of the files that reach one (`reach.mjs`
// filters the rest first). Every shard when any file cannot be placed.
export function selectShards(files, ctx) {
  const mac = ctx.after.manifest.shards.mac;
  const r = selectCore(files, ctx);
  if (r.all) return { shards: [...mac], why: r.why };
  const sel = new Set(r.hit.map((c) => c.shard));
  return { shards: mac.filter((s) => sel.has(s)), why: r.why };
}

/*
  Measure's selection (PLAN.md 19k-4), of every file the PR changed. Not "all"
  unless the diff is only check scripts, the manifest's entries, the npm
  scripts checks run, and documents; src/, public/, a workflow, the lockfile
  or a script no check traces runs Measure in full, as it always did. What is
  selected is the checks that read the files, and those marked `always` (the
  cheap ones that hold the rest: the typecheck, that every script parses,
  that the manifest and the workflow agree). Returns { all, names, parts, why },
  `names` the entries to run and `parts` the Measure parts that have any.
*/
export function selectMeasure(files, ctx) {
  const m = ctx.after.manifest;
  const measure = m.shards.measure;
  const r = selectCore(files, { ...ctx, docs: true });
  if (r.all) return { all: true, names: [], parts: [...measure], why: r.why };
  const keys = new Set(r.hit.map((c) => `${c.shard}\u0000${c.name}`));
  const picked = m.checks.filter((c) => measure.includes(c.shard) && (c.always || keys.has(`${c.shard}\u0000${c.name}`)));
  return {
    all: false,
    names: [...new Set(picked.map((c) => c.name))],
    parts: measure.filter((s) => picked.some((c) => c.shard === s)),
    why: `${r.why}; ${picked.length} of ${m.checks.filter((c) => measure.includes(c.shard)).length} Measure checks`,
  };
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
// How long the pipes may stay open after the shell has exited.
export const DRAIN_MS = 3000;
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
    // Done when the shell has exited and its pipes have closed. 'close' alone
    // waits on the pipes, and a grandchild that outlives the shell (a server a
    // check started and never stopped) holds them open, which hung the shard
    // until the check's timeout with every line already printed. So the shell's
    // exit starts a short drain; past it the pipes are let go and whatever
    // still holds them is ended with the group, so it cannot hold a port or
    // the cores for the next check either.
    let done = false;
    const finish = (code, signal) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (tail && /\bFAIL\b/.test(tail)) fails.push(tail.trim());
      current = null;
      resolve({ ok: code === 0 && !timedOut, code, signal, timedOut, fails, secs: (Date.now() - t0) / 1000 });
    };
    let drain = null;
    child.on('close', (code, signal) => { if (drain) clearTimeout(drain); finish(code, signal); });
    child.on('exit', (code, signal) => {
      drain = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        kill('SIGKILL');
        finish(code, signal);
      }, DRAIN_MS);
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

// `only`: the names of the checks to run (reach.mjs's Measure selection,
// CHECKS_ONLY in the job), or null for all of them. The rest are named in a
// notice, so a log never shows a check missing without saying it was left out.
export async function runShard(shard, manifest = loadManifest(), only = process.env.CHECKS_ONLY ? JSON.parse(process.env.CHECKS_ONLY) : null) {
  const all = manifest.checks.filter((c) => c.shard === shard);
  const list = only ? all.filter((c) => only.includes(c.name)) : all;
  if (only && list.length < all.length) {
    const left = all.filter((c) => !list.includes(c));
    console.log(`::notice title=${escProp(`${shard}: ${left.length} of ${all.length} checks left out`)}::${escData(`This change reaches no file they read (PLAN.md 19k-4): ${left.map((c) => c.name).join('; ')}`)}`);
  }
  if (!all.length) {
    console.log(`::error title=No checks::shard ${shard} has no checks in the manifest (${[...manifest.shards.measure, ...manifest.shards.mac].join(', ')})`);
    return 1;
  }
  if (!list.length) {
    console.log(`${shard}: none of its ${all.length} checks is reached by this change`);
    return 0;
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
  say(/^\s+part: \$\{\{ fromJSON\(needs\.reach\.outputs\.parts\) \}\}\s*$/m.test(wf), 'Measure\'s matrix is the parts reach selected (the manifest\'s measure shards unless the diff is only checks and documents)');
  say(/CHECKS_ONLY: \$\{\{ needs\.reach\.outputs\.only \}\}/.test(wf), 'and the names reach selected are passed to the part\'s runner');
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
  const iA = man.checks.findIndex((c) => c.shard === tools[0]);
  const iB = man.checks.findIndex((c, i) => i > iA && c.shard === tools[0]);
  say(pick(['scripts/checks.json'], now, edit((m) => { [m.checks[iA], m.checks[iB]] = [m.checks[iB], m.checks[iA]]; })) === tools[0], `two entries swapped within a shard select that shard (${tools[0]}): the order they run in is part of them`);
  say(pick(['scripts/checks.json'], now, edit((m) => { const [x] = m.checks.splice(iA, 1); m.checks.push(x); m.checks.sort((p, q) => (p.shard === q.shard ? 0 : man.shards.mac.concat(man.shards.measure).indexOf(p.shard) - man.shards.mac.concat(man.shards.measure).indexOf(q.shard))); })) === tools[0], 'an entry moved to the end of its shard selects it');
  const rawText = fs.readFileSync(MANIFEST, 'utf8');
  const withAbout = { manifest: parseManifest(JSON.stringify({ ...JSON.parse(rawText), about: ['one more line of prose'] })), pkg };
  say(JSON.parse(rawText).about?.length > 0 && pick(['scripts/checks.json'], now, withAbout) === '', 'the manifest\'s prose (about) alone selects nothing');
  say(pick(['scripts/checks.json'], now, edit((m) => { m.checks.reverse(); })) === allMac, 'every shard reordered selects every shard');

  // Measure's selection (19k-4).
  const mctx = (b = now, a = now) => ({ before: b, after: a });
  const mpick = (files, b, a) => selectMeasure(files, mctx(b, a));
  const alwaysNames = man.checks.filter((c) => c.always).map((c) => c.name);
  const m1 = mpick(['scripts/desk.mjs']);
  say(!m1.all && man.checks.filter((c) => c.name !== undefined && man.shards.measure.includes(c.shard) && entryFiles(c.run, scripts).has('scripts/desk.mjs')).every((c) => m1.names.includes(c.name)) && alwaysNames.every((n) => m1.names.includes(n)), `a Measure check's script selects that check and the always ones (${m1.names.length} of ${man.checks.filter((c) => man.shards.measure.includes(c.shard)).length}: ${m1.parts.join(', ')})`);
  say(m1.names.length < 20, 'and not the rest of Measure');
  say(alwaysNames.length >= 3 && alwaysNames.every((n) => man.checks.some((c) => c.name === n && man.shards.measure.includes(c.shard))), `the always checks are on Measure (${alwaysNames.join('; ')})`);
  const readSet = new Set(man.checks.flatMap((c) => [...trace(entryFiles(c.run, scripts))]));
  const unread = fs.readdirSync(path.join(ROOT, 'docs')).map((f) => `docs/${f}`).find((f) => f.endsWith('.md') && !readSet.has(f));
  say(unread && mpick([unread]).names.join() === alwaysNames.join(), `a document no check reads selects only the always checks (${unread})`);
  // A check that walks a whole folder at run time reads files the trace
  // cannot name, so a PR that changes one of them must still run it: those
  // checks are `always`. The patterns find a walk of scripts/ (the panel's
  // phantom `npm run`, the plate's retired look); a check that reads src/ the
  // same way is reached by any diff that changes src/, which is Measure in full.
  // A walk names scripts/ as a quoted segment, or as the tail of a template or
  // a concatenation (`${ROOT}/scripts`, ROOT + '/scripts'): any text after the
  // call's open bracket on the same statement that has "scripts" between
  // quotes or slashes, so nested brackets (join(process.cwd(), 'scripts'),
  // join(dirname(x), '..', 'scripts')) count. It can over-match a later
  // argument on the line, which only makes a check `always`; it cannot see a
  // walk whose path is built in a variable first, so a walk of that kind is
  // still for the reader of the check to name.
  const WALKS = /\b(?:walk|readdirSync|readdir)\([^;\n]*?[\/'"`]scripts[\/'"`]/;
  say(WALKS.test("walk('scripts')") && WALKS.test("walk(join(root, 'scripts'))") && WALKS.test("walk(`${ROOT}/scripts`)") && WALKS.test("readdirSync(ROOT + '/scripts/')") && !WALKS.test("walk('src')") && WALKS.test("walk(join(process.cwd(), 'scripts'))") && WALKS.test("readdirSync(join(dirname(x), '..', 'scripts'))") && !WALKS.test("walk(join(root, 'src')), walk(join(root, 'lib'))") && !WALKS.test("walk(join(root, 'src'));\nconst s = 'scripts/';") && !WALKS.test("path.join('scripts', 'x.mjs')"), 'the walk detector finds a walk of scripts/ in every spelling in use (nested brackets too), and not a walk of src/ or a path');
  const walkers = man.checks.filter((c) => man.shards.measure.includes(c.shard) && [...trace(entryFiles(c.run, scripts))].some((f) => /^scripts\//.test(f) && /\.(mjs|js)$/.test(f) && f !== 'scripts/checks.mjs' && WALKS.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  say(walkers.length >= 2 && walkers.every((c) => c.always), `every Measure check that walks scripts/ is always (${walkers.map((c) => `${c.name}${c.always ? '' : ' NOT'}`).join('; ')})`);
  say(mpick(['scripts/tools.mjs']).names.includes('The panel') && mpick(['scripts/tools.mjs']).names.includes('The plate'), 'so a Mac check\'s script still runs the panel (a phantom npm run) and the plate');
  say(mpick(['CLAUDE.md']).names.includes('What a change reaches'), 'and a document a check names without a folder (CLAUDE.md, in what a change reaches) selects that check');
  const read = man.checks.find((c) => trace(entryFiles(c.run, scripts)).has('docs/handoff.md') && man.shards.measure.includes(c.shard));
  say(!read || mpick(['docs/handoff.md']).names.includes(read.name), `a document a check reads selects that check${read ? ` (docs/handoff.md: ${read.name})` : ''}`);
  say(mpick(['src/gpu/fluid.ts']).all, 'a source file runs Measure in full');
  say(mpick(['public/video/cartoons/SOURCES.md']).all, 'and a Markdown file of the site\'s own does too');
  say(mpick(['scripts/tools.mjs', 'src/presets.ts']).all, 'a check script with a source file does');
  say(mpick(['scripts/frame.mjs']).all && mpick(['scripts/checks.mjs']).all, 'a shared helper, and this file, do');
  say(mpick(['scripts/nothing-reads-this.mjs']).all, 'a script no check traces does');
  say(mpick(['.github/workflows/checks.yml']).all, 'a workflow does');
  say(mpick(['package.json'], now, { manifest: man, pkg: { ...pkg, dependencies: { ...pkg.dependencies, 'left-pad': '1.0.0' } } }).all, 'a changed dependency does');
  say(mpick(['scripts/checks.json'], now, edit((m) => { m.checks[0].timeout = 9; })).names.includes(man.checks[0].name), 'a changed Measure entry selects itself');
  say(mpick(['scripts/checks.json'], { manifest: null, pkg }, now).all, 'a new manifest does');

  // package.json.
  const npmOf = (c) => [...npmScriptsOf(c.run, scripts)][0];
  const macNpm = man.checks.find((c) => man.shards.mac.includes(c.shard) && npmOf(c) && man.checks.filter((d) => npmScriptsOf(d.run, scripts).has(npmOf(c))).every((d) => d.shard === c.shard));
  const withScript = (name, cmd) => ({ manifest: man, pkg: { ...pkg, scripts: { ...pkg.scripts, [name]: cmd } } });
  say(pick(['package.json'], now, withScript(npmOf(macNpm), `${scripts[npmOf(macNpm)]} --again`)) === macNpm.shard, `a changed npm script a check runs selects that check's shard (${npmOf(macNpm)}: ${macNpm.shard})`);
  say(pick(['package.json'], now, withScript('by-hand-only', 'node scripts/macqueue.mjs')) === allMac, 'a new npm script no check runs selects every shard');
  say(pick(['package.json'], now, { manifest: man, pkg: { ...pkg, dependencies: { ...pkg.dependencies, 'left-pad': '1.0.0' } } }) === allMac, 'a changed dependency selects every shard');
  say(pick(['package.json', 'scripts/checks.json'], now, (() => { const m = structuredClone(man); m.checks.push({ name: 'A new one', shard: mac2, run: ['npm', 'run', 'brand-new'].join(' ') }); return { manifest: m, pkg: { ...pkg, scripts: { ...pkg.scripts, 'brand-new': 'node scripts/tools.mjs' } } }; })()) === mac2, 'a new check with its new npm script selects its shard');

  // The deploy gate's reading of a run that was only partly measured
  // (19k-4) fails closed: its `api` replaced by a stub, the function itself
  // taken out of deploygate.sh. A failed call or a run with no reach job is
  // "partial", never "ran in full".
  const gate = fs.readFileSync(path.join(ROOT, 'scripts/deploygate.sh'), 'utf8');
  const fn = /^measurepartial\(\) \{[\s\S]*?^\}/m.exec(gate)?.[0];
  const ask = (api) => {
    const r = spawnSync('bash', ['-c', `${api}\n${fn}\nmeasurepartial 7`], { encoding: 'utf8' });
    return r.stdout.trim();
  };
  const jobs = (extra = '') => `{"jobs":[{"name":"Measure · logic","id":1},{"name":"What the change reaches","id":2${extra}}]}`;
  if (!fn) say(false, 'deploygate.sh has measurepartial, to be held to failing closed');
  else {
    const stub = (jobsOut, notesOut) => `api() { case "$1" in actions/runs/*) ${jobsOut};; check-runs/*) ${notesOut};; esac; }`;
    const ok = jobs();
    say(ask(stub(`echo '${ok}'`, `echo '[{"title":"measure","message":"partial: 6 checks in logic"}]'`)).startsWith('partial'), 'a run whose reach job said partial is partial');
    say(ask(stub(`echo '${ok}'`, `echo '[{"title":"carried","message":"x"}]'`)) === '', 'a run whose reach job said nothing of it ran in full');
    say(ask(stub('return 22', 'echo []')).startsWith('partial'), 'a run whose jobs cannot be read is partial (fails closed)');
    say(ask(stub(`echo '${ok}'`, 'return 22')).startsWith('partial'), 'a run whose annotations cannot be read is partial');
    say(ask(stub(`echo '${ok}'`, `echo '<html>502 Bad Gateway</html>'`)).startsWith('partial'), 'a run whose annotations are not JSON is partial, not a full run');
    say(ask(stub(`echo '${ok}'`, `echo ''`)).startsWith('partial'), 'a run whose annotations body is empty is partial, not a full run');
    say(ask(stub(`echo '${ok}'`, `echo '{"message":"rate limited"}'`)).startsWith('partial'), 'a run whose annotations are an error object is partial');
    say(ask(stub(`echo '{"jobs":[{"name":"Measure · logic","id":1}]}'`, 'echo []')).startsWith('partial'), 'a run with no reach job is partial');
    say(ask(stub(`echo 'not json'`, 'echo []')).startsWith('partial'), 'a run whose jobs are not JSON is partial');
  }

  // The runner: a green check, a red one with its FAIL line kept, a timeout
  // that ends a child the shell started, and the group header flakes.mjs reads.
  const fake = parseManifest(JSON.stringify({
    shards: { measure: ['m'], mac: ['x'] },
    checks: [
      { name: 'green', shard: 'm', run: 'echo ok fine' },
      { name: 'red', shard: 'm', run: 'echo "FAIL the thing: 1 against 2"; exit 3' },
      { name: 'slow', shard: 'm', run: 'sleep 30 & wait', timeout: 0.02 },
      { name: 'env', shard: 'm', run: 'test "$CHECKS_SELFTEST" = yes', env: { CHECKS_SELFTEST: 'yes' } },
      // A server the check started and never stopped: the shell exits, the
      // pipes stay open. 'close' alone waited out the whole timeout.
      { name: 'lingers', shard: 'm', run: 'sleep 31.7 & echo started', timeout: 5 },
      { name: 'other', shard: 'x', run: 'true' },
    ],
  }));
  const log = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (b, ...r) => { log.push(String(b)); return true; };
  let code;
  /*
    `null` for the selection, not runShard's default. The default reads
    CHECKS_ONLY, which CI sets on a PR whose diff reaches only some Measure
    checks (19k-4), and then names this run's own checks, none of which is
    `green` or `red`: the fake shard ran nothing and exited 0, so on a
    check-only PR this self-test went red on six lines that say nothing about
    the runner (#513's logic part, reproduced here with CHECKS_ONLY set).
  */
  try { code = await runShard('m', fake, null); } finally { process.stdout.write = write; }
  const text = log.join('');
  say(code === 1, `a shard with a red check is red (exit ${code})`);
  say(/::group::Run echo ok fine\n/.test(text) && /✓ green/.test(text), 'a check runs in a group headed "Run <command>", as a step\'s log is');
  say(/::error title=red::.*FAIL the thing%3A 1 against 2|::error title=red::[^\n]*FAIL the thing: 1 against 2/.test(text), 'a red check is an error annotation with its FAIL line');
  say(/✗ slow, red after \d+ s \(stopped at its 0.02-minute timeout\)/.test(text), 'a check past its timeout is stopped and red');
  say(/✓ env/.test(text), 'a check gets its own env');
  const lingered = /✓ lingers, (\d+) s/.exec(text);
  say(lingered && Number(lingered[1]) <= DRAIN_MS / 1000 + 2, `a grandchild holding the pipes does not hold the check (green after ${lingered?.[1]} s, not its 5-minute timeout)`);
  let left = '';
  try { left = execFileSync('pgrep', ['-f', 'sleep 31.7'], { encoding: 'utf8' }).trim(); } catch { /* none */ }
  say(left === '', 'and it is ended with the check\'s group, so it holds no port for the next');
  say(!/other/.test(text), 'only the shard asked for runs');
  say(!/^\S*\s*(ok|FAIL)\s+(green|red|slow)/m.test(text), 'the runner\'s own lines never read as a harness\'s ok or FAIL line to flakes.mjs');
  if (bad) { console.log(`\n${bad} FAIL`); process.exitCode = 1; return; }
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
  if (at >= 0) process.exitCode = await runShard(process.argv[at + 1]);
  else if (process.argv.includes('--list')) {
    const man = loadManifest();
    for (const s of [...man.shards.measure, ...man.shards.mac]) {
      console.log(s);
      for (const c of man.checks.filter((c) => c.shard === s)) console.log(`  ${c.name.padEnd(56)} ${c.run}`);
    }
  } else await selftest();
}
