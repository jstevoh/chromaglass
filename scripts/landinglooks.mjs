#!/usr/bin/env node
/**
 * The webpage's looks grid, photographed from the app (PLAN.md 34a-3).
 *
 *   npm run landinglooks                    every card, into public/landing/looks/
 *   LANDINGLOOKS_ONLY=chemical-clock npm run landinglooks
 *
 * What was asked (the owner, 2026-11-21): the "Real looks from the app" grid
 * re-rendered at full size, with the newer looks in it (the chemical clock,
 * polarised light, a palette from a picture). What it had were 480 × 300
 * frames cut from 28i-1's contact sheets: shown at their own size in a
 * 260-pixel card on a laptop's Retina panel, they are drawn at half the
 * panel's pixels, and the eye reads the softness as "a screenshot of a game"
 * rather than a liquid (the complaint pixels.mjs was written for).
 *
 * What this does: for each card, the app at a 13-inch laptop's window (1440 ×
 * 900 at 2x, the canvas 2880 × 1800), the look opened by its URL and the grid
 * held on the top rung (the governor would otherwise pick a rung by how the
 * Mac was coping that minute, and a still for the webpage should be the plate
 * at its best). It waits FRAMES drawn frames, not seconds: the Mac may be
 * doing other work and a look photographed by the clock would be younger on a
 * busy minute. Then the overlays go, the canvas is read at full size
 * (`__cgShot`), scaled to 960 × 600 (two pixels a CSS pixel for the grid's
 * widest card, 480 wide at four columns) and written as WebP at the best
 * quality that fits MAX_BYTES, so the eleven together are about what the
 * five hero stills and eight cards cost before.
 *
 * The three newer cards:
 *  - chemical-clock is a shipped look, photographed as the others are;
 *  - polarised-light is a look between crossed polarisers (31p-1): its
 *    settings set by the harness hook on the running plate, as the Lamp &
 *    Light panel would, so the colours are the solver's own strain through the
 *    real Michel-Levy shader and not a filter laid on a picture;
 *  - picture-palette is a look whose dyes came from a picture (43d): the
 *    picture is drawn here (a sunset over water, so nothing is downloaded and
 *    nobody's photograph is used) and handed to the desk's own "Palette from a
 *    picture" input, the path a visitor's file takes. The picture is written
 *    beside the still (picture-palette-source.webp), and the card shows it.
 *
 * Writes public/landing/looks/<id>.webp, and the full-size frames as JPEG
 * under LANDINGLOOKS_OUT (default scratch/landinglooks) to judge by eye.
 * Needs a GPU that presents WebGPU: the owner's Mac, between deploys
 * (launchChromium waits for one to leave it).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium, port } from './chromium.mjs';
import { PRESETS } from '../src/presets.ts';
import { installFrameReader, lastFrameRead } from './frame.mjs';
import { LANDING_LOOKS, LANDING_LOOK_SIZE, LANDING_LOOK_MAX_BYTES } from '../src/lib/landingMedia.ts';

const PORT = port(4347, 'LANDINGLOOKS_PORT');
const OUT = process.env.LANDINGLOOKS_OUT ?? 'scratch/landinglooks';
const DEST = 'public/landing/looks';
const ONLY = process.env.LANDINGLOOKS_ONLY ? process.env.LANDINGLOOKS_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
/** Try a card on another look without editing the list: LANDINGLOOKS_BASE=polarised-light=crowd-plate. */
const BASE = Object.fromEntries((process.env.LANDINGLOOKS_BASE ?? '').split(',').filter(Boolean).map((kv) => kv.split('=')));
/** Twenty seconds of the Mac's sixty frames a second: what 28i-1's sheets and pixels.mjs gave a look. */
const FRAMES = Number(process.env.LANDINGLOOKS_FRAMES ?? 1200);
const VIEW = { width: 1440, height: 900 };
const SCALE = 2;
const [W, H] = LANDING_LOOK_SIZE;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DEST, { recursive: true });

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
// Wait for the preview to answer rather than a fixed pause: on the Mac, with a
// deploy's checks beside it, vite preview took longer than the 2.5 s this first
// slept, and the first look's page load was refused.
for (let t = 0; ; t++) {
  try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch { /* not yet */ }
  if (t > 120) { console.error(`the preview server did not answer on port ${PORT} in 60 s`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 500));
}

