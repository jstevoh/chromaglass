/**
 * The tank seen through its side, on the GPU (PLAN 47n; judged by
 * `npm run tankgpu` against the CPU reference `src/lib/tank.ts`, whose header
 * has the physics: a vertical slice of water, heavy dye falling from a nozzle
 * under its own weight, glass walls the water sticks to, a free surface).
 *
 *   createTankGpu(device, { nx, ny, width }) → { write, step, encode, read, field, destroy }
 *
 * `step` submits a step of its own (the check's way); `encode` records one into
 * the caller's encoder (the plate's way, `gpu/tankPlate.ts`), its uniforms
 * written to the queue now, so one encode per submit. `field` is what the
 * plate draws: the dye's buffer as it stands after the last step.
 *
 * The reference's few numbers (the substep bound, the nozzle's cells, the
 * multigrid's levels) are copied here under the same names rather than imported, so the
 * GPU solver's bundle never carries the CPU reference, and the check can say
 * so (as the soap film's does).
 */
import { Disposer, PipelineCache, bindGroup } from './kit';
import { TANK_KERNELS, TANK_UNIFORM_BYTES, type TankKernel } from './wgsl/tank';

const TANK_NU = 1.0e-6;
const TANK_G = 9.81;
const TANK_CFL = 0.45;
const TANK_SPEED_MARGIN = 1.5;
const TANK_MAX_SUBSTEPS = 24;
/*
  V-cycles of the pressure a substep (the multigrid, lib/tank.ts's long
  comment above tankLevels: why SOR alone blew the app's tank up). The
  reference repeats the cycle to a tolerance; the plate cannot pay that ten
  times a frame, and does not need to: each substep moves the flow a little,
  so last substep's pressure is most of this one's, and what a cycle leaves
  of the divergence is taken up by the next substep's. What that costs is
  measured by `npm run tankgpu`'s app lines (the jet's thinning and the
  front's speed at this count, against the reference solved to tolerance;
  the leftover divergence at the heaviest settings).
*/
export const TANK_CYCLES = 2;
/** The most a caller may ask for. */
export const TANK_MAX_CYCLES = 20;
const TANK_SMOOTH = 2;

/** The multigrid's levels, halving while both sides are even and at least 8 (lib/tank.ts tankLevels, copied). */
function tankLevels(nx: number, ny: number): [number, number][] {
  const out: [number, number][] = [[nx, ny]];
  let a = nx, b = ny;
  while (a % 2 === 0 && b % 2 === 0 && a / 2 >= 8 && b / 2 >= 8) { a /= 2; b /= 2; out.push([a, b]); }
  return out;
}

export interface TankStep {
  gPrime?: number;
  feed?: number;
  nozzleX?: number;
  nozzleW?: number;
  drain?: number;
  nu?: number;
  cycles?: number;
}

export interface TankField {
  c: GPUBuffer;
  nx: number;
  ny: number;
}

export interface TankGpu {
  readonly nx: number;
  readonly ny: number;
  readonly dx: number;
  readonly field: TankField;
  write(s: { u?: ArrayLike<number>; v?: ArrayLike<number>; c?: ArrayLike<number> }): void;
  step(dt: number, o?: TankStep): void;
  encode(enc: GPUCommandEncoder, dt: number, o?: TankStep): void;
  read(): Promise<{ u: Float32Array; v: Float32Array; c: Float32Array }>;
  destroy(): void;
}

export function nozzleSpan(nx: number, dx: number, nozzleX: number, nozzleW: number): [number, number] {
  const n = Math.max(1, Math.min(nx - 1, Math.round(nozzleW / dx)));
  const mid = Math.max(0, Math.min(1, nozzleX)) * nx;
  const i0 = Math.max(0, Math.min(nx - n, Math.round(mid - n / 2)));
  return [i0, i0 + n];
}

export function tankSubsteps(dt: number, dx: number, height: number, gPrime: number, feed: number): number {
  const vmax = TANK_SPEED_MARGIN * Math.sqrt(feed * feed + 2 * Math.max(0, gPrime) * height);
  return Math.max(1, Math.min(TANK_MAX_SUBSTEPS, Math.ceil((vmax * dt) / (TANK_CFL * dx))));
}

