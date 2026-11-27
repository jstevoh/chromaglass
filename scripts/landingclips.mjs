#!/usr/bin/env node
/**
 * The webpage's two moving pictures, cut from films of the app (PLAN.md 34a-2).
 *
 *   npm run landingclips                       the hero's loops and the music clip
 *   LANDINGCLIPS_ONLY=hero npm run landingclips
 *   LANDINGCLIPS_HERO='/path/a.mp4@60,/path/b.mp4@30' npm run landingclips   other pieces, to try a cut
 *
 * What was asked (the owner, 2026-11-21): the hero's cross-fade of five
 * 480 × 300 stills to be a full-width loop filmed from the app, and a clip of
 * the plate playing to music, muted until tapped, the music the modern
 * ambient tracks the rescore (34a-8) films the looks to: Scott Buckley's,
 * released under CC BY 4.0 and credited where it plays.
 *
 * Why it cuts rather than films: the rescore already films each look whole to
 * its track on the Mac (`npm run sitefilms`, 1920 × 1080 at 30 fps, the
 * plate's own frames read back, nothing added afterwards). Filming the same
 * looks again for the webpage would be the GPU's time twice for the same
 * plate, and the Mac's GPU is shared with the deploys. So this needs only
 * ffmpeg, and runs on any machine with the films: the sources are named in
 * `LANDING_HERO.films` and `LANDING_MUSIC.film` (src/lib/landingMedia.ts),
 * so a recut is a change to that list and this command.
 *
 * The hero: each piece is `seconds` of its film from `at`, joined to the next
 * by a cross-fade of `blend` seconds, and the end blended back into the start
 * as sitefilms blends a card's loop: the last `blend` seconds are faded into
 * the montage's first, so at the wrap the picture is the frame it starts on
 * (landinghero 2 measures the seam). Two shapes: 1280 × 720 for a laptop and
 * 720 × 1280 for a phone held upright, the middle 9:16 of the 1080p film (608
 * of its 1920 columns) so the phone's loop is the plate and not a letterbox.
 * No sound track (the hero never speaks; a WebM with an empty audio track is
 * still a file a browser fetches and decodes).
 *
 * Each shape is written as WebM (VP9, which this Chromium and every desktop
 * browser but old Safari plays) and MP4 (H.264 for Safari), at the best
 * quality that fits LANDING_HERO.maxBytes: the constant-quality ladder steps
 * up until the file fits, because a fluid's detail varies so much between
 * looks that one setting is a 900 KB file for one and 3 MB for the next. The
 * poster is the MP4's own first frame as WebP, so the still the page paints
 * first is the frame the loop opens on and the fade from one to the other is
 * invisible.
 *
 * The music clip: `seconds` of the track's film from `at`, sound and all,
 * 1280 × 720, its sound faded in and out so the loop's wrap is not a click,
 * Opus in the WebM and AAC in the MP4, under LANDING_MUSIC.maxBytes.
 *
 * Runs ffmpeg at the lowest priority with two threads: the Mac it usually
 * runs on is also a CI runner.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LANDING_HERO, LANDING_MUSIC } from '../src/lib/landingMedia.ts';

const FILMS = process.env.LANDINGCLIPS_FILMS ?? '/Volumes/Media/ChromaGlass/renders/ambient-2026-11';
const WORK = path.resolve(process.env.LANDINGCLIPS_OUT ?? 'scratch/landingclips');
const ONLY = process.env.LANDINGCLIPS_ONLY?.split(',').map((s) => s.trim()) ?? ['hero', 'music'];
const THREADS = process.env.LANDINGCLIPS_THREADS ?? '2';
const pub = (p) => path.join('public', p);

const run = (args) => execFileSync('nice', ['-n', '19', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-threads', THREADS, ...args], { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 << 20 });
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());

let encoders = '';
try { encoders = execFileSync('ffmpeg', ['-hide_banner', '-encoders']).toString(); } catch { console.error('landingclips: ffmpeg is not on the PATH'); process.exit(2); }
const lacking = ['libx264', 'libvpx-vp9', 'libwebp', 'libopus', 'aac'].filter((e) => !encoders.includes(` ${e} `));
if (lacking.length) { console.error(`landingclips: this ffmpeg has no ${lacking.join(', ')}`); process.exit(2); }

/** `/path/film.mp4@60` or a film id with its second, to the film's file and the second. */
const source = (id, at) => ({ file: id.includes('/') ? id : path.join(FILMS, id, 'film.mp4'), at });
const fromEnv = (v) => v.split(',').filter(Boolean).map((s) => { const [f, a] = s.split('@'); return source(f, Number(a ?? 0)); });

const kb = (n) => `${(n / 1000).toFixed(0)} KB`;
let failed = 0;
const say = (ok, line) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failed++; };

/**
 * Encode `master` to WebM and MP4 at the best quality under `max` bytes each.
 * The ladders: x264's crf 23 is close to the master to the eye; VP9's 33 the
 * same (its scale is not x264's). Each step is about a fifth fewer bytes.
 */
