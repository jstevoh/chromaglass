/**
 * The APC40 mkII's grid, laid four ways (PLAN 30c).
 *
 * The owner, 2026-11-27: "can we also combine colors, liquids, and a tool
 * into rows in various ways?" A hit on the plate is three choices, a tool, a
 * liquid and a colour, and the grid has two directions. So each layout puts
 * two of the three on the grid, one down its five rows and one across its
 * eight columns, and puts the third on the row of Track Select buttons under
 * it, which picks it into the hand for every pad at once:
 *
 *   - **Tools × Colours**: a row per tool (Drip, Splatter, Pour, Spray, Press),
 *     a colour per column; Track Select picks the liquid. For playing one
 *     liquid with every hand.
 *   - **Liquids × Colours**: a row per liquid (Water, Oil, Alcohol, Syrup,
 *     Milk), a colour per column; Track Select picks the tool. For painting.
 *   - **Liquids × Tools**: a row per liquid, a tool per column (Drip to Stir);
 *     Track Select picks the colour. For playing the chemistry: the same
 *     colour as five liquids that behave five ways.
 *   - **Looks**: the grid as it was, looks from the top row down and the
 *     palette along the bottom.
 *
 * A column is a lane on the wall as well (lib/padTarget.ts), left to right,
 * in every layout, so a hand moving along a row moves along the picture.
 * The colours across are a spectrum, red at the left to pink at the right,
 * so a row reads as a rainbow and a colour is found by where it sits.
 *
 * Only the grid and the Track Select row change: the faders, the knobs and
 * anything learned onto other controls stay, so switching layouts mid-song
 * (Bank ◀ ▶) never moves a fader's job.
 */
import { apc40Mk2Map, type MidiBinding, type MidiMap, type MidiSource, type MidiTarget } from './midi.ts';
import { PAD_TOOLS, type PadTool } from './padTarget.ts';

export const PAD_LAYOUTS = ['looks', 'tools-colours', 'liquids-colours', 'liquids-tools'] as const;
export type PadLayout = typeof PAD_LAYOUTS[number];

export const PAD_LAYOUT_LABELS: Record<PadLayout, string> = {
  'looks': 'Looks',
  'tools-colours': 'Tools × Colours',
  'liquids-colours': 'Liquids × Colours',
  'liquids-tools': 'Liquids × Tools',
};

/** One line each, for the Grid layout buttons in Settings → Controller. */
export const PAD_LAYOUT_HELP: Record<PadLayout, string> = {
  'looks': 'The grid picks looks; the bottom row picks the colour.',
  'tools-colours': 'A row for each tool (Drip, Splatter, Pour, Spray, Press), a colour on each pad. Track Select picks the liquid.',
  'liquids-colours': 'A row for each liquid (Water, Oil, Alcohol, Syrup, Milk), a colour on each pad. Track Select picks the tool.',
  'liquids-tools': 'A row for each liquid, a tool on each pad (Drip to Stir). Track Select picks the colour.',
};

/** The colours across the grid, left to right, as palette indices (constants.ts): Cherry Red, Orange, Yellow, Limpid Green, Icy Blue, Blue Cheer, Purple, Hot Pink. */
export const PAD_DYES = [3, 1, 0, 6, 7, 8, 10, 2] as const;
/**
 * The five liquids down the rows, top to bottom: the carrier, then the four
 * that behave most unlike it and each other in a thin dish: oil will not mix
 * and rises, alcohol mixes and rises and pushes the film away (Marangoni),
 * syrup mixes slowly and sinks, milk scatters the light.
 */
export const PAD_LIQUIDS = ['water', 'oil', 'alcohol', 'syrup', 'milk'] as const;
/** The liquids Track Select picks in Tools × Colours: the rows' five, then ink, soap and ferrofluid. */
export const HAND_LIQUIDS = [...PAD_LIQUIDS, 'ink', 'soap', 'ferrofluid'] as const;
/** The tools down Tools × Colours' rows, top to bottom. Press is the bottom row, nearest the hand. */
export const ROW_TOOLS: readonly PadTool[] = ['dropper', 'splatter', 'pour', 'spray', 'press'];

