// Cloud sync for Pro accounts (PLAN.md 23.18), served by the licence Worker.
//
// Asked by the owner, 2026-10-25: the Mac app keeps its own storage, like a
// second browser, so a look saved in Chrome at chromaglass.art was not in it,
// and the only way across was to export files from one and load them in the
// other. A Pro account now carries its saved looks, sequences, set lists, song
// shows, custom liquids, MIDI map and the settings that belong to the player
// rather than to the machine, and every browser or Mac app signed in to it keeps
// them in step.
//
// Each device stays the source of truth while it is offline: it reads and writes
// its own localStorage exactly as before, and nothing on the way to the plate
// waits for this. What travels is a per-item record, `{ t, by, d }` (or
// `{ t, by, del: true }` for a deletion), where `t` is when the item last changed,
// in milliseconds on the server's clock as the device measured it, and `by` is
// the device that changed it. The rule for two records of one item is the newest
// `t` wins, the cloud's copy on a tie. That is last-write-wins per item, not per
// account: a look edited on the Mac and a different look edited in the browser
// both survive, and only two edits of the same look race, where the later one is
// what the player last did. A deletion is a record too (a tombstone), so a look
// deleted on one machine does not come back from another that still has it.
//
// Why not Firestore, which the Firebase project could have: the tier is known
// here and nowhere else (the keys this Worker files under the buyer's email), the
// ID-token check is already here, and Firestore's rules cannot read a Lemon
// Squeezy purchase. Why one KV value per account and not one per item: a sync is
// then one read and at most one write, which is what Workers KV prices and limits
// (one write a second per key; the free plan's 1000 writes a day for the whole
// Cloudflare account, PLAN 23.18-cost).
//
// KV has no transactions, so two devices pushing in the same second can each
// read the same value and the later write drops the earlier one's items. The
// client heals that rather than this file preventing it: it sends a manifest of
// every item's `t` when it starts and every few minutes, and the server answers
// with the ids it holds older or not at all (`want`), which the client then
// pushes again. KV's own eventual consistency between regions is healed the
// same way.
//
// KV layout: `sync:<uid>` → `{ v: 1, rev, stores: { [store]: { [id]: { t, by, r, d? , del? } } } }`,
// where `r` is the `rev` at which the server last took that item, so a device
// asks only for what changed since the `rev` it last saw.

export const SYNC_PATH = '/sync';
/** A push's body, and the whole account's stored value. KV's own value limit is 25 MiB. */
export const SYNC_MAX_REQUEST_BYTES = 1024 * 1024;
export const SYNC_MAX_STORED_BYTES = 4 * 1024 * 1024;
const MAX_ITEM_BYTES = 256 * 1024;
const MAX_ITEMS_PER_STORE = 2000;
const MAX_ID = 160;
/**
 * A device's clock, corrected by the skew it measured against this server, can
 * still be a little ahead; a record stamped far in the future would win every
 * race for ever, so it is pulled back to a minute past the server's now.
 */
export const MAX_FUTURE_MS = 60_000;

/** The stores a device may sync. Anything else in a push is ignored. */
export const SYNC_STORES = [
  'presets',
  'sequences',
  'sets',
  'setlist',
  'songShows',
  'actionSets',
  'liquids',
  'midiMap',
  'toolAmounts',
  'musicSettings',
  'followSongs',
];

export function emptyDoc() {
  return { v: 1, rev: 0, stores: {} };
}

/**
 * An item by its id, only if the document holds it as its own: a plain object
 * answers `constructor` or `toString` from its prototype, so an item with such
 * an id never synced and was never wanted (the review of #467 measured it).
 */
const own = (obj, id) => (obj && Object.hasOwn(obj, id) ? obj[id] : undefined);

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= MAX_ID;
}

function validRecord(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (!Number.isFinite(rec.t) || rec.t < 0) return false;
  if (rec.by != null && (typeof rec.by !== 'string' || rec.by.length > 64)) return false;
  if (rec.del === true) return true;
  return rec.d !== undefined;
}

