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
- **46a · A faster opening** (Antigravity, after the queue): Classic's opening at most 52
  pipelines (`openingtime --bar`, owed `count`), by fusing kernels that run back to back on
  the same cells and by building behind the show what the first steps never draw with, never
  by dropping what a look draws. Held by `samelook` (every look the same), `startup` (no stop
  in the opening; every look opens on only what it waited for; nothing a first step asks for
  left out) and `physics`/`thingap` for any fused kernel. The owner's Mac's number to beat:
  first step 15.48 s cold, read from main's deploy after merge.
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
- **46e-3 · Found:** other refresh rates are not replayed: at 144 Hz three refreshes are
  20.8 ms, under any 25 ms line, and the step clock does not snap (not a whole ratio).
- **46-1 · Found:** 19d-lazy (the first load's script, 527 KB gzipped) waits on 14h's precache
  and its offline line, so it is not in this hunt yet.

## The audit of 2026-11-13: where a frame's CPU and GPU go, measured and read

**Asked 2026-11-13** by the owner: the code as efficient for GPUs and CPUs as it can be,
"so we can continue to add things in the future", and nothing that makes the picture worse.
Four readers went through the frame loop, the engine's device calls, the shaders, and
everything round them (timers, feeds, React), and the page's one thread was profiled on the
owner's Mac (main c778019, Classic, the Perform desk, headless on Metal, 30 s each; the tool
and the raw list are in the project's shared files, `perf-2026-11-13/`):

| | no sound | the simulated band |
|---|---|---|
| the thread busy, a frame | 2.40 ms | 7.75 ms |
| garbage | 156 KB a frame, 8.9 MB a second | 636 KB a frame, 33 MB a second |
| React | 13.8 ms once a second | 14.3 ms ten times a second (p90 22.2), 5.4 s of 34 |
| the frame function | 1.8 ms (p90 3.3) | 3.3 ms (p90 7.7), 471 of 1,607 over 5 ms |

So the largest single cost on a page with music was not the plate: it was the shell drawn
again ten times a second for three meters and a percentage.

- ~~**46f · The ear's view and the desk's clock render themselves, not the shell**~~
  (**shipped**, `npm run renders`: components rendered a second with the band 5,840 → 11 on
  the laptop, 714 → 0 on the phone; no sound 531 → 1 and 65 → 0; story in
  `docs/plan-shipped.md`).
- ~~**46g · The poured liquids' fields are carried only once something is poured**~~
  (**shipped**, `npm run encode`, `physics`, `liquids`; story in `docs/plan-shipped.md`).
- **46h · A ride and a fade still render the whole shell** (M; 14u names the fade). A MIDI
  fader tells React ten times a second and a Go fade thirty, each a render of every desk
  panel: 14.3 ms on the owner's Mac, more than half of it the commit (React 19 updates every
  DOM element under a component that rendered). No component under `src/components` is
  memoised and `App()` hands the desk about a hundred inline closures, so nothing below it
  can bail out. The build: the desk's panels behind `memo` with stable props (the handlers
  through one ref'd table), so a setting that moved renders the control that shows it.
  Check to write first (Claude): `renders`' fader phase holds `work` (components rendered a
  second) to a bar an order under main's, as 46f's lines do for the band.
- **46i · State nobody reads, set many times a second** (S): `useFilmSense` sets
  `{energy, ms}` every 150 ms though the App reads only its ref; `useSceneCamera` sets its
  readout every 120 ms though only Settings' Room section shows it; `ControllerSurface`
  forces a render every 120 ms while open with nothing lit. Seven to fifteen renders of the
  shell a second while a film or the room camera is on. Check: a film phase and a
  fake-camera phase in `renders`, the App still.
