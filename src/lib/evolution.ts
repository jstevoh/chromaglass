// Deterministic per-track visual identity + evolution across listens.
//
// The ISRC hashes to a stable seed that offsets palette, turbulence and blob
// density — so a given song always has a recognizable look. Each completed
// listen nudges an evolution vector (complexity ramps, palette drifts,
// lyric-trigger themes unlock), and every listen's parameter snapshot is kept
// so past visualizations can be replayed exactly.

import { COLOR_HARMONIES } from '../constants';
import { TrackEvolutionState, ListenRecord, LyricTheme } from './musicTypes';

/** FNV-1a 32-bit — stable across sessions, good enough distribution for seeding. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Build a pseudo-ISRC for tracks identified without a real ISRC (e.g. manual tagging). */
export function pseudoIsrc(artist: string, title: string): string {
  const h = hashString(`${artist.toLowerCase().trim()}::${title.toLowerCase().trim()}`);
  return `LOCAL-${h.toString(16).padStart(8, '0')}`;
}

/** Deterministic mulberry32 PRNG from a seed. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface TrackSeed {
  harmonyIndex: number;        // base color harmony for this track
  turbulenceOffset: number;    // -0.15..+0.15
  tensionOffset: number;       // -0.2..+0.2
  densityBias: number;         // 0.8..1.3 — injection amount multiplier
  saturationOffset: number;    // -0.1..+0.25
}

/** Stable per-track visual identity derived from the ISRC alone. */
export function trackSeed(isrc: string): TrackSeed {
  const rand = mulberry32(hashString(isrc));
  return {
    harmonyIndex: Math.floor(rand() * COLOR_HARMONIES.length),
    turbulenceOffset: (rand() - 0.5) * 0.3,
    tensionOffset: (rand() - 0.5) * 0.4,
    densityBias: 0.8 + rand() * 0.5,
    saturationOffset: -0.1 + rand() * 0.35,
  };
}

// ── Per-track preset selection ─────────────────────────────────────────
// Buckets of visualizer presets by musical character. The pick is
// deterministic per ISRC (a song keeps its preset across listens) but the
// bucket comes from the live audio profile at identification time.
const PRESET_BUCKETS = {
  calm:   ['classic', 'deep-ocean', 'velvet-underground', 'lava-lamp', 'jellyfish-bloom'],
  dreamy: ['galaxy', 'aurora-borealis', 'fractal-dream', 'timbre-shifter'],
  bright: ['cyberpunk', 'neon-coral-reef', 'stardust-collapse', 'acid-trip'],
  heavy:  ['bass-drop', 'solar-flare', 'boiling-point', 'microscopic-chaos'],
};

export interface AudioProfile {
  energy: number;     // 0-1 overall intensity
  bass: number;       // 0-1 low-end weight
  brightness: number; // 0-1 spectral brightness
}

export function pickPresetForTrack(isrc: string, profile: AudioProfile | null): string {
  const h = hashString(isrc + '::preset');
  if (!profile) {
    const all = [...PRESET_BUCKETS.calm, ...PRESET_BUCKETS.dreamy, ...PRESET_BUCKETS.bright, ...PRESET_BUCKETS.heavy];
    return all[h % all.length];
  }
  let bucket: string[];
  if (profile.energy < 0.28) bucket = profile.brightness > 0.5 ? PRESET_BUCKETS.dreamy : PRESET_BUCKETS.calm;
  else if (profile.bass > 0.55 && profile.bass >= profile.brightness) bucket = PRESET_BUCKETS.heavy;
  else if (profile.brightness > 0.45) bucket = PRESET_BUCKETS.bright;
  else bucket = PRESET_BUCKETS.dreamy;
  return bucket[h % bucket.length];
}

const UNLOCKABLE_THEMES: LyricTheme[] = ['fire', 'water', 'sky', 'earth', 'love', 'dark', 'light', 'motion'];
const BASE_THEMES: LyricTheme[] = ['fire', 'water'];

