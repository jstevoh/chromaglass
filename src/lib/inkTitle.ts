/**
 * The song's title painted onto the plate as ink, then swept away by a wash
 * (PLAN 37x-10; the contract is the header of `scripts/inktitle.mjs`).
 *
 * The owner chose this on 2026-11-07 over a lower third drawn over the
 * picture's corner: "let titles get painted on as ink and then swept away".
 * So the title is dye in the solver's own field, poured once through the
 * solver's `pourInk` at its own grid, and what takes it away is a flow, the
 * wash below, added to the step's velocity. Nothing fades it and no shader
 * draws it (physics writes, rendering reads): the dye it leaves stays in the
 * show as colour, and the title is on the wall, in the stream and in every
 * recording at once because it is on the plate.
 *
 * Importable in node: nothing here touches a canvas until `inkTitleMask` is
 * called, which happens in the browser, once a song. The frame loop's side
 * (when to rasterise, pour and wash) is `inkTitleRun.ts`.
 */
import { dyeAbsorbances } from './dye';

/**
 * The dye's density where the mask's coverage is 1: the amount a full drop
 * lays (the lab's `dye` and a Drop's middle lay 1), so a title's strokes are
 * as deep as a drop of the same ink and read against the plate the way the
 * show's own colour does. Deeper (2 and up) and a bright look's title came
 * out as black bars; much shallower and the strokes fall under four times
 * the gaps' dye once the plate's own diffusion has had half a second.
 */
export const INK_TITLE_DENSITY = 1;

/** A line over this many characters ends in '…' at this many (two lines: the title and its artist). */
export const INK_TITLE_CHARS = 40;

export interface InkTitleCue { key: string; artist: string; title: string }
export interface InkRow { text: string; weight?: number }

const clip = (s: string) => (s.length > INK_TITLE_CHARS ? `${s.slice(0, INK_TITLE_CHARS)}…` : s);

/**
 * One title a song. `track` is the identified song (TrackIdentity's isrc,
 * title, artist), `last` the key of the title last painted, `on` the
 * switch. The key is the isrc when there is one, since two pressings of a
 * song share it and the ear's two readings of one song must not paint it
 * twice; else artist and title.
 */
export function inkTitleCue(
  last: string | null,
  track: { isrc?: string | null; title?: string | null; artist?: string | null } | null,
  on: boolean,
): InkTitleCue | null {
  if (!on || !track) return null;
  const title = (track.title ?? '').trim();
  if (!title) return null;
  const artist = (track.artist ?? '').trim();
  const isrc = (track.isrc ?? '').trim();
  const key = isrc || `${artist}\u0000${title}`;
  if (key === last) return null;
  return { key, artist: clip(artist), title: clip(title) };
}

/** '#rrggbb' (or '#rgb', as a colour picker or a pasted setting may give) as 0..1 channels, or null for anything else. */
export const inkHex = (c: string): [number, number, number] | null => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const v = parseInt(m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1], 16);
  return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255];
};

/**
 * The ink's absorbances: '' is the look's palette (its first colour, the
 * one the look is named for), a '#rrggbb' that colour. Through
 * dyeAbsorbances, so the title is the same dye a drop of that colour is.
 */
export function inkTitleInk(colour: string, palette: readonly (readonly number[])[]): [number, number, number] {
  const c = inkHex(colour) ?? (palette[0] ? [palette[0][0], palette[0][1], palette[0][2]] : [0.1, 0.1, 0.12]);
  return dyeAbsorbances(c[0], c[1], c[2]);
}

/*
  The title's width on the plate, as a fraction of it, by `size`: a
  quarter of the plate at 0 (two lines, under 8% of the plate tall: a
  credit in the corner of the eye) to 0.87 at 1, the widest a box centred on
  the plate can be and stay inside the wall's circle's square, 0.06 to 0.94
  (the check's bar, `npm run inktitle`'s mask line). The ink is measured from
  the mask itself after it is drawn and the size corrected to it, since a
  font's advance and its letters' ink differ by a side bearing a letter, and
  at 192 cells that was the difference between 0.849 and the 0.85 bar.
*/
const WIDE0 = 0.25, WIDE1 = 0.865;
/** The tallest a title may be, by `size`, so one short word does not fill the plate. */
const TALL0 = 0.075, TALL1 = 0.34;
/** The smallest letters, in cells: under it a long title at size 0 left no cell over 0.3 at 192. */
const MIN_PX = 4;
const FACE = (px: number) => `900 ${px.toFixed(2)}px -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`;
/** The wall's circle's square: a title's ink stays inside it. */
const EDGE0 = 0.06, EDGE1 = 0.94;

