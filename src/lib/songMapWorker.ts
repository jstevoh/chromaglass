// Web Worker: offline analysis of a recorded listen into a SongMap,
// plus a local recognition fingerprint (see localFingerprint.ts) and the
// harmony the song follower matches by (songFollow.ts, PLAN.md 28g).
// Input:  { pcm: Float32Array, sampleRate: number }  (mono)
// Output: { sections, pitchCurve, energyCurve, frameRate, durationSec,
//           chroma, fpHashes, fpFrames, fpDurationSec }
//
// The analysis itself is in songMapAnalysis.ts.

import { extractPeakHashes } from './localFingerprint';
import { analyze, segment } from './songMapAnalysis.ts';
import { mapChroma, storedChroma } from './songFollow.ts';

self.onmessage = (e: MessageEvent) => {
  const { pcm, sampleRate } = e.data as { pcm: Float32Array; sampleRate: number };
  try {
    const feat = analyze(pcm, sampleRate);
    const sections = segment(feat);
    const fp = extractPeakHashes(pcm, sampleRate);
    (self as any).postMessage({
      ok: true,
      sections,
      pitchCurve: Array.from(feat.pitch),
      energyCurve: Array.from(feat.energy),
      frameRate: feat.frameRate,
      durationSec: feat.durationSec,
      chroma: storedChroma(mapChroma(pcm, sampleRate)),
      fpHashes: fp.hashes,
      fpFrames: fp.frames,
      fpDurationSec: fp.durationSec,
    });
  } catch (err) {
    (self as any).postMessage({ ok: false, error: String(err) });
  }
};
