/**
 * The key a TV keeps once the laptop has let it in by four digits (PLAN
 * 12-tv-2, server/tv-pairing.js), so the next evening it joins with nothing
 * asked.
 *
 * Two places keep it. In a browser (a TV's own, a phone propped up), this
 * origin's localStorage. In the Android TV app, the app itself
 * (`androidtv/`, its `ChromaglassTv` bridge): the app opens the Mac at
 * whatever address Bonjour found tonight, and a WebView's storage belongs to
 * an address, so a Mac whose router handed it a new one would find its TV
 * asking to pair again. The app keeps the key by the show's id from the
 * advert instead and puts it in the page's URL; the page tells it when there
 * is a new one, or when the old one stopped working.
 */

/** The Android TV app's bridge (`androidtv/.../MainActivity.java`, `addJavascriptInterface`). */
interface ChromaglassTvBridge {
  /** The laptop allowed this TV: keep this key for this Mac. */
  paired(key: string): void;
  /** This Mac no longer knows the key: drop it, the page is pairing again. */
  forget(): void;
  /**
   * The remote's list of looks is open (true) or shut (PLAN 12-tv-remote), so
   * the app's Back closes it instead of leaving the show. Missing in builds
   * before it.
   */
  menu?(open: boolean): void;
}

declare global {
  interface Window {
    ChromaglassTv?: ChromaglassTvBridge;
  }
}

const STORE = 'chromaglass.tvKey';

/** The kept key, or null. */
export function keptTvKey(): string | null {
  try {
    const k = window.localStorage.getItem(STORE);
    return k && /^tv-[0-9a-f]{32}$/.test(k) ? k : null;
  } catch {
    return null;
  }
}

/** Keep the key the relay handed over, here and in the TV app if this is it. */
export function keepTvKey(key: string): void {
  try { window.localStorage.setItem(STORE, key); } catch { /* private mode: this visit only */ }
  try { window.ChromaglassTv?.paired(key); } catch { /* not the app */ }
}

/** Drop a key the show no longer holds, in both places. */
export function forgetTvKey(): void {
  try { window.localStorage.removeItem(STORE); } catch { /* nothing kept */ }
  try { window.ChromaglassTv?.forget(); } catch { /* not the app */ }
}