- **46j · The frame's own garbage** (S each, M in all; the profile's top allocators with the
  band, bytes a frame): the frame function itself 186 KB (not yet placed: find it first, with
  the profiler's allocation stacks at a finer sampling interval), `BubbleField.step` 44 KB
  (a `[vx, vy]` tuple a sample, eight a bubble), `squishDisc` under the bass's hand 38 KB,
  `fillPlateUniforms` 22 to 30 KB (133 `pack.set(name, ...values)` through a Map, a Set and
  `Array.from`), the tempo's `estimate` 16 KB and a sort 8.5 KB every frame (0.18 ms), the
  beads' velocity sampler (a tuple and a closure a bead), `deriveStep`'s hundred-key object
  a step, `PatchBay.fold`'s Map, Set and arrays where a look has cords, the engine status
  object built every frame to be compared, a projector source's copy of all 251 settings a
  frame. Each is the same arithmetic into memory kept; the check for each is `eargc`'s
  pattern (heap bytes a call, old against new, the result bit for bit).
- **46k · `dyeDisperse` runs as an exact no-op where diffusion is zero** (S; Classic and
  thirteen other looks): its gate passes whenever the plate moves, and with `dm = 0` and
  `kappaT = 0` every flux is ±0. One full-grid dispatch a step, 25 loads of the rgba32f dye
  a cell; the file's own comment puts it near 0.4 ms. Skip it for that case (not oil bodies
  until read); `samelook`, `physics`, `encode`.
- **46l · Taps the display takes and throws away** (S each): the milk's five taps a layer
  where the lamp ground is off (ten a pixel on Classic); the ferrofluid dome's curvature
  loading again the four neighbours it holds; the projector's `scene` sample overwritten
  when the surface is not the wall. `samelook`, `lamp`, `spikes`, `ferrolook`, `wall`.
- **46m · Tank and the lamp's boil compile on the frame that turns them on** (S): eleven and
  two pipelines in no `prepare` list, a stop of two to six seconds at the Mac's compile
  pace. Built behind the show as glint's are. Check to write first (Claude): a
  `startup`-style line that turns each on after the opening and counts none built on a frame.
- **46n · Device calls a frame can lose** (S each): up to eight `queue.submit` a frame (the
  readback's and the probe's into the frame's encoder; the deltas' needs its own copy of
  `sim`); the flash guard's probe encoding both dispatches with every ring slot busy and
  making its args and groups again each frame; the post chain writing its uniforms up to
  three times before one submit; `readbackAsync` rewriting the 224-byte `sim` (with H2c-7);
  `activeMat` (two grids, never read or written) and `chem` allocated with chemistry off;
  the aux target stored where nothing reads it (`storeOp: 'discard'`, an interim to H2c-6);
  derive drawn on frames H2c-9 skips the pack; `packDye` and `packVel` as one kernel.
  `framereads`, `framegroups`, `encode`, `samelook`.
- **46o · Song ID listens and matches on the page's thread** (M): every six seconds with a
  local library, a new AudioContext and a ScriptProcessor for four seconds, then the match
  (a 192k-sample resample, about 86 FFTs) in one block. Into the ear's context by a worklet
  and the index's worker. Check: long tasks over 8 ms in 30 s with the band and one track.
- **46p · The remote's whole snapshot, serialised every 80 ms with no phone** (M):
  `useRemote` rebuilds it (every preset with it) on any settings change and
  `useRemoteLink` stringifies it whether or not anything is connected. Send to somebody,
  and the lists only when they change.
- **46q · For the owner's eyes, not built without them:** `backdrop-blur` over the moving
  plate (the phone's dock, the top bar, the music player, the cue bar) is composited again
  every frame, and an opaque fill would not be; the desk's preview canvas is sized from the
  whole window though it is framed in the hole (2.2 times the hole's area at 1440×900), and
  takes and streams record that canvas; the recorder asks for VP9 before hardware H.264 at
  sixty frames of the full canvas.
- **46r · Found, a bug and not a saving (the physics audit's):** three writes in one step
  share the args name `'current grid'` with different values (`fluid/passes.ts`'s boil and
  thin-gap calls, `fluid.ts`'s open plate), so on the open plate `currentForces` reads Depth
  Drag as "boiling" whenever Depth Drag is above zero. Fixing it changes the picture there.

