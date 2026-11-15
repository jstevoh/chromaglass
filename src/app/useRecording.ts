import { useRecorder, videoFormats } from '../hooks/useRecorder';
import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { portraitStage, type ClipShape } from '../lib/clipFrame';
import { isFreeTierGated } from '../lib/tierGates';
import { type RecordChoice, loadRecordChoice, normalizeChoice, saveRecordChoice, recordMove } from '../lib/recordChoice';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import { publishRecord, setRecordDoor, TAKES_LISTED } from './recordNow';

/**
 * The one Record button (`lib/recordChoice.ts`): R, the desk, the phone, MIDI
 * and the remote all land here, and what it starts is what the Record panel
 * says it makes: the Plate video, a Take, or both.
 */
interface RecordingDeps {
  audioStream: MediaStream | null;
  perfLive: boolean;
  stopPerformance: () => void;
  startPerformance: () => void;
  musicIntel: MusicIntelResult;
  perfNow: number;
  /** The wall's visualizer, which a portrait clip gives a 9:16 stage (lib/clipFrame.ts). */
  wallRef: MutableRefObject<LiquidVisualizerHandle | null>;
  /** The size a projector gave the wall, or null: it keeps its shape and the clip is a slice. */
  stageRef: MutableRefObject<{ width: number; height: number } | null>;
  /** A phone's canvas is its screen: the clip is a slice of it too. */
  phone: boolean;
}

