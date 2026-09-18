import { useCallback, useState } from 'react';
import type { VisualizerSettings } from '../types';
import type { Preset } from '../presets';
import type { SongRef } from '../lib/songRef';
import {
  UserPreset, downloadText, loadUserPresets, makeUserPreset, parsePresetFile, presetFileName,
  saveUserPresets, serializePreset,
} from '../lib/userPresets';

/**
 * The projectionist's own presets: kept in the browser so they are there next
 * time, saved to files so they can be kept and shared, loaded from files
 * others made. Separate from the built-ins in every way but the menu.
 */
export function useUserPresets() {
  const [presets, setPresets] = useState<UserPreset[]>(() => loadUserPresets());

  const persist = useCallback((next: UserPreset[]) => {
    setPresets(next);
    saveUserPresets(next);
  }, []);

  const upsert = useCallback((p: UserPreset) => {
    setPresets((prev) => {
      const next = prev.some((q) => q.id === p.id) ? prev.map((q) => (q.id === p.id ? p : q)) : [...prev, p];
      saveUserPresets(next);
      return next;
    });
  }, []);

  /**
   * Snapshot the current look as a **new** saved look. Save as, in other words.
   *
   * No longer hands a file over as a side effect. Saving and exporting are two
   * different intentions — one keeps your work where you can get back to it,
   * the other produces something to send someone — and doing both on one
   * button meant every save put a file in Downloads whether or not anybody
   * wanted one, while there was no way at all to save over the look you were
   * already working on. `exportPreset` is the file.
   */
  const saveCurrent = useCallback((name: string, description: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null, song: SongRef | null = null): UserPreset => {
    const p = makeUserPreset(name, description, settings, contract, injectStyles, liquids, song);
    upsert(p);
    return p;
  }, [upsert]);

  /** Save over a look that already exists, keeping its id, name and song. */
  const saveOver = useCallback((id: string, settings: VisualizerSettings, contract: number[] | null, injectStyles: string[] | null, liquids: string[] | null = null): UserPreset | null => {
    const existing = loadUserPresets().find(p => p.id === id);
    if (!existing) return null;
    const p: UserPreset = { ...existing, settings, contract, injectStyles, liquids };
    upsert(p);
    return p;
  }, [upsert]);

  const exportPreset = useCallback((p: UserPreset) => downloadText(presetFileName(p), serializePreset(p)), []);

  const importFile = useCallback(async (file: File): Promise<UserPreset> => {
    const p = parsePresetFile(await file.text());
    upsert(p);
    return p;
  }, [upsert]);

  const remove = useCallback((id: string) => {
    setPresets((prev) => { const next = prev.filter((p) => p.id !== id); saveUserPresets(next); return next; });
  }, []);

  return { presets, upsert, saveCurrent, saveOver, exportPreset, importFile, remove, persist };
}

/** A user preset in the shape the menus and the sequencer already understand. */
export const asPreset = (p: UserPreset): Preset => ({
  id: p.id,
  name: p.name,
  description: p.description ?? 'A saved preset',
  settings: p.settings,
});
