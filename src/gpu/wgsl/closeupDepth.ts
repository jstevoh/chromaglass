/**
 * Depth in the closeup (PLAN 38h-7): what an air pocket between the glasses
 * does to the light a camera above it collects, traced through Snell's law
 * and Fresnel's equations instead of a single small-angle bend, and the one
 * light in front of the glass a macro photographer adds (Light Play).
 *
 * The owner asked to "see some aspect of 3D when we zoom in", judged against
 * macro photographs of bubbles and drops. Set beside the closeup, the photos
 * have three things ours did not, every one of them optics rather than paint:
 *
 * - a thin bright line at the very rim of each bubble, outside its dark band;
 * - the liquid round a bubble seen through its wall, squeezed toward the rim,
 *   so the band shades into the window instead of stepping;
 * - a small, soft reflection of the photographer's light on the dome, on the
 *   side that faces it.
 *
 * The first two follow from the trace below with nothing tuned; the third is
 * Fresnel's reflectance times a softbox. Built into the display shader after
 * EDGE_LIGHT_WGSL (plateTransmit.ts), whose indices and aperture it reads.
 */

/** The softbox: how far off the lens's axis its centre sits, and its half-width, in radians of the air above the glass. */
export const SOFTBOX_TILT = 0.61;
export const SOFTBOX_HALF = 0.35;
/** The softbox's radiance against the light pad's at Light Play 1 (it rises as the square, so the dial's low half is gentle). */
export const SOFTBOX_GAIN = 80;

