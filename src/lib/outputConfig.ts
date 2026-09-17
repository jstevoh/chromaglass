/**
 * The projector, and the wall it is pointed at.
 *
 * Every other number in this app describes the *look* — what is in the dish,
 * how the lamp sits under it, how hard the music drives it. These describe the
 * *room*: which way round the screen is, how far off-axis the projector had to
 * be hung, where the light has to stop so it misses the singer's face, and how
 * much the house lights are eating. A liquid light show has done this at
 * load-in since 1965 — Joshua White's crew masked the stage of every overhead
 * with tape and then masked the edges of the projection so stray white light
 * was contained — and it is the one part of the craft the app had no answer
 * for except "capture the window in OBS and fix it in Resolume".
 *
 * ## Why this is not in `VisualizerSettings`
 *
 * Because a preset is a look and a look travels. A `.chromaglass-preset.json`
 * saved at the kitchen table and sent to someone in another city must not
 * arrive carrying the keystone of the kitchen, and the *Fillmore East, 1969*
 * preset must not blank the bottom of everyone's screen because the room it
 * was tuned in had a band standing in front of the wall. So output geometry is
 * a property of this machine and this venue: kept in localStorage next to the
 * projector mode, never written into a preset, a sequence or a MIDI map.
 *
 * ## Why it is not MIDI-learnable
 *
 * The project's rule is that every new setting reaches a fader. This is the
 * exception, and deliberately: a corner-pin is set once, at load-in, with the
 * projector on and the operator standing where the audience will be. Nothing
 * here should ever move during a song, and a control that can be knocked by a
 * fader in the dark is a hazard rather than a feature. Riding the brightness
 * mid-show is what `dimmer` is for, and that is on the master fader already.
 */

export interface OutputConfig {
  /**
   * Mirror left-to-right. Rear projection onto a gauze or a vinyl screen — the
   * way most of the shows in the history were rigged, and the way to keep the
   * light off the band — reverses the image, and plenty of projectors have no
   * flip of their own.
   */
  flipX: boolean;
  /** Mirror top-to-bottom, for a projector hung upside down from a bar. */
  flipY: boolean;
  /**
   * The four corners of the projected image, clockwise from top left, in
   * screen space (0,0 top left to 1,1 bottom right). The identity quad is the
   * whole rectangle; dragging a corner in is keystone correction for a
   * projector that could not be hung square, and dragging them a long way is
   * a crude corner-pin onto a surface that is not a rectangle at all.
   */
  corners: [number, number, number, number, number, number, number, number];
  /** Blanking from each edge, 0 to 0.45 of the frame. */
  maskTop: number;
  maskRight: number;
  maskBottom: number;
  maskLeft: number;
  /** How soft the blanked edge is, 0 (a hard line) to 0.25 of the frame. */
  maskFeather: number;
  /** Output gain: what the room and the lamp are eating. 1 is untouched. */
  gain: number;
  /** Output gamma. Under 1 lifts the mid-tones for a washed-out room; over 1 deepens them. */
  gamma: number;
  /**
   * Hold the whole field below three flashes a second (`lib/flashGuard.ts`).
   *
   * On unless somebody turns it off, and here rather than in the settings for
   * the same reason as everything else in this file plus one more: a preset
   * must not be able to switch off a safety, and a fader must not be able to
   * knock it off in the dark.
   */
  flashGuard: boolean;
}

export const IDENTITY_CORNERS: OutputConfig['corners'] = [0, 0, 1, 0, 1, 1, 0, 1];

export const DEFAULT_OUTPUT: OutputConfig = {
  flipX: false,
  flipY: false,
  corners: [...IDENTITY_CORNERS] as OutputConfig['corners'],
  maskTop: 0,
  maskRight: 0,
  maskBottom: 0,
  maskLeft: 0,
  maskFeather: 0.02,
  gain: 1,
  gamma: 1,
  flashGuard: true,
};

export const OUTPUT_KEY = 'chromaglass-output';

const near = (a: number, b: number) => Math.abs(a - b) < 1e-4;

/**
 * True when the config's *geometry and grade* would change a single pixel.
 *
 * The pass costs a full-screen texture and a second draw, so when nothing is
 * set — which is every machine that has never been pointed at a projector —
 * it is not built at all and the plate goes straight to the screen as it
 * always did.
 *
 * The flash guard is deliberately not part of this question. It rides the
 * master dimmer, which every path multiplies through already, so it needs no
 * pass of its own and must not drag one into existence on every machine.
 */
