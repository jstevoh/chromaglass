/**
 * The ferrofluid's spikes: where a magnet's field is strong enough to stand
 * them up.
 *
 * The field and its onset, shared by the solver (fluid.ts: whether a
 * magnet's film runs, and the maze's push past the domes) and the film that
 * stands the layer up (standing.ts: the lift, from the same field). Where
 * each dome is, is the layer's own now (PLAN 9t): until then it was a
 * lattice here, rings a pitch apart round each magnet, that the solver
 * gathered the liquid into and the plate drew a point of light on.
 *
 * Reported by the owner: "The ferrofluid magnet still sucks and doesn't make
 * spikes or fingers. It's just a big blob that gets pulled around by the
 * magnet." A real magnet brought up under a pool of ferrofluid stands its
 * surface up into a hedgehog of sharp peaks (the normal-field instability,
 * Cowley and Rosensweig 1967): below a critical field the pool lies flat,
 * past it the peaks rise at once, a capillary length apart, tallest over
 * the magnet and in rings round it, and they go where the magnet goes. In a
 * thin layer each peak draws the liquid up out of the valleys round it, so
 * from above the pool breaks into a field of black domes with the colour
 * showing between them, joined by thin channels: every ferrofluid macro the
 * owner sent (Chemical Bouillon's) is that.
 *
 * How far apart: SPIKE_PITCH, the onset's wavelength 2π l_c, which is what
 * sets the capillary length l_c the film is measured in.
 *
 * How strong the field has to be: the magnet's |B| at the glass (a cylinder,
 * magnetDisc.ts; until PLAN 9v a dipole, whose field on its axis went as
 * strength over height cubed), taken as a share of a magnet in the hand
 * pressed to the glass at the tool's own size (the Magnet tool: strength
 * 0.9, the solver's height 0.12 to 0.14 by Ferrofluid Scale), and falling
 * off the axis as the magnet's does. One share is SPIKE_B_REF of the rod's
 * remanence, 123 mT for an N52 rod (MAGNET_BR; `npm run magnetgain` works
 * the same chain for the pull).
 *
 * The peaks start at SPIKE_ONSET, 0.18 (22 mT), and are full by 0.35
 * (SPIKE_FULL; fluid.ts gates the solver's side on the same onset). That
 * onset is a shortcut, set in the lab so that every look's own magnet,
 * held further off (Magnet Garden's at 0.14, Ferro Paint's 0.08), gathers
 * its pool flat and only the hand's raises domes. The liquid's own onset
 * is worked out below (SPIKE_ONSET_REAL, PLAN 38k): 4.0 mT, a share of
 * 0.033, five times lower. It is not the one the plate runs on yet,
 * because past the onset the standing film (standing.ts) takes the pool
 * and the film has no Kelvin pull (PLAN 9t-2): at the real onset Magnet
 * Garden's and Ferro Paint's own magnets would hand their pools to a film
 * that cannot carry them, and a dragged drop is left behind (Mac CI on
 * #625: ferrodrag's lag 7.4 R). PLAN 38k-7 lowers SPIKE_ONSET to the real
 * one once 9t-2 gives the film its pull. The hand's is 0.8 to 1.1 at
 * Ferrofluid Scale 0.3 to 0.4; a big Scale holds it further off (the
 * solver's height goes as 0.5 + Scale).
 */
import { MAGNET_DISC_WGSL, MAGNET_RADIUS, discGap, discOnAxis } from './magnetDisc';
import { DISH_METRES } from '../../lib/turntable';

export const SPIKE_PITCH = 0.04;
export const SPIKE_H_REF = 0.13;

/**
 * How far into spikes a magnet is on its own axis, where its field is
 * strongest (spikeAmp there): what the solver ramps its own changes on, so
 * they arrive with the spikes the plate draws and not in one step.
 */
export function spikesOnAxis(strength: number, height: number, radius = MAGNET_RADIUS): number {
  const t = Math.max(0, Math.min(1, (fieldOnAxis(strength, height, radius) - SPIKE_ONSET) / (SPIKE_FULL - SPIKE_ONSET)));
  return t * t * (3 - 2 * t);
}

/**
 * The field the spikes are measured against: the tool's own magnet on its
 * axis, held at SPIKE_H_REF, at strength 1. So a share of 0.9 is the hand's
 * magnet pressed to the glass, as it was with the dipole.
 */
export const SPIKE_B_REF = discOnAxis(discGap(SPIKE_H_REF), MAGNET_RADIUS);

