/**
 * The Mac app's download, and what the app's updater found (PLAN.md 13-update).
 *
 * The download is the newest GitHub Release of this repo, which desktop.yml
 * publishes when the owner asks for a release. The .dmg has the same name in
 * every release (dmg.artifactName in desktop/electron-builder.config.cjs), so
 * this one link always gives the newest, and a release never needs the site
 * deployed again to be found. The owner chose a public file (2026-10-25): the
 * app itself opens only on a Home or Pro key (23.17d, MAC_APP_TIERS below), so
 * the profile sheet offers the button to those tiers and says "comes with Home
 * and Pro" to everyone else.
 */

import { SHOW_PATH } from './showPath';
import { getActiveLicenseInfo } from './tierGates';

export const MAC_DOWNLOAD_URL = 'https://github.com/jstevoh/chromaglass/releases/latest/download/ChromaGlass-mac-arm64.dmg';
export const MAC_RELEASES_URL = 'https://github.com/jstevoh/chromaglass/releases';

/**
 * Whether the download is signed with a Developer ID and notarised (13.1-sign).
 *
 * The first release (1.3.622, 2026-10-25) is signed ad hoc, and the owner's Mac
 * refused it: "Apple could not verify… is free of malware that may harm your
 * Mac". On macOS 15 the old way round, right-click → Open, no longer offers to
 * open it; the one way left in Settings is Privacy & Security → Open Anyway,
 * after one refused open. So until the app is notarised the site says how, next
 * to the button, and once it is (13-update-signed) this turns true and the line
 * goes: a notarised app opens on a double-click and needs no instructions.
 *
 * True since 1.3.692 (2026-10-27, 7:12 PM PT), the first release signed with the
 * owner's Developer ID and accepted by Apple's notary service. Earlier ad hoc
 * builds (1.3.622, 1.3.642) still carry the warning, but they update to a signed
 * one, so the way round is no longer shown. MAC_FIRST_OPEN stays for a build the
 * notary ever refuses again, when this goes false.
 */
export const MAC_APP_NOTARISED = true;

/** The first open of an app macOS cannot check, in the words of its own Settings. */
export const MAC_FIRST_OPEN = 'The first time, macOS says it cannot check the app. Click Done, then open System Settings → Privacy & Security and click Open Anyway beside ChromaGlass.';

/** What desktop/updates.js says, as the preload hands it over. */
export interface DesktopUpdateState {
  status: 'off' | 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error';
  current: string;
  signed: boolean;
  version: string | null;
  url: string | null;
  percent: number;
  error: string | null;
}

export interface DesktopUpdates {
  state: () => Promise<DesktopUpdateState>;
  act: () => Promise<DesktopUpdateState>;
  onChange: (fn: (s: DesktopUpdateState) => void) => () => void;
}

/** The updater, when this page is inside the Mac app (desktop/preload.cjs); null on the site. */
export function desktopUpdates(): DesktopUpdates | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { __CHROMAGLASS_NATIVE__?: { shell?: unknown; updates?: DesktopUpdates } };
  const u = w.__CHROMAGLASS_NATIVE__?.shell === 'desktop' ? w.__CHROMAGLASS_NATIVE__.updates : undefined;
  return u && typeof u.state === 'function' ? u : null;
}

/**
 * Is this a Mac computer, the only thing the download runs on? An iPad asking
 * for the desktop site says "Macintosh" too, and is told apart by its touch
 * points. Intel or Apple silicon cannot be read from a page reliably; the
 * button says Apple silicon (13-intel builds the other).
 */
export function onMacComputer(nav: Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false;
  return /Macintosh|Mac OS X/.test(nav.userAgent) && !/iPhone|iPad|iPod/.test(nav.userAgent) && !(nav.maxTouchPoints > 1);
}

/** What the profile sheet's Mac app row says and offers, for a tier, a device and the updater's state. */
export type MacAppRow =
  | { kind: 'download'; href: string }
  | { kind: 'on-a-mac' }
  | { kind: 'with-a-licence' }
  | { kind: 'in-app'; current: string; line: string; button: string | null };

export function macAppRow(tier: string, mac: boolean, update: DesktopUpdateState | null, inApp: boolean): MacAppRow {
  if (inApp) {
    const s = update;
    const current = s?.current ?? '';
    if (!s) return { kind: 'in-app', current, line: '…', button: null };
    if (s.status === 'off') return { kind: 'in-app', current, line: 'Updates are off in this copy.', button: null };
    if (s.status === 'available') return { kind: 'in-app', current, line: `ChromaGlass ${s.version} is out.`, button: `Download ${s.version}` };
    if (s.status === 'downloading') return { kind: 'in-app', current, line: `Downloading ${s.version} (${s.percent}%). It installs when you quit.`, button: null };
    if (s.status === 'ready') return { kind: 'in-app', current, line: `${s.version} is ready. It installs when you quit.`, button: 'Restart to Update' };
    if (s.status === 'checking') return { kind: 'in-app', current, line: 'Checking for updates…', button: null };
    if (s.status === 'none') return { kind: 'in-app', current, line: 'This is the newest version.', button: 'Check for Updates' };
    if (s.status === 'error') return { kind: 'in-app', current, line: 'Could not reach the releases just now.', button: 'Check for Updates' };
    return { kind: 'in-app', current, line: 'It looks for new versions by itself.', button: 'Check for Updates' };
  }
  if (!(MAC_APP_TIERS as ReadonlyArray<string>).includes(tier)) return { kind: 'with-a-licence' };
  return mac ? { kind: 'download', href: MAC_DOWNLOAD_URL } : { kind: 'on-a-mac' };
}

