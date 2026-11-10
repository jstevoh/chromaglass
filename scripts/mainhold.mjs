// Main held red: while the same check is red on two main deploys running, only
// the fix merges (`npm run mainhold`; PLAN.md 19am).
//
// What was reported. The owner's rule since 2026-11-01 says that when the same
// check is red on two deploys in a row, nothing merges but the fix until a
// deploy is green. It was a rule for whoever read it. On 2026-11-08 the fifth
// Mac shard was red on deploys 699 and 701 (700 between them was cancelled),
// the open shard on 685 and 699, and 16 of that day's 34 merges landed while
// main's last deploy was red. Each merge on a red main starts another deploy
// that runs the same red check, which is the Mac time the fix's own run then
// queues behind, and each one is a commit the fix has to be bisected against.
// The owner adopted making it mechanical (2026-11-09 13:12Z).
//
// The rule, per check. "A check" is a job of the deploy: a Mac shard
// (`Checks / WebGPU (macOS) · fifth`), a Measure part, the build. Not the two
// summary jobs (`Checks / WebGPU (macOS)`, `Checks / Measure`), which are red
// whenever any shard is and would make two different shards look like one
// check, and not the runner's plumbing (the owner's-Mac probe, the watchdog),
// which checks nothing about main. For each check, walk main's deploys newest
// first and take the deploys that ran it: green or red on that check. Main is
// held when some check's newest two results are both red, and lifted the
// first time that check runs green.
//
// Why per check and not per deploy. The first draft read a deploy's own
// conclusion, and its review found the hole: three kinds of deploy finish
// green without running the red check at all. A docs-only merge publishes
// nothing and runs no check; a "disjoint" one runs Measure and no Mac shard;
// and a deploy whose own failing job stopped the shards from starting is red
// on something else. Counting those as "a deploy between the two reds" would
// let one docs merge lift a hold the fix never touched. So a deploy that did
// not run a check is not a result for that check, the same as a cancelled
// deploy (cancelled by the next push, as 31 of the last 40 were, or by the
// watchdog's hand-back to GitHub's Macs), which is left out entirely.
//
// One kind of deploy runs no check and still counts green for all of them:
// one whose `Already checked on its PR` job found that its PR's `Checks` run
// passed on exactly this tree (`scripts/deploygate.sh`), so it skipped Checks
// and built. That tree passed every check, on the PR. Without this a fix
// merged with main in its head (as the ship skill asks) would never lift the
// hold, since its deploy re-runs nothing.
//
// A deploy being re-run (by its failed jobs, or all of them) is in progress
// again and its jobs are queued; for those, the attempt before it holds the
// result, so a re-run of a red deploy keeps the hold until it finishes. A
// first attempt still running is not counted yet: it may be cancelled.
//
// Why a commit status posted from `hold.yml`, not a step in `checks.yml`: a
// PR's `Checks` run measures its tree once, but main turns red after that,
// while the PR sits green. The hold has to reach PRs that already passed, so
// every run posts on every open PR whose status differs from the verdict (read
// in one GraphQL query, so a push to one PR costs one post and not forty). It
// refuses a merge by itself only once the ruleset on main requires it
// (19am-2); until then the ship skill and docs/handoff.md's merge step read it.
//
// Usage:
//   node scripts/mainhold.mjs               the hold now (needs GITHUB_TOKEN)
//   node scripts/mainhold.mjs --history 40  the hold after each of the last 40 deploys
//   node scripts/mainhold.mjs --runs f.json the same, from a saved list of runs
//   node scripts/mainhold.mjs --post        post the status on every open PR (hold.yml)
//   node scripts/mainhold.mjs --self-test   the rule against fixed histories,
//                                           11-08's among them (Measure, logic)

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CONTEXT = 'Main not held red';
export const LABEL = 'fixes-main';
const GATE = 'Already checked on its PR';
const BUILD = 'Build and deploy';

// Jobs whose red is not a check of main's code of its own (see above).
const NOT_A_CHECK = new Set(['Checks / WebGPU (macOS)', 'Checks / Measure', "Is the owner's Mac free", 'Watchdog', GATE]);
const PASS = new Set(['success']);
const FAIL = new Set(['failure', 'timed_out']);

// A run: { number, conclusion, jobs: { name: conclusion } }, newest first.
// `verified`: the deploy gate skipped Checks because the PR passed this tree.
export const verified = (run) => run.jobs[GATE] === 'success' && run.jobs[BUILD] === 'success'
  && !Object.entries(run.jobs).some(([n, c]) => n.startsWith('Checks / ') && (PASS.has(c) || FAIL.has(c)));

