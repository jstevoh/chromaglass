// Is the owner's Mac free to take a deploy's Mac shards (PLAN.md 19ah)?
//
// `deploy.yml`'s `mac` job runs this on a push to main (and a run by hand),
// and only when the deploy is about to run the Mac shards. It writes
// `shards=<JSON list>` to $GITHUB_OUTPUT: the shards to run on the owner's
// Mac, a self-hosted runner labelled `owner-mac`, which `checks.yml` sends
// there instead of to GitHub's `macos-15`. Every other answer is `[]`, and the
// shards wait for GitHub's Macs as they always have.
//
// Why a probe at all, and not just `runs-on: owner-mac`: a job asking for a
// self-hosted label waits in the queue until a runner with it comes online,
// for up to a day, and `timeout-minutes` does not count the queue. A Mac that
// is asleep, closed or switched off for a show would hold the deploy, and with
// `cancel-in-progress: false` on the live channel every deploy behind it.
// So the question is asked first, of the repository's runners API, and only a
// runner that is online and idle gets the shards.
//
// The API needs a token that GITHUB_TOKEN cannot be (listing runners is an
// Administration permission): MAC_RUNNER_PROBE, a fine-grained token for this
// repository with Administration: read, kept in the `mac-runner` environment
// that only main can use. No token, a refused one (expired), an API that does
// not answer: each is `[]` with a warning that says which, never a red deploy.
//
// All five shards by default, one after another on the one runner: by the
// fortnight to 2026-10-28 they are about 17 minutes of work each on GitHub's
// Macs and waited a mean 50 for one, so in series on an M4 they finish before
// the GitHub queue would have started them. The repository variable
// OWNER_MAC_SHARDS (a count) sends only the first so many in checks.json's
// order, the rest to GitHub, for when the Mac is wanted for something else.
//
//   GH_TOKEN=<token> node scripts/macrunner.mjs        (in CI: the probe)
//   GH_TOKEN=$(gh auth token) node scripts/macrunner.mjs --dry
//                                    (by hand: what a deploy now would do)

import { readFileSync, appendFileSync } from 'node:fs';
import { ghCurlSync } from './ghapi.mjs';

const LABEL = 'owner-mac';
const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
const dry = process.argv.includes('--dry');

const answer = (shards, why, level = 'notice') => {
  const json = JSON.stringify(shards);
  console.log(`${process.env.GITHUB_ACTIONS ? `::${level} title=The owner's Mac::` : ''}${why}`);
  console.log(`shards on the owner's Mac: ${json}`);
  if (process.env.GITHUB_OUTPUT && !dry) appendFileSync(process.env.GITHUB_OUTPUT, `shards=${json}\n`);
  process.exit(0);
};

const all = JSON.parse(readFileSync(new URL('./checks.json', import.meta.url), 'utf8')).shards?.mac;
if (!Array.isArray(all) || !all.length) answer([], 'checks.json lists no Mac shards', 'warning');

if (!process.env.GH_TOKEN) answer([], 'no MAC_RUNNER_PROBE token in the mac-runner environment, so the shards go to GitHub\'s Macs (docs/mac-runner.md says how to make one)', 'warning');

let runners;
try {
  runners = JSON.parse(ghCurlSync(`https://api.github.com/repos/${repo}/actions/runners?per_page=100`)).runners;
} catch (e) {
  // ghapi.mjs has already taken any token out of the message.
  answer([], `the runners API did not answer (${String(e.message).split('\n')[0]}); an expired or refused MAC_RUNNER_PROBE reads this way. Shards go to GitHub's Macs`, 'warning');
}
const ours = runners.filter((r) => r.labels.some((l) => l.name === LABEL));
for (const r of ours) console.log(`runner ${r.name}: ${r.status}${r.busy ? ', busy' : ''}`);
const free = ours.filter((r) => r.status === 'online' && !r.busy);
if (!ours.length) answer([], `no runner labelled ${LABEL} is registered; shards go to GitHub's Macs`);
if (!free.length) answer([], `the owner's Mac is ${ours.some((r) => r.status === 'online') ? 'busy' : 'offline or asleep'}; shards go to GitHub's Macs`);

const raw = process.env.MAC_SHARDS?.trim();
const count = raw ? Number(raw) : all.length;
if (!Number.isInteger(count) || count < 0) answer([], `OWNER_MAC_SHARDS is "${raw}", not a count; shards go to GitHub's Macs`, 'warning');
answer(all.slice(0, count), `the owner's Mac is online and idle (${free.map((r) => r.name).join(', ')}): ${Math.min(count, all.length)} of ${all.length} shards run there`);
