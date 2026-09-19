/**
 * FROZEN while the WebGPU port runs (docs/webgpu-plan.md, P2–P3): the
 * compositor moves to WGSL in P3, so a change here has to be made twice.
 * Bug fixes only, ported in the same pull request.
 */

/**
 * The post chain: what happens to the finished plate before it reaches the
 * wall (docs/filters-plan.md, F0).
 *
 * With no effect on, none of this runs: the plate shader finishes the frame
 * itself (the dimmer and the flash guard's gain, the mark, the dither) and
 * draws straight to the canvas or the output pass, exactly as it did before
 * there was a chain. With an effect on, the plate draws into the chain's
 * picture instead, unfinished, and the chain runs:
 *
 *   plate → camera → effects (none yet) → finish → output pass → canvas
 *
 * The finish is the plate shader's own last lines, shared as GLSL below, so
 * the two paths agree to within the half float's precision: the fx harness
 * holds them to one 8-bit step on a frozen plate.
 *
 * Two things change with the chain on, both on purpose:
 *
 * - The mark is laid over after the camera, not through it. Through the
 *   camera it took the bloom, the vignette and the ACES curve, so a sponsor's
 *   logo came out soft and dim on a photographic look; the plan keeps the
 *   mark last and exempt.
 * - The dimmer comes after the camera too, so a dimmed photographic look
 *   dims the picture rather than the light the camera tone-maps.
 */

import { UNIT } from './textureUnits';

// ── Shared GLSL ──────────────────────────────────────────────────────

/** The plate shader's hash, used for its grain and dither: the finish has to dither with the same one. */
export const HASH_GLSL = `
float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}`;

/**
 * The frame's last three steps, shared by the plate shader (which runs them
 * when it draws straight to the screen) and the chain's finish pass: the light
 * (the dimmer and the mark), then the dither. The dither is about the target,
 * not the finish: the plate still dithers into the camera's 8-bit texture when
 * the chain finishes the frame later. Needs `hash`, `u_dimmer`, `u_mark`,
 * `u_markOn` and `u_markRect` declared by the shader that includes it.
 */
export const FINISH_GLSL = `
vec3 finishLight(vec3 outColor, vec2 uvScreen) {
  // The dimmer sits last, the way the lamp's own dimmer does: everything
  // upstream, the camera pass included, sees a darker plate (with the chain
  // off; with it on, the camera sees the plate at full level).
  outColor *= u_dimmer;

  // ── The mark ────────────────────────────────────────
  //
  // A logo or a title, laid over the finished frame rather than poured into
  // the plate. Dropping an image into the liquid is the lovely thing to do
  // with it and the wrong thing to do with a client's mark, which has to stay
  // legible for three hours.
  //
  // It is composited here, in the shader, and not as an element over the
  // canvas, because everything downstream reads the canvas: the projector
  // window, a cast to another screen, the recorder, and another machine
  // capturing this window. A mark that lived in the DOM would be on the
  // laptop's screen and on none of them.
  //
  // Below the dimmer on purpose. The house dimmer is the lamp, and taking the
  // lamp down should not take the sponsor's logo with it — a blackout with a
  // mark still on the wall is a normal thing to want. Its own opacity is the
  // control for that.
  // Any opacity at all: u_markOn is the fader, not a switch, and testing it
  // against 0.5 left the bottom half of the fade invisible and the mark
  // popping in at half strength.
  if (u_markOn > 0.001) {
    vec2 m = (uvScreen - u_markRect.xy) / max(u_markRect.zw, vec2(1e-4)) * 0.5 + 0.5;
    if (m.x > 0.0 && m.x < 1.0 && m.y > 0.0 && m.y < 1.0) {
      vec4 mark = texture(u_mark, vec2(m.x, 1.0 - m.y));
      outColor = mix(outColor, mark.rgb, mark.a * u_markOn);
    }
  }
  return outColor;
}

vec4 ditherOut(vec3 outColor) {
  // Triangular dither of one 8-bit step, the last thing before the canvas
  // quantises. The grain above fades out below luma 0.03 on purpose, which is
  // exactly where the black ground, the lamp falloff and the dish shade sit,
  // so slow dark ramps banded — and on a projector in a dark room the darks are
  // what everyone is looking at. Fixed per pixel, so it cannot shimmer, and
  // never on true black: black has to stay black (the mapping's dark between
  // shapes is measured as zero), and a ramp that bands is above it anyway.
  float dth = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + vec2(17.31, 5.73)) - 1.0;
  float lit = step(1.0 / 255.0, max(outColor.r, max(outColor.g, outColor.b)));
  return vec4(outColor + dth * lit / 255.0, 1.0);
}

// Both, for a frame going straight to the screen.
vec4 finishFrame(vec3 outColor, vec2 uvScreen) {
  return ditherOut(finishLight(outColor, uvScreen));
}`;

