/**
 * Dark field and Rheinberg light for the projected plate (PLAN 47b).
 *
 * The owner sent three macro films of soap foam and a dyed bubble
 * (2026-11-28, Cosmodernism's, "no CGI") and asked what our bubbles could
 * learn from them. The plainest thing those films share is how they are lit:
 * the cells, the flat films and the clear water are black, and all the light
 * is on the curved liquid, the Plateau borders between the cells, the rims of
 * the bubbles, the fronts of the ink, in pink and blue. That is not dye. It is
 * a lamp the lens cannot see directly: the light comes up through the dish
 * from a ring of directions outside the lens's acceptance cone, so a level
 * column of liquid sends all of it past the lens and draws black, and only a
 * surface that bends the light by more than the gap between the ring and the
 * pupil turns some of it in. Microscopists call it dark field; with coloured
 * filters in the ring (Julius Rheinberg's, 1896) the bend picks the colour:
 * a gentle slope turns in only the ring's inner zone, a steep one reaches the
 * outer zone too. Our Foam Cells lit by the condenser's bulb (bright field,
 * every look until now) draws the same foam the other way out: pale cells,
 * dark films.
 *
 * What we have to work with is exactly the quantity the law needs. The
 * projector's pupil already loses light by the bend at every point
 * (oplPupilLoss, plateTransmit.ts, PLAN 18e-2): θ = |∇(n h)| from the
 * derive pass's Sobel stencil, the dye's measured index, the oil's 1.47
 * against water's 1.333, the gap, the poured liquid's. Bright field is a disc
 * of light BULB_FILL of the aperture across, slid off centre by the bend
 * (pupilPass, lampField.ts). Dark field is an annulus RING_IN..RING_OUT
 * aperture radii across, slid the same way; the share of it the aperture
 * catches is the same overlap of two circles, taken twice and subtracted
 * (a ring is the big disc less the small one). Two zones, inner and outer,
 * each its own colour, make Rheinberg's filter; white in both is plain dark
 * field.
 *
 * The ring has the bulb's radiance: no light is made. A level plate gets none
 * of it, and an edge gets the share of the ring the aperture catches against
 * the share of the bulb a level plate gets (1). The aperture can catch at most
 * its own area, so the brightest edge is 1 / BULB_FILL² of the flat bright
 * field, about the same white.
 *
 * Shortcuts, named: the wall is looked at, by an eye or a camera, and both
 * open up for a dark ground: DARK_EXPOSURE is that, about a stop and a third
 * (the brightest edge a level of 0.7 of the bulb's share, raised to the flat
 * bright field's white), so turning Dark Field up does not dim the show. The
 * bend is a scalar, so the ring's two zones are
 * concentric and its colour depends on how far a ray is bent, never which way
 * (a filter split by azimuth, half pink and half blue, would need the bend's
 * direction too: PLAN 47b-4). One ray per pixel: the defocus of the bent light
 * is the caustic map's, wallLight0, as for bright field.
 */
import { BULB_FILL } from './lampField';

/** The dark-field ring's inner and outer radius, and where its two Rheinberg zones meet, in aperture radii. */
export const RING_IN = 1.1;
export const RING_MID = 1.5;
export const RING_OUT = 2.0;
/** How far the eye or camera opens up for the dark ground (see above). */
export const DARK_EXPOSURE = 2.5;

const f = (v: number) => v.toFixed(6);

/**
 * The share of an annulus of radii a < b, slid d from the aperture's centre,
 * that the aperture catches, against the bulb's whole disc on a level plate.
 * CPU twin of ringShare below, for the check (scripts/darkfield.mjs).
 */
export function ringShare(d: number, a: number, b: number, pupilPass: (d: number, r: number) => number): number {
  const caught = b * b * pupilPass(d, b) - a * a * pupilPass(d, a);
  return Math.max(0, caught) * DARK_EXPOSURE / (BULB_FILL * BULB_FILL);
}

/**
 * Built into the display shader at the end of EDGE_LIGHT_WGSL (plateTransmit.ts) (pupilPass is
 * lampField.ts's, three channels at once; we use .x and .y for the two zones'
 * edges). `darkLight(bend)` is the ring's light at a bend in aperture radii,
 * linear, per channel: U.ringInner over the inner zone, U.ringOuter over the
 * outer. `fieldLight(keep, bend)` mixes it with bright field's share by Dark
 * Field (U.darkField): 0 is the bulb alone, today's plate exactly.
 */
export const DARK_FIELD_WGSL = /* wgsl */ `
const RING_IN: f32 = ${f(RING_IN)};
const RING_MID: f32 = ${f(RING_MID)};
const RING_OUT: f32 = ${f(RING_OUT)};
fn darkLight(bend: f32) -> vec3f {
  let d = vec3f(bend);
  let p = pupilPass(d, vec3f(RING_IN, RING_MID, RING_OUT));
  let a = vec3f(RING_IN, RING_MID, RING_OUT);
  let caught = a * a * p;
  let inner = max(caught.y - caught.x, 0.0);
  let outer = max(caught.z - caught.y, 0.0);
  return (inner * U.ringInner + outer * U.ringOuter) * ${f(DARK_EXPOSURE / (BULB_FILL * BULB_FILL))};
}
/*
  A bubble's wall on the projector (the bubble block in plate.ts): a
  half-round meniscus half the gap wide, tB the sine of its tilt across it
  (dropBand), 0 at the flat middle and 1 at the outline, where it stands
  upright against the glass. Light crossing it meets a water-to-air face
  tilted asin(tB): bent by airBend of the slope, and turned back entirely
  past the critical angle, n sin = 1, where it never leaves the column
  forward. Bright field keeps only the middle (AIR_CORE, the dark band);
  dark field lights the band where the bend lands in the ring, and the
  ring's two gels come out as two rings, the inner gel nearer the middle.
*/
fn meniscusBend(tB: f32) -> f32 {
  if (N_WATER * tB >= 1.0) { return 1e3; }
  return airBend(tB / sqrt(max(1e-4, 1.0 - tB * tB)));
}
fn fieldLight(keep: f32, bend: f32) -> vec3f {
  if (U.darkField <= 0.001) { return vec3f(keep); }
  return mix(vec3f(keep), darkLight(bend), U.darkField);
}
/*
  The projected plate's light at a point (plate.ts's display, after the
  liquids' chemistry): bright field's pupil loss (oplPupilLoss) mixed with
  the ring's light by Dark Field, from the derive pass's |grad OPL| (near.z)
  and the dye's slope (near.xy), the same bend for both; where a painted
  phase covers the point (cover), it keeps its own light.
*/
fn pupilLight(near: vec4f, normal: vec3f, plateOn: bool, plateAmt: f32, cover: f32) -> vec3f {
  let keep = oplPupilLoss(near.z, near.xy, normal, plateOn, plateAmt);
  return mix(fieldLight(keep, select(0.0, oplTheta(near.z, near.xy, normal) / DROP_NA, plateOn)), vec3f(1.0), cover);
}
/*
  A bubble's wall on the projector under Dark Field: the band lit where its
  bend lands in the ring, through the liquid round it (rimCol, which on the
  lamp ground is the lamp through that liquid; white lamp on the dye-as-light
  ground, where there is no lamp of the look's own to filter).
*/
fn darkWall(cp: vec3f, rimCol: vec3f, tB: f32) -> vec3f {
  if (U.darkField <= 0.001) { return cp; }
  let through = mix(vec3f(1.0), rimCol, clamp(U.lampGround, 0.0, 1.0));
  return mix(cp, through * darkLight(meniscusBend(tB)), U.darkField);
}
`;
