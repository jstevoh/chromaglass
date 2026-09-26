#!/usr/bin/env node
/**
 * Watch a video: a file or a URL, turned into pictures and numbers Claude can read.
 *
 *   npm run watch -- <file or URL> [--out DIR] [--frames 24] [--from S] [--to S]
 *                                  [--at 3.5,12] [--rate 10] [--per-sheet 12]
 *   npm run watch -- --selftest
 *
 * Asked for: "a skill or agent that is able to better watch video … it will make
 * the evaluation of both the app better and looking at examples online". Claude
 * reads images, not video. Handed a clip, the usual move was one or two stills
 * pulled by hand, which throws away the three things a liquid light show is made
 * of: how it moves, how that motion changes over the piece, and whether it moves
 * with the music. So this makes four things from one clip, each aimed at one of
 * those, and every one of them works the same on a YouTube reference, a phone
 * recording of a real show, and a take from the app's own Record button:
 *
 *   sheet-N.png    contact sheets: frames at even intervals plus every hard cut,
 *                  each stamped with its time, laid out so a sheet stays inside
 *                  the 1568 px Claude sees an image at without downscaling it.
 *   timeline.png   a slit scan (the centre column of every sampled frame, side by
 *                  side, so time runs left to right and anything crossing the
 *                  middle leaves a streak whose slope is its speed), and under it
 *                  a motion strip, a loudness strip and red lines at the cuts.
 *                  One picture of how the whole clip moves, which no number of
 *                  stills gives.
 *   stats.tsv      per sampled frame: brightness, how much of the frame is near
 *                  black, saturation, motion (mean change from the frame before)
 *                  and loudness. The printed summary buckets it into at most
 *                  forty rows and names the dominant hues.
 *   still-*.png    full-resolution frames at the times given with --at, for the
 *                  close look after the sheets say where to look.
 *
 * Plus a number for "does it move with the music": the correlation of motion
 * with loudness, and the lag at which it peaks. It is a measurement, not a
 * verdict: a slow pour under a steady drone can be right and score zero.
 *
 * Why two decodes and not seeks. The app records with MediaRecorder, and
 * Chrome's WebM from MediaRecorder has no duration and no cues, so `-ss` into
 * it is slow and inexact and the length is unknown until the file has been
 * read. So the first pass reads the whole clip once at the sampling rate
 * (which also gives the length), and the second pass reads it again keeping
 * only the chosen frame numbers, at tile size. No step depends on seeking.
 *
 * Why the sizes come from ffmpeg's own output line. A phone video is stored
 * sideways with a rotation flag, and ffmpeg turns it upright on decode; the
 * size in the input header is the sideways one. Raw frames are split by byte
 * count, so a wrong size is a garbled picture, not an error. The size is read
 * from the line ffmpeg prints for the stream it is actually writing.
 *
 * YouTube from a cloud session. The page and the formats list come through,
 * but YouTube answers the video itself with "Sign in to confirm you're not a
 * bot" (or a 403) for a datacenter address. That is YouTube, not the
 * environment's network setting. The skill (.claude/skills/watch/SKILL.md)
 * lists the ways round it: run this on the owner's Mac, or drop the file in
 * the thread, or use a mirror (archive.org keeps many).
 *
 * Needs ffmpeg (and yt-dlp for a URL). `brew install ffmpeg yt-dlp` on a Mac;
 * in a cloud session `python3 -m pip install yt-dlp imageio-ffmpeg`, which
 * brings a static ffmpeg this finds on its own.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// ─── arguments ───────────────────────────────────────────────────────────────

const DEFAULTS = { frames: 24, perSheet: 12, rate: 0, from: 0, to: 0, at: [], out: '', input: '', selftest: false, quiet: false, crop: null };
const opt = { ...DEFAULTS };

/** A failure the caller can report: a harness catches it, the command line prints it and exits with `code`. */
class WatchError extends Error { constructor(message, code = 1) { super(message); this.code = code; } }
const fail = (message, code) => { throw new WatchError(message, code); };

function parseArgs(argv) {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--out') opt.out = v();
    else if (a === '--frames') opt.frames = Math.max(1, Math.min(60, Number(v()) || 24));
    else if (a === '--per-sheet') opt.perSheet = Math.max(1, Math.min(30, Number(v()) || 12));
    else if (a === '--rate') opt.rate = Number(v()) || 0;
    else if (a === '--from') opt.from = Number(v()) || 0;
    else if (a === '--to') opt.to = Number(v()) || 0;
    else if (a === '--at') opt.at = v().split(',').map(Number).filter(Number.isFinite);
    else if (a === '--selftest') opt.selftest = true;
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0); }
    else if (!opt.input) opt.input = a;
    else fail(`unexpected argument ${a}`, 2);
  }
}

function printHelp() {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(2, 7).map(l => l.replace(/^ \* ?/, '')).join('\n'));
}

// ─── tools ───────────────────────────────────────────────────────────────────

/** ffmpeg: $FFMPEG, then PATH, then the static build imageio-ffmpeg ships. */
function findFfmpeg() {
  const tries = [process.env.FFMPEG, 'ffmpeg'].filter(Boolean);
  for (const t of tries) if (spawnSync(t, ['-version'], { stdio: 'ignore' }).status === 0) return t;
  const py = spawnSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' });
  if (py.status === 0 && py.stdout.trim()) return py.stdout.trim();
  return null;
}

function findYtDlp() {
  if (spawnSync('yt-dlp', ['--version'], { stdio: 'ignore' }).status === 0) return ['yt-dlp'];
  if (spawnSync('python3', ['-m', 'yt_dlp', '--version'], { stdio: 'ignore' }).status === 0) return ['python3', '-m', 'yt_dlp'];
  return null;
}

const INSTALL = 'Install: `brew install ffmpeg yt-dlp` on a Mac; in a cloud session `python3 -m pip install yt-dlp imageio-ffmpeg`.';

let FF_ = null;
const ff = () => (FF_ ??= findFfmpeg() ?? fail(`no ffmpeg found. ${INSTALL}`, 2));

// ─── fetching a URL ──────────────────────────────────────────────────────────

/**
 * Everything goes through yt-dlp, a direct .mp4 link included: its generic
 * extractor handles plain files, and unlike Node's fetch it honours the
 * HTTPS_PROXY a cloud session's egress goes through.
 */
function download(url, dir) {
  const y = findYtDlp();
  if (!y) fail(`a URL needs yt-dlp. ${INSTALL}`, 2);
  const help = spawnSync(y[0], [...y.slice(1), '--help'], { encoding: 'utf8' }).stdout ?? '';
  const args = [
    ...y.slice(1), '--no-playlist', '--write-info-json', '--no-progress',
    // Up to 1080 on the short side: `res` sorts by the smaller dimension, so a
    // vertical Short gets 1080×1920 and not the 608×1080 a height cap picks.
    '-f', 'bv*+ba/b', '-S', 'res:1080', '--merge-output-format', 'mkv',
    '--ffmpeg-location', ff(), '-o', path.join(dir, 'source.%(ext)s'),
  ];
  // Recent yt-dlp needs a JavaScript runtime for YouTube; node is always here.
  if (help.includes('--js-runtimes')) args.push('--js-runtimes', 'node');
  args.push(url);
  console.log(`fetching ${url}`);
  const r = spawnSync(y[0], args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15 * 60_000 });
  const files = fs.readdirSync(dir).filter(f => f.startsWith('source.') && !/\.(json|part|ytdl)$/.test(f));
  if (r.status !== 0 || !files.length) {
    const err = (r.stderr || '').trim().split('\n').filter(l => /ERROR/.test(l)).join('\n') || (r.stderr || '').slice(-600);
    if (/not a bot|Sign in to confirm|HTTP Error 403/.test(err)) {
      const thumbs = youtubeThumbs(url, dir);
      fail([
        err,
        '',
        ...(thumbs.length ? [
          `The four stills YouTube serves to anyone came through instead (not the video: a cover`,
          `frame and three frames from about a quarter, half and three quarters in):`,
          ...thumbs.map(f => `  ${f}`),
          '',
        ] : []),
        'watch: YouTube refused the video to this machine. It does that to cloud',
        'addresses; it is not the environment\'s network setting. Ways round it:',
        '  1. run this on the owner\'s Mac (Remote Control), where it works as is;',
        '  2. ask for the file: a screen recording or a download dropped in the thread;',
        '  3. look for a mirror (archive.org keeps many YouTube uploads).',
      ].join('\n'));
    }
    fail(err);
  }
  const file = path.join(dir, files[0]);
  return { file, info: readInfo(file) };
}

