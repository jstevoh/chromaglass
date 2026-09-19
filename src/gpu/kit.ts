/**
 * The small kit everything on WebGPU is built from (docs/webgpu-plan.md, P1):
 * pipelines cached by name, ping-pong textures, a readback ring, per-pass GPU
 * timings, one place that frees what was made, and error scopes under ?debug.
 *
 * Raw WebGPU, no framework. Each piece is small on purpose: the solver and
 * the compositor (P2, P3) are where the work is, and they should read as the
 * physics, not as plumbing.
 */

// ── Freeing what was made ────────────────────────────────────────────

type Destroyable = { destroy(): void };

/**
 * Everything a stage allocates, freed in one call. Textures, buffers and
 * query sets hold GPU memory until destroyed; pipelines and bind groups are
 * collected with their last reference.
 */
export class Disposer {
  private readonly items = new Set<Destroyable>();
  track<T extends Destroyable>(item: T): T { this.items.add(item); return item; }
  release(item: Destroyable): void { if (this.items.delete(item)) item.destroy(); }
  dispose(): void { for (const i of this.items) i.destroy(); this.items.clear(); }
}

// ── Pipelines ────────────────────────────────────────────────────────

/**
 * Compute and render pipelines, built once per name. Shader modules are
 * shared by source, so two pipelines from one WGSL file compile it once.
 */
export class PipelineCache {
  private readonly modules = new Map<string, GPUShaderModule>();
  private readonly compute = new Map<string, GPUComputePipeline>();
  private readonly render = new Map<string, GPURenderPipeline>();
  constructor(private readonly device: GPUDevice) {}

  module(code: string, label?: string): GPUShaderModule {
    let m = this.modules.get(code);
    if (!m) { m = this.device.createShaderModule({ code, label }); this.modules.set(code, m); }
    return m;
  }

  /**
   * A compute pipeline, with its bind group layout read from the shader's own
   * `@binding` declarations rather than inferred.
   *
   * Not `layout: 'auto'`: that drops any binding the shader does not happen to
   * use, so a pass that ignores one of its uniforms (a fill, say) refuses the
   * bind group every one of its siblings takes. The declarations are the
   * truth, and they are right there in the source.
   */
  computePipeline(name: string, code: string, entryPoint = 'main'): GPUComputePipeline {
    let p = this.compute.get(name);
    if (!p) {
      const layout = this.device.createPipelineLayout({ label: name, bindGroupLayouts: [layoutFromWgsl(this.device, code, name)] });
      p = this.device.createComputePipeline({ label: name, layout, compute: { module: this.module(code, name), entryPoint } });
      this.compute.set(name, p);
    }
    return p;
  }

  renderPipeline(name: string, make: (module: (code: string) => GPUShaderModule) => GPURenderPipelineDescriptor): GPURenderPipeline {
    let p = this.render.get(name);
    if (!p) { p = this.device.createRenderPipeline({ label: name, ...make((code) => this.module(code, name)) }); this.render.set(name, p); }
    return p;
  }
}

/**
 * The bind group layout a WGSL source describes, from its `@group(0)
 * @binding(n)` declarations: uniforms, sampled textures (filterable only
 * where the shader samples them through a sampler), storage textures with
 * their format, and samplers.
 */
export function layoutFromWgsl(device: GPUDevice, code: string, label?: string): GPUBindGroupLayout {
  const entries: GPUBindGroupLayoutEntry[] = [];
  const re = /@group\(0\)\s*@binding\((\d+)\)\s*var(?:<(\w+)(?:,\s*\w+)?>)?\s+(\w+)\s*:\s*([^;]+);/g;
  for (const m of code.matchAll(re)) {
    const binding = Number(m[1]);
    const space = m[2];
    const name = m[3];
    const type = m[4].trim();
    const visibility = GPUShaderStage.COMPUTE;
    if (space === 'uniform') entries.push({ binding, visibility, buffer: { type: 'uniform' } });
    else if (space === 'storage') {
      const writable = /read_write/.test(m[0]);
      entries.push({ binding, visibility, buffer: { type: writable ? 'storage' : 'read-only-storage' } });
    }
    else if (type.startsWith('texture_storage_2d')) {
      const format = type.slice(type.indexOf('<') + 1).split(',')[0].trim() as GPUTextureFormat;
      entries.push({ binding, visibility, storageTexture: { access: 'write-only', format } });
    } else if (type.startsWith('texture_2d')) {
      const sampled = new RegExp(`textureSampleLevel\\(\\s*${name}\\b`).test(code);
      entries.push({ binding, visibility, texture: { sampleType: sampled ? 'float' : 'unfilterable-float' } });
    } else if (type === 'sampler') entries.push({ binding, visibility, sampler: { type: 'filtering' } });
  }
  return device.createBindGroupLayout({ label, entries });
}

