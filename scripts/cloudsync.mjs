#!/usr/bin/env node
/**
 * Cloud sync for Pro accounts (PLAN.md 23.18), measured end to end: two
 * devices, each with its own storage like a browser and the Mac app, syncing
 * through the real licence Worker (server/license-worker.js and
 * server/cloud-sync.js) against in-memory KV, with real RS256 ID tokens.
 *
 *   npm run cloudsync
 *
 * What the owner asked for (2026-10-25) is that a look saved in one is in the
 * other. So every line below is a thing saved on one device and read back, by
 * the stores' own load functions, on the other; none of them asks the engine
 * what it thinks it did.
 *
 *   1. looks, a sequence, the set list, the MIDI map and a setting saved on A
 *      arrive on B; the projector's layout, which is the machine's, does not;
 *   2. B's untouched starter set list, there before B ever synced, does not
 *      replace A's;
 *   3. different looks edited on both, before either syncs, both survive on both;
 *   4. one look edited on both: the later edit wins on both, even from a device
 *      whose clock is ten minutes slow;
 *   5. a look deleted on A goes from B, and B, which still had it, does not
 *      bring it back;
 *   6. an edit made offline goes up when the device is back, merged with what
 *      the other made meanwhile;
 *   7. a push lost to another device's write in the same second (KV has no
 *      transactions) is noticed by the manifest and sent again;
 *   8. a Home account and an account with no key are refused (403) and nothing
 *      of theirs is stored; a forged token is refused (401); another Pro
 *      account sees none of A's;
 *   9. a store holding something unreadable is left alone, not sent as deleted;
 *  10. erasing the cloud copy removes it, for an account that is no longer Pro too,
 *      and a device still holding a sign-in token from before the erase (the Mac
 *      app left open) cannot put it back; one signed in afresh can;
 *  11. a record stamped a day ahead cannot win for ever;
 *  13. a look too large for the cloud is reported, not re-sent every manifest,
 *      and goes once it is edited down; an item with the id `toString` syncs;
 *  14. the desk's tabs (PLAN 8-tabs-a): a renamed, reordered and added tab on A
 *      is the same list on B, and a reset to the shipped three travels too; which
 *      tab is up stays each machine's own;
 *  14d-f. two devices that each already had tabs of their own before either synced
 *      keep both's tabs on both (the review of #531 lost one device's whole list);
 *      the same holds on an account whose list was once put back to shipped, and
 *      a tab arranged on both is kept as two, not one;
 *  12. every synced key is still the key its module saves under, every store the
 *      device sends is one the server takes, and every key held in React state
 *      is read again when the cloud writes it (cloudSync.ts says why that matters).
 */

import { readFileSync } from 'node:fs';
import worker from '../server/license-worker.js';
import { SYNC_STORES as SERVER_STORES } from '../server/cloud-sync.js';
import { createCloudSync, SYNC_STORES } from '../src/lib/cloudSync.ts';
import { loadUserPresets, saveUserPresets, makeUserPreset, USER_PRESETS_KEY } from '../src/lib/userPresets.ts';
import { loadSetList, saveSetList, SETLIST_KEY } from '../src/lib/setList.ts';
import { loadUserSequences, saveUserSequences } from '../src/lib/sequencer.ts';
import { loadMidiMap, saveMidiMap, MIDI_FORMAT } from '../src/lib/midi.ts';
import { loadToolAmounts, saveToolAmounts } from '../src/lib/toolAmount.ts';
import { loadTabs, saveTabs, renameTab, mergeStoredTabs, moveTab, addTab, defaultTabs, TABS_KEY, TAB_KEY } from '../src/lib/deskTabs.ts';
import { DEFAULT_SETTINGS } from '../src/types.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── A device: its own storage, its own clock, its own network ─────────────

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

class FakeKV {
  constructor() { this.values = new Map(); this.puts = 0; }
  async get(k) { return this.values.has(k) ? this.values.get(k) : null; }
  async put(k, v) { this.puts++; this.values.set(k, String(v)); }
  async delete(k) { this.values.delete(k); }
}

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const rsa = () => crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const google = await rsa();
const forger = await rsa();
const licence = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

