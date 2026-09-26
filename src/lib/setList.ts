/**
 * A set list: the looks a show runs through, in order, on the Perform desk.
 *
 * The desk's cue list used to be every look there is, always in the same
 * order. A set is the operator's own: each item is a built-in look, a look
 * they saved, or a stage sequence, and each can carry what it needs on the
 * night — how long its fade is, which song brings it up, and the performance
 * controls it starts on.
 *
 * The file, `*.chromaglass-setlist.json`:
 *
 *   {
 *     "format": "chromaglass-setlist",
 *     "version": 1,
 *     "name": "Friday at the Fillmore",
 *     "items": [
 *       { "look": "classic", "fade": 4 },
 *       { "look": "timbre-shifter", "song": { "title": "Dark Star", "artist": "Grateful Dead" },
 *         "controls": { "globalSpeed": 0.03, "beatSqueeze": 0.6 },
 *         "rides": ["dimmer", "globalSpeed", "beatSqueeze", "turbulenceScale"] },
 *       { "saved": "user-my-wash-1726000000000", "name": "My wash" },
 *       { "sequence": "seq-sunrise" }
 *     ],
 *     "presets": [ ...the saved looks it uses, as chromaglass-preset objects... ],
 *     "sequences": [ ...the stage sequences it uses... ]
 *   }
 *
 * Each item is one of `look` (a built-in look's id), `saved` (a saved look's
 * id, carried in `presets` so the file travels), or `sequence` (a stage
 * sequence's id, carried in `sequences`). Everything else is optional:
 *
 * - `name`: what the row says (the look's own name by default).
 * - `fade`: seconds to hand over in, 0 for a cut (the desk's Fade by default).
 * - `song`: `{ title, artist, isrc? }`. When that song is identified (and song
 *   detection is on), the item goes live on its own.
 * - `controls`: performance-control values the item starts on, on top of the
 *   look's own: any numeric setting, by its key (`globalSpeed`,
 *   `turbulenceScale`, `beatSqueeze`, `plateRock`, `dimmer` is not one — the
 *   room's brightness belongs to the room).
 * - `rides`: which controls the desk's strip shows while the item is live.
 *
 * A bare array of items is read too, and a single look, preset file or
 * sequence file becomes one item, so a file written by hand needs no wrapper.
 * Anything unreadable is said, not half-loaded.
 */

import type { VisualizerSettings } from '../types';
import type { SongRef } from './songRef';
import { parseSongRef } from './songRef';
import type { UserPreset } from './userPresets';
import { PRESET_FORMAT, SEQUENCE_FORMAT } from './userPresets';
import type { ShowSequence } from './sequencer';

export const SETLIST_FORMAT = 'chromaglass-setlist';
export const SETLIST_VERSION = 1;
export const SETLIST_FILE_EXT = '.chromaglass-setlist.json';
export const SETLIST_KEY = 'chromaglass-setlist';

export type SetItemKind = 'look' | 'saved' | 'sequence';

export interface SetItem {
  /** This item's own id: the same look can be in a set twice. */
  id: string;
  kind: SetItemKind;
  /** The look's, saved look's or sequence's id. */
  ref: string;
  name?: string;
  /** Seconds, 0 a cut; absent, the desk's Fade. */
  fade?: number;
  song?: SongRef;
  controls?: Partial<Record<keyof VisualizerSettings, number>>;
  rides?: (keyof VisualizerSettings)[];
}

export interface SetList {
  name: string;
  items: SetItem[];
}

export interface SetListFile {
  list: SetList;
  presets: UserPreset[];
  sequences: ShowSequence[];
  warnings: string[];
}

/** Settings a set item may not carry: the room's, not the look's. */
const NOT_CONTROLS = new Set<string>(['dimmer', 'sensitivity', 'bassBoost', 'simResolution']);

