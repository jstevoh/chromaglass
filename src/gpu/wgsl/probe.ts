/**
 * How bright was the frame that just went to the wall? (docs/webgpu-plan.md,
 * P4.) The WGSL side of `lib/frameProbe.ts`.
 *
 * The WebGL probe has to work for its average: a half-size linear blit, into
 * the corner of a black power-of-two square, reduced by `generateMipmap`,
 * read back through a pixel pack buffer — because a straight blit down to
 * 16×16 samples spots rather than averaging, and a one-pixel line read 7.7
 * times its size on Metal. A compute pass has no such trouble. Every pixel of
 * the delivered frame is summed exactly once, so what comes back is the true
 * mean luminance and a flash counts in proportion to how much of the wall it
 * covers, whatever shape it is.
 *
 * Two dispatches, the shape `wgsl/stats.ts` uses for the plate's own
 * measurements: a fixed number of workgroups each stride over the frame and
 * reduce their share, then one workgroup reduces those partials. The sums
 * stay small until the end, which keeps them accurate in 32-bit floats.
 */

const HEAD = /* wgsl */ `
struct ProbeArgs {
  width: u32,
  height: u32,
  groups: u32,        // how many workgroups the first pass ran
  pad: u32,
};
@group(0) @binding(0) var<uniform> A: ProbeArgs;

const GROUP = 256u;
var<workgroup> sSum: array<f32, 256>;

/** Rec. 709 luminance, on the values the canvas carries — as the GL probe's mean does it. */
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

/** The tree reduction both passes end with. */
fn fold(lid: u32) {
  var s = GROUP / 2u;
  loop {
    if (s == 0u) { break; }
    if (lid < s) { sSum[lid] += sSum[lid + s]; }
    workgroupBarrier();
    s = s / 2u;
  }
}
`;

export const PROBE_KERNELS: Record<string, string> = {
  /** Each workgroup's share of the frame. */
  probeTiles: `${HEAD}
@group(0) @binding(1) var frame: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let total = A.width * A.height;
  let stride = GROUP * A.groups;
  var sum = 0.0;
  var i = gid.x;
  loop {
    if (i >= total) { break; }
    let p = vec2i(i32(i % A.width), i32(i / A.width));
    sum += luma(textureLoad(frame, p, 0).rgb);
    i += stride;
  }
  sSum[lid.x] = sum;
  workgroupBarrier();
  fold(lid.x);
  if (lid.x == 0u) { partials[wid.x] = sSum[0]; }
}`,

  /** The partials into one number: the frame's whole sum, in [0]. */
  probeFold: `${HEAD}
@group(0) @binding(1) var<storage, read> partials: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  var sum = 0.0;
  var i = lid.x;
  loop {
    if (i >= A.groups) { break; }
    sum += partials[i];
    i += GROUP;
  }
  sSum[lid.x] = sum;
  workgroupBarrier();
  fold(lid.x);
  if (lid.x == 0u) { result[0] = sSum[0]; }
}`,
};

/** How many workgroups the first pass runs. */
export const PROBE_GROUPS = 64;

/**
 * White rectangles on black: the picture the probe's self-test measures, so
 * the reduction is checked against a frame whose true mean is known by
 * construction. Each rectangle is drawn as a full-screen triangle confined by
 * the scissor, which is the shortest way to a known area.
 */
export const SOLID_WGSL = /* wgsl */ `
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(p[i], 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0, 1.0, 1.0, 1.0); }
`;
