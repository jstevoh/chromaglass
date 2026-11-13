// Hourly allowances for the Workers' routes that anyone can call, counted in the isolate's
// memory, not in KV (the security review of 2026-11-13).
//
// What was found: the licence Worker counted every ask against an address with a KV
// counter, `rl:activate:<kind>:<address>:<hour>`, one `get` and one `put` for each request
// that had not yet hit its limit, and it did so before reading anything else in the
// request. `curl -X POST /tv/poll -d '{}'` wrote a counter. One address could make about
// 1600 writes an hour across /tv/poll (1440 allowed), /tv/renew, /tv/code and /activate,
// and Workers KV on the free plan allows 1000 writes a day for the whole Cloudflare
// account (PLAN.md 23.18-cost). Past that every `put` throws, so a paid order's webhook
// is not filed, no Mac activates and no TV links until the day turns over. The brake was
// the thing that could be driven into the wall.
//
// Why memory and not something cleverer: a counter that writes nothing cannot spend the
// account's writes. An isolate keeps its module state between requests, and a loop from
// one machine mostly lands on the same few isolates, so this still stops the script it
// was written for. What it gives up is exactness: Cloudflare runs many isolates, each
// with its own count, so a sender spread across them gets a multiple of the allowance.
// For the routes counted here that is acceptable because none of them writes anything
// for a stranger: /activate writes only for a valid signed key, /tv/poll only for the TV
// holding the 32-byte device code, /tv/renew only for a valid pass. The one exception
// is /tv/code, which files a ten-minute record for whoever asks, so the licence Worker
// also asks Cloudflare's Rate Limiting binding for that route when it is bound
// (`TV_CODE_LIMITER`, which counts across isolates within a location and writes no KV).
//
// The counts that need to be exact and that only a signed-in or key-holding caller can
// spend (a key's own allowance, an account's wrong TV codes) stay in KV, in the Worker.
//
// An attacker who rotates addresses fills the map instead. IPv6 is counted by its /64,
// which is what one subscriber gets, so rotating within it buys nothing. Past
// `TURNS_MAX_KEYS` callers in one hour a new caller is refused until the hour turns
// rather than the map being cleared, because clearing it would give every caller a fresh
// allowance (the flaw the relay's own counter had, mcp/tunnel-worker.js).

const HOUR_MS = 3_600_000;
export const TURNS_MAX_KEYS = 20_000;

const turns = new Map();
let turnsHour = -1;

/** One subscriber's address: IPv4 as is, IPv6 cut to its /64. */
export function ipKey(ip) {
  if (!ip || !ip.includes(':')) return ip || '';
  const [head] = ip.split('::');
  const groups = ip.includes('::')
    ? [...head.split(':').filter(Boolean), ...Array(8).fill('0')].slice(0, 4)
    : ip.split(':').slice(0, 4);
  return `${groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/**
 * Takes one of `who`'s `limit` asks of `kind` this hour, or returns the seconds until the
 * hour turns when they are spent. An empty `who` (no address, the local checks) is not
 * counted.
 */
export function takeMemoryTurn(kind, who, limit, now = Date.now()) {
  if (!who) return 0;
  const hour = Math.floor(now / HOUR_MS);
  if (hour !== turnsHour) {
    turns.clear();
    turnsHour = hour;
  }
  const wait = Math.max(1, Math.ceil(((hour + 1) * HOUR_MS - now) / 1000));
  const k = `${kind}\u0000${who}`;
  const used = turns.get(k) || 0;
  if (used >= limit) return wait;
  if (!used && turns.size >= TURNS_MAX_KEYS) return wait;
  turns.set(k, used + 1);
  return 0;
}

/** For the checks: start the hour's counts afresh. */
export function resetTurnsForChecks() {
  turns.clear();
  turnsHour = -1;
}
