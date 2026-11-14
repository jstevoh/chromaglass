/**
 * The shape of a clip made to be posted (PLAN 34f).
 *
 * Asked for as one button that saves "a clip with sound" ready for Reels and
 * TikTok. The Record button already writes a video of the plate with the
 * sound it hears, with the free site's fifteen-second cap and corner mark
 * (`tierGates.ts`); what it could not do was a portrait frame, so a post
 * meant either cropping a landscape file in another app or posting a strip of
 * plate with black above and below. A 9:16 clip is the plate drawn at 9:16,
 * not the landscape picture cut down, so a drop near the left edge of a
 * laptop screen is still in the clip.
 *
 * Two ways to get that, and which one runs depends on who else owns the
 * canvas's shape:
 *
 *   - **Drawn at 9:16.** Nothing else is using the canvas's pixels, so for
 *     the length of the clip the visualizer is given a 1080 × 1920 stage
 *     (720 × 1280 on the free site, as Render is held to 720p) exactly as a
 *     projector would give it: the solver lays the plate out at that shape and
 *     the window shows it letterboxed. The performer sees a tall plate with
 *     bars for the minute the clip takes, and the desk is as it was after.
 *   - **A centred slice.** A projector is attached, so the canvas is the
 *     wall's and must not change shape under an audience, or this is a phone,
 *     whose screen is already close to 9:16 and which should not be asked to
 *     draw a second, larger plate. The clip is the widest 9:16 slice of what
 *     is on the canvas, centred. It says so in the Record panel: it is a
 *     crop, and the only one of the two that is.
 */

export type ClipShape = 'plate' | 'portrait';

export const PORTRAIT_ASPECT = 9 / 16;

/** The canvas's pixels for a clip drawn at 9:16, and the free site's smaller one. */
export const PORTRAIT_STAGE = { width: 1080, height: 1920 } as const;
export const FREE_PORTRAIT_STAGE = { width: 720, height: 1280 } as const;

export function portraitStage(freeGated: boolean): { width: number; height: number } {
  const s = freeGated ? FREE_PORTRAIT_STAGE : PORTRAIT_STAGE;
  return { width: s.width, height: s.height };
}

/** Whether a canvas is already 9:16 to within the rounding of a stage's pixels. */
export function isPortrait(width: number, height: number, tolerance = 0.02): boolean {
  return width > 0 && height > 0 && Math.abs(width / height - PORTRAIT_ASPECT) <= tolerance * PORTRAIT_ASPECT;
}

export interface CoverCrop {
  /** The slice of the source to draw. */
  sx: number; sy: number; sw: number; sh: number;
  /** The clip's own size: even numbers, which H.264 needs. */
  outW: number; outH: number;
}

/**
 * The widest centred slice of a `srcW × srcH` frame that is 9:16, and the
 * clip's size for it. A frame taller than 9:16 loses its top and bottom
 * instead; a frame already 9:16 loses nothing.
 */
export function coverCrop(srcW: number, srcH: number, aspect = PORTRAIT_ASPECT): CoverCrop {
  const w = Math.max(2, srcW), h = Math.max(2, srcH);
  let sw: number, sh: number;
  if (w / h > aspect) { sh = h; sw = h * aspect; } else { sw = w; sh = w / aspect; }
  const even = (v: number) => Math.max(2, 2 * Math.floor(v / 2));
  return { sx: (w - sw) / 2, sy: (h - sh) / 2, sw, sh, outW: even(sw), outH: even(sh) };
}

/**
 * The container a clip asks for. A post goes to an app that takes MP4
 * (Instagram does not take WebM at all), so a portrait clip asks for MP4
 * first and falls back to WebM only where the browser cannot write MP4; an
 * explicit choice in the panel is kept.
 */
export function clipContainer(shape: ClipShape, format: 'auto' | 'webm' | 'mp4'): 'auto' | 'webm' | 'mp4' {
  return shape === 'portrait' && format === 'auto' ? 'mp4' : format;
}

/** What the Record panel and the phone say about the frame. */
export function clipShapeText(shape: ClipShape): string {
  return shape === 'portrait' ? 'Portrait 9:16' : 'As the plate is';
}
