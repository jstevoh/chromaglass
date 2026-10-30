// Cloudflare Worker — licence keys and machine activations for ChromaGlass (PLAN.md 23.4, 23.12).
//
// The merchant of record (Paddle or Lemon Squeezy) POSTs checkout, upgrade and
// refund events to `/webhook`, signed with `WEBHOOK_SECRET`. Each key is an
// Ed25519-signed token (`server/license-key.js`) filed in Workers KV (`LICENSE_KV`)
// under the buyer's email (`keys:<email>`) and by key id (`key:<id>`).
//
// A signed-in ChromaGlass app or browser asks `GET /keys` with its Firebase ID
// token (`Authorization: Bearer <token>`), verified against Google's RS256
// public keys (or the Auth emulator in local tests), and receives only the
// keys belonging to that token's verified email address.
//
// Machine activations (`POST /activate`, `POST /deactivate`) enforce the
// two-machines-per-key rule in `LICENSE_KV` (`machines:<keyId>`). Once a
// machine has its signed token, the app verifies the Ed25519 signature offline
// at every launch and never calls home during a gig.

import {
  DEFAULT_PUBLIC_JWK,
  MAX_MACHINES_PER_KEY,
  ONE_YEAR_MS,
  signLicenseKey,
  verifyLicenseKey,
} from './license-key.js';
import { SYNC_PATH, handleSync } from './cloud-sync.js';

const ALLOWED_ORIGINS = [
  /^https:\/\/(www\.)?chromaglass\.art$/,
  /^https:\/\/chromaglass\.web\.app$/,
  /^https:\/\/chromaglass\.firebaseapp\.com$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^capacitor:\/\/localhost$/,
];

export const MAX_BYTES = 64 * 1024;

const CORS_BASE = {
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, Paddle-Signature',
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
      if (!env?.LICENSE_KV) return json({ error: 'not configured' }, 503, cors);
      if (!env?.LICENSE_PRIVATE_KEY) {
        return json({ error: 'LICENSE_PRIVATE_KEY is not configured' }, 500, cors);
      }

      if (url.pathname === '/webhook') {
        if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
        return await handleWebhook(request, env, cors);
      }
      if (url.pathname === SYNC_PATH) {
        return await handleSync(request, env, cors, verifyFirebaseIdToken);
      }
      if (url.pathname === '/keys') {
        if (request.method !== 'GET') return json({ error: 'GET only' }, 405, cors);
        return await handleGetKeys(request, env, cors);
      }
      if (url.pathname === '/preferences') {
        if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
        return await handlePostPreferences(request, env, cors);
      }
      if (url.pathname === '/activate') {
        if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
        return await handleActivate(request, env, cors, true);
      }
      if (url.pathname === '/deactivate') {
        if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
        return await handleActivate(request, env, cors, false);
      }
      return json({ error: 'not found' }, 404, cors);
    } catch {
      return json({ error: 'internal error' }, 500, cors);
    }
  },
};

// ── POST /webhook ────────────────────────────────────────────────

