// Bundled into a page by scripts/lab.mjs: the GPU solver on its own, with no
// canvas, driven step by step so a physics change can be measured on any
// adapter that computes (a Linux box's software one included).
import { WebGPUFluid } from '../src/gpu/fluid';
import type { GpuStepParams } from '../src/gpu/solverTypes';

export const BASE: GpuStepParams = {
  dt: 0.004, visc: 0.5, nu: 0.00005, diff: 0.0001, buoyancy: 0, gravity: 0, tiltX: 0, tiltY: 0,
  advection: 1, sharpness: 0, damping: 0.99, heatDecay: 0.98, turbScale: 0, turbDetail: 3, spin: 0,
  immiscibility: 0, phaseSharp: 0.35, phaseTension: 0.18, magnetX: 0.5, magnetY: 0.5, magnetHeight: 0.2,
  magnetStrength: 0, magnetSeconds: 1 / 60, plateCurve: 0, depthDrag: 0, gapSpring: 0.02, gapMemory: 0,
  platePressure: 0.4, fingering: 0, vibIntensity: 0, vibFrequency: 0, drip: 0, smearX: 0, smearY: 0,
  air: 0, evapFactor: 1, time: 0, currentDamp: 0.98, currentBuoy: 0, rockX: 0, rockY: 0, currentGrav: 0,
  twist: 0, meanDensity: 0, maxCurrent: 0.01, particles: 0, particleLife: 4,
} as GpuStepParams;

type Lab = {
  solver: WebGPUFluid; L: number; N: number; time: number;
  dyeAdd: Float32Array; velAdd: Float32Array; mul: Float32Array;
};
let lab: Lab | null = null;

const api = {
  async create(N = 256, L = 192) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    const device = await adapter.requestDevice({ requiredFeatures: adapter.features.has('float32-filterable') ? ['float32-filterable'] : [] });
    device.lost.then((i) => console.log('device lost', i.message));
    device.addEventListener('uncapturederror', (e) => console.log('gpu error', (e as GPUUncapturedErrorEvent).error.message.slice(0, 400)));
    const solver = new WebGPUFluid(device, N, L, { float32Filterable: adapter.features.has('float32-filterable') });
    solver.clear();
    lab = { solver, L, N, time: 0, dyeAdd: new Float32Array(L * L * 4), velAdd: new Float32Array(L * L * 4), mul: new Float32Array(L * L).fill(1) };
    return { N, L };
  },
  /** A soft disc of dye (absorbances r, g, b; density d) at (x, y) in plate units, radius r. */
  dye(x: number, y: number, r: number, rgb: [number, number, number], d = 1) {
    const { L, dyeAdd } = lab!;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const dx = (i + 0.5) / L - x, dy = (j + 0.5) / L - y;
      const f = 1 - (dx * dx + dy * dy) / (r * r);
      if (f <= 0) continue;
      const k = (i + j * L) * 4;
      dyeAdd[k] += rgb[0] * f * d; dyeAdd[k + 1] += rgb[1] * f * d; dyeAdd[k + 2] += rgb[2] * f * d; dyeAdd[k + 3] += f * d;
    }
  },
  /** A velocity kick / heat / gap delta at (x, y): channels vx, vy, temp, gap. */
  vel(x: number, y: number, r: number, v: [number, number, number, number]) {
    const { L, velAdd } = lab!;
    for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
      const dx = (i + 0.5) / L - x, dy = (j + 0.5) / L - y;
      const f = 1 - (dx * dx + dy * dy) / (r * r);
      if (f <= 0) continue;
      const k = (i + j * L) * 4;
      for (let c = 0; c < 4; c++) velAdd[k + c] += v[c] * f;
    }
  },
  flush(dt = BASE.dt) {
    const l = lab!;
    l.solver.applyDeltas(l.dyeAdd, l.velAdd, l.mul, dt);
    l.dyeAdd.fill(0); l.velAdd.fill(0); l.mul.fill(1);
  },
  async step(n: number, over: Partial<GpuStepParams> = {}) {
    const l = lab!;
    for (let k = 0; k < n; k++) {
      l.time += 1 / 60;
      l.solver.step({ ...BASE, ...over, time: l.time } as GpuStepParams, false);
    }
    await l.solver['device'].queue.onSubmittedWorkDone();
  },
  addPhase(x: number, y: number, r: number, a: number) { lab!.solver.addPhase(x, y, r, a); },
  async field(which: 'dye' | 'vel') { return Array.from(await lab!.solver.readField(which)); },
  async phase() { const f = await lab!.solver.readPhase(); return f ? { n: f.n, data: Array.from(f.data) } : null; },
  async squeeze() { const f = await lab!.solver.readSqueeze(); return f ? { n: f.n, gap: Array.from(f.gap), rate: Array.from(f.rate) } : null; },
  solver() { return lab!.solver; },
};
(window as unknown as { lab: typeof api }).lab = api;
(window as unknown as { labReady: boolean }).labReady = true;
