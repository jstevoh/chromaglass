/**
 * Each projector's focus on the wall (PLAN 51b), the shaders of
 * `gpu/focus.ts`. The law is `lib/projectorFocus.ts`: a defocused point
 * spreads into the lamp's image, a filled bar, so the blur is a uniform box,
 * `U.projFocus` its half-widths in pixels (A's x, y; B's x, y).
 *
 * Two passes, because a box is separable: a bar's light is its rows' light
 * summed down its columns, and a box of 60 by 30 pixels is 90 taps this way
 * where it is 1,800 at once.
 *
 * - `rows`: the plate's finished picture (display values, unfinished: the
 *   finish is laid after the blur, so the logo and the dither stay sharp),
 *   turned to linear light and split between the projectors by B's share
 *   (the display's third output, wgsl/projectors.ts `noteShare`), each
 *   averaged along x over its own box. A's into the first target, B's into
 *   the second when there are two.
 * - `cols`: each averaged along y over its own box, the two added (light
 *   adds), back to display values, and the finish the display would have laid
 *   (`U.lensFinish`, which fillPlateUniforms sets to it, as for the lens pass).
 *
 * The taps. A box of half-width h is ceil(h) + 1 bilinear taps (FOCUS_TAPS at
 * most), laid evenly across it, each a tent two pixels wide: so they are
 * under two pixels apart up to h = FOCUS_TAPS − 1 and the box is whole, and
 * a box under a pixel wide still takes two (one tap would be no blur). Every tap weighs
 * the same, so the light is kept: a blurred cell is a glow. There is no
 * noise in it, and nothing moves from frame to frame but the picture: a
 * jittered tap pattern would make the melt shimmer, the one thing the owner
 * asks the visuals not to do.
 *
 * A melt at a smaller picture (PLAN 51b-3, 51c). Two projectors melted on a
 * 1600-square frame took 19.6 ms a draw on the Air, against 8.6 sharp: the
 * passes read 128 taps a pixel at full size for a picture with nothing in it
 * finer than its box. So once every soft projector's box is wide enough
 * (`focusScale`, lib/projectorFocus.ts: its short side at least LOW_MIN_PX
 * pixels of the smaller picture), the light is first taken down to a half, a
 * quarter, an eighth or a sixteenth of the frame's size by `down`, each small pixel the mean of the
 * light of the d × d it covers, in linear light and split by B's share, so
 * nothing is lost or mixed; `lowRows` and `lowCols` box it there, A's and B's
 * added; and `compose` draws it back at full size through one bilinear tap
 * and lays the finish. The box over a smooth picture has nothing at the small
 * picture's pixel scale to alias, so this is the same blur at a sixteenth of
 * the taps, not a coarser one. A projector sharp beside a melted one is not
 * taken down (that would soften it by the small pixel): `compose` adds its
 * light straight from the full-size picture. The taps stay under two small
 * pixels apart up to a half-width of FOCUS_TAPS − 1 of them, so a melt of a
 * tenth of a 2560-wide frame (128 pixels, 32 at a quarter) is whole, and a
 * dissolve's glow there (320 pixels, 20 at a sixteenth).
 */

import { PLATE_STRUCT } from './plateFields';
import { FINISH_WGSL } from './plate';

/** The most bilinear taps along one axis, for one projector. */
export const FOCUS_TAPS = 32;
/** Below this half-width, in pixels, a projector is sharp: one tap. */
const SHARP = 0.5;

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

const HEAD = /* wgsl */ `
${PLATE_STRUCT}
@group(0) @binding(0) var<uniform> U: Plate;
@group(0) @binding(1) var samp: sampler;
fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }
fn toLinear(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
fn toDisplay(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }
/* How many taps a box of half-width h takes, and where the i-th lies (pixels from the middle). */
fn tapsOf(h: f32) -> f32 { return select(clamp(ceil(h) + 1.0, 2.0, ${f(FOCUS_TAPS)}), 1.0, h < ${f(SHARP)}); }
fn tapAt(i: f32, n: f32, h: f32) -> f32 { return select((-1.0 + (2.0 * i + 1.0) / n) * h, 0.0, n < 1.5); }
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};
override FLIP_Y: f32 = 1.0;
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  out.uv = xy * 0.5 + 0.5;
  return out;
}
`;

