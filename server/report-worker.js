// Cloudflare Worker — where the black box's Send goes (docs/crash-plan.md).
//
// The client half has existed since the black box: `sendReport()` in
// src/lib/crashLog.ts POSTs the whole report as JSON to VITE_CRASH_REPORT_URL,
// and the button shows Send only when that was set at build time. This is the
// other half, so that a crash on somebody else's machine turns into a line in
// a list rather than a file that might be attached to an issue some day.
//
//   POST /report        public. Stores the report; answers { ok, id }.
//   GET  /digest?days=N  Bearer DIGEST_TOKEN. The last N days grouped by the
//                        line each report died on, most common first.
//   GET  /report/<id>    Bearer DIGEST_TOKEN. One stored report.
//   cron (daily)         yesterday's digest, written to digests/YYYY-MM-DD.json.
//
// The "daily digest" is that object in R2 and nothing more: no email goes
// anywhere. Read it with `wrangler r2 object get`, or ask /digest.
//
// Storage:
//   R2  REPORTS        reports/YYYY-MM-DD/<id>.json   the report, minus the picture
//                      reports/YYYY-MM-DD/<id>.jpg    the picture, decoded
//                      digests/YYYY-MM-DD.json        the cron's output
//   KV  REPORT_INDEX   idx:YYYY-MM-DD:<id>   a few hundred bytes per report: when,
//                                           where, which browser, the line, the note
//                      rl:<ip>:<hour>        the rate limit's counter
//
// The index is what makes a digest cheap: grouping a day reads one small KV
// value per report instead of every report's 10–150 kB from R2.
//
// This endpoint is public — anybody can POST to it, not only the app — so
// everything in a report is treated as hostile data. It is size-capped, shape-
// checked, stored, and never echoed: no response carries a byte of what was
// sent, and nothing in it is ever evaluated or followed.
//
// Setup: see docs/crash-plan.md (wrangler.report.toml holds the bindings).

// The site, and any localhost for `npm run dev`. The fingerprint Worker answers
// every origin with `*`; this one names them, because a report endpoint that
// any page on the web can fill from its visitors' browsers is a spam sink.
// (It stops only browsers — curl sends no Origin — which is what the rate
// limit and the validation are for.)
const ALLOWED_ORIGINS = [
  /^https:\/\/chromaglass\.web\.app$/,
  /^https:\/\/chromaglass\.firebaseapp\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const KIND = 'chromaglass-crash-report';
/** A report is ~10 kB without the picture and the JPEG is 25–150 kB as base64. */
export const MAX_BYTES = 4 * 1024 * 1024;
/** Reports per IP per hour. A person who crashes thirty times an hour has told us already. */
export const RATE_PER_HOUR = 30;
/** How far back /digest will look. */
const MAX_DAYS = 31;
/** Index records live a little longer than the longest digest. */
const INDEX_TTL_S = 40 * 24 * 3600;

const CORS_BASE = {
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

function corsFor(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    return { ...CORS_BASE, 'Access-Control-Allow-Origin': origin };
  }
  return { ...CORS_BASE };
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/report') {
        if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
        return await receive(request, env, cors);
      }
      if (request.method === 'GET' && url.pathname === '/digest') {
        if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401, cors);
        const days = clampInt(url.searchParams.get('days'), 1, MAX_DAYS, 1);
        return json(await digest(env, days, Date.now()), 200, cors);
      }
      const one = /^\/report\/([A-Za-z0-9-]{1,64})$/.exec(url.pathname);
      if (request.method === 'GET' && one) {
        if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401, cors);
        return await fetchReport(env, one[1], cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch {
      // Never the exception's text: it could quote the body back.
      return json({ error: 'internal error' }, 500, cors);
    }
  },

  async scheduled(event, env, ctx) {
    // The day that has just finished, in UTC: a cron at 00:10 writes yesterday.
    const now = typeof event?.scheduledTime === 'number' ? event.scheduledTime : Date.now();
    const day = dayOf(now - 24 * 3600 * 1000);
    const work = (async () => {
      const d = await digestDays(env, [day]);
      await env.REPORTS.put(`digests/${day}.json`, JSON.stringify(d, null, 2), {
        httpMetadata: { contentType: 'application/json' },
      });
    })();
    if (ctx?.waitUntil) ctx.waitUntil(work);
    await work;
  },
};