type Ctx = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const canvasOf = (n: number): { g: Ctx } | null => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const g = new OffscreenCanvas(n, n).getContext('2d');
    return g ? { g } : null;
  }
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = n; c.height = n;
  const g = c.getContext('2d');
  return g ? { g } : null;
};

/** The extent of the cells over 0.3, as [x0, y0, x1, y1] in cells (x1, y1 inclusive), or null. */
function inkCells(mask: Float32Array, n: number): [number, number, number, number] | null {
  let x0 = n, x1 = -1, y0 = n, y1 = -1;
  for (let j = 0; j < n; j++) {
    const row = j * n;
    for (let i = 0; i < n; i++) if (mask[row + i] > 0.3) {
      if (i < x0) x0 = i;
      if (i > x1) x1 = i;
      if (j < y0) y0 = j;
      if (j > y1) y1 = j;
    }
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/**
 * Rows of words rasterised once into a mask (`inkTitleMask`): coverage 0..1, n × n, row 0
 * at the plate's bottom as the solver's grid has it. `size` 0..1 is small
 * to the plate's width, `y` 0..1 where the ink's middle lands up the plate,
 * `angle` (radians) turns the words against the plate's own turn so they
 * read level on the wall. A row's `weight` is its height against the
 * others. A long title shrinks to fit rather than run off the wall.
 */
function rowsMask(rows: readonly InkRow[], size: number, y: number, n: number, angle: number): { mask: Float32Array; box: [number, number, number, number] } {
  const mask = new Float32Array(n * n);
  const lines = rows.map((r) => ({ text: r.text.trim(), weight: Math.max(0.05, r.weight ?? 1) })).filter((r) => r.text);
  const cv = lines.length ? canvasOf(n) : null;
  if (!cv) return { mask, box: [0, 0, 0, 0] };
  const { g } = cv;
  const s = Math.min(1, Math.max(0, size));
  const top = Math.max(...lines.map((r) => r.weight));
  const draw = (px: number, turn: number) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, n, n);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const heights = lines.map((r) => px * r.weight / top);
    const gap = 0.3 * Math.min(...heights);
    const block = heights.reduce((a, h) => a + h, 0) + gap * (lines.length - 1);
    g.translate(n / 2, n / 2);
    if (turn) g.rotate(turn);
    let at = -block / 2;
    lines.forEach((r, k) => {
      g.font = FACE(heights[k]);
      g.fillText(r.text, 0, at + heights[k] / 2);
      at += heights[k] + gap;
    });
    // A canvas counts its rows down and the plate up: turned over here, so the title reads upright on the wall.
    const px8 = g.getImageData(0, 0, n, n).data;
    for (let j = 0; j < n; j++) {
      const src = (n - 1 - j) * n * 4, dst = j * n;
      for (let i = 0; i < n; i++) mask[dst + i] = px8[src + i * 4 + 3] / 255;
    }
    return inkCells(mask, n);
  };
  /*
    The letters' size: the width the dial asks, no taller than it allows,
    and never past the wall's square. Measured on the font first, then
    twice more on the mask's own ink, since the letters' ink is narrower
    than their advance and hinting at a few cells tall is not linear.
  */
  const wide = n * (WIDE0 + (WIDE1 - WIDE0) * s), tall = n * (TALL0 + (TALL1 - TALL0) * s);
  const fitW = n * WIDE1, fitH = n * (EDGE1 - EDGE0);
  g.font = FACE(100);
  const at100 = Math.max(...lines.map((r) => {
    const m = g.measureText(r.text);
    return ((m.actualBoundingBoxLeft ?? 0) + (m.actualBoundingBoxRight ?? m.width) || m.width) * r.weight / top;
  }));
  const blockPer = lines.reduce((a, r) => a + r.weight / top, 0) + 0.3 * Math.min(...lines.map((r) => r.weight / top)) * (lines.length - 1);
  const pxFor = (want: number, inkPer: number) => {
    const byWide = want / Math.max(1e-6, inkPer), byTall = tall / blockPer;
    const fit = Math.min(fitW / Math.max(1e-6, inkPer), fitH / blockPer);
    return Math.min(fit, Math.max(MIN_PX, Math.min(byWide, byTall)));
  };
  let px = pxFor(wide, at100 / 100);
  for (let k = 0; k < 2; k++) {
    const ink = draw(px, 0);
    if (!ink) break;
    const measured = ink[2] - ink[0] + 1;
    px = pxFor(wide, measured / px);
  }
  let ink = draw(px, angle);
  if (!ink) return { mask, box: [0, 0, 0, 0] };
  /*
    Put the ink's middle where it was asked, across the middle of the plate
    and `y` up it, kept inside the wall's square: a whole-cell shift of the
    mask, so nothing is resampled and the letters stay as drawn.
  */
  const lo = Math.ceil(EDGE0 * n), hi = Math.floor(EDGE1 * n) - 1;
  const place = (a: number, b: number, mid: number) => {
    let d = Math.round(mid - (a + b + 1) / 2);
    if (a + d < lo) d = lo - a;
    if (b + d > hi) d = hi - b;
    return d;
  };
  const dx = place(ink[0], ink[2], n / 2), dy = place(ink[1], ink[3], Math.min(1, Math.max(0, y)) * n);
  if (dx || dy) {
    const moved = new Float32Array(n * n);
    for (let j = Math.max(0, -dy); j < Math.min(n, n - dy); j++) {
      const from = j * n, to = (j + dy) * n;
      for (let i = Math.max(0, -dx); i < Math.min(n, n - dx); i++) moved[to + i + dx] = mask[from + i];
    }
    mask.set(moved);
    ink = [ink[0] + dx, ink[1] + dy, ink[2] + dx, ink[3] + dy];
  }
  return { mask, box: [ink[0] / n, ink[1] / n, (ink[2] + 1) / n, (ink[3] + 1) / n] };
}

