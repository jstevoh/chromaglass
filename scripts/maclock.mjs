#!/usr/bin/env node
/**
 * One film at a time on the owner's Mac, in a FIFO queue (PLAN.md 19ak-23).
 *
 * What was reported: the owner's Mac (a 16 GB MacBook Air) lagged and dropped
 * offline when several agent sessions drove Chrome or the ChromaGlass app
 * through Playwright at once — filming, recording, or running app harnesses.
 * Until now the only guard was a manual rule: before a film, a session checked
 * `~/cg-scratch/film.lock`, waited while it existed, and otherwise wrote its
 * thread name and start time into it and removed it when done. That depended
 * on every session remembering, had no queue order, and left stale locks
 * behind whenever a session crashed.
 *
 * Why this design:
 *
 *   - Atomic lock file (`~/cg-scratch/film.lock`, overridable with
 *     `CG_FILM_LOCK`). Acquired only with `fs.openSync(path, 'wx')` so two
 *     processes can never take it at once. Line 1 keeps the manual rule's
 *     shape (`<label>, started <local date and time>`) so `cat film.lock`
 *     still tells a person who holds the Mac, and a one-line lock written by
 *     hand is still honoured; lines 2+ carry `pid:`, `started:`, `timeout:`,
 *     `cwd:`, and `cmd:`.
 *
 *   - FIFO queue (`~/cg-scratch/film.queue/` beside the lock). Each waiter
 *     writes `<epoch ms, 15 digits>-<pid>.json` atomically via rename. Only
 *     the oldest live ticket's process may try to take the lock, so waiters
 *     enter in arrival order without a thundering herd; anyone removes tickets
 *     whose pid is gone, and a waiter removes its own ticket when it takes the
 *     lock, gives up, or exits on a signal. A session writing `film.lock` by
 *     hand skips the queue and is still honoured.
 *
 *   - Stale recovery without racing a fresh holder. A lock whose `pid:` is
 *     gone (`process.kill(pid, 0)` throws `ESRCH`) is stale at once; any lock
 *     older than its `timeout:` + 60 s (from `started:`, or file mtime for a
 *     manual lock; default `CG_FILM_LOCK_TIMEOUT_SEC` = 5400 s) is stale. To
 *     prevent two waiters judging the same stale lock from deleting a fresh
 *     lock a third process created in between, a waiter first renames the
 *     stale file to a unique sibling name, compares its exact bytes with what
 *     it judged, and puts it back if they differ; otherwise it deletes it and
 *     appends one line to `~/cg-scratch/film-lock.log`.
 *
 *   - Deploys come first without deadlock. Loaded lazily from `./macdeploy.mjs`
 *     (skipped if this file is copied alone to `~/cg-scratch/bin`). Before
 *     taking the lock, the head waits while `holder()` says a deploy shard
 *     holds the Mac; after taking it, it checks once more while still holding
 *     its head ticket, and if a shard began meanwhile it releases the lock and
 *     waits again at the head. A film that already holds the lock is never
 *     interrupted (the shard's `scripts/macbusy.sh` checks `status --json`
 *     and moves the deploy to GitHub's Macs if a live film holds it).
 *
 *   - Nesting. Taking the lock sets `CG_FILM_LOCK_HELD=<holder pid>` in
 *     `process.env` so children inherit it. An acquire in a process whose
 *     `CG_FILM_LOCK_HELD` names a live pid matching the lock's `pid:` is a
 *     no-op, so a harness under `maclock run` or launching several browsers
 *     never waits on itself.
 *
 *   - Off where it makes no sense. A no-op inside CI (`GITHUB_ACTIONS`) and on
 *     anything other than macOS, unless `CG_FILM_LOCK` is set explicitly.
 *
 * Usage:
 *   node scripts/maclock.mjs run [--label L] [--timeout S] [--max-wait S] [--max-wait-exit CODE] -- <cmd> [args...]
 *   node scripts/maclock.mjs status [--json]
 *   node scripts/maclock.mjs --selftest
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync, closeSync, existsSync, linkSync, mkdirSync, mkdtempSync,
  openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync,
  utimesSync, writeFileSync, writeSync,
} from 'node:fs';
import { constants as osConstants, homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let macdeploy = null;
try {
  macdeploy = await import('./macdeploy.mjs');
} catch {
  // Standalone copy (e.g. ~/cg-scratch/bin/maclock.mjs): skip deploy check.
}

const DEFAULT_TIMEOUT_SEC = 5400;
const STALE_GRACE_SEC = 60;
const DEFAULT_MAX_WAIT_EXIT = 75;
const POLL_MS = Math.max(20, Number(process.env.CG_FILM_LOCK_POLL_MS) || 250);
const LOG_EVERY_MS = 60_000;

export function lockPath() {
  return process.env.CG_FILM_LOCK
    ? resolve(process.env.CG_FILM_LOCK)
    : join(homedir(), 'cg-scratch', 'film.lock');
}

export function queueDir(lock = lockPath()) {
  return join(dirname(lock), 'film.queue');
}

export function logPath(lock = lockPath()) {
  return join(dirname(lock), 'film-lock.log');
}

function defaultTimeoutSec() {
  const n = Number(process.env.CG_FILM_LOCK_TIMEOUT_SEC);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_SEC;
}

function isEnabled() {
  if (process.env.CG_FILM_LOCK) return true;
  return process.platform === 'darwin' && !process.env.GITHUB_ACTIONS;
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

const singleLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

function localDateTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function defaultLabel(cmdName = null) {
  const prog = cmdName ? basename(cmdName) : (process.argv[1] ? basename(process.argv[1]) : 'node');
  return `${prog} (${basename(process.cwd())})`;
}

function appendLockLog(lock, message) {
  try {
    mkdirSync(dirname(logPath(lock)), { recursive: true });
    appendFileSync(logPath(lock), `${new Date().toISOString()} ${singleLine(message)}\n`);
  } catch {
    // Logging should never abort lock recovery.
  }
}

function parseLockText(raw, mtimeMs, nowSec = Date.now() / 1000) {
  const lines = raw.split(/\r?\n/);
  const line1 = (lines[0] ?? '').trim();
  const meta = {};
  for (const line of lines.slice(1)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  const pid = meta.pid !== undefined && /^\d+$/.test(meta.pid) && Number(meta.pid) > 0
    ? Number(meta.pid)
    : null;
  const started = meta.started !== undefined && meta.started !== '' && Number.isFinite(Number(meta.started))
    ? Number(meta.started)
    : null;
  const timeoutParsed = meta.timeout !== undefined && meta.timeout !== '' ? Number(meta.timeout) : NaN;
  const timeoutSec = Number.isFinite(timeoutParsed) && timeoutParsed > 0 ? timeoutParsed : defaultTimeoutSec();
  const manual = pid === null && started === null;
  const startedEpochSec = started !== null ? started : mtimeMs / 1000;
  const ageSec = Math.max(0, nowSec - startedEpochSec);
  const alive = pid !== null ? isPidAlive(pid) : null;
  let staleReason = null;
  if (pid !== null && !alive) staleReason = `dead pid ${pid}`;
  else if (ageSec > timeoutSec + STALE_GRACE_SEC) {
    staleReason = `expired (${Math.round(ageSec)}s > ${timeoutSec + STALE_GRACE_SEC}s)`;
  }
  const idx = line1.indexOf(', started ');
  const label = !manual && idx > 0 ? line1.slice(0, idx) : line1;
  return {
    raw,
    line1,
    label,
    pid,
    alive,
    startedAt: new Date(startedEpochSec * 1000).toISOString(),
    ageSec: Math.round(ageSec * 10) / 10,
    timeoutSec,
    stale: staleReason !== null,
    staleReason,
    manual,
    cwd: meta.cwd ?? null,
    cmd: meta.cmd ?? null,
  };
}

function readLock(lock, nowSec = Date.now() / 1000) {
  try {
    const raw = readFileSync(lock, 'utf8');
    const st = statSync(lock);
    return { path: lock, ...parseLockText(raw, st.mtimeMs, nowSec) };
  } catch {
    return null;
  }
}

/**
 * Remove a stale lock without ever deleting a fresh lock a third process
 * created in between: rename to a unique sibling name first, compare its
 * exact bytes with what was judged, and put it back if they differ.
 */
