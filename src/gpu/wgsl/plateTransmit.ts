import { BULB_FILL } from './lampField';
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

/*
  The camera's bubble: its true centre and radius in plate uv (PLAN 38h-2,
  38h-7), from p, the position field's filtered reading at fuv, and R, the
  packed radius. Neither is good enough to draw a rim from up close. R is
  packed in 16 steps on a log scale, each 1.28 times the last, so it is off
  by up to 14%; and filtered p is the coverage-weighted mean of the four
  texels round the point, so in the last texel it stops growing while the
  coverage runs on in a square-cornered staircase: the owner saw the edge as
  blocky, "low resolution" (2026-10-31). A first fix read the field again at
  the estimated centre; with the radius still a step off, the rim stayed off
  the hole the solver cut by as much.

  But each texel the air covers holds its own position exactly: g and b are
  a times a linear function of where the texel's centre is (wgsl/air.ts), so
  divided by a they give (x - c) / R at a known x with no filtering at all.
  So the texels themselves are read (textureGather), at the estimated centre
  and three points half a radius out from it, and x = c + R q is fitted to
  them by least squares: sixteen exact samples a radius apart fix the centre
  and the radius to a fraction of a texel (the centre's four alone, on a
  bubble a texel or two across). Each point is snapped to the corner its
  four texels share, so the texels gathered are the ones assumed. A fit that
  does not hold (too few covered texels, a radius more than a step from the
  packed one, a neighbour's texels mixed in) falls back to the packed radius
  and the centre the covered texels give for it.
*/
fn camBubble(fuv: vec2f, p: vec2f, R: f32) -> vec3f {
  let n = vec2f(textureDimensions(air0));
  var c0 = fuv - p * R;
  var sn = 0.0;
  var sq = vec2f(0.0);
  var sx = vec2f(0.0);
  var sqx = 0.0;
  var sqq = 0.0;
  var sc = vec3f(0.0);
  for (var k = 0; k < 4; k++) {
    // The centre first; the other three round the centre its texels give,
    // which every pixel of the bubble agrees on, so they read the same texels.
    if (k == 1 && sc.z > 0.0) { c0 = sc.xy / sc.z; }
    let ang = f32(k) * 2.0943951;
    let b = floor((c0 + vec2f(cos(ang), sin(ang)) * select(0.5 * R, 0.0, k == 0)) * n - 0.5);
    let at = (b + 1.0) / n;
    let ga = textureGather(0, air0, samp, at);
    let gg = textureGather(1, air0, samp, at);
    let gb = textureGather(2, air0, samp, at);
    // textureGather's order: (0,1), (1,1), (1,0), (0,0) from the corner texel b.
    let offs = array<vec2f, 4>(vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0));
    for (var j = 0; j < 4; j++) {
      let a = ga[j];
      if (a > 0.1) {
        let x = (b + offs[j] + 0.5) / n;
        let q = (vec2f(gg[j], gb[j]) / a - vec2f(0.5)) * 2.0;
        sn += 1.0; sq += q; sx += x; sqx += dot(q, x); sqq += dot(q, q);
        sc += a * vec3f(x - R * q, 1.0);
      }
    }
  }
  let vq = sqq - dot(sq, sq) / max(sn, 1.0);
  let Rf = (sqx - dot(sq, sx) / max(sn, 1.0)) / max(vq, 1e-6);
  if (sn < 3.0 || vq < 0.05 || Rf < 0.8 * R || Rf > 1.25 * R) {
    // Each covered texel's own word for the centre at the packed radius:
    // the same texels give the same centre, so a bubble too small to fit
    // still has one rim, not a piece of one per pixel.
    return select(vec3f(c0, R), vec3f(sc.xy / max(sc.z, 1e-4), R), sc.z > 0.0);
  }
  return vec3f((sx - Rf * sq) / sn, Rf);
}
`;

/**
 * The light at an edge (PLAN 38h-2): what a slope does to light coming up
 * through the glass, for the dye's rims, the boundary line, the camera's
 * bubble and the closeup's relief. Built into the display shader's LIGHTING
 * block, after the lamp's pupilPass (lampField.ts) and before the macro's
 * relief and the VIEW block, which read it; so the indices and the
 * aperture the drops' optics use (plate.ts, the drops' constants) are
 * declared here, once, and that block reads them from here.
 */
export const EDGE_LIGHT_WGSL = /* wgsl */ `
const DROP_NA: f32 = 0.25;
const N_WATER: f32 = 1.333;
const N_OIL: f32 = 1.47;
const N_AIR: f32 = 1.0;
/*
  Every edge on the plate was lit from a lamp above it: the dye's rim
  brightened on the side facing the lamp's position and darkened on the
  other, a camera highlight sat on it, the camera's bubble wore a crescent
  and two reflections of the lamp, a ring round each oil drop glowed, the
  closeup's relief was Lambert and a Blinn glint, and the line between two
  dyes added a quarter of white. The lamp is under the glass. What a slope
  does to its light is bend it, by the step in index across the surface
  times the slope, and what the lens then shows is the share of that light
  still inside its aperture. That is the law the lamp lever already uses
  (pupilPass, lampField.ts): the bulb's image, a disc BULB_FILL of the
  aperture across, slid off the aperture's centre. A bend slides it the
  same way, so an edge is that share against the flat plate's: 1 where the
  liquid is level, falling to nothing as the bend carries the bulb's whole
  image past the rim, and never above 1. Symmetric: the lamp sends its
  light up along the axis, so no side of an edge faces it.

  The camera's view (a photographed look, the closeup) is lit the same way
  from beneath, by a light box rather than a condenser: its light reaches
  each point from a cone much wider than the lens takes in, so a ray bent
  a little is replaced by another from the box, and only a bend past the
  difference loses light. CAMERA_FILL is that cone in the lens's aperture
  radii, matched to the camera's line on a drop (the beads' block and the
  satellite droplets: dark past 0.85 of a ball's radius, where oil in water
  bends the light 1.6 aperture radii), so the camera's edges and its drops
  agree: thin dark lines only where the surface is steep.
*/
const CAMERA_FILL: f32 = 2.6;
/** How much steeper than the field Glossiness (the plate) and Macro Relief (the closeup) may make the surface: 1 to 1 + this times. */
const RELIEF_GAIN: f32 = 3.0;
fn edgePass(bend: f32, cam: f32) -> f32 {
  let p = pupilPass(vec3f(bend, bend, 0.0), vec3f(${BULB_FILL.toFixed(6)}, CAMERA_FILL, CAMERA_FILL));
  // p.z is the light box's share on a level plate (1/fill², the lens being smaller than its cone).
  return mix(p.x, p.y / p.z, cam);
}
/*
  What gives the closeup its depth (Relief / 3D, PLAN 38h-2): the camera
  focused a little past the liquid. A curved surface is a lens; on a plane
  past it the light it bends gathers under a dome and spreads under a
  hollow, so a swell reads brighter in its middle and a trough darker, the
  shadowgraph, 1 - dz grad^2 OPL, by the same law and from the same
  field (the derive pass's grad^2 OPL over the path) the projector's Focus
  uses in refractionOptics, with its clamp. No light is made: what the
  middle of a swell gains its flanks lose. Macro Relief is how far past
  the camera focuses, up to CAMERA_DEFOCUS at 1, the projector's own reach
  at either end of Focus. It replaced a lamp lowered over the plate, which
  lit one side of every swell; the macroview check asks this shading of
  every look (smooth, 2% of the frame or more).
*/
const CAMERA_DEFOCUS: f32 = 0.75;
fn camShadow(lapK: f32, relief: f32) -> f32 {
  return clamp(1.0 - relief * CAMERA_DEFOCUS * lapK, 0.2, 2.5);
}
/*
  The bend at a dye surface of normal n, in aperture radii: the slope the
  projector's optics take from the same field (refractionOptics reads the
  gradient -n.xy/(0.9 n.z) and bends by 0.35 of it), so a rim the derived
  path and the plain path draw is the same rim.
*/
fn dyeBend(n: vec3f) -> f32 { return 0.35 * length(n.xy) / (0.9 * max(n.z, 1e-3) * DROP_NA); }
/* An air pocket's wall in water, of slope s: two refractions of 1 - n_water/n_air each. */
fn airBend(s: f32) -> f32 { return 2.0 * N_WATER * (N_WATER / N_AIR - 1.0) * s / DROP_NA; }

/*
  The dye's rim on the paths that do not derive it (the camera's view, and
  a projector without the derived field): its relief as the edge's share of
  the light, weighted by Edge Relief as it always was, and by how much dye
  there is to have a rim.
*/
fn meniscus(color: vec3f, n: vec3f, a: f32, isCamera: bool) -> vec3f {
  let keep = edgePass(dyeBend(n), select(0.0, 1.0, isCamera));
  return color * mix(1.0, keep, U.edgeRelief * smoothstep(0.02, 0.2, a));
}

/*
  The line between two dyes where the field is not derived (the camera's
  view, a projector without the derived field), PLAN 38h-2. It brightened
  the dye by 1.6 times the line and added a quarter of white: light made at
  an edge. The derived projector's line is the aperture's (refractionOptics
  bends by 1.1 of the line, in radians); this takes the same bend through
  edgePass, so on both paths a boundary is a line darker than the dye on
  either side, thin for the camera's wide cone.
*/
fn boundaryShade(e: f32, isCamera: bool) -> f32 {
  return edgePass(e * 1.1 / DROP_NA, select(0.0, 1.0, isCamera));
}
`;
