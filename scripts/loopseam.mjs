#!/usr/bin/env node
/**
 * A loop with no seam, for a Spotify Canvas (PLAN 43b).
 *
 *   npm run loopseam                         the judge, its controls, the seam picker (cloud)
 *   npm run loopseam -- --owed=picker        as CI runs it on ubuntu until 43b's picker ships
 *   npm run loopseam -- --app --owed=loop    as CI runs it on the Mac until 43b's render ships
 *   npm run loopseam -- --file=song-canvas.mp4   the judge alone, on any film
 *
 * A Canvas is a film of 3 to 8 seconds that Spotify plays round and round
 * under a track, with no sound of its own. A real fluid never comes back to
 * where it started, so the loop has to be an edit of the finished film (PLAN
 * §43, "Physics"): pick two frames a loop apart that nearly match, and
 * crossfade the film's own frames across the seam. The plate is untouched. What
 * a person sees if that edit is wrong is one frame every few seconds where the
 * whole plate jumps, which is the thing this check is for.
 *
 * So the judge reads the finished MP4 (its boxes for its tracks and length,
 * ffmpeg for its frames, shrunk to 16x16 grey) and asks five things, every bar
 * a comparison within the one film:
 *
 *   1. it lasts 3 to 8 seconds (Spotify's own limits);
 *   2. it has no audio track (Spotify's rule: a Canvas carries none);
 *   3. it moves: the first frame and the middle one differ by at least four
 *      times the film's median step from one frame to the next. Without this a
 *      still picture would pass the seam line below, a step of nothing against
 *      a median of nothing;
 *   4. the seam, the step from the last frame back to the first, is no larger
 *      than 3 times that median step: the jump at the seam is about one more
 *      frame of the liquid's own motion, not a cut;
 *   5. and there is no cut inside either: no step anywhere in the film is more
 *      than 8 times the median. A loop that hid its seam by cutting somewhere
 *      else (a "crossfade" that switches at once) passes 4 and fails this.
 *      8 and not 3 because the crossfade's own frames step further than the
 *      film's: they carry the distance between the two picked frames across
 *      half a second (3.4 to 4 times the median on the made-up film, whose
 *      picked frames are as far apart as any; a cut is about 50).
 *
 * Why the median and not the mean or the largest step: a film of a song has
 * kicks in it, frames where the liquid lurches, and a mean or a maximum would
 * let a seam hide among them on a busy song and fail every loop of a quiet one.
 * The median is the film's ordinary step.
 *
 * Why 3 and not the 1.5 PLAN 43b first wrote: the codec. Measured 2026-11-07 on
 * the made-up film below, a loop whose seam before encoding is exactly one
 * ordinary step (1.22 against a median of 1.22) reads 1.8 times the median
 * after H.264 at crf 18, 2.6 at crf 23 and 3.0 at crf 28, at any size the
 * frames are shrunk to (64 px down to 8). The codec's error is carried from
 * each frame to the next, so consecutive frames share it and their step hides
 * it, but the last frame and the first are coded apart and the step between
 * them carries it whole; a keyframe every second halves it only partly (1.65
 * into each keyframe at crf 18). That is a flicker of a level or two once a
 * loop, which no one sees; what a person sees is a cut, and the same film cut
 * without a crossfade reads 47 times the median. 3 sits above what the codec
 * adds at the app's rates (H.264 at 0.1 bits a pixel and never under 2 Mbps,
 * src/lib/render.ts, which at a Canvas's 720x1280 is about crf 18) and far
 * under a cut. The controls below encode at crf 18 on one thread, so the same
 * input is the same file.
 *
 * The judge is shown to see each of the four on films it makes itself (always
 * run, in the cloud, with nothing owed): a made-up film of travelling waves
 * whose speeds share no period, so like the liquid it never repeats. Cut to 8 s
 * with the check's own crossfade (half a second, linear) it passes; the same
 * 8 s cut plain fails the seam line; the crossfaded loop with a silent audio track fails the audio line;
 * a 10 s loop fails the length line; and a picture held still, and the same
 * picture with a grain on it, fail the moves line. If any of those flips, the judge is blind to
 * that thing, and every later green from it means nothing.
 *
 * Then the two parts 43b builds, each owed until it ships:
 *
 *   picker  `src/lib/loopSeam.ts`, plain functions over small grey frames, run
 *           here in node on made-up frames:
 *             frameDistance(a, b)   mean |a - b| per element (0..255);
 *                                   throws on a length mismatch
 *             pickSeam(thumbs, loopFrames, fadeFrames) → { start, distance }
 *                                   the start s, 0 <= s <= n - loopFrames - fadeFrames,
 *                                   with the least frameDistance(thumbs[s], thumbs[s + loopFrames]),
 *                                   the earliest on a tie; throws when n < loopFrames + fadeFrames
 *             fadeWeight(t, fadeFrames)
 *                                   the weight of the film's own frame s + t at the
 *                                   loop's frame t; the rest goes to frame s + loopFrames + t.
 *                                   0 at t = 0 (so the seam, last frame to first, is
 *                                   the film's own step from s + loopFrames - 1 to
 *                                   s + loopFrames), rising to 1 at t = fadeFrames, and
 *                                   1 from there on; fadeFrames 0 gives 1 throughout
 *           and, joined, a loop the picker and the weights make from the made-up
 *           film passes the seam line while the same pick without the weights fails.
 *   loop    the app's render, on a Mac (`--app`): `window.chromaglassRender`
 *           (`?debug`, src/app/useSongRendering.ts) takes
 *           `loop: { seconds, crossfade }` and hands back the loop's MP4 and
 *           `loop: { startFrame }`. A 4 s loop of a song the check makes (kicks on
 *           the beat, so the plate moves), rendered twice from the same seed, once
 *           with the crossfade and once without: the crossfaded file passes all
 *           five lines and holds exactly the 4 s of frames asked; the other fails the seam
 *           line (so in the app's own film the check is shown to see a seam);
 *           both are the same pick, and in the middle half of the loop (the fade
 *           is at one end of the file, whichever the render chooses) their frames
 *           are the same film, closer than one ordinary step apart (so "without
 *           the crossfade" is not some other film with a cut made for the check).
 *
 * --owed: a line is excused only in main's state (no src/lib/loopSeam.ts for
 * `picker`; no `loop` in the `chromaglassRender` hook's type in
 * src/lib/checkHooks.ts for `loop`) and printed as owed. An owed line that
 * passes is red until its id is taken out, and an id is red once its part is
 * no longer main's: the PR that builds a part takes its id out of --owed in
 * scripts/checks.json, and never edits a bar here.
 *
 * Needs ffmpeg ($FFMPEG, the path, or imageio-ffmpeg's static build): the
 * Measure job's `sound` part installs it, and the Mac's `tools` shard fetches
 * it for `npm run watch`, which is why `--app` runs there.
 */
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findFfmpeg } from './watch.mjs';

