/**
 * The plate's lens pass in WGSL (PLAN 47e, 47d, 47b-side): glitter suspended
 * in the liquid, photographed through a real lens, and a second lamp raking in
 * from the side. The physics and every constant are in `lib/glint.ts`, whose
 * header says what each law is and where it comes from; this file computes the
 * same laws per speck and per pixel, and `npm run glint` holds the two together.
 *
 * Three passes, run by `gpu/glint.ts` after the plate when Glitter or Side
 * Light is up (at 0 and 0 none of this runs and the plate draws as it did):
 *
 *   STEP   one thread a speck: carried by the gap's Poiseuille flow at its
 *          own depth, turned through its Jeffery orbit by the shear across
 *          the gap, settled by Stokes, reborn when its life is up.
 *   SPLAT  one instance a speck, additive into a half-float picture of the
 *          specks' light: a disc of the aperture's shape at the defocus the
 *          speck's depth gives, and three thin quads for the six diffraction
 *          spikes, energy conserved, in linear light. Its alpha is the light
 *          the flakes block (their shadow on the lamp).
 *   LENS   one pass over the screen: the plate's picture to linear light, the
 *          specks' shadow and light, the side lamp's light from the dye and
 *          from the walls facing it, back to the display's values, and the
 *          finish (dimmer, mark, dither) the plate would have laid itself.
 *
 * Why a pass after the plate and not more lines in it. The display shader is
 * at WebGPU's limit of sixteen textures and is the largest file in the repo,
 * held by `npm run sizes` from growing at all; and light must be added in
 * linear light, which the plate's picture (display values) is not, so the
 * addition cannot be a blend onto it either. Drawn here, the plate's own
 * picture is the input, read back to linear, and nothing in it changes.
 */

import { PLATE_STRUCT } from './plateFields';
import { FINISH_WGSL } from './plate';
import { SOFTBOX_GAIN, SOFTBOX_HALF, SOFTBOX_TILT } from './closeupDepth';
import {
  FLAKE_ASPECT, FLAKE_CRINKLE, FLAKE_DENSITY_EXCESS, FLAKE_RADIUS, FLAKE_REFLECT, GAP_METRES, IRIS_BLADES, IRIS_TURN,
  N_WATER, PLATE_METRES, SENSOR_METRES, SIDE_LAMP_RADIUS, SIDE_SCATTER, SPECK_LIFE, SPIKE_FLOOR,
  SPIKE_MAX_PX, SPIKE_SHARE, WALL_FRESNEL, WALL_SPREAD, WATER_VISCOSITY, WAVELENGTH, WIDE_OPEN,
} from '../../lib/glint';

