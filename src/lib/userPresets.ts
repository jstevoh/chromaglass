/**
 * Presets and sequences as files.
 *
 * The built-in presets live in code. A projectionist's own looks live here:
 * plain JSON, indented, every setting named, so a file can be read, edited
 * by hand, kept in a folder, mailed to a friend. A preset file carries the
 * whole settings block plus the two things the visualizer keeps outside the
 * settings — which dyes the plate may use and how the automation injects.
 * A sequence file carries the sequence and, embedded, any user presets its
 * stages refer to, so it arrives whole.
 */

import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import type { ShowSequence, ShowStage } from './sequencer';
import { parseSongRef, type SongRef } from './songRef';

export const PRESET_FORMAT = 'chromaglass-preset';
export const SEQUENCE_FORMAT = 'chromaglass-sequence';
export const PRESET_FILE_EXT = '.chromaglass-preset.json';
export const SEQUENCE_FILE_EXT = '.chromaglass-sequence.json';
export const USER_PRESETS_KEY = 'chromaglass-user-presets';

export interface UserPreset {
  format: typeof PRESET_FORMAT;
  version: 1;
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  settings: VisualizerSettings;
  /** Palette indices the plate may use; omitted = any harmony. */
  contract?: number[];
  /** How the automation injects: 'drop' | 'pour' | 'spray' | 'splatter' | 'streak'. */
  injectStyles?: string[];
  /** The song this look was made for: it is applied when that song is identified. */
  song?: SongRef;
}

export interface SequenceFile {
  format: typeof SEQUENCE_FORMAT;
  version: 1;
  sequence: ShowSequence;
  /** User presets the stages refer to, so the sequence arrives whole. */
  presets?: UserPreset[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'preset';

export const isUserPresetId = (id: string | null | undefined): boolean => !!id && id.startsWith('user-');

export function makeUserPreset(
  name: string,
  description: string,
  settings: VisualizerSettings,
  contract: number[] | null,
  injectStyles: string[] | null,
  song: SongRef | null = null,
): UserPreset {
  return {
    format: PRESET_FORMAT,
    version: 1,
    id: `user-${slug(name)}-${Date.now().toString(36)}`,
    name: name.trim() || 'Untitled preset',
    description: description.trim() || undefined,
    createdAt: new Date().toISOString(),
    settings: cleanSettings(settings),
    contract: contract && contract.length ? [...contract] : undefined,
    injectStyles: injectStyles && injectStyles.length ? [...injectStyles] : undefined,
    song: song ?? undefined,
  };
}

/** Only known settings, in the order the defaults declare them, and never a pinned solver grid. */
export function cleanSettings(raw: Partial<VisualizerSettings>): VisualizerSettings {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof VisualizerSettings)[]) {
    const v = raw[key];
    const d = DEFAULT_SETTINGS[key];
    if (v === undefined || v === null) { out[key] = d; continue; }
    // Keep the type the default has; anything else falls back to the default.
    if (typeof d === 'object' && d !== null) out[key] = typeof v === 'object' ? { ...(d as object), ...(v as object) } : d;
    else if (typeof v === typeof d) out[key] = v;
    else out[key] = d;
  }
  out.simResolution = 'auto';
  return out as unknown as VisualizerSettings;
}

export function serializePreset(p: UserPreset): string {
  return JSON.stringify(p, null, 2) + '\n';
}

export function parsePresetFile(text: string): UserPreset {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That is not a JSON file.'); }
  const o = raw as Partial<UserPreset>;
  if (!o || typeof o !== 'object' || o.format !== PRESET_FORMAT) throw new Error('That is not a ChromaGlass preset file.');
  if (!o.settings || typeof o.settings !== 'object') throw new Error('The preset file has no settings block.');
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : 'Untitled preset';
  return {
    format: PRESET_FORMAT,
    version: 1,
    id: typeof o.id === 'string' && isUserPresetId(o.id) ? o.id : `user-${slug(name)}-${Date.now().toString(36)}`,
    name,
    description: typeof o.description === 'string' ? o.description : undefined,
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    settings: cleanSettings(o.settings),
    contract: Array.isArray(o.contract) ? o.contract.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 16).slice(0, 8) : undefined,
    injectStyles: Array.isArray(o.injectStyles) ? o.injectStyles.filter((s): s is string => typeof s === 'string').slice(0, 6) : undefined,
    song: parseSongRef(o.song),
  };
}

export function serializeSequence(seq: ShowSequence, presets: UserPreset[]): string {
  const file: SequenceFile = {
    format: SEQUENCE_FORMAT,
    version: 1,
    sequence: { ...seq, builtIn: false },
    presets: presets.length ? presets : undefined,
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export function parseSequenceFile(text: string): SequenceFile {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('That is not a JSON file.'); }
  const o = raw as Partial<SequenceFile>;
  if (!o || typeof o !== 'object' || o.format !== SEQUENCE_FORMAT) throw new Error('That is not a ChromaGlass sequence file.');
  const s = o.sequence as Partial<ShowSequence> | undefined;
  if (!s || !Array.isArray(s.stages)) throw new Error('The sequence file has no stages.');
  const stages: ShowStage[] = s.stages
    .filter((st): st is ShowStage => !!st && typeof st === 'object')
    .map((st, i) => ({
      id: typeof st.id === 'string' ? st.id : `st-${Date.now().toString(36)}-${i}`,
      name: typeof st.name === 'string' ? st.name : `Stage ${i + 1}`,
      seconds: Number.isFinite(st.seconds) ? Math.max(1, st.seconds) : 60,
      advance: st.advance === 'section' || st.advance === 'hold' ? st.advance : 'time',
      presetId: typeof st.presetId === 'string' ? st.presetId : undefined,
      settings: st.settings && typeof st.settings === 'object' ? st.settings : undefined,
      paletteSize: Number.isFinite(st.paletteSize) ? st.paletteSize : undefined,
      paletteLead: Number.isFinite(st.paletteLead) ? st.paletteLead : undefined,
      macro: typeof st.macro === 'boolean' ? st.macro : undefined,
      transition: Number.isFinite(st.transition) ? Math.max(0, st.transition!) : 8,
    }));
  const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : 'Untitled sequence';
  const presets = Array.isArray(o.presets)
    ? o.presets.flatMap((p) => { try { return [parsePresetFile(JSON.stringify(p))]; } catch { return []; } })
    : [];
  return {
    format: SEQUENCE_FORMAT,
    version: 1,
    sequence: {
      id: typeof s.id === 'string' && s.id.startsWith('seq-') ? s.id : `seq-${Date.now().toString(36)}`,
      name,
      description: typeof s.description === 'string' ? s.description : undefined,
      loop: s.loop !== false,
      stages,
      builtIn: false,
      song: parseSongRef(s.song),
    },
    presets,
  };
}

/** Hand the browser a file to save. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const presetFileName = (p: UserPreset) => `${slug(p.name)}${PRESET_FILE_EXT}`;
export const sequenceFileName = (s: ShowSequence) => `${slug(s.name)}${SEQUENCE_FILE_EXT}`;

export function loadUserPresets(): UserPreset[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list.flatMap((p) => { try { return [parsePresetFile(JSON.stringify(p))]; } catch { return []; } }) : [];
  } catch {
    return [];
  }
}

export function saveUserPresets(list: UserPreset[]): void {
  try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(list)); } catch { /* storage full or private */ }
}
