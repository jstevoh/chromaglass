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
  missed refresh is not seen as one; its check is written, 46e) and 14aa-4 (a climb's cost guessed from cells and
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
- **46e · 120 Hz frames** (check **written**, `npm run rungs -- --owed=120hz`,
  `scripts/rungs-120.mjs`; the build is Antigravity's): 14aa-5. The real step clock and
  governor (and the draw gate, one clock) replayed on a 120 Hz screen with the 60 Hz
  replay's machines, at two stamp scatters (none, ±0.05 ms). On main, Poster's costs at one
  miss in eight give sixty up after 13.5 s, 60 s or never with regular stamps (1135 steps
  drawn two to a frame in three minutes on one seed), 4.3 to 12.1 s at ±0.05 ms, where 60 Hz
  gives it up at 4.0 s: a frame that holds the loop three refreshes is exactly 25.0 ms at
  120 Hz, and `frameMs > MISSED_MS` does not count it. Owed: no step skipped and at most 1 %
  of images held off a step's time after the opening, and sixty given up within 6 s.
  Controls (green on main, so the fix cannot spend the picture): every machine even at
  60 Hz; the light, Classic and feather plates even at 120 Hz and making the same moves as at
  60 Hz; Poster never below its 60 Hz picture; the replay's catch-up cap read from the
  visualizer. A governor with every line halved fails them. Two sketches pass (a miss past
  1.25 steps, `antigravity/46e-proof-throwaway.diff` in the project's shared files; or
  `frameMs >= MISSED_MS`); which is right is the build's to argue. The build takes `120hz`
  out of `--owed` in `scripts/checks.json`. Brief row: queue once Antigravity's credits are
  back (not queued).
- **46e-2 · Found:** the replay holds the loop for whole refreshes per frame, with a stamp
  scatter nobody has measured: at ±0.1 ms main's governor all but passes. A browser keeps a
  frame or two in flight and a ProMotion panel changes its own rate. Record the rAF stamps
  on the owner's 120 Hz screen (`npm run stutter`, 46c) and replay those.
- **46r-1 · Found (with 46r, 2026-11-13):** the solver's shared `sim` uniform is one buffer
  written more than once between submits (the step's own write, `rawSim`'s, and
  `speciesShare`'s in `reads.ts`), the same last-write-wins as an args name given two
  values. `npm run argnames` watches the names only. Read whether any pair differs in a
  field a dispatch of the earlier write reads, and watch `sim` the same way if one does.
- **46e-3 · Found:** other refresh rates are not replayed: at 144 Hz three refreshes are
  20.8 ms, under any 25 ms line, and the step clock does not snap (not a whole ratio).
- **46-1 · Found:** 19d-lazy (the first load's script, 527 KB gzipped) waits on 14h's precache
  and its offline line, so it is not in this hunt yet.
