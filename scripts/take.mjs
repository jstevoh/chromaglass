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
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';
import { engineQuery } from './frame.mjs';

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

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message.slice(0, 200)));
  await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic${engineQuery()}`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);

  const dot = page.locator('[data-testid=dot-performance]');
  const stored = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('chromaglass-music');
    r.onsuccess = () => {
      const q = r.result.transaction('performances').objectStore('performances').getAll();
      q.onsuccess = () => res(q.result.map(p => ({ clock: p.clock, n: p.gestures.length, isrc: p.isrc ?? null })));
      q.onerror = () => res([]);
    };
    r.onerror = () => res([]);
  }));
  const note = async () => (await page.locator('[data-testid=performance-note]').textContent({ timeout: 3000 }).catch(() => null)) ?? '';

  // 1. T starts one.
  await page.mouse.click(5, 5);
  await page.keyboard.press('t');
  await page.waitForTimeout(1500);
  const liveTitle = (await dot.first().getAttribute('title')) ?? '';
  check('T starts a performance, and the Performance dot says so', /^Recording a performance/.test(liveTitle), liveTitle.slice(0, 60));

  // 2. Stopped with nothing painted.
  await page.keyboard.press('t');
  const empty = await note();
  const none = await stored();
  check('stopped with nothing painted, nothing is kept, and it says so',
    /Nothing was painted/.test(empty) && none.length === 0, `"${empty}", ${none.length} stored`);

  // 3. Painted and stopped.
  await page.waitForTimeout(4500);
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.keyboard.press('t');
  await page.waitForTimeout(500);
  await page.keyboard.press('d');
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    await page.mouse.move(box.x + box.width * (0.35 + 0.3 * i / 40), box.y + box.height * (0.5 + 0.1 * Math.sin(i / 6)));
    await page.waitForTimeout(50);
  }
  await page.mouse.up();
  await page.waitForTimeout(500);
  await page.keyboard.press('t');
  const kept = await note();
  await page.waitForTimeout(800);
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
