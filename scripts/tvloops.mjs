#!/usr/bin/env node
/**
 * The TV's calm loops (PLAN 12-tv-loops): made on a Mac, judged anywhere.
 *
 *   npm run tvloops -- --controls                  the judge, shown its controls (cloud, CI)
 *   npm run tvloops                                render, loop and judge them all (a Mac)
 *   npm run tvloops -- --only=chemical-clock --seconds=60    one, short, to try a look
 *   npm run tvloops -- --upload                    and put each on the tv-loops-1 pre-release
 *   npm run tvloops -- --upload --clean            and delete each loop here once it is up
 *   npm run tvloops -- --judge=out/galaxy.mp4      the judge alone, on any loop
 *   npm run tvloops -- --only=classic --from-raw=f.mp4   cut, judge and preview a film already rendered
 *
 * The owner, 2026-11-14: "audio free visuals that the appletv and googletv
 * apps can use. like 10 different 30 minute loops that evolve over time and
 * are calming." Which looks, and why films and not something the TV draws,
 * is written in src/lib/tvLoops.ts. This makes them and holds each to what a
 * TV playing it round and round for an evening needs.
 *
 * ## Making one (a Mac: the app's GPU solver needs Metal)
 *
 * The app's own Render a song (`window.chromaglassRender`, `?debug`, the
 * path `npm run render-app` checks): the look laid on clean glass at the
 * loop's seed, Evolve switched on (the show action `automate-toggle`, as the
 * desk's Evolve button), and a song of silence as long as the film, so the
 * render hears nothing and every move on the plate is the liquid's own or
 * Evolve's. Half an hour of 1080p at the render's rate is about 1.4 GB, more
 * than a page should hold, so the hook's `toDisk` sends it to the page's save
 * picker as a person's render does, and this script stands in for the picker
 * (the init script below) and writes each positioned chunk into the file.
 *
 * Then the loop, an edit of the finished film and never of the plate, as the
 * Canvas loop is (`npm run loopseam`, PLAN 43b): the film runs WARM seconds,
 * the loop's length L, and SEAM seconds more. The loop is the film from WARM
 * to WARM + L, except that its first SEAM seconds are a crossfade from the
 * film's own seconds after WARM + L (weight 1 at the loop's first frame) into
 * its own (weight 1 at SEAM). So the loop's last frame, the film's frame at
 * WARM + L − 1/fps, is followed when it comes round by the film's very next
 * frame: the seam is one ordinary step. WARM because the look being laid is a
 * beginning, which a loop has none of. The tail and the film are each their
 * own input to ffmpeg, seeked to their start: one input split two ways would
 * hold twenty-nine minutes of frames in memory waiting for the tail.
 *
 * The file is H.264 High at level 4.1, 1080p30, no audio track, a keyframe
 * every two seconds and `+faststart`: what every Google TV and every Apple
 * TV back to the HD plays in hardware, starts before it has loaded, and
 * seeks. CRF 20 under a 6 Mb/s ceiling: a calm plate is mostly smooth
 * gradients that H.264 keeps well, and the ceiling keeps a busy minute from
 * stalling a TV on ordinary Wi-Fi and the file under GitHub's 2 GiB a file.
 *
 * ## The judge
 *
 * Six lines, every bar a comparison within the one film. Frames are read
 * the way `npm run loopseam` reads them: every frame ffmpeg finds, shrunk to
 * 16x16 grey, and the step between two frames is their mean absolute
 * difference (0 to 255).
 *
 *   1. its length is the loop's, to a frame;
 *   2. it has no audio track (the owner asked for no sound, and a silent
 *      track is still a track a TV's player may route and duck for);
 *   3. the seam, the step from its last frame to its first, is at most 3
 *      times the film's median step across a keyframe. Not its median step
 *      overall, as loopseam's is: a calm plate moves so little a frame that
 *      the codec's own error is most of a step, and the last frame and the
 *      first are coded apart, as a frame and the keyframe after it are, while
 *      consecutive frames share their error and their step hides it. So the
 *      fair yardstick for the seam is a step that also crosses a keyframe.
 *      Measured 2026-11-15 on the controls below (CRF 20, as the loops are
 *      made): a crossfaded seam reads 2.2 keyframe steps, at 160x96 and at
 *      320x180 alike (the seam's own frames, checked at CRF 12, are the
 *      film's two consecutive frames, so the rest is the codec), and the same
 *      film cut plain reads 35 to 46. On a 1080p film the codec's error in a
 *      16x16 thumbnail is smaller still, each thumb pixel being the mean of a
 *      120x67 block;
 *   4. the joint where the crossfade ends and the film runs on alone is one
 *      step too: at most 3 times the median keyframe step. The fade's weight
 *      is eased and rounded (EASED_FADE), so its last frames are the film's
 *      own and the step into the film alone is the film's step; the straight
 *      ramp xfade truncates read 0.63 there against the film's 0.06 and
 *      failed Aurora Borealis. A seek apart there, or a fade that stops
 *      short, is a jump. Not
 *      "no step anywhere is large", as loopseam asks of a few seconds: tried
 *      on the Mac's first real loop (Chemical Clock, a minute, 2026-11-15)
 *      the largest step was already 7.9 keyframe steps, a wave front, and a
 *      half hour of liquid has a larger one somewhere that is no fault. The
 *      largest step is printed beside this line, for the eye;
 *   5. it keeps moving: the step between frames a minute apart (a sixth of
 *      the loop on a short one) is at least 3 times the median keyframe step
 *      everywhere in the film. A plate that settles into stillness for a
 *      minute fails, which is the thing a half hour of liquid is most likely
 *      to do and least likely to be seen doing in a short look at it;
 *   6. it keeps its light and its pattern: every minute's mean brightness
 *      and every minute's spread of brightness across the picture are at
 *      least half the film's median minute's. A look that drains to clear
 *      glass, or goes dark, or turns into one flat colour, in its last ten
 *      minutes fails. Half and not nine tenths: Evolve's palette turns and
 *      a calm look breathes between fuller and emptier over minutes, and
 *      neither is a fault.
 *
 * `--controls` shows the judge each thing on films it makes itself, through
 * the same `makeLoop` the Mac uses, small and short (2 s warm, a 36 s loop,
 * a 4 s seam): travelling waves at speeds that share no period, so like the
 * liquid the film never comes back to where it began. The crossfaded loop
 * passes all six; the same film cut plain fails the seam; its film seeked
 * a second late after the crossfade fails the joint; with a silent
 * audio track it fails the audio line; held still it fails the moving line;
 * faded to black, or to a flat grey of the same brightness, over its last
 * third it fails the light line; and a loop a second short fails the length
 * line. If any of those flips, the judge is blind to that thing.
 *
 * Needs ffmpeg ($FFMPEG, or on the path). Writes TVLOOPS_OUT (default
 * scratch/tvloops/): per loop `<id>.mp4` (the loop), `<id>-preview.mp4` (a
 * minute of the half hour at thirty times its speed, 960x540),
 * `<id>-clip.mp4` (fifteen seconds at its own speed), `<id>.jpg`, and
 * `tvloops.json` with every number.
 */
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { port } from './ports.mjs';
import {
  TV_LOOPS, TV_LOOP_SECONDS, TV_LOOP_WARM_S, TV_LOOP_SEAM_S, TV_LOOP_FPS, TV_LOOP_WIDTH, TV_LOOP_HEIGHT, TV_LOOP_RELEASE,
} from '../src/lib/tvLoops.ts';

