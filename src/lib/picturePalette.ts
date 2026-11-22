/**
 * A palette from any picture: an album cover, a photo, a still, a video
 * (PLAN 43d, and 43d-1 for video).
 *
 * The owner, 2026-11-15: "I like the general idea of taking video, image,
 * album art or whatever visual input and creating a palette from it." It came
 * from a competitor's page, where a dropped cover builds the scene from the
 * cover's colours, and it was already in the plan as 43d.
 *
 * **What the picture decides, and what it does not.** The picture picks the
 * dyes and nothing else. A palette colour on this plate is a dye's
 * transmission through one unit of it, per band (lib/dye.ts, PLAN 18l), held
 * between a real dye's floor and ceiling, and that is all the picture's
 * colours become: four dyes with the cover's colours, poured, carried,
 * mixed and absorbed by the same solver as Warm Sunset's. Nothing of the
 * picture is drawn over the plate, no motion is taken from it, and the look's
 * liquids, physics and settings are the look's. (Pouring the picture itself
 * in as dye is the Image… button, `injectImage`, which already exists.)
 *
 * **Which colours.** A cover's "main colours" are what a person names when
 * they look at it, which is not the commonest pixels: a black sleeve with a
 * pink title is a pink record, not a black one. So the picture's pixels are
 * clustered in CIELAB (k-means, where a distance is how different two
 * colours look), and the clusters are ranked by their share of the picture
 * and by their chroma together, square root of each, so a small vivid title
 * outranks a large dull ground but a speck does not outrank a field. Four
 * are taken, each at least `PICTURE_DYE_APART` from those already taken so
 * two near-identical blues do not fill half the palette. Greys come in only
 * when the picture has fewer than four colours of its own, and when it has
 * fewer than four at all, the palette is filled with a lighter or darker
 * strength of the colours it has. A picture with nothing to give four
 * distinct dyes (a black-and-white cover: greys can only sit between
 * lightness 40 and 60, below) gives fewer, and the slots repeat them.
 *
 * **Seen on both grounds.** A palette is laid on whatever look is up, and
 * half the looks are dye over a lamp (white ground) and half dye over black.
 * PLAN 28b measured the presets by each colour's CIELAB distance from black
 * and from white and kept each palette's colours 40 or more from both; a
 * picture's colours are held to the same 40 by moving their lightness only,
 * keeping hue and chroma, so a black-and-white cover gives greys that show
 * on either ground rather than a black dye invisible on a black plate.
 *
 * **Where the colours live.** Every dye on the plate is an index into
 * `PALETTE_RGB` (constants.ts): harmonies, a look's contract, the palette
 * lock, the areas, the beads, the plate's uniforms. Rather than teach the
 * twenty-odd readers a second kind of colour, the picture's four dyes are
 * four slots after the 24 named ones (`PICTURE_DYE0`..), written here and
 * nowhere else, and the palette lock's "From picture" entry is the harmony
 * of those four slots. The named 24 and their count (`PALETTE_COUNT`, the
 * dice) are untouched, so no seeded plate changes. A projector window is
 * another page, so the cast state carries the four colours with the lock
 * (castProtocol `pictureDyes`).
 *
 * `npm run picturepalette` checks all of this: the pure part in node, and a
 * picture and a video file read through the browser's own decoders.
 */

import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE, PALETTE_RGB } from '../constants';

export type Rgb = { r: number; g: number; b: number };

/** How many dyes a picture gives: a palette's four, like the named harmonies. */
export const PICTURE_DYES = 4;
/** The first picture slot in `PALETTE_RGB`, right after the 24 named dyes. */
export const PICTURE_DYE0 = PALETTE.length;
/** The picture's dyes as a harmony: the four slots. */
export const PICTURE_HARMONY: number[] = Array.from({ length: PICTURE_DYES }, (_, i) => PICTURE_DYE0 + i);
/** The palette lock's index for "From picture": one past the named harmonies, so a saved named lock keeps its index. */
export const PICTURE_LOCK = COLOR_HARMONIES.length;
export const PICTURE_PALETTE_NAME = 'From picture';
/**
 * How long a palette chosen by hand takes to recolour the plate (PLAN 43d-6):
 * the old dye thins and the look's seed rises again in the chosen dyes, the
 * handover a Go makes, dye only. Eight seconds is a slow mood change on a
 * wall (the operating rule is 2 to 8), and long enough that a pick tried and
 * changed again a moment later is not a flash.
 */
