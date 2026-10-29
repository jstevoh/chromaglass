// Where CI's keys can go (`npm run cisecrets`; the security audit of 2026-10-28).
//
// Two of the repository's secrets can hurt people outside it.
// FIREBASE_SERVICE_ACCOUNT publishes anything to chromaglass.art. CSC_LINK and
// its password are the owner's Developer ID: they sign anything as ChromaGlass,
// and with the Apple ID and app password beside them notarise it, and the Mac
// app installs a newer signed build of itself. The audit found the signing set
// handed to every pull request's build of the Mac app (desktop.yml ran on
// `pull_request` with CSC_FOR_PULL_REQUEST), where the branch's own build
// config, npm scripts and dependencies run beside it. Any branch pushed here,
// an agent's included, or one poisoned package could have copied it.
//
// The fix is not in these files alone. A repository secret is readable by any
// workflow a pull request's branch writes for itself, so the two sets moved to
// environments that only main may use (`firebase-live`, `mac-signing`; the
// owner sets that in Settings → Environments, desktop/README.md). What the
// files must do, and what this holds them to:
//
//   1. each job that names one of those secrets runs in its environment, and
//      the Mac app's only when started by hand on main, so it never runs for a
//      pull request or a pushed tag (whose run is the tag's own copy of the file);
//   2. the signing secrets are passed only under that same condition, so a
//      pull request's run gets none even while they still sit in the
//      repository's secrets;
//   3. desktop.yml has no `push` trigger left (a tag used to start a release);
//   4. every workflow says `permissions:` at its top, with no `write`: the
//      token's reach is in the file, not in a repository setting that can
//      change under it (a job may still ask for more, as the Mac release does);
//   5. an action from outside GitHub's own `actions/` is pinned to a commit,
//      because a tag can be moved to other code by whoever holds that repo, and
//      the Firebase action holds the deploy key.
//
// It cannot see the environments themselves (their branch rules and secrets
// live in GitHub's settings, which no file holds); the README says what to set.
//
// So that it cannot pass while reading nothing, each rule first meets a broken
// copy of the real file (a mutant) and must turn it red; a rule that passes its
// mutant fails the run. The first draft knew only the spellings it was written
// for, and its review (2026-10-28) slipped thirteen past it: the whole set at
// once (`toJSON(secrets)`, a reusable workflow's `secrets: inherit`), another
// spelling of a name (`secrets['CSC_LINK']`, lower case, inside `format()`), a
// secret on a line that starts with `#` inside a heredoc (the shell's comment,
// not YAML's, and GitHub fills it in), jobs indented four spaces, a `write`
// after a comment in the permissions, `on: [push]`, an unpinned `docker://`.
// Each is a mutant below now. So the secrets are read from every `${{ }}` in
// the raw file, comments included (a `${{ secrets.X }}` written in a comment is
// red too: write the name without the braces), any form but `secrets.NAME` is
// red, names are matched ignoring case as GitHub does, and the blocks are
// found by their indentation rather than by counted spaces. Plain Node, no
// network: Measure's `logic`.

import fs from 'node:fs';

const DIR = new URL('../.github/workflows/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, DIR), 'utf8');
const files = fs.readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f)).sort();

let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};

const DEPLOY_KEY = ['FIREBASE_SERVICE_ACCOUNT'];
const SIGNING = ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'];
const KEYS = [...DEPLOY_KEY, ...SIGNING];
const MAIN_BY_HAND = "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'";
const SIGNING_ENV = `\${{ ${MAIN_BY_HAND} && 'mac-signing' || '' }}`;
const squash = (e) => e.replace(/\s+/g, ' ').trim();

const indent = (l) => /^ */.exec(l)[0].length;
const isComment = (l) => /^\s*#/.test(l);
const isBlank = (l) => /^\s*$/.test(l);

/**
 * A top-level key's lines: its own line, then every line after it that is
 * blank, a comment or indented, up to the next key at column 0. Null when the
 * file has no such key.
 */
function topBlock(lines, key) {
  const at = lines.findIndex((l) => new RegExp(`^['"]?${key}['"]?\\s*:`).test(l));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && (isBlank(lines[end]) || isComment(lines[end]) || indent(lines[end]) > 0)) end++;
  return { at, end, lines: lines.slice(at, end) };
}

/**
 * The jobs, by name, each with its line range: the keys of `jobs:` are the
 * lines at the indentation of its first key, whatever that indentation is.
 */
