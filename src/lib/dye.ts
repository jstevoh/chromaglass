/**
 * A dye's absorbance from the colour it is named by (PLAN 18l).
 *
 * The plate stores dye the physical way: per channel, the absorbance
 * −log(T) of one unit of it, times how much has landed, so two dyes over
 * each other multiply their transmissions and a pool twice as deep lets
 * through the square (Beer–Lambert). What a palette colour is, then, is the
 * transmission of one unit of the dye: Sunshine Yellow lets through all of
 * the red, 92% of the green and none of the blue.
 *
 * "None" was the fault. The palette is display colours, and half of them sit
 * on the corners of the screen's gamut, a channel at exactly 0 and another at
 * exactly 1. Read as a dye that is a perfect filter: it passes everything or
 * nothing of each band, at any depth. A perfect filter has one colour however
 * thick it is (1ⁿ is 1 and 0ⁿ is 0), so every pool on the plate was one flat
 * colour from its thin rim to its deep core, and the only thing depth could
 * change was how opaque it was. And because nothing was a floor of 0.002 (an
 * absorbance of 6.2, nearly fifty times the yellow's green), a sixth of a
 * blocking dye mixed into another was enough to kill that channel outright,
 * so where two colours met the mixture ran most of its way at one end.
 * Measured in the lab on Classic's yellow, pink and blue (the owner,
 * 2026-10-04: "there just aren't enough colours"), 68 distinct colours on a
 * sheared plate.
 *
 * No real dye does that. A food dye or an ink in a dish of a few millimetres
 * absorbs strongly across its band, but its band has tails: at the depth it
 * shows its colour it still lets a few percent through where it is darkest
 * and takes a few percent out where it is clearest (tartrazine passes about
 * 90% of the red at a depth that leaves 5% of the blue). So the colour a dye
 * is named by is read as its transmission through one unit, with the
 * transmission held between those real limits: through a thin wash the dye
 * is a pale tint of itself, at one unit it is the palette's colour, and
 * deeper it saturates and darkens with its hue shifting as the weaker
 * channels go first (a deep yellow goes amber, a deep pink crimson), which
 * is dichromatism in three bands. Mixtures walk between their ends more
 * evenly, and over complementary dyes go dark rather than dead black.
 * With depth drawn (Transmission at 1, the default since this), Classic's
 * plate read 98 distinct colours where it read 68.
 *
 * Three bands, not a spectrum: still the shortcut Spectral Optics was built
 * to undo (PLAN 18l carries replacing it with real dye spectra).
 */

/** The least a dye lets through of any band at one unit: a few percent, not none. */
export const DYE_FLOOR = 0.04;
/** The most it lets through: every real dye takes a little out of its clearest band. */
export const DYE_CEILING = 0.96;

/** The absorbance of one unit of the dye named by this colour, one channel (0..1). */
export function dyeAbsorbance(channel: number): number {
  return -Math.log(Math.min(DYE_CEILING, Math.max(DYE_FLOOR, channel)));
}

/*
  White is not a dye. A colour clear in every band (Pure White, a star in
  Stardust Collapse, the plain drop's 1/1/1) is clear liquid poured onto the
  plate, which absorbs nothing, so the ceiling is not put on it: held to 96%
  in all three it would lay a faint grey filter (85% of the light at four
  units' depth), and Ferro Maze's clear dish would dim. Only a colour that
  has a band to absorb in is a dye with tails.
*/
const isClear = (r: number, g: number, b: number) => Math.min(r, g, b) >= DYE_CEILING;

/** The absorbance of one unit of the liquid named by this colour, all three channels. */
export function dyeAbsorbances(r: number, g: number, b: number): [number, number, number, number, number, number] {
  if (isClear(r, g, b)) {
    const c = -Math.log(Math.min(1, Math.min(r, g, b)));
    return [c, c, c, c, c, c];
  }
  
  // Real Spectral Synthesis!
  // To get beautiful subtractive mixing, we want each color to be a smooth, 
  // wide absorption band.
  // We will map the 6 bands to roughly: 
  // 0: 420nm (Violet)
  // 1: 470nm (Blue)
  // 2: 520nm (Cyan/Green)
  // 3: 570nm (Yellow/Green)
  // 4: 620nm (Orange)
  // 5: 670nm (Red)
  
  // Convert RGB to an approximate absorption spectrum.
  // Instead of using pure RGB (which creates artificial blocks), we use the old 
  // Spectral Optics matrix to create a smooth 6-band absorbance, but we widen it 
  // slightly so Blue and Yellow overlap more in the Green bands!
  
  const ar = dyeAbsorbance(r);
  const ag = dyeAbsorbance(g);
  const ab = dyeAbsorbance(b);
  
  // We use a modified matrix that allows "Blue" to transmit more Cyan/Green,
  // and "Yellow" to transmit more Cyan/Green.
  // ar (absorbs Red): Cyan ink.
  // ag (absorbs Green): Magenta ink.
  // ab (absorbs Blue): Yellow ink.
  
  let b0 = ab * 0.90 + ag * 0.10 + ar * 0.00; // Violet
  let b1 = ab * 0.60 + ag * 0.35 + ar * 0.05; // Blue
  let b2 = ab * 0.15 + ag * 0.50 + ar * 0.35; // Cyan-Green
  let b3 = ab * 0.05 + ag * 0.50 + ar * 0.45; // Yellow-Green
  let b4 = ab * 0.00 + ag * 0.20 + ar * 0.80; // Orange
  let b5 = ab * 0.00 + ag * 0.05 + ar * 0.95; // Red

  return [b0, b1, b2, b3, b4, b5];
}



/** WGSL for the same, so a picture poured as dye (`wgsl/splat.ts`) is the same dye. */
export const DYE_ABSORBANCE_WGSL = /* wgsl */ `
fn dyeAbsorbance(c: vec3f) -> vec3f {
  if (min(c.r, min(c.g, c.b)) >= ${DYE_CEILING}) { return -log(min(c, vec3f(1.0))); }
  return -log(clamp(c, vec3f(${DYE_FLOOR}), vec3f(${DYE_CEILING})));
}
`;