/** A bind group for a pipeline's group 0 from resources in binding order: buffers, textures (their default view), samplers or views. */
export function bindGroup(
  device: GPUDevice,
  pipeline: GPUComputePipeline | GPURenderPipeline,
  resources: (GPUBuffer | GPUTexture | GPUTextureView | GPUSampler)[],
  group = 0,
): GPUBindGroup {
  return device.createBindGroup({
    layout: pipeline.getBindGroupLayout(group),
    entries: resources.map((r, binding) => ({
      binding,
      resource: r instanceof GPUBuffer ? { buffer: r } : r instanceof GPUTexture ? r.createView() : r,
    })),
  });
}

// ── Textures ─────────────────────────────────────────────────────────

export const FIELD_USAGE = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST;

/**
 * A float texture, read straight out, waiting for the GPU. For harnesses and
 * self-tests — the show never stalls like this.
 *
 * `channels` is how many floats a texel holds (2 for rg32float, 4 for
 * rgba32float); the rows come back packed, without the copy's 256-byte
 * padding.
 */
export async function readTextureF32(device: GPUDevice, tex: GPUTexture, channels: 2 | 4): Promise<Float32Array> {
  const w = tex.width, h = tex.height;
  const row = Math.ceil((w * channels * 4) / 256) * 256;
  const buf = device.createBuffer({ label: `read ${tex.label}`, size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = device.createCommandEncoder({ label: `read ${tex.label}` });
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
  device.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const padded = new Float32Array(buf.getMappedRange().slice(0));
  buf.unmap();
  buf.destroy();
  const out = new Float32Array(w * h * channels);
  const stride = row / 4;
  for (let y = 0; y < h; y++) out.set(padded.subarray(y * stride, y * stride + w * channels), y * w * channels);
  return out;
}

/** Two textures of one format, read one and write the other, then swap. */
export class PingPong {
  private flip = false;
  readonly a: GPUTexture;
  readonly b: GPUTexture;
  constructor(device: GPUDevice, disposer: Disposer, readonly size: [number, number], readonly format: GPUTextureFormat, label: string, usage = FIELD_USAGE) {
    this.a = disposer.track(device.createTexture({ label: `${label} a`, size, format, usage }));
    this.b = disposer.track(device.createTexture({ label: `${label} b`, size, format, usage }));
  }
  get read(): GPUTexture { return this.flip ? this.b : this.a; }
  get write(): GPUTexture { return this.flip ? this.a : this.b; }
  swap(): void { this.flip = !this.flip; }
  /** Which of the two is read now: for choosing between bind groups made once for each way round. */
  get parity(): 0 | 1 { return this.flip ? 1 : 0; }
}

// ── Readback ─────────────────────────────────────────────────────────

/**
 * Small results back to the CPU without a stall: a few buffers in rotation,
 * each copied into and mapped asynchronously, the newest landed one kept. A
 * frame or more late, as the WebGL path's fenced reads were.
 */
export class ReadbackRing {
  private readonly slots: { buf: GPUBuffer; busy: boolean; seq: number }[];
  private seq = 0;
  private landedSeq = -1;
  private data: ArrayBuffer | null = null;
  constructor(device: GPUDevice, disposer: Disposer, readonly bytes: number, count = 3, label = 'readback') {
    this.slots = Array.from({ length: count }, (_, i) => ({
      buf: disposer.track(device.createBuffer({ label: `${label} ${i}`, size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })),
      busy: false,
      seq: 0,
    }));
  }

  /** Copy `src` into a free slot as part of `encoder`; false when every slot is still in flight (skip this frame). */
  copyFrom(encoder: GPUCommandEncoder, src: GPUBuffer, offset = 0): GPUBuffer | null {
    const slot = this.slots.find((s) => !s.busy);
    if (!slot) return null;
    encoder.copyBufferToBuffer(src, offset, slot.buf, 0, this.bytes);
    slot.busy = true;
    slot.seq = ++this.seq;
    return slot.buf;
  }

  /** After the submit: map the slot `copyFrom` returned, keeping its data if it is the newest to land. */
  collect(buf: GPUBuffer): void {
    const slot = this.slots.find((s) => s.buf === buf);
    if (!slot) return;
    buf.mapAsync(GPUMapMode.READ).then(() => {
      if (slot.seq > this.landedSeq) { this.data = buf.getMappedRange().slice(0); this.landedSeq = slot.seq; }
      buf.unmap();
      slot.busy = false;
    }, () => { slot.busy = false; });
  }

  /** The newest data that has come back, or null before the first. */
  get latest(): ArrayBuffer | null { return this.data; }
}

// ── GPU timings ──────────────────────────────────────────────────────

/**
 * Real GPU time per labelled pass, from timestamp queries, where the device
 * has them. The WebGL path's timer queries counted queue waits on ANGLE and
 * lied; these are the governor's future input and the effects' cost badges.
 */
export class GpuProfiler {
  private readonly query: GPUQuerySet | null;
  private readonly resolve: GPUBuffer | null;
  private readonly ring: ReadbackRing | null;
  private labels: string[] = [];
  private pending: { buf: GPUBuffer; labels: string[] } | null = null;
  /** Smoothed milliseconds per label. */
  readonly ms = new Map<string, number>();
  constructor(private readonly device: GPUDevice, disposer: Disposer, readonly enabled: boolean, readonly capacity = 32) {
    this.query = enabled ? disposer.track(device.createQuerySet({ type: 'timestamp', count: capacity * 2 })) : null;
    this.resolve = enabled ? disposer.track(device.createBuffer({ size: capacity * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC })) : null;
    this.ring = enabled ? new ReadbackRing(device, disposer, capacity * 16, 3, 'timestamps') : null;
  }

  /** The timestampWrites for one pass, or undefined when timing is off or full this frame. */
  pass(label: string): GPUComputePassTimestampWrites | undefined {
    if (!this.query || this.labels.length >= this.capacity) return undefined;
    const i = this.labels.length;
    this.labels.push(label);
    return { querySet: this.query, beginningOfPassWriteIndex: i * 2, endOfPassWriteIndex: i * 2 + 1 };
  }

  /** At the end of the frame's encoding: resolve what was written this frame. */
  resolveInto(encoder: GPUCommandEncoder): void {
    if (!this.query || !this.resolve || !this.ring || !this.labels.length) { this.labels = []; return; }
    encoder.resolveQuerySet(this.query, 0, this.labels.length * 2, this.resolve, 0);
    const buf = this.ring.copyFrom(encoder, this.resolve);
    this.pending = buf ? { buf, labels: this.labels } : null;
    this.labels = [];
  }

  /** After the submit: start the read, and fold in whatever frame last came back. */
  afterSubmit(): void {
    if (this.pending && this.ring) { this.ring.collect(this.pending.buf); this.lastLabels = this.pending.labels; this.pending = null; }
    const data = this.ring?.latest;
    if (!data || !this.lastLabels.length) return;
    const t = new BigInt64Array(data);
    this.lastLabels.forEach((label, i) => {
      const ms = Number(t[i * 2 + 1] - t[i * 2]) / 1e6;
      if (!(ms >= 0 && ms < 1000)) return;
      const prev = this.ms.get(label);
      this.ms.set(label, prev === undefined ? ms : prev + (ms - prev) * 0.1);
    });
  }
  private lastLabels: string[] = [];
}

// ── Errors ───────────────────────────────────────────────────────────

/**
 * Under ?debug, a validation scope around `fn`, logged with its label: the
 * uncaptured-error event says something failed, a scope says where.
 */
export async function scoped<T>(device: GPUDevice, label: string, fn: () => T, debug: boolean): Promise<T> {
  if (!debug) return fn();
  device.pushErrorScope('validation');
  const out = fn();
  const err = await device.popErrorScope();
  if (err) console.error(`WebGPU validation error in ${label}:`, err.message);
  return out;
}
