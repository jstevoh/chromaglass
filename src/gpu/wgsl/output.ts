/**
 * The projector's pass in WGSL (docs/webgpu-plan.md, P3). It was written as
 * the twin of a GLSL pass in `src/lib/outputPass.ts` and proved against it
 * frame for frame by `npm run output`; both were deleted with the WebGL
 * renderer at P7, so this is the only copy and `npm run wall` is what holds
 * it. Comments that once said "see the GLSL for why" have nothing to point
 * at — what is here is the whole of it.
 *
 * What the port changes:
 * - The quad's corners were a vertex buffer rewritten per draw; here they are
 *   two of the per-quad uniforms and the vertex stage builds the two
 *   triangles from `vertex_index`. Nothing is uploaded between draws, which
 *   is what lets every surface go in one instanced draw.
 * - `gl_FragCoord` is `U.resolution.y - pos.y`, as in the camera: the dither
 *   hashes that coordinate and WebGPU counts rows the other way.
 * - The scene is sampled with `1 - src.y` as the GLSL does it. That flip is
 *   about where the upstream pass left the picture, not about the API, and it
 *   stays until the whole chain is WebGPU and the plate is written the way
 *   WebGPU reads it.
 */

import { OUTPUT_STRUCT } from './outputFields';

export const OUTPUT_WGSL = /* wgsl */ `
${OUTPUT_STRUCT}
@group(0) @binding(0) var<uniform> U: Output;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scene: texture_2d<f32>;
// What a surface can show instead of the finished frame (PLAN.md §16b,
// lib/outputConfig.ts SurfaceSource): the front plate alone, the back plate
// alone, the film alone. Each is the plate's display drawn again into its own
// texture, stored the way \`scene\` is, so one sample serves all four. A
// source nobody asked for is bound to \`scene\`, never read.
@group(0) @binding(3) var frontOnly: texture_2d<f32>;
@group(0) @binding(4) var backOnly: texture_2d<f32>;
@group(0) @binding(5) var filmOnly: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) screen: vec2f,      // screen space, y down: where the corners are dragged
  @location(1) @interpolate(flat) quad: u32,
};

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) q: u32) -> VsOut {
  let ab = U.cornerAB[q];
  let cd = U.cornerCD[q];
  var order = array<u32, 6>(0u, 1u, 2u, 0u, 2u, 3u);
  let k = order[v];
  var p = ab.xy;
  if (k == 1u) { p = ab.zw; } else if (k == 2u) { p = cd.xy; } else if (k == 3u) { p = cd.zw; }
  var out: VsOut;
  out.pos = vec4f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
  out.screen = p;
  out.quad = q;
  return out;
}

/** How far inside its shape a point of the unit square is, before feathering. */
fn shapeDepth(shape: i32, q: vec2f) -> f32 {
  if (shape == 1) { return 0.5 - length(q - 0.5); }                     // ellipse
  if (shape == 2) { return q.y * 0.5 - abs(q.x - 0.5); }                // triangle, apex up
  if (shape == 3) { return 0.5 - (abs(q.x - 0.5) + abs(q.y - 0.5)); }   // diamond
  return min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));                 // rect
}

/** Where in its picture surface i shows the local point q (before the texture's own flip). */
fn pictureAt(i: u32, q: vec2f) -> vec2f {
  let s = U.src[i];
  let uv = s.xy + q * s.zw;
  return mix(uv, 1.0 - uv, step(U.flip, vec2f(0.0)));
}

/**
 * How far inside surface j the screen point d is, in j's own space, when j
 * shows the same point of the picture there as uv; 0 outside it, or
 * where it shows another part. Two texels of slack: two tiles lined up by
 * hand agree to about that.
 */
fn samePointDepth(j: u32, d: vec2f, uv: vec2f) -> f32 {
  let w = mat3x3<f32>(U.warpA[j].xyz, U.warpB[j].xyz, U.warpC[j].xyz);
  let p = w * vec3f(d, 1.0);
  if (p.z <= 1e-6) { return 0.0; }
  let q = p.xy / p.z;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return 0.0; }
  let off = abs(pictureAt(j, q) - uv) * U.resolution;
  if (max(off.x, off.y) > 2.0) { return 0.0; }
  return max(0.0, shapeDepth(i32(U.form[j].x), q));
}

// ── The wall test (PLAN.md 8e) ─────────────────────────────────────
//
// What Load-in puts on the wall to line a projector up, drawn here rather
// than upstream so it goes through the same corner pin, flip and blanking as
// the show: a square grid on the wall is a square show. Everything is drawn
// in the quad's own unit square, y down, with the quad's width over height on
// the wall (\`lay.y\`) to keep the grid square and the circle round, and \`px\`,
// the size of one screen pixel in that square, to keep lines a pixel or two
// wide however the quad is pulled.

/** Whether point p of a seven-segment digit's box (0..1, y down; the box 0.6 wide to 1 tall) is lit for n. */
fn segmentLit(n: u32, p: vec2f) -> bool {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { return false; }
  // a b c d e f g as bits 0..6, the standard seven-segment table.
  var lit = array<u32, 10>(0x3fu, 0x06u, 0x5bu, 0x4fu, 0x66u, 0x6du, 0x7du, 0x07u, 0x7fu, 0x6fu);
  let m = lit[min(n, 9u)];
  let t = 0.16;
  let tx = t / 0.6;
  let upper = p.y < 0.5;
  var on = false;
  if ((m & 1u) != 0u && p.y < t) { on = true; }                                        // a
  if ((m & 2u) != 0u && p.x > 1.0 - tx && upper) { on = true; }                         // b
  if ((m & 4u) != 0u && p.x > 1.0 - tx && !upper) { on = true; }                        // c
  if ((m & 8u) != 0u && p.y > 1.0 - t) { on = true; }                                   // d
  if ((m & 16u) != 0u && p.x < tx && !upper) { on = true; }                             // e
  if ((m & 32u) != 0u && p.x < tx && upper) { on = true; }                              // f
  if ((m & 64u) != 0u && abs(p.y - 0.5) < t * 0.5) { on = true; }                       // g
  return on;
}

/** A number of one or two digits, h tall (of the quad's height), centred on c, on a quad aspect wide to 1 tall. */
fn numberLit(n: u32, q: vec2f, c: vec2f, h: f32, aspect: f32) -> bool {
  let w = 0.6 * h / aspect;
  let gap = 0.3 * w;
  let two = n >= 10u;
  let total = select(w, 2.0 * w + gap, two);
  let x0 = c.x - total * 0.5;
  let y = (q.y - (c.y - h * 0.5)) / h;
  if (two) {
    if (segmentLit(n / 10u, vec2f((q.x - x0) / w, y))) { return true; }
    return segmentLit(n % 10u, vec2f((q.x - x0 - w - gap) / w, y));
  }
  return segmentLit(n, vec2f((q.x - x0) / w, y));
}

/** How much of a line \`dist\` pixels away covers this pixel, for a line \`width\` pixels wide. */
fn lineCover(dist: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, dist);
}

/** The test pattern for quad number \`num\` at q, with px the size of a screen pixel in q. */
fn testPattern(q: vec2f, px: vec2f, aspect: f32, num: u32) -> vec3f {
  // A hue of its own per quad, so where two shapes or two beams overlap
  // each one's lines can be told apart.
  let h = fract(f32(num) * 0.618034);
  let tint = clamp(abs(fract(vec3f(h) + vec3f(0.0, 0.6667, 0.3333)) * 6.0 - 3.0) - 1.0, vec3f(0.0), vec3f(1.0));
  let line = mix(vec3f(1.0), tint, 0.5);
  var col = vec3f(0.03);
  // The grid: eight columns, and as many rows as keep its cells square.
  let cols = 8.0;
  let rows = max(1.0, round(cols / max(aspect, 0.05)));
  let gx = abs(fract(q.x * cols + 0.5) - 0.5) / (cols * px.x);
  let gy = abs(fract(q.y * rows + 0.5) - 0.5) / (rows * px.y);
  col = mix(col, line * 0.55, lineCover(min(gx, gy), 1.5));
  // The centre cross, brighter.
  let cx = abs(q.x - 0.5) / px.x;
  let cy = abs(q.y - 0.5) / px.y;
  col = mix(col, line, lineCover(min(cx, cy), 2.0));
  // Both diagonals, corner to corner: on the wall they meet at the quad's
  // true middle, which a keystone moves off the centre cross.
  let pxd = length(px);
  let d1 = abs(q.x - q.y) / pxd;
  let d2 = abs(q.x + q.y - 1.0) / pxd;
  col = mix(col, line * 0.8, lineCover(min(d1, d2) * 0.7071, 1.5));
  // A circle 0.8 of the height across: round on the wall when the pin is right.
  let c = vec2f((q.x - 0.5) * aspect, q.y - 0.5);
  let dc = abs(length(c) - 0.4) / px.y;
  col = mix(col, vec3f(1.0), lineCover(dc, 2.0));
  // The border, inside the edge, white.
  let bx = min(q.x, 1.0 - q.x) / px.x;
  let by = min(q.y, 1.0 - q.y) / px.y;
  col = mix(col, vec3f(1.0), lineCover(min(bx, by), 4.0));
  // The corners numbered as the pin's handles are: 1 top left, clockwise.
  let ch = 0.08;
  let inx = 0.05 / aspect + 0.3 * ch / aspect;
  let iny = 0.05 + ch * 0.5;
  if (numberLit(1u, q, vec2f(inx, iny), ch, aspect)
      || numberLit(2u, q, vec2f(1.0 - inx, iny), ch, aspect)
      || numberLit(3u, q, vec2f(1.0 - inx, 1.0 - iny), ch, aspect)
      || numberLit(4u, q, vec2f(inx, 1.0 - iny), ch, aspect)) {
    col = vec3f(1.0);
  }
  // And its own number in the middle, over the cross, white like the corners'.
  if (numberLit(num, q, vec2f(0.5, 0.5), 0.14, aspect)) { col = vec3f(1.0); }
  return col;
}

fn dhash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let i = in.quad;
  let d = in.screen;

  // ── Corner pin ───────────────────────────────────────────────────
  let warp = mat3x3<f32>(U.warpA[i].xyz, U.warpB[i].xyz, U.warpC[i].xyz);
  let p = warp * vec3f(d, 1.0);
  // A screen pixel's size in the quad's square, for the test pattern's
  // lines. Taken here, before anything discards, where derivatives are
  // still defined for the whole quad of pixels.
  let px = max(fwidth(p.xy / max(p.z, 1e-6)), vec2f(1e-6));
  if (p.z <= 1e-6) { discard; }
  let q = p.xy / p.z;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { discard; }

  // ── Shape ────────────────────────────────────────────────────────
  let form = U.form[i];
  let sa = smoothstep(0.0, max(form.y, 1e-4), shapeDepth(i32(form.x), q));
  if (sa <= 0.0) { discard; }

  let srcUv = pictureAt(i, q);

  // form.w is the surface's source: 0 the wall, 1 front, 2 back, 3 film.
  let at = vec2f(srcUv.x, 1.0 - srcUv.y);
  let which = i32(form.w + 0.5);
  var col = textureSampleLevel(scene, samp, at, 0.0).rgb;
  if (which == 1) { col = textureSampleLevel(frontOnly, samp, at, 0.0).rgb; }
  else if (which == 2) { col = textureSampleLevel(backOnly, samp, at, 0.0).rgb; }
  else if (which == 3) { col = textureSampleLevel(filmOnly, samp, at, 0.0).rgb; }

  // ── Blanking ─────────────────────────────────────────────────────
  let fe = max(U.feather, 1e-4);
  let m = smoothstep(0.0, fe, d.y - U.mask.x)
        * smoothstep(0.0, fe, (1.0 - U.mask.y) - d.x)
        * smoothstep(0.0, fe, (1.0 - U.mask.z) - d.y)
        * smoothstep(0.0, fe, d.x - U.mask.w);

  // ── Grade ────────────────────────────────────────────────────────
  col = pow(max(col * U.gain, vec3f(0.0)), vec3f(U.gamma)) * m;

  // ── The wall test (PLAN.md 8e) ───────────────────────────────────
  // In picture space, flipped as the picture is, so it lands on the wall
  // exactly as the show does. Not graded: a test pattern is a known level.
  if (U.test.x > 0.5 || U.test.y > 0.0) {
    let pq = mix(q, 1.0 - q, step(U.flip, vec2f(0.0)));
    let aspect = max(U.lay[i].y, 0.05);
    let num = u32(U.lay[i].z + 0.5);
    if (U.test.x > 0.5) { col = testPattern(pq, px, aspect, num) * m; }
    if (U.test.y > 0.0 && numberLit(num, pq, vec2f(0.5, 0.5), 0.5, aspect)) {
      col = mix(col, vec3f(1.0), U.test.y * m);
    }
  }
  let frag = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  let dth = dhash(frag) + dhash(frag + vec2f(17.31, 5.73)) - 1.0;
  col += dth * step(1.0 / 255.0, max(col.r, max(col.g, col.b))) / 255.0;

  // ── Over, or a beam (§16c) ───────────────────────────────────────
  // Premultiplied, so clamped first: the target clamps what a shader
  // returns before it blends, and a colour over 1 (the output's gain goes
  // to 3) scaled by its coverage after that clamp is what every surface
  // always drew. Scaled before it, a surface at half opacity and gain 3
  // came out near white where it had been mid-grey (npm run beams).
  col = clamp(col, vec3f(0.0), vec3f(1.0));
  // Laid over: the colour at its coverage and that coverage taken from what
  // is under it, the blend every surface always had.
  let cover = sa * form.z;
  if (U.lay[i].x < 0.5) { return vec4f(col * cover, cover); }
  /*
    A beam adds its light, taking nothing away. Two beams crossing are two
    pictures meeting, and add whole: that overlap is the instrument. Except
    where they are one picture carried by two projectors: the same source,
    showing the same point of it there (tiles laid edge to edge with an
    overlap). There each gives the overlap the share of how far inside it
    the point is against how far inside all of them it is: its share falls
    to nothing at its own edge as the other's rises, and the shares sum to
    one wherever they cross, whatever the width of the overlap. That is
    what lets two tiles meet with no bright seam (two full beams: twice the
    light) and no dark one (two feathers over each other: each short of
    full where they meet). The feather then shapes only the edges no other
    beam of the picture covers: the reach is the fullest of the beams at
    this point, so it is one inside any of them and falls off only past the
    last. Two beams of one source showing different parts of it are two
    pictures, and add.
  */
  var total = 0.0;
  var reach = 0.0;
  let count = u32(U.quads + 0.5);
  for (var j = 0u; j < count; j++) {
    if (U.lay[j].x < 0.5 || abs(U.form[j].w - form.w) > 0.5) { continue; }
    let dj = samePointDepth(j, d, srcUv);
    if (dj <= 0.0) { continue; }
    total += dj;
    reach = max(reach, smoothstep(0.0, max(U.form[j].y, 1e-4), dj));
  }
  let own = max(0.0, shapeDepth(i32(form.x), q));
  let share = select(1.0, own / total, total > 0.0);
  return vec4f(col * share * reach * form.z, 0.0);
}
`;
