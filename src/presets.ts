import { VisualizerSettings, AudioMappings } from './types';

export interface Preset {
  id: string;
  name: string;
  description: string;
  settings: Partial<VisualizerSettings>;
}

const DEFAULT_MAPPINGS: AudioMappings = {
  velocity: 'mid',
  density: 'bass',
  color: 'treble',
  rotation: 'none',
};

export const PRESETS: Preset[] = [
  {
    id: 'classic',
    name: 'Classic Light Show',
    description: 'Slow, luminous blobs drift and merge — a meditative 1960s liquid light show.',
    settings: {
      globalSpeed: 0.022,        // unhurried, dreamlike pace
      layerCount: 2,
      blendMode: 'screen',       // additive glow — colors brighten where they overlap
      gooeyEffect: 0.65,         // organic, rounded blob edges
      rotationSpeed: 0.008,      // barely perceptible rotation keeps it alive
      centerGravity: 0.12,       // gentle inward drift prevents edge stagnation
      ledPlatform: false,
      surfaceTension: 0.14,      // blobs hold shape, merge slowly
      diffusionRate: 0.00012,    // colors bleed softly at boundaries
      buoyancy: 0.4,             // moderate rise — not too static, not too chaotic
      advection: 0.35,           // smooth transport, no turbulence
      damping: 0.988,            // very slow energy loss — movements persist gracefully
      heatDecay: 0.992,          // warmth lingers, keeps gentle convection going
      automateRate: 0.06,        // infrequent auto-injection — space to breathe
      platePressure: 0.25,       // subtle radial spread from center
      glassSmear: 0.3,           // soft smearing, no harsh edges
      rainDrip: 0.15,            // occasional downward streaks for variety
      viscosity: 'thick',        // heavy, syrupy movement
      polarity: 0.7,             // colors stay distinct but can gently intermingle
      heatIntensity: 0.1,        // low heat — convection is a background breath
      boilingPoint: 0.9,         // very hard to boil — keeps things calm
      evaporationRate: 0.005,    // colors persist a long time
      airVelocity: 0.04,         // near-still air — no turbulence
      vibrationFrequency: 0.08,  // minimal vibration — serene
      sensitivity: 0.4,
      bassBoost: 1.0,
      audioImpact: 0.35,         // gentle audio response — music breathes the fluid
      turbulenceScale: 0.3,      // gentle multi-scale ripple — alive but meditative
      turbulenceDetail: 3,
      blobSurfaceTension: 0.35,  // loose amoeba shapes, slow pinch-and-merge
      boundaryContrast: 0.4,     // visible bright line where dyes meet
      saturationBoost: 1.35,
      glossiness: 0.0,           // flat backlit dye — the projector look
      postBlurRadius: 0.35,
      audioMappings: {
        velocity: 'bass',        // low frequencies push the fluid gently
        density: 'volume',       // louder = more color, but mapped gently
        color: 'treble',         // high frequencies shift hue — sparkle
        rotation: 'none',        // no audio-driven rotation — keep it calm
      },
    }
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    description: 'Spiral arms of starlight swirl through the void — galaxies colliding in slow motion.',
    settings: {
      globalSpeed: 0.018,        // stately cosmic drift
      layerCount: 2,
      blendMode: 'lighter',      // additive light — stars brighten where they overlap
      gooeyEffect: 0.15,         // low goo — sharper points of light, less blobby
      rotationSpeed: 0.035,      // visible rotation creates spiral arms
      centerGravity: 0.85,       // strong pull inward — matter orbits a galactic core
      ledPlatform: false,        // pure black void
      surfaceTension: 0.02,      // near-zero — fluid fragments into star clusters
      diffusionRate: 0.00004,    // extremely low — pinpoints of light stay sharp
      buoyancy: 0.25,            // minimal buoyancy — horizontal swirl dominates
      advection: 0.75,           // strong transport — sweeping spiral arm motion
      damping: 0.994,            // very high — movements persist, orbits sustain
      heatDecay: 0.998,          // heat lingers forever — nebula glow persists
      automateRate: 0.14,        // moderate injection — periodic star bursts
      platePressure: 0.1,        // minimal plate spread — gravity dominates
      glassSmear: 0.15,          // light smearing — comet-tail streaks
      rainDrip: 0.0,             // no dripping — weightless space
      viscosity: 'thin',         // thin — fluid fragments into filaments and streams
      polarity: 0.25,            // low — colors intermingle freely like nebula gas
      heatIntensity: 0.06,       // faint warmth — just enough for gentle convection
      boilingPoint: 0.95,        // nearly impossible to boil — calm cosmos
      evaporationRate: 0.002,    // stars persist for a very long time
      airVelocity: 0.02,         // near-vacuum — no turbulence
      vibrationFrequency: 0.0,   // no vibration — serene void
      sensitivity: 0.5,
      bassBoost: 1.2,
      audioImpact: 0.4,
      turbulenceScale: 0.55,     // strong swirl — spiral arms shear and stretch
      turbulenceDetail: 4,       // fine filament detail down to star-cluster scale
      blobSurfaceTension: 0.1,   // near-zero cohesion — matter fragments freely
      boundaryContrast: 0.25,
      saturationBoost: 1.45,     // vivid nebula color
      glossiness: 0.0,
      postBlurRadius: 0.2,       // very sharp — pinpoints of light stay pinpoints
      audioMappings: {
        velocity: 'bass',        // bass drives galactic tides
        density: 'energy',       // overall energy triggers star formation
        color: 'treble',         // treble shifts nebula hue
        rotation: 'energy',      // energy modulates orbital speed
      },
    }
  },
  {
    id: 'deep-ocean',
    name: 'Deep Ocean',
    description: 'Slow moving, dense fluids over a deep blue LED platform.',
    settings: {
      globalSpeed: 0.03,
      layerCount: 2,
      blendMode: 'overlay',
      gooeyEffect: 0.8,
      rotationSpeed: 0.01,
      centerGravity: 0.8,
      ledPlatform: true,
      ledMode: 'ocean',
      ledSpeed: 0.05,
      surfaceTension: 0.1,
      diffusionRate: 0.0001,
      buoyancy: 0.2,
      advection: 0.2,
      damping: 0.99,
      heatDecay: 0.98,
      automateRate: 0.05,
      platePressure: 0.1,
      glassSmear: 0.2,
      rainDrip: 0.8,
      viscosity: 'thick',
      polarity: 0.8,
      heatIntensity: 0.05,
      boilingPoint: 0.9,
      evaporationRate: 0.01,
      airVelocity: 0.05,
      vibrationFrequency: 0.2,
      audioMappings: {
        velocity: 'volume',
        density: 'bass',
        color: 'none',
        rotation: 'energy',
      },
    }
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'High contrast, fast-moving neon fluids over a cyberpunk LED base.',
    settings: {
      globalSpeed: 0.08,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.1,
      rotationSpeed: 0.05,
      centerGravity: 0.5,
      ledPlatform: true,
      ledMode: 'cyberpunk',
      ledSpeed: 0.3,
      surfaceTension: 0.01,
      diffusionRate: 0.0005,
      buoyancy: 0.8,
      advection: 0.6,
      damping: 0.95,
      heatDecay: 0.9,
      automateRate: 0.2,
      platePressure: 0.6,
      glassSmear: 0.8,
      rainDrip: 0.2,
      viscosity: 'thin',
      polarity: 0.2,
      heatIntensity: 0.3,
      boilingPoint: 0.6,
      evaporationRate: 0.05,
      airVelocity: 0.3,
      vibrationFrequency: 0.8,
      audioMappings: {
        velocity: 'energy',
        density: 'treble',
        color: 'timbre',
        rotation: 'complexity',
      },
    }
  },
  {
    id: 'lava-lamp',
    name: 'Lava Lamp',
    description: 'Highly buoyant, gooey blobs rising over a warm fire LED.',
    settings: {
      globalSpeed: 0.04,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.9,
      rotationSpeed: 0.01,
      centerGravity: 0.1,
      ledPlatform: true,
      ledMode: 'fire',
      ledSpeed: 0.02,
      surfaceTension: 0.2,
      diffusionRate: 0.00005,
      buoyancy: 0.9,
      advection: 0.15,
      damping: 0.97,
      heatDecay: 0.99,
      automateRate: 0.1,
      platePressure: 0.2,
      glassSmear: 0.3,
      rainDrip: 0.1,
      viscosity: 'thick',
      polarity: 0.95,
      heatIntensity: 0.8,
      boilingPoint: 0.6,
      evaporationRate: 0.02,
      airVelocity: 0.05,
      vibrationFrequency: 0.1,
      turbulenceScale: 0.15,     // lava moves as whole blobs, minimal ripple
      turbulenceDetail: 2,
      blobSurfaceTension: 0.85,  // high cohesion — rounded rising globs
      boundaryContrast: 0.3,
      saturationBoost: 1.3,
      glossiness: 0.12,          // faint wax sheen — the one preset that earns it
      postBlurRadius: 0.55,      // softer edges than the flat-dye presets
      audioMappings: {
        velocity: 'bass',
        density: 'volume',
        color: 'none',
        rotation: 'none',
      },
    }
  },
  {
    id: 'ink-bleed',
    name: 'Monochrome Ink',
    description: 'Sharp, high-contrast ink bleeding over a stark white backlight.',
    settings: {
      globalSpeed: 0.05,
      layerCount: 2,
      blendMode: 'multiply',
      gooeyEffect: 0.0,
      rotationSpeed: 0.0,
      centerGravity: 0.3,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#ffffff',
      ledSpeed: 0.0,
      surfaceTension: 0.0,
      diffusionRate: 0.002,
      buoyancy: 0.4,
      advection: 0.4,
      damping: 0.96,
      heatDecay: 0.94,
      automateRate: 0.15,
      platePressure: 0.4,
      glassSmear: 0.1,
      rainDrip: 0.9,
      viscosity: 'thin',
      polarity: 0.1,
      heatIntensity: 0.1,
      boilingPoint: 0.8,
      evaporationRate: 0.08,
      airVelocity: 0.0,
      vibrationFrequency: 0.0,
      audioMappings: {
        velocity: 'complexity',
        density: 'energy',
        color: 'none',
        rotation: 'timbre',
      },
    }
  },
  {
    id: 'acid-trip',
    name: 'Acid Trip',
    description: 'Chaotic, rapidly rotating colors with strange blending physics.',
    settings: {
      globalSpeed: 0.08,
      layerCount: 2,
      blendMode: 'exclusion',
      gooeyEffect: 0.5,
      rotationSpeed: 0.1,
      centerGravity: 0.6,
      ledPlatform: true,
      ledMode: 'rainbow',
      ledSpeed: 0.4,
      surfaceTension: 0.15,
      diffusionRate: 0.0002,
      buoyancy: 0.6,
      advection: 0.8,
      damping: 0.95,
      heatDecay: 0.97,
      automateRate: 0.25,
      platePressure: 0.8,
      glassSmear: 0.9,
      rainDrip: 0.4,
      viscosity: 'thin',
      polarity: 0.5,
      heatIntensity: 0.5,
      boilingPoint: 0.5,
      evaporationRate: 0.04,
      airVelocity: 0.5,
      vibrationFrequency: 0.9,
      turbulenceScale: 0.8,      // maximum chaos — ripples on ripples
      turbulenceDetail: 4,
      blobSurfaceTension: 0.15,  // shapes constantly tear and reform
      boundaryContrast: 0.6,     // hard psychedelic color interfaces
      saturationBoost: 1.6,      // hyper-saturated
      glossiness: 0.0,
      postBlurRadius: 0.3,
      audioMappings: {
        velocity: 'treble',
        density: 'timbre',
        color: 'complexity',
        rotation: 'energy',
      },
    }
  },
  {
    id: 'bass-drop',
    name: 'Bass Drop',
    description: 'Heavy bass hits trigger massive fluid injections and screen shakes.',
    settings: {
      globalSpeed: 0.05,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.6,
      rotationSpeed: 0.01,
      centerGravity: 0.4,
      ledPlatform: false,
      surfaceTension: 0.08,
      diffusionRate: 0.0005,
      buoyancy: 0.3,
      advection: 0.5,
      damping: 0.94,
      heatDecay: 0.92,
      automateRate: 0.05,
      platePressure: 0.9,
      glassSmear: 0.7,
      rainDrip: 0.3,
      viscosity: 'thick',
      polarity: 0.7,
      heatIntensity: 0.2,
      boilingPoint: 0.8,
      evaporationRate: 0.02,
      airVelocity: 0.2,
      vibrationFrequency: 1.0,
      audioMappings: {
        velocity: 'bass',
        density: 'bass',
        color: 'none',
        rotation: 'none',
      },
    }
  },
  {
    id: 'timbre-shifter',
    name: 'Timbre Shifter',
    description: 'The brightness of the sound controls the color and rotation of the fluid.',
    settings: {
      globalSpeed: 0.06,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.3,
      rotationSpeed: 0.03,
      centerGravity: 0.5,
      ledPlatform: true,
      ledMode: 'rainbow',
      ledSpeed: 0.2,
      surfaceTension: 0.02,
      diffusionRate: 0.0001,
      buoyancy: 0.7,
      advection: 0.6,
      damping: 0.98,
      heatDecay: 0.96,
      automateRate: 0.15,
      platePressure: 0.4,
      glassSmear: 0.5,
      rainDrip: 0.6,
      viscosity: 'thin',
      polarity: 0.6,
      heatIntensity: 0.3,
      boilingPoint: 0.7,
      evaporationRate: 0.03,
      airVelocity: 0.1,
      vibrationFrequency: 0.4,
      audioMappings: {
        velocity: 'mid',
        density: 'volume',
        color: 'timbre',
        rotation: 'timbre',
      },
    }
  },
  {
    id: 'boiling-point',
    name: 'Boiling Point',
    description: 'High heat and complexity create a chaotic, churning cauldron of fluid.',
    settings: {
      globalSpeed: 0.07,
      layerCount: 2,
      blendMode: 'overlay',
      gooeyEffect: 0.7,
      rotationSpeed: 0.02,
      centerGravity: 0.1,
      ledPlatform: true,
      ledMode: 'fire',
      ledSpeed: 0.3,
      surfaceTension: 0.1,
      diffusionRate: 0.001,
      buoyancy: 1.0,
      advection: 0.8,
      damping: 0.9,
      heatDecay: 0.99,
      automateRate: 0.2,
      platePressure: 0.5,
      glassSmear: 0.6,
      rainDrip: 0.7,
      viscosity: 'thin',
      polarity: 0.8,
      heatIntensity: 0.9,
      boilingPoint: 0.4,
      evaporationRate: 0.06,
      airVelocity: 0.4,
      vibrationFrequency: 0.7,
      audioMappings: {
        velocity: 'energy',
        density: 'complexity',
        color: 'treble',
        rotation: 'complexity',
      },
    }
  },
  {
    id: 'microscopic-chaos',
    name: 'Microscopic Chaos',
    description: 'Extremely dense, high-contrast cellular fluid resembling oil and water under a microscope.',
    settings: {
      globalSpeed: 0.04,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.15,
      rotationSpeed: 0.01,
      centerGravity: 0.5,
      ledPlatform: true,
      ledMode: 'rainbow',
      ledSpeed: 0.08,
      surfaceTension: 0.25,
      diffusionRate: 0.00005,
      buoyancy: 0.4,
      advection: 0.3,
      damping: 0.98,
      heatDecay: 0.95,
      automateRate: 0.3,
      platePressure: 0.8,
      glassSmear: 0.2,
      rainDrip: 0.1,
      viscosity: 'thick',
      polarity: 0.95,
      heatIntensity: 0.2,
      boilingPoint: 0.8,
      evaporationRate: 0.01,
      airVelocity: 0.1,
      vibrationFrequency: 0.6,
      audioMappings: {
        velocity: 'complexity',
        density: 'energy',
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'aurora-borealis',
    name: 'Aurora Borealis',
    description: 'Slow sweeping curtains of light in greens and purples, rippling to low frequencies.',
    settings: {
      globalSpeed: 0.025,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.6,
      rotationSpeed: 0.008,
      centerGravity: 0.05,
      ledPlatform: true,
      ledMode: 'ocean',
      ledSpeed: 0.03,
      surfaceTension: 0.12,
      diffusionRate: 0.0003,
      buoyancy: 0.65,
      advection: 0.35,
      damping: 0.985,
      heatDecay: 0.99,
      automateRate: 0.06,
      platePressure: 0.15,
      glassSmear: 0.4,
      rainDrip: 0.2,
      viscosity: 'thin',
      polarity: 0.4,
      heatIntensity: 0.25,
      boilingPoint: 0.85,
      evaporationRate: 0.008,
      airVelocity: 0.08,
      vibrationFrequency: 0.15,
      audioMappings: {
        velocity: 'bass',
        density: 'volume',
        color: 'complexity',
        rotation: 'energy',
      },
    }
  },
  {
    id: 'solar-flare',
    name: 'Solar Flare',
    description: 'Explosive plumes of plasma erupt from a white-hot core, driven by bass.',
    settings: {
      globalSpeed: 0.06,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.3,
      rotationSpeed: 0.015,
      centerGravity: 0.7,
      ledPlatform: true,
      ledMode: 'fire',
      ledSpeed: 0.15,
      surfaceTension: 0.03,
      diffusionRate: 0.0008,
      buoyancy: 0.85,
      advection: 0.7,
      damping: 0.93,
      heatDecay: 0.97,
      automateRate: 0.18,
      platePressure: 0.7,
      glassSmear: 0.6,
      rainDrip: 0.05,
      viscosity: 'thin',
      polarity: 0.3,
      heatIntensity: 0.75,
      boilingPoint: 0.45,
      evaporationRate: 0.04,
      airVelocity: 0.35,
      vibrationFrequency: 0.6,
      audioMappings: {
        velocity: 'bass',
        density: 'energy',
        color: 'treble',
        rotation: 'bass',
      },
    }
  },
  {
    id: 'jellyfish-bloom',
    name: 'Jellyfish Bloom',
    description: 'Pulsing translucent bells drift and contract to rhythmic mid frequencies.',
    settings: {
      globalSpeed: 0.03,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.85,
      rotationSpeed: 0.006,
      centerGravity: 0.15,
      ledPlatform: true,
      ledMode: 'ocean',
      ledSpeed: 0.04,
      surfaceTension: 0.18,
      diffusionRate: 0.00008,
      buoyancy: 0.55,
      advection: 0.25,
      damping: 0.988,
      heatDecay: 0.995,
      automateRate: 0.08,
      platePressure: 0.25,
      glassSmear: 0.15,
      rainDrip: 0.45,
      viscosity: 'thick',
      polarity: 0.85,
      heatIntensity: 0.12,
      boilingPoint: 0.88,
      evaporationRate: 0.005,
      airVelocity: 0.04,
      vibrationFrequency: 0.25,
      audioMappings: {
        velocity: 'mid',
        density: 'mid',
        color: 'timbre',
        rotation: 'none',
      },
    }
  },
  {
    id: 'fractal-dream',
    name: 'Fractal Dream',
    description: 'Overlapping interference patterns bloom into recursive color mandalas.',
    settings: {
      globalSpeed: 0.045,
      layerCount: 2,
      blendMode: 'exclusion',
      gooeyEffect: 0.2,
      rotationSpeed: 0.04,
      centerGravity: 0.9,
      ledPlatform: true,
      ledMode: 'rainbow',
      ledSpeed: 0.25,
      surfaceTension: 0.08,
      diffusionRate: 0.0004,
      buoyancy: 0.5,
      advection: 0.55,
      damping: 0.96,
      heatDecay: 0.96,
      automateRate: 0.2,
      platePressure: 0.5,
      glassSmear: 0.7,
      rainDrip: 0.3,
      viscosity: 'thin',
      polarity: 0.65,
      heatIntensity: 0.35,
      boilingPoint: 0.65,
      evaporationRate: 0.025,
      airVelocity: 0.25,
      vibrationFrequency: 0.55,
      audioMappings: {
        velocity: 'complexity',
        density: 'mid',
        color: 'timbre',
        rotation: 'treble',
      },
    }
  },
  {
    id: 'velvet-underground',
    name: 'Velvet Underground',
    description: 'Rich saturated pools of deep magenta and indigo that churn slowly to the beat.',
    settings: {
      globalSpeed: 0.02,
      layerCount: 2,
      blendMode: 'overlay',
      gooeyEffect: 0.75,
      rotationSpeed: 0.005,
      centerGravity: 0.35,
      ledPlatform: true,
      ledMode: 'single',
      ledColor: '#220044',
      ledSpeed: 0.0,
      surfaceTension: 0.15,
      diffusionRate: 0.00006,
      buoyancy: 0.3,
      advection: 0.2,
      damping: 0.992,
      heatDecay: 0.997,
      automateRate: 0.04,
      platePressure: 0.3,
      glassSmear: 0.25,
      rainDrip: 0.6,
      viscosity: 'thick',
      polarity: 0.9,
      heatIntensity: 0.08,
      boilingPoint: 0.92,
      evaporationRate: 0.003,
      airVelocity: 0.02,
      vibrationFrequency: 0.1,
      audioMappings: {
        velocity: 'bass',
        density: 'bass',
        color: 'none',
        rotation: 'none',
      },
    }
  },
  {
    id: 'neon-coral-reef',
    name: 'Neon Coral Reef',
    description: 'Branching fluorescent tendrils sway and pulse in sync with mid and treble.',
    settings: {
      globalSpeed: 0.04,
      layerCount: 2,
      blendMode: 'screen',
      gooeyEffect: 0.55,
      rotationSpeed: 0.012,
      centerGravity: 0.0,
      ledPlatform: true,
      ledMode: 'cyberpunk',
      ledSpeed: 0.12,
      surfaceTension: 0.22,
      diffusionRate: 0.0001,
      buoyancy: 0.45,
      advection: 0.4,
      damping: 0.978,
      heatDecay: 0.985,
      automateRate: 0.12,
      platePressure: 0.35,
      glassSmear: 0.45,
      rainDrip: 0.55,
      viscosity: 'thick',
      polarity: 0.75,
      heatIntensity: 0.2,
      boilingPoint: 0.78,
      evaporationRate: 0.012,
      airVelocity: 0.12,
      vibrationFrequency: 0.4,
      audioMappings: {
        velocity: 'mid',
        density: 'treble',
        color: 'complexity',
        rotation: 'timbre',
      },
    }
  },
  {
    id: 'stardust-collapse',
    name: 'Stardust Collapse',
    description: 'Glittering particles spiral inward then detonate outward on each bass hit.',
    settings: {
      globalSpeed: 0.055,
      layerCount: 2,
      blendMode: 'lighter',
      gooeyEffect: 0.05,
      rotationSpeed: 0.06,
      centerGravity: 0.95,
      ledPlatform: true,
      ledMode: 'rainbow',
      ledSpeed: 0.35,
      surfaceTension: 0.01,
      diffusionRate: 0.0012,
      buoyancy: 0.7,
      advection: 0.9,
      damping: 0.92,
      heatDecay: 0.93,
      automateRate: 0.22,
      platePressure: 0.85,
      glassSmear: 0.9,
      rainDrip: 0.15,
      viscosity: 'thin',
      polarity: 0.15,
      heatIntensity: 0.6,
      boilingPoint: 0.35,
      evaporationRate: 0.055,
      airVelocity: 0.55,
      vibrationFrequency: 0.85,
      audioMappings: {
        velocity: 'bass',
        density: 'energy',
        color: 'treble',
        rotation: 'bass',
      },
    }
  },
];
