import { useState, useCallback, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type SetItemKind, setItemId, readSetListFile, withSavedSet, loadSavedSets, SETLIST_FILE_EXT, writeSetListFile, starterSet, moveItem, type SetList } from '../lib/setList';
import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import type { SetAction, SetItemAction } from '../components/desk/deskProps';
import { downloadText, parseSequenceFile, type UserPreset } from '../lib/userPresets';
import { exportShowKit, importShowKit } from '../lib/showKit';
import { PRESETS } from '../presets';
import type { ShowSequence } from '../lib/sequencer';
import type { SongRef } from '../lib/songRef';
import type { useUserPresets } from '../hooks/useUserPresets';
import type { useShowSequencer } from '../hooks/useShowSequencer';

/**
 * The set list's own edits: add an item, import a file into the set, the set
 * menu's Save, Open, Export and the show kit, and each item's menu (move,
 * remove, open, bind a sequence to a song).
 */
interface SetActionsDeps {
  changeSet: (next: SetList | ((prev: SetList) => SetList)) => void;
  userPresets: ReturnType<typeof useUserPresets>;
  sequencer: ReturnType<typeof useShowSequencer>;
  changeSaved: (f: (prev: SetList[]) => SetList[]) => void;
  setListRef: RefObject<SetList>;
  setLiveItemId: Dispatch<SetStateAction<string | null>>;
  userPresetsRef: RefObject<UserPreset[]>;
  sequencerRef: RefObject<{ startAt: (id: string, positionSec: number) => void; sequences: ShowSequence[]; } | null>;
  setShowSongs: Dispatch<SetStateAction<boolean>>;
  currentSong: SongRef | null;
  rideKeys: (keyof VisualizerSettings)[];
  settingsRef: RefObject<VisualizerSettings>;
}

export function useSetActions({
  changeSet, userPresets, sequencer, changeSaved, setListRef, setLiveItemId, userPresetsRef,
  sequencerRef, setShowSongs, currentSong, rideKeys, settingsRef,
}: SetActionsDeps) {
  // ── The set's own edits ─────────────────────────────────────────
  const [addingToSet, setAddingToSet] = useState(false);
  const addToSet = useCallback((kind: SetItemKind, ref: string) => {
    changeSet(prev => ({ ...prev, items: [...prev.items, { id: setItemId(), kind, ref }] }));
  }, [changeSet]);
  /** A file into the set: a whole set list replaces it; a saved look or a sequence is one more item. */
  const importToSet = useCallback(async (file: File): Promise<{ summary: string; warnings: string[] }> => {
    const known = (k: string) => k in DEFAULT_SETTINGS;
    const read = readSetListFile(await file.text(), known);
    for (const p of read.presets) userPresets.upsert(p);
    for (const q of read.sequences) sequencer.upsertSequence(q);
    const whole = read.list.items.length > 1 || /setlist/i.test(file.name);
    if (whole) changeSet(read.list);
    else changeSet(prev => ({ ...prev, items: [...prev.items, ...read.list.items] }));
    const n = read.list.items.length;
    return {
      summary: whole ? `The set is now “${read.list.name}”: ${n} item${n === 1 ? '' : 's'}.` : `Added ${read.list.items[0].name ?? read.list.items[0].ref}.`,
      warnings: read.warnings,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSet]);
  const onSetAction = useCallback((a: SetAction, name?: string) => {
    if (a === 'import') setAddingToSet(true);
    else if (a === 'save') changeSaved(prev => withSavedSet(prev, setListRef.current));
    else if (a === 'open' && name) {
      const kept = loadSavedSets().find(x => x.name === name);
      if (kept) { changeSet({ name: kept.name, items: kept.items.map(i => ({ ...i })) }); setLiveItemId(null); }
    } else if (a === 'delete' && name) changeSaved(prev => prev.filter(x => x.name !== name));
    else if (a === 'rename' && name?.trim()) changeSet(prev => ({ ...prev, name: name.trim() }));
    else if (a === 'new') { changeSet({ name: 'New set', items: [], emptied: true }); setLiveItemId(null); }
    else if (a === 'export') {
      const list = setListRef.current;
      downloadText(`${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'set'}${SETLIST_FILE_EXT}`,
        writeSetListFile(list, userPresetsRef.current, sequencerRef.current?.sequences ?? []));
    }     else if (a === 'export-show') {
      const list = setListRef.current;
      exportShowKit(list, userPresetsRef.current, sequencer.sequences).then((text: string) => {
        downloadText(`${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'show'}.chromaglass-show.json`, text);
      });
    } else if (a === 'import-show') {
      const el = document.createElement('input');
      el.type = 'file';
      el.accept = '.json';
      el.onchange = async () => {
        const file = el.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          await importShowKit(text, (res: any) => {
            if (res.list) {
              changeSet(res.list);
              setLiveItemId(null);
            }
            if (res.presets && res.presets.length) { for (const p of res.presets) userPresets.upsert(p); }
            if (res.sequences && res.sequences.length) { for (const q of res.sequences) sequencer.upsertSequence(q); }
          });
          alert('Show kit imported! Reloading the page to apply MIDI map, liquids, and wall configurations.');
          window.location.reload();
        } catch (err) {
          alert('Failed to import show kit: ' + (err instanceof Error ? err.message : String(err)));
        }
      };
      el.click();
    }
    else if (a === 'clear') { changeSet(starterSet(PRESETS.map(p => p.id))); setLiveItemId(null); }
    else if (a === 'song-shows') setShowSongs(true);
  }, [changeSet, changeSaved]);
  const onItemAction = useCallback((id: string, a: SetItemAction) => {
    changeSet(prev => {
      if (a === 'up' || a === 'down') return moveItem(prev, id, a === 'up' ? -1 : 1);
      if (a === 'remove') return { ...prev, items: prev.items.filter(i => i.id !== id) };
      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.id !== id) return i;
          if (a === 'link-song') return currentSong ? { ...i, song: currentSong } : i;
          if (a === 'unlink-song') { const { song: _s, ...rest } = i; void _s; return rest; }
          // The strip as it stands: which controls, and where each one is now.
          const controls: Partial<Record<keyof VisualizerSettings, number>> = {};
          for (const k of rideKeys) {
            const v = settingsRef.current[k];
            if (typeof v === 'number' && k !== 'dimmer') controls[k] = v;
          }
          return { ...i, controls, rides: [...rideKeys] };
        }),
      };
    });
  }, [changeSet, currentSong, rideKeys]);

  const bindSequenceToSong = (seq: ShowSequence, song: SongRef | null) => {
    sequencer.upsertSequence({ ...seq, song: song ?? undefined });
  };

  const importSequenceFile = async (file: File) => {
    const parsed = parseSequenceFile(await file.text());
    for (const p of parsed.presets ?? []) userPresets.upsert(p);
    sequencer.upsertSequence(parsed.sequence);
    sequencer.setSelectedId(parsed.sequence.id);
  };

  return {
    addingToSet, setAddingToSet, addToSet, importToSet, onSetAction, onItemAction,
    bindSequenceToSong, importSequenceFile,
  };
}
