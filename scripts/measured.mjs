// The Measured lines of an Antigravity pull request (docs/handoff.md, PLAN.md 19x-3):
// each command quotes the line it printed. Split out of checkguard.mjs so that file
// stays inside its size ceiling (scripts/sizes.json); checkguard.mjs runs it as its
// job and runs its self-test.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/*
  The groups under "Measured:" in a pull request's body: the text after the
  label on its own line, then each list item or plain line at the level of the
  first, until the next heading or the next "Label:" line at the label's own
  level. A group is such a line and the lines nested under it, each its own
  line (a wrapped line, indented and not a list item, joins the one before it).
  The label may itself be a list item ("- **Measured:**", as Antigravity's
  bodies write the whole handoff block), with its lines nested under it.
  `found` is false when the body has no such label at all.
*/
export function measuredGroups(body) {
  // An HTML comment is not in the rendered body, so nothing in one is measured.
  const lines = String(body ?? '').replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const item = /^([-*+]|\d+[.)])\s+/;
  const groups = [];
  let found = false;
  let inside = false;
  let labelAt = 0;
  let groupAt = null; // the indent of the first line of the first group
  for (const raw of lines) {
    const indent = raw.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;
    const l = raw.trim();
    // A bold label starts with "*", so a list marker is told by the space after it.
    const label = l.replace(/^#+\s*/, '').replace(item, '').replace(/\*\*/g, '').replace(/__/g, '');
    if (/^measured\s*(:|$)/i.test(label)) {
      found = true;
      inside = true;
      labelAt = indent;
      groupAt = null;
      const rest = label.replace(/^measured\s*:?\s*/i, '');
      if (rest) { groups.push([rest]); groupAt = indent; }
      continue;
    }
    if (!inside) continue;
    if (l === '') continue;
    // The section ends at a heading or at the next label at its own level: a
    // bold one ("**Controls:**") or one of the handoff block's own. A line such
    // as "Mac GPU: …" or "CI: all green" is not one, listed or not: with no
    // blank line before it Markdown renders it inside the last item, so it is
    // read as a line of the section, and fails if it quotes nothing.
    const isLabel = indent <= labelAt && /^[A-Z][\w '’/-]{0,40}:(\s|$)/.test(label)
      && (/^(\*\*|__)/.test(l.replace(item, '')) || /^(plan item|done|controls|review owed|check changes|left):/i.test(label));
    if (/^#+\s/.test(l) || isLabel) { inside = false; continue; }
    const text = l.replace(item, '');
    groupAt ??= indent;
    if (indent <= groupAt || groups.length === 0) groups.push([text]);
    else if (item.test(l)) groups[groups.length - 1].push(text);
    else { const g = groups[groups.length - 1]; g[g.length - 1] += ` ${text}`; }
  }
  return { found, groups };
}

// `npm run <script>` or `node scripts/<file>`, after any VAR=value prefixes.
const COMMAND = /^(?:[A-Z_][A-Z0-9_]*=\S+\s+)*(?:npm run ([\w:.-]+)|node (?:--[\w-]+(?:=\S+)?\s+)*(scripts\/[\w./-]+\.m?js))(?:\s|$)/;

/*
  What the printed line has to look like: two words or more, and either a
  number or the word a check prints in front of its result ("ok …", "FAIL …",
  "PASS …", "all ok", a "36/36 checks passed" count, a "✓ name, 34 s" line, npm's
  own "> node scripts/x.mjs" echo). "passed", "green", "ok" and a bare "1" are
  verdicts, not output, and so is a verdict with a date or a SHA, or inside a
  sentence ("it passed on 2026-10-26"), unless the span begins as a check's line
  does ("ok 12/12 passed").

  The one other way in: the words it begins with are in the command's own
  source (`source`, the lowercased text of the scripts the command runs). A
  check prints "all lines pass" or "adapter: apple" in words of its own, which
  no form can tell from a verdict, but a sentence the reader made up ("it
  passed on 2026-10-26") is in no script. That is the test against the first
  real bodies (#505, #511), which quoted lines like these.
*/
const CHECK_LINE = /^((all )?ok\b|FAIL\b|PASS\b|SKIP\b|[✓✗✔✘]|> \S|\d+\/\d+\s|\d+ passed, \d+ failed)/;
export function looksPrinted(text, source = '', file = null) {
  const t = text.trim();
  if (t.split(/\s+/).length < 2) return false;
  const cl = CHECK_LINE.exec(t);
  if (cl && /^> /.test(cl[1])) return file != null && new RegExp(`^> node (--\\S+\\s+)*${file.replace(/[.]/g, '\\.')}(\\s|$)`).test(t);
  if (cl) return true;
  const lead = [];
  for (const w of t.toLowerCase().split(/\s+/)) {
    if (lead.length === 3 || /[\d/.]/.test(w.replace(/:$/, ''))) break;
    lead.push(w);
    if (w.endsWith(':')) break; // "adapter: apple": the label is the script's, the value is the machine's
  }
  if (lead.length && source.replace(/\s+/g, ' ').includes(lead.join(' ')) && (lead.length > 1 || (/:$/.test(lead[0]) && !/\b(pass\w*|green|clean|success\w*|works?|fine|good)\b/i.test(t.slice(lead[0].length))))) return true;
  // A verdict anywhere in a span that does not begin as a check's line does.
  if (/\b(pass\w*|green|clean|success\w*|works?)\b/i.test(t)) return false;
  return /\d/.test(t);
}

// The text inside a script's string literals, comments stripped: what it can print.
// A comment or an object key is not output, so a sentence found only there is not a printed line.
export function stringLiterals(src) {
  const x = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  return [...x.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]).join('\n');
}

/*
  The problems with the Measured lines of a pull request from Antigravity, one
  string each, [] when every command is followed by the line it printed. Each
  group (a list item and what is nested under it) has to hold a command, and
  every command on any line of it is followed, on that line, by a code span
  that looks printed. Lines of a group with no command are the detail under
  one (the numbers a check printed, a heading over several commands).
    known    the names in package.json's scripts
    exists   whether a path in the repo exists
    source   the lowercased text of the scripts a command runs, for looksPrinted
    mdOnly   the PR changes only Markdown, so "none" is a true answer
*/
export function measuredProblems(body, { known, exists, source = () => '', pkgFile, mdOnly = false }) {
  const { found, groups } = measuredGroups(body);
  const problems = [];
  if (!found || groups.length === 0) return ['the body has no "Measured:" line with anything under it'];
  const cut = (t) => (t.length > 90 ? `${t.slice(0, 87)}...` : t);
  for (const g of groups) {
    if (g.length === 1 && /^(none|n\/a)\b\.?$/i.test(g[0].replace(/[`*_]/g, '').trim())) {
      if (!mdOnly) problems.push(`"${g[0]}": a PR that changes more than Markdown ran something; quote it`);
      continue;
    }
    let commands = 0;
    const quotedCmds = new Set(); const headCmds = [];
    const heading = []; // the first line's: a heading over lines that quote for themselves is not a claim
    for (const [n, line] of g.entries()) {
      const isHead = n === 0 && g.length > 1 && /:$/.test(line.trim());
      // Code spans in order; a command span is followed by the span it printed.
      const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
      for (let i = 0; i < spans.length; i++) {
        const m = COMMAND.exec(`${spans[i]} `);
        if (!m) continue;
        commands++;
        if (m[1] && !known.has(m[1])) problems.push(`\`${spans[i]}\`: package.json has no script "${m[1]}"`);
        if (m[2] && !exists(m[2])) problems.push(`\`${spans[i]}\`: ${m[2]} does not exist`);
        // The span right after the command: another between them is not what it
        // printed, except the CI job or commit it ran in (`job 121955921102`).
        const cmdSpan = m[1] ?? m[2];
        let j = i + 1;
        while (j < spans.length && /^([0-9a-f]{7,40}|\d{9,})$/.test(spans[j])) j++;
        const bad = isHead ? heading : problems;
        if (isHead) headCmds.push(m[1] ?? m[2]);
        if (j >= spans.length || !looksPrinted(spans[j], source(m[1], m[2]), m[2] ?? ((pkgFile?.(m[1])) ?? null))) bad.push(`\`${spans[i]}\`: no line it printed is quoted after it on the same line (\`ok 12/12 …\`, a number with its words); "passed" is a verdict, not output`);
        else { i = j; if (n > 0) quotedCmds.add(cmdSpan); }
      }
    }
    // "Before (`main`, `npm run grating`, 22 lines failed):" over lines that each quote the command and its line.
    if (headCmds.some((c) => !quotedCmds.has(c))) problems.push(...heading);
    if (commands === 0) problems.push(`"${cut(g[0])}": names no command in backticks (\`npm run <script>\`), so no one can run it again`);
  }
  return problems;
}

export const isAntigravity = (branch) => /^antigravity\//.test(branch ?? '');

// `base` is what the pull request is read against: the files it changes decide whether "none" is true.
export function reportMeasured(branch, body, base) {
  if (!branch) {
    console.log('FAIL the pull request\'s branch could not be read (no live answer and no PR_BRANCH), so whether its Measured lines are held cannot be told; re-run the failed jobs');
    return 1;
  }
  if (!isAntigravity(branch)) return 0;
  const files = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  const mdOnly = files.length > 0 && files.every((f) => /\.md$/.test(f));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts ?? {};
  const known = new Set(Object.keys(pkg));
  // What a command's scripts say in their own words: the files its package.json line names.
  const source = (name, file) => [...(name ? (pkg[name] ?? '').matchAll(/scripts\/[\w./-]+\.m?[jt]s/g) : [[file]])]
    .map(([f]) => { try { return stringLiterals(fs.readFileSync(f, 'utf8')); } catch { return ''; } }).join('\n').toLowerCase();
  const pkgFile = (name) => (pkg[name] ?? '').match(/scripts\/[\w./-]+\.m?[jt]s/)?.[0] ?? null;
  const problems = measuredProblems(body, { known, exists: (p) => fs.existsSync(p), source, pkgFile, mdOnly });
  if (problems.length === 0) console.log(`ok   Measured: every command in the body quotes a line it printed (${branch})`);
  for (const p of problems) console.log(`FAIL Measured: ${p}`);
  if (problems.length) {
    console.log('\nEach line under "Measured:" in an Antigravity pull request quotes the command and the line it printed, for example:\n');
    console.log('Measured:');
    console.log('- `npm run grating` on the Mac → `ok 12/12 grating holds at 0.5 px`');
    console.log('\nWrite them inline with backticks, not in a code block. Then re-run the failed jobs; no push is needed.');
  }
  return problems.length;
}

// Its self-test lines, run by checkguard.mjs with its `t`.
export function measuredSelftest(t) {
  // The Measured lines of an Antigravity PR (the owner's rule, 2026-10-26).
  const known = new Set(['grating', 'wall', 'qa', 'checkguard']);
  const mp = (body, o = {}) => measuredProblems(body, { known, exists: (p) => p === 'scripts/wall.mjs', ...o });
  t(mp('Measured:\n- `npm run grating` on the Mac → `ok 12/12 grating holds at 0.5 px`').length === 0, 'a command with the line it printed passes');
  t(mp('Measured: `npm run grating` → `ok 12/12 holds`; `npm run wall` → `all ok`').length === 0, 'two commands on one line, each with its line, pass');
  t(mp('**Measured:** `npm run grating` → `ok 12/12 holds`\n**Controls:** none').length === 0, 'a bold label, ended by the next label, passes');
  t(mp('## Measured\n\n1. `node scripts/wall.mjs` → `FAIL 3 of 9 stamps lit`').length === 0, 'a heading, a numbered list, a node script and a red line pass');
  t(mp('Measured:\n- `npm run grating` →\n  `ok 12/12 holds`').length === 0, 'a wrapped list item is one entry');
  t(mp('Measured: npm run grating passed on the Mac').length > 0, 'a verdict with no code spans fails');
  t(mp('Measured: `npm run grating` passed').length > 0, 'a command with "passed" after it fails');
  t(mp('Measured: `npm run grating` → `passed`').length > 0, 'a quoted verdict is not a printed line');
  t(mp('Measured: `npm run grating` → `ok`').length > 0, 'a bare "ok" is not a printed line');
  t(mp('Measured: `npm run grating` → `12`').length > 0, 'a bare number is not a printed line');
  t(mp('Measured: `npm run grating` → `all green`').length > 0, '"all green" is not a printed line');
  t(mp('Measured: `npm run grating` → `npm run wall`').length > 0, 'a command quoted as the output is not one');
  t(mp('Measured: `npm run grating` → `ok 12/12 holds`; `npm run wall` passed').length === 1, 'one command quoted and one not is one problem');
  t(mp('Measured:\n- `npm run grating` → `ok 12/12 holds`\n- CI is green').length === 1, 'a second line that quotes nothing fails though the first is fine');
  t(mp('Measured: `npm run lint` → `ok 12/12 holds`').length === 1, 'a script outside the known set fails');
  t(mp('Measured: `node scripts/nonesuch.mjs` → `ok 12/12 holds`').length === 1, 'a file that does not exist fails');
  t(mp('Measured: `npm run grating` → `ok 12/12 holds`', {}).length === 0 && mp('Plan item: 1\nDone: x\nMeasured:\nControls: y').length > 0, 'an empty Measured section fails');
  t(mp('Plan item: 1\nDone: x\nLeft: y').length > 0, 'no Measured label at all fails');
  t(mp('Measured: the npm scripts run, where they ran (Mac GPU / cloud / CI) and the numbers').length > 0, 'the template line left as it is fails');
  t(mp('Measured: none').length > 0 && mp('Measured: none', { mdOnly: true }).length === 0, '"none" is true only of a PR that changes Markdown alone');
  t(mp('Measured: none\n- `npm run grating` passed', { mdOnly: true }).length > 0, 'and "none" does not excuse a second line');
  t(mp('Measured:\n```\nnpm run grating -> ok 12/12 holds\n```').length > 0, 'a code block is not read as quoting (the message says to write it inline)');
  t(mp('Check changes: none\nMeasured:\n- `npm run grating` → `ok 12/12 holds`\nLeft: nothing `npm run wall`').length === 0, 'text after the next label is not read');
  // The shapes real Antigravity bodies have (#485, #492): nested lists, an env prefix, the numbers a check printed as detail.
  const nested = 'Measured:\n- Mac GPU (`WebGPU`):\n  - `PW_WEBGPU=1 npm run wall -- --preset x` → `ok 4/4 stamps lit`\n  - step 1: 94.6% → 94.6%\n  - `npm run grating`: `FAIL 1 of 9 rings`\n- CI on `45a7fb4`: 13/13 green';
  t(mp(nested).length === 1 && /^"CI on/.test(mp(nested)[0]), 'a group of nested lines passes on its commands; the CI line with no command is the one problem');
  t(mp('Measured:\n- `npm run grating`: 0 errors; `node scripts/wall.mjs`: `ok   no stamps`').length === 1, '"0 errors" outside backticks is not quoted; the command after it still is');
  t(mp('Measured:\n- Mac GPU:\n  - `npm run grating`: 24/24 ok\n  - `npm run wall` → `ok 4/4 stamps lit`').length === 1, 'a second line cannot borrow the first one\'s command: each is read on its own line');
  t(mp('Measured:\n- `npm run grating`\n  - `ok 12/12 holds`').length === 1, 'nor the printed line on the next line');
  t(mp('Measured:\n- All good here:\n  - nothing to see').length === 1, 'a group with details and no command fails');
  t(mp('Measured:\n- `node --experimental-strip-types scripts/wall.mjs` → `ok 4/4 stamps lit`').length === 0, 'node with flags before the script is a command');
  // Found by the skeptic pass: a "Word:" list item at the label's level is a line of the section.
  t(mp('Measured:\n- Mac GPU: `npm run grating` → `ok 24/24 holds`\n- `npm run wall` → `ok 4/4 stamps lit`').length === 0, 'the example in docs/handoff.md passes');
  t(mp('Measured:\n- `npm run wall` → `ok 4/4 stamps lit`\n- Mac GPU: `npm run grating` passed\n- CI: all green').length >= 1, 'and the lines after a "Mac GPU:" item are read');
  t(mp('- **Measured:**\n  - `npm run wall` → `ok 4/4 stamps lit`\n- **Controls:** `npm run grating` passed').length === 0 && mp('Measured:\n- `npm run wall` → `ok 4/4 stamps lit`\nControls: `npm run grating` passed').length === 0, 'bold and top-level labels still end the section');
  t(mp('- **Measured:**\n  - `npm run wall` → `ok 4/4 stamps lit`\n- Done: `npm run grating` passed').length === 0, 'and the handoff block\'s own labels as list items');
  t(mp('Measured: `npm run grating` → `passed on 2026-10-26`').length > 0 && mp('Measured: `npm run grating` → `green at 45a7fb4`').length > 0, 'a verdict with a date or a SHA is still a verdict');
  t(mp('Measured: `npm run grating` (`Mac`) → `ok 12/12 holds`').length > 0, 'a span between the command and the line it printed is not that line');
  t(mp('Measured:\n- `npm run wall` → `ok 4/4 stamps lit`\n#485: `npm run grating` passed').length === 1, 'a bare "#" does not end the section, and the line after it is read');
  t(mp('<!--\nMeasured:\n- `npm run grating` → `ok 12/12 holds` -->\nDone: x').length > 0, 'a Measured section inside an HTML comment is not there');
  t(mp('Measured the plate by eye\nLeft: y').length > 0, 'a line that starts with the word is not the label');
  // The reviewer's: a plain "Word:" line under a good one is read, not taken for the next label.
  t(mp('Measured:\n- `npm run wall` → `ok 4/4 stamps lit`\nMac GPU: `npm run grating` passed\nCI: all green').length === 2, 'plain "Mac GPU:" and "CI:" lines under a good line are read and fail');
  t(mp('Measured:\n- `npm run wall` → `ok 4/4 stamps lit`\nMac GPU: `npm run grating` → `ok 24/24 holds`').length === 0, 'and one that quotes its line passes');
  t(mp('Measured: `npm run grating` → `it passed on 2026-10-26`').length > 0 && mp('Measured: `npm run grating` → `24 checks green`').length > 0, 'a verdict inside a sentence is a verdict');
  t(mp('Measured: `npm run grating` → `ok 12/12 passed`').length === 0 && mp('Measured: `npm run grating` → `exit 0`').length === 0, 'but "ok 12/12 passed" is a check\'s line, and "exit 0" is what a silent command is quoted by');
  // The first real bodies (#505, #511): the lines checks print in their own forms.
  const src = 'console.log("all lines pass"); console.log(`  adapter: ${a}`);';
  const mq = (body) => mp(body, { source: () => src });
  t(mq('Measured: `npm run grating` → `PASS  the tape: 30 dB over the rest`').length === 0 && mq('Measured: `npm run grating` → `36/36 checks passed`').length === 0 && mq('Measured: `npm run grating` → `11 passed, 0 failed`').length === 0, 'PASS lines and a check\'s own "N/N checks passed" count are its lines');
  t(mq('Measured: `npm run grating` → `✓ The draining soap film on Metal, 34 s`').length === 0, 'a ✓ line is a printed line');
  const me = (body) => mp(body, { source: () => src, pkgFile: () => 'scripts/grating.mjs' });
  t(me('Measured: `npm run grating` → `> node scripts/grating.mjs`').length === 0 && me('Measured: `npm run grating` → `> node scripts/lint.mjs`').length > 0 && mq('Measured: `npm run grating` → `> node scripts/grating.mjs`').length > 0, 'npm\'s own echo is the command\'s own script, and only when the script is known');
  t(mq('Measured: `npm run grating` → `24 checks green`').length > 0 && mq('Measured: `npm run grating` → `3 of 3 passed`').length > 0, 'but a count in words of the writer\'s own is still a verdict');
  t(mq('Measured: `npm run grating` → `all lines pass`').length === 0 && mp('Measured: `npm run grating` → `all lines pass`').length > 0, '"all lines pass" is quoted when the script prints it, and not when no script does');
  t(mq('Measured: `npm run grating` → `adapter: apple`').length === 0 && mq('Measured: `npm run grating` → `it passed on 2026-10-26`').length > 0, 'a label the script prints counts with the machine\'s value after it, a sentence it never prints does not');
  // The reviewer's (#542): the source lookup reads string literals, not comments or object keys.
  const lit = stringLiterals('// it passed on 2026-10-26\n/* trust me, it works */\nconst o = { name: 1, timeout: 2 };\nconsole.log(`  adapter: ${a}`); console.log("all lines pass"); const u = "https://x.test/a"; // the check is green\n').toLowerCase();
  const ml = (body) => mp(body, { source: () => lit });
  t(ml('Measured: `npm run grating` → `all lines pass`').length === 0 && ml('Measured: `npm run grating` → `adapter: apple`').length === 0, 'what a script prints in a string literal still counts');
  t(ml('Measured: `npm run grating` → `it passed on 2026-10-26`').length > 0 && ml('Measured: `npm run grating` → `trust me, it works`').length > 0 && ml('Measured: `npm run grating` → `the check is green`').length > 0, 'a sentence found only in a comment does not');
  t(ml('Measured: `npm run grating` → `name: all green`').length > 0 && ml('Measured: `npm run grating` → `timeout: fine`').length > 0, 'nor a label that is an object key with a verdict after it');
  t(mq('Measured:\n- Before (`npm run grating`, `npm run wall`):\n  - `npm run grating` → `ok 12/12 holds`').length > 0, 'a heading naming two commands is excused only when both are quoted below it');
  t(mq('Measured: `npm run grating` → `trust me, it works`').length > 0, 'and a line that is in no script and has no number is not one');
  t(mq('Measured: (`npm run grating`, job `121955921102`) → `ok 12/12 holds`').length === 0 && mq('Measured: (`npm run grating`, job `121955921102`) → `nice`').length > 0, 'the CI job a command ran in may stand between it and its line');
  t(mq('Measured:\n- Before (`main`, `npm run grating`, 22 lines failed):\n  - `npm run grating` → `22 line(s) failed`').length === 0, 'a heading naming the command over lines that quote it is not a claim');
  t(mq('Measured:\n- Before (`npm run grating`):\n  - `ok 12/12 holds`').length === 1 && mq('Measured:\n- `npm run grating`:\n  - `ok 12/12 holds`').length === 1, 'but one over lines that quote no command is');
  t(isAntigravity('antigravity/18m-5') && !isAntigravity('claude/project-thread-x') && !isAntigravity('feature/antigravity/x') && !isAntigravity(''), 'only branches antigravity/… are held to it');
}
