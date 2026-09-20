/**
 * The camera, both ways, compared (docs/webgpu-plan.md, P3).
 *
 * `camera.html?case=dof` compiles the GLSL from `lib/cameraPass.ts` and the
 * WGSL from `gpu/wgsl/camera.ts`, gives them the same scene, the same aux
 * attachment and the same uniforms, draws both, and reads both back.
 * `scripts/camera.mjs` drives it and judges the difference.
 *
 * As with the composite's page, the inputs are made here rather than taken
 * from a running show, so a case is the same picture on every machine. The
 * frame is 640×360, not square: `ax` divides by the aspect, and a square
 * frame would let a mistake in it pass.
 */

import { CAMERA_FRAG, CAMERA_VERT } from '../lib/cameraPass';
import { CAMERA_WGSL } from './wgsl/camera';
import { CAMERA_LAYOUT } from './wgsl/cameraFields';
import { UniformPack } from './uniforms';
import { isGpuFailure, requestGpu } from './device';
import { layoutFromWgsl } from './kit';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 640);
const H = Number(q.get('h') ?? 360);
const out: Record<string, unknown> = { w: W, h: H };
const done = () => {
  (window as unknown as { __camera: unknown }).__camera = { ...out, done: true };
  document.body.textContent = JSON.stringify(out, null, 2);
};

// ── The inputs ──────────────────────────────────────────────────────

/**
 * A plate as the display pass leaves it: blobs of colour, a few highlights
 * well above the bloom's knee, and bare glass between them. Bright enough in
 * places to roll off, dark enough in others for the grain and the dither to
 * be the only thing moving.
 */
function sceneTexture(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  const blobs = [
    { x: 0.30, y: 0.42, r: 0.26, c: [1.00, 0.35, 0.15], peak: 0.85 },
    { x: 0.64, y: 0.55, r: 0.30, c: [0.20, 0.55, 1.00], peak: 0.70 },
    { x: 0.48, y: 0.30, r: 0.10, c: [1.00, 0.98, 0.90], peak: 1.60 },  // a highlight, over the knee
    { x: 0.82, y: 0.24, r: 0.06, c: [1.00, 0.90, 0.70], peak: 1.90 },
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      let r = 0.02 + 0.06 * v, g = 0.02 + 0.03 * u, b = 0.04 + 0.05 * (1 - v);
      for (const s of blobs) {
        const d = Math.hypot((u - s.x) * (w / h), v - s.y) / s.r;
        if (d > 1) continue;
        const k = Math.pow(1 - d * d, 2) * s.peak;
        r += k * s.c[0]; g += k * s.c[1]; b += k * s.c[2];
      }
      const i = (y * w + x) * 4;
      const to8 = (t: number) => Math.max(0, Math.min(255, Math.round(t * 255)));
      data[i] = to8(r); data[i + 1] = to8(g); data[i + 2] = to8(b); data[i + 3] = 255;
    }
  }
  return data;
}

/**
 * The aux attachment: the surface normal biased into 0..1 in rg, the dye's
 * height in b, and the bubble mask in a. Domes over the blobs, a couple of
 * bubbles, and flat glass elsewhere — so refraction has something to bend and
 * the depth of field has a range of heights to go soft over.
 */
function auxTexture(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  const domes = [
    { x: 0.30, y: 0.42, r: 0.26 },
    { x: 0.64, y: 0.55, r: 0.30 },
  ];
  const bubbles = [
    { x: 0.40, y: 0.66, r: 0.07 },
    { x: 0.72, y: 0.34, r: 0.05 },
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      let nx = 0, ny = 0, height = 0, bub = 0;
      for (const d of domes) {
        const dx = (u - d.x) * (w / h), dy = v - d.y;
        const t = Math.hypot(dx, dy) / d.r;
        if (t > 1) continue;
        const dome = Math.sqrt(Math.max(0, 1 - t * t));
        height = Math.max(height, dome);
        nx += (dx / d.r) * dome; ny += (dy / d.r) * dome;
      }
      for (const b of bubbles) {
        const dx = (u - b.x) * (w / h), dy = v - b.y;
        const t = Math.hypot(dx, dy) / b.r;
        if (t > 1) continue;
        bub = Math.max(bub, Math.sqrt(Math.max(0, 1 - t * t)));
        nx -= (dx / b.r) * 0.8; ny -= (dy / b.r) * 0.8;
      }
      const i = (y * w + x) * 4;
      const bias = (t: number) => Math.max(0, Math.min(255, Math.round((t * 0.5 + 0.5) * 255)));
      const to8 = (t: number) => Math.max(0, Math.min(255, Math.round(t * 255)));
      data[i] = bias(Math.max(-1, Math.min(1, nx)));
      data[i + 1] = bias(Math.max(-1, Math.min(1, ny)));
      data[i + 2] = to8(height);
      data[i + 3] = to8(bub);
    }
  }
  return data;
}

