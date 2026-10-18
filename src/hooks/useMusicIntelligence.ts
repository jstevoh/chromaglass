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
  LyricTrigger, SongSection, LyricLine, GestureEvent, SavedPerformance,
} from '../lib/musicTypes';
import { songStartMs, finishTake, takeSong, replayPosition, dueGestures, type TakeSong } from '../lib/performanceTake';
import { identify, manualIdentity, fingerprintingAvailable, capturePcm } from '../lib/fingerprint';
import { addToIndex, matchSnippet, FingerprintIndex, TrackFingerprint } from '../lib/localFingerprint';
import { loadFingerprintIndex } from '../lib/fingerprintIndexBuild';
import { ListenRecorder, generateSongMap, sectionAt, energyAt } from '../lib/songMap';
import { SongPosition, nudgeFor, type NudgeKind } from '../lib/songScore';
import { FollowedPlace, readSection } from '../lib/followedPlace';
import { buildLyrics, LyricsResult, lineAt, sectionSentiment } from '../lib/lyrics';
import {
  trackSeed, newTrackState, evolveAfterListen, buildVisualParams,
  paramsToSnapshot, pickPresetForTrack, MusicVisualParams,
} from '../lib/evolution';
import {
  getSongMap, putSongMap, getTrackState, putTrackState, getAllTrackStates,
  putPerformance, getAllPerformances, deletePerformance as dbDeletePerformance,
} from '../lib/musicDb';

const IDENTIFY_INTERVAL_MS = 35_000; // API re-check cadence while a track is identified
const IDENTIFY_RETRY_MS = 10_000;    // API retry cadence while nothing is identified
const LOCAL_MATCH_RETRY_MS = 6_000;  // local matching is free — try often when unidentified
/**
 * How often the local matcher re-checks while a track is already known.
 *
 * This is the only thing that catches a track change on a gapless service,
 * where there is no silence for the boundary detector to hear and the API
 * (when there is one at all) is on a 35-second leash to spare its quota. It
 * was 20 seconds, so half a short song could play under the last one's
 * colours. Matching is local and free; the cost is the four-second capture,
 * not the arithmetic.
 */
const LOCAL_MATCH_INTERVAL_MS = 12_000;
const SILENCE_END_MS = 5_000;   // this long below the silence floor ⇒ listen ended
const GAP_MS = 1_600;           // a dip this long looks like a between-song gap
const SILENCE_VOLUME = 2.5;
const MIN_LISTEN_MS = 60_000;   // shorter listens don't count toward evolution

