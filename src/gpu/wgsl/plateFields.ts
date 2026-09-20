/**
 * What the composite is told, declared once (docs/webgpu-plan.md, P3).
 *
 * These are the GLSL's `u_` uniforms, name for name with the prefix dropped:
 * `u_kaleidoZoom` is `U.kaleidoZoom`. The order is by alignment — the vectors
 * first, then the scalars — so the buffer packs tight; `gpu/uniforms.ts`
 * works out the offsets and generates both the struct and the writer, so
 * there is no second list to keep in step.
 *
 * The twelve textures are not here: they are bindings, not buffer fields, and
 * `gpu/wgsl/plate.ts` declares them.
 */

import { layOut, wgslStruct, type Field } from '../uniforms';

/** As the GLSL has it. */
export const MAX_BUBBLES = 40;

export const PLATE_FIELDS: Field[] = [
  { name: 'bubbleShape', type: 'vec4f', count: 40, note: 'stretch axis × magnitude, wobble amplitude, wobble phase' },
  { name: 'bubbles', type: 'vec4f', count: 40, note: 'x, y, r (fluid uv) and opacity' },
  { name: 'lamp', type: 'vec4f' },
  { name: 'lamp2', type: 'vec4f' },
  { name: 'markRect', type: 'vec4f', note: 'where it sits: centre xy, half-size xy, all in screen uv' },
  { name: 'gel0', type: 'vec3f' },
  { name: 'gel1', type: 'vec3f' },
  { name: 'gel2', type: 'vec3f' },
  { name: 'gel3', type: 'vec3f' },
  { name: 'ledColor', type: 'vec3f' },
  { name: 'lumiaA', type: 'vec3f' },
  { name: 'lumiaB', type: 'vec3f' },
  { name: 'paperA', type: 'vec3f' },
  { name: 'paperB', type: 'vec3f' },
  { name: 'camCenter', type: 'vec2f', note: 'fluid-UV the frame is centred on (0.5,0.5 = plate centre)' },
  { name: 'filmScale', type: 'vec2f' },
  { name: 'layerDrift1', type: 'vec2f' },
  { name: 'resolution', type: 'vec2f' },
  { name: 'beads', type: 'f32', note: 'how much of them' },
  { name: 'blendMode', type: 'i32' },
  { name: 'boundaryContrast', type: 'f32', note: 'bright interface line between dye colors' },
  { name: 'bubbleCount', type: 'i32' },
  { name: 'bubbleStrength', type: 'f32' },
  { name: 'camZoom', type: 'f32', note: '1 = whole plate, 12 = extreme magnification' },
  { name: 'cameraOn', type: 'i32', note: 'the camera pass will add its own grain' },
  { name: 'cells', type: 'f32', note: 'fine cell network on the lead plate, plate-wide' },
  { name: 'darkBlend', type: 'i32' },
  { name: 'derivedOn', type: 'f32' },
  { name: 'dimmer', type: 'f32', note: 'master brightness: the house dimmer, 0 is blackout' },
  { name: 'dish', type: 'f32', note: 'round-dish vignette strength' },
  { name: 'dishSpread', type: 'f32' },
  { name: 'droplets', type: 'f32', note: 'satellite micro-droplets on the glass' },
  { name: 'edgeRelief', type: 'f32', note: 'meniscus at every blob edge, at any zoom' },
  { name: 'exposure', type: 'f32', note: 'plate-wide film exposure' },
  { name: 'filmGain', type: 'f32', note: 'maps the density above that level onto full opacity' },
  { name: 'filmKey', type: 'f32' },
  { name: 'filmLevel', type: 'f32', note: 'density below which magnified dye reads as bare ground' },
  { name: 'filmMix', type: 'f32' },
  { name: 'filmOn', type: 'i32' },
  { name: 'finishInMain', type: 'i32' },
  { name: 'flowRate', type: 'f32', note: 'fluid-UV per second, for advecting procedural detail' },
  { name: 'gelAngle', type: 'f32' },
  { name: 'gelWheel', type: 'f32', note: 'rotating four-segment gel over the lamp' },
  { name: 'glossiness', type: 'f32', note: 'specular intensity, 0 = flat backlit dye' },
  { name: 'gooey', type: 'f32' },
  { name: 'grainMix', type: 'f32', note: 'crossfade between the two phases' },
  { name: 'grainOn', type: 'f32', note: '1 when the solver is carrying the coordinates' },
  { name: 'grainScale', type: 'f32', note: 'grain lattice cells across the plate' },
  { name: 'granulation', type: 'f32', note: 'how strongly the pigment separates' },
  { name: 'gridSize', type: 'f32', note: 'fluid sim texture resolution (what we sample)' },
  { name: 'iridescence', type: 'f32', note: 'thin-film colour running round bubble rims' },
  { name: 'kaleido', type: 'f32', note: 'mirror folds (0 = off, else 2..12)' },
  { name: 'kaleidoPhase', type: 'f32', note: 'where the rig has turned to, accumulated on the CPU' },
  { name: 'kaleidoZoom', type: 'f32', note: 'how much plate feeds each wedge' },
  { name: 'lacing', type: 'f32' },
  { name: 'lampWarmth', type: 'f32', note: 'halogen grade' },
  { name: 'layerCount', type: 'i32' },
  { name: 'layerZoom1', type: 'f32', note: 'second layer viewed magnified about the centre' },
  { name: 'ledAngle', type: 'f32' },
  { name: 'ledMode', type: 'i32' },
  { name: 'ledPlatform', type: 'i32' },
  { name: 'lightPlay', type: 'f32' },
  { name: 'logicalGrid', type: 'f32', note: 'the 192-cell grid the look was tuned on' },
  { name: 'lumia', type: 'f32' },
  { name: 'macroOn', type: 'f32', glsl: 'u_macro', note: '0 = off, 1 = macro detail pass enabled' },  // `macro` is reserved in WGSL
  { name: 'macroCellScale', type: 'f32', note: 'cell size' },
  { name: 'macroCells', type: 'f32', note: 'paint-cell / bubble structure amount' },
  { name: 'macroDepth', type: 'f32', note: 'dome shading, contact shadow, depth of field' },
  { name: 'macroEdge', type: 'f32', note: 'fractal silhouette warp' },
  { name: 'macroLacing', type: 'f32', note: 'dark lacing filaments along dye boundaries' },
  { name: 'macroRelief', type: 'f32', note: 'surface relief: per-pixel normals, specular, occlusion' },
  { name: 'markOn', type: 'f32', note: '1 when there is one loaded' },
  { name: 'photo', type: 'f32' },
  { name: 'postBlur', type: 'f32', note: 'gooey blur radius multiplier' },
  { name: 'rotation0', type: 'f32' },
  { name: 'rotation1', type: 'f32' },
  { name: 'saturation', type: 'f32', note: 'final grade saturation multiplier' },
  { name: 'thinFilm', type: 'f32', note: 'interference colour where the dye runs thinnest' },
  { name: 'time', type: 'f32' },
  { name: 'transmission', type: 'f32' },
];

export const PLATE_LAYOUT = layOut(PLATE_FIELDS);

/** The struct the shader includes. */
export const PLATE_STRUCT = wgslStruct('Plate', PLATE_LAYOUT);
