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
 * There were two chains once, and `npm run post` ran both over the same
 * picture and compared them. The GLSL one went at P7, and so did the gate;
 * `npm run fx` is what holds this one.
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

/**
 * Film stock (F1, docs/filters-plan.md E6).
 *
 * The texture of the era's projected film. Light shows ran 16mm loops and
 * slides beside the liquid plates, all projected, and the plate itself sat on
 * an overhead projector — so the era's look is not a filter over the picture,
 * it is what the picture was photographed on.
 *
 * Four things, in the order light meets them:
 *
 *   the gate    the frame wanders a fraction of a pixel, and its edge is a
 *               soft rounded rectangle rather than the screen's corners
 *   the curve   a toe and a shoulder: shadows compress, highlights roll off,
 *               and nothing clips to flat white the way a digital frame does
 *   the dyes    a per-channel crossover, which is what gives each stock its
 *               cast, and a saturation response that is not flat
 *   the grain   dye clouds, per channel, heaviest in the mid-tones, re-rolled
 *               on the *film* frame rather than the display's
 *
 * Grain is per channel because film grain is: three dye layers, each with its
 * own clumps, which is why film grain reads as colour speckle and video noise
 * reads as grey. Heaviest in the mid-tones because the toe and the shoulder
 * have less dye to clump.
 *
 * (No backticks in this comment: one inside a WGSL comment ends the
 * TypeScript template literal holding it.)
 */
export const STOCK_PASS_WGSL = `${HEAD}${FX_RANDOM_WGSL}

/** The stock's own character: lift, gain, gamma, and a per-channel crossover. */
struct Stock {
  lift: vec3f,
  gain: vec3f,
  gamma: f32,
  sat: f32,
  toe: f32,
  shoulder: f32,
};

fn stockOf(kind: i32) -> Stock {
  var s: Stock;
  // 16mm reversal: cool and saturated, with a hard shoulder — reversal film
  // has nowhere to go once it is full.
  s.lift = vec3f(0.005, 0.008, 0.016);
  s.gain = vec3f(0.98, 1.00, 1.06);
  s.gamma = 1.12; s.sat = 1.18; s.toe = 0.16; s.shoulder = 0.78;
  if (kind == 1) {
    // A slide stock: warm, with deep blacks and a long shoulder.
    s.lift = vec3f(0.004, 0.004, 0.006);
    s.gain = vec3f(1.07, 1.00, 0.93);
    s.gamma = 1.22; s.sat = 1.10; s.toe = 0.10; s.shoulder = 0.86;
  } else if (kind == 2) {
    // Faded sixties colour negative: a magenta cast and blacks that have
    // lifted with age, which is what most surviving footage actually is.
    s.lift = vec3f(0.055, 0.038, 0.052);
    s.gain = vec3f(1.04, 0.94, 1.02);
    s.gamma = 0.92; s.sat = 0.82; s.toe = 0.26; s.shoulder = 0.72;
  } else if (kind == 3) {
    // Super 8: soft, warm, and grainy enough that the grain is the look.
    s.lift = vec3f(0.030, 0.022, 0.018);
    s.gain = vec3f(1.09, 1.00, 0.88);
    s.gamma = 1.02; s.sat = 0.94; s.toe = 0.22; s.shoulder = 0.70;
  } else if (kind == 4) {
    // Monochrome reversal, toned: the saturation goes to nothing and the
    // gain carries the tone.
    s.lift = vec3f(0.010, 0.010, 0.014);
    s.gain = vec3f(1.05, 1.00, 0.92);
    s.gamma = 1.18; s.sat = 0.0; s.toe = 0.12; s.shoulder = 0.82;
  }
  return s;
}

/*
  The characteristic curve: a toe, a straight portion and a shoulder.

  Digital clips — everything above one is one. Film does not: the shoulder
  rolls it off, so a bright plate keeps its shape where a clipped frame goes
  to a flat white blob. The toe does the same at the bottom, which is why
  film shadows are grey and full of detail rather than crushed.
*/
fn curve(x: f32, toe: f32, shoulder: f32) -> f32 {
  let v = clamp(x, 0.0, 4.0);
  let lo = smoothstep(0.0, max(toe, 0.001) * 2.0, v) * toe;
  let mid = clamp((v - toe) / max(shoulder - toe, 0.001), 0.0, 1.0) * (shoulder - toe) + toe;
  let hi = 1.0 - exp(-(max(v - shoulder, 0.0) * 1.6));
  return clamp(select(mid, shoulder + hi * (1.0 - shoulder), v > shoulder) * select(1.0, lo / max(toe, 0.001), v < toe), 0.0, 1.0);
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let amt = clamp(U.stock, 0.0, 1.0);
  if (amt <= 0.001) { return vec4f(tex2(picture, in.uv).rgb, 1.0); }

  let s = stockOf(U.stockType);

  /*
    The gate wanders. A projector does not hold a frame perfectly still — the
    pin registers it and the film breathes — and a fraction of a pixel is
    enough to read as film rather than as video. On the film frame, so it
    moves at the film's rate and not the display's.
  */
  let wob = vec2f(
    fxRand(vec2u(7u, 11u), U.stockFrame, U.seed) - 0.5,
    fxRand(vec2u(13u, 17u), U.stockFrame, U.seed) - 0.5);
  let uv = in.uv + wob * U.stockWeave / max(U.resolution, vec2f(1.0));

  var c = tex2(picture, uv).rgb;

  // The dyes: a per-channel crossover is what a stock's cast actually is.
  c = (c + s.lift) * s.gain;
  c = vec3f(curve(c.r, s.toe, s.shoulder), curve(c.g, s.toe, s.shoulder), curve(c.b, s.toe, s.shoulder));
  c = pow(max(c, vec3f(0.0)), vec3f(s.gamma));
  let grey = dot(c, vec3f(0.299, 0.587, 0.114));
  c = mix(vec3f(grey), c, s.sat);

  /*
    Grain, per channel and heaviest in the mid-tones.

    Film grain is three dye layers of clumps, so it reads as colour speckle
    where video noise reads as grey. The toe and the shoulder have less dye
    to clump, so the weight peaks in the middle of the curve.
  */
  if (U.stockGrain > 0.001) {
    let cell = max(U.stockGrainSize, 1.0);
    let g = vec2u(in.uv * U.resolution / cell);
    let weight = 4.0 * grey * (1.0 - grey);
    let n = vec3f(
      fxRand(g, U.stockFrame, U.seed) - 0.5,
      fxRand(g + vec2u(101u, 0u), U.stockFrame, U.seed ^ 0x9e37u) - 0.5,
      fxRand(g + vec2u(0u, 211u), U.stockFrame, U.seed ^ 0x85ebu) - 0.5);
    c = c + n * U.stockGrain * 0.28 * weight;
  }

  /*
    The gate's own edge: a rounded rectangle, slightly soft, because a
    projector's aperture is a cut piece of metal and not the screen.
  */
  if (U.stockGate > 0.001) {
    let d = abs(in.uv - 0.5) * 2.0;
    let r = 0.12;
    let corner = length(max(d - (1.0 - r), vec2f(0.0))) / r;
    let edge = max(max(d.x, d.y), corner);
    c = c * mix(1.0, smoothstep(1.0, 1.0 - 0.06 - 0.05 * U.stockGate, edge), U.stockGate);
  }

  return vec4f(mix(tex2(picture, in.uv).rgb, max(c, vec3f(0.0)), amt), 1.0);
}
`;
