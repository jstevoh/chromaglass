/**
 * Seamless loop seam picker and crossfade weights for a Spotify Canvas (PLAN 43b).
 *
 * A real fluid in a dish never repeats: its vortices, drops and currents carry
 * on from where the song took them, and forcing the solver or the plate shader
 * to periodic boundaries would fake the motion the solver is there to produce.
 * So a seamless loop of `loopFrames` is an edit of the finished film's frames:
 *
 *   1. Render a search window a couple of seconds longer than the loop, keeping
 *      only a small grey thumbnail (64x64, 4 KB) per frame so the search never
 *      holds hundreds of full-resolution frames in memory.
 *   2. Find the start frame `s` (0 <= s <= n - loopFrames - fadeFrames) whose
 *      frame `s` and frame `s + loopFrames` are closest in mean absolute luma
 *      difference (`frameDistance`), taking the earliest `s` on a tie and
 *      never picking a start whose `fadeFrames` tail runs past the last frame.
 *   3. Across the half-second seam (`fadeFrames`), blend the early frame
 *      `s + t` with the late frame `s + loopFrames + t` using `fadeWeight(t, fadeFrames)`:
 *      0 at `t = 0` (so the transition from frame `s + loopFrames - 1` into the
 *      fade is the film's own step into `s + loopFrames`), rising linearly to 1
 *      at `t = fadeFrames`, and 1 from there on.
 *
 * Plain functions over typed arrays with no dependencies, so `npm run loopseam`
 * imports this file directly in Node alongside the browser render.
 */

export const LOOP_MIN_SECONDS = 3;
export const LOOP_MAX_SECONDS = 8;
export const LOOP_DEFAULT_SECONDS = 8;
export const LOOP_FADE_SECONDS = 0.5;
export const LOOP_SEARCH_EXTRA_SECONDS = 2;
export const LOOP_THUMB_SIZE = 64;

/**
 * Mean absolute difference per pixel (`0..255`) between two equal-sized grey
 * thumbnails. Throws when the two frames do not have the same length.
 */
export function frameDistance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) {
    throw new Error(`frameDistance: frame lengths differ (${a.length} vs ${b.length})`);
  }
  const n = a.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / n;
}

/**
 * Pick the seam start `s` in `thumbs` (`0 <= s <= thumbs.length - loopFrames - fadeFrames`)
 * that minimises `frameDistance(thumbs[s], thumbs[s + loopFrames])`, breaking
 * ties in favour of the earliest frame. Throws if `thumbs` is shorter than
 * the loop and its fade (`loopFrames + fadeFrames`).
 */
export function pickSeam(
  thumbs: readonly Uint8Array[],
  loopFrames: number,
  fadeFrames: number,
): { start: number; distance: number } {
  const n = thumbs.length;
  const tail = Math.max(1, fadeFrames);
  if (loopFrames <= 0 || fadeFrames < 0 || n < loopFrames + tail) {
    throw new Error(`pickSeam: need at least ${loopFrames + tail} frames for a ${loopFrames}-frame loop and ${fadeFrames}-frame fade, got ${n}`);
  }
  const lastStart = n - loopFrames - fadeFrames;
  let bestStart = 0;
  let bestDistance = Infinity;
  for (let s = 0; s <= lastStart; s++) {
    const d = frameDistance(thumbs[s], thumbs[s + loopFrames]);
    if (d < bestDistance) {
      bestDistance = d;
      bestStart = s;
    }
  }
  return { start: bestStart, distance: bestDistance };
}

/**
 * Weight of the film's early frame `s + t` at loop offset `t` (`0..1`), with
 * `1 - fadeWeight(t, fadeFrames)` on the late frame `s + loopFrames + t`.
 * Starts at 0 for `t = 0`, rises linearly to 1 at `t = fadeFrames`, and stays
 * at 1 thereafter; when `fadeFrames <= 0`, returns 1 for every frame.
 */
export function fadeWeight(t: number, fadeFrames: number): number {
  if (fadeFrames <= 0 || t >= fadeFrames) return 1;
  if (t <= 0) return 0;
  return t / fadeFrames;
}

/**
 * Convert an RGBA byte buffer (`width * height * 4`) into a single-channel
 * BT.601 luma thumbnail (`Uint8Array` of `width * height`).
 */
export function rgbaToGrey(rgba: ArrayLike<number>): Uint8Array {
  const pixels = rgba.length >>> 2;
  const out = new Uint8Array(pixels);
  for (let i = 0, k = 0; i < pixels; i++, k += 4) {
    out[i] = (77 * rgba[k] + 150 * rgba[k + 1] + 29 * rgba[k + 2] + 128) >> 8;
  }
  return out;
}

/**
 * Blend two RGBA byte buffers (`early` with weight `w`, `late` with `1 - w`)
 * into `out`.
 */
export function blendRgba(
  early: Uint8ClampedArray,
  late: Uint8ClampedArray,
  w: number,
  out: Uint8ClampedArray,
): void {
  const inv = 1 - w;
  for (let i = 0; i < out.length; i += 4) {
    out[i] = Math.round(w * early[i] + inv * late[i]);
    out[i + 1] = Math.round(w * early[i + 1] + inv * late[i + 1]);
    out[i + 2] = Math.round(w * early[i + 2] + inv * late[i + 2]);
    out[i + 3] = 255;
  }
}

/**
 * Find the start frame `0 <= s <= energyByFrame.length - windowFrames` whose
 * contiguous window of `windowFrames` has the highest total band energy,
 * returning 0 when the song is no longer than the window and breaking ties
 * in favour of the earliest stretch.
 */
export function pickLoudestWindow(energyByFrame: ArrayLike<number>, windowFrames: number): number {
  const n = energyByFrame.length;
  if (windowFrames <= 0 || n <= windowFrames) return 0;
  let sum = 0;
  for (let i = 0; i < windowFrames; i++) sum += energyByFrame[i];
  let bestStart = 0;
  let bestSum = sum;
  for (let s = 1; s <= n - windowFrames; s++) {
    sum += energyByFrame[s + windowFrames - 1] - energyByFrame[s - 1];
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = s;
    }
  }
  return bestStart;
}
