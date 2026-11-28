// Group CI failure lines by fingerprint (PLAN.md 50j, 50j-2).
//
// Tools and modes:
//   npm run fingerprints -- --run <run_id> [--since <sha>] [--json]
//   npm run fingerprints -- --since <sha> [--json]
//   node scripts/fingerprints.mjs [--json] [file ...]   (stdin when no file)
//   node scripts/fingerprints.mjs --selftest
//
// Exports for the foreman (PLAN.md 50j-2):
//   failureShape(line)           normalized failure shape, or null if not a failure
//   fingerprint(shape)           12 hex characters of sha1(shape)
//   groupFailures(log, opts)     [{ fp, shape, check, count, sample, ... }]
//
// Tool, not a check: never added to scripts/checks.json and never fails CI.
// GitHub access uses `gh api` (gh's own login) with fallback to `ghCurl` from
// scripts/ghapi.mjs so no token ever enters arguments or logs.

import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ghCurl, redact } from './ghapi.mjs';

const execFileAsync = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
const CACHE_DIR = join(tmpdir(), 'cg-fingerprints');

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Load look ids/names from src/presets*.ts and bottle ids/names from
// src/bottles.ts once. Reading the TypeScript sources as text keeps this tool
// runnable under plain `node scripts/fingerprints.mjs` without flags.
let cachedEntities = null;
function loadEntities() {
  if (cachedEntities) return cachedEntities;
  const looks = new Map(); // pattern -> canonical id
  const liquids = new Map();

  // Common liquid words whose bare noun also appears in a look name (Oil &
  // Water, Soap Film, Milk Marbling, Turing Print): only match the full phrase
  // as a look so "water" or "oil" on its own classifies as a liquid, not a look.
  const AMBIGUOUS_LOOK_WORDS = new Set(['oil', 'water', 'soap', 'milk', 'ink', 'alcohol', 'ouzo', 'syrup', 'glycerine', 'ferrofluid']);

  try {
    const presetFiles = readdirSync(join(ROOT, 'src')).filter((f) => /^presets.*\.ts$/.test(f));
    for (const f of presetFiles) {
      const txt = readFileSync(join(ROOT, 'src', f), 'utf8');
      for (const m of txt.matchAll(/id:\s*'([^']+)'[\s\S]{0,120}?name:\s*'([^']+)'/g)) {
        const [, id, name] = m;
        looks.set(id.toLowerCase(), id);
        const lowerName = name.toLowerCase();
        if (!AMBIGUOUS_LOOK_WORDS.has(lowerName)) looks.set(lowerName, id);
      }
    }
  } catch { /* fallback below */ }

  // Retired / alias look names still referenced in older checks (e.g. Classic).
  if (!looks.has('classic')) looks.set('classic', 'classic');

  try {
    const txt = readFileSync(join(ROOT, 'src', 'bottles.ts'), 'utf8');
    for (const m of txt.matchAll(/\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)'/g)) {
      const [, id, name] = m;
      liquids.set(id.toLowerCase(), id);
      liquids.set(name.toLowerCase(), id);
    }
  } catch { /* fallback below */ }

  if (liquids.size === 0) {
    for (const id of ['water', 'oil', 'alcohol', 'ouzo', 'ink', 'syrup', 'reagent', 'soap', 'milk', 'silicone', 'acid', 'base', 'activator', 'glycerine', 'ferrofluid']) {
      liquids.set(id, id);
    }
  }

  const compile = (map) => [...map.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([pat, id]) => ({
      id,
      re: new RegExp(`(?<![a-z0-9])${escRe(pat)}(?![a-z0-9])`, 'i'),
    }));

  cachedEntities = { lookMatchers: compile(looks), liquidMatchers: compile(liquids) };
  return cachedEntities;
}

/** Extract canonical look and liquid ids named in a failure line. */
export function extractEntities(text) {
  const { lookMatchers, liquidMatchers } = loadEntities();
  const s = String(text ?? '');
  const looks = new Set();
  const liquids = new Set();
  for (const { id, re } of lookMatchers) if (re.test(s)) looks.add(id);
  for (const { id, re } of liquidMatchers) if (re.test(s)) liquids.add(id);
  return {
    looks: [...looks].sort(),
    liquids: [...liquids].sort(),
  };
}

