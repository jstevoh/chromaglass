// A closed PR stops its runs (`.github/workflows/closed.yml`), and the gallery
// waits to be asked for (`.github/workflows/gallery.yml`). Run with
// `npm run closedruns`.
//
// closed.yml cancels a merged or closed pull request's queued and running
// `Checks` and `iPhone app` runs by joining their concurrency groups, which it
// has to spell out by hand: a group is a string, and nothing in GitHub tells a
// workflow what another workflow's group is. If checks.yml or ios.yml ever
// spells its group differently, closed.yml joins a group nobody is in, its
// jobs go green, and the Mac queue fills with merged PRs again without a word.
// So this reads the three files and evaluates each group the way GitHub would
// for a pull request event, `github.workflow` being the workflow's `name:` and
// `github.ref` the same placeholder in all three, and fails when they differ.
//
// It also holds the gallery to its trigger. The gallery photographed every
// preset for 29 Mac-minutes on nearly every push of nearly every PR (a PR's
// `paths:` are its whole diff), 31% of the Mac time measured over fifteen hours
// on 2026-10-03 (PLAN.md 19a). It now runs on `workflow_dispatch` or the
// `gallery` label only; a `paths:` filter or a `synchronize` coming back would
// bring the per-push run back, which this catches before it reaches the queue.
//
// Mutants it was checked against, each red: closed.yml's checks group renamed,
// its ios group changed, `cancel-in-progress` false on its checks job,
// checks.yml's group gaining a suffix, both groups gaining the same
// `${{ github.sha }}`, checks.yml renamed (its `github.workflow` changes), an
// `if:` on one of closed.yml's jobs, closed.yml triggered on `opened` as well
// or given a `paths:`, gallery.yml given back a `paths:` filter or a
// `synchronize`, and its job's `if:` moved into a comment.

import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8');
let failed = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
  if (!ok) failed++;
};

// The workflow's `name:` and every `concurrency:` block's group and
// cancel-in-progress, with the job each belongs to (null for workflow-level).
// The workflows are hand-written and two-space indented, so a line reader is
// enough and keeps this free of a YAML dependency.
function parse(text) {
  const lines = text.split('\n');
  const name = lines.find((l) => /^name:/.test(l))?.replace(/^name:\s*/, '').replace(/^['"]|['"]$/g, '').trim();
  const groups = [];
  let job = null;
  let inJobs = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^jobs:/.test(l)) inJobs = true;
    else if (/^\S/.test(l)) inJobs = false;
    const jm = inJobs && l.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (jm) job = jm[1];
    const cm = l.match(/^(\s*)concurrency:\s*$/);
    if (!cm) continue;
    const indent = cm[1].length;
    const block = {};
    for (let k = i + 1; k < lines.length; k++) {
      const m = lines[k].match(/^(\s*)([a-z-]+):\s*(.*)$/);
      if (!m || m[1].length <= indent) break;
      block[m[2]] = m[3].trim();
    }
    groups.push({ job: indent === 0 ? null : job, group: block.group, cancel: block['cancel-in-progress'] });
  }
  return { name, groups, text };
}

// A group as GitHub evaluates it for a pull request event. Any expression but
// these two would differ between the PR's run and the closed event's (a sha,
// an event name), or is one this cannot evaluate, so it is refused outright.
const REF = 'refs/pull/123/merge';
const evaluate = (group, workflowName) => {
  const out = group
    ?.replace(/\$\{\{\s*github\.workflow\s*\}\}/g, workflowName)
    .replace(/\$\{\{\s*github\.ref\s*\}\}/g, REF);
  return out?.includes('${{') ? `unevaluable: ${out}` : out;
};

const checks = parse(read('checks.yml'));
const ios = parse(read('ios.yml'));
const closed = parse(read('closed.yml'));
const gallery = parse(read('gallery.yml'));

const top = (w) => w.groups.find((g) => g.job === null);
const job = (w, id) => w.groups.find((g) => g.job === id);

// The `on:` block, exactly: a `paths:` or a `branches:` would make some PRs'
// closing fire nothing.
const block = (w, key) => {
  const i = w.text.indexOf(`\n${key}:`);
  if (i < 0) return '';
  const rest = w.text.slice(i + 1);
  const end = rest.slice(1).search(/\n\S/);
  return (end < 0 ? rest : rest.slice(0, end + 1)).replace(/\s+#.*$/gm, '').trim();
};
const closedOn = block(closed, 'on');
check(closedOn === 'on:\n  pull_request:\n    types: [closed]', 'closed.yml runs on every pull request closing, and on nothing else', JSON.stringify(closedOn));
// An `if:` on a job (say, merged == false) would quietly stop it for some
// closings; the jobs here have none.
check(!/^\s+if:/m.test(block(closed, 'jobs')), "closed.yml's jobs run on every closing, with no `if:`");

for (const [id, target, file] of [['checks', checks, 'checks.yml'], ['ios', ios, 'ios.yml']]) {
  const theirs = top(target);
  const ours = job(closed, id);
  check(!!theirs?.group, `${file} has a workflow-level concurrency group`, theirs?.group ?? 'none');
  check(!!ours?.group, `closed.yml's ${id} job has a concurrency group`, ours?.group ?? 'none');
  if (!theirs?.group || !ours?.group) continue;
  // The group closed.yml writes is evaluated with closed.yml's own name, since
  // that is what `github.workflow` is in its run; it must not use it.
  const want = evaluate(theirs.group, target.name);
  const have = evaluate(ours.group, closed.name);
  check(have === want && !/unevaluable/.test(have), `closed.yml's ${id} job joins ${file}'s group`, `${have} vs ${want}`);
  check(ours.cancel === 'true', `closed.yml's ${id} job cancels what is running there`, `cancel-in-progress: ${ours.cancel}`);
}

// The deploy gate (scripts/deploygate.sh) reads green `Checks` runs only by
// checks.yml's file name; closed.yml must never be that file or carry that
// name, or a run of it, every job a no-op, could be read as a green Checks run.
check(closed.name !== checks.name, 'closed.yml is not named like checks.yml', closed.name);

const galleryOn = block(gallery, 'on');
check(/pull_request:\s*\n\s+types:\s*\[labeled\]/.test(galleryOn) && !/paths:|synchronize|opened|reopened|push:/.test(galleryOn),
  'gallery.yml runs on a label or by hand, not on every push');
// The job's own `if:`, the line under `gallery:`'s name, not a comment.
const galleryIf = block(gallery, 'jobs').match(/^ {4}if: (.*)$/m)?.[1] ?? 'none';
check(galleryIf === "github.event_name == 'workflow_dispatch' || github.event.label.name == 'gallery'",
  "gallery.yml's job runs only for the `gallery` label or a dispatch", galleryIf);

console.log(failed ? `\n${failed} failed` : '\nall ok');
process.exit(failed ? 1 : 0);
