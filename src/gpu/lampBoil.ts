/**
 * WebGPU compute solver for the two-phase Hele-Shaw lamp-boiling dish (PLAN 36e-2).
 *
 * Implements the model of `src/lib/lampBoil.ts` on the GPU without importing the
 * CPU reference, fulfilling the contract in `scripts/boilgpu-cpu.ts`:
 *   - `createBoilPlateGpu(device, options)` -> `{ n, write, step, read, destroy }`
 *   - Every `step(dt, c)` advances thermal conduction/radiation/convection/phase-change,
 *     Darcy pressure-projection flow with harmonic-mean face mobilities, and minmod
 *     flux-limited upwind advection on the GPU (`device.queue.submit`).
 *   - Every `read()` maps a `GPUBuffer` (`mapAsync`) and returns float32 `{ T, alpha, u, v, source, starts, dTnuc }`.
 */
import {
  ALPHA_MAX,
  BOIL_DISH_WGSL,
  HAND_RADIUS,
  K_GLASS,
  K_WATER,
  LATENT,
  RHO_C,
  RHO_C_GLASS,
  RHO_V,
  SIGMA_SAT,
  SIGMA_SB,
  T_AMBIENT,
  T_HOM,
  T_SAT,
} from './wgsl/lampBoil';

export {
  ALPHA_MAX,
  HAND_RADIUS,
  K_GLASS,
  K_WATER,
  LATENT,
  RHO_C,
  RHO_C_GLASS,
  RHO_V,
  SIGMA_SAT,
  SIGMA_SB,
  T_AMBIENT,
  T_HOM,
  T_SAT,
};

export interface BoilPlateOptions {
  n?: number;
  width?: number;
  radius?: number;
  gap?: number;
  glass?: number;
  ambient?: number;
  lampIrradiance?: number;
  visibleFraction?: number;
  emissivity?: number;
  lampWidth?: number;
  lampCentre?: [number, number];
  kappaIR?: number;
  hForced?: number;
  hNatural?: number;
  cavityRadius?: number;
  cavitySpread?: number;
  siteDensity?: number;
  interfaceH?: number;
  seed?: number;
}

export interface BoilHold {
  x: number;
  y: number;
  r: number;
}

export interface BoilControls {
  heat?: number;
  holds?: BoilHold[];
  tilt?: number;
  g?: number;
}

export interface BoilFields {
  T?: Float32Array;
  alpha?: Float32Array;
  dye?: Float32Array;
  dTnuc?: Float32Array;
}

export interface BoilReadback {
  T: Float32Array;
  alpha: Float32Array;
  u: Float32Array;
  v: Float32Array;
  source: Float32Array;
  starts: Uint32Array;
  dTnuc: Float32Array;
}

export interface BoilPlateGpu {
  readonly n: number;
  write(f: BoilFields): void;
  step(dt: number, c?: BoilControls): void | Promise<void>;
  read(): Promise<BoilReadback>;
  destroy(): void;
}

/** Kell (1975) density of liquid water at 1 atm (kg/m³). */
export function waterDensity(T: number): number {
  const t = Math.max(0, Math.min(150, T));
  const num =
    999.83952 +
    t *
      (16.945176 +
        t * (-7.9870401e-3 + t * (-46.170461e-6 + t * (105.56302e-9 - 280.54253e-12 * t))));
  return num / (1 + 16.879850e-3 * t);
}

/** Vogel dynamic viscosity of liquid water (Pa·s). */
export function waterViscosity(T: number): number {
  const t = Math.max(0, Math.min(150, T));
  return 2.414e-5 * Math.pow(10, 247.8 / (t + 273.15 - 140));
}

