/**
 * A bubble's outline drawn from the bubble itself, at the screen's own
 * resolution (PLAN 38h-15), kept beside `plate.ts` and built into it after
 * `TRANSMIT_WGSL` (it falls back to `camBubble` there).
 *
 * ── What was reported ──
 *
 * The owner, 2026-11-11: "the bubbles still look shitty and pixelated. They
 * look like a old computer drew them." Rendered in the lab (a row of bubbles
 * from 1.2 to 10 cells on a 256 grid, at 800 px), every bubble's outline on
 * the plate was a polygon: a small one an octagon, a big one a circle made
 * of short flat facets, one facet per texel of the air field, five to eleven
 * screen pixels each at the app's sizes. The window inside each was round.
 *
 * ── Why ──
 *
 * The projector's bubble was as opaque as the air field's coverage there,
 * `smoothstep(0.02, 0.28, coverage)`, and the coverage is the bubble stamped
 * into the solver's grid (`wgsl/air.ts`), point-sampled at texel centres,
 * read back through bilinear filtering. A contour of a bilinear field is a
 * chain of hyperbolic pieces, one per texel: on a disc a few texels across,
 * a polygon with its corners on the grid. The closeup hid it better, fitting
 * a centre and a radius to sixteen gathered texels (`camBubble`), but its
 * radius came from the field's packed size, sixteen steps on a log scale 28%
 * apart, and the fit's fallback was a staircase on a bubble a texel or two
 * across.
 *
 * Nothing about the bubble is coarse except that copy of it. Each bubble is
 * a disc the CPU moves (`lib/bubbles.ts`), with an exact centre, radius,
 * opacity and rim (its fingers), and the solver needs the grid's copy only to
 * push the liquid out of its way. So the field now says *which* bubble a
 * texel belongs to (its index in the list, `wgsl/air.ts`), the list as it was
 * stamped is handed to the plate (`WebGPUAir.geo`), and the plate draws the
 * outline from the disc: an edge one screen pixel wide wherever it lands,
 * at any zoom, and the radius the bubble really has.
 *
 * ── Why the index and not the list ──
 *
 * The plate drew bubbles from a list once, forty uniforms and a metaball
 * loop per pixel, and that loop was why there was a cap of forty. Reading
 * the index from the field costs one gather and, near a bubble, one to four
 * reads of the list: the four texels round the point each name a bubble (or
 * none), and the one the point is most inside is the one drawn, so two
 * bubbles side by side each keep their own rim. Texels just past a rim carry
 * the index too (a skirt three texels wide, coverage 0, so the solver never
 * sees it), or a pixel half a texel outside a bubble would find no bubble to
 * be outside of, and the edge would be cut back to the field's.
 *
 * Where the field holds air no list put there (the boiling's steam pockets,
 * `AIR_BOIL_WGSL`), the bubble is drawn from the field as it was.
 */
import { AIR_RIM_WGSL } from './air';

