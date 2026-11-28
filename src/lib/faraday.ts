/**
 * Faraday waves (PLAN 48f): the numbers of a liquid layer shaken up and down,
 * the ones the GPU's step (src/gpu/faraday.ts) and its check
 * (`npm run faraday`) both read. No GPU, no DOM: plain arithmetic, so the
 * check can ask it what the pattern should be and then measure what the GPU
 * made.
 *
 * What happens in a real dish. A layer of liquid on a speaker, shaken up and
 * down with acceleration a cos Ωt, feels a gravity that swings between
 * g − a and g + a. A surface wave of wavenumber k rings at its own
 * frequency ω(k), and the swing in gravity pumps it parametrically, like a
 * child pumping a swing by standing and crouching: a wave that rings at half
 * the drive's frequency, ω(k) = Ω/2, takes energy from the shaking every
 * half cycle. Once the drive is past a threshold set by how fast the liquid's
 * viscosity drains that energy, those waves grow out of the dish's own tiny
 * disturbances into a standing pattern (Faraday, 1831): stripes, squares,
 * hexagons. Below the threshold nothing grows, whatever the drive. Bass makes
 * big cells, a high note fine ones, because ω(k) rises with k.
 *
 * The three laws, each the textbook one (Lamb, *Hydrodynamics*, §228, §348;
 * Benjamin and Ursell 1954; Kumar and Tuckerman 1994 for where the simple
 * forms hold):
 *
 *   - **The dispersion relation of a layer of depth h**, gravity and surface
 *     tension both restoring: ω² = (g k + σ k³ / ρ) tanh(k h).
 *   - **The damping**, the amplitude's decay rate: the bulk's viscous
 *     dissipation under the free surface, 2 ν k² (Lamb §348), plus the
 *     boundary layer on the dish's floor, where a shallow wave's sloshing is
 *     brought to rest: k √(ν ω / 2) / sinh(2 k h) (Hunt 1952). On a 3 mm
 *     layer of water the floor's is most of it below 60 Hz.
 *   - **The Mathieu equation** a single wave obeys when the gravity swings,
 *     η'' + 2γ η' + ω² (1 − ε cos Ωt) η = 0, with ε = a k tanh(kh) / ω²,
 *     the swing's share of the restoring force. Near the first tongue
 *     (ω ≈ Ω/2) its Floquet growth rate is
 *       s = √((ε ω / 4)² − (ω − Ω/2)²) − γ,
 *     and out of the tongue the wave only rings down at γ. At resonance s = 0
 *     gives the threshold a_c = 4 γ ω / (k tanh kh).
 *
 * Measured on these numbers, water 3 mm deep (2026-11-21): the pattern's
 * wavelength is 36 mm at a 10 Hz drive, 11.5 mm at 40, 4.4 mm at 150, and
 * the threshold 0.08 g to 0.55 g across that range, which is the size of
 * what a speaker under a dish of water gives (a few tenths of a g at a
 * millimetre of travel at 40 Hz).
 */

/** Gravity, m/s². */
export const FARADAY_G = 9.81;
/** The layer: water. Surface tension N/m, density kg/m³, kinematic viscosity m²/s. */
export const FARADAY_SIGMA = 0.072;
export const FARADAY_RHO = 1000;
export const FARADAY_NU = 1e-6;
/**
 * The layer's depth, metres: 3 mm, a clock glass of water on the projector
 * (the open dish §42d writes of). Deep enough that a 40 Hz pattern is not a
 * shallow-water one (k h = 1.6) and shallow enough that the floor's boundary
 * layer is most of the damping below 60 Hz, as in the references' dishes.
 */
export const FARADAY_DEPTH = 3e-3;
/** The water's refractive index, for the light through it (wgsl/plateFaraday.ts). */
export const FARADAY_INDEX = 1.333;
/** The drive's range, Hz: below 10 a pattern is a few cells across the dish; above 150 its wavelength nears the grid's (src/gpu/faraday.ts). */
export const FARADAY_HZ_MIN = 10;
export const FARADAY_HZ_MAX = 150;
/** The Shake dial's top, in g: four to twenty times the threshold, past which a real dish throws droplets. */
export const FARADAY_SHAKE_MAX = 2;
/** Rock's top, Hz: the strobe slipped further than this from the wave is a flicker, not a rock (PLAN 48f-6). */
export const FARADAY_ROCK_MAX = 2;
/**
 * Strength's top: the projector's throw past the dye at eight times real
 * water's (wgsl/plateFaraday.ts). Past real on purpose (the owner,
 * 2026-11-21): a pattern a bass pulse raises for a moment reads faint at 1.
 */
export const FARADAY_GAIN_MAX = 8;

/** A surface wave's angular frequency, rad/s, at wavenumber k (1/m) on a layer h deep. */
export function faradayOmega(k: number, h = FARADAY_DEPTH): number {
  return Math.sqrt((FARADAY_G * k + (FARADAY_SIGMA / FARADAY_RHO) * k * k * k) * Math.tanh(k * h));
}

/** The amplitude's damping rate, 1/s: the bulk under the surface and the floor's boundary layer. */
export function faradayDamping(k: number, h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  const w = faradayOmega(k, h);
  return 2 * nu * k * k + (k * Math.sqrt((nu * w) / 2)) / Math.sinh(Math.min(80, 2 * k * h));
}

