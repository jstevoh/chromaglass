/**
 * Changing the look without cutting the audience to black.
 *
 * `applyPreset` clears every layer and reseeds. That is the right thing when
 * you are *building* a look: you want the new preset on clean glass, not on
 * whatever the last one left behind. It is the wrong thing at 11pm with the
 * plate on a wall behind you, because the clear is a hard cut through
 * near-black in front of a room.
 *
 * The non-destructive path already existed — `adoptPreset` takes on the new
 * preset's dyes, injection styles and liquids and leaves the plate alone, and
 * the sequencer has used it to change stage all along. What was missing is the
 * settings: adopting alone snaps all eighty of them at once, so the dye
 * survives but the look still jumps.
 *
 * This is the missing half. Two settings objects and a number from 0 to 1,
 * and no state of its own, so `npm run desk` can drive a whole fade and check
 * what came out rather than watching a plate and forming an impression.
 *
 * ## What cannot be faded
 *
 * A number can be halfway. A blend mode cannot: there is no state between
 * `screen` and `multiply`, and nothing this module can do will invent one.
 * Booleans, strings and the audio-mapping table therefore switch at a single
 * point rather than travelling, and the point is the middle of the fade —
 * where every number is already half-way to somewhere else, so the switch has
 * the least settled picture to disturb. Switching at the start pops before
 * anything has moved; switching at the end pops once the eye has settled.
 */

import { DEFAULT_SETTINGS, type VisualizerSettings } from '../types';
import { PIN_RANGE } from './deskPins';

/**
 * What a preset that does not mention them should get.
 *
 * A macro preset must not leave the next one zoomed in, and the Fillmore's
 * projectors, beads, cells and fingering must not leak into a plain plate.
 * `applyPreset` has always applied this base before the preset's own values;
 * a fade has to aim at the same target or the two paths disagree about what
 * the preset means.
 */
export const LOOK_BASE: Partial<VisualizerSettings> = {
  macroMode: false,
  renderStyle: 'show',
  camera: 0,
  dishSpread: 0,
  beads: 0,
  cells: 0,
  fingering: 0,
};

/** Where a fade is aiming: the base, then the preset over it. */
export function targetLook(current: VisualizerSettings, preset: Partial<VisualizerSettings>): VisualizerSettings {
  // The solver grid is a property of this machine, not of the look. A preset
  // from a desktop must not pin a laptop to a grid it cannot hold.
  return { ...current, ...LOOK_BASE, ...preset, simResolution: current.simResolution };
}

/** Ease in and out: a fade that starts and stops gently reads as a hand, not a switch. */
export const ease = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

/** The point in a fade where anything that cannot travel changes over. */
const SWITCH_AT = 0.5;

/**
 * `from` and `to`, mixed.
 *
 * Every key of the settings is visited, so a setting added later is faded
 * without this file being told about it: numbers travel, everything else
 * switches. The one exception is `simResolution`, which is a property of the
 * machine rather than of the look and never travels at all.
 */
export function blendLooks(from: VisualizerSettings, to: VisualizerSettings, t: number): VisualizerSettings {
  const k = ease(t);
  const past = k >= SWITCH_AT;
  const out = {} as Record<string, unknown>;

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof VisualizerSettings)[]) {
    const a = from[key];
    const b = to[key];
    if (key === 'simResolution') { out[key] = a; continue; }
    if (typeof a === 'number' && typeof b === 'number') {
      // A control that only takes whole steps — layers, the kaleidoscope's
      // folds, turbulence octaves — switches at the midpoint the way a choice
      // does: in between is not a value it has. Faded, a Go from one layer to
      // two passed the layer count through 1.05, 1.1, … and the visualizer
      // built a whole second solver on one frame and threw it away on the next,
      // for every frame of the fade.
      if (PIN_RANGE.get(key)?.step) { out[key] = past ? b : a; continue; }
      // `a + (b - a) * 1` is not `b` in floating point: fading 0.5 to 0.05
      // lands on 0.04999999999999999. A hundredth of a millionth does not
      // show on a wall, but it means the look you cued is not the look you
      // got, so two fades back and forth would drift rather than return.
      out[key] = k >= 1 ? b : a + (b - a) * k;
    } else {
      out[key] = past ? b : a;
    }
  }
  // Anything the settings carry that the defaults do not name (a key added to
  // a saved preset by a newer build) still has to arrive, or a fade would
  // quietly drop it.
  const fromAny = from as unknown as Record<string, unknown>;
  const toAny = to as unknown as Record<string, unknown>;
  for (const key of Object.keys(toAny)) {
    if (!(key in out)) out[key] = past ? toAny[key] : fromAny[key];
  }
  return out as unknown as VisualizerSettings;
}

/** How long a Go takes, in seconds, and what the desk offers. */
export const FADE_CHOICES = [0, 1, 2, 4, 8] as const;
export const DEFAULT_FADE_SECONDS = 2;
