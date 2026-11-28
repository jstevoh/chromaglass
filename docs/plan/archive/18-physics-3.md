# Archive: 18. The physics under the look: where the plate imitates a result instead of simulating it (continued)

The closed items of [`docs/plan/18-physics-3.md`](../18-physics-3.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 18m. A drop slumps under its own weight (replaces a drop that sits or blurs)

- ~~**18m-5. The grid filter makes dye at a drop's rim.**~~ **Shipped**: `dampGrid` takes its clamp's excess back across the 7×7 neighbourhood around the stencil (`dampGridCurv`, `dampGridLimit`, `dampGrid`); story and numbers in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- ~~**18m-5a. Run `npm run slump` with the grid filter on.**~~ **Shipped**: checks 1 to 11 run with `dampGrid` on, and check 14 holds the glycerine drop's dye and front to the filter-off run; story in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- ~~**18m-5b. The grid filter's three passes each work out the stencil again.**~~ **Shipped**: `dampGridCurv` stores c, `dampGrid` writes only near a clamp and reads β once per workgroup; the dye is the same to the bit, and the stage's Metal time fell by a third to a half; story in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- ~~**18m-5c. The grid filter still reshapes a slumping drop's edge.**~~ **Shipped**: `[lo, hi]` is held to `here` unless the cross-curvature `m = δx²δy²f` oscillates along both grid axes (`ax & ay` in `dampGridCurv`, `dampGridLimit`, `dampGrid`), `npm run slump` 14b holds the 2% front to +0.000 mm of the bare run's at 2 s and 20 s, and `--owed=front` is removed from `scripts/checks.json`; story and numbers in [`docs/plan-shipped.md`](docs/plan-shipped.md).
- ~~**18m-1a. Implicit backward-Euler slump step and grid-independent inertial flux.**~~
  **Shipped** (#1038). The explicit substeps (`SLUMP_SUBSTEPS =
  20` against `SLUMP_FACE = 0.24`) and the per-face `min(a, 0.24)` guard are gone: the slump is a
  backward-Euler step `(I − Δt∇·K∇)A = Aⁿ` with lagged K, red-black sweeps from Aⁿ (`slumpSmooth`)
  and the fluxes taken from what they reach (`slumpApply`), so the dye is kept exactly whether the
  sweeps converge or not; the substep's last half-sweep keeps the mean of its two half-states, which
  takes a red-black solve's one-coloured residual off the plate (a checkerboard of 1.4% of the
  pool's dye at three sweeps without it). The inertial regime is a cap on the layer's flux, `|K∇A| ≤
  u_f A`, the Froude speed of the faster of a face's two cells, not `K_inert = u_f Δx`: the deep
  heavy pool of `npm run slump` 12 at 2 s stood at 1.07 in its middle on 256², 1.96 on 1024² before
  (CPU model of main's kernels; lab numbers in the PR), 1.048 on every size after (`npm run slump`
  15, 768² against 1024²). Substeps keep the fastest front under a cell (`SLUMP_COURANT`), up to
  `SLUMP_SUBSTEPS = 8`; sweeps `2a + 2`, 4 to `SLUMP_SWEEPS = 12`; the plan is
  `src/gpu/fluid/slump.ts`. Not the thin gap's multigrid: the solve's reach is a few cells a step,
  and sweeps match a two-cycle V-cycle's front to 0.01 mm at 512² (wgsl/slump.ts says why). Open
  after it: **18m-1b**.
