/**
 * Areas of the dish: the few places a look's hands work, each with its own
 * liquid, its own dye and its own part of the music.
 *
 * Why this exists. The owner, of Velvet Underground, Lumia and Cell Bloom and
 * of the looks in general: underwhelming, with one area of interest, where a show
 * wants several in different parts of the canvas. Read off the code, every
 * look was built to have one:
 *
 *   - Every look's music works from the middle of the dish. The kick's ring
 *     of dye, the burst on the velocity route, the pulse on the density route
 *     and Beat Squeeze's press were all centred on the plate's middle, and the
 *     mid's orbiting stream circled it.
 *   - 29 of the 41 looks set Center Gravity, the concave dish that slides
 *     heavy dye toward the middle, and the dish turns about the middle.
 *   - Nothing made one part of the plate different from another for long. A
 *     look's liquids (soap, glycerine, silicone) were laid as fifteen spots
 *     anywhere and topped up wherever the automation's drops happened to land,
 *     so each was spread thin over the whole glass; the drops' colour was a
 *     fresh pick from the look's dyes each time.
 *
 * So a plate settled into one wash with one busy middle. Velvet Underground was
 * the plainest case: four pools 33 cells wide laid nearly on top of each other,
 * bass routed to both the burst and the pulse at the middle, Center Gravity 0.35.
 *
 * What a projectionist does instead is work a few places on one dish: a thick
 * pool in one corner that holds its colour, a well of soap they keep touching
 * on the beat, a spot they flick drops into. The places look different because
 * different liquids are in them, and those liquids already behave as
 * themselves in the solver (lib/liquidPhase.ts): glycerine's body thickens the
 * film so its pool moves slowly and keeps its edge, soap breaks the surface
 * tension so what rides the surface is carried off it and holes open, syrup is
 * heavy and drags where it settles, silicone makes cells. Nothing here paints
 * a region: an area is only where the look pours a liquid and its dye, and
 * where its share of the music lands. What then happens in it is the plate's
 * physics.
 *
 * An area lives in the dish's frame (grid fractions), as everything laid in
 * the dish does: it turns with the glass, and so does the hand that tends it.
 * At these looks' motor speeds a turn takes minutes.
 *
 * A look with no areas listed plays exactly as before: every caller falls back
 * to the middle and to the anywhere-at-all it always used, and draws its dice
 * in the same order.
 */
import type { Rng } from './rng';

/** Which of the music's hands land in an area. `any` takes whatever no area claims. */
export type AreaBand = 'bass' | 'mid' | 'treble' | 'any';

export interface PlateArea {
  /** Where its middle is, as fractions of the plate (0..1, the dish's frame). */
  x: number;
  y: number;
  /** Its radius as a fraction of the plate's width. */
  r: number;
  /** The liquid poured and topped up there (a DEFAULT_LIQUID_TYPES id). */
  liquid: string;
  /**
   * Its dye: an index into the look's dyes (its contract), not a palette
   * entry, so a palette lock still decides the colour and a hue journey or the
   * sequencer's steps turn every area's dye on together (areaDye). Each area
   * of a look has a different one.
   */
  dye: number;
  /** The part of the music that works here. */
  band: AreaBand;
  /** How much dye the look lays there, against a full pool at 1 (default). */
  fill?: number;
}

/**
 * The looks built on areas, by built-in id (as the dye's seed is, so a look
 * saved under a new name lays the default plate, as it lays the default dye).
 * `npm run plate` checks each entry: a look that exists, liquids that exist,
 * a dye inside its set, inside the dish, and areas apart from each other.
 */
