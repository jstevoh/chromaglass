/**
 * The composite in WGSL (docs/webgpu-plan.md, P3), twin of the GLSL in
 * `src/lib/plateShader.ts`.
 *
 * The two have to draw the same picture: `npm run composite` runs both over
 * the same textures and the same uniforms and compares the frames. Read the
 * GLSL for why a line is the way it is — the comments here cover only what the
 * port changes.
 *
 * What the port changes, everywhere:
 * - Sampling is always `textureSampleLevel(t, samp, uv, 0.0)`. The composite
 *   samples inside per-pixel branches, where WGSL forbids the implicit
 *   derivatives `textureSample` needs, and none of these textures carry mips,
 *   so nothing is lost by saying so.
 * - The uniforms are one buffer, `U`, with the `u_` prefix dropped:
 *   `u_camZoom` is `U.camZoom`. The struct is generated from the table in
 *   `plateFields.ts`, so there is no second list to keep in step.
 * - GLSL's `a ? b : c` is `select(c, b, a)`, whose arguments are the other way
 *   round. Read those twice.
 * - `mod(a, b)` is not WGSL's `%`, which truncates towards zero for negatives;
 *   `modf2` below is GLSL's.
 */

import { PLATE_STRUCT } from './plateFields';

/** Bindings every plate shader shares. */
const HEAD = /* wgsl */ `
${PLATE_STRUCT}
@group(0) @binding(0) var<uniform> U: Plate;
@group(0) @binding(1) var samp: sampler;

const PI = 3.14159265359;
const DENSITY_SCALE = 8.0;

fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }
fn modf2(a: f32, b: f32) -> f32 { return a - b * floor(a / b); }
`;

/**
 * Catmull-Rom, which passes through its samples.
 *
 * The B-spline it replaced was reachable through `U.bspline` for as long as
 * there was something to compare against; the difference between them is
 * most of why the plate used to look soft, and `npm run plate` measures the
 * weights themselves rather than the two side by side.
 */
const SAMPLING = /* wgsl */ `
fn bicubicSigned(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  let texSize = vec2f(U.gridSize);
  let samplePos = uv * texSize;
  let texPos1 = floor(samplePos - 0.5) + 0.5;
  let f = samplePos - texPos1;

  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let off12 = w2 / w12;

  let p0 = (texPos1 - 1.0) / texSize;
  let p3 = (texPos1 + 2.0) / texSize;
  let p12 = (texPos1 + off12) / texSize;

  let acc = tex2(t, vec2f(p12.x, p0.y)) * (w12.x * w0.y)
          + tex2(t, vec2f(p0.x, p12.y)) * (w0.x * w12.y)
          + tex2(t, vec2f(p12.x, p12.y)) * (w12.x * w12.y)
          + tex2(t, vec2f(p3.x, p12.y)) * (w3.x * w12.y)
          + tex2(t, vec2f(p12.x, p3.y)) * (w12.x * w3.y);
  let wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return acc / wsum;
}

fn textureBicubic(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  return max(bicubicSigned(t, uv), vec4f(0.0));
}

fn decodeDensity(a: f32) -> f32 { return a * a * DENSITY_SCALE; }

/*
  How much deeper than nominal the liquid is here: the gap between the two
  glasses over its resting 0.03, where the thickness optics is on. Beer and
  Lambert say what light gets through goes as exp(−absorbance × path), and
  the path is the gap: a press pales the colour under the palm, a deep pool
  saturates. Set per layer by the display pass (the front plate's gap is the
  only one it has), 1 everywhere else.
*/
var<private> gapScale: f32 = 1.0;

/*
  Dyes mixed across six bands of the spectrum instead of three.

  A dye's colour is a spectrum, and light through two dyes is the product of
  their transmissions wavelength by wavelength; only then does the eye sum it
  into three responses. Doing the product on the three sums instead is the
  shortcut every RGB mixer takes, and it is why mixtures go muddy and
  thickness only darkens instead of shifting hue (dichromatism, which is why
  a deep glass of a yellow dye goes red). So the RGB absorbance is spread
  over six overlapping bands (420–670 nm), each band is attenuated by the
  path on its own, and the eye's three responses sum them back. White stays
  white: every row of the response sums to one.
*/
fn spectralThrough(unit: vec3f, path: f32) -> vec3f {
  let a = -log(max(unit, vec3f(1e-4)));
  let b0 = dot(a, vec3f(0.10, 0.10, 0.80));
  let b1 = dot(a, vec3f(0.05, 0.35, 0.60));
  let b2 = dot(a, vec3f(0.05, 0.80, 0.15));
  let b3 = dot(a, vec3f(0.35, 0.60, 0.05));
  let b4 = dot(a, vec3f(0.80, 0.20, 0.00));
  let b5 = dot(a, vec3f(0.95, 0.05, 0.00));
  let t0 = exp(-b0 * path); let t1 = exp(-b1 * path); let t2 = exp(-b2 * path);
  let t3 = exp(-b3 * path); let t4 = exp(-b4 * path); let t5 = exp(-b5 * path);
  return vec3f(
    0.30 * t3 + 0.45 * t4 + 0.25 * t5,
    0.05 * t0 + 0.20 * t1 + 0.45 * t2 + 0.30 * t3,
    0.45 * t0 + 0.40 * t1 + 0.15 * t2);
}

fn lightThrough(unit: vec3f, thickness: f32) -> vec3f {
  var base = unit;
  if (U.spectral > 0.001) { base = mix(unit, spectralThrough(unit, gapScale), U.spectral); }
  if (U.transmission <= 0.001) { return base; }
  let th = clamp(thickness * gapScale, 0.35, 4.0);
  var t = pow(max(unit, vec3f(1e-4)), vec3f(th));
  if (U.spectral > 0.001) { t = mix(t, spectralThrough(unit, th), U.spectral); }
  return mix(base, t, U.transmission);
}

fn sampleLayer(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureBicubic(t, uv); }
`;

/** The blur the gooey edge is made of, and the decode every plate goes through. */
const DECODE = /* wgsl */ `
const W5 = array<f32, 25>(
  0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902,
  0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
  0.02193823, 0.09832033, 0.16210282, 0.09832033, 0.02193823,
  0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
  0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902
);

fn blurAlpha(t: texture_2d<f32>, fuv: vec2f, blurFluid: f32) -> f32 {
  if (U.derivedOn > 0.5 && blurFluid * U.gridSize < 0.5) {
    let d = blurFluid * 1.554;
    let k = vec3f(0.19138, 0.61724, 0.19138);
    var acc = 0.0;
    for (var j = 0; j < 3; j++) {
      for (var i = 0; i < 3; i++) {
        acc += k[i] * k[j] * tex2(t, fuv + vec2f(f32(i - 1), f32(j - 1)) * d).a;
      }
    }
    return acc;
  }
  var result = 0.0;
  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let offset = vec2f(f32(i), f32(j)) * blurFluid;
      // Plain bilinear here, not the bicubic: twenty-five taps whose whole
      // purpose is to blur.
      let a = tex2(t, fuv + offset).a;
      result += a * W5[(j + 2) * 5 + (i + 2)];
    }
  }
  return result;
}

fn decodeFluid(t: texture_2d<f32>, fuv: vec2f, blurFluid: f32, useBlur: bool) -> vec4f {
  let raw = textureBicubic(t, fuv);
  var rawAlpha = raw.a;
  if (useBlur) { rawAlpha = blurAlpha(t, fuv, blurFluid); }

  let totalDensity = decodeDensity(rawAlpha);
  if (totalDensity < 0.001 / DENSITY_SCALE) { return vec4f(0.0); }

  let absTotalDensity = decodeDensity(raw.a);
  if (absTotalDensity < 0.001 / DENSITY_SCALE) { return vec4f(0.0); }

  let norm = 1.0 / absTotalDensity;
  let lt = lightThrough(vec3f(
    exp(-decodeDensity(raw.r) * norm),
    exp(-decodeDensity(raw.g) * norm),
    exp(-decodeDensity(raw.b) * norm),
  ), absTotalDensity);

  let darkness = 1.0 - max(lt.r, max(lt.g, lt.b));
  let exposed = max(0.0, totalDensity - U.filmLevel) * U.filmGain;
  let m = clamp(U.macroOn, 0.0, 1.0);
  /*
    Colour Body: dye that reads as a solid body of colour rather than a
    tint the light shows through. Thin dye goes opaque sooner, and its
    colour is pushed away from grey, so a thin wash is still the colour
    itself, not a paler one. At 0 this is the dye as it always was.
  */
  let body = clamp(U.colourBody, 0.0, 1.0);
  let thickness = mix(mix(totalDensity * 2.8, exposed, U.exposure), exposed, m) * (1.0 + darkness * 1.7) * gapScale * (1.0 + 3.0 * body);
  var alpha = 1.0 - exp(-thickness);
  alpha = min(mix(0.95, 0.995, m), alpha);
  var ltBody = lt;
  if (body > 0.001) {
    let l = dot(lt, vec3f(0.299, 0.587, 0.114));
    ltBody = clamp(vec3f(l) + (lt - vec3f(l)) * (1.0 + 0.8 * body), vec3f(0.0), vec3f(1.0));
  }

  return vec4f(ltBody, alpha);
}

fn sobelGrad(t: texture_2d<f32>, fuv: vec2f) -> vec2f {
  let ts = 3.0 / U.logicalGrid;
  let d00 = decodeDensity(textureBicubic(t, fuv + vec2f(-ts, -ts)).a);
  let d10 = decodeDensity(textureBicubic(t, fuv + vec2f(0.0, -ts)).a);
  let d20 = decodeDensity(textureBicubic(t, fuv + vec2f(ts, -ts)).a);
  let d01 = decodeDensity(textureBicubic(t, fuv + vec2f(-ts, 0.0)).a);
  let d21 = decodeDensity(textureBicubic(t, fuv + vec2f(ts, 0.0)).a);
  let d02 = decodeDensity(textureBicubic(t, fuv + vec2f(-ts, ts)).a);
  let d12 = decodeDensity(textureBicubic(t, fuv + vec2f(0.0, ts)).a);
  let d22 = decodeDensity(textureBicubic(t, fuv + vec2f(ts, ts)).a);
  let gradX = (-d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22) * 0.125;
  let gradY = (-d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22) * 0.125;
  return vec2f(gradX, gradY);
}

fn gradNormal(g: vec2f) -> vec3f { return normalize(vec3f(-g * 0.9, 1.0)); }

fn boundaryDiff(t: texture_2d<f32>, fuv: vec2f) -> f32 {
  let cC = decodeFluid(t, fuv, 0.0, false);
  if (cC.a < 0.03) { return 0.0; }
  let e = (3.0 / U.logicalGrid) * 0.55;
  let cR = decodeFluid(t, fuv + vec2f(e, 0.0), 0.0, false);
  let cL = decodeFluid(t, fuv + vec2f(-e, 0.0), 0.0, false);
  let cT = decodeFluid(t, fuv + vec2f(0.0, e), 0.0, false);
  let cB = decodeFluid(t, fuv + vec2f(0.0, -e), 0.0, false);
  let maskX = min(cR.a, cL.a);
  let maskY = min(cT.a, cB.a);
  let diffX = length(cR.rgb - cL.rgb) * smoothstep(0.03, 0.25, maskX);
  let diffY = length(cT.rgb - cB.rgb) * smoothstep(0.03, 0.25, maskY);
  return diffX + diffY;
}
`;

/** One lamp for every material, and what a dye edge does with it. */
const LIGHTING = /* wgsl */ `
fn sobelNormal(t: texture_2d<f32>, fuv: vec2f) -> vec3f { return gradNormal(sobelGrad(t, fuv)); }

fn lampDir(fuv: vec2f, lamp: vec4f) -> vec3f {
  return normalize(vec3f(lamp.xy - fuv, max(0.15, lamp.z)));
}

fn thinFilmColour(t: f32) -> vec3f {
  return 0.5 + 0.5 * cos(6.28318530718 * (t + vec3f(0.0, 0.33, 0.67)));
}

fn applyLighting(color: vec3f, normal: vec3f, darkBlend: bool, fuv: vec2f) -> vec3f {
  if (U.glossiness < 0.005) { return color; }
  let L = lampDir(fuv, U.lamp);
  let V = vec3f(0.0, 0.0, 1.0);
  let H = normalize(L + V);
  let diffuse = max(0.0, dot(normal, L));
  let specNdotH = max(0.0, dot(normal, H));
  let specular = pow(specNdotH, 48.0) * 0.25;
  let cosTheta = max(0.0, normal.z);
  let f0 = 0.04;
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
  let specularTotal = specular + fresnel * 0.12;

  var lit: vec3f;
  if (darkBlend) {
    lit = color * (0.6 + 0.4 * diffuse);
  } else {
    lit = color * (0.5 + 0.5 * diffuse) + specularTotal;
  }
  return mix(color, lit, U.glossiness);
}

fn boundaryLine(diff: f32) -> f32 { return smoothstep(0.12, 0.75, diff); }

fn boundaryEdge(t: texture_2d<f32>, fuv: vec2f) -> f32 { return boundaryLine(boundaryDiff(t, fuv)); }

fn meniscus(color: vec3f, n: vec3f, a: f32, fuv: vec2f) -> vec3f {
  let rim = clamp((1.0 - n.z) * 6.0, 0.0, 1.0) * smoothstep(0.02, 0.2, a);
  let L = lampDir(fuv, U.lamp);
  let spec = pow(max(dot(n, L), 0.0), mix(10.0, 24.0, U.photo)) * mix(1.0, 0.3, U.photo);
  let nd = n.xy / max(length(n.xy), 1e-4);
  let facing = clamp(dot(nd, L.xy) * 3.0, -1.0, 1.0);
  let play = U.lightPlay;
  var c = color * (1.0 - rim * (0.55 + 0.3 * max(0.0, -facing) * play));
  c += color * rim * max(0.0, facing) * 0.7 * play;
  c += vec3f(1.0, 0.98, 0.92) * spec * rim * 1.1;
  if (U.lamp2.w > 0.001) {
    let L2 = lampDir(fuv, U.lamp2);
    let facing2 = clamp(dot(nd, L2.xy) * 3.0, -1.0, 1.0);
    let spec2 = pow(max(dot(n, L2), 0.0), 10.0);
    c += (vec3f(0.72, 0.84, 1.0) * spec2 * rim * 1.0 + mix(color, vec3f(0.7, 0.85, 1.0), 0.4) * rim * max(0.0, facing2) * 0.6 * play) * U.lamp2.w;
  }
  return mix(color, c, U.edgeRelief);
}

// Screen uv to the plate's own uv. u_camZoom magnifies about u_camCenter,
// which the macro camera parks on a bead.
fn uvToFluid(uv: vec2f, c: f32, s: f32) -> vec2f {
  var p = (uv - 0.5) * U.resolution;
  p = vec2f(c * p.x - s * p.y, s * p.x + c * p.y);
  let scale = max(U.resolution.x, U.resolution.y) * 1.5 / 128.0;
  return p / (scale * 128.0 * U.camZoom) + U.camCenter;
}

/**
 * Local dye velocity in plate-uv per unit of the cell clock — macro detail
 * rides the paint (lib/detailFlow.ts). The flow is packed signed, in the
 * solver's own units and half float (PACKED_VEL_FORMAT in pack.ts).
 */
fn fluidFlow(vtex: texture_2d<f32>, fuv: vec2f) -> vec2f {
  return tex2(vtex, fuv).rg * U.flowRate;
}
`;

