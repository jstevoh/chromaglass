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
  /*
    Where to read it. The quotient is noise only in the outer part (h under
    0.55 and less, or red not full), so the step in toward the centre is
    three texels there and none in the middle, eased between (a switch at one
    h left a ring where the two estimates met). Where the step lands matters
    for a small drop: three texels in from the rim of a drop of four texels'
    radius is a texel from its centre, and of one under three the far side,
    where the dome is the far edge's, and the fit read the outline erased
    (the pre-push review; a drop of one and a half cells kept 40% of its
    outline). The size is not known before the step, and out there the first
    estimate of it is the noise itself (capping the step by it cost every drop
    from two cells up its roundness, measured), so the guard is the read: a
    point that has gone a step in and finds the dome above 0.6 of its height
    is too near the middle to say where the edge was, and the drop keeps the
    estimate it always had; the fit is refused as well when its slope does not
    point the way the taps' did, or when it puts here more than a texel and a
    half beyond the edge.
  */
  // Where red is not full this is the antialiasing and h is the noise: all the way out, and the step the full three.
  let outer = max(clamp((0.7 - h) / 0.15, 0.0, 1.0), 1.0 - smoothstep(0.9, 0.995, m.r));
  let stepIn = 3.0 * px * outer;
  let uv2 = uv + normalize(g) * stepIn;
  let a = beadAt(uv2);
  if (a.r > 0.97) {
    let ax = beadAt(uv2 + vec2f(px, 0.0)); let ax2 = beadAt(uv2 - vec2f(px, 0.0));
    let ay = beadAt(uv2 + vec2f(0.0, px)); let ay2 = beadAt(uv2 - vec2f(0.0, px));
    let ga = vec2f(ax.b - ax2.b, ay.b - ay2.b) / (2.0 * px);
    let la = length(ga);
    let Rf = 1.0 / max(la, 1.0);
    let dEdge = a.b * Rf - stepIn;
    if (la > 1.0 && Rf <= DROP_FIT_MAX && dot(ga, g) > 0.0 && dEdge > -1.5 * px && (outer < 0.01 || a.b < 0.6)) {
      R = Rf; rr = clamp(1.0 - dEdge / Rf, 0.0, 1.0);
      toC = (ga / la) * rr * Rf;
      // A wall between pressed drops is not antialiased in the mask (rasterDrops):
      // where red is full the plate is not to show through it.
      edge = select(clamp(0.5 + dEdge / max(dropPx, 1e-5), 0.0, 1.0), 1.0, m.r >= 0.995);
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
