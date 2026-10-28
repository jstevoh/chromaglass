// The watchdog for a deploy whose Mac shards went to the owner's Mac (PLAN.md 19ah-3).
//
// `deploy.yml`'s probe (`macrunner.mjs`) sends the Mac shards to the owner's
// Mac only when the runner is online and idle, but the Mac can still go to
// sleep, lose its network or be switched off in the minute between the
// answer and the jobs. A job asking for a self-hosted label then waits in the
// queue until a runner with it comes back, for up to a day, and
// `timeout-minutes` does not count the queue. The live channel's concurrency
// group keeps one deploy at a time (`cancel-in-progress: false`), so every
// deploy behind it would wait too. The owner's Mac sleeps often.
//
// So this job, which `deploy.yml` starts beside the checks whenever the probe
// named shards, reads the run's jobs every 30 seconds. The run is stalled
// while one of the owner's Mac's jobs is queued and none is running: the one
// runner takes the shards one after another, so between two of them there
// are seconds with none running, never minutes. Stalled for STALL_MIN minutes
// on end, it starts the deploy again by hand with `hosted` set, which skips
// the probe so every shard runs on GitHub's Macs, and then cancels this run.
// In that order: the new run waits in the concurrency group behind this one,
// and takes over the moment it is cancelled. A dispatch that fails is tried
// again and nothing is cancelled, so a stall never becomes a deploy that
// never happens; the Mac waking up ends it as well.
//
// Its job is done, and it stops, once every one of the owner's Mac's jobs has
// started (a job that has started cannot stall in the queue; one whose Mac
// sleeps under it fails within `timeout-minutes`), or once every one of the
// checks has finished.
//
// The cancelled run is attempt 1 and cancelled, which `deploygate.sh` reads
// as replaced, not as red; the dispatched run checks and deploys the same
// main in full. Recovering by hand is the same move: "Re-run all jobs" (or
// Run workflow with `hosted`), never "Re-run failed jobs", which keeps the
// probe's old answer and sends the shards to the sleeping Mac again.
//
//   node scripts/macwatch.mjs             (in CI: GH_TOKEN, GITHUB_RUN_ID, SHARDS)
//   node scripts/macwatch.mjs --selftest  (the stall rule against made-up runs)

import { spawnSync } from 'node:child_process';
import { ghCurl, redact } from './ghapi.mjs';

const LABEL = 'owner-mac';
const STALL_MIN = Number(process.env.STALL_MIN || 15);
const POLL_S = 30;

/**
 * What the run's jobs say: `stalled` (one of ours queued, none running),
 * `done` (every one of ours started, or nothing else left to finish), or
 * `wait`. "Nothing else" is the checks' own jobs (`Checks / …`, the called
 * workflow's): the probe and `verified` have finished before this job starts,
 * and the checks' jobs appear only after, so counting those two would call a
 * run that has not begun finished.
 */
export function verdict(jobs, shards) {
  const ours = jobs.filter((j) => (j.labels || []).includes(LABEL));
  const checks = jobs.filter((j) => j.name.startsWith('Checks / '));
  if (checks.length && checks.every((j) => j.status === 'completed')) return 'done';
  const waiting = ours.filter((j) => j.status === 'queued' || j.status === 'waiting' || j.status === 'pending');
  if (ours.length >= shards.length && !waiting.length) return 'done';
  if (waiting.length && !ours.some((j) => j.status === 'in_progress')) return 'stalled';
  return 'wait';
}

/** POST through curl, the token only on stdin (as ghapi.mjs's GETs). The HTTP code. */
function post(url, body) {
  const token = process.env.GH_TOKEN || '';
  const r = spawnSync('curl', ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST',
    '-H', 'Accept: application/vnd.github+json', '-K', '-', '--data', JSON.stringify(body), url],
  { input: `header = "Authorization: Bearer ${token.replace(/["\\]/g, '')}"\n` });
  if (r.status !== 0) console.log(`::warning::POST ${url}: ${redact(String(r.stderr).trim())}`);
  return Number(String(r.stdout).trim()) || 0;
}

async function jobs(api, run) {
  const out = [];
  for (let page = 1; page < 10; page++) {
    const b = JSON.parse(await ghCurl(`${api}/actions/runs/${run}/jobs?per_page=100&page=${page}`));
    out.push(...b.jobs);
    if (out.length >= b.total_count || !b.jobs.length) break;
  }
  return out;
}

