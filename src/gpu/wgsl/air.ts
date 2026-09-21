/**
 * Air as a field (H6 · A, docs/bubbles-plan.md).
 *
 * Today a bubble is forty uniforms and a metaball loop in the compositor, and
 * what it does with them is `mix(outColor, c, opac)` — it **shades over** the
 * dye. That is the visibly wrong thing: a bubble is a hole in the liquid, and
 * a hole does not tint what is behind it, it removes it.
 *
 * So air becomes a quantity the plate carries, in 0–1, like dye. This file is
 * the first half of that: getting the air into a field, and taking the dye
 * out of where it is.
 *
 * ── Why coverage and not accumulation ──
 *
 * The particle splat next door is additive, because two particles landing on
 * a cell really do lay down twice the colour. Air is not like that. Two
 * bubbles overlapping do not make a cell twice as empty — a cell is empty or
 * it is not, and `1` means no liquid at all. So the blend is `max` and the
 * field saturates the way the thing it describes does.
 *
 * ── The orientation trap ──
 *
 * A render pass writes clip space, and clip space is y-up while the textures
 * here are read y-down (`FLIP_Y` in `wgsl/plate.ts` exists for exactly this).
 * A field flipped in y still looks like a plausible field — bubbles in it,
 * the right size, the right count — and every check that only asks "is there
 * air" passes on it. The check that catches it is the one that asks *where*,
 * against a position it chose, and `npm run bubbles` asks that.
 */

/** What the splat is told. Kept flat: four floats, one binding. */
export const AIR_SPLAT_WGSL = /* wgsl */ `
struct AirU {
  count: u32,
  soft: f32,
  pad0: f32,
  pad1: f32,
};
@group(0) @binding(0) var<uniform> A: AirU;
/** x, y, radius — all as a fraction of the grid — and how opaque the bubble is. */
@group(0) @binding(1) var<storage, read> discs: array<vec4f>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) amt: f32,
};

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VOut {
  let d = discs[i];
  // A quad as a triangle strip: (-1,-1) (1,-1) (-1,1) (1,1).
  let corner = vec2f(f32(v & 1u) * 2.0 - 1.0, f32((v >> 1u) & 1u) * 2.0 - 1.0);
  // The field is read y-down and written here in clip space, which is y-up.
  // Flipping the centre rather than the corner keeps the disc round.
  let centre = vec2f(d.x * 2.0 - 1.0, 1.0 - d.y * 2.0);
  var o: VOut;
  o.pos = vec4f(centre + corner * (d.z * 2.0), 0.0, 1.0);
  o.local = corner;
  o.amt = d.w;
  return o;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let r = length(in.local);
  if (r > 1.0) { discard; }
  // Soft only at the very rim: a bubble has a sharp edge, and the softness is
  // there to keep the disc from aliasing rather than to blur it.
  let a = in.amt * smoothstep(1.0, 1.0 - max(A.soft, 0.01), r);
  return vec4f(a, 0.0, 0.0, 1.0);
}
`;
