/**
 * What a setting's value says to a person.
 *
 * One answer, because there were three. Both desks carried their own copy of
 * the same formatter and had already drifted apart: Perform printed a zoom as
 * `4.00×` and Design as `4.00x`, and when Speed stopped being a bare `0.022`
 * it stopped on one desk only. The settings panel had a third rule again —
 * `toFixed(2)` on everything — so the Dimmer read `100%` on the desk and
 * `1.00` in the panel, which is the same control disagreeing with itself
 * across two screens.
 *
 * A share of the travel is the default because it answers the questions a
 * hand on a control actually has: how much is there, how much is left, which
 * way is more. A raw number answers none of them unless it carries a unit you
 * already picture — a magnification, a tempo, seconds — and those are the
 * exceptions below.
 */

import type { VisualizerSettings } from '../types';
import { kelvinLabel } from './lampKelvin';
import { curveOf, travelOf } from './midi';
import { MIX_CONTROLS, MIX_FADE_KEYS } from './mixer';
import { ENVELOPE_TRIGGERS, formatLfoBars, LFO_SHAPES, LFO_TRIGGERS } from './modulators';
import type { EngineStatus } from './platform';
import { SPIN_AUTO_NAMES } from './turntable';

const signedZero = (v: number, digits = 1): number => (Math.abs(v) < 0.5 * 10 ** -digits ? 0 : v);
const lfoShapeUnit = (v: number): string => LFO_SHAPES[Math.max(0, Math.min(LFO_SHAPES.length - 1, Math.round(v)))] ?? 'sine';
const lfoRestartUnit = (v: number): string => LFO_TRIGGERS[Math.max(0, Math.min(LFO_TRIGGERS.length - 1, Math.round(v)))] ?? 'none';
const envOnUnit = (v: number): string => ENVELOPE_TRIGGERS[Math.max(0, Math.min(ENVELOPE_TRIGGERS.length - 1, Math.round(v)))] ?? 'any';
const envAttackUnit = (v: number): string => `${Math.round(v * 1000)} ms`;
const envDecayUnit = (v: number): string => v >= 1 ? `${v.toFixed(2)} s` : `${Math.round(v * 1000)} ms`;

/** A fade time as said on its slider: "cut", "1 bar", "2.5 bars". */
export const fadeBarsLabel = (v: number): string => {
  if (!(v > 0)) return 'cut';
  // Anything above none fades, so it never reads as a cut: at least half a bar.
  const b = Math.max(0.5, Math.round(v * 2) / 2);
  return `${b} bar${b === 1 ? '' : 's'}`;
};

