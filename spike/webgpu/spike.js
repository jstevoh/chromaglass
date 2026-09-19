// P0 spike (docs/webgpu-plan.md): can this browser run ChromaGlass's WebGPU,
// how fast is a solver-shaped workload, and can a WebGPU canvas be read back
// the ways the app reads its canvas (drawImage, captureStream)?
//
//   index.html?grid=256&steps=40[&fallback]
//
// Results go to window.__spike (and the page), with done: true at the end.

const params = new URLSearchParams(location.search);
const GRID = Number(params.get('grid') ?? 256);
const STEPS = Number(params.get('steps') ?? 40);
/** Full-grid passes per solver step: the WebGL solver does about 88 per layer (docs/webgpu-plan.md, the inventory). */
const PASSES = Number(params.get('passes') ?? 88);
const out = { ua: navigator.userAgent, webgpu: !!navigator.gpu, grid: GRID, steps: STEPS, passes: PASSES };
const show = () => { document.getElementById('out').textContent = JSON.stringify(out, null, 2); };
const done = () => { out.done = true; window.__spike = out; show(); };
const errors = (out.errors = []);

const STENCIL = /* wgsl */ `
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let n = textureDimensions(src);
  if (id.x >= n.x || id.y >= n.y) { return; }
  let p = vec2i(id.xy);
  let hi = vec2i(n) - 1;
  let l = textureLoad(src, clamp(p - vec2i(1, 0), vec2i(0), hi), 0).r;
  let r = textureLoad(src, clamp(p + vec2i(1, 0), vec2i(0), hi), 0).r;
  let b = textureLoad(src, clamp(p - vec2i(0, 1), vec2i(0), hi), 0).r;
  let t = textureLoad(src, clamp(p + vec2i(0, 1), vec2i(0), hi), 0).r;
  let c = textureLoad(src, p, 0).r;
  // A Jacobi-shaped update with a source, so the field keeps moving.
  let s = sin(f32(p.x) * 0.05) * cos(f32(p.y) * 0.07) * 0.01;
  textureStore(dst, p, vec4f((l + r + b + t) * 0.25 * 0.999 + c * 0.0005 + s, 0.0, 0.0, 1.0));
}`;

const BLIT = /* wgsl */ `
@group(0) @binding(0) var field: texture_2d<f32>;
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.uv = p[i] * vec2f(0.5, -0.5) + 0.5;
  return o;
}
@fragment fn fs(in: VOut) -> @location(0) vec4f {
  let n = vec2f(textureDimensions(field));
  let v = textureLoad(field, vec2i(clamp(in.uv * n, vec2f(0.0), n - 1.0)), 0).r;
  // A gradient under the field, so the frame is never black.
  return vec4f(0.25 + 0.5 * in.uv.x, 0.2 + abs(v) * 20.0, 0.35 + 0.4 * in.uv.y, 1.0);
}`;

