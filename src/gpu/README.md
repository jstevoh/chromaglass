# src/gpu

The WebGPU engine, TypeScript side: the solver's compute passes and the plate's passes after it, encoded into one frame by the stage. Shaders are in `wgsl/`.

## Start here

- `stage.ts`: `WebGPUStage`: canvas, device, frame.
- `fluid.ts` (99 KB, grep it): `WebGPUFluid`, the solver's `step` and the pipelines built ahead. The rest of the class is in `fluid/`, and the map is in this file's header; `fluid/README.md` has the order.
- `plate.ts`: `WebGPUPlate`; `plateUniforms.ts`: `fillPlateUniforms`, settings to uniforms.
- `solverTypes.ts`: `GpuStepParams` (a step's inputs), `PlateSolver`.
- `kit.ts` (47 KB, grep it): `PipelineCache`, `PingPong`, `Disposer`, `bindGroup`, `ReadbackRing`, `GpuProfiler`.

## Contracts

- The solver writes the velocity, dye, phase and gap fields; the plate passes only read them, through `wgsl/pack.ts`.
- Uniforms are declared once (`uniforms.ts`, `wgsl/*Fields.ts`).
- Imports `src/lib` (turntable, slosh, dye, rimMask, outputConfig, mixer, platform, crashLog and other number-only modules) and `src/types`; never `components/`, `hooks/`, `app/` or `sim/`.
- Imported from `components/LiquidVisualizer.tsx`, `main.tsx` (`requestGpuEarly`) and `sim/` (`fluidSimulation`, `stepping`, `frameTypes`); `lib/magnetSize.ts` reads `wgsl/magnetDisc`.
- `fluid.ts` re-exports the constants it exported before it was split, so callers import them from there.

## Files

- `air.ts`: bubbles as a field the solver carries.
- `camera.ts`: refraction, depth of field, bloom, grain.
- `device.ts`: `requestGpu`, `requestGpuEarly`, `classifyAdapter`.
- `ferroDrop.ts`: the closeup's ferrofluid drop.
- `fluid/`: the solver's class chain, six files.
- `groupCache.ts`: `groupOf`, `viewOf`: bind groups and views made once.
- `opening.ts`: pipelines the opening look needs.
- `output.ts`: projector pass: mirror, keystone, blanking, grade.
- `padGrab.ts`: the remote's Draw picture.
- `particles.ts`: dye carried by particles.
- `post.ts`: post-effects chain and finish.
- `prepare.ts`: `prepareShow`, pipelines built before opening.
- `probe.ts`: delivered brightness for the flash guard.
- `readGate.ts`: `ReadGate`, when a readback is worth taking.
- `rimRead.ts`: `RimRead`, the mean inside the dish's rim.
- `selftest.ts`: kit tests, `?debug`.
- `slosh.ts`, `soapFilm.ts`, `standing.ts`: slosh dish, soap film, ferrofluid domes.
- `splats.ts`: a frame's pours as GPU records.
- `uniforms.ts`: `layOut`, `wgslStruct`, `UniformPack`.

## Checks

`npm run quick`; by hand `lint`, `wgsl`, `physics`, `maze`, `spikes`, `disc`, `straw`, `derive`. `output.ts`: `map`, `beams`, `wallpattern`. Per-frame calls: `framegroups`, `framereads`, `frameuploads`. `slosh.ts`, `soapFilm.ts`, `particles.ts`: `sloshgpu`, `soapgpu`, `particles`. `standing.ts`: `standing`. A changed constant: `checkguard`.
