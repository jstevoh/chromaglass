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

**S0**, below, closes the doors that are cheap to close. **S1–S15** are the
larger jobs, in the order they should be taken.

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
out-of-memory and backoff paths have no harness yet; see S8.

## S1–S15: the larger jobs

Ranked by what they cost a show.

1. **S1 — The React tree renders every frame.**
   - `useAudioAnalyzer` calls `setAudioData` inside `requestAnimationFrame` and allocates two `Uint8Array`s each time.
   - That re-renders `App` (3.7k lines), `LiquidVisualizer` (6.5k), the desks, and any open panel, 60 times a second, with no `memo` anywhere.
   - `useImperativeHandle` in the visualizer has no dependency array, so ~40 closures are rebuilt per frame.
   - The cast-audio effect also runs per frame.

   **Do:** audio into a ref that consumers read; a ~10 Hz state copy for the meters only; reused buffers; `[]` deps on the handle (it reads refs); `memo` on the heavy panels. This is the biggest steady main-thread cost, and the main suspect for jank that turns into missed frames on weak laptops.
2. **S2 — The video recorder holds everything in memory.**
   - `useRecorder` pushes a chunk a second at 12 Mbps: ~5.4 GB/h, ~18 GB/h at `?rec=40`.
   - `new Blob(chunks)` at stop doubles the peak.

   **Do:** stream chunks to disk (File System Access `createWritable`, or OPFS), split long recordings, and show the size while recording.
3. **S3 — Restore the plate, not just the look, after a rebuild.**
   - The dye lives in the solver's textures, so every recovery (a loss, and now a self-heal) lays the look again from nothing.

   **Do:** keep a CPU snapshot a few seconds old (the readback ring already brings the fields back) and seed the new solver from it.
4. **S4 — Error scopes on the frame, not a heuristic.**
   - `ERROR_STORM` is a count; it cannot say which pass is broken.

   **Do:** sample `pushErrorScope('validation')` and `('out-of-memory')` around `stage.frame()` every N frames, and around every allocation that scales with the canvas (post chain, camera, projector targets, canvas resize). The first error then names its pass in the crash log, and the governor can step down for the target that did not fit, not only for the solver.
5. **S5 — The first readback after a rung change.**
   - `attachGpu` pulls from `rbDye`/`rbVel`, which start as zeros until the first ring readback lands.
   - Two rung changes within ~2 frames copy zeros, and the plate goes blank while the show runs on.

   **Do:** a `landed` flag; skip the pull and keep the CPU arrays until one has landed.
6. **S6 — One pipeline cache per device.**
   - Every `WebGPUFluid`, and every `WebGPUParticles` toggle, builds its own `PipelineCache`.
   - So each rung change recompiles every shader, which is a CPU and driver spike at the same moment as the memory swap.

   **Do:** share one cache per device, owned by the stage.
7. **S7 — Readback garbage.**
   - `ReadbackRing` does `getMappedRange().slice(0)`: ~590 KB per field, two fields per layer, every frame. That is ~70 MB/s of allocation per layer and constant GC pressure.

   **Do:** copy into a buffer kept across frames.
8. **S8 — A harness for the doors in S0.** None of these can be reached from a page today:
   - out of memory: a debug hook that makes `WebGPUFluid` allocate past `maxBufferSize`, or pins the grid cap
   - a null adapter on recovery: stub `navigator.gpu.requestAdapter` to answer null twice
   - a request that never answers
   - an error storm: a debug hook that submits an invalid bind group each frame

   **Do:** give each a hook under `?debug`, and a check in `npm run crash` that the show comes back.
9. **S9 — An hour in CI.** A nightly macOS job that runs a show for an hour and fails on:
   - growth in `performance.memory.usedJSHeapSize`
   - the device's own memory, where it can be read
   - frame-time drift
   - any fatal in the black box

   Everything above is about what happens *after* hours; nothing checks for it.
10. **S10 — Crash reports that arrive.**
    - A `/report` path on a Worker (the fingerprint Worker, or its own), with storage and a daily digest.
    - Build with `VITE_CRASH_REPORT_URL` so **Send** appears.
    - Grouped by the black box's `last()` line, so the next round of this plan is picked from what the field actually reports.
11. **S11 — The fingerprint index.**
    - `buildIndex` rebuilds a `Map<hash, number[]>` of every song ever stored, on the main thread, after every newly mapped song.
    - Its memory and the stall grow with the library, across sessions.

    **Do:** add to it incrementally, store it in typed arrays, and build it in a worker.
12. **S12 — Cast state rate.**
    - Even without the logo, a state goes out every frame of a fade.

    **Do:** throttle to ~10 Hz. The receiver interpolates anyway.
13. **S13 — The song-map decode.**
    - Even capped at ten minutes, `decodeToMono` decodes at the file's rate and in stereo before resampling: ~230 MB at 48 kHz.

    **Do:** decode in slices, or trim before resampling.
14. **S14 — Dev-only teardown race.**
    - In StrictMode a late first stage runs `context.unconfigure()` on the canvas the second run is using, so `getCurrentTexture()` throws.
    - Only in dev, but it is the same symptom and confuses the hunt.

    **Do:** destroy only the device on the cancelled path.
15. **S15 — Small change.**
    - `WebGPUPlate` is never disposed in the cleanup (the device's destroy covers it, but it should say so).
    - `beads.ts` allocates a `Map`, a `Set` and arrays every crowding step.
    - `WebGPUChemistry` is never imported; delete it.

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
3. **After a crash on the live site,** the button lights on the next load. Save the report and attach it to an issue: its `last()` line and log tail are what S10 would collect automatically.
4. **Then back to the roadmap's running order** (`roadmap.md`, `PLAN.md`). S1 and S2 are the two items here worth taking before new features. S1 also makes everything else cheaper to measure.
