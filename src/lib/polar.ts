/*
  Polarised light: a polariser under the plate, an analyser at the
  projector's head, and a liquid that turns the light between them when it
  is stretched (PLAN 31p-1).

  What was asked. The owner, 2026-11-14, sent a photograph of moulded petri
  dishes between two polarising sheets ("Check these bubbles out"; kept as
  references/still-polarized-dishes): rainbow bands in the textbook order,
  pinwheel fans dark or pale about the injection point of each dish, thin
  pale rims. Those colours are not a thin film's. They are birefringence:
  a material whose refractive index differs along two axes slows one
  polarisation behind the other by the retardation G = dn x thickness, and
  the analyser turns that phase difference into colour. The order of the
  colours with G (grey, white, yellow, orange, the first-order red at 550 nm,
  blue, green, yellow again, and paler orders after) is the Michel-Levy
  chart, and it is what this file computes.

  The law. Unpolarised light through a polariser (axis at 0), a retarder of
  retardation G whose slow axis stands at theta, and an analyser at alpha
  passes, at wavelength lambda,

      T = cos^2 alpha - sin 2theta sin 2(theta - alpha) sin^2(pi G / lambda)

  of what the polariser passed (Jones calculus, any optics text: Born and
  Wolf section 15.4.3; Hecht 8.7). Crossed (alpha = 90 degrees) it is
  sin^2 2theta sin^2(pi G / lambda): black where nothing is retarded, black
  where the axis lines up with either sheet (the dark arms of the pinwheel,
  the isoclinics), and the Michel-Levy colour elsewhere. Parallel (alpha = 0)
  it is one minus that: the complementary colours on a white field, which is
  how the owner's photograph was lit (pale ground, pale arms). Turning the
  analyser between the two is a live dial: every colour swings to its
  complement.

  Quarter-wave sheets: the dark lines. Between plane sheets every place
  where the stretch lines up with a sheet is black whatever its retardation,
  and in a stirred liquid those isoclinics are thick dark worms through
  every band (the lab's first pictures, 2026-11-14; the owner does not want
  thick black outlines). Photoelasticity labs remove them with a quarter-wave
  plate after the polariser and another, crossed, before the analyser: the
  light reaching the liquid is circular and has no axis to line up with.
  Through polariser at 0, quarter-wave plate at 45, retarder, quarter-wave
  plate at -45 and analyser at alpha (delta = 2 pi G / lambda),

      T = (1 + cos 2alpha cos delta + sin 2alpha cos 2theta sin delta) / 2

  (worked through Jones matrices against 200 random cases to 1e-15, scratch,
  2026-11-14): crossed it is sin^2(delta / 2), the Michel-Levy colour alone
  with no isoclinic; parallel its complement. Quarter Wave lays the plates in
  by its share; at 1 (the default once the sheets are in) the bands have no
  black lines through them, at 0 the pinwheel arms of the owner's photograph
  are back.

  Why two tables and not a spectrum per pixel. Both laws are
  T = A + B S(lambda) + C N(lambda) with S = sin^2(pi G / lambda),
  N = sin(2 pi G / lambda), and A, B, C scalars at a pixel: plane sheets
  A = cos^2 alpha, B = -sin 2theta sin 2(theta - alpha), C = 0; quarter-wave
  A = cos^2 alpha, B = -cos 2alpha, C = sin 2alpha cos 2theta / 2. Colour is
  linear in the spectrum, so the colour of T is A times the lamp's white plus
  B and C times the colours of S and N, which depend on G alone. One row of
  each per G is the table, worked out once through the same lamp,
  eye and white balance as the soap film's (`lampLinear` in filmTable.ts),
  and summed in linear light before the encode, which is the only place the
  sum is exact. `polarColour` below is the table's answer; `polarSpectral`
  integrates T itself, and `npm run polar` holds the two to each other.

  What retards in the liquid: flow birefringence. Long molecules or
  particles in a liquid (worm-like soap micelles such as CTAB with sodium
  salicylate, dissolved polymers, cellulose nanocrystals, vanadium
  pentoxide sols) are lined up by a flow that stretches them, and the liquid
  is then birefringent with its slow axis along the stretching direction.
  For a liquid in the linear regime the stress-optic law gives
  dn = C (sigma1 - sigma2) = 4 C eta e, where e is the principal strain rate
  (half the difference of the strain-rate tensor's two eigenvalues) and eta
  the viscosity, so G = 4 C eta e h through a layer h deep. A still liquid
  retards nothing and is dark between crossed sheets; a stirred one lights
  up where it is stretched, brightest along shear layers and round anything
  the flow parts round (a bubble), and goes dark again as it slows. Real
  numbers: C about 1e-7 per pascal for a micelle solution, eta 1 to 30 Pa s,
  e 1 to 10 per second, h 2 mm: G from a few tens of nanometres to the
  second order, which is the Birefringence dial's lower half.

  The scale. The plate's velocity is in the solver's own units per plate
  width, with no physical clock to turn it into per second (Speed scales the
  solver's step), so the dial is the retardation per unit of the solver's
  strain rate, measured. Through the lab (scratch probe, 2026-11-14, 192
  cells): a plate stirred by Turbulence 0.3 has a median strain rate of 1.6
  solver units and a 99th percentile of 4.0; Turbulence 1, 5.2 and 13. At
  BIREF_NM_PER_STRAIN = 1000 and the default Birefringence of 0.3, a
  Turbulence-0.3 stir is 480 nm at its median (first-order orange and red)
  and 1200 nm in its strongest shear (second order), the broad bands of the
  photograph; at 0.5 the lab's plate was already a contour map of fine
  third-order rings. Past that the dial ramps to the pale high orders, as
  the operating rules allow.

  What this model leaves out, each a PLAN item: the colour lingering after
  the stir (a liquid with a relaxation time carries its alignment with the
  flow; 31p-2), the second plate's liquid (31p-4), solids with frozen stress
  such as moulded dishes and cellophane (31p-3), and the per-wavelength
  product with the dye's absorption (the plate multiplies RGB; 31p-5).
*/
import { lampLinear } from './filmTable';

