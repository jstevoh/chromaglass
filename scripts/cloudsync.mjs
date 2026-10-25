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
 *  10. erasing the cloud copy removes it, for an account that is no longer Pro too;
 *  11. a record stamped a day ahead cannot win for ever;
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

async function token(email, key = google.privateKey) {
  const s = Math.floor(Date.now() / 1000);
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
    name, storage, online: true, applied: [],
    use() { globalThis.localStorage = storage; return d; },
  };
  d.sync = createCloudSync({
    storage,
    base: 'https://licences.example',
    account: () => email,
    token: () => token(email, signingKey),
    now: () => Date.now() + skewMs,
    fetch: async (url, init) => {
      if (!d.online) throw new TypeError('Failed to fetch');
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

await fileKey(PRO, 'home'); // a refund to Home: the cloud copy can still be erased
const erased = await A.sync.erase();
check(
  '10. erasing the cloud copy removes it, for an account no longer Pro too; the device keeps its own',
  erased && !env.LICENSE_KV.values.has(`sync:uid-${PRO}`) && names(A).length > 0,
  `erased=${erased}, cloud copy left=${env.LICENSE_KV.values.has(`sync:uid-${PRO}`)}, A keeps ${names(A).length}`,
);
await fileKey(PRO, 'pro');

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

// ── 12. The wiring ────────────────────────────────────────────────────────

{
  // Bundled into node_modules/.cache, so paths are from the repository root, where npm runs it.
  const read = (p) => readFileSync(p, 'utf8');
  const app = read('src/App.tsx');
  const sources = ['src/App.tsx', 'src/hooks/useUserPresets.ts', 'src/hooks/useShowSequencer.ts', 'src/hooks/useMidi.ts'].map(read).join('\n');
  const reloadBlocks = [...sources.matchAll(/useCloudSyncReload\(\{([\s\S]*?)\}\);/g)].map((m) => m[1]).join('\n');
  // The keys App.tsx keeps to itself are still the keys it saves under.
  const appKeys = ['chromaglass-music-settings', 'chromaglass-follow-songs'].filter((k) => app.includes(`'${k}'`));
  // Each store's key, by the constant or the string the reload block uses.
  const keyNames = {
    presets: 'USER_PRESETS_KEY', sequences: 'SEQUENCES_KEY', sets: 'SAVED_SETS_KEY', setlist: 'SETLIST_KEY',
    songShows: 'SHOWS_KEY', actionSets: 'SETS_KEY', liquids: 'CUSTOM_LIQUIDS_KEY', midiMap: 'MIDI_MAP_KEY',
    toolAmounts: 'TOOL_AMOUNTS_KEY', musicSettings: 'MUSIC_SETTINGS_KEY', followSongs: "'chromaglass-follow-songs'",
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
