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

import { DYE_ABSORBANCE_WGSL } from '../../lib/dye';
import { VIDEO_LUMA, VIDEO_KEY, VIDEO_DYE, VIDEO_CHANGE, VIDEO_GRAD2, VIDEO_FLOW } from '../../lib/videoFlow';

/** A literal WGSL reads as an f32 whatever the number. */
const f = (x: number) => (Number.isInteger(x) ? `${x}.0` : `${x}`);

const SPLAT_STRUCT = /* wgsl */ `
struct Splat {
  // x, y and radius in logical cells; w is the kind: 0 disc, 1 line.
  a: vec4f,
  // What it deposits: the dye's absorbance (lib/dye.ts) × amount in rgb, density in a.
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
${DYE_ABSORBANCE_WGSL}
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
  let absorb = dyeAbsorbance(px.rgb);
  textureStore(dye, vec2i(id.xy), vec4f(absorb * amount, amount));
}`,

  /** Bilinear from the CPU's 192² delta arrays onto the full grid. */
  upsampleDelta: upsample(false),

  /**
   * The same, of the CPU's deltas and the video pour's added (PLAN 14ab-2):
   * the step that takes the CPU's writes takes the video's frames since the
   * last step with them, as when the pour wrote into the CPU's arrays. The
   * bilinear is linear, so the sum's is the sum of each one's.
   */
  upsampleDeltaSum: upsample(true),

  /**
   * The video pour's frame, drawn at the logical grid (PLAN 14ab-2). The app
   * drew it into a 192² canvas and read it back; here the frame is a texture
   * at the video's own size and each cell is the mean of a few bilinear taps
   * over its footprint, up to four a side, so a 1280-wide frame is not read
   * at one point in every six or seven and its fine detail does not alias into
   * motion that is not there. A frame already at the grid's size takes one tap
   * at each texel's centre, its own value. Rows as the frame's, counting down,
   * as the canvas's were: the loop laid them on the grid's rows as they came.
   *
   * Stored as 8 bits, as the canvas's bytes were, so the thresholds below see
   * the same numbers the loop did.
   */
  videoSample: `${SPLAT_STRUCT}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var lin: sampler;
@group(0) @binding(3) var dst: texture_storage_2d<rgba8unorm, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.l) || id.y >= u32(A.l)) { return; }
  let taps = vec2u(clamp(ceil(vec2f(textureDimensions(src)) / A.l), vec2f(1.0), vec2f(4.0)));
  var acc = vec4f(0.0);
  for (var j = 0u; j < taps.y; j = j + 1u) {
    for (var i = 0u; i < taps.x; i = i + 1u) {
      let uv = (vec2f(id.xy) + (vec2f(f32(i), f32(j)) + 0.5) / vec2f(taps)) / A.l;
      acc += textureSampleLevel(src, lin, uv, 0.0);
    }
  }
  textureStore(dst, vec2i(id.xy), acc / f32(taps.x * taps.y));
}`,

  /**
   * The video pour's deltas from its frame and the last (PLAN 14ab-2): the
   * loop in lib/videoFlow.ts, a cell a thread, its numbers interpolated from
   * there. A.count carries two flags: 1, `prev` holds the last frame (a first
   * frame pours dye and no flow); 2, `dyeIn` and `velIn` hold frames the step
   * has not taken yet, which this one adds to, as the loop's writes summed in
   * the CPU's arrays until the step flushed them.
   */
  videoFlow: `${SPLAT_STRUCT}
${DYE_ABSORBANCE_WGSL}
@group(0) @binding(1) var cur: texture_2d<f32>;
@group(0) @binding(2) var prev: texture_2d<f32>;
@group(0) @binding(3) var dyeIn: texture_2d<f32>;
@group(0) @binding(4) var velIn: texture_2d<f32>;
@group(0) @binding(5) var dyeOut: texture_storage_2d<rgba32float, write>;
@group(0) @binding(6) var velOut: texture_storage_2d<rgba32float, write>;
const LUMA = vec3f(${f(VIDEO_LUMA[0])}, ${f(VIDEO_LUMA[1])}, ${f(VIDEO_LUMA[2])});
// The canvas's bytes, 0..255, as whole numbers.
fn pixel(t: texture_2d<f32>, p: vec2i) -> vec3f { return round(textureLoad(t, p, 0).rgb * 255.0); }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(A.l);
  if (id.x >= n || id.y >= n) { return; }
  let p = vec2i(id.xy);
  var dye = vec4f(0.0);
  var vel = vec4f(0.0);
  if ((A.count & 2u) != 0u) { dye = textureLoad(dyeIn, p, 0); vel = textureLoad(velIn, p, 0); }
  if (id.x >= 1u && id.y >= 1u && id.x + 1u < n && id.y + 1u < n) {
    let c = pixel(cur, p);
    let l = dot(c, LUMA);
    if (l > ${f(VIDEO_KEY)}) {
      let amount = l / 255.0 * ${f(VIDEO_DYE)};
      dye += vec4f(dyeAbsorbance(c / 255.0) * amount, amount);
    }
    if ((A.count & 1u) != 0u) {
      let diff = l - dot(pixel(prev, p), LUMA);
      if (abs(diff) > ${f(VIDEO_CHANGE)}) {
        let gx = dot(pixel(cur, p + vec2i(1, 0)), LUMA) - dot(pixel(cur, p - vec2i(1, 0)), LUMA);
        let gy = dot(pixel(cur, p + vec2i(0, 1)), LUMA) - dot(pixel(cur, p - vec2i(0, 1)), LUMA);
        let g2 = gx * gx + gy * gy;
        if (g2 > ${f(VIDEO_GRAD2)}) { vel += vec4f(-diff * gx / g2 * ${f(VIDEO_FLOW)}, -diff * gy / g2 * ${f(VIDEO_FLOW)}, 0.0, 0.0); }
      }
    }
  }
  textureStore(dyeOut, p, dye);
  textureStore(velOut, p, vel);
}`,
};

