/**
 * Cloud sync for Pro accounts (PLAN.md 23.18): a device's saved work, kept in
 * step with every other browser or Mac app signed in to the same account.
 *
 * Asked by the owner, 2026-10-25. The Mac app has its own storage, like a second
 * browser, so looks saved in Chrome were not in it and the only way across was to
 * export files from one and load them in the other. A Pro account now carries
 * them. The server half, and why the rule is newest-wins per item, is in
 * server/cloud-sync.js; this file is the device's half.
 *
 * Nothing here changes how the app saves. Every store below goes on being read
 * and written by its own module (userPresets.ts, setList.ts, midi.ts, ...) in
 * localStorage, synchronously, offline or not, and the plate never waits on the
 * network. This file looks at those same keys every few seconds, and an item
 * whose content changed since it last looked is stamped with the time and
 * marked to send. That costs a string comparison per key when nothing changed,
 * which is nearly always, and it means no save in the app had to learn about the
 * cloud: the obvious design, a call at every save site, would have been a dozen
 * edits in files other work is changing every day, and one missed save would be
 * a look that silently never syncs.
 *
 * What comes back from the cloud is written into those keys and announced
 * (`cg-cloud-sync` on window, with the keys), and each place that holds one of
 * them in React state reads it again (`useCloudSyncReload`). That reload is not
 * optional: a list held in state and saved over the new one would look, to the
 * next scan, like the player deleting what had just arrived, and the deletion
 * would travel to every device.
 *
 * What does not sync, on purpose: what belongs to the machine and not to the
 * player. The projector's layout (`chromaglass-output`), the audio input and
 * source, MIDI ports, the desk's mode, the phone's screen, the licence and the
 * sign-in. Nor the song memory in IndexedDB (fingerprints, song maps, recorded
 * performances), which is large and per room (PLAN 23.18-music).
 *
 * The first time a device scans a store, what it already held is stamped with
 * time 0, the oldest there is: it is sent if the cloud has no such item, and
 * loses to the cloud's copy if it has. So turning sync on on a second machine
 * brings the first machine's set list in rather than replacing it with the
 * second's untouched starter set, and nothing either machine made is lost.
 */

import { USER_PRESETS_KEY } from './userPresets';
import { SAVED_SETS_KEY, SETLIST_KEY } from './setList';
import { MIDI_MAP_KEY } from './midi';
import { SEQUENCES_KEY } from './sequencer';
import { SETS_KEY, SHOWS_KEY } from './songShows';
import { CUSTOM_LIQUIDS_KEY } from './liquidFile';
import { TOOL_AMOUNTS_KEY } from './toolAmount';

export interface SyncStoreSpec {
  /** The store's name on the wire (server/cloud-sync.js SYNC_STORES). */
  name: string;
  /** The localStorage key its own module saves it under. */
  key: string;
  /** A JSON array of items with ids, or one value kept whole. */
  kind: 'list' | 'one';
  idOf?: (item: Record<string, unknown>) => unknown;
}

const byId = (item: Record<string, unknown>) => item.id;

/**
 * Each key is the one its own module saves under, imported, except the two
 * App.tsx keeps to itself; `npm run cloudsync` reads App.tsx and fails if
 * either has moved, so a rename cannot quietly stop a store syncing.
 */
export const SYNC_STORES: SyncStoreSpec[] = [
  { name: 'presets', key: USER_PRESETS_KEY, kind: 'list', idOf: byId },
  { name: 'sequences', key: SEQUENCES_KEY, kind: 'list', idOf: byId },
  // Saved sets are kept by name (setList.ts withSavedSet), so the name is the id.
  { name: 'sets', key: SAVED_SETS_KEY, kind: 'list', idOf: (s) => s.name },
  { name: 'setlist', key: SETLIST_KEY, kind: 'one' },
  { name: 'songShows', key: SHOWS_KEY, kind: 'list', idOf: byId },
  { name: 'actionSets', key: SETS_KEY, kind: 'list', idOf: byId },
  { name: 'liquids', key: CUSTOM_LIQUIDS_KEY, kind: 'list', idOf: byId },
  { name: 'midiMap', key: MIDI_MAP_KEY, kind: 'one' },
  { name: 'toolAmounts', key: TOOL_AMOUNTS_KEY, kind: 'one' },
  { name: 'musicSettings', key: 'chromaglass-music-settings', kind: 'one' },
  { name: 'followSongs', key: 'chromaglass-follow-songs', kind: 'one' },
];

export const SYNC_META_KEY = 'chromaglass-cloud-sync';
/** Kept apart from the stamps, which a round in flight writes back whole. */
export const SYNC_OFF_KEY = 'chromaglass-cloud-sync-off';
export const SYNC_EVENT = 'cg-cloud-sync';
const ONE_ID = 'value';