let counter = 0;
export const setItemId = (): string => `set-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const emptySet = (): SetList => ({ name: 'My set', items: [] });

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/**
 * One item from what a file says, or null with the reason added to `warnings`.
 * `known` says whether a settings key exists, so a misspelt control is named.
 */
export function readItem(raw: unknown, warnings: string[], known: (key: string) => boolean, where = 'an item'): SetItem | null {
  if (!isObj(raw)) { warnings.push(`${where} is not an object`); return null; }
  let kind: SetItemKind | null = null, ref: string | undefined;
  if ((ref = str(raw.look))) kind = 'look';
  else if ((ref = str(raw.saved))) kind = 'saved';
  else if ((ref = str(raw.sequence))) kind = 'sequence';
  else if (str(raw.kind) && str(raw.ref) && ['look', 'saved', 'sequence'].includes(raw.kind as string)) {
    kind = raw.kind as SetItemKind; ref = str(raw.ref);
  }
  if (!kind || !ref) { warnings.push(`${where} names no look, saved look or sequence`); return null; }
  const item: SetItem = { id: str(raw.id) ?? setItemId(), kind, ref };
  const name = str(raw.name); if (name) item.name = name;
  if (raw.fade !== undefined) {
    const f = Number(raw.fade);
    if (Number.isFinite(f) && f >= 0) item.fade = Math.min(60, f);
    else warnings.push(`${where}: fade ${JSON.stringify(raw.fade)} is not a number of seconds, so the desk's fade is used`);
  }
  if (raw.song !== undefined) {
    const song = parseSongRef(raw.song);
    if (song) item.song = song; else warnings.push(`${where}: the song needs a title and an artist`);
  }
  if (raw.controls !== undefined) {
    if (!isObj(raw.controls)) warnings.push(`${where}: controls is not an object of settings`);
    else {
      const controls: Partial<Record<keyof VisualizerSettings, number>> = {};
      for (const [k, v] of Object.entries(raw.controls)) {
        if (NOT_CONTROLS.has(k)) { warnings.push(`${where}: ${k} belongs to the room, not a look, and is left alone`); continue; }
        if (!known(k)) { warnings.push(`${where}: there is no control called ${k}`); continue; }
        const n = Number(v);
        if (!Number.isFinite(n)) { warnings.push(`${where}: ${k} is not a number`); continue; }
        controls[k as keyof VisualizerSettings] = n;
      }
      if (Object.keys(controls).length) item.controls = controls;
    }
  }
  if (raw.rides !== undefined) {
    if (!Array.isArray(raw.rides)) warnings.push(`${where}: rides is not a list of controls`);
    else {
      const rides = raw.rides.filter((k): k is string => typeof k === 'string' && known(k));
      if (rides.length < raw.rides.length) warnings.push(`${where}: ${raw.rides.length - rides.length} of its rides are not controls`);
      if (rides.length) item.rides = rides as (keyof VisualizerSettings)[];
    }
  }
  return item;
}

/**
 * Read a set list file, or anything that can be made one item: a preset file
 * (a saved look), a sequence file, a bare item or a bare array of them.
 * Throws with a reason when nothing in it can be used.
 */