/*
  The liquid, in SI (PLAN 38k), the numbers \`npm run magnetgain\` takes for
  the pull. Ferrotec's EFH1, the light-show grade, by its sheet: saturation
  μ0Ms 44 mT, initial susceptibility 2.64, density 1210 kg/m³; it lies under
  water (1000), the lighter liquid over it in the dish (standing.ts's film
  is the same pair). The magnet is an N52 rod, remanence 1.45 T.
*/
export const FERRO_MS_TESLA = 0.044;
export const FERRO_CHI = 2.64;
export const FERRO_DENSITY = 1210;
export const WATER_DENSITY = 1000;
export const MAGNET_BR = 1.45;
const MU0 = 4e-7 * Math.PI;
function langevinOf(x: number): number { return x < 1e-3 ? x / 3 : 1 / Math.tanh(x) - 1 / x; }
function langevinSlope(x: number): number { return x < 1e-3 ? 1 / 3 : 1 / (x * x) - 1 / Math.sinh(x) ** 2; }

/*
  The field that stands the layer up, worked out from the liquid (PLAN 38k).

  Cowley and Rosensweig (1967): a layer of magnetic liquid under a field
  normal to it is flat until its magnetisation reaches

    μ0 Mc² = 2 (1 + 1/μ̂) √(Δρ g σ),   μ̂ = √(μ_chord μ_tangent),

  with Δρ the step in density across the surface and σ its tension; past
  it the surface stands up in peaks 2π l_c apart, l_c = √(σ / Δρ g). The
  plate's peaks are SPIKE_PITCH apart, so σ is not a second number here:
  √(Δρ g σ) is Δρ g l_c, and EFH1 under water at the pitch's l_c (1.27 mm)
  is a σ of 3.3 mN/m, low for an oil against water and about what a
  ferrofluid's surfactant leaves (the pitch is the look's, PLAN 38k-2).
  That puts Mc at 2.3 kA/m (μ0Mc 2.9 mT).

  What the magnet must give for it: the field inside a thin layer in a field
  normal to it is the applied one less the layer's own magnetisation,
  H_in = H0 − M (B is continuous across the faces), so the layer feels
  about 1/(1 + χ), 0.28, of the applied field at a weak one, and M is EFH1's
  Langevin curve of that inner field, M = Ms L(3χH/Ms). Solved for M = Mc:
  H_in 0.88 kA/m, and the applied field B0 = μ0(H_in + Mc) = 4.0 mT, a
  share of 0.033 of the reference. The lab's 0.18 (SPIKE_ONSET) is 22 mT,
  where a real layer would already be past onset five times over.

  SPIKE_ONSET_REAL is the target, printed and held to an independent
  solution by `npm run disc`; SPIKE_ONSET stays the lab's until the film
  has its pull (PLAN 9t-2, then 38k-7, which sets SPIKE_ONSET to this and
  SPIKE_FULL to it times the old ramp's 0.35 / 0.18). SPIKE_FULL is the
  solver's gate on what it changes as the domes arrive (spikesOnAxis,
  spikesClose), not the domes' own height, which the film's lift makes
  (standing.ts), and the jump at the onset is the film's (9t-3 has its
  hysteresis).
*/
export function ferroOnsetTesla(msTesla = FERRO_MS_TESLA, chi = FERRO_CHI, deltaRho = FERRO_DENSITY - WATER_DENSITY, lc = SPIKE_PITCH * DISH_METRES / (2 * Math.PI)): number {
  const ms = msTesla / MU0;
  const k = 3 * chi / ms;
  const stress = deltaRho * 9.81 * lc;
  const excess = (h: number): number => {
    const m = ms * langevinOf(k * h);
    const mu = Math.sqrt((1 + m / h) * (1 + ms * k * langevinSlope(k * h)));
    return MU0 * m * m - 2 * (1 + 1 / mu) * stress;
  };
  // Saturated short of Mc: no field stands it up.
  if (MU0 * ms * ms <= 4 * stress) return Infinity;
  let lo = 1e-3;
  let hi = 1e8;
  for (let i = 0; i < 200; i++) {
    const mid = Math.sqrt(lo * hi);
    if (excess(mid) < 0) lo = mid; else hi = mid;
  }
  return MU0 * (hi + ms * langevinOf(k * hi));
}
/** The liquid's onset on the share's scale (0.033): the target, PLAN 38k-7. */
export const SPIKE_ONSET_REAL = ferroOnsetTesla() / (SPIKE_B_REF * MAGNET_BR);
/** The onset the plate runs on: the lab's shortcut (22 mT) until the film has its pull (PLAN 9t-2). */
export const SPIKE_ONSET = 0.18;
export const SPIKE_FULL = 0.35;

/** A magnet's field on its own axis, on spikeAmp's scale (the onset is SPIKE_ONSET). */
export function fieldOnAxis(strength: number, height: number, radius = MAGNET_RADIUS): number {
  return strength * discOnAxis(discGap(height), radius) / SPIKE_B_REF;
}

