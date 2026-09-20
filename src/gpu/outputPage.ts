/**
 * The projector's pass, both ways, compared (docs/webgpu-plan.md, P3).
 *
 * `output.html?case=cube` compiles the GLSL from `lib/outputPass.ts` and the
 * WGSL from `gpu/wgsl/output.ts`, gives them the same scene and the same
 * mapping, draws both and reads both back. `scripts/output.mjs` drives it.
 *
 * The geometry is not ported: both sides call `cornerPinMatrix` and
 * `composeOntoPin`, the same TypeScript the app calls, so a difference here
 * is a difference in the drawing and never in where a surface is.
 *
 * The frame is 640×360 for the same reason the camera's is: a square frame
 * hides mistakes in anything that divides by the aspect.
 */

import { OUTPUT_FRAG, OUTPUT_VERT } from '../lib/outputPass';
import { OUTPUT_WGSL } from './wgsl/output';
import { OUTPUT_LAYOUT } from './wgsl/outputFields';
import { fillOutputUniforms } from './output';
import { UniformPack } from './uniforms';
import { isGpuFailure, requestGpu } from './device';
import { layoutFromWgsl } from './kit';
import {
  DEFAULT_OUTPUT, composeOntoPin, cornerPinMatrix, makeCube, makeSurface,
  type OutputConfig, type SurfaceShape,
} from '../lib/outputConfig';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 640);
const H = Number(q.get('h') ?? 360);
const out: Record<string, unknown> = { w: W, h: H };
const done = () => {
  (window as unknown as { __output: unknown }).__output = { ...out, done: true };
  document.body.textContent = JSON.stringify(out, null, 2);
};

// ── The scene ───────────────────────────────────────────────────────

/**
 * A finished frame for the projector to place: bands, a bright corner and a
 * dark one, so a flip, a crop or a rotation shows up as the wrong piece of
 * the picture rather than as a plausible one.
 */
function sceneTexture(w: number, h: number): Uint8Array {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const band = Math.floor(u * 8) % 2 === 0 ? 0.55 : 0.2;
      const r = band + 0.4 * u * v;
      const g = band * (1 - v) + 0.25 * u;
      const b = band * v + 0.3 * (1 - u);
      const i = (y * w + x) * 4;
      const to8 = (t: number) => Math.max(0, Math.min(255, Math.round(t * 255)));
      data[i] = to8(r); data[i + 1] = to8(g); data[i + 2] = to8(b); data[i + 3] = 255;
    }
  }
  return data;
}

const SCENE = sceneTexture(W, H);

// ── The cases ───────────────────────────────────────────────────────

const base = (): OutputConfig => ({ ...DEFAULT_OUTPUT, surfaces: [] });

const shaped = (shape: SurfaceShape, feather = 0.02): OutputConfig => {
  const s = makeSurface(shape);
  s.feather = feather;
  return { ...base(), surfaces: [s] };
};

const CASES: Record<string, OutputConfig> = {
  'plain': base(),
  'pinned': { ...base(), corners: [0.08, 0.05, 0.94, 0.12, 0.88, 0.95, 0.12, 0.88] },
  'flip-x': { ...base(), flipX: true },
  'flip-y': { ...base(), flipY: true },
  'mask': { ...base(), maskTop: 0.1, maskRight: 0.08, maskBottom: 0.12, maskLeft: 0.05, maskFeather: 0.04 },
  'grade': { ...base(), gain: 1.3, gamma: 1.4 },
  'rect': shaped('rect'),
  'ellipse': shaped('ellipse'),
  'triangle': shaped('triangle'),
  'diamond': shaped('diamond'),
  'cube': { ...base(), surfaces: makeCube() },
  'cube-pinned': {
    ...base(),
    corners: [0.06, 0.1, 0.9, 0.04, 0.96, 0.92, 0.1, 0.96],
    surfaces: makeCube(),
  },
  'blackout': { ...base(), surfaces: makeCube().map((s) => ({ ...s, enabled: false })) },
  'everything': {
    ...base(),
    corners: [0.05, 0.08, 0.93, 0.03, 0.97, 0.9, 0.09, 0.95],
    flipX: true,
    maskTop: 0.06, maskRight: 0.05, maskBottom: 0.07, maskLeft: 0.04, maskFeather: 0.03,
    gain: 1.2, gamma: 1.3,
    surfaces: makeCube(0.45, 0.5, 0.2).map((s, i) => ({ ...s, opacity: i === 1 ? 0.6 : 1 })),
  },
};

// ── WebGL ───────────────────────────────────────────────────────────

