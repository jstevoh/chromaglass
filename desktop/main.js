/**
 * The Mac app: the show, its server and the projector in one download
 * (PLAN.md §13 step 1).
 *
 * What it replaces is the evening's first five minutes: open a terminal, pull,
 * build, `npm run show`, open a browser at the address it printed, find the
 * projector chip and click it. Here the show server (`server/remote-server.js`,
 * unchanged, the same file the terminal runs) starts inside the app, the
 * window opens on the site it serves, and when a projector is plugged in the
 * show goes to it by itself.
 *
 * Why the app loads the site from its own server and not from files on disk:
 * everything the web app does about the relay (the phone remote, network
 * displays, OSC and Art-Net) starts by asking its own origin for
 * `/remote-info.json`. Served from `http://localhost:<port>/`, the page is
 * exactly the page `npm run show` gives, so nothing in `src/` needs to know it
 * is in an app, and the checks that drive the site measure this too. And the
 * built site is inside the app, so the show opens with no network at all.
 *
 * Electron, not Tauri, and no native rewrite: `beyond-web/beyond-web.md` and
 * PLAN.md §13 say why (the server is Node; Tauri on a Mac is Safari's web view,
 * with no Web MIDI and a WebGPU that CI never tests).
 */

import inspector from 'node:inspector';
import { app, autoUpdater as nativeAutoUpdater, BrowserWindow, desktopCapturer, dialog, ipcMain, Menu, Notification, powerSaveBlocker, safeStorage, screen, session, shell, systemPreferences } from 'electron';
import electronUpdater from 'electron-updater';
import { randomInt } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startUpdates, updateMenuItem, updatesOff } from './updates.js';
import { wireLive } from './liveSession.js';
import { makeKeyStore } from './keys.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/*
  Where the server and the built site are. Packaged, electron-builder puts
  both beside this file (desktop/electron-builder.config.cjs), so the server's
  own `../dist` finds the site. Run from the repo (`npm run app`), they are
  the repo's own `server/` and `dist/`, one level up.
*/
const ROOT = app.isPackaged ? app.getAppPath() : resolve(HERE, '..');
const SERVER = join(ROOT, 'server', 'remote-server.js');

/*
  A packed app does not open a debugger for anyone who asks. Chromium's
  --remote-debugging-port (and -pipe) put the whole page, the licence gate
  included, in reach of any script that can attach, and no Electron fuse covers
  them (the security audit of 2026-10-28, finding 9; PLAN 23.17k closes the fuses
  that can be closed). So a packed app launched with either quits
  at once, saying why. This cannot stop the owner of the Mac, who can do
  anything to software that runs as them; it stops the easy way past the gate
  and another program borrowing the app's microphone and camera by attaching.
  (Asked of Chromium's own command line, `app.commandLine`, so any spelling of
  the switch it accepts is caught.) One exception, which is not a way in: when Node's own inspector is already
  open (`--inspect`), the build is one whose fuses are open, and anyone with
  that can attach anyway. Playwright (the checks) launches Electron with
  --inspect=0 and --remote-debugging-port=0 together, and the check drives a
  copy of the packed app with that one fuse back on (scripts/desktop.mjs); the
  shipped app has it off (PLAN 23.17k), so the inspector never opens there and
  the exception never applies to it.
*/
// Chromium's own parser decides what is a switch: it takes a single dash too (-remote-debugging-port=9333 opened DevTools
// in a review of this guard, which had matched `--` only), so the question goes to it, not to a pattern on process.argv.
if (app.isPackaged && !inspector.url() && (app.commandLine.hasSwitch('remote-debugging-port') || app.commandLine.hasSwitch('remote-debugging-pipe'))) {
  console.error('ChromaGlass does not run with a remote debugger attached. Quit and open it normally.');
  app.exit(1);
}

/*
  A profile of its own, for the check (`npm run desktop`): each run starts as
  a first launch, with no show key, no projector mode and no presets left
  from the last. Must be set before the app is ready.
*/
if (process.env.CHROMAGLASS_USER_DATA) app.setPath('userData', resolve(process.env.CHROMAGLASS_USER_DATA));

