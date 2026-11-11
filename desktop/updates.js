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
 * Install Updates Automatically (PLAN.md 13-update-auto; the owner, 2026-11-11:
 * "can we have turn on/off auto updates? so people aren't surprised by an
 * update?"). On, as before, and the default, so every copy keeps the behaviour
 * it had: a signed app downloads a new version by itself and installs it on the
 * next quit. Off, it still looks, and says once that a version is available,
 * but downloads nothing until the performer picks Install ChromaGlass <version>…
 * in the menu or the profile sheet; that download then installs on the next
 * quit, or at once with Restart to Update, as one the app fetched itself. The
 * surprise the switch takes away is the one on the next launch: quitting after
 * a set and opening a different version than the one rehearsed with. A version
 * macOS has already taken (Squirrel.Mac's own update-downloaded) installs on
 * quit whatever the switch says, because Squirrel does that itself; the state
 * says so ('ready'), rather than claiming the switch took it back.
 *
 * Never in the middle of a show, in either mode. While the show is on the
 * projector or live (`busy()`), nothing downloads by itself (a live stream's
 * upload is the one thing a 150 MB download in the background could hurt), and
 * the look is tried again ten minutes later rather than six hours; Restart to
 * Update, clicked while it is, asks first, and the owner's assistant asking for
 * the download or the restart is refused (`install()`). `busy()` is read as a
 * check starts: a download already under way when the projector opens or the
 * stream starts carries on (cancelling it needs the check's own cancellation
 * token, and a show that starts minutes into one is rare); it never installs
 * until a quit or a click either way.
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
/** How soon it looks again when a download was held back for a show: soon after the show ends, not six hours later. */
export const BUSY_RETRY_MS = 10 * 60 * 1000;

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

/** Where a link from a release may point: this repo's releases, over https. */
const RELEASES_HOME = 'https://github.com/jstevoh/chromaglass/releases/';

/**
 * The .dmg of the version found, as a link to open in the browser.
 *
 * The name comes from the release's latest-mac.yml, and `new URL(name, base)`
 * keeps a name that is already a whole address, of any scheme and any host,
 * which would then go to shell.openExternal. The file is our own release's, so
 * this is defence in depth: a link that is not https under this repo's
 * releases (or under the feed the check serves) gives the fixed link instead.
 */
export function downloadUrl(info, feed) {
  const base = feed ? (feed.endsWith('/') ? feed : `${feed}/`) : RELEASES;
  const fixed = new URL(DMG, base).href;
  const dmg = (info?.files ?? []).map((f) => f?.url).find((u) => typeof u === 'string' && u.endsWith('.dmg'));
  let url;
  try {
    url = new URL(dmg ?? DMG, base).href;
  } catch {
    return fixed;
  }
  const home = feed ? base : RELEASES_HOME;
  return url.startsWith(home) && (feed || url.startsWith('https:')) ? url : fixed;
}

/**
 * Wire electron-updater into the app.
 *
 * `deps`: `autoUpdater` (electron-updater's), `version` (this app's), `signed`,
 * `feed` (a feed URL in place of GitHub's, for the check), `notify(title, body)`,
 * `openExternal(url)`, `quiet()` (true while a projector window is open),
 * `onChange(state)` (rebuild the menu, tell the page), `dialog(opts)` (the
 * answer to a check the performer asked for), `firstCheckMs` (sooner under the
 * check, which serves its own feed), `auto` (Install Updates Automatically, as
 * saved; anything but false is on), `save(auto)` (keep the switch), `busy()`
 * (why a show is on, or null), `confirm(opts)` (a yes or no the performer
 * asked for by clicking, resolving true for yes), and `setTimer`/`clearTimer`.
 *
 * Returns `{ state, check(manual), act(), setAuto(on), install(), stop() }`.
 * `state.status` is one of off, idle, checking, none, available, downloading,
 * ready, error; `state.auto` is the switch; `state.inPlace` says an
 * 'available' version installs in place (a click downloads it) rather than
 * from the .dmg in the browser; `history` keeps the order they came in, for
 * the check.
 */
export function startUpdates(deps) {
  const { autoUpdater, version, signed, feed, notify, openExternal, quiet, onChange, dialog, off, save, busy, confirm } = deps;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;
  let auto = deps.auto !== false;
  const state = { status: off ? 'off' : 'idle', current: version, signed: !!signed, auto, inPlace: false, version: null, url: null, percent: 0, error: off ?? null, history: [off ? 'off' : 'idle'] };
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

  if (off) {
    const setAuto = (on) => { auto = !!on; save?.(auto); set({ auto }); };
    return { state, check: async () => { dialog?.({ message: 'Updates are off', detail: `This copy of ChromaGlass does not look for updates: ${off}.` }); }, act: () => {}, setAuto, install: () => `this copy of ChromaGlass does not look for updates: ${off}`, stop: () => {} };
  }

  /*
    What electron-updater does by itself, from the switch, the show and the
    performer's own click. autoDownload is read at each check, so it is set
    just before one: on with the switch, off while a show is on. And
    autoInstallOnAppQuit is what hands a downloaded zip to Squirrel.Mac at all
    (MacUpdater.doDownloadUpdate gives it over only when true), so it is on
    with the switch and for a version the performer asked to install: with it
    off a zip would sit downloaded and Restart to Update never come.
  */
  let asked = false;
  const apply = () => {
    autoUpdater.autoDownload = !!signed && auto && !busy?.();
    autoUpdater.autoInstallOnAppQuit = !!signed && (auto || asked);
  };
  apply();
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;
  if (feed) autoUpdater.setFeedURL({ provider: 'generic', url: feed });

  /*
    What was found stays found. A re-check six hours later, at a venue with no
    network, ends in 'error', and one that finds the same release again starts
    it over: either would take back the Download or Restart to Update the menu
    was offering, and a performer who saw it at soundcheck would find it gone.
    So 'checking', 'none' and 'error' only show when nothing was found, and the
    same version found again keeps the state it has.
  */
  const holding = () => state.status === 'available' || state.status === 'downloading' || state.status === 'ready';

  autoUpdater.on('checking-for-update', () => { if (!holding()) set({ status: 'checking' }); });
  autoUpdater.on('update-not-available', () => {
    if (!holding()) set({ status: 'none', version: null, url: null });
    answer(holding() ? `ChromaGlass ${state.version} is waiting` : 'ChromaGlass is up to date', holding() ? 'It is in the ChromaGlass menu.' : `You have ${version}, the newest version.`);
  });
  autoUpdater.on('update-available', (info) => {
    const next = String(info?.version ?? '');
    const url = downloadUrl(info, feed);
    const same = next === state.version && holding();
    // A new version is a new question: an Install clicked for an older one does not carry over.
    if (!same) asked = false;
    // Already on its way or in: found again, it changes nothing, whatever the
    // switch or the show. Without this a re-check with the switch since off
    // would say "available, nothing installs until you do" of a version
    // Squirrel already has and installs on quit, and one during a show would
    // be looked for again every ten minutes.
    if (signed && same && (state.status === 'downloading' || state.status === 'ready')) {
      answer(`ChromaGlass ${next} is ${state.status === 'ready' ? 'ready' : 'downloading'}`, 'It installs the next time you quit ChromaGlass, or now with Restart to Update once it has arrived.');
      return;
    }
    // Downloading by itself now: the switch is on and no show is.
    if (signed && autoUpdater.autoDownload) {
      set({ status: 'downloading', version: next, url, percent: 0, inPlace: true, error: null });
      answer(`ChromaGlass ${next} is downloading`, 'It installs the next time you quit ChromaGlass, or now with Restart to Update once it has arrived.');
      return;
    }
    // Found, and waiting for the performer: the switch is off, or a show is on.
    if (signed) {
      if (!same) set({ status: 'available', version: next, url, inPlace: true });
      if (!auto) tell(`available:${next}`, `ChromaGlass ${next} is available`, 'Install it from the ChromaGlass menu when you are ready. Nothing installs until you do.');
      // Held for a show with the switch on: looked at again soon after it ends.
      else soon();
      answer(`ChromaGlass ${next} is available`, auto
        ? `You have ${version}. It downloads by itself once the show is off the projector and not live, or now with Install ChromaGlass ${next}… in the ChromaGlass menu.`
        : `You have ${version}. Install ChromaGlass ${next}… in the ChromaGlass menu downloads it; it then installs when you quit ChromaGlass, or at once with Restart to Update.`);
      return;
    }
    if (!same) set({ status: 'available', version: next, url, inPlace: false });
    tell(`available:${next}`, `ChromaGlass ${next} is out`, 'Download it from the ChromaGlass menu, then drag it into Applications over this one.');
    answer(`ChromaGlass ${next} is out`, `You have ${version}. Download ChromaGlass ${next}… in the ChromaGlass menu opens the new download in your browser.`);
  });
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') set({ percent: Math.round(Number(p?.percent) || 0) });
  });

  /*
    Ready means macOS has it, not only electron-updater. MacUpdater says
    'update-downloaded' when the zip is on disk, before Squirrel.Mac has taken
    it from MacUpdater's local proxy; a quitAndInstall() then only waits for
    Squirrel, and would quit the app whenever Squirrel finished, minutes after
    the click, mid-set perhaps. So with Squirrel there (`nativeUpdater`,
    Electron's own autoUpdater, on a Mac) Restart to Update is offered only
    once Squirrel has said it too, and a click then quits at once.
  */
  const nativeUpdater = deps.nativeUpdater ?? null;
  let fetched = false;
  let squirrel = !nativeUpdater;
  const ready = () => {
    if (!fetched || !squirrel) return;
    set({ status: 'ready', percent: 100 });
    tell(`ready:${state.version}`, `ChromaGlass ${state.version} is ready`, 'It installs when you quit ChromaGlass. Restart to Update in the ChromaGlass menu does it now.');
  };
  autoUpdater.on('update-downloaded', (info) => {
    if (info?.version) state.version = String(info.version);
    /*
      The switch went off while it downloaded, and nobody asked for this one:
      the zip is on disk, but Squirrel was never handed it (above), so there
      is nothing to restart into. It is offered as Install, as a version found
      with the switch off is; the click hands the same zip over (electron-
      updater keeps it, and a second downloadUpdate finds it there).
    */
    if (nativeUpdater && !autoUpdater.autoInstallOnAppQuit) {
      set({ status: 'available', inPlace: true, percent: 0 });
      return;
    }
    fetched = true;
    ready();
  });
  nativeUpdater?.on('update-downloaded', () => { squirrel = true; ready(); });

  autoUpdater.on('error', (err) => {
    const error = String(err?.message ?? err).split('\n')[0].slice(0, 200);
    // A download that failed falls back to the download in the browser, which
    // always works; anything else found stays as it was (above).
    if (state.status === 'downloading' && state.url) { asked = false; set({ status: 'available', inPlace: false, error }); }
    else if (holding()) set({ error });
    // Offline at a venue is the usual case, and not news. Kept for the menu's
    // own check, which says it, and for the check, which reads it.
    else set({ status: 'error', error });
    answer('Could not check for updates', 'ChromaGlass could not reach its releases. Check the connection and try again from the ChromaGlass menu.');
  });

  const check = async (byHand = false) => {
    manual = byHand;
    apply();
    try {
      await autoUpdater.checkForUpdates();
    } catch (err) {
      // checkForUpdates rejects as well as sending 'error'; when the event has
      // not said it (a feed that cannot be parsed), say it here.
      if (state.status !== 'error' && !holding()) set({ status: 'error', error: String(err?.message ?? err).slice(0, 200) });
      answer('Could not check for updates', 'ChromaGlass could not reach its releases. Check the connection and try again from the ChromaGlass menu.');
    }
  };

  // The next look: six hours on, or sooner when a download waits on a show.
  let after = RECHECK_MS;
  const arm = (ms) => { if (timer) clearTimer(timer); timer = setTimer(() => { timer = null; after = RECHECK_MS; void check(false).finally(() => { if (!timer) arm(after); }); }, ms); };
  function soon() {
    after = BUSY_RETRY_MS;
    if (timer) arm(BUSY_RETRY_MS);
  }
  arm(deps.firstCheckMs ?? FIRST_CHECK_MS);

  /** Fetch the version found, to install in place: the performer's Install, or the switch turned on with one waiting. */
  const download = () => {
    apply();
    set({ status: 'downloading', percent: 0, error: null });
    // A failure also comes as 'error' (above), which offers the .dmg instead.
    try { autoUpdater.downloadUpdate()?.catch?.(() => {}); } catch (err) { set({ status: 'available', inPlace: false, error: String(err?.message ?? err).slice(0, 200) }); }
  };

  let installing = false;
  const quit = () => {
    installing = true;
    autoUpdater.quitAndInstall(false, true);
  };

  /**
   * The one thing the menu item or the profile sheet's button does, which is
   * only ever a click: Install downloads, Restart to Update restarts, asking
   * first while a show is on, since a click on the menu bar mid-set can be a
   * slip and the wall goes dark for the restart.
   */
  const act = async () => {
    if (state.status === 'available' && state.inPlace) { asked = true; download(); return; }
    if (state.status === 'available' && state.url) { void openExternal?.(state.url); return; }
    if (state.status === 'ready') {
      if (installing) return;
      const why = busy?.();
      if (why) {
        const yes = await confirm?.({
          message: `Restart into ChromaGlass ${state.version} now?`,
          detail: `${why[0].toUpperCase()}${why.slice(1)}. ChromaGlass closes and opens again, and the wall goes dark while it does. Otherwise it installs when you quit after the show.`,
          ok: 'Restart Now',
          cancel: 'Later',
        });
        if (!yes || installing || state.status !== 'ready') return;
      }
      quit();
      return;
    }
    void check(true);
  };

  /** Install Updates Automatically, from the menu, the profile sheet or the owner's assistant. */
  const setAuto = (on) => {
    auto = !!on;
    save?.(auto);
    apply();
    set({ auto });
    // On again with a version found and waiting: fetched now, as the switch would have.
    // During a show it waits, and is looked at again soon after.
    if (auto && signed && state.status === 'available' && state.inPlace) {
      if (busy?.()) soon();
      else download();
    }
  };

  /**
   * The owner's assistant's Install (PLAN 44k-18): what a click does, except
   * that it never restarts in the middle of a show, and never asks the room a
   * question: it says why not, and the assistant tells the owner. Returns
   * why not, or null when it is done (the download begun, or the restart).
   */
  const install = () => {
    if (state.status === 'available' && state.inPlace) {
      // The download too waits for the show: a live stream's upload is not shared with it.
      const busyNow = busy?.();
      if (busyNow) return `${busyNow}, and ChromaGlass downloads nothing and never restarts in the middle of a show: ask again after it`;
      asked = true;
      download();
      return null;
    }
    if (state.status === 'available') return `this copy cannot replace itself (it is not signed): its .dmg is ${state.url}`;
    if (state.status === 'downloading') return `ChromaGlass ${state.version} is still downloading (${state.percent}%); it can be installed once it is ready`;
    if (state.status !== 'ready') return 'no new version is waiting: check first';
    if (installing) return null;
    const why = busy?.();
    if (why) return `${why}, and ChromaGlass never restarts in the middle of a show: ${state.version} installs when ChromaGlass quits after it, or ask again then`;
    quit();
    return null;
  };

  return { state, check, act, setAuto, install, stop: () => { if (timer) clearTimer(timer); timer = null; } };
}

