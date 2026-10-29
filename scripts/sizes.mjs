// A size budget for the repository's files (`npm run sizes`; PLAN.md 19ai-5).
//
//   npm run sizes                     the self-test, then the tree against its baseline
//   npm run sizes -- --base origin/main
//   npm run sizes -- --update         lower the baseline to the tree (it never raises it)
//
// What was reported. A session pays for everything it has read on every step
// after, so what decides its cost is how much it must read to find its place.
// Measured on main at a9dd9f2 (2026-10-28): LiquidVisualizer.tsx was 671 KB,
// App.tsx 373 KB, gpu/fluid.ts and wgsl/fluid.ts 291 and 290 KB, SettingsPanel
// 204 KB; PLAN.md 810 KB, more than the 200k-token window sessions compact at.
// The owner approved a plan that splits them (the separation plan, 19ai), and a
// split only holds if nothing grows back, so the owner's rule is two lines:
//
//   1. a file that is not in the baseline stays at or under 100 KB (about
//      25k tokens, what a session reads in one go), and one past 40 KB (about
//      ten thousand tokens) that a pull request made or grew is a warning;
//   2. a file already over 100 KB is in the baseline with its size, and may
//      not grow past it, nor past its size at the base. New code for it goes
//      in a new module beside it.
//
// Why a warning at 40 KB and a failure only at 100 (the owner, 2026-10-29).
// The rule as first written failed every new file over 40 KB, and the owner
// asked whether that number was arbitrary and would cost quality. Measured on
// main at a68de68: a token is about four bytes (PLAN.md, 500 KB, read as 124k
// tokens); 506 of 677 text files were under 20 KB; the cost sat in 17 files
// over 100 KB (the visualizer, App, both fluid.ts, SettingsPanel, plate.ts,
// the big checks and the ledgers), each read whole by a session that needed a
// twentieth of it. The 40 between 40 and 100 KB were mostly modules that do
// one job (audioFeatures, slosh, midi, beads, the thin gap's shader, the
// mixer's and magnet's checks), and a session that needs both halves of a
// split 60 KB module reads the same bytes. And the repository's long prose
// comments, which the owner asked for, were 25 to 60% of those files' bytes
// (audioFeatures 52%, slosh 59%, governor 52%): a 40 KB file was often 20 KB
// of code, so the cheap ways under a 40 KB bar were cutting the comments or
// cutting a module where it does not come apart. So 40 KB asks the question
// (has this file got parts a session would read apart?) and 100 KB, where the
// monoliths start, is the bar.
//
// The baseline is scripts/sizes.json, and it only shrinks. Against the commit
// this one is measured from (below), an entry may be lowered or removed, never
// raised: otherwise the way to get a grown App.tsx green would be to write its
// new size in, and the check would be a form to fill in. An entry is added only
// for bytes a move carried out of a file the base already held over budget
// (judge(), "A move out carries its ceiling"): no more than left those files in
// the same pull request, measured on the files, not on their ceilings. A big
// file renamed without its entry is a new file over budget.
//
// Why there is slack below a ceiling and none above it. If a file that shrinks
// at all had to have its entry lowered in the same PR, nearly every PR that
// touches App.tsx would touch the same line of sizes.json, and the ten or so
// sessions working at once would conflict there all day (and GitHub runs no CI
// on a PR that conflicts). So a file may sit up to 4 KB under its ceiling
// unremarked; past that a pull request that resized the file fails until
// `npm run sizes -- --update` lowers the entry, so a real move out (the solver
// leaving the visualizer) has to bank what it saved. Nothing can grow back
// into the slack anyway, since no PR may grow the file against its base; the
// slack only decides when the ceiling has to follow it down. (On main, and
// for a file a PR did not resize, a stale entry is a note: see judge().)
//
// Which files. Every file git tracks, and locally every untracked one it does
// not ignore (so a new file shows before it is committed), measured in bytes on
// disk, except:
//
//   - binary files (a NUL in the first 8,000 bytes, git's own test): the songs
//     in scripts/fixtures, the pictures and films in public/. A session never
//     reads them as text, which is the cost this measures;
//   - package-lock.json anywhere: npm writes it, nobody reads it whole;
//   - the ledgers named in sizes.json, files that grow by design with every PR
//     (PLAN.md, the shipped archive, judging, the guide, the changelog and the
//     manifest of checks). Held to rule 2 they would turn every PR red, since
//     every PR is asked to write in them. Splitting PLAN.md (19m) is how they
//     come out; the list may lose names against the base, never gain one, and
//     a ledger that falls under the 40 KB warning has to leave it.
//
// The base. In CI (GITHUB_ACTIONS) the check runs on the merge commit GitHub
// made for the pull request, whose first parent is the branch it merges into,
// or on main's own commit in a deploy, whose first parent is the main before
// it: either way HEAD^1. Measure checks out one commit deep, so the parent is
// fetched by its id, and if that fails the check fails rather than pass with
// the baseline's history unread. Elsewhere it is `--base`'s merge base with
// HEAD, or origin/main's if there is one, and without either the history half
// is skipped and says so.
//
// What it does not do. It reads the files' sizes, not what is in them: a file
// held under its ceiling by deleting comments passes. The repository's rule
// that comments explain at length is a reviewer's to hold, not this check's.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = 'scripts/sizes.json';
const WARN = 40 * 1024;
const LIMIT = 100 * 1024;
const SLACK = 4 * 1024;
const GENERATED = /(^|\/)package-lock\.json$/;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

