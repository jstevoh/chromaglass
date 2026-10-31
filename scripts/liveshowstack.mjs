/**
 * The pure half of `npm run liveshow -- --stack` (scripts/liveshow.mjs, PLAN.md
 * 37x-4d-1): the film it plays, the keystone it puts on the wall, and the
 * judgement of a decoded frame. Node only; the page's half is in liveshow.mjs.
 *
 * The film is drawn so that each way a stream can go wrong reads differently
 * (from the check's review, 2026-10-31): a green band across its top third, so
 * a frame turned upside down shows it at the bottom; a blue left half and an
 * orange right half below it, so a mirrored one swaps them and the halves say
 * the film is there at all; and a white bar that crosses the bottom third once
 * every 1.5 s, so a stream that copied one frame at Go live and stopped is
 * seen to have stopped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The film's three colours, in the camera's 8-bit RGB: none of them a plate's. */
export const FILM_BAND = [40, 200, 60];
export const FILM_LEFT = [30, 110, 240];
export const FILM_RIGHT = [240, 140, 20];
const BAR = [255, 255, 255];
const W = 640, H = 360, FRAMES = 45;
/** Where the bar's left edge is on frame `i`: across columns 2 to 13 of a 16-column grid, never the edge ones. */
const barX = (i) => Math.round((2 / 16) * W + ((i % FRAMES) / FRAMES) * (11 / 16) * W);

/**
 * The film as a file for Chromium's fake camera (`--use-file-for-fake-video-
 * capture`): Y4M, 4:2:0, full-range BT.601 ("C420jpeg"), 45 frames at 30 a
 * second, which the browser plays in a loop. Written once a run, beside the
 * system's other temporary files.
 */
export function filmFile() {
  const yuv = ([r, g, b]) => [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ].map(v => Math.max(0, Math.min(255, Math.round(v))));
  const colourAt = (i, x, y) => {
    if (y < H / 3) return FILM_BAND;
    if (y >= (2 * H) / 3 && x >= barX(i) && x < barX(i) + W / 16) return BAR;
    return x < W / 2 ? FILM_LEFT : FILM_RIGHT;
  };
  const cache = new Map();
  const yuvOf = (c) => { const k = c.join(); if (!cache.has(k)) cache.set(k, yuv(c)); return cache.get(k); };
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < FRAMES; i++) {
    const frame = Buffer.alloc(W * H * 1.5);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) frame[y * W + x] = yuvOf(colourAt(i, x, y))[0];
    const cw = W / 2, ch = H / 2;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const c = yuvOf(colourAt(i, 2 * x, 2 * y));
      frame[W * H + y * cw + x] = c[1];
      frame[W * H + cw * ch + y * cw + x] = c[2];
    }
    parts.push(Buffer.from('FRAME\n'), frame);
  }
  const file = path.join(os.tmpdir(), 'chromaglass-liveshow-film.y4m');
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

/**
 * A projector tilted up: the wall's top edge pulled in a fifth from each side
 * (corners top-left, top-right, bottom-right, bottom-left), everything else
 * a plain projector, as `wall`'s BASE has it.
 */
export const STACK_KEYSTONE = {
  flipX: false, flipY: false, corners: [0.2, 0, 0.8, 0, 1, 1, 0, 1],
  maskTop: 0, maskRight: 0, maskBottom: 0, maskLeft: 0, maskFeather: 0,
  gain: 1, gamma: 1, surfaces: [],
};

/** A flat RGBA frame (`__cgFrame`, scripts/frame.mjs, or a decoded one) as the 16 x 9 grid of mean colours `stackJudge` reads. */
export function gridOfPixels(px, w, h, cols = 16, rows = 9) {
  const grid = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x0 = Math.floor((gx * w) / cols), x1 = Math.floor(((gx + 1) * w) / cols);
    const y0 = Math.floor((gy * h) / rows), y1 = Math.floor(((gy + 1) * h) / rows);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    grid.push([r / n, g / n, b / n]);
  }
  return { w, h, cols, rows, grid };
}

const f0 = (v) => v.toFixed(0);
const rgb = (c) => `(${c.map(f0).join(', ')})`;
const mean = (cells) => [0, 1, 2].map(k => cells.reduce((a, c) => a + c[k], 0) / cells.length);
const bright = (c) => Math.max(...c) / 255;
const blue = (c) => c[2] > c[0] + 40 && c[2] > c[1] + 40;
const orange = (c) => c[0] > c[2] + 40 && c[0] > c[1] + 20;
const green = (c) => c[1] > c[0] + 40 && c[1] > c[2] + 40;
const apart = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** Dark enough to be a keystone's wedge, not a dim part of the film. */
const DARK = 0.08;

