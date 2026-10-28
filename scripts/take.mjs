#!/usr/bin/env node
/**
 * Does a performance start and stop by hand, and keep what was painted?
 *
 *   npm run take
 *
 * Reported: "the performance auto detect doesn't work well. lets instead
 * focus first on starting/stopping performances manually." A performance was
 * whatever was painted during one identified listen, so with no song
 * identified nothing was kept at all. Now T (or the Performance dot) starts
 * and stops one, and the song playing is attached on its own; with none,
 * it keeps its own clock (lib/performanceTake.ts has the timing, and
 * `npm run panel` checks it). This goes the way a hand does, on the desk:
 *
 *   1. T starts one, and the Performance dot says so
 *   2. stopped with nothing painted, nothing is kept, and it says that
 *   3. painted and stopped, it is kept (in IndexedDB), with the gestures
 *      painted, on its own clock since no song is playing here
 *
 * Needs a GPU that presents WebGPU, since painting runs through the plate's
 * frame loop: the macOS runner, in checks.yml.
 */
import { chromium } from 'playwright';
import { launchChromium, presentsInXvfb } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery, settlePlate, waitForEngine } from './frame.mjs';

const PORT = 4343;
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail });
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

// `present`: on a Linux box with PW_WEBGPU, headed into Xvfb so the plate reads back (chromium.mjs, PLAN.md 19l).
const browser = await launchChromium(chromium, { present: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await settlePlate(page, 8000);
  await waitForEngine(page);

  const dot = page.locator('[data-testid=dot-rec]');
  const stored = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('chromaglass-music');
    r.onsuccess = () => {
      const q = r.result.transaction('performances').objectStore('performances').getAll();
      q.onsuccess = () => res(q.result.map(p => ({ clock: p.clock, n: p.gestures.length, isrc: p.isrc ?? null })));
      q.onerror = () => res([]);
    };
    r.onerror = () => res([]);
  }));
  // The note is a toast that comes when the take's save has landed and goes in a few seconds. In
  // software (PLAN.md 19l) the save waits behind a plate that steps at 0.4 a second, so the note is
  // waited for longer; and the wait before reading the one after the first stop is the wall
  // clock, not `settlePlate`'s steps, which would outlast the toast.
  const noteWait = presentsInXvfb() ? 30_000 : 3000;
  const note = async () => (await page.locator('[data-testid=performance-note]').textContent({ timeout: noteWait }).catch(() => null)) ?? '';

  // 0. There is a button to do it with, labelled, on the Perform desk: the
  //    only way in used to be an unlabelled dot (reported: "I'm not seeing
  //    any new performance controls or stop/start").
  const button = page.locator('[data-testid=record-button]');
  const idleLabel = (await button.count()) ? ((await button.first().textContent()) ?? '') : '';
  check('the desk has one Record button', (await button.count()) === 1 && /Record/.test(idleLabel)
    && await button.first().isVisible(), idleLabel || 'no button');

  // 1. T starts one.
  await page.mouse.click(5, 5);
  await page.keyboard.press('t');
  await settlePlate(page, 1500);
  const liveTitle = (await dot.first().getAttribute('title')) ?? '';
  check('T starts a take, and the one Rec dot says so', /^Recording Take /.test(liveTitle), liveTitle.slice(0, 60));
  const liveLabel = (await button.first().textContent().catch(() => '')) ?? '';
  check('and the button turns to Stop with the clock', /Stop · \d+:\d\d/.test(liveLabel), liveLabel);

  // 1b. The one Record button stops a take that T started, and with Take
  //     chosen it starts one: R is Record, T is a take by itself.
  await page.keyboard.press('r');
  await page.waitForTimeout(800);
  check('Record stops a take that T started', (await dot.count()) === 0, `${await dot.count()} Rec dots`);
  const empty = await note();
  await page.evaluate(() => localStorage.setItem('chromaglass-record-choice', JSON.stringify({ video: false, take: true })));
  await page.reload({ waitUntil: 'load' });
  await settlePlate(page, 8000);
  await waitForEngine(page);
  await page.mouse.click(5, 5);
  await page.keyboard.press('r');
  await settlePlate(page, 1200);
  const viaR = (await dot.first().getAttribute('title').catch(() => '')) ?? '';
  check('with Take chosen, R starts a take and nothing else', /^Recording Take /.test(viaR), viaR.slice(0, 50));
  await page.keyboard.press('r');
  await settlePlate(page, 800);
  check('and R stops it', (await dot.count()) === 0);
  await page.evaluate(() => localStorage.removeItem('chromaglass-record-choice'));

  // 2. Stopped with nothing painted.
  const none = await stored();
  check('stopped with nothing painted, nothing is kept, and it says so',
    /Nothing was painted/.test(empty) && none.length === 0, `"${empty}", ${none.length} stored`);

  // 3. Painted and stopped.
  await settlePlate(page, 4500);
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.keyboard.press('t');
  await settlePlate(page, 500);
  await page.keyboard.press('d');
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    await page.mouse.move(box.x + box.width * (0.35 + 0.3 * i / 40), box.y + box.height * (0.5 + 0.1 * Math.sin(i / 6)));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await settlePlate(page, 500);
  await page.keyboard.press('t');
  const kept = await note();
  await settlePlate(page, 800);
  const saved = await stored();
  check('painted and stopped, it is kept with what was painted',
    /Performance kept/.test(kept) && saved.length === 1 && saved[0].n >= 3,
    `"${kept}", ${saved.length} stored${saved[0] ? `, ${saved[0].n} gestures` : ''}`);
  check('and with no song playing it keeps its own clock', saved[0]?.clock === 'wall' && saved[0]?.isrc === null,
    saved[0] ? `${saved[0].clock}, song ${saved[0].isrc ?? 'none'}` : 'none stored');
} finally {
  await browser.close();
}

const failed = checks.filter(c => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