const argv = process.argv.slice(2);
const opt = (name) => { const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`)); return a === undefined ? undefined : a.includes('=') ? a.slice(a.indexOf('=') + 1) : true; };
const CONTROLS = !!opt('controls');
const JUDGE = typeof opt('judge') === 'string' ? opt('judge') : null;
const ONLY = typeof opt('only') === 'string' ? opt('only').split(',') : null;
const UPLOAD = !!opt('upload');
const KEEP_RAW = !!opt('keep-raw');
const CLEAN = !!opt('clean');
const FROM_RAW = typeof opt('from-raw') === 'string' ? path.resolve(opt('from-raw')) : null;
const LOOP_S = Number(opt('seconds') ?? TV_LOOP_SECONDS);
const WARM_S = Number(opt('warm') ?? TV_LOOP_WARM_S);
const SEAM_S = Number(opt('seam') ?? TV_LOOP_SEAM_S);
const FPS = TV_LOOP_FPS;
const OUT = path.resolve(process.env.TVLOOPS_OUT ?? 'scratch/tvloops');
const PORT = port(4366, 'TVLOOPS_PORT');

const SEAM_OVER_KEY = 3;
const MOVES_OVER_KEY = 3;
const KEEP_SHARE = 0.5;
const THUMB = 16;

let failed = 0, passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? ' ok ' : ' FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

function findFfmpeg() {
  for (const t of [process.env.FFMPEG, 'ffmpeg'].filter(Boolean)) if (spawnSync(t, ['-version'], { stdio: 'ignore' }).status === 0) return t;
  return null;
}
const ffmpeg = findFfmpeg();
if (!ffmpeg) { check('ffmpeg is here to make and read the films', false, 'none on the path and $FFMPEG unset'); process.exit(1); }
const ff = (args, input) => {
  const r = spawnSync(ffmpeg, ['-v', 'error', '-y', ...args], { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.slice(0, 6).join(' ')}…: ${r.stderr.toString().slice(0, 400)}`);
  return r;
};

