// Song identification via an audio-fingerprinting API (AudD or ACRCloud),
// reached through a small serverless proxy that holds the API key
// (see server/fingerprint-worker.js). Without VITE_FINGERPRINT_PROXY_URL
// configured this module degrades gracefully: identify() resolves to null
// and the app falls back to manual tagging in the Track panel.

import { TrackIdentity } from './musicTypes';
import { pseudoIsrc } from './evolution';

const PROXY_URL: string | undefined = (import.meta as any).env?.VITE_FINGERPRINT_PROXY_URL;

export function fingerprintingAvailable(): boolean {
  return typeof PROXY_URL === 'string' && PROXY_URL.length > 0;
}

/**
 * Record a short mono snippet from the stream and encode as WAV (16-bit PCM).
 * WAV keeps the proxy simple — both AudD and ACRCloud accept it directly.
 */
export async function captureSnippet(stream: MediaStream, seconds = 5): Promise<Blob | null> {
  try {
    // Use the device's native sample rate — forcing one can throw on
    // mismatched-rate streams in some browsers.
    const ctx = new AudioContext();
    // Contexts created outside a user gesture may start suspended.
    if (ctx.state === 'suspended') await ctx.resume();
    const nativeRate = ctx.sampleRate;
    const source = ctx.createMediaStreamSource(stream);
    const processorSize = 4096;
    const processor = ctx.createScriptProcessor(processorSize, 1, 1);
    const chunks: Float32Array[] = [];
    let collected = 0;
    const target = Math.ceil(seconds * nativeRate);

    const done = new Promise<void>(resolve => {
      processor.onaudioprocess = e => {
        if (collected >= target) return;
        const data = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(data));
        collected += data.length;
        if (collected >= target) resolve();
      };
    });

    source.connect(processor);
    processor.connect(ctx.destination); // required for ScriptProcessor to fire in some browsers

    await Promise.race([done, new Promise<void>(r => setTimeout(r, (seconds + 4) * 1000))]);
    processor.disconnect();
    source.disconnect();
    await ctx.close();

    if (collected < nativeRate * 2) return null; // too little audio to be useful

    // Downsample to 16 kHz mono to keep the upload small (~250 KB for 8 s)
    const merged = new Float32Array(collected);
    let off = 0;
    for (const c of chunks) { merged.set(c, off); off += c.length; }
    const ratio = nativeRate / 16000;
    const outLen = Math.floor(merged.length / ratio);
    const down = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) down[i] = merged[Math.floor(i * ratio)];

    return encodeWav(down, 16000);
  } catch (e) {
    console.warn('captureSnippet failed', e);
    return null;
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);          // PCM
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Send a snippet to the proxy and return the identified track, or null.
 * The proxy normalizes AudD/ACRCloud responses to:
 *   { isrc?, title, artist, album?, durationSec?, offsetSec? }
 */
export async function identify(stream: MediaStream): Promise<TrackIdentity | null> {
  if (!fingerprintingAvailable()) return null;
  const snippet = await captureSnippet(stream);
  if (!snippet) return null;

  try {
    const form = new FormData();
    form.append('file', snippet, 'snippet.wav');
    const res = await fetch(PROXY_URL!, { method: 'POST', body: form });
    if (!res.ok) { console.warn('fingerprint proxy HTTP', res.status); return null; }
    const data = await res.json();
    if (!data || !data.title || !data.artist) return null;
    return {
      isrc: data.isrc || pseudoIsrc(data.artist, data.title),
      title: data.title,
      artist: data.artist,
      album: data.album || undefined,
      durationSec: typeof data.durationSec === 'number' ? data.durationSec : undefined,
      offsetSec: typeof data.offsetSec === 'number' ? data.offsetSec : undefined,
      identifiedAtMs: performance.now(),
      source: 'fingerprint',
    };
  } catch (e) {
    console.warn('identify failed', e);
    return null;
  }
}

/** Build a TrackIdentity from a manual user tag (no fingerprint API needed). */
export function manualIdentity(artist: string, title: string): TrackIdentity {
  return {
    isrc: pseudoIsrc(artist, title),
    title: title.trim(),
    artist: artist.trim(),
    identifiedAtMs: performance.now(),
    offsetSec: 0,
    source: 'manual',
  };
}
