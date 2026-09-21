#!/usr/bin/env node
/**
 * How much structure does a frame carry, and at what scale?
 *
 * The gap between our plate and filmed liquid is not colour or motion, it is
 * detail: a pour keeps hard boundaries and texture at every scale, while a
 * diffusing solver smooths everything below about eight cells within a second.
 * This measures that, so a change to the solver can be judged by a number
 * rather than by eye.
 *
 *   node scripts/detail.mjs frame.png [more.jpg ...]
 *
 * Every image is centre-cropped square and scaled to 512 px, so a 4K still and
 * a laptop screenshot are comparable. Reported per image:
 *
 *   lit%    how much of the crop is plate rather than the black around it.
 *           `p50g` is the *median* pixel's gradient, so on a frame that is
 *           half background it is a reading of the background. Read it
 *           against this, or measure a preset that fills the frame.
 *   edge%   pixels whose local gradient exceeds 30 (hard boundaries)
 *   p50g    the typical local gradient (texture everywhere, not just at edges)
 *   p99g    how hard the hardest edges are
 *   detail  variance surviving at 1, 2, 4, 8, 16 and 32 px, as a % of the total:
 *           a smooth image has lost everything by 4 px, a detailed one has not
 *
 * Filmed reference (frames from a 4K liquid film, for comparison):
 *   pour      edge 7.3%  p50 7.2   detail@4px 1.5%  @8px 2.3%
 *   drops     edge 4.2%  p50 2.0   detail@4px 0.9%  @8px 2.2%
 *   marbling  edge 5.6%  p50 6.5   detail@4px 1.3%  @8px 2.5%
 *   ChromaGlass, Fillmore, before this work:
 *             edge 2.4%  p50 0.8   detail@4px 0.3%  @8px 0.5%
 *
 * Needs Playwright for image decoding (the Mac's ~/cg-scratch has it); run it
 * from a directory where `playwright` resolves. It borrows an installed Chrome
 * when Playwright's own headless shell is not downloaded; CHROMIUM_PATH wins.
 */
