// IndexedDB persistence for song maps and per-track evolution state.
// Everything is keyed by ISRC (or pseudo-ISRC for manually tagged tracks),
// so repeat listens need no server round-trip.

import { SongMap, TrackEvolutionState } from './musicTypes';

const DB_NAME = 'chromaglass-music';
const DB_VERSION = 1;
const SONG_MAPS = 'songMaps';
const TRACKS = 'tracks';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SONG_MAPS)) db.createObjectStore(SONG_MAPS, { keyPath: 'isrc' });
      if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS, { keyPath: 'isrc' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function txRequest<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

export async function getSongMap(isrc: string): Promise<SongMap | undefined> {
  try { return await txRequest<SongMap | undefined>(SONG_MAPS, 'readonly', s => s.get(isrc)); }
  catch (e) { console.warn('musicDb.getSongMap failed', e); return undefined; }
}

export async function putSongMap(map: SongMap): Promise<void> {
  try { await txRequest(SONG_MAPS, 'readwrite', s => s.put(map)); }
  catch (e) { console.warn('musicDb.putSongMap failed', e); }
}

export async function getTrackState(isrc: string): Promise<TrackEvolutionState | undefined> {
  try { return await txRequest<TrackEvolutionState | undefined>(TRACKS, 'readonly', s => s.get(isrc)); }
  catch (e) { console.warn('musicDb.getTrackState failed', e); return undefined; }
}

export async function putTrackState(state: TrackEvolutionState): Promise<void> {
  try { await txRequest(TRACKS, 'readwrite', s => s.put(state)); }
  catch (e) { console.warn('musicDb.putTrackState failed', e); }
}

export async function getAllTrackStates(): Promise<TrackEvolutionState[]> {
  try { return await txRequest<TrackEvolutionState[]>(TRACKS, 'readonly', s => s.getAll()); }
  catch (e) { console.warn('musicDb.getAllTrackStates failed', e); return []; }
}
