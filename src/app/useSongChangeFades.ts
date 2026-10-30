import { useSongChange } from '../hooks/useSongChange';
import { useRef, useEffect, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { songRefFromTrack, sameSong } from '../lib/songRef';
import { showFor, type SongShow } from '../lib/songShows';
import { evolvedLook } from '../lib/lookFade';
import { luckyLook } from '../lib/lucky';
import { stream } from '../lib/rng';
import { PRESETS } from '../presets';
import type { Ear } from '../hooks/useAudioAnalyzer';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { VisualizerSettings, LiquidType } from '../types';
import type { useShowSequencer } from '../hooks/useShowSequencer';
import type { useUserPresets } from '../hooks/useUserPresets';

/**
 * A new song, a new look (PLAN 14z): heard as a gap between tracks or named
 * by track identification, landed on a beat, and faded to the song's own show,
 * the next look in the set or a new palette, as the settings say. The sequencer
 * owns the evolution while it runs, so it is left alone then.
 */
interface SongChangeFadesDeps {
  ear: Ear;
  musicIntel: MusicIntelResult;
  settings: VisualizerSettings;
  isActive: boolean;
  renderHold: boolean;
  fadeSeconds: number;
  sequencer: ReturnType<typeof useShowSequencer>;
  designing: boolean;
  userPresets: ReturnType<typeof useUserPresets>;
  followSongs: boolean;
  songShowsRef: RefObject<SongShow[]>;
  settingsRef: RefObject<VisualizerSettings>;
  previousLook: RefObject<{ id: string | null; settings: VisualizerSettings; } | null>;
  pinnedPresetId: string | null;
  setPinnedPresetId: Dispatch<SetStateAction<string | null>>;
  fadeSettingsTo: (to: VisualizerSettings, seconds: number, back?: boolean, hold?: readonly string[], swapsRing?: boolean) => void;
  liquidTypesRef: RefObject<LiquidType[]>;
  activePresetId: string | null;
  adoptPreset: (presetId: string) => void;
}

export function useSongChangeFades({
  ear, musicIntel, settings, isActive, renderHold, fadeSeconds, sequencer, designing, userPresets,
  followSongs, songShowsRef, settingsRef, previousLook, pinnedPresetId, setPinnedPresetId,
  fadeSettingsTo, liquidTypesRef, activePresetId, adoptPreset,
}: SongChangeFadesDeps) {
  // ── A new song, a new look ──────────────────────────────────────
  // Heard as a gap between tracks, or named by track identification, on the
  // ear's own clock and landed on a beat (PLAN 14z). The sequencer owns the
  // evolution while it runs, so it is left alone then.
  const songChange = useSongChange(ear.onReading, musicIntel.state.track?.isrc ?? null, settings.onNewSong !== 'off' && isActive && !renderHold);
  /*
    How long the new song's look takes to come in, by how the song came.

    After a gap the new song starts clean and the change lands on one of its
    first beats, so it comes in quickly: a second, short enough to read as the
    show answering the song and long enough not to read as a cut. Named by
    identification, the new song has been playing for several seconds already
    (a crossfade, or a gapless join; `npm run songends` measures 6 to 17 s at the
    median), so the look blends in under it instead: twice the desk's fade,
    and never under four seconds. Both were a fixed desk fade at whatever
    moment the gap rule happened to fire.
  */
  const songFadeSeconds = (reason: 'gap' | 'track') => reason === 'gap' ? 1 : Math.max(4, fadeSeconds * 2);
  const lastSongChangeSeq = useRef(0);
  useEffect(() => {
    if (!songChange || songChange.seq === lastSongChangeSeq.current) return;
    lastSongChangeSeq.current = songChange.seq;
    const mode = settings.onNewSong ?? 'off';
    if (mode === 'off' || sequencer.status.running) return;
    // Nor does a new song get to replace a look while it is being built. The
    // sequencer is suspended in Design for the same reason; this is the other
    // thing that rewrites the settings without being asked.
    if (designing) return;
    // A preset or sequence made for the song that just started takes precedence.
    const song = musicIntel.state.track ? songRefFromTrack(musicIntel.state.track) : null;
    if (song && (userPresets.presets.some(p => sameSong(p.song, song)) || sequencer.sequences.some(q => sameSong(q.song, song)))) return;
    // And so does a song's own show, when the Songs sheet is following songs.
    if (song && followSongs && showFor(songShowsRef.current, song)) return;
    /*
      A look change nobody asked for behaves differently from one somebody
      pressed, in three ways that were all the same bug wearing three hats.

      It used to reach for `applyPreset`, which **clears every layer and
      reseeds** — right when you are building a look on clean glass, wrong
      when a song ends in front of a room, because it takes the dye with it.
      It now adopts: the new look's dyes, injection styles and liquids, with
      the plate left where it is.

      It used to snap all eighty settings at once. It fades now, at the same
      fade the desk's Go uses.

      And it used to carry the structure — so a song boundary could put an LED
      wheel on the plate, or a second layer, or fold the picture into a
      kaleidoscope. Those have no halfway, so fading cannot soften them; they
      are held instead. See `STRUCTURE` in `lookFade.ts`. Structure holds,
      character drifts.
    */
    const from = settingsRef.current;
    if (mode === 'random') {
      previousLook.current = { id: pinnedPresetId, settings: from };
      setPinnedPresetId(null);
      // The song boundary's own stream, not Lucky's default: a Lucky press
      // between songs must not decide which look the next song brings.
      fadeSettingsTo(evolvedLook(from, luckyLook(from, liquidTypesRef.current.map(t => t.color), stream('show.newSong').float)), songFadeSeconds(songChange.reason));
      return;
    }
    const pool = PRESETS.filter(p => !p.settings.macroMode && p.id !== activePresetId);
    // Which look a song boundary brings is on the plate for the whole song:
    // seeded (lib/rng.ts), on a stream of its own so Lucky presses between
    // songs do not decide it.
    const next = stream('show.newSong').pick(pool);
    if (!next) return;
    previousLook.current = { id: pinnedPresetId, settings: from };
    adoptPreset(next.id);
    fadeSettingsTo(evolvedLook(from, next.settings), songFadeSeconds(songChange.reason));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songChange?.seq]);

  return {
    songChange,
  };
}
