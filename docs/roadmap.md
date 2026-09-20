# Roadmap

*What is being built, in what order, and why that order. Updated 2026-09-20.*

`PLAN.md` is the running order for the plate itself — what the liquid does and what the
desk does with it. This page is the layer above it: the engine work those batches now
depend on, and where each of the longer plans sits.

Everything here is the **engine**: the renderer, the solver and what they make possible.
Product work — accounts, the hosted service, the recording tool — is planned outside
this repo.

## Where things stand

| | Plan | State |
|---|---|---|
| **The post chain** | [`filters-plan.md`](filters-plan.md) F0 | **Shipped** (#92): the scene target, the finish pass, the frame-history ring and the true-average flash probe |
| **WebGPU** | [`webgpu-plan.md`](webgpu-plan.md) | **Done.** P0–P7: the app runs on WebGPU and nothing else does. The WebGL renderer, the GLSL and the parity harnesses are deleted; what remains of the port is the CPU solver's stepping, which is unreachable and waiting on its own surgery |
| **The effects** | [`filters-plan.md`](filters-plan.md) F1–F9 | **Ready to build.** The cutover they were waiting for has landed and the post chain is under them; each is written once, in WGSL, as H5 below |
| **Air, ferrofluid, bottles** | [`bubbles-plan.md`](bubbles-plan.md) | **Ready to build**, as H6–H8 below |
| **The plate's own batches** | `PLAN.md` §5, §6 | §6 (Render a song) wants the renderer settled, which it now is; the rest of §5 is independent |

**The shader freeze is over.** It ran from 2026-09-19 until the cutover, and it did its
job: nothing was written twice. There is one shading language in the tree now — WGSL, in
`src/gpu/wgsl/` — so a shader fix is a shader fix again.

## The order, and why

1. ~~**Finish the port**~~ ([`webgpu-plan.md`](webgpu-plan.md) P0–P7) — **done 2026-09-20.**
   Safety and operations, the harnesses and CI, the cutover, then WebGL2, the CPU solver
   and the appliance deleted.
   *Why it was first:* everything below is cheaper or only possible once it is done, and
   two renderers is the one state worth leaving quickly. What is left of it is the CPU
   solver's stepping — about a thousand unreachable lines, waiting on its own surgery.
2. **Spend the headroom, in this order:**
   - ~~**H0 · Time the solver's step, pass by pass.**~~ **Done 2026-09-20.** `?stages`
     gives each stage its own pass and its own timestamps, `npm run stages` reads them
     back, and the splitting costs 2%. It was worth asking: both readings below were
     wrong, in opposite directions. The table is in
     [`webgpu-plan.md`](webgpu-plan.md) — the short of it is that **cost does not track
     dispatch count** (a pressure Jacobi dispatch is 0.049 ms; `forcesB`, one dispatch,
     is 0.808), the two projections are **28.8%** of a step rather than 48% or 5%, and
     **iterative solves as a class are 64.5%**.
   - **H2 · A better solver for all five iterations, not just the pressure.** Red-black
     or multigrid in place of 24 Jacobi passes — and the same treatment for dye
     diffusion (14.2%), the squeeze film (11.6%) and viscosity (10.2%), which between
     them cost more than the projections do. Less residual divergence, livelier small
     swirls, and about two thirds of a step to aim at.
     *Gate:* 1024² holds 30 fps on the M4 that manages 22 today. That gate is **H3** —
     a 1024² rung on strong machines — which is two lines in `qualityLadder` and a
     governor that already judges by real GPU timings, so it is this item's test rather
     than an item of its own.
   - **H2a · `forcesB` is one kernel too many things at once.** It is 8.6% of a step in
     a single dispatch — 0.808 ms against 0.049 for a pressure Jacobi. Its floor, with
     every force switched off, is 0.368; the six forces together add 0.44; and
     **switching off any one of them on its own changes nothing measurable.** That is
     not a branch being expensive, it is the compiled kernel's register footprint
     holding occupancy down whatever it executes at runtime. The fix is to split it, or
     to shrink the worst path — not to micro-optimise a branch, which is what measuring
     one at a time would have suggested. Sized but not started.
   - **H1 · Dye carried by particles.** The measured gap in `PLAN.md` is that filmed
     liquid holds three to five times more structure at 4–8 px than ours. Particles
     don't smear, which is the fix. Takes density estimation with it, so sparse regions
     don't come out noisy. The largest thing in this list, and the one that changes what
     people see.
   - **H4 · Wide colour, and HDR** where the screen has it.
   - **H5 · The effects** ([`filters-plan.md`](filters-plan.md) F1–F9): film first, then
     the feedback camera and its coupled loops, the prism and kick ripple, letters as
     windows, iris and wipes, slit-scan, colour looks. Film needs nothing that isn't
     already built — the history ring and its self-test shipped with F0 — so it and H6
     are the two places to reach when what's wanted is something visible this week
     rather than a faster frame.
   - **H6 · Air as a field** ([`bubbles-plan.md`](bubbles-plan.md) A). Small, and it
     fixes something visibly wrong: bubbles are shading over the dye rather than holes
     in it.
   - **H7 · The second phase** ([`bubbles-plan.md`](bubbles-plan.md) B): a heavy,
     immiscible liquid with surface tension and a magnet — ferrofluid, at both macro and
     plate scale. Absorbs the oil-bead mask.
   - **H8 · More bottles** ([`bubbles-plan.md`](bubbles-plan.md) C): latex, oil paint,
     clear medium, glycol first; then fizz, salt, slime, cornstarch, bleach. Needs the
     liquid field moved to the GPU.
3. **A pass over the desk,** once the headroom is real: the settings, the presets and the
   Songs sequencer re-tuned for what is now cheap — defaults that assumed a 384² grid and
   a 24-pass solver, and ranges that were capped by the old cost.
4. **`PLAN.md` §6, Render a song,** once the renderer is settled: seeded randomness,
   offline audio analysis, and frames encoded rather than captured.

## Why this order and not another

- **A measurement before the two items that argued about it** — done, and it was worth
  the afternoon. Two readings of the old evidence put H2 at 5% of a frame and at a third
  of it; the answer is 28.8% of a step for the projections, and 64.5% for the five
  iterative solves together. Neither guess would have aimed the work at the right four
  stages. The general form of the mistake is worth keeping: **the step is bound by what
  each kernel does per pixel, not by how many kernels there are.**
- **The pressure solver before the particles,** because particles *add* work to a step
  that is already 94% of the frame's GPU time at the top rung (17.8 ms a step, 1.75
  steps a frame, against 2.1 ms of drawing). Landing H1 on an uncheapened step buys structure at
  4–8 px and then hands it back when the governor drops a rung to pay for it. H2 makes
  the room H1 spends. This reverses the order these two were written in, on the
  measurements taken during the port.
