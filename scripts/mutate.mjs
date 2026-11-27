// The mutation run: known faults put back one at a time, and which checks
// catch each (PLAN.md 50i).
//
//   npm run mutate                    every fault in scripts/mutants.json, in a tree of its own
//   npm run mutate -- --only <id>     one fault (or several: --only a,b)
//   npm run mutate -- --full          every check a fault reaches, not only until one catches it
//   npm run mutate -- --app           also the checks that serve the app (the Mac's: Metal's frames)
//   npm run mutate -- --ref <ref>     the tree at another commit (default HEAD)
//   npm run mutate -- --out <dir>     where the report goes (default scratch/mutate)
//   npm run mutate -- --dry           which checks each fault reaches, and run none
//   node scripts/mutate.mjs --self    the runner's own test (a check, in `logic`)
//
// Weekly on the owner's Mac through the film queue (scripts/mutate-weekly.sh,
// installed by scripts/mutate-install.sh). Not a check and never a gate: a
// report, as bugbash is.
//
// Why. About 265 checks hold this repository, and every one of them was
// written against a fault somebody saw. Nothing showed that they still can
// fail: a check whose input moved (a renamed hook, a look's id, a setting's
// default) keeps printing ok on code it no longer reads, and green looks the
// same whether the feature works or the check went blind. The owner's own
// words for what that costs, 2026-11-22 and again 11-26: the flower came
// back on a checkout that had the fix, past a check that was green. The only
// way to know a check can fail is to make the fault and watch it.
//
// So scripts/mutants.json holds faults this repository has really had, each
// the one line a merged fix changed, written back the old way in today's
// code (`find` the text as it is, `replace` the fault). For each fault, in a
// worktree of its own (scripts/mutate-tree.sh: a fault in the owner's
// checkout, or a bundle built from it into a shared node_modules/.cache,
// could reach a session that is not this one):
//   1. `find` must be in its file exactly once. Not there is STALE: the code
//      moved and the fault must be rewritten, which the report says; twice is
//      a fault nobody could place, the same.
//   2. The checks that read the file, as `npm run quick` selects them (the
//      manifest and checks.mjs `checkReads`: the scripts, the src/ they
//      bundle, the site for a check that serves it), in order: the ones the
//      fault's `expect` names, then the node shards, then the browser and
//      lab parts, then the Mac's. A check that serves the app runs only with
//      --app (on the Mac; anywhere else its frames are empty, PLAN 19l).
//   3. Each runs with the fault in. A red one is run again on the clean tree
//      (once per check per run, kept): red there too is not a catch, it is a
//      check already red, and the report says so apart. Red only with the
//      fault in is CAUGHT. Typecheck or the build going red is not a catch:
//      the fault was written so it would not compile, and it is to rewrite.
//   4. Without --full the fault stops at its first catch: the question the
//      run answers is which faults nothing catches, and a missed fault runs
//      every check it reaches, which is where the time goes. Per fault at
//      most --minutes (default 45); past it the fault is UNSETTLED, not
//      missed.
//   5. The file is put back (`git checkout`), and the tree is checked clean
//      before the next fault.
// The report: one table, the MISSED and NO CHECK lines first, since each is
// a hole: a fault the repository has had and could ship again with every
// check green. The owner's corrections are where new faults come from
// (docs/handoff.md "The owner's corrections become checks").

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const has = (n) => args.includes(n);

// ----------------------------------------------------------- the pure parts

// The fault put into a file's text: `find` exactly once, or why not.
export function applyMutant(text, m) {
  const n = text.split(m.find).length - 1;
  if (n !== 1) return { stale: n === 0 ? `\`find\` is not in ${m.file} any more` : `\`find\` is in ${m.file} ${n} times` };
  return { text: text.replace(m.find, () => m.replace) };
}