/** Value noise, the pigment's speckle, and the satellite droplets. */
const NOISE = /* wgsl */ `
// The two-component hash microDrops jitters its grid with.
fn hash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.xyx) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2f(1.0, 0.0)), u.x),
             mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm3(p: vec2f) -> f32 {
  var a = 0.5;
  var sum = 0.0;
  // A parameter cannot be written to in WGSL, so the walk is its own var.
  var q = p;
  for (var i = 0; i < 3; i++) { sum += a * vnoise(q); q *= 2.07; a *= 0.5; }
  return sum * 1.14;   // ~0..1
}

/**
 * Pigment texture, painted on the liquid rather than on the glass.
 *
 * Heavy pigment does not stay in suspension: it separates into a fine speckle
 * that is part of why a filmed pour carries texture everywhere and not only at
 * its boundaries. The coordinates come from the solver, which carries them
 * along with the flow, so the speckle travels with the dye instead of swimming
 * under it. Two phases are blended because coordinates advected for long enough
 * stretch into streaks; see seedGrain in gpuFluid.ts.
 */
fn grainAt(p: vec2f) -> f32 {
  // Mostly one octave: an fbm puts its energy two octaves up, which lands the
  // speckle at a pixel or two and reads as video noise rather than as pigment.
  return vnoise(p) * 0.78 + vnoise(p * 2.13 + 11.7) * 0.22;
}

fn pigmentGrain(grainTex: texture_2d<f32>, fuv: vec2f) -> f32 {
  var a = fuv;
  var b = fuv;
  if (U.grainOn > 0.5) { let g = tex2(grainTex, fuv); a = g.rg; b = g.ba; }
  return mix(grainAt(a * U.grainScale), grainAt(b * U.grainScale), U.grainMix) - 0.5;
}

// Satellite droplets: the hundreds of tiny beads that sit on the glass around
// every drop in a macro photograph. Each cell of a jittered grid holds one
// small lens, shaded like the big bubbles — dim toward the lamp, bright away
// from it, a point of the lamp on its dome.
fn microDrops(c: vec3f, p: vec2f, lampSide: vec2f, ground: f32, keep: f32) -> vec3f {
  let i = floor(p);
  let f = fract(p);
  var outc = c;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let h = hash22(i + g);
      if (h.x > keep) { continue; }
      let centre = g + 0.2 + h * 0.6;
      let rad = 0.10 + hash12(i + g + 7.7) * 0.2;
      let d = (f - centre) / rad;
      let q = dot(d, d);
      if (q > 1.0) { continue; }
      let rim = smoothstep(0.5, 1.0, q);
      let toward = dot(d / max(sqrt(q), 1e-3), lampSide);
      var dc = c * (1.06 + 0.18 * max(0.0, -toward) * (1.0 - rim));
      dc = mix(dc, c * c * 1.15, rim * (0.5 + 0.35 * max(0.0, toward)));
      let hd = d - lampSide * 0.4;
      dc += vec3f(1.0, 0.98, 0.95) * exp(-dot(hd, hd) * 14.0) * (0.25 + 0.4 * ground);
      outc = mix(outc, dc, smoothstep(1.0, 0.85, q));
    }
  }
  return outc;
}
`;

/** The paint's cells, and the lacing that outlines every colour boundary. */
const CELLS = /* wgsl */ `
struct Cell {
  core: f32,    // interior mask
  rim: f32,     // bright ring, negative just outside (the dark outline)
  id: f32,      // per-bubble random
  slope: vec2f, // 2D gradient of the cell's surface height
};

// Surface height across one cell, as a function of the signed distance to its
// edge: the film is thin over the sunken core and piles into a meniscus ridge
// at the rim. Differentiating this along the radial direction gives an exact
// normal — screen-space derivatives of the same field come out blocky, because
// they are evaluated per 2x2 quad over hard-edged masks.
fn cellHeight(d: f32, rimWidth: f32) -> f32 {
  let sunk = 1.0 - smoothstep(-rimWidth * 1.6, rimWidth * 0.1, d);
  let ridge = exp(-pow((d - rimWidth * 0.25) / (rimWidth * 1.2), 2.0));
  return ridge * 0.55 - sunk * 0.85;
}

// One generation of cells: born, carried along by the dye, dissolved again.
//
// Every cell in the 3x3 neighbourhood is evaluated against its own profile and
// the strongest wins per feature, so each one keeps a complete circular ring
// even where its neighbours crowd it. (Assigning each pixel to its nearest
// centre instead — a plain Voronoi — clips those rings along the cell
// boundaries and turns round cells into polygons.)
//
// Cross-fading two offsets of the *same* pattern would average two distance
// fields into mush, so instead each generation is its own pattern under a
// sin^2 envelope; two generations half a cycle apart sum to exactly 1, giving
// continuous cover with no ghosting and no reset pop.
fn cellField(p0: vec2f, flow: vec2f, seed: f32, period: f32, phase: f32, rimWidth: f32, clock: f32) -> Cell {
  // The clock the generations are timed on. The closeup's cells pass the
  // paint's own travel (the cell clock, lib/detailFlow.ts), so the slide
  // below is exactly as far as the dye went, however the frames and the
  // steps fell; the plate's cells, which only slide once the closeup is on,
  // keep the plate's clock and so breathe at 1x as they always have.
  let a = fract(clock / period + phase);
  var env = sin(3.14159265 * a);
  env *= env;

  let p = p0 - flow * (a * period);
  let ip = floor(p);
  let fp = fract(p);

  var core = 0.0;
  var bright = 0.0;
  var outline = 0.0;
  var id = 0.0;
  var bestW = -1.0;
  var bestD = 1.0;
  var bestDir = vec2f(1.0, 0.0);

  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let g = vec2f(f32(i), f32(j));
      let h = hash22(ip + g + seed);
      let c = g + 0.5 + (h - 0.5) * 0.62;
      let r = 0.16 + h.x * 0.22;
      let delta = fp - c;
      let dist = length(delta);
      let d = dist - r;
      if (d > rimWidth * 3.5) { continue; }               // nowhere near this cell

      let cr = 1.0 - smoothstep(-rimWidth * 0.8, -rimWidth * 0.15, d);
      let br = 1.0 - smoothstep(rimWidth * 0.35, rimWidth * 1.15, abs(d));
      let ol = 1.0 - smoothstep(rimWidth * 0.5, rimWidth * 1.3, abs(d - rimWidth * 2.0));

      core = max(core, cr);
      bright = max(bright, br);
      outline = max(outline, ol);

      let w = max(cr, br);
      if (w > bestW) { bestW = w; bestD = d; bestDir = delta / max(dist, 1e-4); id = h.y; }
    }
  }

  // Slope only for the cell that owns this pixel — two profile evaluations
  // per generation instead of eighteen.
  let e = rimWidth * 0.35;
  let dh = (cellHeight(bestD + e, rimWidth) - cellHeight(bestD - e, rimWidth)) / (2.0 * e);

  // A bright ring covers the dark outline of whatever it overlaps.
  let rim = bright - outline * 0.7 * (1.0 - bright);
  return Cell(core * env, rim * env, id, bestDir * dh * env);
}

/**
 * Lacing: the pale hair-thin threads that outline every colour boundary in a
 * poured film. See the GLSL for the whole of why it is built this way — the
 * level line, the span, the walk and the curvature that sets the width.
 *
 * WGSL only allows the derivative builtins where every pixel of the quad is
 * still running, so the two widths this measures with fwidth are taken at
 * the top, above the early exits, and the caller masks the result rather than
 * branching around the call on a per-pixel test.
 */
fn lacing(color: vec3f, t: texture_2d<f32>, fuv: vec2f, alpha: f32, amount: f32) -> vec3f {
  let e = 3.0 / U.logicalGrid;       // one solver cell, in fluid uv
  let cR = decodeFluid(t, fuv + vec2f( e, 0.0), 0.0, false);
  let cL = decodeFluid(t, fuv + vec2f(-e, 0.0), 0.0, false);
  let cT = decodeFluid(t, fuv + vec2f(0.0,  e), 0.0, false);
  let cB = decodeFluid(t, fuv + vec2f(0.0, -e), 0.0, false);
  // Which way is across the boundary: the principal axis of the colour
  // structure tensor, which keeps the sign a pair of lengths would lose.
  let dx = (cR.rgb - cL.rgb) * smoothstep(0.02, 0.2, min(cR.a, cL.a));
  let dy = (cT.rgb - cB.rgb) * smoothstep(0.02, 0.2, min(cT.a, cB.a));
  let jxx = dot(dx, dx);
  let jyy = dot(dy, dy);
  let jxy = dot(dx, dy);
  let jd = jxx - jyy;
  let gm = sqrt(0.5 * (jxx + jyy + sqrt(jd * jd + 4.0 * jxy * jxy)));
  let th = select(0.0, 0.5 * atan2(2.0 * jxy, jd), abs(jxy) + abs(jd) > 1e-9);
  let n = vec2f(cos(th), sin(th));              // across the boundary
  let tang = vec2f(-n.y, n.x);                  // along it
  var axis = (cR.rgb - cL.rgb) * n.x + (cT.rgb - cB.rgb) * n.y;
  let al = length(axis);
  axis /= max(al, 1e-4);                        // the max only bites on the way out, below
  // The axis, the colour along it and the two pixel widths are worked out here,
  // above every exit, because WGSL forbids fwidth once part of the quad has
  // returned: a derivative is read across all four pixels or not at all.
  let fC = dot(color, axis);
  let px = max(fwidth(fuv.x), fwidth(fuv.y)) + 1e-6;
  let fwC = fwidth(fC);
  if (gm < 0.004) { return color; }
  if (al < 1e-4) { return color; }
  // The whole colour change across the boundary, not the change per cell.
  let fAhead = decodeFluid(t, fuv + n * e * 4.0, 0.0, false);
  let fBack  = decodeFluid(t, fuv - n * e * 4.0, 0.0, false);
  let span = abs(dot(fAhead.rgb - fBack.rgb, axis)) * smoothstep(0.02, 0.2, min(fAhead.a, fBack.a));
  let band = smoothstep(0.05, 0.3, span) * smoothstep(0.08, 0.20, al);
  if (band < 0.004) { return color; }
  // Whether the boundary here is folding or being drawn out, from its own
  // curvature rather than from the velocity field.
  let t2 = e * 2.0;
  let bend = abs(dot(decodeFluid(t, fuv + tang * t2, 0.0, false).rgb, axis)
               + dot(decodeFluid(t, fuv - tang * t2, 0.0, false).rgb, axis)
               - 2.0 * fC) / max(al, 1e-3);
  let fold = max(smoothstep(0.15, 1.6, bend), 0.4);                  // 1 curling, 0.4 straight
  // One thread, at the middle of the change — walked out along the normal
  // until the colour stops changing at a boundary's rate, stopping on a
  // fractional step so the thread has no stair-steps in it.
  var fP = fC;
  var fM = fC;
  let stepRate = al * 0.35;                     // still changing at a boundary's rate
  var goP = true;
  var goM = true;
  var prevP = color;
  var prevM = color;
  for (var i = 1; i <= 5; i++) {
    let o = n * e * 2.0 * f32(i);
    if (goP) {
      let cp = decodeFluid(t, fuv + o, 0.0, false).rgb;
      let d = length(cp - prevP);
      if (d < stepRate) { fP = mix(fP, dot(cp, axis), d / max(stepRate, 1e-5)); goP = false; }
      else { fP = dot(cp, axis); prevP = cp; }
    }
    if (goM) {
      let cm = decodeFluid(t, fuv - o, 0.0, false).rgb;
      let d = length(cm - prevM);
      if (d < stepRate) { fM = mix(fM, dot(cm, axis), d / max(stepRate, 1e-5)); goM = false; }
      else { fM = dot(cm, axis); prevM = cm; }
    }
  }
  let reach = abs(fP - fM);                     // the whole change, in colour
  if (reach < 0.02) { return color; }
  // The level to draw at: the middle of that change, jittered toward the
  // brighter side rather than along n, which turns round as a boundary passes
  // through vertical.
  let toward = clamp(dot(axis, vec3f(0.299, 0.587, 0.114)) * 8.0, -1.0, 1.0);
  let mid = 0.5 * (fP + fM) + (fbm3(fuv * U.logicalGrid * 0.16 + U.time * 0.015) - 0.5) * 0.14 * reach * toward;
  let lvl = abs(fC - mid);
  // A thread is a few pixels wide on a rim and on a fifty-cell ramp alike, so
  // the width is set in pixels and only then capped by the change.
  let perPixel = al * px / e;                   // colour change per screen pixel
  let wide = min(max(mix(1.6, 4.5, fold) * perPixel, fwC * 0.75),
                 mix(0.10, 0.30, fold) * reach);
  let line = 1.0 - smoothstep(0.0, wide, lvl);
  let thread = line * band * mix(0.55, 1.0, fold);
  let pale = mix(vec3f(1.0), color, 0.18) * mix(0.85, 1.2, fold);
  return mix(color, pale, clamp(thread * amount, 0.0, 1.0) * smoothstep(0.02, 0.16, alpha));
}
`;