/**
 * YouTube's thumbnails for a video id: `maxresdefault` (the cover, 1280×720
 * when there is one) and `hq1`–`hq3`, frames YouTube picked from about 25%,
 * 50% and 75% of the way in. They come from i.ytimg.com, which does not ask
 * a cloud address to prove it is not a bot, so they arrive when the video
 * itself is refused. Four frames are not a watch, but they are the look.
 * Through curl, not fetch: curl honours the HTTPS_PROXY a cloud session's
 * traffic goes through, and Node's fetch does not.
 */
function youtubeThumbs(url, dir) {
  const id = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(url)?.[1];
  if (!id) return [];
  const got = [];
  for (const name of ['maxresdefault', 'hq1', 'hq2', 'hq3']) {
    const f = path.join(dir, `youtube-${id}-${name}.jpg`);
    const r = spawnSync('curl', ['-sSfL', '-o', f, `https://i.ytimg.com/vi/${id}/${name}.jpg`], { timeout: 30_000 });
    if (r.status === 0 && fs.existsSync(f) && fs.statSync(f).size > 2000) got.push(f);
    else fs.rmSync(f, { force: true });
  }
  return got;
}

/** A file fetched earlier keeps its page's description beside it. */
function readInfo(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file.replace(/\.[^.\/]+$/, '.info.json'), 'utf8'));
    return { title: j.title, uploader: j.uploader ?? j.channel, url: j.webpage_url, duration: j.duration,
      description: (j.description ?? '').replace(/\s+/g, ' ').slice(0, 400) };
  } catch { return null; }
}

// ─── probing and decoding ────────────────────────────────────────────────────

function probe(file) {
  const r = spawnSync(ff(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const s = r.stderr ?? '';
  const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  const fps = /Video:.*?(\d+(?:\.\d+)?) fps/.exec(s) ?? /Video:.*?(\d+(?:\.\d+)?) tbr/.exec(s);
  const size = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(s);
  if (!size) fail(`no video stream in ${file}\n${s.slice(-400)}`);
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : null,
    fps: fps ? +fps[1] : null,
    stored: `${size[1]}x${size[2]}`,
    audio: /Stream #.*Audio:/.test(s),
    raw: s,
  };
}

function seekArgs() {
  const a = [];
  if (opt.from > 0) a.push('-ss', String(opt.from));
  a.push('-i', opt.file);
  if (opt.to > opt.from) a.push('-t', String(opt.to - opt.from));
  return a;
}

/**
 * Run ffmpeg writing raw RGB frames to stdout, and call onFrame for each.
 * The frame size is read from ffmpeg's "Output #0 … rawvideo … WxH" line (see
 * the header for why), and stdout is held until that line has been seen.
 */
function decode(vf, onFrame) {
  return new Promise((resolve, reject) => {
    const p = spawn(ff(), ['-hide_banner', '-nostats', ...seekArgs(), '-an', '-vf', vf,
      '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
    let err = '', w = 0, h = 0, pending = [], buf = Buffer.alloc(0), n = 0;
    const feed = chunk => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      const size = w * h * 3;
      while (buf.length >= size) { onFrame(buf.subarray(0, size), n++, w, h); buf = buf.subarray(size); }
    };
    p.stderr.on('data', d => {
      err += d;
      if (!w) {
        const m = /Output #0[\s\S]*?Video: rawvideo[^\n]*?(\d{2,5})x(\d{2,5})/.exec(err);
        if (m) { w = +m[1]; h = +m[2]; for (const c of pending) feed(c); pending = []; }
      }
    });
    p.stdout.on('data', d => (w ? feed(d) : pending.push(d)));
    p.on('close', code => (code === 0 ? resolve({ n, w, h }) : reject(new Error(`ffmpeg exited ${code}\n${err.slice(-800)}`))));
  });
}

/** Mono 8 kHz samples, for loudness. */
function decodeAudio() {
  return new Promise((resolve, reject) => {
    const p = spawn(ff(), ['-hide_banner', '-nostats', '-loglevel', 'error', ...seekArgs(), '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1']);
    const chunks = []; let err = '';
    p.stdout.on('data', d => chunks.push(d));
    p.stderr.on('data', d => (err += d));
    p.on('close', code => {
      if (code !== 0) return reject(new Error(err));
      const b = Buffer.concat(chunks);
      resolve(new Int16Array(b.buffer, b.byteOffset, b.length >> 1));
    });
  });
}

// ─── pictures without a library: a PNG writer and a 5×7 font ────────────────

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = b => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

const GLYPHS = {
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12], ':': [0, 12, 12, 0, 12, 12, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  '-': [0, 0, 0, 31, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3], '/': [0, 1, 2, 4, 8, 16, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
};
/** White text on a black box, `s` pixels per font pixel. */
function label(img, W, H, x0, y0, text, s = 2, color = [255, 255, 255]) {
  text = String(text).toUpperCase();
  const bw = text.length * 6 * s + 2 * s, bh = 9 * s;
  for (let y = y0; y < Math.min(H, y0 + bh); y++) for (let x = x0; x < Math.min(W, x0 + bw); x++) img.fill(0, (y * W + x) * 3, (y * W + x) * 3 + 3);
  [...text].forEach((ch, i) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c))
      for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
        const x = x0 + s + (i * 6 + c) * s + dx, y = y0 + s + r * s + dy;
        if (x < W && y < H) img.set(color, (y * W + x) * 3);
      }
  });
}

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

// ─── the watch ───────────────────────────────────────────────────────────────

