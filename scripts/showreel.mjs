#!/usr/bin/env node
/**
 * Every look, rendered to a song with drums in it, as a video to watch.
 *
 *   npm run showreel
 *   SHOWREEL_ONLY=classic,poster-1969 npm run showreel
 *   SHOWREEL_SONG=song.mp3 SHOWREEL_FROM=78 SHOWREEL_SECONDS=60 npm run showreel
 *   SHOWREEL_SHARD=2/6 npm run showreel     every sixth look from the second
 *
 * Asked for (the owner, 2026-10-10): "take a look at the visuals, create
 * galleries, watch the streaming shows, and optimize the controls and
 * presets", and then, of the shows: "real light show videos from our app".
 * The gallery photographs a look (`npm run gallery`) and the film measures how
 * it moves with the band in a box (`npm run film`), but neither leaves a video
 * anyone can sit and watch, and the band in a box is a kick and a tone, not a
 * record. So this makes the video a person would make: the app's own Render a
 * song (`useSongRender`, through `window.chromaglassRender`, which is what
 * `npm run render-app` checks), on each look, to the same minute of a real
 * song, at a fixed seed.
 *
 * Why the render and not the Record button. A render steps the plate by the
 * film's clock, a frame at a time, so it drops nothing however slow the
 * runner is, and the same seed draws the same frames (render-app gate 2).
 * That makes the reel a before for later changes: a preset fixed next week can
 * be rendered again on the same seed and the same minute of the same song and
 * set beside this one. The Record button films the live loop, which on a CI
 * runner is the runner's frame rate, not the show's.
 *
 * Why this song. The library that ships (src/lib/musicLibrary.ts) is ambient,
 * chosen to play under conversation; a light show is judged on a band. The
 * default is "Funkorama" by Kevin MacLeod (incompetech.com, CC BY 4.0), which
 * the workflow downloads and checks by its hash rather than committing it:
 * measured with ffmpeg at 4 s windows, it holds -17 dB with a kick on every
 * beat, drops 7-8 dB into a breakdown from 104 s to 120 s and comes back. The
 * minute from 78 s has the groove, the breakdown and the return, so each look
 * is seen following a band, going quiet with it, and coming back.
 *
 * Each look is also watched (`scripts/watch.mjs`, as the film does) and its
 * shape written beside the clip: swells a minute, calm, near black, hues,
 * colour changes, and motion against loudness over 1 s and 20 s, the same
 * columns the film table reads against the real shows. It measures and does
 * not judge; it fails only when a look did not render.
 *
 * Writes SHOWREEL_OUT (default `showreel/`): per look a folder with clip.mp4
 * (H.264, re-encoded small enough to publish), poster.jpg, the watch's
 * timeline and sheet, and showreel.json with every number. Needs a GPU that
 * presents WebGPU and reads frames back, and ffmpeg: the macOS runner
 * (.github/workflows/showreel.yml). A cloud session's app reads back nothing.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { engineQuery } from './frame.mjs';
import { PRESETS } from '../src/presets.ts';
import { watchVideo, WatchError, findFfmpeg } from './watch.mjs';
import { AUTOPLAY, withBand, untilRunning } from './recorder.mjs';

const PORT = Number(process.env.SHOWREEL_PORT ?? 4353);
const OUT = path.resolve(process.env.SHOWREEL_OUT ?? 'showreel');
const ONLY = process.env.SHOWREEL_ONLY ? process.env.SHOWREEL_ONLY.split(',').map(s => s.trim()).filter(Boolean) : null;
const SONG = process.env.SHOWREEL_SONG ?? 'showreel-song.mp3';
const FROM = Number(process.env.SHOWREEL_FROM ?? 78);
const SECONDS = Number(process.env.SHOWREEL_SECONDS ?? 60);
const SEED = Number(process.env.SHOWREEL_SEED ?? 1);
const [W, H] = (process.env.SHOWREEL_SIZE ?? '960x540').split('x').map(Number);
const FPS = 30;
/*
 * SHOWREEL_SET='{"plateRock":0}' lays a patch of settings over every look before
 * it renders (window.chromaglassSettings, the hook the controls check turns
 * its knobs with). For a control render: 28e's first reel came back busier
 * everywhere, the silence included, and the change it was testing can only
 * calm the music's hands, so the question was which other change in the same
 * render did it; the same look with one setting off answers that, where two
 * branches would need a second branch. And for trying a look's settings on a
 * real GPU before writing them into the preset.
 */