/** The song's title and its artist as two rows: the title, and under it the artist at two thirds its height. */
export const inkTitleRows = (text: { artist: string; title: string }): InkRow[] =>
  [{ text: text.title, weight: 1 }, { text: text.artist, weight: 0.68 }];

/**
 * The title rasterised once: the song's title and artist (`inkTitleRows`),
 * or any rows of words (a title card, the words a phone pours). `box` is its
 * ink's extent [x0, y0, x1, y1] in plate fractions, worked out from the mask
 * itself, which the wash aims at.
 */
export function inkTitleMask(text: { artist: string; title: string } | readonly InkRow[], size: number, y: number, n: number, angle = 0) {
  return rowsMask(Array.isArray(text) ? text : inkTitleRows(text as { artist: string; title: string }), size, y, n, angle);
}

/** The wash's strength by the dial: nothing at 0, rising faster than the dial so its gentle end is a drift. */
export function inkTitleSweep(dial: number): number {
  const d = Math.min(1, Math.max(0, dial));
  return d * d;
}

/*
  The wash (what takes the title away). A real flow, added to the step's
  velocity, never a fade: the owner asked for the title to be swept away,
  and a liquid sweeps by carrying. Two parts, both over the rows the title
  lies in and a margin round them, tapered to nothing at the margin's edge:

    a drift across the plate, as liquid running across a tilted dish: on
    its own it slides the title along intact (the check's reading follows a
    title that slid, so a drift alone never makes it "gone");

    and stirring, cells a sixth of the plate across, turning against each
    other and travelling, as the eddies a wash breaks into: what breaks the
    letters up. The cells come from a stream function, so the push itself
    neither piles liquid up nor thins it (the solver's projection would take
    out whatever did, and a push it takes out is velocity spent for
    nothing).

  The title is given time to be read first: the stirring waits HOLD·(1 −
  dial) seconds and then comes in, over 1.5 s at the dial's bottom and 0.4 s
  at its top, which is how a wash arrives after a tilt. At the default (0.5)
  the title reads for about three seconds and is broken up before twelve; at
  the top the stirring starts at once and takes it in under two; at 0.01 the
  drift is all there is for six seconds and the title sits there, readable
  (the dial's gentle end, the owner's rule that every dial runs gentle to
  extreme).

  Measured (`npm run inktitle`, SwiftShader, 2026-11-08): on the lab's plate
  0.944 when it lands, 0.919 at 3 s and gone at 6 s at the default, gone at
  1.5 s at the top, 0.900 at 6 s at 0.01, and every arm's dye still on the
  plate (873 to 985 of 870 poured). The check steps the old plate; every look
  opens on the thin gap (PLAN 18a), where a push in the deltas is a solid
  moving the liquid up to its own speed and no faster, so it does not pile up
  step on step as it does on the old plate. The same arms run on the thin gap
  read 0.949 when it lands, 0.915 at 3 s, gone at 8.5 s at the default and at
  1 s at the top, with 870 of 870 kept: the strengths below are the ones
  that meet the bars on both plates. A first pair, half as strong, met them
  on the old plate and left the title at 0.317 after 12 s on the thin one.
*/
const HOLD = 5.5, RISE = 1.5;
/**
 * How long the stirring runs at full strength before the wash passes, in
 * seconds; it then dies away over RISE and writes nothing more. By then the
 * title is long broken up at any dial above the gentlest, and a push that
 * went on for ever would be a flow the look never asked for.
 */
