/**
 * The closeup's fine detail, added to the grid's dye (PLAN 47a-1, 47a).
 *
 * `fineDye.ts` carries the dye over the camera's window at about two screen
 * pixels a texel and keeps only what is finer than a solver cell: the fine
 * field over its own mean round each cell, a factor about 1 channel by
 * channel (`FINE_DETAIL_WGSL` says why a ratio and not a difference). The
 * grid's raw dye is multiplied by it, in the dye's own encoded space before
 * the decode, the space both were carried in: no scale the grid holds
 * changes, and the threads the grid cannot hold are drawn.
 *
 * Out of focus it is blurred by the same five taps the grid's dye is
 * (`decodeFluidParts`), so the detail goes soft with the dye it belongs to.
 *
 * `fineUv` is where in the window's texture a fluid uv lands: the inverse of
 * `uvToFluid`'s turn, the same as the solver's `toWin`. Off the window it
 * answers -1 and the dye is left as it is, rather than reading the texture's clamped
 * edge, which would smear its last row across whatever lies past it.
 */
export const FINE_WINDOW_WGSL = /* wgsl */ `
fn fineUv(uv: vec2f) -> vec2f {
  let w = U.fineWin;
  let cs = U.fineTurn.xy;
  let d = uv - w.xy;
  let q = vec2f(cs.x * d.x + cs.y * d.y, -cs.y * d.x + cs.x * d.y) / (2.0 * w.zw) + 0.5;
  if (any(q < vec2f(0.0)) || any(q > vec2f(1.0))) { return vec2f(-1.0); }
  return q;
}
fn fineAt(pt: texture_2d<f32>, uv: vec2f) -> vec4f {
  let q = fineUv(uv);
  if (q.x < 0.0) { return vec4f(1.0); }
  return textureSampleLevel(pt, samp, q, 0.0);
}
fn fineRaw(raw: vec4f, pt: texture_2d<f32>, fuv: vec2f, r: f32) -> vec4f {
  var d = fineAt(pt, fuv);
  if (r > 0.0) {
    d = (d + fineAt(pt, fuv + vec2f(r, 0.0)) + fineAt(pt, fuv - vec2f(r, 0.0))
           + fineAt(pt, fuv + vec2f(0.0, r)) + fineAt(pt, fuv - vec2f(0.0, r))) * 0.2;
  }
  return raw * mix(vec4f(1.0), d, U.fineTurn.z);
}
`;
