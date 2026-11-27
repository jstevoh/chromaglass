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

/*
  The dye's path through the gap at rest, in the composite's units: what
  decodeFluid multiplies the plate's density by for the light the lamp ground
  passes (totalDensity × 2.8, wgsl/plate.ts). packDyeBodies averages light, which is not
  linear in the dye, so it needs the path the composite will use.
*/
export const DYE_PATH = 2.8;

export const PACK_KERNELS: Record<string, string> = {
  /**
   * The dye where Oil Bodies keeps each liquid's colour apart (PLAN 47z-1,
   * 28i-7b, 28k-5): the light through a cell that is part oil and part
   * water, averaged over the cell rather than multiplied through it.
   *
   * What was reported: a Splodascope with the photograph's cobalt water
   * turned every drop green and ringed each with a black band four or five
   * cells wide, so the look was given a pale water instead (28i-7), and a
   * crowd pressed together read murky, being mostly edge (28k-5). Measured
   * in the lab (scratch, 192², the look's own settings, four seconds): the
   * solver had already kept the colours apart, the water's dye inside the
   * drops 16.5 against the oil's 8496 (0.2%), so the drops were not green
   * from water in them. The black was the edge: 3438 cells between a tenth
   * and nine tenths oil against 7374 deep in the drops, and there the
   * plate summed both liquids' absorbance, exp(−k(w + o)), which for red oil
   * beside cobalt water takes out every channel.
   *
   * That sum is right for light that goes through both liquids, one above
   * the other, and wrong here. In the gap a drop spans the glass to glass
   * (Hele-Shaw), so a column of light is either through the oil or through
   * the water; the cell between is part oil only because Cahn–Hilliard
   * holds the boundary a few cells wide whatever a cell's size, a smear of
   * a sharp edge and not a layer of mixed liquid. So a cell that is c oil
   * has c of its area under the oil's whole column, at the oil's colour per
   * unit of oil (o/c), and the rest under the water's (w/(1 − c)), and what
   * comes through is the area-weighted sum of the two:
   *
   *   T = c·exp(−k·o/c) + (1 − c)·exp(−k·w/(1 − c))
   *
   * which lies between the two liquids' own colours and never under the
   * darker of them. Written back as the absorbance that lets T through,
   * −ln T / k, so everything that decodes the plate (the lamp ground, the
   * black ground's paint, the spectral path) reads it as it always read the
   * dye, and the total in alpha is the dye's own, unchanged, so the relief,
   * the gooey blur and the optical path see the same amount of dye.
   *
   * k is the composite's path at the rest gap, DYE_PATH (decodeFluid's
   * totalDensity × 2.8 on the lamp ground): the averaging is not linear, so
   * it needs a path, and the gap's own (gapScale, 0.3 to 3 times) is the
   * composite's to know, not the pack's. The real meniscus's dark line is
   * the light bent out of the lens at the rim, which is 47z-4's, and the
   * plate keeps drawing it there (the rim term in plateWgsl).
   *
   * Where the oil carries no colour of its own (Oil Bodies off, a print)
   * there is nothing to tell the two liquids' dyes apart by, and packVel
   * packs dye as it always did.
   */
  packDyeBodies: `${HEAD}
@group(0) @binding(1) var dye: texture_2d<f32>;
@group(0) @binding(2) var oilDye: texture_2d<f32>;
@group(0) @binding(3) var mixT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba8unorm, write>;
const K = ${DYE_PATH};
// A thousandth, as bodyPartition's E: a liquid with none of its area holds
// its colour at a concentration so high the light through it is nothing,
// times an area of nothing.
const E = 0.001;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let p = vec2i(id.xy);
  let t = max(textureLoad(dye, p, 0), vec4f(0.0));
  let o = clamp(textureLoad(oilDye, p, 0), vec4f(0.0), t);
  let w = t - o;
  let c = clamp(textureLoad(mixT, p, 0).r, 0.0, 1.0);
  let T = c * exp(-K * o.rgb / max(c, E)) + (1.0 - c) * exp(-K * w.rgb / max(1.0 - c, E));
  let a = -log(clamp(T, vec3f(1e-6), vec3f(1.0))) / K;
  // Never more than the sum: where c rounds to an end, the plain product.
  let d = vec4f(min(a, t.rgb), t.a);
  textureStore(dst, p, sqrt(clamp(d / DENSITY_SCALE, vec4f(0.0), vec4f(1.0))));
}`,

  /**
   * Packs dye (rgba8unorm, square-rooted over DENSITY_SCALE) and velocity +
   * species scatter (PACKED_VEL_FORMAT) into the composite layers in one pass.
   * The flow is in the solver's own units, signed, in half float; `u_flowRate`
   * turns it into plate-uv per unit of the cell clock in the shader.
   *
   * Binding 1: dye, 2: dstDye, 3: vel, 4: dstVel, 5: species (carry scatter in b, PLAN 18j).
   */
  packVel: `${HEAD}
@group(0) @binding(1) var dye: texture_2d<f32>;
@group(0) @binding(2) var dstDye: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<${PACKED_VEL_FORMAT}, write>;
@group(0) @binding(5) var species: texture_2d<f32>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let p = vec2i(id.xy);
  let d = textureLoad(dye, p, 0);
  textureStore(dstDye, p, sqrt(clamp(d / DENSITY_SCALE, vec4f(0.0), vec4f(1.0))));
  let v = textureLoad(vel, vec2i(id.xy), 0).xy;
  let sp = textureLoad(species, min(p, vec2i(textureDimensions(species)) - 1), 0);
  textureStore(dst, p, vec4f(clamp(v, vec2f(-60000.0), vec2f(60000.0)), 0.0, max(0.0, sp.b)));
}`,
};
