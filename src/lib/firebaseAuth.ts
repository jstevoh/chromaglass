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
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  linkWithCredential,
  updatePassword,
  EmailAuthProvider,
  signOut,
  deleteUser,
  type Auth,
  type AuthCredential,
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

  // Use VITE_FIREBASE_AUTH_DOMAIN directly rather than overriding it with
  // window.location.hostname on .web.app.
  //
  // Reported on the live site after #394: Google sign-in on the owner's iPhone
  // failed with "Error 400: redirect_uri_mismatch" and request details
  // "redirect_uri=https://chromaglass.web.app/__/auth/handler,
  // flowName=GeneralOAuthFlow".
  //
  // Measured against the live deployment:
  //   - Firebase Hosting serves /__/auth/handler directly (HTTP/2 200, 462 B)
  //     on all four domains (chromaglass.art, www.chromaglass.art,
  //     chromaglass.web.app, chromaglass.firebaseapp.com).
  //   - The Firebase-created OAuth 2.0 Web client in Google Cloud Console
  //     (APIs & Services -> Credentials) is only pre-populated by Firebase with
  //     https://chromaglass.firebaseapp.com/__/auth/handler until
  //     https://chromaglass.art/__/auth/handler and
  //     https://chromaglass.web.app/__/auth/handler are added there by hand.
  //   - A browser that visited chromaglass.web.app before #394 has an active
  //     service worker or chromaglass* keys in localStorage, so index.html keeps
  //     it on chromaglass.web.app until 23.16 migrates saved state.
  //   - Overriding VITE_FIREBASE_AUTH_DOMAIN with window.location.hostname when
  //     host.endsWith('.web.app') switched authDomain from the configured
  //     VITE_FIREBASE_AUTH_DOMAIN to chromaglass.web.app on those returning
  //     browsers, sending an unauthorised redirect_uri to Google OAuth while
  //     chromaglass.art used VITE_FIREBASE_AUTH_DOMAIN and succeeded.
  //
  // Keeping authDomain on VITE_FIREBASE_AUTH_DOMAIN ensures every origin uses
  // the domain whose /__/auth/handler is registered on the OAuth client
  // (chromaglass.firebaseapp.com out of the box, or chromaglass.art once added
  // in Google Cloud Console so signInWithRedirect stays same-domain on iPhone
  // Safari).
  const existing = getApps();
  appInstance =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
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

/**
 * Apple's provider (PLAN 23.15, the owner 2026-11-08: "should we add the apple
 * login option as well, now that we have a developer ID?"). The email scope is
 * what puts an address in Firebase's user at all: the licence is kept under the
 * account's email (`keys:<email>` in the licence Worker), so an Apple account
 * with no address could never hold one. Apple sends the address only on the
 * first sign-in and Firebase keeps it from then on. Someone who picks "Hide My
 * Email" gets a relay address (`…@privaterelay.appleid.com`), which is a real,
 * verified, forwarding address and works as the account's email, but it is not
 * the one a licence was bought under; the account sheet says so
 * (`isApplePrivateRelay`). The name scope is asked for because Apple's sheet
 * reads oddly without it, and Firebase keeps it as the display name.
 */
function appleProvider(): OAuthProvider {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('email');
  provider.addScope('name');
  return provider;
}

/** An address from Apple's "Hide My Email": it forwards, but no licence was bought under it. */
export function isApplePrivateRelay(email: string | null | undefined): boolean {
  return /@privaterelay\.appleid\.com$/i.test(email ?? '');
}

