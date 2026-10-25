/**
 * The account's licence key, brought to this browser (PLAN.md 23.12, 23.10c).
 *
 * Reported by the owner, 2026-10-24: signed in with the account that holds his
 * Pro key, the app said Free. Two things kept the key away. The licence Worker
 * refused every real sign-in (its fix and its check are in
 * server/license-worker.js and `npm run license-worker`), and this fetch lived
 * inside the profile sheet's effect, so it ran only while the sheet was open: a
 * buyer who signed in and went straight to the plate was Free until they happened
 * to open their profile. Now the app asks once it is up and signed in, and
 * again whenever this browser signs in, from the sheet or anywhere else
 * (App.tsx). It is not asked from main.tsx: a second dynamic import of this
 * module beside the App's own puts it in the App's chunk under another facade,
 * and the build's preloadApp then finds no chunk for App.tsx.
 *
 * Never on the way to the plate: the show starts first and this follows in the
 * background, and a Worker that is down or offline changes nothing (the key a
 * browser already holds is verified offline, as before). Firebase is imported
 * here only on demand, so a build without it (every check, a fork) carries none.
 */

import { activateLocalLicenseKey, retireStoredLicenseKey, verifyLicenseKey, type LicenseTier } from './licenseKey';
import { getCachedEmail } from './authFlag';
import { getActiveLicenseInfo, getMarketingOptIn, hasExplicitMarketingChoice, setMarketingOptIn, syncMarketingPreferenceToServer } from './tierGates';

export type AccountLicenseResult =
  /** No Worker in this build, or not signed in: nothing was asked. */
  | { state: 'skipped' }
  /** The Worker could not be reached or said no; what the browser holds stands. */
  | { state: 'unreachable'; status?: number }
  /** The account holds no key. */
  | { state: 'none' }
  /** The account's best key is active here (or a better one already was). */
  | { state: 'active'; tier: LicenseTier }
  /** The account holds a key this app cannot verify (signed by a retired key pair, say). */
  | { state: 'unverifiable'; tier: LicenseTier; error: string }
  /** The account's key was removed from this computer by hand, and stays off it until asked back. */
  | { state: 'declined'; tier: LicenseTier };

/**
 * Keys taken off this computer with "Remove from this computer". Without this,
 * the next signed-in start put the key straight back, and on the Mac app took
 * back the machine seat its owner had just freed for a new Mac (the review of
 * #460). Asked back from the sheet, which clears it.
 */
const DECLINED_KEY = 'chromaglass-account-keys-declined';
function declined(): string[] {
  try { return JSON.parse(localStorage.getItem(DECLINED_KEY) || '[]'); } catch { return []; }
}
export function declineAccountKey(id: string | null | undefined): void {
  if (!id) return;
  try { localStorage.setItem(DECLINED_KEY, JSON.stringify([...new Set([...declined(), id])])); } catch { /* storage refused */ }
}
export function allowAccountKeys(): void {
  try { localStorage.removeItem(DECLINED_KEY); } catch { /* storage refused */ }
}

const RANK: Record<LicenseTier, number> = { free: 0, home: 1, pro: 2 };

let last: AccountLicenseResult = { state: 'skipped' };
let lastAt = 0;
let lastEmail: string | null = null;
let running: Promise<AccountLicenseResult> | null = null;
/** A start announces the sign-in more than once (authFlag.ts); one answer serves them all. */
const FRESH_MS = 30_000;

/** What the last ask found, for the profile sheet to say. */
export function lastAccountLicense(): AccountLicenseResult {
  return last;
}

/**
 * Ask the licence Worker for this account's keys and make the best one active
 * here, if it beats what this browser already holds. One ask at a time: the
 * sheet and the app's start can both call it.
 */
export function syncAccountLicense(force = false): Promise<AccountLicenseResult> {
  // Fresh only for the same account: signed out of one and into another
  // within the half minute, the second's keys are asked for, not the first's
  // answer handed back (the review of #460).
  if (!force && !running && last.state !== 'skipped' && last.state !== 'unreachable' && lastEmail === getCachedEmail() && Date.now() - lastAt < FRESH_MS) {
    return Promise.resolve(last);
  }
  if (!running) {
    running = run().then((r) => {
      last = r;
      lastAt = Date.now();
      lastEmail = getCachedEmail();
      running = null;
      try { window.dispatchEvent(new Event('cg-account-license')); } catch { /* no window */ }
      return r;
    });
  }
  return running;
}