const git = (root, ...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();

// Every text file a session could read, with its size in bytes.
export function measure(root) {
  const listed = new Set(git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean));
  const out = new Map();
  for (const f of listed) {
    if (GENERATED.test(f)) continue;
    let st;
    try { st = fs.lstatSync(path.join(root, f)); } catch { continue; } // deleted and not yet staged
    if (!st.isFile()) continue;
    const fd = fs.openSync(path.join(root, f), 'r');
    const head = Buffer.alloc(Math.min(8000, st.size));
    fs.readSync(fd, head, 0, head.length, 0);
    fs.closeSync(fd);
    if (head.includes(0)) continue;
    out.set(f, st.size);
  }
  return out;
}

const parse = (text, where) => {
  const b = JSON.parse(text);
  const files = b.files ?? {}, ledgers = b.ledgers ?? {};
  for (const [f, n] of Object.entries(files)) if (!Number.isInteger(n) || n <= 0) throw new Error(`${where}: ${f}'s ceiling is not a whole number of bytes`);
  return { about: b.about, files, ledgers };
};

// The rules, on plain data: `sizes` from measure(), `now` the baseline in the
// tree, `then` the baseline at the base (null when the base has none), `was`
// each file's size at the base (null when there is no base), and `pr`, whether
// this is a pull request's run (or a session's) rather than main's own.
//
// Why a ceilinged file is held to its size at the base as well as to its
// ceiling, and why a stale entry is only red in a pull request that changed
// the file (the review of #545, both reproduced on the real App.tsx). PRs
// merge green even when main moved while their checks ran (the owner's rule
// of 2026-09-28), so each is measured against the main it started from, and
// two of them land on top of each other. Held to the ceiling alone, main 3 KB
// under it and two PRs that each add 2 KB are each green and together 1 KB
// over: main's deploy red with nobody's PR to blame. Held to the base, a PR
// cannot grow the file at all, and sums of PRs that do not grow it do not
// either. The other way round, two PRs that each trim 2.5 KB are each inside
// the slack and together 5 KB under: had that been red wherever it was found,
// main's deploy and every open PR would have gone red at once. So on main it
// is a note, and in a pull request it is red only for a file the PR resized,
// which is the PR that has something to bank.
export function judge(sizes, now, then, was = null, pr = true) {
  const bad = [], notes = [];
  const touched = (f) => !was || was.get(f) !== sizes.get(f);
  const stale = (f, what) => (pr && touched(f) ? bad : notes).push(['stale', f, what]);
  for (const f of Object.keys(now.ledgers)) {
    if (f in now.files) bad.push(['both', f, `${f} is both a ledger and a ceiling in ${BASELINE}`]);
    if (!sizes.has(f)) stale(f, `${f} is a ledger but no longer here: take it out of ${BASELINE}`);
    else if (sizes.get(f) <= WARN) stale(f, `${f} is a ledger at ${kb(sizes.get(f))}, under the ${kb(WARN)} warning: take it out of the ledgers`);
  }
  for (const [f, cap] of Object.entries(now.files)) {
    const n = sizes.get(f), before = was?.get(f);
    if (n == null) stale(f, `${f} has a ceiling but is no longer here: \`npm run sizes -- --update\` drops it`);
    else if (n > cap) bad.push(['grew', f, `${f} grew to ${n} bytes past its ceiling of ${cap} (+${n - cap}): move the new code into a module beside it`]);
    else if (before != null && n > before) bad.push(['grew', f, `${f} grew from ${before} bytes at the base to ${n} (+${n - before}): a file over budget does not grow, even under its ceiling`]);
    else if (n <= LIMIT) stale(f, `${f} is ${kb(n)}, back under the ${kb(LIMIT)} limit: \`npm run sizes -- --update\` drops its ceiling`);
    else if (cap - n > SLACK) stale(f, `${f} is ${n} bytes, ${cap - n} under its ceiling of ${cap}: \`npm run sizes -- --update\` banks it`);
  }
  // A file between the two bars is a warning only where this change made it
  // or grew it: the forty that sit there already are not news on every run.
  //
  // And a file past the limit with no ceiling is red only in a pull request
  // that resized it, for the reason a stale entry is (above), found in the
  // review of this rule: with the forty files between the bars free to grow,
  // presets.ts at 90 KB takes two PRs of 5 KB each, each green against its
  // own base and together 102 KB on main. Red wherever it was found, that
  // would turn main's deploy and every open PR red with nobody's change to
  // blame. So on main, and in a PR that did not touch the file, it is a note,
  // and the next PR that resizes it owns the split.
  for (const [f, n] of sizes) {
    if (f in now.files || f in now.ledgers) continue;
    if (n > LIMIT) (pr && touched(f) ? bad : notes).push(['new', f, `${f} is ${kb(n)} (${n} bytes), over the ${kb(LIMIT)} limit for a file: split it`]);
    else if (n > WARN && (!was || n > (was.get(f) ?? 0))) notes.push(['big', f, `${f} is ${kb(n)}, over ${kb(WARN)} (about ${Math.round(n / 4096)}k tokens): if it has parts a session would read apart, give them files of their own`]);
  }
  if (then) {
    /*
      A move out carries its ceiling (the owner, 2026-10-28, on #548). The
      first PR to make a split this rule exists for, the CPU solver leaving
      the visualizer (19ai-3), moved one 190 KB class into a file of its own,
      and the rule as first written read that file as new code over budget:
      the visualizer's ceiling fell by 229 KB and the move was still red. The
      owner did not want the solver cut into 40 KB pieces to satisfy a number
      ("I don't want quality to go down because of this"), and a class is not
      split by moving lines: its methods would have to be pulled apart into
      files that reach each other's private state.

      So an entry the base does not have is allowed for bytes that moved: the
      new entries together may hold no more than actually left the files the
      base's baseline held over budget, in this pull request (each such file's
      size at the base less its size now, a deleted one counting whole). That
      is measured on the files and not on their ceilings, because a ceiling
      can sit above its file: slack banked by an earlier `--update`, or an
      entry dropped for a file that had already shrunk, is not bytes this PR
      moved, and crediting the sum of ceilings let a fresh 41.5 KB file and a
      big file renamed and grown 3 KB through together (the review of #548,
      reproduced in a scratch repository). The new entry is the file's own
      size, no slack in it, so it cannot grow from the day it is written. A
      file that simply appears over budget still fails as new (nothing in
      sizes.json names it). What this lets through that the first rule did
      not is a rename that moves its entry with it, unchanged; a session's
      cost is the same either way, which is what the budget is for.
    */
    const moved = was ? Object.keys(then.files).reduce((a, f) => a + Math.max(0, (was.get(f) ?? 0) - (sizes.get(f) ?? 0)), 0) : 0;
    const added = Object.keys(now.files).filter((f) => !(f in then.files) && !(f in then.ledgers));
    const carrying = added.reduce((a, f) => a + (sizes.get(f) ?? 0), 0);
    for (const [f, cap] of Object.entries(now.files)) {
      if (!(f in then.files) && !(f in then.ledgers)) {
        if (carrying > moved) bad.push(['raised', f, `${f} has a ceiling the base's ${BASELINE} does not, and the new entries hold ${carrying} bytes where ${moved} left the files the base held over budget: a new ceiling only carries bytes moved out of another`]);
        else if (cap !== sizes.get(f)) bad.push(['raised', f, `${f}'s new ceiling of ${cap} is not its size (${sizes.get(f) ?? 'gone'}): a carried ceiling is the bytes that moved, with no slack`]);
      }
      else if (f in then.files && cap > then.files[f]) bad.push(['raised', f, `${f}'s ceiling went up from ${then.files[f]} to ${cap}: the baseline only shrinks`]);
    }
    for (const f of Object.keys(now.ledgers)) {
      if (!(f in then.ledgers)) bad.push(['raised', f, `${f} is a new ledger: the list of ledgers only shrinks`]);
    }
  }
  return { bad, notes };
}

