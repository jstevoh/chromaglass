// Web Worker: offline analysis of a recorded listen into a SongMap and the
// harmony the song follower matches by (songFollow.ts, PLAN.md 28g).
// Input:  { pcm: Float32Array, sampleRate: number }  (mono)
// Output: { sections, pitchCurve, energyCurve, frameRate, durationSec, chroma }
//
// It also made the local matcher's recognition fingerprint until automatic
// song identification was retired (2026-11-27): that step is kept with the
// matcher in archive/song-id/ (see its README for how it went back in).
//
// The analysis itself is in songMapAnalysis.ts.

import { analyze, segment } from './songMapAnalysis.ts';
import { mapChroma, storedChroma } from './songFollow.ts';

self.onmessage = (e: MessageEvent) => {
  const { pcm, sampleRate } = e.data as { pcm: Float32Array; sampleRate: number };
  try {
    const feat = analyze(pcm, sampleRate);
    const sections = segment(feat);
    (self as any).postMessage({
      ok: true,
      sections,
      pitchCurve: Array.from(feat.pitch),
      energyCurve: Array.from(feat.energy),
      frameRate: feat.frameRate,
      durationSec: feat.durationSec,
      chroma: storedChroma(mapChroma(pcm, sampleRate)),
    });
  } catch (err) {
    (self as any).postMessage({ ok: false, error: String(err) });
  }
};
