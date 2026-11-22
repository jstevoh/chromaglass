# Archive: 31. Optics and the wall: what Boris FX Continuum showed (2026-10-11)

The closed items of [`docs/plan/31-optics-and-wall.md`](../31-optics-and-wall.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## 31p. Polarised light: the owner's photograph of dishes between polarisers (2026-11-14)

~~**31p-1** Polarisers, Analyser, Quarter Wave, Birefringence~~ (shipped; story in
`docs/plan-shipped.md` §31p-1; `npm run polar`).

## 31s. The liquid surface height and real caustics

- **31s-1. Surface height field on the solver grid.** — **Shipped.** Added a solver-owned height field `h` in metres (`src/gpu/surfaceHeight.ts`, `src/gpu/wgsl/surfaceHeight.ts`), conservatively advected in flux form, levelled by the thin-film lubrication equation (`dh/dt = div((h^3 / (3 mu)) grad(p))`, `p = -sigma lap(h) + rho g h`) via semi-implicit coupled 2×2 Red-Black multigrid V-cycles with exact face flux-divergence conservation, seeded where oil is poured (`mix.r`), and exposed read-only to the plate at `@binding(26)` (`src/gpu/wgsl/plateSurface.ts`) without drawing it yet. *Measure:* `PW_WEBGPU=1 npm run surfaceheight`.
