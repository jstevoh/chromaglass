import { useMemo, useState, useCallback, useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import type { AudioData } from '../hooks/useAudioAnalyzer';
import { clearShowInterval, type ShowIntervalHandle } from '../lib/showClock';
import { flushSync } from 'react-dom';
import { useSongRender } from '../hooks/useSongRender';
import { useLoopRender } from './loopRender';
import { parseSeed, showSeed } from '../lib/rng';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { ShowSequence, SequencerStatus } from '../lib/sequencer';
import type { SongShowRuntime } from '../hooks/useSongShows';
import type { RowFades, FadeWay } from '../lib/mixFade';
import type { LaterWrites } from '../lib/lookFade';
import type { MixSource } from '../lib/mixer';
import type { SlowEvolve } from '../lib/slowEvolve';
import type { VisualizerSettings } from '../types';
import type { Track } from '../lib/musicLibrary';

/**
 * Rendering a song to a film (`hooks/useSongRender.ts`): what the app steps
 * aside from while a render runs (the live ear, every fade and glide, the
 * automation) and what it puts back after. `chromaglassRender` drives it for
 * `npm run renders`.
 */
interface SongRenderingDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  renderAudioRef: RefObject<AudioData | null>;
  setRenderAudio: Dispatch<SetStateAction<AudioData | null>>;
  musicElRef: RefObject<HTMLAudioElement | null>;
  showSequencerRef: RefObject<{ sequences: ShowSequence[]; selectedId: string; setSelectedId: Dispatch<SetStateAction<string>>; status: SequencerStatus; play: (sequenceId?: string | undefined) => void; pause: () => void; stop: () => void; next: () => void; prev: () => void; goTo: (index: number) => void; startAt: (sequenceId: string, offsetSec: number) => void; upsertSequence: (seq: ShowSequence) => void; removeSequence: (id: string) => void; }>;
  songRuntimeRef: RefObject<SongShowRuntime>;
  lookFadeRef: RefObject<ShowIntervalHandle | null>;
  fadeRef: RefObject<ShowIntervalHandle | null>;
  glidesRef: RefObject<Map<string, ShowIntervalHandle>>;
  rowFadeTimer: RefObject<ShowIntervalHandle | null>;
  rowFades: RowFades;
  laterWrites: LaterWrites;
  setRowFading: Dispatch<SetStateAction<Partial<Record<MixSource, FadeWay>>>>;
  driftGlide: RefObject<Map<string, { from: number; to: number; at: number; seconds: number; }>>;
  slowEvolveRef: RefObject<SlowEvolve | null>;
  settingsRef: RefObject<VisualizerSettings>;
  driftAnchor: RefObject<VisualizerSettings>;
  isActiveRef: RefObject<boolean>;
  renderHoldRef: RefObject<boolean>;
  setRenderHold: Dispatch<SetStateAction<boolean>>;
  setIsActive: Dispatch<SetStateAction<boolean>>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  musicFile: { name: string; url: string; objectUrl: boolean; track?: Track | undefined; } | null;
}

