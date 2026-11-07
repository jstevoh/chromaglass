import { useState, useEffect, useCallback, useMemo, useRef, type ComponentProps } from 'react';
import { useAudioAnalyzer, type AudioData } from './hooks/useAudioAnalyzer';
import { RenderPanel } from './components/RenderPanel';
import { RecordPanel } from './components/RecordPanel';
import { LiquidVisualizer, LiquidVisualizerHandle } from './components/LiquidVisualizer';
import { followLine } from './lib/followedPlace';
import { songCueFrom } from './lib/scenePacing';
import { holdWhereItIs, shotLabel } from './lib/macroCamera';
import { PRESET_CONTRACTS } from './presetPlate';
import { SettingsPanel } from './components/SettingsPanel';
import { resolveSection } from './lib/settingsMap';
import { GuidePanel } from './components/GuidePanel';
import { CueBar } from './components/CueBar';
import { Info } from './components/Info';
import { usePreviewFrame } from './hooks/usePreviewFrame';
import { Desk } from './components/desk/Desk';
import type { Cue, ControlKind } from './components/desk/deskProps';
import { useDeskTabs } from './hooks/useDeskLayout';
import { closePanel, isSectionPanel, openPanel, openPanels, whereIs } from './lib/deskLayout';
import { DEFAULT_RECIPE, DEFAULT_RIDES, loadPins, savePins, togglePin, travelOfKey, valueOfKey, type DeskSurface } from './lib/deskPins';
import { SlowEvolve, type EvolveEar } from './lib/slowEvolve';
import { unhandled } from './lib/unhandled';
import { CommandPalette } from './components/desk/CommandPalette';
import { SoundPanel } from './components/SoundPanel';
import { SaveLookSheet } from './components/desk/SaveLookSheet';
import { AddToSetSheet } from './components/desk/AddToSetSheet';
import { targetLook, LaterWrites, RIG_KEYS, lookOf } from './lib/lookFade';
import { SettingRide } from './lib/ride';
import { Crosshair, Play, Pause, Mic, MicOff, Settings, Shuffle, Droplet, Layers, Wind, Eye, EyeOff, Monitor, MonitorOff, X, ImagePlus, SprayCan, Paintbrush, FlaskConical, Slash, Cast, Music, Microscope, Clapperboard, ChevronDown, LayoutGrid, Sliders, Hand, FileAudio, Circle, Square, Projector, Fingerprint, Magnet, Film, RotateCw, User, LogIn } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { sanitizePatch } from './lib/sanitizeSettings';
import { loadCustomLiquids, saveCustomLiquids, isCustomLiquid } from './lib/liquidFile';
import { bottleSwatch, isClearLiquid, isNatural } from './lib/liquidColour';
import { loadToolAmounts, saveToolAmounts, clampAmount } from './lib/toolAmount';
import { ToolAmount } from './components/ToolAmount';
import { PRESETS, findPreset, livePresetId } from './presets';
import { useCastSender } from './hooks/useCastSession';
import { relayInfo, type RelayInfo } from './lib/remoteProtocol';
import { formatTimecode } from './lib/timecode';
import { BenchOverlay } from './components/BenchOverlay';
import { RunLocallyCard } from './components/RunLocallyCard';
import { ProjectorFillChip } from './components/ProjectorFillChip';
import { PhoneStage, type PhoneLook } from './components/phone/PhoneStage';
import { PhonePlay } from './components/phone/PhonePlay';
import { PHONE_OFF_KEY } from './lib/phone';
import { useDeviceTilt } from './hooks/useDeviceTilt';
import { SequencerPanel } from './components/SequencerPanel';
import { SongsPanel, type LookChoice } from './components/SongsPanel';
import { savedLooksUsed, showsFile } from './lib/songShows';
import { MidiPanel } from './components/MidiPanel';
import { MidiActivity } from './components/MidiActivity';
import { GamepadRing } from './components/GamepadRing';
import { useFilmSense } from './hooks/useFilmSense';
import { type SimulatedMusic } from './lib/simulatedMusic';
import { useWakeLock } from './hooks/useWakeLock';
import type { MidiAction, MidiMap } from './lib/midi';
import { controlKindOf } from './lib/midi';
import { PresetMenu } from './components/PresetMenu';
import { useUserPresets, asPreset } from './hooks/useUserPresets';
import { downloadText, parsePresetFile, sequenceFileName, serializeSequence, isUserPresetId, type UserPreset } from './lib/userPresets';
import type { ShowSequence } from './lib/sequencer';
import { sameSong, songRefFromTrack, songLabel, type SongRef } from './lib/songRef';
import { type SetItem } from './lib/setList';
import { useShowSequencer } from './hooks/useShowSequencer';
import { useMusicIntelligence } from './hooks/useMusicIntelligence';
import { clockText } from './lib/performanceTake';
import { makesText, runningText } from './lib/recordChoice';
import { MusicSettings } from './lib/musicTypes';
import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE, DROPPER_COLORS } from './constants';
import { TrackPanel } from './components/TrackPanel';
import { LyricsOverlay } from './components/LyricsOverlay';
import { getEffectiveTier } from './lib/tierGates';
import { syncServerLicense } from './lib/licenseKey';
import { LOCKUP_URL } from './brand';
import { AlphaBadge } from './components/AlphaBadge';
import { CrashReportButton, QuickReportDot } from './components/CrashReportButton';
import { PanelGuard } from './components/PanelGuard';
import { LIBRARY, librarySeconds, clock, nextTrack, credits } from './lib/musicLibrary';
import { showSeed, stream } from './lib/rng';
import { blendKey, nextBlend, raiseInMix, type MixMover, type MixSource } from './lib/mixer';
import { RowFades, LOOK_LEVEL_KEYS, FADE_ROWS, type FadeWay } from './lib/mixFade';
import { clearShowInterval, showInterval, showNow, type ShowIntervalHandle } from './lib/showClock';
import { SHOW_PATH } from './lib/showPath';

/** How often Evolve listens and steps its glides (lib/slowEvolve.ts). */
const DRIFT_STEP_MS = 500;
/**
 * How often a MIDI fader's moves are handed to React, for the desk's number
 * (PLAN.md §14f). The plate does not wait for it: it reads the ride itself.
 * The ear's own rate (useAudioAnalyzer's EAR_VIEW_MS), for the same reason.
 */
const RIDE_VIEW_MS = 100;
const MIDI_ACTIVITY_KEY = 'chromaglass-midi-activity';

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

import AccountSheet from './components/AccountSheet';
import { LIT, LIVE } from './components/ui';
import { ACCOUNTS_ON, useSignedIn } from './lib/useSignedIn';
import { isSignedInCached, onAuthFlagChange } from './lib/authFlag';
import { syncAccountLicense } from './lib/accountLicense';
import { useOutput } from './app/useOutput';
import { useTempo } from './app/useTempo';
import { useAmbientMode } from './app/useAmbientMode';
import { useSoundState } from './app/useSoundState';
import { useSongLine } from './app/useSongLine';
import { usePour } from './app/usePour';
import { useSoundSource } from './app/useSoundSource';
import { useBench } from './app/useBench';
import { useToast } from './app/useToast';
import { useFilm } from './app/useFilm';
import { useSceneSource } from './app/useSceneSource';
import { usePaletteLock } from './app/usePaletteLock';
import { useLayerReport } from './app/useLayerReport';
import { useSetListState } from './app/useSetListState';
import { usePhoneLayout } from './app/usePhoneLayout';
import { useWallLook } from './app/useWallLook';
import { useBlackout } from './app/useBlackout';
import { useLookFades } from './app/useLookFades';
import { useTimecode } from './app/useTimecode';
import { useShowLibrary } from './app/useShowLibrary';
import { useSetActions } from './app/useSetActions';
import { useLucky } from './app/useLucky';
import { useSongChangeFades } from './app/useSongChangeFades';
import { useCastFeed } from './app/useCastFeed';
import { useRecording } from './app/useRecording';
import { useGlides } from './app/useGlides';
import { useRowFades } from './app/useRowFades';
import { useRemote, type OscOutHear } from './app/useRemote';
import { useShowFeed } from './app/useShowFeed';
import { useSongScore } from './app/useSongScore';
import { useSongRendering } from './app/useSongRendering';
import { useControllers } from './app/useControllers';
import { useCommandPalette } from './app/useCommandPalette';
import { useCheckHooks } from './app/useCheckHooks';
import { useCrashState } from './app/useCrashState';
import { SCENE_ON_KEY, ArmedLook, OPENING_LOOK, MUSIC_SETTINGS_KEY, loadMusicSettings } from './app/shared';

const hasAccountOrLicenseUI =
  Boolean(import.meta.env.VITE_FIREBASE_API_KEY) ||
  import.meta.env.VITE_FIREBASE_HOSTED_SITE === '1' ||
  (typeof window !== 'undefined' &&
    (Boolean((window as unknown as { __CHROMAGLASS_NATIVE__?: unknown }).__CHROMAGLASS_NATIVE__) ||
      new URLSearchParams(window.location.search).get('tierGates') === '1'));

const isProfileRoute = () =>
  typeof window !== 'undefined' &&
  (/^\/(profile|account|unsubscribe)\/?$/i.test(window.location.pathname) ||
    new URLSearchParams(window.location.search).has('profile') ||
    new URLSearchParams(window.location.search).has('unsubscribe'));