// ─── the loop, as an edit of the finished film ───────────────────────────────

/**
 * The H.264 a TV plays: High 4.1, 4:2:0, a keyframe every 2 s exactly (no
 * scene cuts, so the judge's keyframe steps are where it thinks), +faststart.
 */
const tvH264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-maxrate', '6M', '-bufsize', '12M',
  '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-g', String(2 * FPS), '-keyint_min', String(2 * FPS),
  '-sc_threshold', '0', '-movflags', '+faststart'];

/**
 * `raw` (WARM + L + SEAM seconds or more) to the loop `out`, L long: the
 * film from WARM, its first SEAM seconds crossfaded from the film's own
 * seconds after WARM + L. seam 0 is the plain cut, for the controls.
 */
/*
  The crossfade written out as xfade's custom expression, for two reasons
  found on the owner's Mac (2026-11-15), where Aurora Borealis's half hour
  failed the joint line at 3.8 times the fade's median step.

  The cause was half a grey level. xfade's frames are integers made from a
  sum of floats, and its own "fade" (and a custom expression left bare)
  truncates that sum, so every frame of the fade is on average half a level
  darker than the film it is made of, and the step out of the fade into the
  film alone is that half level coming back all at once. Read on Classic's
  5 s test fade against its raw film: the fade's last frames, the tail's
  weight there a ten-thousandth, sat 0.63 from the raw's same frames in a
  16x16 grey thumb, the frame after the fade 0.04, and the step between
  them 0.63 where the film steps 0.06. With +0.5, so the sum rounds, the
  fade's last frames sit 0.03 from the raw and the joint's step is 0.05.

  And the weight is eased (smoothstep, 3P² − 2P³ of the tail at progress P,
  which xfade runs from 1 at the loop's first frame to 0), whose slope is
  nothing at both ends, so the fade leaves the tail at the seam and joins
  the film at its end without the straight ramp's corner.
*/
const EASED_FADE = "transition=custom:expr='st(0,P*P*(3-2*P));A*ld(0)+B*(1-ld(0))+0.5'";

function makeLoop(raw, out, { warm, loop, seam, audio = false, threads = 0, skew = 0 }) {
  const t = (s) => s.toFixed(6);
  const n = (s) => Math.round(s * FPS);
  // Each piece cut to its count of frames and numbered afresh (setpts=N/fps),
  // never left to its timestamps: on the controls, concat and an fps filter
  // read a rounding gap at a joint as a missing frame and doubled one.
  const piece = (i, frames, name) => `[${i}:v]trim=end_frame=${frames},setpts=N/${FPS}/TB,fps=${FPS},settb=1/${FPS}[${name}]`;
  /*
    ffmpeg's own crossfade, xfade, over the film's tail (input 0) and the film
    from WARM (input 1): the tail whole at the loop's first frame, the film
    whole from frame SEAM·fps on, an eased ramp between (EASED_FADE). Not blend with a
    weight written by hand: on the owner's Mac (Classic, 2026-11-15) blend
    weighted by T/seam left the fade's last frames still carrying the tail
    and the step out of the fade read 4 to 10 keyframe steps on four of the
    first six loops, and weighted by N it put the fade's frames out of order
    (frame 148 the film's whole, 149 a mix again), both read losslessly
    against the raw film's own frames. xfade's frames, read the same way, are
    the tail's at frame 0 and the film's exactly from frame 150 of a 5 s fade,
    in order. The film from WARM is one input, so the fade's end and the film
    after it cannot be seeked apart. `skew` (the controls only) builds it from
    two pieces seeked apart, the fault the joint line is there to see.
  */
  const inputs = ['-ss', t(warm + loop), '-t', t(seam), '-i', raw];
  let graph;
  if (seam <= 0) {
    inputs.splice(0, inputs.length, '-ss', t(warm), '-t', t(loop), '-i', raw);
    graph = `${piece(0, n(loop), 'c')};[c]format=yuv420p[v]`;
  } else if (skew) {
    inputs.push('-ss', t(warm), '-t', t(seam), '-i', raw, '-ss', t(warm + seam + skew), '-t', t(loop - seam), '-i', raw);
    graph = `${piece(0, n(seam), 'a')};${piece(1, n(seam), 'b')};${piece(2, n(loop - seam), 'c')};[b][c]concat=n=2:v=1:a=0,setpts=N/${FPS}/TB,settb=1/${FPS}[h];` +
      `[a][h]xfade=${EASED_FADE}:duration=${seam}:offset=0,format=yuv420p[v]`;
  } else {
    inputs.push('-ss', t(warm), '-t', t(loop), '-i', raw);
    graph = `${piece(0, n(seam), 'a')};${piece(1, n(loop), 'h')};[a][h]xfade=${EASED_FADE}:duration=${seam}:offset=0,format=yuv420p[v]`;
  }
  const inputCount = inputs.filter((x) => x === '-i').length;
  const a = audio ? ['-f', 'lavfi', '-t', t(loop), '-i', 'anullsrc=r=48000:cl=stereo'] : [];
  const maps = audio ? ['-map', '[v]', '-map', `${inputCount}:a`, '-c:a', 'aac'] : ['-map', '[v]', '-an'];
  ff([...inputs, ...a, '-filter_complex', graph, ...maps, ...tvH264, ...(threads ? ['-threads', String(threads)] : []), '-r', String(FPS), '-frames:v', String(n(loop)), out]);
}