/** Newest `t` wins; on a tie, what is already held wins. */
export function newer(incoming, held) {
  if (!held) return true;
  return incoming.t > held.t;
}

/**
 * Merge a device's records into the account's document. Returns how many items
 * the server took; `doc` is changed in place and its `rev` moves only if any.
 */
export function mergePush(doc, stores, now = Date.now()) {
  const refusedIds = {};
  if (!stores || typeof stores !== 'object') return { taken: 0, refused: 0, refusedIds };
  // The rev is the server's clock, not a count, so it never runs backwards: an
  // erased cloud copy starts again above every rev a device remembers from before.
  const rev = Math.max(doc.rev + 1, now);
  let taken = 0;
  let refused = 0;
  for (const name of SYNC_STORES) {
    const incoming = stores[name];
    if (!incoming || typeof incoming !== 'object') continue;
    const held = doc.stores[name] ?? (doc.stores[name] = {});
    let live = Object.values(held).filter((r) => !r.del).length;
    for (const [id, raw] of Object.entries(incoming)) {
      const refuse = () => { refused++; if (validId(id)) (refusedIds[name] ??= []).push(id); };
      if (!validId(id) || !validRecord(raw)) { refuse(); continue; }
      const rec = raw.del === true
        ? { t: Math.min(raw.t, now + MAX_FUTURE_MS), by: raw.by ?? '', del: true }
        : { t: Math.min(raw.t, now + MAX_FUTURE_MS), by: raw.by ?? '', d: raw.d };
      if (!rec.del && JSON.stringify(rec.d).length > MAX_ITEM_BYTES) { refuse(); continue; }
      const was = own(held, id);
      if (!newer(rec, was)) continue;
      // Only live items count toward the cap: a store whose deletions are kept
      // as tombstones must not fill up with them (pruning them is 23.18-prune).
      const adds = !rec.del && (!was || was.del);
      if (adds && live >= MAX_ITEMS_PER_STORE) { refuse(); continue; }
      if (adds) live++;
      else if (rec.del && was && !was.del) live--;
      held[id] = { ...rec, r: rev };
      taken++;
    }
  }
  if (taken) doc.rev = rev;
  return { taken, refused, refusedIds };
}

/** The records that changed after `since`, without the server's own `r`. */
export function changesSince(doc, since) {
  // A device that saw a later rev than this copy holds read a region KV had not
  // yet caught up: it is sent everything rather than nothing.
  const after = Number.isFinite(since) && since <= doc.rev ? since : 0;
  const out = {};
  for (const [name, items] of Object.entries(doc.stores)) {
    for (const [id, rec] of Object.entries(items)) {
      if (rec.r <= after) continue;
      const { r: _r, ...sent } = rec;
      (out[name] ??= {})[id] = sent;
    }
  }
  return out;
}

/**
 * The ids a device holds newer than the server does, or that the server lacks:
 * what it should push again (see the KV note at the top of this file).
 */
export function wantFrom(doc, manifest) {
  const want = {};
  if (!manifest || typeof manifest !== 'object') return want;
  for (const name of SYNC_STORES) {
    const ids = manifest[name];
    if (!ids || typeof ids !== 'object') continue;
    const held = doc.stores[name] ?? {};
    for (const [id, t] of Object.entries(ids)) {
      if (!validId(id) || !Number.isFinite(t)) continue;
      const was = own(held, id);
      if (!was || t > was.t) (want[name] ??= []).push(id);
    }
  }
  return want;
}

function counts(doc) {
  const out = {};
  for (const [name, items] of Object.entries(doc.stores)) {
    out[name] = Object.values(items).filter((r) => !r.del).length;
  }
  return out;
}

/**
 * Whether the signed-in account holds a Pro key that has not been refunded.
 * Only the keys filed under the account's own verified email count: a Pro key
 * typed by hand into a browser signed in to some other address does not lend
 * that address the cloud, or one leaked key could lend it to every account.
 */
export async function accountIsPro(env, email) {
  try {
    const raw = await env.LICENSE_KV.get(`keys:${email}`);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.some((k) => k && !k.revoked && k.tier === 'pro');
  } catch {
    return false;
  }
}

