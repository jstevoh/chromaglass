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
  The shadowgraph: what a column of liquid does to the light when the
  projector's lens is focused off it (PLAN 38h-3). Whatever bends the light,
  dye, oil, a pour of glycerine, a film or a thicker gap, bends it by the
  slope of the optical path through the column, OPL = n·h, and a plane Δz
  past the plate sees the light gathered where that path is curved: the
  transport 1 - Δz·∇²OPL, whose first order exp(-Δz ∇²OPL/n) stays positive
  as light must. The derive pass writes the whole column's OPL (.w), so this
  is one term for all of it. It was two: refractionOptics drew the dye's
  from the derive pass's ∇²OPL, masked to the dye's own slope and only over
  dye, so a pour that moved only the index drew nothing; and the oil block
  drew the oil's from the oil alone, so where dye crossed an oil drop's edge
  the oil's share was counted twice (a black and a bright arc there, in the
  lab at Focus 0.8).

  The wall sees the plate through the lens's defocus disc, so the Laplacian
  is taken at the disc's scale, as the difference of two ring means (sixteen
  taps and eight), 4 (mean over R - mean over R/3) / (R² - R²/9), with R the
  derive pass's spacing widened as the disc grows with Δz, scaled to its
  9-tap stencil (50 e² ∇²): the oil block's own law, now read off the whole
  path. Read cell by cell, the oil's rings were stair-stepped (the owner:
  "really pixelated at the edge ... super digital"); averaging the derive
  pass's own ∇²OPL over the disc instead left a fresh pour's stair-stepped
  rim speckled, since a Laplacian of steps is mostly cell-sized spikes, where
  the path itself is only steps. Nothing at Focus's middle, where Δz is 0,
  and so nothing on any look as it ships. The gain is the one both terms
  had, Boundary Contrast's.
*/
fn defocusShadow(t: texture_2d<f32>, uv: vec2f) -> f32 {
  let dz = (U.projectorFocus - 0.5) * 1.5;
  if (abs(dz) <= 0.001) { return 1.0; }
  let e = 3.0 / U.logicalGrid;
  let R = e * (1.0 + 4.0 * abs(dz));
  var outer = 0.0;
  var inner = 0.0;
  for (var k = 0; k < 16; k++) {
    let d = vec2f(cos(f32(k) * 0.3926991), sin(f32(k) * 0.3926991));
    outer += tex2(t, uv + d * R).w;
    if (k % 2 == 1) { inner += tex2(t, uv + d * (R / 3.0)).w; }
  }
  let lap = (outer / 16.0 - inner / 8.0) * 4.0 / (R * R * (8.0 / 9.0)) * 50.0 * e * e;
  return clamp(exp(-dz * (lap / N_WATER) * max(1.0, U.boundaryContrast * 2.0)), 0.2, 2.5);
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
  38h-7, 38h-13), from c00, one texel's word for its centre (camPick), R,
  the packed radius, and look, the packed size, film and number that tell
  its texels from a neighbour's. It once started from p, the position
  field's filtered reading at the pixel. Neither is good enough to draw a rim from up close. R is
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
fn camBubble(c00: vec2f, R: f32, look: f32) -> vec3f {
  let n = vec2f(textureDimensions(air0));
  var c0 = c00;
  var xs: array<vec2f, 16>;
  var qs: array<vec2f, 16>;
  var m = 0;
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
    let gl = textureGather(3, air0, samp, at);
    // textureGather's order: (0,1), (1,1), (1,0), (0,0) from the corner texel b.
    let offs = array<vec2f, 4>(vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0));
    for (var j = 0; j < 4; j++) {
      let a = ga[j];
      // Only this bubble's own texels: a neighbour pressed against it has
      // its own centre in its g and b (camPick).
      if (a > 0.1 && abs(gl[j] * 2048.0 + 0.5 - look) < 0.5) {
        xs[m] = (b + offs[j] + 0.5) / n;
        qs[m] = (vec2f(gg[j], gb[j]) / a - vec2f(0.5)) * 2.0;
        sc += a * vec3f(xs[m] - R * qs[m], 1.0);
        m++;
      }
    }
  }
  /*
    Fitted twice. Where two bubbles' splats overlap, the field keeps the
    larger of each channel on its own (air.ts blends by max), so a texel
    there can carry one bubble's coverage, the other's g and the larger
    look, and pass every test above while lying about where it is. Those
    are few and far off the line every true texel lies on exactly, so the
    second fit keeps only the texels within a fifth of a texel and 3% of
    the radius of the first.
  */
  var fit = vec3f(c00, R);
  var ok = false;
  for (var fitN = 0; fitN < 2; fitN++) {
    var sn = 0.0;
    var sq = vec2f(0.0);
    var sx = vec2f(0.0);
    var sqx = 0.0;
    var sqq = 0.0;
    for (var i = 0; i < m; i++) {
      if (fitN == 0 || length(xs[i] - fit.xy - fit.z * qs[i]) < 0.2 / n.x + 0.03 * fit.z) {
        sn += 1.0; sq += qs[i]; sx += xs[i]; sqx += dot(qs[i], xs[i]); sqq += dot(qs[i], qs[i]);
      }
    }
    let vq = sqq - dot(sq, sq) / max(sn, 1.0);
    let Rf = (sqx - dot(sq, sx) / max(sn, 1.0)) / max(vq, 1e-6);
    ok = !(sn < 3.0 || vq < 0.05 || Rf < 0.8 * R || Rf > 1.25 * R);
    if (!ok) { break; }
    fit = vec3f((sx - Rf * sq) / sn, Rf);
  }
  if (!ok) {
    // Each covered texel's own word for the centre at the packed radius:
    // the same texels give the same centre, so a bubble too small to fit
    // still has one rim, not a piece of one per pixel.
    return select(vec3f(c00, R), vec3f(sc.xy / max(sc.z, 1e-4), R), sc.z > 0.0);
  }
  return fit;
}

