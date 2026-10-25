/**
 * The app finds its own new versions (PLAN.md 13-update).
 *
 * Asked 2026-10-25: "whenever we have a new release update that app, and also
 * allow updating of the app from inside the app itself". A release is a GitHub
 * Release on this repo, made by `.github/workflows/desktop.yml` when the owner
 * asks for one, and each carries `latest-mac.yml`, which says its version and
 * the files that make it up. electron-updater reads that file from the newest
 * release (`publish` in electron-builder.config.cjs, written into the app as
 * app-update.yml), compares the version with this app's, and says what it found.
 *
 * What it does next depends on how the app was signed, because macOS installs
 * an update in place (Squirrel.Mac) only for an app signed with a Developer ID
 * whose new copy is signed by the same team. An ad hoc build cannot be updated
 * in place at all: the install is refused, after a download of the whole app.
 * So the build says which it is (`chromaglass.signed` in its package.json), and:
 *
 *   signed     the new version downloads in the background and installs when
 *              the app is next quit; the menu and the profile sheet offer
 *              "Restart to Update" for now
 *   ad hoc     nothing downloads; the menu and the profile sheet offer
 *              "Download ChromaGlass <version>…", which opens the new .dmg in
 *              the browser, and the owner drags it over the old one
 *
 * Neither ever restarts the app, opens a window or asks a question on its own.
 * A performer may be twenty minutes into a set when a release lands, with the
 * plate on the wall: the most the app does by itself is one notification on the
 * laptop, and not even that while a projector window is open. The only modal
 * box is the answer to Check for Updates…, which the performer asked for.
 *
 * Kept apart from main.js, and handed everything Electron it touches, so that
 * `npm run updates` can drive it with stand-ins in plain Node, in a cloud
 * session with no Electron to launch: every event electron-updater sends, in
 * the orders it sends them, and what the app does about each.
 */

/** Where the newest download lives when the feed is GitHub's: the same link the site gives (src/lib/macApp.ts). */
export const RELEASES = 'https://github.com/jstevoh/chromaglass/releases/latest/download/';
/** The .dmg's name in every release: fixed, so the link above never changes (dmg.artifactName). */
export const DMG = 'ChromaGlass-mac-arm64.dmg';
/** How often a running app looks again: a show left up all weekend still hears of a fix. */
export const RECHECK_MS = 6 * 60 * 60 * 1000;
/** How long after opening it first looks: after the show is on the screen, never in its way. */
export const FIRST_CHECK_MS = 20_000;

/**
 * Whether this app looks for updates at all, and why not when it does not.
 * Run from the repo (`npm run app`) there is no app-update.yml and nothing to
 * replace; under the check (`npm run desktop`) the network is off unless the
 * check serves a feed of its own.
 */
export function updatesOff({ packaged, env }) {
  if (env.CHROMAGLASS_NO_UPDATES) return 'switched off (CHROMAGLASS_NO_UPDATES)';
  if (!packaged) return 'run from the repo, not a packed app';
  if (env.CHROMAGLASS_OFFLINE && !env.CHROMAGLASS_UPDATE_FEED) return 'the network is off';
  return null;
}

/** The .dmg of the version found, as a link to open in the browser. */
export function downloadUrl(info, feed) {
  const base = feed ? (feed.endsWith('/') ? feed : `${feed}/`) : RELEASES;
  const dmg = (info?.files ?? []).map((f) => f?.url).find((u) => typeof u === 'string' && u.endsWith('.dmg'));
  try {
    return new URL(dmg ?? DMG, base).href;
  } catch {
    return new URL(DMG, RELEASES).href;
  }
}

/**
 * Wire electron-updater into the app.
 *
 * `deps`: `autoUpdater` (electron-updater's), `version` (this app's), `signed`,
 * `feed` (a feed URL in place of GitHub's, for the check), `notify(title, body)`,
 * `openExternal(url)`, `quiet()` (true while a projector window is open),
 * `onChange(state)` (rebuild the menu, tell the page), `dialog(opts)` (the
 * answer to a check the performer asked for), `firstCheckMs` (sooner under the
 * check, which serves its own feed), and `setTimer`/`clearTimer`.
 *
 * Returns `{ state, check(manual), act(), stop() }`. `state.status` is one of
 * off, idle, checking, none, available, downloading, ready, error; `history`
 * keeps the order they came in, for the check.
 */
