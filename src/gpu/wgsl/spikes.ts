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
 * How strong the field has to be: a dipole's |B| at the glass, which on its
 * axis goes as strength over height cubed, taken as a share of a magnet in
 * the hand pressed to the glass (the Magnet tool: strength 0.9, the solver's
 * height 0.12 to 0.14 by Ferrofluid Scale), and falling off the axis as the
 * dipole's does. The peaks start at 0.18 of that and are full by half
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
export const SPIKE_PITCH = 0.04;
export const SPIKE_H_REF = 0.13;
export const SPIKE_ONSET = 0.18;
export const SPIKE_FULL = 0.35;

/**
 * How far into spikes a magnet is on its own axis, where its field is
 * strongest (spikeAmp there): what the solver ramps its own changes on, so
 * they arrive with the spikes the plate draws and not in one step.
 */
export function spikesOnAxis(strength: number, height: number): number {
  const rel = Math.max(height, 0.02) / SPIKE_H_REF;
  const t = Math.max(0, Math.min(1, (strength / (rel * rel * rel) - SPIKE_ONSET) / (SPIKE_FULL - SPIKE_ONSET)));
  return t * t * (3 - 2 * t);
}

export const SPIKES_WGSL = /* wgsl */ `
const SPIKE_PITCH = ${SPIKE_PITCH};
const SPIKE_H_REF = ${SPIKE_H_REF};
const SPIKE_ONSET = ${SPIKE_ONSET};
const SPIKE_FULL = ${SPIKE_FULL};
// How far into spikes the field of magnet m = (x, y, height, strength) is at
// p: 0 flat, 1 full.
fn spikeAmp(p: vec2f, m: vec4f) -> f32 {
  if (m.w <= 0.001) { return 0.0; }
  let h = max(m.z, 0.02);
  let to = p - m.xy;
  let r2 = dot(to, to);
  let q = r2 + h * h;
  // |B| off the axis over |B| on it: sqrt((r² + 4h²)/(r² + h²)⁴) / (2/h³).
  let off = sqrt((r2 + 4.0 * h * h) / (q * q * q * q)) * h * h * h * 0.5;
  let rel = h / SPIKE_H_REF;
  return smoothstep(SPIKE_ONSET, SPIKE_FULL, m.w * off / (rel * rel * rel));
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
