# src/gpu/wgsl

The shader sources, as TypeScript modules that export WGSL strings (`/* wgsl */` template literals) and the constants both sides share. Nothing here touches a device; `src/gpu/*.ts` builds the pipelines.

## Start here

- `fluid.ts` (12 KB): `KERNELS`, `kernel(name, format)`, `SIM_STRUCT`, `NOISE_WGSL`: the solver. An index: each pass's kernels are in `fluid/` (see its README), and this file joins them into the one table a pass is asked for by name.
- `thinGap.ts` (52 KB, grep it): `thinGapKernels`, the flow between two glasses (Hele-Shaw).
- `plate.ts` (194 KB, grep it): `DISPLAY_MAIN`, `DERIVE_WGSL`, `FINISH_WGSL`, `plateWgsl`: the composite.
- `plateFields.ts`: `PLATE_FIELDS`, `PLATE_STRUCT`, the composite's uniforms.
- `spikes.ts`, `magnetDisc.ts`: the magnet's field (`MAGNET_RADIUS`) and the spikes' onset. The liquid's own onset is worked out from the ferrofluid in SI (`ferroOnsetTesla`, `SPIKE_ONSET_REAL`, the target; the plate still runs on the lab's `SPIKE_ONSET` until PLAN 38k-7; `FERRO_MS_TESLA`, `FERRO_CHI`, `FERRO_DENSITY`, `WATER_DENSITY`, `MAGNET_BR`; PLAN 38k), and the WGSL gives the field as a vector too (`magnetVec`, `magnetDiscFieldVec`) so several magnets add as fields. `standing.ts` exports `LIFT_ONSET`, the film's lift scale against the onset.

## Contracts

- Solver kernels write the fields; `pack.ts` turns them into the plate the composite reads. The composite never writes a solver field.
- Kernel sets are composed from shared parts passed as strings (`thinGapKernels(HEAD, W, NOISE)`, `slumpKernels`, `filmKernels`).
- Imports only `../uniforms` and number-only modules in `src/lib` (turntable, dye, liquidProps, handSolid, filmTable, outputConfig, videoFlow); never `components/`, `hooks/` or a device.
- `lib/magnetSize.ts` and `sim/fluidSimulation.ts` read `magnetDisc`; the rest is read by `src/gpu/*.ts`.

## Files

- `air.ts`: air splat. `splat.ts`: pours. `stats.ts`: field summaries.
- `camera.ts`, `cameraFields.ts`: camera pass.
- `ferroDrop.ts`: closeup drop. `standing.ts`: domes.
- `plateThinFilm.ts`: `THIN_FILM_WGSL`, Thin Film's rings over the plate, the film's amount read through a B-spline (PLAN 1i; `npm run filmrings`).
- `lampField.ts`: `LAMP_FIELD_WGSL`, `lampField`, `pupilPass`: the projector's light on the stage (the lamp lever, the aperture), with the CPU twin `npm run lampfield` reads.
- `film.ts`: a clear film that tears.
- `fluid/`: the solver's kernels, one file a pass.
- `output.ts`, `outputFields.ts`: projector pass.
- `pack.ts`: fields to the 8-bit plate (`PACK_KERNELS`).
- `particles.ts`: particle dye.
- `post.ts`, `postFields.ts`: post chain.
- `probe.ts`: brightness probe.
- `slosh.ts`, `soapFilm.ts`, `slump.ts`: slosh, soap film, ink slump.

## Checks

`npm run wgsl` (every shader compiles), then as relevant `physics`, `maze`, `spikes`, `disc`, `fingers`, `ferrohands`, `domes`, `ferrodye`, `microscope`, `straw`, `derive`, `grating`. `plate.ts`: `pops`, `ferrolook`, `filmrings`, `mixer`, `grainedge`, `lampzero`, `lampfield`, `litstage` and a `look` render. `output.ts`: `map`, `beams`, `wallpattern`. Also `sloshgpu`, `soapgpu`, `particles`. A changed constant: `checkguard`.
