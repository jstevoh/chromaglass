// Shared types for the music intelligence layer.

export interface TrackIdentity {
  isrc: string;          // canonical key — falls back to a hash of artist+title when unknown
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
  /** Seconds into the track at the moment identification completed (from the fingerprint match). */
  offsetSec?: number;
  /** performance.now()-style wall clock when offsetSec was sampled — used to extrapolate position. */
  identifiedAtMs?: number;
  source: 'fingerprint' | 'manual' | 'local';
}

export interface SongSection {
  start: number;   // seconds
  end: number;     // seconds
  label: string;   // 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'A'…
  energy: number;  // mean normalized energy 0-1 of the section
}

export interface LyricLine {
  time: number;    // seconds
  text: string;
  sentiment?: number; // -1..1 lexicon score
}

export interface SongMap {
  isrc: string;
  title?: string;
  artist?: string;
  durationSec: number;
  sections: SongSection[];
  /** Per-frame estimated pitch in MIDI note numbers (0 = unvoiced). ~4 frames/sec. */
  pitchCurve: number[];
  /** Per-frame RMS energy, normalized 0-1. ~4 frames/sec. */
  energyCurve: number[];
  frameRate: number;   // frames per second of the curves
  lyricLines?: LyricLine[];
  generatedAt: number;
}

/** One manual interaction, anchored to song time. Coordinates are normalized 0-1. */
export interface GestureEvent {
  t: number;      // seconds into the track
  tool: string;   // dropper | spray | splatter | pour | streak | blow
  x: number;
  y: number;
  dx?: number;    // normalized movement direction (streak)
  dy?: number;
  color?: string; // hex dye color (absent for blow)
}

export interface ListenRecord {
  date: string;          // ISO
  listenNumber: number;
  paramSnapshot: Record<string, number>;
  /** Saved light-show performance — present only if the user chose to keep it. */
  gestures?: GestureEvent[];
}

export interface TrackEvolutionState {
  isrc: string;
  title?: string;
  artist?: string;
  /** Visualizer preset chosen for this track on first identification. */
  presetId?: string;
  listenCount: number;
  currentParams: {
    complexity: number;       // 0-1, ramps turbulenceDetail/scale over listens
    paletteDrift: number;     // accumulated hue-base drift (harmony index rotation)
    unlockedLayers: string[]; // lyric-trigger themes unlocked after N listens
  };
  listens: ListenRecord[];
}

/** Themes a lyric keyword can trigger. */
export type LyricTheme = 'fire' | 'water' | 'sky' | 'earth' | 'love' | 'dark' | 'light' | 'motion';

export interface LyricTrigger {
  time: number;
  word: string;
  theme: LyricTheme;
}

/** Settings for the music intelligence layer (persisted in localStorage, separate from visual presets). */
export interface MusicSettings {
  enabled: boolean;
  autoPreset: boolean;    // switch to a track-matched preset on identification
  lyricTriggers: boolean;
  sentimentArc: boolean;
  lyricsOverlay: boolean;
  evolutionSpeed: number; // 0-1, how fast per-listen evolution ramps
}

export const DEFAULT_MUSIC_SETTINGS: MusicSettings = {
  enabled: true,
  autoPreset: true,
  lyricTriggers: true,
  sentimentArc: true,
  lyricsOverlay: false,
  evolutionSpeed: 0.5,
};
