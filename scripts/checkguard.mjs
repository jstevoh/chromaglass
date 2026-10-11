// A pull request that moves a check's bar or input says so (PLAN.md 19w).
// Run with `npm run checkguard` (the self-test), or against a branch:
//
//   npm run checkguard -- --base origin/main --body-file body.md
//   npm run checkguard -- --history 60      what the last 60 merges would have had to name
//
// What was reported. On 2026-10-11 the review of the session that builds
// physics (its branches are `antigravity/…`, see docs/handoff.md) found the
// same habit in pull request after pull request: when a check went red, the
// check moved instead of the code. #362, colour leaving by flushing, raised
// ROCK_FALL in src/gpu/fluid.ts from 12 to 13, so the dye a tipped plate
// carries fell faster and Plate Rock's checks in `npm run rides` passed again;
// review sent it back, and the next push put ROCK_FALL back and lowered the
// bar instead, `r.heavyTilt.moved >= 0.05` to `>= 0.04`. Both were in commits
// whose messages called them a calibration. Plate Rock's fall the round before
// was the same shape. Each was caught by a person reading every line of a
// diff of a thousand lines, and each cost a round of review and a place in
// the Mac queue. The owner's rule is that a check's bar is never loosened to
// get green (CLAUDE.md), and the owner chose (2026-10-11) to have CI hold
// every pull request to it, not only the reviewer.
//
// What it does. It reads what the pull request changes against its base and
// lists every change to what a check measures against or with:
//
//   bar       a number a check compares against (`>= 0.05` to `>= 0.04`), a
//             comparison turned round (`>=` to `>`), or a comparison with a
//             number that was there before and is gone from the file;
//   input     any other number on a code line of a script under scripts/ (a
//             stir strength, a seed, a duration, a run count, where a drop is
//             poured), and any SHOUTING_CASE number constant in src/ that
//             changes value (ROCK_FALL): a check that reads the app's own
//             constant moves with it, which is how #362 moved one;
//   removed   a file under scripts/ that held `check(` calls now holds fewer,
//             or is gone.
//
// Each has to be named in the pull request's body, under a line that reads
// "Check changes:", one list line per change, with the file or the constant,
// the old and the new number, and a reason of four words or more:
//
//   Check changes:
//   - scripts/rides.mjs:518 heavyTilt.moved >= 0.05 → 0.04: the dish's corners no longer count, measured 0.0474
//   - ROCK_FALL 12 → 13 (src/gpu/fluid.ts): …
//
// A change that is named passes, whichever way it moves: tightening a bar is
// a change too, and the reason is what the reviewer reads. The guard decides
// nothing about whether the reason is good. It makes the change impossible to
// miss in a long diff, and impossible to describe as something else.
//
// Why a reader of the diff and not a manifest of bars. The repository's
// checks declare their bars inline, about two hundred scripts each with its
// own `check(name, ok, detail)` and the bar written into `ok` (rides.mjs:518
// above). Moving every bar into a shared table first would be a rewrite of
// every check, each a chance to change one by accident, which is the thing
// this is for. So it reads the code as written. To keep that from becoming a
// pile of regular expressions that fire on prose, every file is first read
// whole, by a small tokenizer that knows comments, quoted strings, template
// strings with their `${…}` and regular expression literals, so that only
// code is compared: a number in a check's name, a comment, a log line or the
// digits of a `toFixed(3)` is never a bar. A changed line is paired with its
// replacement by its shape with the numbers taken out, so a line that moved
// is not a change, a line whose words changed is not a change, and a line
// whose only difference is a number is exactly one. A comparison that cannot
// be paired (the line was rewritten) counts if the same comparison with the
// same number is nowhere in the file afterwards.
//
// What it does not see: a bar computed from another variable two lines up
// whose own number changed shows as an input (still named, just called an
// input); a check that stops being run because its caller changed; a
// physics constant that is not SHOUTING_CASE. `--history` measures how often
// it fires on ordinary work: run over the sixty merges before it shipped, see
// PLAN.md 19w for the count.
//
// It never relaxes anything: it adds one way to be red and none to be green.
// In CI it is its own job, "Check changes named", and the required "Measure"
// is red when it is. It reads the pull request's body live from the API, so
// after adding the section to the body, re-running the failed jobs is enough;
// no push is needed. A run with no pull request (a deploy) has nothing to be
// named against and passes.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

// ─── Reading code ──────────────────────────────────────────────────────────

