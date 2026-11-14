/**
 * The phone apps, and the laptop they can be a remote for.
 *
 * The apps (PLAN.md §12) are the same build as the website, bundled into a
 * Capacitor shell: on the iPhone drawn by WKWebView from
 * `capacitor://localhost`, on Android by the system WebView from
 * `https://localhost` (12-ctl-3). Each plays the show itself, like the
 * website on a phone. Asked for on
 * 2026-09-27: "make the remote control work on the iPhone app … I'd like to
 * be able to switch back and forth between modes" — so it can also be the
 * phone remote for a show running on the laptop, and go back to playing.
 *
 * On the website the remote has always been a page the laptop serves:
 * `npm run remote` prints `http://<laptop>:3000/?remote=1&key=1234`, the
 * phone opens it, and the socket goes back to the origin the page came from
 * (`remoteSocketUrl`). The app's page comes from inside the app, so its
 * origin has no relay behind it. Instead the app is told the laptop's
 * address once (paste or type what the show server printed), remembers it,
 * and carries it in its own URL as `?relay=`; the socket goes there.
 *
 * Why not navigate the app to the laptop's page, which would need none of
 * this? Because the way back would then depend on the laptop's copy of the
 * app knowing it is inside a phone app, and on the shell letting an http
 * page navigate to its own scheme; and the laptop's page is whatever build
 * the laptop last pulled. Keeping the remote in the app means switching is a
 * reload of the app's own pages in both directions, and the phone's remote
 * is the phone's build. The protocol is the same one either way.
 *
 * Only the app offers this. The website on a phone is served over https, and
 * a page from https cannot open a plain ws:// socket to a laptop on the LAN
 * (mixed content), which is why the show server serves its own copy.
 */
import { SHOW_PATH } from './showPath';

/** Where the remembered laptop lives, per device. */
const STORE_KEY = 'chromaglass-laptop';
/** The show server's port when an address is typed without one (`server/remote-server.js`). */
const DEFAULT_PORT = 3000;

/** A laptop the app can be a remote for: its relay's origin, and the show key it asks for. */
export interface LaptopLink {
  /** `http://192.168.1.20:3000`, or a tunnel's `https://….trycloudflare.com`. */
  relay: string;
  key: string | null;
}

/**
 * Running inside one of the phone apps (iPhone or Android), not a browser.
 *
 * Capacitor puts `window.Capacitor` on every page it draws and answers
 * `isNativePlatform()` true inside the shell; in a browser the global is
 * absent (the app's bundle does not import Capacitor's web runtime, so the
 * website never defines it).
 */
export function isPhoneApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
  } catch {
    return false;
  }
}

/**
 * Read what a person pasted or typed as the laptop's address.
 *
 * Accepts what the show server prints (`http://192.168.1.20:3000/?remote=1&key=1234`),
 * a tunnel's https address, `192.168.1.20:3000`, a bare `192.168.1.20`, or
 * `laptop.local`. The key comes from the address when it carries one; a key
 * typed separately wins, since that is the field the person just filled.
 * Anything that is not http or https is refused: the relay is a web socket
 * behind a web server, and nothing else should be reachable from here.
 */
export function parseLaptopAddress(text: string, typedKey?: string | null): LaptopLink | null {
  const raw = text.trim();
  if (!raw) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  // No port written: plain http means the show server's own port; https is
  // a tunnel, which listens on 443 like any site.
  const port = url.port || (url.protocol === 'http:' ? String(DEFAULT_PORT) : '');
  const relay = `${url.protocol}//${url.hostname}${port ? `:${port}` : ''}`;
  const key = (typedKey ?? '').trim() || url.searchParams.get('key') || null;
  return { relay, key };
}

/** The relay this page was told to use (`?relay=`), or null when it should use its own origin. */
export function relayFromUrl(): string | null {
  try {
    const value = new URLSearchParams(window.location.search).get('relay');
    if (!value) return null;
    const parsed = parseLaptopAddress(value);
    return parsed ? parsed.relay : null;
  } catch {
    return null;
  }
}

