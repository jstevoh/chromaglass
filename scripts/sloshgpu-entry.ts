// Bundled into a page by scripts/lab.mjs for `npm run sloshgpu`: the slosh dish's
// GPU kernels (src/gpu/slosh.ts) on their own, stepped frame by frame from the
// node side and read back, so they can be held to the TypeScript reference.
import { WebGPUSlosh } from '../src/gpu/slosh';
import { readTextureF32 } from '../src/gpu/kit';
import { SLOSH_N, type SloshPress } from '../src/lib/slosh';

type Frame = { seconds: number; ax: number; ay: number; nu: number; presses: SloshPress[]; level: boolean; bx?: number; by?: number };

let device: GPUDevice | null = null;
let dish: WebGPUSlosh | null = null;
let oilTex: GPUTexture | null = null;
let info = '';
const errors: string[] = [];

const api = {
  async create() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    info = `${adapter.info.vendor} ${adapter.info.architecture}`.trim();
    device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (e) => errors.push((e as GPUUncapturedErrorEvent).error.message.slice(0, 400)));
    dish = new WebGPUSlosh(device);
    return info;
  },
  /** The oil's share, n × n (0..1), as the plate's mix would hand it (its red), or null for none. */
  oil(share: number[] | null) {
    if (!share) { oilTex = null; return; }
    const n = SLOSH_N;
    if (!oilTex) oilTex = device!.createTexture({ size: [n, n], format: 'rgba32float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    const px = new Float32Array(n * n * 4);
    for (let k = 0; k < n * n; k++) px[k * 4] = share[k];
    device!.queue.writeTexture({ texture: oilTex }, px, { bytesPerRow: n * 16 }, [n, n]);
  },
  /** Step the frames, one submit each, and read the water, the oil and the plate's two textures back. */
  async run(frames: Frame[]) {
    for (const f of frames) {
      const enc = device!.createCommandEncoder();
      dish!.step(enc, f.seconds, f.ax, f.ay, f.nu, f.presses, oilTex ? { tex: oilTex, n: SLOSH_N } : null, f.level, undefined, f.bx ?? 0, f.by ?? 0);
      device!.queue.submit([enc.finish()]);
    }
    await device!.queue.onSubmittedWorkDone();
    const [w, o, flow, depth] = await Promise.all([dish!.water, dish!.oil, dish!.flow, dish!.depth].map((t) => readTextureF32(device!, t, 4)));
    return { water: Array.from(w), oil: Array.from(o), flow: Array.from(flow), depth: Array.from(depth), errors: errors.splice(0) };
  },
};

(window as unknown as { slosh: typeof api }).slosh = api;
(window as unknown as { labReady: boolean }).labReady = true;
