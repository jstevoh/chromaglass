/*
  The moulded dish between the polarising sheets (PLAN 31p-3): the frozen
  stress in the dish's own plastic, a second retarder in the beam beneath the
  liquid's, and the two together through the sheets.

  What was asked (the owner, 2026-11-14): the photograph of moulded petri
  dishes on a light box between crossed polarisers (references/
  still-polarized-dishes). Each dish is ringed with colour bands, tight and
  pale near its middle and opening to broad first-order yellows and reds
  toward the rim, with a dark four-armed cross through them where the sheets
  are plane, and a bright pale wall round the edge.

  Where the stress comes from. A dish is injection moulded: the hot polymer
  is shot in through a gate at the middle of the base and spreads outward
  radially to fill the cavity, and the skin freezes against the cold steel
  while the core still flows. The chains in the skin are frozen as the flow
  sheared them, so the birefringence left in the base follows the wall shear
  rate of that filling flow. For a radial flow of rate Q through a gap h,
  the mean speed at radius r is Q / (2 pi r h) and the wall shear rate goes
  as Q / (r h^2): the frozen birefringence falls as 1/r from the gate, and
  so does the retardation through a base of even thickness. Near the gate the
  orders crowd (tight pale rings); at the rim they are one or two (the broad
  first-order bands). That is the 1/r law below, held at the gate's own radius
  so it stays finite in the sprue mark.

  The axes. The chains lie along the flow, radially. Polystyrene, which
  almost every clear dish is, has a negative birefringence (its phenyl rings
  stand across the chain), so the slow axis is across the chains: the hoop.
  Between plane sheets crossed, wherever the hoop lies along a sheet the
  light is black whatever the retardation, and the hoop lies along one sheet
  or the other on two lines through the gate: the four-armed cross of the
  photograph. Through quarter-wave plates the axis drops out and the rings
  are whole.

  The wall. Light from below goes through the wall along its height, about
  ten times the base's thickness, and the wall holds the hoop stress of its
  cooling (the rim shrinks onto the core and is pulled round). The
  retardation along that path is many orders: past the table, which is the
  pale grey-white of high orders, as the photograph's bright rims are. Its
  slow axis is the hoop too.

  The two retarders in series. Light goes up through the polariser, the
  dish's base (retardation G1, slow axis th1), then the liquid (G2, th2),
  then the analyser. On the Poincare sphere a linear retarder of phase d
  with its axis at th turns the polarisation (s1, s2, s3) about
  n = (cos 2th, sin 2th, 0) by d:
     R u = P u + cos d Q u + sin d K u,
  P u = n (n.u), Q u = u - n (n.u), K u = n x u.
  The light through is T = (1 + a.R2 R1 s) / 2, with s the polarisation
  after the polariser (and the first quarter-wave plate) and a the analyser's
  (with the second): plane sheets s = (1, 0, 0), a = (cos 2al, sin 2al, 0);
  quarter-wave plates s = (0, 0, 1), a = (0, -sin 2al, cos 2al), which are
  lib/polar.ts's two laws with one retarder. Multiplied out, a.R2 R1 s is
  nine terms in (1, cos d1, sin d1) x (1, cos d2, sin d2), and the products
  are sums: cos d1 cos d2 = (cos(d1 + d2) + cos(d1 - d2)) / 2 and so on.
  Each d is 2 pi G / lambda, so d1 +- d2 is the phase of G1 +- G2 at every
  wavelength, and the light is a sum of nine terms, each a weight from the
  axes times the colour of cos or sin at one of G1, G2, G1 + G2, |G1 - G2|
  (sin is odd: a negative difference takes the sine's sign). Those colours
  are lib/polar.ts's tables, cos = white - 2 S and sin = N, so the sum is the
  light integrated wavelength by wavelength, up to the tables' interpolation:
  four lookups instead of two retarders' worth of spectrum. Where the dish
  retards nothing this is the one-retarder law exactly; where the axes agree
  the two add (G1 + G2), and where they cross they subtract.

  What this leaves out, each a PLAN item: the dish's thermal stress in the
  base (a few nm, small beside the flow's frozen orientation; 31p-3a); a
  third retarder such as cellophane or tape (the two-retarder sum does not
  reach it; 31p-3b); and the base's thickness varying toward the wall.
*/
import { lampLinear } from './filmTable';
import { POLAR_FADE_NM, POLAR_MAX_NM, POLAR_STEP_NM, POLAR_STEPS, polarTable } from './polar';
import { OPEN_RIM } from './turntable';

