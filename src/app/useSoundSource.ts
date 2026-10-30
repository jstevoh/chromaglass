import { useRef, useState, useCallback, useEffect, type Dispatch, type SetStateAction, type RefObject } from 'react';
import { startPlateDrone, PLATE_PLACES, type DroneParams, type Drone } from '../lib/plateDrone';
import { startSimulatedMusic, type SimulatedMusic } from '../lib/simulatedMusic';
import type { Track } from '../lib/musicLibrary';
import { isDesktopApp } from '../lib/platform';
import { startSystemTap, type SystemTap } from '../lib/systemTap';
import { type AudioSource, AUDIO_SOURCE_KEY, AUDIO_INPUT_KEY } from './shared';
import type { LiquidVisualizerHandle } from '../components/LiquidVisualizer';

function rememberedSource(): AudioSource {
  try {
    const raw = sessionStorage.getItem(AUDIO_SOURCE_KEY);
    // 'file' needs a file nobody has chosen yet, and 'system' opens a picker in a browser (never in the Mac app).
    if (raw === 'microphone' || raw === 'simulated' || (raw === 'system' && isDesktopApp())) return raw;
  } catch { /* private */ }
  return 'none';
}

/** True only if the browser will hand over the microphone without asking. */
async function micAlreadyAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: 'microphone' as PermissionName });
    return status?.state === 'granted';
  } catch {
    // Firefox has no microphone descriptor for the Permissions API. Better to
    // wait for a click than to guess and prompt.
    return false;
  }
}

/**
 * Changing what the show hears: the microphone or an interface, the
 * computer's own sound, a music file or the shelf, the simulated band, the
 * plate's drone, and the music player's controls.
 *
 * `handleSourceChange` is the one door all of them go through, so a source
 * that is replaced is always stopped first, and an older request that resolves
 * late (a permission prompt answered after a second click) cannot overwrite a
 * newer one (PLAN 14s). Its state is `useSoundState`'s.
 */
interface SoundSourceDeps {
  audioStream: MediaStream | null;
  audioInputId: string;
  setAudioStream: Dispatch<SetStateAction<MediaStream | null>>;
  simulatedRef: RefObject<SimulatedMusic | null>;
  stopDrone: () => void;
  setAudioSource: Dispatch<SetStateAction<AudioSource>>;
  musicElRef: RefObject<HTMLAudioElement | null>;
  wallRef: RefObject<LiquidVisualizerHandle | null>;
  droneParams: DroneParams;
  droneRef: RefObject<Drone | null>;
  setDroneRunning: Dispatch<SetStateAction<boolean>>;
  refreshAudioInputs: () => Promise<void>;
  setDroneParams: Dispatch<SetStateAction<DroneParams>>;
  setAudioInputId: Dispatch<SetStateAction<string>>;
  audioSourceRef: RefObject<AudioSource>;
  musicCtxRef: RefObject<{ ctx: AudioContext; src: MediaElementAudioSourceNode; dest: MediaStreamAudioDestinationNode; } | null>;
  musicFile: { name: string; url: string; objectUrl: boolean; track?: Track | undefined; } | null;
  setMusicFile: Dispatch<SetStateAction<{ name: string; url: string; objectUrl: boolean; track?: Track | undefined; } | null>>;
  setMusicTime: Dispatch<SetStateAction<{ t: number; d: number; }>>;
  audioSource: AudioSource;
  setLibraryOpen: Dispatch<SetStateAction<boolean>>;
  playTrackRef: RefObject<(t: Track) => void>;
}

