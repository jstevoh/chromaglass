// Song map generation: record the first listen of a track, then analyze it
// offline (in a Web Worker) into section boundaries, a pitch curve and an
// energy curve. Results are cached in IndexedDB keyed by ISRC, so every later
// listen gets instant structure-aware visuals.

import { SongMap, SongSection } from './musicTypes';
import { putFingerprint } from './musicDb';
import { TrackFingerprint } from './localFingerprint';

const ANALYSIS_SAMPLE_RATE = 22050;

/** Five-second chunks: ten minutes of first listen, the longest a song map is made from. */
const MAX_LISTEN_CHUNKS = 120;

/** Records mono audio from a MediaStream until stop() is called. */
export class ListenRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = '';

  start(stream: MediaStream): boolean {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return false;
      const audioOnly = new MediaStream(audioTracks);
      this.mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(m => MediaRecorder.isTypeSupported(m)) || '';
      this.recorder = new MediaRecorder(audioOnly, this.mime ? { mimeType: this.mime, audioBitsPerSecond: 64000 } : undefined);
      this.chunks = [];
      // The first ten minutes and no more. The recorder only stops on a
      // silence or a confirmed track change, and in a continuous mix that
      // re-identification keeps missing, neither comes: it ran for hours,
      // and the decode at the end — the whole recording, at full rate, in
      // float, before any trim — took the tab down. The leading chunks of a
      // WebM are still a valid WebM, so the tail is simply not kept.
      this.recorder.ondataavailable = e => { if (e.data.size > 0 && this.chunks.length < MAX_LISTEN_CHUNKS) this.chunks.push(e.data); };
      this.recorder.start(5000); // chunk every 5s
      return true;
    } catch (e) {
      console.warn('ListenRecorder.start failed', e);
      return false;
    }
  }

  get isRecording() { return this.recorder?.state === 'recording'; }

  /** Stop and return the recorded blob (or null if nothing useful). */
  async stop(): Promise<Blob | null> {
    const rec = this.recorder;
    this.recorder = null;
    if (!rec || rec.state === 'inactive') return null;
    const stopped = new Promise<void>(resolve => { rec.onstop = () => resolve(); });
    try { rec.stop(); } catch { return null; }
    await stopped;
    if (this.chunks.length === 0) return null;
    const blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
    this.chunks = [];
    return blob.size > 50_000 ? blob : null; // ignore tiny fragments
  }

  discard() {
    try { this.recorder?.stop(); } catch { /* already stopped */ }
    this.recorder = null;
    this.chunks = [];
  }
}

interface DecodedAudio { pcm: Float32Array; sampleRate: number }

/**
 * Decode a recorded blob to mono PCM at the analysis sample rate, keeping at
 * most maxDurationSec of it.
 *
 * decodeAudioData has no way to decode part of a file: it hands back the
 * whole recording, at the file's own rate (48 kHz, usually) and in as many
 * channels as it has, as float — ten minutes of stereo is ~230 MB before
 * anything here gets a say, and that part is unavoidable. What this does
 * control is everything after it. The trim used to happen once the audio
 * had been resampled, so the OfflineAudioContext rendered the whole recording
 * first; now it renders only the frames that will be kept. The full-rate
 * buffer never leaves this function, so it is garbage the moment the render
 * is done — only the 22 kHz mono copy goes on to the analysis.
 */
