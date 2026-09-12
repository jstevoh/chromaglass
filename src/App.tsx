import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer, LiquidVisualizerHandle } from './components/LiquidVisualizer';
import { SettingsPanel } from './components/SettingsPanel';
import { Play, Pause, Mic, MicOff, Settings, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor, MonitorOff, X, ImagePlus, SprayCan, Paintbrush, FlaskConical, Slash, Cast, Music, Microscope, Clapperboard, ChevronDown, LayoutGrid } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { PRESETS } from './presets';
import { useCastSender } from './hooks/useCastSession';
import { useRemoteLink } from './hooks/useRemoteLink';
import type { RemoteState } from './lib/remoteProtocol';
import type { CastState } from './lib/castProtocol';
import type { EngineStatus } from './lib/platform';
import { RunLocallyCard } from './components/RunLocallyCard';
import { SequencerPanel } from './components/SequencerPanel';
import { PresetMenu } from './components/PresetMenu';
import { useShowSequencer } from './hooks/useShowSequencer';
import { useSongChange } from './hooks/useSongChange';
import { useMusicIntelligence } from './hooks/useMusicIntelligence';
import { MusicSettings, DEFAULT_MUSIC_SETTINGS } from './lib/musicTypes';
import { COLOR_HARMONIES, COLOR_HARMONY_NAMES, PALETTE, DROPPER_COLORS } from './constants';
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

