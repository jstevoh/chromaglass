# Stability: the show that stops and does not come back

*Opened 2026-09-23, from reports that chromaglass.web.app "crashes all the time":
the plate stops and nothing brings it back but a reload.*

Three audits went through the code together. The first looked at GPU
resources: per-frame allocation, disposal, and readbacks. The second looked at
recovery: every path where the picture can stop for good. The third looked at
the JS heap and the main thread over a multi-hour session.

The audits found no per-frame GPU leak, and every array in the render path is
bounded. What they did find was a set of **one-way doors**: a single failure
the show had no way back from. The live site hits these doors often, because a
laptop mid-set is exactly where GPUs reset, run short of memory, or hand back
a frame that will not upload.

**S0**, below, closes the doors that are cheap to close. **S1–S13** are the
larger jobs; all but S7 (an hour in CI) have shipped.

**S14–S21** were found on 2026-09-28, in a second reading of the code for the ways a
set stops, and none is built. They are the same kind of door: a failure in one part
that the show has no way back from, or that it never notices.

## S0: shipped with the black box (#127)

| Door | What happened | Now |
|---|---|---|
| **A frame that throws** | `render()` asked for the next frame on its last line, so one throw anywhere in ~1,450 lines ended the loop. There was no error on screen and no recovery. | The loop is guarded. A throw is logged and the next frame is still asked for. After ~1.5 s of frames that all throw (`SELF_HEAL_FRAMES`), the stage is rebuilt as if the device had been lost. After three rebuilds in a minute it logs a fatal and stops trying, but keeps the loop alive. |
| **A picture that will not upload** | `copyExternalImageToTexture` throws for an ended camera track, a size change mid-copy, or a cross-origin image. It was the likeliest throw above. | Each upload (film, mark, beads) is fenced. A picture that fails is left out of that frame and logged once. |
| **Out of GPU memory** | In WebGPU a failed allocation is not an exception. It is an invalid object and a black plate on a live device, so no loss handler ever hears about it. | An `out-of-memory` error scope wraps solver creation, and `uncapturederror` watches for `GPUOutOfMemoryError`. Either one caps the grid below the size that failed (the cap survives rebuilds) and steps the governor down with `failRung`. At the bottom rung the stage is rebuilt. |
| **Two solvers at once** | A rung change built the new solver before disposing the old one. At 1024² that is ~400 MB per layer at the moment of the swap, which is exactly when the governor has just decided there is room. | The old solver is detached (its field is carried to the CPU) before the new one is built. |
| **A solver that would not start** | Went straight to the permanent "needs WebGPU" screen, and `gpuSupportedRef = false` was never reset. | Steps down a rung and tries again. Only the bottom rung failing shows the screen. The screen now has **Try again**. A new device resets `gpuSupportedRef`. |
| **No device after a loss** | The first `requestAdapter` after a loss often answers null while the GPU process restarts. That answer went to the permanent screen, with the "rebuilding" caption stuck under it. | Asks again with backoff (1 s, 2 s, … 30 s; about two minutes over eight tries) before giving up. |
| **A request that never answers** | `requestAdapter` and `requestDevice` had no timeout, so a driver mid-reset could hold "rebuilding the plate…" forever. | 10 s timeout. The failure feeds the backoff above. |
| **A device that dies at birth** | A loss re-requested at once, so a device lost straight after creation looped with no backoff. | A device lost within 5 s of birth backs off like a failed request. |
| **A stream of GPU errors** | Invalid objects mean a validation error every frame and a black plate forever. Chrome stops printing them after ~100. | 45 uncaptured errors within 3 s rebuild the stage (`ERROR_STORM`). |
| **A readback slot stuck busy** | If `getMappedRange` threw, the slot stayed busy. With only 2–3 slots, that stopped the flash guard and the dye readback for the rest of the show. | try/finally always frees the slot. |
| **The first-listen recorder** | Recorded until a silence or a confirmed track change, which never comes in a continuous mix where identification keeps missing. Then it decoded the whole recording at full rate in float before trimming: ~1.4 GB for an hour. The tab died. | Keeps only the first ten minutes. |
| **The logo on every cast state** | The mark's data URL (up to several MB) rode along with every state message. States go out at 2 Hz while a track is identified and at 30–60 Hz during fades, and each copy was decoded and re-uploaded at the other end. | Sent only when a receiver is new: its hello, a cast starting, or a mirror joining. |
| **The black box itself** | Every `console.error` wrote the whole ring to localStorage synchronously. | Repeats of the same line become a count. Immediate writes are limited to one a second. Page close and fatals always write. |