/*
  Which bubble a pixel of the closeup is in (PLAN 38h-13).

  What was reported (the owner, 2026-11-07): the closeup "has really
  pixelated bubble edges". Photographed in the lab on Classic at the Close-up
  button's 4x, three faults, each a grid cell wide on the screen (25 pixels
  there, a 256 grid seen 4x on a 1080 line):

  - Square chunks where two bubbles sit close. A pixel took its bubble from
    the four air texels round it: the size and number from the largest of
    the four, where it was from the filtered g and b. Between two bubbles
    those four belong to both, so a pixel drew a circle that was neither
    bubble's, and the pixels sharing those four texels all drew the same
    wrong one: a square.
  - Flat cuts off a rim. The bubble was drawn only where the filtered
    coverage passed 0.02, but its rim is a fitted circle (camBubble) on the
    line where the coverage reaches nothing, and the splat's coverage falls
    away over the last quarter of the radius (air.ts). Between the two the
    filtered coverage crosses 0.02 along the bilinear contour, which runs
    straight across a texel: a rim with flats.
  - A blocky polygon in the window (camLanding, below).

  Every covered texel knows its own bubble exactly: g and b over a are where
  in it the texel sits, linear across it, and a is the size, film and number
  packed (air.ts). So each of the four gives a whole bubble, its centre
  x - R q and radius R, and the pixel is in the one it is deepest inside,
  length(fuv - c) / R the least. Pixels of one bubble then start camBubble
  from that bubble and fit it from its own texels only, so they agree on one
  circle; and the camera draws where some texel round the pixel holds any
  air, its circle deciding the rim, rather than where the filtered coverage
  happens to pass a threshold. Returns the centre, the packed radius and the
  packed look; the look is -1 where no texel round the pixel holds air.
*/
fn camPick(fuv: vec2f) -> vec4f {
  let n = vec2f(textureDimensions(air0));
  let b = floor(fuv * n - 0.5);
  let ga = textureGather(0, air0, samp, fuv);
  let gg = textureGather(1, air0, samp, fuv);
  let gb = textureGather(2, air0, samp, fuv);
  let gl = textureGather(3, air0, samp, fuv);
  let offs = array<vec2f, 4>(vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0));
  var best = vec4f(fuv, 0.004, -1.0);
  var deep = 1e9;
  for (var j = 0; j < 4; j++) {
    let a = ga[j];
    if (a > 1e-3) {
      let x = (b + offs[j] + 0.5) / n;
      let q = (vec2f(gg[j], gb[j]) / a - vec2f(0.5)) * 2.0;
      let look = gl[j] * 2048.0 + 0.5;
      let R = 0.004 * exp2(floor(look / 128.0) / 15.0 * 5.321928);
      let c = x - R * q;
      let s = length(fuv - c) / R;
      if (s < deep) { deep = s; best = vec4f(c, R, floor(look)); }
    }
  }
  return best;
}

/*
  Where the camera's ray through a bubble lands, and the light it finds
  there (PLAN 38h-13). The solver takes the dye out of the pocket's
  footprint on its grid, so the hole in the dye is the circle as a grid of
  cells sees it, blurred over a cell or two each side of the rim. Read
  straight, the ray landing in the window found that: what dye the rim's
  cells kept, a dark blocky polygon inside a black-ground bubble and a pale
  one inside a lamp-ground bubble, a grid cell to a step at 4x. But the
  pocket is air from glass to glass: a ray landing inside its circle meets
  no liquid at all (the liquid above and below a ball is airColumn's, put
  back from the ring round it). And one landing outside meets the liquid,
  which the grid can only tell from the cells clear of the blur, so it is
  read at least two cells out from the rim, along the same line from the
  centre. The step between is the circle's, a screen pixel and a half wide
  and inside it, so the rim's own pixel, where the traced wall gives way to
  this light (wallB), meets the liquid outside without a line of ground.
*/
fn camLanding(L: vec2f, geo: vec3f, spx: f32, bg: vec3f) -> vec3f {
  let cell = 1.0 / f32(textureDimensions(layer0).x);
  let d = L - geo.xy;
  let r = length(d);
  let out = geo.xy + d / max(r, 1e-6) * max(r, geo.z + 2.0 * cell);
  let liquid = onGround(bg, decodeFluid(layer0, out, 0.0, false), dyeThrough);
  return mix(groundOf(bg), liquid, smoothstep(geo.z - 2.0 * spx, geo.z - 0.5 * spx, r));
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
