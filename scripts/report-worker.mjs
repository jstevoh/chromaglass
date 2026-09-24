#!/usr/bin/env node
/**
 * The crash-report Worker, run in Node against in-memory R2 and KV
 * (server/report-worker.js, docs/crash-plan.md).
 *
 *   npm run report-worker
 *
 * The endpoint is public and the only thing it does is take what strangers
 * send, so what is checked is mostly what it refuses:
 *
 *   1. a real report is stored — the JSON without its picture, the picture as
 *      a JPEG beside it, and a small index record naming the line it died on;
 *   2. the wrong kind, a body that is not JSON, and one over the cap are
 *      refused, and no refusal quotes what was sent;
 *   3. a preflight from the site is answered, and one from elsewhere is not
 *      granted;
 *   4. the digest groups two reports whose lines differ only in their numbers,
 *      and is closed without the token;
 *   5. an address sending more than the hourly limit gets 429;
 *   6. the cron writes yesterday's digest to R2.
 *
 * Node 22 has Request, Response and crypto as globals, which is all the
 * Worker uses; the fakes below implement only the calls it makes.
 */

import worker, { MAX_BYTES, RATE_PER_HOUR, normalise } from '../server/report-worker.js';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Fakes ──

class FakeR2 {
  constructor() { this.objects = new Map(); }
  async put(key, value, opts) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: opts?.httpMetadata?.contentType });
  }
  async get(key) {
    const o = this.objects.get(key);
    if (!o) return null;
    return { text: async () => new TextDecoder().decode(o.bytes), arrayBuffer: async () => o.bytes.buffer };
  }
}

class FakeKV {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.has(key) ? this.values.get(key).value : null; }
  async put(key, value, opts) { this.values.set(key, { value: String(value), ttl: opts?.expirationTtl }); }
  async list({ prefix = '', cursor } = {}) {
    // Pages of two, so the Worker's cursor loop is exercised as well.
    const all = [...this.values.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const keys = all.slice(start, start + 2).map((name) => ({ name }));
    const done = start + 2 >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(start + 2) };
  }
}

const TOKEN = 'test-token-not-a-secret';
const makeEnv = () => ({ REPORTS: new FakeR2(), REPORT_INDEX: new FakeKV(), DIGEST_TOKEN: TOKEN });

