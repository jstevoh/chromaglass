import { useRecorder } from '../hooks/useRecorder';
import { useState, useCallback } from 'react';
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
}

export function useRecording({
  audioStream, perfLive, stopPerformance, startPerformance, musicIntel, perfNow,
}: RecordingDeps) {
  // ── Recording ──
  const recorder = useRecorder();
  const [showRecordPanel, setShowRecordPanel] = useState(false);
  /*
    The one Record button (lib/recordChoice.ts). R, the desk's button, the
    phone's, MIDI and the remote all land here: nothing running, it starts
    what the Record panel says it makes (the Plate video, a Take, or both);
    anything running, it stops all of it. `toggleVideo` is the video alone.
  */
  const toggleVideo = useCallback(() => {
    recorder.toggle(document.getElementById('liquid-canvas') as HTMLCanvasElement | null, audioStream);
  }, [recorder, audioStream]);
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

  return {
    recorder, showRecordPanel, setShowRecordPanel, recordChoice, setRecordChoice, toggleRecording,
    recordingAny, recordSeconds,
  };
}
