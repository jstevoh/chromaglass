#!/usr/bin/env node
/**
 * The Mac app opens the show by itself, offline (PLAN.md §13 step 1).
 *
 *   npm run desktop                  # the app from the repo (desktop/, the site in dist/)
 *   npm run desktop -- --packaged    # the app as packed in desktop/release
 *
 * Asked for on 2026-09-27: "Mac desktop app: the offline app with the show
 * server built in". The plan's words for what proves it: "A check loads the
 * packaged app with the network off and sees a lit plate." Each line below is
 * one thing the app promises, asked of the app itself (Electron, driven by
 * Playwright), not of the site in a browser, which every other check covers:
 *
 *   opens         the window shows the site from the server inside the app,
 *                 at http://localhost:<port>/, with nothing clicked
 *   network off   every request a page makes that would leave the machine
 *                 is refused (CHROMAGLASS_OFFLINE=1, desktop/main.js), and
 *                 the refusal is seen to work: a no-cors fetch of the website
 *                 from the page fails and is written down. Anything else a
 *                 page tried to fetch from outside fails the check by name, so
 *                 a font or a script from a CDN cannot creep into a show that
 *                 must open in a field. The main process and the server's own
 *                 Node requests are not seen (neither makes any today)
 *   show server   `/remote-info.json` answers as the relay, with the show key
 *                 the app kept in its profile, and the show window joined the
 *                 relay as the display (the server says so on its output)
 *   OSC           a UDP packet to the app's OSC port changes a setting on the
 *                 plate: the server inside plays the show, not just serves it
 *   lit plate     the plate is drawing: a painted frame read back is lit, in
 *                 colour, not one flat colour, and different a second later.
 *                 On a Mac (CI's runner, Metal) this must pass; on a Linux box
 *                 with software WebGPU the app's readbacks come back empty
 *                 (CLAUDE.md), and it is reported as skipped
 *   not throttled the show window minimised, and covered by another window,
 *                 still counts as seen and keeps its frames and timers; each
 *                 judged only where a window in a bare Electron (Chromium's
 *                 defaults) is seen to slow down the same way, and said to
 *                 measure nothing where it does not (as under xvfb)
 *   projector     with one screen no projector window opens; with a second
 *                 screen that is not built in, the show window asks for that
 *                 screen with no click and no key, mirrors the show there, and
 *                 is in the page's own full screen, so neither the wall nor
 *                 the laptop asks for a click to drop the title bar
 *                 and shows no pointer on any of its elements
 *   updates       (packed only) the app's updater, electron-updater as
 *                 shipped, reads a release feed (here a stand-in the check
 *                 serves, at version 999.0.0, in place of GitHub's) a moment
 *                 after the show opens, finds the new version, and offers it in
 *                 the app's menu and to the page's profile sheet, unasked for
 *                 nothing else (PLAN 13-update; `npm run updates` asks the
 *                 rest of what desktop/updates.js promises, in plain Node)
 *   quits         closing the show window, with the projector open, quits
 *                 the app and frees the port
 *   licence       the run above opened on a Pro key (signed for this run); the
 *                 same app with no key shows its door, the sign-in, and no
 *                 plate, and (built as it ships, VITE_MAC_APP=1) so does a
 *                 plain browser opened on its server (PLAN.md 23.17d)
 *   OSC closed    the app opens with OSC off (nothing listens on its port);
 *                 Show > OSC input turns it on for this Mac only (bound to
 *                 127.0.0.1) or the network (0.0.0.0) without a restart, off
 *                 again, and the choice is there after the app is quit and
 *                 opened (PLAN.md 23.17m, the security audit's finding 4)
 *   no debugger   (packed only) the packed app launched with
 *                 --remote-debugging-port quits by itself, beside the same
 *                 app launched plainly, which serves (finding 9)
 *   entitlements  (packed, macOS) the signature carries no
 *                 disable-library-validation and no allow-unsigned-
 *                 executable-memory, and the app as signed still starts and
 *                 serves, which is the proof it did not need them (finding 13)
 *
 * The second screen is a stand-in: an init script adds one to what the real
 * `getScreenDetails` returns, so the real permission (granted by the app, not
 * the script) is still what lets the page see screens. With two real screens
 * attached the stand-in is not added and the one-screen control is skipped.
 *
 * Needs `npm --prefix desktop install` once (Electron is not a dependency of
 * the site). On Linux with no display it runs itself under xvfb-run.
 */
