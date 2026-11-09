/**
 * Fields for the plate and the CPU: the packed view the plate draws, a field
 * boxed down to the logical grid, and a field cleared to a constant.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';
import { PHASE_VIEW_TOP } from '../standing';

export const FIELD_KERNELS: Record<string, string> = {
  /*
    Everything the plate draws from the liquids' own physics, in one texel.

    The display pass already reads sixteen textures, which is WebGPU's
    default limit for one shader stage, so these ride in the one binding the
    ferrofluid used to have: eight numbers a cell, as four pairs of 16-bit
    fixed point (pack2x16unorm).

      x  ferrofluid, oil
      y  acidity (−1..1 as 0..1), soap
      z  BZ's oxidised catalyst, Liesegang's precipitate (0..4 as 0..1)
      w  the gap between the glasses (0..0.06 as 0..1), in the low 16
         bits; in the high 16, BZ's activator and the clear film (PLAN §20b),
         eight bits each

    The clear film took half of the activator's place because there was no
    other: all eight numbers were spoken for, and the display pass cannot bind
    a seventeenth texture. The activator is only ever asked whether it is
    there at all (the plate's BZ draws where either species is over 0.0005),
    so it keeps eight bits on a square-root scale, nothing at or under that
    0.0005 and at least 0.000554 over it: at a texel the gate answers exactly
    as it did, and only between texels, where the plate blends four, can the
    reaction's fringe move by a fraction of a texel. That is the one thing
    this changes on a plate with no film, and only where BZ is drawn. The
    film is a share of the gap, 0..1 in steps of 1/255, which the plate
    reads as the water's path (1 − film) through it: the faint tint of the
    dyed water under a whole film is a seventh of the gap, drawn in steps of
    3% of itself. The gap keeps its sixteen bits and pack2x16unorm's own
    rounding, so the gap is packed exactly as it was.

    The reactions and the film live on grids of their own and are read
    between their texels. A.a = which inputs are real (ferrofluid, mix, BZ,
    Liesegang); A.b.x, A.b.y = the BZ and Liesegang grids; A.b.z the film's
    grid and A.b.w whether there is a film.
  */
  packView: `${HEAD}
@group(0) @binding(2) var phase: texture_2d<f32>;
@group(0) @binding(3) var mixT: texture_2d<f32>;
@group(0) @binding(4) var rxn: texture_2d<f32>;
@group(0) @binding(5) var lies: texture_2d<f32>;
@group(0) @binding(6) var sq: texture_2d<f32>;
@group(0) @binding(7) var filmT: texture_2d<f32>;
@group(0) @binding(8) var dst: texture_storage_2d<rgba32uint, write>;
fn grid(t: texture_2d<f32>, uv: vec2f, g: f32) -> vec4f {
  let q = uv * g - 0.5;
  let i = vec2i(floor(q));
  let f = q - floor(q);
  let m = i32(g) - 1;
  let a = textureLoad(t, clamp(i, vec2i(0), vec2i(m)), 0);
  let b = textureLoad(t, clamp(i + vec2i(1, 0), vec2i(0), vec2i(m)), 0);
  let c = textureLoad(t, clamp(i + vec2i(0, 1), vec2i(0), vec2i(m)), 0);
  let d = textureLoad(t, clamp(i + vec2i(1, 1), vec2i(0), vec2i(m)), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let uv = uvOf(id);
  let ph = select(0.0, textureLoad(phase, p, 0).r, A.a.x > 0.5);
  let m = select(vec4f(0.0), textureLoad(mixT, p, 0), A.a.y > 0.5);
  let r = select(vec4f(0.0), grid(rxn, uv, A.b.x), A.a.z > 0.5);
  let l = select(vec4f(0.0), grid(lies, uv, A.b.y), A.a.w > 0.5);
  let gap = textureLoad(sq, p, 0).r;
  let film = select(0.0, grid(filmT, uv, A.b.z).r, A.b.w > 0.5);
  // The activator: 0 at or under the plate's 0.0005, and at least step 6
  // (0.000554 decoded) over it, so at a texel the gate answers as it did.
  let bzu = select(0u, max(6u, u32(0.5 + 255.0 * sqrt(clamp(r.r, 0.0, 1.0)))), r.r > 0.0005);
  let w = u32(0.5 + 65535.0 * clamp(gap / 0.06, 0.0, 1.0))
        | (bzu << 16u)
        | (u32(0.5 + 255.0 * clamp(film, 0.0, 1.0)) << 24u);
  textureStore(dst, p, vec4u(
    // The ferrofluid as a share of PHASE_VIEW_TOP, so a dome past full reaches the plate.
    pack2x16unorm(clamp(vec2f(ph / ${PHASE_VIEW_TOP}.0, m.r), vec2f(0.0), vec2f(1.0))),
    pack2x16unorm(clamp(vec2f(m.b * 0.5 + 0.5, m.g), vec2f(0.0), vec2f(1.0))),
    pack2x16unorm(clamp(vec2f(r.g, l.a * 0.25), vec2f(0.0), vec2f(1.0))),
    w));
}`,

  // Box-filter a field down to the logical grid, for the CPU's readers.
  downsample: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(S.l) || id.y >= u32(S.l)) { return; }
  let k = S.n / S.l;
  let n = i32(clamp(ceil(k), 1.0, 4.0));
  var acc = vec4f(0.0);
  let base = vec2f(id.xy) * k;                    // the first physical texel of this logical cell
  for (var j = 0; j < n; j++) {
    for (var i = 0; i < n; i++) {
      let p = vec2i(clamp(base + vec2f(f32(i), f32(j)) * (k / f32(n)), vec2f(0.0), vec2f(S.n - 1.0)));
      acc += textureLoad(src, p, 0);
    }
  }
  textureStore(dst, vec2i(id.xy), acc / f32(n * n));
}`,

  // Clear a field to a constant (A.a), used by clear() and the pressure warm start.
  fill: `${HEAD}
@group(0) @binding(2) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.b.x) || id.y >= u32(A.b.y)) { return; }
  textureStore(dst, vec2i(id.xy), A.a);
}`,
};