/** Equilibrium-nucleus superheat ΔT_nuc (K) for a cavity of mouth radius r (m). */
export function nucleationSuperheat(r: number): number {
  const TsatK = T_SAT + 273.15;
  return (2 * SIGMA_SAT * TsatK) / (RHO_V * LATENT * r);
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed heterogeneous nucleation superheat `dTnuc` per cell identically to the reference. */
export function seedBoilSites(options: BoilPlateOptions = {}): {
  inside: Float32Array;
  dTnuc: Float32Array;
} {
  const n = options.n ?? 64;
  const width = options.width ?? 0.1;
  const radius = options.radius ?? 0.45 * width;
  const dx = width / n;
  const N = n * n;
  const inside = new Float32Array(N);
  const dTnuc = new Float32Array(N);
  dTnuc.fill(Infinity);

  const rng = mulberry32(options.seed ?? 1);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const rc = options.cavityRadius ?? 4e-6;
  const spread = options.cavitySpread ?? 0.3;
  const lambda = (options.siteDensity ?? 7e4) * dx * dx;

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = (i + 0.5) * dx - 0.5 * width;
      const y = (j + 0.5) * dx - 0.5 * width;
      const isIn = Math.hypot(x, y) < radius;
      inside[k] = isIn ? 1 : 0;

      let count = 0;
      for (let u = rng(), pk = Math.exp(-lambda), cdf = pk; u > cdf && count < 50; ) {
        count++;
        pk *= lambda / count;
        cdf += pk;
      }
      let r = 0;
      for (let c = 0; c < count; c++) {
        r = Math.max(r, rc * Math.exp(spread * gauss()));
      }
      if (isIn && count > 0) {
        dTnuc[k] = Math.fround(nucleationSuperheat(r));
      }
    }
  }
  return { inside, dTnuc };
}

interface BoilPipelines {
  bgl: GPUBindGroupLayout;
  copyIn: GPUComputePipeline;
  thermal: GPUComputePipeline;
  flowSingle: GPUComputePipeline;
  flowRhs: GPUComputePipeline;
  flowSweepRed: GPUComputePipeline;
  flowSweepBlack: GPUComputePipeline;
  flowVel: GPUComputePipeline;
  advectSingle: GPUComputePipeline;
  advectMulti: GPUComputePipeline;
}

const pipelineCache = new WeakMap<GPUDevice, BoilPipelines>();

function getPipelines(device: GPUDevice): BoilPipelines {
  const cached = pipelineCache.get(device);
  if (cached) return cached;

  const bgl = device.createBindGroupLayout({
    label: 'lampBoil bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const layout = device.createPipelineLayout({
    label: 'lampBoil layout',
    bindGroupLayouts: [bgl],
  });
  const module = device.createShaderModule({
    label: 'lampBoil shader',
    code: BOIL_DISH_WGSL,
  });
  const make = (entryPoint: string) =>
    device.createComputePipeline({
      label: `lampBoil:${entryPoint}`,
      layout,
      compute: { module, entryPoint },
    });

  const pipes: BoilPipelines = {
    bgl,
    copyIn: make('boilCopyIn'),
    thermal: make('boilThermal'),
    flowSingle: make('boilFlowSingle'),
    flowRhs: make('boilFlowRhs'),
    flowSweepRed: make('boilFlowSweepRed'),
    flowSweepBlack: make('boilFlowSweepBlack'),
    flowVel: make('boilFlowVel'),
    advectSingle: make('boilAdvectSingle'),
    advectMulti: make('boilAdvectMulti'),
  };
  pipelineCache.set(device, pipes);
  return pipes;
}