export function clearStaleLock(lock, observedRaw, reason, line1, beforeRename = null) {
  const unique = `.${basename(lock)}.stale.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const tmp = join(dirname(lock), unique);
  try {
    if (beforeRename) beforeRename();
    renameSync(lock, tmp);
  } catch {
    return false;
  }
  let actual;
  try {
    actual = readFileSync(tmp, 'utf8');
  } catch {
    try { unlinkSync(tmp); } catch {}
    return false;
  }
  if (actual !== observedRaw) {
    // Another process replaced the lock before our rename: restore it intact.
    try {
      linkSync(tmp, lock);
      unlinkSync(tmp);
    } catch {
      if (!existsSync(lock)) {
        try { renameSync(tmp, lock); } catch {}
      } else {
        try { unlinkSync(tmp); } catch {}
      }
    }
    return false;
  }
  try { unlinkSync(tmp); } catch {}
  appendLockLog(lock, `stale (${reason}): ${line1}`);
  return true;
}

function scanQueue(qDir, { pruneDead = true } = {}) {
  let names = [];
  try {
    names = readdirSync(qDir).filter((n) => /^\d{15}-\d+\.json$/.test(n)).sort();
  } catch {
    return [];
  }
  const nowMs = Date.now();
  const live = [];
  for (const name of names) {
    const filePath = join(qDir, name);
    let data;
    try {
      data = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      if (pruneDead) {
        try {
          if (nowMs - statSync(filePath).mtimeMs > 5000) unlinkSync(filePath);
        } catch {}
      }
      continue;
    }
    const pid = Number(data?.pid);
    if (!isPidAlive(pid)) {
      if (pruneDead) {
        try { unlinkSync(filePath); } catch {}
      }
      continue;
    }
    const parsedAt = typeof data.enqueuedAt === 'string'
      ? Date.parse(data.enqueuedAt)
      : Number(data.enqueuedAt);
    const fileMs = Number(name.slice(0, 15));
    const enqueuedMs = Number.isFinite(parsedAt) ? parsedAt : fileMs;
    live.push({
      file: name,
      filePath,
      pid,
      label: String(data.label ?? ''),
      cwd: String(data.cwd ?? ''),
      cmd: String(data.cmd ?? ''),
      enqueuedAt: typeof data.enqueuedAt === 'string' ? data.enqueuedAt : new Date(enqueuedMs).toISOString(),
      waitedSec: Math.max(0, Math.round(((nowMs - enqueuedMs) / 1000) * 10) / 10),
    });
  }
  return live;
}

function currentDeployHolder() {
  if (!macdeploy?.holder) return null;
  const m = macdeploy.holder();
  if (!m) return null;
  return { runner: m.runner ?? 'owner-mac', began: m.began };
}

export function filmLockStatus() {
  const lockFile = lockPath();
  const qDir = queueDir(lockFile);
  const cur = readLock(lockFile);
  const queue = scanQueue(qDir, { pruneDead: false }).map(
    ({ pid, label, cwd, cmd, enqueuedAt, waitedSec }) => ({ pid, label, cwd, cmd, enqueuedAt, waitedSec }),
  );
  return {
    lock: cur ? {
      path: cur.path,
      label: cur.label,
      line1: cur.line1,
      pid: cur.pid,
      alive: cur.alive,
      startedAt: cur.startedAt,
      ageSec: cur.ageSec,
      timeoutSec: cur.timeoutSec,
      stale: cur.stale,
      manual: cur.manual,
    } : null,
    queue,
    deploy: currentDeployHolder(),
  };
}

function writeTicket(qDir, { label, cmd }) {
  mkdirSync(qDir, { recursive: true });
  let ms = Date.now();
  let name;
  let ticketPath;
  for (;;) {
    name = `${String(ms).padStart(15, '0')}-${process.pid}.json`;
    ticketPath = join(qDir, name);
    if (!existsSync(ticketPath)) break;
    ms += 1;
  }
  const tmp = join(qDir, `.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  const payload = {
    pid: process.pid,
    label: singleLine(label),
    cwd: process.cwd(),
    cmd: singleLine(cmd),
    enqueuedAt: new Date(ms).toISOString(),
  };
  writeFileSync(tmp, `${JSON.stringify(payload)}\n`);
  renameSync(tmp, ticketPath);
  return { name, ticketPath };
}