// What a fault's checks came to. `runs` in the order they ran:
// { name, red, cleanRed }, cleanRed only asked of a red one.
export const COMPILES = new Set(['Typecheck', 'The site builds']);
export function verdictOf(runs, { stale, reached, timedOut } = {}) {
  if (stale) return { verdict: 'STALE', why: stale };
  if (!reached) return { verdict: 'NO CHECK', why: 'no check reads the file' };
  if (runs.some((r) => r.red && !r.cleanRed && r.compile)) return { verdict: 'BROKEN', why: 'the fault does not compile: rewrite it so it runs', by: runs.filter((r) => r.red && r.compile).map((r) => r.name) };
  const by = runs.filter((r) => r.red && !r.cleanRed).map((r) => r.name);
  const already = runs.filter((r) => r.red && r.cleanRed).map((r) => r.name);
  if (by.length) return { verdict: 'CAUGHT', by, already };
  if (timedOut) return { verdict: 'UNSETTLED', why: `${runs.length} of ${reached} ran in the time, none caught it`, already };
  return { verdict: 'MISSED', why: `${runs.length} check${runs.length === 1 ? '' : 's'} ran green with the fault in`, already };
}

// The order a fault's checks run in: what it expects first, then the most
// specific. About 140 checks read any one src/ file (2026-11-27: 135 to 160
// per fault), most because they read the whole site or every script (the
// manifest's own checks, the reach job's); the one that sees a fault is
// nearly always one of the few that read little beyond it. So a check's
// weight is how many files it reads, a check of the whole site last, a Mac
// shard's after a Measure part's of the same weight (Metal's queue is the
// dear one), and a missed fault's time goes on the likely catchers first.
//
// Before any of them, the typecheck and the build (COMPILES): a fault that
// does not compile turns every harness that bundles its file red too, and
// would read as caught. Run first, a red one says BROKEN and stops the
// fault there (and a build that fails for a check that serves the site is
// the same: `compile` on its run).
export function orderChecks(list, expect, weightOf) {
  const w = (c) => (COMPILES.has(c.name) ? -2 : (expect ?? []).includes(c.name) ? -1 : weightOf(c));
  return list.map((c, i) => [c, i]).sort((a, b) => w(a[0]) - w(b[0]) || a[1] - b[1]).map(([c]) => c);
}

/*
  The loop, with the world handed in so the self-test can run it on made-up
  files: `read`, `write`, `restore` a file; `checksFor(m)` the checks a fault
  reaches; `run(c)` one check, resolving to { ok }. The clean run of a red
  check is asked once per check and kept in `clean`.
*/
export async function runMutants(mutants, { read, write, restore, checksFor, run, enough = 1, full = false, budgetMs = 45 * 60_000, now = Date.now, log = () => {} }) {
  const clean = new Map();
  const out = [];
  for (const m of mutants) {
    const t0 = now();
    const before = read(m.file);
    const applied = before == null ? { stale: `${m.file} is not there` } : applyMutant(before, m);
    if (applied.stale) { out.push({ m, ...verdictOf([], { stale: applied.stale }), secs: 0, runs: [] }); log(m, out.at(-1)); continue; }
    const list = checksFor(m);
    const runs = [];
    let timedOut = false;
    try {
      write(m.file, applied.text);
      for (const c of list) {
        if (now() - t0 > budgetMs) { timedOut = true; break; }
        const r = await run(c, { m, clean: false });
        const entry = { name: c.name, red: !r.ok, secs: r.secs, compile: COMPILES.has(c.name) || !!r.compile };
        if (entry.red) {
          if (!clean.has(c.name)) {
            restore(m.file);
            clean.set(c.name, !(await run(c, { m, clean: true })).ok);
            write(m.file, applied.text);
          }
          entry.cleanRed = clean.get(c.name);
        }
        runs.push(entry);
        if (runs.some((x) => x.red && !x.cleanRed && x.compile)) break;
        if (!full && runs.filter((x) => x.red && !x.cleanRed).length >= enough) break;
      }
    } finally {
      restore(m.file);
    }
    out.push({ m, ...verdictOf(runs, { reached: list.length, timedOut }), secs: (now() - t0) / 1000, runs, reached: list.length });
    log(m, out.at(-1));
  }
  return out;
}

