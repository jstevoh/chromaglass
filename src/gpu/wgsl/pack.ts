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
 * straight is left for the headroom (docs/webgpu-plan.md, H). The flow is the
 * exception, below: it is not part of the GLSL's picture, only of the
 * closeup's detail, and eight bits of it were visible there.
 */

/**
 * The solver's velocity, and the packed flow, which is the same half float
 * rather than eight bits like the dye.
 *
 * The flow is only read by the closeup's detail, which slides its cells by it
 * times their whole life so far (`cellField`), so its precision is multiplied
 * by that too. It used to be eight bits against the frame's peak speed,
 * which made one step of the encoding 1/127 of the fastest paint wherever the
 * paint was, slow or fast; and the peak was read again every frame, so every
 * pixel was re-rounded against a new one whether its own flow had changed or
 * not. At the default Speed that moved the cells by 9 to 100 times as far in
 * one step as the paint under them goes in a frame, and turned the lacing,
 * which is drawn along the flow, by up to 27 degrees a step where the paint
 * was nearly still (the old packing through the model in `npm run cellride`;
 * the numbers are in the commit).
 *
 * A float needs no range, so it is packed raw and a steady flow packs to the
 * same number every step. It is half float because the solver's field is
 * (SOLVER_VEL_FORMAT): this adds no rounding of its own. What the solver's
 * half float still does is round a *changing* flow to one part in a
 * thousand or two, and each of those steps, crossed, hops the cells: at the default
 * Speed by up to 1.3 times the fastest paint's travel in a frame, three times
 * at a slow one. That is the solver's own format, which every one of its
 * passes reads and writes, so it is left here, and the check prints it
 * rather than passing over it.
 *
 * Nothing else samples it, so the picture is otherwise the same.
 */
export const SOLVER_VEL_FORMAT = 'rgba16float' as const;
export const PACKED_VEL_FORMAT = 'rgba16float' as const;

const HEAD = /* wgsl */ `
struct PackArgs {
  n: f32,              // the grid
  pad0: f32,
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
   * The flow, in the solver's own units, signed, in half float
   * (PACKED_VEL_FORMAT); `u_flowRate` turns it into plate-uv per unit of the
   * cell clock in the shader (lib/detailFlow.ts). The clamp is far past
   * anything the solver reaches (`safeVel`) and only keeps a runaway value
   * inside half float.
   */
  packVel: `${HEAD}
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<${PACKED_VEL_FORMAT}, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let v = textureLoad(vel, vec2i(id.xy), 0).xy;
  textureStore(dst, vec2i(id.xy), vec4f(clamp(v, vec2f(-60000.0), vec2f(60000.0)), 0.0, 1.0));
}`,
};