/** The grid's parts: the band's row, the halves' row, the corners and which of them are dark. */
function partsOf(f) {
  const { cols, rows, grid } = f;
  const at = (x, y) => grid[y * cols + x];
  const row = (y, x0, x1) => mean(Array.from({ length: x1 - x0 }, (_, i) => at(x0 + i, y)));
  // Rows 1 (inside the band, a third of 9 rows), 4 (the halves) and 7 (the bar's third).
  const band = row(1, 4, cols - 4);
  const L = row(4, 2, 6), R = row(4, cols - 6, cols - 2);
  const corners = { tl: at(0, 0), tr: at(cols - 1, 0), bl: at(0, rows - 1), br: at(cols - 1, rows - 1) };
  const dark = Object.fromEntries(Object.entries(corners).map(([k, c]) => [k, bright(c) < DARK]));
  return { at, cols, rows, band, L, R, corners, dark };
}

/**
 * Where the bar is: the column of the bar's third (row 7) whose cell is
 * whitest, among 2 to 13. Null when no cell there is near white.
 */
export function barColumn(f) {
  if (!f?.grid) return null;
  const p = partsOf(f);
  let best = null, most = 0;
  for (let x = 2; x <= 13; x++) {
    const c = p.at(x, 7), w = Math.min(...c);
    if (w > most) { most = w; best = x; }
  }
  return most > 100 ? best : null;
}

/**
 * One frame, judged against `ref` (the plate read in its own frame, when
 * given). `film`: the band green across the top and not the bottom, the
 * halves blue then orange below it (the right way up and the right way
 * round). `keystoned`: the two top corners black and the two bottom ones lit,
 * where the keystone puts them; against a ref, the dark corners must be the
 * ref's. `square`: no corner dark, each edge column's every cell at least 0.6
 * of the brightness of the cell two columns in and within 60 a channel of its
 * colour (no pillarbox, no wedge), and 1920 x 1080. `same`: the band and the
 * halves within 50 a channel of the ref's, so a stream of the camera itself,
 * not the mixer's graded film, is told apart.
 */
export function stackJudge(f, ref = null) {
  const none = { film: false, keystoned: false, square: false, same: false };
  if (!f || f.error || !f.grid) return { ...none, detail: `no frame: ${f?.error ?? 'none'}` };
  const p = partsOf(f);
  const bottomBand = mean([2, 3, 4, 11, 12, 13].map(x => p.at(x, p.rows - 1)));
  const film = green(p.band) && !green(bottomBand) && blue(p.L) && orange(p.R);
  const topDark = p.dark.tl && p.dark.tr && !p.dark.bl && !p.dark.br;
  const r = ref?.grid ? partsOf(ref) : null;
  const keystoned = topDark && (!r || Object.keys(p.dark).every(k => p.dark[k] === r.dark[k]));
  let edge = Infinity;
  for (let y = 0; y < p.rows; y++) for (const [x, inner] of [[0, 2], [p.cols - 1, p.cols - 3]]) {
    const c = p.at(x, y), d = p.at(inner, y);
    const ok = bright(c) >= 0.6 * bright(d) && apart(c, d) <= 60;
    if (!ok) edge = Math.min(edge, y);
  }
  const square = film && !Object.values(p.dark).some(Boolean) && edge === Infinity && f.w === 1920 && f.h === 1080;
  const same = !!r && apart(p.band, r.band) <= 50 && apart(p.L, r.L) <= 50 && apart(p.R, r.R) <= 50;
  const detail = `${f.w}x${f.h}${f.packets ? `, ${f.frames} frames decoded from ${f.packets} packets` : ''}; band ${rgb(p.band)}, halves ${rgb(p.L)} | ${rgb(p.R)}`
    + `; corners ${Object.entries(p.corners).map(([k, c]) => `${k} ${rgb(c)}`).join(' ')}`
    + `; edge columns ${edge === Infinity ? 'the film\'s in every row' : `not the film's from row ${edge}`}`
    + (r ? `; the plate's own band ${rgb(r.band)}, halves ${rgb(r.L)} | ${rgb(r.R)}` : '');
  return { film, keystoned, square, same, detail };
}
