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
/** Each disc's rim: how far it has broken into fingers (0 round), how many, and their phase. */
@group(0) @binding(2) var<storage, read> fingers: array<vec4f>;

/** The longest a finger reaches past the round rim, as a fraction of the radius, at fingering 1. */
const FINGER_REACH: f32 = 0.9;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) amt: f32,
  @location(2) @interpolate(flat) rim: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VOut {
  let d = discs[i];
  // A quad as a triangle strip: (-1,-1) (1,-1) (-1,1) (1,1).
  let corner = vec2f(f32(v & 1u) * 2.0 - 1.0, f32((v >> 1u) & 1u) * 2.0 - 1.0);
  // The field is read y-down and written here in clip space, which is y-up.
  // Flipping the centre rather than the corner keeps the disc round.
  let centre = vec2f(d.x * 2.0 - 1.0, 1.0 - d.y * 2.0);
  let f = fingers[i];
  // The quad reaches as far as the longest finger can.
  let reach = 1.0 + clamp(f.x, 0.0, 1.0) * FINGER_REACH;
  var o: VOut;
  o.pos = vec4f(centre + corner * (d.z * 2.0 * reach), 0.0, 1.0);
  o.local = corner * reach;
  o.amt = d.w;
  o.rim = f;
  return o;
}

/*
  How far the rim reaches at an angle, as a fraction of the round radius.

  Fingers, not a flower: each a narrow lobe (a raised cosine taken to a high
  power), spaced unevenly (the angle warped by a slower wave), and each its
  own length (a second, incommensurate wave), so the front reads as the air
  pushing into the liquid where it gave first, as a blown bubble's does.
*/
fn rimAt(theta: f32, rim: vec4f) -> f32 {
  let f = clamp(rim.x, 0.0, 1.0);
  if (f <= 0.001) { return 1.0; }
  let k = max(rim.y, 3.0);
  let ph = rim.z;
  let warped = theta + 0.45 * sin(2.0 * theta + ph * 1.7) / k * 6.2831853;
  let lobe = pow(0.5 + 0.5 * cos(k * warped + ph), 6.0);
  let len = 0.55 + 0.45 * (0.5 + 0.5 * sin(3.0 * theta + ph * 2.3 + 1.1 * sin(5.0 * theta + ph)));
  return 1.0 + f * FINGER_REACH * lobe * len;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  let r = length(in.local);
  let edge = rimAt(atan2(in.local.y, in.local.x), in.rim);
  if (r > edge) { discard; }
  /*
    Soft only at the very rim: a bubble has a sharp edge, and the softness is
    there to keep the disc from aliasing rather than to blur it.

    Written smoothstep(1.0, 1.0 - soft, r) first, which reads as "fall off
    from the edge inward" and is **undefined in WGSL** — it requires the low
    edge first, and hands back something near zero when given them the other
    way round. The field it produced had discs in it, in the right places, at
    a peak of 0.01: present, plausible, and useless. A check that only asked
    whether there was air would have passed.
  */
  let a = in.amt * (1.0 - smoothstep(edge * (1.0 - max(A.soft, 0.01)), edge, r));
  return vec4f(a, 0.0, 0.0, 1.0);
}
`;
