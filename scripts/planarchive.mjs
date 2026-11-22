// Sweep the closed items out of the live plan into its archive (PLAN.md 19m-5).
//
//   node scripts/planarchive.mjs          move every closed item, print what moved
//   node scripts/planarchive.mjs --dry    print what would move, write nothing
//
// Why it exists. By 2026-11-21 the open plan under docs/plan/ had grown back to about
// 1.16 MB, and a session that read one section to find the next step read, on the way,
// every shipped item still standing in it: a stub with a struck title, or the whole
// story of an item marked shipped where it stood and never moved to
// `docs/plan-shipped.md`. The owner asked for the old work to go to an archive kept
// for reference, so that the plan a session reads holds only what is still to do.
// Moving each item by hand is how the plan got here: a PR marks its item shipped in
// place, because moving it is a second edit in a second file that nothing asks for.
// So the move is a script, run by anyone at any time, and running it twice moves
// nothing the second time.
//
// What it moves. A plan file is cut into blocks: a heading (`## 32a. ...`), an item
// (a line that opens with a bold id, `- **18c-9** ...`, `**18c-1 shipped**`, or the
// same struck through, `- ~~**18c-2**~~`), and everything under it until the next
// heading or item (its wrapped lines, its indented sub-bullets, its tables). A block is
// closed when its first line says so in one of the ways the plan has written it: struck
// through from the start, `(shipped ...)` or `(fixed)` in its title, `**shipped**` or
// `*Shipped*` beside it, or `Shipped`/`Done`/`Closed`/`Dropped`/`Retired`/`Superseded`
// straight after its bold title. A first line that says only part shipped ("Partly
// shipped", "shipped in part", "first part shipped") stays, because the rest of it is
// open, and so does a closed item whose text still says "Open:" about a leftover. Prose that is not an item (a section's opening, a model's derivation, a
// numbered list of steps) never moves: it is the context the open items lean on.
//
// A closed item with an open sub-item under it stays whole, and its closed sub-items move
// one by one. A closed heading moves its own prose, and moves its heading line too unless open
// items still stand under it, in which case the heading stays as the one-line stub that
// tells those items where they belong (`## ~~32c. The GPU solver~~ — **Shipped, #505**`
// over the open 32c-1 and 32c-2).
//
// Where it goes. `docs/plan/archive/<the same file name>`, appended in reading order,
// each block under the heading it stood under, so the archive of a section reads like
// the section did. The archive lives under docs/plan/ so that `grep -rn '14ab-4'
// docs/plan/` still finds every id the threads, PRs and commits cite, open or not; no
// id is renamed. The stories moved before this script (19m, 19m-2) stay in
// `docs/plan-shipped.md`.
//
// What it checks before it writes. Every line of the plan before the sweep is in the
// plan after it, the same number of times, in a live file or in the archive (a heading
// at least as often: it can be copied as an item's context), and every
// id the plan had is still there: a sweep that lost or doubled a line writes nothing and
// exits 1.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE = path.join(ROOT, 'docs', 'plan');
const ARCHIVE = path.join(LIVE, 'archive');
const dry = process.argv.includes('--dry');

