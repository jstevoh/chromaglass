/**
 * The dye layer's slope for the display and derive passes (PLAN 15g-15): a
 * derivative of a Gaussian at one-cell spacing, in place of the Sobel stencil
 * whose taps sat three cells apart and drew the flower. Built into the plate
 * shader after tex2 and decodeDensity, which it calls. A stopgap until the
 * light is traced through the liquid's own surface (PLAN 31s-2).
 */
export const SLOPE_WGSL = /* wgsl */ `
// The dye layer's slope, which bends the lamp's light at every edge. Until
// 2026-11-22 this was a Sobel stencil whose nine taps sat three cells apart.
// A stencil that sparse cannot see anything narrower than its own spacing
// except when one of its taps happens to land on it: a small dark drop or a
// bubble's cut, two cells across, was "seen" by the stencil centred three
// cells to its left, three cells above, three cells diagonally away and so
// on, so its slope appeared at eight places round it (four at three cells,
// four at three times the square root of two) and the aperture loss in
// refractionOptics darkened each of them. That was the "flower" the owner
// kept seeing round moving bubbles and drops in the ambient films: eight
// grey discs, alternately 45 and 63 px from a dark core in a 1080p frame,
// the ratio of a square stencil's edge to its corner. Nothing in a real
// projector does that. The lens gathers light from a continuous patch of the
// plate, and the slope that bends it is the slope of a surface the solver
// already holds smooth at about two cells.
//
// So the slope is now a derivative of a Gaussian sampled at one cell, which
// is above the field's Nyquist rate: every feature, however narrow, is seen
// by every pixel within reach of it, weighted by distance, and gives one
// continuous ring of slope instead of eight copies. SLOPE_SIGMA keeps the
// old stencil's reach (it spanned three cells either side), and the weights
// are scaled so a straight ramp of slope m a cell returns 3m, exactly what
// the old stencil returned: a broad edge looks as it did, only a feature
// narrower than three cells changes. The 36 taps sit in a disc (r² up to 10
// cells) because the Gaussian has fallen to a tenth past it.
const SLOPE_SIGMA: f32 = 1.5;
const SLOPE_REACH2: i32 = 10;

fn slopeWeight(r2: i32) -> f32 { return exp(-f32(r2) / (2.0 * SLOPE_SIGMA * SLOPE_SIGMA)); }

fn sobelGrad(t: texture_2d<f32>, fuv: vec2f) -> vec2f {
  let cell = 1.0 / U.logicalGrid;
  var gs = vec2f(0.0);
  var m2 = 0.0;
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      let r2 = i * i + j * j;
      if (r2 == 0 || r2 > SLOPE_REACH2) { continue; }
      let w = slopeWeight(r2);
      let k = vec2f(f32(i), f32(j));
      gs += k * (w * decodeDensity(tex2(t, fuv + k * cell).a));
      m2 += f32(i * i) * w;
    }
  }
  return gs * (3.0 / m2);
}
`;
