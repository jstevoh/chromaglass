# 1. Sharp liquid, and pigment in it: what shipped

How §1's shipped items were found, built and measured. The open work is in
[`docs/plan/01-sharp-liquid.md`](../plan/01-sharp-liquid.md), where each keeps a one-line stub naming
its id here. The stories moved out of the plan in four passes and stand under them in
that order (what each pass took is in [README.md](README.md)).

## First pass (moved 2026-10-04)

### 1. Sharp liquid, and pigment in it

`src/gpu/fluid.ts`, `src/gpu/wgsl/fluid.ts`, `src/components/LiquidVisualizer.tsx`,
`src/types.ts` — `lib/gpuFluid.ts` was the WebGL solver and went with it in P7

- **Interface sharpening** (`sharpness`, 0–1). A counter-diffusion term along the dye
  gradient, applied each step after advection, that restores the step at a boundary
  instead of letting it smear. This is how multiphase solvers keep two fluids apart.
  Clamped so it can only undo diffusion, never amplify beyond the local range of the
  four cells it samples, which is what stops checkerboarding.
- **Granulation** (`granulation`, `grainScale`). Sub-grid pigment texture: a noise
  field sampled in *advected* coordinates, so the speckle travels with the dye
  instead of sitting on the screen, modulated by dye thickness and by how slowly the
  cell is moving (pigment settles where the flow is slack).

Both landed in the GPU and CPU solvers, which is what "so the two engines still agree"
meant while there were two. There is one now. Shipped as two PRs rather than one, so the
first improvement reached the projector sooner: sharpening first, granulation second.
Both are in.

**Sharpening is retired, on the sixth look.** The test this plan called for has been run
at the grid the show actually falls to. At 256², where a solver cell is nearly three
pixels and the pass should matter most, switching it on and off on one plate moves the
10-90 % edge width by less than the plate's own drift — −1.25 to +1.33 px at 0.5, −0.3 px
at 1.0. Across pages it narrows edges by a pixel in two captures of five and not at the
same frame count in either set, and at 384° the sign flips. What it does add over hundreds
of frames is pale terraces and torn lips, which is the old fault arriving slowly on a
coarse grid. It is off in the defaults and in every preset; the control was kept because
on the CPU solver at 192² it measurably steepened (mean gradient 0.091 → 0.104), and that
was the engine a weak machine ran — a reason that went when the CPU solver did (P7), so
the control is now a knob with no measured case for it. Batch 1's other half, granulation, stands: it now works
from the first frame, and its default of 0.5 at grain scale 110 is the measured choice.

**Gate:** typical local contrast ≥ 3.0 on the Fillmore plate at the preset's default,
with no more than 15 % frame-time cost at 512², and no oscillation over a 100 s settle.
Met: 3.3, from 2.7 with granulation off and 0.8 as first measured. That first figure was
taken across the whole frame, most of which is the black surround, and it dragged every
statistic toward zero; the measurement is now a crop inside the plate, which is what the
reference frames are. Structure at 4 px was in this gate and has moved to batch 2: a
speckle is not mid-scale structure, and lacing and drops are what build it. **Risk:** sharpening concentrates dye, so the budget
regulator will bite sooner; recheck every preset's `dyeBudget` in the same PR.
**Fallback:** the settings default to 0, so a bad look is one slider away from the
current behaviour.

## Third pass (moved 2026-10-29, 19m)

### 1. Sharp liquid, and pigment in it

#### 1a. The grain at the dye's edge made the plate look digital (shipped)

Reported 2026-10-04 on the laptop's web app: "quite a few of the looks seem very
pixelated ... less like liquids", and "it's always been this way to a point. It just
looks very digital." `npm run pixels` (new, `pixels.yml` on the Mac, or a PR labelled
`pixels`) photographed every look at 1440×900 on a Retina panel: every look's dye edges
were a ragged fringe of single lit and dark flecks, at the governed rung and the top one.
The cause was granulation (on at 0.5 in every look) scaling the opacity *before* the gooey
contrast curve, which is steepest at the edge's half opacity, so every grain there became
fully on or off. **Shipped:** the grain is drawn after the edge, as optical depth
(`grainedDepth`, wgsl/plate.ts). `npm run grainedge`, seven looks in the lab: flecks (edge pixels
moved over 40 levels in a channel) 6–35% before, 0–0.61% after, every look held under 2%;
the bodies keep a grain that is a texture, weaker than before inside thick pools, where
the dye already stops nearly all the light. The soap film's colour reads the liquid's thickness from before the
grain (Sunny Side Up 7.1% → 0.25%, Soap Film 3.0% → 0.2% on the edge check). The owner's eyes on a laptop: `docs/judging.md` §40.

Found with it, open:
