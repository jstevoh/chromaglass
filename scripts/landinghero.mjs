#!/usr/bin/env node
/**
 * The webpage's moving hero, its looks grid and its music clip (PLAN.md 34a-2, 34a-3).
 *
 *   npm run landinghero              builds the page into dist-landing, about a minute, no GPU
 *   LANDINGHERO_DIST=dist npm run landinghero    against a build already made
 *
 * What was asked (the owner, 2026-11-21): the hero's cross-fade of five
 * 480 × 300 stills replaced by a full-width loop filmed from the Mac app; the
 * "Real looks from the app" grid at full size, with the chemical clock,
 * polarised light and a palette from a picture in it; and a clip of the plate
 * playing to music, muted until it is tapped, the music credited.
 *
 * Each line asserts the feature as a visitor meets it, not a file's presence:
 *
 *  1. The files. Each hero shape (wide for a laptop, tall for a phone) is a
 *     WebM and an MP4 with no sound track, each under LANDING_HERO.maxBytes (a
 *     browser fetches one of the two, so the budget is per file), and a poster
 *     at the loop's own size. The music clip has a sound track in both files
 *     and fits its own budget. Every look card is a 960 × 600 WebP under
 *     LANDING_LOOK_MAX_BYTES, of a look that is a shipped preset, and the
 *     picture card carries the picture its dyes came from.
 *  2. The loop is a loop: decoded in the browser, it lasts 10 to 20 s, and the
 *     jump from its last frame back to its first is no bigger than the
 *     steps between the frames either side of it (SEAM_TIMES those, plus a
 *     floor for codec noise). A cut a visitor sees every fifteen seconds is
 *     the failure this exists for; the files' sizes cannot see it. It also
 *     moves and is lit, so a black or frozen loop cannot pass a smooth seam.
 *  3. No grid still is flat (luminance spread over looksgrid's
 *     STILL_MIN_SPREAD at 32 × 32) and no two are the same picture, mirrored
 *     or not. 3b: the picture card's colours sit nearer its picture's than
 *     the grid's median card does.
 *  4. A laptop: the poster comes first and the loop is asked for only after
 *     the poster has arrived (so the headline and Play are never behind a
 *     video, and loadtime 4 still waits for one picture); the loop then plays,
 *     muted. Nothing of the music clip is asked for before it is scrolled to.
 *     In view it plays muted; "Sound on" unmutes it; opening the sign-in
 *     (`covered`) silences it. The credit names the artist and the licence.
 *  5. Reduced motion: no loop is ever asked for, the music clip shows its
 *     still with "Play with sound", and pressing it plays with sound.
 *  6. Saving data (navigator.connection.saveData): no loop is asked for.
 *  7. A phone (390 × 844, touch): the tall poster and loop, never the wide
 *     ones; the looks row scrolls sideways in a page that does not, its last
 *     card arrives at full size; the sound button is a 44-pixel target.
 */
import { chromium } from 'playwright';
import { launchChromium } from './chromium.mjs';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, extname, resolve } from 'node:path';
import { LANDING_HERO, LANDING_MUSIC, LANDING_LOOKS, LANDING_LOOK_SIZE, LANDING_LOOK_MAX_BYTES } from '../src/lib/landingMedia.ts';
import { PRESETS } from '../src/presets.ts';

