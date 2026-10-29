#!/usr/bin/env node
/**
 * The webpage's films (PLAN.md 34a-6; src/lib/siteFilms.ts, LandingFilms.tsx):
 * that every card has its loop and its still, that each piece of music is
 * credited and free to use, and that the cards do what the owner asked for,
 * on a laptop and on a phone.
 *
 *   npm run landingfilms
 *
 * What was asked (the owner, 2026-10-29): the looks on the webpage to animate
 * when a pointer is over them, to open larger, and to be heard. What is
 * checked, on the built webpage (a build with a demo sign-in, as `npm run
 * loadtime` makes it, since the webpage exists only then), no GPU needed:
 *
 *   1. the files: each look on the page has a film in siteFilms.ts, a loop
 *      as MP4 and WebM of LOOP_SECONDS with no sound, under 1.5 MB the two,
 *      and a 640 × 400 still; each piece is on the composer's site with a
 *      checksum, and public/landing/films/SOURCES.md names it and its licence;
 *   2. the page asks for no loop before a card is played, so the first
 *      screen costs what it did;
 *   3. a pointer over a card plays its loop (its clock moves), and leaving
 *      stops it (its clock holds);
 *   4. a card whose minute is on the channel opens it: one dialog, the
 *      embed from youtube-nocookie.com with the film's own id, the music's
 *      credit under it; Escape closes it and the focus is back on the card;
 *   5. on a phone, which cannot hover, the card most in view plays, one at a
 *      time, and swiping the row moves which; a tap opens the film;
 *   6. asking for reduced motion, a pointer plays nothing.
 *
 * The channel is never reached: its embed is answered here with a page of
 * our own, so the check reads what the page asked for and does not depend on
 * the network. Each check is against the same page's state a moment before,
 * so a loop that never plays, or never stops, cannot pass 3 by timing.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, resolve } from 'node:path';
import { SITE_FILMS, LOOP_SECONDS, LICENCE } from '../src/lib/siteFilms.ts';
import { PRESETS } from '../src/presets.ts';

const checks = [];
const check = (n, ok, d = '') => { checks.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

// The looks the page shows, read from its source rather than repeated here.
const landing = readFileSync('src/components/Landing.tsx', 'utf8');
const LOOK_IDS = [...landing.slice(landing.indexOf('const LOOKS'), landing.indexOf('];', landing.indexOf('const LOOKS'))).matchAll(/id: '([^']+)'/g)].map((m) => m[1]);

// 1. The files.
{
  const box = (b, type) => { const i = b.indexOf(Buffer.from(type)); return i < 4 ? -1 : i - 4; };
  const mp4Seconds = (b) => {
    const at = box(b, 'mvhd');
    if (at < 0) return null;
    const v = b[at + 8];
    return v === 1 ? Number(b.readBigUInt64BE(at + 32)) / b.readUInt32BE(at + 28) : b.readUInt32BE(at + 24) / b.readUInt32BE(at + 20);
  };
  const webpSize = (b) => {
    if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
    if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
    return null;
  };
  const sources = existsSync('public/landing/films/SOURCES.md') ? readFileSync('public/landing/films/SOURCES.md', 'utf8') : '';
  const missing = LOOK_IDS.filter((id) => !SITE_FILMS.some((f) => f.look === id));
  check('1. every look on the page has a film, and every film is a look', LOOK_IDS.length >= 8 && !missing.length && SITE_FILMS.every((f) => PRESETS.some((p) => p.id === f.look)),
    `${LOOK_IDS.length} looks on the page${missing.length ? `; no film for ${missing.join(', ')}` : ''}`);
  for (const f of SITE_FILMS) {
    const mp4 = `public/landing/films/${f.look}.mp4`, webm = `public/landing/films/${f.look}.webm`, still = `public/landing/looks/${f.look}.webp`;
    const have = [mp4, webm, still].every(existsSync);
    const m = have ? readFileSync(mp4) : null;
    const secs = m ? mp4Seconds(m) : null;
    const sound = m ? m.includes(Buffer.from('soun')) : true;
    const w = have ? readFileSync(webm) : null;
    const kb = have ? (statSync(mp4).size + statSync(webm).size) / 1024 : 0;
    const size = have ? webpSize(readFileSync(still)) : null;
    check(`1. ${f.look}: a loop of ${LOOP_SECONDS} s with no sound, as MP4 and WebM under 1.5 MB, and a 640 × 400 still`,
      have && secs !== null && Math.abs(secs - LOOP_SECONDS) < 0.1 && !sound && w?.readUInt32BE(0) === 0x1a45dfa3 && kb < 1536 && size?.[0] === 640 && size?.[1] === 400,
      have ? `${secs?.toFixed(2)} s${sound ? ', has sound' : ''}, ${kb.toFixed(0)} KB, still ${size?.join(' × ') ?? 'unreadable'}` : `missing ${[mp4, webm, still].filter((p) => !existsSync(p)).join(', ')}`);
    check(`1. ${f.look}: "${f.track.title}" is fetched from the composer's site with a checksum, and SOURCES.md credits it`,
      /^https:\/\/incompetech\.com\//.test(f.track.url) && /^[0-9a-f]{64}$/.test(f.track.sha256) && sources.includes(`"${f.track.title}"`) && sources.includes(LICENCE.url),
      sources ? '' : 'no public/landing/films/SOURCES.md');
  }
}

const DIST = resolve(process.env.LANDINGFILMS_DIST ?? 'dist-landing');
if (!process.env.LANDINGFILMS_DIST) {
  execSync(`npx vite build --outDir ${DIST} --emptyOutDir`, {
    env: { ...process.env, VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-chromaglass.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'demo-chromaglass', VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(DIST, path);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const body = readFileSync(file);
  // Ranges, as Firebase serves them: a browser asks for a video in pieces.
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const head = { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
  if (range) {
    const a = Number(range[1]), z = range[2] ? Number(range[2]) : body.length - 1;
    res.writeHead(206, { ...head, 'content-range': `bytes ${a}-${z}/${body.length}` });
    res.end(body.subarray(a, z + 1));
  } else { res.writeHead(200, head); res.end(body); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// A film id for every look, for this check only, where none is on the channel yet: the page is built
// from the real list, so the ids are given to it by answering its own chunk (below) with them in.
const IDS = Object.fromEntries(SITE_FILMS.map((f, i) => [f.look, f.youtube ?? `TEST${String(i).padStart(7, '0')}`]));

const browser = await launchChromium(chromium);
let failed = false;
try {
  /** A page on the webpage, the channel's embed answered here, and every film request counted. */
  const open = async (ctx) => {
    const page = await ctx.newPage();
    const asked = { loops: [], embeds: [] };
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith('/landing/films/')) asked.loops.push(u.pathname);
    });
    await page.route('https://www.youtube-nocookie.com/**', (route) => { asked.embeds.push(route.request().url()); route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }); });
    // Films with no id yet are given one, in the built chunk that holds the list, so 4 and 5 have a film to open.
    await page.route(`${base}/assets/**.js`, async (route) => {
      const r = await route.fetch();
      let body = await r.text();
      for (const f of SITE_FILMS) {
        if (f.youtube) continue;
        body = body.replace(new RegExp(`(look:\\s*"${f.look}"[^}]*?youtube:\\s*)null`), `$1"${IDS[f.look]}"`);
      }
      route.fulfill({ response: r, body });
    });
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-cg-landing]', { timeout: 20000 });
    await page.locator('#looks').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    return { page, asked };
  };
  const clock = (page, id) => page.evaluate((id) => { const v = document.querySelector(`video[data-cg-loop="${id}"]`); return v ? { t: v.currentTime, paused: v.paused } : null; }, id);
  const first = LOOK_IDS[0], second = LOOK_IDS[1];

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, asked } = await open(ctx);
    check('2. the page asks for no loop before a card is played', asked.loops.length === 0, asked.loops.join(', ') || 'none asked');

    await page.hover(`[data-cg-look="${first}"]`);
    await page.waitForTimeout(1500);
    const a = await clock(page, first);
    await page.waitForTimeout(1000);
    const b = await clock(page, first);
    check('3. a pointer over a card plays its loop', !!a && !!b && !b.paused && b.t > a.t + 0.3, a && b ? `${a.t.toFixed(2)} s → ${b.t.toFixed(2)} s, ${b.paused ? 'paused' : 'playing'}` : 'no video');
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);
    const c = await clock(page, first);
    await page.waitForTimeout(800);
    const d = await clock(page, first);
    check('3. leaving the card stops it where it is', !!c && !!d && d.paused && Math.abs(d.t - c.t) < 0.05, c && d ? `${c.t.toFixed(2)} s → ${d.t.toFixed(2)} s` : 'no video');
    const other = await clock(page, second);
    check('3. and the card beside it was never played', other === null, other ? `at ${other.t.toFixed(2)} s` : 'not asked for');

    const card = page.locator(`[data-cg-look="${first}"] button`);
    await card.click();
    await page.waitForSelector('[data-cg-player]', { timeout: 5000 }).catch(() => {});
    const dlg = await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"][data-cg-player]')];
      return { n: d.length, src: d[0]?.querySelector('iframe')?.getAttribute('src') ?? '', credit: d[0]?.querySelector('[data-cg-credit]')?.textContent ?? '' };
    });
    const film = SITE_FILMS.find((f) => f.look === first);
    check('4. a click opens the minute from youtube-nocookie.com, the film\'s own id, the music credited',
      dlg.n === 1 && dlg.src.startsWith(`https://www.youtube-nocookie.com/embed/${IDS[first]}?`) && dlg.credit.includes(film.track.title) && dlg.credit.includes(film.track.artist) && dlg.credit.includes(LICENCE.name) && asked.embeds.length === 1,
      `${dlg.n} dialog, ${dlg.src.slice(0, 70)}; "${dlg.credit.trim().slice(0, 80)}"`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const after = await page.evaluate((id) => ({ open: !!document.querySelector('[data-cg-player]'), focus: document.activeElement?.closest('[data-cg-look]')?.getAttribute('data-cg-look') ?? null }), first);
    check('4. Escape closes it, and the focus is back on its card', !after.open && after.focus === first, `${after.open ? 'still open' : 'closed'}, focus on ${after.focus}`);
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const { page } = await open(ctx);
    const playing = () => page.evaluate(() => [...document.querySelectorAll('video[data-cg-loop]')].filter((v) => !v.paused).map((v) => v.dataset.cgLoop));
    await page.waitForTimeout(1500);
    const one = await playing();
    check('5. on a phone the card in view plays, and only it', one.length === 1 && one[0] === first, one.join(', ') || 'none playing');
    await page.evaluate(() => document.querySelector('[data-cg-look]')?.parentElement?.children[2]?.scrollIntoView({ inline: 'start', block: 'nearest' }));
    await page.waitForTimeout(1500);
    const two = await playing();
    const third = LOOK_IDS[2];
    check('5. swiping the row moves which', two.length === 1 && two[0] === third, two.join(', ') || 'none playing');
    await page.locator(`[data-cg-look="${third}"] button`).tap();
    await page.waitForTimeout(500);
    const tapped = await page.evaluate(() => document.querySelector('[data-cg-player] iframe')?.getAttribute('src') ?? '');
    check('5. a tap opens the film', tapped.includes(`/embed/${IDS[third]}?`), tapped.slice(0, 70) || 'no player');
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const { page, asked } = await open(ctx);
    await page.hover(`[data-cg-look="${first}"]`);
    await page.waitForTimeout(1200);
    const v = await clock(page, first);
    check('6. asking for reduced motion, a pointer plays nothing', v === null && asked.loops.length === 0, v ? `playing at ${v.t.toFixed(2)} s` : 'still');
    await ctx.close();
  }
} catch (e) {
  failed = true;
  console.log(` FAIL ${e.message}`);
} finally {
  await browser.close();
  server.close();
}
const bad = checks.filter((x) => !x).length;
console.log(`\nlandingfilms: ${checks.length - bad} of ${checks.length} ok`);
process.exit(bad || failed ? 1 : 0);
