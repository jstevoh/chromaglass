import { useState, useEffect, useRef, useCallback } from 'react';
import { AutoRange, RoomTracker, type RoomCalibration } from '../lib/audioCalibration';

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
  /** Room calibration state — null when auto-calibration is off. */
  calibration: RoomCalibration | null;
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

/**
 * Trim applied on top of auto-calibrated levels. The sensitivity slider runs
 * 0.1..3.0 and defaults to 0.4, so this maps that default onto unity gain:
 * calibration does the work of finding the room, and the slider stays a trim
 * either side of it rather than a control the listener has to get right.
 */
const calibratedTrim = (sensitivity: number) => 0.5 + sensitivity * 1.25;

export function useAudioAnalyzer(
  stream: MediaStream | null,
  isActive: boolean,
  sensitivity: number = 1.0,
  bassBoost: number = 1.0,
  autoCalibrate: boolean = true,
  calibrateNonce: number = 0,
) {
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  // Live trims are read from refs inside the analysis loop: rebuilding the
  // AudioContext every time a slider moves would glitch the audio and throw
  // away the room calibration mid-song.
  const paramsRef = useRef({ sensitivity, bassBoost, autoCalibrate });
  paramsRef.current = { sensitivity, bassBoost, autoCalibrate };
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
      const floatData = new Float32Array(binCount);

      // ── Room calibration ────────────────────────────────────────
      // The room tracker fits the analyser's dB window to the space; the
      // per-feature ranges then map each band onto its own learned floor and
      // ceiling, so a band that is quiet in this room still drives the visuals
      // across their full travel.
      const room = new RoomTracker();
      const ranges = {
        volume: new AutoRange({ minSpan: 3 }),
        bass:   new AutoRange({ minSpan: 4, ceilFall: 8 }),   // fast, for kicks
        mid:    new AutoRange({ minSpan: 3 }),
        treble: new AutoRange({ minSpan: 2.5 }),
        energy: new AutoRange({ minSpan: 0.02 }),
        timbre: new AutoRange({ minSpan: 4, floorRise: 40, ceilFall: 25 }),
      };
      let lastFrame = performance.now() / 1000;
      let calibration: RoomCalibration | null = null;

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
        const analyser = analyzerRef.current;
        if (!analyser) return;

        const { sensitivity: sens, bassBoost: bBoost, autoCalibrate: autoCal } = paramsRef.current;
        const nowSec = performance.now() / 1000;
        const dt = Math.max(0, Math.min(0.25, nowSec - lastFrame));
        lastFrame = nowSec;

        // ── Fit the analyser's window to the room ─────────────────
        // Do this before reading the byte data so the spectrum this frame is
        // already scaled to the space the app is listening in.
        if (autoCal) {
          analyser.getFloatFrequencyData(floatData);
          let peakDb = -Infinity;
          for (let i = 0; i < binCount; i++) if (floatData[i] > peakDb) peakDb = floatData[i];
          calibration = room.update(peakDb, dt);
          analyser.minDecibels = room.minDb;
          analyser.maxDecibels = room.maxDb;
        } else {
          calibration = null;
          if (analyser.minDecibels !== -100 || analyser.maxDecibels !== -30) {
            analyser.minDecibels = -100;
            analyser.maxDecibels = -30;
          }
        }

        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeDomainData);

        // ── Raw band levels ───────────────────────────────────────
        let sum = 0;
        for (let i = 0; i < binCount; i++) sum += frequencyData[i];
        const rawVolume = (sum / binCount / 255) * 100;

        let bassSum = 0;
        for (let i = 0; i < bassEnd; i++) bassSum += frequencyData[i];
        const rawBass = (bassSum / bassEnd / 255) * 100;

        let midSum = 0;
        const midBins = midEnd - bassEnd;
        for (let i = bassEnd; i < midEnd; i++) midSum += frequencyData[i];
        const rawMid = (midSum / midBins / 255) * 100;

        let trebleSum = 0;
        const trebleBins = binCount - midEnd;
        for (let i = midEnd; i < binCount; i++) trebleSum += frequencyData[i];
        const rawTreble = (trebleSum / trebleBins / 255) * 100;

        // ── Energy (RMS of waveform) ──────────────────────────────
        let energySum = 0;
        for (let i = 0; i < binCount; i++) {
          const n = (timeDomainData[i] - 128) / 128;
          energySum += n * n;
        }
        const rawEnergy = Math.sqrt(energySum / binCount);

        // ── Map each band onto its own learned range ──────────────
        // A band is reported as where it sits between its quietest and its
        // loudest in *this* room, so a distant mic and a mic on the speaker
        // both drive the visuals across their whole travel. The ceiling maps
        // to 85 rather than 100, leaving headroom for a genuine peak.
        let volume: number, bass: number, mid: number, treble: number, energy: number;
        if (autoCal) {
          const trim = calibratedTrim(sens);
          const gate = calibration?.gate ?? 0;
          ranges.volume.update(rawVolume, dt);
          ranges.bass.update(rawBass, dt);
          ranges.mid.update(rawMid, dt);
          ranges.treble.update(rawTreble, dt);
          ranges.energy.update(rawEnergy, dt);
          volume = ranges.volume.normalize(rawVolume) * 85 * trim * gate;
          bass   = ranges.bass.normalize(rawBass) * 85 * trim * bBoost * gate;
          mid    = ranges.mid.normalize(rawMid) * 85 * trim * gate;
          treble = ranges.treble.normalize(rawTreble) * 85 * trim * gate;
          energy = ranges.energy.normalize(rawEnergy) * 0.85 * trim * gate;
        } else {
          volume = rawVolume * sens;
          bass   = rawBass * sens * bBoost;
          mid    = rawMid * sens;
          treble = rawTreble * sens;
          energy = rawEnergy;
        }

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
        const rawTimbre = (spectralCentroid / binCount) * 100;
        let timbre: number;
        if (autoCal) {
          // Brightness lives in a narrow band for any given source; stretching
          // it over its own observed range is what makes timbre mappings read.
          ranges.timbre.update(rawTimbre, dt);
          timbre = ranges.timbre.normalize(rawTimbre) * 85 * calibratedTrim(sens);
        } else {
          timbre = rawTimbre * sens;
        }

        // ── Complexity (zero-crossing rate) ───────────────────────
        let zeroCrossings = 0;
        for (let i = 1; i < binCount; i++) {
          const prev = timeDomainData[i - 1] - 128;
          const curr = timeDomainData[i] - 128;
          if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) zeroCrossings++;
        }
        const complexity = (zeroCrossings / (binCount - 1)) * 100
          * (autoCal ? calibratedTrim(sens) : sens);

        // ── Exponential smoothing (per-feature) ──────────────────
        setAudioData(prev => {
          if (!prev) {
            return {
              frequencyData: new Uint8Array(frequencyData),
              timeDomainData: new Uint8Array(timeDomainData),
              volume, bass, mid, treble, energy, spectralCentroid, timbre, complexity, calibration,
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
            calibration,
          };
        });

        animationFrameRef.current = requestAnimationFrame(update);
      };

      update();
    } catch (error) {
      console.error('Error accessing audio source:', error);
    }
  }, [stream, calibrateNonce]);

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
