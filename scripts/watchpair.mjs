/**
 * Compare two films before and after a change (`npm run watch -- --before A --after B --out D`, PLAN 47x-2).
 *
 * Watches both clips with the same options into `<out>/before` and `<out>/after`,
 * ranks what changed in just-noticeable steps beside what held (`diff.md`),
 * stacks the two timelines (`diff-timeline.png`) and sets frames at matched
 * times side by side (`pairs.png`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { watchVideo, writePng, label } from './watch.mjs';
import { compareReads } from './watchwords.mjs';

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

/** Decode an 8-bit RGB/RGBA PNG (such as `writePng` writes) into `{ w, h, rgb }`. */
function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) {
    throw new Error(`not a PNG: ${file}`);
  }
  let pos = 8;
  let w = 0, h = 0, bitDepth = 8, colorType = 2;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG format (${bitDepth}-bit type ${colorType}): ${file}`);
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const unfilt = Buffer.alloc(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? unfilt[dst + x - ch] : 0;
      const b = y > 0 ? unfilt[dst - stride + x] : 0;
      const c = y > 0 && x >= ch ? unfilt[dst - stride + x - ch] : 0;
      const v = raw[src + x];
      unfilt[dst + x] = (
        f === 0 ? v :
        f === 1 ? v + a :
        f === 2 ? v + b :
        f === 3 ? v + ((a + b) >> 1) :
        v + paeth(a, b, c)
      ) & 0xff;
    }
  }
  if (ch === 3) return { w, h, rgb: unfilt };
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    rgb[i * 3] = unfilt[p];
    rgb[i * 3 + 1] = unfilt[p + 1];
    rgb[i * 3 + 2] = unfilt[p + 2];
  }
  return { w, h, rgb };
}

/** Bilinear-resize an RGB24 buffer from `sw×sh` to `dw×dh`. */
function resizeRgb(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return src;
  const dst = Buffer.alloc(dw * dh * 3);
  for (let y = 0; y < dh; y++) {
    const sy = ((y + 0.5) * sh) / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < dw; x++) {
      const sx = ((x + 0.5) * sw) / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      const i00 = (y0 * sw + x0) * 3, i10 = (y0 * sw + x1) * 3;
      const i01 = (y1 * sw + x0) * 3, i11 = (y1 * sw + x1) * 3;
      const d = (y * dw + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[d + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
  return dst;
}

/** Stack the two timeline PNGs vertically, labelled BEFORE and AFTER. */
function writeDiffTimeline(file, beforePath, afterPath) {
  const tb = readPng(beforePath);
  const ta = readPng(afterPath);
  const SEP = 6;
  const W = Math.max(tb.w, ta.w);
  const H = tb.h + SEP + ta.h;
  const img = new Uint8Array(W * H * 3).fill(18);
  for (let y = 0; y < tb.h; y++) {
    img.set(tb.rgb.subarray(y * tb.w * 3, (y + 1) * tb.w * 3), y * W * 3);
  }
  for (let y = tb.h; y < tb.h + SEP; y++) {
    for (let x = 0; x < W; x++) img.set([64, 64, 64], (y * W + x) * 3);
  }
  for (let y = 0; y < ta.h; y++) {
    img.set(ta.rgb.subarray(y * ta.w * 3, (y + 1) * ta.w * 3), ((tb.h + SEP + y) * W + 0) * 3);
  }
  label(img, W, H, Math.max(4, tb.w - 60), 4, 'BEFORE', 1);
  label(img, W, H, Math.max(4, ta.w - 54), tb.h + SEP + 4, 'AFTER', 1);
  writePng(file, W, H, img);
}

/** Pick matched-time tile pairs and lay them out before beside after within 1568 px. */
function writePairs(file, b, a) {
  const bTiles = b.tiles ?? [];
  const aTiles = a.tiles ?? [];
  if (!bTiles.length || !aTiles.length) return;
  const bTime = t => b.rows[t.k]?.t ?? 0;
  const aTime = t => a.rows[t.k]?.t ?? 0;
  const span = Math.min(b.span || bTime(bTiles.at(-1)), a.span || aTime(aTiles.at(-1))) || 1;
  const N = Math.min(12, Math.max(1, Math.min(bTiles.length, aTiles.length)));
  const closest = (tiles, timeFn, target) => {
    let best = tiles[0], bd = Math.abs(timeFn(tiles[0]) - target);
    for (const t of tiles) {
      const d = Math.abs(timeFn(t) - target);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  };

  const pairs = [];
  for (let i = 0; i < N; i++) {
    const t = ((i + 0.5) / N) * span;
    const bt = closest(bTiles, bTime, t);
    const at = closest(aTiles, aTime, t);
    pairs.push({ t, bt, at, bStamp: stamp(bTime(bt)), aStamp: stamp(aTime(at)) });
  }

  const MAX = 1568, INNER = 2, GAP = 8;
  const aspect = bTiles[0].W / Math.max(1, bTiles[0].H);
  let best = null;
  for (let cols = 1; cols <= Math.min(3, N); cols++) {
    const rws = Math.ceil(N / cols);
    const maxW = Math.floor((MAX - GAP * (cols - 1) - INNER * cols) / (2 * cols));
    const maxH = Math.floor((MAX - GAP * (rws - 1)) / rws);
    const tw = Math.floor(Math.min(maxW, maxH * aspect));
    if (!best || tw > best.tw) best = { cols, rws, tw };
  }
  const tw = Math.max(120, best.tw - (best.tw % 2));
  const th = Math.max(68, Math.round(tw / aspect / 2) * 2);
  const pw = tw * 2 + INNER;
  const W = best.cols * pw + (best.cols - 1) * GAP;
  const H = best.rws * th + (best.rws - 1) * GAP;
  const img = new Uint8Array(W * H * 3).fill(32);
  const fontScale = tw >= 260 ? 2 : 1;

  pairs.forEach((p, i) => {
    const col = i % best.cols;
    const row = Math.floor(i / best.cols);
    const x0 = col * (pw + GAP);
    const y0 = row * (th + GAP);
    const bPx = resizeRgb(p.bt.px, p.bt.W, p.bt.H, tw, th);
    const aPx = resizeRgb(p.at.px, p.at.W, p.at.H, tw, th);
    for (let y = 0; y < th; y++) {
      img.set(bPx.subarray(y * tw * 3, (y + 1) * tw * 3), ((y0 + y) * W + x0) * 3);
      img.set(aPx.subarray(y * tw * 3, (y + 1) * tw * 3), ((y0 + y) * W + x0 + tw + INNER) * 3);
    }
    label(img, W, H, x0 + 4, y0 + 4, `BEFORE ${p.bStamp}`, fontScale);
    label(img, W, H, x0 + tw + INNER + 4, y0 + 4, `AFTER ${p.aStamp}`, fontScale);
  });

  writePng(file, W, H, img);
}

/**
 * Watch `before` and `after` with the same options into `opts.out/before` and
 * `opts.out/after`, compare them in just-noticeable steps, and write
 * `diff.md`, `diff-timeline.png` and `pairs.png`.
 */
export async function watchPair(before, after, opts = {}) {
  const name = `${path.basename(String(before)).replace(/[^\w.-]+/g, '_')}_vs_${path.basename(String(after)).replace(/[^\w.-]+/g, '_')}`.slice(0, 60);
  const out = path.resolve(opts.out || path.join(os.tmpdir(), 'chromaglass-watch-pair', name));
  fs.mkdirSync(out, { recursive: true });

  const shared = { ...opts, vs: '', keep: '', before: '', after: '' };
  const b = await watchVideo(before, { ...shared, out: path.join(out, 'before') });
  const a = await watchVideo(after, { ...shared, out: path.join(out, 'after') });
  const diff = compareReads(b, a);

  const md = [
    '# What changed',
    '',
    `- before: ${before}`,
    `- after: ${after}`,
    '',
    ...diff.lines,
    '',
    '## Before in words',
    '',
    ...(b.words?.lines ?? []),
    '',
    '## After in words',
    '',
    ...(a.words?.lines ?? []),
  ];
  fs.writeFileSync(path.join(out, 'diff.md'), md.join('\n') + '\n');

  writeDiffTimeline(path.join(out, 'diff-timeline.png'), b.timeline, a.timeline);
  writePairs(path.join(out, 'pairs.png'), b, a);

  return { before: b, after: a, diff, out };
}