const APP = process.argv.includes('--app');
// --file=x.mp4: only the judge's five lines, on a film made anywhere (a kit's canvas file, 43c;
// a done-for-you order before it is sent, 43f).
const FILE = process.argv.find((a) => a.startsWith('--file='))?.slice('--file='.length) ?? null;
const flag = process.argv.find((a) => a.startsWith('--owed='));
const owed = new Set(flag ? flag.slice('--owed='.length).split(',').filter(Boolean) : []);
const OWED_IDS = ['picker', 'loop'];
const PICKER = 'src/lib/loopSeam.ts';
// Main's state, read broadly so a built part cannot stay excused by being spelt
// another way: the picker is main's while no file under src/ exports a pickSeam,
// and the app's loop while src/lib/checkHooks.ts, where the render hook's options
// are declared, never says "loop" (it says it nowhere on main).
const exportsPickSeam = (dir) => readdirSync(dir, { withFileTypes: true }).some((e) => e.isDirectory()
  ? exportsPickSeam(join(dir, e.name))
  : /\.(ts|tsx|js|mjs)$/.test(e.name) && /export\s+(async\s+)?(function|const)\s+pickSeam\b/.test(readFileSync(join(dir, e.name), 'utf8')));
const MAINS = {
  picker: !existsSync(PICKER) && !exportsPickSeam('src'),
  loop: !/\bloop/i.test(readFileSync('src/lib/checkHooks.ts', 'utf8')),
};

