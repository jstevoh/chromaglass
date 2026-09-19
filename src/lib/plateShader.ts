/**
 * The plate's own shaders: the full-screen quad, and the composite that turns
 * the solver's fields into the picture.
 *
 * Lifted out of `LiquidVisualizer` unchanged, so the WGSL twin arriving in P3
 * can be compared against it from a page of its own (docs/webgpu-plan.md).
 * Nothing here is new; the component's history is where to look for why any
 * given line is the way it is.
 *
 * FROZEN while the WebGPU port runs (docs/webgpu-plan.md, P2-P3): the
 * compositor moves to WGSL in P3, so a change here has to be made twice. Bug
 * fixes only, ported in the same pull request.
 *
 * Compiled a second time with `DERIVE_PASS` defined, which is the pass that
 * works out normals and edges once a frame.
 */

import { FINISH_GLSL } from './postChain';

export const PLATE_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

export const PLATE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 auxOut;   // for the camera: normal.xy (biased), dye height, bubble mask

uniform sampler2D u_layer0;
uniform sampler2D u_layer1;
uniform sampler2D u_derived0;      // each plate's neighbourhood, worked out once per texel (see DERIVE_PASS)
uniform sampler2D u_derived1;
uniform float u_derivedOn;         // 0 with ?derived=0: worked out per pixel, as before the derive pass
uniform int u_layerCount;
uniform float u_rotation0;
uniform float u_rotation1;
uniform vec2 u_resolution;
uniform float u_gooey;
uniform int u_darkBlend;
uniform int u_blendMode;
uniform int u_ledPlatform;
uniform int u_ledMode;
uniform vec3 u_ledColor;
uniform float u_ledAngle;
uniform float u_time;
uniform float u_glossiness;        // specular intensity, 0 = flat backlit dye
uniform float u_saturation;        // final grade saturation multiplier
uniform float u_boundaryContrast;  // bright interface line between dye colors
uniform float u_edgeRelief;        // meniscus at every blob edge, at any zoom
uniform float u_lacing;            // pale filaments along a colour boundary, set by the strain across it
uniform float u_layerZoom1;        // second layer viewed magnified about the centre
uniform vec2  u_layerDrift1;
uniform vec4  u_bubbles[40];       // x, y, r (fluid uv) and opacity
uniform vec4  u_bubbleShape[40];   // stretch axis × magnitude, wobble amplitude, wobble phase
uniform int   u_bubbleCount;
uniform float u_bubbleStrength;
uniform vec4  u_lamp;              // the projector lamp under the plate: x, y (fluid uv), height, hot-spot strength
uniform vec4  u_lamp2;             // a second lamp from another side, cooler: x, y, height, strength (0 = off)
uniform float u_lightPlay;         // how much the lamp's direction shows on bubbles and dye edges
uniform float u_iridescence;       // thin-film colour running round bubble rims
uniform float u_photo;             // photograph mode: a lit paper backdrop, dye as transmission, domes with a softbox in them
uniform vec3  u_paperA;            // the backdrop's two colours
uniform vec3  u_paperB;
uniform float u_droplets;          // satellite micro-droplets on the glass
uniform float u_thinFilm;          // interference colour where the dye runs thinnest
uniform int   u_cameraOn;          // the camera pass will add its own grain
uniform float u_lumia;             // Wilfred's aurora under the plate
uniform vec3  u_lumiaA;
uniform vec3  u_lumiaB;
uniform float u_gelWheel;          // rotating four-segment gel over the lamp
uniform float u_gelAngle;
uniform vec3  u_gel0; uniform vec3 u_gel1; uniform vec3 u_gel2; uniform vec3 u_gel3;
uniform sampler2D u_film;          // the film projector: a loop or the camera
uniform int   u_filmOn;
uniform float u_filmMix;
uniform float u_filmKey;
uniform vec2  u_filmScale;
uniform float u_lampWarmth;        // halogen grade
uniform float u_kaleido;           // mirror folds (0 = off, else 2..12)
uniform float u_kaleidoPhase;      // where the rig has turned to, accumulated on the CPU
uniform float u_kaleidoZoom;       // how much plate feeds each wedge
uniform float u_dish;              // round-dish vignette strength
uniform float u_exposure;          // plate-wide film exposure
uniform float u_transmission;      // light through the dye: thin pale, thick deep (0 = the flat glow)
uniform float u_dimmer;            // master brightness: the house dimmer, 0 is blackout
uniform int   u_finishInMain;      // 1: finish the frame here (dimmer, mark, dither); 2: dither only (into the camera's 8-bit texture, the chain finishing later); 0: nothing, the chain finishes
uniform sampler2D u_mark;          // a still laid over the plate: a logo, a title card
uniform float u_markOn;            // 1 when there is one loaded
uniform vec4 u_markRect;           // where it sits: centre xy, half-size xy, all in screen uv
uniform sampler2D u_grain0;         // pigment coordinates, lead plate: .rg one phase, .ba the other
uniform sampler2D u_grain1;
uniform float u_grainOn;           // 1 when the solver is carrying the coordinates
uniform float u_grainMix;          // crossfade between the two phases
uniform float u_granulation;       // how strongly the pigment separates
uniform float u_grainScale;        // grain lattice cells across the plate
uniform sampler2D u_beadTex;       // oil beads: interiors in red, rims in green (fluid uv)
uniform float u_beads;             // how much of them
uniform float u_dishSpread;        // each layer its own dish, spread apart like three projectors
uniform float u_cells;             // fine cell network on the lead plate, plate-wide
uniform float u_postBlur;          // gooey blur radius multiplier
uniform float u_gridSize;          // fluid sim texture resolution (what we sample)
uniform float u_logicalGrid;       // the 192-cell grid the look was tuned on

// ── Macro closeup camera ──
uniform sampler2D u_vel0;          // layer 0 velocity field (rg, signed, normalized)
uniform sampler2D u_vel1;
uniform vec2  u_camCenter;         // fluid-UV the frame is centred on (0.5,0.5 = plate centre)
uniform float u_camZoom;           // 1 = whole plate, 12 = extreme magnification
uniform float u_macro;             // 0 = off, 1 = macro detail pass enabled
uniform float u_macroCells;        // paint-cell / bubble structure amount
uniform float u_macroCellScale;    // cell size
uniform float u_macroLacing;       // dark lacing filaments along dye boundaries
uniform float u_macroDepth;        // dome shading, contact shadow, depth of field
uniform float u_macroEdge;         // fractal silhouette warp
uniform float u_macroRelief;       // surface relief: per-pixel normals, specular, occlusion
uniform float u_flowRate;          // fluid-UV per second, for advecting procedural detail
uniform float u_filmLevel;         // density below which magnified dye reads as bare ground
uniform float u_filmGain;          // maps the density above that level onto full opacity

const float PI = 3.14159265359;
const float DENSITY_SCALE = 8.0;

// Bicubic texture sampling — Catmull-Rom, which passes through its samples.
//
// This used to be the cubic B-spline basis under a comment that said
// Catmull-Rom, and the difference is the whole of why the plate looked soft.
// B-spline does not interpolate: at a texel centre its weights are
// (1, 4, 1)/6, so every fetch returned a blurred neighbourhood rather than the
// value that was there. That is a low-pass of about 0.6 of a cell applied to
// every sample the renderer takes — the dye, the normals, the interface line,
// the lacing — before anything else got a chance to soften it. At 384 cells on
// a 1080p projector one cell is nearly three pixels, so it read as an eight
// pixel smear over the whole plate.
//
// Catmull-Rom has the same support and the same cost bracket, and at a texel
// centre its weights are (0, 1, 0): what is in the cell is what comes out.
// Between centres it reconstructs with a mild negative lobe, which is what
// gives a boundary its edge back.
//
// The nine taps of the full kernel collapse to five by dropping the corners,
// whose combined weight is a couple of percent, and renormalising. The five
// are bilinear fetches placed off-centre so hardware filtering does the inner
// pair for free, which is the same trick the B-spline version used.
uniform float u_bspline;   // ?filter=bspline — the old sampler, to compare against
vec4 bicubicSigned(sampler2D tex, vec2 uv) {
  vec2 texSize = vec2(u_gridSize);
  /*
    The sampler this replaced, kept reachable from the query string.

    Not because anyone should run it — it is the bug — but because the claim
    that the plate got sharper was made from arithmetic on a machine that
    cannot render a plate worth looking at, and the person who can judge it
    should be able to flip between the two in a second rather than take my word
    and a table of kernel weights. See docs/judging.md.
  */
  if (u_bspline > 0.5) {
    vec2 inv = 1.0 / texSize;
    vec2 t = uv * texSize - 0.5;
    vec2 f = fract(t);
    t -= f;
    vec4 nx = vec4(1.0, 2.0, 3.0, 4.0) - f.x, qx = nx * nx * nx;
    float ax = qx.x, bx = qx.y - 4.0 * qx.x, cx = qx.z - 4.0 * qx.y + 6.0 * qx.x;
    vec4 wx = vec4(ax, bx, cx, 6.0 - ax - bx - cx) * (1.0 / 6.0);
    vec4 ny = vec4(1.0, 2.0, 3.0, 4.0) - f.y, qy = ny * ny * ny;
    float ay = qy.x, by = qy.y - 4.0 * qy.x, cy = qy.z - 4.0 * qy.y + 6.0 * qy.x;
    vec4 wy = vec4(ay, by, cy, 6.0 - ay - by - cy) * (1.0 / 6.0);
    vec4 c = t.xxyy + vec2(-0.5, 1.5).xyxy;
    vec4 sw = vec4(wx.xz + wx.yw, wy.xz + wy.yw);
    vec4 off = (c + vec4(wx.yw, wy.yw) / sw) * inv.xxyy;
    vec4 s0 = texture(tex, off.xz), s1 = texture(tex, off.yz);
    vec4 s2 = texture(tex, off.xw), s3 = texture(tex, off.yw);
    return mix(mix(s3, s2, sw.x / (sw.x + sw.y)), mix(s1, s0, sw.x / (sw.x + sw.y)), sw.z / (sw.z + sw.w));
  }
  vec2 samplePos = uv * texSize;
  vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
  vec2 f = samplePos - texPos1;

  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 off12 = w2 / w12;

  vec2 p0 = (texPos1 - 1.0) / texSize;
  vec2 p3 = (texPos1 + 2.0) / texSize;
  vec2 p12 = (texPos1 + off12) / texSize;

  vec4 acc = texture(tex, vec2(p12.x, p0.y))  * (w12.x * w0.y)
           + texture(tex, vec2(p0.x,  p12.y)) * (w0.x  * w12.y)
           + texture(tex, vec2(p12.x, p12.y)) * (w12.x * w12.y)
           + texture(tex, vec2(p3.x,  p12.y)) * (w3.x  * w12.y)
           + texture(tex, vec2(p12.x, p3.y))  * (w12.x * w3.y);
  float wsum = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return acc / wsum;
}

// The negative lobe can undershoot past zero at a hard boundary. Every
// channel of a plate is a density that is squared on decode, so a negative
// would come back as dye rather than as nothing: clamp before it can. (The
// derive pass's fields are signed, and read through bicubicSigned.)
vec4 textureBicubic(sampler2D tex, vec2 uv) {
  return max(bicubicSigned(tex, uv), vec4(0.0));
}

