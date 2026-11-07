/**
 * The desk's tabs: the chips across the top, each a set of panels.
 *
 * Until 2026-10-27 the chips were fixed: Build, Gig and Load-in (three layouts
 * of the panels) and then Sequence and Sound, two screens of their own. The
 * owner asked for them to be theirs to make: every tab built from the same
 * panels, renamed, reordered, added and taken away, with three that ship as
 * examples. Perform is the show under the hand (pouring, riding the look and
 * going to the next one), Sequence is the set and the changes that take
 * longer than a look (the set list, the song shows, the sequences and a
 * song's score), and Setup is the room (the controller, the sound in, the
 * wall and its mapping). Build and Gig fold into Perform, Load-in and Sound
 * into Setup; and the two screens are panels now (`deskLayout.ts`), so
 * nothing that was behind a chip is left without a way to it.
 *
 * Kept the way `deskPins.ts` keeps the rides, and for the same reason: the
 * list is written to storage only once it differs from the one that ships,
 * and a shipped tab nobody rearranged is stored by its name alone, so a
 * better shipped layout still reaches it.
 *
 * Pure apart from `loadTabs`, `saveTabs` and `loadTabId`, so
 * `npm run desklayout` drives every operation in node.
 */

import {
  LAYOUT_NAMES, LAYOUT_LABEL, OLD_LAYOUT_KEY, emptyLayout, sameLayout, sanitizeLayout,
  type DeskLayout, type LayoutName,
} from './deskLayout.ts';

export interface DeskTab {
  /** Never shown and never changed, so a rename keeps the tab's place, its key and its checks. */
  id: string;
  name: string;
  layout: DeskLayout;
}

/** A name fits a chip: anything longer is cut, and an empty one is not a name. */
export const TAB_NAME_MAX = 24;
/** Nine, for ⌘1 to ⌘9; past that a strip of chips stops being read at a glance. */
export const TABS_MAX = 9;

const L = (x: Partial<DeskLayout> & Pick<DeskLayout, 'plateMode'>): DeskLayout => ({ ...emptyLayout(x.plateMode), ...x });

/*
  The three that ship.

  Perform is Gig with Build's materials beside it: the set list on the left
  to go to the next look, the bottles and the rides on the right, and the
  dyes, the tools, the recipe, Build's four sections of knobs (the fluid,
  the squish, the lens and the closeup: the visuals, to manipulate) and the
  patch bay under the plate. It ships
  Live, because it is the show; building a look in it is the plate bar's
  Preview, one click, which is all Build's Preview ever was.

  Sequence is Live too: a sequence that is played from it has to reach the
  plate, and Preview holds the sequencer off.

  Setup is Load-in with the Sound screen's player and drone in it.
*/
export const DEFAULT_TABS: readonly DeskTab[] = Object.freeze([
  { id: 'perform', name: 'Perform', layout: L({ left: ['cues'], right: ['bottles', 'rides'], deck: ['dyes', 'tools', 'recipe', 'physics', 'squish', 'camera', 'macro', 'patches'], plateMode: 'live' }) },
  { id: 'sequence', name: 'Sequence', layout: L({ left: ['cues'], right: ['songs', 'sequences'], deck: ['score'], plateMode: 'live' }) },
  { id: 'setup', name: 'Setup', layout: L({ left: ['midi', 'audio-input', 'player'], right: ['projectors', 'mapping'], deck: ['simulation', 'phone'], plateMode: 'live' }) },
]);
const DEFAULT_BY_ID = new Map(DEFAULT_TABS.map(t => [t.id, t]));

export const defaultTabs = (): DeskTab[] => structuredClone(DEFAULT_TABS as DeskTab[]);
/** The layout a tab goes back to on Reset layout: the shipped one for a shipped tab, an empty desk for one of the owner's. */
export const baseLayout = (id: string): DeskLayout => structuredClone(DEFAULT_BY_ID.get(id)?.layout ?? emptyLayout());

export const cleanName = (name: unknown, fallback = 'Tab'): string => {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, TAB_NAME_MAX).trim() : '';
  return s || fallback;
};

// ── Changing them ────────────────────────────────────────────────────

export function renameTab(tabs: DeskTab[], id: string, name: string): DeskTab[] {
  const t = tabs.find(x => x.id === id);
  if (!t) return tabs;
  const n = cleanName(name, t.name);
  return n === t.name ? tabs : tabs.map(x => (x.id === id ? { ...x, name: n } : x));
}

/** Move a tab by `by` places, clamped to the ends. */
export function moveTab(tabs: DeskTab[], id: string, by: number): DeskTab[] {
  const i = tabs.findIndex(x => x.id === id);
  if (i < 0) return tabs;
  const j = Math.max(0, Math.min(tabs.length - 1, i + by));
  if (j === i) return tabs;
  const out = [...tabs];
  const [t] = out.splice(i, 1);
  out.splice(j, 0, t);
  return out;
}