/** The WebSocket URL for a relay origin: `http://h:p` → `ws://h:p/remote-ws`. */
export function relaySocketUrl(relay: string, path: string): string {
  const url = new URL(relay);
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${url.host}${path}`;
}

/** The app's page for being a remote to this laptop. */
export function remoteHref(link: LaptopLink): string {
  const q = new URLSearchParams({ remote: '1', relay: link.relay });
  if (link.key) q.set('key', link.key);
  return `/?${q.toString()}`;
}

/** The laptop this phone was last a remote for, if any. */
export function savedLaptop(): LaptopLink | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const got = JSON.parse(raw) as Partial<LaptopLink>;
    if (typeof got?.relay !== 'string') return null;
    return parseLaptopAddress(got.relay, typeof got.key === 'string' ? got.key : null);
  } catch {
    return null;
  }
}

export function saveLaptop(link: LaptopLink): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(link));
  } catch { /* storage refused: the link still works for this visit, it is only not remembered */ }
}

/** Switch the app to being the laptop's remote: straight to it if one is remembered, else to the form that asks. */
export function goRemote(): void {
  const saved = savedLaptop();
  window.location.href = saved ? remoteHref(saved) : '/?remote=1';
}

/** Switch the app back to playing the show itself. */
export function goPlay(): void {
  // The site's show is at /show, past the webpage at / (lib/showPath.ts); the
  // phone apps have no webpage, and their own files answer / for certain.
  window.location.href = isPhoneApp() ? '/' : SHOW_PATH;
}

/**
 * Running inside the Android app (12-ctl-3), as against the iPhone's.
 *
 * Capacitor's `getPlatform()` says which shell drew the page. The two apps
 * share every line but this one difference: Android's WebView has WebGPU on
 * fewer phones than Chrome has, so a phone that cannot draw the plate in the
 * app is offered Chrome (components/NeedsWebGpu.tsx). The iPhone's WKWebView
 * is Safari's engine, which has WebGPU wherever Safari does, so it has
 * nowhere better to send anyone.
 */
export function isAndroidApp(): boolean {
  if (!isPhoneApp()) return false;
  try {
    const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    return cap?.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

/**
 * The website's own show, for a phone that should play it in a browser.
 *
 * chromaglass.art is the site's own name (chromaglass.web.app answers the
 * same build), and the show is at SHOW_PATH, past the webpage at /.
 */
export const SITE_SHOW_URL = `https://chromaglass.art${SHOW_PATH}`;

/**
 * Open the website's show in Chrome, from the Android app.
 *
 * The app's own plugin names Chrome's package (android/…/OpenInChromePlugin.java),
 * because a plain https link from a WebView goes to the phone's default
 * browser, which on many phones is not Chrome and may have no WebGPU either.
 * The call goes through Capacitor's bridge directly (`nativePromise`), since
 * the bundle does not carry Capacitor's web runtime. If the plugin is missing
 * or refuses, the address is opened as a link, which the shell hands to the
 * default browser: better a browser that may draw it than nothing.
 *
 * A check sets `window.__cgOpenExternal` to read the address instead
 * (`npm run controller`), as it cannot see another app open.
 */
export function openInChrome(url: string = SITE_SHOW_URL): void {
  if (typeof window.__cgOpenExternal === 'function') {
    window.__cgOpenExternal(url);
    return;
  }
  const cap = (window as unknown as { Capacitor?: { nativePromise?: (plugin: string, method: string, options: unknown) => Promise<unknown> } }).Capacitor;
  const viaLink = () => { window.location.href = url; };
  if (typeof cap?.nativePromise !== 'function') { viaLink(); return; }
  cap.nativePromise('OpenInChrome', 'open', { url }).catch(viaLink);
}
