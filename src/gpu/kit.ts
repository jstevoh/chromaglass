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

type Pipelines = {
  /** By name (and entry point), then by source. */
  compute: Map<string, Map<string, GPUComputePipeline>>;
  /** By name alone: the descriptor is only built on a miss. */
  render: Map<string, GPURenderPipeline>;
};

/**
 * One set of pipelines per device, shared by everything drawing on it (S4,
 * docs/stability-plan.md).
 *
 * Every solver used to build its own cache, so a rung change — a new
 * `WebGPUFluid`, and with it new particles and air — compiled every shader
 * over again: a CPU and driver spike landing on the same frame as the memory
 * swap, for pipelines identical to the ones just thrown away. Only the grid
 * had changed, and the grid is in the uniforms, not the shaders. Now the new
 * solver finds the old one's pipelines waiting.
 *
 * A WeakMap so the pipelines go with their device: a lost device's are no
 * use to its replacement, and nothing here should keep it alive. Nothing
 * ever empties a store either. Pipelines hold nothing a `destroy()` would
 * free (WebGPU has none for them), and a solver disposed mid-show must not
 * take its successor's pipelines with it.
 */
const shared = new WeakMap<GPUDevice, { modules: Map<string, GPUShaderModule>; scopes: Map<string, Pipelines>; index: number }>();

/**
 * How the show's pipelines came to be built, on every device this page has
 * had: ahead of the show, off the frame (`prepareCompute`, `prepareRender`),
 * or on a frame that needed one it did not have.
 *
 * The second kind is what froze the opening of every show on a fresh Mac.
 * A pipeline asked for with `createComputePipeline` is handed back at once,
 * but the GPU process compiles it before it does anything else, presenting
 * frames included; the solver's first step asked for forty-odd of them, and
 * on a runner whose Metal shader cache was cold the plate stopped for nine
 * seconds with no animation frame at all (`npm run depth`, run 36243996678,
 * "from load: longest stretch without a step"). A pipeline built ahead is
 * compiled by the async path, which is the one WebGPU lets an implementation
 * do off the thread that presents.
 *
 * So every build on a frame is written down, by scope, name and device, and
 * `npm run startup` fails if a show's opening made any: that is the lists in
 * `gpu/prepare.ts` falling behind what the show actually draws with.
 *
 * One ledger for the page and not one per device. It was per device, and a
 * harness reading the current device's missed everything the devices before
 * it had built: in a cloud session, where software WebGPU loses its device
 * every few seconds, a pipeline dropped from the lists was built on six
 * devices and the ledger showed one of them, 49 s in.
 */
export type PipelineLedger = {
  /** Devices that have had pipelines, numbered from 1 in the order they asked. */
  devices: number;
  /** Built ahead and ready. */
  ahead: number;
  /** Built on a frame, in order: `scope/name`, when (ms since the page began) and on which device. */
  onFrame: { name: string; at: number; device: number }[];
};

const ledger: PipelineLedger = { devices: 0, ahead: 0, onFrame: [] };

function deviceStore(device: GPUDevice) {
  let dev = shared.get(device);
  if (!dev) { dev = { modules: new Map(), scopes: new Map(), index: ++ledger.devices }; shared.set(device, dev); }
  return dev;
}

/**
 * Compute and render pipelines, built once per name. Shader modules are
 * shared by source, so two pipelines from one WGSL file compile it once.
 *
 * `new PipelineCache(device)` is a private cache, for the self-tests, which
 * want to see a pipeline built; the show asks `PipelineCache.for` for the
 * device's shared one.
 */
export class PipelineCache {
  private readonly modules: Map<string, GPUShaderModule>;
  private readonly compute: Pipelines['compute'];
  private readonly render: Pipelines['render'];
  private readonly ledger: PipelineLedger | null;
  private readonly scope: string;
  private readonly deviceIndex: number;
  constructor(
    private readonly device: GPUDevice,
    store: { modules: Map<string, GPUShaderModule>; scope?: string; device?: number } & Pipelines = { modules: new Map(), compute: new Map(), render: new Map() },
  ) {
    this.modules = store.modules;
    this.compute = store.compute;
    this.render = store.render;
    // A private cache (the self-tests') is nobody's show, and stays off the ledger.
    this.ledger = store.device ? ledger : null;
    this.scope = store.scope ?? '';
    this.deviceIndex = store.device ?? 0;
  }

  /** How the page's shared pipelines were built (see `PipelineLedger`). */
  static ledger(): PipelineLedger {
    return ledger;
  }

