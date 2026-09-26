import { useState, useEffect, useRef, useCallback } from 'react';
import type { RoomCalibration } from '../lib/audioCalibration';
import { SoundLevels, smoothLevels } from '../lib/soundLevels';
import {
  AudioFeatures, ANALYSER_FFT_SIZE, ANALYSER_SMOOTHING, type AudioReading,
} from '../lib/audioFeatures';

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
  /**
   * The named sources, bands and their onsets for this frame
   * (`src/lib/audioFeatures.ts`). Raw, not trimmed by sensitivity or smoothed
   * like the fields above: each is already 0..1 against its own range, and a
   * binding that wants smoothing or a trim applies its own. An onset's `hit`
   * is true for the one analyser frame it landed on, and React may coalesce
   * that frame with the next; a consumer that must not miss a hit watches
   * `at` change instead. Optional because other producers of AudioData (the
   * cast display rebuilds one from the wire) have no spectrum to read it from.
   */
  features?: AudioReading | null;
}

/*
  The arithmetic that turns an analyser frame into these numbers lives in
  lib/soundLevels.ts, where a song render runs the same code on the song's own
  samples (PLAN.md §6). This hook owns the AnalyserNode, the frame loop and the
  React state, and nothing else: what it computes is what it computed before
  the move, step for step, and `npm run render` holds the offline side to it.
*/

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
      // Let the AnalyserNode do its own time-constant smoothing (0.6 is gentle).
      // Both values now live in audioFeatures.ts (the same 1024 and 0.6), because
      // the offline song analysis emulates this node and has to use exactly
      // these: a render heard through a different window would react to a
      // different song from the one the show hears.
      analyzer.fftSize = ANALYSER_FFT_SIZE;
      analyzer.smoothingTimeConstant = ANALYSER_SMOOTHING;
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
      // across their full travel. Both are inside `SoundLevels`, one per audio
      // context, so a restart (a new stream, the recalibrate button) starts
      // them fresh.
      const levels = new SoundLevels(audioContext.sampleRate, binCount);
      let lastFrame = performance.now() / 1000;
      // One analyser of named sources per audio context: it learns this
      // stream's ranges and thresholds, so a restart (a new stream, the
      // recalibrate button) starts it fresh along with the room tracker.
      const features = new AudioFeatures();

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
        // The float spectrum is read every frame now, not only when calibrating:
        // the named sources are read from it rather than from the byte data
        // below, because the byte data is scaled into the room tracker's
        // window, which moves as the room is learned, and a band's level (and
        // so its flux) would move with it. Decibels are the same whatever the
        // window. Reading both in one frame smooths once: the node applies its
        // time constant once per render quantum however many reads there are.
        analyser.getFloatFrequencyData(floatData);
        const reading = features.update(
          { bins: floatData, scale: 'db', sampleRate: audioContext.sampleRate, fftSize: analyser.fftSize },
          nowSec,
        );
        const win = levels.calibrate(floatData, dt, autoCal);
        if (autoCal) {
          analyser.minDecibels = win.minDb;
          analyser.maxDecibels = win.maxDb;
        } else if (analyser.minDecibels !== -100 || analyser.maxDecibels !== -30) {
          analyser.minDecibels = -100;
          analyser.maxDecibels = -30;
        }

        analyser.getByteFrequencyData(frequencyData);
        analyser.getByteTimeDomainData(timeDomainData);
        const raw = levels.levels(frequencyData, timeDomainData, dt, { sensitivity: sens, bassBoost: bBoost, autoCalibrate: autoCal });
        const calibration: RoomCalibration | null = raw.calibration;

        // ── Exponential smoothing (per-feature) ──────────────────
        setAudioData(prev => ({
          frequencyData: new Uint8Array(frequencyData),
          timeDomainData: new Uint8Array(timeDomainData),
          ...smoothLevels(prev, raw),
          calibration,
          features: reading,
        }));

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
