#!/usr/bin/env node
/**
 * `npm run caption`: the song's corner caption (PLAN 37x-10j,
 * src/lib/songCaption.ts) is up, readable, in the corner, on the screen and
 * in the live stream, and gone when its time is.
 *
 * What was reported: the owner found the poured-ink titles (37x-10g) hard to
 * read and asked for the card a music channel of the early 1980s put over a
 * video: low in the left corner, then gone. The two things that would make
 * that a lie are a card that is not readable on a bright plate and a card
 * that is on the screen but not in what YouTube receives (the screen's card
 * is a canvas the frame task never draws, so the stream would not carry it
 * unless the encoder draws it too). So the lines, in order:
 *
 *   card      the card's lines are the artist, the song in quotation marks,
 *             the album and the label, in that order; a card with no title
 *             is refused; control characters go and long lines are clipped
 *   fade      it fades up in a fifth of a second, holds at full for the
 *             hold, fades out, and is nothing before it went up or after
 *   corner    drawn on a 1280x720 dark plate, white letters land in the
 *             bottom-left box (over 1% of it), and the other three corners
 *             are untouched (the card is in the corner and only there)
 *   bright    drawn on a bright cream plate, the hardest ground for white,
 *             the card still lays dark round its letters (its shadow, over
 *             1% of the box dark where none was): the letters are not lost
 *   stream    the encoder streams a plate with no card, then with one, then
 *             without: decoded, the landscape's frames while the card is up
 *             carry white in the bottom-left box and the frames before and
 *             after carry none, and the top-right box never changes
 *   portrait  the portrait encode (cropped from the same canvas) carries the
 *             card in its own bottom-left corner, not cropped off the side
 *   wired     the app puts titles up through it: useRemote mounts the
 *             screen's layer and reads `song-title`, the song show's title
 *             and the ear's go through app/songTitle.ts, the encoder's stage
 *             draws the card, the MCP and the assistant pass `song-title`,
 *             and the phone's Title control carries the caption/ink choice
 *
 * Measured 2026-11-10 in a cloud session (Chromium, software): the numbers
 * are printed on each line.
 */
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const fails = [];
const check = (id, what, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${id}: ${what}${detail ? ` (${detail})` : ''}`);
  if (!ok) fails.push(id);
};
const pct = (x) => `${(x * 100).toFixed(1)}%`;

const bundle = await build({ entryPoints: ['scripts/caption-entry.ts'], bundle: true, write: false, format: 'iife', platform: 'browser', logLevel: 'warning' });
const js = bundle.outputFiles[0].text;
const server = createServer((req, res) => {
  if (req.url === '/caption.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(js); return; }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000"><script src="/caption.js"></script>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!window.captionLab);

  // ── card ──
  const p = await page.evaluate(() => window.captionLab.pure());
  const want = ['Legendary Flower Punk', '“Beatroot”', 'Beatroot 2020', 'Self-released'];
  check('card', "the card reads artist, the song in quotes, album, label; no title is no card; junk is cleaned and clipped",
    JSON.stringify(p.lines) === JSON.stringify(want) && p.noTitle === null && p.dirty && !/[\u0000-\u001f]/.test(p.dirty.title) && p.dirty.title.length <= 48 && p.dirty.title.endsWith('…') && p.dirtyLines.length === 1,
    `${JSON.stringify(p.lines)}; junk title ${JSON.stringify(p.dirty?.title?.slice(0, 12))}… ${p.dirty?.title?.length} chars`);

  // ── fade ──

  const vals = p.alphas.map((x) => x.a);
  check('fade', 'nothing before, half way up in a tenth of a second, full through the hold, nothing at the end',
    vals[0] === 0 && vals[1] === 0 && Math.abs(vals[2] - 0.5) < 0.01 && vals[3] === 1 && vals[4] === 1 && vals[5] > 0 && vals[5] < 0.05 && vals[6] === 0 && vals[7] === 0 && Math.abs(vals[8] - 0.5) < 0.01,
    `${p.alphas.map((x) => `${x.t} ms ${x.a.toFixed(2)}`).join(', ')}; ${p.total} ms in all`);
  const clock = await page.evaluate(() => window.captionLab.clock());
  check('fade', 'the module\'s own clock: up three seconds in, nothing after its time', clock.mid === 1 && clock.up && clock.gone, `at 3 s ${clock.mid}, up ${clock.up}, gone after ${clock.gone}`);

  // ── corner, bright ──
  const dark = await page.evaluate(() => window.captionLab.draw(1280, 720, '#1c2440'));
  const others = ['bottomRight', 'topLeft', 'topRight'];
  check('corner', 'on a dark plate the white letters are in the bottom-left box, and the other corners are untouched',
    dark.before.bottomLeft.white === 0 && dark.after.bottomLeft.white > 0.01 && others.every((k) => dark.after[k].white === dark.before[k].white && dark.after[k].dark === dark.before[k].dark),
    `bottom-left white ${pct(dark.before.bottomLeft.white)} → ${pct(dark.after.bottomLeft.white)}; ${others.map((k) => `${k} ${pct(dark.after[k].white)}`).join(', ')}`);
  const bright = await page.evaluate(() => window.captionLab.draw(1280, 720, '#f4ead2'));
  check('bright', 'on a bright cream plate the card still lays dark round its letters',
    bright.before.bottomLeft.dark === 0 && bright.after.bottomLeft.dark > 0.01,
    `bottom-left near-black ${pct(bright.before.bottomLeft.dark)} → ${pct(bright.after.bottomLeft.dark)}`);

  // ── stream, portrait ──
  const UP = 1200, DOWN = 3000, MS = 4400;
  const s = await page.evaluate(([ms, up, down]) => window.captionLab.stream(ms, up, down), [MS, UP, DOWN]);
  const land = s.outputs.landscape, tall = s.outputs.portrait;
  // A third of a second of margin either side: the frame timer's clock and the page's are a few ms apart, and an encoder may hold a frame.
  const split = (o) => ({
    before: o.frames.filter((f) => f.ts < s.upMs - 300),
    during: o.frames.filter((f) => f.ts > s.upMs + 400 && f.ts < s.downMs - 300),
    after: o.frames.filter((f) => f.ts > s.downMs + 400),
  });
  const max = (fs, k, f) => Math.max(0, ...fs.map((x) => x.c[k][f]));
  const min = (fs, k, f) => Math.min(1, ...fs.map((x) => x.c[k][f]));
  if (!land || !tall) check('stream', 'both encodes produced frames', false, Object.keys(s.outputs).join(', ') || 'none');
  else {
    const L = split(land);
    check('stream', 'decoded, the landscape carries the card in the bottom-left only while it is up, and the top-right never changes',
      !land.error && L.before.length >= 10 && L.during.length >= 20 && L.after.length >= 10
        && max(L.before, 'bottomLeft', 'white') === 0 && min(L.during, 'bottomLeft', 'white') > 0.005 && max(L.after, 'bottomLeft', 'white') === 0
        // Letters, not a white block, and at the left edge rather than anywhere in the lower half.
        && max(L.during, 'bottomLeft', 'white') < 0.5 && min(L.during, 'leftEdge', 'white') > 0.005 && max(L.during, 'bottomRight', 'white') === 0
        && max(land.frames, 'topRight', 'white') === 0,
      land.error ?? `${land.w}x${land.h}; ${L.before.length}/${L.during.length}/${L.after.length} frames before/during/after; bottom-left white before ≤${pct(max(L.before, 'bottomLeft', 'white'))}, during ${pct(min(L.during, 'bottomLeft', 'white'))}..${pct(max(L.during, 'bottomLeft', 'white'))} (left edge ≥${pct(min(L.during, 'leftEdge', 'white'))}, bottom-right ≤${pct(max(L.during, 'bottomRight', 'white'))}), after ≤${pct(max(L.after, 'bottomLeft', 'white'))}; top-right ≤${pct(max(land.frames, 'topRight', 'white'))}`);
    const T = split(tall);
    check('portrait', 'the portrait encode carries the card in its own bottom-left corner while it is up',
      !tall.error && tall.w < tall.h && T.during.length >= 20 && min(T.during, 'bottomLeft', 'white') > 0.005 && min(T.during, 'leftEdge', 'white') > 0.005 && max(T.before, 'bottomLeft', 'white') === 0 && max(T.after, 'bottomLeft', 'white') === 0,
      tall.error ?? `${tall.w}x${tall.h}; bottom-left white during ≥${pct(min(T.during, 'bottomLeft', 'white'))}, before ≤${pct(max(T.before, 'bottomLeft', 'white'))}, after ≤${pct(max(T.after, 'bottomLeft', 'white'))}`);
  }
  if (errors.length) check('page', 'the page threw nothing', false, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

// ── wired (source, comments stripped: a call in a comment is not a call) ──
const src = (p) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const bad = [];
const remote = src('src/app/useRemote.ts');
if (!/mountSongCaptionLayer\s*\(/.test(remote)) bad.push('useRemote does not mount the screen\'s caption layer');
if (!/case 'song-title'[\s\S]{0,200}showSongCaption\s*\(/.test(remote)) bad.push('useRemote does not show a song-title message');
if (!/setSongTitleSink\s*\(\s*\(/.test(remote) || !/titleCaptionRef\.current !== false\)\s*showSongCaption/.test(remote)) bad.push('useRemote does not choose caption or ink by titleCaption');
if (!/case 'title':\s*showSongTitle\s*\(/.test(src('src/app/useSongScore.ts'))) bad.push('a song show\'s title does not go through showSongTitle');
if (!/showSongTitle\s*\(/.test(src('src/app/useInkTitle.ts'))) bad.push('the ear\'s title does not go through showSongTitle');
if (!/drawSongCaption\s*\(\s*ctx,\s*width,\s*height/.test(src('src/lib/liveStream.ts'))) bad.push('the encoder\'s stage does not draw the card');
if (!/type: 'song-title'/.test(src('mcp/chromaglass-mcp.js'))) bad.push('the MCP has no song_title');
if (!/type === 'song-title'/.test(src('server/assistant.js'))) bad.push('the assistant does not pass song-title');
if (!/titleCaption:\s*v/.test(src('src/components/phone/PhoneInkTitle.tsx'))) bad.push('the phone\'s Title control has no caption/ink choice');
if (!/titleCaption:\s*true/.test(src('src/types.ts'))) bad.push('titleCaption does not default to the caption');
check('wired', 'the app, the stream, the phone, the assistant and the MCP all reach the caption', bad.length === 0, bad.join('; '));

console.log(fails.length ? `\n${fails.length} failed: ${fails.join(', ')}` : '\nall passed');
process.exit(fails.length ? 1 : 0);
