import { useEffect, useState } from 'react';
import { isSignedInCached, onAuthFlagChange } from './authFlag';

/**
 * Whether this build has accounts at all: the hosted site does, `npm run dev`,
 * every check and a fork do not, and there nothing offers a sign-in.
 */
export const ACCOUNTS_ON = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);

/**
 * Is this browser signed in, kept current: a sign-in or a sign-out here, in
 * another tab, or the background check finding the session gone (authFlag.ts)
 * all redraw what reads it. Read from the flag, never from Firebase, so it costs
 * the show nothing and never waits on the network.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(isSignedInCached);
  useEffect(() => onAuthFlagChange(() => setSignedIn(isSignedInCached())), []);
  return signedIn;
}