export function createTankGpu(device: GPUDevice, opts: { nx: number; ny: number; width: number }): TankGpu {
  const nx = Math.max(4, Math.floor(opts.nx));
  const ny = Math.max(4, Math.floor(opts.ny));
  const dx = opts.width / nx;
  const nC = nx * ny, nU = (nx + 1) * ny, nV = nx * (ny + 1);
  const disposer = new Disposer();
  const pipelines = PipelineCache.for(device, 'tank');
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
  const buf = (label: string, floats: number, use = usage) => disposer.track(device.createBuffer({ label, size: Math.max(16, floats * 4), usage: use }));
  const uni = disposer.track(device.createBuffer({ label: 'tank args', size: TANK_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
  const u = buf('tank u', nU), v = buf('tank v', nV), uT = buf('tank uT', nU), vT = buf('tank vT', nV);
  const c = [buf('tank c a', nC), buf('tank c b', nC)];
  const q = buf('tank q', nC), div = buf('tank div', nC);
  /*
    The multigrid's levels: level 0 is the pressure itself against the
    divergence; each coarser one has its correction and right-hand side, and
    a small uniform of its size and the relaxation its sweeps take (1 on
    every level but the coarsest, which takes its SOR optimum; lib/tank.ts
    tankCoarse). All written once here: nothing about them changes a frame.
  */
  const dims = tankLevels(nx, ny);
  const L = dims.length - 1;
  const qL = dims.map(([a, b], l) => (l === 0 ? q : buf(`tank q${l}`, a * b)));
  const bL = dims.map(([a, b], l) => (l === 0 ? div : buf(`tank b${l}`, a * b)));
  const [cxL, cyL] = dims[L];
  const coarseSweeps = Math.max(cxL, cyL);
  const levelU = dims.map(([a, b], l) => {
    const ub = disposer.track(device.createBuffer({ label: `tank level ${l}`, size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST }));
    const w = new ArrayBuffer(16);
    new Uint32Array(w, 0, 2).set([a, b]);
    new Float32Array(w, 8, 1)[0] = l === L ? 2 / (1 + Math.sin(Math.PI / Math.max(a, b))) : 1;
    device.queue.writeBuffer(ub, 0, w);
    return ub;
  });
  const readBuf = buf('tank readback', nU + nV + nC, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);

  const pipe = (k: TankKernel): GPUComputePipeline => {
    const p = pipelines.computePipeline(k, TANK_KERNELS[k]);
    if (!p) throw new Error(`tank pipeline ${k} failed to build`);
    return p;
  };
  const P = {
    bounds: pipe('tankBounds'), dye: pipe('tankDye'), advect: pipe('tankAdvect'), force: pipe('tankForce'),
    div: pipe('tankDiv'), red: pipe('tankSmoothRed'), black: pipe('tankSmoothBlack'),
    restrict: pipe('tankRestrict'), prolong: pipe('tankProlong'), project: pipe('tankProject'),
  };
  // Two of each group that reads the dye: substep by substep it goes a → b, then b → a.
  const G = {
    bounds: bindGroup(device, P.bounds, [uni, v]),
    dye: [bindGroup(device, P.dye, [uni, u, v, c[0], c[1]]), bindGroup(device, P.dye, [uni, u, v, c[1], c[0]])],
    advect: bindGroup(device, P.advect, [uni, u, v, uT, vT]),
    force: [bindGroup(device, P.force, [uni, uT, vT, c[1], u, v]), bindGroup(device, P.force, [uni, uT, vT, c[0], u, v])],
    div: bindGroup(device, P.div, [uni, u, v, div]),
    red: dims.map((_, l) => bindGroup(device, P.red, [levelU[l], bL[l], qL[l]])),
    black: dims.map((_, l) => bindGroup(device, P.black, [levelU[l], bL[l], qL[l]])),
    restrict: dims.slice(0, L).map((_, l) => bindGroup(device, P.restrict, [levelU[l], qL[l], bL[l], qL[l + 1], bL[l + 1]])),
    prolong: dims.slice(0, L).map((_, l) => bindGroup(device, P.prolong, [levelU[l], qL[l + 1], qL[l]])),
    project: bindGroup(device, P.project, [uni, q, u, v]),
  };
  const cellsX = Math.ceil(nx / 8), cellsY = Math.ceil(ny / 8);
  const facesX = Math.ceil((nx + 1) / 8), facesY = Math.ceil((ny + 1) / 8);
  // Workgroups a level: a sweep's colour (half the width), a restriction (a coarse cell each), a prolongation (a fine cell each).
  const halfW = dims.map(([a]) => Math.ceil(Math.ceil(a / 2) / 8)), rowsW = dims.map(([, b]) => Math.ceil(b / 8));
  const restrictW = dims.map(([a, b]) => [Math.ceil(a / 16), Math.ceil(b / 16)]), fineW = dims.map(([a]) => Math.ceil(a / 8));
  const sweep = (pass: GPUComputePassEncoder, l: number) => {
    pass.setPipeline(P.red); pass.setBindGroup(0, G.red[l]); pass.dispatchWorkgroups(halfW[l], rowsW[l]);
    pass.setPipeline(P.black); pass.setBindGroup(0, G.black[l]); pass.dispatchWorkgroups(halfW[l], rowsW[l]);
  };
  // One V-cycle, pass for pass the reference's vCycle.
  const vCycle = (pass: GPUComputePassEncoder) => {
    for (let l = 0; l < L; l++) {
      for (let s = 0; s < TANK_SMOOTH; s++) sweep(pass, l);
      pass.setPipeline(P.restrict); pass.setBindGroup(0, G.restrict[l]); pass.dispatchWorkgroups(restrictW[l][0], restrictW[l][1]);
    }
    for (let s = 0; s < coarseSweeps; s++) sweep(pass, L);
    for (let l = L - 1; l >= 0; l--) {
      pass.setPipeline(P.prolong); pass.setBindGroup(0, G.prolong[l]); pass.dispatchWorkgroups(fineW[l], rowsW[l]);
      for (let s = 0; s < TANK_SMOOTH; s++) sweep(pass, l);
    }
  };

  const bytes = new ArrayBuffer(TANK_UNIFORM_BYTES);
  const U32 = new Uint32Array(bytes), F32 = new Float32Array(bytes);
  let cur = 0;
  let destroyed = false;
  const field: TankField = { c: c[0], nx, ny };

  const tank: TankGpu = {
    nx, ny, dx, field,
    write(s) {
      if (destroyed) return;
      const put = (b: GPUBuffer, n: number, a?: ArrayLike<number>) => device.queue.writeBuffer(b, 0, a ? Float32Array.from(a as ArrayLike<number>) : new Float32Array(n));
      put(u, nU, s.u); put(v, nV, s.v); put(c[0], nC, s.c); put(q, nC);
      cur = 0; field.c = c[0];
    },
    encode(enc, dt, o = {}) {
      if (destroyed) return;
      const gPrime = o.gPrime ?? TANK_G * 0.005;
      const feed = Math.max(0, o.feed ?? 0);
      const n = tankSubsteps(dt, dx, ny * dx, gPrime, feed);
      const h = dt / n;
      // nozzleSpan's cells, worked out here so the frame makes no array.
      const nIn = Math.max(1, Math.min(nx - 1, Math.round((o.nozzleW ?? 3e-3) / dx)));
      const i0 = Math.max(0, Math.min(nx - nIn, Math.round(Math.max(0, Math.min(1, o.nozzleX ?? 0.5)) * nx - nIn / 2)));
      const i1 = i0 + nIn;
      const drain = Math.max(0, Math.min(1, o.drain ?? 1));
      U32[0] = nx; U32[1] = ny; U32[2] = i0; U32[3] = i1;
      F32[4] = h / dx; F32[5] = (o.nu ?? TANK_NU) * h / (dx * dx); F32[6] = gPrime * h; F32[7] = 0;
      F32[8] = feed; F32[9] = (1 - drain) * feed * nIn / (nx - nIn); F32[10] = drain * feed * nIn / nx; F32[11] = 0;
      device.queue.writeBuffer(uni, 0, bytes);
      const cycles = Math.max(1, Math.min(TANK_MAX_CYCLES, Math.round(o.cycles ?? TANK_CYCLES)));
      const pass = enc.beginComputePass({ label: 'tank' });
      pass.setPipeline(P.bounds); pass.setBindGroup(0, G.bounds); pass.dispatchWorkgroups(Math.ceil(nx / 64));
      for (let s = 0; s < n; s++) {
        pass.setPipeline(P.dye); pass.setBindGroup(0, G.dye[cur]); pass.dispatchWorkgroups(cellsX, cellsY);
        pass.setPipeline(P.advect); pass.setBindGroup(0, G.advect); pass.dispatchWorkgroups(facesX, facesY);
        pass.setPipeline(P.force); pass.setBindGroup(0, G.force[cur]); pass.dispatchWorkgroups(facesX, facesY);
        pass.setPipeline(P.div); pass.setBindGroup(0, G.div); pass.dispatchWorkgroups(cellsX, cellsY);
        for (let k = 0; k < cycles; k++) vCycle(pass);
        pass.setPipeline(P.project); pass.setBindGroup(0, G.project); pass.dispatchWorkgroups(facesX, facesY);
        cur ^= 1;
      }
      pass.end();
      field.c = c[cur];
    },
    step(dt, o) {
      if (destroyed) return;
      const enc = device.createCommandEncoder({ label: 'tank step' });
      tank.encode(enc, dt, o);
      device.queue.submit([enc.finish()]);
    },
    async read() {
      const enc = device.createCommandEncoder({ label: 'tank read' });
      enc.copyBufferToBuffer(u, 0, readBuf, 0, nU * 4);
      enc.copyBufferToBuffer(v, 0, readBuf, nU * 4, nV * 4);
      enc.copyBufferToBuffer(c[cur], 0, readBuf, (nU + nV) * 4, nC * 4);
      device.queue.submit([enc.finish()]);
      await readBuf.mapAsync(GPUMapMode.READ);
      const all = new Float32Array(readBuf.getMappedRange().slice(0));
      readBuf.unmap();
      return { u: all.subarray(0, nU), v: all.subarray(nU, nU + nV), c: all.subarray(nU + nV) };
    },
    destroy() {
      destroyed = true;
      disposer.dispose();
    },
  };
  return tank;
}