export const PALETTE_RECOLOUR_SECONDS = 8;
/** The least CIELAB distance between two of a picture's dyes (two clearly different colours are 20 or more apart). */
export const PICTURE_DYE_APART = 18;
/** Each dye this far or more from black and from white, so it shows on a lamp look and a dark one alike (PLAN 28b's 40). */
export const PICTURE_GROUND_DE = 40;
/** Below this chroma a cluster is a grey, offered only when the picture has too few colours. */
const GREY_CHROMA = 10;
/** A cluster under this share of the picture is a speck, not a colour of it. */
const SPECK = 0.004;

// ── Colour: sRGB ⇄ CIELAB (D65) ─────────────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const XN = 0.95047, ZN = 1.08883;
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const fi = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

/** sRGB 0..1 to CIELAB. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / XN;
  const y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  const z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / ZN;
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIELAB to sRGB 0..1, clipped into the gamut. */
export function labToRgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const x = fi(fx) * XN, y = fi(fy), z = fi(fz) * ZN;
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.9692660 * x + 1.8760108 * y + 0.0415560 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, gam(Math.min(1, Math.max(0, v))))) * 1000) / 1000;
  return { r: c(R), g: c(G), b: c(B) };
}

/** How different two colours look: the CIELAB distance (CIE76). */
export const deltaE = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Moved in lightness only until it is `PICTURE_GROUND_DE` from black and from white. */
export function seenOnBothGrounds(lab: readonly number[]): [number, number, number] {
  const [, a, b] = lab;
  const ab2 = a * a + b * b;
  const need = PICTURE_GROUND_DE * PICTURE_GROUND_DE;
  // The lightness at which the distance to black (or white) is exactly the 40.
  const lo = ab2 >= need ? 0 : Math.sqrt(need - ab2);
  const hi = 100 - lo;
  return [Math.min(hi, Math.max(lo, lab[0])), a, b];
}

// ── The palette ─────────────────────────────────────────────────────

/** A small seeded generator, so the same picture always gives the same palette. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cluster = { lab: [number, number, number]; share: number; chroma: number };

/** The picture's colour clusters, k-means in CIELAB from a seeded k-means++ start. */
function clusters(labs: Float32Array, n: number, k: number): Cluster[] {
  const rand = seeded(0x43d);
  const cents: number[][] = [];
  const near = new Float32Array(n).fill(Infinity);
  cents.push([labs[0], labs[1], labs[2]].map((_, j) => labs[Math.floor(rand() * n) * 3 + j]));
  while (cents.length < k) {
    const c = cents[cents.length - 1];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = (labs[i * 3] - c[0]) ** 2 + (labs[i * 3 + 1] - c[1]) ** 2 + (labs[i * 3 + 2] - c[2]) ** 2;
      if (d < near[i]) near[i] = d;
      sum += near[i];
    }
    if (sum === 0) break;
    let r = rand() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) { r -= near[i]; if (r <= 0) { pick = i; break; } }
    cents.push([labs[pick * 3], labs[pick * 3 + 1], labs[pick * 3 + 2]]);
  }
  const own = new Int32Array(n);
  const acc = cents.map(() => [0, 0, 0, 0]);
  for (let iter = 0; iter < 16; iter++) {
    for (const a of acc) a.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < cents.length; c++) {
        const d = (labs[i * 3] - cents[c][0]) ** 2 + (labs[i * 3 + 1] - cents[c][1]) ** 2 + (labs[i * 3 + 2] - cents[c][2]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      if (own[i] !== best) moved++;
      own[i] = best;
      const a = acc[best];
      a[0] += labs[i * 3]; a[1] += labs[i * 3 + 1]; a[2] += labs[i * 3 + 2]; a[3]++;
    }
    for (let c = 0; c < cents.length; c++) if (acc[c][3] > 0) cents[c] = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
    if (iter > 0 && moved === 0) break;
  }
  return cents
    .map((c, i) => ({ lab: c as [number, number, number], share: acc[i][3] / n, chroma: Math.hypot(c[1], c[2]) }))
    .filter(c => c.share > 0);
}

