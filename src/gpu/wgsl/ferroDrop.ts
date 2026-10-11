/**
 * The ferrofluid's surface in the closeup: a drop that stands up off the
 * glass and catches the light (PLAN §29a).
 *
 * What the owner asked for, 2026-10-11: "I want to see a drop of ferro fluid
 * with light reflecting off of it, with some dye on top of it as it gets
 * pulled through dyes". What the closeup drew was a flat black disc with a
 * brown line round it and one painted dot: the solver carries the
 * ferrofluid as a layer of one depth everywhere (a full cell is 0.3 l_c,
 * FILM_H0), so there was no surface to light, and the dot was a fixed
 * Blinn–Phong lobe placed by the distance to the edge, whatever the drop's
 * shape. Rendered in the lab with Ferro Paint's settings and a drop 0.03 of
 * the plate across, the drop's inside was one value of black to the byte.
 *
 * ## The shape: a sessile drop, and the magnet under it
 *
 * A drop of oil-based ferrofluid under water on clean glass beads up: the
 * glass would rather be wet by the water. Its surface is where the pressure
 * jump of surface tension balances its weight against the water's and the
 * magnet's pull (Rosensweig, Ferrohydrodynamics, §5.2, the ferrohydrostatic
 * Bernoulli equation with the interface's normal stress):
 *
 *     Δρ g h − σ ∇²h = p₀ + μ₀ ∫₀ᴴ M dH
 *
 * In units of the capillary length l_c = √(σ / Δρ g) (1.3 mm, SPIKE_PITCH /
 * 2π, the same one the standing film is measured in) that is
 *
 *     h − ∇²h = P + K(x)
 *
 * with h = 0 on the contact line, which is the solver's own: the ferrofluid's
 * half-full line, the edge the plate already draws as a razor line. K is the
 * magnet's term, the film's (standing.ts, kelvin): μ₀∫M dH for a Langevin
 * liquid, ln(sinh ξ / ξ), at the film's scale, in Δρ g l_c. P is set two
 * ways at once:
 *
 *  - By the contact angle θ, with no field: a puddle wider than a few l_c is
 *    flat on top at 2 sin(θ/2), the exact height of a large sessile drop.
 *  - By the volume, with one: the magnet does not add ferrofluid, it moves
 *    it. K is taken relative to its mean over the ferrofluid, so the drop
 *    rises over the magnet and sinks away from it by as much. A drop
 *    dragged by a magnet leans toward it, its front taller than its back.
 *
 * Relief / 3D (macroRelief) is the contact angle: 0 lies flat, as before,
 * and 1 is a bead at 160°. The default 0.7 is 112°, a drop 1.66 l_c (2.1 mm)
 * high, which is an oil drop on clean glass under water.
 *
 * ## The solve
 *
 * Jacobi sweeps of that screened Poisson equation on the plate's grid, warm
 * started from the last frame: a drop moves a cell a frame at most, and the
 * equation's own length is l_c, 2.4 cells on 384², so a few dozen sweeps a
 * frame follow it. The first frame in from cold takes more (FerroDrop.ts).
 * The contact line is a penalty, h pulled to nothing where the phase is
 * under half (Peskin's fictitious domain), so the drop's edge follows the
 * phase's sub-cell ramp rather than a staircase of whole cells.
 *
 * Shortcuts, each a PLAN item (§29):
 *  - The small-slope form of the surface's curvature (∇²h, not the full
 *    mean curvature), with the plateau set to the exact 2 sin(θ/2): the
 *    shape's edge rises over l_c as a large drop's does, but its slope at
 *    the contact line is not θ. A drop smaller than l_c comes out lower
 *    than its spherical cap.
 *  - The picture's drop is taller than the solver's: the solver carries a
 *    full cell as a layer 0.3 l_c deep (FILM_H0), and the picture stands the
 *    same footprint up to its sessile height. The volume the magnet moves
 *    is the picture's, held to its mean over all the ferrofluid on the
 *    plate, not drop by drop.
 *  - The magnets' field from the plate's uniforms, at the default Magnet
 *    Size's radius.
 */
