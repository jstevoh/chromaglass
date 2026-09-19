#!/usr/bin/env node
/**
 * The ChromaGlass mark, drawn by code.
 *
 *   npm run brand
 *
 * Writes every icon, the header wordmark and the share card from
 * `scripts/brand/art.mjs`, so a change to the mark is a change to one file and
 * every size follows it — the same reason `npm run shots` generates the README's
 * pictures rather than keeping photographs of a version nobody runs.
 *
 *   public/favicon.svg              the tab icon, drawn light: no glow, no filaments
 *   public/icon-192.png, -512.png   installed-app icons (rounded tile, clear corners)
 *   public/icon-maskable-512.png    full bleed, burst inside Android's safe circle
 *   public/apple-touch-icon.png     full bleed; iOS rounds the corners itself
 *   public/og-card.png              what a shared link unfurls into
 *   src/assets/brand/lockup.svg     mark and name, for the headers
 *   src/assets/brand/mark.svg       the dish alone, where the name will not fit
 *   docs/brand/…                    the same at full detail, plus the sizes other
 *                                   services ask for (Google's sign-in screen,
 *                                   profile pictures)
 *
 * The words come from `scripts/brand/words.json` — the letters already turned
 * into shapes — so this needs no font installed. `scripts/brand/outline.mjs`
 * rebuilds that file when the words change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { icon, lockup, shareCard } from './brand/art.mjs';

const words = JSON.parse(fs.readFileSync('scripts/brand/words.json', 'utf8'));

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log(`  ${file}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
};

console.log('SVG');
write('public/favicon.svg', icon({ shape: 'tile', detail: 'low' }));
write('src/assets/brand/lockup.svg', lockup(words, { detail: 'medium' }));
write('src/assets/brand/mark.svg', icon({ shape: 'circle', detail: 'medium' }));
write('docs/brand/lockup.svg', lockup(words, { detail: 'high' }));
write('docs/brand/icon.svg', icon({ shape: 'tile', detail: 'high' }));

// Rasterised by the browser, the one renderer every place these end up agrees with.
const PNG = [
  ['public/icon-512.png', icon({ shape: 'tile' }), 512, 512],
  ['public/icon-192.png', icon({ shape: 'tile' }), 192, 192],
  // Android crops a maskable icon to anything from a circle to a squircle and
  // guarantees only the middle 80%; at 0.7 the longest finger ends inside it.
  ['public/icon-maskable-512.png', icon({ shape: 'square', scale: 0.7 }), 512, 512],
  ['public/apple-touch-icon.png', icon({ shape: 'square', scale: 0.92 }), 180, 180],
  ['public/og-card.png', shareCard(words), 1200, 630],
  ['docs/brand/google-logo-120.png', icon({ shape: 'tile' }), 120, 120],
  ['docs/brand/avatar-800.png', icon({ shape: 'square', scale: 0.8 }), 800, 800],
];

console.log('PNG');
const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, svg, w, h] of PNG) {
    await page.setViewportSize({ width: w, height: h });
    const sized = svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
    await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    console.log(`  ${file}  ${w}×${h}  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
  }
} finally {
  await browser.close();
}