type AudioSource = 'none' | 'microphone' | 'system';

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
  const [audioSource, setAudioSource] = useState<AudioSource>('microphone');
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [activePresetId, setActivePresetId] = useState<string | null>('classic');
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
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow' | 'spray' | 'splatter' | 'pour' | 'streak'>('dropper');

  const selectedLiquid = liquidTypes.find(t => t.id === selectedLiquidId) ?? liquidTypes[0];

  // ── Cast ──
  // The receiver runs its own visualizer; it is fed a snapshot of the show
  // when it connects and every change after. The callback lives in a ref
  // because the state it snapshots is declared further down.
  const castReadyRef = useRef<() => void>(() => {});
  const { isCasting, startCast, stopCast, send: castSend } = useCastSender(() => castReadyRef.current());
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

  // Track active preset whenever settings change.
  useEffect(() => {
    setActivePresetId(detectActivePreset(settings));
  }, [settings]);

  // Set the initial active preset on mount.
  useEffect(() => {
    setActivePresetId(detectActivePreset(settings));
  }, []);

  const handleSourceChange = useCallback(async (source: AudioSource) => {
    if (audioStream) {
      audioStream.getTracks().forEach(track => track.stop());
      setAudioStream(null);
    }

    setAudioSource(source);
    if (source === 'none') return;

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
          },
        };
        try {
          stream = await navigator.mediaDevices.getUserMedia(raw);
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
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
  }, [audioStream]);

  useEffect(() => {
    if (audioSource === 'microphone' && !audioStream) {
      handleSourceChange('microphone');
    }
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
  const audioData = useAudioAnalyzer(
    isActive ? audioStream : null, isActive,
    settings.sensitivity, settings.bassBoost,
    settings.autoCalibrate !== false, calibrateNonce,
  );

  // ── Music intelligence ──────────────────────────────────────────
  const [showTrackPanel, setShowTrackPanel] = useState(false);
  const [showSequencer, setShowSequencer] = useState(false);
  const [presetMenu, setPresetMenu] = useState<'none' | 'title' | 'toolbar'>('none');
  const [castMenu, setCastMenu] = useState(false);
  const presetAnchorRef = useRef<{ top: number; left: number } | null>(null);
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

  // Switch to the track's chosen preset when a song is identified
  useEffect(() => {
    if (musicIntel.presetPick && musicSettings.autoPreset) {
      const preset = PRESETS.find(p => p.id === musicIntel.presetPick!.presetId);
      if (preset) applyPreset(preset.id, preset.settings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicIntel.presetPick?.seq]);

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
    setSettings(prev => ({ ...prev, macroMode: false, renderStyle: 'show', ...presetSettings }));
    setActivePresetId(presetId);
    setPresetSeq(n => n + 1);
    visualizerRef.current?.applyPreset(presetId);
  };

  /** The sequencer's stage change: the preset's dyes and style, the plate kept. */
  const adoptPreset = useCallback((presetId: string) => {
    setActivePresetId(presetId);
    visualizerRef.current?.adoptPreset(presetId);
  }, []);

  // ── Show sequencer ────────────────────────────────────────────────
  // The settings it reads come from a ref so the 250 ms tick never sees a
  // stale closure; the patches it writes go through updateSettings like any
  // slider, so the phone and the panel show the glide as it happens.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const sequencer = useShowSequencer({
    getSettings: () => settingsRef.current,
    applySettings: (patch) => setSettings(prev => ({ ...prev, ...patch })),
    adoptPreset,
    setPaletteWindow: (size, lead) => visualizerRef.current?.setPaletteWindow(size, lead),
    sectionLabel: musicIntel.state.section?.label ?? null,
    isActive,
  });

  const triggerLucky = () => {
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
    setActivePresetId(null);
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
  const sendCastState = useCallback(() => castSend({ type: 'state', state: castState }), [castSend, castState]);
  castReadyRef.current = sendCastState;
  useEffect(() => { if (isCasting) sendCastState(); }, [isCasting, sendCastState]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { chromaglassCastState?: unknown }).chromaglassCastState = () => ({ isCasting, castState, audio: audioData, songChange });
    }
  }, [isCasting, castState, audioData, songChange]);
  // The audio bands, thirty times a second — the raw spectrum stays here.
  const lastCastAudioRef = useRef(0);
  useEffect(() => {
    if (!isCasting) return;
    const now = performance.now();
    if (now - lastCastAudioRef.current < 33) return;
    lastCastAudioRef.current = now;
    castSend({
      type: 'audio',
      audio: audioData ? {
        volume: audioData.volume, bass: audioData.bass, mid: audioData.mid, treble: audioData.treble,
        energy: audioData.energy, spectralCentroid: audioData.spectralCentroid, timbre: audioData.timbre, complexity: audioData.complexity,
      } : null,
    });
  }, [audioData, isCasting, castSend]);

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
  }), [settings, activePresetId, isActive, isAutomated, overlaysVisible, musicIntel.state.track?.title, sequencer.status]);

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

  useRemoteLink({
    role: 'display',
    state: remoteState,
    onMessage: (message) => {
      switch (message.type) {
        case 'patch':
          queuePatch(message.settings);
          break;
        case 'preset': {
          const preset = PRESETS.find(p => p.id === message.presetId);
          if (preset) applyPreset(preset.id, preset.settings);
          break;
        }
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
          }
          break;
        case 'blow':
          visualizerRef.current?.applyGesture({ tool: 'blow', x: message.x, y: message.y, layer: message.layer });
          break;
        case 'drop':
          visualizerRef.current?.applyGesture({ tool: 'drop', x: message.x, y: message.y, layer: message.layer });
          break;
        case 'tilt':
          visualizerRef.current?.setExternalTilt(message.x, message.y);
          break;
      }
    },
  });

  // Derive preset name for display
  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    return PRESETS.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId]);

  return (
    <div className={`relative w-full h-screen bg-black overflow-hidden font-sans text-white ${overlaysVisible ? '' : 'overlays-hidden'}`}>
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audioData} settings={effectiveSettings} seedCount={seedCount}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
        drainTrigger={drainTrigger} activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
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

      {/* ── Clean-screen hint: the one thing shown after everything is hidden ── */}
      <AnimatePresence>
        {!overlaysVisible && showCleanHint && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 1.2 } }}
            className="pointer-events-none absolute bottom-8 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white/60 backdrop-blur-xl"
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

                {/* Liquid Type Selector — always visible */}
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Liquid</span>
                  {liquidTypes.map((liq) => {
                    const isSelected = liq.id === selectedLiquidId;
                    return (
                      <button
                        key={liq.id}
                        onClick={() => { setSelectedLiquidId(liq.id); setActiveTool('dropper'); }}
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
                        <span className="text-[10px] font-bold uppercase tracking-wider flex-1">{liq.name}</span>
                        {isSelected && (
                          <label className="relative cursor-pointer flex-shrink-0" onClick={e => e.stopPropagation()} title="Change color">
                            <span className="text-[9px] text-white/40 hover:text-white transition-colors px-1">color</span>
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

                {/* Quick color swatches — one click recolors the selected liquid */}
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Dye Color</span>
                  <div className="grid grid-cols-8 gap-1">
                    {DROPPER_COLORS.map(hex => {
                      const isCurrent = selectedLiquid?.color.toLowerCase() === hex.toLowerCase();
                      return (
                        <button
                          key={hex}
                          onClick={() => updateLiquidColor(selectedLiquidId, hex)}
                          className={`w-5 h-5 rounded-full border transition-transform hover:scale-125 ${
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
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Palette</span>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                    <button
                      onClick={() => selectPalette(null)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-all ${
                        paletteLock == null ? 'border-white/40 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/50 hover:text-white'
                      }`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-wider flex-1">Auto</span>
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
                        <span className="text-[9px] font-bold uppercase tracking-wider truncate">{COLOR_HARMONY_NAMES[idx]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px w-full bg-white/10"></div>

                {/* Tools */}
                <div className="flex flex-col gap-1 w-full">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Tools</span>
                  <div className="grid grid-cols-3 gap-1 w-full">
                    {([
                      { id: 'dropper' as const, icon: Droplet, label: 'Drop' },
                      { id: 'spray' as const, icon: SprayCan, label: 'Spray' },
                      { id: 'splatter' as const, icon: Paintbrush, label: 'Splat' },
                      { id: 'pour' as const, icon: FlaskConical, label: 'Pour' },
                      { id: 'streak' as const, icon: Slash, label: 'Streak' },
                      { id: 'blow' as const, icon: Wind, label: 'Blow' },
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

                <div className="w-full h-px bg-white/10" />

                {/* Sound Drive */}
                <div className="flex flex-col items-center gap-2 w-full">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[8px] uppercase tracking-widest font-bold text-white/40">Sound Drive</span>
                    <span className="text-[8px] font-bold text-white/50">{Math.round(settings.audioImpact * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={settings.audioImpact}
                    onChange={e => updateSettings({ audioImpact: parseFloat(e.target.value) })}
                    className="w-full h-1 appearance-none rounded-full cursor-pointer accent-purple-400"
                    style={{ background: `linear-gradient(to right, rgb(192,132,252) ${settings.audioImpact * 100}%, rgba(255,255,255,0.1) ${settings.audioImpact * 100}%)` }}
                    title="Controls how strongly sound impacts the visuals"
                  />
                </div>

                <div className="w-full h-px bg-white/10" />

                {/* Random Evolve */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <span className="text-[8px] uppercase tracking-widest font-bold text-white/40">Random Evolve</span>
                  <button
                    onClick={() => setIsAutomated(!isAutomated)}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${isAutomated ? 'bg-purple-500' : 'bg-white/20'}`}
                    title="Auto-generate dye drops and air bursts from audio"
                  >
                    <motion.div
                      className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md"
                      animate={{ x: isAutomated ? 20 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                <div className="w-full h-px bg-white/10" />

                {/* Presets */}
                <div className="relative w-full">
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      presetAnchorRef.current = { top: r.top, left: r.left };
                      setPresetMenu(presetMenu === 'toolbar' ? 'none' : 'toolbar');
                    }}
                    className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all group w-full ${
                      presetMenu === 'toolbar' ? 'bg-white text-black border-white' : 'bg-white/5 hover:bg-white/10 border-white/10'
                    }`}
                    title="Presets — every look, one click away"
                    aria-haspopup="menu"
                    aria-expanded={presetMenu === 'toolbar'}
                    data-testid="preset-toolbar-button"
                  >
                    <LayoutGrid size={16} className={presetMenu === 'toolbar' ? '' : 'opacity-60 group-hover:opacity-100'} />
                    <span className="text-[7px] font-bold uppercase tracking-widest">Presets</span>
                  </button>
                  {presetMenu === 'toolbar' && (
                    <PresetMenu activePresetId={activePresetId} onApplyPreset={applyPreset} onClose={() => setPresetMenu('none')} align="side" anchor={presetAnchorRef.current} />
                  )}
                </div>

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

                {/* Randomize */}
                <button
                  onClick={triggerLucky}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group w-full"
                  title="Randomize all settings"
                >
                  <Sparkles size={16} className="text-yellow-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Random</span>
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
                        className={`w-7 h-7 rounded-full border-2 transition-all flex items-center justify-center text-[10px] font-bold ${
                          activeLayer === idx ? 'border-white bg-white text-black scale-110 shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'border-white/20 text-white/50 hover:border-white/50'
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setDrainTrigger(prev => prev + 1)}
                    className="text-[8px] uppercase tracking-widest font-bold opacity-40 hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
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
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[8px] font-bold uppercase tracking-wider w-full justify-center ${
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
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[8px] font-bold uppercase tracking-wider w-full justify-center ${
                      audioSource === 'system'
                        ? 'text-blue-400 bg-blue-400/10 border border-blue-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5 border border-transparent'
                    }`}
                    title={audioSource === 'system' ? "System audio active — click to stop" : "Capture system/tab audio"}
                  >
                    <Monitor size={14} />
                    <span>System</span>
                  </button>
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
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[9px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
          title={isMinimized ? "Show Controls" : "Hide Controls"}
        >
          {isMinimized ? <Eye size={14} /> : <EyeOff size={14} />}
          {isMinimized ? 'Show UI' : 'Hide UI'}
        </button>
        <button
          onClick={hideOverlays}
          className="flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[9px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
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
            onApplyPreset={applyPreset}
            activePresetId={activePresetId}
            calibration={audioData?.calibration ?? null}
            onRecalibrate={() => setCalibrateNonce(n => n + 1)}
            engineStatus={engineStatus}
            getLiveEngineStatus={() => engineStatusRef.current}
            filmSource={filmSource}
            onFilmFile={loadFilm}
            onFilmCamera={startFilmCamera}
            onFilmClear={clearFilm}
            onClose={() => setShowSettings(false)}
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
              className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-[10px] font-bold uppercase tracking-widest transition-colors"
            >
              Save
            </button>
            <button
              onClick={musicIntel.discardPendingPerformance}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-widest text-white/60 transition-colors"
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
            className="flex items-center gap-2 mt-0.5 group"
            title="Choose a preset"
            aria-haspopup="menu"
            aria-expanded={presetMenu === 'title'}
            data-testid="preset-title-button"
          >
            <p className="text-[9px] uppercase tracking-widest opacity-40 group-hover:opacity-80 transition-opacity">
              {activePresetName ? activePresetName : 'Custom'}
            </p>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 uppercase tracking-wider font-bold flex items-center gap-1 group-hover:bg-white/20 transition-colors">
              Preset <ChevronDown size={9} />
            </span>
          </button>
          {presetMenu === 'title' && (
            <PresetMenu activePresetId={activePresetId} onApplyPreset={applyPreset} onClose={() => setPresetMenu('none')} align="left" />
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
                  <div className="text-[10px] opacity-50 leading-snug mt-0.5">Opens the show in its own window, placed on a second screen if one is plugged in. Click it once for fullscreen.</div>
                </button>
                <button
                  role="menuitem"
                  onClick={() => { setCastMenu(false); startCast('device'); }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10"
                  data-testid="cast-device"
                >
                  <div className="text-xs font-semibold">Chromecast</div>
                  <div className="text-[10px] opacity-50 leading-snug mt-0.5">Chrome's device picker. If it lists nothing, no cast device was found on this network.</div>
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-2 rounded-full transition-all text-[9px] font-bold ${
              showHelp ? 'bg-white text-black' : 'hover:bg-white/10 text-white/60'
            }`}
            title="Help"
          >
            ?
          </button>
        </div>
      </div>

      {/* ── Help Overlay ───────────────────────────────────────── */}
      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-20 right-6 z-50 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl w-72"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">How to use</h3>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/10 rounded-full">
                <X size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-3 text-[11px] text-white/70 leading-relaxed">
              <div>
                <span className="text-white/90 font-bold">Click & drag</span> on the canvas to interact with the fluid. Use the <span className="text-white/90">Drop</span> tool to add color, or <span className="text-white/90">Blow</span> to push air through the liquid.
              </div>
              <div>
                <span className="text-white/90 font-bold">Auto mode</span> generates drops and airflow driven by the audio input.
              </div>
              <div>
                <span className="text-white/90 font-bold">Layers</span> are independent fluid simulations composited together. Switch layers to paint on different planes.
              </div>
              <div>
                <span className="text-white/90 font-bold">Presets</span> are in the <Settings size={11} className="inline" /> settings panel. Tweak any slider to customize.
              </div>
              <div>
                <span className="text-white/90 font-bold">Random</span> <Sparkles size={11} className="inline text-yellow-400" /> shuffles all parameters for happy accidents.
              </div>
            </div>
          </motion.div>
        )}
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