/** Table rows every POLAR_STEP_NM of retardation, from 0 to POLAR_MAX_NM: finer than the narrowest band (the first-order red, about 40 nm). */
export const POLAR_STEP_NM = 20;
export const POLAR_MAX_NM = 3000;
export const POLAR_STEPS = POLAR_MAX_NM / POLAR_STEP_NM + 1;
/**
 * Past the table, the orders crowd so close across the visible that the eye
 * sees their mean, sin^2 averaged: a grey of half. The shader fades the
 * table's last row to it over this many nanometres more.
 */
export const POLAR_FADE_NM = 1500;
/** Retardation, nm, per unit of the solver's principal strain rate at Birefringence 1 (measured above). */
export const BIREF_NM_PER_STRAIN = 1000;

/** The retarder's two shares of the spectrum: S = sin^2(pi G / lambda), N = sin(2 pi G / lambda). */
export const retarderSpectrum = (G: number, l: number) => Math.sin((Math.PI * G) / l) ** 2;
export const retarderSine = (G: number, l: number) => Math.sin((2 * Math.PI * G) / l);

/**
 * T at one wavelength: polariser at 0, slow axis at theta, analyser at alpha
 * (radians), with the quarter-wave plates in by the share q (0 plane, 1
 * circular; between, that share of the beam through them).
 */
export function polarTransmission(G: number, theta: number, alpha: number, l: number, q = 0): number {
  const [A, B, C] = polarWeights(theta, alpha, q);
  return A + B * retarderSpectrum(G, l) + C * retarderSine(G, l);
}

/** The colours of S and of N under the lamp, linear sRGB, lamp white = 1 (N is signed). */
export function retarderColour(G: number): [number, number, number] {
  return lampLinear((l) => retarderSpectrum(G, l));
}
export function retarderSineColour(G: number): [number, number, number] {
  return lampLinear((l) => retarderSine(G, l));
}

