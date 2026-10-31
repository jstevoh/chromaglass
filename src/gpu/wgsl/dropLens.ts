/**
 * The drop lens: what a point under an oil drop shows, found from the bead
 * mask's dome (PLAN 33g-2b moved it out of plate.ts, whose size ceiling it
 * would have crossed). The text of the drops' optics, the constants and the
 * reasons, stays above it in plate.ts; this is the function that reads the
 * mask and returns the offset, r and R, and the exact edge coverage it
 * leaves in `dropEdge` (declared beside `dropRho`, where the shading reads it).
 */
export const DROP_LENS_WGSL = `
fn dropLens(uv: vec2f, cam: f32) -> vec4f {
  // One texel of the plate either way; the height is the plate's in both shapes.
  let px = 1.0 / f32(textureDimensions(beadTex).y);
  let m = beadAt(uv);
  if (m.r < 0.02) { return vec4f(0.0, 0.0, -1.0, 0.0); }
  dropEdge = m.r;
  // The gap, read only under a drop: four packed texels, too many for every
  // pixel of every look with beads.
  let rho = dropHalfGap(uv);
  dropRho = rho;
  let h = clamp(m.b / m.r, 0.0, 1.0);
  let hx = beadAt(uv + vec2f(px, 0.0)); let hx2 = beadAt(uv - vec2f(px, 0.0));
  let hy = beadAt(uv + vec2f(0.0, px)); let hy2 = beadAt(uv - vec2f(0.0, px));
  let g = vec2f(hx.b - hx2.b, hy.b - hy2.b) / (2.0 * px * max(m.r, 0.05));
  let g2 = dot(g, g);
  let r = clamp(1.0 - h, 0.0, 1.0);
  if (g2 < 1.0) { return vec4f(0.0, 0.0, r, 0.0); }
  /*
    No drop is bigger than DROP_BIGGEST. Where the taps straddle the wall
    between two drops of a size, the dome is nearly level across them, the
    size it implies runs up to the whole plate, and a push of three radii
    read the plate from up to three plate-widths away: eight in a hundred
    fragments of a crowd at 3x sampled farther than any drop can see, most
    within a texel of a wall (a copy of this arithmetic run on the drops
    check's crowd). Held to the biggest drop, a wall shows a nearby patch.
  */
  var R = min(inverseSqrt(g2), DROP_BIGGEST);
  var rr = r;
  // toC runs from here to the centre, r radii long.
  var toC = normalize(g) * rr * R;
  /*
    The edge, from the cone and not from the coverage (PLAN 33g-2b). The mask
    is 512 across the whole plate, so at 5x a texel is ten or more screen
    pixels, and the contour of a bilinear read of its antialiased coverage
    is not a circle: it wanders by a third of a texel with the texel's own
    period, a rim of scallops, and the quotient h (blue over red) that fed r
    and the direction to the centre is two small 8-bit numbers over each
    other out there, worse still. The dome is exact, though: a cone, or for a
    drop pressed against another a plane at the wall, whose height is the
    distance to the nearest edge over R and whose slope is 1 over R. So one
    clean read three texels in, where red is 1 and blue is the dome itself,
    gives the distance to the edge from here to a fraction of a screen pixel,
    and the direction to the centre, wherever here is in the last texels.
  */
  var edge = m.r;
  if (h < 0.55) {
    let uv2 = uv + normalize(g) * (3.0 * px);
    let a = beadAt(uv2);
    if (a.r > 0.97) {
      let ax = beadAt(uv2 + vec2f(px, 0.0)); let ax2 = beadAt(uv2 - vec2f(px, 0.0));
      let ay = beadAt(uv2 + vec2f(0.0, px)); let ay2 = beadAt(uv2 - vec2f(0.0, px));
      let ga = vec2f(ax.b - ax2.b, ay.b - ay2.b) / (2.0 * px);
      let la = length(ga);
      let Rf = 1.0 / max(la, 1.0);
      if (la > 1.0 && Rf <= DROP_BIGGEST) {
        let dEdge = a.b * Rf - 3.0 * px;
        R = Rf; rr = clamp(1.0 - dEdge / Rf, 0.0, 1.0);
        toC = (ga / la) * rr * Rf;
        edge = clamp(0.5 + dEdge / max(dropPx, 1e-5), 0.0, 1.0);
      }
    }
  }
  dropEdge = edge;
  /*
    The push comes in with the mask's coverage rather than at a threshold.
    The outermost texels of a drop are its antialiasing, and there both the
    dome and the coverage are a few steps of eight bits, so the centre they
    point at can be anywhere; pushed in full, those texels showed a patch of
    plate from well outside the drop, a staircase of odd pixels round every
    rim at 3x. Faded in over the edge they show the plate beside them, as
    the coverage there says most of the texel is.
  */
  let band = dropBand(rr, R, rho);
  let cover = smoothstep(0.02, 0.6, edge);
  // The camera's push: past the centre, in radii.
  /*
    Where the bend is. A ball's power is the same across it (a paraxial lens:
    the push is in proportion to the radius), so the whole ball is one turned
    picture. A pancake's is all in the half-round edge, and the surface
    steepens toward the contact, so the bend is nothing across the flat, little
    across the first of the band and all of it only at the rim. With the push
    in proportion to the band, as it was, the map from the window to the band
    ran through the drop's own centre a little outside the window's edge: a
    ring of one colour (every sample the same point) with a pin inside it, the
    dimple on a big bead. With the bend held back to the rim the crossing is
    the sliver at the contact the photographs show, and the window is clear.
  */
  let power = 1.0 + 5.0 * smoothstep(0.0, 0.4, dropFlat(R, rho));
  let turned = (DROP_INVERT + DROP_REACH / max(R, px)) * pow(band, power);
  // The projector's: toward the centre by r(1 - 1/M) radii, which puts the
  // sample at centre + (here - centre)/M, upright; a ball's whole round top,
  // a pancake's flat none of it (it is a window), fading out across the
  // flat as the drop flattens.
  let upright = rr * (1.0 - 1.0 / DROP_MAG) * (1.0 - smoothstep(0.0, 0.5, dropFlat(R, rho)));
  let push = mix(upright, turned, cam) * cover;
  return vec4f(toC * (push / max(rr, 1e-3)), rr, R);
}
`;
