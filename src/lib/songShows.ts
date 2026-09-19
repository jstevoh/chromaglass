/**
 * The show, song by song.
 *
 * Each song gets a look and a list of things that happen while it plays. The
 * look is a built-in or one of your saved looks, applied whole (looks never
 * inherit, see lookFade.ts). The things that happen are actions: a *when*
 * (the first note, a time, a section, every few kicks, some seconds before the
 * end) and a *what* (drain, burst, zoom in, a kaleidoscope, new dyes, another
 * look, fade to black, pour the title).
 *
 * Common actions come from a menu (COMMON_ACTIONS) so a song can be set up in a
 * few clicks. A set of actions that works for one song can be saved as an
 * action set and laid on the next, and both songs and sets travel as files.
 *
 * This replaces the stage sequencer as the way a set is planned: a sequence was
 * a script of glides that the song had to be fitted into, where this starts
 * from the song. The runtime lives in useSongShows; this module is pure (data,
 * storage, and the scheduler that decides what is due), so `npm run songs` can
 * drive a whole song through it with no browser.
 */

import type { VisualizerSettings } from '../types';
import { sameSong, parseSongRef, songLabel, type SongRef } from './songRef';

// ── The model ─────────────────────────────────────────────────────────

/** A look: one of the built-ins, or one of the looks you saved. */
export interface SongLook {
  kind: 'preset' | 'saved';
  id: string;
  /** What it was called when it was picked, for a look that has since gone. */
  name?: string;
}

/** Where a song's sections come from, when the song map knows them. */
export type SectionKind = 'intro' | 'verse' | 'chorus' | 'bridge' | 'drop' | 'outro' | 'any';

export type ActionWhen =
  | { at: 'start' }                                   // the first note
  | { at: 'time'; sec: number }                       // this far into the song
  | { at: 'section'; section: SectionKind; nth?: number } // entering a section (the nth one, or every one)
  | { at: 'kick'; every: number }                     // every Nth kick
  | { at: 'before-end'; sec: number };                // this long before the end

export type ActionWhat =
  | { do: 'look'; look: SongLook; fade: number }      // another look, faded in over `fade` seconds
  | { do: 'drain' }                                   // swirl the dye away
  | { do: 'clear' }                                   // wipe the plate at once
  | { do: 'seed' }                                    // lay the look's pattern again
  | { do: 'burst' }                                   // a press on the plate
  | { do: 'zoom'; zoom: number; over: number }        // 1 is the whole plate; 2–16 is the closeup
  | { do: 'kaleidoscope'; folds: number }             // 0 is off
  | { do: 'dyes' }                                    // the next dyes of the look's palette
  | { do: 'blackout'; over: number }                  // fade to black
  | { do: 'lights-up'; over: number }                 // and back
  | { do: 'set'; key: keyof VisualizerSettings; value: number; over: number } // any setting, glided
  | { do: 'title' }                                   // pour the song's title into the plate
  | { do: 'signoff' };                                // pour ChromaGlass into the plate

export interface SongAction {
  id: string;
  when: ActionWhen;
  what: ActionWhat;
}

export interface SongShow {
  id: string;
  song: SongRef;
  look: SongLook;
  actions: SongAction[];
  notes?: string;
}

export interface ActionSet {
  id: string;
  name: string;
  description?: string;
  actions: SongAction[];
  builtIn?: boolean;
}

let counter = 0;
export const newId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

