/**
 * The last thing that happens to a frame before it is light on a wall.
 *
 * Everything upstream of this draws the plate. This draws the *projection*:
 * mirrored for a rear screen, pulled square against a projector that could
 * not be hung on axis, blanked at the edges so no stray light lands on a
 * face or spills off a gauze, and graded for a room that is brighter than
 * the one the look was built in.
 *
 * It sits at the very end of the chain — after the camera pass, which is the
 * last thing that is part of the picture — so every surface the show reaches
 * gets it from one implementation: the laptop's canvas, the HDMI projector
 * window that mirrors that canvas pixel for pixel, a network display, a
 * Chromecast, and the recorder writing a `.webm`. The alternative was to warp
 * in the mirror, which would have left the laptop's own preview showing
 * something the wall was not showing, and the desk's whole premise is that
 * the preview tells the truth about the wall.
 *
 * It is built only when it would change a pixel (`outputIsIdentity`), so a
 * machine that has never seen a projector pays nothing at all.
 *
 * Structure follows `CameraPass`, down to the unit numbering: a texture the
 * upstream pass renders into, and one full-screen draw that reads it.
 */

import { cornerPinMatrix, type OutputConfig } from './outputConfig';

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

uniform sampler2D u_scene;
uniform mat3  u_warp;        // projected quad -> source picture, both in screen space (y down)
uniform vec2  u_flip;        // 1 or -1 per axis
uniform vec4  u_mask;        // blanking inset from top, right, bottom, left
uniform float u_feather;     // how soft that edge is
uniform float u_gain;
uniform float u_gamma;

void main() {
  // Screen space, y down: the space the corner handles are dragged in.
  vec2 d = vec2(v_uv.x, 1.0 - v_uv.y);

  // ── Corner pin ───────────────────────────────────────────────────
  vec3 p = u_warp * vec3(d, 1.0);
  // Behind the projector's plane: there is no picture there.
  if (p.z <= 1e-6) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec2 src = p.xy / p.z;
  // Outside the quad the operator pinned. Black, not clamped: a clamped edge
  // smears the outermost row of pixels across the rest of the screen, which
  // on a wall reads as a coloured halo round the picture.
  if (src.x < 0.0 || src.x > 1.0 || src.y < 0.0 || src.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // ── Flip ─────────────────────────────────────────────────────────
  // After the warp, so the corners stay where the operator put them on the
  // wall rather than jumping across it the moment rear projection goes on.
  src = mix(src, 1.0 - src, step(u_flip, vec2(0.0)));

  vec3 col = texture(u_scene, vec2(src.x, 1.0 - src.y)).rgb;

  // ── Blanking ─────────────────────────────────────────────────────
  // In the projected rectangle, not in the picture: masking is a piece of
  // tape on the light, and tape does not keystone with the image.
  float fe = max(u_feather, 1e-4);
  float m = smoothstep(0.0, fe, d.y - u_mask.x)
          * smoothstep(0.0, fe, (1.0 - u_mask.y) - d.x)
          * smoothstep(0.0, fe, (1.0 - u_mask.z) - d.y)
          * smoothstep(0.0, fe, d.x - u_mask.w);

  // ── Grade ────────────────────────────────────────────────────────
  // The display convention, not the encoding one: above 1 deepens the
  // mid-tones, which is the move for a room with light in it (ambient light
  // adds a constant to every pixel and flattens the dark end, so the way back
  // is to pull the dark end down and let the gain carry the level).
  col = pow(max(col * u_gain, vec3(0.0)), vec3(u_gamma));
  fragColor = vec4(col * m, 1.0);
}`;

const UNIFORM_NAMES = ['u_scene', 'u_warp', 'u_flip', 'u_mask', 'u_feather', 'u_gain', 'u_gamma'] as const;

/** Above the camera pass's units, so neither can unbind the other's texture. */
const SCENE_UNIT = 11;

const IDENTITY3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);

export class OutputPass {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly scene: WebGLTexture;
  private width = 0;
  private height = 0;
  /** The framebuffer upstream renders into. Public so the camera pass can target it. */
  readonly fbo: WebGLFramebuffer;
  private readonly loc: Record<string, WebGLUniformLocation | null> = {};
  /** False if the program failed to build; the caller then draws straight to the screen. */
  readonly ok: boolean;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error('Output shader compile error:', gl.getShaderInfoLog(sh));
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
      if (!ok) console.error('Output program link error:', gl.getProgramInfoLog(this.program));
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

    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + SCENE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.scene = t;
    gl.activeTexture(gl.TEXTURE0);
    this.fbo = gl.createFramebuffer()!;
  }

  private ensure(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + SCENE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.scene, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.width = width;
    this.height = height;
  }

  /**
   * Point the upstream pass at this one's texture. Call before its draw.
   *
   * `drawBuffers` is reset to the single attachment because the plate pass
   * writes two (colour and the camera's aux) and leaves the state behind it;
   * without this, the second attachment is still selected and the driver has
   * a draw buffer pointing at nothing.
   */
  bindTarget(width: number, height: number): void {
    const gl = this.gl;
    this.ensure(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, width, height);
  }

  /** The finished picture, onto the screen, as the projector needs it. */
  draw(width: number, height: number, cfg: OutputConfig): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0 + SCENE_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.uniform1i(this.loc.u_scene, SCENE_UNIT);
    gl.uniformMatrix3fv(this.loc.u_warp, false, cornerPinMatrix(cfg.corners) ?? IDENTITY3);
    gl.uniform2f(this.loc.u_flip, cfg.flipX ? -1 : 1, cfg.flipY ? -1 : 1);
    gl.uniform4f(this.loc.u_mask, cfg.maskTop, cfg.maskRight, cfg.maskBottom, cfg.maskLeft);
    gl.uniform1f(this.loc.u_feather, cfg.maskFeather);
    gl.uniform1f(this.loc.u_gain, cfg.gain);
    gl.uniform1f(this.loc.u_gamma, cfg.gamma);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    gl.deleteTexture(this.scene);
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
