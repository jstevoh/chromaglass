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

## The frame budget (Wave 4, lane C, M or S each)

- ~~**H2c-5 · First-order velocity** (C, S).~~ **Shipped** (`src/gpu/fluid.ts`, `npm run encode` open plate 500 → 498 dispatches, 0 velocity MacCormack corrections, 1 velocity carry; `stages` 512² open plate `advect velocity` 0.406 / 0.303 ms → 0.019 / 0.025 ms; `ab` open-plate `edge%` 1.5 → 1.3; `samelook` all checks passed; story in `docs/plan-shipped.md`).
- ~~**H2c-8 · Air only where there are bubbles** (C, S).~~ **Shipped** (`src/gpu/air.ts`, `src/gpu/fluid/`, `src/gpu/fluid.ts`, `src/components/LiquidVisualizer.tsx`, `npm run encode`: 0 air passes a step and 0 air textures alive on a bare plate vs main 1 and 2, control 1 a step and 4 alive; `bubblephysics` 24/24 and `pops` 9/9 unchanged to the printed digit; story in `docs/plan-shipped.md`).
- ~~**H2c-6 · No aux target while the camera is off** (C, S).~~ **Shipped** (`src/gpu/plate.ts`, `npm run framereads`: off from the first frame 2 targets and 1 frame-size texture alive → 1 and 0, and again after the camera was on, 2 and 1 → 1 and 0, the camera-on control still 2 targets with `auxTarget` there; 46b; story in `docs/plan-shipped.md`). Left: the tank's draw (`src/gpu/tankDraw.ts`) and the projector sources' `aux (sources)` still write a second target nothing but the lens pass can read; a one-target variant of each is a later item.
- ~~**H2c-7 · Readback straight into its ring** (C, S).~~ **Shipped** (`npm run framereads`: 1.00x a field's bytes copied a field in 2 copies with slots free, down from 2.00x in 4; 0 dispatches and 0 copies when full, down from 12 and 12 in 6 full asks; `rbStaging` dropped; story in `docs/plan-shipped.md` §40).

## Governor, wall and projector (Wave 4 and lane A, S each)

- ~~**14a-timers · A covered window still glides** (B, S).~~ **Shipped**: `pumpShowIntervals(now)` in `src/lib/showClock.ts`, driven from the ear worker's 16 ms tick in `src/hooks/useAudioAnalyzer.ts`, and `src/lib/simulatedMusic.ts` on `showInterval`; a 4 s look fade steps 121 times hidden (was 4) and 121 visible (`npm run timers`). Story in [`docs/plan-shipped.md`](../plan-shipped.md) §14.
- ~~**14j-gamepad · No timer without a pad** (B, S).~~ **Shipped**: `src/hooks/useGamepad.ts` arms its 16 ms poll on `gamepadconnected` (or at mount when `navigator.getGamepads()` already has a pad) and clears it on the last `gamepaddisconnected` (0 timers with no pad, was 1; `npm run timers`). Story in [`docs/plan-shipped.md`](../plan-shipped.md) §14.
