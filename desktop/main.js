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

import { app, BrowserWindow, dialog, Menu, powerSaveBlocker, screen, session, shell } from 'electron';
import { randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
/** What the show server was started with, for the menu's details. */
const show = { port: 0, osc: 0, key: '' };

/**
 * The show key, kept between launches.
 *
 * The terminal server picks four new digits every run. That is fine when the
 * phone is set up in the same minute; an app that is quit and reopened
 * between soundcheck and doors would log every phone out. So the app picks
 * one on its first launch and keeps it, and SHOW_KEY still wins when set.
 */
function showKey() {
  if (process.env.SHOW_KEY) return String(process.env.SHOW_KEY);
  const file = join(app.getPath('userData'), 'show.json');
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof saved.key === 'string' && /^\d{4,}$/.test(saved.key)) return saved.key;
  } catch { /* first launch */ }
  const key = String(randomInt(1000, 10000));
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ key }, null, 2));
  } catch { /* a key for this launch only */ }
  return key;
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
*/
function grantPermissions() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, _permission, done, details) => done(isOurs(details?.requestingUrl ?? wc.getURL())));
  ses.setPermissionCheckHandler((_wc, _permission, origin) => isOurs(origin));
}

/** Common to the show window and the projector window. */
const webPreferences = () => ({
  preload: join(HERE, 'preload.cjs'),
  contextIsolation: true,
  sandbox: true,
  backgroundThrottling: false,
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

function fillOnLoad(win) {
  const fill = () => {
    if (win.isDestroyed()) return;
    // `true`: run as if from a gesture, which is what the page's full screen asks for.
    win.webContents.executeJavaScript(
      "document.fullscreenElement ? true : document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => true, () => false)",
      true,
    ).catch(() => { /* closed before it loaded */ });
  };
  win.webContents.on('did-finish-load', fill);
}

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
  win.webContents.on('did-create-window', (child) => { wireWindow(child); fillOnLoad(child); });
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
    show.osc > 0 ? `OSC in: UDP port ${show.osc} (/chromaglass/setting/<key>, /action/<name>, /preset/<id>)` : 'OSC in: off',
    ...(show.port !== 3000 ? ['', `Port 3000 was taken, so this show is on ${show.port}. Looks saved on 3000 are not in this one.`] : []),
  ];
  void dialog.showMessageBox(showWindow ?? undefined, { type: 'info', message: 'The show server', detail: lines.join('\n'), buttons: ['OK'] });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    { label: 'Show', submenu: [{ label: 'Show Server Details…', accelerator: 'CmdOrCtrl+Shift+K', click: showDetails }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function start() {
  offlineGuard();
  grantPermissions();
  buildMenu();

  show.port = await choosePort();
  show.key = showKey();
  show.osc = Number(process.env.OSC_PORT ?? 9000);
  // The server reads its settings from the environment, as it does in a terminal.
  process.env.PORT = String(show.port);
  process.env.SHOW_KEY = show.key;
  process.env.OSC_PORT = String(show.osc);
  await import(pathToFileURL(SERVER).href);
  await serverUp(show.port);

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
  showWindow.on('closed', () => { showWindow = null; app.quit(); });
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

app.on('window-all-closed', () => app.quit());