function formatLockContent({ label, timeoutSec, cmd }) {
  const safeLabel = singleLine(label) || defaultLabel();
  const now = new Date();
  const line1 = `${safeLabel}, started ${localDateTime(now)}`;
  const body = [
    line1,
    `pid: ${process.pid}`,
    `started: ${Math.floor(now.getTime() / 1000)}`,
    `timeout: ${timeoutSec}`,
    `cwd: ${singleLine(process.cwd())}`,
    `cmd: ${singleLine(cmd)}`,
    '',
  ].join('\n');
  return { line1, body };
}

function tryAtomicTake(lock, body) {
  mkdirSync(dirname(lock), { recursive: true });
  let fd;
  try {
    fd = openSync(lock, 'wx');
  } catch (err) {
    if (err?.code === 'EEXIST') return false;
    throw err;
  }
  try {
    writeSync(fd, body);
  } finally {
    closeSync(fd);
  }
  return true;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let inFlightAcquire = null;

/**
 * Queue FIFO and acquire `~/cg-scratch/film.lock` (or `CG_FILM_LOCK`).
 * Returns an idempotent synchronous release function.
 */
export async function acquireFilmLock({
  label = defaultLabel(),
  timeoutSec = defaultTimeoutSec(),
  maxWaitSec = null,
  cmd = process.argv.join(' '),
} = {}) {
  if (!isEnabled()) return () => {};
  const lock = lockPath();

  // Nesting: if an ancestor already holds the live lock, never deadlock.
  const heldEnv = process.env.CG_FILM_LOCK_HELD;
  if (heldEnv) {
    const heldPid = Number(heldEnv);
    if (Number.isInteger(heldPid) && heldPid > 0 && isPidAlive(heldPid)) {
      const cur = readLock(lock);
      if (cur && cur.pid === heldPid && !cur.stale) return () => {};
    }
  }

  // Serialize concurrent calls within the same Node process so only one queues.
  if (inFlightAcquire) {
    await inFlightAcquire;
    return acquireFilmLock({ label, timeoutSec, maxWaitSec, cmd });
  }

  const run = async () => {
    const qDir = queueDir(lock);
    const { name: ticketName, ticketPath } = writeTicket(qDir, { label, cmd });
    let ticketRemoved = false;
    let lockTaken = false;
    let lockBody = '';
    let released = false;

    const removeTicket = () => {
      if (ticketRemoved) return;
      ticketRemoved = true;
      try { unlinkSync(ticketPath); } catch {}
    };

    const releaseLock = () => {
      if (!lockTaken || released) return;
      released = true;
      try {
        if (readFileSync(lock, 'utf8') === lockBody) unlinkSync(lock);
      } catch {}
      if (process.env.CG_FILM_LOCK_HELD === String(process.pid)) {
        delete process.env.CG_FILM_LOCK_HELD;
      }
    };

    const cleanupAll = () => {
      removeTicket();
      releaseLock();
    };

    const sigHandlers = new Map();
    const detach = () => {
      process.off('exit', cleanupAll);
      for (const [sig, fn] of sigHandlers) process.off(sig, fn);
      sigHandlers.clear();
    };

    process.on('exit', cleanupAll);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const fn = () => {
        const onlyUs = process.listenerCount(sig) <= 1;
        cleanupAll();
        detach();
        if (onlyUs) {
          const num = osConstants.signals[sig] ?? 15;
          process.exit(128 + num);
        }
      };
      sigHandlers.set(sig, fn);
      process.on(sig, fn);
    }

    const release = () => {
      cleanupAll();
      detach();
    };

    const t0 = Date.now();
    let lastLogAt = 0;
    const maybeLog = (msg) => {
      if (Date.now() - lastLogAt >= LOG_EVERY_MS) {
        process.stderr.write(`maclock: ${msg}\n`);
        lastLogAt = Date.now();
      }
    };

    try {
      for (;;) {
        if (maxWaitSec != null && (Date.now() - t0) / 1000 >= maxWaitSec) {
          removeTicket();
          detach();
          const err = new Error(`maclock: timed out waiting ${maxWaitSec}s for film lock`);
          err.code = 'MACLOCK_TIMEOUT';
          throw err;
        }

        const cur = readLock(lock);
        if (cur?.stale) {
          clearStaleLock(lock, cur.raw, cur.staleReason, cur.line1);
          continue;
        }

        const queue = scanQueue(qDir);
        const idx = queue.findIndex((t) => t.file === ticketName);
        if (idx === -1) {
          // Ticket disappeared unexpectedly; re-create so we never hang.
          const next = writeTicket(qDir, { label, cmd });
          removeTicket();
          // Restart loop with fresh ticket by throwing only if unrecoverable;
          // updating ticketPath via closure isn't needed if we keep it clean,
          // so only re-enqueue if unlink raced externally.
          try { renameSync(next.ticketPath, ticketPath); ticketRemoved = false; } catch {}
          continue;
        }

        if (idx > 0) {
          if (cur) {
            maybeLog(`waiting, held by ${cur.line1} for ${Math.floor(cur.ageSec / 60)} min, you are #${idx + 1} of ${queue.length}`);
          } else {
            const deploy = currentDeployHolder();
            if (deploy) maybeLog(`waiting for a deploy shard on ${deploy.runner}, you are #${idx + 1} of ${queue.length}`);
            else maybeLog(`waiting in queue, you are #${idx + 1} of ${queue.length}`);
          }
          await sleep(POLL_MS);
          continue;
        }

        // We are at the head of the queue. Deploys come first.
        const deployBefore = currentDeployHolder();
        if (deployBefore) {
          maybeLog(`waiting for a deploy shard on ${deployBefore.runner}`);
          await sleep(POLL_MS);
          continue;
        }

        if (cur) {
          maybeLog(`waiting, held by ${cur.line1} for ${Math.floor(cur.ageSec / 60)} min, you are #1 of ${queue.length}`);
          await sleep(POLL_MS);
          continue;
        }

        const { body } = formatLockContent({ label, timeoutSec, cmd });
        if (!tryAtomicTake(lock, body)) {
          await sleep(POLL_MS);
          continue;
        }

        // Re-check deploys after taking: if a shard began meanwhile, release
        // immediately while still holding our head ticket, then wait again.
        const deployAfter = currentDeployHolder();
        if (deployAfter) {
          try {
            if (readFileSync(lock, 'utf8') === body) unlinkSync(lock);
          } catch {}
          maybeLog(`waiting for a deploy shard on ${deployAfter.runner}`);
          await sleep(POLL_MS);
          continue;
        }

        lockTaken = true;
        lockBody = body;
        removeTicket();
        process.env.CG_FILM_LOCK_HELD = String(process.pid);
        return release;
      }
    } catch (err) {
      cleanupAll();
      detach();
      throw err;
    }
  };

  inFlightAcquire = run();
  try {
    return await inFlightAcquire;
  } finally {
    inFlightAcquire = null;
  }
}

