#!/usr/bin/env node
/**
 * The webpage's films, and the channel's: each look in src/lib/siteFilms.ts
 * rendered for a minute to its piece of music, in the app, on a Mac.
 *
 *   npm run sitefilms                          all eight
 *   SITEFILMS_ONLY=lace-run npm run sitefilms  one
 *   npm run sitefilms -- --banner              the channel's banner, from the desk
 *
 * What was asked (the owner, 2026-10-29; PLAN.md 34a-6): a minute of each look
 * with music that suits it, for the webpage's cards and for the channel. What
 * this makes, under SITEFILMS_OUT (default scratch/sitefilms/, which git
 * ignores), for each look:
 *
 *   <look>/film.mp4       the minute with its music, for the channel: the
 *                         app's own Song film (`useSongRender`), every frame
 *                         drawn and none dropped, 2560 × 1440 at 60 fps by
 *                         default (SITEFILMS_SIZE, SITEFILMS_FPS)
 *   <look>/thumb.jpg      1280 × 720, the channel's thumbnail
 *   <look>/still.png      the same moment at the film's size, as a PNG
 *   <look>/youtube.txt    the film's title and description, the credit in it
 *
 * and into public/landing (the files the webpage serves; commit them):
 *
 *   films/<look>.mp4, .webm   the card's loop, LOOP_SECONDS with no sound
 *   looks/<look>.webp         the loop's first frame, the card's still
 *
 * Why the Song film and not the Record button (`scripts/recorder.mjs`), which
 * the measuring harnesses use. Record films the canvas as it is drawn, at
 * whatever rate the page keeps, so a frame the GPU is late on is a frame the
 * film repeats; the Song film steps the solver by the film's own clock, one
 * frame at a time, and hears the song in advance, so the picture and the
 * sound are the same show to the frame whatever the machine. It is what a
 * person gets from the Song film button; nothing here is drawn or edited
 * after the app hands the file back, but for the card's loop, which is cut
 * from it, cropped to the card's shape and blended at its seam.
 *
 * Why 1440 lines for a channel whose players mostly show 1080. The channel
 * gives a 1440-line upload a better codec and two to three times the bits
 * at every size it streams, and a plate is fine gradients and slow motion,
 * which is what a starved encoder smears first.
 *
 * The loop's seam. A loop cut straight from a film jumps where it wraps, and
 * a liquid's jump reads as a glitch. So LOOP_SECONDS + LOOP_BLEND_S are cut,
 * and the last LOOP_BLEND_S of the loop are cross-faded into the first: at
 * the wrap the picture is the frame it starts on. Checked here: the loop's
 * first and last frames differ by less than any two frames a second apart
 * inside it.
 *
 * Needs a GPU that presents WebGPU and reads its frames back (a Mac), and
 * ffmpeg with libx264, libvpx-vp9 and libwebp. Built here with no sign-in (the
 * Firebase settings emptied), so the show opens without one.
 */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { isGpuEngine } from './frame.mjs';
import { AUTOPLAY, untilRunning } from './recorder.mjs';
import { SITE_FILMS, FILM_SECONDS, LOOP_SECONDS, LOOP_BLEND_S, creditLines, LICENCE } from '../src/lib/siteFilms.ts';
import { PRESETS } from '../src/presets.ts';

const PORT = Number(process.env.SITEFILMS_PORT ?? 4361);
const OUT = path.resolve(process.env.SITEFILMS_OUT ?? 'scratch/sitefilms');
const DIST = path.resolve('dist-sitefilms');
const [W, H] = (process.env.SITEFILMS_SIZE ?? '2560x1440').split('x').map(Number);
const FPS = Number(process.env.SITEFILMS_FPS ?? 60);
const ONLY = process.env.SITEFILMS_ONLY?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const BANNER = process.argv.includes('--banner');
// The card is 8:5; the loop is cut from the film's middle at that shape, at
// twice the size the four-wide grid shows a card, for a sharp still on a
// laptop's screen.
const LOOP_W = 640, LOOP_H = 400, LOOP_FPS = 30;
const SITE = path.resolve('public/landing');
// The composer's library; each film names its file in it (siteFilms.ts) and SOURCES.md records the address.
const INCOMPETECH = 'https://incompetech.com/music/royalty-free/mp3-royaltyfree/';
const trackUrl = (f) => INCOMPETECH + encodeURIComponent(f.track.file);

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

