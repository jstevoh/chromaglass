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

// ── Color harmonies ──────────────────────────────────────────────────
// Curated sets of 3-5 complementary colors from the palette.
// Each set is chosen to mix well without going muddy (avoids browns/greys).
// Index values refer to PALETTE / PALETTE_RGB array positions.
export const COLOR_HARMONIES: number[][] = [
  [0, 1, 2, 3],        // Warm sunset: Yellow, Orange, Hot Pink, Cherry Red
  [7, 8, 9, 5],        // Cool ocean: Icy Blue, Blue Cheer, Cobalt, Emerald
  [6, 10, 2, 8],       // Neon electric: Limpid Green, Purple, Hot Pink, Blue Cheer
  [3, 1, 7, 8],        // Fire & ice: Cherry Red, Orange, Icy Blue, Blue Cheer
  [10, 5, 11, 0],      // Royal garden: Purple, Emerald, Raspberry, Yellow
  [0, 6, 2, 7],        // Tropical: Yellow, Limpid Green, Hot Pink, Icy Blue
  [9, 10, 4, 5],       // Deep jewel: Cobalt, Purple, Crimson, Emerald
  [7, 15, 5, 0],       // Pastel glow: Icy Blue, White, Emerald, Yellow
  [2, 11, 10, 7],      // Magenta dream: Hot Pink, Raspberry, Purple, Icy Blue
  [0, 1, 6, 15],       // Citrus pop: Yellow, Orange, Limpid Green, White
  [8, 3, 0, 10],       // Contrast shock: Blue, Red, Yellow, Purple
  [5, 2, 8, 0],        // Carnival: Emerald, Hot Pink, Blue, Yellow
];

/** Pick a random color harmony index set */
export function pickHarmony(): number[] {
  return COLOR_HARMONIES[Math.floor(Math.random() * COLOR_HARMONIES.length)];
}

/** Pick a random RGB from a given harmony */
export function harmonyColor(harmony: number[]): { r: number; g: number; b: number } {
  return PALETTE_RGB[harmony[Math.floor(Math.random() * harmony.length)]];
}

/** Cycle through a harmony over time (for smooth ambient/audio cycling) */
export function harmonyCycle(harmony: number[], t: number): { r: number; g: number; b: number } {
  const len = harmony.length;
  const ci = Math.floor(t % len);
  const ni = (ci + 1) % len;
  const bl = t % 1;
  const c0 = PALETTE_RGB[harmony[ci]];
  const c1 = PALETTE_RGB[harmony[ni]];
  return { r: c0.r * (1 - bl) + c1.r * bl, g: c0.g * (1 - bl) + c1.g * bl, b: c0.b * (1 - bl) + c1.b * bl };
}

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