// Hash-based film grain
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
${FINISH_GLSL}

// Decode Beer-Lambert from packed texture
// R/G/B channels store log-space absorptions, A stores total density
// At packing: R=clamp(densityR/8*255), alpha=clamp(density/8*255)
// densityR = -log(r_channel)*density, so r_channel = exp(-densityR/density)
// We store absorption proportional: decoded = raw_channel/255*8 = absorption_value
// Then color = exp(-absorption / totalDensity)
// But we packed R=densityR/8*255 directly, and density=A/255*8
// So: absorption = R/255 * 8, totalDensity = A/255 * 8
// color_channel = exp(-absorption / totalDensity)

// sqrt-encoded in the texture (see packing loop) — squaring on decode gives
// far more precision at low densities, killing banding in smooth gradients
float decodeDensity(float a) {
  return a * a * DENSITY_SCALE;
}

/*
  Light through the dye.

  Decoded, a dye's colour is its transmittance for one unit of thickness, and
  the plate has only ever drawn that: the hue fixed whatever the depth, the
  thickness setting nothing but how opaque the colour is. A projector sends the
  lamp *through* the dye, and Beer–Lambert says what comes out: exp(−A·d), the
  unit colour raised to the thickness. So a thin wash is pale, nearly the lamp
  itself; a thick pool is the deep, dark version of the same dye; and where two
  dyes share a cell their absorbances add, so an overlap goes darker rather than
  brighter. Raising to the thickness also takes care of thick dye that decoded
  pale (the packed colour channels clip above 8 while the density does not):
  the clipped unit colour, raised to a thickness of four or six, is deep again.
  Floored at a third of a unit so the thinnest film keeps a tint.
*/
vec3 lightThrough(vec3 unit, float thickness) {
  if (u_transmission <= 0.001) return unit;
  vec3 t = pow(max(unit, vec3(1e-4)), vec3(clamp(thickness, 0.35, 4.0)));
  return mix(unit, t, u_transmission);
}


vec4 sampleLayer(sampler2D tex, vec2 uv) {
  return textureBicubic(tex, uv);
}

// UV transform: screen UV -> fluid simulation UV.
// u_camZoom magnifies about u_camCenter, which the macro camera parks on a bead.
vec2 uvToFluid(vec2 uv, float c, float s) {
  vec2 p = (uv - 0.5) * u_resolution;
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float scale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  return p / (scale * 128.0 * u_camZoom) + u_camCenter;
}

// Local dye velocity in fluid-UV per second — macro detail rides the paint.
vec2 fluidFlow(sampler2D vtex, vec2 fuv) {
  return (texture(vtex, fuv).rg * 2.0 - 1.0) * u_flowRate;
}

// Approximate Gaussian blur on density alpha in fluid UV space
float blurAlpha(sampler2D tex, vec2 fuv, float blurFluid) {
  // At the usual settings the kernel's step is a few screen pixels, which is a
  // fraction of a texel, and a blur that narrow over a bilinear field is
  // decided by its first few moments. Three taps an axis, at 0 and 1.554 steps
  // either side weighted 0.617 and 0.191, have the 5x5 kernel's second and
  // fourth moments along each axis (0.924 and 2.232 steps), for nine reads
  // instead of twenty-five. Wider than half a texel the field's corners would
  // start to show between the taps, so the whole kernel runs.
  if (u_derivedOn > 0.5 && blurFluid * u_gridSize < 0.5) {
    float d = blurFluid * 1.554;
    vec3 k = vec3(0.19138, 0.61724, 0.19138);
    float acc = 0.0;
    for (int j = 0; j < 3; j++) {
      for (int i = 0; i < 3; i++) {
        acc += k[i] * k[j] * texture(tex, fuv + vec2(float(i - 1), float(j - 1)) * d).a;
      }
    }
    return acc;
  }
  // 5x5 Gaussian kernel weights (sigma~1)
  const float w[25] = float[25](
    0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902,
    0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
    0.02193823, 0.09832033, 0.16210282, 0.09832033, 0.02193823,
    0.01330621, 0.05963430, 0.09832033, 0.05963430, 0.01330621,
    0.00296902, 0.01330621, 0.02193823, 0.01330621, 0.00296902
  );
  float result = 0.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 offset = vec2(float(i), float(j)) * blurFluid;
      // Plain bilinear here, not the bicubic: this is twenty-five taps whose
      // whole purpose is to blur, so reconstructing each one sharply first
      // costs five fetches apiece to throw the sharpness away again.
      float a = texture(tex, fuv + offset).a;
      result += a * w[(j + 2) * 5 + (i + 2)];
    }
  }
  return result;
}

// Decode fluid color from packed RGBA texture
// Returns (r, g, b, alpha) in linear [0,1]
vec4 decodeFluid(sampler2D tex, vec2 fuv, float blurFluid, bool useBlur) {
  vec4 raw = textureBicubic(tex, fuv);

  float rawAlpha = useBlur ? blurAlpha(tex, fuv, blurFluid) : raw.a;

  float totalDensity = decodeDensity(rawAlpha);
  if (totalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0);

  float absTotalDensity = decodeDensity(raw.a);
  if (absTotalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0, 0.0, 0.0, 0.0);

  // densityR packed as: densityR / 8 * 255 -> R/255 * 8 = densityR
  // color = exp(-densityR / density) = exp(-absorption_per_unit)
  float norm = 1.0 / absTotalDensity;
  float r = exp(-decodeDensity(raw.r) * norm);
  float g = exp(-decodeDensity(raw.g) * norm);
  float b = exp(-decodeDensity(raw.b) * norm);
  vec3 lt = lightThrough(vec3(r, g, b), absTotalDensity);
  r = lt.r; g = lt.g; b = lt.b;

  // Ink that absorbs every wavelength hides what is behind it far sooner than
  // a transparent dye of the same thickness does. Without this the blacks sit
  // over the lit ground at the same opacity as the yellows and grey out.
  float darkness = 1.0 - max(r, max(g, b));

  // Beer-Lambert volumetric opacity using blurred density for gooey edges.
  // Magnified, only dye thick enough to be a bead should register: below
  // u_filmLevel (tracked per frame from the plate's own density histogram) the
  // wash reads as bare ground, which is what gives a closeup its silhouettes.
  // Plate-wide, u_exposure blends toward the same floor-and-gain so a thin
  // film between ink structures reads as bare glass rather than a grey wash.
  float exposed = max(0.0, totalDensity - u_filmLevel) * u_filmGain;
  // Magnified, only dye thick enough to be a bead should register; plate-wide
  // the backlight comes through everything. Mixed rather than switched, so
  // pushing in is the exposure opening rather than a cut to another plate.
  float m = clamp(u_macro, 0.0, 1.0);
  float thickness = mix(mix(totalDensity * 2.8, exposed, u_exposure), exposed, m) * (1.0 + darkness * 1.7);
  float alpha = 1.0 - exp(-thickness);
  alpha = min(mix(0.95, 0.995, m), alpha);

  return vec4(r, g, b, alpha);
}

// The density gradient the plate's lighting is taken from: a Sobel over three
// solver cells, in fluid UV space.
vec2 sobelGrad(sampler2D tex, vec2 fuv) {
  float ts = 3.0 / u_logicalGrid;
  float d00 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts, -ts)).a);
  float d10 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0, -ts)).a);
  float d20 = decodeDensity(textureBicubic(tex, fuv + vec2( ts, -ts)).a);
  float d01 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts, 0.0)).a);
  float d21 = decodeDensity(textureBicubic(tex, fuv + vec2( ts, 0.0)).a);
  float d02 = decodeDensity(textureBicubic(tex, fuv + vec2(-ts,  ts)).a);
  float d12 = decodeDensity(textureBicubic(tex, fuv + vec2(0.0,  ts)).a);
  float d22 = decodeDensity(textureBicubic(tex, fuv + vec2( ts,  ts)).a);
  float gradX = (-d00 - 2.0 * d01 - d02 + d20 + 2.0 * d21 + d22) * 0.125;
  float gradY = (-d00 - 2.0 * d10 - d20 + d02 + 2.0 * d12 + d22) * 0.125;
  return vec2(gradX, gradY);
}

vec3 gradNormal(vec2 g) {
  return normalize(vec3(-g * 0.9, 1.0));
}

// Per pixel, as it was before the derive pass: eight reconstructions of the
// plate for every screen pixel. Still what ?derived=0 draws.
vec3 sobelNormal(sampler2D tex, vec2 fuv) {
  return gradNormal(sobelGrad(tex, fuv));
}

// ─── The lamp ───────────────────────────────────────────────────────
// One light for every material. A projector lamp sits under the plate at a
// point, so the light reaches each place on the plate from its own
// direction: a bubble to the left of the lamp is lit from its right, one on
// the far side from below. Everything that shades — dye edges, bubbles, the
// macro relief — asks this for its light instead of assuming a fixed sun.
vec3 lampDir(vec2 fuv, vec4 lamp) {
  return normalize(vec3(lamp.xy - fuv, max(0.15, lamp.z)));
}

// The colours of a thin film at thickness t (in cycles): the rim of a bubble,
// the thinnest sheet of oil.
vec3 thinFilm(float t) {
  return 0.5 + 0.5 * cos(6.28318530718 * (t + vec3(0.0, 0.33, 0.67)));
}

// Blinn-Phong + Fresnel shading, gated by u_glossiness.
// At glossiness 0 the dye renders as flat, evenly-lit matte color —
// the projected-light-show look — with no glass-sphere highlight dots.
vec3 applyLighting(vec3 color, vec3 normal, bool darkBlend, vec2 fuv) {
  if (u_glossiness < 0.005) return color;
  vec3 L = lampDir(fuv, u_lamp);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float diffuse = max(0.0, dot(normal, L));
  float specNdotH = max(0.0, dot(normal, H));
  float specular = pow(specNdotH, 48.0) * 0.25;
  float cosTheta = max(0.0, normal.z);
  float f0 = 0.04;
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosTheta, 5.0);
  float specularTotal = specular + fresnel * 0.12;

  vec3 lit;
  if (darkBlend) {
    float lf = 0.6 + 0.4 * diffuse;
    lit = color * lf;
  } else {
    float lf = 0.5 + 0.5 * diffuse;
    lit = color * lf + specularTotal;
  }
  return mix(color, lit, u_glossiness);
}

// Bright thin interface line where two distinct dye colors meet —
// fakes the oil-water boundary glow without a multi-fluid solve.
// The colour change across the pixel, before it is shaped into a line.
float boundaryDiff(sampler2D tex, vec2 fuv) {
  vec4 cC = decodeFluid(tex, fuv, 0.0, false);
  if (cC.a < 0.03) return 0.0;
  float e = (3.0 / u_logicalGrid) * 0.55;
  vec4 cR = decodeFluid(tex, fuv + vec2( e, 0.0), 0.0, false);
  vec4 cL = decodeFluid(tex, fuv + vec2(-e, 0.0), 0.0, false);
  vec4 cT = decodeFluid(tex, fuv + vec2(0.0,  e), 0.0, false);
  vec4 cB = decodeFluid(tex, fuv + vec2(0.0, -e), 0.0, false);
  // Only count chroma difference where dye exists on both sides (interface,
  // not the outer silhouette of a blob against empty glass).
  float maskX = min(cR.a, cL.a);
  float maskY = min(cT.a, cB.a);
  float diffX = length(cR.rgb - cL.rgb) * smoothstep(0.03, 0.25, maskX);
  float diffY = length(cT.rgb - cB.rgb) * smoothstep(0.03, 0.25, maskY);
  return diffX + diffY;
}

