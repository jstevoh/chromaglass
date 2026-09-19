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

/**
 * What shape a surface cuts out of its quad.
 *
 * Every surface is four corners and a projective map, whatever shape it ends
 * up being — that is what keeps one solver, one piece of geometry and one set
 * of drag handles behind all of them, and it is how the mapping tools this is
 * modelled on do it too. The shape is a test in the quad's *local* space, so
 * it keystones with the quad: a circle pinned onto a surface that is not
 * square to the projector lands as the ellipse that reads as a circle from the
 * seats, which is the entire point of doing this at load-in rather than in a
 * drawing program.
 */
export type SurfaceShape = 'rect' | 'ellipse' | 'triangle' | 'diamond';

export const SURFACE_SHAPES: SurfaceShape[] = ['rect', 'ellipse', 'triangle', 'diamond'];

export interface Surface {
  /** Stable across reorders and edits, so a drag knows what it has hold of. */
  id: string;
  shape: SurfaceShape;
  /**
   * The four corners on the wall, clockwise from top left, in screen space
   * (0,0 top left to 1,1 bottom right) — the same space and the same winding
   * as the projector's own corner pin, so one solver serves both.
   */
  corners: [number, number, number, number, number, number, number, number];
  /**
   * Which piece of the plate this surface shows: x, y, width, height in
   * source space, 0..1.
   *
   * The default is the whole picture, so a new surface is a window onto the
   * show rather than a crop of it. Narrowing it is how one plate feeds several
   * surfaces without every one of them being the same image — a column taking
   * a tall slice, a disc taking the middle.
   */
  src: [number, number, number, number];
  /** Off keeps a surface in the list without lighting it: a cue rather than a delete. */
  enabled: boolean;
  /** 0..1, so a surface can sit behind the others rather than beside them. */
  opacity: number;
  /** How soft the shape's own edge is, in its local space. 0 is a hard cut. */
  feather: number;
}

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
  /**
   * Projection mapping: the shapes the picture is cut into on the wall.
   *
   * Empty — and it is empty until somebody adds one — means the whole frame is
   * the picture, which is what every show that is pointed at a screen wants
   * and costs nothing. With surfaces in it the frame is black except where a
   * surface lands, so the gaps between them are as deliberate as the shapes:
   * a projector aimed at three panels with wall between them lights the panels
   * and leaves the wall dark, instead of lighting all of it and hoping.
   *
   * These sit *inside* the projector's corner pin, and the order matters. The
   * pin squares the projector against the room; the surfaces map the squared
   * picture onto things in it. Doing it the other way round would mean every
   * surface had to be re-dragged the first time the projector was nudged.
   */
  surfaces: Surface[];
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
  surfaces: [],
};

/** How many surfaces one output may carry. */
export const MAX_SURFACES = 16;

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
  // Any surface at all changes the frame, because everything outside one goes
  // black — a single small square is the largest change this config can make.
  if (o.surfaces.length > 0) return false;
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
    surfaces: normalizeSurfaces((o as { surfaces?: unknown }).surfaces),
  };
}

const clampCorners = (raw: unknown): Surface['corners'] | null =>
  Array.isArray(raw) && raw.length === 8 && raw.every(n => typeof n === 'number' && Number.isFinite(n))
    ? (raw.map(n => clamp(n, -1, 2)) as Surface['corners'])
    : null;

/**
 * Coerce a stored surface list. Anything that cannot be read as a surface is
 * dropped rather than repaired: a half-understood quad is a shape in the wrong
 * place on a wall, and a shape in the wrong place is worse than an absent one.
 */
