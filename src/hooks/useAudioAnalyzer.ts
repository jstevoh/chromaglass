import { useState, useEffect, useRef, useCallback } from 'react';
import type { RoomCalibration } from '../lib/audioCalibration';
import { SoundLevels, smoothLevels } from '../lib/soundLevels';
import {
  AudioFeatures, ANALYSER_FFT_SIZE, ANALYSER_SMOOTHING, type AudioReading,
} from '../lib/audioFeatures';
import { EarClock, onWallAsk } from '../lib/earClock';

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

  What changed since is *who asks* for a reading (lib/earClock.ts, PLAN.md
  §14a): the window's own frames first, as always, then the projector's frame
  asks and a worker's timer while those frames have stopped, so the show keeps
  hearing while its window is hidden behind the wall.
*/

/**
 * The worker's timer, as source rather than a file: a blob needs no chunk
 * fetched, so it starts on a venue with no internet as well (PLAN.md §14h),
 * and it is four lines.
 */
const TICK_WORKER = 'let t=null;onmessage=e=>{clearInterval(t);t=e.data>0?setInterval(()=>postMessage(0),e.data):null;};';
const TICK_MS = 16;

/*
  How often the ear tells React what it heard (PLAN.md §14f).

  Every reading used to be React state: `setAudioData` sixty times a second
  or more (and more again while the wall's asks and the worker's tick were
  both reading), and each one re-rendered the whole App, with its desks, its
  panels and the plate's component, about seventy times a second with a band
  playing, measured under `?debug` before this change. Nothing that renders
  needs that: the meters, the desk's level, the song-change watch and the
  track picker all read a level a person looks at or a gap of seconds. The
  one reader that does need every reading, the plate, never needed React for
  it: it read the prop through an effect into a ref, so it heard each
  reading one frame late, after the render that carried it had committed.

  So the ear keeps two things. `live` is a ref holding every reading the
  moment it is made, and the plate (and the cast feed) read it on their own
  clocks. `audioData` is the same reading published as state at most every
  EAR_VIEW_MS, for what renders. 100 ms is ten a second: faster than a meter
  needs to look alive, and slow enough that a render of the App is no longer
  a per-frame cost.
*/
const EAR_VIEW_MS = 100;

export interface Ear {
  /**
   * The show's analysis is running and hearing, as React state at most ten
   * times a second, for the desks, meters and anything else that renders.
   */
  audioData: AudioData | null;
  /**
   * Every reading, the moment it is made, for readers on their own clock (the
   * plate's frame, the cast feed). Null while the ear is off. Reading it
   * never renders anything.
   */
  live: { readonly current: AudioData | null };
  /**
   * Called with every reading as it is made, on the ear's own clock, which
   * keeps reading while the window is hidden behind the wall (§14a) and page
   * timers are held to one a second. For a feed that has to keep up with the
   * sound without re-rendering anything (the cast's audio). Returns the
   * unsubscribe.
   */
  onReading: (fn: (a: AudioData) => void) => () => void;
  /**
   * Listening, but nothing is arriving: the audio context is suspended or
   * interrupted (a phone call on iOS, a page that has not been touched yet),
   * or no reading has landed for half a second. The desk and the phone say so,
   * because a plate that has gone deaf still moves and nobody can tell by
   * looking at it.
   */
  deaf: boolean;
  /** For `?debug` and `npm run ears`: readings by who offered them, and the context's state. */
  debug: () => { reads: Record<'frame' | 'ask' | 'tick', number>; recent: { driver: 'frame' | 'ask' | 'tick'; at: number }[]; state: string; deaf: boolean } | null;
}

