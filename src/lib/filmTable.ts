/*
  The colours of a thin film, as physics gives them rather than as a
  rainbow. The plate's film colour (`thinFilmColour` in the plate shader)
  was a cosine palette, 0.5 + 0.5 cos(2 pi (t + (0, 1/3, 2/3))): the same
  three hues going round for ever, with no black film where a film is
  thinnest, no silver, straw and first-order purple, and no washing out as
  it thickens. The research on bubbles and drops (item 8) set out what a
  real film does, and this is it, worked out once when the module loads.

  A film of index n1 between n0 and n2, d nanometres thick, seen straight
  on, reflects each wavelength by Airy's sum of its two faces:

    r = (r01 + r12 e^{i delta}) / (1 + r01 r12 e^{i delta}),
    delta = 4 pi n1 d / lambda,   R = |r|^2,   T = 1 - R.

  That is summed over the visible under a 5500 K lamp through the CIE 1931
  matching functions (Wyman, Sloan and Shirley's analytic fit, 2013), white
  balanced to the lamp and turned into sRGB. For soap (n = 1.33 in air) it
  gives the textbook sequence: black under 30 nm, silver-grey to 120,
  straw at 150, purple at 200, blue at 250, green-gold at 280 to 330,
  orange at 360, magenta at 400, blue then green again at 450 to 500, and
  paler orders after, washing out past about 1200 nm. It is the research's
  own film.py, line for line, so the two can be held to each other.

  Reflected light is what a camera or an eye beside the lamp sees, and it
  is faint: a soap film reflects at most about 8 per cent, so `filmTable` gains it to
  fill the range. Transmitted light, the only light a projector throws
  through a film, is 1 - R: 92 to 100 per cent, so it gives the pale
  complements of the reflected colours and nothing stronger. Both are
  given; the plate draws the one its view calls for.
*/

const gauss = (l: number, mu: number, s1: number, s2: number) => {
  const s = l < mu ? s1 : s2;
  return Math.exp(-0.5 * ((l - mu) / s) ** 2);
};

/** CIE 1931 2-degree matching functions, Wyman, Sloan and Shirley's multi-lobe fit. */
function cie(l: number): [number, number, number] {
  const x = 1.056 * gauss(l, 599.8, 37.9, 31.0) + 0.362 * gauss(l, 442.0, 16.0, 26.7) - 0.065 * gauss(l, 501.1, 20.4, 26.2);
  const y = 0.821 * gauss(l, 568.8, 46.9, 40.5) + 0.286 * gauss(l, 530.9, 16.3, 31.1);
  const z = 1.217 * gauss(l, 437.0, 11.8, 36.0) + 0.681 * gauss(l, 459.0, 26.0, 13.8);
  return [x, y, z];
}

/** A black body's relative spectral power at `l` nm and T kelvin. */
function planck(l: number, T: number): number {
  const m = l * 1e-9;
  return 1 / (m ** 5 * (Math.exp(1.4388e-2 / (m * T)) - 1));
}

/** Airy reflectance of a film of index n1, d nm thick, between n0 and n2, at `l` nm, straight on. */
export function filmReflectance(n0: number, n1: number, n2: number, d: number, l: number): number {
  const r01 = (n0 - n1) / (n0 + n1), r12 = (n1 - n2) / (n1 + n2);
  const ph = (4 * Math.PI * n1 * d) / l;
  const c = Math.cos(ph), s = Math.sin(ph);
  // (r01 + r12 e^{i ph}) / (1 + r01 r12 e^{i ph}), as real and imaginary parts.
  const nr = r01 + r12 * c, ni = r12 * s;
  const dr = 1 + r01 * r12 * c, di = r01 * r12 * s;
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}