/**
 * Randomness for effects, deterministic: from the frame count and a seed,
 * never Math.random or the wall clock, so Render a song (PLAN.md §6) can make
 * the same film twice and the cast receivers roll the same dice. Integer
 * hashing (PCG), because a sin-based float hash differs from GPU to GPU.
 */
export const FX_RANDOM_GLSL = `
uint fxPcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
// 0..1 from a pixel, the frame and the seed.
float fxRand(uvec2 pixel, uint frame, uint seed) {
  return float(fxPcg(pixel.x ^ fxPcg(pixel.y ^ fxPcg(frame ^ fxPcg(seed))))) / 4294967295.0;
}`;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FINISH_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
layout(location = 0) out vec4 fragColor;
uniform sampler2D u_picture;
uniform float u_dimmer;
uniform sampler2D u_mark;
uniform float u_markOn;
uniform vec4 u_markRect;
${HASH_GLSL}
${FINISH_GLSL}
void main() {
  fragColor = finishFrame(texture(u_picture, v_uv).rgb, v_uv);
}`;

/**
 * A test effect for the harness, never in a look: seeded noise over the
 * picture (mode 1), or the picture from `u_delay` frames ago out of the
 * history ring (mode 2).
 */
const TEST_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 v_uv;
layout(location = 0) out vec4 fragColor;
uniform sampler2D u_picture;
uniform sampler2DArray u_history;
uniform int u_mode;
uniform float u_layer;
uniform uint u_frame;
uniform uint u_seed;
${FX_RANDOM_GLSL}
void main() {
  vec3 c = texture(u_picture, v_uv).rgb;
  if (u_mode == 1) c = mix(c, vec3(fxRand(uvec2(gl_FragCoord.xy), u_frame, u_seed)), 0.5);
  else if (u_mode == 2) c = texture(u_history, vec3(v_uv, u_layer)).rgb;
  fragColor = vec4(c, 1.0);
}`;

// ── A pass ───────────────────────────────────────────────────────────

/**
 * One full-screen program.
 *
 * Its uniforms are located from the linked program itself, not from a list
 * kept by hand beside the source: a name missing from such a list gets no
 * location, WebGL silently ignores a set with a null location, and the
 * uniform sits at zero with no error anywhere. Here a name the source never
 * declared warns once, and a declared one the compiler optimised away is
 * simply not set.
 */
export class PostPass {
  readonly ok: boolean;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly loc = new Map<string, WebGLUniformLocation>();
  private readonly declared: Set<string>;
  private readonly warned = new Set<string>();

  constructor(private readonly gl: WebGL2RenderingContext, frag: string, private readonly name: string) {
    this.declared = new Set([...frag.matchAll(/uniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)/g)].map((m) => m[1]));
    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error(`${name} shader compile error:`, gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    this.program = gl.createProgram()!;
    let ok = !!vs && !!fs;
    if (vs && fs) {
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);
      ok = !!gl.getProgramParameter(this.program, gl.LINK_STATUS);
      if (!ok) console.error(`${name} program link error:`, gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }
    this.ok = ok;
    if (ok) {
      const n = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(this.program, i);
        if (!info) continue;
        const key = info.name.replace(/\[0\]$/, '');
        const l = gl.getUniformLocation(this.program, info.name);
        if (l) this.loc.set(key, l);
      }
    }

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
  }

  private at(name: string): WebGLUniformLocation | null {
    const l = this.loc.get(name);
    if (l) return l;
    if (!this.declared.has(name) && !this.warned.has(name)) {
      this.warned.add(name);
      console.warn(`${this.name}: no uniform "${name}" in the shader; the value goes nowhere.`);
    }
    return null;
  }

  set1f(name: string, v: number): void { const l = this.at(name); if (l) this.gl.uniform1f(l, v); }
  set1i(name: string, v: number): void { const l = this.at(name); if (l) this.gl.uniform1i(l, v); }
  set1ui(name: string, v: number): void { const l = this.at(name); if (l) this.gl.uniform1ui(l, v >>> 0); }
  set4f(name: string, a: number, b: number, c: number, d: number): void { const l = this.at(name); if (l) this.gl.uniform4f(l, a, b, c, d); }

  /** Make this the current program, drawing into `target` (null: the canvas). */
  begin(target: WebGLFramebuffer | null, width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    if (target) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
  }

  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

