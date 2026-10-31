import { useState, useRef, useCallback, useEffect } from 'react';
import type { Track } from '../lib/musicLibrary';
import { type Drone, type DroneParams, DRONE_DEFAULTS } from '../lib/plateDrone';
import { type AudioSource, AUDIO_INPUT_KEY } from './shared';

/**
 * What the show listens to, as state: the source, the input it opens, the
 * music file and the shelf, the plate drone, the Sound panel.
 *
 * The actions that change it (opening the microphone, starting the band, the
 * music player) are `useSoundSource`, called further down App: in App they came
 * after the overlay, the song line and the pour, which read none of them, and
 * each half stays where it was so the order React calls App's hooks in, and so
 * the order its effects run in, is the order it was before the split.
 */
export function useSoundState() {
  const [audioSource, setAudioSource] = useState<AudioSource>('none');
  /** For the first-gesture handler, which is installed once and must not close over a stale value. */
  const audioSourceRef = useRef(audioSource);
  audioSourceRef.current = audioSource;
  // ── The input the show listens to ──
  // A USB interface fed from the desk beats the laptop's own microphone in
  // any room with a crowd in it. The choice is remembered; the list of
  // inputs needs microphone permission before the browser names them.
  const [audioInputId, setAudioInputId] = useState<string>(() => { try { return localStorage.getItem(AUDIO_INPUT_KEY) ?? ''; } catch { return ''; } });
  const [audioInputs, setAudioInputs] = useState<{ id: string; label: string }[]>([]);
  const refreshAudioInputs = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(devs.filter(d => d.kind === 'audioinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` })));
    } catch { /* no device access */ }
  }, []);
  useEffect(() => {
    void refreshAudioInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshAudioInputs);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshAudioInputs);
  }, [refreshAudioInputs]);
  // ── A music file, played here ──
  // The straightest signal there is: no room, no microphone, no loopback
  // driver. The element plays to the speakers and its stream feeds the show.
  const [musicFile, setMusicFile] = useState<
    { name: string; url: string; objectUrl: boolean; track?: Track } | null>(null);
  /*
    A track that ends does not end the room.

    The element had no `loop` and `onEnded` only cleared the playing flag, so
    one file played once and the show went quiet — fine for judging a single
    song, useless for a projector that has to hold a room all afternoon. A
    library track hands over to the next one and wraps; a file somebody
    brought themselves repeats, because there is nothing to hand over to.
  */
  const playTrackRef = useRef<(t: Track) => void>(() => {});
  const [musicLoop, setMusicLoop] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);
  /*
    Sound is a tab, because the strip it used to live in could not be found.

    The audio sources were gated on `showControls && !showSettings && !deskUp`:
    they hid when Settings opened, and hid again whenever either desk was up,
    which is where the work happens. A shelf of music shipped into that strip
    and the owner reported not being able to see any of it, which is the right
    outcome for a control nobody can reach.
  */
  const [showSound, setShowSound] = useState(false);
  const droneRef = useRef<Drone | null>(null);
  const [droneParams, setDroneParams] = useState<DroneParams>(DRONE_DEFAULTS);
  /** Whether the plate's instrument is sounding: it can be stopped without choosing another source. */
  const [droneRunning, setDroneRunning] = useState(false);
  /**
   * Silence the plate's instrument. It owns an AudioContext and running
   * oscillators, and sounds into the room as well as into its stream, so
   * dropping the stream alone left it playing under whatever came next
   * (reported: starting a track on the shelf or a file of one's own did not
   * stop it).
   */
  const stopDrone = useCallback(() => {
    if (droneRef.current) { droneRef.current.stop(); droneRef.current = null; }
    setDroneRunning(false);
  }, []);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTime, setMusicTime] = useState({ t: 0, d: 0 });
  const musicElRef = useRef<HTMLAudioElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const musicCtxRef = useRef<{ ctx: AudioContext; src: MediaElementAudioSourceNode; dest: MediaStreamAudioDestinationNode } | null>(null);

  return {
    audioSource, setAudioSource, audioSourceRef, audioInputId, setAudioInputId, audioInputs,
    refreshAudioInputs, musicFile, setMusicFile, playTrackRef, musicLoop, setMusicLoop, libraryOpen,
    setLibraryOpen, showSound, setShowSound, droneRef, droneParams, setDroneParams, droneRunning,
    setDroneRunning, stopDrone, musicPlaying, setMusicPlaying, musicTime, setMusicTime, musicElRef,
    musicInputRef, musicCtxRef,
  };
}