export async function withFilmLock(opts, fn) {
  if (typeof opts === 'function') {
    fn = opts;
    opts = {};
  }
  const release = await acquireFilmLock(opts);
  try {
    return await fn();
  } finally {
    release();
  }
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function parseRunArgs(argv) {
  let label = null;
  let timeoutSec = defaultTimeoutSec();
  let maxWaitSec = null;
  let maxWaitExit = DEFAULT_MAX_WAIT_EXIT;
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { i++; break; }
    if (a === '--label') label = argv[++i] ?? '';
    else if (a === '--timeout') timeoutSec = Number(argv[++i]);
    else if (a === '--max-wait') maxWaitSec = Number(argv[++i]);
    else if (a === '--max-wait-exit') maxWaitExit = Number(argv[++i]);
    else if (a.startsWith('-')) {
      console.error(`maclock run: unknown option ${a}`);
      process.exit(2);
    } else break;
  }
  const cmdArgs = argv.slice(i);
  if (!cmdArgs.length) {
    console.error('usage: maclock run [--label L] [--timeout S] [--max-wait S] [--max-wait-exit CODE] -- <command> [args...]');
    process.exit(2);
  }
  if (!(Number.isFinite(timeoutSec) && timeoutSec > 0)) {
    console.error(`maclock run: invalid --timeout "${timeoutSec}"`);
    process.exit(2);
  }
  if (maxWaitSec !== null && !(Number.isFinite(maxWaitSec) && maxWaitSec >= 0)) {
    console.error(`maclock run: invalid --max-wait "${maxWaitSec}"`);
    process.exit(2);
  }
  if (!Number.isInteger(maxWaitExit)) {
    console.error(`maclock run: invalid --max-wait-exit "${maxWaitExit}"`);
    process.exit(2);
  }
  return {
    label: label || defaultLabel(cmdArgs[0]),
    timeoutSec,
    maxWaitSec,
    maxWaitExit,
    cmd: cmdArgs[0],
    args: cmdArgs.slice(1),
  };
}

