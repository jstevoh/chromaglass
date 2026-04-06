export type BlendMode = 'screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay';
export type LedMode = 'single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk';
export type AudioFeature = 'none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity';

export interface AudioMappings {
  velocity: AudioFeature;
  density: AudioFeature;
  color: AudioFeature;
  rotation: AudioFeature;
  bubbles: AudioFeature;
}

export interface VisualizerSettings {
  // Sound Settings
  sensitivity: number;
  bassBoost: number;
  globalSpeed: number;
  audioMappings: AudioMappings;
  
  // Squish Plate
  platePressure: number;
  glassSmear: number;
  rainDrip: number;
  viscosity: 'thick' | 'thin';
  polarity: number; // Repulsion between blobs
  
  // Heat Slide
  heatIntensity: number;
  boilingPoint: number;
  evaporationRate: number;
  
  // Manual/Interaction
  airVelocity: number;
  vibrationFrequency: number;
  
  // Mixer
  layerCount: number;
  blendMode: BlendMode;
  gooeyEffect: number; // For metaball-like blending
  rotationSpeed: number;
  centerGravity: number;
  ledPlatform: boolean;
  ledMode: LedMode;
  ledColor: string;
  ledSpeed: number;
  
  // Fluid Physics (High Fidelity)
  surfaceTension: number;
  diffusionRate: number;
  buoyancy: number;
  advection: number;
  damping: number;
  heatDecay: number;
  
  // Automation
  automateRate: number;
  
  // Bubbles
  bubbleAmount: number;
  bubbleBaseSize: number;
  bubbleSizeVariance: number;
}

export const DEFAULT_SETTINGS: VisualizerSettings = {
  sensitivity: 0.4,
  bassBoost: 1.0,
  globalSpeed: 0.005,       // very slow crawl
  audioMappings: {
    velocity: 'bass',
    density: 'bass',
    color: 'treble',
    rotation: 'none',
    bubbles: 'none',
  },
  platePressure: 0.1,
  glassSmear: 0.15,
  rainDrip: 0.1,
  viscosity: 'thick',
  polarity: 0.3,
  heatIntensity: 0.05,
  boilingPoint: 0.95,       // almost never boils without audio
  evaporationRate: 0.01,
  airVelocity: 0.02,
  vibrationFrequency: 0.1,
  layerCount: 1,            // single layer — clean and focused
  blendMode: 'screen',
  gooeyEffect: 0.3,
  rotationSpeed: 0.003,
  centerGravity: 0.05,
  ledPlatform: false,
  ledMode: 'rainbow',
  ledColor: '#FF0000',
  ledSpeed: 0.05,
  surfaceTension: 0.05,
  diffusionRate: 0.00005,
  buoyancy: 0.2,
  advection: 0.2,
  damping: 0.995,           // high damping — energy dissipates quickly
  heatDecay: 0.98,
  automateRate: 0.02,
  bubbleAmount: 0.0,
  bubbleBaseSize: 4,
  bubbleSizeVariance: 1,
};
