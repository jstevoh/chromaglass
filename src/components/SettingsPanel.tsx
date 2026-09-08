import React from 'react';
import { motion } from 'motion/react';
import { X, Sliders, Zap, Thermometer, Wind, Layers, Activity, Sparkles, Palette, Microscope } from 'lucide-react';
import { VisualizerSettings, BlendMode, LedMode, SimResolution } from '../types';
import { PRESETS } from '../presets';
import type { RoomCalibration } from '../lib/audioCalibration';

interface SettingsPanelProps {
  settings: VisualizerSettings;
  onUpdate: (settings: Partial<VisualizerSettings>) => void;
  onApplyPreset: (presetId: string, settings: Partial<VisualizerSettings>) => void;
  activePresetId: string | null;
  /** Live room-calibration readout, null when auto-calibration is off. */
  calibration?: RoomCalibration | null;
  onRecalibrate?: () => void;
  /** Which solver is running and at what grid, e.g. "GPU · 512²". */
  engineStatus?: string | null;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, onApplyPreset, activePresetId, calibration, onRecalibrate, engineStatus, onClose }) => {
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

        {/* Room calibration */}
        <div className="flex items-center justify-between mb-3 mt-5">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Auto Calibrate</span>
          <button
            onClick={() => onUpdate({ autoCalibrate: !(settings.autoCalibrate !== false) })}
            className={`w-10 h-5 rounded-full relative transition-colors ${settings.autoCalibrate !== false ? 'bg-white' : 'bg-white/20'}`}
            title="Learn this room's noise floor and dynamics, and drive the visuals from where the music sits between them"
          >
            <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${settings.autoCalibrate !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {settings.autoCalibrate !== false && (
          <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
            {calibration ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-widest opacity-60">
                    {calibration.calibrating ? 'Listening to the room' : calibration.signal ? 'Calibrated' : 'Room is quiet'}
                  </span>
                  <span className="text-[10px] font-mono opacity-50">
                    {calibration.floorDb.toFixed(0)} → {calibration.peakDb.toFixed(0)} dB
                  </span>
                </div>
                <div className="h-1 w-full rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${calibration.calibrating ? 'bg-white/60' : 'bg-emerald-400/80'}`}
                    style={{ width: `${Math.round(calibration.progress * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <span className="text-[10px] uppercase tracking-widest opacity-40">Waiting for audio</span>
            )}
            <button
              onClick={() => onRecalibrate?.()}
              className="mt-3 w-full rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest opacity-70 transition-colors hover:bg-white/10 hover:opacity-100"
            >
              Recalibrate room
            </button>
          </div>
        )}
      </section>

      {/* Audio Mappings Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Activity size={12} /> Audio Mappings
        </h3>
        
        {['velocity', 'density', 'color', 'rotation'].map((param) => (
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

      {/* Light Show Look Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Palette size={12} /> Light Show Look
        </h3>
        <Slider
          label="Turbulence Scale"
          value={settings.turbulenceScale}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ turbulenceScale: v })}
        />
        <Slider
          label="Turbulence Detail"
          value={settings.turbulenceDetail}
          min={1}
          max={4}
          step={1}
          onChange={(v: number) => onUpdate({ turbulenceDetail: Math.round(v) })}
        />
        <Slider
          label="Blob Surface Tension"
          value={settings.blobSurfaceTension}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ blobSurfaceTension: v })}
        />
        <Slider
          label="Boundary Glow"
          value={settings.boundaryContrast}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ boundaryContrast: v })}
        />
        <Slider
          label="Saturation"
          value={settings.saturationBoost}
          min={0.5}
          max={2.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ saturationBoost: v })}
        />
        <Slider
          label="Glossiness"
          value={settings.glossiness}
          min={0}
          max={1.0}
          step={0.05}
          onChange={(v: number) => onUpdate({ glossiness: v })}
        />
        <Slider
          label="Post Blur"
          value={settings.postBlurRadius}
          min={0}
          max={1.5}
          step={0.05}
          onChange={(v: number) => onUpdate({ postBlurRadius: v })}
        />
      </section>

      {/* Simulation Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Zap size={12} /> Simulation
        </h3>
        <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-widest opacity-70">Fluid Grid</span>
            {engineStatus && <span className="text-[10px] font-mono opacity-50">{engineStatus}</span>}
          </div>
          <select
            value={String(settings.simResolution ?? 'auto')}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate({ simResolution: (v === 'auto' || v === 'cpu' ? v : Number(v)) as SimResolution });
            }}
            className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm focus:outline-none focus:border-white/50"
            title="Grid the fluid is solved on. Finer grids resolve thinner filaments and real cell structure; the CPU solver is the fallback for machines without float render targets."
          >
            <option value="auto">Auto</option>
            <option value="256">GPU · 256² (light)</option>
            <option value="384">GPU · 384²</option>
            <option value="512">GPU · 512²</option>
            <option value="768">GPU · 768² (heavy)</option>
            <option value="cpu">CPU · 192²</option>
          </select>
          <p className="text-[10px] leading-relaxed opacity-40">
            Finer grids let the physics form the filaments and cells itself instead of the closeup synthesising them. Drop a step if the frame rate suffers.
          </p>
        </div>
      </section>

      {/* Macro Closeup Section */}
      <section className="mb-8">
        <h3 className="text-[10px] uppercase tracking-[0.3em] opacity-30 mb-4 flex items-center gap-2">
          <Microscope size={12} /> Macro Closeup
        </h3>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-bold uppercase tracking-widest opacity-70">Bead Camera</span>
          <button
            onClick={() => onUpdate({ macroMode: !settings.macroMode })}
            className={`w-10 h-5 rounded-full relative transition-colors ${settings.macroMode ? 'bg-white' : 'bg-white/20'}`}
            title="Magnify the plate and chase a single bead of liquid"
          >
            <div className={`w-4 h-4 rounded-full bg-black absolute top-0.5 transition-transform ${settings.macroMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        {settings.macroMode && (
          <>
            <Slider
              label="Zoom"
              value={settings.macroZoom}
              min={1}
              max={16}
              step={0.5}
              onChange={(v: number) => onUpdate({ macroZoom: v })}
            />
            <Slider
              label="Chase Speed"
              value={settings.macroChase}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroChase: v })}
            />
            <Slider
              label="Shot Length"
              value={settings.macroHold}
              min={1}
              max={15}
              step={0.5}
              onChange={(v: number) => onUpdate({ macroHold: v })}
            />
            <Slider
              label="Paint Cells"
              value={settings.macroCells}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCells: v })}
            />
            <Slider
              label="Cell Size"
              value={settings.macroCellScale}
              min={0.15}
              max={1.5}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroCellScale: v })}
            />
            <Slider
              label="Lacing"
              value={settings.macroLacing}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroLacing: v })}
            />
            <Slider
              label="Depth / Focus"
              value={settings.macroDepth}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroDepth: v })}
            />
            <Slider
              label="Edge Detail"
              value={settings.macroEdgeDetail}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroEdgeDetail: v })}
            />
            <Slider
              label="Relief / 3D"
              value={settings.macroRelief}
              min={0}
              max={1}
              step={0.05}
              onChange={(v: number) => onUpdate({ macroRelief: v })}
            />
          </>
        )}
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
          max={2}
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