async function run(): Promise<AccountLicenseResult> {
  const licensesUrl = import.meta.env.VITE_FIREBASE_LICENSES_URL as string | undefined;
  if (!licensesUrl || !import.meta.env.VITE_FIREBASE_API_KEY) return { state: 'skipped' };
  const auth = await import('./firebaseAuth').catch(() => null);
  const token = await auth?.getCurrentIdToken().catch(() => null);
  if (!token) return { state: 'skipped' };
  if (hasExplicitMarketingChoice()) void syncMarketingPreferenceToServer(token, getMarketingOptIn());

  let data: { keys?: Array<{ key?: string; token?: string; tier?: string; revoked?: boolean }>; marketingOptIn?: boolean | null };
  try {
    // The secret is the Worker's address with no path (deploy.yml); one set with
    // `/keys` on the end still works, as /preferences already allowed.
    const base = licensesUrl.replace(/\/$/, '').replace(/\/keys$/, '');
    const res = await fetch(`${base}/keys`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return { state: 'unreachable', status: res.status };
    data = await res.json();
  } catch {
    return { state: 'unreachable' };
  }

  if (typeof data.marketingOptIn === 'boolean' && !hasExplicitMarketingChoice()) setMarketingOptIn(data.marketingOptIn);

  const all = (data.keys ?? [])
    .filter((k) => !k.revoked && (k.token || k.key))
    .map((k) => ({ id: (k as { id?: string }).id, token: (k.token || k.key) as string, tier: (k.tier === 'pro' ? 'pro' : 'home') as LicenseTier }))
    .sort((a, b) => RANK[b.tier] - RANK[a.tier]);
  const result = await pick(all);
  // After the pick, so a Home key the account upgraded is judged by the Pro
  // key that replaced it here, not before.
  const held = getActiveLicenseInfo();
  const account = await auth?.getCurrentUserEmail().catch(() => null) ?? getCachedEmail();
  if (heldKeyRefunded(held, account, all.map((k) => k.id ?? ''))) {
    void retireStoredLicenseKey();
    return { state: 'none' };
  }
  return result;
}

/**
 * Has the key this machine holds been taken back (PLAN.md 23.17d)?
 *
 * A refund takes the key out of the buyer's list in the licence Worker
 * (`refund` in server/license-worker.js), and `/keys` lists only what is left.
 * But a signed key verifies offline for ever, so until now a refunded buyer
 * kept Pro on every machine that already held it: the Mac app, which is now
 * sold rather than given, would be theirs for the price of a refund.
 *
 * Only a key filed under this very account can be judged by this account's
 * list: one bought with another address, or typed in by hand from someone
 * else's email, is not this account's to take away, and is left alone. So: the
 * key's own email is the signed-in one, the Worker answered, and the key is not
 * in what it said.
 */
export function heldKeyRefunded(
  held: { valid: boolean; id: string | null; email: string | null },
  accountEmail: string | null,
  accountKeyIds: string[],
): boolean {
  if (!held.valid || !held.id || !held.email || !accountEmail) return false;
  if (held.email.trim().toLowerCase() !== accountEmail.trim().toLowerCase()) return false;
  return !accountKeyIds.includes(held.id);
}

async function pick(all: Array<{ id?: string; token: string; tier: LicenseTier }>): Promise<AccountLicenseResult> {
  if (!all.length) return { state: 'none' };
  const off = declined();
  const offered = all.filter((k) => !k.id || !off.includes(k.id));
  if (!offered.length && !getActiveLicenseInfo().valid) return { state: 'declined', tier: all[0].tier };

  const held = getActiveLicenseInfo();
  let refused: { tier: LicenseTier; error: string } | null = null;
  for (const k of offered) {
    if (held.valid && RANK[held.tier] >= RANK[k.tier]) return { state: 'active', tier: held.tier };
    const checked = await verifyLicenseKey(k.token);
    if (!checked.valid) {
      refused ??= { tier: k.tier, error: checked.error };
      continue;
    }
    const status = await activateLocalLicenseKey(k.token);
    if (status.valid) return { state: 'active', tier: status.tier };
    refused ??= { tier: k.tier, error: status.error ?? 'invalid' };
  }
  if (held.valid) return { state: 'active', tier: held.tier };
  return refused ? { state: 'unverifiable', ...refused } : { state: 'none' };
}
