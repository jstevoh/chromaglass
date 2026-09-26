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
const shared = new WeakMap<GPUDevice, { modules: Map<string, GPUShaderModule>; scopes: Map<string, Pipelines> }>();

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
  constructor(
    private readonly device: GPUDevice,
    store: { modules: Map<string, GPUShaderModule> } & Pipelines = { modules: new Map(), compute: new Map(), render: new Map() },
  ) {
    this.modules = store.modules;
    this.compute = store.compute;
    this.render = store.render;
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
    let dev = shared.get(device);
    if (!dev) { dev = { modules: new Map(), scopes: new Map() }; shared.set(device, dev); }
    let pipes = dev.scopes.get(scope);
    if (!pipes) { pipes = { compute: new Map(), render: new Map() }; dev.scopes.set(scope, pipes); }
    return new PipelineCache(device, { modules: dev.modules, ...pipes });
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
    const key = entryPoint === 'main' ? name : `${name}@${entryPoint}`;
    let bySource = this.compute.get(key);
    if (!bySource) { bySource = new Map(); this.compute.set(key, bySource); }
    let p = bySource.get(code);
    if (!p) {
      const layout = this.device.createPipelineLayout({ label: name, bindGroupLayouts: [layoutFromWgsl(this.device, code, name)] });
      p = this.device.createComputePipeline({ label: name, layout, compute: { module: this.module(code, name), entryPoint } });
      bySource.set(code, p);
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

/*
  Readbacks, for a song render (lib/render.ts, PLAN.md §6).

  Live, a readback lands when the GPU gets to it, a frame or two after it was
  asked for, and which frame's code sees it is the machine's timing. That is
  fine for a show and fatal for a render that has to come out the same twice:
  the dye regulator, the beads and the flash guard all act on what came back,
  so a copy that lands one frame later in the second render is a different
  film from there on. So a render waits, after each frame, for every readback
  that frame asked for (`readbacksLanded`), and each frame then sees exactly
  the previous frame's copies, every time.

  And it starts clean. What the rings hold from before the render is the live
  plate's, in whatever state the evening left it; `forgetReadbacks` makes
  every ring report nothing until a copy asked for after it lands, so the
  render's first frames read either nothing (the same nothing every time) or
  the render's own plate. Live, neither is ever called, and a ring behaves
  exactly as it did: nothing is tracked (`trackReadbacks` is on only between
  a render's begin and end, so the show pays no set and no promise per
  readback), and the epoch never moves.
*/
const inFlight = new Set<Promise<void>>();
let epoch = 0;
let tracking = false;

/** Keep count of readbacks in flight (a render, from its begin to its end), or stop. */
export function trackReadbacks(on: boolean): void {
  tracking = on;
  if (!on) inFlight.clear();
}

/** Every ring reports nothing until a copy asked for from now on lands. */
export function forgetReadbacks(): void { epoch++; }

/** Resolves once every readback asked for so far has landed (or failed). */
export async function readbacksLanded(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight]);
}

/**
 * Small results back to the CPU without a stall: a few buffers in rotation,
 * each copied into and mapped asynchronously, the newest landed one kept. A
 * frame or more late, as the WebGL path's fenced reads were.
 */
export class ReadbackRing {
  private readonly slots: { buf: GPUBuffer; busy: boolean; seq: number; epoch: number }[];
  /** The epoch the newest data was asked for in; data from an older one is not handed out. */
  private dataEpoch = 0;
  private seq = 0;
  private landedSeq = -1;
  private data: ArrayBuffer | null = null;
  constructor(device: GPUDevice, disposer: Disposer, readonly bytes: number, count = 3, label = 'readback') {
    this.slots = Array.from({ length: count }, (_, i) => ({
      buf: disposer.track(device.createBuffer({ label: `${label} ${i}`, size: bytes, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })),
      busy: false,
      seq: 0,
      epoch: 0,
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
    slot.epoch = epoch;
    return slot.buf;
  }

  /** After the submit: map the slot `copyFrom` returned, keeping its data if it is the newest to land. */
  collect(buf: GPUBuffer): void {
    const slot = this.slots.find((s) => s.buf === buf);
    if (!slot) return;
    const landing = buf.mapAsync(GPUMapMode.READ).then(() => {
      // Free the slot whatever happens: a slot left busy is a readback that
      // never comes back, and with two or three of them that is the flash
      // guard and the dye readback stopped for the rest of the show.
      try {
        if (slot.seq > this.landedSeq && slot.epoch === epoch) {
          // Into the ring's one buffer, made on the first landing — and only
          // published once the copy is done, so a mapping that throws on the
          // first read leaves `latest` null rather than a buffer of zeros
          // that looks like an empty plate.
          const mapped = new Uint8Array(buf.getMappedRange());
          const into = this.data ?? new ArrayBuffer(this.bytes);
          new Uint8Array(into).set(mapped);
          this.data = into;
          this.dataEpoch = slot.epoch;
          this.landedSeq = slot.seq;
        }
      } finally {
        try { buf.unmap(); } catch { /* destroyed under it */ }
        slot.busy = false;
      }
    }, () => { slot.busy = false; });
    if (tracking) {
      // Not caught here: a landing that throws still surfaces as an unhandled
      // rejection with the same reason, once, as it does untracked.
      inFlight.add(landing);
      void landing.finally(() => inFlight.delete(landing));
    }
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
  get latest(): ArrayBuffer | null { return this.dataEpoch === epoch ? this.data : null; }

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
