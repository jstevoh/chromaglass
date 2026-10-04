/**
 * The ferrofluid's spikes: where a magnet stands them up, and where each one is.
 *
 * Shared by the solver (fluid.ts, phaseMu: the liquid gathers into them) and
 * the plate (plate.ts, spikeAt: each is drawn as a peak with a light on it),
 * because the two have to agree on where every spike is or the plate draws a
 * point of light on a dome the solver put somewhere else.
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
 * Where they are: on rings a pitch apart round each magnet with six more on
 * each ring out (a hexagonal packing wrapped round a point, which is how
 * peaks settle round a small magnet rather than on a flat lattice), each
 * ring turned a little against the last so they do not line up in spokes.
 *
 * How strong the field has to be: the magnet's |B| at the glass (a cylinder,
 * magnetDisc.ts; until PLAN 9v a dipole, whose field on its axis went as
 * strength over height cubed), taken as a share of a magnet in the hand
 * pressed to the glass at the tool's own size (the Magnet tool: strength
 * 0.9, the solver's height 0.12 to 0.14 by Ferrofluid Scale), and falling
 * off the axis as the magnet's does. The peaks start at 0.18 of that and are full by half
 * (SPIKE_ONSET, SPIKE_FULL; fluid.ts gates the solver's side on the same
 * onset). At 0.25 the hand's spikes reached only 0.1 of the plate out and
 * the pool barely parted (2 pieces, by `npm run spikes`); at 0.1 Magnet Garden's
 * own magnet, at 0.14, raised a few. Every look's own magnet, held further off, stays under it:
 * Magnet Garden's is at 0.14 of the hand's field (0.9 at 0.24), Ferro
 * Paint's 0.08, Ferro Maze's 0.01, so each still gathers its pool flat, as a
 * real one would, and bringing the magnet up by hand is what stands it up.
 * The hand's own is 0.8 to 1.1 at Ferrofluid Scale 0.3 to 0.4; a big Scale
 * holds it further off (the solver's height goes as 0.5 + Scale), and past
 * about 0.9 the hand's magnet raises none, as a magnet held a hand's width
 * under a deep pool would not.
 */
import { MAGNET_DISC_WGSL, MAGNET_RADIUS, discGap, discOnAxis } from './magnetDisc';

export const SPIKE_PITCH = 0.04;
export const SPIKE_H_REF = 0.13;
export const SPIKE_ONSET = 0.18;
export const SPIKE_FULL = 0.35;

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
// The spike of magnet m nearest p: (its tip, the distance to it).
fn spikeTip(p: vec2f, m: vec4f) -> vec3f {
  let to = p - m.xy;
  let rho = length(to) / SPIKE_PITCH;
  let th = atan2(to.y, to.x);
  var best = vec3f(m.xy, 1e9);
  let k0 = i32(round(rho));
  for (var ring = max(k0 - 1, 0); ring <= k0 + 1; ring++) {
    var c = m.xy;
    if (ring > 0) {
      let nr = f32(6 * ring);
      let turn = f32(ring) * 0.37;
      let j = round((th - turn) * nr / 6.2831853);
      let a = turn + j * 6.2831853 / nr;
      c = m.xy + vec2f(cos(a), sin(a)) * f32(ring) * SPIKE_PITCH;
    }
    let dd = distance(p, c);
    if (dd < best.z) { best = vec3f(c, dd); }
  }
  return best;
}
`;
