/**
 * What a hand or a pour puts in: the dye's and the velocity's full-resolution
 * deltas (`wgsl/splat.ts` draws them), and the splats of the oil, the poured
 * liquids and their species.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { HEAD, W } from './shared';

export const SPLAT_KERNELS: Record<string, string> = {
  // dye = max(dye * mul + add, 0), from the full-resolution delta fields.
  deltaDye: `${HEAD}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var mulT: texture_2d<f32>;
@group(0) @binding(5) var liquids0: texture_2d<f32>;
@group(0) @binding(6) var dst: texture_storage_2d<DYE_FORMAT, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let d = textureLoad(dye, p, 0);
  let soap = textureLoad(liquids0, p, 0).r;
  let soapMul = 1.0 - min(0.5, soap * soap * 0.22 * S.dt * 60.0);
  textureStore(dst, p, capDye(d * textureLoad(mulT, p, 0).r * soapMul + textureLoad(addT, p, 0)));
}`,

  // vel.xy += add.xy ; temp (vel.z) += add.z
  /*
    With the plate a thin gap (A.a.x = 1, PLAN §18a) a hand's velocity is
    imposed rather than added.

    Added was right while the velocity lasted one step: each frame's push
    was the whole of the liquid's motion, and the clamp took it back. With
    the drag time as the plate's memory, a Finger held still in its stroke
    adds the same push every frame, and added it would run the liquid up to
    sixty times the hand's own speed in a second of water. A hand in the
    liquid is a solid moving through it: the liquid it touches moves with
    it and no faster (Brinkman's penalised solid, in the limit where the
    solid wins). So along the push the liquid is brought up to the push and
    not past it, and across it keeps what it had.
  */
  deltaVel: `${HEAD}
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var addT: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let v = textureLoad(vel, p, 0);
  let a = textureLoad(addT, p, 0);
  var u = v.xy + a.xy;
  let s = length(a.xy);
  if (A.a.x > 0.5 && s > 0.0) {
    let dir = a.xy / s;
    u = v.xy + dir * max(0.0, s - dot(v.xy, dir));
  }
  textureStore(dst, p, safeVel(vec4f(u, v.z + a.z, 0.0)));
}`,

  /*
    The mix: three things a cell of liquid carries besides its dye.

      r  oil: how much of the cell is oil rather than water, 0..1
      g  surfactant (soap), 0..1
      b  acidity: + acid, − base, −1..1 (they neutralise by cancelling)
      a  the oil's chemical potential μ, recomputed every step (mixMu)

    A pour: A.a = (x, y, radius, amount), A.b = how much of the amount goes to
    each channel.
  */
  mixSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let d = length(uvOf(id) - A.a.xy) / max(A.a.z, 1e-4);
  let f = select(0.0, (1.0 - d * d) * A.a.w, d < 1.0);
  /*
    The oil lands flat, full to its edge and sharp at it (a cell and a half
    on any grid), where the soap and the acid land as a dome. A dome of oil
    is half full across most of its width, and half full is inside
    Cahn–Hilliard's spinodal: the pour broke up at the grid's finest scale
    before it could round, and the capillary force followed the break-up
    (see mixForce). A body of oil is what a pour of oil is.
  */
  let fo = clamp((1.0 - d) * A.a.z * S.n / 1.5 + 0.5, 0.0, 1.0) * A.a.w;
  let m = textureLoad(src, p, 0) + A.b * vec4f(fo, f, f, f);
  textureStore(dst, p, vec4f(clamp(m.r, 0.0, 1.0), clamp(m.g, 0.0, 1.0), clamp(m.b, -1.0, 1.0), m.a));
}`,

  /*
    The poured liquids' species (PLAN 18d, src/lib/liquidProps.ts): a pour,
    and the rim, in one kernel.

    A pour of volume (A.b.w 1, PLAN 18c) adds a share f of the column, a
    dome of A.a.w at its middle, of the liquid poured: (1, ln(ν/ν_water),
    μs′ scatter, n) in the four channels, each the share-weighted sum the carry
    conserves. Added, not mixed in: the pour's volume goes into the thin
    solve as a source (pourVolume), and in that step the flow it makes
    carries f of the column out of the cell, which the flux-form carry
    takes from what the cell then holds. So what was poured is all in the
    field, the carry moves it without making or losing any, and what was in
    the column is pushed out of it, not deleted. Mixing it in instead, the
    column's (was + f)/(1 + f), and letting the flow then carry f out,
    would count the poured volume's outflow twice: glycerine poured into
    glycerine would add nothing and lose f, and \`npm run flush\` read half
    of every pour gone. A clear-liquid pour (water, a dye) adds nothing
    here, and its flow dilutes what it lands in by pushing it aside. A.b.w
    0 lays the liquid as though poured long ago, with no volume: f of the
    column replaced (a check's pool in place, \`npm run thick\`). A.a.z of 0
    is the rim instead: what the flow has carried past A.b.w from the
    middle has gone over the dish's open rim and is taken off.

    A.a = (x, y, radius, the share at the middle), A.b = (ln(ν/ν_water),
    scatter, index, the mode; the rim's radius for the rim).
  */
  liquidSplat0: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let w = select(0.0, 1.0 - d * d, d < 1.0);
  let v = textureLoad(src, vec2i(id.xy), 0);
  if (w <= 0.0) {
    textureStore(dst, vec2i(id.xy), v);
    return;
  }
  let take = clamp(A.a.w * w, 0.0, 1.0);
  textureStore(dst, vec2i(id.xy), mix(v, A.b, take));
}`,

  liquidSplat1: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let uv = uvOf(id);
  let d = length(uv - A.a.xy) / max(A.a.z, 1e-4);
  let w = select(0.0, 1.0 - d * d, d < 1.0);
  let v = textureLoad(src, vec2i(id.xy), 0);
  if (w <= 0.0) {
    textureStore(dst, vec2i(id.xy), v);
    return;
  }
  let take = clamp(A.a.w * w, 0.0, 1.0);
  textureStore(dst, vec2i(id.xy), mix(v, A.b, take));
}`,

  speciesSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let was = textureLoad(src, p, 0);
  if (A.a.z <= 0.0) {
    textureStore(dst, p, select(was, vec4f(0.0), length(uvOf(id) - vec2f(0.5)) >= A.b.w));
    return;
  }
  let d = length(uvOf(id) - A.a.xy) / A.a.z;
  let f = select(0.0, clamp((1.0 - d * d) * A.a.w, 0.0, 1.0), d < 1.0);
  let poured = vec4f(1.0, A.b.xyz);
  textureStore(dst, p, select(mix(was, poured, f), was + f * poured, A.b.w > 0.5));
}`,
};