async function handleWebhook(request, env, cors) {
  const secret = env.WEBHOOK_SECRET;
  if (!secret || typeof secret !== 'string') return json({ error: 'unauthorised' }, 401, cors);
  const privateJwk = env.LICENSE_PRIVATE_KEY;
  if (!privateJwk) return json({ error: 'LICENSE_PRIVATE_KEY is not configured' }, 500, cors);

  const sigHeader =
    request.headers.get('X-Signature') ||
    request.headers.get('Paddle-Signature') ||
    '';
  if (!sigHeader) return json({ error: 'unauthorised' }, 401, cors);

  const rawBody = await readCapped(request, MAX_BYTES);
  if (rawBody == null) return json({ error: 'too large' }, 413, cors);

  const validSig = await verifyWebhookHmac(rawBody, sigHeader, secret);
  if (!validSig) return json({ error: 'unauthorised' }, 401, cors);

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'not JSON' }, 400, cors);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'expected an object' }, 400, cors);
  }

  // Support both our direct JSON payload and Lemon Squeezy's native JSON:API webhook payload
  const lsAttr = body.data?.attributes || {};
  const lsItem = lsAttr.first_order_item || {};
  const lsProductId = Number(lsItem.product_id || 0);
  // Lemon Squeezy numbers a store's live products afresh, apart from its test-mode copies
  // (1450525 Home, 1450531 Pro, 1450532 Upgrade), so the live ones (1479217 Home, 1479219 Pro,
  // 1479218 Upgrade) are built in beside them, so a deploy that forgets the settings cannot hold
  // every paid order, and a later store can add its own as Worker settings
  // (`LS_HOME_PRODUCT_IDS`, `LS_PRO_PRODUCT_IDS`, `LS_UPGRADE_PRODUCT_IDS`, comma separated). A Lemon Squeezy order files a key only for a
  // product on one of the three lists. Until 2026-10-28 an id on none of them fell back to the
  // product's name ("pro", "upgrade") and, failing that, to a Home key, so anything else sold in
  // the store, or a product reworded, would have handed out a Home key for whatever it cost
  // (the security audit, finding 5). An order for a product we do not know answers 200 so the
  // store does not retry, files nothing, and is held for the owner (`holdOrder`). Our own direct
  // JSON (no `data.attributes`, signed with the same secret) names its tier itself and is untouched.
  // The test Home id was written as 1450530 when the list went in; the store's test Home is
  // 1450525 (read from the dashboard and from its own order_created of 2026-10-24, whose
  // `first_order_item.product_id` is 1450525), so every paid test Home order was being held as
  // an unknown product. The live ids were read from the dashboard the same day and match.
  const isLs = Boolean(body.data && typeof body.data === 'object' && body.data.attributes);
  const lsStatus = String(lsAttr.status || '').toLowerCase();
  const productKind = !isLs
    ? null
    : productIdIn(env.LS_UPGRADE_PRODUCT_IDS, lsProductId, [1450532, 1479218])
      ? 'upgrade'
      : productIdIn(env.LS_PRO_PRODUCT_IDS, lsProductId, [1450531, 1479219])
        ? 'pro'
        : productIdIn(env.LS_HOME_PRODUCT_IDS, lsProductId, [1450525, 1479217])
          ? 'home'
          : 'unknown';
  const rawEvent = String(body.event || body.meta?.event_name || '');
  const isLsUpgrade = rawEvent === 'order_created' && productKind === 'upgrade';
  const event = isLsUpgrade ? 'order_upgraded' : rawEvent;

  const rawEmail = body.email || lsAttr.user_email || body.meta?.custom_data?.email || '';
  const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const rawOrderId = body.orderId || body.data?.id || lsItem.order_id || '';
  const orderId = rawOrderId ? String(rawOrderId).trim() : '';

  // A test-mode order is one nobody paid for: Lemon Squeezy's checkout takes its published test
  // card, so anyone who finds the buy link could otherwise mint a real signed key for nothing. A
  // test order (`meta.test_mode`, or the order's own `test_mode`) files nothing unless the buyer's
  // email is on `TEST_MODE_EMAILS` (comma separated, a Worker secret, never committed), which is
  // how the owner proves the path end to end. It answers 200 so the store does not retry; a
  // payload without the flag (our own direct JSON) is untouched. Found in the review of #428
  // (2026-10-22): until this, the account sheet's Buy buttons (#394) handed a signed key to anyone
  // who paid with the test card.
  const flagged = (v) => v === true || v === 'true';
  if (flagged(body.meta?.test_mode) || flagged(lsAttr.test_mode)) {
    const allowed = String(env.TEST_MODE_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (!email || !allowed.includes(email)) return json({ ok: true, ignored: 'test mode' }, 200, cors);
  }
  const keyId =
    (typeof body.keyId === 'string' && body.keyId ? body.keyId.trim() : '') ||
    (orderId ? `key_${orderId}` : `key_${Date.now().toString(36)}_${rand(6)}`);

  // A Lemon Squeezy order files a key only when its product is one we sell and the order is
  // paid. `order_created` also fires for an order still `pending` (a payment that has not
  // cleared) or `failed`, and until 2026-10-28 every one of them was minted a key (the
  // security audit, finding 6). A held order files nothing; the owner sees it in KV under
  // `held:<order>` and in the Worker's log, and a paid order Lemon Squeezy re-sends files its
  // key as normal.
  if (isLs && (event === 'order_created' || event === 'order_upgraded')) {
    if (productKind === 'unknown') {
      return await holdOrder(env, cors, keyId, { reason: 'unknown product', email, productId: lsProductId, status: lsStatus });
    }
    if (lsStatus !== 'paid') {
      return await holdOrder(env, cors, keyId, { reason: 'not paid', email, productId: lsProductId, status: lsStatus });
    }
    // The paid `order_created` of an order already refunded, delivered again (the store retries a
    // webhook it thinks failed, and its dashboard can resend one), would file the key the refund
    // took away: the payload still says `paid`, only the order's later events say otherwise
    // (the review of #560). A refund leaves `refunded:<order>`, and a created order whose key id
    // is already revoked is the same order; both are held, not filed.
    const alreadyRefunded =
      (orderId && (await env.LICENSE_KV.get(`refunded:${orderId}`))) ||
      (event === 'order_created' && (await readKeyById(env, keyId))?.revoked);
    if (alreadyRefunded) {
      return await holdOrder(env, cors, keyId, { reason: 'order already refunded', email, productId: lsProductId, status: lsStatus });
    }
  }

  if (event === 'order_created' || event === 'license_created') {
    if (!email || !email.includes('@')) return json({ error: 'missing email' }, 400, cors);
    const tier = (isLs ? productKind === 'pro' : body.tier === 'pro') ? 'pro' : 'home';
    const now = typeof body.issuedAt === 'number' ? body.issuedAt : Date.now();
    const updatesUntil = typeof body.updatesUntil === 'number' ? body.updatesUntil : now + ONE_YEAR_MS;
    const maxMachines = typeof body.maxMachines === 'number' ? body.maxMachines : MAX_MACHINES_PER_KEY;

    const token = await signLicenseKey(
      { id: keyId, tier, email, issuedAt: now, updatesUntil, maxMachines },
      privateJwk,
    );
    const record = {
      id: keyId,
      orderId: orderId || keyId,
      tier,
      email,
      token,
      issuedAt: now,
      updatesUntil,
      maxMachines,
      revoked: false,
    };

    const existing = await readEmailKeys(env, email);
    const filtered = existing.filter((k) => k.id !== keyId && k.orderId !== record.orderId);
    filtered.push(record);
    await env.LICENSE_KV.put(`keys:${email}`, JSON.stringify(filtered));
    await env.LICENSE_KV.put(`key:${keyId}`, JSON.stringify(record));
    return json({ ok: true, id: keyId, tier }, 200, cors);
  }

  if (event === 'order_upgraded') {
    if (!email || !email.includes('@')) return json({ error: 'missing email' }, 400, cors);
    const existing = await readEmailKeys(env, email);
    const target = existing.find(
      (k) =>
        !k.revoked &&
        ((body.keyId && k.id === body.keyId) ||
          (orderId && k.orderId === orderId) ||
          k.tier === 'home'),
    );
    // An Upgrade is priced ($164) as Pro less the Home the buyer already holds. With no Home key
    // on file for this email it was minting a Pro key anyway, which undercut Pro at $199 (the
    // security audit, finding 5); now it is held for the owner, who refunds it or files the Home.
    if (!target) {
      return await holdOrder(env, cors, keyId, { reason: 'upgrade with no Home key', email, productId: lsProductId, status: lsStatus });
    }
    const now = typeof body.issuedAt === 'number' ? body.issuedAt : Date.now();
    const updatesUntil = typeof body.updatesUntil === 'number' ? body.updatesUntil : now + ONE_YEAR_MS;
    const maxMachines = target?.maxMachines ?? MAX_MACHINES_PER_KEY;
    const upgradedId = target?.id ?? keyId;

    const token = await signLicenseKey(
      {
        id: upgradedId,
        tier: 'pro',
        email,
        issuedAt: now,
        updatesUntil,
        maxMachines,
        ...(target ? { upgradeFrom: target.id } : {}),
      },
      privateJwk,
    );
    const record = {
      id: upgradedId,
      orderId: orderId || target?.orderId || upgradedId,
      tier: 'pro',
      email,
      token,
      issuedAt: now,
      updatesUntil,
      maxMachines,
      upgradeFrom: target?.id ?? null,
      // What the upgrade overwrote, for a refund of just the upgrade to put
      // back (PLAN.md 23.17i). The Home record shares the Pro key's id, so
      // nothing else in KV remembers it.
      ...(target
        ? {
            replaces: {
              id: target.id,
              orderId: target.orderId ?? null,
              issuedAt: target.issuedAt,
              updatesUntil: target.updatesUntil,
              maxMachines: target.maxMachines,
            },
          }
        : {}),
      revoked: false,
    };

    const updated = existing.filter((k) => k.id !== upgradedId);
    updated.push(record);
    await env.LICENSE_KV.put(`keys:${email}`, JSON.stringify(updated));
    await env.LICENSE_KV.put(`key:${upgradedId}`, JSON.stringify(record));
    return json({ ok: true, id: upgradedId, tier: 'pro' }, 200, cors);
  }

  if (event === 'order_refunded') {
    // Lemon Squeezy sends `order_refunded` for a partial refund too (a goodwill $10 back), with
    // the order's status `partial_refund`; only `refunded` is the whole order given back. Until
    // 2026-10-28 any of them revoked the buyer's licence (the security audit, finding 6). A
    // partial refund answers 200 and changes nothing. Our own direct JSON refund (no
    // `data.attributes`) is the owner's word and revokes as before.
    if (isLs && lsStatus !== 'refunded') {
      console.log(`licence worker: order_refunded ${orderId || '?'} left alone, order status "${lsStatus || 'missing'}" is not a full refund`);
      return json({ ok: true, ignored: 'not a full refund', status: lsStatus || null }, 200, cors);
    }
    // Remembered so the same order's `order_created`, delivered again, is not filed (see the
    // gate above). Written for the owner's direct refund too; only a Lemon Squeezy order reads it.
    if (orderId) await env.LICENSE_KV.put(`refunded:${orderId}`, JSON.stringify({ at: Date.now() }));
    let targetEmail = email;
    let targetId = typeof body.keyId === 'string' && body.keyId ? body.keyId.trim() : orderId ? `key_${orderId}` : '';

    if (targetId && !targetEmail) {
      const stored = await readKeyById(env, targetId);
      if (stored?.email) targetEmail = stored.email;
    }

    if (targetEmail) {
      const existing = await readEmailKeys(env, targetEmail);
      const removed = existing.filter(
        (k) => (targetId && k.id === targetId) || (orderId && k.orderId === orderId),
      );
      const remaining = existing.filter(
        (k) => !((targetId && k.id === targetId) || (orderId && k.orderId === orderId)),
      );
      // Refunding only an upgrade order: the buyer still has the Home they
      // paid for (PLAN.md 23.17i). Refunded before, the upgrade took the Home
      // key with it, because an upgrade files the Pro key over the Home one
      // under the same id, and the buyer ended with nothing. The Home comes
      // back under a new id, never the Pro key's: a Mac holding the Pro token
      // keeps it as long as /keys lists its id (`heldKeyRefunded`,
      // accountLicense.ts), and the Pro token stays valid offline, so the id
      // must leave /keys and be revoked. Refunding the Home order itself (the
      // key's own id, not the upgrade's order) takes both, as before.
      const refiled = [];
      for (const r of removed) {
        if (r.tier === 'pro' && r.upgradeFrom && orderId && r.orderId === orderId) {
          refiled.push(await refileHome(env, r, orderId, privateJwk));
        }
      }
      remaining.push(...refiled);
      await env.LICENSE_KV.put(`keys:${targetEmail}`, JSON.stringify(remaining));
      for (const r of removed) {
        await env.LICENSE_KV.put(`key:${r.id}`, JSON.stringify({ ...r, revoked: true }));
        await env.LICENSE_KV.delete?.(`machines:${r.id}`);
      }
      for (const h of refiled) await env.LICENSE_KV.put(`key:${h.id}`, JSON.stringify(h));
      if (!removed.length && targetId) {
        await env.LICENSE_KV.put(`key:${targetId}`, JSON.stringify({ id: targetId, revoked: true }));
      }
      return json({ ok: true, refunded: removed.map((r) => r.id), refiled: refiled.map((h) => h.id) }, 200, cors);
    }

    if (targetId) {
      await env.LICENSE_KV.put(`key:${targetId}`, JSON.stringify({ id: targetId, revoked: true }));
      return json({ ok: true, refunded: [targetId] }, 200, cors);
    }

    return json({ error: 'missing keyId or email' }, 400, cors);
  }

  return json({ error: 'unknown event' }, 400, cors);
}

