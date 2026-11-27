// A folder's README against what the folder exports (PLAN.md 50n).
//
//   npm run readmes                  this tree's diff from main, and the self-test
//   npm run readmes -- --base <ref>  against another base
//
// CLAUDE.md's first rule for the code is that edges are typed and written
// down: code reaches another domain only through what it exports, and "a PR
// that changes an export updates that folder's README in the same PR". Until
// now nothing held that rule but a reader's memory, and the agents that build
// most of the code read the README first: a README that names a function the
// code renamed a month ago sends the next session to grep for a name that
// is not there, and one that never names the new export leaves the next
// session to find it by reading the file, which is the reading the README
// exists to save (CLAUDE.md "Keeping a session small").
//
// Two halves. The whole tree: every code name a README gives in backticks
// must be one some code has. Measured on main at 3a3e132 (2026-11-27), the
// twelve folder READMEs under src/ and server/ give 1,321 code-shaped names,
// and two were gone: src/gpu/README.md still described `gateDisplayWgsl` and
// `leanConstants`, the first version of the lean opening display, which
// #870 itself rewrote as `leanDisplayWgsl` before it merged (the file's own
// comment says why: an override was 4 s of compile, `false` 0.9 s). This PR
// fixes those two, so the half starts green and stays so. A README may keep
// a gone name as history only with a word that says so ("was", "went",
// "retired", "removed", "renamed", "deleted", "lost", ...) in its clause
// (`namedAsLive`, below). "Some code has it" means the code's own words,
// identifiers and strings, comments left out (`codeWords`): a name kept
// alive only by a comment saying it was renamed is gone.
// The diff: the rule CLAUDE.md names is about the moment a PR changes an
// export, and the whole-tree half cannot see a new export nobody wrote down,
// so for the files a PR changed:
//   - a name it newly exports from a folder's files must be named, in
//     backticks, in that folder's README (or the README of the folder above
//     that owns the file, below);
//   - a name it stops exporting, when no code anywhere still has it, must
//     not still be named in that README as if it were there.
// Not every export the tree has today is named (src/lib's 221 files have
// far more than its README lists), and the diff half does not ask that of
// the backlog: only of what a PR adds.
// A file belongs to the nearest folder above it that has a README.md, so
// src/gpu/wgsl/fluid/*.ts is wgsl/fluid's, and a folder with none (src/lib's
// subfolders) rolls up into its parent's. scripts/ is left out: its exports
// are the checks' own helpers, which no domain of the app imports, and its
// README names the ones a check author starts from, not all 400 files'.
//
// The base: in CI a pull request is checked out as its merge commit with two
// parents, so the diff is against the first parent, main (as reach.mjs and
// checkguard.mjs read it). Elsewhere it is the merge-base with origin/main.
// On main's own deploy run the merge commit is the squash, one parent, and
// the diff is the PR it carried, so a PR that slipped past is red on main
// once, which is a bug to fix (CLAUDE.md), not a gate.
//
// The self-test runs first, every time, on made-up files: an added export
// unnamed is red, named is green, a removed one still named is red, kept as
// history is green, a type-only export counts, a re-export counts, a
// comment that says `export function` does not. A check that cannot go red
// is not a check (PLAN.md 50i, the mutation run, exists for that reason).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(ts|tsx|mjs|js)$/;
const SCOPES = ['src/', 'server/'];

// What a file exports, by name, from TypeScript's own parser (it is the
// typecheck's, already installed): every `export` statement's names, all of
// `export const a = 1, b = 2`, a generator, a const enum, `export { a, b as
// c } from`, `export * as ns`; comments and strings are never statements, so
// a sentence about `export function x`, or a string with "/*" in it, is not
// an export. `export * from './x'` adds names nobody can list from this file
// alone, so it counts as no name (the names it passes on are x's own exports,
// judged in x).
const kindOf = (file) => (/\.tsx$/.test(file) ? ts.ScriptKind.TSX : /\.ts$/.test(file) ? ts.ScriptKind.TS : ts.ScriptKind.JS);
const bindingNames = (n, out) => {
  if (ts.isIdentifier(n)) out.add(n.text);
  else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) for (const e of n.elements) if (!ts.isOmittedExpression(e)) bindingNames(e.name, out);
};
export function exportsOf(text, file = 'x.ts') {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kindOf(file));
  const out = new Set();
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      const c = st.exportClause;
      if (c && ts.isNamedExports(c)) for (const e of c.elements) { if (e.name.text !== 'default') out.add(e.name.text); }
      else if (c && ts.isNamespaceExport(c)) out.add(c.name.text);
      continue;
    }
    if (!(ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))) continue;
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bindingNames(d.name, out);
    else if (st.name && ts.isIdentifier(st.name)) out.add(st.name.text);
  }
  return out;
}

