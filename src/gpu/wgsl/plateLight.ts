/**
 * Light summed where it is light (PLAN 38p, 18k-linear).
 *
 * The plate is drawn in display values: the canvas is `bgra8unorm`, not
 * `-srgb` (gpu/stage.ts), and the dye, the lamp and the palette are all
 * sRGB-encoded colours. For most of what the plate does that is right as it
 * stands, because Beer and Lambert are products and powers: a filter's
 * transmission to a power, or two filters multiplied, commute with the
 * encode, (x^a)^(1/2.2) = (x^(1/2.2))^a, so the dye's depth and two dishes
 * in one beam come out the same either way.
 *
 * Sums do not commute. Two lights on one screen add as light, and a fader
 * halfway between two pictures is half of each light; done on encoded
 * values both come out wrong, and in opposite directions. Half of white over
 * black reads 0.5 in display values where the light is 0.73 (half of white's
 * light, encoded), so every encoded fade sags dark in its middle; and two
 * half-bright lights added read 1.0, white, where the light they make is
 * 0.69, so every encoded add is too bright. The guess in 38p was 20 to 40%
 * in the mids, and that is about what it is.
 *
 * So each place that adds or fades light decodes what it sums, sums it as
 * light, and encodes the result, and nothing else in the plate changes:
 *
 * - `spectralThrough`, the six bands (Spectral Mix): each band's light is
 *   attenuated by its path and the eye's three responses SUM them. The
 *   absorbance read off an encoded colour is the light's over 2.2, so the
 *   band sum is done on the light's transmissions and encoded once.
 * - `mixLight`, a fade between two pictures: Lamp Ground between the painted
 *   and the lit plate (onGround, groundOf, the chemistry's colours, the
 *   closeup's depth), the mixer's levels (mixLevelled), and every mixer row
 *   laid by its own mix. Exact at both ends, so the 24 looks at Lamp Ground 1
 *   and every row at level 1 are the same picture to the bit.
 * - `addLight`, a beam over the plate or a source into the lamp: the LED ring
 *   and the lumia above the glass (screenOver), the lumia under it (in the
 *   lamp, plateLamp.ts), a mixer row's Add. The display clips where the sum
 *   passes white, as a projector's beam over a bright picture washes it out;
 *   the old screen formula could never reach white, which no light does.
 * - A mixer row's Screen and Multiply blends stay the blends they are named,
 *   computed on light (`blendLight`), and its key mix fades as light.
 * - The camera's depth of field and bloom (wgsl/camera.ts): a defocused
 *   pixel is the average of the light round it, and bloom is light the lens
 *   spreads, added. The bloom's threshold moves with it (0.55 in display
 *   values is 0.268 of the light) so the same highlights bloom.
 * - The ferro drop in the closeup (wgsl/ferroDrop.ts): Fresnel's reflectance
 *   is a share of the light, so it scales the light, and what the drop
 *   reflects is added to what its edge passes as light (38v's site, RS-35).
 *
 * The curve is the 2.2 power, the one the projectors' add (projectors.ts)
 * and the lens pass (glint.ts) already use, not the piecewise sRGB curve the
 * soap film and the glow use (plateThinFilm.ts): the two differ by under 1%
 * of the light above a display value of 0.1, and one curve for every sum the
 * plate makes keeps a fade of a fade honest.
 *
 * What was left in display values on purpose, and why, is PLAN 38p-1 (the
 * projector pass's beams, laid by the GPU's blend into an encoded canvas)
 * and 38p-2 (highlights drawn at a size in display values: the ferro glints
 * and dome rays, the photo style's speculars, the thin film's sheen, a
 * bead's glow; and the second plate's named blends on the black ground,
 * which are the Blend picker's choice of operation rather than two lights).
 * `npm run linearlight` measures every site here.
 */

/** Display value to light, the 2.2 power (negative values are none). */
export const LIGHT_WGSL = /* wgsl */ `
fn lightOf(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
fn displayOf(l: vec3f) -> vec3f { return pow(max(l, vec3f(0.0)), vec3f(1.0 / 2.2)); }

/* A fade from a to b by t, as light; a and b exactly at the ends. */
fn mixLight(a: vec3f, b: vec3f, t: f32) -> vec3f {
  if (t <= 0.0) { return a; }
  if (t >= 1.0) { return b; }
  return displayOf(mix(lightOf(a), lightOf(b), t));
}

/* Light l added to c. */
fn addLight(c: vec3f, l: vec3f) -> vec3f {
  return displayOf(lightOf(c) + lightOf(l));
}

/*
  Dyes mixed across six bands of the spectrum instead of three.

  A dye's colour is a spectrum, and light through two dyes is the product of
  their transmissions wavelength by wavelength; only then does the eye sum it
  into three responses. Doing the product on the three sums instead is the
  shortcut every RGB mixer takes, and it is why mixtures go muddy and
  thickness only darkens instead of shifting hue (dichromatism, which is why
  a deep glass of a yellow dye goes red). So the RGB absorbance is spread
  over six overlapping bands (420–670 nm), each band is attenuated by the
  path on its own, and the eye's three responses sum them back. White stays
  white: every row of the response sums to one.

  The sum is of light (38p): unit is an encoded transmission, whose
  absorbance is the light's over 2.2, so the bands are attenuated by 2.2
  times it and the summed light is encoded once. Encoded, a channel whose
  bands pass very unequally (one clear, one nearly shut) read darker than
  the light it passes: a deep yellow's green came out 0.33 where its light
  is 0.40 (`npm run linearlight` line 5), so deep dyes went darker and more
  saturated than they are.
*/
fn spectralThrough(unit: vec3f, path: f32) -> vec3f {
  let a = -log(max(unit, vec3f(1e-4))) * 2.2;
  let b0 = dot(a, vec3f(0.10, 0.10, 0.80));
  let b1 = dot(a, vec3f(0.05, 0.35, 0.60));
  let b2 = dot(a, vec3f(0.05, 0.80, 0.15));
  let b3 = dot(a, vec3f(0.35, 0.60, 0.05));
  let b4 = dot(a, vec3f(0.80, 0.20, 0.00));
  let b5 = dot(a, vec3f(0.95, 0.05, 0.00));
  let t0 = exp(-b0 * path); let t1 = exp(-b1 * path); let t2 = exp(-b2 * path);
  let t3 = exp(-b3 * path); let t4 = exp(-b4 * path); let t5 = exp(-b5 * path);
  return displayOf(vec3f(
    0.30 * t3 + 0.45 * t4 + 0.25 * t5,
    0.05 * t0 + 0.20 * t1 + 0.45 * t2 + 0.30 * t3,
    0.45 * t0 + 0.40 * t1 + 0.15 * t2));
}
`;
