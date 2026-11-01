// A pull request that moves a check's bar or input says so (PLAN.md 19x).
// Run with `npm run checkguard` (the self-test), or against a branch:
//
//   npm run checkguard -- --base origin/main --body-file body.md [--branch antigravity/x]
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
//             number on a line that was rewritten or deleted;
//   input     any other number on a code line of a script under scripts/ (a
//             stir strength, a seed, a duration, a run count, where a drop is
//             poured, a `?stir=0.3` in the URL a script opens), and a
//             SHOUTING_CASE number constant that changes value, is renamed or
//             goes, under src/gpu/ (shaders' WGSL included) or anywhere in
//             src/ if a script names it (ROCK_FALL): a check that reads the
//             app's own constant moves with it, which is how #362 moved one;
//   removed   a file under scripts/ that held `check(` calls now holds fewer,
//             or is gone;
//   manifest  a check's entry in scripts/checks.json that is removed, or whose
//             command, env or timeout changes (PLAN.md 19k-1): `QA_GPU=mid`
//             dropped from the command, a `--node` flag added, a timeout
//             lengthened, is a check that stopped measuring what it did, and
//             before the manifest the same edit to a step in checks.yml was as
//             invisible. A check moved between the Mac and Measure is one too
//             (an app-frame check passes vacuously off Metal). A new entry, a
//             move between two Mac shards or two Measure parts, a reorder and
//             a reworded `why` are not changes to what a check measures;
//   flip      a check turned to assert the opposite: a quantity compared with
//             `>` on the removed lines and only with `<` on the added ones,
//             or a check's name that gains "not", "never", "stays" or
//             "negligible" while a comparison under it changes. These are
//             read in each of the PR's own commits as well as against its
//             base, because a check brought in new and turned round in a
//             later commit (#357) is no change at all against the base.
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
// whose only difference is a number is exactly one, and a hunk that only
// reflowed its lines is none. A line that cannot be paired and is not
// elsewhere in the new file unchanged was rewritten or deleted: each of its
// comparisons with a number counts unless the lines that replaced it hold
// the same comparison of the same thing with the same clause after it
// (`>= 0.05` widened to `>= 0.05 || !gpu`, or `peakMoved >= 0.05` for
// `moved >= 0.05`, is a different bar), and so does
// each other number the lines that replaced it no longer carry. The
// check-skeptic's review of the first version found each of those ways
// round it; they are in the self-test.
//
// What it does not see: a new line that bends a measured value
// (`moved *= 1.3`) with nothing removed; a 0 or a 1 on a rewritten line (left
// out on purpose, see below); arguments in package.json's scripts or a
// workflow's steps (a check's entry in scripts/checks.json is read since 19k-1);
// a check that stops being run because its caller changed;
// a physics constant that is not SHOUTING_CASE (PLAN.md 19x-2). A bar
// computed from a variable two lines up whose own number changed shows as an
// input: still named, just called an input. `--history` measures how often
// it fires on ordinary work; over the 50 merges before it shipped, 9 would
// have had to name something, every one a real edit of a check.
//
// It also holds an Antigravity PR's Measured lines (scripts/measured.mjs).
// It never relaxes anything: it adds one way to be red and none to be green.
// In CI it is its own job, "Check changes named", and the required "Measure"
// is red when it is. It reads the pull request's body live from the API, so
// after adding the section to the body, re-running the failed jobs is enough;
// no push is needed. A run with no pull request (a deploy) has nothing to be
// named against and passes.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { reportMeasured, measuredSelftest } from './measured.mjs';
import { prCommits, livePr } from './checkguard-api.mjs';

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
  // A value passed in a URL inside a string (`?stir=0.3`, 17 scripts open the
  // app that way) is a test input, so it is kept as code: `S«stir=0.3»`.
  let lit = '';
  const params = (t) => { const m = t.match(/[?&][\w.-]+=-?[\d.]+(?:e-?\d+)?/g); return m ? `«${m.join(' ').replace(/[?&]/g, '')}»` : ''; };
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
      if (c === '\\') { lit += text.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { stack.pop(); push(`${params(lit)}\``); lit = ''; prevSig = '`'; i++; continue; }
      if (c === '$' && text[i + 1] === '{') { stack.push({ k: 'expr', depth: 0 }); push(`${params(lit)}\${`); lit = ''; prevSig = '{'; i += 2; continue; }
      lit += c;
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
      const from = ++i;
      while (i < n && text[i] !== c && text[i] !== '\n') { if (text[i] === '\\') i++; i++; }
      push(`S${params(text.slice(from, i))}`);
      i++;
      prevSig = 'S';
      continue;
    }
    if (c === '`') { stack.push({ k: 'tpl' }); lit = ''; push('`'); i++; continue; }
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
const PRINTING = /\.(toFixed|toPrecision|padStart|padEnd|toString)\(\s*\d+\s*(,[^)]*)?\)(?![\s)]*(<|>))/g;
const NUM = /(?<![\w$.])(?:\d[\d_]*\.?\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)(?![\w$])/gi;
const SIGNED = /(?<![\w$.])[-\u2212](?:\d[\d_]*\.?\d*(?:e[-+]?\d+)?|\.\d+(?:e[-+]?\d+)?)(?![\w$])/gi;
const CMP = /(<=|>=|===|!==|==|!=|(?<![=<>-])<(?![<=])|(?<![=>-])>(?![>=]))/;