async function runCli(argv) {
  const opts = parseRunArgs(argv);
  let release;
  try {
    release = await acquireFilmLock({
      label: opts.label,
      timeoutSec: opts.timeoutSec,
      maxWaitSec: opts.maxWaitSec,
      cmd: [opts.cmd, ...opts.args].join(' '),
    });
  } catch (err) {
    if (err?.code === 'MACLOCK_TIMEOUT') process.exit(opts.maxWaitExit);
    throw err;
  }

  const lock = lockPath();
  const child = spawn(opts.cmd, opts.args, {
    stdio: 'inherit',
    detached: true,
    env: process.env,
  });

  let timedOut = false;
  let killTimer = null;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    process.stderr.write(`maclock: timed out after ${opts.timeoutSec}s, stopping ${opts.cmd}\n`);
    appendLockLog(lock, `timeout (${opts.timeoutSec}s): ${opts.label}`);
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    killTimer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, 10_000);
    killTimer.unref();
  }, opts.timeoutSec * 1000);
  timeoutTimer.unref();

  const forward = (sig) => {
    try { process.kill(-child.pid, sig); } catch {}
  };
  const sigs = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const s of sigs) process.on(s, forward);

  const code = await new Promise((resolveExit) => {
    child.on('error', (err) => {
      process.stderr.write(`maclock: failed to start ${opts.cmd}: ${err.message}\n`);
      resolveExit(127);
    });
    child.on('exit', (exitCode, signal) => {
      if (timedOut) resolveExit(124);
      else if (exitCode !== null) resolveExit(exitCode);
      else resolveExit(128 + (osConstants.signals[signal] ?? 15));
    });
  });

  clearTimeout(timeoutTimer);
  if (killTimer) clearTimeout(killTimer);
  for (const s of sigs) process.off(s, forward);
  release();
  process.exit(code);
}

function statusCli(argv) {
  const st = filmLockStatus();
  if (argv.includes('--json')) {
    console.log(JSON.stringify(st, null, 2));
    return;
  }
  if (!st.lock) {
    console.log(`lock: free (${lockPath()})`);
  } else {
    const flags = [
      st.lock.manual ? 'manual' : `pid ${st.lock.pid} (${st.lock.alive ? 'alive' : 'dead'})`,
      `age ${Math.round(st.lock.ageSec)}s / ${st.lock.timeoutSec}s`,
      st.lock.stale ? 'STALE' : 'active',
    ].join(', ');
    console.log(`lock: ${st.lock.line1} [${flags}]`);
  }
  if (st.deploy) {
    console.log(`deploy: held by ${st.deploy.runner} (began ${Math.round(Date.now() / 1000 - st.deploy.began)}s ago)`);
  } else {
    console.log('deploy: none');
  }
  if (!st.queue.length) {
    console.log('queue: empty');
  } else {
    console.log(`queue: ${st.queue.length} waiting`);
    st.queue.forEach((q, idx) => {
      console.log(`  #${idx + 1} pid ${q.pid} (${q.waitedSec}s): ${q.label}`);
    });
  }
}