export function normalizeSurfaces(raw: unknown): Surface[] {
  if (!Array.isArray(raw)) return [];
  const out: Surface[] = [];
  for (const item of raw.slice(0, MAX_SURFACES)) {
    const s = (item ?? {}) as Partial<Surface>;
    const corners = clampCorners(s.corners);
    if (!corners) continue;
    const shape = SURFACE_SHAPES.includes(s.shape as SurfaceShape) ? (s.shape as SurfaceShape) : 'rect';
    const src = Array.isArray(s.src) && s.src.length === 4 && s.src.every(n => typeof n === 'number' && Number.isFinite(n))
      ? ([clamp(s.src[0], 0, 1), clamp(s.src[1], 0, 1), clamp(s.src[2], 0.01, 1), clamp(s.src[3], 0.01, 1)] as Surface['src'])
      : ([0, 0, 1, 1] as Surface['src']);
    out.push({
      id: typeof s.id === 'string' && s.id ? s.id : `s${out.length}-${Math.random().toString(36).slice(2, 8)}`,
      shape,
      corners,
      src,
      enabled: s.enabled !== false,
      opacity: clamp(s.opacity === undefined ? 1 : Number(s.opacity) || 0, 0, 1),
      feather: clamp(s.feather === undefined ? 0.01 : Number(s.feather) || 0, 0, 0.5),
    });
  }
  return out;
}

let surfaceSeq = 0;
const newId = () => `s${Date.now().toString(36)}-${(surfaceSeq++).toString(36)}`;

/**
 * A new surface, placed where it can be seen and grabbed.
 *
 * Dropped into the middle at a third of the frame rather than filling it: a
 * surface that lands on the frame's own edges has its handles on the edges
 * too, and the first thing anybody does with a new shape is drag a corner.
 */
export function makeSurface(shape: SurfaceShape = 'rect', at = 0): Surface {
  // Step each new one down and right so a second add is not hidden under the
  // first — the commonest way a new object looks like nothing happened.
  const off = (at % 5) * 0.05;
  const x0 = 0.33 + off, y0 = 0.33 + off, x1 = 0.67 + off, y1 = 0.67 + off;
  return {
    id: newId(),
    shape,
    corners: [x0, y0, x1, y0, x1, y1, x0, y1],
    src: [0, 0, 1, 1],
    enabled: true,
    opacity: 1,
    feather: 0.01,
  };
}

/**
 * A cube, as the three faces of it a projector can actually light.
 *
 * Not 3D: three quads in an isometric arrangement, each an ordinary surface
 * that can be dragged away from the others the moment it is made. That is the
 * honest version of a cube for this — a real one would need a camera, a
 * projector position and a measured object, none of which the app knows, and
 * the thing anybody actually points this at is a stack of boxes whose faces
 * they want to line up by eye.
 *
 * The faces share the winding of every other surface: clockwise from the
 * corner that is top left *on that face*.
 */
export function makeCube(cx = 0.5, cy = 0.5, r = 0.18): Surface[] {
  const h = r * 0.5;            // half-width of the isometric step
  const v = r * 0.29;           // the vertical the step rises by (2:1 isometric)
  return [
    // Top face: a rhombus, read clockwise from the far corner.
    { ...makeSurface('rect'), corners: [cx, cy - r, cx + h * 2, cy - r + v * 2, cx, cy - r + v * 4, cx - h * 2, cy - r + v * 2] },
    // Left face.
    { ...makeSurface('rect'), corners: [cx - h * 2, cy - r + v * 2, cx, cy - r + v * 4, cx, cy + r, cx - h * 2, cy + r - v * 2] },
    // Right face.
    { ...makeSurface('rect'), corners: [cx, cy - r + v * 4, cx + h * 2, cy - r + v * 2, cx + h * 2, cy + r - v * 2, cx, cy + r] },
  ].map((s, i) => ({ ...s, id: newId(), corners: s.corners as Surface['corners'], src: [i / 3, 0, 1 / 3, 1] as Surface['src'] }));
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
  const f = squareToQuad(corners);
  if (!f) return null;
  const { a, b, c, d, e, g, h } = f;
  const fq = f.f;

  // Invert (adjugate is enough: a homography is only defined up to scale).
  const A = e - fq * h, B = c * h - b, C = b * fq - c * e;
  const D = fq * g - d, E = a - c * g, F = c * d - a * fq;
  const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
  const det3 = a * A + b * D + c * G;
  if (!Number.isFinite(det3) || Math.abs(det3) < 1e-12) return null;

  // Column-major for GLSL: m[col][row].
  return new Float32Array([A, D, G, B, E, H, C, F, I]);
}

