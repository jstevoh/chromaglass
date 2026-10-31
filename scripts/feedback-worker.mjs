#!/usr/bin/env node
/**
 * The feedback Worker, run in Node against a real SQLite database standing in
 * for D1 (server/feedback-worker.js, PLAN 39a).
 *
 *   npm run feedback-worker
 *
 * The database is `node:sqlite` loaded with `server/feedback-schema.sql`, the
 * file the owner runs against D1, so a column the Worker writes and the
 * schema lacks fails here and not on the first real note. The mail provider
 * is a stub that records what it was asked to send.
 *
 * What it proves, most of it what the public endpoint will not do:
 *
 *   1. a signed-in note is stored with the account the token proves, its log,
 *      and its picture as JPEG bytes, and mailed to support@ with Reply-To the
 *      account, a one-line subject, and the picture and the entry attached;
 *   2. a body that names a user, or a forged token, is stored as nobody's; a
 *      typed address is kept as `reply_to` and answered at, never `email`;
 *   3. the wrong kind, a bad topic, an empty or overlong note, bad JSON and a
 *      body over the cap are refused, store nothing, and quote nothing back;
 *   4. one address is held to its hourly limit, and another is not;
 *   5. a mail provider that fails, or no provider, or the day's cap, costs
 *      the mail and never the entry, and `emailed` says which;
 *   6. reading is closed without the token; with it, the list is newest first
 *      without the context or the picture, one entry has its context and not
 *      the address hash, the picture comes back as a JPEG, and a status can
 *      be set to new, read or done and nothing else;
 *   7. a preflight from the site is answered, and one from elsewhere is not;
 *   8. the page's scrub (src/lib/feedbackScrub.ts) takes out a token, a
 *      licence key, a stream key, a `?key=` and a field named for a secret,
 *      and leaves Keystone and the words around them alone.
 */

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { MAX_BYTES, RATE_PER_HOUR, MAIL_PER_DAY, MAX_MESSAGE, composeMail } from '../server/feedback-worker.js';
import { scrub, scrubText } from '../src/lib/feedbackScrub.ts';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── D1 over SQLite ──
// The calls the Worker makes: prepare(sql).bind(...).first() / .all() / .run().

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../server/feedback-schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

// ── The mail stub ──
let mails = [];
let mailStatus = 200;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url) === 'https://api.resend.com/emails') {
    mails.push({ auth: init.headers.Authorization, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ id: 'm' }), { status: mailStatus });
  }
  return realFetch(url, init);
};

// ── Tokens: a Google key of our own, handed to the verifier through GOOGLE_JWKS ──
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const google = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const forger = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const JWKS = { keys: [{ ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'k1' }] };
async function token(key, sub, email) {
  const now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${b64({ iss: 'https://securetoken.google.com/chromaglass', aud: 'chromaglass', sub, email, iat: now - 60, exp: now + 3600 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)));
  return `${head}.${Buffer.from(sig).toString('base64url')}`;
}

const DB = fakeD1();
const ENV = { FEEDBACK_DB: DB, FIREBASE_PROJECT_ID: 'chromaglass', GOOGLE_JWKS: JWKS, FEEDBACK_TOKEN: 'reader-token', RESEND_API_KEY: 're_test', FEEDBACK_TO: 'support@chromaglass.art' };
const SITE = 'https://chromaglass.art';
const MARK = 'zq-marker-7731';

// A tiny real JPEG's first bytes are enough: the Worker checks the magic.
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]).toString('base64')}`;

function note(over = {}) {
  return {
    kind: 'chromaglass-feedback', version: 1, at: new Date().toISOString(),
    topic: 'bug', message: 'The ferrofluid froze after a pour\nand then the plate went black',
    replyTo: null,
    app: { version: '1.3.692', build: 'abc1234def', shell: 'mac', phone: false, tier: 'pro', look: 'Fillmore 1967', page: '/show' },
    env: { userAgent: 'Mozilla/5.0 test', screen: { width: 1512, height: 982 } },
    snapshot: { preset: 'Fillmore 1967', fps: 60 },
    diagnostics: { url: 'https://chromaglass.art/show', log: [{ level: 'error', source: 'gpu', msg: 'device lost' }], look: { settings: { keystone: 0.2 } } },
    picture: { dataUrl: JPEG, width: 320, height: 200, painted: true },
    ...over,
  };
}

let ipN = 0;
async function post(body, { auth, ip = `10.0.0.${++ipN}`, origin = SITE, raw, env = ENV } = {}) {
  const text = raw ?? JSON.stringify(body);
  const headers = { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Origin: origin };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await worker.fetch(new Request('https://fb.example.workers.dev/feedback', { method: 'POST', headers, body: text }), env, {});
  return { status: res.status, text: await res.text() };
}
async function get(path, tok = 'reader-token', method = 'GET', body) {
  const headers = tok ? { Authorization: `Bearer ${tok}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://fb.example.workers.dev${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), ENV, {});
  return { status: res.status, type: res.headers.get('content-type'), res };
}
const row = (id) => DB.raw.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
const count = () => Number(DB.raw.prepare('SELECT COUNT(*) AS n FROM feedback').get().n);

