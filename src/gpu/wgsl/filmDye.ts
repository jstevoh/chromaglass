/**
 * The clear film's own dye (PLAN 20b-13): an oil-soluble dye dissolved in the
 * clear oil film that tears into lace (PLAN §20b, `film.ts`), so the lace can
 * be a colour of its own over the water's.
 *
 * What was asked: the owner liked a still of yellow lacy veins and cells with
 * fine spatter over a lavender wash, cobalt and coral, and asked for a look
 * like it. In the lab the obvious way, a yellow oil sheet of the solver's
 * Oil Bodies with water holes punched in it, showed lace for about a second
 * and then Cahn–Hilliard pulled every vein into a blob by three seconds, at
 * any oil tension from 0.08 to 0.9: a phase field coarsens, it does not hold
 * a net. The still's lace is a thin coloured oil film dewetting, which is
 * what Clear Film already does by itself (thin spots and the dish's dust
 * tear it, its ligaments bead into rows of drops, the spatter). What it
 * lacked was a colour, because it was laid undyed.
 *
 * So the film carries a dye, and the dye does what a dye in a layer does to
 * the lamp coming up through it: Beer and Lambert, A = ε c ℓ, wavelength by
 * wavelength. The path ℓ is the film's own thickness where it lies, h (its
 * share of the gap) times the gap; the concentration c is the dial. Where
 * the film is whole the lamp is filtered by all of it, where it has thinned
 * to a ligament by less, and in a hole, on the molecular precursor the
 * disjoining pressure leaves (h_p 0.06), by almost none, so the water's
 * colour comes through the holes clean. Nothing here draws a vein or a hole:
 * the picture is the film's thickness field read as a path length.
 *
 * The colour picked is what one unit of the dye lets through, as every dye
 * in the solver is kept (`lampThrough`'s `unit`, exp(-a)): the dial at the
 * middle on a film thin enough to tear (h 0.35) is one unit, so the swatch is
 * the colour the lace takes there. More dye or a thicker film is that colour
 * raised to the power of the path, so it deepens and saturates, and with
 * Spectral Optics on, shifts hue the way a deep glass of a yellow dye goes
 * orange (dichromatism, `spectralThrough`). The dial rises as the square of
 * the concentration so its low half is a faint cream and its top a film
 * fourteen units deep (`FILM_DYE_DEPTH`), very gentle to very extreme.
 *
 * On the black ground (Lamp Ground 0, the dye painted as light) a filter over
 * black is black, so the film's dye is painted the way the water's is: its
 * tint, the light it lets through normalised to its brightest channel, over
 * what is beneath at the share of the lamp it takes away. The two grounds
 * then show the same film the same depth of dye.
 *
 * At strength 0, and wherever there is no film, both are exactly 1 and the
 * colour passed through untouched: the plate is the plate it was, byte for
 * byte (`npm run lace`, item 8).
 */

import { FILM_PRECURSOR } from './film';

/** How many units of the dye a whole-gap film holds at Film Dye 1: a film h 0.35 at the dial's middle is 14 × 0.25 × (0.35 − 0.06) ≈ 1 unit. */
export const FILM_DYE_DEPTH = 14;

export const FILM_DYE_WGSL = /* wgsl */ `
/*
  What the lamp gets through the film's dye, colour by colour, for a film h
  (its share of the gap) in a gap of the given scale. The path is the film
  above its precursor: the solver keeps a hole wet with a layer h_p thick
  (the disjoining pressure's molecular film, ${FILM_PRECURSOR} of the gap here
  so the grid can hold it, nanometres in a real dish), and a real hole holds
  no dye worth the name, so a hole lets the whole lamp through. Exactly 1
  with no dye or no film, so neither ground is touched.
*/
fn filmDyeThrough(h: f32, gap: f32) -> vec3f {
  let k = U.filmDye.w;
  let path = max(h - ${FILM_PRECURSOR}, 0.0) * gap;
  if (k <= 0.0 || path <= 0.0) { return vec3f(1.0); }
  return lampThrough(U.filmDye.rgb, ${FILM_DYE_DEPTH.toFixed(1)} * k * k * path);
}

/*
  The painted ground's share of it (Lamp Ground 0): c, what is beneath,
  filtered by the dye and then laid under the dye's own tint at the share of
  the light the dye takes. With T = 1 it is c itself.
*/
fn filmDyePaint(c: vec3f, T: vec3f) -> vec3f {
  if (U.filmDye.w <= 0.0) { return c; }
  let a = 1.0 - min(T.r, min(T.g, T.b));
  return mix(c * T, T / max(max(T.r, max(T.g, T.b)), 1e-3), a);
}
`;
