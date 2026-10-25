/**
 * Cloud sync in the running app (PLAN.md 23.18): when it runs, and the hooks the
 * profile sheet and the stores' owners use. The engine is cloudSync.ts.
 *
 * When. Only in a build that knows the licence Worker's address, signed in, and
 * with a Pro key active here; the Worker checks the account's own Pro key again
 * on every call, so a browser that merely claims Pro gets a 403 and stops asking
 * for half an hour. It starts a few seconds after the app does, never on the way
 * to the plate. Then:
 *
 *   - every 5 s it looks for local changes (a string comparison per key), and
 *     sends once nothing has changed for 4 s, or 30 s after the first change if
 *     the player keeps editing, never more than once in 5 s: Workers KV takes
 *     one write a second per key, and every send is one write;
 *   - every minute while the window is visible, and on focus or coming back
 *     online, it asks what changed in the cloud;
 *   - on its first round and every ten minutes it sends a manifest, and the
 *     cloud names anything it lost (server/cloud-sync.js);
 *   - unreachable, it waits 15 s, then twice as long each time up to 5 min, and
 *     everything stays here until it is back. A show with no internet is a show
 *     with sync paused, never a show that stops.
 *
 * What is not done: sending on the way out (pagehide). A Mac app quit straight
 * after an edit sends that edit the next time it opens, which is when another
 * device could next want it from this one anyway.
 */

import { useEffect, useState } from 'react';
import { getCachedEmail, isSignedInCached } from './authFlag';
import { getEffectiveTier } from './tierGates';
import { createCloudSync, SYNC_EVENT, type CloudSync, type SyncStatus } from './cloudSync';

const TICK_MS = 5_000;
const QUIET_MS = 4_000;
const MAX_HOLD_MS = 30_000;
const MIN_GAP_MS = 5_000;
const PULL_MS = 60_000;
const MANIFEST_MS = 10 * 60_000;
const NOT_PRO_WAIT_MS = 30 * 60_000;

function syncBase(): string | null {
  const url = import.meta.env.VITE_FIREBASE_LICENSES_URL as string | undefined;
  if (!url || !import.meta.env.VITE_FIREBASE_API_KEY) return null;
  return url.replace(/\/$/, '').replace(/\/keys$/, '');
}

/** Whether this build can sync at all (it knows where the cloud is). */
export const cloudSyncBuilt = (): boolean => syncBase() != null;

let engine: CloudSync | null = null;

export function cloudSync(): CloudSync | null {
  const base = syncBase();
  if (!base) return null;
  engine ??= createCloudSync({
    storage: localStorage,
    fetch: (...a) => fetch(...a),
    base,
    account: getCachedEmail,
    token: async () => {
      const auth = await import('./firebaseAuth').catch(() => null);
      return (await auth?.getCurrentIdToken().catch(() => null)) ?? null;
    },
    onApplied: (keys) => {
      try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { keys } })); } catch { /* no window */ }
    },
  });
  return engine;
}

/** Signed in, Pro here, and not turned off on this device. */
export function cloudSyncActive(): boolean {
  const e = cloudSync();
  return !!e && isSignedInCached() && getEffectiveTier() === 'pro' && e.isOn();
}

let started = false;