/*
  The code of each line of a JavaScript or TypeScript file, with comments
  dropped, every quoted string reduced to `S`, and a template string's text
  dropped while its `${…}` stays code. Returns an array indexed by line number
  from 1. A `/` starts a regular expression when what comes before it cannot
  end an operand (start of line, an operator, an open bracket, `return`),
  which is how a JavaScript parser decides too; a regex's text is reduced to
  `R`. Good enough for this repository's scripts: it is wrong only on code no
  one here writes (a regex right after a `)` of an `if`).
*/
export function codeLines(text) {
  const out = [''];
  let line = '';
  const push = (s) => { line += s; };
  const nl = () => { out.push(line); line = ''; };
  // A stack of contexts: 'code' at the bottom, 'tpl' for a template string,
  // 'expr' for a `${` inside one (with its brace depth).
  const stack = [{ k: 'code', depth: 0 }];
  let i = 0;
  const n = text.length;
  let prevSig = '';   // the last significant code character, for the regex rule
  let prevWord = '';
  while (i < n) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (c === '\n') {
      nl();
      i++;
      continue;
    }
    if (top.k === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); push('`'); prevSig = '`'; i++; continue; }
      if (c === '$' && text[i + 1] === '{') { stack.push({ k: 'expr', depth: 0 }); push('${'); prevSig = '{'; i += 2; continue; }
      i++;
      continue;
    }
    // code or expr
    if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { if (text[i] === '\n') nl(); i++; }
      i += 2;
      continue;
    }
    if (c === '\'' || c === '"') {
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') { if (text[i] === '\\') i++; i++; }
      i++;
      push('S');
      prevSig = 'S';
      continue;
    }
    if (c === '`') { stack.push({ k: 'tpl' }); push('`'); i++; continue; }
    if (c === '/') {
      const regexHere = prevSig === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || /^(return|typeof|case|of|in|yield|await)$/.test(prevWord);
      if (regexHere) {
        i++;
        let cls = false;
        while (i < n && text[i] !== '\n') {
          if (text[i] === '\\') { i += 2; continue; }
          if (text[i] === '[') cls = true;
          else if (text[i] === ']') cls = false;
          else if (text[i] === '/' && !cls) break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/.test(text[i])) i++;
        push('R');
        prevSig = 'R';
        continue;
      }
    }
    if (top.k === 'expr') {
      if (c === '{') top.depth++;
      if (c === '}') {
        if (top.depth === 0) { stack.pop(); push('}'); prevSig = '}'; i++; continue; }
        top.depth--;
      }
    }
    push(c);
    if (/\S/.test(c)) {
      prevSig = c;
      if (/[A-Za-z_$]/.test(c)) {
        let j = i;
        while (j > 0 && /[\w$]/.test(text[j - 1])) j--;
        prevWord = text.slice(j, i + 1);
      } else prevWord = '';
    }
    i++;
  }
  out.push(line);
  return out;
}

// Digits that only say how a number is printed are not a measurement.
const PRINTING = /\.(toFixed|toPrecision|padStart|padEnd|toString)\(\s*\d+\s*(,[^)]*)?\)/g;
const NUM = /(?<![\w$.])(?:\d[\d_]*\.?\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)(?![\w$])/gi;
const CMP = /(<=|>=|===|!==|==|!=|(?<![=<>-])<(?![<=])|(?<![=>-])>(?![>=]))/;

const clean = (code) => code.replace(PRINTING, '.$1()').replace(/\s+/g, ' ').trim();
const shape = (code) => clean(code).replace(NUM, '#').replace(/\s+/g, '');
const numbers = (code) => [...clean(code).matchAll(NUM)].map((m) => ({ text: m[0], at: m.index }));
const value = (t) => Number(String(t).replace(/_/g, ''));

