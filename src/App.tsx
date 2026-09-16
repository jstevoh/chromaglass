import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer, LiquidVisualizerHandle } from './components/LiquidVisualizer';
import { PRESET_CONTRACTS } from './presetPlate';
import { SettingsPanel } from './components/SettingsPanel';
import { GuidePanel } from './components/GuidePanel';
import { CueBar } from './components/CueBar';
import { usePreviewFrame } from './hooks/usePreviewFrame';
import { RideStrip, DEFAULT_RIDE } from './components/RideStrip';
import { StatusLine } from './components/StatusLine';
import { blendLooks, targetLook, DEFAULT_FADE_SECONDS } from './lib/lookFade';
import { Play, Pause, Mic, MicOff, Settings, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor, MonitorOff, X, ImagePlus, SprayCan, Paintbrush, FlaskConical, Slash, Cast, Music, Microscope, Clapperboard, ChevronDown, LayoutGrid, Sliders, Gamepad2, Hand, FileAudio, Circle, Square, Projector } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { PRESETS } from './presets';
import { useCastSender } from './hooks/useCastSession';
import { useRemoteLink } from './hooks/useRemoteLink';
import { relayInfo, type RemoteState, type RelayInfo } from './lib/remoteProtocol';
import type { CastState, CastMessage } from './lib/castProtocol';
import type { RemoteMessage } from './lib/remoteProtocol';
import type { EngineStatus } from './lib/platform';
import { RunLocallyCard } from './components/RunLocallyCard';
import { SequencerPanel } from './components/SequencerPanel';
import { MidiPanel } from './components/MidiPanel';
import { useMidi } from './hooks/useMidi';
import { useGamepad } from './hooks/useGamepad';
import { useSceneCamera } from './hooks/useSceneCamera';
import { startSimulatedMusic, type SimulatedMusic } from './lib/simulatedMusic';
import { useRecorder } from './hooks/useRecorder';
import { useProjector } from './hooks/useProjector';
import type { MidiAction } from './lib/midi';
import { PresetMenu } from './components/PresetMenu';
import { useUserPresets, asPreset } from './hooks/useUserPresets';
import { downloadText, parseSequenceFile, sequenceFileName, serializeSequence, isUserPresetId, type UserPreset } from './lib/userPresets';
import type { ShowSequence } from './lib/sequencer';
import { sameSong, songRefFromTrack, type SongRef } from './lib/songRef';
import { useShowSequencer } from './hooks/useShowSequencer';
import { useSongChange } from './hooks/useSongChange';
import { useMusicIntelligence } from './hooks/useMusicIntelligence';
import { MusicSettings, DEFAULT_MUSIC_SETTINGS } from './lib/musicTypes';
import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE, PALETTE_RGB, DROPPER_COLORS } from './constants';
import { TrackPanel } from './components/TrackPanel';
import { LyricsOverlay } from './components/LyricsOverlay';

const MUSIC_SETTINGS_KEY = 'chromaglass-music-settings';