/* Along x, each projector's light over its own box. Drawn flipped, as the scene was, so a uv is the same row in both. */
export const ROWS_WGSL = /* wgsl */ `${HEAD}
@group(0) @binding(2) var scene: texture_2d<f32>;
@group(0) @binding(3) var share: texture_2d<f32>;
struct Rows {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
};
/* One projector's light along a row: B's share of it (b 1), or what is left (b 0, A's). */
fn row(uv: vec2f, h: f32, b: f32) -> vec3f {
  let n = tapsOf(h);
  let dx = 1.0 / U.resolution.x;
  var sum = vec3f(0.0);
  for (var i = 0.0; i < n; i += 1.0) {
    let at = uv + vec2f(tapAt(i, n, h) * dx, 0.0);
    // One projector: no share to read (it is 0, all A's), half the reads of a row.
    var s = vec3f(0.0);
    if (U.projA.w > 0.5) { s = tex2(share, at).rgb; }
    sum += toLinear(tex2(scene, at).rgb) * mix(vec3f(1.0) - s, s, b);
  }
  return sum / n;
}
@fragment fn fs(in: VsOut) -> Rows {
  var o: Rows;
  o.a = vec4f(row(in.uv, U.projFocus.x, 0.0), 1.0);
  o.b = vec4f(0.0, 0.0, 0.0, 1.0);
  if (U.projA.w > 0.5) { o.b = vec4f(row(in.uv, U.projFocus.z, 1.0), 1.0); }
  return o;
}
`;

/* Down y, each over its own box, added, and finished. */
export const COLS_WGSL = /* wgsl */ `${HEAD}
@group(0) @binding(2) var rowsA: texture_2d<f32>;
@group(0) @binding(3) var rowsB: texture_2d<f32>;
@group(0) @binding(4) var markTex: texture_2d<f32>;
${FINISH_WGSL}
fn col(t: texture_2d<f32>, uv: vec2f, h: f32) -> vec3f {
  let n = tapsOf(h);
  let dy = 1.0 / U.resolution.y;
  var sum = vec3f(0.0);
  for (var i = 0.0; i < n; i += 1.0) { sum += tex2(t, uv + vec2f(0.0, tapAt(i, n, h) * dy)).rgb; }
  return sum / n;
}
@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  var lin = col(rowsA, uv, U.projFocus.y);
  if (U.projA.w > 0.5) { lin += col(rowsB, uv, U.projFocus.w); }
  let shown = toDisplay(lin);
  let fragGl = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  if (U.lensFinish == 1) { return finishFrame(shown, uv, fragGl, markTex); }
  if (U.lensFinish == 2) { return ditherOut(shown, fragGl); }
  return vec4f(shown, 1.0);
}
`;

/* Down to a d-th of the frame's size (SCALE, 2, 4, 8 or 16): each small pixel the mean light of the d × d it covers, A's and B's apart. */
export const DOWN_WGSL = /* wgsl */ `${HEAD}
override SCALE: f32 = 2.0;
@group(0) @binding(2) var scene: texture_2d<f32>;
@group(0) @binding(3) var share: texture_2d<f32>;
struct Low {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
};
@fragment fn fs(in: VsOut) -> Low {
  let d = i32(SCALE);
  let corner = vec2i(floor(in.pos.xy)) * d;
  let last = vec2i(textureDimensions(scene)) - vec2i(1);
  let two = U.projA.w > 0.5;
  var a = vec3f(0.0);
  var b = vec3f(0.0);
  for (var y = 0; y < d; y++) {
    for (var x = 0; x < d; x++) {
      let p = min(corner + vec2i(x, y), last);
      let l = toLinear(textureLoad(scene, p, 0).rgb);
      var s = vec3f(0.0);
      if (two) { s = textureLoad(share, p, 0).rgb; }
      a += l * (vec3f(1.0) - s);
      b += l * s;
    }
  }
  let n = SCALE * SCALE;
  var o: Low;
  o.a = vec4f(a / n, 1.0);
  o.b = vec4f(b / n, 1.0);
  return o;
}
`;

