// Daily agent workflow scorecard from git and the GitHub API (PLAN.md 50m / brief 50k).
//
//   npm run scorecard -- --since 2026-11-20
//   npm run scorecard -- --since 2026-11-20 --until 2026-11-27
//   npm run scorecard -- --since 2026-11-20 --json
//   node scripts/scorecard.mjs --selftest
//
// Prints per day (Pacific time by default, at most five lines a day):
//   1. Merged PRs by side (`antigravity/` or `claude/`, plus `other` if any).
//   2. Escapes: revert commits on `main`, or merged PRs whose title or body
//      says they fix something an earlier merged PR broke, naming that PR.
//   3. The gap in hours between green "Build and deploy" jobs of deploy.yml.
//
// Privacy: the repository is public, so output prints sides and PR numbers
// only (never names, emails, PR titles, bodies, or account figures).
// Never fails CI: not in checks.json; exits 0 on any valid scorecard run.

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { ghCurl, redact } from './ghapi.mjs';

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
const DEFAULT_TZ = 'America/Los_Angeles';
const MAX_LINES_PER_DAY = 5;

export function dayOf(isoOrMs, tz = DEFAULT_TZ) {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(String(isoOrMs));
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function addDays(dateStr, deltaDays) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${dateStr}`);
  return new Date(ms + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

export function dateRange(since, until) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error(`Expected YYYY-MM-DD dates, got ${since}..${until}`);
  }
  if (since > until) throw new Error(`--since (${since}) is after --until (${until})`);
  const out = [];
  for (let d = since; d <= until; d = addDays(d, 1)) out.push(d);
  return out;
}

export function classifySide(headRefName) {
  const ref = String(headRefName ?? '');
  if (ref.startsWith('antigravity/')) return 'antigravity';
  if (ref.startsWith('claude/')) return 'claude';
  return 'other';
}

// ─── Git revert detection ──────────────────────────────────────────────────

// Match commits on main whose subject explicitly says revert (not "never reverts")
// or whose own body opens with git's "This reverts commit ..." trailer (not
// buried inside a squash-merge bullet list of branch-local commits).
const REVERT_SUBJECT = /\brevert(?:s|ed|ing)?\b/i;
const NEGATED_REVERT = /\b(?:no|not|never|don't|do not|without)\s+revert(?:s|ed|ing)?\b/i;
const REVERT_TRAILER = /^This reverts commit [0-9a-f]{7,40}\b/i;

export function isRevertCommit({ subject = '', body = '' }) {
  const firstPara = String(body ?? '').trim().split(/\n\s*\n/)[0] ?? '';
  if (REVERT_TRAILER.test(firstPara)) return true;
  if (REVERT_SUBJECT.test(subject) && !NEGATED_REVERT.test(subject)) return true;
  return false;
}

export function parseRevertCommit(commit) {
  if (!isRevertCommit(commit)) return null;
  const subjPr = commit.subject.match(/\(#(\d+)\)\s*$/);
  const pr = subjPr ? Number(subjPr[1]) : null;
  const targets = [...new Set(
    [...`${commit.subject}\n${commit.body}`.matchAll(/#(\d+)\b/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n > 0 && n !== pr),
  )];
  return {
    kind: 'revert',
    commit: String(commit.sha || '').slice(0, 7),
    ...(pr ? { pr } : {}),
    ...(targets.length ? { brokePrs: targets } : {}),
  };
}

// ─── Merged PR escape detection ────────────────────────────────────────────

// Strip HTML comments, fenced code blocks, and receipt/control/log sections so
// quoted FAIL output or mutant descriptions never look like an escape claim.
export function stripNonNarrativeSections(body) {
  const clean = String(body ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '');
  const out = [];
  let skipping = false;
  let lastWasBlank = false;
  for (const raw of clean.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) {
      lastWasBlank = true;
      if (!skipping) out.push('');
      continue;
    }
    const label = trimmed.replace(/^#+\s*/, '').replace(/^[-*+]\s+/, '').replace(/\*\*/g, '').replace(/__/g, '');
    if (/^(Measured|Controls|Check changes|Failed|Left)\s*:/i.test(label)) {
      skipping = true;
      lastWasBlank = false;
      continue;
    }
    const startsNewSection = /^#+\s/.test(trimmed)
      || (lastWasBlank && !/^[-*+]\s/.test(trimmed) && /^[A-Z][\w /-]{0,30}:(\s|$)/.test(label))
      || (/^(Plan item|Done|Review owed)\s*:/i.test(label));
    if (skipping && startsNewSection) skipping = false;
    lastWasBlank = false;
    if (!skipping) out.push(raw);
  }
  return out.join('\n');
}

// Signals that the PR fixes something broken, regressed, or red on main.
const FIX_CLAIM = new RegExp([
  '\\bfix(?:es|ed)?\\s+(?:main|regressions?|what\\s+#\\d+\\s+broke|[^.\\n]*?\\b(?:broke|broken|red))\\b',
  '\\bmain(?:\'s)?\\s+(?:post-deploy\\s+|deploy(?:\\s+checks?)?|slow\\s+checks?|checks?|typecheck|build|reds?)\\b[^.\\n]*?\\b(?:red|reds|went\\s+red|failed|broke|broken|refused|repair|after|since|bisected)\\b',
  '\\b(?:went\\s+red|red\\s+on\\s+main|refused\\s+on\\s+main|failed\\s+on\\s+(?:main|every\\s+build)|never\\s+held|bisected\\s+to|culprit|repair\\s+on\\s+main|caught\\s+this)\\b',
  '\\b(?:broke|broken|regress(?:ion|ed|es)?)\\b',
  '\\b(?:sees\\s+again\\s+after|show\\s+[^.\\n]{1,40}\\s+again|no\\s+longer\\s+(?:switches|loses|drops|breaks)|restore\\b)',
].join('|'), 'i');

// Causal or break/fix cue within a sentence or paragraph naming an earlier PR.
const CAUSAL_CUE = /\b(after|since|bisected(?:\s+to)?|culprit|caused\s+by|introduced\s+by|broke|broken|regression|regress(?:ed)?|went\s+red|red|reds|removed|retired|unhooked|dropped|added|put|caught|repair|fixes?|fixed|undo|never\s+held|from)\b/i;

const NON_ESCAPE_PREFIX = /\b(?:carries|carry|rebase[sd]?|merges?\s+after|should\s+merge\s+after|depends?\s+on|until|waits?\s+(?:on|for)|matching|from\s+before|supersedes?|follow-?up\s+to|put\s+up\s+by|built\s+on|already\s+fixed\s+(?:in|by)|with)\s*$/i;

export function candidatePrRefs(pr) {
  const body = stripNonNarrativeSections(pr.body);
  const full = `${pr.title ?? ''}\n${body}`;
  const refs = new Set();
  for (const m of full.matchAll(/#(\d+)\b/g)) {
    const n = Number(m[1]);
    if (n > 0 && n < pr.number) refs.add(n);
  }
  return [...refs];
}

// `earlierMergedByNum`: Map<number, { number, mergedAt }> of merged PRs.
export function detectPrEscape(pr, earlierMergedByNum) {
  const body = stripNonNarrativeSections(pr.body);
  const titleHasFix = FIX_CLAIM.test(pr.title ?? '');
  const prMergedMs = Date.parse(pr.mergedAt);
  const broke = new Set();
  const paragraphs = body.split(/\n\s*\n/);
  const units = [
    { text: pr.title ?? '', isTitle: true, scopeHasFix: titleHasFix },
  ];
  for (const para of paragraphs) {
    const scopeHasFix = titleHasFix || FIX_CLAIM.test(para);
    if (!scopeHasFix) continue;
    for (const sent of para.split(/(?<=[.!?])\s+|\n+/)) {
      if (sent.trim()) units.push({ text: sent, isTitle: false, scopeHasFix });
    }
  }

  for (const u of units) {
    if (!u.scopeHasFix) continue;
    if (!u.isTitle && !CAUSAL_CUE.test(u.text)) continue;
    for (const m of u.text.matchAll(/#(\d+)\b/g)) {
      const n = Number(m[1]);
      if (n <= 0 || n >= pr.number) continue;
      const target = earlierMergedByNum.get(n);
      if (!target || !target.mergedAt) continue;
      if (Date.parse(target.mergedAt) >= prMergedMs) continue;

      const before = u.text.slice(Math.max(0, m.index - 40), m.index);
      const after = u.text.slice(m.index, m.index + 40);
      if (NON_ESCAPE_PREFIX.test(before)) continue;
      if (/^#\d+\s+merges?\b/i.test(after)) continue;
      if (/^#\d+'s\s+(?:flower\s+)?fix\b/i.test(after)) continue;
      if (/\b(?:shipped\s+in|closed\s+in|written\s+in|planned\s+in)\s*$/i.test(before) && !/repair/i.test(u.text)) continue;
      if (/\b(?:already|previously)\s+fixed\b/i.test(u.text) && !/repair|fixes\s+main/i.test(u.text)) continue;

      broke.add(n);
    }
  }

  if (broke.size === 0) return null;
  return {
    kind: 'pr',
    pr: pr.number,
    side: classifySide(pr.headRefName),
    brokePrs: [...broke].sort((a, b) => a - b),
  };
}

// ─── Deploy gap calculation ────────────────────────────────────────────────

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round2 = (n) => Math.round(n * 100) / 100;

export function computeDeployStats(greenDeploys, days, tz = DEFAULT_TZ) {
  const sorted = [...greenDeploys]
    .map((d) => ({ ...d, ms: Date.parse(d.at) }))
    .filter((d) => !Number.isNaN(d.ms))
    .sort((a, b) => a.ms - b.ms);

  // Deduplicate by runId if present.
  const unique = [];
  const seen = new Set();
  for (const d of sorted) {
    if (d.runId && seen.has(d.runId)) continue;
    if (d.runId) seen.add(d.runId);
    unique.push(d);
  }

  const byDay = new Map(days.map((d) => [d, { count: 0, gapsHours: [] }]));
  for (let i = 0; i < unique.length; i++) {
    const cur = unique[i];
    const day = dayOf(cur.ms, tz);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket.count++;
    if (i > 0) {
      const gap = round2((cur.ms - unique[i - 1].ms) / 3_600_000);
      bucket.gapsHours.push(gap);
    }
  }

  const out = new Map();
  for (const [day, b] of byDay) {
    const g = b.gapsHours;
    out.set(day, {
      count: b.count,
      gapsHours: g,
      minGapHours: g.length ? round2(Math.min(...g)) : null,
      medianGapHours: g.length ? round2(median(g)) : null,
      maxGapHours: g.length ? round2(Math.max(...g)) : null,
    });
  }
  return out;
}

// ─── Formatting (<= 5 lines per day, no names/emails/account figures) ──────

function formatEscapeToken(e) {
  if (e.kind === 'revert') {
    const head = e.pr ? `revert #${e.pr}` : `revert ${e.commit}`;
    return e.brokePrs?.length ? `${head}<-${e.brokePrs.map((n) => `#${n}`).join('+')}` : head;
  }
  return `#${e.pr}<-${e.brokePrs.map((n) => `#${n}`).join('+')}`;
}

