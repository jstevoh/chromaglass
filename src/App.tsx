import React, { useState, useEffect, useCallback } from 'react';
import { useAudioAnalyzer } from './hooks/useAudioAnalyzer';
import { LiquidVisualizer } from './components/LiquidVisualizer';
import { SettingsPanel } from './components/SettingsPanel';
import { Play, Pause, Mic, MicOff, Settings, Info, Sparkles, Droplet, Layers, Wind, Eye, EyeOff, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VisualizerSettings, DEFAULT_SETTINGS } from './types';
import { PRESETS } from './presets';
import { DROPPER_COLORS } from './constants';

type AudioSource = 'none' | 'microphone' | 'system';

export default function App() {
  const [isActive, setIsActive] = useState(true);
  const [audioSource, setAudioSource] = useState<AudioSource>('microphone');
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<VisualizerSettings>(() => {
    const randomPreset = PRESETS[Math.floor(Math.random() * PRESETS.length)];
    return { ...DEFAULT_SETTINGS, ...randomPreset.settings };
  });
  const [seedCount, setSeedCount] = useState(0);
  const [clearTrigger, setClearTrigger] = useState(0);
  const [activeLayer, setActiveLayer] = useState(0);
  const [selectedColor, setSelectedColor] = useState(DROPPER_COLORS[0]);
  const [activeTool, setActiveTool] = useState<'dropper' | 'blow'>('dropper');
  const [isAutomated, setIsAutomated] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);

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

      // Handle user stopping the stream via browser UI
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

  // Initial microphone setup
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

  const toggleActive = () => {
    setIsActive(!isActive);
  };

  const updateSettings = (newSettings: Partial<VisualizerSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
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
      audioMappings: {
        velocity: randomFeature(),
        density: randomFeature(),
        color: randomFeature(),
        rotation: randomFeature(),
        bubbles: randomFeature(),
      },
      platePressure: Math.random(),
      glassSmear: Math.random(),
      rainDrip: Math.random(),
      viscosity: Math.random() > 0.5 ? 'thick' : 'thin',
      polarity: Math.random(),
      heatIntensity: Math.random() * 0.5,
      boilingPoint: Math.random(),
      evaporationRate: Math.random() * 0.05,
      airVelocity: Math.random() * 0.5,
      vibrationFrequency: Math.random(),
      layerCount: Math.floor(Math.random() * 4) + 1,
      blendMode: blendModes[Math.floor(Math.random() * blendModes.length)],
      gooeyEffect: Math.random(),
      rotationSpeed: Math.random() * 0.1,
      centerGravity: Math.random(),
      ledPlatform: Math.random() > 0.5,
      ledMode: ledModes[Math.floor(Math.random() * ledModes.length)],
      ledColor: DROPPER_COLORS[Math.floor(Math.random() * DROPPER_COLORS.length)],
      ledSpeed: Math.random() * 0.5,
      surfaceTension: Math.random() * 0.2,
      diffusionRate: Math.random() * 0.002,
      buoyancy: Math.random(),
      advection: Math.random() * 0.8 + 0.2,
      damping: Math.random() * 0.1 + 0.9,
      heatDecay: Math.random() * 0.1 + 0.9,
      automateRate: Math.random() * 0.2,
      bubbleAmount: Math.random(),
      bubbleBaseSize: Math.random() * 20 + 5,
      bubbleSizeVariance: Math.random() * 15 + 2,
    });
    setSeedCount(prev => prev + 1);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white">
      {/* The Visualizer */}
      <LiquidVisualizer 
        audioData={audioData} 
        settings={settings} 
        seedCount={seedCount} 
        selectedColor={selectedColor}
        activeLayer={activeLayer}
        clearTrigger={clearTrigger}
        activeTool={activeTool}
        isAutomated={isAutomated}
        isActive={isActive}
      />

      {/* UI Overlay */}
      <AnimatePresence>
        {showControls && !showSettings && (
          <>
            {/* Left Controls */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`absolute top-1/2 -translate-y-1/2 left-6 z-10 flex flex-col items-start gap-6 transition-all duration-300 max-h-[calc(100vh-160px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? '-translate-x-[150%] opacity-0' : ''}`}
            >
              {/* Dropper / Blow Tool Selection */}
              <div className="flex flex-col items-center gap-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl px-3 py-5 shadow-2xl">
                
                {/* Auto Toggle */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/70">Auto</span>
                  <button
                    onClick={() => setIsAutomated(!isAutomated)}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-300 ${isAutomated ? 'bg-purple-500' : 'bg-white/20'}`}
                    title="Toggle Automation"
                  >
                    <motion.div
                      className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow-md"
                      animate={{ x: isAutomated ? 24 : 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  </button>
                </div>

                <div className="h-px w-full bg-white/10 my-1"></div>

                {/* Tool Toggle (Drop / Blow) */}
                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-white/70">Tool</span>
                  <div className="flex flex-col bg-white/10 rounded-full p-1 relative w-full justify-between">
                    <motion.div
                      className="absolute top-1 left-1 right-1 h-[calc(50%-4px)] bg-white/20 rounded-full"
                      animate={{ y: activeTool === 'dropper' ? 0 : '100%' }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                    <button
                      onClick={() => setActiveTool('dropper')}
                      className={`relative z-10 flex-1 flex justify-center items-center py-3 transition-colors ${activeTool === 'dropper' ? 'text-white' : 'text-white/50 hover:text-white'}`}
                      title="Dropper Tool"
                    >
                      <Droplet size={14} />
                    </button>
                    <button
                      onClick={() => setActiveTool('blow')}
                      className={`relative z-10 flex-1 flex justify-center items-center py-3 transition-colors ${activeTool === 'blow' ? 'text-white' : 'text-white/50 hover:text-white'}`}
                      title="Blow Tool (Straw)"
                    >
                      <Wind size={14} />
                    </button>
                  </div>
                </div>
                
                <div className="h-px w-full bg-white/10 my-1"></div>

                {/* Color Palette (only show if dropper is active) */}
                <div className={`grid grid-cols-2 gap-2 transition-opacity duration-300 ${activeTool === 'dropper' ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                {DROPPER_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${
                      selectedColor === color ? 'border-white scale-125 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-transparent opacity-50 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right Controls */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className={`absolute top-1/2 -translate-y-1/2 right-6 z-10 flex flex-col items-end gap-6 transition-all duration-300 max-h-[calc(100vh-160px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${isMinimized ? 'translate-x-[150%] opacity-0' : ''}`}
            >
              {/* Layer Selection */}
              <div className="flex flex-col items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl px-2 py-4 shadow-2xl">
              <div className="flex flex-col items-center gap-1 mb-2">
                <Layers size={14} className="text-white/50" />
                <span className="text-[8px] uppercase tracking-widest font-bold opacity-50">Plate</span>
              </div>
              <div className="flex flex-col gap-2">
                {Array.from({ length: settings.layerCount }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveLayer(idx)}
                    className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold ${
                      activeLayer === idx ? 'border-white bg-white text-black scale-110 shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'border-white/20 text-white/50 hover:border-white/50'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
              <div className="w-6 h-px bg-white/20 my-2" />
              <button
                onClick={() => setClearTrigger(prev => prev + 1)}
                className="text-[8px] uppercase tracking-widest font-bold opacity-50 hover:opacity-100 transition-opacity text-red-400 hover:text-red-300"
              >
                Clear
              </button>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl px-3 py-6 flex flex-col items-center gap-6 shadow-2xl">
              <button
                onClick={toggleActive}
                className={`p-4 rounded-full transition-all duration-300 ${
                  isActive 
                    ? 'bg-red-500 hover:bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.5)]' 
                    : 'bg-white hover:bg-gray-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                }`}
                title={isActive ? "Stop Visualizer" : "Start Visualizer"}
              >
                {isActive ? <Pause size={24} /> : <Play size={24} fill="currentColor" />}
              </button>

              <div className="w-8 h-px bg-white/20" />

              <button
                onClick={triggerLucky}
                className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all group"
                title="I'm Feeling Lucky (Randomize Settings)"
              >
                <Sparkles size={18} className="text-yellow-400 group-hover:scale-110 transition-transform" />
                <span className="text-[8px] font-bold uppercase tracking-widest">Lucky</span>
              </button>

              <div className="w-8 h-px bg-white/20" />

              <div className="flex flex-col items-center gap-2">
                <button 
                  onClick={() => handleSourceChange(audioSource === 'microphone' ? 'none' : 'microphone')}
                  className={`p-2 rounded-full transition-all duration-300 ${audioSource === 'microphone' ? 'text-green-400 hover:bg-white/10' : 'text-gray-400 hover:bg-white/10'}`}
                  title={audioSource === 'microphone' ? "Stop Microphone" : "Start Microphone"}
                >
                  {audioSource === 'microphone' ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button 
                  onClick={() => handleSourceChange(audioSource === 'system' ? 'none' : 'system')}
                  className={`p-2 rounded-full transition-all duration-300 ${audioSource === 'system' ? 'text-blue-400 hover:bg-white/10' : 'text-gray-400 hover:bg-white/10'}`}
                  title={audioSource === 'system' ? "Stop System Audio" : "Start System Audio"}
                >
                  <Monitor size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>

      {/* Minimize/Maximize Toggle */}
      <button
        onClick={() => setIsMinimized(!isMinimized)}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 p-3 bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/10 rounded-full transition-all shadow-2xl"
        title={isMinimized ? "Show Controls" : "Hide Controls"}
      >
        {isMinimized ? <Eye size={20} /> : <EyeOff size={20} />}
      </button>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <SettingsPanel 
            settings={settings} 
            onUpdate={updateSettings} 
            onClose={() => setShowSettings(false)} 
          />
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div className="absolute top-8 left-8 right-8 flex justify-between items-start z-50 pointer-events-none">
        <div className="flex flex-col pointer-events-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
          <h1 className="text-3xl font-light tracking-tighter italic font-serif">
            Chroma<span className="font-bold not-italic">Glass</span>
          </h1>
          <p className="text-[10px] uppercase tracking-widest opacity-50 mt-1">
            Psychedelic Audio Feedback
          </p>
        </div>

        <div className="flex gap-4 pointer-events-auto bg-black/40 backdrop-blur-xl border border-white/10 rounded-full p-2 shadow-2xl">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-full transition-all ${
              showSettings 
                ? 'bg-white text-black' 
                : 'hover:bg-white/10'
            }`}
          >
            <Settings size={18} className={showSettings ? "opacity-100" : "opacity-70"} />
          </button>
          <button className="p-2 rounded-full hover:bg-white/10 transition-colors">
            <Info size={18} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* Audio Reactive Stats (Subtle) */}
      {isActive && audioData && (
        <div className={`absolute top-1/2 right-24 -translate-y-1/2 flex flex-col gap-8 opacity-20 pointer-events-none transition-all duration-300 ${isMinimized ? 'right-8' : 'right-24'}`}>
          <div className="flex flex-col items-end">
            <span className="text-[8px] uppercase tracking-widest mb-2">Bass</span>
            <div className="w-1 h-32 bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                className="w-full bg-white"
                animate={{ height: `${Math.min(100, audioData.bass)}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] uppercase tracking-widest mb-2">Mid</span>
            <div className="w-1 h-32 bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                className="w-full bg-white"
                animate={{ height: `${Math.min(100, audioData.mid)}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] uppercase tracking-widest mb-2">Treble</span>
            <div className="w-1 h-32 bg-white/20 rounded-full overflow-hidden">
              <motion.div 
                className="w-full bg-white"
                animate={{ height: `${Math.min(100, audioData.treble)}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vh] bg-blue-500/5 blur-[120px] rounded-full" />
        <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vh] bg-purple-500/5 blur-[100px] rounded-full" />
      </div>
    </div>
  );
}