const clean = (code) => code.replace(PRINTING, '.$1()').replace(/\s+/g, ' ').trim();
const shape = (code) => clean(code).replace(NUM, '#').replace(/\s+/g, '');
const numbers = (code) => [...clean(code).matchAll(NUM)].map((m) => ({ text: m[0], at: m.index }));
const value = (t) => Number(String(t).replace(/_/g, ''));

// What follows a comparison's number up to the end of its clause (a `;` or
// `,` at its own depth, or a bracket closing past it): `|| !r.gpu` after
// `>= 0.05`, `* 0.8`, or nothing after the `100` of `i < 100; i++`.
function tailOf(c, from) {
  let depth = 0;
  let i = from;
  for (; i < c.length; i++) {
    const ch = c[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) { if (depth === 0) break; depth--; } else if ((ch === ';' || ch === ',') && depth === 0) break;
  }
  return c.slice(from, i).replace(/\s+/g, '');
}

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
    out.push({ key, op, num: m[2], tail: tailOf(c, m.index + m[0].length) });
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
const WGSL_FILE = /^src\/gpu\/wgsl\//;
const CONSTANT = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]*[A-Z0-9])\s*(?::[^=]+)?=\s*(.+?);?\s*$/;

/*
  Which SHOUTING_CASE constants in src/ are a check's input: every one under
  src/gpu/ (the solver, where ROCK_FALL lives) and its shaders, and any other
  whose name a script under scripts/ mentions. Not all of src/: 391 constants
  in components/ and lib/ alone are layout and timing (a panel's width) that
  no check reads, and asking for a line each time one moved would teach
  everyone to paste lines without reading them. `scriptsText` is every
  script's text, read once.
*/
const watchedConstant = (file, name, scriptsText) => /^src\/gpu\//.test(file) || new RegExp(`\\b${name}\\b`).test(typeof scriptsText === 'function' ? scriptsText() : scriptsText);

/*
  The lines of a shader file as code, for its constants: the WGSL lives in
  template strings, which `codeLines` drops as text, so here only comments are
  taken out (WGSL's are `//` too).
*/
const rawLines = (text) => ['', ...text.split('\n').map((l) => l.replace(/\/\/.*$/, ''))];