function loadMusicSettings(): MusicSettings {
  try {
    const raw = localStorage.getItem(MUSIC_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_MUSIC_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...DEFAULT_MUSIC_SETTINGS };
}

type AudioSource = 'none' | 'microphone' | 'system' | 'file' | 'simulated';

const AUDIO_INPUT_KEY = 'chromaglass-audio-input';
/**
 * Where the show listened last time.
 *
 * It used to open the microphone on load, every load, which meant a permission
 * prompt in front of the plate before anyone had asked for one. Now the choice
 * is remembered and nothing is opened on its own: the microphone comes back
 * only if the browser already says permission is granted (so no prompt
 * appears), and anything else waits for a click.
 */
const AUDIO_SOURCE_KEY = 'chromaglass-audio-source';
/** Perform or Design. A property of this desk, not of the look, so not a setting. */
const DESK_MODE_KEY = 'chromaglass-desk-mode';
/** Which controls are on the desk's faders. A property of this desk, like the mode. */
const RIDE_KEYS_KEY = 'chromaglass-ride-keys';

function rememberedSource(): AudioSource {
  try {
    const raw = localStorage.getItem(AUDIO_SOURCE_KEY);
    // 'file' needs a file nobody has chosen yet, and 'system' opens a picker.
    if (raw === 'microphone' || raw === 'simulated') return raw;
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
 * The room camera lives outside the settings: a preset carries how hard the
 * room drives the plate, never whether a camera is switched on or which one.
 * Loading someone else's look should not open your camera.
 */
const SCENE_ON_KEY = 'chromaglass-scene-on';
const SCENE_DEVICE_KEY = 'chromaglass-scene-device';

// Detect which preset (if any) matches the current settings.
function detectActivePreset(settings: VisualizerSettings): string | null {
  for (const preset of PRESETS) {
    const ps = preset.settings;
    const match = Object.keys(ps).every(key => {
      const pv = (ps as any)[key];
      const sv = (settings as any)[key];
      if (typeof pv === 'object' && pv !== null) {
        return JSON.stringify(pv) === JSON.stringify(sv);
      }
      return pv === sv;
    });
    if (match) return preset.id;
  }
  return null;
}

export default function App() {
  const [isActive, setIsActive] = useState(true);
  const [audioSource, setAudioSource] = useState<AudioSource>('none');
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
  const [musicFile, setMusicFile] = useState<{ name: string; url: string } | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [musicTime, setMusicTime] = useState({ t: 0, d: 0 });
  const musicElRef = useRef<HTMLAudioElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);
  const musicCtxRef = useRef<{ ctx: AudioContext; src: MediaElementAudioSourceNode; dest: MediaStreamAudioDestinationNode } | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  /**
   * Perform, or Design.
   *
   * Design is what this has always been: the plate fills the window, which is
   * the right shape for *building* a look. Perform is the desk — the plate
   * becomes a preview and the controls get the room, because during a show the
   * plate is already on a wall behind you, larger, and the thing you cannot
   * see is the desk. Nothing is taken away; it is a different arrangement of
   * the same controls, and the toggle is one click.
   */
  const [deskMode, setDeskMode] = useState<'design' | 'perform'>(() => {
    try { return localStorage.getItem(DESK_MODE_KEY) === 'perform' ? 'perform' : 'design'; } catch { return 'design'; }
  });
  useEffect(() => { try { localStorage.setItem(DESK_MODE_KEY, deskMode); } catch { /* private window */ } }, [deskMode]);
  const [rideKeys, setRideKeys] = useState<(keyof VisualizerSettings)[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RIDE_KEYS_KEY) ?? 'null');
      return Array.isArray(saved) ? saved : DEFAULT_RIDE;
    } catch { return DEFAULT_RIDE; }
  });
  useEffect(() => { try { localStorage.setItem(RIDE_KEYS_KEY, JSON.stringify(rideKeys)); } catch { /* private window */ } }, [rideKeys]);
  /**
   * The preset last applied by hand. Which preset is *active* is derived from
   * the settings below rather than stored: it only ever differed from them
   * transiently, and keeping it as state meant a second render of the whole
   * app on every settings change, plus a walk over every preset comparing
   * every key. The sequencer glides settings continuously through a show, so
   * that ran on every frame of every transition.
   */
  const [pinnedPresetId, setPinnedPresetId] = useState<string | null>('classic');
  const [settings, setSettings] = useState<VisualizerSettings>(() => {
    const classic = PRESETS.find(p => p.id === 'classic');
    const base = classic ? { ...DEFAULT_SETTINGS, ...classic.settings } : { ...DEFAULT_SETTINGS };
    // Diagnostic override for this page load only: ?sim=cpu | auto | <edge>.
    // Lets a device be pinned to a solver grid without touching its settings.
    const sim = new URLSearchParams(window.location.search).get('sim');
    if (sim === 'cpu' || sim === 'auto') base.simResolution = sim;
    else if (sim && Number.isFinite(Number(sim))) base.simResolution = Number(sim);
    // ?set=key=value;key=value pins any setting for this load (testing a look).
    const set = new URLSearchParams(window.location.search).get('set');
    if (set) {
      for (const kv of set.split(';')) {
        const [k, v] = kv.split('=');
        if (!k || v === undefined || !(k in base)) continue;
        const cur = (base as unknown as Record<string, unknown>)[k];
        (base as unknown as Record<string, unknown>)[k] = typeof cur === 'number' ? Number(v) : typeof cur === 'boolean' ? v === 'true' : v;
      }
    }
    return base;
  });
  const [seedCount, setSeedCount] = useState(0);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [drainTrigger, setDrainTrigger] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  const [liquidTypes, setLiquidTypes] = useState<LiquidType[]>(() => [...DEFAULT_LIQUID_TYPES]);
  const [selectedLiquidId, setSelectedLiquidId] = useState('water');
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press'>('dropper');

  const selectedLiquid = liquidTypes.find(t => t.id === selectedLiquidId) ?? liquidTypes[0];
  // The message handler is built once and must not go stale when a liquid's
  // colour is edited.
  const liquidTypesRef = useRef(liquidTypes);
  useEffect(() => { liquidTypesRef.current = liquidTypes; }, [liquidTypes]);

  // ── Cast ──
  // The receiver runs its own visualizer; it is fed a snapshot of the show
  // when it connects and every change after. The callback lives in a ref
  // because the state it snapshots is declared further down.
  const castReadyRef = useRef<() => void>(() => {});
  const stageRef = useRef<{ width: number; height: number } | null>(null);
  const { isCasting, startCast, stopCast, send: castSend, windowFullscreen, fillWindow } = useCastSender(
    () => castReadyRef.current(),
    (size) => { stageRef.current = size; visualizerRef.current?.setStage(size); },
  );
  const [presetSeq, setPresetSeq] = useState(0);

  const updateLiquidColor = useCallback((id: string, color: string) => {
    setLiquidTypes(prev => prev.map(t => t.id === id ? { ...t, color } : t));
  }, []);
  const [isAutomated, setIsAutomated] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  /**
   * Clean screen: nothing on top of the liquid at all — no logo, no chips, no
   * cursor. For a projected show. Esc (or holding a finger on a touch screen)
   * brings everything back; a hint says so for a few seconds after hiding.
   */
  const [overlaysVisible, setOverlaysVisible] = useState(true);
  const [showCleanHint, setShowCleanHint] = useState(false);
  const hideOverlays = useCallback(() => {
    setOverlaysVisible(false);
    setShowCleanHint(true);
  }, []);
  useEffect(() => {
    if (!showCleanHint) return;
    const t = setTimeout(() => setShowCleanHint(false), 4000);
    return () => clearTimeout(t);
  }, [showCleanHint]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!overlaysVisible) {
        setOverlaysVisible(true);
        return;
      }
      // With the overlays up, Esc closes whatever panel is open.
      setShowSettings(false);
      setShowHelp(false);
      setShowTrackPanel(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlaysVisible]);
  useEffect(() => {
    // Touch screens have no Esc: a still finger held for a moment brings the
    // overlays back. Painting is a moving finger, so the two don't collide.
    if (overlaysVisible) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let origin: { x: number; y: number } | null = null;
    const cancel = () => { if (timer) clearTimeout(timer); timer = null; origin = null; };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      origin = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => setOverlaysVisible(true), 700);
    };
    const move = (e: PointerEvent) => {
      if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 12) cancel();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', cancel, true);
    window.addEventListener('pointercancel', cancel, true);
    return () => {
      cancel();
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', cancel, true);
      window.removeEventListener('pointercancel', cancel, true);
    };
  }, [overlaysVisible]);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  /** The synthesised band, when that is what the show is listening to. */
  const simulatedRef = useRef<SimulatedMusic | null>(null);
  const visualizerRef = useRef<LiquidVisualizerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      // Draw image to an offscreen canvas to get pixel data
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      visualizerRef.current?.injectImage(imageData);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const userPresetsRef = useRef<UserPreset[]>([]);

  const handleSourceChange = useCallback(async (source: AudioSource) => {
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }
    if (simulatedRef.current) { simulatedRef.current.stop(); simulatedRef.current = null; }

    setAudioSource(source);
    try { localStorage.setItem(AUDIO_SOURCE_KEY, source); } catch { /* private */ }
    if (source !== 'file' && musicElRef.current && !musicElRef.current.paused) musicElRef.current.pause();
    if (source === 'none') return;
    if (source === 'file') {
      // The stream comes from the element once it is ready; see playMusicFile.
      return;
    }
    if (source === 'simulated') {
      // A band in a box: no device, no permission, nothing to be asked for.
      // Downstream it is a stream like any other, so the analyser, the room
      // calibration and the beat clock are all exercised for real.
      const band = startSimulatedMusic();
      simulatedRef.current = band;
      void band.resume();
      setAudioStream(band.stream);
      return;
    }

    try {
      let stream: MediaStream;
      if (source === 'system') {
        stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
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
            ...(audioInputId ? { deviceId: { exact: audioInputId } } : {}),
          },
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia(raw);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia(audioInputId ? { audio: { deviceId: { exact: audioInputId } } } : { audio: true });
        }
        void refreshAudioInputs();   // with permission, the inputs have names now
      }
      setAudioStream(stream);
      stream.getTracks().forEach(track => {
        track.onended = () => {
          setAudioSource('none');
          setAudioStream(null);
        };
      });
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'AbortError' || error.message?.includes('Permission denied')) {
        console.warn('Audio permission denied or cancelled by user.');
      } else {
        console.error('Error accessing audio source:', error);
      }
      setAudioSource('none');
    }
  }, [audioStream, audioInputId, refreshAudioInputs]);
  const chooseAudioInput = useCallback((id: string) => {
    setAudioInputId(id);
    try { localStorage.setItem(AUDIO_INPUT_KEY, id); } catch { /* private */ }
    // Reopen the microphone on the new input if it is the live source.
    if (audioSource === 'microphone') setTimeout(() => { void handleSourceChange('microphone'); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource]);

  /** A music file: the element plays it aloud and its stream is what the show hears. */
  const playMusicFile = useCallback((file: File) => {
    const el = musicElRef.current;
    if (!el) return;
    if (musicFile) URL.revokeObjectURL(musicFile.url);
    const url = URL.createObjectURL(file);
    setMusicFile({ name: file.name.replace(/\.[^.]+$/, ''), url });
    setMusicTime({ t: 0, d: 0 });
    if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); setAudioStream(null); }
    el.src = url;
    el.onloadedmetadata = () => setMusicTime({ t: 0, d: el.duration || 0 });
    el.oncanplay = () => {
      el.oncanplay = null;
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
      setAudioSource('file');
      setAudioStream(stream);
      void el.play().catch(() => { /* needs a gesture; the play button is there */ });
    };
    el.load();
  }, [audioStream, musicFile]);
  const closeMusicFile = useCallback(() => {
    const el = musicElRef.current;
    if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
    if (musicFile) URL.revokeObjectURL(musicFile.url);
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

  // The browser will not run audio before a gesture, so a restored band stays
  // silent until the first click anywhere. One listener, then gone.
  useEffect(() => {
    const wake = () => { void simulatedRef.current?.resume(); };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  useEffect(() => {
    if (activeLayer >= settings.layerCount) {
      setActiveLayer(Math.max(0, settings.layerCount - 1));
    }
  }, [settings.layerCount, activeLayer]);

  const [calibrateNonce, setCalibrateNonce] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const engineStatusRef = useRef<EngineStatus | null>(null);
  const [filmSource, setFilmSource] = useState<'none' | 'file' | 'camera'>('none');
  const loadFilm = async (file: File) => {
    await visualizerRef.current?.loadFilmFile(file);
    setFilmSource('file');
  };
  const startFilmCamera = async () => {
    try {
      await visualizerRef.current?.startFilmCamera();
      setFilmSource('camera');
    } catch (err) {
      console.warn('ChromaGlass: camera unavailable for the film projector.', err);
      setFilmSource('none');
    }
  };
  const clearFilm = () => {
    visualizerRef.current?.clearFilm();
    setFilmSource('none');
  };
  // ── The room ────────────────────────────────────────────────────
  // The camera as a sensor: it stirs the plate, puts hands on it and rides
  // whatever settings the mappings name. Off unless someone switched it on.
  const [sceneOn, setSceneOn] = useState<boolean>(() => { try { return localStorage.getItem(SCENE_ON_KEY) === '1'; } catch { return false; } });
  const [sceneDeviceId, setSceneDeviceId] = useState<string>(() => { try { return localStorage.getItem(SCENE_DEVICE_KEY) ?? ''; } catch { return ''; } });
  const scenePreviewRef = useRef<HTMLCanvasElement | null>(null);
  /** True once the camera has been switched on by hand in this session. */
  const sceneAskedRef = useRef(false);
  const toggleScene = useCallback((on: boolean) => {
    if (on) sceneAskedRef.current = true;
    setSceneOn(on);
    try { localStorage.setItem(SCENE_ON_KEY, on ? '1' : '0'); } catch { /* private */ }
  }, []);
  const chooseSceneDevice = useCallback((id: string) => {
    setSceneDeviceId(id);
    try { localStorage.setItem(SCENE_DEVICE_KEY, id); } catch { /* private */ }
  }, []);
  const scene = useSceneCamera({
    enabled: sceneOn,
    userAsked: sceneAskedRef.current,
    deviceId: sceneDeviceId,
    mirror: settings.sceneMirror !== false,
    deadzone: settings.sceneDeadzone ?? 0.25,
    smooth: settings.sceneSmooth ?? 0.35,
    people: settings.scenePeople !== false,
    preview: scenePreviewRef,
  });

  const audioData = useAudioAnalyzer(
    isActive ? audioStream : null, isActive,
    settings.sensitivity, settings.bassBoost,
    settings.autoCalibrate !== false, calibrateNonce,
  );

  // ── Music intelligence ──────────────────────────────────────────
  const [showTrackPanel, setShowTrackPanel] = useState(false);
  const [showSequencer, setShowSequencer] = useState(false);
  const [showMidi, setShowMidi] = useState(false);
  const [presetMenu, setPresetMenu] = useState<'none' | 'title'>('none');
  const [castMenu, setCastMenu] = useState(false);
  // ── The user's own presets: a library in the browser, files on disk ──
  const userPresets = useUserPresets();
  const allPresets = useMemo(() => [...PRESETS, ...userPresets.presets.map(asPreset)], [userPresets.presets]);
  userPresetsRef.current = userPresets.presets;
  /**
   * Which preset the plate is currently wearing, derived rather than stored.
   *
   * A preset applied by hand is pinned above; everything else — a slider moved,
   * a fader ridden, a stage of the sequencer gliding a dozen settings past each
   * other — changes the settings, and whether they still add up to a preset is
   * a question about the settings, not a separate fact to keep in step with
   * them. One of the user's own presets keeps its name while the settings still
   * match what it saved, which a walk over the built-ins cannot tell.
   */
  const activePresetId = useMemo(() => {
    if (isUserPresetId(pinnedPresetId)) {
      const up = userPresets.presets.find(p => p.id === pinnedPresetId);
      if (up && Object.keys(up.settings).every(k =>
        k === 'simResolution' || JSON.stringify((up.settings as any)[k]) === JSON.stringify((settings as any)[k]))) {
        return pinnedPresetId;
      }
    }
    return detectActivePreset(settings);
  }, [settings, pinnedPresetId, userPresets.presets]);
  /** Network displays connected through the relay, and where they can reach it. */
  const [mirrorCount, setMirrorCount] = useState(0);
  const [relay, setRelay] = useState<RelayInfo | null>(null);
  useEffect(() => { if (castMenu) void relayInfo().then(setRelay); }, [castMenu]);
  const [musicSettings, setMusicSettings] = useState<MusicSettings>(loadMusicSettings);
  const updateMusicSettings = useCallback((partial: Partial<MusicSettings>) => {
    setMusicSettings(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const musicIntel = useMusicIntelligence(audioStream, audioData, musicSettings, settings);

  // ── User palette lock ───────────────────────────────────────────
  const [paletteLock, setPaletteLock] = useState<number | null>(() => {
    const raw = localStorage.getItem('chromaglass-palette-lock');
    const n = raw == null ? NaN : parseInt(raw, 10);
    return Number.isInteger(n) && n >= 0 && n < COLOR_HARMONIES.length ? n : null;
  });
  const selectPalette = useCallback((index: number | null) => {
    setPaletteLock(index);
    try {
      if (index == null) localStorage.removeItem('chromaglass-palette-lock');
      else localStorage.setItem('chromaglass-palette-lock', String(index));
    } catch { /* private mode */ }
    visualizerRef.current?.setHarmonyLock(index == null ? null : COLOR_HARMONIES[index]);
  }, []);
  useEffect(() => {
    // Re-assert a persisted lock once the visualizer is mounted
    if (paletteLock != null) visualizerRef.current?.setHarmonyLock(COLOR_HARMONIES[paletteLock]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Overlay music-driven parameters onto the user's settings for rendering only
  // (the settings state itself is untouched, so preset detection keeps working).
  const effectiveSettings = useMemo(
    () => musicIntel.overrides ? { ...settings, ...musicIntel.overrides } : settings,
    [settings, musicIntel.overrides],
  );

  // Pin the visualizer's palette to the track's harmony (with evolution drift)
  // — unless the user has locked a palette themselves.
  useEffect(() => {
    if (musicIntel.harmonyIndex != null && paletteLock == null) {
      visualizerRef.current?.setHarmony(COLOR_HARMONIES[musicIntel.harmonyIndex]);
    }
  }, [musicIntel.harmonyIndex, paletteLock]);

  // Fire lyric word-triggers into the fluid
  useEffect(() => {
    if (musicIntel.trigger) {
      const energy = audioData ? Math.min(1, audioData.energy) : 0.6;
      visualizerRef.current?.triggerTheme(musicIntel.trigger.trigger.theme, Math.max(0.35, energy));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicIntel.trigger?.seq]);

  // An identified song changes the look only when a preset or sequence was
  // made for that very song (see the song-bound effects below). The
  // track-matched pick from the built-in list used to apply here a few
  // seconds into every set, which read as the show switching presets for no
  // reason; the look now stays where it was put until a saved one applies.

  // Re-fire replayed performance gestures into the fluid
  useEffect(() => {
    if (musicIntel.gestureFire) {
      for (const g of musicIntel.gestureFire.gestures) {
        visualizerRef.current?.applyGesture(g);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicIntel.gestureFire?.seq]);

  const updateSettings = (newSettings: Partial<VisualizerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const applyPreset = (presetId: string, presetSettings: Partial<VisualizerSettings>) => {
    // Presets that don't mention the macro camera get the plate-wide framing —
    // otherwise a macro preset would leave the next one zoomed in.
    // Likewise the Fillmore projectors, beads, cells and fingering: a preset
    // that does not ask for them gets a plain plate, not the last preset's.
    setSettings(prev => ({ ...prev, macroMode: false, renderStyle: 'show', camera: 0, dishSpread: 0, beads: 0, cells: 0, fingering: 0, ...presetSettings }));
    setPinnedPresetId(presetId);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(presetId);
  };

  const applyUserPreset = (p: UserPreset) => {
    setSettings(prev => ({ ...p.settings, simResolution: prev.simResolution }));
    setPinnedPresetId(p.id);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(p.id, { contract: p.contract ?? null, injectStyles: p.injectStyles ?? null, liquids: p.liquids ?? null });
  };
  const saveCurrentPreset = (name: string, description: string, forSong = false) => {
    const plate = visualizerRef.current?.describePlate();
    const p = userPresets.saveCurrent(name, description, settings, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, forSong ? currentSong : null);
    setPinnedPresetId(p.id);
  };
  /** The song playing now, as a file would remember it. */
  const currentSong = useMemo<SongRef | null>(() => (musicIntel.state.track ? songRefFromTrack(musicIntel.state.track) : null), [musicIntel.state.track]);
  const loadPresetFile = async (file: File) => {
    const p = await userPresets.importFile(file);
    applyUserPreset(p);
  };
  const exportSequence = (seq: ShowSequence) => {
    const used = userPresets.presets.filter(p => seq.stages.some(st => st.presetId === p.id));
    downloadText(sequenceFileName(seq), serializeSequence(seq, used));
  };

  /** The sequencer's stage change: the preset's dyes and style, the plate kept. */
  const adoptPreset = useCallback((presetId: string) => {
    setPinnedPresetId(presetId);
    const up = isUserPresetId(presetId) ? userPresets.presets.find(p => p.id === presetId) : null;
    // A user preset's dyes live in its file rather than in the plate's maps,
    // so they are handed over here. This used to go through `applyPreset`
    // to register them — which clears the plate, so a sequence changing to
    // one of your own looks cut to black where a built-in did not.
    visualizerRef.current?.adoptPreset(presetId, up
      ? { contract: up.contract ?? null, injectStyles: up.injectStyles ?? null, liquids: up.liquids ?? null }
      : undefined);
  }, [userPresets.presets]);

  // ── Show sequencer ────────────────────────────────────────────────
  // The settings it reads come from a ref so the 250 ms tick never sees a
  // stale closure; the patches it writes go through updateSettings like any
  // slider, so the phone and the panel show the glide as it happens.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // ── Cue and Go ────────────────────────────────────────────────────
  //
  // `applyPreset` above clears every layer and reseeds, which is what you want
  // while you are building a look and exactly what you do not want at 11pm
  // with the plate on a wall: the clear is a hard cut through near-black in
  // front of a room.
  //
  // So a look can also be *armed* and then faded in. The fade adopts the new
  // preset's dyes without touching the plate and walks the settings across
  // over a few seconds, so nothing is ever wiped. `npm run desk` drives a
  // whole fade and checks the stage never darkens; today's clearing path is
  // the control, and it fails that check by a mile.
  const [cued, setCued] = useState<{ id: string; name: string; settings: Partial<VisualizerSettings> } | null>(null);
  const [fadeSeconds, setFadeSeconds] = useState<number>(DEFAULT_FADE_SECONDS);
  const [fading, setFading] = useState(0);        // 0..1 while a Go is running
  // On a timer rather than requestAnimationFrame, for the same reason the
  // dimmer is: the laptop's window spends a show behind the projector's, and
  // a hidden tab stops animating. A Go fired from a MIDI pad while the
  // operator is watching the wall would otherwise freeze half-way through the
  // crossfade and stay there. (rAF also runs at the compositor's rate, which
  // on a machine falling back to software WebGL is under a frame a second —
  // the fade would arrive in three steps.)
  const lookFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** The look before the last Go, so one step back is always available. */
  const previousLook = useRef<{ id: string | null; settings: VisualizerSettings } | null>(null);

  /** What the desk should say is on stage. */
  /**
   * Is there room for a desk?
   *
   * Perform puts a preview and a control column side by side, which needs a
   * laptop's width. On a narrow window the two columns leave the plate a few
   * pixels and the whole thing is unusable — found by the QA harness, which
   * happened to run the desk check at phone width after the small-screen
   * check had resized the window, and reported a 420px preview in a 420px
   * page. Below this, Perform quietly behaves as Design; a phone already has
   * a control surface of its own in the remote.
   */
  const [roomForDesk, setRoomForDesk] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1024));
  useEffect(() => {
    const onResize = () => setRoomForDesk(window.innerWidth >= 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const performing = deskMode === 'perform' && roomForDesk;

  // The hole in the desk layout the plate is painted over. In Design there is
  // no hole and the plate fills the window, as it always has.
  const preview = usePreviewFrame(performing);

  /**
   * How long the look on the wall has been up.
   *
   * Ticked once a second rather than derived per frame: a clock on a desk
   * does not need to be right to the millisecond, and the alternative is a
   * re-render of the whole shell sixty times a second for a number that
   * changes once.
   */
  const lookSince = useRef(Date.now());
  const [lookFor, setLookFor] = useState(0);
  useEffect(() => { lookSince.current = Date.now(); setLookFor(0); }, [pinnedPresetId]);
  useEffect(() => {
    if (deskMode !== 'perform') return;
    const id = setInterval(() => setLookFor((Date.now() - lookSince.current) / 1000), 1000);
    return () => clearInterval(id);
  }, [deskMode]);

  const liveLookName = useMemo(
    () => allPresets.find(p => p.id === activePresetId)?.name ?? null,
    [allPresets, activePresetId]);

  const cueLook = useCallback((presetId: string) => {
    const up = isUserPresetId(presetId) ? userPresetsRef.current.find(p => p.id === presetId) : null;
    const built = PRESETS.find(p => p.id === presetId);
    const settings = up ? up.settings : built?.settings;
    const name = up?.name ?? built?.name ?? presetId;
    if (settings) setCued({ id: presetId, name, settings });
  }, []);

  /** Send the armed look to the stage. With no fade this is still not a clear. */
  const goLook = useCallback((seconds = fadeSeconds) => {
    const next = cued;
    if (!next) return;
    if (lookFadeRef.current) { clearInterval(lookFadeRef.current); lookFadeRef.current = null; }

    const from = settingsRef.current;
    const to = targetLook(from, next.settings);
    previousLook.current = { id: pinnedPresetId, settings: from };
    adoptPreset(next.id);
    setCued(null);

    if (seconds <= 0) { setSettings(to); setFading(0); return; }
    const started = performance.now();
    const ms = seconds * 1000;
    // ~30 a second: a crossfade over seconds does not need sixty settings
    // objects a second, and the solver is the expensive part of a settings
    // change rather than React.
    lookFadeRef.current = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / ms);
      if (t >= 1) {
        if (lookFadeRef.current) clearInterval(lookFadeRef.current);
        lookFadeRef.current = null;
        setSettings(to);
        setFading(0);
        return;
      }
      setSettings(blendLooks(from, to, t));
      setFading(t);
    }, 33);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cued, fadeSeconds, pinnedPresetId, adoptPreset]);

  /** One step back, at the same fade. The fastest fix mid-show is undo. */
  const revertLook = useCallback(() => {
    const prev = previousLook.current;
    if (!prev) return;
    previousLook.current = null;
    const from = settingsRef.current;
    if (prev.id) adoptPreset(prev.id);
    if (fadeSeconds <= 0) { setSettings(prev.settings); return; }
    const started = performance.now();
    const ms = fadeSeconds * 1000;
    if (lookFadeRef.current) clearInterval(lookFadeRef.current);
    lookFadeRef.current = setInterval(() => {
      const t = Math.min(1, (performance.now() - started) / ms);
      if (t >= 1) {
        if (lookFadeRef.current) clearInterval(lookFadeRef.current);
        lookFadeRef.current = null;
        setSettings(prev.settings);
        setFading(0);
        return;
      }
      setSettings(blendLooks(from, prev.settings, t));
      setFading(t);
    }, 33);
  }, [fadeSeconds, adoptPreset]);

  useEffect(() => () => { if (lookFadeRef.current) clearInterval(lookFadeRef.current); }, []);

  const sequencer = useShowSequencer({
    getSettings: () => settingsRef.current,
    applySettings: (patch) => setSettings(prev => ({ ...prev, ...patch })),
    adoptPreset,
    setPaletteWindow: (size, lead) => visualizerRef.current?.setPaletteWindow(size, lead),
    sectionLabel: musicIntel.state.section?.label ?? null,
    isActive,
    presets: allPresets,
  });
  // ── Files made for a song ───────────────────────────────────────
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
  const bindSequenceToSong = (seq: ShowSequence, song: SongRef | null) => {
    sequencer.upsertSequence({ ...seq, song: song ?? undefined });
  };

  const importSequenceFile = async (file: File) => {
    const parsed = parseSequenceFile(await file.text());
    for (const p of parsed.presets ?? []) userPresets.upsert(p);
    sequencer.upsertSequence(parsed.sequence);
    sequencer.setSelectedId(parsed.sequence.id);
  };

  /**
   * Lucky replaces all eighty settings at once, from one click, sitting next
   * to controls that are used mid-show. That is fine while you are hunting for
   * a look and alarming during a set, so two things guard it: the look it
   * replaced is kept, so Revert brings it straight back, and in Perform the
   * button asks once before it fires.
   */
  const [luckyArmed, setLuckyArmed] = useState(false);
  useEffect(() => {
    if (!luckyArmed) return;
    const id = setTimeout(() => setLuckyArmed(false), 3000);
    return () => clearTimeout(id);
  }, [luckyArmed]);

  const triggerLucky = () => {
    previousLook.current = { id: pinnedPresetId, settings: settingsRef.current };
    const blendModes: ('screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay')[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];
    const ledModes: ('single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk')[] = ['single', 'rainbow', 'ocean', 'fire', 'cyberpunk'];
    const audioFeatures: ('none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity')[] = ['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'];
    const randomFeature = () => audioFeatures[Math.floor(Math.random() * audioFeatures.length)];

    setSettings({
      sensitivity: Math.random() * 0.8 + 0.2,
      bassBoost: Math.random() * 1.5 + 0.5,
      autoCalibrate: settings.autoCalibrate,
      globalSpeed: Math.random() * 0.08 + 0.02,
      audioMappings: { velocity: randomFeature(), density: randomFeature(), color: randomFeature(), rotation: randomFeature() },
      platePressure: Math.random(), glassSmear: Math.random(), rainDrip: Math.random(),
      viscosity: Math.random() > 0.5 ? 'thick' : 'thin', polarity: Math.random(),
      heatIntensity: Math.random() * 0.5, boilingPoint: Math.random(), evaporationRate: Math.random() * 0.05,
      airVelocity: Math.random() * 0.5, vibrationFrequency: Math.random(),
      layerCount: Math.random() > 0.5 ? 2 : 1,
      blendMode: blendModes[Math.floor(Math.random() * blendModes.length)],
      gooeyEffect: Math.random(), rotationSpeed: Math.random() * 0.1, centerGravity: Math.random(),
      ledPlatform: Math.random() > 0.5,
      ledMode: ledModes[Math.floor(Math.random() * ledModes.length)],
      ledColor: liquidTypes[Math.floor(Math.random() * liquidTypes.length)].color,
      ledSpeed: Math.random() * 0.5,
      surfaceTension: Math.random() * 0.2, diffusionRate: Math.random() * 0.002,
      buoyancy: Math.random(), advection: Math.random() * 0.8 + 0.2,
      damping: Math.random() * 0.1 + 0.9, heatDecay: Math.random() * 0.1 + 0.9,
      automateRate: Math.random() * 0.2,
      audioImpact: settings.audioImpact,
      turbulenceScale: Math.random() * 0.7,
      turbulenceDetail: 1 + Math.floor(Math.random() * 4),
      blobSurfaceTension: Math.random(),
      boundaryContrast: Math.random() * 0.7,
      saturationBoost: 1.0 + Math.random() * 0.8,
      dyeBudget: 0.4 + Math.random() * 0.6,
      edgeRelief: Math.random() * 0.8,
      bubbles: Math.random() < 0.2 ? 0 : 0.2 + Math.random() * 0.8,
      plateRock: Math.random() * 0.9,
      layerScaleVariety: Math.random(),
      macroSync: Math.random(),
      hueJourney: Math.random() < 0.7 ? 1 + Math.round(Math.random() * 8) * 0.5 : 0,
      beatSqueeze: Math.random(),
      backgroundLoop: Math.random(),
      kaleidoscope: Math.random() < 0.2 ? [2, 4, 6][Math.floor(Math.random() * 3)] : 0,
      dishVignette: Math.random() < 0.3 ? 0.4 + Math.random() * 0.6 : 0,
      lightPlay: 0.3 + Math.random() * 0.7,
      lampMotion: Math.random(),
      lampHotspot: Math.random() * 0.7,
      secondLamp: Math.random() < 0.35 ? 0.4 + Math.random() * 0.6 : 0,
      iridescence: Math.random() * 0.6,
      renderStyle: Math.random() < 0.25 ? 'photo' : 'show',
      paperA: DROPPER_COLORS[Math.floor(Math.random() * DROPPER_COLORS.length)],
      paperB: DROPPER_COLORS[Math.floor(Math.random() * DROPPER_COLORS.length)],
      camera: Math.random() < 0.4 ? 0.5 + Math.random() * 0.5 : 0,
      focus: Math.random(),
      aperture: Math.random() * 0.8,
      bloom: Math.random() * 0.7,
      chromaticAberration: Math.random() * 0.6,
      refraction: 0.3 + Math.random() * 0.7,
      microDroplets: Math.random() < 0.4 ? Math.random() : 0,
      thinFilm: Math.random() < 0.4 ? Math.random() : 0,
      // The other projectors come out one roll in five, one at a time
      lumia: Math.random() < 0.2 ? 0.4 + Math.random() * 0.6 : 0,
      chemistry: Math.random() < 0.15 ? 0.5 + Math.random() * 0.5 : 0,
      gelWheel: Math.random() < 0.2 ? 0.4 + Math.random() * 0.6 : 0,
      gelSpeed: 0.2 + Math.random() * 1.5,
      lampWarmth: Math.random() < 0.3 ? Math.random() * 0.8 : 0,
      exposure: Math.random() < 0.25 ? Math.random() * 0.8 : 0,
      filmMix: settings.filmMix,
      filmKey: settings.filmKey,
      glossiness: Math.random() < 0.8 ? 0 : Math.random() * 0.4,
      postBlurRadius: Math.random() * 0.7,
      // One roll in four goes closeup — a magnified chase is its own happy accident
      macroMode: Math.random() < 0.25,
      macroZoom: 4 + Math.random() * 8,
      macroChase: 0.35 + Math.random() * 0.65,
      macroHold: 2.5 + Math.random() * 7,
      macroCells: Math.random(),
      macroCellScale: 0.25 + Math.random() * 0.7,
      macroLacing: Math.random(),
      macroDepth: 0.25 + Math.random() * 0.6,
      macroEdgeDetail: 0.3 + Math.random() * 0.7,
      macroRelief: 0.4 + Math.random() * 0.6,
      simResolution: settings.simResolution,
    });
    setPinnedPresetId(null);
    // Randomize inject style for the evolve
    const allStyles = ['drop', 'spray', 'splatter', 'pour', 'streak'];
    const s1 = allStyles[Math.floor(Math.random() * allStyles.length)];
    const s2 = allStyles[Math.floor(Math.random() * allStyles.length)];
    visualizerRef.current?.setInjectStyle([s1, s2]);
    setSeedCount(prev => prev + 1);
  };

  // ── A new song, a new look ──────────────────────────────────────
  // Heard as a gap between tracks, or named by track identification. The
  // sequencer owns the evolution while it runs, so it is left alone then.
  const songChange = useSongChange(audioData, musicIntel.state.track?.isrc ?? null, settings.onNewSong !== 'off' && isActive);
  const lastSongChangeSeq = useRef(0);
  useEffect(() => {
    if (!songChange || songChange.seq === lastSongChangeSeq.current) return;
    lastSongChangeSeq.current = songChange.seq;
    const mode = settings.onNewSong ?? 'off';
    if (mode === 'off' || sequencer.status.running) return;
    // A preset or sequence made for the song that just started takes precedence.
    const song = musicIntel.state.track ? songRefFromTrack(musicIntel.state.track) : null;
    if (song && (userPresets.presets.some(p => sameSong(p.song, song)) || sequencer.sequences.some(q => sameSong(q.song, song)))) return;
    if (mode === 'random') { triggerLucky(); return; }
    const pool = PRESETS.filter(p => !p.settings.macroMode && p.id !== activePresetId);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (next) applyPreset(next.id, next.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songChange?.seq]);

  // ── Cast: keep the receiver in step ─────────────────────────────
  const castState = useMemo<CastState>(() => ({
    settings: effectiveSettings,
    isActive,
    isAutomated,
    activeLayer,
    seedCount,
    clearTrigger,
    drainTrigger,
    presetId: activePresetId,
    presetSeq,
    harmonyLock: paletteLock == null ? null : COLOR_HARMONIES[paletteLock],
  }), [effectiveSettings, isActive, isAutomated, activeLayer, seedCount, clearTrigger, drainTrigger, activePresetId, presetSeq, paletteLock]);
  const relaySendRef = useRef<((m: RemoteMessage) => void) | null>(null);
  const sendCastState = useCallback(() => {
    castSend({ type: 'state', state: castState });
    if (mirrorCount > 0) relaySendRef.current?.({ type: 'cast', message: { type: 'state', state: castState } });
  }, [castSend, castState, mirrorCount]);
  castReadyRef.current = sendCastState;
  useEffect(() => { if (isCasting || mirrorCount > 0) sendCastState(); }, [isCasting, mirrorCount, sendCastState]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCastState?: unknown }).chromaglassCastState = () => ({ isCasting, castState, audio: audioData, songChange });
    }
  }, [isCasting, castState, audioData, songChange]);
  // The audio bands, thirty times a second — the raw spectrum stays here.
  const lastCastAudioRef = useRef(0);
  useEffect(() => {
    if (!isCasting && mirrorCount === 0) return;
    const now = performance.now();
    if (now - lastCastAudioRef.current < 33) return;
    lastCastAudioRef.current = now;
    const message: CastMessage = {
      type: 'audio',
      audio: audioData ? {
        volume: audioData.volume, bass: audioData.bass, mid: audioData.mid, treble: audioData.treble,
        energy: audioData.energy, spectralCentroid: audioData.spectralCentroid, timbre: audioData.timbre, complexity: audioData.complexity,
      } : null,
    };
    if (isCasting && !stageRef.current) castSend(message);   // a mirror of this canvas needs no feed
    if (mirrorCount > 0) relaySendRef.current?.({ type: 'cast', message });
  }, [audioData, isCasting, mirrorCount, castSend]);

  // ── The house lights ──
  // Blackout fades the dimmer to nothing over a second and back to where it
  // was: the band stops, the wall goes dark, the band starts, the wall comes
  // back. The dimmer itself is a setting, so a fader can ride it by hand.
  const [blackout, setBlackout] = useState(false);
  const dimmerBeforeRef = useRef(1);
  const fadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // On a timer, not requestAnimationFrame: the laptop's window is often
  // behind the projector's, and a hidden tab stops animating while the
  // fader on the desk expects the wall to go dark anyway.
  const fadeDimmer = useCallback((to: number, ms = 1100) => {
    if (fadeRef.current) clearInterval(fadeRef.current);
    const from = settingsRef.current.dimmer ?? 1;
    const began = performance.now();
    fadeRef.current = setInterval(() => {
      const k = Math.min(1, (performance.now() - began) / ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      setSettings(prev => ({ ...prev, dimmer: from + (to - from) * e }));
      if (k >= 1 && fadeRef.current) { clearInterval(fadeRef.current); fadeRef.current = null; }
    }, 16);
  }, []);
  const toggleBlackout = useCallback(() => {
    setBlackout(prev => {
      if (!prev) { dimmerBeforeRef.current = Math.max(0.05, settingsRef.current.dimmer ?? 1); fadeDimmer(0); }
      else fadeDimmer(dimmerBeforeRef.current);
      return !prev;
    });
  }, [fadeDimmer]);
  // ── Macro zoom at will ──
  // + and − (and the wheel over the plate, and the chip) move the closeup's
  // magnification a step at a time; + with the closeup off turns it on at a
  // gentle 2×, and − never turns it off (the Macro button does that).
  // (settingsRef is declared above.)
  const zoomMacro = useCallback((dir: 1 | -1, amount = 1) => {
    const cur = settingsRef.current;
    if (!cur.macroMode) { if (dir > 0) updateSettings({ macroMode: true, macroZoom: 2 }); return; }
    const z = Math.max(1, cur.macroZoom ?? 4);
    const next = Math.max(1, Math.min(16, z * Math.pow(dir > 0 ? 1.2 : 1 / 1.2, amount)));
    updateSettings({ macroZoom: Math.round(next * 10) / 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ── Recording ──
  const recorder = useRecorder();
  const toggleRecording = useCallback(() => {
    recorder.toggle(document.getElementById('liquid-canvas') as HTMLCanvasElement | null, audioStream);
  }, [recorder, audioStream]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'b' || e.key === 'B') toggleBlackout();
      if (e.key === '?') setShowHelp(h => !h);
      if (e.key === '+' || e.key === '=') zoomMacro(1);
      if (e.key === '-' || e.key === '_') zoomMacro(-1);
    };
    // The wheel over the plate zooms the closeup in and out while it is on
    // (never turns it on: a trackpad brush must not become a camera cut).
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || (t.id !== 'liquid-canvas' && !t.closest?.('#liquid-canvas'))) return;
      if (!settingsRef.current.macroMode || e.deltaY === 0) return;
      e.preventDefault();
      zoomMacro(e.deltaY < 0 ? 1 : -1, Math.min(1, Math.abs(e.deltaY) / 100));
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('wheel', onWheel); };
  }, [toggleBlackout, zoomMacro]);
  // ── One vocabulary of commands for every hand ───────────────────
  // The phone, a MIDI button, a gamepad face button and a keyboard all fire
  // the same actions; the presets they cue come from the same list.
  const cuePreset = useCallback((presetId: string) => {
    if (isUserPresetId(presetId)) {
      const up = userPresetsRef.current.find(p => p.id === presetId);
      if (up) applyUserPreset(up);
      return;
    }
    const preset = PRESETS.find(p => p.id === presetId);
    if (preset) applyPreset(preset.id, preset.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stepPreset = (dir: 1 | -1) => {
    if (allPresets.length === 0) return;
    const i = allPresets.findIndex(p => p.id === activePresetId);
    const next = allPresets[(i + dir + allPresets.length) % allPresets.length];
    cuePreset(next.id);
  };
  const runAction = (a: MidiAction) => {
    switch (a) {
      case 'seed':            setSeedCount(prev => prev + 1); break;
      case 'clear':           setClearTrigger(prev => prev + 1); break;
      case 'drain':           setDrainTrigger(prev => prev + 1); break;
      case 'lucky':           triggerLucky(); break;
      case 'play-toggle':     setIsActive(v => !v); break;
      case 'automate-toggle': setIsAutomated(v => !v); break;
      case 'overlays-toggle': if (overlaysVisible) hideOverlays(); else setOverlaysVisible(true); break;
      case 'macro-toggle':    updateSettings({ macroMode: !settings.macroMode }); break;
      case 'seq-play-pause':  if (sequencer.status.running) sequencer.pause(); else sequencer.play(); break;
      case 'seq-next':        sequencer.next(); break;
      case 'seq-prev':        sequencer.prev(); break;
      case 'seq-stop':        sequencer.stop(); break;
      case 'preset-next':     stepPreset(1); break;
      case 'preset-prev':     stepPreset(-1); break;
      case 'blackout-toggle': toggleBlackout(); break;
      case 'scene-toggle':    toggleScene(!sceneOn); break;
      case 'record-toggle':   toggleRecording(); break;
    }
  };
  /** The selected liquid takes a palette colour; the dropper becomes the tool. */
  const selectDye = (paletteIndex: number) => {
    const c = PALETTE[((paletteIndex % PALETTE.length) + PALETTE.length) % PALETTE.length];
    updateLiquidColor(selectedLiquidId, c.hex);
    setActiveTool('dropper');
  };
  const selectedDyeIndex = PALETTE.findIndex(c => c.hex.toLowerCase() === (selectedLiquid?.color ?? '').toLowerCase());

  // ── Phone remote ────────────────────────────────────────────────
  // The laptop is authoritative: it publishes a snapshot of the show whenever
  // anything changes, and applies commands the phone sends back. When no relay
  // is running (the Firebase-hosted build, or plain `vite dev`), the link stays
  // dormant and nothing here changes behaviour.
  const remoteState = useMemo<RemoteState>(() => ({
    settings,
    activePresetId,
    isActive,
    isAutomated,
    overlaysVisible,
    trackName: musicIntel.state.track?.title ?? null,
    sequencer: {
      name: sequencer.status.name,
      running: sequencer.status.running,
      stageIndex: sequencer.status.stageIndex,
      stageName: sequencer.status.stageName,
      progress: Math.round(sequencer.status.progress * 100) / 100,
      stages: sequencer.status.stages.map(st => ({ name: st.name, seconds: st.seconds })),
    },
    presets: allPresets.map(p => ({ id: p.id, name: p.name, macro: !!p.settings.macroMode, user: isUserPresetId(p.id) })),
    blackout,
    recording: recorder.recording ? recorder.seconds : null,
  }), [settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel.state.track?.title, sequencer.status, allPresets, blackout, recorder.recording, recorder.seconds]);

  // Patches from a phone arrive at the rate of a thumb on a slider; apply
  // them in batches so the show isn't re-rendered thirty times a second.
  const pendingPatchRef = useRef<Partial<VisualizerSettings> | null>(null);
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queuePatch = (partial: Partial<VisualizerSettings>) => {
    pendingPatchRef.current = { ...(pendingPatchRef.current ?? {}), ...partial };
    if (patchTimerRef.current) return;
    patchTimerRef.current = setTimeout(() => {
      patchTimerRef.current = null;
      const p = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (p) updateSettings(p);
    }, 50);
  };

  const remoteLink = useRemoteLink({
    role: 'display',
    state: remoteState,
    onMessage: (message) => {
      switch (message.type) {
        case 'mirrors':
          setMirrorCount(message.count);
          break;
        case 'request-cast':
          relaySendRef.current?.({ type: 'cast', message: { type: 'state', state: castState } });
          break;
        case 'patch':
          queuePatch(message.settings);
          break;
        case 'preset':
          cuePreset(message.presetId);
          break;
        case 'dye':
          updateLiquidColor(selectedLiquidId, message.color);
          setActiveTool('dropper');
          break;
        case 'liquid':
          // Only a bottle that is actually on the bench: the pad may be a
          // newer build than the display, or the other way round.
          if (liquidTypesRef.current.some(l => l.id === message.id)) {
            setSelectedLiquidId(message.id);
            setActiveTool('dropper');
          }
          break;
        case 'action':
          switch (message.action) {
            case 'play':          setIsActive(true); break;
            case 'pause':         setIsActive(false); break;
            case 'seed':          setSeedCount(prev => prev + 1); break;
            case 'clear':         setClearTrigger(prev => prev + 1); break;
            case 'drain':         setDrainTrigger(prev => prev + 1); break;
            case 'lucky':         triggerLucky(); break;
            case 'automate-on':   setIsAutomated(true); break;
            case 'automate-off':  setIsAutomated(false); break;
            case 'overlays-off':  hideOverlays(); break;
            case 'overlays-on':   setOverlaysVisible(true); break;
            case 'seq-play':      sequencer.play(); break;
            case 'seq-pause':     sequencer.pause(); break;
            case 'seq-next':      sequencer.next(); break;
            case 'seq-prev':      sequencer.prev(); break;
            case 'seq-stop':      sequencer.stop(); break;
            case 'preset-next':   stepPreset(1); break;
            case 'preset-prev':   stepPreset(-1); break;
            case 'blackout-toggle': toggleBlackout(); break;
            case 'record-toggle': toggleRecording(); break;
          }
          break;
        case 'blow':
          visualizerRef.current?.applyGesture({ tool: 'blow', x: message.x, y: message.y, layer: message.layer, amount: message.amount, dx: message.dx, dy: message.dy });
          break;
        case 'drop':
          visualizerRef.current?.applyGesture({ tool: 'drop', x: message.x, y: message.y, layer: message.layer, amount: message.amount, color: message.color ?? selectedLiquid?.color });
          break;
        case 'press':
          visualizerRef.current?.applyGesture({ tool: 'press', x: message.x, y: message.y, layer: message.layer, amount: message.amount });
          break;
        case 'tilt':
          visualizerRef.current?.setExternalTilt(message.x, message.y);
          break;
      }
    },
  });

  relaySendRef.current = remoteLink.send;

  // ── MIDI controller and game controller ─────────────────────────
  const allPresetIds = useMemo(() => allPresets.map(p => p.id), [allPresets]);
  const midi = useMidi(
    {
      getSetting: (key) => { const v = settings[key]; return typeof v === 'number' ? v : undefined; },
      setSetting: (key, value) => updateSettings({ [key]: value } as Partial<VisualizerSettings>),
      action: runAction,
      applyPreset: cuePreset,
      selectDye,
    },
    {
      activePresetId,
      dyeIndex: selectedDyeIndex,
      presetColor: (id) => {
        const contract = isUserPresetId(id) ? userPresetsRef.current.find(p => p.id === id)?.contract : PRESET_CONTRACTS[id];
        const idx = contract?.[0];
        return idx === undefined ? null : PALETTE_RGB[idx] ?? null;
      },
      paletteColor: (i) => PALETTE_RGB[i] ?? null,
      toggles: { play: isActive, automate: isAutomated, macro: !!settings.macroMode, overlays: overlaysVisible, sequencer: sequencer.status.running, blackout, record: recorder.recording },
    },
    allPresetIds,
  );
  const gamepad = useGamepad({
    gesture: (tool, x, y, amount, dx, dy) => visualizerRef.current?.applyGesture({ tool, x, y, amount, dx, dy, layer: activeLayer, color: tool === 'drop' ? selectedLiquid?.color : undefined }),
    action: runAction,
    cycleDye: (dir) => selectDye((selectedDyeIndex < 0 ? 0 : selectedDyeIndex) + dir),
    cycleLayer: (dir) => setActiveLayer(l => Math.max(0, Math.min(settings.layerCount - 1, l + dir))),
  });
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassInputs?: unknown }).chromaglassInputs = () => ({ midi: { enabled: midi.enabled, input: midi.activeInputName, bindings: midi.map.bindings.length, learning: midi.learning }, gamepad });
    }
  }, [midi.enabled, midi.activeInputName, midi.map, midi.learning, gamepad]);
  // ── A projector, noticed ──
  // A second screen that is not built in is the projector. Ask (a chip),
  // Automatic (the show goes there on the next click after it appears), or
  // Off; see useProjector. The window opens fullscreen on that screen.
  const projector = useProjector({
    send: (screen) => { void startCast('window', screen); },
    casting: isCasting,
  });
  const gamepadCursorStyle = useMemo(() => {
    if (!gamepad.cursor.visible) return null;
    const r = visualizerRef.current?.drawnRect?.();
    const box = r ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    return { left: box.left + gamepad.cursor.x * box.width, top: box.top + (1 - gamepad.cursor.y) * box.height };
  }, [gamepad.cursor]);

  // Derive preset name for display
  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    return allPresets.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId, allPresets]);

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden font-sans text-white ${overlaysVisible ? '' : 'overlays-hidden'}`}>
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audioData} settings={effectiveSettings} seedCount={seedCount}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
        drainTrigger={drainTrigger} activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
        sceneRef={scene.reading}
        frame={preview.frame}
        onManualGesture={musicIntel.recordGesture}
        onEngineStatus={(next) => {
          // The live reading goes in a ref (the settings panel polls it while
          // open); the shell only re-renders when the engine itself changed.
          engineStatusRef.current = next;
          setEngineStatus((prev) =>
            prev && prev.label === next.label && prev.steppedDown === next.steppedDown &&
            prev.gpuUnavailable === next.gpuUnavailable ? prev : next,
          );
        }}
      />

      {/* A game controller's cursor: a ring over the plate, shown while the sticks move */}
      {gamepadCursorStyle && (
        <div
          className="pointer-events-none fixed z-30 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 shadow-[0_0_12px_rgba(255,255,255,0.6)] transition-transform"
          style={{ left: gamepadCursorStyle.left, top: gamepadCursorStyle.top, width: gamepad.cursor.pressing ? 44 : 28, height: gamepad.cursor.pressing ? 44 : 28, backgroundColor: gamepad.cursor.pressing ? `${selectedLiquid?.color ?? '#fff'}55` : 'transparent' }}
          data-testid="gamepad-cursor"
        />
      )}

      {/* The music file's player: always audible, never in the way */}
      <audio ref={musicElRef} className="hidden" preload="auto"
        onPlay={() => setMusicPlaying(true)} onPause={() => setMusicPlaying(false)}
        onTimeUpdate={(e) => { const el = e.currentTarget; setMusicTime({ t: el.currentTime, d: el.duration || 0 }); }}
        onEnded={() => setMusicPlaying(false)} />
      {musicFile && overlaysVisible && (
        <div className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-xl shadow-2xl" data-testid="music-player">
          <button onClick={() => { const el = musicElRef.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); }} className="p-1.5 rounded-full hover:bg-white/10" aria-label={musicPlaying ? 'Pause music' : 'Play music'} data-testid="music-play">
            {musicPlaying ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
          </button>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/80 max-w-[160px] truncate" title={musicFile.name}>{musicFile.name}</span>
          <span className="font-mono text-[9px] text-white/40">{Math.floor(musicTime.t / 60)}:{String(Math.floor(musicTime.t % 60)).padStart(2, '0')}</span>
          <input type="range" min={0} max={Math.max(1, musicTime.d)} step={0.1} value={Math.min(musicTime.t, musicTime.d || 0)}
            onChange={(e) => { const el = musicElRef.current; if (el) el.currentTime = parseFloat(e.target.value); }}
            className="w-40 h-6 accent-white cursor-pointer" aria-label="Seek" data-testid="music-seek" />
          <span className="font-mono text-[9px] text-white/40">{Math.floor(musicTime.d / 60)}:{String(Math.floor(musicTime.d % 60)).padStart(2, '0')}</span>
          <button onClick={closeMusicFile} className="p-1 rounded-full hover:bg-white/10 text-white/50" aria-label="Close music file" data-testid="music-close"><X size={12} /></button>
        </div>
      )}
      {projector.projector && !isCasting && overlaysVisible && projector.mode !== 'off' && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 pl-4 pr-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl shadow-2xl" data-testid="projector-hint">
          <button onClick={() => { void projector.sendNow(); }} className="flex items-center gap-2 hover:text-white" title="Open the show full size on the second screen, with nothing else on it">
            <Projector size={13} /> {projector.projector.label} connected · {projector.armed ? 'sending on your next click' : 'send the show there'}
          </button>
          <button
            onClick={() => projector.setMode(projector.mode === 'auto' ? 'ask' : 'auto')}
            className={`ml-2 rounded-full border px-2 py-0.5 text-[9px] ${projector.mode === 'auto' ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-100' : 'border-white/15 text-white/50 hover:text-white'}`}
            title="Always send the show to a projector the moment it is connected"
            data-testid="projector-auto"
          >
            {projector.mode === 'auto' ? 'automatic' : 'always'}
          </button>
          <button onClick={() => projector.setMode('off')} className="p-1 text-white/30 hover:text-white" aria-label="Dismiss and stop offering" title="Don't offer this (Settings → Projectors turns it back on)"><X size={11} /></button>
        </div>
      )}
      {isCasting && windowFullscreen === false && overlaysVisible && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-100/90 backdrop-blur-xl shadow-2xl" data-testid="projector-fill">
          <Projector size={13} /> The projector window still has its title bar
          <button onClick={fillWindow} className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] hover:bg-amber-500/30" title="Fill the projector's screen (the browser's own full screen, which drops the title bar). Any click here does it too.">fill its screen</button>
        </div>
      )}
      {settings.macroMode && overlaysVisible && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 translate-y-9 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl shadow-2xl" data-testid="macro-zoom">
          <Microscope size={12} className="ml-1" />
          <button onClick={() => zoomMacro(-1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom out (− or the wheel over the plate)" aria-label="Zoom out" data-testid="macro-zoom-out">−</button>
          <span className="font-mono tabular-nums" data-testid="macro-zoom-value">{(settings.macroZoom ?? 4).toFixed(1)}×</span>
          <button onClick={() => zoomMacro(1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom in (+ or the wheel over the plate)" aria-label="Zoom in" data-testid="macro-zoom-in">+</button>
        </div>
      )}
      {blackout && overlaysVisible && (
        <div className="pointer-events-none fixed top-3 right-1/2 translate-x-[120px] z-40 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-red-200" data-testid="blackout-chip">Blackout · B</div>
      )}

      {/* ── Clean-screen hint: the one thing shown after everything is hidden ── */}
      <AnimatePresence>

        {!overlaysVisible && showCleanHint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1.2 } }}
            className="pointer-events-none absolute bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/50 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/60 backdrop-blur-xl"
          >
            Esc — or hold a finger down — brings the controls back
          </motion.div>
        )}
      </AnimatePresence>

      {/* Everything below is an overlay on the liquid; clean screen removes it all. */}
      <div hidden={!overlaysVisible} className="contents">

      {/* ── UI Overlay ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showControls && !showSettings && (
          <>
            {/* ── Left Controls ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`absolute top-1/2 -translate-y-1/2 left-4 z-10 flex flex-col items-start gap-4 transition-all duration-300 max-h-[calc(100vh-260px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? '-translate-x-[150%] opacity-0' : ''}`}
            >
              <div className="flex flex-col items-center gap-3 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-4 shadow-2xl">

                {/*
                  The bottles, in two groups — always visible.

                  They used to be one flat list of nine coloured chips, which
                  made Soap look like a pale green dye and Milk like an off-
                  white one. Four of the nine are not colours at all: they
                  write into a field the plate carries and go on acting for
                  half a minute, and nothing in a flat list said so. The
                  split, and the line of what the selected one does, are the
                  whole difference between a menu and an instrument.
                */}
                {([
                  ['Dye', liquidTypes.filter(l => !l.behaviour)],
                  ['Changes the plate', liquidTypes.filter(l => l.behaviour)],
                ] as const).map(([groupLabel, group]) => group.length === 0 ? null : (
                  <div key={groupLabel} className="flex flex-col gap-1.5 w-full">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-white/60">{groupLabel}</span>
                    {group.map((liq) => {
                      const isSelected = liq.id === selectedLiquidId;
                      return (
                        <button
                          key={liq.id}
                          onClick={() => { setSelectedLiquidId(liq.id); setActiveTool('dropper'); }}
                          title={liq.description}
                          data-testid={`liquid-${liq.id}`}
                          className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            isSelected ? 'text-white' : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
                          }`}
                          style={isSelected ? {
                            borderColor: liq.color,
                            backgroundColor: `${liq.color}28`,
                          } : {}}
                        >
                          <span
                            className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white/30"
                            style={{ backgroundColor: liq.color }}
                          />
                          <span className="text-[11px] font-bold uppercase tracking-wider flex-1">{liq.name}</span>
                          {isSelected && (
                            <label className="relative cursor-pointer flex-shrink-0" onClick={e => e.stopPropagation()} title="Change color">
                              <span className="text-[11px] text-white/40 hover:text-white transition-colors px-1">color</span>
                              <input
                                type="color"
                                value={liq.color}
                                onChange={(e) => updateLiquidColor(liq.id, e.target.value)}
                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                              />
                            </label>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {selectedLiquid?.description && (
                  <p className="text-[11px] leading-snug text-white/40 w-full -mt-1" data-testid="liquid-description">
                    {selectedLiquid.description}
                  </p>
                )}

                {/* Quick color swatches — one click recolors the selected liquid */}
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-white/60">Dye Color</span>
                  <div className="grid grid-cols-8 gap-1">
                    {DROPPER_COLORS.map(hex => {
                      const isCurrent = selectedLiquid?.color.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          onClick={() => updateLiquidColor(selectedLiquidId, hex)}
                          className={`w-[26px] h-[26px] rounded-full border transition-transform hover:scale-110 ${
                            isCurrent ? 'border-white scale-110 shadow-[0_0_6px_rgba(255,255,255,0.6)]' : 'border-white/20'
                          }`}
                          style={{ backgroundColor: hex }}
                          title={PALETTE.find(p => p.hex === hex)?.name ?? hex}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="h-px w-full bg-white/10"></div>

                {/* Palette lock — pins the ambient/auto/music color harmony */}
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-white/60">Palette</span>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    <button
                      onClick={() => selectPalette(null)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                        paletteLock == null ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider flex-1">Auto</span>
                      <span className="text-[8px] opacity-50">follows music</span>
                    </button>
                    {COLOR_HARMONIES.map((harmony, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectPalette(idx)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                          paletteLock === idx ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                        }`}
                        title={COLOR_HARMONY_NAMES[idx]}
                      >
                        <span className="flex gap-0.5">
                          {harmony.slice(0, 4).map((pi, i) => (
                            <span key={i} className="w-3 h-3 rounded-full border border-black/30" style={{ backgroundColor: PALETTE[pi].hex }} />
                          ))}
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider truncate">{COLOR_HARMONY_NAMES[idx]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px w-full bg-white/10"></div>

                {/* Tools */}
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-white/60">Tools</span>
                  <div className="grid grid-cols-3 gap-1 w-full">
                    {([
                      { id: 'dropper' as const, icon: Droplet, label: 'Drop' },
                      { id: 'spray' as const, icon: SprayCan, label: 'Spray' },
                      { id: 'splatter' as const, icon: Paintbrush, label: 'Splat' },
                      { id: 'pour' as const, icon: FlaskConical, label: 'Pour' },
                      { id: 'streak' as const, icon: Slash, label: 'Streak' },
                      { id: 'blow' as const, icon: Wind, label: 'Blow' },
                      { id: 'press' as const, icon: Hand, label: 'Press' },
                    ]).map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => setActiveTool(id)}
                        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg border transition-all ${
                          activeTool === id
                            ? 'border-white/40 bg-white/15 text-white'
                            : 'border-white/10 bg-white/5 text-white/40 hover:text-white'
                        }`}
                      >
                        <Icon size={11} />
                        <span className="text-[7px] uppercase font-bold tracking-wider">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px w-full bg-white/10"></div>

                {/* Image Upload */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl border border-white/10 bg-white/5 text-white/50 hover:text-white hover:bg-white/12 hover:border-white/25 transition-all active:scale-95"
                  title="Upload an image as colored dye — it will dissolve into the fluid"
                >
                  <ImagePlus size={12} />
                  <span className="text-[8px] uppercase font-bold tracking-wider">Image Dye</span>
                </button>

              </div>
            </motion.div>

            {/* ── Right Controls ──────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`absolute top-1/2 -translate-y-1/2 right-4 z-10 transition-all duration-300 max-h-[calc(100vh-260px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? 'translate-x-[150%] opacity-0' : ''}`}
            >
              <div className="flex flex-col items-center gap-3 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-4 shadow-2xl">

                {/* Play/Pause */}
                <button
                  onClick={() => setIsActive(!isActive)}
                  className={`p-3 rounded-full transition-all duration-300 ${
                    isActive
                      ? 'bg-white/15 hover:bg-white/25 text-white shadow-[0_0_15px_rgba(255,255,255,0.15)]'
                      : 'bg-white hover:bg-gray-200 text-black shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  }`}
                  title={isActive ? "Pause" : "Play"}
                >
                  {isActive ? <Pause size={20} /> : <Play size={20} fill="currentColor" />}
                </button>

                {/*
                  In Perform these three are on the desk's faders, larger and
                  in one place. Drawing them here as well would put Sound Drive
                  and Evolve Speed on screen twice, which is exactly the thing
                  a user caught in the sound picker.
                */}
                {!performing && <>
                <div className="w-full h-px bg-white/10" />

                {/* Sound Drive */}
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Sound Drive</span>
                    <span className="text-[8px] font-bold text-white/50">{Math.round(settings.audioImpact * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.audioImpact}
                    onChange={e => updateSettings({ audioImpact: parseFloat(e.target.value) })}
                    className="w-full h-6 appearance-none rounded-full cursor-pointer accent-purple-400"
                    style={{ background: `linear-gradient(to right, rgb(192,132,252) ${settings.audioImpact * 100}%, rgba(255,255,255,0.1) ${settings.audioImpact * 100}%)` }}
                    title="Controls how strongly sound impacts the visuals"
                  />
                </div>

                <div className="w-full h-px bg-white/10" />

                {/* Random Evolve */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Random Evolve</span>
                  <button
                    onClick={() => setIsAutomated(!isAutomated)}
                    className={`relative w-[52px] h-[26px] rounded-full transition-colors duration-300 ${isAutomated ? 'bg-purple-500' : 'bg-white/20'}`}
                    title="Auto-generate dye drops and air bursts from audio"
                  >
                    <motion.div
                      className="absolute top-[3px] left-[3px] w-5 h-5 bg-white rounded-full shadow-md"
                      animate={{ x: isAutomated ? 26 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                  {/* How fast it evolves: a drop or a blow every second or so at the left, a frenzy at the right */}
                  <div className={`flex flex-col gap-1 w-full mt-1 transition-opacity ${isAutomated ? '' : 'opacity-40'}`}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Evolve Speed</span>
                      <span className="text-[8px] font-bold text-white/50">{Math.round((settings.automateRate ?? 0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={settings.automateRate ?? 0}
                      onChange={e => updateSettings({ automateRate: parseFloat(e.target.value) })}
                      className="w-full h-6 appearance-none rounded-full cursor-pointer accent-purple-400"
                      style={{ background: `linear-gradient(to right, rgb(192,132,252) ${(settings.automateRate ?? 0) * 100}%, rgba(255,255,255,0.1) ${(settings.automateRate ?? 0) * 100}%)` }}
                      title="How quickly Random Evolve adds drops and blows"
                      data-testid="evolve-speed"
                    />
                  </div>
                </div>
                </>}

                <div className="w-full h-px bg-white/10" />

                {/* Macro closeup */}
                <button
                  onClick={() => updateSettings({ macroMode: !settings.macroMode })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    settings.macroMode ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Macro closeup — magnify the plate and chase a single bead of liquid"
                >
                  <Microscope size={16} className={settings.macroMode ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Macro</span>
                </button>

                {/* Settings */}
                <button
                  onClick={() => { setShowSettings(!showSettings); setShowHelp(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showSettings ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Open settings"
                >
                  <Settings size={16} className={showSettings ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Settings</span>
                </button>

                {/* Perform or Design */}
                <button
                  onClick={() => setDeskMode(m => (m === 'perform' ? 'design' : 'perform'))}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    deskMode === 'perform' ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title={deskMode === 'perform'
                    ? (roomForDesk
                      ? 'Perform: the plate is a preview and the controls have the room. Click for Design.'
                      : 'Perform needs a wider window — showing Design until there is room for both columns.')
                    : 'Design: the plate fills the window, for building a look. Click for Perform.'}
                  data-testid="desk-mode-button"
                >
                  <LayoutGrid size={16} className={deskMode === 'perform' ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">{deskMode === 'perform' ? 'Perform' : 'Design'}</span>
                </button>

                {/* Show sequencer */}
                <button
                  onClick={() => { setShowSequencer(!showSequencer); setShowTrackPanel(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showSequencer || sequencer.status.running ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Show sequencer — script how the show evolves over a song or a set"
                  data-testid="sequencer-button"
                >
                  <Clapperboard size={16} className={showSequencer || sequencer.status.running ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Sequence</span>
                </button>

                {/* MIDI controller */}
                <button
                  onClick={() => { setShowMidi(!showMidi); setShowSequencer(false); setShowTrackPanel(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showMidi ? 'bg-white text-black border-white' : midi.enabled ? 'bg-emerald-500/20 border-emerald-400/40' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title={midi.enabled ? `MIDI on${midi.activeInputName ? `: ${midi.activeInputName}` : ''}${gamepad.connected ? ` · gamepad: ${gamepad.connected}` : ''}` : 'MIDI controller — faders, pads and buttons for the show'}
                  data-testid="midi-button"
                >
                  <Sliders size={16} className={showMidi || midi.enabled ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">MIDI</span>
                </button>

                {/* Randomize */}
                <button
                  onClick={() => {
                    if (performing && !luckyArmed) { setLuckyArmed(true); return; }
                    setLuckyArmed(false);
                    triggerLucky();
                  }}
                  data-testid="lucky-button"
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    luckyArmed ? 'bg-amber-400 text-black border-amber-400' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title={luckyArmed
                    ? 'Click again to replace every setting with a random one. Revert brings this look back.'
                    : 'Randomize all settings — the look it replaces is kept, so Revert brings it back'}
                >
                  <Sparkles size={16} className={luckyArmed ? '' : 'text-yellow-400 group-hover:scale-110 transition-transform'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">{luckyArmed ? 'Sure?' : 'Random'}</span>
                </button>

                <div className="w-full h-px bg-white/10" />

                {/* Layers */}
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="flex items-center gap-1.5">
                    <Layers size={11} className="text-white/40" />
                    <span className="text-[8px] uppercase tracking-widest font-bold opacity-40">Layers</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {Array.from({ length: settings.layerCount }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveLayer(idx)}
                        className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-[11px] font-bold ${
                          activeLayer === idx ? 'border-white bg-white text-black scale-110 shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'border-white/20 text-white/50 hover:border-white/50'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setDrainTrigger(prev => prev + 1)}
                    className="py-1.5 px-2 rounded-lg text-[11px] uppercase tracking-widest font-bold opacity-70 hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                    title="Drain — swirls all dye down the drain"
                  >
                    Drain
                  </button>
                </div>

                <div className="w-full h-px bg-white/10" />

                {/* Audio Sources */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <span className="text-[7px] uppercase tracking-widest font-bold opacity-30">Audio</span>
                  <button
                    onClick={() => handleSourceChange(audioSource === 'microphone' ? 'none' : 'microphone')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'microphone'
                        ? 'text-green-400 bg-green-400/10 border border-green-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={audioSource === 'microphone' ? "Mic is active — click to mute" : "Enable microphone input"}
                  >
                    {audioSource === 'microphone' ? <Mic size={14} /> : <MicOff size={14} />}
                    <span>Mic</span>
                  </button>
                  <button
                    onClick={() => handleSourceChange(audioSource === 'system' ? 'none' : 'system')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'system'
                        ? 'text-blue-400 bg-blue-400/10 border border-blue-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={audioSource === 'system' ? "System audio active — click to stop" : "Capture system/tab audio"}
                  >
                    <Monitor size={14} />
                    <span>System</span>
                  </button>
                  <button
                    onClick={() => musicInputRef.current?.click()}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'file'
                        ? 'text-amber-300 bg-amber-400/10 border border-amber-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title="Play a music file here and drive the show from it — no microphone, no loopback"
                    data-testid="music-file-button"
                  >
                    <FileAudio size={14} />
                    <span>File</span>
                  </button>
                  <button
                    onClick={() => handleSourceChange(audioSource === 'simulated' ? 'none' : 'simulated')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'simulated'
                        ? 'text-fuchsia-300 bg-fuchsia-400/10 border border-fuchsia-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title="A synthesised band, played silently into the show: kick, snare, hats, bass and a pad, in verses and choruses. No microphone, no permission, nothing to be asked for"
                    data-testid="simulated-audio-button"
                  >
                    <Music size={14} />
                    <span>Band</span>
                  </button>
                  <input ref={musicInputRef} type="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac" className="hidden" data-testid="music-file-input"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) playMusicFile(f); }} />
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Run-it-locally nudge (hosted build, once the governor has stepped down) ── */}
      <AnimatePresence>
        {showControls && !showSettings && !isMinimized && <RunLocallyCard status={engineStatus} />}
      </AnimatePresence>

      {/* ── Minimize / clean-screen chips ──────────────────────── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[11px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
          title={isMinimized ? "Show Controls" : "Hide Controls"}
        >
          {isMinimized ? <Eye size={14} /> : <EyeOff size={14} />}
          {isMinimized ? 'Show UI' : 'Hide UI'}
        </button>
        <button
          onClick={hideOverlays}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[11px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
          title="Clean screen: hide every overlay and the cursor. Esc brings them back."
        >
          <MonitorOff size={14} />
          Clean Screen
        </button>
      </div>

      {/* ── Settings Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onUpdate={updateSettings}
            calibration={audioData?.calibration ?? null}
            onRecalibrate={() => setCalibrateNonce(n => n + 1)}
            engineStatus={engineStatus}
            getLiveEngineStatus={() => engineStatusRef.current}
            audioInputs={audioInputs}
            audioInputId={audioInputId}
            onAudioInput={chooseAudioInput}
            blackout={blackout}
            onBlackout={toggleBlackout}
            projectorMode={projector.mode}
            onProjectorMode={projector.setMode}
            projectorName={projector.projector?.label ?? null}
            sceneOn={sceneOn}
            onSceneToggle={toggleScene}
            sceneState={scene.state}
            sceneDevices={scene.devices}
            sceneDeviceId={sceneDeviceId}
            onSceneDevice={chooseSceneDevice}
            scenePreviewRef={scenePreviewRef}
            filmSource={filmSource}
            onFilmFile={loadFilm}
            onFilmCamera={startFilmCamera}
            onFilmClear={clearFilm}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      {/* ── MIDI ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showMidi && (
          <MidiPanel midi={midi} presets={allPresets.map(p => ({ id: p.id, name: p.name }))} onClose={() => setShowMidi(false)} />
        )}
      </AnimatePresence>

      {/* ── Show Sequencer ─────────────────────────────────────── */}
      <AnimatePresence>
        {showSequencer && (
          <SequencerPanel
            sequences={sequencer.sequences}
            selectedId={sequencer.selectedId}
            onSelect={sequencer.setSelectedId}
            status={sequencer.status}
            onPlay={sequencer.play}
            onPause={sequencer.pause}
            onStop={sequencer.stop}
            onNext={sequencer.next}
            onPrev={sequencer.prev}
            onGoTo={sequencer.goTo}
            onSave={sequencer.upsertSequence}
            onRemove={sequencer.removeSequence}
            hasSections={musicIntel.state.section !== null}
            presets={allPresets}
            onExport={exportSequence}
            onImportFile={importSequenceFile}
            currentSong={currentSong}
            onBindSong={bindSequenceToSong}
            onClose={() => setShowSequencer(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Track Panel ────────────────────────────────────────── */}
      <AnimatePresence>
        {showTrackPanel && (
          <TrackPanel
            state={musicIntel.state}
            musicSettings={musicSettings}
            onUpdateMusicSettings={updateMusicSettings}
            onManualTag={musicIntel.manualTag}
            onReplayListen={musicIntel.replayListen}
            onStopReplay={musicIntel.stopReplay}
            onClose={() => setShowTrackPanel(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Lyrics Overlay ─────────────────────────────────────── */}
      {musicSettings.enabled && musicSettings.lyricsOverlay && (
        <LyricsOverlay
          line={musicIntel.state.line}
          sentiment={musicIntel.state.sectionSentimentValue}
        />
      )}

      {/* ── Save-performance prompt (post-song, otherwise discarded) ── */}
      <AnimatePresence>
        {musicIntel.pendingPerformance && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-purple-400/30 rounded-2xl px-5 py-3 shadow-2xl"
          >
            <div className="text-xs">
              <div className="font-bold">Keep your light-show performance?</div>
              <div className="opacity-60 text-[10px] mt-0.5">
                {musicIntel.pendingPerformance.gestureCount} gestures painted during
                {musicIntel.pendingPerformance.title ? ` “${musicIntel.pendingPerformance.title}”` : ' this listen'}
              </div>
            </div>
            <button
              onClick={musicIntel.savePendingPerformance}
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-[11px] font-bold uppercase tracking-widest transition-colors"
            >
              Save
            </button>
            <button
              onClick={musicIntel.discardPendingPerformance}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold uppercase tracking-widest text-white/60 transition-colors"
            >
              Discard
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Bar ────────────────────────────────────────────── */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-50 pointer-events-none">
        <div className="relative flex flex-col pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-2xl">
          <h1 className="text-2xl font-light tracking-tighter italic font-serif">
            Chroma<span className="font-bold not-italic">Glass</span>
          </h1>
          {/* The preset's name is the menu: one click from the top of the screen. */}
          <button
            onClick={() => setPresetMenu(presetMenu === 'title' ? 'none' : 'title')}
            className="flex items-center gap-2 mt-0.5 py-1.5 -mx-1 px-1 rounded-lg group"
            title="Choose a preset"
            aria-haspopup="menu"
            aria-expanded={presetMenu === 'title'}
            data-testid="preset-title-button"
          >
            <p className="text-[11px] uppercase tracking-widest opacity-40 group-hover:opacity-80 transition-opacity">
              {activePresetName ? activePresetName : 'Custom'}
            </p>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 uppercase tracking-wider font-bold flex items-center gap-1 group-hover:bg-white/20 transition-colors">
              Preset <ChevronDown size={9} />
            </span>
          </button>
          {presetMenu === 'title' && (
            <PresetMenu activePresetId={activePresetId} onApplyPreset={applyPreset} onCuePreset={cueLook} onClose={() => setPresetMenu('none')} userPresets={userPresets.presets} onApplyUserPreset={applyUserPreset} onSaveCurrent={saveCurrentPreset} onLoadFile={loadPresetFile} onExportUserPreset={userPresets.exportPreset} onDeleteUserPreset={userPresets.remove} currentSong={currentSong} align="left" />
          )}
        </div>

        <div className="flex gap-2 pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-2xl">
          <button
            onClick={() => { setShowTrackPanel(!showTrackPanel); setShowSequencer(false); }}
            className={`relative p-2 rounded-full transition-all ${
              showTrackPanel ? 'bg-purple-500 text-white' : 'hover:bg-white/10 text-white/60'
            }`}
            title={musicIntel.state.track ? `${musicIntel.state.track.title} — ${musicIntel.state.track.artist}` : 'Track intelligence'}
          >
            <Music size={14} />
            {musicIntel.state.track && !showTrackPanel && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />
            )}
          </button>
          {recorder.supported && (
            <button
              onClick={toggleRecording}
              className={`p-2 rounded-full transition-all flex items-center gap-1 ${recorder.recording ? 'bg-red-600 text-white' : 'hover:bg-white/10 text-white/60'}`}
              title={recorder.recording ? 'Stop recording and save the video' : 'Record the show to a video file'}
              data-testid="record-button"
            >
              {recorder.recording ? <Square size={12} fill="currentColor" /> : <Circle size={14} />}
              {recorder.recording && <span className="text-[11px] font-mono" data-testid="record-time">{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}</span>}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => { if (isCasting) { stopCast(); setCastMenu(false); } else setCastMenu(!castMenu); }}
              className={`p-2 rounded-full transition-all ${
                isCasting ? 'bg-blue-500 text-white' : castMenu ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/60'
              }`}
              title={isCasting ? "Stop casting" : "Cast to display"}
              aria-haspopup="menu"
              aria-expanded={castMenu}
              data-testid="cast-button"
            >
              <Cast size={14} />
            </button>
            {castMenu && !isCasting && (
              <div
                className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/10 bg-[#0b0b10]/95 backdrop-blur-xl p-2 shadow-2xl z-[60] pointer-events-auto"
                style={{ animation: 'chromaglass-menu-in 0.15s ease-out' }}
                role="menu"
                data-testid="cast-menu"
              >
                <button
                  role="menuitem"
                  onClick={() => { setCastMenu(false); startCast('window'); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10"
                  data-testid="cast-window"
                >
                  <div className="text-xs font-semibold">Second display</div>
                  <div className="text-[10px] opacity-50 leading-snug mt-0.5">A projector on HDMI: opens a window on the second screen showing this very canvas, rendered at the projector's own pixels, filling that screen with no title bar (with the permission; else the next click here fills it). This window keeps the controls and a scaled copy.</div>
                </button>
                <div className="px-3 py-2 rounded-lg" data-testid="cast-network">
                  <div className="text-xs font-semibold">Network display{mirrorCount > 0 ? ` · ${mirrorCount} connected` : ''}</div>
                  {relay ? (
                    <div className="text-[10px] opacity-50 leading-snug mt-0.5">
                      Open this on any browser — a projector, a TV, a tablet — and it shows the show. Same Wi-Fi:
                      {(relay.hosts.length ? relay.hosts : [window.location.hostname]).map((h) => (
                        <div key={h} className="font-mono text-white/80 select-all mt-0.5">http://{h}:{relay.port}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
                      ))}
                      {!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) && !relay.hosts.includes(window.location.hostname) && (
                        <>
                          <div className="mt-1">Through the tunnel, from anywhere:</div>
                          <div className="font-mono text-white/80 select-all mt-0.5">{window.location.origin}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
                        </>
                      )}
                      <div className="mt-1">Across buildings or other access points: run <span className="font-mono">npm run tunnel</span> and use the https address it prints, with the same <span className="font-mono">?cast=true&amp;key=…</span>.</div>
                    </div>
                  ) : (
                    <div className="text-[10px] opacity-50 leading-snug mt-0.5">Needs the show server: run <span className="font-mono">npm run remote</span> and open the show from there, then this lists the address.</div>
                  )}
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setCastMenu(false); startCast('device'); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10"
                  data-testid="cast-device"
                >
                  <div className="text-xs font-semibold">Chromecast</div>
                  <div className="text-[10px] opacity-50 leading-snug mt-0.5">Chrome's device picker. Nest displays take the show directly. A Google TV that does not appear or connect here: open Second display, then Chrome's menu → Cast → the TV → Cast tab, on that window.</div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`min-w-[34px] min-h-[34px] rounded-full transition-all text-[12px] font-bold ${
              showHelp ? 'bg-white text-black' : 'hover:bg-white/10 text-white/60'
            }`}
            title="About ChromaGlass — getting started, every control, and how they interact (?)"
            data-testid="guide-button"
          >
            ?
          </button>
        </div>
      </div>

      {/* ── The desk ───────────────────────────────────────────── */}
      {/*
        A layout with a hole in it. The plate is a `position: fixed` canvas
        that must never be re-parented — a remount takes the WebGL context and
        the show restarts — so the desk lays out normally around an empty box,
        and the canvas is painted over that box's rectangle.

        The left inset clears the bottles and tools that already float there,
        so nothing has to move house to make room for this.
      */}
      {performing && overlaysVisible && (
        <div className="fixed inset-0 z-[5] pointer-events-none" data-testid="desk">
          {/*
            The insets clear what already floats over the plate: the bottles
            and dye swatches on the left, the toolbar on the right, the title
            above and the Hide UI / Clean Screen row below. Nothing has to move
            house to make room for the desk — it takes the space that was left.
          */}
          <div className="h-full flex flex-col gap-3 pt-24 pb-28 pl-[15rem] pr-[11rem]">
            <StatusLine
              lookName={liveLookName}
              lookFor={lookFor}
              sequence={{
                running: sequencer.status.running,
                name: sequencer.status.name,
                stageName: sequencer.status.stageName,
                progress: sequencer.status.progress,
              }}
              audioSource={audioSource === 'none' ? 'silent' : audioSource === 'simulated' ? 'band' : audioSource}
              level={audioData ? Math.min(1, audioData.volume / 70) : 0}
              engine={engineStatus?.label ?? ''}
              casting={isCasting}
              midiOn={midi.enabled}
              cameraOn={scene.state.active}
              recordingFor={recorder.recording ? recorder.seconds : null}
              blackout={blackout}
            />
            <div className="flex-1 flex items-stretch gap-4 min-h-0">
            <div ref={preview.ref} className="flex-1 min-w-0" data-testid="desk-preview" />
            <aside
              className="w-80 shrink-0 overflow-y-auto scrollbar-hide rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl p-4 pointer-events-auto"
              data-testid="desk-column"
            >
              <RideStrip
                settings={settings}
                keys={rideKeys}
                onChange={updateSettings}
                onKeys={setRideKeys}
              />
            </aside>
            </div>
          </div>
        </div>
      )}

      {/* ── The cued look, and the button that sends it ────────── */}
      <AnimatePresence>
        {(cued || fading > 0 || previousLook.current) && (
          <CueBar
            cued={cued}
            liveName={liveLookName}
            fading={fading}
            fadeSeconds={fadeSeconds}
            onFadeSeconds={setFadeSeconds}
            onGo={() => goLook()}
            onCancel={() => setCued(null)}
            onRevert={previousLook.current ? revertLook : null}
          />
        )}
      </AnimatePresence>

      {/* ── About: the manual ─────────────────────────────────── */}
      {/*
        This used to be a five-line popover, and by the time anyone read it two
        of the five lines were wrong — it still sent people to the settings
        panel for presets months after the presets moved to the title. A short
        help text that nobody owns rots; a manual with a section per control
        group is at least somewhere the truth can be kept.
      */}
      <AnimatePresence>
        {showHelp && <GuidePanel onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      {/* ── Audio Meters (bottom-left, out of the way) ─────────── */}
      {isActive && audioData && !isMinimized && (
        <div className="absolute bottom-6 left-6 z-10 flex items-end gap-1 opacity-30 pointer-events-none">
          {[
            { label: 'B', value: audioData.bass },
            { label: 'M', value: audioData.mid },
            { label: 'T', value: audioData.treble },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="w-1.5 h-16 bg-white/10 rounded-full overflow-hidden relative">
                <motion.div
                  className="absolute bottom-0 w-full bg-white/80 rounded-full"
                  animate={{ height: `${Math.min(100, value)}%` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              </div>
              <span className="text-[7px] uppercase font-bold opacity-60">{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Background Glow ────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vh] bg-purple-500/5 blur-[100px] rounded-full" />
      </div>

      </div>
    </div>
  );
}