/**
 * What the show server hands the owner's assistant (server/assistantUpdates.js
 * judges the mode): the updater's state as the page sees it, and its doors.
 */
export function updatesHook(u) {
  return {
    state: () => ({ ...u.state, history: undefined }),
    setAuto: (on) => u.setAuto(on),
    check: () => { void u.check(false); },
    install: () => u.install(),
  };
}

/** The menu item for what the updater found: the label says what a click does. */
export function updateMenuItem(state) {
  if (state.status === 'off') return null;
  if (state.status === 'available' && state.version) return { label: `${state.inPlace ? 'Install' : 'Download'} ChromaGlass ${state.version}…` };
  if (state.status === 'downloading') return { label: `Downloading ChromaGlass ${state.version} (${state.percent}%)`, enabled: false };
  if (state.status === 'ready') return { label: `Restart to Update to ${state.version}` };
  if (state.status === 'checking') return { label: 'Checking for Updates…', enabled: false };
  return { label: 'Check for Updates…' };
}

/** The menu's switch, under the update item: a tick. An ad hoc copy never installs in place, so it has none. */
export function autoMenuItem(state) {
  if (state.status === 'off' || !state.signed) return null;
  return { id: 'auto-update', label: 'Install Updates Automatically', type: 'checkbox', checked: state.auto !== false };
}