/** The dishes, the blends, and the LED platform's wheel. */
const GEOMETRY = /* wgsl */ `
// Each layer's own dish when the layers are spread: the lead plate large and
// a little right of centre, the second smaller at the left, the way three
// projectors overlap on one screen. Returns (inside, rim).
fn layerDish(uvScreen: vec2f, layer: i32, aspect: f32) -> vec2f {
  // Both dishes stay inside the plate's inscribed circle (radius 0.5 of the
  // frame height), so the square plate's corners never show through a dish.
  let s = U.dishSpread;
  let c = select(vec2f(0.5 - 0.304 * s / aspect, 0.5 + 0.06 * s), vec2f(0.5 + 0.144 * s / aspect, 0.5 - 0.02 * s), layer == 0);
  /*
    The dish opens out of the frame rather than snapping into it.

    This began at 0.98 for both layers, which is the plate's *inscribed*
    circle — so the instant dishSpread crossed the 0.001 gate below, every
    corner outside that circle became background. On a 1060x700 frame that is
    48% of it, going black in one step at a setting of 0.003, which produces
    no visible spread at all to pay for it. Measured as 51-62% of the frame at
    rgb(0,0,0) with the dye underneath it untouched: 106 colours over 36,789
    wet cells, the renderer hiding a plate that was perfectly healthy.

    It is a fader a performer can ride, so easing it up from nothing did this
    too. Now the dish starts big enough to cover the frame's corners — its own
    diagonal, so it holds at any aspect — and closes to the inscribed circle
    over the first tenth of the travel. At zero it is the frame; by 0.1 it is
    the dish it always was; above that nothing has changed.
  */
  let cover = sqrt(aspect * aspect + 1.0) * 1.02;
  let opening = smoothstep(0.0, 0.10, s);
  let rad = mix(cover, select(mix(0.98, 0.36, s), mix(0.98, 0.66, s), layer == 0), opening);
  let d = (uvScreen - c) * vec2f(aspect, 1.0);
  let dr = length(d) / 0.5;
  let inside = 1.0 - smoothstep(rad - 0.02, rad + 0.012, dr);
  let rim = smoothstep(rad - 0.03, rad - 0.01, dr) * (1.0 - smoothstep(rad - 0.004, rad + 0.012, dr));
  return vec2f(inside, rim);
}

// With the layers spread, each dish is a whole plate: the dish's disc is the
// plate's inscribed circle, so the corners of the square glass stay hidden
// and everything on the plate is in the picture, rotated with the plate.
fn dishToPlate(uvScreen: vec2f, layer: i32, aspect: f32, c: f32, s: f32) -> vec2f {
  let sp = U.dishSpread;
  let cen = select(vec2f(0.5 - 0.304 * sp / aspect, 0.5 + 0.06 * sp), vec2f(0.5 + 0.144 * sp / aspect, 0.5 - 0.02 * sp), layer == 0);
  // The same opening as layerDish, or the picture would not sit in the dish
  // that is drawn for it.
  let cover = sqrt(aspect * aspect + 1.0) * 1.02;
  let opening = smoothstep(0.0, 0.10, sp);
  let rad = mix(cover, select(mix(0.98, 0.36, sp), mix(0.98, 0.66, sp), layer == 0), opening);
  var d = (uvScreen - cen) * vec2f(aspect, 1.0) / (rad * 0.5);   // dish edge at |d| = 1
  d = vec2f(c * d.x - s * d.y, s * d.x + c * d.y);
  return 0.5 + d * 0.5;
}

// Blend mode functions
fn blendScreen(a: vec3f, b: vec3f) -> vec3f    { return 1.0 - (1.0 - a) * (1.0 - b); }
fn blendLighter(a: vec3f, b: vec3f) -> vec3f   { return max(a, b); }
fn blendExclusion(a: vec3f, b: vec3f) -> vec3f { return a + b - 2.0 * a * b; }
fn blendMultiply(a: vec3f, b: vec3f) -> vec3f  { return a * b; }
fn blendOverlay(a: vec3f, b: vec3f) -> vec3f {
  return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(vec3f(0.5), b));
}

fn applyBlend(dst: vec3f, src: vec3f, mode: i32) -> vec3f {
  if (mode == 0) { return blendScreen(dst, src); }
  if (mode == 1) { return blendLighter(dst, src); }
  if (mode == 2) { return blendExclusion(dst, src); }
  if (mode == 3) { return blendMultiply(dst, src); }
  if (mode == 4) { return blendOverlay(dst, src); }
  return blendScreen(dst, src);
}

// LED platform analytical conic gradient
fn ledColor(t: f32) -> vec3f {
  // ledMode: 0=single, 1=ocean, 2=fire, 3=cyberpunk, 4=rainbow
  if (U.ledMode == 0) {
    return U.ledColor;
  } else if (U.ledMode == 1) {
    // ocean
    if (t < 0.25) { return mix(vec3f(0.0, 0.0, 0.2), vec3f(0.0, 0.2, 0.4), t * 4.0); }
    if (t < 0.5)  { return mix(vec3f(0.0, 0.2, 0.4), vec3f(0.0, 0.4, 0.6), (t - 0.25) * 4.0); }
    if (t < 0.75) { return mix(vec3f(0.0, 0.4, 0.6), vec3f(0.0, 0.6, 0.8), (t - 0.5) * 4.0); }
    return mix(vec3f(0.0, 0.6, 0.8), vec3f(0.0, 0.0, 0.2), (t - 0.75) * 4.0);
  } else if (U.ledMode == 2) {
    // fire
    if (t < 0.25) { return mix(vec3f(0.2, 0.0, 0.0), vec3f(0.8, 0.0, 0.0), t * 4.0); }
    if (t < 0.5)  { return mix(vec3f(0.8, 0.0, 0.0), vec3f(1.0, 0.4, 0.0), (t - 0.25) * 4.0); }
    if (t < 0.75) { return mix(vec3f(1.0, 0.4, 0.0), vec3f(1.0, 0.8, 0.0), (t - 0.5) * 4.0); }
    return mix(vec3f(1.0, 0.8, 0.0), vec3f(0.2, 0.0, 0.0), (t - 0.75) * 4.0);
  } else if (U.ledMode == 3) {
    // cyberpunk
    if (t < 0.33) { return mix(vec3f(1.0, 0.0, 0.235), vec3f(0.0, 0.94, 1.0), t / 0.33); }
    if (t < 0.66) { return mix(vec3f(0.0, 0.94, 1.0), vec3f(0.988, 0.933, 0.039), (t - 0.33) / 0.33); }
    return mix(vec3f(0.988, 0.933, 0.039), vec3f(1.0, 0.0, 0.235), (t - 0.66) / 0.34);
  } else {
    // rainbow
    if (t < 0.16667) { return mix(vec3f(1.0, 0.0, 0.0), vec3f(1.0, 1.0, 0.0), t * 6.0); }
    if (t < 0.33333) { return mix(vec3f(1.0, 1.0, 0.0), vec3f(0.0, 1.0, 0.0), (t - 0.16667) * 6.0); }
    if (t < 0.5)     { return mix(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 1.0, 1.0), (t - 0.33333) * 6.0); }
    if (t < 0.66667) { return mix(vec3f(0.0, 1.0, 1.0), vec3f(0.0, 0.0, 1.0), (t - 0.5) * 6.0); }
    if (t < 0.83333) { return mix(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 1.0), (t - 0.66667) * 6.0); }
    return mix(vec3f(1.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), (t - 0.83333) * 6.0);
  }
}
`;

/** The closeup: the silhouette warp, the defocus, and the paint's own detail. */
const MACRO = /* wgsl */ `
// Crinkle the sampled position so bicubic-smooth silhouettes gain sub-cell
// structure. A uniform drift (never a per-pixel flow offset) keeps it stable.
fn macroWarpOffset(fuv: vec2f) -> vec2f {
  if (U.macroEdge < 0.005) { return vec2f(0.0); }
  let f = U.logicalGrid * 0.85;
  let t = vec2f(U.time * 0.012, U.time * -0.009);
  var w = vec2f(fbm3(fuv * f + t), fbm3(fuv * f + vec2f(37.2, 11.7) + t)) - 0.5;
  w += (vec2f(fbm3(fuv * f * 2.7 + t * 2.0), fbm3(fuv * f * 2.7 + vec2f(5.1, 19.3) + t * 2.0)) - 0.5) * 0.45;
  // Scaled by how far in we are (see macroAmt): sub-cell crinkle on a
  // plate-wide frame is noise, and on a bead it is the silhouette.
  return w * (U.macroEdge * 1.1 * clamp(U.macroOn, 0.0, 1.0) / U.logicalGrid);
}

fn macroWarp(fuv: vec2f) -> vec2f { return fuv + macroWarpOffset(fuv); }

/*
  How far a structure of this size on the plate (in plate widths) is
  resolved at the zoom the camera is at: 0 while it is too small on screen to
  see, 1 once it spans the given fraction of the frame. The frame shows 1/1.5
  of the plate at 1x (see the exposure in LiquidVisualizer).

  So the closeup is a microscope pushing in, not a filter: reported, the
  cells were all there at full strength the moment the zoom left 1x. Now the
  paint comes closer first, then the coarse cells break out of it, then the
  fine cells between them and the lacing, each as it grows big enough to see.
*/
fn resolved(size: f32, lo: f32, hi: f32) -> f32 {
  return smoothstep(lo, hi, size * 1.5 * max(U.camZoom, 1.0));
}

// Decode an already-fetched texel — the defocused path doesn't need bicubic
// filtering or a gooey blur, so it costs 5 plain fetches instead of 5 decodes.
fn decodeFluidRaw(raw: vec4f) -> vec4f {
  let totalDensity = decodeDensity(raw.a);
  if (totalDensity < 0.001 / DENSITY_SCALE) { return vec4f(0.0); }
  let norm = 1.0 / totalDensity;
  let c = lightThrough(exp(-vec3f(decodeDensity(raw.r), decodeDensity(raw.g), decodeDensity(raw.b)) * norm), totalDensity);
  let darkness = 1.0 - max(c.r, max(c.g, c.b));
  let thickness = mix(totalDensity * 2.8, max(0.0, totalDensity - U.filmLevel) * U.filmGain, clamp(U.macroOn, 0.0, 1.0))
                * (1.0 + darkness * 1.7);
  return vec4f(c, min(mix(0.95, 0.995, clamp(U.macroOn, 0.0, 1.0)), 1.0 - exp(-thickness)));
}

// 5-tap defocus. The blur radius is constant in screen space, so the
// out-of-focus surround holds still as the camera zooms.
fn decodeFluidDof(t: texture_2d<f32>, fuv: vec2f, blurFluid: f32, useBlur: bool, dof: f32) -> vec4f {
  if (dof < 0.02) { return decodeFluid(t, fuv, blurFluid, useBlur); }
  let r = dof * 0.022 / (1.5 * U.camZoom);
  let raw = (tex2(t, fuv)
           + tex2(t, fuv + vec2f(r, 0.0)) + tex2(t, fuv - vec2f(r, 0.0))
           + tex2(t, fuv + vec2f(0.0, r)) + tex2(t, fuv - vec2f(0.0, r))) * 0.2;
  return decodeFluidRaw(raw);
}

// Paint cells, lacing and relief lighting for one layer's decoded dye.
//   grad  — silhouette/interface gradient strength, 0..1
//   dof   — defocus at this pixel, 0..1 (detail dissolves out of focus)
// Returns shaded colour in .rgb and a corrected opacity in .a.
//
// Control flow here is uniform (branches test uniforms only, masks do the
// per-pixel work) because the relief pass takes screen-space derivatives of
// the height field, which are undefined inside divergent branches.
fn macroDetail(colIn: vec3f, alpha: f32, fuv: vec2f, flow: vec2f, gridNormal: vec3f, grad: f32, dof: f32) -> vec4f {
  var col = colIn;
  // The silhouette warp is meant to crinkle blob outlines, not to deform the
  // cells themselves — bent circles read as lumps rather than as bubbles.
  let cuv = fuv - macroWarpOffset(fuv) * 0.75;
  let focus = 1.0 - dof * 0.85;
  let paint = smoothstep(0.02, 0.20, alpha);

  // ── Packed cells ────────────────────────────────────────────────
  var core = 0.0; var rim = 0.0; var fineCore = 0.0; var fineRim = 0.0; var id = 0.0; var k = 0.0;
  var cellSlope = vec2f(0.0);
  if (U.macroCells > 0.005) {
    let freq = U.logicalGrid / max(0.15, U.macroCellScale * 8.0);
    let p = cuv * freq;
    let f = flow * freq;

    // Cells cluster in patches, the way pouring medium breaks out unevenly.
    // Larger, higher-contrast patches: a real pour breaks out in cell-covered
    // areas next to smooth ones, rather than pebbling the whole frame evenly.
    let clumping = smoothstep(0.04, 0.26, alpha) * smoothstep(0.26, 0.60, fbm3(cuv * 8.0 + U.time * 0.015));
    // Each generation as it resolves (see resolved): at the default Cell
    // Size the coarse cells break out from about 2.5x to 5x, the fine ones
    // from about 6x to 12x. Bigger cells show sooner, smaller ones later.
    let cell = 1.0 / freq;
    let seeCoarse = resolved(cell, 0.078, 0.156);
    let seeFine = resolved(cell / 2.9, 0.065, 0.13);
    k = U.macroCells * focus * clumping * seeCoarse;

    // Coarse cells: two generations, half a cycle apart
    let g0 = cellField(p, f, 0.0, 3.2, 0.0, 0.13, U.cellClock);
    let g1 = cellField(p, f, 17.0, 3.2, 0.5, 0.13, U.cellClock);
    // Union, not sum: adding two generations' masks welds their circles into
    // compound blobs, while taking the stronger of the two keeps every cell
    // round as it fades in over the one it replaces.
    core = max(g0.core, g1.core);
    rim = max(g0.rim, g1.rim);
    id = select(g1.id, g0.id, g0.core > g1.core);

    // Fine cells crowd into the gaps between the big ones, as they do in a
    // real pour, and read as the grain of the film rather than as bubbles.
    let h0 = cellField(p * 2.9 + 11.3, f * 2.9, 41.0, 2.1, 0.0, 0.16, U.cellClock);
    let h1 = cellField(p * 2.9 + 11.3, f * 2.9, 63.0, 2.1, 0.5, 0.16, U.cellClock);
    // The fine cells crowd the gaps the coarse ones leave, once those are there.
    let gap = clamp(1.0 - core * 1.6 * seeCoarse, 0.0, 1.0);
    // Everything below scales by k, which is whole by the time these begin
    // to resolve (the fine cells are 2.9 times smaller).
    fineCore = max(h0.core, h1.core) * gap * seeFine;
    fineRim = max(h0.rim, h1.rim) * gap * seeFine;
    cellSlope = (g0.slope + g1.slope) + (h0.slope + h1.slope) * 0.55 * gap * seeFine;

    let dark = col * 0.03;
    let ring = mix(col, vec3f(1.0, 0.94, 0.74), 0.55) * (1.25 + id * 0.6);

    // Cell cores are holes in the film, not a tint over it: darken them the
    // whole way rather than scaling the darkening down with the patch mask.
    col = mix(col, dark, clamp(core + fineCore * 0.55, 0.0, 1.0) * min(1.0, k * 1.6));
    col += ring * clamp(rim * 1.1 + fineRim * 0.5, -0.5, 2.0) * k;
  }

  // ── Lacing — thin dark filaments streaming along the flow ───────
  var lace = 0.0;
  if (U.macroLacing > 0.005) {
    var dir = vec2f(1.0, 0.0);
    if (length(flow) > 1e-5) { dir = normalize(flow); }
    let nrm = vec2f(-dir.y, dir.x);
    let q = vec2f(dot(cuv, dir) * U.logicalGrid * 0.35, dot(cuv, nrm) * U.logicalGrid * 3.2);
    let n = fbm3(q + U.time * 0.03) - 0.5;
    let line = 1.0 - smoothstep(0.0, 0.055, abs(n));
    let edgeMask = (0.35 + 0.65 * smoothstep(0.08, 0.45, grad)) * smoothstep(0.04, 0.2, alpha);
    // Filaments a fraction of a cell wide: they come through last.
    lace = line * edgeMask * U.macroLacing * focus * smoothstep(4.0, 9.0, U.camZoom);
    col = mix(col, col * 0.04, lace);
  }

  // ── Relief ──────────────────────────────────────────────────────
  // The surface normal is assembled from three scales: the bead's own dome
  // (from the solver-grid normal), the meniscus of every cell (analytic, from
  // each cell's radial slope) and grooves where the lacing cuts in. Lit, this
  // is what makes the frame read as a wet surface with depth instead of as
  // flat colour.
  if (U.macroRelief > 0.005) {
    let r3 = U.macroRelief;
    let tilt = cellSlope * k * 1.6 + vec2f(0.0, lace * 0.6);
    // The grid normal is a gentle slope over many sim cells; scaled up it
    // becomes the dome of the bead, which is what carries the large-scale
    // sense of volume under the cell detail.
    let n = normalize(vec3f(gridNormal.xy * 3.2 - tilt * r3, 1.0));

    let L = lampDir(fuv, U.lamp);
    let H = normalize(L + vec3f(0.0, 0.0, 1.0));
    let diff = max(0.0, dot(n, L));
    let spec = pow(max(0.0, dot(n, H)), 46.0);
    let fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    // Recessed cores and grooves sit in their own shadow.
    let ao = 1.0 - clamp(core * k * 0.55 + fineCore * k * 0.25 + lace * 0.4, 0.0, 1.0) * 0.45;

    // Centred on ~1.0 for a flat, lit surface, so relief shapes the frame
    // without darkening it overall.
    col *= mix(1.0, (0.55 + 0.9 * diff) * ao, r3 * paint);
    col += vec3f(1.0, 0.97, 0.90) * spec * r3 * paint * 0.7;    // wet highlight on the domes
    col += col * fres * r3 * paint * 0.35;                      // bright refracting edge
  }

  // ── Dome shading — thickness across the bead as a whole ─────────
  if (U.macroDepth > 0.005) {
    let belly = smoothstep(0.05, 0.45, alpha);
    col *= mix(1.0, 0.74 + 0.42 * belly, U.macroDepth * 0.8);
  }

  // Ink pooled in a cell core is opaque — let it read as true black rather
  // than as the lit ground showing through.
  let aOut = clamp(alpha + clamp(core * k, 0.0, 1.0) * 0.5 * paint, 0.0, 1.0);
  return vec4f(col, aOut);
}
`;

/** A full-screen triangle, and the uv the GLSL's vertex stage produced. */
const VERT = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

