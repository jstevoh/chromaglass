// Cloudflare Worker — audio-fingerprint proxy for ChromaGlass.
//
// Keeps the AudD (or ACRCloud) API key server-side. The client POSTs a short
// WAV snippet as multipart form-data (field "file"); the worker forwards it to
// the fingerprinting service and returns a normalized JSON response:
//
//   { isrc, title, artist, album, durationSec, offsetSec }
//
// Every lookup it passes on is paid for from the owner's AudD or ACRCloud
// account, and its address is in the public bundle (VITE_FINGERPRINT_PROXY_URL),
// so anyone who reads the bundle can call it. Until PLAN 14o it answered every
// origin with `*`, read any body before measuring it, and had no limit at all:
// one script in a loop could spend the month's lookups in an afternoon. So a
// request now passes these gates in this order, each before anything costs:
//
//   1. its Origin is the site, a localhost, or the show server on a private
//      network (403 otherwise, and for no Origin at all: a browser always sends
//      one on a cross-origin POST, so only a script sends none);
//   2. the counter store is bound (503 otherwise: unmetered is not a mode);
//   3. it says how big it is, and that is at most MAX_BYTES (411 / 413), read
//      from Content-Length before `formData()` touches the body;
//   4. its address has made fewer than RATE_PER_HOUR this hour (429), where on
//      IPv6 the address is the /64, since one phone can take any of 2^64;
//   5. the day has made fewer than DAILY_LIMIT (503 { error: 'busy' }).
//
// Only then is the body parsed, the file's own size checked again (a
// Content-Length is the sender's word), and the service asked. The app reads any
// refusal as "no match" (src/lib/fingerprint.ts), which is what a song the
// service did not know looks like too, so a busy day costs a song title, not
// the show. `npm run fingerprint-worker` checks each gate, and that a refused
// request never reached the service.
//
// The Origin gate stops browsers on other sites; a script can claim any Origin,
// which is what 4 and 5 are for. The daily ceiling is the one that bounds the
// bill whoever is asking, and FINGERPRINT_DAILY_LIMIT (a plain var in
// wrangler.toml) moves it to fit the owner's plan.
//
// Deploy (wrangler.toml holds the bindings):
//   1. npm i -g wrangler && wrangler login
//   2. wrangler kv namespace create FINGERPRINT_LIMITS, and put its id in wrangler.toml
//   3. wrangler deploy
//   4. wrangler secret put AUDD_API_TOKEN   (get a token at https://audd.io)
//   5. Set VITE_FINGERPRINT_PROXY_URL to the deployed worker URL in .env
//
// To use ACRCloud instead, set ACR_HOST / ACR_ACCESS_KEY / ACR_ACCESS_SECRET
// secrets — the worker prefers ACRCloud when those are present.

import { DEFAULT_PUBLIC_JWK, verifyLicenseKey } from './license-key.js';

/** A ten-second snippet is ~880 kB as 16-bit mono WAV at 44.1 kHz; twice that is room to spare. */
export const MAX_BYTES = 2 * 1024 * 1024;
/** Lookups per address (IPv6: per /64) per hour. A set changes song every few minutes. */
export const RATE_PER_HOUR = 30;
/** Lookups per hour when a valid signed licence key is presented (PLAN 23.3). */
export const KEY_RATE_PER_HOUR = 120;
/** Lookups a day across everyone, unless FINGERPRINT_DAILY_LIMIT says otherwise. */
export const DAILY_LIMIT = 1000;

// The site; any localhost (`npm run dev`, the Mac app's show server); and the show
// server reached over the Wi-Fi, which is plain http on a private address with
// a port. The lookalike `https://chromaglass.web.app.example` fails on the `$`.
const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?chromaglass\.art$/,
  /^https:\/\/chromaglass\.web\.app$/,
  /^https:\/\/chromaglass\.firebaseapp\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^http:\/\/(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/,
  /^capacitor:\/\/localhost$/,
];

const CORS_BASE = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-ChromaGlass-Key',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};

function allowed(origin) {
  return !!origin && ALLOWED_ORIGINS.some((re) => re.test(origin));
}

function corsFor(request) {
  const origin = request.headers.get('Origin');
  return allowed(origin) ? { ...CORS_BASE, 'Access-Control-Allow-Origin': origin } : { ...CORS_BASE };
}