const SOURCES: Record<string, { w: number; h: number; data: Uint8Array }> = {
  scene: { w: W, h: H, data: sceneTexture(W, H) },
  aux: { w: W, h: H, data: auxTexture(W, H) },
};

// ── The cases ───────────────────────────────────────────────────────

/** A camera doing nothing: every knob at rest, the pass a straight copy. */
const BASE: Record<string, number[]> = {
  resolution: [W, H],
  amount: [1], aperture: [0], bloom: [0], chromatic: [0], dither: [0],
  filmic: [0], focus: [0.5], grain: [0], refraction: [0], time: [3.25], vignette: [0],
};

const CASES: Record<string, Record<string, number[]>> = {
  'through': { amount: [0], refraction: [1], bloom: [1], grain: [1] },  // amount 0 is the plate, untouched
  'plain': {},
  'refraction': { refraction: [1] },
  'chromatic': { refraction: [0.7], chromatic: [1] },
  'dof': { aperture: [0.8], focus: [0.2] },
  'dof-far': { aperture: [1], focus: [0.95] },
  'bloom': { bloom: [1] },
  'filmic': { filmic: [1] },
  'vignette': { vignette: [1] },
  'grain': { grain: [1] },
  'dither': { dither: [1] },
  'half': { amount: [0.5], refraction: [0.6], aperture: [0.5], bloom: [0.7], filmic: [1], vignette: [0.6], grain: [0.6] },
  'everything': {
    refraction: [0.8], chromatic: [0.6], aperture: [0.6], focus: [0.35], bloom: [0.8],
    filmic: [1], vignette: [0.6], grain: [0.6], dither: [1],
  },
};

// ── WebGL ───────────────────────────────────────────────────────────

function glDraw(values: Record<string, number[]>): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true })!;
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`GLSL: ${gl.getShaderInfoLog(sh)}`);
    return sh;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, CAMERA_VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, CAMERA_FRAG));
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // A target of its own, made before the sources are bound: creating a
  // texture binds it to the active unit, and doing it afterwards would take
  // a source's place (the composite's page learned this first).
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  const target = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, W, H);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('the framebuffer is incomplete');

  let unit = 0;
  for (const [name, src] of Object.entries(SOURCES)) {
    const loc = gl.getUniformLocation(prog, `u_${name}`);
    if (loc === null) continue;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.w, src.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc, unit);
    unit++;
  }

  for (const f of CAMERA_LAYOUT.fields) {
    const loc = gl.getUniformLocation(prog, f.glsl ?? `u_${f.name}`);
    if (loc === null) continue;
    const v = values[f.name];
    if (!v) throw new Error(`no value for u_${f.name}`);
    if (f.type === 'f32') gl.uniform1f(loc, v[0]);
    else if (f.type === 'i32') gl.uniform1i(loc, v[0]);
    else if (f.type === 'vec2f') gl.uniform2f(loc, v[0], v[1]);
    else if (f.type === 'vec3f') gl.uniform3f(loc, v[0], v[1], v[2]);
    else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
  }

  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const drawErr = gl.getError();
  if (drawErr) out.glDrawError = drawErr;
  const pixels = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const readErr = gl.getError();
  if (readErr) out.glReadError = readErr;
  return pixels;
}

// ── WebGPU ──────────────────────────────────────────────────────────