/** The upsample's source, of one delta grid or (`sum`) of two added. */
function upsample(sum: boolean): string {
  const at = (q: string) => (sum ? `(textureLoad(src, ${q}, 0) + textureLoad(more, ${q}, 0))` : `textureLoad(src, ${q}, 0)`);
  return `${SPLAT_STRUCT}
@group(0) @binding(1) var src: texture_2d<f32>;
${sum ? '@group(0) @binding(2) var more: texture_2d<f32>;\n' : ''}@group(0) @binding(${sum ? 3 : 2}) var dst: texture_storage_2d<DST_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let uv = (vec2f(id.xy) + 0.5) / A.n;
  let p = uv * A.l - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(A.l - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(A.l - 1.0)));
  let a = ${at('vec2i(lo.x, lo.y)')};
  let b = ${at('vec2i(hi.x, lo.y)')};
  let c = ${at('vec2i(lo.x, hi.y)')};
  let d = ${at('vec2i(hi.x, hi.y)')};
  textureStore(dst, vec2i(id.xy), mix(mix(a, b, f.x), mix(c, d, f.x), f.y));
}`;
}

/** `splatKernel`'s answers, kept: the reason is `kernel`'s, in wgsl/fluid.ts. */
const formatted = new Map<string, Map<string, { src: string; out: string }>>();

/** A splat kernel's source, with its storage format filled in. */
export function splatKernel(name: string, dstFormat = 'rgba32float'): string {
  const src = SPLAT_KERNELS[name];
  if (!src) throw new Error(`no such splat kernel: ${name}`);
  let byFormat = formatted.get(name);
  if (!byFormat) { byFormat = new Map(); formatted.set(name, byFormat); }
  const hit = byFormat.get(dstFormat);
  if (hit && hit.src === src) return hit.out;
  const out = src.replaceAll('DST_FORMAT', dstFormat);
  byFormat.set(dstFormat, { src, out });
  return out;
}
