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
//   1. a file that is not in the baseline stays at or under 40 KB (about ten
//      thousand tokens, what a session can read whole without regret);
//   2. a file already over 40 KB is in the baseline with its size, and may
//      not grow past it. New code for it goes in a new module beside it.
//
// The baseline is scripts/sizes.json, and it only shrinks. Against the commit
// this one is measured from (below), an entry may be lowered or removed, never
// raised or added: otherwise the way to get a grown App.tsx green would be to
// write its new size in, and the check would be a form to fill in. A big file
// renamed is a new file over budget, so a rename does not launder it either.
//
// Why there is slack below a ceiling and none above it. If a file that shrinks
// at all had to have its entry lowered in the same PR, nearly every PR that
// touches App.tsx would touch the same line of sizes.json, and the ten or so
// sessions working at once would conflict there all day (and GitHub runs no CI
// on a PR that conflicts). So a file may sit up to 4 KB under its ceiling
// unremarked; past that the check fails until `npm run sizes -- --update`
// lowers the entry, so a real move out (the solver leaving the visualizer) has
// to bank what it saved and cannot be quietly regrown. What can come back
// unannounced is at most 4 KB a file, about a thousand tokens.
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
//     a ledger that falls under 40 KB has to leave it.
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
const BUDGET = 40 * 1024;
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
// tree, `then` the baseline at the base (null when the base has none).
export function judge(sizes, now, then) {
  const bad = [];
  for (const f of Object.keys(now.ledgers)) {
    if (f in now.files) bad.push(['both', f, `${f} is both a ledger and a ceiling in ${BASELINE}`]);
    if (!sizes.has(f)) bad.push(['stale', f, `${f} is a ledger but no longer here: take it out of ${BASELINE}`]);
    else if (sizes.get(f) <= BUDGET) bad.push(['stale', f, `${f} is a ledger at ${kb(sizes.get(f))}, under the ${kb(BUDGET)} budget: take it out of the ledgers`]);
  }
  for (const [f, cap] of Object.entries(now.files)) {
    const n = sizes.get(f);
    if (n == null) bad.push(['stale', f, `${f} has a ceiling but is no longer here: \`npm run sizes -- --update\` drops it`]);
    else if (n > cap) bad.push(['grew', f, `${f} grew to ${n} bytes past its ceiling of ${cap} (+${n - cap}): move the new code into a module beside it`]);
    else if (n <= BUDGET) bad.push(['stale', f, `${f} is ${kb(n)}, back under the budget: \`npm run sizes -- --update\` drops its ceiling`]);
    else if (cap - n > SLACK) bad.push(['stale', f, `${f} is ${n} bytes, ${cap - n} under its ceiling of ${cap}: \`npm run sizes -- --update\` banks it`]);
  }
  for (const [f, n] of sizes) {
    if (n > BUDGET && !(f in now.files) && !(f in now.ledgers)) bad.push(['new', f, `${f} is ${kb(n)} (${n} bytes), over the ${kb(BUDGET)} budget for a file: split it`]);
  }
  if (then) {
    for (const [f, cap] of Object.entries(now.files)) {
      if (!(f in then.files) && !(f in then.ledgers)) bad.push(['raised', f, `${f} has a ceiling the base's ${BASELINE} does not: the baseline only shrinks`]);
      else if (f in then.files && cap > then.files[f]) bad.push(['raised', f, `${f}'s ceiling went up from ${then.files[f]} to ${cap}: the baseline only shrinks`]);
    }
    for (const f of Object.keys(now.ledgers)) {
      if (!(f in then.ledgers)) bad.push(['raised', f, `${f} is a new ledger: the list of ledgers only shrinks`]);
    }
  }
  return bad;
}

