/**
 * The Mac app asking the licence Worker for a seat (PLAN.md 23.17g).
 *
 * A key is sold for two machines. The Worker counts them (`POST /activate`,
 * server/license-worker.js), but nothing ever asked it: the app verified the key
 * offline and its own show server counted seats per Mac, which cannot see
 * another Mac. So one key opened the app on any number of them. This file is the
 * asking, kept free of imports so `npm run license-worker` can run it against
 * the real Worker.
 *
 * Offline is not a refusal. A Mac that cannot reach the Worker (a venue with no
 * wifi, Cloudflare down) is let in on the key's signature, as before, and
 * `licenseKey.ts` asks again at its next online start; only an answer from the
 * Worker, "full" or "revoked", takes a key off a Mac, and then from the next
 * start, never in the middle of a show (the never-lock-out rule, PLAN.md 23.10).
 */

export type SeatAnswer =
  /** The Worker holds this Mac's seat. */
  | { state: 'seated'; machines: number; maxMachines: number }
  /** Both seats are other Macs'. `labels` names them as they called themselves. */
  | { state: 'full'; machines: number; maxMachines: number; labels: string[] }
  /** The key was refunded. */
  | { state: 'revoked' }
  /** No answer worth acting on: offline, a slow or failing Worker, a reply that is not its own. */
  | { state: 'unknown' };

/** The Worker's address from the build: the secret has no path, but one with `/keys` still works (accountLicense.ts). */
export function workerBase(licensesUrl: string): string {
  return licensesUrl.replace(/\/$/, '').replace(/\/keys$/, '');
}

async function post(
  base: string,
  path: string,
  body: unknown,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await doFetch(`${workerBase(base)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      ...(ctl ? { signal: ctl.signal } : {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body: parsed && typeof parsed === 'object' ? parsed : {} };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Ask for this Mac's seat on `key`. Never throws. */
export async function askForSeat(
  base: string,
  key: string,
  seatId: string,
  label: string,
  doFetch: typeof fetch = fetch,
  timeoutMs = 8000,
): Promise<SeatAnswer> {
  const r = await post(base, '/activate', { key, machineId: seatId, label }, doFetch, timeoutMs);
  if (!r) return { state: 'unknown' };
  const n = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  if (r.status === 200 && r.body.ok === true) {
    return { state: 'seated', machines: n(r.body.machines, 1), maxMachines: n(r.body.maxMachines, 2) };
  }
  if (r.status === 409) {
    const labels = Array.isArray(r.body.labels) ? r.body.labels.filter((l): l is string => typeof l === 'string') : [];
    return { state: 'full', machines: n(r.body.machines, labels.length), maxMachines: n(r.body.maxMachines, 2), labels };
  }
  if (r.status === 401 && r.body.error === 'key revoked') return { state: 'revoked' };
  return { state: 'unknown' };
}

/** Give this Mac's seat back, for "Remove from this computer". Best effort: a Mac offline keeps it until asked again. */
export async function releaseSeat(
  base: string,
  key: string,
  seatId: string,
  doFetch: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<boolean> {
  const r = await post(base, '/deactivate', { key, machineId: seatId }, doFetch, timeoutMs);
  return !!r && r.status === 200;
}

/** What the door says when the Worker refused the key. */
export function seatRefusal(a: SeatAnswer): string | null {
  if (a.state === 'revoked') return 'This licence key was refunded, so it no longer opens the app.';
  if (a.state === 'full') {
    const where = a.labels.length ? ` (${a.labels.join(' and ')})` : '';
    return `This licence key is already in use on ${a.maxMachines} Macs${where}. Choose "Remove from this computer" in its Account sheet on one of them, then try again.`;
  }
  return null;
}