/**
 * The Home key an upgrade replaced, filed again after the upgrade alone is
 * refunded. Signed afresh: the old token carries the Pro key's id. A record
 * from before `replaces` existed is rebuilt from the Pro one (its order id is
 * the key id without the `key_` the webhook puts on it).
 */
async function refileHome(env, pro, upgradeOrderId, privateJwk) {
  const was = pro.replaces ?? {};
  const id = `${pro.id}_home_${upgradeOrderId}`;
  const issuedAt = typeof was.issuedAt === 'number' ? was.issuedAt : pro.issuedAt;
  const updatesUntil = typeof was.updatesUntil === 'number' ? was.updatesUntil : pro.updatesUntil;
  const maxMachines = typeof was.maxMachines === 'number' ? was.maxMachines : pro.maxMachines;
  const token = await signLicenseKey(
    { id, tier: 'home', email: pro.email, issuedAt, updatesUntil, maxMachines },
    privateJwk,
  );
  return {
    id,
    orderId: was.orderId || String(pro.upgradeFrom).replace(/^key_/, ''),
    tier: 'home',
    email: pro.email,
    token,
    issuedAt,
    updatesUntil,
    maxMachines,
    revoked: false,
  };
}

// ── GET /keys ────────────────────────────────────────────────────

async function handleGetKeys(request, env, cors) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return json({ error: 'unauthorised' }, 401, cors);

  const verified = await verifyFirebaseIdToken(match[1].trim(), env);
  if (!verified) return json({ error: 'unauthorised' }, 401, cors);

  const list = await readEmailKeys(env, verified.email);
  const active = list
    .filter((k) => k && !k.revoked)
    .map((k) => ({
      id: k.id,
      tier: k.tier,
      email: k.email,
      token: k.token,
      issuedAt: k.issuedAt,
      updatesUntil: k.updatesUntil,
      maxMachines: k.maxMachines,
    }));

  let marketingOptIn = null;
  try {
    const rawPref = await env.LICENSE_KV.get(`marketing:${verified.email}`);
    if (rawPref) {
      const parsedPref = JSON.parse(rawPref);
      if (typeof parsedPref?.optIn === 'boolean') marketingOptIn = parsedPref.optIn;
    }
  } catch { /* ignore */ }

  return json({ ok: true, email: verified.email, keys: active, marketingOptIn }, 200, cors);
}

