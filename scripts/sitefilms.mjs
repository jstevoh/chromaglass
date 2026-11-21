#!/usr/bin/env node
/**
 * The webpage's films, and the channel's: each piece in src/lib/siteFilms.ts
 * played whole by its look, in the app, on a Mac.
 *
 *   npm run sitefilms                                 all six, rendered
 *   SITEFILMS_ONLY=machina npm run sitefilms          one
 *   npm run sitefilms -- --films ~/renders            cut from renders made already
 *   npm run sitefilms -- --album cylinders            a channel album: a look a piece, one film
 *   SITEFILMS_ONLY=3 npm run sitefilms -- --album cylinders   only its third piece
 *   npm run sitefilms -- --banner                     the channel's banner, from the desk
 *
 * What was asked (the owner, 2026-10-29, 2026-11-08 and 2026-11-21; PLAN.md
 * 34a-6, 34a-6d): films of the looks, each playing a whole piece of music,
 * on the webpage and on the channel; since 2026-11-21 to modern ambient
 * music under CC BY 4.0, not the 1920s records (siteFilms.ts says why).
 * What this makes, under SITEFILMS_OUT (default scratch/sitefilms/, which git
 * ignores), for each film:
 *
 *   <id>/film.mp4       the whole piece with the plate playing it, for the
 *                       channel: the app's own Song film (`useSongRender`),
 *                       every frame drawn and none dropped, 1920 × 1080 at
 *                       30 fps by default (SITEFILMS_SIZE, SITEFILMS_FPS),
 *                       the size the owner judged the films at
 *   <id>/thumb.jpg      1280 × 720, the channel's thumbnail
 *   <id>/still.png      the same moment at the film's size, as a PNG
 *   <id>/youtube.txt    the film's title and description, the credit in it
 *
 * and into public/landing/films (the files the webpage serves; commit them):
 *
 *   <id>.mp4, .webm     the card's loop, LOOP_SECONDS with no sound
 *   <id>.webp           the loop's first frame, the card's still
 *
 * `--films <dir>` takes the films from <dir>/<id>-<look>.mp4 instead of
 * rendering them: a render of the six is about an hour and a half of the
 * Mac's GPU, and the films the owner judged were made by this same render
 * (the app's Song film at the same size, rate and seed) before this script
 * knew the music; the music in them is checked against siteFilms.ts the
 * same way, by its length.
 *
 * `--album <id>` makes one of CHANNEL_ALBUMS: each piece rendered by its own
 * look into <OUT>/<id>/<n>.mp4, the same way as a webpage film, then the
 * pieces joined end to end into <OUT>/<id>/film.mp4 (the streams are copied,
 * not encoded again: every piece is the same encoder at the same size and
 * rate), with youtube.txt carrying a chapter at the start of each piece. Each
 * piece is its own render, so a look starts fresh on its piece the way a
 * performer changes look between songs; the cut falls where one piece ends.
 * A piece rendered already is kept, and SITEFILMS_ONLY names pieces by their
 * number, so the album can be made a piece at a time between the Mac's
 * deploys (the GPU busy with a render sends a deploy to a slower runner,
 * docs/mac-runner.md); the pieces are joined once all are there.
 *
 * The music: the composer's own file (siteFilms.ts says whose and why),
 * checked against its checksum, trimmed from its head silence to just past
 * its last sound, with a FADE_IN_S fade in and a FADE_OUT_S fade out, at
 * 48 kHz and 16 bits. Nothing else is done to it: no EQ, no level change.
 *
 * Each film is also read for light, a frame every 30 seconds: a look that
 * drains to black on a quiet passage (Clock Glass and Cell Bloom did, with no
 * music, PLAN.md 12-tv-loops) is a film nobody watches to the end, and an
 * ambient piece is quieter than a 78 ever was, so it is checked rather than
 * hoped for.
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
import { launchChromium, port } from './chromium.mjs';
import { isGpuEngine } from './frame.mjs';
import { AUTOPLAY, untilRunning } from './recorder.mjs';
import { SITE_FILMS, CHANNEL_ALBUMS, LOOP_SECONDS, LOOP_BLEND_S, FADE_IN_S, FADE_OUT_S, LICENCE, creditOf } from '../src/lib/siteFilms.ts';

// Asked of ports.mjs, so it moves with its runner's block and never meets
// another harness's preview (4361 was stutter's).
const PORT = port(4362, 'SITEFILMS_PORT');
const OUT = path.resolve(process.env.SITEFILMS_OUT ?? 'scratch/sitefilms');
const DIST = path.resolve('dist-sitefilms');
const [W, H] = (process.env.SITEFILMS_SIZE ?? '1920x1080').split('x').map(Number);
const FPS = Number(process.env.SITEFILMS_FPS ?? 30);
const ONLY = process.env.SITEFILMS_ONLY?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const BANNER = process.argv.includes('--banner');
const at = process.argv.indexOf('--films');
const FILMS_FROM = at > 0 ? path.resolve(process.argv[at + 1] ?? '') : null;
const al = process.argv.indexOf('--album');
const ALBUM = al > 0 ? CHANNEL_ALBUMS.find((a) => a.id === process.argv[al + 1]) ?? null : null;
if (al > 0 && !ALBUM) { console.error(`sitefilms: no album is named ${process.argv[al + 1]}; there are ${CHANNEL_ALBUMS.map((a) => a.id).join(', ')}`); process.exit(2); }
// The card is 8:5; the loop is cut from the film at that shape, at twice the
// size the three-wide row shows a card, for a sharp still on a laptop's screen.
const LOOP_W = 640, LOOP_H = 400, LOOP_FPS = 30;
const SITE = path.resolve('public/landing/films');

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }).toString();
const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));

let encoders = '';
try { encoders = run('ffmpeg', ['-hide_banner', '-encoders']); } catch { console.error('sitefilms: ffmpeg is not on the PATH (brew install ffmpeg)'); process.exit(2); }
const missing = ['libx264', 'libvpx-vp9', 'libwebp'].filter((e) => !encoders.includes(e));
if (missing.length) { console.error(`sitefilms: this ffmpeg has no ${missing.join(', ')}`); process.exit(2); }

const films = SITE_FILMS.filter((f) => !ONLY || ONLY.includes(f.id));
if (!BANNER && !ALBUM && !films.length) { console.error(`sitefilms: no film is named ${ONLY.join(', ')}`); process.exit(2); }
if (FILMS_FROM && !fs.existsSync(FILMS_FROM)) { console.error(`sitefilms: ${FILMS_FROM} is not a folder`); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

/**
 * The piece, fetched once and checked against its checksum; then the music
 * itself as a 48 kHz, 16-bit WAV: from `from` for `seconds`, a FADE_IN_S fade
 * in and a FADE_OUT_S fade out past the last sound, so the film neither
 * clicks in nor stops on a cut.
 */
