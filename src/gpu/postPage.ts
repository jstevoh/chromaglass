/**
 * The post chain, both ways, compared (docs/webgpu-plan.md, P3).
 *
 * `post.html?case=mark` compiles the GLSL from `lib/postChain.ts` and the
 * WGSL from `gpu/wgsl/post.ts`, gives them the same picture, the same mark,
 * the same history and the same uniforms, draws both and reads both back.
 * `scripts/post.mjs` drives it.
 *
 * Two passes are compared. The **finish** is the frame's last three steps —
 * the dimmer, the mark, the dither — and both engines share it with their own
 * plate shader rather than writing it twice. The **test effect** is the
 * stand-in for the effects still to come: seeded noise, or a frame out of the
 * history ring, which is the part that has to be identical run to run and
 * machine to machine if a song is ever to be rendered twice.
 */

import { FINISH_FRAG, POST_VERT, TEST_FRAG } from '../lib/postChain';
import { FINISH_PASS_WGSL, TEST_PASS_WGSL } from './wgsl/post';
import { POST_LAYOUT } from './wgsl/postFields';
import { UniformPack } from './uniforms';
import { isGpuFailure, requestGpu } from './device';
import { layoutFromWgsl } from './kit';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 640);
const H = Number(q.get('h') ?? 360);
const HISTORY_LAYERS = 4;
const out: Record<string, unknown> = { w: W, h: H };
const done = () => {
  (window as unknown as { __post: unknown }).__post = { ...out, done: true };
  document.body.textContent = JSON.stringify(out, null, 2);
};

// ── The inputs ──────────────────────────────────────────────────────

/** A finished plate: bands, a bright corner, a dark one, and a slow ramp through the darks. */
function pictureTexture(w: number, h: number, shift = 0): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      // A ramp the dither is for: a few levels across the whole frame.
      const ramp = 0.02 + 0.06 * u;
      const band = Math.floor((u + shift) * 6) % 2 === 0 ? 0.5 : 0.22;
      const i = (y * w + x) * 4;
      const to8 = (t: number) => Math.max(0, Math.min(255, Math.round(t * 255)));
      data[i] = to8(ramp + band * v);
      data[i + 1] = to8(ramp + band * (1 - v) * 0.8);
      data[i + 2] = to8(ramp + band * 0.6 + 0.2 * u * v);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** A mark with an alpha ramp, so the composite over it is tested and not just the rectangle. */
function markTexture(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = (x + 0.5) / size;
      data[i] = 255; data[i + 1] = 240; data[i + 2] = 210;
      data[i + 3] = Math.round(Math.max(0, 1 - u) * 255);
    }
  }
  return data;
}

const PICTURE = pictureTexture(W, H);
const MARK = markTexture();
/** Four frames of history, each flatly different, so a layer can be told from its neighbours. */
const HISTORY = Array.from({ length: HISTORY_LAYERS }, (_, i) => {
  const d = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    d[p * 4] = 40 + i * 50; d[p * 4 + 1] = 90; d[p * 4 + 2] = 200 - i * 40; d[p * 4 + 3] = 255;
  }
  return d;
});

// ── The cases ───────────────────────────────────────────────────────

const BASE: Record<string, number[]> = {
  markRect: [0.5, 0.3, 0.25, 0.12],
  resolution: [W, H],
  dimmer: [1], markOn: [0], mode: [0], layer: [0], frame: [7], seed: [12345],
};

interface Case { pass: 'finish' | 'test'; values: Record<string, number[]> }

const CASES: Record<string, Case> = {
  'plain': { pass: 'finish', values: {} },
  'dimmed': { pass: 'finish', values: { dimmer: [0.35] } },
  'blackout': { pass: 'finish', values: { dimmer: [0] } },
  'mark': { pass: 'finish', values: { markOn: [1] } },
  'mark-faded': { pass: 'finish', values: { markOn: [0.4] } },
  'mark-blackout': { pass: 'finish', values: { dimmer: [0], markOn: [1] } },
  'noise': { pass: 'test', values: { mode: [1] } },
  'noise-elsewhere': { pass: 'test', values: { mode: [1], frame: [8], seed: [999] } },
  'history-0': { pass: 'test', values: { mode: [2], layer: [0] } },
  'history-3': { pass: 'test', values: { mode: [2], layer: [3] } },
  'effect-off': { pass: 'test', values: { mode: [0] } },
};

// ── WebGL ───────────────────────────────────────────────────────────