// ── POST /preferences ────────────────────────────────────────────

async function handlePostPreferences(request, env, cors) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return json({ error: 'unauthorised' }, 401, cors);

  const verified = await verifyFirebaseIdToken(match[1].trim(), env);
  if (!verified) return json({ error: 'unauthorised' }, 401, cors);

  const rawBody = await readCapped(request, MAX_BYTES);
  if (rawBody == null) return json({ error: 'too large' }, 413, cors);

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'not JSON' }, 400, cors);
  }

  const optIn = Boolean(body?.marketingOptIn);
  const record = {
    email: verified.email,
    optIn,
    updatedAt: Date.now(),
  };
  await env.LICENSE_KV.put(`marketing:${verified.email}`, JSON.stringify(record));
  return json({ ok: true, email: verified.email, marketingOptIn: optIn }, 200, cors);
}

// ── POST /activate & /deactivate ─────────────────────────────────

async function handleActivate(request, env, cors, activate) {
  // These two routes ask for nothing but the key, which is public the moment a buyer pastes it
  // anywhere, so whoever holds one could fill the owner's two seats or clear them as fast as
  // they could send (the security audit, finding 15). Each address gets `ACTIVATE_PER_ADDRESS`
  // asks an hour (60), counted before the key is even read, so guessing at keys is slowed too,
  // and each key `ACTIVATE_PER_KEY` (20) once its signature is good. A Mac asks about twice a
  // start, so an owner never meets either; a refused ask answers 429 with the seconds to wait.
  const retry = await takeActivateTurn(request, env, 'ip', addressOf(request), env.ACTIVATE_PER_ADDRESS, 60);
  if (retry) return tooMany(retry, cors);

  const rawBody = await readCapped(request, MAX_BYTES);
  if (rawBody == null) return json({ error: 'too large' }, 413, cors);

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'not JSON' }, 400, cors);
  }

  const keyToken = typeof body?.key === 'string' ? body.key.trim() : '';
  const machineId = typeof body?.machineId === 'string' ? body.machineId.trim() : '';
  if (!keyToken || !machineId || machineId.length > 128) {
    return json({ error: 'missing key or machineId' }, 400, cors);
  }

  const verified = await verifyLicenseKey(keyToken, env.LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_JWK);
  if (!verified.valid) {
    return json({ ok: false, error: verified.error }, 401, cors);
  }

  const keyId = verified.payload.id;
  const retryKey = await takeActivateTurn(request, env, 'key', keyId, env.ACTIVATE_PER_KEY, 20);
  if (retryKey) return tooMany(retryKey, cors);
  const storedKey = await readKeyById(env, keyId);
  if (storedKey?.revoked) {
    return json({ ok: false, error: 'key revoked' }, 401, cors);
  }

  const maxMachines = verified.payload.maxMachines || MAX_MACHINES_PER_KEY;
  const machinesKey = `machines:${keyId}`;
  const rawMachines = await env.LICENSE_KV.get(machinesKey);
  let machines = [];
  if (rawMachines) {
    try {
      const parsed = JSON.parse(rawMachines);
      if (Array.isArray(parsed)) machines = parsed;
    } catch {
      machines = [];
    }
  }

  if (!activate) {
    const remaining = machines.filter((m) => m.id !== machineId);
    await env.LICENSE_KV.put(machinesKey, JSON.stringify(remaining));
    return json({ ok: true, id: keyId, tier: verified.payload.tier, machines: remaining.length, maxMachines }, 200, cors);
  }

  const existingIdx = machines.findIndex((m) => m.id === machineId);
  if (existingIdx >= 0) {
    machines[existingIdx].activatedAt = Date.now();
    await env.LICENSE_KV.put(machinesKey, JSON.stringify(machines));
    return json({ ok: true, id: keyId, tier: verified.payload.tier, machines: machines.length, maxMachines }, 200, cors);
  }

  if (machines.length >= maxMachines) {
    return json(
      {
        ok: false,
        error: 'machine limit reached',
        machines: machines.length,
        maxMachines,
        // So the door can say which Macs hold the seats (PLAN.md 23.17g).
        labels: machines.map((m) => m.label || 'another Mac'),
      },
      409,
      cors,
    );
  }

  machines.push({
    id: machineId,
    label: typeof body?.label === 'string' ? body.label.slice(0, 80) : null,
    activatedAt: Date.now(),
  });
  await env.LICENSE_KV.put(machinesKey, JSON.stringify(machines));
  return json({ ok: true, id: keyId, tier: verified.payload.tier, machines: machines.length, maxMachines }, 200, cors);
}

