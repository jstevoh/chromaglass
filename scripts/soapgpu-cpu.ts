// The CPU reference (src/lib/soapFilm.ts) dressed in the GPU solver's contract,
// for `npm run soapgpu -- --selftest`. It is not a GPU solver and draws nothing:
// it is the control that says every bar in scripts/soapgpu.mjs can be met by the
// model itself, through the same page, the same readbacks and the same float32
// arrays the GPU hands back (the two lines that ask the work to be the GPU's
// are the only ones it is excused). Each step rounds the thickness to float32, the
// storage a GPU texture or buffer gives it, so the bars that were loosened from
// soapfilm.mjs's float64 ones (conservation, a still film) are shown to hold
// under float32 storage, and are not a guess at what float32 costs.
//
// The contract, which PLAN 32c's src/gpu/soapFilm.ts builds to:
//   createSoapFilmGpu(device, { nx, ny, dx }) → {
//     write(h)        lay a thickness field (nm, row-major, row 0 at the top);
//                     the flow, the film's tension and the rupture marks start afresh
//     step(dt, opts)  advance dt seconds, opts { g = 9.81, evap = 0, zeta = 1.5 }
//                     as stepSoapFilm's, submitting its own passes (at least one
//                     queue.submit a step; it may return a promise, which is awaited)
//     read()          → Promise<{ h, uf, vf }> as Float32Arrays laid out as the
//                     reference's f.h, f.uf, f.vf: uf and vf are the face flows
//                     (m/s) the last step moved the thickness with; it maps a buffer
//                     (counted: a read that maps nothing is a solver on the CPU)
//     destroy()       optional
//   }
import { createSoapFilm, stepSoapFilm, type SoapFilm, type SoapFilmStepOptions } from '../src/lib/soapFilm';

export function createSoapFilmGpu(_device: GPUDevice, opts: { nx: number; ny: number; dx?: number }) {
  const make = () => createSoapFilm({ nx: opts.nx, ny: opts.ny, dx: opts.dx ?? 1e-3, noise: 0 });
  let f: SoapFilm = make();
  return {
    write(h: Float32Array) {
      f = make();
      f.h.set(h);
      for (let i = 0; i < f.h.length; i++) f.ruptured[i] = f.h[i] < 30 ? 1 : 0;
    },
    step(dt: number, o: SoapFilmStepOptions = {}) {
      stepSoapFilm(f, dt, o);
      for (let i = 0; i < f.h.length; i++) f.h[i] = Math.fround(f.h[i]);
    },
    async read() {
      return { h: Float32Array.from(f.h), uf: Float32Array.from(f.uf), vf: Float32Array.from(f.vf) };
    },
  };
}