// ── The history ring ─────────────────────────────────────────────────

/**
 * The last N pictures, for effects that look back: feedback's delay line,
 * slit-scan, a wipe's outgoing look. One texture array, a layer a frame.
 *
 * Kept to a pixel budget rather than the canvas's size: half resolution at
 * 1080p (32 frames, about 66 MB), a quarter at 4K. The step down is a linear
 * blit at exactly half size, which is an exact 2×2 average; a quarter is two
 * of them' worth of detail lost, which the effects that read this can afford.
 */
export class HistoryRing {
  private tex: WebGLTexture;
  private readonly fbo: WebGLFramebuffer;
  private width = 0;
  private height = 0;
  private frames = 0;
  /** The layer the next push writes. */
  private next = 0;
  /** How many layers hold a picture, up to `frames`. */
  private filled = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = gl.createTexture()!;
    this.fbo = gl.createFramebuffer()!;
  }

  get size(): { width: number; height: number; frames: number; filled: number } {
    return { width: this.width, height: this.height, frames: this.frames, filled: this.filled };
  }

  /** Allocate for a canvas of this size; nothing happens if it already fits. */
  ensure(canvasW: number, canvasH: number, frames = 32): void {
    const scale = Math.max(canvasW, canvasH) > 2560 ? 4 : 2;
    const w = Math.max(1, Math.floor(canvasW / scale));
    const h = Math.max(1, Math.floor(canvasH / scale));
    if (w === this.width && h === this.height && frames === this.frames) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.history);
    // Immutable storage cannot be resized: a new texture, the old one deleted.
    gl.deleteTexture(this.tex);
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, frames);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.activeTexture(gl.TEXTURE0);
    this.width = w;
    this.height = h;
    this.frames = frames;
    this.next = 0;
    this.filled = 0;
  }

  /** Keep this picture: `src` is a framebuffer holding it at `srcW`×`srcH`. */
  push(src: WebGLFramebuffer, srcW: number, srcH: number): void {
    if (!this.frames) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    gl.framebufferTextureLayer(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex, 0, this.next);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.blitFramebuffer(0, 0, srcW, srcH, 0, 0, this.width, this.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    this.next = (this.next + 1) % this.frames;
    this.filled = Math.min(this.frames, this.filled + 1);
  }

  /** The layer holding the picture from `delay` pushes ago (1 is the last one pushed), clamped to what is kept. */
  layerAt(delay: number): number {
    const d = Math.max(1, Math.min(Math.max(1, this.filled), Math.round(delay)));
    return (this.next - d + this.frames * 2) % this.frames;
  }

  /** Read one layer back (the harness's check that the ring holds what was pushed). */
  readLayer(layer: number): Uint8Array {
    const gl = this.gl;
    const px = new Uint8Array(this.width * this.height * 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
    gl.framebufferTextureLayer(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex, 0, layer);
    gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return px;
  }

  bind(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT.history);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.tex);
  }
}

// ── The chain ────────────────────────────────────────────────────────

export interface FinishUniforms {
  /** The house dimmer times the flash guard's gain. */
  dimmer: number;
  markOn: number;
  markRect: readonly [number, number, number, number];
}

/** What the harness can ask the chain to do; never set by a look. */
export interface PostTest {
  /** 0 off, 1 seeded noise, 2 the picture from `delay` frames ago. */
  mode: 0 | 1 | 2;
  delay: number;
}