/** The sunset the picture card's dyes come from, drawn in the page: sky, sun, its path on the water. */
const drawSunset = (w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#2a1458'); sky.addColorStop(0.45, '#b8326e'); sky.addColorStop(0.8, '#f2783a'); sky.addColorStop(1, '#ffc35a');
  g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
  const sea = g.createLinearGradient(0, h * 0.62, 0, h);
  sea.addColorStop(0, '#5a2a6e'); sea.addColorStop(1, '#0e1a3c');
  g.fillStyle = sea; g.fillRect(0, h * 0.62, w, h * 0.38);
  const sun = g.createRadialGradient(w * 0.62, h * 0.56, 0, w * 0.62, h * 0.56, h * 0.16);
  sun.addColorStop(0, '#fff2b0'); sun.addColorStop(0.6, '#ffd060'); sun.addColorStop(1, 'rgba(255,190,80,0)');
  g.fillStyle = sun; g.beginPath(); g.arc(w * 0.62, h * 0.56, h * 0.16, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,200,110,0.55)';
  for (let i = 0; i < 14; i++) { const y = h * (0.64 + i * 0.024), half = w * (0.09 - i * 0.004); g.fillRect(w * 0.62 - half, y, half * 2, h * 0.008); }
  return c;
};

const cards = LANDING_LOOKS.filter((c) => !ONLY || ONLY.includes(c.id));
const browser = await launchChromium(chromium);
let failed = 0;
try {
  console.log(`  ${cards.length} cards, ${FRAMES} frames each, ${VIEW.width}×${VIEW.height} at ${SCALE}x on the top rung → ${W}×${H} WebP under ${LANDING_LOOK_MAX_BYTES / 1000} KB\n`);
  for (const card of cards) {
    const look = BASE[card.id] ?? card.look ?? card.id;
    if (!PRESETS.some((p) => p.id === look)) { console.log(`  ${card.id.padEnd(18)} FAIL: ${look} is not a preset`); failed++; continue; }
    const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: SCALE });
    await installFrameReader(page);
    await page.addInitScript(() => { try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private window */ } });
    await page.goto(`http://localhost:${PORT}/?debug&tier=hosted&look=${look}&rung=0`, { waitUntil: 'load' });
    await page.mouse.click(8, 8);   // the gesture the band needs
    await page.waitForFunction(() => (window.chromaglassDebug?.()?.frames ?? 0) > 0, null, { timeout: 60_000 }).catch(() => {});
    if (card.settings) await page.evaluate((s) => window.chromaglassSettings?.(s), card.settings);
    if (card.picture) {
      const png = await page.evaluate((fn) => {
        const draw = new Function(`return (${fn})`)();
        return draw(480, 300).toDataURL('image/png').split(',')[1];
      }, drawSunset.toString());
      // The desk's Dyes panel is in the Perform deck; its picture input is hidden, and a file set on it is the visitor's choice.
      let input = page.getByTestId('picture-palette-input');
      if (!(await input.count())) await page.getByRole('button', { name: /^Dyes$/ }).first().click().catch(() => {});
      input = page.getByTestId('picture-palette-input');
      await input.setInputFiles({ name: 'sunset.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }).catch((e) => console.log(`  ${card.id.padEnd(18)} no picture input: ${e.message.split('\n')[0]}`));
      const thumb = await page.evaluate(async (fn) => {
        const draw = new Function(`return (${fn})`)();
        const blob = await new Promise((r) => draw(240, 150).toBlob(r, 'image/webp', 0.85));
        return btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
      }, drawSunset.toString());
      fs.writeFileSync(path.join(DEST, `${card.id}-source.webp`), Buffer.from(thumb, 'base64'));
      // A palette lock steers the next pours, not the dye already in the dish: the
      // look poured its own colours before the file was chosen, so a card taken now
      // is the look's colours. Nor does a reload help, though the lock survives
      // it: the look's first laying (seedPreset) is its own dyes whatever the lock
      // (PLAN 34a-3b), and aurora seldom pours again, so 1224 frames after a reload
      // the card was still aurora's green and violet. So the card is what a
      // visitor does after choosing a picture: drain the dish and seed it, the
      // seed's eight pours all from the locked harmony (the Seed trigger in
      // LiquidVisualizer), and let the look move them for FRAMES.
      const locked = await page.waitForFunction(() => localStorage.getItem('chromaglass-picture-palette') && localStorage.getItem('chromaglass-palette-lock') != null, null, { timeout: 10_000 }).then(() => true, () => false);
      if (!locked) { console.log(`  ${card.id.padEnd(18)} FAIL: the picture did not lock the palette`); failed++; await page.close(); continue; }
      const frameNow = () => page.evaluate(() => window.chromaglassDebug?.()?.frames ?? 0);
      const after = async (n) => { const f0 = await frameNow(); await page.waitForFunction((t) => (window.chromaglassDebug?.()?.frames ?? 0) >= t, f0 + n, { timeout: 120_000, polling: 250 }).catch(() => {}); };
      await page.evaluate(() => window.chromaglassAction?.('drain'));
      await after(90);   // the drain is 50 frames; the seed waits for it to end
      for (let i = 0; i < 2; i++) { await page.evaluate(() => window.chromaglassAction?.('seed')); await after(20); }
    }
    const start = await page.evaluate(() => window.chromaglassDebug?.()?.frames ?? 0);
    const reached = await page.waitForFunction((n) => (window.chromaglassDebug?.()?.frames ?? 0) >= n, start + FRAMES, { timeout: 240_000, polling: 500 }).then(() => true, () => false);
    await page.evaluate(() => document.body.classList.add('overlays-hidden'));
    await page.waitForTimeout(300);
    const got = await page.evaluate(async ({ W, H, max }) => {
      const size = await window.__cgShot?.('px');
      const img = window.__shots?.px;
      if (!size || !img) return null;
      const full = document.createElement('canvas'); full.width = img.width; full.height = img.height;
      full.getContext('2d').putImageData(img, 0, 0);
      // The canvas is the window's 8:5; anything else is cropped from the middle to 8:5.
      const sw = Math.min(img.width, Math.round(img.height * W / H)), sh = Math.round(sw * H / W);
      const out = document.createElement('canvas'); out.width = W; out.height = H;
      const ctx = out.getContext('2d'); ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, W, H);
      let blob = null, q = 0.9;
      for (; q >= 0.4; q -= 0.04) { blob = await new Promise((r) => out.toBlob(r, 'image/webp', q)); if (blob.size <= max) break; }
      const b64 = (b) => b.arrayBuffer().then((a) => { let s = ''; const u = new Uint8Array(a); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); });
      return {
        w: img.width, h: img.height, q: +q.toFixed(2), bytes: blob.size, webp: await b64(blob),
        full: full.toDataURL('image/jpeg', 0.92), label: window.chromaglassDebug?.()?.engine ?? '',
        frames: window.chromaglassDebug?.()?.frames ?? 0,
      };
    }, { W, H, max: LANDING_LOOK_MAX_BYTES });
    if (!got) {
      console.log(`  ${card.id.padEnd(18)} FAIL no frame: ${JSON.stringify(await lastFrameRead(page)).slice(0, 160)}`);
      failed++;
    } else {
      fs.writeFileSync(path.join(DEST, `${card.id}.webp`), Buffer.from(got.webp, 'base64'));
      fs.writeFileSync(path.join(OUT, `${card.id}${BASE[card.id] ? '-' + look : ''}-full.jpg`), Buffer.from(got.full.split(',')[1], 'base64'));
      console.log(`  ${card.id.padEnd(18)} ${got.w}×${got.h} → ${W}×${H} q${got.q} ${(got.bytes / 1000).toFixed(1)} KB  ${got.frames - start} frames${reached ? '' : ' (short of ' + FRAMES + ')'}  ${got.label}`);
      if (got.bytes > LANDING_LOOK_MAX_BYTES || !reached) failed++;
    }
    await page.close();
  }
} finally {
  await browser.close();
  stop();
}
process.exit(failed ? 1 : 0);