// Every comparison of something with a number written into the code, as
// `{ key, op, num }`: `key` is what is compared, the twenty characters of code
// before the operator (or after it, when the number is on the left), so the
// same bar on the same quantity matches wherever the line has moved.
function comparisons(code) {
  const c = clean(code);
  const out = [];
  const re = new RegExp(`${CMP.source}\\s*(-?${NUM.source})`, 'gi');
  for (const m of c.matchAll(re)) {
    const op = m[1];
    if (op.includes('=') && op.length >= 2 && op[0] !== '<' && op[0] !== '>') continue;   // == and != are not bars
    const key = c.slice(Math.max(0, m.index - 20), m.index).replace(/\s+/g, '');
    out.push({ key, op, num: m[2] });
  }
  const left = new RegExp(`(?<![\\w$.])(-?${NUM.source})\\s*${CMP.source}`, 'gi');
  for (const m of c.matchAll(left)) {
    const op = m[2];
    if (op[0] !== '<' && op[0] !== '>') continue;
    const end = m.index + m[0].length;
    const key = c.slice(end, end + 20).replace(/\s+/g, '');
    out.push({ key, op: { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[op], num: m[1] });
  }
  return out;
}

// Is the number at `at` in `code` (as `clean` leaves it) right beside a
// comparison? Then it is a bar; otherwise an input.
function besideComparison(code, at, len) {
  const c = clean(code);
  const before = c.slice(0, at).replace(/\s+$/, '').replace(/-$/, '').replace(/\s+$/, '');
  const after = c.slice(at + len).replace(/^\s+/, '');
  return /(<=|>=|<|>)$/.test(before) || /^(<=|>=|<|>)(?!=)/.test(after);
}

// Which way a moved bar went, for the report: a floor lowered or a cap raised
// asks less of the plate.
function direction(op, from, to) {
  const a = value(from); const b = value(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return '';
  const looser = (op === '>' || op === '>=') ? b < a : (op === '<' || op === '<=') ? b > a : null;
  return looser === null ? '' : looser ? 'looser' : 'tighter';
}

// ─── What a diff changes ───────────────────────────────────────────────────

const CHECK_FILE = /^scripts\/.*\.(mjs|js|cjs|ts)$/;
const SRC_FILE = /^src\/.*\.(ts|tsx|js|mjs)$/;
const CONSTANT = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*[A-Z0-9])\s*(?::[^=]+)?=\s*(.+?);?\s*$/;

/*
  The changes in one file. `hunks` are git's (-U0): for each, the line numbers
  removed from the old file and added to the new. Returns a list of
  `{ file, line, kind, what, from, to, words, code }`, where `words` are what
  a naming line must carry besides a reason (the place and the numbers).
*/
export function changesIn(file, oldText, newText, hunks) {
  const isCheck = CHECK_FILE.test(file);
  const isSrc = SRC_FILE.test(file);
  if (!isCheck && !isSrc) return [];
  const base = file.split('/').pop();
  const before = oldText == null ? [''] : codeLines(oldText);
  const after = newText == null ? [''] : codeLines(newText);
  const found = [];

  if (isSrc) {
    // SHOUTING_CASE number constants whose value moved, matched by name.
    const consts = (lines, nums) => {
      const m = new Map();
      for (const ln of nums) {
        const c = CONSTANT.exec(lines[ln] ?? '');
        if (c && NUM.test(c[2])) m.set(c[1], { line: ln, val: clean(c[2]) });
        NUM.lastIndex = 0;
      }
      return m;
    };
    const was = consts(before, hunks.flatMap((h) => h.removed));
    const now = consts(after, hunks.flatMap((h) => h.added));
    for (const [name, o] of was) {
      const nw = now.get(name);
      if (!nw || nw.val === o.val) continue;
      found.push({ file, line: nw.line, kind: 'input', what: `${name} ${o.val} → ${nw.val}`, from: o.val, to: nw.val, words: [name], need: numsOf(o.val, nw.val), code: nw.val });
    }
    return found;
  }

  // A check script. First pair each removed line with an added line of the
  // same hunk that has the same shape once its numbers are taken out.
  const unpairedRemoved = [];
  for (const h of hunks) {
    const used = new Set();
    for (const r of h.removed) {
      const rc = before[r] ?? '';
      if (!/\d/.test(clean(rc))) continue;
      const rs = shape(rc);
      if (!rs) continue;
      let match = h.added.find((a) => !used.has(a) && shape(after[a] ?? '') === rs);
      if (match === undefined) {
        // The same shape but a comparison turned round.
        const flip = (s) => s.replace(/<=|>=|<|>/g, '<>');
        match = h.added.find((a) => !used.has(a) && flip(shape(after[a] ?? '')) === flip(rs) && shape(after[a] ?? '') !== rs);
        if (match !== undefined) {
          used.add(match);
          const ops = (s) => (clean(s).match(/<=|>=|<|>/g) ?? []);
          const o = ops(rc); const w = ops(after[match]);
          const k = o.findIndex((x, i) => x !== w[i]);
          found.push({ file, line: match, kind: 'bar', what: `comparison ${o[k]} → ${w[k]}`, from: o[k], to: w[k], words: [base], need: [], ops: [o[k], w[k]], code: clean(after[match]) });
          continue;
        }
        unpairedRemoved.push(r);
        continue;
      }
      used.add(match);
      const a = numbers(rc); const b = numbers(after[match]);
      for (let k = 0; k < a.length; k++) {
        if (value(a[k].text) === value(b[k].text)) continue;
        const bar = besideComparison(after[match], b[k].at, b[k].text.length) || besideComparison(rc, a[k].at, a[k].text.length);
        const cmp = bar ? comparisons(after[match]).find((x) => value(x.num) === value(b[k].text)) : null;
        const dir = cmp ? direction(cmp.op, a[k].text, b[k].text) : '';
        found.push({ file, line: match, kind: bar ? 'bar' : 'input', what: `${a[k].text} → ${b[k].text}${dir ? ` (${dir})` : ''}`, from: a[k].text, to: b[k].text, words: [base], need: [a[k].text, b[k].text], code: clean(after[match]) });
      }
    }
  }

  // A comparison on a rewritten line counts if the same comparison of the
  // same thing with the same number is nowhere in the new file.
  // A comparison of a renamed quantity with the same number, on the lines
  // that replaced it, is the same bar. A deleted file is one change, below.
  const everywhere = new Set();
  for (let ln = 1; ln < after.length; ln++) for (const c of comparisons(after[ln])) everywhere.add(`${c.key}|${c.op}|${value(c.num)}`);
  const hunkOf = (r) => hunks.find((h) => h.removed.includes(r));
  for (const r of newText == null ? [] : unpairedRemoved) {
    const near = new Set((hunkOf(r)?.added ?? []).flatMap((a) => comparisons(after[a] ?? '')).map((c) => `${c.op}|${value(c.num)}`));
    for (const c of comparisons(before[r])) {
      if (everywhere.has(`${c.key}|${c.op}|${value(c.num)}`) || near.has(`${c.op}|${value(c.num)}`)) continue;
      found.push({ file, line: r, kind: 'bar', what: `${c.op} ${c.num} rewritten or removed (was line ${r})`, from: c.num, to: '', words: [base], need: [c.num], code: clean(before[r]), old: true });
    }
  }

  // Fewer checks than before. The bars that went with them are listed under
  // the removal for the reviewer, and the removal is the one line to name:
  // #340 took a feature and seven of its checks out of rides.mjs, and asking
  // for thirty-five lines, one per comparison, would bury the one that
  // matters. A bar changed in place (paired above) is still its own line.
  const count = (lines) => lines.reduce((s, l) => s + (l.match(/(?<![\w$.])check\s*\(/g) ?? []).length, 0);
  const had = count(before); const has = newText == null ? 0 : count(after);
  if (has < had) {
    const gone = found.filter((f) => f.old);
    found.splice(0, found.length, ...found.filter((f) => !f.old));
    found.push({ file, line: 0, kind: 'removed', what: newText == null ? `the file and its ${had} checks deleted` : `${had - has} of its ${had} checks removed`, from: String(had), to: String(has), words: [base], need: [], removed: true, code: gone.length ? `with ${gone.length} comparison${gone.length === 1 ? '' : 's'}: ${gone.map((g) => `${g.code.slice(0, 60)}`).join(' | ')}` : '' });
  }
  return found;
}

const numsOf = (...vals) => vals.flatMap((v) => (clean(v).match(NUM) ?? []));

// git's -U0 diff, read into { file: { hunks, deleted, created } }.
export function parseDiff(text) {
  const files = new Map();
  let cur = null;
  for (const l of text.split('\n')) {
    let m;
    if ((m = /^diff --git a\/(.+) b\/(.+)$/.exec(l))) {
      cur = { file: m[2], hunks: [], deleted: false, created: false };
      files.set(m[2], cur);
    } else if (cur && /^deleted file mode/.test(l)) cur.deleted = true;
    else if (cur && /^new file mode/.test(l)) cur.created = true;
    else if (cur && (m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l))) {
      const range = (start, cnt) => Array.from({ length: cnt === undefined ? 1 : Number(cnt) }, (_, k) => Number(start) + k);
      cur.hunks.push({ removed: range(m[1], m[2]), added: range(m[3], m[4]) });
    }
  }
  return files;
}

// ─── The body ──────────────────────────────────────────────────────────────

/*
  The list lines under "Check changes:" in a pull request's body (a heading,
  a bold label or a plain line; it ends at the next heading, the next
  "Label:" line or the next paragraph that is not a list).
*/
export function namedLines(body) {
  const lines = String(body ?? '').replace(/\r/g, '').split('\n');
  const out = [];
  let inside = false;
  for (const raw of lines) {
    const l = raw.trim();
    const label = l.replace(/^#+\s*/, '').replace(/\*\*/g, '').replace(/__/g, '');
    if (/^check changes\s*:?/i.test(label)) {
      inside = true;
      const rest = label.replace(/^check changes\s*:?\s*/i, '');
      if (rest) out.push(rest);
      continue;
    }
    if (!inside) continue;
    if (l === '') continue;
    if (/^#/.test(l) || (/^\**[A-Z][\w '’/-]{0,40}:\**(\s|$)/.test(l) && !/^[-*+]|^\d+[.)]/.test(l))) { inside = false; continue; }
    if (/^([-*+]|\d+[.)])\s+/.test(l)) out.push(l.replace(/^([-*+]|\d+[.)])\s+/, ''));
    else inside = false;
  }
  return out;
}

const PLACEHOLDER = /^(reason|why|todo|tbd|because|n\/?a|calibrat\w*|fix(ed)?|adjust\w*|tun\w*)$/i;

// Does `line` name `change`, with a reason? The place (file name or constant),
// both numbers by value, and four words or more once those are taken out.
export function names(line, change) {
  const low = line.toLowerCase();
  if (!change.words.every((w) => low.includes(w.toLowerCase()))) return false;
  const vals = (line.replace(/(?<=\d),(?=\d{3})/g, '').match(NUM) ?? []).map(value);
  for (const t of change.need) if (!vals.some((v) => Math.abs(v - value(t)) <= 1e-12 * Math.max(1, Math.abs(v)))) return false;
  if (change.ops && !(line.includes(change.ops[0]) && line.includes(change.ops[1]))) return false;
  if (change.removed && !/\b(remov|delet|drop)/i.test(line)) return false;
  // The reason: what is left once the place, paths, numbers and arrows are gone.
  const rest = line
    .replace(/\S*[/.]\S*\.(mjs|js|ts|tsx)(:\d+)?/g, ' ')
    .replace(new RegExp(change.words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'), ' ')
    .replace(NUM, ' ')
    .replace(/[^A-Za-z' ]+/g, ' ')
    .split(/\s+/).filter((w) => w.length > 1 && !/^(to|from|was|now|is|bar|input|removed|deleted)$/i.test(w));
  if (rest.length < 4) return false;
  if (rest.length <= 5 && rest.some((w) => PLACEHOLDER.test(w)) && rest.filter((w) => !PLACEHOLDER.test(w)).length < 4) return false;
  return true;
}

// ─── Running ───────────────────────────────────────────────────────────────

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const show = (rev, file) => { try { return git('show', `${rev}:${file}`); } catch { return null; } };

export function changesBetween(from, to) {
  const diff = git('diff', '--no-renames', '-U0', from, to, '--', 'scripts', 'src');
  const out = [];
  for (const f of parseDiff(diff).values()) {
    if (!CHECK_FILE.test(f.file) && !SRC_FILE.test(f.file)) continue;
    if (f.created) continue;   // a new file moves no bar that was there
    out.push(...changesIn(f.file, show(from, f.file), f.deleted ? null : show(to, f.file), f.hunks));
  }
  return out;
}

function report(changes, body) {
  const lines = namedLines(body);
  let unnamed = 0;
  for (const c of changes) {
    const ok = lines.some((l) => names(l, c));
    if (!ok) unnamed++;
    const where = c.line ? `${c.file}:${c.line}` : c.file;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.kind.padEnd(7)} ${where}  ${c.what}${c.code ? `\n             ${c.code.slice(0, 140)}` : ''}`);
  }
  if (changes.length === 0) console.log('ok   no check\'s bar or input changes');
  if (unnamed) {
    console.log(`\n${unnamed} of ${changes.length} change${changes.length === 1 ? '' : 's'} to a check's bar or input ${unnamed === 1 ? 'is' : 'are'} not named in the pull request's body.`);
    console.log('Name each under a "Check changes:" line, one list line per change, with the old and new number and a reason');
    console.log('(the measurement that says why it moves). Then re-run the failed jobs; no push is needed. For example:\n');
    console.log('Check changes:');
    for (const c of changes) {
      if (lines.some((l) => names(l, c))) continue;
      const where = c.line ? `${c.file}:${c.line}` : c.file;
      const what = c.removed ? `${c.what}` : c.ops ? `${c.ops[0]} → ${c.ops[1]}` : c.to ? `${c.words[0] === c.file.split('/').pop() ? '' : `${c.words[0]} `}${c.from} → ${c.to}` : `${c.from} removed`;
      console.log(`- ${c.words[0] === c.file.split('/').pop() ? where : `${c.words[0]} (${where})`} ${what.trim()}: <why, and what it measured>`);
    }
  } else if (changes.length) console.log(`\nok   every change to a check's bar or input is named`);
  return unnamed;
}

async function liveBody() {
  const pr = process.env.PR_NUMBER;
  if (!pr) return null;
  const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
  try {
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'chromaglass-checkguard' };
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls/${pr}`, { headers, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).body ?? '';
  } catch (e) {
    console.log(`(the pull request's body could not be read live, ${e.message}; using the one the run started with)`);
    return null;
  }
}

// ─── Self-test ─────────────────────────────────────────────────────────────

function hunksOf(a, b) {
  // A line diff of two small texts, as -U0 hunks, through git itself.
  const dir = fs.mkdtempSync(`${process.env.TMPDIR || '/tmp'}/checkguard-`);
  fs.writeFileSync(`${dir}/a`, a);
  fs.writeFileSync(`${dir}/b`, b);
  let d = '';
  try { d = execFileSync('git', ['diff', '--no-index', '-U0', 'a', 'b'], { cwd: dir, encoding: 'utf8' }); } catch (e) { d = e.stdout; }
  fs.rmSync(dir, { recursive: true, force: true });
  return [...parseDiff(d.replace(/^diff --git a\/a b\/b$/m, 'diff --git a/x b/x')).values()][0]?.hunks ?? [];
}

function selftest() {
  let failed = 0;
  const t = (ok, what, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`); if (!ok) failed++; };
  const run = (file, a, b) => changesIn(file, a, b, b == null ? [{ removed: a.split('\n').map((_, i) => i + 1), added: [] }] : hunksOf(a, b));

  // #362, dd4ca60: the bar under Plate Rock's heavy red, as it was written.
  const ridesA = [
    'try {',
    '  const follows = (o) => o.gain >= 0.4 && o.gain <= 1.2 && o.corr > 0.8 && o.read >= 0.75;',
    '  check(\'Plate Rock on an evenly coloured plate: the tilt alone moves nothing (and moves it with the red made heavier)\',',
    '    r.evenTilt.cells < 0.5 && r.evenTilt.moved < 0.1 * r.heavyTilt.moved && r.heavyTilt.moved >= 0.05,',
    '    `${r.evenTilt.cells.toFixed(2)} cells, changed ${r.evenTilt.moved.toFixed(3)} even`);',
    '  check(\'the cover glass slides the picture 5 cells or more at full\', r.evenFull.cells >= 5, \'\');',
    '} catch {}',
  ].join('\n');
  const ridesB = ridesA.replace('r.heavyTilt.moved >= 0.05,', 'r.heavyTilt.moved >= 0.04,');
  let c = run('scripts/rides.mjs', ridesA, ridesB);
  t(c.length === 1 && c[0].kind === 'bar' && c[0].line === 4 && /0\.05 → 0\.04 \(looser\)/.test(c[0].what),
    '#362\'s rides bar, heavyTilt.moved >= 0.05 to >= 0.04, is one change to a bar, and a looser one', c.map((x) => `${x.kind} ${x.what}`).join('; '));
  const good = 'Check changes:\n- scripts/rides.mjs:518 heavyTilt.moved >= 0.05 → 0.04: the dish\'s corners outside the rim no longer count, measured 0.0474 in the dish';
  t(names(namedLines(good)[0], c[0]), 'named with its file, both numbers and a reason, it passes');
  t(!names(namedLines('Check changes:\n- scripts/rides.mjs 0.05 → 0.04: calibrated')[0], c[0]), 'named with "calibrated" for a reason, it does not');
  t(!names(namedLines('Check changes:\n- scripts/rides.mjs 0.05 → 0.045: the corners no longer count in the dish')[0], c[0]), 'named with the wrong new number, it does not');
  t(!names(namedLines('Check changes:\n- scripts/rides.mjs: Plate Rock bar recalibrated for the new dish mask measurement')[0], c[0]), 'named without the numbers, it does not');
  t(!names(namedLines('Check changes:\n- scripts/plates.mjs 0.05 → 0.04: the corners no longer count in the dish')[0], c[0]), 'named in another file, it does not');
  t(namedLines('Rides 0.05 → 0.04 is fine, the corners no longer count in the dish').length === 0, 'and the same words outside a "Check changes:" section do not count');
  t(names(namedLines('## Check changes\n\n1. `scripts/rides.mjs` bar: 0.050 → 0.04, because the dish rim now bounds the measured area')[0], c[0]), 'a heading, a numbered list and 0.050 for 0.05 are all the same naming');
  const handoff = '**Plan item:** 18g\n**Check changes:**\n- scripts/rides.mjs 0.05 → 0.04: the corners outside the rim no longer count\n**Done:** flushing\n- scripts/rides.mjs 0.05 → 0.04: written under Done instead';
  t(namedLines(handoff).length === 1, 'in the handoff block the section ends at the next label', JSON.stringify(namedLines(handoff)));

  // #362, 34f9a3e: ROCK_FALL raised so the same check passed.
  const fluidA = 'const A = 1;\n/* the fall rate, a = g (Δρ/ρ) (Δt/W) */\nexport const ROCK_FALL = 12;\nexport const name = 3;\n';
  c = run('src/gpu/fluid.ts', fluidA, fluidA.replace('ROCK_FALL = 12', 'ROCK_FALL = 13'));
  t(c.length === 1 && c[0].kind === 'input' && c[0].what === 'ROCK_FALL 12 → 13', '#362\'s ROCK_FALL 12 → 13 in src/gpu/fluid.ts is an input change', c.map((x) => x.what).join('; '));
  t(names('ROCK_FALL 12 → 13 (src/gpu/fluid.ts): derived again from the dye\'s real density contrast', c[0]), 'named by the constant, it passes');
  t(!names('src/gpu/fluid.ts 12 → 13: derived again from the dye\'s real density contrast', c[0]), 'named only by its file, it does not');
  t(run('src/gpu/fluid.ts', fluidA, fluidA.replace('name = 3', 'name = 4').replace('A = 1', 'A = 2')).length === 0, 'a camelCase constant or a one-letter one in src/ is not watched');
  t(run('src/gpu/fluid.ts', fluidA, fluidA.replace('the fall rate', 'the fall rate, 13 by one estimate')).length === 0, 'nor a comment next to ROCK_FALL');
  t(run('src/gpu/fluid.ts', fluidA, fluidA.replace('ROCK_FALL = 12;', 'ROCK_FALL = 12; // per unit dye')).length === 0, 'nor a comment added on its line');

  // What is not a change.
  const s = [
    '// the bar, 0.05, from the 10-04 run',
    'const STIR = 0.3;',
    'check(\'it moves 5 cells or more\', cells >= 5, `${cells.toFixed(2)} cells of 5`);',
    'console.log(`',
    '  The plate at 0.45 rides',
    '  under 3 cells.`);',
    'const re = /\\d{3} cells/;',
    'for (let t = 0; t < 60; t++) step();',
  ].join('\n');
  const same = (what, b) => { const r = run('scripts/x.mjs', s, b); t(r.length === 0, what, r.map((x) => `${x.kind} ${x.what}`).join('; ')); };
  same('a number in a comment', s.replace('0.05, from', '0.04, from'));
  same('a number in a check\'s name', s.replace('5 cells or more', '6 cells or more'));
  same('a number in a multi-line template string', s.replace('at 0.45 rides', 'at 0.5 rides').replace('under 3', 'under 4'));
  same('the digits a number is printed with', s.replace('toFixed(2)', 'toFixed(3)'));
  same('a number inside a regular expression', s.replace('\\d{3}', '\\d{4}'));
  same('a line moved, unchanged', [s.split('\n')[7], ...s.split('\n').slice(0, 7)].join('\n'));
  same('a new check added', `${s}\ncheck('and a new one', x < 0.2, '');`);
  same('a bar\'s words reworded around the same numbers', s.replace('cells >= 5', 'cellsMoved >= 5').replace('const STIR', 'const STIR'));

  // What is.
  const ch = (b) => run('scripts/x.mjs', s, b);
  c = ch(s.replace('STIR = 0.3', 'STIR = 0.35'));
  t(c.length === 1 && c[0].kind === 'input' && c[0].what === '0.3 → 0.35', 'a stir strength is an input', c.map((x) => x.what).join('; '));
  c = ch(s.replace('t < 60', 't < 90'));
  t(c.length === 1 && c[0].kind === 'bar', 'a run length in a loop is caught (as a comparison)', c.map((x) => `${x.kind} ${x.what}`).join('; '));
  c = ch(s.replace('cells >= 5', 'cells >= 4'));
  t(c.length === 1 && c[0].kind === 'bar' && /looser/.test(c[0].what), 'a floor lowered is a looser bar');
  c = ch(s.replace('cells >= 5', 'cells >= 6'));
  t(c.length === 1 && /tighter/.test(c[0].what), 'a floor raised is a tighter bar, and still a change to name');
  c = ch(s.replace('cells >= 5', 'cells > 5'));
  t(c.length === 1 && c[0].kind === 'bar' && c[0].what === 'comparison >= → >', 'a comparison turned round', c.map((x) => x.what).join('; '));
  t(names('scripts/x.mjs >= → >: five exactly was the old plate\'s rounding', c[0]), 'and named with both operators, it passes');
  c = ch(s.replace('cells >= 5, `${cells', '(cells > 2 || slow) && moved, `${cells'));
  t(c.some((x) => x.kind === 'bar' && x.from === '5' && x.old), 'a bar rewritten into a different condition, its old number gone, is caught', c.map((x) => x.what).join('; '));
  c = ch(s.replace('check(\'it moves 5 cells or more\', cells >= 5, `${cells.toFixed(2)} cells of 5`);', ''));
  t(c.length === 1 && c[0].kind === 'removed' && /cells >= #|cells >= 5/.test(c[0].code), 'a check deleted is caught, its bar listed with it', c.map((x) => `${x.kind} ${x.what} ${x.code}`).join('; '));
  c = run('scripts/x.mjs', s, null);
  t(c.length === 1 && c[0].kind === 'removed', 'a check script deleted is caught', c.map((x) => x.what).join('; '));
  t(names('scripts/x.mjs deleted: its one check moved into rides.mjs with the same bar', c[0]), 'and named as removed with a reason, it passes');
  const ab = 'check(\'a\', x >= 0.05 && y < 3, \'\');';
  c = run('scripts/x.mjs', ab, 'check(\'a\', x >= 0.04 && y < 4, \'\');');
  t(c.length === 2 && c.every((x) => x.kind === 'bar'), 'two bars changed on one line are two changes');
  t(!['scripts/x.mjs 0.05 → 0.04: the plate moved further than the bar allowed'].some((l) => names(l, c[1])), 'and naming one does not name the other');
  return failed;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

if (process.argv.includes('--diff')) {
  // In CI: the checked-out commit is GitHub's merge of the PR into its base,
  // so its first parent is the base and the difference is the PR's own.
  if (!process.env.PR_NUMBER) {
    console.log('ok   no pull request (a deploy or a run by hand): nothing to be named against');
    process.exit(0);
  }
  const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ');
  if (parents.length !== 3 || (process.env.PR_HEAD && parents[2] !== process.env.PR_HEAD)) {
    console.log(`FAIL the checkout is not GitHub's merge of the pull request (parents ${parents.slice(1).join(' ')})`);
    process.exit(1);
  }
  const body = (await liveBody()) ?? process.env.PR_BODY ?? '';
  process.exit(report(changesBetween('HEAD^1', 'HEAD'), body) ? 1 : 0);
} else if (arg('--history')) {
  const n = Number(arg('--history'));
  const commits = git('log', '--first-parent', '--format=%H %s', `-${n}`, arg('--ref') ?? 'origin/main').trim().split('\n');
  let fired = 0;
  for (const l of commits) {
    const [sha, ...subj] = l.split(' ');
    let ch;
    try { ch = changesBetween(`${sha}^`, sha); } catch { continue; }
    if (ch.length) fired++;
    console.log(`${ch.length ? String(ch.length).padStart(3) : '  .'}  ${sha.slice(0, 7)} ${subj.join(' ').slice(0, 90)}`);
    if (process.argv.includes('-v')) for (const c of ch) console.log(`         ${c.kind.padEnd(7)} ${c.file}:${c.line}  ${c.what}  | ${c.code.slice(0, 100)}`);
  }
  console.log(`\n${fired} of ${commits.length} merges would have had to name a change to a check's bar or input`);
} else if (arg('--base')) {
  const base = git('merge-base', arg('--base'), 'HEAD').trim();
  const body = arg('--body-file') ? fs.readFileSync(arg('--body-file'), 'utf8') : '';
  process.exit(report(changesBetween(base, 'HEAD'), body) ? 1 : 0);
} else {
  const failed = selftest();
  console.log(failed ? `\n${failed} FAILED` : '\nall ok');
  process.exit(failed ? 1 : 0);
}