  /**
   * The device's shared cache, under `scope` — one per owning class.
   *
   * Scoped because a shared cache is only as safe as its keys. Names were
   * picked file by file, for a cache that file had to itself — the plate's
   * `derive`, the probe's `solid` — and nothing stops two files choosing the
   * same one for different pipelines. A render pipeline can be told apart by
   * nothing but its name, since its descriptor is only made on a miss, so
   * each owner gets names of its own and two owners cannot collide. Within a
   * scope the rule is the one each owner already kept across its own calls:
   * the name says everything that shapes the pipeline, the target format
   * included. Now it has to hold across instances too, which it does for
   * everything that shares (the formats that vary are in the names).
   *
   * Shader modules stay shared across scopes. They are keyed by their
   * source, which cannot collide.
   */
  static for(device: GPUDevice, scope: string): PipelineCache {
    const dev = deviceStore(device);
    let pipes = dev.scopes.get(scope);
    if (!pipes) { pipes = { compute: new Map(), render: new Map() }; dev.scopes.set(scope, pipes); }
    return new PipelineCache(device, { modules: dev.modules, scope, device: dev.index, ...pipes });
  }

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
   *
   * Keyed by the name, the entry point and the source, not the name alone.
   * Here the source is in hand, so a name two callers gave different shaders
   * gets two pipelines rather than whichever was built first; and one file
   * with two entry points (the pressure self-test's) gets both.
   */
  computePipeline(name: string, code: string, entryPoint = 'main'): GPUComputePipeline {
    const bySource = this.computeSlot(name, entryPoint);
    let p = bySource.get(code);
    if (!p) {
      p = this.device.createComputePipeline(this.computeDescriptor(name, code, entryPoint));
      bySource.set(code, p);
      this.onFrame(name);
    }
    return p;
  }

  renderPipeline(name: string, make: RenderRecipe): GPURenderPipeline {
    let p = this.render.get(name);
    if (!p) {
      p = this.device.createRenderPipeline({ label: name, ...make((code) => this.module(code, name)) });
      this.render.set(name, p);
      this.onFrame(name);
    }
    return p;
  }

  /**
   * The same pipeline `computePipeline` would build, built ahead with
   * `createComputePipelineAsync` and left in the slot it would look in, so
   * the frame that first asks finds it waiting.
   *
   * It never throws. A pipeline that will not build ahead (a validation
   * error, a device lost mid-way) is left for the frame to build the old way,
   * which is also where its error is reported the way every other one is.
   */
  async prepareCompute(name: string, code: string, entryPoint = 'main'): Promise<void> {
    const bySource = this.computeSlot(name, entryPoint);
    if (bySource.has(code)) return;
    try {
      const p = await this.device.createComputePipelineAsync(this.computeDescriptor(name, code, entryPoint));
      if (bySource.has(code)) return;
      bySource.set(code, p);
      if (this.ledger) this.ledger.ahead++;
    } catch { /* built on the frame instead (above) */ }
  }

  /** `renderPipeline`'s, ahead: see `prepareCompute`. */
  async prepareRender(name: string, make: RenderRecipe): Promise<void> {
    if (this.render.has(name)) return;
    try {
      const p = await this.device.createRenderPipelineAsync({ label: name, ...make((code) => this.module(code, name)) });
      if (this.render.has(name)) return;
      this.render.set(name, p);
      if (this.ledger) this.ledger.ahead++;
    } catch { /* built on the frame instead */ }
  }

  private computeSlot(name: string, entryPoint: string): Map<string, GPUComputePipeline> {
    const key = entryPoint === 'main' ? name : `${name}@${entryPoint}`;
    let bySource = this.compute.get(key);
    if (!bySource) { bySource = new Map(); this.compute.set(key, bySource); }
    return bySource;
  }

  private computeDescriptor(name: string, code: string, entryPoint: string): GPUComputePipelineDescriptor {
    const layout = this.device.createPipelineLayout({ label: name, bindGroupLayouts: [layoutFromWgsl(this.device, code, name)] });
    return { label: name, layout, compute: { module: this.module(code, name), entryPoint } };
  }

  private onFrame(name: string): void {
    this.ledger?.onFrame.push({ name: `${this.scope}/${name}`, at: Math.round(performance.now()), device: this.deviceIndex });
  }
}

/** A render pipeline's descriptor, given a way to get a shader module for a source. */
export type RenderRecipe = (module: (code: string) => GPUShaderModule) => GPURenderPipelineDescriptor;

/**
 * The bind group layout a WGSL source describes, from its `@group(0)
 * @binding(n)` declarations: uniforms, sampled textures (filterable only
 * where the shader samples them through a sampler), storage textures with
 * their format, and samplers.
 */
export function layoutFromWgsl(device: GPUDevice, code: string, label?: string, stage = GPUShaderStage.COMPUTE): GPUBindGroupLayout {
  const entries: GPUBindGroupLayoutEntry[] = [];
  const re = /@group\(0\)\s*@binding\((\d+)\)\s*var(?:<(\w+)(?:,\s*\w+)?>)?\s+(\w+)\s*:\s*([^;]+);/g;
  for (const m of code.matchAll(re)) {
    const binding = Number(m[1]);
    const space = m[2];
    const name = m[3];
    const type = m[4].trim();
    const visibility = stage;
    if (space === 'uniform') entries.push({ binding, visibility, buffer: { type: 'uniform' } });
    else if (space === 'storage') {
      const writable = /read_write/.test(m[0]);
      entries.push({ binding, visibility, buffer: { type: writable ? 'storage' : 'read-only-storage' } });
    }
    else if (type.startsWith('texture_storage_2d')) {
      const format = type.slice(type.indexOf('<') + 1).split(',')[0].trim() as GPUTextureFormat;
      entries.push({ binding, visibility, storageTexture: { access: 'write-only', format } });
    } else if (type.startsWith('texture_2d_array')) {
      // The history ring is a stack of frames, and `texture_2d` is a prefix of
      // `texture_2d_array`: matched the other way round, the layout asks for a
      // flat texture and the entry point does not match it.
      entries.push({ binding, visibility, texture: { sampleType: 'float', viewDimension: '2d-array' } });
    } else if (/^texture_2d\s*<\s*[ui]32\s*>/.test(type)) {
      // Integer textures are read with textureLoad, never sampled, and the
      // layout has to say which kind of integer they hold.
      entries.push({ binding, visibility, texture: { sampleType: /u32/.test(type) ? 'uint' : 'sint' } });
    } else if (type.startsWith('texture_2d')) {
      // Is it read through the sampler? A compute pass usually names the
      // texture at the sample site, so the regex can tell. A fragment shader
      // hands its textures to helper functions, where no regex can follow, so
      // there every texture is taken to be sampled — and they are: the plate
      // is drawn by sampling it.
      const sampled = stage === GPUShaderStage.FRAGMENT
        || new RegExp(`textureSample(Level)?\\(\\s*${name}\\b`).test(code);
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

  /** The newest copy asked for: a reading is of the GPU as of its copy (see `landed`). */
  get issued(): number { return this.seq; }

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
      // Free the slot whatever happens: a slot left busy is a readback that
      // never comes back, and with two or three of them that is the flash
      // guard and the dye readback stopped for the rest of the show.
      try {
        if (slot.seq > this.landedSeq) {
          // Into the ring's one buffer, made on the first landing — and only
          // published once the copy is done, so a mapping that throws on the
          // first read leaves `latest` null rather than a buffer of zeros
          // that looks like an empty plate.
          const mapped = new Uint8Array(buf.getMappedRange());
          const into = this.data ?? new ArrayBuffer(this.bytes);
          new Uint8Array(into).set(mapped);
          this.data = into;
          this.landedSeq = slot.seq;
        }
      } finally {
        try { buf.unmap(); } catch { /* destroyed under it */ }
        slot.busy = false;
      }
    }, () => { slot.busy = false; });
  }

