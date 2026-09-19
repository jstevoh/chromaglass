/**
 * Boyle's bench as compute (docs/webgpu-plan.md, P2): the Gray–Scott field of
 * `lib/chemistry.ts`, kernel for kernel.
 *
 * The CPU version scans 192² four times a frame and then scans it again to
 * deposit dye — about a million reads a frame on the main thread, for a
 * pattern nobody is waiting on. Here it is two textures and a dispatch, and
 * the deposit happens inside the solver's own dye pass (`depositChem` in
 * `wgsl/fluid.ts`), so the field never crosses the bus at all.
 *
 * The field is one `rg32float` texture: substrate in r, activator in g.
 */

const HEAD = /* wgsl */ `
struct Chem {
  n: f32,              // the grid, logical cells
  feed: f32,
  kill: f32,
  pad: f32,
  seed: vec4f,         // cx, cy, radius, unused — in cells
};
@group(0) @binding(0) var<uniform> C: Chem;

fn atEdge(p: vec2i, n: i32) -> bool { return p.x == 0 || p.y == 0 || p.x == n - 1 || p.y == n - 1; }
`;

const W = '@compute @workgroup_size(8, 8)';

export const CHEM_KERNELS: Record<string, string> = {
  /** Substrate everywhere, activator nowhere. */
  chemFill: `${HEAD}
@group(0) @binding(1) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(C.n);
  let p = vec2i(id.xy);
  if (p.x >= n || p.y >= n) { return; }
  textureStore(dst, p, vec4f(1.0, 0.0, 0.0, 0.0));
}`,

  /**
   * One Gray–Scott iteration, Jacobi over the five-point Laplacian, with the
   * same Du/Dv the CPU uses. The frame of the plate holds substrate, so
   * nothing grows into it.
   */
  chemStep: `${HEAD}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(C.n);
  let p = vec2i(id.xy);
  if (p.x >= n || p.y >= n) { return; }
  if (atEdge(p, n)) { textureStore(dst, p, vec4f(1.0, 0.0, 0.0, 0.0)); return; }
  let c = textureLoad(src, p, 0).rg;
  let lap = textureLoad(src, p + vec2i(-1, 0), 0).rg
          + textureLoad(src, p + vec2i(1, 0), 0).rg
          + textureLoad(src, p + vec2i(0, -1), 0).rg
          + textureLoad(src, p + vec2i(0, 1), 0).rg
          - 4.0 * c;
  let uvv = c.r * c.g * c.g;
  let u = c.r + 0.16 * lap.r - uvv + C.feed * (1.0 - c.r);
  let v = c.g + 0.08 * lap.g + uvv - (C.feed + C.kill) * c.g;
  textureStore(dst, p, vec4f(u, v, 0.0, 0.0));
}`,

  /** A drop of activator in a disc, as `ChemistryField.seed`. */
  chemSeed: `${HEAD}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<rg32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(C.n);
  let p = vec2i(id.xy);
  if (p.x >= n || p.y >= n) { return; }
  let c = textureLoad(src, p, 0).rg;
  var u = c.r;
  var v = c.g;
  let d = length(vec2f(p) - C.seed.xy);
  if (!atEdge(p, n) && d <= C.seed.z) {
    v = max(v, 0.5 + 0.5 * (1.0 - d / C.seed.z));
    u = min(u, 0.5);
  }
  textureStore(dst, p, vec4f(u, v, 0.0, 0.0));
}`,
};
