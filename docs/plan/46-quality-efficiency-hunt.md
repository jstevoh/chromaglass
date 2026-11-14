# 46. The quality and efficiency hunt: a faster opening, no dropped frames, the look kept

**Asked 2026-11-09** by the owner: "Have antigravity go on a quality and efficiency hunt once
it's done with its queue. I want to improve startup time, get rid of dropped frames/jitter,
and any other issues with the app that will overall help with performance and efficiency. Of
course visual quality and realism is the most important thing."

So the rule of this section: **no win may change the look.** Every pull request here carries
the `same-look` label and a title starting with its §46 id, which makes CI's lab5 part run
`npm run samelook` against the pull request's base: six shipped looks laid with their own
dyes, liquid and physics, stepped and drawn by both trees in the lab, the same pixels after
five and twenty steps and the same picture (colour, detail, the spread of colours) after
sixty. A pull request of the hunt's may not edit the lab or the guard itself. A speed-up that needs a coarser grid, a cheaper
advection, a smaller picture or a damped step fails it, and is not a win. Physics and the
picture are never traded for a number, and code is never split or degraded to fit one.
Antigravity builds; Claude writes the checks; Antigravity never writes or loosens one.

## Where the time goes (read 2026-11-09 from what was already measured)

- **The opening is compiling.** On the owner's Mac (main 06add19, the deploy's open shard,
  `npm run startup`): the first step at 15.48 s from load, 13.51 s of it building the 65
  pipelines Classic waits for; the looks wait for 65 to 85. On the same Mac's first deploy of
  2026-10-29 the opening was 56 builds in 3.43 s (median 0.186 s each). On 2026-11-08's
  deploys 679 and 682 it was 65 builds in 11.86 and 17.99 s, median 0.554 s, **the display
  alone 6.77 s** (19ah-9, with the Mac partly busy). The opening was forty-three shared
  pipelines and a look's own few when `gpu/opening.ts` was written; 14v-10 found the Mac's
  compiler, not the lanes, sets the pace, so the opening is its compiles over three lanes.
  Two levers, both named in 14v-10 and never built: fewer compiles (kernels that run back to
  back on the same cells fused) and a smaller display (split by what a look turns on).
  A warm opening is already quick: each look's longest frame gap from a second before its
  first step, median 0.15 s, longest 0.48 s (Macro Bead), over 33 looks.
- **The frame budget's own items are written and owed.** `encode -- --owed=h2c1,h2c3,h2c2,h2c5,h2c8`,
  `framereads -- --owed=h2c6,h2c7,h2c9`, `timelabels -- --owed=labels` are on main, red until
  their builds (docs/plan/40-specs-frame-gig-desk.md); H2c-3 and H2c-1 are in a pull request;
  14c-4k, 14c-governor, 14b-120, 14c-readout and H2c-10 in another ("Smoother 4K start").
- **Dropped frames are counted by hand.** `npm run stutter` (Mac only, 14aa-3) counts missed
  refreshes caught up with two steps, on-time two-step frames and climbs undone; it has run
  on three looks. 14aa-5 (the governor's lines are 60 Hz milliseconds, so a 120 Hz display's
  missed refresh is not seen as one) and 14aa-4 (a climb's cost guessed from cells and
  pixels) are open, and are Claude's to write checks for first.

## Items

- **46-0 · The guards** (**shipped**, this PR): `npm run samelook` (the look kept, above;
  controls every run on Classic and Roy: the same tree twice byte for byte, the two trees'
  bundles differing exactly when src/ does, a rounding-sized change passing, and a coarser
  grid, half the picture's pixels, a tenth slower flow and Ferro Paint's magnet off each
  failing) and `openingtime --bar --owed=count` in Measure's browser2 part, on software WebGPU (Classic
  asks WebGPU for at most 52 pipelines before its first step, main 66; owed until 46a). Reviewed by a skeptic
  pass before merge; what it found and was fixed is in the PR.
- **46-2 · A named shortcut in the guard:** samelook steps each look with the step
  parameters that share a name with its settings, because the app's own mapping from a
  look's settings to a step lives inside `LiquidVisualizer.tsx` and the lab cannot call it.
  Moving that mapping into an exported lib function (an export between domains: the
  owner's call) would let the guard step every look exactly as the app does.
- **46-3 · Known gaps of the opening's bar:** it counts, it does not time. A fused kernel
  could in principle cost more to compile than the two it replaced; the 46a PR quotes
  startup's first step on CI's Mac before and after, and startup's "no later than the old
  way" line comes back from quarantine on 2026-11-15.
- **46a · A faster opening** (**shipped** — story in [`docs/plan-shipped.md`](../plan-shipped.md#46a-a-faster-opening-2026-11-14)):
  Classic's opening cut from 66 WebGPU pipelines (65 ledger) to 51 WebGPU (50 ledger, at or
  below `OPENING_MOST = 52`), via five back-to-back kernel fusions (`deltaFold`, `forcesB`,
  `grainStep`, `decay`, `packVel`), direct `cpuMulTex` sampling in `deltaFold` (keeping `cpuDyeTex`/`cpuVelTex` upsampling),
  `enc.clearBuffer` in `clear()` (keeping `mgZero` in `hsCycle()`), `velScratch` freeing
  `scaleDye:dye`, and deferring `jacobi:dye`, `airGiveSub:thin`/`airGiveThin:thin`,
  `beadDrops`/`beadHoles`/`beadFinish`, and `output` behind the opening (`later`). Removed
  `--owed=count` from `scripts/checks.json`; warm local `openingtime --runs 3` first step
  0.70 s -> 0.59 s; `samelook` 0.00% diff across all 6 looks, `physics` 20/20, `thingap` 16/16,
  `videoflow` 24/24. Main's deploy open shard startup first-step time (was 15.48 s) to be
  recorded after merge.
- **46a-2 · A smaller display** (Antigravity, after 46a): the display's compile, 6.77 s of a
  cold opening on the owner's Mac, split by what a look turns on so Classic compiles only
  what it draws. Held by `samelook` (byte-level after five steps), `plate`, `nolight`,
  `filmlook`, `bubblelook`; numbers from `openingtime`'s "slowest" line before and after.
- **46b · The frame budget's written items** (Antigravity): H2c-7, H2c-labels, H2c-6, H2c-9
  (briefs of 2026-11-07), then H2c-8 and H2c-5, then H2c-2 once H2c-3 and H2c-1 merge. Each
  takes its id out of its owed line and carries `same-look`; H2c-5 (first-order velocity) is
  a physics trade and ships only if `samelook` stays green.
- **46c · Smooth on every look, on the owner's Mac** (Antigravity, by hand): `npm run stutter`
  on every look at 60 s each, main and the branch, bars as in stutter.mjs (at most two missed
  refreshes caught up in any ten seconds, no on-time two-step frame, no climb undone within
  10 s). A look that fails is a cause to find and fix in its own PR. The look guard here is
  the rung: a fix may not leave any look on a lower grid or pixel share than main settles it
  on (stutter's governor log, quoted for both).
- **46d · The hunt's report** (Antigravity, no code): every look through `npm run stages` on
  the owner's Mac, and the slowest compiles of `openingtime`, written up as new items here,
  each with its measured share of a frame or of the opening. Claude writes their checks.
- **46e · 120 Hz frames** (Claude, check first): 14aa-5's governor lines in refreshes, with a
  replay in `rungs` at 120 Hz; then Antigravity builds it.
- **46-1 · Found:** 19d-lazy (the first load's script, 527 KB gzipped) waits on 14h's precache
  and its offline line, so it is not in this hunt yet.
