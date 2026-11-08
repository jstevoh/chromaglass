/**
 * The camera in WGSL (docs/webgpu-plan.md, P3), twin of the GLSL in
 * `src/lib/cameraPass.ts`.
 *
 * The two have to take the same photograph: `npm run camera` runs both over
 * the same scene, the same aux attachment and the same uniforms and compares
 * the frames. Read the GLSL for why a line is the way it is — the comments
 * here cover only what the port changes.
 *
 * What the port changes:
 * - Sampling is always `textureSampleLevel(t, samp, uv, 0.0)`. The disc and
 *   the bloom ring sample inside per-pixel branches, where WGSL forbids the
 *   implicit derivatives `textureSample` needs.
 * - The uniforms are one buffer, `U`, generated from `cameraFields.ts`.
 * - `gl_FragCoord` is `U.resolution.y - pos.y`: WebGPU counts framebuffer
 *   rows down where GL counts them up, and the dither hashes that coordinate,
 *   so counting it the other way would be a different dither on every pixel.
 *   The uv needs no such correction — the vertex stage leaves it as the
 *   GLSL's, and the frame simply comes out of memory the other way up.
 */

import { CAMERA_STRUCT } from './cameraFields';

export const CAMERA_WGSL = /* wgsl */ `
${CAMERA_STRUCT}
@group(0) @binding(0) var<uniform> U: Camera;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scene: texture_2d<f32>;   // the plate, drawn
@group(0) @binding(3) var aux: texture_2d<f32>;     // normal.xy (biased), height, bubble mask

fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

const DISC = array<vec2f, 12>(
  vec2f(-0.326, -0.406), vec2f(-0.840, -0.074), vec2f(-0.696,  0.457), vec2f(-0.203,  0.621),
  vec2f( 0.962, -0.195), vec2f( 0.473, -0.480), vec2f( 0.519,  0.767), vec2f( 0.185, -0.893),
  vec2f( 0.507,  0.064), vec2f( 0.896,  0.412), vec2f(-0.322, -0.933), vec2f(-0.792, -0.598));

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

/*
  Which way up this pass stores its picture (docs/webgpu-plan.md, P3).

  A WebGPU render target's first row is its top, and a full-screen quad's
  uv.y of 1 lands there — so a pass that samples at uv.y 1 reads the *last*
  row, and a picture handed from one pass to the next comes out upside down. Drawn straight to the canvas that never shows, which is why it took
  the camera being switched on to see it: the mark moved from seven tenths
  down the screen to two tenths.

  So a pass writing into a texture another pass will sample flips its clip
  space, which puts uv.y 0 in row 0 — the convention WebGL's own framebuffers
  have, and the one every consumer here and in the parity harnesses already
  assumes. Drawing to the canvas, it does not flip.

  (No backticks in this comment: one inside a WGSL comment ends the
  TypeScript template literal holding it.)

  An override constant rather than a uniform: the two pipelines differ by a
  sign that never changes within a pass, and the harnesses go on compiling
  the unflipped one without knowing this exists.
*/
override FLIP_Y: f32 = 1.0;
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  out.uv = xy * 0.5 + 0.5;
  return out;
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  let aspect = U.resolution.x / max(1.0, U.resolution.y);
  let ax = vec2f(1.0 / aspect, 1.0);            // an offset that is round on screen
  let rad = (uv - 0.5) * vec2f(aspect, 1.0);

  let a = tex2(aux, uv);
  let n = a.xy * 2.0 - 1.0;
  let h = a.z;
  let bub = a.w;

  // ── Refraction ──────────────────────────────────────────────────
  let off = n * (h * 0.028 + bub * 0.045) * U.refraction * ax;
  let ca = (off * 0.18 + rad * ax * 0.0035 * length(rad)) * U.chromatic;

  // ── Depth of field ──────────────────────────────────────────────
  var coc = abs(h - U.focus) * U.aperture * 9.0 + length(rad) * U.aperture * 1.2;
  coc *= 1.0 - bub * 0.5;
  let r = coc / U.resolution.y;

  var col: vec3f;
  if (coc < 0.6) {
    col = vec3f(tex2(scene, uv + off + ca).r, tex2(scene, uv + off).g, tex2(scene, uv + off - ca).b);
  } else {
    col = vec3f(0.0);
    for (var i = 0; i < 12; i++) {
      let o = DISC[i] * r * ax;
      col += vec3f(tex2(scene, uv + off + ca + o).r, tex2(scene, uv + off + o).g, tex2(scene, uv + off - ca + o).b);
    }
    col /= 12.0;
  }

  // ── Bloom ───────────────────────────────────────────────────────
  if (U.bloom > 0.001) {
    var glow = vec3f(0.0);
    for (var i = 0; i < 8; i++) {
      let ang = f32(i) * 0.7853981634;
      let d = vec2f(cos(ang), sin(ang)) * ax;
      let s1 = tex2(scene, uv + d * 0.012).rgb;
      let s2 = tex2(scene, uv + d * 0.032).rgb;
      glow += max(s1 - 0.55, vec3f(0.0)) * 0.7 + max(s2 - 0.55, vec3f(0.0)) * 0.4;
    }
    col += glow * (U.bloom * 0.14);
  }

  // ── The sensor ──────────────────────────────────────────────────
  let mapped = aces(col * 1.12);
  col = mix(clamp(col, vec3f(0.0), vec3f(1.0)), mapped, U.filmic);
  let vig = 1.0 - smoothstep(0.45, 1.15, length(rad) * 1.3) * 0.55 * U.vignette;
  col *= vig;
  let luma = dot(col, vec3f(0.299, 0.587, 0.114));
  col += (hash(uv * U.resolution + fract(U.time * 47.3)) - 0.5) * 0.04 * U.grain * (0.15 + 0.85 * smoothstep(0.02, 0.5, luma));

  let plain = tex2(scene, uv).rgb;
  var outc = mix(plain, clamp(col, vec3f(0.0), vec3f(1.0)), U.amount);
  // GL's fragment coordinate, counted up from the bottom row as the GLSL has
  // it, so the dither falls on the same pixels in both.
  let frag = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  let dth = hash(frag) + hash(frag + vec2f(17.31, 5.73)) - 1.0;
  outc += U.dither * dth * step(1.0 / 255.0, max(outc.r, max(outc.g, outc.b))) / 255.0;
  return vec4f(outc, 1.0);
}
`;
