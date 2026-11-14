/**
 * Off-main-thread runner for `analyseSongAhead` (PLAN.md §17).
 *
 * One song at a time, transferring the mono PCM buffer rather than copying it:
 * ten minutes of mono audio at 48 kHz is ~115 MB, and running multiple songs
 * at once or copying the buffer across the worker boundary would multiply the
 * tab's peak memory. 17g calls `analyseSongAheadWorker(pcm, sampleRate)`.
 */

import { analyseSongAhead, type SongAhead } from './hearAhead.ts';

interface WorkerRequest {
  pcm: Float32Array;
  sampleRate: number;
}

type WorkerResponse =
  | { ok: true; analysis: SongAhead }
  | { ok: false; error: string };

if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = (e: MessageEvent<WorkerRequest>) => {
    const { pcm, sampleRate } = e.data;
    try {
      const analysis = analyseSongAhead(pcm, sampleRate);
      (self as unknown as { postMessage: (msg: WorkerResponse) => void }).postMessage({ ok: true, analysis });
    } catch (err) {
      (self as unknown as { postMessage: (msg: WorkerResponse) => void }).postMessage({ ok: false, error: String(err) });
    }
  };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Analyse one song's mono PCM off the main thread, queued one song at a time.
 * Transfers `pcm.buffer` without copying when `pcm` spans its full ArrayBuffer
 * (as `monoMix` produces); falls back to running on the caller if Web Workers
 * are unavailable (e.g. in node harnesses).
 */
export function analyseSongAheadWorker(pcm: Float32Array, sampleRate: number): Promise<SongAhead> {
  const run = async (): Promise<SongAhead> => {
    if (typeof Worker === 'undefined') return analyseSongAhead(pcm, sampleRate);
    return new Promise<SongAhead>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./hearAheadWorker.ts', import.meta.url), { type: 'module' });
      } catch {
        resolve(analyseSongAhead(pcm, sampleRate));
        return;
      }
      const finish = (fn: () => void) => {
        worker.terminate();
        fn();
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const data = e.data;
        if (data.ok) finish(() => resolve(data.analysis));
        else finish(() => reject(new Error(data.error)));
      };
      worker.onerror = (err) => finish(() => reject(new Error(err.message || 'hearAhead worker failed')));
      const send = pcm.byteOffset === 0 && pcm.byteLength === pcm.buffer.byteLength ? pcm : pcm.slice();
      const transfer = send.buffer instanceof ArrayBuffer ? [send.buffer] : [];
      worker.postMessage({ pcm: send, sampleRate } satisfies WorkerRequest, transfer);
    });
  };
  const next = queue.then(run, run);
  queue = next.catch(() => undefined);
  return next;
}