/*
  The show must not slow down because its window is covered or on another
  Space. `backgroundThrottling: false` (below, on every window) keeps timers
  and frames going in a window that is hidden; these keep Chromium from
  deciding a covered window is hidden in the first place, and from lowering
  the renderer's priority. The web app already hands the frames to the
  projector window when the show window is covered (LiquidVisualizer), so
  this is the second guard `beyond-web.md` asked for, not the only one.
*/
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
// The show starts its sound when it opens, not on the first click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// macOS ScreenCaptureKit system-audio loopback (PLAN.md §23.8): lets the app
// hear whatever the Mac plays with no tab picker.
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
}
/*
  A Linux box with no GPU (a cloud session running the check) gets WebGPU in
  software, the same flags `scripts/chromium.mjs` gives the harnesses under
  PW_WEBGPU. A Mac runs WebGPU on Metal by default and is left alone.
*/
if (process.env.CHROMAGLASS_SOFTWARE_WEBGPU && process.platform !== 'darwin') {
  app.commandLine.appendSwitch('enable-unsafe-webgpu');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('enable-features', 'Vulkan');
  app.commandLine.appendSwitch('use-vulkan', 'swiftshader');
  app.commandLine.appendSwitch('use-webgpu-adapter', 'swiftshader');
}

// One show at a time: a second launch brings the first one forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = showWindow;
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(start).catch((err) => fail('ChromaGlass could not start', err));
}

/** The laptop's window: the desks and the plate. */
let showWindow = null;
/** Local UDP loopback tap for another process on this machine feeding PCM into System audio (23.8). */
let loopbackAudioSocket = null;
/** The show server's module, once it is running: the menu moves its OSC socket (`setOsc`). */
let showServer = null;
/** What the show server was started with, for the menu's details. */
const show = {
  port: 0,
  osc: 0,
  audioPort: 0,
  /** 'off', 'local' (this Mac only) or 'network' (anyone on the Wi-Fi); see oscSettings. */
  oscMode: 'off',
  key: '',
  ambient: false,
  requireSignIn: false,
  license: { valid: false, tier: 'free', email: null, id: null, exp: null, error: null, enforced: false },
};

/**
 * The show key, kept between launches.
 *
 * The terminal server picks four new digits every run. That is fine when the
 * phone is set up in the same minute; an app that is quit and reopened
 * between soundcheck and doors would log every phone out. So the app picks
 * one on its first launch and keeps it, and SHOW_KEY still wins when set.
 *
 * Eight digits, not four (PLAN 14m): four are ten thousand guesses, which a
 * script on the venue's Wi-Fi makes in seconds. The server now locks an address
 * out for five minutes after three wrong keys, and the two together put a
 * guessed key years away. A key kept from before is shorter than eight digits
 * and is made again once, so each phone scans the code one more time.
 */
function showKey() {
  if (process.env.SHOW_KEY) return String(process.env.SHOW_KEY);
  try {
    const saved = readShowFile();
    if (typeof saved.key === 'string' && /^\d{8,}$/.test(saved.key)) return saved.key;
  } catch { /* first launch */ }
  const key = String(randomInt(10_000_000, 100_000_000));
  writeShowFile({ key });
  return key;
}

/** userData/show.json: the show key, and who may send this Mac OSC (below). */
function readShowFile() {
  return JSON.parse(readFileSync(join(app.getPath('userData'), 'show.json'), 'utf8'));
}
function writeShowFile(patch) {
  const file = join(app.getPath('userData'), 'show.json');
  let now = {};
  try { now = readShowFile(); } catch { /* first launch */ }
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ ...now, ...patch }, null, 2), { mode: 0o600 });
  } catch { /* kept for this launch only */ }
}

