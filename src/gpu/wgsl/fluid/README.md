# src/gpu/wgsl/fluid

The solver's WGSL kernels, one file a pass (PLAN 19ai-6). Each file exports a table of kernels (`SPLAT_KERNELS`, `GAP_KERNELS`, ...) and `../fluid.ts` spreads them into `KERNELS`, the one table every pass is asked for by name through `kernel(name, format)`. That index has no map of its own: its import list is the list of files below.

## Files, roughly in the order a step meets them

- `shared.ts` (19 KB): what every kernel is built from: the Sim and Args buffers (`SIM_STRUCT`), `NOISE_WGSL`, `HEAD`, `W`, the thin gap's faces (`THIN_FACE`), the magnet's energy.
- `splats.ts`: a hand's or a pour's dye and velocity deltas, and the splats of the oil and the poured liquids.
- `gap.ts`: the gap between the glasses and the squeeze film of a press.
- `forces.ts`: the liquids' forces, the current, the turntable's swirl, confinement, the slosh.
- `pressure.ts`: the projection: Jacobi, red-black, the multigrid's levels, the gradient.
- `carry.ts`: advection, MacCormack, the conserving carries, the substep plan, the glass's drift.
- `phase.ts`, `phaseForces.ts`, `labyrinth.ts`: the ferrofluid poured and carried; its magnet force, cap and separation; the maze and the Cahn-Hilliard step.
- `oil.ts`, `capillary.ts`: the oil and its bodies; its chemical potential, rim and film.
- `dye.ts`: dispersion along the flow, the grain, sharpening, decay and drain.
- `gridFilter.ts`: the passes that take the grid's own pattern out of the dye.
- `reactions.ts`: the BZ reaction, Liesegang rings, the Gray-Scott print.
- `fields.ts`: `packView` for the plate, a field boxed to the logical grid, a field cleared.

## Contracts

- Kernels moved as they were, so bindings stay as `../fluid.ts` documents: 0 the Sim, 1 the Args, then the textures a pass reads, the one it writes, a sampler.
- The thin-gap, film and slump kernels are not here; `../fluid.ts` composes them from `../thinGap.ts`, `../film.ts` and `../slump.ts` with `HEAD` and `W`.
- A kernel is named in the TypeScript side (`src/gpu/fluid.ts`, `fluid/passes.ts`) by its key; renaming one is a rename there too.

## Checks

`npm run wgsl` compiles every kernel. Then `physics`, `maze`, `spikes`, `straw`, `derive`, `ferrodye`, `turing`, `plate` as the pass needs. A changed constant: `checkguard`.
