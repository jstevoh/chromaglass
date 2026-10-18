// Which checks go red and then green on the same commit (PLAN.md 19aa). Run
// with `npm run flakes` (the last 7 days), `npm run flakes -- --days 21`,
// `npm run flakes -- --since 2026-10-18 --until 2026-10-25`, and
// `npm run flakes -- --check 'no stop in the opening'` to list every attempt
// of the checks whose name matches.
//
// What was asked, 2026-10-17: these checks fail all the time; how often do
// they find a real problem? An audit of three weeks by hand (657 red checks,
// /mnt/project-files is the owner's, not the repository's) answered it: about
// one in five was a real catch, more than half were flakes, and seven checks
// made seven in ten of the flakes. It took a thread a day of reading logs,
// and every flake before it had been found the same way, one thread at a
// time, usually by a thread whose own PR it had just turned red. This is that
// audit as a script, so the count is there whenever someone wants it and a
// fix to a flaky check can be judged by the runs CI does anyway.
//
// That last part is why it exists now. The startup check's "no stop in the
// opening" fails about one attempt in nine on the Mac, from Chromium starting
// the GPU cold (PLAN.md 14v-6). A fix to that cannot be judged on its own
// PR's one or two runs: at one in nine, eight green runs in a row happen by
// chance two times in five. It needs thirty or so, which is a week of
// ordinary pushes, not thirty pushes made for the purpose. So the measure is
// this script's rate for that line before the merge against after it.
//
// How it reads: every run of `checks.yml` and `deploy.yml` created in the
// window, every attempt's jobs (a re-run is a second attempt of the same
// run), and each job's log, which on a public repository the API serves
// without a token (`GH_TOKEN` is used when set). A re-run attempt lists the
// jobs it did not re-run again, with new ids and the first attempt's log, so
// a job is counted once by its run, its name and when it started. Jobs
// cancelled part way are read for what they printed before they stopped.
//
// The harnesses print one line per check, " ok   <name> — <detail>" or
// " FAIL <name> — <detail>", so a check is its place and its name. The place
// is the runner's system and the command the step ran ("mac startup", "mac
// PHONE_GPU=1 phone", "linux renders"), because the same harness measures
// different things on Linux and on Metal. An indented line is a clause of
// the check above it and is filed under both names. The detail is the
// measurement and differs every run; the name is the claim and does not,
// except where it carries a bar or a count, so digits are folded out of the
// key, unless one job prints two names that fold together (the wall's
// scenarios), and then the names are kept whole.
//
// A FAIL is counted as gone green on the same commit when the same check
// printed ok on the same head commit in another job, in any attempt or run
// in the window: the code did not change and the check's answer did, which
// is what a flake is. That undercounts flakes (a red that nobody re-ran,
// fixed by a later commit that changed nothing it measures, reads as not
// re-run) and never overcounts them, so the column is a floor. "on main"
// counts the reds on main's own pushes and deploys, and "branches" how many
// branches saw the red: a check red on fifteen branches is not fifteen
// broken changes. A red job that printed no FAIL line while running a
// harness (a timeout, a crash, a runner lost) is listed after the table by
// job name, since no check said anything; the jobs that only gather their
// shards' results ("WebGPU (macOS)", "Measure") go red with any shard and
// run no harness, so they are not on it.
//
// Not a gate, and it changes no bar. A rate here depends on how much was
// pushed and what, so it is the before and after for a change to a check or
// to what a check measures, and the list to work down, never a reason to
// pass a PR.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const days = Number(arg('days', 7));
const until = arg('until', null);
const since = arg('since', null)
  ?? new Date((until ? Date.parse(until) : Date.now()) - days * 864e5).toISOString().slice(0, 10);
const only = arg('check', null);
const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
const API = `https://api.github.com/repos/${repo}`;

// curl rather than fetch: a cloud session's proxy is configured for curl, and
// Node's fetch does not read HTTPS_PROXY (as in macqueue.mjs).
async function curl(url) {
  const auth = process.env.GH_TOKEN ? ['-H', `Authorization: Bearer ${process.env.GH_TOKEN}`] : [];
  const { stdout } = await run('curl', ['-fsSL', '--retry', '3', ...auth, '-H', 'Accept: application/vnd.github+json', url], {
    maxBuffer: 1 << 28,
  });
  return stdout;
}
const get = async (path) => JSON.parse(await curl(`${API}/${path}`));

// Some hundreds of logs a week, a few seconds each one at a time: eight at
// once, and a finished job's log never changes, so each is kept on disk and
// a second run in the same session reads only what is new.
async function pool(items, n, f) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await f(items[i]);
    }
  }));
  return out;
}
const cache = join(tmpdir(), 'cg-flakes');
mkdirSync(cache, { recursive: true });
async function logOf(job) {
  const file = join(cache, `${job.id}.txt`);
  if (existsSync(file)) return readFileSync(file, 'utf8');
  try {
    const text = await curl(`${API}/actions/jobs/${job.id}/logs`);
    writeFileSync(file, text);
    return text;
  } catch (e) {
    // Only a log GitHub says is gone (expired after the retention days, or
    // deleted) is counted as unread. A rate limit, a proxy reset or a 5xx
    // stops the script, rather than printing a table quietly short of the
    // logs it could not read.
    if (/error: (404|410)\b/.test(String(e.stderr))) return null;
    throw e;
  }
}

