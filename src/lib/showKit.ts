import { type SetList, writeSetListFile, readSetListFile } from './setList';
import { type UserPreset } from './userPresets';
import { type ShowSequence } from './sequencer';
import { type MidiMap, loadMidiMap, saveMidiMap } from './midi';
import { type OutputConfig, loadOutput, saveOutput } from './outputConfig';
import { loadCustomLiquids, saveCustomLiquids } from './liquidFile';
import { type LiquidType } from '../types';
import {
  type SongMap, type TrackEvolutionState, type SavedPerformance
} from './musicTypes';
import { type TrackFingerprint } from './localFingerprint';
import {
  getAllSongMaps, putSongMap,
  getAllTrackStates, putTrackState,
  getAllPerformances, putPerformance,
  getAllFingerprints, putFingerprint
} from './musicDb';

export const SHOW_KIT_FORMAT = 'chromaglass-show';
export const SHOW_KIT_VERSION = 1;

export interface ShowKitData {
  format: 'chromaglass-show';
  version: number;
  setList?: unknown;
  midiMap?: MidiMap | null;
  outputConfig?: OutputConfig;
  liquids?: LiquidType[];
  musicDb?: {
    songMaps: SongMap[];
    tracks: TrackEvolutionState[];
    performances: SavedPerformance[];
    fingerprints: TrackFingerprint[];
  };
}

export async function exportShowKit(
  setList: SetList,
  userPresets: UserPreset[],
  sequences: ShowSequence[]
): Promise<string> {
  const setListJson = JSON.parse(writeSetListFile(setList, userPresets, sequences));
  const midiMap = loadMidiMap();
  const outputConfig = loadOutput();
  const liquids = loadCustomLiquids();
  
  const songMaps = await getAllSongMaps();
  const tracks = await getAllTrackStates();
  const performances = await getAllPerformances();
  const fingerprints = await getAllFingerprints();

  const data: ShowKitData = {
    format: SHOW_KIT_FORMAT,
    version: SHOW_KIT_VERSION,
    setList: setListJson,
    midiMap,
    outputConfig,
    liquids,
    musicDb: { songMaps, tracks, performances, fingerprints }
  };

  return JSON.stringify(data, null, 2);
}

export async function importShowKit(
  text: string,
  onImportSetList: (result: ReturnType<typeof readSetListFile>) => void
): Promise<void> {
  const parsed = JSON.parse(text) as ShowKitData;
  if (parsed.format !== SHOW_KIT_FORMAT) throw new Error('Not a ChromaGlass show kit');

  if (parsed.setList) {
    const result = readSetListFile(JSON.stringify(parsed.setList), () => true);
    onImportSetList(result);
  }
  if (parsed.midiMap) {
    saveMidiMap(parsed.midiMap);
  }
  if (parsed.outputConfig) {
    saveOutput(parsed.outputConfig);
  }
  if (parsed.liquids && Array.isArray(parsed.liquids)) {
    saveCustomLiquids(parsed.liquids);
  }
  if (parsed.musicDb) {
    if (Array.isArray(parsed.musicDb.songMaps)) {
      for (const sm of parsed.musicDb.songMaps) await putSongMap(sm);
    }
    if (Array.isArray(parsed.musicDb.tracks)) {
      for (const t of parsed.musicDb.tracks) await putTrackState(t);
    }
    if (Array.isArray(parsed.musicDb.performances)) {
      for (const p of parsed.musicDb.performances) await putPerformance(p);
    }
    if (Array.isArray(parsed.musicDb.fingerprints)) {
      for (const fp of parsed.musicDb.fingerprints) await putFingerprint(fp);
    }
  }
}