  /**
   * The newest data that has come back, or null before the first.
   *
   * One buffer for the life of the ring, overwritten in place as each read
   * lands (S5, docs/stability-plan.md). It was a fresh `slice` per landing:
   * ~590 KB a field, two fields a layer, every frame, which is ~70 MB/s of
   * garbage a layer and a collector that never gets to rest.
   *
   * So what this returns is a window, not a snapshot. It changes only in the
   * mapping callback, which cannot run in the middle of anyone's synchronous
   * code, so reading it through in the task that asked is safe — and every
   * reader does just that: the solver copies the fields out into `rbDye` and
   * `rbVel`, and the stats, the probe, the profiler and the self-test read
   * their few numbers and let go. A reader that wants the data past an
   * `await` or into the next frame copies it.
   */
  get latest(): ArrayBuffer | null { return this.data; }

  /** Which copy the newest data came from: it rises each time a fresh one lands. */
  get landed(): number { return this.landedSeq; }
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

  /**
   * The same, for a render pass. The two descriptors have the same shape and
   * the same query set; they are separate types only because WebGPU says so.
   */
  renderPass(label: string): GPURenderPassTimestampWrites | undefined {
    return this.pass(label) as GPURenderPassTimestampWrites | undefined;
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
    const seen = new Set<string>();
    this.lastLabels.forEach((label, i) => {
      seen.add(label);
      const ms = Number(t[i * 2 + 1] - t[i * 2]) / 1e6;
      if (!(ms >= 0 && ms < 1000)) return;
      const prev = this.ms.get(label);
      this.ms.set(label, prev === undefined ? ms : prev + (ms - prev) * 0.1);
    });
    /*
      A stage that stopped running has to fall to zero, not hold its last
      reading.
      
      Turning dye diffusion off skips four Jacobi passes and the solver
      measurably took 14% more steps a second for it — while this went on
      reporting the stage at 1.31 ms, the number it had been at before,
      because nothing was writing it any more and the map kept what it had.
      A profiler that reports the cost of work that is not being done is
      worse than one that reports nothing: it sent me looking for why the
      saving had not arrived when it had.
      
      Decayed rather than deleted, on the same time constant as everything
      else, so a stage that runs on alternate frames reads as half its cost
      rather than flickering between the full number and nothing.
    */
    for (const [label, prev] of this.ms) {
      if (!seen.has(label)) this.ms.set(label, prev * 0.9);
    }
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
