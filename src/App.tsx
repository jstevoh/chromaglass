import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer, LiquidVisualizerHandle } from './components/LiquidVisualizer';
import { SettingsPanel } from './components/SettingsPanel';
import { Play, Pause, Mic, MicOff, Settings, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor, X, ImagePlus, SprayCan, Paintbrush, FlaskConical, Slash, Cast, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { PRESETS } from './presets';
import { useCastSender } from './hooks/useCastSession';
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
    return classic ? { ...DEFAULT_SETTINGS, ...classic.settings } : { ...DEFAULT_SETTINGS };
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
  const { isCasting, startCast, stopCast } = useCastSender();

  const updateLiquidColor = useCallback((id: string, color: string) => {
    setLiquidTypes(prev => prev.map(t => t.id === id ? { ...t, color } : t));
  }, []);
  const [isAutomated, setIsAutomated] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
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
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

  const audioData = useAudioAnalyzer(isActive ? audioStream : null, isActive, settings.sensitivity, settings.bassBoost);

  // ── Music intelligence ──────────────────────────────────────────
  const [showTrackPanel, setShowTrackPanel] = useState(false);
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
    setSettings(prev => ({ ...prev, ...presetSettings }));
    setActivePresetId(presetId);
    visualizerRef.current?.applyPreset(presetId);
  };

  const triggerLucky = () => {
    const blendModes: ('screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay')[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];
    const ledModes: ('single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk')[] = ['single', 'rainbow', 'ocean', 'fire', 'cyberpunk'];
    const audioFeatures: ('none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity')[] = ['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'];
    const randomFeature = () => audioFeatures[Math.floor(Math.random() * audioFeatures.length)];

    setSettings({
      sensitivity: Math.random() * 0.8 + 0.2,
      bassBoost: Math.random() * 1.5 + 0.5,
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
      glossiness: Math.random() < 0.8 ? 0 : Math.random() * 0.4,
      postBlurRadius: Math.random() * 0.7,
    });
    setActivePresetId(null);
    // Randomize inject style for the evolve
    const allStyles = ['drop', 'spray', 'splatter', 'pour', 'streak'];
    const s1 = allStyles[Math.floor(Math.random() * allStyles.length)];
    const s2 = allStyles[Math.floor(Math.random() * allStyles.length)];
    visualizerRef.current?.setInjectStyle([s1, s2]);
    setSeedCount(prev => prev + 1);
  };

  // Derive preset name for display
  const activePresetName = useMemo(() => {
    if (!activePresetId) return null;
    return PRESETS.find(p => p.id === activePresetId)?.name ?? null;
  }, [activePresetId]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      <LiquidVisualizer
        ref={visualizerRef}
        audioData={audioData} settings={effectiveSettings} seedCount={seedCount}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
        drainTrigger={drainTrigger} activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
        onManualGesture={musicIntel.recordGesture}
      />

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

      {/* ── Minimize/Maximize Toggle ───────────────────────────── */}
      <button
        onClick={() => setIsMinimized(!isMinimized)}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-black/50 hover:bg-black/70 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl text-[9px] uppercase tracking-widest font-bold text-white/50 hover:text-white/80"
        title={isMinimized ? "Show Controls" : "Hide Controls"}
      >
        {isMinimized ? <Eye size={14} /> : <EyeOff size={14} />}
        {isMinimized ? 'Show UI' : 'Hide UI'}
      </button>

      {/* ── Settings Panel ─────────────────────────────────────── */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel
            settings={settings}
            onUpdate={updateSettings}
            onApplyPreset={applyPreset}
            activePresetId={activePresetId}
            onClose={() => setShowSettings(false)}
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
        <div className="flex flex-col pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-2.5 shadow-2xl">
          <h1 className="text-2xl font-light tracking-tighter italic font-serif">
            Chroma<span className="font-bold not-italic">Glass</span>
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[9px] uppercase tracking-widest opacity-40">
              {activePresetName ? activePresetName : 'Custom'}
            </p>
            {activePresetName && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 uppercase tracking-wider font-bold">Preset</span>
            )}
          </div>
        </div>

        <div className="flex gap-2 pointer-events-auto bg-black/50 backdrop-blur-xl border border-white/10 rounded-full p-1.5 shadow-2xl">
          <button
            onClick={() => setShowTrackPanel(!showTrackPanel)}
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
          <button
            onClick={() => isCasting ? stopCast() : startCast()}
            className={`p-2 rounded-full transition-all ${
              isCasting ? 'bg-blue-500 text-white' : 'hover:bg-white/10 text-white/60'
            }`}
            title={isCasting ? "Stop casting" : "Cast to display"}
          >
            <Cast size={14} />
          </button>
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
  );
}
