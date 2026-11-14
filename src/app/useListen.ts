import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  DESIGNED_SEQUENCE, LISTEN_IDLE, designFromMap, listenLine, listenStep, startListening, withDesign,
  type ListenControl, type ListenState,
} from '../lib/songDesign';
import { showFor, newId, type SongShow } from '../lib/songShows';
import { sameSong } from '../lib/songRef';
import type { ShowSequence } from '../lib/sequencer';
import type { AudioSource } from './shared';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { useShowSequencer } from '../hooks/useShowSequencer';
import type { useUserPresets } from '../hooks/useUserPresets';
import type { SongShowRuntime } from '../hooks/useSongShows';
import { lookPlaying } from './useSongScore';
import { publishListen, setDetectorDoor, setListenDoor } from './earNow';

/**
 * Listen, in the Songs panel (PLAN 28h-8, `lib/songDesign.ts`): one press
 * names the song playing, adds it to the list with what the song ID knows of
 * it, and designs its show (a stage sequence made for it and cues on its
 * show) once the show has heard it through.
 *
 * The press makes sure the show can hear (the microphone when nothing is
 * chosen, the song ID on, Follow songs on so the show it designs plays) and
 * asks the song ID to try now. The rest is `listenStep`, run on every change
 * of what the ear knows, with its answers carried out here: a song show added
 * for the song (taking the look that is up, and not fading to it), and the
 * design written into it and into the sequencer. Nothing here recognises or
 * maps anything: that is `useMusicIntelligence`'s, as it always was.
 */

interface ListenDeps {
  musicIntel: MusicIntelResult;
  audioSource: AudioSource;
  handleSourceChange: (source: AudioSource) => Promise<void> | void;
  musicEnabled: boolean;
  updateMusicSettings: (partial: { enabled: boolean }) => void;
  followSongs: boolean;
  setFollowSongs: (on: boolean) => void;
  songShowsRef: RefObject<SongShow[]>;
  setSongShows: (next: SongShow[]) => void;
  songRuntimeRef: RefObject<Pick<SongShowRuntime, 'keepLook'>>;
  sequencer: ReturnType<typeof useShowSequencer>;
  startSongSequence: (id: string) => void;
  activePresetId: string | null;
  pinnedPresetId: string | null;
  userPresets: ReturnType<typeof useUserPresets>;
}

export function useListen(d: ListenDeps): ListenControl {
  const [state, setState] = useState<ListenState>(LISTEN_IDLE);
  const [showId, setShowId] = useState<string | null>(null);
  const dRef = useRef(d);
  dRef.current = d;
  // A sequence written this render is in the sequencer's list on the next:
  // started then, if its song is the one playing (`startSongSequence`).
  const pendingStart = useRef<{ id: string; firstStage: string } | null>(null);

  // The give-up needs a clock while nothing else changes.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state.phase !== 'listening') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [state.phase]);

  const { track, songMap, heardMap, analyzing } = d.musicIntel.state;
  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'designed' || state.phase === 'short') return;
    const r = listenStep(state, { now: performance.now(), track, songMap, heardMap, analyzing });
    let next = r.state;
    const x = dRef.current;
    const shows0 = x.songShowsRef.current ?? [];
    let shows = shows0;
    if (r.heard) {
      const had = showFor(shows, r.heard);
      if (had) setShowId(had.id);
      else {
        const show: SongShow = { id: newId('song'), song: r.heard, look: lookPlaying(x.activePresetId, x.pinnedPresetId, x.userPresets.presets), actions: [] };
        // It starts at once with Follow on: in the look that is up, not a fade to it.
        x.songRuntimeRef.current?.keepLook(show.id);
        shows = [...shows, show];
        setShowId(show.id);
      }
    }
    if (r.design && next.song) {
      const song = next.song;
      const design = designFromMap(r.design);
      shows = shows.map((s) => (sameSong(s.song, song) ? { ...s, actions: withDesign(s.actions, design.actions) } : s));
      const had = x.sequencer.sequences.find((q) => !q.builtIn && sameSong(q.song, song));
      const own = !!had && !had.id.startsWith(DESIGNED_SEQUENCE);
      if (!own && design.stages.length) {
        const seq: ShowSequence = {
          id: had?.id ?? `${DESIGNED_SEQUENCE}${Date.now().toString(36)}`,
          name: `${song.title} (Listen)`,
          description: `Designed by Listen from what the show heard of ${song.title}: one stage per section of the song.`,
          loop: false,
          stages: design.stages,
          song,
        };
        x.sequencer.upsertSequence(seq);
        if (track && track.isrc === next.isrc) pendingStart.current = { id: seq.id, firstStage: seq.stages[0].id };
      }
      next = { ...next, phase: 'designed', stages: own ? 0 : design.stages.length, cues: design.actions.length, ownSequence: own };
    }
    if (shows !== shows0) x.setSongShows(shows);
    if (next !== state) setState(next);
  }, [state, track, songMap, heardMap, analyzing, tick]);

  useEffect(() => {
    const p = pendingStart.current;
    if (!p) return;
    const seq = d.sequencer.sequences.find((q) => q.id === p.id);
    if (seq?.stages[0]?.id !== p.firstStage) return;
    pendingStart.current = null;
    d.startSongSequence(p.id);
  }, [d.sequencer.sequences, d.startSongSequence]);

  const start = useCallback(() => {
    const x = dRef.current;
    if (x.audioSource === 'none') void x.handleSourceChange('microphone');
    if (!x.musicEnabled) x.updateMusicSettings({ enabled: true });
    if (!x.followSongs) x.setFollowSongs(true);
    x.musicIntel.listenNow();
    setShowId(null);
    setState(startListening(performance.now()));
  }, []);
  const cancel = useCallback(() => setState(LISTEN_IDLE), []);
  const tag = useCallback((title: string, artist: string) => {
    if (!title.trim() || !artist.trim()) return;
    setState(startListening(performance.now()));
    dRef.current.musicIntel.manualTag(artist.trim(), title.trim());
  }, []);

  const line = listenLine(state, d.musicIntel.state.fingerprintEnabled);
  /*
    The detector and Listen for the owner's assistant (app/earNow.ts, PLAN
    44k-10): the Sound panel's Song Detection switch and this panel's own
    Listen, Cancel and Name it, set once (the callbacks above never change,
    and the switch reads this render's through dRef); and what they are now,
    published when either changes.
  */
  useEffect(() => {
    setDetectorDoor((on) => dRef.current.updateMusicSettings({ enabled: on }));
    setListenDoor({ start, cancel, tag });
    return () => { setDetectorDoor(null); setListenDoor(null); };
  }, [start, cancel, tag]);
  useEffect(() => { publishListen(d.musicEnabled, state.phase, state.song, line); }, [d.musicEnabled, state.phase, state.song, line]);

  return { state, line, showId, start, cancel, tag };
}
