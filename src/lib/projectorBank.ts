/**
 * A bank of projectors on one wall: each one's lamp, its shutter, and the
 * A/B crossfade between them (PLAN 51a).
 *
 * What a show is. Liquid Light Lab's films, the Joshua Light Show's accounts
 * and every operator's how-to describe the same rig: two to four overhead
 * projectors throwing onto one dark wall, each with its own lamp on a variac
 * (a dimmer that also overdrives, to about 160 V on a 120 V lamp), a shutter
 * (a vane, a card, a hand over the lens, because the lamp has to stay lit to
 * stay cool), and one person mixing them. The dynamics are in that mix: one
 * slow, soft layer held while a sharp one comes and goes. Until this file the
 * plate had two plates whose light could add (Two Projectors, PLAN 18b-10),
 * with each lamp halved so clear glass stayed at one lamp's level, and no way
 * to ride either.
 *
 * Three laws, each the real thing rather than a fader curve picked by eye:
 *
 * 1. The lamp. A tungsten-halogen filament on a variac follows its own power
 *    laws in the voltage ratio v = V / V_rated: luminous flux as v^3.4 and
 *    colour temperature as v^0.42 (the lamp makers' design exponents, e.g.
 *    the IES Lighting Handbook's lamp tables: flux 3.3 to 3.6, temperature
 *    0.40 to 0.42). So a fader pulled to 75% does not give 75% of the light
 *    but 38%, and amber: 3200 K at full is 2840 K there, and 2390 K at half,
 *    where the light is 9.5%. Past 100% it overdrives, brighter and cooler,
 *    as a variac at 140 V does (and as the lamp's life would pay for). The
 *    fader is the voltage, as a variac's knob is, not the light.
 *    The picture is white-balanced to the lamp at full, so the colour is the
 *    blackbody at the dimmed temperature against the blackbody at the rated
 *    one, held to unit luminance (the colour shift alone), then times the
 *    flux law. The blackbody is lampKelvin.ts's, Planck's law through the
 *    CIE 1931 matching functions, so Lamp Warmth and these lamps agree on
 *    what a temperature looks like.
 *
 * 2. The shutter. A vane swung in close to the lens, at the pupil, cuts the
 *    light of the whole picture evenly (a blade at the pupil cuts every
 *    point's cone by the same share: the near-pupil end of 51d's hands). So it
 *    dims, it does not wipe, and how much it dims is the share of a round
 *    pupil a straight edge leaves uncovered: the circular segment, not the
 *    edge's travel. A vane closes in about 80 ms (a hand-swung card is about
 *    that; a solenoid shutter faster), so the setting is where the vane is
 *    going and the frame walks it there at that speed: a button snaps it,
 *    a fader held part way holds it part way.
 *
 * 3. The crossfade. Light adds, so a crossfade between two projectors is
 *    linear in light: A times (1 − x) plus B times x. The equal-power curve an
 *    audio crossfader uses (cos, sin) exists because two uncorrelated signals
 *    add in power; two pictures on a wall add in light already, and equal
 *    power would brighten the middle by 41%. At its centre each projector is
 *    at half, which is exactly the exposure the old halving gave, so a look
 *    with Two Projectors keeps its brightness on clear glass. The crossfade is
 *    neutral (an iris or ND in each beam), not the lamps: a crossfade done on
 *    the variacs would turn the middle amber, which is what the lamp faders
 *    are for. At either end it is one projector alone at its full lamp.
 *
 * Everything here is linear light. The plate's picture holds display values
 * (glint.ts's note: "light adds in linear light"), so the gains are handed to
 * the shader as display multipliers, each channel the linear gain to 1/2.2,
 * and the shader adds the two projectors in linear light (`wallAdd`,
 * wgsl/projectors.ts). Every default is today's picture: one projector at
 * 1, 1, 1 multiplies nothing.
 */

import { HALOGEN_KELVIN, blackbodyLinear } from './lampKelvin';

/** The variac's top: 160 V on a 120 V lamp. The fader runs 0 to this; 1 is the lamp's rated voltage. */
export const VARIAC_MAX = 4 / 3;
/** Luminous flux against the voltage ratio: Φ ∝ v^3.4. */
export const LAMP_FLUX_EXPONENT = 3.4;
/** Colour temperature against the voltage ratio: T ∝ v^0.42. */
export const LAMP_CCT_EXPONENT = 0.42;
/** The lamp at its rated voltage: the quartz-halogen of an overhead projector, the picture's white. */
export const LAMP_RATED_KELVIN = HALOGEN_KELVIN;
/** How long the vane takes from open to shut, seconds. */
export const SHUTTER_SECONDS = 0.08;
/** The display's transfer the plate's values are in (the shader's toLinear/toDisplay). */
const DISPLAY_GAMMA = 2.2;
/** Below this the filament gives no light worth drawing (and a temperature under ~600 K has no visible colour to compute). */
const LAMP_DARK = 0.04;

