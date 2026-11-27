# Archive: 46. The quality and efficiency hunt: a faster opening, no dropped frames, the look kept

The closed items of [`docs/plan/46-quality-efficiency-hunt.md`](../46-quality-efficiency-hunt.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## Items

- **46-0 · The guards** (**shipped**, this PR): `npm run samelook` (the look kept, above;
  controls every run on Classic and Roy: the same tree twice byte for byte, the two trees'
  bundles differing exactly when src/ does, a rounding-sized change passing, and a coarser
  grid, half the picture's pixels, a tenth slower flow and Ferro Paint's magnet off each
  failing) and `openingtime --bar --owed=count` in Measure's browser2 part, on software WebGPU (Classic
  asks WebGPU for at most 52 pipelines before its first step, main 66; owed until 46a). Reviewed by a skeptic
  pass before merge; what it found and was fixed is in the PR.
- **46a-2 · A smaller display: shipped by 14v-12** (2026-11-14, a Claude thread, not
  Antigravity's: the owner's report of a thirty-second start on a phone). The opening
  compiles the display with only the effects its look can reach and builds the whole one
  behind the show; every look the same bytes (`npm run leandisplay`). Story in
  `docs/plan-shipped.md` §14v-12; what is left of it is 14v-14 and 14v-16.

## The audit of 2026-11-13: where a frame's CPU and GPU go, measured and read

- ~~**46f · The ear's view and the desk's clock render themselves, not the shell**~~
  (**shipped**, `npm run renders`: components rendered a second with the band 5,840 → 11 on
  the laptop, 714 → 0 on the phone; no sound 531 → 1 and 65 → 0; story in
  `docs/plan-shipped.md`).
- ~~**46g · The poured liquids' fields are carried only once something is poured**~~
  (**shipped**, `npm run encode`: a thin-gap step 400 dispatches, direct and indirect, → 334,
  the open plate 500 → 494, and a liquid poured brings its carries back; `physics`,
  `liquids`; with it 14ab-11's first parts, the uploads of a step with bubbles or music
  1.33 MB → 0.04 to 0.24, and the liquids' step asking for no flush at all; story in
  `docs/plan-shipped.md`).
- ~~**46r · Three writes in one step shared the args name `'current grid'`**~~ (**shipped**
  with 15e-1, `npm run argnames`; story in `docs/plan-shipped.md`, "15e-1 (met again as
  14ab-16) and 46r"). 46r-1, above, was found with it.

## Items

- **46a · A faster opening** (**shipped** — story in [`docs/plan-shipped.md`](../plan-shipped.md#46a-a-faster-opening-2026-11-14)):
  Classic's opening ledger cut from 67 to 52 pipelines (WebGPU calls before the first step
  cut from 68 on main to 54–57 with `later` builds starting ahead of step 1; down from 66
  WebGPU / 65 ledger before `heatPack`/`heatUnpack` landed on main), via five back-to-back
  kernel fusions (`deltaFold`, `forcesB`, `grainStep`, `decay`, `packVel`), direct `cpuMulTex`
  sampling in `deltaFold` (keeping `cpuDyeTex`/`cpuVelTex` upsampling), `enc.clearBuffer` in
  `clear()` (keeping `mgZero` in `hsCycle()`), `velScratch` freeing `scaleDye:dye`, and
  deferring `jacobi:dye`, `airGiveSub:thin`/`airGiveThin:thin`, `beadDrops`/`beadHoles`/`beadFinish`,
  `packDyeBodies`, and `output` behind the opening (`later`). Removed `--owed=count` from
  `scripts/checks.json` (`openingtime --bar` still prints 54 > `OPENING_MOST = 52` because all
  52 ledger pipelines are drawn in Classic's first 40 steps after `#811` and `prepareShow` starts
  `later` before step 1 — flagged for `46-3`); `samelook` 0.00% diff across all 6 looks,
  `physics` 20/20, `thingap` 16/16, `argnames` 9/9, `liquidpush` 9/9, `dropcolour` 4/4, `videoflow` 24/24.
  Main's deploy open shard startup first-step time (was 15.48 s) to be recorded after merge.

## The audit of 2026-11-13: where a frame's CPU and GPU go, measured and read

- ~~**46k · `dyeDisperse` runs as an exact no-op where diffusion is zero**~~ (**shipped**,
  `disperseDye` and `disperseWanted` in `src/gpu/fluid/passes.ts`: gated on `bodies || dm > 0
  || (kappaT > 0 && dispCells > 0)` so Classic and the other looks with Diffusion Rate at 0
  and no Oil Bodies skip the full-grid dispatch; Oil Bodies stays outside the gate because
  `bodyUnspread` clamps `dye` against `oilDye` after `slump` and `decayDye`; `samelook`,
  `physics`, `encode`; story in `docs/plan-shipped.md`).
