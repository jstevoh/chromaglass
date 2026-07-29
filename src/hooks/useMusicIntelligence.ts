// Orchestrates the music intelligence layer:
//  • periodic song identification (fingerprint proxy, or manual tagging)
//  • first-listen recording → offline song map analysis → IndexedDB cache
//  • synced lyrics fetch, word-triggers and sentiment arc
//  • per-track deterministic seed + evolution state across listens
//  • playback-position clock so song maps drive visuals over the timeline
//
// The hook is deliberately side-effect-free toward the visualizer: it emits
// settings overrides, a harmony index and one-shot lyric triggers that
// App.tsx forwards to the LiquidVisualizer.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioData } from './useAudioAnalyzer';
import { VisualizerSettings } from '../types';
import {
  TrackIdentity, SongMap, TrackEvolutionState, MusicSettings,
  LyricTrigger, SongSection, LyricLine,
} from '../lib/musicTypes';
import { identify, manualIdentity, fingerprintingAvailable } from '../lib/fingerprint';
import { ListenRecorder, generateSongMap, sectionAt, energyAt } from '../lib/songMap';
import { buildLyrics, LyricsResult, lineAt, sectionSentiment } from '../lib/lyrics';
import {
  trackSeed, newTrackState, evolveAfterListen, buildVisualParams,
  paramsToSnapshot, MusicVisualParams,
} from '../lib/evolution';
import { getSongMap, putSongMap, getTrackState, putTrackState, getAllTrackStates } from '../lib/musicDb';

const IDENTIFY_INTERVAL_MS = 45_000;
const SILENCE_END_MS = 8_000;   // this long below the silence floor ⇒ listen ended
const SILENCE_VOLUME = 2.5;
const MIN_LISTEN_MS = 60_000;   // shorter listens don't count toward evolution

export interface MusicIntelState {
  track: TrackIdentity | null;
  songMap: SongMap | null;
  lyrics: LyricsResult | null;
  trackState: TrackEvolutionState | null;
  positionSec: number;
  section: SongSection | null;
  line: LyricLine | null;
  sectionSentimentValue: number;
  identifying: boolean;
  recording: boolean;
  analyzing: boolean;
  fingerprintEnabled: boolean;
  replayListenNumber: number | null;
  allTracks: TrackEvolutionState[];
}

export interface MusicIntelResult {
  state: MusicIntelState;
  /** Settings overlay to merge into the visualizer settings (never mutates presets). */
  overrides: Partial<VisualizerSettings> | null;
  harmonyIndex: number | null;
  /** One-shot lyric trigger — seq increments each time a new trigger fires. */
  trigger: { seq: number; trigger: LyricTrigger } | null;
  manualTag: (artist: string, title: string) => void;
  clearTrack: () => void;
  replayListen: (listenNumber: number) => void;
  stopReplay: () => void;
  refreshTracks: () => void;
}