const checks = [];
const check = (n, ok, d = '') => { checks.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

/** looksgrid's measures, so "a plate" and "the same picture" mean one thing on the site. */
const STILL_MIN_SPREAD = 20;
/** A pixel this far from grey (max − min of R, G, B) is coloured; below it the lamp's white and the dark carry no palette. */
const PICTURE_MIN_CHROMA = 40;
/** How much nearer the picture's colours its card must sit than the median other card does. */
const PICTURE_NEARER = 1.25;
const STILL_MIN_APART = 20;
/** A card with fewer coloured pixels than this (of 32 × 32) carries too little colour to say whose palette it is. */
const PICTURE_MIN_PIXELS = 100;
/** The hero loop has to move and be lit, not only wrap smoothly: real loops step 0.37 to 0.58, black or frozen ones 0. */
const LOOP_MIN_STEP = 0.15;
const LOOP_MIN_LIT = 10;
/** The seam may be this many times the frame steps either side of it, plus SEAM_FLOOR of 255 for the codec. */
const SEAM_TIMES = 2.5;
const SEAM_FLOOR = 3;
const LOOP_SECONDS = [10, 20];
/** How long a page is watched for a request that must not come. */
const QUIET_MS = 4000;

const pub = (p) => join('public', p);
const box = (b, type) => b.indexOf(Buffer.from(type));
const webpSize = (b) => {
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = b.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [(n & 0x3fff) + 1, ((n >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
  return null;
};
/** A sound track: MP4's handler 'soun', or a Matroska audio codec id. */
const mp4Sound = (b) => box(b, 'soun') >= 0;
const webmSound = (b) => ['A_OPUS', 'A_VORBIS', 'A_AAC'].some((c) => box(b, c) >= 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

// 1. The files.
for (const [name, s] of [['wide', LANDING_HERO.wide], ['tall', LANDING_HERO.tall]]) {
  const files = [s.webm, s.mp4, s.poster].map(pub);
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) { check(`1. the ${name} hero: a silent WebM and MP4 under ${kb(LANDING_HERO.maxBytes)} each, and a ${s.size.join(' × ')} poster`, false, `missing ${missing.join(', ')}`); continue; }
  const [w, m, p] = files.map((f) => readFileSync(f));
  const size = webpSize(p);
  const sound = webmSound(w) || mp4Sound(m);
  check(`1. the ${name} hero: a silent WebM and MP4 under ${kb(LANDING_HERO.maxBytes)} each, and a ${s.size.join(' × ')} poster`,
    w.readUInt32BE(0) === 0x1a45dfa3 && box(m, 'ftyp') === 4 && !sound && w.length <= LANDING_HERO.maxBytes && m.length <= LANDING_HERO.maxBytes && size?.[0] === s.size[0] && size?.[1] === s.size[1],
    `WebM ${kb(w.length)}, MP4 ${kb(m.length)}${sound ? ', has a sound track' : ''}, poster ${size?.join(' × ') ?? 'unreadable'}`);
}
{
  const files = [LANDING_MUSIC.webm, LANDING_MUSIC.mp4, LANDING_MUSIC.poster].map(pub);
  const missing = files.filter((f) => !existsSync(f));
  const [w, m] = missing.length ? [] : files.map((f) => readFileSync(f));
  check(`1. the music clip: a WebM and MP4 with sound, under ${kb(LANDING_MUSIC.maxBytes)} each, and its poster`,
    !missing.length && webmSound(w) && mp4Sound(m) && w.length <= LANDING_MUSIC.maxBytes && m.length <= LANDING_MUSIC.maxBytes,
    missing.length ? `missing ${missing.join(', ')}` : `WebM ${kb(w.length)}${webmSound(w) ? '' : ' no sound'}, MP4 ${kb(m.length)}${mp4Sound(m) ? '' : ' no sound'}`);
}
{
  const bad = [];
  for (const c of LANDING_LOOKS) {
    const f = pub(`landing/looks/${c.id}.webp`);
    const look = c.look ?? c.id;
    if (!PRESETS.some((p) => p.id === look)) bad.push(`${c.id}: ${look} is not a preset`);
    if (!existsSync(f)) { bad.push(`${c.id}: no ${f}`); continue; }
    const b = readFileSync(f), size = webpSize(b);
    if (size?.[0] !== LANDING_LOOK_SIZE[0] || size?.[1] !== LANDING_LOOK_SIZE[1]) bad.push(`${c.id}: ${size?.join(' × ') ?? 'unreadable'}`);
    if (b.length > LANDING_LOOK_MAX_BYTES) bad.push(`${c.id}: ${kb(b.length)}`);
    if (c.picture && !existsSync(pub(`landing/looks/${c.id}-source.webp`))) bad.push(`${c.id}: no picture beside it`);
  }
  check(`1. every look card is a ${LANDING_LOOK_SIZE.join(' × ')} still under ${kb(LANDING_LOOK_MAX_BYTES)} of a shipped look`,
    LANDING_LOOKS.length >= 12 && new Set(LANDING_LOOKS.map((c) => c.id)).size === LANDING_LOOKS.length && !bad.length,
    `${LANDING_LOOKS.length} cards${bad.length ? '; ' + bad.join('; ') : ''}`);
  for (const want of ['chemical-clock', 'polarised-light', 'picture-palette']) {
    if (!LANDING_LOOKS.some((c) => c.id === want)) check(`1. the grid has ${want}`, false, 'asked for by the owner');
  }
}

const DIST = resolve(process.env.LANDINGHERO_DIST ?? 'dist-landing');
if (!process.env.LANDINGHERO_DIST) {
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

/** A page on the webpage with every request for its moving pictures logged in order, with when the poster arrived. */
const open = async (ctx) => {
  const page = await ctx.newPage();
  const log = [];
  const t0 = Date.now();
  page.on('request', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/landing/hero/') || p.startsWith('/landing/music/')) log.push({ at: Date.now() - t0, kind: 'asked', p }); });
  page.on('requestfinished', (r) => { const p = new URL(r.url()).pathname; if (p.startsWith('/landing/hero/') && p.endsWith('.webp')) log.push({ at: Date.now() - t0, kind: 'arrived', p }); });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-cg-landing]', { timeout: 30_000 });
  return { page, log };
};
const videoState = (page, sel) => page.evaluate((sel) => {
  const v = document.querySelector(sel);
  return v ? { t: v.currentTime, paused: v.paused, muted: v.muted, ready: v.readyState, src: v.currentSrc } : null;
}, sel);
/** Does the video at `sel` move: its time advances over half a second. */
const plays = async (page, sel, ms = 15_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const a = await videoState(page, sel);
    await page.waitForTimeout(500);
    const b = await videoState(page, sel);
    if (a && b && !b.paused && b.t > a.t) return b;
  }
  return null;
};
const asked = (log, re) => log.filter((e) => e.kind === 'asked' && re.test(e.p));

const browser = await launchChromium(chromium);
try {
  // 2. The seam and the length, on the WebM (this Chromium plays no H.264).
  for (const [name, s] of [['wide', LANDING_HERO.wide], ['tall', LANDING_HERO.tall]]) {
    if (!existsSync(pub(s.webm))) continue;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/robots.txt`);
    const r = await page.evaluate(async (src) => {
      const v = document.createElement('video');
      v.muted = true; v.preload = 'auto'; v.src = src;
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = () => no(new Error('decode')); });
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const g = c.getContext('2d', { willReadFrequently: true });
      const at = async (t) => {
        await new Promise((ok) => { v.onseeked = ok; v.currentTime = t; });
        g.drawImage(v, 0, 0, 64, 36);
        return g.getImageData(0, 0, 64, 36).data;
      };
      const diff = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n += 3; } return s / n; };
      const d = v.duration, step = 1 / 30;
      const steps = [];
      for (let k = 1; k <= 9; k++) { const t = d * k / 10; steps.push(diff(await at(t), await at(t + step))); }
      // The frames either side of the wrap: the last three and the first three.
      // Frame centres: WebM stamps whole milliseconds, so a seek to 2/30 s
      // (66.67 ms) shows the frame stamped 33 and the step it measures is 0.
      const end = [await at(d - 2.5 * step), await at(d - 1.5 * step), await at(d - step / 2)];
      const start = [await at(step / 2), await at(1.5 * step), await at(2.5 * step)];
      let lit = 0; for (let i = 0; i < start[0].length; i += 4) lit += (start[0][i] + start[0][i + 1] + start[0][i + 2]) / 3;
      lit /= start[0].length / 4;
      const seam = diff(end[2], start[0]);
      const near = (diff(end[0], end[1]) + diff(end[1], end[2]) + diff(start[0], start[1]) + diff(start[1], start[2])) / 4;
      steps.sort((a, b) => a - b);
      return { d, seam, near, median: steps[4], lit };
    }, s.webm).catch((e) => ({ error: e.message }));
    /*
      What the seam is held against: the steps beside it, not the loop's median.
      The wrap sits inside a cross-fade (the loop's end fading into its start),
      and every frame of a fade moves by the whole difference between two
      pieces over a second's frames: measured 2026-11-21 on the tall loop, 0.2
      to 0.7 between fades and 2.5 to 3.9 inside one, with the wrap 3.7 among
      them. Against the median the line passed the wide loop and failed the
      tall one by luck of which second each fade fell in. A cut is a jump its
      neighbours do not make, whatever they are making: a hard wrap between two
      pieces measures 20 to 40 here.
    */
    const bar = r.error ? 0 : SEAM_TIMES * r.near + SEAM_FLOOR;
    /*
      A seam held against its neighbours passes a loop that never moves: a
      black loop measured seam 0 against a bar of 3.00, a frozen still 0.03
      against 3.01, and a drawImage that came back black would read the same.
      So the loop also has to move (its median frame step at least
      LOOP_MIN_STEP: the real loops 0.58 wide and 0.37 tall, black and still
      0) and be lit (its first frame's mean level over LOOP_MIN_LIT of 255).
    */
    const ok = !r.error && r.d >= LOOP_SECONDS[0] && r.d <= LOOP_SECONDS[1] && r.seam <= bar && r.median >= LOOP_MIN_STEP && r.lit > LOOP_MIN_LIT;
    check(`2. the ${name} loop lasts ${LOOP_SECONDS.join(' to ')} s, moves, is lit, and its seam is no bigger than the steps beside it`, ok,
      r.error ? r.error : `${r.d.toFixed(2)} s, seam ${r.seam.toFixed(2)} against ${r.near.toFixed(2)} beside it (bar ${bar.toFixed(2)}); median step ${r.median.toFixed(2)} (at least ${LOOP_MIN_STEP}), level ${r.lit.toFixed(1)} (over ${LOOP_MIN_LIT})`);
    await ctx.close();
  }

  // 3. The grid's stills, decoded at 32 × 32 as looksgrid decodes its own.
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(`${base}/robots.txt`);
    const srcs = [...LANDING_LOOKS.map((c) => `/landing/looks/${c.id}.webp`), ...LANDING_LOOKS.filter((c) => c.picture).map((c) => `/landing/looks/${c.id}-source.webp`)];
    const pics = await page.evaluate(async (srcs) => {
      const out = {};
      for (const src of srcs) {
        try {
          const img = new Image(); img.src = src; await img.decode();
          const c = document.createElement('canvas'); c.width = c.height = 32;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(img, 0, 0, 32, 32);
          const d = g.getImageData(0, 0, 32, 32).data;
          const lum = [];
          for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
          out[src] = { spread: Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length), px: [...d].filter((_, i) => i % 4 !== 3) };
        } catch { out[src] = null; }
      }
      return out;
    }, srcs);
    const cardSrcs = srcs.filter((s) => !s.endsWith('-source.webp'));
    const flat = cardSrcs.filter((s) => !pics[s] || pics[s].spread < STILL_MIN_SPREAD).map((s) => `${s} ${pics[s]?.spread.toFixed(1) ?? 'undecodable'}`);
    const near = [];
    let closest = Infinity;
    for (let i = 0; i < cardSrcs.length; i++) for (let j = i + 1; j < cardSrcs.length; j++) {
      const a = pics[cardSrcs[i]]?.px, b = pics[cardSrcs[j]]?.px;
      if (!a || !b) continue;
      // Unmirrored, mirrored either way and turned half round: a flipped copy
      // of a card measured 74.3 apart pixel for pixel, as far as two looks.
      let apart = Infinity;
      for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        let s = 0;
        for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) for (let ch = 0; ch < 3; ch++) {
          const ka = (y * 32 + x) * 3 + ch, kb = ((fy ? 31 - y : y) * 32 + (fx ? 31 - x : x)) * 3 + ch;
          s += Math.abs(a[ka] - b[kb]);
        }
        apart = Math.min(apart, s / a.length);
      }
      closest = Math.min(closest, apart);
      if (apart < STILL_MIN_APART) near.push(`${cardSrcs[i]} ~ ${cardSrcs[j]} ${apart.toFixed(1)}`);
    }
    check(`3. no grid still is flat (spread over ${STILL_MIN_SPREAD}) and no two are the same picture, mirrored or not (apart over ${STILL_MIN_APART})`,
      !flat.length && !near.length, `${flat.length ? 'flat: ' + flat.join(', ') + '; ' : ''}${near.length ? 'alike: ' + near.join(', ') + '; ' : ''}closest pair ${closest.toFixed(1)}`);
    /*
      3b. The picture card's dyes are its picture's. The first photograph of it
      (2026-11-21) was its base look's own colours: the file was chosen after
      the look had poured, and a palette lock steers only the next pours. Both
      cards are plates and not alike pixel for pixel, so 3 passed it. This
      measures colour, not place: for each coloured pixel (chroma over
      PICTURE_MIN_CHROMA) the RGB distance to the nearest colour on the other
      side, averaged, taken both ways (card to picture and picture to card) so
      a card in one of the picture's colours cannot score well, and summed.

      What it is held against: every other card on the grid, by its median,
      not one control. Held against the base look's card alone (aurora, the
      farthest of all twelve from a sunset) any card that was not aurora's
      passed, a hue-turned aurora included. Against the nearest other card it
      fails today's honest card: Macro Bead's warm ambers sit 1.12x as far,
      because some looks are sunset-coloured on their own. So the claim is
      "nearer the picture than the grid's typical look, by PICTURE_NEARER",
      and the nearest look is printed beside it.
    */
    check('3b. the grid has a picture card', LANDING_LOOKS.some((c) => c.picture));
    for (const c of LANDING_LOOKS.filter((c) => c.picture)) {
      const srcFile = pub(`landing/looks/${c.id}-source.webp`);
      const srcSize = existsSync(srcFile) ? webpSize(readFileSync(srcFile)) : null;
      check(`3b. ${c.id}'s picture is 240 × 150`, srcSize?.[0] === 240 && srcSize?.[1] === 150, srcSize?.join(' × ') ?? 'missing');
      const pic = pics[`/landing/looks/${c.id}-source.webp`]?.px;
      const coloured = (px) => { let n = 0; for (let k = 0; k < px.length; k += 3) if (Math.max(px[k], px[k + 1], px[k + 2]) - Math.min(px[k], px[k + 1], px[k + 2]) >= PICTURE_MIN_CHROMA) n++; return n; };
      const oneWay = (from, to) => {
        let sum = 0, n = 0;
        for (let k = 0; k < from.length; k += 3) {
          const [r, g, b] = [from[k], from[k + 1], from[k + 2]];
          if (Math.max(r, g, b) - Math.min(r, g, b) < PICTURE_MIN_CHROMA) continue;
          let best = Infinity;
          for (let m = 0; m < to.length; m += 3) best = Math.min(best, Math.hypot(r - to[m], g - to[m + 1], b - to[m + 2]));
          sum += best; n++;
        }
        return n ? sum / n : NaN;
      };
      const both = (px) => (px && pic ? oneWay(px, pic) + oneWay(pic, px) : NaN);
      const ownPx = pics[`/landing/looks/${c.id}.webp`]?.px;
      const own = both(ownPx), n = ownPx ? coloured(ownPx) : 0;
      const others = cardSrcs.filter((s) => s !== `/landing/looks/${c.id}.webp`).map((s) => [s.replace(/^.*\/|\.webp$/g, ''), both(pics[s]?.px)]).filter(([, d]) => Number.isFinite(d)).sort((a, b) => a[1] - b[1]);
      const median = others.length ? others[others.length >> 1][1] : NaN;
      check(`3b. ${c.id}'s colours are its picture's: ${PICTURE_MIN_PIXELS}+ coloured pixels, nearer them than the median other card by ${PICTURE_NEARER}x`,
        n >= PICTURE_MIN_PIXELS && own * PICTURE_NEARER <= median,
        `both ways, RGB units: ${c.id} ${own.toFixed(1)} (${n} coloured pixels), the other cards' median ${median.toFixed(1)}, nearest ${others[0]?.[0]} ${others[0]?.[1].toFixed(1)}, ${c.look} ${others.find(([id]) => id === c.look)?.[1].toFixed(1) ?? '–'}`);
    }
    await ctx.close();
  }

  // 4. A laptop.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const { page, log } = await open(ctx);
    const loop = await plays(page, '[data-cg-hero-loop]');
    const arrived = log.find((e) => e.kind === 'arrived' && e.p === LANDING_HERO.wide.poster);
    const videos = asked(log, /^\/landing\/hero\/.*\.(webm|mp4)$/);
    check('4. a laptop: the wide poster arrives first, the loop is asked for only after it, and then plays muted',
      arrived && videos.length && videos[0].at >= arrived.at && loop?.muted && /wide\.webm$/.test(loop.src) && !asked(log, /tall\./).length,
      `poster at ${arrived?.at ?? '—'} ms, first loop request at ${videos[0]?.at ?? '—'} ms (${videos[0]?.p ?? 'none'}), ${loop ? `playing ${loop.src.split('/').pop()}${loop.muted ? ' muted' : ' WITH SOUND'}` : 'not playing'}`);
    check('4. nothing of the music clip is asked for before it is scrolled to', !asked(log, /^\/landing\/music\//).length, asked(log, /^\/landing\/music\//).map((e) => e.p).join(', '));
    const credit = await page.locator('[data-cg-music-credit]').innerText().catch(() => '');
    check('4. the music credit names the track, the artist and the licence, with links',
      credit.includes(LANDING_MUSIC.artist) && credit.includes(LANDING_MUSIC.title) && credit.includes(LANDING_MUSIC.licence.name)
        && (await page.locator(`[data-cg-music-credit] a[href="${LANDING_MUSIC.licence.url}"]`).count()) === 1
        && (await page.locator(`[data-cg-music-credit] a[href="${LANDING_MUSIC.page}"]`).count()) === 1,
      credit.replace(/\s+/g, ' ').slice(0, 160));
    await page.locator('[data-cg-music]').scrollIntoViewIfNeeded();
    const muted = await plays(page, '[data-cg-music-video]');
    check('4. scrolled to, the music clip plays muted', muted?.muted === true, muted ? `muted ${muted.muted}` : `not playing: ${JSON.stringify(await videoState(page, '[data-cg-music-video]'))}`);
    await page.click('[data-cg-music-sound]');
    await page.waitForTimeout(400);
    const heard = await plays(page, '[data-cg-music-video]', 5000);
    const pressed = await page.getAttribute('[data-cg-music-sound]', 'aria-pressed');
    check('4. "Sound on" plays it with its sound, and the button says so', heard && heard.muted === false && pressed === 'true', `muted ${heard?.muted}, aria-pressed ${pressed}`);
    await page.click('[data-cg-landing-play]');
    await page.waitForTimeout(1500);
    const after = await videoState(page, '[data-cg-music-video]');
    check('4. opening the sign-in over the page silences the clip', !after || after.muted || after.paused, JSON.stringify(after));
    await ctx.close();
  }

  // 5. Reduced motion.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const { page, log } = await open(ctx);
    await page.waitForTimeout(QUIET_MS);
    await page.locator('[data-cg-music]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);
    const before = asked(log, /\.(webm|mp4)$/).map((e) => e.p);
    const label = (await page.locator('[data-cg-music-sound]').innerText().catch(() => '')).trim();
    check('5. reduced motion: no loop is asked for, and the music clip waits with "Play with sound"',
      !before.length && (await page.locator('[data-cg-hero-loop]').count()) === 0 && label === 'Play with sound', `${before.join(', ') || 'no video asked for'}, button "${label}"`);
    await page.click('[data-cg-music-sound]');
    const heard = await plays(page, '[data-cg-music-video]');
    check('5. reduced motion: pressing it plays the clip with sound', heard?.muted === false, JSON.stringify(heard));
    await ctx.close();
  }

  // 6. Saving data.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) }); });
    const { page, log } = await open(ctx);
    await page.waitForTimeout(QUIET_MS);
    const vids = asked(log, /^\/landing\/hero\/.*\.(webm|mp4)$/).map((e) => e.p);
    const still = await page.evaluate(() => document.querySelector('[data-cg-hero-still]')?.complete ?? false);
    check('6. saving data: the poster and no loop', still && !vids.length, vids.join(', ') || 'no loop asked for');
    await ctx.close();
  }

  // 7. A phone.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const { page, log } = await open(ctx);
    const loop = await plays(page, '[data-cg-hero-loop]');
    const hero = log.filter((e) => e.kind === 'asked' && e.p.startsWith('/landing/hero/')).map((e) => e.p);
    check('7. a phone: the tall poster and loop, never the wide ones',
      hero.includes(LANDING_HERO.tall.poster) && !hero.some((p) => /\/wide\./.test(p)) && /tall\.webm$/.test(loop?.src ?? ''),
      `${hero.join(', ')}${loop ? '' : '; the loop did not play'}`);
    /*
      Counting the cards proved nothing: Landing renders one per entry, so the
      count was the list against itself. What a phone needs is a row that
      scrolls sideways inside a page that does not, and a last card that
      arrives, at full size, inside the screen once it is scrolled to.
    */
    const row = await page.evaluate(() => {
      const ul = document.querySelector('#looks ul');
      const cs = ul && getComputedStyle(ul);
      const sc = document.querySelector('[data-cg-landing]') ?? document.scrollingElement;
      return ul ? { scrolls: ul.scrollWidth > ul.clientWidth, overflow: cs.overflowX, pageWide: Math.max(sc.scrollWidth, document.scrollingElement.scrollWidth) } : null;
    });
    const last = page.locator('#looks [data-cg-still]').last();
    await last.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => { const i = [...document.querySelectorAll('#looks [data-cg-still] img')].pop(); return i?.complete && i.naturalWidth > 0; }, null, { timeout: 10000 }).catch(() => {});
    const lastCard = await last.evaluate((li) => { const r = li.getBoundingClientRect(), i = li.querySelector('img'); return { left: r.left, right: r.right, w: i?.naturalWidth ?? 0 }; });
    const btn = await page.locator('[data-cg-music-sound]').boundingBox();
    check(`7. a phone: the looks row scrolls sideways in a page that does not, its last card arrives at ${LANDING_LOOK_SIZE[0]} px inside the screen, and the sound button is a 44-pixel target`,
      row?.scrolls && /auto|scroll/.test(row.overflow) && row.pageWide <= 390 && lastCard.w === LANDING_LOOK_SIZE[0] && lastCard.left >= -1 && lastCard.right <= 391 && btn && btn.width >= 44 && btn.height >= 44,
      `row ${row ? `${row.scrolls ? 'scrolls' : 'does not scroll'} (overflow-x ${row.overflow}), page ${row.pageWide} px wide` : 'missing'}; last card ${lastCard.w} px, at ${lastCard.left.toFixed(0)} to ${lastCard.right.toFixed(0)}; button ${btn ? `${btn.width.toFixed(0)} × ${btn.height.toFixed(0)}` : 'missing'}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} landinghero checks passed`);
process.exit(failed ? 1 : 0);