async function watch() {
  const repo = process.env.GITHUB_REPOSITORY;
  const run = process.env.GITHUB_RUN_ID;
  const shards = JSON.parse(process.env.SHARDS || '[]');
  if (!repo || !run || !shards.length) { console.log('no run or no shards on the owner\'s Mac: nothing to watch'); return; }
  const api = `https://api.github.com/repos/${repo}`;
  console.log(`watching run ${run}: ${shards.join(', ')} on the owner's Mac; a stall of ${STALL_MIN} minutes moves the deploy to GitHub's Macs`);
  let since = null, last = '';
  for (;;) {
    let v = 'wait';
    try { v = verdict(await jobs(api, run), shards); } catch (e) { console.log(`::warning::the jobs API did not answer (${String(e.message).split('\n')[0]}); trying again`); }
    if (v !== last) { console.log(`${new Date().toISOString()} ${v}`); last = v; }
    if (v === 'done') return;
    since = v === 'stalled' ? (since ?? Date.now()) : null;
    if (since && Date.now() - since >= STALL_MIN * 60e3) {
      const code = post(`${api}/actions/workflows/deploy.yml/dispatches`, { ref: 'main', inputs: { hosted: 'true' } });
      if (code === 204 || code === 200) {
        console.log(`::warning title=The owner's Mac::a shard waited ${STALL_MIN} minutes for the owner's Mac with none running (asleep or offline?); deploy.yml started again on GitHub's Macs, and this run is cancelled`);
        for (let i = 0; i < 5; i++) {
          const c = post(`${api}/actions/runs/${run}/cancel`, {});
          if (c === 202) return;
          await new Promise((r) => setTimeout(r, 10e3));
        }
        console.log('::error::the replacement deploy is waiting, but this run would not cancel: cancel it by hand (Actions → this run → Cancel workflow)');
        process.exitCode = 1;
        return;
      }
      console.log(`::error::starting deploy.yml again on GitHub's Macs was refused (HTTP ${code}); still waiting, and trying again`);
      since = Date.now() - (STALL_MIN - 2) * 60e3;
    }
    await new Promise((r) => setTimeout(r, POLL_S * 1e3));
  }
}

function selftest() {
  const S = ['lab', 'app1', 'app2'];
  const mac = (name, status) => ({ name: `Checks / WebGPU (macOS) · ${name}`, status, labels: ['self-hosted', LABEL] });
  const job = (name, status) => ({ name, status, labels: ['ubuntu-latest'] });
  const cases = [
    ['the checks not begun', [job('Is the owner\'s Mac free', 'completed'), job('Verified', 'completed'), job('Watchdog', 'in_progress')], 'wait'],
    ['nothing made yet', [job('Watchdog', 'in_progress'), job('Checks / reach', 'in_progress')], 'wait'],
    ['the Mac on its first shard', [job('Checks / reach', 'completed'), mac('lab', 'in_progress'), mac('app1', 'queued'), mac('app2', 'queued')], 'wait'],
    ['between two shards', [mac('lab', 'completed'), mac('app1', 'queued'), mac('app2', 'queued'), job('Checks / Measure', 'in_progress')], 'stalled'],
    ['asleep from the first', [mac('lab', 'queued'), mac('app1', 'queued'), mac('app2', 'queued')], 'stalled'],
    ['every shard started', [mac('lab', 'completed'), mac('app1', 'completed'), mac('app2', 'in_progress'), job('Checks / Measure', 'in_progress')], 'done'],
    ['only some made yet, all started', [mac('lab', 'in_progress'), job('Checks / Measure', 'in_progress')], 'wait'],
    ['everything else finished', [job('Watchdog', 'in_progress'), job('Checks / reach', 'completed'), job('Build and deploy', 'queued')], 'done'],
    ['a GitHub Mac queued is not ours', [job('Checks / WebGPU (macOS) · lab', 'queued'), mac('app1', 'in_progress')], 'wait'],
  ];
  let fail = 0;
  for (const [what, js, want] of cases) {
    const got = verdict(js, S);
    if (got !== want) fail++;
    console.log(`${got === want ? ' ok  ' : ' FAIL'} ${what}: ${got}${got === want ? '' : ` (wanted ${want})`}`);
  }
  console.log(`${cases.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();
else await watch();
