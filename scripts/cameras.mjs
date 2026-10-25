#!/usr/bin/env node
/**
 * Any camera, anywhere a camera is used; and the motion camera told apart
 * from the film's Webcam (PLAN.md 14ad).
 *
 *   npm run cameras            # builds, then about a minute, in a cloud session too
 *
 * What was reported (the owner, 2026-10-24): the film's camera button "only
 * uses my laptop camera", and nothing said how the room control differed from
 * showing video on the plate. What main did before the change (read from
 * its code; this check's names did not exist there to run it against):
 *
 *   - the film's camera opened with `facingMode: 'environment'` and no device,
 *     every time: there was no picker to choose the second camera with;
 *   - the room's picker was drawn only once that camera was on and only with
 *     two cameras listed, so before switching it on there was nothing to pick;
 *   - a camera pulled out left the room camera reading "opening…" and the
 *     film reading "camera live" over a dead track, and neither came back.
 *
 * So this asks, in the built app, on the desk at 1440x900 and on a phone:
 *
 *   names     the room's section is called what it does (Motion camera) and
 *             says its picture is never shown; the film's camera says it shows
 *             a picture on the plate, and each points at the other
 *   pickers   both drawn before any camera is on (saying why there are no
 *             names yet), and both naming every camera once one is allowed
 *   choice    the film opens the camera picked, by id; the motion camera the
 *             one picked for it; each choice survives a reload, apart
 *   unplug    a camera pulled out takes its source off and says so; plugged
 *             back in, the same camera opens again by itself
 *   missing   a chosen camera not plugged in opens the browser's pick, says
 *             so, and hands over to the chosen one when it arrives
 *   phone     both pickers are on the phone's Settings, on screen, a thumb's
 *             height
 *
 * The cameras are stand-ins: `navigator.mediaDevices` answers with two
 * cameras whose streams are a canvas, and a camera is pulled out the way the
 * browser does it, by ending its track and firing `devicechange`. Until a
 * camera has been allowed they are listed the way Chrome lists them before
 * permission, one entry with no id and no name (the review of this check: a
 * stand-in that named its cameras from the start measured a first visit the
 * owner's laptop never shows, and a picker hidden until permission passed). That is the
 * part of the browser this code talks to. What it cannot show is a real
 * driver's timing (some cameras take a second to reappear after replugging),
 * which the reopen does not depend on: it waits for the list, not a clock.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.CAMERAS_PORT ?? 4199);
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35&play=0`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const notes = [];
async function serve() {
  const proc = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview',
    '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  await new Promise((resolve, reject) => {
    const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
    proc.stdout.on('data', d => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
    proc.stderr.on('data', d => { notes.push(String(d).trim()); });
    proc.on('exit', c => { clearTimeout(bail); reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`)); });
  });
  return proc;
}
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

/*
  The stand-in cameras. Installed before the app's own code runs, so every
  `enumerateDevices` and `getUserMedia` the app makes is answered here and
  written down in `window.__opened`: which id was asked for (or '' for the
  browser's pick), the facing hint, and which camera answered.
*/
const STAND_INS = () => {
  const md = navigator.mediaDevices;
  const realGum = md.getUserMedia.bind(md);
  const plugged = [
    { deviceId: 'cam-laptop', groupId: 'g1', kind: 'videoinput', label: 'Laptop Camera' },
    { deviceId: 'cam-usb', groupId: 'g2', kind: 'videoinput', label: 'USB Capture' },
  ];
  const all = [...plugged];
  window.__opened = [];
  const live = [];
  // Permission outlives a reload, as the browser's does.
  const permitted = () => { try { return localStorage.getItem('__cam-permitted') === '1'; } catch { return false; } };
  md.enumerateDevices = async () => (permitted()
    ? plugged.map(d => ({ ...d, toJSON() { return d; } }))
    : plugged.length ? [{ deviceId: '', groupId: '', kind: 'videoinput', label: '', toJSON() { return {}; } }] : []);
  md.getUserMedia = async (c) => {
    if (!c?.video) return realGum(c);
    const v = typeof c.video === 'object' ? c.video : {};
    const asked = v.deviceId?.exact ?? '';
    if (!plugged.length) throw new DOMException('no camera', 'NotFoundError');
    if (asked && !plugged.some(d => d.deviceId === asked)) throw new DOMException('gone', 'OverconstrainedError');
    const cam = asked ? plugged.find(d => d.deviceId === asked) : plugged[0];
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 48;
    const g = canvas.getContext('2d');
    g.fillStyle = cam.deviceId === 'cam-usb' ? '#3060ff' : '#ff6030';
    g.fillRect(0, 0, 64, 48);
    const stream = canvas.captureStream(10);
    const track = stream.getVideoTracks()[0];
    Object.defineProperty(track, 'label', { value: cam.label });
    track.getSettings = () => ({ deviceId: cam.deviceId, width: 64, height: 48 });
    live.push({ track, id: cam.deviceId });
    window.__opened.push({ asked, facing: v.facingMode ?? null, got: cam.deviceId });
    try { localStorage.setItem('__cam-permitted', '1'); } catch { /* the check reads the list instead */ }
    return stream;
  };
  window.__unplug = (id) => {
    const i = plugged.findIndex(d => d.deviceId === id);
    if (i >= 0) plugged.splice(i, 1);
    for (const l of live) {
      if (l.id !== id || l.track.readyState === 'ended') continue;
      l.track.stop();
      l.track.dispatchEvent(new Event('ended'));
    }
    md.dispatchEvent(new Event('devicechange'));
  };
  window.__plug = (id) => {
    if (!plugged.some(d => d.deviceId === id)) plugged.push(all.find(d => d.deviceId === id));
    md.dispatchEvent(new Event('devicechange'));
  };
  window.__liveTracks = () => live.filter(l => l.track.readyState === 'live').map(l => l.id);
};

