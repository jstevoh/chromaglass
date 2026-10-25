/**
 * Lamp Warmth, read in kelvin.
 *
 * The slider is a lamp temperature. Its travel is even in mireds (a million
 * over the kelvin), the unit lighting designers step colour in because equal
 * steps of it look equal to the eye, where equal steps of kelvin crowd all
 * the change into the warm end. The plate multiplies the picture by the
 * blackbody's own colour at that temperature (`lampTint`): its red, green
 * and blue against the neutral's, taken from Planck's law and the eye's
 * response, not a tint chosen by eye.
 *
 * It used to be a fixed tint mixed in by the slider, which topped out at
 * about 5100 K, a warm morning and not the 3200 K of the quartz-halogen lamps
 * in the old overhead projectors (PLAN 35e-2). The travel is now wider, and
 * the numbers saved looks already hold keep their colour: 0 to 1 is still
 * 6500 K to 5100 K (the new law agrees with the old one to a few mireds all
 * along it), and 1 to `LAMP_WARMTH_MAX` carries on to 3200 K.
 *
 * The neutral is 6500 K: the blackbody nearest the white of sRGB, which the
 * plate shows when the grade is off.
 *
 * Planck's law summed over the visible band, with the CIE 1931 colour
 * matching functions in Wyman, Sloan and Shirley's multi-lobe fit (JCGT
 * 2013), then XYZ to linear sRGB. Nothing here is a table of colours typed
 * in by eye.
 */

/** Where the slider ends: the quartz-halogen lamp of an overhead projector. */
export const HALOGEN_KELVIN = 3200;

/** The slider's top. 1 is the old end of the travel (about 5100 K); this is the halogen. */
export const LAMP_WARMTH_MAX = 3.75;

/**
 * The old grade at Lamp Warmth 1, `vec3f(1.06, 0.9, 0.7)`, kept as the thing
 * the new one is held to over the old range (`npm run panel`).
 */
export const LEGACY_GRADE = [1.06, 0.9, 0.7] as const;

/** The red the old grade added at its end: a lamp's warm picture is a little redder than the white, not only less blue. */
const RED_LIFT = 0.06;

/** Lamp Warmth 0, the plate's own white, as the blackbody it is nearest to. */
export const NEUTRAL_KELVIN = 6500;

const lobe = (x: number, m: number, s1: number, s2: number) => {
  const t = (x - m) / (x < m ? s1 : s2);
  return Math.exp(-0.5 * t * t);
};
const cieX = (l: number) => 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
const cieY = (l: number) => 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
const cieZ = (l: number) => 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);

/** Planck's law, relative: the constants that do not depend on the temperature are dropped. */
const planck = (nm: number, kelvin: number) => {
  const c2 = 1.4388e7;            // hc/k in nm·K
  return 1 / (nm ** 5 * (Math.exp(c2 / (nm * kelvin)) - 1));
};

/** The blackbody's colour in linear sRGB, at an arbitrary brightness. */
export function blackbodyLinear(kelvin: number): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (let nm = 380; nm <= 780; nm += 5) {
    const p = planck(nm, kelvin);
    x += p * cieX(nm); y += p * cieY(nm); z += p * cieZ(nm);
  }
  return [
    3.2406 * x - 1.5372 * y - 0.4986 * z,
    -0.9689 * x + 1.8758 * y + 0.0415 * z,
    0.0557 * x - 0.2040 * y + 1.0570 * z,
  ];
}

const NEUTRAL = blackbodyLinear(NEUTRAL_KELVIN);

/** A blackbody's red, green and blue against the neutral's: how it shifts a white picture. */
export function blackbodyShift(kelvin: number): [number, number, number] {
  const c = blackbodyLinear(kelvin);
  return [c[0] / NEUTRAL[0], c[1] / NEUTRAL[1], c[2] / NEUTRAL[2]];
}

const MIRED_NEUTRAL = 1e6 / NEUTRAL_KELVIN;
const MIRED_PER_UNIT = (1e6 / HALOGEN_KELVIN - MIRED_NEUTRAL) / LAMP_WARMTH_MAX;

/** The colour temperature at Lamp Warmth `warmth`, unrounded: even steps of the slider are even steps of mired. */
export function warmthKelvin(warmth: number): number {
  const w = Math.max(0, Math.min(LAMP_WARMTH_MAX, Number.isFinite(warmth) ? warmth : 0));
  return 1e6 / (MIRED_NEUTRAL + MIRED_PER_UNIT * w);
}

let tintMemo: { w: number; tint: [number, number, number] } | null = null;
/**
 * What the plate multiplies the picture by at Lamp Warmth `warmth`: the
 * blackbody's red, green and blue against the neutral's, held to the red
 * channel so that warmth takes its light from blue and green and leaves red
 * where it was, plus the small red lift the old grade had.
 * (A real lamp at 3200 K gives a camera balanced for daylight about a third of
 * the light the 6500 K one does; that is the figure the warm end shows, and
 * Exposure is the control that puts it back.)
 */
export function lampTint(warmth: number): [number, number, number] {
  const w = Math.max(0, Math.min(LAMP_WARMTH_MAX, Number.isFinite(warmth) ? warmth : 0));
  if (tintMemo && tintMemo.w === w) return tintMemo.tint;
  const s = blackbodyShift(warmthKelvin(w));
  const lift = 1 + RED_LIFT * Math.min(w, 1);
  const tint: [number, number, number] = [lift, lift * s[1] / s[0], lift * s[2] / s[0]];
  tintMemo = { w, tint };
  return tint;
}

/** What the readout says: to the nearest 50 K, as a lighting plot would. */
export const kelvinLabel = (warmth: number): string => `${Math.round(warmthKelvin(warmth) / 50) * 50} K`;

/**
 * The colour a filament glows at this temperature, as `#rrggbb`: the
 * blackbody's own chromaticity at full brightness (its brightest channel at
 * 255), sRGB encoded. Hot reads white-blue, cool amber and then red.
 */
export function blackbodyHex(kelvin: number): string {
  const c = blackbodyLinear(kelvin);
  const peak = Math.max(c[0], c[1], c[2]) || 1;
  const enc = (v: number) => {
    const l = Math.max(0, v / peak);
    const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, s)) * 255).toString(16).padStart(2, '0');
  };
  return `#${enc(c[0])}${enc(c[1])}${enc(c[2])}`;
}
