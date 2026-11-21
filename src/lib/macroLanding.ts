/**
 * Where a closeup coming in on bare glass goes instead (PLAN QA-32).
 *
 * What was reported (the owner, 2026-10-29, again 2026-11-14): "this closeup
 * button doesn't seem to do anything besides make the canvas black/empty".
 * The Close-up button, the M key, the zoom and the phone's pinch all bring the
 * closeup in on the camera's mode, and the default mode is Hold, aimed at the
 * middle of the plate. Hold sat on its aim and nowhere else, so on a plate
 * whose middle was bare (a look that pours in pools, a middle a finger had
 * swept, a plate between pours) the frame was four times the size of nothing:
 * the exposure, kept under what the frame holds, had nothing to expose, and
 * the picture was the plate's black ground. Measured in the app (software
 * WebGPU, one pool a fifth of the way across a cleared plate): the frame's
 * mean 1.4 of 255 and no pixel lit, for as long as it was in.
 *
 * The closeup is the liquid seen closer, so coming in it looks for liquid when
 * its aim shows none, as a person at a microscope moves the slide until
 * something is under the lens; once there, Hold holds and Follow rides, as
 * before. The camera (`MacroCamera.aimed` in macroCamera.ts) decides when to
 * ask; these functions only read the field. They live beside the camera, not
 * in it, because the camera file is near the size the repo warns at, and they
 * are plain reads of a typed array that need nothing of the camera's state.
 *
 * Called only on the frames a closeup is coming in (about a second, while the
 * zoom eases from the plate to the frame asked for), never on a held shot. The
 * summed-area table is kept between calls so those frames make no new arrays.
 */
import type { MacroField } from './macroCamera';
import type { VisualizerSettings } from '../types';

/**
 * A held frame is bare glass when the dye in it is under this share of the
 * plate's own average. A thin wash reads a fifth to a half of the average and
 * is drawn, since the exposure comes down to what the frame holds; bare glass
 * reads 0.
 */
export const BARE_SHARE = 0.1;
/**
 * A pool, to the landing, is a box about a pool's size holding at least this
 * share of the fullest such box on the plate: enough to pass over a thin wash
 * and the faint fringe of a pool, low enough that a small pool near the aim
 * counts against a big one across the plate (the owner asked for the nearest).
 */
export const POOL_SHARE = 0.25;
/** A plate whose average dye is under this has nothing to land on yet. */
export const EMPTY_PLATE = 1e-3;
/**
 * The zoom from which the closeup is fully in and its landing stands. The
 * same 2x as `MACRO_FULL_ZOOM` in src/sim/constants.ts, where the closeup's
 * look finishes fading in; written here because src/lib does not import
 * src/sim, and `npm run closeupland` checks the two agree.
 */
export const LAND_FULL_ZOOM = 2;
/**
 * How long a closeup coming in keeps asking, in seconds of liquid on the plate.
 * The zoom alone does not end it: a pinch let go at 1.6x or the slider left at
 * 1.5x never reaches LAND_FULL_ZOOM, and a closeup still pending there landed
 * whenever its pool later flowed out of the frame, a cut in the middle of a
 * held shot minutes on (the review of this port measured it: Hold at 1.5x on
 * the middle for ten seconds, then across the plate in one frame). Long enough
 * for the zoom's own ease in, which is most of a second.
 */
export const LAND_SECONDS = 1.5;
/** The zoom the Close-up press goes to (`MACRO_PRESET_ZOOM`, checked the same way). */
export const CLOSEUP_PRESS_ZOOM = 4;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** The plate's average dye inside a margin of `margin` cells, on every third cell. */
export function plateMean(field: MacroField, margin: number): number {
  const { density, size } = field;
  const m = Math.floor(margin);
  let sum = 0, n = 0;
  for (let j = m; j < size - m; j += 3) {
    for (let i = m; i < size - m; i += 3) { const d = density[i + j * size]; if (d > 0) sum += d; n++; }
  }
  return n > 0 ? sum / n : 0;
}

