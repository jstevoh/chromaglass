/**
 * The GPU, once: the adapter, the device, what they can do, and what kind of
 * machine they are (docs/webgpu-plan.md, P1).
 *
 * Asynchronous by nature — WebGPU hands out adapters and devices as promises —
 * which is why the show starts on a "starting the GPU" frame instead of
 * inside the component's effect.
 */

import type { GpuClass } from '../lib/platform';

export interface Gpu {
  adapter: GPUAdapter;
  device: GPUDevice;
  /** What the adapter says it is. */
  info: { vendor: string; architecture: string; device: string; description: string };
  /** A software adapter (SwiftShader): correct, and very slow. */
  fallback: boolean;
  /** 'timestamp-query' was granted: real GPU times per pass. */
  timestamps: boolean;
  /** rgba32float can be sampled with a linear filter (dye and grain need it at full precision). */
  float32Filterable: boolean;
  /** "apple metal-3", for the engine label. */
  label: string;
  /** Strong, mid, weak or software, from the adapter rather than a renderer string. */
  gpuClass: GpuClass;
}

/** Why there is no GPU to draw with: the "needs WebGPU" screen says which. */
export type GpuFailure =
  | { failure: 'no-webgpu'; detail: string }
  | { failure: 'no-adapter'; detail: string }
  | { failure: 'no-device'; detail: string };

/**
 * Strong, mid, weak or software, from what the adapter says it is.
 *
 * `?gpu=` still overrides it, so a
 * tier can be tested on the wrong machine.
 */
export function classifyAdapter(info: Gpu['info'], fallback: boolean): GpuClass {
  let forced: string | null = null;
  try { forced = new URLSearchParams(window.location.search).get('gpu'); } catch { /* no window */ }
  if (forced === 'software' || forced === 'weak' || forced === 'mid' || forced === 'strong') return forced;
  const all = `${info.vendor} ${info.architecture} ${info.device} ${info.description}`.toLowerCase();
  if (fallback || /swiftshader|llvmpipe|software/.test(all)) return 'software';
  // Apple's own GPUs, and the desktop discrete families.
  if (/^apple\b/.test(info.vendor.toLowerCase()) || /nvidia|geforce|rtx|ampere|ada|turing|rdna|radeon/.test(all)) return 'strong';
  // Integrated and mobile.
  if (/intel|qualcomm|adreno|arm\b|mali|powervr|imagination/.test(all)) return 'weak';
  return 'mid';
}

/**
 * A GPU request that answers, one way or the other. Mid-reset, a driver can
 * leave `requestAdapter` pending indefinitely, and a recovery waiting on it
 * showed "rebuilding the plate…" for good; now it fails, and the recovery's
 * backoff asks again.
 */