/** The last tab is never taken away: a desk with no tab has nowhere to put a panel back. */
export function deleteTab(tabs: DeskTab[], id: string): DeskTab[] {
  if (tabs.length <= 1 || !tabs.some(x => x.id === id)) return tabs;
  return tabs.filter(x => x.id !== id);
}

/** A name not on another tab: "New tab", then "New tab 2". */
export function freeName(tabs: DeskTab[], want: string): string {
  const names = new Set(tabs.map(t => t.name.toLowerCase()));
  const base = cleanName(want).slice(0, TAB_NAME_MAX - 3).trim();
  if (!names.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!names.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * A new tab after `after` (at the end without one): empty, or a copy of a
 * tab's panels. Its id is new and never reused, so a tab deleted and made
 * again does not inherit anything stored under the old one.
 */
export function addTab(tabs: DeskTab[], opts: { name?: string; copyOf?: string; after?: string; id?: string } = {}): { tabs: DeskTab[]; id: string } {
  if (tabs.length >= TABS_MAX) return { tabs, id: '' };
  const src = opts.copyOf ? tabs.find(t => t.id === opts.copyOf) : undefined;
  let id = opts.id ?? `tab-${Date.now().toString(36)}`;
  while (tabs.some(t => t.id === id)) id += 'x';
  const tab: DeskTab = {
    id,
    name: freeName(tabs, opts.name ?? (src ? `${src.name} copy` : 'New tab')),
    layout: src ? structuredClone(src.layout) : emptyLayout(),
  };
  const at = opts.after ? tabs.findIndex(t => t.id === opts.after) + 1 : tabs.length;
  const out = [...tabs];
  out.splice(at > 0 ? at : tabs.length, 0, tab);
  return { tabs: out, id };
}

export function setTabLayout(tabs: DeskTab[], id: string, change: (l: DeskLayout) => DeskLayout): DeskTab[] {
  const t = tabs.find(x => x.id === id);
  if (!t) return tabs;
  const next = change(t.layout);
  return next === t.layout ? tabs : tabs.map(x => (x.id === id ? { ...x, layout: next } : x));
}

// ── Keeping them ─────────────────────────────────────────────────────

export const TABS_KEY = 'chromaglass-desk-tabs';
/** Which tab is up. The old desk mode's key, so an old value is read as the tab it became. */
export const TAB_KEY = 'chromaglass-desk-mode';

interface StoredTab { id: string; name: string; layout?: DeskLayout }

/** Only what differs from what ships: a shipped tab as it shipped is its id and name. */
export function storedForm(tabs: DeskTab[]): StoredTab[] | null {
  const shipped = tabs.length === DEFAULT_TABS.length && tabs.every((t, i) => {
    const d = DEFAULT_TABS[i];
    return t.id === d.id && t.name === d.name && sameLayout(t.layout, d.layout);
  });
  if (shipped) return null;
  return tabs.map(t => {
    const d = DEFAULT_BY_ID.get(t.id);
    return d && sameLayout(t.layout, d.layout) ? { id: t.id, name: t.name } : { id: t.id, name: t.name, layout: t.layout };
  });
}

/**
 * A stored list, made safe: a tab without an id or a list that is not a list
 * is dropped, an id twice keeps the first, a name is cleaned, a layout is
 * sanitised against the tab's own base, and a list with nothing left in it is
 * the shipped one.
 */
export function sanitizeTabs(raw: unknown): DeskTab[] {
  const list = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { tabs?: unknown }).tabs : raw;
  if (!Array.isArray(list)) return defaultTabs();
  const out: DeskTab[] = [];
  for (const r of list) {
    if (out.length >= TABS_MAX) break;
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 64 || out.some(t => t.id === r.id)) continue;
    const base = baseLayout(r.id);
    out.push({ id: r.id, name: cleanName(r.name, DEFAULT_BY_ID.get(r.id)?.name ?? 'Tab'), layout: r.layout === undefined ? base : sanitizeLayout(r.layout, base) });
  }
  return out.length ? out : defaultTabs();
}

/**
 * The tabs a desk opens with, from what an older build left behind.
 *
 * An old layout was written only once it was changed, so one in storage is
 * an arrangement somebody made. It is not folded into a shipped tab (which
 * would lose either it or the new tab), but kept beside the three as a tab
 * of its own, under its old name, to be deleted once it is not wanted. Done
 * once: the list is stored and the old keys go, so taking such a tab away
 * does not bring it back on the next load.
 */
export function fromOldLayouts(read: (name: LayoutName) => unknown): DeskTab[] | null {
  const kept: DeskTab[] = [];
  for (const name of LAYOUT_NAMES) {
    const raw = read(name);
    if (raw == null) continue;
    kept.push({ id: name, name: LAYOUT_LABEL[name], layout: sanitizeLayout(raw, emptyLayout()) });
  }
  return kept.length ? [...defaultTabs(), ...kept] : null;
}

/**
 * The tab an old stored desk mode stands for: the old layout's own tab if it
 * was kept, else the shipped tab it folded into. A tab id is itself.
 */
const OLD_MODE: Record<string, LayoutName> = { design: 'build', perform: 'gig', loadin: 'loadin' };

