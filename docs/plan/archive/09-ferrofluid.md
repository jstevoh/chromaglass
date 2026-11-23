# Archive: 9. Ferrofluid after the references

The closed items of [`docs/plan/09-ferrofluid.md`](../09-ferrofluid.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **9b. Maze detail**, shipped in #167: Maze Detail (0 to 1) divides `MAZE_PERIOD` by up to three, Ferro Maze at 0.5 (`npm run maze`). Whether it now matches the reference is for the Mac. Story in `docs/plan-shipped.md` §9b (moved 2026-10-29, 19m-2).
- **9w. Carry the ferrofluid across a new solver** (**shipped**): the old solver copies the ferrofluid, the mix and the reactions on the GPU before it goes (`handOver`/`takeOver` in `gpu/fluid.ts`; `npm run regrid`, `npm run magnet` check 8 on the Mac). Not carried: Oil Bodies' share of the dye, the glass's press, the particles, and 20b's clear film (#259; to be carried the same way). Not checked anywhere yet: that the app keeps the carry until the new solver's first readback, so an out-of-memory retry after a climb gets it, and that after a lost device the app's next solver refuses the old carry and lays the look's ferrofluid as before (the lab checks only a second device's refusal). Story in `docs/plan-shipped.md` §9w (moved 2026-10-29, 19m-2).
- ~~**9ae. The ferrofluid rounds at the step rate, not in seconds**~~ **shipped** (#932,
  `npm run ferrorest` 6/6). `phaseCHPlan` (`src/gpu/fluid/phase.ts`) paces Cahn–Hilliard by
  `seconds / dx²` under the explicit limit, and `phaseCapillary` (`phaseForces.ts`) drives
  two-phase Hele-Shaw Darcy rounding on `thinGap` at `σ = (ρ_ff − ρ_w) g l_c²` on Paterson's
  `2(μ_in + μ_out)R³/(b²σ)` timescale (`1.62 s` at 256²/60, `1.74 s` at 256²/30, `1.58 s`
  at 384²/60 vs `1.93 s`). 38e points here. (38v, from RS-23.)