import { _electron as electron } from 'playwright';
import { spawn as launchProcess, spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { signLicenseKey } from '../server/license-key.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESKTOP = join(REPO, 'desktop');
const PACKAGED = process.argv.includes('--packaged');
const isMac = process.platform === 'darwin';

// A Linux box with no display (a cloud session, a container): the same run, under a virtual one.
if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.DESKTOP_UNDER_XVFB) {
  const r = spawnSync('xvfb-run', ['-a', '-s', '-screen 0 1440x900x24', process.execPath, ...process.argv.slice(1)], {
    stdio: 'inherit', env: { ...process.env, DESKTOP_UNDER_XVFB: '1' },
  });
  if (r.error) { console.error(`FAIL  no display, and xvfb-run could not be started: ${r.error.message}`); process.exit(1); }
  process.exit(r.status ?? 1);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => console.log(`skip  ${name} — ${why}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The Electron to run, and what to hand it. */
function whichApp() {
  if (!existsSync(join(REPO, 'dist', 'index.html'))) {
    console.error('FAIL  no build in dist/: run "npm run build" first (npm run desktop does)');
    process.exit(1);
  }
  if (PACKAGED) {
    const release = join(DESKTOP, 'release');
    const found = [];
    if (existsSync(release)) {
      for (const d of readdirSync(release)) {
        const app = join(release, d, 'ChromaGlass.app', 'Contents', 'MacOS', 'ChromaGlass');
        if (isMac && existsSync(app)) found.push(app);
        const bin = join(release, d, 'chromaglass-desktop');
        if (!isMac && existsSync(bin)) found.push(bin);
      }
    }
    if (!found.length) {
      console.error(`FAIL  no packed app in ${release}: run "npm --prefix desktop run pack" first`);
      process.exit(1);
    }
    return { executablePath: found[0], args: [], label: `packed: ${found[0].slice(REPO.length + 1)}` };
  }
  let executablePath;
  try {
    executablePath = createRequire(join(DESKTOP, 'package.json'))('electron');
  } catch {
    console.error('FAIL  Electron is not installed for desktop/: run "npm --prefix desktop install" once');
    process.exit(1);
  }
  return { executablePath, args: [DESKTOP], label: 'from the repo: desktop/ with dist/' };
}

const freePort = (type) => new Promise((done, fail) => {
  if (type === 'udp') {
    const s = createSocket('udp4');
    s.once('error', fail);
    s.bind(0, '0.0.0.0', () => { const { port } = s.address(); s.close(() => done(port)); });
    return;
  }
  const s = createServer();
  s.once('error', fail);
  s.listen(0, '0.0.0.0', () => { const { port } = s.address(); s.close(() => done(port)); });
});

/** One OSC 1.0 message with float arguments: what Resolume or TouchDesigner sends. */
function oscMessage(address, ...floats) {
  const pad = (b) => Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]);
  const addr = pad(Buffer.from(address));
  const tags = pad(Buffer.from(`,${'f'.repeat(floats.length)}`));
  const args = Buffer.alloc(4 * floats.length);
  floats.forEach((f, i) => args.writeFloatBE(f, 4 * i));
  return Buffer.concat([addr, tags, args]);
}

const app = whichApp();
const profile = mkdtempSync(join(tmpdir(), 'chromaglass-desktop-'));
const PORT = await freePort('tcp');
const OSC_PORT = await freePort('udp');
const QUERY = '?debug&look=classic';

/*
  The licence (PLAN.md 23.17d). The app as it ships opens only on a Home or
  Pro key, so the show this check opens is a licensed one, handed to it as
  CHROMAGLASS_LICENSE_KEY, the way a terminal `npm run show` takes one.

  From the repo, the key is signed with a pair made here, which the app is
  told to trust (LICENSE_PUBLIC_KEY), and the app is told to ask for a
  licence (CHROMAGLASS_REQUIRE_SIGNIN): both runs take the same door.

  Packed, the app trusts no key from its environment (desktop/main.js). It
  trusts its own build's `checkKey`, a pair desktop.yml made for that build;
  the private half is in a file only that job has
  (DESKTOP_CHECK_PRIVATE_KEY_FILE), and it signs the key here. And the
  keyless launch below is handed a key signed with this run's own pair and
  told to trust it, network refused, which is what a stranger could do: it
  must still meet the door.
*/
const licPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const LIC_PUBLIC = JSON.stringify(await crypto.subtle.exportKey('jwk', licPair.publicKey));
const LIC_PAYLOAD = { id: 'desktop-check-pro', tier: 'pro', email: 'desktop-check@example.com' };
const SELF_SIGNED = await signLicenseKey(LIC_PAYLOAD, await crypto.subtle.exportKey('jwk', licPair.privateKey));
let LIC_KEY = SELF_SIGNED;
if (PACKAGED) {
  const file = process.env.DESKTOP_CHECK_PRIVATE_KEY_FILE;
  if (!file || !existsSync(file)) {
    console.error('FAIL  the packed app opens only on a key, and this check holds none it trusts: pack with CHROMAGLASS_BUILD_CHECK_KEY and pass its private half as DESKTOP_CHECK_PRIVATE_KEY_FILE (desktop.yml)');
    process.exit(1);
  }
  LIC_KEY = await signLicenseKey(LIC_PAYLOAD, readFileSync(file, 'utf8'));
}
console.log(`The app ${app.label}; port ${PORT}, OSC ${OSC_PORT}, a new profile, the network off.\n`);

/*
  The release feed, for the packed app only (run from the repo there is no
  app-update.yml, and updates.js says it is off). What GitHub would serve from
  the newest release: latest-mac.yml naming a version above any real one. On
  Linux electron-updater is the AppImage updater, which stays off unless it is
  told the AppImage it would replace (APPIMAGE); it is given the packed binary
  so the same check runs in a cloud session. Nothing downloads either way on
  an ad hoc build; a signed one would try for the zip, which is not served.
*/
const feedAsked = [];
let feed = null;
// The feed holds its answer until the page is listening, so the push to the
// page (what the profile card hears) is measured, not raced.
let openFeed = () => {};
const feedOpen = new Promise((r) => { openFeed = r; });
if (PACKAGED) {
  const yml = ['version: 999.0.0', 'files:', '  - url: ChromaGlass-999.0.0-arm64-mac.zip', '    sha512: AAAA', '    size: 1', '  - url: ChromaGlass-mac-arm64.dmg', '    sha512: AAAA', '    size: 1', 'path: ChromaGlass-999.0.0-arm64-mac.zip', 'sha512: AAAA', "releaseDate: '2026-10-25T00:00:00.000Z'", ''].join('\n');
  feed = createHttpServer(async (req, res) => {
    feedAsked.push(req.url);
    await feedOpen;
    if (/latest(-mac|-linux)?\.yml/.test(req.url ?? '')) { res.writeHead(200, { 'content-type': 'text/yaml' }); res.end(yml); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => feed.listen(0, '127.0.0.1', r));
}

const env = {
  ...process.env,
  ...(feed ? { CHROMAGLASS_UPDATE_FEED: `http://127.0.0.1:${feed.address().port}/`, ...(isMac ? {} : { APPIMAGE: app.executablePath }) } : {}),
  PORT: String(PORT),
  OSC_PORT: String(OSC_PORT),
  CHROMAGLASS_USER_DATA: profile,
  CHROMAGLASS_OFFLINE: '1',
  CHROMAGLASS_AUDIO_TAP: '1',
  CHROMAGLASS_QUERY: QUERY,
  CHROMAGLASS_REQUIRE_SIGNIN: '1',
  ...(PACKAGED ? {} : { LICENSE_PUBLIC_KEY: LIC_PUBLIC }),
  CHROMAGLASS_LICENSE_KEY: LIC_KEY,
  ...(isMac ? {} : { CHROMAGLASS_SOFTWARE_WEBGPU: '1' }),
};
delete env.SHOW_KEY;   // the app's own key, the one it keeps, is what is checked

const electronApp = await electron.launch({
  executablePath: app.executablePath,
  args: [...app.args, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env,
  timeout: 60_000,
});
let output = '';
electronApp.process().stdout?.on('data', (d) => { output += d.toString(); });
electronApp.process().stderr?.on('data', (d) => { output += d.toString(); });

const allWindows = () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((w) => ({ id: w.id, url: w.webContents.getURL() })));
/** In the main process: the show window is the one that is not the projector (`?cast=`). */
const SHOW_WINDOW = "BrowserWindow.getAllWindows().find((w) => !/[?&]cast=/.test(w.webContents.getURL()))";

try {
  // ── opens ──────────────────────────────────────────────────────────
  const page = await electronApp.firstWindow({ timeout: 60_000 });
  await page.waitForSelector('#liquid-canvas', { state: 'attached', timeout: 60_000 }).catch(() => null);
  const url = page.url();
  const canvas = await page.locator('#liquid-canvas').count();
  // On its key (PLAN.md 23.17d): the door never drawn, and the key the app verified handed to the page.
  const keyed = await page.evaluate(() => !document.querySelector('[data-cg-app-licence]') && !!window.__CHROMAGLASS_NATIVE__?.license?.valid).catch(() => false);
  check('opens: the show, from the server inside the app, on its licence', url === `http://localhost:${PORT}/${QUERY}` && canvas === 1 && keyed,
    `${url}, ${canvas ? 'the plate canvas is there' : 'no plate canvas'}, ${keyed ? 'on the key the app verified' : 'the door drawn or no key handed to the page'}`);

  // The profile card's way of hearing the updater (desktop/preload.cjs), set
  // up before the feed answers; read in the updates line below.
  if (feed) {
    await page.evaluate(() => {
      window.__cgUpdatePushes = [];
      window.__CHROMAGLASS_NATIVE__?.updates?.onChange((st) => window.__cgUpdatePushes.push(`${st.status} ${st.version ?? ''}`.trim()));
    }).catch(() => {});
  }
  openFeed();
  // Read here, before anything below reloads the page and its list with it.
  let pushes = null;
  if (feed) {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      pushes = await page.evaluate(() => window.__cgUpdatePushes ?? null).catch(() => null);
      if (!Array.isArray(pushes) || pushes.some((p) => !/^(idle|checking)/.test(p))) break;
      await sleep(250);
    }
  }

  // ── network off ───────────────────────────────────────────────────
  // `no-cors`: the website sends no CORS headers, so an ordinary cross-origin
  // fetch fails even when the request went out; this one fails only if the
  // guard stopped it.
  const probe = await page.evaluate(() => fetch('https://chromaglass.web.app/?desktop-probe', { cache: 'no-store', mode: 'no-cors' }).then(() => 'fetched', () => 'refused'));
  const refusedList = async () => {
    const list = await electronApp.evaluate(() => globalThis.__chromaglassBlocked);
    if (!Array.isArray(list)) throw new Error('the app keeps no list of refused requests: is CHROMAGLASS_OFFLINE reaching it?');
    return list;
  };
  const probeSeen = (await refusedList()).some((b) => b.url.includes('desktop-probe'));
  check('network off: a request to the website is refused, and written down', probe === 'refused' && probeSeen,
    `the fetch was ${probe}; ${probeSeen ? 'in' : 'not in'} the refused list`);

  // ── show server ────────────────────────────────────────────────────
  const info = await page.evaluate(() => fetch('/remote-info.json', { cache: 'no-store' }).then((r) => r.json(), () => null));
  let keptKey = null;
  try { keptKey = JSON.parse(readFileSync(join(profile, 'show.json'), 'utf8')).key; } catch { /* not written */ }
  check('show server: it answers as the relay, with the key the app kept',
    info?.chromaglass === 'relay' && info.port === PORT && !!keptKey && info.key === keptKey,
    info ? `relay on ${info.port}, key ${info.key}, kept ${keptKey ?? 'nothing'}` : 'no answer');
  const joined = await (async () => {
    for (let i = 0; i < 100 && !/display connected/.test(output); i++) await sleep(100);
    return /display connected/.test(output);
  })();
  check('show server: the show window joined it as the display', joined, joined ? 'the server printed "display connected"' : 'the server never saw a display');

  // ── OSC ────────────────────────────────────────────────────────────
  const before = await page.evaluate(() => window.chromaglassSettings?.().audioImpact);
  const target = Math.abs((before ?? 0) - 0.37) < 0.01 ? 0.73 : 0.37;
  const udp = createSocket('udp4');
  let after = before;
  for (let i = 0; i < 30 && Math.abs((after ?? 0) - target) > 0.001; i++) {
    // Sent more than once: UDP promises nothing, and the first may beat the socket's bind.
    if (i % 5 === 0) udp.send(oscMessage('/chromaglass/setting/audioImpact', target), OSC_PORT, '127.0.0.1');
    await sleep(100);
    after = await page.evaluate(() => window.chromaglassSettings?.().audioImpact);
  }
  udp.close();
  check('OSC: /chromaglass/setting/audioImpact over UDP changes the plate', typeof before === 'number' && Math.abs(after - target) <= 0.001,
    `${before} → ${after} (sent ${target})`);

  // ── lit plate ──────────────────────────────────────────────────────
  /*
    The thresholds are webgpu-smoke's for "grabFrame reads a plate with paint
    on it" (brightest over 64, over half the pixels lit, over 5 % in colour),
    which CI's Mac has passed on the same look for months. Three more,
    because one lit frame passes a plate frozen on one flat colour: a frame
    the stage declined to paint is waited out, not measured (as
    `scripts/frame.mjs` does); no one colour may cover 90 % of it; and a
    second frame a second later must differ from the first.
  */
  const started = await page.waitForFunction(() => (window.chromaglassDebug?.().webgpu?.frames ?? 0) > 120, null, { timeout: isMac ? 60_000 : 30_000 })
    .then(() => true, () => false);
  const grab = () => page.evaluate(async () => {
    let g = null;
    for (let tries = 0; tries < 20; tries++) {
      g = await window.chromaglassDebug().grabFrame();
      if (!g || g.painted !== false) break;
      await new Promise((r) => requestAnimationFrame(r));
    }
    if (!g || g.painted === false) return null;
    let max = 0, lit = 0, colour = 0;
    const buckets = new Map();
    const sample = [];
    for (let i = 0; i < g.pixels.length; i += 4) {
      const hi = Math.max(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
      const lo = Math.min(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
      if (hi > max) max = hi;
      if (hi > 8) lit++;
      if (hi > 40 && (hi - lo) / hi > 0.25) colour++;
      const k = ((g.pixels[i] >> 4) << 8) | ((g.pixels[i + 1] >> 4) << 4) | (g.pixels[i + 2] >> 4);
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
      if (i % 64 === 0) sample.push(g.pixels[i], g.pixels[i + 1], g.pixels[i + 2]);
    }
    const n = g.pixels.length / 4;
    return { width: g.width, height: g.height, max, lit: lit / n, colour: colour / n, top: Math.max(...buckets.values()) / n, sample };
  }).catch(() => null);
  const first = started ? await grab() : null;
  if (first) await sleep(1000);
  const second = first ? await grab() : null;
  const moved = first && second && first.sample.length === second.sample.length
    ? first.sample.filter((v, i) => Math.abs(v - second.sample[i]) > 4).length / first.sample.length
    : 0;
  const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null).catch(() => null);
  const lit = !!first && first.max > 64 && first.lit > 0.5 && first.colour > 0.05 && first.top < 0.9 && moved > 0.01;
  const plateDetail = first
    ? `${engine}; ${first.width}×${first.height}, brightest ${first.max}, ${(first.lit * 100).toFixed(0)}% lit, ${(first.colour * 100).toFixed(0)}% in colour, the commonest colour ${(first.top * 100).toFixed(0)}%, ${(moved * 100).toFixed(1)}% changed a second later`
    : `${engine ?? 'no engine'}; ${started ? 'no painted frame read back' : 'the plate never drew 120 frames'}`;
  if (isMac || first) check('lit plate: the plate draws, lit, in colour and moving, with the network off', lit, plateDetail);
  else skip('lit plate', `software WebGPU gives the app no readback here (CLAUDE.md); CI's Mac measures it. Here: ${plateDetail}`);

  // ── not throttled ───────────────────────────────────────────────────
  /*
    What the app promises (desktop/main.js) is that the show keeps going when
    its window is minimised or covered by another window. Each is done to the
    show window, which is then asked what the page thinks it is
    (`document.visibilityState`), how many animation frames it gets in two
    seconds (what the plate's loop runs on), and how long those two seconds
    really took (a timer that fires late is a throttled one).

    The control is the same thing done to a window in a second, bare Electron
    with Chromium's defaults: no switches and throttling on. It has to be a
    separate process. The first control was a window inside the app, and on
    CI's Mac it stayed "visible" at 46 frames/s minimised, because the app's
    command-line switches (disable-backgrounding-occluded-windows and the
    rest) apply to every window in the process, the control's too. Each way
    of hiding is judged only if the bare window is seen to slow down under it;
    otherwise that way hides nothing on this display and is said to measure
    nothing. Under xvfb, with no window manager, neither does. The show window
    is not judged there either: the plate in software WebGPU holds its own
    main thread for seconds at a time, shown or not (measured 2026-09-27: two
    seconds of timers took 15.9 s with the window shown).
  */
  const FRAMES_JS = "new Promise((done) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); }; requestAnimationFrame(f); setTimeout(() => done({ fps: n / 2, took: performance.now() - t0, vis: document.visibilityState }), 2000); })";
  const hide = (target, how, find) => target.evaluate(async ({ BrowserWindow }, [how, find, js]) => {
    const win = new Function('BrowserWindow', `return ${find}`)(BrowserWindow);
    let cover = null;
    if (how === 'covered') {
      cover = new BrowserWindow({ ...win.getBounds(), frame: false, alwaysOnTop: true, backgroundColor: '#202020', focusable: false });
      cover.show();
    } else {
      win.minimize();
    }
    await new Promise((r) => setTimeout(r, 1500));
    const read = await win.webContents.executeJavaScript(js);
    if (cover) cover.destroy();
    win.restore();
    return read;
  }, [how, find, FRAMES_JS]);
  const bare = await (async () => {
    let exe;
    try { exe = createRequire(join(DESKTOP, 'package.json'))('electron'); } catch { return null; }
    const main = join(profile, 'control.cjs');
    writeFileSync(main, "const { app, BrowserWindow } = require('electron');\napp.whenReady().then(() => new BrowserWindow({ width: 400, height: 300 }).loadURL('data:text/html,<title>control</title>'));\n");
    const control = await electron.launch({ executablePath: exe, args: [main, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '' } });
    try {
      await control.firstWindow();
      await sleep(500);
      const find = 'BrowserWindow.getAllWindows()[0]';
      return { minimised: await hide(control, 'minimised', find), covered: await hide(control, 'covered', find) };
    } finally {
      await control.close().catch(() => {});
    }
  })();
  const shows = { minimised: await hide(electronApp, 'minimised', SHOW_WINDOW) };
  await sleep(500);
  shows.covered = await hide(electronApp, 'covered', SHOW_WINDOW);
  const say = (r) => `${r.vis}, ${r.fps.toFixed(0)} frames/s, 2 s of timers took ${(r.took / 1000).toFixed(1)} s`;
  const slowed = (r) => r.vis === 'hidden' || r.fps < 5 || r.took > 3000;
  const keeps = (r) => r.vis === 'visible' && r.fps >= 20 && r.took < 3000;
  for (const how of ['minimised', 'covered']) {
    const detail = `the show ${how}: ${say(shows[how])}; a bare Electron window ${how}: ${bare ? say(bare[how]) : 'not run (needs desktop/node_modules)'}`;
    if (bare && slowed(bare[how])) check(`not throttled: the show ${how} still counts as seen, and keeps its frames and timers`, keeps(shows[how]), detail);
    else skip(`not throttled, ${how}`, `a bare window ${how} does not slow down on this display, so there is nothing to measure. ${detail}`);
  }

  // ── projector ───────────────────────────────────────────────────────
  // The two things the line reads on the page must still be in the build, or
  // their absence below would read as a pass.
  const assets = join(REPO, 'dist', 'assets');
  const built = readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('');
  const lost = ['cast-hint', 'projector-fill'].filter((id) => !built.includes(id));
  if (lost.length) check('projector: the build still has the hint and the chip this reads', false, `missing ${lost.join(', ')}`);
  // Zero means the API or the app's permission failed, not "one screen".
  const screens = await page.evaluate(async () => (await window.getScreenDetails?.().catch(() => null))?.screens.length ?? 0);
  const windowsNow = (await allWindows()).length;
  let standIn = null;
  if (screens === 0) {
    check('projector: the page can see the screens (the app grants it)', false, 'getScreenDetails gave nothing');
  } else if (screens === 1) {
    check('projector: with one screen, no projector window opens', windowsNow === 1, `${screens} screen, ${windowsNow} window`);
    standIn = await page.evaluate(async () => { const d = await window.getScreenDetails(); return d.currentScreen.left + d.currentScreen.width; });
    await page.context().addInitScript(() => {
      const real = window.getScreenDetails?.bind(window);
      if (!real) return;
      window.getScreenDetails = async () => {
        const d = await real();
        if (d.screens.length > 1) return d;
        const here = d.currentScreen;
        const wall = {
          label: 'Projector (stand-in)', isInternal: false, isPrimary: false,
          left: here.left + here.width, top: here.top, width: 1920, height: 1080,
          availLeft: here.left + here.width, availTop: here.top, availWidth: 1920, availHeight: 1080,
        };
        return { screens: [...d.screens, wall], currentScreen: here, onscreenschange: null, addEventListener() {}, removeEventListener() {} };
      };
    });
    // Every page from here on keeps its long animation frames, so the
    // projector's line can say what its page was waiting on (see there).
    await page.context().addInitScript(() => {
      const frames = [];
      window.__cgLongFrames = frames;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) frames.push({ start: e.startTime, duration: e.duration, script: (e.scripts ?? []).reduce((t, x) => t + x.duration, 0) });
        }).observe({ type: 'long-animation-frame', buffered: true });
      } catch { /* no LoAF in this engine: the line says so */ }
    });
    await page.reload({ waitUntil: 'load' });
  } else {
    skip('projector: with one screen, no projector window opens', `${screens} real screens attached`);
  }
  let cast = null;
  for (let i = 0; i < 100 && !cast; i++) {
    await sleep(100);
    cast = (await allWindows()).find((w) => /[?&]cast=/.test(w.url)) ?? null;
  }
  /*
    The wall is read twice: once the mirror is up, and again two seconds later.

    It was read once, at a fixed 2.5 s after the window appeared, and went red
    on two PRs that never touched it (2026-10-04, #255 and #262's Mac app job:
    "the mirror's canvas missing", with the page loaded and in full screen).
    A page that has loaded but has no canvas is, by every sign, `main.tsx`'s
    Suspense fallback: the projector's page is one lazy import, and until it
    has rendered the root holds a black <div> and nothing else.

    What it waits on is the show window. The two windows share one renderer
    (the mirror reads the opener's document directly, so they must), and the
    show has just reloaded and is starting its plate. In a cloud session the
    projector's scripts are all in by 0.12 s, and still the mirror mounts at
    0.39–0.65 s (six runs), as the page's first animation frame ends: 0.48–
    0.58 s long, 11–66 ms of it script, while the show's own first frame is
    held over the same span with next to none. On the Mac, the first frame
    of a show's opening is where Chromium starts the GPU, which
    `npm run startup` has measured holding a cold show 2.5–3.2 s with no script
    running (scripts/pagehold.mjs); whether this reload's frame is that same
    hold is what the printed frame says. Either way a fixed 2.5 s read races
    the show's opening, which nothing on the projector's side can shorten,
    and the wall is black through it: the show has drawn nothing to mirror
    yet. (Keeping the solver's 668 kB chunk out of the mirror's page was
    tried: in the cloud the mirror came up at 0.42–0.63 s with it out against
    0.39–0.65 s with it in, so it is not what the page waits on.)

    So the line waits for the mirror, prints how long it took and the
    longest frame the page sat in before it, and holds it to the app's own
    bar: the 8 s after which `Loading` stops being a black screen and says
    the page is stuck.

    The second read is what the 2.5 s was for. `CastHint` puts the click hint
    up 1.5 s after it mounts, which is when the mirror mounts, not when the
    window opened: a mirror that came up at 2.4 s was read for the hint 0.1 s
    later and passed whatever the hint would have done. Read 2 s after the
    mirror was first seen, the hint has had its 1.5 s.

    And the second read has to be a read of the same page, at least 1.5 s
    after the mirror, or the line is red (the check-skeptic, 2026-10-04): a
    read that failed (the window closed, its renderer gone, a page that never
    answers, each given 3 s) used to fall back to the first, taken the moment
    the mirror came up, with the hint not yet due; and a page that reloaded
    in between starts its clock again, so its hint is not due either. The same
    page is the same `timeOrigin`. It must still have the show window to
    mirror (an opener, not closed), and there must be one projector window,
    not a healthy first one beside another.
  */
  let castState = null;
  let firstRead = null;
  let mirrorAt = null;
  if (cast) {
    const readWall = () => Promise.race([electronApp.evaluate(async ({ BrowserWindow }, id) => {
      const w = BrowserWindow.fromId(id);
      if (!w || w.isDestroyed()) return null;
      const casts = BrowserWindow.getAllWindows().filter((x) => /[?&]cast=/.test(x.webContents.getURL())).length;
      const doc = await w.webContents.executeJavaScript("({ age: performance.now(), origin: performance.timeOrigin, linked: !!window.opener && !window.opener.closed, full: !!document.fullscreenElement, hint: !!document.querySelector('[data-testid=cast-hint]'), mirror: !!document.querySelector('#stage-canvas'), canvas: !!document.querySelector('canvas'), root: document.getElementById('root')?.childElementCount ?? 0, elements: document.querySelectorAll('*').length, pointer: [...document.querySelectorAll('*')].filter((el) => getComputedStyle(el).cursor !== 'none').map((el) => el.tagName.toLowerCase()).slice(0, 4), frames: window.__cgLongFrames ?? null, scripts: performance.getEntriesByType('resource').filter((e) => /\\.js$/.test(e.name)).map((e) => `${e.name.split('/').pop().replace(/-[\\w-]{8}\\.js$/, '')} ${(e.responseEnd / 1000).toFixed(2)} s`) })");
      return { windowFull: w.isFullScreen(), casts, ...doc };
    }, cast.id).catch(() => null), sleep(3000).then(() => null)]);
    // `age` is the projector page's own clock: how long since its document started.
    for (let i = 0; i < 400; i++) {
      castState = await readWall();
      if (castState?.mirror) { mirrorAt = castState.age; firstRead = castState; break; }
      if ((castState?.age ?? 0) > 8000) break;
      await sleep(50);
    }
    if (mirrorAt !== null) {
      await sleep(2000);
      castState = await readWall();
    }
  }
  const samePage = !!castState && castState.origin === firstRead?.origin && castState.age - mirrorAt >= 1500;
  /** The projector page's longest animation frame begun before `by`, and how much of it was script. */
  function held(state, by) {
    if (!Array.isArray(state?.frames)) return 'its frames not kept';
    const before = state.frames.filter((f) => f.start < by);
    if (!before.length) return 'no long frame before it';
    const f = before.reduce((a, b) => (b.duration > a.duration ? b : a));
    return `its longest frame before then ${(f.duration / 1000).toFixed(2)} s from ${(f.start / 1000).toFixed(2)} s, ${Math.round(f.script)} ms of it script`;
  }
  // Where the page asked for the window: the stand-in's left edge, not the
  // laptop's. Which real display main.js then puts it on needs a real
  // projector (docs/judging.md §26).
  const asked = await electronApp.evaluate(() => globalThis.__chromaglassOpened?.at(-1) ?? null);
  const askedLeft = Number(/(?:^|,)left=(-?\d+)/.exec(asked ?? '')?.[1]);
  const aimed = standIn === null || askedLeft === standIn;
  const chip = await page.locator('[data-testid=projector-fill]').count();
  check('projector: a second screen gets the show, with no click, filling its screen',
    !!cast && aimed && mirrorAt !== null && samePage && castState.linked && castState.casts === 1 && !!castState.full && !castState.hint && !!castState.mirror && castState.root > 0 && chip === 0,
    !cast
      ? 'no projector window opened'
      : mirrorAt !== null && !samePage
      ? `the mirror's canvas up ${(mirrorAt / 1000).toFixed(2)} s after the page opened, then ${!castState ? 'the second read, 2 s later, got no answer from the projector window' : `the second read was of ${castState.origin !== firstRead.origin ? 'another page (the window reloaded or navigated)' : `the page only ${((castState.age - mirrorAt) / 1000).toFixed(2)} s after the mirror`}`}, so the click hint was never judged`
      : `opened ${cast.url.replace(/^http:\/\/localhost:\d+/, '')} at left=${askedLeft}${standIn === null ? '' : ` (the stand-in's edge is ${standIn})`}; ${castState?.casts ?? '?'} projector window(s), page full screen ${castState?.full}, window full screen ${castState?.windowFull}, the show window ${castState?.linked ? 'there to mirror' : 'gone'}, the mirror's canvas ${mirrorAt !== null ? `up ${(mirrorAt / 1000).toFixed(2)} s after the page opened (${held(castState, mirrorAt)})` : `missing at ${((castState?.age ?? 0) / 1000).toFixed(2)} s (${held(castState, Infinity)}; ${castState?.canvas ? 'a canvas, but not the mirror\'s' : `no canvas, ${castState?.root ?? 0} in the root`}; scripts in by ${castState?.scripts?.join(', ') || 'none'})`}, click hint on the wall ${castState?.hint}${mirrorAt !== null ? ` ${((castState.age - mirrorAt) / 1000).toFixed(1)} s after it` : ''}, title-bar chip on the laptop ${chip > 0}`);
  // The owner's ask of 2026-10-04: no pointer on the wall, however the mouse
  // gets there (index.html's `show-screen`; `npm run showcursor` asks it of
  // the web's projector window and a receiver, with the mouse moving).
  check('projector: no pointer on the wall',
    // On the page itself, not just its <head>: a page that never drew has
    // nothing to point at and would pass on its 24 head elements alone.
    !!castState && castState.root > 0 && castState.mirror && castState.pointer.length === 0,
    castState ? (castState.pointer.length ? `a pointer on ${castState.pointer.join(', ')}` : `none on ${castState.elements} elements`) : 'no projector window opened');

  // ── system audio & ambient TV (23.8) ───────────────────────────────
  // On the Mac app, "System audio" replaces "Another tab", intercepts
  // getDisplayMedia with no tab picker, and routes the System audio source's
  // pipeline to the ear (fed here through CHROMAGLASS_AUDIO_TAP=1, since
  // CHROMAGLASS_OFFLINE skips macOS TCC screen capture; the real
  // ScreenCaptureKit path is docs/judging.md §87). Ambient TV mode caps the
  // solver at 30 steps/s, caps frames drawn in the app at 60 Hz through
  // DrawGate, and holds the machine's opening rung.
  await page.locator('[data-testid=mode-segmented-setup]').click();
  await page.locator('[data-testid=sound-source-system]').waitFor({ timeout: 5_000 });
  const sysLabel = (await page.locator('[data-testid=sound-source-system]').textContent())?.trim() ?? '';
  const asksBefore = await electronApp.evaluate(() => globalThis.__chromaglassSystemAudioAsks ?? 0);
  /*
    The tone, and when the ear is read. Until 2026-10-26 the check sent 1.2 s
    of tone in 0.56 s (a child process, run to its end) and read the ear once,
    the moment it returned: about 0.9 s after the click. The packed app on
    e1380fa read "ear reads 9, volume 0" there, with the picker intercepted and
    the tap open, and the same app built the same way, packed and unpacked, in
    a cloud session read 61 and 46. Nothing on the audio path changed between
    the run that passed (033c845) and that one. What that one read is a moment:
    the first sound the page makes in a run starts Chromium's audio service and
    the Mac's output device, and both of the System audio source's contexts
    (the tap's and the ear's) count no time and pass no sound until it is up.
    A runner that takes longer than 0.9 s to get there read silence, however
    well the pipeline worked.

    So the tone plays in real time (one 2048-sample packet every 40 ms, a hair
    ahead of 42.7 ms of sound, so the tap's queue never runs dry) for as long
    as the ear has not heard it, up to TONE_DEADLINE_MS, and the ear is read
    every 100 ms meanwhile. The bar is as it was, a reading above 5 with the
    picker intercepted. The line prints what the old one could not: both
    contexts' states and the ear's volume at the old moment, and when each
    context first ran and the ear first heard. A pipeline that does not reach
    the ear still fails, after the deadline, with the contexts' states saying
    whether it was the sound that never started or the wiring.
  */
  const TONE_DEADLINE_MS = 10_000;
  await page.locator('[data-testid=sound-source-system]').click();
  const clickedAt = Date.now();
  const audioPort = await electronApp.evaluate(() => globalThis.__chromaglassAudioPort ?? 0);
  const toneSock = createSocket('udp4');
  const pkt = Buffer.alloc(12 + 2048 * 4);
  pkt.write('CGPCM1\0\0', 0, 8, 'ascii');
  pkt.writeUInt32LE(48000, 8);
  let phase = 0;
  let sent = 0;
  const toneTimer = audioPort > 0 ? setInterval(() => {
    for (let i = 0; i < 2048; i++) {
      pkt.writeFloatLE(Math.sin(phase) * 0.85, 12 + i * 4);
      phase += (2 * Math.PI * 220) / 48000;
    }
    toneSock.send(pkt, audioPort, '127.0.0.1');
    sent++;
  }, 40) : null;
  const readEar = () => page.evaluate(() => {
    const cs = window.chromaglassCastState?.();
    const r = cs?.ear?.reads;
    return {
      reads: r ? (r.frame ?? 0) + (r.ask ?? 0) + (r.tick ?? 0) : 0,
      volume: cs?.audio?.volume ?? 0,
      ear: cs?.ear?.state ?? 'none',
      tap: window.__systemTapContext?.state ?? 'none',
    };
  }).catch(() => ({ reads: 0, volume: 0, ear: 'unread', tap: 'unread' }));
  const ms = () => Date.now() - clickedAt;
  let atOldMoment = null;
  let earRanAt = null;
  let tapRanAt = null;
  let soundHeard = { reads: 0, volume: 0, ear: 'none', tap: 'none' };
  let heardAt = null;
  while (ms() < TONE_DEADLINE_MS) {
    soundHeard = await readEar();
    const t = ms();
    if (atOldMoment === null && t >= 900) atOldMoment = { t, ...soundHeard };
    if (earRanAt === null && soundHeard.ear === 'running') earRanAt = t;
    if (tapRanAt === null && soundHeard.tap === 'running') tapRanAt = t;
    if (soundHeard.reads > 0 && soundHeard.volume > 5) { heardAt = t; break; }
    await sleep(100);
  }
  if (toneTimer) clearInterval(toneTimer);
  toneSock.close();
  const asksAfter = await electronApp.evaluate(() => globalThis.__chromaglassSystemAudioAsks ?? 0);
  const when = (t) => (t === null ? 'never' : `${(t / 1000).toFixed(2)} s`);
  const systemHeard =
    sysLabel === 'System audio' &&
    audioPort > 0 &&
    sent > 0 &&
    asksAfter > asksBefore &&
    heardAt !== null;
  check(
    'system audio: the System audio source\'s pipeline reaches the ear, and the picker was intercepted',
    systemHeard,
    `label "${sysLabel}", picker intercepted ${asksAfter - asksBefore} time(s), audio port ${audioPort}, ${sent} packets sent; ` +
      `${heardAt !== null ? `heard ${when(heardAt)} after the click` : `not heard in ${TONE_DEADLINE_MS / 1000} s`}, ear reads ${soundHeard.reads}, volume ${Math.round(soundHeard.volume)}; ` +
      `the contexts ran at ${when(tapRanAt)} (tap) and ${when(earRanAt)} (ear); ` +
      `at ${atOldMoment ? when(atOldMoment.t) : 'the old moment (not reached)'}, where the line used to read: ${atOldMoment ? `tap ${atOldMoment.tap}, ear ${atOldMoment.ear}, volume ${Math.round(atOldMoment.volume)}` : 'heard before it'}`,
  );

  // The ladder's governor exists once the renderer is up; the line below
  // fails a show without one, so wait for it to be there before the toggle
  // rather than read it in the instant the System audio step has just left
  // (the first packed run on CI found none, 96975ef).
  const governorUp = await page
    .waitForFunction(() => Boolean(window.chromaglassGovernor?.()), null, { timeout: 15000 })
    .then(() => true, () => false);
  await page.locator('[data-testid=sound-ambient-toggle]').click();
  const ambOn = await page.evaluate(async () => {
    const g = window.chromaglassGovernor?.();
    const hadGovernor = Boolean(g);
    const dbg0 = window.chromaglassDebug?.();
    const dg0 = dbg0?.drawGate;
    const frames0 = dbg0?.frames ?? 0;
    const drawn0 = (dg0?.drawn?.frame ?? 0) + (dg0?.drawn?.ask ?? 0);
    const skipped0 = (dg0?.skipped?.frame ?? 0) + (dg0?.skipped?.ask ?? 0);
    const t0 = performance.now();
    let tick = 1;
    await new Promise((done) => {
      const iv = setInterval(() => {
        const now = performance.now();
        while (t0 + tick * (1000 / 120) <= now && tick <= 120) {
          window.__chromaglassFrame?.(t0 + tick * (1000 / 120));
          tick++;
        }
        if (now - t0 >= 1000 || tick > 120) {
          clearInterval(iv);
          done();
        }
      }, 8);
    });
    const cs1 = window.chromaglassCastState?.();
    const dbg1 = window.chromaglassDebug?.();
    const dg1 = dbg1?.drawGate;
    const frames = (dbg1?.frames ?? 0) - frames0;
    const drawn = (dg1?.drawn?.frame ?? 0) + (dg1?.drawn?.ask ?? 0) - drawn0;
    const skipped = (dg1?.skipped?.frame ?? 0) + (dg1?.skipped?.ask ?? 0) - skipped0;
    return {
      ambient: Boolean(cs1?.ambient),
      hadGovernor,
      stepRate: g?.stepRate ?? null,
      rungIndex: g?.rungIndex ?? null,
      start: g?.start ?? null,
      frames,
      drawn,
      skipped,
    };
  });
  const mainAmb = await electronApp.evaluate(() => Boolean(globalThis.__chromaglassAmbient));
  await page.locator('[data-testid=sound-ambient-toggle]').click();
  const ambOff = await page.evaluate(() => {
    const g = window.chromaglassGovernor?.();
    const cs = window.chromaglassCastState?.();
    return {
      ambient: Boolean(cs?.ambient),
      stepRate: g?.stepRate ?? null,
    };
  });
  await page.locator('[data-testid=sound-source-none]').click();
  await page.keyboard.press('Escape');
  // The ceiling is the feature (60 a second on a 120 Hz offer); the floor only
  // says the plate is still drawing, not stalled. It was 20, which measured the
  // runner: the packed run on 3c24c37 drew 15 a second and stepped the governor
  // down a rung while a neighbouring job loaded the machine, and the packed run
  // on 96975ef drew 59 with the same code. The 120 Hz cap itself is counted
  // on a clock the machine's speed cannot touch in `npm run rungs`.
  const drawCapped =
    ambOn.frames <= 65 &&
    ambOn.drawn <= 65 &&
    ambOn.skipped >= 45 &&
    (!isMac || (ambOn.frames >= 5 && ambOn.drawn >= 5));
  const ambientWorks =
    ambOn.ambient === true &&
    ambOn.stepRate === 30 &&
    // A null is a show with no governor, which the Mac app never is: it fails.
    ambOn.rungIndex !== null && ambOn.start !== null && ambOn.rungIndex >= ambOn.start &&
    mainAmb === true &&
    drawCapped &&
    ambOff.ambient === false &&
    ambOff.stepRate === 60;
  check(
    'ambient TV: caps solver at 30 steps/s, display at 60 Hz, and holds the opening rung',
    ambientWorks,
    `governor up before the toggle ${governorUp}, in the page ${ambOn.hadGovernor}; on: ambient=${ambOn.ambient}, stepRate=${ambOn.stepRate}, rung=${ambOn.rungIndex}/${ambOn.start}, drawn=${ambOn.drawn}/s (frames=${ambOn.frames}/s, skipped=${ambOn.skipped} of 120 Hz offers), menu=${mainAmb}; off: ambient=${ambOff.ambient}, stepRate=${ambOff.stepRate}`,
  );

  // ── updates ────────────────────────────────────────────────────────
  if (!feed) {
    skip('updates: the app finds a new release and offers it', 'run from the repo, where the app does not look (add --packaged)');
  } else {
    const deadline = Date.now() + 30_000;
    let up = null;
    while (Date.now() < deadline) {
      up = await electronApp.evaluate(() => globalThis.__chromaglassUpdate ?? null).catch(() => null);
      if (up && ['available', 'downloading', 'ready', 'none', 'error'].some((s) => up.history?.includes(s))) break;
      await sleep(250);
    }
    const labels = await electronApp.evaluate(({ Menu }) => (Menu.getApplicationMenu()?.items ?? []).flatMap((i) => i.submenu?.items ?? []).map((i) => i.label)).catch(() => []);
    const pageSees = await page.evaluate(() => window.__CHROMAGLASS_NATIVE__?.updates?.state?.().catch(() => null) ?? null).catch(() => null);
    const pushed = Array.isArray(pushes) && pushes.some((p) => /^(available|downloading|ready) 999\.0\.0$/.test(p));
    const found = !!up && up.version === '999.0.0' && (up.history.includes('available') || up.history.includes('downloading'));
    const offered = up?.signed ? labels.some((l) => /ChromaGlass 999\.0\.0|Update to 999\.0\.0/.test(l)) : labels.includes('Download ChromaGlass 999.0.0…');
    const asked = feedAsked.find((u) => /latest/.test(u));
    check('updates: the app finds a new release and offers it, in the menu and to the page',
      found && offered && !!asked && pageSees?.version === '999.0.0' && pageSees?.current === up?.current && pushed,
      `${up ? `${up.current} → ${up.version ?? 'nothing'} (${up.history.join(' → ')}${up.error ? `; ${up.error}` : ''}), ${up.signed ? 'signed' : 'ad hoc'}` : 'no updater state'}; feed asked for ${asked ?? 'nothing'}; menu ${labels.find((l) => /Update|ChromaGlass \d/.test(l)) ?? 'has no update item'}; the page sees ${pageSees ? `${pageSees.status} ${pageSees.version}` : 'nothing'}, and was told ${pushes?.length ? pushes.join(' → ') : 'nothing'}`);
  }

  // ── the two Workers the app's site is built to reach (PLAN 23.17e) ──
  // desktop.yml built the app's site without VITE_FINGERPRINT_PROXY_URL or
  // VITE_CRASH_REPORT_URL until 23.17e, so Home's song ID (sold as "in the
  // ChromaGlass app") could not run in the app and its crash sheet had only
  // Save and Copy. The line reads both addresses out of the bundles the app's
  // own page loaded, not out of the environment, so a build that dropped them
  // fails here whatever this run's env says, and then asks each Worker, as the
  // page's origin, whether it answers the app. The addresses come from the same
  // secrets deploy.yml uses. One that is unset has nothing to look for (the
  // crash report Worker was never deployed, so its secret is empty, and the
  // line says so in its row rather than naming it a pass); a run with neither
  // (a fork's, or a session's) skips.
  {
    const want = { song: process.env.VITE_FINGERPRINT_PROXY_URL, crash: process.env.VITE_CRASH_REPORT_URL };
    if (!want.song && !want.crash) {
      skip("workers: each address this run was given (song ID, crash report) is in the app's build, and its Worker answers the app's origin", 'this run has neither VITE_FINGERPRINT_PROXY_URL nor VITE_CRASH_REPORT_URL (desktop.yml passes both from the repository secrets)');
    } else {
      const bundles = await page.evaluate(async () => {
        const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => /\.js(\?|$)/.test(u));
        const out = [];
        for (const u of urls) out.push(await fetch(u).then((r) => r.text()).catch(() => ''));
        return out;
      }).catch(() => []);
      const origin = `http://localhost:${PORT}`;
      const rows = [];
      let all = bundles.length > 0;
      // What each request really sends: the song ID's is FormData with the key
      // in X-ChromaGlass-Key (fingerprint.ts), the crash report's is JSON.
      const asks = { song: 'x-chromaglass-key', crash: 'content-type' };
      for (const [name, url] of Object.entries(want)) {
        if (!url) { rows.push(`${name}: no address in this run (its repository secret is unset), so nothing to look for`); continue; }
        const carried = bundles.some((t) => t.includes(url));
        const reply = await fetch(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': asks[name] } }).catch(() => null);
        const allowed = reply?.headers.get('access-control-allow-origin');
        const answers = !!reply && reply.status < 300 && (allowed === origin || allowed === '*');
        rows.push(`${name}: ${carried ? 'in the build' : 'MISSING from the build'}, preflight from ${origin} ${reply ? `${reply.status}, allows ${allowed ?? 'nothing'}` : 'got no answer'}`);
        all = all && carried && answers;
      }
      check("workers: each address this run was given (song ID, crash report) is in the app's build, and its Worker answers the app's origin", all,
        `${bundles.length} bundles read; ${rows.join('; ')}`);
    }
  }

  // ── network off, the whole run ────────────────────────────────────
  // The two Workers (23.17e) are the app's deliberate online features: with the
  // song ID's address in the build, the System audio phase's tone is heard by the
  // music intelligence, which asks the Worker what is playing, and the guard
  // refuses it. That refusal is the guard doing its job and the page carrying on
  // without a name, so it is not something the show "had to" fetch.
  const workerHosts = [process.env.VITE_FINGERPRINT_PROXY_URL, process.env.VITE_CRASH_REPORT_URL].filter(Boolean).map((u) => { try { return new URL(u).host; } catch { return null; } }).filter(Boolean);
  const outside = (await refusedList()).filter((b) => !b.url.includes('desktop-probe') && !workerHosts.some((h) => { try { return new URL(b.url).host === h; } catch { return false; } }));
  check("network off: nothing the show's pages asked for had to come from outside", probeSeen && outside.length === 0,
    !probeSeen ? 'the guard never refused the probe, so it saw nothing' : outside.length ? outside.slice(0, 6).map((b) => `${b.type} ${b.url}`).join(', ') : 'every request the pages made was to the app itself');

  // ── quits ──────────────────────────────────────────────────────────
  const projectorOpen = (await allWindows()).some((w) => /[?&]cast=/.test(w.url));
  await electronApp.evaluate(({ BrowserWindow }, find) => { new Function('BrowserWindow', `return ${find}`)(BrowserWindow)?.close(); }, SHOW_WINDOW);
  const exited = await new Promise((done) => {
    const p = electronApp.process();
    if (p.exitCode !== null) return done(true);
    const t = setTimeout(() => done(false), 15_000);
    p.once('exit', () => { clearTimeout(t); done(true); });
  });
  const freed = await new Promise((done) => {
    const s = createServer();
    s.once('error', () => done(false));
    s.listen(PORT, '0.0.0.0', () => s.close(() => done(true)));
  });
  check('quits: closing the show, with the projector open, quits the app and frees its port', projectorOpen && exited && freed, `${projectorOpen ? 'with the projector window open, ' : ''}${exited ? 'exited' : 'still running'}, port ${PORT} ${freed ? 'free' : 'still taken'}`);
} catch (err) {
  check('the run finished', false, err?.message ?? String(err));
  if (output) console.log(`\n  The app said:\n${output.split('\n').slice(-30).map((l) => `    ${l}`).join('\n')}`);
} finally {
  openFeed();
  await electronApp.close().catch(() => {});
  feed?.close();
  rmSync(profile, { recursive: true, force: true });
}

