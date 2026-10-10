/**
 * The desk's layouts: which panels are out, where, and how.
 *
 * There used to be two desks, Perform and Design, each a hard-coded screen of
 * three columns. Everything a show is played with was on one or the other,
 * and anything else was in the Settings sheet, one section at a time, with
 * the plate hidden behind it. The owner's Desk v2 design (2026-10-10) makes
 * it one desk whose cells are filled from a *layout*: every settings section
 * is a panel with the section's own id, and a panel can sit in the left
 * column, the right column or the deck under the plate, float over the plate,
 * fold to its header, or go away. Build, Gig and Load-in are three shipped
 * layouts of the same panels, and switching between them never changes a
 * value: what changes is what is on the screen.
 *
 * Built the way `deskPins.ts` keeps the rides: a layout is written to storage
 * only once it differs from the one that shipped. That is the lesson of the
 * rides, which were saved the first time a desk opened, so everyone who had
 * opened it once kept that day's strip and never saw a new one. Here a layout
 * nobody has touched is the shipped one, read from this file each time, and
 * "Reset layout" is removing the stored copy.
 *
 * Pure apart from `loadLayout` and `saveLayout`, so `npm run desklayout`
 * drives every operation in node.
 */

import { SETTINGS_SECTIONS, SECTION_BY_ID } from './settingsMap.ts';
import { PINNABLE } from './deskPins.ts';

/** The three shipped layouts. Stored under these names. */
export type LayoutName = 'build' | 'gig' | 'loadin';
export const LAYOUT_NAMES: LayoutName[] = ['build', 'gig', 'loadin'];
export const LAYOUT_LABEL: Record<LayoutName, string> = { build: 'Build', gig: 'Gig', loadin: 'Load-in' };

/**
 * Where a docked panel can sit. `left` and `right` are the columns either side
 * of the plate; `deck` is the row of panels under it.
 */
export type Slot = 'left' | 'right' | 'deck';
export const SLOTS: Slot[] = ['left', 'right', 'deck'];

export interface FloatingPanel { id: string; x: number; y: number; w: number; h: number }

/**
 * What the plate is doing while this layout is up.
 *
 * `live` is the show: the sequencer, a song's show and a new song's look all
 * get to change the settings. `preview` is building: they hold off, so a look
 * is not rewritten under the hand building it. That hold is what the Design
 * desk was for (`suspended: designing` in App), and Preview is where it lives
 * now. Preview does not yet edit an offline copy of the plate (PLAN.md 8b).
 */
export type PlateMode = 'live' | 'preview';

export interface DeskLayout {
  left: string[];
  right: string[];
  deck: string[];
  floating: FloatingPanel[];
  /** Panels folded to their header, wherever they are. */
  collapsed: string[];
  /** The deck down to a strip of chips, so the plate takes its height. */
  deckCollapsed: boolean;
  plateMode: PlateMode;
}

// ── The panels ───────────────────────────────────────────────────────

/**
 * How a panel's body is drawn.
 *
 *  - `own`: one of the desk's own panels (the cue list, the rides, the bottles).
 *  - `knobs`: a settings section drawn as its controls: a knob for each, or a
 *    slider for the ones learned to a fader. The rest of the section (its
 *    switches and pickers) is one click away in the sheet.
 *  - `section`: the settings section itself, as the sheet draws it. For the
 *    sections whose point is not a number: the corner pin, the controller's
 *    map, the input picker, the patch bay.
 *  - `mixer`: the Mixer, which has its own panel component.
 */
export type PanelKind = 'own' | 'knobs' | 'section' | 'mixer';

export interface PanelSpec {
  id: string;
  name: string;
  /** The panel browser's group: a settings category, or `live` for the desk's own. */
  category: string;
  kind: PanelKind;
  /** Its width in the deck. Four knobs fit 266. */
  deckWidth: number;
}

/**
 * The desk's own panels: the halves of the two old desks that were not a
 * settings section. Their ids are not section ids, so they cannot collide.
 */
