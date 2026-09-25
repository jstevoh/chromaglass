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
import { curveOf, travelOf } from './midi';

/** The settings a number reads better on than a percentage. */
const UNITS: Record<string, (v: number) => string> = {
  macroZoom:  v => `${v.toFixed(2)}×`,
  grainScale: v => `${Math.round(v)}`,
  macroHold:  v => `${v.toFixed(1)}s`,
  beatLead:   v => `${Math.round(v)} ms`,
  gelSpeed:   v => `${v.toFixed(2)} rpm`,
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
