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
 *   ios/…/AppIcon-512@2x.png        the iPhone app's icon, 1024 full bleed
 *   desktop/resources/icon.icns     the Mac app's icon, on macOS's own grid (PLAN 13-icon)
 *   public/og-card.png              what a shared link unfurls into
 *   src/assets/brand/lockup.svg     mark and name, for the headers
 *   src/assets/brand/mark.svg       the dish alone, where the name will not fit
 *   public/intro-*.svg              the intro's burst, hub and name (src/lib/intro.ts),
 *                                   apart because the burst turns under the other two
 *   docs/brand/…                    the same at full detail, plus the sizes other
 *                                   services ask for (Google's sign-in screen,
 *                                   profile pictures)
 *   docs/brand/store/…              Google Play's 512 icon and 1024 × 500 feature
 *                                   graphic (PLAN 12.6; the App Store's icon is the
 *                                   iPhone app's own 1024 above)
 *   public/press/logo/…             the press page's downloads (PLAN 37k): the icon
 *                                   and the lockup as SVG and as large PNGs
 *
 * The words come from `scripts/brand/words.json` — the letters already turned
 * into shapes — so this needs no font installed. `scripts/brand/outline.mjs`
 * rebuilds that file when the words change.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { icon, lockup, shareCard, featureGraphic, introLayers } from './brand/art.mjs';

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
const intro = introLayers(words, { detail: 'medium' });
write('public/intro-burst.svg', intro.burst);
write('public/intro-hub.svg', intro.hub);
write('public/intro-name.svg', intro.name);
write('public/press/logo/chromaglass-icon.svg', icon({ shape: 'tile', detail: 'high' }));
// The lockup's SVG at the headers' detail: at full detail it is 112 KB, over
// `npm run sizes`'s 100 KB for a new file, and the difference (more points on
// the filaments) does not show at any size a page prints it. The PNG below is
// drawn from the full detail.
write('public/press/logo/chromaglass-lockup.svg', lockup(words, { detail: 'medium' }));
const pressLockup = lockup(words, { detail: 'high' });
// The lockup's PNG keeps its own shape at 2400 wide, the width a print layout asks for.
const [, , lw, lh] = pressLockup.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);

// Rasterised by the browser, the one renderer every place these end up agrees with.
const PNG = [
  ['public/icon-512.png', icon({ shape: 'tile' }), 512, 512],
  ['public/icon-192.png', icon({ shape: 'tile' }), 192, 192],
  // Android crops a maskable icon to anything from a circle to a squircle and
  // guarantees only the middle 80%; at 0.7 the longest finger ends inside it.
  ['public/icon-maskable-512.png', icon({ shape: 'square', scale: 0.7 }), 512, 512],
  ['public/apple-touch-icon.png', icon({ shape: 'square', scale: 0.92 }), 180, 180],
  // The iPhone app's icon (PLAN.md §12): the touch icon's drawing at the one
  // size Xcode asks for. Full bleed and opaque, as the App Store requires.
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', icon({ shape: 'square', scale: 0.92 }), 1024, 1024],
  ['public/og-card.png', shareCard(words), 1200, 630],
  ['docs/brand/google-logo-120.png', icon({ shape: 'tile' }), 120, 120],
  ['docs/brand/avatar-800.png', icon({ shape: 'square', scale: 0.8 }), 800, 800],
  // Play draws its own rounded mask over a full-bleed square, and keeps the
  // middle of it, so the dish is inset as the profile picture's is.
  ['docs/brand/store/play-icon-512.png', icon({ shape: 'square', scale: 0.8 }), 512, 512],
  ['docs/brand/store/play-feature-1024x500.png', featureGraphic(words), 1024, 500],
  ['public/press/logo/chromaglass-icon-1024.png', icon({ shape: 'tile' }), 1024, 1024],
  ['public/press/logo/chromaglass-lockup-2400.png', pressLockup, 2400, Math.round(2400 * lh / lw)],
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

  // The Mac app's icon (PLAN 13-icon). It was the website's 512 tile, which
  // electron-builder scaled into an .icns: a flat square edge to edge in the
  // Dock, where every other app sits on macOS's grid with a margin and a
  // shadow. An .icns is a list of PNGs by size, each under a four-letter type
  // (Apple's "icns" format: the magic, the file's length, then type, length
  // and data for each), so it is written here from the same drawing as every
  // other icon, with no Mac tool. The smallest sizes are drawn without the
  // glow and filaments, which at 16 and 32 pixels are only a smear.
  console.log('ICNS');
  const png = {};
  for (const size of [16, 32, 64, 128, 256, 512, 1024]) {
    const svg = icon({ shape: 'mac', detail: size <= 32 ? 'low' : 'high' }).replace('<svg ', `<svg width="${size}" height="${size}" `);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    png[size] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  const types = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
  const entries = types.map(([type, size]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(8 + png[size].length, 4);
    return Buffer.concat([head, png[size]]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + entries.reduce((n, e) => n + e.length, 0), 4);
  const file = 'desktop/resources/icon.icns';
  fs.writeFileSync(file, Buffer.concat([head, ...entries]));
  console.log(`  ${file}  ${types.length} sizes  ${(fs.statSync(file).size / 1024).toFixed(1)} KB`);
} finally {
  await browser.close();
}