export function useMusicIntelligence(
  stream: MediaStream | null,
  audioData: AudioData | null,
  music: MusicSettings,
  baseSettings: VisualizerSettings,
): MusicIntelResult {
  const [track, setTrack] = useState<TrackIdentity | null>(null);
  const [songMap, setSongMap] = useState<SongMap | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [trackState, setTrackState] = useState<TrackEvolutionState | null>(null);
  const [positionSec, setPositionSec] = useState(0);
  const [identifying, setIdentifying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [replayListenNumber, setReplayListenNumber] = useState<number | null>(null);
  const [allTracks, setAllTracks] = useState<TrackEvolutionState[]>([]);
  const [trigger, setTrigger] = useState<{ seq: number; trigger: LyricTrigger } | null>(null);

  const recorderRef = useRef(new ListenRecorder());
  const trackRef = useRef<TrackIdentity | null>(null);
  const songMapRef = useRef<SongMap | null>(null);
  const lyricsRef = useRef<LyricsResult | null>(null);
  const trackStateRef = useRef<TrackEvolutionState | null>(null);
  const musicRef = useRef(music);
  const audioRef = useRef<AudioData | null>(null);
  const lastLoudMsRef = useRef(performance.now());
  const listenStartMsRef = useRef(0);
  const lastIdentifyMsRef = useRef(0);
  const lastPosRef = useRef(0);
  const triggerSeqRef = useRef(0);
  const firedTriggerIdxRef = useRef(new Set<number>());
  const paramsRef = useRef<MusicVisualParams | null>(null);
  const busyRef = useRef(false);

  useEffect(() => { musicRef.current = music; }, [music]);
  useEffect(() => { audioRef.current = audioData; }, [audioData]);
  useEffect(() => { trackRef.current = track; }, [track]);
  useEffect(() => { songMapRef.current = songMap; }, [songMap]);
  useEffect(() => { lyricsRef.current = lyrics; }, [lyrics]);
  useEffect(() => { trackStateRef.current = trackState; }, [trackState]);

  const refreshTracks = useCallback(() => {
    getAllTrackStates().then(states =>
      setAllTracks(states.sort((a, b) => b.listenCount - a.listenCount)));
  }, []);
  useEffect(() => { refreshTracks(); }, [refreshTracks]);

  // ── Adopt a newly identified track ──────────────────────────────────
  const adoptTrack = useCallback(async (identity: TrackIdentity, streamForRecording: MediaStream | null) => {
    setTrack(identity);
    setReplayListenNumber(null);
    setPositionSec(identity.offsetSec ?? 0);
    lastPosRef.current = identity.offsetSec ?? 0;
    firedTriggerIdxRef.current = new Set();
    listenStartMsRef.current = performance.now();

    let state = await getTrackState(identity.isrc);
    if (!state) state = newTrackState(identity.isrc, identity.title, identity.artist);
    else if (!state.title && identity.title) state = { ...state, title: identity.title, artist: identity.artist };
    setTrackState(state);

    const cached = await getSongMap(identity.isrc);
    setSongMap(cached ?? null);

    // First listen of this track: record it for offline analysis
    if (!cached && streamForRecording) {
      const ok = recorderRef.current.start(streamForRecording);
      setRecordingActive(ok);
    }

    // Lyrics (needs song map only for plain-lyric alignment — fine if null)
    buildLyrics(identity.artist, identity.title, identity.album, cached ?? null)
      .then(result => { if (trackRef.current?.isrc === identity.isrc) setLyrics(result); })
      .catch(() => setLyrics(null));
  }, []);

  // ── Finalize the current listen (track changed or went silent) ─────
  const finalizeListen = useCallback(async (reason: 'silence' | 'trackChange' | 'manual') => {
    const currentTrack = trackRef.current;
    const listenMs = performance.now() - listenStartMsRef.current;
    const recording = await recorderRef.current.stop();
    setRecordingActive(false);

    if (!currentTrack) return;

    // Generate + cache the song map from the first-listen recording
    if (recording && !songMapRef.current && listenMs > MIN_LISTEN_MS) {
      setAnalyzing(true);
      const map = await generateSongMap(currentTrack.isrc, recording, {
        title: currentTrack.title, artist: currentTrack.artist,
      });
      setAnalyzing(false);
      if (map) {
        await putSongMap(map);
        if (trackRef.current?.isrc === currentTrack.isrc) setSongMap(map);
      }
    }

    // Count the listen + evolve parameters
    if (listenMs > MIN_LISTEN_MS && trackStateRef.current) {
      const snapshot = paramsRef.current ? paramsToSnapshot(paramsRef.current) : {};
      const evolved = evolveAfterListen(trackStateRef.current, snapshot, musicRef.current.evolutionSpeed);
      await putTrackState(evolved);
      if (trackRef.current?.isrc === currentTrack.isrc) setTrackState(evolved);
      refreshTracks();
    }

    if (reason !== 'trackChange') {
      setTrack(null); setSongMap(null); setLyrics(null);
      setPositionSec(0);
    }
  }, [refreshTracks]);

  // ── Identification + position + trigger loop ────────────────────────
  useEffect(() => {
    if (!music.enabled || !stream) {
      recorderRef.current.discard();
      setRecordingActive(false);
      return;
    }

    const tick = window.setInterval(async () => {
      const now = performance.now();
      const audio = audioRef.current;
      const currentTrack = trackRef.current;

      // Silence tracking
      if (audio && audio.volume > SILENCE_VOLUME) lastLoudMsRef.current = now;
      const silentFor = now - lastLoudMsRef.current;

      // Position clock
      if (currentTrack?.identifiedAtMs != null) {
        const pos = (currentTrack.offsetSec ?? 0) + (now - currentTrack.identifiedAtMs) / 1000;
        setPositionSec(pos);

        // Lyric triggers in (lastPos, pos]
        const lyr = lyricsRef.current;
        const unlocked = trackStateRef.current?.currentParams.unlockedLayers ?? [];
        if (lyr && musicRef.current.lyricTriggers) {
          lyr.triggers.forEach((t, idx) => {
            if (t.time > lastPosRef.current && t.time <= pos &&
                !firedTriggerIdxRef.current.has(idx) &&
                unlocked.includes(t.theme)) {
              firedTriggerIdxRef.current.add(idx);
              triggerSeqRef.current++;
              setTrigger({ seq: triggerSeqRef.current, trigger: t });
            }
          });
        }
        lastPosRef.current = pos;
      }

      // End of listen on sustained silence
      if (currentTrack && silentFor > SILENCE_END_MS && !busyRef.current) {
        busyRef.current = true;
        await finalizeListen('silence');
        busyRef.current = false;
        return;
      }

      // Periodic identification — also fires quickly after silence→energy transitions
      const dueForIdentify = now - lastIdentifyMsRef.current > IDENTIFY_INTERVAL_MS ||
        (!currentTrack && silentFor < 2000 && now - lastIdentifyMsRef.current > 15_000);
      if (fingerprintingAvailable() && dueForIdentify && !busyRef.current &&
          audio && audio.volume > SILENCE_VOLUME) {
        busyRef.current = true;
        lastIdentifyMsRef.current = now;
        setIdentifying(true);
        try {
          const identity = await identify(stream);
          if (identity) {
            if (identity.isrc !== trackRef.current?.isrc) {
              await finalizeListen('trackChange');
              await adoptTrack(identity, stream);
            } else if (trackRef.current) {
              // Same track — refine the position clock with the fresh offset
              setTrack({ ...trackRef.current, offsetSec: identity.offsetSec, identifiedAtMs: identity.identifiedAtMs });
            }
          }
        } finally {
          setIdentifying(false);
          busyRef.current = false;
        }
      }
    }, 500);

    return () => window.clearInterval(tick);
  }, [music.enabled, stream, adoptTrack, finalizeListen]);

  // ── Derived: section, line, sentiment ───────────────────────────────
  const section = useMemo(() => sectionAt(songMap, positionSec), [songMap, positionSec]);
  const line = useMemo(() => lyrics ? lineAt(lyrics.lines, positionSec) : null, [lyrics, positionSec]);
  const sectionSentimentValue = useMemo(() => {
    if (!lyrics || !section || !musicRef.current.sentimentArc) return 0;
    return sectionSentiment(lyrics.lines, section.start, section.end);
  }, [lyrics, section]);

  // ── Derived: visual parameter overlay ───────────────────────────────
  const { overrides, harmonyIndex } = useMemo(() => {
    if (!music.enabled || !track) return { overrides: null, harmonyIndex: null };

    const seed = trackSeed(track.isrc);
    const snapshot = replayListenNumber != null
      ? trackState?.listens.find(l => l.listenNumber === replayListenNumber)?.paramSnapshot
      : undefined;
    const params = buildVisualParams(seed, trackState, {
      turbulenceScale: baseSettings.turbulenceScale,
      blobSurfaceTension: baseSettings.blobSurfaceTension,
      saturationBoost: baseSettings.saturationBoost,
      boundaryContrast: baseSettings.boundaryContrast,
    }, snapshot);
    paramsRef.current = params;

    // Structure-aware modulation on top of the per-track identity
    let turb = params.turbulenceScale;
    let sat = params.saturationBoost;
    let impact = baseSettings.audioImpact;
    if (section) {
      if (section.label === 'chorus') { turb = Math.min(1, turb + 0.2); sat = Math.min(2, sat + 0.15); impact = Math.min(1, impact + 0.2); }
      else if (section.label === 'intro' || section.label === 'outro') { turb *= 0.6; impact *= 0.7; }
      else if (section.label === 'bridge') { turb = Math.min(1, turb + 0.1); }
    }
    const energy = energyAt(songMap, positionSec);
    if (songMap) turb = Math.min(1, turb * (0.7 + energy * 0.6));

    const o: Partial<VisualizerSettings> = {
      turbulenceScale: turb,
      turbulenceDetail: params.turbulenceDetail,
      blobSurfaceTension: params.blobSurfaceTension,
      saturationBoost: sat,
      boundaryContrast: params.boundaryContrast,
      audioImpact: impact,
    };
    return { overrides: o, harmonyIndex: params.harmonyIndex };
  }, [music.enabled, track, trackState, replayListenNumber, section, songMap, positionSec, baseSettings]);

  // ── Actions ─────────────────────────────────────────────────────────
  const manualTag = useCallback((artist: string, title: string) => {
    if (!artist.trim() || !title.trim()) return;
    (async () => {
      await finalizeListen('trackChange');
      await adoptTrack(manualIdentity(artist, title), stream);
    })();
  }, [adoptTrack, finalizeListen, stream]);

  const clearTrack = useCallback(() => { finalizeListen('manual'); }, [finalizeListen]);

  const replayListen = useCallback((listenNumber: number) => setReplayListenNumber(listenNumber), []);
  const stopReplay = useCallback(() => setReplayListenNumber(null), []);

  return {
    state: {
      track, songMap, lyrics, trackState, positionSec, section, line,
      sectionSentimentValue, identifying, recording: recordingActive, analyzing,
      fingerprintEnabled: fingerprintingAvailable(), replayListenNumber, allTracks,
    },
    overrides, harmonyIndex, trigger,
    manualTag, clearTrack, replayListen, stopReplay, refreshTracks,
  };
}