export function formatDayLines(entry) {
  const { date, merged, escapes, deploys } = entry;
  const parts = [`antigravity/ ${merged.antigravity}`, `claude/ ${merged.claude}`];
  if (merged.other > 0) parts.push(`other ${merged.other}`);
  const mergedLine = `  merged: ${parts.join(', ')} (${merged.total} total)`;

  let escapeLine;
  if (!escapes.length) {
    escapeLine = '  escapes: 0';
  } else {
    const tokens = escapes.map(formatEscapeToken);
    let list = tokens.join(', ');
    if (list.length > 140) {
      const kept = [];
      let len = 0;
      for (const tok of tokens) {
        if (len + tok.length + 2 > 120 && kept.length > 0) break;
        kept.push(tok);
        len += tok.length + 2;
      }
      const rest = tokens.length - kept.length;
      list = rest > 0 ? `${kept.join(', ')}, +${rest} more` : kept.join(', ');
    }
    escapeLine = `  escapes: ${escapes.length} (${list})`;
  }

  let deployLine;
  if (deploys.count === 0) {
    deployLine = '  deploys: 0 green Build and deploy';
  } else if (deploys.gapsHours.length === 0) {
    deployLine = `  deploys: ${deploys.count} green Build and deploy (no prior deploy in window)`;
  } else {
    const fmt = (h) => `${h < 1 ? h.toFixed(2) : h.toFixed(1)}h`;
    deployLine = `  deploys: ${deploys.count} green Build and deploy; gap min ${fmt(deploys.minGapHours)}, median ${fmt(deploys.medianGapHours)}, max ${fmt(deploys.maxGapHours)}`;
  }

  const lines = [date, mergedLine, escapeLine, deployLine];
  if (lines.length > MAX_LINES_PER_DAY) {
    throw new Error(`Day ${date} exceeded ${MAX_LINES_PER_DAY} lines`);
  }
  return lines;
}