// ── Words for people ──────────────────────────────────────────────────

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
const ordinal = (n: number): string => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`);

export function describeWhen(w: ActionWhen): string {
  switch (w.at) {
    case 'start': return 'On the first note';
    case 'time': return `At ${mmss(w.sec)}`;
    case 'section': return w.section === 'any'
      ? (w.nth ? `At the ${ordinal(w.nth)} new section` : 'At every new section')
      : (w.nth ? `At the ${ordinal(w.nth)} ${w.section}` : `At every ${w.section}`);
    case 'kick': return w.every <= 1 ? 'On every kick' : `On every ${ordinal(w.every)} kick`;
    case 'before-end': return `${w.sec} s before the end`;
  }
}

export function describeWhat(a: ActionWhat, lookName: (l: SongLook) => string = (l) => l.name ?? l.id): string {
  switch (a.do) {
    case 'look': return `Switch to ${lookName(a.look)}${a.fade > 0 ? ` over ${a.fade} s` : ''}`;
    case 'drain': return 'Drain the plate';
    case 'clear': return 'Clear the plate';
    case 'seed': return 'Lay the look again';
    case 'burst': return 'Burst';
    case 'zoom': return a.zoom <= 1.001 ? `Back to the whole plate over ${a.over} s` : `Zoom in to ${a.zoom}× over ${a.over} s`;
    case 'kaleidoscope': return a.folds < 2 ? 'Kaleidoscope off' : `Kaleidoscope, ${a.folds} folds`;
    case 'dyes': return 'Next dyes';
    case 'blackout': return `Fade to black over ${a.over} s`;
    case 'lights-up': return `Lights up over ${a.over} s`;
    case 'set': return `${String(a.key)} → ${a.value}${a.over > 0 ? ` over ${a.over} s` : ''}`;
    case 'title': return 'Pour the title';
    case 'signoff': return 'Pour the ChromaGlass name';
  }
}

// ── The menu of common actions ────────────────────────────────────────

export interface CommonAction { label: string; when: ActionWhen; what: ActionWhat }

/**
 * What most songs want, one click each. A song's list starts from these and
 * can then be edited: the time, the section, how many kicks, how far in.
 */
export const COMMON_ACTIONS: CommonAction[] = [
  { label: 'Pour the title on the first note', when: { at: 'start' }, what: { do: 'title' } },
  { label: 'Burst on the first note', when: { at: 'start' }, what: { do: 'burst' } },
  { label: 'Burst on every 4th kick', when: { at: 'kick', every: 4 }, what: { do: 'burst' } },
  { label: 'Zoom in on every chorus', when: { at: 'section', section: 'chorus' }, what: { do: 'zoom', zoom: 4, over: 3 } },
  { label: 'Back to the plate on every verse', when: { at: 'section', section: 'verse' }, what: { do: 'zoom', zoom: 1, over: 3 } },
  { label: 'Kaleidoscope on every chorus', when: { at: 'section', section: 'chorus' }, what: { do: 'kaleidoscope', folds: 6 } },
  { label: 'Kaleidoscope off on every verse', when: { at: 'section', section: 'verse' }, what: { do: 'kaleidoscope', folds: 0 } },
  { label: 'New dyes at every section', when: { at: 'section', section: 'any' }, what: { do: 'dyes' } },
  { label: 'Drain at the bridge', when: { at: 'section', section: 'bridge' }, what: { do: 'drain' } },
  { label: 'Switch look at the bridge', when: { at: 'section', section: 'bridge' }, what: { do: 'look', look: { kind: 'preset', id: 'galaxy', name: 'Galaxy' }, fade: 4 } },
  { label: 'Switch look at 1:00', when: { at: 'time', sec: 60 }, what: { do: 'look', look: { kind: 'preset', id: 'classic', name: 'Classic Light Show' }, fade: 4 } },
  { label: 'Drain 8 s before the end', when: { at: 'before-end', sec: 8 }, what: { do: 'drain' } },
  { label: 'Pour the name 6 s before the end', when: { at: 'before-end', sec: 6 }, what: { do: 'signoff' } },
  { label: 'Fade to black 4 s before the end', when: { at: 'before-end', sec: 4 }, what: { do: 'blackout', over: 4 } },
];

export const actionFrom = (c: { when: ActionWhen; what: ActionWhat }): SongAction => ({
  id: newId('act'),
  when: structuredClone(c.when),
  what: structuredClone(c.what),
});

const set = (id: string, name: string, description: string, picks: number[]): ActionSet => ({
  id, name, description, builtIn: true,
  actions: picks.map((i) => ({ id: `${id}-${i}`, when: COMMON_ACTIONS[i].when, what: COMMON_ACTIONS[i].what })),
});

/** Starting points. Loading one copies its actions into the song, where they can be changed. */
export const BUILT_IN_SETS: ActionSet[] = [
  set('set-clean', 'Clean start and finish', 'The title on the first note, the name at the end, and dark in between the songs.', [0, 11, 12]),
  set('set-build-drop', 'Build and drop', 'In close for the chorus, back out for the verse, a burst every four kicks.', [3, 4, 2, 5, 6]),
  set('set-slow-burn', 'Slow burn', 'New dyes each section and a slow fade to black at the end.', [7, 13]),
  set('set-video', 'For a video', 'Everything a clip wants: the title, a burst on the first note, the name, and black at the very end.', [0, 1, 12, 13]),
];

// ── Matching and storage ──────────────────────────────────────────────

/** The show made for this song, if there is one. */
export function showFor(shows: SongShow[], song: SongRef | null | undefined): SongShow | null {
  if (!song) return null;
  return shows.find((s) => sameSong(s.song, song)) ?? null;
}

const SHOWS_KEY = 'chromaglass-song-shows';
const SETS_KEY = 'chromaglass-action-sets';

export function loadShows(): SongShow[] {
  try { return parseShows(JSON.parse(localStorage.getItem(SHOWS_KEY) ?? '[]')); } catch { return []; }
}
export function saveShows(shows: SongShow[]): void {
  try { localStorage.setItem(SHOWS_KEY, JSON.stringify(shows)); } catch { /* private window: this session only */ }
}
export function loadSets(): ActionSet[] {
  try { return parseSets(JSON.parse(localStorage.getItem(SETS_KEY) ?? '[]')); } catch { return []; }
}
export function saveSets(sets: ActionSet[]): void {
  try { localStorage.setItem(SETS_KEY, JSON.stringify(sets.filter((s) => !s.builtIn))); } catch { /* as above */ }
}

// ── Files ─────────────────────────────────────────────────────────────

export const SHOWS_FILE_KIND = 'chromaglass-song-shows';
export const SET_FILE_KIND = 'chromaglass-action-set';

/** A file of songs, with the saved looks they use, so it opens whole on another machine. */
export const showsFile = (shows: SongShow[], looks: unknown[] = []): string =>
  JSON.stringify({ kind: SHOWS_FILE_KIND, version: 1, shows, ...(looks.length ? { looks } : {}) }, null, 2);

/** The saved looks (ids) a list of songs uses, as its own look or as a look it switches to. */
export function savedLooksUsed(shows: SongShow[]): Set<string> {
  const ids = new Set<string>();
  for (const s of shows) {
    if (s.look.kind === 'saved') ids.add(s.look.id);
    for (const a of s.actions) if (a.what.do === 'look' && a.what.look.kind === 'saved') ids.add(a.what.look.id);
  }
  return ids;
}
export const setFile = (s: ActionSet): string =>
  JSON.stringify({ kind: SET_FILE_KIND, version: 1, set: { ...s, builtIn: undefined } }, null, 2);

/** A file of songs, or a single action set; what it was is in `kind`. Throws with a sentence a person can act on. */
export function parseFile(text: string): { shows?: SongShow[]; set?: ActionSet; looks?: unknown[] } {
  let o: unknown;
  try { o = JSON.parse(text); } catch { throw new Error('That file is not JSON.'); }
  const f = o as { kind?: string; shows?: unknown; set?: unknown; looks?: unknown };
  if (f?.kind === SHOWS_FILE_KIND) return { shows: parseShows(f.shows), looks: Array.isArray(f.looks) ? f.looks : [] };
  if (f?.kind === SET_FILE_KIND) {
    const sets = parseSets([f.set]);
    if (!sets.length) throw new Error('That action set has no actions ChromaGlass knows.');
    return { set: { ...sets[0], id: newId('set') } };
  }
  throw new Error('That is not a ChromaGlass song or action-set file.');
}

const SECTIONS: SectionKind[] = ['intro', 'verse', 'chorus', 'bridge', 'drop', 'outro', 'any'];
const num = (v: unknown, lo: number, hi: number, dflt: number): number =>
  (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);

function parseLook(raw: unknown): SongLook | null {
  const l = raw as Partial<SongLook> | null;
  if (!l || (l.kind !== 'preset' && l.kind !== 'saved') || typeof l.id !== 'string' || !l.id) return null;
  return { kind: l.kind, id: l.id, name: typeof l.name === 'string' ? l.name : undefined };
}

function parseWhen(raw: unknown): ActionWhen | null {
  const w = raw as Record<string, unknown> | null;
  switch (w?.at) {
    case 'start': return { at: 'start' };
    case 'time': return { at: 'time', sec: num(w.sec, 0, 3600, 0) };
    case 'section': return SECTIONS.includes(w.section as SectionKind)
      ? { at: 'section', section: w.section as SectionKind, nth: w.nth === undefined ? undefined : num(w.nth, 1, 99, 1) } : null;
    case 'kick': return { at: 'kick', every: Math.round(num(w.every, 1, 64, 4)) };
    case 'before-end': return { at: 'before-end', sec: num(w.sec, 0, 600, 8) };
    default: return null;
  }
}

function parseWhat(raw: unknown): ActionWhat | null {
  const a = raw as Record<string, unknown> | null;
  switch (a?.do) {
    case 'look': { const look = parseLook(a.look); return look ? { do: 'look', look, fade: num(a.fade, 0, 60, 4) } : null; }
    case 'drain': case 'clear': case 'seed': case 'burst': case 'dyes': case 'title': case 'signoff':
      return { do: a.do } as ActionWhat;
    case 'zoom': return { do: 'zoom', zoom: num(a.zoom, 1, 16, 4), over: num(a.over, 0, 30, 3) };
    case 'kaleidoscope': return { do: 'kaleidoscope', folds: Math.round(num(a.folds, 0, 12, 6)) };
    case 'blackout': return { do: 'blackout', over: num(a.over, 0, 30, 4) };
    case 'lights-up': return { do: 'lights-up', over: num(a.over, 0, 30, 2) };
    case 'set': return typeof a.key === 'string' && typeof a.value === 'number'
      ? { do: 'set', key: a.key as keyof VisualizerSettings, value: a.value, over: num(a.over, 0, 60, 0) } : null;
    default: return null;
  }
}

function parseActions(raw: unknown): SongAction[] {
  if (!Array.isArray(raw)) return [];
  const out: SongAction[] = [];
  for (const r of raw) {
    const when = parseWhen((r as { when?: unknown })?.when);
    const what = parseWhat((r as { what?: unknown })?.what);
    if (when && what) out.push({ id: typeof (r as { id?: unknown }).id === 'string' ? (r as { id: string }).id : newId('act'), when, what });
  }
  return out;
}

export function parseShows(raw: unknown): SongShow[] {
  if (!Array.isArray(raw)) return [];
  const out: SongShow[] = [];
  for (const r of raw) {
    const o = r as Partial<SongShow> | null;
    const song = parseSongRef(o?.song);
    const look = parseLook(o?.look);
    if (!song || !look) continue;
    out.push({ id: typeof o?.id === 'string' ? o.id : newId('song'), song, look, actions: parseActions(o?.actions), notes: typeof o?.notes === 'string' ? o.notes : undefined });
  }
  return out;
}

export function parseSets(raw: unknown): ActionSet[] {
  if (!Array.isArray(raw)) return [];
  const out: ActionSet[] = [];
  for (const r of raw) {
    const o = r as Partial<ActionSet> | null;
    if (typeof o?.name !== 'string' || !o.name.trim()) continue;
    const actions = parseActions(o.actions);
    if (!actions.length) continue;
    out.push({ id: typeof o.id === 'string' ? o.id : newId('set'), name: o.name.trim(), description: typeof o.description === 'string' ? o.description : undefined, actions });
  }
  return out;
}

// ── The scheduler ─────────────────────────────────────────────────────

/** Where the song is, as the runtime knows it. */
export interface SongClock {
  /** Seconds since the first note. */
  t: number;
  /** How long the song is, if known. */
  duration: number | null;
  /** The label of the section the song is in now, and how many sections of each kind have begun (this one included). */
  section: { label: string; index: number } | null;
  sectionCounts: Record<string, number>;
  /** Kicks heard since the first note. */
  kicks: number;
}

/** What has fired, so an action fires once (or once per section, or once per kick count). */
export type FiredState = Map<string, number>;

const sectionKind = (label: string): SectionKind | null => {
  const l = label.toLowerCase();
  for (const k of SECTIONS) if (k !== 'any' && l.startsWith(k)) return k;
  return null;
};

/**
 * The actions that are due now, given where the song is and what has fired.
 * Updates `fired`. Pure apart from that, so a harness can run a whole song.
 */
export function dueActions(show: SongShow, clock: SongClock, fired: FiredState): SongAction[] {
  const due: SongAction[] = [];
  for (const a of show.actions) {
    const last = fired.get(a.id);
    const w = a.when;
    switch (w.at) {
      case 'start':
        if (last === undefined) { fired.set(a.id, 0); due.push(a); }
        break;
      case 'time':
        if (last === undefined && clock.t >= w.sec) { fired.set(a.id, clock.t); due.push(a); }
        break;
      case 'before-end':
        if (last === undefined && clock.duration !== null && clock.t >= clock.duration - w.sec) { fired.set(a.id, clock.t); due.push(a); }
        break;
      case 'section': {
        if (!clock.section) break;
        const kind = sectionKind(clock.section.label);
        const matches = w.section === 'any' || kind === w.section;
        if (!matches) break;
        const count = w.section === 'any' ? clock.section.index + 1 : (clock.sectionCounts[w.section] ?? 0);
        if (w.nth !== undefined && count !== w.nth) break;
        // Once per section it matches: keyed by the section's index.
        if (last !== clock.section.index) { fired.set(a.id, clock.section.index); due.push(a); }
        break;
      }
      case 'kick': {
        const every = Math.max(1, w.every);
        const n = Math.floor(clock.kicks / every);
        if (n > 0 && (last ?? 0) < n) { fired.set(a.id, n); due.push(a); }
        break;
      }
    }
  }
  return due;
}

export const songTitleFor = (s: SongShow): string => songLabel(s.song);

// ── Cards ─────────────────────────────────────────────────────────────

/**
 * Split a title into at most `max` lines, trying every split (a title is a
 * handful of words) and keeping the one whose longest line is shortest, since
 * that line decides how big the letters can be poured.
 */
export function wrapTitle(text: string, max: number, linePenalty = 2): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length <= 1 || max <= 1) return [words.join(' ')];
  let best = [words.join(' ')];
  let bestScore = best[0].length + linePenalty;
  const splits = (from: number, left: number): string[][] => {
    if (left === 1) return [[words.slice(from).join(' ')]];
    const out: string[][] = [];
    for (let i = from + 1; i <= words.length - left + 1; i++) {
      for (const rest of splits(i, left - 1)) out.push([words.slice(from, i).join(' '), ...rest]);
    }
    return out;
  };
  for (let n = 2; n <= Math.min(max, words.length); n++) {
    for (const lines of splits(0, n)) {
      const score = Math.max(...lines.map((l) => l.length)) + n * linePenalty;
      if (score < bestScore) { bestScore = score; best = lines; }
    }
  }
  return best;
}

/** Drop "(Remastered 2011)", "- Live", "feat. …": a card has room for the song's name. */
export function cleanTitle(t: string): string {
  return String(t ?? '')
    .replace(/\s*[([][^)\]]*(remaster|version|edit|mix|mono|stereo|live|deluxe|feat|ft\.|with |bonus|demo|take)[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?(remaster(ed)?|live|single version|radio edit|mono|stereo)\b.*$/i, '')
    .replace(/\s+(feat\.?|ft\.?)\s.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** The rows of a song's title card: the name in capitals on one or two lines, the artist under it. */
export function titleRows(song: SongRef): { text: string; weight: number }[] {
  const rows = wrapTitle(cleanTitle(song.title), 2).map((t) => ({ text: t.toUpperCase(), weight: 1.25 }));
  if (song.artist) rows.push({ text: song.artist, weight: 0.75 });
  return rows;
}