async function watch() {
  const out = path.resolve(opt.out || path.join(os.tmpdir(), 'chromaglass-watch',
    (/^https?:/.test(opt.input) ? opt.input.replace(/^https?:\/\//, '') : path.basename(opt.input)).replace(/[^\w.-]+/g, '_').slice(0, 60)));
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^(sheet-\d+|timeline|still-.*)\.png$|^(stats\.tsv|summary\.md)$/.test(f)) fs.rmSync(path.join(out, f));

  let info = null;
  if (/^https?:\/\//.test(opt.input)) ({ file: opt.file, info } = download(opt.input, out));
  else {
    opt.file = path.resolve(opt.input);
    if (!fs.existsSync(opt.file)) fail(`no such file ${opt.file}`, 2);
    info = readInfo(opt.file);
  }
  const pr = probe(opt.file);
  const known = pr.duration != null ? Math.max(0, (opt.to > opt.from ? Math.min(opt.to, pr.duration) : pr.duration) - opt.from) : null;
  // About a thousand samples whatever the length, never more than the clip has
  // and never under 2 a second (motion between samples further apart than
  // that is mostly a measure of what moved out of frame).
  const rate = opt.rate > 0 ? opt.rate : Math.max(2, Math.min(pr.fps ?? 30, 10, known ? 1000 / known : 10));
  const aw = 320;

  // Pass 1: every sample, small, for the numbers and the slit scan.
  const rows = [], slit = [];
  let prev = null;
  // `crop` ({ x, y, w, h } as fractions of the picture) keeps only part of it:
  // a harness filming the whole page wants the plate, not the desk's meters,
  // which move with the music whether the plate does or not.
  const c = opt.crop;
  const pre = c ? `crop=trunc(iw*${c.w}/2)*2:trunc(ih*${c.h}/2)*2:trunc(iw*${c.x}):trunc(ih*${c.y}),` : '';
  const { n, w, h } = await decode(`${pre}fps=${rate},scale=${aw}:-2:flags=area`, (px, k, W, H) => {
    let lum = 0, sat = 0, dark = 0, bright = 0, diff = 0, coloured = 0;
    const hue = new Float64Array(8), hist = new Float32Array(64), hue12 = new Float32Array(12), hv = new Float32Array(39);
    for (let i = 0, p = 0; i < px.length; i += 3, p++) {
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), S = mx > 0 ? (mx - mn) / mx : 0;
      lum += Y; sat += S;
      if (Y < 0.1) dark++;
      if (Y > 0.92) bright++;
      if (prev) diff += Math.abs(Y - prev[p]);
      hist[(px[i] >> 6) * 16 + (px[i + 1] >> 6) * 4 + (px[i + 2] >> 6)]++;
      let H0 = -1;
      if (S > 0.25) {
        H0 = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
        H0 = (H0 * 60 + 360) % 360;
      }
      // For the show's shape (below): twelve 30° hues, and the same with the
      // grey pixels in a slot of their own, each in three values. The bins
      // are centred on the hues (red is 345° to 15°), not started at them.
      // Started at 0°, pure red sits on the edge between two bins and the
      // codec's rounding splits it: the self-test's red-and-cyan grating read
      // as four hues, and a red turning slowly towards magenta read as a
      // composition change the moment it began, as its pixels crossed 0°.
      const hb = H0 < 0 ? 12 : Math.floor((H0 + 15) / 30) % 12;
      hv[hb * 3 + (mx < 0.15 ? 0 : mx < 0.5 ? 1 : 2)]++;
      if (H0 >= 0 && mx > 0.15) {
        coloured++;
        hue12[hb]++;
        hue[H0 < 15 || H0 >= 330 ? 0 : H0 < 40 ? 1 : H0 < 70 ? 2 : H0 < 160 ? 3 : H0 < 200 ? 4 : H0 < 255 ? 5 : H0 < 290 ? 6 : 7]++;
      }
    }
    const N = W * H;
    const cur = new Float32Array(N);
    for (let i = 0, p = 0; p < N; i += 3, p++) cur[p] = (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    rows.push({ t: opt.from + k / rate, lum: lum / N, sat: sat / N, dark: dark / N, bright: bright / N,
      motion: prev ? (diff / N) * 100 : 0, coloured, colour: coloured / N, hue, hue12, hist: hist.map(v => v / N), hv: hv.map(v => v / N) });
    prev = cur;
    const col = Buffer.alloc(H * 3);
    for (let y = 0; y < H; y++) px.copy(col, y * 3, (y * W + (W >> 1)) * 3, (y * W + (W >> 1)) * 3 + 3);
    slit.push(col);
  });
  if (!n) fail('decoded no frames');
  const span = n / rate;

  // Loudness over the same window each motion value covers: the motion at
  // sample k is the change from k-1 to k, so its sound is [t(k-1), t(k)).
  let loud = null;
  if (pr.audio) {
    const a = await decodeAudio(), per = 8000 / rate;
    loud = rows.map((_, k) => {
      const s0 = Math.max(0, Math.round((k - 1) * per)), s1 = Math.min(a.length, Math.round(Math.max(k, 1) * per));
      let e = 0; for (let i = s0; i < s1; i++) e += a[i] * a[i];
      const rms = s1 > s0 ? Math.sqrt(e / (s1 - s0)) / 32768 : 0;
      return Math.max(-80, 20 * Math.log10(rms + 1e-9));
    });
    rows.forEach((r, k) => (r.loud = loud[k]));
  }

  // Hard cuts. Motion alone cannot find them: liquid footage changes
  // smoothly however fast it moves, and a fast pour changes more every
  // sample than a cut between two calm shots does once. So a cut is an
  // outlier against the samples around it, found two ways:
  //
  //   - the colours change: the share of pixels in each of 64 colour bins
  //     moves by far more than it does from sample to sample around it.
  //     Motion inside a shot, however fast, keeps its colours; a cut to
  //     another shot does not. This is what finds a cut into or out of a
  //     fast shot.
  //   - the picture changes several times more than on both sides of it.
  //     This finds a cut between two calm shots in the same colours (the
  //     same white table from another angle), which the colours miss.
  //
  // "Around" is the samples since the last cut (the old shot) and the six
  // after. The first version used one window across both sides and judged
  // motion only; a cut from a calm shot into a fast one sat in a window half
  // fast, and the last sample of a fast shot before a calm one looked like
  // a cut against the calm samples after it. The self-test holds both.
  const cuts = [];
  const median = a => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0);
  const change = rows.map((r, k) => (k ? r.hist.reduce((s, v, i) => s + Math.abs(v - rows[k - 1].hist[i]), 0) / 2 : 0));
  for (let k = 1; k < n; k++) {
    const lo = Math.max(1, k - 6, (cuts.at(-1) ?? 0) + 1), hi = Math.min(n, k + 7);
    const cB = median(change.slice(lo, k)), cA = median(change.slice(k + 1, hi));
    const mB = median(rows.slice(lo, k).map(r => r.motion)), mA = median(rows.slice(k + 1, hi).map(r => r.motion));
    const colours = change[k] > 0.25 && change[k] > 3 * Math.max(cB, cA) + 0.05;
    const picture = rows[k].motion > 8 && rows[k].motion > 4 * Math.max(mB, mA) + 1;
    // A cut blended over two samples (a short dissolve) shows as two in a
    // row; one within a third of a second of another is the same cut.
    if ((colours || picture) && rows[k].motion > 2 && !(cuts.length && k - cuts.at(-1) < rate / 3)) { cuts.push(k); rows[k].cut = true; }
  }

  // Pass 2: the chosen frames at tile size.
  const want = new Set();
  for (let i = 0; i < opt.frames; i++) want.add(Math.min(n - 1, Math.floor(((i + 0.5) * n) / opt.frames)));
  for (const k of cuts) want.add(k);
  const picks = [...want].sort((x, y) => x - y).filter((k, i, arr) => i === 0 || k - arr[i - 1] >= Math.max(1, n / (opt.frames * 4)) || rows[k].cut).slice(0, 60);
  // Split evenly: 13 frames at 12 a sheet is two sheets of 7 and 6, not 12 and 1.
  const per = Math.ceil(picks.length / Math.ceil(picks.length / opt.perSheet));
  const aspect = w / h, MAX = 1568, GAP = 4;
  let best = null;
  for (let cols = 1; cols <= per; cols++) {
    const rws = Math.ceil(per / cols);
    const tw = Math.floor(Math.min((MAX - GAP * (cols - 1)) / cols, ((MAX - GAP * (rws - 1)) / rws) * aspect));
    if (!best || tw > best.tw) best = { cols, rws, tw };
  }
  const tw = best.tw - (best.tw % 2), th = Math.round(tw / aspect / 2) * 2;
  const tiles = [];
  const sel = picks.map(k => `eq(n,${k})`).join('+');
  await decode(`${pre}fps=${rate},select='${sel}',scale=${tw}:${th}:flags=lanczos`, (px, i, W, H) => tiles.push({ k: picks[i], px: Buffer.from(px), W, H }));
  const sheets = [];
  for (let s = 0; s * per < tiles.length; s++) {
    const group = tiles.slice(s * per, (s + 1) * per);
    const cols = Math.min(best.cols, group.length), rws = Math.ceil(group.length / cols);
    const TW = group[0].W, TH = group[0].H;
    const SW = cols * TW + (cols - 1) * GAP, SH = rws * TH + (rws - 1) * GAP;
    const img = new Uint8Array(SW * SH * 3).fill(40);
    group.forEach((t, i) => {
      const x0 = (i % cols) * (TW + GAP), y0 = Math.floor(i / cols) * (TH + GAP);
      for (let y = 0; y < TH; y++) img.set(t.px.subarray(y * TW * 3, (y + 1) * TW * 3), ((y0 + y) * SW + x0) * 3);
      label(img, SW, SH, x0 + 4, y0 + 4, stamp(rows[t.k].t) + (rows[t.k].cut ? ' CUT' : ''));
    });
    const f = path.join(out, `sheet-${s + 1}.png`);
    writePng(f, SW, SH, img);
    sheets.push({ f, from: rows[group[0].k].t, to: rows[group.at(-1).k].t, count: group.length, SW, SH });
  }

  // The timeline: slit scan, motion, loudness, cut lines and a time axis.
  const scale = n >= 1200 ? 1 : Math.max(1, Math.floor(1200 / n));
  const cols = n >= 1200 ? 1200 : n * scale;
  const colOf = x => (n >= 1200 ? Math.floor((x * n) / cols) : Math.floor(x / scale));
  const SLH = Math.min(h, 480), BAR = 44, AX = 26;
  const TH2 = SLH + BAR + (loud ? BAR : 0) + AX;
  const tl = new Uint8Array(cols * TH2 * 3).fill(18);
  // Scaled to the 99th percentile of motion without the cuts: a cut is a
  // change of the whole frame and would flatten every other bar to nothing.
  const still = rows.filter((r, k) => k > 0 && !r.cut).map(r => r.motion).sort((x, y) => x - y);
  const mMax = Math.max(1e-6, still[Math.floor(still.length * 0.99)] ?? 1);
  for (let x = 0; x < cols; x++) {
    const k = colOf(x), col = slit[k];
    for (let y = 0; y < SLH; y++) {
      const sy = Math.floor((y * h) / SLH);
      tl.set(col.subarray(sy * 3, sy * 3 + 3), (y * cols + x) * 3);
    }
    const mh = Math.round(Math.min(1, rows[k].motion / mMax) * (BAR - 6));
    for (let y = 0; y < mh; y++) tl.set([235, 235, 235], ((SLH + BAR - 2 - y) * cols + x) * 3);
    if (loud) {
      const lh = Math.round(Math.max(0, Math.min(1, (loud[k] + 60) / 60)) * (BAR - 6));
      for (let y = 0; y < lh; y++) tl.set([90, 200, 255], ((SLH + 2 * BAR - 2 - y) * cols + x) * 3);
    }
    if (rows[k].cut && (x === 0 || colOf(x - 1) !== k)) for (let y = 0; y < TH2 - AX; y++) tl.set([255, 40, 40], (y * cols + x) * 3);
  }
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600].find(s => span / s <= 12) ?? 1200;
  for (let t = 0; t <= span + 1e-9; t += step) {
    const x = Math.min(cols - 1, Math.round((t / span) * cols));
    for (let y = TH2 - AX; y < TH2 - AX + 6; y++) tl.set([200, 200, 200], (y * cols + x) * 3);
    label(tl, cols, TH2, Math.max(0, Math.min(cols - 60, x - 20)), TH2 - AX + 7, stamp(opt.from + t), 1);
  }
  label(tl, cols, TH2, 4, 4, 'CENTRE COLUMN OVER TIME', 1);
  label(tl, cols, TH2, 4, SLH + 3, 'MOTION', 1);
  if (loud) label(tl, cols, TH2, 4, SLH + BAR + 3, 'LOUDNESS', 1);
  const timeline = path.join(out, 'timeline.png');
  writePng(timeline, cols, TH2, tl);

  // Stills at full size, by seeking: few, and asked for by time.
  const stills = [];
  for (const t of opt.at) {
    const f = path.join(out, `still-${t.toFixed(2)}s.png`);
    const r = spawnSync(ff(), ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', opt.file, '-frames:v', '1', '-y', f]);
    if (r.status === 0 && fs.existsSync(f)) stills.push(f);
  }

  // Numbers.
  fs.writeFileSync(path.join(out, 'stats.tsv'), ['t\tluma\tdark\tbright\tsat\tmotion\tloud_db\tcut',
    ...rows.map(r => [r.t.toFixed(2), r.lum.toFixed(3), r.dark.toFixed(3), r.bright.toFixed(3), r.sat.toFixed(3),
      r.motion.toFixed(3), r.loud?.toFixed(1) ?? '', r.cut ? 1 : 0].join('\t'))].join('\n') + '\n');

  const mean = f => rows.reduce((s, r) => s + f(r), 0) / n;
  const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  const hueTot = new Float64Array(8); let colTot = 0;
  for (const r of rows) { r.hue.forEach((v, i) => (hueTot[i] += v)); colTot += r.coloured; }
  const HUES = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'magenta'];
  const hues = [...hueTot].map((v, i) => [HUES[i], v / Math.max(1, colTot)]).sort((a, b) => b[1] - a[1]).filter(x => x[1] >= 0.05).slice(0, 4);
  const pct = x => `${(x * 100).toFixed(0)}%`;
  const motions = rows.slice(1).map(r => r.motion);

  let sync = null;
  if (loud) {
    const pear = (a, b) => {
      const m = a.length, ma = a.reduce((s, x) => s + x, 0) / m, mb = b.reduce((s, x) => s + x, 0) / m;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < m; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
    };
    const ok = rows.map((r, k) => k > 0 && !r.cut);
    let bestLag = { lag: 0, r: -2 };
    const maxLag = Math.round(rate);
    for (let lag = -maxLag; lag <= maxLag; lag++) {
      const a = [], b = [];
      for (let k = 1; k < n; k++) { const j = k - lag; if (j >= 1 && j < n && ok[k] && ok[j]) { a.push(rows[k].motion); b.push(loud[j]); } }
      if (a.length > 8) { const r = pear(a, b); if (r > bestLag.r) bestLag = { lag, r }; }
    }
    const a = [], b = [];
    for (let k = 1; k < n; k++) if (ok[k]) { a.push(rows[k].motion); b.push(loud[k]); }
    sync = { r0: pear(a, b), best: bestLag.r, lag: bestLag.lag / rate };
  }

  const sh = shape({ rows, rate, span, cuts });
  const f1 = x => (x == null || !Number.isFinite(x) ? '–' : x.toFixed(1));
  const shapeLines = [
    `- shape: ${sh.swells.perMin.toFixed(1)} swells a minute (median gap ${f1(sh.swells.gap)} s, rise ${f1(sh.swells.rise)} s, decay ${f1(sh.swells.decay)} s, peak ${f1(sh.swells.peakOverMedian)}× the median); calm ${pct(sh.calm)} of the time; motion half-life ${f1(sh.halfLife)} s`,
    `- near black ${pct(sh.black.p5)} to ${pct(sh.black.p95)} (5th to 95th percentile); ${sh.hues} hues a frame; ${sh.reorgPerMin.toFixed(1)} composition changes and ${sh.cutsPerMin.toFixed(1)} cuts a minute`,
    ...(sh.sections ? [`- motion vs loudness by window: ${[1, 5, 10, 20].map(w => `${w} s ${sh.sections[w].r == null ? '–' : sh.sections[w].r.toFixed(2)}`).join(', ')}`] : []),
  ];

  const buckets = Math.min(40, n);
  const table = ['| time | luma | dark | sat | motion | loud dB |', '|---|---|---|---|---|---|'];
  for (let b = 0; b < buckets; b++) {
    const g = rows.slice(Math.floor((b * n) / buckets), Math.floor(((b + 1) * n) / buckets));
    if (!g.length) continue;
    const m = f => g.reduce((s, r) => s + f(r), 0) / g.length;
    table.push(`| ${stamp(g[0].t)} | ${m(r => r.lum).toFixed(2)} | ${pct(m(r => r.dark))} | ${m(r => r.sat).toFixed(2)} | ${m(r => r.motion).toFixed(2)}${g.some(r => r.cut) ? ' cut' : ''} | ${loud ? m(r => r.loud).toFixed(0) : '–'} |`);
  }

  const lines = [
    `# ${info?.title ?? path.basename(opt.file)}`,
    '',
    ...(info ? [`${info.uploader ?? ''} · ${info.url}`, info.description ? `> ${info.description}` : '', ''] : []),
    `- file: ${opt.file}`,
    `- ${w}x${h} as decoded (stored ${pr.stored}), ${pr.fps ?? '?'} fps, ${pr.duration != null ? `${pr.duration.toFixed(1)} s` : 'no duration in the header'}; watched ${stamp(opt.from)} to ${stamp(opt.from + span)} at ${rate} samples/s (${n} samples)`,
    `- brightness ${mean(r => r.lum).toFixed(2)}; near black ${pct(mean(r => r.dark))} of the frame; blown ${pct(mean(r => r.bright))}; saturation ${mean(r => r.sat).toFixed(2)}`,
    `- colour: ${pct(colTot / (n * w * h))} of pixels are coloured; of those ${hues.map(([nme, v]) => `${nme} ${pct(v)}`).join(', ') || 'none'}`,
    `- motion (mean % change between samples): median ${q(motions, 0.5)?.toFixed(2) ?? 0}, 90th ${q(motions, 0.9)?.toFixed(2) ?? 0}, max ${q(motions, 1)?.toFixed(2) ?? 0}`,
    `- cuts: ${cuts.length ? cuts.map(k => stamp(rows[k].t)).join(', ') : 'none'}`,
    ...shapeLines,
    sync ? `- sound: loudness median ${q(loud, 0.5).toFixed(0)} dB; motion vs loudness r = ${sync.r0.toFixed(2)} at no lag, best ${sync.best.toFixed(2)} with motion ${sync.lag >= 0 ? 'following' : 'leading'} the sound by ${Math.abs(sync.lag).toFixed(2)} s` : '- sound: no audio track',
    '',
    'Read first: the timeline (how it moves over the whole clip), then the sheets.',
    `- ${timeline}`,
    ...sheets.map(s => `- ${s.f} (${s.count} frames, ${stamp(s.from)} to ${stamp(s.to)}, ${s.SW}x${s.SH})`),
    ...stills.map(f => `- ${f}`),
    `- ${path.join(out, 'stats.tsv')} (every sample)`,
    '',
    ...table,
  ];
  fs.writeFileSync(path.join(out, 'summary.md'), lines.join('\n') + '\n');
  if (!opt.quiet) console.log(lines.join('\n'));
  return { out, rows, cuts, sync, shape: sh, sheets, tiles, picks, timeline, span, pr, w, h, rate };
}

// ─── the show's shape ────────────────────────────────────────────────────────

/**
 * The shape of a show over minutes, in the units the footage study measured
 * real liquid light shows in (/mnt/project-files/research/light-show/
 * footage.md, "The same clips measured further"), so a take from the app can
 * be put beside the Joshua Light Show and read in the same numbers.
 *
 * Why these and not the summary's. The summary says how busy a clip is on
 * average; what separated the real shows from our plate was never the
 * average. Across the live and historic shows, motion comes in swells (1.6
 * to 3.7 a minute, each peaking at about two and a half times the median and
 * falling away over 2 to 9 s), the plate is calm a fifth to two fifths of
 * the time, the composition reorganises every 7 to 10 s without a cut, the
 * near-black share of the frame swings over tens of percent, a frame holds
 * two or three hues, and motion follows loudness only over whole sections,
 * never beat by beat. `phrasing.ts` says our plate is equally busy all the
 * time; these are the numbers that would show it, and show it change.
 *
 * Every window is in seconds, not samples. That makes a take watched at ten
 * samples a second comparable with a reference watched at four, but not
 * equal: motion is the change between samples, and more change builds up
 * over a quarter of a second than a tenth (clip D reads a peak of 7.4 times
 * the median at ten and 5.3 at four). Compare at the same rate; `film`
 * watches at four, as the footage study did. Cut samples are left
 * out of everything that reads motion: a cut is the editor's, not the
 * plate's.
 *
 *   swells       episodes where motion (smoothed over 1.25 s) rises past 1.8
 *                times its median to a peak that is the highest within 2 s,
 *                at least 4 s after the last; per minute, the median gap,
 *                the median rise and decay (to and from half the peak), and
 *                the median peak over the median. A rise or decay that runs
 *                off the end of the clip is not counted.
 *   calm         the share of samples under a third of the 90th percentile.
 *   halfLife     how long motion stays like itself: the first lag at which
 *                its autocorrelation drops under 0.5.
 *   black        the near-black share of the frame: mean, and the 5th and
 *                95th percentiles over samples, so "performed black" (a
 *                flood, then a fade) reads as a wide range.
 *   hues         the median, over samples, of how many 30° hues hold at least
 *                8% of the coloured pixels (0 when under 5% of the frame is
 *                coloured at all).
 *   reorgPerMin  times the colour-and-brightness histogram (twelve hues and
 *                grey, three values each) moves by more than half its mass
 *                over 3 s, at least 5 s apart: a composition change, with or
 *                without a cut. Colour only: the histogram has no
 *                position, so shapes rearranging in the same colours are
 *                not counted.
 *   still        true when the median sample changes under 0.1%;
 *                swells, calm and half-life are then NaN or null, not
 *                numbers about nothing.
 *   sections     motion against loudness over windows of 1, 5, 10 and 20 s
 *                (means, loudness as amplitude), null with under five
 *                windows. The real shows score about zero at 1 s; the one
 *                unedited live show rose to 0.4 at 20 s.
 */
const FREEZE_FLOOR = 0.005;   // % change a sample: under it, the frame did not change (see freezes())
const STILL = 0.1;            // % change a sample at the median: under it, the take is a still (see shape())

export function shape({ rows, rate, span, cuts = [] }) {
  const n = rows.length;
  const med = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const q = (a, p) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
  const sec = x => Math.max(1, Math.round(x * rate));
  const m = rows.map((r, k) => (k === 0 || r.cut ? NaN : r.motion));

  const hw = Math.round(1.25 * rate) >> 1;   // a window 1.25 s wide: five samples at 4 a second
  const sm = m.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - hw); k <= Math.min(n - 1, i + hw); k++) if (Number.isFinite(m[k])) { s += m[k]; c++; }
    return c ? s / c : NaN;
  });
  // A plate that is not moving has no shape to measure: a swell is then any
  // codec blip over nothing, and "calm" divides by a 90th percentile of
  // nothing. The review of the first version found a clip frozen for two
  // thirds of its length read five swells a minute. So below STILL at the
  // median the motion measures refuse, and say why. Not the freeze floor:
  // a repeated frame through libvpx reads 0.01% a sample, not zero (clip E
  // below), and a frozen plate with its grain 0.03–0.08% (`npm run moving`
  // on Metal), while the stillest real show measured, a bar in 2016, has a
  // median of 1.1 and the app's soap film 0.7.
  const still = !(med(m) >= STILL);
  const smMed = med(sm), near = sec(2), apart = sec(4);
  const peaks = [];
  for (let i = 0; i < n; i++) {
    if (!(sm[i] > 1.8 * smMed)) continue;
    let top = true;
    for (let k = Math.max(0, i - near); k <= Math.min(n - 1, i + near) && top; k++) if (sm[k] > sm[i] || (sm[k] === sm[i] && k < i)) top = false;
    if (top && (!peaks.length || i - peaks.at(-1) >= apart)) peaks.push(i);
  }
  const rise = [], decay = [];
  for (const p of peaks) {
    let j = p; while (j < n && !(sm[j] <= sm[p] / 2)) j++;
    if (j < n) decay.push((j - p) / rate);
    let k = p; while (k >= 0 && !(sm[k] <= sm[p] / 2)) k--;
    if (k >= 0) rise.push((p - k) / rate);
  }
  const minutes = span / 60;
  const swells = still ? { at: [], perMin: NaN, gap: NaN, rise: NaN, decay: NaN, peakOverMedian: NaN } : {
    at: peaks.map(p => rows[p].t),
    perMin: peaks.length / minutes,
    gap: med(peaks.slice(1).map((p, i) => (p - peaks[i]) / rate)),
    rise: med(rise), decay: med(decay),
    peakOverMedian: med(peaks.map(p => sm[p])) / smMed,
  };

  const p90 = q(m, 0.9), valid = m.filter(Number.isFinite);
  const calm = !still && valid.length ? valid.filter(x => x < p90 / 3).length / valid.length : NaN;

  let halfLife = null;
  if (!still && valid.length > 8) {
    const mu = valid.reduce((a, b) => a + b, 0) / valid.length;
    const v = valid.reduce((a, b) => a + (b - mu) ** 2, 0) / valid.length;
    for (let lag = 1; v > 0 && lag < valid.length / 2; lag++) {
      let c = 0; for (let i = 0; i + lag < valid.length; i++) c += (valid[i] - mu) * (valid[i + lag] - mu);
      if (c / ((valid.length - lag) * v) < 0.5) { halfLife = lag / rate; break; }
    }
  }

  const dark = rows.map(r => r.dark);
  const black = { mean: dark.reduce((a, b) => a + b, 0) / n, p5: q(dark, 0.05), p95: q(dark, 0.95) };

  const hues = med(rows.map(r => (r.colour < 0.05 ? 0 : [...r.hue12].filter(c => c / r.coloured >= 0.08).length)));

  const lag3 = sec(3), gap5 = sec(5);
  const reorgAt = [];
  for (let k = lag3; k < n; k++) {
    let d = 0; for (let i = 0; i < rows[k].hv.length; i++) d += Math.abs(rows[k].hv[i] - rows[k - lag3].hv[i]);
    if (d > 0.5 && (!reorgAt.length || k - reorgAt.at(-1) >= gap5)) reorgAt.push(k);
  }

  let sections = null;
  if (rows.some(r => r.loud != null)) {
    const pear = (a, b) => {
      const c = a.length, ma = a.reduce((s, x) => s + x, 0) / c, mb = b.reduce((s, x) => s + x, 0) / c;
      let sab = 0, saa = 0, sbb = 0;
      for (let i = 0; i < c; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
      // Nothing to correlate when either side is flat: a silent track, or a
      // band at one level throughout. The sums of squares are then rounding
      // (a silent take read r = 1e-16 and a steady -20 dB read -0.53), so
      // flat means a spread under a millionth of the mean, and r is null.
      const flat = (ss, mean) => Math.sqrt(ss / c) <= 1e-6 * Math.abs(mean);
      if (flat(saa, ma) || flat(sbb, mb)) return null;
      return sab / Math.sqrt(saa * sbb);
    };
    sections = {};
    for (const win of [1, 5, 10, 20]) {
      const k = sec(win), M = [], L = [];
      for (let i = 0; i + k <= n; i += k) {
        const g = rows.slice(i, i + k).map((r, j) => [m[i + j], 10 ** ((r.loud ?? -80) / 20)]).filter(([x]) => Number.isFinite(x));
        if (g.length < k / 2) continue;
        M.push(g.reduce((s, [x]) => s + x, 0) / g.length); L.push(g.reduce((s, [, y]) => s + y, 0) / g.length);
      }
      sections[win] = M.length >= 5 ? { r: pear(M, L), windows: M.length } : { r: null, windows: M.length };
    }
  }

  return { still, swells, calm, halfLife, black, hues, reorgPerMin: reorgAt.length / minutes, reorgAt: reorgAt.map(k => rows[k].t),
    cutsPerMin: cuts.length / minutes, sections };
}