// Lowers each ceiling to its file's size and drops what has fallen under the
// budget or gone. Never raises one or adds one: a grown file stays red.
export function lowered(sizes, now) {
  const files = {}, ledgers = {};
  for (const [f, cap] of Object.entries(now.files)) {
    const n = sizes.get(f);
    if (n != null && n > BUDGET) files[f] = Math.min(cap, n);
  }
  for (const [f, why] of Object.entries(now.ledgers)) if ((sizes.get(f) ?? 0) > BUDGET) ledgers[f] = why;
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

export function run(root, { ref = null, ci = !!process.env.GITHUB_ACTIONS } = {}) {
  const now = parse(fs.readFileSync(path.join(root, BASELINE), 'utf8'), BASELINE);
  const base = baseCommit(root, ref, ci);
  let then = null, note = null;
  if (base.error) return { bad: [['base', '', base.error]], now };
  if (base.none) note = `the baseline's history is not read (${base.none})`;
  else {
    try { then = parse(git(root, 'show', `${base.sha}:${BASELINE}`), `${base.sha.slice(0, 9)}:${BASELINE}`); } catch (e) {
      if (/does not exist|exists on disk, but not in/.test(String(e.stderr ?? e.message))) note = `the base ${base.sha.slice(0, 9)} has no ${BASELINE} yet`;
      else throw e;
    }
  }
  const sizes = measure(root);
  return { bad: judge(sizes, now, then), sizes, now, note, base: base.sha };
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
  const BIG = 50 * 1024;
  try {
    g('init', '-q', '-b', 'main');
    put('src/small.ts', 1024);
    put('src/big.ts', BIG);
    put('PLAN.md', 60 * 1024);
    put('song.opus', 100 * 1024, 'a\0');
    put('package-lock.json', 100 * 1024);
    put('.gitignore', 0); fs.writeFileSync(path.join(dir, '.gitignore'), 'scratch/\n');
    baseline({ ledgers: { 'PLAN.md': 'grows by design' }, files: { 'src/big.ts': BIG } });
    g('add', '-A'); g('commit', '-q', '-m', 'base');
    const base = g('rev-parse', 'HEAD').trim();
    const kinds = () => run(dir, { ref: base, ci: false }).bad.map(([k, f]) => `${k} ${f}`).sort();
    const reset = () => { g('reset', '-q', '--hard', base); g('clean', '-qfdx'); };
    const expect = (what, setup, want) => {
      reset(); setup();
      const got = kinds();
      t(got.join() === [...want].sort().join(), what, `wanted [${want.join(', ')}], got [${got.join(', ')}]`);
    };
    expect('the tree as recorded passes', () => {}, []);
    expect('a file over budget grown by one byte fails', () => add('src/big.ts', 1), ['grew src/big.ts']);
    expect('the same, committed', () => { add('src/big.ts', 1); g('commit', '-qam', 'grow'); }, ['grew src/big.ts']);
    expect('a new 41 KB file fails', () => put('src/new.ts', 41 * 1024), ['new src/new.ts']);
    expect('a new file of exactly 40 KB passes', () => put('src/new.ts', BUDGET), []);
    expect('a new file one byte over 40 KB fails', () => put('src/new.ts', BUDGET + 1), ['new src/new.ts']);
    expect('a 41 KB file in a new folder, untracked, fails', () => put('docs/deep/notes.md', 41 * 1024), ['new docs/deep/notes.md']);
    expect('a 41 KB file git ignores passes', () => put('scratch/big.mjs', 41 * 1024), []);
    expect('a small file grown past 40 KB fails', () => add('src/small.ts', BUDGET), ['new src/small.ts']);
    expect('a big file renamed is a new file over budget', () => g('mv', 'src/big.ts', 'src/moved.ts'), ['new src/moved.ts', 'stale src/big.ts']);
    expect('a big binary file passes', () => put('clip.mp4', 200 * 1024, '\0a'), []);
    expect('a package-lock.json in a folder passes', () => put('desktop/package-lock.json', 200 * 1024), []);
    expect('a ledger that grows passes', () => add('PLAN.md', 10 * 1024), []);
    expect('a ceiling raised to let a grown file through fails', () => { add('src/big.ts', 100); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG + 100 } }); }, ['raised src/big.ts']);
    expect('a ceiling added for a new big file fails', () => { put('src/new.ts', 41 * 1024); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG, 'src/new.ts': 41 * 1024 } }); }, ['raised src/new.ts']);
    expect('a new big file made a ledger fails', () => { put('src/new.ts', 41 * 1024); baseline({ ledgers: { 'PLAN.md': 'x', 'src/new.ts': 'x' }, files: { 'src/big.ts': BIG } }); }, ['raised src/new.ts']);
    expect('a file under its ceiling by the slack passes', () => put('src/big.ts', BIG - SLACK), []);
    expect('a file further under its ceiling fails until lowered', () => put('src/big.ts', BIG - SLACK - 1), ['stale src/big.ts']);
    expect('lowered, it passes', () => { put('src/big.ts', BIG - 8 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, []);
    expect('lowered, it cannot grow back', () => { put('src/big.ts', BIG - 8 * 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); add('src/big.ts', 1); }, ['grew src/big.ts']);
    expect('lowering does not raise a grown file', () => { add('src/big.ts', 10); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, ['grew src/big.ts']);
    expect('a file back under budget fails until its ceiling goes', () => put('src/big.ts', 1024), ['stale src/big.ts']);
    expect('and passes once lowering drops it', () => { put('src/big.ts', 1024); write(dir, lowered(measure(dir), parse(fs.readFileSync(path.join(dir, BASELINE), 'utf8'), ''))); }, []);
    expect('a ledger under budget fails until it leaves the list', () => put('PLAN.md', 1024), ['stale PLAN.md']);
    // In CI the base is HEAD^1 (the PR's merge commit's first parent), read
    // without a ref: a ceiling raised in the PR's last commit is caught there.
    reset(); add('src/big.ts', 100); baseline({ ledgers: { 'PLAN.md': 'x' }, files: { 'src/big.ts': BIG + 100 } }); g('commit', '-qam', 'raise');
    const ci = run(dir, { ci: true }).bad.map(([k, f]) => `${k} ${f}`);
    t(ci.join() === 'raised src/big.ts', 'in CI, a ceiling raised against HEAD^1 fails', ci.join(', '));
    reset();
    const first = run(dir, { ci: true });
    t(first.bad.length === 1 && first.bad[0][0] === 'base', 'in CI, a base that cannot be read fails rather than passes', first.bad.map((b) => b[2]).join('; ') || 'passed');
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
  if (r.note) console.log(`note: ${r.note}`);
  for (const [, , what] of r.bad) { console.log(`FAIL ${what}`); failed++; }
  if (r.sizes) {
    const held = Object.keys(r.now.files).length, total = Object.values(r.now.files).reduce((a, b) => a + b, 0);
    console.log(`${r.bad.length ? 'FAIL' : 'ok  '} ${r.sizes.size} text files: every other one at or under ${kb(BUDGET)}, ${held} over it held at their ceilings (${kb(total)} in all), ${Object.keys(r.now.ledgers).length} ledgers${r.base ? `; baseline read against ${r.base.slice(0, 9)}` : ''}`);
  }
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
