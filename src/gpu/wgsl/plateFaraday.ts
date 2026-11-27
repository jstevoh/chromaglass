/**
 * The light through a shaken dish's standing waves (PLAN 48f): what the
 * plate draws of the Faraday field the solver steps (gpu/faraday.ts).
 *
 * What the projector sees. The lens is focused on the dye, under the water;
 * the surface is the depth D above it and bent into a lattice of waves. A
 * lens focused a distance under a phase object shows it as the light
 * gathered or spread by its curvature (the transport-of-intensity equation;
 * for a ray picture, a crest is a weak magnifier over the dye, spreading the
 * same light over more of the wall, and a trough a weak reducer). A point
 * of the dye is seen moved by −D′ ∇η, D′ = D (1 − 1/n) the depth seen
 * through the water, so the wall's brightness at a point is the Jacobian of
 * the map back, det(I + D′ H), H the surface's Hessian there: small waves
 * give 1 + D′ ∇²η, bright troughs and dim crests.
 *
 * Why the map back and not 1 / det(I − D′ H) at the source, which the first
 * version drew: that one is read at the wrong point, and its mean over a
 * wave is more than one (its second-order term is always positive), so a
 * fine pattern blurred by the camera's pass came out as the whole plate
 * brightening with the shake, light the lamp never gave (the lab, a 90 Hz
 * lattice at 1.4 g, 2026-11-21). det(I + D′ H) is 1 + D′ ∇²η + D′² det H,
 * and both terms average to nought over the pattern (det H is a divergence),
 * so the light is only moved, never made. Where the waves are steep enough
 * to fold it (det below nought) the wall is dark, as past a caustic's seam,
 * and the brightest point is held to four times the lamp. And where the surface tilts the light out of the
 * projection lens's reach, (n − 1) |∇η| past the effective aperture
 * DROP_NA, the wall goes dark, as it does at a drop's edge (wgsl/plate.ts).
 *
 * Which instant. The surface swings, η = u cos(Ωt/2), at 5 to 75 Hz:
 * faster than a frame, and drawn at the frame's own instant it would strobe
 * the pattern's light on and off at that rate, which is the flicker a show
 * must never throw. Every photograph of Faraday waves is taken with the
 * camera or a strobe locked to the wave, which freezes it at one phase; so is
 * this, at the crest (cos = 1): the pattern holds still and grows and fades
 * with the drive, as the step's u does. Rock (PLAN 48f-6) slips the strobe
 * off the wave by up to 2 Hz, the beat a slightly slow strobe makes, so the
 * crests and troughs trade places slowly: the solver draws that as its
 * surface, eta = u cos φ (gpu/faraday.ts), and this reads eta.
 *
 * Strength (U.faraday, 1 at real water): the lens's throw, how far past the
 * dye the projector's focus sits, so the same waves bend the wall's light
 * more. A deeper defocus is a real projector's (a longer throw, the lens
 * racked back); the liquid is not touched, and the light is still only
 * moved, never made, so the plate's mean brightness holds at any strength.
 *
 * In linear light, like the lamp: the plate's colour is display-encoded at
 * this point (the soap film beside it encodes its own the same way), so the
 * gain goes on through the curve's 2.2.
 */
import { FARADAY_DEPTH, FARADAY_INDEX } from '../../lib/faraday';
import { PLATE_METRES } from '../fluid/constants';

const LENS = FARADAY_DEPTH * (1 - 1 / FARADAY_INDEX);

export const FARADAY_PLATE_WGSL = /* wgsl */ `
/* The standing wave's surface as the strobe sees it, metres, n × n over the plate (gpu/faraday.ts); a 4-float stand-in while there is no shaker. The display's seventh storage buffer in its fragment stage, of the eight every device gives without asking (gpu/device.ts asks for no more): an eighth fits, a ninth needs the limit raised. */
@group(0) @binding(25) var<storage, read> faradayH: array<f32>;

const FARADAY_LENS: f32 = ${LENS};
const FARADAY_PLATE: f32 = ${PLATE_METRES};
const FARADAY_TILT: f32 = ${FARADAY_INDEX - 1};

fn faradayAt(i: i32, j: i32, n: i32) -> f32 {
  return faradayH[u32(((j % n) + n) % n) * u32(n) + u32(((i % n) + n) % n)];
}

/* The Hessian (xx, yy, xy) and the gradient at a cell, by central differences, in metres. */
fn faradayDerivs(i: i32, j: i32, n: i32, dx: f32) -> array<f32, 5> {
  let c = faradayAt(i, j, n);
  let e = faradayAt(i + 1, j, n); let w = faradayAt(i - 1, j, n);
  let s = faradayAt(i, j + 1, n); let q = faradayAt(i, j - 1, n);
  let xy = faradayAt(i + 1, j + 1, n) - faradayAt(i + 1, j - 1, n) - faradayAt(i - 1, j + 1, n) + faradayAt(i - 1, j - 1, n);
  return array<f32, 5>((e - 2.0 * c + w) / (dx * dx), (s - 2.0 * c + q) / (dx * dx), xy / (4.0 * dx * dx), (e - w) / (2.0 * dx), (s - q) / (2.0 * dx));
}

/* The lamp's light through the surface at the plate's uv: 1 where the water is still. */
fn faradayLight(fuv: vec2f) -> f32 {
  let n = i32(round(sqrt(f32(arrayLength(&faradayH)))));
  if (n < 4) { return 1.0; }
  let dx = FARADAY_PLATE / f32(n);
  let p = fuv * f32(n) - 0.5;
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let d00 = faradayDerivs(b.x, b.y, n, dx);
  let d10 = faradayDerivs(b.x + 1, b.y, n, dx);
  let d01 = faradayDerivs(b.x, b.y + 1, n, dx);
  let d11 = faradayDerivs(b.x + 1, b.y + 1, n, dx);
  var d = array<f32, 5>();
  for (var k = 0; k < 5; k++) { d[k] = mix(mix(d00[k], d10[k], f.x), mix(d01[k], d11[k], f.x), f.y); }
  let lens = FARADAY_LENS * max(U.faraday, 1.0);
  let axx = lens * d[0];
  let ayy = lens * d[1];
  let axy = lens * d[2];
  let gather = clamp((1.0 + axx) * (1.0 + ayy) - axy * axy, 0.0, 4.0);
  let tilt = FARADAY_TILT * sqrt(d[3] * d[3] + d[4] * d[4]);
  let kept = 1.0 - smoothstep(0.6 * DROP_NA, DROP_NA, tilt);
  return gather * kept;
}

fn faradayOver(c: vec3f, fuv: vec2f) -> vec3f {
  return c * pow(faradayLight(fuv), 1.0 / 2.2);
}
`;