// The four bars, named once (see the header for why each is what it is).
const MIN_S = 3, MAX_S = 8;
const SEAM_OVER_MEDIAN = 3;
const MOVES_OVER_MEDIAN = 4;
const CUT_OVER_MEDIAN = 8;
// The frames are judged shrunk to 16x16 grey, each cell the average of its
// pixels: at 64x64 the codec's grain on a still picture (±4 in a third of the
// pixels, below) passed the moves line at 4.6 times its median step; at 16
// it reads 2.8, because a cell averages the grain away and keeps the
// liquid's shapes, which are larger than a sixteenth of the plate.
const THUMB = 16;

let failed = 0, passed = 0, owedLines = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
/** A line of a part 43b builds, excused only while it is owed and that part is main's. */
const line = (id, name, ok, detail = '') => {
  if (!owed.has(id)) return check(name, ok, detail);
  if (ok) return check(name, false, `${detail}; it passes, so it is no longer owed: take "${id}" out of --owed`);
  if (!MAINS[id]) return check(name, false, `${detail}; owed only while the ${id} part is main's, and it is not`);
  owedLines++;
  console.log(` owed  ${name}${detail ? ` — ${detail}` : ''}`);
};
const unknown = [...owed].filter((id) => !OWED_IDS.includes(id));
if (unknown.length) check('every id in --owed is a part of this check', false, `unknown: ${unknown.join(', ')}`);

// The app's part while it is owed prints its lines and reads no film, so it needs no ffmpeg.
const appOwed = APP && owed.has('loop') && MAINS.loop;
const ffmpeg = appOwed ? null : findFfmpeg();
if (!ffmpeg && !appOwed) {
  check('ffmpeg is here to read the films', false, 'none on the path, $FFMPEG unset, no imageio-ffmpeg; `python3 -m pip install imageio-ffmpeg`');
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), 'loopseam-'));
process.on('exit', () => rmSync(work, { recursive: true, force: true }));

// ─── the judge ───────────────────────────────────────────────────────────────

const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The judge's numbers for a film's frames: its ordinary step, its seam, and how far it travels. */
function measure(frames) {
  const steps = [];
  for (let i = 1; i < frames.length; i++) steps.push(dist(frames[i - 1], frames[i]));
  const med = median(steps);
  return {
    frames: frames.length, median: med, largest: steps.length ? Math.max(...steps) : NaN,
    seam: dist(frames[frames.length - 1], frames[0]),
    travel: dist(frames[0], frames[frames.length >> 1]),
  };
}
const seamOk = (m) => m.seam <= SEAM_OVER_MEDIAN * m.median;
// Strictly more: a picture the codec holds perfectly still has a travel and a median of 0.
const movesOk = (m) => m.travel > MOVES_OVER_MEDIAN * m.median;
const noCutInside = (m) => m.largest <= CUT_OVER_MEDIAN * m.median;
const fmt = (m) => `seam ${m.seam.toFixed(2)} against a median step of ${m.median.toFixed(2)} (${(m.seam / m.median).toFixed(1)}x, at most ${SEAM_OVER_MEDIAN}x); first to middle ${m.travel.toFixed(2)} (${(m.travel / m.median).toFixed(1)}x, at least ${MOVES_OVER_MEDIAN}x); largest step inside ${m.largest.toFixed(2)} (${(m.largest / m.median).toFixed(1)}x, at most ${CUT_OVER_MEDIAN}x); ${m.frames} frames`;

