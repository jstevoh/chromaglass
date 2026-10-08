/**
 * What colour a bottle pours: the liquid's own, through whatever dye is in it.
 *
 * What was reported (the owner, 2026-10-05): "Some of the liquids don't
 * carry color. Let's make them by default the correct color, but allow them
 * to have color as well." Each bottle had one colour, and that colour was
 * all dye: Syrup poured a red-orange, Alcohol a mint, Oil an orange, and
 * Glycerine, Silicone, Soap and Milk pale swatches that were neither the
 * liquid nor a colour anyone picked. So a bottle's colour said nothing about
 * the liquid, and picking a dye replaced the liquid's own colour instead of
 * tinting it.
 *
 * Now a bottle the shelf ships has its own colour (`LiquidType.own`), what
 * the liquid itself does to the lamp's light through a dish's depth of it,
 * and that is its colour until a dye is picked. A dye picked for it is in
 * the liquid, not instead of it: both absorb, so their absorbances add and
 * their transmissions multiply (Beer–Lambert), which is the product below.
 * Amber syrup with a blue dye in it goes green-dark, as it does in a glass;
 * a clear liquid with a dye in it is that dye.
 *
 * A clear liquid poured with no dye lays no colour at all. It is still
 * poured (its volume, its viscosity and its tension go where they always
 * went, lib/liquidProps.ts, lib/liquidPhase.ts): what shows is the liquid it
 * pushes aside, the clear hole a real drop of glycerine or alcohol opens in
 * a coloured dish, and on the lamp's ground the lamp shining through it.
 * Laying it as white dye would paint it as a white body on the black
 * ground, which is milk, not glycerine.
 *
 * Milk is the one that is white, and it is white because it scatters
 * (`scatter`, its fat droplets), not because it absorbs. The plate has no
 * scattering yet (PLAN 18j), so until it does a scattering liquid is laid as
 * a white body, the way the black ground has always drawn white: that is
 * milk seen by reflected light. Under a projector's lamp real milk throws a
 * warm grey shadow (the scattered light misses the lens), which 18j owns.
 *
 * A bottle with no `own` (the owner's own from the Liquid Designer, Ink,
 * which is a dye) pours its colour as it always has.
 */
import type { LiquidType } from '../types';
import { DYE_CEILING } from './dye.ts';

type Bottle = Pick<LiquidType, 'color' | 'own' | 'behaviour'> | undefined;

/*
  Its own parse rather than constants.ts's hexToRgb, so that the node check
  (`npm run natural`) can load this file without the app's module graph.
  The same reading: #rrggbb to 0..1, anything else white.
*/
const MAX_HEX_CACHE = 512;
const hexCache = new Map<string, { r: number; g: number; b: number }>();
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  if (typeof hex !== 'string' || hex.length > 9) return { r: 1, g: 1, b: 1 };
  const hit = hexCache.get(hex);
  if (hit) return hit;
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  const rgb = m
    ? { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 }
    : { r: 1, g: 1, b: 1 };
  if (hexCache.size >= MAX_HEX_CACHE) {
    const oldest = hexCache.keys().next().value;
    if (oldest !== undefined) hexCache.delete(oldest);
  }
  hexCache.set(hex, rgb);
  return rgb;
}

/** Clear in every band: absorbs nothing a dye's tails would (lib/dye.ts, the same test). */
const clearHex = (hex: string): boolean => {
  const c = hexToRgb(hex);
  return Math.min(c.r, c.g, c.b) >= DYE_CEILING;
};

/** Whether the bottle holds no dye: its colour is the liquid's own. */
export function isNatural(liq: Bottle): boolean {
  return !!liq?.own && liq.color.toLowerCase() === liq.own.toLowerCase();
}

/** Whether the liquid itself is clear (and does not scatter), so that poured alone it lays no colour. */
export function isClearLiquid(liq: Bottle): boolean {
  return !!liq?.own && clearHex(liq.own) && !((liq.behaviour?.scatter ?? 0) > 0);
}

/**
 * The colour a pour of this bottle lays, 0..1 per channel, and how much of
 * the tool's dye it lays: 0 for a clear liquid with no dye in it, else 1.
 *
 * `dye` is the colour the pour was asked for, when it is not the bottle's
 * own colour field (a take played back, the phone's Drop): a gesture that
 * carries a colour carries the bottle's colour at the time, so it is read
 * as the dye in this bottle's liquid, the same as the bottle's own field.
 */
export function pourTint(liq: Bottle, dye?: string): { rgb: { r: number; g: number; b: number }; dose: number } {
  const hex = dye ?? liq?.color ?? '#ffffff';
  const d = hexToRgb(hex);
  if (!liq?.own) return { rgb: d, dose: 1 };
  if (hex.toLowerCase() === liq.own.toLowerCase()) {
    return { rgb: d, dose: isClearLiquid(liq) ? 0 : 1 };
  }
  /*
    A white "dye" is no dye (lib/dye.ts: white is clear liquid), so a
    clear bottle given Pure White is the clear liquid alone, as Natural is.
  */
  if (clearHex(hex) && isClearLiquid(liq)) return { rgb: d, dose: 0 };
  const o = hexToRgb(liq.own);
  return { rgb: { r: o.r * d.r, g: o.g * d.g, b: o.b * d.b }, dose: 1 };
}

/** The swatch a bottle shows: its colour, or a ring with nothing in it for clear liquid with no dye. */
export function bottleSwatch(liq: Bottle): { backgroundColor: string } {
  if (isNatural(liq) && isClearLiquid(liq)) return { backgroundColor: 'transparent' };
  return { backgroundColor: liq?.color ?? '#ffffff' };
}

/**
 * The colour a pour laid, as a gesture carries it: the hex of what landed,
 * or `clear` for a clear liquid that laid none.
 *
 * A take records this, not the bottle's colour field, so it plays back what
 * was performed whatever bottle is picked when it is played: the bottle's
 * colour is the dye in it, and the same dye in amber syrup and in clear
 * water lands as two colours. And the phone's and the remote's Drop send
 * it, worked out here on the laptop where the bottle is, so applyGesture
 * lays a gesture's colour as it comes (as it did for every take recorded
 * before bottles had colours of their own).
 */
export function laidColour(liq: Bottle, dye?: string): { color?: string; clear?: true } {
  const t = pourTint(liq, dye);
  if (t.dose === 0) return { clear: true };
  const h = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return { color: `#${h(t.rgb.r)}${h(t.rgb.g)}${h(t.rgb.b)}` };
}
