/**
 * The logo melted at the start of a film or a stream (PLAN 37x-11).
 *
 * What was asked (the owner, 2026-11-10): "dump a big chromaglass logo at the
 * beginning of our videos and let it melt away before the beginning of the
 * show". The obvious build is the mark (`markMix`) drawn big over the frame
 * and faded out with a ripple shader on it. That is a fade dressed as a melt,
 * and the plate's rule is that physics writes and rendering reads: nothing
 * over the picture may fake what the liquid should do. So the logo is not
 * drawn at all. It is laid into the solver's dye at its own grid, the same
 * way a song's title is (`inkTitleRun.ts`, PLAN 37x-10), and what takes it
 * away is liquid moving: on the thin gap every look opens on, the logo is
 * made up as thick ink on a clear pad of gum-thickened plate liquid (37x-10g),
 * so the look's own flow has to go round it and it holds still to be read;
 * then clear liquid is squirted into the pad and drives through it in
 * Saffman-Taylor fingers, which is what reads as the letters running and
 * melting, and the wash's eddies mix what the fingers split. The dye is never
 * faded: what was the logo stays on the plate as the show's first colour.
 *
 * The picture is the intro's own wordmark (`public/intro-name.svg`, the
 * ChromaGlass the page shows while the show loads), so the film opens on the
 * same mark the app does. It is poured in one ink, the hub's teal: a dye is
 * an absorbance, and the wordmark's white "Glass" as a dye is no dye at all.
 *
 * Importable in node: nothing here touches a canvas until `logoMeltMask` is
 * called, in the browser, once a film.
 */
import { inkBox, inkCanvas } from './inkTitle';

/** The wordmark the page's intro shows, served from `public/`. */
export const LOGO_MELT_SRC = '/intro-name.svg';
/** Its width over its height, from the file's viewBox (885.8 × 195): an SVG with only a viewBox has no natural size to read. */
export const LOGO_MELT_ASPECT = 885.8 / 195;
/**
 * Big: the logo is the whole picture for its first seconds, three fifths of
 * the plate across. Not more: the frame shows the square inside the dish's
 * circle, about 0.15 to 0.85 of the grid, and the first picture of the melt at
 * four fifths (the lab's render, 2026-11-10) had the C and the last s off its
 * edges.
 */
export const LOGO_MELT_WIDTH = 0.6;
/** The brand's teal (the intro hub's), as the pour's ink. */
export const LOGO_MELT_COLOUR = '#1de0c0';
/**
 * The wash's dial for the logo (the title's `inkTitleSweep`, fixed here): the
 * default, read for about three seconds and melted by four and a half on a
 * busy look's thin gap (`npm run logomelt`: 0.835 at 2 s, 0.787 at 3 s, under
 * 0.3 at 4.5 s), the few seconds before a show starts that the owner asked for.
 */
export const LOGO_MELT_SWEEP = 0.5;

/** A picture to melt: anything a canvas draws, and its width over its height. */
export interface LogoArt { source: CanvasImageSource; aspect: number }

/**
 * The logo rasterised once into a mask: coverage 0..1 from the picture's
 * alpha, n × n, row 0 at the plate's bottom as the solver's grid has it,
 * `width` of the plate across, centred, turned by `angle` (radians) against
 * the plate's own turn so it reads level on the wall. `box` is its ink's
 * extent [x0, y0, x1, y1] in plate fractions, from the mask itself.
 */
export function logoMeltMask(art: LogoArt, width: number, n: number, angle = 0): { mask: Float32Array; box: [number, number, number, number] } {
  const mask = new Float32Array(n * n);
  const g = inkCanvas(n);
  const w = Math.min(0.88, Math.max(0.1, width)) * n, h = w / Math.max(0.05, art.aspect);
  if (!g || !(w > 0) || !(h > 0)) return { mask, box: [0, 0, 0, 0] };
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, n, n);
  g.translate(n / 2, n / 2);
  if (angle) g.rotate(angle);
  g.drawImage(art.source, -w / 2, -h / 2, w, h);
  const px = g.getImageData(0, 0, n, n).data;
  // A canvas counts its rows down and the plate up: turned over, so the logo reads upright on the wall.
  for (let j = 0; j < n; j++) {
    const src = (n - 1 - j) * n * 4, dst = j * n;
    for (let i = 0; i < n; i++) mask[dst + i] = px[src + i * 4 + 3] / 255;
  }
  const ink = inkBox(mask, n);
  return { mask, box: ink ? [ink[0] / n, ink[1] / n, (ink[2] + 1) / n, (ink[3] + 1) / n] : [0, 0, 0, 0] };
}

/** What starts a film: the Live Show going on air, and the Record button's take. */
export interface LogoMeltEdge { live: boolean; recording: boolean }

/**
 * Whether this moment starts a film the logo should open: the switch on, and
 * the stream just gone live or a recording just started, from what was true
 * the last time this was asked. A stream that drops and comes back is not a
 * new show (its phase stays on air through a reconnect), and starting to
 * record while already streaming opens a new film, so it pours again.
 */
export const logoMeltCue = (was: LogoMeltEdge, now: LogoMeltEdge, on: boolean): boolean =>
  on && ((now.live && !was.live) || (now.recording && !was.recording));