const created = until ? `${since}..${until}` : `>=${since}`;
const runs = [];
for (const wf of ['checks.yml', 'deploy.yml']) {
  for (let page = 1; page <= 10; page++) {
    const j = await get(`actions/workflows/${wf}/runs?per_page=100&page=${page}&created=${encodeURIComponent(created)}`);
    runs.push(...j.workflow_runs);
    if (j.workflow_runs.length < 100) break;
    if (page === 10) console.log(`note: stopped at 1,000 runs of ${wf}; the window holds more, so every count below is short`);
  }
}

// When the failed jobs of a run are re-run, GitHub lists every job again
// under the new attempt, the ones that were not re-run with a new id and the
// first attempt's log and start time. Counted as they are, 313 of the first
// week's 2,099 logs were such copies, and the startup line read 16 FAILs of
// 152 where it ran 132 times; worse for a before and after, the copies grow
// with how often other checks forced re-runs. A job is the run, its name and
// when it started. Cancelled jobs are read too: a superseded push cancels its
// run, and every line printed before that is a whole answer (one of the first
// week's startup FAILs was in one).
const jobs = [];
const seenJob = new Set();
let cancelled = 0;
await pool(runs, 8, async (r) => {
  for (let page = 1; ; page++) {
    const list = (await get(`actions/runs/${r.id}/jobs?per_page=100&filter=all&page=${page}`)).jobs;
    for (const job of list) {
      if (job.status !== 'completed' || !['success', 'failure', 'cancelled'].includes(job.conclusion)) continue;
      // A job cancelled before it ran a step (a superseded push, a PR that
      // merged while its shards were queued) has no log: GitHub answers 404.
      // On the week of 2026-10-11 all 373 of the logs it would not give were
      // these, so they are left out here rather than counted as logs lost.
      if (job.conclusion === 'cancelled' && !job.steps?.length) continue;
      const id = `${r.id}|${job.name}|${job.started_at}`;
      if (seenJob.has(id)) continue;
      seenJob.add(id);
      if (job.conclusion === 'cancelled') cancelled++;
      jobs.push({ job, run: r });
    }
    if (list.length < 100) break;
  }
});

