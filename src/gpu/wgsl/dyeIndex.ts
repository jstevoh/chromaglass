/**
 * The dye's own refractive index, for the derive pass's optical path
 * (plate.ts, DERIVE_WGSL), PLAN 38u-10. Kept beside plate.ts, which is held
 * at its size ceiling. Reads decodeDensity (plate.ts's DECODE) and the
 * plate's uniforms, so it is joined in after both.
 */
export const DYE_INDEX_WGSL = /* wgsl */ `
/*
  How far a dye raises the liquid's index, per unit of its stored absorbance
  (PLAN 38u-10). The derive pass used to add d times 0.015 times max(1,
  3 times Boundary Contrast): a stand-in that gave a dye-only look its Becke
  lines, between 270 and 800 times what real dye does. The owner chose
  (2026-11-14) the real strength by default and a dial that says it is a
  boost past real (Dye Index Boost), so this is the measurement.

  The measurement: tartrazine in water (arXiv 2503.05105), the food dye a
  yellow light show bottle is made of. Its molar absorptivity is 25.0 per mM
  per cm at its band (molar mass 534.36, so 46.8 L per gram per cm), and its
  solutions' index rises from water's 1.337 to 1.5163 across 0.09 to 0.81 M,
  close to linear: dn/dc about 0.41 mL/g. The dye's index and its
  absorption are one response seen two ways (Kramers and Kronig), so the
  rise goes with how much light the dye takes: the field's own absorbance,
  summed over the three channels (a dye that takes all three, like a black,
  has more oscillator strength than one that takes blue alone, and raises
  the index more).

  The arithmetic: one unit of decodeDensity in a channel is 2.8 nat across
  the rest gap of 0.6 cm (decodeFluid's amount, and the gap scale makes d a
  concentration, so the index needs no gap term), which is 2.8 / 2.303 /
  0.6 = 2.03 decadic absorbance per cm, a concentration of 2.03 / 46800 =
  4.33e-5 g/mL, and 0.41 times that is 1.78e-5. A dye deep enough to take
  96% of one channel's light across the gap (3.2 nat, 1.14 units) raises
  the index by 2e-5: invisible, as a real dilute dye is. A dye's Becke lines
  are then the boost's to draw: the old stand-in sat at about 300 to 600 times.

  Shortcut, named: one dn/dc for every dye, tartrazine's, scaled by each
  dye's absorbance; one index for all wavelengths, though near its band a dye
  bends red and blue differently (anomalous dispersion). PLAN 38u-17.
*/
const DYE_DN_PER_ABSORBANCE: f32 = 1.78e-5;

fn dyeDn(t: vec4f) -> f32 {
  let a = decodeDensity(t.r) + decodeDensity(t.g) + decodeDensity(t.b);
  return a * (DYE_DN_PER_ABSORBANCE * U.dyeIndexBoost);
}
`;