const f = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** One speck, three rows: where (x, y in plate uv, z across the gap, the orbit's phase), what (radius m, aspect, orbit's lean, the flow's heading), when (age s, life s, generation, alive). */
const SPECK = /* wgsl */ `
struct Speck {
  a: vec4f,
  b: vec4f,
  c: vec4f,
};
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn rnd(v: u32) -> f32 { return f32(pcg(v) >> 8u) * (1.0 / 16777216.0); }
const PI = 3.14159265359;
`;

/** Bytes per speck. */
export const SPECK_STRIDE = 48;

/** The step's own four numbers: how many specks run, the plate-uv a unit of velocity carried the dye this frame, the seconds, a seed. */
export const STEP_WGSL = /* wgsl */ `${SPECK}
struct Step { count: f32, disp: f32, dt: f32, seed: f32 };
@group(0) @binding(0) var<uniform> S: Step;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var vel: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> specks: array<Speck>;

/*
  Stokes on the sphere of a flake's volume (lib/glint settlingSpeed), in gap
  widths a second: 2/9 Δρ g a_eq² / μ with a_eq = (1.5 r)^(1/3) a.
*/
fn settle(a: f32, r: f32) -> f32 {
  let aEq = pow(1.5 * r, 1.0 / 3.0) * a;
  return (2.0 / 9.0) * ${f(FLAKE_DENSITY_EXCESS * 1000 * 9.81)} * aEq * aEq / ${f(WATER_VISCOSITY)} / ${f(GAP_METRES)};
}

fn born(i: u32, gen: f32, first: bool) -> Speck {
  let k = i * 9781u + u32(gen) * 6271u + u32(S.seed);
  var s: Speck;
  let lnA = mix(log(${f(FLAKE_RADIUS[0])}), log(${f(FLAKE_RADIUS[1])}), rnd(k + 5u));
  let life = mix(${f(SPECK_LIFE[0])}, ${f(SPECK_LIFE[1])}, rnd(k + 9u));
  s.a = vec4f(mix(0.01, 0.99, rnd(k + 1u)), mix(0.01, 0.99, rnd(k + 2u)), mix(0.03, 0.97, rnd(k + 3u)), rnd(k + 4u) * 2.0 * PI);
  // The orbit's lean off the shear plane: Jeffery's orbit constant, spread (a stand-in, PLAN 47e-2).
  s.b = vec4f(exp(lnA), mix(${f(FLAKE_ASPECT[0])}, ${f(FLAKE_ASPECT[1])}, rnd(k + 6u)), (rnd(k + 7u) - 0.5) * 1.2, rnd(k + 8u) * 2.0 * PI);
  // The plate starts full: the first generation is met part way through its life, so nothing fades in at the opening.
  s.c = vec4f(select(0.0, rnd(k + 10u) * life, first), life, gen + 1.0, 1.0);
  return s;
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (f32(i) >= S.count) { return; }
  var s = specks[i];
  if (s.c.w < 0.5) { specks[i] = born(i, s.c.z, s.c.z < 0.5); return; }

  let z = s.a.z;
  let floorZ = 0.02;
  if (z > floorZ) {
    // Carried at its own depth's speed (Poiseuille across the gap, mean 1), midpoint as the particles are.
    let k = 6.0 * z * (1.0 - z);
    let v0 = textureSampleLevel(vel, samp, s.a.xy, 0.0).xy;
    let mid = clamp(s.a.xy + v0 * (S.disp * k * 0.5), vec2f(0.0), vec2f(1.0));
    let v1 = textureSampleLevel(vel, samp, mid, 0.0).xy;
    s.a = vec4f(clamp(s.a.xy + v1 * (S.disp * k), vec2f(0.005), vec2f(0.995)), z, s.a.w);
    // The shear across the gap, γ̇ t = 6 (1 − 2z) ū t / gap, turns it through its Jeffery orbit.
    let travel = length(v1) * S.disp * ${f(PLATE_METRES)};
    let strain = 6.0 * (1.0 - 2.0 * z) * travel / ${f(GAP_METRES)};
    let r = s.b.y;
    s.a.w = s.a.w + strain * r / (1.0 + r * r);
    if (s.a.w > 2.0 * PI) { s.a.w -= 2.0 * PI; }
    if (s.a.w < 0.0) { s.a.w += 2.0 * PI; }
    if (length(v1) > 1e-4) { s.b.w = atan2(v1.y, v1.x); }
    // Settling, and landing: on the floor glass it lies flat and stays (held by the glass).
    s.a.z = z - settle(s.b.x, r) * S.dt;
    if (s.a.z <= floorZ) { s.a.z = floorZ; s.a.w = 0.0; }
  }
  s.c.x = s.c.x + S.dt;
  if (s.c.x >= s.c.y) { s = born(i, s.c.z, false); }
  specks[i] = s;
}`;

/*
  Shared by the splat and the lens: the plate's uniforms, linear light, and
  where a screen point is on the stage. The plate's picture holds display
  values; light adds in linear light (the 29a-10 fix took the same road).
*/
const COMMON = /* wgsl */ `
${PLATE_STRUCT}
@group(0) @binding(0) var<uniform> U: Plate;
@group(0) @binding(1) var samp: sampler;
fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }
fn toLinear(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(2.2)); }
fn toDisplay(c: vec3f) -> vec3f { return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2)); }
fn maxRes() -> f32 { return max(U.resolution.x, U.resolution.y); }
fn zoomOf() -> f32 { return max(1.0, U.camZoom); }
/* Metres of stage from the dish's centre, screen axes (the lamp's hot-spot's own step, plate.ts). */
fn stageAt(uv: vec2f) -> vec2f {
  return ((uv - 0.5) * U.resolution / (maxRes() * 1.5 * U.camZoom) + U.camCenter - 0.5) * ${f(PLATE_METRES)};
}
/* The side lamp seen from a stage point: its direction in the water (toward it, Snell at the glass) and its angular radius there. */
fn sideRay(stage: vec2f) -> vec4f {
  let foot = U.sideLamp.xy * U.sideLamp.z;
  let toLamp = vec3f(foot - stage, U.sideLamp.w);
  let d = length(toLamp);
  let air = toLamp / d;
  let sinW = length(air.xy) / ${f(N_WATER)};
  let dir = select(vec2f(0.0), normalize(air.xy) * sinW, sinW > 1e-5);
  let r0 = ${f(SIDE_LAMP_RADIUS)} * length(vec2f(U.sideLamp.z, U.sideLamp.w)) / d;
  return vec4f(dir, sqrt(1.0 - sinW * sinW), r0);
}
/* A mirror of normal n under a lens straight above: the share of the lamp's radiance it shows (lib/glint flakeMirror), its slope spread by spread. */
fn mirrorShare(n: vec3f, l: vec3f, lampR: f32, spread: f32) -> f32 {
  let r = vec3f(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
  let b = acos(clamp(dot(r, l), -1.0, 1.0));
  let s2 = lampR * lampR + 4.0 * spread * spread;
  return (lampR * lampR / s2) * exp(-(b * b) / (2.0 * s2));
}
/*
  The dye's colour as a filter, from the picture the plate drew. On the lamp
  the picture is the lamp through the dye, so the picture is the dye's
  transmission. On black the dye is its own light: a fluorescent dye's glow
  is its emission, and in visible light such a dye is pale (quinine,
  fluorescein and the rest absorb in the near UV and the blue, PLAN 47c), so
  it lets a side lamp's light through and scatters it nearly white: an amber
  lamp over a blue glow reads amber on the glow, as in the films. Blended in
  by how much dye is there (aux.z).
*/
fn dyeFilter(lin: vec3f, amount: f32) -> vec3f {
  let t = mix(vec3f(1.0), clamp(lin, vec3f(0.0), vec3f(1.0)), clamp(U.lampGround, 0.0, 1.0));
  return mix(vec3f(1.0), t, clamp(amount, 0.0, 1.0));
}
`;

/*
  The splat. Instance i is speck i; vertices 0 to 5 its disc, 6 to 23 three
  thin quads, each carrying two opposite spikes. Six blades make a hexagon
  whose edges' normals point at IRIS_TURN + 30° + k 60°: the spikes lie along
  them, both ways.
*/
const SPIKE_LINES = IRIS_BLADES / 2;
export const SPLAT_VERTS = 6 * (1 + SPIKE_LINES);

export const SPLAT_WGSL = /* wgsl */ `${SPECK}${COMMON}
@group(0) @binding(2) var<storage, read> specks: array<Speck>;
@group(0) @binding(3) var scene: texture_2d<f32>;
@group(0) @binding(4) var aux: texture_2d<f32>;

struct Out {
  @builtin(position) pos: vec4f,
  @location(0) @interpolate(flat) centre: vec2f,
  @location(1) @interpolate(flat) energy: vec3f,
  @location(2) @interpolate(flat) shape: vec4f,     // disc radius px, blades' share, shadow, focus weight
  @location(3) @interpolate(flat) airy: vec3f,
  @location(4) @interpolate(flat) line: vec4f,      // direction, quad kind (0 disc, 1 spike), unused
};

fn culled() -> Out {
  var o: Out;
  o.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  return o;
}

/* The hexagon's area against its circumradius squared, and the circle's, blended by how far the iris shows its blades. */
fn shapeArea(blades: f32) -> f32 {
  return mix(PI, ${f(IRIS_BLADES / 2)} * sin(${f((2 * Math.PI) / IRIS_BLADES)}), blades);
}

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let s = specks[i];
  if (s.c.w < 0.5) { return culled(); }
  // Plate uv to screen uv: uvToFluid (plate.ts) backwards.
  let ang = U.rotation0;
  let c = cos(-ang);
  let sn = sin(-ang);
  let pxPerUv = maxRes() * 1.5 * U.camZoom;
  let q = (s.a.xy - U.camCenter) * pxPerUv;
  let p = vec2f(c * q.x + sn * q.y, -sn * q.x + c * q.y);
  let uv = p / U.resolution + 0.5;
  let centre = uv * U.resolution;
  let res = U.resolution;
  if (centre.x < -${f(SPIKE_MAX_PX)} || centre.y < -${f(SPIKE_MAX_PX)} || centre.x > res.x + ${f(SPIKE_MAX_PX)} || centre.y > res.y + ${f(SPIKE_MAX_PX)}) { return culled(); }

  // The lens (lib/glint: lensMagnification, pixelsPerMetre, defocusRadiusPx, airyRadiusPx).
  let zoom = zoomOf();
  let pxPerM = 1.5 * maxRes() * zoom / ${f(PLATE_METRES)};
  let m = ${f(SENSOR_METRES * 1.5 / PLATE_METRES)} * zoom;
  let stop = max(0.5, U.lensStop);
  let rDefocus = 0.5 * abs(s.a.z - U.projectorFocus) * ${f(GAP_METRES)} * m / (stop * (1.0 + m)) * pxPerM;
  let airy = 1.22 * vec3f(${f(WAVELENGTH[0])}, ${f(WAVELENGTH[1])}, ${f(WAVELENGTH[2])}) * stop * (1.0 + m) / m * pxPerM;

  // The flake's normal: tilted from flat by its Jeffery angle, toward the flow's heading (turned to the screen) leaned by its orbit.
  let r = s.b.y;
  let tilt = atan2(r * sin(s.a.w), cos(s.a.w));
  let head = s.b.w + ang + s.b.z;
  let n = vec3f(vec2f(cos(head), sin(head)) * sin(tilt), cos(tilt));

  // What it shows: the side lamp and, in the closeup, the softbox, each by the mirror law.
  var light = vec3f(0.0);
  if (U.sideLight > 0.0) {
    let ray = sideRay(stageAt(uv));
    light += U.sideColor * (U.sideLight * ${f(FLAKE_REFLECT)} * mirrorShare(n, ray.xyz, ray.w, ${f(FLAKE_CRINKLE)}));
  }
  if (U.macroOn > 0.001 && U.lightPlay > 0.001) {
    let rw = vec3f(2.0 * n.z * n.xy, 2.0 * n.z * n.z - 1.0);
    let sa = ${f(N_WATER)} * length(rw.xy);
    if (rw.z > 0.0 && sa < 1.0) {
      let air = vec3f(select(vec2f(0.0), normalize(rw.xy) * sa, sa > 1e-5), sqrt(1.0 - sa * sa));
      let toBox = vec3f(vec2f(-0.70710678, 0.70710678) * sin(${f(SOFTBOX_TILT)}), cos(${f(SOFTBOX_TILT)}));
      let off = acos(clamp(dot(air, toBox), -1.0, 1.0));
      let seen = 1.0 - smoothstep(${f(SOFTBOX_HALF * 0.8)}, ${f(SOFTBOX_HALF * 1.2)}, off);
      light += vec3f(${f(SOFTBOX_GAIN)} * U.lightPlay * U.lightPlay * clamp(U.macroOn, 0.0, 1.0) * ${f(FLAKE_REFLECT)} * seen);
    }
  }
  // Through the dye above it, down and back up (about 2.4 of its depth's share of the layer).
  // (Named at the sample, not through tex2: the layout reads a vertex stage's sampled textures from the call.)
  let under = toLinear(textureSampleLevel(scene, samp, uv, 0.0).rgb);
  let filt = pow(dyeFilter(under, textureSampleLevel(aux, samp, uv, 0.0).z), vec3f(2.4 * (1.0 - s.a.z)));
  // Fading in at birth and out at the end of its life, so a rebirth is not a pop.
  let fade = smoothstep(0.0, 1.5, s.c.x) * smoothstep(0.0, 1.5, s.c.y - s.c.x);
  let aPx = s.b.x * pxPerM;
  let area = PI * aPx * aPx * cos(tilt) * fade;
  let energy = light * filt * area;
  let shadow = area;
  let peak = max(energy.r, max(energy.g, energy.b));
  if (peak < 1e-4 && shadow < 1e-4) { return culled(); }

  let core2 = aPx * aPx + airy.g * airy.g + 0.25;
  let radius = sqrt(rDefocus * rDefocus + core2);
  let blades = smoothstep(${f(WIDE_OPEN)}, ${f(WIDE_OPEN * 2)}, stop);
  let focusW = core2 / (core2 + rDefocus * rDefocus);

  var o: Out;
  o.centre = centre;
  o.energy = energy / (shapeArea(blades) * radius * radius);
  o.shape = vec4f(radius, blades, shadow / (shapeArea(blades) * radius * radius), focusW);
  o.airy = airy;
  let corner = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0))[v % 6u];
  let quad = v / 6u;
  var at = centre;
  if (quad == 0u) {
    at = centre + corner * (radius + 1.5);
    o.line = vec4f(0.0, 0.0, 0.0, 0.0);
  } else {
    // The spikes carry energy only near focus: past it the picture is the aperture's shape, not its diffraction.
    let reach = min(${f(SPIKE_MAX_PX)}, sqrt(${f(SPIKE_SHARE)} * peak * focusW * airy.r / (${f(IRIS_BLADES)} * max(0.7, airy.r) * ${f(SPIKE_FLOOR)})));
    if (reach < 2.0) { return culled(); }
    let dirA = ${f(IRIS_TURN + Math.PI / IRIS_BLADES)} + f32(quad - 1u) * ${f((2 * Math.PI) / IRIS_BLADES)};
    let d = vec2f(cos(dirA), sin(dirA));
    let w = max(0.7, airy.r) * 3.0 + 1.0;
    at = centre + d * (corner.x * reach) + vec2f(-d.y, d.x) * (corner.y * w);
    o.energy = energy;
    o.line = vec4f(d, 1.0, 0.0);
  }
  // Into a picture the lens pass samples (stored GL's way up, FLIP_Y in plate.ts): clip y runs against uv.
  o.pos = vec4f(at.x / res.x * 2.0 - 1.0, -(at.y / res.y * 2.0 - 1.0), 0.0, 1.0);
  return o;
}

/* The hexagon's (or the circle's) distance, 1 on its edge, for an offset in units of its circumradius. */
fn apertureDistance(p: vec2f, blades: f32) -> f32 {
  var hex = 0.0;
  for (var k = 0; k < ${IRIS_BLADES}; k++) {
    let a = ${f(IRIS_TURN + Math.PI / IRIS_BLADES)} + f32(k) * ${f((2 * Math.PI) / IRIS_BLADES)};
    hex = max(hex, dot(p, vec2f(cos(a), sin(a))));
  }
  return mix(length(p), hex / ${f(Math.cos(Math.PI / IRIS_BLADES))}, blades);
}

@fragment fn fs(o: Out) -> @location(0) vec4f {
  // Rows of this picture run with uv (it is drawn flipped), so the fragment's place is uv times the size as it stands.
  let off = o.pos.xy - o.centre;
  if (o.line.z < 0.5) {
    let radius = o.shape.x;
    let d = apertureDistance(off / radius, o.shape.y);
    let soft = 0.75 / radius;
    let inside = 1.0 - smoothstep(1.0 - soft, 1.0 + soft, d);
    return vec4f(o.energy * inside, o.shape.z * inside);
  }
  // One spike pair: SPIKE_SHARE E r_a / (arms (r² + r_a²)) along it, a Gaussian line of the Airy width across, per colour.
  let t = dot(off, o.line.xy);
  let across = dot(off, vec2f(-o.line.y, o.line.x));
  let w = max(vec3f(0.6), o.airy);
  let alongI = ${f(SPIKE_SHARE)} * o.energy * o.airy / (${f(IRIS_BLADES)} * (t * t + o.airy * o.airy));
  let acrossI = exp(-(across * across) / (2.0 * w * w)) / (2.5066283 * w);
  return vec4f(alongI * acrossI * o.shape.w, 0.0);
}`;

/*
  The lens. The plate's picture (drawn flipped into a texture of this pass's
  own), the specks' light and shadow, the side lamp on the liquid, and the
  finish. Its vertex stage is the camera's.
*/
export const LENS_WGSL = /* wgsl */ `${COMMON}
const PI = 3.14159265359;
@group(0) @binding(2) var scene: texture_2d<f32>;
@group(0) @binding(3) var glints: texture_2d<f32>;
@group(0) @binding(4) var aux: texture_2d<f32>;
@group(0) @binding(5) var markTex: texture_2d<f32>;
${FINISH_WGSL}
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};
override FLIP_Y: f32 = 1.0;
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  out.uv = xy * 0.5 + 0.5;
  return out;
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  var lin = toLinear(tex2(scene, uv).rgb);
  let g = tex2(glints, uv);
  let a = tex2(aux, uv);
  let base = lin;
  // The flakes' shadow on what is behind them, then their light.
  lin = lin * (1.0 - clamp(g.a, 0.0, 1.0)) + g.rgb;

  if (U.sideLight > 0.0) {
    let stage = stageAt(uv);
    let ray = sideRay(stage);
    // Its irradiance on the glass: the lamp's radiance over its disc, slanting in (lib/glint sideFalloff).
    let foot = U.sideLamp.xy * U.sideLamp.z;
    let toLamp = vec3f(foot - stage, U.sideLamp.w);
    let cosIn = U.sideLamp.w / length(toLamp);
    let irr = U.sideLight * PI * ray.w * ray.w * cosIn;
    // The pigment sends a share back up, coloured by the dye it is (none where the glass is clear).
    let scatter = irr * ${f(SIDE_SCATTER)} / PI * dyeFilter(base, a.z) * clamp(a.z, 0.0, 1.0);
    // The walls facing it, bubbles' and drops' and the dye's own relief, reflect it by Fresnel (aux.xy is minus the normal's tilt).
    let nxy = -(a.xy * 2.0 - 1.0);
    let n = vec3f(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    let wall = U.sideLight * ${f(WALL_FRESNEL)} * mirrorShare(n, ray.xyz, ray.w, ${f(WALL_SPREAD)});
    lin += U.sideColor * (scatter + vec3f(wall));
  }

  let shown = toDisplay(lin);
  let fragGl = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  if (U.lensFinish == 1) { return finishFrame(shown, uv, fragGl, markTex); }
  if (U.lensFinish == 2) { return ditherOut(shown, fragGl); }
  return vec4f(shown, 1.0);
}`;