const clampVariac = (v: number | undefined) => Math.max(0, Math.min(VARIAC_MAX, Number.isFinite(v) ? v as number : 1));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const luminance = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The lamp's light at fader v, against its rated light. */
export const lampFlux = (v: number): number => Math.pow(clampVariac(v), LAMP_FLUX_EXPONENT);

/** The filament's colour temperature at fader v, kelvin. */
export const lampKelvinAt = (v: number): number => LAMP_RATED_KELVIN * Math.pow(Math.max(LAMP_DARK, clampVariac(v)), LAMP_CCT_EXPONENT);

const RATED = blackbodyLinear(LAMP_RATED_KELVIN);
const colourMemo = new Map<number, [number, number, number]>();

/**
 * The lamp at fader v as a linear-light gain on a picture balanced to it at
 * full: its colour shift at unit luminance, times its flux. Memoised by the
 * fader's value (a ridden fader visits a few hundred values; MIDI's 128).
 */
export function lampColour(v: number): [number, number, number] {
  const volts = clampVariac(v);
  if (volts === 1) return [1, 1, 1];
  if (volts < LAMP_DARK) return [0, 0, 0];
  const key = Math.round(volts * 1e4);
  const kept = colourMemo.get(key);
  if (kept) return kept;
  const c = blackbodyLinear(lampKelvinAt(volts));
  const shift = [c[0] / RATED[0], c[1] / RATED[1], c[2] / RATED[2]];
  const k = lampFlux(volts) / luminance(shift);
  const out: [number, number, number] = [shift[0] * k, shift[1] * k, shift[2] * k];
  if (colourMemo.size > 4096) colourMemo.clear();
  colourMemo.set(key, out);
  return out;
}

/**
 * The share of a round pupil a straight vane leaves open, the vane `travel`
 * of the way across (0 open, 1 shut): the circular segment on the open side
 * of an edge at e = 2·travel − 1 across a unit circle, (acos e − e√(1−e²))/π.
 */
export function vaneOpen(travel: number): number {
  const e = 2 * clamp01(travel) - 1;
  return (Math.acos(e) - e * Math.sqrt(Math.max(0, 1 - e * e))) / Math.PI;
}

/** The crossfade's two weights, linear in light: A at (1 − x), B at x. */
export const crossfadeWeights = (x: number | undefined): [number, number] => {
  const t = clamp01(Number.isFinite(x) ? x as number : 0.5);
  return [1 - t, t];
};

/** The settings this file reads, by name. */
export interface BankSettings {
  projLampA?: number; projLampB?: number;
  projShutterA?: number; projShutterB?: number;
  projCross?: number;
}

/**
 * Walk each vane (`travel[0]` A's, `travel[1]` B's, 0 open to 1 shut) toward
 * where its setting puts it, at a full travel in SHUTTER_SECONDS, over `dt`
 * real seconds (the stage's clocks, lib/stageClocks.ts: a shutter moves while
 * the plate is paused, as a real one does).
 */
export function walkShutters(travel: Float32Array, s: BankSettings, dt: number): void {
  const reach = Math.max(0, Number.isFinite(dt) ? dt : 0) / SHUTTER_SECONDS;
  const walk = (i: number, want: number) => {
    const d = want - travel[i];
    travel[i] = Math.abs(d) <= reach ? want : travel[i] + Math.sign(d) * reach;
  };
  walk(0, clamp01(s.projShutterA ?? 0));
  walk(1, clamp01(s.projShutterB ?? 0));
}

/**
 * Each projector's gain on the wall as the shader takes it: `out[0..2]` A's,
 * `out[4..6]` B's, in display values (each channel the linear gain to 1/2.2),
 * `out[3]` 1 when the two add as projectors, `out[7]` unused. `travel` is the
 * vanes' place (the stage clocks' `shutters`, or the settings' own where
 * nothing walks them: a harness, a still). Without two projectors there is one, A, and the
 * crossfade has nothing to fade to, so it is not applied.
 */
export function projectorGains(out: Float32Array | number[], s: BankSettings, two: boolean, travel?: ArrayLike<number>): void {
  const t0 = travel ? travel[0] : clamp01(s.projShutterA ?? 0);
  const t1 = travel ? travel[1] : clamp01(s.projShutterB ?? 0);
  const [wA, wB] = two ? crossfadeWeights(s.projCross) : [1, 0];
  const a = lampColour(s.projLampA ?? 1), b = lampColour(s.projLampB ?? 1);
  const gA = vaneOpen(t0) * wA, gB = vaneOpen(t1) * wB;
  for (let c = 0; c < 3; c++) {
    out[c] = Math.pow(a[c] * gA, 1 / DISPLAY_GAMMA);
    out[4 + c] = two ? Math.pow(b[c] * gB, 1 / DISPLAY_GAMMA) : 1;
  }
  out[3] = two ? 1 : 0;
  out[7] = 0;
}

/** What a lamp fader's readout says: its share of the rated voltage and the filament's colour, to the nearest 50 K. */
export const lampLabel = (v: number): string =>
  clampVariac(v) < LAMP_DARK ? 'Off' : `${Math.round(clampVariac(v) * 100)}% · ${Math.round(lampKelvinAt(v) / 50) * 50} K`;