export function createBoilPlateGpu(
  device: GPUDevice,
  options: BoilPlateOptions = {},
): BoilPlateGpu {
  const n = options.n ?? 64;
  const width = options.width ?? 0.1;
  const radius = options.radius ?? 0.45 * width;
  const gap = options.gap ?? 1e-3;
  const glass = options.glass ?? 2e-3;
  const ambient = options.ambient ?? 20;
  const I0 = options.lampIrradiance ?? 8000;
  const visibleFraction = options.visibleFraction ?? 0.12;
  const emissivity = options.emissivity ?? 0.9;
  const lampWidth = options.lampWidth ?? 0.02;
  const lampCentre: [number, number] = options.lampCentre ?? [0, 0];
  const kappaIR = options.kappaIR ?? 600;
  const hForced = options.hForced ?? 50;
  const hNatural = options.hNatural ?? 10;
  const interfaceH = options.interfaceH ?? 1e4;
  const dx = width / n;
  const N = n * n;
  const uLen = (n + 1) * n;
  const vLen = n * (n + 1);
  const totalFloats = 5 * N + uLen + vLen;

  const alphaSeed = Math.min(0.5, (Math.PI * gap * gap) / (6 * dx * dx));
  const alphaMin = alphaSeed * 0.01;
  const rhoRoom = waterDensity(ambient);
  const Mroom = (gap * gap) / (12 * waterViscosity(ambient));

  const { inside, dTnuc } = seedBoilSites({ ...options, n, width, radius });

  const pipes = getPipelines(device);

  // Uniform buffer: 28 scalars (112 bytes) + 8 * vec4f holds (128 bytes) = 240 bytes -> 256 bytes aligned
  const uData = new ArrayBuffer(256);
  const uU32 = new Uint32Array(uData);
  const uF32 = new Float32Array(uData);
  const uBuf = device.createBuffer({
    label: 'lampBoil uniforms',
    size: 256,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const insideBuf = device.createBuffer({
    label: 'lampBoil inside',
    size: N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(insideBuf, 0, inside);

  const fieldsBuf = device.createBuffer({
    label: 'lampBoil fields',
    size: totalFloats * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const workBuf = device.createBuffer({
    label: 'lampBoil work',
    size: 6 * N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });

  const startsBuf = device.createBuffer({
    label: 'lampBoil starts',
    size: N * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  });

  const readByteLength = (totalFloats + N) * 4;
  const readBuf = device.createBuffer({
    label: 'lampBoil read',
    size: readByteLength,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  const bg = device.createBindGroup({
    label: 'lampBoil bg',
    layout: pipes.bgl,
    entries: [
      { binding: 0, resource: { buffer: uBuf } },
      { binding: 1, resource: { buffer: insideBuf } },
      { binding: 2, resource: { buffer: fieldsBuf } },
      { binding: 3, resource: { buffer: workBuf } },
      { binding: 4, resource: { buffer: startsBuf } },
    ],
  });

  const initT = new Float32Array(N).fill(Math.fround(ambient));
  const zerosN = new Float32Array(N);
  const zerosFlow = new Float32Array(N + uLen + vLen);
  const zerosWork = new Float32Array(6 * N);
  const zerosStarts = new Uint32Array(N);

  // Initialize fields on the GPU
  device.queue.writeBuffer(fieldsBuf, 0, initT);
  device.queue.writeBuffer(fieldsBuf, N * 4, zerosN);
  device.queue.writeBuffer(fieldsBuf, 2 * N * 4, zerosN);
  device.queue.writeBuffer(fieldsBuf, 3 * N * 4, dTnuc);
  device.queue.writeBuffer(fieldsBuf, 4 * N * 4, zerosFlow);
  device.queue.writeBuffer(workBuf, 0, zerosWork);
  device.queue.writeBuffer(startsBuf, 0, zerosStarts);

  const singleWg = n <= 96;
  const omega = singleWg
    ? Math.min(1.93, 2 / (1 + 1.2 * Math.sin(Math.PI / n)))
    : 1.85;
  const sweeps = singleWg ? (n <= 48 ? 220 : n <= 64 ? 260 : 340) : 4;

  function writeUniforms(h: number, c: BoilControls): void {
    const holds = c.holds ?? [];
    const hc = Math.min(8, holds.length);
    const tilt = c.tilt ?? 0;
    const gIn = (c.g ?? 9.81) * Math.sin(tilt);

    uU32[0] = n;
    uU32[1] = hc;
    uU32[2] = sweeps;
    uU32[3] = 0;
    uF32[4] = h;
    uF32[5] = width;
    uF32[6] = dx;
    uF32[7] = gap;
    uF32[8] = glass;
    uF32[9] = ambient;
    uF32[10] = Math.max(0, Math.min(1, c.heat ?? 1));
    uF32[11] = I0;
    uF32[12] = lampWidth;
    uF32[13] = lampCentre[0];
    uF32[14] = lampCentre[1];
    uF32[15] = visibleFraction;
    uF32[16] = kappaIR;
    uF32[17] = emissivity;
    uF32[18] = hForced;
    uF32[19] = hNatural;
    uF32[20] = interfaceH;
    uF32[21] = alphaSeed;
    uF32[22] = alphaMin;
    uF32[23] = gIn;
    uF32[24] = rhoRoom;
    uF32[25] = Mroom;
    uF32[26] = omega;
    uF32[27] = 0;

    for (let idx = 0; idx < 8; idx++) {
      const base = 28 + idx * 4;
      if (idx < hc) {
        const hd = holds[idx];
        uF32[base] = hd.x;
        uF32[base + 1] = hd.y;
        uF32[base + 2] = hd.r * hd.r;
        uF32[base + 3] = 0;
      } else {
        uF32[base] = 0;
        uF32[base + 1] = 0;
        uF32[base + 2] = 0;
        uF32[base + 3] = 0;
      }
    }
    device.queue.writeBuffer(uBuf, 0, uData);
  }

  const wgCells = Math.ceil(N / 256);
  const wgHalf = Math.ceil((N / 2) / 256);
  const wgFaces = Math.ceil(Math.max(uLen, vLen) / 256);

  return {
    n,
    write(f: BoilFields) {
      if (f.T) device.queue.writeBuffer(fieldsBuf, 0, f.T as Float32Array<ArrayBuffer>);
      if (f.alpha) device.queue.writeBuffer(fieldsBuf, N * 4, f.alpha as Float32Array<ArrayBuffer>);
      if (f.dye) device.queue.writeBuffer(fieldsBuf, 2 * N * 4, f.dye as Float32Array<ArrayBuffer>);
      if (f.dTnuc) device.queue.writeBuffer(fieldsBuf, 3 * N * 4, f.dTnuc as Float32Array<ArrayBuffer>);
      device.queue.writeBuffer(fieldsBuf, 4 * N * 4, zerosFlow);
      device.queue.writeBuffer(workBuf, 0, zerosWork);
      device.queue.writeBuffer(startsBuf, 0, zerosStarts);
    },
    step(dt: number, c: BoilControls = {}) {
      if (dt <= 0) {
        const enc = device.createCommandEncoder({ label: 'lampBoil zero step' });
        device.queue.submit([enc.finish()]);
        return;
      }
      const Kmax = K_WATER * gap + K_GLASS * glass;
      const Cmin = RHO_C_GLASS * glass;
      const Dmax = Kmax / Cmin;
      const steps = singleWg
        ? Math.max(1, Math.ceil(dt / ((0.2 * dx * dx) / Dmax)))
        : Math.max(1, Math.min(4, Math.ceil(dt / ((0.25 * dx * dx) / (Kmax / (RHO_C * gap + Cmin))))));
      const h = dt / steps;
      writeUniforms(h, c);

      const enc = device.createCommandEncoder({ label: 'lampBoil step' });
      const pass = enc.beginComputePass({ label: 'lampBoil compute' });
      pass.setBindGroup(0, bg);

      if (singleWg) {
        for (let s = 0; s < steps; s++) {
          pass.setPipeline(pipes.copyIn);
          pass.dispatchWorkgroups(wgCells);

          pass.setPipeline(pipes.thermal);
          pass.dispatchWorkgroups(wgCells);

          pass.setPipeline(pipes.flowSingle);
          pass.dispatchWorkgroups(1);

          pass.setPipeline(pipes.advectSingle);
          pass.dispatchWorkgroups(1);
        }
      } else {
        for (let s = 0; s < steps; s++) {
          pass.setPipeline(pipes.copyIn);
          pass.dispatchWorkgroups(wgCells);

          pass.setPipeline(pipes.thermal);
          pass.dispatchWorkgroups(wgCells);
        }

        pass.setPipeline(pipes.flowRhs);
        pass.dispatchWorkgroups(wgCells);

        for (let sw = 0; sw < sweeps; sw++) {
          pass.setPipeline(pipes.flowSweepRed);
          pass.dispatchWorkgroups(wgHalf);
          pass.setPipeline(pipes.flowSweepBlack);
          pass.dispatchWorkgroups(wgHalf);
        }

        pass.setPipeline(pipes.flowVel);
        pass.dispatchWorkgroups(wgFaces);

        pass.setPipeline(pipes.copyIn);
        pass.dispatchWorkgroups(wgCells);

        pass.setPipeline(pipes.advectMulti);
        pass.dispatchWorkgroups(wgCells);
      }

      pass.end();
      device.queue.submit([enc.finish()]);
    },
    async read(): Promise<BoilReadback> {
      const enc = device.createCommandEncoder({ label: 'lampBoil read' });
      enc.copyBufferToBuffer(fieldsBuf, 0, readBuf, 0, totalFloats * 4);
      enc.copyBufferToBuffer(startsBuf, 0, readBuf, totalFloats * 4, N * 4);
      device.queue.submit([enc.finish()]);

      await readBuf.mapAsync(GPUMapMode.READ);
      const mapped = readBuf.getMappedRange();
      const f32 = new Float32Array(mapped, 0, totalFloats);
      const u32 = new Uint32Array(mapped, totalFloats * 4, N);

      const T = f32.slice(0, N);
      const alpha = f32.slice(N, 2 * N);
      const dTnucOut = f32.slice(3 * N, 4 * N);
      const source = f32.slice(4 * N, 5 * N);
      const u = f32.slice(5 * N, 5 * N + uLen);
      const v = f32.slice(5 * N + uLen, 5 * N + uLen + vLen);
      const starts = u32.slice(0, N);
      readBuf.unmap();

      return { T, alpha, u, v, source, starts, dTnuc: dTnucOut };
    },
    destroy() {
      uBuf.destroy();
      insideBuf.destroy();
      fieldsBuf.destroy();
      workBuf.destroy();
      startsBuf.destroy();
      readBuf.destroy();
    },
  };
}
