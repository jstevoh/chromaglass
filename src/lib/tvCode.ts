// The phone's half of a TV's sign-in by a short code (PLAN.md 12-tv-signin).
//
// A TV (the Apple TV app, 12-tv-apple; the Google TV app, 12-tv-2) shows a code
// like `BDKM-QXTZ` and the address of this page. The player opens it on their
// phone, signs in, types the code, and the licence Worker (server/tv-code.js)
// files the claim for the account's best key. The TV, polling with a device
// code only it holds, collects a pass. Nothing about the key comes back here:
// the phone only learns whether the claim took, and for which tier.

/** The letters a TV code is drawn from: twenty consonants (server/tv-code.js). */
export const TV_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';

/** What a player typed, as the eight letters, or null while it is not a whole code. */
export function normalizeTvCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 8) return null;
  for (const ch of s) if (!TV_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/**
 * The code as it is shown while typed: capitals, a dash after four, and only
 * letters a code can hold, so a vowel or a digit typed by mistake never appears.
 */
export function formatTvCodeInput(input: string): string {
  const letters = [...input.toUpperCase()].filter((ch) => TV_CODE_ALPHABET.includes(ch)).slice(0, 8).join('');
  return letters.length > 4 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : letters;
}

export type TvClaimResult =
  | { state: 'ok'; tier: 'home' | 'pro' }
  | { state: 'no-licence' }
  | { state: 'no-such-code' }
  | { state: 'signed-out' }
  | { state: 'too-many'; retryAfter: number }
  | { state: 'unreachable' };

function workerBase(): string | null {
  const url = import.meta.env.VITE_FIREBASE_LICENSES_URL as string | undefined;
  return url ? url.replace(/\/$/, '').replace(/\/keys$/, '') : null;
}

/** Claims the code a TV is showing for the signed-in account. */
export async function claimTvCode(code: string): Promise<TvClaimResult> {
  const base = workerBase();
  const userCode = normalizeTvCode(code);
  if (!base) return { state: 'unreachable' };
  if (!userCode) return { state: 'no-such-code' };
  // Only a build with a sign-in carries Firebase: Vite drops this import from a build
  // without its keys, as it drops the form (`npm run signin`, 1a), and such a build
  // has no account to claim for.
  const auth = import.meta.env.VITE_FIREBASE_API_KEY ? await import('./firebaseAuth').catch(() => null) : null;
  const token = await auth?.getCurrentIdToken().catch(() => null);
  if (!token) return { state: 'signed-out' };
  try {
    const res = await fetch(`${base}/tv/claim`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userCode }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.tier === 'home' || data.tier === 'pro')) return { state: 'ok', tier: data.tier };
    if (res.status === 403) return { state: 'no-licence' };
    if (res.status === 404 || res.status === 400) return { state: 'no-such-code' };
    if (res.status === 401) return { state: 'signed-out' };
    if (res.status === 429) return { state: 'too-many', retryAfter: Number(data.retryAfter) || 60 };
    return { state: 'unreachable' };
  } catch {
    return { state: 'unreachable' };
  }
}