export function newTrackState(isrc: string, title?: string, artist?: string): TrackEvolutionState {
  return {
    isrc, title, artist,
    listenCount: 0,
    currentParams: { complexity: 0.2, paletteDrift: 0, unlockedLayers: [...BASE_THEMES] },
    listens: [],
  };
}

/**
 * Advance the evolution vector after a completed listen and record the snapshot
 * that was used to render it (so it can be replayed later).
 */
export function evolveAfterListen(
  state: TrackEvolutionState,
  paramSnapshot: Record<string, number>,
  evolutionSpeed: number,
): TrackEvolutionState {
  const listenNumber = state.listenCount + 1;
  const speed = 0.25 + evolutionSpeed * 1.5;
  const complexity = Math.min(1, state.currentParams.complexity + 0.06 * speed);
  const paletteDrift = state.currentParams.paletteDrift + 0.35 * speed;
  // Unlock one new trigger theme every 3rd listen
  const unlockCount = Math.min(UNLOCKABLE_THEMES.length, BASE_THEMES.length + Math.floor(listenNumber / 3));
  const unlockedLayers = UNLOCKABLE_THEMES.slice(0, unlockCount);

  const listen: ListenRecord = {
    date: new Date().toISOString(),
    listenNumber,
    paramSnapshot,
  };

  return {
    ...state,
    listenCount: listenNumber,
    currentParams: { complexity, paletteDrift, unlockedLayers },
    listens: [...state.listens, listen].slice(-100), // cap history
  };
}

export interface MusicVisualParams {
  harmonyIndex: number;
  turbulenceScale: number;
  turbulenceDetail: number;
  blobSurfaceTension: number;
  saturationBoost: number;
  boundaryContrast: number;
  densityBias: number;
}

/**
 * Combine the track's stable seed with its current evolution vector (or a
 * frozen historical snapshot when replaying) into concrete visual parameters.
 */
export function buildVisualParams(
  seed: TrackSeed,
  state: TrackEvolutionState | null,
  base: { turbulenceScale: number; blobSurfaceTension: number; saturationBoost: number; boundaryContrast: number },
  snapshot?: Record<string, number>,
): MusicVisualParams {
  if (snapshot) {
    return {
      harmonyIndex: snapshot.harmonyIndex ?? seed.harmonyIndex,
      turbulenceScale: snapshot.turbulenceScale ?? base.turbulenceScale,
      turbulenceDetail: snapshot.turbulenceDetail ?? 3,
      blobSurfaceTension: snapshot.blobSurfaceTension ?? base.blobSurfaceTension,
      saturationBoost: snapshot.saturationBoost ?? base.saturationBoost,
      boundaryContrast: snapshot.boundaryContrast ?? base.boundaryContrast,
      densityBias: snapshot.densityBias ?? seed.densityBias,
    };
  }
  const complexity = state?.currentParams.complexity ?? 0.2;
  const drift = state?.currentParams.paletteDrift ?? 0;
  const harmonyIndex = (seed.harmonyIndex + Math.floor(drift)) % COLOR_HARMONIES.length;
  return {
    harmonyIndex,
    turbulenceScale: clamp01(base.turbulenceScale + seed.turbulenceOffset + complexity * 0.25),
    turbulenceDetail: complexity > 0.6 ? 4 : 3,
    blobSurfaceTension: clamp01(base.blobSurfaceTension + seed.tensionOffset),
    saturationBoost: Math.max(0.5, Math.min(2, base.saturationBoost + seed.saturationOffset)),
    boundaryContrast: clamp01(base.boundaryContrast + complexity * 0.15),
    densityBias: seed.densityBias,
  };
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }

/** Flatten visual params into the snapshot format stored per listen. */
export function paramsToSnapshot(p: MusicVisualParams): Record<string, number> {
  return {
    harmonyIndex: p.harmonyIndex,
    turbulenceScale: p.turbulenceScale,
    turbulenceDetail: p.turbulenceDetail,
    blobSurfaceTension: p.blobSurfaceTension,
    saturationBoost: p.saturationBoost,
    boundaryContrast: p.boundaryContrast,
    densityBias: p.densityBias,
  };
}