/*
  The energy a field B sets up in the liquid (fluid.ts, magnetEnergy, whose
  gradient is the pull), B on magnetShare's scale.

  Bs is a field, on the same scale as B (PLAN.md 9v): the liquid saturates at
  a field whatever magnet makes it. It was a number in the old dipole's own
  units (150, of a field that was 2/h³ on its axis), so the magnet that
  Magnet Size sank deeper sat lower on the curve than the one it stood for.
  Both numbers are the old ones carried over at the hand's magnet: Bs is
  where 150 was against the hand's field (0.9 × 150 / (2/0.13³) = 0.148),
  and MAGNET_E makes ψ there what it was, so MAGNET_GAIN and the χ that reads
  ψ (phaseMu) keep their tuning. What changes is everything else: the
  field's shape (a cylinder's), a bigger magnet's (stronger at the glass at the
  same gap), and the strength, which is now a field and so goes into ψ
  squared far from the magnet and once close to it, where it went in once
  everywhere: a weaker magnet pulls the far liquid less than in proportion.
*/
export const MAGNET_BS = 0.9 * 150 / (2 / SPIKE_H_REF ** 3);
export const MAGNET_E = (2 / SPIKE_H_REF ** 3) ** 2 / 0.9;

export const SPIKES_WGSL = /* wgsl */ `
${MAGNET_DISC_WGSL}
const SPIKE_PITCH = ${SPIKE_PITCH};
const SPIKE_H_REF = ${SPIKE_H_REF};
const SPIKE_ONSET = ${SPIKE_ONSET};
const SPIKE_FULL = ${SPIKE_FULL};
const SPIKE_B_REF = ${SPIKE_B_REF};
const MAGNET_BS = ${MAGNET_BS};
const MAGNET_E = ${MAGNET_E};
// ψ = B² / (1 + B/Bs): quadratic far from the magnet, linear close in (fluid.ts, magnetEnergy).
fn magnetFieldEnergy(b: f32) -> f32 {
  return MAGNET_E * b * b / (1.0 + b / MAGNET_BS);
}
// The field of magnet m = (x, y, height, strength) at p, as a share of the
// hand's magnet pressed to the glass: its strength times the magnet's field
// (magnetDisc.ts; magnetRadius() is the including shader's).
fn magnetShare(p: vec2f, m: vec4f) -> f32 {
  if (m.w <= 0.001) { return 0.0; }
  return m.w * magnetDiscField(p, m, magnetRadius()) / SPIKE_B_REF;
}
// The same field as a vector on the same scale, so magnets add as fields
// (PLAN 38k): magnetsEnergy and the drop's pull take the length of the sum.
fn magnetVec(p: vec2f, m: vec4f) -> vec3f {
  if (m.w <= 0.001) { return vec3f(0.0); }
  return m.w * magnetDiscFieldVec(p, m, magnetRadius()) / SPIKE_B_REF;
}
// All the magnets' field at p, |m's + each of mags'|, on magnetShare's scale:
// the one sum the solver's pull (magnetsEnergy) and the drop's take, and
// what \`npm run disc\` holds to Biot–Savart's vector sum (PLAN 38k).
fn magnetsShare(p: vec2f, m: vec4f, mags: array<vec4f, 3>) -> f32 {
  var b = magnetVec(p, m);
  for (var k = 0; k < 3; k++) {
    if (mags[k].w > 0.0) { b += magnetVec(p, mags[k]); }
  }
  return length(b);
}
// How far into spikes the field of magnet m is at p: 0 flat, 1 full. The
// plate asks this of every pixel, so past twice the rim and the gap, where
// the magnet's field is under 1.25 times its dipole's (\`npm run disc\`
// measures the most it is), a field too weak for spikes even so is answered
// without the elliptic integrals.
fn spikeAmp(p: vec2f, m: vec4f) -> f32 {
  if (m.w <= 0.001) { return 0.0; }
  let a = magnetRadius();
  let g = max(m.z - MAGNET_FACE, MAGNET_MIN_GAP);
  let rho = length(p - m.xy);
  if (rho > 2.0 * (a + g) && 1.25 * m.w * magnetDiscFar(rho, g + 0.5 * MAGNET_THICKNESS * a, a) < SPIKE_ONSET * SPIKE_B_REF) { return 0.0; }
  return smoothstep(SPIKE_ONSET, SPIKE_FULL, magnetShare(p, m));
}
// The standing layer's name for the same share (standing.ts, PLAN 9t).
fn spikeField(p: vec2f, m: vec4f) -> f32 {
  return magnetShare(p, m);
}
`;