async function musicOf(id, music) {
  const dir = path.join(OUT, 'music');
  fs.mkdirSync(dir, { recursive: true });
  const whole = path.join(dir, `${id}${path.extname(new URL(music.file).pathname) || '.audio'}`);
  if (!fs.existsSync(whole)) {
    const r = await fetch(music.file);
    if (!r.ok) throw new Error(`${music.file}: HTTP ${r.status}`);
    fs.writeFileSync(whole, Buffer.from(await r.arrayBuffer()));
  }
  const sum = createHash('sha256').update(fs.readFileSync(whole)).digest('hex');
  if (sum !== music.sha256) throw new Error(`${id}: the file's checksum is ${sum}, not the one in siteFilms.ts; listen to it before changing that`);
  const { from, seconds } = music;
  const cut = path.join(dir, `${id}.wav`);
  ffmpeg(['-ss', String(from), '-t', String(seconds), '-i', whole,
    '-af', `afade=t=in:d=${FADE_IN_S},afade=t=out:st=${(seconds - FADE_OUT_S).toFixed(3)}:d=${FADE_OUT_S}`,
    '-ar', '48000', '-c:a', 'pcm_s16le', cut]);
  return cut;
}

const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
let failed = 0;
let browser = null;

/*
  The build, with no sign-in, and a browser on it: only when something is to
  be rendered. A Mac that builds the site has the owner's Firebase settings in
  an .env file, and with them /show asks for a sign-in and the page at / is the
  webpage. Vite takes a variable already in the environment over the file's,
  so these, set empty, are what the build sees.
*/
if (BANNER || !FILMS_FROM) {
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
  browser = await launchChromium(chromium, { args: [AUTOPLAY] });
}

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