export function useSongRendering({
  wallRef, renderAudioRef, setRenderAudio, musicElRef, showSequencerRef, songRuntimeRef,
  lookFadeRef, fadeRef, glidesRef, rowFadeTimer, rowFades, laterWrites, setRowFading, driftGlide,
  slowEvolveRef, settingsRef, driftAnchor, isActiveRef, renderHoldRef, setRenderHold, setIsActive,
  setSettings, musicFile,
}: SongRenderingDeps) {
  /*
    The app's side of a render: what it steps aside from, and what it puts
    back. The loop itself is hooks/useSongRender.ts; the plate's side is
    `VisualizerRender` in components/LiquidVisualizer.tsx.

    Stepping aside, and why each:
      - the music element pauses: the render hears the song from its file;
        the room does not need to hear it again at the same time. It plays
        on afterwards if it was playing, from where it was;
      - a sequence or a song's show stops (first cut: they do not play in a
        render yet, and the panel says so before anything is pressed);
      - fades and glides in flight are dropped, because their clocks were
        started on the wall clock and would land at a moment the film does
        not have; Evolve's own intervals are kept and re-phased onto the
        film's clock (lib/showClock.ts), and its glide and aim start empty;
      - a frozen plate is thawed, since a render of a still is not a film;
      - the settings and Evolve's anchor are kept, because Evolve wanders
        them during the render and the show after it should be the show
        before it. The same snapshot is what makes a second render of the
        same seed start where the first one did, which `npm run render-app`
        measures.
    The seed is put back too (in useSongRender), so tonight's seed is still
    tonight's after a render on another one. And the fades and glides are
    dropped again on the way out, for the reason given where it is done.
  */
  const renderHost = useMemo(() => ({
    render: () => wallRef.current?.render() ?? null,
    setAudio: (a: AudioData | null) => { renderAudioRef.current = a; setRenderAudio(a); },
    prepare: () => {
      const el = musicElRef.current;
      if (showSequencerRef.current.status.sequenceId !== null) showSequencerRef.current.stop();
      songRuntimeRef.current.stop();
      if (lookFadeRef.current) { clearShowInterval(lookFadeRef.current); lookFadeRef.current = null; }
      if (fadeRef.current) { clearShowInterval(fadeRef.current); fadeRef.current = null; }
      for (const t of glidesRef.current.values()) clearShowInterval(t);
      glidesRef.current.clear();
      if (rowFadeTimer.current) { clearShowInterval(rowFadeTimer.current); rowFadeTimer.current = null; }
      rowFades.clear();
      laterWrites.clear();
      setRowFading({});
      driftGlide.current.clear();
      // A render plans its own moves from the start, as the show would on this song.
      slowEvolveRef.current = null;
      const kept = { settings: settingsRef.current, anchor: driftAnchor.current, active: isActiveRef.current, playing: !!el && !el.paused };
      if (el && !el.paused) el.pause();
      renderHoldRef.current = true;
      flushSync(() => { setRenderHold(true); setIsActive(true); });
      return () => {
        /*
          The same drops as on the way in, again on the way out. A fade or a
          glide started during the render (a song show's, a look fade Evolve
          asked for) was stamped on the film's clock, whose milliseconds start
          at 2^20; carried into the live show, on a page younger than that it
          reads as not begun and extrapolates, and writes over the settings
          and the dimmer this very function is about to put back.
        */
        if (lookFadeRef.current) { clearShowInterval(lookFadeRef.current); lookFadeRef.current = null; }
        if (fadeRef.current) { clearShowInterval(fadeRef.current); fadeRef.current = null; }
        for (const t of glidesRef.current.values()) clearShowInterval(t);
        glidesRef.current.clear();
        if (rowFadeTimer.current) { clearShowInterval(rowFadeTimer.current); rowFadeTimer.current = null; }
        rowFades.clear();
        laterWrites.clear();
        renderHoldRef.current = false;
        flushSync(() => { setSettings(kept.settings); setIsActive(kept.active); setRenderHold(false); setRowFading({}); });
        driftAnchor.current = kept.anchor;
        driftGlide.current.clear();
        slowEvolveRef.current = null;
        // The song plays on if it was playing: a render interrupts listening, it does not end it.
        if (kept.playing && musicElRef.current) void musicElRef.current.play().catch(() => { /* needs a gesture: the play button is there */ });
      };
    },
  }), []);
  const fullRender = useSongRender(renderHost);
  const loopRender = useLoopRender(renderHost);
  const [lastKind, setLastKind] = useState<'song' | 'loop'>('song');
  const activeRender = loopRender.running ? loopRender : fullRender.running ? fullRender : lastKind === 'loop' ? loopRender : fullRender;
  const songRender = useMemo(() => ({
    state: activeRender.state,
    running: fullRender.running || loopRender.running,
    support: fullRender.support,
    start: fullRender.start,
    cancel: () => { fullRender.cancel(); loopRender.cancel(); },
    reset: () => { fullRender.reset(); loopRender.reset(); },
  }), [activeRender.state, fullRender, loopRender]);
  const [renderOpen, setRenderOpen] = useState(false);
  const startRender = useCallback((choice: { width: number; height: number; fps: number; seed: string; loop?: { seconds: number; startSec?: number } }) => {
    if (!musicFile) return;
    const s = settingsRef.current;
    const seed = parseSeed(choice.seed) ?? showSeed();
    const levels = { sensitivity: s.sensitivity, bassBoost: s.bassBoost, autoCalibrate: s.autoCalibrate !== false };
    if (choice.loop) {
      setLastKind('loop');
      void loopRender.start({
        song: musicFile.url, name: musicFile.name,
        width: choice.width, height: choice.height, fps: choice.fps, seed, levels,
        loop: { seconds: choice.loop.seconds, startSec: choice.loop.startSec },
      });
      return;
    }
    setLastKind('song');
    void fullRender.start({
      song: musicFile.url, name: musicFile.name,
      width: choice.width, height: choice.height, fps: choice.fps, seed, levels,
    });
  }, [musicFile, fullRender.start, loopRender.start]);
  /*
    For `npm run render-app` and `npm run loopseam` only (`?debug`): render the
    loaded song, or a song handed over as bytes, small and kept in memory, and
    hand back the file and a hash of every frame (or the loop's picked start).
  */
  const musicFileRef = useRef(musicFile);
  musicFileRef.current = musicFile;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    // What a render could leave running in the live show: a fade or a glide
    // stamped on the film's clock (see the restore in `renderHost`).
    window.chromaglassRenderPending = () => ({
      lookFade: lookFadeRef.current !== null, dimmerFade: fadeRef.current !== null, glides: glidesRef.current.size,
    });
    window.chromaglassRender = async (o: {
      song?: ArrayBuffer; width: number; height: number; fps: number; seed: number; maxFrames?: number;
      loop?: { seconds: number; crossfade?: boolean; startSec?: number };
    }) => {
      const s = settingsRef.current;
      const song = o.song ? new Blob([o.song]) : musicFileRef.current?.url;
      if (!song) throw new Error('no song: load one or pass its bytes');
      const levels = { sensitivity: s.sensitivity, bassBoost: s.bassBoost, autoCalibrate: s.autoCalibrate !== false };
      if (o.loop) {
        const r = await loopRender.start({
          song, name: 'check', width: o.width, height: o.height, fps: o.fps, seed: o.seed, levels,
          loop: o.loop, test: { keepInMemory: true },
        });
        let b64: string | null = null;
        if (r.bytes) {
          let bin = '';
          for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
          b64 = btoa(bin);
        }
        return { phase: r.phase, message: r.message, format: r.format, summary: r.summary, bytes: b64, loop: r.loop };
      }
      const r = await fullRender.start({
        song, name: 'check', width: o.width, height: o.height, fps: o.fps, seed: o.seed, levels,
        test: { keepInMemory: true, hashFrames: true, maxFrames: o.maxFrames },
      });
      let b64: string | null = null;
      if (r.bytes) {
        let bin = '';
        for (let i = 0; i < r.bytes.length; i += 0x8000) bin += String.fromCharCode(...r.bytes.subarray(i, i + 0x8000));
        b64 = btoa(bin);
      }
      return { phase: r.phase, message: r.message, format: r.format, summary: r.summary, frameHashes: r.frameHashes, frameDigests: r.frameDigests, bytes: b64 };
    };
  }, [fullRender.start, loopRender.start]);

  return {
    songRender, renderOpen, setRenderOpen, startRender,
  };
}