/*
  Who may drive the show over OSC (the security audit of 2026-10-28, finding 4).
  OSC is UDP with no show key, so whoever can send this Mac a packet changes
  settings and switches presets; the terminal server has always listened on the
  whole LAN, which on a venue's Wi-Fi is everyone in the room. The app opens
  with it off and the performer picks, from the Show menu, "This Mac only"
  (Resolume, TouchDesigner or Ableton on the same laptop) or "From the
  network" (a lighting desk or a second computer). The choice is kept between
  launches. OSC_PORT in the environment still decides for the checks, and for
  anyone who launches the app with it set: they asked for it by name.
*/
// CHROMAGLASS_OSC_PORT moves the port the menu opens (the check cannot rely on 9000 being free); OSC_PORT, below, decides outright.
const OSC_DEFAULT_PORT = Number(process.env.CHROMAGLASS_OSC_PORT) || 9000;
const OSC_BINDS = { local: '127.0.0.1', network: '0.0.0.0' };
function oscSettings() {
  if (process.env.OSC_PORT !== undefined) {
    const port = Number(process.env.OSC_PORT);
    if (!(port > 0)) return { mode: 'off', port: OSC_DEFAULT_PORT };
    return { mode: process.env.OSC_BIND === OSC_BINDS.local ? 'local' : 'network', port };
  }
  let saved = null;
  try { saved = readShowFile().osc; } catch { /* first launch */ }
  return { mode: saved === 'local' || saved === 'network' ? saved : 'off', port: OSC_DEFAULT_PORT };
}

/** Can this port be listened on, on every interface, the way the server will? */
const portFree = (port) => new Promise((done) => {
  const probe = createServer();
  probe.once('error', () => done(false));
  probe.listen(port, '0.0.0.0', () => probe.close(() => done(true)));
});

/*
  The port. 3000, which is what `npm run show` uses and so what a phone that
  was set up before already has. The page's storage belongs to its origin, port
  included, so a different port is a different set of saved looks and
  settings: moving off 3000 is kept for when it is taken (a show server still
  running in a terminal, a `npm run dev`), and said in the details. The server
  itself would exit the whole app on a taken port (its `portTaken`), which is
  right in a terminal and wrong here, so the port is found free first.
*/
async function choosePort() {
  const wanted = Number(process.env.PORT ?? 3000);
  for (let p = wanted; p < wanted + 20; p++) if (await portFree(p)) return p;
  throw new Error(`Ports ${wanted} to ${wanted + 19} are all taken.`);
}