/** The wavenumber, 1/m, whose wave rings at half the drive: ω(k) = Ω/2 for a drive of `hz`. The pattern's, by the dispersion relation. */
export function faradayK(hz: number, h = FARADAY_DEPTH): number {
  const half = Math.PI * hz;
  let lo = 1e-3, hi = 1e6;
  for (let i = 0; i < 200; i++) {
    const m = Math.sqrt(lo * hi);
    if (faradayOmega(m, h) < half) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}

/** The drive's threshold acceleration, m/s², at `hz`: where the resonant wave's growth just matches its damping. */
export function faradayThreshold(hz: number, h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  const k = faradayK(hz, h);
  return (4 * faradayDamping(k, h, nu) * faradayOmega(k, h)) / (k * Math.tanh(k * h));
}

/**
 * The growth rate, 1/s, of the standing wave at wavenumber k under a drive of
 * `accel` m/s² at `hz`: the Mathieu equation's first tongue, the rate a
 * wave that rings at ω(k) grows (positive) or rings down (negative) at.
 */
export function faradayGrowth(k: number, accel: number, hz: number, h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  const w = faradayOmega(k, h);
  const eps = (Math.max(0, accel) * k * Math.tanh(k * h)) / (w * w);
  const pump = (eps * w) / 4;
  const detune = w - Math.PI * hz;
  const r = pump * pump - detune * detune;
  return (r > 0 ? Math.sqrt(r) : 0) - faradayDamping(k, h, nu);
}

/**
 * How the capillary share of the restoring force at k, σk²/ρ over
 * g + σk²/ρ: 0 a pure gravity wave, 1 a pure ripple. The step's cubic
 * (src/gpu/faraday.ts) is the curvature's own for ripples and the swing's
 * for gravity waves, weighted by this (wgsl/faraday.ts says why).
 */
export function faradayCapillaryShare(k: number): number {
  const c = (FARADAY_SIGMA / FARADAY_RHO) * k * k;
  return c / (FARADAY_G + c);
}

/**
 * Vega, Knobloch & Martel (2001) Poiseuille floor friction 1/s for a fluid
 * layer of depth `h` with a no-slip floor and stress-free free surface:
 * r = 3 ν / h².
 */
export function faradayFloorFriction(h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  return (3 * nu) / (h * h);
}

/**
 * Vega, Knobloch & Martel (2001) Eulerian mean-flow coupling Γ (m²/s²) in the
 * streaming force F = −Γ ∇²u ∇u: bottom Stokes boundary-layer slip plus
 * free-surface tangential boundary-layer stress over the subharmonic period.
 */
export function faradayStreamingGamma(kc: number, h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  const w = faradayOmega(kc, h);
  const r = faradayFloorFriction(h, nu);
  const kh = kc * h;
  // Time-average over the subharmonic period contributes 1/2: ζ = u cos(ωt) + v sin(ωt).
  const bot = (r * w) / (4 * kc * kc * Math.sinh(Math.min(40, kh)) ** 2);
  const surf = (r * h * w) / (4 * kc * Math.tanh(kh));
  return bot + surf;
}

/**
 * Zhang & Viñals (1997) finite-depth diagonal cubic saturation scale g3
 * (1/(s·m²)) from wave breaking steepness limit, finite-depth hyperbolic
 * factor tanh(k_c h), and viscous damping, replacing the heuristic S0.
 */
export function faradayCubicScale(kc: number, h = FARADAY_DEPTH, nu = FARADAY_NU): number {
  const w = faradayOmega(kc, h);
  const damp = faradayDamping(kc, h, nu);
  const beta = faradayCapillaryShare(kc);
  const t1 = Math.tanh(kc * h);
  const finite = (1 - beta) / (8 * t1 * t1);
  return w * kc * kc * (0.5 + (2 * damp) / w + finite);
}

/**
 * Nonlinear frequency shift coefficient α_NL (1/(s·m²)) from Tadjbakhsh &
 * Keller (1960) for finite-depth gravity waves and Concus (1962) / Crapper
 * for capillary ripples, blended by capillary share `faradayCapillaryShare`.
 */
export function faradayDetuneNL(kc: number, h = FARADAY_DEPTH): number {
  const w = faradayOmega(kc, h);
  const beta = faradayCapillaryShare(kc);
  const t1 = Math.tanh(kc * h);
  const t2 = t1 * t1;
  const grav = (9 - 12 * t2 - 3 * t2 * t2 - 2 * t2 * t2 * t1) / (64 * t2 * t2);
  const cap = -3 / 32;
  return w * kc * kc * ((1 - beta) * grav + beta * cap);
}

/**
 * Harmonic meniscus ripples launched inward from the circular rim at the
 * drive frequency Ω = 2π `hz` (m): wavenumber `k`, spatial decay rate `decay`
 * (1/m, γ_Ω / c_g), and contact-line stroke amplitude `amp` (m).
 */
export function faradayMeniscus(accel: number, hz: number, h = FARADAY_DEPTH, nu = FARADAY_NU): { k: number; decay: number; amp: number } {
  const k = faradayK(2 * hz, h);
  const w = faradayOmega(k, h);
  const damp = faradayDamping(k, h, nu);
  const sigma = FARADAY_SIGMA / FARADAY_RHO;
  const kh = k * h;
  const th = Math.tanh(kh);
  const sech2 = 1 - th * th;
  const gk3 = FARADAY_G * k + sigma * k * k * k;
  const dGk3 = FARADAY_G + 3 * sigma * k * k;
  const dWk = (dGk3 * th + gk3 * h * sech2) / (2 * w);
  // Meniscus rim ripples decay by both fluid damping (γ/c_g) and geometric contact-line loss (~2 wavelengths).
  const decay = Math.max(damp / Math.max(dWk, 1e-4), k / (4 * Math.PI));
  const lc2 = (FARADAY_SIGMA / FARADAY_RHO) / FARADAY_G;
  const k2lc2 = k * k * lc2;
  const stroke = (Math.max(0, accel) / (w * w)) * (k2lc2 / (1 + k2lc2));
  const amp = 0.08 * stroke;
  return { k, decay, amp };
}
