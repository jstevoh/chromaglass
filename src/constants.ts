import type { AudioData } from './hooks/useAudioAnalyzer';

// Canonical color palette — single source of truth for the entire app.
// RGB values are 0-1 floats for the fluid simulation.
export const PALETTE = [
  { name: 'Sunshine Yellow',   hex: '#FFEA00', r: 1.0,  g: 0.92, b: 0.0  },
  { name: 'Sunshine Orange',   hex: '#FF7B00', r: 1.0,  g: 0.48, b: 0.0  },
  { name: 'Vibrant Hot Pink',  hex: '#FF007F', r: 1.0,  g: 0.0,  b: 0.5  },
  { name: 'Cherry Red',        hex: '#FF0000', r: 1.0,  g: 0.0,  b: 0.0  },
  { name: 'Crimson',           hex: '#B80F0A', r: 0.72, g: 0.06, b: 0.04 },
  { name: 'Emerald',           hex: '#50C878', r: 0.31, g: 0.78, b: 0.47 },
  { name: 'Limpid Green',      hex: '#39FF14', r: 0.22, g: 1.0,  b: 0.08 },
  { name: 'Icy Blue',          hex: '#A5F2F3', r: 0.65, g: 0.95, b: 0.95 },
  { name: 'Blue Cheer',        hex: '#0000FF', r: 0.0,  g: 0.0,  b: 1.0  },
  { name: 'Cobalt',            hex: '#0047AB', r: 0.0,  g: 0.28, b: 0.67 },
  { name: 'Purple',            hex: '#8A2BE2', r: 0.54, g: 0.17, b: 0.89 },
  { name: 'Raspberry',         hex: '#E30B5D', r: 0.89, g: 0.04, b: 0.36 },
  { name: 'Sienna',            hex: '#A0522D', r: 0.63, g: 0.32, b: 0.18 },
  { name: 'Coffee',            hex: '#6F4E37', r: 0.44, g: 0.31, b: 0.22 },
  { name: 'Graphite',          hex: '#4B4B4B', r: 0.29, g: 0.29, b: 0.29 },
  { name: 'Pure White',        hex: '#ffffff', r: 1.0,  g: 1.0,  b: 1.0  },
] as const;

// Hex-only list for the dropper UI (App.tsx, SettingsPanel.tsx).
export const DROPPER_COLORS = PALETTE.map(c => c.hex);

// RGB-only list for the fluid simulation (avoids re-parsing hex every frame).
export const PALETTE_RGB = PALETTE.map(({ r, g, b }) => ({ r, g, b }));

// Bubble-specific subset (slightly different from the full palette).
export const BUBBLE_COLORS = [
  '#00FFFF', '#FF00FF', '#FFFF00', '#00FF00',
  '#FF4500', '#8A2BE2', '#E30B5D', '#ffffff',
] as const;

// ── Audio helpers ──────────────────────────────────────────────────────

export type AudioFeatureKey = 'none' | 'volume' | 'bass' | 'mid' | 'treble' | 'energy' | 'timbre' | 'complexity';

/**
 * Normalised audio value for a given feature (0-1 range, clamped).
 * Shared by FluidSimulation.step(), the render loop, and rotation logic.
 */
export function getAudioValue(audioData: AudioData | null, feature: AudioFeatureKey): number {
  if (!audioData || feature === 'none') return 0;
  switch (feature) {
    case 'volume':     return Math.min(1, audioData.volume / 100);
    case 'bass':       return Math.min(1, audioData.bass / 100);
    case 'mid':        return Math.min(1, audioData.mid / 100);
    case 'treble':     return Math.min(1, audioData.treble / 100);
    case 'energy':     return Math.min(1, audioData.energy);
    case 'timbre':     return Math.min(1, audioData.timbre / 100);
    case 'complexity': return Math.min(1, audioData.complexity / 100);
    default:           return 0;
  }
}

// Fast hex → {r,g,b} (0-1). Cached for hot-path usage.
const hexCache = new Map<string, { r: number; g: number; b: number }>();
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = result
    ? { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 }
    : { r: 1, g: 1, b: 1 };
  hexCache.set(hex, rgb);
  return rgb;
}
