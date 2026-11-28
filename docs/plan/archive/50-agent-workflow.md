# Archive: 50. Better code, a cleaner engine and a smoother plate, built by the agents (asked 2026-11-27)

The closed items of [`docs/plan/50-agent-workflow.md`](../50-agent-workflow.md), moved here whole by `node scripts/planarchive.mjs`
and kept for reference. Ids are unchanged: `grep -rn '<id>' docs/plan/` finds an item here or
in the live file. Stories moved before 2026-11-21 are in `docs/plan-shipped.md`, under the same numbers.
- **50c-1 shipped** (2026-11-27): the seam written down (`src/engine/README.md`: the engine
  owns the per-frame state, takes typed messages, sends events, imports no React) and the
  first piece moved verbatim: the pointer and the fingers (mouse, touches, Spin hands, the
  closeup's Alt-drag and two-finger camera) to `src/engine/pointer.ts`, `coverPinch.ts`
  from `components/` beside it. `LiquidVisualizer.tsx` 390,411 to 373,454 bytes. No check
  read the moved text. The order of the next moves (50c-2 debug report, 50c-3 the GPU's
  guards, 50c-4 the governor, 50c-5 the clocks: Antigravity's, briefed 2026-11-27 in the
  owner's files under `antigravity/engine-50c/`, strictly one after another; 50c-6 the
  device's start, which writes the effect's own state, so Claude designs its home first;
  50c-7 on: `renderFrame` by stage) is the README's table.
- **50c-2 shipped** (2026-11-27): the debug report (`chromaglassDebug()`), the three
  hooks `?debug` puts on `window`, and the crash log's provider and report part moved
  verbatim to `src/engine/debug.ts` (`attachDebug`). `LiquidVisualizer.tsx` 373,274 to
  359,503 bytes. 254 of the block's 259 lines are main's text less two spaces of indent;
  the five that differ are one getter (`getRenderer()`) and four setters, below. The
  report's 66 top-level keys are the same names in the same order on main and after the
  move, the renderer's own part spread after them as before. No check read the moved text. Next: 50c-3, the GPU's guards.
- **50n** *Every folder's README names what its code exports* (S, Claude; **shipped**,
  `npm run readmes`, an always-run check in `logic`). CLAUDE.md's rule, held: a name a PR
  newly exports under `src/` or `server/` is named in that folder's README, one it removes
  is not still named there as live, and no README names a code name no code has. Its first
  run found two: `src/gpu/README.md` described `gateDisplayWgsl` and `leanConstants`, names
  #870's lean display never shipped; fixed in the same PR.
- **50o** *The owner's corrections become checks* (rule, Claude; **shipped** in
  `docs/handoff.md`). A correction's fix PR adds a check red on what the owner saw and the
  fault itself to `scripts/mutants.json` with that check as `expect`, so the weekly run
  proves it every week; one no check can see goes to `docs/judging.md` and still into the
  list, where it shows as a hole until a check exists.
- **50c-1 shipped** (2026-11-27): the seam written down (`src/engine/README.md`: the engine
  owns the per-frame state, takes typed messages, sends events, imports no React) and the
  first piece moved verbatim: the pointer and the fingers (mouse, touches, Spin hands, the
  closeup's Alt-drag and two-finger camera) to `src/engine/pointer.ts`, `coverPinch.ts`
  from `components/` beside it. `LiquidVisualizer.tsx` 390,411 to 373,454 bytes. No check
  read the moved text. The order of the next moves (50c-2 debug report, 50c-3 the GPU's
  guards, 50c-4 the governor, 50c-5 the clocks: Antigravity's, briefed 2026-11-27 in the
  owner's files under `antigravity/engine-50c/`, strictly one after another; 50c-6 the
  device's start, which writes the effect's own state, so Claude designs its home first;
  50c-7 on: `renderFrame` by stage) is the README's table.
- **50c-2 shipped** (2026-11-27): the debug report (`chromaglassDebug()`), the three
  hooks `?debug` puts on `window`, and the crash log's provider and report part moved
  verbatim to `src/engine/debug.ts` (`attachDebug`). `LiquidVisualizer.tsx` 373,274 to
  359,503 bytes. 254 of the block's 259 lines are main's text less two spaces of indent;
  the five that differ are one getter (`getRenderer()`) and four setters, below. The
  report's 66 top-level keys are the same names in the same order on main and after the
  move, the renderer's own part spread after them as before. No check read the moved text. Next: 50c-3, the GPU's guards.
- **50n** *Every folder's README names what its code exports* (S, Claude; **shipped**,
  `npm run readmes`, an always-run check in `logic`). CLAUDE.md's rule, held: a name a PR
  newly exports under `src/` or `server/` is named in that folder's README, one it removes
  is not still named there as live, and no README names a code name no code has. Its first
  run found two: `src/gpu/README.md` described `gateDisplayWgsl` and `leanConstants`, names
  #870's lean display never shipped; fixed in the same PR.
- **50o** *The owner's corrections become checks* (rule, Claude; **shipped** in
  `docs/handoff.md`). A correction's fix PR adds a check red on what the owner saw and the
  fault itself to `scripts/mutants.json` with that check as `expect`, so the weekly run
  proves it every week; one no check can see goes to `docs/judging.md` and still into the
  list, where it shows as a hole until a check exists.
