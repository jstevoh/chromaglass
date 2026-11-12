/**
 * The desk, for the remote link to report and the owner's assistant to run
 * (PLAN 44k-16, 44k-17; the guard's rules are server/assistantDesk.js).
 *
 * Asked as part of the owner's goal of 2026-11-09, complete control of
 * ChromaGlass from Claude, and the desk's own layout on the owner's word of
 * 2026-11-11 ("add in the desk layout"). Two kinds of thing are here:
 *
 *  - what is in the hand (Play): the palette lock (usePaletteLock), the tool
 *    and its amount and the plate a gesture lands on (useHand). They change
 *    what the next pour or press does, or which colours the music may pick,
 *    as the bench's bottle does, so they sit with the bench in Play;
 *  - the desk itself: which tab is up (Play: the person's screen changes,
 *    the plate does not), and in Full the tabs' own edits, a panel docked,
 *    floated, opened, closed or folded, the plate mode a tab holds, the
 *    settings pinned to the rides and the recipe, the MIDI activity overlay
 *    (useDesk) and Ambient TV mode (useAmbientMode). These are the owner's
 *    saved work: the tabs travel to the account (8-tabs-a), so an edit made
 *    here reaches the owner's other machines as a person's edit would.
 *
 * Why a holder here rather than props, as projectorNow.ts is: the state is
 * those hooks', each called from App(), which is over its size ceiling and
 * may not grow (`npm run sizes`). This holds a copy of it for reading and the
 * doors that change it, the same calls the tab strip, the panel menu, the
 * settings panel's pins and the tool picker make.
 *
 * Names are found here, not in the guard: a tab is asked for as "Perform",
 * a panel as "Rides", a palette as "Cool Ocean", and only the page knows the
 * names (the owner renames tabs). The guard holds the verbs and the shapes;
 * this answers "no tab Gig" with the tabs there are.
 *
 * A delete, or a reset of every tab, is kept here so that the guard's Undo
 * can put it back (`tab-restore`): the tab with its panels as they were, at
 * its old place, newest first, as deep as the guard's Undo. A person's own delete is not kept: the desk's
 * Reset menu and the account are theirs, and Undo is the assistant's.
 */
import { useSyncExternalStore } from 'react';
import { COLOR_HARMONY_NAMES } from '../constants';
import type { DeskNow, DeskPanelNow } from '../lib/remoteProtocol';
import {
  PANELS, PANEL_BY_ID, SLOTS, closePanel, collapseAll, dockPanel, floatPanel, openPanel, whereIs,
  type DeskLayout, type Slot,
} from '../lib/deskLayout';
import { TABS_MAX, restoreTab, type DeskTab } from '../lib/deskTabs';
import { MAX_PINS, PIN_RANGE, type DeskSurface } from '../lib/deskPins';
import { TOOL_AMOUNT, TOOL_AMOUNT_MEANS, clampAmount } from '../lib/toolAmount';
import type { TabEdit } from '../hooks/useDeskLayout';

export type { DeskNow };

/** The tools a hand can hold, as the tool picker offers them. */
export const HAND_TOOLS = Object.keys(TOOL_AMOUNT_MEANS);

let now: DeskNow = { tabs: null, up: null, pins: null, activity: null, ambient: null, palette: null, hand: null };
let tabsHeld: DeskTab[] = [];
let ridesHeld: string[] = [];
let recipeHeld: string[] = [];
const listeners = new Set<() => void>();
const take = (next: DeskNow) => { if (JSON.stringify(next) === JSON.stringify(now)) return; now = next; for (const l of listeners) l(); };

const panelsOf = (l: DeskLayout): DeskPanelNow[] => {
  const at = (where: DeskPanelNow['where'], ids: string[]) => ids.map((id) => ({ id, name: PANEL_BY_ID.get(id)?.name ?? id, where, folded: l.collapsed.includes(id) }));
  return [...at('left', l.left), ...at('right', l.right), ...at('deck', l.deck), ...at('float', l.floating.map((f) => f.id))];
};