const SITE = 'https://chromaglass.web.app';
let ipSeq = 0;
const post = (env, body, { ip = `10.0.0.${++ipSeq}`, origin = SITE, type = 'application/json' } = {}) =>
  worker.fetch(new Request('https://reports.example/report', {
    method: 'POST',
    headers: { 'Content-Type': type, Origin: origin, 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), env);
const get = (env, path, token = TOKEN) =>
  worker.fetch(new Request(`https://reports.example${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }), env);

// A tiny but real JPEG header, then filler: enough for the magic check.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, ...Array(200).fill(7), 0xff, 0xd9]);
const report = (fatalMsg, extra = {}) => ({
  kind: 'chromaglass-crash-report',
  version: 1,
  at: new Date().toISOString(),
  note: 'it stopped during the second song',
  url: 'https://chromaglass.web.app/?look=classic',
  env: { userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140' },
  snapshot: { rung: '512²@1x', engine: 'webgpu' },
  debug: {},
  look: null,
  log: [
    { t: 1, up: 0, load: 'a', level: 'info', source: 'boot', msg: 'load' },
    { t: 2, up: 20, load: 'a', level: 'fatal', source: 'heartbeat', msg: fatalMsg },
  ],
  previous: [],
  screenshot: { dataUrl: `data:image/jpeg;base64,${JPEG.toString('base64')}`, width: 960, height: 540, painted: true },
  ...extra,
});

// ── 1. A real report ──
{
  const env = makeEnv();
  const res = await post(env, report('no frame for 20s with the tab visible (1234 drawn this load): the plate has stopped'));
  const body = await res.json();
  check('a valid report is accepted', res.status === 200 && body.ok === true && typeof body.id === 'string', `${res.status} ${JSON.stringify(body)}`);
  check('the answer carries only ok and id', Object.keys(body).sort().join() === 'id,ok');
  check('CORS grants the site', res.headers.get('Access-Control-Allow-Origin') === SITE);

  const day = body.id.slice(0, 10);
  const jsonKey = `reports/${day}/${body.id}.json`;
  const jpgKey = `reports/${day}/${body.id}.jpg`;
  const stored = env.REPORTS.objects.get(jsonKey);
  check('the report is stored as JSON under reports/<day>/<id>.json', !!stored && stored.type === 'application/json', [...env.REPORTS.objects.keys()].join(', '));
  const parsed = stored ? JSON.parse(new TextDecoder().decode(stored.bytes)) : {};
  check('the stored JSON holds a reference, not the base64', parsed.screenshot?.key === jpgKey && !JSON.stringify(parsed).includes('base64'), JSON.stringify(parsed.screenshot));
  const jpg = env.REPORTS.objects.get(jpgKey);
  check('the picture is stored as a decoded JPEG', !!jpg && jpg.type === 'image/jpeg' && Buffer.from(jpg.bytes).equals(JPEG), jpg ? `${jpg.bytes.length} bytes` : 'missing');

  const idx = [...env.REPORT_INDEX.values.entries()].find(([k]) => k.startsWith(`idx:${day}:`));
  const rec = idx ? JSON.parse(idx[1].value) : {};
  check('an index record names the fatal line', rec.id === body.id && /\[fatal\] heartbeat: no frame for 20s/.test(rec.line ?? ''), rec.line);
  check('the index record carries url, UA, note, and a TTL', rec.url?.startsWith('https://chromaglass.web.app') && rec.ua?.includes('Chrome') && rec.note?.includes('second song') && idx[1].ttl > 0);

  const one = await get(env, `/report/${body.id}`);
  const oneBody = await one.json();
  check('GET /report/<id> returns the stored report', one.status === 200 && oneBody.received?.id === body.id && oneBody.screenshot?.key === jpgKey);
  check('GET /report/<id> is closed without the token', (await get(env, `/report/${body.id}`, null)).status === 401);
}

// ── 1b. No fatal this load: the previous load's last line, not its pagehide ──
{
  const env = makeEnv();
  const res = await post(env, report('x', {
    log: [{ t: 1, up: 0, load: 'b', level: 'warn', source: 'boot', msg: 'the previous load ended without unloading' }],
    previous: [
      { t: 0, up: 5, load: 'a', level: 'error', source: 'gpu', msg: 'Device lost: destroyed' },
      { t: 0, up: 6, load: 'a', level: 'info', source: 'unload', msg: 'pagehide' },
    ],
    screenshot: null,
  }));
  const { id } = await res.json();
  const rec = JSON.parse([...env.REPORT_INDEX.values.entries()].find(([k]) => k.includes(id))[1].value);
  check('with no fatal, the line is the previous load\'s last non-unload line', rec.line === '[error] gpu: Device lost: destroyed', rec.line);
  check('a report without a picture stores no .jpg', ![...env.REPORTS.objects.keys()].some((k) => k.endsWith('.jpg')));
}

// ── 2. Refusals ──
{
  const env = makeEnv();
  const wrong = await post(env, { ...report('x'), kind: 'something-else', note: '<script>alert(1)</script>' });
  const wrongText = await wrong.text();
  check('the wrong kind is 400', wrong.status === 400, wrongText);
  check('a refusal does not echo the body', !wrongText.includes('script') && !wrongText.includes('something-else'));

  const bad = await post(env, '{"kind": "chromaglass-crash-report", oops');
  check('a body that is not JSON is 400', bad.status === 400);

  const notJson = await post(env, 'kind=chromaglass-crash-report', { type: 'text/plain' });
  check('a non-JSON content type is refused', notJson.status === 415);

  const huge = 'x'.repeat(MAX_BYTES + 1);
  const big = await post(env, JSON.stringify({ ...report('x'), note: huge }));
  check('a body over the cap is 413', big.status === 413, `cap ${MAX_BYTES} bytes`);

  const fakeJpeg = await post(env, report('x', { screenshot: { dataUrl: 'data:text/html;base64,PHNjcmlwdD4=', width: 1, height: 1, painted: true } }));
  const fjId = (await fakeJpeg.json()).id;
  check('a picture that is not a JPEG is not stored', fakeJpeg.status === 200 && ![...env.REPORTS.objects.keys()].some((k) => k.includes(fjId) && k.endsWith('.jpg')));

  check('nothing refused was stored', [...env.REPORTS.objects.keys()].every((k) => k.includes(fjId)), [...env.REPORTS.objects.keys()].join(', '));
  check('GET /report is 405', (await get(env, '/report')).status === 405);
  check('an unknown path is 404', (await get(env, '/admin')).status === 404);
}

// ── 3. CORS ──
{
  const env = makeEnv();
  const pre = (origin) => worker.fetch(new Request('https://reports.example/report', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  }), env);
  const site = await pre(SITE);
  check('a preflight from the site is granted', site.status === 204
    && site.headers.get('Access-Control-Allow-Origin') === SITE
    && /POST/.test(site.headers.get('Access-Control-Allow-Methods') ?? '')
    && /content-type/i.test(site.headers.get('Access-Control-Allow-Headers') ?? ''));
  const dev = await pre('http://localhost:3000');
  check('a preflight from localhost is granted', dev.headers.get('Access-Control-Allow-Origin') === 'http://localhost:3000');
  const other = await pre('https://evil.example');
  check('a preflight from elsewhere is not granted', !other.headers.get('Access-Control-Allow-Origin'));
}

// ── 4. The digest ──
{
  const env = makeEnv();
  await post(env, report('no frame for 20s with the tab visible (1234 drawn this load): the plate has stopped'));
  await post(env, report('no frame for 20s with the tab visible (88 drawn this load): the plate has stopped'));
  await post(env, report('3 device losses in 60s (last: unknown); recovery is not holding'));
  const res = await get(env, '/digest?days=1');
  const d = await res.json();
  const top = d.groups?.[0];
  check('the digest counts every report', res.status === 200 && d.total === 3, JSON.stringify(d).slice(0, 200));
  check('two lines differing only in numbers are one group', d.groups?.length === 2 && top.count === 2 && top.examples.length === 2,
    d.groups?.map((g) => `${g.count}× ${g.group}`).join(' | '));
  check('the groups are sorted by count, with first and last seen', top.firstSeen <= top.lastSeen && d.groups[1].count === 1);
  check('normalise folds numbers and hex ids', normalise('adapter 0x1a2b at 12.5 ms, chunk index-4f3a9c2e') === normalise('adapter 0xffee at 3 ms, chunk index-00aa11bb'));
  check('the digest is closed without the token', (await get(env, '/digest?days=1', null)).status === 401);
  check('the digest is closed with the wrong token', (await get(env, '/digest?days=1', 'guess')).status === 401);
  check('the digest is closed when no token is configured', (await get({ ...env, DIGEST_TOKEN: undefined }, '/digest?days=1')).status === 401);
}

// ── 5. The rate limit ──
{
  const env = makeEnv();
  const statuses = [];
  for (let i = 0; i < RATE_PER_HOUR + 2; i++) statuses.push((await post(env, report('x', { screenshot: null }), { ip: '203.0.113.9' })).status);
  const oks = statuses.filter((s) => s === 200).length;
  check(`one address gets ${RATE_PER_HOUR} an hour, then 429`, oks === RATE_PER_HOUR && statuses.slice(RATE_PER_HOUR).every((s) => s === 429), statuses.join(','));
  check('another address is not held up by it', (await post(env, report('x', { screenshot: null }), { ip: '203.0.113.10' })).status === 200);
}

// ── 6. The cron ──
{
  const env = makeEnv();
  await post(env, report('no frame for 20s (5 drawn)'));
  // "Yesterday", from a run a day after now.
  await worker.scheduled({ scheduledTime: Date.now() + 24 * 3600 * 1000 }, env, { waitUntil() {} });
  const day = new Date().toISOString().slice(0, 10);
  const obj = env.REPORTS.objects.get(`digests/${day}.json`);
  const d = obj ? JSON.parse(new TextDecoder().decode(obj.bytes)) : null;
  check('the cron writes yesterday\'s digest to digests/<day>.json', d?.total === 1 && d.groups[0].count === 1, obj ? `${d.total} report(s)` : 'missing');
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