export const PRESET_AREAS: Record<string, PlateArea[]> = {
  /*
    Velvet Underground: three pools apart on deep violet, each its own liquid.
    Top left, a thick glycerine pool of magenta that the mid's stream circles
    and folds round its edge. Right, a well of soap and raspberry where the
    bass lands: each kick drops soap into it and pushes, and the soap carries
    the dye off its surface into a ring. Low in the middle, syrup and
    ultramarine settled under the others, glittering with the treble.
  */
  'velvet-underground': [
    { x: 0.26, y: 0.34, r: 0.15, liquid: 'glycerine', dye: 1, band: 'mid' },
    { x: 0.73, y: 0.42, r: 0.14, liquid: 'soap', dye: 2, band: 'bass' },
    { x: 0.47, y: 0.73, r: 0.14, liquid: 'syrup', dye: 0, band: 'treble' },
  ],
  /*
    Lumia: Wilfred's light forms came and went in a few places on a dark field,
    never as a texture over all of it. Three veils of dye on the nearly clear
    plate, apart: two in glycerine, which holds a fold, and one with a little
    soap in it, which spreads its veil thin and opens it each time the hands
    add to it. (Water was tried there first; it carries no property, so the
    area poured nothing and was a plain patch of the plate.) No beat; what
    music reaches it takes the areas in turn.
  */
  'lumia': [
    { x: 0.30, y: 0.38, r: 0.16, liquid: 'glycerine', dye: 0, band: 'any', fill: 0.45 },
    { x: 0.71, y: 0.30, r: 0.13, liquid: 'soap', dye: 1, band: 'any', fill: 0.4 },
    { x: 0.62, y: 0.70, r: 0.12, liquid: 'glycerine', dye: 2, band: 'any', fill: 0.35 },
  ],
  /*
    Cell Bloom: a closeup look, so its areas are where its camera is. It
    followed one pool (follow mode locks onto the liquid nearest its aim and
    rides it, never cutting away), and at its 3.5x zoom its Paint Cells were
    never drawn at all: at Cell Size 0.32 a cell is too small on screen to
    resolve (plate.ts, resolved: the coarse cells start at 3.9x and are
    whole at 7.8x), measured in the lab as a plain magenta frame. Now three
    small pools sit round the middle of the plate inside one closeup frame,
    the camera holds on the middle, and the dish's turn carries the pools
    round under it: silicone and magenta (where the bass lands), oil and
    lavender (the mids), silicone and ultramarine (the treble).
  */
  'cell-bloom': [
    { x: 0.5, y: 0.425, r: 0.05, liquid: 'silicone', dye: 0, band: 'bass' },
    { x: 0.565, y: 0.5375, r: 0.05, liquid: 'oil', dye: 1, band: 'mid' },
    { x: 0.435, y: 0.5375, r: 0.05, liquid: 'silicone', dye: 2, band: 'treble' },
  ],
};

/** The areas of a look, or null for a look built the old way. */
export const plateAreas = (presetId: string | null | undefined): PlateArea[] | null =>
  (presetId && PRESET_AREAS[presetId]?.length ? PRESET_AREAS[presetId] : null);

/**
 * The areas a band works in: those that claim it, else those that claim
 * `any`, else all of them. A look need not give every band a place; the
 * band then shares the look's general places rather than going to the middle.
 */
export function areasForBand(areas: readonly PlateArea[], band: Exclude<AreaBand, 'any'>): PlateArea[] {
  const own = areas.filter(a => a.band === band);
  if (own.length) return own;
  const any = areas.filter(a => a.band === 'any');
  return any.length ? any : [...areas];
}

/**
 * The one area a band's next event lands in. With several, successive events
 * take them in turn (`n` is the band's own count), so kicks move between a
 * look's wells rather than all striking the same one, without drawing dice.
 */
export function areaForBand(areas: readonly PlateArea[], band: Exclude<AreaBand, 'any'>, n: number): PlateArea {
  const list = areasForBand(areas, band);
  return list[((Math.floor(n) % list.length) + list.length) % list.length];
}

/**
 * An area's dye as a palette index. `dyes` is the set it is read from: the
 * look's own dyes, or a palette lock's when one is on (the lock wins outright,
 * as everywhere). `lead` is how far a hue journey or the sequencer has
 * stepped: every area's dye turns on by it together, so the areas keep
 * different colours while the journey walks them.
 *
 * Not the working harmony the rest of the automation draws from. A hue
 * journey (on by default) works from one dye fewer than the look has, so an
 * area read through it wraps onto another's: Velvet Underground's soap well
 * and syrup pool came out the same colour on every step (the check-skeptic,
 * working the window through by hand).
 */
export function areaDye(a: PlateArea, dyes: readonly number[], lead = 0): number {
  const n = dyes.length;
  if (n === 0) return 0;
  const i = Math.floor(a.dye + lead);
  return dyes[((i % n) + n) % n];
}

/** An area's middle in grid cells. */
export const areaCentre = (a: PlateArea, size: number): { x: number; y: number } => ({ x: a.x * size, y: a.y * size });

/**
 * A point inside an area, in grid cells: uniform over its disc (√ of the draw,
 * so the rim gets its share), kept off the plate's edge. Two draws.
 */
export function pointInArea(a: PlateArea, size: number, rng: Pick<Rng, 'float'>, spread = 1): { x: number; y: number } {
  const ang = rng.float() * Math.PI * 2;
  const d = Math.sqrt(rng.float()) * a.r * spread * size;
  const x = Math.max(2, Math.min(size - 3, a.x * size + Math.cos(ang) * d));
  const y = Math.max(2, Math.min(size - 3, a.y * size + Math.sin(ang) * d));
  return { x, y };
}

/**
 * Which area the automation's next drop goes to: each with the weight of its
 * area (r²), so a big pool is tended more often than a small well. One draw.
 */
export function pickArea(areas: readonly PlateArea[], rng: Pick<Rng, 'float'>): PlateArea {
  let total = 0;
  for (const a of areas) total += a.r * a.r;
  let t = rng.float() * total;
  for (const a of areas) { t -= a.r * a.r; if (t <= 0) return a; }
  return areas[areas.length - 1];
}