for (const [tool, need] of [['ffmpeg', ['libx264', 'libvpx-vp9', 'libwebp']]]) {
  let encoders = '';
  try { encoders = run(tool, ['-hide_banner', '-encoders']); } catch { console.error(`sitefilms: ${tool} is not on the PATH (brew install ffmpeg)`); process.exit(2); }
  const missing = need.filter((e) => !encoders.includes(e));
  if (missing.length) { console.error(`sitefilms: this ffmpeg has no ${missing.join(', ')}`); process.exit(2); }
}

const films = SITE_FILMS.filter((f) => !ONLY || ONLY.includes(f.look));
if (!BANNER && !films.length) { console.error(`sitefilms: no film is named ${ONLY.join(', ')}`); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

/** The piece, fetched once and checked against its checksum; then its minute, as a 48 kHz WAV. */
async function minuteOf(f) {
  const dir = path.join(OUT, 'music');
  fs.mkdirSync(dir, { recursive: true });
  const whole = path.join(dir, `${f.track.title}.mp3`);
  if (!fs.existsSync(whole)) {
    const r = await fetch(trackUrl(f));
    if (!r.ok) throw new Error(`${trackUrl(f)}: HTTP ${r.status}`);
    fs.writeFileSync(whole, Buffer.from(await r.arrayBuffer()));
  }
  const sum = createHash('sha256').update(fs.readFileSync(whole)).digest('hex');
  if (sum !== f.track.sha256) throw new Error(`${f.track.title}: the file's checksum is ${sum}, not the one in siteFilms.ts; listen to it before changing that`);
  const cut = path.join(dir, `${f.look}.wav`);
  // A short fade in only where the minute starts inside the piece, and three
  // seconds out at the minute's end, so the film ends and does not stop.
  const fades = [f.track.from > 0 ? 'afade=t=in:d=0.3' : null, `afade=t=out:st=${FILM_SECONDS - 3}:d=3`].filter(Boolean).join(',');
  ffmpeg(['-ss', String(f.track.from), '-t', String(FILM_SECONDS), '-i', whole, '-af', fades, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', cut]);
  return cut;
}

/*
  The build, with no sign-in. A Mac that builds the site has the owner's
  Firebase settings in an .env file, and with them /show asks for a sign-in
  and the page at / is the webpage. Vite takes a variable already in the
  environment over the file's, so these, set empty, are what the build sees.
*/
console.log('sitefilms: building the site with no sign-in…');
execFileSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
  stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_HOSTED_SITE: '' },
});
const server = spawn('./node_modules/.bin/vite', ['preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
await new Promise((r) => setTimeout(r, 2500));

const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
let failed = 0;

/** The show, open on a look, its GPU solver up and its loop beating. */
async function openShow(look, { seed, viewport, scale = 1, band = false }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
  if (band) await page.addInitScript(() => { try { sessionStorage.setItem('chromaglass-audio-source', 'simulated'); } catch { /* private */ } });
  await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${look}&seed=${seed}`, { waitUntil: 'load' });
  if (band) await page.mouse.click(viewport.width / 2, viewport.height / 2);
  let engine = null;
  for (let i = 0; i < 60 && !isGpuEngine(engine); i++) {
    await page.waitForTimeout(1000);
    engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
  }
  if (!isGpuEngine(engine)) throw new Error(`${look}: the GPU solver never came up (${engine ?? 'no debug hook'}); this needs a Mac`);
  const up = await untilRunning(page);
  if (!up.ok) throw new Error(`${look}: the show's loop never ran steadily (${up.waited.toFixed(0)} s)`);
  return page;
}

/** The app's Song film of one minute, written to `file`. The bytes come back in slices: a 150 MB string in one message is more than the page's pipe wants. */
async function songFilm(page, wav, f, file) {
  const t0 = Date.now();
  const meta = await page.evaluate(async ({ b64, w, h, fps, seed }) => {
    const bin = atob(b64);
    const song = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) song[i] = bin.charCodeAt(i);
    const r = await window.chromaglassRender({ song: song.buffer, width: w, height: h, fps, seed });
    window.__siteFilm = r.bytes;
    return { phase: r.phase, message: r.message, format: r.format, length: r.bytes?.length ?? 0 };
  }, { b64: fs.readFileSync(wav).toString('base64'), w: W, h: H, fps: FPS, seed: f.seed });
  if (meta.phase !== 'done' || !meta.length) throw new Error(`${f.look}: the render ended ${meta.phase}: ${meta.message}`);
  const SLICE = 8 << 20;
  const parts = [];
  for (let at = 0; at < meta.length; at += SLICE) {
    parts.push(Buffer.from(await page.evaluate(({ at, n }) => window.__siteFilm.slice(at, at + n), { at, n: SLICE }), 'base64'));
  }
  await page.evaluate(() => { window.__siteFilm = null; });
  fs.writeFileSync(file, Buffer.concat(parts));
  console.log(`  ${f.look}: ${meta.message} (${((Date.now() - t0) / 1000).toFixed(0)} s here)`);
}

/** Mean absolute difference of two frames of the loop, 0 to 255, read small. */
function frameDiff(file, a, b) {
  const grab = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=160:100', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const x = grab(a), y = grab(b);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };

if (BANNER) {
  /*
    The channel's banner: the desk as it is, a look running under the band.
    The channel takes 2048 × 1152 at least, and shows all of it only on a
    television; a laptop sees a band about a third of its height through the
    middle, and a phone the middle 1235 × 338. So the desk is opened at the
    banner's shape (16:9), twice its size in pixels, and a copy is written
    with that middle band drawn on it, for judging what a phone will see.
  */
  const looks = (process.env.BANNER_LOOKS ?? 'ferro-paint,aurora-borealis,neon-coral-reef,jellyfish-bloom').split(',');
  fs.mkdirSync(path.join(OUT, 'banner'), { recursive: true });
  for (const look of looks) {
    try {
      const page = await openShow(look, { seed: 1, viewport: { width: 1440, height: 810 }, scale: 2, band: true });
      await page.waitForTimeout(Number(process.env.BANNER_WAIT_S ?? 40) * 1000);
      const raw = path.join(OUT, 'banner', `${look}-desk.png`);
      await page.screenshot({ path: raw });
      // A WebGPU canvas a screenshot catches blank would make a banner of a desk around a black hole.
      const plate = await page.evaluate(() => { const r = document.getElementById('liquid-canvas')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null; });
      const lum = plate ? execFileSync('ffmpeg', ['-v', 'error', '-i', raw, '-vf', `crop=${Math.round(plate.w * 2)}:${Math.round(plate.h * 2)}:${Math.round(plate.x * 2)}:${Math.round(plate.y * 2)},scale=64:36,format=gray`, '-f', 'rawvideo', '-']).reduce((s, v) => s + v, 0) / (64 * 36) : 0;
      check(`${look}: the plate is in the screenshot`, lum > 8, `mean ${lum.toFixed(1)} of 255 over the plate`);
      const jpg = path.join(OUT, 'banner', `${look}-banner.jpg`);
      ffmpeg(['-i', raw, '-vf', 'scale=2560:1440:flags=lanczos', '-q:v', '2', jpg]);
      const bytes = fs.statSync(jpg).size;
      check(`${look}: 2560 × 1440 and under the channel's 6 MB`, bytes < 6e6, `${(bytes / 1e6).toFixed(2)} MB`);
      // The phone's band (1235 × 338 of 2048 × 1152, scaled to 2560) and the laptop's (2560 × 423), drawn on a copy.
      ffmpeg(['-i', jpg, '-vf', 'drawbox=x=(iw-1544)/2:y=(ih-423)/2:w=1544:h=423:color=yellow@0.9:t=4,drawbox=x=0:y=(ih-529)/2:w=iw:h=529:color=cyan@0.6:t=3', '-q:v', '4', path.join(OUT, 'banner', `${look}-safe.jpg`)]);
      await page.close();
    } catch (e) { failed++; console.log(`  FAIL ${look}: ${e.message}`); }
  }
} else {
  fs.mkdirSync(path.join(SITE, 'films'), { recursive: true });
  for (const f of films) {
    const dir = path.join(OUT, f.look);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const wav = await minuteOf(f);
      const page = await openShow(f.look, { seed: f.seed, viewport: { width: 1280, height: 800 } });
      const film = path.join(dir, 'film.mp4');
      await songFilm(page, wav, f, film);
      await page.close();

      const p = probe(film);
      const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
      const dur = Number(p.format.duration);
      check(`${f.look}: ${W} × ${H} at ${FPS} fps, the minute long, with its music`,
        v?.width === W && v?.height === H && !!a && Math.abs(dur - FILM_SECONDS) < 0.1,
        `${v?.width}×${v?.height} ${v?.r_frame_rate}, ${dur.toFixed(2)} s, audio ${a ? a.codec_name : 'none'}`);

      // The card's loop: cut, cropped to 8:5, blended at the seam (header).
      const L = LOOP_SECONDS, D = LOOP_BLEND_S;
      const shape = `crop=ih*8/5:ih,scale=${LOOP_W}:${LOOP_H}:flags=lanczos,fps=${LOOP_FPS},format=yuv420p`;
      const graph = `[0:v]${shape},split[x][y];[x]trim=${D}:${L + D},setpts=PTS-STARTPTS[a];[y]trim=0:${D},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${D}:offset=${L - D}[o]`;
      const mp4 = path.join(SITE, 'films', `${f.look}.mp4`), webm = path.join(SITE, 'films', `${f.look}.webm`);
      ffmpeg(['-ss', String(f.loopAt), '-t', String(L + D + 0.5), '-i', film, '-filter_complex', graph, '-map', '[o]', '-an',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-movflags', '+faststart', mp4]);
      ffmpeg(['-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', webm]);
      ffmpeg(['-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', path.join(SITE, 'looks', `${f.look}.webp`)]);
      ffmpeg(['-ss', String(f.loopAt), '-i', film, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '2', path.join(dir, 'thumb.jpg')]);
      // The plate at the film's full size, no desk and no cursor: for the link card and anything else that wants a frame.
      ffmpeg(['-ss', String(f.loopAt), '-i', film, '-frames:v', '1', path.join(dir, 'still.png')]);

      const seam = frameDiff(mp4, 0, L - 1 / LOOP_FPS);
      const inside = Math.min(...[1, 2, 3].map((s) => frameDiff(mp4, s, s + 1)));
      check(`${f.look}: the loop wraps with no jump`, seam < inside, `first to last frame ${seam.toFixed(2)}, the least a second apart inside ${inside.toFixed(2)}`);
      check(`${f.look}: the loop is still moving (not a frozen plate)`, inside > 0.3, `${inside.toFixed(2)} of 255 a second apart`);
      const kb = (fs.statSync(mp4).size + fs.statSync(webm).size) / 1024;
      check(`${f.look}: the loop is small enough for a card (MP4 and WebM under 1.5 MB together)`, kb < 1536, `${kb.toFixed(0)} KB`);

      const name = PRESETS.find((x) => x.id === f.look)?.name ?? f.look;
      fs.writeFileSync(path.join(dir, 'youtube.txt'), [
        `TITLE: ${name} to ${f.genre} | ChromaGlass liquid light show`,
        '',
        'DESCRIPTION:',
        `${name}, one of ChromaGlass's looks, played to "${f.track.title}". Every frame here is the app's own: the liquid is simulated as it moves and answers the music as it plays, with nothing added afterwards.`,
        '',
        'Play it yourself: https://chromaglass.art',
        '',
        'Music:',
        ...creditLines(f),
        `ISRC ${f.track.isrc}`,
        '',
        `Rendered in ChromaGlass with Song film, ${W} × ${H} at ${FPS} fps, seed ${f.seed}.`,
        '',
        `LICENCE CHECK: ${LICENCE.name}, credit above. Category: Music or Film & Animation. Made for kids: no.`,
      ].join('\n'));
    } catch (e) { failed++; console.log(`  FAIL ${f.look}: ${e.message}`); }
  }
}

await browser.close();
console.log(failed ? `\nsitefilms: ${failed} failed` : `\nsitefilms: all done; the films are in ${OUT}`);
process.exit(failed ? 1 : 0);
