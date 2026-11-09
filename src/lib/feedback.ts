/**
 * Settings → Feedback (PLAN 39a): what a note carries, and where it goes.
 *
 * The owner asked that a note "send me an email … as well as collect it all in
 * a single database with all of the relevant related logs data so I can track
 * feedback over time". The database and the mail are the feedback Worker's
 * (`server/feedback-worker.js`); this is the page's half: the note, a little
 * that is always useful and never private (the app's version, the browser,
 * the look on the plate, the tier), and — only when the sender leaves the box
 * ticked — the black box's log, the look's settings and a picture of the
 * plate, built by the same `buildReport` a crash report uses so the two never
 * disagree about what "the log" is.
 *
 * Nothing secret leaves. The log and the settings are walked before sending
 * and anything shaped like a credential is replaced: a Firebase token, a
 * licence key (`cg1.…`), a stream key in an RTMP address, any URL parameter
 * named like a key or a token, and any field whose name says it holds one.
 * Who sent it is proved by the account's ID token in the Authorization header,
 * which the Worker checks and never stores; the body never claims a user.
 *
 * With no Worker configured (`VITE_FEEDBACK_URL` unset at build), the panel
 * offers the same note as an email to support@ instead, so it works on a
 * build that has no endpoint, only without the log.
 */
import { buildReport, type CrashReport } from './crashLog';
import { isSignedInCached } from './authFlag';
import { isDesktopApp } from './platform';
import { getEffectiveTier } from './tierGates';
import { wantsPhoneLayout } from './phone';
import { consented } from './feedbackScrub';

export const FEEDBACK_URL: string | undefined = import.meta.env.VITE_FEEDBACK_URL || undefined;
export const SUPPORT_EMAIL = 'support@chromaglass.art';
export const FEEDBACK_MAX = 5000;
/** The pane's name where the settings panel keeps which place is open, and what `focusSection` names to open the sheet at it. */
export const FEEDBACK_PANE = 'feedback';

export type FeedbackTopic = 'bug' | 'idea' | 'love' | 'other';
export const FEEDBACK_TOPICS: { id: FeedbackTopic; name: string }[] = [
  { id: 'bug', name: 'Something broke' },
  { id: 'idea', name: 'An idea' },
  { id: 'love', name: 'Something I love' },
  { id: 'other', name: 'Something else' },
];

export interface FeedbackBody {
  kind: 'chromaglass-feedback';
  version: 1;
  at: string;
  topic: FeedbackTopic;
  message: string;
  /** Typed by someone not signed in, to be answered at. */
  replyTo: string | null;
  app: { version: string | null; build: string | null; shell: 'mac' | 'browser'; phone: boolean; tier: string; look: string | null; page: string };
  env: Record<string, unknown>;
  snapshot: unknown;
  /** The log and the look's settings: only with the sender's tick. */
  diagnostics: Pick<CrashReport, 'debug' | 'look' | 'log' | 'previous' | 'history'> & { url: string } | null;
  picture: CrashReport['screenshot'];
}

// ── The note ─────────────────────────────────────────────────────

async function macVersion(): Promise<string | null> {
  if (!isDesktopApp()) return null;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: { updates?: { state?: () => Promise<{ current?: string }> } } };
  try { return (await w.__CHROMAGLASS_NATIVE__?.updates?.state?.())?.current ?? null; } catch { return null; }
}

function onPhone(): boolean {
  try {
    return wantsPhoneLayout({
      query: location.search, path: location.pathname,
      coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight,
    });
  } catch { return false; }
}

export async function buildFeedback(opts: {
  topic: FeedbackTopic; message: string; replyTo?: string | null; logs: boolean; picture: boolean;
}): Promise<FeedbackBody> {
  const report = await buildReport({ screenshot: opts.picture, settings: opts.logs });
  const snap = report.snapshot as { preset?: unknown } | null;
  return {
    kind: 'chromaglass-feedback',
    version: 1,
    at: new Date().toISOString(),
    topic: opts.topic,
    message: opts.message.trim().slice(0, FEEDBACK_MAX),
    replyTo: opts.replyTo?.trim() || null,
    app: {
      version: await macVersion(),
      build: import.meta.env.VITE_BUILD_SHA || null,
      shell: isDesktopApp() ? 'mac' : 'browser',
      phone: onPhone(),
      tier: getEffectiveTier(),
      look: typeof snap?.preset === 'string' ? snap.preset : null,
      // The path only: a query can carry a show's key.
      page: location.pathname,
    },
    ...(consented(report, opts) as Pick<FeedbackBody, 'env' | 'snapshot' | 'diagnostics' | 'picture'>),
  };
}

/**
 * The account's ID token, when there is an account. The accounts code is
 * loaded only then (it is the Firebase SDK), the same way `accountShows`
 * reaches it, and the token goes in a header the Worker verifies.
 */
// `import.meta.env.X` written plainly, never `import.meta.env?.X`: Vite
// replaces the plain form at build, so a build with no Firebase key drops
// the import below and carries no Firebase at all (`npm run signin` 1a). The
// optional chain hid it from that replacement and put the SDK back in.
async function idToken(): Promise<string | null> {
  if (!import.meta.env.VITE_FIREBASE_API_KEY || !isSignedInCached()) return null;
  try { return await (await import('./firebaseAuth')).getCurrentIdToken(); } catch { return null; }
}

/** Send it. Answers the entry's id, or throws with words fit to show. */
export async function sendFeedback(body: FeedbackBody, url = FEEDBACK_URL): Promise<string> {
  if (!url) throw new Error('Feedback is not set up on this build.');
  const token = await idToken();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the feedback service. Check the connection and try again.');
  }
  if (res.status === 429) throw new Error('That is a lot of notes in an hour. Try again later, or email us.');
  if (res.status === 413) throw new Error('That was too large to send. Untick the picture and try again.');
  if (!res.ok) throw new Error(`The feedback service answered ${res.status}. Try again, or email us.`);
  const data = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof data?.id === 'string' ? data.id : '';
}

/** The same note as an email, for a build with no Worker: the note and the short context, never the log. */
export function feedbackMailto(body: FeedbackBody): string {
  const topic = FEEDBACK_TOPICS.find((t) => t.id === body.topic)?.name ?? body.topic;
  const a = body.app;
  const lines = [
    body.message, '', '──',
    `On: ${a.shell === 'mac' ? `Mac app ${a.version ?? ''}`.trim() : 'browser'}${a.phone ? ', phone layout' : ''}${a.build ? `, build ${a.build.slice(0, 7)}` : ''}`,
    `Look: ${a.look ?? 'unknown'}`,
    `Browser: ${String(body.env.userAgent ?? '')}`,
  ];
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`ChromaGlass feedback: ${topic}`)}&body=${encodeURIComponent(lines.join('\n'))}`;
}