const encode = (c: number) => {
  const v = Math.max(0, c);
  return Math.min(1, v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

const LAMBDAS: number[] = [];
for (let l = 380; l <= 780; l += 5) LAMBDAS.push(l);
/*
  The lamp and the eye at each wavelength, worked out once per lamp: the
  table is built when the plate shader's module loads, on the main thread,
  and recomputing them for every thickness at every bisection step cost
  about 45 ms of every app load.
*/
const WEIGHTS = new Map<number, { S: number[]; xyz: [number, number, number][] }>();
function weights(T: number) {
  let w = WEIGHTS.get(T);
  if (!w) { w = { S: LAMBDAS.map((l) => planck(l, T)), xyz: LAMBDAS.map(cie) }; WEIGHTS.set(T, w); }
  return w;
}

/**
 * The film's colour, in sRGB 0..1, and its luminance Y (of the lamp's, 0..1),
 * reflected ('R', times `gain`) or transmitted ('T').
 */
export function filmColour(n0: number, n1: number, n2: number, d: number, mode: 'R' | 'T', gain = 1, T = 5500): { rgb: [number, number, number]; Y: number } {
  let X = 0, Y = 0, Z = 0, Xw = 0, Yw = 0, Zw = 0;
  const w = weights(T);
  for (let j = 0; j < LAMBDAS.length; j++) {
    const l = LAMBDAS[j], S = w.S[j], [x, y, z] = w.xyz[j];
    const R = filmReflectance(n0, n1, n2, d, l), f = mode === 'R' ? R : 1 - R;
    X += S * f * x; Y += S * f * y; Z += S * f * z;
    Xw += S * x; Yw += S * y; Zw += S * z;
  }
  const k = gain / Yw;
  X *= k * ((0.9505 * Yw) / Xw); Y *= k; Z *= k * ((1.089 * Yw) / Zw);
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  return { rgb: [encode(r), encode(g), encode(b)], Y: Y / gain };
}

/** Soap film: water, n = 1.33, in air on both sides. */
export const SOAP = { n0: 1.0, n1: 1.33, n2: 1.0 };
/** The table's reach: past about 1200 nm the orders have washed out to a pale grey. */
export const FILM_MAX_NM = 1260;
/** Entries in the table: one every 20 nm, finer than any colour band in it (the narrowest, the first-order purple, is about 40 nm wide). */
export const FILM_STEPS = 64;
/**
  The rainbow's one period, in nanometres of soap film. The shader hands
  its film a phase t, one rainbow per unit; a physical film goes round one
  interference order per half wavelength in the film, lambda / (2 n1), about
  207 nm at the eye's 550. So t = 1 is 207 nm, t = 0 no film at all, and a
  bubble thinning with age (its t falling toward 0) now goes black just
  before it breaks, as soap does.
*/
export const FILM_NM_PER_T = 550 / (2 * 1.33);

/**
 * The table the shader reads: FILM_STEPS entries from 0 to FILM_MAX_NM,
 * each the reflected colour gained so the table's mean luminance is a half
 * (the rainbow palette's mean, so turning the physics up keeps the plate as
 * bright on average) and the transmitted colour, unscaled.
 */
let TABLE: { reflect: [number, number, number][]; transmit: [number, number, number][]; gain: number } | null = null;
export function filmTable(): { reflect: [number, number, number][]; transmit: [number, number, number][]; gain: number } {
  if (TABLE) return TABLE;
  const ds = Array.from({ length: FILM_STEPS }, (_, i) => (i * FILM_MAX_NM) / (FILM_STEPS - 1));
  // Two passes: the gain that puts the mean luminance of the gained
  // reflection at a half, then the table at that gain. Found by bisection,
  // since the sRGB encode and its clip make it not a straight scale.
  const luma = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const meanAt = (gain: number) => ds.reduce((a, d) => a + luma(filmColour(SOAP.n0, SOAP.n1, SOAP.n2, d, 'R', gain).rgb), 0) / ds.length;
  let lo = 0.5, hi = 64;
  for (let i = 0; i < 24; i++) { const mid = Math.sqrt(lo * hi); if (meanAt(mid) < 0.5) lo = mid; else hi = mid; }
  const gain = Math.sqrt(lo * hi);
  TABLE = {
    reflect: ds.map((d) => filmColour(SOAP.n0, SOAP.n1, SOAP.n2, d, 'R', gain).rgb),
    transmit: ds.map((d) => filmColour(SOAP.n0, SOAP.n1, SOAP.n2, d, 'T').rgb),
    gain,
  };
  return TABLE;
}

/** The table as WGSL constants, for the plate shader's source. */
export function filmTableWgsl(): string {
  const { reflect, transmit } = filmTable();
  const row = (c: [number, number, number]) => `vec3f(${c.map((v) => v.toFixed(4)).join(', ')})`;
  return [
    `const FILM_STEPS: u32 = ${FILM_STEPS}u;`,
    `const FILM_MAX_NM: f32 = ${FILM_MAX_NM.toFixed(1)};`,
    `const FILM_NM_PER_T: f32 = ${FILM_NM_PER_T.toFixed(4)};`,
    `const FILM_R = array<vec3f, ${FILM_STEPS}>(${reflect.map(row).join(', ')});`,
    `const FILM_T = array<vec3f, ${FILM_STEPS}>(${transmit.map(row).join(', ')});`,
  ].join('\n');
}
