/**
 * The pure half of `npm run liveshow -- --stack` (scripts/liveshow.mjs, PLAN.md
 * 37x-4d-1): the film it plays, the keystone it puts on the wall, and the
 * judgement of a decoded frame. Node only; the page's half is in liveshow.mjs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The film's two halves, in the camera's 8-bit RGB: a blue and an orange no plate makes. */
export const FILM_LEFT = [30, 110, 240];
export const FILM_RIGHT = [240, 140, 20];

/**
 * The film as a file for Chromium's fake camera (`--use-file-for-fake-video-
 * capture`): Y4M, 4:2:0, full-range BT.601 ("C420jpeg"), two frames that are
 * the same, which the browser plays in a loop. Written once a run, beside the
 * system's other temporary files.
 */
export function filmFile() {
  const W = 640, H = 360;
  const yuv = ([r, g, b]) => [
    0.299 * r + 0.587 * g + 0.114 * b,
    128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    128 + 0.5 * r - 0.418688 * g - 0.081312 * b,
  ].map(v => Math.max(0, Math.min(255, Math.round(v))));
  const L = yuv(FILM_LEFT), R = yuv(FILM_RIGHT);
  const frame = Buffer.alloc(W * H * 1.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) frame[y * W + x] = (x < W / 2 ? L : R)[0];
  const cw = W / 2, ch = H / 2;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const c = x < cw / 2 ? L : R;
    frame[W * H + y * cw + x] = c[1];
    frame[W * H + cw * ch + y * cw + x] = c[2];
  }
  const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`);
  const mark = Buffer.from('FRAME\n');
  const file = path.join(os.tmpdir(), 'chromaglass-liveshow-film.y4m');
  fs.writeFileSync(file, Buffer.concat([head, mark, frame, mark, frame]));
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

/** A flat RGBA frame (`__cgFrame`, scripts/frame.mjs) as the 16 x 9 grid of mean colours `stackJudge` reads. */
export function gridOfPixels(px, w, h, cols = 16, rows = 9) {
  const grid = [];
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x0 = Math.floor((gx * w) / cols), x1 = Math.floor(((gx + 1) * w) / cols);
    const y0 = Math.floor((gy * h) / rows), y1 = Math.floor(((gy + 1) * h) / rows);
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    grid.push([r / n, g / n, b / n]);
  }
  return { w, h, cols, rows, grid, frames: 1, packets: 0 };
}

const f0 = (v) => v.toFixed(0);
const rgb = (c) => `(${c.map(f0).join(', ')})`;
const mean = (cells) => [0, 1, 2].map(k => cells.reduce((a, c) => a + c[k], 0) / cells.length);
const bright = (c) => Math.max(...c) / 255;
const blue = (c) => c[2] > c[0] + 40;
const orange = (c) => c[0] > c[2] + 40;
const apart = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
/** Dark enough to be a keystone's wedge, not a dim part of the film. */
const DARK = 0.08;

/**
 * One decoded frame, judged. `film`: the film's two halves across the middle
 * row, a blue beside an orange (either way round: a camera may be mirrored).
 * `keystoned`: the two corners on one edge black and the two on the other
 * lit. `square`: every corner lit, the colour of its own half, and each of
 * the 16 columns the same colour in its top cell as in its bottom one, within
 * 40 of 255 a channel. `same`: the middle row's halves those of `ref`, the
 * plate read in its own frame, within 50 a channel.
 */
export function stackJudge(f, ref = null) {
  if (!f || f.error || !f.grid) return { film: false, keystoned: false, square: false, same: false, detail: `no frame: ${f?.error ?? 'none'}` };
  const { cols, rows, grid } = f;
  const at = (x, y) => grid[y * cols + x];
  const mid = rows >> 1;
  const halves = (g) => {
    const row = (x0, x1) => mean(Array.from({ length: x1 - x0 }, (_, i) => g[mid * cols + x0 + i]));
    return [row(2, 6), row(cols - 6, cols - 2)];
  };
  const [L, R] = halves(grid);
  const film = (blue(L) && orange(R)) || (orange(L) && blue(R));
  const corners = { tl: at(0, 0), tr: at(cols - 1, 0), bl: at(0, rows - 1), br: at(cols - 1, rows - 1) };
  const dark = Object.fromEntries(Object.entries(corners).map(([k, c]) => [k, bright(c) < DARK]));
  const keystoned = (dark.tl && dark.tr && !dark.bl && !dark.br) || (!dark.tl && !dark.tr && dark.bl && dark.br);
  const ownHalf = (c, half) => (blue(half) ? blue(c) : orange(c));
  const cornersOwn = ownHalf(corners.tl, L) && ownHalf(corners.bl, L) && ownHalf(corners.tr, R) && ownHalf(corners.br, R);
  const skew = Math.max(...Array.from({ length: cols }, (_, x) => apart(at(x, 0), at(x, rows - 1))));
  const square = film && !Object.values(dark).some(Boolean) && cornersOwn && skew <= 40;
  const [rL, rR] = ref?.grid ? halves(ref.grid) : [null, null];
  const same = !!rL && apart(L, rL) <= 50 && apart(R, rR) <= 50;
  const detail = `${f.w}x${f.h}${f.packets ? `, ${f.frames} frames from the last keyframe of ${f.packets} packets` : ''}; middle ${rgb(L)} | ${rgb(R)}`
    + `; corners ${Object.entries(corners).map(([k, c]) => `${k} ${rgb(c)}`).join(' ')}; worst column top against bottom ${f0(skew)}`
    + (rL ? `; the plate's own middle ${rgb(rL)} | ${rgb(rR)}` : '');
  return { film, keystoned, square: square && f.w === 1920 && f.h === 1080, same, detail };
}