// An item opens with a bold id: a digit, or QA-, H2c-, P7- and the like; at the margin
// as a bullet or a paragraph, or indented under another item (as a bullet or not: the
// plan writes `  **23.21-pro** (open): ...` under a shipped 23.21).
const ITEM = /^\s*(?:- )?(?:~~)?\*\*(?:~~)?(?:QA-|[A-Z])?\d/;
const HEAD = /^(#{2,6}) /;
const FENCE = /^\s*```/;
const STATUS = String.raw`(?:shipped|Shipped|SHIPPED|Done|DONE|Closed|Dropped|Retired|Superseded|Merged|Fixed|Folded|Withdrawn|Obsolete)`;
const CLOSED = [
  /^(?:#{2,6} |- )?~~/,
  /^(?:- )?\*\*~~/,
  new RegExp(String.raw`^(?:#{2,6} |- )?\*\*[^*]{1,40}\s${STATUS}\*\*`),
  new RegExp(String.raw`^(?:#{2,6} |- )?\*\*[^*]+\*\*[\s.,:;]*(?:\(|—|–|-)?\s*[*_]*\s*${STATUS}\b`),
  new RegExp(String.raw`^#{2,6} .*— \**${STATUS}\b`),
  /^(?:#{2,6} [^(]*|- \*\*[^*]*|\*\*[^*]*)\((?:shipped|fixed)\b/,
  /^(?:- )?\*\*(?:QA-|[A-Z])?\d[^ *]*[.:]?\*{0,2} (?:Shipped|Fixed)\b/,
  /^(?:- )?\*\*[^*]*, (?:fixed|shipped)\)/,
  /\*\*shipped\*\*(?! in part)/,
  /\*Shipped\*/,
  /\*\(shipped\b/,
  /, shipped\.\*\*/,
  /^- \*\*[^*]*: shipped by\b/,
  /^- \*\*(?:QA-|[A-Z])?\d[^ ,*]*, shipped\b/,
];
const PARTLY = /Partly shipped|partly shipped|shipped in part|in part,|first part shipped/;
// A closed item whose own text still lists something open ("Open: does a grey smear still
// show", "*Open:* the page's buttons", "**23.20j** (open)") stays: that leftover has no id
// of its own, and in the archive nobody would find it.
const LEFT_OPEN = /(?:^|[\s*(_])Open:|\(open\)/;
const isClosed = (line) => !PARTLY.test(line) && CLOSED.some((r) => r.test(line.trimStart()));
const IDS = /\*\*~*((?:QA-|[A-Z])?\d[\w.-]*)/g;

// Cut a file into blocks. Line 0 to the first heading or item is the preamble.
function blocks(lines) {
  const out = [];
  let fenced = false;
  lines.forEach((line, i) => {
    const opens = !fenced && (HEAD.test(line) || ITEM.test(line));
    if (FENCE.test(line)) fenced = !fenced;
    if (opens || !out.length) {
      const h = line.match(HEAD);
      out.push({ start: i, end: i + 1, kind: opens ? (h ? 'head' : 'item') : 'pre', level: h ? h[1].length : 0, indent: line.length - line.trimStart().length, closed: opens && isClosed(line) });
    } else out[out.length - 1].end = i + 1;
  });
  for (const b of out) if (b.closed && lines.slice(b.start, b.end).some((l) => LEFT_OPEN.test(l))) b.closed = false;
  return out;
}

// Decide, for each line of a live file, whether it moves; and write the archive's text.
function sweep(lines, archiveLines) {
  const bs = blocks(lines);
  const move = new Array(lines.length).fill(false);
  bs.forEach((b, k) => {
    if (b.kind === 'item' && b.closed) {
      // An item's own sub-items are the items after it indented deeper. A closed item with
      // an open one anywhere under it stays whole: its text is that open item's context.
      let openUnder = false;
      for (let j = k + 1; j < bs.length && bs[j].kind === 'item' && bs[j].indent > b.indent; j++) {
        if (!bs[j].closed) openUnder = true;
      }
      if (!openUnder) for (let i = b.start; i < b.end; i++) move[i] = true;
      return;
    }
    if (b.kind !== 'head' || !b.closed) return;
    // The heading's scope: the blocks after it until a heading of its level or higher.
    let openUnder = false;
    for (let j = k + 1; j < bs.length && !(bs[j].kind === 'head' && bs[j].level <= b.level); j++) {
      if (bs[j].kind !== 'pre' && !bs[j].closed) openUnder = true;
    }
    for (let i = b.start + (openUnder ? 1 : 0); i < b.end; i++) move[i] = true;
  });
  // The archive's last heading, so a block is put under its own heading only once.
  let lastHead = [...archiveLines].reverse().find((l) => HEAD.test(l)) ?? null;
  const added = [];
  let context = null;
  for (const b of bs) {
    if (b.kind === 'head') context = lines[b.start];
    // A sub-item moved without its parent goes to the archive at the margin, so four
    // spaces of indent under a blank line do not read as code there.
    const moved = [];
    const cut = (l) => (b.kind === 'item' && b.indent && l.slice(0, b.indent).trim() === '' ? l.slice(b.indent) : l);
    for (let i = b.start; i < b.end; i++) if (move[i]) moved.push(cut(lines[i]));
    if (!moved.some((l) => l.trim())) continue;
    if (context && context !== lastHead) {
      if (moved[0] !== context) added.push('', context, '');
      lastHead = context;
    }
    added.push(...moved);
  }
  const live = lines.filter((_, i) => !move[i]);
  return { live, added, moved: bs.filter((b) => b.closed && (move[b.start] || move[b.start + 1])).length };
}

// Lines compared without their indent, since a sub-item moved alone loses it.
const tally = (all) => all.reduce((m, l) => (l.trim() ? m.set(l.trim(), (m.get(l.trim()) ?? 0) + 1) : m), new Map());
const ids = (all) => new Set(all.flatMap((l) => [...l.matchAll(IDS)].map((m) => m[1].replace(/[.-]+$/, ''))));

const files = fs.readdirSync(LIVE).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
const before = [], after = [], writes = [];
let movedItems = 0, movedBytes = 0;
for (const f of files) {
  const livePath = path.join(LIVE, f), archPath = path.join(ARCHIVE, f);
  const lines = fs.readFileSync(livePath, 'utf8').split('\n');
  const title = (lines[0] ?? '').replace(/^#\s*/, '');
  const archText = fs.existsSync(archPath) ? fs.readFileSync(archPath, 'utf8') : null;
  const archLines = archText === null ? [] : archText.replace(/\n+$/, '').split('\n');
  before.push(...lines, ...archLines);
  const { live, added, moved } = sweep(lines, archLines);
  if (!added.length) { after.push(...lines, ...archLines); continue; }
  const header = archText === null ? [
    `# Archive: ${title}`,
    '',
    `The closed items of [\`docs/plan/${f}\`](../${f}), moved here whole by \`node scripts/planarchive.mjs\``,
    'and kept for reference. Ids are unchanged: `grep -rn \'<id>\' docs/plan/` finds an item here or',
    'in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.',
  ] : [];
  // The header is new text, so it is not in the line count before; leave it out of after too.
  const archOut = [...archLines, ...header, ...added];
  after.push(...live, ...archLines, ...added);
  const liveText = live.join('\n').replace(/\n{3,}/g, '\n\n');
  const archOutText = `${archOut.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`;
  writes.push([livePath, liveText], [archPath, archOutText]);
  movedItems += moved;
  movedBytes += lines.join('\n').length - liveText.length;
  console.log(`${f}: ${moved} closed block${moved === 1 ? '' : 's'}, ${lines.join('\n').length} → ${liveText.length} bytes`);
}

// Nothing lost and nothing doubled, and every id still somewhere.
const tb = tally(before), ta = tally(after);
// A heading may be copied into the archive as the context of an item moved from under it
// while it stays in the live file, so a heading may be there more often, never less.
const lost = [...tb].filter(([l, n]) => (HEAD.test(l) ? (ta.get(l) ?? 0) < n : (ta.get(l) ?? 0) !== n)).map(([l]) => l);
const gained = [...ta].filter(([l]) => !tb.has(l)).map(([l]) => l);
const idsGone = [...ids(before)].filter((id) => !ids(after).has(id));
if (lost.length || gained.length || idsGone.length) {
  console.log(`FAIL  the sweep would lose or double lines (${lost.length} changed, ${gained.length} new, ids gone: ${idsGone.join(', ') || 'none'})`);
  for (const l of [...lost, ...gained].slice(0, 10)) console.log(`  ${l.slice(0, 120)}`);
  process.exit(1);
}
console.log(`\n${movedItems} closed blocks, ${(movedBytes / 1024).toFixed(0)} KB out of the live plan; ${ids(before).size} ids before, ${ids(after).size} after${dry ? ' (dry: nothing written)' : ''}`);
if (!dry) {
  fs.mkdirSync(ARCHIVE, { recursive: true });
  for (const [p, t] of writes) fs.writeFileSync(p, t);
}