// ─── the judge ───────────────────────────────────────────────────────────────

const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN; };
const meanOf = (f) => { let s = 0; for (const v of f) s += v; return s / f.length; };
const spreadOf = (f) => { const m = meanOf(f); let s = 0; for (const v of f) s += (v - m) ** 2; return Math.sqrt(s / f.length); };

/** Every frame ffmpeg finds in the file, as stored, 16x16 grey. */
function frames(file) {
  const r = ff(['-i', file, '-fps_mode', 'passthrough', '-vf', `scale=${THUMB}:${THUMB}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
  const n = THUMB * THUMB, out = [];
  for (let i = 0; i + n <= r.stdout.length; i += n) out.push(r.stdout.subarray(i, i + n));
  return out;
}
/** The frame numbers of the keyframes, from ffmpeg's showinfo over the keyframes alone. */
function keyframes(file) {
  const r = spawnSync(ffmpeg, ['-v', 'info', '-skip_frame', 'nokey', '-i', file, '-vf', 'showinfo', '-f', 'null', '-'], { maxBuffer: 1 << 28 });
  const times = [...r.stderr.toString().matchAll(/pts_time:\s*([-\d.]+)/g)].map((m) => Number(m[1]));
  const t0 = times.length ? Math.min(...times) : 0;
  return times.map((t) => Math.round((t - t0) * FPS));
}
/** Length and track kinds, from ffmpeg's own reading of the container. */
function facts(file) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(r.stderr);
  return {
    seconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : NaN,
    audio: (r.stderr.match(/Stream #\d+:\d+[^:]*: Audio:/g) ?? []).length,
  };
}

function judge(file, loopSeconds, seamSeconds) {
  const f = facts(file);
  const fr = frames(file);
  const steps = [];
  for (let i = 1; i < fr.length; i++) steps.push(dist(fr[i - 1], fr[i]));
  const keys = keyframes(file).filter((k) => k > 0 && k < fr.length);
  const keySteps = keys.map((k) => steps[k - 1]);
  const keyMed = median(keySteps);
  const seam = dist(fr[fr.length - 1], fr[0]);
  const largest = Math.max(...steps);
  // The step into the first frame the film plays alone, after the crossfade.
  const fadeFrames = Math.round(seamSeconds * FPS);
  const joint = seamSeconds > 0 ? steps[fadeFrames - 1] : null;
  const window = Math.round(Math.min(60, loopSeconds / 6) * FPS);
  const travels = [];
  for (let i = 0; i + window < fr.length; i += window) travels.push(dist(fr[i], fr[i + window]));
  // Each window's light and pattern: the mean over its frames of each frame's mean and spread.
  const light = [], pattern = [];
  for (let i = 0; i + window <= fr.length; i += window) {
    let m = 0, s = 0, n = 0;
    for (let j = i; j < i + window; j += Math.max(1, window >> 4)) { m += meanOf(fr[j]); s += spreadOf(fr[j]); n++; }
    light.push(m / n); pattern.push(s / n);
  }
  return {
    file: path.basename(file), seconds: f.seconds, audio: f.audio, frames: fr.length,
    medianStep: median(steps), keyMedian: keyMed, keyframes: keys.length + 1, seam, joint, largest,
    minTravel: Math.min(...travels), medianTravel: median(travels), windowSeconds: window / FPS,
    minLight: Math.min(...light), medianLight: median(light), minPattern: Math.min(...pattern), medianPattern: median(pattern),
  };
}
const lines = (j, loopSeconds) => ({
  length: Math.abs(j.seconds - loopSeconds) <= 1 / FPS + 1e-3,
  audio: j.audio === 0,
  seam: j.seam <= SEAM_OVER_KEY * j.keyMedian,
  joint: j.joint === null || j.joint <= SEAM_OVER_KEY * j.keyMedian,
  // Strictly more: a picture the codec holds perfectly still has a travel and a keyframe step of 0.
  moves: j.minTravel > MOVES_OVER_KEY * j.keyMedian,
  light: j.minLight >= KEEP_SHARE * j.medianLight && j.minPattern >= KEEP_SHARE * j.medianPattern,
});
function report(name, j, loopSeconds) {
  const l = lines(j, loopSeconds);
  const r = (x, y) => (y > 0 ? (x / y).toFixed(1) : '∞');
  check(`${name}: ${loopSeconds} s long, to a frame`, l.length, `${j.seconds.toFixed(3)} s, ${j.frames} frames`);
  check(`${name}: no audio track`, l.audio, `${j.audio} audio track(s)`);
  check(`${name}: the seam is one step across a keyframe, not a cut`, l.seam, `last to first ${j.seam.toFixed(2)}, ${r(j.seam, j.keyMedian)}x the median keyframe step ${j.keyMedian.toFixed(2)} (at most ${SEAM_OVER_KEY}x; median step ${j.medianStep.toFixed(2)})`);
  check(`${name}: the crossfade's end is one step too`, l.joint, j.joint === null ? 'no crossfade' : `${j.joint.toFixed(2)}, ${r(j.joint, j.keyMedian)}x the median keyframe step (at most ${SEAM_OVER_KEY}x); the largest step anywhere ${j.largest.toFixed(2)}, ${r(j.largest, j.keyMedian)}x, for the eye`);
  check(`${name}: it keeps moving, every ${j.windowSeconds} s`, l.moves, `least travel ${j.minTravel.toFixed(2)}, ${r(j.minTravel, j.keyMedian)}x the keyframe step (at least ${MOVES_OVER_KEY}x; median ${j.medianTravel.toFixed(2)})`);
  check(`${name}: it keeps its light and its pattern`, l.light, `least light ${j.minLight.toFixed(1)} of median ${j.medianLight.toFixed(1)}, least spread ${j.minPattern.toFixed(1)} of median ${j.medianPattern.toFixed(1)} (at least ${KEEP_SHARE} of each)`);
  return l;
}

// ─── the controls ────────────────────────────────────────────────────────────

/** Travelling waves at speeds with no common period, 160x96 grey, with `shade(t)` laid over (a fade, a flattening). */
function wavesFilm(seconds, shade = () => ({ gain: 1, flat: 0 }), still = false) {
  const W = 160, H = 96, out = [];
  for (let f = 0; f < Math.round(seconds * FPS); f++) {
    const t = still ? 0 : f / FPS, { gain, flat } = shade(f / FPS), px = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = 128 + 45 * Math.sin(0.21 * x + 0.13 * y + 0.55 * t)
        + 35 * Math.sin(0.17 * x - 0.19 * y - 0.37 * Math.SQRT2 * t + 1)
        + 25 * Math.sin(0.09 * x + 0.27 * y + (Math.PI / 12) * t + 2);
      px[y * W + x] = Math.max(0, Math.min(255, Math.round(gain * ((1 - flat) * v + flat * 128))));
    }
    out.push(px);
  }
  return { W, H, out };
}
function encodeRaw(film, file) {
  ff(['-f', 'rawvideo', '-pix_fmt', 'gray', '-s', `${film.W}x${film.H}`, '-r', String(FPS), '-i', '-', '-c:v', 'libx264', '-threads', '1',
    '-pix_fmt', 'yuv420p', '-crf', '12', '-g', String(FPS), file], Buffer.concat(film.out.map((f) => Buffer.from(f.buffer, f.byteOffset, f.byteLength))));
}

function controls() {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'tvloops-'));
  if (!process.env.TVLOOPS_KEEP) process.on("exit", () => fs.rmSync(work, { recursive: true, force: true })); else console.log(work);
  const warm = 2, loop = 36, seam = 4, all = warm + loop + seam;
  const make = (name, film, o = {}) => {
    const raw = path.join(work, `${name}-raw.mp4`), out = path.join(work, `${name}.mp4`);
    encodeRaw(film, raw);
    makeLoop(raw, out, { warm, loop: o.loop ?? loop, seam: o.seam ?? seam, audio: !!o.audio, threads: 1, skew: o.skew ?? 0 });
    return judge(out, loop, o.seam ?? seam);
  };
  const third = (t) => Math.min(1, Math.max(0, (t - warm - (2 * loop) / 3) / (loop / 6)));
  const cases = [
    ['the crossfaded loop', make('good', wavesFilm(all)), { length: true, audio: true, seam: true, joint: true, moves: true, light: true }],
    ['its film seeked a second late after the crossfade', make('skew', wavesFilm(all + 1), { skew: 1 }), { joint: false }],
    ['the same film cut plain', make('cut', wavesFilm(all), { seam: 0 }), { seam: false }],
    ['with a silent audio track', make('audio', wavesFilm(all), { audio: true }), { audio: false }],
    ['a loop a second short', make('short', wavesFilm(all), { loop: loop - 1 }), { length: false }],
    ['the picture held still', make('still', wavesFilm(all, undefined, true)), { moves: false }],
    ['faded to black over its last third', make('dark', wavesFilm(all, (t) => ({ gain: 1 - 0.85 * third(t), flat: 0 }))), { light: false }],
    ['gone to a flat grey over its last third', make('flat', wavesFilm(all, (t) => ({ gain: 1, flat: 0.85 * third(t) }))), { light: false }],
  ];
  console.log('tvloops: the judge on films it makes itself, through the Mac\'s own makeLoop');
  for (const [name, j, want] of cases) {
    const l = lines(j, loop);
    for (const [k, v] of Object.entries(want)) {
      const got = l[k];
      check(`${name}: the ${k} line ${v ? 'passes' : 'fails'}`, got === v,
        `seam ${j.seam.toFixed(2)}, keyframe step ${j.keyMedian.toFixed(2)}, joint ${j.joint?.toFixed(2) ?? 'none'}, least travel ${j.minTravel.toFixed(2)}, light ${j.minLight.toFixed(0)}/${j.medianLight.toFixed(0)}, spread ${j.minPattern.toFixed(1)}/${j.medianPattern.toFixed(1)}, ${j.seconds.toFixed(3)} s, ${j.audio} audio`);
    }
  }
}