export function useRecording({
  audioStream, perfLive, stopPerformance, startPerformance, musicIntel, perfNow, wallRef, stageRef, phone,
}: RecordingDeps) {
  // ── Recording ──
  const recorder = useRecorder({ shape: phone ? 'portrait' : 'plate' });
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  /*
    The one Record button (lib/recordChoice.ts). R, the desk's button, the
    phone's, MIDI and the remote all land here: nothing running, it starts
    what the Record panel says it makes (the Plate video, a Take, or both);
    anything running, it stops all of it. `toggleVideo` is the video alone.
  */
  /*
    A portrait clip (PLAN 34f, lib/clipFrame.ts) is the plate drawn at 9:16:
    the wall's visualizer is given a 9:16 stage for as long as the clip runs,
    as a projector would give it, and put back to what it had (the projector's
    own size, or none) when the recording ends however it ends. With a
    projector attached, or on a phone, the canvas is not ours to reshape and
    the recorder takes the centred 9:16 slice instead.
  */
  const clipStageRef = useRef(false);
  const endClipStage = useCallback(() => {
    if (!clipStageRef.current) return;
    clipStageRef.current = false;
    wallRef.current?.setStage(stageRef.current);
  }, [wallRef, stageRef]);
  const toggleVideo = useCallback(() => {
    const canvas = document.getElementById('liquid-canvas') as HTMLCanvasElement | null;
    if (!recorder.recording && canvas && recorder.options.shape === 'portrait' && !stageRef.current && !phone && wallRef.current) {
      clipStageRef.current = true;
      wallRef.current.setStage(portraitStage(isFreeTierGated()));
      // A moment for the plate to draw into the new size. A timer, not frames: on a machine
      // whose frames take seconds the recording would otherwise begin seconds after the press.
      setTimeout(() => {
        if (!recorder.start(canvas, audioStream)) endClipStage();
      }, 120);
      return;
    }
    recorder.toggle(canvas, audioStream);
  }, [recorder, audioStream, phone, endClipStage, wallRef, stageRef]);
  const wasRecordingRef = useRef(false);
  useEffect(() => {
    if (wasRecordingRef.current && !recorder.recording) endClipStage();
    wasRecordingRef.current = recorder.recording;
  }, [recorder.recording, endClipStage]);
  const [recordChoice, setRecordChoiceState] = useState<RecordChoice>(loadRecordChoice);
  const setRecordChoice = useCallback((c: RecordChoice) => {
    const next = normalizeChoice(c);
    setRecordChoiceState(next);
    saveRecordChoice(next);
  }, []);
  const toggleRecording = useCallback(() => {
    const m = recordMove(recordChoice, { videoOn: recorder.recording, takeOn: perfLive, videoSupported: recorder.supported });
    if (m.stopVideo || m.startVideo) toggleVideo();
    if (m.stopTake) stopPerformance();
    if (m.startTake) startPerformance();
  }, [recordChoice, recorder.recording, recorder.supported, perfLive, toggleVideo, stopPerformance, startPerformance]);
  // Whatever Record is making, one clock for the phone and the overlay bar: the video's when it runs, else the take's.
  const recordingAny = recorder.recording || perfLive;
  const recordSeconds = recorder.recording
    ? recorder.seconds
    : musicIntel.performance.live
      ? Math.max(0, Math.floor((Math.max(perfNow, musicIntel.performance.live.startedAtMs) - musicIntel.performance.live.startedAtMs) / 1000))
      : 0;

  /*
    Recording's options and the kept Takes for the owner's assistant
    (app/recordNow.ts, PLAN 44k-11): the door is the Record panel's own
    callbacks, read through a ref so it is set once and still calls this
    render's (Replay is useMusicIntelligence's, remade with every Take kept),
    and the copy is published when an option, a Take, a replay or the last
    video changes; never the clock, which the remote state has already.
  */
  const perf = musicIntel.performance;
  const live = useRef({ setRecordChoice, recorder, musicIntel });
  live.current = { setRecordChoice, recorder, musicIntel };
  /*
    A delete is IndexedDB's and then a refresh of the list, so for a moment
    the Take deleted is still listed: a second `take delete` in that moment
    would land on it again and be answered done twice for one Take gone.
    The ids on their way out are held here until the list no longer has them.
  */
  const leaving = useRef(new Set<string>());
  useEffect(() => {
    const has = (id: string) => !leaving.current.has(id) && live.current.musicIntel.performance.saved.some((p) => p.id === id);
    setRecordDoor({
      choose: (c) => live.current.setRecordChoice(c),
      options: (o) => live.current.recorder.setOptions(o),
      replay: (id) => { if (!has(id)) return false; live.current.musicIntel.replayPerformance(id); return true; },
      stopReplay: () => live.current.musicIntel.stopPerformanceReplay(),
      remove: (id) => { if (!has(id)) return false; leaving.current.add(id); live.current.musicIntel.deletePerformance(id); return true; },
    });
    return () => setRecordDoor(null);
  }, []);
  const opts = recorder.options;
  const last = recorder.lastTake;
  useEffect(() => {
    for (const id of leaving.current) if (!perf.saved.some((p) => p.id === id)) leaving.current.delete(id);
    const listed = perf.saved.slice(0, TAKES_LISTED);
    const replaying = perf.replayingId === null ? -1 : perf.saved.findIndex((p) => p.id === perf.replayingId);
    publishRecord({
      makes: recordChoice.video && recordChoice.take ? 'both' : recordChoice.take ? 'take' : 'video',
      quality: opts.quality, fps: opts.fps, format: opts.format, sound: opts.includeAudio,
      formats: videoFormats(opts.includeAudio), videoSupported: recorder.supported,
      lastVideo: last ? { filename: last.filename, seconds: last.seconds, sizeBytes: last.sizeBytes } : null,
      takes: listed.map((p, i) => ({ n: i + 1, id: p.id, title: p.title ?? null, artist: p.artist ?? null, seconds: Math.round(p.durationSec), gestures: p.gestures.length, clock: p.clock, date: p.date })),
      takeCount: perf.saved.length,
      replaying: replaying >= 0 ? replaying + 1 : null,
    });
  }, [recordChoice, opts, recorder.supported, last, perf.saved, perf.replayingId]);

  // What the phone's More sheet shows of Record: the clock, the choice, the clip's frame (a portrait
  // pick also asks for sound, which a Reels clip without it would not be) and the last take to share.
  const phoneRecording = {
    supported: true, on: recordingAny, seconds: recordSeconds, onToggle: toggleRecording,
    choice: recordChoice, onChoice: setRecordChoice,
    shape: recorder.options.shape,
    onShape: (shape: ClipShape) => recorder.setOptions(shape === 'portrait' ? { shape, includeAudio: true } : { shape }),
    take: recorder.lastTake,
  };

  return {
    recorder, showRecordPanel, setShowRecordPanel, recordChoice, setRecordChoice, toggleRecording,
    recordingAny, recordSeconds, phoneRecording,
  };
}