export function holdFrom(runs) {
  const counted = runs.filter((r) => r.conclusion !== 'cancelled' && r.conclusion !== null && r.conclusion !== undefined);
  const names = new Set();
  for (const r of counted) for (const n of Object.keys(r.jobs)) if (!NOT_A_CHECK.has(n)) names.add(n);
  const same = [];
  let last, before;
  for (const name of names) {
    const results = [];
    for (const r of counted) {
      const c = verified(r) ? 'success' : r.jobs[name];
      if (PASS.has(c) || FAIL.has(c)) results.push({ r, red: FAIL.has(c) });
      if (results.length === 2) break;
    }
    if (results.length === 2 && results[0].red && results[1].red) {
      same.push(name);
      if (!last || results[0].r.number > last.number) [last, before] = [results[0].r, results[1].r];
    }
  }
  return { held: same.length > 0, same: same.sort(), last, before, newest: counted[0] };
}

// The status a PR gets. GitHub cuts a description at 140 characters. The
// green one does not name a deploy, so that a green deploy after a green one
// changes no PR's status and posts nothing.
const short = (n) => n.replace(/^Checks \/ /, '');
export function statusFor(hold, labels) {
  if (!hold.held) return { state: 'success', description: 'No check red on two main deploys running' };
  const what = `${hold.same.map(short).join(', ')} red on deploys ${hold.before.number} and ${hold.last.number}`;
  if (labels.includes(LABEL)) return { state: 'success', description: `Held (${what}); this PR is labelled ${LABEL}`.slice(0, 140) };
  const tail = `: only a PR labelled ${LABEL} merges until it is green`;
  return { state: 'failure', description: (what.slice(0, 140 - tail.length) + tail).slice(0, 140) };
}

// --- GitHub ---------------------------------------------------------------

const REPO = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
async function call(url, init = {}) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('needs GITHUB_TOKEN (or --runs <file> to read a saved list)');
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'chromaglass-mainhold',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${url}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const api = (path, init) => call(`https://api.github.com/repos/${REPO}/${path}`, init);

const jobMap = (jobs) => Object.fromEntries(jobs.map((j) => [j.name, j.conclusion]));

// Main's deploys, newest first, with their jobs. `enough(runs)` says when to
// stop reading: for the hold now, when every check red at its newest result
// has a second result or ten finished deploys have been read.
async function deploys(enough, most = 400) {
  const out = [];
  for (let page = 1; out.length < most; page++) {
    const { workflow_runs: runs } = await api(`actions/workflows/deploy.yml/runs?branch=main&per_page=100&page=${page}`);
    for (const r of runs) {
      const run = { number: r.run_number, conclusion: r.status === 'completed' ? r.conclusion : null, url: r.html_url, jobs: {} };
      if (run.conclusion !== 'cancelled' && (run.conclusion !== null || r.run_attempt > 1)) {
        run.jobs = jobMap((await api(`actions/runs/${r.id}/jobs?filter=latest&per_page=100`)).jobs);
        if (run.conclusion === null) {
          // A re-run in progress: its queued jobs keep the attempt before's result.
          const prior = await api(`actions/runs/${r.id}/attempts/${r.run_attempt - 1}`);
          const was = jobMap((await api(`actions/runs/${r.id}/attempts/${r.run_attempt - 1}/jobs?per_page=100`)).jobs);
          for (const [n, c] of Object.entries(was)) if (!PASS.has(run.jobs[n]) && !FAIL.has(run.jobs[n])) run.jobs[n] = c;
          run.conclusion = prior.conclusion === 'cancelled' ? 'cancelled' : 'rerunning';
        }
      }
      out.push(run);
      if (enough(out)) return out;
    }
    if (runs.length < 100) return out;
  }
  return out;
}
// A deploy that gave every check a result: it ran the Mac shards (and so
// Measure before them), or its PR passed this exact tree.
const ranAll = (r) => verified(r) || Object.entries(r.jobs).some(([n, c]) => n.startsWith('Checks / WebGPU (macOS) · ') && (PASS.has(c) || FAIL.has(c)));
// Reading stops when the verdict cannot change with older deploys: main is
// held (the newest two results of a check are already read), or a deploy
// that ran every check has been read and each check red at its newest result
// has its second result. Twenty-five finished deploys at most.
export const enoughNow = (runs) => {
  const done = runs.filter((r) => r.conclusion && r.conclusion !== 'cancelled');
  if (done.length >= 25 || holdFrom(runs).held) return true;
  if (!done.some(ranAll)) return false;
  for (const r of done) {
    if (verified(r)) continue;
    for (const [n, c] of Object.entries(r.jobs)) {
      if (NOT_A_CHECK.has(n) || !FAIL.has(c)) continue;
      const newest = done.find((x) => verified(x) || PASS.has(x.jobs[n]) || FAIL.has(x.jobs[n]));
      if (newest === r) return false;
    }
  }
  return true;
};