export function tabForStored(tabs: DeskTab[], stored: string | null): string {
  if (stored && tabs.some(t => t.id === stored)) return stored;
  const old = stored ? OLD_MODE[stored] : undefined;
  if (old && tabs.some(t => t.id === old)) return old;
  const into = stored === 'loadin' ? 'setup' : 'perform';
  return tabs.some(t => t.id === into) ? into : tabs[0].id;
}

/** A stored tab that is a shipped tab exactly as it shipped: nobody's arrangement. */
function pristine(r: StoredTab): boolean {
  const d = DEFAULT_BY_ID.get(r.id);
  return !!d && r.name === d.name && (r.layout === undefined || sameLayout(sanitizeLayout(r.layout, d.layout), d.layout));
}

/**
 * Two stored tab lists made into one, for the first time a device meets the
 * account's list (lib/cloudSync.ts `mergeFirst`).
 *
 * Why not newest-wins like every other store: a device that held its own tabs
 * before it ever synced is stamped the oldest there is, so the cloud's list
 * wins, and with the tabs kept whole that was every tab this device had made
 * (the review of #531 measured it, with the laptop and the Mac app each
 * renaming a different tab). The cloud's list is the base and its order stands.
 * A tab only this device has, one it made or a shipped tab it arranged that the
 * cloud's list still holds as shipped, is added to it. A tab arranged on both is
 * the cloud's, and this device's copy is kept beside it under its own id and
 * name, to be deleted once it is not wanted: nothing is lost, and the cost is
 * a tab to delete once. A shipped tab this device never touched and the cloud
 * lacks was deleted there on purpose and stays deleted. Past nine tabs the
 * extras are dropped, last first, since a strip holds no more (TABS_MAX).
 */
export function mergeStoredTabs(localRaw: string, incomingRaw: string): string {
  const list = (raw: string): StoredTab[] | null => {
    try {
      const v = JSON.parse(raw);
      const l = v && typeof v === 'object' && !Array.isArray(v) ? v.tabs : v;
      return Array.isArray(l) ? l.filter((r: unknown): r is StoredTab => !!r && typeof r === 'object' && typeof (r as StoredTab).id === 'string' && !!(r as StoredTab).id) : null;
    } catch { return null; }
  };
  const local = list(localRaw); const incoming = list(incomingRaw);
  if (!local || !incoming) return incomingRaw;
  const out = [...incoming];
  const taken = new Set(incoming.map(r => r.id));
  const names = new Set(incoming.map(r => String(r.name).toLowerCase()));
  for (const mine of local) {
    if (out.length >= TABS_MAX) break;
    const there = incoming.findIndex(r => r.id === mine.id);
    if (there < 0) {
      if (!pristine(mine)) out.push(mine);
    } else if (!pristine(mine) && JSON.stringify(mine) !== JSON.stringify(incoming[there])) {
      if (pristine(incoming[there])) {
        // Arranged here, still as shipped there: this device's arrangement keeps the tab's place.
        out[there] = mine;
      } else {
        let id = `${mine.id}-here`;
        while (taken.has(id)) id += 'x';
        let name = cleanName(`${mine.name} (here)`).slice(0, TAB_NAME_MAX);
        for (let n = 2; names.has(name.toLowerCase()); n++) name = `${cleanName(mine.name).slice(0, TAB_NAME_MAX - 4)} (${n})`;
        taken.add(id); names.add(name.toLowerCase());
        out.push({ ...mine, id, name });
      }
    }
  }
  return JSON.stringify({ v: 1, tabs: out });
}

export function loadTabs(): DeskTab[] {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) return sanitizeTabs(JSON.parse(raw));
    const old = fromOldLayouts((name) => {
      const v = localStorage.getItem(OLD_LAYOUT_KEY(name));
      if (!v) return null;
      try { return JSON.parse(v); } catch { return null; }
    });
    if (old) {
      // The desk was left on a layout that is now a tab of its own: open on
      // that, not on the shipped tab its old name would otherwise mean.
      const was = OLD_MODE[localStorage.getItem(TAB_KEY) ?? ''];
      if (was && old.some(t => t.id === was)) localStorage.setItem(TAB_KEY, was);
      saveTabs(old);
      for (const name of LAYOUT_NAMES) localStorage.removeItem(OLD_LAYOUT_KEY(name));
      return old;
    }
  } catch { /* private window, or not JSON */ }
  return defaultTabs();
}

/** Stored only when it is a choice: the shipped tabs, untouched, are not written. */
export function saveTabs(tabs: DeskTab[]): void {
  try {
    const s = storedForm(tabs);
    if (s === null) localStorage.removeItem(TABS_KEY);
    else localStorage.setItem(TABS_KEY, JSON.stringify({ v: 1, tabs: s }));
  } catch { /* private window */ }
}

export function loadTabId(tabs: DeskTab[]): string {
  try { return tabForStored(tabs, localStorage.getItem(TAB_KEY)); } catch { return tabForStored(tabs, null); }
}
