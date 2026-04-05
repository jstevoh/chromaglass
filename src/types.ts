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
  sensitivity: 0.5,
  bassBoost: 1.0,
  globalSpeed: 0.05,
  audioMappings: {
    velocity: 'mid',
    density: 'bass',
    color: 'treble',
    rotation: 'none',
    bubbles: 'bass',
  },
  platePressure: 0.3,
  glassSmear: 0.5,
  rainDrip: 0.5,
  viscosity: 'thick',
  polarity: 0.9,
  heatIntensity: 0.15,
  boilingPoint: 0.75,
  evaporationRate: 0.03,
  airVelocity: 0.1,
  vibrationFrequency: 0.5,
  layerCount: 3,
  blendMode: 'screen',
  gooeyEffect: 0.4,
  rotationSpeed: 0.02,
  centerGravity: 0.2,
  ledPlatform: false,
  ledMode: 'rainbow',
  ledColor: '#FF0000',
  ledSpeed: 0.05,
  surfaceTension: 0.05,
  diffusionRate: 0.0001,
  buoyancy: 0.5,
  advection: 0.5,
  damping: 0.98,
  heatDecay: 0.95,
  automateRate: 0.1,
  bubbleAmount: 0.2,
  bubbleBaseSize: 12,
  bubbleSizeVariance: 8,
};
