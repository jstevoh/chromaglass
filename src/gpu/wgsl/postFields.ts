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
  /*
    Film (F1, docs/filters-plan.md E6).

    `stock*` and not `film*`: the existing `film` settings belong to the film
    *projector*, the one that plays a video through the dye. This is the
    stock the whole show is photographed on, and two things called film would
    be confused for ever.
  */
  { name: 'stock', type: 'f32', note: '0 = off … 1; how much of the stock is in the picture' },
  { name: 'stockType', type: 'i32', note: '0 16mm reversal, 1 slide, 2 faded negative, 3 Super 8, 4 monochrome' },
  { name: 'stockGrain', type: 'f32' },
  { name: 'stockGrainSize', type: 'f32', note: 'grain cell in screen pixels: Super 8 coarse, 35mm fine' },
  { name: 'stockWeave', type: 'f32', note: 'how far the gate wanders, in pixels' },
  { name: 'stockGate', type: 'f32', note: 'the soft rounded edge of the projector gate' },
  { name: 'stockFrame', type: 'u32', note: 'the film frame, not the display frame: grain re-rolls on this' },
];

export const POST_LAYOUT = layOut(POST_FIELDS);

/** The struct the shader includes. */
export const POST_STRUCT = wgslStruct('Post', POST_LAYOUT);