/*
  Which way up this pass stores its picture (docs/webgpu-plan.md, P3).

  A WebGPU render target's first row is its top, and a full-screen quad's
  uv.y of 1 lands there — so a pass that samples at uv.y 1 reads the *last*
  row, and a picture handed from one pass to the next comes out upside down. Drawn straight to the canvas that never shows, which is why it took
  the camera being switched on to see it: the mark moved from seven tenths
  down the screen to two tenths.

  So a pass writing into a texture another pass will sample flips its clip
  space, which puts uv.y 0 in row 0 — the convention WebGL's own framebuffers
  have, and the one every consumer here and in the parity harnesses already
  assumes. Drawing to the canvas, it does not flip.

  (No backticks in this comment: one inside a WGSL comment ends the
  TypeScript template literal holding it.)

  An override constant rather than a uniform: the two pipelines differ by a
  sign that never changes within a pass, and the harnesses go on compiling
  the unflipped one without knowing this exists.
*/
override FLIP_Y: f32 = 1.0;
@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  // Two triangles' worth of corners, as the quad the GLSL draws.
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy.x, xy.y * FLIP_Y, 0.0, 1.0);
  // The same uv the GLSL's vertex stage produces, not flipped: the film grain
  // hashes it, so a flip here would be a different grain. WebGPU's frame comes
  // out of memory the other way up, which the harness turns over when it
  // compares.
  out.uv = xy * 0.5 + 0.5;
  return out;
}
`;

/**
 * The derive pass: the neighbourhood of each texel, worked out once a frame at
 * the plate's own resolution. The display interpolates it.
 */
export const DERIVE_WGSL = `${HEAD}${SAMPLING}${DECODE}${VERT}
@group(0) @binding(2) var src: texture_2d<f32>;

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let g = sobelGrad(src, in.uv);
  var diff = 0.0;
  if (U.boundaryContrast > 0.005) { diff = boundaryDiff(src, in.uv); }
  return vec4f(g, diff, 0.0);
}
`;

/**
 * The whole composite, in the order a WGSL module wants it: the bindings and
 * the helpers, then the pass's own main.
 */
export function plateWgsl(main: string, bindings = DISPLAY_BINDINGS): string {
  // `PARTICLE_FOLD` only where the bindings carry the splat: a slice that
  // binds its own shorter list has no `parts0` for it to read. It goes after
  // MACRO because WGSL wants a function declared before it is called and
  // `decodeFluidDof`, which it falls back to, is declared in there.
  const particles = bindings === DISPLAY_BINDINGS ? PARTICLE_FOLD : '';
  const view = bindings === DISPLAY_BINDINGS ? VIEW : '';
  return `${HEAD}${bindings}${SAMPLING}${DECODE}${NOISE}${CELLS}${GEOMETRY}${LIGHTING}${MACRO}${particles}${view}${FINISH_WGSL}${VERT}${main}`;
}

/** The pieces, for the slices still being ported to build on. */
export const PLATE_PARTS = { HEAD, SAMPLING, DECODE, NOISE, CELLS, GEOMETRY, LIGHTING, MACRO, VERT };

/**
 * The dimmer, the mark and the dither — the GLSL's FINISH_GLSL, which the
 * plate shares with the post chain's finish.
 *
 * `gl_FragCoord` counts rows up from the bottom and WebGPU's `position`
 * counts them down from the top, so the dither's hash is given the GL's
 * coordinate: the pattern is fixed per pixel and a frame drawn either way has
 * to dither the same.
 */
export const FINISH_WGSL = /* wgsl */ `
fn hashFinish(p: vec2f) -> f32 {
  var q = fract(p * vec2f(234.34, 435.345));
  q += dot(q, q + 34.23);
  return fract(q.x * q.y);
}

fn finishLight(color: vec3f, uvScreen: vec2f, markTex: texture_2d<f32>) -> vec3f {
  var outColor = color * U.dimmer;
  if (U.markOn > 0.001) {
    let m = (uvScreen - U.markRect.xy) / max(U.markRect.zw, vec2f(1e-4)) * 0.5 + 0.5;
    if (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) {
      let mark = tex2(markTex, vec2f(m.x, 1.0 - m.y));
      outColor = mix(outColor, mark.rgb, mark.a * U.markOn);
    }
  }
  return outColor;
}

fn ditherOut(outColor: vec3f, fragGl: vec2f) -> vec4f {
  let dth = hashFinish(fragGl) + hashFinish(fragGl + vec2f(17.31, 5.73)) - 1.0;
  let lit = step(1.0 / 255.0, max(outColor.r, max(outColor.g, outColor.b)));
  return vec4f(outColor + dth * lit / 255.0, 1.0);
}

fn finishFrame(outColor: vec3f, uvScreen: vec2f, fragGl: vec2f, markTex: texture_2d<f32>) -> vec4f {
  return ditherOut(finishLight(outColor, uvScreen, markTex), fragGl);
}
`;

/** The textures the display pass reads, in the order the harness binds them. */
export const DISPLAY_BINDINGS = /* wgsl */ `
@group(0) @binding(2) var layer0: texture_2d<f32>;
@group(0) @binding(3) var layer1: texture_2d<f32>;
@group(0) @binding(4) var derived0: texture_2d<f32>;
@group(0) @binding(5) var derived1: texture_2d<f32>;
@group(0) @binding(6) var vel0: texture_2d<f32>;
@group(0) @binding(7) var vel1: texture_2d<f32>;
@group(0) @binding(8) var grain0: texture_2d<f32>;
@group(0) @binding(9) var grain1: texture_2d<f32>;
@group(0) @binding(10) var film: texture_2d<f32>;
@group(0) @binding(11) var markTex: texture_2d<f32>;
@group(0) @binding(12) var beadTex: texture_2d<f32>;
@group(0) @binding(13) var parts0: texture_2d<f32>;
@group(0) @binding(14) var parts1: texture_2d<f32>;
/** The air field (H6): coverage in 0–1, where a bubble has pushed the dye out. */
@group(0) @binding(15) var air0: texture_2d<f32>;
@group(0) @binding(16) var air1: texture_2d<f32>;
/**
 * The front plate's own physics and chemistry, packed (see packView in
 * wgsl/fluid.ts): the ferrofluid, oil, acidity, soap, the BZ reaction,
 * Liesegang's precipitate and the gap, in the one binding the ferrofluid
 * used to have, because this pass is at WebGPU's limit of sixteen.
 */
@group(0) @binding(17) var view0: texture_2d<u32>;
`;

/** Reading view0, between its texels. Only with the display's own bindings. */
export const VIEW = /* wgsl */ `
struct View { phase: f32, oil: f32, acid: f32, soap: f32, bz: f32, pr: f32, gap: f32, bzu: f32 };
fn viewTexel(p: vec2i) -> array<f32, 8> {
  let d = vec2i(textureDimensions(view0)) - 1;
  let q = textureLoad(view0, clamp(p, vec2i(0), d), 0);
  let a = unpack2x16unorm(q.x); let b = unpack2x16unorm(q.y);
  let c = unpack2x16unorm(q.z); let e = unpack2x16unorm(q.w);
  return array<f32, 8>(a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y);
}
fn viewAt(uv: vec2f) -> View {
  let n = vec2f(textureDimensions(view0));
  let q = uv * n - 0.5;
  let i = vec2i(floor(q));
  let f = q - floor(q);
  let t00 = viewTexel(i); let t10 = viewTexel(i + vec2i(1, 0));
  let t01 = viewTexel(i + vec2i(0, 1)); let t11 = viewTexel(i + vec2i(1, 1));
  var o = array<f32, 8>();
  for (var k = 0; k < 8; k++) { o[k] = mix(mix(t00[k], t10[k], f.x), mix(t01[k], t11[k], f.x), f.y); }
  return View(o[0], o[1], o[2] * 2.0 - 1.0, o[3], o[4], o[5] * 4.0, o[6] * 0.06, o[7]);
}

/*
  A drop of oil sitting on the plate is a lens, and what it shows depends on
  who is looking through it. The owner chose "both" (the "Drops, not rings"
  thread): the plate is drawn as a projector throws it, and the macro
  closeup as a camera sees it, because the two really do differ and the
  photographs that started this were all taken with a camera.

  **A camera looking through the drop** (the closeup, U.macroOn) sees what
  the macro photographs show:

  - **A small drop is a ball lens, and it turns the world over.** Its eye is
    past its focus, so it shows a small, upside-down picture of the plate
    round it: where a yellow and a blue meet beside the drop, the drop shows
    the blue on the yellow's side. That is what makes a cluster of droplets
    read as liquid rather than as dots.
  - **A big drop is a pancake**, flat on top once it is wider than the
    meniscus is tall, so its middle is a window onto what is under it, seen
    as it is. Only the curved band at its edge bends light, and it bends it
    hard: that band shows a sliver of the far side, flipped, the crescent of
    the wrong colour along one edge of every large drop in the pictures.

  So the sample under a point at radius r (0 centre, 1 rim) is pushed toward
  the centre and past it by an amount set by the surface's slope there. On
  a small drop the slope climbs from the middle, so the push grows with r
  and the whole drop is one inverted view. On a big one it is zero across
  the flat and climbs across the band.

  How far past a drop its view reaches is not a number of its own radii.
  The first version pushed by three radii, which gave every drop a view of
  the plate within a radius or two of itself, one colour, since the dye
  changes over a much larger distance than a bead is wide. The owner, on
  the macro photographs: "some of the bubbles have multiple background
  colors in them". A drop's view is set by what it looks through to, and
  that is the same for every drop, so each is a push of DROP_INVERT radii
  plus a fixed DROP_REACH of the plate: a big drop's crescent reaches a
  little past its far side, and a droplet a tenth its size shows, turned
  over, much the same stretch of plate the big one does, which is how a
  cluster of droplets in the photographs each carry the same small
  picture of the colours round them.

  **A projector focused on the plate** sees none of that, and the research
  (bubbles-and-drops.md in the project's shared files, item 1, with ray
  traces) says why. The projection lens is focused on the dye, not on
  anything through the drop, so nothing is turned over; and it takes in only
  the rays within its aperture. A ray crossing the drop's curved surface a
  fraction u of the way out is bent by about 2u(1 - n_water/n_oil), and once
  that is more than the aperture the lens never sees it: that part of the
  screen is black. So a projected drop is a bright middle out to
  u* = NA / (2 n_water |1 - n_water/n_oil|) of its curved part and black
  beyond it, with at most the slight upright magnification of a lens the
  dye sits just under: M = f/(f - d), about 1.2 for dye a radius under a
  ball of focal length 5.4 radii. Ryu, Zhang and Emeigh (2022) measured the
  black annulus of drops between plates and the same arithmetic gives their
  widths within a few per cent. That is the "dark ring round a bright
  point" of every projected show, thick on a droplet and a hair on a big
  pool; the thin line the camera view draws is only its outer edge.

  **What sets flat**, in both views, is the gap between the glasses, not a
  size of its own (item 3). A drop the glasses do not squeeze, one of
  radius under half the gap, is a sphere; gravity would flatten it only at
  the oil-water capillary length, several millimetres. A bigger drop is a
  disc as thick as the gap with a half-round edge of radius gap/2, so its
  curved band is gap/2 wide whatever its size, and a press (a smaller gap)
  flattens every drop at once and thins every rim, as it does in a dish.
  There is no attempt to join the view to the plate outside at the rim:
  real ones do not either, and the dark line at the contact (the shading,
  below) is where the jump goes.

  The bead mask's blue is a ramp 1 - d/R (d from the bead's centre, R its
  radius), times the bead's fade in red. Its gradient points at the centre
  with length 1/R, so from any point inside, the centre is (1 - h)/|grad h|
  away along it, which finds the drop's middle and its size without a list
  of beads.

  Returns the offset to add (plate uv), r, and R in plate uv (0 where the
  gradient is too flat to say, at a drop's very centre); r = -1 outside
  every drop.

  The mask comes in two shapes. The rings' is square. Once drops are asked for
  (beadDrops, PLAN.md batch 3) it is twice as wide, with each drop's colour
  in the right half, because this pass already binds sixteen sampled textures
  and that is WebGPU's default ceiling for one stage. The shape is read from
  the texture itself rather than from the setting, so a mask and the frame
  that reads it can never disagree about the layout: the setting moves on the
  frame it is changed, the mask only on the next frame the beads are drawn.
*/
const DROP_INVERT: f32 = 3.0;
const DROP_REACH: f32 = 0.06;
/** Radius of the biggest drop the field makes, plate uv: about eight cells of 192 (drops, 18/18, tops out near seven). */
const DROP_BIGGEST: f32 = 0.045;
/*
  The projector. A ray crossing a round surface u of the way out meets it at
  a slope u/sqrt(1 - u^2), and two refractions bend it by about
  2 (1 - n_water/n_oil) times that slope; the lens loses it once that times
  n_water is more than its numerical aperture. So the bright core ends where
  the slope reaches X = NA / (2 n_water (1 - n_water/n_oil)), at
  u* = X / sqrt(1 + X^2) of the curved part. (The research's table uses the
  small-angle form, u* = X, which is the same for a narrow core and says
  nothing near the edge, where a real meniscus always goes steep.)

  Which NA. The lens of an overhead projector alone takes in about 0.05 to
  0.1, which blacks out two thirds of every droplet: drawn that way the
  plate was a field of black doughnuts, and neither photograph of a real
  projected show has that (hairline edges on the pools, small drops as pale
  dots). The lamp is not a point: the condenser fills the lens from a
  spread of directions, so a ray bent less than that spread still gets in.
  The one measurement in the research, Ryu, Zhang and Emeigh's dark annuli
  of drops between plates, was matched by an effective NA of 0.30 to 0.35;
  0.25 sits between that and the bare lens. Oil 1.47 in water 1.333 then
  gives X = 1.0 and a core of 0.71: a droplet ringed in black over its outer
  three tenths round a bright middle, and a pool edged in a hair three
  tenths of half the gap wide.
*/
const DROP_NA: f32 = 0.25;
const N_WATER: f32 = 1.333;
const N_OIL: f32 = 1.47;
const DROP_X: f32 = DROP_NA / (2.0 * N_WATER * (1.0 - N_WATER / N_OIL));
const DROP_CORE: f32 = DROP_X / sqrt(1.0 + DROP_X * DROP_X);
/*
  An air bubble, by the same arithmetic. Air (1.0) in water bends light the
  other way from oil, and far harder: 1 - n_water/n_air is a third, where
  oil's 1 - n_water/n_oil is a tenth. So at the same aperture the slope
  that loses a ray is 0.28, not 1.0, and the core is 0.27 of the curved
  part: a small bubble is a dark disc round a pin-point, a big one a clear
  window edged in a band 0.73 of half the gap wide, two and a half times a
  drop's hair. (The research's table has 0.78 to 0.94 of the radius dark
  for the bare lens; 0.73 is the same effective aperture the drops use.)
*/
const N_AIR: f32 = 1.0;
const AIR_X: f32 = DROP_NA / (2.0 * N_WATER * (N_WATER / N_AIR - 1.0));
const AIR_CORE: f32 = AIR_X / sqrt(1.0 + AIR_X * AIR_X);
/** How much of the plate's light the band takes: it leaves a tenth, less than a drop's 0.15, the bend being three times as hard. */
const AIR_DARK: f32 = 0.9;
/** The upright magnification a projected ball gives the dye just under it, M = f/(f - d) at d = R, f = 5.4R. */
const DROP_MAG: f32 = 1.23;
/*
  Half the gap at rest, as a radius in plate uv: the size at which a drop
  stops being a ball and starts being a pancake. Before the gap set it, a
  drop was round up to three cells of the 192 grid, the common bead, and
  mostly flat by six and a half; three cells at rest keeps the common bead
  a ball (at 2.3 it came out a fifth flat, and the camera's view through it
  lost a third of its turn: npm run droplens). The gap (0.03 in the
  solver's units at rest) scales it: a press to half the gap halves every
  meniscus.
*/
const DROP_HALF_GAP: f32 = 0.016;
/** Half the gap where the last dropLens call found a drop (it reads it only there). */
var<private> dropRho: f32 = DROP_HALF_GAP;
/** Half the gap at uv, in plate uv. */
fn dropHalfGap(uv: vec2f) -> f32 {
  let g = viewAt(uv).gap;
  return DROP_HALF_GAP * select(1.0, clamp(g / 0.03, 0.3, 3.0), g > 0.001);
}
fn beadWide() -> bool {
  let d = textureDimensions(beadTex);
  return d.x > d.y;
}
/** Plate uv to the mask's own. Wide, the read is kept off the seam, where a
    bilinear tap would pick up the colour half's first column as a drop. */
