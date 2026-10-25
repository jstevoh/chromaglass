/**
 * Lamp Warmth, read in kelvin.
 *
 * The slider has always been a number from 0 to 1, and a lighting designer
 * does not think in that: the lamp is a temperature. The plate's grade
 * (`plate.ts`, "Lamp warmth") multiplies the picture by a fixed warm tint,
 * `LAMP_GRADE`, in proportion to the slider. This reads that tint as the
 * colour temperature it matches: the blackbody, seen by an eye adapted to
 * the plate's own white, whose red-to-blue ratio is the grade's at that
 * position. So the figure is not a label put on the slider but a reading of
 * what the shader does, and it is held to it by `npm run panel`.
 *
 * What it says, which the slider never did: the grade at full is about
 * 5100 K, the colour of a warm morning, and not the 3200 K of the quartz
 * halogen lamps in the old overhead projectors. A wider grade that reached
 * 3200 K would change every look that uses the lamp (PLAN 35e-3), so it is
 * written down and not done here.
 *
 * The neutral is 6500 K: the blackbody nearest the white of sRGB, which the
 * plate shows when the grade is off.
 *
 * Planck's law summed over the visible band, with the CIE 1931 colour
 * matching functions in Wyman, Sloan and Shirley's multi-lobe fit (JCGT
 * 2013), then XYZ to linear sRGB. Nothing here is a table of colours typed
 * in by eye.
 */

/** The tint `plate.ts` multiplies the picture by at Lamp Warmth 1 (its `vec3f(1.06, 0.9, 0.7)`). */
export const LAMP_GRADE = [1.06, 0.9, 0.7] as const;

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

/** The grade's red over blue at a position of the slider: `mix(1, grade, w)` per channel. */
export function gradeRedOverBlue(warmth: number): number {
  const w = Math.max(0, Math.min(1, warmth));
  return (1 + (LAMP_GRADE[0] - 1) * w) / (1 + (LAMP_GRADE[2] - 1) * w);
}

const T_LOW = 2000, T_STEP = 10;
let redOverBlue: number[] | null = null;
/** r/b of the blackbody against the neutral, from 2000 K to the neutral in steps of 10 K, built once. */
function ratios(): number[] {
  if (redOverBlue) return redOverBlue;
  const out: number[] = [];
  for (let t = T_LOW; t <= NEUTRAL_KELVIN; t += T_STEP) {
    const s = blackbodyShift(t);
    out.push(s[0] / s[2]);
  }
  return (redOverBlue = out);
}

/**
 * The colour temperature the grade matches at Lamp Warmth `warmth` (0 to 1),
 * unrounded: the blackbody whose red over blue equals the grade's.
 */
export function warmthKelvin(warmth: number): number {
  const target = gradeRedOverBlue(warmth);
  const r = ratios();
  // Red over blue falls as the temperature rises: find where it crosses the target.
  let lo = 0, hi = r.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r[mid] > target) lo = mid; else hi = mid;
  }
  const span = r[lo] - r[hi];
  const f = span > 1e-12 ? (r[lo] - target) / span : 0;
  return Math.min(NEUTRAL_KELVIN, T_LOW + (lo + Math.max(0, Math.min(1, f))) * T_STEP);
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