// ─── Git & GitHub API queries ──────────────────────────────────────────────

function resolveMainRef() {
  for (const ref of ['origin/main', 'refs/heads/main', 'HEAD']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', ref], { stdio: 'ignore' });
      return ref;
    } catch {
      // try next ref
    }
  }
  return 'HEAD';
}

function readMainCommits(sinceDate) {
  const ref = resolveMainRef();
  const raw = execFileSync(
    'git',
    ['log', '--first-parent', ref, `--since=${addDays(sinceDate, -1)}`, '--format=%H%x1f%cI%x1f%s%x1f%b%x1e'],
    { encoding: 'utf8', maxBuffer: 64 << 20 },
  );
  const commits = [];
  for (const rec of raw.split('\x1e')) {
    const trimmed = rec.trim();
    if (!trimmed) continue;
    const [sha = '', date = '', subject = '', body = ''] = trimmed.split('\x1f');
    commits.push({ sha, date, subject, body });
  }
  return commits;
}

async function ghApi(args) {
  try {
    const { stdout } = await execFileAsync('gh', ['api', ...args], { maxBuffer: 64 << 20 });
    return JSON.parse(stdout);
  } catch (err) {
    throw new Error(redact(err?.stderr || err?.message || String(err)));
  }
}

async function ghGet(path) {
  try {
    return await ghApi([path]);
  } catch {
    // Fallback for environments without `gh` CLI (public repo read via curl).
    const body = await ghCurl(`https://api.github.com/${path}`);
    return JSON.parse(body);
  }
}