// Strip `gh run view --log-failed` prefix (`<job>\t<step>\t`) and timestamp.
function splitLogPrefix(rawLine) {
  let job = null;
  let rest = String(rawLine ?? '').replace(/\r$/, '');
  const tab = rest.match(/^([^\t]+)\t([^\t]+)\t(.*)$/);
  if (tab) {
    job = tab[1].trim();
    rest = tab[3];
  }
  rest = rest.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s*/, '');
  rest = rest.replace(/\x1b\[[0-9;]*m/g, '');
  return { job, text: rest };
}

/**
 * Normalize a single log line into its canonical failure shape, or return null
 * when the line is not a failure (step-script echo, action inputs, comments,
 * quarantined warnings, passing `ok` lines, and generic exit-code footers).
 */
export function failureShape(line) {
  const { text } = splitLogPrefix(line);
  const trimmed = text.trim();
  if (!trimmed) return null;

  // GitHub workflow commands other than ##[error] are never failures.
  if (/^##\[(?:group|endgroup|command|debug|notice|warning)\]/i.test(trimmed)) return null;
  // Quarantined summary lines printed by checks.mjs are warnings, not failures.
  if (/^⚠/.test(trimmed) || /\[quarantined for [^\]]+\]$/.test(trimmed)) return null;
  // Comments, passing lines, and shell/action-input echoes are not failures.
  if (/^#(?![#]\[error\])/.test(trimmed)) return null;
  if (/^ok(?:\s|$)/.test(trimmed)) return null;
  if (/^(?:echo|if|then|fi|else|elif|for|do|done|case|esac|test|export|set|exit)\b/.test(trimmed)) return null;
  if (/^(?:fail-on-cache-miss|with|env|shell|run|key|path|restore-keys|token):/i.test(trimmed)) return null;

  let body = null;
  if (trimmed.startsWith('##[error]')) {
    const msg = trimmed.slice('##[error]'.length).trim();
    if (!msg) return null;
    if (/^Process completed with exit code \d+\.?$/i.test(msg)) return null;
    if (/^The operation was canceled\.?$/i.test(msg)) return null;
    body = `##[error]${msg}`;
  } else if (/^(?:[✗×]\s+)?FAIL(?:\s|:|$)/.test(trimmed)) {
    body = trimmed
      .replace(/^(?:[✗×]\s+)?FAIL\b/, 'FAIL')
      // qa.mjs prefixes FAIL lines with elapsed `mm:ss` (`FAIL  00:30       ...`)
      .replace(/^(FAIL\s+)\d{1,2}:\d{2}(?::\d{2})?\s+/, '$1');
  } else if (/^(?:Uncaught\s+)?(?:[A-Z]\w*Error|Error):\s+.+/.test(trimmed)) {
    body = trimmed.replace(/^Uncaught\s+/, '');
  } else if (/^\S+(?:\(\d+,\d+\)|:\d+:\d+\s+-)\s+error\s+TS\d+:/.test(trimmed)) {
    body = trimmed;
  } else if (/^npm (?:ERR!|error)\b/.test(trimmed)) {
    if (/^npm (?:ERR!|error) (?:code \d+|path |command |A complete log)/i.test(trimmed)) return null;
    body = trimmed;
  } else {
    return null;
  }

  return body
    // Strip workspace and temporary directories that vary across runs/runners.
    .replace(/file:\/\/\/(?:home\/runner\/work\/[^/\s]+\/[^/\s]+|Users\/[^/\s]+\/[^/\s]+)\//g, '<repo>/')
    .replace(/\/(?:home\/runner\/work\/[^/\s]+\/[^/\s]+|Users\/[^/\s]+\/cg-scratch\/[^/\s]+)\//g, '<repo>/')
    .replace(/\/(?:private\/)?var\/folders\/[^\s'"`,;)]+/g, '<tmp>')
    .replace(/\/tmp\/[^\s'"`,;)]+/g, '<tmp>')
    // Strip ISO timestamps/dates.
    .replace(/\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z?)?\b/g, '<date>')
    // Strip commit SHAs / hex hashes (7-40 chars containing at least one digit).
    .replace(/(?<![a-zA-Z0-9_/-])(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gi, '<sha>')
    // Strip numeric values (integers, floats, scientific notation, signed numbers).
    .replace(/(?<![a-zA-Z0-9_])[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 12-character lowercase hex SHA-1 digest of a normalized shape. */
export function fingerprint(shape) {
  return createHash('sha1').update(String(shape)).digest('hex').slice(0, 12);
}

// Extract the check script name from a `##[group]Run ...` command line.
function parseCheckFromRun(cmd) {
  const c = cmd.trim();
  if (/^(?:actions\/|npm ci\b|npm install\b|npx playwright\b|command -v\b|echo\b|test\b)/.test(c)) return null;
  if (/\bscripts\/checks\.mjs\b/.test(c)) return null;
  if (/\bscripts\/chromiumlibs\.mjs\b/.test(c)) return null;
  if (/^npm run build\b/.test(c)) return 'build';
  const script = c.match(/\bscripts\/([A-Za-z0-9_.-]+)\.(?:mjs|js|ts|sh)\b/);
  if (script) return script[1];
  const npm = c.match(/\bnpm run (?:-s |--silent )?([A-Za-z0-9_.:-]+)/);
  if (npm) return npm[1];
  return null;
}

const isExitWrapperShape = (shape) => /^##\[error\].*?: exit #$/.test(shape);

/**
 * Group failure lines in a raw job log or `gh run view --log-failed` output.
 * Returns `[{ fp, shape, check, job, looks, liquids, count, sample, lines }]`.
 */
export function groupFailures(log, { check = null, job = null } = {}) {
  const rawLines = String(log ?? '').split('\n');
  let currentCheck = check;
  let currentJob = job;

  // First pass: collect failure records tagged by step context, and track
  // quarantined FAIL prefixes per (job, check) so quarantined checks don't
  // report as failures when checks.mjs suppresses them.
  const records = [];
  const quarantinedPrefixes = new Map(); // stepKey -> Set<string>
  const quarantinedAll = new Set(); // stepKey where checks.mjs printed `on quarantined lines only`

  for (const raw of rawLines) {
    const { job: lineJob, text } = splitLogPrefix(raw);
    const activeJob = lineJob || currentJob || job || null;
    if (lineJob) currentJob = lineJob;
    const trimmed = text.trim();

    if (trimmed.startsWith('##[group]Run ')) {
      const detected = parseCheckFromRun(trimmed.slice('##[group]Run '.length));
      if (detected) currentCheck = detected;
      else if (/\bscripts\/checks\.mjs\b/.test(trimmed)) currentCheck = check;
      continue;
    }
    const harness = trimmed.match(/^> node (?:--\S+\s+)*scripts\/([A-Za-z0-9_.-]+)\.(?:mjs|js|ts)\b/);
    if (harness) {
      currentCheck = harness[1];
      continue;
    }

    const activeCheck = currentCheck ?? check ?? null;
    const stepKey = `${activeJob ?? ''}\0${activeCheck ?? ''}`;

    if (/^⚠(?:\s|$)/.test(trimmed)) {
      if (/\bon quarantined lines only\b/.test(trimmed)) quarantinedAll.add(stepKey);
      const qm = trimmed.match(/^⚠\s+(FAIL\b.*?)\s+\[quarantined for [^\]]+\]$/);
      if (qm) {
        if (!quarantinedPrefixes.has(stepKey)) quarantinedPrefixes.set(stepKey, new Set());
        const qShape = failureShape(qm[1]);
        if (qShape) quarantinedPrefixes.get(stepKey).add(qShape);
      }
      continue;
    }

    const shape = failureShape(raw);
    if (!shape) continue;

    const cleanLine = trimmed.replace(/^(?:[✗×]\s+)?(?=FAIL\b)/, '');
    const { looks, liquids } = extractEntities(cleanLine);
    records.push({
      stepKey,
      job: activeJob,
      check: activeCheck,
      shape,
      rawLine: cleanLine,
      isExitWrapper: isExitWrapperShape(shape),
      looks,
      liquids,
    });
  }

  // Filter out quarantined FAIL lines and redundant `##[error]<cmd>: exit 1`
  // wrappers when the same check already produced concrete FAIL / Error lines.
  const hasRealFailure = new Set();
  const kept = [];
  for (const r of records) {
    if (quarantinedAll.has(r.stepKey) && r.shape.startsWith('FAIL')) continue;
    const qSet = quarantinedPrefixes.get(r.stepKey);
    if (qSet && qSet.has(r.shape)) continue;
    if (!r.isExitWrapper) hasRealFailure.add(r.stepKey);
    kept.push(r);
  }

  const groups = new Map();
  for (const r of kept) {
    if (r.isExitWrapper && hasRealFailure.has(r.stepKey)) continue;
    const hasContext = Boolean(r.check || r.job || r.looks.length || r.liquids.length);
    const fp = hasContext
      ? fingerprint([r.check ?? '', r.job ?? '', r.shape, ...r.looks, ...r.liquids].join('\0'))
      : fingerprint(r.shape);

    let g = groups.get(fp);
    if (!g) {
      g = {
        fp,
        shape: r.shape,
        check: r.check,
        job: r.job,
        looks: r.looks,
        liquids: r.liquids,
        count: 0,
        sample: r.rawLine,
        lines: [],
        _seenLines: new Set(),
      };
      groups.set(fp, g);
    }
    g.count++;
    if (!g._seenLines.has(r.rawLine)) {
      g._seenLines.add(r.rawLine);
      g.lines.push(r.rawLine);
    }
  }

  return [...groups.values()].map(({ _seenLines, ...rest }) => rest);
}

// --- GitHub API helpers (gh CLI first, ghCurl fallback, token-safe) ----------

async function ghApi(path, { repo = DEFAULT_REPO, raw = false } = {}) {
  const endpoint = path.startsWith('repos/') ? path : `repos/${repo}/${path}`;
  try {
    const args = ['api', endpoint];
    if (!raw) args.push('--paginate');
    const { stdout } = await execFileAsync('gh', args, { maxBuffer: 64 << 20 });
    return raw ? stdout : JSON.parse(stdout);
  } catch (e) {
    // Fallback to ghCurl (useful in environments without gh CLI).
    const url = `https://api.github.com/${endpoint}`;
    try {
      const text = await ghCurl(url);
      return raw ? text : JSON.parse(text);
    } catch (ce) {
      throw new Error(redact(`GitHub API failed for ${endpoint}: ${ce.message || e.message}`));
    }
  }
}

async function fetchRun(runId, repo = DEFAULT_REPO) {
  return ghApi(`actions/runs/${runId}`, { repo, raw: false });
}

async function fetchRunJobs(runId, repo = DEFAULT_REPO) {
  const jobs = [];
  for (let page = 1; ; page++) {
    const res = await ghApi(`actions/runs/${runId}/jobs?per_page=100&filter=latest&page=${page}`, { repo });
    const list = res.jobs ?? [];
    jobs.push(...list);
    if (list.length < 100) break;
  }
  return jobs;
}

async function fetchJobLog(jobId, repo = DEFAULT_REPO) {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = join(CACHE_DIR, `job-${jobId}.txt`);
  if (existsSync(cacheFile)) return readFileSync(cacheFile, 'utf8');
  const text = await ghApi(`actions/jobs/${jobId}/logs`, { repo, raw: true });
  writeFileSync(cacheFile, text);
  return text;
}

async function pool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

async function groupsForRun(runId, repo = DEFAULT_REPO) {
  const [run, jobs] = await Promise.all([fetchRun(runId, repo), fetchRunJobs(runId, repo)]);
  const failedJobs = jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'timed_out');
  const perJob = await pool(failedJobs, 6, async (job) => {
    const log = await fetchJobLog(job.id, repo);
    return groupFailures(log, { job: job.name });
  });
  const merged = new Map();
  for (const list of perJob) {
    for (const g of list) {
      const existing = merged.get(g.fp);
      if (!existing) {
        merged.set(g.fp, { ...g, lines: [...g.lines] });
      } else {
        existing.count += g.count;
        for (const l of g.lines) if (!existing.lines.includes(l)) existing.lines.push(l);
      }
    }
  }
  return { run, failedJobs, groups: [...merged.values()] };
}

function resolveCommitLocally(sha) {
  try {
    const full = execFileSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    const ts = execFileSync('git', ['show', '-s', '--format=%cI', full], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    return { sha: full, createdAt: ts };
  } catch {
    return null;
  }
}

async function resolveSinceCommit(sha, repo = DEFAULT_REPO) {
  const local = resolveCommitLocally(sha);
  if (local) return local;
  const c = await ghApi(`commits/${sha}`, { repo });
  return { sha: c.sha, createdAt: c.commit?.committer?.date ?? c.commit?.author?.date };
}

async function fetchMainDeploysSince(sinceDate, untilDate, repo = DEFAULT_REPO) {
  // Start slightly before commit timestamp in case commit/deploy timestamps skew.
  const startIso = new Date(Date.parse(sinceDate) - 10 * 60_000).toISOString();
  const created = untilDate ? `${startIso}..${untilDate}` : `>=${startIso}`;
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const res = await ghApi(`actions/workflows/deploy.yml/runs?branch=main&per_page=100&page=${page}&created=${encodeURIComponent(created)}`, { repo });
    const list = res.workflow_runs ?? [];
    runs.push(...list);
    if (list.length < 100) break;
  }
  return runs
    .filter((r) => r.status === 'completed' && r.conclusion !== 'cancelled')
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

async function attachFirstRed(groups, sinceSha, untilRun = null, repo = DEFAULT_REPO) {
  const since = await resolveSinceCommit(sinceSha, repo);
  const deploys = await fetchMainDeploysSince(since.createdAt, untilRun?.created_at ?? null, repo);

  // Also include the deploy whose head_sha matches since.sha if it started slightly earlier.
  let filtered = deploys.filter((r) => Date.parse(r.created_at) >= Date.parse(since.createdAt) || r.head_sha === since.sha);
  if (filtered.length === 0) {
    const exact = await ghApi(`actions/workflows/deploy.yml/runs?branch=main&head_sha=${since.sha}`, { repo });
    filtered = (exact.workflow_runs ?? []).filter((r) => r.status === 'completed' && r.conclusion !== 'cancelled');
  }
  if (untilRun && !filtered.some((r) => r.id === untilRun.id)) {
    filtered.push(untilRun);
    filtered.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }

  const wanted = new Set(groups.map((g) => g.fp));
  const firstByFp = new Map();

  for (const deploy of filtered) {
    if (deploy.conclusion === 'success') continue;
    const { groups: dGroups } = untilRun && deploy.id === untilRun.id
      ? { groups }
      : await groupsForRun(deploy.id, repo);
    for (const g of dGroups) {
      if (!wanted.has(g.fp) || firstByFp.has(g.fp)) continue;
      firstByFp.set(g.fp, {
        sha: deploy.head_sha,
        shortSha: deploy.head_sha.slice(0, 7),
        runId: deploy.id,
        runNumber: deploy.run_number,
        createdAt: deploy.created_at,
        atSince: deploy.head_sha === since.sha,
      });
    }
    if (firstByFp.size === wanted.size) break;
  }

  return {
    since,
    deploysChecked: filtered.length,
    groups: groups.map((g) => ({ ...g, firstRed: firstByFp.get(g.fp) ?? null })),
  };
}

function formatBlocks(groups, header = null) {
  const out = [];
  if (header) out.push(header, '');
  if (groups.length === 0) {
    out.push('no failure lines found');
    return out.join('\n');
  }
  for (const g of groups) {
    const meta = [];
    if (g.check) meta.push(`check=${g.check}`);
    if (g.job) meta.push(`job=${g.job}`);
    if (g.looks?.length) meta.push(`looks=${g.looks.join(',')}`);
    if (g.liquids?.length) meta.push(`liquids=${g.liquids.join(',')}`);
    if (g.firstRed) {
      const fr = g.firstRed;
      meta.push(`first_red=${fr.shortSha} (deploy #${fr.runNumber}, run ${fr.runId}${fr.atSince ? ', already red at --since' : ''})`);
    }
    out.push(`[${g.fp}] (${g.count}x) ${meta.join('  ')}`.trim());
    for (const line of g.lines ?? [g.sample]) out.push(`  ${line}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

// --- Self-test (run via `--selftest`) --------------------------------------

function selftest() {
  let failed = 0;
  const t = (ok, msg, detail = '') => {
    console.log(`${ok ? ' ok  ' : ' FAIL'} ${msg}${!ok && detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
  };

  // Non-failures must return null (50j-1 & 50j-2).
  const nonFailures = [
    'Mac app\tBuild\t2026-11-27T10:00:00Z   fail-on-cache-miss: false',
    'Mac app\tBuild\t2026-11-27T10:00:00Z   echo "Mac build failed"',
    'Measure · logic\tUNKNOWN STEP\t2026-11-27T10:00:00Z # FAIL comment line',
    'Measure · logic\tUNKNOWN STEP\t2026-11-27T10:00:00Z  ok   a check that fails a mutant passes',
    'Measure · logic\tUNKNOWN STEP\t2026-11-27T10:00:00Z ##[warning]FAIL quarantined line',
    'Measure · logic\tUNKNOWN STEP\t2026-11-27T10:00:00Z     ⚠ FAIL quarantined [quarantined for 22s-1 until 2026-12-06]',
    'Measure · logic\tUNKNOWN STEP\t2026-11-27T10:00:00Z ##[error]Process completed with exit code 1.',
  ];
  t(nonFailures.every((l) => failureShape(l) === null), 'non-failure lines (inputs, echo, comments, ok, quarantined, Process completed) return null');

  // Two runs of one failure with different times, shas, paths, and numbers -> 1 fingerprint.
  const runA = [
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:45:01.100Z ##[group]Run ' + ['npm', 'run', 'rowfade'].join(' '),
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:45:03.220Z  FAIL a Back fades to the look at aabb112 in /tmp/cg-101/run — 12.4 ms vs 8.0 ms',
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:45:03.240Z     ✗ FAIL a Back fades to the look at aabb112 in /tmp/cg-101/run — 12.4 ms vs 8.0 ms',
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:45:03.250Z ##[error]' + ['npm', 'run', 'rowfade: exit 1'].join(' '),
    'Checks / Measure · logic\tRun checks\tFAIL a Back fades to the look at aabb112 in /tmp/cg-101/run — 12.4 ms vs 8.0 ms',
  ].join('\n');

  const runB = [
    'Checks / Measure · logic\tRun checks\t2026-11-27T02:11:09.900Z ##[group]Run ' + ['npm', 'run', 'rowfade'].join(' '),
    'Checks / Measure · logic\tRun checks\t2026-11-27T02:11:15.440Z  FAIL a Back fades to the look at ccdd334 in /tmp/cg-999/run — 19.8 ms vs 8.0 ms',
    'Checks / Measure · logic\tRun checks\t2026-11-27T02:11:15.450Z ##[error]' + ['npm', 'run', 'rowfade: exit 1'].join(' '),
  ].join('\n');

  const ga = groupFailures(runA);
  const gb = groupFailures(runB);
  const gBoth = groupFailures(`${runA}\n${runB}`);
  t(ga.length === 1 && gb.length === 1 && gBoth.length === 1, 'two runs of the same failure collapse to one fingerprint', `${ga.length}, ${gb.length}, ${gBoth.length}`);
  t(/^[0-9a-f]{12}$/.test(ga[0].fp), 'fingerprint is 12 lowercase hex chars', ga[0].fp);
  t(ga[0].fp === gb[0].fp, 'identical failure across runs produces equal fingerprint', `${ga[0].fp} vs ${gb[0].fp}`);

  // Two different failures -> 2 fingerprints.
  const two = groupFailures([
    runA,
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:46:00.000Z ##[group]Run ' + ['npm', 'run', 'backplate'].join(' '),
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:46:01.000Z  FAIL App sends the look a Go would send — 2 of 3',
    'Checks / Measure · logic\tRun checks\t2026-11-26T19:46:01.050Z ##[error]' + ['npm', 'run', 'backplate: exit 1'].join(' '),
  ].join('\n'));
  t(two.length === 2 && two[0].fp !== two[1].fp, 'two different failures produce two fingerprints', `${two.length}`);

  // Look and liquid extraction.
  const ent = extractEntities('FAIL flat /looks/velvet-underground.webp 11.4 and glycerine vs clear water');
  t(ent.looks.includes('velvet-underground') && ent.liquids.includes('glycerine') && ent.liquids.includes('water'),
    'extractEntities captures looks and liquids', JSON.stringify(ent));

  // Quarantined check inside a shard log does not emit a failure group.
  const qLog = [
    '2026-11-26T20:00:44.0670820Z ##[group]Run node scripts/flick.mjs',
    '2026-11-26T20:01:00.6376930Z  FAIL a flick on water: the liquid trails the glass — 1.826 rad/s',
    '2026-11-26T20:01:04.5000000Z ##[endgroup]',
    '2026-11-26T20:01:04.5050000Z ⚠ The dish turned by a flick, red after 20 s on quarantined lines only (exit 1)',
    '2026-11-26T20:01:04.5100310Z     ⚠ FAIL a flick on water: the liquid trails the glass — 1.826 rad/s [quarantined for 22s-1 until 2026-12-06]',
  ].join('\n');
  t(groupFailures(qLog, { job: 'fifth' }).length === 0, 'quarantined check produces 0 failure groups');

  console.log(failed ? `\n${failed} FAIL` : '\nall ok');
  process.exit(failed ? 1 : 0);
}

// --- CLI --------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--selftest')) { selftest(); return; }

  const json = argv.includes('--json');
  const argVal = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : null;
  };
  const runId = argVal('--run');
  const sinceSha = argVal('--since');
  const repo = argVal('--repo') || DEFAULT_REPO;

  if (runId) {
    const { run, failedJobs, groups } = await groupsForRun(runId, repo);
    let finalGroups = groups;
    let sinceInfo = null;
    if (sinceSha) {
      const res = await attachFirstRed(groups, sinceSha, run, repo);
      finalGroups = res.groups;
      sinceInfo = { sha: res.since.sha, deploysChecked: res.deploysChecked };
    }
    if (json) {
      console.log(JSON.stringify({
        run: { id: run.id, runNumber: run.run_number, headSha: run.head_sha, conclusion: run.conclusion, createdAt: run.created_at },
        failedJobs: failedJobs.map((j) => ({ id: j.id, name: j.name, conclusion: j.conclusion })),
        ...(sinceInfo ? { since: sinceInfo } : {}),
        groups: finalGroups,
      }, null, 2));
    } else {
      const totalLines = finalGroups.reduce((s, g) => s + g.count, 0);
      const header = `run ${run.id} (deploy/run #${run.run_number ?? '?'}, ${run.head_sha.slice(0, 7)}, ${run.created_at}): ${failedJobs.length} failed jobs, ${finalGroups.length} groups (${totalLines} red lines)${sinceInfo ? `, since ${sinceInfo.sha.slice(0, 7)}` : ''}`;
      console.log(formatBlocks(finalGroups, header));
    }
    return;
  }

  if (sinceSha) {
    const since = await resolveSinceCommit(sinceSha, repo);
    const deploys = await fetchMainDeploysSince(since.createdAt, null, repo);
    const failedDeploys = deploys.filter((d) => d.conclusion === 'failure');
    if (failedDeploys.length === 0) {
      console.log(json ? JSON.stringify({ since: since.sha, groups: [] }, null, 2) : `no failed deploys since ${since.sha.slice(0, 7)}`);
      return;
    }
    const latest = failedDeploys.at(-1);
    const { groups } = await groupsForRun(latest.id, repo);
    const res = await attachFirstRed(groups, sinceSha, latest, repo);
    if (json) {
      console.log(JSON.stringify({
        since: { sha: res.since.sha, deploysChecked: res.deploysChecked },
        latestRun: { id: latest.id, runNumber: latest.run_number, headSha: latest.head_sha, createdAt: latest.created_at },
        groups: res.groups,
      }, null, 2));
    } else {
      const header = `latest failed deploy #${latest.run_number} (${latest.head_sha.slice(0, 7)}, run ${latest.id}), since ${res.since.sha.slice(0, 7)}: ${res.groups.length} groups`;
      console.log(formatBlocks(res.groups, header));
    }
    return;
  }

  // File / stdin mode (50j-2 foreman interface).
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') continue;
    if (argv[i] === '--repo') { i++; continue; }
    files.push(argv[i]);
  }
  const input = files.length
    ? files.map((f) => readFileSync(f, 'utf8')).join('\n')
    : readFileSync(0, 'utf8');
  const groups = groupFailures(input);
  if (json) console.log(JSON.stringify(groups, null, 2));
  else console.log(formatBlocks(groups));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
