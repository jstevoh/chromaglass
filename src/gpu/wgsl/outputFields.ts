/**
 * What the projector's pass is told, declared once (docs/webgpu-plan.md, P3).
 *
 * The GLSL draws one quad per call and sets four of its uniforms again each
 * time. WGSL has no such thing as a uniform set between draws in a pass, and
 * a dynamic offset for sixteen surfaces is a bind-group layout by hand for no
 * gain — so every quad is in the buffer at once, one entry per array below,
 * and the shader reads its own by `instance_index`. One draw of six vertices
 * and as many instances as there are surfaces, in the order they were given,
 * which is the order the blending needs them in.
 *
 * `warp` is a mat3 in the GLSL. A mat3 in a uniform buffer is three vec4s
 * with a float of padding in each, so that is what it is here — the columns,
 * named — rather than a matrix type the layout helper would have to learn.
 */

import { layOut, wgslStruct, type Field } from '../uniforms';
import { MAX_SURFACES } from '../../lib/outputConfig';

export const OUTPUT_FIELDS: Field[] = [
  // Per quad.
  { name: 'warpA', type: 'vec4f', count: MAX_SURFACES, note: 'the corner-pin matrix, column 0' },
  { name: 'warpB', type: 'vec4f', count: MAX_SURFACES, note: 'column 1' },
  { name: 'warpC', type: 'vec4f', count: MAX_SURFACES, note: 'column 2' },
  { name: 'cornerAB', type: 'vec4f', count: MAX_SURFACES, note: 'the quad on the wall: x0 y0 x1 y1, screen space' },
  { name: 'cornerCD', type: 'vec4f', count: MAX_SURFACES, note: 'x2 y2 x3 y3' },
  { name: 'src', type: 'vec4f', count: MAX_SURFACES, note: 'which piece of the plate fills it: x, y, w, h' },
  { name: 'form', type: 'vec4f', count: MAX_SURFACES, note: 'shape index, shape feather, opacity, source (0 wall, 1 front, 2 back, 3 film)' },
  { name: 'lay', type: 'vec4f', count: MAX_SURFACES, note: 'x: how it meets the wall (0 over, 1 add, the beam); y: its width over its height on the wall, for the test pattern; z: its number (1 up); w spare' },
  // Per frame.
  { name: 'mask', type: 'vec4f', note: 'blanking inset from top, right, bottom, left' },
  { name: 'flip', type: 'vec2f', note: '1 or -1 per axis' },
  { name: 'resolution', type: 'vec2f' },
  { name: 'feather', type: 'f32', note: 'how soft the blanking edge is' },
  { name: 'gain', type: 'f32' },
  { name: 'gamma', type: 'f32' },
  { name: 'quads', type: 'f32', note: 'how many quads are in the arrays above, for a beam to find the others it crosses' },
  { name: 'test', type: 'vec4f', note: 'x: the test pattern in place of the picture (0 or 1); y: how bright Identify\'s numbers are now (0 off); zw spare (PLAN.md 8e)' },
];

export const OUTPUT_LAYOUT = layOut(OUTPUT_FIELDS);

/** The struct the shader includes. */
export const OUTPUT_STRUCT = wgslStruct('Output', OUTPUT_LAYOUT);