// ── 1. A signed-in note ──
{
  mails = [];
  const r = await post(note(), { auth: await token(google.privateKey, 'user-a', 'player@example.com') });
  const id = JSON.parse(r.text).id;
  const s = row(id);
  const ctx = s && JSON.parse(s.context);
  check('a signed-in note is stored with the account its token proves',
    r.status === 200 && s?.uid === 'user-a' && s?.email === 'player@example.com' && s?.reply_to === null,
    `status ${r.status}, uid ${s?.uid}, email ${s?.email}`);
  check('with its context, the log in it, and the facts in their own columns',
    s?.topic === 'bug' && s?.shell === 'mac' && s?.app_version === '1.3.692' && s?.tier === 'pro' && s?.look === 'Fillmore 1967'
      && s?.has_logs === 1 && ctx?.diagnostics?.log?.[0]?.msg === 'device lost' && s?.status === 'new',
    `shell ${s?.shell}, version ${s?.app_version}, look ${s?.look}, logs ${s?.has_logs}`);
  const pic = s?.picture ? new Uint8Array(s.picture) : null;
  check('and its picture as JPEG bytes, not base64 in the context',
    pic && pic[0] === 0xff && pic[1] === 0xd8 && pic.length === 10 && ctx?.picture?.bytes === 10 && !s.context.includes('base64'),
    `${pic?.length ?? 0} bytes`);
  const m = mails[0]?.body;
  check('and it is mailed to support@, answered at the account',
    mails.length === 1 && m?.to?.[0] === 'support@chromaglass.art' && m?.reply_to === 'player@example.com' && mails[0].auth === 'Bearer re_test' && s?.emailed === 'sent',
    `${mails.length} mail, to ${m?.to}, reply ${m?.reply_to}, emailed ${s?.emailed}`);
  check('with a one-line subject, the note in the text, and the picture and entry attached',
    /^\[ChromaGlass\] Something broke: The ferrofluid froze after a pour$/.test(m?.subject ?? '') && m?.text?.includes('and then the plate went black')
      && m?.text?.includes(id) && m?.attachments?.map((a) => a.filename.split('-')[0]).join() === 'plate,feedback'
      && JSON.parse(Buffer.from(m.attachments[1].content, 'base64').toString()).diagnostics?.log?.length === 1,
    m?.subject);
}

// ── 2. Who it is from: only a token says ──
{
  const claims = await post(note({ uid: 'admin', email: 'boss@example.com' }));
  const forged = await post(note(), { auth: await token(forger.privateKey, 'user-b', 'forged@example.com') });
  const a = row(JSON.parse(claims.text).id);
  const b = row(JSON.parse(forged.text).id);
  check('a body that names a user is stored as nobody\'s', claims.status === 200 && a?.uid === null && a?.email === null, `uid ${a?.uid}`);
  check('and so is a forged token, kept but not believed', forged.status === 200 && b?.uid === null && b?.email === null, `uid ${b?.uid}`);
  mails = [];
  const typed = await post(note({ replyTo: 'listener@example.org', topic: 'idea', diagnostics: null, picture: null }));
  const c = row(JSON.parse(typed.text).id);
  check('a typed address is kept as reply_to and answered at, never as the account',
    c?.reply_to === 'listener@example.org' && c?.email === null && mails[0]?.body?.reply_to === 'listener@example.org' && c?.has_logs === 0 && c?.picture === null,
    `reply_to ${c?.reply_to}, mail reply ${mails[0]?.body?.reply_to}`);
  const junk = await post(note({ replyTo: 'x@y.z\nBcc: everyone@example.com' }));
  const d = row(JSON.parse(junk.text).id);
  check('and an address with a header in it is not kept', d?.reply_to === null, `reply_to ${JSON.stringify(d?.reply_to)}`);
}

