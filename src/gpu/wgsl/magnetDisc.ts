/**
 * The magnet under the glass as what it is: a cylinder of magnetised metal.
 *
 * Until PLAN.md 9v the solver's magnet was a point dipole a height h under
 * the plate (fluid.ts, magnetEnergy, and spikes.ts with it), and Magnet Size
 * (lib/magnetSize.ts) made a bigger magnet by sinking that dipole k times
 * deeper with k³ the strength: a magnet scaled in every direction, gap and
 * all. Two things about that were not a real magnet in a hand.
 *
 * A real magnet's field at the glass is set by its size and by the gap
 * between its face and the liquid, and the gap does not grow because the
 * magnet is bigger: the glass and the dish's floor stay as thick. A bigger
 * magnet held at the same gap is stronger at the glass, not equal, and
 * reaches further: the field on its axis is
 * Br/2 · ((g + t)/√((g + t)² + a²) − g/√(g² + a²)), which grows as a grows
 * with the gap g held. The deepened dipole kept the axis field the same at
 * every Size, and its pull at the edge of its reach weak (0.31 of the real
 * magnet's at Size 0.9, npm run disc).
 *
 * And the saturation was in the dipole's own units. A ferrofluid's
 * magnetisation saturates at a field, a number in tesla (Langevin): in a
 * weak field its energy goes as B², in a strong one as B. MAGNET_BSAT was a
 * number in the dipole's geometric units, so the k-deeper dipole sat lower
 * on the curve than the magnet it stood for and pulled less at its edge
 * (at Size 0.9, 0.47 of a scaled magnet's pull one height out). Here the
 * field is the magnet's in units of its remanence, scaled by the strength,
 * and the saturation is a field on that scale (MAGNET_BS, spikes.ts): two
 * magnets that make the same field at a point give the same energy there,
 * whatever their size.
 *
 * ## The field
 *
 * A uniformly magnetised cylinder is a sheet of current round its side, and
 * its field everywhere outside it is closed-form in Bulirsch's generalised
 * complete elliptic integral (Derby and Olbert, "Cylindrical magnets and
 * ideal solenoids", Am. J. Phys. 78, 229, 2010):
 *
 *   B_ρ = Br/π [α₊ C(k₊, 1, 1, −1) − α₋ C(k₋, 1, 1, −1)]
 *   B_z = Br/π · a/(a + ρ) [β₊ C(k₊, γ², 1, γ) − β₋ C(k₋, γ², 1, γ)]
 *
 * with z± the height over each face, α± = a/√(z±² + (ρ + a)²),
 * β± = z±/√(z±² + (ρ + a)²), γ = (a − ρ)/(a + ρ) and
 * k±² = (z±² + (a − ρ)²)/(z±² + (a + ρ)²). C converges quadratically (an
 * arithmetic-geometric mean); four rounds are exact to float32's last bit
 * for every gap this plate has. Checked against Biot–Savart summed over
 * the side current, and the shader's own float32 against both, by
 * `npm run disc`.
 *
 * Far from it the magnet is a dipole of moment Br·V/μ0 at its centre to
 * within (size/R)², with size² = a² + (t/2)²; past eight sizes the shader
 * takes the dipole (it blends across six to eight, so the pull has no step at
 * the seam), which is all of the plate a small magnet does not reach and
 * costs a few multiplies.
 *
 * ## Its size and where it is held
 *
 * The magnet is a rod twice as long as it is wide, standing on end
 * under the glass (the dish is 20 cm across, lib/turntable.ts DISH_METRES):
 * at the tool's own size 0.05 of the plate in radius, a 20 mm by 40 mm rod.
 * Flatter shapes were tried first (a 32 by 16 mm disc, 24 by 24, then a
 * 20 by 30 mm rod): held so their spikes' patch matched today's, their
 * fields fell away faster past the patch, and the lab's fingers lost
 * their reach (on the 0.12 circle 8 fell to 5 for the discs; on the 0.09
 * circle 7 fell to 6 for the 20 by 30 rod, under the check's 7, by
 * npm run fingers). A longer rod's far field is a bigger share of its near one:
 * this one's fingers are 10, 8, 9 and 5 on the four circles, main's 12, 7,
 * 8 and 3, so it keeps the default look. Magnet Size sets its radius, k = 0.5 to 2
 * times that (10 mm to 40 mm across), and its length with it; nothing else.
 *
 * Where it is held is the app's Magnet Height, as it always was: m.z, the
 * depth at which the old dipole stood, which Ferrofluid Scale already
 * stretches (a bigger look is a magnet held further off). The rod's face is
 * MAGNET_FACE above that depth: at the tool's own size held to the glass
 * (Magnet Height 0.15 at Scale 0.35, m.z 0.1275) its face is 0.0675 under the
 * liquid, 13.5 mm, and its spikes' patch (the onset, spikes.ts) reaches 0.157
 * of the plate out, as the dipole's 0.156 did: the default keeps today's
 * look. A bigger rod keeps the face where it is.
 *
 * Each shader that includes this defines `fn magnetRadius() -> f32`, the
 * magnet's radius in plate widths now (Sim.magRadius in the solver,
 * Film.size in the standing layer, standing.ts): one for every magnet under the glass, since
 * the phone's fingers each hold the same magnet.
 */