const OWN: PanelSpec[] = [
  { id: 'cues',    name: 'Cues',    category: 'live',  kind: 'own', deckWidth: 304 },
  { id: 'rides',   name: 'Rides',   category: 'live',  kind: 'own', deckWidth: 312 },
  { id: 'recipe',  name: 'Recipe',  category: 'live',  kind: 'own', deckWidth: 320 },
  { id: 'bottles', name: 'Bottles', category: 'plate', kind: 'own', deckWidth: 312 },
  { id: 'dyes',    name: 'Dyes',    category: 'plate', kind: 'own', deckWidth: 360 },
  { id: 'tools',   name: 'Tools',   category: 'plate', kind: 'own', deckWidth: 340 },
  { id: 'phone',   name: 'Phone · iPad', category: 'stage', kind: 'own', deckWidth: 304 },
];

/**
 * Sections drawn whole rather than as knobs: there is nothing, or nearly
 * nothing, in them that is a number, or the numbers are not the point.
 */
const WHOLE = new Set(['audio-input', 'room', 'film', 'patches', 'midi', 'liquids', 'projectors', 'mapping', 'mark', 'simulation']);

/** Wider in the deck: the patch bay's rows and the Wall's corner pin need the room. */
const WIDE: Record<string, number> = { patches: 340, projectors: 340, mapping: 312, midi: 312, 'audio-input': 312, simulation: 304, mixer: 312 };

const FROM_SECTIONS: PanelSpec[] = SETTINGS_SECTIONS.map(s => ({
  id: s.id,
  name: s.name,
  category: s.category,
  kind: s.id === 'mixer' ? 'mixer' : WHOLE.has(s.id) || !PINNABLE.some(p => p.section === s.id) ? 'section' : 'knobs',
  deckWidth: WIDE[s.id] ?? 266,
}));

export const PANELS: PanelSpec[] = [...OWN, ...FROM_SECTIONS];
export const PANEL_BY_ID = new Map(PANELS.map(p => [p.id, p]));

/**
 * The Stage sections are the room and the machine, not the look, and the
 * design keeps them out of the way: in Build and Gig they live in the Stage
 * sheet (⌘,), and only Load-in, the layout for setting up a room, opens them
 * as panels.
 */
export const isStagePanel = (id: string): boolean => PANEL_BY_ID.get(id)?.category === 'stage';
export const panelAllowed = (layout: LayoutName, id: string): boolean =>
  PANEL_BY_ID.has(id) && (layout === 'loadin' || !isStagePanel(id));

// ── The shipped layouts ──────────────────────────────────────────────

const empty = (): Omit<DeskLayout, 'plateMode'> => ({ left: [], right: [], deck: [], floating: [], collapsed: [], deckCollapsed: false });

/*
  Build is the old Design desk's job: the materials on the right, the look's
  controls in the deck. The recipe leads the deck because it is the strip the
  owner chose (the controls a look is built from, `DEFAULT_RECIPE`), then the
  four sections the design puts there, then the patch bay.

  It ships on Preview, not Live as the design drew it: Build is where today's
  Design desk is, and that desk holds the sequencer and the song shows off so
  a look is not rewritten while it is being made. Live is one click away on
  the plate bar, and stays chosen for Build once picked.

  Gig is the old Perform desk: the set on the left, the rides on the right,
  the dyes, tools and patches under the plate. Load-in is new: the controller
  and the sound on the left, the wall and its mapping on the right, the
  machine and the phone link in the deck.
*/
export const SHIPPED: Record<LayoutName, DeskLayout> = {
  build: { ...empty(), right: ['bottles', 'dyes', 'tools'], deck: ['recipe', 'physics', 'camera', 'audio-mappings', 'macro', 'patches'], plateMode: 'preview' },
  gig: { ...empty(), left: ['cues'], right: ['rides'], deck: ['dyes', 'tools', 'patches'], plateMode: 'live' },
  loadin: { ...empty(), left: ['midi', 'audio-input'], right: ['projectors', 'mapping'], deck: ['simulation', 'phone'], plateMode: 'live' },
};