export function report(results, { tree, ref, started, host }) {
  const order = ['MISSED', 'NO CHECK', 'BROKEN', 'STALE', 'UNSETTLED', 'CAUGHT'];
  const sorted = [...results].sort((a, b) => order.indexOf(a.verdict) - order.indexOf(b.verdict));
  const count = (v) => results.filter((r) => r.verdict === v).length;
  const holes = count('MISSED') + count('NO CHECK');
  const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const lines = [
    `# Mutation run, ${started.slice(0, 10)}`,
    '',
    `${results.length} known faults put back one at a time at ${ref} on ${host} (PLAN.md 50i). ` +
      `${count('CAUGHT')} caught, ${holes} that no check caught${holes ? ' (the holes: each is a fault this repository has had and could ship again with every check green)' : ''}, ` +
      `${count('STALE') + count('BROKEN')} to rewrite, ${count('UNSETTLED')} unsettled.`,
    '',
    '| Fault | Plan | File | Verdict | Caught by, or why | Checks run | Time |',
    '|---|---|---|---|---|---|---|',
    ...sorted.map((r) => `| ${cell(r.m.id)}: ${cell(r.m.fault)} | ${cell(r.m.plan)} | \`${cell(r.m.file)}\` | ${r.verdict} | ${cell(r.by?.join('; ') ?? r.why)}${r.already?.length ? ` (red without the fault too: ${cell(r.already.join('; '))})` : ''}${r.untraced?.length ? ` (expected, though the trace does not place it on this file: ${cell(r.untraced.join('; '))})` : ''} | ${r.runs.length}${r.reached != null ? ` of ${r.reached}` : ''} | ${Math.round(r.secs / 60)} min |`),
    '',
    `Tree: \`${tree}\`. A MISSED fault wants a check that fails on it (written by Claude, never Antigravity); a STALE or BROKEN one wants its \`find\`/\`replace\` rewritten in \`scripts/mutants.json\` for today's code.`,
  ];
  return { text: lines.join('\n') + '\n', holes };
}

// ---------------------------------------------------------------- self-test