/** The tabs, the one up, the pins and the activity overlay, as useDesk holds them. */
export function publishDesk(tabs: DeskTab[], up: string, rides: readonly string[], recipe: readonly string[], activity: boolean): void {
  tabsHeld = tabs; ridesHeld = [...rides]; recipeHeld = [...recipe];
  take({
    ...now, up, activity,
    tabs: tabs.map((t) => ({ id: t.id, name: t.name, plate: t.layout.plateMode, deckFolded: t.layout.deckCollapsed, panels: panelsOf(t.layout) })),
    pins: { rides: [...rides], recipe: [...recipe] },
  });
}
/** The palette lock, as an index into COLOR_HARMONIES (usePaletteLock). */
export function publishPalette(index: number | null): void { take({ ...now, palette: { lock: index == null ? null : COLOR_HARMONY_NAMES[index] ?? null } }); }
/** The tool in hand, its amount, and the plate in hand of those on the stage (useHand). */
export function publishHand(tool: string, amount: number, layer: number, layers: number): void { take({ ...now, hand: { tool, amount, layer, layers } }); }
/** Ambient TV mode (useAmbientMode). */
export function publishAmbient(on: boolean): void { take({ ...now, ambient: on }); }

/** The tab strip, the panel menu and the pins, as useDeskTabs and useDesk do them. */
export interface DeskDoor {
  setTab: (id: string) => void;
  edit: (e: TabEdit) => void;
  update: (id: string, change: (l: DeskLayout) => DeskLayout) => void;
  restore: (change: (t: DeskTab[]) => DeskTab[]) => void;
  pin: (surface: DeskSurface, key: string, on: boolean) => void;
  activity: (on: boolean) => void;
}
/** The tool picker, its Amount, and the layer picker (useHand). */
export interface HandDoor { tool: (t: string) => void; amount: (t: string, v: number) => void; layer: (n: number) => void }
let deskDoor: DeskDoor | null = null;
let handDoor: HandDoor | null = null;
let paletteDoor: ((index: number | null) => void) | null = null;
let ambientDoor: ((on: boolean) => void) | null = null;
export function setDeskDoor(d: DeskDoor | null): void { deskDoor = d; }
export function setHandDoor(d: HandDoor | null): void { handDoor = d; }
export function setPaletteDoor(d: ((index: number | null) => void) | null): void { paletteDoor = d; }
export function setAmbientDoor(d: ((on: boolean) => void) | null): void { ambientDoor = d; }

/**
 * What the assistant took away, newest last, for its Undo to put back: one
 * entry for every delete or reset the guard let through (it remembers each),
 * a refused one kept as nothing, so the guard's Undo and this list stay in
 * step and an Undo meant for an earlier change is not spent on it. As deep
 * as the guard's Undo (UNDO_DEPTH, ten).
 */
type Kept = { tab: DeskTab; at: number } | { all: DeskTab[] } | { none: true };
const kept: Kept[] = [];
const keep = (k: Kept) => { kept.push(k); if (kept.length > 10) kept.shift(); };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const tabNames = () => tabsHeld.map((t) => t.name).join(', ');
function findTab(ref: unknown): DeskTab | string {
  const r = String(ref ?? '');
  return tabsHeld.find((t) => t.id === r) ?? tabsHeld.find((t) => same(t.name, r)) ?? `no tab "${r}" (the tabs: ${tabNames()})`;
}
function findPanel(ref: unknown): string {
  const r = String(ref ?? '');
  if (PANEL_BY_ID.has(r)) return r;
  return PANELS.find((p) => same(p.name, r))?.id ?? '';
}
const panelNames = () => PANELS.map((p) => p.name).join(', ');

