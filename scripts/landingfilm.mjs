#!/usr/bin/env node
/**
 * The landing page's clips, filmed from the app with the music in them
 * (PLAN.md 34a-2).
 *
 *   npm run landingfilm                         every clip
 *   LF_ONLY=hero,macro npm run landingfilm      some of them
 *   LF_KEEP=1 npm run landingfilm               keep the raw takes (tens of MB each)
 *   LF_LOOK=aurora-borealis LF_ONLY=hero ...    try another look in a clip's place (with LF_KEEP=1 to look at the take)
 *   LF_ENCODE=1 npm run landingfilm             encode the kept takes again, without filming
 *   LF_OUT=/some/dir ...                        where the takes go (default landing-takes/, git-ignored)
 *
 * Each clip is a take through the app's own Record button
 * (`scripts/recorder.mjs`): the canvas and the sound in one file, with a track
 * from `public/music` playing through the app's own player, so the plate is
 * answering the music that is in the file and not a mix laid over it after.
 * Each clip has its own piece, so that the page does not sound like one album:
 * an ambient piano swell, a hip-hop groove, solo Bach and an electro-rock build.
 * They are public domain, CC0 or CC BY (TRACKS below carries each one's licence
 * and where it came from; the page credits the CC BY ones under the clip), and
 * only the few seconds each clip uses leave this script. The full tracks are
 * fetched from the Internet Archive into `landing-takes/music/` the first time
 * (checked by size), served for the take at `/music/landing/`, and never added
 * to the repository: the show's own shelf (`musicLibrary.ts`) is not changed.
 * `LF_MUSIC=/dir` uses tracks already there instead of downloading them.
 *
 * What it writes to `public/landing/clips/`, per clip:
 *   <id>.webm   VP9 and Opus, the first thing a browser is offered
 *   <id>.mp4    H.264 and AAC, for Safari and for what has no VP9
 *   <id>.jpg    the poster: the clip's first frame, shown until it plays
 *
 * The hero is a loop. Its end is folded into its start with a cross-fade
 * (video and sound alike) so that the last frame is the next one after the
 * first and nothing jumps when it comes round. `loopSeam` prints how far
 * apart the two sides of the seam are, in the same units as the clip's own
 * frame-to-frame change, so "less than a frame of motion" is a number.
 *
 * Needs a GPU that presents WebGPU (a Mac) and ffmpeg. Not run by CI.
 */
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';
import { engineQuery } from './frame.mjs';
import { AUTOPLAY, withBand, recordTake, untilRunning } from './recorder.mjs';

const PORT = Number(process.env.LF_PORT ?? 4361);
const TAKES = path.resolve(process.env.LF_OUT ?? 'landing-takes');
const SITE = path.resolve('public/landing/clips');
const ONLY = process.env.LF_ONLY ? process.env.LF_ONLY.split(',').map(s => s.trim()).filter(Boolean) : null;
const KEEP = process.env.LF_KEEP === '1';
const ENCODE_ONLY = process.env.LF_ENCODE === '1';
/** Seconds of the plate before the take starts, so the clip opens on a plate that is already alive. */
const WARM = Number(process.env.LF_WARM ?? 6);

const MUSIC = path.resolve(process.env.LF_MUSIC ?? path.join(TAKES, 'music'));

/**
 * The pieces the clips are filmed to. `bytes` is the file's size on the
 * Internet Archive, held so a changed or truncated download is refused. The
 * licences are the archive items' own, and the page repeats them under each clip
 * (`CLIPS` in `Landing.tsx`); PLAN.md 34a-2 lists them too.
 */
const TRACKS = {
  sun: { file: 'sun.mp3', bytes: 7017472, licence: 'CC BY 3.0', title: 'The Sun Is Scheduled to Come Out Tomorrow', artist: 'Chris Zabriskie',
    url: 'https://archive.org/download/ChrisZabriskieIAmAManWhoWillFightForYourHonor/Chris%20Zabriskie%20-%20I%20Am%20a%20Man%20Who%20Will%20Fight%20for%20Your%20Honor%20-%2002%20The%20Sun%20is%20Scheduled%20to%20Come%20Out%20Tomorrow.mp3' },
  beat: { file: 'beat.mp3', bytes: 10803543, licence: 'CC BY 3.0', title: 'Caught In The Beat', artist: 'Broke For Free',
    url: 'https://archive.org/download/Slam_Funk-7603/Broke_For_Free_-_04_-_Caught_In_The_Beat.mp3' },
  aria: { file: 'aria.mp3', bytes: 5849600, licence: 'CC0 (Bach, public domain)', title: 'Goldberg Variations: Aria', artist: 'Kimiko Ishizaka',
    url: 'https://archive.org/download/OpenGoldbergVariations/Kimiko%20Ishizaka%20-%20J.S.%20Bach-%20-Open-%20Goldberg%20Variations%2C%20BWV%20988%20%28Piano%29%20-%2001%20Aria.mp3' },
  fire: { file: 'fire.mp3', bytes: 7287204, licence: 'CC BY 4.0', title: 'Set This Thing on Fire', artist: 'Chris Zabriskie',
    url: 'https://archive.org/download/cz-blackhole/06%20-%20Set%20This%20Thing%20on%20Fire.mp3' },
};