async function selfTest() {
  let fails = 0;
  const t = (what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  };
  t('a fault goes in where its text is once', applyMutant('a = b + c;', { file: 'f', find: 'b + c', replace: 'b - c' }), { text: 'a = b - c;' });
  t('a fault whose text moved is stale, not silently nothing', applyMutant('a = b * c;', { file: 'f', find: 'b + c', replace: 'b - c' }).stale != null, true);
  t('a fault whose text is there twice is stale too', applyMutant('x; x;', { file: 'f', find: 'x', replace: 'y' }).stale != null, true);
  t('a `$&` in the fault is written as it is', applyMutant('a', { file: 'f', find: 'a', replace: '$&$&' }), { text: '$&$&' });

  t('the expected check first, then the one that reads least', orderChecks([{ name: 'site' }, { name: 'narrow' }, { name: 'wide' }, { name: 'claimed' }], ['claimed'], (c) => ({ site: 1e9, narrow: 3, wide: 40, claimed: 50 })[c.name]).map((c) => c.name), ['claimed', 'narrow', 'wide', 'site']);

  // A made-up repository: three files, four checks that read them as checks do.
  const disk = new Map([['src/a.ts', 'speed = +1;'], ['src/b.ts', 'drain = false;'], ['src/c.ts', 'mix = 1;'], ['src/d.ts', 'ok = 1;']]);
  const orig = new Map(disk);
  let cleanRuns = 0;
  const checks = {
    'Typecheck': { name: 'Typecheck', shard: 'logic', reads: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts'], red: () => disk.get('src/d.ts').includes('ok = ;') },
    // A harness that bundles d.ts too, and so goes red on a fault that does not compile.
    'speed sign': { name: 'speed sign', shard: 'lab', reads: ['src/a.ts', 'src/d.ts'], red: () => disk.get('src/a.ts').includes('-1') || disk.get('src/d.ts').includes('ok = ;') },
    'drain holds': { name: 'drain holds', shard: 'lab', reads: ['src/b.ts'], red: () => false }, // blind: the hole
    'always red': { name: 'always red', shard: 'logic', reads: ['src/c.ts'], red: () => true },
  };
  const mutants = [
    { id: 'sign', file: 'src/a.ts', find: '+1', replace: '-1' },
    { id: 'sign-again', file: 'src/a.ts', find: 'speed = +1', replace: 'speed = -1' },
    { id: 'drain', file: 'src/b.ts', find: 'false', replace: 'true' },
    { id: 'mix', file: 'src/c.ts', find: '1', replace: '2' },
    { id: 'moved', file: 'src/a.ts', find: 'velocity', replace: 'v' },
    { id: 'nobody', file: 'src/e.ts', find: 'x', replace: 'y' },
    { id: 'syntax', file: 'src/d.ts', find: '1', replace: '' },
  ];
  disk.set('src/e.ts', 'x');
  const res = await runMutants(mutants, {
    read: (f) => disk.get(f) ?? null,
    write: (f, s) => disk.set(f, s),
    restore: (f) => disk.set(f, orig.get(f) ?? 'x'),
    // The real order: a harness weighed before the typecheck would score a syntax fault CAUGHT.
    checksFor: (m) => orderChecks(Object.values(checks).filter((c) => c.reads.includes(m.file)), m.expect, (c) => c.reads.length),
    run: async (c) => { if (c.name === 'speed sign' && [...disk].every(([f, x]) => x === (orig.get(f) ?? 'x'))) cleanRuns++; return { ok: !c.red(), secs: 1 }; },
  });
  const v = Object.fromEntries(res.map((r) => [r.m.id, r.verdict]));
  t('a fault a check sees is CAUGHT by that check', [v.sign, res.find((r) => r.m.id === 'sign').by], ['CAUGHT', ['speed sign']]);
  t('a fault every check it reaches stays green on is MISSED: the hole the run exists to find', v.drain, 'MISSED');
  t('a check red with or without the fault is not a catch', [v.mix, res.find((r) => r.m.id === 'mix').already], ['MISSED', ['always red']]);
  t('a fault whose text moved is STALE', v.moved, 'STALE');
  t('a fault in a file no check reads is NO CHECK', v.nobody, 'NO CHECK');
  t('a fault that only breaks the typecheck is BROKEN, not caught', v.syntax, 'BROKEN');
  t('every file is put back after its fault', [...disk].every(([f, s]) => s === (orig.get(f) ?? 'x')), true);
  t('a check two faults turn red is run once on the clean tree, and kept', [v['sign-again'], cleanRuns], ['CAUGHT', 1]);
  const { text, holes } = report(res, { tree: '/t', ref: 'abc', started: '2026-11-27T00:00:00Z', host: 'here' });
  t('the report leads with the holes and counts them', [holes, text.indexOf('MISSED') < text.indexOf('CAUGHT')], [3, true]);

  // The real list: every fault well formed, its file there, its expected checks real.
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'scripts/checks.json'), 'utf8'));
  const names = new Set(man.checks.map((c) => c.name));
  const list = JSON.parse(fs.readFileSync(path.join(HERE, 'scripts/mutants.json'), 'utf8')).mutants;
  const ids = new Set();
  const bad = [];
  for (const m of list) {
    // `replace` may be empty: a fix that added a line is put back by taking it out.
    for (const k of ['id', 'plan', 'file', 'find', 'replace', 'fault']) if (typeof m[k] !== 'string' || (!m[k] && k !== 'replace')) bad.push(`${m.id ?? '?'}: no ${k}`);
    if (ids.has(m.id)) bad.push(`${m.id}: two faults with one id`);
    ids.add(m.id);
    if (m.find === m.replace) bad.push(`${m.id}: replace is find, no fault at all`);
    if (!fs.existsSync(path.join(HERE, m.file))) bad.push(`${m.id}: ${m.file} is not there`);
    for (const e of m.expect ?? []) if (!names.has(e)) bad.push(`${m.id}: expects "${e}", which is no check in checks.json`);
  }
  t(`scripts/mutants.json: ${list.length} faults, each with its text, file and real check names`, bad, []);
  t('at least ten faults, so a week finds something', list.length >= 10, true);
  console.log(`${fails ? 'FAIL' : 'ok  '} the mutation run's own test: ${fails} wrong`);
  return fails;
}