// ─── self-test ───────────────────────────────────────────────────────────────

const SW_ = 320, SH_ = 180, SFPS = 30;

/**
 * Encode a clip made here: `frame(f)` gives RGB for frame f, `sound(t)` a
 * sample in [-32768, 32767], `delay` shifts the sound later. It goes out as
 * WebM through a pipe, the way MediaRecorder writes it, so the file has no
 * duration and no cues: the case the app's own recordings are.
 */
async function makeClip(dir, name, { sec, frame, sound, delay = 0 }) {
  const wav = Buffer.alloc(44 + sec * 8000 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + sec * 16000, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(sec * 16000, 40);
  for (let i = 0; i < sec * 8000; i++) { const t = i / 8000 - delay; wav.writeInt16LE(t < 0 ? 0 : Math.round(sound(t)), 44 + i * 2); }
  const wavPath = path.join(dir, `${name}.wav`), clip = path.join(dir, `${name}.webm`);
  fs.writeFileSync(wavPath, wav);
  const p = spawn(ff(), ['-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${SW_}x${SH_}`, '-r', String(SFPS), '-i', 'pipe:0',
    '-i', wavPath, '-c:v', 'libvpx', '-b:v', '2M', '-c:a', 'libvorbis', '-shortest', '-f', 'webm', 'pipe:1'], { stdio: ['pipe', 'pipe', 'inherit'] });
  const file = fs.createWriteStream(clip);
  p.stdout.pipe(file);
  const done = Promise.all([
    new Promise((resolve, reject) => p.on('close', c => (c === 0 ? resolve() : reject(new Error(`encoding ${name} failed (${c})`))))),
    new Promise(resolve => file.on('finish', resolve)),
  ]);
  for (let f = 0; f < SFPS * sec; f++) if (!p.stdin.write(frame(f))) await new Promise(r => p.stdin.once('drain', r));
  p.stdin.end();
  await done;
  return clip;
}

function canvas(bg) {
  const img = Buffer.alloc(SW_ * SH_ * 3);
  for (let i = 0; i < SW_ * SH_; i++) img.set(bg, i * 3);
  return img;
}
const square = (img, x) => { for (let y = 70; y < 110; y++) for (let xx = x; xx < x + 40; xx++) img.set([255, 255, 255], (y * SW_ + xx) * 3); return img; };

/**
 * Clips whose answers are known, made here, watched, and held to them. Each
 * check names the sample or the value it expects, not only that something
 * happened (the rules in docs/roadmap.md; the first version of this passed
 * with the sound a fifth of a second out and with the sheets showing the
 * wrong frames, which is why these are exact).
 *
 * A, six seconds: a white square that moves only while a beep sounds (beeps
 * in quarter-second slots, on or off by a seeded coin: a regular pulse
 * correlates as well a whole period out as at none), and a hard cut at 3.0 s
 * where the grey background turns red.
 * B: A with the sound half a second late, which pins the sign of the lag.
 * C: calm, a hard cut at 2.0 s into stripes sweeping fast (every sample
 * changes far more than 8%, and none of it is a cut), then a dissolve over
 * two samples at 4.0 s into calm blue, which is one cut, not two.
 * D, a minute, for the show's shape: a two-colour grating drifting right at
 * half a pixel a frame, surging to four in three swells at 6, 18 and 30 s
 * and never after; its colours crossfading from red and cyan to magenta and
 * green between 24 and 27 s (one composition change, no cut), and the top
 * 30% of it turning back from 45 s (a partial change, not a composition); a
 * yellow band along the bottom; a black strip on the left widening from 10%
 * to 80% of the frame over the minute; and a tone whose loudness follows the
 * swells. D again, silent and then frozen, for what shape() must refuse.
 */
async function selftest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-selftest-'));
  let seed = 7;
  const slots = Array.from({ length: 24 }, () => ((seed = (seed * 16807) % 2147483647) % 100) < 50);
  const on = t => slots[Math.min(slots.length - 1, Math.floor(t * 4))];
  const beep = t => (on(t) ? 12000 * Math.sin(2 * Math.PI * 880 * t) : 0);
  const xs = []; let x = 20;
  for (let f = 0; f < SFPS * 6; f++) { if (on(f / SFPS)) x += 6; if (x > SW_ - 40) x = 20; xs.push(x); }
  const bgA = t => (t < 3 ? [110, 110, 110] : [170, 40, 40]);
  const frameA = f => square(canvas(bgA(f / SFPS)), xs[f]);
  const stripes = f => {
    const img = Buffer.alloc(SW_ * SH_ * 3);
    for (let y = 0; y < SH_; y++) for (let xx = 0; xx < SW_; xx++) img.fill(((xx + 8 * f) % 64) < 32 ? 230 : 20, (y * SW_ + xx) * 3, (y * SW_ + xx) * 3 + 3);
    return img;
  };
  const frameC = f => {
    const t = f / SFPS;
    if (t < 2) return square(canvas([110, 110, 110]), 140);
    // Frames 118 to 123 dissolve, so the samples at 4.0 (frame 120) and 4.1
    // (frame 123) both see part of it.
    const a = Math.max(0, Math.min(1, (f - 117) / 6));
    if (a <= 0) return stripes(f);
    const s = stripes(f), b = canvas([40, 60, 170]);
    for (let i = 0; i < s.length; i++) s[i] = Math.round(s[i] * (1 - a) + b[i] * a);
    return s;
  };

  const run = async (clip, extra = {}) => {
    Object.assign(opt, { input: clip, out: `${clip}-out`, frames: 12, perSheet: 12, rate: 0, from: 0, to: 0, at: [], quiet: true }, extra);
    return watch();
  };
  const A = await run(await makeClip(dir, 'a', { sec: 6, frame: frameA, sound: beep }));
  const B = await run(await makeClip(dir, 'b', { sec: 6, frame: frameA, sound: beep, delay: 0.5 }));
  const C = await run(await makeClip(dir, 'c', { sec: 6, frame: frameC, sound: () => 0 }));

  const SWELLS = [6, 18, 30];
  // Each swell rises slowly (σ 2.5 s) and falls fast (σ 1 s), so a rise and
  // a decay swapped read wrong.
  const bump = (t, c) => Math.exp(-((t - c) ** 2) / (2 * (t < c ? 2.5 : 1) ** 2));
  const speed = t => 0.5 + 3.5 * SWELLS.reduce((a, c) => a + bump(t, c), 0);
  const drift = [0];
  for (let f = 1; f < SFPS * 60; f++) drift.push(drift[f - 1] + speed(f / SFPS));
  const mixc = (a, b, u) => a.map((v, i) => v * (1 - u) + b[i] * u);
  const RED = [255, 0, 0], CYAN = [0, 255, 255], MAGENTA = [255, 0, 255], GREEN = [0, 255, 0];
  const TOP = Math.round(0.3 * SH_), BAND = SH_ - Math.round(0.15 * SH_);
  const frameD = f => {
    const t = f / SFPS, u = Math.max(0, Math.min(1, (t - 24) / 3)), v = Math.max(0, Math.min(1, (t - 45) / 3));
    const c1 = mixc(RED, MAGENTA, u), c2 = mixc(CYAN, GREEN, u);
    // The top 30% of rows turn back to red and cyan from 45 s: a real but
    // partial change of colour, too small to be a new composition.
    const t1 = mixc(c1, RED, v), t2 = mixc(c2, CYAN, v);
    const edge = Math.round((0.1 + (0.7 * t) / 60) * SW_);
    const top = Buffer.alloc(SW_ * 3), mid = Buffer.alloc(SW_ * 3), band = Buffer.alloc(SW_ * 3);
    for (let xx = edge; xx < SW_; xx++) {
      const g = 0.5 + 0.5 * Math.sin((2 * Math.PI * (xx - drift[f])) / 64);
      top.set(mixc(t1, t2, g).map(Math.round), xx * 3);
      mid.set(mixc(c1, c2, g).map(Math.round), xx * 3);
      band.set([255, 255, 0], xx * 3);
    }
    const img = Buffer.alloc(SW_ * SH_ * 3);
    for (let y = 0; y < SH_; y++) (y < TOP ? top : y < BAND ? mid : band).copy(img, y * SW_ * 3);
    return img;
  };
  const D = await run(await makeClip(dir, 'd', { sec: 60, frame: frameD, sound: t => 3000 * speed(t) * Math.sin(2 * Math.PI * 440 * t) }));
  const E = await run(await makeClip(dir, 'e', { sec: 60, frame: f => frameD(Math.min(f, SFPS * 20)), sound: () => 0 }));

  const checks = [];
  const check = (name, ok, detail) => { checks.push(!!ok); console.log(` ${ok ? 'ok  ' : 'FAIL'} ${name} — ${detail}`); };
  const ts = r => r.cuts.map(k => r.rows[k].t.toFixed(2)).join(', ') || 'none';

  check('the header says Duration: N/A, as MediaRecorder writes it', /Duration: N\/A/.test(A.pr.raw), `probe: ${/Duration: [^,]*/.exec(A.pr.raw)?.[0] ?? 'no Duration line'}`);
  check('with no duration, 10 samples a second', A.rate === 10, `${A.rate}`);
  check('length read from the frames', Math.abs(A.span - 6) <= 0.1 + 1e-9, `${A.span.toFixed(2)} s, expected 6`);
  check('A: one cut, at sample 30 (3.0 s)', A.cuts.length === 1 && A.cuts[0] === 30, `cuts at ${ts(A)}`);

  const inBeep = [], inQuiet = [];
  A.rows.forEach((row, k) => {
    if (k === 0 || row.cut) return;
    const a = row.t - 0.1 + 1e-6, b = row.t - 1e-6;
    if (on(a) && on(b)) inBeep.push(row.motion);
    else if (!on(a) && !on(b)) inQuiet.push(row.motion);
  });
  const avg = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  check('A: motion is where the square moves', inBeep.length >= 6 && inQuiet.length >= 6 && avg(inBeep) > 5 * avg(inQuiet) + 0.01,
    `during beeps ${avg(inBeep).toFixed(3)} (${inBeep.length}), in silence ${avg(inQuiet).toFixed(3)} (${inQuiet.length})`);
  check('A: motion and sound line up at lag 0', A.sync && A.sync.lag === 0 && A.sync.r0 > 0.6,
    A.sync ? `r ${A.sync.r0.toFixed(2)} at no lag, best at ${A.sync.lag.toFixed(2)} s` : 'no audio read');
  check('B: sound half a second late reads as motion leading by 0.5 s', B.sync && Math.abs(B.sync.lag + 0.5) < 1e-9 && B.sync.best > 0.6,
    B.sync ? `best r ${B.sync.best.toFixed(2)} at ${B.sync.lag.toFixed(2)} s` : 'no audio read');

  const want = [...new Set([...Array.from({ length: 12 }, (_, i) => Math.floor(((i + 0.5) * 60) / 12)), 30])].sort((a, b) => a - b);
  const got = A.tiles.map(t => t.k);
  check('A: the sheets hold the even frames and the cut, in order', JSON.stringify(got) === JSON.stringify(want), `tiles at samples ${got.join(',')}`);
  // Read the tiles: each one's background is the shot its time is in, and the
  // square is where the generator drew it for that frame (sample k is frame
  // 3k; the square moves 6 px a frame and is 40 wide, so a frame either side
  // still puts its centre inside it).
  const wrong = [];
  for (const t of A.tiles) {
    const px = (x, y) => [...t.px.subarray((y * t.W + x) * 3, (y * t.W + x) * 3 + 3)];
    const bg = bgA(t.k / 10), corner = px(t.W - 3, t.H - 3);
    const cx = Math.round(((xs[3 * t.k] + 20) * t.W) / SW_), cy = Math.round((90 * t.H) / SH_);
    if (corner.some((v, i) => Math.abs(v - bg[i]) > 30) || px(cx, cy).some(v => v < 220)) wrong.push(`${t.k}: corner ${corner}, square ${px(cx, cy)}`);
  }
  check('A: every tile shows its own frame', !wrong.length, wrong.length ? wrong.join('; ') : `${A.tiles.length} tiles read`);
  check('A: no sheet passes 1568 px', A.sheets.every(s => s.SW <= 1568 && s.SH <= 1568), A.sheets.map(s => `${s.SW}x${s.SH}`).join(', '));

  const fast = C.rows.filter((r, k) => r.t > 2.05 && r.t < 3.95 && k > 0).map(r => r.motion);
  check('C: the stripes move more than a cut threshold every sample', fast.length >= 15 && Math.min(...fast) > 8, `motion ${Math.min(...fast).toFixed(1)} to ${Math.max(...fast).toFixed(1)}`);
  check('C: a cut into fast motion at 2.0 s, none inside it, and the dissolve at 4.0 s once',
    C.cuts.length === 2 && C.cuts[0] === 20 && (C.cuts[1] === 40 || C.cuts[1] === 41), `cuts at ${ts(C)}`);

  // C stands still twice: the grey square until the cut at 2.0 s (2.0 s
  // still), and the blue from 4.1 s to the end at 6.0 (1.9 s). At the default
  // two seconds the first is a freeze and the second is not; at 1.5 both are.
  // A never stands still for a second and a half.
  const fz2 = freezes(C), fz = freezes(C, { minSeconds: 1.5 }), fzA = freezes(A, { minSeconds: 1.5 });
  const near = (x, v) => Math.abs(x - v) < 1e-6;
  const show = a => a.map(f => `${f.from.toFixed(1)}–${f.to.toFixed(1)} s`).join(', ') || 'none';
  check('C at the default 2 s: one freeze, 0.0–2.0 s', fz2.length === 1 && near(fz2[0].from, 0) && near(fz2[0].to, 2), show(fz2));
  check('C at 1.5 s: that and 4.1–6.0 s; A: none', fz.length === 2 && near(fz[1].from, 4.1) && near(fz[1].to, 6) && !fzA.length,
    `C: ${show(fz)}; A: ${show(fzA)}`);

  // D's answers come from how it was made. Where a number depends on the
  // motion's exact size (rise, decay, peak, calm, half-life), the answer is
  // the same measure worked out on D's raw frames before the codec, by a
  // separate script written from the definitions in shape()'s comment: peaks
  // at 5.7, 17.7 and 29.7 s, rise 3.3 s, decay 1.8 s, peak 6.65 times the
  // median, calm 66.3%, half-life 2.7 s. The codec blurs a little, hence the
  // margins; each is narrower than the error it is there to catch (a rise
  // and decay swapped, a gap left in samples, a peak divided by 2.5, a calm
  // bar moved from a third to a half, no smoothing: the check-skeptic review
  // found the first version of these passed all of those).
  //
  // Swells: exactly the three, each within a second of where it was made,
  // and nothing in the flat half-minute after (a detector that finds a peak
  // in every bit of noise fails there). Black: the strip's width at the 5th
  // and 95th percentile of the minute. Hues: red, cyan and the yellow band
  // (16% of the coloured pixels, so the 8% bar matters), and later magenta
  // and green with it. One composition change, inside the crossfade at
  // 24–27 s; the partial one at 45–48 s moves about a tenth of the frame's
  // colour and must not count. The loudness follows the swells, so it
  // correlates with motion at 1 s and over 5 s windows; a minute holds only
  // three 20 s windows, too few to say.
  const sh = D.shape, f2 = x => (x == null || !Number.isFinite(x) ? String(x) : x.toFixed(2));
  const within = (x, v, tol) => Number.isFinite(x) && Math.abs(x - v) <= tol;
  check('D: three swells, at 6, 18 and 30 s, 12 s apart, none after',
    sh.swells.at.length === 3 && sh.swells.at.every((t, i) => Math.abs(t - SWELLS[i]) <= 1) && within(sh.swells.gap, 12, 0.5),
    `swells at ${sh.swells.at.map(t => t.toFixed(1)).join(', ') || 'none'} s, gap ${f2(sh.swells.gap)} s`);
  check('D: each rises in about 3.3 s and decays in about 1.8',
    within(sh.swells.rise, 3.3, 0.6) && within(sh.swells.decay, 1.8, 0.5) && sh.swells.rise > sh.swells.decay,
    `rise ${f2(sh.swells.rise)} s, decay ${f2(sh.swells.decay)} s`);
  check('D: a swell peaks at about 6.65 times the median', within(sh.swells.peakOverMedian, 6.65, 1.3), `${f2(sh.swells.peakOverMedian)}×`);
  check('D: calm about 66% of the time, and motion stays like itself about 2.7 s',
    within(sh.calm, 0.663, 0.05) && within(sh.halfLife, 2.7, 0.6), `calm ${f2(sh.calm)}, half-life ${f2(sh.halfLife)} s`);
  check('D: near black from 13.5% to 76.5% (the strip at the 5th and 95th percentile)',
    within(sh.black.p5, 0.135, 0.03) && within(sh.black.p95, 0.765, 0.03), `${f2(sh.black.p5)} to ${f2(sh.black.p95)}`);
  check('D: three hues a frame', sh.hues === 3, `${sh.hues}`);
  check('D: one composition change, in the crossfade at 24–27 s, not the partial one at 45, and no cut',
    sh.reorgAt.length === 1 && sh.reorgAt[0] >= 24 && sh.reorgAt[0] <= 28 && !D.cuts.length,
    `changes at ${sh.reorgAt.map(t => t.toFixed(1)).join(', ') || 'none'} s; cuts at ${ts(D)}`);
  check('D: loudness follows motion at 1 s and over 5 s windows; 20 s windows are too few to say',
    sh.sections?.[1]?.r > 0.8 && sh.sections?.[5]?.r > 0.8 && sh.sections?.[20]?.r === null && sh.sections?.[20]?.windows === 3,
    sh.sections ? `1 s r ${f2(sh.sections[1].r)}, 5 s r ${f2(sh.sections[5].r)}; 20 s r ${f2(sh.sections[20].r)} over ${sh.sections[20].windows}` : 'no audio read');

  const q50 = a => [...a].sort((x, y) => x - y)[a.length >> 1];
  // E is D stopped at 20 s (every frame after it the same) with no sound: a
  // stopped renderer, and a silent track. It must not be given a shape.
  const eh = E.shape, allNull = eh.sections && [1, 5, 10, 20].every(w => eh.sections[w].r === null);
  check('E, frozen from 20 s: no swells, no calm, no half-life, and it says so',
    eh.still === true && !sh.still && Number.isNaN(eh.swells.perMin) && !eh.swells.at.length && Number.isNaN(eh.calm) && eh.halfLife === null,
    `still ${eh.still} (D ${sh.still}), frozen samples ${f2(q50(E.rows.filter(r => r.t > 21).map(r => r.motion)))}% at the median, swells ${f2(eh.swells.perMin)}, calm ${f2(eh.calm)}, half-life ${f2(eh.halfLife)}`);
  check('E, silent: no correlation with a sound that is not there', allNull,
    eh.sections ? [1, 5, 10, 20].map(w => `${w} s ${f2(eh.sections[w].r)}`).join(', ') : 'no audio track read');

  const bad = checks.filter(v => !v).length;
  console.log(bad ? `\n${bad} FAIL` : '\nall ok');
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
}

