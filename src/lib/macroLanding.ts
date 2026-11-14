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
/** A plate whose average dye is under this has nothing to land on yet. */
export const EMPTY_PLATE = 1e-3;
/**
 * The zoom from which the closeup is fully in and its landing stands. The
 * same 2x as `MACRO_FULL_ZOOM` in src/sim/constants.ts, where the closeup's
 * look finishes fading in; written here because src/lib does not import
 * src/sim, and `npm run closeupland` checks the two agree.
 */
export const LAND_FULL_ZOOM = 2;
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

/**
 * The nearest frame to the aim (ax, ay) that holds at least half the dye the
 * plate's fullest frame holds, centred on the dye it holds. Grid cells; the
 * frame is (hx, hy) half-cells, and its middle stays `margin` cells off the
 * walls. Writes the answer into `out`.
 *
 * Nearest rather than fullest, so a look whose middle has a little in it moves
 * no further than it must; at least half the fullest, so it lands on a subject
 * and not on the fringe of one. The frame is the one asked for (the zoom it is
 * going to), not the one easing in from the plate.
 */
export function landing(field: MacroField, ax: number, ay: number, hx: number, hy: number, margin: number,
  out: { x: number; y: number }): void {
  const { density, size } = field;
  const W = size + 1;
  if (sat.length < W * W) sat = new Float64Array(W * W);
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
  const boxMean = (cx: number, cy: number) => {
    const x0 = clamp(Math.round(cx - hx), 0, size), x1 = clamp(Math.round(cx + hx), 0, size);
    const y0 = clamp(Math.round(cy - hy), 0, size), y1 = clamp(Math.round(cy + hy), 0, size);
    const area = (x1 - x0) * (y1 - y0);
    return area > 0 ? (sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0]) / area : 0;
  };
  // Centres the frame can sit on: inside the plate, and its middle off the walls.
  const xLo0 = Math.max(hx, margin), xHi0 = size - Math.max(hx, margin);
  const yLo0 = Math.max(hy, margin), yHi0 = size - Math.max(hy, margin);
  const xLo = xLo0 <= xHi0 ? xLo0 : size / 2, xHi = xLo0 <= xHi0 ? xHi0 : size / 2;
  const yLo = yLo0 <= yHi0 ? yLo0 : size / 2, yHi = yLo0 <= yHi0 ? yHi0 : size / 2;
  const stride = Math.max(1, Math.min(hx, hy) / 2);
  // Two sweeps over the same lattice, the first for the fullest frame and the
  // second for the nearest one holding half of it, rather than a list of every
  // candidate: the box sum is four reads, cheaper than the list.
  let best = 0;
  for (let y = yLo; y <= yHi + 1e-6; y += stride) {
    for (let x = xLo; x <= xHi + 1e-6; x += stride) { const v = boxMean(x, y); if (v > best) best = v; }
  }
  let px = ax, py = ay, near = Infinity;
  for (let y = yLo; y <= yHi + 1e-6; y += stride) {
    for (let x = xLo; x <= xHi + 1e-6; x += stride) {
      if (boxMean(x, y) < 0.5 * best) continue;
      const dist = Math.hypot(x - ax, y - ay);
      if (dist < near) { near = dist; px = x; py = y; }
    }
  }
  // The nearest such frame has its subject in the corner furthest from the
  // aim (every frame that holds the whole of a pool holds the same dye), so
  // the subject is put in the middle: the frame goes to the centroid of the
  // dye it holds, twice, as a cut lands on a drop's middle (`recenter`).
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
 * did not (grid cells, NaN while it sits on its aim). Owned by the camera.
 */
export interface Landing { pending: boolean; x: number; y: number; out: { x: number; y: number } }

export function newLanding(): Landing {
  return { pending: true, x: NaN, y: NaN, out: { x: 0, y: 0 } };
}

/** Coming in again (`pending` true), or a hand on the camera (false): either way, back on the aim. */
export function clearLanding(l: Landing, pending: boolean): void {
  l.pending = pending; l.x = NaN; l.y = NaN;
}

/**
 * One frame of Hold or Follow coming in, aimed at (ax, ay) grid cells, with
 * the frame (spanX, spanY) of the plate at `zoom`. `follow` is the bead Follow
 * rides (NaN before it has one). Moves `l.x, l.y` onto liquid when the frame
 * on the aim (or on the bead) is bare glass, and returns true on the frame it
 * first lands, so the camera cuts there rather than easing across the plate.
 */
export function steerLanding(l: Landing, field: MacroField, ax: number, ay: number,
  frame: { spanX: number; spanY: number; zoom: number }, followX: number, followY: number, margin: number): boolean {
  if (!l.pending) return false;
  const plate = plateMean(field, margin);
  // An empty plate waits on the aim, still pending, for the first pour.
  if (!(plate > EMPTY_PLATE)) return false;
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
  if (frame.zoom >= LAND_FULL_ZOOM) l.pending = false;
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
export function closeupIn(s: Pick<VisualizerSettings, 'macroMode' | 'macroZoom'>): boolean {
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
export function closeupToggle(s: Pick<VisualizerSettings, 'macroMode' | 'macroZoom'>): Pick<VisualizerSettings, 'macroMode' | 'macroZoom'> {
  return closeupIn(s) ? { macroMode: false, macroZoom: 1 } : { macroMode: true, macroZoom: CLOSEUP_PRESS_ZOOM };
}