**Verified here, without a GPU:** lint, build, `npm run rungs` (49/49) and
`npm run crash` (13/13, device checks skipped).

**Not verified yet:** everything that needs a device. That means the guarded
loop surviving throws and rebuilding (`throwFrames` in `npm run crash`), the
out-of-memory step-down, the retry backoff and the error-storm rebuild. The
macOS CI job runs `npm run crash`, including the new throw checks. The
out-of-memory and backoff paths have no harness yet; see S6.

## S1–S13: the larger jobs

Ranked by what they cost a show.

1. **S1 — Restore the plate, not just the look, after a rebuild.**
   - **Shipped.** A loss or self-heal carries the plate across on its last readback (non-finite values zeroed); the look is laid again only when there is nothing to carry, or after two rebuilds in a minute.
   - The dye lives in the solver's textures, so every recovery (a loss, and now a self-heal) lays the look again from nothing.

   **Do:** keep a CPU snapshot a few seconds old (the readback ring already brings the fields back) and seed the new solver from it.
2. **S2 — Error scopes on the frame, not a heuristic.**
   - **Shipped.** One frame in sixty, and the two after a resize or a newly built camera, post chain or projector pass, runs inside validation and out-of-memory scopes; a caught error names the frame and what was built.
   - `ERROR_STORM` is a count; it cannot say which pass is broken.

   **Do:** sample `pushErrorScope('validation')` and `('out-of-memory')` around `stage.frame()` every N frames, and around every allocation that scales with the canvas (post chain, camera, projector targets, canvas resize). The first error then names its pass in the crash log, and the governor can step down for the target that did not fit, not only for the solver.
3. **S3 — The first readback after a rung change.**
   - **Shipped.** Each attach keeps the state its solver was seeded with, and a solver swapped out before its first readback gives that back.
   - `attachGpu` pulls from `rbDye`/`rbVel`, which start as zeros until the first ring readback lands.
   - Two rung changes within ~2 frames copy zeros, and the plate goes blank while the show runs on.

   **Do:** a `landed` flag; skip the pull and keep the CPU arrays until one has landed.
4. **S4 — One pipeline cache per device.**
   - **Shipped.** `PipelineCache.for(device, scope)`: shader modules shared per device, pipelines per owner, compute pipelines keyed by source as well as name.
   - Every `WebGPUFluid`, and every `WebGPUParticles` toggle, builds its own `PipelineCache`.
   - So each rung change recompiles every shader, which is a CPU and driver spike at the same moment as the memory swap.

   **Do:** share one cache per device, owned by the stage.
5. **S5 — Readback garbage.**
   - **Shipped.** Each ring copies into one buffer it keeps; no reader holds `latest` past its own call.
   - `ReadbackRing` does `getMappedRange().slice(0)`: ~590 KB per field, two fields per layer, every frame. That is ~70 MB/s of allocation per layer and constant GC pressure.

   **Do:** copy into a buffer kept across frames.
6. **S6 — A harness for the doors in S0.** None of these can be reached from a page today:
   - **Shipped.** `simulateOutOfMemory`, `stepDownFrames`, `errorStorm` and `gridCap` under `?debug`; `npm run crash` walks through each door, plus a null and a hung `requestAdapter`.
   - out of memory: a debug hook that makes `WebGPUFluid` allocate past `maxBufferSize`, or pins the grid cap
   - a null adapter on recovery: stub `navigator.gpu.requestAdapter` to answer null twice
   - a request that never answers
   - an error storm: a debug hook that submits an invalid bind group each frame

   **Do:** give each a hook under `?debug`, and a check in `npm run crash` that the show comes back.
7. **S7 — An hour in CI.** A nightly macOS job that runs a show for an hour and fails on:
   - growth in `performance.memory.usedJSHeapSize`
   - the device's own memory, where it can be read
   - frame-time drift
   - any fatal in the black box

   Everything above is about what happens *after* hours; nothing checks for it.