/**
 * The picture's four dyes from its RGBA pixels (any layout: one picture, or
 * a video's frames side by side). Transparent pixels are not the picture's.
 * Most telling first; up to four, fewer only when no four differ by
 * `PICTURE_DYE_APART`. An empty or fully transparent picture gives none.
 */
export function paletteFromPixels(data: ArrayLike<number>): Rgb[] {
  const total = Math.floor(data.length / 4);
  // At most about 24k pixels: a 128 × 128 cover, or eight 64-pixel frames, in full.
  const step = Math.max(1, Math.floor(total / 24000));
  const labs = new Float32Array(Math.ceil(total / step) * 3);
  let n = 0;
  for (let p = 0; p < total; p += step) {
    if (data[p * 4 + 3] < 128) continue;
    const lab = rgbToLab(data[p * 4] / 255, data[p * 4 + 1] / 255, data[p * 4 + 2] / 255);
    labs[n * 3] = lab[0]; labs[n * 3 + 1] = lab[1]; labs[n * 3 + 2] = lab[2];
    n++;
  }
  if (n === 0) return [];
  const all = clusters(labs, n, Math.min(10, n)).filter(c => c.share >= SPECK);
  const rank = (c: Cluster) => Math.sqrt(c.share) * Math.sqrt(c.chroma + 2);
  const colours = all.filter(c => c.chroma >= GREY_CHROMA).sort((a, b) => rank(b) - rank(a));
  const greys = all.filter(c => c.chroma < GREY_CHROMA).sort((a, b) => b.share - a.share);

  const picked: [number, number, number][] = [];
  const take = (lab: readonly number[]) => {
    const seen = seenOnBothGrounds(lab);
    if (picked.length < PICTURE_DYES && picked.every(q => deltaE(q, seen) >= PICTURE_DYE_APART)) picked.push(seen);
  };
  for (const c of colours) take(c.lab);
  // Black and white are the paper and the ink, not the cover's colours: lifted to a mid grey they are a dull dye
  // a person did not see. They come in only when the picture has no colour at all; a real grey (silver, slate) always can.
  for (const c of colours.length ? greys.filter(g => g.lab[0] >= 20 && g.lab[0] <= 90) : greys) take(c.lab);
  // Fewer than four colours in the whole picture: a lighter and a darker strength of each, nearest first.
  for (let round = 1; picked.length < PICTURE_DYES && round <= 3; round++) {
    for (const q of picked.slice()) {
      for (const dl of [round * 22, -round * 22]) take([q[0] + dl, q[1], q[2]]);
    }
  }
  return picked.map(([L, a, b]) => labToRgb(L, a, b));
}

export const hexOf = ({ r, g, b }: Rgb) => '#' + [r, g, b].map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

// ── The slots, and the lock's view of them ───────────────────────────

/** Write the picture's dyes into their slots (the only writer). Fewer than four repeat round. */
export function setPictureDyes(colours: readonly Rgb[]): void {
  if (colours.length === 0) return;
  for (let i = 0; i < PICTURE_DYES; i++) {
    const c = colours[i % colours.length];
    PALETTE_RGB[PICTURE_DYE0 + i] = { r: c.r, g: c.g, b: c.b };
  }
}

/** The harmony a palette lock holds: a named one, the picture's, or none. */
export function lockHarmony(lock: number | null): number[] | null {
  if (lock == null) return null;
  if (lock === PICTURE_LOCK) return PICTURE_HARMONY;
  return COLOR_HARMONIES[lock] ?? null;
}

