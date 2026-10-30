import { useState, useRef, useCallback, useMemo, useEffect, type Dispatch, type SetStateAction } from 'react';
import { type SongShow, loadShows, saveShows, type ActionSet, loadSets, BUILT_IN_SETS, saveSets, SHOWS_KEY, SETS_KEY } from '../lib/songShows';
import { useCloudSyncReload, startCloudSync } from '../lib/cloudSyncApp';
import { CUSTOM_LIQUIDS_KEY, loadCustomLiquids } from '../lib/liquidFile';
import { DEFAULT_LIQUID_TYPES, type LiquidType } from '../types';
import { TOOL_AMOUNTS_KEY, loadToolAmounts } from '../lib/toolAmount';
import { SETLIST_KEY, loadSetList, starterSet, SAVED_SETS_KEY, loadSavedSets, type SetList } from '../lib/setList';
import { PRESETS } from '../presets';
import type { MusicSettings } from '../lib/musicTypes';
import { MUSIC_SETTINGS_KEY, loadMusicSettings } from './shared';

/**
 * What is kept between shows and synced between machines: each song's show
 * (`lib/songShows.ts`), the action sets and whether songs are followed, and the
 * stores a cloud sync reloads (`lib/cloudSync.ts`): bottles, tool amounts, music
 * settings, the set lists. The runtime that plays a song's show is
 * `useSongScore`, once the moves it makes exist.
 */
interface ShowLibraryDeps {
  setLiquidTypes: Dispatch<SetStateAction<LiquidType[]>>;
  setToolAmounts: Dispatch<SetStateAction<Record<string, number>>>;
  setMusicSettings: Dispatch<SetStateAction<MusicSettings>>;
  setSetList: Dispatch<SetStateAction<SetList>>;
  setSavedSets: Dispatch<SetStateAction<SetList[]>>;
}

export function useShowLibrary({
  setLiquidTypes, setToolAmounts, setMusicSettings, setSetList, setSavedSets,
}: ShowLibraryDeps) {
  // ── Songs: a look for each song, and what happens while it plays ──
  // See lib/songShows.ts. Kept in the browser and in files; the runtime is
  // wired up later in App (`useSongScore`), once the actions it performs exist.
  const [songShows, setSongShowsState] = useState<SongShow[]>(loadShows);
  const songShowsRef = useRef(songShows);
  songShowsRef.current = songShows;
  const setSongShows = useCallback((next: SongShow[]) => { setSongShowsState(next); saveShows(next); }, []);
  const [userActionSets, setUserActionSets] = useState<ActionSet[]>(loadSets);
  const actionSets = useMemo(() => [...BUILT_IN_SETS, ...userActionSets], [userActionSets]);
  const saveActionSet = useCallback((set: ActionSet) => setUserActionSets(prev => {
    const next = [...prev.filter(x => x.id !== set.id), { ...set, builtIn: undefined }];
    saveSets(next);
    return next;
  }), []);
  const deleteActionSet = useCallback((id: string) => setUserActionSets(prev => {
    const next = prev.filter(x => x.id !== id);
    saveSets(next);
    return next;
  }), []);
  const [followSongs, setFollowSongsState] = useState<boolean>(() => {
    try { return localStorage.getItem('chromaglass-follow-songs') !== '0'; } catch { return true; }
  });
  const setFollowSongs = useCallback((on: boolean) => {
    setFollowSongsState(on);
    try { localStorage.setItem('chromaglass-follow-songs', on ? '1' : '0'); } catch { /* private */ }
  }, []);
  /*
    Cloud sync (PLAN 23.18, lib/cloudSync.ts): a Pro account's saved work kept in
    step across its browsers and Mac apps. What the cloud writes into a store held
    here in state is read again at once: a stale list saved over it would read as
    the player deleting what had just arrived, on every device. The saved looks,
    sequences and MIDI map reload in their own hooks.
  */
  useCloudSyncReload({
    [CUSTOM_LIQUIDS_KEY]: () => setLiquidTypes([...DEFAULT_LIQUID_TYPES, ...loadCustomLiquids()]),
    [TOOL_AMOUNTS_KEY]: () => setToolAmounts(loadToolAmounts()),
    [MUSIC_SETTINGS_KEY]: () => setMusicSettings(loadMusicSettings()),
    [SETLIST_KEY]: () => setSetList(loadSetList(() => starterSet(PRESETS.map(p => p.id)))),
    [SAVED_SETS_KEY]: () => setSavedSets(loadSavedSets()),
    [SHOWS_KEY]: () => setSongShowsState(loadShows()),
    [SETS_KEY]: () => setUserActionSets(loadSets()),
    'chromaglass-follow-songs': () => {
      try { setFollowSongsState(localStorage.getItem('chromaglass-follow-songs') !== '0'); } catch { /* private */ }
    },
  });
  useEffect(() => startCloudSync(), []);

  return {
    songShows, songShowsRef, setSongShows, actionSets, saveActionSet, deleteActionSet, followSongs,
    setFollowSongs,
  };
}