const env = {
  LICENSE_KV: new FakeKV(),
  LICENSE_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', licence.privateKey)),
  LICENSE_PUBLIC_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', licence.publicKey)),
  GOOGLE_JWKS: { keys: [{ ...(await crypto.subtle.exportKey('jwk', google.publicKey)), kid: 'g1', alg: 'RS256' }] },
  FIREBASE_PROJECT_ID: 'chromaglass',
};

/** Tokens are issued no earlier than this (s): a sign-in after an erase, in case 10. */
let issuedFloor = 0;
async function token(email, key = google.privateKey) {
  const s = Math.max(Math.floor(Date.now() / 1000), issuedFloor + 10);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const head = `${enc({ alg: 'RS256', typ: 'JWT', kid: 'g1' })}.${enc({
    iss: 'https://securetoken.google.com/chromaglass', aud: 'chromaglass',
    sub: `uid-${email}`, user_id: `uid-${email}`, email, email_verified: true, iat: s - 10, exp: s + 3600,
  })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head));
  return `${head}.${b64u(new Uint8Array(sig))}`;
}

async function fileKey(email, tier) {
  await env.LICENSE_KV.put(`keys:${email}`, JSON.stringify([{ id: `key-${email}`, tier, email, revoked: false }]));
}

const PRO = 'player@example.com';
await fileKey(PRO, 'pro');

// The stores' own modules read the global localStorage, so each device's
// storage is put in place while it is that device's turn.
function device(name, email = PRO, { skewMs = 0, signingKey } = {}) {
  const storage = new MemStorage();
  const d = {
    name, storage, online: true, applied: [], sentBytes: 0,
    /** A token this device holds on to, as a signed-in browser does for up to an hour. */
    heldToken: null,
    use() { globalThis.localStorage = storage; return d; },
  };
  d.sync = createCloudSync({
    storage,
    base: 'https://licences.example',
    account: () => email,
    token: async () => d.heldToken ?? token(email, signingKey),
    now: () => Date.now() + skewMs,
    fetch: async (url, init) => {
      if (!d.online) throw new TypeError('Failed to fetch');
      d.sentBytes += typeof init?.body === 'string' ? init.body.length : 0;
      return worker.fetch(new Request(url, init), env);
    },
    onApplied: (keys) => d.applied.push(...keys),
  });
  return d;
}

const look = (name) => ({ ...makeUserPreset(name, '', { ...DEFAULT_SETTINGS }, null, null), id: `user-${name.toLowerCase().replace(/\W+/g, '-')}` });
const names = (d) => { d.use(); return loadUserPresets().map((p) => p.name).sort(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1, 2. A's saved work arrives on B; B's starter set list does not win ──

const A = device('browser');
const B = device('mac app');

A.use();
saveUserPresets([look('Velvet'), look('Lava Lamp')]);
saveUserSequences([{ id: 'seq-a', name: 'Opening', loop: false, stages: [] }]);
saveSetList({ name: 'Friday', items: [{ id: 'set-1', kind: 'look', ref: 'velvet' }] });
saveMidiMap({ format: MIDI_FORMAT, version: 1, name: 'APC40 at the club', bindings: [] });
saveToolAmounts({ pour: 1.6 });
A.storage.setItem('chromaglass-output', '{"walls":"A only"}');

B.use();
saveSetList({ name: 'My set', items: [] });
B.storage.setItem('chromaglass-output', '{"walls":"B only"}');

const aFirst = await A.sync.sync(true);
const bFirst = await B.sync.sync(true);
B.use();
const bSet = loadSetList();
check(
  '1. looks, a sequence, the set list, the MIDI map and a setting saved on A arrive on B; the projector layout stays put',
  aFirst === 'synced' && bFirst === 'synced' &&
    names(B).join() === 'Lava Lamp,Velvet' &&
    (B.use(), loadUserSequences().some((s) => s.id === 'seq-a')) &&
    loadMidiMap()?.name === 'APC40 at the club' &&
    loadToolAmounts().pour === 1.6 &&
    B.storage.getItem('chromaglass-output') === '{"walls":"B only"}',
  `B looks=${names(B).join('/')}, midi=${(B.use(), loadMidiMap()?.name)}, pour=${loadToolAmounts().pour}, B output=${B.storage.getItem('chromaglass-output')}`,
);
check(
  "2. B's starter set list, there before B ever synced, does not replace A's",
  bSet.name === 'Friday' && (A.use(), loadSetList().name === 'Friday'),
  `B set list "${bSet.name}", A set list "${(A.use(), loadSetList().name)}"`,
);

// ── 3. Different looks edited on both before either syncs ─────────────────

await sleep(5);
A.use(); saveUserPresets([...loadUserPresets(), look('Jellyfish')]);
B.use(); saveUserPresets(loadUserPresets().map((p) => (p.name === 'Velvet' ? { ...p, description: 'edited on the Mac' } : p)));
await A.sync.sync(); await B.sync.sync(); await A.sync.sync();
const velvetOnA = (A.use(), loadUserPresets().find((p) => p.name === 'Velvet'));
check(
  '3. different looks edited on both, before either syncs, both survive on both',
  names(A).join() === 'Jellyfish,Lava Lamp,Velvet' && names(B).join() === 'Jellyfish,Lava Lamp,Velvet' && velvetOnA?.description === 'edited on the Mac',
  `A=${names(A).join('/')}, B=${names(B).join('/')}, Velvet on A: "${velvetOnA?.description ?? ''}"`,
);

// ── 4. One look edited on both: the later wins, whatever B's clock says ───

const SLOW = device('slow mac', PRO, { skewMs: -10 * 60_000 });
await SLOW.sync.sync(true);
SLOW.use(); saveUserPresets(loadUserPresets().map((p) => (p.name === 'Lava Lamp' ? { ...p, description: 'first, on the slow Mac' } : p)));
SLOW.sync.scan();
await sleep(20);
A.use(); saveUserPresets(loadUserPresets().map((p) => (p.name === 'Lava Lamp' ? { ...p, description: 'second, in the browser' } : p)));
A.sync.scan();
await sleep(20);
SLOW.use(); saveUserPresets(loadUserPresets().map((p) => (p.name === 'Lava Lamp' ? { ...p, description: 'third, on the slow Mac' } : p)));
await A.sync.sync(); await SLOW.sync.sync(); await A.sync.sync();
const lavaA = (A.use(), loadUserPresets().find((p) => p.name === 'Lava Lamp')?.description);
const lavaS = (SLOW.use(), loadUserPresets().find((p) => p.name === 'Lava Lamp')?.description);
check(
  '4. one look edited on both: the later edit wins on both, from a device whose clock is ten minutes slow too',
  lavaA === 'third, on the slow Mac' && lavaS === 'third, on the slow Mac',
  `browser "${lavaA}", slow Mac "${lavaS}"`,
);

// ── 5. A deletion travels and is not undone ───────────────────────────────

await B.sync.sync();
A.use(); saveUserPresets(loadUserPresets().filter((p) => p.name !== 'Jellyfish'));
await A.sync.sync();
await B.sync.sync(); await A.sync.sync(true); await B.sync.sync(true);
check(
  '5. a look deleted on A goes from B, and B, which had it, does not bring it back',
  !names(B).includes('Jellyfish') && !names(A).includes('Jellyfish'),
  `A=${names(A).join('/')}, B=${names(B).join('/')}`,
);

// ── 6. Offline edits go up when the device is back ────────────────────────

A.online = false;
A.use(); saveUserPresets([...loadUserPresets(), look('Made on the train')]);
const offline = await A.sync.sync();
B.use(); saveUserPresets([...loadUserPresets(), look('Made at home')]);
await B.sync.sync();
A.online = true;
await A.sync.sync(); await B.sync.sync();
check(
  '6. an edit made offline goes up once the device is back, merged with what the other made meanwhile',
  offline === 'offline' && names(A).includes('Made on the train') && names(A).includes('Made at home') && names(B).includes('Made on the train'),
  `offline round said ${offline}; A=${names(A).join('/')}; B=${names(B).join('/')}`,
);

// ── 7. A write lost to another's is noticed and sent again ────────────────

const before = env.LICENSE_KV.values.get(`sync:uid-${PRO}`);
A.use(); saveUserPresets([...loadUserPresets(), look('Lost in a race')]);
await A.sync.sync();
env.LICENSE_KV.values.set(`sync:uid-${PRO}`, before); // B's write, read before A's, landed after it
await B.sync.sync();
const missingAfterRace = !names(B).includes('Lost in a race');
await A.sync.sync(true); // the manifest round
await B.sync.sync();
check(
  '7. a push lost to another write (no KV transactions) is found by the manifest and sent again',
  missingAfterRace && names(B).includes('Lost in a race'),
  `missing after the race: ${missingAfterRace}; on B after the manifest: ${names(B).includes('Lost in a race')}`,
);

// ── 8. Only Pro, only with a real token, only one's own ───────────────────

await fileKey('home@example.com', 'home');
const H = device('home buyer', 'home@example.com');
H.use(); saveUserPresets([look('Home look')]);
const homeState = await H.sync.sync(true);
const N = device('no key', 'nobody@example.com');
N.use(); saveUserPresets([look('Free look')]);
const noneState = await N.sync.sync(true);
const F = device('forger', PRO, { signingKey: forger.privateKey });
F.use(); saveUserPresets([look('Planted')]);
const forgedState = await F.sync.sync(true);
await fileKey('second@example.com', 'pro');
const O = device('another pro', 'second@example.com');
await O.sync.sync(true);
check(
  "8. Home and keyless accounts refused and nothing stored; a forged token refused; another Pro account sees none of A's",
  homeState === 'not-pro' && noneState === 'not-pro' && forgedState === 'offline' &&
    !env.LICENSE_KV.values.has('sync:uid-home@example.com') && !env.LICENSE_KV.values.has('sync:uid-nobody@example.com') &&
    !names(A).includes('Planted') && (await A.sync.sync(), !names(A).includes('Planted')) &&
    names(O).length === 0,
  `home=${homeState}, keyless=${noneState}, forged=${forgedState}, other Pro account sees ${names(O).length} looks`,
);

// ── 9. Unreadable storage is not read as empty ────────────────────────────

const C = device('corrupt', PRO);
await C.sync.sync(true);
const heldBefore = names(C).length;
C.storage.setItem(USER_PRESETS_KEY, '{not json');
await C.sync.sync();
await A.sync.sync();
check(
  '9. a store holding something unreadable is left alone, never sent as deleted',
  heldBefore > 0 && names(A).length === heldBefore,
  `A held ${heldBefore} looks before, ${names(A).length} after the corrupt device synced`,
);

// ── 10. Erase ─────────────────────────────────────────────────────────────

const cloudItems = () => {
  const doc = JSON.parse(env.LICENSE_KV.values.get(`sync:uid-${PRO}`) ?? '{"stores":{}}');
  return Object.values(doc.stores ?? {}).reduce((n, items) => n + Object.values(items).filter((r) => !r.del).length, 0);
};
await B.sync.sync();
B.heldToken = await token(PRO); // the Mac app, left open and signed in
await fileKey(PRO, 'home'); // a refund to Home: the cloud copy can still be erased
const heldBeforeErase = cloudItems();
const erased = await A.sync.erase();
const leftAfterErase = cloudItems();
await fileKey(PRO, 'pro');
const staleState = await B.sync.sync(true);
const afterStale = cloudItems();
// A sign-in after the erase: its token is issued later than the marker.
issuedFloor = Math.floor(Date.now() / 1000) + 1;
B.heldToken = null;
const freshState = await B.sync.sync(true);
check(
  '10. erasing removes the cloud copy (Pro or not); a device on a token from before cannot put it back, one signed in afresh can',
  erased && heldBeforeErase > 0 && leftAfterErase === 0 && names(A).length > 0 && !A.sync.isOn() &&
    staleState === 'erased' && afterStale === 0 && freshState === 'synced' && cloudItems() === heldBeforeErase,
  `held ${heldBeforeErase}, after erase ${leftAfterErase}, A keeps ${names(A).length} with sync ${A.sync.isOn() ? 'on' : 'off'}; old token: ${staleState}, cloud ${afterStale}; fresh sign-in: ${freshState}, cloud ${cloudItems()}`,
);
A.sync.setOn(true);
await A.sync.sync(true);

// ── 11. A record from the far future ──────────────────────────────────────

const tok = await token(PRO);
const ahead = Date.now() + 24 * 3600_000;
const res = await worker.fetch(new Request('https://licences.example/sync', {
  method: 'POST',
  headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ since: 0, stores: { presets: { 'user-future': { t: ahead, by: 'x', d: { ...look('Future'), id: 'user-future' } } } } }),
}), env);
const stored = JSON.parse(env.LICENSE_KV.values.get(`sync:uid-${PRO}`) ?? '{}')?.stores?.presets?.['user-future'];
check(
  '11. a record stamped a day ahead is pulled back to a minute past the server clock',
  res.status === 200 && stored && stored.t <= Date.now() + 61_000,
  `stored ${stored ? Math.round((stored.t - Date.now()) / 1000) : '?'} s ahead`,
);

// ── 13. Too large, and an id from Object's prototype ─────────────────────

{
  A.use();
  const huge = { ...look('Huge'), description: 'x'.repeat(300 * 1024) };
  saveUserPresets([...loadUserPresets(), huge]);
  saveUserSequences([...loadUserSequences(), { id: 'toString', name: 'Odd id', loop: false, stages: [] }]);
  await A.sync.sync();
  const refusedAfter = A.sync.status().refused;
  const sentBefore = A.sentBytes;
  await A.sync.sync(true); // a manifest round
  const manifestBytes = A.sentBytes - sentBefore;
  A.use(); saveUserPresets(loadUserPresets().map((p) => (p.id === huge.id ? { ...p, description: 'trimmed' } : p)));
  await A.sync.sync();
  await B.sync.sync();
  check(
    '13. a look too large is reported and not re-sent by the manifest, goes once edited down; an id of toString syncs',
    refusedAfter === 1 && manifestBytes < 50 * 1024 && A.sync.status().refused === 0 &&
      names(B).includes('Huge') && (B.use(), loadUserSequences().some((q) => q.id === 'toString')),
    `refused ${refusedAfter}, the manifest round sent ${Math.round(manifestBytes / 1024)} KB, refused after the edit ${A.sync.status().refused}, on B: Huge ${names(B).includes('Huge')}, toString ${(B.use(), loadUserSequences().some((q) => q.id === 'toString'))}`,
  );
}

// ── 14. The desk's tabs travel with the account ───────────────────────────

{
  const C = device('laptop');
  const D = device('phone');
  C.use();
  let t = renameTab(loadTabs(), 'setup', 'Venue');
  t = moveTab(t, 'setup', -2);
  t = addTab(t, { name: 'Late set', copyOf: 'perform' }).tabs;
  saveTabs(t);
  C.storage.setItem(TAB_KEY, 'sequence');
  D.use();
  D.storage.setItem(TAB_KEY, 'perform');
  await C.sync.sync(true);
  await D.sync.sync(true);
  D.use();
  const onD = loadTabs();
  const shape = (l) => l.map((x) => `${x.id.startsWith('tab-') ? 'new' : x.id}:${x.name}`).join(' | ');
  const copied = onD.find((x) => x.name === 'Late set');
  const arrived = shape(onD) === shape(t) && JSON.stringify(copied?.layout) === JSON.stringify(t.find((x) => x.name === 'Late set').layout);
  check(
    "14a. tabs renamed, moved and added on A are the same list, in the same order, with the same panels, on B; which tab is up stays B's own",
    arrived && D.storage.getItem(TAB_KEY) === 'perform' && C.storage.getItem(TAB_KEY) === 'sequence',
    `A ${shape(t)}; B ${shape(onD)}; B up ${D.storage.getItem(TAB_KEY)}`,
  );
  // Back to the shipped three on A: storage holds nothing, and that goes to B.
  C.use();
  saveTabs(defaultTabs());
  await sleep(5);
  await C.sync.sync(true);
  await D.sync.sync(true);
  D.use();
  check(
    '14b. putting the tabs back to the shipped three on A puts them back on B',
    C.storage.getItem(TABS_KEY) === null && D.storage.getItem(TABS_KEY) === null && shape(loadTabs()) === shape(defaultTabs()),
    `B ${shape(loadTabs())}, B stored ${D.storage.getItem(TABS_KEY)}`,
  );
  // A list the cloud holds that is not a list of tabs is read as the shipped three, not a crash.
  D.storage.setItem(TABS_KEY, '{"v":1,"tabs":"junk"}');
  check('14c. a tabs value that is not tabs loads as the shipped three', shape(loadTabs()) === shape(defaultTabs()));
}

// ── 14d-f. Two devices that each had tabs before either synced ────────────

{
  const shape = (l) => l.map((x) => `${x.id.startsWith('tab-') ? 'new' : x.id}:${x.name}`).join(' | ');
  const has = (d, ...want) => { d.use(); const n = loadTabs().map((x) => x.name); return want.every((w) => n.includes(w)); };
  const sameOn = (a, b) => { a.use(); const x = shape(loadTabs()); b.use(); return x === shape(loadTabs()); };
  const round = async (...ds) => { for (const d of ds) await d.sync.sync(true); };

  for (const e of ['tabs-d', 'tabs-e', 'tabs-f']) await fileKey(`${e}@example.com`, 'pro');
  // The laptop renames Perform and the Mac app renames Sequence, neither having synced.
  const E = device('laptop', 'tabs-d@example.com');
  const F = device('mac app', 'tabs-d@example.com');
  E.use(); saveTabs(renameTab(loadTabs(), 'perform', 'MacOnly'));
  F.use(); saveTabs(renameTab(loadTabs(), 'sequence', 'ChromeOnly'));
  await round(E, F, E, F, E);
  check(
    '14d. each device renamed a different shipped tab before either synced: both renames are on both',
    has(E, 'MacOnly', 'ChromeOnly') && has(F, 'MacOnly', 'ChromeOnly') && sameOn(E, F),
    `E ${(E.use(), shape(loadTabs()))}; F ${(F.use(), shape(loadTabs()))}`,
  );

  // The account's list was once put back to shipped, so the cloud holds a deletion with a real time.
  const G = device('laptop 2', 'tabs-e@example.com');
  const H = device('phone 2', 'tabs-e@example.com');
  G.use(); saveTabs(renameTab(loadTabs(), 'setup', 'Venue'));
  await round(G);
  G.use(); saveTabs(defaultTabs());
  await sleep(5);
  await round(G);
  H.use(); saveTabs(addTab(loadTabs(), { name: 'Late set' }).tabs);
  await round(H, G, H, G);
  check(
    '14e. a device joining an account whose list was once put back to shipped keeps its own tabs, and they reach the other',
    has(H, 'Late set') && has(G, 'Late set') && sameOn(G, H),
    `G ${(G.use(), shape(loadTabs()))}; H ${(H.use(), shape(loadTabs()))}`,
  );

  // The same tab arranged on both: the cloud's stays in place and this device's is kept beside it.
  const I = device('laptop 3', 'tabs-f@example.com');
  const J = device('phone 3', 'tabs-f@example.com');
  I.use(); saveTabs(renameTab(loadTabs(), 'setup', 'Venue A'));
  J.use(); saveTabs(renameTab(loadTabs(), 'setup', 'Venue B'));
  await round(I, J, I, J, I);
  check(
    '14f. one tab arranged on both before either synced is kept as two, in the same order on both',
    has(I, 'Venue A', 'Venue B (here)') && has(J, 'Venue A', 'Venue B (here)') && sameOn(I, J),
    `I ${(I.use(), shape(loadTabs()))}; J ${(J.use(), shape(loadTabs()))}`,
  );

  // And the merge itself, unit by unit, so a lost tab is named.
  const raw = (tabs) => JSON.stringify({ v: 1, tabs });
  const merged = JSON.parse(mergeStoredTabs(
    raw([{ id: 'perform', name: 'P' }, { id: 'tab-a', name: 'A' }]),
    raw([{ id: 'perform', name: 'Perform' }, { id: 'sequence', name: 'Sequence' }, { id: 'setup', name: 'Setup' }]),
  )).tabs.map((x) => `${x.id}:${x.name}`).join(' | ');
  check(
    '14g. merging: a tab arranged here replaces the shipped one it stands for, a tab made here is added, shipped tabs never touched are not brought back',
    merged === 'perform:P | sequence:Sequence | setup:Setup | tab-a:A' &&
      JSON.parse(mergeStoredTabs(raw([{ id: 'perform', name: 'Perform' }, { id: 'sequence', name: 'Sequence' }]), raw([{ id: 'perform', name: 'Perform' }]))).tabs.length === 1,
    merged,
  );
}

// ── 12. The wiring ────────────────────────────────────────────────────────

{
  // Bundled into node_modules/.cache, so paths are from the repository root, where npm runs it.
  const read = (p) => readFileSync(p, 'utf8');
  const app = read('src/App.tsx');
  const sources = ['src/App.tsx', 'src/hooks/useUserPresets.ts', 'src/hooks/useShowSequencer.ts', 'src/hooks/useMidi.ts', 'src/hooks/useDeskLayout.ts'].map(read).join('\n');
  const reloadBlocks = [...sources.matchAll(/useCloudSyncReload\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]).join('\n');
  // The keys App.tsx keeps to itself are still the keys it saves under.
  const appKeys = ['chromaglass-music-settings', 'chromaglass-follow-songs'].filter((k) => app.includes(`'${k}'`));
  // Each store's key, by the constant or the string the reload block uses.
  const keyNames = {
    presets: 'USER_PRESETS_KEY', sequences: 'SEQUENCES_KEY', sets: 'SAVED_SETS_KEY', setlist: 'SETLIST_KEY',
    songShows: 'SHOWS_KEY', actionSets: 'SETS_KEY', liquids: 'CUSTOM_LIQUIDS_KEY', midiMap: 'MIDI_MAP_KEY',
    toolAmounts: 'TOOL_AMOUNTS_KEY', musicSettings: 'MUSIC_SETTINGS_KEY', followSongs: "'chromaglass-follow-songs'", deskTabs: 'TABS_KEY',
  };
  const unreloaded = SYNC_STORES.filter((s) => !reloadBlocks.includes(`[${keyNames[s.name]}]`) && !reloadBlocks.includes(`${keyNames[s.name]}:`)).map((s) => s.name);
  const notServed = SYNC_STORES.map((s) => s.name).filter((n) => !SERVER_STORES.includes(n));
  const notSent = SERVER_STORES.filter((n) => !SYNC_STORES.some((s) => s.name === n));
  const musicKey = /const MUSIC_SETTINGS_KEY = '([^']+)'/.exec(app)?.[1];
  const musicSpec = SYNC_STORES.find((s) => s.name === 'musicSettings')?.key;
  check(
    '12. every synced key is its module\'s, every store sent is one the server takes, every key held in state reloads',
    appKeys.length === 2 && musicKey === musicSpec && SETLIST_KEY === SYNC_STORES.find((s) => s.name === 'setlist')?.key &&
      !unreloaded.length && !notServed.length && !notSent.length,
    `App keys found ${appKeys.length}/2, music key ${musicKey}=${musicSpec}; not reloaded: [${unreloaded}]; not served: [${notServed}]; never sent: [${notSent}]`,
  );
}

console.log(`\n${results.filter(Boolean).length}/${results.length} cloud sync checks passed; ${env.LICENSE_KV.puts} KV writes in all`);
process.exit(results.every(Boolean) ? 0 : 1);