// ── POST /report ─────────────────────────────────────────────────

async function receive(request, env, cors) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return json({ error: 'expected application/json' }, 415, cors);
  // Content-Length first, so an honest huge body is refused before it is read;
  // then the bytes actually read, because the header can lie or be absent.
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: 'too large' }, 413, cors);

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await underLimit(env, ip))) return json({ error: 'too many reports' }, 429, cors);

  const text = await readCapped(request, MAX_BYTES);
  if (text == null) return json({ error: 'too large' }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'not JSON' }, 400, cors); }
  const problem = invalid(body);
  if (problem) return json({ error: problem }, 400, cors);

  const now = Date.now();
  const day = dayOf(now);
  const id = `${day}-${now.toString(36)}-${rand(8)}`;
  const base = `reports/${day}/${id}`;

  // The picture, decoded and stored beside the report, so the JSON stays small
  // enough to read in a terminal and the JPEG opens as a JPEG.
  let screenshot = null;
  const shot = body.screenshot;
  if (shot && typeof shot === 'object') {
    const bytes = decodeJpegDataUrl(shot.dataUrl);
    if (bytes) {
      await env.REPORTS.put(`${base}.jpg`, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      screenshot = {
        key: `${base}.jpg`,
        bytes: bytes.length,
        width: num(shot.width),
        height: num(shot.height),
        painted: shot.painted === true,
      };
    } else if (shot.dataUrl != null) {
      screenshot = { dropped: 'not a JPEG data URL' };
    }
  }

  const stored = {
    ...body,
    screenshot,
    received: { id, at: new Date(now).toISOString(), country: request.cf?.country ?? null },
  };
  await env.REPORTS.put(`${base}.json`, JSON.stringify(stored), { httpMetadata: { contentType: 'application/json' } });

  const line = deathLine(body);
  const record = {
    id,
    at: new Date(now).toISOString(),
    url: clip(str(body.url), 300),
    ua: clip(str(body.env?.userAgent), 300),
    line: line ? clip(line, 600) : null,
    group: line ? normalise(line) : '(no error line)',
    note: clip(str(body.note), 500),
    screenshot: !!screenshot?.key,
  };
  await env.REPORT_INDEX.put(`idx:${day}:${id}`, JSON.stringify(record), { expirationTtl: INDEX_TTL_S });

  return json({ ok: true, id }, 200, cors);
}

/** The shape the client sends, checked just deeply enough to trust the fields this Worker reads. */
function invalid(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'expected an object';
  if (b.kind !== KIND) return 'wrong kind';
  if (b.note != null && typeof b.note !== 'string') return 'bad note';
  if (b.url != null && typeof b.url !== 'string') return 'bad url';
  if (b.env != null && (typeof b.env !== 'object' || Array.isArray(b.env))) return 'bad env';
  if (b.log != null && !Array.isArray(b.log)) return 'bad log';
  if (b.previous != null && !Array.isArray(b.previous)) return 'bad previous';
  if (b.screenshot != null && typeof b.screenshot !== 'object') return 'bad screenshot';
  return null;
}

/**
 * The line a report is about, the same way the black box picks it: this load's
 * last fatal if it had one, else the line the previous load died on — its last,
 * not counting its `pagehide` (crashLog.ts `last()`). Failing both, this load's
 * last error, so a report sent by hand about a glitch still lands in a group.
 */
export function deathLine(b) {
  const lines = (arr) => (Array.isArray(arr) ? arr.filter((e) => e && typeof e === 'object' && typeof e.msg === 'string') : []);
  const log = lines(b.log);
  const prev = lines(b.previous);
  const fmt = (e) => `[${str(e.level)}] ${str(e.source)}: ${e.msg.split('\n')[0]}`;
  const fatal = [...log].reverse().find((e) => e.level === 'fatal');
  if (fatal) return fmt(fatal);
  const died = [...prev].reverse().find((e) => e.source !== 'unload');
  if (died) return fmt(died);
  const err = [...log].reverse().find((e) => e.level === 'error');
  return err ? fmt(err) : null;
}

