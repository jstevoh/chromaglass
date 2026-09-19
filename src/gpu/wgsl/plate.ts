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
 * Catmull-Rom, which passes through its samples, with the old B-spline kept
 * reachable through `U.bspline`. See the long note in the GLSL for why the
 * difference is the whole of why the plate used to look soft.
 */
const SAMPLING = /* wgsl */ `
fn bicubicSigned(t: texture_2d<f32>, uv: vec2f) -> vec4f {
  let texSize = vec2f(U.gridSize);
  if (U.bspline > 0.5) {
    let inv = 1.0 / texSize;
    var tt = uv * texSize - 0.5;
    let f = fract(tt);
    tt -= f;
    let nx = vec4f(1.0, 2.0, 3.0, 4.0) - f.x;
    let qx = nx * nx * nx;
    let ax = qx.x;
    let bx = qx.y - 4.0 * qx.x;
    let cx = qx.z - 4.0 * qx.y + 6.0 * qx.x;
    let wx = vec4f(ax, bx, cx, 6.0 - ax - bx - cx) * (1.0 / 6.0);
    let ny = vec4f(1.0, 2.0, 3.0, 4.0) - f.y;
    let qy = ny * ny * ny;
    let ay = qy.x;
    let by = qy.y - 4.0 * qy.x;
    let cy = qy.z - 4.0 * qy.y + 6.0 * qy.x;
    let wy = vec4f(ay, by, cy, 6.0 - ay - by - cy) * (1.0 / 6.0);
    let c = tt.xxyy + vec2f(-0.5, 1.5).xyxy;
    let sw = vec4f(wx.xz + wx.yw, wy.xz + wy.yw);
    let off = (c + vec4f(wx.yw, wy.yw) / sw) * inv.xxyy;
    let s0 = tex2(t, off.xz);
    let s1 = tex2(t, off.yz);
    let s2 = tex2(t, off.xw);
    let s3 = tex2(t, off.yw);
    return mix(mix(s3, s2, sw.x / (sw.x + sw.y)), mix(s1, s0, sw.x / (sw.x + sw.y)), sw.z / (sw.z + sw.w));
  }
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

fn lightThrough(unit: vec3f, thickness: f32) -> vec3f {
  if (U.transmission <= 0.001) { return unit; }
  let t = pow(max(unit, vec3f(1e-4)), vec3f(clamp(thickness, 0.35, 4.0)));
  return mix(unit, t, U.transmission);
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
  let thickness = mix(mix(totalDensity * 2.8, exposed, U.exposure), exposed, m) * (1.0 + darkness * 1.7);
  var alpha = 1.0 - exp(-thickness);
  alpha = min(mix(0.95, 0.995, m), alpha);

  return vec4f(lt, alpha);
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

/** A full-screen triangle, and the uv the GLSL's vertex stage produced. */
const VERT = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  // Two triangles' worth of corners, as the quad the GLSL draws.
  var p = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let xy = p[i];
  var out: VsOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  // WebGPU's framebuffer counts rows down from the top where GL counts up, so
  // the picture is flipped here rather than in every uv the shader takes.
  out.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
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

/** The pieces, for the slices still being ported to build on. */
export const PLATE_PARTS = { HEAD, SAMPLING, DECODE, VERT };
