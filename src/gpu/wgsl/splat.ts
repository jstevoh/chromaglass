/**
 * What lands on the plate, laid down on the GPU (docs/webgpu-plan.md, P2).
 *
 * Until now everything poured — a brush, a drop, a beat, a preset's opening
 * spray — was painted into three 192² CPU arrays and uploaded once a step.
 * That costs a megabyte across the bus per step, the arrays have to be wiped
 * afterwards, and a pour is stuck at the logical grid however fine the
 * simulation is.
 *
 * Here the same pours are *records*: a few floats each, read by one dispatch
 * that writes the delta fields at full resolution. The solver's own delta
 * passes are unchanged — they read the same three textures either way, which
 * is what lets `npm run parity` pour the same drop through both paths and
 * compare.
 *
 * Geometry stays in logical cells (0..L), so every radius tuned over the
 * years still means what it meant.
 */

const SPLAT_STRUCT = /* wgsl */ `
struct Splat {
  // x, y and radius in logical cells; w is the kind: 0 disc, 1 line.
  a: vec4f,
  // What it deposits: −log(colour) × amount in rgb, density in a.
  b: vec4f,
  // vx, vy, temperature, and the change in the plate gap.
  c: vec4f,
  // The dye multiplier at the centre (1 leaves it alone), the falloff
  // (0 flat, 1 linear, 2 squared, 3 gaussian), and a line's far end.
  d: vec4f,
};

struct SplatArgs {
  count: u32,
  n: f32,              // physical grid
  l: f32,              // logical grid the radii are in
  pad: f32,
};
@group(0) @binding(0) var<uniform> A: SplatArgs;

/** How much of a splat lands at distance d from its middle. */
fn falloff(mode: f32, d: f32, r: f32) -> f32 {
  if (d > r) { return 0.0; }
  if (mode < 0.5) { return 1.0; }                      // flat
  let t = 1.0 - d / max(r, 0.0001);
  if (mode < 1.5) { return t; }                        // linear
  if (mode < 2.5) { return t * t; }                    // squared
  let s = max(r * 0.5, 0.0001);                        // gaussian, as splatBlob
  return exp(-(d * d) / (2.0 * s * s));
}

/** Distance from p to a splat's shape, in logical cells. */
fn splatDist(s: Splat, p: vec2f) -> f32 {
  if (s.a.w < 0.5) { return length(p - s.a.xy); }
  let e = s.d.zw - s.a.xy;                             // the line, middle to far end
  let t = clamp(dot(p - s.a.xy, e) / max(dot(e, e), 0.0001), 0.0, 1.0);
  return length(p - (s.a.xy + e * t));
}
`;

const W = '@compute @workgroup_size(8, 8)';

export const SPLAT_KERNELS: Record<string, string> = {
  /**
   * Every record, at every cell it touches, into the three delta fields.
   *
   * One pass over the grid with the records in a loop, rather than one
   * dispatch per record: a frame's pours are a few hundred at most, each
   * rejected in two instructions where it does not reach.
   */
  splatDeltas: `${SPLAT_STRUCT}
@group(0) @binding(1) var<storage, read> splats: array<Splat>;
@group(0) @binding(2) var dye: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var vel: texture_storage_2d<rgba32float, write>;
@group(0) @binding(4) var mul: texture_storage_2d<r32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  // The cell's place on the logical grid, where every radius is measured.
  let p = (vec2f(id.xy) + 0.5) * (A.l / A.n);
  var dyeAcc = vec4f(0.0);
  var velAcc = vec4f(0.0);
  var mulAcc = 1.0;
  for (var i = 0u; i < A.count; i = i + 1u) {
    let s = splats[i];
    let d = splatDist(s, p);
    if (d > s.a.z) { continue; }
    let w = falloff(s.d.y, d, s.a.z);
    if (w <= 0.0) { continue; }
    dyeAcc += s.b * w;
    velAcc += s.c * w;
    mulAcc *= 1.0 - (1.0 - s.d.x) * w;
  }
  textureStore(dye, vec2i(id.xy), dyeAcc);
  textureStore(vel, vec2i(id.xy), velAcc);
  textureStore(mul, vec2i(id.xy), vec4f(mulAcc, 0.0, 0.0, 0.0));
}`,

  /**
   * A picture poured onto the plate, sampled at the plate's own resolution
   * rather than at 192² (`injectImage` in the app, and the text pour through
   * it). The box is the app's: x 0.19–0.81, y 0.31–0.69.
   *
   * A.count is 1 here; the box and the strength ride in the uniform's tail.
   */
  pourImage: `${SPLAT_STRUCT}
@group(0) @binding(1) var<storage, read> splats: array<Splat>;
@group(0) @binding(2) var dye: texture_storage_2d<rgba32float, write>;
@group(0) @binding(3) var src: texture_2d<f32>;
@group(0) @binding(4) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let s = splats[0];
  let box = vec4f(s.a.x, s.a.y, s.a.z, s.a.w);          // x0, y0, x1, y1 in 0..1
  let uv = (vec2f(id.xy) + 0.5) / A.n;
  if (uv.x < box.x || uv.x >= box.z || uv.y < box.y || uv.y >= box.w) {
    textureStore(dye, vec2i(id.xy), vec4f(0.0));
    return;
  }
  var t = (uv - box.xy) / (box.zw - box.xy);
  if (s.d.y > 0.5) { t.y = 1.0 - t.y; }                 // the plate counts up, a picture counts down
  let px = textureSampleLevel(src, lin, t, 0.0);
  if (px.a < 0.05) { textureStore(dye, vec2i(id.xy), vec4f(0.0)); return; }
  // As the app: brighter pixels pour more dye, and the colour becomes an
  // absorption. s.d.x is the strength, s.b.a the floor under it, s.d.y the flip.
  let luma = dot(px.rgb, vec3f(0.299, 0.587, 0.114));
  let amount = (s.b.a + s.d.x * luma) * px.a;
  let eps = vec3f(0.002);
  let absorb = -log(max(px.rgb, eps));
  textureStore(dye, vec2i(id.xy), vec4f(absorb * amount, amount));
}`,

  /** Bilinear from the CPU's 192² delta arrays onto the full grid. */
  upsampleDelta: `${SPLAT_STRUCT}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var dst: texture_storage_2d<DST_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let uv = (vec2f(id.xy) + 0.5) / A.n;
  let p = uv * A.l - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(A.l - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(A.l - 1.0)));
  let a = textureLoad(src, vec2i(lo.x, lo.y), 0);
  let b = textureLoad(src, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(src, vec2i(lo.x, hi.y), 0);
  let d = textureLoad(src, vec2i(hi.x, hi.y), 0);
  textureStore(dst, vec2i(id.xy), mix(mix(a, b, f.x), mix(c, d, f.x), f.y));
}`,
};

/** A splat kernel's source, with its storage format filled in. */
export function splatKernel(name: string, dstFormat = 'rgba32float'): string {
  const src = SPLAT_KERNELS[name];
  if (!src) throw new Error(`no such splat kernel: ${name}`);
  return src.replaceAll('DST_FORMAT', dstFormat);
}
