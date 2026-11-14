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

/*
  What a texel of the field's fourth channel says (PLAN 38h-15): which bubble
  of the list it belongs to, so the plate draws each one from its own disc
  (wgsl/bubbleShape.ts) and not from these texels. A texel inside a rim holds
  AIR_LOOK_IN plus the bubble's index; one up to AIR_SKIRT texels past it,
  where the coverage is 0, AIR_LOOK_SKIRT plus the index, so a pixel just
  outside a bubble still finds the bubble it is outside of; the boiling's
  steam pockets, which no list lays, AIR_LOOK_BOIL plus a number of their
  own. The blend is max, so inside always outranks a neighbour's skirt and
  the steam outranks both. Whole numbers under 2048, which half floats hold
  exactly; the span is the field's capacity (AIR_CAPACITY, checked where the
  field is made).
*/
/** How many bubbles the field's index can name. */
export const AIR_LOOK_SPAN = 512;

export const AIR_RIM_WGSL = /* wgsl */ `
const AIR_LOOK_SKIRT: i32 = 1;
const AIR_LOOK_IN: i32 = 1024;
const AIR_LOOK_SPAN: i32 = ${AIR_LOOK_SPAN};
const AIR_LOOK_BOIL: i32 = 1600;
/** How far past a rim the index reaches, in texels. */
const AIR_SKIRT: f32 = 3.0;
/** A steam pocket's film and radius, which its look once packed (sixteen steps each: film 8, size 6 of 0.004 to 0.16). */
const AIR_BOIL_FILM: f32 = 0.5333333;
const AIR_BOIL_R: f32 = 0.017494;

/** The longest a finger reaches past the round rim, as a fraction of the radius, at fingering 1. */
const FINGER_REACH: f32 = 0.9;

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
`;

/** What the splat is told. Kept flat: four floats, one binding. */
export const AIR_SPLAT_WGSL = /* wgsl */ `
struct AirU {
  count: u32,
  soft: f32,
  /** The field's size in texels, for the skirt. */
  grid: f32,
  pad1: f32,
};
@group(0) @binding(0) var<uniform> A: AirU;
${AIR_RIM_WGSL}
/** x, y, radius — all as a fraction of the grid — and how opaque the bubble is. */
@group(0) @binding(1) var<storage, read> discs: array<vec4f>;
/** Each disc's rim: how far it has broken into fingers (0 round), how many, and their phase. */
@group(0) @binding(2) var<storage, read> fingers: array<vec4f>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) amt: f32,
  @location(2) @interpolate(flat) rim: vec4f,
  /** Which bubble of the list this is (AIR_LOOK, in AIR_RIM_WGSL above). */
  @location(3) @interpolate(flat) index: f32,
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
  // The quad reaches as far as the longest finger can, and the skirt past it.
  let reach = 1.0 + clamp(f.x, 0.0, 1.0) * FINGER_REACH + AIR_SKIRT / (max(A.grid, 1.0) * max(d.z, 1e-6));
  var o: VOut;
  o.pos = vec4f(centre + corner * (d.z * 2.0 * reach), 0.0, 1.0);
  o.local = corner * reach;
  o.amt = d.w;
  o.rim = f;
  /*
    Its number in the list, and nothing else: its size, film and the number
    its clarity is drawn from were packed here in sixteen, sixteen and eight
    steps, and the plate now reads them from the list itself (38h-15).
  */
  o.index = f32(i);
  return o;
}

@fragment
fn fs(in: VOut) -> @location(0) vec4f {
  // A texel, in units of this bubble's radius (before anything is discarded).
  let px = fwidth(in.local.x);
  let r = length(in.local);
  let edge = rimAt(atan2(in.local.y, in.local.x), in.rim);
  // Past the rim, the skirt: no air, only which bubble is next door.
  if (r > edge + AIR_SKIRT * px) { discard; }
  if (r > edge) { return vec4f(0.0, 0.0, 0.0, f32(AIR_LOOK_SKIRT) + in.index); }
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
  /*
    And never softer than a texel and a half: a bubble three texels across
    with a rim one texel soft is a staircase, and the dye taken out round it
    and the plate's relief on that hole drew each small bubble with a square,
    stepped halo.
  */
  let soft = clamp(max(A.soft, 1.5 * px / max(edge, 1e-3)), 0.01, 0.9);
  let a = in.amt * (1.0 - smoothstep(edge * (1.0 - soft), edge, r));
  /*
    Where in the bubble this is, across and down in units of its radius, in
    0-1 and weighted by the coverage: the plate divides the coverage back
    out, so filtering between texels gives the true position (it is linear
    across a bubble) even at the rim. The slope of a height field was tried
    first and on a small bubble came out in visible wedges, a slope measured
    on a coarse grid being a step function. The height follows from this.
    The field is read y-down, and the quad's local position is clip space's y-up.
  */
  let q = clamp(in.local / max(edge, 1e-3), vec2f(-1.0), vec2f(1.0));
  return vec4f(a, a * (0.5 + 0.5 * q.x), a * (0.5 - 0.5 * q.y), f32(AIR_LOOK_IN) + in.index);
}
`;

/**
 * Full-screen pass that merges the plate's boiling vapour fraction field
 * (`boilAlpha`, rg32float, PLAN §36e-2) into the `rgba16float` air field (`H6`),
 * reconstructing each steam pocket's outward radial coordinate `q` from the
 * coverage gradient so `plate.ts` shades boiling steam pockets with the same
 * refractive meniscus and wetting-film optics as blown bubbles.
 */
export const AIR_BOIL_WGSL = /* wgsl */ `
${AIR_RIM_WGSL}
@group(0) @binding(0) var boilAlpha: texture_2d<f32>;

struct BoilVOut {
  @builtin(position) pos: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) v: u32) -> BoilVOut {
  let x = f32((v << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(v & 2u) * 2.0 - 1.0;
  var o: BoilVOut;
  o.pos = vec4f(x, y, 0.0, 1.0);
  return o;
}

fn alphaAt(p: vec2i, n: i32) -> f32 {
  let c = clamp(p, vec2i(0), vec2i(n - 1));
  return clamp(textureLoad(boilAlpha, c, 0).r, 0.0, 1.0);
}

@fragment
fn fs(in: BoilVOut) -> @location(0) vec4f {
  let dims = vec2i(textureDimensions(boilAlpha));
  let p = clamp(vec2i(in.pos.xy), vec2i(0), dims - vec2i(1));
  let a = alphaAt(p, dims.x);
  if (a <= 1e-4) { discard; }
  let gx = 0.5 * (alphaAt(p + vec2i(1, 0), dims.x) - alphaAt(p - vec2i(1, 0), dims.x));
  let gy = 0.5 * (alphaAt(p + vec2i(0, 1), dims.x) - alphaAt(p - vec2i(0, 1), dims.x));
  let gl = sqrt(gx * gx + gy * gy);
  let outward = select(vec2f(0.0), vec2f(-gx, -gy) / gl, gl > 1e-5);
  let r = clamp(1.0 - a, 0.0, 1.0);
  let q = clamp(outward * r, vec2f(-1.0), vec2f(1.0));
  let idQ = floor(fract(sin(f32(p.x / 4) * 12.9898 + f32(p.y / 4) * 78.233) * 43758.5453) * 7.99);
  let look = f32(AIR_LOOK_BOIL) + idQ;
  return vec4f(a, a * (0.5 + 0.5 * q.x), a * (0.5 + 0.5 * q.y), look);
}
`;

