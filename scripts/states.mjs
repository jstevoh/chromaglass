#!/usr/bin/env node
/**
 * Every button drawn by a state says that state, in one look.
 *
 *   npm run states          # a second, no browser
 *
 * Reported (the owner, 2026-10-24, the Video panel open, a loop playing):
 * "I really can't tell what buttons are turned on/off." Load loop, Camera,
 * Window and Off were four grey buttons alike, and the loop that was playing
 * looked like the two that were not. `npm run switches` reads every control
 * that says it has a state, in a browser, and holds on against off to 3:1;
 * what it cannot see is a control that changes its look and says nothing,
 * because to the browser that is just a button, as it is to a screen reader.
 * The audit behind PLAN 35a found more than eighty of them, each a
 * `className` with a ternary on a state (`on ? 'bg-white text-black' : …`)
 * and no `aria-pressed`, `aria-selected` or `aria-checked` beside it.
 *
 * So this reads the source, not the page: every `<button …>` opening tag in
 * `src/`, and in it every ternary whose branches draw a colour (a `bg-`,
 * `border-`, `text-` or `ring-` class, or the shared `LIT`). Such a button
 * fails when:
 *
 *   it says no state   no aria-pressed, -selected, -checked, -current or
 *                      -expanded, and no role of switch, tab, radio or option;
 *                      add the one that is true (a mode or a hold is pressed,
 *                      the one chosen of several is pressed or selected, a
 *                      sheet's opener is expanded)
 *   it is on in a      the branch it draws on with is a white fill, an amber,
 *   retired look       a raw purple, violet, blue or emerald: on is `LIT`
 *                      (`ui/index.tsx`), red only live-now, green only
 *                      connected; white stays the one primary on a surface,
 *                      which is never a state
 *
 * A ternary on something that is not a setting (a corner being dragged, a
 * warning tone, the row under the keyboard's cursor, a size) is not a state a
 * performer reads; those are named in `NOT_A_STATE` with the reason, by file
 * and the condition's text, so a new one is a decision written down and not
 * a blind spot. `--selftest` runs the reader on samples whose verdicts are
 * known, so a reader that stopped finding tags fails rather than passes, and
 * `MIN_LOOKS` is the floor on how many stateful looks a real run finds.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Fewer stateful looks than this in `src/` and the reader has stopped
 * finding them (a tag shape it does not parse), not the app stopped having
 * them: 2026-10-24, before the fix, it found 86 unstated ones and some fifty stated.
 */
const MIN_LOOKS = 100;

/** Ternaries on something that is not a setting. [file, the condition exactly, why]. */
const NOT_A_STATE = [
  ['OutputPanel.tsx', 'dragging === i', 'the corner under the pointer while it drags, not a setting'],
  ['RemoteControl.tsx', "tone === 'warn'", 'a warning tone on a status line'],
  ['desk/CommandPalette.tsx', 'i === at', 'the row under the keyboard cursor; the list says aria-activedescendant'],
  ['CrashReportButton.tsx', 'lit', 'a report waiting to be sent, a notice not a setting'],
  ['ToolAmount.tsx', 'value === 1', 'the amount at its stop, a reading not a choice'],
  ['OutputPanel.tsx', 'identity', 'Reset greyed while there is nothing to reset, which its `disabled` says'],
  ['ui/index.tsx', 'hit', 'the ring a controller puts on a control while it touches it, a flash'],
];

