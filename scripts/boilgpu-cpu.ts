// The CPU reference (src/lib/lampBoil.ts) dressed in the GPU solver's contract,
// for `npm run boilgpu -- --selftest`. It is not a GPU solver and draws nothing:
// it is the control that says every bar in scripts/boilgpu.mjs can be met by the
// model itself, through the same page, the same readbacks and the same float32
// arrays a GPU hands back (the two lines that ask the work to be the GPU's are the
// only ones it is excused). After each step it rounds every field it keeps to
// float32, the storage a GPU buffer gives it, so the bars that were moved from
// boil.mjs's float64 ones (each says why in boilgpu.mjs) are shown to hold under
// float32 storage, and are not a guess at what float32 costs. It does not round
// the arithmetic inside a step, which a GPU does in float32 too: the model lines'
// bars leave room for that, and the Mac's first run of the real solver says how
// much it took.
//
// The contract, which PLAN 36e-2 builds to (src/gpu/lampBoil.ts):
//   createBoilPlateGpu(device, options) → plate, or a promise of one
//     options     BoilPlateOptions, the reference's names, units and defaults
//                 (n, width, radius, gap, glass, ambient, lampIrradiance,
//                 visibleFraction, emissivity, lampWidth, lampCentre, kappaIR,
//                 hForced, hNatural, cavityRadius, cavitySpread, siteDensity,
//                 interfaceH, seed); the dish is the cells whose centres are
//                 inside `radius` of the grid's centre, the rest the open rim
//     plate.n     cells across
//     write(f)    any of { T, alpha, dye, dTnuc } as Float32Arrays (n², row-major,
//                 row 0 at the top): °C, vapour fraction, the dye's absorbance and
//                 each cell's nucleation superheat (K; a cell with no site reads
//                 Infinity or anything from 200 K, T_HOM − T_SAT, up). A field
//                 given replaces the plate's; the rest keep theirs (at creation:
//                 the ambient, no vapour, no dye, and the plate's own sites, a
//                 Poisson density per m² as the reference seeds them). The flow,
//                 the pressure, the counts of bubbles started and the time start
//                 afresh.
//     step(dt, c) advance dt seconds, c { heat, holds: [{ x, y, r }] (m from the
//                 grid's centre), tilt, g } as stepBoilPlate's, submitting its own
//                 passes (at least one queue.submit a step; it may return a
//                 promise, which is awaited)
//     read()      → Promise<{ T, alpha, u, v, source, starts, dTnuc }>: T, alpha,
//                 dTnuc as written; u ((n+1)×n, the face left of cell i at
//                 j*(n+1)+i) and v (n×(n+1), the face above cell i at j*n+i, +y
//                 down) the face flows in m/s the last step carried its fields
//                 with; source (1/s) the volume source that flow was solved for;
//                 starts (Uint32Array) how many bubbles each cell has started
//                 since the last write. It maps a buffer (counted: a read that maps
//                 nothing is a solver on the CPU).
//     destroy()   optional
import { createBoilPlate, stepBoilPlate, type BoilControls, type BoilPlate, type BoilPlateOptions } from '../src/lib/lampBoil';

export interface BoilFields { T?: Float32Array; alpha?: Float32Array; dye?: Float32Array; dTnuc?: Float32Array }

function inContract(options: BoilPlateOptions, float32: boolean) {
  const P: BoilPlate = createBoilPlate(options);
  let since = 0;
  const round = (a: Float64Array) => { if (float32) for (let i = 0; i < a.length; i++) a[i] = Math.fround(a[i]); };
  round(P.T); round(P.dTnuc);
  return {
    n: P.n,
    write(f: BoilFields) {
      if (f.T) P.T.set(f.T);
      if (f.alpha) P.alpha.set(f.alpha);
      if (f.dye) P.dye.set(f.dye);
      if (f.dTnuc) P.dTnuc.set(f.dTnuc);
      P.u.fill(0); P.v.fill(0); P.p.fill(0); P.source.fill(0);
      P.time = 0;
      since = P.nucleations.length;
    },
    step(dt: number, c: BoilControls = {}) {
      stepBoilPlate(P, dt, c);
      for (const a of [P.T, P.alpha, P.u, P.v, P.p, P.source]) round(a);
    },
    async read() {
      const starts = new Uint32Array(P.n * P.n);
      for (let e = since; e < P.nucleations.length; e++) starts[P.nucleations[e].cell]++;
      return {
        T: Float32Array.from(P.T), alpha: Float32Array.from(P.alpha), u: Float32Array.from(P.u), v: Float32Array.from(P.v),
        source: Float32Array.from(P.source), starts, dTnuc: Float32Array.from(P.dTnuc),
      };
    },
  };
}

/** The control: the reference in the GPU's contract, its fields stored in float32. */
export function createBoilPlateGpu(_device: GPUDevice, options: BoilPlateOptions = {}) {
  return inContract(options, true);
}

/** The reference itself, in float64, in the same contract: what boilgpu.mjs holds the GPU to cell by cell. */
export function createBoilPlateReference(options: BoilPlateOptions = {}) {
  return inContract(options, false);
}

export { createBoilPlate };