export const BUBBLE_SHAPE_WGSL = /* wgsl */ `
${AIR_RIM_WGSL}
/** The bubbles as the air field was last stamped from them (WebGPUAir.geo): x, y, r (fluid uv), opacity. */
@group(0) @binding(20) var<storage, read> airDiscs: array<vec4f>;
/** And their rims: fingering, how many, phase, film. */
@group(0) @binding(21) var<storage, read> airRims: array<vec4f>;

/** A bubble at a point: where its centre is taken to be, its radius, its film, its number, and how opaque this pixel of it is. */
struct AirHere {
  geo: vec3f,
  /** Its true centre and its rim's radius at this angle (plate uv); rim 0 for air no list laid. */
  centre: vec2f,
  rim: f32,
  film: f32,
  id: f32,
  opac: f32,
};

/*
  Which of the list a texel's index names (wgsl/air.ts, AIR_LOOK): -1 for
  none or for air no list laid.
*/
fn airIndex(v: f32) -> i32 {
  let k = i32(floor(v + 0.5));
  if (k >= AIR_LOOK_IN && k < AIR_LOOK_IN + AIR_LOOK_SPAN) { return k - AIR_LOOK_IN; }
  if (k >= AIR_LOOK_SKIRT && k < AIR_LOOK_SKIRT + AIR_LOOK_SPAN) { return k - AIR_LOOK_SKIRT; }
  return -1;
}

/*
  The bubble here and how far inside its rim the point is, in plate uv
  (negative outside). The point in its bubble is in units of the rim at its
  angle, as the field's position is (wgsl/air.ts), and the angle is read in
  clip space's y-up, as the stamp reads it.
*/
fn airDisc(fuv: vec2f, i: i32) -> vec4f {
  let d = airDiscs[i];
  let off = fuv - d.xy;
  let edge = rimAt(atan2(-off.y, off.x), airRims[i]) * d.z;
  return vec4f(off / max(edge, 1e-6), d.z, edge - length(off));
}

/*
  looks: the field's fourth channel gathered round the point; airC its
  filtered sample, whose coverage and position are the field's own word for
  air the list did not lay; spx a screen pixel in plate uv.
*/
fn airHere(fuv: vec2f, looks: vec4f, airC: vec4f, spx: f32, dropCam: f32) -> AirHere {
  var o: AirHere;
  // No bubble and no steam round this point: most of the plate, at a gather's cost.
  if (max(max(looks.x, looks.y), max(looks.z, looks.w)) < 0.5) { return o; }
  var best = -1;
  var bestIn = -1e9;
  var bestD = vec4f(0.0);
  let n = i32(arrayLength(&airDiscs));
  for (var j = 0; j < 4; j++) {
    let i = airIndex(looks[j]);
    if (i >= 0 && i < n) {
      let d = airDisc(fuv, i);
      if (d.w > bestIn) { best = i; bestIn = d.w; bestD = d; }
    }
  }
  if (best >= 0) {
    let rim = airRims[best];
    o.geo = vec3f(fuv - bestD.xy * bestD.z, bestD.z);
    o.centre = airDiscs[best].xy;
    o.rim = bestIn + length(fuv - o.centre);
    o.film = clamp(rim.w, 0.0, 1.0);
    o.id = (floor(fract(rim.z / 6.2831853) * 7.99) + 0.5) / 8.0;
    // An edge one screen pixel wide, on the rim, in both views.
    o.opac = clamp(airDiscs[best].w, 0.0, 1.0) * clamp(0.5 + bestIn / spx, 0.0, 1.0);
    return o;
  }
  // Air the list did not lay: drawn from the field, as every bubble was.
  let look = max(max(looks.x, looks.y), max(looks.z, looks.w));
  let aC = airC.r;
  let p0 = clamp((airC.gb / max(aC, 1e-3) - vec2f(0.5)) * 2.0, vec2f(-1.0), vec2f(1.0));
  o.geo = vec3f(fuv - p0 * AIR_BOIL_R, AIR_BOIL_R);
  if (dropCam > 0.001) { o.geo = mix(o.geo, camBubble(fuv, p0, AIR_BOIL_R), dropCam); }
  o.film = AIR_BOIL_FILM;
  o.id = (floor(look) - f32(AIR_LOOK_BOIL) + 0.5) / 8.0;
  let pr = length((fuv - o.geo.xy) / o.geo.z);
  o.opac = select(0.0, mix(smoothstep(0.02, 0.28, aC), clamp(0.5 + (1.0 - pr) * o.geo.z / spx, 0.0, 1.0), dropCam), aC > 0.02);
  return o;
}

/*
  The liquid at uv for the camera's wall, with the grid's hole kept inside
  the bubble. The solver takes the dye out where the field says air, on its
  grid, and a grid's hole has a grid's edge: a ramp a texel and a half inside
  the rim and, through the plate's bicubic reads, a texel or two outside it.
  The camera sees the liquid round a bubble through its wall (closeupDepth.ts),
  at the point the wall's lens lands on, and where that landed in the ramp
  outside the rim it read thinned dye with the grid's stair-stepped edge. The
  liquid at a meniscus is the liquid round it, so a read that lands in the
  ramp past the rim is taken radially out to where the grid's hole ends
  (AIR_HOLE texels past the rim).

  Inside the rim the field's own hole is read, as it was: a ray the wall bends
  outward by less than a small ball's radius lands there, and what it finds
  under a ball is the liquid the 2D solver took out of its footprint, which
  airColumn puts back only in part (npm run airlens holds the camera's
  through-the-wall light to the liquid round it). A sharp hole there is the
  rest of 38h-16, with that line re-derived for a ray traced through a ball.
  Air no list laid (rim 0) reads the field's hole as it is.
*/
const AIR_HOLE: f32 = 2.0;
fn airLiquid(uv: vec2f, h: AirHere) -> vec4f {
  let off = uv - h.centre;
  let r = length(off);
  let reach = h.rim + AIR_HOLE / f32(textureDimensions(air0).x);
  let at = select(uv, h.centre + off / max(r, 1e-6) * reach, h.rim > 0.0 && r >= h.rim && r < reach);
  return decodeFluid(layer0, at, 0.0, false);
}
`;