/* The small picture's scale, from the frame's size over its own (a ceil of the frame over d, so rounded). */
const LOW_HEAD = /* wgsl */ `${HEAD}
fn scaleOf(t: texture_2d<f32>) -> f32 { return round(U.resolution.x / f32(textureDimensions(t).x)); }
fn soft(h: f32) -> bool { return h >= ${f(SHARP)}; }
fn boxAlong(t: texture_2d<f32>, uv: vec2f, h: f32, step: vec2f) -> vec3f {
  let n = tapsOf(h);
  var sum = vec3f(0.0);
  for (var i = 0.0; i < n; i += 1.0) { sum += tex2(t, uv + tapAt(i, n, h) * step).rgb; }
  return sum / n;
}
`;

/* Along x on the small picture, each projector over its own box in small pixels. A sharp projector is left out: compose lays it at full size. */
export const LOW_ROWS_WGSL = /* wgsl */ `${LOW_HEAD}
@group(0) @binding(2) var lowA: texture_2d<f32>;
@group(0) @binding(3) var lowB: texture_2d<f32>;
struct Rows {
  @location(0) a: vec4f,
  @location(1) b: vec4f,
};
@fragment fn fs(in: VsOut) -> Rows {
  let k = scaleOf(lowA);
  let step = vec2f(1.0 / f32(textureDimensions(lowA).x), 0.0);
  var o: Rows;
  o.a = vec4f(0.0, 0.0, 0.0, 1.0);
  o.b = vec4f(0.0, 0.0, 0.0, 1.0);
  if (soft(U.projFocus.x)) { o.a = vec4f(boxAlong(lowA, in.uv, U.projFocus.x / k, step), 1.0); }
  if (U.projA.w > 0.5 && soft(U.projFocus.z)) { o.b = vec4f(boxAlong(lowB, in.uv, U.projFocus.z / k, step), 1.0); }
  return o;
}
`;

/* Down y on the small picture, each over its own box, the soft ones added (light adds). */
export const LOW_COLS_WGSL = /* wgsl */ `${LOW_HEAD}
@group(0) @binding(2) var rowsA: texture_2d<f32>;
@group(0) @binding(3) var rowsB: texture_2d<f32>;
@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let k = scaleOf(rowsA);
  let step = vec2f(0.0, 1.0 / f32(textureDimensions(rowsA).y));
  var lin = vec3f(0.0);
  if (soft(U.projFocus.x)) { lin += boxAlong(rowsA, in.uv, U.projFocus.y / k, step); }
  if (U.projA.w > 0.5 && soft(U.projFocus.z)) { lin += boxAlong(rowsB, in.uv, U.projFocus.w / k, step); }
  return vec4f(lin, 1.0);
}
`;

/* Back at full size: the small wall through one bilinear tap, a sharp projector's light straight from the full picture, and the finish. */
export const COMPOSE_WGSL = /* wgsl */ `${LOW_HEAD}
@group(0) @binding(2) var wall: texture_2d<f32>;
@group(0) @binding(3) var scene: texture_2d<f32>;
@group(0) @binding(4) var share: texture_2d<f32>;
@group(0) @binding(5) var markTex: texture_2d<f32>;
${FINISH_WGSL}
@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  // The small picture covers a whole number of its pixels, a little past the frame's edge when the frame is not a multiple of them.
  let k = scaleOf(wall);
  var lin = tex2(wall, uv * U.resolution.xy / (k * vec2f(textureDimensions(wall)))).rgb;
  let two = U.projA.w > 0.5;
  let sharpA = !soft(U.projFocus.x);
  let sharpB = two && !soft(U.projFocus.z);
  if (sharpA || sharpB) {
    let l = toLinear(tex2(scene, uv).rgb);
    var s = vec3f(0.0);
    if (two) { s = tex2(share, uv).rgb; }
    if (sharpA) { lin += l * (vec3f(1.0) - s); }
    if (sharpB) { lin += l * s; }
  }
  let shown = toDisplay(lin);
  let fragGl = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  if (U.lensFinish == 1) { return finishFrame(shown, uv, fragGl, markTex); }
  if (U.lensFinish == 2) { return ditherOut(shown, fragGl); }
  return vec4f(shown, 1.0);
}
`;