async function readDoc(env, uid) {
  try {
    const raw = await env.LICENSE_KV.get(`sync:${uid}`);
    if (!raw) return emptyDoc();
    const doc = JSON.parse(raw);
    if (!doc || doc.v !== 1 || typeof doc.stores !== 'object') return emptyDoc();
    return doc;
  } catch {
    return emptyDoc();
  }
}

async function readCappedText(request, max) {
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
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** When the (already verified) token was issued, in ms; 0 if it cannot be read. */
function issuedAtMs(token) {
  try {
    const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const iat = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))).iat;
    return Number.isFinite(iat) ? iat * 1000 : 0;
  } catch {
    return 0;
  }
}

function reply(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}

/**
 * `GET /sync?since=<rev>`: what changed since that rev.
 * `POST /sync` `{ since, stores?, manifest? }`: take a device's records, answer
 * with what changed since `since` (its own records included, which it ignores)
 * and, given a manifest, the ids to push again.
 * `DELETE /sync`: erase the account's cloud copy. Any signed-in account may, Pro
 * or not, so a refunded buyer can still take their data out of the cloud.
 *
 * `verifyToken(idToken, env)` is the Worker's own Firebase ID-token check,
 * returning `{ uid, email }` or null.
 */
export async function handleSync(request, env, cors, verifyToken) {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('Authorization') || '').trim());
  const verified = match ? await verifyToken(match[1].trim(), env) : null;
  if (!verified?.uid || !verified.email) return reply({ error: 'unauthorised' }, 401, cors);
  const key = `sync:${verified.uid}`;
  const now = Date.now();

  if (request.method === 'DELETE') {
    // Not a bare delete. Another device still signed in (the Mac app left open)
    // holds an ID token good for up to an hour, and its next manifest would put
    // the whole copy back (the review of #467). So the erase leaves a marker, and
    // a push on a token issued before it is refused: an account deleted along
    // with this erase can never be issued a newer token, so its copy stays gone;
    // a device that signs in again afterwards fills it again, as the card says.
    const erased = { ...emptyDoc(), rev: now, erasedAt: now };
    await env.LICENSE_KV.put(key, JSON.stringify(erased));
    return reply({ ok: true, rev: erased.rev, now }, 200, cors);
  }

  if (!(await accountIsPro(env, verified.email))) {
    return reply({ error: 'pro only', now }, 403, cors);
  }

  if (request.method === 'GET') {
    const since = Number(new URL(request.url).searchParams.get('since'));
    const doc = await readDoc(env, verified.uid);
    return reply({ ok: true, rev: doc.rev, now, stores: changesSince(doc, since), counts: counts(doc) }, 200, cors);
  }

  if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405, cors);

  const text = await readCappedText(request, SYNC_MAX_REQUEST_BYTES);
  if (text == null) return reply({ error: 'too large', now }, 413, cors);
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { return reply({ error: 'not JSON', now }, 400, cors); }

  const doc = await readDoc(env, verified.uid);
  if (Number.isFinite(doc.erasedAt) && issuedAtMs(match[1]) <= doc.erasedAt) {
    return reply({ error: 'erased', now }, 409, cors);
  }
  const since = Number(body?.since);
  const { taken, refused, refusedIds } = mergePush(doc, body?.stores, now);
  if (taken) {
    const value = JSON.stringify(doc);
    if (value.length > SYNC_MAX_STORED_BYTES) return reply({ error: 'cloud full', now }, 413, cors);
    try {
      await env.LICENSE_KV.put(key, value);
    } catch {
      // KV refuses a second write to one key within a second: the device tries again.
      return reply({ error: 'busy', now }, 503, cors);
    }
  }
  return reply({
    ok: true,
    rev: doc.rev,
    now,
    taken,
    refused,
    refusedIds,
    stores: changesSince(doc, since),
    want: wantFrom(doc, body?.manifest),
    counts: counts(doc),
  }, 200, cors);
}
