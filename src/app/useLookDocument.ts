import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { useUserPresets } from '../hooks/useUserPresets';
import type { SongRef } from '../lib/songRef';
import type { VisualizerSettings } from '../types';

export interface LookDocumentDeps {
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  getSettings: () => VisualizerSettings;
  userPresets: ReturnType<typeof useUserPresets>;
  getCurrentSong: () => SongRef | null;
  setPinnedPresetId: Dispatch<SetStateAction<string | null>>;
  setToast: (msg: string) => void;
  openSaveSheet: (on: boolean) => void;
}

/**
 * The open saved look (`docId`, `docDirty`) and the save / overwrite / delete
 * actions shared by the desk's Save sheet and the phone's save forms.
 */
export function useLookDocument({
  visualizerRef,
  getSettings,
  userPresets,
  getCurrentSong,
  setPinnedPresetId,
  setToast,
  openSaveSheet,
}: LookDocumentDeps) {
  const [docId, setDocId] = useState<string | null>(null);
  const [docDirty, setDocDirty] = useState(false);

  const saveCurrentPreset = (name: string, description: string, forSong = false) => {
    const plate = visualizerRef.current?.describePlate();
    const p = userPresets.saveCurrent(
      name, description, getSettings(),
      plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null,
      forSong ? getCurrentSong() : null,
    );
    setPinnedPresetId(p.id);
    setDocId(p.id);
    setDocDirty(false);
    setToast(`Saved “${p.name}”`);
  };

  const replacePresetById = (id: string): boolean => {
    const plate = visualizerRef.current?.describePlate();
    const saved = userPresets.saveOver(
      id, getSettings(),
      plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null,
    );
    if (!saved) { setToast('That preset is gone; save it under a name'); return false; }
    setPinnedPresetId(saved.id);
    setDocId(saved.id);
    setDocDirty(false);
    setToast(`Saved over “${saved.name}”`);
    return true;
  };

  const replaceLook = () => {
    if (!docId) { openSaveSheet(true); return; }
    if (!replacePresetById(docId)) { setDocId(null); openSaveSheet(true); }
    else openSaveSheet(false);
  };

  const deleteSavedLook = (id: string) => {
    userPresets.remove(id);
    if (docId === id) setDocId(null);
  };

  return {
    docId, setDocId, docDirty, setDocDirty,
    saveCurrentPreset, replacePresetById, replaceLook, deleteSavedLook,
  };
}