// ── 3. What is refused ──
{
  const before = count();
  const cases = [
    ['the wrong kind', await post(note({ kind: 'chromaglass-crash-report', message: MARK }))],
    ['a bad topic', await post(note({ topic: MARK }))],
    ['an empty note', await post(note({ message: '   ' }))],
    ['an overlong note', await post(note({ message: MARK + 'x'.repeat(MAX_MESSAGE) }))],
    ['bad JSON', await post(null, { raw: `{"message":"${MARK}"` })],
    ['a body over the cap', await post(null, { raw: JSON.stringify(note({ message: MARK, pad: 'x'.repeat(MAX_BYTES) })) })],
  ];
  const wrong = cases.filter(([, r]) => r.status < 400 || r.status >= 500 || r.text.includes(MARK));
  check('the wrong kind, a bad topic, an empty or overlong note, bad JSON and an oversized body are refused, quoting nothing',
    wrong.length === 0 && count() === before,
    cases.map(([n, r]) => `${n} ${r.status}`).join(', '));
}

// ── 4. The hourly limit ──
{
  const results = [];
  for (let i = 0; i <= RATE_PER_HOUR; i++) results.push((await post(note(), { ip: '192.0.2.9' })).status);
  const other = await post(note(), { ip: '192.0.2.10' });
  check(`one address is held to ${RATE_PER_HOUR} an hour, and another is not`,
    results.slice(0, RATE_PER_HOUR).every((s) => s === 200) && results[RATE_PER_HOUR] === 429 && other.status === 200,
    `${results.filter((s) => s === 200).length} taken, then ${results[RATE_PER_HOUR]}; another address ${other.status}`);
  const stored = DB.raw.prepare("SELECT ip_hash FROM feedback WHERE ip_hash IS NOT NULL LIMIT 1").get();
  check('and the address is kept only as a hash', !!stored && !String(stored.ip_hash).includes('192.0.2') && /^[0-9a-f]{24}$/.test(stored.ip_hash), stored?.ip_hash);
}

// ── 5. The mail fails; the entry does not ──
{
  mailStatus = 500;
  const failed = await post(note());
  mailStatus = 200;
  const off = await post(note(), { env: { ...ENV, RESEND_API_KEY: undefined } });
  const f = row(JSON.parse(failed.text).id);
  const o = row(JSON.parse(off.text).id);
  check('a mail provider that fails costs the mail and not the entry', failed.status === 200 && f?.emailed === 'failed 500', `status ${failed.status}, emailed ${f?.emailed}`);
  check('and with no provider the entry is kept and says so', off.status === 200 && o?.emailed === 'off', `emailed ${o?.emailed}`);
  // Fill the day to its cap, then one more.
  const today = new Date().toISOString().slice(0, 10);
  const sentToday = Number(DB.raw.prepare("SELECT COUNT(*) AS n FROM feedback WHERE emailed = 'sent' AND at >= ?").get(`${today}T00:00:00.000Z`).n);
  const ins = DB.raw.prepare("INSERT INTO feedback (id, at, topic, message, context, emailed) VALUES (?, ?, 'other', 'filler', '{}', 'sent')");
  for (let i = sentToday; i < MAIL_PER_DAY; i++) ins.run(`${today}-fill-${i}`, new Date().toISOString());
  mails = [];
  const capped = await post(note());
  const c = row(JSON.parse(capped.text).id);
  check(`past ${MAIL_PER_DAY} mails a day the entry is kept and not mailed`, capped.status === 200 && c?.emailed === 'off: daily cap' && mails.length === 0, `emailed ${c?.emailed}, ${mails.length} mails`);
  DB.raw.prepare("DELETE FROM feedback WHERE id LIKE '%-fill-%'").run();
}

