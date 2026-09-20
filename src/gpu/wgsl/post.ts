/**
 * The post chain in WGSL (docs/webgpu-plan.md, P3; docs/filters-plan.md, F0),
 * twin of the GLSL in `src/lib/postChain.ts`.
 *
 * With no effect on, none of this runs: the plate finishes the frame itself
 * and draws straight to the canvas, the projector or the camera. With one on,
 * the plate draws into the chain's picture unfinished, the effects run over
 * it, and the finish does the last three things — the dimmer, the mark, the
 * dither.
 *
 * The finish is not written here. It is `FINISH_WGSL` from the plate's own
 * shader, the same text the plate runs when it finishes a frame itself, which
 * is how the GLSL does it too (`FINISH_GLSL`, shared between the plate shader
 * and this chain). Two copies of those lines would be two pictures the first
 * time one of them changed. It reads `U.dimmer`, `U.markOn` and `U.markRect`,
 * which is why this pass's table names them the same.
 *
 * `npm run post` runs both chains over the same picture and compares them.
 */

import { POST_STRUCT } from './postFields';
import { FINISH_WGSL } from './plate';

/** The bindings and helpers both passes share. */
const HEAD = /* wgsl */ `
${POST_STRUCT}
@group(0) @binding(0) var<uniform> U: Post;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var picture: texture_2d<f32>;
@group(0) @binding(3) var markTex: texture_2d<f32>;

fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }

/*
  Which way up this pass stores its picture: see FLIP_Y in wgsl/plate.ts.
  The effects and the ring's blit always write a texture, so the chain always
  compiles them flipped; the finish may write the canvas instead, and takes
  whichever it is given. (No backticks in here: one inside a WGSL comment
  ends the TypeScript template literal holding it.)
*/
override FLIP_Y: f32 = 1.0;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  // Unflipped, as the plate's own vertex stage leaves it: the dither and the
  // grain hash coordinates, and a flip here would be a different pattern.
  out.uv = xy * 0.5 + 0.5;
  return out;
}
`;

/**
 * Randomness for effects, deterministic: from the frame count and a seed,
 * never `Math.random` or the wall clock. Integer hashing (PCG), because a
 * sin-based float hash differs from GPU to GPU — and now from API to API,
 * which is the same argument twice over.
 */
export const FX_RANDOM_WGSL = /* wgsl */ `
fn fxPcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

/** 0..1 from a pixel, the frame and the seed. */
fn fxRand(pixel: vec2u, frame: u32, seed: u32) -> f32 {
  return f32(fxPcg(pixel.x ^ fxPcg(pixel.y ^ fxPcg(frame ^ fxPcg(seed))))) / 4294967295.0;
}
`;

/** The finish: the dimmer, the mark, the dither, onto whatever comes next. */
export const FINISH_PASS_WGSL = `${HEAD}${FINISH_WGSL}
@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  // GL counts fragment rows up from the bottom and the dither hashes that
  // coordinate, so a frame drawn either way dithers the same pixels.
  let fragGl = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  return finishFrame(tex2(picture, in.uv).rgb, in.uv, fragGl, markTex);
}
`;

/**
 * A test effect for the harness, never in a look: seeded noise over the
 * picture (mode 1), or the picture from `U.layer` of the history ring
 * (mode 2). The real effects (docs/filters-plan.md, F1–F9) are written
 * against this shape after the cutover.
 */
export const TEST_PASS_WGSL = `${HEAD}${FX_RANDOM_WGSL}
@group(0) @binding(4) var history: texture_2d_array<f32>;

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  var c = tex2(picture, in.uv).rgb;
  if (U.mode == 1) {
    // The GL's fragment coordinate, taken from the uv rather than from the
    // position: they are the same number unflipped, and this one stays the
    // same number when FLIP_Y mirrors the geometry. An effect's randomness
    // has to be the pixel's, not the row's, or a frame drawn into a texture
    // and the same frame drawn to the canvas are different pictures.
    let px = vec2u(in.uv * U.resolution);
    c = mix(c, vec3f(fxRand(px, U.frame, U.seed)), 0.5);
  } else if (U.mode == 2) {
    c = textureSampleLevel(history, samp, in.uv, i32(U.layer), 0.0).rgb;
  }
  return vec4f(c, 1.0);
}
`;

/**
 * A copy, for the history ring: the picture into one layer of it, scaled
 * down on the way. The ring is a stack of past frames and this pass writes
 * one of them, so it cannot be the test effect's shader with the mode off —
 * that one samples the ring, and a texture cannot be read and written in the
 * same pass.
 */
export const BLIT_WGSL = /* wgsl */ `
override FLIP_Y: f32 = 1.0;
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var picture: texture_2d<f32>;

struct BlitOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> BlitOut {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: BlitOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  out.uv = xy * 0.5 + 0.5;
  return out;
}

@fragment fn fs(in: BlitOut) -> @location(0) vec4f {
  return textureSampleLevel(picture, samp, in.uv, 0.0);
}
`;