async function main() {
  if (!navigator.gpu) { out.error = 'no navigator.gpu'; return done(); }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: params.has('fallback') });
  if (!adapter) { out.error = 'no adapter'; return done(); }
  const info = adapter.info ?? {};
  out.adapter = {
    vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description,
    fallback: adapter.isFallbackAdapter ?? info.isFallbackAdapter ?? null,
  };
  out.features = [...adapter.features].sort();
  const L = adapter.limits;
  out.limits = {
    maxTextureDimension2D: L.maxTextureDimension2D,
    maxStorageTexturesPerShaderStage: L.maxStorageTexturesPerShaderStage,
    maxComputeWorkgroupStorageSize: L.maxComputeWorkgroupStorageSize,
    maxComputeInvocationsPerWorkgroup: L.maxComputeInvocationsPerWorkgroup,
    maxBufferSize: L.maxBufferSize,
  };
  const timestamps = adapter.features.has('timestamp-query');
  const device = await adapter.requestDevice({ requiredFeatures: timestamps ? ['timestamp-query'] : [] });
  device.addEventListener('uncapturederror', (e) => errors.push(String(e.error?.message ?? e).slice(0, 240)));
  device.lost.then((l) => errors.push(`device lost: ${l.reason} ${l.message}`));

  // ── A solver-shaped workload ────────────────────────────────────────
  const tex = () => device.createTexture({
    size: [GRID, GRID], format: 'r32float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const a = tex(), b = tex();
  const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code: STENCIL }), entryPoint: 'main' } });
  const bg = (from, to) => device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: from.createView() }, { binding: 1, resource: to.createView() }] });
  const ab = bg(a, b), ba = bg(b, a);
  const groups = Math.ceil(GRID / 8);
  let query = null, resolve = null, readback = null;
  if (timestamps) {
    query = device.createQuerySet({ type: 'timestamp', count: 2 });
    resolve = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
    readback = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }
  const step = (timed) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(timed && query ? { timestampWrites: { querySet: query, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : undefined);
    pass.setPipeline(pipeline);
    for (let i = 0; i < PASSES; i++) {
      pass.setBindGroup(0, i % 2 ? ba : ab);
      pass.dispatchWorkgroups(groups, groups);
    }
    pass.end();
    if (timed && query) {
      enc.resolveQuerySet(query, 0, 2, resolve, 0);
      enc.copyBufferToBuffer(resolve, 0, readback, 0, 16);
    }
    device.queue.submit([enc.finish()]);
  };
  // Warm up, then time STEPS steps end to end.
  for (let i = 0; i < 3; i++) step(false);
  await device.queue.onSubmittedWorkDone();
  const t0 = performance.now();
  for (let i = 0; i < STEPS; i++) step(false);
  await device.queue.onSubmittedWorkDone();
  const wall = performance.now() - t0;
  out.solver = { msPerStep: +(wall / STEPS).toFixed(3), stepsPerSec: +(1000 * STEPS / wall).toFixed(1), dispatchesPerStep: PASSES };
  if (query) {
    step(true);
    await device.queue.onSubmittedWorkDone();
    await readback.mapAsync(GPUMapMode.READ);
    const t = new BigInt64Array(readback.getMappedRange().slice(0));
    readback.unmap();
    out.solver.gpuMsPerStep = +(Number(t[1] - t[0]) / 1e6).toFixed(3);
  }

  // ── The canvas, and reading it back ─────────────────────────────────
  const canvas = document.getElementById('gpu');
  const ctx = canvas.getContext('webgpu');
  if (!ctx) { out.canvas = 'no webgpu context'; return done(); }
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  const render = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module: device.createShaderModule({ code: BLIT }), entryPoint: 'vs' },
    fragment: { module: device.createShaderModule({ code: BLIT }), entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });
  const rbg = device.createBindGroup({ layout: render.getBindGroupLayout(0), entries: [{ binding: 0, resource: a.createView() }] });
  const draw = () => {
    step(false);
    const enc = device.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
    pass.setPipeline(render);
    pass.setBindGroup(0, rbg);
    pass.draw(3);
    pass.end();
    device.queue.submit([enc.finish()]);
  };
  const meanOf = () => {
    const c2 = document.createElement('canvas');
    c2.width = 48; c2.height = 27;
    const g = c2.getContext('2d', { willReadFrequently: true });
    g.drawImage(canvas, 0, 0, 48, 27);
    const px = g.getImageData(0, 0, 48, 27).data;
    let s = 0;
    for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2];
    return +(s / (px.length / 4) / 3 / 255).toFixed(3);
  };
  out.format = format;
  draw();
  out.drawImageSameTask = meanOf();
  await new Promise((r) => requestAnimationFrame(() => r()));
  await new Promise((r) => requestAnimationFrame(() => r()));
  out.drawImageLater = meanOf();

  // captureStream + MediaRecorder, drawing every frame for a second.
  try {
    const stream = canvas.captureStream(30);
    const mime = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start(250);
    const t1 = performance.now();
    let frames = 0;
    await new Promise((r) => {
      const tick = () => { draw(); frames++; if (performance.now() - t1 < 1200) requestAnimationFrame(tick); else r(); };
      requestAnimationFrame(tick);
    });
    rec.stop();
    await stopped;
    const blob = new Blob(chunks);
    out.captureStream = { mime: rec.mimeType, bytes: blob.size, frames, fps: +(frames / 1.2).toFixed(1) };
  } catch (e) {
    out.captureStream = { error: String(e?.message ?? e) };
  }
  return done();
}

main().catch((e) => { out.error = String(e?.stack ?? e).slice(0, 400); done(); });