export const CLOSEUP_DEPTH_WGSL = /* wgsl */ `
/*
  Fresnel's reflectance for unpolarised light going from index n1 into n2,
  ci the cosine of the angle it meets the surface at: 1 past the critical
  angle, where the light cannot leave and is all reflected (total internal
  reflection). The light pad's light is unpolarised, so the mean of s and p.
*/
fn fresnelR(ci: f32, n1: f32, n2: f32) -> f32 {
  let st2 = (n1 / n2) * (n1 / n2) * max(0.0, 1.0 - ci * ci);
  if (st2 >= 1.0) { return 1.0; }
  let ct = sqrt(1.0 - st2);
  let rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  let rp = (n1 * ct - n2 * ci) / (n1 * ct + n2 * ci);
  return 0.5 * (rs * rs + rp * rp);
}

/*
  The light pad as seen from the water along a ray d radians off the axis.
  The pad is a diffuser, the same radiance every way, under the bottom glass;
  its light crosses the air below the glass, the glass and into the water, so
  in the water it arrives only inside the critical cone (asin 1/1.333, 48.6
  degrees: a ray steeper than that, traced back, never left the pad, it is
  trapped in the glass), and the air-to-glass face passes less of it the more
  obliquely it came (Fresnel). So a ray the liquid turns past about 40 degrees
  sees less of the pad, and past 48.6 none of it: the dark band. The lens's
  own aperture (DROP_NA) takes in rays across a cone, so the pad is averaged
  over four rays across it: the band's edges are as soft as the lens makes
  them, not a step.
*/
fn padOne(d: f32) -> f32 {
  let s = N_WATER * sin(clamp(d, 0.0, 1.5707963));
  if (s >= 1.0 || d >= 1.5707963) { return 0.0; }
  // Transmission into the glass at the angle the ray had in the air below it.
  let t = 1.0 - fresnelR(sqrt(1.0 - s * s), N_AIR, 1.52);
  return t / 0.957;
}
fn padLight(d: f32) -> f32 {
  let a = asin(DROP_NA);
  return 0.25 * (padOne(abs(d - 0.75 * a)) + padOne(abs(d - 0.25 * a)) + padOne(d + 0.25 * a) + padOne(d + 0.75 * a));
}

/*
  The photographer's softbox (Light Play), above the glass and off to one
  side as macro photographs light a drop, so the flat glass's own mirror
  image of it misses the lens (that reflection is a level sheen with no shape
  in it, which a photographer moves the light to avoid). What reaches the lens
  is its image in a curved surface: a ray leaving the camera, turned back up
  by a tilted wall, crosses the water, the glass and the air and lands on the
  softbox or does not. up is that ray's direction in the water, unit length,
  z up. The softbox's edge is soft over a fifth of its half-width.
*/
fn softboxSeen(up: vec3f) -> f32 {
  if (up.z <= 0.0) { return 0.0; }
  // Out through the glass into the air: the sine off the axis grows by the water's index.
  let sa = N_WATER * length(up.xy);
  if (sa >= 1.0) { return 0.0; }
  let air = vec3f(select(vec2f(0.0), normalize(up.xy) * sa, sa > 1e-5), sqrt(1.0 - sa * sa));
  let toBox = vec3f(vec2f(-0.70710678, 0.70710678) * sin(${SOFTBOX_TILT}), cos(${SOFTBOX_TILT}));
  let off = acos(clamp(dot(air, toBox), -1.0, 1.0));
  return 1.0 - smoothstep(${SOFTBOX_HALF} * 0.8, ${SOFTBOX_HALF} * 1.2, off);
}

/*
  An air pocket's wall seen from above, a dome of slope s (rise over run)
  whose downhill points along out. A camera ray comes down through the water
  over the wall and meets the air at the angle the slope makes, θ:

  - It refracts into the air, turned outward by asin(1.333 sin θ) - θ, and
    out through the wall on the far side by as much again (the wall is the
    same meniscus top and bottom), with what Fresnel lets through each time.
    Turned outward is what a lens of air in water is: a diverging lens, so the
    liquid round the pocket is seen through its wall, small and upright,
    squeezed toward the rim. The w of the result is the tangent of the first
    turn, for the caller to read the liquid that far away.
  - It reflects. Past 45 degrees the reflected ray goes on downward, and past
    the critical angle (48.6) all of it does: grazing the rim, the ray is
    turned by little and sees the pad, so the very edge of a bubble is a thin
    bright line outside its dark band, as every backlit bubble photographs.
    Short of 45 degrees it goes back up, toward the softbox.

  Returns the pad's light through the wall (x), the pad's light by
  reflection (y), the softbox's (z, at its own radiance 1) and the tangent.
*/
fn airWall(s: f32, dn: vec2f) -> vec4f {
  let ci = inverseSqrt(1.0 + s * s);
  let th = acos(ci);
  let R = fresnelR(ci, N_WATER, N_AIR);
  var through = 0.0;
  var turn = 0.0;
  if (R < 1.0) {
    turn = asin(min(1.0, N_WATER * sin(th))) - th;
    through = (1.0 - R) * (1.0 - fresnelR(cos(th + turn), N_AIR, N_WATER)) * padLight(2.0 * turn);
  }
  // The reflected ray's angle from straight down: pi - 2θ.
  let back = 3.14159265 - 2.0 * th;
  let bounced = R * padLight(back);
  let up = vec3f(dn * sin(2.0 * th), cos(2.0 * th));
  let front = R * softboxSeen(up);
  return vec4f(through, bounced, front, tan(min(turn, 1.4)));
}
/*
  The wall at a point t across its half-round meniscus (dropBand: 0 where
  the flat window ends, 1 at the contact), where sin θ = t, averaged over
  the pixel's width there (soft, in the same units) so the bright line at
  the contact, a tenth of the meniscus wide, does not sparkle on a small
  bubble. dn is the way out of the bubble.
*/
fn airWallAt(t: f32, dn: vec2f) -> vec4f {
  let st = clamp(t, 0.0, 0.9995);
  return airWall(st * inverseSqrt(1.0 - st * st), dn);
}
fn airWallSeen(t: f32, soft: f32, dn: vec2f) -> vec4f {
  let mid = airWallAt(t, dn);
  let side = 0.5 * (airWallAt(t - 0.5 * soft, dn) + airWallAt(t + 0.5 * soft, dn));
  return vec4f(0.5 * (mid.xyz + side.xyz), mid.w);
}
/*
  The liquid above and below the pocket. A bubble wider than the gap is a
  pancake: its middle is air from glass to glass and the camera sees the pad
  through it, clear. One narrower than the gap is a ball, and the liquid it
  did not displace lies above and below it: at its middle a column of
  2(rho - R) of the gap's 2 rho, toward its rim more. The solver clears the
  dye from the whole of the pocket's footprint (it is 2D), so that column's
  colour is put back here, as Beer-Lambert says a part of the depth passes:
  the liquid's own transmission round the bubble (rimCol against c, the
  light the ray found where it landed) to the share of the depth left. So a
  small bubble's middle is the liquid's colour, lighter, as in every macro
  photograph of bubbles in a dyed liquid, and the softbox's reflection on it
  shows. Where the ray landed in the liquid already (the band), c is that
  liquid and nothing more is taken. tB is where on its meniscus (dropBand),
  the air's half-thickness there min(R, rho) sqrt(1 - tB^2).
*/
fn airColumn(c: vec3f, rimCol: vec3f, tB: f32, R: f32, rho: f32) -> vec3f {
  let T = clamp(rimCol / max(c, vec3f(1e-3)), vec3f(1e-4), vec3f(1.0));
  let left = clamp(1.0 - min(R, rho) * sqrt(max(0.0, 1.0 - tB * tB)) / max(rho, 1e-6), 0.0, 1.0);
  return c * pow(T, vec3f(left));
}
/*
  The film on the glass over a pocket (the one its own speed laid,
  Bretherton), as the camera sees it: a multiplier on the light that crosses
  it. At Film Physics 0 the rainbow every look was made with, as it always
  was. At 1 the light through the film, 1 - R: 92 to 100 per cent of the
  pad in pale complements of the reflected colours, the projector's tint
  exactly (plate.ts, cp), because the camera here is lit from beneath as
  the projector is and looks through the same film.

  It used to give the camera the reflected colours, the soap's gold, from
  when its bubble was painted as if lit from the front. Traced, a reflected
  film colour needs a light on the far side of the mirror from the lens, and
  there is none: the film lies flat on the glass, so it mirrors the lens
  axis, and the softbox spans 15 to 55 degrees off it (SOFTBOX_TILT and
  SOFTBOX_HALF). Its glint lands where the meniscus is 8 to 28 degrees
  steep, and there the liquid between the air and the glass is
  rho (1 - cos θ) deep, 5 to 56 microns at half a millimetre: four times
  and more past the 1.2 microns where a film's colours wash out
  (lib/filmTable.ts). So the glint stays white.
  Measured by npm run filmlook: the camera's film adds a faint complement,
  as the projector's.
*/
fn camFilm(filmC: vec3f, filmP: f32, irid: f32, F: f32) -> vec3f {
  var m = mix(vec3f(1.0), 0.45 + 1.25 * filmC, clamp(irid * (0.25 + 0.95 * F), 0.0, 1.0));
  if (U.filmPhysics > 0.0) {
    m = mix(m, mix(vec3f(1.0), filmTableAt(filmP, true), clamp(irid, 0.0, 1.0)), U.filmPhysics);
  }
  return m;
}
/* The softbox's radiance, the pad's being 1: none at Light Play 0. */
fn softboxRadiance() -> f32 { return ${SOFTBOX_GAIN.toFixed(1)} * U.lightPlay * U.lightPlay; }
`;