import { SPIKES_WGSL, SPIKE_PITCH } from './spikes';
import { FILM_H0, PHASE_VIEW_TOP } from './standing';

const W = '@compute @workgroup_size(8, 8)';

/*
  The solve's arguments: the plate's grid, l_c in its cells, the drop's
  height on a wide flat top (2 sin θ/2, in l_c), the magnet's pull in the
  film's units, the Langevin scale, the most a drop can stand (the top
  glass, in l_c), the magnets' radius, and the magnets.
*/
const ARGS = /* wgsl */ `
struct DropArgs {
  grid: vec4f,   // n, l_c in cells, the plateau's height (l_c), the pull's scale
  more: vec4f,   // the Langevin scale, the most a drop stands (l_c), the magnet's radius, 0
  mags: array<vec4f, 4>,
};
@group(0) @binding(0) var<uniform> A: DropArgs;
fn magnetRadius() -> f32 { return A.more.z; }
`;

/*
  Where the ferrofluid is (chi, 1 inside the half-full line) and the
  magnet's term there. The magnets' fields add as shares of the hand's at
  the glass, which is how the solver's own film sums them.
*/
const SOURCE = /* wgsl */ `${ARGS}${SPIKES_WGSL}
@group(0) @binding(1) var view: texture_2d<u32>;
@group(0) @binding(2) var dst: texture_storage_2d<rg32float, write>;
fn kelvin(x: f32) -> f32 {
  if (x < 0.01) { return x * x / 6.0; }
  return x + log((1.0 - exp(-2.0 * x)) / (2.0 * x));
}
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = u32(A.grid.x);
  if (id.x >= n || id.y >= n) { return; }
  let phase = unpack2x16unorm(textureLoad(view, vec2i(id.xy), 0).x).x * ${PHASE_VIEW_TOP}.0;
  let chi = clamp((phase - 0.2) / 0.6, 0.0, 1.0);
  let p = (vec2f(id.xy) + 0.5) / f32(n);
  var b = 0.0;
  for (var k = 0; k < 4; k++) { b += magnetShare(p, A.mags[k]); }
  textureStore(dst, vec2i(id.xy), vec4f(chi, kelvin(b / A.more.x), 0.0, 0.0));
}`;

/*
  The magnet's term's mean over the ferrofluid, so the field moves the drop's
  volume rather than adding to it: one workgroup, each thread a stride of
  the grid, then a tree.
*/
const MEAN = /* wgsl */ `${ARGS}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> mean: array<f32, 2>;
var<workgroup> sums: array<vec2f, 256>;
@compute @workgroup_size(256) fn main(@builtin(local_invocation_index) t: u32) {
  let n = u32(A.grid.x);
  var s = vec2f(0.0);
  for (var i = t; i < n * n; i += 256u) {
    let c = textureLoad(src, vec2i(i32(i % n), i32(i / n)), 0).xy;
    s += vec2f(c.x, c.x * c.y);
  }
  sums[t] = s;
  workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) {
    if (t < w) { sums[t] += sums[t + w]; }
    workgroupBarrier();
  }
  if (t == 0u) { mean[0] = sums[0].x; mean[1] = sums[0].y / max(sums[0].x, 1e-6); }
}`;

