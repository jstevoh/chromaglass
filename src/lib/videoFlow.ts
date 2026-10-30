/**
 * The video pour: a playing video laid onto the plate as dye, and its motion
 * as flow (PLAN.md 14ab-2).
 *
 * Each frame the video is drawn at the plate's logical grid (192²) and every
 * cell does two things. Its brightness pours dye of its colour (a luma key: a
 * dark pixel pours nothing, so a cartoon's black ground stays clear glass).
 * And where it changed since the last frame, the change is read as motion,
 * the brightness constancy that optical flow starts from: a pattern that moved
 * by u satisfies dI/dt + u·∇I = 0, and the smallest u that does so lies along
 * the gradient, u = −(dI/dt) ∇I / |∇I|². That velocity is added to the liquid,
 * so the picture's own movement stirs it.
 *
 * Until 14ab-2 this was a loop in the frame: a 192² `getImageData` each frame,
 * a fresh 147 KB copy of it kept as the last frame, and `addDensity` and
 * `addVelocity` called per cell, which on the GPU solver also marked every row
 * written, so each step sent the whole 1.3 MB of deltas across as well. On
 * the WebGPU solver the same arithmetic now runs in two compute passes
 * (`videoSample` and `videoFlow` in `gpu/wgsl/splat.ts`), and its deltas join
 * the CPU's at the step's flush, where these would have. The loop stays here
 * for the solvers that have no such pass (the WebGL one, the CPU's own), and
 * as the reference `npm run videoflow` holds the passes to.
 *
 * The numbers are shared with the WGSL by interpolation, so the two cannot
 * drift apart.
 */

/** Luma's weights, Rec. 601, as the loop has always used. */
export const VIDEO_LUMA = [0.299, 0.587, 0.114] as const;
/** A pixel this dark (0..255) pours no dye: the luma key. */
export const VIDEO_KEY = 15;
/** Each frame's dye: brightness/255 times this. */
export const VIDEO_DYE = 0.15;
/** A change smaller than this (0..255) between frames is the video's noise, not motion. */
export const VIDEO_CHANGE = 10;
/** Below this squared gradient the motion along it is not known (a flat patch). */
export const VIDEO_GRAD2 = 1;
/** How much of the flow the liquid is given. */
export const VIDEO_FLOW = 0.8;

/** What the loop writes into: FluidSimulation, or a check's recorder. */
export interface VideoFlowTarget {
  addDensity(x: number, y: number, amount: number, r?: number, g?: number, b?: number): void;
  addVelocity(x: number, y: number, vx: number, vy: number): void;
}

const lum = (d: ArrayLike<number>, i: number) => VIDEO_LUMA[0] * d[i] + VIDEO_LUMA[1] * d[i + 1] + VIDEO_LUMA[2] * d[i + 2];

/**
 * One frame, on the CPU. `data` is the frame drawn at S×S, RGBA, its rows
 * counting down as a canvas's do; `prev` the last frame's, or null for a first
 * frame, which pours dye and no flow. The edge cells are left alone: the
 * gradient there would reach off the frame.
 *
 * The grid's rows count up the plate and a frame's count down it, so the
 * grid's row y is the frame's row S−1−y, and the cell above a cell on the
 * plate is the row before it in the frame. Until 14ab-13 the loop laid the
 * frame's first row on the grid's first, as the solver's pass did, and a
 * poured video landed upside down (photographed on the owner's Mac: a
 * cartoon's sky poured at the bottom of the plate and its pumpkins at the
 * top). The rows are turned here, where they are read, and not by drawing
 * the frame again turned over on a canvas of its own: that is one more
 * full-size draw a frame on the path 14ab exists to make lighter. The
 * solver's pass turns its frame in the copy that takes it (`flipY` in
 * `pourVideo`, gpu/fluid/inputs.ts), which costs nothing either.
 */
