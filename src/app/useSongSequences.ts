import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { sameSong, type SongRef } from '../lib/songRef';
import type { SetItem, SetList } from '../lib/setList';
import type { UserPreset } from '../lib/userPresets';
import type { ArmedLook } from './shared';
import type { MusicIntelResult } from '../hooks/useMusicIntelligence';
import type { useShowSequencer } from '../hooks/useShowSequencer';
import type { useUserPresets } from '../hooks/useUserPresets';

/**
 * Files made for a song: when a song is identified, the set item, the
 * sequence or the preset made for it goes up; a sequence started for a song
 * stops when the song ends or another takes its place.
 *
 * Moved whole out of `App()` (PLAN 28h-8): Listen (`useListen.ts`) designs a
 * sequence for the song playing and has to start it as this does, marked as
 * the song's, so that the song's end stops it. App.tsx is over the size
 * budget (`npm run sizes`) and may not grow, so the run of App's statements
 * that owns "the sequence running for this song" came here with its comments,
 * and `startSongSequence` is the one door into it.
 */
interface SongSequencesDeps {
  musicIntel: MusicIntelResult;
  currentSong: SongRef | null;
  sequencer: ReturnType<typeof useShowSequencer>;
  setListRef: RefObject<SetList>;
  lookOfItem: (item: SetItem) => ArmedLook | null;
  sendLook: (next: ArmedLook, seconds: number) => void;
  fadeSeconds: number;
  userPresets: ReturnType<typeof useUserPresets>;
  applyUserPreset: (p: UserPreset) => void;
}

export function useSongSequences({
  musicIntel, currentSong, sequencer, setListRef, lookOfItem, sendLook, fadeSeconds, userPresets, applyUserPreset,
}: SongSequencesDeps) {
  // When a song is identified, a sequence made for it starts at the right
  // point in it and a preset made for it is applied; when the song ends or
  // another takes its place, a song-bound sequence stops.
  const songBoundRef = useRef<string | null>(null);   // the sequence running for the current song
  const lastSongKey = useRef<string | null>(null);
  useEffect(() => {
    const key = musicIntel.state.track ? `${musicIntel.state.track.isrc}|${musicIntel.state.track.title}|${musicIntel.state.track.artist}` : null;
    if (key === lastSongKey.current) return;
    lastSongKey.current = key;
    const song = currentSong;
    const running = sequencer.status.sequenceId;
    if (songBoundRef.current && (running === songBoundRef.current) && !sameSong(sequencer.sequences.find(q => q.id === running)?.song, song)) {
      sequencer.stop();
      songBoundRef.current = null;
    }
    if (!song) return;
    // A set item made for this song goes up on its own, at its own fade.
    const setHit = setListRef.current.items.find(i => sameSong(i.song, song));
    const setLook = setHit ? lookOfItem(setHit) : null;
    if (setLook) { sendLook(setLook, setLook.fade ?? fadeSeconds); return; }
    const seq = sequencer.sequences.find(q => sameSong(q.song, song));
    if (seq) {
      sequencer.startAt(seq.id, musicIntel.state.positionSec);
      songBoundRef.current = seq.id;
      return;
    }
    const up = userPresets.presets.find(p => sameSong(p.song, song));
    if (up) applyUserPreset(up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicIntel.state.track, currentSong]);
  // The song ran out: stop its sequence rather than looping into the next song.
  useEffect(() => {
    const id = songBoundRef.current;
    if (!id || sequencer.status.sequenceId !== id) return;
    const seq = sequencer.sequences.find(q => q.id === id);
    const dur = seq?.song?.durationSec;
    if (dur && musicIntel.state.positionSec > dur + 2) { sequencer.stop(); songBoundRef.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicIntel.state.positionSec]);

  /**
   * Start a sequence made for the song playing, at the song's place now, as
   * the identification above would have: Listen designed it after the song
   * was named. Marked as the song's, so the song's end stops it.
   */
  const seqRef = useRef(sequencer);
  seqRef.current = sequencer;
  const { positionNow } = musicIntel;
  const startSongSequence = useCallback((id: string) => {
    seqRef.current.startAt(id, positionNow());
    songBoundRef.current = id;
  }, [positionNow]);

  return { startSongSequence };
}
