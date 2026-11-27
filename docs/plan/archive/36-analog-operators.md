# Archive: 36. What the analog operators could not do (researched 2026-10-27)

The closed items of [`docs/plan/36-analog-operators.md`](../36-analog-operators.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **36e-1. The model and its check, on the CPU (shipped).** `src/lib/lampBoil.ts` is the reference the GPU build (36e-2) is held to and `npm run boil` its judge (#352 took the buoyancy tanh out). Story in `docs/plan-shipped.md` §36e-1 (moved 2026-10-29, 19m-2). *Owed with 36e-4:* `boil`'s dry-out look-alike passes today (it throws away 1.7% of the lamp's heat, moving the ledger 0.16%, under its 3% bar); once the glass absorbs the infrared, that build adds a tighter dry-out ledger line.
- **36e-2. The GPU build (shipped).** `src/gpu/lampBoil.ts` (`createBoilPlateGpu`), `src/gpu/wgsl/lampBoil.ts` (`BOIL_DISH_WGSL`, `PLATE_BOIL_WGSL`), the plate's `stepPlateBoil` pass in `src/gpu/fluid/passes.ts` keeping the boil's temperature in float32 (`boilAlpha.g` in `rg32float`, updating `vel.z` and taking any external write to `vel.z` more than one half-float ULP from its own), feeding `hsPour` (liquid thermal expansion in the thin gap's projection) and `air.field` (the vapour fraction shaded as H6's air, stepped before `air.splat` so `thinGap.ts` counts the steam's volume once), Kell buoyancy in `currentForces` (`src/gpu/wgsl/fluid/forces.ts` and `src/sim/stepping.ts`) scaled by `BOIL_BUOY_PER_KG_M3` ($1 / |d\rho/dT(T_{\text{ambient}})|$) while the boil runs with `clamp(temp, 0, 50)` and `maxCurrent` out of the heat's way (and today's current byte-for-byte at Heat 0), the **Heat** dial (`heat`, default 0, excluded from Evolve in `NOT_THE_LOOK`, on Settings → Lamp & Light, Perform desk, MIDI, remote and phone) and the held-hand air block (`boilHolds` on desk, iPad and phone). `npm run boilgpu` 54/54 on `apple metal-3` (`cost: 4.40 ms a step at 768 × 768 on apple metal-3, lamp on`), `npm run plateboil` 8/8 (`zero`) and 6/6 (`boil`); `docs/judging.md` §115. Story in `docs/plan-shipped.md` §36e-2.
- **36e-2b. The live plate's boil, its check (shipped).** `boilgpu` holds the dish solver; the boil the app steps on the plate every frame
  (#718's `stepPlateBoil`, `PLATE_BOIL_WGSL`, the current beside it) had no line, and the
  review of #718 found three faults there. `npm run plateboil` (scripts/plateboil.mjs):
  *boil* (the Mac's plate shard, `rate,hold,fan,steam,writes` now out of `--owed`): a level dish of dark
  dye at Heat 1, Heat Decay at the app's 0.98, warmed at the app's longest frame (0.1 s,
  FluidSimulation's clamp) and then stepped at 1/60 s. `rate` the 1/60 s approach heats
  as the warm-up did (the hand's mean, 0.6x–1.4x, still climbing); `hold` under a held
  hand the spot reaches 100 °C and steam shows in the air field within 150 s (a site's
  superheat, about 4.3 K at the lowest under the hand, comes on top); `fan` under the fan,
  after 15 minutes, over 80 °C and under 100 °C at every read, no steam; `steam` the dye
  that leaves a ring twice the hand's size, less the ring's own drift, is what the steam's
  volume displaced (0.5x–1.5x) and arrives in the annulus beyond (0.7x–1.3x); `writes`
  30 K poured out of the fan plate's spot stays out ten 1/60 s steps later (a boil that
  keeps a private copy and writes it back passes the rest on a still level plate). An f64
  port of #718's own heat balance reads 100 °C at 258 s under the hand and 94 °C after 15
  minutes under the fan. #718's first head (cc0f6523) read 0/4 on the first four: its hand's
  plate climbed in half-float quanta to 84.8 °C at 0.1 s steps and then cooled at 1/60 s
  (vel.z is a half float: once 64 K over the room a step is 1/16 K and a frame's 0.007 K
  rounds away), its fan's stopped at 67.7 °C, and no steam. *zero* (Measure's lab2, holds on
  main): Heat 0 keeps today's current byte for byte, the tree's `currentForces` against
  today's (scripts/plateboil-today.mjs, generated from main at 50159cb) in a second lab on
  SwiftShader, three plates with a spot over the clamp's 50 K, the fluid.ts lines that
  pack its uniforms held to today's text, and FluidSimulation's `stepCurrent` against
  today's body. #718's first head read 20 084 and 20 889 values different on the upright plates and
  89 872 on the CPU; the level plate was the same (S.curBuoy is already upright ×
  Buoyancy, so #718's uncapped branch never ran there). With the 36e-2 fix in place (the
  temperature kept in `boilAlpha.g`, a float32 channel of the `rg32float` boil field, with
  writes to `vel.z` taken when more than one half-float ULP from the boil's own; `poured`
  carrying liquid expansion while the air field's rate carries the steam's volume once, with
  `stepPlateBoil` before `air.splat`; and the Kell branch gated on `A.a.z > 0.0` / `(p.heat ?? 0) > 1e-4`),
  `npm run plateboil` reads 8/8 on *zero* and 6/6 on *boil* (`rate` 0.98x, `hold` steam at
  142 s peaking 108.7 °C, `fan` 85.8 °C with 0.000 steam, `steam` 1.01x displaced and 1.00x
  arriving beyond the ring, `writes` 1.00 kept). One check-skeptic pass; its
  six findings are in the check.