async function decodeToMono(blob: Blob, maxDurationSec?: number): Promise<DecodedAudio | null> {
  try {
    const arrayBuf = await blob.arrayBuffer();
    const probeCtx = new AudioContext();
    const decoded = await probeCtx.decodeAudioData(arrayBuf);
    await probeCtx.close();

    // Resample + downmix via OfflineAudioContext, rendering only what is kept
    const keepSec = maxDurationSec && maxDurationSec > 20 ? Math.min(decoded.duration, maxDurationSec) : decoded.duration;
    const targetLen = Math.max(1, keepSec < decoded.duration
      ? Math.floor(keepSec * ANALYSIS_SAMPLE_RATE)
      : Math.ceil(decoded.duration * ANALYSIS_SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, targetLen, ANALYSIS_SAMPLE_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0, 0, keepSec);
    const rendered = await offline.startRendering();
    return { pcm: rendered.getChannelData(0), sampleRate: ANALYSIS_SAMPLE_RATE };
  } catch (e) {
    console.warn('decodeToMono failed', e);
    return null;
  }
}

interface WorkerResult {
  ok: boolean;
  error?: string;
  sections: SongSection[];
  pitchCurve: number[];
  energyCurve: number[];
  frameRate: number;
  durationSec: number;
  fpHashes?: Uint32Array;
  fpFrames?: Uint32Array;
  fpDurationSec?: number;
}

export interface GeneratedSongMap {
  map: SongMap;
  /** The recognition fingerprint just stored with it, if the listen made one — for the live index. */
  fingerprint: TrackFingerprint | null;
}

/** Run the offline analysis worker over a recorded listen. */
export async function generateSongMap(
  isrc: string,
  recording: Blob,
  meta?: { title?: string; artist?: string },
  maxDurationSec?: number,
): Promise<GeneratedSongMap | null> {
  // maxDurationSec trims audio recorded past the track boundary (the recorder
  // keeps rolling until the next identification confirms a track change); it
  // is applied inside the decode, before the resample, not after it.
  let decoded = await decodeToMono(recording, maxDurationSec);
  if (!decoded || decoded.pcm.length < ANALYSIS_SAMPLE_RATE * 20) return null; // need ≥20s

  const result = await new Promise<WorkerResult | null>(resolve => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./songMapWorker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      console.warn('song map worker unavailable', e);
      resolve(null);
      return;
    }
    const timeout = setTimeout(() => { worker.terminate(); resolve(null); }, 120_000);
    worker.onmessage = e => { clearTimeout(timeout); worker.terminate(); resolve(e.data as WorkerResult); };
    worker.onerror = err => { clearTimeout(timeout); worker.terminate(); console.warn('song map worker error', err.message); resolve(null); };
    // Copy the PCM buffer — transferring would detach the rendered AudioBuffer's data
    worker.postMessage({ pcm: decoded!.pcm.slice(), sampleRate: decoded!.sampleRate });
    // The worker has its copy; ours need not live through the analysis.
    decoded = null;
  });

  if (!result || !result.ok) {
    if (result?.error) console.warn('song map analysis failed:', result.error);
    return null;
  }

  // Store the local recognition fingerprint alongside the song map, so this
  // track is identified instantly (and offline) on every future listen.
  let fingerprint: TrackFingerprint | null = null;
  if (result.fpHashes && result.fpFrames && result.fpHashes.length > 100) {
    fingerprint = {
      isrc,
      title: meta?.title,
      artist: meta?.artist,
      hashes: result.fpHashes,
      frames: result.fpFrames,
      durationSec: result.fpDurationSec ?? result.durationSec,
      createdAt: Date.now(),
    };
    await putFingerprint(fingerprint);
  }

  const map: SongMap = {
    isrc,
    title: meta?.title,
    artist: meta?.artist,
    durationSec: result.durationSec,
    sections: result.sections,
    pitchCurve: result.pitchCurve,
    energyCurve: result.energyCurve,
    frameRate: result.frameRate,
    generatedAt: Date.now(),
  };
  return { map, fingerprint };
}

/** Find the section containing a given playback position. */
export function sectionAt(map: SongMap | null, positionSec: number): SongSection | null {
  if (!map) return null;
  for (const s of map.sections) {
    if (positionSec >= s.start && positionSec < s.end) return s;
  }
  return null;
}

/** Sample the energy curve at a playback position (0-1). */
export function energyAt(map: SongMap | null, positionSec: number): number {
  if (!map || map.energyCurve.length === 0) return 0;
  const idx = Math.max(0, Math.min(map.energyCurve.length - 1, Math.floor(positionSec * map.frameRate)));
  return map.energyCurve[idx];
}

/** Sample the pitch curve (MIDI, 0 = unvoiced) at a playback position. */
export function pitchAt(map: SongMap | null, positionSec: number): number {
  if (!map || map.pitchCurve.length === 0) return 0;
  const idx = Math.max(0, Math.min(map.pitchCurve.length - 1, Math.floor(positionSec * map.frameRate)));
  return map.pitchCurve[idx];
}
