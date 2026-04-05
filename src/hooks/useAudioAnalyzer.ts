import { useState, useEffect, useRef, useCallback } from 'react';

export interface AudioData {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  energy: number;
  spectralCentroid: number;
  timbre: number;
  complexity: number;
}

// Per-feature smoothing factors.
// Lower = smoother / more latent.  Higher = snappier / more jittery.
// Bass needs to be snappy for kick detection; treble can be smoother.
const SMOOTHING = {
  volume:     0.25,
  bass:       0.35,   // fast — kicks need instant response
  mid:        0.20,
  treble:     0.15,
  energy:     0.30,
  centroid:   0.12,
  timbre:     0.12,
  complexity: 0.10,
} as const;

export function useAudioAnalyzer(
  stream: MediaStream | null,
  isActive: boolean,
  sensitivity: number = 1.0,
  bassBoost: number = 1.0,
) {
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
    analyzerRef.current = null;
    sourceRef.current = null;
    setAudioData(null);
  }, []);

  const startAudio = useCallback(async () => {
    if (!stream) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const analyzer = audioContext.createAnalyser();
      // 1024-point FFT → 512 frequency bins.
      // At 48 kHz that's ~47 Hz per bin — much better bass resolution than the
      // old 256 FFT (which gave ~188 Hz/bin and only 128 bins total).
      analyzer.fftSize = 1024;
      // Let the AnalyserNode do its own time-constant smoothing (0.6 is gentle).
      analyzer.smoothingTimeConstant = 0.6;
      analyzerRef.current = analyzer;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyzer);
      sourceRef.current = source;

      const binCount = analyzer.frequencyBinCount; // 512
      const frequencyData = new Uint8Array(binCount);
      const timeDomainData = new Uint8Array(binCount);

      // Pre-compute frequency-bin boundaries based on actual Hz thresholds.
      // sampleRate is typically 44100 or 48000.
      const nyquist = audioContext.sampleRate / 2;
      const hzPerBin = nyquist / binCount;

      // Perceptually meaningful ranges:
      //   Sub-bass + bass : 20–250 Hz
      //   Mid             : 250–4 000 Hz
      //   Treble          : 4 000–nyquist
      const bassEnd   = Math.min(binCount, Math.ceil(250  / hzPerBin));
      const midEnd    = Math.min(binCount, Math.ceil(4000 / hzPerBin));
      // treble goes from midEnd to binCount

      const update = () => {
        if (!analyzerRef.current) return;
        analyzerRef.current.getByteFrequencyData(frequencyData);
        analyzerRef.current.getByteTimeDomainData(timeDomainData);

        // ── Volume (overall loudness) ─────────────────────────────
        let sum = 0;
        for (let i = 0; i < binCount; i++) sum += frequencyData[i];
        const volume = (sum / binCount / 255) * sensitivity * 100;

        // ── Bass ──────────────────────────────────────────────────
        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) bassSum += frequencyData[i];
        const bass = (bassSum / bassEnd / 255) * sensitivity * bassBoost * 100;

        // ── Mid ───────────────────────────────────────────────────
        let midSum = 0;
        const midBins = midEnd - bassEnd;
        for (let i = bassEnd; i < midEnd; i++) midSum += frequencyData[i];
        const mid = (midSum / midBins / 255) * sensitivity * 100;

        // ── Treble ────────────────────────────────────────────────
        let trebleSum = 0;
        const trebleBins = binCount - midEnd;
        for (let i = midEnd; i < binCount; i++) trebleSum += frequencyData[i];
        const treble = (trebleSum / trebleBins / 255) * sensitivity * 100;

        // ── Energy (RMS of waveform) ──────────────────────────────
        let energySum = 0;
        for (let i = 0; i < binCount; i++) {
          const n = (timeDomainData[i] - 128) / 128;
          energySum += n * n;
        }
        const energy = Math.sqrt(energySum / binCount);

        // ── Spectral centroid (brightness) ────────────────────────
        // Weight by magnitude² for better perceptual accuracy.
        let specNum = 0;
        let specDen = 0;
        for (let i = 0; i < binCount; i++) {
          const mag2 = frequencyData[i] * frequencyData[i];
          specNum += mag2 * i;
          specDen += mag2;
        }
        const spectralCentroid = specDen === 0 ? 0 : specNum / specDen;
        const timbre = (spectralCentroid / binCount) * 100 * sensitivity;

        // ── Complexity (zero-crossing rate) ───────────────────────
        let zeroCrossings = 0;
        for (let i = 1; i < binCount; i++) {
          const prev = timeDomainData[i - 1] - 128;
          const curr = timeDomainData[i] - 128;
          if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) zeroCrossings++;
        }
        const complexity = (zeroCrossings / (binCount - 1)) * 100 * sensitivity;

        // ── Exponential smoothing (per-feature) ──────────────────
        setAudioData(prev => {
          if (!prev) {
            return {
              frequencyData: new Uint8Array(frequencyData),
              timeDomainData: new Uint8Array(timeDomainData),
              volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity,
            };
          }

          return {
            frequencyData: new Uint8Array(frequencyData),
            timeDomainData: new Uint8Array(timeDomainData),
            volume:          prev.volume          + (volume          - prev.volume)          * SMOOTHING.volume,
            bass:            prev.bass            + (bass            - prev.bass)            * SMOOTHING.bass,
            mid:             prev.mid             + (mid             - prev.mid)             * SMOOTHING.mid,
            treble:          prev.treble          + (treble          - prev.treble)          * SMOOTHING.treble,
            energy:          prev.energy          + (energy          - prev.energy)          * SMOOTHING.energy,
            spectralCentroid:prev.spectralCentroid+ (spectralCentroid- prev.spectralCentroid)* SMOOTHING.centroid,
            timbre:          prev.timbre          + (timbre          - prev.timbre)          * SMOOTHING.timbre,
            complexity:      prev.complexity      + (complexity      - prev.complexity)      * SMOOTHING.complexity,
          };
        });

        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
    } catch (error) {
      console.error('Error accessing audio source:', error);
    }
  }, [stream, sensitivity, bassBoost]);

  useEffect(() => {
    if (isActive) {
      startAudio();
    } else {
      stopAudio();
    }
    return () => { stopAudio(); };
  }, [isActive, startAudio, stopAudio]);

  return audioData;
}
