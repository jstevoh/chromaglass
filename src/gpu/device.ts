/**
 * The GPU, once: the adapter, the device, what they can do, and what kind of
 * machine they are (docs/webgpu-plan.md, P1).
 *
 * Asynchronous by nature — WebGPU hands out adapters and devices as promises —
 * which is why the show starts on a "starting the GPU" frame instead of
 * inside the component's effect, as the WebGL path does.
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
 * `?gpu=` still overrides it, as it does for the WebGL renderer string, so a
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

export async function requestGpu(): Promise<Gpu | GpuFailure> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    return { failure: 'no-webgpu', detail: 'navigator.gpu is missing' };
  }
  let adapter: GPUAdapter | null = null;
  try {
    adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
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
    // The default limits: every pass reads its fields as textures and writes
    // one storage texture. A pass that needs more asks for it here, by name.
    device = await adapter.requestDevice({ requiredFeatures: want });
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
