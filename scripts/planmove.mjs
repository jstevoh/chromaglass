// Carry a branch's edits of the old one-file PLAN.md, and of the old one-file archive
// docs/plan-shipped.md, into the split plan and the split archive (PLAN.md 19m, 19m-3).
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
//
// The archive, since 19m-3. `docs/plan-shipped.md` was cut the same way into
// `docs/plan-shipped/`, one file a section, and some twenty open branches had appended a
// story to it. Main deleted the file, so merging main stops on it ("deleted by them") with
// the branch's copy left in the tree. Its hunks are carried too, but an appended story is
// not placed by its context: the old file's last lines are now the end of the QA list's
// file, and a §14 story found there would be filed with the QA list. A hunk that only adds
// lines and has a heading with an id among them (`### 14x. …`) goes instead to the end of
// that section's last file, under `## Shipped after the split`, its first heading made a
// `###`; any other archive hunk (an edit inside a story) is found by its context, in the
// archive first. Once every hunk landed the old file is removed from the merge.
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

const ARCHIVE = 'docs/plan-shipped.md';
const hunksOf = (from) => {
  const diff = git('diff', '-U3', '--no-color', base, mine, '--', from), out = [];
  for (const block of diff.split(/^(?=@@ )/m).slice(1)) {
    const [head, ...body] = block.replace(/\n$/, '').split('\n');
    const start = Number(/^@@ -(\d+)/.exec(head)[1]);
    const lines = body.filter((l) => !l.startsWith('\\'));
    out.push({ from, start, old: lines.filter((l) => l[0] !== '+').map((l) => l.slice(1)), lines });
  }
  return out;
};
const hunks = [...hunksOf('PLAN.md'), ...hunksOf(ARCHIVE)];
if (!hunks.length) { console.log(`the branch made no change to PLAN.md or ${ARCHIVE} since ${base.slice(0, 7)}: nothing to carry`); process.exit(0); }

const level = (s) => (/^(#{1,6}) /.exec(s) ?? [, ''])[1].length;
const norm = (s) => s.replace(/^#{1,6} /, '').trimEnd();
// Main's files: listed from main's tree, so a dry run before the merge sees them too; read
// from the working tree where they are there (a merge in progress), else from main. In a
// merge the working tree's PLAN.md is the conflict, so the index is always main's.
const listed = (dir) => git('ls-tree', '--name-only', `${theirs}:${dir}`).split('\n').filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => `${dir}/${f}`);
const open = ['PLAN.md', ...listed('docs/plan')], shipped = listed('docs/plan-shipped'), files = [...open, ...shipped];
const read = (f) => (f !== 'PLAN.md' && fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f), 'utf8') : git('show', `${theirs}:${f}`));
const text = new Map(files.map((f) => [f, read(f).split('\n')]));
// The last file of a section's archive: `14-show-at-the-gig-4.md` after `-3` and the first.
const part = (f) => Number(/-(\d)\.md$/.exec(f)?.[1] ?? 1);
const lastOf = (id) => {
  const sec = id === 'QA' ? 'qa' : String(Number.parseInt(id, 10)).padStart(2, '0');
  return shipped.filter((f) => path.basename(f).startsWith(sec === 'qa' ? 'qa' : `${sec}-`)).sort((a, b) => part(a) - part(b)).at(-1);
};
const AFTER = '## Shipped after the split';

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
const unplaced = [], appends = [];
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
  if (h.from === ARCHIVE && h.lines.every((l) => l[0] !== '-')) {
    const added = h.lines.filter((l) => l[0] === '+').map((l) => l.slice(1));
    const at = added.findIndex((l) => /^#{2,6} (?:~~)?(\d+[a-z]*|QA)\b/.test(l));
    // Only blank lines before the first heading, or the hunk is placed by its context. Each
    // story at the first heading's level or above goes to its own section.
    if (at >= 0 && !added.slice(0, at).some((l) => l.trim())) {
      const stories = [];
      for (const l of added.slice(at)) {
        const id = level(l) && level(l) <= level(added[at]) && /^#{2,6} (?:~~)?(\d+|QA)/.exec(l)?.[1];
        if (id) stories.push({ f: lastOf(id), lines: [] });
        stories.at(-1).lines.push(l);
      }
      if (stories.every((s) => s.f)) { appends.unshift(...stories.map((s) => ({ h, ...s }))); placed++; continue; }
    }
  }
  // The open plan first and then the archive for PLAN.md's hunks; the archive first for
  // the old archive's.
  const hit = h.from === ARCHIVE ? (place(shipped) ?? place(open)) : (place(open) ?? place(files));
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
  console.log(`${dry ? 'would apply' : 'applied'} ${h.from} old line ${h.start} (${h.lines.filter((l) => l[0] === '+').length}+ ${h.lines.filter((l) => l[0] === '-').length}-) in ${hit.f} at line ${hit.i + 1}`);
}
// The appended stories, in the order the branch wrote them (the loop above ran bottom-up).
for (const { h, f, lines: story } of appends) {
  const lines = text.get(f), shift = 3 - level(story[0]);
  while (story.length && !story.at(-1).trim()) story.pop();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  if (!lines.includes(AFTER)) lines.push('', AFTER);
  lines.push('', ...story.map((l) => (level(l) ? '#'.repeat(Math.min(6, Math.max(3, level(l) + shift))) + l.replace(/^#+/, '') : l)), '');
  console.log(`${dry ? 'would append' : 'appended'} ${ARCHIVE} old line ${h.start} (${story.length} lines), a story of §${/^#{2,6} (?:~~)?(\d+[a-z]*(?:-\w+)*|QA-?\d*)/.exec(story[0])[1]}, to the end of ${f}`);
}
for (const h of unplaced.reverse()) {
  console.log(`\nNOT PLACED: ${h.from} old line ${h.start}; place it by docs/plan/README.md's table:`);
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
  if (!unplaced.length && tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD')) {
    git('add', 'PLAN.md', 'docs/plan', 'docs/plan-shipped');
    if (tryGit('ls-files', ARCHIVE)) git('rm', '-q', '--', ARCHIVE);
  }
}
console.log(`\n${placed} of ${hunks.length} hunks ${dry ? 'placeable' : 'placed'}${unplaced.length ? `; ${unplaced.length} to place by hand (above)` : ''}`);
process.exit(unplaced.length ? 1 : 0);