let TABLE: { S: [number, number, number][]; N: [number, number, number][] } | null = null;
/** The tables: the colours of S and N every POLAR_STEP_NM from 0 to POLAR_MAX_NM. */
export function polarTable(): { S: [number, number, number][]; N: [number, number, number][] } {
  if (!TABLE) {
    const G = Array.from({ length: POLAR_STEPS }, (_, i) => i * POLAR_STEP_NM);
    TABLE = { S: G.map(retarderColour), N: G.map(retarderSineColour) };
  }
  return TABLE;
}

/** The three scalars at a pixel: T = A + B S + C N. */
export function polarWeights(theta: number, alpha: number, q = 0): [number, number, number] {
  const A = Math.cos(alpha) ** 2;
  const plane = -Math.sin(2 * theta) * Math.sin(2 * (theta - alpha));
  const circ = -Math.cos(2 * alpha);
  return [A, plane + (circ - plane) * q, q * 0.5 * Math.sin(2 * alpha) * Math.cos(2 * theta)];
}

/** The colour the shader computes, linear: A white + B S + C N from the tables, interpolated and faded as the shader does. */
export function polarColour(G: number, theta: number, alpha: number, q = 0): [number, number, number] {
  const { S, N } = polarTable();
  const t = Math.min(Math.max(G / POLAR_STEP_NM, 0), POLAR_STEPS - 1);
  const i = Math.min(Math.floor(t), POLAR_STEPS - 2), f = t - i;
  const fade = smooth(POLAR_MAX_NM, POLAR_MAX_NM + POLAR_FADE_NM, G);
  const [A, B, C] = polarWeights(theta, alpha, q);
  return [0, 1, 2].map((c) => {
    const s = S[i][c] * (1 - f) + S[i + 1][c] * f;
    const n = N[i][c] * (1 - f) + N[i + 1][c] * f;
    return A + B * (s * (1 - fade) + 0.5 * fade) + C * n * (1 - fade);
  }) as [number, number, number];
}

/** The colour of T integrated wavelength by wavelength, for holding the tables to. */
export function polarSpectral(G: number, theta: number, alpha: number, q = 0): [number, number, number] {
  return lampLinear((l) => polarTransmission(G, theta, alpha, l, q));
}

/**
 * The flow's retardation and slow axis from its velocity gradient, as the
 * shader takes them: du = (du/dx, dv/dx), dv = (du/dy, dv/dy) in the
 * solver's units per plate width. Returns [G nm, theta radians, e].
 */
export function flowRetardation(du: [number, number], dv: [number, number], birefringence: number): [number, number, number] {
  const a = 0.5 * (du[0] - dv[1]);
  const b = 0.5 * (dv[0] + du[1]);
  const e = Math.hypot(a, b);
  return [birefringence * BIREF_NM_PER_STRAIN * e, 0.5 * Math.atan2(b, a), e];
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** The table as WGSL constants, for the plate shader's source (gpu/wgsl/platePolar.ts). */
export function polarTableWgsl(): string {
  const row = (c: [number, number, number]) => `vec3f(${c.map((v) => v.toFixed(4)).join(', ')})`;
  return [
    `const POLAR_STEPS: u32 = ${POLAR_STEPS}u;`,
    `const POLAR_STEP_NM: f32 = ${POLAR_STEP_NM.toFixed(1)};`,
    `const POLAR_MAX_NM: f32 = ${POLAR_MAX_NM.toFixed(1)};`,
    `const POLAR_FADE_NM: f32 = ${POLAR_FADE_NM.toFixed(1)};`,
    `const POLAR_S = array<vec3f, ${POLAR_STEPS}>(${polarTable().S.map(row).join(', ')});`,
    `const POLAR_N = array<vec3f, ${POLAR_STEPS}>(${polarTable().N.map(row).join(', ')});`,
  ].join('\n');
}