function extractLicenseKey(request) {
  const headerKey = request.headers.get('X-ChromaGlass-Key');
  if (headerKey && headerKey.trim()) return headerKey.trim();
  const auth = request.headers.get('Authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  return null;
}

export default {
  async fetch(request, env) {
    const cors = corsFor(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!allowed(request.headers.get('Origin'))) return json({ error: 'not from the show' }, 403, cors);
    const kv = env.FINGERPRINT_LIMITS;
    if (!kv) return json({ error: 'not configured' }, 503, cors);

    const length = request.headers.get('Content-Length');
    if (length == null || !/^\d+$/.test(length)) return json({ error: 'length required' }, 411, cors);
    if (Number(length) > MAX_BYTES) return json({ error: 'snippet too large' }, 413, cors);

    // PLAN 23.3: licence key check, after 14o's origin and size gates and before
    // any counter write, body read, or paid lookup.
    const rawKey = extractLicenseKey(request);
    let verifiedKey = null;
    if (rawKey) {
      const checkRes = await verifyLicenseKey(rawKey, env.LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_JWK);
      if (!checkRes.valid) return json({ error: 'invalid licence key' }, 401, cors);
      verifiedKey = checkRes.payload;
    } else if (env.REQUIRE_LICENSE_KEY && env.REQUIRE_LICENSE_KEY !== '0') {
      return json({ error: 'licence key required' }, 401, cors);
    }

    const hourLimit = verifiedKey ? KEY_RATE_PER_HOUR : RATE_PER_HOUR;
    const hourKey = `rl:${addressOf(request)}:${Math.floor(Date.now() / 3_600_000)}`;
    const dayKey = `day:${Math.floor(Date.now() / 86_400_000)}`;
    const ceiling = Number(env.FINGERPRINT_DAILY_LIMIT) || DAILY_LIMIT;
    // A counter that cannot be read or written is a refusal, not a pass: KV
    // throws past its plan's writes for the day (a thousand on the free plan,
    // two a lookup) and on a second write to one key inside a second, and a
    // throw out of here was a 500 with no CORS, which the page cannot even read.
    // Failing closed costs a lookup now and then; failing open is the bill.
    try {
      const hourCount = Number(await kv.get(hourKey)) || 0;
      if (hourCount >= hourLimit) return json({ error: 'too many lookups' }, 429, cors);
      const dayCount = Number(await kv.get(dayKey)) || 0;
      if (dayCount >= ceiling) return json({ error: 'busy' }, 503, cors);
      // Counted before the lookup, so a request that fails after this still counts:
      // what is bounded is what is asked of the service. KV is eventually consistent
      // and has no increment, so two at once can both read n; the overshoot is a
      // few lookups, not a loop's worth.
      await kv.put(hourKey, String(hourCount + 1), { expirationTtl: 3700 });
      await kv.put(dayKey, String(dayCount + 1), { expirationTtl: 2 * 86_400 });
    } catch {
      return json({ error: 'busy' }, 503, cors);
    }

    let file;
    try {
      const form = await request.formData();
      file = form.get('file');
    } catch {
      return json({ error: 'expected multipart form-data with a "file" field' }, 400, cors);
    }
    if (!file || typeof file === 'string') return json({ error: 'missing audio file' }, 400, cors);
    if (file.size > MAX_BYTES) return json({ error: 'snippet too large' }, 413, cors);

    try {
      if (env.ACR_HOST && env.ACR_ACCESS_KEY && env.ACR_ACCESS_SECRET) {
        return json(await identifyAcrCloud(file, env), 200, cors);
      }
      if (env.AUDD_API_TOKEN) {
        return json(await identifyAudd(file, env), 200, cors);
      }
      return json({ error: 'no fingerprint service configured' }, 503, cors);
    } catch (e) {
      return json({ error: String(e) }, 502, cors);
    }
  },
};

/**
 * Who is asking, for the hourly count: Cloudflare's CF-Connecting-IP, and on
 * IPv6 only its first four groups. A phone or a host on IPv6 is handed a whole
 * /64 and can send each request from a new address in it, so counting full
 * addresses would count nothing.
 */
function addressOf(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right] : left;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
}

async function identifyAudd(file, env) {
  const form = new FormData();
  form.append('api_token', env.AUDD_API_TOKEN);
  form.append('file', file, 'snippet.wav');
  form.append('return', 'timecode');
  const res = await fetch('https://api.audd.io/', { method: 'POST', body: form });
  const data = await res.json();
  if (data && data.status === 'error') {
    throw new Error(`AudD: ${data.error && data.error.error_message ? data.error.error_message : JSON.stringify(data.error)}`);
  }
  const r = data && data.result;
  if (!r) return { match: false };
  return {
    match: true,
    isrc: r.isrc || null,
    title: r.title,
    artist: r.artist,
    album: r.album || null,
    offsetSec: parseTimecode(r.timecode),
    durationSec: null,
  };
}

function parseTimecode(tc) {
  if (!tc || typeof tc !== 'string') return null;
  const parts = tc.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

async function identifyAcrCloud(file, env) {
  const httpMethod = 'POST';
  const httpUri = '/v1/identify';
  const dataType = 'audio';
  const signatureVersion = '1';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = [httpMethod, httpUri, env.ACR_ACCESS_KEY, dataType, signatureVersion, timestamp].join('\n');

  const keyData = new TextEncoder().encode(env.ACR_ACCESS_SECRET);
  const key = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  const form = new FormData();
  form.append('sample', file, 'snippet.wav');
  form.append('sample_bytes', String(file.size));
  form.append('access_key', env.ACR_ACCESS_KEY);
  form.append('data_type', dataType);
  form.append('signature_version', signatureVersion);
  form.append('signature', signature);
  form.append('timestamp', timestamp);

  const res = await fetch(`https://${env.ACR_HOST}${httpUri}`, { method: 'POST', body: form });
  const data = await res.json();
  const music = data && data.metadata && data.metadata.music && data.metadata.music[0];
  if (!music) return { match: false };
  return {
    match: true,
    isrc: (music.external_ids && music.external_ids.isrc) || null,
    title: music.title,
    artist: (music.artists && music.artists.map(a => a.name).join(', ')) || 'Unknown',
    album: (music.album && music.album.name) || null,
    offsetSec: typeof music.play_offset_ms === 'number' ? music.play_offset_ms / 1000 : null,
    durationSec: typeof music.duration_ms === 'number' ? music.duration_ms / 1000 : null,
  };
}

function json(obj, status = 200, cors = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