const SET = process.env.SHOWREEL_SET ? JSON.parse(process.env.SHOWREEL_SET) : null;
const SHARD = process.env.SHOWREEL_SHARD ? process.env.SHOWREEL_SHARD.split('/').map(Number) : null;
if (!(SECONDS >= 10 && FROM >= 0 && W > 0 && H > 0)) { console.error('SHOWREEL_SECONDS must be at least 10, SHOWREEL_FROM a second, SHOWREEL_SIZE WxH'); process.exit(2); }
if (SHARD && !(SHARD.length === 2 && SHARD[0] >= 1 && SHARD[0] <= SHARD[1])) { console.error(`SHOWREEL_SHARD must be k/n (got "${process.env.SHOWREEL_SHARD}")`); process.exit(2); }
if (!fs.existsSync(SONG)) { console.error(`no song at ${SONG}: set SHOWREEL_SONG (the workflow downloads one)`); process.exit(2); }

// The ffmpeg the watch uses: $FFMPEG, PATH, or the build imageio-ffmpeg ships
// (what the macOS runner has, film.yml's install step).
const FFMPEG = findFfmpeg();
if (!FFMPEG) { console.error('no ffmpeg: `brew install ffmpeg`, or `python3 -m pip install imageio-ffmpeg`'); process.exit(2); }
const ffmpeg = (args) => {
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr.trim().split('\n').pop()}`);
};

// The minute of the song every look plays to, cut once, with a quarter-second
// fade at each end so the cut is not a click the ear reads as a kick.
fs.mkdirSync(OUT, { recursive: true });
const excerpt = path.join(OUT, 'song.wav');
ffmpeg(['-ss', String(FROM), '-t', String(SECONDS), '-i', SONG, '-ac', '2', '-ar', '48000',
  '-af', `afade=t=in:d=0.25,afade=t=out:st=${SECONDS - 0.25}:d=0.25`, excerpt]);
const songB64 = fs.readFileSync(excerpt).toString('base64');

let looks = PRESETS.filter(p => !ONLY || ONLY.includes(p.id));
if (ONLY) for (const id of ONLY) if (!PRESETS.some(p => p.id === id)) { console.error(`no look "${id}"`); process.exit(2); }
if (SHARD) looks = looks.filter((_, i) => i % SHARD[1] === SHARD[0] - 1);

const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'],
  { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
let leaving = false;
server.on('exit', (code) => {
  if (leaving) return;
  console.error(`\nthe preview server exited (${code}): port ${PORT} is probably already in use`);
  process.exit(2);
});
const stop = () => { leaving = true; try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
process.on('exit', stop);
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => { stop(); process.exit(130); });
await new Promise(r => setTimeout(r, 2500));

const reel = { song: { file: path.basename(SONG), from: FROM, seconds: SECONDS }, seed: SEED, size: [W, H], fps: FPS, looks: [] };
const save = () => fs.writeFileSync(path.join(OUT, 'showreel.json'), JSON.stringify(reel, null, 1));
console.log(`  ${looks.length} looks${SET ? `, with ${JSON.stringify(SET)} laid over each` : ''}${SHARD ? ` (shard ${SHARD.join('/')})` : ''}, rendered at ${W}x${H} ${FPS} fps on seed ${SEED} to ${SECONDS} s of ${path.basename(SONG)} from ${FROM} s, into ${OUT}\n`);

const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
try {
  for (const look of looks) {
    const dir = path.join(OUT, look.id);
    fs.mkdirSync(dir, { recursive: true });
    const row = { id: look.id, name: look.name, problems: [] }, started = Date.now();
    reel.looks.push(row);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    let raw = null;
    try {
      const page = await context.newPage();
      page.on('pageerror', e => row.problems.push(`page error: ${e.message.slice(0, 120)}`));
      // The band keeps the microphone from being asked for; the render plays
      // the song's own readings, not whatever the page is hearing.
      await withBand(page);
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${look.id}&seed=${SEED}${engineQuery()}`, { waitUntil: 'load' });
      // The opening freeze of a fresh runner, waited out as the film does.
      await page.waitForTimeout(9000);
      const running = await untilRunning(page);
      if (!running.ok) row.problems.push(`the show never ran steadily in ${(9 + running.waited).toFixed(0)} s after load`);
      else {
        if (SET) {
          await page.evaluate((p) => window.chromaglassSettings(p), SET);
          await page.waitForTimeout(500);
          row.set = SET;
        }
        // The file comes back as base64 from the page. A minute at this size
        // is tens of megabytes, so it is left on the page and fetched in
        // slices rather than handed back in one message.
        const r = await page.evaluate(async ({ b64, w, h, fps, seed }) => {
          const bin = atob(b64), bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          const r = await window.chromaglassRender({ song: bytes.buffer, width: w, height: h, fps, seed });
          window.__reel = r.bytes;
          return { phase: r.phase, message: r.message, format: r.format, frames: r.summary?.videoFrames ?? 0, length: r.bytes?.length ?? 0 };
        }, { b64: songB64, w: W, h: H, fps: FPS, seed: SEED });
        Object.assign(row, { format: r.format, frames: r.frames });
        if (r.phase !== 'done' || !r.length) row.problems.push(`the render ended ${r.phase}: ${r.message}`);
        else {
          let b64 = '';
          for (let at = 0; at < r.length; at += 8 << 20) b64 += await page.evaluate(([a, n]) => window.__reel.slice(a, a + n), [at, 8 << 20]);
          raw = Buffer.from(b64, 'base64');
        }
      }
    } catch (e) {
      row.problems.push(`render failed: ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
    }
    if (raw) {
      const ext = raw.subarray(4, 8).toString('latin1') === 'ftyp' ? 'mp4' : 'webm';
      const render = path.join(dir, `render.${ext}`), clip = path.join(dir, 'clip.mp4');
      fs.writeFileSync(render, raw);
      row.renderMB = +(raw.length / 1e6).toFixed(1);
      try {
        const r = await watchVideo(render, { out: dir, frames: 12, rate: 4, quiet: true });
        Object.assign(row, { span: r.span, shape: r.shape });
      } catch (e) {
        if (!(e instanceof WatchError)) throw e;
        row.problems.push(`the render could not be watched: ${e.message.split('\n')[0]}`);
      }
      try {
        // Small enough to put in a page: H.264 at CRF 28 holds the dye's
        // edges at this size where a lower bitrate turns them to blocks, and
        // faststart so a browser plays it before it has all of it.
        ffmpeg(['-i', render, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', clip]);
        ffmpeg(['-ss', String(Math.min(30, SECONDS / 2)), '-i', render, '-frames:v', '1', '-q:v', '3', path.join(dir, 'poster.jpg')]);
        row.clipMB = +(fs.statSync(clip).size / 1e6).toFixed(1);
      } catch (e) {
        row.problems.push(e.message.slice(0, 200));
      }
      if (process.env.SHOWREEL_KEEP !== '1') fs.rmSync(render, { force: true });
    }
    row.seconds = Math.round((Date.now() - started) / 1000);
    const s = row.shape;
    console.log(` ${row.problems.length ? 'FAIL' : 'ok  '} ${look.id} (${row.seconds} s${row.clipMB ? `, ${row.clipMB} MB` : ''})${s && !s.still ? ` — ${s.swells.perMin.toFixed(1)} swells/min, calm ${(s.calm * 100).toFixed(0)}%, black ${(s.black.p5 * 100).toFixed(0)}–${(s.black.p95 * 100).toFixed(0)}%, ${s.hues} hues` : ''}${row.problems.length ? ` — ${row.problems.join('; ')}` : ''}`);
    save();
  }
} finally {
  await browser.close();
}

save();
const failed = reel.looks.filter(r => r.problems.length);
console.log(`\n${reel.looks.length - failed.length}/${reel.looks.length} looks rendered\n  ${path.join(OUT, 'showreel.json')}`);
process.exit(failed.length ? 1 : 0);