// --------------------------------------------------------------------- main

if (has('--self')) process.exit(await selfTest() ? 1 : 0);

const git = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const outDir = path.resolve(opt('--out') ?? path.join(HERE, 'scratch', 'mutate'));

if (!has('--here')) {
  // Make the tree, then run this script's copy in it, on its own files.
  const tree = path.resolve(opt('--tree') ?? path.join(os.tmpdir(), 'chromaglass-mutate'));
  const ref = git(HERE, 'rev-parse', opt('--ref') ?? 'HEAD').trim();
  const r = spawnSync('bash', [path.join(HERE, 'scripts/mutate-tree.sh'), HERE, tree, ref], { stdio: 'inherit' });
  if (r.status) process.exit(r.status);
  const rest = args.filter((a, i) => !['--tree', '--ref', '--out'].includes(a) && !['--tree', '--ref', '--out'].includes(args[i - 1]));
  const child = spawnSync(process.execPath, [path.join(tree, 'scripts/mutate.mjs'), '--here', '--out', outDir, ...rest], { cwd: tree, stdio: 'inherit' });
  process.exit(child.status ?? 1);
}

// In the tree: HERE is the tree. It must be clean, and only ever this run's.
if (git(HERE, 'status', '--porcelain', '--untracked-files=no').trim()) {
  console.error(`FAIL ${HERE} has changes: the mutation run writes faults into its tree, and will not into one with work in it`);
  process.exit(2);
}
const { loadManifest, checkReads, reads, runOne } = await import(path.join(HERE, 'scripts/checks.mjs'));
const { shipsToSite } = await import(path.join(HERE, 'scripts/reach.mjs'));
const man = loadManifest();
const scripts = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8')).scripts ?? {};
const readsOf = await checkReads(man, scripts, await import('esbuild'));
const only = opt('--only')?.split(',');
const all = JSON.parse(fs.readFileSync(path.join(HERE, 'scripts/mutants.json'), 'utf8')).mutants;
const mutants = only ? all.filter((m) => only.includes(m.id)) : all;
const withApp = has('--app');
const skipped = new Map();
// A fault's `expect` runs even where the trace does not place it: it is the
// check the fix was proved with, and a check that no longer reads the file it
// guards is itself the finding (the report says it ran untraced).
const untraced = new Map();
// How many of the repository's files a check reads: a directory in its reads
// (`src/`, as the manifest's own checks have) counts every file under it.
const tracked = git(HERE, 'ls-files').split('\n').filter(Boolean);
const covered = new Map();
const coverage = (c) => {
  if (!covered.has(c)) covered.set(c, tracked.filter((f) => reads(readsOf.get(c).reads, f)).length);
  return covered.get(c);
};
// The site, built for the tree as it stands: a check that serves dist/ sees
// the fault only if dist/ was built with it in. Built again when the tree's
// state changes (a fault in, or the clean tree), never twice for one state.
let builtFor = null;
const ensureBuilt = (key) => {
  if (builtFor === key) return true;
  const r = spawnSync('npm', ['run', 'build', '--silent'], { cwd: HERE, stdio: 'ignore' });
  builtFor = r.status === 0 ? key : null;
  return r.status === 0;
};
const checksFor = (m) => {
  const hit = man.checks.filter((c) => {
    const i = readsOf.get(c);
    return reads(i.reads, m.file) || (i.app && shipsToSite(m.file));
  });
  const extra = man.checks.filter((c) => ((m.expect ?? []).includes(c.name) || c.name === 'Typecheck') && !hit.includes(c));
  untraced.set(m.id, extra.filter((c) => c.name !== 'Typecheck').map((c) => c.name));
  hit.push(...extra);
  // The app's checks need Metal's frames (PLAN 19l): on the Mac a fault's
  // expected ones always run, and every other one with --app; elsewhere none.
  const appOk = (c) => withApp || (process.platform === 'darwin' && (m.expect ?? []).includes(c.name));
  const runnable = hit.filter((c) => appOk(c) || !(man.shards.mac.includes(c.shard) && readsOf.get(c).app));
  skipped.set(m.id, hit.length - runnable.length);
  // Two entries with one command (the manifest has a few) run once.
  const seen = new Set();
  const weightOf = (c) => {
    const i = readsOf.get(c);
    return (i.app ? 1e9 : coverage(c)) + (man.shards.mac.includes(c.shard) ? 1e6 : 0);
  };
  return orderChecks(runnable.filter((c) => !seen.has(c.run + JSON.stringify(c.env ?? {})) && seen.add(c.run + JSON.stringify(c.env ?? {}))), m.expect, weightOf);
};

