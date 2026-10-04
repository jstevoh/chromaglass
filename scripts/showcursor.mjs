#!/usr/bin/env node
/**
 * No pointer on the show: does the arrow stay off the wall, and on the laptop?
 *
 *   npm run showcursor        # builds, then about half a minute
 *
 * The owner asked (2026-10-04) for the mouse never to show on the show: the
 * projector window, a cast receiver, the laptop's own screen in clean screen.
 * It may show on the design screen. Before this, the show window brought the
 * arrow back on any movement and hid it after two and a half seconds still,
 * so it was on the wall at the moment the window opened and every time the
 * hand crossed the projector's screen. That is the case this measures: not
 * the window after a long rest, but as it opens, with the mouse moving over
 * it, and still, with the full-screen hint up.
 *
 * What the browser draws as the pointer is the computed `cursor` of the
 * element the pointer is over (hit testing skips `pointer-events: none`, as
 * `elementFromPoint` does). So each window is asked twice: at a grid of
 * points over it, what is under each and its cursor; and, for whatever the
 * grid did not land on (a caption that comes and goes, a button on the "needs
 * WebGPU" card), every element in the document, so a child that sets its own
 * cursor is caught wherever it is.
 *
 * The other half is that the probe can see a pointer at all, and that the
 * rule did not reach the design screen: asked of the laptop's window, the
 * same probe must find the plate's crosshair and the desk's pointers. A probe
 * that reported "none" everywhere would pass every show line and fail this.
 *
 * No GPU needed: the projector window mirrors the show's canvas element
 * (CastDisplay's StageMirror) whether or not anything is drawn in it, and a
 * receiver lays out the same page over the "needs WebGPU" card. The Mac app's
 * projector window is this same page; `npm run desktop` asks it there too.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';

const PORT = Number(process.env.SHOWCURSOR_PORT ?? 4187);
const ORIGIN = `http://localhost:${PORT}`;

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
    proc.on('exit', c => {
      clearTimeout(bail);
      reject(new Error(`preview exited ${c}${notes.length ? `: ${notes.join(' ').slice(0, 200)}` : ''}`));
    });
  });
  return proc;
}
const stopServer = (proc) => { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } };

/**
 * In the page: the pointer over a 9 × 5 grid of the window, and every element
 * whose cursor is not `none`. `scope` limits the second to one subtree (the
 * app's root, in clean screen), so a check of the laptop's window is about
 * the window and not the `<head>`.
 */
const probe = (page, scope = null) => page.evaluate((scope) => {
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-testid') ? `[${el.getAttribute('data-testid')}]` : ''}`;
  const W = innerWidth, H = innerHeight;
  let points = 0;
  const shown = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 5; j++) {
    const x = Math.round((i + 0.5) / 9 * W), y = Math.round((j + 0.5) / 5 * H);
    const el = document.elementFromPoint(x, y);
    if (!el) continue;
    points++;
    const c = getComputedStyle(el).cursor;
    if (c !== 'none') shown.push(`${c} over ${name(el)} at ${x},${y}`);
  }
  const root = scope ? document.querySelector(scope) : document.documentElement;
  const all = root ? [root, ...root.querySelectorAll('*')] : [];
  const any = all.filter((el) => getComputedStyle(el).cursor !== 'none').map((el) => `${getComputedStyle(el).cursor} on ${name(el)}`);
  return { points, shown, elements: all.length, any };
}, scope);

const summary = (p) => p.shown.length || p.any.length
  ? [...p.shown.slice(0, 3), ...p.any.slice(0, 3)].join('; ')
  : `none at ${p.points} points and on ${p.elements} elements`;
const clean = (p) => p.points >= 40 && p.elements > 10 && p.shown.length === 0 && p.any.length === 0;

/** Sweep the mouse across a window, corner to corner, and ask before it can settle. */
async function sweep(page) {
  const { w, h } = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  await page.mouse.move(4, 4);
  await page.mouse.move(w - 4, h - 4, { steps: 12 });
  await page.mouse.move(w / 2, h / 2, { steps: 6 });
}

/**
 * The black window before the app has arrived: its document parsed, its
 * script and stylesheet still on the way. What the pointer is over then is
 * `<html>` or `<body>`, so those are what is asked, with whether the app's
 * root had anything in it yet (it should not, or this is not the moment).
 */
async function askWaiting(page, label) {
  const w = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).cursor,
    body: document.body ? getComputedStyle(document.body).cursor : 'none',
    drawn: !!document.querySelector('[data-testid="cast-display"]'),
  }));
  check(`${label}: no pointer while it waits for the app`, w.html === 'none' && w.body === 'none',
    `html ${w.html}, body ${w.body}${w.drawn ? ' (the app had already drawn)' : ''}`);
}

