/**
 * The closeup's fine dye (PLAN 47a-1, 47a): the dye carried over the
 * camera's window at about two screen pixels a texel, through the solver's
 * own velocity, with no diffusion; and the detail it holds below a solver
 * cell, which the plate adds to the grid's dye (`fineDye.ts` says why, and
 * `wgsl/fineWindow.ts` how the plate reads it).
 *
 * Three kernels, each over a texture of the window:
 *
 * - `FINE_ADVECT_WGSL` carries both fine fields one step. Semi-Lagrangian,
 *   as the solver's dye is, but read back through a *clamped* Catmull-Rom
 *   rather than a bilinear: the bilinear read is what smears the grid's dye
 *   a little every step (a numerical diffusion of about a cell's width over
 *   a few hundred steps), and the clamped cubic is sharp without the ringing
 *   an unclamped one adds at every edge. A field due to be born again takes
 *   the grid's dye where it is now; dye carried in from past the window's
 *   edge is the grid's dye there, which is all anyone knows of it.
 * - `FINE_REDUCE_WGSL` averages each fine field over blocks a solver cell
 *   across: what the grid could hold of it.
 * - `FINE_DETAIL_WGSL` scales each fine field so its mean round each cell
 *   has the grid's thickness, blends the two by their weights, and hands the
 *   plate the result as a ratio to the grid's dye: the plate's own dye still
 *   says how much there is at every scale it holds, and the fine dye only
 *   what lies below a cell and what colour it is there.
 */

import { layOut, wgslStruct, type Field } from '../uniforms';

/** What the three kernels are told. Windows are fluid uv: centre, half size, and the screen-to-fluid turn. */
export const FINE_FIELDS: Field[] = [
  { name: 'newWin', type: 'vec4f', note: 'the window this step writes: centre, half size' },
  { name: 'newTurn', type: 'vec4f', note: 'its cos, sin; and the texture size, texels' },
  { name: 'oldWin', type: 'vec4f', note: 'the window the fields were left in by the step before' },
  { name: 'oldTurn', type: 'vec4f', note: 'its cos, sin; zw unused' },
  { name: 'grid', type: 'f32', note: 'the solver grid edge, cells' },
  { name: 'disp', type: 'f32', note: 'uv a unit of velocity moves the dye this step (stepDisplacement)' },
  { name: 'reseed0', type: 'f32', note: '1 when field 0 is born again from the grid this step' },
  { name: 'reseed1', type: 'f32' },
  { name: 'block', type: 'f32', note: 'window texels a solver cell spans, whole' },
  { name: 'lx', type: 'f32', note: 'the block averages, texels' },
  { name: 'ly', type: 'f32' },
  { name: 'w0', type: 'f32', note: "field 0's weight in the detail" },
  { name: 'w1', type: 'f32' },
];

export const FINE_LAYOUT = layOut(FINE_FIELDS);
const STRUCT = wgslStruct('Fine', FINE_LAYOUT);

/**
 * Catmull-Rom over `textureLoad`, at `q` in the texture's own 0..1, for a
 * texture `n` texels across. Loads, because neither the solver's dye (which
 * may be 32-bit float) nor a storage-written texture needs a filtering
 * sampler that way. `clampIt` holds the answer inside the four nearest
 * texels, which is what keeps a carried edge sharp and never overshooting:
 * an overshoot carried for a few hundred steps grows into a ripple beside
 * every line.
 */
const SAMPLE = /* wgsl */ `
fn crw(t: f32) -> vec4f {
  return vec4f(t * (-0.5 + t * (1.0 - 0.5 * t)),
               1.0 + t * t * (-2.5 + 1.5 * t),
               t * (0.5 + t * (2.0 - 1.5 * t)),
               t * t * (-0.5 + 0.5 * t));
}
fn cr(tex: texture_2d<f32>, q: vec2f, n: vec2f, clampIt: bool) -> vec4f {
  let p = q * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let wx = crw(f.x);
  let wy = crw(f.y);
  let hi = vec2i(n) - 1;
  var acc = vec4f(0.0);
  var lo4 = vec4f(1e30);
  var hi4 = vec4f(-1e30);
  for (var b = 0; b < 4; b++) {
    var row = vec4f(0.0);
    for (var a = 0; a < 4; a++) {
      let at = clamp(vec2i(i) + vec2i(a - 1, b - 1), vec2i(0), hi);
      let v = textureLoad(tex, at, 0);
      row += v * wx[a];
      if (a >= 1 && a <= 2 && b >= 1 && b <= 2) { lo4 = min(lo4, v); hi4 = max(hi4, v); }
    }
    acc += row * wy[b];
  }
  if (clampIt) { acc = clamp(acc, lo4, hi4); }
  return acc;
}
fn bilerp(t: texture_2d<f32>, uv: vec2f, n: f32) -> vec4f {
  let p = uv * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(n - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(n - 1.0)));
  return mix(mix(textureLoad(t, lo, 0), textureLoad(t, vec2i(hi.x, lo.y), 0), f.x),
             mix(textureLoad(t, vec2i(lo.x, hi.y), 0), textureLoad(t, hi, 0), f.x), f.y);
}
`;