// Lowers each ceiling to its file's size and drops what has fallen under the
// limit or gone. Never raises one or adds one: a grown file stays red.
export function lowered(sizes, now) {
  const files = {}, ledgers = {};
  for (const [f, cap] of Object.entries(now.files)) {
    const n = sizes.get(f);
    if (n != null && n > LIMIT) files[f] = Math.min(cap, n);
  }
  for (const [f, why] of Object.entries(now.ledgers)) if ((sizes.get(f) ?? 0) > WARN) ledgers[f] = why;
  return { about: now.about, ledgers, files };
}

const write = (root, b) => {
  const sorted = Object.fromEntries(Object.entries(b.files).sort(([a], [c]) => a.localeCompare(c)));
  fs.writeFileSync(path.join(root, BASELINE), `${JSON.stringify({ about: b.about, ledgers: b.ledgers, files: sorted }, null, 2)}\n`);
};

// The commit the baseline's history is read from (see the header), or a reason there is none.
function baseCommit(root, ref, ci) {
  const has = (c) => { try { git(root, 'cat-file', '-e', `${c}^{commit}`); return true; } catch { return false; } };
  if (ref) return { sha: git(root, 'merge-base', ref, 'HEAD').trim() };
  if (ci) {
    const parent = git(root, 'cat-file', '-p', 'HEAD').match(/^parent ([0-9a-f]{40})$/m)?.[1];
    if (!parent) return { error: 'HEAD has no parent to read the base\'s baseline from' };
    if (!has(parent)) {
      for (let i = 0; i < 4 && !has(parent); i++) {
        try { git(root, 'fetch', '--no-tags', '--depth=1', 'origin', parent); } catch { /* tried again below */ }
      }
      if (!has(parent)) return { error: `could not fetch the base ${parent.slice(0, 9)} to read its baseline` };
    }
    return { sha: parent };
  }
  try { return { sha: git(root, 'merge-base', 'origin/main', 'HEAD').trim() }; } catch { return { none: 'no --base and no origin/main' }; }
}