/**
 * For a harness: watch a clip and get the numbers back.
 *
 *   import { watchVideo } from './watch.mjs';
 *   const r = await watchVideo('/tmp/take.webm', { out: '/tmp/take', quiet: true });
 *   r.rows (one per sample: t, lum, dark, sat, motion, loud, cut), r.cuts, r.sync
 *
 * Throws a WatchError with the reason when the clip cannot be read.
 */
export async function watchVideo(input, options = {}) {
  Object.assign(opt, DEFAULTS, options, { input });
  return watch();
}

/**
 * Stretches where the picture stands still: at least `minSeconds` of samples
 * whose motion is under `below` (mean % change between samples). A light
 * show that stops is the fault an audience sees first, and the one
 * `npm run depth` caught as a six-second freeze of the plate; a film of a run
 * can name it by time.
 *
 * Why 0.005 and not "small". A frozen canvas gives the recorder no new frames,
 * the decoder repeats the last one, and the change is exactly zero; a still
 * picture through a lossy codec measured 0.000 to 0.002 in the self-test. The
 * slowest moving plate is orders above that. A bar near the slow plate would
 * call a calm look a freeze.
 */
export function freezes(r, { below = FREEZE_FLOOR, minSeconds = 2 } = {}) {
  const out = [];
  let start = -1;
  const rows = r.rows;
  for (let k = 1; k <= rows.length; k++) {
    const quiet = k < rows.length && rows[k].motion < below;
    if (quiet && start < 0) start = k;
    if (!quiet && start >= 0) {
      // From the last sample before the stillness to the first that moved
      // again (or the end of the clip): a picture still from 0.0 until it
      // changes at 2.0 is two seconds still, not the 1.9 between the first
      // and last identical samples.
      const from = rows[start - 1].t, to = k < rows.length ? rows[k].t : rows[k - 1].t + 1 / r.rate;
      if (to - from >= minSeconds - 1e-9) out.push({ from, to, seconds: to - from });
      start = -1;
    }
  }
  return out;
}

export { WatchError, FREEZE_FLOOR, STILL };

// Run as a command only when this file is the one node was given: a harness
// that imports it, or bundles it (gig.mjs goes through esbuild, where
// import.meta.url is the bundle's own path), must not start a watch.
const main = !!process.argv[1] && path.basename(process.argv[1]) === 'watch.mjs'
  && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (main) {
  try {
    parseArgs(process.argv.slice(2));
    if (opt.selftest) await selftest();
    else if (!opt.input) { printHelp(); process.exit(2); }
    else await watch();
  } catch (e) {
    if (!(e instanceof WatchError)) throw e;
    console.error(`watch: ${e.message}`);
    process.exit(e.code);
  }
}