const ROWS = 5, COLS = 8;
/** APC40 mkII: the clip grid is notes 0–39 on channel 1, row 1 (the bottom) first; Track Select is note 51 on channels 1–8. */
const GRID_TOP = ROWS * COLS;
const TRACK_SELECT = 0x33;

const note = (number: number, channel = 0): MidiSource => ({ kind: 'note', channel, number });
const bind = (source: MidiSource, target: MidiTarget): MidiBinding =>
  ({ id: `note:${source.channel}:${source.number}->${target.kind}`, source, target, mode: 'absolute' });
/** The pad `row` down from the top, `col` across from the left. */
const pad = (row: number, col: number) => note((ROWS - 1 - row) * COLS + col);

/** Whether a binding is on the part of the board a layout lays: the grid and Track Select. */
export const isGridBinding = (b: MidiBinding): boolean =>
  b.source.kind === 'note' && ((b.source.channel === 0 && b.source.number < GRID_TOP) || b.source.number === TRACK_SELECT);

/** The grid's and Track Select's bindings for a layout. */
export function padLayoutBindings(layout: PadLayout, presetIds: string[]): MidiBinding[] {
  const b: MidiBinding[] = [];
  switch (layout) {
    case 'looks':
      return apc40Mk2Map(presetIds).bindings.filter(isGridBinding);
    case 'tools-colours':
      ROW_TOOLS.forEach((tool, row) => {
        for (let col = 0; col < COLS; col++) {
          b.push(bind(pad(row, col), tool === 'press' ? { kind: 'pad', tool, lane: col } : { kind: 'pad', tool, dye: PAD_DYES[col], lane: col }));
        }
      });
      HAND_LIQUIDS.forEach((liquid, ch) => b.push(bind(note(TRACK_SELECT, ch), { kind: 'hand', liquid })));
      return b;
    case 'liquids-colours':
      PAD_LIQUIDS.forEach((liquid, row) => {
        for (let col = 0; col < COLS; col++) b.push(bind(pad(row, col), { kind: 'pad', liquid, dye: PAD_DYES[col], lane: col }));
      });
      PAD_TOOLS.forEach((tool, ch) => b.push(bind(note(TRACK_SELECT, ch), { kind: 'hand', tool })));
      return b;
    case 'liquids-tools':
      PAD_LIQUIDS.forEach((liquid, row) => {
        PAD_TOOLS.forEach((tool, col) => b.push(bind(pad(row, col), { kind: 'pad', liquid, tool, lane: col })));
      });
      PAD_DYES.forEach((paletteIndex, ch) => b.push(bind(note(TRACK_SELECT, ch), { kind: 'dye', paletteIndex })));
      return b;
  }
}

/** The map with its grid laid out as `layout`, and everything off the grid as it was. */
export function withPadLayout(map: MidiMap, layout: PadLayout, presetIds: string[]): MidiMap {
  return { ...map, bindings: [...map.bindings.filter(b => !isGridBinding(b)), ...padLayoutBindings(layout, presetIds)] };
}

/** Which layout the grid is in, read off its top-left pad, or null for a grid laid by hand. */
export function padLayoutOf(map: MidiMap): PadLayout | null {
  const corner = map.bindings.find(b => b.source.kind === 'note' && b.source.channel === 0 && b.source.number === (ROWS - 1) * COLS && b.bank === undefined);
  const t = corner?.target;
  if (!t) return null;
  if (t.kind === 'preset') return 'looks';
  if (t.kind !== 'pad') return null;
  if (t.tool && t.dye !== undefined) return 'tools-colours';
  if (t.liquid && t.dye !== undefined) return 'liquids-colours';
  if (t.liquid && t.tool) return 'liquids-tools';
  return null;
}

/** The layout `step` along from this one (round the four), or the first pad layout from a grid laid by hand. */
export function steppedLayout(current: PadLayout | null, step: 1 | -1): PadLayout {
  if (current === null) return 'tools-colours';
  const i = PAD_LAYOUTS.indexOf(current);
  return PAD_LAYOUTS[(i + step + PAD_LAYOUTS.length) % PAD_LAYOUTS.length];
}