if (has('--dry')) {
  for (const m of mutants) {
    const list = checksFor(m);
    const text = fs.readFileSync(path.join(HERE, m.file), 'utf8');
    const a = applyMutant(text, m);
    const lost = (m.expect ?? []).filter((e) => !list.some((c) => c.name === e));
    console.log(`${m.id} (${m.file}): ${a.stale ? `STALE, ${a.stale}` : `${list.length} checks${skipped.get(m.id) ? `, ${skipped.get(m.id)} more with --app` : ''}: ${list.slice(0, 4).map((c) => c.name).join('; ')}${list.length > 4 ? '; …' : ''}`}` +
      `${untraced.get(m.id)?.length ? `\n    expected but not traced to the file: ${untraced.get(m.id).join('; ')}` : ''}${lost.length ? `\n    expected, the app's (--app): ${lost.join('; ')}` : ''}`);
  }
  process.exit(0);
}

const started = new Date().toISOString();
const ref = git(HERE, 'rev-parse', '--short', 'HEAD').trim();
const quiet = { onOut: () => {}, onErr: () => {} };
const fmt = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
console.log(`${mutants.length} faults at ${ref}, in ${HERE}${withApp ? ', with the app\'s checks' : ''}`);
const results = await runMutants(mutants, {
  read: (f) => { try { return fs.readFileSync(path.join(HERE, f), 'utf8'); } catch { return null; } },
  write: (f, s) => fs.writeFileSync(path.join(HERE, f), s),
  restore: (f) => git(HERE, 'checkout', '--', f),
  checksFor,
  run: async (c, { m, clean }) => {
    const i = readsOf.get(c);
    if ((i.app || i.site) && !ensureBuilt(clean ? 'clean' : m.id)) {
      console.log(`    ✗ ${c.name}: the site did not build`);
      return { ok: false, secs: 0, compile: true };
    }
    const r = await runOne(c, { ...quiet, env: man.shards.mac.includes(c.shard) ? { PW_WEBGPU: '1' } : {} });
    console.log(`    ${r.ok ? '✓' : '✗'} ${c.name}, ${fmt(r.secs)}`);
    return r;
  },
  enough: 1,
  full: has('--full'),
  budgetMs: Number(opt('--minutes') ?? 45) * 60_000,
  log: (m, r) => { if (untraced.get(m.id)?.length) r.untraced = untraced.get(m.id); console.log(`${r.verdict.padEnd(9)} ${m.id}: ${r.by?.join('; ') ?? r.why ?? ''}`); },
});
const { text, holes } = report(results, { tree: HERE, ref, started, host: os.hostname() === 'localhost' ? 'this machine' : process.platform === 'darwin' ? 'the owner\'s Mac' : 'a cloud session' });
fs.mkdirSync(outDir, { recursive: true });
const stamp = started.slice(0, 10);
fs.writeFileSync(path.join(outDir, `mutate-${stamp}.md`), text);
fs.writeFileSync(path.join(outDir, 'latest.md'), text);
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify({ started, ref, results: results.map((r) => ({ id: r.m.id, file: r.m.file, verdict: r.verdict, by: r.by, why: r.why, already: r.already, runs: r.runs, secs: r.secs })) }, null, 2));
console.log(`\n${text}\nReport: ${path.join(outDir, `mutate-${stamp}.md`)}`);
process.exit(holes ? 1 : 0);