export const shippedLayout = (name: LayoutName): DeskLayout => structuredClone(SHIPPED[name]);

// ── Asking where a panel is ──────────────────────────────────────────

export type Where = Slot | 'float' | null;

export function whereIs(l: DeskLayout, id: string): Where {
  for (const s of SLOTS) if (l[s].includes(id)) return s;
  return l.floating.some(f => f.id === id) ? 'float' : null;
}

/** Every panel that is out, docked or floating, in reading order. */
export const openPanels = (l: DeskLayout): string[] => [...l.left, ...l.right, ...l.deck, ...l.floating.map(f => f.id)];

// ── Changing one ─────────────────────────────────────────────────────

/** Take a panel out of wherever it is. Its collapsed state goes with it. */
function lift(l: DeskLayout, id: string): DeskLayout {
  return {
    ...l,
    left: l.left.filter(x => x !== id),
    right: l.right.filter(x => x !== id),
    deck: l.deck.filter(x => x !== id),
    floating: l.floating.filter(f => f.id !== id),
  };
}

/** Dock a panel in a slot, at an index (the end by default). Moves it if it was elsewhere. */
export function dockPanel(l: DeskLayout, id: string, slot: Slot, index?: number): DeskLayout {
  if (!PANEL_BY_ID.has(id)) return l;
  const out = lift(l, id);
  const list = [...out[slot]];
  const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, index));
  list.splice(at, 0, id);
  return { ...out, [slot]: list };
}

/** The size a panel floats at when nothing says otherwise. */
export const FLOAT_SIZE = { w: 312, h: 360 };

/** Float a panel at a rectangle. Moves it out of its slot if it was docked. */
export function floatPanel(l: DeskLayout, id: string, rect?: Partial<Omit<FloatingPanel, 'id'>>): DeskLayout {
  if (!PANEL_BY_ID.has(id)) return l;
  const was = l.floating.find(f => f.id === id);
  const out = lift(l, id);
  const f: FloatingPanel = {
    id,
    x: rect?.x ?? was?.x ?? 120,
    y: rect?.y ?? was?.y ?? 120,
    w: rect?.w ?? was?.w ?? FLOAT_SIZE.w,
    h: rect?.h ?? was?.h ?? FLOAT_SIZE.h,
  };
  return { ...out, floating: [...out.floating, f] };
}

/** Move or resize a floating panel without changing its stacking. */
export function placeFloating(l: DeskLayout, id: string, rect: Partial<Omit<FloatingPanel, 'id'>>): DeskLayout {
  return { ...l, floating: l.floating.map(f => (f.id === id ? { ...f, ...rect } : f)) };
}

/** Bring a floating panel to the front: the last one is drawn on top. */
export function raiseFloating(l: DeskLayout, id: string): DeskLayout {
  const f = l.floating.find(x => x.id === id);
  if (!f || l.floating[l.floating.length - 1] === f) return l;
  return { ...l, floating: [...l.floating.filter(x => x !== f), f] };
}

export function closePanel(l: DeskLayout, id: string): DeskLayout {
  const out = lift(l, id);
  return { ...out, collapsed: out.collapsed.filter(x => x !== id) };
}

/** Open a panel that is not out, where it goes by default; a panel already out is left where it is. */
export function openPanel(l: DeskLayout, id: string, where: Slot | 'float' = 'deck'): DeskLayout {
  if (whereIs(l, id)) return l;
  return where === 'float' ? floatPanel(l, id) : dockPanel(l, id, where);
}

export function toggleCollapsed(l: DeskLayout, id: string): DeskLayout {
  const on = l.collapsed.includes(id);
  return { ...l, collapsed: on ? l.collapsed.filter(x => x !== id) : [...l.collapsed, id] };
}

export function collapseAll(l: DeskLayout, on: boolean): DeskLayout {
  return { ...l, collapsed: on ? openPanels(l) : [] };
}