interface Stamp {
  /** When this item last changed, on the server's clock as this device measures it. */
  t: number;
  /** A hash of its content, to tell an edit from a save that changed nothing. */
  h: string;
  del?: boolean;
  /** Changed here and not yet taken by the cloud. */
  dirty?: boolean;
}

interface Meta {
  v: 1;
  /** Whose data this is: signing in to another account starts again. */
  account: string | null;
  device: string;
  /** The last server rev this device has everything up to. */
  rev: number;
  /** Server clock minus this device's, measured on each answer. */
  skew: number;
  seeded: Record<string, boolean>;
  stamps: Record<string, Record<string, Stamp>>;
}

interface WireRecord { t: number; by?: string; d?: unknown; del?: boolean }
type WireStores = Record<string, Record<string, WireRecord>>;

export type SyncState =
  | 'off'          // turned off here, or not signed in
  | 'not-pro'      // the account holds no Pro key
  | 'idle'         // on, not yet run
  | 'syncing'
  | 'synced'
  | 'offline'      // the cloud could not be reached; everything stays here and goes later
  | 'full'         // the account's cloud copy is at its size limit
  | 'error';

export interface SyncStatus {
  state: SyncState;
  /** When the cloud last answered. */
  at: number | null;
  /** Items still waiting to go up. */
  waiting: number;
  /** What the cloud holds, by store. */
  counts: Record<string, number>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SyncDeps {
  storage: StorageLike;
  fetch: typeof fetch;
  /** The licence Worker's address, with no path. */
  base: string;
  token: () => Promise<string | null>;
  /** Who is signed in, so another account's data never lands on this one. */
  account: () => string | null;
  now?: () => number;
  /** Told which keys the cloud just wrote. */
  onApplied?: (keys: string[]) => void;
}

/** Stable JSON: the same value always prints the same, whatever its key order. */
export function canon(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(o[k])}`).join(',')}}`;
}

/** FNV-1a, 32 bits, as hex: enough to tell one version of a look from another. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function randomId(): string {
  const b = new Uint8Array(8);
  globalThis.crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * A store's items as id → value, in their stored order. `null` when the key
 * holds something that is not the expected shape: such a store is left alone
 * that round, never read as empty, or every item in it would be sent as deleted.
 */
export function readItems(spec: SyncStoreSpec, raw: string | null): Map<string, unknown> | null {
  const out = new Map<string, unknown>();
  if (raw == null) return out;
  if (spec.kind === 'one') { out.set(ONE_ID, raw); return out; }
  let list: unknown;
  try { list = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const id = spec.idOf?.(item as Record<string, unknown>);
    if (typeof id !== 'string' || !id || id.length > 160 || out.has(id)) continue;
    out.set(id, item);
  }
  return out;
}

const contentHash = (spec: SyncStoreSpec, v: unknown) => hash(spec.kind === 'one' ? String(v) : canon(v));

const PUSH_BATCH_BYTES = 900 * 1024;

