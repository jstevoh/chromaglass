/**
 * The solver's fields, in the form the composite reads them
 * (docs/webgpu-plan.md, P3).
 *
 * The composite samples a packed 8-bit plate: density square-rooted over a
 * scale of eight in alpha, the log-space absorptions the same way in rgb. It
 * has always done that, because on WebGL the fields arrive as an RGBA8
 * texture the solver renders into (`packInto` in `lib/gpuFluid.ts`).
 *
 * The WebGPU solver holds those fields as 32-bit floats and could be sampled
 * directly, which would be one round trip fewer and a great deal more
 * precision at low densities. That is a change to the picture, though, and
 * the whole argument for the WGSL composite is that it draws the same picture
 * as the GLSL — so it is fed the same 8-bit plate, and reading the floats
 * straight is left for the headroom (docs/webgpu-plan.md, H).
 */

const HEAD = /* wgsl */ `
struct PackArgs {
  n: f32,              // the grid
  velRange: f32,       // the frame's peak speed, which the velocity is encoded against
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> A: PackArgs;

const DENSITY_SCALE = 8.0;
`;

const W = '@compute @workgroup_size(8, 8)';

export const PACK_KERNELS: Record<string, string> = {
  /**
   * The dye: every channel square-rooted over the scale, which is what gives
   * a smooth gradient its precision back at the low densities where 8 bits
   * would otherwise band.
   */
  packDye: `${HEAD}
@group(0) @binding(1) var dye: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba8unorm, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let d = textureLoad(dye, vec2i(id.xy), 0);
  textureStore(dst, vec2i(id.xy), sqrt(clamp(d / DENSITY_SCALE, vec4f(0.0), vec4f(1.0))));
}`,

  /**
   * The flow, against the frame's own peak speed so slow and fast passages
   * both resolve; `u_flowRate` turns it back into plate-uv a second in the
   * shader.
   */
  packVel: `${HEAD}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rgba8unorm, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let v = textureLoad(vel, vec2i(id.xy), 0).xy / max(A.velRange, 1e-6);
  textureStore(dst, vec2i(id.xy), vec4f(clamp(v * 0.5 + 0.5, vec2f(0.0), vec2f(1.0)), 0.0, 1.0));
}`,
};