/** The average dye in a frame of half-size (hx, hy) cells about (x, y), on every second cell. */
export function frameMean(field: MacroField, x: number, y: number, hx: number, hy: number): number {
  const { density, size } = field;
  const x0 = Math.max(0, Math.floor(x - hx)), x1 = Math.min(size - 1, Math.ceil(x + hx));
  const y0 = Math.max(0, Math.floor(y - hy)), y1 = Math.min(size - 1, Math.ceil(y + hy));
  let sum = 0, n = 0;
  for (let j = y0; j <= y1; j += 2) {
    for (let i = x0; i <= x1; i += 2) { const d = density[i + j * size]; if (d > 0) sum += d; n++; }
  }
  return n > 0 ? sum / n : 0;
}

let sat = new Float64Array(0);
let boxes = new Float64Array(0);
let labels = new Int32Array(0);
let stack = new Int32Array(0);
let satW = 0;

/** The mean dye in a (hx, hy) half-cell box about (cx, cy), from the summed-area table `landing` last built. */
function boxMean(cx: number, cy: number, hx: number, hy: number, size: number): number {
  const W = satW;
  const x0 = clamp(Math.round(cx - hx), 0, size), x1 = clamp(Math.round(cx + hx), 0, size);
  const y0 = clamp(Math.round(cy - hy), 0, size), y1 = clamp(Math.round(cy + hy), 0, size);
  const area = (x1 - x0) * (y1 - y0);
  return area > 0 ? (sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]) / area : 0;
}

/**
 * The nearest pool to the aim (ax, ay), and the frame centred on the dye
 * there. Grid cells; the
 * frame is (hx, hy) half-cells, and its middle stays `margin` cells off the
 * walls. Writes the answer into `out`.
 *
 * Nearest rather than fullest, so a look whose middle has a little in it moves
 * no further than it must (the owner's choice, 2026-11-14); a pool and not a
 * fringe (POOL_SHARE), so it lands on a subject. The frame is the one asked for (the zoom it is
 * going to), not the one easing in from the plate.
 */