export default function App() {
  const [isActive, setIsActive] = useState(true);
  const [showAccount, setShowAccount] = useState(() => hasAccountOrLicenseUI && isProfileRoute());
  // Signed out with the show up: every account button turns into a lit
  // "Sign in" that opens the sheet's sign-in (the owner, 2026-10-24).
  const signedIn = useSignedIn();
  const signedOut = ACCOUNTS_ON && !signedIn;

  const openProfileSheet = useCallback(() => {
    if (!hasAccountOrLicenseUI) return;
    setShowAccount(true);
    try {
      if (!/^\/(profile|account|unsubscribe)\/?$/i.test(window.location.pathname)) {
        window.history.pushState({ cgProfile: true }, '', `/profile${window.location.search}${window.location.hash}`);
      }
    } catch { /* ignore history errors in sandboxed frames */ }
  }, []);

  const closeProfileSheet = useCallback(() => {
    setShowAccount(false);
    try {
      if (/^\/(profile|account|unsubscribe)\/?$/i.test(window.location.pathname)) {
        const params = new URLSearchParams(window.location.search);
        params.delete('profile');
        params.delete('unsubscribe');
        const qs = params.toString();
        // Back to the show's own address, not `/`: a reload there is the webpage (lib/showPath.ts).
        window.history.replaceState(null, '', `${SHOW_PATH}${qs ? `?${qs}` : ''}${window.location.hash}`);
      }
    } catch { /* ignore history errors */ }
  }, []);

  const openAccount = hasAccountOrLicenseUI ? openProfileSheet : undefined;

  useEffect(() => {
    if (!hasAccountOrLicenseUI) return;
    const onOpen = () => openProfileSheet();
    const onPopState = () => setShowAccount(isProfileRoute());
    window.addEventListener('cg-open-account', onOpen);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('cg-open-account', onOpen);
      window.removeEventListener('popstate', onPopState);
    };
  }, [openProfileSheet]);

  // The laptop driving the projector must not dim, sleep or screensave: what
  // it does, the wall does. Held while the plate is running and dropped the
  // moment it is paused, so a machine left on the desk overnight is not kept
  // awake by a stopped show. Needs a secure context, so it is live on the
  // hosted site and on `localhost` — which is where the show is run — and
  // absent on a plain-http LAN address.
  const wakeLock = useWakeLock(isActive);

  const { output, setOutput, resetOutput, wallTest, setWallTest, shownOutput } = useOutput();

  const { tempoRef, tempoLabel, tapTempo, readTempo, clearTempo, linkProps, tempoPanel } = useTempo();

  const { ambientMode, setAmbientMode, setAmbientModeRef } = useAmbientMode();

  const {
    audioSource, setAudioSource, audioSourceRef, audioInputId, setAudioInputId, audioInputs,
    refreshAudioInputs, musicFile, setMusicFile, playTrackRef, musicLoop, setMusicLoop, libraryOpen,
    setLibraryOpen, showSound, setShowSound, droneRef, droneParams, setDroneParams, droneRunning,
    setDroneRunning, stopDrone, musicPlaying, setMusicPlaying, musicTime, setMusicTime, musicElRef,
    musicInputRef, musicCtxRef,
  } = useSoundState();
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
  /*
    The desk's tabs (lib/deskTabs.ts): the owner's to make since 2026-10-27,
    each a set of panels, with Perform, Sequence and Setup shipped as the
    three to start from. The tab that is up is kept under the old desk mode's
    key, so a laptop left on Gig or Build opens on Perform and one left on
    Load-in opens on Setup. Each tab remembers where its panels were.
  */
  const deskTabs = useDeskTabs();
  const deskTab = deskTabs.tab;
  const setDeskTab = deskTabs.setTab;
  const deskLayout = deskTabs.layout;
  const { update: updateLayout, reset: resetLayout } = deskTabs;
  // Stable, so the desk's drag and key listeners are not rebuilt on every render the sound causes.
  const onDeskLayout = useCallback((change: (l: typeof deskLayout) => typeof deskLayout) => updateLayout(deskTab, change), [updateLayout, deskTab]);
  const onDeskReset = useCallback(() => resetLayout(deskTab), [resetLayout, deskTab]);
  /** The Stage sheet (⌘,): the room and the machine, the sections no look saves. */
  const [showStage, setShowStage] = useState(false);
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
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak' | 'press' | 'finger' | 'magnet' | 'spin'>('dropper');

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
  const { isCasting, startCast, stopCast, send: castSend, windowFullscreen, fillWindow, fillDismissed, dismissFill } = useCastSender(
    () => castReadyRef.current(),
    (size) => { stageRef.current = size; wallRef.current?.setStage(size); },
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
        The Stage sheet (⌘,) came with Desk v2 and was left off it, so only
        its own listener closed it, and that one could miss the key
        (hooks/useEscape.ts, `npm run layout`'s "the Stage sheet never closed").
      */
      setShowSettings(false);
      setShowStage(false);
      setShowHelp(false);
      setShowTrackPanel(false);
      setShowMidi(false);
      setShowSequencer(false);
      setShowSave(false);
      setShowPalette(false);
      setShowAccount(false);
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
  /** The wall's engine, always; `visualizerRef` is the desk's, which in Preview with a wall up is a copy (PLAN.md 8b; see `drafting`). */
  const wallRef = useRef<LiquidVisualizerHandle | null>(null);
  /** The wall's engine and the desk's copy, once each: for what is the room's on both (the mark, the palette lock). */
  const bothEngines = (): LiquidVisualizerHandle[] =>
    [...new Set([wallRef.current, visualizerRef.current])].filter((v): v is LiquidVisualizerHandle => !!v);

  const { songLine, barKnown, heardBpm, songCueSeqRef } = useSongLine({ wallRef });

  const {
    fileInputRef, handleImageUpload, videoInputRef, videoPlayerRef, isVideoPlaying, pouringCartoon,
    setPouringCartoon, pourName, setPourName, pourVideoFrom, stopPour, pourFile, handleVideoUpload,
  } = usePour({
    visualizerRef,
  });

  const userPresetsRef = useRef<UserPreset[]>([]);

  const {
    handleSourceChange, toggleDrone, changeDrone, chooseAudioInput, toggleMusic, playMusicFile,
    playTrack, closeMusicFile, earContext,
  } = useSoundSource({
    audioStream, audioInputId, setAudioStream, simulatedRef, stopDrone,
    setAudioSource, musicElRef, wallRef, droneParams, droneRef, setDroneRunning, refreshAudioInputs,
    setDroneParams, setAudioInputId, audioSourceRef, musicCtxRef, musicFile, setMusicFile,
    setMusicTime, audioSource, setLibraryOpen, playTrackRef,
  });

  // The browser will not run audio before a gesture, so a restored band stays
  // silent until the first click anywhere. One listener, then gone.
  //
  // That gesture used to start the band for anyone who had never chosen a
  // source, so a stranger's first five seconds were a plate moving to music.
  // The owner asked for the opposite (2026-10-22): the Source is None whenever
  // the app opens, and a click anywhere does not choose it. The band is still
  // one press away in the Sound panel and on the phone's Sound tab.
  useEffect(() => {
    let kiosk = false;
    try { kiosk = new URLSearchParams(window.location.search).get('kiosk') === '1'; } catch { /* no query to read */ }
    const wake = () => {
      void simulatedRef.current?.resume();
      // `?kiosk=1`, below, is the one open that picks a source for itself.
      if (kiosk) {
        setTimeout(() => {
          if (audioSourceRef.current === 'none') void handleSourceChange('simulated');
        }, 0);
      }
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
    if (kiosk) wake();
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    The back plate's own look (PLAN.md §16a), or null while it follows the
    front. Show state, not a setting: it is which dish the second projector
    has on it tonight, the way the Mixer's order is the rig's, and a saved
    look does not carry it. The visualizer holds the fade and the dyes; this
    is what the desk, the phone and the Mixer's back row show. `leaving` is a
    Follow the front still fading: the back plate stays on the stage until it
    lands, so on a one-plate front look it fades into the front's settings
    instead of vanishing on the press.
  */
  const [backLook, setBackLook] = useState<{ id: string; name: string; leaving?: boolean } | null>(null);
  /** The name the desk, the phone and the Mixer show for the back plate: none while it follows the front or is fading back to it. */
  const backLookName = backLook && !backLook.leaving ? backLook.name : null;
  /**
   * The plates on the stage: the look's count, and never fewer than two while
   * the back plate has a look of its own. What the layer pickers offer, so the
   * back plate a look was sent to can be picked and painted on.
   */
  const stageLayers = Math.max(1, settings.layerCount ?? 1, backLook ? 2 : 1);

  useEffect(() => {
    if (activeLayer >= stageLayers) {
      setActiveLayer(Math.max(0, stageLayers - 1));
    }
  }, [stageLayers, activeLayer]);

  const {
    calibrateNonce, setCalibrateNonce, engineStatus, setEngineStatus, shownEngineStatus,
    engineStatusRef, bench, setBench, startBenchRef,
  } = useBench({
    setSettings,
  });

  const { toast, setToast } = useToast({ setToastRef });

  const {
    filmSource, filmName, loadFilm, cameras, filmCameraId, filmCamera, filmCameraLost,
    startFilmCamera, chooseFilmCamera, startFilmWindow, clearFilm, cartoons,
  } = useFilm({
    wallRef, setToast, pouringCartoon, pourVideoFrom, setPouringCartoon, setPourName, stopPour,
  });

  const {
    sceneOn, sceneResume, setSceneResume, sceneDeviceId, scenePreviewRef, toggleScene,
    chooseSceneDevice, scene,
  } = useSceneSource({
    cameras, settings,
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
    getVideo: () => wallRef.current?.filmVideoEl() ?? null,
    deadzone: settings.sceneDeadzone ?? 0.25,
    smooth: settings.sceneSmooth ?? 0.35,
  });

  const ear = useAudioAnalyzer(
    isActive ? audioStream : null, isActive,
    settings.sensitivity, settings.bassBoost,
    settings.autoCalibrate !== false, calibrateNonce,
    // The microphone hears the hand on the laptop: its clicks are not beats.
    audioSource === 'microphone',
    earContext,
  );
  const liveAudio = ear.audioData;
  /*
    What the show hears: the room, or a song being rendered.

    A render (hooks/useSongRender.ts) hears its song in advance, one reading
    per frame, and hands each frame's here before the frame is drawn, so every
    consumer of the live ear (the plate, the meters, the cast, the phone)
    gets the song's reading in its place and nothing needs to know which it
    is. `renderHold` is the span of the whole render, set before the first
    frame and cleared after the last: the music element is paused for a
    render, and the silence that leaves on the live ear must not read as a
    gap between songs (`useSongChange` below) and roll a new look mid-film.
  */
  const [renderAudio, setRenderAudio] = useState<AudioData | null>(null);
  // The same, for readers on a clock of their own (the plate, the cast feed).
  const renderAudioRef = useRef<AudioData | null>(null);
  /*
    What the plate hears this frame: the render's reading, else the ear's
    latest, read at the moment it asks rather than the last one React was
    shown (PLAN.md §14f). Stable, so handing it down re-renders nothing.
  */
  const earLive = ear.live;
  const hear = useCallback(() => renderAudioRef.current ?? earLive.current, [earLive]);
  /** The plate's volume, 0 to 100, for the VU needle (it polls this on its own frame; nothing renders for it). */
  const readLevel = useCallback(() => hear()?.volume ?? null, [hear]);
  const [renderHold, setRenderHold] = useState(false);
  const renderHoldRef = useRef(false);
  const audioData = renderAudio ?? liveAudio;

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
  const [phoneCount, setPhoneCount] = useState(0);
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

  const musicIntel = useMusicIntelligence(audioStream, liveAudio, musicSettings, settings, ear.onReading);
  /*
    Performances, started and stopped by hand: T on either desk, the
    Performance dot in the desk header, or the Track panel. The note after a
    stop says what was kept, for four seconds.
  */
  // Under ?debug, tag the song playing by name, as the desk's track panel
  // does by hand: the phone has no track panel, and `npm run followview`
  // checks what the phone says about a followed song.
  const manualTagRef = useRef(musicIntel.manualTag);
  manualTagRef.current = musicIntel.manualTag;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    (window as unknown as { __tagSong?: (artist: string, title: string) => void }).__tagSong = (artist, title) => manualTagRef.current(artist, title);
  }, []);
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

  const { paletteLock, selectPalette } = usePaletteLock({ bothEngines, visualizerRef });
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
  // And a back plate with a look of its own is on the stage whatever the front
  // look's plate count says: a Go on the front to a one-plate look would
  // otherwise drop the plate someone had just sent a look to.
  const effectiveSettings = useMemo(() => {
    const s = musicIntel.overrides ? { ...settings, ...musicIntel.overrides } : settings;
    return (s.layerCount ?? 1) < stageLayers ? { ...s, layerCount: stageLayers } : s;
  }, [settings, musicIntel.overrides, stageLayers]);

  // Pin the visualizer's palette to the track's harmony (with evolution drift)
  // — unless the user has locked a palette themselves.
  useEffect(() => {
    if (musicIntel.harmonyIndex != null && paletteLock == null) {
      wallRef.current?.setHarmony(COLOR_HARMONIES[musicIntel.harmonyIndex]);
    }
  }, [musicIntel.harmonyIndex, paletteLock]);

  // Fire lyric word-triggers into the fluid
  useEffect(() => {
    // Not into a render: the lyric clock is the room's, not the film's.
    if (musicIntel.trigger && !renderHoldRef.current) {
      const energy = audioData ? Math.min(1, audioData.energy) : 0.6;
      wallRef.current?.triggerTheme(musicIntel.trigger.trigger.theme, Math.max(0.35, energy));
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
    if (musicIntel.gestureFire && !renderHoldRef.current) {
      for (const g of musicIntel.gestureFire.gestures) {
        wallRef.current?.applyGesture(g);
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
  const driftGlide = useRef(new Map<string, { from: number; to: number; at: number; seconds: number }>());
  /** Evolve's planner: when the next move starts, which dials, which way (lib/slowEvolve.ts). */
  const slowEvolveRef = useRef<SlowEvolve | null>(null);
  /** The look's own Evolve Speed: the dial's pace is measured from it (lib/slowEvolve.ts evolvePace). */
  const lookPaceRef = useRef(0.12);
  /*
    A look laid, opened, faded to or taken back: Evolve lets go of the move it
    is making. A glide lasts up to a minute and a half at the default Evolve
    Speed (minutes low on the dial), and each half
    second it writes its dials from where they were on the old look to where
    they were going on it, so a move left running dragged two or three dials
    of the new look back toward the old one for the rest of its length (found
    in review). The planner starts again too, so its first move on the new
    look comes after a short rest rather than wherever the old rest was.
  */
  const evolveLetsGo = () => { driftGlide.current.clear(); slowEvolveRef.current = null; };

  /*
    A MIDI fader's ride (lib/ride.ts): `rideSetting` below says how it reaches
    the plate and React. Declared here because the other ways into the
    settings hand React the ride first (`flushRide`). React hears a ride
    every RIDE_VIEW_MS, so a preset, a Go or a desk slider landing in that
    tenth of a second would otherwise be written over by the fader's older
    move when it flushed; flushed first, the newer write lands last and wins,
    and the ride sees it as somebody else's and lets go, as it always has.
  */
  const ride = useRef(new SettingRide()).current;
  const rideFlush = useRef<ReturnType<typeof setTimeout> | null>(null);
  /*
    The ride's schedule: when React was last handed it, stepped by
    RIDE_VIEW_MS the way the ear steps its own (useAudioAnalyzer's
    publishedAtRef). Timed from each flush instead, every late timer and
    every wait for the next message was added to the period: on the Mac's
    phone page, drawing 20 frames a second, the desk showed a fader 7.0 to
    7.3 times a second (`npm run renders`). Never more than one step behind
    now, so a stall does not buy a burst after it.
  */
  const rideMark = useRef(-Infinity);
  const flushRide = () => {
    if (rideFlush.current) { clearTimeout(rideFlush.current); rideFlush.current = null; }
    const patch = ride.drain();
    if (!patch) return;
    const now = performance.now();
    rideMark.current = Number.isFinite(rideMark.current) ? Math.max(rideMark.current + RIDE_VIEW_MS, now - RIDE_VIEW_MS) : now;
    // Where Evolve's drift wanders from: a ride is a hand's write (PLAN.md 14t).
    driftAnchor.current = { ...driftAnchor.current, ...patch };
    setSettings(prev => ({ ...prev, ...patch }));
    /*
      Here and not on every message: setting a state to what it already is
      is not always free, and per message it rendered the App another ten
      times a second while the fader moved (`npm run renders`, 20 a second
      for the desk's 9 before, the fader's lines).
    */
    setDocDirty(true);
  };

  /*
    The Mixer's take buttons (lib/mixFade.ts), declared here because both of
    the hand's ways into the settings, just below, tell them when a hand has
    taken a row's level: the hand wins, and the fade stops where it was put.
  */
  const rowFades = useRef(new RowFades()).current;
  const [rowFading, setRowFading] = useState<Partial<Record<MixSource, FadeWay>>>({});
  /*
    And when each setting was last written from outside a look fade, for a
    Back to leave what was written after it began (lib/lookFade's backStep):
    a Back fades the room's levels back, and a fader ridden while it runs is
    the later hand.
  */
  const laterWrites = useRef(new LaterWrites()).current;
  const handOnLevels = (keys: Iterable<string>) => {
    const list = [...keys];
    laterWrites.mark(list, showNow());
    if (rowFades.handOn(list)) setRowFading(rowFades.running());
  };
  /*
    A new look sets the levels that belong to a look, the gel wheel's and the
    lumia's (the other rows' levels are the room's, RIG_KEYS), so a take on
    either stops as the look comes in, as a hand's move would stop it: two
    walks writing one setting would fight a tick at a time.
  */
  const lookTakesLevels = () => {
    // Not handOnLevels: the look is not a later hand, and a Back must not
    // hold the gel and the lumia where they are because its own fade began.
    if (rowFades.handOn(LOOK_LEVEL_KEYS)) setRowFading(rowFades.running());
    rowFades.forget(['gel', 'lumia']);
  };

  const updateSettings = (patch: Partial<VisualizerSettings>) => {
    const clean = sanitizePatch(patch);
    if (Object.keys(clean).length === 0) return;
    flushRide();
    /*
      Hold stays where the closeup is (QA-12, reported by the owner as the
      picture jumping when Hold was pressed): see holdWhereItIs. Here rather
      than at the chip, so the desk's chip, the phone's Hold, the Camera menu
      and anything else that sets the mode all get it.
    */
    const newSettings = holdWhereItIs(clean, settingsRef.current.macroCamera, () => visualizerRef.current?.macroCentre() ?? null);
    setSettings(prev => ({ ...prev, ...newSettings }));
    setDocDirty(true);
    handOnLevels(Object.keys(newSettings));
    /*
      A hand's move is where the drift wanders from now on (lib/drift.ts).
      The drift holds each dial inside a window round its anchor, and the
      anchor was the look as laid, so a ride pushed past the window was
      pulled back on the next drift: reported as the sliders jumping.
    */
    driftAnchor.current = { ...driftAnchor.current, ...newSettings };
    for (const k of Object.keys(newSettings)) driftGlide.current.delete(k);
  };

  /*
    Adding and taking off the back layer, from the Design desk and the phone.
    Two is the most the plate draws (PLAN.md §16d), so adding means two and
    taking off means one, whatever the look carried. Taking off is not offered
    while the back plate has a look of its own: the stage keeps that plate
    (stageLayers above) and the button would do nothing anyone could see.
  */
  const addLayer = () => updateSettings({ layerCount: 2 });
  const removeLayer = backLook ? undefined : () => updateSettings({ layerCount: 1 });

  const applyPreset = (presetId: string, presetSettings: Partial<VisualizerSettings>) => {
    flushRide();
    lookTakesLevels();
    evolveLetsGo();
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
    // With the Ferrofluid the look asks for: the settings above reach the plate a render after this.
    visualizerRef.current?.applyPreset(presetId, undefined, lookPhase(targetLook(settingsRef.current, presetSettings)));
  };

  const applyUserPreset = (p: UserPreset) => {
    // A saved look is a look like any other. Anything added to the app since it
    // was saved comes from the base rather than from whatever was playing,
    // and like any other it stops a take on the gel and the lumia.
    flushRide();
    lookTakesLevels();
    evolveLetsGo();
    setSettings(prev => targetLook(prev, p.settings));
    setPinnedPresetId(p.id);
    // Your own look, opened: the save sheet's Replace, and the look menu's
    // Save over, write over it from here (Save itself always makes a new one).
    setDocId(p.id);
    setDocDirty(false);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(p.id, { contract: p.contract ?? null, injectStyles: p.injectStyles ?? null, liquids: p.liquids ?? null },
      lookPhase(targetLook(settingsRef.current, p.settings)));
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
    since. Save asks for a name and makes a new preset, every time (see
    saveLook for why); Replace writes over the document when there is one; and
    New is an empty plate.
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
  /** What is left of the Dye Budget, for the picked bottle on the desk and the phone (PLAN 35e); a stable function, so asking re-renders nothing here. */
  const readDyeRoom = useCallback(() => visualizerRef.current?.dyeRoom?.() ?? 1, []);

  const { layerReport } = useLayerReport({ deskLayout, visualizerRef });

  const [docId, setDocId] = useState<string | null>(null);
  const [docDirty, setDocDirty] = useState(false);

  const saveCurrentPreset = (name: string, description: string, forSong = false) => {
    const plate = visualizerRef.current?.describePlate();
    // From the ref: ⌘K's list is memoised and would otherwise hand this the
    // settings as they stood when the list was last built.
    const p = userPresets.saveCurrent(name, description, settingsRef.current, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null, forSong ? currentSong : null);
    setPinnedPresetId(p.id);
    setDocId(p.id);
    setDocDirty(false);
    setToast(`Saved “${p.name}”`);
  };

  /*
    Save asks for a name, every time: a new preset made from what is on the
    plate now.

    Reported by the owner (2026-10-05) as Save not working on the desk, when
    what they wanted was to name a new preset from the current settings. It
    did work, once: the first Save of a session asked for a name. From then
    on the look just saved, or any saved look opened, was "the document", and
    Save wrote over it without a word bar a toast for two seconds at the
    bottom of the plate. Naming a second preset meant finding Save as… in a
    menu hung off the look's name in the breadcrumb, which nothing pointed
    to. Measured in `npm run saves`: the second Save on the Design desk
    opened no sheet. So Save names a new one now, on both desks, ⌘S and the
    phone alike, and writing over the look you opened is the sheet's second
    button, named for the look it would replace, and the look menu's.
  */
  const newPalette = () => {
    setDocId(null);
    setDocDirty(false);
    setPinnedPresetId(null);
    applyPreset('default', DEFAULT_SETTINGS);
  };

  const saveLook = () => setShowSave(true);
  /** Write over the saved look that is open, keeping its name and song. */
  const replaceLook = () => {
    if (!docId) { setShowSave(true); return; }
    const plate = visualizerRef.current?.describePlate();
    const saved = userPresets.saveOver(docId, settingsRef.current, plate?.contract ?? null, plate?.injectStyles ?? null, plate?.liquids ?? null);
    // Taken out underneath us (another tab, say): the sheet stays up to save
    // it as a new one, and says why the Replace did nothing.
    if (!saved) { setDocId(null); setShowSave(true); setToast('That preset is gone; save it under a name'); return; }
    setShowSave(false);
    setDocDirty(false);
    setToast(`Saved over “${saved.name}”`);
  };
  /** A saved look taken out of the library; the plate keeps what is on it. */
  const deleteSavedLook = (id: string) => {
    userPresets.remove(id);
    if (docId === id) setDocId(null);
  };

  /**
   * An empty plate.
   *
   * Clear rather than drain: draining is a performance move that swirls what
   * is there down a hole over a second and a half, which is lovely and is not
   * what "new" means. The palette is unpinned too — a look begun from nothing
   * should not inherit the last one's dyes.
   */
  const newLook = () => {
    // An empty plate: no take left walking over the defaults, none lit, and
    // no level remembered from the plate before to bring a row back to.
    rowFades.clear();
    rowFades.forget(FADE_ROWS);
    setRowFading({});
    setSettings({ ...DEFAULT_SETTINGS });
    setClearTrigger(v => v + 1);
    visualizerRef.current?.setHarmonyLock(null);
    setPinnedPresetId(null);
    setDocId(null);
    setDocDirty(false);
    setCued(null);
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
    Evolve, as slow moves rather than twitches (lib/slowEvolve.ts, lib/drift.ts).

    "Random Evolve" meant two unrelated things and nothing in between: the
    automation that drops dye and blows air, and a whole new look rolled at a
    song boundary, which is a cut. The middle was two dials nudged every six
    seconds, each over four: ten moves a minute that the owner saw as Evolve
    "directly reacting to frequency and bouncing around".

    Now it is one move at a time: a few related dials going the same way
    together, glided over 30 to 90 seconds at the default Evolve Speed (the
    dial stretches that up to four times or shrinks it to an eighth:
    evolvePace), steered by the song's sections and
    its level over the last half minute, or by a slow clock with nothing
    playing. Each dial stays inside a window round where the look sat when
    evolving started; the anchor is re-taken whenever a look is laid down,
    because from then on *that* is the look being wandered around.

    Stepped every half second, on the show's clock so a render plans the same
    moves as the show. A glide writes the settings twice a second, not five
    times: a dial moving a fifth of its travel over a minute moves a third of
    a percent in half a second, which nobody can see as a step, and every
    write re-renders the app. At the top of the dial a glide is 4 to 11 s and
    a dial may move a couple of percent of its travel a write; whether that
    reads as steps is PLAN 10-8d-2, for the owner's eye.
  */
  useEffect(() => {
    if (!isAutomated || !isActive) {
      // Switched off, or the show is paused: the next spell of evolving starts
      // from wherever the plate is now, not from where the last one began,
      // and its first move comes in seconds rather than after a stale rest.
      driftAnchor.current = settingsRef.current;
      slowEvolveRef.current = null;
      return;
    }
    const STEP_S = DRIFT_STEP_MS / 1000;
    const id = showInterval(() => {
      const cur = settingsRef.current;
      /*
        What it hears: the song shape tracker on the wall's engine (the show,
        not Preview's copy), which is already slow, and the tempo the bar grid
        has found. Nothing per frame: the treble and the energy of a moment
        are exactly the bounce this is here to remove.
      */
      const heard = (wallRef.current ?? visualizerRef.current)?.songShape();
      const bar = heard?.bar;
      const ear: EvolveEar = {
        playing: !!heard && heard.now.section !== 'quiet',
        section: heard?.now.section ?? 'quiet',
        intensity: heard?.now.intensity ?? 0,
        tension: heard?.now.tension ?? 0,
        lastDrop: heard?.now.lastDrop ?? null,
        time: heard?.now.time ?? 0,
        bpm: bar && bar.period > 0 && bar.beatConfidence >= 0.5 ? 60 / bar.period : 0,
      };
      const out = (slowEvolveRef.current ??= new SlowEvolve()).step(STEP_S, ear, cur, driftAnchor.current, cur.automateRate ?? 0.12,
        lookPaceRef.current);
      if (out.palette) for (const v of bothEngines()) v.evolvePalette();
      if (out.move) {
        const { to, seconds, aim } = out.move;
        const all: Record<string, number> = { ...to, ...(aim ? { macroAimX: aim.x, macroAimY: aim.y } : {}) };
        const live = cur as unknown as Record<string, number>;
        for (const [k, v] of Object.entries(all)) {
          // A fader whose move React has not rendered yet is a hand on that
          // dial now; the move would glide it from a value it has already left.
          if (ride.holds(k) && ride.read(k, live) !== live[k]) continue;
          const from = live[k] ?? (k.startsWith('macroAim') ? 0.5 : undefined);
          if (typeof from === 'number' && Number.isFinite(v)) driftGlide.current.set(k, { from, to: v, at: 0, seconds });
        }
      }
      if (driftGlide.current.size === 0) return;
      const step: Record<string, number> = {};
      for (const [k, g] of driftGlide.current) {
        g.at = Math.min(1, g.at + STEP_S / g.seconds);
        const e = g.at * g.at * (3 - 2 * g.at);
        step[k] = g.from + (g.to - g.from) * e;
        if (g.at >= 1) driftGlide.current.delete(k);
      }
      // Not through updateSettings: that is a hand, and re-anchors.
      setSettings(prev => ({ ...prev, ...step }));
      setDocDirty(true);
    }, DRIFT_STEP_MS, 'drift');
    return () => { clearShowInterval(id); driftGlide.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutomated, isActive]);

  /*
    The Ferrofluid bottle needs the plate to draw ferrofluid at all: the plate
    draws the second phase only with Ferrofluid (phaseAmount) up, and every
    shipped look but three has it at 0. So picking the bottle used to turn
    the amount up to 0.6, and the visualizer, seeing the bottle, left the
    plate bare for the drops to land on.

    Except that it did not stay bare. With the amount up, the places that
    lay the look's ferrofluid afresh read it as the look asking for some,
    and only one of them knew about the bottle: a new solver under the lead
    plate (the governor moving the grid, a lost device) lays the look's
    ring whatever is in the hand; so does the half-way point of the next
    look fading in, because a new look brought the amount up again for the
    bottle (this effect ran on every look); and a cast display running a
    plate of its own (one that cannot mirror the show's canvas), which is
    sent the settings but not the bottle, saw the amount rise over a bare
    plate and poured the ring at once (it still does on a hand's first pour:
    it is never sent the hands, PLAN 15j). The ring is a fifth of the plate in
    black drops round the middle. The owner, 2026-10-04: "when I pick the
    ferrofluid liquid - it deposits a huge chunk on the canvas. It shouldn't
    do that. I want to pour it on myself. Same with all of the other
    liquids."

    So picking a bottle changes nothing but the bottle in the hand, on every
    path that picks one (the desk's shelf, the Design desk's bottles, the
    phone's Dye sheet, the remote, a file from the Liquid Designer): picking
    a bottle up off the bench puts nothing in the dish. Ferrofluid is turned
    up when the hand actually pours it, as the Magnet's hold does: the
    visualizer asks (onFerrofluidPoured) once the bottle's ferrofluid is in
    the solver, so what turns the amount up is ferrofluid that is there, and
    the "turned up on a bare plate" pour never sees a bare plate.
  */
  /** What a look asks of the ferrofluid, for the plate to lay it by before the look's settings arrive. */
  const lookPhase = (s: Partial<VisualizerSettings>) => ({ phaseAmount: s.phaseAmount ?? 0, phaseScale: s.phaseScale ?? DEFAULT_SETTINGS.phaseScale });
  const ferrofluidPoured = () => {
    if ((settingsRef.current.phaseAmount ?? 0) > 0.002) return;
    // A fading look has the amount at nothing at the ring's swap on purpose (lib/lookFade's ringDip).
    if (lookFadeRef.current) return;
    updateSettings({ phaseAmount: 0.6 });
  };

  /*
    The Magnet brings its magnet with the hand, and never ferrofluid.

    A magnet over a plate with none on it does nothing at all, which read as
    the tool being broken, so picking it on such a look poured the look's
    ring of ferrofluid. Picking it also gave the look a magnet (Magnet
    Strength 0.8), which sits under the plate at Magnet Across and Up, the
    middle, from the moment it has strength, and gathered that ring there
    before the hand touched anything: the owner's "immediate big black hole
    in the middle when I select it" (PLAN 9s, which took that magnet away).

    And then, with no magnet: "Magnet still makes a giant black hole as soon
    as you pick it. That's not what I want. I just want a magnet that I can
    control the size of that I can interact with." The pour was still the
    hole. It covers about a fifth of the plate in black drops round the
    middle, and at a big Ferrofluid Scale they run together across it.

    So picking the Magnet does nothing to the plate. Picking a magnet up is
    taking it in the hand. For a day (9x) the first hold over a bare plate
    then laid a pool under the hand, and the owner: "Why does the magnet add
    ferrofluid? It should only work on ferrofluid that is already there." So
    the Magnet brings no ferrofluid at all, on any path: a magnet is a field,
    and over a dish with none in it a real one moves nothing. The ferrofluid
    comes from the bottle or the look.

    A hold asks only for what makes the magnet a magnet (onMagnetInHand): a
    magnet for the look, so it is set down where the hand lets go of it, as
    before. And Ferrofluid turned up only when the visualizer says there is
    ferrofluid in the solver to draw (`ferrofluid`: poured, then hidden by
    the amount at 0 or a look that has none). Turned up over a bare plate, it
    would have the frame loop pour the look's ring, the magnet adding
    ferrofluid by another door.

    Every hold asks, so a Magnet Strength set to 0 by hand comes back to 0.8
    the next time the Magnet is held: holding a magnet under the glass is
    giving the plate one, and the slider is how it is taken away again
    between holds.
  */
  const magnetInHand = (ferrofluid: boolean) => {
    const s = settingsRef.current;
    const patch: Partial<VisualizerSettings> = {};
    if ((s.magnetStrength ?? 0) <= 0) patch.magnetStrength = 0.8;
    // Not while a look is fading: the fade takes the amount to nothing at the ring's swap
    // (lib/lookFade's ringDip), and this would read that as "turned down" and write 0.6 over it.
    if (ferrofluid && (s.phaseAmount ?? 0) <= 0.002 && !lookFadeRef.current) patch.phaseAmount = 0.6;
    if (Object.keys(patch).length) updateSettings(patch);
  };

  /*
    A hand on a hardware fader: answered at once, drawn on the next frame, and
    shown on the desk ten times a second.

    See `lib/ride.ts` for why this is not just `setSettings`. `observe` runs
    here, in the render body beside `settingsRef`, because what it needs to
    know is what React actually rendered — that is how the ride tells its own
    late writes from a preset moving the same setting underneath it.

    It used to hand React every move once a frame, so the whole App (the
    desks, the panels, the plate's component) rendered sixty times a second
    while a fader moved, which on a weaker laptop is dropped frames in the
    middle of the move the fader is there to make smooth (PLAN.md §14f). It
    is the split the ear has had since #211: the plate reads the ride itself
    at the top of each frame (`ridePlate` below, `lay` in lib/ride.ts), and
    React, which now only has the number on the desk to show, is told every
    RIDE_VIEW_MS. A timer, not a frame: a backgrounded tab's timers slow to
    one a second, which is fine, because the plate reads the ride and not
    React, and the desk is not being looked at.

    A ride is a hand's write (PLAN.md 14t), so Evolve's drift treats it as
    one, the way `updateSettings` does: a glide in flight on the same dial is
    dropped at once, and where the drift wanders from moves to where the
    fader put it. Before, the drift's glide wrote over the fader every tick of
    a four-second move, and since the ride takes a value it did not send as
    somebody else's edit, the fader lost its pickup and had to find it again;
    and the next drift pulled the dial back into the window round the look as
    laid.
  */
  ride.observe(settings as unknown as Record<string, unknown>);
  /** Tells the cast's throttle a ride moved (`castNudge` below): a receiver hears it at the cast's own rate. */
  const castNudgeRef = useRef<() => void>(() => {});
  const rideSetting = useCallback((key: keyof VisualizerSettings, value: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const clean = sanitizePatch({ [key]: value });
    if (!Object.prototype.hasOwnProperty.call(clean, key)) return;
    const sanitizedVal = clean[key] as number;
    const k = String(key);
    ride.write(k, sanitizedVal);
    driftGlide.current.delete(k);
    laterWrites.mark([String(key)], showNow());
    if (rowFades.handOn([String(key)])) setRowFading(rowFades.running());
    castNudgeRef.current();
    if (rideFlush.current) return;
    const wait = Math.max(0, rideMark.current + RIDE_VIEW_MS - performance.now());
    rideFlush.current = setTimeout(() => { rideFlush.current = null; flushRide(); }, wait);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride]);
  useEffect(() => () => { if (rideFlush.current) clearTimeout(rideFlush.current); }, []);

  const {
    cued, setCued, cuedRef, setList, setSetList, savedSets, setSavedSets, changeSaved, setListRef,
    changeSet, liveItemId, setLiveItemId, cuesRef, sequencerRef, fadeSeconds, setFadeSeconds,
    fading, setFading,
  } = useSetListState();
  // On a timer rather than requestAnimationFrame, for the same reason the
  // dimmer is: the laptop's window spends a show behind the projector's, and
  // a hidden tab stops animating. A Go fired from a MIDI pad while the
  // operator is watching the wall would otherwise freeze half-way through the
  // crossfade and stay there. (rAF also runs at the compositor's rate, which
  // on a machine with no GPU worth the name is under a frame a second —
  // the fade would arrive in three steps.)
  const lookFadeRef = useRef<ShowIntervalHandle | null>(null);
  /** The look before the last Go, so one step back is always available. */
  const previousLook = useRef<{ id: string | null; settings: VisualizerSettings } | null>(null);

  const {
    phone, setPhone, phoneScreenUp, choosePhoneScreen, performing, designing, deskUp, overlayUp,
  } = usePhoneLayout({
    deskLayout,
  });

  // The hole in the desk layout the plate is painted over. Both desks leave
  // one; without a desk the plate fills the window, as it always has.
  const preview = usePreviewFrame(deskUp);
  /**
   * The mark, kept as a data URL so it can be sent to a receiver.
   *
   * A cast receiver and a network display are separate documents running their
   * own copy of the solver; the settings that place the logo travel with
   * everything else, but the picture has to be handed over once. Held here
   * rather than only in the visualizer for that reason.
   */
  const markUrlRef = useRef<string | null>(null);

  const {
    wallLook, ridePlate, drafting, walled, wallEngineRef, sendToWallRef, wallSettings, lookFor,
  } = useWallLook({
    isCasting, mirrorCount, designing, musicIntel, ride, wallRef, visualizerRef, settingsRef,
    pinnedPresetId, activePresetId, presetSeq, seedCount, clearTrigger, drainTrigger, spinFlick,
    backLook, docId, setSeedCount, setClearTrigger, setDrainTrigger, setSpinFlick, setSettings,
    setPinnedPresetId, setPresetSeq, setBackLook, setDocId, setDocDirty, adoptPreset, stageRef,
    paletteLock, lookPhase, markUrlRef, fadeSeconds, setToast, startCast, effectiveSettings,
    deskLayout,
  });

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

  /*
    The look's own values, for a knob's double-click (PLAN.md 8c): the
    document's when there is one, the built-in it started from when not, and
    a bare look for an empty plate. Through `lookOf`, so a value is what
    sending that look gives, base included. A rig setting (the dimmer, the
    room's sound, the mixer) is no look's, so it has no value to go back to.
  */
  const lookValues = useMemo(() => {
    const own = docId ? userPresets.presets.find(p => p.id === docId)?.settings
      : pinnedPresetId ? allPresets.find(p => p.id === pinnedPresetId)?.settings : undefined;
    return lookOf(own ?? {});
  }, [docId, userPresets.presets, pinnedPresetId, allPresets]);
  lookPaceRef.current = typeof lookValues.automateRate === 'number' ? lookValues.automateRate : 0.12;
  const lookValueOf = useCallback((key: keyof VisualizerSettings): number | undefined => {
    const v = lookValues[key];
    return typeof v === 'number' ? v : undefined;
  }, [lookValues]);

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
  /*
    The phone's list of looks: the preset menu's groups (the projected show,
    the photographs, the closeups) and then the ones saved here, each with
    the two colours the desks' cue rows show for it.
  */
  const phoneLooks = useMemo<PhoneLook[]>(() => {
    const groupOf = (p: { id: string; settings: Partial<VisualizerSettings> }) =>
      isUserPresetId(p.id) ? 'Yours' : p.settings.macroMode ? 'Closeup' : p.settings.renderStyle === 'photo' ? 'Photograph' : 'Light show';
    const order = ['Light show', 'Photograph', 'Closeup', 'Yours'];
    return allPresets
      .map(p => ({ id: p.id, name: p.name, description: p.description, group: groupOf(p), swatch: swatchOf(p.id) }))
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  }, [allPresets, swatchOf]);
  const setActive = setList.items.length > 0;
  const cues = useMemo<Cue[]>(() => {
    return setList.items.map(item => {
      const seq = item.kind === 'sequence' ? sequencerRef.current?.sequences.find(q => q.id === item.ref) : undefined;
      const look = item.kind === 'sequence' ? undefined : allPresets.find(p => p.id === (isUserPresetId(item.ref) ? item.ref : livePresetId(item.ref)));
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
    map: MidiMap;
    /** The port it is playing from, for the controller's profile (which CCs are knobs). */
    activeInputName: string | null;
    /** The shift layer, so a pad can step it — the actions run above the hook too. */
    stepBank: (dir: 1 | -1) => void;
  } | null>(null);

  /** Which CC a ride is learned to, so the desk and the controller agree. */
  const ccFor = useCallback((key: keyof VisualizerSettings): number | null => {
    const b = midiRef.current?.map.bindings.find(x => x.target.kind === 'setting' && x.target.key === key);
    return b && b.source.kind === 'cc' ? b.source.number : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    And what it is learned to: a knob draws as a knob, a fader as a slider
    (the design's rule, so the desk looks like the controller). A binding
    only says absolute or relative, so the controller's profile names which
    of its CCs turn (`controlKindOf`, PLAN.md 8d).
  */
  const kindFor = useCallback((key: keyof VisualizerSettings): ControlKind | null =>
    controlKindOf(midiRef.current?.map, key, midiRef.current?.activeInputName),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // The stage look's place in each list, for the slide tray's click (PLAN 35g):
  // the desk's is among all the presets, the phone's among its grouped list.
  const deskLookSlot = useMemo(() => {
    const i = pinnedPresetId ? allPresets.findIndex(p => p.id === pinnedPresetId) : -1;
    return i < 0 ? null : i;
  }, [allPresets, pinnedPresetId]);
  const phoneLookSlot = useMemo(() => {
    const i = pinnedPresetId ? phoneLooks.findIndex(l => l.id === pinnedPresetId) : -1;
    return i < 0 ? null : i;
  }, [phoneLooks, pinnedPresetId]);
  const liveLookName = useMemo(
    () => allPresets.find(p => p.id === activePresetId)?.name ?? null,
    [allPresets, activePresetId]);

  const cueLook = useCallback((presetId: string) => {
    const up = isUserPresetId(presetId) ? userPresetsRef.current.find(p => p.id === presetId) : null;
    const built = up ? undefined : findPreset(presetId);
    const settings = up ? up.settings : built?.settings;
    const name = up?.name ?? built?.name ?? presetId;
    if (settings) setCued({ id: built?.id ?? presetId, name, settings });
  }, []);

  /** What a set item will send: its look with its own controls on top, or its sequence. */
  const lookOfItem = useCallback((item: SetItem): ArmedLook | null => {
    const extra = { item: item.id, fade: item.fade, rides: item.rides };
    if (item.kind === 'sequence') {
      const seq = sequencerRef.current?.sequences.find(q => q.id === item.ref);
      return seq ? { id: `sequence:${seq.id}`, name: item.name ?? seq.name, settings: {}, sequence: seq.id, ...extra } : null;
    }
    const up = isUserPresetId(item.ref) ? userPresetsRef.current.find(p => p.id === item.ref) : null;
    const built = up ? undefined : findPreset(item.ref);
    const base = up ? up.settings : built?.settings;
    if (!base) return null;
    return { id: built?.id ?? item.ref, name: item.name ?? up?.name ?? built?.name ?? item.ref, settings: { ...base, ...((item.controls ?? {}) as Partial<VisualizerSettings>) }, ...extra };
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

  const {
    blackout, blackoutRef, fadeRef, toggleBlackout,
  } = useBlackout({
    settingsRef, setSettings, laterWrites,
  });

  const {
    fadeSettingsTo, sendLook, goLook, goLookNowRef, goLookNow, goBackPlate, backLookNow,
    backFollowsFront, backLookCleared, revertLook,
  } = useLookFades({
    lookFadeRef, lookTakesLevels, flushRide, evolveLetsGo, ride, settingsRef, setSettings,
    setFading, rowFades, laterWrites, setLiveItemId, setRideKeys, setCued, sequencerRef,
    previousLook, pinnedPresetId, adoptPreset, visualizerRef, lookPhase, cued, fadeSeconds,
    userPresetsRef, setBackLook, setRowFading, blackoutRef,
  });

  const { timecodeRef, timecode } = useTimecode();

  const {
    songShows, songShowsRef, setSongShows, actionSets, saveActionSet, deleteActionSet, followSongs,
    setFollowSongs,
  } = useShowLibrary({
    setLiquidTypes, setToolAmounts, setMusicSettings, setSetList, setSavedSets,
  });
  const [showSongs, setShowSongs] = useState(false);

  const sequencer = useShowSequencer({
    getSettings: () => settingsRef.current,
    // A stage's glide writes its levels every tick: a take on one of them stops,
    // or the two walks would fight a tick at a time.
    applySettings: (patch) => { handOnLevels(Object.keys(patch)); setSettings(prev => ({ ...prev, ...patch })); },
    adoptPreset,
    setPaletteWindow: (size, lead) => wallRef.current?.setPaletteWindow(size, lead),
    sectionLabel: musicIntel.state.section?.label ?? null,
    isActive,
    // Design is not a place a sequence gets to write settings. See the note
    // on `suspended`.
    suspended: designing,
    presets: allPresets,
    timecodeAt: timecode?.at ?? null,
    // A paced stage's scene (lib/scenePacing.ts): the plate's pace and light,
    // and the moments that open its swells, which are the same moves a song
    // show's actions make.
    pace: (sample) => { const v = wallRef.current; if (!v) return false; v.pace(sample); return true; },
    songCue: () => {
      /*
        Only what is new since the last tick, and only what was heard in the
        last second and a half of the song: a sequencer that was paused or held
        in Design does not ask, and the drop it missed is history by the time
        it asks again, not a pour to throw now. `songCueFrom` is the function
        `npm run pacing` plays the songs through and checks both rules on, so
        this is the cue it measured.
      */
      const { cue, seq } = songCueFrom(wallRef.current?.songShape(), songCueSeqRef.current);
      songCueSeqRef.current = seq;
      return cue;
    },
    moment: (kind) => {
      const v = wallRef.current;
      switch (kind) {
        case 'pour': v?.pour(); break;
        case 'burst': v?.applyGesture({ tool: 'press', x: 0.5, y: 0.5, layer: 0, amount: 1 }); break;
        case 'dyes': v?.stepDyes(); break;
        case 'drain': runActionRef.current?.('drain'); break;
        default: unhandled("a paced scene's moment", kind);
      }
    },
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

  const {
    addingToSet, setAddingToSet, addToSet, importToSet, onSetAction, onItemAction,
    bindSequenceToSong, importSequenceFile,
  } = useSetActions({
    changeSet, userPresets, sequencer, changeSaved, setListRef, setLiveItemId, userPresetsRef,
    sequencerRef, setShowSongs, currentSong, rideKeys, settingsRef,
  });

  const {
    luckyArmed, setLuckyArmed, triggerLucky,
  } = useLucky({
    settings, liquidTypes, previousLook, pinnedPresetId, settingsRef, lookTakesLevels, setSettings,
    setPinnedPresetId, visualizerRef, setSeedCount,
  });

  const {
    songChange,
  } = useSongChangeFades({
    ear, musicIntel, settings, isActive, renderHold, fadeSeconds, sequencer, designing, userPresets,
    followSongs, songShowsRef, settingsRef, previousLook, pinnedPresetId, setPinnedPresetId,
    fadeSettingsTo, liquidTypesRef, activePresetId, adoptPreset,
  });

  const {
    castState, relaySendRef, markLoaded, loadMark, clearMark,
  } = useCastFeed({
    wallLook, wallSettings, effectiveSettings, isActive, isAutomated, activeLayer, seedCount,
    clearTrigger, drainTrigger, activePresetId, presetSeq, paletteLock, shownOutput, castSend,
    mirrorCount, ridePlate, markUrlRef, bothEngines, setToastRef, castReadyRef, castNudgeRef,
    isCasting, ear, hear, audioData, songChange, stageRef, settingsRef, renderAudioRef, renderAudio,
    liveAudio,
  });

  const [, setLicenseTick] = useState(0);
  useEffect(() => {
    const onLicense = () => setLicenseTick((n) => n + 1);
    window.addEventListener('cg-license-changed', onLicense);
    void syncServerLicense();
    return () => window.removeEventListener('cg-license-changed', onLicense);
  }, []);

  // The account's licence key, brought here once the app is up signed in and
  // again on any later sign-in (lib/accountLicense.ts): a Pro account read Free
  // while this lived only in the profile sheet (the owner, 2026-10-24).
  useEffect(() => {
    if (!ACCOUNTS_ON) return;
    const ask = () => { if (isSignedInCached()) void syncAccountLicense(); };
    ask();
    return onAuthFlagChange(ask);
  }, []);
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

  const {
    recorder, showRecordPanel, setShowRecordPanel, recordChoice, setRecordChoice, toggleRecording,
    recordingAny, recordSeconds,
  } = useRecording({
    audioStream, perfLive, stopPerformance, startPerformance, musicIntel, perfNow,
  });

  // ── The phone's own hands: a pinch on the closeup, and Tilt ──
  /*
    Two fingers on the closeup set its magnification directly (a pinch is a
    position, not a step like + and −), and like the zoom keys it carries the
    flag with it, so pinching all the way out lands on the plate with the
    closeup off rather than stranded at 1x with it on.
  */
  const pinchZoom = useCallback((z: number) => {
    const zoom = Math.round(Math.max(1, Math.min(16, z)) * 100) / 100;
    updateSettings({ macroZoom: zoom, macroMode: zoom > 1.05 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /*
    Tilt writes the look's own Gravity and Tilt Direction while it is on
    (lib/phone.ts), so what it moves is what the faders move and a look
    saved mid-tilt keeps the tilt it was saved with. Turning it off puts back
    the look's own two values: the ones from before Tilt, or, if a new look
    has come in since, that look's (Tilt's next reading has already written
    over them by the time it is turned off, so they are taken from the look
    as it arrives).
  */
  const tiltWas = useRef<{ plateUpright: number; tiltDirection: number } | null>(null);
  const tilt = useDeviceTilt(({ upright, direction }) => updateSettings({ plateUpright: upright, tiltDirection: direction }));
  const toggleTilt = useCallback(async () => {
    if (tilt.on) { tilt.stop(); return; }
    const cur = settingsRef.current;
    tiltWas.current = { plateUpright: cur.plateUpright ?? 0, tiltDirection: cur.tiltDirection ?? 180 };
    if (!(await tilt.start())) tiltWas.current = null;
  }, [tilt.on, tilt.start, tilt.stop]);
  // However Tilt ended (the toggle, or the hook finding no sensor), the look
  // gets its own two values back.
  useEffect(() => {
    if (tilt.on || !tiltWas.current) return;
    updateSettings(tiltWas.current);
    tiltWas.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tilt.on]);
  useEffect(() => {
    if (!tiltWas.current) return;
    const look = allPresets.find(p => p.id === pinnedPresetId)?.settings;
    tiltWas.current = {
      plateUpright: look?.plateUpright ?? DEFAULT_SETTINGS.plateUpright,
      tiltDirection: look?.tiltDirection ?? DEFAULT_SETTINGS.tiltDirection,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedPresetId]);
  // The Tilt toggle is on the phone's Play sheet and nowhere else, so leaving
  // the phone layout ("Full layout", a resize) must not leave the plate
  // following the hand with no way to stop it.
  useEffect(() => { if (!phone && tilt.on) tilt.stop(); }, [phone, tilt.on, tilt.stop]);
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
      // The desk's copy in Preview is the plate under the hand as much as the wall's (PLAN.md 8b).
      if (!t || (t.id !== 'liquid-canvas' && t.id !== 'liquid-canvas-draft' && !t.closest?.('#liquid-canvas, #liquid-canvas-draft'))) return;
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
    const preset = findPreset(presetId);
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
  /*
    The mixer's order, a row up (lib/mixer.ts). From the state being updated,
    not the render's settings, so two pads pressed within one frame both land.
    The drift never touches the mixer, so there is no anchor to move.
  */
  const raiseMix = (id: MixMover) => {
    setSettings(prev => ({ ...prev, mixOrder: raiseInMix(prev.mixOrder, id) }));
    laterWrites.mark(['mixOrder'], showNow());
    setDocDirty(true);
  };
  /** A row's blend, one along (lib/mixer.ts, nextBlend), from the state being updated for the same reason. */
  const stepBlend = (id: MixMover) => {
    const key = blendKey(id);
    setSettings(prev => ({ ...prev, [key]: nextBlend(prev[key]) }));
    laterWrites.mark([String(key)], showNow());
    setDocDirty(true);
  };

  const {
    glidesRef, glideSetting,
  } = useGlides({
    handOnLevels, settingsRef, setSettings, laterWrites,
  });

  const {
    rowFadeTimer, fadeRow, mixTakes,
  } = useRowFades({
    wallRef, tempoRef, settingsRef, glidesRef, rowFades, setSettings, setDocDirty, setRowFading,
    rowFading,
  });
  const runActionRef = useRef<((a: MidiAction) => void) | null>(null);
  const runAction = (a: MidiAction) => {
    switch (a) {
      case 'seed':            setSeedCount(prev => prev + 1); break;
      case 'spin-front':      flickPlate(0); break;
      case 'spin-back':       flickPlate(1); break;
      case 'spin-reverse':    updateSettings({ spinRpm: -(settingsRef.current.spinRpm ?? 6) }); break;
      case 'spin-auto':       updateSettings({ spinAuto: (Math.round(settingsRef.current.spinAuto ?? 0) + 1) % 3 }); break;
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
      case 'go-back-plate':   goBackPlate(); break;
      case 'back-follows-front': backFollowsFront(); break;
      case 'cue-next':        stepCue(1); break;
      case 'cue-prev':        stepCue(-1); break;
      case 'tap-tempo':       tapTempo(); break;
      case 'tempo-clear':     clearTempo(); break;
      case 'bank-next':       midiRef.current?.stepBank(1); break;
      case 'bank-prev':       midiRef.current?.stepBank(-1); break;
      case 'mix-raise-led':   raiseMix('led'); break;
      case 'mix-raise-back':  raiseMix('back'); break;
      case 'mix-raise-film':  raiseMix('film'); break;
      case 'mix-raise-mark':  raiseMix('mark'); break;
      case 'mix-raise-gel':   raiseMix('gel'); break;
      case 'mix-raise-lumia': raiseMix('lumia'); break;
      case 'mix-blend-led':   stepBlend('led'); break;
      case 'mix-blend-gel':   stepBlend('gel'); break;
      case 'mix-blend-lumia': stepBlend('lumia'); break;
      case 'mix-blend-back':  stepBlend('back'); break;
      case 'mix-blend-film':  stepBlend('film'); break;
      case 'mix-blend-mark':  stepBlend('mark'); break;
      case 'mix-fade-led':    fadeRow('led'); break;
      case 'mix-fade-gel':    fadeRow('gel'); break;
      case 'mix-fade-lumia':  fadeRow('lumia'); break;
      case 'mix-fade-front':  fadeRow('front'); break;
      case 'mix-fade-back':   fadeRow('back'); break;
      case 'mix-fade-film':   fadeRow('film'); break;
      case 'mix-fade-mark':   fadeRow('mark'); break;
      // Every action, or `tsc` names the one that is missing. A pad wired to
      // an action nobody wrote a case for is a dead pad, and silent.
      default: unhandled('an action', a);
    }
  };
  /**
   * The selected liquid takes a palette colour, and nothing else changes.
   * What a sound trigger on a dye does (`TriggerHost.dye`): the music may
   * recolour the dropper, never take a tool out of the performer's hand.
   */
  const colourDye = (paletteIndex: number) => {
    const c = PALETTE[((paletteIndex % PALETTE.length) + PALETTE.length) % PALETTE.length];
    updateLiquidColor(selectedLiquidId, c.hex);
  };
  /** The selected liquid takes a palette colour; the dropper becomes the tool. A hand on a dye pad. */
  const selectDye = (paletteIndex: number) => {
    colourDye(paletteIndex);
    
  };
  const selectedDyeIndex = PALETTE.findIndex(c => c.hex.toLowerCase() === (selectedLiquid?.color ?? '').toLowerCase());

  const oscOutHearRef = useRef<OscOutHear | null>(null);
  const {
    remoteLink,
  } = useRemote({
    settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel, sequencer,
    allPresets, blackout, recorder, cued, fadeSeconds, filmSource, markLoaded, rowFading,
    updateSettings, wallRef, setMirrorCount, setPhoneCount, relaySendRef, castState, cuePreset,
    cueLook, setCued, updateLiquidColor, selectedLiquidId, liquidTypesRef, setSelectedLiquidId,
    setIsActive, setSeedCount, setClearTrigger, setDrainTrigger, triggerLucky, setIsAutomated,
    hideOverlays, setOverlaysVisible, stepPreset, toggleBlackout, toggleRecording,
    togglePerformance, goLook, revertLook, fadeRow, selectedLiquid, phone, pinnedLookName,
    runActionRef, runAction, tempoRef, oscOutHearRef,
  });

  const {
    songRuntime, songRuntimeRef, scoreProps,
  } = useSongScore({
    wallRef, goLookNow, runActionRef, setSettings, glideSetting, songShows, followSongs, designing,
    renderHold, musicIntel, isActive, currentSong, songShowsRef, setSongShows, activePresetId,
    pinnedPresetId, userPresets, tempoLabel,
  });

  // ── Render this song (PLAN.md §6) ───────────────────────────────
  const showSequencerRef = useRef(sequencer);
  showSequencerRef.current = sequencer;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const {
    songRender, renderOpen, setRenderOpen, startRender,
  } = useSongRendering({
    wallRef, renderAudioRef, setRenderAudio, musicElRef, showSequencerRef, songRuntimeRef,
    lookFadeRef, fadeRef, glidesRef, rowFadeTimer, rowFades, laterWrites, setRowFading, driftGlide,
    slowEvolveRef, settingsRef, driftAnchor, isActiveRef, renderHoldRef, setRenderHold, setIsActive,
    setSettings, musicFile,
  });
  const lookChoices = useMemo<LookChoice[]>(() => [
    ...PRESETS.map(p => ({ kind: 'preset' as const, id: p.id, name: p.name })),
    ...userPresets.presets.map(p => ({ kind: 'saved' as const, id: p.id, name: p.name })),
  ], [userPresets.presets]);
  relaySendRef.current = remoteLink.send;

  // The plate's colour to the rig, and colour, sound and beat to a VJ app (OSC out).
  const { oscOut, onOscOut } = useShowFeed({
    connected: remoteLink.status === 'connected', relaySendRef, wallRef, blackoutRef, hear, tempoRef, oscOutHearRef,
  });

  // ── MIDI controller and game controller ─────────────────────────
  const allPresetIds = useMemo(() => allPresets.map(p => p.id), [allPresets]);

  const {
    midi, runSoundTrigger, gamepad, projector, gamepadRingRect,
  } = useControllers({
    ride, settingsRef, rideSetting, runAction, cuePreset, selectDye, wallRef, activePresetId,
    selectedDyeIndex, userPresetsRef, isActive, isAutomated, settings, overlaysVisible, sequencer,
    blackout, recorder, musicIntel, allPresetIds, tempoRef, timecodeRef, midiRef, colourDye,
    visualizerRef, activeLayer, selectedLiquid, setActiveLayer, stageLayers, startCast, isCasting,
  });

  const {
    showPalette, setShowPalette, paletteCommands,
  } = useCommandPalette({
    allPresets, userPresetsRef, performing, cueLook, cuePreset, goLookNow, goLook, revertLook,
    blackout, toggleBlackout, newLook, saveLook, docId, docName, replaceLook, setSeedCount,
    setClearTrigger, setDrainTrigger, isActive, setIsActive, isAutomated, setIsAutomated, settings,
    updateSettings, recordingAny, recordChoice, toggleRecording, perfLive, togglePerformance,
    setShowRecordPanel, triggerLucky, hideOverlays, setSettingsSection, setShowSettings,
    setShowHelp, openAllSettings, setShowMidi, setShowSequencer, showActivity, setShowActivity,
    setShowSongs, startCast, deskTabs, setDeskTab, setShowStage, recorder, deskUp, sendToWallRef,
    setActiveTool, designing, cuesRef, cueAny,
  });

  /** The save sheet, opened from the bench and from ⌘S. */
  const [showSave, setShowSave] = useState(false);

  /** The lamps in both desks' headers, and the line along the bottom. */
  /**
   * Whether the cue bar is occupying the bottom centre of a narrow screen.
   * The minimise chips live there too and have to give way to it.
   */
  const cueBarUp = overlayUp && !!(cued || fading > 0 || previousLook.current);

  const livePhoneCount = remoteLink.status === 'connected' ? phoneCount : 0;
  useEffect(() => {
    if (remoteLink.status !== 'connected') setPhoneCount(0);
  }, [remoteLink.status]);

  const deskDots = useMemo(() => ({
    sound: audioSource !== 'none',
    // The film under the dye, which is what the dot opens (Film, in Settings).
    // It was lit by the poured video, a different thing, and opened the film.
    video: filmSource !== 'none',
    mic: audioSource !== 'none',
    wall: isCasting,
    midi: midi.enabled,
    phone: livePhoneCount > 0,
    rec: recordingAny ? clockText(recordSeconds) : null,
    recWhat: runningText({ videoOn: recorder.recording, takeOn: perfLive }),
  }), [audioSource, isVideoPlaying, isCasting, midi.enabled, livePhoneCount, recordingAny, recordSeconds, recorder.recording, perfLive]);

  /*
    Where each status dot goes.

    One set of handlers rather than one per desk, for the same reason the
    header itself is one component: Design and Perform must send you to the
    same place from the same dot. Each closes whatever else is open, because
    two panels over a plate is the state you cannot see the show through.
  */
  const openSettingsAt = useCallback((section: string) => {
    // An id from before a section was folded into another opens that one.
    setSettingsSection(resolveSection(section));
    setShowSettings(true);
    setShowMidi(false);
    setShowSequencer(false);
    setShowHelp(false);
  }, []);
  const deskOpen = useMemo(() => ({
    sound: () => openSettingsAt('audio-input'),
    video: () => openSettingsAt('film'),
    midi: () => { setShowMidi(true); setShowSequencer(false); setShowSettings(false); setShowHelp(false); },
  }), [openSettingsAt]);

  /*
    Deaf is said first and in words: listening, but nothing arriving (the
    audio context suspended or interrupted, or no reading for half a second;
    hooks/useAudioAnalyzer.ts). A deaf plate still moves, so the only way a
    performer finds out is being told. Not while a render holds the ear.
  */
  const earDeaf = ear.deaf && audioSource !== 'none' && !renderHold;
  const deskAudioLine = audioSource === 'none' ? 'silent'
    : `${earDeaf ? 'not hearing · ' : ''}${audioSource === 'simulated' ? 'band' : audioSource}${audioData ? ` ${Math.round(Math.min(100, audioData.volume))}%` : ''}${songLine ? ` · ${songLine}` : ''}`;

  /** The dyes on the desk's tray: the bottles that are colours, not behaviours. */
  const trayDyes = useMemo(() => liquidTypes.filter(l => !l.behaviour).map(l => l.color), [liquidTypes]);

  // Derive preset name for display
  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    return allPresets.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId, allPresets]);

  useCheckHooks({
    cuePresetRef, goLookNowRef, runActionRef, setSettings, settingsRef, wallRef, setAmbientModeRef,
    activeTool, setActiveTool, setActiveLayer, setSelectedLiquidId, updateLiquidColor,
    liquidTypesRef, setToolAmounts, playTrackRef, songShowsRef, songRuntimeRef, startBenchRef,
  });

  useCrashState({
    activePresetName, settings, output, isCasting, projector, isAutomated, wallRef,
  });

  /*
    The settings, drawn three ways from one list of props: the sheet (every
    section), a panel on the desk (one section, `embed`), and the Stage
    sheet (the room and the machine, `scope="stage"`). One list, so a
    control cannot be wired one way in the sheet and another on the desk.
  */
  /*
    The three screens that were behind the Sequence and Sound chips, each
    drawn either as the sheet it was (from a status dot, the palette or a
    link inside another sheet) or, embedded, as a panel on any tab
    (lib/deskLayout.ts: songs, sequences, player).
  */
  const soundScreen = (embed: boolean) => (
    <SoundPanel
      source={audioSource}
      onSource={(x) => { void handleSourceChange(x); }}
      inputs={audioInputs}
      inputId={audioInputId}
      onPickMic={deskOpen.sound}
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
      ambientMode={ambientMode}
      onAmbientMode={setAmbientMode}
      readLevel={readLevel}
      deaf={earDeaf}
      embed={embed}
      onClose={() => setShowSound(false)}
    />
  );
  const songsScreen = (embed: boolean) => (
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
      embed={embed}
      onClose={() => setShowSongs(false)}
    />
  );
  const sequencesScreen = (embed: boolean) => (
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
      embed={embed}
      onClose={() => setShowSequencer(false)}
    />
  );

  const settingsPanel = (over: Partial<ComponentProps<typeof SettingsPanel>> & { onClose: () => void }) => (
    <SettingsPanel
      mixTakes={mixTakes}
      backLook={backLookName}
      lookId={activePresetId}
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
      // Under a desk, Blackout is in the desk's header in every layout, and once on screen is enough.
      onBlackout={deskUp ? undefined : toggleBlackout}
      projectorMode={projector.mode}
      onProjectorMode={projector.setMode}
      projectorName={projector.projector?.label ?? null}
      output={output}
      onOutput={setOutput}
      onOutputReset={resetOutput}
      wakeLock={wakeLock}
      wallTest={wallTest}
      onWallTest={setWallTest}
      {...tempoPanel}
      oscOut={oscOut}
      onOscOut={onOscOut}
      readTempo={readTempo}
      readEar={() => ear.live.current?.features ?? null}
      spinBpm={tempoLabel.source ? tempoLabel.bpm : heardBpm}
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
      onOpenSound={() => { setShowSettings(false); setShowSound(true); setShowSongs(false); setShowMidi(false); }}
      sceneOn={sceneOn}
      onSceneToggle={toggleScene}
      sceneState={scene.state}
      cameras={cameras.devices}
      sceneDeviceId={sceneDeviceId}
      onSceneDevice={chooseSceneDevice}
      scenePreviewRef={scenePreviewRef}
      filmSource={filmSource}
      filmName={filmSource === 'file' ? filmName : null}
      pourName={isVideoPlaying ? pourName : null}
      cartoons={cartoons}
      onFilmFile={loadFilm}
      onPourVideo={pourFile}
      onStopPourVideo={stopPour}
      onFilmCamera={() => void startFilmCamera()}
      filmCameraId={filmCameraId}
      onFilmCameraDevice={chooseFilmCamera}
      filmCamera={filmSource === 'camera' ? filmCamera : null}
      filmCameraLost={filmCameraLost}
      onFilmWindow={startFilmWindow}
      onFilmClear={clearFilm}
      markLoaded={markLoaded}
      onMarkFile={loadMark}
      onMarkClear={clearMark}
      {...over}
    />
  );
  // A section as a panel; with Music & Drone out, Sound has no way there (35c-5).
  const sectionPanel = (id: string) => settingsPanel({ embed: id, focusSection: null, onGoTo: openSettingsAt, onClose: () => {}, ...(whereIs(deskLayout, 'player') && { onOpenSound: undefined }) });

  const evolveAt = travelOfKey('automateRate', settings.automateRate);
  return (
    // On a phone the height is the dynamic viewport's: 100vh there is the
    // height with the browser's bars hidden, which put the dock under them.
    <div className={`relative w-full ${phone ? 'h-[100dvh]' : 'h-screen'} bg-black overflow-hidden font-sans text-white ${overlaysVisible ? '' : 'overlays-hidden'}`}>
      <LiquidVisualizer
        ref={wallEngineRef}
        onBackLookCleared={backLookCleared}
        audioData={audioData} hear={hear}
        settings={walled ? wallSettings : effectiveSettings} ride={ridePlate.wall}
        seedCount={wallLook ? wallLook.seedCount : seedCount} spinFlick={wallLook ? wallLook.spinFlick : spinFlick}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer}
        clearTrigger={wallLook ? wallLook.clearTrigger : clearTrigger}
        onAim={aimMacro}
        onPinchZoom={phone ? pinchZoom : undefined}
        toolAmount={toolAmount}
        drainTrigger={wallLook ? wallLook.drainTrigger : drainTrigger}
        activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
        sceneRef={scene.reading}
        filmSenseRef={filmSense.reading}
        frame={preview.frame}
        hidden={drafting}
        output={shownOutput}
        tempoRef={tempoRef}
        soundBindings={midi.map.sound}
        onSoundTrigger={runSoundTrigger}
        onManualGesture={musicIntel.recordGesture}
        onMagnetInHand={magnetInHand}
        onFerrofluidPoured={ferrofluidPoured}
        onEngineStatus={(next) => {
          // The live reading goes in a ref (the settings panel polls it while
          // open); the shell only re-renders when the engine itself changed.
          engineStatusRef.current = next;
          // Compared against what was last set, for the reason the tempo
          // label is: this arrives once a second, and an updater handing back
          // the old value still renders the App (PLAN.md §14f).
          const shown = shownEngineStatus.current;
          if (shown && shown.label === next.label && shown.steppedDown === next.steppedDown && shown.gpuUnavailable === next.gpuUnavailable) return;
          shownEngineStatus.current = next;
          setEngineStatus(next);
        }}
      />
      {/*
        The desk's copy in Preview (PLAN.md 8b; see `drafting`). Keyed so a
        second Preview starts a fresh engine rather than inheriting the last
        one's refs. It hears the music and takes the desk's hands, and keeps
        out of what is the show's: no projector pass (its `output` is the
        default), no sound triggers or recorded gestures (the wall's engine
        fires those), no engine status for the header.
      */}
      {drafting && (
        <LiquidVisualizer
          key="draft"
          ref={visualizerRef}
          draft
          audioData={audioData} hear={hear} settings={effectiveSettings} ride={ridePlate.desk} seedCount={seedCount} spinFlick={spinFlick}
          selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
          onAim={aimMacro}
          toolAmount={toolAmount}
          drainTrigger={drainTrigger} activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
          sceneRef={scene.reading}
          frame={preview.frame}
          tempoRef={tempoRef}
          onMagnetInHand={magnetInHand}
          onFerrofluidPoured={ferrofluidPoured}
        />
      )}

      {/*
        A game controller's cursor: a ring over the plate, shown while the
        sticks move. Not in clean screen, which is the show (PLAN.md 14w): the
        owner asked for nothing to be drawn at the pointer on the show, and
        when the laptop's own screen is the one on the wall (one screen, or a
        mirrored projector) this ring was on the wall the moment a stick
        moved. Without it the stick is aimed by what it does to the plate,
        which is how a hand on a dish aims anyway; the design screen keeps it
        for finding where the cursor is. `npm run showcursor` asks both.
      */}
      {overlaysVisible && <GamepadRing cursor={gamepad.cursor} rect={gamepadRingRect} colour={selectedLiquid?.color ?? '#fff'} />}

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
      {libraryOpen && overlaysVisible && !phone && (
        <div className="fixed bottom-28 left-1/2 z-50 -translate-x-1/2 w-[min(92vw,460px)] rounded-2xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl shadow-2xl" data-testid="music-library">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
              Ambient shelf · {clock(librarySeconds())}
            </span>
            <button onClick={() => setLibraryOpen(false)} className="p-1 rounded-full hover:bg-white/10 text-white/50" aria-label="Close the shelf"><X size={12} /></button>
          </div>
          {LIBRARY.map(t => (
            <button
              aria-pressed={musicFile?.track?.src === t.src}
              key={t.src}
              onClick={() => playTrack(t)}
              className={`flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                musicFile?.track?.src === t.src ? LIT : 'text-white/70 hover:bg-white/5'
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
      {musicFile && overlaysVisible && !phone && (
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
            aria-pressed={musicLoop}
            onClick={() => setMusicLoop(v => !v)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
              musicLoop ? LIT : 'border-white/15 text-white/40 hover:text-white/70'
            }`}
            title={musicFile?.track
              ? 'Hand over to the next track on the shelf when this one ends, and round again'
              : 'Play this file again when it ends, so the room is never left in silence'}
            data-testid="music-loop"
          >
            {musicFile?.track ? 'rolls on' : 'repeats'}
          </button>
          <button
            aria-pressed={renderOpen || songRender.running}
            onClick={() => { setRenderOpen(v => !v); setLibraryOpen(false); }}
            // 24 px and 70% white: the floor for a control a person has to find in a dark room.
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${renderOpen || songRender.running ? LIT : 'hover:bg-white/10 text-white/70'}`}
            aria-label="Song film: render this song to a video file" title="Song film: render this song to a video file, every frame, none dropped"
            data-testid="render-song"
          >
            <Film size={13} />
          </button>
          <button onClick={closeMusicFile} disabled={songRender.running} className="p-1 rounded-full hover:bg-white/10 text-white/50 disabled:opacity-30" aria-label="Close music file" data-testid="music-close"><X size={12} /></button>
        </div>
      )}
      {musicFile && ((renderOpen && !libraryOpen) || songRender.running) && (
        <PanelGuard name="The song render" onClose={() => { songRender.cancel(); setRenderOpen(false); songRender.reset(); }}>
        <RenderPanel
          songName={musicFile.name}
          songSeconds={musicTime.d}
          currentSeed={showSeed()}
          state={songRender.state}
          running={songRender.running}
          showRunning={sequencer.status.sequenceId !== null || songRuntime.status.showId !== null}
          webcodecs={songRender.support.webcodecs}
          streamsToDisk={songRender.support.streamsToDisk}
          onRender={startRender}
          onCancel={songRender.cancel}
          onClose={() => { setRenderOpen(false); songRender.reset(); }}
        />
        </PanelGuard>
      )}
      {projector.projector && !isCasting && overlaysVisible && projector.mode !== 'off' && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 pl-4 pr-2 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl shadow-2xl" data-testid="projector-hint">
          <button onClick={() => { void projector.sendNow(); }} className="flex items-center gap-2 hover:text-white" title="Open the show full size on the second screen, with nothing else on it">
            <Projector size={13} /> {projector.projector.label} connected · {projector.armed ? 'sending on your next click' : 'send the show there'}
          </button>
          <button
            aria-pressed={projector.mode === 'auto'}
            onClick={() => projector.setMode(projector.mode === 'auto' ? 'ask' : 'auto')}
            className={`ml-2 rounded-full border px-2 py-0.5 text-[9px] ${projector.mode === 'auto' ? LIT : 'border-white/15 text-white/50 hover:text-white'}`}
            title="Always send the show to a projector the moment it is connected"
            data-testid="projector-auto"
          >
            {projector.mode === 'auto' ? 'automatic' : 'always'}
          </button>
          <button onClick={() => projector.setMode('off')} className="p-1 text-white/30 hover:text-white" aria-label="Dismiss and stop offering" title="Don't offer this (Settings → Wall turns it back on)"><X size={11} /></button>
        </div>
      )}
      {isCasting && windowFullscreen === false && !fillDismissed && overlaysVisible && (
        <ProjectorFillChip onFill={fillWindow} onDismiss={dismissFill} />
      )}
      {/*
        The zoom chip. Without a desk it hangs at the window's top, under the
        projector's hint. With a desk up it sits at the top of the desk's
        plate instead (QA-4): pinned to the window's top it landed on the
        desk's top strip, square on Record performance, which the owner found
        covered as soon as the plate was zoomed in, on Perform and Design
        alike. The plate's box is the one place on a desk nothing else is
        drawn, and the chip is about the plate, so it goes there.
      */}
      {(settings.macroZoom ?? 1) > 1.05 && overlaysVisible && !phone && (
        <div
          style={preview.frame ? { top: preview.frame.top + 8, left: preview.frame.left + preview.frame.width / 2 } : undefined}
          className={`fixed ${preview.frame ? '' : 'top-3 left-1/2 translate-y-9 '}z-40 -translate-x-1/2 flex items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2 py-1 text-[11px] font-bold uppercase tracking-widest text-white/80 backdrop-blur-xl shadow-2xl`}
          data-testid="macro-zoom"
        >
          <Microscope size={12} className="ml-1" />
          <button onClick={() => zoomMacro(-1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom out (− or the wheel over the plate)" aria-label="Zoom out" data-testid="macro-zoom-out">−</button>
          <span className="font-mono tabular-nums" data-testid="macro-zoom-value">{(settings.macroZoom ?? 1).toFixed(1)}×</span>
          <button onClick={() => zoomMacro(1)} className="rounded-full px-2 py-0.5 hover:bg-white/15" title="Zoom in (+ or the wheel over the plate)" aria-label="Zoom in" data-testid="macro-zoom-in">+</button>
          {/* Who moves the camera. Alt-drag on the plate pans it; Alt-click fixes it on a spot.
              Follow and Auto read differently at a glance (QA-11): the owner found them the
              same thing, because between Auto's cuts both ride one bead and the difference
              lived only in the hover titles. Follow wears a crosshair, for the one subject it
              is locked on and never leaves; Auto names its cut, every Shot Length seconds
              (`macroHold`, the same `max(0.5, … ?? 5)` LiquidVisualizer gives MacroCamera). */}
          <span className="mx-1 h-3 w-px bg-white/20" />
          {([
            ['hold', 'Hold', 'Hold still where it is aimed. Alt-drag on the plate to pan, Alt-click to fix on a spot; Random Evolve wanders it slowly.'],
            ['follow', 'Follow', 'Locked on: rides the liquid where it is aimed and never cuts away. Alt-click on something to follow it.'],
            ['auto', 'Auto', `Picks its own subjects: rides one for Shot Length (${shotLabel(settings.macroHold)}), then cuts to another.`],
          ] as const).map(([mode, label, title]) => (
            <button key={mode} onClick={() => updateSettings({ macroCamera: mode })} title={title}
              aria-pressed={(settings.macroCamera ?? 'hold') === mode} data-testid={`macro-camera-${mode}`}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${(settings.macroCamera ?? 'hold') === mode ? LIT : 'hover:bg-white/15 text-white/60'}`}>
              {mode === 'follow' && <Crosshair size={11} aria-hidden />}
              {label}
              {mode === 'auto' && <span className="font-normal normal-case tracking-normal opacity-70">cuts {shotLabel(settings.macroHold)}</span>}
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
            className={`pointer-events-none absolute ${phone ? 'bottom-44' : 'bottom-20'} left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-black/70 px-4 py-2 text-[13px] text-white/80 backdrop-blur-xl`}
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
            className={`absolute ${phone ? 'bottom-44' : 'bottom-20'} left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-white/15 bg-black/80 px-4 py-2 text-[13px] text-white/80 backdrop-blur-xl`}
            data-testid="scene-resume"
            role="dialog"
            aria-label="Motion camera"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-live)]" />
            <span>The motion camera was on last time. Turn it back on?</span>
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
        {showControls && !showSettings && overlayUp && (
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
                          aria-pressed={isSelected}
                          key={liq.id}
                          onClick={() => { setSelectedLiquidId(liq.id); }}
                          title={liq.description}
                          data-testid={`liquid-${liq.id}`}
                          className={`flex items-center gap-2 w-full px-2 py-2.5 rounded-xl border-2 transition-all text-left ${
                            isSelected ? LIT : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
                          }`}

                        >
                          <span
                            className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-white/30"
                            style={bottleSwatch(liq)}
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
                    {/*
                      The liquid's own colour, with no dye in it (lib/liquidColour.ts):
                      what every bottle the shelf ships pours until a dye is
                      picked, and the way back to it after one was.
                    */}
                    {selectedLiquid?.own && (
                      <button
                        onClick={() => updateLiquidColor(selectedLiquidId, selectedLiquid.own!)}
                        data-testid="dye-natural"
                        aria-pressed={isNatural(selectedLiquid)}
                        className={`w-[26px] h-[26px] rounded-full border-2 border-dashed transition-transform hover:scale-110 ${
                          isNatural(selectedLiquid) ? 'border-white scale-110 shadow-[0_0_6px_rgba(255,255,255,0.6)]' : 'border-white/40'
                        }`}
                        style={isClearLiquid(selectedLiquid) ? { backgroundColor: 'transparent' } : { backgroundColor: selectedLiquid.own }}
                        title={`Natural: ${selectedLiquid.name.toLowerCase()} as it is, ${isClearLiquid(selectedLiquid) ? 'clear' : 'its own colour'}, no dye`}
                      />
                    )}
                    {DROPPER_COLORS.map(hex => {
                      const isCurrent = !isNatural(selectedLiquid) && selectedLiquid?.color.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          aria-pressed={isCurrent}
                          key={hex}
                          onClick={() => updateLiquidColor(selectedLiquidId, hex)}
                          className={`w-[26px] h-[26px] rounded-full border transition-transform hover:scale-110 ${
                            isCurrent ? 'border-white ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : 'border-white/20'
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
                      aria-pressed={paletteLock == null}
                      onClick={() => selectPalette(null)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                        paletteLock == null ? LIT : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      <span className="text-[11px] font-bold uppercase tracking-wider flex-1">Auto</span>
                      <span className="text-[8px] opacity-50">the music picks</span>
                    </button>
                    {COLOR_HARMONIES.map((harmony, idx) => (
                      <button
                        aria-pressed={paletteLock === idx}
                        key={idx}
                        onClick={() => selectPalette(idx)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                          paletteLock === idx ? LIT : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
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
                      { id: 'spin' as const, icon: RotateCw, label: 'Spin' },
                    ]).map(({ id, icon: Icon, label }) => (
                      <button
                        aria-pressed={activeTool === id}
                        key={id}
                        onClick={() => setActiveTool(id)}
                        className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg border transition-all ${
                          activeTool === id
                            ? LIT
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
                  aria-pressed={!isActive}
                  onClick={() => setIsActive(!isActive)}
                  className={`p-3 rounded-full transition-all duration-300 ${
                    !isActive
                      ? `border ${LIT}`
                      : 'border border-transparent bg-white/15 hover:bg-white/25 text-white'
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
                    role="switch"
                    aria-checked={isAutomated}
                    onClick={() => setIsAutomated(!isAutomated)}
                    data-testid="evolve-toggle"
                    className={`relative w-[52px] h-[26px] rounded-full transition-colors duration-300 ${isAutomated ? 'bg-accent' : 'bg-track'}`}
                    title="Works the plate on its own: drops and air from the music, dye lifted off again, a finger drawn through it, and the dials wandering slowly around the look"
                  >
                    <motion.div
                      className="absolute top-[3px] left-[3px] w-5 h-5 bg-white rounded-full shadow-md"
                      animate={{ x: isAutomated ? 26 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                  {/* How busy Evolve is: a drop a second at left, a frenzy at right */}
                  <div className={`flex flex-col gap-1 w-full mt-1 transition-opacity ${isAutomated ? '' : 'opacity-40'}`}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] uppercase tracking-widest font-bold text-white/55">Evolve Speed</span>
                      <span className="text-[8px] font-bold text-white/50">{Math.round((settings.automateRate ?? 0) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.001"
                      value={evolveAt}
                      onChange={e => updateSettings({ automateRate: valueOfKey('automateRate', +e.target.value) })}
                      className="w-full h-6 appearance-none rounded-full cursor-pointer accent-purple-400"
                      style={{ background: `linear-gradient(to right, rgb(192,132,252) ${evolveAt * 100}%, rgba(255,255,255,0.1) ${evolveAt * 100}%)` }}
                      title="How busy Random Evolve is: how often it pours, thins and strokes"
                      data-testid="evolve-speed"
                    />
                  </div>
                </div>
                </>}

                <div className="w-full h-px bg-white/10" />

                {/* Macro closeup */}
                <button
                  aria-pressed={!!settings.macroMode}
                  onClick={() => updateSettings({ macroMode: !settings.macroMode })}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    settings.macroMode ? LIT : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Macro closeup — magnify the plate and chase a single bead of liquid"
                >
                  <Microscope size={16} className={settings.macroMode ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Macro</span>
                </button>

                {/* Settings */}
                <button
                  aria-pressed={showSettings}
                  onClick={() => { setSettingsSection(null); setShowSettings(!showSettings); setShowHelp(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showSettings ? LIT : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Open settings"
                >
                  <Settings size={16} className={showSettings ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Settings</span>
                </button>

                {/*
                  The desk's tab, for when the window is wide enough for the
                  desk again: it was Perform or Design, and is now whichever
                  of the owner's tabs is next. Not a toggle, so not lit: it
                  names the tab the desk will open on.
                */}
                <button
                  onClick={() => { const t = deskTabs.tabs; const i = t.findIndex(x => x.id === deskTab); setDeskTab(t[(i + 1) % t.length].id); }}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full bg-white/5 hover:bg-white/10 border-white/10"
                  title={`The desk opens on ${deskTabs.tabs.find(t => t.id === deskTab)?.name ?? ''} once the window is wide enough. Click for the next tab.`}
                  data-testid="desk-mode-button"
                >
                  <LayoutGrid size={16} className="opacity-60 group-hover:opacity-100" />
                  <span className="max-w-full truncate text-[7px] font-bold uppercase tracking-widest">{deskTabs.tabs.find(t => t.id === deskTab)?.name}</span>
                </button>

                {/* Songs: a look for each song and what happens while it plays */}
                <button
                  aria-pressed={showSongs || songRuntime.status.showId !== null || sequencer.status.running}
                  onClick={() => { setShowSongs(!showSongs); setShowTrackPanel(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showSongs || songRuntime.status.showId !== null || sequencer.status.running ? LIT : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title="Songs — a look for each song, and what happens while it plays"
                  data-testid="songs-button"
                >
                  <Clapperboard size={16} className={showSongs || songRuntime.status.showId !== null ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Songs</span>
                </button>

                {/* MIDI controller */}
                <button
                  aria-pressed={showMidi}
                  onClick={() => { setShowMidi(!showMidi); setShowSequencer(false); setShowTrackPanel(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    showMidi ? LIT : midi.enabled ? 'border-ok/50 text-ok' : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title={midi.enabled ? `MIDI on${midi.activeInputName ? `: ${midi.activeInputName}` : ''}${gamepad.connected ? ` · gamepad: ${gamepad.connected}` : ''}` : 'MIDI controller — faders, pads and buttons for the show'}
                  data-testid="midi-button"
                >
                  <Sliders size={16} className={showMidi || midi.enabled ? '' : 'opacity-60 group-hover:opacity-100'} />
                  <span className="text-[7px] font-bold uppercase tracking-widest">MIDI</span>
                </button>

                {/* Randomize */}
                <button
                  aria-pressed={luckyArmed}
                  onClick={() => {
                    if (performing && !luckyArmed) { setLuckyArmed(true); return; }
                    setLuckyArmed(false);
                    triggerLucky();
                  }}
                  data-testid="lucky-button"
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                    // Armed to confirm is pressed, not live: red is only blackout and recording (PLAN 35a).
                    luckyArmed ? LIT : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                  title={luckyArmed
                    ? 'Click again to replace every setting with a random one. Revert brings this look back.'
                    : 'Randomize all settings — the look it replaces is kept, so Revert brings it back'}
                >
                  <Shuffle size={16} className={luckyArmed ? '' : 'text-yellow-400 group-hover:scale-110 transition-transform'} />
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
                    {Array.from({ length: stageLayers }).map((_, idx) => (
                      <button
                        aria-pressed={activeLayer === idx}
                        key={idx}
                        onClick={() => setActiveLayer(idx)}
                        className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-[11px] font-bold ${
                          activeLayer === idx ? `${LIT} scale-110` : 'border-white/20 text-white/50 hover:border-white/50'
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
                    aria-pressed={audioSource === 'microphone'}
                    onClick={() => handleSourceChange(audioSource === 'microphone' ? 'none' : 'microphone')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'microphone'
                        ? `border ${LIT}`
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={audioSource === 'microphone' ? "Mic is active — click to mute" : "Enable microphone input"}
                  >
                    {audioSource === 'microphone' ? <Mic size={14} /> : <MicOff size={14} />}
                    <span>Mic</span>
                  </button>
                  <button
                    aria-pressed={audioSource === 'system'}
                    onClick={() => handleSourceChange(audioSource === 'system' ? 'none' : 'system')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'system'
                        ? `border ${LIT}`
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={audioSource === 'system' ? "System audio active — click to stop" : "Capture system/tab audio"}
                  >
                    <Monitor size={14} />
                    <span>System</span>
                  </button>
                  <button
                    aria-pressed={audioSource === 'file'}
                    onClick={() => musicInputRef.current?.click()}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'file'
                        ? `border ${LIT}`
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title="Play a music file here and drive the show from it — no microphone, no loopback"
                    data-testid="music-file-button"
                  >
                    <FileAudio size={14} />
                    <span>File</span>
                  </button>
                  <button
                    aria-pressed={!!musicFile?.track}
                    onClick={() => setLibraryOpen(v => !v)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      musicFile?.track
                        ? `border ${LIT}`
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={`Ambient music that ships with the show — ${clock(librarySeconds())} of it, licensed for a room like this one, and played from this tab so a shared tab carries the sound too`}
                    data-testid="music-library-button"
                  >
                    <Music size={14} />
                    <span>Shelf</span>
                  </button>
                  <button
                    aria-pressed={audioSource === 'simulated'}
                    onClick={() => handleSourceChange(audioSource === 'simulated' ? 'none' : 'simulated')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[11px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'simulated'
                        ? `border ${LIT}`
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

      {/* ── The phone (components/phone/PhoneStage.tsx) ─────────── */}
      {phone && showControls && phoneScreenUp === 'play' && (
        <PanelGuard name="Play">
        <PhonePlay
          lookName={activePresetName ?? (fading > 0 ? allPresets.find(p => p.id === pinnedPresetId)?.name ?? null : null) ?? pinnedLookName ?? 'Untitled'}
          edited={!activePresetName && fading <= 0 && !!pinnedLookName}
          looks={phoneLooks}
          activeLookId={activePresetId ?? (fading > 0 ? pinnedPresetId : null)}
          lookSlot={phoneLookSlot}
          onLook={(id) => goLookNow(id)}
          onShuffle={triggerLucky}
          onSave={(name) => saveCurrentPreset(name, '', false)}
          saveSuggestion={docId ? `${docName} 2` : pinnedLookName ? `${pinnedLookName} (mine)` : 'My look'}
          dyes={DROPPER_COLORS.slice(0, 8)}
          dye={liquidTypes.find(t => t.id === selectedLiquidId)?.color ?? DROPPER_COLORS[0]}
          onDye={(hex) => updateLiquidColor(selectedLiquidId, hex)}
          onTool={setActiveTool}
          settings={settings}
          onSetting={updateSettings}
          lookValueOf={lookValueOf}
          onZoom={pinchZoom}
          listening={audioSource !== 'none'}
          deaf={earDeaf}
          onListen={(on) => {
            /*
              Following the music is listening to the room (the stereo, for
              the person this screen is for) and letting it move the plate. A
              look whose Sound Drive is at zero would hear it and do nothing,
              which reads as a broken switch, so it is brought to the middle;
              any look with a drive of its own keeps it.
            */
            if (on && (settings.audioImpact ?? 0) < 0.05) updateSettings({ audioImpact: 0.5 });
            void handleSourceChange(on ? 'microphone' : 'none');
          }}
          wandering={isAutomated}
          onWander={setIsAutomated}
          onClear={() => setClearTrigger(n => n + 1)}
          recording={{ supported: true, on: recordingAny, seconds: recordSeconds, onToggle: toggleRecording, take: recorder.lastTake }}
          onAllControls={() => choosePhoneScreen('stage')}
          onOpenAccount={openAccount}
        />
        </PanelGuard>
      )}
      {phone && showControls && (
        <>
          {phoneScreenUp === 'stage' && (
          <PanelGuard name="The phone controls">
          <PhoneStage
            deskTabs={{
              tabs: deskTabs.tabs,
              tab: deskTab,
              onTab: setDeskTab,
              onEdit: deskTabs.edit,
              panels: openPanels(deskLayout),
              onAdd: (id) => onDeskLayout(l => openPanel(l, id, 'deck')),
              onRemove: (id) => onDeskLayout(l => closePanel(l, id)),
              render: (id) => (id === 'songs' ? songsScreen(true) : id === 'sequences' ? sequencesScreen(true) : id === 'player' ? soundScreen(true)
                : isSectionPanel(id) && id !== 'mixer' ? sectionPanel(id) : null),
            }}
            // Mid-fade the settings are between two looks and match neither,
            // so the look is named by where it is going: the name a thumb
            // just picked, not "Custom" for the two seconds of the crossfade.
            lookName={activePresetName ?? (fading > 0 ? allPresets.find(p => p.id === pinnedPresetId)?.name ?? null : null)}
            lookSwatch={swatchOf((activePresetId ?? (fading > 0 ? pinnedPresetId : null)) ?? undefined)}
            looks={phoneLooks}
            activeLookId={activePresetId ?? (fading > 0 ? pinnedPresetId : null)}
            lookSlot={phoneLookSlot}
            // A look from the phone crossfades in, as Go does on the desk: a
            // thumb in front of a room should never cut the plate to clean glass.
            onLook={(id) => goLookNow(id)}
            onRandomLook={() => {
              const pool = PRESETS.filter(p => !p.settings.macroMode && p.id !== activePresetId);
              if (pool.length) goLookNow(stream('phone.look').pick(pool).id);
            }}
            onRevert={previousLook.current ? revertLook : null}
            onSaveLook={(name) => saveCurrentPreset(name, '', false)}
            saveSuggestion={docId ? `${docName} 2` : pinnedLookName ? `${pinnedLookName} (mine)` : 'My look'}
            onBackLook={(id) => backLookNow(id)}
            backLook={backLookName}
            onBackFollowsFront={backFollowsFront}
            tool={activeTool}
            onTool={setActiveTool}
            amount={toolAmount}
            onAmount={(v) => setToolAmount(activeTool, v)}
            liquids={liquidTypes}
            selectedLiquidId={selectedLiquidId}
            dyeRoom={readDyeRoom}
            onLiquid={setSelectedLiquidId}
            dyeColors={DROPPER_COLORS}
            onDyeColor={(hex) => updateLiquidColor(selectedLiquidId, hex)}
            palettes={COLOR_HARMONIES.map((h, i) => ({ name: COLOR_HARMONY_NAMES[i], colors: h.slice(0, 4).map(pi => PALETTE[pi].hex) }))}
            paletteLock={paletteLock}
            onPalette={selectPalette}
            onImageDye={() => fileInputRef.current?.click()}
            onVideoDye={() => videoInputRef.current?.click()}
            cartoons={cartoons}
            playing={isActive}
            onPlay={() => setIsActive(v => !v)}
            evolving={isAutomated}
            onEvolve={setIsAutomated}
            evolveSpeed={settings.automateRate ?? 0}
            onEvolveSpeed={(v) => updateSettings({ automateRate: v })}
            layers={stageLayers}
            activeLayer={activeLayer}
            onLayer={setActiveLayer}
            onAddLayer={addLayer}
            onRemoveLayer={removeLayer}
            onClear={() => setClearTrigger(n => n + 1)}
            onDrain={() => setDrainTrigger(n => n + 1)}
            onSpin={() => flickPlate(activeLayer)}
            spin={{ auto: settings.spinAuto ?? 0, rpm: settings.spinRpm ?? 6, beats: settings.spinBeats ?? 16, bpm: tempoLabel.source ? tempoLabel.bpm : heardBpm, onChange: updateSettings }}
            onLucky={triggerLucky}
            zoom={settings.macroZoom ?? 1}
            onZoom={() => runAction('macro-toggle')}
            camera={settings.macroCamera ?? 'hold'}
            cameraShot={shotLabel(settings.macroHold)}
            onCamera={(c) => updateSettings({ macroCamera: c })}
            tilt={{ supported: tilt.supported, on: tilt.on, refused: tilt.refused, silent: tilt.silent, onToggle: () => { void toggleTilt(); } }}
            audioSource={audioSource}
            onAudioSource={(src) => { void handleSourceChange(src); }}
            onMusicFile={() => musicInputRef.current?.click()}
            tracks={LIBRARY}
            nowPlaying={musicFile ? { name: musicFile.name, src: musicFile.track?.src ?? null } : null}
            musicPlaying={musicPlaying}
            onToggleMusic={toggleMusic}
            onTrack={playTrack}
            soundDrive={settings.audioImpact}
            songLine={audioSource === 'none' ? '' : songLine}
            score={scoreProps}
            mapLine={followLine(musicIntel.state.follow, musicIntel.state.track?.title)}
            deaf={earDeaf}
            readLevel={readLevel}
            tempo={tempoLabel}
            onTap={tapTempo}
            {...linkProps}
            oscOut={oscOut}
            onOscOut={onOscOut}
            readTempo={readTempo}
            show={{
              running: sequencer.status.running,
              paused: !!sequencer.status.sequenceId && !sequencer.status.running,
              name: sequencer.status.name,
              // Scenes only when Pacing is up: a sequence that never sets it
              // plays its stages as it always did, with no rests or dark.
              scenes: (settings.pacing ?? 0) > 0,
              // Stop what runs, resume what is paused, and otherwise start the
              // paced night: a paused set is the performer's, not the tile's to replace.
              onToggle: () => {
                if (sequencer.status.running) sequencer.stop();
                else if (sequencer.status.sequenceId) sequencer.play();
                else sequencer.play('light-show-night');
              },
            }}
            songFollow={settings.songFollow ?? 0}
            onSongFollow={(v) => updateSettings({ songFollow: v })}
            beatAccent={settings.beatAccent ?? 0}
            onBeatAccent={(v) => updateSettings({ beatAccent: v })}
            fingering={settings.fingering ?? 0}
            onFingering={(v) => updateSettings({ fingering: v })}
            thinGap={settings.thinGap ?? 1}
            onThinGap={(v) => updateSettings({ thinGap: v })}
            pressLift={settings.plateSpring ?? 0.35}
            onPressLift={(v) => updateSettings({ plateSpring: v })}
            magnetSize={settings.magnetSize ?? 0.5}
            onMagnetSize={(v) => updateSettings({ magnetSize: v })}
            benDay={settings.benDay ?? 0}
            onBenDay={(v) => updateSettings({ benDay: v })}
            reaction={{
              on: (settings.chemistry ?? 0) > 0.001 || (settings.turingPrint ?? 0) > 0.001,
              pattern: settings.chemistryPattern ?? 0,
              width: settings.chemistryWidth ?? 0.5,
              print: settings.turingPrint ?? 0,
              ink: settings.turingInk ?? 0,
              drift: settings.turingDrift ?? 0,
            }}
            onReaction={(patch) => updateSettings(patch)}
            lampGround={settings.lampGround ?? 0}
            onLampGround={(v) => updateSettings({ lampGround: v })}
            twoProjectors={settings.twoProjectors ?? 0}
            onTwoProjectors={(v) => updateSettings({ twoProjectors: v })}
            projectorFocus={settings.projectorFocus ?? 0.5}
            onProjectorFocus={(v) => updateSettings({ projectorFocus: v })}
            clearFilm={settings.clearFilm ?? 0}
            onClearFilm={(v) => updateSettings({ clearFilm: v })}
            slosh={settings.slosh ?? 0}
            onSlosh={(v) => updateSettings({ slosh: v })}
            barLine={audioSource === 'none' ? '' : barKnown}
            onSoundDrive={(v) => updateSettings({ audioImpact: v })}
            mixer={{ settings, onSetting: updateSettings, hasFilm: filmSource !== 'none', hasMark: markLoaded, takes: mixTakes, backLook: backLookName }}
            onSettings={() => { setSettingsSection(null); setShowSettings(true); setShowHelp(false); }}
            onSongs={() => { setShowSongs(true); setShowTrackPanel(false); }}
            onGuide={() => { setShowHelp(true); setShowSettings(false); }}
            recording={{ supported: true, on: recordingAny, seconds: recordSeconds, onToggle: toggleRecording, choice: recordChoice, onChoice: setRecordChoice }}
            ambientMode={ambientMode}
            onAmbientMode={setAmbientMode}
            onHide={hideOverlays}
            onFullLayout={() => {
              try { sessionStorage.setItem(PHONE_OFF_KEY, '1'); } catch { /* private: this render only */ }
              setPhone(false);
            }}
            onPlayScreen={() => choosePhoneScreen('play')}
            onOpenAccount={openAccount}
          />
          </PanelGuard>
          )}
          {/* The song-file picker the Sound sheet reaches for; on the laptop it
              lives in the overlay's audio column, which a phone does not draw. */}
          <input ref={musicInputRef} type="file" accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac" className="hidden" data-testid="music-file-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) playMusicFile(f); }} />
        </>
      )}

      {/* ── Run-it-locally nudge (hosted build, once the governor has stepped down) ── */}
      {/* One child per AnimatePresence: it tells its children apart by key, two
          without one both read as "", and React warned on every frame the
          pair was up. The components here take no `key` in their props type. */}
      <AnimatePresence>
        {showControls && !showSettings && !isMinimized && !phone && <RunLocallyCard status={engineStatus} />}
      </AnimatePresence>
      <AnimatePresence>
        <PanelGuard name="The bench" onClose={() => setBench(b => ({ ...b, text: null }))}>
        <BenchOverlay
          running={bench.running}
          done={bench.done}
          total={bench.total}
          label={bench.label}
          text={bench.text}
          onClose={() => setBench(b => ({ ...b, text: null }))}
        />
        </PanelGuard>
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
      {overlayUp && (
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
          <PanelGuard name="Settings" onClose={() => { setShowSettings(false); setSettingsSection(null); }}>
          {settingsPanel({ onClose: () => { setShowSettings(false); setSettingsSection(null); } })}
          </PanelGuard>
        )}
      </AnimatePresence>

      {/* ── MIDI ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showActivity && overlaysVisible && (
          <PanelGuard name="MIDI activity" onClose={() => setShowActivity(false)}>
          <MidiActivity
            presets={allPresets.map(p => ({ id: p.id, name: p.name }))}
            onHide={() => setShowActivity(false)}
          />
          </PanelGuard>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showMidi && (
          <PanelGuard name="MIDI" onClose={() => setShowMidi(false)}>
          <MidiPanel
            midi={midi}
            presets={allPresets.map(p => ({ id: p.id, name: p.name }))}
            activity={showActivity}
            onActivity={setShowActivity}
            onSetup={() => openSettingsAt('midi')}
            onClose={() => setShowMidi(false)}
          />
          </PanelGuard>
        )}
      </AnimatePresence>

      {/* ── Songs ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showSound && (
          <PanelGuard name="Sound" onClose={() => setShowSound(false)}>
          {soundScreen(false)}
          </PanelGuard>
        )}
        {showSongs && (
          <PanelGuard name="Songs" onClose={() => setShowSongs(false)}>
          {songsScreen(false)}
          </PanelGuard>
        )}
      </AnimatePresence>

      {/* ── Show Sequencer ─────────────────────────────────────── */}
      <AnimatePresence>
        {showSequencer && (
          <PanelGuard name="The sequencer" onClose={() => setShowSequencer(false)}>
          {sequencesScreen(false)}
          </PanelGuard>
        )}
      </AnimatePresence>

      {/* ── Track Panel ────────────────────────────────────────── */}
      <AnimatePresence>
        {showTrackPanel && (
          <PanelGuard name="The track" onClose={() => setShowTrackPanel(false)}>
          <TrackPanel
            state={musicIntel.state}
            musicSettings={musicSettings}
            onUpdateMusicSettings={updateMusicSettings}
            onManualTag={musicIntel.manualTag}
            onReplayListen={musicIntel.replayListen}
            onStopReplay={musicIntel.stopReplay}
            performance={musicIntel.performance}
            performanceClock={perfClock}
            onOpenRecord={() => { setShowTrackPanel(false); setShowRecordPanel(true); }}
            onClose={() => setShowTrackPanel(false)}
          />
          </PanelGuard>
        )}
      </AnimatePresence>

      {/* ── The Record panel: what Record makes (Plate video, Take), and Song film ─ */}
      {showRecordPanel && (
        <PanelGuard name="Record" onClose={() => setShowRecordPanel(false)}>
        <RecordPanel
          onClose={() => setShowRecordPanel(false)}
          recorder={recorder}
          onToggleRecord={toggleRecording}
          choice={recordChoice}
          onChoice={setRecordChoice}
          performanceLive={musicIntel.performance.live}
          perfClock={perfClock}
          songFilm={musicFile ? { name: musicFile.name, running: songRender.running, onOpen: () => { setShowRecordPanel(false); setLibraryOpen(false); setRenderOpen(true); } } : null}
          savedPerformances={musicIntel.performance.saved}
          replayingPerformanceId={musicIntel.performance.replayingId}
          onReplayPerformance={musicIntel.replayPerformance}
          onStopPerformanceReplay={musicIntel.stopPerformanceReplay}
          onDeletePerformance={musicIntel.deletePerformance}
        />
        </PanelGuard>
      )}

      {/* ── Lyrics Overlay ─────────────────────────────────────── */}
      {musicSettings.enabled && musicSettings.lyricsOverlay && (
        <PanelGuard name="The lyrics">
        <LyricsOverlay
          line={musicIntel.state.line}
          sentiment={musicIntel.state.sectionSentimentValue}
        />
        </PanelGuard>
      )}

      {/* ── What stopping a performance did (lib/performanceTake.ts) ── */}
      <AnimatePresence>
        {perfNote && (
          <motion.div
            key={perfNote.at}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className={`absolute ${phone ? 'bottom-44' : 'bottom-20'} left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-purple-400/30 rounded-2xl px-5 py-3 shadow-2xl text-xs`}
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
      {overlayUp && (
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-50 pointer-events-none">
        <div className="relative flex flex-col pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-2xl">
          {/*
            The mark and the name, drawn by `npm run brand`. Smaller on a
            phone: the card shares the row with the button pill, and at 375
            wide 24px tall is what fits — any taller and the image is only
            letterboxed into the same width with empty bands above and below.
            The Alpha label sits beside the name from 640 up. On a phone it is a
            tab on the card's top edge instead: beside the name at 420 wide it
            ran out of the card and under the button pill (`npm run layout`,
            "covered; over record-button"), and under the name it made the card
            20px taller, over the bottle rail's heading.
          */}
          <span className="absolute -top-2.5 right-3 rounded bg-black sm:hidden">
            <AlphaBadge />
          </span>
          <h1 className="flex items-center gap-2">
            <img src={LOCKUP_URL} alt="ChromaGlass" className="block h-6 w-auto sm:h-10" draggable={false} />
            <AlphaBadge className="hidden sm:inline-block" />
          </h1>
          {/* The preset's name is the menu: one click from the top of the screen. */}
          <button
            onClick={() => setPresetMenu(presetMenu === 'title' ? 'none' : 'title')}
            className="flex items-center gap-2 mt-0.5 py-1.5 -mx-1 px-1 rounded-lg group"
            title="Choose a preset palette"
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
            <PanelGuard name="The look menu" onClose={() => setPresetMenu('none')}>
            <PresetMenu activePresetId={activePresetId} onApplyPreset={applyPreset} onCuePreset={cueLook} swatchOf={swatchOf} onClose={() => setPresetMenu('none')} userPresets={userPresets.presets} onApplyUserPreset={applyUserPreset} onSaveCurrent={saveCurrentPreset} onLoadFile={loadPresetFile} onExportUserPreset={userPresets.exportPreset} onDeleteUserPreset={deleteSavedLook} currentSong={currentSong} align="left" />
            </PanelGuard>
          )}
        </div>

        <div className="flex gap-2 pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-2xl">
          <button
            onClick={() => { setShowTrackPanel(!showTrackPanel); setShowSequencer(false); }}
            aria-pressed={showTrackPanel}
            data-testid="track-panel-button"
            className={`relative p-2 rounded-full transition-all ${
              showTrackPanel ? 'bg-accent text-white' : 'hover:bg-white/10 text-white/60'
            }`}
            title={musicIntel.state.track ? `${musicIntel.state.track.title} — ${musicIntel.state.track.artist}` : 'Track intelligence'}
          >
            <Music size={14} />
            {musicIntel.state.track && !showTrackPanel && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400" />
            )}
          </button>
          <button
            aria-pressed={recordingAny}
            onClick={toggleRecording}
            className={`p-2 rounded-full transition-all flex items-center gap-1 ${recordingAny ? LIVE : 'hover:bg-white/10 text-white/60'}`}
            title={recordingAny ? 'Stop recording and keep it' : `Record: ${makesText(recordChoice)} (R)`}
            data-testid="record-button"
          >
            {recordingAny ? <Square size={12} fill="currentColor" /> : <Circle size={14} />}
            {recordingAny && <span className="text-[11px] font-mono" data-testid="record-time">{clockText(recordSeconds)}</span>}
          </button>
          <div className="relative">
            <button
              onClick={() => { if (isCasting) { stopCast(); setCastMenu(false); } else setCastMenu(!castMenu); }}
              className={`p-2 rounded-full transition-all ${
                isCasting ? 'bg-ok text-bg' : castMenu ? LIT : 'hover:bg-white/10 text-white/60'
              }`}
              title={isCasting ? "Stop casting" : "Cast to display"}
              aria-pressed={isCasting}
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
          <PanelGuard name="The crash report">
          <CrashReportButton />
          </PanelGuard>
          <button
            aria-pressed={showHelp}
            onClick={() => setShowHelp(!showHelp)}
            className={`min-w-[34px] min-h-[34px] rounded-full transition-all text-[12px] font-bold ${
              showHelp ? LIT : 'hover:bg-white/10 text-white/60'
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
      {/*
        One desk, three layouts (Desk v2). Build is what the Design desk was
        (the bottles, dyes, tools and recipe round a plate in Preview), Gig
        what the Perform desk was (the cue list and the rides round the wall's
        picture), and Load-in the room and the machine. Every settings section
        can be a panel in any of them.
      */}
      {deskUp && (
        <PanelGuard name="The desk" onClose={() => deskTabs.reset(deskTab)} closeLabel="Put this tab's panels back as it shipped">
        <Desk
          bare={!overlaysVisible}
          tabs={deskTabs.tabs}
          tab={deskTab}
          onTab={(id) => { setShowSound(false); setShowSongs(false); setShowSequencer(false); setDeskTab(id); }}
          onTabEdit={deskTabs.edit}
          screens={{ songs: songsScreen(true), sequences: sequencesScreen(true), player: soundScreen(true) }}
          layout={deskLayout}
          onLayout={onDeskLayout}
          onResetLayout={onDeskReset}
          renderSection={sectionPanel}
          sheetOpen={showSettings || showStage}
          onOpenSection={openSettingsAt}
          onStage={() => { setShowStage(true); setShowSettings(false); setShowHelp(false); }}
          onRelayout={preview.remeasure}
          dots={deskDots}
          midiName={midi.activeInputName ?? null}
          onSound={deskOpen.sound}
          onVideo={deskOpen.video}
          onMidi={deskOpen.midi}
          onSearch={() => setShowPalette(true)}
          onOpenSettings={openAllSettings}
          onOpenAccount={openAccount}
          status={{
            audio: deskAudioLine,
            engine: engineStatus?.label ?? '',
            sequence: sequencer.status.running
              ? `${sequencer.status.name ?? 'sequence'}${sequencer.status.stageName ? ` · ${sequencer.status.stageName}` : ''}`
              : null,
            phone: livePhoneCount,
            rec: recordingAny ? clockText(recordSeconds) : null,
            song: audioSource === 'none' ? null : followLine(musicIntel.state.follow, musicIntel.state.track?.title),
          }}
          onBlackout={toggleBlackout}
          blackout={blackout}
          plateRef={preview.ref}
          liveName={liveLookName}
          liveFor={`${Math.floor(lookFor / 60)}:${String(Math.floor(lookFor % 60)).padStart(2, '0')}`}
          lookName={docName}
          edited={docDirty}
          dirty={docDirty}
          onSendToWall={() => sendToWallRef.current()}
          onSave={saveLook}
          onSaveOver={docId ? replaceLook : undefined}
          onNew={newLook}
          savedLooks={userPresets.presets.map(u => ({ id: u.id, name: u.name, swatch: swatchOf(u.id) }))}
          openLookId={docId}
          onOpenSaved={(id) => { const u = userPresets.presets.find(q => q.id === id); if (u) applyUserPreset(u); }}
          onDeleteSaved={deleteSavedLook}
          videoRecording={recorder.recording}
          videoSeconds={recorder.seconds}
          onToggleRecord={toggleRecording}
          recordChoice={recordChoice}
          onRecordOptions={() => setShowRecordPanel(true)}
          performance={musicIntel.performance.live ? { clock: perfClock ?? '0:00', title: musicIntel.performance.live.title } : null}
          layer={activeLayer}
          layers={stageLayers}
          onLayer={setActiveLayer}
          // Two: the compositor draws the lead plate and one behind it, and a
          // third was simulated in full — a whole solver's GPU time — and never shown.
          onAddLayer={addLayer}
          onRemoveLayer={removeLayer}
          layerHeld={backLookName}
          layerReport={layerReport}
          cues={cues}
          setName={setList.name}
          savedSets={savedSets.map(x => x.name)}
          onAddToSet={() => setAddingToSet(true)}
          onSetAction={onSetAction}
          onItemAction={onItemAction}
          songNow={currentSong ? songLabel(currentSong) : null}
          score={scoreProps}
          liveId={setActive ? liveItemId : activePresetId}
          nextId={setActive ? (cued?.item ?? null) : (cued?.id ?? null)}
          onCue={cueAny}
          onCueNow={(id) => {
            if (!setActive) { goLookNow(id); return; }
            const item = setListRef.current.items.find(i => i.id === id);
            const look = item ? lookOfItem(item) : null;
            if (look) sendLook(look, look.fade ?? fadeSeconds);
          }}
          onGo={() => goLook()}
          onGoBackPlate={() => goBackPlate()}
          backLook={backLookName}
          onBackFollowsFront={backFollowsFront}
          fade={fadeSeconds}
          onFade={setFadeSeconds}
          cuedLook={cued && !cued.item ? { id: cued.id, name: cued.name } : null}
          liveLookId={activePresetId}
          onCueSaved={cueLook}
          onSendSaved={(id) => goLookNow(id)}
          onAddSavedToSet={(id) => addToSet('saved', id)}
          onDrain={() => setDrainTrigger(v => v + 1)}
          settings={settings}
          onSetting={updateSettings}
          automated={isAutomated}
          onAutomate={setIsAutomated}
          ccFor={ccFor}
          kindFor={kindFor}
          lookValueOf={lookValueOf}
          rideKeys={rideKeys}
          onRideKeys={setRideKeys}
          recipeKeys={recipeKeys}
          onRecipeKeys={setRecipeKeys}
          onRandomise={() => { if (!luckyArmed) { setLuckyArmed(true); return; } setLuckyArmed(false); triggerLucky(); }}
          randomiseArmed={luckyArmed}
          hasFilm={filmSource !== 'none'}
          hasMark={markLoaded}
          takes={mixTakes}
          dyeBottles={liquidTypes.filter(l => !l.behaviour)}
          behaviourBottles={liquidTypes.filter(l => !!l.behaviour)}
          bottleId={selectedLiquidId}
          dyeRoom={readDyeRoom}
          onBottle={(id) => { setSelectedLiquidId(id); }}
          swatches={PALETTE.map(c => ({ hex: c.hex, name: c.name }))}
          dye={selectedLiquid?.color ?? null}
          onDye={(hex) => { updateLiquidColor(selectedLiquidId, hex); }}
          palettes={COLOR_HARMONIES.map((h, i) => ({
            name: COLOR_HARMONY_NAMES[i],
            colours: h.map(pi => PALETTE[pi]?.hex ?? '#666'),
          }))}
          paletteLock={paletteLock}
          onPalette={selectPalette}
          onImageDye={() => fileInputRef.current?.click()}
          onVideoDye={() => videoInputRef.current?.click()}
          cartoons={cartoons}
          tool={activeTool}
          onTool={(t) => setActiveTool(t as typeof activeTool)}
          toolAmount={toolAmount}
          onToolAmount={(v) => setToolAmount(activeTool, v)}
          amountOf={(t: string) => toolAmounts[t] ?? 1}
          onAmountFor={setToolAmount}
          magnetSize={settings.magnetSize ?? 0.5}
          onMagnetSize={(v) => updateSettings({ magnetSize: v })}
        />
        </PanelGuard>
      )}

      {/* ── Stage (⌘,) ─────────────────────────────────────────── */}
      {showStage && deskUp && (
        <PanelGuard name="Stage" onClose={() => setShowStage(false)}>
          {settingsPanel({ scope: 'stage', focusSection: null, onClose: () => setShowStage(false) })}
        </PanelGuard>
      )}

      {showAccount && hasAccountOrLicenseUI && (
        <AccountSheet onClose={closeProfileSheet} />
      )}

      {/* The file input the bench's Image dye button reaches for. It lives
          in the narrow-screen toolbar, which is not rendered under a desk. */}
      {(deskUp || phone) && (
        <>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
          <video ref={videoPlayerRef} className="hidden" loop muted playsInline />
        </>
      )}
      {/* The crash report, under a desk: its header has no room for a
          button that is idle nearly always, so the chip says when there is
          news and ⌘K opens the sheet. */}
      {(deskUp || phone) && <PanelGuard name="The crash report"><CrashReportButton floating /></PanelGuard>}
      {/* Gone on a clean screen: a dot on the wall is still a dot on the wall. */}
      {overlaysVisible && <PanelGuard name="The report dot"><QuickReportDot /></PanelGuard>}

      {addingToSet && (
        <PanelGuard name="Add to set" onClose={() => setAddingToSet(false)}>
        <AddToSetSheet
          looks={PRESETS.map(p => ({ id: p.id, name: p.name, swatch: swatchOf(p.id), detail: p.description }))}
          saved={userPresets.presets.map(p => ({ id: p.id, name: p.name, swatch: swatchOf(p.id), detail: p.song ? songLabel(p.song) : p.description }))}
          sequences={sequencer.sequences.map(q => ({ id: q.id, name: q.name, detail: `${q.stages.length} stage${q.stages.length === 1 ? '' : 's'}${q.song ? ` · ${songLabel(q.song)}` : ''}` }))}
          count={setList.items.length}
          onAdd={addToSet}
          onImport={importToSet}
          onClose={() => setAddingToSet(false)}
        />
        </PanelGuard>
      )}

      {showSave && (
        <PanelGuard name="Save" onClose={() => setShowSave(false)}>
        <SaveLookSheet
          suggested={docId ? `${docName} 2` : pinnedLookName ? `${pinnedLookName} (mine)` : 'My look'}
          replaceName={docId ? docName : null}
          onReplace={replaceLook}
          songName={musicIntel.state.track?.title ?? null}
          onSave={saveCurrentPreset}
          onClose={() => setShowSave(false)}
        />
        </PanelGuard>
      )}

      {/* ── ⌘K ─────────────────────────────────────────────────── */}
      {showPalette && (
        <PanelGuard name="The command palette" onClose={() => setShowPalette(false)}>
        <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />
        </PanelGuard>
      )}

      {/* ── The cued look, and the button that sends it ────────── */}
      <AnimatePresence>
        {overlayUp && (cued || fading > 0 || previousLook.current) && (
          <PanelGuard name="The cue bar" onClose={() => setCued(null)} closeLabel="Clear the cue">
          <CueBar
            cued={cued}
            liveName={liveLookName}
            liveSwatch={swatchOf(activePresetId ?? (fading > 0 ? pinnedPresetId : null) ?? undefined)}
            cuedSwatch={cued ? swatchOf(cued.id) : undefined}
            liveAt={deskLookSlot}
            fading={fading}
            fadeSeconds={fadeSeconds}
            onFadeSeconds={setFadeSeconds}
            onGo={() => goLook()}
            onCancel={() => setCued(null)}
            onRevert={previousLook.current ? revertLook : null}
          />
          </PanelGuard>
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

      {/* ── Bottom-left Profile & Store pill (when overlayUp) ──── */}
      {overlayUp && !isMinimized && showControls && openAccount && (
        <button
          type="button"
          data-cg-account-open=""
          onClick={openAccount}
          data-cg-account-signin={signedOut ? '' : undefined}
          data-cg-tier={getEffectiveTier()}
          title={signedOut ? 'Sign in' : 'Account, licence and store'}
          aria-label={signedOut ? 'Sign in' : 'Account'}
          className={`fixed bottom-6 left-6 z-30 flex min-h-[36px] items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-medium shadow-xl backdrop-blur-xl transition-all ${
            signedOut
              ? 'bg-primary text-on-primary hover:opacity-90'
              : 'border border-border-strong bg-black/75 text-text-2 hover:bg-black/90 hover:text-text'
          }`}
        >
          {signedOut ? <LogIn size={14} className="shrink-0" /> : <User size={14} className="shrink-0 text-muted" />}
          <span>{signedOut ? 'Sign in' : 'Account'}</span>
        </button>
      )}

      {/* ── Audio Meters (bottom-left, out of the way) ─────────── */}
      {isActive && audioData && !isMinimized && overlayUp && (
        <div className="absolute bottom-16 left-6 z-10 flex items-end gap-1 opacity-30 pointer-events-none">
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