// ── Verification helpers ─────────────────────────────────────────

async function verifyWebhookHmac(rawBody, sigHeader, secret) {
  // Supports raw hex HMAC-SHA256 or "ts=...;h1=<hex>" (Paddle format).
  let providedHex = sigHeader.trim();
  let signedPayload = rawBody;
  if (providedHex.includes('h1=')) {
    const parts = Object.fromEntries(
      providedHex.split(';').map((p) => {
        const idx = p.indexOf('=');
        return idx > 0 ? [p.slice(0, idx).trim(), p.slice(idx + 1).trim()] : [p.trim(), ''];
      }),
    );
    if (!parts.h1) return false;
    providedHex = parts.h1;
    if (parts.ts) signedPayload = `${parts.ts}:${rawBody}`;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expectedHex = [...new Uint8Array(sigBuf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return timingSafeEqual(providedHex.toLowerCase(), expectedHex);
}

async function verifyFirebaseIdToken(idToken, env) {
  if (typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  } catch {
    return null;
  }
  if (!header || !payload) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  // A token with no expiry, or issued in the future, is not a Firebase token.
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) return null;
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) return null;
  if (payload.email_verified === false) return null;

  const expectedAud = env.FIREBASE_PROJECT_ID || 'chromaglass';
  if (payload.aud && payload.aud !== expectedAud && payload.aud !== 'demo-chromaglass') {
    return null;
  }

  const uid = payload.user_id || payload.sub;
  if (typeof uid !== 'string' || !uid) return null;

  // Emulator tokens are unsigned (`alg: "none"`) and only accepted when FIREBASE_AUTH_EMULATOR is explicitly configured.
  if (header.alg === 'none') {
    if (!env.FIREBASE_AUTH_EMULATOR) return null;
    return { uid, email: payload.email.trim().toLowerCase() };
  }

  if (header.alg !== 'RS256') return null;
  // A real token names this project twice: as its audience and in its issuer.
  // The audience alone let through any token Google signed for 'demo-chromaglass'
  // too, and checked neither when `aud` was missing.
  if (payload.aud !== expectedAud || payload.iss !== `https://securetoken.google.com/${expectedAud}`) return null;
  if (typeof header.kid !== 'string' || !header.kid) return null;
  const sigBytes = fromBase64Url(parts[2]);
  if (!sigBytes) return null;

  const jwks = await getGoogleJwks(env, header.kid);
  const jwk = Array.isArray(jwks) ? jwks.find((k) => k.kid === header.kid) : null;
  if (!jwk) return null;

  try {
    const pubKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pubKey, sigBytes, signingInput);
    if (!ok) return null;
    return { uid, email: payload.email.trim().toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Google's public keys for Firebase ID tokens, as JWKs.
 *
 * Reported by the owner, 2026-10-24: signed in with an account that holds a Pro
 * key, the app still said Free. This function was why. It read the keys only
 * from a `GOOGLE_JWKS` variable, which `npm run license-worker` sets and the
 * live Worker never had, so it returned no keys and every real sign-in was
 * refused: `GET /keys` answered 401 to everyone, and no account's key ever
 * reached a browser. A variable could not have worked for long anyway: Google
 * rotates these keys every few days (the endpoint's own max-age, measured
 * 2026-10-24, was 18637 s, about five hours), and a token signed by a key the
 * variable did not hold would be refused the same way.
 *
 * So the keys are fetched from Google's endpoint for exactly these tokens and
 * kept for as long as Google says they may be. A token naming a key the cache
 * does not hold fetches again (Google has rotated). Every attempt counts toward
 * the once-a-minute limit, a failed one too, and concurrent requests share the
 * one fetch in flight: a stream of tokens with made-up key ids, or Google being
 * down, cannot turn into a stream of fetches (the review of #460 found both).
 * `GOOGLE_JWKS` stays as an override for the check, which signs its own tokens.
 */
const GOOGLE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const JWKS_MIN_REFETCH_MS = 60_000;
const jwksCache = { keys: [], until: 0, triedAt: 0 };
let jwksInFlight = null;

async function getGoogleJwks(env, kid) {
  if (env.GOOGLE_JWKS) {
    const parsed = typeof env.GOOGLE_JWKS === 'string' ? JSON.parse(env.GOOGLE_JWKS) : env.GOOGLE_JWKS;
    return Array.isArray(parsed) ? parsed : parsed?.keys ?? [];
  }
  const now = Date.now();
  const holds = jwksCache.keys.some((k) => k.kid === kid);
  if (holds && now < jwksCache.until) return jwksCache.keys;
  if (jwksInFlight) return jwksInFlight;
  if (now - jwksCache.triedAt < JWKS_MIN_REFETCH_MS) return jwksCache.keys;
  jwksCache.triedAt = now;
  jwksInFlight = (async () => {
    try {
      const res = await fetch(GOOGLE_JWKS_URL);
      if (!res.ok) return jwksCache.keys;
      const body = await res.json();
      const keys = Array.isArray(body?.keys) ? body.keys : [];
      if (!keys.length) return jwksCache.keys;
      const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1]) || 3600;
      jwksCache.keys = keys;
      jwksCache.until = now + Math.min(maxAge, 6 * 3600) * 1000;
    } catch {
      // Google out of reach: the keys already held, if any, still verify.
    }
    return jwksCache.keys;
  })().finally(() => { jwksInFlight = null; });
  return jwksInFlight;
}

// The address Cloudflare saw the request come from; none outside Cloudflare (the local checks),
// where there is nobody to count.
function addressOf(request) {
  return request.headers.get('CF-Connecting-IP') || '';
}

/**
 * Takes one of `who`'s asks this hour from the Worker's KV, or returns the seconds until the
 * next hour when they are spent. KV is eventually consistent and takes no atomic add, so two
 * asks in the same instant can both read the same count: the limit is a brake on a script that
 * sends hundreds, not an exact meter. The counter dies with its hour (`expirationTtl`).
 */
async function takeActivateTurn(request, env, kind, who, limitSetting, fallback) {
  if (!who) return 0;
  const limit = Number(limitSetting) > 0 ? Number(limitSetting) : fallback;
  const hour = Math.floor(Date.now() / 3_600_000);
  const k = `rl:activate:${kind}:${who}:${hour}`;
  const used = Number(await env.LICENSE_KV.get(k)) || 0;
  if (used >= limit) return Math.max(1, Math.ceil(((hour + 1) * 3_600_000 - Date.now()) / 1000));
  await env.LICENSE_KV.put(k, String(used + 1), { expirationTtl: 3700 });
  return 0;
}

function tooMany(seconds, cors) {
  return new Response(JSON.stringify({ ok: false, error: 'too many requests', retryAfter: seconds }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'Retry-After': String(seconds),
      ...cors,
    },
  });
}

/**
 * An order we will not file a key for, kept where the owner can find it. Answers 200: the
 * store's retries would only repeat the same refusal. `held:<id>` is never read by the Worker.
 */
async function holdOrder(env, cors, id, why) {
  console.log(`licence worker: held ${id}: ${JSON.stringify(why)}`);
  await env.LICENSE_KV.put(`held:${id}`, JSON.stringify({ ...why, id, at: Date.now() }));
  return json({ ok: true, ignored: why.reason }, 200, cors);
}

function productIdIn(list, id, builtIn) {
  if (!id) return false;
  if (builtIn.includes(id)) return true;
  return String(list || '')
    .split(',')
    .some((v) => Number(v.trim()) === id);
}

async function readEmailKeys(env, email) {
  const raw = await env.LICENSE_KV.get(`keys:${email}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function readKeyById(env, id) {
  const raw = await env.LICENSE_KV.get(`key:${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function fromBase64Url(str) {
  if (typeof str !== 'string' || !/^[A-Za-z0-9_-]+$/.test(str)) return null;
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
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
    if (size > max) {
      try { await reader.cancel(); } catch { /* gone */ }
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

function rand(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map((x) => (x % 36).toString(36)).join('');
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}