export function startUpdates(deps) {
  const { autoUpdater, version, signed, feed, notify, openExternal, quiet, onChange, dialog, off } = deps;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  const state = { status: off ? 'off' : 'idle', current: version, signed: !!signed, version: null, url: null, percent: 0, error: off ?? null, history: [off ? 'off' : 'idle'] };
  const told = new Set();
  let manual = false;
  let timer = null;

  const set = (patch) => {
    Object.assign(state, patch);
    if (patch.status && state.history.at(-1) !== patch.status) {
      state.history.push(patch.status);
      if (state.history.length > 30) state.history.shift();
    }
    onChange?.({ ...state, history: undefined });
  };

  // One notification per version and kind, never over a projector: the wall
  // is the room's, and a show that is playing needs nothing from the laptop.
  const tell = (key, title, body) => {
    if (told.has(key) || quiet?.()) return;
    told.add(key);
    notify?.(title, body);
  };

  const answer = (message, detail) => {
    if (!manual) return;
    manual = false;
    dialog?.({ message, detail });
  };

  if (off) return { state, check: async () => { dialog?.({ message: 'Updates are off', detail: `This copy of ChromaGlass does not look for updates: ${off}.` }); }, act: () => {}, stop: () => {} };

  autoUpdater.autoDownload = !!signed;
  autoUpdater.autoInstallOnAppQuit = !!signed;
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed });

  autoUpdater.on('checking-for-update', () => set({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => {
    set({ status: 'none', version: null, url: null });
    answer('ChromaGlass is up to date', `You have ${version}, the newest version.`);
  });
  autoUpdater.on('update-available', (info) => {
    const next = String(info?.version ?? '');
    const url = downloadUrl(info, feed);
    if (signed) {
      set({ status: 'downloading', version: next, url, percent: 0 });
      answer(`ChromaGlass ${next} is downloading`, 'It installs the next time you quit ChromaGlass, or now with Restart to Update once it has arrived.');
      return;
    }
    set({ status: 'available', version: next, url });
    tell(`available:${next}`, `ChromaGlass ${next} is out`, 'Download it from the ChromaGlass menu, then drag it into Applications over this one.');
    answer(`ChromaGlass ${next} is out`, `You have ${version}. Download ChromaGlass ${next}… in the ChromaGlass menu opens the new download in your browser.`);
  });
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') set({ percent: Math.round(Number(p?.percent) || 0) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    const next = String(info?.version ?? state.version ?? '');
    set({ status: 'ready', version: next, percent: 100 });
    tell(`ready:${next}`, `ChromaGlass ${next} is ready`, 'It installs when you quit ChromaGlass. Restart to Update in the ChromaGlass menu does it now.');
  });
  autoUpdater.on('error', (err) => {
    // Offline at a venue is the usual case, and not news. Kept for the menu's
    // own check, which says it, and for the check, which reads it.
    set({ status: 'error', error: String(err?.message ?? err).split('\n')[0].slice(0, 200) });
    answer('Could not check for updates', 'ChromaGlass could not reach its releases. Check the connection and try again from the ChromaGlass menu.');
  });

  const check = async (asked = false) => {
    manual = asked;
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      // checkForUpdates rejects as well as sending 'error'; the event has said it.
      if (state.status !== 'error') set({ status: 'error', error: String(err?.message ?? err).slice(0, 200) });
    }
  };

  const loop = () => { timer = setTimer(() => { void check(false).finally(loop); }, RECHECK_MS); };
  timer = setTimer(() => { void check(false).finally(loop); }, deps.firstCheckMs ?? FIRST_CHECK_MS);

  /** The one thing the menu item or the profile sheet's button does, which is only ever a click. */
  const act = () => {
    if (state.status === 'available' && state.url) void openExternal?.(state.url);
    else if (state.status === 'ready') autoUpdater.quitAndInstall(false, true);
    else void check(true);
  };

  return { state, check, act, stop: () => { if (timer) clearTimer(timer); timer = null; } };
}

/** The menu item for what the updater found: the label says what a click does. */
export function updateMenuItem(state) {
  if (state.status === 'off') return null;
  if (state.status === 'available' && state.version) return { label: `Download ChromaGlass ${state.version}…` };
  if (state.status === 'downloading') return { label: `Downloading ChromaGlass ${state.version} (${state.percent}%)`, enabled: false };
  if (state.status === 'ready') return { label: `Restart to Update to ${state.version}` };
  if (state.status === 'checking') return { label: 'Checking for Updates…', enabled: false };
  return { label: 'Check for Updates…' };
}
