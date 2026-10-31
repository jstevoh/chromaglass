/**
 * What a feedback note must not carry (PLAN 39a), apart from `feedback.ts` so
 * the Worker's check can hold it to its cases in Node with no page around it
 * (`npm run feedback-worker`).
 *
 * The log and the look's settings go out only with the sender's tick, and
 * then walked through this first. Matched by shape, because a log line is
 * whatever an error said: a Firebase ID token (three base64url parts, the
 * first `eyJ`), a licence key (`cg1.…`), a Bearer header, the stream key at
 * the end of an RTMP address, and a URL parameter named like a key or a token
 * (a show's relay key rides in `?key=`). And by name, for a field that holds
 * one whatever it looks like. `keystone`, `keyLight` and `keyColor` are
 * settings, so a bare `key` matches only as the whole name.
 */

/** Field names that hold a credential. */
const SECRET_FIELD = /(token|secret|password|passwd|apikey|api_key|streamkey|stream_key|licen[cs]ekey|licen[cs]e_key|^key$|authorization)/i;

/** A credential inside a string, and what replaces it. */
const SECRET_TEXT: [RegExp, string][] = [
  [/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, '[token]'],
  [/\bcg1\.[\w.-]{8,}/g, '[licence key]'],
  [/\bBearer\s+[\w.~+/=-]+/gi, 'Bearer [removed]'],
  [/(rtmps?:\/\/[^\s"'<>]+\/)[^/\s"'<>]+/gi, '$1[removed]'],
  [/([?&#][\w-]*(?:key|token|secret|auth|sig|signature|password|code)=)[^&#\s"'<>]+/gi, '$1[removed]'],
];

export function scrubText(s: string): string {
  let out = s;
  for (const [re, to] of SECRET_TEXT) out = out.replace(re, to);
  return out;
}

/** A copy of `v` with every credential-shaped field and string replaced. */
export function scrub(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return scrubText(v);
  if (v === null || typeof v !== 'object' || depth > 12) return v;
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    out[k] = SECRET_FIELD.test(k) && x != null && x !== '' ? '[removed]' : scrub(x, depth + 1);
  }
  return out;
}