8. **S8 — Crash reports that arrive.**
   - **Shipped, not yet switched on.** `server/report-worker.js` (`wrangler.report.toml`, `npm run deploy:reports`, tested by `npm run report-worker`): reports into R2, an index in KV, a digest route and a daily digest file. Send appears once the Worker is deployed and `VITE_CRASH_REPORT_URL` is set; the steps are in `crash-plan.md`.
    - A `/report` path on a Worker (the fingerprint Worker, or its own), with storage and a daily digest.
    - Build with `VITE_CRASH_REPORT_URL` so **Send** appears.
    - Grouped by the black box's `last()` line, so the next round of this plan is picked from what the field actually reports.
9. **S9 — The fingerprint index.**
   - **Shipped.** Typed-array segments that merge as they grow; a new song is added, not rebuilt; the first build runs in a worker. Matches are byte-identical to the old index.
    - `buildIndex` rebuilds a `Map<hash, number[]>` of every song ever stored, on the main thread, after every newly mapped song.
    - Its memory and the stall grow with the library, across sessions.

    **Do:** add to it incrementally, store it in typed arrays, and build it in a worker.
10. **S10 — Cast state rate.**
    - **Shipped, at 15 Hz rather than 10.** The receiver does not interpolate — it draws the steps it is sent — and at 10 Hz a two-second fade to black is a visible staircase.
    - Even without the logo, a state goes out every frame of a fade.

    **Do:** throttle to ~10 Hz. The receiver interpolates anyway.
11. **S11 — The song-map decode.**
    - **Shipped.** The resample renders only the kept duration; the full-rate buffer never leaves `decodeToMono`.
    - Even capped at ten minutes, `decodeToMono` decodes at the file's rate and in stereo before resampling: ~230 MB at 48 kHz.

    **Do:** decode in slices, or trim before resampling.
12. **S12 — Dev-only teardown race.**
    - **Shipped.** The cancelled path destroys its device and leaves the canvas alone.
    - In StrictMode a late first stage runs `context.unconfigure()` on the canvas the second run is using, so `getCurrentTexture()` throws.
    - Only in dev, but it is the same symptom and confuses the hunt.

    **Do:** destroy only the device on the cancelled path.