// ── 6. Reading ──
{
  const closed = await get('/feedback', null);
  const wrongTok = await get('/feedback', 'guess');
  const list = await get('/feedback?days=7');
  const data = await list.res.json();
  const ats = data.entries.map((e) => e.at);
  check('the list is closed without the token', closed.status === 401 && wrongTok.status === 401, `${closed.status}, ${wrongTok.status}`);
  check('and with it is newest first, without the context or the picture',
    list.status === 200 && data.total === count() && ats.every((a, i) => i === 0 || ats[i - 1] >= a)
      && data.entries.every((e) => !('context' in e) && !('picture' in e) && !('ip_hash' in e)) && data.byTopic.bug > 0,
    `${data.total} entries, ${JSON.stringify(data.byTopic)}`);
  const withPic = data.entries.find((e) => e.has_picture === 1);
  const one = await get(`/feedback/${withPic.id}`);
  const full = await one.res.json();
  check('one entry has its context and not the address hash or the bytes',
    one.status === 200 && full.context?.app?.look === 'Fillmore 1967' && !('ip_hash' in full) && !('picture' in full) && full.has_picture === true,
    `look ${full.context?.app?.look}`);
  const pic = await get(`/feedback/${withPic.id}/picture`);
  const bytes = new Uint8Array(await pic.res.arrayBuffer());
  check('the picture comes back as a JPEG', pic.status === 200 && pic.type === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8, `${pic.type}, ${bytes.length} bytes`);
  const done = await get(`/feedback/${withPic.id}/status`, 'reader-token', 'POST', { status: 'done' });
  const bad = await get(`/feedback/${withPic.id}/status`, 'reader-token', 'POST', { status: 'deleted' });
  const none = await get('/feedback/2026-01-01-nope/status', 'reader-token', 'POST', { status: 'read' });
  const shut = await get(`/feedback/${withPic.id}/status`, null, 'POST', { status: 'read' });
  check('a status is set to done, and a made-up status, an unknown entry and no token are refused',
    done.status === 200 && row(withPic.id).status === 'done' && bad.status === 400 && none.status === 404 && shut.status === 401,
    `done ${done.status}, bad ${bad.status}, unknown ${none.status}, no token ${shut.status}`);
}

// ── 7. CORS ──
{
  const pre = (origin) => worker.fetch(new Request('https://fb.example.workers.dev/feedback', { method: 'OPTIONS', headers: { Origin: origin } }), ENV, {});
  const site = await pre(SITE);
  const evil = await pre('https://example.com');
  check('a preflight from the site is answered, and one from elsewhere is not granted',
    site.status === 204 && site.headers.get('access-control-allow-origin') === SITE && !evil.headers.get('access-control-allow-origin'),
    `site ${site.headers.get('access-control-allow-origin')}, elsewhere ${evil.headers.get('access-control-allow-origin')}`);
}

// ── 8. The page's scrub ──
{
  const jwt = await token(google.privateKey, 'user-a', 'a@b.c');
  const dirty = {
    url: 'https://chromaglass.art/remote?key=relay-secret-123&look=fillmore',
    log: [
      { msg: `fetch failed with Authorization: Bearer ${jwt}` },
      { msg: 'licence cg1.eyJwYXlsb2FkIjoxfQ.c2lnbmF0dXJlLWJ5dGVz rejected' },
      { msg: 'live: rtmp://a.rtmp.youtube.com/live2/abcd-efgh-ijkl-mnop failed' },
      { msg: `token ${jwt} in a sentence` },
    ],
    settings: { keystone: 0.25, keyLight: 0.8, streamKey: 'sk-live-123', apiToken: 'tok', password: 'hunter2', note: 'keystone is fine' },
  };
  const clean = JSON.stringify(scrub(dirty));
  const leaked = ['relay-secret-123', jwt.split('.')[2], 'c2lnbmF0dXJlLWJ5dGVz', 'abcd-efgh-ijkl-mnop', 'sk-live-123', 'hunter2', '"tok"'].filter((s) => clean.includes(s));
  const kept = ['"keystone":0.25', '"keyLight":0.8', 'keystone is fine', 'look=fillmore', 'rtmp://a.rtmp.youtube.com/live2/', 'rejected'].filter((s) => !clean.includes(s));
  check('the scrub takes out a token, a licence key, a stream key, a ?key= and a secret-named field',
    leaked.length === 0, leaked.length ? `leaked ${leaked.join(', ')}` : 'none leaked');
  check('and leaves Keystone, Key Light and the words around them', kept.length === 0 && scrubText('plain words') === 'plain words', kept.length ? `lost ${kept.join(', ')}` : 'kept');
}

// ── 9. The mail's text, by itself ──
{
  const m = composeMail({ id: 'x', topic: 'love', message: 'Line one\r\nBcc: someone@example.com', email: null, reply_to: null, shell: 'browser', phone: 1, look: null, page: '/', user_agent: null, has_logs: 0 }, 'https://w');
  check('a subject never carries a second line', !/[\r\n]/.test(m.subject) && m.replyTo === null, JSON.stringify(m.subject));
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length ? 1 : 0);
