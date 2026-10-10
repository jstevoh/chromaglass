// What a pull request's diff can reach (PLAN.md 19h). Run by `checks.yml`'s
// first job as `node scripts/reach.mjs --diff`, and by itself as
// `npm run reach`, which holds the list below to the paths it was written for.
//
// Every push to a PR used to queue the four Mac shards, about forty-five
// runner-minutes behind a queue that averaged twenty to thirty minutes on
// 2026-10-03, whatever the push changed. #237 changed closed.yml, the
// Measure script that checks it (closedruns.mjs) and PLAN.md; it waited for
// the Mac like a solver change, and went red there on "a drop lands only where
// it is dropped", a line it could not have moved. A change that only touches
// files no Mac shard reads proves nothing new on a Mac, and its run there is a
// shard some solver PR waited behind. (#209 and #234, other CI PRs that day,
// changed the solver and checks.yml, and still run the Mac.)
//
// So the list here is of what cannot reach a Mac shard, and everything else
// can: a new directory, a new kind of file, a file that is read at run time
// by a harness, all run the Mac. Markdown is read by people (the harnesses
// that mention a `.md` write one or name one in a comment); `.claude/` is the
// sessions' own; the six workflows named never run a Mac shard's steps (the
// gallery, controls and film workflows run on a label or by hand, and the
// iPhone and Mac apps have their own); `ios/` and `desktop/` are the native
// apps, which `npm run build` does not read and which `ios.yml` and
// `desktop.yml` build. Three scripts about the workflows themselves
// (`closedruns.mjs`, `macqueue.mjs`, `deploygate.sh`) are run by Measure, the
// deploy or by hand, and imported by no Mac step. `checks.yml` itself, `deploy.yml`, `scripts/`,
// `docs/`' JSON (the set list and liquids files are read by checks) all reach.
//
// Measure, on ubuntu, runs in full on every push whatever this says: it is
// what checks the scripts, the docs' JSON and the workflow wiring, and it is
// not behind a queue. And a run that skipped the Mac is never the run a deploy
// trusts (`scripts/deploygate.sh`): main's code under a docs-only merge is
// whatever the last merge left, which a red deploy may not have passed.
//
// `--diff` compares the checked-out commit with its first parent, with rename
// detection off: a `git mv` of a Mac-only script to `docs/x.md` lists both
// names, so the old one still reaches (with renames on, git lists only the
// new name, and such a PR skipped the Mac; the check-skeptic built that case).
// It also refuses to read anything but GitHub's merge commit: its second
// parent must be the PR's head (PR_HEAD). Were the checkout ever moved to the
// head itself, HEAD^1..HEAD would be the last push alone, and a PLAN.md push
// on top of a solver change would skip; this way that is a red job. For a
// pull_request run that commit is GitHub's merge of the head into the base, so
// the first parent is the base and the diff is exactly what merging would
// change, however many commits the PR has. Any other event (a deploy calling
// the workflow, a push) reaches the Mac unless the deploy's gate passed
// `mac: false` (its rule 5, CALL_MAC here).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Markdown only at the top, in docs/ and in .claude/: a `.md` under src/ or
// public/ could be imported (`?raw`) or served, and would reach.
const NOT_MAC = [
  /^[^/]+\.md$/,
  /^docs\/.*\.md$/,
  /^\.claude\//,
  /^\.github\/workflows\/(closed|gallery|controls|film|ios|desktop)\.yml$/,
  /^ios\//,
  /^desktop\//,
  /^LICENSE[^/]*$/,
  /^scripts\/(closedruns\.mjs|macqueue\.mjs|deploygate\.sh)$/,
];

export const reachesMac = (path) => !NOT_MAC.some((re) => re.test(path));