function glDraw(kase: Case, values: Record<string, number[]>): Uint8Array {
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
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, POST_VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, kase.pass === 'finish' ? FINISH_FRAG : TEST_FRAG));
  gl.bindAttribLocation(prog, 0, 'a_pos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  // The chain draws a strip; the harness draws the same two triangles as a list.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

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

  const tex2d = (unit: number, data: Uint8Array, w: number, h: number) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  tex2d(1, PICTURE, W, H);
  tex2d(2, MARK, 128, 128);
  gl.uniform1i(gl.getUniformLocation(prog, 'u_picture'), 1);

  if (kase.pass === 'finish') {
    gl.uniform1i(gl.getUniformLocation(prog, 'u_mark'), 2);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_dimmer'), values.dimmer[0]);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_markOn'), values.markOn[0]);
    const r = values.markRect;
    gl.uniform4f(gl.getUniformLocation(prog, 'u_markRect'), r[0], r[1], r[2], r[3]);
  } else {
    const arr = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + 3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, arr);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, W, H, HISTORY_LAYERS);
    for (let i = 0; i < HISTORY_LAYERS; i++) {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, W, H, 1, gl.RGBA, gl.UNSIGNED_BYTE, HISTORY[i]);
    }
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_history'), 3);
    gl.uniform1i(gl.getUniformLocation(prog, 'u_mode'), values.mode[0]);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_layer'), values.layer[0]);
    gl.uniform1ui(gl.getUniformLocation(prog, 'u_frame'), values.frame[0]);
    gl.uniform1ui(gl.getUniformLocation(prog, 'u_seed'), values.seed[0]);
  }

  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const err = gl.getError();
  if (err) out.glDrawError = err;
  const pixels = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// ── WebGPU ──────────────────────────────────────────────────────────

async function gpuDraw(device: GPUDevice, kase: Case, values: Record<string, number[]>): Promise<Uint8Array> {
  const pack = new UniformPack(POST_LAYOUT);
  for (const [name, v] of Object.entries(values)) pack.set(name, ...v);
  const missing = pack.unset();
  if (missing.length) throw new Error(`uniforms never set: ${missing.join(', ')}`);

  const ubo = device.createBuffer({ size: POST_LAYOUT.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubo, 0, pack.bytes);

  const upload = (data: Uint8Array, w: number, h: number, label: string) => {
    const t = device.createTexture({
      label, size: [w, h], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: t }, data, { bytesPerRow: w * 4 }, [w, h]);
    return t;
  };
  const picture = upload(PICTURE, W, H, 'picture');
  const mark = upload(MARK, 128, 128, 'mark');
  const history = device.createTexture({
    label: 'history', size: [W, H, HISTORY_LAYERS], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  for (let i = 0; i < HISTORY_LAYERS; i++) {
    device.queue.writeTexture({ texture: history, origin: [0, 0, i] }, HISTORY[i], { bytesPerRow: W * 4 }, [W, H, 1]);
  }
  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear',
    addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
  });

  const code = kase.pass === 'finish' ? FINISH_PASS_WGSL : TEST_PASS_WGSL;
  const module = device.createShaderModule({ code, label: kase.pass });
  const layout = layoutFromWgsl(device, code, kase.pass, GPUShaderStage.FRAGMENT);
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
  const entries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer: ubo } },
    { binding: 1, resource: sampler },
    { binding: 2, resource: picture.createView() },
    { binding: 3, resource: mark.createView() },
  ];
  if (kase.pass === 'test') {
    entries.push({ binding: 4, resource: history.createView({ dimension: '2d-array' }) });
  }
  const group = device.createBindGroup({ layout, entries });

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

/** As the composite's, the camera's and the projector's: GL comes back bottom row first. */
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
  const kase = CASES[name];
  if (!kase) { out.error = `no such case: ${name}`; return done(); }
  out.case = name;
  out.pass = kase.pass;
  const values = { ...BASE, ...kase.values };

  const gpu = await requestGpu();
  if (isGpuFailure(gpu)) { out.error = `${gpu.failure}: ${gpu.detail}`; return done(); }
  out.adapter = gpu.label;
  const errors: string[] = [];
  gpu.device.addEventListener('uncapturederror', (e) => errors.push(String((e as GPUUncapturedErrorEvent).error?.message ?? e).slice(0, 300)));

  const glPixels = glDraw(kase, values);
  const gpuPixels = await gpuDraw(gpu.device, kase, values);
  const mean = (px: Uint8Array) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return +(s / (px.length / 4) / 3).toFixed(2); };
  out.brightness = { webgl: mean(glPixels), webgpu: mean(gpuPixels) };
  out.diff = compare(glPixels, gpuPixels);
  if (errors.length) out.errors = errors.slice(0, 3);
  done();
}

main().catch((e) => { out.error = String((e as Error)?.stack ?? e).slice(0, 600); done(); });
