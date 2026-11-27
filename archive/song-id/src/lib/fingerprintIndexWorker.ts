// Web Worker: the first build of the local fingerprint index.
// Input:  any message (it takes nothing; it reads the library itself)
// Output: a FingerprintIndex, its typed arrays transferred, or { error }
//
// It reads IndexedDB itself rather than being posted the records: getAll()
// deserializes every stored hash wherever it is called, so doing it on the
// main thread and cloning the result across would keep half the stall this
// worker exists to move.

import { buildIndex } from './localFingerprint';
import { getAllFingerprints } from './musicDb';

self.onmessage = async () => {
  try {
    const index = buildIndex(await getAllFingerprints());
    const transfer = index.segments.flatMap(s => [s.keys.buffer, s.starts.buffer, s.track.buffer, s.frame.buffer]);
    (self as any).postMessage(index, transfer);
  } catch (err) {
    (self as any).postMessage({ error: String(err) });
  }
};