const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number
        title
        body
        mergedAt
        headRefName
      }
    }
  }
}`;

async function fetchMergedPrsRange(repo, startDay, endDay) {
  const q = `repo:${repo} is:pr is:merged merged:${startDay}..${endDay}`;
  const first = await ghApi(['graphql', '-f', `query=${SEARCH_QUERY}`, '-f', `q=${q}`]);
  const s = first?.data?.search;
  if (!s) throw new Error('Unexpected GraphQL response for merged PR search');

  // GitHub search caps at 1,000 results; bisect multi-day windows if near cap.
  if (s.issueCount > 900 && startDay < endDay) {
    const startMs = Date.parse(`${startDay}T00:00:00Z`);
    const endMs = Date.parse(`${endDay}T00:00:00Z`);
    const midDay = new Date(Math.floor((startMs + endMs) / 2)).toISOString().slice(0, 10);
    if (midDay >= startDay && midDay < endDay) {
      const [left, right] = await Promise.all([
        fetchMergedPrsRange(repo, startDay, midDay),
        fetchMergedPrsRange(repo, addDays(midDay, 1), endDay),
      ]);
      const byNum = new Map();
      for (const p of [...left, ...right]) byNum.set(p.number, p);
      return [...byNum.values()];
    }
  }

  const out = [...(s.nodes || []).filter((n) => n && n.number)];
  let pageInfo = s.pageInfo;
  while (pageInfo?.hasNextPage) {
    const next = await ghApi([
      'graphql',
      '-f', `query=${SEARCH_QUERY}`,
      '-f', `q=${q}`,
      '-f', `after=${pageInfo.endCursor}`,
    ]);
    const ns = next?.data?.search;
    if (!ns) break;
    out.push(...(ns.nodes || []).filter((n) => n && n.number));
    pageInfo = ns.pageInfo;
  }
  return out;
}

async function fetchReferencedPrs(repo, numbers) {
  const map = new Map();
  if (!numbers.length) return map;
  const [owner, name] = repo.split('/');
  for (let i = 0; i < numbers.length; i += 50) {
    const chunk = numbers.slice(i, i + 50);
    const fields = chunk.map((n) => `p${n}: pullRequest(number: ${n}) { number mergedAt }`).join('\n');
    const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`;
    try {
      const res = await ghApi(['graphql', '-f', `query=${query}`, '-f', `owner=${owner}`, '-f', `name=${name}`]);
      const repoObj = res?.data?.repository || {};
      for (const n of chunk) {
        const pr = repoObj[`p${n}`];
        if (pr && pr.mergedAt) map.set(pr.number, pr);
      }
    } catch {
      // If a number is an issue or non-existent, fall back individually or ignore.
    }
  }
  return map;
}

