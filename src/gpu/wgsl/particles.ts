/**
 * Dye carried by particles (H1, docs/roadmap.md).
 *
 * The plate's oldest measured shortfall is that filmed liquid holds three to
 * five times more structure at 4–8 px than ours (PLAN.md). The cause is
 * numerical diffusion: the dye lives in a grid, and every step resamples it,
 * so anything finer than about eight cells is gone within a second. Nothing
 * the solver does after that puts it back — a sharpening pass was tried and
 * retired on the sixth look for exactly this reason.
 *
 * A particle does not resample. It is given a colour once and carries it
 * wherever the flow takes it, so the structure it draws is as fine as the
 * splat that lands it, not as fine as the grid. This is the standard fix and
 * it is what the plan has been pointing at since the first measurement.
 *
 * Three shaders, in the order they run:
 *
 *   seed     a particle with no life left is reborn where there is dye, and
 *            takes that dye's colour with it
 *   advect   every live particle moves through the forced velocity field,
 *            the same field the dye rides, and ages
 *   splat    every live particle is drawn as an additive soft disc into a
 *            texture the compositor folds in on top of the dye
 *
 * The splat is a render pass with additive blending rather than a compute
 * pass with atomics: the blend hardware does the accumulation, which is both
 * simpler and faster than `atomicAdd` over four channels, and it is the
 * reason this can afford a particle per cell or more.
 *
 * Particles are *alongside* the dye grid, not instead of it. The grid still
 * carries the body of colour; particles add the fine structure that the grid
 * cannot hold. That keeps every existing look intact with the amount at 0 and
 * makes the setting a dial rather than a switch between two plates.
 */

import { layOut, wgslStruct, type Field } from '../uniforms';

/**
 * What the three passes are told.
 *
 * `frame` and `seed` feed the integer hash rather than `Math.random`, so a
 * song rendered twice is the same film twice (PLAN.md §6) — the same rule the
 * post chain's effects follow.
 */
export const PARTICLE_FIELDS: Field[] = [
  { name: 'grid', type: 'f32', note: 'the solver grid edge, in cells' },
  { name: 'splat', type: 'f32', note: 'the splat target edge, finer than the grid (SPLAT_SCALE)' },
  { name: 'count', type: 'u32', note: 'how many particles are live this frame' },
  { name: 'disp', type: 'f32', note: 'advection displacement, as the solver computes it' },
  { name: 'dt', type: 'f32' },
  { name: 'life', type: 'f32', note: 'seconds a particle carries its colour before it is reborn' },
  { name: 'gain', type: 'f32', note: 'how much of its colour a particle lays down' },
  { name: 'floor', type: 'f32', note: 'dye thickness below which a particle is not born there' },
  { name: 'frame', type: 'u32' },
  { name: 'seed', type: 'u32' },
];

export const PARTICLE_LAYOUT = layOut(PARTICLE_FIELDS);
const STRUCT = wgslStruct('Particles', PARTICLE_LAYOUT);

/**
 * The particle, 32 bytes.
 *
 * `pos` is grid uv, 0..1, the same space the fields are sampled in. `tint` is
 * the colour it carries and, in w, how far through its life it is: 0 at
 * birth, 1 when it is due to be reborn. Keeping age in the colour's spare
 * lane is what holds the struct to two 16-byte rows, which is one load.
 */
const PARTICLE = /* wgsl */ `
struct Particle {
  pos: vec2f,
  born: vec2f,
  tint: vec4f,
};
`;

/**
 * PCG, as the post chain hashes (docs/filters-plan.md, F0). One integer in,
 * one out, and the float taken from the top bits — the low ones are the
 * weakest and a plate seeded from them shows the lattice.
 */