const STATED = /\baria-(pressed|selected|checked|current|expanded)\b|\brole=["'{](switch|tab|radio|option|menuitemradio|menuitemcheckbox)\b/;
const COLOURED = /(^|[\s'"`])!?(bg|border|text|ring)-|\bLIT\b|\bLIVE\b/;
/**
 * A look no state is drawn in, in either branch: a solid white (the primary's),
 * any palette colour that is not one of the three that mean something, and a
 * raw hex. The tokens (lit, live, ok, accent) are what is left.
 */
const RETIRED = /(^|[\s'"`])(bg-white(?![/\w-])|bg-text\b|bg-primary\b|bg-\[#|(bg|text|border)-(amber|yellow|orange|purple|violet|indigo|blue|sky|cyan|teal|emerald|lime|fuchsia|pink|rose|green|red)-)/;
/** And a white tint, read only in the branch that comes first: the quiet off look beside a lit one is a 5% white. */
const TINTED = /(^|[\s'"`])bg-white\/([1-9]\d)\b/;
/** Conditions on a size or a variant, not a state: whole words, so `sizeId` is not `size`. */
const NOT_A_STATE_WORD = /\b(disabled|hover|compact|tight|touch|size|variant|small|wide|narrow|primary|danger|tablet|phone|landscape|embed|floating)\b/;
const LITERAL_STATE = /\baria-(pressed|selected|checked|current)(?:=\{(?:true|false)\}|(?=[\s>]))/;
const BRANCH = String.raw`(?:'[^']*'|"[^"]*"|\x60[^\x60]*\x60|[A-Za-z_$][\w$.]*)`;
const TERNARY = new RegExp(String.raw`([^?{}]{0,90})\?\s*(${BRANCH})\s*:\s*(${BRANCH})`, 'g');
const AND = new RegExp(String.raw`([^?{}&|]{1,90})&&\s*('[^']*'|"[^"]*"|\x60[^\x60]*\x60)`, 'g');
/** The condition alone: the text before the `?` cut at the last comma, bracket, plus or quote, so `cn('x hover:y', on ? …)` reads as `on`. */
const condOf = (raw) => raw.replace(/\s+/g, ' ').split(/[,(+'"`]/).pop().trim();
const isIdent = (b) => /^[A-Za-z_$]/.test(b) && !/^(undefined|null|true|false)$/.test(b);

/** Each `<button` opening tag in a file: its text and its line. */
export function buttonTags(src) {
  const tags = [];
  let i = 0;
  while ((i = src.indexOf('<button', i)) >= 0) {
    if (/\w/.test(src[i + 7] ?? '')) { i += 7; continue; }
    let j = i + 7, depth = 0, quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === '\\') { j++; continue; } if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && src[j - 1] !== '=') break;
    }
    tags.push({ text: src.slice(i, j + 1), line: src.slice(0, i).split('\n').length });
    i = j;
  }
  return tags;
}

/** What one tag draws by a state, and what is wrong with it. */
export function judge(tag, file = '') {
  const m = tag.match(/className=\{([\s\S]*)\}/);
  if (!m) return null;
  const looks = [
    ...[...m[1].matchAll(TERNARY)].map(t => ({ cond: condOf(t[1]), on: t[2], off: t[3] })),
    ...[...m[1].matchAll(AND)].map(t => ({ cond: condOf(t[1]), on: t[2], off: "''" })),
  ]
    // A branch that is a name (a const built above, `on ? ACTIVE : IDLE`)
    // cannot be read here, so it counts as a look and has to be said.
    .filter(t => COLOURED.test(t.on) || COLOURED.test(t.off) || isIdent(t.on) || isIdent(t.off))
    .filter(t => t.cond && !NOT_A_STATE_WORD.test(t.cond))
    .filter(t => !NOT_A_STATE.some(([f, c]) => file.endsWith(f) && t.cond === c));
  if (!looks.length) return null;
  const problems = [];
  if (!STATED.test(tag)) problems.push('says no state');
  else if (LITERAL_STATE.test(tag) && !/aria-(pressed|selected|checked|current)=\{(?!true\}|false\})/.test(tag)) problems.push('says a fixed state while its look changes');
  for (const t of looks) {
    const retired = [t.on, t.off].find(b => RETIRED.test(b)) ?? (TINTED.test(t.on) ? t.on : null);
    if (retired) problems.push(`on in a retired look (${retired.slice(0, 50)})`);
  }
  return { conds: looks.map(t => t.cond.slice(-48)), problems };
}

function selftest() {
  const cases = [
    ['<button className={`px-2 ${on ? \'bg-white text-black\' : \'text-muted\'}`}>', ['says no state', 'on in a retired look']],
    ['<button aria-pressed={on} className={`px-2 ${on ? LIT : \'text-muted\'}`}>', []],
    ['<button role="tab" aria-selected={a} className={`x ${a ? \'bg-lit text-on-lit\' : \'\'}`}>', []],
    ['<button aria-pressed={on} className={on ? \'bg-amber-500 text-black\' : \'border\'}>', ['on in a retired look']],
    ['<button className={`x ${disabled ? \'text-faint\' : \'text-text\'}`}>', null],
    ['<button onClick={() => a > b}\n  className={`p ${open ? \'bg-hover\' : \'\'}`}>', ['says no state']],
    // The skeptic's (2026-10-24): each slipped through the first reader.
    ['<button className={`x ${sizeId === s.id ? \'border-white/40 bg-white/15 text-white\' : \'\'}`}>', ['says no state', 'on in a retired look']],
    ["<button className={cn('px-2 hover:bg-hover', on ? 'bg-white text-black' : '')}>", ['says no state', 'on in a retired look']],
    ["<button aria-pressed={!off} className={off ? 'text-muted' : 'bg-white text-black'}>", ['on in a retired look']],
    ['<button className={on ? ACTIVE : IDLE}>', ['says no state']],
    ["<button aria-pressed={on} className={on ? 'bg-sky-500' : ''}>", ['on in a retired look']],
    ["<button aria-pressed={false} className={on ? LIT : ''}>", ['says a fixed state']],
    ["<button className={`x ${on && 'bg-lit'}`}>", ['says no state']],
  ];
  let bad = 0;
  for (const [src, want] of cases) {
    const tags = buttonTags(src);
    const got = tags.length === 1 ? judge(tags[0].text) : 'no tag';
    const ok = want === null ? got === null
      : got && got !== 'no tag' && got.problems.length === want.length && want.every((w, k) => got.problems[k].startsWith(w));
    if (!ok) bad++;
    console.log(`${ok ? ' ok ' : 'FAIL'}  selftest: ${src.split('\n')[0].slice(0, 70)} — ${JSON.stringify(got)}`);
  }
  return bad;
}

const walk = (d) => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(p) ? [p] : [];
});

if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = selftest();
  if (process.argv.includes('--selftest')) process.exit(failed ? 1 : 0);
  let looks = 0, stated = 0;
  const bad = [];
  for (const file of walk('src')) {
    const rel = relative('src', file);
    for (const tag of buttonTags(readFileSync(file, 'utf8'))) {
      const j = judge(tag.text, rel);
      if (!j) continue;
      looks++;
      if (!j.problems.includes('says no state')) stated++;
      if (j.problems.length) bad.push(`src/${rel}:${tag.line}  ${j.problems.join('; ')}  [${j.conds.join(' | ')}]`);
    }
  }
  for (const b of bad) console.log(`FAIL  ${b}`);
  const floor = looks >= MIN_LOOKS;
  console.log(`${floor ? ' ok ' : 'FAIL'}  ${looks} buttons drawn by a state found (floor ${MIN_LOOKS}), ${stated} say it`);
  failed += bad.length + (floor ? 0 : 1);
  console.log(`\n${failed ? `${failed} failed` : 'every button drawn by a state says it, in the lit look'}`);
  process.exit(failed ? 1 : 0);
}
