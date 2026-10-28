# src/gpu

The WebGPU engine, TypeScript side: the solver's compute passes and the plate's passes after it, encoded into one frame by the stage. Shaders are in `wgsl/`.

## Start here

- `stage.ts`: `WebGPUStage`: canvas, device, frame.
- `fluid.ts` (290 KB, grep it): `WebGPUFluid`, the solver; constants `REST_GAP`, `NU_REF`.
- `plate.ts`: `WebGPUPlate`; `plateUniforms.ts`: `fillPlateUniforms`, settings to uniforms.
- `solverTypes.ts`: `GpuStepParams` (a step's inputs), `PlateSolver`.
- `kit.ts`: `PipelineCache`, `PingPong`, `Disposer`, `bindGroup`, readback.

## Contracts

- The solver writes the velocity, dye, phase and gap fields; the plate passes only read them, through `wgsl/pack.ts`.
- Uniforms are declared once (`uniforms.ts`, `wgsl/*Fields.ts`).
- Imports `src/lib` (dye, turntable, slosh, outputConfig, mixer, platform, crashLog) and `src/types`; never `components/` or `hooks/`.
- Used only by `components/LiquidVisualizer.tsx` (and `lib/magnetSize.ts` reads `wgsl/magnetDisc`).

## Files

- `air.ts`: bubbles as a field the solver carries.
- `camera.ts`: refraction, depth of field, bloom, grain.
- `device.ts`: `requestGpu`, `classifyAdapter`.
- `ferroDrop.ts`: the closeup's ferrofluid drop.
- `opening.ts`: pipelines the opening look needs.
- `output.ts`: projector pass: mirror, keystone, blanking, grade.
- `padGrab.ts`: the remote's Draw picture.
- `particles.ts`: dye carried by particles.
- `post.ts`: post-effects chain and finish.
- `prepare.ts`: `prepareShow`, pipelines built before opening.
- `probe.ts`: delivered brightness for the flash guard.
- `selftest.ts`: kit tests, `?debug`.
- `slosh.ts`, `soapFilm.ts`, `standing.ts`: slosh dish, soap film, ferrofluid domes.
- `splats.ts`: a frame's pours as GPU records.
- `uniforms.ts`: `layOut`, `wgslStruct`, `UniformPack`.

## Checks

`npm run quick`; by hand `lint`, `wgsl`, `physics`, `maze`, `spikes`, `disc`, `straw`, `derive`. `output.ts`: `map`, `beams`, `wallpattern`. A changed constant: `checkguard`.