/**
 * The clips. `look` is a preset id; `track` is a TRACKS key and `from` is where
 * in it the take starts; `seconds` is what the visitor sees. A loop is filmed
 * `fold` seconds longer (see above). `width` is the file's width; the page shows
 * the hero across the screen and the others in a row of cards. `from` is
 * chosen where the piece is playing something (its swell, its groove), not its
 * intro: the plate answers what it hears.
 */
const CLIPS = [
  { id: 'hero', look: 'jellyfish-bloom', track: 'sun', from: 255, seconds: 12, fold: 2, loop: true, width: 1280, crf: 38, crfMp4: 27, seed: 3 },
  { id: 'ferrofluid', look: 'ferro-paint', track: 'beat', from: 100, seconds: 8, width: 960, crf: 42, crfMp4: 31, seed: 5 },
  { id: 'dye-pour', look: 'poster-1969', track: 'aria', from: 150, seconds: 8, width: 960, crf: 42, crfMp4: 31, seed: 2 },
  { id: 'macro', look: 'macro-bead', track: 'fire', from: 232, seconds: 8, width: 800, fps: 20, crf: 58, crfMp4: 38, seed: 1 },
];

/** Fetch whatever of TRACKS is not in MUSIC yet, holding each to its size. */
async function fetchTracks(keys) {
  fs.mkdirSync(MUSIC, { recursive: true });
  for (const k of keys) {
    const t = TRACKS[k];
    const f = path.join(MUSIC, t.file);
    if (fs.existsSync(f) && fs.statSync(f).size === t.bytes) continue;
    const res = await fetch(t.url);
    if (!res.ok) throw new Error(`${t.title}: ${res.status} from ${t.url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length !== t.bytes) throw new Error(`${t.title}: ${buf.length} bytes, expected ${t.bytes}`);
    fs.writeFileSync(f, buf);
    console.log(`  fetched ${t.artist}, ${t.title} (${t.licence})`);
  }
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 6).join(' ')} …: ${(r.stderr || '').split('\n').slice(-6).join('\n')}`);
  return r.stdout;
};
const kb = f => `${(fs.statSync(f).size / 1024).toFixed(0)} KB`;

/** The clip's own frame-to-frame change, and the seam's, as mean absolute luma difference (0..255) at 160x90. */
function lumaFrames(file, from, count) {
  const w = 160, h = 90;
  const buf = spawnSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-i', file, '-frames:v', String(count), '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 }).stdout;
  const out = [];
  for (let i = 0; i + w * h <= buf.length; i += w * h) out.push(buf.subarray(i, i + w * h));
  return out;
}
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/** Make the files for one clip from its raw take. */
function encode(clip, take) {
  fs.mkdirSync(SITE, { recursive: true });
  const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', take]).trim());
  const vf = `scale=${clip.width}:-2:flags=lanczos,fps=${clip.fps ?? 24}`;
  const base = path.join(SITE, clip.id);
  // The take opens on the record click, so a moment of it is the button's. Trim it.
  const lead = 0.6;
  let input, filter, afilter;
  if (clip.loop) {
    const L = clip.seconds, f = clip.fold;
    if (dur < lead + L + f) throw new Error(`${clip.id}: the take is ${dur.toFixed(1)} s, a loop needs ${(lead + L + f).toFixed(1)}`);
    // body = A[0, L], tail = A[L, L+f]; the tail fades into the body's first f seconds.
    filter = `[0:v]trim=start=${lead}:end=${lead + L},setpts=PTS-STARTPTS,${vf}[b];[0:v]trim=start=${lead + L}:end=${lead + L + f},setpts=PTS-STARTPTS,${vf}[t];[t][b]xfade=transition=fade:duration=${f}:offset=0[v]`;
    afilter = `[0:a]atrim=start=${lead}:end=${lead + L},asetpts=PTS-STARTPTS[ab];[0:a]atrim=start=${lead + L}:end=${lead + L + f},asetpts=PTS-STARTPTS[at];[at][ab]acrossfade=d=${f}:c1=tri:c2=tri[a]`;
  } else {
    if (dur < lead + clip.seconds) throw new Error(`${clip.id}: the take is ${dur.toFixed(1)} s, wanted ${(lead + clip.seconds).toFixed(1)}`);
    filter = `[0:v]trim=start=${lead}:end=${lead + clip.seconds},setpts=PTS-STARTPTS,${vf}[v]`;
    afilter = `[0:a]atrim=start=${lead}:end=${lead + clip.seconds},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st=${clip.seconds - 0.8}:d=0.8[a]`;
  }
  input = ['-i', take];
  const fc = `${filter};${afilter}`;
  // 64 kbps stereo Opus / 80 kbps AAC: ambient music holds up at that, and a hero is mostly audio's weight otherwise.
  run('ffmpeg', ['-y', '-v', 'error', ...input, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libvpx-vp9', '-crf', String(clip.crf), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', '-b:a', '64k', `${base}.webm`]);
  run('ffmpeg', ['-y', '-v', 'error', ...input, '-filter_complex', fc, '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-crf', String(clip.crfMp4), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '80k', `${base}.mp4`]);
  run('ffmpeg', ['-y', '-v', 'error', '-i', `${base}.mp4`, '-frames:v', '1', '-q:v', '6', `${base}.jpg`]);
  const line = `${clip.id}: webm ${kb(`${base}.webm`)}, mp4 ${kb(`${base}.mp4`)}, poster ${kb(`${base}.jpg`)}`;
  if (!clip.loop) return line;
  // The seam: how far the last frame is from the first, against how far one
  // frame is from the next anywhere in the clip.
  const mp4 = `${base}.mp4`;
  const all = lumaFrames(mp4, 0, 24 * clip.seconds);
  const steps = all.slice(1).map((f, i) => diff(all[i], f)).sort((a, b) => a - b);
  const typical = steps[Math.floor(steps.length / 2)];
  const seam = diff(all[all.length - 1], all[0]);
  return `${line}; seam ${seam.toFixed(2)} against a typical frame-to-frame change of ${typical.toFixed(2)} (${seam <= typical * 1.5 ? 'under a frame of motion' : 'MORE than a frame of motion'})`;
}

