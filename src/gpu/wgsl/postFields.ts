/**
 * What the post chain is told, declared once (docs/webgpu-plan.md, P3;
 * docs/filters-plan.md, F0).
 *
 * Three of these are the finish's, and they are named as the plate's own
 * table names them — `dimmer`, `markOn`, `markRect` — because the finish is
 * shared code: `FINISH_WGSL` is the same text in the plate's shader and in
 * this one, as `FINISH_GLSL` is in the GLSL's. It reads them off `U`, so both
 * structs have to call them the same thing.
 *
 * The rest belong to the effects: which one is running, how far back in the
 * history ring it is looking, and the frame and seed its randomness comes
 * from — never `Math.random` or the clock, so that a song rendered twice is
 * the same film twice (PLAN.md §6).
 */

import { layOut, wgslStruct, type Field } from '../uniforms';

export const POST_FIELDS: Field[] = [
  { name: 'markRect', type: 'vec4f', note: 'where the mark sits: centre xy, half-size xy, screen uv' },
  { name: 'resolution', type: 'vec2f' },
  { name: 'dimmer', type: 'f32', note: 'the house dimmer, with the flash guard folded in' },
  { name: 'markOn', type: 'f32', note: 'the mark’s own fader, not a switch' },
  { name: 'mode', type: 'i32', note: 'the test effect: 0 none, 1 seeded noise, 2 a frame from the ring' },
  { name: 'layer', type: 'f32', note: 'which layer of the history ring mode 2 reads' },
  { name: 'frame', type: 'u32', note: 'the effect chain’s own frame counter' },
  { name: 'seed', type: 'u32' },
];

export const POST_LAYOUT = layOut(POST_FIELDS);

/** The struct the shader includes. */
export const POST_STRUCT = wgslStruct('Post', POST_LAYOUT);