async function gpuDraw(device: GPUDevice, values: Record<string, number[]>): Promise<Uint8Array> {
  const pack = new UniformPack(CAMERA_LAYOUT);
  for (const [name, v] of Object.entries(values)) pack.set(name, ...v);
  const missing = pack.unset();
  if (missing.length) throw new Error(`uniforms never set: ${missing.join(', ')}`);

  const ubo = device.createBuffer({ size: CAMERA_LAYOUT.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubo, 0, pack.bytes);

  const upload = (name: string) => {
    const s = SOURCES[name];
    const t = device.createTexture({
      label: name, size: [s.w, s.h], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: t }, s.data, { bytesPerRow: s.w * 4 }, [s.w, s.h]);
    return t;
  };
  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear',
    addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
  });
  const textures = ['scene', 'aux'].map(upload);

  const module = device.createShaderModule({ code: CAMERA_WGSL, label: 'camera' });
  const layout = layoutFromWgsl(device, CAMERA_WGSL, 'camera', GPUShaderStage.FRAGMENT);
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
    primitive: { topology: 'triangle-list' },
  });

  const target = device.createTexture({
    size: [W, H], format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  const group = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: ubo } },
      { binding: 1, resource: sampler },
      ...textures.map((t, i) => ({ binding: 2 + i, resource: t.createView() })),
    ],
  });

  const row = Math.ceil((W * 4) / 256) * 256;
  const read = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  const rp = enc.beginRenderPass({
    colorAttachments: [{
      view: target.createView(), loadOp: 'clear', storeOp: 'store',
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
    }],
  });
  rp.setPipeline(pipeline);
  rp.setBindGroup(0, group);
  rp.draw(6);
  rp.end();
  enc.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: row }, [W, H]);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(read.getMappedRange().slice(0));
  read.unmap();
  const pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) pixels.set(padded.subarray(y * row, y * row + W * 4), y * W * 4);
  return pixels;
}

// ── The comparison ──────────────────────────────────────────────────

/**
 * How far apart two frames are. `gl` comes back bottom row first, as
 * readPixels gives it; `gpu` comes out of the texture top row first. Same
 * picture, turned over, so the rows are matched here rather than by flipping
 * a shader's uv — the grain hashes that uv, and would not survive it.
 */
function compare(gl: Uint8Array, gpu: Uint8Array) {
  let worst = 0, sum = 0, over2 = 0, over8 = 0, lit = 0;
  for (let y = 0; y < H; y++) {
    const ga = (H - 1 - y) * W * 4;
    const gb = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = ga + x * 4, j = gb + x * 4;
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(gl[i + c] - gpu[j + c]);
        if (d > worst) worst = d;
        sum += d;
        if (d > 2) over2++;
        if (d > 8) over8++;
      }
      if (gl[i] > 4 || gl[i + 1] > 4 || gl[i + 2] > 4) lit++;
    }
  }
  const n = W * H * 3;
  return {
    worst, mean: +(sum / n).toFixed(4),
    over2: +(over2 / n).toFixed(5), over8: +(over8 / n).toFixed(5),
    litFraction: +(lit / (W * H)).toFixed(3),
  };
}

async function main() {
  const name = q.get('case') ?? 'plain';
  const over = CASES[name];
  if (!over) { out.error = `no such case: ${name}`; return done(); }
  out.case = name;
  const values = { ...BASE, ...over };

  const gpu = await requestGpu();
  if (isGpuFailure(gpu)) { out.error = `${gpu.failure}: ${gpu.detail}`; return done(); }
  out.adapter = gpu.label;
  const errors: string[] = [];
  gpu.device.addEventListener('uncapturederror', (e) => errors.push(String((e as GPUUncapturedErrorEvent).error?.message ?? e).slice(0, 300)));

  const glPixels = glDraw(values);
  const gpuPixels = await gpuDraw(gpu.device, values);
  const mean = (px: Uint8Array) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return +(s / (px.length / 4) / 3).toFixed(2); };
  out.brightness = { webgl: mean(glPixels), webgpu: mean(gpuPixels) };
  out.diff = compare(glPixels, gpuPixels);
  if (errors.length) out.errors = errors.slice(0, 3);
  done();
}

main().catch((e) => { out.error = String((e as Error)?.stack ?? e).slice(0, 600); done(); });
