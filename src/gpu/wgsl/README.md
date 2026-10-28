# src/gpu/wgsl

The shader sources, as TypeScript modules that export WGSL strings (`/* wgsl */` template literals) and the constants both sides share. Nothing here touches a device; `src/gpu/*.ts` builds the pipelines.

## Start here

- `fluid.ts` (290 KB, grep it): `KERNELS`, `kernel(name, format)`, `SIM_STRUCT`, `NOISE_WGSL`: the solver.
- `thinGap.ts`: `thinGapKernels`, the flow between two glasses (Hele-Shaw).
- `plate.ts` (194 KB): `DISPLAY_MAIN`, `DERIVE_WGSL`, `FINISH_WGSL`, `plateWgsl`: the composite.
- `plateFields.ts`: `PLATE_FIELDS`, `PLATE_STRUCT`, the composite's uniforms.
- `spikes.ts`, `magnetDisc.ts`: the magnet's field and the spikes' onset.

## Contracts

- Solver kernels write the fields; `pack.ts` turns them into the plate the composite reads. The composite never writes a solver field.
- Kernel sets are composed from shared parts passed as strings (`thinGapKernels(HEAD, W, NOISE)`, `slumpKernels`, `filmKernels`).
- Imports only `../uniforms` and number-only modules in `src/lib` (turntable, dye, liquidProps, handSolid, filmTable, outputConfig); never `components/` or `hooks/`.

## Files

- `air.ts`: air splat. `splat.ts`: pours. `stats.ts`: field summaries.
- `camera.ts`, `cameraFields.ts`: camera pass.
- `ferroDrop.ts`: closeup drop. `standing.ts`: domes.
- `film.ts`: a clear film that tears.
- `output.ts`, `outputFields.ts`: projector pass.
- `pack.ts`: fields to the 8-bit plate.
- `particles.ts`: particle dye.
- `post.ts`, `postFields.ts`: post chain.
- `probe.ts`: brightness probe.
- `slosh.ts`, `soapFilm.ts`, `slump.ts`: slosh, soap film, ink slump.

## Checks

`npm run wgsl` (every shader compiles), then as relevant `physics`, `maze`, `spikes`, `disc`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `microscope`, `straw`, `derive`, `grating`. `plate.ts`: `pops`, `ferrolook`, `mixer`, `grainedge`, `lampzero`, `litstage` and a `look` render. `output.ts`: `map`, `beams`, `wallpattern`. Also `sloshgpu`, `soapgpu`, `particles`.
