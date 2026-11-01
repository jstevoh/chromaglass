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
 * One dispatch of 64 workgroups on an 8×8 grid of tiles (14r): each workgroup
 * strides over its tile's pixels, decodes sRGB to linear light (14i-guard),
 * and writes its tile's linear R, G, B sums together with the tile's pixel
 * count (`vec4f(sumR, sumG, sumB, pixels)`). The sums stay small within each
 * tile, keeping them accurate in 32-bit floats, and the guard derives whole-
 * wall and quarter-wall relative luminance and saturated-red excursions from
 * the tile sums and pixel counts.
 */

const HEAD = /* wgsl */ `
struct ProbeArgs {
  width: u32,
  height: u32,
  groups: u32,        // how many workgroups the pass runs (8x8 = 64 tiles)
  pad: u32,
};
@group(0) @binding(0) var<uniform> A: ProbeArgs;

const GROUP = 256u;
var<workgroup> sSum: array<vec3f, 256>;

/** Exact IEC 61966-2-1 sRGB transfer curve to linear light, per channel (0..1). */
fn srgbToLinear(c: vec3f) -> vec3f {
  let x = clamp(c, vec3f(0.0), vec3f(1.0));
  let lo = x / 12.92;
  let hi = pow((x + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(hi, lo, x <= vec3f(0.04045));
}

/** Rec. 709 relative luminance on linear light (14i-guard), decoded from the sRGB canvas. */
fn luma(c: vec3f) -> f32 { return dot(srgbToLinear(c), vec3f(0.2126, 0.7152, 0.0722)); }

/** The workgroup tree reduction over linear RGB sums. */
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
  /** Each workgroup's tile on the 8x8 grid: linear R, G, B sums and pixel count. */
  probeTiles: `${HEAD}
@group(0) @binding(1) var frame: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> partials: array<vec4f>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u, @builtin(workgroup_id) wid: vec3u) {
  let cols = 8u;
  let rows = 8u;
  let tx = wid.x % cols;
  let ty = wid.x / cols;
  let x0 = (tx * A.width) / cols;
  let x1 = ((tx + 1u) * A.width) / cols;
  let y0 = (ty * A.height) / rows;
  let y1 = ((ty + 1u) * A.height) / rows;
  let tw = x1 - x0;
  let th = y1 - y0;
  let tilePixels = tw * th;
  var sum = vec3f(0.0);
  var i = lid.x;
  loop {
    if (i >= tilePixels) { break; }
    let p = vec2i(i32(x0 + (i % tw)), i32(y0 + (i / tw)));
    sum += srgbToLinear(textureLoad(frame, p, 0).rgb);
    i += GROUP;
  }
  sSum[lid.x] = sum;
  workgroupBarrier();
  fold(lid.x);
  if (lid.x == 0u) {
    partials[wid.x] = vec4f(sSum[0], f32(tilePixels));
  }
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
