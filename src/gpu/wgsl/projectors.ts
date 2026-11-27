/**
 * The projector bank on the wall (PLAN 51a): each projector's lamp and
 * shutter, and the light of two adding, for the plate shader.
 *
 * The laws are on the CPU (lib/projectorBank.ts: the lamp's flux as v^3.4
 * and colour as v^0.42, the vane's circular segment, the crossfade linear in
 * light); the shader is handed each projector's gain as a display multiplier
 * in `U.projA` and `U.projB` (rgb; `projA.w` 1 when the two plates are two
 * projectors on a lamp ground), and does two things with them:
 *
 * - `projectorLamps()`, where the lamp ground is set: the back projector's
 *   lamp is the lamp times B's gain, and with two projectors the front's
 *   (`lampBg`, what the front plate and everything drawn on it filters) is
 *   the lamp times A's. This is where the old fixed halving of both lamps
 *   was: the crossfade at its centre is that halving, now in linear light.
 * - `wallAdd(a, b)`: two projectors' pictures added on the wall in linear
 *   light, a and b in the plate's display values. They were added in display
 *   values (`outColor + lampScreen * filt1`), which is right only where one
 *   of them is black or both are white: a dark red under one beam and a clear
 *   patch under the other read 0.5 where the light is 0.73 (0.5 of each
 *   lamp, added, is the lamp's half, 0.5^(1/2.2) in display values). No
 *   shipped look had Two Projectors on (2026-11-27), so no saved look moves.
 *
 * With one projector its gain is laid on the finished plates before the film
 * projector's row (the film is its own projector), as `outColor * U.projA.rgb`
 * in the display pass; at the default it is 1, 1, 1 and multiplies nothing.
 */
export const PROJECTOR_WGSL = /* wgsl */ `
fn projectorLamps() -> vec3f {
  let back = lampBg * U.projB.rgb;
  if (U.projA.w > 0.5) { lampBg *= U.projA.rgb; }
  return back;
}

fn wallAdd(a: vec3f, b: vec3f) -> vec3f {
  return pow(pow(max(a, vec3f(0.0)), vec3f(2.2)) + pow(max(b, vec3f(0.0)), vec3f(2.2)), vec3f(1.0 / 2.2));
}
`;
