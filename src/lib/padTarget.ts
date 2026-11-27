/**
 * A pad that is a hand on the plate (PLAN 30c): the MIDI targets behind the
 * controller's grid when it plays the liquid instead of picking looks.
 *
 * The owner, 2026-11-27: "I want the pads to be reactive to momentary
 * presses - splatter, presses, etc. can we also combine colors, liquids, and
 * a tool into rows in various ways?" A pad is three choices made at once: a
 * tool, a liquid and a colour. A layout (lib/padLayouts.ts) puts two of them
 * on the grid's rows and columns and leaves the third to the hand, which a
 * row of buttons picks (`hand`): so one hit pours a chosen colour of a chosen
 * liquid with a chosen tool, and the third is whatever was picked last.
 *
 * Kept apart from lib/midi.ts (77 KB, past the size budget's warning) and
 * free of it, so midi.ts can check a loaded map's pads with these without
 * an import cycle.
 */

/**
 * The tools a pad can be, in the order the Liquids × Tools layout lays them
 * left to right: the three that lay liquid in drops, the two that lay it in
 * a stream or mist, then the three hands that move what is there.
 *
 * `finger` is Stir on a pad (a finger held in the liquid circles, since a
 * finger that does not move mixes nothing), `streak` a stroke drawn up the
 * pad's lane while it is held.
 */
export const PAD_TOOLS = ['dropper', 'splatter', 'pour', 'spray', 'streak', 'press', 'blow', 'finger'] as const;
export type PadTool = typeof PAD_TOOLS[number];

/** What each tool is called on the controller's picture and in the MIDI panel. */
export const PAD_TOOL_LABELS: Record<PadTool, string> = {
  dropper: 'Drip', splatter: 'Splatter', pour: 'Pour', spray: 'Spray',
  streak: 'Streak', press: 'Press', blow: 'Blow', finger: 'Stir',
};

/** The tools that lay liquid, and so carry a colour and a liquid; the rest only move what is on the plate. */
export const LAYING_PAD_TOOLS: ReadonlySet<PadTool> = new Set<PadTool>(['dropper', 'splatter', 'pour', 'spray', 'streak']);

export const isPadTool = (t: unknown): t is PadTool => typeof t === 'string' && (PAD_TOOLS as readonly string[]).includes(t);

/**
 * A pad: what it lays, with what, and where.
 *
 * Each of `tool`, `liquid` and `dye` left out is the one in hand: the app's
 * active tool, the bottle picked on the bench, the dye picked for it. `lane`
 * is the pad's column, 0..7 left to right, which is where on the wall it
 * lands, so the grid's left pads pour on the left of the picture: the grid
 * is a map of the wall as well as a menu.
 */
export interface PadTarget {
  kind: 'pad';
  tool?: PadTool;
  /** A bottle id (`bottles.ts`). */
  liquid?: string;
  /** A palette index (`constants.ts`'s PALETTE). */
  dye?: number;
  lane: number;
}

/** A button that picks the tool or the bottle in hand (the dye is the existing `dye` target). */
export interface HandTarget {
  kind: 'hand';
  tool?: PadTool;
  liquid?: string;
}

/** A knob on one tool's Amount (lib/toolAmount.ts), the per-tool size the mouse already had. */
export interface ToolAmountTarget {
  kind: 'toolAmount';
  tool: PadTool;
}

/**
 * A button that steps the grid to the next or the previous layout
 * (lib/padLayouts.ts), keeping every binding off the grid: the faders, the
 * knobs and anything learned stay where the hand left them.
 */
export interface PadLayoutTarget {
  kind: 'padLayout';
  step: 1 | -1;
}

export type PadFamilyTarget = PadTarget | HandTarget | ToolAmountTarget | PadLayoutTarget;

export const PAD_LANES = 8;

const liquidId = (v: unknown): string | undefined => (typeof v === 'string' && /^[a-z0-9_-]{1,40}$/i.test(v) ? v : undefined);
const dyeIndex = (v: unknown): number | undefined => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < 64 ? v as number : undefined);

/**
 * A pad, hand or tool-amount target from a file, checked rather than
 * trusted (a map is a file people edit by hand), or null to drop it.
 */
export function cleanPadTarget(t: { kind?: unknown } & Record<string, unknown>): PadFamilyTarget | null {
  if (t.kind === 'pad') {
    const lane = Number.isInteger(t.lane) ? Math.max(0, Math.min(PAD_LANES - 1, t.lane as number)) : 0;
    const out: PadTarget = { kind: 'pad', lane };
    if (isPadTool(t.tool)) out.tool = t.tool;
    const liquid = liquidId(t.liquid); if (liquid) out.liquid = liquid;
    const dye = dyeIndex(t.dye); if (dye !== undefined) out.dye = dye;
    return out;
  }
  if (t.kind === 'hand') {
    if (isPadTool(t.tool)) return { kind: 'hand', tool: t.tool };
    const liquid = liquidId(t.liquid);
    return liquid ? { kind: 'hand', liquid } : null;
  }
  if (t.kind === 'toolAmount') return isPadTool(t.tool) ? { kind: 'toolAmount', tool: t.tool } : null;
  if (t.kind === 'padLayout') return { kind: 'padLayout', step: t.step === -1 ? -1 : 1 };
  return null;
}

/** The label the MIDI panel shows for one of these. */
export function padTargetLabel(t: PadFamilyTarget, liquidName: (id: string) => string = id => id, dyeName: (i: number) => string = i => `Dye ${i + 1}`): string {
  if (t.kind === 'toolAmount') return `${PAD_TOOL_LABELS[t.tool]} Amount`;
  if (t.kind === 'padLayout') return t.step > 0 ? 'Pad Layout: Next' : 'Pad Layout: Previous';
  if (t.kind === 'hand') return t.tool ? `In hand: ${PAD_TOOL_LABELS[t.tool]}` : `In hand: ${liquidName(t.liquid ?? '')}`;
  const parts = [
    t.tool ? PAD_TOOL_LABELS[t.tool] : 'Tool in hand',
    t.tool && !LAYING_PAD_TOOLS.has(t.tool) ? null : (t.liquid ? liquidName(t.liquid) : 'liquid in hand'),
    t.tool && !LAYING_PAD_TOOLS.has(t.tool) ? null : (t.dye !== undefined ? dyeName(t.dye) : 'colour in hand'),
  ].filter(Boolean);
  return `Pad ${t.lane + 1}: ${parts.join(' · ')}`;
}

/**
 * A tool's Amount from a knob's travel: the middle of the knob is 1 (what the
 * tool always did), the ends a fifth and five times that, evenly in ratio, so
 * each eighth of a turn is the same step up or down whatever the knob reads.
 * The Amount's own range is 0.05..5 (TOOL_AMOUNT); the knob stops at 0.2 so
 * its bottom is still a hit, not nothing.
 */
export const amountOfKnob = (v01: number): number => Math.pow(5, Math.max(-1, Math.min(1, v01 * 2 - 1)));
/** And back, for the knob's LED ring. */
export const knobOfAmount = (a: number): number => Math.max(0, Math.min(1, (Math.log(Math.max(1e-6, a)) / Math.log(5) + 1) / 2));
