import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer, LiquidVisualizerHandle, INSECT_TYPES } from './components/LiquidVisualizer';
import { SettingsPanel } from './components/SettingsPanel';
import { Play, Pause, Mic, MicOff, Settings, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS, LiquidType, DEFAULT_LIQUID_TYPES } from './types';
import { PRESETS } from './presets';

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
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [settings, setSettings] = useState<VisualizerSettings>(() => ({ ...DEFAULT_SETTINGS }));
  const [seedCount, setSeedCount] = useState(0);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  const [liquidTypes, setLiquidTypes] = useState<LiquidType[]>(() => [...DEFAULT_LIQUID_TYPES]);
  const [selectedLiquidId, setSelectedLiquidId] = useState('water');
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow'>('dropper');

  const selectedLiquid = liquidTypes.find(t => t.id === selectedLiquidId) ?? liquidTypes[0];

  const updateLiquidColor = useCallback((id: string, color: string) => {
    setLiquidTypes(prev => prev.map(t => t.id === id ? { ...t, color } : t));
  }, []);
  const [isAutomated, setIsAutomated] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const visualizerRef = useRef<LiquidVisualizerHandle>(null);

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

  const updateSettings = (newSettings: Partial<VisualizerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const applyPreset = (presetId: string, presetSettings: Partial<VisualizerSettings>) => {
    setSettings(prev => ({ ...prev, ...presetSettings }));
    setActivePresetId(presetId);
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
    });
    setActivePresetId(null);
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
        audioData={audioData} settings={settings} seedCount={seedCount}
        selectedLiquid={selectedLiquid} activeLayer={activeLayer} clearTrigger={clearTrigger}
        activeTool={activeTool} isAutomated={isAutomated} isActive={isActive}
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
              className={`absolute top-1/2 -translate-y-1/2 left-4 z-10 flex flex-col items-start gap-4 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? '-translate-x-[150%] opacity-0' : ''}`}
            >
              <div className="flex flex-col items-center gap-3 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-4 shadow-2xl">

                {/* Auto Toggle */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Auto</span>
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

                <div className="h-px w-full bg-white/10"></div>

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

                <div className="h-px w-full bg-white/10"></div>

                {/* Drop / Blow toggle */}
                <div className="flex gap-1.5 w-full">
                  <button
                    onClick={() => setActiveTool('dropper')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border transition-all ${
                      activeTool === 'dropper'
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/40 hover:text-white'
                    }`}
                  >
                    <Droplet size={11} />
                    <span className="text-[8px] uppercase font-bold tracking-wider">Drop</span>
                  </button>
                  <button
                    onClick={() => setActiveTool('blow')}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border transition-all ${
                      activeTool === 'blow'
                        ? 'border-white/40 bg-white/15 text-white'
                        : 'border-white/10 bg-white/5 text-white/40 hover:text-white'
                    }`}
                  >
                    <Wind size={11} />
                    <span className="text-[8px] uppercase font-bold tracking-wider">Blow</span>
                  </button>
                </div>

                <div className="h-px w-full bg-white/10"></div>

                {/* Insects */}
                <div className="flex flex-col gap-1.5 w-full">
                  <span className="text-[9px] uppercase tracking-widest font-bold text-white/60">Insects</span>
                  {INSECT_TYPES.map((insect) => (
                    <button
                      key={insect.id}
                      onClick={() => visualizerRef.current?.deployInsect(insect.id)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/12 hover:border-white/25 transition-all text-left active:scale-95"
                      title={insect.description}
                    >
                      <span className="text-base leading-none">{insect.emoji}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider">{insect.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── Right Controls ──────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`absolute top-1/2 -translate-y-1/2 right-4 z-10 flex flex-col items-end gap-4 transition-all duration-300 max-h-[calc(100vh-120px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? 'translate-x-[150%] opacity-0' : ''}`}
            >
              {/* Layer Selection */}
              <div className="flex flex-col items-center gap-2 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-2 py-3 shadow-2xl">
                <div className="flex flex-col items-center gap-0.5 mb-1">
                  <Layers size={12} className="text-white/50" />
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
                <div className="w-5 h-px bg-white/20 my-1" />
                <button
                  onClick={() => setClearTrigger(prev => prev + 1)}
                  className="text-[8px] uppercase tracking-widest font-bold opacity-40 hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
                >
                  Clear
                </button>
              </div>

              {/* Main Controls */}
              <div className="bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl px-3 py-4 flex flex-col items-center gap-4 shadow-2xl">
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

                <div className="w-7 h-px bg-white/15" />

                {/* Randomize */}
                <button
                  onClick={triggerLucky}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"
                  title="Randomize all settings"
                >
                  <Sparkles size={16} className="text-yellow-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[7px] font-bold uppercase tracking-widest">Random</span>
                </button>

                <div className="w-7 h-px bg-white/15" />

                {/* Audio Sources */}
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[7px] uppercase tracking-widest font-bold opacity-30">Audio</span>
                  <button
                    onClick={() => handleSourceChange(audioSource === 'microphone' ? 'none' : 'microphone')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[8px] font-bold uppercase tracking-wider ${
                      audioSource === 'microphone'
                        ? 'text-green-400 bg-green-400/10 border border-green-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    }`}
                    title={audioSource === 'microphone' ? "Mic is active — click to mute" : "Enable microphone input"}
                  >
                    {audioSource === 'microphone' ? <Mic size={14} /> : <MicOff size={14} />}
                    <span>Mic</span>
                  </button>
                  <button
                    onClick={() => handleSourceChange(audioSource === 'system' ? 'none' : 'system')}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-full transition-all duration-300 text-[8px] font-bold uppercase tracking-wider ${
                      audioSource === 'system'
                        ? 'text-blue-400 bg-blue-400/10 border border-blue-400/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
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
            onClick={() => { setShowSettings(!showSettings); setShowHelp(false); }}
            className={`p-2 rounded-full transition-all ${
              showSettings ? 'bg-white text-black' : 'hover:bg-white/10'
            }`}
            title="Open settings"
          >
            <Settings size={16} className={showSettings ? "opacity-100" : "opacity-60"} />
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-2 rounded-full transition-all text-[9px] font-bold ${
              showHelp ? 'bg-white text-black' : 'hover:bg-white/10 text-white/60'
            }`}
            title="Keyboard shortcuts & help"
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