export function landing(field: MacroField, ax: number, ay: number, hx: number, hy: number, margin: number,
  out: { x: number; y: number }): void {
  const { density, size } = field;
  const W = size + 1;
  if (sat.length < W * W) sat = new Float64Array(W * W);
  satW = W;
  for (let i = 0; i < W; i++) sat[i] = 0;
  for (let j = 0; j < size; j++) {
    let run = 0;
    sat[(j + 1) * W] = 0;
    for (let i = 0; i < size; i++) {
      const d = density[i + j * size];
      run += d > 0 ? d : 0;
      sat[(j + 1) * W + i + 1] = sat[j * W + i + 1] + run;
    }
  }
  // Centres the frame can sit on: inside the plate, and its middle off the walls.
  const xLo0 = Math.max(hx, margin), xHi0 = size - Math.max(hx, margin);
  const yLo0 = Math.max(hy, margin), yHi0 = size - Math.max(hy, margin);
  const xLo = xLo0 <= xHi0 ? xLo0 : size / 2, xHi = xLo0 <= xHi0 ? xHi0 : size / 2;
  const yLo = yLo0 <= yHi0 ? yLo0 : size / 2, yHi = yLo0 <= yHi0 ? yHi0 : size / 2;
  /*
    The nearest pool, measured to the pool. The first build took the nearest
    frame holding at least half of what the fullest frame holds, and measured
    to that frame's middle; a 16:10 frame reaches a pool beside the aim from
    nearer its middle than one above it, so it could go to the farther pool:
    on the owner's film (2026-11-14) it picked the blue pool over the orange
    one, and asked, the owner said "go to the nearest pool". So the plate is
    read in boxes about a pool's size (a third of the frame's shorter half), a
    box holding at least POOL_SHARE of the fullest box is liquid (a thin wash
    or a pool's fringe is not), the touching boxes of liquid are one pool, and
    the pool whose middle (its dye's centroid) is nearest the aim wins. To the
    middle and not the near edge, because two pools the same distance off are
    told apart by where they sit, as a person sees them, not by which spread
    a cell further. The arrays are kept between calls.
  */
  const s = Math.max(1, Math.min(hx, hy) / 3);
  const stride = Math.max(1, s / 2);
  const n = Math.max(1, Math.floor((size - 2 * s) / stride) + 1);
  if (boxes.length < n * n) { boxes = new Float64Array(n * n); labels = new Int32Array(n * n); stack = new Int32Array(n * n); }
  let best = 0;
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) { const v = boxMean(s + a * stride, s + b * stride, s, s, size); boxes[a + b * n] = v; if (v > best) best = v; }
  }
  const floor = POOL_SHARE * best;
  labels.fill(0, 0, n * n);
  let px = ax, py = ay, near = Infinity;
  for (let k = 0; k < n * n; k++) {
    if (labels[k] !== 0 || !(boxes[k] >= floor) || !(best > 0)) continue;
    // One pool: every touching box of liquid, weighed by the dye it holds.
    let top = 0, w = 0, wx = 0, wy = 0;
    stack[top++] = k; labels[k] = 1;
    while (top > 0) {
      const c = stack[--top], a = c % n, b = (c - a) / n, v = boxes[c];
      w += v; wx += v * (s + a * stride); wy += v * (s + b * stride);
      if (a > 0 && labels[c - 1] === 0 && boxes[c - 1] >= floor) { labels[c - 1] = 1; stack[top++] = c - 1; }
      if (a < n - 1 && labels[c + 1] === 0 && boxes[c + 1] >= floor) { labels[c + 1] = 1; stack[top++] = c + 1; }
      if (b > 0 && labels[c - n] === 0 && boxes[c - n] >= floor) { labels[c - n] = 1; stack[top++] = c - n; }
      if (b < n - 1 && labels[c + n] === 0 && boxes[c + n] >= floor) { labels[c + n] = 1; stack[top++] = c + n; }
    }
    const cx = wx / w, cy = wy / w, dist = Math.hypot(cx - ax, cy - ay);
    if (dist < near) { near = dist; px = cx; py = cy; }
  }
  px = clamp(px, xLo, xHi); py = clamp(py, yLo, yHi);
  // And the frame centred on the dye it holds there, twice, as a cut lands on
  // a drop's middle (`recenter`): the boxes are coarse, the dye is not.
  for (let pass = 0; pass < 2; pass++) {
    const x0 = clamp(Math.floor(px - hx), 0, size - 1), x1 = clamp(Math.ceil(px + hx), 0, size - 1);
    const y0 = clamp(Math.floor(py - hy), 0, size - 1), y1 = clamp(Math.ceil(py + hy), 0, size - 1);
    let sum = 0, sx = 0, sy = 0;
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) { const d = density[i + j * size]; if (d > 0) { sum += d; sx += d * i; sy += d * j; } }
    }
    if (!(sum > 0)) break;
    px = clamp(sx / sum, xLo, xHi); py = clamp(sy / sum, yLo, yHi);
  }
  out.x = px; out.y = py;
}

/**
 * A closeup's landing: whether it still has to check that its aim shows any
 * liquid (`pending`, set as it comes in), and where it landed instead when it
 * did not (grid cells, NaN while it sits on its aim); how long it has asked
 * (`age`, seconds), and whether the place it settled on has been handed back
 * as the aim (`told`). Owned by the camera.
 */
export interface Landing { pending: boolean; x: number; y: number; age: number; told: boolean; out: { x: number; y: number } }

export function newLanding(): Landing {
  return { pending: true, x: NaN, y: NaN, age: 0, told: false, out: { x: 0, y: 0 } };
}

/** Coming in again (`pending` true), or a hand on the camera (false): either way, back on the aim. */
export function clearLanding(l: Landing, pending: boolean): void {
  l.pending = pending; l.x = NaN; l.y = NaN; l.age = 0; l.told = false;
}

/**
 * Where the closeup settled, in plate uv, once and only once, the frame its
 * asking ends with a landing: handed to the app as the aim (`onLand` in the
 * camera's options), so the aim is where the camera is looking.
 *
 * Without it the landing was a private place inside the camera with the aim
 * left on the bare middle, and anything that moves the aim from the stored
 * aim (the arrows in Hold, the Aim sliders, a MIDI knob on them, Evolve's
 * glide of the aim) moved it from there: one Right tap after landing took the
 * frame from the pool at (0.22, 0.30) back to (0.54, 0.50), bare glass, within
 * a second (the review of this port). The QA-12 rule is the same one: the aim
 * is a setting, so the sliders say where it is.
 */