float boundaryLine(float diff) {
  return smoothstep(0.12, 0.75, diff);
}

float boundaryEdge(sampler2D tex, vec2 fuv) {
  return boundaryLine(boundaryDiff(tex, fuv));
}

// The meniscus a bead has between two plates: a dark rim where the oil
// curves away from the glass and a bright refracted highlight just inside
// it. The macro pass builds this from a full height field; plate-wide, the
// sobel normal is enough to carry the same read.
vec3 meniscus(vec3 color, vec3 n, float a, vec2 fuv) {
  float rim = clamp((1.0 - n.z) * 6.0, 0.0, 1.0) * smoothstep(0.02, 0.2, a);
  vec3 L = lampDir(fuv, u_lamp);
  // In the photograph the softbox in the dome is the reflection; the
  // meniscus keeps only a pin of it, or every small drop turns into a speck.
  float spec = pow(max(dot(n, L), 0.0), mix(10.0, 24.0, u_photo)) * mix(1.0, 0.3, u_photo);
  // Which way this edge faces, against where the lamp is: the rim toward
  // the lamp glows in the dye's own colour, the rim away from it sits in
  // its own shadow. Straight under the lamp the two sides are the same.
  vec2 nd = n.xy / max(length(n.xy), 1e-4);
  float facing = clamp(dot(nd, L.xy) * 3.0, -1.0, 1.0);
  float play = u_lightPlay;
  vec3 c = color * (1.0 - rim * (0.55 + 0.3 * max(0.0, -facing) * play));
  c += color * rim * max(0.0, facing) * 0.7 * play;
  c += vec3(1.0, 0.98, 0.92) * spec * rim * 1.1;
  if (u_lamp2.w > 0.001) {
    vec3 L2 = lampDir(fuv, u_lamp2);
    float facing2 = clamp(dot(nd, L2.xy) * 3.0, -1.0, 1.0);
    float spec2 = pow(max(dot(n, L2), 0.0), 10.0);
    c += (vec3(0.72, 0.84, 1.0) * spec2 * rim * 1.0 + mix(color, vec3(0.7, 0.85, 1.0), 0.4) * rim * max(0.0, facing2) * 0.6 * play) * u_lamp2.w;
  }
  return mix(color, c, u_edgeRelief);
}

// ─── Macro closeup detail ──────────────────────────────────────────
// At 6-12x magnification the 192-cell solver only supplies the large-scale
// shape of the dye; everything finer is synthesised here, in fluid space, so
// it magnifies with the camera the way real structure would: packed paint
// cells (dark cores in bright rings), lacing filaments dragged along the flow,
// a crinkled silhouette, dome shading and a shallow depth of field.

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  float a = 0.5, sum = 0.0;
  for (int i = 0; i < 3; i++) { sum += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return sum * 1.14;   // ~0..1
}

/**
 * Lacing: the pale hair-thin threads that outline every colour boundary in a
 * poured film.
 *
 * They cannot be found in the dye, because the solver has no structure below
 * its own grid: a boundary there is a smooth ramp a few cells wide, and no
 * amount of reading it gives a thread. So a thread is a level line of the
 * colour as it changes across the boundary, which makes it follow the
 * boundary's own shape rather than sitting near it as noise.
 *
 * Two things decide how many lines there are, and both matter more than the
 * amount does. The first is the whole colour change across the boundary rather
 * than the change per cell: one and a half lines are laid across that span,
 * whatever it is, so a soft ramp gets a thread at its middle instead of a stack
 * of evenly spaced isolines. The second is the screen: lines are never allowed
 * closer than a few pixels, so the plate drawn small in a second dish gets
 * threads rather than the stipple that a contour map turns into when its lines
 * fall under a pixel.
 *
 * What decides the width is whether the boundary is folding or being drawn out,
 * and that is taken from the boundary's own shape: where it curls the thread
 * piles into a thicker, brighter braid, and along a straight run it draws out
 * to a hair. The strain rate across the interface is the truer quantity and is
 * what this was first written against, but measured on the plate its sign holds
 * for only three or four cells, so along any one thread it changes too often to
 * read as anything. A boundary that folds is a boundary that curves, and a
 * curve holds over the whole length of a curl.
 *
 * Only where dye lies on both sides, so a blob's outer silhouette against bare
 * glass is left alone.
 */
vec3 lacing(vec3 color, sampler2D tex, vec2 fuv, float alpha, float amount) {
  float e = 3.0 / u_logicalGrid;       // one solver cell, in fluid uv
  vec4 cR = decodeFluid(tex, fuv + vec2( e, 0.0), 0.0, false);
  vec4 cL = decodeFluid(tex, fuv + vec2(-e, 0.0), 0.0, false);
  vec4 cT = decodeFluid(tex, fuv + vec2(0.0,  e), 0.0, false);
  vec4 cB = decodeFluid(tex, fuv + vec2(0.0, -e), 0.0, false);
  // Which way is across the boundary. The colour changes along x and along y
  // are vectors in colour space, and their lengths alone lose the sign between
  // them: a boundary whose colour runs from top left to bottom right reads the
  // same as one running from bottom left to top right, and the axis built from
  // that folded direction cancels to nothing. Every blob's outline lost its
  // thread at the two places where it faced that way. The direction of greatest
  // change is the principal axis of the colour structure tensor, which keeps
  // the sign.
  vec3 dx = (cR.rgb - cL.rgb) * smoothstep(0.02, 0.2, min(cR.a, cL.a));
  vec3 dy = (cT.rgb - cB.rgb) * smoothstep(0.02, 0.2, min(cT.a, cB.a));
  float jxx = dot(dx, dx), jyy = dot(dy, dy), jxy = dot(dx, dy);
  float jd = jxx - jyy;
  float gm = sqrt(0.5 * (jxx + jyy + sqrt(jd * jd + 4.0 * jxy * jxy)));
  if (gm < 0.004) return color;
  float th = abs(jxy) + abs(jd) > 1e-9 ? 0.5 * atan(2.0 * jxy, jd) : 0.0;
  vec2 n = vec2(cos(th), sin(th));              // across the boundary
  vec2 tang = vec2(-n.y, n.x);                  // along it
  vec3 axis = (cR.rgb - cL.rgb) * n.x + (cT.rgb - cB.rgb) * n.y;
  float al = length(axis);
  if (al < 1e-4) return color;
  axis /= al;
  // The whole colour change across the boundary, not the change per cell.
  vec4 fAhead = decodeFluid(tex, fuv + n * e * 4.0, 0.0, false);
  vec4 fBack  = decodeFluid(tex, fuv - n * e * 4.0, 0.0, false);
  float span = abs(dot(fAhead.rgb - fBack.rgb, axis)) * smoothstep(0.02, 0.2, min(fAhead.a, fBack.a));
  // A boundary worth outlining is one that changes quickly, not merely one that
  // changes. Without the second test a wide soft ramp is still a span, and
  // laying threads across it draws the contour map this pass exists to avoid:
  // a fifty-cell ramp got six or seven parallel lines where it wanted none.
  // The threshold is where it is because it was measured rather than guessed:
  // on a soft ramp the colour changes by 0.07-0.09 a cell, and only a real
  // boundary carries 0.2, so a gate opening at 0.03 stood open over most of the
  // plate.
  float band = smoothstep(0.05, 0.3, span) * smoothstep(0.08, 0.20, al);
  if (band < 0.004) return color;
  // Whether the boundary here is folding or being drawn out, taken from its own
  // shape rather than from the velocity field. The strain rate across the
  // interface is the truer quantity and it is what this pass was written
  // against, but measured on the plate its sign holds for only three or four
  // cells — about ten pixels — so along any one thread it changes too often to
  // read as braid against hair. A boundary that folds is a boundary that
  // curves, and curvature holds over the whole length of a curl, so that is
  // what sets the width: the level line's own bend, from how far the colour
  // strays from constant along the boundary.
  float fC = dot(color, axis);
  float t2 = e * 2.0;
  float bend = abs(dot(decodeFluid(tex, fuv + tang * t2, 0.0, false).rgb, axis)
                 + dot(decodeFluid(tex, fuv - tang * t2, 0.0, false).rgb, axis)
                 - 2.0 * fC) / max(al, 1e-3);
  // A floor, so a straight boundary still gets its hair: without one the thread
  // is a fraction of a pixel wide at under half weight, which is no thread at
  // all, and the pass drew only the curls.
  float fold = max(smoothstep(0.15, 1.6, bend), 0.4);                  // 1 curling, 0.4 straight
  // One thread, at the middle of the change — found by walking out along the
  // normal until the colour stops changing at a boundary's rate, rather than by
  // laying a repeating level across a fixed window. The fixed window is what
  // stacked a wide steep band: its ends fall inside the change, the spacing
  // comes from part of it, and the level then repeats four or five times across
  // the one boundary. Walking ends that by construction — there is one middle.
  //
  // The step it stops on is fractional, not whole: a walk that could only stop
  // on a cell made the reach, the middle and the width piecewise constant over
  // patches of the plate, which put cell-sized stair-steps along a thread's
  // edges and broke it into dashes where the patches were small. Blending the
  // last step by how far the colour got through it makes all three continuous
  // for nothing.
  float fP = fC, fM = fC;
  float step = al * 0.35;                       // still changing at a boundary's rate
  bool goP = true, goM = true;
  vec3 prevP = color, prevM = color;
  for (int i = 1; i <= 5; i++) {
    vec2 o = n * e * 2.0 * float(i);
    if (goP) {
      vec3 cp = decodeFluid(tex, fuv + o, 0.0, false).rgb;
      float d = length(cp - prevP);
      if (d < step) { fP = mix(fP, dot(cp, axis), d / max(step, 1e-5)); goP = false; }
      else { fP = dot(cp, axis); prevP = cp; }
    }
    if (goM) {
      vec3 cm = decodeFluid(tex, fuv - o, 0.0, false).rgb;
      float d = length(cm - prevM);
      if (d < step) { fM = mix(fM, dot(cm, axis), d / max(step, 1e-5)); goM = false; }
      else { fM = dot(cm, axis); prevM = cm; }
    }
  }
  float reach = abs(fP - fM);                   // the whole change, in colour
  if (reach < 0.02) return color;
  // The level to draw at: the middle of that change, jittered a little so the
  // threads are not a drawn contour. The jitter leans toward the brighter side
  // rather than along n. The structure tensor gives an axis, not a direction,
  // so n turns round as a boundary passes through vertical. Everything else here
  // is the same either way round, but a jitter taken along n jumped to the
  // other side of the middle there and put a kink in the thread.
  float toward = clamp(dot(axis, vec3(0.299, 0.587, 0.114)) * 8.0, -1.0, 1.0);
  float mid = 0.5 * (fP + fM) + (fbm3(fuv * u_logicalGrid * 0.16 + u_time * 0.015) - 0.5) * 0.14 * reach * toward;
  float lvl = abs(fC - mid);
  // Never thinner than the pixel it is drawn on, or a thread samples as a row
  // of broken dots — which is what the plate drawn small in a second dish was
  // showing.
  // A thread is a few pixels wide, on a rim or on a fifty-cell ramp alike. Width
  // as a fraction of the change looks the same at a boundary and turns into a
  // pale bar a fifth of the band across on a wide one, because the change is
  // spread over that many pixels — which is what replaced the stacks rather
  // than removing them. So the width is set in pixels and only then capped by
  // the change, which keeps a narrow band's thread inside its own boundary.
  float px = max(fwidth(fuv.x), fwidth(fuv.y)) + 1e-6;
  float perPixel = al * px / e;                 // colour change per screen pixel
  float wide = min(max(mix(1.6, 4.5, fold) * perPixel, fwidth(fC) * 0.75),
                   mix(0.10, 0.30, fold) * reach);
  float line = 1.0 - smoothstep(0.0, wide, lvl);
  float thread = line * band * mix(0.55, 1.0, fold);
  vec3 pale = mix(vec3(1.0), color, 0.18) * mix(0.85, 1.2, fold);
  return mix(color, pale, clamp(thread * amount, 0.0, 1.0) * smoothstep(0.02, 0.16, alpha));
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
float grainAt(vec2 p) {
  // Mostly one octave: an fbm puts its energy two octaves up, which lands the
  // speckle at a pixel or two and reads as video noise rather than as pigment.
  return vnoise(p) * 0.78 + vnoise(p * 2.13 + 11.7) * 0.22;
}
float pigmentGrain(sampler2D grainTex, vec2 fuv) {
  vec2 a = fuv, b = fuv;
  if (u_grainOn > 0.5) { vec4 g = texture(grainTex, fuv); a = g.rg; b = g.ba; }
  return mix(grainAt(a * u_grainScale), grainAt(b * u_grainScale), u_grainMix) - 0.5;
}

// Satellite droplets: the hundreds of tiny beads that sit on the glass around
// every drop in a macro photograph. Each cell of a jittered grid holds one
// small lens, shaded like the big bubbles — dim toward the lamp, bright away
// from it, a point of the lamp on its dome.
vec3 microDrops(vec3 c, vec2 p, vec2 lampSide, float ground, float keep) {
  vec2 i = floor(p), f = fract(p);
  vec3 outc = c;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 h = hash22(i + g);
      if (h.x > keep) continue;
      vec2 centre = g + 0.2 + h * 0.6;
      float rad = 0.10 + hash12(i + g + 7.7) * 0.2;
      vec2 d = (f - centre) / rad;
      float q = dot(d, d);
      if (q > 1.0) continue;
      float rim = smoothstep(0.5, 1.0, q);
      float toward = dot(d / max(sqrt(q), 1e-3), lampSide);
      vec3 dc = c * (1.06 + 0.18 * max(0.0, -toward) * (1.0 - rim));
      dc = mix(dc, c * c * 1.15, rim * (0.5 + 0.35 * max(0.0, toward)));
      vec2 hd = d - lampSide * 0.4;
      dc += vec3(1.0, 0.98, 0.95) * exp(-dot(hd, hd) * 14.0) * (0.25 + 0.4 * ground);
      outc = mix(outc, dc, smoothstep(1.0, 0.85, q));
    }
  }
  return outc;
}