/*
  The changes in one file. `hunks` are git's (-U0): for each, the line numbers
  removed from the old file and added to the new. Returns a list of
  `{ file, line, kind, what, from, to, words, need, code }`, where `words` and
  `need` are what a naming line must carry besides a reason (the place, and
  the numbers by value).
*/
export function changesIn(file, oldText, newText, hunks, scriptsText = '') {
  const isCheck = CHECK_FILE.test(file);
  const isSrc = SRC_FILE.test(file);
  if (!isCheck && !isSrc) return [];
  const base = file.split('/').pop();
  const before = oldText == null ? [''] : codeLines(oldText);
  const after = newText == null ? [''] : codeLines(newText);
  const found = [];

  if (isSrc) {
    // SHOUTING_CASE number constants whose value moved, matched by name. One
    // that is gone, renamed or no longer a number (`= BASE_FALL`) is a change
    // too: its old value is what the checks were passing on.
    const rb = WGSL_FILE.test(file) && oldText != null ? rawLines(oldText) : before;
    const ra = WGSL_FILE.test(file) && newText != null ? rawLines(newText) : after;
    const consts = (lines, nums, all) => {
      const m = new Map();
      for (const ln of nums) {
        const c = CONSTANT.exec(lines[ln] ?? '');
        if (c && (all || /\d/.test(c[2].replace(/[A-Za-z_]\w*/g, '')))) m.set(c[1], { line: ln, val: clean(c[2]) });
      }
      return m;
    };
    const was = consts(rb, hunks.flatMap((h) => h.removed), false);
    const now = consts(ra, hunks.flatMap((h) => h.added), true);
    for (const [name, o] of was) {
      if (!watchedConstant(file, name, scriptsText)) continue;
      const nw = now.get(name);
      if (nw && nw.val === o.val) continue;
      if (!nw && ra.some((l) => new RegExp(`const\\s+${name}\\b`).test(l))) continue;   // the line moved, unchanged
      found.push(nw
        ? { file, line: nw.line, kind: 'input', what: `${name} ${o.val} → ${nw.val}`, from: o.val, to: nw.val, words: [name], need: numsOf(o.val, nw.val), code: nw.val }
        : { file, line: o.line, kind: 'input', what: `${name} ${o.val} removed or renamed`, from: o.val, to: '', words: [name], need: numsOf(o.val), code: `was ${o.val}`, old: true });
    }
    return found;
  }

  // A check script. Code lines whole, so that a line moved unchanged is known.
  const norm = (code) => clean(code).replace(/\s+/g, '');
  const present = new Set();
  for (let ln = 1; ln < after.length; ln++) present.add(norm(after[ln]));
  const values = (lines) => lines.flatMap((l) => numbers(l).map((x) => value(x.text)));

  for (const h of hunks) {
    // A hunk that only reflowed its code (a long bar wrapped onto two lines)
    // changes nothing.
    const joined = (ls, src) => ls.map((l) => src[l] ?? '').join(' ');
    if (shape(joined(h.removed, before)) === shape(joined(h.added, after))
      && values(h.removed.map((l) => before[l] ?? '')).join() === values(h.added.map((l) => after[l] ?? '')).join()) continue;

    // Pair each removed line with an added line of the same hunk that has the
    // same shape once its numbers are taken out.
    const used = new Set();
    const loose = [];
    for (const r of h.removed) {
      const rc = before[r] ?? '';
      if (!/\d/.test(clean(rc))) continue;
      const rs = shape(rc);
      if (!rs) continue;
      let match = h.added.find((a) => !used.has(a) && shape(after[a] ?? '') === rs);
      if (match === undefined) {
        // The same shape but a comparison turned round.
        const flip = (x) => x.replace(/<=|>=|<|>/g, '<>');
        match = h.added.find((a) => !used.has(a) && flip(shape(after[a] ?? '')) === flip(rs) && shape(after[a] ?? '') !== rs);
        if (match !== undefined) {
          used.add(match);
          const ops = (x) => (clean(x).match(/<=|>=|<|>/g) ?? []);
          const o = ops(rc); const w = ops(after[match]);
          const k = o.findIndex((x, i) => x !== w[i]);
          const turned = o[k][0] !== w[k][0];
          found.push({ file, line: match, kind: turned ? 'flip' : 'bar', what: `comparison ${o[k]} → ${w[k]}${turned ? ' (the check now asserts the opposite)' : ''}`, from: o[k], to: w[k], words: [base], need: [], ops: [o[k], w[k]], code: clean(after[match]) });
          continue;
        }
        if (!present.has(norm(rc))) loose.push(r);   // rewritten or deleted, not moved
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

    // A line rewritten or deleted. Each comparison with a number on it counts
    // unless the very same line is somewhere in the new file: a bar's quantity
    // renamed, `>= 0.05` widened to `>= 0.05 || !r.gpu` or to `>= 0.05 * 0.8`,
    // all keep the operator and the number and all are different bars. Every
    // other number on it counts unless the lines that replaced it in the hunk
    // still carry that number (a call renamed around the same values).
    // On these lines 0 and 1 are left out: measured over 50 merges they were
    // nearly all `?? 0`, `[0]`, `> 0` guards and `1 / 60`, plumbing rewritten
    // around the check rather than its bar, and they tripled what the guard
    // asked to be named. A 0 or 1 changed in place (paired above) still counts.
    const left = values(h.added.filter((a) => !used.has(a)).map((a) => after[a] ?? ''));
    const trivial = (t) => value(t) === 0 || value(t) === 1;
    // The same comparison, of the same thing, with the same number and the
    // same clause after it, on the lines that replaced it (a loop's `i < 100`
    // kept while its body was rewritten), is the same bar.
    const kept = new Set(h.added.filter((a) => !used.has(a)).flatMap((a) => comparisons(after[a] ?? '')).filter((c) => c.tail !== undefined).map((c) => `${c.key}|${c.op}|${value(c.num)}|${c.tail}`));
    for (const r of loose) {
      const rc = before[r];
      const cmps = comparisons(rc).filter((c) => !trivial(c.num));
      for (const c of cmps) if (!kept.has(`${c.key}|${c.op}|${value(c.num)}|${c.tail}`)) found.push({ file, line: r, kind: 'bar', what: `${c.op} ${c.num} on a rewritten or deleted line (was line ${r})`, from: c.num, to: '', words: [base], need: [c.num], code: clean(rc), old: true });
      for (const x of numbers(rc)) {
        if (trivial(x.text) || cmps.some((c) => value(c.num) === value(x.text))) continue;
        const k = left.indexOf(value(x.text));
        if (k >= 0) { left.splice(k, 1); continue; }
        found.push({ file, line: r, kind: 'input', what: `${x.text} on a rewritten or deleted line (was line ${r})`, from: x.text, to: '', words: [base], need: [x.text], code: clean(rc), old: true });
      }
    }

    // A check turned to assert the opposite (#357). Its fix for review took
    // two checks that asserted 18h's streaking, `spot1.aspect > spot0.aspect
    // * 1.12` ("dye streaks along the flow") and `dThick > dThin * 1.5`
    // ("Taylor dispersion scales with gap thickness"), and made them assert
    // that nothing happens: `<` instead of `>`, "does not smear", "is
    // negligible". Both would then pass with the dispersion pass deleted. No
    // bar's number had to move for that, so it is caught by its direction:
    // a quantity compared one way on the removed lines and only the other
    // way on the added ones, or a check's name that gains a "not", "no",
    // "never", "stays" or "negligible" while a comparison under it changes.
    const sides = (ls, src) => {
      const m = new Map();
      for (const l of ls) {
        for (const x of clean(src[l] ?? '').matchAll(/([\w$.\]]+)\s*(<=|>=|(?<![=<>-])<(?![<=])|(?<![=>-])>(?![>=]))/g)) {
          if (/^[\d.]/.test(x[1])) continue;
          if (!m.has(x[1])) m.set(x[1], new Set());
          m.get(x[1]).add(x[2][0]);
        }
      }
      return m;
    };
    const was = sides(h.removed, before); const now = sides(h.added, after);
    const flagged = found.filter((f) => f.kind === 'flip').map((f) => f.code).join(' ');
    for (const [k, dirs] of was) {
      const nw = now.get(k);
      if (!nw || dirs.size !== 1 || nw.size !== 1 || [...dirs][0] === [...nw][0] || flagged.includes(k)) continue;
      const a = h.added.find((l) => sides([l], after).has(k));
      found.push({ file, line: a, kind: 'flip', what: `${k} compared with ${[...dirs][0]} before and ${[...nw][0]} now (the check asserts the opposite)`, from: [...dirs][0], to: [...nw][0], words: [base], need: [], flipWord: true, code: clean(after[a] ?? '') });
    }
    if (oldText != null && newText != null && h.removed.some((r) => /<|>/.test(clean(before[r] ?? '').replace(/=>/g, '')))) {
      const rawB = oldText.split('\n'); const rawA = newText.split('\n');
      const strs = (ls, raw) => ls.map((l) => raw[l - 1] ?? '').join('\n').match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) ?? [];
      const NEG = /\b(not|no|never|nothing|none|stays?|negligible|unchanged|without|doesn't|isn't|won't)\b/gi;
      const negs = (ss) => ss.reduce((n, x) => n + (x.match(NEG) ?? []).length, 0);
      const rs = strs(h.removed, rawB); const as = strs(h.added, rawA);
      if (rs.length && negs(as) > negs(rs) && !found.some((f) => f.kind === 'flip' && h.added.includes(f.line))) {
        found.push({ file, line: h.added[0], kind: 'flip', what: `a check's name turned to expect nothing (${as.find((x) => NEG.test(x))?.slice(0, 70) ?? ''})`, from: '', to: '', words: [base], need: [], flipWord: true, code: clean(after[h.added.find((l) => /<|>/.test(clean(after[l] ?? '').replace(/=>/g, ''))) ?? h.added[0]] ?? '') });
        NEG.lastIndex = 0;
      }
    }
  }

  // Fewer checks than before. The bars and inputs that went with them are
  // listed under the removal for the reviewer, and the removal is the one
  // line to name: #340 took a feature and seven of its checks out of
  // rides.mjs, and asking for thirty-five lines, one per comparison, would
  // bury the one that matters. A number changed in place (paired above) is
  // still its own line.
  const count = (lines) => lines.reduce((n, l) => n + (l.match(/(?<![\w$.])check\s*\(/g) ?? []).length, 0);
  const had = count(before); const has = newText == null ? 0 : count(after);
  if (has < had || newText == null) {
    const gone = found.filter((f) => f.old);
    found.splice(0, found.length, ...found.filter((f) => !f.old));
    if (had > 0 || gone.length) found.push({ file, line: 0, kind: 'removed', what: newText == null ? `the file and its ${had} checks deleted` : `${had - has} of its ${had} checks removed`, from: String(had), to: String(has), words: [base], need: [], removed: true, code: gone.length ? `with ${gone.length} number${gone.length === 1 ? '' : 's'}: ${[...new Set(gone.map((g) => g.code.slice(0, 60)))].join(' | ')}` : '' });
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
  const plain = line.replace(/(?<=\d),(?=\d{3})/g, '');
  /*
    A bar below zero (`p.ySoap <= -0.7`) is needed with its sign, and NUM,
    which reads code, takes the minus for an operator: so a negative bar on a
    rewritten line could never be named, whatever the line said (filmlook's
    projector bar, #654). Its signed spelling in the body is read too, a
    hyphen or the typeset minus; the unsigned reading stays as it was.
  */
  const vals = [...(plain.match(NUM) ?? []), ...(plain.match(SIGNED) ?? []).map((t) => t.replace('\u2212', '-'))].map(value);
  for (const t of change.need) if (!vals.some((v) => Math.abs(v - value(t)) <= 1e-12 * Math.max(1, Math.abs(v)))) return false;
  if (change.ops && !(line.includes(change.ops[0]) && line.includes(change.ops[1]))) return false;
  if (change.removed && !/\b(remov|delet|drop)/i.test(line)) return false;
  if (change.flipWord && !/(flip|invert|revers|opposite|negat|turned|no effect|nothing)/i.test(line)) return false;
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
const show = (rev, file) => git('show', `${rev}:${file}`);

/*
  The changes between two texts of scripts/checks.json (PLAN.md 19k-1): an
  entry gone, or kept with another command, env or timeout. Entries are
  matched by name (a check that moves shard keeps its name, and moving is not
  a change to what it measures); a name on two shards is matched by both.
  A move between the Mac and Measure is a change too (where a check runs is what
  it is measured on); one between two Mac shards or two Measure parts is not.
  Returns the same shape as `changesIn`: `words` is the check's name, which the
  naming line must carry, and `need` the numbers that differ (a timeout 15 → 20,
  a `--seed 3` → `--seed 4`), so the line has to say both.
*/
export function manifestChanges(oldText, newText) {
  let a, b;
  let macA = [], macB = [];
  try {
    const A = JSON.parse(oldText), B = JSON.parse(newText);
    a = A.checks; b = B.checks;
    macA = A.shards?.mac ?? []; macB = B.shards?.mac ?? [];
  } catch { return []; }
  if (!Array.isArray(a) || !Array.isArray(b)) return [];
  const key = (c) => `${c.name}\u0000${c.shard}`;
  const now = new Map(b.map((c) => [key(c), c]));
  const byName = new Map();
  for (const c of b) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  const out = [];
  const file = 'scripts/checks.json';
  const env = (c) => Object.entries(c.env ?? {}).map(([k, v]) => `${k}=${v}`).sort().join(' ');
  for (const was of a) {
    let is = now.get(key(was));
    // Moved to another shard: the same name, found once.
    if (!is && (byName.get(was.name) ?? []).length === 1 && !a.some((c) => c !== was && c.name === was.name)) is = byName.get(was.name)[0];
    if (!is) {
      out.push({ file, line: 0, kind: 'manifest', what: `the check "${was.name}" removed (or renamed) in the manifest`, from: was.run, to: '', words: [was.name], need: [], removed: true, code: was.run.slice(0, 100) });
      continue;
    }
    const diffs = [];
    // Between the Mac and Measure: an app-frame check passes vacuously off
    // Metal (CLAUDE.md, "What can be verified where"), and the lab checks run
    // on another renderer, so where a check runs is part of what it measures.
    // A move between two Mac shards, or two Measure parts, is only balancing.
    if (was.shard !== is.shard && macA.includes(was.shard) !== macB.includes(is.shard)) {
      diffs.push({ field: 'place', from: `${was.shard} (${macA.includes(was.shard) ? 'Mac' : 'Measure'})`, to: `${is.shard} (${macB.includes(is.shard) ? 'Mac' : 'Measure'})` });
    }
    if (was.run !== is.run) diffs.push({ field: 'command', from: was.run, to: is.run });
    if (env(was) !== env(is)) diffs.push({ field: 'env', from: env(was) || '(none)', to: env(is) || '(none)' });
    if ((was.timeout ?? null) !== (is.timeout ?? null)) diffs.push({ field: 'timeout', from: String(was.timeout ?? 'none'), to: String(is.timeout ?? 'none') });
    for (const d of diffs) {
      const before = (clean(d.from).match(NUM) ?? []).map(value), after = (clean(d.to).match(NUM) ?? []).map(value);
      // The numbers in one and not the other, as a bag.
      const left = [...after];
      const gone = before.filter((v) => { const i = left.indexOf(v); if (i >= 0) { left.splice(i, 1); return false; } return true; });
      out.push({ file, line: 0, kind: 'manifest', what: `the check "${was.name}": its ${d.field} changed`, from: d.from, to: d.to, words: [was.name], need: [...gone, ...left].map(String), code: `${d.from.slice(0, 70)} → ${d.to.slice(0, 70)}` });
    }
  }
  return out;
}

export function changesBetween(from, to) {
  const diff = git('diff', '--no-renames', '-U0', from, to, '--', 'scripts', 'src');
  const out = [];
  // Every script's text, read only when a constant outside src/gpu/ moved.
  let text = null;
  const scriptsText = () => (text ??= git('ls-tree', '-r', '--name-only', to, 'scripts').trim().split('\n')
    .filter((f) => CHECK_FILE.test(f)).map((f) => show(to, f)).join('\n'));
  for (const f of parseDiff(diff).values()) {
    if (!CHECK_FILE.test(f.file) && !SRC_FILE.test(f.file)) continue;
    if (f.created) continue;   // a new file moves no bar that was there
    out.push(...changesIn(f.file, show(from, f.file), f.deleted ? null : show(to, f.file), f.hunks, scriptsText));
  }
  // The manifest of checks, which the diff above does not list (it reads
  // scripts/*.mjs|js|cjs|ts and src/).
  let old = null, now = null;
  try { old = show(from, 'scripts/checks.json'); now = show(to, 'scripts/checks.json'); } catch { /* absent on one side: nothing was there to change */ }
  if (old != null && now != null && old !== now) out.push(...manifestChanges(old, now));
  return out;
}

/*
  The flips in each of the pull request's own commits. A check can be turned
  round and the PR still add nothing against its base: #357 brought
  dispersion.mjs in new, then turned two of its checks round in a later
  commit, so against main it is a new file with no bar that was there before.
  The commits are where the turn shows, so each is read against its parent,
  for flips only: a bar tuned while a new check is written is ordinary, a
  check made to assert the opposite of what it asserted is not. A flip later
  turned back is still listed; name it as such.
*/
export function flipsIn(shas) {
  const out = [];
  for (const sha of shas) {
    for (const c of changesBetween(`${sha}^`, sha)) {
      if (c.kind !== 'flip') continue;
      out.push({ ...c, what: `${c.what}, in commit ${sha.slice(0, 7)}` });
    }
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
      const what = c.removed ? `${c.what}` : c.flipWord ? 'turned to assert the opposite' : c.ops ? `${c.ops[0]} → ${c.ops[1]}` : c.to ? `${c.from} → ${c.to}` : `${c.from} removed`;
      console.log(`- ${c.words[0] === c.file.split('/').pop() ? where : `${c.words[0]} (${where})`} ${what.trim()}: <why, and what it measured>`);
    }
  } else if (changes.length) console.log(`\nok   every change to a check's bar or input is named`);
  return unnamed;
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
  const neg = { file: 'scripts/filmlook.mjs', kind: 'bar', words: ['filmlook.mjs'], need: ['-0.7'], removed: true };
  t(names('scripts/filmlook.mjs:282 -0.7 removed: the condition rewritten, the projector keeps the same number', neg), 'a bar below zero, named with its sign, passes');
  t(names('scripts/filmlook.mjs:282 \u22120.7 removed: the condition rewritten, the projector keeps the same number', neg), 'and with the typeset minus');
  t(!names('scripts/filmlook.mjs:282 0.7 removed: the condition rewritten, the projector keeps the same number', neg), 'without its sign it does not');
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

  // #357, ebf5209: two checks of 18h's streaking turned to assert that
  // nothing happens, as they were written.
  const dispA = [
    'check(',
    '    \'dye streaks along the flow where it moves\',',
    '    spot1.aspect > spot0.aspect * 1.12,',
    '    `aspect ${spot1.aspect.toFixed(2)}`);',
    'check(',
    '    \'Taylor dispersion scales with gap thickness (h²)\',',
    '    dThick > dThin * 1.5,',
    '    `longitudinal stretch +${dThick.toFixed(4)} in open gap vs +${dThin.toFixed(4)} in tight gap (ratio ${(dThick / dThin).toFixed(2)}x)`',
    ');',
  ].join('\n');
  const dispB = dispA
    .replace('\'dye streaks along the flow where it moves\'', '\'dye does not smear irreversibly along the flow (pre-asymptotic shear is reversible)\'')
    .replace('spot1.aspect > spot0.aspect * 1.12', 'spot1.aspect < spot0.aspect * 1.05')
    .replace('\'Taylor dispersion scales with gap thickness (h²)\'', '\'Taylor dispersion is negligible on show timescales (t ≪ h²/Dm)\'')
    .replace('dThick > dThin * 1.5,\n    `longitudinal stretch +${dThick.toFixed(4)} in open gap vs +${dThin.toFixed(4)} in tight gap (ratio ${(dThick / dThin).toFixed(2)}x)`', 'dThick < 0.005 && dThin < 0.005,\n    `longitudinal stretch +${dThick.toFixed(4)} in open gap vs +${dThin.toFixed(4)} in tight gap`');
  c = run('scripts/dispersion.mjs', dispA, dispB).filter((x) => x.kind === 'flip');
  t(c.length === 2 && c[0].what.startsWith('comparison > → <') && /dThick/.test(c[1].what), '#357\'s two streaking checks turned to assert nothing happens are two flips', c.map((x) => x.what).join('; '));
  t(names('scripts/dispersion.mjs dThick turned round: Taylor dispersion is negligible at show timescales, measured below 0.005', c[1]), 'and a flip named as turned, with a reason, passes');
  t(!names('scripts/dispersion.mjs: Taylor dispersion is negligible at show timescales, measured below 0.005', c[1]), 'but not without saying it was turned');
  c = run('scripts/x.mjs', 'check(\'the pool moves\', moved > 0.3, \'\');', 'check(\'the pool stays\', moved < 2 || calm, \'\');').filter((x) => x.kind === 'flip');
  t(c.length === 1, 'a check rewritten to expect no effect is a flip', c.map((x) => x.what).join('; '));
  c = run('scripts/x.mjs', 'check(\'the pool moves\', moved > 0.3, \'\');', 'check(\'the pool does not move far\', moved > 0.3 && moved <= 9, \'\');').filter((x) => x.kind === 'flip');
  t(c.length === 1 && /expect nothing/.test(c[0].what), 'and so is a name that gains a "not" while its condition changes', c.map((x) => x.what).join('; '));
  t(run('scripts/x.mjs', 'check(\'the pool moves\', moved > 0.3, \'\');', 'check(\'the pool does not stay put\', moved > 0.3, \'\');').length === 0, 'a name reworded with a "not" over the same condition is not');
  t(run('scripts/x.mjs', 'const ok = a > b && c < d;', 'const ok = c < d && a > b && e > 0;').filter((x) => x.kind === 'flip').length === 0, 'nor comparisons reordered, each the same way round');

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
  same('a loop\'s body rewritten around the same run length (#372\'s framesway)', s.replace('t < 60; t++) step();', 't < 60; t++) { stepAll(); n++; }'));
  same('a bar wrapped onto two lines, unchanged', s.replace('cells >= 5, `', 'cells >=\n    5, `'));
  same('a line with a stir and a run length moved elsewhere, unchanged', `${s.split('\n').slice(2).join('\n')}\n${s.split('\n').slice(0, 2).join('\n')}`);

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
  // The ways round a paired line the check-skeptic found, each red.
  for (const [what, b] of [
    ['the bar\'s quantity swapped for another, the same number', s.replace('cells >= 5', 'peakCells >= 5')],
    ['the bar widened with an "or"', s.replace('cells >= 5', 'cells >= 5 || slow')],
    ['the bar scaled down', s.replace('cells >= 5', 'cells >= 5 * 0.8')],
    ['the bar compared after rounding', s.replace('cells >= 5', '+cells.toFixed(0) >= 5').replace('cells >= 5', 'cells >= 5')],
  ]) {
    const r = ch(b);
    t(r.length >= 1 && r.some((x) => x.kind === 'bar'), what, r.map((x) => `${x.kind} ${x.what}`).join('; ') || 'nothing found');
  }
  const lab = 'lab.dye(0.5, 0.5, 0.09, red, 1.4);\nlab.vel(0.4, 0.45, 0.3, [0.25, -0.15, 0, 0]);\ncheck(\'a\', x >= 0.05, \'\');\nawait page.goto(`${url}?stir=0.3&seed=7`);';
  c = run('scripts/x.mjs', lab, lab.replace('lab.vel(0.4, 0.45, 0.3, [0.25', 'lab2.vel(0.4, 0.45, 0.3, [2.5'));
  t(c.length === 1 && c[0].kind === 'input' && c[0].from === '0.25', 'an input changed on a line whose call was renamed', c.map((x) => x.what).join('; '));
  c = run('scripts/x.mjs', lab, lab.replace('lab.dye(0.5, 0.5, 0.09, red, 1.4);\n', ''));
  t(c.length >= 1 && c.every((x) => x.kind === 'input'), 'a line that pours the test\'s dye, deleted', c.map((x) => x.what).join('; '));
  c = run('scripts/x.mjs', lab, lab.replace('stir=0.3', 'stir=0.9'));
  t(c.length === 1 && c[0].what === '0.3 → 0.9', 'a value passed to the app in its URL', c.map((x) => x.what).join('; '));
  c = run('scripts/x.mjs', lab, lab.replace('?stir=0.3&seed=7`', '?stir=0.3&seed=7` + \' (0.9 here)\''));
  t(c.length === 0, 'but not the rest of the string', c.map((x) => x.what).join('; '));
  const wgsl = 'export const FINGER = /* wgsl */ `\n  const FINGER_REACH = 0.9;\n  const PI: f32 = 3.14159;\n  // const OLD = 2.0;\n`;\n';
  c = run('src/gpu/wgsl/finger.ts', wgsl, wgsl.replace('0.9', '1.2'));
  t(c.length === 1 && c[0].what === 'FINGER_REACH 0.9 → 1.2', 'a constant inside a shader\'s WGSL', c.map((x) => x.what).join('; '));
  t(run('src/gpu/wgsl/finger.ts', wgsl, wgsl.replace('const OLD = 2.0', 'const OLD = 3.0')).length === 0, 'but not one in a shader\'s comment');
  c = run('src/gpu/fluid.ts', fluidA, fluidA.replace('ROCK_FALL = 12', 'ROCK_FALL = BASE_FALL'));
  t(c.length === 1 && c[0].from === '12', 'ROCK_FALL turned into another constant\'s name', c.map((x) => x.what).join('; '));
  c = run('src/gpu/fluid.ts', fluidA, fluidA.replace('ROCK_FALL = 12', 'ROCK_FALL_RATE = 14'));
  t(c.length === 1 && c[0].from === '12', 'ROCK_FALL renamed with a new value', c.map((x) => x.what).join('; '));
  t(run('src/gpu/fluid.ts', fluidA, `export const ROCK_FALL = 12;\n${fluidA.replace('export const ROCK_FALL = 12;\n', '')}`).length === 0, 'ROCK_FALL moved up the file, unchanged');
  const panel = 'export const PANEL_WIDTH = 320;\n';
  t(changesIn('src/components/Panel.tsx', panel, panel.replace('320', '340'), hunksOf(panel, panel.replace('320', '340')), 'no script says so').length === 0, 'a panel\'s width in src/components is not watched');
  t(changesIn('src/components/Panel.tsx', panel, panel.replace('320', '340'), hunksOf(panel, panel.replace('320', '340')), 'expect(width).toBe(PANEL_WIDTH)').length === 1, 'unless a script reads it by name');
  c = ch(s.replace('check(\'it moves 5 cells or more\', cells >= 5, `${cells.toFixed(2)} cells of 5`);', ''));
  t(c.length === 1 && c[0].kind === 'removed' && /cells >= #|cells >= 5/.test(c[0].code), 'a check deleted is caught, its bar listed with it', c.map((x) => `${x.kind} ${x.what} ${x.code}`).join('; '));
  c = run('scripts/x.mjs', s, null);
  t(c.length === 1 && c[0].kind === 'removed', 'a check script deleted is caught', c.map((x) => x.what).join('; '));
  t(names('scripts/x.mjs deleted: its one check moved into rides.mjs with the same bar', c[0]), 'and named as removed with a reason, it passes');
  const ab = 'check(\'a\', x >= 0.05 && y < 3, \'\');';
  c = run('scripts/x.mjs', ab, 'check(\'a\', x >= 0.04 && y < 4, \'\');');
  t(c.length === 2 && c.every((x) => x.kind === 'bar'), 'two bars changed on one line are two changes');
  t(!['scripts/x.mjs 0.05 → 0.04: the plate moved further than the bar allowed'].some((l) => names(l, c[1])), 'and naming one does not name the other');

  // The manifest of checks (PLAN.md 19k-1): a check's entry removed, or its
  // command, env or timeout changed, is named; a move, a reorder and prose are not.
  const mf = (...checks) => JSON.stringify({ about: [], shards: { measure: ['a'], mac: ['b', 'c'] }, checks });
  const qa = { name: 'The app, every look', shard: 'b', run: 'QA_GPU=mid npm run qa -- --looks 12', timeout: 15, env: { SEED: '3' }, why: ['because'] };
  const other = { name: 'The desk', shard: 'a', run: 'npm run desk' };
  const base = mf(qa, other);
  t(manifestChanges(base, mf(qa, other)).length === 0, 'a manifest that did not change has no change to name');
  t(manifestChanges(base, mf({ ...qa, shard: 'c' }, other)).length === 0, 'a check moved between two Mac shards is only balancing, not a change');
  c = manifestChanges(base, mf({ ...qa, shard: 'a' }, other));
  t(c.length === 1 && /place/.test(c[0].what) && /Mac/.test(c[0].from) && /Measure/.test(c[0].to), 'a check moved from the Mac to Measure is a change', c.map((x) => `${x.what}: ${x.from} → ${x.to}`).join('; '));
  t(names('The app, every look: place b (Mac) to a (Measure) because the lab renders its looks the same without a GPU', c[0]), 'and named with a reason, it passes');
  t(manifestChanges(base, mf(qa, { ...other, shard: 'b' })).length === 1, 'and so is one from Measure to the Mac');
  t(manifestChanges(mf(qa, other, { name: 'Third', shard: 'a', run: 'npm run slosh' }), mf(qa, other, { name: 'Third', shard: 'a', run: 'npm run slosh' })).length === 0, 'a manifest read against itself has no moves');
  t(manifestChanges(base, mf(other, qa)).length === 0, 'a reorder is not');
  t(manifestChanges(base, mf({ ...qa, why: ['reworded'] }, other)).length === 0, 'nor is the prose');
  t(manifestChanges(base, mf(qa, other, { name: 'A new one', shard: 'a', run: 'npm run slosh' })).length === 0, 'nor a new entry');
  c = manifestChanges(base, mf(other));
  t(c.length === 1 && c[0].removed && c[0].words[0] === 'The app, every look', 'a removed entry is one change', c.map((x) => x.what).join('; '));
  t(names('The app, every look: removed, its looks are measured by gallery.yml now on the Mac', c[0]), 'named as removed with a reason, it passes');
  t(!names('The app, every look: changed, its looks are measured by gallery.yml now on the Mac', c[0]), 'named as changed, it does not');
  c = manifestChanges(base, mf({ ...qa, run: 'npm run qa -- --looks 12' }, other));
  t(c.length === 1 && c[0].kind === 'manifest' && /command/.test(c[0].what), 'QA_GPU=mid dropped from a command is a change', c.map((x) => x.what).join('; '));
  t(names('The app, every look: command loses QA_GPU=mid because the Mac runner has a real GPU anyway', c[0]), 'and named with a reason, it passes');
  t(!names('The app: command loses QA_GPU=mid because the Mac runner has a real GPU anyway', c[0]), 'but not by another check\'s name');
  c = manifestChanges(base, mf({ ...qa, timeout: 20 }, other));
  t(c.length === 1 && /timeout/.test(c[0].what) && c[0].need.join() === '15,20', 'a timeout 15 to 20 is a change that needs both numbers', c.map((x) => `${x.what} ${x.need}`).join('; '));
  t(!names('The app, every look: timeout 15 → 25 because the shard runs slower now on the runner', c[0]), 'named with the wrong number, it does not pass');
  t(names('The app, every look: timeout 15 → 20 because the shard runs slower now on the runner', c[0]), 'with both numbers and a reason, it does');
  c = manifestChanges(base, mf({ ...qa, run: 'QA_GPU=mid npm run qa -- --looks 24' }, other));
  t(c.length === 1 && c[0].need.join() === '12,24', 'a number in the command that changes is needed by value', c.map((x) => `${x.need}`).join('; '));
  c = manifestChanges(base, mf({ ...qa, env: { SEED: '4' } }, other));
  t(c.length === 1 && /env/.test(c[0].what) && c[0].need.join() === '3,4', 'an env value that changes is a change', c.map((x) => `${x.what} ${x.need}`).join('; '));
  c = manifestChanges(base, mf({ name: 'The app, now every look', shard: 'b', run: qa.run, timeout: 15, env: qa.env }, other));
  t(c.length === 1 && c[0].removed, 'a renamed check reads as the old name removed', c.map((x) => x.what).join('; '));
  t(manifestChanges('not json', base).length === 0 && manifestChanges(base, '{').length === 0, 'a manifest that does not parse is another check\'s to refuse');

  measuredSelftest(t);
  return failed;
}

// ─── Main ──────────────────────────────────────────────────────────────────

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };

const main = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (!main) {
  // imported: the functions above only
} else if (process.argv.includes('--diff')) {
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
  const live = await livePr();
  const body = live?.body ?? process.env.PR_BODY ?? '';
  const branch = live?.head?.ref ?? process.env.PR_BRANCH ?? '';
  const net = changesBetween('HEAD^1', 'HEAD');
  let flips;
  try {
    const { total, shas } = await prCommits(process.env.PR_NUMBER);
    git('fetch', '--no-tags', '--quiet', `--depth=${total + 2}`, 'origin', `+refs/pull/${process.env.PR_NUMBER}/head:refs/remotes/pr/head`);
    flips = flipsIn(shas);
  } catch (e) {
    console.log(`FAIL the pull request's own commits could not be read for turned checks (${e.message}); re-run the failed jobs`);
    process.exit(1);
  }
  const seen = new Set(net.map((c) => `${c.file}|${c.code}`));
  process.exit(report([...net, ...flips.filter((f) => !seen.has(`${f.file}|${f.code}`))], body) + reportMeasured(branch, body, 'HEAD^1') ? 1 : 0);
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
  const net = changesBetween(base, 'HEAD');
  const shas = git('rev-list', '--no-merges', '--reverse', `${base}..HEAD`).trim().split('\n').filter(Boolean);
  const seen = new Set(net.map((c) => `${c.file}|${c.code}`));
  process.exit(report([...net, ...flipsIn(shas).filter((f) => !seen.has(`${f.file}|${f.code}`))], body) + reportMeasured(arg('--branch') ?? git('rev-parse', '--abbrev-ref', 'HEAD').trim(), body, base) ? 1 : 0);
} else {
  const failed = selftest();
  console.log(failed ? `\n${failed} FAILED` : '\nall ok');
  process.exit(failed ? 1 : 0);
}