interface Quad { a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number }

/**
 * Heckbert's unit-square-to-quad map, which is the forward direction: where a
 * point of the picture lands on the wall.
 *
 * The shader wants the inverse of this, because it runs per output pixel and
 * asks which pixel of the plate belongs there. Composing a surface onto the
 * projector's keystone wants the forward one, because a surface's corners are
 * points that have to be carried through the pin. They are the same eight
 * numbers, so they are solved once here.
 */
function squareToQuad(corners: OutputConfig['corners']): Quad | null {
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
  // A quad with no area maps everything onto a line. The perspective branch
  // catches that in its own determinant, but the affine branch had no test:
  // four corners dragged into a row took it, produced a map that collapsed
  // one axis, and returned it as if it were a quad. What that looks like is a
  // surface that silently becomes a hairline on the wall — so it is refused
  // here, where both branches pass through.
  const det = a * (e - f * h) + b * (f * g - d) + c * (d * h - e * g);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  return { a, b, c, d, e, f, g, h };
}

/**
 * Where a point of a quad's unit square lands inside that quad.
 *
 * The forward direction, used to draw a shape rather than to sample one: the
 * panel needs the outline of a circle or a triangle *as it will appear on the
 * wall*, which is its local-space outline carried through the same projective
 * map the shader inverts. Sampling the boundary and mapping the samples is
 * exact for the straight-edged shapes and as close as the sample count for the
 * round one.
 */
export function pointInQuad(corners: Surface['corners'], u: number, v: number): [number, number] | null {
  const q = squareToQuad(corners);
  if (!q) return null;
  const w = q.g * u + q.h * v + 1;
  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null;
  return [(q.a * u + q.b * v + q.c) / w, (q.d * u + q.e * v + q.f) / w];
}

/**
 * The outline a shape traces inside its quad, in screen space, for drawing.
 *
 * Straight-edged shapes are their corners; the ellipse is sampled, at a count
 * chosen so the curve is smooth at the size this is ever drawn and no larger,
 * since this runs on every pointer move while a corner is being dragged.
 */
export function surfaceOutline(shape: SurfaceShape, corners: Surface['corners']): [number, number][] {
  const local: [number, number][] =
    shape === 'triangle' ? [[0.5, 0], [1, 1], [0, 1]]
    : shape === 'diamond' ? [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]
    : shape === 'ellipse'
      ? Array.from({ length: 28 }, (_, i) => {
          const t = (i / 28) * Math.PI * 2;
          return [0.5 + Math.cos(t) * 0.5, 0.5 + Math.sin(t) * 0.5] as [number, number];
        })
      : [[0, 0], [1, 0], [1, 1], [0, 1]];
  const out: [number, number][] = [];
  for (const [u, v] of local) {
    const p = pointInQuad(corners, u, v);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Carry a surface's corners through the projector's keystone.
 *
 * A surface is dragged where it should land on the wall; the keystone is what
 * squares the projector against that wall. Composing them by transforming the
 * four corners works because a homography of a homography is a homography —
 * so the quad that comes out of this is an ordinary surface with an ordinary
 * projective interior, and the whole output stays one pass.
 *
 * It also gives the behaviour a load-in wants: nudge the projector's pin and
 * every shape travels with the picture, instead of every shape needing to be
 * dragged again.
 */
export function composeOntoPin(
  surface: Surface['corners'],
  pin: OutputConfig['corners'],
): Surface['corners'] | null {
  if (pin.every((v, i) => near(v, IDENTITY_CORNERS[i]))) return surface;
  const q = squareToQuad(pin);
  if (!q) return null;
  const out: number[] = [];
  for (let i = 0; i < 8; i += 2) {
    const x = surface[i], y = surface[i + 1];
    const w = q.g * x + q.h * y + 1;
    if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return null;
    out.push((q.a * x + q.b * y + q.c) / w, (q.d * x + q.e * y + q.f) / w);
  }
  return out as Surface['corners'];
}
