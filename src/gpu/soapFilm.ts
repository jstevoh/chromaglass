/**
 * The draining vertical soap film on the GPU (PLAN.md §32, step 32c; judged by
 * `npm run soapgpu` in `scripts/soapgpu.mjs`).
 *
 * Implements the contract in `scripts/soapgpu-cpu.ts`:
 *   createSoapFilmGpu(device, { nx, ny, dx }) → { write(h), step(dt, opts), read(), destroy() }
 *
 * All four stages of `stepSoapFilm` (`src/lib/soapFilm.ts`) run as WebGPU
 * compute dispatches in `src/gpu/wgsl/soapFilm.ts`:
 *   1. `soapSetup`: rupture marking (`h < 30` nm), mean thickness reduction `hbar`,
 *      unprojected Darcy buoyancy `v* = (rho * g / zeta) * (h_face - hbar) * 1e-9`
 *      on interior horizontal faces with walls shut, `maxStar = max |v*|`, and
 *      unprojected cell divergence `rhs`.
 *   2. `soapSorRed` / `soapSorBlack`: red-black SOR tension solve
 *      `deg * p - sum_neighbours(p) = -rhs` with optimal relaxation
 *      `omega = 2 / (1 + sin(pi / max(nx, ny)))`, warm-started from the
 *      previous step's `p` and reset when `g` changes or `write(h)` lays a
 *      fresh film.
 *   3. `soapProject`: MAC face velocity projection `uf`, `vf` and reduction of
 *      `uMax` to determine the CFL sub-step count `ceil(uMax * dt / (0.45 * dx))`.
 *   4. `soapTransport`: conservative minmod-limited flux-form advection over the
 *      CFL sub-steps (blocking inflow into black cells), then the frame's Plateau
 *      border (`border`, 32f), optional evaporation (`evap` nm/s), and black spots
 *      on Vrij's clock handing their liquid to a rim (32g), all as the reference's.
 *
 * Constants are copied here under the same names as `src/lib/soapFilm.ts` rather
 * than imported from it, so the GPU solver's bundle never carries the CPU
 * reference.
 */
import { Disposer, PipelineCache, bindGroup } from './kit';
import { SOAP_KERNELS, type SoapKernel } from './wgsl/soapFilm';

const RHO_WATER = 1000;
const DEFAULT_ZETA = 1.5;
const BLACK_THRESHOLD_NM = 30;
const NEWTON_BLACK_NM = 8;
// The film's physical constants, as src/lib/soapFilm.ts's defaults.
const SIGMA = 0.025;
const MU = 1e-3;
const HAMAKER = 3.7e-20;

export interface SoapFilmGpuOptions {
  nx: number;
  ny: number;
  dx?: number;
}

export interface SoapFilmStepOptions {
  g?: number;
  evap?: number;
  zeta?: number;
  /** The bottom Plateau border's radius, metres; absent or 0, no border. */
  border?: number;
  sigma?: number;
  mu?: number;
  hamaker?: number;
}

export interface SoapFilmGpuReadback {
  h: Float32Array;
  uf: Float32Array;
  vf: Float32Array;
}

export interface SoapFilmGpu {
  write(h: ArrayLike<number>): void;
  step(dt: number, opts?: SoapFilmStepOptions): void;
  read(): Promise<SoapFilmGpuReadback>;
  destroy(): void;
}