/** Every frame ffmpeg finds in the file, as it was stored (no frame made up or dropped), 64x64 grey. */
function decode(file) {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-fps_mode', 'passthrough', '-vf', `scale=${THUMB}:${THUMB}:flags=area,format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${r.stderr.toString().slice(0, 300)}`);
  const n = THUMB * THUMB, out = [];
  for (let i = 0; i + n <= r.stdout.length; i += n) out.push(r.stdout.subarray(i, i + n));
  return out;
}

/**
 * An MP4's boxes, read loosely: the movie's length (mvhd) and each track's
 * handler (hdlr: `vide`, `soun`). Loosely on purpose. The strict reader
 * (scripts/media-read.mjs) holds the app's own muxer to every byte it writes,
 * and `npm run render-app` already puts the app's files through it; here it
 * would refuse the controls' files for what ffmpeg legitimately does (a
 * track's duration rounded a tick apart from its media's, an edit list for
 * AAC's priming), and a judge that cannot read the files it is shown to fail
 * has not been shown anything.
 */
function mp4Facts(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const kids = (from, to) => {
    const out = [];
    for (let at = from; at + 8 <= to;) {
      let size = dv.getUint32(at), head = 8;
      if (size === 1) { size = Number(dv.getBigUint64(at + 8)); head = 16; } else if (size === 0) size = to - at;
      if (size < head || at + size > to) throw new Error(`a box at byte ${at} runs past its parent`);
      out.push({ type: String.fromCharCode(...b.subarray(at + 4, at + 8)), body: at + head, end: at + size });
      at += size;
    }
    return out;
  };
  const one = (box, type) => kids(box.body, box.end).find((k) => k.type === type);
  const moov = kids(0, b.length).find((k) => k.type === 'moov');
  if (!moov) throw new Error('no moov box');
  const mvhd = one(moov, 'mvhd');
  const v1 = b[mvhd.body] === 1;
  const scale = dv.getUint32(mvhd.body + (v1 ? 20 : 12));
  const duration = v1 ? Number(dv.getBigUint64(mvhd.body + 24)) : dv.getUint32(mvhd.body + 16);
  const handlers = kids(moov.body, moov.end).filter((k) => k.type === 'trak').map((trak) => {
    const hdlr = one(one(trak, 'mdia'), 'hdlr');
    return String.fromCharCode(...b.subarray(hdlr.body + 8, hdlr.body + 12));
  });
  return { seconds: duration / scale, handlers };
}

/** The file as the judge reads it: its length and tracks from its boxes, its frames from ffmpeg. */
function judgeFile(file) {
  const { seconds, handlers } = mp4Facts(readFileSync(file));
  return { seconds, audio: handlers.filter((h) => h === 'soun').length, ...measure(decode(file)) };
}
const lengthOk = (j) => j.seconds >= MIN_S - 1e-3 && j.seconds <= MAX_S + 1e-3;

// ─── a made-up film, and loops of it ─────────────────────────────────────────

const W = 96, H = 160, FPS = 30;
/**
 * Travelling waves at speeds with no common period (1.1, 0.73√2 and π/6 radians
 * a second), so like the liquid the film never comes back to where it began:
 * a cut anywhere in it is a jump, and only a crossfade hides one.
 */
