import React from 'react';
import { motion } from 'motion/react';
import { X, Sliders, Zap, Thermometer, Wind, Layers, Activity, Sparkles, Palette } from 'lucide-react';
import { VisualizerSettings, BlendMode, LedMode } from '../types';
import { PRESETS } from '../presets';

interface SettingsPanelProps {
  settings: VisualizerSettings;
  onUpdate: (settings: Partial<VisualizerSettings>) => void;
  onApplyPreset: (presetId: string, settings: Partial<VisualizerSettings>) => void;
  activePresetId: string | null;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, onApplyPreset, activePresetId, onClose }) => {
  const blendModes: BlendMode[] = ['screen', 'lighter', 'exclusion', 'multiply', 'overlay'];

  const Slider = ({ label, value, min, max, step, onChange, icon: Icon }: any) => {
    const safeValue = value ?? 0;
    return (
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-70">
            {Icon && <Icon size={14} />}
            {label}
          </div>
          <span className="text-[10px] font-mono opacity-50">{safeValue.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={safeValue}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white hover:accent-gray-300 transition-all"
        />
      </div>
    );
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed top-0 right-0 w-80 h-full bg-black/80 backdrop-blur-xl border-l border-white/10 z-40 overflow-y-auto p-8 pt-28 scrollbar-hide"
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold tracking-tighter italic">Projector <span className="not-italic">Settings</span></h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Presets Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Palette size={12} /> Presets
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                onClick={() => onApplyPreset(preset.id, preset.settings)}
                className={`flex flex-col items-start p-2 border rounded-lg transition-all text-left group ${
                  isActive
                    ? 'bg-white/15 border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.1)]'
                    : 'bg-white/5 hover:bg-white/10 border-white/10'
                }`}
                title={preset.description}
              >
                <div className="flex items-center gap-1 mb-1 w-full">
                  <span className={`text-xs font-bold transition-colors flex-1 ${isActive ? 'text-white' : 'group-hover:text-white text-white/80'}`}>{preset.name}</span>
                  {isActive && <span className="text-[7px] px-1 py-0.5 rounded bg-white/20 text-white font-bold uppercase tracking-wider shrink-0">ON</span>}
                </div>
                <span className="text-[9px] opacity-50 line-clamp-2 leading-tight">{preset.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Sound Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Activity size={12} /> Audio Input
        </h3>
        <Slider
          label="Sensitivity"
          value={settings.sensitivity}
          min={0.1}
          max={3.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ sensitivity: v })}
        />
        <Slider
          label="Bass Boost"
          value={settings.bassBoost}
          min={1.0}
          max={3.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ bassBoost: v })}
        />
        <Slider
          label="Global Speed"
          value={settings.globalSpeed}
          min={0.0}
          max={1.0}
          step={0.001}
          onChange={(v: number) => onUpdate({ globalSpeed: v })}
        />
      </section>

      {/* Audio Mappings Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Activity size={12} /> Audio Mappings
        </h3>
        
        {['velocity', 'density', 'color', 'rotation', 'bubbles'].map((param) => (
          <div key={param} className="flex flex-col gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">{param}</span>
            <select
              value={settings.audioMappings[param as keyof typeof settings.audioMappings]}
              onChange={(e) => onUpdate({
                audioMappings: {
                  ...settings.audioMappings,
                  [param]: e.target.value
                }
              })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] uppercase tracking-widest focus:outline-none focus:border-white/30 transition-all"
            >
              {['none', 'volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity'].map((feature) => (
                <option key={feature} value={feature} className="bg-gray-900">
                  {feature}
                </option>
              ))}
            </select>
          </div>
        ))}
      </section>

      {/* Squish Plate Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Sliders size={12} /> Squish Plate
        </h3>
        <Slider
          label="Plate Pressure"
          value={settings.platePressure}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ platePressure: v })}
        />
        <Slider
          label="Glass Smear"
          value={settings.glassSmear}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glassSmear: v })}
        />
        <Slider
          label="Rain Drip"
          value={settings.rainDrip}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rainDrip: v })}
        />
        <div className="flex flex-col gap-2 mb-4">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Viscosity</span>
          <div className="flex gap-2 p-1 bg-white/5 rounded-lg">
            {(['thick', 'thin'] as const).map((v) => (
              <button
                key={v}
                onClick={() => onUpdate({ viscosity: v })}
                className={`flex-1 py-1 text-[10px] uppercase tracking-widest rounded-md transition-all ${
                  settings.viscosity === v ? 'bg-white text-black font-bold' : 'hover:bg-white/5 opacity-50'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Polarity (Repulsion)"
          value={settings.polarity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ polarity: v })}
        />
      </section>

      {/* Heat Slide Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Thermometer size={12} /> Heat Slide
        </h3>
        <Slider
          label="Heat Intensity"
          value={settings.heatIntensity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ heatIntensity: v })}
        />
        <Slider
          label="Boiling Point"
          value={settings.boilingPoint}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ boilingPoint: v })}
        />
        <Slider
          label="Evaporation Rate"
          value={settings.evaporationRate}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ evaporationRate: v })}
        />
        <Slider
          label="Heat Decay"
          value={settings.heatDecay}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ heatDecay: v })}
        />
      </section>

      {/* Manual Interaction Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Wind size={12} /> Manual Interaction
        </h3>
        <Slider
          label="Blow Velocity"
          value={settings.airVelocity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ airVelocity: v })}
        />
        <Slider
          label="Vibration Freq"
          value={settings.vibrationFrequency}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ vibrationFrequency: v })}
        />
      </section>

      {/* Fluid Physics Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Zap size={12} /> Fluid Physics
        </h3>
        <Slider
          label="Bubble Amount"
          value={settings.bubbleAmount}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ bubbleAmount: v })}
        />
        <Slider
          label="Bubble Base Size"
          value={settings.bubbleBaseSize}
          min={2}
          max={50}
          step={1}
          onChange={(v: number) => onUpdate({ bubbleBaseSize: v })}
        />
        <Slider
          label="Bubble Size Variance"
          value={settings.bubbleSizeVariance}
          min={0}
          max={40}
          step={1}
          onChange={(v: number) => onUpdate({ bubbleSizeVariance: v })}
        />
        <Slider
          label="Diffusion Rate"
          value={settings.diffusionRate}
          min={0}
          max={0.001}
          step={0.00001}
          onChange={(v: number) => onUpdate({ diffusionRate: v })}
        />
        <Slider
          label="Buoyancy"
          value={settings.buoyancy}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ buoyancy: v })}
        />
        <Slider
          label="Advection"
          value={settings.advection}
          min={0}
          max={2.0}
          step={0.1}
          onChange={(v: number) => onUpdate({ advection: v })}
        />
        <Slider
          label="Damping (Friction)"
          value={settings.damping}
          min={0.8}
          max={1.0}
          step={0.01}
          onChange={(v: number) => onUpdate({ damping: v })}
        />
      </section>

      {/* Automation Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Sparkles size={12} /> Automation
        </h3>
        <Slider
          label="Automation Rate"
          value={settings.automateRate}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ automateRate: v })}
        />
      </section>

      {/* Mixer Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Layers size={12} /> Multi-Layer Mixer
        </h3>
        <Slider
          label="Projector Layers"
          value={settings.layerCount}
          min={1}
          max={5}
          step={1}
          onChange={(v: number) => onUpdate({ layerCount: Math.round(v) })}
        />
        <Slider
          label="Rotation Speed"
          value={settings.rotationSpeed}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ rotationSpeed: v })}
        />
        <div className="flex items-center justify-between mb-4 mt-4">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">LED Platform</span>
          <button
            onClick={() => onUpdate({ ledPlatform: !settings.ledPlatform })}
            className={`w-10 h-5 rounded-full relative transition-colors ${settings.ledPlatform ? 'bg-white' : 'bg-white/20'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${settings.ledPlatform ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {settings.ledPlatform && (
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-widest opacity-70">LED Mode</span>
              <select
                value={settings.ledMode}
                onChange={(e) => onUpdate({ ledMode: e.target.value as LedMode })}
                className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
              >
                <option value="single">Single Color</option>
                <option value="rainbow">Rainbow Wheel</option>
                <option value="ocean">Ocean Depths</option>
                <option value="fire">Fire Pit</option>
                <option value="cyberpunk">Cyberpunk</option>
              </select>
            </div>
            
            {settings.ledMode === 'single' && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest opacity-70">LED Color</span>
                <input
                  type="color"
                  value={settings.ledColor}
                  onChange={(e) => onUpdate({ ledColor: e.target.value })}
                  className="w-full h-8 rounded cursor-pointer bg-transparent border-none p-0"
                />
              </div>
            )}
            
            <Slider
              label="LED Rotation Speed"
              value={settings.ledSpeed}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(v: number) => onUpdate({ ledSpeed: v })}
            />
          </div>
        )}
        <Slider
          label="Center Gravity (Concave)"
          value={settings.centerGravity}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ centerGravity: v })}
        />
        <Slider
          label="Gooey Blending"
          value={settings.gooeyEffect}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ gooeyEffect: v })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Blend Mode</span>
          <select
            value={settings.blendMode}
            onChange={(e) => onUpdate({ blendMode: e.target.value as BlendMode })}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] uppercase tracking-widest focus:outline-none focus:border-white/30 transition-all"
          >
            {blendModes.map((mode) => (
              <option key={mode} value={mode} className="bg-gray-900">
                {mode}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="mt-12 pt-8 border-t border-white/10">
        <p className="text-[9px] leading-relaxed opacity-30 italic">
          "The Squish Plate effect was the hallmark of American light shows... simulating pressing two glass clock faces together."
        </p>
      </div>
    </motion.div>
  );
};
