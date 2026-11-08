import { useCallback, useEffect, useRef, useMemo, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { type SongAction, type SongShow, titleRows, showFor, type ActionWhen, type ActionWhat, newId, pourGesture } from '../lib/songShows';
import { setSongCueSink } from './songCue';
import { unhandled } from '../lib/unhandled';
import { useSongShows } from '../hooks/useSongShows';
import { PRESETS } from '../presets';
import type { SongScoreProps } from '../components/SongScore';
import { songLabel, type SongRef } from '../lib/songRef';
import { songDuration } from '../lib/songScore';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';
import type { MidiAction } from '../lib/midi';
import type { VisualizerSettings } from '../types';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { useUserPresets } from '../hooks/useUserPresets';

/**
 * A song's show while it plays (`hooks/useSongShows.ts`): its actions done
 * through the same moves a pad or a key makes, and the score the Songs panel
 * draws, with the cues pinned to it.
 */
interface SongScoreDeps {
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  goLookNow: (presetId: string, seconds?: number) => void;
  runActionRef: RefObject<((a: MidiAction) => void) | null>;
  setSettings: Dispatch<SetStateAction<VisualizerSettings>>;
  glideSetting: (key: keyof VisualizerSettings, to: number, seconds: number, atEnd?: Partial<VisualizerSettings> | undefined) => void;
  songShows: SongShow[];
  followSongs: boolean;
  designing: boolean;
  renderHold: boolean;
  musicIntel: MusicIntelResult;
  isActive: boolean;
  currentSong: SongRef | null;
  songShowsRef: RefObject<SongShow[]>;
  setSongShows: (next: SongShow[]) => void;
  activePresetId: string | null;
  pinnedPresetId: string | null;
  userPresets: ReturnType<typeof useUserPresets>;
  tempoLabel: { source: string | null; bpm: number; taps: number; };
}

/** How many actions the owner's assistant may add to one song's show (PLAN 44f). */
const ASSISTANT_SONG_ACTIONS = 24;

export function useSongScore({
  wallRef, goLookNow, runActionRef, setSettings, glideSetting, songShows, followSongs, designing,
  renderHold, musicIntel, isActive, currentSong, songShowsRef, setSongShows, activePresetId,
  pinnedPresetId, userPresets, tempoLabel,
}: SongScoreDeps) {
  // ── Songs: the runtime ──────────────────────────────────────────
  /** Do one of a song's actions, through the same moves a pad or a key makes. */
  const performSongAction = useCallback((action: SongAction, show: SongShow) => {
    const a = action.what;
    const v = wallRef.current;
    switch (a.do) {
      case 'look': goLookNow(a.look.id, a.fade); break;
      case 'drain': runActionRef.current?.('drain'); break;
      case 'clear': runActionRef.current?.('clear'); break;
      case 'seed': runActionRef.current?.('seed'); break;
      case 'burst': v?.applyGesture({ tool: 'press', x: 0.5, y: 0.5, layer: 0, amount: 1 }); break;
      case 'zoom':
        if (a.zoom > 1.05) { setSettings(p => ({ ...p, macroMode: true })); glideSetting('macroZoom', a.zoom, a.over); }
        else glideSetting('macroZoom', 1, a.over, { macroMode: false });
        break;
      case 'kaleidoscope': setSettings(p => ({ ...p, kaleidoscope: a.folds })); break;
      case 'dyes': v?.stepDyes(); break;
      case 'blackout': glideSetting('dimmer', 0, a.over); break;
      case 'lights-up': glideSetting('dimmer', 1, a.over); break;
      case 'set': glideSetting(a.key, a.value, a.over); break;
      // In an ink that reads against the plate as it is: a title poured into a
      // full, bright plate in the look's own dye does not show.
      case 'title': v?.pourText(titleRows(show.song), { colour: 'contrast' }); break;
      case 'signoff': v?.pourText([{ text: 'ChromaGlass', weight: 1 }], { colour: 'contrast' }); break;
      // A drop of this dye, as a pad's Drop lays it (lib/songShows.ts pourGesture).
      case 'pour': v?.applyGesture(pourGesture(a, (x, y) => v.wallToPlate(x, y, 0, true))); break;
      // A show that names something this build cannot do says so, rather
      // than running the stage and appearing to have done it.
      default: unhandled("a song show's action", a);
    }
  }, [glideSetting, goLookNow]);

  const songRuntime = useSongShows({
    shows: songShows,
    // Not while a look is being built: Design is where settings are chosen by hand.
    // Nor while a song is being rendered: the render plays the look on the plate (hooks/useSongRender.ts).
    follow: followSongs && !designing && !renderHold,
    track: musicIntel.state.track,
    positionSec: musicIntel.state.positionSec,
    positionNow: musicIntel.positionNow,
    songMap: musicIntel.state.songMap,
    isActive,
    kicks: () => wallRef.current?.kicks() ?? 0,
    applyLook: (show, fade) => goLookNow(show.look.id, fade),
    perform: performSongAction,
  });
  const songRuntimeRef = useRef(songRuntime);
  songRuntimeRef.current = songRuntime;

  /*
    The score (PLAN 28h): the song as a timeline, its show's cues on it, and
    the nudge. One set of props for the desk's Score panel and the phone's Play
    sheet, so a cue pinned on either lands in the same song show.

    A cue pinned to a song that has no show yet makes one, named for the look
    that is playing, for the song's next play. It starts at once (Follow
    songs) without fading to that look: the person pinned a burst on a chorus,
    not a look change, and the plate may be a look no saved one matches (a
    slider moved, a fader ridden), which a fade would take back.
  */
  const currentShow = useMemo(() => showFor(songShows, currentSong), [songShows, currentSong]);
  const pinScoreCue = useCallback((when: ActionWhen, what: ActionWhat, idPrefix = 'act') => {
    if (!currentSong) return;
    const action: SongAction = { id: newId(idPrefix), when, what };
    const shows = songShowsRef.current;
    const existing = showFor(shows, currentSong);
    if (existing) { setSongShows(shows.map(s => (s.id === existing.id ? { ...s, actions: [...s.actions, action] } : s))); return; }
    const lookId = activePresetId ?? pinnedPresetId ?? 'classic';
    const saved = userPresets.presets.find(u => u.id === lookId);
    const preset = PRESETS.find(q => q.id === lookId) ?? PRESETS.find(q => q.id === 'classic');
    const look = saved ? { kind: 'saved' as const, id: saved.id, name: saved.name } : { kind: 'preset' as const, id: preset?.id ?? 'classic', name: preset?.name };
    const id = newId('song');
    songRuntimeRef.current.keepLook(id);
    setSongShows([...shows, { id, song: currentSong, look, actions: [action] }]);
  }, [currentSong, setSongShows, activePresetId, pinnedPresetId, userPresets.presets]);
  /*
    The owner's assistant's song actions (PLAN 44f, app/songCue.ts) land as a
    pinned cue does. With no song playing there is no show to put it in, and
    the assistant is told so rather than the action being kept for a song
    nobody named. Its actions carry ids of their own (`asst-`), and it adds
    no more than ASSISTANT_SONG_ACTIONS to one song's show: one in a loop must
    not grow the saved shows without end, nor stack a hundred pours on one
    second of the song (the guard paces the adding, not the firing).
  */
  const pinRef = useRef(pinScoreCue);
  pinRef.current = pinScoreCue;
  const songRef = useRef(currentSong);
  songRef.current = currentSong;
  useEffect(() => {
    setSongCueSink((when, what) => {
      if (!songRef.current) return 'no song is playing: the action goes into the show of the song playing now';
      const mine = showFor(songShowsRef.current, songRef.current)?.actions.filter(x => x.id.startsWith('asst-')).length ?? 0;
      if (mine >= ASSISTANT_SONG_ACTIONS) return `the assistant has already added ${ASSISTANT_SONG_ACTIONS} actions to this song's show`;
      pinRef.current(when, what, 'asst');
      return null;
    });
    return () => setSongCueSink(null);
  }, [songShowsRef]);
  const removeScoreCue = useCallback((actionId: string) => {
    setSongShows(songShowsRef.current.map(s => (s.actions.some(a => a.id === actionId) ? { ...s, actions: s.actions.filter(a => a.id !== actionId) } : s)));
  }, [setSongShows]);
  const { nudgePosition, nudgeToSection, resetNudge } = musicIntel;
  const scoreProps = useMemo<SongScoreProps>(() => ({
    songName: currentSong ? songLabel(currentSong) : null,
    map: musicIntel.state.songMap,
    phase: !musicIntel.state.track ? 'none'
      : musicIntel.state.songMap ? 'ready'
      : musicIntel.state.analyzing ? 'analyzing'
      : musicIntel.state.recording ? 'hearing' : 'unmapped',
    positionSec: musicIntel.state.positionSec,
    nudgeSec: musicIntel.state.nudgeSec,
    bpm: tempoLabel.bpm,
    durationSec: songDuration(musicIntel.state.track?.durationSec, currentShow?.song.durationSec, musicIntel.state.songMap?.durationSec),
    show: currentShow,
    // The song's clock, which a followed show and the sequencer's section
    // stages read. A show started by hand keeps its own (PLAN 28h-4).
    onNudge: nudgePosition,
    onNudgeToSection: nudgeToSection,
    onResetNudge: resetNudge,
    onPin: pinScoreCue,
    onRemoveCue: removeScoreCue,
  }), [currentSong, musicIntel.state.songMap, musicIntel.state.track, musicIntel.state.analyzing, musicIntel.state.recording,
    musicIntel.state.positionSec, musicIntel.state.nudgeSec, tempoLabel.bpm, currentShow, nudgePosition, nudgeToSection, resetNudge, pinScoreCue, removeScoreCue]);

  return {
    songRuntime, songRuntimeRef, scoreProps,
  };
}
