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

**The divergence source is not optional, and a velocity will not do.**
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