fn beadAt(uv: vec2f) -> vec4f {
  if (!beadWide()) { return tex2(beadTex, uv); }
  let w = f32(textureDimensions(beadTex).x);
  return tex2(beadTex, vec2f(clamp(uv.x * 0.5, 0.5 / w, 0.5 - 1.0 / w), uv.y));
}
/** The drop's colour at uv, as seen lit; only a wide mask has one. */
fn beadColour(uv: vec2f) -> vec3f {
  let w = f32(textureDimensions(beadTex).x);
  return tex2(beadTex, vec2f(clamp(0.5 + uv.x * 0.5, 0.5 + 1.0 / w, 1.0 - 0.5 / w), uv.y)).rgb;
}
/** How much of a drop of radius R (plate uv) is flat on top, for half the
    gap rho: none for a ball (R under rho), and all but its half-round edge,
    rho wide, for a pancake. */
fn dropFlat(R: f32, rho: f32) -> f32 {
  return clamp(1.0 - rho / max(R, 1e-5), 0.0, 0.95);
}
/** Where on its meniscus a point is: 0 on the flat top (or the middle of a
    small drop), 1 at the contact. */
fn dropBand(r: f32, R: f32, rho: f32) -> f32 {
  let f = dropFlat(R, rho);
  return clamp((r - f) / (1.0 - f), 0.0, 1.0);
}
fn dropLens(uv: vec2f, cam: f32) -> vec4f {
  // One texel of the plate either way; the height is the plate's in both shapes.
  let px = 1.0 / f32(textureDimensions(beadTex).y);
  let m = beadAt(uv);
  if (m.r < 0.02) { return vec4f(0.0, 0.0, -1.0, 0.0); }
  // The gap, read only under a drop: four packed texels, too many for every
  // pixel of every look with beads.
  let rho = dropHalfGap(uv);
  dropRho = rho;
  let h = clamp(m.b / m.r, 0.0, 1.0);
  let hx = beadAt(uv + vec2f(px, 0.0)); let hx2 = beadAt(uv - vec2f(px, 0.0));
  let hy = beadAt(uv + vec2f(0.0, px)); let hy2 = beadAt(uv - vec2f(0.0, px));
  let g = vec2f(hx.b - hx2.b, hy.b - hy2.b) / (2.0 * px * max(m.r, 0.05));
  let g2 = dot(g, g);
  let r = clamp(1.0 - h, 0.0, 1.0);
  if (g2 < 1.0) { return vec4f(0.0, 0.0, r, 0.0); }
  /*
    No drop is bigger than DROP_BIGGEST. Where the taps straddle the wall
    between two drops of a size, the dome is nearly level across them, the
    size it implies runs up to the whole plate, and a push of three radii
    read the plate from up to three plate-widths away: eight in a hundred
    fragments of a crowd at 3x sampled farther than any drop can see, most
    within a texel of a wall (a copy of this arithmetic run on the drops
    check's crowd). Held to the biggest drop, a wall shows a nearby patch.
  */
  let R = min(inverseSqrt(g2), DROP_BIGGEST);
  // toC runs from here to the centre, r radii long.
  let toC = normalize(g) * r * R;
  /*
    The push comes in with the mask's coverage rather than at a threshold.
    The outermost texels of a drop are its antialiasing, and there both the
    dome and the coverage are a few steps of eight bits, so the centre they
    point at can be anywhere; pushed in full, those texels showed a patch of
    plate from well outside the drop, a staircase of odd pixels round every
    rim at 3x. Faded in over the edge they show the plate beside them, as
    the coverage there says most of the texel is.
  */
  let band = dropBand(r, R, rho);
  let cover = smoothstep(0.02, 0.6, m.r);
  // The camera's push: past the centre, in radii.
  let turned = (DROP_INVERT + DROP_REACH / max(R, px)) * band;
  // The projector's: toward the centre by r(1 - 1/M) radii, which puts the
  // sample at centre + (here - centre)/M, upright; a ball's whole round top,
  // a pancake's flat none of it (it is a window), fading out across the
  // flat as the drop flattens.
  let upright = r * (1.0 - 1.0 / DROP_MAG) * (1.0 - smoothstep(0.0, 0.5, dropFlat(R, rho)));
  let push = mix(upright, turned, cam) * cover;
  return vec4f(toC * (push / max(r, 1e-3)), r, R);
}
`;

/*
  Dye carried by particles, folded into a layer (H1, docs/roadmap.md).

  **In the dye's own space, before the decode, and that is the whole point.**
  The first version folded after it and washed the plate out to a pale cyan,
  for a reason worth writing down: what comes back from `decodeFluid` is
  `lt`, the light *transmitted* through the dye, and an opacity already put
  through `1 − exp(−thickness)`. A particle carries the opposite — a per
  channel *absorbance*, which is what the raw texture stores. Mixing one into
  the other is not a wrong weighting, it is a category error, and it looks
  exactly like one.

  So the fold happens on the raw sample. The splat holds the sum of every
  particle that landed on a texel: its carried spectrum times its weight in
  rgb, the weight alone in a. `acc.rgb / acc.a` is therefore the spectrum
  they carry, in the same encoded space `raw.rgb / raw.a` is in, because that
  is where it was read at birth. Multiplying it back by the local total gives
  an encoded rgb that decodes through the same Beer–Lambert path as anything
  else on the plate.

  Two things come out of it. The spectrum is pulled toward what the particles
  carry, which is the part that does not smear: a filament the grid has
  blurred away is still a line of particles holding the colour they were born
  with. And the total is modulated by how they have piled up, mean preserving
  — `cov − 1` is zero where coverage is what it should be — so the plate
  gains structure at the texel scale without getting brighter or dimmer
  overall. The modulation is gentle because `raw.a` is the *square root* of
  density (`decodeDensity` squares it), so a tenth here is a fifth of the
  density it stands for.

  Gated on weight rather than on the setting, because a texel with nothing on
  it has nothing to say and dividing by its zero would say it loudly.
*/
export const PARTICLE_FOLD = /* wgsl */ `
fn foldRaw(raw: vec4f, pt: texture_2d<f32>, uv: vec2f) -> vec4f {
  if (raw.a <= 1e-5) { return raw; }
  let acc = textureSampleLevel(pt, samp, uv, 0.0);
  if (acc.a <= 1e-4) { return raw; }

  /*
    Spectrum and total, and they have to move together.

    decodeFluidRaw divides the channels by the total to get the absorbance
    spectrum, so raw.rgb and raw.a are a ratio and not two independent
    numbers. Scaling one without the other does not make the dye thicker, it
    changes what colour the dye is: scale the total up alone and every
    channel's share falls, which decodes to white; scale it down alone and
    they all rise, which decodes to black. Both were on the plate before this
    was written down — a macro closeup came out as a flat dark red field with
    the picture gone out of it.

    So the spectrum is taken first, mixed toward the particles' carried one,
    and written back multiplied by whatever the total ends up being.
  */
  let spectrum = raw.rgb / raw.a;
  let carried = acc.rgb / acc.a;
  let cov = clamp(acc.a / U.particleNorm, 0.0, 2.0);
  let k = U.particleMix * min(cov, 1.0);
  let total = max(0.0, raw.a * (1.0 + U.particles * (cov - 1.0) * 0.25));
  return vec4f(mix(spectrum, carried, k) * total, total);
}

/*
  The decode, with the particles in it.

  It fetches what decodeFluidDof would have fetched — bicubic and the gooey
  blur below the defocus threshold, five taps above it — folds, and hands the
  result to the shared tail. Off, it is decodeFluidDof and nothing else, so
  a look with no particles goes down exactly the path it always did.

  The neighbour samples that lacing, the edge and the relief take are left on
  the plain decode: they are asking about the dye's shape, and a boundary
  found on particle speckle would be a noisy boundary rather than a finer one.
*/
fn decodeFluidParts(t: texture_2d<f32>, pt: texture_2d<f32>, fuv: vec2f, blurFluid: f32, useBlur: bool, dof: f32) -> vec4f {
  if (U.particles <= 0.001) { return decodeFluidDof(t, fuv, blurFluid, useBlur, dof); }
  var raw: vec4f;
  if (dof < 0.02) {
    raw = textureBicubic(t, fuv);
    if (useBlur) { raw.a = blurAlpha(t, fuv, blurFluid); }
  } else {
    let r = dof * 0.022 / (1.5 * U.camZoom);
    raw = (tex2(t, fuv)
         + tex2(t, fuv + vec2f(r, 0.0)) + tex2(t, fuv - vec2f(r, 0.0))
         + tex2(t, fuv + vec2f(0.0, r)) + tex2(t, fuv - vec2f(0.0, r))) * 0.2;
  }
  return decodeFluidRaw(foldRaw(raw, pt, fuv));
}
`;

/** The display pass: the plate as it reaches the wall. */
export const DISPLAY_MAIN = /* wgsl */ `
struct FsOut {
  @location(0) color: vec4f,
  @location(1) aux: vec4f,     // for the camera: normal.xy (biased), dye height, bubble mask
};

