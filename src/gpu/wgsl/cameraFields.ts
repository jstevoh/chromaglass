/**
 * What the camera is told, declared once (docs/webgpu-plan.md, P3).
 *
 * These are the GLSL's `u_` uniforms in `lib/cameraPass.ts`, name for name
 * with the prefix dropped: `u_aperture` is `U.aperture`. As with the
 * composite's table, `gpu/uniforms.ts` works out the offsets and generates
 * both the struct and the writer, so the shader and the code that fills its
 * buffer cannot drift apart.
 *
 * The two textures — the plate as drawn, and the aux attachment carrying the
 * normal, the dye's height and the bubble mask — are bindings, not fields.
 */

import { layOut, wgslStruct, type Field } from '../uniforms';

export const CAMERA_FIELDS: Field[] = [
  { name: 'resolution', type: 'vec2f' },
  { name: 'amount', type: 'f32', note: 'the camera as a whole, 0..1 (0 = pass-through)' },
  { name: 'aperture', type: 'f32', note: 'how fast things go soft away from the focal plane' },
  { name: 'bloom', type: 'f32', note: 'glow around the highlights' },
  { name: 'chromatic', type: 'f32', note: 'colour fringing at refracting edges and the frame’s corners' },
  { name: 'dither', type: 'f32', note: '1 onto the canvas, 0 into the post chain' },
  { name: 'filmic', type: 'f32', note: 'the sensor’s roll-off (ACES) against a straight clamp' },
  { name: 'focus', type: 'f32', note: 'the focal plane, as a height: 0 the glass, 1 the thickest domes' },
  { name: 'grain', type: 'f32' },
  { name: 'refraction', type: 'f32', note: 'how much the dye and the bubbles bend what is under them' },
  { name: 'time', type: 'f32' },
  { name: 'vignette', type: 'f32' },
];

export const CAMERA_LAYOUT = layOut(CAMERA_FIELDS);

/** The struct the shader includes. */
export const CAMERA_STRUCT = wgslStruct('Camera', CAMERA_LAYOUT);