/** Wait for the server to answer, rather than guessing how long it takes to start. */
async function serverUp(port) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/remote-info.json`, { cache: 'no-store' });
      if (res.ok) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`The show server did not answer on port ${port}.`);
}

const isOurs = (url) => {
  try {
    const u = new URL(url);
    return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') && Number(u.port) === show.port;
  } catch {
    return false;
  }
};

/*
  The check's network switch. With CHROMAGLASS_OFFLINE=1 every request that
  would leave the machine is refused and written down, so `npm run desktop`
  can say both that the show opened with the network off and what, if
  anything, tried to reach it. Off in the app as shipped: a show with wifi can
  still send a crash report.
*/
function offlineGuard() {
  if (!process.env.CHROMAGLASS_OFFLINE) return;
  // Only here, so a check that reads the list with the guard off finds none, not an empty one.
  const blocked = [];
  globalThis.__chromaglassBlocked = blocked;
  const guard = (ses) => ses.webRequest.onBeforeRequest((details, done) => {
    let local = false;
    try {
      const u = new URL(details.url);
      local = !/^(https?|wss?):$/.test(u.protocol) || u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    } catch { local = true; }
    if (!local) blocked.push({ url: details.url, type: details.resourceType });
    done({ cancel: !local });
  });
  guard(session.defaultSession);
  app.on('session-created', guard);
}

/*
  Permissions: everything the show asks of its own server's pages, nothing
  for anything else. What it asks is the microphone and cameras (sound in,
  the scene camera), MIDI with sysex (controllers), the screens (the
  projector, `useProjector`), fullscreen and the wake lock. In Chrome each is
  a prompt, most on a click; at a gig that is a prompt on the projector in
  front of the room. macOS still asks once itself for the microphone and the
  camera (the Info.plist strings in the builder config), and then remembers.

  And in the Mac app (PLAN.md §23.8), `getDisplayMedia` with audio is System
  audio: macOS's own ScreenCaptureKit system-audio loopback, handed back with
  no tab picker at all.
*/
let systemAudioAsks = 0;
globalThis.__chromaglassSystemAudioAsks = 0;

function grantPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, _permission, done, details) => done(isOurs(details?.requestingUrl ?? wc.getURL())));
  ses.setPermissionCheckHandler((_wc, _permission, origin) => isOurs(origin));
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const origin = request.securityOrigin || request.frame?.url || '';
    if (!isOurs(origin)) {
      callback({});
      return;
    }
    if (request.audioRequested) {
      systemAudioAsks += 1;
      globalThis.__chromaglassSystemAudioAsks = systemAudioAsks;
      // On macOS, ScreenCaptureKit's loopback needs screen capture permission
      // from TCC. Under the offline check on an ungranted CI runner, asking
      // `desktopCapturer.getSources` would block on a system modal nobody can
      // click, so only query `desktopCapturer` when permission is already
      // granted or when running interactively outside the check.
      const canCaptureScreen =
        process.platform === 'darwin' &&
        (systemPreferences.getMediaAccessStatus('screen') === 'granted' || !process.env.CHROMAGLASS_OFFLINE);
      if (canCaptureScreen) {
        try {
          const sources = await Promise.race([
            desktopCapturer.getSources({ types: ['screen'] }),
            new Promise((r) => setTimeout(() => r([]), 1500)),
          ]);
          if (sources[0]) {
            callback({ video: sources[0], audio: 'loopback' });
            return;
          }
        } catch { /* fall through */ }
        try {
          callback({ video: request.frame, audio: 'loopback' });
          return;
        } catch { /* fall through */ }
      }
      callback({ video: request.frame });
      return;
    }
    try {
      const sources = await Promise.race([
        desktopCapturer.getSources({ types: ['window', 'screen'] }),
        new Promise((r) => setTimeout(() => r([]), 1500)),
      ]);
      callback(sources[0] ? { video: sources[0] } : { video: request.frame });
    } catch {
      callback({ video: request.frame });
    }
  });
}

/**
 * Local loopback audio tap (`127.0.0.1` only), opened only when the desktop
 * check asks for it (`CHROMAGLASS_AUDIO_TAP=1` in `scripts/desktop.mjs`).
 * Under `CHROMAGLASS_OFFLINE` on an ungranted CI runner ScreenCaptureKit
 * cannot be queried without blocking on a macOS TCC modal, so the check uses
 * this tap to verify that the System audio source's pipeline reaches the ear;
 * the shipped app never listens on this socket.
 */
function startLoopbackAudioTap() {
  if (!process.env.CHROMAGLASS_AUDIO_TAP) return Promise.resolve(0);
  return new Promise((done) => {
    const sock = createSocket('udp4');
    sock.once('error', () => {
      try { sock.close(); } catch { /* ignore */ }
      done(0);
    });
    sock.on('message', (msg, rinfo) => {
      if (rinfo.address !== '127.0.0.1') return;
      const win = showWindow;
      if (!win || win.isDestroyed() || msg.byteLength < 4) return;
      let offset = 0;
      let sampleRate = 48000;
      if (msg.byteLength >= 16 && msg.subarray(0, 6).toString('ascii') === 'CGPCM1') {
        const sr = msg.readUInt32LE(8);
        if (sr >= 8000 && sr <= 192000) sampleRate = sr;
        offset = 12;
      }
      const count = Math.min(4096, Math.floor((msg.byteLength - offset) / 4));
      if (count <= 0) return;
      const samples = new Array(count);
      for (let i = 0; i < count; i++) {
        const v = msg.readFloatLE(offset + i * 4);
        samples[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
      }
      win.webContents.send('chromaglass:system-audio-pcm', samples, sampleRate);
    });
    sock.bind(0, '127.0.0.1', () => {
      sock.unref();
      const { port } = sock.address();
      loopbackAudioSocket = sock;
      show.audioPort = port;
      globalThis.__chromaglassAudioPort = port;
      done(port);
    });
  });
}

/**
 * Ambient TV mode (PLAN.md §23.8 and §14j): syncs the Show menu item and tells
 * the renderer to cap draws at 60 Hz (`DrawGate`, `AMBIENT_MIN_DRAW_MS`), cap
 * the solver step rate at 30 Hz and hold at or below the machine's opening
 * rung so the Mac runs cool and quiet for hours.
 */
function setAmbientMode(on) {
  const next = Boolean(on);
  show.ambient = next;
  globalThis.__chromaglassAmbient = next;
  buildMenu();
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    try { w.webContents.send('chromaglass:ambient', next); } catch { /* ignore */ }
  }
  return next;
}
globalThis.__chromaglassSetAmbient = setAmbientMode;
globalThis.__chromaglassAmbient = false;
ipcMain.on('chromaglass:set-ambient', (_event, on) => {
  setAmbientMode(Boolean(on));
});

/** Common to the show window and the projector window. */
const webPreferences = () => ({
  preload: join(HERE, 'preload.cjs'),
  contextIsolation: true,
  sandbox: true,
  // No developer tools in the app as it ships: the page's storage and its
  // licence state are one keystroke from edits there (the review of #494).
  devTools: !app.isPackaged,
  backgroundThrottling: false,
  additionalArguments: [
    // Percent-encoded, not base64url: a sandboxed preload's Buffer does not
    // read base64url, so the page was handed the free default and never the
    // key verified here (found with PLAN.md 23.17d; `npm run desktop` licence).
    `--chromaglass-license=${encodeURIComponent(JSON.stringify(show.license))}`,
    `--chromaglass-require-signin=${show.requireSignIn ? '1' : '0'}`,
  ],
});

/*
  The projector window.

  The web app opens it with window.open (`useCastSession`), placed on the
  projector's screen with `fullscreen` in the features, and it mirrors the
  show's canvas (`StageMirror`). In Chrome the window keeps its title bar until
  a click asks for the browser's own full screen, and says so on the wall
  (`CastHint`) and on the laptop (the "still has its title bar" chip). Here the
  window is made on the screen it asked for and put into the page's own full
  screen as soon as it has loaded, from this side, where no click is needed.
*/
function projectorWindowOptions(features) {
  const f = Object.fromEntries(String(features).split(',').map((s) => s.trim().split('=')));
  const want = { x: Number(f.left) || 0, y: Number(f.top) || 0, width: Number(f.width) || 1280, height: Number(f.height) || 720 };
  const display = screen.getDisplayMatching(want);
  return {
    ...display.bounds,
    backgroundColor: '#000000',
    title: 'ChromaGlass — projector',
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  };
}

/*
  Fill a projector window's screen. The page's own full screen first, run as
  if from a gesture (`true`), which is what it asks for and what the page
  reads back (`document.fullscreenElement`). If that is refused, the window's
  own full screen: on a plain window like this one it hides the title bar
  just the same, and the show counts a window whose page covers its screen
  as filling it (useCastSession's `readWindowFullscreen`).
*/
async function fillProjector(win) {
  if (win.isDestroyed()) return false;
  const page = await win.webContents.executeJavaScript(
    "document.fullscreenElement ? true : document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => true, () => false)",
    true,
  ).catch(() => false);   // closed before it loaded
  if (!page && !win.isDestroyed()) win.setFullScreen(true);
  return !win.isDestroyed() && (page || win.isFullScreen());
}

function fillOnLoad(win) {
  win.webContents.on('did-finish-load', () => { void fillProjector(win); });
}

/*
  The projector windows each show window opened, so the laptop's "Make it
  full screen" (ProjectorFillChip) can ask for its own again. Once the page
  has loaded, nothing puts a window back that left full screen (Escape on
  the wall, or the Mac moving it out of its Space), and a click on the show
  has to reach the projector's page to do it; from here it needs no gesture.
  Only a window this sender opened is touched.
*/
const projectorsOf = new Map();
ipcMain.handle('chromaglass:fill-projector', async (e) => {
  const mine = [...(projectorsOf.get(e.sender.id) ?? [])].filter((w) => !w.isDestroyed());
  const filled = await Promise.all(mine.map(fillProjector));
  return filled.some(Boolean);
});

/** What each projector window was opened with, for the check to see which screen the page chose. */
const opened = [];
globalThis.__chromaglassOpened = opened;

function wireWindow(win) {
  win.webContents.setWindowOpenHandler(({ url, features }) => {
    if (isOurs(url)) {
      opened.push(String(features));
      if (opened.length > 20) opened.shift();
      return { action: 'allow', overrideBrowserWindowOptions: projectorWindowOptions(features) };
    }
    // Anything else (a help link, the source) opens in the browser, never inside the show.
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('did-create-window', (child) => {
    wireWindow(child);
    fillOnLoad(child);
    const id = win.webContents.id;
    if (!projectorsOf.has(id)) projectorsOf.set(id, new Set());
    projectorsOf.get(id).add(child);
    child.on('closed', () => projectorsOf.get(id)?.delete(child));
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isOurs(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
}

const lanAddresses = () =>
  Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);

/** What the terminal server prints, for a show with no terminal. */
function showDetails() {
  const hosts = lanAddresses();
  const lines = [
    `Show key: ${show.key}`,
    '',
    ...(hosts.length
      ? hosts.flatMap((h) => [`Phone remote: http://${h}:${show.port}/?remote=1&key=${show.key}`, `Network display: http://${h}:${show.port}/?cast=true&key=${show.key}`])
      : ['No network: the phone remote and network displays need the laptop on Wi-Fi or Ethernet.']),
    '',
    show.oscMode === 'off'
      ? 'OSC in: off (Show menu > OSC input turns it on)'
      : `OSC in: UDP port ${show.osc}, ${show.oscMode === 'local' ? 'from this Mac only' : 'from anyone on the network'} (/chromaglass/setting/<key>, /action/<name>, /preset/<id>)`,
    ...(show.port !== 3000 ? ['', `Port 3000 was taken, so this show is on ${show.port}. Looks saved on 3000 are not in this one.`] : []),
  ];
  void dialog.showMessageBox(showWindow ?? undefined, { type: 'info', message: 'The show server', detail: lines.join('\n'), buttons: ['OK'] });
}

