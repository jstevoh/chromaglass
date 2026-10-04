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
// trusts (`scripts/deploygate.sh`): the deploy runs the Mac checks itself,
// because main's code under a docs-only merge is whatever the last merge left,
// which a red deploy may not have passed.
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
// the workflow, a push) reaches the Mac without asking.

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

function selftest() {
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
        env: { ...process.env, GITHUB_EVENT_NAME: 'pull_request', PR_HEAD: prHead ?? head, GITHUB_OUTPUT: out },
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
  for (const [got, want, what] of diffs) {
    if (got !== want) bad++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}${got === want ? '' : ` — got ${got}`}`);
  }
  if (bad) process.exit(1);
}

if (process.argv.includes('--diff')) {
  const event = process.env.GITHUB_EVENT_NAME;
  let mac = true;
  let why = `a ${event || 'local'} run reaches the Mac without asking`;
  if (event === 'pull_request') {
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
  }
  console.log(why);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mac=${mac}\n`);
} else {
  selftest();
}
