/**
 * Both ends of the Mac app's sign-in hand-off (PLAN.md 23.17f; the server's
 * half and why it is safe are in server/signin-handoff.js).
 *
 * The browser tab, once Google or Apple has signed it in, posts the provider's
 * credential to the app's server under the window's one-time code. The window
 * asks the server for it every two seconds and signs itself in with it.
 *
 * The window's watch lives here, at module level, and not in the sign-in form:
 * the form goes away the moment the licence arrives (the door opens the show,
 * AppLicenceGate.tsx), which in the browser happens a breath after the
 * credential is posted. A watch inside the form would be gone by then, and the
 * window would open the show signed out, which is the bug this fixes.
 *
 * Imported only from the sign-in's lazy chunk, which carries Firebase anyway.
 */
import { signInWithHandedCredential } from './firebaseAuth';

const PATH = '/signin-handoff';
const POLL_MS = 2_000;
/** As long as someone might reasonably take to finish in the browser, with Apple's two-factor. */
const WATCH_FOR_MS = 10 * 60_000;

/** The browser's end: file the credential for the window. True when the server took it. */
export async function sendHandoff(code: string, credential: object | null): Promise<boolean> {
  if (!credential) return false;
  try {
    const res = await fetch(PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ h: code, credential }),
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type HandoffState = 'waiting' | 'signed-in' | 'failed' | 'stopped';
type Listener = (state: HandoffState, detail?: string) => void;

let watch: { code: string; timer: ReturnType<typeof setInterval>; until: number } | null = null;
const listeners = new Set<Listener>();
const tell = (state: HandoffState, detail?: string) => listeners.forEach((l) => l(state, detail));

export function stopHandoffWatch(): void {
  if (watch) clearInterval(watch.timer);
  watch = null;
  tell('stopped');
}

/** The window's end: ask the server for this code's sign-in until it comes, or ten minutes pass. */
export function startHandoffWatch(code: string): void {
  if (watch) clearInterval(watch.timer);
  let asking = false;
  const tick = async () => {
    const w = watch;
    if (!w || w.code !== code || asking) return;
    if (Date.now() > w.until) {
      stopHandoffWatch();
      return;
    }
    asking = true;
    try {
      const res = await fetch(`${PATH}?h=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const body = res.ok ? ((await res.json()) as { credential?: object }) : null;
      if (!body?.credential || watch?.code !== code) return;
      clearInterval(w.timer);
      watch = null;
      try {
        await signInWithHandedCredential(body.credential);
        tell('signed-in');
      } catch (err) {
        tell('failed', (err as { code?: string; message?: string })?.code ?? (err as Error)?.message);
      }
    } catch {
      // The server is this app's own; a miss is a moment, so ask again.
    } finally {
      asking = false;
    }
  };
  watch = { code, timer: setInterval(() => void tick(), POLL_MS), until: Date.now() + WATCH_FOR_MS };
  tell('waiting');
}

export function onHandoff(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