/** The name a palette lock goes by (the desk, the assistant). */
export function lockName(lock: number | null): string | null {
  if (lock == null) return null;
  return lock === PICTURE_LOCK ? PICTURE_PALETTE_NAME : COLOR_HARMONY_NAMES[lock] ?? null;
}

/** Saved picture dyes read back: four colours each 0..1, else null. */
export function readPictureDyes(raw: string | null): Rgb[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.length !== PICTURE_DYES) return null;
    const ok = v.every(c => c && typeof c === 'object' && ['r', 'g', 'b'].every(k => Number.isFinite(c[k]) && c[k] >= 0 && c[k] <= 1));
    return ok ? v.map(c => ({ r: c.r, g: c.g, b: c.b })) : null;
  } catch { return null; }
}

// ── Reading a file (the browser) ─────────────────────────────────────

/** The longest side a picture is read at: 128 pixels is every colour a cover has, for ~16k pixels. */
const READ_PX = 128;
/** A video is read at this many frames, spread across it, so its palette is the whole film's, not one shot's. */
export const VIDEO_FRAMES = 8;

function draw(src: CanvasImageSource, w: number, h: number, side: number): ImageData {
  const s = side / Math.max(w, h, 1);
  const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('this browser cannot read pictures');
  g.drawImage(src, 0, 0, cw, ch);
  return g.getImageData(0, 0, cw, ch);
}

const once = (el: HTMLMediaElement, ok: string, ms: number) => new Promise<void>((done, fail) => {
  const t = setTimeout(() => { off(); fail(new Error('that video would not open')); }, ms);
  const yes = () => { off(); done(); };
  const no = () => { off(); fail(new Error('that video would not open')); };
  const off = () => { clearTimeout(t); el.removeEventListener(ok, yes); el.removeEventListener('error', no); };
  el.addEventListener(ok, yes);
  el.addEventListener('error', no);
});

/** A video's pixels: `VIDEO_FRAMES` frames spread across it (or the one it opens on, if it has no length). */
async function videoPixels(url: string): Promise<Uint8ClampedArray> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous';
  v.src = url;
  try {
    await once(v, 'loadeddata', 10000);
    /*
      A recorded WebM (MediaRecorder's, so the app's own takes and most phone
      browsers' clips) is written as it streams and says nothing of its
      length: its duration reads Infinity until the browser has been to its
      end. A seek far past the end makes it look, and the length is known.
    */
    if (v.duration === Infinity) {
      const found = once(v, 'seeked', 5000).catch(() => {});
      v.currentTime = 1e9;
      await found;
    }
    const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    const frames: ImageData[] = [];
    for (let i = 0; i < (d ? VIDEO_FRAMES : 1); i++) {
      if (d) {
        const seek = once(v, 'seeked', 5000);
        v.currentTime = Math.min(d - 0.01, d * (i + 0.5) / VIDEO_FRAMES);
        await seek;
      }
      frames.push(draw(v, v.videoWidth, v.videoHeight, READ_PX * 0.75));
    }
    const out = new Uint8ClampedArray(frames.reduce((s, fr) => s + fr.data.length, 0));
    let at = 0;
    for (const fr of frames) { out.set(fr.data, at); at += fr.data.length; }
    return out;
  } finally {
    v.removeAttribute('src'); v.load();
  }
}

/**
 * The four dyes of a picture or video file, or of one at an address. A
 * picture is read whole; a video at `VIDEO_FRAMES` frames across its length.
 * Throws with a sentence a person can read when the file will not open.
 */
export async function paletteOfFile(file: Blob | string): Promise<Rgb[]> {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  const video = typeof file === 'string' ? /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i.test(file) : file.type.startsWith('video/');
  try {
    let data: Uint8ClampedArray;
    if (video) data = await videoPixels(url);
    else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      try { await img.decode(); } catch { throw new Error('that file would not open as a picture'); }
      data = draw(img, img.naturalWidth, img.naturalHeight, READ_PX).data;
    }
    const pal = paletteFromPixels(data);
    if (pal.length === 0) throw new Error('that picture has nothing in it to take colours from');
    return pal;
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(url);
  }
}
