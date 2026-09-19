/**
 * The composite, both ways, compared (docs/webgpu-plan.md, P3's gate).
 *
 * `composite.html?case=derive` compiles the GLSL from `lib/plateShader.ts` and
 * the WGSL from `gpu/wgsl/plate.ts`, gives them the same textures and the same
 * uniforms, draws both, and reads both back. `scripts/composite.mjs` drives it
 * and judges the difference.
 *
 * The inputs are made here rather than taken from a running show, so a case is
 * the same picture every time and on every machine. They are RGBA8 either way:
 * the point of the check is the translation of the shader, not the precision
 * of what it is fed.
 */

import { PLATE_FRAG, PLATE_VERT } from '../lib/plateShader';
import { DERIVE_WGSL } from './wgsl/plate';
import { PLATE_LAYOUT } from './wgsl/plateFields';
import { UniformPack } from './uniforms';
import { isGpuFailure, requestGpu } from './device';
import { layoutFromWgsl } from './kit';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 512);
const H = Number(q.get('h') ?? 512);
const GRID = 192;
const out: Record<string, unknown> = { w: W, h: H };
const done = () => {
  (window as unknown as { __composite: unknown }).__composite = { ...out, done: true };
  document.body.textContent = JSON.stringify(out, null, 2);
};

// ── The inputs ──────────────────────────────────────────────────────

/**
 * A plate, packed the way the app packs one: sqrt-encoded density in alpha,
 * log-space absorptions in rgb. Three blobs of dye and a gradient, so there
 * are edges, interfaces and empty glass in the frame.
 */
function plateTexture(size: number, seed = 1): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const blobs = [
    { x: 0.35, y: 0.45, r: 0.22, c: [1.0, 0.25, 0.12] },
    { x: 0.62, y: 0.52, r: 0.26, c: [0.15, 0.4, 1.0] },
    { x: 0.5, y: 0.74, r: 0.15, c: [0.95, 0.85, 0.1] },
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let density = 0;
      let absR = 0, absG = 0, absB = 0;
      for (const b of blobs) {
        const d = Math.hypot(u - b.x, v - b.y) / b.r;
        if (d > 1) continue;
        const w = Math.pow(1 - d * d, 1.5) * (1.1 + 0.35 * Math.sin(seed * 9.1 + u * 31 + v * 27));
        density += w;
        const eps = 0.002;
        absR += w * -Math.log(Math.max(eps, b.c[0]));
        absG += w * -Math.log(Math.max(eps, b.c[1]));
        absB += w * -Math.log(Math.max(eps, b.c[2]));
      }
      // As the packing loop does it: density sqrt-encoded over a scale of 8.
      const i = (y * size + x) * 4;
      const enc = (a: number) => Math.max(0, Math.min(255, Math.round(Math.sqrt(Math.max(0, a) / 8) * 255)));
      data[i] = enc(absR); data[i + 1] = enc(absG); data[i + 2] = enc(absB); data[i + 3] = enc(density);
    }
  }
  return data;
}

/** A field of signed values in rg, as the velocity textures carry. */
function velTexture(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
    const r = Math.hypot(u, v) + 1e-4;
    const i = (y * size + x) * 4;
    data[i] = Math.round((0.5 - (v / r) * 0.35) * 255);
    data[i + 1] = Math.round((0.5 + (u / r) * 0.35) * 255);
    data[i + 2] = 128; data[i + 3] = 255;
  }
  return data;
}

/** Flat grey with a few marks, for film, mark and bead textures. */
function patternTexture(size: number, seed: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const u = x / size, v = y / size;
    const s = 0.5 + 0.5 * Math.sin(seed + u * 17.0) * Math.cos(seed * 1.7 + v * 13.0);
    data[i] = Math.round(s * 255);
    data[i + 1] = Math.round((1 - s) * 200 + 30);
    data[i + 2] = Math.round(120 + 100 * Math.sin(seed * 3 + (u + v) * 9));
    data[i + 3] = 255;
  }
  return data;
}

const SOURCES: Record<string, { size: number; data: Uint8Array }> = {
  layer0: { size: GRID, data: plateTexture(GRID, 1) },
  layer1: { size: GRID, data: plateTexture(GRID, 2) },
  derived0: { size: GRID, data: patternTexture(GRID, 0.7) },
  derived1: { size: GRID, data: patternTexture(GRID, 1.3) },
  vel0: { size: GRID, data: velTexture(GRID) },
  vel1: { size: GRID, data: velTexture(GRID) },
  grain0: { size: GRID, data: patternTexture(GRID, 2.1) },
  grain1: { size: GRID, data: patternTexture(GRID, 2.9) },
  film: { size: 128, data: patternTexture(128, 4.2) },
  mark: { size: 128, data: patternTexture(128, 5.5) },
  beadTex: { size: 256, data: patternTexture(256, 6.1) },
  src: { size: GRID, data: plateTexture(GRID, 1) },
};

// ── What the shaders are told ───────────────────────────────────────

/**
 * Every uniform, at the value a quiet plate would have: the effects off, so a
 * case can turn on the one thing it is about. Names are the WGSL's (the GLSL's
 * with `u_` dropped).
 */