/**
 * The same failure, told apart only by its numbers, is one failure: "no frame
 * for 20s (1234 drawn)" and "(88 drawn)" group together, and so do two device
 * labels that differ by a hex id, or two URLs to the same chunk with a new hash.
 */
export function normalise(line) {
  return line
    .replace(/\b0x[0-9a-f]+\b/gi, '#')
    .replace(/\b[0-9a-f]{8,}\b/gi, '#')
    .replace(/\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// ── Reading: /digest, /report/<id>, the cron ─────────────────────

async function digest(env, days, now) {
  const list = [];
  for (let i = 0; i < days; i++) list.push(dayOf(now - i * 24 * 3600 * 1000));
  return digestDays(env, list);
}

async function digestDays(env, list) {
  const groups = new Map();
  let total = 0;
  for (const day of list) {
    let cursor;
    do {
      const page = await env.REPORT_INDEX.list({ prefix: `idx:${day}:`, cursor });
      for (const k of page.keys) {
        const raw = await env.REPORT_INDEX.get(k.name);
        if (!raw) continue;
        let r;
        try { r = JSON.parse(raw); } catch { continue; }
        total++;
        const g = groups.get(r.group) ?? { group: r.group, line: r.line, count: 0, firstSeen: r.at, lastSeen: r.at, examples: [], notes: [] };
        g.count++;
        if (r.at < g.firstSeen) g.firstSeen = r.at;
        if (r.at > g.lastSeen) { g.lastSeen = r.at; g.line = r.line; }
        if (g.examples.length < 5) g.examples.push(r.id);
        if (r.note && g.notes.length < 3) g.notes.push(r.note);
        groups.set(r.group, g);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  const sorted = [...groups.values()].sort((a, b) => b.count - a.count || (a.lastSeen < b.lastSeen ? 1 : -1));
  return { days: list, total, groups: sorted };
}

async function fetchReport(env, id, cors) {
  const day = /^(\d{4}-\d{2}-\d{2})-/.exec(id)?.[1];
  if (!day) return json({ error: 'not found' }, 404, cors);
  const obj = await env.REPORTS.get(`reports/${day}/${id}.json`);
  if (!obj) return json({ error: 'not found' }, 404, cors);
  // What was stored, as stored: it is JSON this Worker wrote, served as JSON to
  // someone holding the token, and never as HTML.
  return new Response(await obj.text(), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}

// ── Small parts ──────────────────────────────────────────────────

function authorised(request, env) {
  const token = env.DIGEST_TOKEN;
  if (!token) return false;   // unset is closed, never open
  const got = request.headers.get('Authorization') || '';
  return timingSafeEqual(got, `Bearer ${token}`);
}

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * A counter per IP per clock hour, in KV with a TTL. KV is eventually
 * consistent, so a burst from one address can get a few past the limit before
 * the count catches up; that is fine for what this is for — keeping a script
 * from filling the bucket — and it costs one read and one write a report.
 */
async function underLimit(env, ip) {
  const hour = Math.floor(Date.now() / 3600000);
  const key = `rl:${ip}:${hour}`;
  const n = Number(await env.REPORT_INDEX.get(key)) || 0;
  if (n >= RATE_PER_HOUR) return false;
  await env.REPORT_INDEX.put(key, String(n + 1), { expirationTtl: 3700 });
  return true;
}

/** The body as text, or null the moment it passes `max` bytes. */
async function readCapped(request, max) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch { /* gone */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** A `data:image/jpeg;base64,…` URL to its bytes, or null if it is anything else. */
function decodeJpegDataUrl(u) {
  if (typeof u !== 'string') return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(u);
  if (!m) return null;
  let bin;
  try { bin = atob(m[1]); } catch { return null; }
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // The JPEG magic, so what is stored as .jpg is at least the start of one.
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

function dayOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
function rand(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => (x % 36).toString(36)).join('');
}
function str(v) { return typeof v === 'string' ? v : ''; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function clip(s, n) { return s.length > n ? `${s.slice(0, n)}…` : s; }
function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}
