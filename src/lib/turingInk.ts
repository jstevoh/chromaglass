/*
  The colour a Turing pattern prints in when it is the poured reagent's own
  reaction, not a look's (a look with Chemistry on keeps its palette).

  The real Turing reaction in a dish, CIMA and its CDIMA form (Castets, Dulos,
  Boissonade and De Kepper, 1990; Ouyang and Swinney, 1991), is shown with
  starch, or polyvinyl alcohol, in the gel: where iodide runs high, triiodide
  sits in the starch helix, and that complex absorbs broadly round 580–620 nm.
  It is the blue-black of an iodine test, deep indigo thin and nearly black
  thick, printed into the pale straw of the free iodine round it (the bottle's
  own colour, types.ts). The colour below is that indigo at the depth one
  deposit lays; more of it goes to black on its own, because the dye is
  absorbance and adds (lib/dye.ts).

  Before, the pattern printed in whatever colour the look's palette cycled
  to, and the bottle poured a hot pink, '#ff88ff', that no reagent has.
*/
export const TURING_PRODUCT = { r: 0.17, g: 0.2, b: 0.46 } as const;

/*
  The print's colour (PLAN 26d-3). The print was starch's indigo whatever was
  asked of it, because starch with iodine is what a CIMA dish is. Other
  indicators make other colours (a dish with methyl violet, or ferroin in the
  Belousov-Zhabotinsky dish, goes red and blue), so the colour is a choice:
  0 is the indigo above, kept as the look's default, and above 0 a hue round
  the wheel (0.01 red, a third green, two thirds blue).

  The hue is drawn at full strength, not at the indigo's depth. The plate
  reads the print's colour as a colour and the deposit lays a density of 1.6
  of it, which the multiply blend takes to near black unless the colour is
  bright: measured in the lab (scripts/turing.mjs), a green of the indigo's
  depth (0.12, 0.48, 0.12) printed black with a thin green rim, its darkest
  fifth at 0.05 of the white in its own channel, and the same hue at
  (0.05, 0.95, 0.05) printed a solid green at 0.79. Starch is dark by design,
  the black-and-white print the look is for, so only a chosen ink is bright.
*/
export function turingInk(ink: number): { r: number; g: number; b: number } {
  if (!(ink > 0)) return TURING_PRODUCT;
  const h = (ink % 1) * 6, s = 0.9, l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return { r: r + m, g: g + m, b: b + m };
}