/** One show screen, at the three moments the arrow used to be on the wall. */
async function askShow(page, label) {
  const opening = await probe(page);
  check(`${label}: no pointer once it has drawn`, clean(opening), summary(opening));
  await sweep(page);
  const moving = await probe(page);
  check(`${label}: no pointer with the mouse moving over it`, clean(moving), summary(moving));
  // Past the old two and a half (three) seconds, and past the full-screen
  // hint's 1.5 s, so the caption is up while it is asked.
  await page.waitForTimeout(3500);
  await page.mouse.move(200, 150);
  const still = await probe(page);
  // The hint is up only while the window is not in full screen, which a
  // headless window never is; asked, so the line cannot pass without it.
  const hint = await page.evaluate(() => !!document.querySelector('[data-testid="cast-hint"]'));
  check(`${label}: no pointer later, with the hint up and the mouse back`, hint && clean(still),
    hint ? summary(still) : 'the full-screen hint never came up');
}

const server = await serve();
const browser = await launchChromium(chromium);
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const show = await context.newPage();
  show.setDefaultTimeout(60_000);
  await show.goto(`${ORIGIN}/?debug&look=classic&dpr=0.35`, { waitUntil: 'networkidle' });
  await show.waitForSelector('#liquid-canvas', { timeout: 30_000 });

  // ── The design screen keeps its pointer ───────────────────────
  await sweep(show);
  const design = await probe(show, '#root');
  const plate = await show.evaluate(() => getComputedStyle(document.getElementById('liquid-canvas')).cursor);
  check('the design screen keeps its pointer: the plate is a crosshair and the desk can be aimed at',
    plate === 'crosshair' && design.shown.length > 0 && design.any.length > 0,
    `plate ${plate}; ${design.shown.length} of ${design.points} points and ${design.any.length} elements show one`);

  // ── The projector window ──────────────────────────────────────
  // As useCastSession opens it: a popup from the show, then onto the cast
  // URL with `goto`, which keeps the opener (scripts/wall.mjs does the same),
  // so the page is the mirror and not a receiver.
  const [wall] = await Promise.all([
    show.waitForEvent('popup'),
    show.evaluate(() => { window.__wall = window.open('about:blank', 'wall', 'popup,width=960,height=540'); }),
  ]);
  wall.setDefaultTimeout(60_000);
  await wall.goto(`${ORIGIN}/?cast=true&debug`, { waitUntil: 'domcontentloaded' });
  await askWaiting(wall, 'the projector window');
  await wall.waitForSelector('[data-testid="cast-display"]', { timeout: 30_000 });
  const mode = await wall.evaluate(() => window.chromaglassCast?.()?.mode ?? 'receiver');
  check('the projector window is the mirror of the show', mode === 'mirror', mode);
  await askShow(wall, 'the projector window');
  await wall.close();

  // ── A receiver: a cast with no show window to mirror ──────────
  // Chrome's Cast or a second machine on ?cast=true: the same page, running
  // its own plate under the overlays.
  const receiver = await context.newPage();
  receiver.setDefaultTimeout(60_000);
  await receiver.goto(`${ORIGIN}/?cast=true&debug`, { waitUntil: 'domcontentloaded' });
  await askWaiting(receiver, 'a cast receiver');
  await receiver.waitForSelector('[data-testid="cast-display"]', { timeout: 30_000 });
  await askShow(receiver, 'a cast receiver');
  await receiver.close();

  // ── Clean screen: the show on the laptop's own screen ─────────
  await show.bringToFront();
  // Under a desk, clean screen is the palette's (⌘K) "Clean screen" row.
  await show.keyboard.press('Control+k');
  await show.waitForSelector('[data-testid="palette-input"]', { timeout: 10_000 });
  await show.evaluate(() => {
    const input = document.querySelector('[data-testid="palette-input"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'clean screen');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  await show.waitForSelector('[data-testid="palette-row-hide"]', { timeout: 10_000 });
  await show.keyboard.press('Enter');
  await show.waitForTimeout(600);
  await sweep(show);
  // The app's own root div, which fills the window and carries clean
  // screen's class; anything portalled outside it the grid still sees.
  const cleanScreen = await probe(show, '.overlays-hidden');
  const hidden = await show.evaluate(() => !!document.querySelector('.overlays-hidden'));
  check('clean screen: no pointer anywhere in the window', hidden && clean(cleanScreen),
    hidden ? summary(cleanScreen) : "the palette's Clean screen did not hide the overlays");
  await show.keyboard.press('Escape');
  await show.waitForTimeout(400);
  const back = await show.evaluate(() => getComputedStyle(document.getElementById('liquid-canvas')).cursor);
  check('Esc brings the pointer back with the controls', back === 'crosshair', `plate ${back}`);
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} show-pointer checks passed`);
process.exit(failed.length ? 1 : 0);
