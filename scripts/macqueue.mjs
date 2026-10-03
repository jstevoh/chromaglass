// Where the macOS runners' time goes (PLAN.md 19a). Run with
// `npm run macqueue` (the last 15 hours) or `npm run macqueue -- --hours 48`.
//
// Every check with a picture in it runs on a macOS runner, the account holds
// only a few of them at once, and a pull request's four `Checks` shards wait
// behind everything else that wants one: other PRs' shards, deploys that
// re-run the checks, the gallery, the iPhone build. When the owner asked on
// 2026-10-03 why ten open PRs were all "waiting on CI", this is what answered
// it: of 2,850 Mac runner-minutes in fifteen hours, 870 were the gallery
// photographing presets on pushes nobody had asked pictures of, and the
// shards waited 17 minutes on average before a runner took them.
//
// It reads the Actions API (public for this repository; `GH_TOKEN` is used
// when set) and prints, for every macOS job that held a runner in the window:
// the runner-minutes by workflow and outcome, the mean wait from a job being
// queued to a runner starting it, how long the account had 0, 1, 2 … Mac jobs
// running at once, and the minutes spent on PRs after they had merged or
// closed. A job counts only if a runner took it and it ran more than half a
// minute: a job cancelled while queued gets a start time from GitHub too, and
// counting those would read as zero-minute "runs" with no wait.
//
// Not a gate: the queue is shared weather, and a number that depends on how
// many other PRs were open says nothing about the commit under test. It is the
// before and after for a change to what the workflows run.

import { execFileSync } from 'node:child_process';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const hours = Number(arg('hours', 15));
const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
const API = `https://api.github.com/repos/${repo}`;

// curl rather than fetch: a cloud session's proxy is configured for curl, and
// Node's fetch does not read HTTPS_PROXY.
function get(path) {
  const auth = process.env.GH_TOKEN ? ['-H', `Authorization: Bearer ${process.env.GH_TOKEN}`] : [];
  const out = execFileSync('curl', ['-fsSL', '--retry', '3', ...auth, '-H', 'Accept: application/vnd.github+json', `${API}/${path}`], {
    maxBuffer: 1 << 28,
  });
  return JSON.parse(out.toString());
}

const t = (s) => (s ? Date.parse(s) : null);
const min = (ms) => (ms / 60000).toFixed(0).padStart(5);
const since = new Date(Date.now() - hours * 3.6e6).toISOString().replace(/\.\d+Z$/, 'Z');

const runs = [];
for (let page = 1; page <= 10; page++) {
  const j = get(`actions/runs?per_page=100&page=${page}&created=%3E%3D${since}`);
  runs.push(...j.workflow_runs);
  if (j.workflow_runs.length < 100) break;
  if (page === 10) console.log('note: stopped at 1,000 runs; the window holds more, so every figure below is short');
}
// Pull requests, to find each PR run's PR by branch and time: branches are
// reused (a thread restarts its branch from main after a merge), so the PR is
// the newest one on that branch opened before the run.
const prs = [...get('pulls?state=all&per_page=100&page=1&sort=updated&direction=desc'), ...get('pulls?state=all&per_page=100&page=2&sort=updated&direction=desc')];
const prOf = (run) =>
  prs
    .filter((p) => p.head.ref === run.head_branch && t(p.created_at) <= t(run.created_at))
    .sort((a, b) => t(b.created_at) - t(a.created_at))[0];

const jobs = [];
const waiting = [];
for (const run of runs) {
  const list = get(`actions/runs/${run.id}/jobs?per_page=100&filter=all`).jobs;
  for (const job of list) {
    if (!(job.labels || []).some((l) => /macos/i.test(l))) continue;
    if (job.status !== 'completed') {
      waiting.push({ job, run });
      continue;
    }
    if (!job.runner_name || !job.started_at || t(job.completed_at) - t(job.started_at) < 30000) continue;
    jobs.push({ job, run });
  }
}

const workflowOf = (run) => (run.event === 'pull_request' && /\(tests [0-9a-f]{40}\)$/.test(run.display_title) ? 'Checks (PR)' : run.name.replace(/ \(tests .*/, ''));
const ranMs = ({ job }) => t(job.completed_at) - t(job.started_at);
const waitMs = ({ job }) => t(job.started_at) - t(job.created_at);

console.log(`macOS jobs in the last ${hours} h (since ${since}): ${runs.length} runs, ${jobs.length} Mac jobs that a runner took\n`);
const total = jobs.reduce((a, j) => a + ranMs(j), 0);
if (!total) {
  console.log('no Mac job ran in the window');
  process.exit(0);
}
console.log(`runner-minutes  share  mean wait  jobs  workflow, outcome`);
const by = new Map();
for (const j of jobs) {
  const k = `${workflowOf(j.run)}, ${j.job.conclusion}`;
  const e = by.get(k) ?? { ms: 0, wait: 0, n: 0 };
  e.ms += ranMs(j);
  e.wait += waitMs(j);
  e.n++;
  by.set(k, e);
}
for (const [k, e] of [...by].sort((a, b) => b[1].ms - a[1].ms)) {
  console.log(`${min(e.ms)}          ${((100 * e.ms) / total).toFixed(0).padStart(3)}%     ${min(e.wait / e.n)}   ${String(e.n).padStart(4)}  ${k}`);
}
console.log(`${min(total)}  in all`);

const shards = jobs.filter((j) => workflowOf(j.run) === 'Checks (PR)');
if (shards.length) console.log(`\nChecks' PR shards waited ${min(shards.reduce((a, j) => a + waitMs(j), 0) / shards.length).trim()} min on average for a runner (${shards.length} shards)`);

// How many Mac jobs were running at once, as time spent at each count.
const edges = jobs.flatMap(({ job }) => [[t(job.started_at), 1], [t(job.completed_at), -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const at = {};
let n = 0;
let last = edges[0]?.[0];
for (const [when, d] of edges) {
  at[n] = (at[n] || 0) + (when - last);
  last = when;
  n += d;
}
console.log(`\nminutes with N Mac jobs running: ${Object.entries(at).map(([k, v]) => `${k}: ${min(v).trim()}`).join(', ')}`);

// Mac time a PR's runs held after the PR had merged or closed: what closed.yml
// cancels. Jobs still queued for a closed PR are listed as well.
let after = 0;
let unknown = 0;
for (const j of jobs) {
  if (j.run.event !== 'pull_request') continue;
  const pr = prOf(j.run);
  if (!pr) unknown++;
  if (!pr?.closed_at || t(pr.closed_at) < t(j.run.created_at)) continue;
  const from = Math.max(t(pr.closed_at), t(j.job.started_at));
  if (t(j.job.completed_at) > from) after += t(j.job.completed_at) - from;
}
const stale = waiting.filter(({ run }) => {
  const pr = run.event === 'pull_request' && prOf(run);
  return pr?.closed_at && t(pr.closed_at) >= t(run.created_at);
});
console.log(`runner-minutes on PRs after they merged or closed: ${min(after).trim()}${unknown ? ` (${unknown} PR jobs whose PR was not among the 200 latest, not counted)` : ''}`);
console.log(`Mac jobs queued or running now: ${waiting.length}, of them for a PR already merged or closed: ${stale.length}`);
for (const { job, run } of stale) console.log(`  #${prOf(run).number} ${job.name} (${job.status})`);
