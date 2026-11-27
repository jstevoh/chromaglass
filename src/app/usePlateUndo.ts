import { useRef, useState, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { VisualizerSettings } from '../types';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { PlateSnapshot } from '../components/visualizerHandle';
import type { ShowToastOptions } from './useToast';
import type { ArmedLook } from './shared';
import type { RemoteState } from '../lib/remoteProtocol';

export const PLATE_UNDO_MS = 8000;

interface ActiveSnapshot {
  id: number;
  plate: PlateSnapshot | null;
  settings: VisualizerSettings;
  pinnedPresetId: string | null;
  docId: string | null;
  docDirty: boolean;
  cued: ArmedLook | null;
  liveItemId: string | null;
  isAutomated: boolean;
  previousLook: { id: string | null; settings: VisualizerSettings } | null;
}

interface PlateUndoDeps {
  visualizerRef: RefObject<LiquidVisualizerHandle | null>;
  settingsRef: RefObject<VisualizerSettings>;
  pinnedPresetId: string | null;
  docId: string | null;
  docDirty: boolean;
  cued: ArmedLook | null;
  liveItemId: string | null;
  isAutomated: boolean;
  previousLook: RefObject<{ id: string | null; settings: VisualizerSettings } | null>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  setPinnedPresetId: Dispatch<SetStateAction<string | null>>;
  setDocId: Dispatch<SetStateAction<string | null>>;
  setDocDirty: Dispatch<SetStateAction<boolean>>;
  setCued: Dispatch<SetStateAction<ArmedLook | null>>;
  setLiveItemId: Dispatch<SetStateAction<string | null>>;
  setIsAutomated: Dispatch<SetStateAction<boolean>>;
  setClearTrigger: Dispatch<SetStateAction<number>>;
  setDrainTrigger: Dispatch<SetStateAction<number>>;
  triggerLucky: () => void;
  rawNewLook: () => void;
  goLookNow: (id: string, seconds?: number) => void;
  showToast: (opts: ShowToastOptions) => number;
}

/**
 * 8 s safety net over destructive plate actions (New plate, Drain, Clear,
 * Randomise/Shuffle/Lucky, phone random look) on desktop, phone and Remote (PLAN 49a).
 * Captures both GPU/CPU solver fields and UI state before the reset so Undo
 * restores the exact liquid on the glass rather than replaying a look.
 */
export function usePlateUndo(d: PlateUndoDeps) {
  const snapRef = useRef<ActiveSnapshot | null>(null);
  const nextUndoIdRef = useRef(1);
  const [undoNotice, setUndoNotice] = useState<RemoteState['undo']>(null);

  const releaseSnapshot = useCallback((onlyId?: number) => {
    const cur = snapRef.current;
    if (!cur) return;
    if (onlyId !== undefined && cur.id !== onlyId) return;
    snapRef.current = null;
    cur.plate?.destroy();
    setUndoNotice(prev => (prev && (onlyId === undefined || prev.id === onlyId) ? null : prev));
  }, []);

  const restorePlateUndo = useCallback(() => {
    const snap = snapRef.current;
    if (!snap) return;
    snapRef.current = null;
    setUndoNotice(null);

    d.setSettings(snap.settings);
    d.setPinnedPresetId(snap.pinnedPresetId);
    d.setDocId(snap.docId);
    d.setDocDirty(snap.docDirty);
    d.setCued(snap.cued);
    d.setLiveItemId(snap.liveItemId);
    d.setIsAutomated(snap.isAutomated);
    d.previousLook.current = snap.previousLook
      ? { id: snap.previousLook.id, settings: { ...snap.previousLook.settings } }
      : null;

    if (snap.plate) {
      d.visualizerRef.current?.restoreSnapshot?.(snap.plate);
      snap.plate.destroy();
    }
  }, [d]);

  const runWithUndo = useCallback((title: string, meta: string | undefined, perform: () => void) => {
    releaseSnapshot();
    const id = nextUndoIdRef.current++;
    const plate = d.visualizerRef.current?.takeSnapshot?.() ?? null;
    const snap: ActiveSnapshot = {
      id,
      plate,
      settings: { ...d.settingsRef.current },
      pinnedPresetId: d.pinnedPresetId,
      docId: d.docId,
      docDirty: d.docDirty,
      cued: d.cued ? { ...d.cued } : null,
      liveItemId: d.liveItemId,
      isAutomated: d.isAutomated,
      previousLook: d.previousLook.current
        ? { id: d.previousLook.current.id, settings: { ...d.previousLook.current.settings } }
        : null,
    };
    snapRef.current = snap;
    setUndoNotice({ id, title });

    perform();

    d.showToast({
      title,
      meta,
      actionLabel: 'Undo',
      durationMs: PLATE_UNDO_MS,
      onAction: restorePlateUndo,
      onExpire: () => releaseSnapshot(id),
    });
  }, [d, releaseSnapshot, restorePlateUndo]);

  const clearPlate = useCallback(() => {
    runWithUndo('Plate cleared', undefined, () => d.setClearTrigger(v => v + 1));
  }, [d, runWithUndo]);

  const drainPlate = useCallback(() => {
    runWithUndo('Plate drained', undefined, () => d.setDrainTrigger(v => v + 1));
  }, [d, runWithUndo]);

  const luckyPlate = useCallback(() => {
    runWithUndo('Look randomised', undefined, () => d.triggerLucky());
  }, [d, runWithUndo]);

  const newPlate = useCallback(() => {
    runWithUndo('Empty plate', 'Settings & liquid cleared', () => d.rawNewLook());
  }, [d, runWithUndo]);

  const randomLookPlate = useCallback((next: { id: string; name: string } | null) => {
    if (!next) return;
    runWithUndo(`Switched to “${next.name}”`, undefined, () => d.goLookNow(next.id));
  }, [d, runWithUndo]);

  const showPanelClosedUndo = useCallback((panelTitle: string, onUndo: () => void) => {
    d.showToast({
      title: `Closed ${panelTitle}`,
      meta: 'Reopen from + Panel (⌘P)',
      actionLabel: 'Undo',
      durationMs: PLATE_UNDO_MS,
      onAction: onUndo,
    });
  }, [d]);

  return {
    undoNotice,
    clearPlate,
    drainPlate,
    luckyPlate,
    newPlate,
    randomLookPlate,
    restorePlateUndo,
    showPanelClosedUndo,
  };
}