export function settledLanding(l: Landing, size: number): { x: number; y: number } | null {
  if (l.pending || l.told || !Number.isFinite(l.x) || !(size > 0)) return null;
  l.told = true;
  l.out.x = clamp(l.x / size, 0, 1); l.out.y = clamp(l.y / size, 0, 1);
  return l.out;
}

/**
 * One frame of Hold or Follow coming in, aimed at (ax, ay) grid cells, with
 * the frame (spanX, spanY) of the plate at `zoom`. `follow` is the bead Follow
 * rides (NaN before it has one). Moves `l.x, l.y` onto liquid when the frame
 * on the aim (or on the bead) is bare glass, and returns true on the frame it
 * first lands, so the camera cuts there rather than easing across the plate.
 */
export function steerLanding(l: Landing, field: MacroField, ax: number, ay: number,
  frame: { spanX: number; spanY: number; zoom: number }, followX: number, followY: number, margin: number,
  step: number): boolean {
  if (!l.pending) return false;
  const plate = plateMean(field, margin);
  // An empty plate waits on the aim, still pending, for the first pour.
  if (!(plate > EMPTY_PLATE)) return false;
  l.age += step;
  const { size } = field;
  const hx = clamp(frame.spanX / Math.max(1, frame.zoom), 0, 1) * 0.5 * size;
  const hy = clamp(frame.spanY / Math.max(1, frame.zoom), 0, 1) * 0.5 * size;
  /*
    Asked again on every frame of a zoom still on its way in. A pinch or the
    slider comes in from 1x a notch at a time, and at 1.01x the frame is nearly
    the whole plate and holds the plate's average: asked only then, it was
    never asked again, and the pinch went on into the bare middle (a ramp from
    1.01x to 4x over a second ended on 0.5, 0.5). Fully in, the answer stands.
  */
  if (frame.zoom >= LAND_FULL_ZOOM || l.age >= LAND_SECONDS) l.pending = false;
  const had = Number.isFinite(l.x);
  const atX = Number.isFinite(followX) ? followX : had ? l.x : ax;
  const atY = Number.isFinite(followY) ? followY : had ? l.y : ay;
  /*
    And once landed, landed again on each frame of the way in: a frame landed
    at 1.3x is centred for 1.3x, and a pool by the wall sits where that wide
    frame was held off the wall, not where a 4x frame is (the same ramp in
    Hold: 0.42 of a half-frame off at 4x). The first landing is a cut; these
    follow it in, eased like any move.
  */
  if (!had && frameMean(field, atX, atY, hx, hy) >= BARE_SHARE * plate) return false;
  landing(field, ax, ay, hx, hy, margin, l.out);
  l.x = l.out.x; l.y = l.out.y;
  return !had;
}

/** Whether the closeup is in: the same reading as `macroZoomOf(s) > 1.05` (src/sim/constants.ts). */
export function closeupIn(s: { macroMode?: boolean; macroZoom?: number }): boolean {
  return s.macroMode === true || (s.macroZoom ?? 1) > 1.05;
}

/**
 * The one press in and out of the closeup: the desk's Close-up button, the M
 * key, a pad, the phone's Zoom. In by the zoom, as the slider and the pinch go
 * in, with the flag riding along; out to the plate with both. The desk button
 * used to flip the flag alone, so the plate went to 4x while the Macro Zoom
 * knob beside it still read 1.00x (the owner's screenshot, 2026-10-29), and a
 * look carrying a zoom with the flag off was in the closeup with the button
 * unlit; the M key read the zoom alone, so a look that set the flag was in
 * with M pressing it further in.
 */
export function closeupToggle(s: { macroMode?: boolean; macroZoom?: number }): Pick<VisualizerSettings, 'macroMode' | 'macroZoom'> {
  return closeupIn(s) ? { macroMode: false, macroZoom: 1 } : { macroMode: true, macroZoom: CLOSEUP_PRESS_ZOOM };
}
