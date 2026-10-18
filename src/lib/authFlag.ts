const SIGNED_IN_KEY = 'chromaglass-signed-in';
const EMAIL_KEY = 'chromaglass-auth-email';
const PENDING_EMAIL_KEY = 'chromaglass-pending-email';

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
}

export function clearSignedInCached(): void {
  try {
    localStorage.removeItem(SIGNED_IN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // storage unavailable
  }
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

export function hasValidLicenseSync(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: { license?: { valid?: boolean } } };
  if (w.__CHROMAGLASS_NATIVE__?.license?.valid) return true;
  try {
    const t = localStorage.getItem('chromaglass-license-tier');
    return t === 'home' || t === 'pro';
  } catch {
    return false;
  }
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

