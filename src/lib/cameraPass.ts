/**
 * The camera.
 *
 * A photograph of oil on water is not the oil: it is a lens with a focal
 * plane, glass that bends and splits the light, a sensor that blooms around
 * the highlights and rolls off at the top, a vignette and grain. None of that
 * can be done in the pass that draws the plate, because all of it needs the
 * finished picture to sample from. So the plate is drawn to a texture — with
 * a second attachment carrying, per pixel, the surface normal, the height of
 * the dye and whether a bubble sits there — and this pass looks at that
 * picture the way a camera would.
 *
 * Cost is a few dozen texture fetches per pixel at the worst; the frame-time
 * governor already trades pixel density for time, so a machine that cannot
 * afford it at 2x renders at 1x.
 */

import { UNIT } from './textureUnits';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_scene;      // the plate, drawn
uniform sampler2D u_aux;        // normal.xy (biased), height, bubble mask
uniform vec2  u_resolution;
uniform float u_time;
uniform float u_amount;         // the camera as a whole, 0..1 (0 = pass-through)
uniform float u_refraction;     // how much the dye and the bubbles bend what is under them
uniform float u_chromatic;      // colour fringing at refracting edges and the frame's corners
uniform float u_focus;          // the focal plane, as a height: 0 the glass, 1 the tops of the thickest domes
uniform float u_aperture;       // how fast things go soft away from the focal plane
uniform float u_bloom;          // glow around the highlights
uniform float u_filmic;         // the sensor's roll-off (ACES) against a straight clamp
uniform float u_vignette;
uniform float u_grain;
uniform float u_dither;          // 1 onto the canvas, 0 into the post chain

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

