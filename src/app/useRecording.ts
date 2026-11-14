import { useRecorder } from '../hooks/useRecorder';
import { useState, useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import { portraitStage, type ClipShape } from '../lib/clipFrame';
import { isFreeTierGated } from '../lib/tierGates';
import { type RecordChoice, loadRecordChoice, normalizeChoice, saveRecordChoice, recordMove } from '../lib/recordChoice';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';

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