/**
 * The address a sign-in started in the Mac app finishes at, in the real
 * browser (PLAN.md 23.17d): the show on the app's own server, so the account's
 * key is handed to that server (`/license-activate`, accountLicense.ts) and the
 * app's window, which watches the server's licence, opens by itself. The word
 * tells that browser tab to say so and stop there, rather than start a second
 * show beside the app's.
 */
export const MAC_SIGN_IN_PARAM = 'macSignIn';

/**
 * The one-time code (`h`) and the provider (`p`) the app's window puts in that
 * address (PLAN.md 23.17f). The code files the browser's sign-in with the app's
 * server for this window alone to take (server/signin-handoff.js); the provider
 * lets the browser tab offer the one button the person already pressed. Before
 * these, the tab saw the Mac already licensed, said "Your licence is on this
 * Mac now" and never asked anyone to sign in, while the window waited on
 * "Finish in your browser…" for good (the owner's screenshot, 2026-11-10).
 */
export const MAC_SIGN_IN_CODE_PARAM = 'h';
export const MAC_SIGN_IN_PROVIDER_PARAM = 'p';
export type HandoffProvider = 'google.com' | 'apple.com';
const HANDOFF_CODE = /^[A-Za-z0-9_-]{22,64}$/;

/** A fresh one-time code: 128 random bits, url-safe. */
export function newHandoffCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** In the browser tab the app sent a sign-in to: its code and provider, or null anywhere else. */
export function handoffFromUrl(): { code: string; provider: HandoffProvider | null } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get(MAC_SIGN_IN_PARAM) !== '1') return null;
    const code = q.get(MAC_SIGN_IN_CODE_PARAM) ?? '';
    if (!HANDOFF_CODE.test(code)) return null;
    const p = q.get(MAC_SIGN_IN_PROVIDER_PARAM);
    return { code, provider: p === 'google.com' || p === 'apple.com' ? p : null };
  } catch {
    return null;
  }
}

export function openSignInInBrowser(code?: string, provider?: HandoffProvider): void {
  const native = (window as unknown as { __CHROMAGLASS_NATIVE__?: { openInBrowser?: (url: string) => void } }).__CHROMAGLASS_NATIVE__;
  const extra = code ? `&${MAC_SIGN_IN_CODE_PARAM}=${code}${provider ? `&${MAC_SIGN_IN_PROVIDER_PARAM}=${provider}` : ''}` : '';
  const url = `${window.location.origin}${SHOW_PATH}?${MAC_SIGN_IN_PARAM}=1${extra}`;
  if (native?.openInBrowser) native.openInBrowser(url);
  else window.open(url, '_blank', 'noopener');
}

/**
 * The app's window to the front (desktop/main.js `chromaglass:bring-to-front`),
 * when a sign-in it sent to the browser comes back. The owner, 2026-11-11:
 * after the web sign-in "it should just close the login window and go back to
 * the app". The browser is in front at that moment, the window behind it; it
 * signed in, but nobody saw it. False outside the app, or on a shell too old
 * to have the call.
 */
export async function bringAppToFront(): Promise<boolean> {
  const native = (window as unknown as { __CHROMAGLASS_NATIVE__?: { bringToFront?: () => Promise<boolean> } }).__CHROMAGLASS_NATIVE__;
  try {
    return (await native?.bringToFront?.()) === true;
  } catch {
    return false;
  }
}

/**
 * The browser tab's end of the hand-off, after it filed its sign-in: did the
 * app's window take it? Asked of the app's server (`?status=1`, which answers
 * yes or no and never shows the credential) until it says yes or `ms` pass. Only
 * a yes lets the tab say "done" and close itself; a no means the window was not
 * watching (closed, or restarted since the button was pressed), and the tab
 * says so rather than "go back to the app" over an app still signed out.
 */
export async function waitForAppToTake(code: string, ms = 30_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`/signin-handoff?h=${encodeURIComponent(code)}&status=1`, { cache: 'no-store' });
      if (res.ok && ((await res.json()) as { taken?: boolean }).taken === true) return true;
    } catch {
      // The app's own server; a miss is a moment.
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

/**
 * The licences the Mac app opens on (PLAN.md 23.17d; the owner's choice,
 * 2026-10-26, "Home can open the app"): Home and Pro, each with
 * its own features, as on the website. Home's phone remote, song ID and
 * full-length recording are sold as "in the ChromaGlass app", and the remote
 * needs the app's show server, so a Home buyer shut out of the app would have
 * paid for features they could not use. One list, read by the door and the
 * start (main.tsx, AppLicenceGate.tsx), and the profile sheet's download row.
 */
export const MAC_APP_TIERS: ReadonlyArray<'home' | 'pro'> = ['home', 'pro'];

/** Does the key on this machine open the Mac app's show? */
export function macAppLicensed(): boolean {
  const lic = getActiveLicenseInfo();
  return lic.valid && (MAC_APP_TIERS as readonly string[]).includes(lic.tier);
}
