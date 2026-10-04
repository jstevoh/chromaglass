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
 *   quits         closing the show window, with the projector open, quits
 *                 the app and frees the port
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
import { spawnSync } from 'node:child_process';
import { createSocket } from 'node:dgram';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
console.log(`The app ${app.label}; port ${PORT}, OSC ${OSC_PORT}, a new profile, the network off.\n`);

const env = {
  ...process.env,
  PORT: String(PORT),
  OSC_PORT: String(OSC_PORT),
  CHROMAGLASS_USER_DATA: profile,
  CHROMAGLASS_OFFLINE: '1',
  CHROMAGLASS_QUERY: QUERY,
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
  check('opens: the show, from the server inside the app', url === `http://localhost:${PORT}/${QUERY}` && canvas === 1,
    `${url}, ${canvas ? 'the plate canvas is there' : 'no plate canvas'}`);

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

  // ── network off, the whole run ────────────────────────────────────
  const outside = (await refusedList()).filter((b) => !b.url.includes('desktop-probe'));
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
  await electronApp.close().catch(() => {});
  rmSync(profile, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `; failed: ${failed.map((f) => f.name).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
