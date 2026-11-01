# src/gpu/fluid

The WebGPU solver's class, split by what its members do (PLAN 19ai-7). Each file's class extends the one below, and `WebGPUFluid` in `../fluid.ts` sits on top, unchanged to every caller. The map is in the header of `../fluid.ts`; this is the same chain in the order a frame meets it.

## Files, in the order a step runs

- `constants.ts` (37 KB, grep it): the constants (`REST_GAP`, the gap field's rest number in gap units, and `REST_GAP_METRES` and `GAP_METRES`, the rest gap in metres and the metres in a unit of the field, which every reader of the gap as a length takes, PLAN 38r; `NU_REF`, `THIN_GAP_THICKNESS`, the carry and film numbers), the shapes handed out (`FieldStats`, `FieldCarry`) and the few physics helpers. No class.
- `soap.ts`: the soap's numbers (PLAN 38c, 38c-3), no class: `soapPlan` turns Soap Bursts, the step's seconds, the grid and Soap Breakdown (`soapBreakdownRate`) into the Marangoni pass's substeps, pull and caps, the mix's molecular diffusion and the step's surfactant retention `exp(−k·seconds)`, and `SOAP_D`, `SOAP_SPREAD`, `SOAP_FRONT`, `SOAP_SPREAD_MAX` hold them in metres and seconds. `../fluid.ts` reads it.
- `core.ts`: `FluidCore`. Every field, the constructor, `clear`, and the pipeline and bind-group helpers.
- `fields.ts`: `FluidFields`. The fields a look makes on first use (the mix, the film, the reaction's grids, the thin gap's), the getters the frame loop reads, `dispose`.
- `inputs.ts`: `FluidInputs`. What is put in from outside a step: `applyDeltas`, `applySplats`, the poured image and video, chemistry, phase, film and liquids, `handOver` and `takeOver`.
- `passes.ts`: `FluidPasses`. What a step runs: the projection (Jacobi and multigrid), the thin gap's solve and its substepped carries, the swirl, the phase passes, the species, the particles.
- `reads.ts`: `FluidReads`. What comes back: `readbackAsync`, `measure`, `readField` and the checks' single-field reads.

`../fluid.ts` holds `WebGPUFluid`: `step` itself, which calls the passes in order, the pipelines built ahead (`prepare`) and the thin-gap and old-plate builds.

## Contracts

- The members were moved, not rewritten; a member another file reaches is `protected` where it was `private`.
- Each class extends only the one below it, and nothing here imports `../fluid.ts`, which re-exports the constants it used to hold.
- A few checks read these files as text (`plate`, `turing` read the shaders, `slosh` reads `constants.ts`); a move carries their paths with it.

## Checks

`npm run lint`, `wgsl`, then `physics`, `soap`, `maze`, `spikes`, `straw`, `derive` as the pass needs. A changed constant: `checkguard`. Per-frame calls: `framereads`, `frameuploads`.
