# src/gpu

The WebGPU engine, TypeScript side: the solver's compute passes and the plate's passes after it, encoded into one frame by the stage. Shaders are in `wgsl/`.

## Start here

- `stage.ts`: `WebGPUStage`: canvas, device, frame.
- `fluid.ts` (99 KB, grep it): `WebGPUFluid`, the solver's `step` and the pipelines built ahead. The rest of the class is in `fluid/`, and the map is in this file's header; `fluid/README.md` has the order.
- `plate.ts`: `WebGPUPlate`; `plateUniforms.ts`: `fillPlateUniforms`, settings to uniforms.
- `solverTypes.ts`: `GpuStepParams` (a step's inputs), `PlateSolver` (`GpuStepParams` carries the tank's six settings, PLAN 47n; including `speciesShare` and `speciesSnapshot`, and `pourInk`, a title's mask added to the dye at the solver's own grid, PLAN 37x-10, with an optional `carrier` laid into the species field under it, the thick ink's pad, PLAN 37x-10g; and `layOil`, the oil laid cell for cell at the solver's grid, Foam Cells' pressed drops, PLAN 47z-5).
- `kit.ts` (47 KB, grep it): `PipelineCache`, `PingPong`, `Disposer`, `bindGroup`, `ReadbackRing`, `GpuProfiler`.

## Contracts

- The solver writes the velocity, dye, phase and gap fields; the plate passes only read them, through `wgsl/pack.ts`.
- Uniforms are declared once (`uniforms.ts`, `wgsl/*Fields.ts`).
- Imports `src/lib` (turntable, slosh, dye, rimMask, outputConfig, mixer, platform, crashLog and other number-only modules) and `src/types`; never `components/`, `hooks/`, `app/` or `sim/`.
- Imported from `components/LiquidVisualizer.tsx`, `main.tsx` (`requestGpuEarly`) and `sim/` (`fluidSimulation`, `stepping`, `frameTypes`); `lib/magnetSize.ts` reads `wgsl/magnetDisc`.
- `fluid.ts` re-exports the constants it exported before it was split, so callers import them from there.

## Files

- `beadMask.ts`: the beads' mask drawn on the GPU from the list (14ab-6), and `rings`, that list's buffers for the plate to read the rings at the screen's resolution (PLAN 38h-17; null for drops or once a picture stands in).
- `air.ts`: bubbles as a field the solver carries, and `geo` (type `AirGeo`), the list as the field was last stamped from it, which the plate draws each bubble's outline from (PLAN 38h-15; the solver's `fields.airGeo`, the plate's `draw` fields).
- `camera.ts`: refraction, depth of field, bloom, grain.
- `device.ts`: `requestGpu`, `requestGpuEarly`, `classifyAdapter`.
- `ferroDrop.ts`: the closeup's ferrofluid drop.
- `fluid/`: the solver's class chain, six files.
- `glint.ts`: `PlateGlint`, the plate's lens pass (PLAN 47e, 47d-1, 47b-1): the glitter's flakes stepped on the dye's flow and splatted through the lens, and the side lamp, run after the display only while Glitter or Side Light is up (`WebGPUPlate.glint`; `npm run glint`).
- `groupCache.ts`: `groupOf`, `viewOf`: bind groups and views made once.
- `opening.ts`: pipelines the opening look needs.
- `output.ts`: projector pass: mirror, keystone, blanking, grade.
- `padGrab.ts`: the remote's Draw picture.
- `particles.ts`: dye carried by particles.
- `post.ts`: post-effects chain and finish.
- `prepare.ts`: `prepareShow`, pipelines built before opening (three at a time) and behind it (two); `prepareLog` (each prepare once done), `prepareProgress` (each while it runs: builds settled, the last settle, the cap on one build) and `pipelinesSeen` (both and the ledger, for `chromaglassDebug().pipelines()`).
- `probe.ts`: delivered brightness for the flash guard.
- `readGate.ts`: `ReadGate`, when a readback is worth taking.
- `rimRead.ts`: `RimRead`, the mean inside the dish's rim and the unpadded `data` read back with it.
- `selftest.ts`: kit tests, `?debug`.
- `slosh.ts`, `soapFilm.ts`, `lampBoil.ts`, `standing.ts`: slosh dish, soap film, lamp-boiling dish, ferrofluid domes. `soapFilm.ts` also exports `encode(enc, dt, opts)` (the step into a caller's encoder) and `buffers` (`h`, `ext` the outside push on the faces, `stats`, `ruptured`, `age`) for the plate's film.
- `soapFilmPlate.ts`: the frame's soap film on the plate (PLAN 32d): `SoapFilmPlate` (made by the solver when Soap Film is up; `step(enc, seconds, vel, travel)` blows it with the plate's flow and draws it again when drained; `field` is `{ h, nx, ny }` for the plate; `SoapFilmPlate.prepare(device, open)` lists its eight pipelines for `prepareShow`, ahead when `openingOf` says `soap`), `soapFilmStep` (the step's params, the front plate's only), `freshFilm` and the film's constants. `soapFrame.ts`: where the frame sits on the plate (`SOAP_FRAME_LO`, `SOAP_FRAME_SPAN`).
- `tank.ts`: the tank seen through its side (PLAN 47n): `createTankGpu(device, { nx, ny, width })` → `{ write, step, encode(enc, dt, opts), read, field, destroy }`, a vertical slice of water with heavy dye (the CPU reference is `lib/tank.ts`); `TANK_CYCLES`, the pressure's multigrid V-cycles a substep (`TANK_MAX_CYCLES` the most a caller may ask). `tankPlate.ts`: `TankPlate` (made by the solver while Tank is up, `step(enc, seconds, params, holds)`, a held finger carrying the nozzle; `field` is `{ c, nx, ny, colour, glow }` for the plate), `tankStep` (the step's params, the front plate's only), `hueColour`, the tank's grid `TANK_PLATE_NX`, `TANK_PLATE_NY`, `TANK_PLATE_WIDTH`, `TANK_NOZZLE_W`. `tankDraw.ts`: `drawTank`, the tank drawn into the plate's two targets in its place (`plate.ts` calls it before its own display, which it skips when the front plate has a tank). `besidePlate.ts`: `besideStep(settings, layer)`, the soap film's and the tank's step params in one spread for `sim/fluidSimulation.ts`.
- `splats.ts`: a frame's pours as GPU records.
- `uniforms.ts`: `layOut`, `wgslStruct`, `UniformPack`.

## Checks

`npm run quick`; by hand `lint`, `wgsl`, `physics`, `maze`, `spikes`, `disc`, `straw`, `derive`. `output.ts`: `map`, `beams`, `wallpattern`. Per-frame calls: `framegroups`, `framereads`, `frameuploads`. `slosh.ts`, `soapFilm.ts`, `lampBoil.ts`, `particles.ts`, `tank.ts`: `sloshgpu`, `soapgpu`, `boilgpu`, `particles`, `tankgpu` (and `tank` for `lib/tank.ts`). `standing.ts`: `standing`. A changed constant: `checkguard`.