/** One panel verb on a layout, or why not. */
function panelChange(m: { do?: unknown; slot?: unknown; index?: unknown; plate?: unknown }, l: DeskLayout, id: string): ((l: DeskLayout) => DeskLayout) | string {
  const slot = SLOTS.includes(m.slot as Slot) ? (m.slot as Slot) : null;
  const out = id ? whereIs(l, id) : null;
  switch (m.do) {
    case 'dock': return slot ? (x) => dockPanel(x, id, slot, Number.isInteger(m.index) ? (m.index as number) : undefined) : 'dock: a slot (left, right or deck)';
    case 'float': return (x) => floatPanel(x, id);
    case 'open': return out ? `${PANEL_BY_ID.get(id)?.name} is out already (${out}); dock or float it to move it` : (x) => openPanel(x, id, m.slot === 'float' ? 'float' : slot ?? 'deck');
    case 'close': return out ? (x) => closePanel(x, id) : `${PANEL_BY_ID.get(id)?.name} is not out on that tab`;
    case 'fold': case 'unfold': {
      if (!out) return `${PANEL_BY_ID.get(id)?.name} is not out on that tab`;
      const on = m.do === 'fold';
      return (x) => ({ ...x, collapsed: on ? (x.collapsed.includes(id) ? x.collapsed : [...x.collapsed, id]) : x.collapsed.filter((c) => c !== id) });
    }
    case 'fold-all': case 'unfold-all': return (x) => collapseAll(x, m.do === 'fold-all');
    case 'deck-fold': case 'deck-unfold': return (x) => ({ ...x, deckCollapsed: m.do === 'deck-fold' });
    case 'plate': return m.plate === 'live' || m.plate === 'preview' ? (x) => ({ ...x, plateMode: m.plate as 'live' | 'preview' }) : 'plate: live or preview';
    default: return `not a panel verb: ${String(m.do)}`;
  }
}
const PANEL_FREE = new Set(['fold-all', 'unfold-all', 'deck-fold', 'deck-unfold', 'plate']);

type DeskMessage = {
  do?: unknown; tab?: unknown; op?: unknown; name?: unknown; by?: unknown; copyOf?: unknown;
  panel?: unknown; verb?: unknown; slot?: unknown; index?: unknown; plate?: unknown;
  surface?: unknown; key?: unknown; on?: unknown; hand?: unknown; view?: unknown;
};