13. **S13 — Small change.**
    - **Shipped.** The compositor is disposed by name; the beads reuse their buckets; `WebGPUChemistry` and its shader are deleted (`depositChemistry` is now unused as well).
    - `WebGPUPlate` is never disposed in the cleanup (the device's destroy covers it, but it should say so).
    - `beads.ts` allocates a `Map`, a `Set` and arrays every crowding step.
    - `WebGPUChemistry` is never imported; delete it.

## S14–S21: found 2026-09-28, not done

Ranked, as above, by what they cost a show. Each says whether it was measured (headless
Chromium, the day it was found) or read in the code.

14. **S14 — A panel that throws takes the plate with it.** (*Shipped*)
    - *Read in the code.* `Boot` (`src/main.tsx`) is the only error boundary, and
      `LiquidVisualizer` sits in the same tree as every desk, sheet and phone component
      (`App.tsx`). A render error in any of them unmounts the plate: the device is
      destroyed, the ear and the recorder end, the wall stops, and the screen says
      "ChromaGlass could not start" with only a reload, which then strands the wall
      (S15).

    **Do:** a boundary round each panel, desk and phone component that draws a "this
    panel failed" card and writes the error to the black box, with the plate outside all
    of them. **Measure:** a `?debug` hook that makes one panel throw; `npm run crash`
    finds its line, the frames go on, and the card is drawn.

    *Shipped (2026-10-10):* `src/components/PanelGuard.tsx` wraps every panel, sheet,
    desk and the phone's controls in `App.tsx`, and inline round the Perform desk's
    Mixer and each of the phone's sheets, so a sheet that throws leaves the phone's
    dock and a Mixer that throws leaves the desk's Go. The card names the panel, says
    the show carries on, and offers Try again and Close (a desk's Close opens the
    other desk). The black box gets an `error` line from source `panel` with the
    component stack. `?debug` adds `chromaglassPanelFault(name)` and
    `chromaglassPanels()`, kept off `chromaglassDebug` so the guards are tested without
    the plate's state. `npm run crash` §1b faults the crash report button: card up,
    the line written, 0 new fatals, the canvas still mounted, frames advancing where
    a GPU draws, and Try again brings the button back. Control: with the guard
    rethrowing (main's behaviour), 1 new fatal and 0 canvases. Not covered: an error
    in `App` itself or in `LiquidVisualizer` still reaches `Boot`; the plate's own
    recovery is S16–S21.
15. **S15 — A reload mid-show loses the set and strands the wall.**
    - *Measured.* The projector window sets `opener.__chromaglassMirror = paint` once
      (`CastDisplay.tsx`), and its watch asks only whether the opener is `closed`, which
      a reload does not make it. After `page.reload()` the show had no
      `__chromaglassMirror`, the wall stayed open on its last frame and said nothing,
      and the new show's `isCasting` was false. A reload comes from F5, Boot's "clear
      the cache and reload", `startOver()` after a stale chunk, or a crash.
    - *Read in the code.* The reloaded show opens on the opening look
      (`OPENING_LOOK`, `App.tsx`): the set list's place, the sequencer's stage, the armed
      look and the tempo are gone.

    **Do:** the watch puts `paint` back whenever the opener's differs, and announces the
    stage again; the wall fades to black while it has no show, rather than holding a
    frame. Keep the live state (the set's place, the stage, the armed look, the tempo,
    the Mixer's takes) in `sessionStorage` every second, and on a load within a few
    minutes of it open there, with "resumed at …" on the desk and the phone. **Measure:**
    a `?cast` check, which nothing has yet (PLAN.md 19c): reload the show, and the wall
    draws the new show's frames within a second; the resumed show's place and stage are
    the ones before.
16. **S16 — A GPU rebuild stops the film.**
    - *Read in the code.* The setup effect's cleanup (`LiquidVisualizer.tsx`) calls
      `stopFilm()`, and the effect runs again on every `glEpoch`: each loss, heal and
      retry. `stopFilm` revokes the file's URL and stops a camera or a window capture,
      and nothing tells the App, whose `filmSource` still says file, camera or window.
      Plugging a projector into a running laptop, or a GPU switch, loses the film, and a
      window share has to be picked again.

    **Do:** the film belongs to the component, not the GPU effect: stopped on unmount
    only, attached again after a rebuild. **Measure:** `npm run crash`'s forced loss
    with a film playing: the film still draws after the recovery.
17. **S17 — One pipeline that fails to build takes down the whole step.** (*Shipped*)
    - *Read in the code.* `prepareCompute` swallows an async build's failure ("built on
      the frame instead", `kit.ts`); `computePipeline` then builds it synchronously and
      caches the invalid pipeline; and the step is one compute pass in one encoder, the
      frame one encoder (`fluid.ts`). A driver that refuses one optional kernel (BZ, the
      maze, film stock, the camera) invalidates every step or every frame: a frozen or
      black plate, sixty errors a second, three heals and a fatal. `npm run wgsl` checks
      one compiler, Chromium's.

    **Do:** remember a failed build by scope and name, from the async rejection or an
    error scope round the synchronous build, and skip that stage so the rest of the
    plate runs, with the black box naming it. **Measure:** a `?debug` hook that makes one
    named pipeline fail: the plate steps without it, and `npm run crash` reads its line.
    It is next to #212's startup work; take it after that merges.
18. **S18 — A non-finite number in a carried field stops the dye for good.** (*Shipped*)
    - *Read in the code.* The dye and the velocity have had `finite4` and `safeVel`
      since "36864 of 36864 cells NaN" (`wgsl/fluid.ts`). The fields carried from step to
      step have not: the lasting current (`currentForces`), its gradient
      (`curGradient`), the squeeze (`squeezeUpdate`, and `squeezeRedBlack` into the
      warm-started `spress`, which is never cleared), and the phase, psi and mix
      kernels. The current's cap, `if (s > S.maxCur)`, is false for NaN, so NaN is
      stored; the comment at the current's `tanh` records this failure once already
      ("the flow was wiped every step after it"). From the current, `safeVel` then
      zeroes the forced velocity in every cell, every step, until a rung change.
      `writeSim` (`fluid.ts`) passes the step's parameters (rock, mean density,
      the gap's spring, …) unchecked, so one non-finite uniform is enough.

    **Do:** those stores guarded with `select(0, x, finite)`; `GpuStepParams` sanitised in
    `writeSim`. **Measure:** `npm run finite` verifies writeSim sanitises non-finite uniforms
    and that the plate recovers motion two steps after uniform corruption.
19. **S19 — Dye Particles at full on a 1024² grid invalidates every step.** (*Shipped*)
    - *Read in the code.* `capacity = grid² × PER_CELL` (4) and `groups = ceil(live /
      64)` (`particles.ts`): at 1024² with Dye Particles at 1.0 that is 65,536
      workgroups, one over the default `maxComputeWorkgroupsPerDimension`, and the
      device asks for no higher limit (`device.ts`). The particles are encoded into the
      step's own encoder, so the step's whole command buffer is invalid, every step: a
      frozen plate, errors, three heals, a fatal. 1024² is on the native ladder at a
      pixel ratio of 1, on stage ladders and behind `?sim=1024`, and the slider or a
      fader at 127 reaches 1.0. The particle buffer is also exactly 128 MiB there, the
      default `maxStorageBufferBindingSize`, so any growth in `PER_CELL` or the stride
      breaks it the same way.

    **Do:** `GROUP = 256` matching `@workgroup_size(256)` in `wgsl/particles.ts` (16,384 groups
    for 4,194,304 particles at 1024²), `live` clamped to `65535 * GROUP`, and the device
    configured with `requiredLimits` requesting the adapter's available `maxStorageBufferBindingSize`
    and `maxBufferSize`. **Measure:** `npm run particles` verifies 1024² with `particles: 1`:
    zero validation errors and all 4,194,304 particles live and simulated.
20. **S20 — Smaller doors.**
    - The out-of-memory error scope is popped only when the solver builds
      (`attachSolver`, `LiquidVisualizer.tsx`). If the constructor throws, the scope
      stays on the stack and swallows every later out-of-memory error, and the
      half-built solver's textures leak. Pop it in a `finally`; the constructor disposes
      what it made.
    - `settles()` gives up on `requestDevice` after 10 s (`device.ts`), but a device that
      arrives later is never destroyed, so each slow retry can leave one alive. Destroy
      it when it lands.
    - The look-specific textures (mix, oilDye, oilReach, psi, phaseMu, scratchR, rxn,
      lies) are made when a look asks and freed only in `dispose()` (`fluid.ts`): after
      one look that uses them, about 25 MiB a layer at 512², 57 at 768² and 100 at 1024²
      for the rest of the set. Free them in `clearChemistry()` and `clearPhase()`, or
      once idle, and drop their bind groups too: the cache is keyed by label, and a
      remade texture has the same one.
    - The bubble rims' "once per mirror, not once per frame" guard fires every frame.
      `readbackAsync` calls a readback fresh whenever its ring holds any copy
      (`ring.latest`), which after the first landing it always does, so `rbSeq` moves
      every frame and `depositBubbleRims` deposits again from a mirror that has not
      changed: the failure `rbSeq`'s comment was written for (a popped bubble refilling
      to 124 %). Fresh only when `landed` moved.

    **Measure:** `npm run crash`'s out-of-memory door with a constructor that throws (a
    later out-of-memory is still caught); `npm run pops` with both ring slots held busy
    (a popped bubble's rim is laid once).
21. **S21 — A wall that is drawing, but wrong.**
    - The heartbeat catches frames that stop. Nothing catches a wall that draws the
      wrong thing: a frozen mirror (S15), one flat colour, or black that nothing asked
      for (no blackout, no Pacing fade, no dark ending).

    **Do:** a coarse colour variance and a motion reading from the probe (PLAN.md 14r's
    tiles), held against what the show intends; the desk and the phone go amber, and a
    learnable Rescue Go goes to a safe look the set list names, logged with a
    screenshot. **Measure:** `npm run crash` with a frozen mirror and a forced flat
    plate: amber within 3 s, and Rescue brings the motion back.

## Picking this back up (on the Mac)

1. **PR #127** carries the black box and S0. On the Mac, run:
   - `npm run crash`: the soak, now including the throw checks
   - `npm run webgpu`: the smoke, which includes `loseDevice`
   - `QA_DPR=1 QA_GPU=mid npm run qa`: a show night
2. **Watch the device paths once by hand**, with `?debug` in the console:
   - `chromaglassDebug().throwFrames(10)`: the frames carry on
   - `chromaglassDebug().throwFrames(200)`: "rebuilding the plate…" appears, then comes back
   - `chromaglassDebug().loseDevice()`: the loss and its recovery
   - `chromaglassDebug().crash.thisLoad()`: all of the above as lines in the log
3. **After a crash on the live site,** the button lights on the next load. Save the report and attach it to an issue: its `last()` line and log tail are what S8 would collect automatically.
4. **Then back to the roadmap's running order** (`roadmap.md`, `PLAN.md`).