export function readSetListFile(text: string, known: (key: string) => boolean): SetListFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('This is not a JSON file.'); }
  const warnings: string[] = [];
  const presets: UserPreset[] = [];
  const sequences: ShowSequence[] = [];
  let name = 'Imported set';
  let rawItems: unknown[] = [];

  if (Array.isArray(raw)) rawItems = raw;
  else if (isObj(raw) && raw.format === PRESET_FORMAT) {
    // A saved look on its own: one item, carrying it.
    if (!str(raw.id) || !isObj(raw.settings)) throw new Error('This preset file has no id or settings.');
    presets.push(raw as unknown as UserPreset);
    rawItems = [{ saved: raw.id, name: raw.name }];
    name = str(raw.name) ?? name;
  } else if (isObj(raw) && raw.format === SEQUENCE_FORMAT) {
    const seq = raw.sequence;
    if (!isObj(seq) || !str(seq.id) || !Array.isArray(seq.stages)) throw new Error('This sequence file has no sequence in it.');
    sequences.push(seq as unknown as ShowSequence);
    if (Array.isArray(raw.presets)) presets.push(...(raw.presets as UserPreset[]));
    rawItems = [{ sequence: seq.id, name: seq.name }];
    name = str(seq.name) ?? name;
  } else if (isObj(raw) && (raw.format === SETLIST_FORMAT || Array.isArray(raw.items))) {
    if (raw.format === SETLIST_FORMAT && Number(raw.version) > SETLIST_VERSION) {
      warnings.push(`written by a newer version (${raw.version}); what this one knows is read`);
    }
    name = str(raw.name) ?? name;
    rawItems = Array.isArray(raw.items) ? raw.items : [];
    if (Array.isArray(raw.presets)) {
      for (const p of raw.presets) {
        if (isObj(p) && str(p.id) && isObj(p.settings)) presets.push(p as unknown as UserPreset);
        else warnings.push('a saved look in the file has no id or settings, and is left out');
      }
    }
    if (Array.isArray(raw.sequences)) {
      for (const q of raw.sequences) {
        if (isObj(q) && str(q.id) && Array.isArray(q.stages)) sequences.push(q as unknown as ShowSequence);
        else warnings.push('a sequence in the file has no id or stages, and is left out');
      }
    }
  } else if (isObj(raw) && (raw.look || raw.saved || raw.sequence)) {
    rawItems = [raw];
  } else {
    throw new Error('This is not a set list, a saved look or a sequence.');
  }

  const items: SetItem[] = [];
  rawItems.forEach((r, i) => {
    const item = readItem(r, warnings, known, `item ${i + 1}`);
    if (item) items.push(item);
  });
  if (!items.length) throw new Error(warnings[0] ? `Nothing in it could be used: ${warnings[0]}.` : 'There are no items in it.');
  return { list: { name, items }, presets, sequences, warnings };
}

/** The file for a set, carrying the saved looks and sequences it uses so it travels. */
export function writeSetListFile(list: SetList, presets: UserPreset[], sequences: ShowSequence[]): string {
  const usedPresets = presets.filter((p) => list.items.some((i) => i.kind === 'saved' && i.ref === p.id));
  const usedSequences = sequences.filter((q) => !q.builtIn && list.items.some((i) => i.kind === 'sequence' && i.ref === q.id));
  const items = list.items.map((i) => {
    const out: Record<string, unknown> = { [i.kind]: i.ref };
    if (i.name) out.name = i.name;
    if (i.fade !== undefined) out.fade = i.fade;
    if (i.song) out.song = i.song;
    if (i.controls && Object.keys(i.controls).length) out.controls = i.controls;
    if (i.rides && i.rides.length) out.rides = i.rides;
    return out;
  });
  return JSON.stringify({
    format: SETLIST_FORMAT, version: SETLIST_VERSION, name: list.name, items,
    ...(usedPresets.length ? { presets: usedPresets } : {}),
    ...(usedSequences.length ? { sequences: usedSequences } : {}),
  }, null, 2);
}

export function loadSetList(): SetList {
  try {
    const raw = localStorage.getItem(SETLIST_KEY);
    if (!raw) return emptySet();
    const parsed = JSON.parse(raw);
    if (isObj(parsed) && Array.isArray(parsed.items)) {
      const items = parsed.items.filter((i: unknown): i is SetItem =>
        isObj(i) && typeof i.id === 'string' && typeof i.ref === 'string' && ['look', 'saved', 'sequence'].includes(i.kind as string));
      return { name: str(parsed.name) ?? 'My set', items };
    }
  } catch { /* a broken store is an empty set */ }
  return emptySet();
}

export function saveSetList(list: SetList): void {
  try { localStorage.setItem(SETLIST_KEY, JSON.stringify(list)); } catch { /* private window: this session only */ }
}

/** Move an item by `by` places, held to the list. */
export function moveItem(list: SetList, id: string, by: number): SetList {
  const i = list.items.findIndex((x) => x.id === id);
  if (i < 0) return list;
  const j = Math.max(0, Math.min(list.items.length - 1, i + by));
  if (i === j) return list;
  const items = [...list.items];
  const [it] = items.splice(i, 1);
  items.splice(j, 0, it);
  return { ...list, items };
}