// The words of a file's code, its comments left out: identifiers, and the
// words inside its strings and template literals (a shader's WGSL is a
// template string, and a README may name a WGSL function). A name that lives
// on only in a comment ("it was `gateDisplayWgsl`") is gone from the code.
export function codeWords(text, file = 'x.ts', out = new Set()) {
  const sc = ts.createScanner(ts.ScriptTarget.Latest, true, kindOf(file) === ts.ScriptKind.TSX ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
  for (let k = sc.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = sc.scan()) {
    const t = sc.getTokenText();
    if (k === ts.SyntaxKind.Identifier) out.add(t);
    else if (/[A-Za-z_$]/.test(t) && t.length > 1) for (const m of t.matchAll(/[A-Za-z_$][\w$]*/g)) out.add(m[0]);
  }
  return out;
}

// The names a README gives in backticks: `foo`, `foo()`, `foo(a, b)`,
// `Foo.bar` (as Foo), `npm run x` and paths are not names.
export function namesIn(readme) {
  const out = new Set();
  for (const m of readme.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim();
    if (/\.(ts|tsx|mjs|js|json|md|wgsl|css|html|sh|yml)$/.test(t)) continue; // a file
    const n = /^([A-Za-z_$][\w$]*)(?:\.[\w$]+)*(?:\(.*\))?$/.exec(t);
    if (n) out.add(n[1]);
  }
  return out;
}

const HISTORY = /\b(was|were|went|retired|moved|removed|renamed|until|before|gone|old|replaced|dropped|shelved|lost|deleted|deprecated|no longer|used to)\b/i;
// Whether a README names `name` as live: some place it is named has no
// history word in its clause. The clause, not the line: these READMEs write a
// paragraph a line (src/lib's line 27 has 146 names in backticks), and one
// "went" on such a line excused all of them. A clause ends at a full stop,
// a semicolon, a colon, a bracket or a line's end, read with every backtick
// span blanked so `f(a; b)` neither ends a clause nor is read as one, and a
// name in backticks is never itself the history word.
export function namedAsLive(readme, name) {
  const masked = readme.replace(/`[^`\n]*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`');
  const re = new RegExp('`' + name.replace(/\$/g, '\\$') + '(?:[.(][^`]*)?`', 'g');
  const END = /[.;:()\[\]\n]/;
  for (const m of readme.matchAll(re)) {
    let a = m.index;
    while (a > 0 && !END.test(masked[a - 1])) a--;
    let b = m.index + m[0].length;
    while (b < masked.length && !(END.test(masked[b]) && (masked[b] !== '.' || /\s|$/.test(masked[b + 1] ?? '')))) b++;
    if (!HISTORY.test(masked.slice(a, b))) return true;
  }
  return false;
}

// Which README owns a file: the nearest folder above it with one.
export function ownerOf(file, hasReadme) {
  let d = path.posix.dirname(file);
  while (d && d !== '.') {
    if (hasReadme(d)) return d;
    d = path.posix.dirname(d);
  }
  return null;
}

/*
  The verdict for one diff. `files` maps a changed code file to its text
  before and after (null when it did not exist); `readmes` maps a folder to
  its README's text after; `everywhere(name)` says whether any code in the
  tree still has the name. Returns the problems, one line each.
*/
export function drift({ files, readmes, everywhere, unowned = null }) {
  const added = new Map();
  const removed = new Map();
  for (const [f, { before, after }] of files) {
    const owner = ownerOf(f, (d) => readmes.has(d));
    // A file under no README (src/App.tsx, src/types.ts, most of
    // src/components) has no README to fall behind: counted, and said.
    if (!owner) { unowned?.push(f); continue; }
    const was = before == null ? new Set() : exportsOf(before, f);
    const now = after == null ? new Set() : exportsOf(after, f);
    for (const n of now) if (!was.has(n)) { if (!added.has(owner)) added.set(owner, []); added.get(owner).push([n, f]); }
    for (const n of was) if (!now.has(n)) { if (!removed.has(owner)) removed.set(owner, []); removed.get(owner).push([n, f]); }
  }
  const problems = [];
  for (const [owner, list] of added) {
    const named = namesIn(readmes.get(owner));
    for (const [n, f] of list) {
      // A name moved between two files of the same folder is not new.
      if ((removed.get(owner) ?? []).some(([r]) => r === n)) continue;
      if (!named.has(n)) problems.push(`${f} newly exports \`${n}\`, and ${owner}/README.md does not name it`);
    }
  }
  for (const [owner, list] of removed) {
    const text = readmes.get(owner);
    for (const [n, f] of list) {
      if ((added.get(owner) ?? []).some(([a]) => a === n)) continue;
      if (everywhere(n)) continue;
      if (namedAsLive(text, n)) problems.push(`${f} no longer exports \`${n}\` (no code has it), and ${owner}/README.md still names it`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------- self-test

function selfTest() {
  let fails = 0;
  const t = (what, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) fails++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} self-test: ${what}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
  };
  const ex = exportsOf([
    'export function a() {}', 'export async function b() {}', 'export const C_MAX = 1;',
    'export type T = 1;', 'export interface I {}', 'export { d, e as f } from "./x";',
    'export type { G } from "./y";', 'export default class H {}',
    '// export function notMe() {}', '/* export const alsoNot = 1 */', 'const local = 1;',
  ].join('\n'));
  t('the shapes of export the repository writes, and no comment', [...ex].sort(), ['C_MAX', 'G', 'H', 'I', 'T', 'a', 'b', 'd', 'f']);
  t('names in backticks, with calls and members, not paths or commands',
    [...namesIn('`foo`, `bar(x, y)`, `Baz.qux`, `src/lib`, `npm run x`, `a.ts`')].sort(), ['Baz', 'bar', 'foo']);
  const readmes = new Map([['src/k', 'The k folder: `kept`, `named()`; `oldName` was the old way, and `alsoOld`, `andThis` and `THIS_TOO` went with it; `kept` is here.\n']]);
  const run = (before, after, readme, gone = () => false) => drift({
    files: new Map([['src/k/deep/f.ts', { before, after }]]),
    readmes: new Map([['src/k', readme]]), everywhere: gone,
  });
  t('a new export the README does not name is red', run('export const kept = 1;', 'export const kept = 1;\nexport function fresh() {}', readmes.get('src/k')).length, 1);
  t('a new export the README names is green', run('', 'export function named() {}', readmes.get('src/k')), []);
  t('a file in a folder with no README rolls up to the one above', ownerOf('src/k/deep/f.ts', (d) => d === 'src/k'), 'src/k');
  t('a removed export the README still names as live is red', run('export const kept = 1;', '', readmes.get('src/k')).length, 1);
  t('a removed export the README keeps as history is green', run('export const oldName = 1;', '', readmes.get('src/k')), []);
  t('a list of names the clause says went is history, all of it', ['alsoOld', 'andThis', 'THIS_TOO'].map((n) => namedAsLive(readmes.get('src/k'), n)), [false, false, false]);
  t('one history word does not excuse a whole line: only its clause', namedAsLive('`gone` was here; `liveName` is the way in, and so on.', 'liveName'), true);
  t('a name only a comment still has is gone from the code', codeWords('// it was gateOld\nconst x = `fn shade() {}`; f("str word");').has('gateOld'), false);
  t('a name in a string or a shader template is code', [...['shade', 'word', 'x']].every((w) => codeWords('const x = `fn shade() {}`; f("str word");').has(w)), true);
  t('every name of `export const a = 1, b = 2`, a generator, a const enum, `export * as ns`', [...exportsOf('export const a = 1, b = 2;\nexport function* gen() {}\nexport const enum E { A }\nexport * as ns from "./n";\nexport * from "./m";\nconst s = "src/*.wgsl"; export const after = 1;')].sort(), ['E', 'a', 'after', 'b', 'gen', 'ns']);
  t('a removed export some other code still has is green', run('export const kept = 1;', '', readmes.get('src/k'), (n) => n === 'kept'), []);
  t('a type-only export counts', run('', 'export type Fresh = 1;', readmes.get('src/k')).length, 1);
  t('a re-export counts', run('', 'export { fresh } from "./g";', readmes.get('src/k')).length, 1);
  t('an export moved between two files of one folder is not new', drift({
    files: new Map([['src/k/a.ts', { before: 'export const moved = 1;', after: '' }], ['src/k/b.ts', { before: '', after: 'export const moved = 1;' }]]),
    readmes: new Map([['src/k', 'nothing']]), everywhere: () => true,
  }), []);
  t('a file under no README is not judged', drift({ files: new Map([['src/z/x.ts', { before: '', after: 'export const q = 1;' }]]), readmes: new Map([['src/k', '']]), everywhere: () => false }), []);
  return fails;
}

// --------------------------------------------------------------------- main

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const tryGit = (...a) => { try { return git(...a); } catch { return null; } };

function baseRef() {
  if (opt('--base')) return git('merge-base', opt('--base'), 'HEAD').trim();
  const parents = (tryGit('rev-list', '--parents', '-n', '1', 'HEAD') ?? '').trim().split(' ');
  if (parents.length > 2) return parents[1]; // a PR's merge commit: main is its first parent
  const mb = tryGit('merge-base', 'origin/main', 'HEAD')?.trim();
  const head = tryGit('rev-parse', 'HEAD')?.trim();
  if (mb && mb !== head) return mb;
  return parents[1] ?? null; // on main itself: the commit before
}

function codeFiles(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) codeFiles(p, out);
    else if (CODE.test(e.name)) out.push(p);
  }
  return out;
}

const fails = selfTest();
const readmeDirs = new Map();
for (const s of SCOPES) {
  const walk = (d) => {
    if (fs.existsSync(path.join(ROOT, d, 'README.md'))) readmeDirs.set(d, fs.readFileSync(path.join(ROOT, d, 'README.md'), 'utf8'));
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) if (e.isDirectory() && e.name !== 'node_modules' && !e.name.startsWith('.')) walk(path.posix.join(d, e.name));
  };
  walk(s.replace(/\/$/, ''));
}
const all = SCOPES.flatMap((s) => codeFiles(s.replace(/\/$/, '')));
// The words of the code the READMEs describe, src/ and server/, comments left
// out. Not scripts/: a check that reads the source as text names what it
// looks for in a string, and that string would keep a gone name alive (this
// file's own comments name the two stale names it found).
const words = new Set();
for (const f of all) codeWords(fs.readFileSync(path.join(ROOT, f), 'utf8'), f, words);

// Every name a README gives that no code in src/, server/ or scripts/ has,
// unless the line says it is history. Only code-shaped names (camelCase,
// PascalCase with two humps, SHOUTING_CASE), so a README's `Tank` or `on`
// is prose, not a claim about the code.
const CODE_NAME = /[a-z][A-Z]|^[A-Z][A-Z0-9]*_[A-Z0-9_]+$|^[A-Z][a-z]+[A-Z]/;
let stale = 0;
let given = 0;
for (const [d, text] of readmeDirs) {
  const names = [...namesIn(text)].filter((n) => CODE_NAME.test(n));
  given += names.length;
  const gone = names.filter((n) => !words.has(n) && namedAsLive(text, n));
  stale += gone.length;
  for (const n of gone) console.log(`FAIL ${d}/README.md names \`${n}\`, which no code has (renamed or removed: name what is there now, or say it was)`);
}
console.log(`${stale ? 'FAIL' : 'ok  '} ${readmeDirs.size} READMEs under ${SCOPES.join(' and ')} give ${given} code names: ${stale} that no code has`);

const base = baseRef();
let problems = [];
const shallow = (tryGit('rev-parse', '--is-shallow-repository') ?? '').trim() === 'true';
if (!base && shallow) {
  // A checkout one commit deep has no parent to diff against, and a pass
  // there would judge nothing (CI's Measure parts were one deep until this
  // check asked for two).
  console.log('FAIL a shallow checkout with no parent: nothing to diff against, so nothing judged (fetch two deep)');
  problems = ['shallow'];
} else if (!base) console.log('ok   no base to diff against (a first commit): nothing to judge');
else {
  const changed = [...new Set([
    ...git('diff', '--name-only', '--no-renames', base).split('\n'),
    ...(tryGit('ls-files', '--others', '--exclude-standard') ?? '').split('\n'),
  ])].filter((f) => f && CODE.test(f) && SCOPES.some((s) => f.startsWith(s)));
  const files = new Map();
  for (const f of changed) {
    const before = tryGit('show', `${base}:${f}`);
    const p = path.join(ROOT, f);
    files.set(f, { before, after: fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null });
  }
  const unowned = [];
  problems = drift({ files, readmes: readmeDirs, everywhere: (n) => words.has(n), unowned });
  if (unowned.length) console.log(`note ${unowned.length} changed file${unowned.length === 1 ? '' : 's'} under no folder README, not judged: ${unowned.join(', ')}`);
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${changed.length} code files changed since ${base.slice(0, 7)} under ${SCOPES.join(' and ')}: ${problems.length} export${problems.length === 1 ? '' : 's'} its README does not match`);
}
process.exit(fails || stale || problems.length ? 1 : 0);