/** The base's retardation, nm, at half the dish's radius at Dish Stress 1: the first order (about 600 nm) at the rim, the fourth at a quarter. */
export const DISH_STRESS_NM = 1200;
/** The gate's radius as a share of the dish's: inside it the 1/r law is held, the sprue mark. */
export const DISH_GATE_R = 0.04;
/** The wall's thickness as a share of the dish's radius, seen from above. */
export const DISH_WALL_W = 0.03;
/** The wall's retardation along its height at Dish Stress 1, nm: past the table, the pale of high orders. */
export const DISH_WALL_NM = 6000;
/** The dish's radius in plate uv, from the plate's middle: lib/turntable.ts's OPEN_RIM, the rim the liquid spills over. */
export const DISH_RIM_UV = OPEN_RIM;

function smooth(e0: number, e1: number, x: number) {
  if (e1 <= e0) return x < e0 ? 0 : 1;
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * The dish's retardation and slow axis at plate uv (x, y): [G nm, theta
 * radians in the plate's uv]. `px` is a pixel's width as a share of the
 * dish's radius, over which the wall's edges are smoothed as the shader
 * smooths them (0: hard edges).
 */
export function dishRetardation(x: number, y: number, stress: number, px = 0): [number, number] {
  const dx = x - 0.5, dy = y - 0.5;
  const r = Math.hypot(dx, dy) / DISH_RIM_UV;
  const base = (DISH_STRESS_NM * 0.5) / Math.max(r, DISH_GATE_R);
  const wall = smooth(1 - DISH_WALL_W - px, 1 - DISH_WALL_W, r);
  const inside = 1 - smooth(1, 1 + px, r);
  const G = Math.max(0, stress) * (base + (DISH_WALL_NM - base) * wall) * inside;
  return [G, Math.atan2(dy, dx) + Math.PI / 2];
}

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const axis = (th: number): V3 => [Math.cos(2 * th), Math.sin(2 * th), 0];

/** a.(X2_j X1_i s), rows i and columns j each P, Q, K: the nine coefficients of the series (the shader's polarSeriesM). */
function seriesM(s: V3, a: V3, n1: V3, n2: V3): number[][] {
  const p = n1.map((v) => v * dot(n1, s)) as V3;
  const us: V3[] = [p, [s[0] - p[0], s[1] - p[1], s[2] - p[2]], cross(n1, s)];
  const an = dot(a, n2), w = cross(a, n2);
  return us.map((u) => { const pu = an * dot(n2, u); return [pu, dot(a, u) - pu, dot(u, w)]; });
}

/**
 * The nine weights of the light through the sheets with the dish (th1) and
 * the liquid (th2) between them, analyser at alpha, quarter-wave plates in
 * by q: T = k0 + kc1 cos d1 + ks1 sin d1 + kc2 cos d2 + ks2 sin d2
 *   + kcp cos(d1 + d2) + kcm cos(d1 - d2) + ksp sin(d1 + d2) + ksm sin(d1 - d2).
 */
export function seriesWeights(th1: number, th2: number, alpha: number, q = 0) {
  const n1 = axis(th1), n2 = axis(th2);
  const P = seriesM([1, 0, 0], [Math.cos(2 * alpha), Math.sin(2 * alpha), 0], n1, n2);
  const C = seriesM([0, 0, 1], [0, -Math.sin(2 * alpha), Math.cos(2 * alpha)], n1, n2);
  const M = P.map((row, i) => row.map((v, j) => v + (C[i][j] - v) * q));
  return {
    k0: (1 + M[0][0]) / 2, kc2: M[0][1] / 2, ks2: M[0][2] / 2, kc1: M[1][0] / 2, ks1: M[2][0] / 2,
    kcp: (M[1][1] - M[2][2]) / 4, kcm: (M[1][1] + M[2][2]) / 4, ksp: (M[1][2] + M[2][1]) / 4, ksm: (M[2][1] - M[1][2]) / 4,
  };
}

/** T at one wavelength, the rotations applied one after the other (the reference the sum is held to). */
export function seriesTransmission(G1: number, th1: number, G2: number, th2: number, alpha: number, l: number, q = 0): number {
  const turn = (u: V3, n: V3, d: number): V3 => {
    const nu = dot(n, u), k = cross(n, u), c = Math.cos(d), s = Math.sin(d);
    return [0, 1, 2].map((i) => n[i] * nu + c * (u[i] - n[i] * nu) + s * k[i]) as V3;
  };
  const d1 = (2 * Math.PI * G1) / l, d2 = (2 * Math.PI * G2) / l;
  const through = (s: V3, a: V3) => (1 + dot(a, turn(turn(s, axis(th1), d1), axis(th2), d2))) / 2;
  const plane = through([1, 0, 0], [Math.cos(2 * alpha), Math.sin(2 * alpha), 0]);
  const circ = through([0, 0, 1], [0, -Math.sin(2 * alpha), Math.cos(2 * alpha)]);
  return plane + (circ - plane) * q;
}

/** The colours of cos and sin of 2 pi G / lambda under the lamp, from the tables, interpolated and faded as the shader's polarCS (G signed). */
export function polarCS(G: number): [V3, V3] {
  const { S, N } = polarTable();
  const a = Math.abs(G), sg = Math.sign(G);
  const t = Math.min(Math.max(a / POLAR_STEP_NM, 0), POLAR_STEPS - 1);
  const i = Math.min(Math.floor(t), POLAR_STEPS - 2), f = t - i;
  const fade = smooth(POLAR_MAX_NM, POLAR_MAX_NM + POLAR_FADE_NM, a);
  const c = [0, 1, 2].map((k) => 1 - 2 * ((S[i][k] * (1 - f) + S[i + 1][k] * f) * (1 - fade) + 0.5 * fade)) as V3;
  const s = [0, 1, 2].map((k) => sg * (N[i][k] * (1 - f) + N[i + 1][k] * f) * (1 - fade)) as V3;
  return [c, s];
}

/** The colour the shader computes for the two in series, linear (lamp white = 1). */
export function seriesColour(G1: number, th1: number, G2: number, th2: number, alpha: number, q = 0): V3 {
  const w = seriesWeights(th1, th2, alpha, q);
  const [c1, s1] = polarCS(G1), [c2, s2] = polarCS(G2), [cp, sp] = polarCS(G1 + G2), [cm, sm] = polarCS(G1 - G2);
  return [0, 1, 2].map((k) => w.k0 + w.kc1 * c1[k] + w.ks1 * s1[k] + w.kc2 * c2[k] + w.ks2 * s2[k]
    + w.kcp * cp[k] + w.kcm * cm[k] + w.ksp * sp[k] + w.ksm * sm[k]) as V3;
}

/** The light of the two in series integrated wavelength by wavelength. */
export function seriesSpectral(G1: number, th1: number, G2: number, th2: number, alpha: number, q = 0): V3 {
  return lampLinear((l) => seriesTransmission(G1, th1, G2, th2, alpha, l, q));
}

/** The dish's constants as WGSL, for the plate shader's source (gpu/wgsl/platePolar.ts). */
export function dishWgsl(): string {
  return [
    `const DISH_STRESS_NM: f32 = ${DISH_STRESS_NM.toFixed(1)};`,
    `const DISH_GATE_R: f32 = ${DISH_GATE_R};`,
    `const DISH_WALL_W: f32 = ${DISH_WALL_W};`,
    `const DISH_WALL_NM: f32 = ${DISH_WALL_NM.toFixed(1)};`,
    `const DISH_RIM_UV: f32 = ${DISH_RIM_UV.toFixed(2)};`,
  ].join('\n');
}
