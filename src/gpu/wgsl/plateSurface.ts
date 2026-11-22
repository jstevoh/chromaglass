/**
 * Read-only surface height binding for the plate display shader (PLAN 31s-1).
 *
 * `surfaceH` is bound at `@binding(26)` (the eighth and final storage buffer in
 * the fragment stage under WebGPU default limits) and packed from the solver's
 * `r32float` height texture (`surfaceHeight`) during `WebGPUPlate.draw`.
 * PLAN 31s-2 will trace lamp rays through `surfaceH`; 31s-1 only exposes it
 * without drawing it.
 */
import { PLATE_METRES } from '../fluid/constants';

export const SURFACE_PLATE_WGSL = /* wgsl */ `
@group(0) @binding(26) var<storage, read> surfaceH: array<f32>;

const SURFACE_PLATE_METRES: f32 = ${PLATE_METRES};

fn surfaceAt(i: i32, j: i32, n: i32) -> f32 {
  let ci = clamp(i, 0, n - 1);
  let cj = clamp(j, 0, n - 1);
  return surfaceH[u32(cj) * u32(n) + u32(ci)];
}

/* Bilinear height in metres at plate uv; returns 0 when no height field is bound. */
fn surfaceHeightAt(fuv: vec2f) -> f32 {
  let n = i32(round(sqrt(f32(arrayLength(&surfaceH)))));
  if (n < 4) { return 0.0; }
  let p = fuv * f32(n) - 0.5;
  let b = vec2i(floor(p));
  let f = p - floor(p);
  let h00 = surfaceAt(b.x, b.y, n);
  let h10 = surfaceAt(b.x + 1, b.y, n);
  let h01 = surfaceAt(b.x, b.y + 1, n);
  let h11 = surfaceAt(b.x + 1, b.y + 1, n);
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}
`;

/** Packs the solver's r32float height texture into `surfaceH` during `WebGPUPlate.draw`. */
export const PACK_SURFACE_KERNEL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let dims = textureDimensions(src, 0);
  if (id.x >= dims.x || id.y >= dims.y) { return; }
  dst[id.y * dims.x + id.x] = textureLoad(src, vec2i(id.xy), 0).r;
}
`;