// Surface height across one cell, as a function of the signed distance to its
// edge: the film is thin over the sunken core and piles into a meniscus ridge
// at the rim. Differentiating this along the radial direction gives an exact
// normal — screen-space derivatives of the same field come out blocky, because
// they are evaluated per 2x2 quad over hard-edged masks.
float cellHeight(float d, float rimWidth) {
  float sunk = 1.0 - smoothstep(-rimWidth * 1.6, rimWidth * 0.1, d);
  float ridge = exp(-pow((d - rimWidth * 0.25) / (rimWidth * 1.2), 2.0));
  return ridge * 0.55 - sunk * 0.85;
}

// Each layer's own dish when the layers are spread: the lead plate large and
// a little right of centre, the second smaller at the left, the way three
// projectors overlap on one screen. Returns (inside, rim).
vec2 layerDish(vec2 uvScreen, int layer, float aspect) {
  // Both dishes stay inside the plate's inscribed circle (radius 0.5 of the
  // frame height), so the square plate's corners never show through a dish.
  float s = u_dishSpread;
  vec2 c = layer == 0 ? vec2(0.5 + 0.144 * s / aspect, 0.5 - 0.02 * s) : vec2(0.5 - 0.304 * s / aspect, 0.5 + 0.06 * s);
  float rad = layer == 0 ? mix(0.98, 0.66, s) : mix(0.98, 0.36, s);
  vec2 d = (uvScreen - c) * vec2(aspect, 1.0);
  float dr = length(d) / 0.5;
  float inside = 1.0 - smoothstep(rad - 0.02, rad + 0.012, dr);
  float rim = smoothstep(rad - 0.03, rad - 0.01, dr) * (1.0 - smoothstep(rad - 0.004, rad + 0.012, dr));
  return vec2(inside, rim);
}

// With the layers spread, each dish is a whole plate: the dish's disc is the
// plate's inscribed circle, so the corners of the square glass stay hidden
// and everything on the plate is in the picture, rotated with the plate.
vec2 dishToPlate(vec2 uvScreen, int layer, float aspect, float c, float s) {
  float sp = u_dishSpread;
  vec2 cen = layer == 0 ? vec2(0.5 + 0.144 * sp / aspect, 0.5 - 0.02 * sp) : vec2(0.5 - 0.304 * sp / aspect, 0.5 + 0.06 * sp);
  float rad = layer == 0 ? mix(0.98, 0.66, sp) : mix(0.98, 0.36, sp);
  vec2 d = (uvScreen - cen) * vec2(aspect, 1.0) / (rad * 0.5);   // dish edge at |d| = 1
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  return 0.5 + d * 0.5;
}

struct Cell {
  float core;   // interior mask
  float rim;    // bright ring, negative just outside (the dark outline)
  float id;     // per-bubble random
  vec2 slope;   // 2D gradient of the cell's surface height
};

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
Cell cellField(vec2 p0, vec2 flow, float seed, float period, float phase, float rimWidth) {
  float a = fract(u_time / period + phase);
  float env = sin(3.14159265 * a);
  env *= env;

  vec2 p = p0 - flow * (a * period);
  vec2 ip = floor(p), fp = fract(p);

  float core = 0.0, bright = 0.0, outline = 0.0, id = 0.0;
  float bestW = -1.0, bestD = 1.0;
  vec2 bestDir = vec2(1.0, 0.0);

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 h = hash22(ip + g + seed);
      vec2 c = g + 0.5 + (h - 0.5) * 0.62;
      float r = 0.16 + h.x * 0.22;
      vec2 delta = fp - c;
      float dist = length(delta);
      float d = dist - r;
      if (d > rimWidth * 3.5) continue;                  // nowhere near this cell

      float cr = 1.0 - smoothstep(-rimWidth * 0.8, -rimWidth * 0.15, d);
      float br = 1.0 - smoothstep(rimWidth * 0.35, rimWidth * 1.15, abs(d));
      float ol = 1.0 - smoothstep(rimWidth * 0.5, rimWidth * 1.3, abs(d - rimWidth * 2.0));

      core = max(core, cr);
      bright = max(bright, br);
      outline = max(outline, ol);

      float w = max(cr, br);
      if (w > bestW) { bestW = w; bestD = d; bestDir = delta / max(dist, 1e-4); id = h.y; }
    }
  }

  // Slope only for the cell that owns this pixel — two profile evaluations
  // per generation instead of eighteen.
  float e = rimWidth * 0.35;
  float dh = (cellHeight(bestD + e, rimWidth) - cellHeight(bestD - e, rimWidth)) / (2.0 * e);

  // A bright ring covers the dark outline of whatever it overlaps.
  float rim = bright - outline * 0.7 * (1.0 - bright);
  return Cell(core * env, rim * env, id, bestDir * dh * env);
}

// Crinkle the sampled position so bicubic-smooth silhouettes gain sub-cell
// structure. A uniform drift (never a per-pixel flow offset) keeps it stable.
vec2 macroWarpOffset(vec2 fuv) {
  if (u_macroEdge < 0.005) return vec2(0.0);
  float f = u_logicalGrid * 0.85;
  vec2 t = vec2(u_time * 0.012, u_time * -0.009);
  vec2 w = vec2(fbm3(fuv * f + t), fbm3(fuv * f + vec2(37.2, 11.7) + t)) - 0.5;
  w += (vec2(fbm3(fuv * f * 2.7 + t * 2.0), fbm3(fuv * f * 2.7 + vec2(5.1, 19.3) + t * 2.0)) - 0.5) * 0.45;
  // Scaled by how far in we are (see macroAmt): sub-cell crinkle on a
  // plate-wide frame is noise, and on a bead it is the silhouette.
  return w * (u_macroEdge * 1.1 * clamp(u_macro, 0.0, 1.0) / u_logicalGrid);
}

vec2 macroWarp(vec2 fuv) { return fuv + macroWarpOffset(fuv); }

// Decode an already-fetched texel — the defocused path doesn't need bicubic
// filtering or a gooey blur, so it costs 5 plain fetches instead of 5 decodes.
vec4 decodeFluidRaw(vec4 raw) {
  float totalDensity = decodeDensity(raw.a);
  if (totalDensity < 0.001 / DENSITY_SCALE) return vec4(0.0);
  float norm = 1.0 / totalDensity;
  vec3 c = lightThrough(exp(-vec3(decodeDensity(raw.r), decodeDensity(raw.g), decodeDensity(raw.b)) * norm), totalDensity);
  float darkness = 1.0 - max(c.r, max(c.g, c.b));
  float thickness = mix(totalDensity * 2.8, max(0.0, totalDensity - u_filmLevel) * u_filmGain, clamp(u_macro, 0.0, 1.0))
                  * (1.0 + darkness * 1.7);
  return vec4(c, min(mix(0.95, 0.995, clamp(u_macro, 0.0, 1.0)), 1.0 - exp(-thickness)));
}