function glDraw(cfg: OutputConfig): Uint8Array {
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
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, OUTPUT_VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, OUTPUT_FRAG));
  gl.bindAttribLocation(prog, 0, 'a_screen');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(prog)}`);
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(12), gl.DYNAMIC_DRAW);
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

  const scene = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, scene);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, SCENE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const loc = (n: string) => gl.getUniformLocation(prog, n);
  gl.uniform1i(loc('u_scene'), 1);
  gl.uniform2f(loc('u_flip'), cfg.flipX ? -1 : 1, cfg.flipY ? -1 : 1);
  gl.uniform4f(loc('u_mask'), cfg.maskTop, cfg.maskRight, cfg.maskBottom, cfg.maskLeft);
  gl.uniform1f(loc('u_feather'), cfg.maskFeather);
  gl.uniform1f(loc('u_gain'), cfg.gain);
  gl.uniform1f(loc('u_gamma'), cfg.gamma);

  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const verts = new Float32Array(12);
  const quad = (
    corners: OutputConfig['corners'],
    src: readonly [number, number, number, number],
    shape: SurfaceShape,
    feather: number,
    opacity: number,
  ) => {
    const m = cornerPinMatrix(corners);
    if (!m) return;
    const [x0, y0, x1, y1, x2, y2, x3, y3] = corners;
    verts.set([x0, y0, x1, y1, x2, y2, x0, y0, x2, y2, x3, y3]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts);
    gl.uniformMatrix3fv(loc('u_warp'), false, m);
    gl.uniform4f(loc('u_src'), src[0], src[1], src[2], src[3]);
    gl.uniform1i(loc('u_shape'), { rect: 0, ellipse: 1, triangle: 2, diamond: 3 }[shape]);
    gl.uniform1f(loc('u_shapeFeather'), feather);
    gl.uniform1f(loc('u_opacity'), opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const surfaces = cfg.surfaces ?? [];
  if (surfaces.length === 0) quad(cfg.corners, [0, 0, 1, 1], 'rect', 0, 1);
  else {
    for (const s of surfaces) {
      if (!s.enabled || s.opacity <= 0) continue;
      const placed = composeOntoPin(s.corners, cfg.corners);
      if (placed) quad(placed, s.src, s.shape, s.feather, s.opacity);
    }
  }
  gl.disable(gl.BLEND);

  const drawErr = gl.getError();
  if (drawErr) out.glDrawError = drawErr;
  const pixels = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// ── WebGPU ──────────────────────────────────────────────────────────

async function gpuDraw(device: GPUDevice, cfg: OutputConfig): Promise<{ pixels: Uint8Array; quads: number }> {
  const pack = new UniformPack(OUTPUT_LAYOUT);
  const quads = fillOutputUniforms(pack, cfg, W, H);
  const missing = pack.unset();
  if (missing.length) throw new Error(`uniforms never set: ${missing.join(', ')}`);

  const ubo = device.createBuffer({ size: OUTPUT_LAYOUT.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubo, 0, pack.bytes);

  const scene = device.createTexture({
    label: 'scene', size: [W, H], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: scene }, SCENE, { bytesPerRow: W * 4 }, [W, H]);
  const sampler = device.createSampler({
    magFilter: 'linear', minFilter: 'linear',
    addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
  });

  const module = device.createShaderModule({ code: OUTPUT_WGSL, label: 'output' });
  // Both stages: the quad's corners are uniforms, read by the vertex stage.
  const layout = layoutFromWgsl(device, OUTPUT_WGSL, 'output', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
  const pipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module, entryPoint: 'fs',
      targets: [{
        format: 'rgba8unorm',
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        },
      }],
    },
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
      { binding: 2, resource: scene.createView() },
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
  if (quads > 0) {
    rp.setPipeline(pipeline);
    rp.setBindGroup(0, group);
    rp.draw(6, quads);
  }
  rp.end();
  enc.copyTextureToBuffer({ texture: target }, { buffer: read, bytesPerRow: row }, [W, H]);
  device.queue.submit([enc.finish()]);
  await read.mapAsync(GPUMapMode.READ);
  const padded = new Uint8Array(read.getMappedRange().slice(0));
  read.unmap();
  const pixels = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) pixels.set(padded.subarray(y * row, y * row + W * 4), y * W * 4);
  return { pixels, quads };
}

// ── The comparison ──────────────────────────────────────────────────

/** As the composite's and the camera's: GL comes back bottom row first. */
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
  const cfg = CASES[name];
  if (!cfg) { out.error = `no such case: ${name}`; return done(); }
  out.case = name;

  const gpu = await requestGpu();
  if (isGpuFailure(gpu)) { out.error = `${gpu.failure}: ${gpu.detail}`; return done(); }
  out.adapter = gpu.label;
  const errors: string[] = [];
  gpu.device.addEventListener('uncapturederror', (e) => errors.push(String((e as GPUUncapturedErrorEvent).error?.message ?? e).slice(0, 300)));

  const glPixels = glDraw(cfg);
  const { pixels: gpuPixels, quads } = await gpuDraw(gpu.device, cfg);
  out.quads = quads;
  const mean = (px: Uint8Array) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return +(s / (px.length / 4) / 3).toFixed(2); };
  out.brightness = { webgl: mean(glPixels), webgpu: mean(gpuPixels) };
  out.diff = compare(glPixels, gpuPixels);
  if (errors.length) out.errors = errors.slice(0, 3);
  done();
}

main().catch((e) => { out.error = String((e as Error)?.stack ?? e).slice(0, 600); done(); });
