# src/gpu/fluid

The WebGPU solver's class, split by what its members do (PLAN 19ai-7). Each file's class extends the one below, and `WebGPUFluid` in `../fluid.ts` sits on top, unchanged to every caller. The map is in the header of `../fluid.ts`; this is the same chain in the order a frame meets it.

## Files, in the order a step runs

- `constants.ts` (37 KB, grep it): the constants (`REST_GAP`, the gap field's rest number in gap units, and `REST_GAP_METRES` and `GAP_METRES`, the rest gap in metres and the metres in a unit of the field, which every reader of the gap as a length takes, PLAN 38r; `NU_REF`, `THIN_GAP_THICKNESS`, the carry and film numbers; `LIFT_KERNELS` and `SEAL_KERNEL_NAMES`, the oil lift's and the sealed bottle's kernels, PLAN 27f-5 and 27f-9; `OIL_SPINODAL` and `OIL_WELL`, the oil's deep-quench double well, PLAN 38f-2), the shapes handed out (`FieldStats`, `FieldCarry`) and the few physics helpers. No class.
- `soap.ts`: the soap's numbers (PLAN 38c, 38c-3), no class: `soapPlan` turns Soap Bursts, the step's seconds (a 60th when left out), the grid and Soap Breakdown (none when left out) (`soapBreakdownRate`) into the Marangoni pass's substeps, pull and caps, the mix's molecular diffusion and the step's surfactant retention `exp(−k·seconds)`, and `SOAP_D`, `SOAP_SPREAD`, `SOAP_FRONT`, `SOAP_SPREAD_MAX` hold them in metres and seconds. `../fluid.ts` reads it.
- `core.ts`: `FluidCore`. Every field, the constructor, `clear`, and the pipeline and bind-group helpers.
- `fields.ts`: `FluidFields`. The fields a look makes on first use (the mix, the film, the reaction's grids, the thin gap's), the getters the frame loop reads (`fields.oilDye`, the oil's share of the dye for the plate's pack, PLAN 47z-1; `fields.soapFilm`, the frame's soap film's thickness for the plate, PLAN 32d, null when Soap Film is off; `fields.tank`, the tank's dye for the plate to draw in its place, PLAN 47n, null when Tank is off; `fields.particles`, which in the closeup is the fine dye's detail), the closeup's fine dye (`setCloseupWindow`, `fineWindow`, `fineStrength`, `fineDetail`; gpu/fineDye.ts, PLAN 47a, stepped at the start of `stepParticles` in `passes.ts`), `dispose`.
- `inputs.ts`: `FluidInputs`. What is put in from outside a step: `applyDeltas` (its `oilAdd`, a lay's oil colour, PLAN 47z-1), `applySplats`, the poured image and video, chemistry, phase, film and liquids, `handOver` and `takeOver`.
- `passes.ts`: `FluidPasses`. What a step runs: the projection (Jacobi and multigrid), the thin gap's solve and its substepped carries (and the heat's, `carryHeat`, PLAN 38f-1), the swirl, the phase passes, the species, the particles, and the solvers beside the plate's own (`stepBeside`, before the step's pass): the frame's soap film (`stepSoapPlate`, PLAN 32d: gpu/soapFilmPlate.ts, made when Soap Film is up) and the tank (`stepTankPlate`, PLAN 47n: gpu/tankPlate.ts, made when Tank is up).
- `reads.ts`: `FluidReads`. What comes back: `readbackAsync`, `measure`, `speciesShare`, `speciesSnapshot`, `readField` and the checks' single-field reads.
- `cover.ts`: `FluidCover`. The cover glass on its liquid (PLAN 38r-5): `gapShape` lays the gap's dome on a new plate and shifts it on a new curve or a new cover height.

`../fluid.ts` holds `WebGPUFluid`: `step` itself, which calls the passes in order, the pipelines built ahead (`prepare`) and the thin-gap and old-plate builds.

## Contracts

- The members were moved, not rewritten; `OIL_RHO`, `OIL_EXPAND` and `oilRhoOf`/`oilLightnessOf`, the oil's own weight and swelling from Oil Weight, PLAN 27f-9c; `lampCoolOf`, `KAPPA_WAX`, `GLASS_FIN` and `LAMP_COOL_FROM`, a standing lamp's cool upper glass (S.lampCool, slot 54), PLAN 27f-9e; `LAMP_GLASS`, its warm floor's temperature, which water and wax both relax toward at that same rate, PLAN 27f-9h; a member another file reaches is `protected` where it was `private`.
- Each class extends only the one below it, and nothing here imports `../fluid.ts`, which re-exports the constants it used to hold.
- A few checks read these files as text (`plate`, `turing` read the shaders, `slosh` reads `constants.ts`); a move carries their paths with it.

## Checks

`npm run lint`, `wgsl`, then `physics`, `soap`, `maze`, `spikes`, `straw`, `derive` as the pass needs. A changed constant: `checkguard`. Per-frame calls: `framereads`, `frameuploads`.