/** The app's Song film of the whole piece, written to `file`. The bytes come back in slices: a 150 MB string in one message is more than the page's pipe wants. */
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
  if (meta.phase !== 'done' || !meta.length) throw new Error(`${f.id}: the render ended ${meta.phase}: ${meta.message}`);
  const SLICE = 8 << 20;
  const parts = [];
  for (let at = 0; at < meta.length; at += SLICE) {
    parts.push(Buffer.from(await page.evaluate(({ at, n }) => window.__siteFilm.slice(at, at + n), { at, n: SLICE }), 'base64'));
  }
  await page.evaluate(() => { window.__siteFilm = null; });
  fs.writeFileSync(file, Buffer.concat(parts));
  console.log(`  ${f.id}: ${meta.message} (${((Date.now() - t0) / 1000).toFixed(0)} s here)`);
}

/** Mean absolute difference of two frames of the loop, 0 to 255, read small. */
function frameDiff(file, a, b) {
  const grab = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=160:100', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
  const x = grab(a), y = grab(b);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return s / x.length;
}

/** The channel's title: the piece and who made it (the words a listener searches for), then the look while it fits the channel's 100 characters. */
const youtubeTitle = (title, artist, look) => {
  const long = `${title} by ${artist}, played by the ${look} look | ChromaGlass liquid light show`;
  return long.length <= 100 ? long : `${title} by ${artist} | ChromaGlass liquid light show`;
};

/** The film's light, a frame every 30 s, 0 to 255: the least of them, and when. */
function darkest(file, seconds) {
  let least = 255, when = 0;
  for (let t = 15; t < seconds - 5; t += 30) {
    const px = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', 'scale=64:36,format=gray', '-f', 'rawvideo', '-']);
    const mean = px.reduce((s, v) => s + v, 0) / px.length;
    if (mean < least) { least = mean; when = t; }
  }
  return { least, when };
}

/** A film's length against its music's, at the size asked, with its sound; and that it never goes dark. */
function checkFilm(id, film, seconds) {
  const p = probe(film);
  const v = p.streams.find((s) => s.codec_type === 'video'), a = p.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(p.format.duration);
  check(`${id}: ${W} × ${H} at ${FPS} fps, the music's length, with its music`,
    v?.width === W && v?.height === H && v?.r_frame_rate === `${FPS}/1` && !!a && Math.abs(dur - seconds) < 0.25,
    `${v?.width}×${v?.height} ${v?.r_frame_rate}, ${dur.toFixed(2)} s against ${seconds} s, audio ${a ? a.codec_name : 'none'}`);
  // 6 of 255 is a plate gone black but for a glint; the looks sit at 40 to 120.
  const { least, when } = darkest(film, dur);
  check(`${id}: the plate never goes dark (a frame every 30 s)`, least > 6, `the darkest ${least.toFixed(1)} of 255 at ${Math.floor(when / 60)}:${String(Math.round(when % 60)).padStart(2, '0')}`);
}