export function outputIsIdentity(o: OutputConfig): boolean {
  if (o.flipX || o.flipY) return false;
  if (!o.corners.every((v, i) => near(v, IDENTITY_CORNERS[i]))) return false;
  if (o.maskTop > 1e-4 || o.maskRight > 1e-4 || o.maskBottom > 1e-4 || o.maskLeft > 1e-4) return false;
  if (!near(o.gain, 1) || !near(o.gamma, 1)) return false;
  return true;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Coerce anything that came out of storage, a URL or a cast message into a usable config. */
export function normalizeOutput(raw: unknown): OutputConfig {
  const o = (raw ?? {}) as Partial<OutputConfig>;
  const corners = Array.isArray(o.corners) && o.corners.length === 8 && o.corners.every(n => typeof n === 'number' && Number.isFinite(n))
    // A corner is allowed outside the frame: a projector aimed past the edge of
    // a screen is corrected by pulling the image in from beyond it.
    ? (o.corners.map(n => clamp(n, -1, 2)) as OutputConfig['corners'])
    : ([...IDENTITY_CORNERS] as OutputConfig['corners']);
  return {
    flipX: !!o.flipX,
    flipY: !!o.flipY,
    corners,
    maskTop: clamp(Number(o.maskTop) || 0, 0, 0.45),
    maskRight: clamp(Number(o.maskRight) || 0, 0, 0.45),
    maskBottom: clamp(Number(o.maskBottom) || 0, 0, 0.45),
    maskLeft: clamp(Number(o.maskLeft) || 0, 0, 0.45),
    maskFeather: clamp(o.maskFeather === undefined ? DEFAULT_OUTPUT.maskFeather : Number(o.maskFeather) || 0, 0, 0.25),
    gain: clamp(o.gain === undefined ? 1 : Number(o.gain) || 1, 0.2, 3),
    gamma: clamp(o.gamma === undefined ? 1 : Number(o.gamma) || 1, 0.5, 2.5),
    flashGuard: o.flashGuard !== false,
  };
}

export function loadOutput(): OutputConfig {
  try {
    const raw = localStorage.getItem(OUTPUT_KEY);
    return raw ? normalizeOutput(JSON.parse(raw)) : { ...DEFAULT_OUTPUT };
  } catch {
    return { ...DEFAULT_OUTPUT };
  }
}

export function saveOutput(o: OutputConfig): void {
  try { localStorage.setItem(OUTPUT_KEY, JSON.stringify(o)); } catch { /* private browsing */ }
}

/**
 * The projective map from the projected quad back to the source picture.
 *
 * The shader runs per output pixel and needs to know which pixel of the plate
 * belongs there, which is the *inverse* of the corner-pin the operator
 * dragged. So: build Heckbert's square-to-quad matrix for the corners they
 * set, then invert it. Both are in screen space (y down), because that is the
 * space a corner handle is dragged in; the shader flips at the two ends.
 *
 * Returned column-major, ready for `uniformMatrix3fv`. Null when the quad is
 * degenerate — three corners in a line, which a determined drag can reach —
 * and the caller then leaves the frame alone rather than dividing by zero.
 */
export function cornerPinMatrix(corners: OutputConfig['corners']): Float32Array | null {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
  // Heckbert: the unit square's corners, in this order, map to d0..d3.
  const sx = x0 - x1 + x2 - x3;
  const sy = y0 - y1 + y2 - y3;
  let a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
    // An affine quad (a parallelogram): no perspective term.
    a = x1 - x0; b = x2 - x1; c = x0;
    d = y1 - y0; e = y2 - y1; f = y0;
    g = 0; h = 0;
  } else {
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const det = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(det) < 1e-9) return null;
    g = (sx * dy2 - sy * dx2) / det;
    h = (dx1 * sy - dy1 * sx) / det;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }

  // Invert (adjugate is enough: a homography is only defined up to scale).
  const A = e - f * h, B = c * h - b, C = b * f - c * e;
  const D = f * g - d, E = a - c * g, F = c * d - a * f;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const det3 = a * A + b * D + c * G;
  if (!Number.isFinite(det3) || Math.abs(det3) < 1e-12) return null;

  // Column-major for GLSL: m[col][row].
  return new Float32Array([A, D, G, B, E, H, C, F, I]);
}