- **1024² as a test, not a task,** because the rung itself is two lines. Today an M4
  holds it at 22 fps, which is not a show — so shipping the rung first would ship a rung
  the governor immediately steps back down from, which is the thing P6 fixed. It becomes
  real when something makes it affordable, so it belongs to whatever that is.
- **The port before the effects,** because an effect written in GLSL now is an effect
  written twice. *(Done: the port landed 2026-09-20.)*
- **The plate before the effects,** because the thing people see first is the plate, and
  the plate's own detail is the oldest measured shortfall in `PLAN.md`.
- **Air before the second phase,** because both exclude dye from an area and pile it at a
  rim, and air is the simpler of the two. The second phase inherits that machinery.
- **The bottles last,** because each one is cheap once the fields are on the GPU, and
  because they are the easiest thing to add too many of.

## How to read the plans

Each plan carries its own gates — what has to be true before the next step starts — and
its own checks. Where a plan and this page disagree, the plan is right about detail and
this page is right about order.

- [`webgpu-plan.md`](webgpu-plan.md) — the port, phase by phase, with the P0–P7 results
  and the measurements that decided them, including the frame budget H0 and H2 argue
  over.
- [`filters-plan.md`](filters-plan.md) — nine effects and the tools that make them
  playable, with the post chain they share.
- [`bubbles-plan.md`](bubbles-plan.md) — air, the second liquid, and the bottles.
- `PLAN.md` — the plate itself: the batches, what is not being done, and the operating
  rules every new setting follows.