/** The guard's `assistant-desk` for the page: done, or why not. */
export async function askDesk(m: DeskMessage): Promise<string | null> {
  if (m.do === 'hand') return hand((m.hand ?? {}) as Record<string, unknown>);
  if (m.do === 'view') {
    const v = (m.view ?? {}) as Record<string, unknown>;
    if (typeof v.ambient === 'boolean') { if (!ambientDoor) return 'Ambient TV mode is not running'; ambientDoor(v.ambient); }
    if (typeof v.activity === 'boolean') { if (!deskDoor) return 'the desk is not running'; deskDoor.activity(v.activity); }
    return null;
  }
  if (!deskDoor) { if (m.op === 'delete' || m.op === 'reset-all') keep({ none: true }); return 'the desk is not running'; }
  const door = deskDoor;
  if (m.do === 'tab') {
    const t = findTab(m.tab);
    if (typeof t === 'string') return t;
    door.setTab(t.id);
    return null;
  }
  if (m.do === 'tabs') {
    if (m.op === 'add') {
      if (tabsHeld.length >= TABS_MAX) return `the strip is full (${TABS_MAX} tabs); delete one first`;
      const src = m.copyOf === undefined ? undefined : findTab(m.copyOf);
      if (typeof src === 'string') return src;
      door.edit({ op: 'add', ...(src ? { copyOf: src.id } : {}) });
      return null;
    }
    if (m.op === 'reset-all') { keep({ all: tabsHeld }); door.edit({ op: 'reset-all' }); return null; }
    const t = findTab(m.tab);
    if (typeof t === 'string') { if (m.op === 'delete') keep({ none: true }); return t; }
    if (m.op === 'rename') { door.edit({ op: 'rename', id: t.id, name: String(m.name) }); return null; }
    if (m.op === 'move') { door.edit({ op: 'move', id: t.id, by: Number(m.by) }); return null; }
    if (m.op === 'delete') {
      if (tabsHeld.length <= 1) { keep({ none: true }); return 'the last tab stays: a desk with no tab has nowhere to put a panel back'; }
      keep({ tab: t, at: tabsHeld.indexOf(t) });
      door.edit({ op: 'delete', id: t.id });
      return null;
    }
    return `not a tab edit: ${String(m.op)}`;
  }
  if (m.do === 'tab-restore') {
    const k = kept.pop();
    if (!k || 'none' in k) return 'no tab taken away from here to put back';
    door.restore('all' in k ? () => k.all : (t) => restoreTab(t, k.tab, k.at));
    return null;
  }
  if (m.do === 'panel') {
    const t = m.tab === undefined ? tabsHeld.find((x) => x.id === now.up) : findTab(m.tab);
    if (typeof t === 'string') return t;
    if (!t) return 'no tab is up';
    const id = PANEL_FREE.has(String(m.verb)) ? '' : findPanel(m.panel);
    if (!PANEL_FREE.has(String(m.verb)) && !id) return `no panel "${String(m.panel ?? '')}" (the panels: ${panelNames()})`;
    const change = panelChange({ do: m.verb, slot: m.slot, index: m.index, plate: m.plate }, t.layout, id);
    if (typeof change === 'string') return change;
    door.update(t.id, change);
    return null;
  }
  if (m.do === 'pin') {
    const surface = m.surface === 'design' ? 'design' : 'perform';
    const key = String(m.key ?? '');
    if (!PIN_RANGE.has(key)) return `${key} is not a setting the desk can pin (a dial: get_settings names them)`;
    const list = surface === 'design' ? recipeHeld : ridesHeld;
    if (m.on === true && !list.includes(key) && list.length >= MAX_PINS) return `the ${surface === 'design' ? 'recipe' : 'rides'} hold ${MAX_PINS}; unpin one first`;
    door.pin(surface, key, m.on === true);
    return null;
  }
  return `not a desk verb: ${String(m.do)}`;
}

/** The palette lock, the tool and its amount, the plate in hand: only what is named. */
function hand(h: Record<string, unknown>): string | null {
  let lock: number | null | undefined;
  if (h.palette !== undefined) {
    lock = h.palette === null ? null : COLOR_HARMONY_NAMES.findIndex((n) => same(n, String(h.palette)));
    if (lock === -1) return `no palette "${String(h.palette)}" (the palettes: ${COLOR_HARMONY_NAMES.join(', ')})`;
    if (!paletteDoor) return 'the palette lock is not running';
  }
  if (h.tool !== undefined && !HAND_TOOLS.includes(String(h.tool))) return `no tool "${String(h.tool)}" (the tools: ${HAND_TOOLS.join(', ')})`;
  const layers = now.hand?.layers ?? 1;
  if (h.layer !== undefined && !(Number.isInteger(h.layer) && (h.layer as number) >= 0 && (h.layer as number) < layers)) return `layer: 0${layers > 1 ? ` to ${layers - 1}` : ''}, the plates on the stage (one, unless the look stacks two)`;
  if ((h.tool !== undefined || h.amount !== undefined || h.layer !== undefined) && !handDoor) return 'the tools are not running';
  if (lock !== undefined) paletteDoor!(lock);
  if (h.tool !== undefined) handDoor!.tool(String(h.tool));
  if (typeof h.amount === 'number') handDoor!.amount(String(h.tool ?? now.hand?.tool ?? 'dropper'), clampAmount(h.amount));
  if (h.layer !== undefined) handDoor!.layer(h.layer as number);
  return null;
}

/** The Amount's range, for the guard's line to hold its own copy to. */
export const HAND_AMOUNT = TOOL_AMOUNT;

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const readDesk = (): DeskNow => now;
export const useDeskNow = () => useSyncExternalStore(subscribe, () => now, () => now);
