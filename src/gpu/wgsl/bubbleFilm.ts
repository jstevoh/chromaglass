/**
 * The bubble's film as the projector throws it (PLAN 38h-14): the light that
 * passes through the film, never more than the lamp gave it.
 *
 * A bubble between a projector's glasses is a pocket of air, and its film is
 * lossless: what it does not let through it reflects, up toward the lamp,
 * never to the screen. So the light that reaches the wall through it is
 * T = 1 - R of the lamp, in the pale complement of the reflected colour:
 * magenta where the reflection is green, straw where it is blue.
 *
 * The projector's bubble used to wear the camera's reflected film,
 * cp * (0.45 + 1.25 * filmC), which multiplies the plate by up to 1.7 where
 * the rainbow is bright. At Iridescence 1 against 0, Film Physics 0, the
 * plate's bubbles read 54 levels brighter (`npm run nolight` line 15): light
 * out of a pocket of air that has nothing to give it. At Film Physics 1 it
 * already gave way to the measured soap film's transmission, so this only
 * changes what the rainbow does, below that.
 *
 * At Film Physics 0 the reflected colour is the look's rainbow, filmC,
 * standing for R at FILM_R_RAINBOW of the lamp at full strength. A real soap
 * film reflects at most about 8 per cent (the research, item 8; lib/filmTable.ts),
 * so this is a setting ramped past what soap does, as Iridescence always was;
 * but its form is the real one, a share of the lamp taken away, so no pixel
 * is brighter than the plate with no film under it. Its depth is the old
 * film's on its dark side, 1 - 0.6 * 0.55 = 0.67 at the rainbow's peak, so
 * the film is as strong a mark as before, drawn by what it takes instead of
 * what it added.
 *
 * Built into the display shader (plate.ts), whose filmTableAt it reads.
 */

/** The share of the lamp the rainbow film reflects away at full Iridescence, Film Physics 0. */
export const FILM_R_RAINBOW = 0.55;

export const BUBBLE_FILM_WGSL = /* wgsl */ `
/*
  The light through a projected bubble's film: cp0 the plate under it,
  filmC the look's film colour (the rainbow, or toward soap's reflection as
  Film Physics rises), filmP the film's thickness in periods, iridP how much
  of it the look asks for above Iridescence's quarter.
*/
fn projectorFilm(cp0: vec3f, filmC: vec3f, filmP: f32, iridP: f32) -> vec3f {
  var cp = cp0 * (1.0 - ${FILM_R_RAINBOW.toFixed(2)} * clamp(iridP * 0.6, 0.0, 1.0) * filmC);
  // With Film Physics up, the measured film: the light through soap, 1 - R,
  // 92 to 100 per cent of the lamp in pale complements of the reflected
  // colours. A real soap film on a projected plate is a faint tint.
  if (U.filmPhysics > 0.0) {
    let cpT = cp0 * filmTableAt(filmP, true);
    cp = mix(cp, mix(cp0, cpT, clamp(iridP, 0.0, 1.0)), U.filmPhysics);
  }
  return cp;
}
`;