const fit = (master, out, max, audio) => {
  const a264 = audio ? ['-c:a', 'aac', '-b:a', '128k'] : ['-an'];
  const avp9 = audio ? ['-c:a', 'libopus', '-b:a', '96k'] : ['-an'];
  const got = {};
  for (const [kind, ladder, args] of [
    ['mp4', [23, 25, 27, 29, 31, 33], (q) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(q), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', ...a264]],
    ['webm', [33, 36, 39, 42, 45, 48], (q) => ['-c:v', 'libvpx-vp9', '-crf', String(q), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', ...avp9]],
  ]) {
    const file = `${out}.${kind}`;
    for (const q of ladder) {
      run(['-i', master, ...args(q), file]);
      got[kind] = { q, bytes: fs.statSync(file).size };
      if (got[kind].bytes <= max) break;
    }
  }
  return got;
};

const poster = (mp4, webp) => run(['-i', mp4, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', webp]);

fs.mkdirSync(WORK, { recursive: true });

if (ONLY.includes('hero')) {
  const H = LANDING_HERO, S = H.seconds, D = H.blend;
  const pieces = process.env.LANDINGCLIPS_HERO ? fromEnv(process.env.LANDINGCLIPS_HERO) : H.films.map((f) => source(f.id, f.at));
  if (!pieces.length) { console.error('landingclips: LANDING_HERO.films names no film (or set LANDINGCLIPS_HERO)'); process.exit(2); }
  const absent = pieces.filter((p) => !fs.existsSync(p.file));
  if (absent.length) { console.error(`landingclips: no film at ${absent.map((p) => p.file).join(', ')}`); process.exit(2); }
  const L = pieces.length * S;
  console.log(`  the hero: ${pieces.length} piece(s) of ${S} s, ${D} s blends, a ${L} s loop`);
  for (const [name, shape] of [['wide', H.wide], ['tall', H.tall]]) {
    const [w, h] = shape.size;
    // The tall shape is the film's middle at the phone's 9:16; the wide one the film scaled.
    const frame = `${w < h ? 'crop=ih*9/16:ih,' : ''}scale=${w}:${h}:flags=lanczos,fps=30,format=yuv420p`;
    const inputs = pieces.flatMap((p) => ['-ss', String(p.at), '-t', String(S + D + 0.5), '-i', p.file]);
    const parts = pieces.map((_, i) => `[${i}:v]${frame},trim=0:${S + D},setpts=PTS-STARTPTS[p${i}]`);
    // Each piece fades into the next as it ends: the k-th join starts at k × S, the montage S × N + D long.
    let last = 'p0';
    for (let k = 1; k < pieces.length; k++) { parts.push(`[${last}][p${k}]xfade=transition=fade:duration=${D}:offset=${k * S}[m${k}]`); last = `m${k}`; }
    // Then sitefilms' wrap: the montage from D, its last D seconds faded into its first D.
    parts.push(`[${last}]split[x][y];[x]trim=${D}:${L + D},setpts=PTS-STARTPTS[a];[y]trim=0:${D},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=${D}:offset=${L - D},format=yuv420p[o]`);
    const master = path.join(WORK, `hero-${name}-master.mp4`);
    run([...inputs, '-filter_complex', parts.join(';'), '-map', '[o]', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', master]);
    const got = fit(master, pub(shape.mp4).replace(/\.mp4$/, ''), H.maxBytes, false);
    poster(pub(shape.mp4), pub(shape.poster));
    const d = Number(probe(pub(shape.webm)).format.duration);
    say(got.mp4.bytes <= H.maxBytes && got.webm.bytes <= H.maxBytes,
      `${name} ${w} × ${h}, ${d.toFixed(2)} s: MP4 crf ${got.mp4.q} ${kb(got.mp4.bytes)}, WebM crf ${got.webm.q} ${kb(got.webm.bytes)}, poster ${kb(fs.statSync(pub(shape.poster)).size)} (each under ${kb(H.maxBytes)})`);
  }
}

if (ONLY.includes('music')) {
  const M = LANDING_MUSIC;
  const [p] = process.env.LANDINGCLIPS_MUSIC ? fromEnv(process.env.LANDINGCLIPS_MUSIC) : [source(M.film.id, M.film.at)];
  if (!fs.existsSync(p.file)) { console.error(`landingclips: no film at ${p.file}`); process.exit(2); }
  const T = M.film.seconds;
  console.log(`  the music clip: ${T} s of ${p.file} from ${p.at} s`);
  if (!probe(p.file).streams.some((s) => s.codec_type === 'audio')) { console.error('landingclips: that film has no sound'); process.exit(2); }
  const master = path.join(WORK, 'music-master.mp4');
  // Half a second in and a second and a half out: the loop's wrap is a breath, not a click.
  run(['-ss', String(p.at), '-t', String(T), '-i', p.file,
    '-vf', 'scale=1280:720:flags=lanczos,fps=30,format=yuv420p',
    '-af', `afade=t=in:d=0.5,afade=t=out:st=${T - 1.5}:d=1.5`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-c:a', 'aac', '-b:a', '256k', master]);
  const got = fit(master, pub(M.mp4).replace(/\.mp4$/, ''), M.maxBytes, true);
  poster(pub(M.mp4), pub(M.poster));
  say(got.mp4.bytes <= M.maxBytes && got.webm.bytes <= M.maxBytes,
    `music 1280 × 720, ${T} s with sound: MP4 crf ${got.mp4.q} ${kb(got.mp4.bytes)}, WebM crf ${got.webm.q} ${kb(got.webm.bytes)} (each under ${kb(M.maxBytes)})`);
}

process.exit(failed ? 1 : 0);
