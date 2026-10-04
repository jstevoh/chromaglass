/**
 * The projector's pass in WGSL (docs/webgpu-plan.md, P3). It was written as
 * the twin of a GLSL pass in `src/lib/outputPass.ts` and proved against it
 * frame for frame by `npm run output`; both were deleted with the WebGL
 * renderer at P7, so this is the only copy and `npm run wall` is what holds
 * it. Comments that once said "see the GLSL for why" have nothing to point
 * at — what is here is the whole of it.
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
// What a surface can show instead of the finished frame (PLAN.md §16b,
// lib/outputConfig.ts SurfaceSource): the front plate alone, the back plate
// alone, the film alone. Each is the plate's display drawn again into its own
// texture, stored the way \`scene\` is, so one sample serves all four. A
// source nobody asked for is bound to \`scene\`, never read.
@group(0) @binding(3) var frontOnly: texture_2d<f32>;
@group(0) @binding(4) var backOnly: texture_2d<f32>;
@group(0) @binding(5) var filmOnly: texture_2d<f32>;

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

/** Where in its picture surface i shows the local point q (before the texture's own flip). */
fn pictureAt(i: u32, q: vec2f) -> vec2f {
  let s = U.src[i];
  let uv = s.xy + q * s.zw;
  return mix(uv, 1.0 - uv, step(U.flip, vec2f(0.0)));
}

/**
 * How far inside surface j the screen point d is, in j's own space, when j
 * shows the same point of the picture there as uv; 0 outside it, or
 * where it shows another part. Two texels of slack: two tiles lined up by
 * hand agree to about that.
 */
fn samePointDepth(j: u32, d: vec2f, uv: vec2f) -> f32 {
  let w = mat3x3<f32>(U.warpA[j].xyz, U.warpB[j].xyz, U.warpC[j].xyz);
  let p = w * vec3f(d, 1.0);
  if (p.z <= 1e-6) { return 0.0; }
  let q = p.xy / p.z;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return 0.0; }
  let off = abs(pictureAt(j, q) - uv) * U.resolution;
  if (max(off.x, off.y) > 2.0) { return 0.0; }
  return max(0.0, shapeDepth(i32(U.form[j].x), q));
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

  let srcUv = pictureAt(i, q);

  // form.w is the surface's source: 0 the wall, 1 front, 2 back, 3 film.
  let at = vec2f(srcUv.x, 1.0 - srcUv.y);
  let which = i32(form.w + 0.5);
  var col = textureSampleLevel(scene, samp, at, 0.0).rgb;
  if (which == 1) { col = textureSampleLevel(frontOnly, samp, at, 0.0).rgb; }
  else if (which == 2) { col = textureSampleLevel(backOnly, samp, at, 0.0).rgb; }
  else if (which == 3) { col = textureSampleLevel(filmOnly, samp, at, 0.0).rgb; }

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

  // ── Over, or a beam (§16c) ───────────────────────────────────────
  // Premultiplied, so clamped first: the target clamps what a shader
  // returns before it blends, and a colour over 1 (the output's gain goes
  // to 3) scaled by its coverage after that clamp is what every surface
  // always drew. Scaled before it, a surface at half opacity and gain 3
  // came out near white where it had been mid-grey (npm run beams).
  col = clamp(col, vec3f(0.0), vec3f(1.0));
  // Laid over: the colour at its coverage and that coverage taken from what
  // is under it, the blend every surface always had.
  let cover = sa * form.z;
  if (U.lay[i].x < 0.5) { return vec4f(col * cover, cover); }
  /*
    A beam adds its light, taking nothing away. Two beams crossing are two
    pictures meeting, and add whole: that overlap is the instrument. Except
    where they are one picture carried by two projectors: the same source,
    showing the same point of it there (tiles laid edge to edge with an
    overlap). There each gives the overlap the share of how far inside it
    the point is against how far inside all of them it is: its share falls
    to nothing at its own edge as the other's rises, and the shares sum to
    one wherever they cross, whatever the width of the overlap. That is
    what lets two tiles meet with no bright seam (two full beams: twice the
    light) and no dark one (two feathers over each other: each short of
    full where they meet). The feather then shapes only the edges no other
    beam of the picture covers: the reach is the fullest of the beams at
    this point, so it is one inside any of them and falls off only past the
    last. Two beams of one source showing different parts of it are two
    pictures, and add.
  */
  var total = 0.0;
  var reach = 0.0;
  let count = u32(U.quads + 0.5);
  for (var j = 0u; j < count; j++) {
    if (U.lay[j].x < 0.5 || abs(U.form[j].w - form.w) > 0.5) { continue; }
    let dj = samePointDepth(j, d, srcUv);
    if (dj <= 0.0) { continue; }
    total += dj;
    reach = max(reach, smoothstep(0.0, max(U.form[j].y, 1e-4), dj));
  }
  let own = max(0.0, shapeDepth(i32(form.x), q));
  let share = select(1.0, own / total, total > 0.0);
  return vec4f(col * share * reach * form.z, 0.0);
}
`;
