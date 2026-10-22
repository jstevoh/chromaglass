#!/usr/bin/env node
/**
 * The landing page's look cards, drawn sharp (PLAN.md 34a-3).
 *
 *   npm run landinglooks
 *   LL_ONLY=macro-bead,lace-run npm run landinglooks
 *   LL_SECONDS=30 npm run landinglooks      how long each look runs before its frame is taken
 *
 * What was reported: the cards were 480 × 300 and soft wherever a Retina
 * screen draws them at twice that. Each is now a frame of the app's own
 * render of the look at a laptop's window (1440 × 900), shrunk to 960 × 600,
 * which a card at its widest (about 270 CSS px, 540 device pixels at 2x) and
 * the hero's slides draw one to one or finer. Shrinking a frame that is
 * larger than the card is the sharpening: the picture has the detail, and the
 * browser then has nothing to stretch.
 *
 * Each frame is encoded as WebP by the browser's own canvas, trying qualities
 * from the top down until the file is under LL_KB (default 60 KB), because
 * the page loads eight of them and the rule is a light page. The look that
 * had to give up the most quality says so.
 *
 * Writes `public/landing/looks/<id>.webp`. Needs a GPU that presents WebGPU
 * (a Mac). Not run by CI.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { engineQuery, installFrameReader, lastFrameRead } from './frame.mjs';
import { AUTOPLAY, withBand, untilRunning } from './recorder.mjs';

const PORT = Number(process.env.LL_PORT ?? 4362);
const OUT = path.resolve(process.env.LL_OUT ?? 'public/landing/looks');
const SECONDS = Number(process.env.LL_SECONDS ?? 20);
const MAX_KB = Number(process.env.LL_KB ?? 60);
/** The macro bead is all fine cells and grain, which no encoder keeps small; it gets a larger allowance. */
const MAX_KB_FOR = { 'macro-bead': 100 };
const LOOKS = ['ferro-paint', 'aurora-borealis', 'cell-bloom', 'poster-1969', 'macro-bead', 'jellyfish-bloom', 'lace-run', 'neon-coral-reef'];
const ONLY = process.env.LL_ONLY ? process.env.LL_ONLY.split(',').map(s => s.trim()).filter(Boolean) : null;
/** A 13-inch laptop's window, as `npm run pixels` takes it. */
const VIEW = { width: 1440, height: 900 };

fs.mkdirSync(OUT, { recursive: true });

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${code}): port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
let failed = 0;
try {
  for (const id of LOOKS.filter(l => !ONLY || ONLY.includes(l))) {
    const page = await browser.newPage({ viewport: VIEW });
    try {
      await installFrameReader(page);
      await withBand(page);
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${id}&seed=1${engineQuery()}`, { waitUntil: 'load' });
      await page.mouse.click(8, 8);   // the gesture the band needs
      await page.waitForTimeout(8000);
      const running = await untilRunning(page);
      if (!running.ok) throw new Error('the show never ran steadily');
      await page.waitForTimeout(SECONDS * 1000);
      await page.evaluate(() => document.body.classList.add('overlays-hidden'));
      await page.waitForTimeout(300);
      const got = await page.evaluate(async (maxBytes) => {
        const size = await window.__cgShot?.('ll');
        const img = window.__shots?.ll;
        if (!size || !img) return null;
        const full = document.createElement('canvas'); full.width = img.width; full.height = img.height;
        full.getContext('2d').putImageData(img, 0, 0);
        const out = document.createElement('canvas'); out.width = 960; out.height = 600;
        const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
        // Cover, not stretch: the plate is 16:10 at this window, but a different window must not squash it.
        const s = Math.max(960 / img.width, 600 / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(full, (960 - w) / 2, (600 - h) / 2, w, h);
        for (let q = 0.9; q >= 0.4; q -= 0.05) {
          const url = out.toDataURL('image/webp', q);
          const bytes = Math.round((url.length - url.indexOf(',') - 1) * 3 / 4);
          if (bytes <= maxBytes || q < 0.45) return { url, bytes, q: +q.toFixed(2), from: `${img.width}×${img.height}` };
        }
        return null;
      }, (MAX_KB_FOR[id] ?? MAX_KB) * 1024);
      if (!got) throw new Error(`no frame: ${JSON.stringify(await lastFrameRead(page)).slice(0, 160)}`);
      fs.writeFileSync(path.join(OUT, `${id}.webp`), Buffer.from(got.url.split(',')[1], 'base64'));
      const cap = (MAX_KB_FOR[id] ?? MAX_KB) * 1024;
      const note = got.bytes > cap ? `  OVER ${cap / 1024} KB` : '';
      console.log(`  ${id.padEnd(18)} ${got.from} → 960×600  ${(got.bytes / 1024).toFixed(0)} KB at quality ${got.q}${note}`);
      if (got.bytes > cap) failed++;
    } catch (e) {
      failed++;
      console.log(`FAIL ${id}: ${e.message.split('\n')[0]}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