// `pr`: in CI, whether the run is a pull request's (a deploy's is main's own
// push, or a run by hand); a session's run is treated as a pull request's.
export function run(root, { ref = null, ci = !!process.env.GITHUB_ACTIONS, pr = !ci || process.env.GITHUB_EVENT_NAME === 'pull_request' } = {}) {
  const now = parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'), BASELINE);
  const base = baseCommit(root, ref, ci);
  let then = null, was = null;
  const notes = [];
  if (base.error) return { bad: [['base', '', base.error]], notes, now };
  if (base.none) notes.push(['note', '', `the base is not read (${base.none}): neither the baseline's history nor each file's size there`]);
  else {
    try { then = parse(git(root, 'show', `${base.sha}:${BASELINE}`), `${base.sha.slice(0, 9)}:${BASELINE}`); } catch (e) {
      if (/does not exist|exists on disk, but not in/.test(String(e.stderr ?? e.message))) notes.push(['note', '', `the base ${base.sha.slice(0, 9)} has no ${BASELINE} yet`]);
      else throw e;
    }
    // Every blob's size at the base, one call: `<mode> blob <sha> <size>\t<path>`.
    was = new Map(git(root, 'ls-tree', '-r', '-l', '-z', base.sha).split('\0').filter(Boolean)
      .map((l) => l.match(/^\S+ blob \S+ +(\d+)\t(.*)$/s)).filter(Boolean).map((m) => [m[2], +m[1]]));
  }
  const sizes = measure(root);
  const j = judge(sizes, now, then, was, pr);
  return { bad: j.bad, notes: [...notes, ...j.notes], sizes, now, base: base.sha };
}

// How a note is printed. A warning is an annotation on the pull request's file
// in CI as well as a line in the log: checks.mjs passes a check's output
// through as it comes, so GitHub reads the `::warning` line. Its properties
// are escaped as GitHub's toolkit escapes them, for a path with a comma.
const prop = (v) => String(v).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
export function said([k, f, what], ci) {
  if (k !== 'big') return `note: ${what}`;
  return ci ? `::warning file=${prop(f)},title=${prop(`Over ${kb(WARN)}`)}::${what}` : `warning: ${what}`;
}