async function ghGraphql(query, variables = {}) {
  try {
    const payload = JSON.stringify({ query, variables });
    const { stdout } = await new Promise((resolve, reject) => {
      const child = execFile(
        'gh',
        ['api', 'graphql', '--input', '-'],
        { maxBuffer: 64 << 20 },
        (err, stdoutOut, stderrOut) => {
          if (err) {
            err.stderr = stderrOut;
            reject(err);
          } else {
            resolve({ stdout: stdoutOut });
          }
        },
      );
      child.stdin.end(payload);
    });
    const parsed = JSON.parse(stdout);
    if (parsed.errors?.length && !parsed.data) {
      throw new Error(parsed.errors.map((e) => e.message).join('; '));
    }
    return parsed;
  } catch (err) {
    throw new Error(redact(err?.stderr || err?.message || String(err)));
  }
}

async function fetchGreenDeploys(repo, lookbackDay) {
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const j = await ghGet(
      `repos/${repo}/actions/workflows/deploy.yml/runs?per_page=100&page=${page}&created=${encodeURIComponent(`>=${lookbackDay}`)}`,
    );
    const list = j.workflow_runs || [];
    runs.push(...list);
    if (list.length < 100) break;
  }

  const active = runs.filter((r) => r.status !== 'queued');
  const withSuite = active.filter((r) => r.check_suite_node_id);
  const withoutSuite = active.filter((r) => !r.check_suite_node_id);

  const suiteQuery = `query($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on CheckSuite {
        id
        checkRuns(first: 50) {
          pageInfo { hasNextPage }
          nodes { name conclusion startedAt completedAt }
        }
      }
    }
  }`;

  const green = [];
  const needRest = [...withoutSuite];

  for (let i = 0; i < withSuite.length; i += 50) {
    const chunk = withSuite.slice(i, i + 50);
    const res = await ghGraphql(suiteQuery, { ids: chunk.map((r) => r.check_suite_node_id) });
    const byId = new Map();
    for (const n of res?.data?.nodes || []) if (n?.id) byId.set(n.id, n);
    for (const r of chunk) {
      const suite = byId.get(r.check_suite_node_id);
      if (!suite?.checkRuns) {
        needRest.push(r);
        continue;
      }
      const bd = (suite.checkRuns.nodes || []).find((c) => c?.name === 'Build and deploy');
      if (bd) {
        if (bd.conclusion === 'SUCCESS') {
          green.push({ runId: r.id, at: bd.completedAt || bd.startedAt });
        }
      } else if (suite.checkRuns.pageInfo?.hasNextPage) {
        needRest.push(r);
      }
    }
  }

  if (needRest.length) {
    let idx = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (idx < needRest.length) {
        const r = needRest[idx++];
        const j = await ghGet(`repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`);
        const bd = (j.jobs || []).find((c) => c.name === 'Build and deploy');
        if (bd && bd.conclusion === 'success') {
          green.push({ runId: r.id, at: bd.completed_at || bd.started_at });
        }
      }
    }));
  }

  return green;
}

// ─── Main scorecard assembly ───────────────────────────────────────────────