// ── Keeping it ───────────────────────────────────────────────────────

const KEY = (name: LayoutName) => `chromaglass-desk-layout:${name}`;

/** The same panels in the same places, which is all "unchanged" means. */
export function sameLayout(a: DeskLayout, b: DeskLayout): boolean {
  const list = (x: string[]) => x.join('|');
  const fl = (x: FloatingPanel[]) => x.map(f => `${f.id}@${Math.round(f.x)},${Math.round(f.y)},${Math.round(f.w)},${Math.round(f.h)}`).join('|');
  return list(a.left) === list(b.left) && list(a.right) === list(b.right) && list(a.deck) === list(b.deck)
    && fl(a.floating) === fl(b.floating) && [...a.collapsed].sort().join('|') === [...b.collapsed].sort().join('|')
    && a.deckCollapsed === b.deckCollapsed && a.plateMode === b.plateMode;
}

/**
 * A stored layout, made safe to lay out.
 *
 * Read from storage, so it may come from an older build or a hand edit: a
 * panel id this build does not have is dropped, a panel in two places keeps
 * the first, a Stage panel outside Load-in goes back to the Stage sheet, a
 * floating rectangle is clamped to something that can be grabbed, and
 * anything that is not a layout at all is the shipped one.
 */
export function sanitizeLayout(name: LayoutName, raw: unknown): DeskLayout {
  const base = shippedLayout(name);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const r = raw as Partial<Record<keyof DeskLayout, unknown>>;
  const seen = new Set<string>();
  // One pass, so a panel twice in the same list keeps its first place too.
  const ids = (v: unknown): string[] => {
    const out: string[] = [];
    for (const id of Array.isArray(v) ? v : []) {
      if (typeof id !== 'string' || !panelAllowed(name, id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  };
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  const left = ids(r.left), right = ids(r.right), deck = ids(r.deck);
  const floating: FloatingPanel[] = [];
  for (const f of Array.isArray(r.floating) ? r.floating : []) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !panelAllowed(name, f.id) || seen.has(f.id)) continue;
    seen.add(f.id);
    floating.push({ id: f.id, x: num(f.x, 0, 4000, 120), y: num(f.y, 0, 3000, 120), w: num(f.w, 220, 1200, FLOAT_SIZE.w), h: num(f.h, 120, 1200, FLOAT_SIZE.h) });
  }
  const collapsed = (Array.isArray(r.collapsed) ? r.collapsed : []).filter((id): id is string => typeof id === 'string' && seen.has(id));
  return {
    left, right, deck, floating, collapsed,
    deckCollapsed: r.deckCollapsed === true,
    plateMode: r.plateMode === 'live' || r.plateMode === 'preview' ? r.plateMode : base.plateMode,
  };
}

export function loadLayout(name: LayoutName): DeskLayout {
  try {
    const raw = localStorage.getItem(KEY(name));
    if (raw) return sanitizeLayout(name, JSON.parse(raw));
  } catch { /* private window, or not JSON */ }
  return shippedLayout(name);
}

/** Stored only when it is a choice: an untouched layout is not written, so a new shipped one reaches this desk. */
export function saveLayout(name: LayoutName, l: DeskLayout): void {
  try {
    if (sameLayout(l, SHIPPED[name])) localStorage.removeItem(KEY(name));
    else localStorage.setItem(KEY(name), JSON.stringify(l));
  } catch { /* private window */ }
}

/** The old desk mode a layout stands for, for everything that still asks which desk is up. */
export const DESK_MODE_OF: Record<LayoutName, 'design' | 'perform' | 'loadin'> = { build: 'design', gig: 'perform', loadin: 'loadin' };
export const LAYOUT_OF_MODE = (m: string | null): LayoutName => (m === 'perform' ? 'gig' : m === 'loadin' ? 'loadin' : 'build');

/** For the browser: is this section one of the settings sections? (The desk's own panels are not.) */
export const isSectionPanel = (id: string): boolean => SECTION_BY_ID.has(id);
