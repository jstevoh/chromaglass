/**
 * What a hand or a pour puts in: the dye's and the velocity's full-resolution
 * deltas (`wgsl/splat.ts` draws them), and the splats of the oil, the poured
 * liquids and their species.
 *
 * Kernels moved here from `wgsl/fluid.ts` as they were (PLAN 19ai-6); that file's
 * header says what the WGSL port changes everywhere, and `KERNELS` there is still
 * the one table every pass is asked for by name.
 */

import { BILERP_N, HEAD, W } from './shared';
import { DISH_GAP_RANGE, DISH_REST_GAP } from '../../../lib/turntable';

export const SPLAT_KERNELS: Record<string, string> = {
  /*
    Fused deltaDye + deltaVel (soap thinning and liquid forces moved to
    stepLiquids in PLAN 15e-1).
    A.a.x > 0.5: thinLive (hand velocity imposed rather than added).
    A.a.y > 0.5: bilinear-sample mulT (cpuMulTex) on the fly;
    A.a.y in [-0.5, 0.5]: textureLoad(mulT, p, 0) (deltaMulTex);
    A.a.y < -0.5: dye-only (pourImage / pourInk), skip dstVel write.
  */
  deltaFold: `${HEAD}${BILERP_N}
@group(0) @binding(2) var dye: texture_2d<f32>;
@group(0) @binding(3) var vel: texture_2d<f32>;
@group(0) @binding(4) var addDyeT: texture_2d<f32>;
@group(0) @binding(5) var addVelT: texture_2d<f32>;
@group(0) @binding(6) var mulT: texture_2d<f32>;
@group(0) @binding(7) var dstDye: texture_storage_2d<DYE_FORMAT, write>;
@group(0) @binding(8) var dstVel: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let d = textureLoad(dye, p, 0);
  let mul = select(textureLoad(mulT, p, 0).r, bilerpN(mulT, uvOf(id), S.l).r, A.a.y > 0.5);
  textureStore(dstDye, p, capDye(d * mul + textureLoad(addDyeT, p, 0)));
  if (A.a.y < -0.5) { return; }

  let v0 = textureLoad(vel, p, 0);
  let a = textureLoad(addVelT, p, 0);
  var u = v0.xy + a.xy;
  let sp = length(a.xy);
  if (A.a.x > 0.5 && sp > 0.0) {
    let dir = a.xy / sp;
    u = v0.xy + dir * max(0.0, sp - dot(v0.xy, dir));
  }
  textureStore(dstVel, p, safeVel(vec4f(u, v0.z + a.z, 0.0)));
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
  // The soap is not held at a monolayer: a second drop on the first is more
  // soap in the water, as micelles (PLAN 38c, src/gpu/fluid/soap.ts).
  textureStore(dst, p, vec4f(clamp(m.r, 0.0, 1.0), clamp(m.g, 0.0, 64.0), clamp(m.b, -1.0, 1.0), m.a));
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
    is the rim instead: what the flow has carried past the dish's open rim
    (pastOpenRim: its radius, and the grid's edge where the rim meets the wall)
    has gone over it and is taken off.

    A.a = (x, y, radius, the share at the middle), A.b = (ln(ν/ν_water),
    scatter, index, the mode; the rim's radius for the rim, which pastOpenRim
    now holds itself).

    The share f is of the column the pour lands in, and since the glass
    floats (PLAN 38r-5, gpu/fluid/cover.ts) that column is as tall as the
    glass stands, lifted by the pours before it. The field is a sum in
    rest-gap columns (the carry's fluxes are in the rest gap's units), so a
    pour adds f · g/h₀, the same factor the thin solve's source takes
    (pourVolume times hsGap in hsDivergence) and the cover's ledger takes
    (FluidCover.pour). Without it a pour under a lifted glass brought more
    liquid than glycerine: \`npm run flush\`, under the glass its edge holds
    at 2 mm, read 0.9675 of the glycerine poured, the 3.4% the glass had
    risen by at the pours.
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

  /*
    A title's ink carrier (PLAN 37x-10g, `pourInk` with a carrier): the
    title's coverage mask, sampled as `pourInk` samples it for the dye (the
    mean of a few bilinear taps over the cell's footprint, so the carrier
    lies exactly under the letters' dye), replaces that share of the column
    with the ink's own liquid, as a pour laid without its volume does
    (speciesSplat with A.b.w at 0): r toward 1, g toward its ln(ν/ν_water),
    b toward its scatter, a toward its index. A.a is (share at coverage 1,
    ln(ν/ν_water), scatter, index).
  */
  inkSpecies: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
@group(0) @binding(5) var lin: sampler;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let taps = vec2u(clamp(ceil(vec2f(textureDimensions(mask)) / S.n), vec2f(1.0), vec2f(4.0)));
  var cover = 0.0;
  for (var j = 0u; j < taps.y; j = j + 1u) {
    for (var i = 0u; i < taps.x; i = i + 1u) {
      let uv = (vec2f(id.xy) + (vec2f(f32(i), f32(j)) + 0.5) / vec2f(taps)) / S.n;
      cover += textureSampleLevel(mask, lin, uv, 0.0).r;
    }
  }
  let f = clamp(cover / f32(taps.x * taps.y) * A.a.x, 0.0, 1.0);
  let was = textureLoad(src, p, 0);
  textureStore(dst, p, mix(was, vec4f(1.0, A.a.y, A.a.z, A.a.w), f));
}`,

  speciesSplat: `${HEAD}
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var sq: texture_2d<f32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba32float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (!inGrid(id)) { return; }
  let p = vec2i(id.xy);
  let was = textureLoad(src, p, 0);
  if (A.a.z <= 0.0) {
    // Taken off where the thin solve's open rim is (pastOpenRim), its edge cells with it.
    textureStore(dst, p, select(was, vec4f(0.0), pastOpenRim(p)));
    return;
  }
  let d = length(uvOf(id) - A.a.xy) / A.a.z;
  let f = select(0.0, clamp((1.0 - d * d) * A.a.w, 0.0, 1.0), d < 1.0);
  let poured = vec4f(1.0, A.b.xyz);
  let tall = max(textureLoad(sq, p, 0).r, ${DISH_GAP_RANGE[0]}) / ${DISH_REST_GAP};
  textureStore(dst, p, select(mix(was, poured, f), was + f * tall * poured, A.b.w > 0.5));
}`,
};