export function useSoundSource({
  audioStream, audioInputId, setAudioStream, simulatedRef, stopDrone, setAudioSource,
  musicElRef, wallRef, droneParams, droneRef, setDroneRunning, refreshAudioInputs, setDroneParams,
  setAudioInputId, audioSourceRef, musicCtxRef, musicFile, setMusicFile, setMusicTime, audioSource,
  setLibraryOpen, playTrackRef,
}: SoundSourceDeps) {
  /** The Mac app's system-audio loopback tap (PLAN.md 23.8): the one source this hook starts and stops itself. */
  const systemTapRef = useRef<SystemTap | null>(null);
  /*
    The context the ear analyses in when the source owns one. The System audio
    source plays the Mac's sound into a context of its own, and on GitHub's
    macOS runners the virtual output device opens one stream and refuses a
    second, so an ear with its own context sat "running" with a clock at 0.00
    for ten seconds while the tap's ran (PLAN 23.8-clock, the reason in
    lib/systemTap.ts). Null for every other source: the ear makes its own.
  */
  const [earContext, setEarContext] = useState<AudioContext | null>(null);
  /*
    The stream the show hears and the input it was opened on, as refs beside
    the state, for handleSourceChange to read (PLAN.md 14s). Read from its
    closure, a call made through a handler from an earlier render saw the
    stream and the input of that render: the input picker's (chooseAudioInput,
    memoised on the source alone) was the handler from when the source last
    changed, with no stream yet and the old input. Measured with fake devices:
    picking Input 1 and then Input 2 made three `getUserMedia` calls, none with
    a `deviceId`, and all three tracks stayed live, so the interface picked at
    soundcheck was not the one the show heard until a reload, and each pick
    left another microphone open. `scripts/inputpick.mjs`.
  */
  const audioStreamRef = useRef<MediaStream | null>(null);
  audioStreamRef.current = audioStream;
  const audioInputIdRef = useRef(audioInputId);
  audioInputIdRef.current = audioInputId;
  /** Counts the calls, so a device that answers after a newer pick is closed, not heard. */
  const sourceAskRef = useRef(0);

  const handleSourceChange = useCallback(async (source: AudioSource, inputId?: string) => {
    const ask = ++sourceAskRef.current;
    const was = audioStreamRef.current ?? audioStream;
    if (was) {
      was.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
      setAudioStream(null);
    }
    if (simulatedRef.current) { simulatedRef.current.stop(); simulatedRef.current = null; }
    if (systemTapRef.current) { systemTapRef.current.stop(); systemTapRef.current = null; }
    setEarContext(null);
    // The drone owns an AudioContext and four running oscillators; leaving it
    // behind would keep them sounding under whatever replaced it.
    stopDrone();

    setAudioSource(source);
    try { sessionStorage.setItem(AUDIO_SOURCE_KEY, source); } catch { /* private */ }
    if (source !== 'file' && musicElRef.current && !musicElRef.current.paused) musicElRef.current.pause();
    if (source === 'none') return;
    if (source === 'file') {
      // The stream comes from the element once it is ready; see playMusicFile.
      return;
    }
    if (source === 'drone') {
      /*
        The plate playing itself. It is a stream like any other from here on,
        so the analyser, the calibration and the beat clock are all exercised
        for real — and because it also sounds out of this tab, a shared tab
        carries it to a call.
      */
      const drone = startPlateDrone(
        () => wallRef.current?.plateReading(PLATE_PLACES) ?? null,
        droneParams,
      );
      droneRef.current = drone;
      setDroneRunning(true);
      setAudioStream(drone.stream);
      return;
    }
    if (source === 'simulated') {
      // A band in a box: no device, no permission, nothing to be asked for.
      // Downstream it is a stream like any other, so the analyser, the room
      // calibration and the beat clock are all exercised for real.
      const band = startSimulatedMusic();
      simulatedRef.current = band;
      // Under ?debug, the band's kick count for a check to set the heard
      // kicks against. It stays defined after the source changes and then
      // reads null: "no band now", which a check must not read as a band
      // that played nothing.
      if (new URLSearchParams(window.location.search).has('debug')) {
        (window as unknown as { __band?: () => unknown }).__band = () => simulatedRef.current?.stats() ?? null;
      }
      void band.resume();
      setAudioStream(band.stream);
      return;
    }

    const deviceId = inputId ?? audioInputIdRef.current;
    try {
      let stream: MediaStream;
      if (source === 'system') {
        const nativeTap = (window as unknown as {
          __CHROMAGLASS_NATIVE__?: { onSystemAudioPcm?: (fn: (samples: ArrayLike<number>, sampleRate: number) => void) => () => void };
        }).__CHROMAGLASS_NATIVE__?.onSystemAudioPcm;
        if (nativeTap) {
          // Mac app (PLAN.md 23.8): ScreenCaptureKit's loopback through
          // setDisplayMediaRequestHandler (no tab picker) and the main
          // process's PCM tap, played into one stream (lib/systemTap.ts).
          const tap = startSystemTap(
            nativeTap,
            () => ask === sourceAskRef.current,
            new URLSearchParams(window.location.search).has('debug'),
          );
          systemTapRef.current = tap;
          stream = tap.stream;
          // The ear analyses in the tap's own context: one output stream, not
          // two (the reason is in lib/systemTap.ts). Set before the stream, so
          // the ear never starts a context of its own for this stream.
          setEarContext(tap.context);
          setAudioStream(stream);
        } else {
          // Raw, as the microphone below, and in stereo: a shared tab is the
          // music itself. With plain `audio: true` Chrome shared a music tab as
          // a call: one channel, with echo cancellation, noise suppression and
          // auto gain all on. The show heard it processed, and a recording of
          // it failed outright (the master's 320 kbps is more AAC than one
          // channel carries). Plain again only if the constraints are refused,
          // never after the person has said no to sharing.
          try {
            stream = await navigator.mediaDevices.getDisplayMedia({
              audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
              video: true,
            });
          } catch (e) {
            if (!(e instanceof TypeError) && (e as Error)?.name !== 'OverconstrainedError') throw e;
            stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          }
        }
      } else {
        // Ask for the raw microphone. The browser's defaults — echo
        // cancellation, noise suppression and auto gain — are tuned for speech
        // on a call and are actively hostile to music: suppression treats a
        // steady groove as background noise and ducks it, AGC pumps the
        // dynamics flat, and echo cancellation can null out the very speakers
        // in the room. That is what "the mic isn't sensitive enough" usually
        // is. Fall back to plain audio if a device rejects the constraints.
        const raw: MediaStreamConstraints = {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
            ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          },
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia(raw);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia(deviceId ? { audio: { deviceId: { exact: deviceId } } } : { audio: true });
        }
        void refreshAudioInputs();   // with permission, the inputs have names now
      }
      // Two picks in quick succession: the first device can answer after the
      // second was asked for. It is closed, not handed to the show over it.
      if (ask !== sourceAskRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      audioStreamRef.current = stream;
      setAudioStream(stream);
      stream.getTracks().forEach(track => {
        track.onended = () => {
          setAudioSource('none');
          setAudioStream(null);
        };
      });
    } catch (error: any) {
      // Refused after a newer pick (the prompt dismissed once the band was
      // chosen): the newer source stands.
      if (ask !== sourceAskRef.current) return;
      if (error.name === 'NotAllowedError' || error.name === 'AbortError' || error.message?.includes('Permission denied')) {
        console.warn('Audio permission denied or cancelled by user.');
      } else {
        console.error('Error accessing audio source:', error);
      }
      setAudioSource('none');
    }
  }, [audioStream, refreshAudioInputs]);
  const handleSourceChangeRef = useRef(handleSourceChange);
  handleSourceChangeRef.current = handleSourceChange;
  /** The instrument's start/stop: stopping keeps it the chosen source, so starting again is one press. */
  const toggleDrone = useCallback(() => {
    if (droneRef.current) {
      stopDrone();
      if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); setAudioStream(null); }
      return;
    }
    void handleSourceChange('drone');
  }, [audioStream, handleSourceChange, stopDrone]);
  const changeDrone = useCallback((patch: Partial<DroneParams>) => {
    setDroneParams(prev => {
      const next = { ...prev, ...patch };
      droneRef.current?.setParams(next);
      return next;
    });
  }, []);
  const chooseAudioInput = useCallback((id: string) => {
    setAudioInputId(id);
    audioInputIdRef.current = id;
    try { localStorage.setItem(AUDIO_INPUT_KEY, id); } catch { /* private */ }
    // Reopen the microphone on the new input if it is the live source: this
    // render's handler, told the id, so it closes the stream that is live now
    // and opens the one just picked (see audioStreamRef).
    if (audioSourceRef.current === 'microphone') void handleSourceChangeRef.current('microphone', id);
  }, []);

  /** What the show hears of the music element. */
  const musicStream = useCallback((el: HTMLAudioElement): MediaStream | null => {
    let stream: MediaStream | null = null;
    // Chrome: the element's own stream. Elsewhere: route it through an
    // AudioContext to a stream destination, and to the speakers as well.
    const cap = (el as HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream });
    try { stream = cap.captureStream?.() ?? cap.mozCaptureStream?.() ?? null; } catch { stream = null; }
    if (!stream) {
      try {
        if (!musicCtxRef.current) {
          const ctx = new AudioContext();
          const src = ctx.createMediaElementSource(el);
          const dest = ctx.createMediaStreamDestination();
          src.connect(dest);
          src.connect(ctx.destination);
          musicCtxRef.current = { ctx, src, dest };
        }
        stream = musicCtxRef.current.dest.stream;
      } catch { stream = null; }
    }
    return stream;
  }, []);
  /** A music file: the element plays it aloud and its stream is what the show hears. */
  const startMusic = useCallback((
    url: string,
    name: string,
    opts: { objectUrl: boolean; track?: Track },
  ) => {
    const el = musicElRef.current;
    if (!el) return;
    // Only a URL we minted needs releasing; revoking a library path does
    // nothing the first time and would be a bug the moment it did something.
    if (musicFile?.objectUrl) URL.revokeObjectURL(musicFile.url);
    setMusicFile({ name, url, objectUrl: opts.objectUrl, track: opts.track });
    setMusicTime({ t: 0, d: 0 });
    // Music takes over: the plate's instrument and the band in a box stop.
    stopDrone();
    if (simulatedRef.current) { simulatedRef.current.stop(); simulatedRef.current = null; }
    sourceAskRef.current++;   // a microphone still being asked for is not heard over the music
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); setAudioStream(null); }
    el.src = url;
    el.onloadedmetadata = () => setMusicTime({ t: 0, d: el.duration || 0 });
    el.oncanplay = () => {
      el.oncanplay = null;
      setAudioSource('file');
      setAudioStream(musicStream(el));
      void el.play().catch(() => { /* needs a gesture; the play button is there */ });
    };
    el.load();
  }, [audioStream, musicFile, stopDrone, musicStream]);
  /**
   * The transport's play/pause. Playing a file that is loaded but not the
   * show's source (the plate's instrument or another took over since) makes
   * it the source again and silences what was playing.
   */
  const toggleMusic = useCallback(() => {
    const el = musicElRef.current;
    if (!el) return;
    if (!el.paused) { el.pause(); return; }
    if (audioSource !== 'file') {
      sourceAskRef.current++;   // as startMusic
      stopDrone();
      if (simulatedRef.current) { simulatedRef.current.stop(); simulatedRef.current = null; }
      if (audioStream) audioStream.getTracks().forEach(t => t.stop());
      setAudioSource('file');
      setAudioStream(musicStream(el));
    }
    void el.play();
  }, [audioSource, audioStream, stopDrone, musicStream]);
  const playMusicFile = useCallback((file: File) => {
    startMusic(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''), { objectUrl: true });
  }, [startMusic]);
  const playTrack = useCallback((track: Track) => {
    startMusic(track.src, track.title, { objectUrl: false, track });
    setLibraryOpen(false);
  }, [startMusic]);
  // The debug hook is installed once, long before this exists; a ref is how
  // every other late-defined thing reaches it.
  playTrackRef.current = playTrack;
  const closeMusicFile = useCallback(() => {
    const el = musicElRef.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (musicFile?.objectUrl) URL.revokeObjectURL(musicFile.url);
    setMusicFile(null);
    if (audioSource === 'file') { setAudioSource('none'); setAudioStream(null); }
  }, [musicFile, audioSource]);

  // What the show listened to last time, brought back without asking for
  // anything. The microphone only reopens where permission is already granted,
  // so a reload is silent rather than a prompt over the plate.
  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const remembered = rememberedSource();
      if (remembered === 'none') return;
      if (remembered === 'microphone' && !(await micAlreadyAllowed())) return;
      if (cancelled) return;
      void handleSourceChange(remembered);
    };
    void restore();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    handleSourceChange, toggleDrone, changeDrone, chooseAudioInput, toggleMusic, playMusicFile,
    playTrack, closeMusicFile, earContext,
  };
}
