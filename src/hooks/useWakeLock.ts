import { useEffect, useState } from 'react';

/**
 * Keeping the screen on.
 *
 * A laptop that dims at 11pm dims the projector with it, and a screensaver on
 * the show machine is a screensaver on the wall. The README's answer used to
 * be "turn off sleep on the laptop before the show", which is a thing to
 * remember at exactly the moment nobody has a hand free. The Screen Wake Lock
 * API is the thing that does it automatically, and it is one call.
 *
 * Two facts decide the shape of this:
 *
 * **The lock is released whenever the page hides.** That is the spec, not a
 * bug: a tab in the background has no business keeping a screen awake. So the
 * lock has to be asked for again every time the page comes back, and the
 * request has to be idempotent because `visibilitychange` fires for reasons
 * that have nothing to do with sleeping.
 *
 * **It needs a secure context.** `https://`, or `localhost`. The show server
 * serves plain http on a LAN address so a fader moves the plate in
 * milliseconds rather than through a datacentre — which means the laptop
 * running the show at `http://localhost:3000` gets the lock and a network
 * display at `http://192.168.1.x:3000` does not. `supported` says which, so
 * the UI can tell the truth rather than promising something that never
 * happened.
 */
export interface WakeLockState {
  /** The API exists here and the context is secure enough to use it. */
  supported: boolean;
  /** A lock is currently held. */
  held: boolean;
}

interface SentinelLike {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<SentinelLike>;
}

const api = (): WakeLockLike | null =>
  (navigator as unknown as { wakeLock?: WakeLockLike }).wakeLock ?? null;

/**
 * Hold a screen wake lock while `want` is true.
 *
 * Re-acquires on every return to visibility, and never holds two at once:
 * the old sentinel is released before a new one is asked for, which the
 * straightforward version of this gets wrong (it overwrites the handle and
 * leaks the lock it was holding).
 */
export function useWakeLock(want: boolean): WakeLockState {
  const [held, setHeld] = useState(false);
  const supported = !!api();

  useEffect(() => {
    const wl = api();
    if (!want || !wl) { setHeld(false); return; }
    let alive = true;
    let lock: SentinelLike | null = null;

    const drop = () => {
      const l = lock;
      lock = null;
      l?.release().catch(() => { /* already gone */ });
    };

    const acquire = () => {
      if (!alive || lock || document.visibilityState !== 'visible') return;
      wl.request('screen').then(l => {
        if (!alive) { l.release().catch(() => {}); return; }
        lock = l;
        setHeld(true);
        // The OS can take it back (the lid, a power-saver kicking in). Notice,
        // so the next return to visibility asks again rather than believing a
        // handle that no longer holds anything.
        l.addEventListener?.('release', () => { if (lock === l) { lock = null; setHeld(false); } });
      }).catch(() => { setHeld(false); });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') acquire();
      else { lock = null; setHeld(false); }   // the browser has already released it
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      drop();
      setHeld(false);
    };
  }, [want]);

  return { supported, held };
}