const server = await serve();
const browser = await launchChromium(chromium, { headless: true });
let exitCode = 1;
const pageErrors = [];
try {
  // ── The desk ───────────────────────────────────────────────────────
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(STAND_INS);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', e => pageErrors.push(e.message));
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const opened = () => page.evaluate(() => window.__opened);
  const until = async (fn, arg, ms = 5000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
  const options = (testId) => page.evaluate((t) => {
    const s = document.querySelector(`[data-testid="${t}"]`);
    return s ? [...s.options].map(o => o.textContent) : null;
  }, testId);
  const valueOf = (testId) => page.getByTestId(testId).first().inputValue();
  const text = (testId) => page.getByTestId(testId).first().textContent().catch(() => null);
  const filmStatus = async () => {
    const t = await page.evaluate(() => document.querySelector('[data-testid="film-source-status"]')?.textContent?.trim() ?? null);
    if (t === null) throw new Error('the film\'s Source line (film-source-status) is not drawn');
    return t;
  };
  /** The plate's own film, from the debug hook; a missing hook is an error, not a pass. */
  const plateFilm = async () => {
    const k = await page.evaluate(() => (typeof window.chromaglassDebug === 'function' ? (window.chromaglassDebug().film?.kind ?? 'none') : null));
    if (k === null) throw new Error('chromaglassDebug is not installed (needs ?debug)');
    return k;
  };

  const openSettings = async (section) => {
    if (!(await page.getByTestId('settings-panel').count())) {
      await page.getByTestId('open-all-settings').first().click();
      await settle(800);
    }
    await page.getByTestId(`settings-nav-${section}`).first().click();
    await settle(500);
  };

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForSelector('[data-testid="open-all-settings"]', { timeout: 60_000 });
  await settle(1200);
  check('nothing opens a camera on load', (await opened()).length === 0, JSON.stringify(await opened()));

  // names
  await openSettings('room');
  const roomHead = await page.evaluate(() => document.querySelector('#settings-room h3')?.textContent?.trim());
  const roomWhat = (await text('scene-what')) ?? '';
  check('the room\'s section is called what it does', roomHead === 'Motion camera', String(roomHead));
  check('and says its picture is never shown, and where to show one',
    /never shown/.test(roomWhat) && /picture on the plate/.test(roomWhat) && (await page.getByTestId('goto-film-from-room').count()) > 0, roomWhat);
  check('its on/off is a switch that says its state',
    (await page.getByTestId('scene-toggle').first().getAttribute('aria-checked')) === 'false');

  // pickers, before any camera has been allowed: drawn, and saying why there are no names
  const roomOpts = await options('scene-device');
  const roomNote = (await text('scene-device-note')) ?? '';
  check('before any camera is allowed, the motion camera\'s picker is drawn and says why it has no names',
    JSON.stringify(roomOpts) === '["Default camera"]' && /names its cameras/.test(roomNote), `${JSON.stringify(roomOpts)} · ${roomNote}`);

  await openSettings('film');
  const filmWhat = (await text('film-camera-what')) ?? '';
  check('the film\'s camera says it shows a picture, and points at the motion camera',
    /picture on the plate/.test(filmWhat) && (await page.getByTestId('goto-room-from-film').count()) > 0, filmWhat);
  const filmOpts = await options('film-device');
  check('and so is the film\'s', JSON.stringify(filmOpts) === '["Default camera"]' && !!(await text('film-device-note')), JSON.stringify(filmOpts));

  // the first press: the browser's pick, a back camera's hint, and then the names
  await page.getByTestId('film-camera').first().click();
  await until(() => window.__opened.length >= 1);
  await settle();
  let o = await opened();
  check('the film\'s first camera is the browser\'s pick, with a back camera\'s hint (a phone over a dish)',
    o.length === 1 && o[0].asked === '' && o[0].facing === 'environment', JSON.stringify(o));
  const namedFilm = await options('film-device');
  await openSettings('room');
  const namedRoom = await options('scene-device');
  await openSettings('film');
  check('once a camera is allowed, both pickers list every camera by name',
    [namedFilm, namedRoom].every(l => !!l && l.includes('Laptop Camera') && l.includes('USB Capture')),
    `film ${JSON.stringify(namedFilm)}, motion ${JSON.stringify(namedRoom)}`);

  // choice: the film opens the camera picked, by id, while it shows
  await page.getByTestId('film-device').selectOption('cam-usb');
  await until(() => window.__opened.length >= 2);
  await settle();
  o = await opened();
  check('the film opens the camera picked, by id', o.length === 2 && o[1].asked === 'cam-usb' && o[1].got === 'cam-usb', JSON.stringify(o));
  check('and says which camera is live', /USB Capture/.test(await filmStatus()), await filmStatus());
  check('and the plate holds it as the film', (await plateFilm()) === 'camera', await plateFilm());

  // choosing another camera while it shows switches at once
  await page.getByTestId('film-device').selectOption('cam-laptop');
  await until(() => window.__opened.length >= 3);
  await settle();
  o = await opened();
  check('picking another camera while it shows switches to it',
    o.length === 3 && o[2].asked === 'cam-laptop' && JSON.stringify(await page.evaluate(() => window.__liveTracks())) === '["cam-laptop"]',
    JSON.stringify(await page.evaluate(() => window.__liveTracks())));
  await page.getByTestId('film-device').selectOption('cam-usb');
  await until(() => window.__opened.length >= 4);
  await settle();

  // unplug: the film comes off and says so; plugged back, it comes back
  await page.evaluate(() => window.__unplug('cam-usb'));
  await settle(800);
  check('a camera pulled out takes the film off',
    (await filmStatus()) === 'off' && (await plateFilm()) === 'none', `${await filmStatus()}, plate ${await plateFilm()}`);
  const lostShown = await page.getByTestId('film-camera-lost').isVisible().catch(() => false);
  check('and says it was unplugged', lostShown);
  const before = (await opened()).length;
  await page.evaluate(() => window.__plug('cam-usb'));
  const back = await until((n) => window.__opened.length > n, before);
  await settle();
  o = await opened();
  check('plugged back in, the same camera opens again by itself',
    back && o.at(-1).asked === 'cam-usb' && /USB Capture/.test(await filmStatus()), JSON.stringify(o.at(-1)));
  const lostGone = !(await page.getByTestId('film-camera-lost').isVisible().catch(() => false));
  check('and the unplugged line goes', lostShown && lostGone, !lostShown ? 'was never shown' : lostGone ? '' : 'still showing');

  // the motion camera: its own choice, opened by id
  await openSettings('room');
  await page.getByTestId('scene-device').selectOption('cam-laptop');
  const n0 = (await opened()).length;
  await page.getByTestId('scene-toggle').first().click();
  await until((n) => window.__opened.length > n, n0);
  await settle(800);
  o = await opened();
  check('the motion camera opens the camera picked for it',
    o.at(-1).asked === 'cam-laptop' && o.at(-1).facing === null, JSON.stringify(o.at(-1)));
  check('and its switch reads on', (await page.getByTestId('scene-toggle').first().getAttribute('aria-checked')) === 'true');
  check('while the film keeps its own camera', JSON.stringify((await page.evaluate(() => window.__liveTracks())).sort()) === '["cam-laptop","cam-usb"]',
    JSON.stringify(await page.evaluate(() => window.__liveTracks())));

  await page.evaluate(() => window.__unplug('cam-laptop'));
  await settle(800);
  const lostLine = (await text('scene-error')) ?? '';
  check('a motion camera pulled out says it was unplugged', /unplugged/.test(lostLine), lostLine || 'no line');
  const n1 = (await opened()).length;
  await page.evaluate(() => window.__plug('cam-laptop'));
  const roomBack = await until((n) => window.__opened.length > n, n1);
  await settle(800);
  check('plugged back in, the motion camera opens it again by itself',
    roomBack && (await opened()).at(-1).asked === 'cam-laptop' && !(await page.getByTestId('scene-error').count()),
    JSON.stringify((await opened()).at(-1)));

  // both choices survive a reload, apart
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-testid="open-all-settings"]', { timeout: 60_000 });
  await settle(1200);
  check('a reload opens no camera by itself', (await opened()).length === 0, JSON.stringify(await opened()));
  await openSettings('film');
  const filmKept = await valueOf('film-device');
  await openSettings('room');
  const roomKept = await valueOf('scene-device');
  check('each camera\'s choice survives a reload, apart', filmKept === 'cam-usb' && roomKept === 'cam-laptop', `film ${filmKept}, motion ${roomKept}`);

  // missing: the chosen camera not plugged in
  await page.evaluate(() => window.__unplug('cam-usb'));
  await openSettings('film');
  await settle(300);
  const missingOpts = await options('film-device');
  check('a chosen camera that is not plugged in stays chosen and says so',
    (await valueOf('film-device')) === 'cam-usb' && !!missingOpts?.some(t => /not plugged in/.test(t)), JSON.stringify(missingOpts));
  await page.getByTestId('film-camera').first().click();
  await until(() => window.__opened.length >= 1);
  await settle();
  o = await opened();
  const note = (await text('film-device-note')) ?? '';
  check('pressed anyway, it opens the browser\'s pick and says so',
    o.at(-1).asked === '' && o.at(-1).got === 'cam-laptop' && /Laptop Camera/.test(note), `${JSON.stringify(o.slice(-2))} · ${note}`);
  check('the film\'s own default is a back camera, for a phone over a dish', o.at(-1).facing === 'environment', String(o.at(-1).facing));
  const n2 = o.length;
  await page.evaluate(() => window.__plug('cam-usb'));
  const handed = await until((n) => window.__opened.length > n, n2);
  await settle();
  check('and hands over to the chosen camera when it arrives',
    handed && (await opened()).at(-1).asked === 'cam-usb' && /USB Capture/.test(await filmStatus()), await filmStatus());
  await context.close();

  // ── The phone ──────────────────────────────────────────────────────
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await pctx.addInitScript(STAND_INS);
  const ph = await pctx.newPage();
  ph.setDefaultTimeout(30_000);
  ph.on('pageerror', e => pageErrors.push(e.message));
  await ph.goto(URL, { waitUntil: 'load' });
  await ph.waitForSelector('[data-testid="phone-open-more"]', { timeout: 60_000 });
  await ph.waitForTimeout(800);
  const tap = async (t) => { await ph.getByTestId(t).first().tap(); await ph.waitForTimeout(400); };
  await tap('phone-open-more');
  await tap('phone-settings');
  const onPhone = async (section, picker) => {
    await tap(`settings-nav-${section}`);
    const el = ph.getByTestId(picker).first();
    await el.scrollIntoViewIfNeeded().catch(() => {});
    const b = await el.boundingBox();
    const opts = await ph.evaluate((t) => [...(document.querySelector(`[data-testid="${t}"]`)?.options ?? [])].map(o => o.textContent), picker);
    return { b, opts };
  };
  for (const [section, picker, name] of [['room', 'scene-device', 'motion camera'], ['film', 'film-device', 'film\'s Webcam']]) {
    const { b, opts } = await onPhone(section, picker);
    // A fresh phone has allowed no camera yet, so the list is the browser's pick alone.
    check(`on the phone, the ${name} picker is on screen, a thumb's height`,
      !!b && b.x >= 0 && b.x + b.width <= 390 && b.height >= 32 && opts[0] === 'Default camera',
      b ? `${Math.round(b.x)}+${Math.round(b.width)} × ${Math.round(b.height)}px, ${opts.length} options` : 'not drawn');
  }
  await pctx.close();

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  exitCode = failed ? 1 : 0;
} catch (err) {
  console.error(err);
} finally {
  await browser.close();
  stopServer(server);
  process.exit(exitCode);
}
