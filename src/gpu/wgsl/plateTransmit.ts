/**
 * What the plate does with the lamp's light where it once painted light of
 * its own (PLAN 38h): a plate lit from beneath shows transmitted light only,
 * so nothing here adds light. Glossiness as the dye surface's relief, the gel
 * as a filter, and the satellite droplets as lenses. Built into the display
 * shader's VIEW block (plate.ts), after the drops' constants it reads
 * (DROP_CORE) and the noise's hashes, and before dropLens.
 */
export const TRANSMIT_WGSL = /* wgsl */ `
/*
  Glossiness, as the relief of the dye's surface (PLAN 38h). It was a lamp
  above the plate: Lambert toward a point light, a Blinn highlight for the
  camera and a Schlick sheen added everywhere, so a glossy look was a field
  of lit 3D domes. A projector's lamp is under the glass and the condenser
  sends it up nearly parallel; a dye surface reflects nothing into the lens
  and is lit by nothing from above. What its relief does to transmitted light
  is bend it, and the optics already draw that: the pupil loses what a slope
  bends past its aperture (refractionOptics), the meniscus is the camera's
  line. So Glossiness now scales the slope those read, 1 to 1 + RELIEF_GAIN
  times the surface the field gives: 0 is the real relief, past it a show can
  ask for a surface steeper than the liquid makes. Flat dye is never lit or
  darkened by it, which the old law did by up to a quarter at a lamp's edge.
*/
const RELIEF_GAIN: f32 = 3.0;
fn reliefGain(n: vec3f) -> vec3f {
  if (U.glossiness < 0.005) { return n; }
  return normalize(vec3f(n.xy * (1.0 + RELIEF_GAIN * U.glossiness), n.z));
}

/*
  A gel is a filter: it passes at most all of each band and makes none
  (PLAN 38h). It multiplied the lamp by its colour times 1.5, over a floor
  of 0.10 under it, so a gel brightened a white lamp by half and lit a black
  one. Now one sheet passes its colour, and Gel Wheel is how much of the beam
  the sheet covers: the covered share takes the gel's colour, the rest passes
  clear, (1 - w) + w * gel, which is the blend the mixer's levels are (half
  the level, half the change: npm run mixer) and never more than all of a
  band. A thicker gel is a deeper colour in the wheel, not a higher level.
*/
fn gelFilter(uv: vec2f) -> vec3f {
  return mix(vec3f(1.0), clamp(gelColor(uv), vec3f(0.0), vec3f(1.0)), U.gelWheel);
}

/*
  Satellite droplets: the hundreds of tiny beads that sit on the glass around
  every drop in a macro photograph, each cell of a jittered grid one small
  ball of oil. They were shaded as if a lamp shone down on them, a white dot
  of it on every dome (PLAN 38h); lit from beneath, a ball is a lens, and it
  is drawn by the big drops' own law (dropLens, the beads' block): on the
  projector the light through its outer part leaves the pupil, a dark ring
  past DROP_CORE round a clear middle; to a camera focused past it the middle
  gathers that light and only the contact is a line. No dot either way.
*/
/*
  pxCell is one screen pixel in the grid's cells. A droplet is a few pixels
  across, so its ring was a step of 0.06 of its radius, under a pixel: a
  hard 1-2 px black circle, stair-stepped round (the owner, on the Mac's
  pictures: "pixelated at the edge"). Each edge is now spread over at least
  a pixel, as the lens's own resolution would.
*/
fn microDrops(c: vec3f, p: vec2f, keep: f32, cam: f32, pxCell: f32) -> vec3f {
  let i = floor(p);
  let f = fract(p);
  var outc = c;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let h = hash22(i + g);
      if (h.x > keep) { continue; }
      let centre = g + 0.2 + h * 0.6;
      let rad = 0.10 + hash12(i + g + 7.7) * 0.2;
      let d = (f - centre) / rad;
      let q = dot(d, d);
      if (q > 1.0) { continue; }
      let r = sqrt(q);
      let soft = max(0.06, pxCell / rad);
      let projected = 1.0 - 0.85 * smoothstep(DROP_CORE - soft, DROP_CORE + soft, r);
      let photographed = (1.0 + 0.3 * (1.0 - r) * (1.0 - r)) * (1.0 - 0.85 * smoothstep(0.85 - soft, 0.85 + soft, r));
      outc = mix(outc, c * mix(projected, photographed, cam), 1.0 - smoothstep(1.0 - 2.0 * soft, 1.0, r));
    }
  }
  return outc;
}
`;