const HASH = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v) >> 8u) * (1.0 / 16777216.0); }
`;

const HEAD = `${STRUCT}${PARTICLE}${HASH}
@group(0) @binding(0) var<uniform> U: Particles;
@group(0) @binding(1) var<storage, read_write> parts: array<Particle>;
`;

/**
 * Bilinear from a grid of `n` cells by uv, with `textureLoad`.
 *
 * The same arithmetic as the solver's `bilerpN` and for the same reason: it
 * asks nothing of the format, and a 32-bit dye can only be filtered through a
 * sampler where `float32-filterable` exists.
 */
const BILERP = /* wgsl */ `
fn bilerp(t: texture_2d<f32>, uv: vec2f, n: f32) -> vec4f {
  let p = uv * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let lo = vec2i(clamp(i, vec2f(0.0), vec2f(n - 1.0)));
  let hi = vec2i(clamp(i + 1.0, vec2f(0.0), vec2f(n - 1.0)));
  let a = textureLoad(t, vec2i(lo.x, lo.y), 0);
  let b = textureLoad(t, vec2i(hi.x, lo.y), 0);
  let c = textureLoad(t, vec2i(lo.x, hi.y), 0);
  let d = textureLoad(t, vec2i(hi.x, hi.y), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/**
 * Birth.
 *
 * A particle whose life has run out is thrown at a hashed point on the plate.
 * If there is dye there it takes that colour and starts living; if there is
 * not, it stays dead and tries again next step. That is a rejection sample,
 * and it is deliberately the cheap kind: no prefix sums, no sorting, no
 * second pass to build a distribution. On a plate that is a third covered it
 * costs three tries per birth on average, and a birth is one step in a life
 * of several hundred.
 *
 * What it buys is that the particle population tracks the dye for free. Pour
 * into a corner and particles find it within a life; let a region evaporate
 * and the particles born there stop being born there. Nothing has to be told
 * where the dye is.
 */
export const SEED_WGSL = /* wgsl */ `${HEAD}${BILERP}
@group(0) @binding(2) var dye: texture_2d<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.count) { return; }
  var p = parts[i];

  // Alive, and not yet due. Nothing to do.
  if (p.tint.w < 1.0 && p.tint.w > 0.0) { return; }

  let h = pcg(i ^ (U.frame * 2654435761u) ^ U.seed);
  let uv = vec2f(rnd(h), rnd(h ^ 0x9e3779b9u));
  let there = bilerp(dye, uv, U.grid);
  if (there.a < U.floor) {
    // Dead, and nowhere to be born. Stay dead — and stay *exactly* dead, so
    // the splat reads a zero weight rather than a stale colour.
    parts[i] = Particle(uv, uv, vec4f(0.0, 0.0, 0.0, 0.0));
    return;
  }

  // Born. The colour is the dye's own, normalised out of its thickness so a
  // thick patch and a thin one of the same pigment give the same hue — the
  // thickness is the grid's business and the particle's job is the colour.
  let rgb = there.rgb / max(there.a, 1e-4);
  p.pos = uv;
  p.born = uv;
  // w is the age, and it starts a hair above zero: exactly zero is the code
  // for "dead" above, and a particle born at 0.0 would be reborn forever.
  p.tint = vec4f(rgb, 1e-3);
  parts[i] = p;
}`;

/**
 * Motion.
 *
 * Through `velForced` — the velocity the dye rides, current and all — and by
 * the same displacement the solver advects with, so a particle and the dye
 * under it travel together. Where they differ is that the dye is resampled
 * into its grid at every step and the particle is not: this is one add.
 *
 * Two steps of midpoint rather than one of Euler. A particle that lives for
 * hundreds of steps in a swirling field drifts off a circle under Euler
 * badly enough to see — the dye spirals out where it should turn — and the
 * midpoint costs one more sample of a texture already in cache.
 */
export const ADVECT_WGSL = /* wgsl */ `${HEAD}${BILERP}
@group(0) @binding(2) var vel: texture_2d<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= U.count) { return; }
  var p = parts[i];
  if (p.tint.w <= 0.0) { return; }

  let v0 = bilerp(vel, p.pos, U.grid).xy;
  let mid = p.pos + v0 * (U.disp * 0.5);
  let v1 = bilerp(vel, clamp(mid, vec2f(0.0), vec2f(1.0)), U.grid).xy;
  var next = p.pos + v1 * U.disp;

  // The dish is a box. A particle that reaches the wall stops there rather
  // than wrapping: the dye does not wrap either, and a particle reappearing
  // on the far side draws a line across the plate on its way.
  next = clamp(next, vec2f(0.0), vec2f(1.0));

  p.pos = next;
  p.tint = vec4f(p.tint.rgb, min(1.0, p.tint.w + U.dt / max(U.life, 1e-3)));
  parts[i] = p;
}`;

/**
 * The splat: one small soft disc per particle, added.
 *
 * Additive blending, so the accumulation is the blend hardware's rather than
 * four `atomicAdd`s into a storage buffer — simpler and faster, and the
 * reason this can afford a particle per cell or more.
 *
 * **It was one texel per particle first, and that was wrong**, in a way worth
 * writing down because it looked right in the code and the measurement caught
 * it. Four particles a cell land where the flow puts them, not evenly: some
 * texels take a dozen and their neighbours take none, so a point splat gives
 * a field whose texel-to-texel variation is the Poisson noise of the
 * sampling rather than anything about the liquid. On the plate that reads as
 * salt and pepper. `npm run detail` put a number on it — the typical local
 * gradient went from 0.7 to **0**, a picture that is flat almost everywhere
 * with a scatter of hard dots in it, while the structure at 1 px doubled.
 * Detail in the metric, speckle on the wall.
 *
 * So each particle covers a small disc instead, `RADIUS` texels across, with
 * a smooth falloff. That is kernel density estimation, and it is what the
 * plan meant by "takes density estimation with it, so sparse regions don't
 * come out noisy" — a reconstruction kernel over the sample positions, which
 * is not the same thing as diffusing the dye: it is applied once, at read
 * time, and never fed back into what the particles carry.
 *
 * Four vertices an instance as a triangle strip. The weight is a fade in and
 * out across the life — `sin(pi · age)`, zero at both ends — so a particle
 * neither appears nor vanishes; without it the plate twinkles, which is the
 * first thing anyone notices and the last thing a liquid should do.
 */
export const SPLAT_WGSL = /* wgsl */ `${STRUCT}${PARTICLE}
@group(0) @binding(0) var<uniform> U: Particles;
@group(0) @binding(1) var<storage, read> parts: array<Particle>;

/**
 * The disc's radius, in *splat target* texels — half a solver cell at
 * SPLAT_SCALE 2, which is the whole point: a particle draws something finer
 * than the grid the dye lives on, or it draws nothing the grid could not.
 */
const RADIUS: f32 = 1.5;

struct Out {
  @builtin(position) at: vec4f,
  @location(0) tint: vec4f,
  /** Where in the disc this fragment is, -1..1 on each axis. */
  @location(1) off: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  var o: Out;
  let p = parts[i];
  // The strip's four corners, as -1/+1 on each axis.
  let corner = vec2f(f32(v & 1u) * 2.0 - 1.0, f32(v >> 1u) * 2.0 - 1.0);
  if (p.tint.w <= 0.0) {
    // Dead: park it outside the clip volume so the rasteriser drops it
    // before any fragment is shaded.
    o.at = vec4f(0.0, 0.0, 2.0, 1.0);
    o.tint = vec4f(0.0);
    o.off = corner;
    return o;
  }
  // Grid uv to clip space. This target is sampled by the compositor, which
  // reads uv.y = 1 at row 0, so y is not flipped here — see FLIP_Y in
  // wgsl/plate.ts for the rule and what it cost to learn it.
  let centre = vec2f(p.pos.x * 2.0 - 1.0, p.pos.y * 2.0 - 1.0);
  let half = RADIUS / U.splat * 2.0;
  o.at = vec4f(centre + corner * half, 0.0, 1.0);
  let fade = sin(3.14159265 * clamp(p.tint.w, 0.0, 1.0));
  o.tint = vec4f(p.tint.rgb, 1.0) * (fade * U.gain);
  o.off = corner;
  return o;
}

@fragment
fn fs(o: Out) -> @location(0) vec4f {
  // A smooth kernel, and one that integrates to something stable: the disc's
  // total weight has to be the same wherever its centre falls between
  // texels, or a particle drifting across a texel boundary would flicker.
  let r2 = dot(o.off, o.off);
  if (r2 >= 1.0) { discard; }
  let k = 1.0 - r2;
  return o.tint * (k * k);
}`;