// What the live site is built from: `vite build` over src/, public/ and
// index.html, with the packages the lockfile pins and the hosting config.
// Nothing under src/ imports from docs/, scripts/, server/, desktop/ or ios/
// (grepped 2026-10-04). Tailwind's `@import "tailwindcss"` (src/index.css)
// scans the whole repository for class names, so a PLAN.md edit can add an
// unused utility to the stylesheet; nothing outside src/ and index.html puts
// a class on the page, so it changes no picture. The deploy gate's rule 5
// asks only about these: two
// PRs that both added a step to checks.yml, a script to package.json or a
// line to the same harness cannot have broken the site between them, and
// they did on every merge of 2026-10-03.
const SITE = [/^src\//, /^public\//, /^index\.html$/, /^vite\.config\.[cm]?[jt]s$/, /^tsconfig[^/]*\.json$/, /^package(-lock)?\.json$/, /^firebase\.json$/];
export const shipsToSite = (path) => SITE.some((re) => re.test(path));

/*
  A green Mac result carries across a merge of main (PLAN.md 19i).

  Measured over 25 merged PRs (#204 to #244, 103 Checks runs): 53 runs started
  on a push that only merged main in and 8 on a docs-only commit, together 61
  runs and 2,011 of 3,124 Mac runner-minutes (64 %), on pushes that added none
  of the PR's own code. They also held 20 of the 29 runs that went red on their
  first attempt, so most of them measured nothing but the queue and the flakes.

  So when the diff reaches a Mac shard, this asks one more question before the
  shards queue: does the tree being tested differ from the tree of this PR's
  last run that passed the Mac only in files the PR does not touch? Each such
  file then differs because main changed it, and the PR's own code (every file
  it touches, site or not) is exactly what passed. Stricter than the deploy
  gate's rule 5, which allows a shared non-site file such as checks.yml: here a
  file both sides touch, of any kind, runs the Mac, and so does any change the
  PR made since. What it leaves unmeasured is what rule 5 already accepted for
  deploys (PLAN.md 19h-3): two changes in different files moving the same
  picture, which the next run on main with both in it measures.

  Every condition that cannot be shown is "run the Mac", never "carry":
    - the PR's base is main, and the old run's base is an earlier main
      (compare: ahead or identical), so the files that moved are main's;
    - the source is the PR's newest run that ran the Mac shards at all
      (cancelled runs and runs that skipped or carried are passed over), and
      it passed all four: a newer Mac run that went red is never stepped over;
    - its tested commit (the run title's "tests <sha>") can be fetched and is
      a merge, so its base is its first parent;
    - every file that differs between the two tested trees either reaches no
      Mac shard, or is one the PR touches in neither (the merge's blob is its
      base's blob, then and now).

  `deps` is how the selftest drives it without the network: `api(path)`
  returns parsed JSON or throws, `git(...args)` returns stdout, and `fetch(sha)`
  makes a commit available locally.
*/
export async function carry({ prNumber, headRef, baseRef, runId, head = 'HEAD' }, deps) {
  const { api, git, fetch: fetchSha } = deps;
  const no = (why) => ({ carried: false, why });
  if (baseRef !== 'main') return no(`the PR's base is ${baseRef || 'unknown'}, not main`);
  if (!prNumber || !headRef) return no('the PR number or head branch is unknown');
  let runs;
  try {
    runs = (await api(`actions/workflows/checks.yml/runs?event=pull_request&branch=${encodeURIComponent(headRef)}&per_page=50`)).workflow_runs;
  } catch (e) { return no(`the PR's runs could not be read (${e.message})`); }
  runs = runs
    .filter((r) => String(r.id) !== String(runId))
    .filter((r) => r.head_branch === headRef && (r.pull_requests ?? []).some((p) => p.number === Number(prNumber)))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  let source = null;
  for (const r of runs) {
    if (r.status !== 'completed' || r.conclusion === 'cancelled') continue;
    let jobs;
    try { jobs = (await api(`actions/runs/${r.id}/jobs?per_page=100&filter=latest`)).jobs; } catch (e) { return no(`run ${r.id}'s jobs could not be read (${e.message})`); }
    const shards = jobs.filter((j) => j.name.startsWith('WebGPU (macOS) · ')).map((j) => [j.name.slice('WebGPU (macOS) · '.length), j.conclusion]);
    const ran = shards.filter(([, c]) => c !== 'skipped');
    if (ran.length === 0) continue;   // skipped the Mac, or carried: look further back
    const names = shards.map(([n]) => n).sort().join(',');
    if (names !== 'open,plate,show,tools' || ran.length !== 4 || ran.some(([, c]) => c !== 'success') || r.conclusion !== 'success') {
      return no(`the PR's newest Mac run ${r.id} did not pass all four shards (${shards.map(([n, c]) => `${n}=${c}`).join(', ')})`);
    }
    source = r;
    break;
  }
  if (!source) return no('the PR has no earlier run that passed the Mac');
  const tested = /\(tests ([0-9a-f]{40})\)$/.exec(source.display_title ?? '')?.[1];
  if (!tested) return no(`run ${source.id}'s title names no tested commit`);
  let oldBase, newBase;
  try {
    fetchSha(tested);
    const parents = git('rev-list', '--parents', '-n', '1', tested).trim().split(' ');
    if (parents.length !== 3) return no(`${tested.slice(0, 7)}, the commit run ${source.id} tested, is not a merge`);
    oldBase = parents[1];
    newBase = git('rev-parse', `${head}^1`).trim();
  } catch (e) { return no(`the commit run ${source.id} tested could not be read (${String(e.message).split('\n')[0]})`); }
  try {
    const cmp = await api(`compare/${oldBase}...${newBase}`);
    if (cmp.status !== 'ahead' && cmp.status !== 'identical') return no(`run ${source.id}'s base ${oldBase.slice(0, 7)} is ${cmp.status} of main ${newBase.slice(0, 7)}, not an earlier main`);
  } catch (e) { return no(`main since run ${source.id}'s base could not be compared (${e.message})`); }
  const blob = (rev, f) => { try { return git('rev-parse', `${rev}:${f}`).trim(); } catch { return 'absent'; } };
  const files = git('diff', '--name-only', '--no-renames', tested, head).split('\n').filter(Boolean);
  const mac = files.filter(reachesMac);
  const own = mac.filter((f) => blob(head, f) !== blob(`${head}^1`, f) || blob(tested, f) !== blob(oldBase, f));
  if (own.length) return no(`${own.length} of the ${mac.length} files since run ${source.id} that reach a Mac shard are the PR's own, first ${own.slice(0, 3).join(', ')}`);
  return {
    carried: true,
    run: source.id,
    tested,
    why: `carried from run ${source.id} (tests ${tested.slice(0, 7)}): ${files.length} files differ, ${mac.length} of them reach a Mac shard and all are main's, none the PR's`,
  };
}

// The network and the checkout, for a run in CI. The token is the job's own
// (the repository's default is read for every scope, which is all this asks);
// without one, the public API's limit of 60 an hour is shared by every job on
// the runner's address, and a 403 is "run the Mac".
function liveDeps() {
  const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
  const git = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return {
    git,
    fetch: (sha) => { git('fetch', '--no-tags', '--quiet', '--depth=2', 'origin', sha); },
    api: async (p) => {
      const headers = { Accept: 'application/vnd.github+json' };
      if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
      const res = await fetch(`https://api.github.com/repos/${repo}/${p}`, { headers, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${res.status} on ${p.split('?')[0]}`);
      return res.json();
    },
  };
}

async function selftest() {
  const cases = [
    ['PLAN.md', false],
    ['CLAUDE.md', false],
    ['docs/judging.md', false],
    ['.claude/skills/steward/SKILL.md', false],
    ['.claude/agents/check-skeptic.md', false],
    ['.github/workflows/closed.yml', false],
    ['.github/workflows/gallery.yml', false],
    ['ios/App/App/AppDelegate.swift', false],
    ['desktop/main.js', false],
    ['LICENSE', false],
    ['scripts/closedruns.mjs', false],
    ['scripts/macqueue.mjs', false],
    ['scripts/deploygate.sh', false],
    ['scripts/closedruns.mjs.bak', true],
    ['scripts/lab/closedruns.mjs', true],
    ['src/gpu/wgsl/plate.ts', true],
    ['src/components/phone/Dock.tsx', true],
    ['scripts/mirror.mjs', true],
    ['scripts/reach.mjs', true],
    ['.github/workflows/checks.yml', true],
    ['.github/workflows/deploy.yml', true],
    ['docs/sets/example.chromaglass-setlist.json', true],
    ['docs/liquids/examples.liquids.json', true],
    ['package.json', true],
    ['package-lock.json', true],
    ['index.html', true],
    ['vite.config.ts', true],
    ['public/presets.json', true],
    ['server/remote-server.js', true],
    ['capacitor.config.json', true],
    ['src/README.md.ts', true],
    ['src/components/help.md', true],
    ['public/notes.md', true],
    ['docs/sets/notes.md', false],
    ['iosx/thing.ts', true],
    ['a/desktop/b.ts', true],
  ];
  let bad = 0;
  const site = [
    ['src/gpu/fluid.ts', true],
    ['public/presets/a.json', true],
    ['index.html', true],
    ['vite.config.ts', true],
    ['package.json', true],
    ['package-lock.json', true],
    ['tsconfig.json', true],
    ['firebase.json', true],
    ['.github/workflows/checks.yml', false],
    ['scripts/phone.mjs', false],
    ['scripts/lab-entry.ts', false],
    ['server/remote-server.js', false],
    ['PLAN.md', false],
    ['docs/sets/example.chromaglass-setlist.json', false],
  ];
  for (const [path, want] of site) {
    const got = shipsToSite(path);
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${path} ${want ? 'is' : 'is not'} built into the live site`);
  }
  for (const [path, want] of cases) {
    const got = reachesMac(path);
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${path} ${want ? 'reaches' : 'does not reach'} a Mac shard${got === want ? '' : ` — read as ${got ? 'reaching' : 'not reaching'}`}`);
  }
  // A PR of only files that reach nothing has to be told so, and one file
  // that does reach has to bring the whole Mac back.
  // #237's own files, 2026-10-03.
  const docsOnly = ['PLAN.md', '.github/workflows/closed.yml', 'scripts/closedruns.mjs'];
  const one = [...docsOnly, 'src/App.tsx'];
  const verdicts = [
    [docsOnly.some(reachesMac), false, '#237 (PLAN.md, closed.yml and closedruns.mjs) skips the Mac'],
    [one.some(reachesMac), true, 'the same PR with one source file runs it'],
    [[].some(reachesMac), false, 'an empty diff skips it (nothing changed to prove)'],
  ];
  for (const [got, want, what] of verdicts) {
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}`);
  }
  // And `--diff` itself, on a scratch repository with GitHub's shape: a base,
  // a PR branch, and a merge commit whose second parent is the PR's head.
  const runDiff = (changes, prHead) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir }).toString().trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'reach@example.invalid');
    git('config', 'user.name', 'reach');
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'scripts/maconly.mjs'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'pr');
    changes(git, dir);
    git('commit', '-qam', 'pr');
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    const out = path.join(dir, 'out');
    fs.writeFileSync(out, '');
    try {
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--diff'], {
        cwd: dir,
        stdio: 'pipe',
        // No base branch, so carry() answers at once without the network: the
        // carry is driven by its own cases below, against a mocked API.
        env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: '', PR_HEAD: prHead ?? head, GITHUB_OUTPUT: out },
      });
      return fs.readFileSync(out, 'utf8').trim();
    } catch {
      return 'refused';
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const diffs = [
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'PLAN.md'), 'shipped\n')), 'mac=false', '--diff: a PLAN.md-only PR skips the Mac'],
    [runDiff((git) => git('mv', 'scripts/maconly.mjs', 'docs/maconly.md')), 'mac=true', '--diff: a Mac script moved to docs/x.md still reaches (rename detection off)'],
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'scripts/maconly.mjs'), '// more\n')), 'mac=true', '--diff: a changed script reaches'],
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'PLAN.md'), 'x\n'), 'f'.repeat(40)), 'refused', '--diff: a HEAD that is not the merge of PR_HEAD is refused'],
  ];
  // The deploy's switch: only a call that is not a PR's run, with mac false.
  const call = (env) => {
    const out = path.join(os.tmpdir(), `reach-call-${process.pid}`);
    fs.writeFileSync(out, '');
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--diff'], { stdio: 'pipe', env: { ...process.env, ...env, GITHUB_OUTPUT: out } });
    const r = fs.readFileSync(out, 'utf8').trim();
    fs.rmSync(out);
    return r;
  };
  diffs.push(
    [call({ GITHUB_EVENT_NAME: 'push', CALL_MAC: 'false' }), 'mac=false', 'a deploy whose gate said disjoint skips the Mac'],
    [call({ GITHUB_EVENT_NAME: 'push', CALL_MAC: 'true' }), 'mac=true', 'a deploy that did not runs it'],
    [call({ GITHUB_EVENT_NAME: 'workflow_dispatch', CALL_MAC: '' }), 'mac=true', 'a run by hand runs it'],
    [(() => { try { return call({ GITHUB_EVENT_NAME: 'pull_request', CALL_MAC: 'false', PR_HEAD: '' }); } catch { return 'refused'; } })(), 'refused', 'a PR run ignores the deploy\'s switch (and, outside a merge commit, is refused)'],
  );
  for (const [got, want, what] of diffs) {
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  bad += await carrySelftest();
  if (bad) process.exit(1);
}

