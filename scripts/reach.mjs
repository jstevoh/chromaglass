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
// sessions' own; the eight workflows named never run a Mac shard's steps (the
// gallery, controls and film workflows run on a label or by hand, the iPhone
// and Mac apps have their own, `ready.yml` only labels a PR after
// `Checks` has run, PLAN.md 19al, and `hold.yml` only posts a status after a
// deploy, PLAN.md 19am); `ios/` and `desktop/` are the native
// apps, which `npm run build` does not read and which `ios.yml` and
// `desktop.yml` build. Four scripts about the workflows themselves
// (`closedruns.mjs`, `macqueue.mjs`, `deploygate.sh`, `mainhold.mjs`) are run by Measure, the
// deploy or by hand, and imported by no Mac step; so is the guard that reads
// a PR's diff for moved bars (`checkguard.mjs`), which reads code as text,
// and `quick.mjs`, which a session runs by hand (PLAN.md 19k). `checks.yml`
// itself, `deploy.yml`, `scripts/`, `docs/`' JSON (the set list and liquids
// files are read by checks) all reach; which of the shards a change to
// `scripts/` reaches is `checks.mjs`'s to say.
//
// Since PLAN.md 19ak-20 (the owner's call, 2026-11-22) a pull request runs no
// Mac shard at all, whatever it changes, and of Measure only the parts the
// manifest names under `shards.pr`: the node checks, the typecheck and the
// build. The list below now says only how many of a PR's files would reach
// the Mac (the reach job's log line) and, with `--reaching --site`, which
// files the live site is built from (the deploy gate's rule 5). Main's deploy
// runs every Measure part and every Mac shard, and a run that skipped any of
// them is never the run a deploy trusts (`scripts/deploygate.sh`).
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
import { selectMeasure, parseManifest, loadManifest } from './checks.mjs';

