/**
 * The dye's own refractive index, for the derive pass's optical path
 * (plate.ts, DERIVE_WGSL), PLAN 38u-10. Kept beside plate.ts, which is held
 * at its size ceiling. Reads decodeDensity, tex2 and AIR_HELD (plate.ts's
 * SAMPLING and DECODE, plateSlope.ts) and the plate's uniforms, so it is
 * joined in after them.
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
  bends red and blue differently (anomalous dispersion). PLAN 38u-19.

  Stored past half floats (PLAN 38u-20). The derive pass writes the path
  into .w of a half-float target, less clear water's 1.333, not the path
  itself. A half float's step near 1.333 is about 1e-3, and a real dye
  raises the path by about 1e-4: stored whole, a dye's edge rounded to
  nothing on one texel and to a whole step, ten times its real size, on the
  next, so at Dye Index Boost ×1 the wall out of focus saw a dye ten times
  stronger than it is, in stairs (the check skeptic's reading: 0.44% of the
  light at Focus 1, where the real index makes 0.04%). Near 0 a half float
  steps by under 1e-7, so the dye's own rise is kept to a fraction of a
  percent. Every reader is blind to the offset: defocusShadow takes a
  Laplacian of .w and the lamp's bend (lampDelayAt, plateLamp.ts) a
  gradient, which a constant does not move, and the closeup's camLap reads
  .w only on its own view, which writes the dye's path whole.

  One path for the rim in focus and the lines out of it (PLAN 18e-2): the
  derive pass's .z is |grad OPL| from the same taps, so oplPupilLoss bends
  by this index too. Before 38u-10 both read a stand-in, 0.06 per unit of
  density (retuned in 18e-2 so a dye's rim in focus kept its old weight),
  and .w took it again times max(1, 3 times Boundary Contrast). That gain
  is gone with it: the index has one dial, Dye Index Boost, and Boundary
  Contrast stays defocusShadow's gain on the whole column's shadow, which
  is a picture's contrast and not a claim about the liquid. At Boost 1 a
  dye-only look's rims are about 3400 times fainter than the stand-in drew
  them (0.06 against 1.78e-5 per unit), in focus as out of it.
*/
const DYE_DN_PER_ABSORBANCE: f32 = 1.78e-5;

fn dyeDn(t: vec4f) -> f32 {
  let a = decodeDensity(t.r) + decodeDensity(t.g) + decodeDensity(t.b);
  return a * (DYE_DN_PER_ABSORBANCE * U.dyeIndexBoost);
}

/*
  cellDensity (plateSlope.ts) with the dye's index beside it, from the same
  reads: x the cell's mean density, y its mean dyeDn, each read under the
  air held at the middle's own (c). The index is a mean of whole cells as
  the slope is (PLAN 31s-8): one read a tap sees one texel in four at 768,
  which at a high boost draws the flower again; and one set of reads for
  both keeps the derive pass's cost where it was.
*/
fn cellDye(t: texture_2d<f32>, air: texture_2d<f32>, uv: vec2f, c: vec2f, hasAir: bool) -> vec2f {
  let dims = vec2f(textureDimensions(t));
  let s = dims.x / U.logicalGrid;
  let a = (s / 3.0) / dims;
  let side = select((s - 1.0) * 0.5, 0.0, s < 1.5);
  var acc = vec2f(0.0);
  for (var j = -1; j <= 1; j++) {
    let wj = select(side, 1.0, j == 0);
    for (var i = -1; i <= 1; i++) {
      let wi = select(side, 1.0, i == 0);
      if (wi * wj == 0.0) { continue; }
      let q = uv + vec2f(f32(i), f32(j)) * a;
      let r = tex2(t, q);
      var v = vec2f(decodeDensity(r.a), dyeDn(r));
      if (hasAir) { v = mix(v, c, clamp(tex2(air, q).r, 0.0, 1.0) * AIR_HELD); }
      acc += (wi * wj) * v;
    }
  }
  let n = 1.0 + 2.0 * side;
  return acc / (n * n);
}
`;