/**
 * The window's own 0..1 to fluid uv and back, along the screen's axes: the
 * plate shader's `uvToFluid` turn and its inverse (closeupWindow.ts).
 */
const WINDOW = /* wgsl */ `
fn fromWin(q: vec2f, w: vec4f, cs: vec2f) -> vec2f {
  let d = (q - 0.5) * 2.0 * w.zw;
  return w.xy + vec2f(cs.x * d.x - cs.y * d.y, cs.y * d.x + cs.x * d.y);
}
fn toWin(p: vec2f, w: vec4f, cs: vec2f) -> vec2f {
  let d = p - w.xy;
  return vec2f(cs.x * d.x + cs.y * d.y, -cs.y * d.x + cs.x * d.y) / (2.0 * w.zw) + 0.5;
}
`;

const HEAD = `${STRUCT}${SAMPLE}${WINDOW}
@group(0) @binding(0) var<uniform> U: Fine;
`;

/**
 * One step of both fields. The texel's own point in the plate is traced back
 * through the solver's velocity by the displacement the solver's dye moved
 * this step (midpoint, two reads of the velocity, as the particles were), and
 * read where it came from in the window the fields were left in, which is
 * the last step's: a camera that pans, turns or zooms between steps is the
 * same remap as the flow, and costs nothing more.
 */
export const FINE_ADVECT_WGSL = /* wgsl */ `${HEAD}
@group(0) @binding(1) var src0: texture_2d<f32>;
@group(0) @binding(2) var src1: texture_2d<f32>;
@group(0) @binding(3) var dye: texture_2d<f32>;
@group(0) @binding(4) var vel: texture_2d<f32>;
@group(0) @binding(5) var dst0: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var dst1: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = U.newTurn.zw;
  if (f32(id.x) >= size.x || f32(id.y) >= size.y) { return; }
  let q = (vec2f(id.xy) + 0.5) / size;
  let p = clamp(fromWin(q, U.newWin, U.newTurn.xy), vec2f(0.0), vec2f(1.0));
  let v0 = bilerp(vel, p, U.grid).xy;
  let mid = clamp(p - v0 * (U.disp * 0.5), vec2f(0.0), vec2f(1.0));
  let v1 = bilerp(vel, mid, U.grid).xy;
  let back = clamp(p - v1 * U.disp, vec2f(0.0), vec2f(1.0));
  let sq = toWin(back, U.oldWin, U.oldTurn.xy);
  let inside = all(sq >= vec2f(0.0)) && all(sq <= vec2f(1.0));
  // Carried in from past the window: the grid's dye where it came from.
  var a: vec4f;
  var b: vec4f;
  if (inside) { a = cr(src0, sq, size, true); b = cr(src1, sq, size, true); } else { a = cr(dye, back, vec2f(U.grid), true); b = a; }
  if (U.reseed0 > 0.5 || U.reseed1 > 0.5) {
    let now = cr(dye, p, vec2f(U.grid), true);
    if (U.reseed0 > 0.5) { a = now; }
    if (U.reseed1 > 0.5) { b = now; }
  }
  textureStore(dst0, id.xy, a);
  textureStore(dst1, id.xy, b);
}`;

/** Each field's mean over a block a solver cell across (the last row and column hold what is left). */
export const FINE_REDUCE_WGSL = /* wgsl */ `${HEAD}
@group(0) @binding(1) var f0: texture_2d<f32>;
@group(0) @binding(2) var f1: texture_2d<f32>;
@group(0) @binding(3) var l0: texture_storage_2d<rgba16float, write>;
@group(0) @binding(4) var l1: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= U.lx || f32(id.y) >= U.ly) { return; }
  let b = i32(U.block);
  let size = vec2i(U.newTurn.zw);
  let base = vec2i(id.xy) * b;
  let top = min(base + b, size);
  var s0 = vec4f(0.0);
  var s1 = vec4f(0.0);
  for (var y = base.y; y < top.y; y++) {
    for (var x = base.x; x < top.x; x++) {
      s0 += textureLoad(f0, vec2i(x, y), 0);
      s1 += textureLoad(f1, vec2i(x, y), 0);
    }
  }
  let n = f32(max(1, (top.x - base.x) * (top.y - base.y)));
  textureStore(l0, id.xy, s0 / n);
  textureStore(l1, id.xy, s1 / n);
}`;

