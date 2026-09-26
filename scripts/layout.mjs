#!/usr/bin/env node
/**
 * The layout, without a GPU: does every control fit, read, and sit where you
 * can reach it, at every width the show is played at?
 *
 *   npm run layout            # builds, then about a minute
 *   npm run layout -- --head  # watch it
 *
 * These are the show night's layout checks (`qa.mjs`), asked on their own.
 * In September ten of thirty-one red runs were one of them — a chip 20px
 * tall, the mode switch sliding 18px, a column painted over Freeze at 1280 —
 * and each was found fifteen minutes into the macOS job, because that is the
 * only place `qa.mjs` can run. Layout is CSS: a software renderer lays out the
 * same page a GPU does. So this runs on the ubuntu job, in a cloud session,
 * and before a push, and `qa.mjs` still asks the same questions on the Mac.
 *
 * The measurements are shared with `qa.mjs` (`layoutProbe.mjs`), so the two
 * cannot drift apart. What is not here is anything that reads the plate.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { launchChromium } from './chromium.mjs';
import { clickAt, modeSwitchX, legibility, coveredControls, statusDots, COVER_WIDTHS } from './layoutProbe.mjs';

const PORT = Number(process.env.LAYOUT_PORT ?? 4179);
// The plate's resolution does not change a layout, and every millisecond the
// software renderer spends on it is a millisecond the page is not answering.
const URL = `http://localhost:${PORT}/?debug&look=classic&dpr=0.35`;
const HEADED = process.argv.includes('--head');
/*
  With no GPU the plate's frame holds the "needs WebGPU" screen instead of a
  plate, and on a phone its Try again button sits under the bottle rail. That
  screen is what a machine without WebGPU gets, not the show being measured,
  so its own controls are left out of the cover check; everything around it
  is the layout a performer sees. (Given software WebGPU instead, with
  PW_WEBGPU=1, the plate runs so slowly that the black box reports a stall and
  its chip covers the desk, which is a truer account of that machine than of
  the layout.)
*/
const NO_GPU_SCREEN = '[data-testid="needs-webgpu"]';

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

const server = await serve();
const browser = await launchChromium(chromium, { headless: !HEADED });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.setDefaultTimeout(60_000);
const settle = (ms = 900) => page.waitForTimeout(ms);
const clickOn = (target) => clickAt(page, target);
const appears = async (testId) => {
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId(testId).count()) > 0) return true;
    await settle(300);
  }
  return false;
};
/*
  How many controls a measurement actually looked at. Every check here asks
  "is anything wrong with the controls", and a page that rendered none of
  them has nothing wrong with it — so each one also says how many it saw,
  and fails on a page too empty to judge.
*/
const visibleControls = () => page.evaluate(() => [...document.querySelectorAll('button, input, select')]
  .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length);
const seenIds = {};
const noteIds = async () => {
  const now = await page.evaluate(() => {
    const seen = {};
    for (const el of document.querySelectorAll('[data-testid]')) {
      const id = el.getAttribute('data-testid');
      seen[id] = (seen[id] ?? 0) + 1;
    }
    return seen;
  });
  for (const [id, n] of Object.entries(now)) if (n > 1) seenIds[id] = Math.max(seenIds[id] ?? 0, n);
};

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  const desk = await appears('design-desk') || await appears('perform-desk');
  check('a desk lays out at laptop width', desk);
  if (!desk) throw new Error('no desk to measure');

  // ── The mode switch stays where it is ──────────────────────────
  await clickOn('mode-segmented-perform');
  await settle(1200);
  const inPerform = await modeSwitchX(page);
  await clickOn('mode-segmented-design');
  await settle(1200);
  const inDesign = await modeSwitchX(page);
  await clickOn('mode-segmented-perform');
  await settle(1200);
  const back = await modeSwitchX(page);
  const drift = Math.max(Math.abs(inDesign - inPerform), Math.abs(back - inPerform));
  check('the mode switch does not move when you use it',
    inPerform !== null && inDesign !== null && back !== null && drift <= 1,
    `perform ${inPerform}, design ${inDesign}, back ${back} — ${drift}px`);

  // ── Readable in a dark room, on both desks and inside the panels ─
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const mode of ['perform', 'design']) {
    await clickOn(`mode-segmented-${mode}`);
    await settle(1000);
    await noteIds();
    const n = await visibleControls();
    const l = await legibility(page);
    check(`on ${mode}, nothing you can click has text under 11px`, n > 20 && l.tiny.length === 0,
      l.tiny.length ? l.tiny.slice(0, 6).join(', ') : `${n} controls`);
    check(`on ${mode}, none of it is under 60% opacity`, n > 20 && l.faint.length === 0, l.faint.slice(0, 6).join(', '));
    check(`on ${mode}, nothing is smaller than 24px`, n > 20 && l.small.length === 0, l.small.slice(0, 6).join(', '));
  }
  for (const [name, button, panel] of [
    ['settings', 'open-all-settings', 'settings-panel'],
    ['the controller panel', 'dot-midi', 'midi-panel'],
  ]) {
    await clickOn(button);
    const up = await appears(panel);
    await settle(700);
    await noteIds();
    const l = await legibility(page);
    check(`nothing in ${name} is under 11px`, up && l.tiny.length === 0,
      up ? l.tiny.slice(0, 5).join(', ') : 'never opened');
    await page.keyboard.press('Escape');
    await settle(600);
  }

  // ── Nothing is painted on top of anything you can click ────────
  for (const [w, h] of COVER_WIDTHS) {
    await page.setViewportSize({ width: w, height: h });
    await settle(1200);
    await noteIds();
    const n = await visibleControls();
    const hit = await coveredControls(page, { skipInside: NO_GPU_SCREEN });
    check(`nothing covers a control at ${w}px`, n > 10 && hit.length === 0,
      hit.length ? hit.slice(0, 4).join('; ') : `${n} controls`);
    if (w >= 1024) {
      const { all, bare } = await statusDots(page);
      check(`every status dot is labelled at ${w}px`, all > 0 && bare.length === 0,
        bare.length ? `no word on ${bare.join(', ')}` : `${all} dots, each with its word`);
    }
  }

  // ── Small screens ──────────────────────────────────────────────
  await page.setViewportSize({ width: 420, height: 820 });
  await settle(1500);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('nothing spills off a phone-width screen', overflow <= 2, `${overflow}px of overflow`);

  // ── Nothing is on the screen twice ─────────────────────────────
  const dupes = Object.entries(seenIds);
  check('no control appears on the screen twice', dupes.length === 0, dupes.map(([id, n]) => `${id} ×${n}`).join(', '));
} catch (err) {
  check('the run completed', false, String(err).split('\n')[0]);
} finally {
  await browser.close();
  stopServer(server);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} layout checks passed`);
process.exit(failed.length ? 1 : 0);
