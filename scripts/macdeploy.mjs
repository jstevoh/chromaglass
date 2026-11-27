// A deploy's shard holds the owner's Mac: a harness waits for it (PLAN.md 19ah-9a).
//
// What was reported: main's deploy of 2026-11-08 began its Mac shards on the
// owner's Mac at 18:16Z, each past its first look (`scripts/macbusy.sh`), and
// then GPU work from sessions began mid-shard: a session filming the hero,
// `lampzero.mjs`, `renders.mjs` in Antigravity's clone, a driver of the app.
// Under that load `startup` went red on the Mac ("no pipeline was built on a
// frame"), the tools shard's own first look found the Mac busy and refused
// it, and the watchdog moved the deploy to GitHub's Macs, where it queued
// behind pull requests' runs. The first look sees only what is already
// running; nothing told work that started later that a deploy had the Mac.
//
// So the shard says so. `macbusy.sh` writes ~/.chromaglass-runner/
// deploy-<runner>.json when a shard's first step begins (before it waits for
// old work to drain, so nothing new starts meanwhile) and the time it ended
// at its last step. Here a harness reads it before it launches a browser
// (launchChromium in chromium.mjs, which nearly every harness
// launches through, the lab's included) or the desktop app (`npm run
// desktop`), and waits while any runner's shard holds the Mac.
//
// Why wait and not just warn: a session filming beside a deploy spoils both,
// the deploy's timing lines and the film's frame rate, and the deploy is the
// one the site is waiting on. The wait is bounded by the shards themselves
// (25 minutes each in checks.yml; LONGEST_S here, so a mark whose last step
// never ran cannot hold the Mac for good), and a mark whose runner worker has
// exited holds nothing at all: a cancelled job leaves no lock behind.
//
// Why a grace after a shard ends: the shards of one deploy run one after
// another on one runner, and between two of them the Mac is free for the
// seconds the next takes to set up and check out. A harness started in that
// gap is what the next shard's first look finds and waits two minutes for,
// then refuses the Mac over. GRACE_S covers the gap; a deploy that gave up on
// the Mac (its first look failed) is leaving, and gets none.
//
// Only on a Mac and never inside a job (`GITHUB_ACTIONS`): a shard's own
// harnesses, and the other runner's shard beside it (19ah-6), are the
// deploy's. A cloud session or Measure's Linux never reads a mark.
//
//   node scripts/macdeploy.mjs            (what holds the Mac now, if anything)
//   node scripts/macdeploy.mjs --selftest (the rule, and macbusy.sh's marks read back)

import { readdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const marksDir = () => process.env.MAC_DEPLOY_MARKS || join(homedir(), '.chromaglass-runner');
export const GRACE_S = 120;
export const LONGEST_S = 30 * 60;

const alive = (pid) => {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/**
 * Does this mark hold the Mac at `now` (seconds)? While its shard runs (its
 * worker alive, or none recorded, and younger than LONGEST_S), and for
 * GRACE_S after it ended, unless it gave up on the Mac.
 */
export function holds(m, now, isAlive = alive) {
  if (!m || typeof m.began !== 'number') return false;
  if (m.ended != null) return !m.gaveUp && now - m.ended < GRACE_S;
  if (now - m.began >= LONGEST_S) return false;
  return m.worker == null || isAlive(m.worker);
}

/** The first mark that holds the Mac now, or null. */
export function holder(now = Date.now() / 1000, dir = marksDir()) {
  let names = [];
  try { names = readdirSync(dir).filter((n) => /^deploy-.*\.json$/.test(n)); } catch { return null; }
  for (const n of names) {
    let m = null;
    try { m = JSON.parse(readFileSync(join(dir, n), 'utf8')); } catch { continue; }
    if (holds(m, now)) return m;
  }
  return null;
}

const says = (m, now) => m.ended != null
  ? `its ${m.shard || 'last'} shard ended ${Math.round(now - m.ended)}s ago, and the next may follow`
  : `its ${m.shard || ''} shard has run ${Math.round((now - m.began) / 60)} min`;

/**
 * Wait while a deploy's shard holds the owner's Mac. A no-op off a Mac and
 * inside a job. `what` names the waiter in its lines.
 */
export async function untilMacDeployDone(what = 'this harness') {
  if (process.platform !== 'darwin' || process.env.GITHUB_ACTIONS) return;
  const t0 = Date.now();
  let said = 0;
  for (;;) {
    const now = Date.now() / 1000;
    const m = holder(now);
    if (!m) {
      if (said) console.log(` --   the deploy left the owner's Mac; ${what} goes on after ${Math.round((Date.now() - t0) / 1000)}s`);
      return;
    }
    if (Date.now() - said >= 60e3) {
      console.log(` --   a deploy holds the owner's Mac (run ${m.run || '?'} on ${m.runner}: ${says(m, now)}); ${what} waits for it, so neither measures the other's GPU (PLAN.md 19ah-9a)`);
      said = Date.now();
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

/**
 * In a shard on the owner's Mac, before each check and after the last: is the
 * Mac still free of other work? `macbusy.sh --again` waits up to two minutes
 * for work begun mid-shard; still there, or there at all after a red check,
 * it writes why for the shard's last step and this answers false.
 */
export function stayedFree(afterRed = false) {
  if (process.env.RUNNER_ENVIRONMENT !== 'self-hosted') return true;
  const r = spawnSync('bash', [join(import.meta.dirname, 'macbusy.sh'), '--again', ...(afterRed ? ['--after-red'] : []), '120'], { stdio: 'inherit' });
  return r.status === 0;
}

function selftest() {
  let pass = 0, fail = 0;
  const ok = (cond, what) => { if (cond) pass++; else fail++; console.log(`${cond ? ' ok  ' : ' FAIL'} ${what}`); };
  const now = 1_000_000;
  const live = () => true, dead = () => false;
  ok(holds({ began: now - 60, ended: null, worker: 42 }, now, live), 'a shard running, its worker alive, holds');
  ok(!holds({ began: now - 60, ended: null, worker: 42 }, now, dead), 'a shard whose worker is gone (cancelled, killed) does not');
  ok(holds({ began: now - 60, ended: null, worker: null }, now, dead), 'a shard with no worker recorded holds by its age');
  ok(!holds({ began: now - LONGEST_S - 1, ended: null, worker: 42 }, now, live), `nor past ${LONGEST_S / 60} minutes, whose last step never ran`);
  ok(holds({ began: now - 600, ended: now - 30, worker: 42 }, now, dead), `a shard ended ${30}s ago holds for the next (grace ${GRACE_S}s)`);
  ok(!holds({ began: now - 600, ended: now - GRACE_S - 1, worker: 42 }, now, dead), 'and not past the grace');
  ok(!holds({ began: now - 200, ended: now - 5, gaveUp: true, worker: 42 }, now, live), 'a shard that gave up on the Mac gets no grace');
  ok(!holds(null, now) && !holds({}, now), 'no mark, or a torn one, holds nothing');

  // macbusy.sh's own marks, read back here: the two halves agree on the file.
  const dir = mkdtempSync(join(tmpdir(), 'macdeploy-'));
  const tmp = mkdtempSync(join(tmpdir(), 'macdeploy-t-'));
  const env = { ...process.env, MAC_DEPLOY_MARKS: dir, RUNNER_TEMP: tmp, GITHUB_ACTIONS: 'true', RUNNER_NAME: 'owner-mac-test', SHARD: 'open', GITHUB_RUN_ID: '7' };
  const sh = (args, e = env) => spawnSync('bash', [join(import.meta.dirname, 'macbusy.sh'), ...args], { env: e, encoding: 'utf8' });
  try {
    ok(holder(Date.now() / 1000, dir) === null, 'an empty folder holds nothing');
    const begin = sh(['5']);
    const m = holder(Date.now() / 1000, dir);
    ok(begin.status === 0 && m?.shard === 'open' && m?.run === '7' && m?.ended === null, `a shard's first step writes its mark (exit ${begin.status}; ${m ? JSON.stringify(m) : 'none'})`);
    const end = sh(['--end']);
    const e = JSON.parse(readFileSync(join(dir, 'deploy-owner-mac-test.json'), 'utf8'));
    ok(end.status === 0 && typeof e.ended === 'number' && e.began === m?.began && holds(e, Date.now() / 1000), `its last step writes the end and keeps the start; the grace holds (exit ${end.status})`);
    writeFileSync(join(tmp, 'macbusy-again.txt'), 'after 120s:\n123 a test browser at 50% of a core: x\n');
    const busy = sh(['--end']);
    ok(busy.status === 1 && /busy mid-shard/.test(busy.stdout), `the last step fails when a look mid-shard found the Mac busy (exit ${busy.status})`);
    const again = sh(['--again', '5']);
    ok(again.status === 0 && again.stdout.trim() === '', `a look again with nothing else at work says nothing and passes (exit ${again.status})`);
    const byHand = mkdtempSync(join(tmpdir(), 'macdeploy-h-'));
    const hand = sh(['5'], { ...process.env, MAC_DEPLOY_MARKS: byHand, GITHUB_ACTIONS: '' });
    ok(hand.status === 0 && !existsSync(join(byHand, 'deploy-.json')) && readdirSync(byHand).length === 0, 'run by hand in a session, it writes no mark (it would hold every other session)');
    rmSync(byHand, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(tmp, { recursive: true, force: true });
  }
  // The two callers: a harness's launch, and the desktop app's.
  const src = (f) => readFileSync(join(import.meta.dirname, f), 'utf8');
  ok(/export async function launchChromium[^]*?await untilMacDeployDone\(/.test(src('chromium.mjs')), 'launchChromium waits before it launches');
  ok(/await untilMacDeployDone\([^]*?electron\.launch\(/.test(src('desktop.mjs')), 'npm run desktop waits before its first launch');
  ok(/stayedFree\(/.test(src('checks.mjs')), 'a shard looks again between its checks (scripts/checks.mjs)');
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--selftest')) selftest();
  else {
    const m = holder();
    console.log(m ? `a deploy holds the owner's Mac: ${JSON.stringify(m)}` : 'no deploy holds the Mac');
  }
}