const REQUEST_TIMEOUT_MS = 10_000;
function settles<T>(p: Promise<T>, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer in ${REQUEST_TIMEOUT_MS / 1000}s`)), REQUEST_TIMEOUT_MS);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/**
 * The first request, asked for while the app's own code is still arriving.
 *
 * What was reported: the show takes a long time to load. Before this the
 * page asked for the GPU only once the app's chunks (about 550 kB
 * compressed) had downloaded, been run and drawn their first render, and
 * only then did Chromium start the GPU, which on CI's Mac holds the page for
 * 1.2 to 2.8 s (`npm run startup`'s "held" line). `main.tsx` calls this
 * before it imports the app, so that start-up and the download happen
 * together; the stage's first `requestGpu` takes the answer. Measured with
 * `npm run loadtime` on a throttled network: see there.
 *
 * Only the first request is taken this way. Every later one (a lost device
 * replaced, "Try again") asks afresh, as before.
 */
let early: Promise<Gpu | GpuFailure> | null = null;
// Settled when the early request has its answer and the compiler is warm, or
// has failed; already settled for a page that never asked (the remote, a cast).
let earlyDone: Promise<void> = Promise.resolve();
// True once the adapter and device have answered: from then on only the
// compiler's start is being waited for.
let earlyAnswered = false;
export function requestGpuEarly(): void {
  if (early) return;
  early = askGpu().then(async (got) => {
    earlyAnswered = true;
    if (!('failure' in got)) await warmCompiler(got.device);
    return got;
  });
  earlyDone = early.then(() => undefined, () => undefined);
}

/**
 * One small compute pipeline, shaped like the opening's first, built and
 * waited for, before anything else asks the device for work.
 *
 * What was reported: `npm run startup`'s "no stop in the opening" went red on
 * 14 of 124 cold Mac runs (2026-10-11 to 18, `npm run flakes`), every one a
 * stop of 2.0 to 3.5 s in the page's frames. What was measured (PLAN 14v-6):
 * on a CI Mac with the shader cache empty, Chromium's GPU process spends 1.3
 * to 2.4 s handing over the adapter or the device, and then another 2.4 to 4 s
 * when the first compute pipeline is built, the trivial `fill` kernel, which
 * is the Metal compiler starting. The page cannot present a frame while the
 * GPU process is inside either, and a frame it had already handed over (the
 * desk's first render, the intro moving into the plate) is what the
 * compositor then waits on, so rAF stops. Asking for the adapter earlier
 * cannot help (it is asked at 0.05 to 0.53 s, mean 0.11 s); the page can
 * only avoid having a frame in flight when the wait begins. So the app's
 * first render waits for this (`gpuWarm`, `main.tsx`), and the compiler
 * starts here, on a pipeline with nothing in it, with the intro held still
 * over a rectangle that is already painted. The cost is paid once either way:
 * the opening's first compile would have paid the same start. A warm shader
 * cache (every visit after the first) makes this a few milliseconds.
 *
 * It is not an empty kernel. The first version built `fn main() {}`, and on
 * the PR's own Mac run (device given at 1.52 s, the app's first render at
 * 1.61 s, so that compile cost under 0.1 s) the stop still came, 2.08 s from
 * 1.99 s, with the opening's first real compile; an empty kernel is cheap
 * where `fill` is not. So this one writes a storage texture through a
 * uniform's bounds test, the same few lines `fill` is, and nothing more.
 *
 * Never the reason the show does not open: a pipeline that will not build, or
 * does not within `WARM_CAP_MS`, is let go and the opening goes on as before.
 */
const WARM_CAP_MS = 6_000;
const WARM_WGSL = /* wgsl */ `
struct Warm { a: vec4f, b: vec4f }
@group(0) @binding(0) var<uniform> A: Warm;
@group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= u32(A.b.x) || id.y >= u32(A.b.y)) { return; }
  textureStore(dst, vec2i(id.xy), A.a);
}`;
async function warmCompiler(device: GPUDevice): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const module = device.createShaderModule({ label: 'warm', code: WARM_WGSL });
    await Promise.race([
      device.createComputePipelineAsync({ label: 'warm', layout: 'auto', compute: { module, entryPoint: 'main' } }),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, WARM_CAP_MS); }),
    ]);
  } catch { /* the opening builds its own, and says so if it cannot */ } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves once the early GPU request has been answered and its compiler is
 * warm (or has failed); at once for a page that did not ask. `main.tsx` holds
 * the app's first render on it.
 *
 * Two caps. A cold Mac hands over the adapter and device in 1.3 to 2.4 s, so an
 * adapter still unanswered at `GPU_ANSWER_MS` is a hang, not a cold start, and
 * the page goes on (a hung adapter must not keep the desk away for the whole
 * of the longer cap: `npm run intro` lines 5 and 5b press the intro 1.5 s after
 * it is taken in, and the failure screen arrives at 10 s). Once a device
 * exists, the compiler's own start gets until `GPU_HOLD_MS` in all.
 */
const GPU_ANSWER_MS = 3_500;
const GPU_HOLD_MS = 7_000;
export function gpuWarm(): Promise<void> {
  return new Promise((resolve) => {
    const unanswered = setTimeout(() => { if (!earlyAnswered) resolve(); }, GPU_ANSWER_MS);
    const cap = setTimeout(resolve, GPU_HOLD_MS);
    void earlyDone.then(() => { clearTimeout(unanswered); clearTimeout(cap); resolve(); });
  });
}

export async function requestGpu(): Promise<Gpu | GpuFailure> {
  if (early) {
    const got = early;
    early = null;
    return got;
  }
  return askGpu();
}

async function askGpu(): Promise<Gpu | GpuFailure> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { failure: 'no-webgpu', detail: 'navigator.gpu is missing' };
  }
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await settles(navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }), 'requestAdapter');
  } catch (e) {
    return { failure: 'no-adapter', detail: String((e as Error)?.message ?? e) };
  }
  if (!adapter) return { failure: 'no-adapter', detail: 'requestAdapter returned null' };

  const a = adapter.info;
  const info = { vendor: a?.vendor ?? '', architecture: a?.architecture ?? '', device: a?.device ?? '', description: a?.description ?? '' };
  const fallback = !!(a as { isFallbackAdapter?: boolean } | undefined)?.isFallbackAdapter
    || !!(adapter as { isFallbackAdapter?: boolean }).isFallbackAdapter;
  const want: GPUFeatureName[] = [];
  const timestamps = adapter.features.has('timestamp-query');
  if (timestamps) want.push('timestamp-query');
  const float32Filterable = adapter.features.has('float32-filterable');
  if (float32Filterable) want.push('float32-filterable');

  let device: GPUDevice;
  try {
    // The top rung (1024² particles, 128 MiB buffer) and future passes: request
    // storage buffer and buffer binding limits up to what the adapter supports.
    const wantLimits: Record<string, number> = {};
    if (adapter.limits.maxStorageBufferBindingSize) {
      wantLimits.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
    }
    if (adapter.limits.maxBufferSize) {
      wantLimits.maxBufferSize = adapter.limits.maxBufferSize;
    }
    device = await settles(adapter.requestDevice({ requiredFeatures: want, requiredLimits: wantLimits }), 'requestDevice');
  } catch (e) {
    return { failure: 'no-device', detail: String((e as Error)?.message ?? e) };
  }
  device.addEventListener('uncapturederror', (e) => {
    console.error('WebGPU error:', (e as GPUUncapturedErrorEvent).error?.message ?? e);
  });

  const label = [info.vendor, info.architecture].filter(Boolean).join(' ') || info.description || 'WebGPU';
  return { adapter, device, info, fallback, timestamps, float32Filterable, label, gpuClass: classifyAdapter(info, fallback) };
}

export const isGpuFailure = <T extends object>(g: T | GpuFailure): g is GpuFailure => 'failure' in g;
