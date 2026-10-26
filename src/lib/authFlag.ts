const SIGNED_IN_KEY = 'chromaglass-signed-in';
const EMAIL_KEY = 'chromaglass-auth-email';
const PENDING_EMAIL_KEY = 'chromaglass-pending-email';

/**
 * Said on `window` whenever this tab's signed-in flag changes, so what reads it
 * (the Sign in / Profile buttons, the profile sheet) can redraw. Another tab's
 * change arrives as the browser's own `storage` event instead; `onAuthFlagChange`
 * listens for both. Before this, the flag was read once at first render, so a
 * sign-out (here, in another tab, or by the background check finding the session
 * gone) left the buttons saying "Profile" with nothing behind them, and nothing
 * on screen offered a way back in short of reloading the page.
 */
export const AUTH_CHANGED_EVENT = 'cg-auth-changed';

function announce(): void {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  } catch {
    // no window
  }
}

export function onAuthFlagChange(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === SIGNED_IN_KEY || e.key === EMAIL_KEY) fn();
  };
  window.addEventListener(AUTH_CHANGED_EVENT, fn);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, fn);
    window.removeEventListener('storage', onStorage);
  };
}

export function isSignedInCached(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSignedInCached(email?: string | null): void {
  try {
    localStorage.setItem(SIGNED_IN_KEY, '1');
    if (email) {
      localStorage.setItem(EMAIL_KEY, email);
    }
  } catch {
    // storage unavailable
  }
  announce();
}

export function clearSignedInCached(): void {
  try {
    localStorage.removeItem(SIGNED_IN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // storage unavailable
  }
  announce();
}

export function getCachedEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function getPendingEmail(): string | null {
  try {
    return localStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setPendingEmail(email: string): void {
  try {
    localStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    // storage unavailable
  }
}

export function clearPendingEmail(): void {
  try {
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // storage unavailable
  }
}

export function hasEmailSignInLink(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'signIn' && Boolean(params.get('oobCode'));
  } catch {
    return false;
  }
}

export function stripEmailSignInParams(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    let changed = false;
    for (const k of ['mode', 'oobCode', 'apiKey', 'lang', 'continueUrl']) {
      if (url.searchParams.has(k)) {
        url.searchParams.delete(k);
        changed = true;
      }
    }
    if (changed) {
      const qs = url.searchParams.toString();
      const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash}`;
      window.history.replaceState(null, '', next);
    }
  } catch {
    // ignore
  }
}

import {
  getCachedLicenseStatus,
  hasStoredLicenseTokenSync,
  verifyStoredLicense,
} from './licenseKey';

export function hasValidLicenseSync(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: { license?: { valid?: boolean } } };
  if (w.__CHROMAGLASS_NATIVE__?.license?.valid) return true;
  return getCachedLicenseStatus().valid;
}

export function hasStoredLicenseCandidateSync(): boolean {
  return hasStoredLicenseTokenSync();
}

export async function verifyStoredLicenseOnLoad(): Promise<boolean> {
  const status = await verifyStoredLicense();
  return status.valid;
}

/**
 * Does this page open only for a paid licence (PLAN.md 23.17d)?
 *
 * The owner, 2026-10-25: "The Mac app should check the license. The app won't
 * work for free." Until then the Mac app was built with no sign-in and gated
 * nothing, so every download read Pro. Now the app (its shell says
 * `requireSignIn`, desktop/main.js) and any browser opened on the app's own
 * server (the site built for the app, `VITE_MAC_APP=1`, desktop.yml) open the
 * show only with a verified Home or Pro key: being signed in is no longer
 * enough, as it was under 23.11, because a free account is not a licence. The
 * browser on the app's server matters as much as the app's window: without it,
 * `http://localhost:3000` in Chrome would be the whole show, free.
 */
export function requiresPaidLicenceSync(): boolean {
  if (import.meta.env?.VITE_MAC_APP === '1') return true;
  return requiresDesktopSignInSync();
}

export function requiresDesktopSignInSync(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: { requireSignIn?: boolean } };
  if (w.__CHROMAGLASS_NATIVE__?.requireSignIn) return true;
  try {
    return new URLSearchParams(window.location.search).get('requireSignIn') === '1';
  } catch {
    return false;
  }
}