// One GraphQL query: every open PR on main, its head, labels, and the status
// this posts as it stands, so only the PRs whose status differs get a post.
async function openPRs() {
  const [owner, name] = REPO.split('/');
  const out = [];
  let after = null;
  for (;;) {
    const q = `query($owner:String!,$name:String!,$after:String){repository(owner:$owner,name:$name){pullRequests(states:OPEN,baseRefName:"main",first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{number headRefOid labels(first:50){nodes{name}}commits(last:1){nodes{commit{oid status{context(name:${JSON.stringify(CONTEXT)}){state description}}}}}}}}}`;
    const res = await call('https://api.github.com/graphql', { method: 'POST', body: JSON.stringify({ query: q, variables: { owner, name, after } }) });
    if (res.errors) throw new Error(`graphql: ${JSON.stringify(res.errors).slice(0, 200)}`);
    const prs = res.data.repository.pullRequests;
    for (const p of prs.nodes) {
      const now = p.commits.nodes[0]?.commit;
      const s = now?.oid === p.headRefOid ? now.status?.context : null;
      out.push({ number: p.number, sha: p.headRefOid, labels: p.labels.nodes.map((l) => l.name), state: s?.state?.toLowerCase() ?? null, description: s?.description ?? null });
    }
    if (!prs.pageInfo.hasNextPage) return out;
    after = prs.pageInfo.endCursor;
  }
}

async function post() {
  const hold = holdFrom(await deploys(enoughNow));
  console.log(describe(hold));
  const target = hold.held ? hold.last.url : `https://github.com/${REPO}/blob/main/scripts/mainhold.mjs`;
  let posted = 0;
  const prs = await openPRs();
  for (const p of prs) {
    const s = statusFor(hold, p.labels);
    if (p.state === s.state && p.description === s.description) continue;
    await api(`statuses/${p.sha}`, { method: 'POST', body: JSON.stringify({ ...s, context: CONTEXT, target_url: target }) });
    posted++;
    console.log(`#${p.number} ${p.sha.slice(0, 7)} ${s.state}: ${s.description}`);
  }
  console.log(`${posted} of ${prs.length} open PRs posted; the rest already said so`);
}

// A saved list: { number, conclusion, jobs }, or a lookup's own shape with
// only the failed jobs (`failed_jobs`), whose other jobs are then unknown.
const fromFile = (f) => JSON.parse(fs.readFileSync(f, 'utf8')).map((r) => ({
  number: r.number ?? r.run_number, conclusion: r.conclusion, url: r.url ?? r.html_url,
  jobs: r.jobs ?? Object.fromEntries((r.failed_jobs ?? []).map((n) => [n, 'failure'])),
}));

function describe(hold) {
  if (!hold.held) return `not held${hold.newest ? ` (newest counted deploy ${hold.newest.number}: ${hold.newest.conclusion})` : ''}`;
  return `HELD: ${hold.same.map(short).join(', ')} red on deploys ${hold.before.number} and ${hold.last.number}; only a PR labelled ${LABEL} merges`;
}

function history(runs) {
  // The hold as it stood when each run finished: the rule over that run and
  // everything older. Cancelled runs change nothing and print as such.
  let held = 0;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const h = holdFrom(runs.slice(i));
    if (h.held && r.conclusion !== 'cancelled') held++;
    const red = Object.entries(r.jobs).filter(([n, c]) => FAIL.has(c) && !NOT_A_CHECK.has(n)).map(([n]) => short(n)).join(', ');
    const kind = verified(r) ? 'checked on its PR' : red;
    console.log(`${String(r.number).padStart(5)}  ${(r.conclusion ?? '?').padEnd(9)}  ${kind.padEnd(40)}  ${r.conclusion === 'cancelled' ? '(left out)' : describe(h)}`);
  }
  console.log(`\nheld after ${held} of the ${runs.filter((r) => r.conclusion !== 'cancelled').length} deploys that finished`);
}

// --- self-test ------------------------------------------------------------