/*
  One Jacobi sweep of h − ∇²h = P + K − K̄ inside the drop, h pulled to
  nothing outside it. In cells, with L = l_c in cells:
  (4 + 1/L² + κ(1 − chi)) h = Σ neighbours + chi (P + K − K̄) / L².
  κ (40) is the contact line's penalty: on the half-full line itself a cell
  holds a sixth of its neighbours' mean, a fifth full nothing.
*/
const RELAX = /* wgsl */ `${ARGS}
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> mean: array<f32, 2>;
@group(0) @binding(3) var hin: texture_2d<f32>;
@group(0) @binding(4) var hout: texture_storage_2d<r32float, write>;
fn hAt(q: vec2i, n: i32) -> f32 { return textureLoad(hin, clamp(q, vec2i(0), vec2i(n - 1)), 0).x; }
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = i32(A.grid.x);
  let q = vec2i(id.xy);
  if (q.x >= n || q.y >= n) { return; }
  let c = textureLoad(src, q, 0).xy;
  let L = A.grid.y;
  let a = 1.0 / (L * L);
  let s = clamp(A.grid.z + A.grid.w * (c.y - mean[1]), 0.0, A.more.y);
  let nb = hAt(q + vec2i(1, 0), n) + hAt(q - vec2i(1, 0), n) + hAt(q + vec2i(0, 1), n) + hAt(q - vec2i(0, 1), n);
  let h = (nb + c.x * s * a) / (4.0 + a + 40.0 * (1.0 - c.x));
  textureStore(hout, q, vec4f(min(h, A.more.y), 0.0, 0.0, 0.0));
}`;

/*
  The packed flow (pack.ts, packVel) with the drop's height in its third
  channel, which the display reads (FERRO_DROP_WGSL): the solve's height,
  and on it the standing film's domes, a cell past full being a dome that
  much taller than the layer (FILM_H0 l_c a full cell).
*/
const PACK = /* wgsl */ `
struct PackArgs { n: f32, pad0: f32, pad: vec2f };
@group(0) @binding(0) var<uniform> A: PackArgs;
@group(0) @binding(1) var vel: texture_2d<f32>;
@group(0) @binding(2) var h: texture_2d<f32>;
@group(0) @binding(3) var view: texture_2d<u32>;
@group(0) @binding(4) var dst: texture_storage_2d<rgba16float, write>;
${W} fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.n) || id.y >= u32(A.n)) { return; }
  let q = vec2i(id.xy);
  let v = textureLoad(vel, q, 0).xy;
  let phase = unpack2x16unorm(textureLoad(view, q, 0).x).x * ${PHASE_VIEW_TOP}.0;
  let z = textureLoad(h, q, 0).x + ${FILM_H0} * max(phase - 1.0, 0.0);
  textureStore(dst, q, vec4f(clamp(v, vec2f(-60000.0), vec2f(60000.0)), z, 1.0));
}`;

export const DROP_KERNELS = { dropSource: SOURCE, dropMean: MEAN, dropRelax: RELAX, packVelDrop: PACK } as const;

/*
  The ferrofluid's refractive index, by Maxwell Garnett: 8% by volume of
  magnetite (n 2.4 + 0.6i) in a hydrocarbon carrier (1.45) is 1.52 + 0.03i.
  The imaginary part is what makes it black (it takes everything the surface
  does not reflect within a few tens of microns) and adds a ten-thousandth
  to the reflectance, so it is left out. Seen from the water the surface
  reflects 0.45% straight on, more toward grazing (Fresnel): a black gloss
  under water is darker than one in air (4.3%), which is why it takes
  bright lights to see its shape.
*/
const N_WATER = 1.333;
const N_FERRO = 1.52;
/*
  The lights, as a macro photographer lights a wet black subject: a large
  softbox up and to the left of the frame (where the plate's glint has
  always been), a panel close in, about 70° by 50° of sky, hotter in its middle as a real
  one is, and a long strip low on the other side to draw the far rim; each
  as bright as a lamp's face is against the dye it lights (200 and 110
  times a white the plate draws at 1), so that through 0.45% of reflectance
  the key is a window near 0.9. Round them a dim tent, 1.5 overhead and 6
  at the horizon: through the same 0.45% it is a grey just above black,
  which is all a black gloss shows of a room. Seen from under the water the
  tent's horizon is the edge of Snell's window, where the drop's slope
  reaches 24°; past it the drop mirrors the plate instead. Straight up is
  the camera's own lens, the dark spot on the top of every dome in a macro
  photograph.
*/
const ROOM = { top: 1.5, horizon: 6 };
const KEY = { radiance: 200, tanU: Math.tan((35 * Math.PI) / 180), tanV: Math.tan((25 * Math.PI) / 180) };
const STRIP = { radiance: 110, tanU: Math.tan((40 * Math.PI) / 180), tanV: Math.tan((4 * Math.PI) / 180), elevation: (20 * Math.PI) / 180 };

