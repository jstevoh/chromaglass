// Carry a branch's edits of the old one-file PLAN.md into the split plan (PLAN.md 19m).
//
//   node scripts/planmove.mjs              after `git merge origin/main` stops on PLAN.md
//   node scripts/planmove.mjs --dry        say where each hunk would go, write nothing
//   node scripts/planmove.mjs --base <ref> the commit the branch's PLAN.md edits are from
//
// Why it exists. Until 19m the plan was one 820 KB file that nearly every pull request
// wrote in, and on the day it was cut into an index and one file a section about twenty
// open branches had edits in it. Merging main into such a branch conflicts on the whole
// file: main's PLAN.md is now a 45 KB index, the branch's is the old plan with a few
// lines changed. Re-applying those few lines by hand means finding each in a new file,
// and a session that guesses puts a status line in the wrong section, or loses it.
//
// What it does. It reads the branch's own changes to PLAN.md (the diff from the merge
// base with main to the branch's last commit before the merge, so main's side never
// counts), and for each hunk finds the hunk's old lines (its context and what it
// removed) in the new files: PLAN.md, docs/plan/*.md and the archive. The split moved
// lines verbatim, changing only a heading's level (a section's title is `#` in its own
// file) and, for a shipped item, its first line into a stub with its story in the
// archive, so the old lines are found as they were, headings compared without their
// `#`s. A hunk found in exactly one place is applied there, its added headings shifted
// by the level the matched ones moved; a hunk found nowhere is tried again with less
// context, a line at a time from each end; one still not found, or found twice, is
// printed with its old line number, for `docs/plan/README.md`'s table to place by hand.
// Main's PLAN.md (the index) is then taken as the merge's PLAN.md, so the conflict is
// resolved only once every hunk landed or was printed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const tryGit = (...a) => { try { return git(...a).trim(); } catch { return ''; } };

// The branch's side: in a merge in progress it is HEAD (MERGE_HEAD is main); otherwise
// HEAD too, for a dry run before merging.
const mine = 'HEAD';
const theirs = tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD') || 'origin/main';
const baseAt = args.indexOf('--base');
const base = baseAt >= 0 ? args[baseAt + 1] : tryGit('merge-base', mine, theirs);
if (!base) { console.error('no merge base with main: pass --base <ref>'); process.exit(2); }

const diff = git('diff', '-U3', '--no-color', base, mine, '--', 'PLAN.md');
if (!diff) { console.log(`the branch made no change to PLAN.md since ${base.slice(0, 7)}: nothing to carry`); process.exit(0); }

const hunks = [];
for (const block of diff.split(/^(?=@@ )/m).slice(1)) {
  const [head, ...body] = block.replace(/\n$/, '').split('\n');
  const start = Number(/^@@ -(\d+)/.exec(head)[1]);
  const lines = body.filter((l) => !l.startsWith('\\'));
  hunks.push({ start, old: lines.filter((l) => l[0] !== '+').map((l) => l.slice(1)), lines });
}