/** Start the background rounds. Called once, from App, after the plate is up. */
export function startCloudSync(): () => void {
  const e = cloudSync();
  if (!e || started) return () => {};
  started = true;
  let lastWaiting = 0;
  let changedAt = 0;
  let firstDirtyAt = 0;
  let lastRoundAt = 0;
  let lastManifestAt = 0;
  let waitUntil = 0;
  let backoff = 0;
  /** Why it waits: an unreachable cloud is asked again the moment the network is back; a refusal is not. */
  let waitingFor: 'network' | 'pro' | null = null;

  const round = async (force = false) => {
    if (!cloudSyncActive()) return;
    const t = Date.now();
    if (!force && t < waitUntil) return;
    lastRoundAt = t;
    const full = t - lastManifestAt >= MANIFEST_MS;
    const state = await e.sync(full);
    if (state === 'synced') {
      if (full) lastManifestAt = t;
      backoff = 0;
      waitUntil = 0;
      waitingFor = null;
      firstDirtyAt = 0;
    } else if (state === 'not-pro') {
      waitUntil = Date.now() + NOT_PRO_WAIT_MS;
      waitingFor = 'pro';
    } else if (state === 'offline' || state === 'error' || state === 'full' || state === 'erased') {
      backoff = Math.min(300_000, backoff ? backoff * 2 : 15_000);
      waitUntil = Date.now() + backoff;
      waitingFor = state === 'offline' ? 'network' : null;
    }
  };

  const tick = () => {
    if (!cloudSyncActive()) return;
    const t = Date.now();
    const waiting = e.scan();
    if (waiting !== lastWaiting) { lastWaiting = waiting; changedAt = t; }
    if (waiting && !firstDirtyAt) firstDirtyAt = t;
    if (!waiting) firstDirtyAt = 0;
    if (t - lastRoundAt < MIN_GAP_MS) return;
    const due = waiting
      ? t - changedAt >= QUIET_MS || t - firstDirtyAt >= MAX_HOLD_MS
      : document.visibilityState === 'visible' && t - lastRoundAt >= PULL_MS;
    if (due) void round();
  };

  // Back online, or back in front of the player: a cloud that was out of reach
  // is asked at once rather than when the backoff runs out, which after a few
  // failures was up to five minutes (the review of #467).
  const wake = (ev: Event) => {
    if (ev.type !== 'online' && document.visibilityState !== 'visible') return;
    if (waitingFor === 'network') { backoff = 0; waitUntil = 0; }
    if (ev.type === 'online' || Date.now() - lastRoundAt >= MIN_GAP_MS * 2) void round();
  };
  // A licence that just arrived (accountLicense.ts) may be the Pro key that lets this start.
  const licence = () => { waitUntil = 0; waitingFor = null; void round(true); };

  const first = setTimeout(() => void round(true), 3_000);
  const timer = setInterval(tick, TICK_MS);
  window.addEventListener('focus', wake);
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('cg-account-license', licence);
  return () => {
    started = false;
    clearTimeout(first);
    clearInterval(timer);
    window.removeEventListener('focus', wake);
    window.removeEventListener('online', wake);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('cg-account-license', licence);
  };
}

/** The sync's state, for the profile sheet. */
export function useCloudSyncStatus(): SyncStatus | null {
  const e = cloudSync();
  const [status, setStatus] = useState<SyncStatus | null>(() => e?.status() ?? null);
  useEffect(() => (e ? e.subscribe(setStatus) : undefined), [e]);
  return status;
}

/**
 * Read a store again when the cloud has just written it. Every place that holds
 * a synced key in React state calls this (see the note in cloudSync.ts on why
 * it is not optional). `reloads` maps a localStorage key to how to read it.
 */
export function useCloudSyncReload(reloads: Record<string, () => void>): void {
  useEffect(() => {
    const on = (ev: Event) => {
      const keys = (ev as CustomEvent<{ keys?: string[] }>).detail?.keys ?? [];
      for (const k of keys) if (Object.hasOwn(reloads, k)) reloads[k]();
    };
    // A second tab of the app hears no `cg-cloud-sync`: the cloud's writes reach
    // it as storage events, and without reading them its next save would read as
    // deletions that travel to every device (the review of #467). Any other
    // tab's saves arrive the same way, which keeps two tabs from overwriting each
    // other too.
    const fromTab = (ev: StorageEvent) => {
      if (ev.key && Object.hasOwn(reloads, ev.key)) reloads[ev.key]();
    };
    window.addEventListener(SYNC_EVENT, on);
    window.addEventListener('storage', fromTab);
    return () => {
      window.removeEventListener(SYNC_EVENT, on);
      window.removeEventListener('storage', fromTab);
    };
    // The setters behind each reload are stable; the map is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
