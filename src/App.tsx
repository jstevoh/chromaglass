import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer, LiquidVisualizerHandle } from './components/LiquidVisualizer';
import { PRESET_CONTRACTS } from './presetPlate';
import { SettingsPanel } from './components/SettingsPanel';
import { SETTINGS_SECTIONS, sectionSearchText } from './lib/settingsMap';
import { GuidePanel } from './components/GuidePanel';
import { CueBar } from './components/CueBar';
import { Info } from './components/Info';
import { usePreviewFrame } from './hooks/usePreviewFrame';
import { PerformDesk, DEFAULT_RIDES, type Cue } from './components/desk/PerformDesk';
import { DEFAULT_RECIPE, loadPins, savePins, togglePin, type DeskSurface } from './lib/deskPins';
import { luckyLook } from './lib/lucky';
import { driftLook } from './lib/drift';
import { unhandled } from './lib/unhandled';
import { CommandPalette, type Command } from './components/desk/CommandPalette';
import { DesignDesk } from './components/desk/DesignDesk';
import { SoundPanel } from './components/SoundPanel';
import { startPlateDrone, DRONE_DEFAULTS, PLATE_PLACES, type Drone, type DroneParams } from './lib/plateDrone';
import { SaveLookSheet } from './components/desk/SaveLookSheet';
import { AddToSetSheet } from './components/desk/AddToSetSheet';
import type { SetAction, SetItemAction } from './components/desk/PerformDesk';
import { blendLooks, targetLook, evolvedLook, RIG_KEYS, DEFAULT_FADE_SECONDS } from './lib/lookFade';
import { SettingRide } from './lib/ride';
import { Play, Pause, Mic, MicOff, Settings, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor, MonitorOff, X, ImagePlus, SprayCan, Paintbrush, FlaskConical, Slash, Cast, Music, Microscope, Clapperboard, ChevronDown, LayoutGrid, Sliders, Gamepad2, Hand, FileAudio, Circle, Square, Projector, Fingerprint, Magnet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { loadCustomLiquids, saveCustomLiquids, isCustomLiquid } from './lib/liquidFile';
import { loadToolAmounts, saveToolAmounts, clampAmount } from './lib/toolAmount';
import { ToolAmount } from './components/ToolAmount';
import { PRESETS } from './presets';
import { useCastSender } from './hooks/useCastSession';
import { useRemoteLink } from './hooks/useRemoteLink';
import { relayInfo, type RemoteState, type RelayInfo } from './lib/remoteProtocol';
import { TimecodeReader, formatTimecode, type TimecodePosition } from './lib/timecode';
import type { CastState, CastMessage } from './lib/castProtocol';
import type { RemoteMessage } from './lib/remoteProtocol';
import { runBench, formatBench, readRenderer } from './lib/bench';
import type { BenchOptions } from './lib/bench';
import { BenchOverlay } from './components/BenchOverlay';
import type { EngineStatus } from './lib/platform';
import { RunLocallyCard } from './components/RunLocallyCard';
import { SequencerPanel } from './components/SequencerPanel';
import { SongsPanel, type LookChoice } from './components/SongsPanel';
import { useSongShows } from './hooks/useSongShows';
import { BUILT_IN_SETS, loadSets, loadShows, saveSets, saveShows, savedLooksUsed, showsFile, titleRows, showFor, type ActionSet, type SongAction, type SongShow } from './lib/songShows';
import { MidiPanel } from './components/MidiPanel';
import { MidiActivity } from './components/MidiActivity';
import { useMidi } from './hooks/useMidi';
import { useGamepad } from './hooks/useGamepad';
import { useSceneCamera } from './hooks/useSceneCamera';
import { useFilmSense } from './hooks/useFilmSense';
import { touch } from './lib/midiTouch';
import { startSimulatedMusic, type SimulatedMusic } from './lib/simulatedMusic';
import { useRecorder } from './hooks/useRecorder';
import { useProjector } from './hooks/useProjector';
import { useWakeLock } from './hooks/useWakeLock';
import { DEFAULT_OUTPUT, loadOutput, normalizeOutput, saveOutput, type OutputConfig } from './lib/outputConfig';
import { TempoSource, bpmOf } from './lib/tempo';
import { triggerable, type MidiAction, type SoundBinding } from './lib/midi';
import { PresetMenu } from './components/PresetMenu';
import { useUserPresets, asPreset } from './hooks/useUserPresets';
import { downloadText, parsePresetFile, parseSequenceFile, sequenceFileName, serializeSequence, isUserPresetId, type UserPreset } from './lib/userPresets';
import type { ShowSequence } from './lib/sequencer';
import { sameSong, songRefFromTrack, songLabel, type SongRef } from './lib/songRef';
import { loadSetList, saveSetList, readSetListFile, writeSetListFile, moveItem, setItemId, starterSet, loadSavedSets, storeSavedSets, withSavedSet, SETLIST_FILE_EXT, type SetList, type SetItem, type SetItemKind } from './lib/setList';
import { useShowSequencer } from './hooks/useShowSequencer';
import { useSongChange } from './hooks/useSongChange';
import { useMusicIntelligence } from './hooks/useMusicIntelligence';
import { clockText } from './lib/performanceTake';
import { MusicSettings, DEFAULT_MUSIC_SETTINGS } from './lib/musicTypes';
import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE, PALETTE_RGB, DROPPER_COLORS } from './constants';
import { TrackPanel } from './components/TrackPanel';
import { LyricsOverlay } from './components/LyricsOverlay';
import { LOCKUP_URL } from './brand';
import { CrashReportButton, QuickReportDot, openCrashReport } from './components/CrashReportButton';
import * as crashLog from './lib/crashLog';
import { LIBRARY, librarySeconds, clock, nextTrack, credits, type Track } from './lib/musicLibrary';

const MUSIC_SETTINGS_KEY = 'chromaglass-music-settings';

