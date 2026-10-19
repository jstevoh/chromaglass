import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  deleteUser,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  setSignedInCached,
  clearSignedInCached,
  getPendingEmail,
  setPendingEmail,
  clearPendingEmail,
  stripEmailSignInParams,
} from './authFlag';

const REDIRECT_PENDING_KEY = 'chromaglass-redirect-pending';

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let emulatorConnected = false;

export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;

  const emu = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR;
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const sameOriginDomain =
    !emu && (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com'))
      ? host
      : undefined;

  const existing = getApps();
  appInstance =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain:
            sameOriginDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-chromaglass',
          appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:000000000000',
        });

  authInstance = getAuth(appInstance);

  if (emu && !emulatorConnected) {
    emulatorConnected = true;
    connectAuthEmulator(authInstance, emu, { disableWarnings: true });
  }

  return authInstance;
}

export async function signInWithProvider(
  providerId: 'google.com' | 'apple.com',
): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider =
    providerId === 'google.com'
      ? new GoogleAuthProvider()
      : new OAuthProvider('apple.com');

  try {
    const cred = await signInWithPopup(auth, provider);
    setSignedInCached(cred.user.email);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (
      code === 'auth/popup-blocked' ||
      code === 'auth/operation-not-supported-in-this-environment'
    ) {
      try {
        sessionStorage.setItem(REDIRECT_PENDING_KEY, '1');
      } catch {
        // ignore
      }
      await signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function checkPendingRedirect(): Promise<User | null> {
  let pending = false;
  try {
    pending = sessionStorage.getItem(REDIRECT_PENDING_KEY) === '1';
    if (pending) {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
    }
  } catch {
    // ignore
  }
  if (!pending && import.meta.env.VITE_FIREBASE_AUTH_EMULATOR) return null;

  try {
    const auth = getFirebaseAuth();
    const res = await getRedirectResult(auth);
    if (res?.user) {
      setSignedInCached(res.user.email);
      return res.user;
    }
  } catch {
    // ignore if no redirect was pending
  }
  return null;
}

export async function sendMagicLink(email: string): Promise<void> {
  const trimmed = email.trim();
  const auth = getFirebaseAuth();
  setPendingEmail(trimmed);
  await sendSignInLinkToEmail(auth, trimmed, {
    url: window.location.href,
    handleCodeInApp: true,
  });
}

export async function completeEmailLinkSignIn(
  providedEmail?: string,
): Promise<{ needsEmail: true } | { needsEmail: false; user: User }> {
  const auth = getFirebaseAuth();
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    throw new Error('Not a valid sign-in link.');
  }

  const email = providedEmail?.trim() || getPendingEmail();
  if (!email) {
    return { needsEmail: true };
  }

  const cred = await signInWithEmailLink(auth, email, window.location.href);
  setSignedInCached(cred.user.email || email);
  clearPendingEmail();
  stripEmailSignInParams();
  return { needsEmail: false, user: cred.user };
}

export async function verifyReturningUserInBackground(): Promise<void> {
  try {
    const auth = getFirebaseAuth();
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) {
      clearSignedInCached();
      return;
    }
    if (user.email) {
      setSignedInCached(user.email);
    }
    try {
      await user.reload();
      if (auth.currentUser?.email) {
        setSignedInCached(auth.currentUser.email);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (
        code === 'auth/user-token-expired' ||
        code === 'auth/user-not-found' ||
        code === 'auth/user-disabled' ||
        code === 'auth/invalid-user-token'
      ) {
        clearSignedInCached();
      }
    }
  } catch {
    // Network / offline errors never revoke a cached session
  }
}

export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const auth = getFirebaseAuth();
    if (auth.currentUser?.email) return auth.currentUser.email;
    await Promise.race([
      auth.authStateReady(),
      new Promise<void>((resolve) => setTimeout(resolve, 500)),
    ]);
    return auth.currentUser?.email ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentIdToken(): Promise<string | null> {
  try {
    const auth = getFirebaseAuth();
    if (!auth.currentUser) {
      await Promise.race([
        auth.authStateReady(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

export async function signOutCurrentAccount(): Promise<void> {
  clearSignedInCached();
  try {
    const auth = getFirebaseAuth();
    await Promise.race([
      signOut(auth),
      new Promise<void>((resolve) => setTimeout(resolve, 250)),
    ]);
  } catch {
    // ignore offline / emulator disconnect errors during sign-out
  }
}

export async function deleteCurrentAccount(): Promise<void> {
  const auth = getFirebaseAuth();
  await Promise.race([
    auth.authStateReady(),
    new Promise<void>((resolve) => setTimeout(resolve, 1500)),
  ]);
  const user = auth.currentUser;
  clearSignedInCached();
  if (user) {
    await deleteUser(user);
  }
}