@fragment fn fs(in: VsOut) -> FsOut {
  var uv = in.uv;
  let darkBlend = U.darkBlend != 0;
  // GL counts fragment rows up from the bottom; the dither hashes that.
  let fragGl = vec2f(in.pos.x, U.resolution.y - in.pos.y);

  let macroAmt = clamp(U.macroOn, 0.0, 1.0);
  let closeup = macroAmt > 0.001;   // not 'macro': that is a reserved word in WGSL
  /*
    How much of the plate-wide view is left: the plate's own dressing (the
    meniscus relief, the cells, the droplets) fades out over the same travel
    the closeup's fades in, rather than all going at once at 1.1x, which was
    the step reported in the first notches of the zoom. The dish spread and
    layer 1's throw are eased toward the whole plate on the CPU side
    (plateUniforms.ts), so they are none at all once the closeup is in.
  */
  let plateAmt = 1.0 - macroAmt;
  let plateOn = plateAmt > 0.001;
  let aspect = U.resolution.x / max(1.0, U.resolution.y);
  let uvScreen = uv;

  // ── Kaleidoscope ─────────────────────────────────────────────────
  if (U.kaleido >= 2.0) {
    var c = (uv - 0.5) * vec2f(aspect, 1.0);
    let ang = atan2(c.y, c.x);
    let rad = length(c);
    let wedge = 6.28318530718 / U.kaleido;
    var a = modf2(ang, wedge);
    if (a > wedge * 0.5) { a = wedge - a; }
    a += U.kaleidoPhase;
    c = vec2f(cos(a), sin(a)) * rad * U.kaleidoZoom;
    uv = clamp(c / vec2f(aspect, 1.0) + 0.5, vec2f(0.001), vec2f(0.999));
  }

  var dof = 0.0;
  if (closeup) {
    let rad = length((uv - 0.5) * vec2f(aspect, 1.0));
    dof = clamp((rad - 0.30) * 1.6, 0.0, 1.0) * U.macroDepth * macroAmt;
  }

  // ── LED platform, the photograph's paper, the gel wheel, the lumia ──
  var bgColor = select(vec3f(0.0), vec3f(1.0), darkBlend);
  if (U.photo > 0.5) {
    let pp = uv * vec2f(aspect, 1.0);
    let g = smoothstep(-0.15, 1.15, uv.x * 0.55 + uv.y * 0.65 + (fbm3(pp * 2.2 + 3.1) - 0.5) * 0.5 - 0.1);
    bgColor = mix(U.paperA, U.paperB, g) * (0.82 + 0.08 * fbm3(pp * 60.0));
  }
  var auxN = vec2f(0.0);
  var auxH = 0.0;
  var auxB = 0.0;
  if (U.ledPlatform != 0) {
    let centered = (uv - 0.5) * U.resolution;
    let t = fract(atan2(centered.y, centered.x) / (2.0 * PI) + 0.5 + U.ledAngle);
    let lc = ledColor(t);
    let dist = length(centered);
    let maxR = max(U.resolution.x, U.resolution.y) * 0.8;
    let bevel = 1.0 - smoothstep(maxR * 0.5, maxR, dist) * 0.8;
    bgColor = lc * bevel;
  }

  if (U.gelWheel > 0.001) {
    let gc = (uv - 0.5) * vec2f(aspect, 1.0);
    let ga = fract(atan2(gc.y, gc.x) / (2.0 * PI) + U.gelAngle);
    let seg = ga * 4.0;
    let gi = i32(floor(seg));
    let gf = fract(seg);
    var g0 = U.gel3;
    var g1 = U.gel0;
    if (gi == 0) { g0 = U.gel0; g1 = U.gel1; }
    else if (gi == 1) { g0 = U.gel1; g1 = U.gel2; }
    else if (gi == 2) { g0 = U.gel2; g1 = U.gel3; }
    let gel = mix(g0, g1, smoothstep(0.86, 1.0, gf));
    bgColor = mix(bgColor, max(bgColor, vec3f(0.10)) * gel * 1.5, U.gelWheel);
  }

  if (U.lumia > 0.001) {
    let lp = uv * vec2f(aspect, 1.0) * 1.35;
    let lt = U.time * 0.035;
    let h = fbm3(lp + vec2f(lt * 0.7, -lt * 0.4)) * 0.6 + fbm3(lp * 2.1 - vec2f(lt * 0.3, lt * 0.5)) * 0.4;
    let sheet = pow(abs(sin(h * 9.42 + lt)), 3.0);
    let veil = 0.25 + 0.75 * fbm3(lp * 0.6 + vec2f(lt * 0.2, lt * 0.15));
    let lcol = mix(U.lumiaA, U.lumiaB, smoothstep(0.25, 0.75, fbm3(lp * 0.7 + lt)));
    bgColor += lcol * (0.12 + 0.9 * sheet) * veil * U.lumia;
  }

  // ── Gooey blur parameters ─────────────────────────────────────────
  let fluidScale = max(U.resolution.x, U.resolution.y) * 1.5 / 128.0;
  let blurFluid = U.gooey * U.postBlur * 10.0 / (fluidScale * 128.0);
  let useBlur = U.gooey * U.postBlur > 0.01;

  // ── Layer 0 ──────────────────────────────────────────────────────
  let c0 = cos(-U.rotation0);
  let s0 = sin(-U.rotation0);
  var fuv0 = uvToFluid(uv, c0, s0);
  if (U.dishSpread > 0.001) { fuv0 = dishToPlate(uvScreen, 0, aspect, c0, s0); }
  // Where the eye meets the plate's surface: the drops sit here, and what is
  // under a drop is read through it (dropLens), before anything is sampled,
  // so the dye, the ferrofluid, the oil and the chemistry are all seen through it.
  let fuvSurf = fuv0;
  var drop = vec4f(0.0, 0.0, -1.0, 0.0);
  /*
    Who is looking at the drops (dropLens): a camera in the closeup, the
    projector everywhere else. Not the zoom's own fade: the lens blends
    where it reads, and between the projector's slight pull toward the
    centre and the camera's push past it there is a blend that reads every
    point of a drop from its centre, a disc of one colour, then one that
    blows it up eight times. On the zoom's fade that sat at 1.1x to 1.3x, a
    zoom a performer parks on (the pre-push review). Changed over the middle
    fifth of the fade instead, the whole of it passes in a few hundredths
    of the zoom, near 1.45x.
  */
  let dropCam = smoothstep(0.4, 0.6, macroAmt);
  if (U.beads > 0.001) {
    drop = dropLens(fuvSurf, dropCam);
    if (drop.z >= 0.0) { fuv0 += drop.xy * clamp(U.beads * 3.0, 0.0, 1.0); }
  }
  let fuvBase = fuv0;

  var flow0 = vec2f(0.0);
  if (closeup) {
    flow0 = fluidFlow(vel0, fuv0) * macroAmt;
    fuv0 = macroWarp(fuv0);
  }
  // The front plate's own physics, once, where it sits on the plate.
  let view = viewAt(fuvBase);
  // One screen pixel in plate units, for the ferrofluid's edge. Taken here,
  // before any branch a pixel can take on its own, because WGSL reads a
  // derivative across the whole quad or not at all. The length of a step
  // across the screen, not fwidth: fwidth adds the two axes, which on a
  // turning plate is up to √2 pixels and softened the edge as it spun.
  let phasePx = max(length(dpdx(fuvBase)), length(dpdy(fuvBase)));
  gapScale = mix(1.0, clamp(view.gap / 0.03, 0.3, 3.0), clamp(U.thickOptics, 0.0, 1.0));
  var fluid0 = decodeFluidParts(layer0, parts0, fuv0, blurFluid, useBlur, dof);
  gapScale = 1.0;
  var dish0 = vec2f(1.0, 0.0);
  var dish1 = vec2f(1.0, 0.0);
  if (U.dishSpread > 0.001) {
    dish0 = layerDish(uvScreen, 0, U.resolution.x / U.resolution.y);
    fluid0.a *= dish0.x;
  }

  if (U.granulation > 0.002 && fluid0.a > 0.004) {
    fluid0.a = max(0.0, fluid0.a * (1.0 + U.granulation * pigmentGrain(grain0, fuv0) * 1.6));
  }

  if (useBlur && fluid0.a > 0.0) {
    let contrast = 1.2 + U.gooey * 4.0;
    fluid0.a = clamp((fluid0.a - 0.5) * contrast + 0.5, 0.0, 1.0);
  }

  let sharp0 = dof < 0.55;
  var near0 = vec4f(0.0);
  if (sharp0 && U.derivedOn > 0.5) { near0 = bicubicSigned(derived0, fuv0); }
  var normal0 = vec3f(0.0, 0.0, 1.0);
  if (sharp0) {
    if (U.derivedOn > 0.5) { normal0 = gradNormal(near0.xy); } else { normal0 = sobelNormal(layer0, fuv0); }
  }
  fluid0 = vec4f(applyLighting(fluid0.rgb, normal0, darkBlend, fuv0), fluid0.a);
  if (darkBlend) { fluid0.a *= 0.6; }

  if (U.boundaryContrast > 0.005 && fluid0.a > 0.03 && sharp0) {
    var edge0 = boundaryLine(near0.z);
    if (U.derivedOn <= 0.5) { edge0 = boundaryEdge(layer0, fuv0); }
    fluid0 = vec4f(fluid0.rgb + fluid0.rgb * edge0 * U.boundaryContrast * 1.6 + vec3f(edge0 * U.boundaryContrast * 0.25), fluid0.a);
  }
  // The per-pixel tests mask the result instead of branching around the
  // call: lacing measures two widths with fwidth, and WGSL reads a
  // derivative across the whole quad or not at all.
  if (U.lacing > 0.005) {
    let laced0 = lacing(fluid0.rgb, layer0, fuv0, fluid0.a, U.lacing);
    if (fluid0.a > 0.02 && sharp0) { fluid0 = vec4f(laced0, fluid0.a); }
  }
  if (plateOn && U.edgeRelief > 0.005 && sharp0) {
    fluid0 = vec4f(mix(fluid0.rgb, meniscus(fluid0.rgb, normal0, fluid0.a, fuv0), plateAmt), fluid0.a);
  }

  // ── Plate cells ───────────────────────────────────────────────
  if (plateOn && U.cells > 0.005 && fluid0.a > 0.03) {
    let cfreq = U.logicalGrid / 3.2;
    // Slid in over the travel into the closeup rather than switched on with
    // it: the flow comes on at the first notch of the zoom, and the plate's
    // cells are as old as the plate's clock makes them.
    let cflow = fluidFlow(vel0, fuv0) * cfreq * macroAmt;
    let cg0 = cellField(fuv0 * cfreq, cflow, 0.0, 3.2, 0.0, 0.13, U.time);
    let cg1 = cellField(fuv0 * cfreq, cflow, 17.0, 3.2, 0.5, 0.13, U.time);
    let ccore = max(cg0.core, cg1.core);
    var crim = cg1.rim;
    if (abs(cg0.rim) > abs(cg1.rim)) { crim = cg0.rim; }
    var centreW = 1.0;
    if (U.dishSpread > 0.001) {
      let casp = U.resolution.x / U.resolution.y;
      let cc = vec2f(0.5 + 0.144 * U.dishSpread / casp, 0.5 - 0.02 * U.dishSpread);
      centreW = 1.0 - smoothstep(0.25, 0.7, length((uvScreen - cc) * vec2f(casp, 1.0)) / (0.5 * mix(0.98, 0.66, U.dishSpread)));
    }
    let kc = U.cells * smoothstep(0.03, 0.35, fluid0.a) * centreW * plateAmt;
    var rgb = fluid0.rgb * (1.0 - max(0.0, -crim) * 0.7 * kc);
    rgb *= 1.0 + max(0.0, crim) * 0.35 * kc;
    rgb = mix(rgb, rgb * 1.1 + vec3f(0.02), ccore * kc * 0.4);
    fluid0 = vec4f(rgb, fluid0.a);
  }

  if (closeup) {
    let grad0 = clamp((1.0 - normal0.z) * 5.0, 0.0, 1.0);
    fluid0 = mix(fluid0, macroDetail(fluid0.rgb, fluid0.a, fuv0, flow0, normal0, grad0, dof), macroAmt);
  }

  // ── Substrate grain + contact shadow ──────────────────────────────
  if (closeup && U.macroDepth * macroAmt > 0.005) {
    let depth = U.macroDepth * macroAmt;
    let fiber = fbm3(uv * vec2f(aspect, 1.0) * 230.0);
    bgColor = mix(bgColor, bgColor * (0.82 + 0.36 * fiber) + fiber * 0.02 * depth, macroAmt);
    let shA = 1.0 - exp(-decodeDensity(textureBicubic(layer0, uvToFluid(uv + vec2f(0.008, -0.008), c0, s0)).a) * 2.6);
    let shB = 1.0 - exp(-decodeDensity(textureBicubic(layer0, uvToFluid(uv + vec2f(0.022, -0.022), c0, s0)).a) * 1.6);
    let shadow = clamp(shA * 0.65 + shB * 0.5, 0.0, 1.0);
    bgColor *= mix(1.0, 0.18, shadow * depth);
  }

  var outColor = bgColor;
  if (U.photo > 0.5) {
    let a = fluid0.a;
    var tr = pow(fluid0.rgb, vec3f(1.0 + 0.9 * a));
    let trl = dot(tr, vec3f(0.299, 0.587, 0.114));
    tr = clamp(mix(vec3f(trl), tr, 1.3), vec3f(0.0), vec3f(1.0));
    let lit = tr * mix(outColor, vec3f(1.0), 0.22 * smoothstep(0.1, 0.6, a)) * (1.0 + 0.2 * a);
    outColor = mix(outColor, lit, a);
    let n = normal0;
    let S = lampDir(fuv0, U.lamp);
    let R = 2.0 * n.z * n.xy;
    let sb = smoothstep(0.42, 0.12, abs(R.x - S.x * 0.6)) * smoothstep(0.26, 0.06, abs(R.y - S.y * 0.6));
    let fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    let rimDark = clamp((1.0 - n.z) * 5.0, 0.0, 1.0);
    let facing = clamp(dot(n.xy, S.xy) * 3.0, -1.0, 1.0);
    outColor *= 1.0 - rimDark * a * (0.35 + 0.3 * max(0.0, -facing));
    outColor *= 1.0 - a * a * 0.22;
    outColor += vec3f(1.0, 0.98, 0.95) * sb * a * (0.35 + 0.6 * fres);
    outColor += vec3f(0.95, 0.97, 1.0) * fres * a * 0.18;
  } else {
    outColor = mix(outColor, fluid0.rgb, fluid0.a);

    /*
      The second phase, over the dye it is moving through (H7).

      Opacity from *thickness*, which is the whole difference between a slide
      of real ferrofluid and a black blob: thin edges are brown and let the
      lamp through, thick middles are black. A flat black domain is the thing
      that would read as CGI.

      And a bright rim where the light bends through the edge, taken from the
      dye just outside rather than invented, so a domain sitting in magenta
      liquid has a magenta rim. That is the same lesson the bubbles taught —
      the thing a hole or a body does to the picture has to be made of the
      picture.
    */
    if (U.phaseAmount > 0.002) {
      let ph = clamp(view.phase, 0.0, 1.0);
      if (ph > 0.004) {
        /*
          Where the ferrofluid ends, as a line rather than a ramp.

          The solver keeps the phase's boundary a few cells wide (Cahn–Hilliard
          needs a diffuse interface to stay stable), and this used to draw that
          width: opacity followed the phase itself, so every domain wore a
          brown smudge about three cells deep. Three cells is 8 px on a 640 px
          plate and over 20 px through the closeup, and the references (Chemical
          Bouillon's labyrinths, Czapiga's macro beads) have a razor edge at
          every magnification. A liquid either is at a point or is not; the
          width of the field's ramp is the solver's business, not the picture's.

          So the edge is the half-full line, found where it falls between the
          texels: the distance to it is (phase − ½) over the phase's slope, and
          the edge is one screen pixel of antialiasing across that line, however
          far the camera is in. Measured in the lab on seeded plates with
          Magnet Garden's settings, as the mean width of the band between 10%
          and 90% of the way from black to the water: a maze 26 px to 1.3 px,
          a pool over the magnet 34 px to 1.3 px at 1x and 29 px to 1.3 px at
          3x, on a 640 px render.

          Distances are in cells (dc) for everything the liquid itself sets
          (how thick it is, the meniscus), and in pixels only for the
          antialiasing.
        */
        let cell = 1.0 / f32(textureDimensions(view0).x);
        let gx = viewAt(fuvBase + vec2f(cell, 0.0)).phase - viewAt(fuvBase - vec2f(cell, 0.0)).phase;
        let gy = viewAt(fuvBase + vec2f(0.0, cell)).phase - viewAt(fuvBase - vec2f(0.0, cell)).phase;
        let grad = vec2f(gx, gy) / (2.0 * cell);
        let slope = length(grad);
        // Signed distance to the half-full line in plate units, inside positive.
        // Where the field is flat there is no line near, and the sign alone
        // says which side: capped at eight cells either way.
        let d = clamp((ph - 0.5) / max(slope, 1e-4), -8.0 * cell, 8.0 * cell);
        let dc = d / cell;
        // A floor under the pixel, for where the screen's coordinates stop
        // changing (the kaleidoscope clamps them at its corners) and there is
        // no pixel to measure.
        let cover = clamp(0.5 + d / max(phasePx, 0.05 * cell), 0.0, 1.0);
        let outward = select(vec2f(0.0), -grad / slope, slope > 1e-4);
        let amt = clamp(U.phaseAmount, 0.0, 1.0);

        /*
          Opacity from thickness, still: thin at its edge, where the meniscus
          curves down to the glass, and black over the full gap. But the
          thickness is now how far inside the line a point is, not how full
          the solver's cell is. That is what took the smudge off the outside
          (nothing outside the line is ferrofluid) and the orange worms out of
          the middle of a pool: ripples in a pool's fill (phase 0.7, 0.8, far
          from any half-full line) were thin by the old measure, let the gold
          through and were lit as rims. By this one they are deep inside, and
          black. The amber is a sliver just inside the edge, about one cell
          deep, which is where a real ferrofluid lets the lamp through.
          Optical depth 13 at full thickness: at 9 the Macro Bead texture on
          the dye beneath printed through a pool as rings.
        */
        let t = clamp(dc / 1.1, 0.0, 1.0);
        let depth = (1.2 + 12.0 * pow(t, 1.3)) * (0.4 + 0.6 * amt);
        var pc = outColor * exp(-depth * vec3f(0.45, 0.7, 1.0));

        /*
          The glint: the liquid's surface as a dome, steep at the meniscus and
          flat on top, catching one light where it faces it. On a bead that is
          the hard dot every macro frame has; on a finger it is a line along
          one side. The light is a fixed key from one corner, as a macro
          photographer's is, not the projector's lamp: that lamp is under the
          glass, so it reflects off nothing on top, and taken from the lamp's
          position (overhead, near vertical) every shoulder facing up matched
          it and each domain wore a grey bevel all the way round. From one
          corner, only the side facing it lights, and every bead's dot sits on
          the same side, as in the reference. The corner is the screen's, so
          it is turned into the plate's frame (c0, s0, as uvToFluid turns the
          plate): set in the plate's own, it went round with the motor and
          every dot circled its bead once a turn.
        */
        let tilt = 2.4 * exp(-max(dc, 0.0) / 0.9);
        let Nd = normalize(vec3f(outward * tilt, 1.0));
        let key = normalize(vec3f(-0.55, 0.45, 0.7));   // upper left: uv's y is up
        let keyPlate = vec3f(c0 * key.x - s0 * key.y, s0 * key.x + c0 * key.y, key.z);
        let H = normalize(keyPlate + vec3f(0.0, 0.0, 1.0));
        let glint = pow(max(dot(Nd, H), 0.0), 220.0);
        pc += vec3f(1.0, 0.97, 0.92) * glint * 0.9 * amt;

        /*
          The meniscus on the water's side: a thin bright line just outside,
          where the curved edge bends the lamp's light together. Made of the
          water's own colour (a domain in magenta liquid has a magenta line),
          and less than a cell wide, so it stays a line rather than the glow
          it used to be when it was sampled a few cells out.

          And a film too thin to reach half full anywhere (a short tap of the
          bottle adds a quarter a step; a patch dragged thin) has no line at
          all, and drawn only inside the line it vanished. So outside the
          line the old measure stands, a brown film as dark as it is full,
          but not read where the pixel is: within a few cells of a line the
          phase there is the line's own ramp, not liquid, and drawing it was
          the smudge. It is read four and a half cells out from the line
          instead (the ramp's tail is gone by then; at three, the distance
          estimate, which is only linear, ran out inside the tail and drew
          it as a dark ring two cells out), so
          it runs on continuously into whatever film lies beyond. Cutting it
          off near the line instead left a bright band round every domain
          wherever the maze left a trace of phase in the water.
        */
        let lens = exp(-pow(max(-dc, 0.0) / 0.55, 2.0)) * (1.0 - cover);
        let phFar = select(ph, viewAt(fuvBase + outward * (4.5 + dc) * cell).phase, slope > 1e-4 && dc > -4.5);
        /*
          Less a trace. A maze leaves a fifth of the plate between a tenth and
          half full (measured in the lab after eight seconds of Labyrinth:
          9.5% of cells at 0.1–0.2, 5% at 0.2–0.3), and drawn as film that
          was a brown haze over the water with a clean band round each domain,
          where the domain had drawn it in. The references' water is clear.
          So the first eighth is not drawn; a quarter-full film still is.
        */
        let film = 9.0 * pow(clamp((phFar - 0.12) / 0.88, 0.0, 0.43), 1.5) * (0.4 + 0.6 * amt);
        let lit = outColor * exp(-film * vec3f(0.45, 0.7, 1.0)) * (1.0 + 0.6 * lens * amt);
        outColor = mix(lit, pc, cover);
      }
    }

    /*
      The liquids' own chemistry, drawn over the dye (docs/physics-plan.md).
    */
    // Oil in water: where the two meet the light bends away, so a real oil
    // drop on a projector is ringed by a thin dark line (the meniscus), and
    // its body, a weak lens, is a touch brighter than the water around it.
    if (view.oil > 0.004) {
      let e = 1.2 / U.logicalGrid;
      let og = vec2f(viewAt(fuvBase + vec2f(e, 0.0)).oil - viewAt(fuvBase - vec2f(e, 0.0)).oil,
                     viewAt(fuvBase + vec2f(0.0, e)).oil - viewAt(fuvBase - vec2f(0.0, e)).oil);
      let rim = clamp(length(og) * 2.2, 0.0, 1.0);
      outColor = outColor * (1.0 - 0.55 * rim) + outColor * 0.08 * clamp(view.oil, 0.0, 1.0);
    }
    // A pH indicator in the dye (red cabbage's anthocyanin): red-pink in
    // acid, purple near neutral, green then yellow in base. Where there is no
    // acid or base the dye keeps its own colour.
    if (U.phIndicator > 0.001) {
      let a = clamp(view.acid, -1.0, 1.0);
      let neutral = vec3f(0.62, 0.35, 0.85);
      let ind = select(mix(neutral, vec3f(0.45, 0.85, 0.25), clamp(-a * 1.4, 0.0, 1.0)),
                       mix(neutral, vec3f(1.0, 0.25, 0.45), clamp(a * 1.4, 0.0, 1.0)), a >= 0.0);
      let w = U.phIndicator * clamp(abs(a) * 2.5, 0.0, 1.0) * fluid0.a;
      outColor = mix(outColor, outColor * ind * 1.7 + ind * 0.05, w);
    }
    // The BZ reaction in ferroin: red where the catalyst is reduced, blue
    // where the wave has oxidised it, over a pale dish.
    if (U.bzShow > 0.001 && (view.bz > 0.0005 || view.bzu > 0.0005)) {
      let ox = clamp(view.bz * 3.5, 0.0, 1.0);
      let col = mix(vec3f(0.92, 0.32, 0.22), vec3f(0.18, 0.42, 1.0), ox);
      outColor = mix(outColor, col, U.bzShow * 0.85);
    }
    // Liesegang's precipitate: brick-red bands (silver chromate) in the gel.
    if (U.liesShow > 0.001) {
      let band = clamp(view.pr * 1.5, 0.0, 1.0);
      outColor = mix(outColor, vec3f(0.62, 0.26, 0.14), U.liesShow * band * 0.9);
    }
  }
  auxN = -normal0.xy * fluid0.a;
  auxH = fluid0.a;

  if (U.thinFilm > 0.001 && fluid0.a > 0.004 && fluid0.a < 0.4) {
    let thin = smoothstep(0.4, 0.04, fluid0.a) * smoothstep(0.004, 0.03, fluid0.a);
    let filmC = thinFilmColour(fluid0.a * 16.0 + fbm3(fuv0 * 26.0) * 1.4 + U.time * 0.02);
    outColor = mix(outColor, outColor * (0.5 + 1.3 * filmC) + filmC * 0.08, thin * U.thinFilm * 0.85);
  }

  // ── Layer 1 (if present) ──────────────────────────────────────────
  if (U.layerCount > 1) {
    let c1 = cos(-U.rotation1);
    let s1 = sin(-U.rotation1);
    var fuv1 = uvToFluid(uv, c1, s1);
    if (U.dishSpread > 0.001) { fuv1 = dishToPlate(uvScreen, 1, aspect, c1, s1); }
    if (U.layerZoom1 > 1.001) { fuv1 = (fuv1 - 0.5) / U.layerZoom1 + 0.5 + U.layerDrift1; }
    var flow1 = vec2f(0.0);
    if (closeup) {
      flow1 = fluidFlow(vel1, fuv1) * macroAmt;
      fuv1 = macroWarp(fuv1);
    }
    var fluid1 = decodeFluidParts(layer1, parts1, fuv1, blurFluid, useBlur, dof);
    if (U.dishSpread > 0.001) {
      dish1 = layerDish(uvScreen, 1, U.resolution.x / U.resolution.y);
      fluid1.a *= dish1.x;
    }

    if (U.granulation > 0.002 && fluid1.a > 0.004) {
      fluid1.a = max(0.0, fluid1.a * (1.0 + U.granulation * pigmentGrain(grain1, fuv1) * 1.6));
    }

    if (useBlur && fluid1.a > 0.0) {
      let contrast = 1.2 + U.gooey * 4.0;
      fluid1.a = clamp((fluid1.a - 0.5) * contrast + 0.5, 0.0, 1.0);
    }

    let sharp1 = dof < 0.55;
    var near1 = vec4f(0.0);
    if (sharp1 && U.derivedOn > 0.5) { near1 = bicubicSigned(derived1, fuv1); }
    var normal1 = vec3f(0.0, 0.0, 1.0);
    if (sharp1) {
      if (U.derivedOn > 0.5) { normal1 = gradNormal(near1.xy); } else { normal1 = sobelNormal(layer1, fuv1); }
    }
    fluid1 = vec4f(applyLighting(fluid1.rgb, normal1, darkBlend, fuv1), fluid1.a);
    if (darkBlend) { fluid1.a *= 0.6; }

    if (U.boundaryContrast > 0.005 && fluid1.a > 0.03 && sharp1) {
      var edge1 = boundaryLine(near1.z);
      if (U.derivedOn <= 0.5) { edge1 = boundaryEdge(layer1, fuv1); }
      fluid1 = vec4f(fluid1.rgb + fluid1.rgb * edge1 * U.boundaryContrast * 1.6 + vec3f(edge1 * U.boundaryContrast * 0.25), fluid1.a);
    }
    // The per-pixel tests mask the result instead of branching around the
    // call: lacing measures two widths with fwidth, and WGSL reads a
    // derivative across the whole quad or not at all.
    if (U.lacing > 0.005) {
      let laced1 = lacing(fluid1.rgb, layer1, fuv1, fluid1.a, U.lacing);
      if (fluid1.a > 0.02 && sharp1) { fluid1 = vec4f(laced1, fluid1.a); }
    }
    if (plateOn && U.edgeRelief > 0.005 && sharp1) {
      fluid1 = vec4f(mix(fluid1.rgb, meniscus(fluid1.rgb, normal1, fluid1.a, fuv1), plateAmt), fluid1.a);
    }

    if (closeup) {
      let grad1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      fluid1 = mix(fluid1, macroDetail(fluid1.rgb, fluid1.a, fuv1, flow1, normal1, grad1, dof), macroAmt);
    }

    if (U.photo > 0.5) {
      let lit1 = pow(fluid1.rgb, vec3f(1.0 + 0.9 * fluid1.a)) * mix(outColor, vec3f(1.0), 0.22 * smoothstep(0.1, 0.6, fluid1.a)) * (1.0 + 0.2 * fluid1.a);
      outColor = mix(outColor, lit1, fluid1.a);
      let rim1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      outColor *= 1.0 - rim1 * fluid1.a * 0.4;
      outColor += vec3f(0.95, 0.97, 1.0) * pow(1.0 - clamp(normal1.z, 0.0, 1.0), 3.0) * fluid1.a * 0.15;
    } else {
      let blended = applyBlend(outColor, fluid1.rgb, U.blendMode);
      outColor = mix(outColor, blended, fluid1.a);
    }
    auxN = mix(auxN, -normal1.xy, fluid1.a * 0.5);
    auxH = max(auxH, fluid1.a);
  }

  // ── The lamp's hot-spot ──────────────────────────────────────────
  if (U.lamp.w > 0.001) {
    let dl = length(fuvBase - U.lamp.xy);
    let glow = exp(-dl * dl * 3.5);
    let pool = mix(vec3f(1.0), vec3f(1.05, 0.98, 0.9), glow * 0.5) * mix(0.78, 1.25, glow);
    outColor *= mix(vec3f(1.0), pool, U.lamp.w);
    if (U.lamp2.w > 0.001) {
      let d2 = length(fuvBase - U.lamp2.xy);
      let glow2 = exp(-d2 * d2 * 3.5);
      outColor *= mix(vec3f(1.0), mix(vec3f(1.0), vec3f(0.9, 0.97, 1.12) * 1.25, glow2), U.lamp2.w * U.lamp.w);
    }
  }

  // ── Satellite droplets ───────────────────────────────────────────
  if (U.droplets > 0.001 && plateOn) {
    let Ld = lampDir(fuvBase, U.lamp);
    let sideD = Ld.xy / max(length(Ld.xy), 0.06);
    let groundD = dot(outColor, vec3f(0.299, 0.587, 0.114));
    let keep = U.droplets * (0.18 + 0.32 * fluid0.a);
    var dropped = microDrops(outColor, fuvBase * U.logicalGrid * 0.55 + 17.0, sideD, groundD, keep);
    dropped = microDrops(dropped, fuvBase * U.logicalGrid * 1.1 + 5.0, sideD, groundD, keep * 0.6);
    outColor = mix(outColor, dropped, min(1.0, U.droplets * 1.5) * plateAmt);
  }

  // ── Bubbles ──────────────────────────────────────────────────────
  /*
    Bubbles, from the air field (H6 · A).

    This was forty uniforms and a metaball loop per pixel, and the cap of
    forty existed because that loop was as much as a compositor could afford.
    The field costs one sample and four more for its gradient, whatever the
    number of bubbles.

    The optics below are unchanged — they were tuned by eye against real
    references and there is no reason to disturb them. What changed is where
    their three inputs come from:

      edge     was a metaball sum, is now coverage on the same scale, so
               the membrane, inside and centre bands land where they did
      opac     was the largest per-bubble opacity, is now the coverage
               ramping in from the rim, which is the same quantity
      bestD    was the offset from the nearest bubble centre in units of its
               radius. The gradient of coverage points *into* a bubble, so
               its negative points out of one, and 1 - coverage is how far
               out — zero at the middle, one at the rim.

    The interior is already the lamp through clear glass, because the solver
    took the dye out of it before this ran. That is the whole point of H6,
    and it is why the lens mix below now has less to do than it did.
  */
  if (U.bubbleStrength > 0.001) {
    let airC = textureSampleLevel(air0, samp, fuvBase, 0.0);
    let aC = airC.r;
    if (aC > 0.02) {
      /*
        Each bubble drawn as the one it is.

        The air field carries, besides the coverage, where in its bubble each
        texel is (g, b) and the bubble's size, film age and a number of its
        own (a) — see wgsl/air.ts. With only the coverage,
        which is flat inside a bubble, every bubble was drawn alike: the same
        dark ring and the same dot, at an assumed radius (reported: "not
        varied enough ... either transparency differences, or light shining
        off them, or color"). Now its shape is a dome lit from the lamp, its
        clarity, its film colour and its highlight are its own, and its film
        drains and thins as it ages the way a soap film does.
      */
      // Where in its bubble, from the coverage-weighted position (see wgsl/air.ts).
      let p = clamp((airC.gb / max(aC, 1e-3) - vec2f(0.5)) * 2.0, vec2f(-1.0), vec2f(1.0));
      let rr = min(1.0, length(p));
      let h = sqrt(max(0.0, 1.0 - rr * rr));
      let outward = select(vec2f(1.0, 0.0), p / max(rr, 1e-4), rr > 1e-3);
      /*
        Its size, film age and number: packed whole, so read unfiltered —
        and from the largest of the four texels round the point, since just
        past a small bubble's rim the filtered coverage is still there while
        the nearest texel is already empty, and read from that the rim was
        drawn as a different, tiny bubble: a square halo round each one.
      */
      let looks = textureGather(3, air0, samp, fuvBase);
      let look = max(max(looks.x, looks.y), max(looks.z, looks.w)) * 2048.0 + 0.5;
      // Size on a log scale, 0.004 to 0.16 of the plate (see wgsl/air.ts).
      let R = 0.004 * exp2(floor(look / 128.0) / 15.0 * 5.321928);
      let age = (floor(look / 8.0) - floor(look / 128.0) * 16.0) / 15.0;
      let id = (floor(look) - floor(look / 8.0) * 8.0 + 0.5) / 8.0;
      let k1 = fract(id * 7.13 + 0.17);
      let k2 = fract(id * 13.71 + 0.53);
      let k3 = fract(id * 23.37 + 0.91);
      let bestD = p;
      // Pressed between two plates it is a lens, flatter than a sphere.
      let n = normalize(vec3f(p * 0.85, h + 0.15));
      let opac = smoothstep(0.02, 0.28, aC);
      let play = U.lightPlay;
      let Lb = lampDir(fuvBase, U.lamp);
      let lampSide = Lb.xy / max(length(Lb.xy), 0.06);
      let toward = dot(select(vec2f(1.0, 0.0), normalize(p), rr > 1e-3), lampSide);
      /*
        The liquid round it: its light and colour, averaged over a ring just
        outside the rim, so one bubble has one tint. It used to be read
        outward along the line through each point, and a bubble sitting
        between two colours came out in pie slices, each line tinted by what
        lay beyond it at that angle.
      */
      let centre = fuvBase - p * R;
      var rimCol = vec3f(0.0);
      var rimA = 0.0;
      for (var ri = 0; ri < 6; ri++) {
        let ang = f32(ri) * 1.0471976 + id * 6.2831853;
        let rf = decodeFluid(layer0, centre + vec2f(cos(ang), sin(ang)) * (R * 1.5 + 0.004), 0.0, false);
        rimCol += mix(bgColor, rf.rgb, rf.a);
        rimA += rf.a;
      }
      rimCol /= 6.0;
      let rimF = vec4f(rimCol, rimA / 6.0);
      let ground = dot(rimCol, vec3f(0.299, 0.587, 0.114));
      let filmT = smoothstep(0.02, 0.28, rimF.a);
      let tint = mix(vec3f(1.0), rimCol / max(max(rimCol.r, max(rimCol.g, rimCol.b)), 1e-3), filmT);

      // Through it: the liquid beyond, magnified by the lens (more toward the
      // middle), in the closeup; the projector's view of it (below) is the
      // liquid right there, a flat slab of air being a window, not a lens.
      let lensUv = fuvBase - p * R * (0.35 + 0.45 * play) * dropCam;
      let lensF = decodeFluid(layer0, lensUv, 0.0, false);
      let lensCol = mix(bgColor, lensF.rgb, lensF.a);
      // And the lamp through the clear gap, carrying the liquid's hue
      // (0.18 toward white: measured, see git history of this block).
      let through = mix(tint, vec3f(1.0), 0.18) * (0.45 + 0.5 * h + 0.55 * ground);
      // Some bubbles are all but clear, some milky with a thicker film.
      let clarity = mix(0.3, 0.95, k1);
      var c = mix(lensCol, through, 0.25 + 0.55 * clarity);
      c = mix(outColor, c, smoothstep(0.0, 0.2, h));

      // The film: interference colour, strongest at a glancing angle (the
      // rim), thicker at the bottom where it drains to, thinner with age
      // until it goes dark just before it breaks.
      let F = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.2);
      // Radially, from the height, which is smooth at any size; the drainage
      // toward the bottom only as a gentle lean, since which way is "down"
      // across a bubble three cells wide is too coarse to draw colour from.
      let thick = mix(0.35, 1.0, k2) * (1.0 - 0.85 * age) * (0.75 + 0.25 * h + 0.08 * clamp(p.y, -1.0, 1.0));
      let filmC = thinFilmColour(thick * 2.6 + 0.08 * sin(U.time * 0.4 + id * 40.0));
      let irid = (0.25 + 0.75 * U.iridescence) * (0.4 + 0.6 * k3) * (1.0 - smoothstep(0.8, 1.0, age));
      // A second lamp to the side is the one light that can put a glint on
      // an air pocket seen from beneath (below, as the projector throws it).
      var side = vec3f(0.0);
      if (U.lamp2.w > 0.001) {
        let L2 = lampDir(fuvBase, U.lamp2);
        let H2 = normalize(L2 + vec3f(0.0, 0.0, 1.0));
        let shine2 = mix(60.0, 260.0, clamp(0.02 / max(R, 0.004), 0.0, 1.0)) * mix(0.7, 1.3, k3) * 0.8;
        side = vec3f(0.75, 0.86, 1.0) * pow(max(dot(n, H2), 0.0), shine2) * 0.5 * U.lamp2.w;
      }

      /*
        As the projector throws it. Everything below this block is the
        camera's bubble, tuned by eye against macro photographs, and those
        photographs are lit from the front: their bright crescents are a
        room light reflected, their film colour a soap film facing the lens.
        A bubble between the glasses of a projector is neither (the research
        in the project's files, bubbles-and-drops.md, item 2). It is a pocket
        of air with the liquid pushed out: its walls are the meniscus and
        the glass, not a film; the 2% a water and air surface reflects goes
        back toward the lamp, never to the screen; and its curved edge bends
        the light three times as hard as an oil drop's, far past what the
        projection lens takes in. So on the plate:

        - **A dark band from the aperture**, past AIR_CORE (0.27) of the
          curved part: all but a pin-point of a small bubble, which is how
          air reads in every projected show, a pepper of dark dots; round a
          big one, which the glasses flatten into a pancake, a band 0.73 of
          half the gap wide, narrowing as the glasses are pressed together.
          Shaped by the gap exactly as a drop is (dropFlat, dropBand), the
          band's inner edge softened over 0.7 of a screen pixel: where in its
          bubble a point is comes from a linear field (wgsl/air.ts), good to
          well under a texel of the air, so a texel of the air would blur a
          small bubble's core away.
        - **A clear middle**, the lamp through a slab of air with a breath of
          the liquid's hue from the wetting film on the glass: what the
          camera's bubble is at its very centre, held flat across the window.
        - **No film colour unless asked for.** Iridescence at its default,
          a quarter, is what every look has always had, and the camera's
          bubble still wears it; the plate takes only what is asked above
          that, as a performer turning a soap film up (the looks that set
          0.6 and 0.9 get most of it; a look at 0.3, a trace).
        - **No highlight but the side lamp's.**

        The zoom crosses from this to the camera where the drops do
        (dropCam), so a bubble and a drop change view together.
      */
      var cp = vec3f(0.0);
      if (dropCam < 0.999) {
        let rho = dropHalfGap(fuvBase);
        let flatB = dropFlat(R, rho);
        let tB = dropBand(rr, R, rho);
        // A screen pixel in plate uv (uvToFluid, above).
        let spx = 1.0 / (max(U.resolution.x, U.resolution.y) * 1.5 * U.camZoom);
        let curvedB = max((1.0 - flatB) * R, spx);
        let softB = clamp(0.7 * spx / curvedB, 0.02, 0.3);
        let blackB = smoothstep(AIR_CORE - softB, AIR_CORE + softB, tB);
        cp = mix(lensCol, mix(tint, vec3f(1.0), 0.18) * (0.95 + 0.55 * ground), 0.25 + 0.55 * clarity);
        let iridP = clamp((U.iridescence - 0.25) / 0.75, 0.0, 1.0) * (0.4 + 0.6 * k3) * (1.0 - smoothstep(0.8, 1.0, age));
        cp = mix(cp, cp * (0.45 + 1.25 * filmC), clamp(iridP * 0.6, 0.0, 1.0));
        cp = cp * (1.0 - AIR_DARK * blackB) + side;
      }
      c = mix(c, c * (0.45 + 1.25 * filmC), clamp(irid * (0.25 + 0.95 * F), 0.0, 1.0));
      c *= 1.0 - 0.35 * smoothstep(0.85, 1.0, age) * F;

      // The rim: a glint where it faces the lamp, a thin meniscus line where
      // it faces away, each its own weight — not one dark ring on them all.
      let rimBand = smoothstep(0.78, 0.97, rr);
      c += (vec3f(1.0, 0.98, 0.94) * 0.5 + tint * 0.3) * rimBand * pow(max(0.0, toward), 1.5) * (0.35 + 0.5 * k2) * play;
      let meniscus = smoothstep(0.9, 0.995, rr) * (1.0 - smoothstep(0.995, 1.0, rr));
      c *= 1.0 - meniscus * (0.15 + 0.35 * k1) * (0.5 + 0.5 * max(0.0, -toward));

      // The lamp's reflection off its dome: sharp on a small bubble, broad
      // on a large one, and a fainter second one off the far wall.
      let H = normalize(Lb + vec3f(0.0, 0.0, 1.0));
      let shine = mix(60.0, 260.0, clamp(0.02 / max(R, 0.004), 0.0, 1.0)) * mix(0.7, 1.3, k3);
      let spec = pow(max(dot(n, H), 0.0), shine);
      let n2 = normalize(vec3f(-p * 0.6, h + 0.3));
      let spec2 = pow(max(dot(n2, H), 0.0), shine * 0.5) * 0.3;
      c += mix(vec3f(1.0, 0.98, 0.92), tint, 0.4 * filmT) * (spec + spec2) * (0.7 + 0.6 * ground) * (0.6 + 0.8 * k2);
      c += side;
      c = mix(cp, c, dropCam);
      let inside = smoothstep(0.0, 0.2, h);
      outColor = mix(outColor, c, opac * U.bubbleStrength * mix(0.7, 1.0, filmT));
      /*
        The camera pass (wgsl/camera.ts) bends the screen along this normal,
        which is the camera's dome: on the plate it would lens the window the
        projector sees as a flat slab of air, and push its band outward, in
        every look with the camera on. So it comes in with the camera's view.
      */
      auxN = mix(auxN, -bestD * 0.8, opac * inside * dropCam);
      auxB = max(auxB, opac * inside);
    }
  }

  // ── Oil drops ────────────────────────────────────────────────────
  /*
    A drop of oil on the plate, lit from beneath: a lens, not a painted disc.
    Reshaded three times on the owner's word that the beads and drops "look
    very cartoon like": against macro photographs of oil on backlit water,
    then, once the research showed a camera and a projector see a drop
    differently, as each of them sees it (dropLens, above, and the owner's
    "both"). The closeup is the camera (dropCam); the plate is the
    projector; the zoom between fades one into the other.

    As the projector throws it:
    - **A black band from the aperture.** Light crossing the drop's curved
      part further out than DROP_CORE of the way leaves it too steeply for
      the projection lens, so the screen there is dark: the outer three
      tenths of a droplet, a hair round a pancake. Not quite black (0.15 of
      the plate is left, as the lamp's spread and the oil's scatter leave
      some in the photographs), with a pixel's
      softening at its inner edge and none of its own at the contact,
      where the mask's coverage fades it into the plate.
    - **The middle, upright and as bright as the plate.** Traced in focus,
      the core is neither brighter nor dimmer than the plate round it; the
      brightening a ball gives is the defocused picture, not the focused one.

    As the camera sees it:
    - **What is under it, through the lens** (dropLens): turned over and
      shrunk in a small drop, as it is in a big drop's flat middle.
    - **A thin, crisp dark line at the contact**, and nothing else drawn.
      The meniscus is steep, so light from beneath leaves it sideways, most
      of it past what a camera's wider lens takes in: the projector's band,
      narrowed to its outer edge. The first reshade dimmed the outer half
      of every drop's radius, which read as a shadow painted round it.
    - **A brighter middle only where the drop is round**: a ball gathers the
      light behind it toward a camera focused past it; a pancake does not.

    In both, **no highlight.** The white dot every bead carried is a lamp
    seen in reflection, and a plate lit from beneath shows transmitted light
    only. Not one of the photographs has it, and it was the loudest thing
    saying sticker.
  */
  if (U.beads > 0.001 && drop.z >= 0.0) {
    let bm = beadAt(fuvSurf);
    let inner = bm.r;
    let ring = bm.g;
    let r = drop.z;
    let R = drop.w;
    let inDye = smoothstep(0.015, 0.2, auxH);
    let k = clamp(U.beads * 2.0, 0.0, 1.0) * mix(0.35, 1.0, inDye) * inner;
    let flat = dropFlat(R, dropRho);
    let t = dropBand(r, R, dropRho);
    // How much oil the light crosses: 1 over the flat top (or a small drop's
    // middle), falling as a quarter circle across the meniscus.
    let th = sqrt(max(0.0, 1.0 - t * t));
    let px = 1.0 / f32(textureDimensions(beadTex).y);
    /*
      The projector's band: black past DROP_CORE of the curved part. Its
      inner edge is softened over about a texel of the plate, as a fraction
      of the curved part's own width (the whole radius for a ball, gap/2 for
      a pancake). R is 0 where the lens could not tell (a drop's very
      centre), and there r is 0 too, well inside the core.
    */
    let curved = max((1.0 - flat) * R, px);
    let soft = clamp(0.7 * px / curved, 0.02, 0.3);
    let black = smoothstep(DROP_CORE - soft, DROP_CORE + soft, t);
    let projected = 1.0 - 0.85 * black;
    /*
      The camera's line, about two and a half texels of the plate wide
      whatever the drop's size, as a fraction of this one's radius. Up
      sharply across the line's inner edge and held to the contact: the
      coverage in kDrop fades the drop, line and all, into the plate over
      the mask's own antialiasing, so the line never ends in a hard step.
      That fade takes the outer texel, so the line is a texel and a half
      inside it, or the fade eats it: at a texel and a half across it came
      out 62% of the plate at its darkest (npm run droplens).
    */
    let w = clamp(2.4 * px / max(R, 1e-4), 0.08, 0.5);
    let rim = smoothstep(1.0 - w, 1.0 - 0.5 * w, r);
    let focus = 1.0 + 0.3 * (1.0 - r) * (1.0 - r) * (1.0 - flat);
    let photographed = focus * (1.0 - 0.85 * rim);
    let shade = mix(projected, photographed, dropCam);
    // The rings' drawn rim glows only where light gets through.
    let glow = ring * 0.15 * mix(1.0 - black, 1.0, dropCam);
    // Clear oil: nearly colourless, a breath warmer than the water round it.
    var dropC = outColor * vec3f(0.99, 0.97, 0.93) * shade;
    dropC += outColor * glow;

    /*
      Drops (beadDrops, PLAN.md batch 3): the second reference frame, where
      each drop is oil carrying a dye of its own, which a projected show
      draws as a flat pool of colour outlined in a thin dark line:

      - **Beer and Lambert.** The dye absorbs in proportion to how much oil
        the light crosses, so a big drop is its colour right across its flat
        top and only the meniscus thins toward clear, and a small round one
        is deepest in its middle. The first version painted the colour at
        85% right to the edge.
      - **The dye's own light.** On this plate dye is light (bare water is
        dark), so a dyed drop over bare water still glows its colour, as
        thick as the oil is.
      - **The same lens and line** as the clear drop above. None of it is a
        colour laid on top.

      The flattened walls and the compound drops are in the mask itself
      (rasterDrops in lib/beads.ts): the dome falls to zero along a wall, so
      the line follows the wall without knowing it is one.
    */
    var kDrop = k;
    if (U.beadDrops > 0.001 && beadWide()) {
      let dc = beadColour(fuvSurf);
      let absorb = -log(clamp(dc, vec3f(0.04), vec3f(1.0)));
      let trans = exp(-absorb * th * 1.0);
      let glowC = dc * (1.0 - dot(trans, vec3f(0.3333))) * 1.15;
      var body = (outColor * vec3f(0.99, 0.97, 0.93) * trans + glowC) * shade;
      body += (outColor * trans + glowC) * glow;
      dropC = mix(dropC, body, U.beadDrops);
      kDrop = clamp(U.beads * 2.0, 0.0, 1.0) * mix(mix(0.35, 1.0, inDye), 1.0, U.beadDrops) * inner;
    }
    outColor = mix(outColor, dropC, kDrop);
    auxB = max(auxB, inner * 0.4 * kDrop);
  }

  // ── The projectors' rims ─────────────────────────────────────────
  if (U.dishSpread > 0.001) {
    var other = 0.0;
    if (U.layerCount > 1) { other = dish1.x; }
    let anyIn = max(dish0.x, other);
    outColor *= mix(1.0, anyIn, U.dishSpread);
    var rims = dish0.y;
    if (U.layerCount > 1) { rims += dish1.y; }
    outColor += vec3f(0.95, 0.8, 0.55) * rims * 0.16 * U.dishSpread;
  }

  // ── Film projector ───────────────────────────────────────────────
  if (U.filmOn != 0 && U.filmMix > 0.001) {
    let fuvF = (uv - 0.5) * U.filmScale + 0.5 + normal0.xy * 0.03 * fluid0.a;
    let filmC = tex2(film, vec2f(fuvF.x, 1.0 - fuvF.y)).rgb;
    let fl = dot(filmC, vec3f(0.299, 0.587, 0.114));
    let key = smoothstep(U.filmKey, U.filmKey + 0.18, fl);
    let tinted = filmC * mix(vec3f(1.0), fluid0.rgb * 1.5, fluid0.a * 0.8);
    outColor = mix(outColor, outColor * 0.35 + tinted * 0.95, key * U.filmMix);
  }

  // ── Lamp warmth ──────────────────────────────────────────────────
  if (U.lampWarmth > 0.001) {
    let vc = (uv - 0.5) * vec2f(aspect, 1.0);
    let vig = 1.0 - smoothstep(0.45, 1.05, length(vc) * 1.25) * 0.45;
    outColor = mix(outColor, outColor * vec3f(1.06, 0.9, 0.7) * vig, U.lampWarmth);
  }

  // ── The dish ─────────────────────────────────────────────────────
  if (U.dish > 0.001) {
    let dc = (uvScreen - 0.5) * vec2f(aspect, 1.0);
    let dr = length(dc) / 0.5;
    let rimR = mix(1.9, 0.98, U.dish);
    let inside = 1.0 - smoothstep(rimR - 0.015, rimR + 0.01, dr);
    let rim = smoothstep(rimR - 0.035, rimR - 0.01, dr) * (1.0 - smoothstep(rimR - 0.005, rimR + 0.012, dr));
    let shade = 1.0 - smoothstep(rimR * 0.55, rimR, dr) * 0.35 * U.dish;
    outColor = outColor * inside * shade + vec3f(0.9, 0.85, 0.7) * rim * 0.35 * U.dish;
  }

  // ── Saturation grade ──────────────────────────────────────────────
  let luma = dot(outColor, vec3f(0.299, 0.587, 0.114));
  outColor = clamp(mix(vec3f(luma), outColor, U.saturation), vec3f(0.0), vec3f(1.0));

  // ── Film grain ────────────────────────────────────────────────────
  let grainLuma = dot(outColor, vec3f(0.299, 0.587, 0.114));
  /*
    Hashed off the pixel, not off the interpolated uv.

    This read the interpolated uv times the resolution, and fx.mjs has
    carried the explanation
    for a while: a plate drawn into a texture is mirrored (FLIP_Y), mirroring
    perturbs the interpolated uv in its last bit, and a hash turns a last-bit
    difference into a different sample. So "the chain changes nothing" measured
    a worst pixel of nine against a limit of ten — one step of headroom, on
    noise with no sign to it, and any change to what is on the plate tipped it
    over. It duly did: a merge that touched neither the post chain nor the
    compositor took it to eleven on the CI runner and went red.

    That note also says what to do — the coordinate wants to be the pixel — and
    that it was waiting on the shader freeze, which is over. The fragment's
    builtin position is
    its own centre: exact, identical whichever way the geometry was
    wound, and the same grain on the screen either way. Film grain belongs to
    the gate rather than to the picture, so this is also the more correct of
    the two.
  */
  /*
    The pixel as it lands on the screen. Drawn into a texture the rows run the
    other way (FLIP_Y), so the same screen pixel was row y on one path and row
    H-1-y on the other, and got another grain: fx.mjs's identity check read a
    4x4 block of 5.06 against 4.5 once Classic opened brighter, the grain
    scaling with the picture. Turned back, both paths hash the same pixel.
  */
  let screenPx = vec2f(in.pos.x, select(in.pos.y, U.resolution.y - in.pos.y, FLIP_Y < 0.0));
  let grain = (hashFinish(floor(screenPx) + fract(U.time * 47.3)) - 0.5) * 0.03
            * (0.05 + 0.95 * smoothstep(0.03, 0.4, grainLuma));
  if (U.cameraOn == 0) { outColor = clamp(outColor + grain, vec3f(0.0), vec3f(1.0)); }

  var result: FsOut;
  if (U.finishInMain == 1) { result.color = finishFrame(outColor, uvScreen, fragGl, markTex); }
  else if (U.finishInMain == 2) { result.color = ditherOut(outColor, fragGl); }
  else { result.color = vec4f(outColor, 1.0); }
  result.aux = vec4f(clamp(auxN, vec2f(-1.0), vec2f(1.0)) * 0.5 + 0.5, auxH, auxB);
  return result;
}
`;