/**
 * The display's drawing of the drop (DISPLAY_MAIN, the ferrofluid's block):
 * what a camera above the top glass sees of the drop's surface. Needs the
 * display's bindings (vel0, layer0) and its decode.
 */
export const FERRO_DROP_WGSL = /* wgsl */ `
const LC_UV = ${SPIKE_PITCH / (2 * Math.PI)};
const DROP_N_WATER = ${N_WATER};
const DROP_N_FERRO = ${N_FERRO};

/*
  The drop's surface height at uv, in l_c (FerroDrop's solve, packed into
  the flow's third channel), through a cubic B-spline: the reflection turns
  the surface's curvature into the shape of every highlight, and through the
  plate's Catmull-Rom (continuous in slope, not in curvature) each cell's
  edge was a kink in the key's window and the strip's arc drew a ring at
  every cell. The B-spline is continuous in curvature, at the cost of
  softening the surface by about a cell, which is under l_c on every grid
  the app runs. Four bilinear reads (Sigg and Hadwiger's form).
*/
fn dropHeight(uv: vec2f) -> f32 {
  let n = U.gridSize;
  let p = uv * n - 0.5;
  let i = floor(p);
  let f = p - i;
  let f2 = f * f; let f3 = f2 * f;
  let w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  let w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  let w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  let w3 = f3 / 6.0;
  let g0 = w0 + w1; let g1 = w2 + w3;
  let h0 = (i - 0.5 + w1 / g0) / n; let h1 = (i + 1.5 + w3 / g1) / n;
  let a = tex2(vel0, vec2f(h0.x, h0.y)).z; let b = tex2(vel0, vec2f(h1.x, h0.y)).z;
  let c = tex2(vel0, vec2f(h0.x, h1.y)).z; let d = tex2(vel0, vec2f(h1.x, h1.y)).z;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}

/*
  Fresnel's reflectance for unpolarised light at a dielectric, from the side
  of index 1 to the side of relative index m, at cos c of incidence (the
  exact form, not Schlick's: past 60° Schlick's runs a quarter low at m 1.2).
*/
fn fresnel(c: f32, m: f32) -> f32 {
  let g2 = m * m - 1.0 + c * c;
  if (g2 <= 0.0) { return 1.0; }
  let g = sqrt(g2);
  let a = (g - c) / (g + c);
  let b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
  return 0.5 * a * a * (1.0 + b * b);
}

/* A rectangular light facing the plate from direction d, seen along R: 1 at its middle, edges a degree or two soft. */
fn softbox(R: vec3f, d: vec3f, tu: f32, tv: f32) -> f32 {
  let w = dot(R, d);
  if (w <= 0.0) { return 0.0; }
  let t1 = normalize(vec3f(-d.y, d.x, 0.0));
  let t2 = cross(d, t1);
  let u = abs(dot(R, t1) / w);
  let v = abs(dot(R, t2) / w);
  let box = smoothstep(tu + 0.03, tu - 0.03, u) * smoothstep(tv + 0.03, tv - 0.03, v);
  // A diffuser's falloff: the middle half again as bright as its edge.
  return box * (1.0 - 0.35 * clamp(max(u / tu, v / tv), 0.0, 1.0));
}

/* The room above the plate along R (in the air, z up), with the key and the strip in it. */
fn studio(R: vec3f, key: vec3f) -> vec3f {
  let lens = 1.0 - smoothstep(0.9877, 0.9962, R.z);
  var c = vec3f(${ROOM.top.toFixed(1)} + ${(ROOM.horizon - ROOM.top).toFixed(1)} * (1.0 - R.z)) * lens;
  c += vec3f(1.0, 0.97, 0.92) * ${KEY.radiance.toFixed(1)} * softbox(R, key, ${KEY.tanU}, ${KEY.tanV});
  let away = -normalize(key.xy);
  let strip = vec3f(away * ${Math.cos(STRIP.elevation)}, ${Math.sin(STRIP.elevation)});
  c += vec3f(0.92, 0.96, 1.0) * ${STRIP.radiance.toFixed(1)} * softbox(R, strip, ${STRIP.tanU}, ${STRIP.tanV});
  return c;
}

/*
  The light the dye column at uv lets through, one way across the whole gap:
  the decode's own unit absorbance and amount (decodeFluidRaw), whatever the
  look's ground, since the drop is seen in reflection through the dye.
*/
fn dyeColumnAt(uv: vec2f) -> vec3f {
  let raw = textureBicubic(layer0, uv);
  let total = decodeDensity(raw.a);
  if (total < 0.001 / DENSITY_SCALE) { return vec3f(1.0); }
  let unit = exp(-vec3f(decodeDensity(raw.r), decodeDensity(raw.g), decodeDensity(raw.b)) / total);
  let amount = mix(total * 2.8, max(0.0, total - U.filmLevel) * U.filmGain, clamp(U.macroOn, 0.0, 1.0));
  return pow(max(unit, vec3f(1e-4)), vec3f(amount));
}

/* The plate as the camera sees it at uv: the dye on its ground, as the display composites it. */
fn plateSeen(uv: vec2f, bg: vec3f) -> vec3f {
  let keep = dyeThrough;
  let f = decodeFluid(layer0, uv, 0.0, false);
  let c = onGround(bg, f, dyeThrough);
  dyeThrough = keep;
  return c;
}

/*
  What the camera sees of the drop's surface at fuv: the room, the key and
  the plate round it reflected in the curved surface, seen back through the
  dyed water above it.

  The camera is far overhead, so the eye ray is straight down. Its
  reflection off the surface (normal from the height's slope) leaves into
  the water, and out through the flat top glass into the room, bent by
  Snell. Past 48.6° from straight up it cannot leave: it reflects whole off
  the top glass and comes down onto the plate a few millimetres off, so a
  drop's steep shoulders show the colours round it. A ray turned downward
  (a side steeper than 45°) lands on the glass beside the drop.

  The dye: the water over the drop is the gap less the drop's height, and
  the light goes down through it and back up, so the reflection is filtered
  by the column's dye to the power 2(1 − h/gap): the top of a tall drop is
  the clearest, its foot the most coloured.
*/
fn ferroDropSeen(fuv: vec2f, key: vec3f, bg: vec3f, gapLc: f32) -> vec3f {
  let e = 0.5 / U.gridSize;
  let h = dropHeight(fuv);
  let hx = (dropHeight(fuv + vec2f(e, 0.0)) - dropHeight(fuv - vec2f(e, 0.0))) / (2.0 * e) * LC_UV;
  let hy = (dropHeight(fuv + vec2f(0.0, e)) - dropHeight(fuv - vec2f(0.0, e))) / (2.0 * e) * LC_UV;
  let N = normalize(vec3f(-hx, -hy, 1.0));
  let Rw = vec3f(2.0 * N.z * N.xy, 2.0 * N.z * N.z - 1.0);
  let F = fresnel(N.z, DROP_N_FERRO / DROP_N_WATER);
  let sinw = length(Rw.xy);
  let dir = select(vec2f(0.0), Rw.xy / max(sinw, 1e-6), sinw > 1e-6);
  let above = max(gapLc - h, 0.0);
  var seen: vec3f;
  if (Rw.z > 0.0 && sinw * DROP_N_WATER < 1.0) {
    let sa = sinw * DROP_N_WATER;
    seen = studio(vec3f(dir * sa, sqrt(1.0 - sa * sa)), key);
  } else if (Rw.z > 0.0) {
    let travel = sinw / Rw.z * (above + gapLc);
    seen = plateSeen(fuv + dir * travel * LC_UV, bg);
  } else {
    let travel = h * sinw / max(-Rw.z, 0.05);
    seen = plateSeen(fuv + dir * travel * LC_UV, bg);
  }
  let dye = pow(dyeColumnAt(fuv), vec3f(2.0 * above / max(gapLc, 1e-3)));
  return F * seen * dye;
}
`;
