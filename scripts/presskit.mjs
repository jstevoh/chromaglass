#!/usr/bin/env node
/**
 * Is what we hand to the outside world what it says it is?
 *
 *   npm run presskit
 *
 * Two things leave the project for other people to use without asking us:
 * the press page (PLAN.md 37k, public/press.html at /press), whose readers
 * download a still for print or paste our two sentences into an article, and
 * the store listings (PLAN.md 12.6, docs/store-listings.md), which are pasted
 * into App Store Connect and the Play Console. Neither is read by any other
 * check, and each fails quietly: a still that 404s only when a newsletter's
 * editor clicks it, a price that changed on the landing page and not here, a
 * subtitle Apple cuts at 30 characters, a feature graphic Play refuses for its
 * alpha channel. So this reads the files themselves, not the page's captions:
 *
 *   1. /press is routed to the page before the app's catch-all, and every
 *      file the page links or shows exists in public/;
 *   2. six stills and two clips, the numbers 37k asks for; each still a JPEG
 *      at least 2400 px wide (a print column at 300 dpi is about 8 inches),
 *      read from its own frame header; each clip an MP4 whose index comes
 *      before its data (+faststart, or a phone downloads all of it before the
 *      first frame) and whose length, read from its own header, is the
 *      caption's to the second; the clips' music credit is on the page while
 *      any clip is;
 *   3. the logo PNGs are the sizes their captions name, read from the PNG;
 *   4. the prices on the page are the landing page's (src/components/Landing.tsx);
 *   5. each store listing field is filled and within its store's limit, no
 *      listing names a price or a way to buy (both apps are free with nothing
 *      to buy, PLAN.md §12), and the store pictures are the sizes the stores
 *      ask for, opaque where they must be;
 *   6. in Chromium, the page at a 360 px phone and at 1280 px scrolls only up
 *      and down, and every picture on it loads.
 *
 * What it cannot see: whether a still is a good picture. That is the owner's
 * eye, on the page itself.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const PAGE = 'public/press.html';
const LISTINGS = 'docs/store-listings.md';
const html = fs.readFileSync(PAGE, 'utf8');
const pub = (url) => path.join('public', decodeURIComponent(url.split(/[?#]/)[0]));

// 1. Routing, and every file the page names.
const fb = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
const rw = fb.hosting.rewrites;
const at = rw.findIndex((r) => r.source === '/press' && r.destination === '/press.html');
const all = rw.findIndex((r) => r.source === '**');
check('/press is routed to press.html before the app takes every path', at >= 0 && (all < 0 || at < all), `rewrite at ${at}, catch-all at ${all}`);
// Hosting applies redirects before rewrites, so one matching /press would send
// a reader elsewhere however the rewrite reads.
const redirected = (fb.hosting.redirects || []).filter((d) => d.source === '/press' || d.source === '**' || d.source === '/press/**' || d.source === '/press.html');
check('no redirect takes /press first', redirected.length === 0, redirected.map((d) => d.source).join(', '));

// The app's own routes are pages, not files.
const ROUTES = new Set(['/', '/show', '/pro']);
const urls = [...html.matchAll(/\b(?:href|src|poster)="(\/[^"]*)"/g)].map((m) => m[1]).filter((u) => !ROUTES.has(u));
const missing = [...new Set(urls)].filter((u) => !fs.existsSync(pub(u)));
check(`every file the page links or shows is in public/ (${new Set(urls).size} files)`, missing.length === 0, missing.join(', '));

// 2. Stills and clips.
const stills = [...new Set(urls.filter((u) => /^\/press\/stills\/[^/]+\.jpe?g$/.test(u)))];
const clips = [...new Set(urls.filter((u) => /^\/press\/clips\/[^/]+\.mp4$/.test(u)))];
check('six stills to download', stills.length === 6, `${stills.length}`);
check('two clips to download', clips.length === 2, `${clips.length}`);

// A JPEG's size is in its start-of-frame marker (SOF0 to SOF15, less the
// three that are not frames), after any number of other segments.
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  return null;
}
// The figure a link sits in, for what its caption says.
const figureOf = (u) => {
  const at = html.indexOf(`"${u}"`);
  return at < 0 ? '' : html.slice(html.lastIndexOf('<figure', at), html.indexOf('</figure>', at));
};
for (const u of stills) {
  if (!fs.existsSync(pub(u))) continue;
  const buf = fs.readFileSync(pub(u));
  const s = jpegSize(buf);
  const mb = buf.length / 1048576;
  const [, cw, ch] = (figureOf(u).match(/(\d+) × (\d+) JPEG/) || []).map(Number);
  check(`${u} is a JPEG at least 2400 px wide, the size its caption says, under 3 MB`, !!s && s.w >= 2400 && s.w === cw && s.h === ch && mb < 3, s ? `${s.w}×${s.h} (caption ${cw}×${ch}), ${mb.toFixed(2)} MB` : 'not a JPEG');
}

// An MP4 is a list of boxes, each a 32-bit size and a 4-letter type. The
// length is in moov/mvhd: duration over timescale, at offsets that depend on
// the box's version.
function mp4(buf) {
  const top = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    let size = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    if (size === 1) size = Number(buf.readBigUInt64BE(i + 8));
    if (size === 0) size = buf.length - i;
    if (size < 8) break;
    top.push({ type, at: i, size });
    i += size;
  }
  const moov = top.find((b) => b.type === 'moov');
  let seconds = null, w = 0, h = 0, sound = false;
  if (moov) {
    // Every search stays inside moov, so a stray four letters in the video's
    // own data can never be read as a header.
    const end = moov.at + moov.size;
    const find = (type, from) => { const k = buf.indexOf(type, from, 'latin1'); return k > 0 && k + 4 < end ? k : -1; };
    const m = find('mvhd', moov.at);
    if (m > 0) {
      const v = buf[m + 4];
      const ts = v === 1 ? buf.readUInt32BE(m + 24) : buf.readUInt32BE(m + 16);
      const dur = v === 1 ? Number(buf.readBigUInt64BE(m + 28)) : buf.readUInt32BE(m + 20);
      seconds = dur / ts;
    }
    // Each track's header ends with its width and height in 16.16 fixed
    // point, after a version-dependent block of times and a 36-byte matrix.
    for (let k = find('tkhd', moov.at); k > 0; k = find('tkhd', k + 4)) {
      const off = buf[k + 4] === 1 ? 92 : 80;
      w = Math.max(w, buf.readUInt32BE(k + off) / 65536);
      h = Math.max(h, buf.readUInt32BE(k + off + 4) / 65536);
    }
    // A handler box names its track's kind four bytes past its flags.
    for (let k = find('hdlr', moov.at); k > 0; k = find('hdlr', k + 4)) {
      if (buf.toString('latin1', k + 12, k + 16) === 'soun') sound = true;
    }
  }
  return { types: top.map((b) => b.type), seconds, w, h, sound };
}
for (const u of clips) {
  if (!fs.existsSync(pub(u))) continue;
  const buf = fs.readFileSync(pub(u));
  const { types, seconds, w, h, sound } = mp4(buf);
  const mb = buf.length / 1048576;
  const moov = types.indexOf('moov'), mdat = types.indexOf('mdat');
  check(`${u} is an MP4 that starts playing before it has all downloaded, under 15 MB`, types[0] === 'ftyp' && moov >= 0 && mdat >= 0 && moov < mdat && mb < 15, `${types.join(' ')}, ${mb.toFixed(2)} MB`);
  const fig = figureOf(u);
  const said = Number((fig.match(/(\d+)\s*s\s*·/) || [])[1]);
  check(`${u} is as long as its caption says`, seconds != null && Math.abs(seconds - said) < 1, `${seconds?.toFixed(2)} s, caption ${said} s`);
  const lines = Number((fig.match(/(\d+)p MP4/) || [])[1]);
  check(`${u} is the ${lines}p its caption says, with a sound track`, h === lines && w === Math.round(lines * 16 / 9) && sound, `${w}×${h}, sound ${sound}`);
}
const credit = (html.match(/<p class="note" id="music">([\s\S]*?)<\/p>/) || [])[1] || '';
check("the clips' music credit is on the page", clips.length === 0 || (/Kevin MacLeod/.test(credit) && /Attribution 4\.0/.test(credit)), credit.slice(0, 60));

// 3. PNG sizes from the PNG's own header.
const pngInfo = (file) => {
  const b = fs.readFileSync(file);
  // Transparent if its colour type carries alpha, or a tRNS chunk (before the
  // image data) gives a palette or RGB image a see-through colour.
  const trns = b.indexOf('tRNS', 8, 'latin1'), idat = b.indexOf('IDAT', 8, 'latin1');
  return b.toString('latin1', 1, 4) === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6 || (trns > 0 && trns < idat) } : null;
};
// The logo PNGs the page links, each named for its width (…-1024.png).
const logos = [...new Set(urls.filter((u) => /^\/press\/logo\/.+\.png$/.test(u)))];
check('the logo comes as PNGs as well as SVGs', logos.length >= 2, `${logos.length}`);
for (const u of logos) {
  const w = Number((u.match(/-(\d+)\.png$/) || [])[1]);
  const p = fs.existsSync(pub(u)) && pngInfo(pub(u));
  check(`${u} is the ${w} px wide its name says`, !!p && p.w === w, p ? `${p.w}×${p.h}` : 'missing');
}

// 4. Prices: the landing page's tier cards are where the price is set for the
// site; this page repeats them and must change with them.
const landing = fs.readFileSync('src/components/Landing.tsx', 'utf8');
for (const tier of ['home', 'pro']) {
  const there = (landing.match(new RegExp(`id: '${tier}',[\\s\\S]*?price: '(\\$[\\d,.]+)'`)) || [])[1];
  const here = (html.match(new RegExp(`data-price="${tier}">([^<]*)<`)) || [])[1] || '';
  // The whole number: "$199" must not pass for a landing price of "$19".
  const same = !!there && new RegExp(`\\${there}(?![\\d.,])`).test(here);
  check(`the ${tier} price is the landing page's`, same, `landing ${there}, press "${here}"`);
}
check('the page names who to write to', html.includes('href="mailto:support@chromaglass.art"'));

// 5. The store listings.
const md = fs.readFileSync(LISTINGS, 'utf8');
// The stores' own limits, kept here and not read from the file this guards:
// a heading raised to (40) must not let a 36-character subtitle through.
// App Store Connect's and the Play Console's field limits as of 2026-11.
const LIMITS = {
  'App Store': { 'Name': 30, 'Subtitle': 30, 'Promotional text': 170, 'Description': 4000, 'Keywords': 100, "What's New": 4000, 'Review notes': 4000 },
  'Google Play': { 'App name': 30, 'Short description': 80, 'Full description': 4000 },
};
const fields = [...md.matchAll(/^### (App Store|Google Play): ([^(\n]+) \((\d+)\)\n+```text\n([\s\S]*?)\n```/gm)]
  .map(([, store, field, limit, text]) => ({ store, field: field.trim(), limit: Number(limit), text }));
const headings = (md.match(/^### (App Store|Google Play): /gm) || []).length;
check('every store field heading has its text block', fields.length === headings, `${fields.length} of ${headings}`);
for (const [store, want] of Object.entries(LIMITS)) {
  for (const [field, limit] of Object.entries(want)) {
    const f = fields.find((x) => x.store === store && x.field === field);
    // Apple and Google both count characters, not bytes; a code point is a character here.
    const n = f ? [...f.text].length : 0;
    check(`${store} ${field}: filled and within the store's ${limit}`, !!f && f.limit === limit && n > 0 && n <= limit, f ? `${n} characters, heading says ${f.limit}` : 'missing');
  }
}
const extra = fields.filter((f) => !(LIMITS[f.store] || {})[f.field]);
check('no listing field the script does not know the limit of', extra.length === 0, extra.map((f) => `${f.store} ${f.field}`).join(', '));
// Both apps are free with nothing to buy (PLAN.md §12): no price in any
// currency, no tier, no way to pay.
const SELLING = /[$€£¥]\s?\d|chromaglass\.art\/pro|lemon\s?squeezy|in-app purchase|upgrade|\bbuy\b(?! anything)|\bunlock|\bsubscri\w*|\bpremium\b|\bpaid\b|\b(Home|Pro) (tier|version|licen[cs]e)\b|\bPro\b/i;
const selling = fields.filter((f) => SELLING.test(f.text.replace(/nothing to buy/gi, '')));
check('no listing names a price, a tier or a way to buy', selling.length === 0, selling.map((f) => `${f.store} ${f.field}: "${f.text.match(SELLING)[0]}"`).join(', '));
// In the iPhone's web view there is no Web MIDI, no capture of other apps'
// sound and no projector window (§12), so its listing promises none of them.
const LAPTOP_ONLY = /\bMIDI\b|\bprojector\b(?! show)|\bAbleton\b|\bLink\b|\bsystem audio\b|\bOSC\b|\bArt-Net\b|\bSyphon\b|\bNDI\b/i;
const laptop = fields.filter((f) => f.store === 'App Store' && LAPTOP_ONLY.test(f.text.replace(/overhead-projector show/g, '')));
check('the App Store listing promises nothing only a laptop does', laptop.length === 0, laptop.map((f) => `${f.field}: "${f.text.match(LAPTOP_ONLY)[0]}"`).join(', '));
for (const [file, w, h, opaque] of [
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024, 1024, true],
  ['docs/brand/store/play-icon-512.png', 512, 512, false],
  ['docs/brand/store/play-feature-1024x500.png', 1024, 500, true],
]) {
  const p = fs.existsSync(file) && pngInfo(file);
  check(`${file} is ${w}×${h}${opaque ? ' with no alpha channel' : ''}`, !!p && p.w === w && p.h === h && (!opaque || !p.alpha), p ? `${p.w}×${p.h}, alpha ${p.alpha}` : 'missing');
}

// 6. The page in a browser, served from public/ as Hosting serves it.
// Fonts and anything else off-site are refused so the check is the same with
// or without a network; the page falls back to the system font.
const server = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/press') u = '/press.html';
  const file = pub(u);
  if (!file.startsWith('public') || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  const type = { '.html': 'text/html', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4' }[path.extname(file)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
// Every <img> written in the page, so a picture taken out of the page and out
// of the count together still fails.
const IMGS = (html.match(/<img\b/g) || []).length;
const { chromium } = await import('playwright');
const { launchChromium } = await import('./chromium.mjs');
const browser = await launchChromium(chromium);
try {
  for (const [label, viewport] of [['a 360 px phone', { width: 360, height: 740 }], ['a 1280 px laptop', { width: 1280, height: 800 }]]) {
    const page = await browser.newPage({ viewport });
    await page.route((url) => !url.href.startsWith(origin), (r) => r.abort());
    await page.goto(`${origin}/press`, { waitUntil: 'load' });
    // Lazy pictures load as they come into view: walk down the page.
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y <= h; y += viewport.height / 2) { await page.evaluate((y) => window.scrollTo(0, y), y); await page.waitForTimeout(30); }
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
      title: document.title,
      broken: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      n: document.images.length,
      blurb: document.getElementById('blurb')?.textContent.trim().split(/(?<=[.!?])\s+/).length,
    }));
    check(`on ${label}, /press opens the press page and scrolls only up and down`, r.title.includes('press') && r.sw <= r.iw, `scroll width ${r.sw}, window ${r.iw}`);
    check(`on ${label}, every picture loads`, r.n === IMGS && r.broken.length === 0, `${r.n - r.broken.length} of ${r.n}${r.broken.length ? `; broken ${r.broken.join(', ')}` : ''}`);
    if (label.includes('phone')) check('what it is, in two sentences', r.blurb === 2, `${r.blurb} sentences`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
