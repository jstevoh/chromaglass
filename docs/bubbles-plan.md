# Plan: air and a second liquid

*Written 2026-09-20 against `origin/main` at `ad81b4f` (#95). Nothing here is built.
[The roadmap](roadmap.md) says where this sits.*

Two references, both ferrofluid:

- **Chemical Bouillon, "Ferrofluid — Magnetic pattern I"** (youtube.com/watch?v=Gk03iobaMgQ):
  black fluid on white, forming labyrinths of worm-shaped channels (0:12, 1:00–1:24),
  spikes (1:35–1:48), chains of elongated droplets (2:12–2:36) and lattices of dots.
- **Kamil Czapiga, "Liquid Art on a Macro Level"** (youtube.com/watch?v=tZMKIxu4rnY):
  ferrofluid mixed with dye on a microscope slide, 10–15 mm across. Black beads packed
  into a lattice, each with a hard specular dot, beside a yellow-green labyrinth, with
  cyan fringing along every boundary.

Neither is a bubble. Both are a **second liquid** that will not mix with the first. That
is why the shapes read as part of the picture: the dark domains *are* liquid, so they
deform, merge, split, pile the other liquid at their edges, and arrange themselves.

So this plan has three parts:
- **A. Air becomes a field,** which fixes today's bubbles.
- **B. A second liquid phase,** which is what the references actually show.
- **C. More bottles,** because most of what makes fluid art interesting is one liquid
  meeting another that behaves differently.

Both belong to the WebGPU work (`docs/webgpu-plan.md`): the solver is already on WebGPU
(P2) and the composite is translated (P3). **The GLSL is frozen**, so none of this is
written twice: it lands in WGSL.

## Why today's bubbles read as stickers

From the code as it stands:

1. **The dye is never removed from under a bubble.** Each bubble applies a standing
   squeeze — `applySquish(x, y, r*0.85, 0.0035)` per step, about the strength of a light
   press — which pumps dye outward slowly. Dye stays under the bubble meanwhile.
2. **The shader then paints the dye's own colour back in.** In `wgsl/plate.ts` the
   bubble block samples the plate through a small lens offset and mixes it at
   `inside * 0.45 * play`, then brightens. Air between two glass plates has no dye under
   it: the eye should see the lamp through a clear gap, not a magnified version of the
   dye that should have been pushed aside.
3. **Nothing piles at the rim.** In every reference frame the displaced liquid gathers at
   the domain's edge as a bright ring. Ours draws a membrane in the shader, so the ring
   doesn't wobble, stretch or lag the way a real pile of dye does.
4. **There are at most 40, and in practice 3–17.** They are uniform arrays
   (`u_bubbles[40]`, `u_bubbleShape[40]`) and every pixel loops over all of them. The
   references show dozens of packed beads. A comment in `LiquidVisualizer.tsx` records
   the earlier judgement that forty "reads as foam on a shower door" — which is true
   *while they are stickers*: forty holes in the dye would not.
5. **They barely change the flow.** With the squeeze that weak, the dye slides past a
   bubble instead of around it, and neighbours only drift together gently. Nothing
   produces the packed lattices or the chains.

The motion model itself is good and worth keeping: `bubbles.ts` already stretches along
the drag, wobbles, clusters, merges, splits, and pops into a spray.

## A. Air becomes a field

**The idea:** air stops being a list of sprites drawn over the plate and becomes a
quantity the solver carries, exactly like dye. Everything else follows from that.

**In the solver** (`src/gpu/fluid.ts`, `wgsl/fluid.ts`):
- **An air field** `a(x, y)` in 0–1, advected by the same velocity as the dye.
- **Exclusion, conserving mass.** Where air is, dye is not: each step multiplies dye by
  `1 − a` inside the footprint and adds what it removed to the rim ring. The multiply is
  free — the solver already carries a multiplicative delta (`mul`) for exactly this kind
  of change — and the rim add is a splat, which P2 already made cheap.
- **A divergence source at the rim,** so the surrounding liquid is actually pushed
  outward as the air spreads, and pulled back in when it shrinks or pops. That is what
  makes the field flow *around* it.
- **Surface tension on the air boundary** (curvature × tension), which is what makes small
  ones round, big ones wobble, and touching ones neck together.
- **The particles stay as bookkeeping.** `bubbles.ts` keeps its list, stretch, wobble,
  merge, split and pop, and each step stamps its particles into the air field with one
  dispatch (the same splat-record path P2 built for pours). Hundreds become affordable;
  the 40-cap and the per-pixel loop both go.

**In the composite** (`wgsl/plate.ts`):
- **Read the air field instead of 40 uniforms.** The metaball loop is deleted.
- **Inside a bubble is the lamp, not the dye.** The interior shows the light through a
  clear gap, tinted only by what refraction bends in from the rim.
- **The rim comes from the dye that was pushed there,** so the bright ring is real dye
  and moves with the liquid. The shader's job shrinks to the optics on top: the dark side
  toward the lamp, the caustic arc away from it, the specular dot, and the thin-film
  colour that the references show as cyan fringing.
- **Everything else it already does well is kept:** the second lamp, iridescence, and the
  aux normal and bubble channels the camera pass reads.

**New settings** (look keys, defaults matching today's look):
- `bubbles` keeps its meaning (how much air arrives).
- `bubbleDensity`: how many, from a few to a packed raft, now that packing is possible.
- `bubbleTension`: round and separate, or soft and necking.
- `bubbleClear`: how completely the dye is excluded — 1 is physical; lower keeps some of
  today's look for presets that want it.

**What the field turned out to need** (measured 2026-09-21, `claude/h6-air-field`):

- **`r16float`, not `r32float`.** The splat blends (`max`, so two overlapping bubbles
  do not make a cell twice as empty) and **WebGPU does not blend 32-bit float
  targets** — the pipeline is rejected outright and the field is silently empty. Half
  floats carry a 0-to-1 coverage to about three decimal places, finer than the dye
  they multiply.
- **A render pass, not a compute pass over cells.** The cost is the area the discs
  cover rather than cells times bubbles, which is the whole reason hundreds become
  possible. It has to be encoded *before* any compute pass opens, because a compute
  pass cannot be interrupted to draw into a texture it is sampling.
- **The splat must clear the field every frame**, by its load op, even with nothing
  live — otherwise a popped bubble leaves its hole behind.
- **`smoothstep` needs its low edge first.** Backwards it is undefined in WGSL and
  returns near zero, which produces a field of discs in exactly the right places
  peaking at 0.01.
- **A readback must match the format.** Two-byte halves read as four-byte floats give
  a plausible field in the wrong place, and every conclusion drawn from it is about
  the reader.

**Four mechanisms tried for the interior, all measured, none sufficient.**
The number below is the dye left under a bubble as a fraction of the liquid
around it; a hole should be near zero.

| | result |
|---|---|
| Flow between neighbours by the difference in air | **0.70** — empties the rim, cannot touch the middle |
| The same, down a *blurred* air field so the middle has a slope | **0.84**, worse: the hill is shallow, adjacent cells barely differ, almost nothing flows |
| A velocity down the air gradient | **no effect at all** (see below) |
| A source in the divergence the projection solves — the plan's own design | **0.67**, and **0.59** given six times as long |

A local, conserving exchange is diffusion, and diffusion is far too slow to
clear a bubble thirteen cells across in the time one exists. The transport has
to be advection — a velocity field the dye rides — which is the divergence
source, below.

**The divergence source is built and is not enough as tuned.** It is in
`divergence`, as two terms: the rate the air is arriving (a growing bubble
displaces liquid, a popping one lets it back) and a standing source inside
every bubble with the plate's air fraction subtracted so it averages to zero —
without which the Neumann problem has no solution, the condition
`pressureSelfTest` exists to protect.

It reaches the flow: a hundred times the strength moves the interior from 0.67
to 0.62, and six times the settling time moves it to 0.59. Both are real and
both are small, and 0.59 is an asymptote rather than a trend toward zero. So
something is holding it back, and the three candidates not yet ruled out are:
the pressure solve not converging on this source in twelve sweeps; the dye's
advection reading a velocity from before the projection that produced it; and
the conserving exchange carrying dye back *into* the bubble as fast as the flow
carries it out, since that exchange is symmetric and knows nothing about which
way the liquid is going.

**A velocity will not do.**
Conserving the dye by flowing it between cells — from more air to less, in
proportion to the difference — works at the rim and cannot touch the middle of
a bubble, where the air is uniform and there is no difference to flow down.
Measured: the interior thins to about 0.7 of its surroundings and stops.

Adding a velocity down the air gradient instead **does not work at all**, and
the reason is structural: a gradient field is exactly what the pressure
projection exists to remove, so the next projection cancels it. The source has
to go into the divergence the projection solves. That is also what makes the
liquid flow *around* a bubble rather than through it, so the two bullets above
are one piece of work.

**How to know it works.** `npm run bubbles` places one bubble somewhere off-centre in
both axes and asks the field **where** the air is — near the chosen position, and *not*
near its mirror, which is what a y-flipped field looks like — with a control that
clears the plate and requires the field to be empty. All three faults above passed
every check that only asked whether air existed; none of them survived the question
"where".

**Checks** (`npm run fx`-style, with the parity harness's approach):
- Dye under a settled bubble falls below 2% of its surroundings within a second.
- Total dye mass changes by less than 0.5% while a bubble forms and pops.
- The rim ring is measurably brighter than the dye a radius away.
- Twelve bubbles blown into a small area settle into a packed raft rather than a pile.
- A bubble crossing a shear line stretches and splits, as it does today.

## B. A second liquid phase

**The idea:** a second, immiscible liquid on the plate, dark and heavy, with its own
surface tension, that the flow carries and that a "magnet" can pull. This is what makes
the references' shapes: labyrinths, spikes, chains, lattices.

**Where it comes from:** the app already has immiscibility and fingering in the solver,
and a reaction mode; what it lacks is a phase that keeps a sharp boundary while it moves.

### The reference's own conditions

Kamil Czapiga describes the macro piece exactly:

> "No CGI, just ferrofluid on a microscope slide captured with macro lens, real size
> 10-15mm. What you see in the video is reaction of ferrofluid, which is a magnetic
> liquid, mixed with a dye and controlled by a magnet."

Four facts in one sentence, and each one sets something here:

- **10–15 mm across, through a macro lens.** The whole picture is a centimetre wide.
  Those beads are under a millimetre. So this look is **authored at macro scale**: the
  closeup camera in, domains sized in hundreds of microns rather than plate-wide blobs,
  and the camera pass's shallow depth of field doing what a macro lens does. The same
  physics played across a whole projected dish reads as mud. A small field of view is
  also why the specular dots are tiny and hard, and why a slight tilt of the plate shows
  as a focus gradient across the frame.
- **A microscope slide.** A thin film on flat glass, not a deep dish — which is the
  squeeze-film plate the solver already models. The dark phase is effectively
  two-dimensional, so **its opacity should come from its thickness**: thin edges read
  brown and translucent, thick middles read black. A flat black domain is the thing that
  would look like CGI.
- **Ferrofluid mixed with a dye.** They are not two separate pictures: the dye is the
  carrier, and the magnetic phase moves through it. So the dark phase **displaces dye
  exactly as part A's air does**, reusing that machinery — and the labyrinth channels
  between the domains are dye, lit from below, with thin-film colour where the film
  thins at a boundary. That cyan fringing in the frames is interference, which the app
  already has as `thinFilm` and `iridescence`.
- **Controlled by a magnet,** by hand, under the slide. That is a specific control, not
  a general "force field" — see below.

**In the solver:**
- **A phase field** `p(x, y)` in −1…1, advected by the flow, with a Cahn-Hilliard-style
  term: the phase separates rather than blurring, so a boundary stays sharp for minutes
  instead of diffusing away in a second. This is also the honest fix for PLAN.md's
  measured detail gap, in the places where the plate should hold an edge.
- **Surface tension** on the boundary, which sets the width of a finger and the size a
  droplet keeps.
- **The magnet, modelled as a magnet.** A hand holds it under the glass, so the controls
  are the ones a hand has: **where it is** (x, y), **how far below the slide** (height),
  **how strong**, and **which way up** (polarity). The pull on the phase follows the
  field's own steepness, and a magnet's field falls away sharply with distance, so
  height is the control that matters most: close gives a hard, narrow pull, and lifting
  it away spreads the pull out and weakens it. One magnet, moved, is what the reference
  is.
- **Why the shapes appear on their own.** With surface tension on one side and the
  magnetic pull on the other, the patterns are not drawn, they fall out:
  - **close and strong** → the surface can't hold and breaks into **spikes**, at a
    spacing set by the tension and the film's weight;
  - **spread and moderate** → the phase can't all reach the middle, so it folds into a
    **labyrinth**;
  - **weak, with high tension** → it beads into a **lattice**, each bead repelling its
    neighbours;
  - **moved across** → the domains chase it and leave **chains** behind.
- **Density difference,** so the heavy phase sinks against the plate rock and the tilt.

**What you can then do with it:**
- **The magnet is the instrument.** A hand under the glass is one point with a height,
  so the phone pad drives x and y, and pressure or a second finger drives height. That
  is the whole performance in the reference.
- **Kick pulls the magnet up to the glass:** spikes on the beat, falling back between
  them. Bass on height, treble on tension.
- **Lattice, labyrinth, spikes** are three settings of the same two numbers (height and
  tension), so a sequence can move between them over a song rather than cutting.
- **Patchable, like everything else:** position, height, strength and polarity are
  ordinary controls for the patch bay and the sequencer.

**Drawing it:**
- **Opacity from thickness,** so edges are brown and translucent and the middles are
  black. This is the difference between a slide of real ferrofluid and a black blob.
- **A bright rim** where light bends through the edge, and the hard specular dot the
  macro reference shows on every bead.
- **Thin-film colour along the boundary,** which is the cyan fringing in the frames, from
  the `thinFilm` and `iridescence` the app already has.
- **Lit from below through the glass,** the photograph mode's lit ground rather than the
  projected-on-black look, because that is what a slide on a light table is.
- **Two lightings, because the plate has two.** On a slide lit from below (photograph
  mode) the domains are dark bodies with specular dots, as in the reference. In the
  projected look, an opaque liquid *blocks the lamp*, so the same domains become black
  silhouettes with light leaking through their thin edges. Both are the same field; only
  the shading differs, and the second is the one a projectionist would actually see.

### It works at both scales

**Decided: this is not a macro-only look.** The reference happens to be 10–15 mm wide,
but the shapes belong on the wall too — a black domain bursting into spikes on a kick is
a stronger projected image than a macro curiosity, and it reads at phone size, which the
fine work does not.

**What scale actually is here.** In real ferrofluid the size of a spike is set by the
liquid's surface tension against its weight, which is why the reference's spikes are
about a millimetre and why the lens is close. We are not simulating millimetres: those
constants are ours to choose. So domain size becomes **a control, not a consequence**:

- **`phaseScale`** — how big a domain is as a fraction of the plate — sets the tension
  and the magnetic falloff together, so one slider moves the look from **beads** (many,
  tiny) through **cells** to **hands** (a few, large).
- **Macro end:** dozens of sub-plate beads, thin rims, fine thin-film fringes, shallow
  depth of field. This is the reference.
- **Plate end:** a handful of hand-sized domains, thick rims, slow folding, black
  silhouettes on the projection. This is the one that goes on a wall.

**What changes with scale, and has to be tuned per end:**
- **Count and speed.** Big structures move slowly. The force and viscosity numbers are
  chosen per scale so a spike still rises within a beat — the response stays musical
  rather than following the physics' own clock.
- **Rim width.** The bright edge is a fixed fraction of a domain, not a fixed number of
  pixels, or it disappears at one end and swamps the other.
- **Grid.** The plate end is cheap, because domains are many cells across. The macro end
  is the demanding one: the closeup camera magnifies a patch of the plate, so the
  domains there must still be several cells wide. That is an argument for the 1024²
  rung, and for keeping the macro preset honest about what it needs.
- **The magnet.** At plate scale the hand under the glass becomes a tool on the plate
  (alongside dropper, blow and press) and a patchable point. Several magnets, which
  would look invented at macro, read as a rig with two magnets at plate scale — so the
  multi-magnet mode is a plate-scale option rather than a general default.

**Two presets ship:** *Slide* (macro, lit from below, the reference) and *Dish* (plate
scale, projected, silhouettes and spikes on the beat).

**Relationship to the beads:** oil beads are a texture of dark-rimmed droplets, drawn
from a Canvas2D mask. Once a phase field exists, beads become one end of `phaseScale` —
a fine lattice with high tension — and the mask can go. That is also the honest answer to
"is plate-scale ferro just the beads?": it is the same family, with the physics doing
what the mask only imitated, and with spikes, labyrinths and chains available at sizes
the mask could never show.

**New settings:** `phase` (how much second liquid), `phaseScale` (domain size, beads to
hands), `phaseTension`, `phaseDensity`, `phaseOpacity` (how black a full-thickness domain
is), `magnet`, `magnetX`, `magnetY`, `magnetHeight`, `magnetPolarity`, plus a look family
(*Slide*, *Dish*, *Labyrinth*, *Spikes*) across both scales.

**Checks:**
- Spikes appear above a field strength and not below it, and their spacing widens as
  tension rises.
- A lattice's beads keep their spacing rather than merging.
- Raising the magnet spreads and weakens the pattern.
- Dye is excluded from a domain to the same tolerance as part A's air, and total phase is
  conserved while the magnet moves.
- **At both ends of `phaseScale`:** a spike rises within one beat at 120 bpm, the rim
  stays visible, and the plate-scale look survives being shrunk to a phone frame — the
  measure `detail.mjs` already uses, read at 1080×1920.

## C. More bottles

**The standard to keep.** The dropper has nine bottles: five that only colour (water,
oil, alcohol, ink, syrup) and four that write into the plate's liquid field and go on
acting — soap, milk, silicone, glycerine. The code's own line for why is the one to hold
new bottles to: the field is "the whole difference between soap and a blue dye called
Soap". A new bottle earns its place by changing what the plate *does*.

**What the field carries today** (`liquidPhase.ts`): three numbers per cell, advected
with the flow and decaying (soap 6 s, body 22 s, repel 26 s) —
- `soap`: surface tension broken, which drives a Marangoni flow away from it;
- `body`: thicker than water, which drags;
- `repel`: refuses to mix, which holds an edge.

Everything below is either a new mix of those three, or one of six new channels.

### The bottles

| Bottle | What you see | How |
|---|---|---|
| **Acrylic latex** | Heavy paint that piles, holds a ridge, and slowly **skins over**: the plate sets where it has been still, and the skin cracks when the plate rocks | `body` high, `repel` medium, plus the new `set` channel |
| **Oil paint** | Very slow, holds knife and brush marks, refuses water entirely, marbles rather than blends | `body` at full, `repel` near full, plus **yield**: it doesn't move at all until pushed hard enough |
| **Clear medium** | No colour at all. It thins what it lands in, makes the plate thick and glassy, and shows only as refraction and a meniscus | Lays no dye (`injectAmount` 0), writes `body`, and the new `strip` at a low value for dilution |
| **Propylene glycol** | Wet forever: thick, slow, and it **stops the plate setting**, so latex beside it stays live | `body` medium, and negative `set` |
| **Isopropyl alcohol** | Blooms: it shoves colour outward hard and briefly, then evaporates and leaves the pigment as a **ring** at the edge of where it was | A short, strong `soap` burst, plus the new `dry` channel, which concentrates pigment as it goes |
| **Bleach** | Takes colour out instead of putting it in: white trails through dye, negative painting | The new `strip` channel: a dye multiplier below 1 |
| **Fizz** (bicarbonate and acid) | Gas born *inside* the dye: bubbles grow where it lands, rise, and pop | The new `gas` channel, which feeds part A's air field |
| **Cornstarch** | Resists a fast stroke and yields to a slow one; a press cracks it | `body` whose drag rises with the local strain rate |
| **Slime** (methyl cellulose) | Strings: filaments that stretch, thin, and snap back | The new `elastic` channel: a memory of strain that pulls back |
| **Salt** | Starbursts in wet dye: pigment crawls toward each grain and dries there | The new `wick` channel: point sinks that pull pigment |
| **Alginate** | Drops that gel on contact into durable beads that bump and roll rather than merge | `repel` at full plus `set`, and once B exists, a phase droplet |

### The six new channels

| Channel | Meaning | Decays in | Used by |
|---|---|---|---|
| `set` | How far the liquid has skinned over. At 1 it stops moving, and shear cracks it | doesn't decay; reversed by `dry` < 0 or by glycol | latex, alginate |
| `dry` | Evaporation rate here. Positive concentrates pigment toward the edge of the wet patch | 10 s | alcohol, and negative for glycol |
| `strip` | Multiplies dye down where it is, leaving the film | 8 s | bleach, clear medium |
| `wick` | Pulls pigment toward seed points and holds it | 20 s | salt |
| `elastic` | Strain memory that pulls back, so a stretched thread recoils | 12 s | slime, and it deepens lacing |
| `gas` | Bubbles produced per second here | 14 s | fizz, and anything that boils |

Two behaviours also get added to `body` rather than a channel of their own:
- **rate dependence**, so a bottle can thicken under a fast stroke (cornstarch) or thin
  under one (most paints);
- **yield**, so a bottle can hold a mark until pushed (oil paint).

### What the dyes themselves carry

Separate from the field, each bottle gains a few pigment properties, which cost almost
nothing and explain a lot of what the references show:

- **Pigment weight:** heavy pigment sinks through light, which is what makes cells in an
  acrylic pour. The plate already has heat and buoyancy to hang this on.
- **Opacity:** milk and latex cover; ink and alcohol stain.
- **Fluorescence** with a **UV lamp mode:** under a blacklight, ordinary dye goes dark
  and fluorescent dye glows. This is exactly what 60s light shows did with UV and
  fluorescent paint, and it costs one lamp mode and one flag per bottle.
- **Thermochromic:** colour follows the plate's heat, which the solver already carries,
  so the hot spot and a hand's press change the colour rather than only the flow.
- **Metallic sheen:** mica flakes that catch the lamp, which rides on the particle work
  (H1) and the beads.

### What it needs first

- **The liquid field moves to the GPU.** It is CPU today, advected on the velocity
  readback, which was the right call for three channels. Nine channels on a readback is
  not: they become two more advected textures in the same pass family as A's air and B's
  phase. That is the prerequisite for all of part C.
- **The dropper needs grouping.** Nine bottles fit a row; twenty do not. Group them as
  *Dyes*, *Changes the plate* and *Reacts*, and keep each preset's dish to a handful, as
  the palette contract already does for colour.
- **Presets choose their dish.** `npm run plate` already checks every preset names
  liquids that exist, so new bottles arrive with the presets that use them, not as a
  wall of new choices.

### Checks (`npm run liquids`, which already has 15)

- Every new channel at zero leaves an existing look bit-identical. This is the harness's
  first property today and stays first.
- Each bottle's signature is measurable:
  - bleach lowers dye where it lands and nowhere else;
  - latex stops moving as `set` rises, and cracks when rocked;
  - cornstarch resists a fast stroke and yields to a slow one;
  - alcohol leaves more pigment at the rim than in the middle;
  - fizz raises the air field's bubble count;
  - salt moves pigment toward its seeds.
- Ceilings and `headroom()` hold for the new channels, so an hour of automation cannot
  fill the plate with any of them.

## Cost and where it fits

- **A** is roughly one extra advected field and one splat dispatch per step, plus a
  simpler composite. The metaball loop it deletes was 40 iterations per pixel, so the
  composite may get *faster*.
- **B** is a second advected field with a fourth-order term, which is the expensive part;
  budget it as about a third of a solver step again, and make it free when `phase` is 0.
- **C** is two more advected fields plus the bottles themselves. Each channel is a few
  lines in one pass; the work is in the tuning and the checks, not the arithmetic. It is
  free when every channel is zero, which is every preset that doesn't ask for it.
- All three are **H-phase work** in `docs/webgpu-plan.md`, after the cutover:
  - **H6: air as a field** (A). Small, and it fixes something visibly wrong now.
  - **H7: the second phase** (B). The bigger one, and the one that gets the reference's
    look. Ferrofluid, and alginate beads, come with it.
  - **H8: the bottles** (C), starting with moving the liquid field to the GPU. Latex,
    oil paint, clear medium and glycol are the first four, because they are `body`,
    `repel`, `set` and one negative — the least new machinery for the most obvious
    change on the plate. Fizz waits for H6 (it needs the air field); salt, slime,
    cornstarch and bleach follow; the pigment properties (weight, opacity, UV,
    thermochromic) can land any time after the dyes move to the GPU.
- None of it touches GLSL, so all of it respects the freeze.

## Open questions

- **How far to take exclusion by default.** Fully clear air is physically right and
  changes how every existing preset with bubbles looks. Presets can carry
  `bubbleClear` to keep their old look, but the defaults should change.
- **Whether the second phase replaces the bead mask** now or later.
- **Whether the magnet is one point or several.** One hand is what makes the macro look
  filmed rather than composed. At plate scale a second magnet reads as a rig rather than
  a trick, so several is a plate-scale option — the open part is whether it is worth the
  controls.
- **Settled 2026-09-20:** the look is not macro-only. `phaseScale` carries it from beads
  to hand-sized domains, with a preset at each end, and the beads texture becomes the
  fine end of the same family.
- **Whether a plate that sets is a good idea.** Latex skinning over is the most
  interesting thing in part C and the most dangerous: a plate that stops moving is a
  plate that stops moving. It probably wants a ceiling, a hard "wet the plate" control,
  and the drain to dissolve it.
- **How many bottles is too many.** Eleven new ones is a lot of menu. The grouping and
  per-preset dishes should carry it, but it may be better to ship the first four, play
  with them, and let the rest earn their place.

## Nucleation, and the two settings that were waiting for it (2026-09-21)

Bubbles arrive today because something put them there — a pour, an impact, the
automation. None of them arrive because the liquid is *hot*, and that is the one
way a real dish makes them.

The plate has had the parts for this the whole time and never joined them up.
There is a temperature field (`vel.z`), heat goes into it from about twenty
places, `heatDecay` cools it, and buoyancy lifts what is warm:

```wgsl
var f = vec2f(0.0, S.curBuoy * tanh(max(temp, 0.0) * 20.0));
```

Two settings were declared for it and read by nothing: `heatIntensity`, set by
all thirty-two presets between 0.02 and 0.9, and `boilingPoint`, set by
thirty-one between 0.35 and 1.0. Both were deleted on 2026-09-21. The reasons
are worth keeping, because they are the argument for what to build instead.

**`heatIntensity` was a second name for Buoyancy.** Across the presets the two
move together almost rank for rank — Boiling Point 0.9/1.0, Lava Lamp 0.8/0.9,
down to Milk Marbling 0.02/0.05, with only Cyberpunk Neon and Jellyfish Bloom
out of order. That is not a coincidence: below `temp ≈ 0.05` the `tanh` above is
near-linear, so scaling the heat going in and scaling `curBuoy` are the same
gesture, and Buoyancy already has a slider and a pin. Above it the `tanh`
saturates — and the hardcoded seeds (`addTemp(..., 3.0)`, `5.0`) land at
`tanh(60) = 1.0`, where more heat does *nothing at all*.

That saturation is the real defect the setting was hiding. **Every heat source
on the plate is maximally buoyant regardless of how much heat it got**, so a
plume has no strength, only a position. Whatever boiling gets built should fix
the seeds into the responsive part of the curve first; the shape of a plume is
free once they are.

**`boilingPoint` had no mechanic anywhere,** and the decisive evidence that
nobody had ever seen it work is Crowd Plate, which carries `boilingPoint: 0` —
the most extreme value available, meaning "boils on contact" — with no effect
anyone noticed. A threshold nothing compares against.

What makes it worth building now is H6. Nucleation needs somewhere to put the
air, and until the air field existed there was nowhere: bubbles were forty
uniforms and a metaball loop in the compositor, and heat could not reach them.
Now air is a quantity the plate carries, so the sketch is small:

- where `temp` crosses a threshold, ask `bubbles.ts` for a bubble, at a radius
  set by how far over it is;
- the threshold is the per-look setting, and it comes back **named for what it
  does to the picture** rather than inherited — the stored 0.35–1.0 range was
  never meaningful, so a new range should be chosen by the mechanic;
- a bubble takes its heat with it, which is what stops one cell spraying
  hundreds, and is also why this belongs next to the exclusion rather than
  before it.

The preset called **Boiling Point** is the test. It is named for a mechanic that
was never built, and it should be the look that proves the feature: a dish that
sits, warms, and then breaks into bubbles from the bottom up.

### A third one, and the name that hid it (2026-09-21)

`surfaceTension` was the same fault as the two above and much better hidden.
All thirty-two presets set it, between 0.01 and 0.3, each with a comment. The
engine never read it.

It survived because the solver has a **local variable of the same name**:

```ts
const tension = clamp01(settings.blobSurfaceTension ?? 0.5);
const immiscibility = polarity * 0.04 * (0.4 + tension * 1.2);   // was: surfaceTension
```

That local goes into the params object, so `p.surfaceTension` exists and is
read twice. Any audit grepping for `.surfaceTension` finds those two and calls
the setting live. It also fooled a first pass at a control for it — a slider
was added on the strength of those two reads, and the slider then *read the
key itself* to draw its handle, which made the check written to catch the
problem pass on it.

What it actually duplicates is `blobSurfaceTension`, which has a slider and a
pin already. The presets say so themselves; every one that set both said the
same thing twice:

```
surfaceTension: 0.14,      // blobs hold shape, merge slowly
blobSurfaceTension: 0.35,  // loose amoeba shapes, slow pinch-and-merge

surfaceTension: 0.02,      // near-zero — fluid fragments into star clusters
blobSurfaceTension: 0.1,   // near-zero cohesion — matter fragments freely
```

The setting is deleted and the local renamed to `immiscibility`, which is what
it does and what the method it feeds is already called.

**A tuning job this turned up.** Thirteen presets wrote the dead key and never
set the live one, so they run at the `blobSurfaceTension` default of 0.3 —
Cyberpunk Neon, Stardust Collapse and Timbre Shifter wrote 0.01–0.02, the
bottom of the dead scale, meaning almost no cohesion. The default is "mostly
loose", so none of them is stranded and no look was changed here. But their
authors asked for less cohesion than they are getting, and the numbers are in
the git history if anyone wants to take it up: Cyberpunk Neon 0.01, Stardust
Collapse 0.01, Timbre Shifter 0.02, Solar Flare 0.03, Bass Drop 0.08, Fractal
Dream 0.08, Deep Ocean 0.1, Boiling Point 0.1, Aurora Borealis 0.12, Velvet
Underground 0.15, Jellyfish Bloom 0.18, Neon Coral Reef 0.22, Microscopic
Chaos 0.25.

## D. What the liquids are, which is nothing yet (2026-09-21)

Two questions asked of the running app, answered by reading it rather than by
hoping: does it account for liquid *density* — which floats on which — and does
it account for *saturation*, so that oil dropped on clean water spreads
violently and oil dropped on oil does not? **Neither. Both are worth building,
and the second is worth more.**

### Density: there is one liquid

The plate carries **one dye field** — `rgba16float`, `rgb` a log-space
absorption for the geometric-mean mixing, `a` a concentration — and **one
velocity field**. Every colour shares that momentum, so there is no per-species
density and nothing that could stratify.

The only density-like force is concentration, not species:

```wgsl
var f = vec2f(0.0, S.curBuoy * tanh(max(temp, 0.0) * 20.0));   // thermal only
f += S.rock * dd;                        // dd = tanh(dye.a - S.meanD)
if (r > 1e-4) { f += (toC / r) * (S.curGrav * dd); }
```

`dd` is how much dye is in a cell against the plate's mean. Thick dye therefore
rocks and drifts differently from thin dye, which reads a little like weight —
but two dyes of the same colour and different densities are *identical*, and
nothing ever sinks through anything.

What stands in for immiscibility is `applyImmiscibility`, and it is driven by
**colour difference**: the force between neighbours goes as
`|c_neighbour − c_here|²`. So two different colours repel, and two
same-coloured liquids of different density do nothing whatever.

This is already promised twice in this document — "density difference, so the
heavy phase sinks against the plate rock and the tilt" in B, "heavy pigment
sinks through light" in C — and it exists in neither.

### Saturation: the thing that would change how a show begins

A drop of oil on clean water spreads to a monolayer, fast and far. A drop of
oil on water that is already covered sits where it lands as a lens. The plate
does not know the difference: a pour onto bare glass and a pour onto a
saturated plate behave the same, because nothing tracks coverage.

The physics has a name and the right shape for this engine. The spreading
coefficient is

```
S = γ_water − (γ_oil + γ_oil/water)
```

positive on a clean surface and about zero once it is covered, and what drives
the spreading is not the tension but its **gradient** — Marangoni flow.
So the state to carry is surface coverage, which the plate nearly has already
in `dye.a`, and the force is `∇γ` with `γ = γ0 · (1 − coverage)`: dye is pushed
from covered plate toward bare plate, hardest where the plate is bare, and the
effect switches itself off as the plate fills.

**And here is the trap, which this session paid for three times.** A force that
is a pure gradient is *exactly* what the pressure projection exists to remove.
Adding `∇γ` to the velocity and then projecting leaves nothing — the same
result as adding a velocity down the air gradient for the bubbles, which cost a
pass and did nothing at all. Marangoni has to enter one of the three ways that
survive a projection:

1. **Into the divergence the projection solves**, as the bubbles' displacement
   does. A spreading film is genuinely a source in the plane, so this is the
   physical place for it.
2. **As transport of the dye directly**, not of the velocity — the dye's own
   advection, with the spreading displacement added to the velocity it samples.
3. **As a multiply on the dye**, which is what finally emptied a bubble, and
   which reaches places no gradient can.

Whichever is chosen, it must not be added to the velocity field before a
projection and expected to survive. That sentence is the whole of what H6 cost
to learn, and it applies unchanged here.

**Why this one is worth more than density.** It gives a show a beginning. The
first pour onto a clean plate would bloom across it and the tenth would sit in
a puddle, which is what a real plate does and what no setting can currently
express — and it needs one new scalar field, or possibly none at all, rather
than the second momentum field that a true density difference requires.

## A, continued: the interior empties, and the hole does not close (2026-09-21)

**The mechanism is known now, and it was none of the three suspects.**

The question that settled it asks *where* the dye is left rather than how much,
by measuring the radial profile against the same plate with no bubble on it,
alternated in pairs so the plate's drift is shared. With the air at **1.00** in
the middle of a bubble:

| r/R | 0.0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 | 0.8 | 0.9 |
|---|---|---|---|---|---|---|---|---|---|---|
| dye, with / without | 1.00 | 1.01 | 1.00 | 1.01 | 0.93 | 0.84 | 0.79 | 0.83 | 0.93 | 0.81 |

The centre is **untouched** — 0.990 over r < 0.5R — and only the rim thins. An
under-converged pressure solve or a stale velocity would thin the whole disc a
little; neither leaves the middle pristine. Both mechanisms in place were
driven by the air *gradient*, and the inside of a bubble has none.

Underneath that is a second fact worth keeping, because it rules out a whole
family of fixes: **the dye's advection cannot dilute.** It is semi-Lagrangian,
so it transports a value along a characteristic — `dye_new(x) = dye_old(x − v·dt)`
— with no `−c(∇·v)` term. A radially symmetric source has zero velocity at its
centre, so that cell backtraces onto itself and keeps its dye for ever however
strong the source is. That is why a hundred times the strength moved 0.67 to
0.62 and six times the settling time reached an asymptote at 0.59.

**So the operator has to be local, and a multiply is the only local one.**
`dye *= 1 − clear·a` needs no transport and therefore reaches the middle:
measured **0.002–0.013 under a bubble against 5.2–5.5 around it**, against
1.362/1.998 for the exchange it replaces. That is the claim H6 exists to make,
and it now holds.

### What it cost, and what is still open

A multiply destroys what it removes, which is why it was abandoned the first
time. Three things were tried to keep the dye:

- **The plate's dye-budget servo, made symmetric.** Never engaged: the deficit
  term is quadratic, so a plate 10% under its budget contributes 0.0001.
- **A compensating uniform gain from the air's area fraction.** Wrong in
  principle — after the first step the interior is already empty and nothing
  more is being taken, so an area-based gain compounds every step.
- **A ring of the displaced dye at the rim,** from the density mirror, which is
  what works. The mirror being a frame behind is exactly right: on the frame a
  bubble arrives it still holds the dye the GPU is removing, so the disc total
  *is* the mass to move. Both halves read the same mirror, so it conserves by
  construction. It must be gated on the mirror having actually refreshed —
  depositing twice from a stale mirror measured as a plate 4–8% over its
  control and a popped bubble refilling to 124%.

With the ring, the plate keeps its dye: **99.6–105.1% of a no-bubble control**
over twenty seconds, against 82.7% without it. The control matters — the plate
drains to **90.7%** on its own in that time, so most of what looked like the
bubble's fault was the plate settling.

**What is not solved: a popped bubble's hole does not close.** 0.123 against
2.410 twenty-four seconds after the pop, with the plate released to a normal
speed. The dye is conserved and sitting in the ring; nothing brings it back in,
because once the air is gone there is no force pointing inward, and `classic`
has diffusion measured at zero. A hole therefore persists and advects around as
a ghost.

The mechanism that should close it already exists and is too brief: the rate
term in `divergence` is a *sink* while air is leaving, but an abrupt
`bubbles.clear()` empties the field in one frame, so the sink acts for one
frame and is clamped. Two candidates, neither tried:

1. **A leaky trail.** Keep `trail = max(air, trail·decay)` in a third field and
   difference against that instead of last frame, so a departed bubble pulls
   liquid inward for about a second rather than one frame.
2. **Return the ring on the CPU,** symmetric with the deposit: diff the bubble
   list, and for a bubble that has gone, move the annulus back into the disc.
   Exact and cheap, and needs a way to match bubbles across frames.

Until one lands, the exclusion leaves visible holes and should not go to the
deployed site. The check is left failing and says the number, as the last one
did.

### A latent bug this turned up

`bestRad` in the compositor is the constant **0.03** — the radius a bubble was
given before the air field replaced the forty uniforms. The sample meant to
read the liquid *beyond* the rim is taken at `bestRad · 1.35`, so on any bubble
wider than that it lands **inside** the bubble. It did not show while the dye
was still there to be sampled; with a real hole it reads nothing, the film
thickness goes to zero and the tint goes white. It now walks outward along the
air field until the air stops, six taps, inside the branch that already
requires air, so a plate without bubbles pays nothing.

**And a warning about the check next to it.** "The light it adds is the liquid
lit" gates on a mean over pixels it classes as lit, and emptying the hole
changed that population by a factor of ten — 9944 pixels before, 823–1187
after. At one setting it read 24.0°, 39.2° and 41.9° on three runs. It is not
comparable across this change and it is too noisy to tune against; it needs a
fixed population before it can gate anything.

### Candidate 1 tried: a leaky trail, and it is not enough (2026-09-21)

Built and measured and taken out again. `trail = max(air, trail · decay)` in a
third field, with the rate term differencing against that instead of last
frame, so a popped bubble leaves a sink for about a second rather than one
clamped frame.

**Two bugs found on the way, both worth more than the mechanism.**

*`r16float` is not a storage format.* The trail was made to match the air field
and the whole command buffer was rejected — single-channel 16-bit float needs
`texture-formats-tier1`. It is the exact mirror of the trap that opened H6: the
field has to be `r16float` because it **blends**, and the trail has to be
`r32float` because a compute pass **writes** it. The symptom looks nothing like
a format error and is worth recognising: **the plate freezes**, and the readback
repeats the same number to four decimals, because none of the step's work runs.

*The air source was gated on live bubbles.* `airPush = air.any ? clear : 0`,
so the moment the list emptied the entire source was multiplied by zero — and
the trail exists precisely to act after that. The trail was built, measured and
did nothing, because everything it fed was being zeroed. It has to linger on
the same half-life.

**With both fixed it still is not enough.** The refill went from 0.003 to
0.032–0.060 against surroundings of about 2.4 — ten to twenty times better and
still two orders of magnitude short. Three likely reasons, none chased:

- the sink is spread over the trail's whole footprint rather than concentrated
  where the dye has to arrive;
- **the rate term is not zero-mean.** The standing term has the plate's air
  fraction subtracted for exactly this reason; the rate term never did, and a
  sink with no compensating source has no Neumann solution for the projection
  to find. This is probably the real limit, and it is the same condition
  `pressureSelfTest` exists to protect;
- seven cells of semi-Lagrangian transport on a slow plate is simply slow.

So candidate 2 — returning the ring on the CPU, symmetric with the deposit,
using the `mul` buffer that already exists for taking dye away — is the one to
try next, and the zero-mean fix should be tried first because it is one line
and it may be what has been limiting the source all along.
