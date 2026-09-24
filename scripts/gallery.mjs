#!/usr/bin/env node
/**
 * Every preset, photographed (docs/presets-plan.md).
 *
 *   npm run gallery
 *
 * The presets are judged by eye, and an eye needs pictures. `looks` measures
 * each preset — flat, empty, dark, drained — and writes nothing; `shots` takes
 * six hand-picked stills for the docs. This takes every preset in a fresh
 * page, with the band playing (the looks are built to move to music), at a
 * few moments after it is laid, and writes:
 *
 *   gallery/<id>-<t>s.jpg     each moment, 480px wide
 *   gallery/contact.jpg       all of them on one sheet, a row per preset
 *   gallery/index.json        what each frame is, and anything that failed
 *
 * The contact sheet is the point: one picture that shows whether the set is
 * diverse, whether the colours sing, and which look went black.
 *
 * Needs a GPU that presents WebGPU — the macOS runner, via
 * .github/workflows/gallery.yml, which uploads the folder as an artifact.
 *
 *   GALLERY_ONLY=a,b   just these presets
 *   GALLERY_TIMES=8,20,40   seconds after load (default)
 *   GALLERY_OUT=gallery
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { PRESETS } from '../src/presets.ts';
import { engineQuery, installFrameReader, lastFrameRead } from './frame.mjs';

const PORT = Number(process.env.GALLERY_PORT ?? 4344);
const OUT = process.env.GALLERY_OUT ?? 'gallery';
const ONLY = process.env.GALLERY_ONLY ? process.env.GALLERY_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;
const TIMES = (process.env.GALLERY_TIMES || '8,20,40').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
const WIDTH = 480;

fs.mkdirSync(OUT, { recursive: true });

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${code}) — port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const looks = PRESETS.filter((p) => !ONLY || ONLY.includes(p.id));
const index = [];
const browser = await launchChromium(chromium);
try {
  console.log(`  ${looks.length} presets at ${TIMES.join(', ')}s\n`);
  for (const preset of looks) {
    const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/lrclib|favicon|net::ERR|Failed to load resource/i.test(t)) return;
      errors.push(t.slice(0, 160));
    });
    await installFrameReader(page);
    await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${preset.id}${engineQuery()}`, { waitUntil: 'load' });
    await page.mouse.click(8, 8);   // the gesture the band needs
    const t0 = Date.now();
    const row = { id: preset.id, name: preset.name, frames: [], errors };
    for (const t of TIMES) {
      const wait = t * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.evaluate(() => document.body.classList.add('overlays-hidden'));
      const dataUrl = await page.evaluate(async (width) => {
        const size = await window.__cgShot?.('gallery');
        const img = window.__shots?.gallery;
        if (!size || !img) return null;
        const full = document.createElement('canvas');
        full.width = img.width; full.height = img.height;
        full.getContext('2d').putImageData(img, 0, 0);
        const out = document.createElement('canvas');
        const scale = Math.min(1, width / img.width);
        out.width = Math.round(img.width * scale); out.height = Math.round(img.height * scale);
        const ctx = out.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(full, 0, 0, out.width, out.height);
        return out.toDataURL('image/jpeg', 0.85);
      }, WIDTH);
      const status = await page.evaluate(() => {
        const d = window.chromaglassDebug?.();
        const r = (n) => (Number.isFinite(n) ? +n.toFixed(4) : String(n));
        const plates = (d?.plateStats?.() ?? []).map((p) => ({ mean: r(p.mean), colour: p.colour.map(r), nan: p.nan, vmax: r(p.vmax) }));
        return { engine: d?.engine ?? '', evolve: d?.crash?.latest?.()?.snap?.evolve ?? null, plates };
      });
      if (!dataUrl) {
        row.frames.push({ t, file: null, why: JSON.stringify(await lastFrameRead(page)).slice(0, 200) });
        console.log(`  ${preset.id.padEnd(22)} ${String(t).padStart(3)}s  no frame`);
        continue;
      }
      const file = `${preset.id}-${t}s.jpg`;
      fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
      row.frames.push({ t, file, engine: status.engine, plates: status.plates });
    }
    // What was on the plate at each moment: fill, and a count of cells that
    // are not a number. A bare-ground frame is empty or poisoned; this says which.
    const plateNote = row.frames.map((f) => (f.plates ?? []).map((p) => `${p.mean}${p.nan ? ` NaN×${p.nan}` : ''}`).join('/')).join(' ');
    console.log(`  ${preset.id.padEnd(22)} ${row.frames.filter((f) => f.file).length}/${TIMES.length} frames${errors.length ? `, ${errors.length} console errors` : ''}  fill ${plateNote}`);
    index.push(row);
    await page.close();
  }

  // The contact sheet: laid out as HTML and photographed, which keeps this
  // free of an image library.
  const img = (f) => f?.file ? `data:image/jpeg;base64,${fs.readFileSync(path.join(OUT, f.file)).toString('base64')}` : '';
  const rows = index.map((r) => `<tr><th>${r.name}<br><small>${r.id}</small></th>${TIMES.map((t) => {
    const f = r.frames.find((x) => x.t === t);
    return `<td>${f?.file ? `<img src="${img(f)}">` : '<div class="miss">no frame</div>'}<small>${t}s</small></td>`;
  }).join('')}</tr>`).join('');
  const sheet = await browser.newPage({ viewport: { width: 200 + TIMES.length * (WIDTH / 2 + 12), height: 600 } });
  await sheet.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:12px system-ui">
    <style>td,th{padding:4px;vertical-align:top;text-align:left}th{width:180px}img{width:${WIDTH / 2}px;display:block}.miss{width:${WIDTH / 2}px;height:${WIDTH / 3.2}px;background:#400}</style>
    <table>${rows}</table></body></html>`, { waitUntil: 'load' });
  await sheet.screenshot({ path: path.join(OUT, 'contact.jpg'), type: 'jpeg', quality: 80, fullPage: true });
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`\n  wrote ${OUT}/contact.jpg and ${index.reduce((n, r) => n + r.frames.filter((f) => f.file).length, 0)} frames`);
} finally {
  await browser.close();
  stop();
}
