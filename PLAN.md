# Plan: a plate with real detail, a show you can render, and a show that plays like one

Three threads of work, merged into one running order.

**The look.** Filmed liquid (acrylic pour, oil and milk macro) carries structure at
every scale. Ours does not: measured on a 512 px centre crop, the reference frames
put 4.2–7.3 % of their pixels on a hard edge with a typical local contrast of 2–7,
while our settled Fillmore plate manages 2.4 % and 0.8. At the scales that read on a
wall (4–8 px) the reference carries three to five times more structure. The cause is
numerical diffusion: every solver step advects and diffuses the dye, so anything
finer than about eight cells is gone within a second, and nothing generates structure
below the grid.

**The instrument.** The show can be played from the music more directly than
sound-drive-and-hope, and a finished song deserves a rendered film rather than a
screen capture.

**The show.** Twenty-odd filmed liquid light shows, from the Joshua Light Show's 1969
*Liquid Loops* to a band's show in 2023, were measured with the watch tool
(`npm run watch`) on 2026-09-26. Real shows move in swells and scenes, spend a third
or more of the time near black, hold two or three hues a frame, and do not follow the
kick. Ours is equally busy all the time, which `src/lib/phrasing.ts` measured and
stopped short of fixing. Batch 10 is that thread; its yardstick is the table there.

| Measure (512 px centre crop) | Pour | Drops | Marbling | Ours now |
|---|---|---|---|---|
| Pixels on a hard edge | 7.3 % | 4.2 % | 5.6 % | 2.4 % |
| Typical local contrast | 7.2 | 2.0 | 6.5 | 0.8 |
| Structure at 4 px | 1.5 % | 0.9 % | 1.3 % | 0.3 % |
| Structure at 8 px | 2.3 % | 2.2 % | 2.5 % | 0.5 % |

`npm run detail` (`scripts/detail.mjs`) produces this table, so every batch is judged
the same way rather than by eye.

> **This is the plate's own running order.** The engine work it now sits on — the
> WebGPU port, the effects, air and the second liquid — is in
> [docs/roadmap.md](docs/roadmap.md), which says what comes first and links the
> plans behind each piece. The port landed on 2026-09-20 and the shader freeze with
> it: there is one shading language in the tree now, WGSL in `src/gpu/wgsl/`.

## Running order

Each batch is one PR: build, test in the sandbox, merge, deploy, then a GPU look on
the Mac before the next one starts. Order is by what lifts everything else first,
and by what would otherwise force a rebase later.

Where each batch stands, as of 2026-09-27:

| | Batch | State |
|---|---|---|
| 0 | The dye a tool makes | **Shipped** (#152) |
| 1 | Sharp liquid, and pigment in it | **Shipped**; sharpening retired, granulation stands |
| 2 | Lacing | **Shipped**; its 4–8 px gate moved to batch 3 |
| 3 | Drops, not rings | **Shipped** (#163): drops and bubbles as air pockets, shaded as a projector throws them |
| 4 | Liquids that behave differently | **Shipped**; milk's opacity still owed |
| 5 | Playing it | Sound learn **shipped** (#155, on #154's bands); shutter and look link **not started** |
| 6 | Render a song | **Shipped** (#153 seed, #154 offline bands, #156 render); the 3-minute 1080p gate is unmeasured |
| 7 | The room in the plate | **Shipped** |
| 8 | The desk | **Shipped** |
| 9 | Ferrofluid after the references | Sharp edge and two looks **shipped** (#161); maze detail **shipped** (#167); dye carried **shipped** (#168); the magnet's spikes, 9e, **shipped** (with the phone's fingers as magnets), not yet judged on the Mac; 9f–9j open |
| 10 | Playing like a show | Step 0, film every look, **shipped** (#162); its first full baseline not yet run; step 1, rest, big events and darkness, **shipped** on the sequencer (#170), not yet filmed; step 2, the song's shape, **heard** live (builds, drops, breakdowns; `npm run shape`) and **followed** by Pacing (#182, Follow the Song; `npm run pacing`), not yet filmed; step 3, accents, the one **shipped** (#184, Accent the One; `npm run downbeat`), not yet seen on the Mac, every other bar, fills only, a hand's variation and a press pulled onto the beat not started; step 4, press round and lift into fingers, **shipped** (#185, `npm run lift`), not yet seen on the Mac, and Beat Squeeze, found never to have pressed the plate, **pressing** on every kick and let go after each (`npm run lift`, `npm run squeeze` on the Mac), not yet seen on the Mac; step 5, oil and water as bodies, **shipped** (#179, Oil Bodies, on in Oil & Water), not yet judged on the Mac; steps 6 and 7 not started |
| 11 | The mixer | Step 1, the sources there are in one stack with a grade each, **shipped** (#176); step 2, the gel wheel and the lumia as rows, **shipped** (#189); step 3, a blend per row, **shipped** (#193); step 4, a take button and fade time per row, **shipped** (#195); none yet judged on the Mac; steps 5–6 not started |
| 12 | The App Store and Google Play (at the end of this plan) | An iPhone shell (Capacitor) and an Android one (Trusted Web Activity) planned; step 1, the site on a phone, **passed** on the iPhone (Safari, 2026-09-27), Android not yet run; nothing built |
| 13 | ChromaGlass in popular VJ software (at the end of this plan) | Planned 2026-09-27: a small native wrapper (Electron) first, with the whole show cached offline and the show server inside, then video out through Syphon, NDI and Spout, OSC control, Ableton Link and video in; nothing built |
| 14 | The show at the gig: hearing, timing, speed, the wall (at the end of this plan) | Found 2026-09-27 by reading the code: the show goes deaf behind the projector window (14a), the wall can draw twice a refresh (14b), the projector's pixels come from the laptop's ratio (14c), the beat clock hears smoothed bass (14d). 14a **shipped** (the ear keeps hearing behind the wall, and says when it is deaf; `npm run ears`), not yet seen on the Mac with a real covered window; 14c **shipped** (a wall's pixels are the wall's: a Retina laptop on a 1080p projector opens at 1920×1080, was 960×540, and is offered 1024²; a 4K wall's bottom rung is 2.07 Mpx, was 8.29 like its top; the mirror smooths at 'high'; `npm run rungs` 70/70, was 63/70), whether 1024² holds on a 1080p wall not yet measured on the Mac; 14b and 14d not started |

Also landed or in flight around these batches: the macro closeup's cells ride the paint
and stop shaking at 6x (#165, `npm run cellride`); the show's pipelines are built before
it opens, so a cold Mac no longer freezes for 6–19 s at the start (#164, `npm run
startup`), and draws with each of them once before it opens, so the first frames no longer
stop for a second or two either (#181); the magnet stays where the hand leaves it (#159).

### 0. The dye a tool makes, and the deploys it is blocking

`src/gpu/wgsl/fluid.ts` (advection), `scripts/tools.mjs`

**Shipped in #152.** The Finger's "adds none" passes on Metal (208 → 199 against
−16 and −7 left alone), as do the Blow and the Press, and plates hold less dye at the
same point than before. What follows is how it was found.

*Found 2026-09-27, not yet done:* **"adds none" still goes red on runs that do not
touch the Finger.** #182's tools shard (a Pacing change; the same code had passed the
shard one commit earlier) read 50 → 64 against −12 before and +9 after, red by 1.5.
The check allows |Δ − d| < 0.15·total + 5 + |d| with d the larger-magnitude idle
reading, signed. So when the plate's two idle readings have opposite signs, the
allowance is centred on one of them rather than spanning both, which is not the
bracket its comment describes ("a Finger that makes dye still has to beat both").
Whether to bracket it (Δ within the two idle readings ± the allowance) is a decision
for the check's owner, taken with §0's "what the check should mean" below, since on
the positive side it is looser whenever the larger idle reading is the negative one.

*Found 2026-09-27, not yet done:* **the mirror check's "and nowhere else" goes red at
exactly its limit on changes that cannot move a pixel.** #191 (PLAN.md only) read
"Classic, calm, layer 1 turned a quarter: and nowhere else" at 11.1 past drift
against an allowance of 11.1, at the tool's mirror through the centre
(`scripts/mirror.mjs`, the Mac plate shard). It has been red at its limit on other
branches that do not touch the plate. Either the mirror echo it was written to catch
comes back now and then, or the allowance is drawn from a drift reading that is
sometimes as large as the echo; which of the two is the first thing to settle, from
the per-drop numbers it already prints. A thread cannot re-run a job (403), so each
of these costs the owner a by-hand re-run.

*Found 2026-09-27, not yet done:* **the wall's "output gain lifts what reaches the
wall" went red on a run that does not touch the output.** #184's tools shard (Accent
the One, default 0, which leaves every kick's weight at exactly 1) read 0.040 → 0.046
at a gain of 2.2, a lift of 1.15 against the 1.25 it asks (it usually reads about 1.5;
main's deploy one commit earlier passed it). Not the flash guard: the bracket turns it
off, and with it off the loop resets its gain to 1 at once (`LiquidVisualizer`, where
the guard's reading comes back null). The plain frame was unusually dark (0.040,
against 0.164 for the same plate earlier in the run), so a guess, unmeasured: most of
its light was in a few bright cells that a 2.2 gain clips at white, which lifts the
mean far less than the grade. If so, the check should read cells the gain cannot clip
(below 1/2.2 before the grade) rather than the whole frame's mean.

The dye's advection now thins
where the flow spreads and thickens where it gathers (the Jacobian of the
backtrace, in `macCormack`), with a gathering cell held to the most its upstream
cells held. The Finger's own velocity was never the source — in the lab it moves
the plate's total by 0.0% — the fingering push added after the projection was:
it runs along the dye's gradient, the Finger's carry makes that gradient steep,
and the backtrace copied the dye outward (lab, the Finger's path under the
push: 636 → 756 against 687 left alone; now 622 → 588 against 612). Holding
the gathering side matters: carried conservatively, a push up the gradient is
diffusion run backwards and grew a speck from 1.0 to the 6.0 ceiling in under
five seconds.

**This was first because it was red.** `npm run tools` fails on `main` about two
runs in three, and the deploy is gated on it, so every merge queues behind a coin
toss. Four deploys failed in a row on 2026-09-26 before one got through.

The claim it breaks is the Finger's: *carries dye along the stroke, adds none*. It
adds a great deal.

| commit | dye on the plate | the Finger added |
|---|---|---|
| #142 | 635 | **+301** |
| #142 | 656 | **+246** |
| `main` | 592 | **+307** |
| `main` | 655 | **+394** |
| #143 | 180 | +36 |

Forty to sixty per cent of whatever is already there, against a tolerance of
`0.15 * fa.total`. It is not a regression and it is not the gate being flaky — both
were checked, and both were wrong answers on the way here. The behaviour is the same
at #142, #143 and `main`; what varies is how much dye the plate happens to be holding
when the harness runs, because the tolerance scales with the pool and the amount added
scales with it too. It passes only on a thin plate. #143's two green runs started at
180 rather than 650.

The cause is already written down in `tools.mjs`, for the Press rather than the
Finger: *"the solver carries the dye's concentration through that spreading flow
without thinning it, so a press can add up to about as much again as it had"*. The
same note says it is tracked on its own, and this is that item. A flow that spreads
has to thin what it carries; ours multiplies it.

Two things to settle, in this order:

- **A conserving advection where the flow diverges.** This is the fix and it touches
  the beat squeeze, bubbles and currents as well, so it wants `npm run tools`,
  `npm run liquids` and `npm run plates` green together before and after, and a
  before/after on `npm run detail` — thinning dye correctly will change how sharp the
  plate reads, and that is the number this whole plan is judged on.
- **What the check should mean.** "Adds none" is a claim about the tool; what fails is
  the advection under it. Once the advection conserves, the check is honest as written.
  Loosening it first would silence the one instrument that found this, so it stays as
  it is until the physics is right.

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

### 2. Lacing

`src/components/LiquidVisualizer.tsx` (fragment shader)

The pale hair-thin filaments that outline every colour boundary in a pour. Driven by
the strain rate at the interface (the velocity gradient projected along the dye
gradient, both already available in the shader when the velocity texture is bound),
not drawn as a fixed edge, so it thins where the boundary is stretched and thickens
where it folds. New setting `lacing`; the existing `macroLacing` stays as the macro
camera's own.

**Gate:** structure at 4 px ≥ 0.9 % and at 8 px ≥ 1.2 % on a crop inside the plate
(batch 1 left these at 0.3 % and 0.5 %, against a filmed pour's 1.5 % and 2.3 %).
**Depends on** batch 1: lacing a smeared boundary looks like a glow, not a filament.

**Shipped, and the gate only half met.** On a seeded Fillmore plate, grain and cells off,
a 380 px crop inside the dish: pixels on a hard edge 6.5 % → 8.5 % at the default and
13.8 % at full, and typical local contrast 3.2 → 4.6 → 5.8, which puts both inside the
filmed references' band (4.2–7.3 % and 2.0–7.2). Structure at 4 px moved 0.4 % → 0.5 % →
0.7 % and at 8 px 0.4 % → 0.5 % → 0.7 %, so the mid-scale half of the gate is **not met**.

That is the honest reading rather than a tuning failure: filaments are a boundary
decoration, and 4–8 px variance is *composition* — drops, cells, the size range within a
cluster. The reference frames carry theirs in their drops and their cell networks, which
is batch 3. The gate moves there: **4 px ≥ 0.9 % and 8 px ≥ 1.2 % after batch 3**, with
lacing judged on what it is, which is the edge and contrast numbers above.

### 3. Drops, not rings

`src/lib/beads.ts`, the bead mask shader

The bead field is the right instinct and already measures well; take it three steps
further, to the second reference frame.

- Each drop carries **its own dye colour**, not just a dark rim.
- **Domed** body with one specular highlight, sized from the lamp's direction.
- **Polygonal flattening** when drops crowd, the way foam packs, instead of staying
  circles that push apart.
- **Compound drops**: a drop that has swallowed a smaller one keeps it visible.

New setting `beadDrops` (0–1) blends from today's dark-rimmed rings to full drops, so
the Fillmore look is unchanged at 0.

**Gate:** on a 2× crop, a 6:1 size range within one cluster, visible highlights, and
flattened contacts between touching drops.

**In progress in #163, and the spec above has moved.** A physics search on 2026-09-26
(`/mnt/project-files/drops/research/bubbles-and-drops.md`, with ray-trace scripts
beside it and reference photographs in `drops/references/`) found that a projector
and a camera see a drop differently, and the bullets above were written from camera
photographs:

- **A projector shows no highlight.** It focuses on the dish, and a drop bends light
  out of the lens's small aperture where its surface is steep. So each drop reads as a
  dark ring round a bright, upright centre: the bright core is
  u\* ≈ NA/(2·n_out·|1 − n_out/n_in|) of the radius, which leaves 60–80 % of a small oil
  drop and about 90 % of an air bubble dark. Nothing is flipped. The flipped,
  shrunk picture inside a drop in the macro photographs is the camera looking
  through it, and belongs to the macro closeup only.
- **The thin gap between the glasses sets the shape.** A drop is a sphere until its
  radius reaches half the gap, then a pancake with a half-cylinder edge. The gap also
  sets how fast drops move (a pancake lags at 2U/(1+λ), a bubble runs ahead) and how
  long a merged drop stays stretched.
- **Walls between unequal drops are arcs** that bulge into the larger drop, and
  junctions fillet like Plateau borders; that replaces "polygonal flattening".
- **Air bubbles are air pockets** (a thick black ring, a clear middle), and soap-film
  colour is faint in transmitted light.

Steve chose "Both": the projector look on the plate and the flipped, many-coloured
lens in the macro closeup. He then asked for the report's other findings to go into
the app in its ranked order, on the same PR. The gate becomes: the size range and
flattened contacts as written, the dark-ring fraction matching the rule above for oil
and for air, and no highlight in a projected look. Batch 2's deferred structure gate
(4 px ≥ 0.9 %, 8 px ≥ 1.2 %) is measured once this lands.

**Built, and waiting on the Mac.** `beadDrops` is in, at zero in every look.
`npm run drops` holds three of the gate's four on a plate a current has crowded,
at the app's 192² grid: a 10:1 size range across one cluster of 84 touching
drops (crowded rings make 11:1, so this is the population's range kept, not
made), every pair pressed a pixel and a half or more into each other meeting
along one straight wall with the dome under a pixel high there, and every
compound drop showing its passenger. Each of those claims was run against the
fault it names (a dome that ignores its walls, a gap down every contact, a
passenger drawn white, the rings' arithmetic touched at 0) and goes red. The
fourth, the highlight, is the shader's, and was later dropped (below: the
photographs have none). On the lab's plate, same
field, rings against drops: structure at 8 px 3.0 % → 4.7 %, and on a 2× crop
0.9 % → 1.7 %, with 4 px 0.5 % → 0.8 %. That lab plate is not the Fillmore
plate batch 2 was measured on, so the 4 and 8 px gate carried here from batch 2
is still to be read on the Mac with `npm run detail`.

Three things the first version got wrong and the check caught. Pressing a pair
in by a share of their combined size pushed small drops past a big one's rim,
and the wall between them landed beyond the small one's middle, so small drops
vanished into big ones; the press is now set by the smaller drop. A current
into one point let a drop swallow everything it was brought, one reaching
thirty-nine cells in twenty seconds; only a drop no bigger than the
population's own big lenses swallows now. And a passenger held forever meant
two drops in five were compound after twenty crowded seconds; they dissolve.

**Reshaded against photographs, and the highlight is gone.** On "very cartoon
like", the drops were matched to pictures of the real thing
(the project's shared files, drops/references, not in the repo: oil on backlit water, projected light
shows, water drops, emulsions, foam). They agree, and they disagree with the
gate's "visible highlights": a plate lit from beneath shows transmitted light,
and not one of the backlit pictures has a white dot. What they do show is now
drawn, and `npm run droplens` measures each on a single drop over a two-colour
plate: a small drop turns the plate round it over (its near half reads 0.88 of
the way to the far side's colour, 0.06 without it); a big drop is flat on top,
so an edge under it stays on the same pixel; a thin dark line at the contact,
23 % of the plate at its darkest, under seven tenths for 12 % of the radius and
the flank inside it at full brightness (the first reshade's shadow held it to
77 %); and nothing in a drop more than 1.08 × the plate under it, where the
glint made it 2.4 ×. Whether to bring a highlight back (for the camera pass,
which looks at the plate rather than through it) is the owner's.

Then, on the owner's reading of the same photographs ("some of the bubbles
have multiple background colors in them … a great diversity of bubble
sizes"): every drop's view reaches the same stretch of plate, so a droplet
carries several colours (`npm run droplens`: a stripe three radii off is in
it, one seven radii off is not), and with drops on, a second population of
droplets rings the big drops (`npm run drops`: 61 of 170 big drops have three
or more a sixth their size touching them, against 1 of 107 for the rings;
one cluster spans 17:1). The mask for the larger crowd takes 11.7 ms in the
sandbox against 8.6, a number for the Mac's `frameMs`.

**A projector and a camera see a drop differently, and the owner chose both.**
The research (the project's shared files, drops/research/bubbles-and-drops.md,
item 1) traced what a projection lens focused on the plate sees: nothing turned
over, and a dark band wherever the drop's curve bends the light past its
aperture, from u* = X/sqrt(1 + X²), X = NA / (2 n_water (1 − n_water/n_oil)), of
the curved part out. The plate now draws that; the macro closeup keeps the
camera's inverting lens. The aperture is an effective NA of 0.25 (the bare lens's
0.08 drew a field of black doughnuts; the one measurement matched 0.30 to 0.35),
so a droplet is dark over its outer three tenths. And item 3: the gap sets the
shape, a ball until its radius is half the gap and a pool with an edge half the
gap wide past that, so a press flattens every drop and thins every edge
(`npm run droplens`: 20 checks, projected and closeup; the dark band's half
point lands within 0.011 of the radius of where the aperture puts it; bowing the
glasses to half the gap under a drop takes its dark edge from 18 to 6 pixels).
The lens changes from projector to camera over the middle fifth of the zoom's
fade, near 1.45x, because the blend between them reads a whole drop from its
centre at one point, which on the zoom's own fade sat at 1.2x.

And item 6: the wall between two pressed drops is the arc their pressures give,
radius Rs·Rb/(Rb − Rs) through the points where their circles cross, bowed into the
bigger one, so a crowd of mixed sizes reads as packed drops rather than as a Voronoi
diagram (`npm run drops`: a 3- and an 8-cell drop meet 5.5 px from the small one's
centre, the arc says 5.2, the straight wall was at 2.7). The mask takes a square root
more per wall: 15 ms for the crowd of 529 in the sandbox, against 11.

### 4. Liquids that behave differently

`src/types.ts` (`LiquidType` grows behaviour fields), `src/components/LiquidVisualizer.tsx`

Today a liquid is an inject radius, an amount and a heat. Make the liquid kind change
the interface physics:

- **Soap.** Dropping it collapses the surface tension in a disc for a moment, so the
  colour flees outward and then curls into filaments. A real gesture from the era and
  the most performable thing in this batch; it wants a MIDI action and an OSC address
  like the press.
- **Milk.** An opaque, scattering ground that colour rides on top of rather than
  mixes into. Needs an opacity channel in the render rather than pure transmission,
  which is what makes the reference's reds sit so solid under the drops.
- **Silicone.** The cell maker: displaces colour aside into a ring rather than
  colouring it, which is where every cell in a pour comes from. Pairs with batch 3.
- **Glycerine.** Coils and ropes when poured, slow and thick.

**Depends on** batches 1 and 3 to read properly.

**Shipped, with milk's optics still owed.** `src/lib/liquidPhase.ts` is a second field
the plate carries beside the dye — `soap`, `body` and `repel`, advected by the same
velocity, decaying over 6, 22 and 26 seconds. All three are deviations from an
ordinary plate, so a show with none of them in it runs exactly the arithmetic it
always did and the whole pass is skipped; that is the first thing `npm run liquids`
checks, because a field that changes every existing look is a regression with a menu
entry rather than a feature. It needs no GPU work: with the GPU solver attached the
CPU arrays are the next step's deltas, so a force written as a velocity delta and a
thinning written as a dye multiplier reach the solver through a path that exists.

What each one measures at, on a stand-in plate:

| | |
|---|---|
| Soap | dye within 8 cells of the drop falls to 55% and the disc stays open |
| Glycerine | the plate moves at 0.0081, the thick patch at 0.0002 |
| Milk | a pool spreads 5.99 against 6.01 for bare dye under the same shear |
| Silicone | the middle goes 67 → 0 with 262 in the ring around it |

Two things went wrong and are worth keeping. Milk was first written as a cohesive pull
toward the middle, and measured *wider* than bare dye: a cohesive force with no
pressure term to balance it collapses the pool and throws it out the far side. It is
now a one-way damper that can only remove the velocity that is escaping, and a force
that can only take energy away cannot overshoot. And the first spread measurement was
taken about a fixed point, so a plate that merely drifted read as a pool that had
spread — it is measured about the pool's own centroid now.

**Still owed: milk's opacity.** What ships is behaviour, not optics. Colour still
transmits through milk rather than sitting on it, because the dye texture's RGBA is
already fully spent — three log-absorptions and a density — and there is no channel
left for an opaque ground. That is the part of the reference's solid reds this does
not yet reach, and it needs a render change rather than a solver one.

### 4a. What is in each preset's dish

`src/presetPlate.ts` (new), `src/presets.ts`, `scripts/plate.mjs` (new)

A liquid nothing pours is a menu entry. Every preset now names what is in its dish
alongside the dyes it may use and how the automation puts them there — the three maps
moved out of the component into `src/presetPlate.ts` so a harness can read them without
a browser. The list doubles as the dilution: `doseLiquid` picks from it uniformly, and
the five inert liquids are how a preset says *mostly nothing, once in a while
something*. `['water', 'water', 'soap']` is a plate broken open every third dose;
`['soap', 'silicone']` never stops reacting.

Three presets exist only because the liquids do: **Milk Marbling** (the kitchen dish —
four spots of food colouring dead still until a drop of soap sends them for the rim),
**Soap Film** (one sheet of interference colour, torn open again and again) and
**Glycerine Drift** (bands shearing against patches that will not go along).

An automated show adds liquid for hours and pours none of it out, so `LiquidPhase`
carries a coverage ceiling and the automation scales each dose by the headroom left.
Measured: dosing every frame unchecked leaves 92% of cells too thick to move; with
headroom asked, 2%. A hand on the dropper is never limited.

`npm run plate` checks that every preset's dyes, injection styles and liquids name
things that exist — the failure it is really for is a typo in a liquid id, which reads
as "this preset has no liquid", silently, forever. It found three on its first run:
Lumia, Sensual Laboratory and Oil Wheel had no injection style and had been quietly
taking the `drop` default.

### 5. Playing it: sound learn, shutter, and a look link

`src/lib/soundLearn.ts` (new), `src/hooks/useAudioAnalyzer.ts`, `src/components/MidiPanel.tsx`,
`src/lib/cameraPass.ts`, `src/App.tsx`

Independent of batches 1–4, so it can be built while the Mac is judging a look, and it
is the batch that changes how the show feels to play.

**Sound learn.** Today the music drives three fixed things: sound drive, beat squeeze
and macro sync. Anything else is a hand on a knob. The reference tool does better than
that with two kinds of row: a *mapping* (source → target × depth, where the source is a
frequency band, the overall level or a drum) and a *trigger* (a one-shot on an onset:
a flash, a zoom punch, the next preset).

The better version of that reuses a vocabulary the app already has rather than adding
a second one. The Learn button that binds a control to a MIDI knob grows a second
source: the music. Pick a slider, pick kick, bass, snare, hats, level or a band, set a
depth, and the plate follows it. Triggers map onsets onto the existing `MidiAction`
list, so a kick presses the big dish into a sunburst, a snare drops the lead dye, a bar
line steps the preset. One learn flow, one action list, one set of bindings saved in
the same file, whether the hand on the control is yours, a fader's or the drummer's.

Ours can be better than a plain FFT for a reason they cannot match: the beat clock
predicts the next beat and the song map knows bars and sections, so a trigger fires
*on* the beat rather than a few tens of milliseconds behind the microphone. A
band-energy mapping still follows the sound directly; it is the discrete hits that get
to arrive on time.

Needs per-band energies and per-band onsets added to `useAudioAnalyzer` (it exposes
bass, mid, treble, energy and the raw `frequencyData` today, but no named bands and no
onsets).

**The bands shipped in #154, and sound learn in #155.**
`src/lib/audioFeatures.ts` is the one analyser the live show and an offline song both
use: level, kick, bass, snare, hats, eight bands and an onset per source (`npm run
bands`, 71/71). On it, #155 puts a music button beside every Learn button: a slider
follows a source at a depth through the patch bay (`sceneMap.ts`), and an action fires
on a source's onset, on the predicted beat once the clock is locked (64 ms ahead of the
heard kick on the test song; `npm run learn`, 30/30). A beat cannot press a toggle.
What it leaves open: "press the big dish" and "drop the lead dye" have no matching
`MidiAction` yet; the bar is every fourth beat from lock, with no real downbeat; and
learned mappings do not reach a Cast or network display (triggers do). The downbeat is also what batch 10's accent
selection (step 3) needs.

**Shutter** (`shutter`, camera pass). Their trail buffer is a generic VJ smear laid
over everything. Here it belongs in the camera, where it is physically motivated: the
photographs that the Photograph style is built from are long exposures, and their light
trails and motion blur are part of why they read as film rather than as a screen. An
exposure-time control accumulates frames into the camera's existing scene buffer with a
decay, which puts it downstream of aperture and bloom so the three couple the way a
real lens does. Off in the light-show style, on by default in the Photograph presets.

**Look link.** The whole settings state in a URL. Preset files already do this properly
for a look you want to keep; a link is for the other case, showing someone a look right
now, between the laptop, the phone and anyone you want to send it to. Opening one sets
the look only: the projector window, the remote and the show server are untouched.

### 6. Render a song

`src/lib/rng.ts` (new), `src/lib/render.ts` (new), `src/hooks/useRecorder.ts`,
`src/lib/songMap.ts`, `src/lib/sequencer.ts`

This is the batch that changes what ChromaGlass is.

Recording today is `MediaRecorder` on the canvas: it captures whatever reached the
screen, drops frames whenever the machine is busy, and gives back a WebM whose timing
follows the render loop's bad luck. The reference tool does the opposite and is right
to: it steps the effect frame by frame, pre-analyses the loaded audio with an offline
FFT so the reactivity is identical on every run, encodes with WebCodecs and muxes to
MP4 with the audio track, up to 4K and ten minutes, streaming to disk rather than
holding the clip in memory.

We can go past that, because we have the pieces it has no equivalent for: song
identification, song maps, presets saved for a song and sequences with cue sheets. A
**Render this song** that plays the sequence deterministically, at a grid the live
machine cannot hold (768² or 1024²), with every solver step computed rather than every
displayed frame captured, produces a finished light-show film of that song. Not a
screen recording of a performance: the performance itself, run again at full quality.
Nobody else in this space ships that.

- **Seeded randomness.** There are 104 `Math.random` calls in the solver, the beads,
  the bubbles and the macro camera. Every one becomes a draw from a seeded generator
  carried on the fluid, or the same song rendered twice is two different films. This is
  the bulk of the work.
- **Offline audio analysis.** Bands and onsets pre-computed per frame from the song
  file, so the reactivity is fixed to the timeline rather than to the frame rate, and a
  render at 60 fps matches a render at 30.
- **WebCodecs encode to MP4** with the audio track, streaming to disk. Chrome only; on
  other browsers the current `MediaRecorder` capture stays as the fallback and says so.
- **Runs the show, not the settings.** A sequence, a per-song preset and the cue sheet
  play out over the song's real timeline.

**Gate:** the same song rendered twice is byte-identical, and a 3-minute 1080p render
completes without dropping a frame.

**Shipped, the first half of the gate met.** Seeded randomness in #153
(`src/lib/rng.ts`, one seed a load, `?seed=` fixes it, 199 `Math.random` references on
the plate down to 5 allowlisted; `npm run seed`). Offline bands and onsets in #154. The
render in #156: a film button in the music player steps the plate on a fixed clock
(`src/lib/showClock.ts`) and muxes MP4 or WebM with the song, in-house
(`npm run render` 105/105, ffprobe agreeing). On Metal, `npm run render-app` reads
24/24: the same seed twice draws the same 240 frames and an 8 s film lasts 8000.0 ms.
**Not yet measured:** a 3-minute 1080p render end to end, and a full sequence with its
cue sheet played out over a song. Both need the Mac.

One caution from batch 10's step 0: a fixed seed makes a *render* repeat, but not a
live take. Two Metal runs of the same code on the same seeds read Classic's motion
half-life as 1.0 s and then 11.3 s, because a live take's frames depend on the frame
clock. Judge a live-motion change by its range leaving the old range, not by a median
moving.

### 7. The room in the plate: the camera as a sensor

`src/lib/sceneSense.ts` (new), `src/hooks/useSceneCamera.ts` (new),
`src/components/LiquidVisualizer.tsx`, `src/types.ts`, `src/components/SettingsPanel.tsx`,
`src/lib/midi.ts`

The camera is already open and already on screen: `startFilmCamera` runs `getUserMedia`
and the frame loop uploads each frame to the film texture, where `filmMix` shows it
through the dye. It is a slide in a projector. Nothing ever reads it back, so the room
in front of the plate cannot touch the liquid.

Reading it back is cheap, and both ports it would drive already exist. `applyGesture`
is how every hand reaches the plate — mouse, pen, phone pad, gamepad, OSC, replay — so
anything that can name a tool, a point and a direction is a projectionist. And with the
GPU solver attached the CPU arrays are per-frame *delta* buffers, flushed as
`applyDeltas`, so a whole velocity field written with `addVelocity` lands on both
engines with no new shader and no new upload path. The work is three small pieces and
one piece of taste.

Independent of batches 1–4 and of 6, so it can be built while the Mac is judging a
look.

**Sensing** (`sceneSense.ts`, pure: pixels in, a reading out, no DOM and no GPU, so
it can be measured without a browser). The video is drawn to a 96² canvas and read
back as luma. From two consecutive frames:

- a **flow lattice**, Lucas–Kanade per cell on a 24² lattice: one pass over the pixels
  accumulating the structure tensor, not a block search, so the cost is the frame and
  not the search radius. Sub-pixel, and regularised so a blank wall reads as still
  rather than as noise.
- a **presence mask** from a background model that creeps toward the frame at a fixed
  step per second — a running median in everything but name, which survives a slow
  light change and holds a person who stops moving.
- **global scalars**: motion energy, its centroid and dominant direction, how spread
  out it is, people count, scene brightness, the scene's colour centroid.

Energy is **normalised against the room's own recent range**, the way `autoCalibrate`
does for the microphone, because a dark venue with a strobe and a lit rehearsal room
are four orders of magnitude apart and no fixed threshold serves both.

**The room stirs the plate** (`sceneDrive`). The lattice is bilinearly upsampled to the
sim grid and added as velocity each frame. One loop. This is the piece
that delivers the idea, and it is the smallest of the three.

**People as hands** (`sceneHands`). Connected components on the presence mask, the
largest few kept, matched to last frame's tracks by nearest centroid so each person
carries a **stable id**. Each track calls `applyGesture`: still → `press`, a palm on
the glass, so fingering and beat squeeze work on it; moving → `blow` along its velocity;
arriving → `drop`. Everything downstream — bubbles, beads, the squeeze film — reacts
without knowing where the hand came from.

The id is what makes it a show rather than a stirred plate: hashed into the preset's
**palette contract**, so a person gets a dye that is stable across the set and still
inside the dyes the preset may use. One dancer is always the magenta, and the magenta
goes where they go.

**Assigning it to anything else** (`sceneMappings`, `sceneImpact`). The audio already
has the right shape for this: a feature, a target and a depth. The scene gets the same
vocabulary — motion, presence, spread, centroid, people, brightness, scene hue — and a
list of mappings onto any learnable setting, with one master depth over the lot. A room
filling up can open the palette; a crowd going still can drop the turbulence; someone
walking left to right can ride the lamp across the plate. None of it hardcoded.

**Gates.** Batch 7a: a reading at 20 Hz for under 2 ms on the main thread, and a
sensor preview that makes the camera aimable in a dark room. 7b: a hand waved at 3 m in
a lit room visibly moves the dye within 200 ms, and pointing the camera at the
projection screen does not run away. 7c: a person tracked across the frame keeps one id
and one dye for 30 s of ordinary movement.

**Risks.**

- **The feedback loop.** A camera that can see the projection screen makes the plate
  drive itself. Two guards were tried and the harness threw both out. Subtracting the
  steady part of the flow field removes 0 % of a pattern that *travels*, which is what
  a loop looks like. Comparing the room's flow against the plate's own velocity —
  the loop being the plate seen through a lens — scored a fan in the corner of the
  frame *higher* than a real loop: from one camera the two are not distinguishable,
  because a driven plate moves the way the room moved. What holds it is the per-cell
  cap against the solver's damping, which makes the loop saturate rather than diverge:
  measured over forty closed-loop seconds it settles at 0.26, about what one wave of an
  arm peaks at, and climbs 1.04x over its last third. So a mis-aimed camera is a plate
  stirred by nothing in particular, not a show that has to be restarted — and aiming it
  away from the screen is still the instruction, not an optimisation.
- **Latency.** Capture to analysis is 50–100 ms. Right for *the room stirs the liquid*,
  wrong for anything expected to land on a beat — discrete hits stay on the beat clock.
- **The venue.** Strobes, auto-exposure pumping and rolling shutter all read as
  whole-frame motion. The running normalisation and a deadzone absorb the slow part;
  the fast part is why the flow is median-ish per cell rather than a frame mean.
- **The frame budget.** Analysis runs throttled and its cost is reported, so if it ever
  needs a worker the move is a buffer transfer rather than a rewrite. Until then the
  governor sees it as frame time and drops a rung rather than dropping frames.
- **Two apps, one camera.** A laptop will often not give the browser a device OBS
  already holds; the sensor names the device it opened and says so when it cannot.

**Privacy.** A camera pointed at a crowd is not a feature to be quiet about. Frames are
analysed in the page and never leave it, nothing is recorded, and the panel says so
where the camera is switched on.

### 8. The desk: the laptop is a control surface, not the show

`src/App.tsx`, `src/components/PerformDesk.tsx` (new), `src/lib/lookFade.ts` (new),
`src/components/SettingsPanel.tsx`, `scripts/desk.mjs` (new)

The laptop screen is about ninety per cent canvas, and the canvas is the one thing the
operator does not need to look at — it is on the wall behind them, larger. Everything
they *do* need is either in a panel that has to be opened and scrolled, or not shown at
all. That was the right shape when the browser window was the show. It stopped being
the right shape the day the projector window arrived.

Two facts from the code decide how this is built.

**The render is already decoupled.** When a projector window opens it announces its
pixel size and the show window renders *that many* pixels (`setStage`); the laptop
displays that canvas scaled by CSS. So shrinking the laptop's canvas to a preview costs
the audience nothing — not one pixel. The desk is a layout change, not a rendering one.
This is the fact that makes the whole batch cheap, and it was not obvious: the obvious
reading of "mirror the canvas" is that the laptop's size is the stage's size.

**A look change is destructive.** `applyPreset` calls `clearAll()` on every layer and
reseeds. On a projector, mid-song, that is a hard cut through near-black. The
non-destructive path already exists — `adoptPreset` takes on the new dyes, styles and
liquids without wiping the plate, and the sequencer has been using it all along. What is
missing is a timed interpolation of the ~80 settings between the two looks. So the
single most valuable change here is not layout at all.

The order below is by what a show night would miss most, not by what is most visible.

**8a. Cue and Go.** Arm a preset; nothing reaches the audience until Go. Go crossfades
over a set time by interpolating the settings and adopting the dyes, never clearing.
The clearing path stays, as the thing you use when *building* a look. Plus one-step
revert to the previous look, because the fastest fix mid-show is undo.

> **Gate:** driving the app through a preset change, the stage's mean luminance never
> falls below 60% of where it started, at any frame, over a two-second fade. Today's
> `applyPreset` is the control: it should fail this, and by a lot.

**8b. Perform and Design.** Perform: a preview of the stage, and the controls around it.
Design: today's full-bleed canvas, for building looks. Perform is the default once a
projector is attached.

> **Gate:** with a stage attached, the canvas's backing store is the same size in both
> modes. If Perform costs the projector resolution, it is wrong.

**8c. The ride strip.** Six to eight controls always out, with hit targets a hand can
find in the dark, chosen by the user from `LEARNABLE_SETTINGS` — the same list MIDI
learn uses, so the desk and the controller map cannot disagree about what is rideable.

**8d. A status line that tells the truth.** What is live and how long it has been up,
the sequencer's stage and time to the next, the audio source and its level, the engine's
rung, and whether the projector, MIDI, camera and recorder are connected. Nearly all of
this is already computed and simply never shown.

**8e. Guard what cannot be undone.** *Lucky* replaces all ~80 settings from one
unguarded click, next to controls used mid-show. It gets a confirm, or a revert, or it
leaves Perform.

**8f. Legibility in a dark room.** The UI leans on `text-white/30` and 7–10px uppercase.
That reads well in a screenshot and badly at arm's length with eyes adapted to a
projection.

> **Gate:** measured over the rendered app, no actionable control below 11px or below
> 0.6 effective contrast against its background, and no hit target under 44px. Measure
> the current state first and record it, so the claim is a number rather than a taste.

**The risk worth naming.** This moves controls that someone has muscle memory for, and
muscle memory is most of what playing an instrument is. Design mode exists so nothing
is *taken away*, and the desk is judged on whether a show can be played from it, not on
whether it is tidier.

### 9. Ferrofluid after the references

`src/gpu/wgsl/plate.ts`, `src/presets.ts`, `src/presetPlate.ts`, `scripts/ferrolook.mjs`

The reference is Chemical Bouillon's ferrofluid films (frames in
`/mnt/project-files/ferrofluid-look/references/`): razor-sharp edges at any zoom, a fine
scale (fingers or cells about 1/60 of the frame, hundreds of them), thin black walls of
ferrofluid between packed cells of coloured dye, and wet gloss. Ferrofluid is the one
liquid here that *should* shine: a projected look has no speculars, because the light
comes through the liquid, but these films are lit from the front.

**9a. The edge, and two looks, shipped in #161.** The ferrofluid ends on a sharp,
antialiased line at any zoom (edge width at 1x 17.9 → 1.5 px; at 3x 4.46 → 0.40
cells), with an amber sliver inside, a bright meniscus outside and a glint that stays
with the key light. A pool is black all through. Two looks: **Ferro Maze** and
**Ferro Paint**. `npm run ferrolook`, 10/10.

What watching the lab clips of Ferro Maze, Ferro Paint and Magnet Garden found
(`/mnt/project-files/ferrofluid-look/watch/`), in the order to fix them:

- **9b. Maze detail**, shipped in #167. The maze's finger width is fixed by `MAZE_PERIOD` (0.045 of the
  plate) and comes out two to three times wider than the reference, and it coarsens
  over time. Maze Detail (0 to 1) divides the period by up to three; 0 is the maze as it
  was, bit for bit, and Ferro Maze uses 0.5. `npm run maze`: finger width 0.0296 at 0.5
  against 0.0431 at 0 (ratio 0.69). Whether it now matches the reference is for the
  Mac.
- **9c. The dye rides the ferrofluid** (**shipped**, #168). In Ferro Paint the dye is not carried by the
  ferrofluid, so the patchwork does not deform with the fingers the way the reference's
  does.
- **9d. Smaller faults.** A sub-half phase shows as brown ghost smears; Ferro Maze's
  white table clips (32 % of the frame blown); no visible pulse on the kick.
- **9e. The magnet stands it up** (this PR). Reported: "doesn't make spikes or fingers.
  It's just a big blob that gets pulled around by the magnet." The magnet's pull held a
  gathered pool round, and a full pool is stable in the maze's physics, so nothing
  broke it. Now a magnet brought up close (the Magnet tool; no look's own magnet is
  near enough) stands the pool up into Rosensweig spikes: the solver draws the liquid
  into a ring-packed field of domes round the magnet (`src/gpu/wgsl/spikes.ts`, wells
  in `phaseMu`), under a maze field the dipoles' repulsion rises across its reach, so
  the pool's outline breaks up rather than rounding, and the plate draws each dome as a peak with a star
  of light and a white point on it. On the phone every finger holding the Magnet is a
  magnet (up to four). `npm run spikes` measures it; numbers in the PR.

Open, from building 9e (in the order to do them):

- **9f. Colour between the domes.** Where the pool parts, the gaps show a thin amber
  film of ferrofluid or dye-less water, not the bright dye the references have
  between their domes: the dye was pushed out when the pool gathered. Either let the
  dye flow back into the gaps with the water, or draw the thin film clearer.
- **9g. Domes at the lab's grid.** On 256² a spike's pitch is ten cells and a dome is
  four or five across, so much of each is edge and grey. The app runs 384² and up
  where they are sharper; the Mac should judge whether 256 (the software rung and
  some phones) needs a coarser pitch.
- **9h. Thick walls in Ferro Paint and the maze.** The references' ferrofluid walls
  between dye cells are thin and even; ours still thicken where the maze coarsens.
- **9i. Fingers past the spikes.** A pool bigger than the spikes' reach (0.28 of the
  plate in radius) neither parts nor fingers at its far edge under the Magnet in four
  seconds: between glass the layer cannot thin in the middle with nowhere to go, and
  the stronger repulsion alone did not push its edge out. The references' sunflower
  (a labyrinth inside, radial fingers round it) needs the edge to go unstable under a
  close magnet: a stronger radial term at the rim, or the maze force scaled up there.
- **9j. Spikes that follow the music.** A real ferrofluid speaker's spikes jump on the
  kick. The spikes now answer the magnet's field, so the maze's audio breathing
  could drive their height too.

### 10. Playing like a show

`src/lib/phrasing.ts`, `src/lib/beatClock.ts`, `src/lib/audioFeatures.ts`,
`scripts/watch.mjs`, `scripts/film.mjs`

From the footage study of 2026-09-26: the plan page is
<https://claude.ai/artifact/UB2VSoFbA3S84yEoFPuPQX>, the notes are
`/mnt/project-files/research/light-show/footage.md` (every clip, its link and its
numbers) and `craft-and-field.md` (performers, VJ practice, the digital field).

The yardstick, measured on the footage at four samples a second:

| Quality | Real shows |
|---|---|
| Swells of motion | 1.5–3.5 a minute, peaking about 2.5x the median, rising and falling over 2–9 s |
| Composition change | every 7–10 s, without a cut |
| Scene change | every 15–30 s |
| Share of time calm | 20–40 % |
| Near-black | 30–60 % on average, ranging from 3 % to 90 % over a set |
| Hues in a frame | 2–3, one family leading, the family changing by scene |
| Motion against loudness | r ≈ 0 at the beat; about 0.4 over 20 s windows |
| Edges | two regimes: soft washes under 1 %, sharp drop and cell fields about 15 % |
| Hard cuts | none |

The last-but-one row matters for this plan's own gate: the detail table at the top was
built on macro films, which are all drop and cell field. A real show's big shapes are
soft, so `npm run detail` should judge the two regimes separately rather than ask every
region to be sharp.

The steps, most visible first. Each is one PR with its own check, and every step after
0 reports its change in the film table's units.

0. **Film every look and measure it**, shipped in #162. `npm run film` records each
   look three times for two minutes with the band in a box and writes the table above
   with our looks under the real shows' rows; `film.yml` runs it by hand across six Mac
   runners. **The first full baseline has not been run yet**: that is one by-hand run of
   `film.yml`, and every step below is measured against it.
1. **Rest, big events and darkness.** `phrasing.ts` already has the shape and measured
   why it changes nothing: small gusts on a plate that is never still are invisible. Let
   it fire the whole-frame events the app already has (a flood pour, a partial drain, a
   dye swap, a press), let the plate settle and the dimmer fall between them, and let a
   scene end in near-black. A Pacing setting whose zero keeps today's look.
   *Target:* swells 1.5–3.5 a minute, calm 20–40 %, near-black ranging across at least
   10–70 % over a set, cuts still zero. *Check:* a node harness on the phrase generator
   from a seeded run, and the film table.
   *Shipped* (#170) on the stage sequencer rather than the phrase generator, because a
   stage is already a scene: `src/lib/scenePacing.ts` plans each stage of a running
   sequence (a pour, press or dye change opening each swell, rests where the plate's clock
   drops as low as a fifth, and from Pacing ½ a slow fade to near-black at the stage's
   end, the next coming up out of it), and the plate follows it on its clock, its
   automation and its light. A **Pacing** setting (0 keeps today's show; sheet, MIDI,
   desks, phone; a stage may set it and it is put back when the sequence stops), an
   ending choice per stage, and a built-in **Light Show Night** of 22–30 s scenes.
   `npm run pacing` measures what the sequence asks for with the footage's `shape()`,
   counting a fade as the change in every pixel it is: 2.35 swells a minute, calm 25–28 %,
   swells 2.4× the median, the light under a quarter 19 % of the set, every drain in the
   dark. Whether the plate delivers it is the film's to say: film Light Show Night.
2. **Hear the song's shape live.** Presence (rising or falling action) and a slowly
   accumulating intensity from #154's bands, and from them live build, drop and
   breakdown events that choose which swell step 1 fires and how big. *Target:* a drop
   reported within one bar, none in a steady section, and motion against loudness near
   0 at the beat and positive over 20 s. *Check:* synthesised songs with known builds.
   *Heard* (the first half, this PR): `src/lib/songShape.ts` listens to the bands in
   decibels (new on each reading, `AudioReading.db`, because the 0..1 values are fitted
   to the last twelve seconds and a long breakdown reads as loud as the drop by its
   end) and reports builds, drops and breakdowns live, with a section, a slow
   intensity and a rising-or-falling action. The desk's status line and the phone's
   Sound sheet show it, and sound learn can bind a trigger to each drop, build or
   breakdown. `npm run shape` (in Measure) plays it songs from
   `scripts/arrangement.mjs` whose sections are known to the sample: every drop heard
   within one bar (median 0.03, latest 0.53), none anywhere else, builds before their
   drops, breakdowns within four bars, a bar of silence before a drop not costing it,
   nothing in two minutes of four on the floor or of a rock beat whose fills take the
   kick out for two beats, the same at 30 fps and 20 dB down, a real two-to-four-second
   gap between songs heard as quiet, and nothing at all on the shelf's ambient tracks.
   A build needs the beat to have come in first (the kick hitting four times in four
   seconds): before that rule the shelf's swells read as builds two or three times a
   minute.
   *Followed* (the second half): **Follow the Song** (`songFollow`, 0 to 1, default 0)
   plays a paced scene to what is heard. A drop opens a swell on its own tick with the
   stage's opening move, up to half again bigger, and takes out the planned swell it
   replaces; through a build and a breakdown the planned swells wait (up to 24 s), the
   plate winds up with the build and settles lower in a breakdown. At 0 the scene is
   bit for bit the scene with no song, and at Pacing 0 the plate is today's. It is on
   the desk's Pacing section, the remote, MIDI (Follow the Song), and the phone (the
   Sound sheet, beside the song's line; the Play sheet gained a Light show tile, since
   Pacing had no way onto the phone before). `npm run pacing` plays Light Show Night
   against five synthesised club songs through the real analyser and tracker: motion
   against loudness over 20 s windows 0.34 to 0.40 at Follow 1 (Follow 0 on the same
   songs −0.17 to −0.02; the one live show 0.40), and at the beat (a two-second
   running mean taken out of each) 0.05. Each drop is held to the rule: over four
   nights, and three awkward songs on one long scene (a breakdown the beat returns
   out of, one the song ends in, a 32 s build), 62 drops opened a swell of the
   stage's opening move at the promised gain, the plate reaching 0.90 of its top at
   worst within 2 s, and 18 were let go, 12 in a dark ending and 6 within 4 s of a
   swell. 26 planned swells came due in holds and none fired there; each arrived
   within half a second of its hold ending (5) or of the 24 s cap (4). With Pacing
   pulled to 0 mid-scene through a breakdown, build and drop, the scene that comes
   back is the one with no song, tick for tick. The app builds the cue with
   `songCueFrom` (scenePacing.ts), the function the check plays and tests.
   Found on the way:
   - A drop in a scene's dark ending is let go (12 of Light Show Night's 60 in the
     check, one in five): the light is going down and the next scene comes up with its own move.
     A show following a song might rather cut the dark short on a drop and come up
     with it; worth judging on the Mac with a real track.
   - Over 1 s windows the proxy's motion-against-loudness reads 0.26 to 0.29, the top
     of the footage's range at the beat, because the proxy has no beat-level motion of
     its own and a second's mean is mostly the section. The plate's own motion adds
     that noise; `film.yml` with a song playing is what measures it.
   - The swells run at 3.2 a minute following the song, against 2.4 without;
     inside the footage's 1.6 to 3.7, near its top.
   - The tracker hears the beat coming back after a breakdown as a drop (0.75 on the
     check's verse after a breakdown), so the scene throws its big move there too.
     Right for a club track; a band coming back from a quiet verse may want less.
   - A scene that comes up out of the dark while the song builds holds its opening
     move until the build ends: it comes up lit and still. Worth judging on the Mac.
   Found on the way, not yet fixed:
   - A build is recognised about halfway in, not at its start (a short one later: the
     club song's four-bar second build at 65 %): the hats leave before the riser has
     climbed far, so the top end falls before it rises, and the climb has to show in
     every third of six seconds so a fill's two-beat jump is not one. A build that
     starts by taking the beat away is heard as a breakdown for its first bars. Onset
     density (a snare roll doubling) would catch it earlier.
   - A song whose first build comes before its beat has ever played (intro straight
     into a build) is heard from its drop: builds wait for the beat.
   - The kick onset reads a fast snare roll's 200 Hz body as kicks: in the club song's
     build, 32nd-note snares fired `kick` three to five times a half-second. Sound learn
     on the kick fires through every build.
   - Nothing on the shelf has a beat: its four tracks are ambient, so the tracker is
     measured on synthesised songs only, and on the shelf only for not inventing drops
     or builds (none now). A CC-licensed dance track with known sections on the shelf
     would let the check hear real drops.
   - Quiet is thirty-five decibels under the song's loudest, a guess for a room: a
     noisy club between tracks may never fall that far, and then the next song's
     intro can still read as a breakdown of the last. Worth measuring on a recording
     from a gig.
3. **Choose the accents.** Beat squeeze and plate rock fire on every kick. Let the
   performer pick downbeats, every other bar or fills only, vary the depth a little as a
   hand does, and pull a hand-played press onto the predicted beat. Needs a real
   downbeat, which #155 does not have yet.
   *Shipped 2026-09-27* (#184, **Accent the One**, `beatAccent`, 0 to 1, default 0): a bar grid
   (`lib/barGrid.ts`) hears the beats from the readings' onsets and which is the one
   from the harmony moving, the backbeat and the kick, the evidence kept beat by beat
   across the song and only trusted past a mark a bar-less loop never reaches. Each
   kick's squeeze and rock are then weighed by its place: the one at 1.25, three at
   0.4, two, four and the "and" let go at full, the one after a fill at 1.5. Where the
   grid knows only the half bar (the backbeat, not yet which strong beat is the one),
   one and three keep their press and two and four lose it; where it knows nothing,
   every kick is 1. Settings → Show, MIDI, the desks, the remote, a sequence's
   stages, and the phone's Sound sheet with a line saying what the grid hears. The
   squeeze's weighting reaches the plate since Beat Squeeze does (step 4's found
   items); until then only the rock's showed.
   *Check:* `npm run downbeat` (90): on eight synthesised songs, a real beat within
   70 ms on every tick of every groove, at the song's tempo within 2 % on 1326 of 1326
   ticks; no kick but the one ever called the one (0 of 528, 519 of them placed); the
   one known for 78 % of the groove's ones (rock songs 75 to 100 %, four on the floor
   49 to 88 % on sixteen-bar sections, where the half bar carries the rest: two and
   four softened 98 %); every kick weighed exactly what its place says (the one 1.25
   on 159 kicks, three 0.4 on 155), the one after a fill 1.5 on 32 of 32 fills (12 club,
   20 rock); a pulse and three loops with no bar (118, 126, 132) never placed, on a beat
   they do hear; the same at 30 fps, 20 dB down and on the page's clock (every
   estimate the same); fuzzed onset streams never name a tempo outside 69 to 185 bpm
   and always return; an estimate's median 0.5 ms, 99th percentile 0.5 ms; the accent
   at 0 leaves every kick at exactly 1, 933 of which the accent at 1 moves. The sure
   mark is 2.2 (it was 2.6, set over a loop whose bass played a pickup into every one,
   a bar cue; without it the loops reach 1.65 at worst). Mended on the way: the
   tempo's refinement between bins was unbounded on a flank (393 bpm named in a song
   at 128; a fuzzed stream hung the render loop), and the bins moved with the clock's
   rounding. Not yet seen on the plate: the app's frames cannot be read in a cloud
   session.
   *Found while building it, not yet done:*
   - **The rest of the step is not built.** The one (and the one after a fill) is; the
     other accents the step asks for are not: *every other bar* (the grid knows the bar,
     not yet the pair of bars), *fills only* (the fill is heard, and could be the only
     press), *a hand's variation* (the depth varied a little from press to press), and
     *a hand-played press pulled onto the predicted beat*.
   - **Above about 148 bpm on four on the floor the grid hears half tempo** (75 to 87
     bpm) and is almost never sure of the one (0 of 172 estimates at 160, 31 of 184 at
     150). It fails safe, every kick 1, but no accent reaches DnB or fast techno; the
     check's songs stop at 140.
   - **Four on the floor's one is slow to come.** With the kick on every beat and a
     chord a bar, only the chord tells the one from three: on sixteen-bar sections
     the grid is sure of it 49 % of the time at 90 bpm, 82 to 88 % faster (a third of
     the time on the eight-bar sections the check had first). A crash on the one and
     the phrase's changes are evidence the grid does not use yet; the bass line's
     pickup it hears only as the harmony moving (a loop with one reached a t of 2.6
     on it alone).
   - **The sure mark rests on three synthesised loops.** 2.2 stands a third over their
     worst (1.65). A real bar-less track (a DJ tool, a techno loop with a drifting
     pad) may reach further; a recorded one on the shelf would say.
   - **Half tempo, now and then.** Club 140 names 70 bpm on 2 of its 181 settled
     ticks (the check holds 95 %); the weighting toward 120 is an octave and a bit
     wide, and 140 is near where its double and half weigh alike.
   - **A new song after a gap finds its one late**: bar 14 of its groove, against
     bar 7 heard alone. The old grid is held four seconds before it is let go, and
     the new one then gathers from nothing.
   - **No recorded song has been counted.** Nothing on the shelf has a beat; a
     CC-licensed rock track and a dance track with known bars would let the check
     hear real ones.
   - **Sound learn's "Each bar" still counts from the clock's lock**, the one a
     quarter of the time; it could fire on the grid's one instead.
   - **The beat clock fires on through a fill on its own prediction**, which hides the
     fill from the accent's "after a fill" in the app (the check hears the kicks
     themselves).
4. **Press smooth, lift into fingers** (roadmap G). A squeeze gives a smooth ring and a
   lift breaks into fingers; today both finger. *Check:* finger count round the ring,
   low on press and high on lift, in the lab.
   *Built 2026-09-27* (lib/squish.ts): a press is round by construction (the film thins
   evenly, the centre clears, the dye stands up in a round rim), and remembers itself;
   150 ms after it lets go the glass comes up for a second and a bit, and the spokes the
   press used to draw on the way down now come in from the rim, the gap opening along
   them and the liquid drawn back toward the centre, as deep as the press went (a tap a
   tenth of the way down lifts a third as hard a step as a held hand, and on the plate
   that is a faint ripple at the spokes, too faint to count fingers). Each press lifts
   on its own: two fingers on the phone, one let go while the other holds, and the one
   let go lifts where it was; the pad's held press keeps pressing while held still.
   Fingering 0 is today's plate
   exactly; a drop's splash keeps its fingers on the way down, drawn exactly as before.
   On the phone Fingering is on the Press tool's own Amount. *Check:* `npm run lift`:
   held, the film under the palm has no angular structure (contrast 0.000, the stroke
   drawn before 0.041, in spokes at its own angles); let go, at the default look's gap
   spring, the dye round the rim goes up and down 0.073 of its level in 15 fingers,
   sitting at the lift's spokes (correlation 0.92, 0.16 for the spokes turned a few
   degrees), and at the fastest look's 0.078 in 10; the gap's spring alone makes 0.0026
   of it at the spokes against the lift's 0.067; a one-frame tap lifts at 0.004. The
   lift brings the glass back to rest and never past it: the shader caps an opening
   there (uncapped, 0.081 against a rest of 0.030). 25 checks. Waiting on the owner's
   eyes on a real GPU (judging.md 15).
   *Found while building it, not yet done:*
   - **Beat Squeeze has never pressed the plate. Fixed (shipped with this item's fix
     PR, the owner's call on 2026-09-27: "Fix it tonight").** Its centre was
     `GRID_SIZE / 2` plus a random fraction of 30 cells, never rounded, so every cell
     index `squishDisc` reported was fractional, and a Float32Array drops a write at a
     fractional index without a word: the rhythm plate every Fillmore description
     promises was the plate rock alone. Every stroke now lands on a whole cell
     (`applySquish` and `squishDisc` both round). Rounding alone would have floored
     the lead plate: a kick pressed and nothing let it go but the gap's spring (the
     glass half way back in about 24 s at the default look, 50 on the Fillmore's):
     at 140 bpm with the bass at 0.7, 100 % of the pressed disc is on the floor after
     40 s on the Fillmore's glass (`npm run lift`; a one-off run at 120 bpm put the
     default look at 93 % and Soap Film at 76 %).
     So a kick is held for the lift's pause (0.15 s) and its gap given back over a
     third of a second (`KickRelease`, lib/squish.ts): 0 % on the floor, the mean back
     at rest, each kick still pressing the film under it to 0.0255 to 0.0258 a tenth
     of a second after it lands. *Check:* `npm run lift` (a kick lands on whole cells, all 319,800 of
     its writes kept, where with the rounding taken out none are; pressed and never let go at 140 bpm the disc floors,
     let go it stays at rest on no spring, the Fillmore's and the default look's
     glass, and at half the step rate); `npm run squeeze` in the app on the Mac shard
     (Fillmore East with the band, on a beat tapped in at 130 bpm: the kicks press
     the lead plate as deep as the look's squeeze, each is let go, the gap given back
     over the run is the depth pressed, and at Beat Squeeze 0 nothing is pressed;
     tapped since the #190 deploy, next item). Both count what the code
     hands the plate, on the CPU; neither reads the GPU (next item). Every look changes with music
     playing; waiting on the owner's eyes (judging.md 15).
   - **The show hears a quarter of the simulated band's kicks, or fewer, on the Mac.**
     The band plays four on the floor at 122 bpm, two kicks a second, outside its
     break. `npm run squeeze` counted the kicks the show heard on the Mac shard: 6 in
     12 s and 9 in 12 s on #192's run, and on the #190 deploy (main, 2026-09-27) 3 in
     45 s at Beat Squeeze 0.9 and 6 in 42 s at 0, the plate stepping at the same rate
     both ways (898 and 805 steps). That run failed the deploy, since the check then
     asked for 5 heard kicks; it now taps its beat in, so it asks the press and not
     the ear. The ear is still open: whether the onset (bass over 0.45 from under
     it, `beatClock.ts`) misses kicks the bassline holds the level over, whether a
     main thread busy enough to step the plate 20 times a second leaves the band's
     25 ms scheduler late past its 0.12 s lookahead (a note scheduled in the past
     plays its envelope already over, so silent), or both. Every beat ride reads
     these kicks, so a band the show hears one kick in four of is a quarter of the
     show. *Check to write:* heard kicks against the kicks the band played, in the
     app on the Mac, logged by section.
   - **A check that reads a kick's press on the GPU.** `npm run squeeze` counts the
     cells and depth the kick hands the plate and the gap its release gives back, on
     the CPU: a regression in the upload (the plate not marked dirty, the flush
     skipped, `squeezeUpdate` ignoring a delta) would pass it. The Mac reads back the
     velocity (`rbVx`, `rbVy`); the outward flow round a kick's centre a frame or two
     after it lands, against the same seconds at Beat Squeeze 0, would say the press
     reached the solver. (The hand's press goes up the same path, and the Mac's tool
     checks read that.)
   - **A kick dirties the plate for about half a second.** With Fingering up a
     kick's press is remembered and lifts for over a second, and its release lays a
     third of a second; on the Fillmore with a band the lead plate is marked dirty,
     a full delta upload, on most steps. Nothing measures the frame cost yet; worth
     reading on the Mac's frame timings before a show.
   - **Whether a kick's press should show more.** Held and released, a kick at the
     Fillmore's squeeze thins the film under it by about a seventh (0.030 to 0.0255) for
     a tenth of a second; the ring it spreads is the flow the shader derives from
     that. If it reads too faint on the Mac, the press can go deeper now that it no
     longer adds up (the 0.0024 a disc was doubled when the press laid nothing, so
     it was never judged by its own look).
   - **The lab's glass is forty times springier than the app's.** BASE's `gapSpring`
     is 0.02 a step; the app derives it from dt and Plate Spring, 0.00048 at the
     default look (the glass half way back in about 24 s), 0.0080 at the fastest look
     (Lacing Run), 0.00005 at the slowest (Lumia). A lab check that presses or lifts
     measures a glass no look has unless it passes the look's spring (`npm run lift`
     does now); the others that touch the gap (`straw`, `physics`) should be read with
     that in mind, and a lib function shared by the app and the lab would keep them
     from drifting apart. The spring is not all of it: the app's dt (0.00107 at the
     default look, against the lab's 0.004) and its gap memory (0.99665 a step, where
     the lab's forgets dh/dt at once) differ too. With all three, the lab's held press
     drove the dye out of the whole ring before any lift (its mean 0.069 against the
     0.5 laid), so `lift` passes the spring only; whether the app's plate empties a
     press's ring like that is for the Mac.
   - **At the default look a press stays down for tens of seconds.** Half way back in
     about 24 s is a long time for a hand on glass; worth judging on the Mac whether
     the glass should come up faster by default (Plate Spring).
   - **The Fillmore East sequence's Sunburst stage leans on Beat Squeeze** (1.0, with
     Fingering 1.0): with the squeeze reaching the plate, each kick now lifts with a
     faint ripple at the rim's spokes (a tap's lift, 0.004 in `npm run lift`), and the
     big sunburst still comes from a hand on the Press; a kick's lift strong enough to
     read as the sunburst is a plan item for after the owner has seen it. Its
     description says the dish is pressed on every kick again. Judge it on the Mac.
   - **Stroke centres are not checked to be whole cells anywhere. Done:** `squishDisc`
     and `applySquish` round every centre now, so the next fractional caller lands on
     the nearest cell instead of laying nothing (`npm run lift`).
   - **The fingers are drawn, not grown.** The lift lays spokes from the CPU as the
     press did; the solver's own squeeze flow is still symmetric in the sign of dh/dt.
     An instability in `squeezeUpdate` keyed on a rising gap would let the fingers'
     spacing come from the film's thickness, as roadmap G asks.
   - **A pressed disc comes out octagonal in the lab** (an even press on an even
     plate): some grid direction in the squeeze solve, cause not yet looked for.
   - **The lab's finished picture of an off-centre point is not at that point.** A
     ring drawn round the press's cell in `lab.render` found none of its fingers
     (correlation −0.06 against −0.97 in the dye, and no flip or transpose above 0.23),
     so the plate shader's dish and lens framing moves it; a check that reads the
     picture off the centre needs that map first.
   - **Fingering had no way onto the phone** before this (now on the Press tool's
     Amount); the other Show-sheet plate controls (Beads, Cells, Lacing) still have none.
5. **Oil and water that stay apart** (roadmap §I). Liquids as bodies with interfaces,
   with the ferrofluid phase as the precedent. The biggest difference in every frame,
   and the largest piece of work here; prototype in the lab first.
   *Shipped 2026-09-27 for oil and water* (#179, Oil Bodies, on in Oil & Water): the oil
   carries its own share of the dye, so amber oil on teal water stays two colours
   as the drops round, merge and are dragged. *Check:* `npm run bodies`. Waiting on
   the owner's eyes on a real GPU (judging.md 14).
   *Found while building it, not yet done:*
   - **Only oil is a body.** Silicone lands in the same oil field; soap, milk, ink and
     the other bottles are still properties that blend. Each immiscible pair wants
     the same treatment (roadmap §I, and batch 4's liquids).
   - **Oil on Water with Oil Bodies at 0 still loses colour.** The rebuilt tension
     took a settled drop from 41% to 88% of its dye kept (86% still inside it), but MacCormack still drops
     the rest; the flux transport Oil Bodies uses keeps all of it. Worth trying the
     flux transport for any look with oil, bodies or not, and measuring the cost.
   - **A seam inside freshly merged bodies** lingers for a few seconds in the lab
     (each drop's old rim). Judge it on the Mac; if it reads as a drawn line, blend
     the oil's own colour faster where two bodies have just joined.
   - **The cost is untimed.** Oil Bodies adds a transport, four partition passes, four
     blurs and a landing pass to every step of Oil & Water; `npm run stages` on the
     Mac gives the number.
   - **The lab's default diffusion (1e-4) is harsher than Oil & Water (0).** Checks
     of the dye near oil should set the look's own diffusion, or say why not.
   - **Oil poured in the first seconds of a show may stall a frame.** The bodies'
     six kernels, like the oil's surface tension before them, are built behind the
     show (about fifteen seconds after it opens on the Mac), because no look runs
     them until oil is poured and `npm run startup` holds the opening to what its
     first steps use. Oil poured before they are ready builds them on that frame.
     A check that pours oil at once in Oil & Water would say how long it stops.
6. **A plate that lives on its own** (roadmap S2, heat and boiling). Blocked on heat
   having a strength.
7. **Layers at their own speeds** (roadmap Stage 4, the rig). A slow wash, a drop field
   and a streak layer, each at its own speed, added as light.

Small things that ride along with the steps: drops with a coloured rim lined up in
chains along the flow (with batch 3), letting the dish rim show now and then as a phrase
event, and one big organiser over a field of small drops at about a 10:1 size range.

### 11. The mixer

`src/lib/mixer.ts`, `src/components/MixerPanel.tsx`, the display pass in
`src/gpu/wgsl/plate.ts`; the design is [docs/rig-plan.md](docs/rig-plan.md) R7.

Asked for directly on 2026-09-27: "a video mixer control available from the top level
but also in the settings, that can move the order of layers (LED spinning, video,
picture, any other image input) and control brightness, contrast and the other photo
and video standards on each." With it, a standing rule: every feature ships its phone
version in the same PR (see the operating rules below).

1. **The sources there are, in one stack**, *shipped* (#176). The LED ring, the front
   and back plates, the film and the logo, top of the list on top on the wall; the
   front plate fixed, and only the LED ring passing it (the lamp under the glass, or a
   beam over it). Each row has a level and a grade (brightness, contrast, saturation,
   hue). On the Perform desk (docked beside the plate, no scrim), in Settings → Mixer,
   on the phone's Mix sheet and on the remote; every control MIDI-learnable and
   pinnable, four pads to walk a source up the stack. At the defaults the picture is
   byte-identical to before. `npm run mixer` measures it (31 checks, each held red
   against a broken shader). **Owed:** the Mac look in `docs/judging.md` §13 (the film
   between the plates, the LED beam, whether 0–200 % is the right travel).
2. **The other pictures as rows**, *shipped* (#189). The lumia and the gel wheel
   were each still set in their own corner of Settings (the camera already comes in
   as the film). Each is now a row with its level (Lumia and Gel Wheel, the same
   settings) and its own grade. With the LED ring they are the lamp's three, the
   only rows that can go under the front plate, built bottom up into the light the
   glass is lit by; raised over it, the lumia is a beam screened over the plate and
   the gel a filter on the lens, which colours what is under it in the stack and
   leaves black glass black. Every order saved before keeps its picture (the two go
   in under the front plate, where the shader always drew them), and seven scenes
   rendered on main and on the change are the same to the byte. Two more pads
   (Mixer: Raise Gel Wheel, Raise Lumia). `npm run mixer` 44/44, each new check held
   red against a broken shader. **Owed:** the Mac look in `docs/judging.md` §13 (the
   gel's 1.5 gain over the lens; the lumia as a beam).
3. **A blend per row**, *shipped* (#193). Every row but the front plate keeps the
   way it always came in as Own (the beams screened, the gel a filter, the film
   through the dye, the logo by its alpha, the back plate by its Blend Mode) and can
   be set to Screen, Add, Multiply or Key instead, in its Grade drawer; a row off
   Own says which in its tag. R3's additive light made a choice. Everything starts
   on Own, and the seven scenes of step 2 render the same to the byte. Six pads
   (Mixer: Next Blend, per row). `npm run mixer` 60/60: each blend on each row,
   the lamp's three included, is its formula pixel by pixel (within 1 step of 255,
   the nearest other formula 4 to 42 steps away); the logo's clear margin stays
   clear; on paper the back plate is still lit as a photograph and blended after;
   the post chain's finish is told the logo's blend; and the checks were held red
   against seventeen broken shaders. Key keys at Film Key on the film and at its
   default elsewhere. `npm run phone` presses every row's blend and holds each
   row's name whole beside its tag. **Owed:** the Mac look in `docs/judging.md` §13
   (the key's edge on a real film; Add over a bright plate). The front plate has no
   blend: it is the glass the rest is laid on.
4. **Crossfade a row**, *shipped* (#195). Each row has a Fade button beside its level
   that takes it out over the row's fade time and brings it back to where it was (a
   film at 40% comes back at 40%); pressed while it runs, it turns round from where it
   is, in its share of the time; a fader moved during a fade stops it there. The fade
   time is in bars, in the row's drawer (0 to 8, 0 is a cut, two bars to start),
   counted at the tempo the desk sends or taps, else the one heard, else 120. Seven
   pads (Mixer: Fade In/Out, per row), each fade time MIDI-learnable; the desk,
   Settings, the phone's Mix sheet and the remote all have the buttons. `npm run
   rowfade` 48/48 drives whole fades at the show timer's 16 ms: no step past the
   curve's steepest (0.0024 on a four-second fade from 0.4), at rest at both ends,
   on time, the turn-round, the hand, the cut, a Go during a fade on every row, the tempo the bars
   are counted at, and the wiring; held red against twenty broken fades. A song's glide
   of a level, and a sequence stage's writes, stop a take on it, as a hand does; a
   new look forgets where its gel and lumia were taken out from; the remote's
   buttons light from the display's state. `npm run phone` presses the front plate's
   button on a phone and reads it walk to 0 in 3.8 s over 41 levels, turn round and
   come back. Found on the way and fixed here: a Go laid each step of its fade down
   whole, the room's settings as they were when it was pressed, so a film taken out
   (or a fader ridden) during a Go flickered back once a step; the look fade now
   keeps the room as it is (`keepRoom`), and a take on the gel or the lumia pressed during
   a Go, whose levels the look also sets, is the take's to the end of the Go (`lookStep`;
   the Go undid it, 63 steps back up, before). **Owed:** the Mac look in
   `docs/judging.md` §13, and a film coming in from a pad filmed by hand
   (`film.yml`) to show no hard cut in its motion table.
5. **The mixer on a narrow desk.** At 1024 px the docked sheet covers half the plate.
   A compact layout (the level column only, the grade opening over it) when the window
   is narrow. *Check:* layout at 1024/1280/1440, the plate at least two-thirds
   uncovered.
6. **A row per projector** (rig-plan R1). Once a rig has more than one live plate,
   each projector's plate is a row, with its own grade at the projector's scope (R2).
   This is the large one; it waits on R1.

Found while shipping step 2, not yet done: #189's deploy (main 41ad65e) went red on
the Mac show shard's `qa` at two checks that passed on the same tree in the PR's run an
hour before: "the plate, not the hole, takes the pointer" (the cursor over a DIV at the
desk's preview) and "the run completed" (`__cgFrame` returned null in the look-fade
colour section), with "requestAdapter did not answer in 10s" in the console. Neither
touches the Mixer; the second looks like the adapter going away under the run. Worth a
`qa` guard that says "no frame" rather than throwing, so the run goes on to the checks
after it. And #193's first show shard died before any test ran: the runner could not
resolve github.com at checkout.

Found while building step 4. Changed here, for Steve to confirm: Back reverts the
look and whatever of the room the change itself moved (Lucky's roll of the
microphone's Sensitivity and Bass Boost), but no longer the room's settings the hand
changed after it (the film's level, the Mixer, the dimmer), since each step of a look
fade keeps the room as it is now; that is RIG_KEYS' own rule, but Back used to undo a
film's level changed after the Go. If Back should undo those too, it wants its own
path rather than the look fade's. Not done here: a take pressed during a Go wins over
the Go for that row, but a hand on the gel wheel's or the lumia's slider during a Go
still does not (the Go's next step puts the look's level back), and inside a sequence
a take on the gel or the lumia during a stage's glide is stopped by the glide's next
tick, as a hand's is (the button lights once and nothing moves). The rule a Go now
keeps (a later press wins, to the end of the change) would settle both.

Found while building step 3, not yet done: the logo darkens what is under it by up to
8 steps of 255 in the pixel or two where its card meets its clear margin, on its own
way in as much as any blend, because its texture is filtered with its colour not
premultiplied by its alpha (`npm run mixer` stays two pixels clear of that edge).
Premultiplying on upload would take it out. And once, in a cloud session,
`npm run phone`'s "spreading them zooms in by as much as they spread" read 4.00× →
5.60× (1.40 times, 3.40 wanted): the zoom followed the first of six finger moves
(50 → 70 px) and none after. It passed on the next run (3.40) and on every run before;
the Mix sheet is shut by then. Worth reading whether a touchMove can be dropped while
the page is busy. Seen again building step 4: three runs in seven with `PW_WEBGPU=1`
(1.40, 1.40, 3.00 times), on step 4's tree and once on step 3's. Sending the move the
pinch's once-a-frame throttle holds back when the frame is up, instead of at the lift,
did not stop it, so the later moves seem not to reach the pinch at all (inferred, not
measured): the touch listeners' cleanup drops the pinch, and a plate rebuilt mid-pinch
would do exactly this.

Found while building step 1, small and not yet done: the remote's Mixer has no check
of its own (`npm run phone` drives the phone layout, not `?remote=1`), and on landscape
phones narrower than about 800 px the dock's tools fall under the 48 px target (about
770 px before the Mix button took a slot; `npm run phone` holds 812×375), so a two-row
landscape dock is owed for the smallest phones.

Three Mac checks went red once each on commits that did not touch them, one per run,
while this batch's plan was going in (#177), and no cause is known yet:

- `npm run phone`, "two fingers holding Drop lay dye under both": A 62 against B
  181, 0.34 of each other where the check asks 0.4 (0.63–0.99 over the nine other
  runs that have it). Not the plate coasting: the line now prints how far the
  fingers' cells moved between picking and holding, and it read 0.0 on the next
  run. Look next at the held Drop's drops (`dropHeight`), which land every
  DROP_EVERY steps with a splash.
  **Again on #186's deploy (5831ff7, 2026-09-27 12:34Z), where it stopped the
  deploy:** A 234 against B 81, 0.35, the mirrors clear (0/0/0 and 2/0/0), the
  fingers 0.0 cells from where they were picked; the same shard passed on all four
  of #186's own runs. It is not one finger: the first time A was the low one, this
  time B. With two failures now at 0.34–0.35 and nine to thirteen
  passes at 0.63–0.99, the split is bimodal, which reads like one finger's drops
  landing a beat later than the other's in the window, not noise round a mean.
  (#186 changed where a press lands; the held Drop's splash lands on whole cells
  already, so it lays the same as before.)
- `tools.mjs`, "Blow held still blows a bubble": the straw blew 0 bubbles, on the
  run after, where every other shard passed.
- `npm run startup`, the same check, a second kind of stop: on #186's run on 1f627f3
  (2026-09-27) the frames stopped 2.22 s from 1.34 s, *before* the device was given
  (asked at 0.53 s, given at 3.50 s; the first step at 13.61 s), where the check
  names the stop at the GPU's start as a separate 0.30 s from 1.04 s. The same app
  passed the shard on the commit before (40dee25; only a check script differed).
  Not #181's stop (that one sat a quarter second after the first step). Worth
  measuring what the page does while Chromium creates the device (the table shows
  no frames counted between 0.77 s and 3.48 s), and whether 4b should own every
  stop before the device is given rather than only the first.
- `npm run startup`, "no stop in the opening, or while the rest was built behind
  it": **fixed in #181.** It was not a flake and not the deploys: every Mac run since
  #164 (37 of them, PR and deploy alike, medians 1.37 and 1.39 s) stopped the frames
  for 1.0 to 2.4 s a quarter second after the first step, longer on slower runners,
  and the three deploys that went red (2.43, 2.02, 2.03 s) were the slow ones. The
  cause, measured by timing each submit the GPU was handed: the first draw with the
  plate's render pipelines on a new device took the GPU 1.42 s, and the same draw a
  few frames later 0.03 s. Not a compile (warm openings stopped as long), not the
  canvas, not the fields' memory (a bare page writing all 75.8 MB stopped 0.08 s),
  not the builds behind the show. Each render pipeline built ahead now draws once
  behind the starting frame (`gpu/kit.ts`, firstDraw; only the half the show opens
  with, since the half built behind a running show would pay the same cost under
  it): the plate's first draw took
  0.14 s, the opening's longest wait for a frame fell to 0.82 s (not at the first
  step), and the forty warm openings' median stop from 1.08 s to 0.12 s. The 2 s
  limit is unchanged. `npm run startup` now prints the submits the GPU spent longest
  on round the first step, so the next stop of this kind names itself. Found on the
  way: on a slow runner the control's own freeze ended right at its twenty-second
  watch, so it read as never moving and check 1b failed on the control; the opening
  is now read at least to when the plate was seen running, and 1b asks the control
  to have run steadily at all.
- Still owed from that hunt: the solver's first submits cost a few tenths of a second
  more than later ones even with every compute pipeline dispatched once ahead on
  scraps (downsample 0.32 s, upsampleDelta 0.40 s, run 36306162647). Worth finding
  whether a one-workgroup dispatch on one-texel scraps reaches the cost at all.
- `tools.mjs`, the Finger's "and adds none": red on 4 of about 20 Mac runs across
  four branches on 2026-09-27 (53 → 66, 56 → 71, 50 → 64, 49 → 64, where the plate
  left alone drifted −22 to −12 before and +8 to +10 after), green on the rest,
  including gains as large (61 → 81 against +1 and +8). What differs on the red runs is
  the drift before the stroke, negative every time, so the margin read off it looks
  like the thing to read first; nothing measured yet says why.
- `magnet.mjs`, "dragging the Magnet gathers the ferrofluid along where the hand
  goes": on #180 (PLAN.md only, the same code #179's PR and deploy passed), the drag
  gathered 300 → 363 against 266 → 300 left alone, a gain of 29 where the check asks
  a tenth of 300. It asks the gain against what was there, on a hand path drawn at
  random each run, so a run whose best spot starts full reads low; worth reading
  the gain's spread over the last runs before touching its tenth.
- `mirror.mjs`, "Classic, calm, layer 1: and nowhere else": on #189 (the Mixer's gel
  and lumia rows, whose default picture renders the same to the byte as main's), 16.3
  past its drift at the hand's left/right mirror cell against an allowance of 16.1.
  The cell's drift climbed drop by drop (3.2, 5.9, 18.3, 49.5) and its change with it
  (5.0, 10.0, 46.8, 78.4): a region starting to move by itself mid-run, the case the
  check's own comment says it gives up. Over the seven Mac runs before it the same
  line read 2.1 to 9.1 against allowances of 8.3 to 36.4, at most 63 % of it. Worth
  asking whether a drop's drift should be read on both sides of the drop, so that a
  region starting up is in the drift and not only in the change.

## Not doing

- **Kaleidoscope, tiling, tunnel, halftone, posterize, solarize.** Warps of a picture.
  They are what every VJ tool already offers and they would erase the plate's identity.
- **A built-in drum machine.** Reacting to a synthesized beat is fine for rehearsal,
  but you perform with a band, and the music file player already covers practice.

## What comes next

Batches 5 and 6 were the ones that mattered most, and the seeded generator was the
hinge between them. The generator, the render and sound learn are in; batch 5's shutter
and look link are not. The order from here, as of 2026-09-26:

1. **Batch 10, the film.** Step 1, rest, big events and darkness, shipped in #170.
   Run `film.yml` by hand for the first full baseline, and film Light Show Night with
   Pacing up: the harness measured what the sequence asks for, and only the film can
   say whether the plate delivers it.
2. **The rest of batch 5**: the look link and the shutter are independent of
   everything else and can be built while the Mac is judging a look.
3. ~~Batch 9c, the dye rides the ferrofluid~~: shipped in #168.
4. **Batch 11, the mixer**: step 1 shipped in #176 and waits on its Mac look
   (`docs/judging.md` §13). Steps 2 and 5 are small and independent; step 3 is the
   next that changes what a show can do.

Batch 10's step 3 (accents) is built (Accent the One, `npm run downbeat`) and waits on
the owner's eyes on a real GPU. Batch 3 (#163) and the startup
freeze (#164) have shipped.
Batch 10's steps 4–7 are larger and map onto roadmap items (G, §I, S2, Stage 4);
pick them up from `docs/roadmap.md` now that step 1 is in.

## Operating rules

- A sandbox has no GPU worth the name, so a WebGPU fallback adapter classifies as
  `software` and gets one 256² rung. Every look is still judged on the Mac's GPU before
  the next batch starts.
- One Mac session at a time, committing from a worktree, never while a show is
  running: two sessions in one checkout have already trodden on each other's server
  and files.
- Every new setting is MIDI-learnable, reachable from the phone, and defaults to the
  current behaviour so a preset made today still looks the same tomorrow.
- Every feature ships its phone version in the same PR, not after (Steve, 2026-09-27).
- This plan is kept current: every PR that ships a batch step marks it shipped here,
  and anything found along the way that should be fixed or added goes in as an item,
  in the batch it belongs to or a new one (Steve, 2026-09-27).

## 12. ChromaGlass in the App Store and Google Play

Asked on 2026-09-27: "What would it take to create an Apple iPhone app and put it in
the store?", then "expand on this idea with the Android store". Nothing is built. The
full iPhone write-up, with a table of every browser feature the app leans on, is in
the project files (`iphone-app/iphone-app-plan.md`); this is the plan.

**The shape.** Neither store needs a rewrite. The show is one web build, and both
stores take a thin shell around it, but not the same shell, because the two phones'
web views differ in what matters here:

| | iPhone | Android |
|---|---|---|
| Shell | Capacitor: the built site **bundled** in the app, drawn by WKWebView | A Trusted Web Activity (Bubblewrap): the **live** site in full-screen Chrome |
| WebGPU | iOS 26 (iPhone 11 and newer), Safari and WKWebView alike | Chrome on Android 12+, Qualcomm and ARM GPUs; the app's "needs WebGPU" screen covers the rest |
| Web MIDI | None in WebKit; a CoreMIDI plugin later | Chrome has it, so USB controllers work from day one |
| Record and Render | A web download does not save in a web view: route to the share sheet or Photos | Chrome downloads as it does now |
| Updates | A new App Store build each time (guideline 2.5.2: no downloading code that changes the app) | Every deploy to `main` reaches the app at once; the store only sees a new build when the shell changes |
| Offline | Everything is inside the app | The service worker (`public/sw.js`) already caches the build |
| Account | Apple Developer Program, $99 a year | Google Play Console, $25 once |
| Tools | Xcode on the Mac | Bubblewrap (JDK and Android SDK), on the Mac or in CI; Android Studio optional |

A Trusted Web Activity is Chrome itself, not a web view, so Android gets WebGPU, Web
MIDI, WebCodecs, wake lock and downloads exactly as the website has them today. A
Capacitor Android app would run in Android's WebView instead, which has no Web MIDI
and whose WebGPU would need its own test; the TWA is less work and does more. iOS
has no equivalent (every iPhone browser is WebKit, and Apple does not take a shell
that just points at a website), so there the build ships inside the app.

`detectTier()` in `src/lib/platform.ts` already has a `native` tier keyed on
`window.__CHROMAGLASS_NATIVE__`; the iPhone shell sets it. The Android app is the
hosted site in Chrome and keeps the `hosted` tier.

**What each store asks for.**

- *Apple.* A bundle ID and App Store Connect record; permission strings for the
  microphone, camera, adding to Photos, and motion if Tilt goes native; a privacy
  policy URL and the App Privacy label (crash reports from `crashLog.ts` as
  Diagnostics, not linked; audio clips to AudD/ACRCloud when song ID is on; lyrics
  lookups to lrclib.net; no tracking); a privacy manifest; export compliance (HTTPS
  only); a 1024 px icon, 6.9" iPhone screenshots, an age rating and a review note.
  The review risk is guideline 4.2, minimum functionality ("a website in a wrapper"),
  which the bundled build, offline play and native mic, camera, motion and Photos
  answer. TestFlight puts it on the owner's phone before review.
- *Google.* Identity verification for the developer account; Digital Asset Links
  (`/.well-known/assetlinks.json` on Firebase Hosting, holding the app's signing
  certificate fingerprint) so Chrome drops its address bar; an Android App Bundle
  signed through Play App Signing, targeting the API level Google currently requires;
  the Data safety form (the same three data flows as Apple's label); a privacy policy
  (required, since the app uses the microphone and camera); the IARC content rating;
  a 512 px icon, a 1024×500 feature graphic and phone screenshots. A personal
  developer account made since late 2023 must run a **closed test with at least 12
  testers opted in for 14 days in a row** before it can publish to everyone; that is
  the longest wait on the Android side and cannot be hurried, so it starts early.
  Play's minimum-functionality and WebView policies are aimed at wrappers of other
  people's sites; our own interactive instrument is not what they catch.

Both listings say the show flashes, and that the flash guard (`src/lib/flashGuard.ts`)
limits it. Free is simplest on both: a price or in-app purchase adds agreements, tax
forms and a 15 % cut.

**Running order.** Steps marked *(owner)* need Steve's phone, card or account.

1. **Smoke test the site on both phones** *(owner)*: chromaglass.web.app in Safari on
   an iOS 26 iPhone and in Chrome on a recent Android phone. Does the plate start,
   hold its frame rate, take fingers, hear the mic? Whatever breaks here is fixed on
   the website first, and both apps inherit the fix. *iPhone: **passed**, the owner
   ran the site in Safari on 2026-09-27 ("iPhone works. I tested it"). Android: not
   yet run.*
2. **Open both accounts** *(owner)*: Apple Developer Program and Play Console, and
   install Xcode. *Not started.*
3. **The Android shell** (one PR): a Bubblewrap project, `assetlinks.json` in
   `public/.well-known/` with a Firebase Hosting header so it serves as JSON, the
   manifest checked for what a TWA needs, and a CI step that builds the bundle.
   The upload key stays with the owner, never in the repo. Then the closed test
   starts, 12 testers for 14 days, while the iPhone work carries on. *Not started.*
4. **The iPhone shell** (one PR): Capacitor's `ios/` project with `webDir: dist`, the
   `native` tier, no service worker on that tier, permission strings, the audio
   session set to play and record through the speaker, the idle timer off while the
   plate runs, status bar and home indicator hidden, minimum iOS 26, and an
   `xcodebuild` step on the macOS runner. *Not started.*
5. **Record and Render save natively on the iPhone** (one PR): the share sheet or
   Photos. The only feature that needs new code to work at all. *Not started.*
6. **A privacy policy page** on Firebase Hosting, and the store listings: text,
   screenshots from the lab and a real phone, icons, the feature graphic. *Not started.*
7. **TestFlight and the closed test** *(owner)*: a full set played on each phone,
   watching heat, battery and audio routing; a by-hand check in `docs/judging.md`.
   *Not started.*
8. **Submit to both stores.** *Not started.*
9. **Later:** a CoreMIDI plugin so controllers work on the iPhone and iPad; the iPad
   and a Mac App Store build from the same Xcode project; Android tablets and
   Chromebooks come with the Play listing.

The phone layout (#173) is what both apps show, so the operating rule that every
feature ships its phone version is what keeps them whole.

## 13. ChromaGlass in popular VJ software

Asked on 2026-09-27: "Integrate into popular VJ software." It came up alongside
"have we reached the point where we need to grow beyond the web?" The answer to that
(project files, `beyond-web/beyond-web.md`) was *not yet for the show itself*.
Handing video to another app was the one place a page cannot go. Nothing is built.

**What integration means here.** A VJ app (Resolume Arena and Avenue, VDMX,
TouchDesigner, MadMapper, Millumin, OBS) meets ChromaGlass in four ways, and each one
takes a different route:

| | What it is | Route | Needs |
|---|---|---|---|
| **Video out** | The plate as a live layer in the VJ app | Syphon on macOS (Resolume, VDMX, MadMapper, Millumin, TouchDesigner, OBS), Spout on Windows (Resolume, TouchDesigner, OBS), NDI across a network (all of them) | A page cannot publish a GPU texture. **Today:** OBS captures the projector window and sends it out through its Syphon or NDI plugin. **Properly:** the wrapper (steps 1–3) |
| **Control in** | The VJ app or its controller plays ChromaGlass | OSC, which the show server already hears on UDP 9000 (`server/remote-server.js`, `oscToMessage`: `/chromaglass/setting/<key>`, `/action/<name>`, `/preset/<id>`, `/blow`, `/drop`, `/press`, `/tilt`, `/dye`) | The web app plus `npm run show`. Written up and templated, not built again |
| **Tempo** | One beat shared by everything | Ableton Link, which Resolume, VDMX and TouchDesigner all speak. MIDI clock already comes in (`src/lib/midi.ts`) | A page cannot join Link. The show server can |
| **Video in** | A VJ app's output as a ChromaGlass source | Syphon, Spout or NDI, arriving as a camera | **Today:** any virtual camera (OBS Virtual Camera, NDI Webcam Input), picked like a camera. **Properly:** the wrapper (step 6) |

**Not doing: a plugin inside the VJ app.** FFGL (Resolume) and ISF (VDMX, MadMapper)
run OpenGL fragment shaders inside the host. The plate is dozens of WebGPU compute
passes a frame, with a pressure solve, which means porting the solver back to GLSL.
That is the native rewrite `beyond-web.md` argues against. Streaming the plate into
the host gives the VJ the same layer without it.

**The wrapper comes first** (Steve, 2026-09-27: "Would a good option be to create a
small native wrapper that allows us to integrate into other VJ apps and have a
complete cached system?" Yes, and he asked for it in the plan). It is one small
native shell that does three jobs:

- **The whole show, cached.** The built site goes inside the app, so it opens and
  plays with no network. That covers a gig with no wifi, which the service worker
  only partly covers (see "Found along the way").
- **The show server, inside it.** OSC, Art-Net and the phone remote without a
  terminal. Electron's main process runs `server/remote-server.js` as it is.
- **A native add-on for the VJ routes.** Syphon, NDI and Spout, out and later in.

It is **Electron**, not Tauri. The show server is already Node. Electron's
Chromium is the WebGPU and Web MIDI that CI's `WebGPU (macOS)` job tests, while
Tauri on a Mac draws in Safari's web view, which has no Web MIDI. And Electron's
offscreen rendering hands over a GPU shared texture, which Syphon and Spout need.
The web app stays the core: every change lands on the site first, and the wrapper
picks it up in its next build. `detectTier()` already reads Electron as the
`native` tier. It is about 150 MB to download, which a show laptop doesn't mind.

**Running order.** Steps marked *(owner)* need Steve's Mac and a VJ app on it.

1. **The wrapper** (one PR): an Electron app for the Mac with the built site inside
   it (offline from the first launch), the show server started with it, the show
   window opened on the projector with no click needed, background throttling off,
   and a macOS build on the CI runner. A check loads the packaged app with the
   network off and sees a lit plate. *Not started.*
2. **Syphon out** (one PR): a native add-on that publishes the plate as a Syphon
   server from Electron's offscreen shared texture, with no readback. Then *(owner)*:
   the plate as a layer in Resolume or VDMX on Steve's Mac, with the delay measured
   against the plate's own frame. *Not started.*
3. **NDI out, then Spout on Windows** (one PR each): the same add-on sends NDI over
   the network, and Spout on a Windows build. *Not started.*
4. **Control, written up** (one PR): the OSC address space documented where a VJ
   finds it (the show server's page and `docs/`), plus a starter Resolume OSC map and
   a TouchDesigner OSC Out example that play presets, actions and settings. Works
   on the website with `npm run show` too. *Not started.*
5. **ChromaGlass talks back and keeps time** (one PR, in the show server): OSC *out*
   for the plate's colour, the sound bands and the beat, the way Art-Net out already
   sends the colour to the lighting (`server/artnet.js`), so a VJ app's effects can
   follow the plate. And Ableton Link in, feeding the beat clock the way MIDI clock
   does. *Not started.*
6. **Video in from a VJ app** (one PR): Syphon and NDI arrive as a Mixer source
   (§11), not through a virtual camera. *Not started.*

Until step 2 lands, the plate still reaches a VJ app the way it can today: OBS
captures the projector window and sends it on through its Syphon or NDI plugin, and a
virtual camera brings video in. The phone rule applies to anything with a control: a
Link or OSC-out switch is reachable from the phone's More sheet.

**Found along the way** (from the same beyond-the-web review, for a gig with no
network):

- `public/sw.js` caches files as they are fetched, and loads the page from the
  network first, so parts of the app nobody opened, and the music shelf, are
  missing offline. Cache the whole build ahead of time, and add a check that loads
  the app with the network off.
- Record keeps the whole take in memory until it stops (`src/hooks/useRecorder.ts`).
  That's fine for a song and risky for a set. In Chrome, write to a file as it
  records (File System Access).
- The popup projector has only been used with one projector. Run two before rig R1
  counts on it.

## 14. The show at the gig: hearing, timing, speed and the picture on the wall

Asked on 2026-09-27: "What else am I missing in plan.md? What other efficiency,
latency, and quality updates would help us". The code was read for it the same day,
four ways at once (what a frame costs, how late the plate answers, what the wall
shows, what stops a set), against this plan, `docs/roadmap.md`,
`docs/stability-plan.md`, `docs/webgpu-plan.md`, `docs/filters-plan.md` and
`docs/rig-plan.md`, so that nothing below is already written somewhere else. Nothing
is built. Each item says what the code does now, with where, whether that is read in
the code or inferred from how a browser behaves, and what would measure a fix. The
order is what a performer or an audience would notice first.

What is already handled and so is not here: the wake lock (re-taken on every return
to the page, and held by the projector window too); the picture when the show window
is covered (the projector window drives the frames); fades, the dimmer and the
gamepad on timers rather than animation frames; MIDI unplugged and plugged back in;
the phone link's reconnect; readbacks that skip rather than wait; splats landing in
the frame they were made; dither before every 8-bit screen; the plate's bicubic
upsample. Display-P3 and HDR are H4 in `docs/roadmap.md`, linear-light blending is
deferred in `docs/webgpu-plan.md`, and the soft edge between projectors is rig R3.

### 14a. The show goes deaf when its window is hidden

**Read in the code.** The sound analysis runs only on the show window's animation
frames (`requestAnimationFrame(update)`, `src/hooks/useAudioAnalyzer.ts`), and it is
the only place the analyser is read. The app already knows the show window spends a
set hidden behind the projector's (the comment over the look fade's timer in
`App.tsx`), which is why the picture, the fades and the gamepad were all moved off
animation frames. The analysis was not. So the moment the performer goes fullscreen
on the projector, or switches to Ableton, the wall keeps moving on the last reading
it had, which may be the top of a kick, and stops hearing the music. This is the one
item here that can quietly ruin a whole set.

**Shipped** (asked "Do #1 now", 2026-09-27). `lib/earClock.ts` decides who reads:
the window's own frames always, as before; the projector's frame ask
(`__chromaglassFrame` calls `wallAsked`) only while those frames have stopped for
50 ms, so the plate hears once per frame the wall draws; and a worker's 16 ms tick
only while neither is coming (covered with no wall, which is still a show on a
network display or the phone). Taking the frames first keeps one reading per drawn
frame, which matters because the level smoothing is per reading. A watchdog on its
own timer calls the ear deaf when the audio context is not running or nothing has
been read for half a second; the desk's sound line then starts "not hearing" and the
phone's Sound dot turns amber with a line in its sheet. A suspended context is asked
back on its `statechange` and on the next touch or key (Chrome starts one suspended
on a page nobody has touched; iOS interrupts one for a call). Whether a finger's
lift wakes it on the iPhone is not yet tried. The wall and the tick read 50 ms after the
frames stop while the page says it is hidden (Chrome says so of a covered window),
and only after a quarter second while it says it is visible, so a visible window at
15 fps, 240 Hz or with ragged frames reads exactly its frames, as before. (A stall
measured from the frames alone went red on the Mac runner's first run: its busy app
drew 28 frames a second, and the tick read between them. The same went red on its
second run behind the wall: covered, the wall drew 44 a second and the tick read 5
times in its gaps. The tick now gives the wall's asks a quarter second whether the
page is hidden or not, so it takes over a quarter second after the wall closes. On
its third run a visible page read 3 ticks against 46 frames: the Mac's show is still
building pipelines behind it for its first half minute, and its frames stalled past a
quarter second, which is what the tick is for; the check now holds each tick or ask a
visible page reads against the page's last frame before it (more than 250 ms), which
a broken build with a long task or a slow uncover cannot pass. Queued ticks after a
long task read once, not once each.)

`npm run ears` (26 checks, no GPU needed; on the Mac's `open` shard) measures it. A
headless window is never hidden, so it withholds the show's animation frames itself.
Covered, with the wall asking: 38 distinct levels in two seconds, one reading per
frame asked for (120 over 121); with no wall, 38 on the tick; the control on the
same page (frames withheld, no ask, the tick stopped, the ear as it was before)
holds **one** level and is called deaf. A build whose ear reads on frames alone went
red on all three "keeps hearing" lines. Visible with the wall asking, only the frames
read (122 frame, 0 ask).

*Still owed:* the owner's look on the Mac, covering the show window with another app
for thirty seconds and reading `chromaglassCastState().ear.reads` before and after
(about sixty ticks a second with no wall, and the desk not saying "not hearing").
The worker's tick is chosen because a hidden page's own timers are held to about one
a second; that is Chrome's documented behaviour and cannot be shown headless.

*Found along the way, not done:* the look fade, the dimmer, the drift glides and the
simulated band run on the page's own timers (`showInterval`, `simulatedMusic.ts`),
moved there so a covered window would not freeze them. A hidden page's timers are
held to about one a second (much less after five minutes hidden), so a Go fired from
a MIDI pad while the show window is covered steps through its crossfade a second at a
time instead of gliding. The same worker tick could drive them.

### 14b. With the wall up, the plate may draw twice a refresh and the governor cannot see it

**Read in the code; the doubling is inferred.** The projector window asks the show
for a frame on every one of its own refreshes (`CastDisplay.tsx`). The guard in
`__chromaglassFrame` (`LiquidVisualizer.tsx`) only compares against the projector's
previous ask (`lastExternalFrame`); the show's own frames never set it. With the desk
visible on the laptop and the wall fullscreen on the projector, both windows get
animation frames on different displays' clocks, and each ask cancels the show's
pending frame and draws another. Every draw carries the readback and the mirror copy.
The governor is fed the interleaved intervals, so two half-rate clocks look like one
full-rate one and it never steps down while the wall is up.

*Fix:* stamp the time of every draw, whichever window asked for it, and skip any ask
within about 0.6 of a refresh of the last draw; feed the governor the interval
between real draws. *Measure:* extend `npm run wall` with the mirror popup and both
windows animating: frames drawn a second no more than about 1.1 times one display's
refresh.

### 14c. The projector's resolution comes from the laptop's pixel ratio

**Read in the code.** `qualityLadder` builds its rungs from `devicePixels()`, the
laptop's ratio, and with a stage attached `canvasPixelsFor` scales the stage by
`dpr / devicePx`. Two ways this goes wrong on a wall:

- *A Retina laptop:* the show opens on the `dpr: 1` rung, so a 1920×1080 projector
  starts at **960×540** (`npm run rungs` asserts exactly this half), and the 1024²
  rung, written for projectors, is gated on `dpr <= 1` and never offered. At 150 %
  Windows scaling it is 1280×720, stretched by 1.5. The mirror then scales with
  `drawImage` and `imageSmoothingQuality` is never set, so it stays at `'low'`.
- *A 1x laptop on a 4K projector:* `frac` is 1 on every rung, so every rung draws the
  full 3840×2160, and the governor has only the grid to give up while the plate's
  shading, which is bound by pixels, stays where it was.

*Fix:* when a stage is attached, build the pixel rungs from the stage (1.0, 0.75,
0.5 of it) rather than from the laptop, offer 1024² by the stage's ratio, and set the
mirror's smoothing to `'high'`. *Measure:* two new cases in `npm run rungs` (it runs
anywhere): a Retina laptop with a 1080p stage starts at the stage's own pixels and
offers 1024²; a 1x laptop with a 4K stage has a bottom rung with fewer pixels than its
top. Then `npm run ladder` on the Mac with a stage.

**Shipped** (2026-09-27). With a stage attached the ladder is the stage's
(`stageLadder`, `lib/platform.ts`): a rung's `dpr` is its share of the projector's own
width and height, and the laptop's ratio is not read. The show opens at the grid its
GPU class opens on at every pixel the projector has; above that the grids climb at
full pixels; at it the pixel rungs come first (0.75, then 0.5 of the stage), then the
smaller grids at half. `canvasPixelsFor` draws a stage at the rung's share and no
longer takes the laptop's ratio, so a fixed grid (the governor off), which asks for 1,
now fills a Retina laptop's projector too. The governor is built again when a wall
comes or goes, and only when the rungs differ; when the rung it is on is still among
them (a wall window crossing 1920×1200 gains or loses only 1024²) it stays on it. After
the GPU runs out of memory on a wall, the ladder is built again under the grid that
failed and opens at the whole stage, where stepping down would have walked its pixel
rungs to half the stage for good (`npm run rungs`: out of memory at 512², now 384² at
1920×1080, walked down 384² at 960×540). The wall window scales with
`imageSmoothingQuality` 'high', set after every resize because a canvas's new width
resets it. With no stage the ladder is exactly what it was.

1024² is offered by the stage's *pixels*, not its ratio: at most 1920×1200. The gate
was measured as a pixel count (1024² held at 1.0 Mpx and fell to 22 fps at 4.1 Mpx,
with the same step cost), and a projector's ratio stands for its pixels badly: a 4K
projector at 1x has 8.3 Mpx, and a 1080p one behind 150 % scaling has a ratio of 1.5
and the same 2.1 Mpx as at 100 %.

`npm run rungs`, 73 of 73 (the old code, bridged to the new `canvasPixelsFor` signature,
fails every new stage case). Two stage ladders are written out rung by rung, and the
1024² gate is held at 1920×1200 (offered) and 2560×1440 (not). The Mac's
`webgpu-smoke` asks the running show which ladder it is on (a rung at 0.75 of the wall
while it is up, none once it closes) and reads the wall's smoothing across a resize that
changes the canvas. A Retina laptop (2x) on a 1080p
wall opened at **960×540** (1280×720 at 1.5x), now at **1920×1080**, on the hosted page
and locally, for every GPU class. 1024² was not offered (grids 768, 512, 512, 384, 256),
now at 1920×1080. A 1x laptop on a 4K wall had **8.29 Mpx** on its top rung and its
bottom one; now 8.29 at the top (768²) and **2.07** at the bottom (256² at 1920×1080),
and it is no longer offered 1024² at 8.3 Mpx. The canvas sizes a 1080p or 4K wall gets
were five different ladders from a 1x, 1.25x, 1.5x, 2x and 3x laptop; now one. The old
assertion that a rung of 1 drew a Retina laptop's wall at 960 of 1920 was this bug
written down, and is replaced by what a share draws (1920×1080 at 1, 960×540 at 0.5).
Eighteen no-stage ladders, printed before the change for every tier at 1x to 3x
(phones included), are a fixture the new ladder matches rung for rung and start for
start. The mirror's smoothing, read by hand from a wall window opened by the built app
in a cloud session: 'low' when it opened and 'low' after a resize before, 'high' and
'high' after; `npm run webgpu` asks the same on the Mac.

*The phone:* no phone version, because a phone has no stage. The wall that follows a
stage's pixels is the wall window (`StageMirror`), a second window on the same machine
mirroring the show's canvas; the phone's own controls have no wall button, and a phone
on a wall goes there through the phone's screen mirroring (AirPlay, Android's cast
screen), which the page cannot see and which shows the phone's own pixels, or through
a Chromecast, whose receiver runs its own show at its own pixels with no stage. The
phone keeps the no-stage ladder, which the fixture holds (its 2.625x and 3x lines).

*Still owed, on the Mac:* whether 1024² holds on a 1080p wall. 2.07 Mpx sits between
what was measured to hold (1.0) and to fail (4.1), so what `npm run ladder` with a
stage should show is the canvas at 1920×1080 on the top three rungs, 1440×810 and
960×540 below them, whatever the laptop's ratio, and 1024² at 1920×1080 at or near 30
fps at thirty steps. If it does not hold, the gate comes down to what does. And the
owner's look at a 0.75 rung on a real projector through the 'high' mirror.

*Found along the way, not done:*
- `npm run ladder` cannot attach a stage. It opens one page, and a wall window opened
  from it would share that page's device scale factor, so a Retina laptop driving a
  1x projector cannot be staged in one browser context. A `?stage=1920x1080`
  diagnostic knob, like `?dpr=`, calling `setStage` would let it measure the wall.
- A 4K wall opens at 512² on all 8.3 Mpx, as it did from a 1x laptop before. The start
  rule weighs the GPU class and not the stage's pixels; the governor finds the 0.75
  rung within seconds, but a wall above 1920×1200 could open there.
- The readout says "512² · 1.0x" on a wall too, where 1.0 is now a share of the wall
  rather than a pixel ratio, and the bench's `dpr` reads the same number. On a stage it
  should say so ("of the wall").
- A wall coming or going builds a new governor, which forgets a step rate it had given
  up and waits out its settling period again, and forgets rungs a solver that would not
  start had marked failed (only running out of memory sets the cap it keeps).
- `PW_WEBGPU=1 npm run phone` went red once in two runs on "spreading them zooms in by
  as much as they spread" (3.00 times of 3.40): the zoom was read before the pinch's
  last move landed, on a software plate a few frames a second. Green on the rerun; the
  phone's code was not touched here.

### 14d. The beat clock hears a smoothed bass level, not the kick

**Read in the code.** The frame loop feeds `BeatClock.update` with
`currentAudioData.bass / 70` and the clock calls an onset when that crosses 0.45
(`beatClock.ts`). That level has been smoothed twice (the analyser's time constant,
then `LEVEL_SMOOTHING.bass`), so where the crossing lands moves by roughly 30–55 ms
with how loud the kick is (worked from the constants), while the flux onset that
`audioFeatures.ts` already computes for the kick goes unused here. `hear()` then snaps
the phase fully to each onset, so that jitter goes straight into the next predicted
beat. At the shipped trust of 0.7 the clock needs about seven kicks to lock, some
three seconds at 120 bpm. `npm run learn` feeds the clock the flux kick at trust 1,
so its "ahead of the microphone" figure (§5) describes a path the live show does not
take.

*Fix:* feed the clock the kick onset and its time, and pull the phase toward each
onset by a gain (about 0.3) rather than snapping it. *Measure:* a `learn` case that
drives the clock the way the live loop does (smoothed bass, trust 0.7) and prints
kicks to lock and the spread of the lead.

### 14e. The picture and the room disagree about when the kick is

**Read in the code; the output delays are inferred.**

- *The app's own songs* are analysed from `captureStream()`, before the output
  device, and nothing reads `outputLatency`, `baseLatency` or `getOutputTimestamp`.
  On wired output that roughly cancels the analysis delay; on Bluetooth or AirPlay
  (150–300 ms) the plate leads the room by that much, and a locked kick adds Beat
  Lead on top. For a shelf song the precomputed `SongEar` (`songTrack.ts`, used today
  only by Render) could be read at `currentTime − outputLatency`, with no analysis
  delay at all.
- *One Beat Lead for every tempo source.* `beatLead` is described as the
  microphone's latency, but the clock applies it the same to MIDI clock and a tapped
  tempo, which have almost none. Switching from the mic to the desk's clock moves
  every kick by the mic's delay. Split it into the rig's display lag and a measured
  microphone delay, calibrated by tapping along or by a click played out and heard
  back.
- *MIDI clock* is timed with `performance.now()` in the handler (`useMidi.ts`)
  rather than the message's own `timeStamp`, so a slow frame delays the beat; and
  without a Start message, or after a 400 ms dropout, the pulse count starts on
  whichever pulse came first, up to half a beat off. Use `timeStamp`, and let an
  audio onset or a tap set the phase when no Start has come.

*Measure:* `outputLatency` in `chromaglassDebug()`; a unit test with jittered MIDI
timestamps next to `npm run timecode`; a speaker-to-microphone click on the Mac next
to `film`.

### 14f. Sound and MIDI reach the plate a frame late, through a whole-app render

**Read in the code.** Every frame the analyser calls `setAudioData` with two new
arrays (`useAudioAnalyzer.ts`), which re-renders the whole ~4,400-line `App`; only
then does an effect copy it into `audioDataRef`, after this frame's loop has run, so
the plate reads the sound one frame late. A MIDI CC goes through an animation frame,
`setSettings` and an effect the same way (`rideSetting`, `App.tsx`). `App.tsx` already
avoids exactly this elsewhere ("a re-render of the whole shell sixty times a
second"). On a weaker laptop that is dropped frames and garbage-collection hitches on
top of the solver.

Measured since, by `npm run ears` on the Mac runner (2026-09-27): with the show
window covered and nothing else drawing, the ear's 16 ms tick read 15 times a
second, not 60 (inferred: each reading re-renders `App`, and the main thread could
not take more); the visible app drew 28 frames a second in the same run.

*Fix:* the frame loop reads the analyser and the ride's shadow itself; React keeps
the meters, at about ten updates a second, with the arrays reused. *Measure:* count
`App` renders a second under `?debug` in `npm run desk` with a stream running (12 or
fewer), and stamp the reading's time against the frame's.

### 14g. A knocked cable: the audio interface and the projector do not come back

**Read in the code; what macOS does with the window is inferred.**

- *Audio.* When the input track ends, the handler sets the source to none
  (`track.onended`, `App.tsx`), and `devicechange` only refreshes the list of inputs.
  Plug the interface back in and the plate still plays deaf until someone opens
  Settings; the only sign is "silent" in the desk's audio line. Remember the intended
  input, reopen it when `devicechange` says it is back, and show a loud "input lost"
  on the desk and the phone.
- *Projector.* Automatic sending is skipped while a cast is open (`useProjector.ts`),
  the "send there" chip is hidden while casting, and `openWindow` only focuses a live
  window. Pull the HDMI and push it back, and the projector window has been moved to
  the laptop and out of fullscreen, and the wall shows an empty desktop. On
  `screenschange` while casting, move the window back to the projector; the existing
  next-click refill restores fullscreen.

*Measure:* `npm run shelf` or `npm run music` with a fake stream whose track stops
and comes back; a stubbed `getScreenDetails` with a fake `screenschange` in
`npm run panel`.

### 14h. No internet at the venue

**Read in the code.**

- The service worker saves nothing ahead of time (`install` only calls
  `skipWaiting()`, `public/sw.js`); a built file is cached only once it has been
  fetched. So after a deploy, the projector window's code and the song-map worker may
  not be there offline.
- A failed chunk matches `Failed to fetch` on the error screen, whose `startOver()`
  unregisters every service worker and deletes every cache (`src/main.tsx`): offline,
  that turns one missing file into a site that cannot be reloaded at all.
- The fonts come from Google (`src/index.css`), which the worker does not handle.
- Song ID and lyrics fetch with no timeout (`fingerprint.ts`, `lyrics.ts`), and one
  busy flag gates the local fingerprint match, the song-end detector and the remote
  ID together (`useMusicIntelligence.ts`), so a request that hangs on venue Wi-Fi
  stops songs the local library knows from being recognised.

*Fix:* precache every built file on install; never `startOver()` while
`!navigator.onLine`; serve the fonts from the site; `AbortSignal.timeout(8000)` on
both requests and a busy flag of the local matcher's own. *Measure:* extend
`npm run sw` (load, go offline, open `?cast=true`, reload: the app still draws) and
`npm run music` with a stub that never answers.

### 14i. What the wall shows: clipping, banding and the flash guard

**Read in the code; how visible each is is inferred until the lab renders it.**

- *The projector's gain and gamma work on an 8-bit picture.* The output pass's scene
  is the canvas's format (`output.ts`), and the frame is already dithered to 8 bits
  when `pow(col * gain, gamma)` runs (`wgsl/output.ts`). At gamma 0.5 code 1 becomes
  code 16: dark fades jump off black and the dither grows into speckle. Gain above 1
  clips each channel on its own, so saturated colours change hue (orange at 2.2
  turns yellow). Draw the scene in `rgba16float`, dither once in the output pass, and
  roll off with a shoulder that keeps the hue.
- *The camera caps white at about two thirds of the lamp.* With the camera on, the
  plate draws into the camera's scene in the canvas's 8-bit format (`camera.ts`), so
  the light above 1 the plate leaves unclamped for it is clipped anyway, and
  `aces(col * 1.12)` then peaks at 0.83. Oil on Water, Colorful Cosmos and Sunny Side
  Up use it. `rgba16float` for that scene, and/or an ACES scaled so 1 stays 1.
- *The dye reaches the plate in 8 bits and is then magnified.* `packDye` stores
  `sqrt(d/8)` in `rgba8unorm` (`wgsl/pack.ts`), and each texel covers 5.6 screen pixels
  at 512² on 1080p and 11 at 4K, with the closeup multiplying thin-dye contrast about
  ten times. Bicubic smooths between texels but cannot put the lost levels back, so
  slow gradients can terrace. `docs/webgpu-plan.md` calls it "probably gone"; nothing
  measures it. Sample the float fields or pack to `rgba16float`.
- *The flash guard reads screen values, not light.* `luma()` in `wgsl/probe.ts`
  weights the canvas's encoded values, while the guard's thresholds are relative
  luminance, which is defined on linear light. A strobe between 0.85 and 0.95 reads as
  0.08, under the 0.10 flash step, though in light it is 0.16, so bright strobes go
  uncounted; a kick from black to 0.3 reads 0.3 but is 0.07, so dark shows are dimmed
  for nothing. This is a safety item: decode to linear before the weights.
- *Keystone and corner pins* resample the whole frame bilinearly at the same size
  (`output.ts`), which softens by up to half a pixel and turns pixel-scale grain into
  a fixed pattern. Catmull-Rom (the plate's `textureBicubic`) and the grain after the
  warp.

*Measure:* lab ramps through the output pass at gain 2.2 and gamma 0.6 (largest step
between neighbouring codes, hue drift on colour patches); a flat white plate through
the camera (at least 0.97); a radial dye ramp flat and in the closeup (distinct levels,
widest flat run); flat 0.85/0.95 and 0/0.3 frames through the probe and into
`npm run wall`'s traces; a one-pixel grating through a 5 % keystone.

### 14j. Heat, battery and frames nobody sees

**Read in the code; the thermal behaviour is inferred.**

- *No frame-rate cap.* The loop draws on every animation frame and the readback runs
  in each, so a 120 Hz ProMotion MacBook, a 90/120 Hz Android phone or a 144 Hz
  laptop pays for 120–144 draws a second of a liquid that steps at 60 or 30. Cap the
  draw rate at 60, or twice the step rate when the governor has halved it.
- *A readback every frame, even frozen.* `syncFromGpu()` runs for every layer each
  frame whatever the solver did; with the plate frozen the solver stops but the draw
  and the readback go on at the display's rate. Read back only on a frame that stepped
  or wrote deltas.
- *The governor knows nothing of heat.* It climbs whenever frames are fast and
  retries a failed rung every 90 s, forever (`governor.ts`), so a laptop or phone that
  is warming up climbs, drops frames for a second and a half, steps down, and does it
  again every minute and a half. Every Apple GPU classes as `strong` (`device.ts`), so
  an iPhone opens at 512² and climbs; the phone layout does not touch the ladder; and
  the adapter is always asked for `high-performance`, which wakes the discrete GPU on
  dual-GPU laptops. Double the wait each time the same rung fails, cap a phone's climb
  at its starting rung, and consider a "cool / battery" output setting (low-power
  adapter, 30 steps, a capped top rung) that ships with its phone control.
- *The gamepad* is polled every 16 ms with no pad connected (`useGamepad.ts`); start
  the timer on `gamepadconnected`.

*Measure:* Chromium with `--disable-frame-rate-limit`, draws a second at 65 or fewer
while steps hold; frozen, readbacks a second near 0; `npm run rungs` with a simulated
machine whose capacity sinks, rung changes in ten minutes bounded.

### 14k. Smaller, for the same pass

- *The tablet remote* holds a slider for 50 ms on the tablet and another 50 ms on the
  display, both trailing (`RemoteControl.tsx`, `App.tsx`), then steps the value with
  no easing: at least 100 ms before anything moves. The pad throttles on the leading
  edge with no trailing send, so the end of a flick is dropped. Send the first change
  at once, keep one trailing send, and ease on the display. The cast's audio goes out
  at 30 Hz with no onsets or beat phase, so a network display locks its own kicks.
- *The mouse and fingers on the main canvas* use `mousemove` and `touchmove`, keeping
  the last position, so each frame gets one straight chord and a fast circle is
  flattened. `pointermove` with `getCoalescedEvents` for the path and
  `getPredictedEvents` for the tip (`npm run phone`, and `tools` on the Mac).
- *A check before the show.* Sound moving, projector found and fullscreen, screen
  kept awake, the cache complete, MIDI present, the GPU's rung: every signal exists,
  nothing gathers them. A panel on the desk, and its phone version, with a `panel`
  check.
- *A deploy mid-show can mix versions:* a projector window opened after a deploy runs
  the new build against the old show, and the cast hello carries no build version
  (`castProtocol.ts`). Inferred; send the version and warn on a mismatch.
