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
  { name: 'form', type: 'vec4f', count: MAX_SURFACES, note: 'shape index, shape feather, opacity, unused' },
  // Per frame.
  { name: 'mask', type: 'vec4f', note: 'blanking inset from top, right, bottom, left' },
  { name: 'flip', type: 'vec2f', note: '1 or -1 per axis' },
  { name: 'resolution', type: 'vec2f' },
  { name: 'feather', type: 'f32', note: 'how soft the blanking edge is' },
  { name: 'gain', type: 'f32' },
  { name: 'gamma', type: 'f32' },
];

export const OUTPUT_LAYOUT = layOut(OUTPUT_FIELDS);

/** The struct the shader includes. */
export const OUTPUT_STRUCT = wgslStruct('Output', OUTPUT_LAYOUT);