// 5-tap defocus. The blur radius is constant in screen space, so the
// out-of-focus surround holds still as the camera zooms.
vec4 decodeFluidDof(sampler2D tex, vec2 fuv, float blurFluid, bool useBlur, float dof) {
  if (dof < 0.02) return decodeFluid(tex, fuv, blurFluid, useBlur);
  float r = dof * 0.022 / (1.5 * u_camZoom);
  vec4 raw = (texture(tex, fuv)
            + texture(tex, fuv + vec2(r, 0.0)) + texture(tex, fuv - vec2(r, 0.0))
            + texture(tex, fuv + vec2(0.0, r)) + texture(tex, fuv - vec2(0.0, r))) * 0.2;
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
vec4 macroDetail(vec3 col, float alpha, vec2 fuv, vec2 flow, vec3 gridNormal, float grad, float dof) {
  // The silhouette warp is meant to crinkle blob outlines, not to deform the
  // cells themselves — bent circles read as lumps rather than as bubbles.
  vec2 cuv = fuv - macroWarpOffset(fuv) * 0.75;
  float focus = 1.0 - dof * 0.85;
  float paint = smoothstep(0.02, 0.20, alpha);

  // ── Packed cells ────────────────────────────────────────────────
  float core = 0.0, rim = 0.0, fineCore = 0.0, fineRim = 0.0, id = 0.0, k = 0.0;
  vec2 cellSlope = vec2(0.0);
  if (u_macroCells > 0.005) {
    float freq = u_logicalGrid / max(0.15, u_macroCellScale * 8.0);
    vec2 p = cuv * freq;
    vec2 f = flow * freq;

    // Cells cluster in patches, the way pouring medium breaks out unevenly.
    // Larger, higher-contrast patches: a real pour breaks out in cell-covered
    // areas next to smooth ones, rather than pebbling the whole frame evenly.
    float clumping = smoothstep(0.04, 0.26, alpha) * smoothstep(0.26, 0.60, fbm3(cuv * 8.0 + u_time * 0.015));
    k = u_macroCells * focus * clumping;

    // Coarse cells: two generations, half a cycle apart
    Cell g0 = cellField(p, f, 0.0, 3.2, 0.0, 0.13);
    Cell g1 = cellField(p, f, 17.0, 3.2, 0.5, 0.13);
    // Union, not sum: adding two generations' masks welds their circles into
    // compound blobs, while taking the stronger of the two keeps every cell
    // round as it fades in over the one it replaces.
    core = max(g0.core, g1.core);
    rim = max(g0.rim, g1.rim);
    id = g0.core > g1.core ? g0.id : g1.id;

    // Fine cells crowd into the gaps between the big ones, as they do in a
    // real pour, and read as the grain of the film rather than as bubbles.
    Cell h0 = cellField(p * 2.9 + 11.3, f * 2.9, 41.0, 2.1, 0.0, 0.16);
    Cell h1 = cellField(p * 2.9 + 11.3, f * 2.9, 63.0, 2.1, 0.5, 0.16);
    float gap = clamp(1.0 - core * 1.6, 0.0, 1.0);
    fineCore = max(h0.core, h1.core) * gap;
    fineRim = max(h0.rim, h1.rim) * gap;
    cellSlope = (g0.slope + g1.slope) + (h0.slope + h1.slope) * 0.55 * gap;

    vec3 dark = col * 0.03;
    vec3 ring = mix(col, vec3(1.0, 0.94, 0.74), 0.55) * (1.25 + id * 0.6);

    // Cell cores are holes in the film, not a tint over it: darken them the
    // whole way rather than scaling the darkening down with the patch mask.
    col = mix(col, dark, clamp(core + fineCore * 0.55, 0.0, 1.0) * min(1.0, k * 1.6));
    col += ring * clamp(rim * 1.1 + fineRim * 0.5, -0.5, 2.0) * k;
  }

  // ── Lacing — thin dark filaments streaming along the flow ───────
  float lace = 0.0;
  if (u_macroLacing > 0.005) {
    vec2 dir = length(flow) > 1e-5 ? normalize(flow) : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    vec2 q = vec2(dot(cuv, dir) * u_logicalGrid * 0.35, dot(cuv, nrm) * u_logicalGrid * 3.2);
    float n = fbm3(q + u_time * 0.03) - 0.5;
    float line = 1.0 - smoothstep(0.0, 0.055, abs(n));
    float edgeMask = (0.35 + 0.65 * smoothstep(0.08, 0.45, grad)) * smoothstep(0.04, 0.2, alpha);
    lace = line * edgeMask * u_macroLacing * focus;
    col = mix(col, col * 0.04, lace);
  }

  // ── Relief ──────────────────────────────────────────────────────
  // The surface normal is assembled from three scales: the bead's own dome
  // (from the solver-grid normal), the meniscus of every cell (analytic, from
  // each cell's radial slope) and grooves where the lacing cuts in. Lit, this
  // is what makes the frame read as a wet surface with depth instead of as
  // flat colour.
  if (u_macroRelief > 0.005) {
    float r3 = u_macroRelief;
    vec2 tilt = cellSlope * k * 1.6 + vec2(0.0, lace * 0.6);
    // The grid normal is a gentle slope over many sim cells; scaled up it
    // becomes the dome of the bead, which is what carries the large-scale
    // sense of volume under the cell detail.
    vec3 n = normalize(vec3(gridNormal.xy * 3.2 - tilt * r3, 1.0));

    vec3 L = lampDir(fuv, u_lamp);
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float diff = max(0.0, dot(n, L));
    float spec = pow(max(0.0, dot(n, H)), 46.0);
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    // Recessed cores and grooves sit in their own shadow.
    float ao = 1.0 - clamp(core * k * 0.55 + fineCore * k * 0.25 + lace * 0.4, 0.0, 1.0) * 0.45;

    // Centred on ~1.0 for a flat, lit surface, so relief shapes the frame
    // without darkening it overall.
    col *= mix(1.0, (0.55 + 0.9 * diff) * ao, r3 * paint);
    col += vec3(1.0, 0.97, 0.90) * spec * r3 * paint * 0.7;    // wet highlight on the domes
    col += col * fres * r3 * paint * 0.35;                     // bright refracting edge
  }

  // ── Dome shading — thickness across the bead as a whole ─────────
  if (u_macroDepth > 0.005) {
    float belly = smoothstep(0.05, 0.45, alpha);
    col *= mix(1.0, 0.74 + 0.42 * belly, u_macroDepth * 0.8);
  }

  // Ink pooled in a cell core is opaque — let it read as true black rather
  // than as the lit ground showing through.
  float aOut = clamp(alpha + clamp(core * k, 0.0, 1.0) * 0.5 * paint, 0.0, 1.0);
  return vec4(col, aOut);
}

// Blend mode functions
vec3 blendScreen(vec3 a, vec3 b)      { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 blendLighter(vec3 a, vec3 b)     { return max(a, b); }
vec3 blendExclusion(vec3 a, vec3 b)   { return a + b - 2.0 * a * b; }
vec3 blendMultiply(vec3 a, vec3 b)    { return a * b; }
vec3 blendOverlay(vec3 a, vec3 b) {
  return mix(2.0 * a * b, 1.0 - 2.0 * (1.0 - a) * (1.0 - b), step(0.5, b));
}

vec3 applyBlend(vec3 dst, vec3 src, int mode) {
  if (mode == 0) return blendScreen(dst, src);
  if (mode == 1) return blendLighter(dst, src);
  if (mode == 2) return blendExclusion(dst, src);
  if (mode == 3) return blendMultiply(dst, src);
  if (mode == 4) return blendOverlay(dst, src);
  return blendScreen(dst, src);
}

// LED platform analytical conic gradient
vec3 ledColor(float t) {
  // ledMode: 0=single, 1=ocean, 2=fire, 3=cyberpunk, 4=rainbow
  if (u_ledMode == 0) {
    return u_ledColor;
  } else if (u_ledMode == 1) {
    // ocean
    if (t < 0.25) return mix(vec3(0.0,0.0,0.2), vec3(0.0,0.2,0.4), t * 4.0);
    if (t < 0.5)  return mix(vec3(0.0,0.2,0.4), vec3(0.0,0.4,0.6), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(0.0,0.4,0.6), vec3(0.0,0.6,0.8), (t - 0.5) * 4.0);
    return mix(vec3(0.0,0.6,0.8), vec3(0.0,0.0,0.2), (t - 0.75) * 4.0);
  } else if (u_ledMode == 2) {
    // fire
    if (t < 0.25) return mix(vec3(0.2,0.0,0.0), vec3(0.8,0.0,0.0), t * 4.0);
    if (t < 0.5)  return mix(vec3(0.8,0.0,0.0), vec3(1.0,0.4,0.0), (t - 0.25) * 4.0);
    if (t < 0.75) return mix(vec3(1.0,0.4,0.0), vec3(1.0,0.8,0.0), (t - 0.5) * 4.0);
    return mix(vec3(1.0,0.8,0.0), vec3(0.2,0.0,0.0), (t - 0.75) * 4.0);
  } else if (u_ledMode == 3) {
    // cyberpunk
    if (t < 0.33) return mix(vec3(1.0,0.0,0.235), vec3(0.0,0.94,1.0), t / 0.33);
    if (t < 0.66) return mix(vec3(0.0,0.94,1.0), vec3(0.988,0.933,0.039), (t - 0.33) / 0.33);
    return mix(vec3(0.988,0.933,0.039), vec3(1.0,0.0,0.235), (t - 0.66) / 0.34);
  } else {
    // rainbow
    if (t < 0.16667) return mix(vec3(1,0,0), vec3(1,1,0), t * 6.0);
    if (t < 0.33333) return mix(vec3(1,1,0), vec3(0,1,0), (t - 0.16667) * 6.0);
    if (t < 0.5)     return mix(vec3(0,1,0), vec3(0,1,1), (t - 0.33333) * 6.0);
    if (t < 0.66667) return mix(vec3(0,1,1), vec3(0,0,1), (t - 0.5) * 6.0);
    if (t < 0.83333) return mix(vec3(0,0,1), vec3(1,0,1), (t - 0.66667) * 6.0);
    return mix(vec3(1,0,1), vec3(1,0,0), (t - 0.83333) * 6.0);
  }
}

#ifdef DERIVE_PASS
/*
  The derive pass: run once per plate per frame at the plate's own resolution,
  before the display.

  The display lights every pixel from the plate around it — a Sobel over three
  solver cells for the normal, four decodes a cell apart for the interface
  line — and did that reconstruction for every screen pixel: sixty-five
  texture reads a pixel a plate, the most expensive thing in the frame on a
  Retina screen. Both are smooth on the scale of whole solver cells, and a
  Retina frame has dozens of pixels to every texel, so they are worked out here
  once per texel and the display interpolates them with the same Catmull-Rom
  it reads the plate with. The functions are the display's own, compiled from
  the same source, so what is worked out is what the display worked out.
*/
uniform sampler2D u_src;
void main() {
  vec2 g = sobelGrad(u_src, v_uv);
  float diff = u_boundaryContrast > 0.005 ? boundaryDiff(u_src, v_uv) : 0.0;
  fragColor = vec4(g, diff, 0.0);
}
#else
void main() {
  vec2 uv = v_uv;
  bool darkBlend = u_darkBlend != 0;

  // ── Macro closeup setup ───────────────────────────────────────────
  // Defocus grows away from the frame centre — the shallow depth of field a
  // real macro lens has wide open, and what sells the magnification.
  /*
    How far into the closeup we are, 0 at the plate and 1 once the camera is
    properly in. It used to be a bool, and the difference is the whole of why
    the closeup arrived as a cut: the exposure, the depth of field, the
    silhouette warp and the ground relief all switched on together in one
    frame. Each of them is now mixed in over the travel.

    The bool survives only for the branches that pick *which*
    geometry to sample — the dish framing against the magnified one — where
    there is nothing to mix between. It flips early, at a tenth of the way in,
    because the dish is barely on screen by then anyway.
  */
  float macroAmt = clamp(u_macro, 0.0, 1.0);
  bool macro = macroAmt > 0.1;
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 uvScreen = uv;   // the unfolded frame, for the dish
  // ── Kaleidoscope ─────────────────────────────────────────────────
  // The plate mirrored into wedges — the four-fold dish of the stills, a
  // mirror rig in front of the lens. Fold the angle around the centre so
  // every wedge shows the same piece of plate, seams meeting edge to edge.
  if (u_kaleido >= 2.0) {
    vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
    float ang = atan(c.y, c.x);
    float rad = length(c);
    float wedge = 6.28318530718 / u_kaleido;
    float a = mod(ang, wedge);
    if (a > wedge * 0.5) a = wedge - a;              // mirror inside the wedge
    /*
      The rig's angle arrives already accumulated.

      It used to be u_time * 0.02, which is fine for a constant and wrong
      for a control: changing a rate that multiplies elapsed time moves the
      whole history, so every nudge of the speed jumped the pattern to a
      new angle. The phase is integrated on the CPU instead, from the frame's
      own dt, so the rig speeds up, slows, stops and reverses from
      wherever it happens to be standing.
    */
    a += u_kaleidoPhase;
    c = vec2(cos(a), sin(a)) * rad * u_kaleidoZoom;
    uv = clamp(c / vec2(aspect, 1.0) + 0.5, 0.001, 0.999);
  }
  float dof = 0.0;
  if (macro) {
    float rad = length((uv - 0.5) * vec2(aspect, 1.0));
    // Scaled by how far in we are: a lens opens up as it comes in, so the
    // defocus arrives with the magnification rather than ahead of it.
    dof = clamp((rad - 0.30) * 1.6, 0.0, 1.0) * u_macroDepth * macroAmt;
  }

  // ── LED Platform background ────────────────────────────────────────
  vec3 bgColor = darkBlend ? vec3(1.0) : vec3(0.0);
  // The photographs are all taken over a lit backdrop — coloured paper under
  // a dish of water — never over black. Two colours across the frame, a
  // little cloud in the join, and the tooth of the paper.
  if (u_photo > 0.5) {
    vec2 pp = uv * vec2(aspect, 1.0);
    float g = smoothstep(-0.15, 1.15, uv.x * 0.55 + uv.y * 0.65 + (fbm3(pp * 2.2 + 3.1) - 0.5) * 0.5 - 0.1);
    bgColor = mix(u_paperA, u_paperB, g) * (0.82 + 0.08 * fbm3(pp * 60.0));   // headroom left for the bloom
  }
  vec2 auxN = vec2(0.0);
  float auxH = 0.0;
  float auxB = 0.0;
  if (u_ledPlatform != 0) {
    vec2 centered = (uv - 0.5) * u_resolution;
    float t = fract(atan(centered.y, centered.x) / (2.0 * PI) + 0.5 + u_ledAngle);
    vec3 lc = ledColor(t);
    // Radial vignette for bevel effect
    float dist = length(centered);
    float maxR = max(u_resolution.x, u_resolution.y) * 0.8;
    float bevel = 1.0 - smoothstep(maxR * 0.5, maxR, dist) * 0.8;
    bgColor = lc * bevel;
  }

  // ── Gel wheel ────────────────────────────────────────────────────
  // Four gels turning over the lamp: each quadrant of the ground takes a
  // colour, with a soft join where one gel gives way to the next.
  if (u_gelWheel > 0.001) {
    vec2 gc = (uv - 0.5) * vec2(aspect, 1.0);
    float ga = fract(atan(gc.y, gc.x) / (2.0 * PI) + u_gelAngle);
    float seg = ga * 4.0;
    int gi = int(floor(seg));
    float gf = fract(seg);
    vec3 g0 = gi == 0 ? u_gel0 : gi == 1 ? u_gel1 : gi == 2 ? u_gel2 : u_gel3;
    vec3 g1 = gi == 0 ? u_gel1 : gi == 1 ? u_gel2 : gi == 2 ? u_gel3 : u_gel0;
    vec3 gel = mix(g0, g1, smoothstep(0.86, 1.0, gf));
    bgColor = mix(bgColor, max(bgColor, vec3(0.10)) * gel * 1.5, u_gelWheel);
  }

  // ── Lumia ────────────────────────────────────────────────────────
  // Wilfred's aurora: a slow, folded height field read as sheets of light,
  // two colours drifting through each other on a scale of minutes.
  if (u_lumia > 0.001) {
    vec2 lp = uv * vec2(aspect, 1.0) * 1.35;
    float lt = u_time * 0.035;
    float h = fbm3(lp + vec2(lt * 0.7, -lt * 0.4)) * 0.6 + fbm3(lp * 2.1 - vec2(lt * 0.3, lt * 0.5)) * 0.4;
    float sheet = pow(abs(sin(h * 9.42 + lt)), 3.0);
    float veil = 0.25 + 0.75 * fbm3(lp * 0.6 + vec2(lt * 0.2, lt * 0.15));
    vec3 lcol = mix(u_lumiaA, u_lumiaB, smoothstep(0.25, 0.75, fbm3(lp * 0.7 + lt)));
    bgColor += lcol * (0.12 + 0.9 * sheet) * veil * u_lumia;
  }

  // ── Gooey blur parameters ─────────────────────────────────────────
  // u_postBlur scales the legacy gooey blur; defaults well below 1.0 so
  // fine turbulent structure survives to the screen.
  float fluidScale = max(u_resolution.x, u_resolution.y) * 1.5 / 128.0;
  float blurFluid = u_gooey * u_postBlur * 10.0 / (fluidScale * 128.0);
  bool useBlur = u_gooey * u_postBlur > 0.01;

  // ── Layer 0 ──────────────────────────────────────────────────────
  float c0 = cos(-u_rotation0), s0 = sin(-u_rotation0);
  vec2 fuv0 = uvToFluid(uv, c0, s0);
  if (u_dishSpread > 0.001 && !macro) fuv0 = dishToPlate(uvScreen, 0, aspect, c0, s0);
  vec2 fuvBase = fuv0;   // the plate before any macro warp: where bubbles live
  vec2 flow0 = macro ? fluidFlow(u_vel0, fuv0) * macroAmt : vec2(0.0);
  if (macro) fuv0 = macroWarp(fuv0);
  vec4 fluid0 = decodeFluidDof(u_layer0, fuv0, blurFluid, useBlur, dof);
  vec2 dish0 = vec2(1.0, 0.0), dish1 = vec2(1.0, 0.0);
  if (u_dishSpread > 0.001 && !macro) {
    dish0 = layerDish(uvScreen, 0, u_resolution.x / u_resolution.y);
    fluid0.a *= dish0.x;
  }

  // Pigment separates into a speckle; it rides on the thickness, so the colour
  // and the lighting follow it rather than it being painted over the top.
  if (u_granulation > 0.002 && fluid0.a > 0.004) {
    fluid0.a = max(0.0, fluid0.a * (1.0 + u_granulation * pigmentGrain(u_grain0, fuv0) * 1.6));
  }

  // Gooey contrast on alpha
  if (useBlur && fluid0.a > 0.0) {
    float contrast = 1.2 + u_gooey * 4.0;
    float mid = 0.5;
    fluid0.a = clamp((fluid0.a - mid) * contrast + mid, 0.0, 1.0);
  }

  // Lighting — a heavily defocused pixel has no edge detail worth resolving,
  // so skip the 8-tap normal and the interface pass out there.
  bool sharp0 = dof < 0.55;
  // The normal and the interface line are both read from the plate around the
  // pixel, and the derive pass has already worked them out once per texel: one
  // interpolated read here instead of thirteen reconstructions of the plate.
  vec4 near0 = sharp0 && u_derivedOn > 0.5 ? bicubicSigned(u_derived0, fuv0) : vec4(0.0);
  vec3 normal0 = !sharp0 ? vec3(0.0, 0.0, 1.0) : u_derivedOn > 0.5 ? gradNormal(near0.xy) : sobelNormal(u_layer0, fuv0);
  fluid0.rgb = applyLighting(fluid0.rgb, normal0, darkBlend, fuv0);
  if (darkBlend) fluid0.a *= 0.6;

  // Bright interface line where dye colors meet
  if (u_boundaryContrast > 0.005 && fluid0.a > 0.03 && sharp0) {
    float edge0 = u_derivedOn > 0.5 ? boundaryLine(near0.z) : boundaryEdge(u_layer0, fuv0);
    fluid0.rgb += fluid0.rgb * edge0 * u_boundaryContrast * 1.6 + vec3(edge0 * u_boundaryContrast * 0.25);
  }
  if (u_lacing > 0.005 && fluid0.a > 0.02 && sharp0) fluid0.rgb = lacing(fluid0.rgb, u_layer0, fuv0, fluid0.a, u_lacing);
  if (!macro && u_edgeRelief > 0.005 && sharp0) fluid0.rgb = meniscus(fluid0.rgb, normal0, fluid0.a, fuv0);
  // ── Plate cells ───────────────────────────────────────────────
  // The fine network in the dish core of the Fillmore stills: cells the
  // size of a few grid cells, carried by the dye, dark-edged, strongest in
  // the thick dye and toward the lead dish's centre.
  if (!macro && u_cells > 0.005 && fluid0.a > 0.03) {
    float cfreq = u_logicalGrid / 3.2;
    vec2 cflow = fluidFlow(u_vel0, fuv0) * cfreq;
    Cell cg0 = cellField(fuv0 * cfreq, cflow, 0.0, 3.2, 0.0, 0.13);
    Cell cg1 = cellField(fuv0 * cfreq, cflow, 17.0, 3.2, 0.5, 0.13);
    float ccore = max(cg0.core, cg1.core);
    float crim = abs(cg0.rim) > abs(cg1.rim) ? cg0.rim : cg1.rim;
    float centreW = 1.0;
    if (u_dishSpread > 0.001) {
      float casp = u_resolution.x / u_resolution.y;
      vec2 cc = vec2(0.5 + 0.144 * u_dishSpread / casp, 0.5 - 0.02 * u_dishSpread);
      centreW = 1.0 - smoothstep(0.25, 0.7, length((uvScreen - cc) * vec2(casp, 1.0)) / (0.5 * mix(0.98, 0.66, u_dishSpread)));
    }
    float kc = u_cells * smoothstep(0.03, 0.35, fluid0.a) * centreW;
    fluid0.rgb *= 1.0 - max(0.0, -crim) * 0.7 * kc;
    fluid0.rgb *= 1.0 + max(0.0, crim) * 0.35 * kc;
    fluid0.rgb = mix(fluid0.rgb, fluid0.rgb * 1.1 + vec3(0.02), ccore * kc * 0.4);
  }

  if (macro) {
    float grad0 = clamp((1.0 - normal0.z) * 5.0, 0.0, 1.0);
    fluid0 = macroDetail(fluid0.rgb, fluid0.a, fuv0, flow0, normal0, grad0, dof);
  }

  // ── Substrate grain + contact shadow ──────────────────────────────
  // Magnified, the ground under the dye should read as a surface, and the dye
  // should sit *on* it rather than float in front of it.
  if (macro && u_macroDepth * macroAmt > 0.005) {
    float depth = u_macroDepth * macroAmt;
    float fiber = fbm3(uv * vec2(aspect, 1.0) * 230.0);
    bgColor = mix(bgColor, bgColor * (0.82 + 0.36 * fiber) + fiber * 0.02 * depth, macroAmt);
    // Two offsets — a contact shadow tight to the bead and a softer, wider
    // one behind it. The gap between them is what lifts the paint off the
    // ground instead of leaving it pasted flat onto it.
    float shA = 1.0 - exp(-decodeDensity(textureBicubic(u_layer0, uvToFluid(uv + vec2(0.008, -0.008), c0, s0)).a) * 2.6);
    float shB = 1.0 - exp(-decodeDensity(textureBicubic(u_layer0, uvToFluid(uv + vec2(0.022, -0.022), c0, s0)).a) * 1.6);
    float shadow = clamp(shA * 0.65 + shB * 0.5, 0.0, 1.0);
    bgColor *= mix(1.0, 0.18, shadow * depth);
  }

  vec3 outColor = bgColor;
  if (u_photo > 0.5) {
    // Dye as transmission: the paper seen through it, tinted, and the drop
    // itself a dome — a dark meniscus deeper on the side away from the lamp,
    // a thicker middle that absorbs more, the softbox reflected as a bright
    // crescent on the lamp side, and a rim that catches the sky.
    float a = fluid0.a;
    // Transmission proper: the paper times the dye's transmittance. A thin
    // wash therefore vanishes into the paper instead of reading as a pale
    // speck; only a real drop shows, and a little lift keeps it from mud.
    // Dyes in transmission mix subtractively — two of them together go
    // darker, not paler — so the thick middle of a mixed drop deepens.
    vec3 tr = pow(fluid0.rgb, vec3(1.0 + 0.9 * a));
    float trl = dot(tr, vec3(0.299, 0.587, 0.114));
    tr = clamp(mix(vec3(trl), tr, 1.3), 0.0, 1.0);
    vec3 lit = tr * mix(outColor, vec3(1.0), 0.22 * smoothstep(0.1, 0.6, a)) * (1.0 + 0.2 * a);
    outColor = mix(outColor, lit, a);
    vec3 n = normal0;
    vec3 S = lampDir(fuv0, u_lamp);
    vec2 R = 2.0 * n.z * n.xy;
    float sb = smoothstep(0.42, 0.12, abs(R.x - S.x * 0.6)) * smoothstep(0.26, 0.06, abs(R.y - S.y * 0.6));
    float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    float rimDark = clamp((1.0 - n.z) * 5.0, 0.0, 1.0);
    float facing = clamp(dot(n.xy, S.xy) * 3.0, -1.0, 1.0);
    outColor *= 1.0 - rimDark * a * (0.35 + 0.3 * max(0.0, -facing));
    outColor *= 1.0 - a * a * 0.22;
    outColor += vec3(1.0, 0.98, 0.95) * sb * a * (0.35 + 0.6 * fres);
    outColor += vec3(0.95, 0.97, 1.0) * fres * a * 0.18;
  } else {
    outColor = mix(outColor, fluid0.rgb, fluid0.a);
  }
  auxN = -normal0.xy * fluid0.a;
  auxH = fluid0.a;
  // Where the dye runs thinnest it is a film, and a film has colours of its
  // own: interference bands that follow the thickness.
  if (u_thinFilm > 0.001 && fluid0.a > 0.004 && fluid0.a < 0.4) {
    float thin = smoothstep(0.4, 0.04, fluid0.a) * smoothstep(0.004, 0.03, fluid0.a);
    vec3 film = thinFilm(fluid0.a * 16.0 + fbm3(fuv0 * 26.0) * 1.4 + u_time * 0.02);
    outColor = mix(outColor, outColor * (0.5 + 1.3 * film) + film * 0.08, thin * u_thinFilm * 0.85);
  }

  // ── Layer 1 (if present) ──────────────────────────────────────────
  if (u_layerCount > 1) {
    float c1 = cos(-u_rotation1), s1 = sin(-u_rotation1);
    vec2 fuv1 = uvToFluid(uv, c1, s1);
    if (u_dishSpread > 0.001 && !macro) fuv1 = dishToPlate(uvScreen, 1, aspect, c1, s1);
    // A second projector at a different throw: the layer is viewed magnified
    // about the centre and drifts slowly, so one frame carries two scales.
    if (!macro && u_layerZoom1 > 1.001) fuv1 = (fuv1 - 0.5) / u_layerZoom1 + 0.5 + u_layerDrift1;
    vec2 flow1 = macro ? fluidFlow(u_vel1, fuv1) * macroAmt : vec2(0.0);
    if (macro) fuv1 = macroWarp(fuv1);
    vec4 fluid1 = decodeFluidDof(u_layer1, fuv1, blurFluid, useBlur, dof);
    if (u_dishSpread > 0.001 && !macro) {
      dish1 = layerDish(uvScreen, 1, u_resolution.x / u_resolution.y);
      fluid1.a *= dish1.x;
    }

    if (u_granulation > 0.002 && fluid1.a > 0.004) {
      fluid1.a = max(0.0, fluid1.a * (1.0 + u_granulation * pigmentGrain(u_grain1, fuv1) * 1.6));
    }

    if (useBlur && fluid1.a > 0.0) {
      float contrast = 1.2 + u_gooey * 4.0;
      float mid = 0.5;
      fluid1.a = clamp((fluid1.a - mid) * contrast + mid, 0.0, 1.0);
    }

    bool sharp1 = dof < 0.55;
    // The normal and the interface line, from the derive pass.
    vec4 near1 = sharp1 && u_derivedOn > 0.5 ? bicubicSigned(u_derived1, fuv1) : vec4(0.0);
    vec3 normal1 = !sharp1 ? vec3(0.0, 0.0, 1.0) : u_derivedOn > 0.5 ? gradNormal(near1.xy) : sobelNormal(u_layer1, fuv1);
    fluid1.rgb = applyLighting(fluid1.rgb, normal1, darkBlend, fuv1);
    if (darkBlend) fluid1.a *= 0.6;

    if (u_boundaryContrast > 0.005 && fluid1.a > 0.03 && sharp1) {
      float edge1 = u_derivedOn > 0.5 ? boundaryLine(near1.z) : boundaryEdge(u_layer1, fuv1);
      fluid1.rgb += fluid1.rgb * edge1 * u_boundaryContrast * 1.6 + vec3(edge1 * u_boundaryContrast * 0.25);
    }
    if (u_lacing > 0.005 && fluid1.a > 0.02 && sharp1) fluid1.rgb = lacing(fluid1.rgb, u_layer1, fuv1, fluid1.a, u_lacing);
    if (!macro && u_edgeRelief > 0.005 && sharp1) fluid1.rgb = meniscus(fluid1.rgb, normal1, fluid1.a, fuv1);

    if (macro) {
      float grad1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      fluid1 = macroDetail(fluid1.rgb, fluid1.a, fuv1, flow1, normal1, grad1, dof);
    }

    if (u_photo > 0.5) {
      vec3 lit1 = pow(fluid1.rgb, vec3(1.0 + 0.9 * fluid1.a)) * mix(outColor, vec3(1.0), 0.22 * smoothstep(0.1, 0.6, fluid1.a)) * (1.0 + 0.2 * fluid1.a);
      outColor = mix(outColor, lit1, fluid1.a);
      float rim1 = clamp((1.0 - normal1.z) * 5.0, 0.0, 1.0);
      outColor *= 1.0 - rim1 * fluid1.a * 0.4;
      outColor += vec3(0.95, 0.97, 1.0) * pow(1.0 - clamp(normal1.z, 0.0, 1.0), 3.0) * fluid1.a * 0.15;
    } else {
      vec3 blended = applyBlend(outColor, fluid1.rgb, u_blendMode);
      outColor = mix(outColor, blended, fluid1.a);
    }
    auxN = mix(auxN, -normal1.xy, fluid1.a * 0.5);
    auxH = max(auxH, fluid1.a);
  }

  // ── The lamp's hot-spot ──────────────────────────────────────────
  // A projector is not an even backlight: the plate is brightest over the
  // lamp and falls away toward the rim, and where the lamp sits wanders as
  // the plate rocks. A second lamp puts a cooler pool on the other side.
  if (u_lamp.w > 0.001) {
    float dl = length(fuvBase - u_lamp.xy);
    float glow = exp(-dl * dl * 3.5);
    vec3 pool = mix(vec3(1.0), vec3(1.05, 0.98, 0.9), glow * 0.5) * mix(0.78, 1.25, glow);
    outColor *= mix(vec3(1.0), pool, u_lamp.w);
    if (u_lamp2.w > 0.001) {
      float d2 = length(fuvBase - u_lamp2.xy);
      float glow2 = exp(-d2 * d2 * 3.5);
      outColor *= mix(vec3(1.0), mix(vec3(1.0), vec3(0.9, 0.97, 1.12) * 1.25, glow2), u_lamp2.w * u_lamp.w);
    }
  }

  // ── Satellite droplets ───────────────────────────────────────────
  // Two sizes of them, more where the dye is, a few on the bare glass.
  if (u_droplets > 0.001 && !macro) {
    vec3 Ld = lampDir(fuvBase, u_lamp);
    vec2 sideD = Ld.xy / max(length(Ld.xy), 0.06);
    float groundD = dot(outColor, vec3(0.299, 0.587, 0.114));
    float keep = u_droplets * (0.18 + 0.32 * fluid0.a);
    vec3 dropped = microDrops(outColor, fuvBase * u_logicalGrid * 0.55 + 17.0, sideD, groundD, keep);
    dropped = microDrops(dropped, fuvBase * u_logicalGrid * 1.1 + 5.0, sideD, groundD, keep * 0.6);
    outColor = mix(outColor, dropped, min(1.0, u_droplets * 1.5));
  }

  // ── Bubbles ──────────────────────────────────────────────────────
  // One implicit surface for all of them: each bubble contributes a field
  // that falls off with distance in its own stretched, wobbling frame, and
  // the membrane is drawn where the sum crosses one. Two bubbles pulling
  // together therefore neck into each other rather than overlap as circles;
  // the membrane is a thin dark line with a bright refracted edge inside it.
  if (u_bubbleCount > 0 && u_bubbleStrength > 0.001) {
    float field = 0.0;
    float opac = 0.0;
    float best = 0.0;
    float bestRad = 0.01;
    vec2 bestD = vec2(0.0);
    for (int i = 0; i < 40; i++) {
      if (i >= u_bubbleCount) break;
      vec4 bb = u_bubbles[i];
      vec4 sh = u_bubbleShape[i];
      float rad = max(bb.z, 1e-4);
      vec2 d = (fuvBase - bb.xy) / rad;
      if (dot(d, d) > 4.0) continue;
      // Stretch: an ellipse along the drag axis, area-preserving.
      float s = length(sh.xy);
      if (s > 1e-4) {
        vec2 ax = sh.xy / s;
        vec2 loc = vec2(dot(d, ax), dot(d, vec2(-ax.y, ax.x)));
        d = vec2(loc.x / (1.0 + s), loc.y * (1.0 + s));
      }
      // Wobble: second and third shape modes running around the rim.
      float phi = atan(d.y, d.x);
      float rEff = 1.0 + sh.z * (cos(2.0 * phi + sh.w) + 0.55 * cos(3.0 * phi - 1.7 * sh.w));
      float q2 = dot(d, d) / max(rEff * rEff, 0.04);
      float f = 1.0 / max(q2, 1e-4);
      f = f * f;                               // steeper falloff: necks form only when close
      field += f * bb.w;
      opac = max(opac, bb.w * smoothstep(0.25, 1.0, f));
      if (f > best) { best = f; bestD = d; bestRad = rad; }
    }
    if (field > 0.2) {
      // field == 1 on the membrane, larger inside.
      // In every reference the bubble is a lens over the lamp: a bright
      // centre, a thin darker edge that is the dye seen edge-on, and a
      // small highlight. Nothing is drawn as a black line. And the lens is
      // lit from wherever the lamp is: the rim toward the lamp darkens as
      // the light is bent away, the far rim carries the bright caustic arc,
      // the highlight sits on the lamp side of the dome, and the interior
      // shows the plate behind it magnified — so a field of bubbles reads
      // as one light falling across them, not forty stamps.
      float edge = field;
      float membrane = smoothstep(0.86, 1.0, edge) * (1.0 - smoothstep(1.0, 1.22, edge));
      float inside = smoothstep(1.0, 1.3, edge);
      float centre = smoothstep(1.3, 3.0, edge);
      float play = u_lightPlay;
      vec3 Lb = lampDir(fuvBase, u_lamp);
      vec2 lampSide = Lb.xy / max(length(Lb.xy), 0.06);   // unit toward the lamp; shrinks to nothing straight under it
      vec2 nd = normalize(bestD + vec2(1e-5));
      float toward = dot(nd, lampSide);
      float ground = dot(outColor, vec3(0.299, 0.587, 0.114));
      float rimK = mix(0.18, 0.42, smoothstep(0.08, 0.5, ground));
      vec3 c = outColor;
      // ── What colour is the light a bubble adds? ──
      // It used to be white, and a little of it blue from the second lamp,
      // which is why a bubble read as a grey sticker rather than as part of
      // the liquid: a neutral highlight on a red plate is a hue shift, and
      // measured over ten bubbles it was 44° on average and 134° at worst.
      //
      // Physically almost none of that light is the lamp seen directly. It
      // is the lamp *through* the dye film that wraps the dome and lies
      // under it, so it carries the dye's own colour. The tint below is the
      // ground's hue at unit brightness, taking over as the film thickens; over
      // bare glass there is nothing to tint it and it stays neutral, which is
      // also what a real bubble on clean glass looks like.
      float filmT = smoothstep(0.02, 0.28, fluid0.a);
      vec3 tint = mix(vec3(1.0), outColor / max(max(outColor.r, max(outColor.g, outColor.b)), 1e-3), filmT);
      // The lens: the plate behind, pulled in toward the bubble's centre.
      vec2 lensUv = fuvBase - bestD * bestRad * (0.15 + 0.35 * play);
      vec4 lensF = decodeFluid(u_layer0, lensUv, 0.0, false);
      vec3 lensCol = mix(bgColor, lensF.rgb, lensF.a);
      c = mix(c, lensCol, inside * 0.45 * play);
      c = mix(c, c * 1.18 + tint * 0.06, inside * 0.55 + centre * 0.3);   // the lamp through the lens
      // Shaded as a lens: dimmer toward the lamp, brighter away from it.
      c *= 1.0 - 0.3 * play * max(0.0, toward) * inside + 0.2 * play * max(0.0, -toward) * inside;
      float arcBand = smoothstep(0.78, 1.0, edge) * (1.0 - smoothstep(1.0, 1.4, edge));
      c += (c * 0.9 + tint * 0.16) * arcBand * max(0.0, -toward) * 0.9 * play;   // the caustic arc
      // A little of the plate around the far side sits in the bubble's shadow.
      float halo = smoothstep(0.3, 0.7, edge) * (1.0 - smoothstep(0.7, 0.92, edge));
      c *= 1.0 - halo * max(0.0, -toward) * 0.22 * play;
      c = mix(c, c * c * 1.1, membrane * (rimK + 0.35 * max(0.0, toward) * play));  // the edge, darkest toward the lamp
      // Thin-film colour running round the rim, brighter over bright ground.
      if (u_iridescence > 0.001) {
        vec3 film = thinFilm(edge * 2.2 + atan(bestD.y, bestD.x) * 0.5 + u_time * 0.05);
        c = mix(c, c * (0.55 + 1.2 * film), membrane * u_iridescence * 0.7 * (0.35 + 0.65 * ground));
      }
      // The lamp's own reflection: a small spot on the lamp side of the dome.
      vec2 hd = bestD - lampSide * 0.36;
      float hl = exp(-dot(hd, hd) * 26.0) * inside;
      c += mix(vec3(1.0, 0.98, 0.92), tint, 0.65 * filmT) * hl * (0.18 + 0.24 * ground);
      if (u_lamp2.w > 0.001) {
        vec3 L2 = lampDir(fuvBase, u_lamp2);
        vec2 side2 = L2.xy / max(length(L2.xy), 0.06);
        float toward2 = dot(nd, side2);
        c += tint * vec3(0.72, 0.86, 1.0) * (0.12 + ground * 0.38) * arcBand * max(0.0, -toward2) * play * u_lamp2.w;
        vec2 hd2 = bestD - side2 * 0.36;
        c += mix(vec3(0.75, 0.86, 1.0), tint, 0.6 * filmT) * exp(-dot(hd2, hd2) * 26.0) * inside * 0.22 * u_lamp2.w;
      }
      outColor = mix(outColor, c, opac * u_bubbleStrength * mix(0.6, 1.0, filmT));
      auxN = mix(auxN, -bestD * 0.8, opac * inside);
      auxB = max(auxB, opac * inside);
    }
  }

  // ── Oil beads ────────────────────────────────────────────────────
  // Hundreds of small immiscible beads: a dark meniscus ring, the ground
  // showing through inside with a little of the lamp on it.
  if (u_beads > 0.001 && !macro) {
    vec4 bm = texture(u_beadTex, fuvBase);
    float inner = bm.r, ring = bm.g, ramp = bm.b;
    // Beads sit in the dye: on bare glass there is nothing to rim.
    float inDye = smoothstep(0.015, 0.2, auxH);
    float k = u_beads * inDye;
    // A dark meniscus ring, an interior that is a small dome: darker toward
    // the rim, a little lighter in the middle, and the lamp caught on the
    // side facing it (the dome's slope from the ramp's gradient).
    vec2 slope = vec2(dFdx(ramp), dFdy(ramp));
    float sl = length(slope);
    vec3 Lb = lampDir(fuvBase, u_lamp);
    vec2 lampS = Lb.xy / max(length(Lb.xy), 0.06);
    float facing = sl > 1e-5 ? dot(slope / sl, lampS) : 0.0;
    float dome = 0.78 + 0.32 * ramp;
    float catchL = max(0.0, facing) * (1.0 - ramp) * smoothstep(0.0, 0.5, ramp) * 0.5;
    outColor *= 1.0 - ring * 0.7 * k;
    outColor = mix(outColor, outColor * dome + vec3(0.9, 0.85, 0.75) * catchL * 0.35, inner * (1.0 - ring) * k);
    auxB = max(auxB, inner * 0.4 * k);
  }

  // ── The projectors' rims ─────────────────────────────────────────
  // Beyond every dish the screen is black; each rim catches the lamp.
  if (u_dishSpread > 0.001 && !macro) {
    float anyIn = max(dish0.x, u_layerCount > 1 ? dish1.x : 0.0);
    outColor *= mix(1.0, anyIn, u_dishSpread);
    float rims = dish0.y + (u_layerCount > 1 ? dish1.y : 0.0);
    outColor += vec3(0.95, 0.8, 0.55) * rims * 0.16 * u_dishSpread;
  }

  // ── Film projector ───────────────────────────────────────────────
  // A loop or the camera projected through the dye: keyed on its own
  // brightness, refracted by the dye's surface and tinted where the dye is.
  if (u_filmOn != 0 && u_filmMix > 0.001) {
    vec2 fuvF = (uv - 0.5) * u_filmScale + 0.5 + normal0.xy * 0.03 * fluid0.a;
    vec3 film = texture(u_film, vec2(fuvF.x, 1.0 - fuvF.y)).rgb;
    float fl = dot(film, vec3(0.299, 0.587, 0.114));
    float key = smoothstep(u_filmKey, u_filmKey + 0.18, fl);
    vec3 tinted = film * mix(vec3(1.0), fluid0.rgb * 1.5, fluid0.a * 0.8);
    outColor = mix(outColor, outColor * 0.35 + tinted * 0.95, key * u_filmMix);
  }

  // ── Lamp warmth ──────────────────────────────────────────────────
  // A halogen lamp through a sealed wheel: warm, and darker toward the rim.
  if (u_lampWarmth > 0.001) {
    vec2 vc = (uv - 0.5) * vec2(aspect, 1.0);
    float vig = 1.0 - smoothstep(0.45, 1.05, length(vc) * 1.25) * 0.45;
    outColor = mix(outColor, outColor * vec3(1.06, 0.9, 0.7) * vig, u_lampWarmth);
  }

  // ── The dish ─────────────────────────────────────────────────────
  // A round clock face projected whole: black beyond the rim, and the rim
  // itself a thin bright line where the glass edge catches the lamp.
  if (u_dish > 0.001) {
    vec2 dc = (uvScreen - 0.5) * vec2(aspect, 1.0);
    float dr = length(dc) / 0.5;
    float rimR = mix(1.9, 0.98, u_dish);
    float inside = 1.0 - smoothstep(rimR - 0.015, rimR + 0.01, dr);
    float rim = smoothstep(rimR - 0.035, rimR - 0.01, dr) * (1.0 - smoothstep(rimR - 0.005, rimR + 0.012, dr));
    float shade = 1.0 - smoothstep(rimR * 0.55, rimR, dr) * 0.35 * u_dish;
    outColor = outColor * inside * shade + vec3(0.9, 0.85, 0.7) * rim * 0.35 * u_dish;
  }

  // ── Saturation grade ──────────────────────────────────────────────
  float luma = dot(outColor, vec3(0.299, 0.587, 0.114));
  outColor = clamp(mix(vec3(luma), outColor, u_saturation), 0.0, 1.0);

  // ── Film grain ────────────────────────────────────────────────────
  // Grain scaled by brightness — a fixed offset on near-black pixels is a grey
  // haze, which is exactly what washes the ink out.
  float grainLuma = dot(outColor, vec3(0.299, 0.587, 0.114));
  // ...and the dark frames stay black: grain fades out almost entirely
  // below the shadows, so a dim plate reads as depth rather than fog.
  float grain = (hash(v_uv * u_resolution + fract(u_time * 47.3)) - 0.5) * 0.03
              * (0.05 + 0.95 * smoothstep(0.03, 0.4, grainLuma));
  if (u_cameraOn == 0) outColor = clamp(outColor + grain, 0.0, 1.0);
  // The dimmer, the mark and the dither (FINISH_GLSL, in lib/postChain.ts):
  // here when this pass draws for the screen, in the post chain's finish when
  // an effect runs after it, which is why they are one shared function.
  fragColor = u_finishInMain == 1 ? finishFrame(outColor, uvScreen)
            : u_finishInMain == 2 ? ditherOut(outColor)
            : vec4(outColor, 1.0);
  auxOut = vec4(clamp(auxN, -1.0, 1.0) * 0.5 + 0.5, auxH, auxB);
}
#endif`;