// ─── making them (a Mac) ─────────────────────────────────────────────────────

/** A WAV of silence, 8 kHz mono 16-bit: the render resamples it, and it hears nothing. */
function silenceWav(seconds) {
  const rate = 8000, n = Math.ceil(seconds * rate), b = Buffer.alloc(44 + 2 * n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + 2 * n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(2 * n, 40);
  return b;
}

async function makeAll() {
  const { chromium } = await import('playwright');
  const { launchChromium } = await import('./chromium.mjs');
  const { AUTOPLAY, untilRunning } = await import('./recorder.mjs');
  const { isGpuEngine } = await import('./frame.mjs');
  const loops = TV_LOOPS.filter((l) => !ONLY || ONLY.includes(l.id));
  if (!loops.length) throw new Error(`no loop called ${ONLY}`);
  fs.mkdirSync(OUT, { recursive: true });
  let browser = null;
  if (!FROM_RAW) {
    const DIST = path.join(OUT, 'dist');
    // No sign-in in the build: a Mac with the owner's Firebase settings in .env
    // would otherwise ask for one (see scripts/sitefilms.mjs).
    console.log('tvloops: building the site with no sign-in…');
    execFileSync('npx', ['vite', 'build', '--outDir', DIST, '--emptyOutDir'], {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '', VITE_FIREBASE_HOSTED_SITE: '' },
    });
    const server = spawn('./node_modules/.bin/vite', ['preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
    const stop = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { /* gone */ } };
    process.on('exit', stop);
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(130); });
    await new Promise((r) => setTimeout(r, 2500));
    browser = await launchChromium(chromium, { args: [AUTOPLAY] });
  }
  const filmSeconds = WARM_S + LOOP_S + SEAM_S;
  const silence = silenceWav(filmSeconds + 1);
  const manifestPath = path.join(OUT, 'tvloops.json');
  const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};

  for (const loop of loops) {
    const raw = FROM_RAW ?? path.join(OUT, `${loop.id}-raw.mp4`), out = path.join(OUT, `${loop.id}.mp4`);
    // Room for the render (about 1.4 GB) and the loop (up to 1.4 GB) beside
    // it: a disk that fills halfway through a render loses the half hour.
    const free = (() => { try { const f = fs.statfsSync(OUT); return f.bavail * f.bsize; } catch { return Infinity; } })();
    if (free < 4e9) throw new Error(`${loop.id}: ${(free / 1e9).toFixed(1)} GB free here, and a loop needs about 3 GB while it is made; stopping`);
    let renderMin = 0;
    if (FROM_RAW) {
      if (loops.length !== 1) throw new Error('--from-raw cuts one loop: name it with --only');
    } else {
      const t0 = Date.now();
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      page.on('pageerror', (e) => console.log('  [pageerror]', e.message.slice(0, 200)));
      // The save picker, stood in for: each positioned write lands in `raw`.
      let fd = null, written = 0, closed = false;
      await page.exposeFunction('__tvloopOpen', () => { fd = fs.openSync(raw, 'w'); written = 0; });
      await page.exposeFunction('__tvloopWrite', (position, b64) => { const b = Buffer.from(b64, 'base64'); fs.writeSync(fd, b, 0, b.length, position); written += b.length; });
      await page.exposeFunction('__tvloopClose', () => { fs.closeSync(fd); closed = true; });
      await page.exposeFunction('__tvloopAbort', () => { if (fd !== null && !closed) { fs.closeSync(fd); closed = true; } });
      await page.addInitScript(() => {
        const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
        window.showSaveFilePicker = async (o) => {
          await window.__tvloopOpen();
          return {
            name: o?.suggestedName ?? 'film.mp4',
            remove: async () => window.__tvloopAbort(),
            createWritable: async () => ({
              write: async (p) => {
                const d = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data.buffer ?? p.data, p.data.byteOffset ?? 0, p.data.byteLength);
                await window.__tvloopWrite(p.position, b64(d));
              },
              close: async () => window.__tvloopClose(),
              abort: async () => window.__tvloopAbort(),
            }),
          };
        };
      });
      await page.route('**/__tvloops/silence.wav', (r) => r.fulfill({ status: 200, contentType: 'audio/wav', body: silence }));
      await page.goto(`http://localhost:${PORT}/?debug&gpu=strong&tier=local&look=${loop.look}&seed=${loop.seed}`, { waitUntil: 'load' });
      let engine = null;
      for (let i = 0; i < 60 && !isGpuEngine(engine); i++) {
        await page.waitForTimeout(1000);
        engine = await page.evaluate(() => window.chromaglassDebug?.().engine ?? null);
      }
      if (!isGpuEngine(engine)) throw new Error(`${loop.id}: the GPU solver never came up (${engine ?? 'no debug hook'}); this needs a Mac`);
      const up = await untilRunning(page);
      if (!up.ok) throw new Error(`${loop.id}: the show's loop never ran steadily`);
      // Evolve on, as the desk's Evolve button: the look's slow moves over the half hour.
      const evolving = await page.evaluate(async () => {
        const on = () => !!window.chromaglassCastState?.().isAutomated;
        if (!on()) window.chromaglassAction?.('automate-toggle');
        for (let i = 0; i < 20 && !on(); i++) await new Promise((r) => setTimeout(r, 100));
        return on();
      });
      if (!evolving) throw new Error(`${loop.id}: Evolve would not switch on`);
      // A few of the plate's dials, for the log: which look is on and how fast it runs.
      const dials = await page.evaluate(() => { const s = window.chromaglassCastState?.().settings ?? {}; return ['globalSpeed', 'turbulenceScale', 'bzReaction', 'automateRate'].map((k) => `${k} ${s[k]}`).join(', '); });
      console.log(`  ${loop.id}: ${dials}`);
      console.log(`tvloops: ${loop.id}: rendering ${filmSeconds} s of ${loop.look} at ${TV_LOOP_WIDTH}x${TV_LOOP_HEIGHT}, ${FPS} fps, seed ${loop.seed}, Evolve on…`);
      const tick = setInterval(() => console.log(`  ${loop.id}: ${(written / 1e6).toFixed(0)} MB written, ${((Date.now() - t0) / 60000).toFixed(1)} min`), 60000);
      const r = await page.evaluate(async ({ w, h, fps, seed }) => {
        const song = await (await fetch('/__tvloops/silence.wav')).arrayBuffer();
        const x = await window.chromaglassRender({ song, width: w, height: h, fps, seed, toDisk: true, hashFrames: false });
        return { phase: x.phase, message: x.message, format: x.format };
      }, { w: TV_LOOP_WIDTH, h: TV_LOOP_HEIGHT, fps: FPS, seed: loop.seed });
      clearInterval(tick);
      await page.close();
      renderMin = (Date.now() - t0) / 60000;
      if (r.phase !== 'done' || !closed) throw new Error(`${loop.id}: the render ended ${r.phase}: ${r.message}`);
      console.log(`  ${loop.id}: ${r.format}; ${(written / 1e6).toFixed(0)} MB in ${renderMin.toFixed(1)} min`);
    }

    const t1 = Date.now();
    makeLoop(raw, out, { warm: WARM_S, loop: LOOP_S, seam: SEAM_S });
    const loopMin = (Date.now() - t1) / 60000;
    const j = judge(out, LOOP_S, SEAM_S);
    const l = report(loop.id, j, LOOP_S);
    // The render is the half hour's cost and the cut is minutes, so a loop the
    // judge fails keeps its render (cut again with --from-raw once the cut is
    // fixed); on 2026-11-15 four renders were lost to a cut's fault this way.
    if (!KEEP_RAW && !FROM_RAW && Object.values(l).every(Boolean)) fs.rmSync(raw);
    else if (!FROM_RAW) console.log(`  ${loop.id}: the render is kept at ${raw}`);
    // Previews for the judging page: the half hour in a minute, fifteen seconds as it plays, a still.
    const step = Math.max(1, Math.round(LOOP_S / 60));
    ff(['-i', out, '-vf', `select='not(mod(n\\,${step * FPS}))',setpts=N/${FPS}/TB,scale=960:540:flags=lanczos`, '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${loop.id}-preview.mp4`)]);
    ff(['-ss', String(Math.min(600, LOOP_S / 3)), '-t', '15', '-i', out, '-vf', 'scale=960:540:flags=lanczos', '-an', '-c:v', 'libx264', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, `${loop.id}-clip.mp4`)]);
    ff(['-ss', String(Math.min(300, LOOP_S / 2)), '-i', out, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', path.join(OUT, `${loop.id}.jpg`)]);
    const bytes = fs.statSync(out).size;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
    manifest[loop.id] = { ...loop, bytes, sha256, renderMinutes: +renderMin.toFixed(1), loopMinutes: +loopMin.toFixed(1), judge: j, ok: Object.values(l).every(Boolean), uploaded: false };
    console.log(`  ${loop.id}: ${(bytes / 1e6).toFixed(0)} MB, loop made in ${loopMin.toFixed(1)} min`);
    if (UPLOAD && manifest[loop.id].ok && LOOP_S === TV_LOOP_SECONDS) {
      if (spawnSync('gh', ['release', 'view', TV_LOOP_RELEASE], { stdio: 'ignore' }).status !== 0) {
        execFileSync('gh', ['release', 'create', TV_LOOP_RELEASE, '--prerelease', '--title', 'TV loops 1',
          '--notes', 'The TV apps\' calm loops (PLAN 12-tv-loops, src/lib/tvLoops.ts): half-hour silent films of the app\'s own renders, served as https://chromaglass.art/loops/<id>.mp4. A pre-release, never latest: the Mac app\'s updater reads releases/latest.'], { stdio: 'inherit' });
      }
      for (let tries = 1; ; tries++) {
        try { execFileSync('gh', ['release', 'upload', TV_LOOP_RELEASE, out, '--clobber'], { stdio: 'inherit' }); break; } catch (e) {
          if (tries >= 4) throw e;
          console.log(`  ${loop.id}: upload failed (${e.message.slice(0, 120)}); again in ${30 * tries} s`);
          await new Promise((r) => setTimeout(r, 30000 * tries));
        }
      }
      manifest[loop.id].uploaded = true;
      console.log(`  ${loop.id}: uploaded to ${TV_LOOP_RELEASE}`);
      if (CLEAN) fs.rmSync(out);
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
  await browser?.close();
}

if (CONTROLS) controls();
else if (JUDGE) report(path.basename(JUDGE), judge(JUDGE, LOOP_S, SEAM_S), LOOP_S);
else await makeAll();
console.log(`\ntvloops: ${passed} ok, ${failed} failed`);
process.exit(failed ? 1 : 0);