/**
 * The detail: what each fine field says the dye is here, blended by the two
 * fields' weights, handed to the plate as a ratio to the grid's dye at the
 * same point, channel by channel, which the plate multiplies the grid's dye
 * by (`wgsl/fineWindow.ts`). So the plate draws the fine dye wherever it
 * reads the grid's, through its own warp, defocus and gooey blur.
 *
 * What a field says: its own dye, scaled so that its mean round each solver
 * cell has the grid's thickness there (the grid has the pours, the drains,
 * the evaporation the field does not know), with the colour the field
 * carried. Where the field holds less dye round a cell than the grid does (a
 * pour since it was born, dye carried in from past the window), it is
 * trusted that much less and the grid's own dye fills the rest.
 *
 * Two forms came first and were dropped on what the lab showed. A
 * difference added (fine less its mean) drew black beads along the thin arms
 * of a stirred spiral: where it took the thickness to nothing and left some
 * colour, the decode divided that colour by a thickness near zero. A ratio
 * channel by channel (fine over its mean) scaled the colours unevenly where
 * the dye was thin and drew pale wisps in the dark gaps. Scaling the whole
 * fine dye by one number keeps its colour its own, a colour it carried from
 * the grid, and its thickness the grid's.
 *
 * The block means' texture is bigger than this window needs (it is made for
 * the smallest block), so it is read as `lx × ly` of its texels, by loads,
 * bilinear: the means are smooth by making, and a Catmull-Rom of them cost
 * four times the loads for nothing the picture showed.
 * `FINE_EPS` is a thickness too thin to see; `FINE_MOST` holds the scale and
 * the ratio, so a thread in a cell the grid holds almost empty is not drawn
 * as thick as a pool.
 */
export const FINE_EPS = 0.01;
export const FINE_MOST = 4;
export const FINE_DETAIL_WGSL = /* wgsl */ `${HEAD}
@group(0) @binding(1) var f0: texture_2d<f32>;
@group(0) @binding(2) var f1: texture_2d<f32>;
@group(0) @binding(3) var l0: texture_2d<f32>;
@group(0) @binding(4) var l1: texture_2d<f32>;
@group(0) @binding(5) var dye: texture_2d<f32>;
@group(0) @binding(6) var detail: texture_storage_2d<rgba16float, write>;

const EPS: f32 = ${FINE_EPS};
const MOST: f32 = ${FINE_MOST.toFixed(1)};

/** The block means, bilinear over the first lx × ly texels of their texture. */
fn lerpL(t: texture_2d<f32>, q: vec2f, n: vec2f) -> vec4f {
  let p = q * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let hi = vec2i(n) - 1;
  let lo = clamp(vec2i(i), vec2i(0), hi);
  let up = clamp(vec2i(i) + 1, vec2i(0), hi);
  return mix(mix(textureLoad(t, lo, 0), textureLoad(t, vec2i(up.x, lo.y), 0), f.x),
             mix(textureLoad(t, vec2i(lo.x, up.y), 0), textureLoad(t, up, 0), f.x), f.y);
}

fn says(f: vec4f, m: vec4f, c: vec4f) -> vec4f {
  let k = clamp((c.a + EPS) / (max(m.a, 0.0) + EPS), 1.0 / MOST, MOST);
  let trust = clamp(max(m.a, 0.0) / max(c.a, EPS), 0.0, 1.0);
  return mix(c, max(f, vec4f(0.0)) * k, trust);
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = U.newTurn.zw;
  if (f32(id.x) >= size.x || f32(id.y) >= size.y) { return; }
  let q = (vec2f(id.xy) + 0.5) / size;
  let p = clamp(fromWin(q, U.newWin, U.newTurn.xy), vec2f(0.0), vec2f(1.0));
  let c = max(cr(dye, p, vec2f(U.grid), false), vec4f(0.0));
  let ln = vec2f(U.lx, U.ly);
  let lq = (vec2f(id.xy) + 0.5) / U.block / ln;
  let t0 = says(textureLoad(f0, vec2i(id.xy), 0), lerpL(l0, lq, ln), c);
  let t1 = says(textureLoad(f1, vec2i(id.xy), 0), lerpL(l1, lq, ln), c);
  let want = t0 * U.w0 + t1 * U.w1;
  textureStore(detail, id.xy, clamp((want + EPS) / (c + EPS), vec4f(0.0), vec4f(MOST)));
}`;