// Playwright is only a decoder here, and it is not a dependency of the app, so
// it is resolved from this script, then from the working directory.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
let chromium;
for (const resolve of [() => 'playwright', () => pathToFileURL(createRequire(process.cwd() + '/').resolve('playwright')).href]) {
  // A CommonJS build reached by file URL exposes its exports under `default`.
  try { const m = await import(resolve()); chromium = m.chromium ?? m.default?.chromium; if (chromium) break; } catch { /* try the next */ }
}
if (!chromium) { console.error('scripts/detail.mjs needs Playwright to decode images. Run it from a directory where `playwright` resolves (the Mac has it in ~/cg-scratch), or `npm i -D playwright` first.'); process.exit(2); }
import fs from 'node:fs';
const files = process.argv.slice(2);
if (files.length === 0) { console.error('usage: node scripts/detail.mjs <image> [image ...]'); process.exit(2); }
// Playwright's own headless shell is often not downloaded on a machine that
// only uses the installed browser, so fall back to whatever Chrome is there.
const CHROME = [
  process.env.CHROMIUM_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
let browser;
for (const exe of [undefined, ...CHROME]) {
  try { browser = await chromium.launch(exe ? { executablePath: exe } : {}); break; } catch { /* try the next */ }
}
if (!browser) { console.error('No browser to decode with. Set CHROMIUM_PATH to a Chrome or Chromium binary, or run `npx playwright install chromium`.'); process.exit(2); }
const page = await browser.newPage();
await page.goto('about:blank');
const rows = [];
for (const f of files) {
  const b64 = fs.readFileSync(f).toString('base64');
  const ext = f.endsWith('.png') ? 'png' : 'jpeg';
  const r = await page.evaluate(async ({ b64, ext }) => {
    const img = new Image(); img.src = `data:image/${ext};base64,${b64}`;
    await img.decode();
    // Centre crop 720x720 then scale to 512 so every source is compared at the same size.
    const S = 512, side = Math.min(img.width, img.height);
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
    const d = x.getImageData(0, 0, S, S).data;
    const lum = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) lum[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    // Sobel-ish gradient
    const g = [];
    for (let y = 1; y < S - 1; y++) for (let xx = 1; xx < S - 1; xx++) {
      const i = xx + y * S;
      const gx = lum[i + 1] - lum[i - 1], gy = lum[i + S] - lum[i - S];
      g.push(Math.hypot(gx, gy));
    }
    g.sort((a, b) => a - b);
    const q = p => g[Math.floor(g.length * p)];
    const edge = g.filter(v => v > 30).length / g.length;
    // Octave energy: variance of (blur_k - blur_2k), normalised by total variance.
    const blur = (src, k) => { // separable box
      const t = new Float32Array(S * S), o = new Float32Array(S * S);
      for (let y = 0; y < S; y++) { let s = 0; for (let xx = -k; xx <= k; xx++) s += src[Math.min(S - 1, Math.max(0, xx)) + y * S];
        for (let xx = 0; xx < S; xx++) { t[xx + y * S] = s / (2 * k + 1); s += src[Math.min(S - 1, xx + k + 1) + y * S] - src[Math.max(0, xx - k) + y * S]; } }
      for (let xx = 0; xx < S; xx++) { let s = 0; for (let y = -k; y <= k; y++) s += t[xx + Math.min(S - 1, Math.max(0, y)) * S];
        for (let y = 0; y < S; y++) { o[xx + y * S] = s / (2 * k + 1); s += t[xx + Math.min(S - 1, y + k + 1) * S] - t[xx + Math.max(0, y - k) * S]; } }
      return o;
    };
    const varOf = a => { let m = 0; for (const v of a) m += v; m /= a.length; let s = 0; for (const v of a) s += (v - m) ** 2; return s / a.length; };
    const total = varOf(lum);
    const oct = {}; let prev = lum;
    for (const k of [1, 2, 4, 8, 16, 32]) { const b = blur(lum, k); const diff = new Float32Array(S * S); for (let i = 0; i < S * S; i++) diff[i] = prev[i] - b[i]; oct[k] = +(varOf(diff) / total * 100).toFixed(1); prev = b; }
    // Colour spread: mean saturation and the count of distinct hue bins holding >1% of pixels
    let sat = 0; const hb = new Array(36).fill(0);
    for (let i = 0; i < S * S; i++) { const r = d[i * 4] / 255, gg = d[i * 4 + 1] / 255, bb = d[i * 4 + 2] / 255;
      const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb); const s = mx === 0 ? 0 : (mx - mn) / mx; sat += s;
      if (s > 0.15) { let h = 0; const dd = mx - mn; if (dd > 0) { h = mx === r ? ((gg - bb) / dd % 6) : mx === gg ? ((bb - r) / dd + 2) : ((r - gg) / dd + 4); h = (h * 60 + 360) % 360; } hb[Math.floor(h / 10)]++; } }
    // How much of the crop is plate at all.
    //
    // Without it `p50g` is a trap. Half of a Fillmore frame is the black
    // around the dishes, so the median pixel's gradient is the background's
    // and a change that moves the covered fraction a little moves p50g from
    // 0.7 to 0 while the plate itself gains structure — which is exactly
    // what happened the first time particles were measured on it. On a
    // frame-filling preset the same plate reads p50g 23. Read p50g against
    // this column, or on a crop that is all plate.
    let litPx = 0;
    for (let i = 0; i < S * S; i++) if (lum[i] > 8) litPx++;
    const lit = litPx / (S * S);
    return { edge: +(edge * 100).toFixed(1), p50: +q(0.5).toFixed(1), p99: +q(0.99).toFixed(1), oct, sat: +(sat / (S * S)).toFixed(2), hues: hb.filter(v => v > S * S * 0.01).length, lit: +(lit * 100).toFixed(0) };
  }, { b64, ext });
  rows.push({ file: f.split('/').pop(), ...r });
}
await browser.close();
console.log('file'.padEnd(26), 'lit%', 'edge%', 'p50g', 'p99g', 'sat', 'hues', ' detail by scale (1,2,4,8,16,32 px, % of variance)');
for (const r of rows) console.log(r.file.padEnd(26), String(r.lit).padStart(4), String(r.edge).padStart(5), String(r.p50).padStart(4), String(r.p99).padStart(4), String(r.sat).padStart(4), String(r.hues).padStart(4), ' ', [1,2,4,8,16,32].map(k => String(r.oct[k]).padStart(5)).join(''));