function jobs(lines) {
  const block = topBlock(lines, 'jobs');
  if (!block) return null;
  const keyLines = [];
  let depth = null;
  for (let i = block.at + 1; i < block.end; i++) {
    const l = lines[i];
    if (isBlank(l) || isComment(l)) continue;
    depth ??= indent(l);
    if (indent(l) === depth) keyLines.push(i);
  }
  return keyLines.map((i, k) => {
    const end = keyLines[k + 1] ?? block.end;
    const name = /^\s*['"]?([^'":]+)/.exec(lines[i])[1];
    // The job's own keys sit at the indentation of its first line below the name.
    const inner = lines.slice(i + 1, end).filter((l) => !isBlank(l) && !isComment(l));
    const d = inner.length ? indent(inner[0]) : -1;
    const env = inner.find((l) => indent(l) === d && /^\s*environment\s*:/.test(l));
    return { name, from: i, to: end, environment: env ? env.replace(/^\s*environment\s*:\s*/, '').trim() : null };
  });
}

// Rules 1 and 2: every expression that names `secrets`, anywhere in the file.
function secretsRule(text) {
  const lines = text.split('\n');
  const wrong = [];
  const js = jobs(lines) ?? [];
  const lineAt = (offset) => text.slice(0, offset).split('\n').length - 1;
  const jobAt = (line) => js.find((j) => line >= j.from && line < j.to) ?? null;
  for (const m of text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const expr = m[1];
    if (!/secrets/i.test(expr)) continue;
    const line = lineAt(m.index);
    const job = jobAt(line);
    const where = job ? job.name : `line ${line + 1}, outside any job`;
    // Only `secrets.NAME`: the whole set, an index or a function of it is red.
    const bare = expr.replace(/\bsecrets\.[A-Za-z_][A-Za-z0-9_]*/gi, '');
    if (/secrets/i.test(bare)) { wrong.push(`${where}: \${{${expr}}} reads secrets other than by name`); continue; }
    const names = [...expr.matchAll(/\bsecrets\.([A-Za-z_][A-Za-z0-9_]*)/gi)].map((n) => n[1].toUpperCase());
    for (const n of names.filter((x) => KEYS.includes(x))) {
      if (!job) { wrong.push(`${n} is named on ${where}, so no environment holds it`); continue; }
      if (DEPLOY_KEY.includes(n)) {
        if (job.environment !== 'firebase-live') wrong.push(`${where} names ${n} outside the firebase-live environment (${job.environment ?? 'none'})`);
        continue;
      }
      if (job.environment !== SIGNING_ENV) wrong.push(`${where} names ${n} with environment ${job.environment ?? 'none'}, not mac-signing on a run by hand on main alone`);
      if (squash(m[0]) !== `\${{ ${MAIN_BY_HAND} && secrets.${n} || '' }}`) wrong.push(`${where} passes ${n} without the main-by-hand guard: ${squash(m[0])}`);
    }
  }
  // The set handed whole to a reusable workflow.
  lines.forEach((l, i) => {
    if (!isComment(l) && /^\s*secrets\s*:\s*inherit\b/i.test(l)) wrong.push(`line ${i + 1}: secrets: inherit hands every secret to another workflow`);
  });
  return wrong;
}

// Rule 3: desktop.yml's triggers.
function triggerRule(text) {
  const block = topBlock(text.split('\n'), 'on');
  if (!block) return ['no on: found'];
  const words = block.lines.filter((l) => !isComment(l)).join('\n').replace(/^['"]?on['"]?\s*:/, '');
  const wrong = [];
  if (/\bpush\b/.test(words)) wrong.push('desktop.yml runs on push (a pushed tag is a way round the environment\'s main-only rule)');
  if (/\bpull_request_target\b/.test(words)) wrong.push('desktop.yml runs on pull_request_target, which hands a branch\'s run the base\'s secrets');
  if (/\bworkflow_run\b/.test(words)) wrong.push('desktop.yml runs on workflow_run, which runs with the base\'s secrets after a branch\'s run');
  return wrong;
}

// Rule 4: the top-level token.
function permissionsRule(text) {
  const block = topBlock(text.split('\n'), 'permissions');
  if (!block) return ['no top-level permissions: the repository default applies'];
  const body = block.lines.filter((l) => !isComment(l)).join('\n');
  if (/write/i.test(body)) return [`the top-level permissions write: ${squash(body)}`];
  return [];
}

// Rule 5: outside actions are pinned.
function pinRule(text) {
  const wrong = [];
  for (const l of text.split('\n')) {
    if (isComment(l)) continue;
    const m = /^\s*(?:-\s*)?uses\s*:\s*['"]?([^\s'"]+)/.exec(l);
    if (!m) continue;
    const ref = m[1];
    if (ref.startsWith('./') || /^actions\/[^@]+@/.test(ref)) continue;
    if (ref.startsWith('docker://')) { if (!/@sha256:[0-9a-f]{64}$/.test(ref)) wrong.push(`${ref} is not pinned to a digest`); continue; }
    if (!/@[0-9a-f]{40}$/.test(ref)) wrong.push(`${ref} is not pinned to a commit`);
  }
  return wrong;
}

// --- Each rule meets its mutants first ------------------------------------------
const desktop = read('desktop.yml');
const deploy = read('deploy.yml');
const guarded = (n) => `\${{ ${MAIN_BY_HAND} && secrets.${n} || '' }}`;
const addStep = (text, run) => text.replace('      - uses: actions/checkout@v5\n', `      - uses: actions/checkout@v5\n      - run: ${run}\n`);
const mutants = [
  ['secrets: the deploy key outside its environment', secretsRule, deploy.replace(/\n {4}environment: firebase-live\n/, '\n')],
  ['secrets: the signing environment on every run', secretsRule, desktop.replace(/environment: \$\{\{[^\n]*\n/, 'environment: mac-signing\n')],
  ['secrets: a signing secret passed unguarded', secretsRule, desktop.replace(guarded('CSC_LINK'), '${{ secrets.CSC_LINK }}')],
  ['secrets: a guard only in a comment', secretsRule, desktop.replace(/\n {4}environment: [^\n]*\n/, '\n    # environment: mac-signing\n')],
  ['secrets: the whole set as JSON', secretsRule, addStep(desktop, "echo '${{ toJSON(secrets) }}'")],
  ['secrets: an index instead of a name', secretsRule, addStep(desktop, "echo \"${{ secrets['CSC_LINK'] }}\"")],
  ['secrets: a name in lower case', secretsRule, addStep(desktop, 'echo "${{ secrets.csc_link }}"')],
  ['secrets: a name inside format()', secretsRule, addStep(desktop, "echo \"${{ format('{0}', secrets.CSC_LINK) }}\"")],
  ['secrets: on a shell comment line in a heredoc', secretsRule, deploy.replace(/\n {4}environment: firebase-live\n/, '\n').replace('      - uses: actions/checkout@v5\n', "      - uses: actions/checkout@v5\n      - run: |\n          cat <<'X'\n          # ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}\n          X\n")],
  ['secrets: handed whole to a reusable workflow', secretsRule, `${deploy}\n  stolen:\n    uses: someone/else/.github/workflows/x.yml@${'0'.repeat(40)}\n    secrets: inherit\n`],
  ['secrets: jobs indented four spaces', secretsRule, deploy.replace(/\n {4}environment: firebase-live\n/, '\n').replace(/\njobs:\n([\s\S]*)$/, (_, rest) => `\njobs:\n${rest.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n')}`)],
  ['secrets: named in a workflow-level env', secretsRule, deploy.replace('\njobs:\n', '\nenv:\n  KEY: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}\n\njobs:\n')],
  ['triggers: a tag push back', triggerRule, desktop.replace('\non:\n', "\non:\n  push:\n    tags: ['desktop-v*']\n")],
  ['triggers: push in the list form', triggerRule, desktop.replace(/\non:\n(?:(?: .*)?\n)+/, '\non: [workflow_dispatch, push]\n\n')],
  ['triggers: pull_request_target', triggerRule, desktop.replace('\non:\n', '\non:\n  pull_request_target:\n')],
  ['permissions: none at the top', permissionsRule, desktop.replace(/\npermissions:\n(?: {2}\S.*\n)+/, '\n')],
  ['permissions: write at the top', permissionsRule, desktop.replace(/\npermissions:\n {2}contents: read\n/, '\npermissions:\n  contents: write\n')],
  ['permissions: write after a comment line', permissionsRule, desktop.replace(/\npermissions:\n {2}contents: read\n/, '\npermissions:\n  contents: read\n  # and\n  actions: write\n')],
  ['permissions: write-all', permissionsRule, desktop.replace(/\npermissions:\n {2}contents: read\n/, '\npermissions: write-all\n')],
  ['pins: the Firebase action back on its tag', pinRule, deploy.replace(/action-hosting-deploy@[0-9a-f]{40}/, 'action-hosting-deploy@v0')],
  ['pins: a docker image by tag', pinRule, addStep(deploy, 'true').replace('      - run: true\n', '      - uses: docker://alpine:latest\n')],
];
for (const [what, rule, text] of mutants) {
  const found = rule(text);
  check(found.length > 0, `the rule catches its mutant (${what})`, found[0] ?? 'passed: the rule reads nothing');
}

// --- The real files --------------------------------------------------------------
const named = (s) => files.filter((f) => new RegExp(`\\bsecrets\\.${s}\\b`, 'i').test(read(f)));
check(named('FIREBASE_SERVICE_ACCOUNT').join() === 'deploy.yml', 'the deploy key is named only in deploy.yml', named('FIREBASE_SERVICE_ACCOUNT').join(', ') || 'nowhere');
check(SIGNING.every((s) => named(s).join() === 'desktop.yml'), 'the signing secrets are named only in desktop.yml', SIGNING.map((s) => `${s}: ${named(s).join(', ') || 'nowhere'}`).join('; '));
const deployJob = jobs(deploy.split('\n'))?.find((j) => j.name === 'deploy');
const buildJob = jobs(desktop.split('\n'))?.find((j) => j.name === 'build');
check(deployJob?.environment === 'firebase-live' && buildJob?.environment === SIGNING_ENV, 'the jobs that hold the keys were found, each in its environment', `deploy ${deployJob?.environment ?? 'not found'}, build ${buildJob?.environment ?? 'not found'}`);
for (const f of files) {
  const text = read(f);
  const wrong = [...secretsRule(text), ...permissionsRule(text), ...pinRule(text), ...(f === 'desktop.yml' ? triggerRule(text) : [])];
  check(wrong.length === 0, `${f}: keys in their environments, read-only at the top, outside actions pinned`, wrong.join('; '));
}

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
