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
| **The effects** | [`filters-plan.md`](filters-plan.md) F1–F9 | Waiting for the cutover, so each is written once, in WGSL |
| **Air, ferrofluid, bottles** | [`bubbles-plan.md`](bubbles-plan.md) | Waiting for the same, then H6–H8 below |
| **The plate's own batches** | `PLAN.md` §5, §6 | §6 (Render a song) wants the new renderer; the rest of §5 is independent |

**The GLSL is frozen** until the cutover. A fix that must land ports to WGSL in the same
pull request. Everything outside the shaders — the desk, audio, tooling, presets —
carries on as normal.

## The order, and why

1. **Finish the port** ([`webgpu-plan.md`](webgpu-plan.md) P4–P7): safety and operations,
   the harnesses and CI, the cutover, then delete WebGL2, the CPU solver and the
   appliance.
   *Why first:* everything below is cheaper or only possible once it is done, and two
   renderers is the one state worth leaving quickly.
2. **Spend the headroom, in this order:**
   - **H1 · Dye carried by particles.** The measured gap in `PLAN.md` is that filmed
     liquid holds three to five times more structure at 4–8 px than ours. Particles
     don't smear, which is the fix. Takes density estimation with it, so sparse regions
     don't come out noisy.
   - **H2 · A better pressure solver.** Red-black or multigrid in place of 24 Jacobi
     passes: less residual divergence, livelier small swirls.
   - **H3 · A 1024² rung** on strong machines, chosen by real GPU timings.
   - **H4 · Wide colour, and HDR** where the screen has it.
   - **H5 · The effects** ([`filters-plan.md`](filters-plan.md) F1–F9): film first, then
     the feedback camera and its coupled loops, the prism and kick ripple, letters as
     windows, iris and wipes, slit-scan, colour looks.
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

- **The port before the effects,** because an effect written in GLSL now is an effect
  written twice.
- **Particles before the effects,** because the thing people see first is the plate, and
  the plate's own detail is the oldest measured shortfall in `PLAN.md`.
- **Air before the second phase,** because both exclude dye from an area and pile it at a
  rim, and air is the simpler of the two. The second phase inherits that machinery.
- **The bottles last,** because each one is cheap once the fields are on the GPU, and
  because they are the easiest thing to add too many of.

## How to read the plans

Each plan carries its own gates — what has to be true before the next step starts — and
its own checks. Where a plan and this page disagree, the plan is right about detail and
this page is right about order.

- [`webgpu-plan.md`](webgpu-plan.md) — the port, phase by phase, with the P0–P3 results
  and the measurements that decided them.
- [`filters-plan.md`](filters-plan.md) — nine effects and the tools that make them
  playable, with the post chain they share.
- [`bubbles-plan.md`](bubbles-plan.md) — air, the second liquid, and the bottles.
- `PLAN.md` — the plate itself: the batches, what is not being done, and the operating
  rules every new setting follows.
