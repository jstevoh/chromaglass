// Cloudflare Worker — where Settings → Feedback goes (PLAN 39a).
//
// The owner asked for two things from one Send: an email with the feedback in
// it, and every entry kept in one database with the logs beside it, so that
// what people say can be read over months and not only as it arrives. The
// database is the record and the email is the notice: an entry is written
// first and answered, and only then mailed, so a mail provider that is down
// or over its quota costs a notice, never an entry (`emailed` says which).
//
//   POST /feedback               public. Stores an entry; answers { ok, id }.
//   GET  /feedback?days=N        Bearer FEEDBACK_TOKEN. The last N days, newest
//                                first, without the context or the picture.
//   GET  /feedback/<id>          Bearer. One entry, its context parsed.
//   GET  /feedback/<id>/picture  Bearer. The plate, as a JPEG.
//   POST /feedback/<id>/status   Bearer. { status: new | read | done }.
//
// Why D1 and not Firestore, which the accounts already use: the app's server
// side is Workers (licences, sync, reports), a Worker reaches D1 through a
// binding with no service account to hold, and SQL is what "track it over
// time" wants — `SELECT topic, count(*) … GROUP BY` from a terminal with
// wrangler. Firestore from a Worker means a Google service-account key in
// the Worker's secrets and a REST client, for a table nobody but the owner
// reads.
//
// Why Resend for the mail: Cloudflare's own `send_email` needs the domain's
// mail on Cloudflare Email Routing, and chromaglass.art's MX points at the
// forwarder that delivers support@. Resend sends over HTTPS for a verified
// domain whose records sit on `send.chromaglass.art` and a DKIM name, so the
// forwarder's root MX is untouched, and its free tier is 100 a day,
// which the daily cap below keeps under.
//
// Identity is only ever what a Firebase ID token proves (`firebase-token.js`,
// the same check the licence Worker makes): a body saying "I am uid X" is
// not believed. Someone not signed in may type an address to be answered at,
// stored as `reply_to` and never as `email`.
//
// The endpoint is public, so a body is hostile data: size-capped, shape-
// checked, never echoed, never evaluated. The mail is plain text, so nothing
// a sender writes is ever rendered as HTML in the owner's inbox.
//
// Setup: wrangler.feedback.toml.

import { verifyFirebaseToken } from './firebase-token.js';

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?chromaglass\.art$/,
  /^https:\/\/chromaglass\.web\.app$/,
  /^https:\/\/chromaglass\.firebaseapp\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^capacitor:\/\/localhost$/,
];

const KIND = 'chromaglass-feedback';
export const TOPICS = ['bug', 'idea', 'love', 'other'];
export const STATUSES = ['new', 'read', 'done'];
/**
 * The whole body, picture included. A report's context is 10–60 kB and the
 * plate's JPEG 25–150 kB as base64; D1 holds a row of up to 2 MB, and this
 * keeps every row under that with the picture and the context together.
 */
export const MAX_BYTES = 1536 * 1024;
export const MAX_MESSAGE = 5000;
/** Entries per address per hour. Ten notes in an hour is a person with a lot to say; more is a script. */
export const RATE_PER_HOUR = 10;
/**
 * Entries per hour from everyone. A launch day is a few dozen notes; past
 * this a script spread over many addresses (an IPv6 block is billions) is
 * filling the database at up to 1.5 MB a row, and is refused with 503.
 */
export const ALL_PER_HOUR = 60;
/** Mails a day, under the provider's free 100. Past it an entry is still kept, and says `emailed = 'off: daily cap'`. */
export const MAIL_PER_DAY = 80;
const MAX_DAYS = 366;

const TOPIC_NAME = { bug: 'Something broke', idea: 'An idea', love: 'Something I love', other: 'Something else' };

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
  async fetch(request, env, ctx) {
    const cors = corsFor(request);
    const url = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      if (url.pathname === '/feedback') {
        if (request.method === 'POST') return await receive(request, env, ctx, cors);
        if (request.method !== 'GET') return json({ error: 'GET or POST only' }, 405, cors);
        if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401, cors);
        const days = clampInt(url.searchParams.get('days'), 1, MAX_DAYS, 30);
        return json(await list(env, days), 200, cors);
      }
      const m = /^\/feedback\/([A-Za-z0-9-]{1,64})(\/picture|\/status)?$/.exec(url.pathname);
      if (m) {
        if (!authorised(request, env)) return json({ error: 'unauthorised' }, 401, cors);
        if (!m[2] && request.method === 'GET') return await one(env, m[1], cors);
        if (m[2] === '/picture' && request.method === 'GET') return await picture(env, m[1], cors);
        if (m[2] === '/status' && request.method === 'POST') return await setStatus(request, env, m[1], cors);
        return json({ error: 'method not allowed' }, 405, cors);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch {
      // Never the exception's text: it could quote the body back.
      return json({ error: 'internal error' }, 500, cors);
    }
  },
};

// ── POST /feedback ───────────────────────────────────────────────

