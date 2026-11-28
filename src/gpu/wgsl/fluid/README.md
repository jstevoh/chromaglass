# src/gpu/wgsl/fluid

The solver's WGSL kernels, one file a pass (PLAN 19ai-6). Each file exports a table of kernels (`SPLAT_KERNELS`, `GAP_KERNELS`, ...) and `../fluid.ts` spreads them into `KERNELS`, the one table every pass is asked for by name through `kernel(name, format)`. That index has no map of its own: its import list is the list of files below.

## Files, roughly in the order a step meets them

- `shared.ts` (19 KB): what every kernel is built from: the Sim and Args buffers (`SIM_STRUCT`, whose last two slots are the oil's weight and swelling, PLAN 27f-9c), `NOISE_WGSL`, `HEAD`, `W`, the thin gap's faces (`THIN_FACE`, and `thinFaceWith(restGap)` for a kernel whose rest gap is elsewhere: since PLAN 18a-8 they read the solve's own faces from a `flow: array<vec4f>` binding, the slot the solve's P had), the magnet's energy.
- `splats.ts`: a hand's or a pour's dye and velocity deltas, and the splats of the oil and the poured liquids.
- `gap.ts`: the gap between the glasses and the squeeze film of a press.
- `forces.ts`: the liquids' forces (`liquidForces`; on a thin gap only its drags, and a bottle's weight down a rocked plate is `liquidDrive`, PLAN 15e-10) and the soap's thinning of the dye (`soapThin`), the current (the old plate's own field on the M grid; a thin gap takes what drives it, `currentDrive` and `boilLift`, at its own cells in `forcesB`, PLAN 18a-4; `npm run thincurrent`), the turntable's swirl, confinement, the slosh, and in `forcesB` Hold Apart's stress between unlike dyes (Korteweg's, `S.tension` and `S.holdCap`; nothing at the dial's 0, where two dyes in one water mix, PLAN 18d-6; `npm run forces` line 6), which `holdSoft` (one pass of the blur of the dye, on the stress's own 32-bit grid) and `holdStress` (the stress's divergence there, by nine-point differences) work out while the dial is up.
- `pressure.ts`: the projection: Jacobi, red-black, the multigrid's levels, the gradient.
- `carry.ts`: advection, MacCormack, the conserving carries, the substep plan, the glass's drift; and `ACROSS`, the corner's transverse share the thin gap's dye carries take (`cornered` in `../fluid.ts`, PLAN 18a-8, `npm run gridiso`).
- `phase.ts`, `phaseForces.ts`, `labyrinth.ts`: the ferrofluid poured and carried; its magnet force, cap and separation; the maze and the Cahn-Hilliard step.
- `capillary.ts` also holds THREAD (PLAN 38w-27, `npm run beads`): a thread of oil narrower than the gap is round, so the edge's curvature gains its 2/w − 2/h across the gap and the thread beads (Rayleigh–Plateau); `mixForce` and `rimLaplace` bind the squeeze (`sq`) for the local gap, and `THREAD_CELLS`, `THREAD_REACH` are its exports; `THREAD_PULL` (PLAN 47k, `npm run pinch`) slows a thread's whole pull by one factor, so the per-cell clip no longer flattens Rayleigh–Plateau and the beads come at the law's 4.7 widths.
- `split.ts` (PLAN 38w-33, `npm run splitcarry`): the dye's two liquids' shares through the faces in one pass, split (the dye less the oil's share) and joined in every substep, each share with its own limiter (`SPLIT_KERNELS`: `bodyAdvectSplitSub`, the thin gap's first substep, which splits as it reads, and `bodyAdvectSplitOnSub`, the rest, which carry the water's share's own texture, both writing the joined dye too; `../fluid.ts` wraps both in the air's room as their Air kernels; `bodyAdvectSplit` on the old plate; `driftShiftSplit`, the glass's drift of both). In the carries the share is each function's first argument, `t: i32`, so the air's room wraps them as it wraps the pair, and `monomorph` then writes each share's functions out on their own. `perShare` turns a kernel nonlinear in its field (`carry.ts`'s `driftShift`, `../fluid.ts`'s `airShed`, giving `airShedSplit`) into one that runs on each share apart, the share a `var<private> which`.
- `oil.ts`, `capillary.ts`: the oil and its bodies (each liquid's colour: `bodyLand`, `bodyLay` for a lay that says which colour is the oil's, `bodyPartition`; `bodyWater` and `bodyJoin`, the dye split into its two liquids' shares round the carry so the oil's colour rides as the oil does, on the thin gap with or without air and on the old plate, `bodyAdvectSharp` and its Sub and SubAir in `../fluid.ts`, PLAN 38w-29, 38w-32; since 38w-33 only the measuring way, see `split.ts`); its chemical potential (a deep-quench double well, `OIL_SPINODAL` and `OIL_WELL` from `../../fluid/constants.ts`, PLAN 38f-2), rim and film.
- `dye.ts`: dispersion along the flow, the grain, sharpening, decay and drain, and the heat's pack and unpack round its carry on a thin gap (heatPack, heatUnpack, PLAN 38f-1).
- `gridFilter.ts`: the passes that take the grid's own pattern out of the dye.
- `reactions.ts`: the BZ reaction, Liesegang rings, the Gray-Scott print.
- `seal.ts`: `SEAL_KERNELS`, a standing plate's weight as a sealed bottle's circulation (`sealSource`, `sealFlow`; PLAN 27f-9), relaxed on thinGap's `hsLiftRelax` and its `LIFT_GRID`.
- `ouzo.ts`: `OUZO_KERNELS`, the ouzo effect (PLAN 48s): `ouzoCloud`, which moves a cell's anise oil between dissolved and droplets by the measured binodal (`OUZO_BINODAL`, `../../../lib/ouzo.ts`) and empties the solvent field past the rim, and `ouzoView`, the species with the droplets' scattering added for the plate. The solvent field's four numbers are in its header.
- `fields.ts`: `packView` for the plate, a field boxed to the logical grid, a field cleared.

## Contracts

- Kernels moved as they were, so bindings stay as `../fluid.ts` documents: 0 the Sim, 1 the Args, then the textures a pass reads, the one it writes, a sampler.
- The thin-gap, film and slump kernels are not here; `../fluid.ts` composes them from `../thinGap.ts`, `../film.ts` and `../slump.ts` with `HEAD` and `W`.
- A kernel is named in the TypeScript side (`src/gpu/fluid.ts`, `fluid/passes.ts`) by its key; renaming one is a rename there too.

## Checks

`npm run wgsl` compiles every kernel. Then `physics`, `maze`, `spikes`, `straw`, `derive`, `ferrodye`, `turing`, `plate` as the pass needs. A changed constant: `checkguard`.