export function createSoapFilmGpu(device: GPUDevice, opts: SoapFilmGpuOptions): SoapFilmGpu {
  const nx = Math.max(1, Math.floor(opts.nx));
  const ny = Math.max(1, Math.floor(opts.ny));
  const dx = opts.dx ?? 1e-3;
  const n = nx * ny;
  const nUf = (nx + 1) * ny;
  const nVf = nx * (ny + 1);
  const halfNx = (nx + 1) >>> 1;
  const sorGroups = Math.max(1, Math.ceil((halfNx * ny) / 256));
  const omega = 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));

  const disposer = new Disposer();
  const pipelines = PipelineCache.for(device, 'soapFilm');

  const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const makeBuf = (label: string, bytes: number, usage = storageUsage) =>
    disposer.track(device.createBuffer({ label, size: Math.max(16, bytes), usage }));

  const uniBuf = makeBuf('soap args', 80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const hBuf = makeBuf('soap h', n * 4);
  const ufBuf = makeBuf('soap uf', nUf * 4);
  const vfBuf = makeBuf('soap vf', nVf * 4);
  const pBuf = makeBuf('soap p', n * 4);
  const rhsBuf = makeBuf('soap rhs', n * 4);
  const rupturedBuf = makeBuf('soap ruptured', n * 4);
  const statsBuf = makeBuf('soap stats', 32);
  const slopesBuf = makeBuf('soap slopes', n * 8);
  const fluxesBuf = makeBuf('soap fluxes', (nUf + nVf) * 4);
  const ageBuf = makeBuf('soap age', n * 4);
  const readBuf = makeBuf('soap readback', (n + nUf + nVf) * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);

  const pipe = (k: SoapKernel): GPUComputePipeline => {
    const p = pipelines.computePipeline(k, SOAP_KERNELS[k]);
    if (!p) throw new Error(`soapFilm pipeline ${k} failed to build`);
    return p;
  };

  const setupPipe = pipe('soapSetup');
  const sorRedPipe = pipe('soapSorRed');
  const sorBlackPipe = pipe('soapSorBlack');
  const projectPipe = pipe('soapProject');
  const transportPipe = pipe('soapTransport');

  const setupBg = bindGroup(device, setupPipe, [uniBuf, hBuf, ufBuf, vfBuf, pBuf, rhsBuf, rupturedBuf, statsBuf]);
  const sorRedBg = bindGroup(device, sorRedPipe, [uniBuf, pBuf, rhsBuf, statsBuf]);
  const sorBlackBg = bindGroup(device, sorBlackPipe, [uniBuf, pBuf, rhsBuf, statsBuf]);
  const projectBg = bindGroup(device, projectPipe, [uniBuf, pBuf, ufBuf, vfBuf, statsBuf]);
  const transportBg = bindGroup(device, transportPipe, [uniBuf, hBuf, ufBuf, vfBuf, rupturedBuf, statsBuf, slopesBuf, fluxesBuf, ageBuf]);

  const uniBytes = new ArrayBuffer(80);
  const uniU32 = new Uint32Array(uniBytes);
  const uniF32 = new Float32Array(uniBytes);

  const zeroCell = new Float32Array(n);
  const zeroUf = new Float32Array(nUf);
  const zeroVf = new Float32Array(nVf);
  const rupturedInit = new Uint32Array(n);
  const hUpload = new Float32Array(n);

  let lastG = NaN;
  let destroyed = false;

  return {
    write(h: ArrayLike<number>): void {
      if (destroyed) return;
      for (let i = 0; i < n; i++) {
        const v = h[i] ?? NEWTON_BLACK_NM;
        hUpload[i] = v;
        rupturedInit[i] = v < BLACK_THRESHOLD_NM ? 1 : 0;
      }
      device.queue.writeBuffer(hBuf, 0, hUpload);
      device.queue.writeBuffer(rupturedBuf, 0, rupturedInit);
      device.queue.writeBuffer(ufBuf, 0, zeroUf);
      device.queue.writeBuffer(vfBuf, 0, zeroVf);
      device.queue.writeBuffer(pBuf, 0, zeroCell);
      device.queue.writeBuffer(ageBuf, 0, zeroCell);
      lastG = NaN;
    },

    step(dt: number, stepOpts: SoapFilmStepOptions = {}): void {
      if (destroyed) return;
      const g = stepOpts.g ?? 9.81;
      const evap = stepOpts.evap ?? 0;
      const zeta = stepOpts.zeta ?? DEFAULT_ZETA;
      const resetP = lastG !== g ? 1 : 0;
      lastG = g;

      const scale = (RHO_WATER * g * 1e-9) / zeta;
      const sigma = stepOpts.sigma ?? SIGMA;
      const mu = stepOpts.mu ?? MU;
      const A = stepOpts.hamaker ?? HAMAKER;
      const sweeps = resetP ? 80 : 60;

      uniU32[0] = nx;
      uniU32[1] = ny;
      uniU32[2] = n;
      uniU32[3] = resetP;
      uniF32[4] = dt;
      uniF32[5] = dx;
      uniF32[6] = g;
      uniF32[7] = evap;
      uniF32[8] = scale;
      uniF32[9] = omega;
      uniF32[10] = 0;
      uniF32[11] = zeta;
      uniU32[12] = sweeps;
      uniU32[13] = sweeps;
      uniU32[14] = halfNx;
      uniU32[15] = 0;
      uniF32[16] = stepOpts.border ?? 0;
      uniF32[17] = (mu * RHO_WATER * Math.abs(g) * 1e-9) / (zeta * sigma);
      uniF32[18] = (RHO_WATER * Math.abs(g)) / sigma;
      // Vrij's 96 pi^2 sigma mu / A^2 for a thickness in nm: the SI value is near
      // float32's top and h^5 in metres is under its smallest normal, so scale both.
      uniF32[19] = ((96 * Math.PI * Math.PI * sigma * mu) / (A * A)) * 1e-45;
      device.queue.writeBuffer(uniBuf, 0, uniBytes);

      const enc = device.createCommandEncoder({ label: 'soapFilm step' });
      const pass = enc.beginComputePass({ label: 'soapFilm' });

      pass.setPipeline(setupPipe);
      pass.setBindGroup(0, setupBg);
      pass.dispatchWorkgroups(1);

      for (let s = 0; s < sweeps; s++) {
        pass.setPipeline(sorRedPipe);
        pass.setBindGroup(0, sorRedBg);
        pass.dispatchWorkgroups(sorGroups);
        pass.setPipeline(sorBlackPipe);
        pass.setBindGroup(0, sorBlackBg);
        pass.dispatchWorkgroups(sorGroups);
      }

      pass.setPipeline(projectPipe);
      pass.setBindGroup(0, projectBg);
      pass.dispatchWorkgroups(1);

      pass.setPipeline(transportPipe);
      pass.setBindGroup(0, transportBg);
      pass.dispatchWorkgroups(1);

      pass.end();
      device.queue.submit([enc.finish()]);
    },

    async read(): Promise<SoapFilmGpuReadback> {
      const enc = device.createCommandEncoder({ label: 'soapFilm read' });
      enc.copyBufferToBuffer(hBuf, 0, readBuf, 0, n * 4);
      enc.copyBufferToBuffer(ufBuf, 0, readBuf, n * 4, nUf * 4);
      enc.copyBufferToBuffer(vfBuf, 0, readBuf, (n + nUf) * 4, nVf * 4);
      device.queue.submit([enc.finish()]);

      await readBuf.mapAsync(GPUMapMode.READ);
      const mapped = new Float32Array(readBuf.getMappedRange());
      const h = mapped.slice(0, n);
      const uf = mapped.slice(n, n + nUf);
      const vf = mapped.slice(n + nUf, n + nUf + nVf);
      readBuf.unmap();
      return { h, uf, vf };
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      disposer.dispose();
    },
  };
}