const PASS = 10;
/** The drift and the stirring at full strength, in the solver's velocity units per second of push. */
const DRIFT = 0.6, STIR = 26;
/** The stirring's cells: a sixth of the plate across. */
const CELLS = 6;
/** How fast the cells travel and turn, in radians a second. */
const TURN = 1.3;

/**
 * Add the wash's push over a step of `seconds`, `since` seconds after the
 * title landed, to the step's velocity deltas (L × L × 4: vx, vy, temp, gap,
 * as the solver's applyDeltas takes them). Writes only the rows the title
 * lies in and a margin of one stirring cell round them, and gives those rows
 * back ([first, last], cells) so the caller sends only them; null when it
 * wrote nothing (the dial at 0, or the wash has passed). No allocation.
 */
export function inkTitleWash(seconds: number, since: number, dial: number, box: readonly number[], velAdd: Float32Array, L: number): [number, number] | null {
  const s = inkTitleSweep(dial);
  if (!(s > 0) || !(seconds > 0) || box.length < 4) return null;
  const hold = HOLD * (1 - Math.min(1, dial));
  // The eddies come in over a second and a half at the default and in under half a second at the top: a hard wash arrives hard.
  const rise = 0.4 + (RISE - 0.4) * (1 - Math.min(1, dial));
  const left = hold + rise + PASS + RISE - since;
  if (left <= 0) return null;
  const smooth = (t: number) => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };
  const passing = smooth(left / RISE);
  const stir = STIR * s * smooth((since - hold) / rise) * passing * seconds;
  const drift = DRIFT * Math.sqrt(s) * passing * seconds;
  const cell = L / CELLS, k = Math.PI / cell;
  const pad = cell;
  const b0 = box[1] * L, b1 = box[3] * L;
  const y0 = Math.max(0, Math.floor(b0 - pad)), y1 = Math.min(L - 1, Math.ceil(b1 + pad));
  const phase = TURN * since;
  const c = Math.cos(phase), sn = Math.sin(phase);
  for (let j = y0; j <= y1; j++) {
    const y = j + 0.5;
    // The taper: 1 over the title's rows, falling to 0 over the margin on a half cosine, and its slope.
    const out = y < b0 ? (b0 - y) / pad : y > b1 ? (y - b1) / pad : 0;
    if (out >= 1) continue;
    const env = 0.5 + 0.5 * Math.cos(Math.PI * out);
    const denv = out === 0 ? 0 : (y < b0 ? 1 : -1) * 0.5 * Math.PI / pad * Math.sin(Math.PI * out);
    const sy = Math.sin(k * y), cy = Math.cos(k * y);
    const row = j * L * 4;
    for (let i = 0; i < L; i++) {
      const x = i + 0.5 + phase * cell / Math.PI;
      const sx = Math.sin(k * x), cx = Math.cos(k * x);
      // ψ = env(y)·(cos φ · sin kx sin ky + sin φ · cos kx cos ky): two sets of cells half a cell apart, taking turns.
      const psi = c * sx * sy + sn * cx * cy;
      const dpdy = k * (c * sx * cy - sn * cx * sy);
      const dpdx = k * (c * cx * sy - sn * sx * cy);
      const o = row + i * 4;
      velAdd[o] += drift * env + stir * (env * dpdy + denv * psi) / k;
      velAdd[o + 1] += -stir * env * dpdx / k;
    }
  }
  return [y0, y1];
}
