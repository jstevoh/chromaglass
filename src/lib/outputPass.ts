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

import { composeOntoPin, cornerPinMatrix, type OutputConfig, type Surface, type SurfaceShape } from './outputConfig';

// Geometry arrives in screen space (0,0 top left to 1,1 bottom right) — the
// space corner handles are dragged in — rather than in clip space, because
// every quad this draws is a set of dragged corners and converting them here
// costs two multiplies and saves a conversion at every call site.
const VERT = `#version 300 es
in vec2 a_screen;
out vec2 v_screen;
void main() {
  v_screen = a_screen;
  gl_Position = vec4(a_screen.x * 2.0 - 1.0, 1.0 - a_screen.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_screen;
out vec4 fragColor;

uniform sampler2D u_scene;
uniform mat3  u_warp;        // screen space (y down) -> this quad's unit square
uniform vec4  u_src;         // which piece of the plate fills that square: x, y, w, h
uniform int   u_shape;       // 0 rect, 1 ellipse, 2 triangle, 3 diamond
uniform float u_shapeFeather;
uniform float u_opacity;
uniform vec2  u_flip;        // 1 or -1 per axis
uniform vec4  u_mask;        // blanking inset from top, right, bottom, left
uniform float u_feather;     // how soft that edge is
uniform float u_gain;
uniform float u_gamma;

/**
 * How far inside its shape a point of the unit square is, before feathering.
 *
 * Measured in the quad's *local* space, so the shape keystones with the quad:
 * a circle on a surface that is not square to the projector comes out as the
 * ellipse that reads as a circle from the seats. Positive is inside; the
 * magnitude is roughly a distance, which is what lets one feather serve all
 * four of them.
 */
float shapeDepth(vec2 q) {
  if (u_shape == 1) return 0.5 - length(q - 0.5);                       // ellipse
  if (u_shape == 2) return q.y * 0.5 - abs(q.x - 0.5);                  // triangle, apex up
  if (u_shape == 3) return 0.5 - (abs(q.x - 0.5) + abs(q.y - 0.5));     // diamond
  return min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));                 // rect
}

void main() {
  // Screen space, y down: the space the corner handles are dragged in.
  vec2 d = v_screen;

  // ── Corner pin ───────────────────────────────────────────────────
  vec3 p = u_warp * vec3(d, 1.0);
  // Behind the projector's plane: there is no picture there.
  if (p.z <= 1e-6) discard;
  vec2 q = p.xy / p.z;
  // Outside the quad the operator pinned. Discarded rather than painted black:
  // with several surfaces on one wall, a surface that painted its own outside
  // would black out whatever sits behind it, and the frame is cleared to black
  // already. Not clamped either — a clamped edge smears the outermost row of
  // pixels across the rest of the screen, which on a wall reads as a coloured
  // halo round the picture.
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) discard;

  // ── Shape ────────────────────────────────────────────────────────
  float sa = smoothstep(0.0, max(u_shapeFeather, 1e-4), shapeDepth(q));
  if (sa <= 0.0) discard;

  // Which piece of the plate this surface shows.
  vec2 src = u_src.xy + q * u_src.zw;

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
  col = pow(max(col * u_gain, vec3(0.0)), vec3(u_gamma)) * m;
  // The grade re-quantises what the plate already quantised, so it gets its
  // own step of triangular dither — never on black, which is what the blanking
  // and the dark between mapped shapes are measured against.
  float dth = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)
            + fract(sin(dot(gl_FragCoord.xy + vec2(17.31, 5.73), vec2(12.9898, 78.233))) * 43758.5453) - 1.0;
  col += dth * step(1.0 / 255.0, max(col.r, max(col.g, col.b))) / 255.0;
  fragColor = vec4(col, sa * u_opacity);
}`;

const UNIFORM_NAMES = [
  'u_scene', 'u_warp', 'u_src', 'u_shape', 'u_shapeFeather', 'u_opacity',
  'u_flip', 'u_mask', 'u_feather', 'u_gain', 'u_gamma',
] as const;

