/**
 * The drop lens: what a point under an oil drop shows, found from the bead
 * mask's dome. Moved out of plate.ts (PLAN 33g-2b) because that file is over
 * its size ceiling and does not grow; the text of the drops' optics, the
 * constants and the reasons, stays above it in plate.ts. The function reads
 * the mask and returns the offset, r and R.
 */
export const DROP_LENS_WGSL = `
fn dropLens(uv: vec2f, cam: f32) -> vec4f {
  // One texel of the plate either way; the height is the plate's in both shapes.
  let px = 1.0 / f32(textureDimensions(beadTex).y);
  let m = beadAt(uv);
  if (m.r < 0.02) { return vec4f(0.0, 0.0, -1.0, 0.0); }
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
  let R = min(inverseSqrt(g2), DROP_BIGGEST);
  // toC runs from here to the centre, r radii long.
  let toC = normalize(g) * r * R;
  /*
    The push comes in with the mask's coverage rather than at a threshold.
    The outermost texels of a drop are its antialiasing, and there both the
    dome and the coverage are a few steps of eight bits, so the centre they
    point at can be anywhere; pushed in full, those texels showed a patch of
    plate from well outside the drop, a staircase of odd pixels round every
    rim at 3x. Faded in over the edge they show the plate beside them, as
    the coverage there says most of the texel is.
  */
  let band = dropBand(r, R, rho);
  let cover = smoothstep(0.02, 0.6, m.r);
  // The camera's push: past the centre, in radii.
  let turned = (DROP_INVERT + DROP_REACH / max(R, px)) * band;
  // The projector's: toward the centre by r(1 - 1/M) radii, which puts the
  // sample at centre + (here - centre)/M, upright; a ball's whole round top,
  // a pancake's flat none of it (it is a window), fading out across the
  // flat as the drop flattens.
  let upright = r * (1.0 - 1.0 / DROP_MAG) * (1.0 - smoothstep(0.0, 0.5, dropFlat(R, rho)));
  let push = mix(upright, turned, cam) * cover;
  return vec4f(toC * (push / max(r, 1e-3)), r, R);
}
`;
