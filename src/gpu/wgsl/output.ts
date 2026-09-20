/**
 * The projector's pass in WGSL (docs/webgpu-plan.md, P3), twin of the GLSL in
 * `src/lib/outputPass.ts`.
 *
 * `npm run output` runs both over the same scene and the same mapping and
 * compares the frames. Read the GLSL for why a line is the way it is — the
 * comments here cover only what the port changes.
 *
 * What the port changes:
 * - The quad's corners were a vertex buffer rewritten per draw; here they are
 *   two of the per-quad uniforms and the vertex stage builds the two
 *   triangles from `vertex_index`. Nothing is uploaded between draws, which
 *   is what lets every surface go in one instanced draw.
 * - `gl_FragCoord` is `U.resolution.y - pos.y`, as in the camera: the dither
 *   hashes that coordinate and WebGPU counts rows the other way.
 * - The scene is sampled with `1 - src.y` as the GLSL does it. That flip is
 *   about where the upstream pass left the picture, not about the API, and it
 *   stays until the whole chain is WebGPU and the plate is written the way
 *   WebGPU reads it.
 */

import { OUTPUT_STRUCT } from './outputFields';

export const OUTPUT_WGSL = /* wgsl */ `
${OUTPUT_STRUCT}
@group(0) @binding(0) var<uniform> U: Output;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scene: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) screen: vec2f,      // screen space, y down: where the corners are dragged
  @location(1) @interpolate(flat) quad: u32,
};

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) q: u32) -> VsOut {
  let ab = U.cornerAB[q];
  let cd = U.cornerCD[q];
  var order = array<u32, 6>(0u, 1u, 2u, 0u, 2u, 3u);
  let k = order[v];
  var p = ab.xy;
  if (k == 1u) { p = ab.zw; } else if (k == 2u) { p = cd.xy; } else if (k == 3u) { p = cd.zw; }
  var out: VsOut;
  out.pos = vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  out.screen = p;
  out.quad = q;
  return out;
}

/** How far inside its shape a point of the unit square is, before feathering. */
fn shapeDepth(shape: i32, q: vec2f) -> f32 {
  if (shape == 1) { return 0.5 - length(q - 0.5); }                     // ellipse
  if (shape == 2) { return q.y * 0.5 - abs(q.x - 0.5); }                // triangle, apex up
  if (shape == 3) { return 0.5 - (abs(q.x - 0.5) + abs(q.y - 0.5)); }   // diamond
  return min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));                 // rect
}

fn dhash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let i = in.quad;
  let d = in.screen;

  // ── Corner pin ───────────────────────────────────────────────────
  let warp = mat3x3<f32>(U.warpA[i].xyz, U.warpB[i].xyz, U.warpC[i].xyz);
  let p = warp * vec3f(d, 1.0);
  if (p.z <= 1e-6) { discard; }
  let q = p.xy / p.z;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { discard; }

  // ── Shape ────────────────────────────────────────────────────────
  let form = U.form[i];
  let sa = smoothstep(0.0, max(form.y, 1e-4), shapeDepth(i32(form.x), q));
  if (sa <= 0.0) { discard; }

  let s = U.src[i];
  var srcUv = s.xy + q * s.zw;
  srcUv = mix(srcUv, 1.0 - srcUv, step(U.flip, vec2f(0.0)));

  var col = textureSampleLevel(scene, samp, vec2f(srcUv.x, 1.0 - srcUv.y), 0.0).rgb;

  // ── Blanking ─────────────────────────────────────────────────────
  let fe = max(U.feather, 1e-4);
  let m = smoothstep(0.0, fe, d.y - U.mask.x)
        * smoothstep(0.0, fe, (1.0 - U.mask.y) - d.x)
        * smoothstep(0.0, fe, (1.0 - U.mask.z) - d.y)
        * smoothstep(0.0, fe, d.x - U.mask.w);

  // ── Grade ────────────────────────────────────────────────────────
  col = pow(max(col * U.gain, vec3f(0.0)), vec3f(U.gamma)) * m;
  let frag = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  let dth = dhash(frag) + dhash(frag + vec2f(17.31, 5.73)) - 1.0;
  col += dth * step(1.0 / 255.0, max(col.r, max(col.g, col.b))) / 255.0;
  return vec4f(col, sa * form.z);
}
`;