/*
  carry() on scratch repositories with GitHub's shape, against a mocked API.
  Each case builds: main's base B0 (src/a.ts, src/b.ts, scripts/c.mjs,
  PLAN.md); the PR's head H1 changing src/a.ts; M_old, GitHub's merge of H1
  into B0, which the mocked earlier run "tests"; then whatever main and the PR
  do next, and M_new, the merge of the PR's new head into main's new tip, as
  the run being decided. The controls are the cases that must not carry: one
  file both sides touch, a PR change since, a newer red Mac run, a base that is
  not an earlier main, an API that fails, no Mac run at all.
*/
async function carrySelftest() {
  const build = ({ mainChanges, prChanges }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carry-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    const write = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.appendFileSync(path.join(dir, f), t); };
    // Main writes at a file's top and the PR at its bottom, six lines apart,
    // so a file both sides touch still merges cleanly, as it does on GitHub.
    const prepend = (f, t) => { const p = path.join(dir, f); fs.writeFileSync(p, t + fs.readFileSync(p, 'utf8')); };
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'reach@example.invalid');
    git('config', 'user.name', 'reach');
    for (const f of ['src/a.ts', 'src/b.ts', 'scripts/c.mjs', 'PLAN.md']) write(f, `// ${f}\n\n\n\n\n\n// end\n`);
    git('add', '-A'); git('commit', '-qm', 'B0');
    git('checkout', '-qb', 'pr'); write('src/a.ts', 'export const a = 1;\n'); git('commit', '-qam', 'H1');
    git('checkout', '-qb', 'mold', 'main'); git('merge', '-q', '--no-ff', '-m', 'M_old', 'pr');
    const mOld = git('rev-parse', 'HEAD').trim();
    git('checkout', '-q', 'main');
    for (const f of mainChanges) prepend(f, '// main\n');
    if (mainChanges.length) git('commit', '-qam', 'B1');
    git('checkout', '-q', 'pr');
    for (const f of prChanges) write(f, '// pr again\n');
    if (prChanges.length) git('commit', '-qam', 'H2');
    git('checkout', '-qb', 'mnew', 'main'); git('merge', '-q', '--no-ff', '-m', 'M_new', 'pr');
    return { dir, git, mOld };
  };
  const shardJobs = (c) => ({ jobs: ['open', 'plate', 'show', 'tools'].map((n) => ({ name: `WebGPU (macOS) · ${n}`, conclusion: c })) });
  const skippedJobs = { jobs: [{ name: 'WebGPU (macOS) · ${{ matrix.shard }}', conclusion: 'skipped' }] };
  const run = (id, t, mOld, conclusion = 'success') => ({ id, head_branch: 'pr', pull_requests: [{ number: 7 }], status: 'completed', conclusion, created_at: t, display_title: `PR (tests ${mOld})` });
  const decide = async ({ mainChanges = [], prChanges = [], runs, jobs, compare = 'ahead', baseRef = 'main', apiFails = false }) => {
    const { dir, git, mOld } = build({ mainChanges, prChanges });
    try {
      const api = async (p) => {
        if (apiFails) throw new Error('503');
        if (p.startsWith('actions/workflows/')) return { workflow_runs: runs(mOld) };
        const m = /^actions\/runs\/(\d+)\/jobs/.exec(p);
        if (m) return jobs[m[1]];
        if (p.startsWith('compare/')) return { status: compare };
        throw new Error(`unmocked ${p}`);
      };
      return (await carry({ prNumber: '7', headRef: 'pr', baseRef, runId: '99' }, { api, git, fetch: () => {} })).carried;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  const green = { runs: (m) => [run(1, '1', m)], jobs: { 1: shardJobs('success') } };
  const cases = [
    [await decide({ ...green, mainChanges: ['src/b.ts'] }), true, 'carry: main changed only a file the PR does not touch'],
    [await decide({ ...green, mainChanges: ['src/b.ts', 'scripts/c.mjs', 'PLAN.md'] }), true, 'carry: main changed site, script and docs files the PR does not touch'],
    [await decide({ ...green, prChanges: ['PLAN.md'] }), true, 'carry: the PR\'s new push changed only PLAN.md'],
    [await decide({ ...green, mainChanges: ['src/a.ts'] }), false, 'no carry: main changed a file the PR touches'],
    [await decide({ ...green, mainChanges: ['src/b.ts'], prChanges: ['scripts/c.mjs'] }), false, 'no carry: the PR changed a Mac script since the run'],
    [await decide({ ...green, prChanges: ['src/a.ts'] }), false, 'no carry: the PR changed its own site file since the run'],
    [await decide({ mainChanges: ['src/b.ts'], runs: (m) => [run(2, '2', m, 'failure'), run(1, '1', m)], jobs: { 1: shardJobs('success'), 2: shardJobs('failure') } }), false, 'no carry: a newer Mac run went red'],
    [await decide({ mainChanges: ['src/b.ts'], runs: (m) => [run(2, '2', m), run(1, '1', m)], jobs: { 1: shardJobs('success'), 2: skippedJobs } }), true, 'carry: passes over a newer run that skipped the Mac'],
    [await decide({ mainChanges: ['src/b.ts'], runs: (m) => [run(2, '2', m, 'cancelled'), run(1, '1', m)], jobs: { 1: shardJobs('success') } }), true, 'carry: passes over a cancelled run'],
    [await decide({ mainChanges: ['src/b.ts'], runs: (m) => [run(1, '1', m)], jobs: { 1: skippedJobs } }), false, 'no carry: no earlier run ran the Mac'],
    [await decide({ ...green, mainChanges: ['src/b.ts'], compare: 'diverged' }), false, 'no carry: the old base is not an earlier main'],
    [await decide({ ...green, mainChanges: ['src/b.ts'], apiFails: true }), false, 'no carry: the API fails'],
    [await decide({ ...green, mainChanges: ['src/b.ts'], baseRef: 'feature' }), false, 'no carry: the PR is not against main'],
    [await decide({ mainChanges: ['src/b.ts'], runs: (m) => [{ ...run(1, '1', m), pull_requests: [{ number: 8 }] }], jobs: { 1: shardJobs('success') } }), false, 'no carry: the green run was another PR\'s'],
  ];
  let bad = 0;
  for (const [got, want, what] of cases) {
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  return bad;
}

if (process.argv.includes('--reaching')) {
  // Paths on stdin, one a line; prints those that can reach a Mac shard, or
  // with `--site` those the live site is built from (the deploy gate's rule 5).
  const lines = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
  for (const l of lines) if (process.argv.includes('--site') ? shipsToSite(l) : reachesMac(l)) console.log(l);
} else if (process.argv.includes('--diff')) {
  const event = process.env.GITHUB_EVENT_NAME;
  let mac = true;
  let why = `a ${event || 'local'} run reaches the Mac without asking`;
  if (event !== 'pull_request' && process.env.CALL_MAC === 'false') {
    // The deploy, when its gate's rule 5 held: the PR's run passed the Mac
    // and the site files it changed are apart from main's newer ones.
    mac = false;
    why = 'the deploy gate found the PR\'s site files apart from main\'s newer changes; Measure runs, the Mac does not';
  } else if (event === 'pull_request') {
    const git = (...a) => execFileSync('git', a).toString();
    const second = git('rev-parse', 'HEAD^2').trim();
    if (!process.env.PR_HEAD || second !== process.env.PR_HEAD) {
      throw new Error(`HEAD is not GitHub's merge of the PR's head ${process.env.PR_HEAD} (its second parent is ${second})`);
    }
    const files = git('diff', '--name-only', '--no-renames', 'HEAD^1', 'HEAD').split('\n').filter(Boolean);
    const reaching = files.filter(reachesMac);
    mac = reaching.length > 0;
    why = mac
      ? `${reaching.length} of ${files.length} changed files reach a Mac shard, first ${reaching.slice(0, 5).join(', ')}`
      : `none of the ${files.length} changed files reaches a Mac shard: ${files.join(', ')}`;
    if (mac) {
      const verdict = await carry({
        prNumber: process.env.PR_NUMBER,
        headRef: process.env.GITHUB_HEAD_REF,
        baseRef: process.env.GITHUB_BASE_REF,
        runId: process.env.GITHUB_RUN_ID,
      }, liveDeps());
      if (verdict.carried) {
        mac = false;
        why = `${why}; ${verdict.why}`;
        // For the deploy gate (deploygate.sh), which reads this job's
        // annotations to follow a carried run back to the run that passed.
        console.log(`::notice title=carried::run ${verdict.run} tests ${verdict.tested}`);
      } else {
        why = `${why}; not carried: ${verdict.why}`;
      }
    }
  }
  console.log(why);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mac=${mac}\n`);
} else {
  await selftest();
}
