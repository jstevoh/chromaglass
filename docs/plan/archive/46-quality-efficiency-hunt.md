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
