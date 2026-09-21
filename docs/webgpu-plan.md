# Plan: WebGPU only

*Written 2026-09-19 against `origin/main` at `b5574eb` (#91). Line numbers drift, so the
symbol names are what to search for. **In flight**: P0–P3 have landed (#93, #94, #95,
#96, #97), and P4 has its two safety pieces — see the results sections below. [The
roadmap](roadmap.md) says where this sits.*

## P0 results, 2026-09-19

The spike lives on the branch `spike/webgpu-p0`: `spike/webgpu/` holds the probe pages, and `scripts/webgpu-spike.mjs` and `scripts/webgpu-solver-spike.mjs` run them. A workflow ran the probe on ubuntu-latest and macos-15.

**The solver is faster on WebGPU, on the M4.** The test was the solver's core as gpuFluid.ts has it: project, MacCormack velocity, project, MacCormack dye, which is 58 full-grid passes. It ran as the same math in both APIs, with WebGL on ANGLE Metal and WebGPU as compute.

| Grid | WebGL | WebGPU | WebGPU is |
|---|---|---|---|
| 256² | 2.57 ms/step | 0.32 ms (GPU 0.33) | 8.1× faster |
| 384² | 2.60 | 0.65 | 4.0× faster |
| 512² | 2.74 | 1.25 | 2.2× faster |
| 768² | 3.78 | 3.74 | about the same |
| 1024² | 8.83 | 8.22 | about the same |

- WebGL's time is flat at about 2.6 ms up to 512². At the app's working grids it is the cost of 58 draws through ANGLE, not arithmetic.
- The two meet where memory bandwidth limits both (768² and up).
- Both computed the same numbers: the first dye texel is 0.5254/0.9995/0.2998/0.908 in both.

**CI: GitHub's Apple Silicon runners (option 2).**

| Runner | Adapter | 88 stencil passes a step | Canvas |
|---|---|---|---|
| macos-15, `channel: 'chromium'`, no flags | **Apple GPU on Metal** | 2055 steps/s at 128², 448 at 256² | presents; drawImage and captureStream work |
| macos-15, headless shell | none | — | — |
| ubuntu-latest, every flag set | SwiftShader (fallback) | 22 steps/s at 128², 6 at 256² | **never presents**: `getCurrentTexture()` is invalid, then the device is lost |

- Linux software WebGPU can compute but cannot draw a canvas, so it cannot run the app.
- The macOS runners are free on this public repo and need no flags. They need Playwright's full Chromium (`channel: 'chromium'`), because the default headless shell has no adapter.

**Reading a WebGPU canvas.**
- **`drawImage` in the same task as the render works** (0.68 mean). **After the frame is presented it reads black** (0.000), because WebGPU has no `preserveDrawingBuffer`. What needs changing:
  - **Harnesses:** `grabFrame()` (a copy of the frame into a buffer), as planned.
  - **`StageMirror`:** today it `drawImage`s the opener's canvas in its own frame, so it needs its own route. Options: draw in the same task as the render; configure the popup's canvas with the same `GPUDevice` and render into it; or `captureStream` into a `<video>`. Decide in P3.
  - **The recorder:** `captureStream` works (29–52 KB for 1.2 s at 60 fps).

**Still open from P0:** the Safari 26 and Firefox-on-Windows smoke tests (the probe page is the test), and qa's real run time on the macOS runner, once the app runs on WebGPU (P1).

## P2 results, 2026-09-19

The solver, the pours, the reaction, the measurements and the drain are on
WebGPU, and `npm run parity` (16 checks) is the gate. On this M4, against the
WebGL solver, one step at 192² and 384²:

| What | How close |
|---|---|
| Dye after one step | mean 2.3e-6 of rms, worst 3.3e-3 |
| Velocity after one step | mean 1.7e-5 of rms, worst 2.8e-3 |
| Dye mass after sixty steps | 1.006× |
| Mean speed after sixty steps | 1.001× |
| The reaction after 24 iterations | mean 1.4e-8 of rms |
| The drain, 45 frames | both plates empty to 3.6e-8 of 2272 |

Three things changed shape on the way:

- **The deltas are full-resolution fields now.** A pour is a *record* — middle,
  radius, falloff, what it deposits — and one dispatch lays every record of a
  frame onto the grid (`src/gpu/wgsl/splat.ts`). The CPU's 192² arrays still
  work, upsampled on the way in, so both paths meet at the same three textures
  and parity can pour the same drop through each: they agree to 4e-5 of rms.
  A picture pours at the plate's own resolution rather than at 192².
- **The plate measures itself.** Mean dye, mean colour, peak density and the
  fastest flow come back in 32 bytes from a two-stage reduction, instead of a
  megabyte of field. They match sums taken over the field to eight digits.
  What still needs the whole field on the CPU — `liquidPhase`, the bead and
  bubble positions, the macro camera's argmax — is untouched, and is either a
  GPU port or GPU-side particles later.
- **No `layout: 'auto'`.** It drops any binding a shader does not happen to
  read, so a pass that ignores its uniform refuses the bind group every one of
  its siblings takes. Layouts are built from the shader's own `@binding`
  declarations (`layoutFromWgsl`), and the passes that only read a neighbour
  one logical cell away do their own bilinear rather than take a sampler,
  which keeps 32-bit fields off the filtering path.

**What it costs on the M4**, milliseconds per call, measured through the parity
page's own solvers:

| Grid | A step | The CPU's deltas | 1 splat | 50 | 200 | 500 | A measurement |
|---|---|---|---|---|---|---|---|
| 256² | 1.41 | 0.40 | 0.10 | 0.14 | 0.37 | 0.81 | 0.05 |
| 384² | 1.71 | 0.41 | 0.24 | 0.36 | 0.84 | 1.80 | 0.06 |
| 512² | 3.44 | 0.58 | 0.42 | 0.65 | 1.49 | 3.18 | 0.10 |
| 768² | 9.08 | 1.37 | 0.91 | 1.39 | 3.29 | 7.06 | 0.19 |

Two things to read out of that. A pour costs less than the upload it replaces
until there are about a hundred and fifty of them in one frame, which a show
reaches only when a preset seeds itself; a frame of playing is twenty to sixty.
And the per-record cost is linear because every cell tests every record — if
that ever matters, the fix is to bin the records into tiles on the CPU and have
each workgroup read only its own tile's list. It is not worth the complexity at
the counts the app actually produces.

**What P2 does not do:** none of this is wired to the app yet. The WebGPU
branch still draws the black plate, because the frame loop and the WebGL
renderer are one function — splitting them is P3's first job, and the
harnesses that judge the app under the flag moved to P3 with it.

## P3 results so far, 2026-09-19

**The composite is translated and proved** (PR #95). `npm run composite`
builds both shaders over the same textures and the same uniforms and compares
the frames, one case per thing the plate does:

| | |
|---|---|
| Cases | 33, from the bare plate to the macro closeup |
| Pixel-identical | 31 |
| Worst difference in the other two | 2 of 255, on a dish rim's antialiased edge |
| `lacing`, the one case with a tolerance | 8 subpixels of 786,432 |

Two real bugs came out of it, which is the argument for having built the
harness before the shader:

- **`dpdy` is the other way round from `dFdy`.** WebGPU counts framebuffer rows
  down where GL counts them up, so every oil bead caught the lamp on its wrong
  side — 12% of the frame differing by up to 12 of 255.
- **WGSL will not take a derivative inside a per-pixel branch.** The quad has to
  run whole. The GLSL called `lacing` from inside one, so its `fwidth` read
  pixels that had taken another path, which GLSL's own spec calls undefined.
  The WGSL runs the call for the whole quad and masks the result.

Three smaller traps, for the next shader: `macro` is a reserved word in WGSL,
as a uniform's name and as a local's; a backtick inside a WGSL comment ends the
TypeScript template literal holding it; and a WebGL2 colour attachment needs a
sized internal format, or the draw fails with INVALID_OPERATION and a black
frame that says nothing about why.

**The uniforms are declared once.** The table in `gpu/wgsl/plateFields.ts`
generates the WGSL struct, the TypeScript that fills the buffer, and the GL
side of the harness.

**And the draw has a boundary.** The six state advances came out of the draw
block, then the 464 lines of drawing became `drawFrame(view)` — eight plain
values, no GL crossing. What is left of the split is the renderer interface,
moving the loop, and pointing the WebGPU branch at it.

**The mirror has a route now** (P0 left it open). `StageMirror` in
`CastDisplay.tsx` runs its own rAF in the projector window and `drawImage`s the
show window's canvas — which is precisely what a presented WebGPU canvas cannot
serve, because it reads black once the frame is out. The fix is to turn the
pull into a push: the show window draws into the projector's 2D context inside
its own frame task, right after the frame is drawn, where the canvas is still
readable. The mirror keeps announcing its size and stops pulling. That is a
smaller change than it sounds, it removes a second clock that could tear
against the first, and the letterbox maths moves across unchanged. (Copying the
frame texture into a second canvas configured with the same device would be
cheaper still, and is the thing to try if the push ever costs too much.)

**A move is not free even when it changes nothing.** Lifting the GLSL into its
own file turned `plate` and `panel` red: both read the shader out of
`LiquidVisualizer.tsx` to prove the reconstruction weights and the
kaleidoscope's settings are still there. Harnesses that read source are worth
having and worth grepping for before moving anything.

## P3, the rest of the chain, 2026-09-20

The split landed (#96): the six state advances, the flash guard's verdict, a
`PlateRenderer` in place of a context, the loop above both engines, and then
the plate drawn on WebGPU — 768² on the M4, 2.06 ms of GPU at 512².

Since then, everything between the plate and the canvas (#97):

- **The pictures the compositor is handed.** The mark, the film and the beads'
  mask were never uploaded under the flag, and `npm run composite` cannot see
  that: it feeds both shaders the same bytes, so it proves the sampling and
  nothing about the upload. The bead mask is part of the frame's view now, so
  the show decides once when it is redrawn and both engines upload on the same
  frames. `npm run webgpu` asks both engines to lay the same mark and compares
  where it landed — 89.8% of its rectangle against 89.4%, leaning 3.04×
  against 3.06×.
- **The camera** (`gpu/wgsl/camera.ts`, gate `npm run camera`): 13 cases, 9
  pixel-identical, the rest within 1 of 255 except the two with grain.
- **The projector** (`gpu/wgsl/output.ts`, gate `npm run output`): 14 cases,
  every one within 1 of 255. The geometry is not ported — both sides call
  `cornerPinMatrix` and `composeOntoPin` — so a difference there is a
  difference in the drawing.

**Three things worth knowing for the passes still to come.**

- **A hash of an interpolated coordinate will not match.** The camera's grain
  hashes `v_uv * u_resolution`, and two compilers' interpolators do not agree
  on its last bit at every pixel; where they differ the grain is a different
  sample, ±5 of 255 on 0.3% of them. A hash of the *fragment* coordinate
  matches to within 1. Any future pass that wants pixel equality should hash
  the fragment coordinate, and `gl_FragCoord` in WGSL is
  `U.resolution.y - pos.y`.
- **Uniforms read by the vertex stage need the visibility to say so.** The
  projector puts each quad's corners in the buffer and builds its triangles
  from `vertex_index`, which means `layoutFromWgsl(…, VERTEX | FRAGMENT)`;
  with FRAGMENT alone the entry point does not match the layout and nothing
  draws.
- **Sixteen draws become one.** There is no setting a uniform between draws in
  a pass. Every quad goes in the buffer at once and the shader reads its own
  by `instance_index`, which keeps the blending order and costs one draw.

## P4 so far, 2026-09-20

- **The flash guard has its eyes.** The probe is a compute reduction over the
  canvas's own texture, encoded after the picture in the same task — the one
  moment a WebGPU frame can be read. It is also exact where the WebGL one
  approximates: a quarter of the frame reads 0.2500, a one-pixel line 0.0019
  of 0.0019, the whole frame 1.0000. Through the projector's grade it reads
  0.018 dim / 0.063 plain / 0.119 lifted, which is `wall`'s own check of the
  WebGL probe.
- **The device can be taken away.** There is no restore event in WebGPU, so
  the recovery is to ask for a new device: the loss drops the solvers, lets go
  of the passes, resets the guard and bumps the epoch, and the effect runs
  again from the top. The plate does not survive — the dye is in the solver's
  textures — so the look is laid again. `npm run webgpu` proves it with
  `device.destroy()`: 99% lit, the notice, 99% lit again, nobody touching
  anything.

**The sweep reaches 1024² now, and both engines.** `npm run bench --full
--webgpu` puts the sweep on the WebGPU stage; the rungs go one past the top of
the ladder so the report says what the machine *could* do rather than only
what the app will ask it for. Two layers, dpr 1, 1280×800, on this M4:

| Grid | WebGL | WebGPU |
|---|---|---|
| 256² | 59 fps | 58 |
| 384² | 59 | 58 |
| 512² | 59 | 59 |
| 768² | **36** | **27** |
| 1024² | 24 | 22 |
| CPU 192² | 24 | 24 |

**At the top rungs the port is behind, and the profiler says it is not the
drawing.** At 768² the WebGPU frame is 37.9 ms, of which the plate pass — the
pack, the derive and the whole WGSL composite — is 2.0 ms of GPU and the
encoding is 0.5 ms of CPU. The rest is the solver, whose compute passes are
the ones `GpuProfiler` does not yet time. P0 measured the two solvers' cores
as about equal at 768² (3.78 ms against 3.74), so what is costing the
difference is in the app's solver rather than in the arithmetic the spike
compared. **Timing the solver's passes is what the governor item needs first**
— judging a frame by real GPU cost is worth little while the expensive half of
it is untimed.

`bench` also had a bug this found: `onRung` asked for `engine === 'gpu'`, so
under the flag every rung the sweep actually reached was recorded as one it
never reached — "the solver never reached 256² (it stayed on 256²)".

**The solver's passes were timed all along** — `WebGPUFluid` keeps a profiler
of its own, and the stage's only sees what the stage encodes, so the debug
surface reported the 2 ms of drawing and nothing about the 18 ms underneath
it. `chromaglassDebug().webgpu.solver` is that profiler now, per layer. At
768², per step: 9.18 ms and 8.71 ms for the two layers, against a 2.13 ms
plate pass, in a 37.9 ms frame. The spike's 58-pass core was 3.74 ms at the
same grid.

**That gap was first written up here as the chemistry, the splats and the
measurements — the work the spike did not include. It is not.** Those run on
their own command encoders, with no timestamps on them, so they are not in
the 9.18 ms at all: that number is one compute pass, `label: 'step'`, and
nothing else. What is in it is about 101 dispatches against the spike's 58 —
0.091 ms each against 0.064 — so the app's step costs what it costs mostly by
doing 74% more dispatches, not by doing dearer ones. **Forty-eight of those
101 are pressure Jacobi**, twenty-four in each of the two projections, and
that is the single largest block of work in the frame by a wide margin.

It was still an inference rather than a measurement: one timestamp pair spans
the whole step, so the split above was arithmetic over the dispatch list, not
something the GPU had been asked. **H0 asked it, and the arithmetic was wrong
too.**

## H0 — where a step's time actually goes

`?stages` (or `chromaglassDebug().webgpu.stageTimings(true)`) gives every
named stage its own compute pass and its own timestamp pair; `npm run stages`
reads them back. Splitting costs about a dozen pass boundaries a step and
**2%** — 9.34 ms split against 9.14 ms whole — so the shares can be trusted.
Classic, two layers, 768², dpr 1, on this M4:

| Stage | ms | Share | Dispatches |
|---|---|---|---|
| project 2 | 1.351 | 14.5% | 27 |
| project 1 | 1.332 | 14.3% | 27 |
| dye diffuse | 1.325 | 14.2% | 5 |
| squeeze | 1.086 | 11.6% | 12 |
| viscosity | 0.955 | 10.2% | 5 |
| advect dye | 0.902 | 9.7% | 3 |
| **forces** | **0.808** | **8.6%** | **1** |
| advect velocity | 0.667 | 7.1% | 3 |
| current | 0.402 | 4.3% | 13 (coarse) |
| decay | 0.282 | 3.0% | 2 |
| grain | 0.234 | 2.5% | 1–2 |

**Cost does not track dispatch count.** That was the working assumption above
and it is off by more than an order of magnitude in places: a pressure Jacobi
dispatch is 0.049 ms and `forcesB` — one dispatch — is 0.808. The step is
bound by what each kernel does per pixel, not by how many kernels there are,
so counting passes predicts nothing.

**What it means for H2.** The two projections are 28.8% of a step, not the 48%
the dispatch count suggested and not the 5% the spike's core suggested. Both
earlier readings were wrong, in opposite directions. Halving the Jacobi count
would save about 14% of a step, which is 2.6 ms of a 38.6 ms frame at two
layers — worth doing, and no longer the thing everything else should wait for.

**The larger target is iterative solves as a class:** project ×2, dye diffuse,
squeeze and viscosity are **64.5%** of a step between them. Whatever replaces
24 Jacobi passes should replace the other four solves at the same time.

**`forcesB` is the most expensive kernel per dispatch in the solver**, and the
reason is not the one it looks like. Switching turbulence, spin, tension,
fingering, drip and air all off takes it from 0.808 to 0.368 ms on the lead
layer — so the forces are worth 0.44 ms between them. But switching off any
one of them alone changes nothing measurable: turbulence alone is 0.808 →
0.792, tension alone 0.818, fingering alone 0.799, all within the run-to-run
drift.

Costs that vanish together and not separately are not branches being
expensive. The kernel's register allocation is static — the compiler sizes it
for the worst path whether or not that path runs — so what the forces cost is
occupancy, and removing one branch's *execution* leaves the allocation where
it was. The first guess written here was that the turbulence loop's four
`snoise` calls per octave were the cost and an analytic-derivative noise was
the fix. The measurement says a cheaper noise would have bought nothing. What
would is splitting the kernel, or shrinking its worst path.

**Measuring one thing at a time is what caught this**, and it is also what
would have got it wrong: the single-branch numbers look like six cheap
branches, and only the all-off number shows 0.44 ms sitting somewhere.

## H2 — the pressure solve, halved and not halved

Twenty-four Jacobi passes became twelve red-black Gauss-Seidel sweeps. The
pressure left its texture for a storage buffer to allow it: Gauss-Seidel
updates in place, a shader cannot write a texture it is reading, and
read-write storage textures need a language extension that is not broadly
available. Red-black is what makes the in-place update safe — colour the grid
like a chessboard and no two cells of a colour are neighbours.

**The quality is the same, and that is measured rather than assumed.**
`chromaglassDebug().webgpu.pressureSelfTest()` runs both solvers on one
divergence field and compares the residual each leaves, which is what the
projection is actually for: 24 Jacobi 6.8866e-2, 12 red-black 6.8953e-2 —
**0.13% more residual for half the arithmetic**. `npm run webgpu` gates it.

**The test was wrong before it was right**, in a way worth keeping. Its first
divergence field was a Gaussian blob, all positive, and every solver at every
iteration count reported exactly 4.5239e-2 — which is the mean of the blob. A
Poisson problem with Neumann walls everywhere has no solution unless its
source integrates to zero, because the discrete Laplacian sums to zero over
the domain; whatever the source sums to is a residual no iteration can
remove. A real divergence field is zero-mean for the same reason in reverse.
Both solvers had been working the whole time; the problem was not a problem.

**Half the arithmetic bought 18% of the stage, not 50%.** At 768², two layers:

| | before | after |
|---|---|---|
| project 1 | 1.332 ms | 1.120 |
| project 2 | 1.351 ms | 1.146 |
| a step | 9.14 ms | 8.64 |
| a frame | 38.6 ms | 35.9 |
| steps a second | 45.3 | 46.9 |

Running it at four sweeps as well gives the slope: a projection's fixed cost —
the divergence, the clear, the gradient — is 164 µs, and each red-black sweep
is **79.6 µs** against a Jacobi pass's **48.6 µs**. A sweep is two
half-sized dispatches doing exactly the same number of cell updates as one
Jacobi pass, and it costs **1.64×**.

**Which says the pressure kernel is bound by its memory pattern, not its
arithmetic.** Consecutive threads in a checkerboard sweep touch cells two
apart, so a half-dispatch reads about the same cache lines a full one would
and halving the threads halves almost nothing. The remedy is the standard
one and it is the next thing here: pack the two colours into contiguous
halves of the buffer so each sweep is dense. If a sweep then costs what a
Jacobi pass costs, the projection falls by half as the arithmetic always said
it should — worth about another 6% of a frame.

## What a step costs at each grid, and why it is not what it looks like

`npm run stages` across the ladder, two layers, Classic on this M4:

| grid | cells, ×256² | ms a step | ×256² | µs per megacell |
|---|---|---|---|---|
| 96² | 0.14 | 0.77 | 0.33 | 83,550 |
| 128² | 0.25 | 1.00 | 0.43 | 61,035 |
| 192² | 0.56 | 1.72 | 0.74 | 46,658 |
| 256² | 1.00 | 2.34 | 1.00 | 35,706 |
| 384² | 2.25 | 3.76 | 1.61 | 25,499 |
| 512² | 4.00 | 3.59 | 1.53 | 13,695 |
| 768² | 9.00 | 8.72 | 3.73 | 14,784 |

**Sixty-four times the cells for eleven times the cost.** A step is nowhere
near proportional to the grid, and the efficiency column says why: a cell at
96² costs six times what a cell at 512² costs. Below about 256² the solver is
not doing arithmetic, it is launching dispatches — a fit over the small grids
puts **0.75 ms of every step beyond the grid's reach**, which across ~101
dispatches is about 7 µs each.

**This is the reason the red-black sweeps returned 18% and not 50%,** and it
is a warning about the rest of H2: dye diffusion, the squeeze film and
viscosity are all *arithmetic* to cut, and at the grids the show actually
runs a good deal of the step is not arithmetic. Count dispatches before
counting operations.

**512² is the best value on the ladder by a wide margin** — four times the
cells of 256² for about half as much again — which is worth knowing when the
governor is deciding what to give up. Dropping the grid buys much less frame
time than its resolution loss suggests; dropping device pixels may be the
better trade, and the governor does not currently know the difference.

**One number in that table is the weather, not the code.** 384² reads slower
than 512², which would mean a rung that costs more than the finer one above
it. Measured again at eighteen seconds with the two alternating — the way
this plate has to be measured — 384² is 6.60 ms against 512²'s 8.26. The
ladder is fine. The first reading was one run of a chaotic plate, which is
the third time in two days that has nearly become a finding.

## The quality ladder, measured — and half of it was doing nothing

`npm run ladder` holds the governor on one rung at a time (`?rung=`) and
reads what that rung costs. `?sim=` could not do this: pinning the grid turns
the governor off, and an ungoverned frame renders at one device pixel
whatever the rung says — so the pixel half of a rung had never been measured.
It turned out to be the half that was broken.

**Every pixel rung was inert.** A rung is a solver grid *and* a share of the
display's pixels. The renderer's own canvas sizing read `devicePixels()` —
the *display's* ratio — where the rung carries its own, so a step from 512²
at 2x to 512² at 1x wrote a new number into the readout and the status and
left the canvas exactly where it was. Measured on a 2x display, the canvas
was **2560×1600 on all five rungs of a five-rung ladder**.

That is the worst shape a quality control can have. The governor gave up a
rung of quality, believed it had bought headroom, found none, and went
looking for the next thing to give up. Fixed, the same step saves 2.0 ms of
drawing — about half of it:

| rung | grid | dpr | canvas | frame | step | drawing |
|---|---|---|---|---|---|---|
| 0 | 768² | 2.00 | 2560×1600 | 39.8 ms | 17.30 | 4.98 |
| 1 | 512² | 2.00 | 2560×1600 | 16.9 | 6.83 | 4.43 |
| 2 | 512² | 1.00 | 1280×800 | 17.2 | 8.20 | **2.43** |
| 3 | 384² | 1.00 | 1280×800 | 17.1 | 6.74 | 3.38 |
| 4 | 256² | 1.00 | 1280×800 | 16.9 | 4.00 | 3.23 |

**And on a 1x display the ladder had a rung twice.** `{512, dpr}` and
`{512, 1}` are one rung when `dpr` is 1 — a projector, most external
monitors, any machine that is not Retina. The governor cannot tell, so a
machine struggling at 512² would step down, wait out a settling period,
measure the identical frame and step down again: four seconds of a slow show
spent discovering that nothing happened. `qualityLadder` deduplicates now,
and a 1x display gets four rungs where a 2x one gets five.

**The frame column cannot see any of this on a fast machine**, which is why
it went unnoticed: rungs 1 to 4 all read 17 ms because they are all capped by
vsync. What distinguishes them is GPU cost, not frame time — the step and
drawing columns — and the governor watches frame time. On a machine with room
to spare that is correct and it does not matter; on a machine without it, the
rungs now differ.

`npm run rungs` checks the shape without a browser — that every rung is a
rung, that a step down gives something up, that halving a rung's pixels
quarters the canvas — and it runs in CI beside the other arithmetic.

**And the plate is in slow motion at the top rung.** 45.3 steps a second
against the 60 the show asks for, inside a 38.6 ms frame. A frame rate cannot
show you that: the liquid is simply evolving at three quarters of wall-clock
speed. 768² is a rung this machine can draw and cannot keep time on.

**The governor is judged on the GPU's own number now.** Its climb gate is a
work budget, and on this path the work was half a millisecond of encoding
whatever the machine was doing — so the gate was satisfied at every rung and
it would climb into a grid the GPU could not hold, find out a second and a
half later, and come back down. What it is fed now is the drawing plus the
solver's steps, from the timestamp queries. Forty-five seconds on this M4, one
reading every five:

| | 5 s | 10 s | 15 s | 20 s | 25 s | 45 s |
|---|---|---|---|---|---|---|
| **WebGL**, unchanged | 512² | 512² | **768²** | 768², 27 ms | back to 512² | 512² |
| **WebGPU**, with the GPU's number | 512² | 512² | 512² | 512² | 512² | 512² |

The WebGL row is what the hunt looks like: up at fifteen seconds, a 27 ms
frame, down again at twenty-five, and round again ninety seconds later. It
keeps that behaviour — its timer queries count queue waits on ANGLE and lie,
so that path passes nothing and nothing changes for it — and loses it at the
cutover, when the honest numbers are the only ones left.

**P4 is done** but for the harness work that belongs to P5.

## P5 so far, 2026-09-20

**The show night runs on the stage.** `QA_RENDERER=webgpu npm run qa` walks
the same 125 checks under the flag, and CI runs it on the macOS job where
there is a GPU to run it on — at the real device pixel ratio and on the GPU
solver, neither of which the ubuntu job can do. It went from 39 of 46 and a
crash to 125 of 125; what it took was four things, and all four were the
harness's assumptions rather than the app's behaviour:

- **One way to photograph the plate.** Three checks read the canvas with
  `drawImage`, which a presented WebGPU canvas answers with black — not an
  error, and indistinguishable from a black plate. `window.__qaFrame(w, h)`
  is installed for every navigation and uses `grabFrame` where there is one.
- **The engine check** asked for a label starting `GPU`; the stage says
  `WebGPU`.
- **Taking the GPU away.** `WEBGL_lose_context` does not exist here, so the
  section uses `chromaglassDebug().loseDevice()` where it is offered — and
  watches for the "rebuilding the plate…" notice with a MutationObserver
  rather than polling, because the rebuild can outrun a poll.
- **The deliberate loss says so in the console**, which the error watch had
  to be told is the check working.

**And one check does not transfer, for a reason worth keeping.** "A drag
across it lays down dye" stills the transport and reads the CPU delta array.
WebGL stages a gesture there — measured, 39.6 with the plate untouched —
while WebGPU's goes into a buffer the next step consumes, where nothing on
the CPU can see it and the plate does not move either. Both readings are
zero, and a check asking for a rise would be asking the wrong path a question
it cannot answer. That a pour deposits the same dye whichever solver takes it
is `npm run parity`'s business already: it pours the same drop through both
and they agree to 4e-5 of rms.

**And it found a real one on its first CI run.** "Destroyed texture [Texture
"grain a"] used in a submit", over and over. The painter the renderer hands
the stage outlives the frame that set it — `grabFrame` runs it again — and a
rung change in between disposes the solver whose textures it was drawing. It
never happens on this Mac, because the governor now holds 512² here; it
happens on a runner under load, where the governor steps down while a harness
is photographing the plate, and the new show night photographs the plate
constantly. The painter reads the live fields now, and corrects the grid the
uniforms were filled for if the rebuild changed it. `npm run webgpu` drops the
solver on purpose and photographs with no frame in between, which is that
window exactly.

**And the show night found the thing worth finding.** On the runner, four
checks read a frame that never changed, and the state they printed when they
failed said why: `CPU · 192², 17.3 steps/s over 1 layer, dye 1.125, 60.5
ms/frame, 353 frames drawn · read via grabFrame, 0% lit`. The governor had
walked down the ladder under load and reached its bottom rung, which is the
CPU solver — and the WebGPU stage has no way to draw a plate the CPU is
holding. Its compositor samples the solver's textures, and a field that is
not on the GPU has none. The plate was simulating perfectly well and the
stage was drawing sixteen hundred frames of nothing over it.

So that rung is not on this engine's ladder: it stops at 256², and a machine
that cannot hold it gets a slow show rather than no show. A pinned `cpu` grid
becomes the smallest the stage can draw, for the same reason. Both go for
good with the CPU solver itself (P7). `npm run webgpu` holds the line —
"no rung on this ladder is one the stage cannot draw — 768 → 512 → 512 → 384
→ 256" — and pins the grid to `cpu` to see a plate anyway.

It is worth saying how long that took to see: it cannot happen on this Mac,
where the governor holds 512² and never walks down. Four CI runs went into
it, and what ended it was the harness reporting the show's own state next to
the pixels it did not like rather than another guess from here.

## The post chain, 2026-09-20

F0's chain is on the stage (`gpu/post.ts`), with `npm run post` as its gate —
11 cases, six of them pixel-identical, the rest within 1 of 255 — and
`npm run fx` running the app's own F0 suite under the flag, 24 of 24.

The finish is not written twice: it is `FINISH_WGSL` from the plate's own
shader, as the GLSL shares `FINISH_GLSL` between the plate and the chain.

**Wiring it up found a flip that was already shipping.** A WebGPU render
target's first row is its top, and a full-screen quad's uv.y of 1 lands
there — so a pass sampling at uv.y 1 reads the *last* row, and a picture
handed from one pass to the next comes out upside down. The camera has done
this since it landed: measured, the mark moved from seven tenths down the
screen to two tenths the moment the camera came on. Nothing caught it,
because a parity harness feeds both engines a texture and both read it the
same way; the flip only exists when one WebGPU pass samples what another
*rendered*.

Every pass that writes a texture another pass will sample now flips its clip
space (`FLIP_Y`, an override constant, so the harnesses go on compiling the
unflipped pipeline). Two things follow from mirroring the geometry, and both
are handled: the beads' `dpdy` compensation inverts with it, and the effects'
noise takes its pixel from the uv rather than the position.

**What it costs is one thing, measured.** Mirroring perturbs the interpolated
uv in its last bit, and the composite's film grain is `hash(uv * resolution)`,
so the grain re-rolls: ±3.8 of 255 per draw, ±7.6 between two, mean 0.6 over
the frame. `fx`'s identity check allows that on this engine and holds the
bias — the number that would mean the chain really changed the picture — to
0.011 against a limit of 0.05, which is where WebGL's sits. The grain's
coordinate wants to be the pixel rather than the interpolator, which removes
it entirely; that is a GLSL change too, so it waits for the cutover.

**Also found:** a pipeline is built for one attachment state, and the plate's
was built for the canvas. Drawing into the chain's half floats with it is
rejected, the frame is black, and the render loop stops — so each pass is now
told the format it is drawing into as well as which way up.

**Still to do in P5:** `wall`, `shots`, `bubbles` and `dye` under the flag —
none of them reaches for a GL context, so it is the same two moves each time
(an engine hook on the URL, and the frame read through `grabFrame`) — the
thresholds re-baselined, and `qa`'s CPU default removed at the cutover.

**What is still WebGL's alone:** the post chain (F0), beads drawn on the GPU,
and `importExternalTexture` for zero-copy video. The film goes up today
through `copyExternalImageToTexture`, which is the parity route.

## P6, the cutover, 2026-09-20

WebGPU is what the app runs on. `?renderer=webgl` is the way back for the
transition — a show tonight on a machine with a bad driver should not be a
reason to redeploy — and it goes with the WebGL renderer at P7.

**A browser without WebGPU gets the screen, not a lesser show.** That was
already true for a browser with no adapter; it is true now for a machine
whose *solver* will not start as well. That path used to drop to the CPU
solver, which this stage cannot draw — the plate would simulate perfectly
well behind a black screen, which is the failure CI found on the ladder's
bottom rung, arriving by another road.

**CI splits along the same line.** A Linux runner can compute WebGPU and
cannot present its canvas (P0), so the ubuntu jobs run `CG_RENDERER=webgl`
and gate the path being kept; the macOS job runs what a visitor gets — the
parity gates, a show night at the real device pixel ratio on the GPU solver,
the post chain, and the wall.

**What an empty chain costs, measured.** Every render pass on this GPU costs
about the same whatever is in it: on an M4, the plate's 1,500-line composite
2.76 ms, the finish 2.83, the projector 2.54. So the chain is two passes and
a half-float round trip, not shader work — invisible at 60 Hz on a display
that caps there, and 54 fps against 37 on a runner already GPU-bound. That is
the cost the governor's post level exists to spend, and `fx` now allows it
proportionally on this engine while still catching an empty chain that costs
more than the two passes it is.

## P7, the deletion, 2026-09-20

The WebGL renderer, the GLSL, the solver that ran it, the passes that went
with it and the five harnesses that existed to compare the two are gone —
8,500 lines out. What is left draws the show one way.

**Merging the paths fixed three faults, all of them the same fault.** The
WebGPU branch returned from the setup effect before the shared setup ran, so
on the engine that had just become the default: the plate could not be
painted on (no mousedown, no mousemove, no touch — a drag staged 63.3 of dye
on WebGL and 0.0 here), a window that changed size kept the pixels it started
with, and the ladder's dpr rungs did nothing because the stage sized the
canvas from the raw device ratio.

The first of those had a check and it was excused. `qa`'s "a drag across it
lays down dye" read zero under the flag, and the reasoning written into the
harness — that the two engines stage a gesture in different places — was
wrong: nothing was staged anywhere. `npm run dye` was excused on the same
wrong reasoning and needed no excuse either; it had the fourth copy of
`/^GPU/`. Both are back, unexcused, at 127/127 and 17/17.

**What the parity harnesses proved goes with them.** `parity`, `composite`,
`camera`, `output` and `post` each ran two implementations over the same
inputs. There is one now, and what gates it is the app's own suites: `qa`,
`fx`, `wall`, `bubbles`, `dye`, `shots` and `webgpu`. The source-text checks
in `plate` and `panel` moved from the GLSL to the WGSL.

**CI keeps arithmetic on ubuntu and everything with a picture on macOS**,
because a runner without a GPU can compute WebGPU and cannot present its
canvas, and there is no second engine to fall back to.

**Two deviations from the plan, both deliberate.** `?kiosk=1` stays: it is
engine-neutral and a venue mini-PC still wants it. And `git grep -i webgl`
finds 40 lines in `src` rather than none — every one a comment where the
reference *is* the explanation ("WebGL's timer queries counted queue waits on
ANGLE and lied, which is why the governor reads timestamps"). Decoration was
pruned; reasons were kept.

**The last of P7's list, swept 2026-09-20.** The gate named more than the
engine: `?sim=cpu`, the `cpu` rung, the `software` class, and README, docs and
the CHANGELOG. Those are done now. The `cpu` member is off `SimResolution`, so
the CPU · 192² option is out of the settings panel — it had been resolving
quietly to 256², which is a setting that lies rather than a setting that is
gone. `qualityLadder` lost its `cpuFallback` parameter and its bottom rung,
`classifyGpu` went with the renderer string it parsed, and `EngineStatus.engine`
says `'none'` where it used to claim `'cpu'` for a stage with no solver
attached yet.

**The `software` class stays, against the plan's own list.** It was down for
deletion because it meant "use the CPU solver", and there isn't one. But it
means something else now and something true: a fallback adapter — llvmpipe,
SwiftShader, WARP — is a real WebGPU adapter that is very slow, and the class
is how it gets pinned to one 256² rung instead of being walked down the ladder
one measurement at a time. Deleting it would have cost a CI runner several
minutes per harness to rediscover.

**Two false greens fell out of the sweep, and the second was fresh.** `qa`
proves that pressing Seed does not rebuild the renderer, and it proved it by
counting `getContext('webgl2')` calls. With no WebGL in the tree that count is
zero whatever the effect does — green, always, and meaningless. It counts
`webgpu` now.

The second was in the replacement written here. `npm run webgpu` had a check
that pinned the CPU solver and asserted the plate still drew; with the pin
gone it was rewritten to pin a grid past what any GPU can allocate and assert
the clamp. It went green, reporting `grid 512` — the clamp is 1024, so the
number said plainly that the pin had not landed, and the check passed anyway
because it only asked for "lit, on the GPU". Two things were wrong with it, in
opposite directions: writing `chromaglassDebug().settings.simResolution`
changes a ref the drawing reads and not the state the solver is rebuilt from,
so the pin did nothing; and `chromaglassDebug()` returns a snapshot, so even
once the pin went through `chromaglassSettings` the `status` being read was
the one captured before it. It asserts `grid === 1024` now, which is the thing
that would have caught both. **A check whose detail string contradicts its own
premise is failing quietly** — read the number, not the colour.

**Still to do:** the CPU solver's stepping. It is unreachable — there is no
rung, no pin and no fallback that leads to it — but the class is threaded
with `if (this.gpu)` pairs whose other halves are the CPU maths, and pulling
them out is surgery on the simulation's core rather than a sweep. The arrays
themselves stay whatever happens: the deltas, the readback mirrors, the
beads, the bubbles, the macro camera and `liquidPhase` all live there.

## P3, the shape of the split

The render effect in `LiquidVisualizer.tsx` is 3,838 lines: the WebGPU branch,
then a 1,553-line fragment shader, then the setup, then `render()` at
5162–6886. Of the loop's 1,725 lines about a thousand are already engine-free —
the whole `for simStep` body, the chemistry, the macro camera, the exposure.
The drawing is the block behind `if (glr)` at 6359–6874. The loop never names a
GL object directly: it re-reads `webGLRef.current` each frame, which is the
seam already half-cut.

**What the two engines will both implement** — `src/render/types.ts`:

```
info { label, tier, gpuClass, renderer }   // no more reading a GL extension
maxTexture                                  // feeds resolveSimResolution
size / resize(dpr)
attachSolver(fluid, wantRes)
drawFrame(view, fluids)
probeLuminance()                            // after the draw; null when the guard is off
capabilities { derive }
dispose()
```

`view` is plain data: the folded settings, the clock, the shot, rotation,
harmony, film level, flow rate, the dimmer with the flash gain already in it,
the mark, the bubbles packed, the output config. No GL, no WGSL.

**Six pieces of app state currently advance inside the draw block** and have to
come out first, in their own commit with nothing else in it: the velocity range
(6376–6400), the kaleidoscope phase (6653–6666), the lamp (6667–6683), the gel
angle (6700–6712), the layer-1 view and the bubble pack (6725–6745), and the
effect frame counter (6806). They must keep advancing once per *rendered*
frame, not once per loop, or the lamp drifts at the wrong rate.

**The four that are genuinely entangled:**

1. *The flash guard.* `probe.measure()` is a readPixels, and its answer is
   consumed 200 lines earlier as the dimmer. It was always a frame behind, so
   the renderer offers `probeLuminance()` after its draw and the loop folds the
   gain into the *next* frame's view. The picture does not change.
2. *Attach and detach.* The loop constructs `GpuFluid` by name. It becomes
   `renderer.attachSolver(fluid, wantRes)`, and `FluidSimulation.gpu` narrows to
   the handful of members both solvers have. P3 does not unify the solvers; it
   only stops the loop from naming one.
3. *Pack and derive* (6417–6493), the one place CPU arrays and GPU textures
   meet. It goes wholly to the renderer, which asks each fluid for what it has.
4. *Canvas ownership.* `resize()` writes the canvas size and the viewport, and
   the macro camera, the mark rect and the film's cover-fit all read it. It
   routes through `renderer.resize(dpr)` and `renderer.size`.

**The order:** hoist the six; define the interface and move the draw block
verbatim into a `WebGLPlateRenderer`; move the loop into `src/render/showLoop.ts`;
point the WebGPU branch at the same loop with a clear-only renderer. Then the
compositor itself, pass by pass.

**And then the compositor itself.** Two decisions worth making before it
starts. It goes over as a *fragment* shader, not as compute: the GLSL is one
1,553-line program and the only way to trust the port is to compare it pixel
for pixel against the original, which means keeping its shape. Where a
neighbourhood pass would rather be compute (the derive pass, lacing), that is a
later optimisation with a picture to check it against, not a rewrite to do
blind. And the 91 uniforms become one buffer, declared once in a table that
generates both the WGSL struct and the TypeScript that writes it — a hand-kept
pair of those drifts the first time a uniform is added, and the symptom is a
picture that is subtly wrong rather than an error.

**What watches for breakage:** `qa` (the debug surface every harness uses, and
the texture-unit order — a wrong order is a black plate), `shots` and `wall`
(the integrators and the flash guard), `bubbles` (the pack, whose failure mode
is "0 pixels changed"), `bench` and `qa:gpu` (the governor, which must still
time the whole frame including the draw). `parity` does not watch any of it:
it is a solver-against-solver gate on a page of its own.

## The decision

- **WebGPU draws and simulates everything.** WebGL2, the GLSL shaders and the 192² CPU
  solver are all deleted.
- **A browser without WebGPU gets a clear "ChromaGlass needs WebGPU" screen,** not a
  degraded show.
- **The Pi box / appliance is dropped** and is not planned for.

The phone remote is only buttons and a touch pad, with nothing drawn by the GPU, so it
keeps working in any browser.

## What we get, and when

The port itself is **parity**: the same show, drawn by a different engine. The pictures
improve only when the headroom is spent (Phase H). What the port frees up:

| Headroom | Why it matters for the picture |
|---|---|
| Compute shaders, and writes to any location in memory (atomics) | **Dye carried by particles**, which don't smear. This is the one change that targets PLAN.md's measured gap: 3–5× less fine structure than filmed liquid at 4–8 px |
| Workgroup shared memory, fewer passes | A better pressure solver in place of 24 Jacobi passes, and a 1024² grid on strong GPUs |
| Splats written straight into the GPU fields | Gestures, automation and image pours at full resolution. Today they land on the 192² grid, which is why poured title cards are soft |
| GPU-side reductions | Exposure, means, the flash probe and velocity range with no pixel readbacks. Today two RGBA32F reads per layer per frame |
| Timestamp queries | A governor that knows real GPU cost, and cost badges on effects |
| `importExternalTexture` | Film and camera frames with zero copies. Today a full video upload every frame |
| Canvas `colorSpace`, `toneMapping: 'extended'` | Display-P3 colour and HDR highlights on screens that have them |

The filters plan (`docs/filters-plan.md`) is built **on WebGPU after the cutover**, so
its post chain is written once, in WGSL. Its WebGL-only items disappear:
- the texture-unit registry, and the unit-11 clash between `OutputPass` and the bead
  mask, because WebGPU has no texture units;
- the point-sampled flash probe, which is replaced here.

## What moves: the inventory

| Part | Today (WebGL2) | WebGPU |
|---|---|---|
| **Solver** (`gpuFluid.ts`, about 1,400 lines) | 24 fragment programs; per layer per step, about 88 full-grid draws plus 13 at M² (`SQUEEZE_ITERS` 10, `VISC_ITERS` 4, `PRESSURE_ITERS` 24 ×2, `CURRENT_ITERS` 10, `DYE_ITERS` 4, MacCormack ×2) | Compute pipelines over ping-pong storage textures. Jacobi first for parity, then a better solver (H2) |
| **CPU deltas** | Brushes, automation, `injectImage`, `pourText`, chemistry and the room stir write L² arrays; about 1.33 MB uploaded per dirty step | Each gesture is a small record in a buffer (`queue.writeBuffer`), and one compute pass stamps them all at full resolution. Images and text upload once, then stamp |
| **Readbacks** (`readbackAsync`) | Two 192² RGBA32F `readPixels` per layer per frame, through PBOs and a fence | GPU reductions: mean density and colour, the exposure histogram, velocity range, `hasContent`. A few hundred bytes back by `mapAsync`, a frame or more late (as today) |
| **The rest of the CPU side** | Beads, bubbles, the macro camera, `deriveStep`, liquid phase | Stays in TypeScript, reading the reduced data. Beads are drawn on the GPU (below) |
| **Chemistry** (Gray-Scott) | A CPU field depositing dye through `addDensity` | A compute field at grid resolution |
| **Composite shader** (`LiquidVisualizer.tsx`) | 1,587 lines of GLSL, 92 uniforms (91 in `uniformNames`), 12 samplers, MRT (`fragColor` + `auxOut`) | A WGSL render pipeline with two colour targets, one uniform struct, and bind groups |
| **Derive pass** | The same source with `#define DERIVE_PASS`, RGBA16F per layer | Its own compute pipeline: Sobel gradient and boundary |
| **Pack passes** | `packDye` (sqrt-encode) and `packVel` into RGBA8 | Probably gone: the composite reads the float fields directly. Keep only if the numbers want the precision trade |
| **Camera pass** (`cameraPass.ts`) | 12-tap depth-of-field disc, 16 bloom taps, ACES, grain, dither | WGSL render pass. Bloom can later become a separable compute blur |
| **Output pass** (`outputPass.ts`) | Up to 16 corner-pinned quads, `discard`, alpha blend | WGSL render pipeline with a blend state |
| **Frame probe and flash guard** | 16×16 point-sampled blit and a 1 KB readback | A compute reduction: a true average per cell, into `FlashGuard.sample`. The guard's logic is unchanged |
| **Bead mask** | 512² drawn in Canvas2D and uploaded most frames | Instanced discs drawn on the GPU; no upload |
| **Film and camera video** | Full `texImage2D` every frame | `importExternalTexture` each frame, zero copy |
| **Mark** | Uploaded once | Uploaded once (`copyExternalImageToTexture`) |
| **Canvas** | `webgl2`, `alpha:false`, `preserveDrawingBuffer:true` | `webgpu`, `alphaMode:'opaque'`, `srgb` first (P3 and HDR in H) |
| **GPU classification** | `WEBGL_debug_renderer_info` string → `classifyGpu` | `adapter.info` (vendor, architecture), plus `isFallbackAdapter` for software |
| **Losing the GPU** | `webglcontextlost`/`restored` → `dropGpu`, lay the plate again, `glEpoch` | `device.lost` → the same recovery. The dye survives through the reduced CPU state, as it does now through the CPU arrays |
| **Bench** | `readRenderer` makes a throwaway WebGL2 context | Adapter info; rungs extended to 1024² |
| **Cast** | `StageMirror` (Canvas2D `drawImage` of the opener's canvas); `CastReceiver` (a second full visualizer, so a second context); `captureStream` recorder | The same code paths reading a WebGPU canvas. Verified in P0 |

About 2,340 lines of GLSL are rewritten as WGSL, roughly 1,480 of them without comments.

## Conventions, decided up front

- **Raw WebGPU and WGSL,** no three.js. A small kit in `src/gpu/`:
  - device and adapter setup;
  - a pipeline cache;
  - bind-group helpers;
  - ping-pong textures;
  - dispatch and draw helpers;
  - a `mapAsync` readback ring;
  - a timestamp profiler;
  - a disposal registry;
  - error scopes.
- **One schema per pipeline for its uniforms.** A TypeScript writer is generated from
  the same schema as the WGSL struct. That removes the current class of bug where a
  uniform left out of `uniformNames` silently never sets.
- **Coordinates: top-left origin everywhere,** which is WebGPU's native convention.
  - The CPU conventions change once: splats, beads, the macro camera, rows of CPU data.
  - The scattered `1 - y` flips (output pass, mark, film) go.
- **Formats:**
  - Fields are `rgba16float`: storage and filterable on every WebGPU device.
  - Dye and grain use `rgba32float` only where `float32-filterable` exists (as today
    with `OES_texture_float_linear`).
  - Scalar fields are `r32float`.
  - Ping-pong everywhere, so no read-write storage is needed.
- **The uniformity rules:**
  - WGSL forbids implicit-derivative sampling in non-uniform control flow. All 53
    sampling sites in the composite become `textureSampleLevel(…, 0)`; there are no
    mipmaps, so nothing changes visually.
  - `fwidth` in `lacing()` moves before the branches that depend on texture data.
  - The beads' `dpdx/dpdy` are already under a uniform branch.
- **Determinism:** a frame counter and a seed go in every uniform struct. The CPU's
  `createNoise2D()` (seeded from `Math.random`) and the 87 `Math.random` calls in the
  visualizer move to a seeded generator. This helps PLAN.md §6, Render a song.
- **Errors:** `uncapturederror` is logged, and error scopes wrap each pass under `?debug`.
- **Initialisation is asynchronous,** because requesting the adapter and device returns
  promises. The show starts on a "starting the GPU…" frame, not synchronously inside the
  effect as now.
- **Colour:** the pipeline stays in canvas-encoded values, as today (hex colours straight
  into uniforms, ACES on encoded values), so parity is reachable. Moving to linear light
  is an H-phase question, not a port question.

## CI: the real risk

- **Today:** every job runs on `ubuntu-latest` with no GPU. qa and wall use WebGL through
  SwiftShader: about 6 fps at 384², which is why qa defaults to the **CPU solver** and
  `?dpr=0.35`.
- **After:** with the CPU solver deleted, CI must run WebGPU without a GPU.
- **P0 proves one of these:**
  1. **Linux with software WebGPU:** Chromium's SwiftShader or Vulkan adapter (flags along
     the lines of `--enable-unsafe-webgpu --enable-features=Vulkan
     --use-webgpu-adapter=swiftshader`, confirmed in the spike). Measure qa's run time at
     128² and `?dpr=0.35`.
  2. **GitHub's Apple Silicon macOS runners,** if their virtual machines expose Metal to
     Chromium. The repo is public, so they cost nothing.

  - **Not a self-hosted runner on your Mac:** on a public repo, a pull request from a fork
    can run code on it.
- **Harness changes:**
  - **qa:**
    - it starts on the smallest WebGPU rung (a new 128²) instead of the CPU;
    - `WEBGL_lose_context` becomes `device.destroy()`;
    - counting `getContext('webgl2')` calls becomes counting `requestDevice` calls;
    - the WebGL/SwiftShader console patterns in `IGNORED` are replaced.
  - **wall, bubbles, dye, shots:** canvas reads go through a new `chromaglassDebug().grabFrame()`,
    which copies the presented texture into a buffer. That replaces `preserveDrawingBuffer`,
    which WebGPU doesn't have. `?gpu=mid` keeps its meaning through the new classifier.
  - **plate, panel:** their source-text checks move from GLSL to WGSL: the bicubic
    weights, `gate()`, the `sharpenDye` gate, `MACRO_FULL_ZOOM`. The check for
    `class FluidSimulation` goes when the class does.
  - **bench:** adapter info; rungs up to 1024².
- **Transition only: `npm run parity`,** with three gates:
  1. **Composite parity:** the same frozen inputs through both compositors, ≤ 2/255 on
     99.9% of pixels.
  2. **Per-pass solver parity:** one step on fixed fields, max absolute error under a
     per-pass threshold.
  3. **Statistical parity:** `detail.mjs` measures and dye mass within ±10% over a long
     run of the simulated band. The fluid is chaotic, so pixel equality is impossible
     there.
- **The lockfile:** adding `@webgpu/types` must not go through `npm install --save` on
  this Mac, which rewrites `package-lock.json` without the other platforms' binaries.
  Edit it on Linux (CI or a container), or with npm 10.

## Working alongside the other threads

Other sessions change the shaders almost daily (#83–#91 landed today, mostly GLSL). A
long-lived rewrite branch would drown in conflicts, so:

- **The port grows on `main` behind `?renderer=webgpu`** until the cutover, then WebGL is
  deleted. The dual period is short and has an end date, and it is not a fallback.
- **From the start of P2, every GLSL change lands with its WGSL twin.** The parity
  harness fails a PR whose shaders disagree. The alternative is a declared shader freeze
  for P2–P3; pick one before starting.
- **The filters plan waits for the cutover** (it gets built once, in WGSL).

## Phases

| Phase | Contents | Gate |
|---|---|---|
| **P0 — Spike** (about a week) | <ul><li>CI feasibility, options 1 and 2 above</li><li>MacCormack advection, the pressure Jacobi and a minimal composite in WGSL, timed with timestamps on the M4 against today's WebGL</li><li>`drawImage`, `captureStream` and `StageMirror` reading a WebGPU canvas</li><li>A smoke test in Safari 26 and Firefox on Windows</li></ul> | A CI path that runs qa in under 45 minutes. No reading of a WebGPU canvas is blocked. The solver is at least as fast as WebGL on the M4 |
| **P1 — Kit** | <ul><li>`src/gpu/`</li><li>Asynchronous start-up</li><li>`?renderer=webgpu`</li><li>The "needs WebGPU" screen (behind the flag)</li><li>`@webgpu/types` (lockfile caveat above)</li><li>Adapter-based classification</li></ul> | The app starts under the flag and shows a black plate at 60 fps |
| **P2 — Solver** | <ul><li>All programs as compute, in step order</li><li>GPU splats and full-resolution image and text pours (replacing the L² deltas)</li><li>Reductions replacing `readbackAsync`'s consumers</li><li>Chemistry as compute</li><li>Drain</li></ul> | Per-pass and statistical parity, `npm run parity` |
| **P3 — Compositor** | <ul><li>The frame loop split from the WebGL renderer, so the app can drive either engine</li><li>The solver, the splats and the measurements wired to the app under the flag</li><li>The composite as WGSL: lumia, gel, kaleidoscope, photograph mode, LED, blends, lacing, beads, bubbles, film, mark, macro detail, dither</li><li>The derive pass</li><li>The camera pass</li><li>The output pass</li><li>Beads drawn on the GPU</li><li>External video textures</li></ul> | Composite parity; `liquids`, `dye`, `bubbles`, `wall` and `shots` pass under the flag |
| **P4 — Safety and operations** | <ul><li>The flash probe as a true-average compute reduction</li><li>The governor on timestamp queries</li><li>Recovery from device loss</li><li>Bench</li><li>Engine label, and the `RunLocallyCard` text</li></ul> | `wall`'s flash-guard checks pass; recovery is proved by a `device.destroy()` test |
| **P5 — Harnesses and CI** | <ul><li>Every harness on WebGPU</li><li>CI flags from P0</li><li>Thresholds re-baselined</li><li>`qa`'s CPU default removed</li></ul> | All checks green with `?renderer=webgpu` as the harness default |
| **P6 — Cutover** | WebGPU becomes the default, and the "needs WebGPU" screen goes live | A week of the live site on WebGPU with no new errors in the console reports |
| **P7 — Delete** | <ul><li>The WebGL code, all GLSL, the CPU solver's stepping and the `cpu` rung</li><li>The `software` GPU class, `?sim=cpu`, `?filter=bspline` and `?derived=0`</li><li>The flag itself</li><li>The appliance files (below)</li><li>README, docs and the CHANGELOG</li></ul> | `git grep -i webgl` finds nothing except the CHANGELOG. **Done, bar the CPU solver's stepping** — and the `software` class was kept on purpose, for the reason in P7's results |
| **H0 — Time the step** | Split the solver's one compute pass into labelled passes behind a diagnostic flag | `chromaglassDebug().webgpu.solver` names where a step's 9 ms goes, instead of one number for all of it |
| **H — Spend the headroom** | See below, and the order in [`roadmap.md`](roadmap.md) | Each item has its own measure |

**Time:** P0–P7 is several weeks of focused work. P2 and P3 are the bulk, and the
composite shader alone is about a third of it. The pace depends mostly on the dual-edit
overhead from the other threads.

## H — Spending the headroom

In order of what they do for the picture:

*The order these are listed in is what they do for the picture. The order to **build**
them in is in [`roadmap.md`](roadmap.md), and it is not the same: the measurements taken
during the port put H2 ahead of H1, and fold H3 into it as its test.*

0. **Time the step (H0).** One compute pass carries one timestamp pair, so the 9.18 ms
   above is a single number covering about 101 dispatches. Split it into labelled passes
   behind a diagnostic flag.
   - **Measure:** the step's own profiler names its stages. It decides H1 against H2,
     which the present evidence orders two different ways depending on how it is read.
1. **Dye carried by particles (H1).** Millions of dye particles advected by the velocity
   field and splatted each frame, alongside or instead of the dye grid.
   - **Measure:** `npm run detail`. The target is to close most of PLAN.md's 3–5× gap at
     4–8 px.
2. **A better pressure solver (H2).** Red-black Gauss-Seidel or multigrid, in place of 24
   Jacobi passes. The result is less residual divergence, and livelier small swirls —
   and, if cost tracks dispatch count, the largest single saving available: 48 of a
   step's ~101 dispatches are pressure Jacobi, 24 in each of the two projections.
3. **A 1024² rung (H3)** on strong GPUs, chosen by the timestamp-driven governor. Two
   lines, and the governor that chooses it already exists — so this is H2's gate rather
   than a piece of work: today an M4 holds 1024² at 22 fps, and a rung the governor
   steps straight back down from is the thing P6 fixed.
4. **Display-P3 and HDR output (H4)** on screens that have them. Projectors and social
   video stay in standard range.
5. **The filters plan (H5),** built on the post chain in WGSL. Its per-effect GPU costs
   come from the timestamp queries, which is what the Cymatist-style cost badges need.
6. **Air as a field (H6),** part A of [the bubbles plan](bubbles-plan.md): the bubbles
   stop shading over the dye and start displacing it.
7. **The second phase (H7),** part B of the same: an immiscible heavy liquid with surface
   tension and a magnet — the ferrofluid look, at macro and plate scale.
8. **More bottles (H8),** part C, once the liquid field is on the GPU.

## The Pi box: what goes

- `docs/appliance.md`
- `server/chromaglass.service` and `server/chromaglass-kiosk.service`
- README: "Run it as a box", and its lines in the file tree
- `videocore` in `platform.ts`'s weak-GPU pattern (the classifier is replaced anyway)
- `?kiosk=1` auto-wake (`App.tsx`): keep it only if a venue mini-PC setup is still
  wanted, otherwise delete

**Kept,** because they serve the laptop's LAN show and not the box: the `native` tier,
`remote-server.js` and `artnet.js`.

## Which browsers

With no WebGL, the hosted site needs WebGPU. Roughly, as of 2026:
- Chrome and Edge on the desktop;
- Chrome on recent Android phones;
- Safari 26 (macOS 26, iOS 26);
- Firefox on Windows, with Mac and Linux following.

What loses out:
- older Safari and older phones;
- Linux Firefox;
- smart-TV browsers used as network displays. That weakens the network-display feature;
  the HDMI projector window is unaffected.

Confirm the actual reach in P0 against the site's analytics, once analytics exist.

## Risks

| Risk | Mitigation |
|---|---|
| Software WebGPU in CI is too slow or doesn't run | The P0 gate; macOS runners as the fallback; smaller harness grids |
| Other threads' shader churn during P2–P3 | The dual-edit rule plus the parity harness, or a declared freeze |
| Differences between Safari and Firefox WebGPU (limits, formats, `float32-filterable` absent) | Query the limits at start-up; `rgba16float` for everything that must work; a Safari and Firefox smoke test in P0 and before cutover |
| Mobile GPU limits (storage texture sizes, workgroup memory) | Grid rungs gated on `device.limits`; the governor starts low |
| The flash guard is safety-critical | Ported and proved in P4, before the cutover. Nothing ships without `wall` passing |
| Visitors without WebGPU get nothing | A clear screen with browser links; the phone remote still works; known reach from P0 |
| The async start changes the start-up order (the plate is laid before the device exists) | The start frame; `layPlate` waits for the device |
| Canvas reads (recorder, projector mirror, harnesses) behave differently | P0 proves `captureStream` and `drawImage`; the harnesses use `grabFrame()` |
