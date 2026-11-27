/**
 * The dye layer's slope for the display and derive passes (PLAN 15g-15,
 * 31s-8): a derivative of a Gaussian at one-cell spacing, each tap the mean
 * of the whole cell it stands for, with a bubble's air read as missing dye.
 * Built into the plate shader after tex2 and decodeDensity, which it calls.
 * A stopgap until the light is traced through the liquid's own surface
 * (PLAN 31s-2).
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
// So the slope is a derivative of a Gaussian with one tap per cell: every
// feature within reach of a pixel is weighted by its distance. SLOPE_SIGMA
// keeps the old stencil's reach (it spanned three cells either side), and
// the weights are scaled so a straight ramp of slope m a cell returns 3m,
// exactly what the old stencil returned. The 36 taps sit in a disc (r² up
// to 10 cells) because the Gaussian has fallen to a tenth past it.
//
// One tap per cell is not one tap per texel, and that was the flower's
// second life (PLAN 31s-8, 2026-11-22). A cell is 1/logicalGrid of the
// plate, always 192 across, while the dye texture is the solver's own grid:
// 768 at tier=local on a 2x screen, four texels a cell. A tap that reads one
// bilinear sample at the cell's middle sees one texel in four, so a rim
// a texel and a half wide (a sharp drop's, or the cut a bubble's air makes)
// was still seen only by the taps that happened to land on it: the same
// eight-fold copies, four texels apart, that 15g-15 had removed at 192. The
// owner saw them again at headed 2x Chrome on Galaxy, round every moving
// bubble and drop. A lens does not sample the plate at points; it gathers
// light from a continuous patch. So each tap is now the mean of its whole
// cell (cellDensity): nine bilinear reads laid out so their footprints tile
// the cell exactly, a box filter of the cell's width, and every texel under
// the kernel is counted once whatever the grid. At 192 (one texel a cell)
// it is the one read it always was.
const SLOPE_SIGMA: f32 = 1.5;
const SLOPE_REACH2: i32 = 10;

fn slopeWeight(r2: i32) -> f32 { return exp(-f32(r2) / (2.0 * SLOPE_SIGMA * SLOPE_SIGMA)); }

/*
  A bubble's air is missing dye, not dye at zero (PLAN 31s-8). Where the air
  has cut the dye the plate holds no column to bend light, so the relief
  there is undefined, and reading the cut as a fall to clear liquid lit a
  pool's edge round every hole (33b). Each read under the air is replaced by
  the pixel's own density (dC), which is what a hole tells the slope: nothing
  either way. Until 31s-8 the display flattened the normal instead, by the
  most air it found at eight points 4.5 cells round the pixel (airNear), and
  those eight points were a second flower round every bubble. AIR_HELD is
  the share held; scripts/holeline.mjs sets it to 0 for its control, which
  must find the old glow round the holes again.
*/
const AIR_HELD: f32 = 1.0;

fn heldAt(t: texture_2d<f32>, air: texture_2d<f32>, uv: vec2f, dC: f32, hasAir: bool) -> f32 {
  let d = decodeDensity(tex2(t, uv).a);
  if (!hasAir) { return d; }
  return mix(d, dC, clamp(tex2(air, uv).r, 0.0, 1.0) * AIR_HELD);
}

/*
  The mean of the cell centred on uv, in dye density, air held as above.
  s texels a cell: a box of width s centred on a texel weighs the middle
  texel and the s/2 − 1 either side by 1 and the two at ±s/2 by a half. Per
  axis that is three bilinear reads, one at the middle and one each side at
  s/3 weighted (s − 1)/2: at s = 4 the side read at 4/3 texel blends the
  next two texels 2:1, which times 1.5 is exactly 1 and 0.5. Neighbouring
  cells' half-texels meet, so the taps tile the plate with no gap (a 4-texel
  lattice of single reads is what left three texels in four unseen). At
  s = 2 it is a tent over three texels, within a few per cent of the box;
  at 1024 (s ≈ 5.3) the side read spans the two outer texels, the third
  from the middle weighed a sixth too little. Below 1.5 texels a cell the
  one read already covers it.
*/
fn cellDensity(t: texture_2d<f32>, air: texture_2d<f32>, uv: vec2f, dC: f32, hasAir: bool) -> f32 {
  let dims = vec2f(textureDimensions(t));
  let s = dims.x / U.logicalGrid;
  if (s < 1.5) { return heldAt(t, air, uv, dC, hasAir); }
  let a = (s / 3.0) / dims;
  let side = (s - 1.0) * 0.5;
  var acc = 0.0;
  for (var j = -1; j <= 1; j++) {
    let wj = select(side, 1.0, j == 0);
    for (var i = -1; i <= 1; i++) {
      let wi = select(side, 1.0, i == 0);
      acc += wi * wj * heldAt(t, air, uv + vec2f(f32(i), f32(j)) * a, dC, hasAir);
    }
  }
  let n = 1.0 + 2.0 * side;
  return acc / (n * n);
}

// The air the pixel itself stands in, 0 with no bubbles bound (the 1x1 blank).
fn airAt(air: texture_2d<f32>, uv: vec2f) -> f32 {
  if (textureDimensions(air).x <= 1u) { return 0.0; }
  return clamp(tex2(air, uv).r, 0.0, 1.0) * AIR_HELD;
}

fn sobelGrad(t: texture_2d<f32>, air: texture_2d<f32>, fuv: vec2f) -> vec2f {
  let cell = 1.0 / U.logicalGrid;
  let hasAir = textureDimensions(air).x > 1u;
  let dC = cellDensity(t, air, fuv, 0.0, false);
  var gs = vec2f(0.0);
  var m2 = 0.0;
  for (var j = -3; j <= 3; j++) {
    for (var i = -3; i <= 3; i++) {
      let r2 = i * i + j * j;
      if (r2 == 0 || r2 > SLOPE_REACH2) { continue; }
      let w = slopeWeight(r2);
      let k = vec2f(f32(i), f32(j));
      gs += k * (w * cellDensity(t, air, fuv + k * cell, dC, hasAir));
      m2 += f32(i * i) * w;
    }
  }
  // Inside the air there is no dye to slope at all.
  return gs * (3.0 / m2) * (1.0 - airAt(air, fuv));
}
`;