const BASE: Record<string, number[]> = {
  resolution: [W, H],
  gridSize: [GRID], logicalGrid: [GRID],
  time: [3.5], dimmer: [1], saturation: [1], transmission: [0.6],
  derivedOn: [1], bspline: [0], layerCount: [1], finishInMain: [1],
  rotation0: [0], rotation1: [0], layerZoom1: [1], layerDrift1: [0, 0],
  camCenter: [0.5, 0.5], camZoom: [1],
  lamp: [0.5, 0.5, 0.55, 0.3], lamp2: [0.5, 0.5, 0.45, 0],
  lampWarmth: [0.5], lightPlay: [0], iridescence: [0], glossiness: [0.3], thinFilm: [0],
  boundaryContrast: [0.12], edgeRelief: [0], gooey: [0], postBlur: [0.35],
  cells: [0], beads: [0], droplets: [0], lacing: [0], granulation: [0],
  grainOn: [0], grainMix: [0], grainScale: [110],
  macroOn: [0], macroCells: [0], macroCellScale: [1], macroDepth: [0], macroEdge: [0],
  macroLacing: [0], macroRelief: [0], flowRate: [0],
  filmLevel: [0], filmGain: [1], filmMix: [0], filmKey: [0.18], filmOn: [0], filmScale: [1, 1],
  exposure: [0], photo: [0], dish: [0], dishSpread: [0],
  kaleido: [0], kaleidoPhase: [0], kaleidoZoom: [0.72],
  lumia: [0], lumiaA: [1, 0.6, 0.2], lumiaB: [0.2, 0.5, 1],
  gelWheel: [0], gelAngle: [0], gel0: [1, 0.3, 0.2], gel1: [0.2, 1, 0.4], gel2: [0.3, 0.4, 1], gel3: [1, 0.9, 0.3],
  ledPlatform: [0], ledMode: [0], ledColor: [1, 1, 1], ledAngle: [0],
  blendMode: [0], darkBlend: [0], cameraOn: [0],
  markOn: [0], markRect: [0.5, 0.5, 0.2, 0.1],
  paperA: [0.93, 0.9, 0.85], paperB: [0.8, 0.78, 0.74],
  bubbleCount: [0], bubbleStrength: [0.5],
  bubbles: new Array(40 * 4).fill(0), bubbleShape: new Array(40 * 4).fill(0),
};

const CASES: Record<string, Record<string, number[]>> = {
  derive: {},
  'derive-boundary': { boundaryContrast: [0.4] },
  'derive-bspline': { bspline: [1] },
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
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, PLATE_VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, PLATE_FRAG.replace('#version 300 es\n', '#version 300 es\n#define DERIVE_PASS\n')));
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

  // The textures, in the units the shader's samplers are told about.
  let unit = 0;
  for (const [name, src] of Object.entries(SOURCES)) {
    const loc = gl.getUniformLocation(prog, `u_${name}`);
    if (loc === null) continue;
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, src.size, src.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, src.data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(loc, unit);
    unit++;
  }

  // The uniforms, by the table's own types.
  for (const f of PLATE_LAYOUT.fields) {
    const loc = gl.getUniformLocation(prog, f.glsl ?? `u_${f.name}`);
    if (loc === null) continue;
    const v = values[f.name];
    if (!v) throw new Error(`no value for u_${f.name}`);
    if (f.count > 1) gl.uniform4fv(loc, new Float32Array(v));
    else if (f.type === 'i32') gl.uniform1i(loc, v[0]);
    else if (f.type === 'f32') gl.uniform1f(loc, v[0]);
    else if (f.type === 'vec2f') gl.uniform2f(loc, v[0], v[1]);
    else if (f.type === 'vec3f') gl.uniform3f(loc, v[0], v[1], v[2]);
    else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
  }

  gl.viewport(0, 0, W, H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  const pixels = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return pixels;
}

// ── WebGPU ──────────────────────────────────────────────────────────

async function gpuDraw(device: GPUDevice, values: Record<string, number[]>): Promise<Uint8Array> {
  const pack = new UniformPack(PLATE_LAYOUT);
  for (const [name, v] of Object.entries(values)) pack.set(name, ...v);
  const missing = pack.unset();
  if (missing.length) throw new Error(`uniforms never set: ${missing.slice(0, 6).join(', ')}`);

  const ubo = device.createBuffer({ size: PLATE_LAYOUT.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(ubo, 0, pack.bytes);

  const src = SOURCES.src;
  const tex = device.createTexture({
    size: [src.size, src.size], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tex }, src.data, { bytesPerRow: src.size * 4 }, [src.size, src.size]);
  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  const module = device.createShaderModule({ code: DERIVE_WGSL, label: 'derive' });
  const layout = layoutFromWgsl(device, DERIVE_WGSL, 'derive', GPUShaderStage.FRAGMENT);
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
      { binding: 2, resource: tex.createView() },
    ],
  });

  const row = Math.ceil((W * 4) / 256) * 256;
  const read = device.createBuffer({ size: row * H, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({
    colorAttachments: [{ view: target.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, group);
  pass.draw(6);
  pass.end();
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
 * How far apart two frames are. The GL frame comes back bottom row first and
 * the WGSL's shader flips its own uv to match, so the rows line up as they
 * are.
 */
function compare(a: Uint8Array, b: Uint8Array) {
  let worst = 0, sum = 0, over2 = 0, over8 = 0, lit = 0;
  for (let i = 0; i < a.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a[i + c] - b[i + c]);
      if (d > worst) worst = d;
      sum += d;
      if (d > 2) over2++;
      if (d > 8) over8++;
    }
    if (a[i] > 4 || a[i + 1] > 4 || a[i + 2] > 4) lit++;
  }
  const n = (a.length / 4) * 3;
  return {
    worst, mean: +(sum / n).toFixed(4),
    over2: +(over2 / n).toFixed(5), over8: +(over8 / n).toFixed(5),
    litFraction: +(lit / (a.length / 4)).toFixed(3),
  };
}

async function main() {
  const name = q.get('case') ?? 'derive';
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
  out.diff = compare(glPixels, gpuPixels);
  if (errors.length) out.errors = errors.slice(0, 3);
  done();
}

main().catch((e) => { out.error = String((e as Error)?.stack ?? e).slice(0, 600); done(); });
