// Loading the local fingerprint index: off the main thread where it can be.
//
// The first build is the one that scales with the whole library — every
// stored hash read out of IndexedDB and sorted — and it lands while the show
// is starting up. In a worker it costs the page nothing but the structured
// clone of a few flat arrays, which are transferred, not copied. Anywhere a
// module worker will not start (or dies), the same build runs here instead:
// slower to arrive at, never absent.

import { buildIndex, FingerprintIndex } from './localFingerprint';
import { getAllFingerprints } from './musicDb';

async function buildHere(): Promise<FingerprintIndex> {
  return buildIndex(await getAllFingerprints());
}

export function loadFingerprintIndex(): Promise<FingerprintIndex> {
  return new Promise(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./fingerprintIndexWorker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      console.warn('fingerprint index worker unavailable, building on the main thread', e);
      resolve(buildHere());
      return;
    }
    const fallBack = (why: unknown) => {
      worker.terminate();
      console.warn('fingerprint index worker failed, building on the main thread', why);
      resolve(buildHere());
    };
    worker.onmessage = e => {
      const data = e.data as FingerprintIndex | { error: string };
      if ('error' in data) { fallBack(data.error); return; }
      worker.terminate();
      resolve(data);
    };
    worker.onerror = err => fallBack(err.message);
    worker.postMessage(null);
  });
}
