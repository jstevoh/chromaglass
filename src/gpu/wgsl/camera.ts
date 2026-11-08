/**
 * The camera in WGSL (docs/webgpu-plan.md, P3). It began as the twin of a
 * GLSL pass; the GLSL went with the WebGL renderer (P7) and the optics were
 * then rebuilt on the physics (PLAN.md 33i): a thin lens's blur circle, a
 * power-law scatter for the glow, dispersion by an Abbe number, a thin
 * prism's refraction. The comments at each stage say what it models and
 * which part is a stand-in.
 *
 * - Sampling is always `textureSampleLevel(t, samp, uv, 0.0)`: the gather and
 *   the glow sample inside per-pixel branches, where WGSL forbids the
 *   implicit derivatives `textureSample` needs.
 * - The uniforms are one buffer, `U`, generated from `cameraFields.ts`.
 * - `gl_FragCoord` is `U.resolution.y - pos.y`: WebGPU counts framebuffer
 *   rows down where GL counts them up, and the dither hashes that coordinate.
 */

import { CAMERA_STRUCT } from './cameraFields';

export const CAMERA_WGSL = /* wgsl */ `
${CAMERA_STRUCT}
@group(0) @binding(0) var<uniform> U: Camera;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var scene: texture_2d<f32>;   // the plate, drawn
@group(0) @binding(3) var aux: texture_2d<f32>;     // normal.xy (biased), height, bubble mask

fn tex2(t: texture_2d<f32>, uv: vec2f) -> vec4f { return textureSampleLevel(t, samp, uv, 0.0); }

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

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

const GOLDEN = 2.39996323;

/*
  The blur circle of a thin lens, in pixels, for a point at height h over the
  glass (aux.z, the dye's column) seen through a lens focused at U.focus.

  A point off the focal plane is spread over a disc whose diameter grows in
  proportion to the aperture and to how far the point is from the plane it is
  focused on: the thin-lens relation c = A * |z - zf| * f / (zf * (zf - f)),
  which is linear in |z - zf| for the few millimetres a plate's relief spans.
  So the constant here is the lens: with the aperture wide open (1) a point
  at the far end of the relief from the focal plane spreads over 5% of the
  frame's height, which is what a macro lens a hand's width from the plate
  does, and the reason a macro shot of oil on water has one sharp ring and
  everything else a cream. The second term is the field's curvature, a real
  lens's focal surface being a bowl rather than a plane, so the corners go
  soft first.
*/
fn cocPx(h: f32, rad: vec2f) -> f32 {
  return U.aperture * (abs(h - U.focus) * 0.05 + dot(rad, rad) * 0.012) * U.resolution.y;
}

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let uv = in.uv;
  let aspect = U.resolution.x / max(1.0, U.resolution.y);
  let ax = vec2f(1.0 / aspect, 1.0);            // an offset that is round on screen
  let rad = (uv - 0.5) * vec2f(aspect, 1.0);

  let a = tex2(aux, uv);
  let n = a.xy * 2.0 - 1.0;

  // ── Refraction ──────────────────────────────────────────────────
  // Light leaving a liquid surface tilted by a slope s is turned through
  // (n - 1) * s (a thin prism; Snell's law for small angles), and lands on
  // the wall that much times the throw further along. The plate's normal is
  // already the slope, scaled by how much liquid there is to have one, so it
  // is not multiplied by the height again: that second factor is what left
  // the knob moving the picture by a pixel or two. Here (n - 1) is 0.4,
  // oil and glycerine, and the throw a quarter of the frame's height, so
  // the steepest dome moves what is behind it by 4% of the height.
  let off = n * (0.4 * 0.25) * U.refraction * ax;

  // ── Dispersion ──────────────────────────────────────────────────
  // The prism turns blue further than red because n falls with wavelength;
  // the spread of the deviation is 1 / V of it, V the Abbe number. Real oils
  // sit near 50 and would be invisible, so the knob runs V down to 8, the
  // densest flints, and says so (PLAN.md 33i). The lens adds its own, a
  // lateral colour that grows with the distance from its axis.
  let disp = off * (U.chromatic * 0.06) + rad * ax * (U.chromatic * 0.012);
  let dR = -disp;
  let dB = disp;
  let fringe = U.chromatic > 0.001;

  // ── Depth of field ──────────────────────────────────────────────
  var col: vec3f;
  let c0 = cocPx(a.z, rad);
  if (U.aperture < 0.001) {
    if (fringe) {
      col = vec3f(tex2(scene, uv + off + dR).r, tex2(scene, uv + off).g, tex2(scene, uv + off + dB).b);
    } else {
      col = tex2(scene, uv + off).rgb;
    }
  } else {
    // Scatter as gather: every point of the plate spreads its light over its
    // own blur disc, so a pixel collects from the neighbours whose disc
    // reaches it, each weighted by one over its disc's area (a point's light
    // is shared out, not multiplied). A sharp ring over a blurred ground
    // stays sharp, and a blurred dome bleeds over a sharp ground, which a
    // blur sized by the pixel's own height cannot do. The radius searched is
    // the widest disc the setting allows, a constant, so the loop is the same
    // for every pixel.
    let rmax = U.aperture * (max(U.focus, 1.0 - U.focus) * 0.05 + 0.0125) * U.resolution.y;
    // The disc's rotation is turned by an interleaved gradient noise rather
    // than white noise: the leftover error of 64 taps then lies in diagonal
    // bands the eye reads as grain on the glass, where white noise reads as
    // speckle on every dye edge.
    let px = uv * U.resolution;
    let rot = fract(52.9829189 * fract(dot(px, vec2f(0.06711056, 0.00583715)))) * 6.2831853;
    var acc = vec3f(0.0);
    var wsum = 0.0;
    let w0 = 1.0 / max(c0 * c0, 1.0);
    if (fringe) {
      acc = vec3f(tex2(scene, uv + off + dR).r, tex2(scene, uv + off).g, tex2(scene, uv + off + dB).b) * w0;
    } else {
      acc = tex2(scene, uv + off).rgb * w0;
    }
    wsum = w0;
    for (var i = 0; i < 64; i++) {
      let fi = f32(i);
      let r = sqrt((fi + 0.5) / 64.0) * rmax;
      let ang = fi * GOLDEN + rot;
      let o = vec2f(cos(ang), sin(ang)) * r / U.resolution;
      let uvt = uv + o;
      let radt = (uvt - 0.5) * vec2f(aspect, 1.0);
      let ct = cocPx(tex2(aux, uvt).z, radt);
      // The disc's edge is soft by a third of its radius, so a tap just
      // outside it still gives a little: a hard edge sampled by 64 taps is a
      // coin toss per pixel, which is the hair along a sharp edge.
      let w = clamp((ct - r) / max(1.0, 0.33 * ct) + 0.5, 0.0, 1.0) / max(ct * ct, 1.0);
      if (w > 0.0) {
        var s: vec3f;
        if (fringe) {
          s = vec3f(tex2(scene, uvt + off + dR).r, tex2(scene, uvt + off).g, tex2(scene, uvt + off + dB).b);
        } else {
          s = tex2(scene, uvt + off).rgb;
        }
        acc += s * w;
        wsum += w;
      }
    }
    col = acc / wsum;
  }

  // ── Bloom ───────────────────────────────────────────────────────
  // Light scatters in a lens, in the dust on it and in the eye, and the
  // scatter has a long tail: the point spread of a real lens falls as about
  // r^-3, not as a Gaussian, so a bright patch has a tight halo and a wide
  // faint one. Rings of samples at doubling radii are weighted by that
  // spread times the ring's area (so each doubling carries about equally
  // much light), and normalised so the halo is the light gathered, not an
  // amount made up. The plate is stored in 8 bits, where a highlight is
  // clipped at 1, so what scatters is what is over a knee at 0.5: a
  // shortcut, to go when the plate is drawn in half floats (PLAN.md 33i).
  if (U.bloom > 0.001) {
    let rot = hash(uv * U.resolution + 7.7) * 6.2831853;
    var glow = vec3f(0.0);
    var norm = 0.0;
    for (var k = 0; k < 6; k++) {
      let r = 0.006 * exp2(f32(k) * 1.2);
      let x = r / 0.012;
      let w = r * r / pow(1.0 + x * x, 1.5);
      var ring = vec3f(0.0);
      for (var j = 0; j < 10; j++) {
        let ang = (f32(j) + f32(k) * 0.37) * 0.6283185 + rot;
        let d = vec2f(cos(ang), sin(ang)) * ax * r;
        ring += max(tex2(scene, uv + off + d).rgb - 0.5, vec3f(0.0));
      }
      glow += ring * (0.1 * w);
      norm += w;
    }
    col += glow / norm * (U.bloom * 2.4);
  }

  // ── The sensor ──────────────────────────────────────────────────
  // Lens is how much of the sensor's look (roll-off, vignette, grain) is on;
  // the optics above act at their own settings with Lens at 0.
  let optic = clamp(col, vec3f(0.0), vec3f(1.0));
  let mapped = aces(col * 1.12);
  col = mix(optic, mapped, U.filmic);
  let vig = 1.0 - smoothstep(0.45, 1.15, length(rad) * 1.3) * 0.55 * U.vignette;
  col *= vig;
  let luma = dot(col, vec3f(0.299, 0.587, 0.114));
  col += (hash(uv * U.resolution + fract(U.time * 47.3)) - 0.5) * 0.04 * U.grain * (0.15 + 0.85 * smoothstep(0.02, 0.5, luma));

  var outc = mix(optic, clamp(col, vec3f(0.0), vec3f(1.0)), U.amount);
  // GL's fragment coordinate, counted up from the bottom row as the GLSL has
  // it, so the dither falls on the same pixels in both.
  let frag = vec2f(in.pos.x, U.resolution.y - in.pos.y);
  let dth = hash(frag) + hash(frag + vec2f(17.31, 5.73)) - 1.0;
  outc += U.dither * dth * step(1.0 / 255.0, max(outc.r, max(outc.g, outc.b))) / 255.0;
  return vec4f(outc, 1.0);
}
`;