// --- The self-test --------------------------------------------------------------
// Each rule meets the break it is there for, in a real repository, through the
// same run() the real tree goes through: git's listing, the binary test, the
// base read from history.
function selftest() {
  let failed = 0;
  const t = (ok, what, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} self-test: ${what}${ok || !detail ? '' : `: ${detail}`}`);
    if (!ok) failed++;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sizes-'));
  const g = (...a) => git(dir, '-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...a);
  const put = (f, n, fill = 'a') => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), fill.repeat(n)); };
  const add = (f, n) => fs.appendFileSync(path.join(dir, f), 'b'.repeat(n));
  const baseline = (b) => { fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true }); fs.writeFileSync(path.join(dir, BASELINE), JSON.stringify(b)); };
  const BIG = 240 * 1024, NEW = LIMIT + 1024;
  try {
    g('init', '-q', '-b', 'main');
    put('src/small.ts', 1024);
    put('src/big.ts', BIG);
    put('src/mid.ts', 60 * 1024);
    put('PLAN.md', 60 * 1024);
    put('song.opus', 300 * 1024, 'a\0');
    put('package-lock.json', 100 * 1024);
    put('.gitignore', 0); fs.writeFileSync(path.join(dir, '.gitignore'), 'scratch/\n');
    baseline({ ledgers: { 'PLAN.md': 'grows by design' }, files: { 'src/big.ts': BIG } });
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    const base = g('rev-parse', 'HEAD').trim();
    const kinds = () => run(dir, { ref: base, ci: false }).bad.map(([k, f]) => `${k} ${f}`).sort();
    const warned = () => run(dir, { ref: base, ci: false }).notes.filter(([k]) => k === 'big').map(([, f]) => f).sort();
    const reset = () => { g('reset', '-q', '--hard', base); g('clean', '-qfdx'); };
    const expect = (what, setup, want) => {
      reset(); setup();
      const got = kinds();
      t(got.join() === [...want].sort().join(), what, `wanted [${want.join(', ')}], got [${got.join(', ')}]`);
    };
    expect('the tree as recorded passes', () => {}, []);
    expect('a file over budget grown by one byte fails', () => add('src/big.ts', 1), ['grew src/big.ts']);
    expect('the same, committed', () => { add('src/big.ts', 1); g('commit', '-qam', 'grow'); }, ['grew src/big.ts']);
    expect('a new 101 KB file fails', () => put('src/new.ts', NEW), ['new src/new.ts']);
    expect('a new file of exactly 100 KB passes', () => put('src/new.ts', LIMIT), []);
    expect('a new file one byte over 100 KB fails', () => put('src/new.ts', LIMIT + 1), ['new src/new.ts']);
    expect('a 101 KB file in a new folder, untracked, fails', () => put('docs/deep/notes.md', NEW), ['new docs/deep/notes.md']);
    expect('a 101 KB file git ignores passes', () => put('scratch/big.mjs', NEW), []);
    expect('a small file grown past 100 KB fails', () => add('src/small.ts', LIMIT), ['new src/small.ts']);
    expect('a file between the bars grown to 100 KB passes', () => put('src/mid.ts', LIMIT), []);
    // The warning: on what this change made or grew between the bars, and on
    // nothing else, or forty files would be news on every run.
    const warns = (what, setup, want) => { reset(); setup(); const got = warned(); t(got.join() === want.join(), what, `wanted [${want.join(', ')}], got [${got.join(', ')}]`); };
    warns('a new 41 KB file is a warning', () => put('src/new.ts', 41 * 1024), ['src/new.ts']);
    warns('a new file of exactly 40 KB is not', () => put('src/new.ts', WARN), []);
    warns('a small file grown past 40 KB is a warning', () => add('src/small.ts', WARN), ['src/small.ts']);
    warns('a file between the bars that grows is a warning', () => add('src/mid.ts', 1), ['src/mid.ts']);
    warns('one this change did not grow is not', () => put('src/other.ts', 100), []);
    warns('nor one it shrank', () => put('src/mid.ts', 50 * 1024), []);
    warns('a new file over 100 KB fails rather than warns', () => put('src/new.ts', NEW), []);
    warns('nor does a ledger, or a file with a ceiling', () => { add('PLAN.md', 1); add('src/big.ts', 1); }, []);
    reset();
    const blind = run(dir, { ci: false }).notes.filter(([k]) => k === 'big').map(([, f]) => f).join();
    t(blind === 'src/mid.ts', 'with no base to tell what grew, every file between the bars is a warning', blind || 'none');
    const w = said(['big', 'src/a,b.ts', 'src/a,b.ts is 41.0 KB'], true);
    t(w === '::warning file=src/a%2Cb.ts,title=Over 40.0 KB::src/a,b.ts is 41.0 KB', 'in CI a warning is an annotation on the file, its path escaped', w);
    t(said(['big', 'x', 'y'], false) === 'warning: y' && said(['stale', 'x', 'y'], true) === 'note: y', 'in a session it is a line, and a note is never an annotation');
    expect('a big file renamed is a new file over budget', () => g('mv', 'src/big.ts', 'src/moved.ts'), ['new src/moved.ts', 'stale src/big.ts']);
    expect('a big binary file passes', () => put('clip.mp4', 200 * 1024, '\0a'), []);
    expect('a package-lock.json in a folder passes', () => put('desktop/package-lock.json', 200 * 1024), []);
    expect('a ledger that grows passes', () => add('PLAN.md', 10 * 1024), []);
    expect('a ceiling raised to let a grown file through fails', () => { add('src/big.ts', 100); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG + 100 } }); }, ['raised src/big.ts', 'grew src/big.ts']);
    expect('a ceiling added for a new big file fails', () => { put('src/new.ts', NEW); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG, 'src/new.ts': NEW } }); }, ['raised src/new.ts']);
    expect('a move out of a big file carries its ceiling to the new file', () => { put('src/big.ts', BIG - NEW); put('src/new.ts', NEW); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG - NEW, 'src/new.ts': NEW } }); }, []);
    expect('a carried ceiling with slack in it fails', () => { put('src/big.ts', BIG - NEW - 2048); put('src/new.ts', NEW); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG - NEW - 2048, 'src/new.ts': NEW + 1024 } }); }, ['raised src/new.ts']);
    expect('a carried ceiling bigger than what moved out fails', () => { put('src/big.ts', BIG - NEW); put('src/new.ts', NEW + 1024); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG - NEW, 'src/new.ts': NEW + 1024 } }); }, ['raised src/new.ts']);
    expect('a big file renamed with its entry moved passes', () => { g('mv', 'src/big.ts', 'src/moved.ts'); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/moved.ts': BIG } }); }, []);
    expect('a new big file made a ledger fails', () => { put('src/new.ts', NEW); baseline({ ledgers: { 'PLAN.md': 'x', 'src/new.ts': 'x' }, files: { 'src/big.ts': BIG } }); }, ['raised src/new.ts']);
    expect('a file under its ceiling by the slack passes', () => put('src/big.ts', BIG - SLACK), []);
    expect('a file further under its ceiling fails until lowered', () => put('src/big.ts', BIG - SLACK - 1), ['stale src/big.ts']);
    expect('lowered, it passes', () => { put('src/big.ts', BIG - 8 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, []);
    expect('lowered, it cannot grow back', () => { put('src/big.ts', BIG - 8 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); add('src/big.ts', 1); }, ['grew src/big.ts']);
    expect('lowering does not raise a grown file', () => { add('src/big.ts', 10); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, ['grew src/big.ts']);
    expect('a file back under the limit fails until its ceiling goes', () => put('src/big.ts', 60 * 1024), ['stale src/big.ts']);
    expect('and passes once lowering drops it', () => { put('src/big.ts', 60 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, []);
    expect('a ledger under the warning fails until it leaves the list', () => put('PLAN.md', 1024), ['stale PLAN.md']);
    expect('a ledger between the bars stays one', () => put('PLAN.md', 41 * 1024), []);
    expect('and lowering keeps it', () => { put('PLAN.md', 41 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); t('PLAN.md' in parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), '').ledgers, 'lowering keeps a ledger between the bars on the list'); }, []);
    // Inside the slack and back under 100 KB: stale for the limit, not the slack.
    reset(); put('src/edge.ts', LIMIT + 3 * 1024); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG, 'src/edge.ts': LIMIT + 3 * 1024 } }); g('add', '-A'); g('commit', '-qm', 'a file 3 KB over the limit');
    const edgeBase = g('rev-parse', 'HEAD').trim();
    put('src/edge.ts', LIMIT);
    const edge = run(dir, { ref: edgeBase, ci: false }).bad.map(([k, f]) => `${k} ${f}`).join();
    t(edge === 'stale src/edge.ts', 'a file trimmed 3 KB to exactly 100 KB, inside the slack, has its ceiling dropped', edge || 'passed');
    // The review of #548: credited on the sum of ceilings, a ceiling sitting
    // above its file at the base (slack, or an entry for a file that has
    // already shrunk) paid for a fresh file over budget with no bytes moved.
    reset(); put('src/slack.ts', 105 * 1024); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG, 'src/slack.ts': 120 * 1024 } }); g('add', '-A'); g('commit', '-qm', 'a base with slack');
    const slackBase = g('rev-parse', 'HEAD').trim();
    put('src/slack.ts', 90 * 1024); put('src/fresh.ts', NEW + 512);
    baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG, 'src/fresh.ts': NEW + 512 } });
    const funded = run(dir, { ref: slackBase, ci: false }).bad.map(([k, f]) => `${k} ${f}`).sort().join(', ');
    t(funded === 'raised src/fresh.ts', 'slack under a base ceiling cannot fund a fresh file: only the 15 KB that moved counts, not the 120 KB ceiling', funded || 'passed');
    // In CI the base is HEAD^1 (the PR's merge commit's first parent), read
    // without a ref: a ceiling raised in the PR's last commit is caught there.
    reset(); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG + 100 } }); g('commit', '-qam', 'raise');
    const ci = run(dir, { ci: true, pr: true }).bad.map(([k, f]) => `${k} ${f}`);
    t(ci.join() === 'raised src/big.ts', 'in CI, a ceiling raised against HEAD^1 fails', ci.join(', '));
    reset();
    const first = run(dir, { ci: true, pr: true });
    t(first.bad.length === 1 && first.bad[0][0] === 'base', 'in CI, a base that cannot be read fails rather than passes', first.bad.map((b) => b[2]).join('; ') || 'passed');

    // PRs land on top of each other (the review of #545). The file in lines,
    // so git merges two edits at its two ends the way it merges two PRs.
    const line = (i) => `${String(i).padStart(63, '0')}\n`;
    const lines = (f, n) => fs.writeFileSync(path.join(dir, f), Array.from({ length: n / 64 }, (_, i) => line(i)).join(''));
    const drop = (f, head, tail) => { const l = fs.readFileSync(path.join(dir, f), 'utf8').split(/(?<=\n)/); fs.writeFileSync(path.join(dir, f), l.slice(head, l.length - tail).join('')); };
    const ciKinds = (pr) => { const r = run(dir, { ci: true, pr }); return [r.bad.map(([k, f]) => `${k} ${f}`).sort().join(', '), r.notes.map(([k, f]) => `${k} ${f}`).join(', ')]; };
    reset(); lines('src/big.ts', BIG); g('commit', '-qam', 'in lines');
    const lined = g('rev-parse', 'HEAD').trim();
    g('checkout', '-qb', 'trim-tail'); drop('src/big.ts', 0, 40); g('commit', '-qam', 'PR B trims 2.5 KB');
    g('checkout', '-q', 'main'); drop('src/big.ts', 40, 0); g('commit', '-qam', 'PR A trims 2.5 KB');
    g('merge', '-q', '--no-edit', 'trim-tail');
    const both = fs.statSync(path.join(dir, 'src/big.ts')).size;
    let [b, n] = ciKinds(false);
    t(both === BIG - 80 * 64 && b === '' && n === 'stale src/big.ts', 'two PRs each trimming 2.5 KB land 5 KB under the ceiling: main stays green, with a note', `${both} bytes; red [${b}], notes [${n}]`);
    put('src/other.ts', 100); g('add', '-A'); g('commit', '-qm', 'a PR that does not touch it');
    [b] = ciKinds(true);
    t(b === '', 'a later PR that does not resize the file is not asked to bank it', b);
    drop('src/big.ts', 1, 0); g('commit', '-qam', 'a PR that trims one more line');
    [b] = ciKinds(true);
    t(b === 'stale src/big.ts', 'a later PR that resizes it is', b || 'passed');
    g('reset', '-q', '--hard', lined); drop('src/big.ts', 48, 0); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG } }); g('commit', '-qam', 'main 3 KB under its ceiling');
    const under = g('rev-parse', 'HEAD').trim();
    fs.appendFileSync(path.join(dir, 'src/big.ts'), Array.from({ length: 32 }, (_, i) => line(9000 + i)).join('')); g('commit', '-qam', 'PR adds 2 KB');
    [b] = ciKinds(true);
    t(b === 'grew src/big.ts', 'main 3 KB under its ceiling: a PR adding 2 KB is red on its own, so two cannot land 1 KB over', b || 'passed');
    t(run(dir, { ref: under, ci: false }).bad.some(([k]) => k === 'grew'), 'and the same against --base in a session');
    // A file with no ceiling, 3 KB under the limit: two PRs of 2 KB each are
    // green against their bases and land 1 KB over it on main.
    g('reset', '-q', '--hard', lined); lines('src/mid.ts', LIMIT - 3 * 1024); g('add', '-A'); g('commit', '-qm', 'a file 3 KB under the limit');
    const near = g('rev-parse', 'HEAD').trim();
    g('checkout', '-qb', 'grow-head'); fs.writeFileSync(path.join(dir, 'src/mid.ts'), Array.from({ length: 32 }, (_, i) => line(8000 + i)).join('') + fs.readFileSync(path.join(dir, 'src/mid.ts'), 'utf8')); g('commit', '-qam', 'PR B adds 2 KB');
    [b] = ciKinds(true);
    t(b === '', 'a PR that grows a file to 2 KB under the limit is green', b);
    g('checkout', '-q', 'main'); fs.appendFileSync(path.join(dir, 'src/mid.ts'), Array.from({ length: 32 }, (_, i) => line(9000 + i)).join('')); g('commit', '-qam', 'PR A adds 2 KB');
    g('merge', '-q', '--no-edit', 'grow-head');
    const over = fs.statSync(path.join(dir, 'src/mid.ts')).size;
    [b, n] = ciKinds(false);
    t(over === LIMIT + 1024 && b === '' && /new src\/mid\.ts/.test(n), 'two such PRs land 1 KB over the limit: main stays green, with a note', `${over} bytes; red [${b}], notes [${n}]`);
    put('src/other.ts', 200); g('add', '-A'); g('commit', '-qm', 'a PR that does not touch it');
    [b] = ciKinds(true);
    t(b === '', 'a later PR that does not resize the file is not red for it', b);
    add('src/mid.ts', 1); g('commit', '-qam', 'a PR that grows it');
    [b] = ciKinds(true);
    t(b === 'new src/mid.ts', 'a later PR that resizes it is, and owns the split', b || 'passed');
    t(run(dir, { ref: near, ci: false }).bad.some(([k, f]) => k === 'new' && f === 'src/mid.ts'), 'and in a session, against the base before both, it is red');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return failed;
}

// --- The real tree ---------------------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const ref = args.includes('--base') ? args[args.indexOf('--base') + 1] : null;
  if (args.includes('--update')) {
    const now = parse(fs.readFileSync(path.join(ROOT, BASELINE), 'utf8'), BASELINE);
    const next = lowered(measure(ROOT), now);
    write(ROOT, next);
    const gone = Object.keys(now.files).filter((f) => !(f in next.files));
    const low = Object.keys(next.files).filter((f) => next.files[f] < now.files[f]);
    console.log(`${BASELINE}: ${low.length} ceilings lowered${low.length ? ` (${low.join(', ')})` : ''}, ${gone.length} dropped${gone.length ? ` (${gone.join(', ')})` : ''}`);
    process.exit(0);
  }
  let failed = selftest();
  const r = run(ROOT, { ref });
  for (const n of r.notes) console.log(said(n, !!process.env.GITHUB_ACTIONS));
  for (const [, , what] of r.bad) { console.log(`FAIL ${what}`); failed++; }
  if (r.sizes) {
    const held = Object.keys(r.now.files).length, total = Object.values(r.now.files).reduce((a, b) => a + b, 0);
    console.log(`${r.bad.length ? 'FAIL' : 'ok  '} ${r.sizes.size} text files: every other one at or under ${kb(LIMIT)}, ${held} over it held at their ceilings (${kb(total)} in all), ${Object.keys(r.now.ledgers).length} ledgers${r.base ? `; baseline read against ${r.base.slice(0, 9)}` : ''}`);
  }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