export interface MusicIntelState {
  track: TrackIdentity | null;
  songMap: SongMap | null;
  lyrics: LyricsResult | null;
  trackState: TrackEvolutionState | null;
  /** Where the show reads the song map, in its seconds: followed by ear where the map has harmony (lib/followedPlace.ts), else the clock. */
  positionSec: number;
  /** How far the score's nudge has moved the position from the clock's own reading, seconds (+ is later in the song). */
  nudgeSec: number;
  /**
   * Following the map by ear (PLAN.md 28g-2): whether the place is the
   * follower's, and how sure, held over a second and a half. Null when there
   * is no map, or it has no harmony to follow (made before 28g-1).
   */
  follow: { sure: boolean; confidence: number } | null;
  /** The map's section at the place; none while a followed map is not sure where it is (the show leans on the song's shape then). */
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

export interface PerformanceState {
  /** The one being recorded: when it started, and the song attached so far. */
  live: { startedAtMs: number; title?: string } | null;
  /** Newest first. */
  saved: SavedPerformance[];
  replayingId: string | null;
  /** What the last stop did, for the moment after: kept, or nothing painted. */
  lastStop: { at: number; kept: boolean; gestures: number; title?: string } | null;
}

export interface MusicIntelResult {
  state: MusicIntelState;
  /** Settings overlay to merge into the visualizer settings (never mutates presets). */
  overrides: Partial<VisualizerSettings> | null;
  harmonyIndex: number | null;
  /** One-shot lyric trigger — seq increments each time a new trigger fires. */
  trigger: { seq: number; trigger: LyricTrigger } | null;
  /** One-shot preset pick when a track is (first) identified — seq increments per pick. */
  presetPick: { seq: number; presetId: string } | null;
  /** Batch of replayed performance gestures to re-fire — seq increments per batch. */
  gestureFire: { seq: number; gestures: GestureEvent[] } | null;
  /** Performances, started and stopped by hand (lib/performanceTake.ts). */
  performance: PerformanceState;
  recordGesture: (g: Omit<GestureEvent, 't'>) => void;
  startPerformance: () => void;
  stopPerformance: () => void;
  replayPerformance: (id: string) => void;
  stopPerformanceReplay: () => void;
  deletePerformance: (id: string) => void;
  manualTag: (artist: string, title: string) => void;
  clearTrack: () => void;
  replayListen: (listenNumber: number) => void;
  stopReplay: () => void;
  refreshTracks: () => void;
  /**
   * Move where the show thinks the song is: later (+) or earlier (-), for
   * this play of this song. The score's nudge (`lib/songScore.ts`).
   */
  nudgePosition: (deltaSec: number) => void;
  /** "Section starts now" or "Next section now", from the song's position as it is this instant. */
  nudgeToSection: (kind: NudgeKind) => void;
  /** Take the nudge back out: the position is the clock's own again. */
  resetNudge: () => void;
}

export function useMusicIntelligence(
  stream: MediaStream | null,
  audioData: AudioData | null,
  music: MusicSettings,
  baseSettings: VisualizerSettings,
  /** Every reading of the ear as it is made (hooks/useAudioAnalyzer.ts `onReading`), for the follower. */
  onReading?: (fn: (a: AudioData) => void) => () => void,
): MusicIntelResult {
  const [track, setTrack] = useState<TrackIdentity | null>(null);
  const [songMap, setSongMap] = useState<SongMap | null>(null);
  const [lyrics, setLyrics] = useState<LyricsResult | null>(null);
  const [trackState, setTrackState] = useState<TrackEvolutionState | null>(null);
  const [positionSec, setPositionSec] = useState(0);
  // The position clock, with the score's nudge in it (lib/songScore.ts
  // SongPosition says why the nudge is kept beside offsetSec, not in it).
  const posClockRef = useRef(new SongPosition());
  const [nudgeSec, setNudgeSec] = useState(0);
  const [follow, setFollow] = useState<MusicIntelState['follow']>(null);
  const [identifying, setIdentifying] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [recordingActive, setRecordingActive] = useState(false);
  const [replayListenNumber, setReplayListenNumber] = useState<number | null>(null);
  const [allTracks, setAllTracks] = useState<TrackEvolutionState[]>([]);
  const [trigger, setTrigger] = useState<{ seq: number; trigger: LyricTrigger } | null>(null);
  const [presetPick, setPresetPick] = useState<{ seq: number; presetId: string } | null>(null);
  const [gestureFire, setGestureFire] = useState<{ seq: number; gestures: GestureEvent[] } | null>(null);
  const [livePerformance, setLivePerformance] = useState<PerformanceState['live']>(null);
  const [savedPerformances, setSavedPerformances] = useState<SavedPerformance[]>([]);
  const [replayingPerformance, setReplayingPerformance] = useState<SavedPerformance | null>(null);
  const [lastStop, setLastStop] = useState<PerformanceState['lastStop']>(null);

  const recorderRef = useRef(new ListenRecorder());
  const trackRef = useRef<TrackIdentity | null>(null);
  const songMapRef = useRef<SongMap | null>(null);
  const lyricsRef = useRef<LyricsResult | null>(null);
  const trackStateRef = useRef<TrackEvolutionState | null>(null);
  const musicRef = useRef(music);
  const audioRef = useRef<AudioData | null>(null);
  const lastLoudMsRef = useRef(performance.now());
  const listenStartMsRef = useRef(0);
  const lastIdentifyMsRef = useRef(-Infinity); // first attempt fires as soon as sound is present
  const lastPosRef = useRef(0);
  /** Where the show reads the map (lib/followedPlace.ts); null while no track has been identified. */
  const placeRef = useRef<{ place: FollowedPlace; map: SongMap | null; isrc: string } | null>(null);
  const triggerSeqRef = useRef(0);
  const presetSeqRef = useRef(0);
  const gapPendingRef = useRef(false); // saw a between-song dip; identify as soon as sound returns
  const fpIndexRef = useRef<FingerprintIndex | null>(null);
  const lastLocalMatchMsRef = useRef(-Infinity);
  // The performance being recorded: gestures timed from its start, and the
  // song that was running when it started, if one was.
  const takeRef = useRef<{ startedAtMs: number; date: string; gestures: GestureEvent[]; song: TakeSong | null } | null>(null);
  const gestureSeqRef = useRef(0);
  const firedGestureIdxRef = useRef(new Set<number>());     // replay: gestures already fired

  // Local fingerprint index — recognized-before tracks match without the API.
  // Built whole once, off the main thread; after that each newly mapped song
  // is added on its own (see addToIndex) rather than the library being read
  // and rebuilt around it. A song that lands while the first build is still
  // out waits in fpPendingRef, since that build may have read the library
  // before the song was stored — or after, which addToIndex notices.
  // Only the latest build lands: an earlier one may have read the library
  // before a song that has since been stored.
  const fpPendingRef = useRef<TrackFingerprint[] | null>(null);
  const fpLoadSeqRef = useRef(0);
  const reloadFpIndex = useCallback(() => {
    fpPendingRef.current ??= [];
    const seq = ++fpLoadSeqRef.current;
    loadFingerprintIndex().then(index => {
      if (seq !== fpLoadSeqRef.current) return;
      const pending = fpPendingRef.current ?? [];
      fpPendingRef.current = null;
      for (const rec of pending) addToIndex(index, rec);
      fpIndexRef.current = index;
    }).catch(e => {
      console.warn('fingerprint index build failed', e);
      // The next new song finds no index and asks for a build again.
      if (seq === fpLoadSeqRef.current) fpPendingRef.current = null;
    });
  }, []);
  const addToFpIndex = useCallback((rec: TrackFingerprint) => {
    if (fpPendingRef.current) { fpPendingRef.current.push(rec); return; }
    const index = fpIndexRef.current;
    // Already indexed: a re-mapped song whose stored fingerprint was just
    // replaced. Its old entries are in there too, so build it again whole.
    if (!index || !addToIndex(index, rec)) reloadFpIndex();
  }, [reloadFpIndex]);
  useEffect(() => { reloadFpIndex(); }, [reloadFpIndex]);
  const firedTriggerIdxRef = useRef(new Set<number>());
  const paramsRef = useRef<MusicVisualParams | null>(null);
  const busyRef = useRef(false);

  useEffect(() => { musicRef.current = music; }, [music]);
  useEffect(() => { audioRef.current = audioData; }, [audioData]);
  useEffect(() => { trackRef.current = track; }, [track]);
  useEffect(() => { songMapRef.current = songMap; }, [songMap]);

  /*
    The place in the map (PLAN.md 28g-2, lib/followedPlace.ts). A new one for
    each song and each map (a map arrives after its song, when the first
    listen's analysis is done); the identification's clock restarts it, as
    it did the old clock, and tells the follower where the song was found.
    Fed every reading of the ear, on the ear's clock; read on the tick below.
  */
  //
  // Keyed on the identification's own numbers, not the track object, which
  // is replaced for other reasons (a title filled in): a resync to the clock
  // for nothing would undo what the follower had heard since. A new
  // identification of the same song (a local match every twelve seconds, the
  // service every thirty-five) is news, though: its offset is where the
  // recording is, and a recording played back is where its fingerprint says.
  // While the follower is sure it is not moved by it (a band live is not the
  // recording, and its offset is the record's, not the band's); unsure, it
  // is the best place there is.
  const trackIsrc = track?.isrc ?? null, identifiedAtMs = track?.identifiedAtMs ?? null, offsetSec = track?.offsetSec ?? 0;
  useEffect(() => {
    if (trackIsrc === null || identifiedAtMs === null) { placeRef.current = null; setFollow(null); return; }
    let held = placeRef.current;
    if (!held || held.map !== songMap || held.isrc !== trackIsrc) {
      held = placeRef.current = { place: new FollowedPlace(songMap), map: songMap, isrc: trackIsrc };
    } else if (held.place.at(performance.now() / 1000).sure) return;
    // The score's nudge (PLAN.md 28h) is part of where the song is found: a
    // new identification while the follower is unsure keeps it, as the clock
    // did, rather than putting the song back where the fingerprint says.
    held.place.resync(offsetSec + posClockRef.current.nudge, identifiedAtMs / 1000, performance.now() / 1000);
  }, [trackIsrc, identifiedAtMs, offsetSec, songMap]);
  // Under ?debug, which map the place reads and whether it is hearing, for
  // `npm run followview` to know a line it reads is about the map it stored.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    (window as unknown as { __followed?: () => unknown }).__followed = () => {
      const held = placeRef.current;
      return held ? { isrc: held.isrc, map: held.map?.isrc ?? null, harmony: held.place.following, hops: held.place.hops } : null;
    };
  }, []);
  useEffect(() => {
    if (!onReading) return;
    return onReading((a) => {
      const held = placeRef.current;
      if (held?.place.following && a.features) held.place.hear(a.features, performance.now() / 1000);
    });
  }, [onReading]);
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
    posClockRef.current.forget();
    setNudgeSec(0);
    setPositionSec(identity.offsetSec ?? 0);
    lastPosRef.current = identity.offsetSec ?? 0;
    firedTriggerIdxRef.current = new Set();
    firedGestureIdxRef.current = new Set();
    listenStartMsRef.current = performance.now();

    let state = await getTrackState(identity.isrc);
    if (!state) state = newTrackState(identity.isrc, identity.title, identity.artist);
    else if (!state.title && identity.title) state = { ...state, title: identity.title, artist: identity.artist };

    // Pick (or recall) this track's visualizer preset — deterministic per
    // ISRC, biased by the live audio profile at first identification.
    if (!state.presetId) {
      const a = audioRef.current;
      const profile = a ? {
        energy: Math.min(1, a.energy),
        bass: Math.min(1, a.bass / 70),
        brightness: Math.min(1, a.timbre / 70),
      } : null;
      state = { ...state, presetId: pickPresetForTrack(identity.isrc, profile) };
      await putTrackState(state);
    }
    setTrackState(state);
    presetSeqRef.current++;
    setPresetPick({ seq: presetSeqRef.current, presetId: state.presetId! });

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
  // trimToSec bounds the recording analysis at the actual track boundary —
  // the recorder keeps rolling past the end of a song until silence or the
  // next identification confirms the change.
  const finalizeListen = useCallback(async (reason: 'silence' | 'trackChange' | 'manual', trimToSec?: number) => {
    const currentTrack = trackRef.current;
    const listenMs = performance.now() - listenStartMsRef.current;
    const recording = await recorderRef.current.stop();
    setRecordingActive(false);
    gapPendingRef.current = false;

    if (!currentTrack) return;

    // Generate + cache the song map from the first-listen recording
    if (recording && !songMapRef.current && listenMs > MIN_LISTEN_MS) {
      setAnalyzing(true);
      const generated = await generateSongMap(currentTrack.isrc, recording, {
        title: currentTrack.title, artist: currentTrack.artist,
      }, trimToSec);
      setAnalyzing(false);
      if (generated) {
        const { map, fingerprint } = generated;
        await putSongMap(map);
        if (trackRef.current?.isrc === currentTrack.isrc) setSongMap(map);
        if (fingerprint) addToFpIndex(fingerprint); // the analysis also stored a local recognition fingerprint
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
      posClockRef.current.forget();
      setNudgeSec(0);
    }
  }, [refreshTracks, addToFpIndex]);

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
        const held = placeRef.current;
        const place = held && held.isrc === currentTrack.isrc ? held.place.at(now / 1000) : null;
        const pos = place ? place.positionSec : posClockRef.current.at(currentTrack, now) ?? 0;
        setPositionSec(pos);
        const f = place && place.confidence !== null ? { sure: place.sure, confidence: Math.round(place.confidence * 100) / 100 } : null;
        setFollow(prev => (prev?.sure === f?.sure && prev?.confidence === f?.confidence ? prev : f));

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
        // Replay: re-fire the saved performance's gestures in (lastPos, pos]
        const replayNum = replayListenNumberRef.current;
        if (replayNum != null) {
          const gs = trackStateRef.current?.listens.find(l => l.listenNumber === replayNum)?.gestures;
          if (gs) {
            const batch: GestureEvent[] = [];
            gs.forEach((g, idx) => {
              if (g.t > lastPosRef.current && g.t <= pos && !firedGestureIdxRef.current.has(idx)) {
                firedGestureIdxRef.current.add(idx);
                batch.push(g);
              }
            });
            if (batch.length > 0) {
              gestureSeqRef.current++;
              setGestureFire({ seq: gestureSeqRef.current, gestures: batch });
            }
          }
        }

        lastPosRef.current = pos;
      }

      // End of listen on sustained silence — trim the recording back to when
      // the sound actually stopped
      if (currentTrack && silentFor > SILENCE_END_MS && !busyRef.current) {
        busyRef.current = true;
        const playedSec = Math.max(0, (lastLoudMsRef.current - listenStartMsRef.current) / 1000);
        await finalizeListen('silence', playedSec);
        busyRef.current = false;
        return;
      }

      // A short dip while a track is playing looks like a between-song gap:
      // identify immediately when sound returns instead of waiting out the
      // slow re-check interval, so track changes are caught within seconds.
      if (currentTrack && silentFor > GAP_MS && silentFor < SILENCE_END_MS) {
        gapPendingRef.current = true;
      }
      const soundPresent = !!audio && audio.volume > SILENCE_VOLUME;
      if (gapPendingRef.current && soundPresent) {
        gapPendingRef.current = false;
        lastIdentifyMsRef.current = -Infinity;   // force an identify this tick
        lastLocalMatchMsRef.current = -Infinity; // local matcher goes first
      }

      // ── Local fingerprint match — free and offline, so it runs ahead of
      // the API and on a much faster cadence. Any track heard once before
      // (even manually tagged) is recognized here in seconds.
      const fpIndex = fpIndexRef.current;
      const localGap = currentTrack ? LOCAL_MATCH_INTERVAL_MS : LOCAL_MATCH_RETRY_MS;
      if (fpIndex && fpIndex.trackCount > 0 && soundPresent && !busyRef.current &&
          now - lastLocalMatchMsRef.current > localGap) {
        busyRef.current = true;
        lastLocalMatchMsRef.current = now;
        setIdentifying(true);
        try {
          const snip = await capturePcm(stream, 4);
          const m = snip ? matchSnippet(snip.pcm, snip.sampleRate, fpIndex) : null;
          if (m) {
            lastIdentifyMsRef.current = performance.now(); // matched — hold off the API
            const identity: TrackIdentity = {
              isrc: m.isrc,
              title: m.title ?? 'Unknown',
              artist: m.artist ?? 'Unknown',
              offsetSec: m.offsetSec,
              identifiedAtMs: performance.now(),
              source: 'local',
            };
            if (identity.isrc !== trackRef.current?.isrc) {
              const newStartMs = identity.identifiedAtMs! - identity.offsetSec! * 1000;
              const prevSec = Math.max(0, (newStartMs - listenStartMsRef.current) / 1000);
              await finalizeListen('trackChange', prevSec);
              await adoptTrack(identity, stream);
            } else if (trackRef.current) {
              setTrack({ ...trackRef.current, offsetSec: identity.offsetSec, identifiedAtMs: identity.identifiedAtMs, source: 'local' });
            }
          }
        } finally {
          setIdentifying(false);
          busyRef.current = false;
        }
        return; // one capture per tick — API path picks up on a later tick if needed
      }

      // Identification cadence: as soon as sound is present when nothing is
      // identified yet (then a fast retry loop), slow re-checks once a track
      // is known — those only refine position and catch track changes.
      const identifyGap = currentTrack ? IDENTIFY_INTERVAL_MS : IDENTIFY_RETRY_MS;
      const dueForIdentify = now - lastIdentifyMsRef.current > identifyGap;
      if (fingerprintingAvailable() && dueForIdentify && !busyRef.current && soundPresent) {
        busyRef.current = true;
        lastIdentifyMsRef.current = now;
        setIdentifying(true);
        try {
          const identity = await identify(stream);
          if (identity) {
            if (identity.isrc !== trackRef.current?.isrc) {
              // Trim the previous listen's recording at the point the new
              // track actually started (its match offset tells us when).
              const newTrackStartMs = (identity.identifiedAtMs ?? performance.now()) - (identity.offsetSec ?? 0) * 1000;
              const prevListenSec = Math.max(0, (newTrackStartMs - listenStartMsRef.current) / 1000);
              await finalizeListen('trackChange', prevListenSec);
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
  const section = useMemo(() => readSection(songMap?.sections, { positionSec, sure: follow?.sure ?? false, confidence: follow?.confidence ?? null }), [songMap, positionSec, follow]);
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

  /*
    A nudge is a seek, not playback: what lies between the old position and
    the new is jumped over, so the lyric triggers and a replay's gestures
    (which fire on the span since the last tick) start from where it lands
    instead of firing everything the jump crossed at once. And the new
    position is shown at once rather than on the clock's next half-second
    tick, so two presses read as two.
  */
  const seekBy = useCallback((deltaSec: number) => {
    const clock = posClockRef.current;
    const track = trackRef.current;
    if (!track || !Number.isFinite(deltaSec) || deltaSec === 0) return;
    const now = performance.now();
    clock.at(track, now);
    clock.add(deltaSec);
    // Followed, the nudge moves the place itself (PLAN.md 28g-8): the
    // follower is told the new place, as it is by an identification, so what
    // it hears next steers from there. Added to the clock alone it would be
    // lost to the first sure answer.
    const held = placeRef.current;
    let pos: number | null;
    if (held && held.isrc === track.isrc) {
      pos = Math.max(0, held.place.at(now / 1000).positionSec + deltaSec);
      held.place.resync(pos, now / 1000);
    } else pos = clock.at(track, now);
    setNudgeSec(clock.nudge);
    if (pos !== null) { setPositionSec(pos); lastPosRef.current = pos; }
  }, []);
  const nudgePosition = useCallback((deltaSec: number) => seekBy(deltaSec), [seekBy]);
  /*
    The section nudges are worked out here, from the clock as it reads now,
    not from the position the score was last drawn with: that is up to half a
    second old, and pressed just after the show crossed an edge, "Section
    starts now" would have seen the section before and gone back to its start.
  */
  const nudgeToSection = useCallback((kind: NudgeKind) => {
    const map = songMapRef.current;
    const track = trackRef.current, now = performance.now();
    const held = placeRef.current;
    const pos = track && held && held.isrc === track.isrc ? held.place.at(now / 1000).positionSec : posClockRef.current.at(track, now);
    if (!map || pos === null) return;
    const d = nudgeFor(map, pos, kind);
    if (d !== null) seekBy(d);
  }, [seekBy]);
  const resetNudge = useCallback(() => seekBy(-posClockRef.current.nudge), [seekBy]);

  const replayListenNumberRef = useRef<number | null>(null);
  useEffect(() => { replayListenNumberRef.current = replayListenNumber; }, [replayListenNumber]);

  const replayListen = useCallback((listenNumber: number) => {
    firedGestureIdxRef.current = new Set();
    setReplayListenNumber(listenNumber);
  }, []);
  const stopReplay = useCallback(() => setReplayListenNumber(null), []);

  // ── Performances, started and stopped by hand (lib/performanceTake.ts) ─
  const refreshPerformances = useCallback(() => {
    getAllPerformances().then(all => setSavedPerformances(all.sort((x, y) => y.date.localeCompare(x.date))));
  }, []);
  useEffect(() => { refreshPerformances(); }, [refreshPerformances]);

  /** The song running now, if one is identified, as a performance attaches it. */
  const runningSong = (): TakeSong | null => {
    const tr = trackRef.current;
    const start = songStartMs(tr);
    return tr && start !== null ? { isrc: tr.isrc, title: tr.title, artist: tr.artist, startMs: start } : null;
  };

  const startPerformance = useCallback(() => {
    if (takeRef.current) return;
    const song = runningSong();
    takeRef.current = { startedAtMs: performance.now(), date: new Date().toISOString(), gestures: [], song };
    setLivePerformance({ startedAtMs: takeRef.current.startedAtMs, title: song?.title });
    setLastStop(null);
  }, []);

  const stopPerformance = useCallback(() => {
    const take = takeRef.current;
    if (!take) return;
    takeRef.current = null;
    setLivePerformance(null);
    const song = takeSong(take.song, runningSong());
    if (take.gestures.length === 0) {
      setLastStop({ at: Date.now(), kept: false, gestures: 0, title: song?.title });
      return;
    }
    // Unseeded on purpose (`npm run seed` allows it): a name for a stored take,
    // never on the plate. Seeded, two sessions on one `?seed=` would mint the
    // same id and the second take would overwrite the first.
    const id = `perf-${take.startedAtMs.toFixed(0)}-${Math.random().toString(36).slice(2, 8)}`;
    const perf = finishTake(take.gestures, take.startedAtMs, performance.now(), song, id, take.date);
    putPerformance(perf).then(ok => {
      setLastStop({ at: Date.now(), kept: ok, gestures: perf.gestures.length, title: perf.title });
      refreshPerformances();
    });
  }, [refreshPerformances]);

  const recordGesture = useCallback((g: Omit<GestureEvent, 't'>) => {
    const take = takeRef.current;
    if (!take) return;
    if (take.gestures.length >= 20000) return; // twenty minutes of continuous painting
    take.gestures.push({ t: (performance.now() - take.startedAtMs) / 1000, ...g });
    // A song identified after the start is attached when it stops; say so now.
    if (!take.song) {
      const tr = trackRef.current;
      if (tr?.title) setLivePerformance(l => (l && l.title !== tr.title ? { ...l, title: tr.title } : l));
    }
  }, []);

  // Replay: its own clock (replayPosition), so it plays with the song when
  // the song is on and on its own when it is not, music layer or no.
  const perfReplayRef = useRef<{ perf: SavedPerformance; startMs: number; last: number; fired: Set<number>; end: number } | null>(null);
  const replayPerformance = useCallback((id: string) => {
    const perf = savedPerformances.find(p => p.id === id);
    if (!perf) return;
    const now = performance.now();
    const last = replayPosition(perf, now, now, trackRef.current) - 0.001;
    perfReplayRef.current = { perf, startMs: now, last, fired: new Set(), end: Math.max(0, ...perf.gestures.map(g => g.t)) };
    setReplayingPerformance(perf);
  }, [savedPerformances]);
  const stopPerformanceReplay = useCallback(() => { perfReplayRef.current = null; setReplayingPerformance(null); }, []);
  useEffect(() => {
    if (!replayingPerformance) return;
    const tick = window.setInterval(() => {
      const r = perfReplayRef.current;
      if (!r) return;
      const pos = replayPosition(r.perf, r.startMs, performance.now(), trackRef.current);
      const batch = dueGestures(r.perf.gestures, r.last, pos, r.fired);
      r.last = Math.max(r.last, pos);
      if (batch.length > 0) {
        gestureSeqRef.current++;
        setGestureFire({ seq: gestureSeqRef.current, gestures: batch });
      }
      if (r.fired.size >= r.perf.gestures.length || pos > r.end + 2) stopPerformanceReplay();
    }, 100);
    return () => window.clearInterval(tick);
  }, [replayingPerformance, stopPerformanceReplay]);

  const deletePerformance = useCallback((id: string) => {
    if (perfReplayRef.current?.perf.id === id) stopPerformanceReplay();
    dbDeletePerformance(id).then(refreshPerformances);
  }, [refreshPerformances, stopPerformanceReplay]);

  const performanceState = useMemo<PerformanceState>(() => ({
    live: livePerformance, saved: savedPerformances,
    replayingId: replayingPerformance?.id ?? null, lastStop,
  }), [livePerformance, savedPerformances, replayingPerformance, lastStop]);

  return {
    state: {
      track, songMap, lyrics, trackState, positionSec, nudgeSec, follow, section, line,
      sectionSentimentValue, identifying, recording: recordingActive, analyzing,
      fingerprintEnabled: fingerprintingAvailable(), replayListenNumber, allTracks,
    },
    overrides, harmonyIndex, trigger, presetPick, gestureFire, performance: performanceState,
    recordGesture, startPerformance, stopPerformance, replayPerformance, stopPerformanceReplay, deletePerformance,
    manualTag, clearTrack, replayListen, stopReplay, refreshTracks,
    nudgePosition, nudgeToSection, resetNudge,
  };
}
