/**
 * What the CPU needs to know about the plate, worked out on the GPU
 * (docs/webgpu-plan.md, P2).
 *
 * Four of the five things the app reads the whole field for are summaries:
 * how much dye there is (the evaporation regulator and the current pass both
 * want the mean), what colour the plate is on average (the text pour picks a
 * contrasting ink), whether there is anything on the plate at all, and how
 * fast the fastest part of it is moving (the macro detail pass). Bringing a
 * megabyte back to answer them is the wrong shape; this brings 32 bytes.
 *
 * Two dispatches: a fixed number of workgroups each stride over the field and
 * reduce their share, then one workgroup reduces those partials. The sums
 * stay small until the end, which keeps them accurate in 32-bit floats.
 */

const HEAD = /* wgsl */ `
struct StatsArgs {
  n: f32,              // the grid
  groups: u32,         // how many workgroups the first pass ran
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> A: StatsArgs;

const GROUP = 256u;
var<workgroup> sSum: array<vec4f, 256>;
var<workgroup> sPeak: array<vec4f, 256>;

/** The tree reduction both passes end with. */
fn fold(lid: u32) {
  var s = GROUP / 2u;
  loop {
    if (s == 0u) { break; }
    if (lid < s) {
      sSum[lid] += sSum[lid + s];
      sPeak[lid] = max(sPeak[lid], sPeak[lid + s]);
    }
    workgroupBarrier();
    s = s / 2u;
  }
}
`;

export const STATS_KERNELS: Record<string, string> = {
  /** Each workgroup's share of the plate: the sum of the dye, and the peaks. */
  statsTiles: `${HEAD}
@group(0) @binding(1) var dye: texture_2d<f32>;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> partials: array<vec4f>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let n = u32(A.n);
  let total = n * n;
  let stride = GROUP * A.groups;
  var sum = vec4f(0.0);
  var peak = vec4f(0.0);
  var i = gid.x;
  loop {
    if (i >= total) { break; }
    let p = vec2i(i32(i % n), i32(i / n));
    let d = textureLoad(dye, p, 0);
    let v = textureLoad(vel, p, 0);
    sum += d;
    peak = max(peak, vec4f(d.a, abs(v.x), abs(v.y), length(v.xy)));
    i += stride;
  }
  sSum[lid.x] = sum;
  sPeak[lid.x] = peak;
  workgroupBarrier();
  fold(lid.x);
  if (lid.x == 0u) {
    partials[wid.x * 2u] = sSum[0];
    partials[wid.x * 2u + 1u] = sPeak[0];
  }
}`,

  /** The partials into one answer: sum in [0], peaks in [1]. */
  statsFold: `${HEAD}
@group(0) @binding(1) var<storage, read> partials: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> result: array<vec4f>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  var sum = vec4f(0.0);
  var peak = vec4f(0.0);
  var i = lid.x;
  loop {
    if (i >= A.groups) { break; }
    sum += partials[i * 2u];
    peak = max(peak, partials[i * 2u + 1u]);
    i += GROUP;
  }
  sSum[lid.x] = sum;
  sPeak[lid.x] = peak;
  workgroupBarrier();
  fold(lid.x);
  if (lid.x == 0u) {
    result[0] = sSum[0];
    result[1] = sPeak[0];
  }
}`,
};

/** How many workgroups the first pass runs. */
export const STATS_GROUPS = 64;