/** The settings a number reads better on than a percentage. */
const UNITS: Record<string, (v: number) => string> = {
  macroZoom:  v => `${v.toFixed(2)}×`,
  grainScale: v => `${Math.round(v)}`,
  macroHold:  v => `${v.toFixed(1)}s`,
  beatLead:   v => `${Math.round(v)} ms`,
  gelSpeed:   v => `${v.toFixed(2)} rpm`,
  hueJourney: v => (v > 0 ? `${v.toFixed(1)} min/step` : 'Off'),
  moireAngle: v => `${signedZero(v, 1).toFixed(1)}°`,
  moireSpin:  v => `${signedZero(v, 1).toFixed(1)} rpm`,
  moireRatio: v => `${v.toFixed(2)}×`,
  moireDensity: v => `${Math.round(v)}`,
  moireGap:   v => `${v.toFixed(1)} mm`,
  moireSlide: v => `${Math.round(v * 100)}%`,
  filmZoom:   v => `${v.toFixed(2)}×`,
  filmX:      v => `${Math.round(v * 100)}%`,
  filmY:      v => `${Math.round(v * 100)}%`,
  filmRing:   v => (v > 0.5 ? 'On' : 'Off'),
  lampWarmth: kelvinLabel,
  turbulenceDetail: v => `${Math.round(v)}`,
  kaleidoscope: v => (v < 1 ? 'Off' : `${Math.round(v)}×`),
  kaleidoSpin: v => `${Math.round(v * 200)}%`,
  plateTiltX: v => `${Math.round(v * 100)}%`,
  plateTiltY: v => `${Math.round(v * 100)}%`,
  plateCurve: v => `${Math.round(v * 100)}%`,
  tiltDirection: v => `${Math.round(v)}°`,
  cometAngle: v => `${Math.round(v)}°`,
  faradayHz:  v => (v > 0 ? `${Math.round(v)} Hz` : 'Off'),
  faraday:    v => `${v.toFixed(2)} g`,
  faradayRock: v => (v > 0 ? `${v.toFixed(2)} Hz` : 'Still'),
  faradayGain: v => `${v.toFixed(1)}×`,
  spinAuto:   v => SPIN_AUTO_NAMES[Math.max(0, Math.min(2, Math.round(v)))] ?? 'Off',
  spinRpm:    v => `${signedZero(v, 1).toFixed(1)} rpm`,
  spinBeats:  v => `${Math.round(v)}`,
  spinDirection: v => (v > 0.5 ? 'clockwise' : v < -0.5 ? 'anticlockwise' : 'opposed'),
  layerCount: v => `${Math.round(v)}`,
  twoProjectors: v => (v > 0.5 ? 'On' : 'Off'),
  thinGap:    v => (v > 0.5 ? 'On' : 'Off'),
  liquidMl:   v => `${Math.round(v)} mL`,
  coverWeight: v => `${Math.round(v)} g`,
  oilWeight:  v => (v > 0 ? `+${v.toFixed(2)}` : signedZero(v, 2).toFixed(2)),
  chemistryPattern: v => (v < 0.34 ? 'Spots' : v < 0.67 ? 'Worms' : 'Labyrinth'),
  turingInk:  v => (v > 0 ? `${Math.round(v * 360)}°` : 'Starch'),
  turingDrift: v => (v > 0 ? `${Math.round(v * 100)}%` : 'Still'),
  soapFilmRate: v => `${v.toFixed(2)}×`,
  soapFilmAngle: v => `${Math.round(v)}°`,
  soapFilmTilt: v => `${Math.round(v)}°`,
  glowShear:  v => `${Math.round(v)}/s`,
  glowRecharge: v => `${v.toFixed(1)} s`,
  lensStop:   v => `f/${v.toFixed(1)}`,
  sideLightHue: v => `${Math.round(v)}°`,
  sideLightAngle: v => `${Math.round(v)}°`,
  analyserAngle: v => `${Math.round(v)}°`,
  tankFeed:   v => `${v.toFixed(1)} cm/s`,
  tankWeight: v => `${v.toFixed(2)}%`,
  tankHue:    v => `${Math.round(v)}°`,
  lfo1Bars: formatLfoBars, lfo2Bars: formatLfoBars, lfo3Bars: formatLfoBars, lfo4Bars: formatLfoBars,
  lfo1Shape: lfoShapeUnit, lfo2Shape: lfoShapeUnit, lfo3Shape: lfoShapeUnit, lfo4Shape: lfoShapeUnit,
  lfo1Restart: lfoRestartUnit, lfo2Restart: lfoRestartUnit, lfo3Restart: lfoRestartUnit, lfo4Restart: lfoRestartUnit,
  env1Attack: envAttackUnit, env2Attack: envAttackUnit,
  env1Decay: envDecayUnit, env2Decay: envDecayUnit,
  env1On: envOnUnit, env2On: envOnUnit,
  /*
    The mixer's grades read as a photo editor's do: brightness, contrast and
    saturation as a share of the source's own (100% is untouched, and a share
    of the travel would have called that 50%), the hue as a turn in degrees.
  */
  ...Object.fromEntries(MIX_CONTROLS.filter(c => !String(c.key).endsWith('Level')).map(c => [
    String(c.key),
    String(c.key).endsWith('Hue')
      ? (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}°`
      : (v: number) => `${Math.round(v * 100)}%`,
  ])),
  // A row's fade time is bars of the song, and none at all is a cut.
  ...Object.fromEntries(MIX_FADE_KEYS.map(k => [String(k), fadeBarsLabel])),
  // Soap Breakdown (0..1 → half-life ln(2)/k, 2 h at 0+ down to 10 s at 1; 0 is none).
  soapBreakdown: v => {
    if (!(v > 0)) return 'Off';
    const hl = 7200 * (10 / 7200) ** Math.min(1, v);
    if (hl >= 3600) return `${(hl / 3600).toFixed(1)}h`;
    if (hl >= 120) return `${Math.round(hl / 60)}m`;
    return `${Math.round(hl)}s`;
  },
};

/**
 * `min` and `max` are the travel of the control being read, which is not
 * always the setting's whole range: a fader taught a narrower span should read
 * full when it is at its own top.
 */
export function readSetting(key: string, value: number, min: number, max: number): string {
  const unit = UNITS[key];
  if (unit) return unit(value);
  const span = max - min;
  if (span === 0) return '0%';
  /*
    Where the knob is, on a curved control too. Speed's travel is cubed, and
    this read the value's share of 0..0.3: the knob a fifth of the way along
    said 1%, and the next notch down said 0%.
  */
  const pct = Math.round(travelOf(value, min, max, curveOf(key as keyof VisualizerSettings)) * 100);
  return `${pct < 0 ? 0 : pct > 100 ? 100 : pct}%`;
}

/** Whether this setting reads as a unit rather than a percentage. */
export const hasUnit = (key: string): boolean => key in UNITS;

/**
 * Plain-English governor summary for the Simulation panel and the desk status
 * bar, keeping the raw grid, DPR, frame rate and step rate in the tooltip.
 */
export function readEngineStatus(st: EngineStatus): { text: string; tone: 'ok' | 'warn'; tooltip: string } {
  if (st.engine === 'none') {
    return {
      text: st.gpuUnavailable ? 'WebGPU unavailable' : 'Starting graphics…',
      tone: st.gpuUnavailable ? 'warn' : 'ok',
      tooltip: st.label,
    };
  }
  const fps = st.frameMs > 0 ? Math.round(1000 / st.frameMs) : 0;
  const want = st.stepRate > 0 ? st.stepRate : 60;
  const speedPct = st.stepsPerSec > 0 ? Math.round((st.stepsPerSec / want) * 100) : 100;
  const slow = st.stepsPerSec > 0 && st.stepsPerSec < want * 0.95;
  const tooltip = [
    st.label,
    fps > 0 ? `${fps} fps` : null,
    slow ? `${speedPct}% speed` : null,
    st.governed ? 'Auto' : 'Fixed',
  ].filter(Boolean).join(' · ');
  if (slow) {
    return {
      text: `Running at ${speedPct}% speed to hold ${want} fps`,
      tone: 'warn',
      tooltip,
    };
  }
  if (st.governed && st.steppedDown) {
    return {
      text: `Auto — scaled to ${st.grid}² to hold ${want} fps`,
      tone: 'ok',
      tooltip,
    };
  }
  if (st.governed) {
    return {
      text: fps > 0 ? `Full speed · ${fps} fps` : 'Full speed',
      tone: 'ok',
      tooltip,
    };
  }
  return {
    text: fps > 0 ? `Fixed ${st.grid}² · ${fps} fps` : `Fixed ${st.grid}²`,
    tone: 'ok',
    tooltip,
  };
}
