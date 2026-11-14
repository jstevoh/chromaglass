/**
 * Lit stage dye grade (PLAN 36a): an operator pouring stronger dye under
 * ambient stage wash, moved beside `plate.ts` so `plate.ts` stays under its
 * size ceiling. Spliced immediately before `decodeFluid` inside `plate.ts`.
 *
 * Physics and shortcut note:
 * - Thickness scales by `(1 + 2.0 * ls)` so thin and medium dye reads sooner
 *   as body (`1 - exp(-thickness * (1 + 2.0 * ls))`, as Colour Body does).
 * - On the lamp ground (`U.lampGround > 0.001`), optical depth deepens gently
 *   (`amount * (1 + 0.15 * ls)`) and transmitted dye saturates (`litSat`), pushed
 *   harder when the lamp itself is dim/tinted (e.g. amber `lava-lamp`) so
 *   coloured wax and dyes separate cleanly without turning bright white-lamp
 *   looks (`home-movie`, `chemical-clock`).
 * - SHORTCUT (PLAN 36a-2): on dark-field painted looks where deep jewel dyes
 *   sit near a 10% light floor in luminance, optical depth alone cannot raise
 *   them above the wash, so `litDyeLift` applies a per-pixel luminance power
 *   lift (`pow(y, 1 - 0.50 * pow(ls, 0.18)) / y`, peak held under 0.70 so
 *   bright highlights do not bend hue in the look's tone curve) plus
 *   hue-preserving `saturate3(..., 1 + 0.36 * pow(ls, 0.35))`. PLAN 36a-2
 *   tracks replacing this per-pixel lift with a fuller Colour Body and
 *   plate-light reflectance model.
 */
export const LIT_STAGE_WGSL = /* wgsl */ `
/* lit stage { */
fn litSat(c: vec3f, k: f32) -> vec3f {
  let y = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return max(vec3f(y) + (c - vec3f(y)) * k, vec3f(0.0));
}

fn litDyeLift(c: vec3f, ls: f32) -> vec3f {
  let y = max(dot(c, vec3f(0.2126, 0.7152, 0.0722)), 1e-5);
  let top = max(max(c.r, max(c.g, c.b)), 1e-5);
  let p = 0.50 * pow(ls, 0.18);
  let lifted = c * min(pow(y, 1.0 - p) / y, max(1.0, 0.70 / top));
  return saturate3(clamp(lifted, vec3f(0.0), vec3f(1.0)), 1.0 + 0.36 * pow(ls, 0.35));
}

fn litFluid(c: vec3f, thickness: f32, unit: vec3f, amount: f32, m: f32) -> vec4f {
  let ls = clamp(U.litStage, 0.0, 1.0);
  if (U.lampGround > 0.001) {
    let bgY = dot(lampBg, vec3f(0.2126, 0.7152, 0.0722));
    let satK = 1.0 + mix(3.6, 2.0, smoothstep(0.3, 0.9, bgY)) * ls;
    dyeThrough = litSat(lampThrough(unit, amount * (1.0 + 0.15 * ls)), satK);
  }
  let a = min(mix(0.95, 0.995, m), 1.0 - exp(-thickness * (1.0 + 2.0 * ls)));
  return vec4f(litDyeLift(c, ls), a);
}
/* } lit stage */
`;