/** The magnet's radius at the tool's own size (Magnet Size 0.5), in plate widths. */
export const MAGNET_RADIUS = 0.05;
/** How far above the old dipole's depth (m.z) the magnet's face is held. */
export const MAGNET_FACE = 0.06;
/** The closest its face comes to the liquid: the glass and the dish's floor. */
export const MAGNET_MIN_GAP = 0.01;
/** Length over radius: a rod twice as long as it is wide. */
export const MAGNET_THICKNESS = 4;

/** The gap from the liquid to the magnet's face, for a magnet held at depth h (m.z). */
export function discGap(h: number): number {
  return Math.max(h - MAGNET_FACE, MAGNET_MIN_GAP);
}

/** |B| on the magnet's axis, a gap g over its face, in units of its remanence. */
export function discOnAxis(g: number, a: number): number {
  const t = MAGNET_THICKNESS * a;
  return 0.5 * ((g + t) / Math.hypot(g + t, a) - g / Math.hypot(g, a));
}

export const MAGNET_DISC_WGSL = /* wgsl */ `
const MAGNET_FACE = ${MAGNET_FACE};
const MAGNET_MIN_GAP = ${MAGNET_MIN_GAP};
const MAGNET_THICKNESS = ${MAGNET_THICKNESS};
// Bulirsch's cel(kc, p, c, s): ∫₀^{π/2} (c cos² + s sin²) / ((cos² + p sin²) √(cos² + kc² sin²)).
fn magnetCel(kc: f32, p: f32, c: f32, s: f32) -> f32 {
  var k = abs(kc);
  var pp = p;
  var cc = c;
  var ss = s;
  var em = 1.0;
  if (p > 0.0) {
    pp = sqrt(p);
    ss = s / pp;
  } else {
    var f = kc * kc;
    var q = 1.0 - f;
    let g = 1.0 - pp;
    f = f - pp;
    q = q * (ss - c * pp);
    pp = sqrt(f / g);
    cc = (c - ss) / g;
    ss = -q / (g * g * pp) + cc * pp;
  }
  var f = cc;
  cc = cc + ss / pp;
  var g = k / pp;
  ss = 2.0 * (ss + f * g);
  pp = g + pp;
  em = k + em;
  var kk = k;
  for (var i = 0; i < 4; i++) {
    k = 2.0 * sqrt(kk);
    kk = k * em;
    f = cc;
    cc = cc + ss / pp;
    g = kk / pp;
    ss = 2.0 * (ss + f * g);
    pp = g + pp;
    em = k + em;
  }
  return 1.5707963 * (ss + cc * em) / (em * (em + pp));
}
// |B| of a cylinder of radius a (length MAGNET_THICKNESS a) centred z under
// a point ρ off its axis, in units of its remanence: Derby and Olbert's
// closed form (see magnetDisc.ts).
fn magnetDiscExact(rho: f32, z: f32, a: f32) -> f32 {
  let b = 0.5 * MAGNET_THICKNESS * a;
  let zp = z + b;
  let zm = z - b;
  let s = rho + a;
  let np = sqrt(zp * zp + s * s);
  let nm = sqrt(zm * zm + s * s);
  let d = a - rho;
  let gam = d / s;
  let kp = sqrt((zp * zp + d * d) / (np * np));
  let km = sqrt((zm * zm + d * d) / (nm * nm));
  let br = (a / np * magnetCel(kp, 1.0, 1.0, -1.0) - a / nm * magnetCel(km, 1.0, 1.0, -1.0)) * 0.31830989;
  let bz = a / s * (zp / np * magnetCel(kp, gam * gam, 1.0, gam) - zm / nm * magnetCel(km, gam * gam, 1.0, gam)) * 0.31830989;
  return sqrt(br * br + bz * bz);
}
// The same magnet seen from far off: a dipole of its volume at its centre.
fn magnetDiscFar(rho: f32, z: f32, a: f32) -> f32 {
  let q = rho * rho + z * z;
  // Br V / (4π) with V = π a² · MAGNET_THICKNESS a.
  return 0.25 * MAGNET_THICKNESS * a * a * a * sqrt(rho * rho + 4.0 * z * z) / (q * q);
}
// |B| at p of the magnet m = (x, y, depth, strength), of radius a,
// in units of its remanence (the strength is not in it).
fn magnetDiscField(p: vec2f, m: vec4f, a: f32) -> f32 {
  let z = max(m.z - MAGNET_FACE, MAGNET_MIN_GAP) + 0.5 * MAGNET_THICKNESS * a;
  let rho = length(p - m.xy);
  let half = 0.5 * MAGNET_THICKNESS * a;
  let size2 = a * a + half * half;
  let far = smoothstep(36.0 * size2, 64.0 * size2, rho * rho + z * z);
  let dip = magnetDiscFar(rho, z, a);
  if (far >= 1.0) { return dip; }
  return mix(magnetDiscExact(rho, z, a), dip, far);
}
`;