const SHAPE_INDEX: Record<SurfaceShape, number> = { rect: 0, ellipse: 1, triangle: 2, diamond: 3 };

/** The whole frame, as a surface's corners would describe it. */
const FULL_QUAD: OutputConfig['corners'] = [0, 0, 1, 0, 1, 1, 0, 1];

/** Above the camera pass's units, so neither can unbind the other's texture. */
const SCENE_UNIT = 11;

/** Six vertices of two floats: one quad as two triangles. */
const QUAD_FLOATS = 12;
const VERTS = new Float32Array(QUAD_FLOATS);

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
    // Two triangles, rewritten per quad: every draw here is a set of corners
    // somebody dragged, and there are at most a handful of them a frame.
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_FLOATS * 4, gl.DYNAMIC_DRAW);
    const aScreen = gl.getAttribLocation(this.program, 'a_screen');
    if (aScreen >= 0) {
      gl.enableVertexAttribArray(aScreen);
      gl.vertexAttribPointer(aScreen, 2, gl.FLOAT, false, 0, 0);
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

  /**
   * One quad: its corners as geometry, and the projective map back out of it.
   *
   * The same call draws the plain projected rectangle and every mapped shape,
   * because they are the same thing — four corners on a wall and a piece of
   * the picture stretched between them. A quad that has been dragged flat is
   * skipped rather than divided by.
   */
  private drawQuad(
    corners: OutputConfig['corners'],
    src: Surface['src'],
    shape: SurfaceShape,
    feather: number,
    opacity: number,
  ): void {
    const gl = this.gl;
    const m = cornerPinMatrix(corners);
    if (!m) return;
    const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
    VERTS[0] = x0; VERTS[1] = y0; VERTS[2] = x1; VERTS[3] = y1; VERTS[4] = x2; VERTS[5] = y2;
    VERTS[6] = x0; VERTS[7] = y0; VERTS[8] = x2; VERTS[9] = y2; VERTS[10] = x3; VERTS[11] = y3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, VERTS);
    gl.uniformMatrix3fv(this.loc.u_warp, false, m);
    gl.uniform4f(this.loc.u_src, src[0], src[1], src[2], src[3]);
    gl.uniform1i(this.loc.u_shape, SHAPE_INDEX[shape]);
    gl.uniform1f(this.loc.u_shapeFeather, feather);
    gl.uniform1f(this.loc.u_opacity, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    gl.uniform2f(this.loc.u_flip, cfg.flipX ? -1 : 1, cfg.flipY ? -1 : 1);
    gl.uniform4f(this.loc.u_mask, cfg.maskTop, cfg.maskRight, cfg.maskBottom, cfg.maskLeft);
    gl.uniform1f(this.loc.u_feather, cfg.maskFeather);
    gl.uniform1f(this.loc.u_gain, cfg.gain);
    gl.uniform1f(this.loc.u_gamma, cfg.gamma);

    // The dark between the shapes. Everything this pass draws is a quad now
    // rather than the whole frame, so what is not covered has to be cleared
    // rather than painted — which is also what makes the gaps deliberate:
    // a projector on three panels lights three panels and leaves the wall
    // between them alone.
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const surfaces = cfg.surfaces ?? [];
    if (surfaces.length === 0) {
      // No mapping at all: the picture lands on the pinned rectangle, exactly
      // as it did before any of this existed.
      this.drawQuad(cfg.corners, [0, 0, 1, 1], 'rect', 0, 1);
    } else {
      // Mapped, and possibly all of it switched off — which is a blackout, not
      // an absence of mapping. Falling back to the full frame here would mean
      // that cueing the last shape off lit the entire wall instead of going
      // dark, which is the wrong way round for the one control somebody
      // reaches for when they want the light to stop.
      for (const s of surfaces) {
        if (!s.enabled || s.opacity <= 0) continue;
        const placed = composeOntoPin(s.corners, cfg.corners);
        if (placed) this.drawQuad(placed, s.src, s.shape, s.feather, s.opacity);
      }
    }

    gl.disable(gl.BLEND);
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
