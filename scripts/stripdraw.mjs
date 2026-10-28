#!/usr/bin/env node
/**
 * `npm run stripdraw`: the patch bay's spectrum strips draw only when they can
 * be seen, and then as the ear reads (PLAN 30a-3).
 *
 * What was found: since #511 every `bands` cord in the patch bay mounts a
 * `BandStrip`, a canvas with its own animation loop, and the loop redrew the
 * canvas on every refresh from the moment it mounted. The desk mounts the
 * patch bay off to the side of the window, so on Bass Drop, which has two
 * band cords, two strips painted a spectrum nobody could see, 60 or 120 times
 * a second, each a canvas the browser rasterises on the GPU the plate steps
 * on. On the Mac runner that look's plate stepped about a quarter slower
 * with Beat Squeeze up on every build carrying #511 than on any before it
 * (PLAN 30a-3 has the numbers).
 *
 * So, in the app, on Bass Drop with the band playing, counted from the
 * canvas's own `data-drawn` (a count the strip keeps as it draws, so a strip
 * that draws by any other road reads as drawing):
 *   1. off screen, as the desk opens, each strip draws nothing over three
 *      seconds, while the page's own animation frames go on;
 *   2. brought on screen, each draws live: at least a few frames a second,
 *      and never more than the page has frames;
 *   3. and sent off screen again, it stops again.
 * The strip's loop and the observer are the browser's, not the plate's, so
 * this needs no GPU and runs in a cloud session's browser as on the Mac.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.STRIPDRAW_PORT ?? 4373);
let failed = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? ' ok  ' : ' FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
await new Promise((resolve, reject) => {
  const bail = setTimeout(() => reject(new Error('preview server did not start')), 30_000);
  server.stdout.on('data', (d) => { if (String(d).includes('localhost')) { clearTimeout(bail); resolve(); } });
  server.on('exit', (c) => { clearTimeout(bail); reject(new Error(`preview exited ${c}`)); });
});
process.on('exit', () => { try { process.kill(-server.pid, 'SIGTERM'); } catch { server.kill('SIGTERM'); } });

const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 700 } });
  await page.addInitScript(() => { try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
  await page.goto(`http://localhost:${PORT}/?debug&look=bass-drop`, { waitUntil: 'load' });
  const STRIPS = '[data-testid^="patch-band-"] canvas';
  await page.waitForFunction((sel) => document.querySelectorAll(sel).length > 0, STRIPS, { timeout: 60_000 });
  await page.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  // Bass Drop's two band cords, one strip each: a look that lost them asks nothing here.
  const read = () => page.evaluate((sel) => ({
    frames: window.__frames,
    strips: [...document.querySelectorAll(sel)].map((c) => {
      const r = c.getBoundingClientRect();
      return { drawn: Number(c.dataset.drawn ?? 0), on: r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth };
    }),
  }), STRIPS);
  const over = async (ms) => {
    const a = await read();
    await page.waitForTimeout(ms);
    const b = await read();
    return { frames: b.frames - a.frames, s: ms / 1000, strips: b.strips.map((x, i) => ({ on: x.on, drew: x.drawn - (a.strips[i]?.drawn ?? 0) })) };
  };

  await page.waitForTimeout(2000);
  const off = await over(3000);
  check(off.strips.length >= 2, 'Bass Drop\'s band cords each have a strip in the patch bay', `${off.strips.length} strips`);
  check(off.strips.every((x) => !x.on) && off.frames >= 30 && off.strips.every((x) => x.drew === 0),
    'off screen, as the desk opens, a strip draws nothing while the page animates',
    `${off.strips.map((x) => `${x.drew} draws${x.on ? ' (on screen!)' : ''}`).join(', ')} in ${off.s} s, against the page's ${off.frames} frames`);

  // Each strip brought on screen in turn, the way a hand scrolls to it.
  const seen = [];
  for (let i = 0; i < off.strips.length; i++) {
    await page.evaluate(({ sel, i }) => document.querySelectorAll(sel)[i].scrollIntoView({ block: 'center', inline: 'center' }), { sel: STRIPS, i });
    await page.waitForTimeout(500);
    const w = await over(3000);
    seen.push({ ...w.strips[i], frames: w.frames, s: w.s });
  }
  check(seen.every((x) => x.on && x.drew >= 5 * x.s && x.drew <= x.frames),
    'on screen, each draws live, and never more often than the page has frames',
    seen.map((x) => `${x.drew} draws${x.on ? '' : ' (still off screen)'} in ${x.s} s of ${x.frames} frames`).join('; '));

  // And away again: the first strip, the last one brought in being the other.
  await page.evaluate(() => { for (const el of document.querySelectorAll('*')) { if (el.scrollLeft) el.scrollLeft = 0; if (el.scrollTop) el.scrollTop = 0; } window.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  const again = await over(3000);
  check(again.strips.every((x) => !x.on) && again.strips.every((x) => x.drew <= 1),
    'and off screen again, it stops again',
    `${again.strips.map((x) => `${x.drew} draws${x.on ? ' (on screen!)' : ''}`).join(', ')} in ${again.s} s, against ${again.frames} frames`);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} line(s) failed` : '\nall lines pass');
process.exit(failed ? 1 : 0);