const level = (s) => (/^(#{1,6}) /.exec(s) ?? [, ''])[1].length;
const norm = (s) => s.replace(/^#{1,6} /, '').trimEnd();
const files = ['PLAN.md', ...fs.readdirSync(path.join(ROOT, 'docs/plan')).filter((f) => f.endsWith('.md')).sort().map((f) => `docs/plan/${f}`), 'docs/plan-shipped.md'];
// Main's version of each file: in a merge the working tree's PLAN.md is the conflict.
const text = new Map(files.map((f) => [f, (f === 'PLAN.md' ? git('show', `${theirs}:PLAN.md`) : fs.readFileSync(path.join(ROOT, f), 'utf8')).split('\n')]));
// The archive is appended to by both sides: the branch's stories and the split's third
// pass both land at its end, so a conflict there is nearly always two appends. Keep both
// (`git merge-file --union` on the merge's three versions) and say so.
if (text.get('docs/plan-shipped.md').some((l) => l.startsWith('<<<<<<<'))) {
  const tmp = fs.mkdtempSync(path.join(ROOT, '.planmove-'));
  try {
    const stage = (n) => { const f = path.join(tmp, String(n)); fs.writeFileSync(f, git('show', `:${n}:docs/plan-shipped.md`)); return f; };
    const [b, o, t] = [1, 2, 3].map(stage);
    try { execFileSync('git', ['merge-file', '--union', o, b, t], { cwd: ROOT }); } catch { /* union never leaves a conflict */ }
    text.set('docs/plan-shipped.md', fs.readFileSync(o, 'utf8').split('\n'));
    console.log('docs/plan-shipped.md conflicted (both sides appended): kept both, the branch\'s first');
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

function find(old, pool) {
  const want = old.map(norm), hits = [];
  if (!want.some((s) => s.trim())) return hits;
  for (const [f, lines] of text) {
    if (!pool.includes(f)) continue;
    for (let i = 0; i + want.length <= lines.length; i++) {
      let k = 0;
      while (k < want.length && norm(lines[i + k]) === want[k]) k++;
      if (k === want.length) hits.push({ f, i });
    }
  }
  return hits;
}

let placed = 0;
const unplaced = [];
// Bottom-up, so a hunk applied in a file never moves the lines a later one is matched at.
for (const h of [...hunks].reverse()) {
  // Trim context a line at a time from either end until the hunk is found once: in the open
  // plan first, and only then in the archive, so a new item written beside a shipped one
  // lands in its section, not with the story that moved.
  const place = (pool) => {
    let lo = 0, hi = h.lines.length;
    for (;;) {
      const slice = h.lines.slice(lo, hi);
      const old = slice.filter((l) => l[0] !== '+').map((l) => l.slice(1));
      const hits = find(old, pool);
      if (hits.length === 1) return { ...hits[0], slice, old };
      const ctxTop = h.lines[lo]?.[0] === ' ', ctxEnd = h.lines[hi - 1]?.[0] === ' ';
      if (hits.length > 1 || (!ctxTop && !ctxEnd)) return null;
      if (ctxTop && (lo <= h.lines.length - hi || !ctxEnd)) lo++; else hi--;
    }
  };
  const hit = place(files.filter((f) => f !== 'docs/plan-shipped.md')) ?? place(files);
  if (!hit) { unplaced.push(h); continue; }
  const lines = text.get(hit.f);
  const shift = (() => {
    for (let k = 0; k < hit.old.length; k++) if (level(hit.old[k])) return level(lines[hit.i + k]) - level(hit.old[k]);
    return 0;
  })();
  const out = [];
  let k = 0;
  for (const l of hit.slice) {
    if (l[0] === '+') out.push(level(l.slice(1)) ? '#'.repeat(Math.max(1, level(l.slice(1)) + shift)) + l.slice(1).replace(/^#+/, '') : l.slice(1));
    else { if (l[0] === ' ') out.push(lines[hit.i + k]); k++; }
  }
  lines.splice(hit.i, hit.old.length, ...out);
  placed++;
  console.log(`${dry ? 'would apply' : 'applied'} old line ${h.start} (${h.lines.filter((l) => l[0] === '+').length}+ ${h.lines.filter((l) => l[0] === '-').length}-) in ${hit.f} at line ${hit.i + 1}`);
}
for (const h of unplaced.reverse()) {
  console.log(`\nNOT PLACED: old line ${h.start}; place it by docs/plan/README.md's table:`);
  for (const l of h.lines) console.log(`  ${l}`);
}
if (!dry) {
  for (const [f, lines] of text) {
    if (f === 'PLAN.md') continue;
    fs.writeFileSync(path.join(ROOT, f), lines.join('\n'));
  }
  fs.writeFileSync(path.join(ROOT, 'PLAN.md'), text.get('PLAN.md').join('\n'));
  // PLAN.md's own hunks (the order of work, the running order) were applied above to
  // main's index; mark the conflict resolved only when nothing was left over.
  if (!unplaced.length && tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD')) git('add', 'PLAN.md', 'docs/plan', 'docs/plan-shipped.md');
}
console.log(`\n${placed} of ${hunks.length} hunks ${dry ? 'placeable' : 'placed'}${unplaced.length ? `; ${unplaced.length} to place by hand (above)` : ''}`);
process.exit(unplaced.length ? 1 : 0);