export async function buildScorecard({ since, until, tz = DEFAULT_TZ, repo = DEFAULT_REPO }) {
  const days = dateRange(since, until);
  const queryStart = addDays(since, -1);
  const queryEnd = addDays(until, 1);
  const deployLookback = addDays(since, -7);

  const [prs, greenDeploys] = await Promise.all([
    fetchMergedPrsRange(repo, queryStart, queryEnd),
    fetchGreenDeploys(repo, deployLookback),
  ]);
  const commits = readMainCommits(since);

  const mergedByNum = new Map(prs.map((p) => [p.number, p]));
  const missingRefs = new Set();
  for (const p of prs) {
    const d = dayOf(p.mergedAt, tz);
    if (!d || d < since || d > until) continue;
    for (const n of candidatePrRefs(p)) {
      if (!mergedByNum.has(n)) missingRefs.add(n);
    }
  }
  if (missingRefs.size) {
    const extra = await fetchReferencedPrs(repo, [...missingRefs]);
    for (const [n, info] of extra) mergedByNum.set(n, info);
  }

  const deployStats = computeDeployStats(greenDeploys, days, tz);

  const dayMap = new Map(days.map((d) => [d, {
    date: d,
    merged: { antigravity: 0, claude: 0, other: 0, total: 0, prs: { antigravity: [], claude: [], other: [] } },
    escapes: [],
    deploys: deployStats.get(d),
  }]));

  for (const p of [...prs].sort((a, b) => a.number - b.number)) {
    const d = dayOf(p.mergedAt, tz);
    const bucket = dayMap.get(d);
    if (!bucket) continue;
    const side = classifySide(p.headRefName);
    bucket.merged[side]++;
    bucket.merged.total++;
    bucket.merged.prs[side].push(p.number);

    const esc = detectPrEscape(p, mergedByNum);
    if (esc) bucket.escapes.push(esc);
  }

  for (const c of commits) {
    const d = dayOf(c.date, tz);
    const bucket = dayMap.get(d);
    if (!bucket) continue;
    const rev = parseRevertCommit(c);
    if (!rev) continue;
    if (rev.pr && bucket.escapes.some((e) => e.kind === 'pr' && e.pr === rev.pr)) continue;
    bucket.escapes.push(rev);
  }

  const dayList = days.map((d) => dayMap.get(d));
  const allGaps = dayList.flatMap((d) => d.deploys.gapsHours);
  const summary = {
    merged: {
      antigravity: dayList.reduce((s, d) => s + d.merged.antigravity, 0),
      claude: dayList.reduce((s, d) => s + d.merged.claude, 0),
      other: dayList.reduce((s, d) => s + d.merged.other, 0),
      total: dayList.reduce((s, d) => s + d.merged.total, 0),
    },
    escapes: dayList.reduce((s, d) => s + d.escapes.length, 0),
    deploys: {
      count: dayList.reduce((s, d) => s + d.deploys.count, 0),
      minGapHours: allGaps.length ? round2(Math.min(...allGaps)) : null,
      medianGapHours: allGaps.length ? round2(median(allGaps)) : null,
      maxGapHours: allGaps.length ? round2(Math.max(...allGaps)) : null,
    },
  };

  return { since, until, timezone: tz, days: dayList, summary };
}

export function formatScorecardText(card) {
  const lines = [
    `scorecard ${card.since}..${card.until} (${card.timezone}): ${card.summary.merged.total} merged (antigravity/ ${card.summary.merged.antigravity}, claude/ ${card.summary.merged.claude}${card.summary.merged.other ? `, other ${card.summary.merged.other}` : ''}), ${card.summary.escapes} escapes, ${card.summary.deploys.count} green Build and deploy`,
  ];
  for (const d of card.days) lines.push('', ...formatDayLines(d));
  return lines.join('\n');
}

// ─── Self-test (pure unit + privacy checks) ────────────────────────────────