if (ENCODE_ONLY) {
  let bad = 0;
  for (const clip of CLIPS.filter(c => !ONLY || ONLY.includes(c.id))) {
    const take = path.join(TAKES, `${clip.id}.webm`);
    try { console.log(`  ${encode(clip, take)}`); } catch (e) { bad++; console.log(`FAIL ${clip.id}: ${e.message.split('\n')[0]}`); }
  }
  process.exit(bad ? 1 : 0);
}

const wanted = [...new Set(CLIPS.filter(c => !ONLY || ONLY.includes(c.id)).map(c => c.track))];
await fetchTracks(wanted);
// vite preview serves dist/ as it is on disk, so the tracks go in beside the build.
fs.mkdirSync('dist/music/landing', { recursive: true });
for (const k of wanted) fs.copyFileSync(path.join(MUSIC, TRACKS[k].file), path.join('dist/music/landing', TRACKS[k].file));

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

fs.mkdirSync(TAKES, { recursive: true });
const browser = await launchChromium(chromium, { args: [AUTOPLAY] });
let failed = 0;
try {
  for (const clip of CLIPS.filter(c => !ONLY || ONLY.includes(c.id))) {
    if (process.env.LF_LOOK) clip.look = process.env.LF_LOOK;
    const take = path.join(TAKES, `${clip.id}.webm`);
    fs.rmSync(take, { force: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
    try {
      const page = await context.newPage();
      await withBand(page);
      const errors = [];
      page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
      await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=${clip.look}&seed=${clip.seed}${engineQuery()}`, { waitUntil: 'load' });
      await page.waitForTimeout(9000);
      const running = await untilRunning(page);
      if (!running.ok) throw new Error('the show never ran steadily');
      // The music, from where the clip wants it; a new song must not cue another look over this one.
      await page.evaluate(() => window.chromaglassSettings?.({ onNewSong: 'off' }));
      // Start the app's own player (any shelf track), then put the clip's piece in its audio element: the
      // analyser is wired to that element, so the plate hears the swapped-in file.
      await page.evaluate(() => window.chromaglassMusic('/music/ambisphere-c.mp3'));
      await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.currentTime > 0; }, null, { timeout: 20000 });
      await page.evaluate(async (src) => { const a = document.querySelector('audio'); a.src = src; await a.play(); }, `/music/landing/${TRACKS[clip.track].file}`);
      await page.waitForFunction(() => { const a = document.querySelector('audio'); return a && !a.paused && a.currentTime > 0; }, null, { timeout: 20000 });
      await page.evaluate((s) => { const a = document.querySelector('audio'); if (a) a.currentTime = s; }, clip.from);
      await page.waitForTimeout(WARM * 1000);
      const length = clip.seconds + (clip.fold ?? 0) + 1.2;
      const got = await recordTake(page, length, take);
      if (!got.ok) throw new Error(got.reason);
      if (errors.length) console.log(`  page errors: ${errors.join('; ')}`);
      console.log(`  ${encode(clip, take)}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${clip.id}: ${e.message.split('\n')[0]}`);
    } finally {
      await context.close();
      if (!KEEP) fs.rmSync(take, { force: true });
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