/*
  Updates (updates.js says what and why). Whether this build was signed with a
  Developer ID is written into its package.json by electron-builder.config.cjs,
  because only a signed app can be updated in place, and the app cannot tell
  that from its own signature without asking macOS.
*/
let updates = null;
function packedFlags() {
  try { return JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).chromaglass ?? {}; } catch { return {}; }
}
function startUpdater() {
  const feed = process.env.CHROMAGLASS_UPDATE_FEED || null;
  const off = updatesOff({ packaged: app.isPackaged, env: process.env });
  updates = startUpdates({
    autoUpdater: off ? null : electronUpdater.autoUpdater,
    // Squirrel.Mac itself, so Restart to Update waits until macOS has the update (updates.js).
    nativeUpdater: off || process.platform !== 'darwin' ? null : nativeAutoUpdater,
    off,
    version: app.getVersion(),
    signed: !!packedFlags().signed,
    feed,
    // The check's own feed is read a second after opening, not twenty.
    firstCheckMs: feed ? 1000 : undefined,
    notify: (title, body) => { if (Notification.isSupported()) new Notification({ title, body, silent: true }).show(); },
    openExternal: (url) => shell.openExternal(url),
    quiet: () => BrowserWindow.getAllWindows().length > 1,
    dialog: ({ message, detail }) => dialog.showMessageBox(showWindow ?? undefined, { type: 'info', message, detail, buttons: ['OK'] }),
    onChange: (state) => {
      globalThis.__chromaglassUpdate = { ...updates?.state ?? state };
      buildMenu();
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('chromaglass:update', state);
    },
  });
  globalThis.__chromaglassUpdate = { ...updates.state };
  // The profile sheet asks what was found, and its button does what the menu item does.
  ipcMain.handle('chromaglass:update-state', () => ({ ...updates.state, history: undefined }));
  ipcMain.handle('chromaglass:update-act', () => { updates.act(); return { ...updates.state, history: undefined }; });
}