async function receive(request, env, ctx, cors) {
  const type = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('application/json')) return json({ error: 'expected application/json' }, 415, cors);
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: 'too large' }, 413, cors);

  const now = Date.now();
  const ipHash = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env);
  const hourAgo = new Date(now - 3600_000).toISOString();
  // A cheap early no, before reading a body; the limit that holds is after the insert.
  if (await countSince(env, hourAgo, ipHash) >= RATE_PER_HOUR) return json({ error: 'too many' }, 429, cors);

  const text = await readCapped(request, MAX_BYTES);
  if (text == null) return json({ error: 'too large' }, 413, cors);
  let body;
  try { body = JSON.parse(text); } catch { return json({ error: 'not JSON' }, 400, cors); }
  const problem = invalid(body);
  if (problem) return json({ error: problem }, 400, cors);

  // Who sent it: a verified token, or nobody. A bad or expired token is not
  // refused — the feedback is still worth keeping — it is only not believed.
  const bearer = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '')?.[1];
  const who = bearer ? await verifyFirebaseToken(bearer, env, now) : null;

  const day = dayOf(now);
  const id = `${day}-${now.toString(36)}-${rand(6)}`;
  const at = new Date(now).toISOString();
  const pic = body.picture && typeof body.picture === 'object' ? decodeJpegDataUrl(body.picture.dataUrl) : null;
  const app = obj(body.app);
  // Only the parts the page sends, and scrubbed again here: a stale or a
  // hostile client is not trusted to have taken the credentials out, and a
  // field it adds (a `uid`, an `email`) is not kept or mailed.
  const context = scrub({
    kind: body.kind, version: body.version, at: body.at, topic: body.topic, message: body.message, replyTo: body.replyTo ?? null,
    app: body.app ?? null, env: body.env ?? null, snapshot: body.snapshot ?? null, diagnostics: body.diagnostics ?? null,
  });
  context.picture = pic ? { bytes: pic.length, width: num(body.picture.width), height: num(body.picture.height) } : null;
  // The account's address only when the token says Firebase proved it: an
  // account can be made with anyone's address and a password.
  const email = who?.emailVerified ? who.email : null;
  // A typed address, or the page's cached one when its token did not come
  // through; kept apart from `email` and marked unverified in the mail.
  const replyTo = !email && isEmail(body.replyTo) ? body.replyTo.trim() : null;

  const row = {
    id, at,
    topic: body.topic,
    message: scrubText(body.message.trim()),
    uid: who?.uid ?? null,
    email,
    reply_to: replyTo,
    app_version: clip(str(app.version), 40) || null,
    build: clip(str(app.build), 64) || null,
    shell: app.shell === 'mac' ? 'mac' : 'browser',
    phone: app.phone === true ? 1 : 0,
    tier: ['free', 'home', 'pro'].includes(app.tier) ? app.tier : null,
    look: clip(str(app.look), 120) || null,
    page: clip(str(app.page), 200) || null,
    user_agent: clip(str(obj(body.env).userAgent), 300) || null,
    country: request.cf?.country ?? null,
    has_logs: body.diagnostics && typeof body.diagnostics === 'object' ? 1 : 0,
  };
  await env.FEEDBACK_DB.prepare(
    `INSERT INTO feedback (id, at, topic, message, uid, email, reply_to, app_version, build, shell, phone, tier, look, page, user_agent, country, has_logs, context, picture, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    row.id, row.at, row.topic, row.message, row.uid, row.email, row.reply_to, row.app_version, row.build, row.shell,
    row.phone, row.tier, row.look, row.page, row.user_agent, row.country, row.has_logs, JSON.stringify(context),
    pic, ipHash,
  ).run();

  /*
    The limits that hold. Counting and then inserting is a race: fifty posts
    at once all count nine and all insert (measured against the check's
    database with 5 ms on each call: 50 of 50 taken). Inserting and then
    counting is not, because D1 writes one at a time and a row's rowid says
    where it fell in that order: each request counts the rows at or before
    its own, so the first ten of a burst see one to ten and stay, and every
    later one sees eleven or more and takes its row back out. (Counting every
    row instead kept none of a burst of forty: each saw all forty.)
  */
  const mine = await countSince(env, hourAgo, ipHash, id);
  const all = await countSince(env, hourAgo, null, id);
  // ALL_PER_HOUR can be raised in the Worker's vars without a deploy of the code, for a launch day.
  if (mine > RATE_PER_HOUR || all > (Number(env.ALL_PER_HOUR) || ALL_PER_HOUR)) {
    await env.FEEDBACK_DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
    return mine > RATE_PER_HOUR ? json({ error: 'too many' }, 429, cors) : json({ error: 'busy' }, 503, cors);
  }

  const mailing = mail(env, row, context, pic, now, new URL(request.url).origin)
    .catch(() => 'failed network')
    .then((state) => env.FEEDBACK_DB.prepare('UPDATE feedback SET emailed = ? WHERE id = ?').bind(state, id).run())
    .catch(() => {});
  if (ctx?.waitUntil) ctx.waitUntil(mailing);
  else await mailing;

  return json({ ok: true, id }, 200, cors);
}

/** The shape the client sends, checked just deeply enough to trust the fields read here. */
export function invalid(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return 'expected an object';
  if (b.kind !== KIND) return 'wrong kind';
  if (!TOPICS.includes(b.topic)) return 'bad topic';
  if (typeof b.message !== 'string' || !b.message.trim()) return 'empty message';
  if (b.message.length > MAX_MESSAGE) return 'message too long';
  if (b.replyTo != null && typeof b.replyTo !== 'string') return 'bad replyTo';
  for (const k of ['app', 'env', 'snapshot', 'diagnostics', 'picture']) {
    if (b[k] != null && (typeof b[k] !== 'object' || Array.isArray(b[k]))) return `bad ${k}`;
  }
  return null;
}

// ── The mail ─────────────────────────────────────────────────────

/**
 * The notice, through Resend. Answers what goes in `emailed`. Unconfigured
 * (no key) is 'off', which is what a local `wrangler dev` and the checks see.
 */
async function mail(env, row, context, pic, now, origin) {
  if (!env.RESEND_API_KEY) return 'off';
  // A slot claimed before it is counted, for the same reason as the hourly
  // limit: count-then-send lets a burst all see room.
  await env.FEEDBACK_DB.prepare("UPDATE feedback SET emailed = 'sending' WHERE id = ?").bind(row.id).run();
  const dayStart = `${dayOf(now)}T00:00:00.000Z`;
  const sent = await env.FEEDBACK_DB.prepare(
    "SELECT COUNT(*) AS n FROM feedback WHERE at >= ? AND emailed IN ('sent', 'sending') AND rowid <= (SELECT rowid FROM feedback WHERE id = ?)",
  ).bind(dayStart, row.id).first();
  if ((sent?.n ?? 0) > MAIL_PER_DAY) return 'off: daily cap';

  const msg = composeMail(row, origin);
  const attachments = [];
  if (pic) attachments.push({ filename: `plate-${row.id}.jpg`, content: toBase64(pic) });
  attachments.push({ filename: `feedback-${row.id}.json`, content: toBase64(new TextEncoder().encode(JSON.stringify(context, null, 2))) });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.FEEDBACK_FROM || 'ChromaGlass feedback <feedback@chromaglass.art>',
      to: [env.FEEDBACK_TO || 'support@chromaglass.art'],
      ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      subject: msg.subject,
      text: msg.text,
      attachments,
    }),
  });
  return res.ok ? 'sent' : `failed ${res.status}`;
}

/** Subject, plain-text body and Reply-To for an entry: pure, so the check can read it. */
export function composeMail(row, origin = 'https://<the feedback Worker>') {
  const firstLine = row.message.split('\n')[0].replace(/\s+/g, ' ').trim();
  // A subject is one line: a sender's newline must not become a header.
  const subject = `[ChromaGlass] ${TOPIC_NAME[row.topic] ?? row.topic}: ${clip(firstLine, 70)}`.replace(/[\r\n]+/g, ' ');
  const from = row.email ? `${row.email} (signed in)` : row.reply_to ? `${row.reply_to} (given, not verified)` : 'not signed in, no address';
  const where = [
    row.shell === 'mac' ? `Mac app ${row.app_version ?? ''}`.trim() : 'browser',
    row.phone ? 'phone layout' : null,
    row.build ? `build ${row.build.slice(0, 7)}` : null,
    row.tier ? `${row.tier} tier` : null,
  ].filter(Boolean).join(' · ');
  const text = [
    row.message,
    '',
    '──',
    `From: ${from}`,
    `On: ${where}`,
    `Look: ${row.look ?? 'unknown'}`,
    `Page: ${row.page ?? 'unknown'}`,
    `Browser: ${row.user_agent ?? 'unknown'}`,
    `Log and settings attached: ${row.has_logs ? 'yes' : 'no (the sender left it unticked)'}`,
    '',
    `Entry ${row.id}, kept in the feedback database. The whole entry:`,
    `  curl -H "Authorization: Bearer $FEEDBACK_TOKEN" ${origin}/feedback/${row.id}`,
  ].join('\n');
  return { subject, text, replyTo: row.email || row.reply_to || null };
}

// ── Reading ──────────────────────────────────────────────────────

async function list(env, days) {
  const since = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const { results } = await env.FEEDBACK_DB.prepare(
    `SELECT id, at, topic, message, uid, email, reply_to, app_version, build, shell, phone, tier, look, page, country, has_logs,
            picture IS NOT NULL AS has_picture, status, emailed
       FROM feedback WHERE at >= ? ORDER BY at DESC LIMIT 1000`,
  ).bind(since).all();
  // Counted over the whole window, not the page of 1000.
  const counts = await env.FEEDBACK_DB.prepare('SELECT topic, COUNT(*) AS n FROM feedback WHERE at >= ? GROUP BY topic').bind(since).all();
  const byTopic = {};
  let total = 0;
  for (const r of counts.results) { byTopic[r.topic] = r.n; total += r.n; }
  return { days, total, byTopic, entries: results };
}

async function one(env, id, cors) {
  // Every column but the address hash and the picture's bytes, which has its own route.
  const r = await env.FEEDBACK_DB.prepare(
    `SELECT id, at, topic, message, uid, email, reply_to, app_version, build, shell, phone, tier, look, page, user_agent, country,
            has_logs, context, picture IS NOT NULL AS has_picture, status, emailed FROM feedback WHERE id = ?`,
  ).bind(id).first();
  if (!r) return json({ error: 'not found' }, 404, cors);
  let context = null;
  try { context = JSON.parse(r.context); } catch { /* stored by this Worker; never expected */ }
  return json({ ...r, has_picture: r.has_picture === 1, context }, 200, cors);
}

async function picture(env, id, cors) {
  const r = await env.FEEDBACK_DB.prepare('SELECT picture FROM feedback WHERE id = ?').bind(id).first();
  if (!r?.picture) return json({ error: 'not found' }, 404, cors);
  return new Response(new Uint8Array(r.picture), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}

async function setStatus(request, env, id, cors) {
  let body;
  try { body = JSON.parse(await readCapped(request, 1024) ?? ''); } catch { return json({ error: 'not JSON' }, 400, cors); }
  if (!STATUSES.includes(body?.status)) return json({ error: 'bad status' }, 400, cors);
  const r = await env.FEEDBACK_DB.prepare('UPDATE feedback SET status = ? WHERE id = ?').bind(body.status, id).run();
  if (!r?.meta?.changes) return json({ error: 'not found' }, 404, cors);
  return json({ ok: true }, 200, cors);
}

// ── Small parts ──────────────────────────────────────────────────

function authorised(request, env) {
  const token = env.FEEDBACK_TOKEN;
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

/** Rows since `since`, from one address or from everyone, and up to and including row `upTo` when given. */
async function countSince(env, since, ipHash, upTo = null) {
  const where = ['at > ?'];
  const args = [since];
  if (ipHash) { where.push('ip_hash = ?'); args.push(ipHash); }
  if (upTo) { where.push('rowid <= (SELECT rowid FROM feedback WHERE id = ?)'); args.push(upTo); }
  const r = await env.FEEDBACK_DB.prepare(`SELECT COUNT(*) AS n FROM feedback WHERE ${where.join(' AND ')}`).bind(...args).first();
  return Number(r?.n ?? 0);
}

/**
 * A salted hash of the address, enough to count an hour's entries from one
 * place and nothing more. An IPv6 address by its /64, which is one
 * connection's block: counted by the full address, one machine has 2^64 of
 * them. The salt is the Worker's secret (IP_SALT, else the reading token),
 * because with a public salt the 2^32 IPv4 addresses hash back in minutes.
 */
export function ipKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head] = ip.split('::');
  const groups = ip.includes('::')
    ? [...head.split(':').filter(Boolean), ...Array(8).fill('0')].slice(0, 4)
    : ip.split(':').slice(0, 4);
  return `${groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

async function hashIp(ip, env) {
  const bytes = new TextEncoder().encode(`${env.IP_SALT || env.FEEDBACK_TOKEN || 'chromaglass-feedback'}|${ipKey(ip)}`);
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...d.slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

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
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  return bytes;
}

/*
  The page's scrub (src/lib/feedbackScrub.ts), again here. The Worker may not
  import src/ (server/README.md), so this is a copy, and the check runs both
  on the same dirty sample and fails if they ever answer differently.
*/
const SECRET_FIELD = /(token|secret|password|passwd|authorization|(api|access|private|session|show|relay|display|stream|licen[cs]e)_?key|^key)$/i;
const SECRET_TEXT = [
  [/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[token]'],
  [/\bcg1\.[\w.-]{8,}/g, '[licence key]'],
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [removed]'],
  [/(rtmps?:\/\/[^\s"'<>]+\/)[^/\s"'<>]+/gi, '$1[removed]'],
  [/([?&#][\w-]*(?:key|token|secret|auth|sig|signature|password|code)=)[^&#\s"'<>]+/gi, '$1[removed]'],
];
export function scrubText(s) {
  let out = s;
  for (const [re, to] of SECRET_TEXT) out = out.replace(re, to);
  return out;
}
export function scrub(v, depth = 0) {
  if (typeof v === 'string') return scrubText(v);
  if (v === null || typeof v !== 'object') return v;
  if (depth > 12) return '[too deep]';
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const out = {};
  for (const [k, x] of Object.entries(v)) {
    out[k] = SECRET_FIELD.test(k) && x != null && x !== '' ? '[removed]' : scrub(x, depth + 1);
  }
  return out;
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const isEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v.trim());
function dayOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
function rand(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => (x % 36).toString(36)).join('');
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function str(v) { return typeof v === 'string' ? v : ''; }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function clip(s, n) { return s.length > n ? `${s.slice(0, n)}…` : s; }
function clampInt(v, lo, hi, dflt) {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
}

function json(o, status, cors) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}