/*
  ── licence ──────────────────────────────────────────────────────────
  The same app with no key, signed out, on a profile of its own: the door
  (AppLicenceGate.tsx) and no plate behind it, which before 23.17d was the
  whole show, free, for every download. And when the site was built as the app
  ships it (VITE_MAC_APP=1, desktop.yml), a plain browser opened on the app's
  server meets the same door: without that, Chrome at localhost:<port> was the
  show for free beside a locked app. The licensed run above is the other half:
  it opened on its key with the gate never drawn (`opens`).
*/
{
  const bare = mkdtempSync(join(tmpdir(), 'chromaglass-desktop-bare-'));
  const barePort = await freePort('tcp');
  const bareEnv = { ...env, PORT: String(barePort), OSC_PORT: String(await freePort('udp')), CHROMAGLASS_USER_DATA: bare };
  delete bareEnv.CHROMAGLASS_LICENSE_KEY;
  // Packed, the app must raise the door by itself: nothing tells it to. And
  // it is handed a Pro key a stranger could sign, with the word to trust it.
  if (PACKAGED) {
    delete bareEnv.CHROMAGLASS_REQUIRE_SIGNIN;
    bareEnv.LICENSE_PUBLIC_KEY = LIC_PUBLIC;
    bareEnv.CHROMAGLASS_LICENSE_KEY = SELF_SIGNED;
  }
  delete bareEnv.CHROMAGLASS_UPDATE_FEED;
  let second = null;
  try {
    second = await electron.launch({ executablePath: app.executablePath, args: [...app.args, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env: bareEnv, timeout: 60_000 });
    const page = await second.firstWindow({ timeout: 60_000 });
    const door = await page.waitForSelector('[data-cg-app-licence]', { state: 'visible', timeout: 60_000 }).then(() => true, () => false);
    await sleep(3000);
    const said = await page.evaluate(() => document.querySelector('[data-cg-app-licence]')?.getAttribute('data-cg-app-licence') ?? null).catch(() => null);
    const plate = await page.locator('#liquid-canvas').count().catch(() => 0);
    const native = await page.evaluate(() => ({ asks: !!window.__CHROMAGLASS_NATIVE__?.requireSignIn, valid: !!window.__CHROMAGLASS_NATIVE__?.license?.valid, browser: typeof window.__CHROMAGLASS_NATIVE__?.openInBrowser === 'function' })).catch(() => null);
    check(`licence: with ${PACKAGED ? 'only a self-signed key, and the word to trust it,' : 'no key'} the app shows its door, asks for a sign-in, and starts no plate`, door && said === 'signin' && plate === 0 && native?.asks && !native.valid && native.browser,
      `door ${door ? `drawn (${said})` : 'never drawn'}, plate canvas ${plate ? 'THERE' : 'absent'}, the shell ${native ? `${native.asks ? 'asks for a licence' : 'asks nothing'}, licence ${native.valid ? 'valid' : 'none'}, ${native.browser ? 'can' : 'cannot'} open the browser` : 'unread'}`);
    if (process.env.VITE_MAC_APP !== '1') {
      skip('licence: a browser on the app\'s server meets the same door', 'the site in dist/ was not built as the app ships it (VITE_MAC_APP=1, desktop.yml)');
    } else {
      // The browser is a window the app's own Chromium opens with none of
      // the app's preload, in a session of its own: the page meets no shell,
      // as in Chrome (the Mac runner has no Playwright browser of its own).
      const plainUrl = `http://localhost:${barePort}/show?debug`;
      await second.evaluate(({ BrowserWindow }, u) => {
        const w = new BrowserWindow({ show: true, width: 1024, height: 700, webPreferences: { partition: 'cg-plain-browser', contextIsolation: true, sandbox: true } });
        void w.loadURL(u);
      }, plainUrl);
      const bp = await second.waitForEvent('window', { predicate: (w) => w.url().startsWith(plainUrl), timeout: 30_000 }).catch(() => null)
        ?? second.windows().find((w) => w.url().startsWith(plainUrl)) ?? null;
      const shell = bp ? await bp.evaluate(() => !!window.__CHROMAGLASS_NATIVE__).catch(() => true) : true;
      const browserDoor = !!bp && await bp.waitForSelector('[data-cg-app-licence]', { state: 'visible', timeout: 60_000 }).then(() => true, () => false);
      await sleep(3000);
      const browserPlate = bp ? await bp.locator('#liquid-canvas').count().catch(() => 0) : 0;
      check('licence: a browser on the app\'s server meets the same door, and no plate', !!bp && !shell && browserDoor && browserPlate === 0,
        !bp ? 'the plain window never opened' : `${shell ? 'the window had the app\'s shell, so it was no plain browser; ' : ''}door ${browserDoor}, plate canvas ${browserPlate ? 'THERE' : 'absent'}`);
    }
  } catch (err) {
    check('licence: the keyless run finished', false, err?.message ?? String(err));
  } finally {
    await second?.close().catch(() => {});
    rmSync(bare, { recursive: true, force: true });
  }
}

/*
  ── OSC is closed until the performer opens it ───────────────────────
  PLAN 23.17m, the security audit of 2026-10-28 (finding 4). OSC is UDP with
  no show key, so whoever shares the venue's Wi-Fi and sends the Mac a packet
  drives the show; the app used to listen on every interface from the first
  launch. Read here from the main process (`globalThis.__chromaglassOsc`,
  which says the choice and what the socket did with it) and from the world's
  side: a plain socket asked to bind the port, which a listener (it holds the
  port with SO_REUSEADDR) turns away. The menu item is clicked in the app, not
  the setting written to a file, so the click handler is what is under test.
*/
{
  const dir = mkdtempSync(join(tmpdir(), 'chromaglass-desktop-osc-'));
  const oscPort = await freePort('udp');
  const oscEnv = { ...env, PORT: String(await freePort('tcp')), CHROMAGLASS_USER_DATA: dir, CHROMAGLASS_OSC_PORT: String(oscPort) };
  for (const k of ['OSC_PORT', 'OSC_BIND', 'CHROMAGLASS_UPDATE_FEED', 'CHROMAGLASS_QUERY']) delete oscEnv[k];
  const open = () => electron.launch({ executablePath: app.executablePath, args: [...app.args, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], env: oscEnv, timeout: 60_000 });
  const stateOf = async (a) => {
    for (let i = 0; i < 300; i++) {
      const s = await a.evaluate(() => globalThis.__chromaglassOsc ?? null).catch(() => null);
      if (s) return s;
      await sleep(200);
    }
    return null;
  };
  /** Can this check take the port for itself? A listener on it, even one with SO_REUSEADDR, says no to a socket that does not share. */
  const portIsFree = () => new Promise((done) => {
    const probe = createSocket('udp4');
    probe.once('error', () => { probe.close(); done(false); });
    probe.bind(oscPort, '0.0.0.0', () => { probe.close(() => done(true)); });
  });
  const pick = (a, id) => a.evaluate(({ Menu }, i) => { Menu.getApplicationMenu().getMenuItemById(i).click(); }, id);
  const settle = async (a, want) => {
    for (let i = 0; i < 50; i++) {
      const s = await a.evaluate(() => globalThis.__chromaglassOsc ?? null).catch(() => null);
      if (s && s.state !== undefined && want(s)) return s;
      await sleep(100);
    }
    return a.evaluate(() => globalThis.__chromaglassOsc ?? null).catch(() => null);
  };
  let first = null;
  let again = null;
  try {
    first = await open();
    const start = await stateOf(first);
    const freeAtStart = await portIsFree();
    check('OSC closed: a new app listens for no OSC on its port', start?.mode === 'off' && start.state === 'off' && freeAtStart,
      `choice ${start?.mode ?? 'unread'}, socket ${start?.state ?? 'unread'}, port ${oscPort} ${freeAtStart ? 'free' : 'TAKEN'}`);

    await pick(first, 'osc-local');
    const local = await settle(first, (s) => s.mode === 'local' && /^udp /.test(s.state));
    const heldLocal = !(await portIsFree());
    await pick(first, 'osc-network');
    const net = await settle(first, (s) => s.mode === 'network' && /^udp /.test(s.state));
    await pick(first, 'osc-off');
    const off = await settle(first, (s) => s.mode === 'off' && s.state === 'off');
    const freeAgain = await portIsFree();
    check('OSC closed: Show > OSC input opens it for this Mac only (127.0.0.1) or the network (0.0.0.0), and closes it, with no restart',
      local?.state === `udp 127.0.0.1:${oscPort}` && heldLocal && net?.state === `udp 0.0.0.0:${oscPort}` && off?.state === 'off' && freeAgain,
      `this Mac only: ${local?.state ?? 'unread'} (port ${heldLocal ? 'held' : 'NOT held'}); network: ${net?.state ?? 'unread'}; off: ${off?.state ?? 'unread'} (port ${freeAgain ? 'free' : 'STILL TAKEN'})`);

    await pick(first, 'osc-local');
    await settle(first, (s) => s.mode === 'local');
    await first.close().catch(() => {});
    first = null;
    oscEnv.PORT = String(await freePort('tcp'));
    again = await open();
    const kept = await stateOf(again);
    check('OSC closed: the choice is kept for the next launch', kept?.mode === 'local' && kept.state === `udp 127.0.0.1:${oscPort}`,
      `after a restart: ${kept?.mode ?? 'unread'}, ${kept?.state ?? 'unread'}`);
  } catch (err) {
    check('OSC closed: the run finished', false, err?.message ?? String(err));
  } finally {
    await first?.close().catch(() => {});
    await again?.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
}

/*
  ── a packed app takes no debugger ───────────────────────────────────
  PLAN 23.17m (finding 9). No fuse covers Chromium's --remote-debugging-port,
  and a page that can be attached to is a licence gate that can be stepped
  past, so a packed app launched with it quits at once (desktop/main.js). The
  same binary launched without it must serve, or "it quit" would mean nothing:
  it might simply not have started. (Playwright's own launch passes the flag
  too, and its loader takes it out of process.argv before the app runs; every
  other line here is that launch.)
*/
if (!PACKAGED) {
  skip('no debugger: the packed app quits when launched with --remote-debugging-port', 'run from the repo, where the guard is off (add --packaged)');
} else {
  const run = async (args) => {
    const dir = mkdtempSync(join(tmpdir(), 'chromaglass-desktop-debug-'));
    const port = await freePort('tcp');
    const e = { ...env, PORT: String(port), OSC_PORT: '0', CHROMAGLASS_USER_DATA: dir };
    delete e.CHROMAGLASS_UPDATE_FEED;
    const child = launchProcess(app.executablePath, [...app.args, ...args, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])], { env: e, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let exit = null;
    child.once('exit', (code, signal) => { exit = { code, signal }; });
    let served = false;
    for (const t0 = Date.now(); !exit && !served && Date.now() - t0 < 45_000;) {
      served = await fetch(`http://localhost:${port}/remote-info.json`, { signal: AbortSignal.timeout(1000) }).then((r) => r.ok, () => false);
      if (!served) await sleep(400);
    }
    if (served) await sleep(500);
    else if (!exit) await sleep(3000);
    const quit = exit !== null;
    if (!exit) child.kill('SIGKILL');
    // Chromium's helpers can still be writing to the profile for a moment after the main process is gone.
    await sleep(500);
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    return { served, quit, exit, out };
  };
  const plain = await run([]);
  const debugged = await run(['--remote-debugging-port=0']);
  const piped = await run(['--remote-debugging-pipe']);
  // Chromium reads a single dash as the same switch; a review found -remote-debugging-port=9333 opened DevTools past a guard that matched `--`.
  const single = await run(['-remote-debugging-port=0']);
  check('no debugger: the packed app serves when launched plainly, and quits when launched with --remote-debugging-port, -pipe or the single-dash spelling, serving nothing',
    plain.served && !debugged.served && debugged.quit && debugged.exit?.code === 1 && !piped.served && piped.quit && piped.exit?.code === 1 &&
    !single.served && single.quit && single.exit?.code === 1,
    `plain: ${plain.served ? 'served' : 'NEVER SERVED'}; --remote-debugging-port: ${debugged.served ? 'SERVED' : debugged.quit ? `quit (${debugged.exit?.code})` : 'still running'}; -pipe: ${piped.served ? 'SERVED' : piped.quit ? `quit (${piped.exit?.code})` : 'still running'}; -remote-debugging-port: ${single.served ? 'SERVED' : single.quit ? `quit (${single.exit?.code})` : 'still running'}`);
}

/*
  ── the hardened runtime's exceptions are the three it needs ─────────
  PLAN 23.17m (finding 13). disable-library-validation and allow-unsigned-
  executable-memory let code that is not ours load into a process that holds
  the microphone and the camera, and Electron's JIT needs allow-jit alone. The
  signature is read for what it carries, and the app as signed is started: a
  signature without them is a claim until the app runs on it. Whether the
  hardened runtime was actually in force says whether that start proves
  anything: a pull request's build is signed ad hoc with none (desktop.yml), and
  the line says so rather than passing for it.
*/
if (!PACKAGED || !isMac) {
  skip('entitlements: the signed app carries no disable-library-validation or allow-unsigned-executable-memory, and still starts', !PACKAGED ? 'run from the repo (add --packaged)' : 'macOS only: codesign');
} else {
  const bundle = resolve(app.executablePath, '..', '..', '..');
  const ents = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', bundle], { encoding: 'utf8' });
  const keys = [...String(ents.stdout ?? '').matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
  const flags = spawnSync('codesign', ['-dv', bundle], { encoding: 'utf8' });
  const hardened = /flags=0x[0-9a-f]+\([^)]*runtime/.test(`${flags.stderr}${flags.stdout}`);
  const loose = keys.filter((k) => /disable-library-validation|allow-unsigned-executable-memory/.test(k));
  const needs = ['com.apple.security.cs.allow-jit'];
  check('entitlements: the signature carries no disable-library-validation or allow-unsigned-executable-memory, and keeps allow-jit',
    ents.status === 0 && loose.length === 0 && needs.every((k) => keys.includes(k)),
    `${keys.length ? keys.map((k) => k.replace('com.apple.security.', '')).join(', ') : 'no entitlements read'}${loose.length ? `; LOOSE: ${loose.join(', ')}` : ''}; hardened runtime ${hardened ? 'on, so the start above ran on exactly these' : 'OFF in this build (ad hoc), so the start above proves nothing about them: the signed release run does'}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
