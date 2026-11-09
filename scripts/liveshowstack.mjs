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
 * Row 7 of the 16 x 9 grid (the bar's third) on film frame `i`, as the grid
 * reads it: each cell the half's colour mixed with the bar's white by how
 * much of the cell the bar covers. For `barMovesProof`, so it reads made-up
 * frames through the same `barColumnOfRow` the real line reads decoded ones.
 */
export function filmRow(i) {
  const cw = W / 16, x0 = barX(i), row = [];
  for (let x = 0; x < 16; x++) {
    const c = Math.max(0, Math.min(x0 + cw, (x + 1) * cw) - Math.max(x0, x * cw)) / cw;
    const base = x < 8 ? FILM_LEFT : FILM_RIGHT;
    row.push(base.map((v, k) => v * (1 - c) + BAR[k] * c));
  }
  return row;
}

/**
 * Where the bar is in one row of 16 cells (row 7, the bar's third): the
 * column whose cell is whitest, among 2 to 13. Null when no cell there is
 * near white.
 */
export function barColumnOfRow(row) {
  let best = null, most = 0;
  for (let x = 2; x <= 13; x++) {
    const w = Math.min(...row[x]);
    if (w > most) { most = w; best = x; }
  }
  return most > 100 ? best : null;
}

/**
 * Whether a stream's bar moves with the film, from where it sat on every
 * frame decoded (`trail`: `{ ms, col }` in decode order, `col` null where no
 * bar was found).
 *
 * Why every frame and not the first and the last (PLAN.md 37x-4d-7): the bar
 * loops, so two frames a whole number of loops apart read the same column
 * on a stream that is moving. Red once that way on the Mac (moiré pack PR,
 * fifth shard: "bar at column 6 then 6, 2.45 s apart", green on the re-run).
 * The loop is 45 frames of the fake camera's, and the camera's pace is
 * Chromium's, not the packets' clock, so no span can be chosen that is never
 * a whole number of loops. A frozen stream instead shows the bar in one
 * column on every frame. Three things are asked, each for a reason the
 * review found (2026-11-09):
 *  - a second or more between the first frame with the bar and the last;
 *  - the bar in two or more columns in each half of that span, since two
 *    anywhere would pass a stream that moved for a moment after Go live and
 *    then sent one frame for ever, the fault this line is for (a stream that
 *    froze in its second half can still pass: the halves catch a freeze
 *    before the middle);
 *  - two or more columns of travel forward, with the film, summed over its
 *    steps from column to column (each step taken round the loop's twelve
 *    columns the short way, so the loop's return from 13 to 2 is one
 *    forward): a still frame whose bar sits across two cells can read the
 *    one, then the other, as the encoder's noise changes, and that flicker
 *    goes back as often as forward, so it sums to one column at most. A
 *    moving stream's flicker as the bar crosses a cell edge cancels the
 *    same way and leaves the film's travel.
 * At the slowest rate a moving stream has been met at (about five frames a
 * second, GitHub's Mac VM's canvas readback) the bar goes on a column and a
 * half a frame, so half of a second-long span holds two or three frames in
 * two or more columns.
 */
export function barMoves(trail, minSpanMs = 1000) {
  const seen = trail.filter(t => t.col !== null);
  const missing = trail.length - seen.length;
  if (seen.length < 2) return { ok: false, detail: `the bar was found on ${seen.length} of ${trail.length} frames decoded` };
  const t0 = seen[0].ms, span = seen[seen.length - 1].ms - t0, mid = t0 + span / 2;
  const columns = (part) => new Set(part.map(t => t.col)).size;
  const early = columns(seen.filter(t => t.ms < mid)), late = columns(seen.filter(t => t.ms >= mid));
  const runs = [];
  for (const t of seen) if (runs[runs.length - 1] !== t.col) runs.push(t.col);
  let travel = 0;
  for (let i = 1; i < runs.length; i++) travel += ((runs[i] - runs[i - 1] + 12 + 5) % 12) - 5;
  const path = runs.length > 24 ? `${runs.slice(0, 24).join(' ')} …` : runs.join(' ');
  const ok = span >= minSpanMs && early >= 2 && late >= 2 && travel >= 2;
  return {
    ok,
    detail: `bar in ${early} column${early === 1 ? '' : 's'} in the first half and ${late} in the second, ${travel} column${Math.abs(travel) === 1 ? '' : 's'} of travel,`
      + ` ${seen.length} frames over ${(span / 1000).toFixed(2)} s${missing ? ` (${missing} more with no bar)` : ''}; columns ${path}`,
  };
}

/**
 * The judgement above against streams made up from the film, so the cloud
 * (where the real line is skipped) proves it tells moving from frozen, each
 * frame's column read from `filmRow` by `barColumnOfRow` as the real line
 * reads it. For camera paces of 10 to 60 frames a second, stream rates of 5
 * and 30, spans of 1 to 4 s and three starting frames, every moving stream
 * passes, and red are: a frozen one, one that froze a third in, one 0.9 s
 * long, one with no bar on any frame, and a frozen one whose bar flickers
 * between the two cells it straddles. `aliased` counts the moving streams
 * the old first-against-last rule read as still, so the cases include the
 * one met on the Mac.
 */
export function barMovesProof() {
  const colOf = (f) => barColumnOfRow(filmRow(f));
  const trail = (camFps, streamFps, spanS, phase, frozeAt = Infinity) => {
    const out = [];
    for (let k = 0; k * (1000 / streamFps) <= spanS * 1000 + 1e-6; k++) {
      const ms = k * (1000 / streamFps), held = Math.min(ms, frozeAt * 1000);
      out.push({ ms, col: colOf(Math.floor((held / 1000) * camFps + phase)) });
    }
    return out;
  };
  const wrong = [];
  let cases = 0, aliased = 0;
  for (let cam = 10; cam <= 60; cam += 0.5) for (const fps of [5, 30]) for (let span = 1; span <= 4; span += 0.05) for (const phase of [0, 16, 40]) {
    cases++;
    const at = `camera ${cam} fps, stream ${fps}, ${span.toFixed(2)} s, from film frame ${phase}`;
    const t = trail(cam, fps, span, phase);
    if (!barMoves(t).ok) wrong.push(`moving: ${at}`);
    if (t[0].col === t[t.length - 1].col) aliased++;
    if (barMoves(trail(cam, fps, span, phase, 0)).ok) wrong.push(`frozen: ${at}`);
    if (barMoves(trail(cam, fps, span, phase, span / 3)).ok) wrong.push(`froze a third in: ${at}`);
    if (barMoves(trail(cam, fps, span, phase).map(p => ({ ...p, col: null }))).ok) wrong.push(`no bar: ${at}`);
    if (barMoves(trail(cam, fps, span, phase, 0).map((p, k) => ({ ...p, col: p.col + (k % 3 === 1 ? 1 : 0) }))).ok) wrong.push(`frozen, flickering: ${at}`);
  }
  for (let cam = 10; cam <= 60; cam += 5) for (const fps of [5, 30]) {
    cases++;
    if (barMoves(trail(cam, fps, 0.9, 0)).ok) wrong.push(`moving, 0.9 s: camera ${cam} fps, stream ${fps}`);
  }
  return { ok: wrong.length === 0 && aliased > 0, cases, aliased, wrong };
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