function madeUpFilm(seconds) {
  const out = [];
  for (let f = 0; f < Math.round(seconds * FPS); f++) {
    const t = f / FPS, px = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 128 + 45 * Math.sin(0.21 * x + 0.13 * y + 1.1 * t)
        + 35 * Math.sin(0.17 * x - 0.19 * y - 0.73 * Math.SQRT2 * t + 1)
        + 25 * Math.sin(0.09 * x + 0.27 * y + (Math.PI / 6) * t + 2);
      px[y * W + x] = Math.max(0, Math.min(255, Math.round(v)));
    }
    out.push(px);
  }
  return out;
}
/** The loop of `film` from `start`, `loopFrames` long, with frame t = w·film[start+t] + (1−w)·film[start+loop+t]. */
function loopOf(film, start, loopFrames, fadeFrames, weight) {
  const out = [];
  for (let t = 0; t < loopFrames; t++) {
    const w = weight(t, fadeFrames), own = film[start + t];
    if (w >= 1) { out.push(own); continue; }
    const next = film[start + loopFrames + t], px = new Uint8Array(own.length);
    for (let i = 0; i < px.length; i++) px[i] = Math.round(w * own[i] + (1 - w) * next[i]);
    out.push(px);
  }
  return out;
}
const linearFade = (t, fade) => (fade <= 0 || t >= fade ? 1 : t / fade);
let filmCount = 0;
/** H.264 in an MP4, as a Canvas is sent; a silent AAC track beside it when asked. */
function encode(frames, { audio = false } = {}) {
  const file = join(work, `film${filmCount++}.mp4`);
  const a = audio ? ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo'] : [];
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', ...a,
    '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-crf', '18', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), '-movflags', '+faststart', file],
  { input: Buffer.concat(frames.map((f) => Buffer.from(f.buffer, f.byteOffset, f.byteLength))), maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg could not encode: ${r.stderr.toString().slice(0, 300)}`);
  return file;
}

if (FILE) {
  const j = judgeFile(FILE);
  check(`it lasts ${MIN_S} to ${MAX_S} s`, lengthOk(j), `${j.seconds.toFixed(3)} s`);
  check('it has no audio track', j.audio === 0, `${j.audio} audio tracks`);
  check('it moves', movesOk(j), fmt(j));
  check('its seam is one more step of the film, not a cut', seamOk(j), fmt(j));
  check('and there is no cut inside it', noCutInside(j), fmt(j));
} else if (!APP) {
  // ─── the judge, shown to see each thing ────────────────────────────────────
  const FADE = 15, LOOP = 8 * FPS;
  const film = madeUpFilm(11);
  const good = judgeFile(encode(loopOf(film, 0, LOOP, FADE, linearFade)));
  check('the judge passes an 8 s crossfaded loop of a film that never repeats', lengthOk(good) && good.audio === 0 && movesOk(good) && seamOk(good) && noCutInside(good),
    `${good.seconds.toFixed(3)} s, ${good.audio} audio tracks; ${fmt(good)}`);
  const cut = judgeFile(encode(film.slice(0, LOOP)));
  check('the judge fails the same 8 s cut without the crossfade, on the seam line', !seamOk(cut) && lengthOk(cut) && movesOk(cut), fmt(cut));
  const switched = judgeFile(encode(loopOf(film, 0, LOOP, FADE, (t, fade) => (t >= fade ? 1 : 0))));
  check('the judge fails a loop whose "crossfade" switches at once, on the cut-inside line, where the seam line alone would pass it',
    !noCutInside(switched) && seamOk(switched), fmt(switched));
  const sounded = judgeFile(encode(loopOf(film, 0, LOOP, FADE, linearFade), { audio: true }));
  check('the judge fails the crossfaded loop with a silent audio track, on the audio line', sounded.audio === 1 && seamOk(sounded), `${sounded.audio} audio tracks`);
  const long = judgeFile(encode(loopOf(film, 0, 10 * FPS, FADE, linearFade)));
  check('the judge fails a 10 s crossfaded loop, on the length line', !lengthOk(long) && seamOk(long), `${long.seconds.toFixed(3)} s, against ${MIN_S} to ${MAX_S}`);
  // One picture held: every step 0, so the seam line passes it (0 against 0)
  // and only the moves line, strictly more than 4 times nothing, can fail it.
  const held = judgeFile(encode(Array.from({ length: 4 * FPS }, () => film[0])));
  check('the judge fails a picture held still, on the moves line, where the seam line alone would pass it', !movesOk(held) && seamOk(held), fmt(held));
  // And one picture with a flicker of ±4 in a seeded third of its pixels each
  // frame, the codec's grain made worse: frames far apart differ by grain the
  // codec carried from frame to frame, so this is what the 16 px cells are for.
  let s = 0x2545f491;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const still = Array.from({ length: 4 * FPS }, () => film[0].map((v) => (rnd() < 0.33 ? Math.max(0, Math.min(255, v + (rnd() < 0.5 ? -4 : 4))) : v)));
  const frozen = judgeFile(encode(still));
  check('the judge fails a still picture with a grain on it, on the moves line', !movesOk(frozen), fmt(frozen));

  // ─── the seam picker (43b, src/lib/loopSeam.ts) ────────────────────────────
  let lib = null, why = `${PICKER} is not there yet`;
  if (!MAINS.picker) {
    try { lib = await import(pathToFileURL(PICKER).href); why = ''; } catch (e) { why = `${PICKER} did not load: ${e.message.slice(0, 200)}`; }
  }
  const tryIt = (f) => { try { return f(); } catch (e) { return e; } };
  const has = (name) => lib && typeof lib[name] === 'function';
  {
    const ok = has('frameDistance') && (() => {
      const a = Uint8Array.of(0, 10, 20), b = Uint8Array.of(10, 0, 20);
      return lib.frameDistance(a, a) === 0 && Math.abs(lib.frameDistance(a, b) - 20 / 3) < 1e-9
        && lib.frameDistance(b, a) === lib.frameDistance(a, b) && tryIt(() => lib.frameDistance(a, Uint8Array.of(1, 2))) instanceof Error;
    })();
    line('picker', 'frameDistance is the mean |a - b| per element, and refuses frames of two sizes', ok, has('frameDistance') ? '[0,10,20] to [10,0,20] should be 20/3' : why);
  }
  {
    // Independent random frames: every pair is about 85 apart, but for the ones planted.
    let r = 0x9e3779b9;
    const rand = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return r >>> 0; };
    const frames = (n) => Array.from({ length: n }, () => Uint8Array.from({ length: 256 }, () => rand() & 255));
    const near = (f, by) => f.map((v) => (v + by > 255 ? v - by : v + by));
    const N = 90, L = 40, X = 6;
    const one = frames(N); one[17 + L] = near(one[17], 1);
    const p1 = has('pickSeam') ? tryIt(() => lib.pickSeam(one, L, X)) : null;
    line('picker', 'pickSeam finds the one pair a loop apart that nearly match, and says how near',
      p1?.start === 17 && Math.abs(p1.distance - 1) < 1e-9, has('pickSeam') ? `picked ${JSON.stringify(p1?.start ?? String(p1))} at ${p1?.distance}, planted 17 at 1` : why);
    const two = frames(N); two[30 + L] = two[30].slice(); two[5 + L] = two[5].slice();
    const p2 = has('pickSeam') ? tryIt(() => lib.pickSeam(two, L, X)) : null;
    line('picker', 'pickSeam takes the earliest of two equal pairs', p2?.start === 5, has('pickSeam') ? `picked ${p2?.start ?? String(p2)}, planted 5 and 30` : why);
    // An exact pair whose fade would run past the film, and a near one that fits.
    const late = N - L - X + 1, three = frames(N);
    three[late + L] = three[late].slice(); three[10 + L] = near(three[10], 3);
    const p3 = has('pickSeam') ? tryIt(() => lib.pickSeam(three, L, X)) : null;
    line('picker', 'pickSeam never picks a start whose fade runs past the last frame', p3?.start === 10, has('pickSeam') ? `picked ${p3?.start ?? String(p3)}; ${late} matches exactly but its fade needs frame ${late + L + X - 1} of ${N - 1}` : why);
    const p4 = has('pickSeam') ? tryIt(() => lib.pickSeam(frames(L + X - 1), L, X)) : null;
    line('picker', 'pickSeam refuses a film shorter than the loop and its fade', p4 instanceof Error, has('pickSeam') ? `${L + X - 1} frames for ${L} + ${X}: ${p4 instanceof Error ? p4.message : JSON.stringify(p4)}` : why);
  }
  {
    const X = 15;
    const ws = has('fadeWeight') ? Array.from({ length: X + 6 }, (_, t) => lib.fadeWeight(t, X)) : [];
    const rising = ws.length > 0 && ws.slice(0, X + 1).every((w, t) => t === 0 || w > ws[t - 1]);
    const ok = ws.length > 0 && ws[0] === 0 && rising && ws.slice(X).every((w) => w === 1) && [0, 3, 40].every((t) => lib.fadeWeight(t, 0) === 1);
    line('picker', 'fadeWeight is 0 at the first frame, rises to 1 at the fade\'s end and stays there; no fade is all 1',
      ok, has('fadeWeight') ? ws.map((w) => w.toFixed(2)).join(' ') : why);
  }
  {
    // Joined: the picker and the weights make a loop of the made-up film, raw, without a codec.
    const thumbs = film.map((f) => { const t = new Uint8Array(THUMB * THUMB); for (let y = 0; y < THUMB; y++) for (let x = 0; x < THUMB; x++) t[y * THUMB + x] = f[Math.floor(y * H / THUMB) * W + Math.floor(x * W / THUMB)]; return t; });
    const L = 6 * FPS, X = 15;
    const pick = has('pickSeam') && has('fadeWeight') ? tryIt(() => lib.pickSeam(thumbs, L, X)) : null;
    const made = pick && !(pick instanceof Error) ? measure(loopOf(thumbs, pick.start, L, X, lib.fadeWeight)) : null;
    const plain = made ? measure(thumbs.slice(pick.start, pick.start + L)) : null;
    line('picker', 'a 6 s loop the picker and the weights make passes the seam line, and the same pick without the weights fails it',
      !!made && seamOk(made) && !seamOk(plain), made ? `from frame ${pick.start}: with ${fmt(made)}; without, seam ${plain.seam.toFixed(2)} (${(plain.seam / plain.median).toFixed(1)}x)` : why || String(pick));
  }
} else {
  await app();
}

// ─── the app's render, on a Mac (43b) ────────────────────────────────────────

async function app() {
  const names = [
    'the app renders a 4 s loop that lasts 4 s to a frame and has no audio track',
    'the app\'s crossfaded loop passes the seam, moves and cut-inside lines',
    'the same loop rendered without the crossfade fails the seam line',
    'both renders are the same pick, the same film away from the fade',
  ];
  if (owed.has('loop') && MAINS.loop) {
    for (const n of names) line('loop', n, false, 'chromaglassRender takes no loop yet (src/lib/checkHooks.ts)');
    return;
  }
  const { chromium } = await import('playwright');
  const { launchChromium } = await import('./chromium.mjs');
  const { engineQuery, isGpuEngine } = await import('./frame.mjs');
  const PORT = 4353, SEED = 7, SECONDS = 4, AFPS = 30, SONG_S = 14;
  const server = spawn('./node_modules/.bin/vite', ['preview', '--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
  const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch {} };
  process.on('exit', stop);
  await new Promise((r) => setTimeout(r, 2500));
  const browser = await launchChromium(chromium);
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
    await page.goto(`http://localhost:${PORT}/?debug&gpu=mid&tier=local&look=classic&seed=${SEED}${engineQuery()}`, { waitUntil: 'load' });
    await page.waitForTimeout(9000);
    const engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
    if (!isGpuEngine(engine)) {
      check('the GPU solver is the one being measured', false, `${engine ?? 'no debug hook'}: this needs a GPU that reads the app's frames back (a Mac)`);
      return;
    }
    const render = (crossfade) => page.evaluate(async ({ b64, crossfade, SECONDS, AFPS, SEED }) => {
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const r = await window.chromaglassRender({ song: bytes.buffer, width: 320, height: 180, fps: AFPS, seed: SEED, loop: { seconds: SECONDS, crossfade } });
      return { phase: r.phase, message: r.message, bytes: r.bytes, startFrame: r.loop?.startFrame ?? null };
    }, { b64: songWav(SONG_S), crossfade, SECONDS, AFPS, SEED });
    const runs = {};
    for (const [k, x] of [['with', true], ['without', false]]) {
      const r = await render(x);
      if (r.phase !== 'done' || !r.bytes) { check(`the ${k}-crossfade loop renders`, false, `${r.phase}: ${r.message}`); return; }
      const file = join(work, `app-${k}.mp4`);
      writeFileSync(file, Buffer.from(r.bytes, 'base64'));
      runs[k] = { ...judgeFile(file), startFrame: r.startFrame, thumbs: decode(file) };
    }
    const a = runs.with, b = runs.without;
    line('loop', names[0], a.frames === SECONDS * AFPS && Math.abs(a.seconds - SECONDS) <= 1 / AFPS + 1e-3 && lengthOk(a) && a.audio === 0,
      `${a.frames} frames for ${SECONDS * AFPS}, ${a.seconds.toFixed(3)} s, ${a.audio} audio tracks`);
    line('loop', names[1], seamOk(a) && movesOk(a) && noCutInside(a), fmt(a));
    line('loop', names[2], !seamOk(b), fmt(b));
    // The middle half of the loop: the fade (half a second, 43b) sits at one end of the
    // file or the other, as the render chooses (a render that streams holds only the
    // fade's frames and writes the blends last), so the two are one film here either way.
    const q = a.frames >> 2;
    const past = a.thumbs.slice(q, a.frames - q).map((f, i) => dist(f, b.thumbs[q + i] ?? f));
    const apart = past.length ? Math.max(...past) : Infinity;
    line('loop', names[3], a.startFrame !== null && a.startFrame === b.startFrame && a.frames === b.frames && apart < a.median,
      `start frames ${a.startFrame} and ${b.startFrame}; ${a.frames} and ${b.frames} frames; the middle half at most ${apart.toFixed(2)} apart, against a step of ${a.median.toFixed(2)}`);
  } finally {
    await browser.close();
    stop();
  }
}

