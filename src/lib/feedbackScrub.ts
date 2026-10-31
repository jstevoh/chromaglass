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
 * one whatever it looks like, matched at the end of its name (`streamKey`,
 * `relayKey`, `apiToken`, a bare `key`); `keystone`, `keyLight` and `filmKey`
 * are settings and stay. `server/feedback-worker.js` runs a copy of this on
 * what it receives, and the check holds the two to the same answers.
 */

/** Field names that hold a credential. */
const SECRET_FIELD = /(token|secret|password|passwd|authorization|(api|access|private|session|show|relay|display|stream|licen[cs]e)_?key|^key)$/i;

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
  if (v === null || typeof v !== 'object') return v;
  if (depth > 12) return '[too deep]';
  if (Array.isArray(v)) return v.map((x) => scrub(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    out[k] = SECRET_FIELD.test(k) && x != null && x !== '' ? '[removed]' : scrub(x, depth + 1);
  }
  return out;
}

/**
 * The parts of a crash report a note carries, by the sender's two switches:
 * the device and the snapshot always (the GPU, the screen, the projector's
 * size, Evolve), the log and the look's settings only with `logs`, the
 * picture only with `picture`. Pure, so the check can hold the switches to
 * what they say without a page (`npm run feedback-worker`).
 */
export function consented(
  report: { env: unknown; snapshot: unknown; url: string; debug: unknown; look: unknown; log: unknown; previous: unknown; history: unknown; screenshot: unknown },
  opts: { logs: boolean; picture: boolean },
) {
  return {
    env: scrub(report.env),
    snapshot: scrub(report.snapshot),
    diagnostics: opts.logs ? scrub({
      url: report.url, debug: report.debug, look: report.look, log: report.log, previous: report.previous, history: report.history,
    }) : null,
    picture: opts.picture ? report.screenshot : null,
  };
}
