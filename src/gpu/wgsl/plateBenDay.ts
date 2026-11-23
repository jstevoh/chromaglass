/**
 * The Ben-Day print's pen line round each plate's shapes and seams (PLAN 21b,
 * `npm run benday`). Built into `plate.ts` after `benDayInkIndex` and
 * `BENDAY_EDGE`, and called once per plate (`layer0` at `fuv0`, `layer1` at
 * `fuv1`) while `benDay` is up.
 *
 * Why it is its own module: `plate.ts` is over the size budget (`npm run
 * sizes`) and may not grow, so the shared outline moved here when the back
 * plate gained its own line.
 */
export const BENDAY_OUTLINE_WGSL = /* wgsl */ `
/*
  The outline of each plate's shapes, as thick as a pen's line.

  The first try drew it from the finished picture, as a contour: the
  coverage's distance to the solid threshold, over its gradient. A contour
  like that can only be as wide as the edge it is drawn on, since past the
  edge the gradient is nothing, and the gooey contrast sharpens a pool's
  edge to a pixel or two: the line came out a hair (two pixels at 512 in
  the lab), where a panel's is a pen stroke. So the line is drawn from each
  plate's own dye instead: eight taps on a ring of the line's half-width
  round the pixel, and the pixel is on the line when the ring has both solid
  ink and something less on it (it is within that distance of the shape's
  edge), or two different inks (of a seam). Solid is read as benDay() reads
  it, opacity times the colour's coverage (benDayStrength), and not opacity
  alone: a pale wash is opaque enough, and opacity drew a soft grey band
  round every wash and a line through the middle of two of them. The first
  is the ring's range straddling BENDAY_EDGE, cut over a pixel so the line's
  own edge is antialiased and not smeared; the second is a step, and is
  only ever inside a line's width of a solid shape. Only while the print is
  up, so eight decodes a pixel per plate cost nothing on any other look.
*/
/**
 * How much ink a decoded dye sample lays: its opacity times its colour's
 * coverage, as benDay() reads coverage.
 */
fn benDayStrength(f: vec4f) -> f32 {
  let hi = max(f.r, max(f.g, f.b));
  return f.a * (hi - min(f.r, min(f.g, f.b))) / max(hi, 1e-4);
}
fn benDayEdge(t: texture_2d<f32>, fuv: vec2f, px: f32) -> f32 {
  let rad = px * max(1.0, U.resolution.y / BENDAY_ROWS * BENDAY_LINE);
  let c = decodeFluid(t, fuv, 0.0, false);
  let sc = benDayStrength(c);
  var lo = sc;
  var hi = sc;
  var first = -1.0;
  var seam = 0.0;
  if (sc > BENDAY_EDGE) { first = benDayInkIndex(c.rgb); }
  for (var k = 0; k < 8; k++) {
    let a = f32(k) * 0.78539816;
    let f = decodeFluid(t, fuv + vec2f(cos(a), sin(a)) * rad, 0.0, false);
    let sf = benDayStrength(f);
    lo = min(lo, sf);
    hi = max(hi, sf);
    if (sf > BENDAY_EDGE) {
      let ink = benDayInkIndex(f.rgb);
      if (first < 0.0) { first = ink; } else if (ink != first) { seam = 1.0; }
    }
  }
  // Positive while the ring straddles the threshold, and cut at 0 over a
  // pixel of its own gradient: over a smooth one the plain smoothstep of
  // each end left a band of grey a dozen pixels wide beside the line.
  let straddle = min(hi - BENDAY_EDGE, BENDAY_EDGE - lo);
  let edge = clamp(straddle / max(fwidth(straddle), 1e-5) + 0.5, 0.0, 1.0);
  return max(edge, seam);
}
`;