export async function signInWithProvider(
  providerId: 'google.com' | 'apple.com',
): Promise<User | null> {
  const auth = getFirebaseAuth();
  const provider = providerId === 'google.com' ? new GoogleAuthProvider() : appleProvider();

  try {
    const cred = await signInWithPopup(auth, provider);
    setSignedInCached(cred.user.email);
    await attachPendingCredential(cred.user);
    return cred.user;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/account-exists-with-different-credential') {
      // The email already has an account made another way (a password, an
      // emailed link, or Google when this was Apple), and Firebase will not
      // merge them on its own. Keep this provider's credential, with the email
      // it was refused for, so the sign-in that follows the old way can attach
      // it (`attachPendingCredential`): one account, every way in.
      const credential =
        providerId === 'google.com'
          ? GoogleAuthProvider.credentialFromError(err as never)
          : OAuthProvider.credentialFromError(err as never);
      const email = (err as { customData?: { email?: string } })?.customData?.email;
      pendingProviderCredential = credential && email ? { credential, email: email.toLowerCase() } : null;
    }
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

/**
 * A provider's credential from a sign-in Firebase refused because its email
 * already has an account made another way, with that email. It is attached on
 * the next sign-in, and only when that sign-in is the same address (PLAN
 * 23.10e-5: it was attached to whichever account signed in next, and only
 * Firebase's own refusal kept it off a stranger's).
 */
let pendingProviderCredential: { credential: AuthCredential; email: string } | null = null;

async function attachPendingCredential(user: User): Promise<void> {
  const waiting = pendingProviderCredential;
  if (!waiting) return;
  pendingProviderCredential = null;
  if ((user.email ?? '').toLowerCase() !== waiting.email) return;
  // And only to an account whose email is confirmed: a password account made
  // under someone else's address and never confirmed must not gain their
  // Apple or Google as a way in (a shared machine, a refused provider sign-in
  // left on the screen, then that password typed in the same tab). Google,
  // Apple and the emailed link are always confirmed, so only an unconfirmed
  // password account goes without the link; it can add it once confirmed.
  if (!user.emailVerified) return;
  await linkWithCredential(user, waiting.credential).catch(() => {
    // Already linked, or the credential went stale: the sign-in itself worked.
  });
}

/** The shortest password this app accepts (Firebase's own floor is 6). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Firebase's codes, in words someone signing in can act on. Firebase answers a
 * wrong password and an email with no password the same way (`auth/invalid-credential`,
 * since email enumeration protection came on by default), so this says both.
 */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-email':
      return 'That email address does not look right.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match. If you signed up with Google or an emailed link, use that and add a password from Account, or reset the password.";
    case 'auth/email-already-in-use':
      return 'That email already has an account.';
    case 'auth/weak-password':
      return `Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`;
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes, or reset the password.';
    case 'auth/network-request-failed':
      return 'Could not reach the sign-in server. Check the connection and try again.';
    case 'auth/requires-recent-login':
      return 'For safety, sign out and sign back in, then try again.';
    case 'auth/provider-already-linked':
      return 'This account already has a password.';
    case 'auth/credential-already-in-use':
      return 'That email belongs to a different account.';
    case 'auth/account-exists-with-different-credential':
      return 'That email already has an account. Sign in the way you made it (Google, Apple, or your email and password) and this way in is added to it; with an emailed link, just use the link.';
    case 'auth/operation-not-allowed':
      return 'That way of signing in is not switched on yet. Use another one for now.';
    default:
      return (err as { message?: string })?.message || 'Could not sign in.';
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
  } catch (err: unknown) {
    // getRedirectResult answers null, not an error, when nothing was pending,
    // so an error here is a real one. It was swallowed whole, which left a
    // refused redirect sign-in (an email that already has an account made
    // another way, the common case once Apple sits beside Google) back on the
    // sign-in with no word at all. When this page sent the redirect, say why
    // it failed; otherwise (a stale result from another visit) stay quiet.
    if (pending) throw err;
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

/**
 * Email and password (PLAN 23.10e). Firebase's one account per email does the
 * joining: Google and an emailed link already give the same uid for the same
 * address, and a password is one more way into that uid, not a second account.
 * Sign-up mails a confirmation link at once: the licence Worker refuses a token
 * whose email is not verified, so a stranger who signs up with someone else's
 * address cannot read that person's licence, and Firebase drops an unconfirmed
 * password when the real owner signs in with Google.
 */
export async function signUpWithPassword(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  setSignedInCached(cred.user.email || email.trim());
  await sendEmailVerification(cred.user).catch(() => {
    // The account exists; the sheet offers the mail again.
  });
  return cred.user;
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  setSignedInCached(cred.user.email || email.trim());
  await attachPendingCredential(cred.user);
  return cred.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const auth = getFirebaseAuth();
  await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/` });
}

/**
 * Someone who typed an email and a new password for an address that already has
 * a Google account: sign in with Google, and if it is the same address, give
 * that account the password.
 */
export async function signInWithGoogleAddPassword(email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth();
  const cred = await signInWithPopup(auth, new GoogleAuthProvider());
  setSignedInCached(cred.user.email);
  if ((cred.user.email ?? '').toLowerCase() !== email.trim().toLowerCase()) {
    throw Object.assign(new Error(`You signed in to Google as ${cred.user.email}, not ${email.trim()}. The password was not added.`), { code: 'cg/other-email' });
  }
  await addPasswordToCurrentUser(password);
  return cred.user;
}

export interface AccountMethods {
  email: string | null;
  emailVerified: boolean;
  /** Google is one of the ways in. */
  google: boolean;
  /** Apple is one of the ways in (PLAN 23.15). */
  apple: boolean;
  /**
   * Firebase lists "password" for an emailed-link account too, with no password
   * set; it cannot be told apart from here, so the sheet says "set a new password"
   * for any account that lists it.
   */
  passwordProvider: boolean;
}

export function getAccountMethods(): AccountMethods | null {
  const user = getFirebaseAuth().currentUser;
  if (!user) return null;
  const ids = user.providerData.map((p) => p.providerId);
  return {
    email: user.email,
    emailVerified: user.emailVerified,
    google: ids.includes('google.com'),
    apple: ids.includes('apple.com'),
    passwordProvider: ids.includes('password'),
  };
}

/** Give the signed-in account a password (a Google one), or a new one (any with the password provider). */
export async function addPasswordToCurrentUser(password: string): Promise<void> {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Sign in first.');
  if (user.providerData.some((p) => p.providerId === 'password')) {
    await updatePassword(user, password);
  } else {
    try {
      await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== 'auth/email-already-in-use') throw err;
      // Linking a password to the email the account already has is the documented
      // way, and Google's servers take it. Firebase's Auth emulator (which
      // `npm run signin` runs against) refuses it as a second use of the email,
      // even when it is this account's own. Setting the password on the signed-in
      // account is the same result, so it is the fallback rather than a dead end.
      await updatePassword(user, password);
    }
  }
}

export async function resendVerificationEmail(): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  await sendEmailVerification(user);
}

/**
 * After the confirmation link is opened (in any tab or on another device): the
 * account is read again, and its token renewed so the licence Worker sees the
 * verified email. True once the email is confirmed.
 */
export async function refreshAccountVerification(): Promise<boolean> {
  const user = getFirebaseAuth().currentUser;
  if (!user) return false;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  return user.emailVerified;
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
  // The flag goes only once the account is gone. Firebase refuses a delete
  // without a recent sign-in (auth/requires-recent-login), and clearing first
  // turned that refusal into what looked like a sign-out, its error hidden
  // with the signed-in half of the sheet (the review of #460).
  if (user) {
    await deleteUser(user);
  }
  clearSignedInCached();
}