// Markdown only at the top, in docs/ and in .claude/: a `.md` under src/ or
// public/ could be imported (`?raw`) or served, and would reach.
const NOT_MAC = [
  /^[^/]+\.md$/,
  /^docs\/.*\.md$/,
  /^\.claude\//,
  /^\.github\/workflows\/(closed|gallery|controls|film|ios|desktop|ready|hold)\.yml$/,
  /^ios\//,
  /^desktop\//,
  /^LICENSE[^/]*$/,
  /^scripts\/(closedruns\.mjs|macqueue\.mjs|deploygate\.sh|checkguard\.mjs|quick\.mjs|mainhold\.mjs|mainhold-deploys\.json)$/,
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

// The Mac shards, from the manifest (scripts/checks.json, PLAN.md 19k).
export const MAC_SHARDS = loadManifest().shards.mac;

// The manifest and package.json as a commit has them, parsed, or null where
// the commit has no such file. A manifest that does not parse throws: that is
// a red job, which Measure's `npm run checks` then names.
function atCommit(rev, git) {
  const read = (f) => { try { return git('show', `${rev}:${f}`); } catch { return null; } };
  const m = read('scripts/checks.json');
  const p = read('package.json');
  return { manifest: m == null ? null : parseManifest(m, `${rev}:scripts/checks.json`), pkg: p == null ? null : JSON.parse(p) };
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
    ['.github/workflows/ready.yml', false],
    ['.github/workflows/ready.yml.orig', true],
    ['.github/workflows/hold.yml', false],
    ['ios/App/App/AppDelegate.swift', false],
    ['desktop/main.js', false],
    ['LICENSE', false],
    ['scripts/closedruns.mjs', false],
    ['scripts/macqueue.mjs', false],
    ['scripts/deploygate.sh', false],
    ['scripts/checkguard.mjs', false],
    ['scripts/mainhold.mjs', false],
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
  // The environment every child `--diff` below runs in. It is this job's, so
  // the child finds node, git and the token, but never this run's attempt:
  // on a re-run (GITHUB_RUN_ATTEMPT 2) a child that inherited it read the real
  // run's jobs, found the Mac shards that passed in attempt 1, and dropped them
  // from its answer, so the cases that want every shard got `mac=false` and the
  // logic shard went red on every re-run (#656's, PLAN.md 19ak-5). The child's
  // answer is about its scratch tree, never about this run, so it is always a
  // first attempt of no run.
  const childEnv = (extra) => ({ ...process.env, GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '', ...extra });
  // And `--diff` itself, on a scratch repository with GitHub's shape: a base,
  // a PR branch, and a merge commit whose second parent is the PR's head.
  const runDiff = (changes, prHead, base = () => {}) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reach-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir }).toString().trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'reach@example.invalid');
    git('config', 'user.name', 'reach');
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'scripts/maconly.mjs'), 'export const x = 1;\n');
    fs.writeFileSync(path.join(dir, 'PLAN.md'), '# plan\n');
    base(dir);
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'pr');
    changes(git, dir);
    git('add', '-A');
    git('commit', '-qm', 'pr');
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--no-ff', '-m', 'merge', 'pr');
    const out = path.join(dir, 'out');
    fs.writeFileSync(out, '');
    try {
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--diff'], {
        cwd: dir,
        stdio: 'pipe',
        env: childEnv({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: '', PR_HEAD: prHead ?? head, GITHUB_OUTPUT: out }),
      });
      return fs.readFileSync(out, 'utf8').trim().replace(/\n/g, ' ');
    } catch {
      return 'refused';
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  // A tree with a manifest of two Mac shards and a Measure part (PLAN.md 19k):
  // a check script selects its own shard, a Measure check's none, and a
  // source file beside it every shard.
  const ALL = `shards=${JSON.stringify(MAC_SHARDS)}`;
  const withManifest = (dir) => {
    const w = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
    w('package.json', JSON.stringify({ name: 'x', scripts: { b: 'node scripts/b.mjs' } }));
    w('scripts/a.mjs', 'export const a = 1;\n');
    w('scripts/b.mjs', "import './helper.mjs';\n");
    w('scripts/helper.mjs', 'export const h = 1;\n');
    w('scripts/c.mjs', 'export const c = 1;\n');
    w('scripts/d.mjs', 'export const d = 1;\n');
    w('src/x.ts', 'export const x = 1;\n');
    w('scripts/checks.json', JSON.stringify({
      shards: { measure: ['m'], mac: ['x', 'y'] },
      checks: [
        { name: 'A', shard: 'x', run: 'node scripts/a.mjs' },
        // Spelt in parts: the panel check reads every `npm run` in the source
        // as a command to run, and `b` is a script only in this scratch tree.
        { name: 'B', shard: 'y', run: ['npm', 'run', 'b'].join(' ') },
        { name: 'C', shard: 'm', run: 'node scripts/c.mjs' },
        { name: 'D', shard: 'm', run: 'node scripts/d.mjs', always: true },
      ],
    }));
  };
  const touch = (...fs_) => (git, dir) => { for (const f of fs_) fs.appendFileSync(path.join(dir, f), '// more\n'); };
  const diffs = [
    // A pull request never runs the Mac (PLAN.md 19ak-20), whatever it changes:
    // a document, a Mac check's own script, a source file.
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'PLAN.md'), 'shipped\n')), `mac=false ${ALL}`, '--diff: a PLAN.md-only PR skips the Mac'],
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'scripts/maconly.mjs'), '// more\n')), `mac=false ${ALL}`, '--diff: a PR changing a Mac script skips the Mac'],
    [runDiff(touch('scripts/a.mjs'), undefined, withManifest), `mac=false ${ALL}`, '--diff: a PR changing a Mac check\'s own script skips the Mac'],
    [runDiff(touch('scripts/a.mjs', 'src/x.ts'), undefined, withManifest), `mac=false ${ALL}`, '--diff: a PR changing a source file skips the Mac'],
    [runDiff((git, dir) => fs.appendFileSync(path.join(dir, 'PLAN.md'), 'x\n'), 'f'.repeat(40)), 'refused', '--diff: a HEAD that is not the merge of PR_HEAD is refused'],
  ];
  // Measure's selection rides the same output (PLAN.md 19k-4): a check
  // script's own check and the `always` ones, the always ones alone for a
  // document or another shard's script, every check for anything else.
  const MEASURE = [
    [touch('scripts/c.mjs'), 'parts=["m"] only=["C","D"]', 'a Measure check\'s script selects that check and the always ones'],
    [touch('scripts/a.mjs'), 'parts=["m"] only=["D"]', 'a Mac check\'s script selects only the always ones in Measure'],
    [(git, dir) => fs.appendFileSync(path.join(dir, 'PLAN.md'), 'shipped\n'), 'parts=["m"] only=["D"]', 'a document no check reads selects only the always ones'],
    [touch('src/x.ts'), 'parts=["m"] only=', 'a source file runs Measure in full'],
    [touch('scripts/c.mjs', 'src/x.ts'), 'parts=["m"] only=', 'a check script with a source file runs Measure in full'],
    [touch('scripts/never-traced.mjs'), 'parts=["m"] only=', 'a script no check traces runs Measure in full'],
  ];
  // The parts a pull request runs (PLAN.md 19ak-20): a tree whose manifest
  // names `shards.pr` runs only those parts, and a selection that falls wholly
  // outside them runs them in full. Every such run says "partial" to the gate.
  const withPr = (pr) => (dir) => {
    withManifest(dir);
    const p = path.join(dir, 'scripts/checks.json');
    const m = JSON.parse(fs.readFileSync(p, 'utf8'));
    m.shards = { measure: ['m', 'n'], mac: ['x', 'y'], pr };
    m.checks.push({ name: 'E', shard: 'n', run: 'node scripts/e.mjs' });
    fs.writeFileSync(path.join(dir, 'scripts/e.mjs'), 'export const e = 1;\n');
    fs.writeFileSync(p, JSON.stringify(m));
  };
  for (const [mut, pr, want, what] of [
    [touch('src/x.ts'), ['m'], 'parts=["m"] only=', 'a source file runs only the PR\'s parts, in full'],
    [touch('scripts/e.mjs'), ['m'], 'parts=["m"] only=["D","E"]', 'a check outside the PR\'s parts is not run on the PR'],
    [touch('scripts/c.mjs'), ['n'], 'parts=["n"] only=', 'a selection wholly outside the PR\'s parts runs them in full'],
  ]) {
    const raw = runDiff(mut, undefined, withPr(pr));
    const got = raw.replace(/^.* (parts=)/, '$1');
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} --diff: ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  for (const [mut, want, what] of MEASURE) {
    const got = runDiff(mut, undefined, withManifest).replace(/^.* (parts=)/, '$1');
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} --diff: ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  // The deploy's switch: only a call that is not a PR's run, with mac false.
  const call = (env) => {
    const out = path.join(os.tmpdir(), `reach-call-${process.pid}`);
    fs.writeFileSync(out, '');
    execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--diff'], { stdio: 'pipe', env: childEnv({ ...env, GITHUB_OUTPUT: out }) });
    const r = fs.readFileSync(out, 'utf8').trim().replace(/\n/g, ' ');
    fs.rmSync(out);
    return r;
  };
  diffs.push(
    [call({ GITHUB_EVENT_NAME: 'push', CALL_MAC: 'false' }), `mac=false ${ALL}`, 'a deploy whose gate said disjoint skips the Mac'],
    [call({ GITHUB_EVENT_NAME: 'push', CALL_MAC: 'true' }), `mac=true ${ALL}`, 'a deploy that did not runs every shard'],
    [call({ GITHUB_EVENT_NAME: 'workflow_dispatch', CALL_MAC: '' }), `mac=true ${ALL}`, 'a run by hand runs every shard'],
    [(() => { try { return call({ GITHUB_EVENT_NAME: 'pull_request', CALL_MAC: 'false', PR_HEAD: '' }); } catch { return 'refused'; } })(), 'refused', 'a PR run ignores the deploy\'s switch (and, outside a merge commit, is refused)'],
  );
  for (const [raw, want, what] of diffs) {
    const got = raw.replace(/ parts=.*$/, '');
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  if (bad) process.exit(1);
}