const vec2 DISC[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696,  0.457), vec2(-0.203,  0.621),
  vec2( 0.962, -0.195), vec2( 0.473, -0.480), vec2( 0.519,  0.767), vec2( 0.185, -0.893),
  vec2( 0.507,  0.064), vec2( 0.896,  0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 ax = vec2(1.0 / aspect, 1.0);          // an offset that is round on screen
  vec2 rad = (uv - 0.5) * vec2(aspect, 1.0);

  vec4 aux = texture(u_aux, uv);
  vec2 n = aux.xy * 2.0 - 1.0;
  float h = aux.z;
  float bub = aux.w;

  // ── Refraction ──────────────────────────────────────────────────
  // The dome of a drop bends the view of what is under it toward its rim;
  // a bubble is a lens and pulls the plate in toward its centre. The normal
  // was written pointing the way the sample should move.
  vec2 off = n * (h * 0.028 + bub * 0.045) * u_refraction * ax;
  // Red and blue bend a little differently, and the lens does the same at
  // the corners of the frame.
  vec2 ca = (off * 0.18 + rad * ax * 0.0035 * length(rad)) * u_chromatic;

  // ── Depth of field ──────────────────────────────────────────────
  float coc = abs(h - u_focus) * u_aperture * 9.0 + length(rad) * u_aperture * 1.2;
  coc *= 1.0 - bub * 0.5;                                   // the bubble's top is nearer the focal plane than the plate
  float r = coc / u_resolution.y;                           // pixels → uv

  vec3 col;
  if (coc < 0.6) {
    col = vec3(texture(u_scene, uv + off + ca).r, texture(u_scene, uv + off).g, texture(u_scene, uv + off - ca).b);
  } else {
    col = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      vec2 o = DISC[i] * r * ax;
      col += vec3(texture(u_scene, uv + off + ca + o).r, texture(u_scene, uv + off + o).g, texture(u_scene, uv + off - ca + o).b);
    }
    col /= 12.0;
  }

  // ── Bloom ───────────────────────────────────────────────────────
  // What spills over from the brightest parts: two rings of taps, the
  // highlights lifted above a knee and spread.
  if (u_bloom > 0.001) {
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981634;
      vec2 d = vec2(cos(a), sin(a)) * ax;
      vec3 s1 = texture(u_scene, uv + d * 0.012).rgb;
      vec3 s2 = texture(u_scene, uv + d * 0.032).rgb;
      glow += max(s1 - 0.55, 0.0) * 0.7 + max(s2 - 0.55, 0.0) * 0.4;
    }
    col += glow * (u_bloom * 0.14);
  }

  // ── The sensor ──────────────────────────────────────────────────
  vec3 mapped = aces(col * 1.12);
  col = mix(clamp(col, 0.0, 1.0), mapped, u_filmic);
  float vig = 1.0 - smoothstep(0.45, 1.15, length(rad) * 1.3) * 0.55 * u_vignette;
  col *= vig;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col += (hash(uv * u_resolution + fract(u_time * 47.3)) - 0.5) * 0.04 * u_grain * (0.15 + 0.85 * smoothstep(0.02, 0.5, luma));

  // The whole pass fades against the plate as drawn, so half a camera is
  // half the effect rather than a different picture.
  vec3 plain = texture(u_scene, uv).rgb;
  vec3 outc = mix(plain, clamp(col, 0.0, 1.0), u_amount);
  // One 8-bit step of triangular dither before the canvas quantises again,
  // never on true black (see the display shader's final write). Not when the
  // frame goes on into the post chain: its finish dithers once, at the end.
  float dth = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + vec2(17.31, 5.73)) - 1.0;
  outc += u_dither * dth * step(1.0 / 255.0, max(outc.r, max(outc.g, outc.b))) / 255.0;
  fragColor = vec4(outc, 1.0);
}`;

export interface CameraUniforms {
  time: number;
  amount: number;
  refraction: number;
  chromatic: number;
  focus: number;
  aperture: number;
  bloom: number;
  filmic: number;
  vignette: number;
  grain: number;
  /** One step of dither for an 8-bit target (the default); 0 when the post chain finishes the frame. */
  dither?: number;
}

const UNIFORM_NAMES = [
  'u_scene', 'u_aux', 'u_resolution', 'u_time', 'u_amount', 'u_refraction', 'u_chromatic',
  'u_focus', 'u_aperture', 'u_bloom', 'u_filmic', 'u_vignette', 'u_grain', 'u_dither',
] as const;

/** Texture units the pass reads on: see textureUnits.ts. */
const SCENE_UNIT = UNIT.cameraScene;
const AUX_UNIT = UNIT.cameraAux;

export class CameraPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly fbo: WebGLFramebuffer;
  private readonly scene: WebGLTexture;
  private readonly aux: WebGLTexture;
  private readonly loc: Record<string, WebGLUniformLocation | null> = {};
  private width = 0;
  private height = 0;
  /** False if the program failed to build; the caller then draws straight to the screen. */
  readonly ok: boolean;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Camera shader compile error:', gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    this.program = gl.createProgram()!;
    let ok = !!vs && !!fs;
    if (vs && fs) {
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      ok = !!gl.getProgramParameter(this.program, gl.LINK_STATUS);
      if (!ok) console.error('Camera program link error:', gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }
    this.ok = ok;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.program, 'a_pos');
    if (aPos >= 0) {
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);

    for (const name of UNIFORM_NAMES) this.loc[name] = gl.getUniformLocation(this.program, name);

    // Each target lives on its own unit: creating a texture binds it on the
    // active unit, and leaving it on the plate pass's bead unit made the
    // first draw into it a feedback loop (one black frame per resize).
    const makeTex = (unit: number) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.scene = makeTex(SCENE_UNIT);
    this.aux = makeTex(AUX_UNIT);
    gl.activeTexture(gl.TEXTURE0);
    this.fbo = gl.createFramebuffer()!;
  }

  private ensure(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    const gl = this.gl;
    for (const [t, unit] of [[this.scene, SCENE_UNIT], [this.aux, AUX_UNIT]] as const) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scene, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.aux, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.width = width;
    this.height = height;
  }

  /** Point the plate pass at the offscreen targets. Call before its draw. */
  bindTarget(width: number, height: number): void {
    const gl = this.gl;
    this.ensure(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, width, height);
  }

  /**
   * Look at the drawn plate through the camera.
   *
   * Onto the screen, or into `target` when something downstream still has to
   * happen to the frame — the output pass, which squares and masks it for the
   * projector, is the only such thing today.
   */
  draw(width: number, height: number, u: CameraUniforms, target: WebGLFramebuffer | null = null): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    // Draw-buffer state belongs to the framebuffer object, so the default one
    // needs nothing here — and would reject an attachment name if it got it.
    if (target) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0 + SCENE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.activeTexture(gl.TEXTURE0 + AUX_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.aux);
    gl.uniform1i(this.loc.u_scene, SCENE_UNIT);
    gl.uniform1i(this.loc.u_aux, AUX_UNIT);
    gl.uniform2f(this.loc.u_resolution, width, height);
    gl.uniform1f(this.loc.u_time, u.time);
    gl.uniform1f(this.loc.u_amount, u.amount);
    gl.uniform1f(this.loc.u_refraction, u.refraction);
    gl.uniform1f(this.loc.u_chromatic, u.chromatic);
    gl.uniform1f(this.loc.u_focus, u.focus);
    gl.uniform1f(this.loc.u_aperture, u.aperture);
    gl.uniform1f(this.loc.u_bloom, u.bloom);
    gl.uniform1f(this.loc.u_filmic, u.filmic);
    gl.uniform1f(this.loc.u_vignette, u.vignette);
    gl.uniform1f(this.loc.u_grain, u.grain);
    gl.uniform1f(this.loc.u_dither, u.dither ?? 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.scene);
    gl.deleteTexture(this.aux);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
