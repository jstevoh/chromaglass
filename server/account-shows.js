/**
 * Account-scoped directory of running shows (PLAN.md 23.14).
 *
 * A signed-in show server registers its local LAN relay address and show key
 * under the operator's Firebase account (`POST /account-shows` with
 * `Authorization: Bearer <idToken>`). A phone, tablet or laptop signed in to
 * the same account queries `GET /account-shows` with its own ID token, sees
 * the account's active shows in a list, and joins one with a tap. Once joined,
 * control traffic stays on the local network WebSocket.
 */

export const ACCOUNT_SHOWS_PATH = '/account-shows';
export const SHOW_TTL_MS = 90_000;
const MAX_SHOWS_PER_ACCOUNT = 16;
const MAX_BODY_BYTES = 16 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

function decodeBase64Url(input) {
  const padded = String(input)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(input).length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Extract and validate the account identity (`uid`, `aud`, `email`) from a
 * Firebase Auth ID token (production or Firebase Auth Emulator).
 */
export function verifyAccountToken(authHeader, now = Date.now()) {
  if (typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const parts = match[1].split('.');
  if (parts.length < 2 || parts.length > 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]));
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
    return null;
  }
  const uid = typeof payload.sub === 'string' && payload.sub.trim()
    ? payload.sub.trim()
    : typeof payload.user_id === 'string' && payload.user_id.trim()
      ? payload.user_id.trim()
      : null;
  const aud = typeof payload.aud === 'string' && payload.aud.trim() ? payload.aud.trim() : null;
  const iss = typeof payload.iss === 'string' ? payload.iss : '';
  const exp = Number(payload.exp);
  if (!uid || uid.length > 128 || !aud) return null;
  if (!iss.includes('securetoken') || !iss.endsWith('/' + aud)) return null;
  if (!Number.isFinite(exp) || exp * 1000 <= now - 30_000) return null;
  return {
    accountKey: `${aud}:${uid}`,
    uid,
    aud,
    email: typeof payload.email === 'string' ? payload.email : null,
  };
}

function validRelayOrigin(raw) {
  if (typeof raw !== 'string') return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function createAccountShowsStore() {
  /** @type {Map<string, Map<string, object>>} */
  const byAccount = new Map();

  function prune(accountKey, now = Date.now()) {
    const map = byAccount.get(accountKey);
    if (!map) return;
    for (const [id, entry] of map) {
      if (now - entry.updatedAt > SHOW_TTL_MS) map.delete(id);
    }
    if (map.size === 0) byAccount.delete(accountKey);
  }

  function list(accountKey, now = Date.now()) {
    prune(accountKey, now);
    const map = byAccount.get(accountKey);
    if (!map) return [];
    return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function upsert(accountKey, body, now = Date.now()) {
    if (!body || typeof body !== 'object') return null;
    const relay = validRelayOrigin(body.relay);
    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!relay || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) return null;
    const port = Number(body.port) > 0 && Number(body.port) <= 65535
      ? Math.trunc(Number(body.port))
      : Number(new URL(relay).port) || 3000;
    const hosts = Array.isArray(body.hosts)
      ? body.hosts.filter((h) => typeof h === 'string' && h.trim().length > 0 && h.length <= 128).slice(0, 8)
      : [];
    const id = typeof body.id === 'string' && body.id.trim()
      ? body.id.trim().slice(0, 64)
      : relay;
    const name = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : `Show (${new URL(relay).host})`;
    const url = typeof body.url === 'string' && validRelayOrigin(body.url)
      ? body.url
      : `${relay}/?remote=1&key=${encodeURIComponent(key)}`;

    prune(accountKey, now);
    let map = byAccount.get(accountKey);
    if (!map) {
      map = new Map();
      byAccount.set(accountKey, map);
    }
    if (!map.has(id) && map.size >= MAX_SHOWS_PER_ACCOUNT) {
      const oldest = [...map.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
      if (oldest) map.delete(oldest[0]);
    }
    const record = { id, name, relay, url, key, port, hosts, updatedAt: now };
    map.set(id, record);
    return record;
  }

  function remove(accountKey, id) {
    const map = byAccount.get(accountKey);
    if (!map) return;
    if (typeof id === 'string' && id.trim()) {
      map.delete(id.trim());
      if (map.size === 0) byAccount.delete(accountKey);
    } else {
      byAccount.delete(accountKey);
    }
  }

  return { list, upsert, remove };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += String(chunk);
      if (raw.length > MAX_BODY_BYTES) {
        reject(new Error('too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

export function createAccountShowsHandler(store = createAccountShowsStore()) {
  return async function handleAccountShows(req, res, url) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const auth = verifyAccountToken(req.headers.authorization ?? '');
    if (!auth) {
      sendJson(res, 401, { error: 'unauthorised' });
      return;
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { shows: store.list(auth.accountKey) });
      return;
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        sendJson(res, 400, { error: 'invalid body' });
        return;
      }
      const record = store.upsert(auth.accountKey, body);
      if (!record) {
        sendJson(res, 400, { error: 'invalid show' });
        return;
      }
      sendJson(res, 200, { ok: true, show: record, shows: store.list(auth.accountKey) });
      return;
    }

    if (req.method === 'DELETE') {
      let body = {};
      try {
        body = await readJsonBody(req);
      } catch {
        body = {};
      }
      const id = body?.id ?? url?.searchParams?.get('id') ?? null;
      store.remove(auth.accountKey, id);
      sendJson(res, 200, { ok: true, shows: store.list(auth.accountKey) });
      return;
    }

    sendJson(res, 405, { error: 'method not allowed' });
  };
}