/** The menu's OSC choice: kept, then applied to the running server without a restart. */
async function setOscMode(mode) {
  show.oscMode = mode;
  writeShowFile({ osc: mode });
  const state = await showServer?.setOsc?.(mode === 'off' ? 0 : show.osc, OSC_BINDS[mode]);
  process.env.OSC_PORT = String(mode === 'off' ? 0 : show.osc);
  process.env.OSC_BIND = OSC_BINDS[mode] ?? OSC_BINDS.local;
  globalThis.__chromaglassOsc = { mode, state };
  buildMenu();
  // A port that is taken says so, rather than leaving a menu that claims OSC is on.
  if (mode !== 'off' && !/^udp /.test(state ?? '') && !process.env.CHROMAGLASS_OFFLINE) {
    void dialog.showMessageBox(showWindow ?? undefined, { type: 'warning', message: `OSC could not open UDP port ${show.osc}`, detail: `${state ?? 'The show server is not running'}. Another program may be using the port; quit it, or pick the setting again.`, buttons: ['OK'] });
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      label: 'Show',
      submenu: [
        {
          label: 'Ambient TV Mode (Cool & Quiet)',
          type: 'checkbox',
          checked: show.ambient,
          accelerator: 'CmdOrCtrl+Shift+A',
          click: (item) => setAmbientMode(item.checked),
        },
        { type: 'separator' },
        { label: 'Show Server Details…', accelerator: 'CmdOrCtrl+Shift+K', click: showDetails },
        {
          label: 'OSC input',
          submenu: [
            ['off', 'Off'],
            ['local', 'This Mac only'],
            ['network', 'From the network'],
          ].map(([mode, label]) => ({ id: `osc-${mode}`, label, type: 'radio', checked: show.oscMode === mode, click: () => setOscMode(mode) })),
        },
      ],
    },
  ];
  // What the updater found goes under the app's name, where a Mac app keeps
  // Check for Updates…, and is rebuilt each time that changes (updates.js).
  const item = updates ? updateMenuItem(updates.state) : null;
  if (item) {
    const entry = { ...item, click: () => updates?.act() };
    if (isMac) template[0] = { label: app.name, submenu: [{ role: 'about' }, entry, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] };
    else template.push({ label: 'Help', submenu: [entry] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  offlineGuard();
  grantPermissions();
  startUpdater();
  buildMenu();
  if (process.env.CHROMAGLASS_AUDIO_TAP) await startLoopbackAudioTap();

  show.port = await choosePort();
  show.key = showKey();
  const osc = oscSettings();
  show.osc = osc.port;
  show.oscMode = osc.mode;
  buildMenu();
  /*
    The app opens on a Home or Pro licence (PLAN.md 23.17d; the owner,
    2026-10-25: "The Mac app should check the license. The app won't work for
    free"). The page's gate is AppLicenceGate.tsx; this tells it the app is
    asking, and tells the server to gate its features by the key. Always for
    the app as it ships, packed: there is no switch that opens a packed app
    for free. From the repo (`npm run app`, the checks) it stays open as
    before unless CHROMAGLASS_REQUIRE_SIGNIN asks, so working on the app needs
    no key.

    And a packed app takes no signing key from its environment, ever.
    LICENSE_PUBLIC_KEY lets the checks verify keys they sign themselves
    (server/license-key.js); in a shipped app it would let anyone who can set
    an environment variable sign their own Pro key, network or none (the
    review of #494: an earlier draft kept it with CHROMAGLASS_OFFLINE, and an
    offline show is still a show). The one other key a packed app trusts is
    its own build's `checkKey` (electron-builder.config.cjs), whose private
    half nobody holds once that build's job has ended.
  */
  show.requireSignIn = app.isPackaged || Boolean(process.env.CHROMAGLASS_REQUIRE_SIGNIN);
  if (show.requireSignIn) process.env.CHROMAGLASS_REQUIRE_SIGNIN = '1';
  if (app.isPackaged) {
    delete process.env.LICENSE_PUBLIC_KEY;
    delete process.env.LICENSE_BUILD_CHECK_KEY;
    const checkKey = packedFlags().checkKey;
    if (checkKey) process.env.LICENSE_BUILD_CHECK_KEY = JSON.stringify(checkKey);
  }
  // A sign-in with Google, or by the emailed link, finishes in the real
  // browser on this app's server (SignInScreen.tsx, lib/macApp.ts). Only our
  // own address crosses: the page cannot have the app open anything else.
  ipcMain.handle('chromaglass:open-browser', (_e, url) => {
    if (typeof url !== 'string' || !isOurs(url) || new URL(url).protocol !== 'http:') return false;
    void shell.openExternal(url);
    return true;
  });
  // The live stream (PLAN.md 37x-4b): the page encodes, this process speaks
  // RTMPS (live.js), and the stream keys stay in the keychain store (keys.js),
  // where a packed app alone can read them. Headless until the panel (37x-4d):
  // the page's `window.__cgLive` drives it from the console and the check.
  wireLive(ipcMain, {
    keys: makeKeyStore({ file: join(app.getPath('userData'), 'live-keys.json'), safeStorage }),
    isPackaged: app.isPackaged,
    send: (channel, payload) => { if (showWindow && !showWindow.isDestroyed()) showWindow.webContents.send(channel, payload); },
  });
  const licenseFile = process.env.CHROMAGLASS_LICENSE_FILE ?? join(app.getPath('userData'), 'license.json');
  process.env.CHROMAGLASS_LICENSE_FILE = licenseFile;
  // The server reads its settings from the environment, as it does in a terminal.
  process.env.PORT = String(show.port);
  process.env.SHOW_KEY = show.key;
  process.env.OSC_PORT = String(show.oscMode === 'off' ? 0 : show.osc);
  process.env.OSC_BIND = OSC_BINDS[show.oscMode] ?? OSC_BINDS.local;
  const { createServerLicenseManager } = await import(pathToFileURL(join(ROOT, 'server', 'server-license.js')).href);
  const licenseMgr = createServerLicenseManager({ filePath: licenseFile });
  await licenseMgr.initFromEnv();
  const initialStatus = await licenseMgr.currentStatus();
  let initialError = null;
  if (process.env.CHROMAGLASS_LICENSE_KEY && !initialStatus.valid) {
    const { verifyLicenseKey } = await import(pathToFileURL(join(ROOT, 'server', 'license-key.js')).href);
    const check = await verifyLicenseKey(process.env.CHROMAGLASS_LICENSE_KEY);
    initialError = check.error ?? 'invalid-signature';
  }
  show.license = {
    valid: initialStatus.valid,
    tier: initialStatus.tier,
    email: initialStatus.email,
    id: initialStatus.id,
    exp: initialStatus.exp,
    error: initialError,
    enforced: initialStatus.enforced,
  };
  showServer = await import(pathToFileURL(SERVER).href);
  await serverUp(show.port);
  // What the check reads from the main process (scripts/desktop.mjs): the choice, and what the socket did with it.
  globalThis.__chromaglassOsc = { mode: show.oscMode, state: showServer.oscState?.() };

  // A screen that sleeps in the middle of a set is the one thing the room notices.
  powerSaveBlocker.start('prevent-display-sleep');

  showWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    title: 'ChromaGlass',
    show: false,
    webPreferences: webPreferences(),
  });
  wireWindow(showWindow);
  showWindow.once('ready-to-show', () => showWindow?.show());
  // Closing the show closes the projector with it, and the app: the server has nothing to serve.
  showWindow.on('closed', () => {
    showWindow = null;
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.destroy();
    }
    app.quit();
    // And out, whatever holds the quit up. On CI's Mac a run whose projector
    // window had been in and out of the Mac's own full screen just before
    // stayed running with its port taken after the show was closed
    // (PLAN 14af; run 40942225503), and an app left running with no window
    // keeps the show's port from the next launch. `will-quit` exits at once
    // when the quit goes through; this is only for when it does not.
    setTimeout(() => app.exit(0), 3000).unref?.();
  });
  const query = process.env.CHROMAGLASS_QUERY ?? '';
  await showWindow.loadURL(`http://localhost:${show.port}/${query}`);
}

function fail(title, err) {
  console.error(title, err);
  // Not under the check: the box waits for a click, and the check would time
  // out on it instead of printing what went wrong.
  if (!process.env.CHROMAGLASS_OFFLINE) dialog.showErrorBox(title, String(err?.message ?? err));
  app.exit(1);
}

app.on('will-quit', () => {
  if (loopbackAudioSocket) {
    try { loopbackAudioSocket.close(); } catch { /* ignore */ }
    loopbackAudioSocket = null;
  }
  setImmediate(() => app.exit(0));
});
app.on('window-all-closed', () => app.quit());