export class PostChain {
  readonly ok: boolean;
  /** RGBA16F targets (EXT_color_buffer_float), or RGBA8 without it. */
  readonly float: boolean;
  private readonly targets: { tex: WebGLTexture; fbo: WebGLFramebuffer; unit: number }[];
  private readonly finish: PostPass;
  private readonly test: PostPass;
  private ring: HistoryRing | null = null;
  /** Which target holds the picture so far. */
  private cur = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    this.targets = [UNIT.post0, UNIT.post1].map((unit) => {
      const tex = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return { tex, fbo: gl.createFramebuffer()!, unit };
    });
    gl.activeTexture(gl.TEXTURE0);
    this.finish = new PostPass(gl, FINISH_FRAG, 'Finish');
    this.test = new PostPass(gl, TEST_FRAG, 'Post test');
    this.ok = this.finish.ok && this.test.ok;
  }

  private ensure(width: number, height: number): void {
    if (this.width === width && this.height === height) return;
    const gl = this.gl;
    for (const t of this.targets) {
      gl.activeTexture(gl.TEXTURE0 + t.unit);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      if (this.float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(gl.TEXTURE0);
    this.width = width;
    this.height = height;
  }

  /** The framebuffer the picture is drawn into first: the plate's, or the camera's output. */
  sceneTarget(width: number, height: number): WebGLFramebuffer {
    this.ensure(width, height);
    this.cur = 0;
    return this.targets[0].fbo;
  }

  /** Point the plate at the chain's picture. Call before its draw. */
  bindScene(width: number, height: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneTarget(width, height));
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, width, height);
  }

  /** The ring, allocated the first time an effect asks for it. */
  history(): HistoryRing {
    if (!this.ring) this.ring = new HistoryRing(this.gl);
    this.ring.ensure(this.width, this.height);
    return this.ring;
  }

  get historySize() {
    return this.ring?.size ?? null;
  }

  /** Bind the current picture on its unit, for a pass reading it. */
  private bindPicture(pass: PostPass): void {
    const gl = this.gl;
    const t = this.targets[this.cur];
    gl.activeTexture(gl.TEXTURE0 + t.unit);
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    pass.set1i('u_picture', t.unit);
  }

  /**
   * The effects, in the plan's order (optics, time, matte, iris, film). None
   * exist yet; the harness's test effect stands in for them.
   */
  effects(frame: number, seed: number, test: PostTest | null): void {
    if (!test || test.mode === 0) return;
    const gl = this.gl;
    const w = this.width, h = this.height;
    const ring = this.history();
    const out = 1 - this.cur;
    this.test.begin(this.targets[out].fbo, w, h);
    this.bindPicture(this.test);
    ring.bind();
    this.test.set1i('u_history', UNIT.history);
    this.test.set1i('u_mode', test.mode);
    this.test.set1f('u_layer', ring.layerAt(test.delay));
    this.test.set1ui('u_frame', frame);
    this.test.set1ui('u_seed', seed);
    this.test.draw();
    // The ring keeps the picture as it came in, before this frame's effects.
    ring.push(this.targets[this.cur].fbo, w, h);
    this.cur = out;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * The harness's check that the ring keeps what it is given: five solid
   * colours pushed in turn and read back by delay. It paints over the
   * chain's picture, which the next frame draws again.
   */
  ringSelfTest(): { ok: boolean; detail: string } {
    if (!this.width) return { ok: false, detail: 'the chain has not drawn a frame yet' };
    const gl = this.gl;
    const ring = this.history();
    const colours = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255]];
    const t = this.targets[this.cur];
    const clear = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    for (const [r, g, b] of colours) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.clearColor(r / 255, g / 255, b / 255, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      ring.push(t.fbo, this.width, this.height);
    }
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const { width, height, frames } = ring.size;
    const bad: string[] = [];
    for (const delay of [1, 2, 5]) {
      const want = colours[colours.length - delay];
      const px = ring.readLayer(ring.layerAt(delay));
      const i = ((height >> 1) * width + (width >> 1)) * 4;
      const got = [px[i], px[i + 1], px[i + 2]];
      if (got.some((v, k) => Math.abs(v - want[k]) > 2)) bad.push(`delay ${delay} read ${got.join(',')}, pushed ${want.join(',')}`);
    }
    return { ok: bad.length === 0, detail: bad.join('; ') || `${width}×${height}, ${frames} frames` };
  }

  /** The finish: the dimmer and the guard's gain, the mark, the dither. Onto the canvas, or the output pass's target. */
  finishTo(target: WebGLFramebuffer | null, u: FinishUniforms): void {
    const gl = this.gl;
    this.finish.begin(target, this.width, this.height);
    this.bindPicture(this.finish);
    gl.activeTexture(gl.TEXTURE0 + UNIT.mark);   // the plate bound the mark here this frame
    this.finish.set1i('u_mark', UNIT.mark);
    this.finish.set1f('u_dimmer', u.dimmer);
    this.finish.set1f('u_markOn', u.markOn);
    this.finish.set4f('u_markRect', u.markRect[0], u.markRect[1], u.markRect[2], u.markRect[3]);
    this.finish.draw();
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    }
    this.finish.dispose();
    this.test.dispose();
    this.ring?.dispose();
  }
}