function selfTest() {
  let failed = 0;
  const check = (ok, what, detail = '') => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail ? `: ${detail}` : ''}`);
    if (!ok) failed++;
  };
  const SHARDS = ['open', 'show', 'plate', 'tools', 'fifth'];
  const W = (s) => `Checks / WebGPU (macOS) · ${s}`;
  // A deploy that ran every shard and built when they were all green.
  const full = (number, ...redShards) => {
    const jobs = { [GATE]: 'success', 'Checks / Compiles, before the Mac': 'success', 'Checks / Measure · logic': 'success', 'Checks / Measure': 'success', Watchdog: 'skipped' };
    for (const s of SHARDS) jobs[W(s)] = redShards.includes(s) ? 'failure' : 'success';
    jobs['Checks / WebGPU (macOS)'] = redShards.length ? 'failure' : 'success';
    jobs[BUILD] = redShards.length ? 'skipped' : 'success';
    return { number, conclusion: redShards.length ? 'failure' : 'success', jobs };
  };
  const red = full;
  const green = (n) => full(n);
  const off = (number) => ({ number, conclusion: 'cancelled', jobs: {} });
  // The gate found the PR's run on this tree: Checks skipped, built.
  const onItsPR = (number) => ({ number, conclusion: 'success', jobs: { [GATE]: 'success', 'Checks / WebGPU (macOS) · ${{ matrix.shard }}': 'skipped', [BUILD]: 'success' } });
  // A docs-only merge: the gate said `nothing`, no check and no build ran.
  const docs = (number) => ({ number, conclusion: 'success', jobs: { [GATE]: 'success', 'Checks / WebGPU (macOS) · ${{ matrix.shard }}': 'skipped', [BUILD]: 'skipped' } });
  // Measure ran, the Mac shards did not (`disjoint`).
  const disjoint = (number) => ({ number, conclusion: 'success', jobs: { [GATE]: 'success', 'Checks / Measure · logic': 'success', 'Checks / WebGPU (macOS) · ${{ matrix.shard }}': 'skipped', [BUILD]: 'success' } });
  // Red on the typecheck, so the Mac shards never started.
  const noMac = (number) => ({ number, conclusion: 'failure', jobs: { [GATE]: 'success', 'Checks / Compiles, before the Mac': 'failure', [W('fifth')]: 'skipped', [BUILD]: 'skipped' } });

  // 2026-11-08 to 11-09, main's deploys 699 to 738 with their jobs as the API
  // listed them (scripts/mainhold-deploys.json; newest first). 699 had logic,
  // fifth and open red; 701 fifth alone; 700, 702 and 703 were cancelled.
  const real = fromFile(new URL('./mainhold-deploys.json', import.meta.url));
  const after = (n) => holdFrom(real.slice(real.findIndex((r) => r.number === n)));
  check(real.length === 40 && real[0].number === 738 && real.at(-1).number === 699, 'the saved deploys are 738 down to 699', `${real.length} runs`);
  check(!after(699).held, 'one red deploy alone holds nothing', describe(after(699)));
  const h701 = after(701);
  check(h701.held && h701.same.join() === W('fifth'), '11-08: fifth red on 699 and 701, 700 cancelled between, holds main on fifth alone', describe(h701));
  check(after(703).held, 'cancelled deploys after it (702, 703) keep the hold', describe(after(703)));
  const lifted = real.filter((r, i) => r.conclusion !== 'cancelled' && holdFrom(real.slice(i)).held).map((r) => r.number);
  check(lifted.join() === '701', 'of the 40, held after 701 alone, lifted by the next deploy that finished', lifted.join() || 'none');
  check(!holdFrom(real).held, 'main today is not held');

  check(!holdFrom([red(2, 'open'), red(1, 'fifth')]).held, 'two different shards red are not the same check, though both turn the WebGPU summary red');
  check(!holdFrom([{ number: 2, conclusion: 'failure', jobs: { Watchdog: 'failure' } }, { number: 1, conclusion: 'failure', jobs: { Watchdog: 'failure' } }]).held, "the runner's plumbing red twice is not a check");
  check(!holdFrom([red(3, 'open'), green(2), red(1, 'open')]).held, 'a deploy that ran the check green between two reds breaks the run');
  check(holdFrom([red(3, 'open'), off(2), red(1, 'open', 'show')]).held, 'a cancelled deploy between two reds does not');
  check(holdFrom([red(3, 'fifth'), docs(2), red(1, 'fifth')]).held, 'nor does a docs-only deploy that ran no check');
  check(holdFrom([red(3, 'fifth'), disjoint(2), red(1, 'fifth')]).held, 'nor one that ran Measure and no Mac shard');
  check(holdFrom([red(3, 'fifth'), noMac(2), red(1, 'fifth')]).held, 'nor a red deploy whose shards never started');
  check(holdFrom([docs(4), red(3, 'fifth'), red(2, 'fifth')]).held, 'a docs-only deploy after two reds does not lift the hold');
  check(!holdFrom([onItsPR(4), red(3, 'fifth'), red(2, 'fifth')]).held, 'a deploy whose PR passed this exact tree lifts it');
  check(holdFrom([red(4, 'plate'), onItsPR(3), red(2, 'plate')]).held === false, 'and breaks a run like any green');
  check(holdFrom([{ ...red(2, 'plate'), conclusion: 'timed_out', jobs: { ...red(2).jobs, [W('plate')]: 'timed_out' } }, red(1, 'plate')]).held, 'a job that timed out counts as red');
  check(holdFrom([{ number: 3, conclusion: 'startup_failure', jobs: {} }, red(2, 'open'), red(1, 'open')]).held, 'a run that never started neither breaks nor makes a run');
  check(holdFrom([{ number: 3, conclusion: null, jobs: {} }, red(2, 'open'), red(1, 'open')]).held, 'a first attempt still running changes nothing yet');
  const rerun = { number: 3, conclusion: 'rerunning', jobs: { ...red(3, 'open').jobs } };
  check(holdFrom([rerun, red(2, 'open')]).held, "a re-run in progress keeps its attempt's red until it finishes");
  check(!holdFrom([]).held && !holdFrom([red(1, 'open')]).held, 'no history, or one deploy, holds nothing');
  const build = (n) => ({ number: n, conclusion: 'failure', jobs: { ...green(n).jobs, [BUILD]: 'failure' } });
  check(holdFrom([build(2), build(1)]).held, 'the build failing twice holds main like any check');

  // Reading the API stops early (enoughNow); the verdict on the prefix it
  // stops at must be the verdict on everything.
  const stopAt = (runs) => { for (let k = 1; k <= runs.length; k++) if (enoughNow(runs.slice(0, k))) return k; return runs.length; };
  const wrong = real.map((r, i) => real.slice(i)).filter((runs) => holdFrom(runs.slice(0, stopAt(runs))).held !== holdFrom(runs).held).map((runs) => runs[0].number);
  check(wrong.length === 0, 'reading stops early without changing the verdict, from each of the 40', wrong.join() || `stopped after ${stopAt(real)} runs from 738`);
  const late = [docs(6), docs(5), docs(4), red(3, 'fifth'), red(2, 'fifth'), green(1)];
  check(holdFrom(late.slice(0, stopAt(late))).held, 'and does not stop on docs-only deploys before the reds behind them', `stopped after ${stopAt(late)}`);
  check(!enoughNow([docs(2), docs(1)]), 'two docs-only deploys are not enough to say main is clear');

  const s1 = statusFor(h701, []);
  check(s1.state === 'failure' && s1.description.includes('fifth') && s1.description.includes(LABEL), 'a PR without the label is refused while held', s1.description);
  const s2 = statusFor(h701, ['review-owed', LABEL]);
  check(s2.state === 'success' && s2.description.includes(LABEL), `a PR labelled ${LABEL} passes while held`, s2.description);
  check(statusFor(holdFrom(real), []).state === 'success', 'every PR passes when main is not held');
  check(statusFor(holdFrom([green(5)]), []).description === statusFor(holdFrom([green(9)]), []).description, 'the green status names no deploy, so a green deploy posts nothing new');
  const long = 'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => c.repeat(9));
  const many = { held: true, same: long, last: { number: 9 }, before: { number: 8 } };
  const s3 = statusFor(many, []);
  check(s3.description.length <= 140 && s3.description.endsWith('until it is green'), 'a long list of checks still fits 140 characters and keeps what to do', `${s3.description.length} chars`);

  console.log(failed ? `\n${failed} failed` : '\nall ok');
  process.exit(failed ? 1 : 0);
}

// --- main -----------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (args.includes('--self-test')) selfTest();
    else if (args.includes('--post')) await post();
    else if (val('--runs')) history(fromFile(val('--runs')));
    else if (args.includes('--history')) { const n = Number(val('--history')) || 20; history(await deploys((r) => r.length >= n, n)); }
    else console.log(describe(holdFrom(await deploys(enoughNow))));
  } catch (e) {
    console.error(`mainhold: ${e.message}`);
    process.exit(1);
  }
}