function loadMusicSettings(): MusicSettings {
  try {
    const raw = localStorage.getItem(MUSIC_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_MUSIC_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return { ...DEFAULT_MUSIC_SETTINGS };
}

type AudioSource = 'none' | 'microphone' | 'system' | 'file' | 'simulated' | 'drone';

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
/** The letter printed on each tool, and the tool it picks. */
const TOOL_KEYS: Record<string, 'dropper' | 'spray' | 'splatter' | 'pour' | 'streak' | 'blow' | 'press' | 'finger' | 'magnet'> = {
  d: 'dropper', s: 'spray', x: 'splatter', o: 'pour', k: 'streak', w: 'blow', p: 'press', g: 'finger', m: 'magnet',
};

const DESK_MODE_KEY = 'chromaglass-desk-mode';
/** Random Evolve's drift lands over four seconds in this many steps. */
const DRIFT_GLIDE_STEPS = 20;
const MIDI_ACTIVITY_KEY = 'chromaglass-midi-activity';

function rememberedSource(): AudioSource {
  try {
    const raw = localStorage.getItem(AUDIO_SOURCE_KEY);
    // 'file' needs a file nobody has chosen yet, and 'system' opens a picker.
    if (raw === 'microphone' || raw === 'simulated') return raw;
  } catch { /* private */ }
  return 'none';
}

/**
 * Has anyone ever told this browser where to listen?
 *
 * Not the same question as `rememberedSource() === 'none'`, which is also the
 * answer for someone who turned the microphone off on purpose. This one
 * separates a first visit from a considered silence, and it is the difference
 * between a stranger's first five seconds being the thing the project is —
 * a plate moving to music — and being a plate sitting still while they look
 * for the button that makes it do something.
 */
function everChoseSource(): boolean {
  try { return localStorage.getItem(AUDIO_SOURCE_KEY) !== null; } catch { return true; }
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

// Detect which preset (if any) matches the current settings. Only the look is
// compared: a look does not set the room (see RIG_KEYS).
function detectActivePreset(settings: VisualizerSettings): string | null {
  for (const preset of PRESETS) {
    const ps = preset.settings;
    const match = Object.keys(ps).filter(key => !RIG_KEYS.has(key as keyof VisualizerSettings)).every(key => {
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

/**
 * The look the app opens on.
 *
 * It was Classic every time, which is a fine look and a poor introduction:
 * the plate can do thirty other things and the first one anybody saw was
 * always the same one. Chosen once per load rather than per render, because
 * "the look you arrived on" should not change under you when React re-renders.
 *
 * Macro looks are left out — a closeup of one bead is a strange first
 * impression of a light show — and `?look=<id>` pins it, which is how the
 * harnesses stay deterministic without the app having to be boring.
 */
export const OPENING_LOOK: string = (() => {
  try {
    const asked = new URLSearchParams(window.location.search).get('look');
    if (asked && PRESETS.some(p => p.id === asked)) return asked;
  } catch { /* no window: the default below */ }
  const pool = PRESETS.filter(p => !p.settings.macroMode);
  return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : 'classic';
})();


/**
 * What Go will send: a look (built-in or saved) with any controls a set item
 * lays on top, or a stage sequence. `item` is the set item it came from, when
 * it came from one, so the desk can light that row and not every row that
 * happens to hold the same look.
 */
interface ArmedLook {
  id: string;
  name: string;
  settings: Partial<VisualizerSettings>;
  item?: string;
  /** Its own fade, seconds; absent, the desk's. */
  fade?: number;
  /** The strip the desk shows while it is live. */
  rides?: (keyof VisualizerSettings)[];
  /** A stage sequence to start rather than a look to send. */
  sequence?: string;
}

export default function App() {
  const [isActive, setIsActive] = useState(true);

  // The laptop driving the projector must not dim, sleep or screensave: what
  // it does, the wall does. Held while the plate is running and dropped the
  // moment it is paused, so a machine left on the desk overnight is not kept
  // awake by a stopped show. Needs a secure context, so it is live on the
  // hosted site and on `localhost` — which is where the show is run — and
  // absent on a plain-http LAN address.
  const wakeLock = useWakeLock(isActive);

  // ── The projector's geometry and grade ──────────────────────────
  // Rear-projection flip, corner pin, edge blanking, output grade. Kept on
  // this machine rather than in the settings, because it describes the room
  // and not the look: a preset file must not carry a venue's keystone to
  // whoever opens it next. See `lib/outputConfig.ts`.
  const [output, setOutputState] = useState<OutputConfig>(loadOutput);
  const setOutput = useCallback((next: OutputConfig | ((prev: OutputConfig) => OutputConfig)) => {
    setOutputState(prev => {
      const value = typeof next === 'function' ? (next as (p: OutputConfig) => OutputConfig)(prev) : next;
      saveOutput(value);
      return value;
    });
  }, []);
  // The wall's Reset squares the projector and leaves the mapped shapes: they
  // live in a section of their own with their own Clear, and a Reset pressed
  // over there should not quietly throw away an evening's corner-dragging here.
  const resetOutput = useCallback(() => setOutput(prev => ({ ...DEFAULT_OUTPUT, surfaces: prev.surfaces })), [setOutput]);

  // ── Where the tempo comes from ──────────────────────────────────
  // The microphone, unless something better is offering: a MIDI clock from
  // the desk, four taps, or a number off the setlist. A ref because the
  // render loop reads it once a frame and nothing else does; `tempoLabel`
  // is the only part the UI needs, sampled rather than watched.
  const tempoRef = useRef<TempoSource | null>(null);
  if (!tempoRef.current) tempoRef.current = new TempoSource();
  const [tempoLabel, setTempoLabel] = useState<{ source: string | null; bpm: number; taps: number }>({ source: null, bpm: 0, taps: 0 });
  useEffect(() => {
    const timer = setInterval(() => {
      const t = tempoRef.current;
      if (!t) return;
      t.read(performance.now());        // lets a stopped MIDI clock lapse
      setTempoLabel(prev => {
        const next = { source: t.active, bpm: Math.round(t.bpm), taps: t.tapCount };
        return prev.source === next.source && prev.bpm === next.bpm && prev.taps === next.taps ? prev : next;
      });
    }, 250);
    return () => clearInterval(timer);
  }, []);
  const tapTempo = useCallback(() => tempoRef.current?.tap(performance.now()), []);
  const clearTempo = useCallback(() => tempoRef.current?.clear(), []);
  const setTempoBpm = useCallback((bpm: number) => tempoRef.current?.setBpm(bpm), []);

  // Load-in is geometry, and geometry can be checked exactly. `npm run wall`
  // drives this to set a corner pin or a mask on a plate that is already
  // running, so the before and the after are the same look half a second
  // apart rather than two different plates from two page loads.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    (window as unknown as { chromaglassOutput?: unknown }).chromaglassOutput =
      (patch: Partial<OutputConfig>) => { setOutput(prev => normalizeOutput({ ...prev, ...patch })); };
  }, [setOutput]);

  // `npm run shots` photographs the plate at 16:9, which is wider than the
  // width the overlay's preset menu exists at — above 1024px the desk owns the
  // window. Rather than photograph a narrow app, it applies presets through
  // this. The picture is what that harness is about; `npm run qa` is the one
  // that drives the menu a hand would use.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    (window as unknown as { chromaglassApplyPreset?: unknown }).chromaglassApplyPreset =
      (id: string) => { cuePresetRef.current?.(id); };
    /*
      Fire the controller's "this was hit" signal by hand.

      For the harness only, and it exists because the browser it drives has no
      Web MIDI at all — so the one thing a check could not otherwise do is
      prove that a pad press reaches the screen. This is the same call the MIDI
      handler makes and nothing else about the path is faked: the subscription,
      the flash and the timer are the real ones.
    */
    (window as unknown as { chromaglassTouch?: unknown }).chromaglassTouch =
      (key: string, value?: number) => { touch(key, value); };
    /*
      Fire any of the one-shot actions by name.

      The same list a pad, a phone or an OSC message reaches, so a harness can
      put the show into a state — automation on, the sequencer running — that
      it would otherwise have to find a button for. Written for the motion
      measurements, which spent several runs quietly measuring a plate whose
      automation was off.
    */
    (window as unknown as { chromaglassAction?: unknown }).chromaglassAction =
      (name: string) => { runActionRef.current?.(name as MidiAction); };
    /*
      Set any setting from the harness.

      `npm run detail` judges a frame by numbers, and the question it exists to
      answer — how much of the softness is the solver and how much is the
      renderer — needs the same plate photographed under several settings
      rather than several plates. Driving the panel for that would mean a
      different look each time; this changes one value on the running plate.
    */
    (window as unknown as { chromaglassSettings?: unknown }).chromaglassSettings =
      (patch?: Partial<VisualizerSettings>) => {
        if (patch) setSettings(prev => ({ ...prev, ...patch }));
        // Called with nothing, it says what the settings are (npm run qa reads the camera's aim).
        return settingsRef.current;
      };
    // Pick a tool, as the tool buttons do: `npm run tools` uses every one.
    (window as unknown as { chromaglassTool?: unknown }).chromaglassTool =
      (tool: typeof activeTool) => { setActiveTool(tool); };
    // Which layer the hand is on, as the layer switch does (scripts/mirror.mjs).
    (window as unknown as { chromaglassLayer?: unknown }).chromaglassLayer =
      (layer: number) => { setActiveLayer(Math.max(0, Math.min(1, Math.round(layer)))); };
    // And its Amount, as the Amount slider does (npm run tools).
    (window as unknown as { chromaglassToolAmount?: unknown }).chromaglassToolAmount =
      (tool: string, v: number) => { setToolAmounts(prev => ({ ...prev, [tool]: clampAmount(v) })); };
    /*
      Put a track from the shelf on, from outside.

      `npm run shelf` has to answer one question — does music that ships with
      the show actually reach the analyser, or does it play to a plate that
      cannot hear it — and driving the desk to ask it means finding a button
      inside a panel inside a mode, which is a layout test wearing an audio
      test's clothes. This is the same back door `chromaglassSettings` is: it
      sets the test up, it does not perform it.
    */
    (window as unknown as { chromaglassMusic?: unknown }).chromaglassMusic =
      (src?: string) => {
        const t = src ? LIBRARY.find(x => x.src === src) : LIBRARY[0];
        if (!t) throw new Error(`no such track on the shelf: ${src}`);
        playTrackRef.current(t);
        return t;
      };
    /*
      A song's show, from outside: the clip tool starts one on the first note of
      a take, with the song's own look already on the plate.
    */
    (window as unknown as { chromaglassSongs?: unknown }).chromaglassSongs = () => songShowsRef.current;
    (window as unknown as { chromaglassSongStart?: unknown }).chromaglassSongStart =
      (id: string, opts?: { skip?: string[]; duration?: number }) => { songRuntimeRef.current?.start(id, opts); return songRuntimeRef.current?.status ?? null; };
    (window as unknown as { chromaglassSongFor?: unknown }).chromaglassSongFor =
      (title: string, artist: string) => showFor(songShowsRef.current, { title, artist });
    (window as unknown as { chromaglassSongStop?: unknown }).chromaglassSongStop = () => songRuntimeRef.current?.stop();
    (window as unknown as { chromaglassPourText?: unknown }).chromaglassPourText =
      (rows: { text: string; weight?: number }[], opts?: { colour?: string; columns?: [number, number] }) => visualizerRef.current?.pourText(rows, opts);
    (window as unknown as { chromaglassBench?: unknown }).chromaglassBench =
      (opts?: BenchOptions) => { void startBenchRef.current?.(opts); };
  }, []);

  /*
    `?bench` runs the grid sweep on its own and shows the result.

    The measurement it takes is one somebody else has to run — it needs the
    machine the show will run on, which is never the one the code was written
    on — so the whole of it has to be a link that can be sent and a block of
    text that comes back. Waits for the first frame, because a sweep that
    starts before there is an engine to read measures the loading screen.
  */
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('bench')) return;
    let cancelled = false;
    const wait = setInterval(() => {
      if (cancelled || !engineStatusRef.current) return;
      clearInterval(wait);
      void startBenchRef.current?.();
    }, 250);
    return () => { cancelled = true; clearInterval(wait); };
  }, []);
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
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  /** Which section the panel should open at, when it was opened from a ⌘K row. */
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  /** Open the settings sheet at the top: both desks' "All settings…" and ⌘K's plain row. */
  const openAllSettings = useCallback(() => {
    setSettingsSection(null);
    setShowSettings(true);
    setShowHelp(false);
  }, []);
  const [showHelp, setShowHelp] = useState(false);
  /** Which guide topic to open at, when something sent you there to read one. */
  const [helpFocus, setHelpFocus] = useState<string | null>(null);
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
  /*
    What is out on each surface.

    A property of this desk rather than of a look: two rooms with the same
    presets want different things under the hand, and a saved look that
    rearranged your faders would be unusable. Both lists come from the one
    registry in `deskPins`, so a control the settings panel draws can be put on
    either surface — which is the thing that could not be done before, and the
    reason the panel was the only place most of the app existed.
  */
  const [rideKeys, setRideKeys] = useState<(keyof VisualizerSettings)[]>(() => loadPins('perform', DEFAULT_RIDES));
  useEffect(() => { savePins('perform', rideKeys, DEFAULT_RIDES); }, [rideKeys]);
  const [recipeKeys, setRecipeKeys] = useState<(keyof VisualizerSettings)[]>(() => loadPins('design', DEFAULT_RECIPE));
  useEffect(() => { savePins('design', recipeKeys, DEFAULT_RECIPE); }, [recipeKeys]);
  /** Put a control on a surface, or take it off, from the settings panel. */
  const pinSetting = useCallback((desk: DeskSurface, key: keyof VisualizerSettings, on: boolean) => {
    const set = desk === 'perform' ? setRideKeys : setRecipeKeys;
    set(prev => togglePin(prev, key, on));
  }, []);
  /**
   * The preset last applied by hand. Which preset is *active* is derived from
   * the settings below rather than stored: it only ever differed from them
   * transiently, and keeping it as state meant a second render of the whole
   * app on every settings change, plus a walk over every preset comparing
   * every key. The sequencer glides settings continuously through a show, so
   * that ran on every frame of every transition.
   */
  const [pinnedPresetId, setPinnedPresetId] = useState<string | null>(OPENING_LOOK);
  const [settings, setSettings] = useState<VisualizerSettings>(() => {
    const opening = PRESETS.find(p => p.id === OPENING_LOOK);
    const base = opening ? { ...DEFAULT_SETTINGS, ...opening.settings } : { ...DEFAULT_SETTINGS };
    // Diagnostic override for this page load only: ?sim=auto | <edge>.
    // Lets a device be pinned to a solver grid without touching its settings.
    const sim = new URLSearchParams(window.location.search).get('sim');
    if (sim === 'auto') base.simResolution = sim;
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
  /*
    A flick of one plate. A counter rather than a speed, like the seed: it is
    momentary, and two flicks in a row both have to land.
  */
  const [spinFlick, setSpinFlick] = useState<{ seq: number; layer: number } | undefined>(undefined);
  const flickPlate = (layer: number) => setSpinFlick(p => ({ seq: (p?.seq ?? 0) + 1, layer }));
  const [clearTrigger, setClearTrigger] = useState(0);
  const [drainTrigger, setDrainTrigger] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  // The shelf: the bottles the app ships, then any someone made (lib/liquidFile.ts).
  const [liquidTypes, setLiquidTypes] = useState<LiquidType[]>(() => [...DEFAULT_LIQUID_TYPES, ...loadCustomLiquids()]);
  useEffect(() => { saveCustomLiquids(liquidTypes); }, [liquidTypes]);
  /** Put made liquids on the shelf, replacing any with the same id. */
  const shelveLiquids = useCallback((made: LiquidType[]) => {
    setLiquidTypes(prev => {
      const byId = new Map(made.map(l => [l.id, l]));
      const kept = prev.map(l => byId.get(l.id) ?? l);
      return [...kept, ...made.filter(l => !prev.some(p => p.id === l.id))];
    });
  }, []);
  const removeLiquid = useCallback((id: string) => {
    if (!isCustomLiquid({ id })) return;
    setLiquidTypes(prev => prev.filter(l => l.id !== id));
    setSelectedLiquidId(sel => (sel === id ? 'water' : sel));
  }, []);
  const [selectedLiquidId, setSelectedLiquidId] = useState('water');
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press' | 'finger' | 'magnet'>('dropper');

  const selectedLiquid = liquidTypes.find(t => t.id === selectedLiquidId) ?? liquidTypes[0];
  // How much each tool does, per tool (lib/toolAmount.ts); 1 is what it always did.
  const [toolAmounts, setToolAmounts] = useState<Record<string, number>>(() => loadToolAmounts());
  useEffect(() => { saveToolAmounts(toolAmounts); }, [toolAmounts]);
  const toolAmount = toolAmounts[activeTool] ?? 1;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const setToolAmount = useCallback((tool: string, v: number) => setToolAmounts(prev => ({ ...prev, [tool]: clampAmount(v) })), []);
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
  /** `setToast` is declared further down; the cast sender needs it up here. */
  const setToastRef = useRef<(m: string) => void>(() => {});
  const { isCasting, startCast, stopCast, send: castSend, windowFullscreen, fillWindow } = useCastSender(
    () => castReadyRef.current(),
    (size) => { stageRef.current = size; visualizerRef.current?.setStage(size); },
    // A blocked popup used to be silent, so Send to wall did visibly nothing
    // and there was no telling that from the feature being broken.
    (message) => setToastRef.current(message),
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
      /*
        With the overlays up, Esc closes whatever panel is open — all of
        them, which this list did not used to be.

        MIDI and the sequencer were missing, left over from when they were
        drawers with a close button of their own. As sheets they each carry
        an Esc listener, but Settings was being closed by *this* handler
        rather than by its own, and MIDI — with nothing here covering it —
        stayed open. Measured in Perform: Settings `afterEscape=0`, MIDI
        `afterEscape=1`, same run, same sequence.

        One list, every panel, so Esc means the same thing everywhere.
      */
      setShowSettings(false);
      setShowHelp(false);
      setShowTrackPanel(false);
      setShowMidi(false);
      setShowSequencer(false);
      setShowSave(false);
      setShowPalette(false);
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
    // The drone owns an AudioContext and four running oscillators; leaving it
    // behind would keep them sounding under whatever replaced it.
    stopDrone();

    setAudioSource(source);
    try { localStorage.setItem(AUDIO_SOURCE_KEY, source); } catch { /* private */ }
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
        () => visualizerRef.current?.plateReading(PLATE_PLACES) ?? null,
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
      void band.resume();
      setAudioStream(band.stream);
      return;
    }

    try {
      let stream: MediaStream;
      if (source === 'system') {
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
    try { localStorage.setItem(AUDIO_INPUT_KEY, id); } catch { /* private */ }
    // Reopen the microphone on the new input if it is the live source.
    if (audioSource === 'microphone') setTimeout(() => { void handleSourceChange('microphone'); }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSource]);

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

  // The browser will not run audio before a gesture, so a restored band stays
  // silent until the first click anywhere. One listener, then gone.
  //
  // The same gesture starts the band for anyone who has never chosen a source
  // at all. A first visit used to land on a plate with nothing driving it:
  // the fluid moved, but the thing the project *is* — a light show played by
  // the music — needed the visitor to find a button first. The band is
  // synthesised, silent and opens no device, so it needs no permission and
  // asks for nothing; it is the demo this app already had and never showed
  // anybody. It is written to storage like any other choice, so this happens
  // once per browser and the microphone is still one click away.
  useEffect(() => {
    const wake = () => {
      void simulatedRef.current?.resume();
      // After the click has been handled: if the visitor's first gesture was
      // the Mic button, that choice is already recorded and this does nothing.
      setTimeout(() => {
        if (audioSourceRef.current === 'none' && !everChoseSource()) void handleSourceChange('simulated');
      }, 0);
    };
    window.addEventListener('pointerdown', wake, { once: true });
    window.addEventListener('keydown', wake, { once: true });
    /*
      `?kiosk=1`: there is nobody to click.

      A box behind the screen boots into this with no keyboard and no mouse,
      so the gesture the browser wants is never coming. Chromium is started
      with --autoplay-policy=no-user-gesture-required for exactly this, which
      makes the audio context start without one — but nothing in the app was
      asking it to, so the plate ran and heard nothing. This does the asking.

      Only from the query string, so a hosted visit is untouched: a page that
      started making noise before anyone touched it would be a worse first
      visit than a silent one, and on a normal browser the context would
      refuse anyway and the click handler above would still be waiting.
    */
    let kiosk = false;
    try { kiosk = new URLSearchParams(window.location.search).get('kiosk') === '1'; } catch { /* no query to read */ }
    if (kiosk) wake();
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeLayer >= settings.layerCount) {
      setActiveLayer(Math.max(0, settings.layerCount - 1));
    }
  }, [settings.layerCount, activeLayer]);

  const [calibrateNonce, setCalibrateNonce] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const engineStatusRef = useRef<EngineStatus | null>(null);
  // ── The grid sweep ──
  // Walks the solver down every grid and reports where a frame's time went on
  // each, so the question "is the grid what costs you" has an answer taken the
  // same way on every machine rather than by hand, five times, from a readout.
  const [bench, setBench] = useState<{ running: boolean; done: number; total: number; label: string; text: string | null }>(
    { running: false, done: 0, total: 0, label: '', text: null },
  );
  const benchBusyRef = useRef(false);
  /** The effect that installs the hooks runs once; this keeps it off a stale callback. */
  const startBenchRef = useRef<((opts?: BenchOptions) => Promise<void>) | null>(null);
  const startBench = useCallback(async (opts?: BenchOptions) => {
    if (benchBusyRef.current) return;
    benchBusyRef.current = true;
    setBench({ running: true, done: 0, total: 0, label: 'starting', text: null });
    // Whatever the grid was before this is the grid it goes back to; a
    // diagnostic that leaves the show on a different setting than it found it
    // is a diagnostic that changes the thing it measured.
    let restore: VisualizerSettings['simResolution'] = 'auto';
    setSettings(prev => { restore = prev.simResolution; return prev; });
    try {
      const report = await runBench({
        setGrid: (g) => setSettings(prev => ({ ...prev, simResolution: g })),
        read: () => engineStatusRef.current,
        renderer: readRenderer,
        sleep: (ms) => new Promise(r => setTimeout(r, ms)),
        now: () => performance.now(),
        onProgress: (done, total, label) => setBench(b => ({ ...b, done, total, label })),
      }, opts);
      // Put the show back before showing the result, not after.
      //
      // The restore used to live only in the `finally`, which runs after the
      // report is on screen — so for the few seconds it takes the engine to
      // rebuild and republish, the sweep said it was finished while the plate
      // was still on whatever rung it ended on. Measured at three and a half
      // seconds of the show sitting on the CPU solver behind a panel saying
      // the measurement was done. The `finally` stays as the path an error
      // takes; setting it twice costs nothing, since the second is the same
      // value and React drops it.
      setSettings(prev => ({ ...prev, simResolution: restore }));
      const text = formatBench(report);
      console.log(text);
      setBench({ running: false, done: 0, total: 0, label: '', text });
    } catch (err) {
      console.error('ChromaGlass: the grid sweep failed.', err);
      setBench({ running: false, done: 0, total: 0, label: '', text: `The sweep failed: ${String(err)}` });
    } finally {
      setSettings(prev => ({ ...prev, simResolution: restore }));
      benchBusyRef.current = false;
    }
  }, []);
  startBenchRef.current = startBench;
  const [filmSource, setFilmSource] = useState<'none' | 'file' | 'camera' | 'window'>('none');
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
  /*
    Film from a window.

    The projector fed by another tab, window or screen: a film off the
    Internet Archive, a media player, a slide deck. It reaches what a URL
    cannot — a cross-origin video plays in a page but cannot be read back into
    a texture on the GPU, and the Archive's own file responses carry no header that
    would allow it — because a captured window has no origin, only pixels.

    The browser's picker decides what is shared, and the cancel case is a
    deliberate no-op rather than an error: closing the picker means "not
    that", not "something went wrong".
  */
  const startFilmWindow = async () => {
    try {
      await visualizerRef.current?.startFilmWindow(
        () => setFilmSource('none'),
        () => setToast('That window is coming through black — share the tab instead'),
      );
      setFilmSource('window');
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') return;   // picker cancelled
      console.warn('ChromaGlass: could not capture a window for the film projector.', err);
    }
  };
  const clearFilm = () => {
    visualizerRef.current?.clearFilm();
    setFilmSource('none');
  };
  // ── The room ────────────────────────────────────────────────────
  // The camera as a sensor: it stirs the plate, puts hands on it and rides
  // whatever settings the mappings name. Off unless someone switched it on.
  /*
    Off on every load, whatever last time said.

    This used to restore straight from `localStorage`, so a camera switched on
    once came back on by itself at every load from then on — and because the
    browser had already granted permission there was no prompt either. The
    light came on in a room with nothing on screen saying why. A remembered
    switch is an offer, not an instruction.
  */
  const [sceneOn, setSceneOn] = useState<boolean>(false);
  /** It was on when they left, so the app offers it back rather than taking it. */
  const [sceneResume, setSceneResume] = useState<boolean>(() => {
    try { return localStorage.getItem(SCENE_ON_KEY) === '1'; } catch { return false; }
  });
  const [sceneDeviceId, setSceneDeviceId] = useState<string>(() => { try { return localStorage.getItem(SCENE_DEVICE_KEY) ?? ''; } catch { return ''; } });
  const scenePreviewRef = useRef<HTMLCanvasElement | null>(null);
  /** True once the camera has been switched on by hand in this session. */
  const sceneAskedRef = useRef(false);
  const toggleScene = useCallback((on: boolean) => {
    if (on) sceneAskedRef.current = true;
    setSceneResume(false);
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

  /*
    The film, read back as well as shown.

    Only while something is asking for it. With Film Drive and Film Impact
    both at zero the sensor is not running at all, so a projector used the way
    it always was — a slide through the dye — costs exactly what it always
    did. It shares the room's deadzone and smoothing: those describe how
    twitchy a reading should be, which is a property of the plate rather than
    of where the pixels came from.
  */
  const filmDriving = filmSource !== 'none'
    && ((settings.filmDrive ?? 0) > 0 || (settings.filmImpact ?? 0) > 0);
  const filmSense = useFilmSense({
    enabled: filmDriving,
    getVideo: () => visualizerRef.current?.filmVideoEl() ?? null,
    deadzone: settings.sceneDeadzone ?? 0.25,
    smooth: settings.sceneSmooth ?? 0.35,
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
  /*
    The controller's own readout, and whether it is up.

    A property of this desk rather than of a look: whether you want to see what
    the hardware is doing depends on how well you know the map, not on which
    preset is loaded. Remembered, because someone who wants it wants it all
    night and someone who does not should not have to hide it every time.
  */
  const [showActivity, setShowActivity] = useState<boolean>(() => {
    try { return localStorage.getItem(MIDI_ACTIVITY_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(MIDI_ACTIVITY_KEY, showActivity ? '1' : '0'); } catch { /* private window */ }
  }, [showActivity]);
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
        RIG_KEYS.has(k as keyof VisualizerSettings) || JSON.stringify((up.settings as any)[k]) === JSON.stringify((settings as any)[k]))) {
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
  /*
    Performances, started and stopped by hand: T on either desk, the
    Performance dot in the desk header, or the Track panel. The note after a
    stop says what was kept, for four seconds.
  */
  const perfLive = !!musicIntel.performance.live;
  const { startPerformance, stopPerformance } = musicIntel;
  const togglePerformance = useCallback(() => {
    if (perfLive) stopPerformance();
    else startPerformance();
  }, [perfLive, startPerformance, stopPerformance]);
  const perfLastStop = musicIntel.performance.lastStop;
  const [perfNote, setPerfNote] = useState<typeof perfLastStop>(null);
  useEffect(() => {
    if (!perfLastStop) return;
    setPerfNote(perfLastStop);
    const t = window.setTimeout(() => setPerfNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [perfLastStop]);
  // The live performance's clock, for the header: a second's resolution.
  const [perfNow, setPerfNow] = useState(0);
  useEffect(() => {
    if (!musicIntel.performance.live) return;
    const t = window.setInterval(() => setPerfNow(performance.now()), 500);
    return () => window.clearInterval(t);
  }, [musicIntel.performance.live]);
  const perfClock = musicIntel.performance.live
    ? clockText((Math.max(perfNow, musicIntel.performance.live.startedAtMs) - musicIntel.performance.live.startedAtMs) / 1000)
    : null;

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
  // Lay the opening look's plate: its dyes, its seed, its injection styles and
  // its liquids. The settings above arrive with the first render, but the
  // plate is the visualizer's and it seeds Classic until told otherwise — so
  // every look the app opened on used to be drawn in Classic's yellow, pink
  // and blue, poured Classic's way, until someone changed look. The preset
  // gallery showed it: two dozen looks, one set of colours. After the lock
  // above, so a pinned palette is honoured by the plate it lays.
  useEffect(() => {
    visualizerRef.current?.applyPreset(OPENING_LOOK);
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

  /*
    The look the drift wanders around: see the interval below and lib/drift.ts.
    Declared here because `applyPreset` re-takes it, and that reads better than
    a reference reaching forward past four hundred lines.
  */
  const driftAnchor = useRef(settings);
  /** The drift's moves in flight: each dial from where it was to where it is going, and how far along. */
  const driftGlide = useRef(new Map<string, { from: number; to: number; at: number }>());

  const updateSettings = (newSettings: Partial<VisualizerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    setDocDirty(true);
    /*
      A hand's move is where the drift wanders from now on (lib/drift.ts).
      The drift holds each dial inside a window round its anchor, and the
      anchor was the look as laid, so a ride pushed past the window was
      pulled back on the next drift: reported as the sliders jumping.
    */
    driftAnchor.current = { ...driftAnchor.current, ...newSettings };
    for (const k of Object.keys(newSettings)) driftGlide.current.delete(k);
  };

  const applyPreset = (presetId: string, presetSettings: Partial<VisualizerSettings>) => {
    // The whole look, whatever was playing before it: see LOOK_BASE. The room
    // (the microphone's calibration, the dimmer, the logo, the grid) stays.
    setSettings(prev => {
      const next = targetLook(prev, presetSettings);
      // From here on it is this look the drift wanders around, not the last.
      driftAnchor.current = next;
      return next;
    });
    setPinnedPresetId(presetId);
    // A built-in is somewhere to start, not a file of yours: ⌘S asks for a
    // name rather than writing over a look that ships with the app.
    setDocId(null);
    setDocDirty(false);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(presetId);
  };

  const applyUserPreset = (p: UserPreset) => {
    // A saved look is a look like any other. Anything added to the app since it
    // was saved comes from the base rather than from whatever was playing.
    setSettings(prev => targetLook(prev, p.settings));
    setPinnedPresetId(p.id);
    // Your own look, opened: ⌘S from here writes over it rather than making
    // a second copy.
    setDocId(p.id);
    setDocDirty(false);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(p.id, { contract: p.contract ?? null, injectStyles: p.injectStyles ?? null, liquids: p.liquids ?? null });
  };
  /*
    ── The look you are working on, as a document ────────────────────

    There was no such thing before. "Save" always made a *new* saved look and
    always put a file in Downloads, so the ordinary act of building something
    over twenty minutes produced twenty copies and twenty files, and there was
    no way to save over the one you were working on. And there was no way to
    start from nothing: the app opened on a look and every route from there
    began at another look.

    So: `docId` is the saved look these settings belong to, or null for one
    that has never been saved. `docDirty` is whether they have been touched
    since. Save writes over the document when there is one and asks for a name
    when there is not, Save as always asks, and New is an empty plate.
  */
  /**
   * A line that fades, for the moves whose whole result is invisible.
   *
   * Saving over a document changes nothing you can see — that is the point of
   * it — so without a word it is indistinguishable from the button not
   * working. Same for an empty plate, which looks like a plate that failed.
   */
  /**
   * What is on each layer, for the tabs.
   *
   * Polled a few times a second rather than read per frame: the numbers come
   * off a readback that lands when it lands, and a badge showing how full a
   * layer is does not need sixty looks a second at the cost of a re-render
   * each.
   */
  const [layerReport, setLayerReport] = useState<{ index: number; fill: number; colour: string }[]>([]);
  /** Which desk is up, for the poll below, which is armed once and never re-armed. */
  const deskModeRef = useRef(deskMode);
  deskModeRef.current = deskMode;
  useEffect(() => {
    const id = setInterval(() => {
      // Only the bench draws them, and only when there is more than one layer
      // to tell apart — otherwise this is a re-render for a badge nobody is
      // looking at.
      if (deskModeRef.current !== 'design') return;
      const r = visualizerRef.current?.layerReport?.();
      if (r && r.length > 1) setLayerReport(r);
    }, 400);
    return () => clearInterval(id);
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  setToastRef.current = setToast;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const [docId, setDocId] = useState<string | null>(null);
  const [docDirty, setDocDirty] = useState(false);
  /** Whether Save should ask for a name (no document yet) or just write. */
  const [saveMode, setSaveMode] = useState<'as' | 'over'>('as');

  const saveCurrentPreset = (name: string, description: string, forSong = false) => {
    const plate = visualizerRef.current?.describePlate();
    const p = userPresets.saveCurrent(name, description, settings, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, forSong ? currentSong : null);
    setPinnedPresetId(p.id);
    setDocId(p.id);
    setDocDirty(false);
  };

  /** ⌘S: over the document when there is one, otherwise ask for a name. */
  const saveLook = () => {
    if (!docId) { setSaveMode('as'); setShowSave(true); return; }
    const plate = visualizerRef.current?.describePlate();
    const saved = userPresets.saveOver(docId, settings, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null);
    if (!saved) { setSaveMode('as'); setShowSave(true); return; }   // deleted underneath us
    setDocDirty(false);
    setToast(`Saved “${saved.name}”`);
  };
  /** ⇧⌘S: always a new one. */
  const saveLookAs = () => { setSaveMode('as'); setShowSave(true); };

  /**
   * An empty plate.
   *
   * Clear rather than drain: draining is a performance move that swirls what
   * is there down a hole over a second and a half, which is lovely and is not
   * what "new" means. The palette is unpinned too — a look begun from nothing
   * should not inherit the last one's dyes.
   */
  const newLook = () => {
    setSettings({ ...DEFAULT_SETTINGS });
    setClearTrigger(v => v + 1);
    visualizerRef.current?.setHarmonyLock(null);
    setPinnedPresetId(null);
    setDocId(null);
    setDocDirty(false);
    setCued(null);
    setDeskMode('design');
    setToast('Empty plate');
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
  const aimTick = useRef(0);
  /*
    A hand on the closeup camera (Alt-drag or Alt-click on the plate): it goes
    where it is aimed. Taken off Auto, since a camera that roams on its own
    would leave the spot the hand just chose.
  */
  const aimMacro = useCallback((x: number, y: number) => {
    const auto = (settingsRef.current.macroCamera ?? 'hold') === 'auto';
    updateSettings({ macroAimX: x, macroAimY: y, ...(auto ? { macroCamera: 'hold' as const } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    Evolve, as a wander rather than a jump (lib/drift.ts).

    "Random Evolve" meant two unrelated things and nothing in between: the
    automation that drops dye and blows air, and a whole new look rolled at a
    song boundary — fifty-five settings replaced at once, which is a cut. So a
    look either sat perfectly still in its settings or went somewhere else
    entirely.

    This is the middle. Every few seconds two dials move a little, held inside
    a window either side of where the look sat when evolving started, so an
    hour of it wanders the mood without arriving anywhere the look was not.
    The anchor is re-taken whenever a look is laid down, because from then on
    *that* is the look being wandered around.
  */
  useEffect(() => {
    if (!isAutomated || !isActive) {
      // Switched off, or the show is paused: the next spell of evolving starts
      // from wherever the plate is now, not from where the last one began.
      driftAnchor.current = settingsRef.current;
      return;
    }
    /*
      Glided, not stepped. Each drift used to land in one frame, so a ride on
      the desk visibly jumped every six seconds and the plate lurched with
      it. The move is now spread over four seconds in small steps; a dial a
      hand takes in the meantime is dropped from the glide (updateSettings),
      and the hand wins.
    */
    const id = setInterval(() => {
      const rate = settingsRef.current.automateRate ?? 0.12;
      const patch = driftLook(settingsRef.current, driftAnchor.current, rate) as Record<string, number>;
      for (const [k, to] of Object.entries(patch)) {
        const from = (settingsRef.current as unknown as Record<string, number>)[k];
        if (typeof from === 'number' && Number.isFinite(to)) driftGlide.current.set(k, { from, to, at: 0 });
      }
      /*
        The closeup camera is Evolve's to move too, when it is zoomed in and
        held or following: every other drift the aim glides a short way, so
        the camera wanders the plate slowly instead of sitting on one spot
        for the whole song. Auto moves itself; a hand on the aim takes it
        (updateSettings drops a dial a hand touches from the glide).
      */
      const cur = settingsRef.current;
      aimTick.current = (aimTick.current + 1) % 2;
      if (aimTick.current === 0 && (cur.macroZoom ?? 1) > 1.05 && (cur.macroCamera ?? 'hold') !== 'auto') {
        const wander = (v: number) => Math.min(0.85, Math.max(0.15, v + (Math.random() - 0.5) * 0.24));
        const ax = cur.macroAimX ?? 0.5, ay = cur.macroAimY ?? 0.5;
        driftGlide.current.set('macroAimX', { from: ax, to: wander(ax), at: 0 });
        driftGlide.current.set('macroAimY', { from: ay, to: wander(ay), at: 0 });
      }
    }, 6000);
    const glide = setInterval(() => {
      if (driftGlide.current.size === 0) return;
      const step: Record<string, number> = {};
      for (const [k, g] of driftGlide.current) {
        g.at = Math.min(1, g.at + 1 / DRIFT_GLIDE_STEPS);
        const e = g.at * g.at * (3 - 2 * g.at);
        step[k] = g.from + (g.to - g.from) * e;
        if (g.at >= 1) driftGlide.current.delete(k);
      }
      // Not through updateSettings: that is a hand, and re-anchors.
      setSettings(prev => ({ ...prev, ...step }));
      setDocDirty(true);
    }, 4000 / DRIFT_GLIDE_STEPS);
    return () => { clearInterval(id); clearInterval(glide); driftGlide.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutomated, isActive]);

  /*
    The Ferrofluid bottle needs the plate to draw ferrofluid at all: picking
    it on a look with none turns the amount up, and the visualizer, seeing
    the bottle, leaves the plate bare for the drops to land on.
  */
  useEffect(() => {
    if (!((selectedLiquid.behaviour?.magnetic ?? 0) > 0)) return;
    if ((settingsRef.current.phaseAmount ?? 0) > 0.002) return;
    updateSettings({ phaseAmount: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLiquid, presetSeq]);

  /*
    The Magnet brings its ferrofluid. A magnet over a plate with none on it
    does nothing at all, which read as the tool being broken, so picking it
    on such a look pours some (the visualizer lays it when the amount rises)
    and gives the magnet enough strength to be felt. The look keeps it, and
    the Ferrofluid slider takes it away again.
  */
  useEffect(() => {
    if (activeTool !== 'magnet') return;
    const s = settingsRef.current;
    if ((s.phaseAmount ?? 0) > 0.002 && (s.magnetStrength ?? 0) > 0) return;
    updateSettings({
      phaseAmount: Math.max(s.phaseAmount ?? 0, 0.6),
      magnetStrength: Math.max(s.magnetStrength ?? 0, 0.8),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  /*
    A hand on a hardware fader, answered at once and rendered once a frame.

    See `lib/ride.ts` for why this is not just `setSettings`. `observe` runs
    here, in the render body beside `settingsRef`, because what it needs to
    know is what React actually rendered — that is how the ride tells its own
    late writes from a preset moving the same setting underneath it.

    A frame rather than a timer, so the rate matches the one thing that can
    show the value. The cost is that a backgrounded tab stops flushing, which
    is fine: a backgrounded tab has stopped drawing the plate too, so there is
    no show to be riding, and a pending move lands on the frame after it comes
    back.
  */
  const ride = useRef(new SettingRide()).current;
  ride.observe(settings as unknown as Record<string, unknown>);
  const rideFrame = useRef(0);
  const rideSetting = useCallback((key: keyof VisualizerSettings, value: number) => {
    ride.write(String(key), value);
    setDocDirty(true);
    if (rideFrame.current) return;
    rideFrame.current = requestAnimationFrame(() => {
      rideFrame.current = 0;
      const patch = ride.drain();
      if (patch) setSettings(prev => ({ ...prev, ...patch }));
    });
  }, [ride]);
  useEffect(() => () => { if (rideFrame.current) cancelAnimationFrame(rideFrame.current); }, []);

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
  const [cued, setCued] = useState<ArmedLook | null>(null);
  /** The armed look, for the action handlers that are defined above the state they read. */
  const cuedRef = useRef(cued);
  cuedRef.current = cued;
  /*
    The set: the operator's own cue list (lib/setList.ts), and what the desk
    lists, in its order; each row arms its item. A first visit opens on the
    starter set, every look as an item that can be removed. It used to list
    every look whenever the set was empty, and those rows were not the set's,
    so nothing on the desk could be taken off it.
  */
  const [setList, setSetList] = useState<SetList>(() => loadSetList(() => starterSet(PRESETS.map(p => p.id))));
  /** Sets kept by name (the set menu's Save and Open). The working set above is kept on its own. */
  const [savedSets, setSavedSets] = useState<SetList[]>(loadSavedSets);
  const changeSaved = useCallback((f: (prev: SetList[]) => SetList[]) => {
    setSavedSets(prev => { const v = f(prev); storeSavedSets(v); return v; });
  }, []);
  const setListRef = useRef(setList);
  setListRef.current = setList;
  const changeSet = useCallback((next: SetList | ((prev: SetList) => SetList)) => {
    setSetList(prev => {
      const v = typeof next === 'function' ? next(prev) : next;
      saveSetList(v);
      return v;
    });
  }, []);
  /** The set item on stage, so its row reads live even when another row holds the same look. */
  const [liveItemId, setLiveItemId] = useState<string | null>(null);
  /** The desk's list as last drawn, for the keys and pads that step it. */
  const cuesRef = useRef<Cue[]>([]);
  /** The sequencer, from above where it is created (a set item can be a sequence). */
  const sequencerRef = useRef<{ startAt: (id: string, positionSec: number) => void; sequences: ShowSequence[] } | null>(null);
  const [fadeSeconds, setFadeSeconds] = useState<number>(DEFAULT_FADE_SECONDS);
  const [fading, setFading] = useState(0);        // 0..1 while a Go is running
  // On a timer rather than requestAnimationFrame, for the same reason the
  // dimmer is: the laptop's window spends a show behind the projector's, and
  // a hidden tab stops animating. A Go fired from a MIDI pad while the
  // operator is watching the wall would otherwise freeze half-way through the
  // crossfade and stay there. (rAF also runs at the compositor's rate, which
  // on a machine with no GPU worth the name is under a frame a second —
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
  const designing = deskMode === 'design' && roomForDesk;

  /*
    Below that width neither desk lays out, and the floating overlay UI — the
    bottle rail, the toolbar, the title bar — is what the app shows instead.
    It is not legacy so much as the narrow-screen surface: a phone already has
    a control surface of its own in the remote, and a small laptop window gets
    the one that does not need three columns.
  */
  const deskUp = roomForDesk;

  // The hole in the desk layout the plate is painted over. Both desks leave
  // one; without a desk the plate fills the window, as it always has.
  const preview = usePreviewFrame(deskUp);

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

  /*
    "Edited" is the document's own flag now.

    It used to be derived — pinned to a preset, and the settings no longer
    matching it — which cannot be true of an empty plate somebody has since
    painted (there is no preset to differ from), and which blinks off again if
    the values happen to coincide. Two answers to one question is how the desk
    and the panel came to disagree about everything else, so there is one.
  */
  const pinnedLookName = useMemo(() => {
    if (!pinnedPresetId) return null;
    return allPresets.find(p => p.id === pinnedPresetId)?.name ?? null;
  }, [allPresets, pinnedPresetId]);

  /**
   * What the look you are working on is called.
   *
   * The name of your document when there is one, the built-in you started
   * from when there is not, and "Untitled" for an empty plate — which is the
   * state the app could not previously be in at all.
   */
  const docName = useMemo(() => {
    if (docId) return userPresets.presets.find(p => p.id === docId)?.name ?? 'Untitled look';
    return pinnedLookName ?? 'Untitled look';
  }, [docId, userPresets.presets, pinnedLookName]);

  /**
   * The cue list: the looks, in order, each carrying two of its own dyes so a
   * row is recognisable without reading it. The live one is what is on the
   * wall; the next one is whatever is armed.
   */
  const swatchOf = useCallback((presetId: string | undefined): string => {
    const contract = !presetId ? null : isUserPresetId(presetId)
      ? userPresetsRef.current.find(u => u.id === presetId)?.contract
      : PRESET_CONTRACTS[presetId];
    const [a, b] = contract && contract.length
      ? [PALETTE[contract[0]]?.hex ?? '#666', PALETTE[contract[1] ?? contract[0]]?.hex ?? '#333']
      : ['#52525B', '#27272A'];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }, []);
  const setActive = setList.items.length > 0;
  const cues = useMemo<Cue[]>(() => {
    return setList.items.map(item => {
      const seq = item.kind === 'sequence' ? sequencerRef.current?.sequences.find(q => q.id === item.ref) : undefined;
      const look = item.kind === 'sequence' ? undefined : allPresets.find(p => p.id === item.ref);
      const name = item.name ?? look?.name ?? seq?.name ?? item.ref;
      return {
        id: item.id,
        name,
        swatch: swatchOf(look?.id ?? seq?.stages[0]?.presetId),
        fade: item.fade ?? fadeSeconds,
        song: item.song ? songLabel(item.song) : undefined,
        kind: item.kind,
        missing: item.kind === 'sequence' ? !seq : !look,
      };
    });
  }, [allPresets, fadeSeconds, setList, swatchOf]);
  cuesRef.current = cues;

  /**
   * The controller, reachable from above where it is created.
   *
   * The desk prints the CC each ride is learned to, and the MIDI hook is built
   * further down the file than the desk's props are assembled. A ref rather
   * than a reorder: the hook's inputs depend on half the app.
   */
  const midiRef = useRef<{
    map: { bindings: { source: { kind: string; number: number }; target: { kind: string; key?: string } }[] };
    /** The shift layer, so a pad can step it — the actions run above the hook too. */
    stepBank: (dir: 1 | -1) => void;
  } | null>(null);

  /** Which CC a ride is learned to, so the desk and the controller agree. */
  const ccFor = useCallback((key: keyof VisualizerSettings): number | null => {
    const b = midiRef.current?.map.bindings.find(x => x.target.kind === 'setting' && x.target.key === key);
    return b && b.source.kind === 'cc' ? b.source.number : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  /** What a set item will send: its look with its own controls on top, or its sequence. */
  const lookOfItem = useCallback((item: SetItem): ArmedLook | null => {
    const extra = { item: item.id, fade: item.fade, rides: item.rides };
    if (item.kind === 'sequence') {
      const seq = sequencerRef.current?.sequences.find(q => q.id === item.ref);
      return seq ? { id: `sequence:${seq.id}`, name: item.name ?? seq.name, settings: {}, sequence: seq.id, ...extra } : null;
    }
    const up = isUserPresetId(item.ref) ? userPresetsRef.current.find(p => p.id === item.ref) : null;
    const built = PRESETS.find(p => p.id === item.ref);
    const base = up ? up.settings : built?.settings;
    if (!base) return null;
    return { id: item.ref, name: item.name ?? up?.name ?? built?.name ?? item.ref, settings: { ...base, ...((item.controls ?? {}) as Partial<VisualizerSettings>) }, ...extra };
  }, []);
  const cueItem = useCallback((itemId: string) => {
    const item = setListRef.current.items.find(i => i.id === itemId);
    const look = item ? lookOfItem(item) : null;
    if (look) setCued(look);
  }, [lookOfItem]);
  /** Arm a row of the desk's list, whichever list it is showing. */
  const cueAny = useCallback((id: string) => {
    if (setListRef.current.items.length > 0) cueItem(id); else cueLook(id);
  }, [cueItem, cueLook]);
  const liveItemIdRef = useRef<string | null>(null);
  liveItemIdRef.current = liveItemId;

  /**
   * Send a look to the stage, over `seconds`. With no fade this is still not
   * a clear: `adoptPreset` takes the new dyes without wiping the plate.
   *
   * Taking the look as an argument rather than reading `cued` is what lets
   * ⇧⏎ in the palette send one that was never armed — arming it first and
   * then calling Go would read a `cued` that this render does not have yet.
   */
  /**
   * Crossfade the settings from where the plate is now to `to`, over
   * `seconds`. The one fade loop — Go, Revert and a new song all run through
   * it, and there were three copies of it before there were three callers.
   *
   * ~30 a second: a crossfade over seconds does not need sixty settings
   * objects a second, and the solver is the expensive part of a settings
   * change rather than React.
   */
  const fadeSettingsTo = useCallback((to: VisualizerSettings, seconds: number) => {
    if (lookFadeRef.current) { clearInterval(lookFadeRef.current); lookFadeRef.current = null; }
    const from = settingsRef.current;
    if (seconds <= 0) { setSettings(to); setFading(0); return; }
    const started = performance.now();
    const ms = seconds * 1000;
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
  }, []);

  const sendLook = useCallback((next: ArmedLook, seconds: number) => {
    setLiveItemId(next.item ?? null);
    // A set item's own strip goes up with it.
    if (next.rides && next.rides.length) setRideKeys(next.rides);
    if (next.sequence) {
      setCued(null);
      sequencerRef.current?.startAt(next.sequence, 0);
      return;
    }
    const from = settingsRef.current;
    previousLook.current = { id: pinnedPresetId, settings: from };
    adoptPreset(next.id);
    setCued(null);
    // Pressing Go is a decision: the whole look, structure and all — and its
    // colours with it, handed over across the fade rather than left to
    // evaporate for minutes under the new ones. A cut still gets a second.
    visualizerRef.current?.handoff(Math.max(1, seconds));
    fadeSettingsTo(targetLook(from, next.settings), seconds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedPresetId, adoptPreset, fadeSettingsTo]);

  /** Go: the armed look, at the chosen fade. */
  const goLook = useCallback((seconds?: number) => {
    if (cued) sendLook(cued, seconds ?? cued.fade ?? fadeSeconds);
  }, [cued, fadeSeconds, sendLook]);

  /** The same, for a look that was never armed — the palette's ⇧⏎. */
  const goLookNow = useCallback((presetId: string, seconds = fadeSeconds) => {
    const up = isUserPresetId(presetId) ? userPresetsRef.current.find(p => p.id === presetId) : null;
    const built = PRESETS.find(p => p.id === presetId);
    const look = up ? { id: presetId, name: up.name, settings: up.settings }
      : built ? { id: presetId, name: built.name, settings: built.settings } : null;
    if (look) sendLook(look, seconds);
  }, [fadeSeconds, sendLook]);

  /** One step back, at the same fade. The fastest fix mid-show is undo. */
  const revertLook = useCallback(() => {
    const prev = previousLook.current;
    if (!prev) return;
    previousLook.current = null;
    if (prev.id) adoptPreset(prev.id);
    visualizerRef.current?.handoff(Math.max(1, fadeSeconds));
    fadeSettingsTo(prev.settings, fadeSeconds);
  }, [fadeSeconds, adoptPreset, fadeSettingsTo]);

  useEffect(() => () => { if (lookFadeRef.current) clearInterval(lookFadeRef.current); }, []);

  /*
    MIDI timecode, and the position the sequence follows.

    The reader is fed from the MIDI callback below at a hundred messages a
    second and never touches React. This poll reads it four times a second,
    which is as often as a stage boundary can matter, and sets state only when
    the second changes — a set that lasts an hour is then 3600 renders rather
    than 360,000.
  */
  const timecodeRef = useRef(new TimecodeReader());
  const [timecode, setTimecode] = useState<TimecodePosition | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const p = timecodeRef.current.read(performance.now());
      setTimecode(prev => {
        if (p === null) return prev === null ? prev : null;
        if (prev && prev.seconds === p.seconds && prev.minutes === p.minutes && prev.hours === p.hours) return prev;
        return p;
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── Songs: a look for each song, and what happens while it plays ──
  // See lib/songShows.ts. Kept in the browser and in files; the runtime is
  // wired up below, once the actions it performs exist.
  const [songShows, setSongShowsState] = useState<SongShow[]>(loadShows);
  const songShowsRef = useRef(songShows);
  songShowsRef.current = songShows;
  const setSongShows = useCallback((next: SongShow[]) => { setSongShowsState(next); saveShows(next); }, []);
  const [userActionSets, setUserActionSets] = useState<ActionSet[]>(loadSets);
  const actionSets = useMemo(() => [...BUILT_IN_SETS, ...userActionSets], [userActionSets]);
  const saveActionSet = useCallback((set: ActionSet) => setUserActionSets(prev => {
    const next = [...prev.filter(x => x.id !== set.id), { ...set, builtIn: undefined }];
    saveSets(next);
    return next;
  }), []);
  const deleteActionSet = useCallback((id: string) => setUserActionSets(prev => {
    const next = prev.filter(x => x.id !== id);
    saveSets(next);
    return next;
  }), []);
  const [followSongs, setFollowSongsState] = useState<boolean>(() => {
    try { return localStorage.getItem('chromaglass-follow-songs') !== '0'; } catch { return true; }
  });
  const setFollowSongs = useCallback((on: boolean) => {
    setFollowSongsState(on);
    try { localStorage.setItem('chromaglass-follow-songs', on ? '1' : '0'); } catch { /* private */ }
  }, []);
  const [showSongs, setShowSongs] = useState(false);

  const sequencer = useShowSequencer({
    getSettings: () => settingsRef.current,
    applySettings: (patch) => setSettings(prev => ({ ...prev, ...patch })),
    adoptPreset,
    setPaletteWindow: (size, lead) => visualizerRef.current?.setPaletteWindow(size, lead),
    sectionLabel: musicIntel.state.section?.label ?? null,
    isActive,
    // Design is not a place a sequence gets to write settings. See the note
    // on `suspended`.
    suspended: designing,
    presets: allPresets,
    timecodeAt: timecode?.at ?? null,
  });
  sequencerRef.current = sequencer;
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
  // ── The set's own edits ─────────────────────────────────────────
  const [addingToSet, setAddingToSet] = useState(false);
  const addToSet = useCallback((kind: SetItemKind, ref: string) => {
    changeSet(prev => ({ ...prev, items: [...prev.items, { id: setItemId(), kind, ref }] }));
  }, [changeSet]);
  /** A file into the set: a whole set list replaces it; a saved look or a sequence is one more item. */
  const importToSet = useCallback(async (file: File): Promise<{ summary: string; warnings: string[] }> => {
    const known = (k: string) => k in DEFAULT_SETTINGS;
    const read = readSetListFile(await file.text(), known);
    for (const p of read.presets) userPresets.upsert(p);
    for (const q of read.sequences) sequencer.upsertSequence(q);
    const whole = read.list.items.length > 1 || /setlist/i.test(file.name);
    if (whole) changeSet(read.list);
    else changeSet(prev => ({ ...prev, items: [...prev.items, ...read.list.items] }));
    const n = read.list.items.length;
    return {
      summary: whole ? `The set is now “${read.list.name}”: ${n} item${n === 1 ? '' : 's'}.` : `Added ${read.list.items[0].name ?? read.list.items[0].ref}.`,
      warnings: read.warnings,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSet]);
  const onSetAction = useCallback((a: SetAction, name?: string) => {
    if (a === 'import') setAddingToSet(true);
    else if (a === 'save') changeSaved(prev => withSavedSet(prev, setListRef.current));
    else if (a === 'open' && name) {
      const kept = loadSavedSets().find(x => x.name === name);
      if (kept) { changeSet({ name: kept.name, items: kept.items.map(i => ({ ...i })) }); setLiveItemId(null); }
    } else if (a === 'delete' && name) changeSaved(prev => prev.filter(x => x.name !== name));
    else if (a === 'rename' && name?.trim()) changeSet(prev => ({ ...prev, name: name.trim() }));
    else if (a === 'new') { changeSet({ name: 'New set', items: [], emptied: true }); setLiveItemId(null); }
    else if (a === 'export') {
      const list = setListRef.current;
      downloadText(`${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'set'}${SETLIST_FILE_EXT}`,
        writeSetListFile(list, userPresetsRef.current, sequencerRef.current?.sequences ?? []));
    } else if (a === 'clear') { changeSet(starterSet(PRESETS.map(p => p.id))); setLiveItemId(null); }
    else if (a === 'song-shows') setShowSongs(true);
  }, [changeSet, changeSaved]);
  const onItemAction = useCallback((id: string, a: SetItemAction) => {
    changeSet(prev => {
      if (a === 'up' || a === 'down') return moveItem(prev, id, a === 'up' ? -1 : 1);
      if (a === 'remove') return { ...prev, items: prev.items.filter(i => i.id !== id) };
      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.id !== id) return i;
          if (a === 'link-song') return currentSong ? { ...i, song: currentSong } : i;
          if (a === 'unlink-song') { const { song: _s, ...rest } = i; void _s; return rest; }
          // The strip as it stands: which controls, and where each one is now.
          const controls: Partial<Record<keyof VisualizerSettings, number>> = {};
          for (const k of rideKeys) {
            const v = settingsRef.current[k];
            if (typeof v === 'number' && k !== 'dimmer') controls[k] = v;
          }
          return { ...i, controls, rides: [...rideKeys] };
        }),
      };
    });
  }, [changeSet, currentSong, rideKeys]);

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
    setSettings(luckyLook(settings, liquidTypes.map(t => t.color)));
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
      fadeSettingsTo(evolvedLook(from, luckyLook(from, liquidTypesRef.current.map(t => t.color))), fadeSeconds);
      return;
    }
    const pool = PRESETS.filter(p => !p.settings.macroMode && p.id !== activePresetId);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;
    previousLook.current = { id: pinnedPresetId, settings: from };
    adoptPreset(next.id);
    fadeSettingsTo(evolvedLook(from, next.settings), fadeSeconds);
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
    output,
  }), [effectiveSettings, isActive, isAutomated, activeLayer, seedCount, clearTrigger, drainTrigger, activePresetId, presetSeq, paletteLock, output]);
  const relaySendRef = useRef<((m: RemoteMessage) => void) | null>(null);
  /**
   * The mark, kept as a data URL so it can be sent to a receiver.
   *
   * A cast receiver and a network display are separate documents running their
   * own copy of the solver; the settings that place the logo travel with
   * everything else, but the picture has to be handed over once. Held here
   * rather than only in the visualizer for that reason.
   */
  const markUrlRef = useRef<string | null>(null);
  const [markLoaded, setMarkLoaded] = useState(false);
  /*
    The state, at most fifteen times a second.

    It used to go out every time `castState` changed, and during a look fade
    that is every tick of the fade (thirty a second), plus every override the
    ear writes: a full settings object, stringified, down the Presentation
    channel and again down the relay to every mirror, and at the other end a
    React render of the whole receiver and a solver retune for each one. The
    stability plan (S10) asked for ~10 Hz on the grounds that "the receiver
    interpolates anyway". It does not: `CastDisplay` hands `state.settings`
    straight to its own visualizer, so a receiver shows a fade as exactly the
    staircase it was sent. At 10 Hz a two-second fade to black is twenty steps
    of 5% brightness a tenth of a second apart, which reads as a staircase on
    a dark wall. Fifteen is half the fade's own tick, so it still halves the
    traffic, and gives thirty steps a fifteenth of a second apart, which does
    not.

    So: a leading and trailing throttle. The first change after a quiet spell
    goes at once; changes inside the window are held, and one trailing send at
    the end of it carries whatever the state is *then* (read from a ref, not
    captured) — so the last value of a fade always arrives, and a receiver
    never rests on a value from the middle of one.

    Three things skip the wait:
    - A receiver's hello, or a new cast or mirror (`castReadyRef`, `joined`):
      a new receiver has nothing, and the mark goes with it on those alone,
      exactly as before.
    - A trigger: `presetSeq`, `seedCount`, `clearTrigger`, `drainTrigger`.
      Those are events carried as counters, and the receiver acts on each
      change; two coalesced into one window would be one seed or one clear
      where the operator pressed twice, or a preset re-seed that arrives up
      to a fifteenth of a second after the settings that follow it.
    - Nothing else. `isActive`, the output, the harmony lock and the rest are
      levels, and a level only needs its last value.
  */
  const CAST_STATE_MS = 66;
  const castStateRef = useRef(castState);
  castStateRef.current = castState;
  const castSendRef = useRef(castSend);
  castSendRef.current = castSend;
  const mirrorCountRef = useRef(mirrorCount);
  mirrorCountRef.current = mirrorCount;
  const castSentAtRef = useRef(-Infinity);
  const castSentTriggersRef = useRef('');
  const castTrailRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const castTriggers = (s: CastState) => `${s.presetSeq}:${s.seedCount}:${s.clearTrigger}:${s.drainTrigger}`;
  // Stable, and reads everything through refs, so the trailing timer can
  // never send a state (or a mirror count) older than the one it was set for.
  const sendCastState = useCallback((withMark = false) => {
    if (castTrailRef.current) { clearTimeout(castTrailRef.current); castTrailRef.current = null; }
    const state = castStateRef.current;
    const send = castSendRef.current;
    castSentAtRef.current = performance.now();
    castSentTriggersRef.current = castTriggers(state);
    send({ type: 'state', state });
    // The picture only when a receiver is new — on its hello, or when a cast
    // or a mirror starts — because that is the one moment it needs it.
    // It used to ride along with every state, and the state changes twice a
    // second while a track is identified and every frame of a fade: a data
    // URL of up to several megabytes, sixty times a second, down the channel
    // and the relay, each one decoded and re-uploaded at the other end.
    if (withMark) send({ type: 'mark', dataUrl: markUrlRef.current });
    if (mirrorCountRef.current > 0) {
      relaySendRef.current?.({ type: 'cast', message: { type: 'state', state } });
      if (withMark) relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: markUrlRef.current } });
    }
  }, []);
  useEffect(() => () => { if (castTrailRef.current) clearTimeout(castTrailRef.current); }, []);

  const loadMark = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const img = new window.Image();
      img.onload = () => {
        visualizerRef.current?.loadMark?.(img, img.naturalWidth, img.naturalHeight);
        markUrlRef.current = url;
        setMarkLoaded(true);
        castSend({ type: 'mark', dataUrl: url });
        relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: url } });
        setToastRef.current?.('Mark on the wall');
      };
      img.onerror = () => setToastRef.current?.('That file would not open as a picture');
      img.src = url;
    };
    reader.readAsDataURL(file);
  }, [castSend]);

  const clearMark = useCallback(() => {
    visualizerRef.current?.clearMark?.();
    markUrlRef.current = null;
    setMarkLoaded(false);
    castSend({ type: 'mark', dataUrl: null });
    relaySendRef.current?.({ type: 'cast', message: { type: 'mark', dataUrl: null } });
  }, [castSend]);
  castReadyRef.current = () => sendCastState(true);
  const castLinkRef = useRef('');
  useEffect(() => {
    if (!isCasting && mirrorCount === 0) {
      castLinkRef.current = '';
      if (castTrailRef.current) { clearTimeout(castTrailRef.current); castTrailRef.current = null; }
      return;
    }
    const link = `${isCasting}:${mirrorCount}`;
    const joined = link !== castLinkRef.current;
    castLinkRef.current = link;
    if (joined || castTriggers(castState) !== castSentTriggersRef.current) { sendCastState(joined); return; }
    const wait = CAST_STATE_MS - (performance.now() - castSentAtRef.current);
    if (wait <= 0) { sendCastState(false); return; }
    // One trailing send per window; it reads the state when it fires.
    if (!castTrailRef.current) castTrailRef.current = setTimeout(() => { castTrailRef.current = null; sendCastState(false); }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCasting, mirrorCount, castState, sendCastState]);
  /*
    The live state, for a harness to read.

    This used to close over the render's `castState` and be re-registered when
    it changed, which sounds equivalent and is not: a look fade or the
    sequencer rewrites settings between renders, and what came back was
    whichever snapshot the last effect happened to capture. A harness setting a
    value and reading it straight back got the old one — which cost three
    rounds of measuring the wrong plate before anyone thought to check the
    instrument. Reading refs means it cannot be stale.
  */
  const liveDebugRef = useRef({ isCasting, castState, audioData, songChange, isAutomated });
  liveDebugRef.current = { isCasting, castState, audioData, songChange, isAutomated };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCastState?: unknown }).chromaglassCastState = () => {
        const l = liveDebugRef.current;
        return {
          isCasting: l.isCasting,
          castState: l.castState,
          audio: l.audioData,
          songChange: l.songChange,
          // Straight from the render rather than from the cast snapshot, which
          // is assembled for a receiver and not for a question.
          isAutomated: l.isAutomated,
          settings: settingsRef.current,
        };
      };
    }
  }, []);
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
  /** For the lighting feed below, which is armed once and must not close over a stale value. */
  const blackoutRef = useRef(blackout);
  blackoutRef.current = blackout;
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
    // One ramp from the plate outward, with no step onto it: pushing in from
    // 1 is the closeup arriving, and coming back down lands at the plate
    // rather than at a switch that has to be found and turned off.
    const z = Math.max(1, cur.macroZoom ?? 1);
    const next = Math.max(1, Math.min(16, (z < 1.05 && dir > 0 ? 1.2 : z) * Math.pow(dir > 0 ? 1.2 : 1 / 1.2, amount)));
    const zoom = Math.round(next * 100) / 100;
    updateSettings({ macroZoom: zoom, macroMode: zoom > 1.05 });
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
      // The tool in hand's Amount, a step at a time, at any width.
      if (e.key === '[' || e.key === ']') {
        const tool = activeToolRef.current;
        setToolAmounts(prev => ({ ...prev, [tool]: clampAmount(Math.round(((prev[tool] ?? 1) + (e.key === ']' ? 0.1 : -0.1)) * 10) / 10) }));
      }
    };
    // The wheel over the plate zooms the closeup in and out while it is on
    // (never turns it on: a trackpad brush must not become a camera cut).
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || (t.id !== 'liquid-canvas' && !t.closest?.('#liquid-canvas'))) return;
      // Still never *starts* a closeup: a trackpad brush over the plate must
      // not become a camera move. Once in, the wheel rides it all the way back
      // out to the plate, which is where the old guard would strand it.
      if ((settingsRef.current.macroZoom ?? 1) <= 1.001 || e.deltaY === 0) return;
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
  /**
   * Step what is *armed*, not what is live.
   *
   * The desk's whole safety story is that a look is chosen, looked at, and
   * then sent — so the pad that walks the list must move the cue and leave
   * the wall alone. Nothing cued yet: start from what is playing, so the
   * first press arms its neighbour rather than jumping to the top of the list.
   */
  const stepCue = (dir: 1 | -1) => {
    // The desk's own list: the set when there is one, every look when not.
    const list = cuesRef.current;
    if (list.length === 0) return;
    const set = setListRef.current.items.length > 0;
    const from = set ? (cuedRef.current?.item ?? liveItemIdRef.current) : (cuedRef.current?.id ?? activePresetId);
    const i = list.findIndex(c => c.id === from);
    const next = list[((i < 0 ? 0 : i + dir) + list.length) % list.length];
    if (next) cueAny(next.id);
  };
  /** For the debug hook, which is installed once and above the callback it calls. */
  const cuePresetRef = useRef<((id: string) => void) | null>(null);
  cuePresetRef.current = cuePreset;

  const stepPreset = (dir: 1 | -1) => {
    if (allPresets.length === 0) return;
    const i = allPresets.findIndex(p => p.id === activePresetId);
    const next = allPresets[(i + dir + allPresets.length) % allPresets.length];
    cuePreset(next.id);
  };
  const runActionRef = useRef<((a: MidiAction) => void) | null>(null);
  const runAction = (a: MidiAction) => {
    switch (a) {
      case 'seed':            setSeedCount(prev => prev + 1); break;
      case 'spin-front':      flickPlate(0); break;
      case 'spin-back':       flickPlate(1); break;
      case 'clear':           setClearTrigger(prev => prev + 1); break;
      case 'drain':           setDrainTrigger(prev => prev + 1); break;
      case 'lucky':           triggerLucky(); break;
      case 'play-toggle':     setIsActive(v => !v); break;
      case 'automate-toggle': setIsAutomated(v => !v); break;
      case 'overlays-toggle': if (overlaysVisible) hideOverlays(); else setOverlaysVisible(true); break;
      case 'macro-toggle': {
        // A pad still wants one press in and one press out. It moves the zoom,
        // because that is the control; the flag rides along for the looks that
        // still read it.
        const inNow = (settingsRef.current.macroZoom ?? 1) > 1.05;
        updateSettings(inNow ? { macroMode: false, macroZoom: 1 } : { macroMode: true, macroZoom: 4 });
        break;
      }
      case 'seq-play-pause':  if (sequencer.status.running) sequencer.pause(); else sequencer.play(); break;
      case 'seq-next':        sequencer.next(); break;
      case 'seq-prev':        sequencer.prev(); break;
      case 'seq-stop':        sequencer.stop(); break;
      case 'preset-next':     stepPreset(1); break;
      case 'preset-prev':     stepPreset(-1); break;
      case 'blackout-toggle': toggleBlackout(); break;
      case 'scene-toggle':    toggleScene(!sceneOn); break;
      case 'record-toggle':   toggleRecording(); break;
      case 'performance-toggle': togglePerformance(); break;
      // Cue and Go, from a pad. `go` is the whole reason the desk's look
      // change is safe in front of a room, and until now it was reachable
      // only from this laptop's keyboard.
      case 'go':              goLook(); break;
      case 'revert':          revertLook(); break;
      case 'cue-next':        stepCue(1); break;
      case 'cue-prev':        stepCue(-1); break;
      case 'tap-tempo':       tapTempo(); break;
      case 'tempo-clear':     clearTempo(); break;
      case 'bank-next':       midiRef.current?.stepBank(1); break;
      case 'bank-prev':       midiRef.current?.stepBank(-1); break;
      // Every action, or `tsc` names the one that is missing. A pad wired to
      // an action nobody wrote a case for is a dead pad, and silent.
      default: unhandled('an action', a);
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
    cuedPresetId: cued?.id ?? null,
    cuedName: cued?.name ?? null,
    fadeSeconds,
  }), [settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel.state.track?.title, sequencer.status, allPresets, blackout, recorder.recording, recorder.seconds, cued, fadeSeconds]);

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
        case 'cue':
          // Arm, do not apply: `preset` is the destructive one.
          if (message.presetId) cueLook(message.presetId); else setCued(null);
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
            case 'performance-toggle': togglePerformance(); break;
            case 'go':            goLook(); break;
            case 'back':          revertLook(); break;
            // A phone may be a newer build than the display, so an action
            // this one does not know is possible rather than impossible: it
            // is said out loud instead of swallowed. `tsc` still requires a
            // case for every action this build's own protocol declares.
            default: unhandled('an action from the phone', message.action);
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
        case 'finger':
          visualizerRef.current?.applyGesture({ tool: 'finger', x: message.x, y: message.y, layer: message.layer, amount: message.amount, dx: message.dx, dy: message.dy });
          break;
        case 'tilt':
          visualizerRef.current?.setExternalTilt(message.x, message.y);
          break;
        /*
          Not this display's, and each for its own reason. Naming them is the
          point: without these four the switch below cannot ask the compiler
          for the rest, and "no case" reads the same whether it was decided
          or forgotten.

          `hello` goes the other way — `useRemoteLink` sends it on connect.
          `denied` is taken by that hook too, before `onMessage` ever runs,
          and so is `request-state`, which the hook answers for this role.
          `lights` and `state` this display *sends*: the first a few lines
          down from here, the second from the hook.
          `cast` is the mirror's, and `CastDisplay` has it.
        */
        case 'hello':
        case 'denied':
        case 'request-state':
        case 'state':
        case 'lights':
        case 'cast':
          break;
        default: unhandled('a message from the phone', message);
      }
    },
  });

  runActionRef.current = runAction;

  // ── Songs: the runtime ──────────────────────────────────────────
  /** A setting walked to a value over some seconds, the way a hand turns a knob. One walk per setting. */
  const glidesRef = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const glideSetting = useCallback((key: keyof VisualizerSettings, to: number, seconds: number, atEnd?: Partial<VisualizerSettings>) => {
    const timers = glidesRef.current;
    const running = timers.get(String(key));
    if (running) clearInterval(running);
    const from = Number((settingsRef.current as unknown as Record<string, unknown>)[key] ?? 0);
    if (!(seconds > 0)) { setSettings(p => ({ ...p, [key]: to, ...(atEnd ?? {}) })); return; }
    const started = performance.now();
    const timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - started) / (seconds * 1000));
      const e = k * k * (3 - 2 * k);
      setSettings(p => ({ ...p, [key]: k >= 1 ? to : from + (to - from) * e, ...(k >= 1 ? atEnd ?? {} : {}) }));
      if (k >= 1) { clearInterval(timer); timers.delete(String(key)); }
    }, 33);
    timers.set(String(key), timer);
  }, []);
  useEffect(() => () => { for (const t of glidesRef.current.values()) clearInterval(t); }, []);

  /** Do one of a song's actions, through the same moves a pad or a key makes. */
  const performSongAction = useCallback((action: SongAction, show: SongShow) => {
    const a = action.what;
    const v = visualizerRef.current;
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
      // A show that names something this build cannot do says so, rather
      // than running the stage and appearing to have done it.
      default: unhandled("a song show's action", a);
    }
  }, [glideSetting, goLookNow]);

  const songRuntime = useSongShows({
    shows: songShows,
    // Not while a look is being built: Design is where settings are chosen by hand.
    follow: followSongs && !designing,
    track: musicIntel.state.track,
    positionSec: musicIntel.state.positionSec,
    songMap: musicIntel.state.songMap,
    isActive,
    kicks: () => visualizerRef.current?.kicks() ?? 0,
    applyLook: (show, fade) => goLookNow(show.look.id, fade),
    perform: performSongAction,
  });
  const songRuntimeRef = useRef(songRuntime);
  songRuntimeRef.current = songRuntime;
  const lookChoices = useMemo<LookChoice[]>(() => [
    ...PRESETS.map(p => ({ kind: 'preset' as const, id: p.id, name: p.name })),
    ...userPresets.presets.map(p => ({ kind: 'saved' as const, id: p.id, name: p.name })),
  ], [userPresets.presets]);
  relaySendRef.current = remoteLink.send;

  /*
    The plate's colour, out to the lighting rig.

    The same `layerReport` the bench draws its tabs from, twenty times a second
    to the show server, which turns it into Art-Net (see `server/artnet.js`).
    The par cans wash the room in whatever the dye is doing instead of whatever
    was set before the doors opened.

    Faster than the bench's poll because a light that lags the screen by half a
    second reads as broken, and it costs nothing when nothing is listening: no
    relay, no socket, no send. It carries no React state, so the loop never
    causes a render.
  */
  useEffect(() => {
    if (remoteLink.status !== 'connected') return;
    const id = setInterval(() => {
      const layers = visualizerRef.current?.layerReport?.();
      if (!layers?.length) return;
      // The plate's own brightness, so the room dims when the glass thins
      // rather than sitting at full on an empty plate. Blackout is black.
      const fill = layers.reduce((a, l) => a + l.fill, 0) / layers.length;
      const master = blackoutRef.current ? 0 : Math.min(1, fill * 1.6);
      relaySendRef.current?.({ type: 'lights', layers: layers.map(l => ({ colour: l.colour, fill: l.fill })), master });
    }, 50);
    return () => clearInterval(id);
  }, [remoteLink.status]);

  // ── MIDI controller and game controller ─────────────────────────
  const allPresetIds = useMemo(() => allPresets.map(p => p.id), [allPresets]);
  const midi = useMidi(
    {
      getSetting: (key) => ride.read(String(key), settingsRef.current as unknown as Record<string, unknown>),
      setSetting: rideSetting,
      action: runAction,
      applyPreset: cuePreset,
      selectDye,
      // Every note plays the envelopes, whatever else that pad is for.
      noteStruck: (velocity) => visualizerRef.current?.fireEnvelopes?.(velocity),
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
      toggles: { play: isActive, automate: isAutomated, macro: !!settings.macroMode, overlays: overlaysVisible, sequencer: sequencer.status.running, blackout, record: recorder.recording, performance: !!musicIntel.performance.live },
    },
    allPresetIds,
    // The tempo, if the desk is sending it. Straight into the tempo source:
    // twenty-four messages a beat has no business going through React.
    useCallback((kind: 'clock' | 'start' | 'continue' | 'stop', at: number) => {
      const t = tempoRef.current;
      if (!t) return;
      if (kind === 'clock') t.clockPulse(at);
      else if (kind === 'stop') t.clockStop();
      else t.clockStart(at);
    }, []),
    // Timecode, straight into the reader for the same reason: a rolling desk
    // sends a hundred of these a second and none of them is a render.
    useCallback((message: { quarter: number } | { full: Uint8Array }, at: number) => {
      const r = timecodeRef.current;
      if ('quarter' in message) r.quarter(message.quarter, at);
      else r.full(message.full, at);
    }, []),
  );
  midiRef.current = midi as unknown as typeof midiRef.current;
  /*
    A trigger the music fired (sound learn, PLAN §5): exactly what a pad bound
    to the same target does, through the same three doors, so a kick on
    Next Preset and a pad on Next Preset cannot come to mean different things.
    An action a beat must not press is refused here as well as when the
    binding is made or loaded: this is the last door before the show.
  */
  const runSoundTrigger = (b: SoundBinding) => {
    const t = b.target;
    switch (t.kind) {
      case 'action':  if (triggerable(t.action)) runAction(t.action); break;
      case 'preset':  cuePreset(t.presetId); break;
      case 'dye':     selectDye(t.paletteIndex); break;
      // A mapping is folded by the patch bay and never fired.
      case 'setting': break;
      default: unhandled('a sound trigger', t);
    }
  };
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

  // ── ⌘K, and the keys a hand finds in the dark ───────────────────
  /*
    The desk shows six rides and a cue list and nothing else, because those
    are what a hand is on during a set. Everything else the app can do stays
    one keystroke away instead of one more panel: ⌘K opens a box, you type
    three letters, you press Enter.

    The keys themselves are the same commands, without the box. They are
    printed on the buttons that share them — a shortcut nobody can see is a
    shortcut nobody uses.
  */
  const [showPalette, setShowPalette] = useState(false);

  const paletteCommands = useMemo<Command[]>(() => {
    const looks: Command[] = allPresets.map(pr => {
      const contract = isUserPresetId(pr.id)
        ? userPresetsRef.current.find(u => u.id === pr.id)?.contract
        : PRESET_CONTRACTS[pr.id];
      const [a, b] = contract && contract.length
        ? [PALETTE[contract[0]]?.hex ?? '#666', PALETTE[contract[1] ?? contract[0]]?.hex ?? '#333']
        : ['#52525B', '#27272A'];
      return {
        id: `look-${pr.id}`,
        name: pr.name,
        kind: 'Looks',
        look: true,
        hint: (contract ?? []).map(i => PALETTE[i]?.name ?? '').join(' '),
        swatch: `linear-gradient(135deg, ${a}, ${b})`,
        // In Perform a look is armed, not applied: the wall does not cut
        // because someone searched. ⇧⏎ is the one that sends it.
        run: () => { if (performing) cueLook(pr.id); else cuePreset(pr.id); },
        runNow: () => { if (performing) goLookNow(pr.id); else cuePreset(pr.id); },
      };
    });

    const doing: Command[] = [
      { id: 'go',        name: 'Go — send the cued look',   kind: 'Actions', kbd: 'Space', run: () => goLook() },
      { id: 'back',      name: 'Back — undo the last look', kind: 'Actions', kbd: '⌫',    run: () => revertLook() },
      { id: 'blackout',  name: blackout ? 'Lights up' : 'Blackout', kind: 'Actions', kbd: 'B', run: toggleBlackout },
      { id: 'new',       name: 'New — an empty plate',      kind: 'Actions', run: newLook },
      { id: 'save',      name: 'Save this look',            kind: 'Actions', kbd: '⌘S',  run: saveLook },
      { id: 'save-as',   name: 'Save as a new look…',       kind: 'Actions', kbd: '⇧⌘S', run: saveLookAs },
      { id: 'seed',      name: 'Seed the plate',            kind: 'Actions', run: () => setSeedCount(v => v + 1) },
      { id: 'clear',     name: 'Clear the plate',           kind: 'Actions', run: () => setClearTrigger(v => v + 1) },
      { id: 'drain',     name: 'Drain the plate',           kind: 'Actions', run: () => setDrainTrigger(v => v + 1) },
      { id: 'freeze',    name: isActive ? 'Freeze the liquid' : 'Thaw the liquid', kind: 'Actions', kbd: 'F', run: () => setIsActive(v => !v) },
      { id: 'evolve',    name: isAutomated ? 'Stop evolving' : 'Evolve on its own', kind: 'Actions', run: () => setIsAutomated(v => !v) },
      { id: 'macro',     name: settings.macroMode ? 'Leave the closeup' : 'Macro closeup', kind: 'Actions', run: () => updateSettings({ macroMode: !settings.macroMode }) },
      { id: 'record',    name: recorder.recording ? 'Stop recording' : 'Record the plate', kind: 'Actions', run: toggleRecording },
      { id: 'report',    name: 'Report a problem — save what the show was doing', kind: 'Actions', run: openCrashReport },
      { id: 'lucky',     name: 'Randomise the look (replaces everything)', kind: 'Actions', run: triggerLucky },
      { id: 'hide',      name: 'Clean screen — hide all controls', kind: 'Actions', run: hideOverlays },
    ];

    /*
      Every settings section, one row each.

      A single "Settings" row put sixteen sections and eighty controls behind a
      word that describes none of them — and the panel then opened on the half
      that did not contain the room camera, the projectors, the solver or the
      physics. Typing "room" or "keystone" or "people" now lands on the section
      itself rather than on the top of a panel that has it somewhere.
    */
    const sections: Command[] = SETTINGS_SECTIONS.map(sec => ({
      id: `settings-${sec.id}`,
      name: `Settings: ${sec.name}`,
      // Matched as well as the name: the section's terms and every label in
      // it, so "keystone", "flash" or "dimmer" land on the section they live in.
      terms: sectionSearchText(sec),
      kind: 'Open',
      run: () => { setSettingsSection(sec.id); setShowSettings(true); setShowHelp(false); },
    }));

    const opening: Command[] = [
      // Named for the words on the button that does the same thing. It read
      // "Settings", so typing what the button says — "all settings" — matched
      // nothing at all, out of sixty-eight commands.
      { id: 'open-settings', name: 'All settings', kind: 'Open', run: openAllSettings },
      { id: 'open-midi',     name: 'MIDI',            kind: 'Open', run: () => { setShowMidi(true); setShowSequencer(false); } },
      { id: 'midi-activity', name: showActivity ? 'Hide what the controller is doing' : 'Show what the controller is doing',
        kind: 'Open', run: () => setShowActivity(v => !v) },
      { id: 'open-songs',    name: 'Songs',           kind: 'Open', run: () => { setShowSongs(true); setShowMidi(false); } },
      { id: 'open-seq',      name: 'Stage sequences', kind: 'Open', run: () => { setShowSequencer(true); setShowMidi(false); } },
      { id: 'open-guide',    name: 'Guide',           kind: 'Open', run: () => { setShowHelp(true); setShowSettings(false); } },
      { id: 'open-wall',     name: 'Send the show to a window', kind: 'Open', run: () => { void startCast('window'); } },
      { id: 'open-design',   name: deskMode === 'perform' ? 'Design mode' : 'Perform mode', kind: 'Open',
        run: () => setDeskMode(m => (m === 'perform' ? 'design' : 'perform')) },
    ];

    return [...looks, ...doing, ...opening, ...sections];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPresets, performing, blackout, isActive, isAutomated, settings.macroMode, recorder.recording, deskMode,
      cueLook, cuePreset, goLook, goLookNow, revertLook, toggleBlackout, toggleRecording, hideOverlays]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (e.target as HTMLElement | null)?.isContentEditable;

      // ⌘K works everywhere, including out of a text field, because that is
      // the one key whose whole job is to get you out of where you are.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setShowPalette(v => !v);
        return;
      }
      // The bench's two: save what you have made, send it to the wall.
      if (designing && (e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        setShowSave(true);
        return;
      }
      // Save as, the shifted Save. Before Save could write over anything there
      // was nothing for it to be the other half of.
      if (designing && (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveLookAs();
        return;
      }
      if (designing && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void startCast('window');
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!deskUp) return;          // the narrow-screen UI has its own keys

      // The tools are the same letters on both desks; Design has all eight.
      // The Perform desk's four are the ones that work the liquid already on
      // the plate rather than adding more of it — and the finger is one of
      // those, which is why G belongs in this list and not only in Design.
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      // Both desks carry every tool now, so every tool's key works on both.
      if (tool) {
        setActiveTool(tool);
        return;
      }
      if (e.key === 'f' || e.key === 'F') { setIsActive(v => !v); return; }
      if (e.key === 't' || e.key === 'T') { togglePerformance(); return; }

      // The rest are the show's, and only while the desk is up: on the bench
      // Space should not fire a look change at a room.
      if (!performing) return;
      if (e.code === 'Space') { e.preventDefault(); goLook(); return; }
      if (e.key === 'Backspace') { e.preventDefault(); revertLook(); return; }
      // 1–9 arm the first nine cues. Arm, not fire: the number picks the look
      // and Space sends it, which is how a lighting desk has always worked.
      if (e.key >= '1' && e.key <= '9') {
        const cue = cuesRef.current[Number(e.key) - 1];
        if (cue) cueAny(cue.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performing, designing, deskUp, goLook, revertLook, cueAny, togglePerformance]);

  /** The save sheet, opened from the bench and from ⌘S. */
  const [showSave, setShowSave] = useState(false);

  /** The lamps in both desks' headers, and the line along the bottom. */
  /**
   * Whether the cue bar is occupying the bottom centre of a narrow screen.
   * The minimise chips live there too and have to give way to it.
   */
  const cueBarUp = !deskUp && !!(cued || fading > 0 || previousLook.current);

  const deskDots = useMemo(() => ({
    mic: audioSource !== 'none',
    wall: isCasting,
    midi: midi.enabled,
    phone: remoteLink.status === 'connected',
    rec: recorder.recording ? String(recorder.seconds) : null,
    perf: perfClock,
  }), [audioSource, isCasting, midi.enabled, remoteLink.status, recorder.recording, recorder.seconds, perfClock]);

  /*
    Where each status dot goes.

    One set of handlers rather than one per desk, for the same reason the
    header itself is one component: Design and Perform must send you to the
    same place from the same dot. Each closes whatever else is open, because
    two panels over a plate is the state you cannot see the show through.
  */
  const openSettingsAt = useCallback((section: string) => {
    setSettingsSection(section);
    setShowSettings(true);
    setShowMidi(false);
    setShowSequencer(false);
    setShowHelp(false);
  }, []);
  const deskOpen = useMemo(() => ({
    mic: () => openSettingsAt('audio-input'),
    wall: () => openSettingsAt('projectors'),
    midi: () => { setShowMidi(true); setShowSequencer(false); setShowSettings(false); setShowHelp(false); },
    // The phone has no setting to change — it either found the relay or it did
    // not — so this goes to the part of the guide that says what it does and
    // what has to be running for it to connect at all.
    phone: () => { setHelpFocus('live'); setShowHelp(true); setShowSettings(false); setShowMidi(false); setShowSequencer(false); },
  }), [openSettingsAt]);

  const deskAudioLine = audioSource === 'none' ? 'silent'
    : `${audioSource === 'simulated' ? 'band' : audioSource}${audioData ? ` ${Math.round(Math.min(100, audioData.volume))}%` : ''}`;

  /** The dyes on the desk's tray: the bottles that are colours, not behaviours. */
  const trayDyes = useMemo(() => liquidTypes.filter(l => !l.behaviour).map(l => l.color), [liquidTypes]);

  // Derive preset name for display
  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    return allPresets.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId, allPresets]);

  // The black box's half from here: which look, where the picture is going,
  // and the look itself for a report (docs/crash-plan.md).
  const crashStateRef = useRef({ activePresetName, settings, output, isCasting, projector: projector.projector, isAutomated });
  crashStateRef.current = { activePresetName, settings, output, isCasting, projector: projector.projector, isAutomated };
  useEffect(() => {
    const unprovide = crashLog.provide('app', () => {
      const c = crashStateRef.current;
      const p = c.projector;
      return {
        preset: c.activePresetName ?? 'custom',
        // Whether Evolve is on, and how fast: the one switch a report about
        // "the plate changing too much" could not answer without.
        evolve: c.isAutomated ? `on at ${Math.round((c.settings.automateRate ?? 0) * 100)}%, surge ${Math.round((c.settings.surge ?? 0) * 100)}%` : 'off',
        projector: c.isCasting ? `casting${p ? ` to ${p.availWidth}x${p.availHeight}` : ''}` : p ? `found ${p.availWidth}x${p.availHeight}` : 'none',
      };
    });
    crashLog.provideReport({
      look: () => ({
        preset: crashStateRef.current.activePresetName,
        settings: crashStateRef.current.settings,
        plate: visualizerRef.current?.describePlate() ?? null,
        output: crashStateRef.current.output,
      }),
    });
    return unprovide;
  }, []);

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden font-sans text-white ${overlaysVisible ? '' : 'overlays-hidden'}`}>
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audioData} settings={effectiveSettings} seedCount={seedCount} spinFlick={spinFlick}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
        onAim={aimMacro}
        toolAmount={toolAmount}
        drainTrigger={drainTrigger} activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
        sceneRef={scene.reading}
        filmSenseRef={filmSense.reading}
        frame={preview.frame}
        output={output}
        tempoRef={tempoRef}
        soundBindings={midi.map.sound}
        onSoundTrigger={runSoundTrigger}
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
        onEnded={() => {
          setMusicPlaying(false);
          if (!musicLoop) return;
          const el = musicElRef.current;
          if (musicFile?.track) playTrack(nextTrack(musicFile.track.src));
          else if (el && musicFile) { el.currentTime = 0; void el.play().catch(() => {}); }
        }} />
      {libraryOpen && overlaysVisible && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 w-[min(92vw,460px)] rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl shadow-2xl" data-testid="music-library">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
              Ambient shelf · {clock(librarySeconds())}
            </span>
            <button onClick={() => setLibraryOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-white/50" aria-label="Close the shelf"><X size={12} /></button>
          </div>
          {LIBRARY.map(t => (
            <button
              key={t.src}
              onClick={() => playTrack(t)}
              className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                musicFile?.track?.src === t.src ? 'bg-amber-400/10 text-amber-200' : 'text-white/70 hover:bg-white/5'
              }`}
              data-testid={`music-track-${t.src.split('/').pop()?.replace('.mp3', '')}`}
            >
              <span className="text-[12px] font-semibold">{t.title}</span>
              <span className="text-[11px] text-white/40">{t.artist}</span>
              <span className="ml-auto font-mono text-[9px] text-white/30">{clock(t.seconds)}</span>
              <span className="font-mono text-[9px] text-white/25">{t.licence}</span>
            </button>
          ))}
          {/*
            The credit is on screen, not in a file nobody opens. CC-BY asks to
            name the artist wherever the work is used, and a projector in a
            room full of people is where it is being used.
          */}
          <p className="mt-2 border-t border-white/10 px-2 pt-2 text-[10px] leading-relaxed text-white/40">
            Music by {credits()}, and public-domain pieces by Thomas Park. Re-encoded and
            level-matched for the room. Sources on{' '}
            <a href="https://archive.org/details/netlabels" target="_blank" rel="noreferrer" className="underline hover:text-white/70">archive.org</a>.
          </p>
        </div>
      )}
      {musicFile && overlaysVisible && (
        <div className="fixed bottom-16 left-1/2 z-40 -translate-x-1/2 flex items-center gap-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-xl shadow-2xl" data-testid="music-player">
          <button onClick={toggleMusic} className="p-1.5 rounded-full hover:bg-white/10" aria-label={musicPlaying ? 'Pause music' : 'Play music'} data-testid="music-play">
            {musicPlaying ? <Pause size={13} /> : <Play size={13} fill="currentColor" />}
          </button>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/80 max-w-[160px] truncate"
            title={musicFile.track ? `${musicFile.track.title} — ${musicFile.track.artist} · ${musicFile.track.licence}` : musicFile.name}>
            {musicFile.name}
          </span>
          {musicFile.track?.mustCredit && (
            <span className="text-[10px] text-white/40 max-w-[120px] truncate" data-testid="music-credit">{musicFile.track.artist}</span>
          )}
          <span className="font-mono text-[9px] text-white/40">{Math.floor(musicTime.t / 60)}:{String(Math.floor(musicTime.t % 60)).padStart(2, '0')}</span>
          <input type="range" min={0} max={Math.max(1, musicTime.d)} step={0.1} value={Math.min(musicTime.t, musicTime.d || 0)}
            onChange={(e) => { const el = musicElRef.current; if (el) el.currentTime = parseFloat(e.target.value); }}
            className="w-40 h-6 accent-white cursor-pointer" aria-label="Seek" data-testid="music-seek" />
          <span className="font-mono text-[9px] text-white/40">{Math.floor(musicTime.d / 60)}:{String(Math.floor(musicTime.d % 60)).padStart(2, '0')}</span>
          <button
            onClick={() => setMusicLoop(v => !v)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
              musicLoop ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100' : 'border-white/15 text-white/40 hover:text-white/70'
            }`}
            title={musicFile?.track
              ? 'Hand over to the next track on the shelf when this one ends, and round again'
              : 'Play this file again when it ends, so the room is never left in silence'}
            data-testid="music-loop"
          >
            {musicFile?.track ? 'rolls on' : 'repeats'}
          </button>
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
          <button onClick={() => projector.setMode('off')} className="p-1 text-white/30 hover:text-white" aria-label="Dismiss and stop offering" title="Don't offer this (Settings → Wall turns it back on)"><X size={11} /></button>
        </div>
      )}
      {isCasting && windowFullscreen === false && overlaysVisible && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-full border border-amber-400/30 bg-black/60 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-100/90 backdrop-blur-xl shadow-2xl" data-testid="projector-fill">
          <Projector size={13} /> The projector window still has its title bar
          <button onClick={fillWindow} className="rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[9px] hover:bg-amber-500/30" title="Fill the projector's screen (the browser's own full screen, which drops the title bar). Any click here does it too.">fill its screen</button>
        </div>
      )}
      {(settings.macroZoom ?? 1) > 1.05 && overlaysVisible && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 translate-y-9 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl shadow-2xl" data-testid="macro-zoom">
          <Microscope size={12} className="ml-1" />
          <button onClick={() => zoomMacro(-1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom out (− or the wheel over the plate)" aria-label="Zoom out" data-testid="macro-zoom-out">−</button>
          <span className="font-mono tabular-nums" data-testid="macro-zoom-value">{(settings.macroZoom ?? 1).toFixed(1)}×</span>
          <button onClick={() => zoomMacro(1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom in (+ or the wheel over the plate)" aria-label="Zoom in" data-testid="macro-zoom-in">+</button>
          {/* Who moves the camera. Alt-drag on the plate pans it; Alt-click fixes it on a spot. */}
          <span className="mx-1 h-3 w-px bg-white/20" />
          {([
            ['hold', 'Hold', 'Hold still where it is aimed. Alt-drag on the plate to pan, Alt-click to fix on a spot; Random Evolve wanders it slowly.'],
            ['follow', 'Follow', 'Lock onto the liquid where it is aimed and ride with it. Alt-click on something to follow it.'],
            ['auto', 'Auto', 'The camera picks its own subjects and cuts between them.'],
          ] as const).map(([mode, label, title]) => (
            <button key={mode} onClick={() => updateSettings({ macroCamera: mode })} title={title}
              aria-pressed={(settings.macroCamera ?? 'hold') === mode} data-testid={`macro-camera-${mode}`}
              className={`rounded-full px-2 py-0.5 ${(settings.macroCamera ?? 'hold') === mode ? 'bg-white/20 text-white' : 'hover:bg-white/15 text-white/60'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {blackout && overlaysVisible && (
        <div className="pointer-events-none fixed top-3 right-1/2 translate-x-[120px] z-40 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-red-200" data-testid="blackout-chip">Blackout · B</div>
      )}

      {/* ── Clean-screen hint: the one thing shown after everything is hidden ── */}
      <AnimatePresence>

        {toast && (
          <div
            key="toast"
            className="pointer-events-none absolute bottom-20 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-4 py-2 text-[13px] text-white/80 backdrop-blur-xl"
            data-testid="toast"
          >
            {toast}
          </div>
        )}
        {/*
          The room camera was on when they left, so the app offers it back
          rather than taking it.

          It used to restore itself: the switch was remembered, permission had
          already been granted, and so the camera opened on load with no prompt
          and nothing on screen saying why. Permission is not consent, and a
          camera coming on unannounced in a room is the one thing here worth
          being strict about. Ignoring this leaves it off, which is the safe
          answer and therefore the default.
        */}
        {sceneResume && !sceneOn && (
          <div
            className="absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/15 bg-black/80 px-4 py-2 text-[13px] text-white/80 backdrop-blur-xl"
            data-testid="scene-resume"
            role="dialog"
            aria-label="Room camera"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-live)]" />
            <span>The room camera was on last time. Turn it back on?</span>
            <button
              onClick={() => toggleScene(true)}
              className="font-medium text-white hover:underline"
              data-testid="scene-resume-yes"
            >
              Turn it on
            </button>
            <button
              onClick={() => {
                setSceneResume(false);
                // Stop asking: off is the safe state and switching it on is one
                // click away in Settings whenever they want it.
                try { localStorage.setItem(SCENE_ON_KEY, '0'); } catch { /* private */ }
              }}
              className="text-white/50 hover:text-white/80"
              data-testid="scene-resume-no"
            >
              Not now
            </button>
          </div>
        )}

        {!overlaysVisible && showCleanHint && (
          <motion.div
            key="clean-hint"
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
      {/*
        Not while the desk is up. The desk is a control surface in its own
        right; drawing the bottle rail and the toolbar over it as well was
        what put Sound Drive on screen twice, and a control that exists in
        two places is a control you cannot trust.
      */}
      <AnimatePresence>
        {showControls && !showSettings && !deskUp && (
          <>
            {/* ── Left Controls ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`absolute top-1/2 -translate-y-1/2 left-4 z-10 flex max-w-[55vw] flex-col items-start gap-4 transition-all duration-300 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${cueBarUp ? 'max-h-[calc(100vh-340px)]' : 'max-h-[calc(100vh-260px)]'} ${isMinimized ? '-translate-x-[150%] opacity-0' : ''}`}
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
                    {/*
                      Two up. Nine bottles in a single column ran the bench past
                      the bottom of the screen on a laptop, which put the four
                      that change the plate — the interesting ones — below the
                      fold. Paired, the whole bench is in view at once.
                    */}
                    <div className="grid grid-cols-1 min-[440px]:grid-cols-2 gap-1">
                    {group.map((liq) => {
                      const isSelected = liq.id === selectedLiquidId;
                      return (
                        <button
                          key={liq.id}
                          onClick={() => { setSelectedLiquidId(liq.id); setActiveTool('dropper'); }}
                          title={liq.description}
                          data-testid={`liquid-${liq.id}`}
                          className={`flex items-center gap-2 w-full px-2 py-2.5 rounded-xl border-2 transition-all text-left ${
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
                              <span className="flex h-6 w-6 items-center justify-center text-[11px] text-white/40 hover:text-white transition-colors">&#9679;</span>
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
                  <div className="grid grid-cols-5 min-[440px]:grid-cols-8 gap-1">
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
                      <span className="text-[8px] opacity-50">the music picks</span>
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
                      { id: 'finger' as const, icon: Fingerprint, label: 'Finger' },
                      { id: 'magnet' as const, icon: Magnet, label: 'Magnet' },
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
                  <ToolAmount tool={activeTool} value={toolAmount} onChange={(v) => setToolAmount(activeTool, v)} className="mt-1 text-white/80" />
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
              className={`absolute top-1/2 -translate-y-1/2 right-4 z-10 max-w-[40vw] transition-all duration-300 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${cueBarUp ? 'max-h-[calc(100vh-340px)]' : 'max-h-[calc(100vh-260px)]'} ${isMinimized ? 'translate-x-[150%] opacity-0' : ''}`}
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
                    data-testid="evolve-toggle"
                    className={`relative w-[52px] h-[26px] rounded-full transition-colors duration-300 ${isAutomated ? 'bg-purple-500' : 'bg-white/20'}`}
                    title="Works the plate on its own: drops and air from the music, dye lifted off again, a finger drawn through it, and the dials wandering slowly around the look"
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
                      title="How busy Random Evolve is: how often it pours, thins, strokes, and how far the dials wander"
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
                  onClick={() => { setSettingsSection(null); setShowSettings(!showSettings); setShowHelp(false); }}
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

                {/* Songs: a look for each song and what happens while it plays */}
                <button
                  onClick={() => { setShowSongs(!showSongs); setShowTrackPanel(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showSongs || songRuntime.status.showId !== null || sequencer.status.running ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Songs — a look for each song, and what happens while it plays"
                  data-testid="songs-button"
                >
                  <Clapperboard size={16} className={showSongs || songRuntime.status.showId !== null ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Songs</span>
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
                    onClick={() => setLibraryOpen(v => !v)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      musicFile?.track
                        ? 'text-amber-300 bg-amber-400/10 border border-amber-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={`Ambient music that ships with the show — ${clock(librarySeconds())} of it, licensed for a room like this one, and played from this tab so a shared tab carries the sound too`}
                    data-testid="music-library-button"
                  >
                    <Music size={14} />
                    <span>Shelf</span>
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
      {/* One child per AnimatePresence: it tells its children apart by key, two
          without one both read as "", and React warned on every frame the
          pair was up. The components here take no `key` in their props type. */}
      <AnimatePresence>
        {showControls && !showSettings && !isMinimized && <RunLocallyCard status={engineStatus} />}
      </AnimatePresence>
      <AnimatePresence>
        <BenchOverlay
          running={bench.running}
          done={bench.done}
          total={bench.total}
          label={bench.label}
          text={bench.text}
          onClose={() => setBench(b => ({ ...b, text: null }))}
        />
      </AnimatePresence>

      {/* ── Minimize / clean-screen chips ──────────────────────── */}
      {/*
        These share the bottom centre with the cue bar, which is the one thing
        that turns up there unannounced: `fixed bottom-6 left-1/2` on both, and
        the cue bar's higher z-index, so cueing a look on a narrow screen
        painted it straight over Hide UI and Clean Screen and neither could be
        pressed. Nobody saw it because it needs a cued look to happen at all —
        which is why the check that found it runs after the suite has used the
        app rather than on a page that has just loaded.

        So they step up out of its way while it is there, rather than fight it
        for the same six pixels.
      */}
      {!deskUp && (
      <div className={`absolute left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 transition-all duration-200 ${cueBarUp ? 'bottom-24' : 'bottom-6'}`}>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[11px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
          title={isMinimized ? 'Bring the side panels back' : 'Slide the side panels out of the way. Clean Screen next to it hides everything, including the cursor.'}
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
      )}

      {/* ── Settings Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            songDetection={musicSettings.enabled}
            onSongDetection={(on) => updateMusicSettings({ enabled: on })}
            settings={settings}
            onUpdate={updateSettings}
            calibration={audioData?.calibration ?? null}
            onRecalibrate={() => setCalibrateNonce(n => n + 1)}
            onFlickPlate={flickPlate}
            engineStatus={engineStatus}
            getLiveEngineStatus={() => engineStatusRef.current}
            audioSource={audioSource}
            onAudioSource={(src) => { void handleSourceChange(src); }}
            onAudioFile={() => musicInputRef.current?.click()}
            audioInputs={audioInputs}
            audioInputId={audioInputId}
            onAudioInput={chooseAudioInput}
            blackout={blackout}
            onBlackout={toggleBlackout}
            projectorMode={projector.mode}
            onProjectorMode={projector.setMode}
            projectorName={projector.projector?.label ?? null}
            output={output}
            onOutput={setOutput}
            onOutputReset={resetOutput}
            wakeLock={wakeLock}
            tempo={tempoLabel}
            onTap={tapTempo}
            onTempoClear={clearTempo}
            onTempoBpm={setTempoBpm}
            midiClocked={midi.clocked}
            timecode={timecode ? formatTimecode(timecode) : null}
            focusSection={settingsSection}
            liquids={{ shelf: liquidTypes, onShelve: shelveLiquids, onRemove: removeLiquid, onPick: setSelectedLiquidId }}
            /*
              The panel can put any of its controls on either desk, so it needs
              to know what is already on them. One list per surface, shared with
              the desks themselves, so a chip's filled state and the strip it
              refers to cannot disagree.
            */
            pins={{ perform: rideKeys, design: recipeKeys, onPin: pinSetting }}
            midi={midi}
            onOpenMidi={() => { setShowSettings(false); setShowMidi(true); setShowSequencer(false); }}
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
            onFilmWindow={startFilmWindow}
            onFilmClear={clearFilm}
            markLoaded={markLoaded}
            onMarkFile={loadMark}
            onMarkClear={clearMark}
            onClose={() => { setShowSettings(false); setSettingsSection(null); }}
          />
        )}
      </AnimatePresence>

      {/* ── MIDI ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showActivity && overlaysVisible && (
          <MidiActivity
            presets={allPresets.map(p => ({ id: p.id, name: p.name }))}
            onHide={() => setShowActivity(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMidi && (
          <MidiPanel
            midi={midi}
            presets={allPresets.map(p => ({ id: p.id, name: p.name }))}
            activity={showActivity}
            onActivity={setShowActivity}
            onClose={() => setShowMidi(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Songs ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSound && (
          <SoundPanel
            source={audioSource}
            onSource={(x) => { void handleSourceChange(x); }}
            inputs={audioInputs}
            inputId={audioInputId}
            onInput={chooseAudioInput}
            playing={musicPlaying}
            time={musicTime}
            loop={musicLoop}
            onLoop={setMusicLoop}
            onToggle={toggleMusic}
            onSeek={(t) => { const el = musicElRef.current; if (el) el.currentTime = t; }}
            nowPlaying={musicFile ? { name: musicFile.name, track: musicFile.track } : null}
            onPickFile={playMusicFile}
            onPickTrack={playTrack}
            drone={droneParams}
            onDrone={changeDrone}
            droneRunning={droneRunning}
            onDroneToggle={toggleDrone}
            onClose={() => setShowSound(false)}
          />
        )}
        {showSongs && (
          <SongsPanel
            shows={songShows}
            onShows={setSongShows}
            sets={actionSets}
            onSaveSet={saveActionSet}
            onDeleteSet={deleteActionSet}
            looks={lookChoices}
            currentSong={currentSong}
            follow={followSongs}
            onFollow={setFollowSongs}
            status={songRuntime.status}
            onRun={songRuntime.start}
            onStop={songRuntime.stop}
            onOpenSequences={() => { setShowSongs(false); setShowSequencer(true); }}
            exportShows={() => { const used = savedLooksUsed(songShows); return showsFile(songShows, userPresets.presets.filter(p => used.has(p.id))); }}
            onImportLooks={(looks) => { for (const raw of looks) { try { userPresets.upsert(parsePresetFile(JSON.stringify(raw))); } catch { /* not a look: skipped */ } } }}
            onClose={() => setShowSongs(false)}
          />
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
            performance={musicIntel.performance}
            performanceClock={perfClock}
            onTogglePerformance={togglePerformance}
            onReplayPerformance={musicIntel.replayPerformance}
            onStopPerformanceReplay={musicIntel.stopPerformanceReplay}
            onDeletePerformance={musicIntel.deletePerformance}
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

      {/* ── What stopping a performance did (lib/performanceTake.ts) ── */}
      <AnimatePresence>
        {perfNote && (
          <motion.div
            key={perfNote.at}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-purple-400/30 rounded-2xl px-5 py-3 shadow-2xl text-xs"
            data-testid="performance-note"
          >
            {perfNote.kept ? (
              <div>
                <div className="font-bold">Performance kept</div>
                <div className="opacity-60 text-[10px] mt-0.5">
                  {perfNote.gestures} gestures{perfNote.title ? `, with “${perfNote.title}”` : ', on its own clock (no song was playing)'}
                </div>
              </div>
            ) : (
              <div className="font-bold">{perfNote.gestures === 0 ? 'Nothing was painted, so nothing was kept' : 'The performance could not be saved'}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top Bar ────────────────────────────────────────────── */}
      {!deskUp && (
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-50 pointer-events-none">
        <div className="relative flex flex-col pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-2xl">
          {/*
            The mark and the name, drawn by `npm run brand`. Smaller on a
            phone: the card shares the row with the button pill, and at 375
            wide 24px tall is what fits — any taller and the image is only
            letterboxed into the same width with empty bands above and below.
          */}
          <h1>
            <img src={LOCKUP_URL} alt="ChromaGlass" className="block h-6 w-auto sm:h-10" draggable={false} />
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
                {/*
                  A line each, and the explanation behind an ⓘ. This menu is
                  opened while a room waits: three paragraphs of prose is a
                  thing to read, not a thing to pick from. The one piece of
                  text that is not prose — the address a projector types in —
                  stays where it can be copied.
                */}
                <div className="flex items-start gap-1">
                  <button
                    role="menuitem"
                    onClick={() => { setCastMenu(false); startCast('window'); }}
                    className="flex-1 text-left px-3 py-2.5 rounded-lg hover:bg-white/10"
                    data-testid="cast-window"
                  >
                    <div className="text-xs font-semibold">Second display</div>
                    <div className="text-[11px] opacity-50 leading-snug mt-0.5">A projector on HDMI.</div>
                  </button>
                  <div className="pt-2 pr-1">
                    <Info label="">
                      Opens a window on the second screen showing this very canvas, rendered at
                      the projector's own pixels, filling that screen with no title bar (with the
                      permission; else the next click here fills it). This window keeps the
                      controls and a scaled copy.
                    </Info>
                  </div>
                </div>

                <div className="px-3 py-2.5 rounded-lg" data-testid="cast-network">
                  <div className="text-xs font-semibold">Network display{mirrorCount > 0 ? ` · ${mirrorCount} connected` : ''}</div>
                  {relay ? (
                    <>
                      <div className="text-[11px] opacity-50 leading-snug mt-0.5">Any browser on the same Wi-Fi:</div>
                      {(relay.hosts.length ? relay.hosts : [window.location.hostname]).map((h) => (
                        <div key={h} className="font-mono text-[11px] text-white/80 select-all mt-1">http://{h}:{relay.port}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
                      ))}
                      {!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname) && !relay.hosts.includes(window.location.hostname) && (
                        <div className="font-mono text-[11px] text-white/80 select-all mt-1">{window.location.origin}/?cast=true{relay.key ? `&key=${relay.key}` : ''}</div>
                      )}
                      <div className="mt-2">
                        <Info label="">
                          Open one of these on a projector, a TV or a tablet and it shows the
                          show. Across buildings or other access points: run{' '}
                          <span className="font-mono">npm run tunnel</span> and use the https
                          address it prints, with the same{' '}
                          <span className="font-mono">?cast=true&amp;key=…</span>.
                        </Info>
                      </div>
                    </>
                  ) : (
                    <div className="text-[11px] opacity-50 leading-snug mt-0.5">
                      Needs the show server: run <span className="font-mono">npm run remote</span>.
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-1">
                  <button
                    role="menuitem"
                    onClick={() => { setCastMenu(false); startCast('device'); }}
                    className="flex-1 text-left px-3 py-2.5 rounded-lg hover:bg-white/10"
                    data-testid="cast-device"
                  >
                    <div className="text-xs font-semibold">Chromecast</div>
                    <div className="text-[11px] opacity-50 leading-snug mt-0.5">Chrome's device picker.</div>
                  </button>
                  <div className="pt-2 pr-1">
                    <Info label="">
                      Nest displays take the show directly. A Google TV that does not appear or
                      connect here: open Second display, then Chrome's menu → Cast → the TV →
                      Cast tab, on that window.
                    </Info>
                  </div>
                </div>
              </div>
            )}
          </div>
          <CrashReportButton />
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
      )}

      {/* ── The desk ───────────────────────────────────────────── */}
      {/*
        A layout with a hole in it. The plate is a `position: fixed` canvas
        that must never be re-parented — a remount takes the GPU context and
        the show restarts, mid-song — so the desk lays out normally around an
        empty box and the canvas is painted over that box's rectangle.

        The desk owns the whole window rather than floating over the plate.
        The first version shared the screen with the bottle rail and the
        toolbar, which is how Sound Drive ended up on screen twice; a control
        that exists in two places is a control you cannot trust mid-set.
      */}
      {performing && overlaysVisible && (
        <PerformDesk
          onSendToWall={() => { void startCast('window'); }}
          onSave={saveLook}
          dirty={docDirty}
          onOpenSettings={openAllSettings}
          automated={isAutomated}
          onAutomate={setIsAutomated}
          cues={cues}
          setName={setList.name}
          savedSets={savedSets.map(x => x.name)}
          onAddToSet={() => setAddingToSet(true)}
          onSetAction={onSetAction}
          onItemAction={onItemAction}
          songNow={currentSong ? songLabel(currentSong) : null}
          liveId={setActive ? liveItemId : activePresetId}
          nextId={setActive ? (cued?.item ?? null) : (cued?.id ?? null)}
          liveFor={`${Math.floor(lookFor / 60)}:${String(Math.floor(lookFor % 60)).padStart(2, '0')}`}
          onCue={cueAny}
          onCueNow={(id) => {
            if (!setActive) { goLookNow(id); return; }
            const item = setListRef.current.items.find(i => i.id === id);
            const look = item ? lookOfItem(item) : null;
            if (look) sendLook(look, look.fade ?? fadeSeconds);
          }}
          onGo={() => goLook()}
          onBack={previousLook.current ? revertLook : null}
          onBlackout={toggleBlackout}
          blackout={blackout}
          fade={fadeSeconds}
          onFade={setFadeSeconds}
          settings={settings}
          onSetting={updateSettings}
          ccFor={ccFor}
          rideKeys={rideKeys}
          onRideKeys={setRideKeys}
          midiName={midi.activeInputName ?? null}
          onMic={deskOpen.mic}
          onWall={deskOpen.wall}
          onMidi={deskOpen.midi}
          onPhone={deskOpen.phone}
          onPerformance={togglePerformance}
          performance={musicIntel.performance.live ? { clock: perfClock ?? '0:00', title: musicIntel.performance.live.title } : null}
          layer={activeLayer}
          layers={Math.max(1, settings.layerCount)}
          onLayer={setActiveLayer}
          tool={activeTool}
          onTool={(t) => setActiveTool(t as typeof activeTool)}
          toolAmount={toolAmount}
          onToolAmount={(v) => setToolAmount(activeTool, v)}
          amountOf={(t: string) => toolAmounts[t] ?? 1}
          onAmountFor={setToolAmount}
          dyes={trayDyes}
          dye={selectedLiquid?.color ?? null}
          onDye={(hex) => {
            const bottle = liquidTypes.find(l => !l.behaviour && l.color.toLowerCase() === hex.toLowerCase());
            if (!bottle) return;
            setSelectedLiquidId(bottle.id);
            setActiveTool('dropper');
          }}
          plateRef={preview.ref}
          status={{
            audio: deskAudioLine,
            engine: engineStatus?.label ?? '',
            sequence: sequencer.status.running
              ? `${sequencer.status.name ?? 'sequence'}${sequencer.status.stageName ? ` · ${sequencer.status.stageName}` : ''}`
              : null,
            phone: remoteLink.status === 'connected',
            rec: recorder.recording ? `${Math.floor(recorder.seconds / 60)}:${String(recorder.seconds % 60).padStart(2, '0')}` : null,
          }}
          dots={deskDots}
          onSearch={() => setShowPalette(true)}
          mode={showSound ? 'sound' : showSongs || showSequencer ? 'sequence' : 'perform'}
          onMode={(m) => {
            if (m === 'sound') { setShowSound(true); setShowSongs(false); setShowMidi(false); return; }
            setShowSound(false);
            if (m === 'sequence') { setShowSongs(true); setShowMidi(false); return; }
            setShowSongs(false);
            setShowSequencer(false);
            setDeskMode(m);
          }}
          breadcrumb={
            <>
              <span className="text-muted">Show</span>
              <span className="text-faint">/</span>
              <span>{liveLookName ?? 'Untitled'}</span>
            </>
          }
          onFreeze={() => setIsActive(v => !v)}
          frozen={!isActive}
          onDrain={() => setDrainTrigger(v => v + 1)}
        />
      )}

      {/* ── The bench ──────────────────────────────────────────── */}
      {/*
        Design is the same three columns holding the other half of the job:
        what a look is made of rather than when it goes out. Its plate is a
        preview and says "not on wall", because the most expensive mistake in
        this app is building a look on what you think is a rehearsal and
        finding out a room was watching.
      */}
      {designing && overlaysVisible && (
        <DesignDesk
          onOpenSettings={openAllSettings}
          automated={isAutomated}
          onAutomate={setIsAutomated}
          dyeBottles={liquidTypes.filter(l => !l.behaviour)}
          behaviourBottles={liquidTypes.filter(l => !!l.behaviour)}
          bottleId={selectedLiquidId}
          onBottle={(id) => { setSelectedLiquidId(id); setActiveTool('dropper'); }}
          swatches={PALETTE.map(c => ({ hex: c.hex, name: c.name }))}
          dye={selectedLiquid?.color ?? null}
          onDye={(hex) => { updateLiquidColor(selectedLiquidId, hex); setActiveTool('dropper'); }}
          palettes={COLOR_HARMONIES.map((h, i) => ({
            name: COLOR_HARMONY_NAMES[i],
            colours: h.map(pi => PALETTE[pi]?.hex ?? '#666'),
          }))}
          paletteLock={paletteLock}
          onPalette={selectPalette}
          onImageDye={() => fileInputRef.current?.click()}
          tool={activeTool}
          onTool={(t) => setActiveTool(t as typeof activeTool)}
          toolAmount={toolAmount}
          onToolAmount={(v) => setToolAmount(activeTool, v)}
          amountOf={(t: string) => toolAmounts[t] ?? 1}
          onAmountFor={setToolAmount}
          layer={activeLayer}
          layers={Math.max(1, settings.layerCount)}
          onLayer={setActiveLayer}
          // Two: the compositor draws the lead plate and one behind it, and a
          // third was simulated in full — a whole solver's GPU time — and never shown.
          onAddLayer={() => updateSettings({ layerCount: Math.min(2, (settings.layerCount ?? 1) + 1) })}
          layerReport={layerReport}
          settings={settings}
          onSetting={updateSettings}
          recipeKeys={recipeKeys}
          onRecipeKeys={setRecipeKeys}
          onRandomise={() => { if (!luckyArmed) { setLuckyArmed(true); return; } setLuckyArmed(false); triggerLucky(); }}
          randomiseArmed={luckyArmed}
          plateRef={preview.ref}
          lookName={docName}
          edited={docDirty}
          onSave={saveLook}
          onSaveAs={saveLookAs}
          onNew={newLook}
          dirty={docDirty}
          onSendToWall={() => { void startCast('window'); }}
          mode={showSound ? 'sound' : showSongs || showSequencer ? 'sequence' : 'design'}
          onMode={(m) => {
            if (m === 'sound') { setShowSound(true); setShowSongs(false); setShowMidi(false); return; }
            setShowSound(false);
            if (m === 'sequence') { setShowSongs(true); setShowMidi(false); return; }
            setShowSongs(false);
            setShowSequencer(false);
            setDeskMode(m);
          }}
          dots={deskDots}
          midiName={midi.activeInputName ?? null}
          onMic={deskOpen.mic}
          onWall={deskOpen.wall}
          onMidi={deskOpen.midi}
          onPhone={deskOpen.phone}
          onPerformance={togglePerformance}
          performance={musicIntel.performance.live ? { clock: perfClock ?? '0:00', title: musicIntel.performance.live.title } : null}
          onSearch={() => setShowPalette(true)}
          status={{ audio: deskAudioLine, engine: engineStatus?.label ?? '' }}
        />
      )}

      {/* The file input the bench's Image dye button reaches for. It lives
          in the narrow-screen toolbar, which is not rendered under a desk. */}
      {deskUp && (
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
      )}
      {/* The crash report, under a desk: its header has no room for a
          button that is idle nearly always, so the chip says when there is
          news and ⌘K opens the sheet. */}
      {deskUp && <CrashReportButton floating />}
      {/* Gone on a clean screen: a dot on the wall is still a dot on the wall. */}
      {overlaysVisible && <QuickReportDot />}

      {addingToSet && (
        <AddToSetSheet
          looks={PRESETS.map(p => ({ id: p.id, name: p.name, swatch: swatchOf(p.id), detail: p.description }))}
          saved={userPresets.presets.map(p => ({ id: p.id, name: p.name, swatch: swatchOf(p.id), detail: p.song ? songLabel(p.song) : p.description }))}
          sequences={sequencer.sequences.map(q => ({ id: q.id, name: q.name, detail: `${q.stages.length} stage${q.stages.length === 1 ? '' : 's'}${q.song ? ` · ${songLabel(q.song)}` : ''}` }))}
          count={setList.items.length}
          onAdd={addToSet}
          onImport={importToSet}
          onClose={() => setAddingToSet(false)}
        />
      )}

      {showSave && (
        <SaveLookSheet
          suggested={saveMode === 'as' && docId ? `${docName} copy` : pinnedLookName ? `${pinnedLookName} (mine)` : 'My look'}
          songName={musicIntel.state.track?.title ?? null}
          onSave={saveCurrentPreset}
          onClose={() => setShowSave(false)}
        />
      )}

      {/* ── ⌘K ─────────────────────────────────────────────────── */}
      {showPalette && (
        <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />
      )}

      {/* ── The cued look, and the button that sends it ────────── */}
      <AnimatePresence>
        {!deskUp && (cued || fading > 0 || previousLook.current) && (
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
        {showHelp && <GuidePanel focus={helpFocus} onClose={() => { setShowHelp(false); setHelpFocus(null); }} />}
      </AnimatePresence>

      {/* ── Audio Meters (bottom-left, out of the way) ─────────── */}
      {isActive && audioData && !isMinimized && !deskUp && (
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