export function pourVideoFrameCpu(target: VideoFlowTarget, data: ArrayLike<number>, prev: ArrayLike<number> | null, S: number): void {
  const row = S * 4;
  for (let y = 1; y < S - 1; y++) {
    const r = (S - 1 - y) * row;
    for (let x = 1; x < S - 1; x++) {
      const i = r + x * 4;
      const l = lum(data, i);
      if (l > VIDEO_KEY) target.addDensity(x, y, (l / 255) * VIDEO_DYE, data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
      if (!prev) continue;
      const diff = l - lum(prev, i);
      if (Math.abs(diff) <= VIDEO_CHANGE) continue;
      const gx = lum(data, i + 4) - lum(data, i - 4);
      const gy = lum(data, i - row) - lum(data, i + row);
      const g2 = gx * gx + gy * gy;
      if (g2 > VIDEO_GRAD2) target.addVelocity(x, y, -diff * gx / g2 * VIDEO_FLOW, -diff * gy / g2 * VIDEO_FLOW);
    }
  }
}

/** What a plate offers a video's frame: its solver's passes (FluidSimulation.pourVideoFrame) and the loop's writes. */
export interface VideoPourPlate extends VideoFlowTarget {
  readonly size: number;
  pourVideoFrame(src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, fresh: boolean): boolean;
}

/** Which video the last frame poured was of, and (for the loop) that frame. */
export interface VideoPourState { source: unknown; prev: Uint8ClampedArray | null }

/** A video is its address while it plays one; another source is itself. */
const sourceOf = (src: object) => ('currentSrc' in src && src.currentSrc) || src;

/**
 * One frame of the pour, as the app's frame loop does it: to the solver's
 * passes when it has them, otherwise drawn and read back (`read`, the app's
 * canvas; null when the frame cannot be read) and through the loop.
 *
 * A frame is fresh, with no last one to be differenced against, when the
 * source is not the one the last frame came from. The pour plays every video
 * on one element, so the element alone does not say that a new one began:
 * the first frame of the next cartoon was differenced against the last of
 * the one before, and the cut between them read as a burst of motion. Its
 * address does say. The app forgets the source (`source = null`) when it is
 * handed a video, for a source whose address is the same.
 */
export function pourVideoFrame(
  plate: VideoPourPlate,
  src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  state: VideoPourState,
  read: (src: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, S: number) => Uint8ClampedArray | null,
): 'gpu' | 'cpu' | 'none' {
  const source = sourceOf(src);
  const fresh = state.source !== source;
  if (plate.pourVideoFrame(src, fresh)) {
    state.source = source;
    return 'gpu';
  }
  const data = read(src, plate.size);
  if (!data) return 'none';
  pourVideoFrameCpu(plate, data, fresh ? null : state.prev, plate.size);
  state.source = source;
  state.prev = data;
  return 'cpu';
}

/**
 * A still picture poured as dye on the CPU (`injectImage`): into the middle of
 * the grid, x 0.19–0.81 and y 0.31–0.69, each cell the pixel at its corner,
 * brighter pixels pouring more, a transparent one nothing. Moved here from
 * FluidSimulation with 14ab-2, as it was, beside the video's loop: the two
 * pictures the CPU pours. `img`'s first row lands on the grid's first, the
 * plate's bottom, so a picture read off a canvas comes turned over
 * (`uprightPicture` for an upload, and `pourText`'s own turn).
 */
export function pourPictureCpu(target: VideoFlowTarget, img: ImageData, S: number): void {
  const w = img.width, h = img.height, d = img.data;
  const gx0 = Math.round(S * 0.19), gx1 = Math.round(S * 0.81);
  const gy0 = Math.round(S * 0.31), gy1 = Math.round(S * 0.69);
  const gw = gx1 - gx0, gh = gy1 - gy0;
  for (let gy = gy0; gy < gy1; gy++) {
    for (let gx = gx0; gx < gx1; gx++) {
      const pi = (Math.floor(((gy - gy0) / gh) * h) * w + Math.floor(((gx - gx0) / gw) * w)) * 4;
      const r = d[pi] / 255, g = d[pi + 1] / 255, b = d[pi + 2] / 255, a = d[pi + 3] / 255;
      if (a < 0.05) continue;
      const brightness = r * 0.3 + g * 0.59 + b * 0.11;
      target.addDensity(gx, gy, (0.5 + brightness * 1.5) * a, r, g, b);
    }
  }
}

/**
 * A picture's pixels for `pourPictureCpu`, the right way up: drawn turned over
 * onto a canvas of its size, as `pourText` turns its words, so its top row is
 * the last and lands at the top of the plate. An uploaded picture was drawn
 * as it came and landed upside down (PLAN 14ab-13: on the owner's Mac, a
 * picture of pink words over blue ones poured with the blue on top and every
 * letter upside down). Once a pour, so the canvas costs nothing a frame.
 * Null when there is no 2D context to draw with.
 */
export function uprightPicture(img: CanvasImageSource, w: number, h: number): ImageData | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.setTransform(1, 0, 0, -1, 0, h);
  g.drawImage(img, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
}