const UPLOAD_NOTES = `UPLOAD NOTES: the music is ${LICENCE.name} (public/landing/films/SOURCES.md has each page and its licence line). Scott Buckley's own claim system skips a video whose description names him, so keep his credit line word for word; a claim that comes anyway is released with his form, https://www.scottbuckley.com.au/library/copyright-claims-release/. Chris Zabriskie uses no claim system: a claim on his music is someone else's, dispute it as licensed under ${LICENCE.long}. Category: Music. Made for kids: no. Altered or synthetic content: no (an app's render of a real recording, nothing that looks like a real person or event).`;
const stamp = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

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
} else if (ALBUM) {
  const dir = path.join(OUT, ALBUM.id);
  fs.mkdirSync(dir, { recursive: true });
  const parts = [];
  let missing = 0;
  try {
    for (const [i, piece] of ALBUM.pieces.entries()) {
      const id = `${ALBUM.id}-${i + 1}`;
      const part = path.join(dir, `${i + 1}.mp4`);
      if (!fs.existsSync(part) && ONLY && !ONLY.includes(String(i + 1))) { missing++; continue; }
      if (!fs.existsSync(part)) {
        const wav = await musicOf(id, piece.music);
        const page = await openShow(piece.look, { seed: piece.seed, viewport: { width: 1280, height: 800 } });
        await songFilm(page, wav, { id, seed: piece.seed }, part);
        await page.close();
      } else console.log(`  ${id}: rendered already, ${part}`);
      checkFilm(id, part, piece.music.seconds);
      parts.push(part);
    }
    if (missing) throw new Error(`${missing} of ${ALBUM.pieces.length} pieces still to render; the album is joined once all are there`);
    const list = path.join(dir, 'parts.txt');
    fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
    const film = path.join(dir, 'film.mp4');
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', film]);
    const total = ALBUM.pieces.reduce((s, p) => s + p.music.seconds, 0);
    const dur = Number(probe(film).format.duration);
    check(`${ALBUM.id}: the pieces joined, the album's length`, Math.abs(dur - total) < 0.25 * ALBUM.pieces.length, `${dur.toFixed(1)} s against ${total.toFixed(1)} s`);
    const at0 = ALBUM.pieces[0].music.seconds / 2;
    ffmpeg(['-ss', String(at0), '-i', film, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '2', path.join(dir, 'thumb.jpg')]);
    let t = 0;
    const chapters = ALBUM.pieces.map((p) => { const line = `${stamp(t)} ${p.music.title} (${p.lookName})`; t += p.music.seconds; return line; });
    const title = `${ALBUM.title}, ${ALBUM.artist} (${ALBUM.year}), the whole album | ChromaGlass liquid light show`;
    check(`${ALBUM.id}: the title fits the channel's 100 characters`, title.length <= 100, `${title.length}`);
    fs.writeFileSync(path.join(dir, 'youtube.txt'), [
      `TITLE: ${title}`,
      '',
      'DESCRIPTION:',
      `${ALBUM.artist}'s album ${ALBUM.title}, played whole by ChromaGlass, a different look for each piece. Every frame is the app's own: the liquid is simulated as it moves and answers the music as it plays, with nothing added afterwards.`,
      '',
      'Play it yourself: https://chromaglass.art',
      '',
      ...chapters,
      '',
      'Music:',
      `${ALBUM.title} by ${ALBUM.artist} (${ALBUM.year})`,
      `Licensed under ${LICENCE.long}: ${LICENCE.url}`,
      ALBUM.page,
      '',
      `Rendered in ChromaGlass with Song film, ${W} × ${H} at ${FPS} fps.`,
      '',
      UPLOAD_NOTES,
    ].join('\n'));
  } catch (e) { failed++; console.log(`  FAIL ${ALBUM.id}: ${e.message}`); }
} else {
  fs.mkdirSync(SITE, { recursive: true });
  for (const f of films) {
    const dir = path.join(OUT, f.id);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const film = path.join(dir, 'film.mp4');
      if (FILMS_FROM) {
        const from = path.join(FILMS_FROM, `${f.id}-${f.look}.mp4`);
        if (!fs.existsSync(from)) throw new Error(`no ${from}`);
        fs.copyFileSync(from, film);
      } else {
        const wav = await musicOf(f.id, f.music);
        const page = await openShow(f.look, { seed: f.seed, viewport: { width: 1280, height: 800 } });
        await songFilm(page, wav, f, film);
        await page.close();
      }

      // The film is the piece, whole: its length is the trim's to within a
      // frame or two (the encoder's audio priming), at the size asked.
      checkFilm(f.id, film, f.music.seconds);

      // The card's loop: cut, cropped to 8:5, blended at the seam (header).
      const L = LOOP_SECONDS, D = LOOP_BLEND_S;
      const shape = `crop=ih*8/5:ih,scale=${LOOP_W}:${LOOP_H}:flags=lanczos,fps=${LOOP_FPS},format=yuv420p`;
      const graph = `[0:v]${shape},split[x][y];[x]trim=${D}:${L + D},setpts=PTS-STARTPTS[a];[y]trim=0:${D},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${D}:offset=${L - D},format=yuv420p[o]`;
      const mp4 = path.join(SITE, `${f.id}.mp4`), webm = path.join(SITE, `${f.id}.webm`);
      ffmpeg(['-ss', String(f.loopAt), '-t', String(L + D + 0.5), '-i', film, '-filter_complex', graph, '-map', '[o]', '-an',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-profile:v', 'high', '-movflags', '+faststart', mp4]);
      ffmpeg(['-i', mp4, '-an', '-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', webm]);
      ffmpeg(['-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', path.join(SITE, `${f.id}.webp`)]);
      ffmpeg(['-ss', String(f.loopAt), '-i', film, '-frames:v', '1', '-vf', 'scale=1280:720:flags=lanczos', '-q:v', '2', path.join(dir, 'thumb.jpg')]);
      // The plate at the film's full size, no desk and no cursor: for the link card and anything else that wants a frame.
      ffmpeg(['-ss', String(f.loopAt), '-i', film, '-frames:v', '1', path.join(dir, 'still.png')]);

      const seam = frameDiff(mp4, 0, L - 1 / LOOP_FPS);
      const inside = Math.min(...[1, 2, 3].map((s) => frameDiff(mp4, s, s + 1)));
      check(`${f.id}: the loop wraps with no jump`, seam < inside, `first to last frame ${seam.toFixed(2)}, the least a second apart inside ${inside.toFixed(2)}`);
      check(`${f.id}: the loop is still moving (not a frozen plate)`, inside > 0.3, `${inside.toFixed(2)} of 255 a second apart`);
      const kb = (fs.statSync(mp4).size + fs.statSync(webm).size) / 1024;
      check(`${f.id}: the loop is small enough for a card (MP4 and WebM under 1.5 MB together)`, kb < 1536, `${kb.toFixed(0)} KB`);

      const title = youtubeTitle(f.music.title, f.music.artist, f.lookName);
      check(`${f.id}: the title fits the channel's 100 characters`, title.length <= 100, `${title.length}`);
      fs.writeFileSync(path.join(dir, 'youtube.txt'), [
        `TITLE: ${title}`,
        '',
        'DESCRIPTION:',
        `${f.music.artist}'s ${f.music.title}, played whole by ChromaGlass's ${f.lookName} look. Every frame is the app's own: the liquid is simulated as it moves and answers the music as it plays, with nothing added afterwards.`,
        '',
        'Play it yourself: https://chromaglass.art',
        '',
        'Music:',
        ...creditOf(f.music),
        '',
        `Rendered in ChromaGlass with Song film, ${W} × ${H} at ${FPS} fps, seed ${f.seed}.`,
        '',
        UPLOAD_NOTES,
      ].join('\n'));
    } catch (e) { failed++; console.log(`  FAIL ${f.id}: ${e.message}`); }
  }
}

await browser?.close();
console.log(failed ? `\nsitefilms: ${failed} failed` : `\nsitefilms: all done; the films are in ${OUT}`);
process.exit(failed ? 1 : 0);
