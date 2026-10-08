import { DEFAULT_SETTINGS, type VisualizerSettings, type SimResolution } from '../types.ts';
import { PIN_RANGE, onStep } from './deskPins.ts';

const VALID_VISCOSITY = new Set(['thin', 'thick', 'water']);
const VALID_BLEND_MODE = new Set(['screen', 'normal', 'multiply', 'overlay']);
const VALID_LED_MODE = new Set(['rainbow', 'solid', 'pulse', 'audio']);
const VALID_MACRO_CAMERA = new Set(['hold', 'wander', 'cut']);
const VALID_ON_NEW_SONG = new Set(['preset', 'none']);
const VALID_ROW_BLEND = new Set(['own', 'add', 'screen', 'mult', 'over']);
const VALID_AUDIO_FEATURES = new Set(['volume', 'bass', 'mid', 'treble', 'energy', 'timbre', 'complexity', 'none']);

// stockType is the only numeric setting in DEFAULT_SETTINGS outside PIN_RANGE
const EXTRA_NUMERIC_RANGES: Record<string, { min: number; max: number; step?: number }> = {
  stockType: { min: 0, max: 3, step: 1 },
};

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Sanitize an incoming patch against the settings registry (DEFAULT_SETTINGS).
 *
 * S14n / PLAN.md §14n:
 * - Drops unknown keys
 * - Enforces default's typeof
 * - Rejects non-finite numbers (NaN, Infinity)
 * - Clamps finite numbers to the setting's valid min..max range (and respects step if defined)
 * - Restricts strings to known enums or valid bounded formats
 * - Keeps simResolution as 'auto' or integer grid between 64 and 2048
 * - Validates audioMappings and sceneMappings structure
 */
export function sanitizePatch(raw: unknown): Partial<VisualizerSettings> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const patch = raw as Record<string, unknown>;
  const out: Partial<VisualizerSettings> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue; // Drop unknown keys
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];

    // Special case: simResolution ('auto' | number)
    if (key === 'simResolution') {
      if (value === 'auto') {
        out.simResolution = 'auto';
      } else if (typeof value === 'number' && Number.isFinite(value) && value >= 64 && value <= 2048) {
        out.simResolution = Math.round(value);
      }
      continue;
    }

    // Number settings
    if (typeof def === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue; // Drop NaN, Infinity, strings, etc.
      const spec = PIN_RANGE.get(key) ?? EXTRA_NUMERIC_RANGES[key];
      if (spec) {
        let clamped = Math.max(spec.min, Math.min(spec.max, value));
        if (spec.step) clamped = onStep(spec, clamped);
        (out as Record<string, unknown>)[key] = clamped;
      } else {
        (out as Record<string, unknown>)[key] = value;
      }
      continue;
    }

    // Boolean settings
    if (typeof def === 'boolean') {
      if (typeof value === 'boolean') {
        (out as Record<string, unknown>)[key] = value;
      }
      continue;
    }

    // String settings
    if (typeof def === 'string') {
      if (typeof value !== 'string') continue;
      if (key === 'viscosity') {
        if (VALID_VISCOSITY.has(value)) out.viscosity = value as VisualizerSettings['viscosity'];
      } else if (key === 'blendMode') {
        if (VALID_BLEND_MODE.has(value)) out.blendMode = value as VisualizerSettings['blendMode'];
      } else if (key === 'ledMode') {
        if (VALID_LED_MODE.has(value)) out.ledMode = value as VisualizerSettings['ledMode'];
      } else if (key === 'macroCamera') {
        if (VALID_MACRO_CAMERA.has(value)) out.macroCamera = value as VisualizerSettings['macroCamera'];
      } else if (key === 'onNewSong') {
        if (VALID_ON_NEW_SONG.has(value)) out.onNewSong = value as VisualizerSettings['onNewSong'];
      } else if (key.endsWith('Blend')) {
        if (VALID_ROW_BLEND.has(value)) (out as Record<string, unknown>)[key] = value;
      } else if (key === 'paperA' || key === 'paperB' || key === 'ledColor') {
        if (HEX_COLOR_REGEX.test(value)) (out as Record<string, unknown>)[key] = value;
      } else if (key === 'mixOrder') {
        if (value.length <= 64 && /^[a-z ]+$/.test(value)) out.mixOrder = value;
      } else if (key === 'renderStyle') {
        if (value === 'show' || value === 'photo') out.renderStyle = value;
      } else if (value.length <= 64) {
        (out as Record<string, unknown>)[key] = value;
      }
      continue;
    }

    // Object settings: audioMappings
    if (key === 'audioMappings' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const am = value as Record<string, unknown>;
      const sanitizedAm: Partial<VisualizerSettings['audioMappings']> = {};
      for (const slot of ['velocity', 'density', 'color', 'rotation'] as const) {
        if (typeof am[slot] === 'string' && VALID_AUDIO_FEATURES.has(am[slot] as string)) {
          sanitizedAm[slot] = am[slot] as VisualizerSettings['audioMappings'][typeof slot];
        }
      }
      if (Object.keys(sanitizedAm).length > 0) {
        out.audioMappings = { ...DEFAULT_SETTINGS.audioMappings, ...sanitizedAm };
      }
      continue;
    }

    // Object settings: sceneMappings
    if (key === 'sceneMappings' && Array.isArray(value)) {
      const validMappings = value.filter(m =>
        m && typeof m === 'object' && typeof m.source === 'string' && typeof m.target === 'string' &&
        typeof m.depth === 'number' && Number.isFinite(m.depth)
      ).slice(0, 32);
      out.sceneMappings = validMappings;
      continue;
    }
  }

  return out;
}
