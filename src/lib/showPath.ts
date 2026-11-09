/**
 * Where the show lives on the hosted site, and where the webpage does.
 *
 * The owner chose, 2026-10-24: chromaglass.art always shows the webpage (the
 * landing page, PLAN.md 34a), and the show has its own address that skips it.
 * Before, the landing page came up only for a visitor who was signed out, and
 * only once per tab, so the owner, signed in, typed chromaglass.art and got
 * the plate instead, and read it as "I don't always get the webpage" (PLAN.md
 * 23.16b). The plate now opens straight from `/show`: Play on the landing
 * page goes there, and so does the installed app (the manifest's start_url),
 * the profile sheet when it closes, and the remote's way back to the show.
 *
 * Not `/play`: that already means the phone's Play screen on anything,
 * a laptop or an iPad included (lib/phone.ts, isPlayPath), and a laptop sent
 * there would get the phone's listening screen rather than the desk.
 */
export const SHOW_PATH = '/show';

/**
 * Query words that address the app itself, so for a visitor who need not
 * sign in a `/` with one of them goes straight to it rather than to the
 * webpage (one who must sign in meets the webpage first anyway, main.tsx): the remote and a cast, a shared
 * look, a forced layout or screen, the profile and unsubscribe links, the
 * Mac app's sign-in. Anything else (`?debug`, a campaign's `utm_` words) is a
 * visit to the webpage.
 */
export const APP_WORDS = ['remote', 'cast', 'key', 'look', 'phone', 'play', 'profile', 'unsubscribe', 'requireSignIn'];

/** Does this address show the webpage, the way chromaglass.art itself does? */
export function isLandingAddress(path: string, search: string): boolean {
  if (path !== '/' && path !== '') return false;
  const q = new URLSearchParams(search);
  return !APP_WORDS.some((w) => q.has(w));
}
