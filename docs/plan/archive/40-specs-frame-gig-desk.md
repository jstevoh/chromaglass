# Archive: 40. Specs for the thin items, part 1: the frame budget, the gig and the desk

The closed items of [`docs/plan/40-specs-frame-gig-desk.md`](../40-specs-frame-gig-desk.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.

## The frame budget (Wave 4, lane C, M or S each)

- ~~**H2c-10 · Pinned grids a multiple of 32** (C, S).~~ **Shipped** (`src/sim/stepping.ts`, `npm run rungs`: 514 → 512, 1000 → 992, 777 → 768, 100 → 96, and `npm run encode -- --grids` residual guard green; story in `docs/plan-shipped.md`).
- ~~**H2c-labels · Timestamp labels kept with their ring slot** (C, S, with 14r).~~ **Shipped** (`src/gpu/kit.ts`, `npm run timelabels`: 133 → 0 readings off their pass across the five lag and stall runs, `gpuFrameMs` move on a change 30.0 % → 0.0 %; story in `docs/plan-shipped.md`). The flash probe's pixel count has the same fault (14r, in the quarter-wall brief).

## Governor, wall and projector (Wave 4 and lane A, S each)

- ~~**14b-120 · A 120 Hz desk with a 60 Hz projector draws 120 a second** (A, S).~~ **Shipped** (`DrawGate.paceTo = 'wall'` in `src/lib/drawGate.ts`, `npm run rungs`: 60.0 to 60.0/s over ten phases; story in `docs/plan-shipped.md`).
- ~~**14c-4k · A 4K wall opens at the right rung** (A, S).~~ **Shipped** (`stageLadder` in `src/lib/platform.ts`, `npm run rungs`: 3840×2160 opens on 2880×1620, 4.67 Mpx, 0 of 8 move down in the first 10 s; story in `docs/plan-shipped.md`).
- ~~**14c-governor · A wall coming or going keeps the governor's memory** (A, S).~~ **Shipped** (`QualityGovernor.carry` in `src/lib/governor.ts`, `npm run rungs`: 2 changes after the wall vs 2 with none; story in `docs/plan-shipped.md`).
- ~~**14c-readout · The readout says what the share is of** (A, S).~~ **Shipped** (`engineLabel` in `src/sim/stepping.ts`, `npm run rungs`; story in `docs/plan-shipped.md`).