export function createCloudSync(deps: SyncDeps) {
  const now = deps.now ?? (() => Date.now());
  const lastRaw = new Map<string, string | null>();
  let status: SyncStatus = { state: 'idle', at: null, waiting: 0, counts: {} };
  const listeners = new Set<(s: SyncStatus) => void>();
  let running: Promise<SyncState> | null = null;

  function freshMeta(account: string | null): Meta {
    return { v: 1, account, device: randomId(), rev: 0, skew: 0, seeded: {}, stamps: {} };
  }

  function readMeta(): Meta {
    const account = deps.account();
    let m: Meta | null = null;
    try { m = JSON.parse(deps.storage.getItem(SYNC_META_KEY) ?? 'null'); } catch { m = null; }
    if (!m || m.v !== 1 || typeof m.stamps !== 'object') return freshMeta(account);
    if (m.account !== account) {
      // Another account: its cloud is not this one's, so nothing here counts as
      // already sent.
      lastRaw.clear();
      return freshMeta(account);
    }
    return m;
  }

  function writeMeta(m: Meta) {
    try { deps.storage.setItem(SYNC_META_KEY, JSON.stringify(m)); } catch { /* storage full: stamps rebuilt next scan */ }
  }

  function setStatus(next: Partial<SyncStatus>) {
    status = { ...status, ...next };
    for (const l of listeners) l(status);
  }

  const clock = (m: Meta) => now() + m.skew;

  function countWaiting(m: Meta): number {
    let n = 0;
    for (const items of Object.values(m.stamps)) for (const s of Object.values(items)) if (s.dirty) n++;
    return n;
  }

  /** Stamp, in `m`, what changed here since the last look. Cheap when nothing did. */
  function scanInto(m: Meta): boolean {
    let touched = false;
    for (const spec of SYNC_STORES) {
      let raw: string | null;
      try { raw = deps.storage.getItem(spec.key); } catch { continue; }
      if (lastRaw.has(spec.key) && lastRaw.get(spec.key) === raw && m.seeded[spec.name]) continue;
      const items = readItems(spec, raw);
      if (!items) continue;
      lastRaw.set(spec.key, raw);
      const first = !m.seeded[spec.name];
      const stamps = m.stamps[spec.name] ?? (m.stamps[spec.name] = {});
      for (const [id, v] of items) {
        const h = contentHash(spec, v);
        const s = stamps[id];
        if (s && !s.del && s.h === h) continue;
        stamps[id] = { t: first ? 0 : clock(m), h, dirty: true };
        touched = true;
      }
      for (const [id, s] of Object.entries(stamps)) {
        if (s.del || items.has(id)) continue;
        stamps[id] = { t: clock(m), h: '', del: true, dirty: true };
        touched = true;
      }
      if (first) { m.seeded[spec.name] = true; touched = true; }
    }
    return touched;
  }

  /**
   * Stamp what changed here. Skipped while a round is out: the round holds its
   * own copy of the stamps and writes it back when the cloud answers, so a scan
   * written in between would be overwritten and its edits, already marked as
   * seen, never sent. The round scans again itself once the answer is in.
   */
  function scan(): number {
    if (running) return status.waiting;
    const m = readMeta();
    if (scanInto(m)) writeMeta(m);
    const waiting = countWaiting(m);
    if (waiting !== status.waiting) setStatus({ waiting });
    return waiting;
  }

  /** Write the cloud's records that beat this device's into storage. */
  function apply(m: Meta, incoming: WireStores | undefined): string[] {
    const changed: string[] = [];
    if (!incoming) return changed;
    for (const spec of SYNC_STORES) {
      const recs = incoming[spec.name];
      if (!recs) continue;
      let raw: string | null;
      try { raw = deps.storage.getItem(spec.key); } catch { continue; }
      const items = readItems(spec, raw);
      if (!items) continue;
      const stamps = m.stamps[spec.name] ?? (m.stamps[spec.name] = {});
      let wrote = false;
      for (const [id, rec] of Object.entries(recs)) {
        if (!rec || !Number.isFinite(rec.t)) continue;
        const mine = stamps[id];
        // Newest wins; the cloud's on a tie (server/cloud-sync.js `newer`).
        if (mine && mine.t > rec.t) continue;
        if (rec.del) {
          if (items.has(id)) { items.delete(id); wrote = true; }
          stamps[id] = { t: rec.t, h: '', del: true };
          continue;
        }
        if (spec.kind === 'one' ? typeof rec.d !== 'string' : !rec.d || typeof rec.d !== 'object' || spec.idOf?.(rec.d as Record<string, unknown>) !== id) continue;
        const h = contentHash(spec, rec.d);
        if (!(mine && !mine.del && mine.h === h)) { items.set(id, rec.d); wrote = true; }
        stamps[id] = { t: rec.t, h };
      }
      m.seeded[spec.name] = true;
      if (!wrote) continue;
      let next: string | null;
      if (spec.kind === 'one') next = items.has(ONE_ID) ? String(items.get(ONE_ID)) : null;
      else next = JSON.stringify([...items.values()]);
      try {
        if (next == null) deps.storage.removeItem(spec.key);
        else deps.storage.setItem(spec.key, next);
      } catch { continue; }
      lastRaw.set(spec.key, next);
      changed.push(spec.key);
    }
    return changed;
  }

  function manifestOf(m: Meta): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [name, items] of Object.entries(m.stamps)) {
      for (const [id, s] of Object.entries(items)) (out[name] ??= {})[id] = s.t;
    }
    return out;
  }

  async function call(method: 'GET' | 'POST' | 'DELETE', body?: unknown, since = 0) {
    const token = await deps.token();
    if (!token) return { res: null as Response | null, data: null as Record<string, unknown> | null, sentAt: 0, gotAt: 0 };
    const url = `${deps.base.replace(/\/$/, '')}/sync${method === 'GET' ? `?since=${since}` : ''}`;
    const sentAt = now();
    const res = await deps.fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const gotAt = now();
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { data = null; }
    return { res, data, sentAt, gotAt };
  }

  function took(m: Meta, data: Record<string, unknown> | null, sentAt: number, gotAt: number) {
    if (data && Number.isFinite(data.now)) m.skew = (data.now as number) - (sentAt + gotAt) / 2;
  }

  function failed(res: Response | null): SyncState {
    if (!res) return 'offline';
    if (res.status === 403) return 'not-pro';
    if (res.status === 413) return 'full';
    if (res.status === 401 || res.status >= 500) return 'offline';
    return 'error';
  }

  /**
   * One round: what is new here goes up, what is new in the cloud comes down.
   * With `full`, a manifest of every item goes too, and the server names any it
   * should hold and does not (a write lost to another device's, or a KV region
   * behind): those go up straight after.
   */
  async function round(full: boolean): Promise<SyncState> {
    if (!isOn()) { setStatus({ state: 'off' }); return 'off'; }
    const m = readMeta();
    scanInto(m);
    setStatus({ state: 'syncing' });
    try {
      let rounds = 0;
      let wantManifest = full;
      for (;;) {
        // Gather what waits, up to a batch's worth.
        const stores: WireStores = {};
        const sent: Array<[string, string, number]> = [];
        let bytes = 0;
        let more = false;
        for (const spec of SYNC_STORES) {
          const stamps = m.stamps[spec.name];
          if (!stamps) continue;
          let items: Map<string, unknown> | null = null;
          for (const [id, s] of Object.entries(stamps)) {
            if (!s.dirty) continue;
            let rec: WireRecord;
            if (s.del) rec = { t: s.t, by: m.device, del: true };
            else {
              items ??= readItems(spec, deps.storage.getItem(spec.key));
              if (!items?.has(id)) continue;
              rec = { t: s.t, by: m.device, d: items.get(id) };
            }
            const size = JSON.stringify(rec).length + id.length + 8;
            if (bytes && bytes + size > PUSH_BATCH_BYTES) { more = true; continue; }
            bytes += size;
            (stores[spec.name] ??= {})[id] = rec;
            sent.push([spec.name, id, s.t]);
          }
        }
        let r;
        if (!sent.length && !wantManifest) {
          r = await call('GET', undefined, m.rev);
        } else {
          r = await call('POST', { since: m.rev, stores, ...(wantManifest ? { manifest: manifestOf(m) } : {}) });
        }
        if (!r.res || !r.res.ok || !r.data) {
          scanInto(m);
          const state = failed(r.res);
          setStatus({ state, waiting: countWaiting(m) });
          writeMeta(m);
          return state;
        }
        took(m, r.data, r.sentAt, r.gotAt);
        // Edits made while the request was out are stamped now, before what came
        // back is written over the stores they are in.
        scanInto(m);
        for (const [name, id, t] of sent) {
          const s = m.stamps[name]?.[id];
          if (s && s.t === t) delete s.dirty;
        }
        const changed = apply(m, r.data.stores as WireStores | undefined);
        if (Number.isFinite(r.data.rev)) m.rev = r.data.rev as number;
        let wanted = 0;
        const want = r.data.want as Record<string, string[]> | undefined;
        if (want) {
          for (const [name, ids] of Object.entries(want)) {
            for (const id of ids) {
              const s = m.stamps[name]?.[id];
              if (s && !s.dirty) { s.dirty = true; wanted++; }
            }
          }
        }
        writeMeta(m);
        if (changed.length) deps.onApplied?.(changed);
        setStatus({ state: 'synced', at: now(), waiting: countWaiting(m), counts: (r.data.counts as Record<string, number>) ?? status.counts });
        wantManifest = false;
        if ((!more && !wanted) || ++rounds > 20) return 'synced';
      }
    } catch {
      scanInto(m);
      writeMeta(m);
      setStatus({ state: 'offline', waiting: countWaiting(m) });
      return 'offline';
    }
  }

  function sync(full = false): Promise<SyncState> {
    running ??= round(full).finally(() => { running = null; });
    return running;
  }

  function isOn(): boolean {
    try { return deps.storage.getItem(SYNC_OFF_KEY) !== '1'; } catch { return true; }
  }

  /** Turn sync on or off on this device. Off keeps everything here and stops sending. */
  function setOn(on: boolean) {
    try {
      if (on) deps.storage.removeItem(SYNC_OFF_KEY); else deps.storage.setItem(SYNC_OFF_KEY, '1');
    } catch { /* storage refused: the setting lasts this session */ }
    setStatus({ state: on ? 'idle' : 'off' });
  }

  /**
   * Erase the account's cloud copy. This device keeps all it has, and starts its
   * stamps again so that, if sync stays on, it fills the cloud afresh.
   */
  async function erase(): Promise<boolean> {
    if (running) await running;
    const r = await call('DELETE').catch(() => null);
    if (!r?.res?.ok) return false;
    lastRaw.clear();
    writeMeta(freshMeta(readMeta().account));
    setStatus({ state: isOn() ? 'idle' : 'off', counts: {}, waiting: 0 });
    return true;
  }

  return {
    scan,
    sync,
    setOn,
    erase,
    isOn,
    status: () => status,
    subscribe(l: (s: SyncStatus) => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    _meta: readMeta,
  };
}

export type CloudSync = ReturnType<typeof createCloudSync>;