// Run, not imported (quick.mjs imports `shipsToSite`).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) {
  // imported
} else if (process.argv.includes('--reaching')) {
  // Paths on stdin, one a line; prints those that can reach a Mac shard, or
  // with `--site` those the live site is built from (the deploy gate's rule 5).
  const lines = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
  for (const l of lines) if (process.argv.includes('--site') ? shipsToSite(l) : reachesMac(l)) console.log(l);
} else if (process.argv.includes('--diff')) {
  const event = process.env.GITHUB_EVENT_NAME;
  let mac = true;
  let shards = MAC_SHARDS;
  let why = `a ${event || 'local'} run reaches the Mac without asking`;
  // Measure's selection (PLAN.md 19k-4): every part in full, unless this is a
  // pull request whose diff is only check scripts, manifest entries, npm
  // scripts and documents. `only` empty is every check.
  let parts = loadManifest().shards.measure;
  let only = '';
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
    const before = atCommit('HEAD^1', git), after = atCommit('HEAD', git);
    if (after.manifest) {
      parts = after.manifest.shards.measure;
      const m = selectMeasure(files, { before, after, root: process.cwd() });
      console.log(`Measure: ${m.all ? `every check (${m.why})` : m.why}`);
      if (!m.all && m.parts.length) {
        parts = m.parts;
        only = JSON.stringify(m.names);
      }
      // A pull request runs only the Measure parts the manifest names for it
      // (PLAN.md 19ak-20): the node checks, the typecheck and the build. The
      // rest of Measure, Chromium and the lab on SwiftShader, goes to main's
      // deploy with the Mac. Of 93 PR runs from 2026-11-14 to 11-21, 52 went
      // red, and every line behind them was a browser, lab or Mac check timing
      // a page or a plate on a slow or busy runner (the intro's loading line,
      // the startup's "moving for good", the ear behind the wall, a film's one
      // pixel, AAC); the owner's call, 2026-11-22: off the PRs. A selection none of whose checks is in them (never yet: the `always`
      // checks are in `logic`) runs them in full rather than nothing.
      const pr = after.manifest.shards.pr;
      if (pr) {
        const kept = parts.filter((p) => pr.includes(p));
        if (kept.length) parts = kept;
        else { parts = pr; only = ''; }
      }
      // For the deploy gate (deploygate.sh): such a run is not evidence for a
      // tree's whole Measure, so a deploy never trusts it and runs Measure.
      if (parts.length < after.manifest.shards.measure.length || only) {
        console.log(`::notice title=measure::partial: ${only ? `${JSON.parse(only).length} checks in ` : ''}${parts.join(', ')}`);
      }
    }
    // No Mac on a pull request (PLAN.md 19ak-20). The Mac shards, every one,
    // run on main's deploy (deploy.yml), on the owner's Mac when it is free;
    // the deploy gate never trusts a run that skipped them, so a deploy can
    // only ever publish a tree its own Mac run passed: a blank or broken plate
    // stops there, as it did, rather than on every PR before it. What this
    // took out: the per-shard selection (19k, 19ak-2), carrying an earlier
    // run's Mac result (19i) and a re-run skipping the shards that passed
    // (19ak-3a), all of which existed to make a PR's Mac run cheaper.
    mac = false;
    why = `a pull request runs no Mac shard (19ak-20); ${reaching.length} of ${files.length} changed files reach one, and main's deploy runs them all`;
  }
  console.log(why);
  // The matrix needs a list even when the shards are skipped (`mac=false`),
  // so then it is every shard, which nothing runs.
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mac=${mac}\nshards=${JSON.stringify(mac ? shards : MAC_SHARDS)}\nparts=${JSON.stringify(parts)}\nonly=${only}\n`);
} else {
  await selftest();
}