// A step's header names the harness ("Run npm run startup", "Run QA_GPU=mid
// npm run qa", "Run node --experimental-strip-types scripts/phone.mjs"), and
// inside a step that chains several, npm echoes each "> node scripts/x.mjs".
// Not npm's own "> chromaglass@1.3.0 build" banner: `npm run startup` builds
// the site first, and taking that banner would file every startup check under
// "build". A step that runs no harness (checkout, install) reads as '?'.
//
// The whole command is the check's place, with the runner's system, not just
// the script: `renders` runs on Linux in Measure and with a plate on the Mac,
// `phone` with and without PHONE_GPU=1, and "the ear is reading" went red 16
// times on the Mac and never in 428 Linux runs. Filed under the script alone,
// the Linux greens made each of those Mac reds look like a flake on the same
// commit.
const LINE = /^\S+Z\s+(ok|FAIL)(\s+)(.*)$/;
const STEP = /^\S+Z ##\[group\]Run /;
const NAMED = /(?:node (?:--\S+ )*scripts\/(\S+?)\.mjs|npm run (\S+)|bash scripts\/(\S+?)\.sh)/;
const HARNESS = /^\S+Z > node (?:--\S+ )*scripts\/(\S+?)\.mjs/;
const compact = (cmd) => cmd.trim().replace(/node (?:--\S+ )*scripts\//, '').replace(/\.mjs\b/, '').replace(/^((?:\S+=\S+ )*)npm run /, '$1');
const fold = (name) => name.replace(/[0-9]+(\.[0-9]+)?/g, '#');

const obs = [];
const unfoldable = new Set();
const silent = new Map();
let unread = 0;
await pool(jobs, 8, async ({ job, run: r }) => {
  const text = await logOf(job);
  if (text == null) { unread++; return; }
  const os = (job.labels ?? []).some((l) => /mac/i.test(l)) ? 'mac' : 'linux';
  let place = '?';
  let stepHarness = null;
  let parent = '';
  let fails = 0;
  let harnesses = 0;
  const folds = new Map();
  for (const raw of text.split('\n')) {
    if (STEP.test(raw)) {
      const cmd = raw.replace(STEP, '');
      const n = cmd.match(NAMED);
      stepHarness = n ? (n[1] ?? n[2] ?? n[3]) : null;
      place = n ? `${os} ${compact(cmd)}` : '?';
      if (n) harnesses++;
      parent = '';
      continue;
    }
    const h = raw.match(HARNESS);
    if (h) {
      if (h[1] !== stepHarness) place = `${os} ${h[1]}`;
      parent = '';
      continue;
    }
    const m = raw.match(LINE);
    if (!m) continue;
    // A harness prints a check at column 5 after its verdict ("ok   name",
    // "FAIL name") and a clause of the check above it two further in
    // ("ok     and the gate skipped a show frame only where an ask drew").
    // `wall` prints that clause under seven scenarios: alone, it would be one
    // check printed seven times a job, its count seven times too big and the
    // other scenarios' oks turning its FAILs into flakes. So a clause is
    // named by the check it hangs from.
    const [own, ...rest] = m[3].split(' — ');
    const indented = m[1].length + m[2].length >= 7;
    const name = indented && parent ? `${parent} / ${own.trim()}` : own.trim();
    if (!indented) parent = own.trim();
    const key = `${place}: ${name}`;
    const f = `${place}: ${fold(name)}`;
    if (!folds.has(f)) folds.set(f, new Set());
    folds.get(f).add(key);
    obs.push({
      key, f, ok: m[1] === 'ok', sha: r.head_sha, at: job.started_at, run: r.id, attempt: job.run_attempt,
      branch: r.head_branch, job: job.id, detail: rest.join(' — '),
    });
    if (m[1] === 'FAIL') fails++;
  }
  // Digits are folded out of a name so that a bar or a count printed in it
  // ("2.13 s", "41 looks") does not split one check into one row a run, but
  // not where one job prints two names that differ only in their digits
  // ("club, 128 bpm" and "club, 90 bpm"): those are two checks.
  for (const [f, keys] of folds) if (keys.size > 1) unfoldable.add(f);
  // A red job with no FAIL line, counted only where the job ran a harness:
  // the roll-up jobs ("WebGPU (macOS)", "Measure") go red with any part and
  // print no check of their own.
  if (job.conclusion === 'failure' && fails === 0 && harnesses > 0) {
    const name = job.name.replace(/^Checks \/ /, '');
    const s = silent.get(name) ?? { n: 0, runs: [] };
    s.n++;
    s.runs.push(r.id);
    silent.set(name, s);
  }
});

const checks = new Map();
for (const o of obs) {
  const key = unfoldable.has(o.f) ? o.key : o.f;
  if (!checks.has(key)) checks.set(key, { name: o.key, seen: [] });
  checks.get(key).seen.push(o);
}

const shas = new Set(runs.map((r) => r.head_sha));
console.log(`flakes from ${since}${until ? ` to ${until}` : ' to now'}: ${runs.length} runs on ${shas.size} commits, ${jobs.length} finished jobs read (${cancelled} of them cancelled part way)${unread ? `, ${unread} logs gone` : ''}`);

const rows = [...checks.values()].map((c) => {
  const fails = c.seen.filter((s) => !s.ok);
  // Green on the same commit means in another job: a job that printed the
  // same name twice, ok and FAIL, has not shown the commit can pass.
  const greenOn = new Map();
  for (const s of c.seen.filter((x) => x.ok)) {
    if (!greenOn.has(s.sha)) greenOn.set(s.sha, new Set());
    greenOn.get(s.sha).add(s.job);
  }
  return {
    ...c, fails: fails.length, of: c.seen.length,
    flaked: fails.filter((s) => [...(greenOn.get(s.sha) ?? [])].some((j) => j !== s.job)).length,
    onMain: fails.filter((s) => s.branch === 'main').length,
    branches: new Set(fails.map((s) => s.branch)).size,
  };
});

if (only) {
  const re = new RegExp(only, 'i');
  for (const c of rows.filter((x) => re.test(x.name))) {
    console.log(`\n${c.name}: ${c.fails} FAIL of ${c.of} (${((100 * c.fails) / c.of).toFixed(0)}%), ${c.flaked} of them green on the same commit`);
    for (const s of c.seen.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
      console.log(`  ${s.at.replace('T', ' ').slice(0, 16)}  ${s.ok ? 'ok  ' : 'FAIL'}  run ${s.run}/${s.attempt}  ${s.branch}  ${s.detail.slice(0, 140)}`);
    }
  }
} else {
  const red = rows.filter((c) => c.fails > 0).sort((a, b) => b.fails - a.fails || b.flaked - a.flaked);
  console.log(`\n${red.length} of ${rows.length} checks went red at least once; "same commit" is a floor on the flakes (see the top of this file)\n`);
  // "branches" is how many branches the reds came from: twenty-five reds on
  // one branch is usually that branch's own change being caught (the magnet
  // check on the PR that was changing the magnet), the same count spread over
  // eight branches is the check.
  console.log('  FAIL    of  rate  green on the same commit  on main  branches  check');
  for (const c of red) {
    console.log(`  ${String(c.fails).padStart(4)}  ${String(c.of).padStart(4)}  ${`${((100 * c.fails) / c.of).toFixed(0)}%`.padStart(4)}  ${String(c.flaked).padStart(24)}  ${String(c.onMain).padStart(7)}  ${String(c.branches).padStart(8)}  ${c.name.slice(0, 120)}`);
  }
  if (silent.size) {
    console.log('\n  red with no FAIL line printed (a type error, a crash, a timeout, a lost runner):');
    for (const [name, s] of [...silent].sort((a, b) => b[1].n - a[1].n)) console.log(`  ${String(s.n).padStart(4)}  ${name}`);
  }
}