// ─── Selftest ──────────────────────────────────────────────────────────────

async function selftest() {
  let pass = 0;
  let fail = 0;
  const ok = (cond, what, detail = '') => {
    if (cond) pass++; else fail++;
    console.log(`${cond ? ' ok  ' : ' FAIL'} ${what}${detail ? ` — ${detail}` : ''}`);
  };

  const selfFile = fileURLToPath(import.meta.url);
  const root = mkdtempSync(join(tmpdir(), 'maclock-test-'));
  const lock = join(root, 'film.lock');
  const marks = join(root, 'marks');
  mkdirSync(marks, { recursive: true });
  const baseEnv = {
    ...process.env,
    CG_FILM_LOCK: lock,
    MAC_DEPLOY_MARKS: marks,
    CG_FILM_LOCK_POLL_MS: '40',
  };
  delete baseEnv.CG_FILM_LOCK_HELD;

  const spawnMaclock = (args, env = baseEnv) => {
    const child = spawn(process.execPath, [selfFile, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const done = new Promise((resolveDone) => child.on('exit', (code, signal) => resolveDone({ code, signal, stdout, stderr })));
    return { child, done };
  };

  const waitFor = async (fn, ms = 10_000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await fn();
      if (v) return v;
      await sleep(30);
    }
    return null;
  };

  try {
    // 1. Exclusive: two `run`s never overlap.
    {
      const spanLog = join(root, 'spans.log');
      const sleeper = `
        import fs from 'node:fs';
        const t0 = Date.now();
        await new Promise(r => setTimeout(r, 250));
        const t1 = Date.now();
        fs.appendFileSync(${JSON.stringify(spanLog)}, process.argv[1] + ':' + t0 + '-' + t1 + '\\n');
      `;
      const a = spawnMaclock(['run', '--label', 'ex-a', '--', process.execPath, '--input-type=module', '-e', sleeper, 'A']);
      const b = spawnMaclock(['run', '--label', 'ex-b', '--', process.execPath, '--input-type=module', '-e', sleeper, 'B']);
      const [ra, rb] = await Promise.all([a.done, b.done]);
      const lines = existsSync(spanLog) ? readFileSync(spanLog, 'utf8').trim().split('\n').filter(Boolean) : [];
      const spans = lines.map((l) => {
        const [, se] = l.split(':');
        const [s, e] = se.split('-').map(Number);
        return { s, e };
      });
      const noOverlap = spans.length === 2 && (spans[0].e <= spans[1].s || spans[1].e <= spans[0].s);
      ok(ra.code === 0 && rb.code === 0 && noOverlap && !existsSync(lock),
        'exclusive: two runs never overlap and leave no lock',
        spans.map((x) => `${x.s}..${x.e}`).join(' vs ') || `codes ${ra.code}, ${rb.code}`);
    }

    // 2. FIFO: three waiters queued in order a, b, c take the lock in that order.
    {
      const holderReady = join(root, 'holder.ready');
      const holderStop = join(root, 'holder.stop');
      const orderLog = join(root, 'fifo.log');
      const holderScript = `
        import fs from 'node:fs';
        fs.writeFileSync(${JSON.stringify(holderReady)}, '1');
        while (!fs.existsSync(${JSON.stringify(holderStop)})) await new Promise(r => setTimeout(r, 30));
      `;
      const holder = spawnMaclock(['run', '--label', 'fifo-holder', '--', process.execPath, '--input-type=module', '-e', holderScript]);
      await waitFor(() => existsSync(holderReady));

      const workerScript = `
        import fs from 'node:fs';
        fs.appendFileSync(${JSON.stringify(orderLog)}, process.argv[1] + '\\n');
      `;
      const qDir = queueDir(lock);
      const waiters = [];
      for (const id of ['a', 'b', 'c']) {
        const w = spawnMaclock(['run', '--label', `fifo-${id}`, '--', process.execPath, '--input-type=module', '-e', workerScript, id]);
        waiters.push(w);
        const seen = await waitFor(() => {
          try {
            return readdirSync(qDir).some((n) => n.endsWith(`-${w.child.pid}.json`));
          } catch { return false; }
        });
        if (!seen) break;
        await sleep(15); // ensure distinct millisecond timestamps
      }
      writeFileSync(holderStop, '1');
      const results = await Promise.all([holder.done, ...waiters.map((w) => w.done)]);
      const gotOrder = existsSync(orderLog) ? readFileSync(orderLog, 'utf8').trim().split('\n').join(',') : '';
      ok(results.every((r) => r.code === 0) && gotOrder === 'a,b,c',
        'FIFO: three queued waiters acquire the lock in exact enqueue order',
        `order="${gotOrder}"`);
    }

    // 3. Dead holder's lock is freed.
    {
      const deadChild = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
      const deadPid = deadChild.pid;
      const logBefore = existsSync(logPath(lock)) ? readFileSync(logPath(lock), 'utf8').split('\n').filter(Boolean).length : 0;
      writeFileSync(lock, `dead-job, started 2026-11-22 10:00:00\npid: ${deadPid}\nstarted: ${Math.floor(Date.now() / 1000)}\ntimeout: 5400\n`);
      const r = await spawnMaclock(['run', '--label', 'after-dead', '--', process.execPath, '-e', 'console.log("ran")']).done;
      const logLines = existsSync(logPath(lock)) ? readFileSync(logPath(lock), 'utf8').split('\n').filter(Boolean) : [];
      ok(r.code === 0 && r.stdout.trim() === 'ran' && logLines.length === logBefore + 1 && /dead pid/.test(logLines.at(-1) ?? ''),
        'dead holder: stale lock is freed and logged',
        `exit ${r.code}, logged "${logLines.at(-1) ?? ''}"`);
    }

    // 4. Over-timeout lock (live pid, old `started:`) is freed.
    {
      const liveSleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
      try {
        const oldStarted = Math.floor(Date.now() / 1000) - 200;
        writeFileSync(lock, `old-live, started 2026-11-22 09:00:00\npid: ${liveSleeper.pid}\nstarted: ${oldStarted}\ntimeout: 60\n`);
        const r = await spawnMaclock(['run', '--label', 'after-old', '--', process.execPath, '-e', 'console.log("took")']).done;
        const logLines = existsSync(logPath(lock)) ? readFileSync(logPath(lock), 'utf8').split('\n').filter(Boolean) : [];
        ok(r.code === 0 && r.stdout.trim() === 'took' && /expired/.test(logLines.at(-1) ?? ''),
          'over-timeout lock: expired lock with live pid is freed and logged',
          `exit ${r.code}, logged "${logLines.at(-1) ?? ''}"`);
      } finally {
        try { liveSleeper.kill('SIGKILL'); } catch {}
      }
    }

    // 5. Hand-written one-line lock is honoured while fresh, then freed by age.
    {
      writeFileSync(lock, 'manual-session, started just now\n');
      const held = await spawnMaclock(['run', '--max-wait', '0.25', '--max-wait-exit', '75', '--', process.execPath, '-e', 'console.log("oops")']).done;
      const oldMs = Date.now() - 150_000;
      utimesSync(lock, oldMs / 1000, oldMs / 1000);
      const freed = await spawnMaclock(
        ['run', '--label', 'after-manual', '--', process.execPath, '-e', 'console.log("freed")'],
        { ...baseEnv, CG_FILM_LOCK_TIMEOUT_SEC: '30' },
      ).done;
      ok(held.code === 75 && held.stdout === '' && freed.code === 0 && freed.stdout.trim() === 'freed',
        'manual lock: fresh one-line lock is honoured, aged one-line lock is freed',
        `fresh exit ${held.code}, aged exit ${freed.code}`);
    }

    // 6. `run --timeout` kills a sleeping child and releases.
    {
      const childPidFile = join(root, 'timeout-child.pid');
      const r = await spawnMaclock([
        'run', '--label', 'will-timeout', '--timeout', '0.4', '--',
        process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(childPidFile)}, String(process.pid)); setTimeout(() => {}, 30000);`,
      ]).done;
      const childPid = Number(readFileSync(childPidFile, 'utf8'));
      await sleep(100);
      const childAlive = isPidAlive(childPid);
      ok(r.code !== 0 && !childAlive && !existsSync(lock),
        'run --timeout: kills sleeping child group and releases lock',
        `exit ${r.code}, childAlive=${childAlive}, lockExists=${existsSync(lock)}`);
    }

    // 7. Nesting does not self-deadlock.
    {
      const nestedScript = `
        import { acquireFilmLock } from ${JSON.stringify(selfFile)};
        const rel = await acquireFilmLock({ label: 'nested-child', maxWaitSec: 0.3 });
        console.log('nested-ok');
        rel();
      `;
      const r = await spawnMaclock(['run', '--label', 'parent-nest', '--', process.execPath, '--input-type=module', '-e', nestedScript]).done;
      ok(r.code === 0 && r.stdout.trim() === 'nested-ok' && !existsSync(lock),
        'nesting: child acquireFilmLock under CG_FILM_LOCK_HELD is a no-op without deadlock',
        `exit ${r.code}, out="${r.stdout.trim()}"`);
    }

    // 8. Stale-rename race: never deletes a fresh lock created between judge and rename.
    {
      const staleText = `stale-A, started 2026-11-22 08:00:00\npid: 999999\nstarted: 1000\ntimeout: 60\n`;
      const freshText = `fresh-C, started 2026-11-22 17:00:00\npid: ${process.pid}\nstarted: ${Math.floor(Date.now() / 1000)}\ntimeout: 5400\n`;
      writeFileSync(lock, staleText);
      const cleared = clearStaleLock(lock, staleText, 'dead pid 999999', 'stale-A', () => {
        unlinkSync(lock);
        writeFileSync(lock, freshText);
      });
      const surviving = existsSync(lock) ? readFileSync(lock, 'utf8') : '';
      const leftovers = readdirSync(root).filter((n) => n.startsWith('.film.lock.stale.'));
      unlinkSync(lock);
      ok(cleared === false && surviving === freshText && leftovers.length === 0,
        'stale-rename race: fresh lock created before rename is put back untouched',
        `cleared=${cleared}, matchedFresh=${surviving === freshText}, leftovers=${leftovers.length}`);
    }

    // 9. `--max-wait` exits 75 and leaves no ticket.
    {
      writeFileSync(lock, `busy-live, started now\npid: ${process.pid}\nstarted: ${Math.floor(Date.now() / 1000)}\ntimeout: 5400\n`);
      const r = await spawnMaclock(['run', '--max-wait', '0.25', '--', process.execPath, '-e', 'console.log("nope")']).done;
      const tickets = readdirSync(queueDir(lock)).filter((n) => /^\d{15}-\d+\.json$/.test(n));
      unlinkSync(lock);
      ok(r.code === 75 && r.stdout === '' && tickets.length === 0,
        '--max-wait: exits 75 when lock stays held and leaves no ticket',
        `exit ${r.code}, tickets=${tickets.length}`);
    }

    // 10. A deploy mark makes the head wait, then proceed once deploy clears.
    {
      const markFile = join(marks, 'deploy-test.json');
      writeFileSync(markFile, JSON.stringify({
        runner: 'owner-mac-test', shard: 'open', run: '99', worker: process.pid,
        began: Math.floor(Date.now() / 1000), ended: null, gaveUp: false,
      }));
      const blocked = await spawnMaclock(['run', '--max-wait', '0.25', '--', process.execPath, '-e', 'console.log("ran")']).done;
      const ranFile = join(root, 'after-deploy.txt');
      const waiter = spawnMaclock(['run', '--label', 'after-deploy', '--', process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(ranFile)}, 'ok')`]);
      await sleep(250);
      const ranWhileDeploy = existsSync(ranFile);
      writeFileSync(markFile, JSON.stringify({
        runner: 'owner-mac-test', shard: 'open', run: '99', worker: process.pid,
        began: Math.floor(Date.now() / 1000) - 300, ended: Math.floor(Date.now() / 1000) - 200, gaveUp: true,
      }));
      const after = await waiter.done;
      ok(blocked.code === 75 && !ranWhileDeploy && after.code === 0 && existsSync(ranFile),
        'deploy mark: head waits while deploy holds the Mac, then runs once cleared',
        `blocked=${blocked.code}, ranWhileDeploy=${ranWhileDeploy}, after=${after.code}`);
    }

    // 11. macbusy.sh treats a live film.lock as busy (prints line 1) and ignores a stale one.
    {
      const busySh = join(dirname(selfFile), 'macbusy.sh');
      const liveLine1 = 'selftest-film (agy-c66), started 2026-11-22 17:30:00';
      writeFileSync(lock, `${liveLine1}\npid: ${process.pid}\nstarted: ${Math.floor(Date.now() / 1000)}\ntimeout: 5400\n`);
      const busyRun = spawnSync('bash', [busySh, '--again', '0'], {
        env: { ...baseEnv, RUNNER_TEMP: root },
        encoding: 'utf8',
      });
      unlinkSync(lock);
      writeFileSync(lock, `dead-film, started 2026-11-22 12:00:00\npid: 999999\nstarted: 1000\ntimeout: 60\n`);
      const staleRun = spawnSync('bash', [busySh, '--again', '0'], {
        env: { ...baseEnv, RUNNER_TEMP: root },
        encoding: 'utf8',
      });
      unlinkSync(lock);
      ok(busyRun.status === 1 && busyRun.stdout.includes(liveLine1) && staleRun.status === 0,
        'macbusy.sh: live film.lock refuses with holder line 1, stale film.lock does not',
        `live exit ${busyRun.status} (has line1=${busyRun.stdout.includes(liveLine1)}), stale exit ${staleRun.status}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail ? 1 : 0);
}

// ─── Entrypoint ────────────────────────────────────────────────────────────

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  && basename(fileURLToPath(import.meta.url)) === 'maclock.mjs';
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    await selftest();
  } else if (args[0] === 'run') {
    await runCli(args.slice(1));
  } else if (args[0] === 'status') {
    statusCli(args.slice(1));
  } else {
    console.error('usage: node scripts/maclock.mjs <run|status|--selftest>');
    process.exit(2);
  }
}