export function useAudioAnalyzer(
  stream: MediaStream | null,
  isActive: boolean,
  sensitivity: number = 1.0,
  bassBoost: number = 1.0,
  autoCalibrate: boolean = true,
  calibrateNonce: number = 0,
): Ear {
  const [audioData, setAudioData] = useState<AudioData | null>(null);
  const liveRef = useRef<AudioData | null>(null);
  const publishedAtRef = useRef(-Infinity);
  const listenersRef = useRef(new Set<(a: AudioData) => void>());
  const [deaf, setDeaf] = useState(false);
  const deafRef = useRef(false);
  const earRef = useRef<EarClock | null>(null);
  const tickerRef = useRef<Worker | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
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
    animationFrameRef.current = null;
    onWallAsk(null);
    tickerRef.current?.terminate();
    tickerRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
    earRef.current = null;
    if (audioContextRef.current) audioContextRef.current.close();
    audioContextRef.current = null;
    analyzerRef.current = null;
    sourceRef.current = null;
    liveRef.current = null;
    publishedAtRef.current = -Infinity;
    setAudioData(null);
    deafRef.current = false;
    setDeaf(false);
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

      const ear = new EarClock();
      earRef.current = ear;
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
        // Smoothed against the last reading, not the last one React was
        // shown: the smoothing is per reading, and the plate hears every one.
        const next: AudioData = {
          frequencyData: new Uint8Array(frequencyData),
          timeDomainData: new Uint8Array(timeDomainData),
          ...smoothLevels(liveRef.current, raw),
          calibration,
          features: reading,
        };
        liveRef.current = next;
        for (const fn of listenersRef.current) fn(next);
        const now = performance.now();
        if (now - publishedAtRef.current >= EAR_VIEW_MS) {
          publishedAtRef.current = now;
          setAudioData(next);
        }
        if (deafRef.current && audioContext.state === 'running') { deafRef.current = false; setDeaf(false); }
      };

      /*
        The three ways in (lib/earClock.ts). The frame loop is the one that ran
        alone before; the other two only read while it has stopped.
      */
      const frame = () => {
        if (earRef.current !== ear) return;
        if (ear.offer('frame', performance.now())) update();
        animationFrameRef.current = requestAnimationFrame(frame);
      };
      onWallAsk((now) => { if (earRef.current === ear && ear.offer('ask', now, document.hidden)) update(); });
      try {
        const url = URL.createObjectURL(new Blob([TICK_WORKER], { type: 'text/javascript' }));
        const ticker = new Worker(url);
        URL.revokeObjectURL(url);
        ticker.onmessage = () => {
          if (earRef.current !== ear) return;
          const now = performance.now();
          if (ear.offer('tick', now, document.hidden)) update();
        };
        ticker.postMessage(TICK_MS);
        tickerRef.current = ticker;
      } catch { /* no workers: the frames and the wall's asks still read */ }
      // `npm run ears` stops the tick for its control (the ear as it was)
      // and reaches the context to suspend it. Only under ?debug.
      if (new URLSearchParams(window.location.search).has('debug')) {
        const w = window as unknown as { __earTick?: (on: boolean) => void; __earContext?: AudioContext };
        w.__earTick = (on) => tickerRef.current?.postMessage(on ? TICK_MS : 0);
        w.__earContext = audioContext;
      }

      /*
        A context that is not running hears nothing, and the analyser hands
        back the same silence every read, which looks like a quiet room rather
        than a fault. Chrome starts one suspended on a page nobody has touched
        (a remembered microphone at load), iOS interrupts one for a phone call.
        Ask for it back when it stops, and again on the next touch, which is
        the gesture Chrome's autoplay rule waits for (a mouse's press, a finger's
        lift).
      */
      const revive = () => { if (audioContext.state !== 'running' && audioContext.state !== 'closed') void audioContext.resume().catch(() => {}); };
      // A finger's pointerdown does not count as a gesture for this (the spec
      // grants it on the finger's lift), a mouse's does: listen for all of them.
      const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'] as const;
      audioContext.addEventListener('statechange', revive);
      for (const g of GESTURES) window.addEventListener(g, revive, true);
      unlistenRef.current = () => {
        audioContext.removeEventListener('statechange', revive);
        for (const g of GESTURES) window.removeEventListener(g, revive, true);
      };
      revive();

      /*
        The watchdog, on a clock of its own. Not on the worker's tick: while
        the tick runs it reads whenever nothing else does, so the ear it was
        watching could never be stale, and if the tick died the watchdog died
        with it (check-skeptic found both). A page timer is held to about one
        a second while the window is hidden, which is often enough to say
        "not hearing" and is only read on a desk someone is looking at.
      */
      let staleRun = 0;
      const watch = window.setInterval(() => {
        if (earRef.current !== ear) return;
        // Stale twice running, so a visible window coming out of one long task
        // does not flash "not hearing" for the frame before it reads again.
        staleRun = ear.stale(performance.now()) ? staleRun + 1 : 0;
        const deafNow = audioContext.state !== 'running' || staleRun >= 2;
        if (deafNow !== deafRef.current) { deafRef.current = deafNow; setDeaf(deafNow); }
      }, 250);
      const unlisten = unlistenRef.current;
      unlistenRef.current = () => { unlisten?.(); window.clearInterval(watch); };

      frame();
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

  const debug = useCallback(() => {
    const ear = earRef.current;
    const ctx = audioContextRef.current;
    if (!ear || !ctx) return null;
    return { reads: { ...ear.reads }, recent: ear.recent.slice(), state: ctx.state, deaf: deafRef.current };
  }, []);

  const onReading = useCallback((fn: (a: AudioData) => void) => {
    const set = listenersRef.current;
    set.add(fn);
    return () => { set.delete(fn); };
  }, []);

  return { audioData, live: liveRef, onReading, deaf: deaf && isActive, debug };
}