function runSelftest() {
  let failed = 0;
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failed++;
  };

  check('dayOf converts UTC evening to Pacific calendar day', dayOf('2026-11-28T03:42:09Z', DEFAULT_TZ) === '2026-11-27', dayOf('2026-11-28T03:42:09Z', DEFAULT_TZ));
  check('classifySide reads antigravity/ and claude/', classifySide('antigravity/50k-scorecard-script') === 'antigravity' && classifySide('claude/project-thread-1') === 'claude' && classifySide('main') === 'other');

  check('isRevertCommit matches real reverts and ignores negated or branch-local squash prose',
    isRevertCommit({ subject: 'Revert "foo (#12)"', body: 'This reverts commit abc1234.' })
    && isRevertCommit({ subject: 'fix: revert visualizer change', body: '' })
    && !isRevertCommit({ subject: '27f-9m: keeps oil (#865)', body: 'Summary.\n\n* Revert "exp"\n\nThis reverts commit 31c9d2cc.' })
    && !isRevertCommit({ subject: 'never reverts on idle plate', body: 'no revert here' })
    && !isRevertCommit({ subject: '27f-9m: a look opened keeps its oil (#865)', body: 'never laid' }));

  const merged = new Map([
    [862, { number: 862, mergedAt: '2026-11-25T10:00:00Z' }],
    [917, { number: 917, mergedAt: '2026-11-22T10:00:00Z' }],
    [962, { number: 962, mergedAt: '2026-11-26T10:00:00Z' }],
    [1010, { number: 1010, mergedAt: '2026-11-27T18:00:00Z' }],
    [1016, { number: 1016, mergedAt: '2026-11-27T19:00:00Z' }],
    [1036, { number: 1036, mergedAt: '2026-11-28T01:34:50Z' }],
    [1037, { number: 1037, mergedAt: '2026-11-28T02:02:14Z' }],
  ]);

  const e1 = detectPrEscape({
    number: 1043,
    title: '31s-14: the flower gate sees again after 38u-10',
    body: 'Since #1037 (38u-10) every film harness refused on main.\nMeasured:\n- `npm run lint` -> `exit 0`',
    mergedAt: '2026-11-28T03:42:09Z',
    headRefName: 'claude/project-thread-0qmvrf',
  }, merged);
  check('detectPrEscape catches PR fixing regression since earlier PR', JSON.stringify(e1?.brokePrs) === '[1037]', JSON.stringify(e1));

  const e2 = detectPrEscape({
    number: 1030,
    title: '19ak-25: main\'s three reds',
    body: 'Main\'s post-deploy checks had three reds:\n1. #1010 broke lampzero.\n2. 49b (#962) removed overlay.\n3. #984 is open and not merged.',
    mergedAt: '2026-11-28T00:18:59Z',
    headRefName: 'claude/project-thread-s9qkiz',
  }, merged);
  check('detectPrEscape catches merged PRs and ignores unmerged #984', JSON.stringify(e2?.brokePrs) === '[962,1010]', JSON.stringify(e2));

  const nonEsc = detectPrEscape({
    number: 1020,
    title: '38p: re-baselined',
    body: 'Carries #917 onto today\'s main. Should merge after #1016.\nMeasured:\n- `npm run lint` -> `FAIL after #862`',
    mergedAt: '2026-11-28T03:12:58Z',
    headRefName: 'antigravity/38p',
  }, merged);
  check('detectPrEscape ignores carry/merge-order and Measured blocks', nonEsc === null, JSON.stringify(nonEsc));

  const deploys = computeDeployStats([
    { runId: 1, at: '2026-11-26T22:00:00-08:00' },
    { runId: 2, at: '2026-11-27T01:30:00-08:00' },
    { runId: 3, at: '2026-11-27T04:00:00-08:00' },
  ], ['2026-11-27'], DEFAULT_TZ);
  const d27 = deploys.get('2026-11-27');
  check('computeDeployStats measures cross-day deploy gaps', d27.count === 2 && d27.minGapHours === 2.5 && d27.maxGapHours === 3.5 && d27.medianGapHours === 3, JSON.stringify(d27));

  const manyEscapes = Array.from({ length: 15 }, (_, i) => ({ kind: 'pr', pr: 900 + i, side: 'claude', brokePrs: [800 + i] }));
  const lines = formatDayLines({
    date: '2026-11-27',
    merged: { antigravity: 4, claude: 21, other: 0, total: 25 },
    escapes: manyEscapes,
    deploys: d27,
  });
  check('formatDayLines never exceeds 5 lines per day', lines.length <= MAX_LINES_PER_DAY, `${lines.length} lines`);
  const rendered = lines.join('\n');
  check('formatDayLines prints only sides and PR numbers (no emails/titles/names)', !/@|jstevoh|flower gate/i.test(rendered), rendered);

  console.log(failed ? `\n${failed} FAIL` : '\nall ok');
  process.exit(failed ? 1 : 0);
}

// ─── CLI entrypoint ────────────────────────────────────────────────────────

const arg = (name, dflt = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};
const hasFlag = (name) => process.argv.includes(`--${name}`);

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (hasFlag('selftest')) {
    runSelftest();
  } else {
    const tz = arg('tz', DEFAULT_TZ);
    const until = arg('until', dayOf(Date.now(), tz));
    const days = Number(arg('days', 7));
    const since = arg('since', null) ?? addDays(until, -(Math.max(1, days) - 1));
    const card = await buildScorecard({ since, until, tz, repo: arg('repo', DEFAULT_REPO) });
    if (hasFlag('json')) console.log(JSON.stringify(card, null, 2));
    else console.log(formatScorecardText(card));
  }
}