/** A 16-bit stereo WAV at 48 kHz: a kick on every beat at 120 bpm and a tone that swells over each bar, so the plate moves. */
function songWav(seconds) {
  const rate = 48000, n = Math.round(seconds * rate), data = Buffer.alloc(44 + n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / rate, beat = t % 0.5, bar = (t % 2) / 2;
    const kick = Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-beat * 30)) * beat) * Math.exp(-beat * 9);
    const tone = 0.25 * Math.sin(2 * Math.PI * 660 * t) * (0.3 + 0.7 * bar);
    const q = Math.round(Math.max(-1, Math.min(1, 0.8 * kick + tone)) * 32767);
    data.writeInt16LE(q, 44 + i * 4); data.writeInt16LE(q, 46 + i * 4);
  }
  data.write('RIFF', 0); data.writeUInt32LE(36 + n * 4, 4); data.write('WAVE', 8);
  data.write('fmt ', 12); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 4, 28); data.writeUInt16LE(4, 32); data.writeUInt16LE(16, 34);
  data.write('data', 36); data.writeUInt32LE(n * 4, 40);
  return data.toString('base64');
}

console.log(failed ? `\n${failed} of ${passed + failed} loop seam checks failed${owedLines ? `, ${owedLines} owed` : ''}`
  : `\nall ${passed} loop seam checks pass${owedLines ? `, and ${owedLines} lines owed (${[...owed].join(', ')})` : ''}`);
process.exit(failed ? 1 : 0);
