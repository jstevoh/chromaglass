export type BlendMode = 'screen' | 'lighter' | 'exclusion' | 'multiply' | 'overlay';

export interface LiquidType {
  id: string;
  name: string;
  color: string;
  description: string;
  injectRadius: number;   // cells — how wide each drop spreads
  injectAmount: number;   // density injected per frame while held
  heatAmount: number;     // heat injected (drives buoyancy-based rise)
}

export const DEFAULT_LIQUID_TYPES: LiquidType[] = [
  { id: 'water',   name: 'Water',   color: '#4488ff', description: 'Flows freely, spreads evenly',         injectRadius: 3, injectAmount: 0.6, heatAmount: 0.05 },
  { id: 'oil',     name: 'Oil',     color: '#ffaa22', description: 'Thick, repels water, stays in blobs',  injectRadius: 2, injectAmount: 1.4, heatAmount: 0.0  },
  { id: 'alcohol', name: 'Alcohol', color: '#aaffcc', description: 'Thin, rises and disperses with heat',  injectRadius: 4, injectAmount: 0.3, heatAmount: 0.5  },
  { id: 'ink',     name: 'Ink',     color: '#cc44ff', description: 'Spreads wide and diffuses slowly',     injectRadius: 5, injectAmount: 0.25,heatAmount: 0.0  },
  { id: 'syrup',   name: 'Syrup',   color: '#ff6644', description: 'Very heavy, barely moves once placed', injectRadius: 2, injectAmount: 2.0, heatAmount: 0.0  },
];
export type LedMode = 'single' | 'rainbow' | 'ocean' | 'fire' | 'cyberpunk';
export type AudioFeature = 'none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity';

export interface AudioMappings {
  velocity: AudioFeature;
  density: AudioFeature;
  color: AudioFeature;
  rotation: AudioFeature;
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
}

export const DEFAULT_SETTINGS: VisualizerSettings = {
  sensitivity: 0.4,
  bassBoost: 1.0,
  globalSpeed: 0.025,       // slow viscous crawl, visibly moving
  audioMappings: {
    velocity: 'bass',
    density: 'bass',
    color: 'treble',
    rotation: 'none',
  },
  platePressure: 0.4,       // glass plate squeeze — drives radial spreading
  glassSmear: 0.3,          // gentle smear from plate contact
  rainDrip: 0.0,
  viscosity: 'thick',
  polarity: 0.5,            // moderate immiscibility — colors stay distinct at boundaries
  heatIntensity: 0.15,
  boilingPoint: 0.95,
  evaporationRate: 0.003,   // very slow evaporation — colors persist
  airVelocity: 0.0,
  vibrationFrequency: 0.0,
  layerCount: 1,
  blendMode: 'screen',
  gooeyEffect: 0.45,        // organic blob merging
  rotationSpeed: 0.0,       // no rotation — flat plate simulation
  centerGravity: 0.0,
  ledPlatform: false,
  ledMode: 'rainbow',
  ledColor: '#FF0000',
  ledSpeed: 0.05,
  surfaceTension: 0.05,
  diffusionRate: 0.0002,    // moderate diffusion — blobs spread naturally
  buoyancy: 0.45,
  advection: 0.45,
  damping: 0.97,
  heatDecay: 0.98,
  automateRate: 0.02,
};
