import type { AudioData } from './hooks/useAudioAnalyzer';
import type { AudioFeature } from './types';
import { stream, type Rng } from './lib/rng';

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
  // The second eight (2026-09-24). The first sixteen were eight hot colours,
  // three blues, two greens and four neutrals, so half the looks carried
  // yellow and nearly every cool look was the same two blues. These fill the
  // gaps between them: the blue-greens, a deep gold, a violet-blue, a forest
  // green, a true magenta, a soft warm, a night blue and a pale violet.
  { name: 'Teal',              hex: '#00A99D', r: 0.0,  g: 0.66, b: 0.62 },
  { name: 'Amber',             hex: '#FFB300', r: 1.0,  g: 0.70, b: 0.0  },
  { name: 'Ultramarine',       hex: '#4B2DFF', r: 0.29, g: 0.18, b: 1.0  },
  { name: 'Jade',              hex: '#00875A', r: 0.0,  g: 0.53, b: 0.35 },
  { name: 'Magenta',           hex: '#E0119D', r: 0.88, g: 0.07, b: 0.62 },
  { name: 'Coral',             hex: '#FF6F59', r: 1.0,  g: 0.44, b: 0.35 },
  { name: 'Midnight',          hex: '#14286E', r: 0.08, g: 0.16, b: 0.43 },
  { name: 'Lavender',          hex: '#B58CFF', r: 0.71, g: 0.55, b: 1.0  },
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
  [7, 23, 5, 0],       // Pastel glow: Icy Blue, Lavender, Emerald, Yellow (was White; see below)
  [2, 11, 10, 7],      // Magenta dream: Hot Pink, Raspberry, Purple, Icy Blue
  [0, 1, 6, 15],       // Citrus pop: Yellow, Orange, Limpid Green, White
  [8, 3, 0, 10],       // Contrast shock: Blue, Red, Yellow, Purple
  [5, 2, 8, 0],        // Carnival: Emerald, Hot Pink, Blue, Yellow
  [9, 10, 7, 23],      // Galaxy: Cobalt, Purple, Icy Blue, Lavender (was White; see below)
  [16, 21, 17, 7],     // Reef: Teal, Coral, Amber, Icy Blue
  [22, 18, 20, 23],    // Twilight: Midnight, Ultramarine, Magenta, Lavender
  [19, 16, 17, 5],     // Forest: Jade, Teal, Amber, Emerald
  [21, 23, 17, 11],    // Dusk: Coral, Lavender, Amber, Raspberry
  // The 2026-10-10 four (PLAN.md 28b), appended so a lock saved by its index
  // still names the palette it did.
  [0, 20, 16, 18],     // Overhead: Yellow, Magenta, Teal, Ultramarine
  [14, 22, 4, 13],     // Ink: Graphite, Midnight, Crimson, Coffee
  [17, 0, 15, 14],     // Pantry: Amber, Yellow, White, Graphite
  [4, 1, 20, 17],      // Lava: Crimson, Orange, Magenta, Amber
];

/*
  Why those four, and why Pastel Glow and Galaxy lost their white (PLAN.md 28b).

  Eleven looks and every new one since 2026-10-04 draw on the lamp (Lamp
  Ground, 18b): the dye is a filter over white light, not a glow on black,
  and a colour shows by how far it is from white rather than from black.
  A palette picked from the desk or the phone is laid on whatever look is
  up, so it has to read on both. Measured as the CIELAB distance of each
  colour from black and from white (`npm run plate`), White is 0 from the
  lamp (it is clear liquid, which is what it should be) and Icy Blue 26, so
  Pastel Glow and Galaxy, each carrying both, poured half their dyes
  invisibly on a lamp look; Lavender, which took White's place in both, is
  93 from black and 73 from the lamp. Every palette now keeps at least
  three of its four colours 40 or more from each ground.

  The four added are the colour that came with the physics: Overhead is
  the subtractive primaries an overhead projector's dishes were mixed from,
  each a filter that passes two thirds of the lamp, so where two overlap
  they leave one primary of light (yellow and magenta red, yellow and teal
  green, magenta and teal blue); Ink is the dark precipitates of the reactions that print
  on the lamp (Sensual Laboratory, Agate, Turing Print); Pantry the
  liquids' own colours (syrup, oil, milk, ferrofluid: the Natural swatch,
  18d-12) as dyes; and Lava the wax colours of Lava Lamp.
*/

// Display names for COLOR_HARMONIES, index-aligned.
export const COLOR_HARMONY_NAMES: string[] = [
  'Warm Sunset', 'Cool Ocean', 'Neon Electric', 'Fire & Ice', 'Royal Garden',
  'Tropical', 'Deep Jewel', 'Pastel Glow', 'Magenta Dream', 'Citrus Pop',
  'Contrast Shock', 'Carnival', 'Galaxy', 'Reef', 'Twilight', 'Forest', 'Dusk',
  'Overhead', 'Ink', 'Pantry', 'Lava',
];

/*
  Which colour a drop is and which palette a plate re-picks are both on the
  plate the moment they are drawn, so both come from the show's seeded
  `plate.palette` stream (lib/rng.ts) unless a caller hands in another. One
  stream for the two, because they are one decision — what colour arrives —
  and nothing but the palette's own choices draw from it (the visualizer's
  `harmonyWithin` is the third), so no change to the bubbles or the beads
  can move a colour.
*/

/** Pick a random color harmony index set */
export function pickHarmony(rng: Rng = stream('plate.palette')): number[] {
  return rng.pick(COLOR_HARMONIES);
}

/** Pick a random RGB from a given harmony */
export function harmonyColor(harmony: number[], rng: Rng = stream('plate.palette')): { r: number; g: number; b: number } {
  return PALETTE_RGB[rng.pick(harmony)];
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

/**
 * The audio features, as one list.
 *
 * This was a second copy of `AudioFeature` from `types.ts`, written out
 * identically. Two identical unions maintained apart is a feature added to one
 * of them and silently unreachable through the other — which is exactly the
 * trap now that a patch can send any audio feature to any setting rather than
 * only to the four the mappings object names.
 */
export type AudioFeatureKey = AudioFeature;

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

// Fast hex → {r,g,b} (0-1). Cached for hot-path usage, bounded (PLAN §14n).
export const MAX_HEX_CACHE = 512;
const hexCache = new Map<string, { r: number; g: number; b: number }>();

export function hexCacheSize(): number {
  return hexCache.size;
}

if (typeof window !== 'undefined') {
  const win = window as unknown as {
    chromaglassHexCacheSize?: () => number;
    chromaglassHexToRgb?: (hex: string) => { r: number; g: number; b: number };
    chromaglassHexCacheHas?: (hex: string) => boolean;
  };
  win.chromaglassHexCacheSize = hexCacheSize;
  win.chromaglassHexToRgb = hexToRgb;
  win.chromaglassHexCacheHas = (hex: string) => hexCache.has(hex);
}

export function clearHexCache(): void {
  hexCache.clear();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (typeof hex !== 'string' || hex.length > 9) return { r: 1, g: 1, b: 1 };
  const cached = hexCache.get(hex);
  if (cached) return cached;
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = result
    ? { r: parseInt(result[1], 16) / 255, g: parseInt(result[2], 16) / 255, b: parseInt(result[3], 16) / 255 }
    : { r: 1, g: 1, b: 1 };
  if (hexCache.size >= MAX_HEX_CACHE) {
    const oldest = hexCache.keys().next().value;
    if (oldest !== undefined) hexCache.delete(oldest);
  }
  hexCache.set(hex, rgb);
  return rgb;
}

